'use client'

import { useState, useEffect, use, useRef } from 'react'
import Link from 'next/link'
import { AGENT_META, AGENT_KEYS, AgentKey } from '@/lib/agents'

type Tab = 'mind' | 'chat' | 'train' | 'prompt' | 'memory'

type Thought = {
  id: string
  type: 'thought' | 'opinion' | 'question' | 'observation' | 'feeling' | 'reaction'
  content: string
  context?: string
  created_at: string
}

const TYPE_STYLE: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  thought:     { label: 'Thinking',    bg: 'bg-black/[0.04]',        text: 'text-[#1c1c1e]',  dot: 'bg-[#c7c7cc]' },
  opinion:     { label: 'Opinion',     bg: 'bg-[#EF22DA]/[0.07]',        text: 'text-[#EF22DA]',  dot: 'bg-[#EF22DA]' },
  question:    { label: 'Question',    bg: 'bg-[#EF22DA]/10',     text: 'text-[#1c1c1e]',  dot: 'bg-[#EF22DA]' },
  observation: { label: 'Observation', bg: 'bg-white',            text: 'text-[#6c6c70]',     dot: 'bg-[#c7c7cc]' },
  feeling:     { label: 'Feeling',     bg: 'bg-[#EF22DA]/[0.07]',        text: 'text-[#EF22DA]',  dot: 'bg-[#EF22DA]' },
  reaction:    { label: 'Reaction',    bg: 'bg-[#EF22DA]/15',     text: 'text-[#1c1c1e]',  dot: 'bg-[#EF22DA]' },
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default function AgentPage({ params }: { params: Promise<{ agent: string }> }) {
  const { agent: agentKey } = use(params)
  const meta = AGENT_META[agentKey as AgentKey]

  const [tab, setTab] = useState<Tab>('mind')
  const [thoughts, setThoughts] = useState<Thought[]>([])
  const [prompt, setPrompt] = useState('')
  const [memory, setMemory] = useState('')
  const [promptSaved, setPromptSaved] = useState(false)
  const [memorySaved, setMemorySaved] = useState(false)

  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
  const [chatLoading, setChatLoading] = useState(false)
  const chatBottomRef = useRef<HTMLDivElement>(null)

  const [dropUrl, setDropUrl] = useState('')
  const [dropNote, setDropNote] = useState('')
  const [dropping, setDropping] = useState(false)
  const [dropReaction, setDropReaction] = useState('')

  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [videoDragging, setVideoDragging] = useState(false)
  const [videoDropping, setVideoDropping] = useState(false)
  const [videoReaction, setVideoReaction] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!AGENT_KEYS.includes(agentKey as AgentKey)) return
    fetch(`/api/agents/${agentKey}`).then(r => r.json()).then(d => {
      setPrompt(d.prompt || '')
      setMemory(d.memory || '')
    })
    fetch(`/api/agents/${agentKey}/thoughts`).then(r => r.json()).then(setThoughts)
  }, [agentKey])

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function savePrompt() {
    await fetch(`/api/agents/${agentKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    })
    setPromptSaved(true)
    setTimeout(() => setPromptSaved(false), 2000)
  }

  async function saveMemory() {
    await fetch(`/api/agents/${agentKey}/memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memory }),
    })
    setMemorySaved(true)
    setTimeout(() => setMemorySaved(false), 2000)
  }

  async function sendChat() {
    if (!chatInput.trim() || chatLoading) return
    const userMsg = chatInput.trim()
    setChatInput('')
    setMessages(prev => [...prev, { role: 'user', content: userMsg }])
    setChatLoading(true)
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])

    const res = await fetch(`/api/agents/${agentKey}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: userMsg, history: messages }),
    })

    if (!res.body) { setChatLoading(false); return }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      setMessages(prev => {
        const last = prev[prev.length - 1]
        return [...prev.slice(0, -1), { ...last, content: last.content + chunk }]
      })
    }

    setChatLoading(false)
  }

  async function dropContent() {
    if (!dropUrl.trim() && !dropNote.trim()) return
    setDropping(true)
    setDropReaction('')
    const res = await fetch(`/api/agents/${agentKey}/drop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: dropUrl.trim() || undefined, note: dropNote.trim() || undefined }),
    })
    const data = await res.json()
    setDropReaction(data.reaction || '')
    if (data.thoughts?.length) {
      setThoughts(prev => [...data.thoughts.map((t: Thought) => ({ ...t, created_at: new Date().toISOString() })), ...prev])
    }
    setDropUrl('')
    setDropNote('')
    setDropping(false)
  }

  if (!AGENT_KEYS.includes(agentKey as AgentKey)) {
    return <div className="p-8 text-[#6c6c70]">Agent not found.</div>
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'mind', label: 'Mind' },
    { key: 'chat', label: 'Chat' },
    { key: 'train', label: 'Culture Drop' },
    { key: 'prompt', label: 'Prompt' },
    { key: 'memory', label: 'Memory' },
  ]

  const isStreaming = chatLoading && messages[messages.length - 1]?.role === 'assistant' && messages[messages.length - 1]?.content !== ''

  return (
    <div className="flex flex-col h-full bg-transparent">
      {/* Header */}
      <div className="px-6 pt-6 pb-0 border-b border-black/[0.08] bg-transparent">
        <Link href="/agents" className="font-mono text-xs uppercase tracking-widest text-[#6c6c70] hover:text-[#1c1c1e] flex items-center gap-1.5 mb-4 w-fit">
          ← Agents
        </Link>
        <div className="flex items-center gap-3 mb-5">
          <span className="text-3xl">{meta.emoji}</span>
          <div>
            <h1 className="text-xl font-semibold text-[#1c1c1e]">{meta.name}</h1>
            <div className="text-sm text-[#6c6c70]">{meta.role}</div>
          </div>
        </div>
        <div className="flex gap-0">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-[#EF22DA] text-[#1c1c1e]'
                  : 'border-transparent text-[#6c6c70] hover:text-[#6c6c70]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">

        {/* MIND TAB */}
        {tab === 'mind' && (
          <div className="max-w-2xl">
            <p className="text-[#6c6c70] text-sm mb-6">
              {meta.name}&apos;s inner world — thoughts, opinions, feelings logged as they form.
            </p>
            {thoughts.length === 0 && (
              <div className="text-[#8e8e93] text-sm py-12 text-center bg-white border border-black/[0.08] rounded-2xl">
                {meta.name}&apos;s mind is quiet. Start a conversation to get things going.
              </div>
            )}
            <div className="flex flex-col gap-2">
              {thoughts.map((t, i) => {
                const style = TYPE_STYLE[t.type] ?? TYPE_STYLE.thought
                return (
                  <div key={t.id} className={`p-4 rounded-xl border border-black/[0.08] ${style.bg} animate-fade-up`} style={{ animationDelay: `${i * 20}ms` }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                        <span className={`text-xs font-semibold uppercase tracking-wider font-mono ${style.text} opacity-60`}>
                          {style.label}
                        </span>
                      </div>
                      <span className="text-xs text-[#8e8e93]">{timeAgo(t.created_at)}</span>
                    </div>
                    <p className={`text-sm leading-relaxed ${style.text}`}>{t.content}</p>
                    {t.context && (
                      <p className="text-xs text-[#8e8e93] mt-2">{t.context}</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* CHAT TAB */}
        {tab === 'chat' && (
          <div className="max-w-2xl flex flex-col" style={{ height: 'calc(100vh - 230px)' }}>
            <div className="flex-1 overflow-y-auto flex flex-col gap-3 pb-4">
              {messages.length === 0 && (
                <div className="text-[#8e8e93] text-sm pt-4">Talk to {meta.name}. Be real.</div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`flex animate-fade-up ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-lg px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-black/[0.04] text-[#1c1c1e] rounded-br-sm'
                      : 'bg-white border border-black/[0.08] text-[#1c1c1e] rounded-bl-sm'
                  } ${m.role === 'assistant' && chatLoading && i === messages.length - 1 && m.content === '' ? 'typing-cursor' : ''}`}>
                    {m.content || (m.role === 'assistant' && chatLoading && i === messages.length - 1 ? '' : m.content)}
                    {m.role === 'assistant' && isStreaming && i === messages.length - 1 && (
                      <span className="typing-cursor" />
                    )}
                  </div>
                </div>
              ))}
              {chatLoading && messages[messages.length - 1]?.role === 'assistant' && messages[messages.length - 1]?.content === '' && (
                <div className="flex justify-start">
                  <div className="px-4 py-3 bg-white border border-black/[0.08] rounded-2xl rounded-bl-sm">
                    <div className="flex gap-1 items-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#EF22DA] animate-pulse" />
                      <div className="w-1.5 h-1.5 rounded-full bg-[#EF22DA] animate-pulse" style={{ animationDelay: '150ms' }} />
                      <div className="w-1.5 h-1.5 rounded-full bg-[#EF22DA] animate-pulse" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>
            <div className="flex gap-2 shrink-0 pt-3 border-t border-black/[0.08]">
              <textarea
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendChat())}
                placeholder={`Message ${meta.name}...`}
                className="flex-1 bg-white border border-black/[0.08] rounded-xl px-4 py-3 text-sm text-[#1c1c1e] placeholder:text-[#8e8e93] focus:outline-none focus:border-black/20 resize-none"
                rows={2}
              />
              <button
                onClick={sendChat}
                disabled={chatLoading || !chatInput.trim()}
                className="bg-[#EF22DA] text-black text-sm font-semibold px-4 py-3 rounded-xl disabled:opacity-30 hover:opacity-90 self-end"
              >
                Send
              </button>
            </div>
          </div>
        )}

        {/* CULTURE DROP TAB */}
        {tab === 'train' && (
          <div className="max-w-2xl">
            <p className="text-[#6c6c70] text-sm mb-6">
              Drop a URL. {meta.name} will react honestly and log thoughts to their Mind.
            </p>

            <div
              onDragOver={e => { e.preventDefault(); setVideoDragging(true) }}
              onDragLeave={() => setVideoDragging(false)}
              onDrop={e => {
                e.preventDefault()
                setVideoDragging(false)
                const f = e.dataTransfer.files[0]
                if (f && f.type.startsWith('video/')) setVideoFile(f)
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer mb-4 ${
                videoDragging ? 'border-black/20 bg-black/[0.03]' :
                videoFile ? 'border-[#EF22DA]/50 bg-[#EF22DA]/5' :
                'border-black/[0.08] hover:border-black/20'
              }`}
            >
              <input ref={fileInputRef} type="file" accept="video/*" className="hidden"
                onChange={e => e.target.files?.[0] && setVideoFile(e.target.files[0])} />
              {videoFile ? (
                <div>
                  <div className="text-[#EF22DA] text-sm font-medium mb-1">{videoFile.name}</div>
                  <div className="text-[#6c6c70] text-xs">{(videoFile.size / 1024 / 1024).toFixed(1)} MB — click to change</div>
                </div>
              ) : (
                <div>
                  <div className="text-[#6c6c70] text-sm mb-1">Drop a video file or click to browse</div>
                  <div className="text-[#8e8e93] text-xs">MP4, MOV, AVI</div>
                </div>
              )}
            </div>

            {videoFile && (
              <div className="flex flex-col gap-3 mb-4">
                <textarea value={dropNote} onChange={e => setDropNote(e.target.value)}
                  placeholder={`What should ${meta.name} focus on? (optional)`}
                  className="w-full bg-white border border-black/[0.08] rounded-xl px-4 py-3 text-sm text-[#1c1c1e] placeholder:text-[#8e8e93] focus:outline-none focus:border-black/20 resize-none" rows={2} />
                <button
                  onClick={async () => {
                    if (!videoFile) return
                    setVideoDropping(true)
                    setVideoReaction('')
                    const fd = new FormData()
                    fd.append('video', videoFile)
                    if (dropNote.trim()) fd.append('note', dropNote.trim())
                    const res = await fetch(`/api/agents/${agentKey}/video`, { method: 'POST', body: fd })
                    const data = await res.json()
                    setVideoReaction(data.reaction || data.error || '')
                    if (data.thoughts?.length) setThoughts(prev => [...data.thoughts.map((t: Thought) => ({ ...t, created_at: new Date().toISOString() })), ...prev])
                    setVideoFile(null)
                    setDropNote('')
                    setVideoDropping(false)
                  }}
                  disabled={videoDropping}
                  className="bg-[#EF22DA] text-black text-sm font-bold px-5 py-3 rounded-xl disabled:opacity-30 hover:opacity-90"
                >
                  {videoDropping ? 'Watching...' : 'Drop it'}
                </button>
              </div>
            )}

            {videoReaction && (
              <div className="p-5 bg-white border border-black/[0.08] rounded-2xl mb-6 animate-fade-in">
                <p className="font-mono text-xs uppercase tracking-widest text-[#8e8e93] mb-3">{meta.name}&apos;s reaction</p>
                <p className="text-sm text-[#1c1c1e] whitespace-pre-wrap leading-relaxed">{videoReaction}</p>
              </div>
            )}

            <div className="border-t border-black/[0.08] pt-5">
              <p className="font-mono text-xs uppercase tracking-widest text-[#8e8e93] mb-3">Drop a URL</p>
              <div className="flex flex-col gap-3">
                <input value={dropUrl} onChange={e => setDropUrl(e.target.value)}
                  placeholder="TikTok, YouTube, website, campaign link..."
                  className="w-full bg-white border border-black/[0.08] rounded-xl px-4 py-3 text-sm text-[#1c1c1e] placeholder:text-[#8e8e93] focus:outline-none focus:border-black/20" />
                <button onClick={dropContent} disabled={dropping || !dropUrl.trim()}
                  className="bg-black/[0.04] border border-black/[0.08] text-[#1c1c1e] text-sm font-medium px-5 py-3 rounded-xl disabled:opacity-30 hover:border-black/20">
                  {dropping ? `${meta.name} is reacting...` : 'Drop URL'}
                </button>
              </div>
            </div>

            {dropReaction && (
              <div className="p-5 bg-white border border-black/[0.08] rounded-2xl mt-4 animate-fade-in">
                <p className="font-mono text-xs uppercase tracking-widest text-[#8e8e93] mb-3">{meta.name}&apos;s reaction</p>
                <p className="text-sm text-[#1c1c1e] whitespace-pre-wrap leading-relaxed">{dropReaction}</p>
              </div>
            )}
          </div>
        )}

        {/* PROMPT TAB */}
        {tab === 'prompt' && (
          <div className="max-w-2xl">
            <p className="text-[#6c6c70] text-sm mb-4">
              {meta.name}&apos;s core identity. Changes sync to Slack instantly.
            </p>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)}
              className="w-full h-96 bg-white border border-black/[0.08] rounded-2xl p-4 text-sm text-[#1c1c1e] font-mono resize-none focus:outline-none focus:border-black/20" />
            <button onClick={savePrompt}
              className="mt-3 bg-[#EF22DA] text-black text-sm font-semibold px-5 py-2.5 rounded-xl hover:opacity-90">
              {promptSaved ? '✓ Saved' : 'Save Prompt'}
            </button>
          </div>
        )}

        {/* MEMORY TAB */}
        {tab === 'memory' && (
          <div className="max-w-2xl">
            <p className="text-[#6c6c70] text-sm mb-4">
              What {meta.name} knows and remembers. Injected into every conversation.
            </p>
            <textarea value={memory} onChange={e => setMemory(e.target.value)}
              className="w-full h-96 bg-white border border-black/[0.08] rounded-2xl p-4 text-sm text-[#1c1c1e] font-mono resize-none focus:outline-none focus:border-black/20"
              placeholder="Nothing in memory yet. Start training and it builds up here..." />
            <button onClick={saveMemory}
              className="mt-3 bg-[#EF22DA] text-black text-sm font-semibold px-5 py-2.5 rounded-xl hover:opacity-90">
              {memorySaved ? '✓ Saved' : 'Save Memory'}
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
