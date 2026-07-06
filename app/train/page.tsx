'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { AGENT_META, AGENT_KEYS, AgentKey } from '@/lib/agents'

// ─── SHARED TYPES ───────────────────────────────────────────────────────────

type Tab = 'qa' | 'transcript' | 'quick' | 'granola'

// ─── Q&A TAB TYPES ──────────────────────────────────────────────────────────

type Exchange = { agent: AgentKey; question: string; answer: string }
type SessionState =
  | { type: 'idle' }
  | { type: 'agent_thinking'; agent: AgentKey }
  | { type: 'waiting_for_answer'; agent: AgentKey; question: string }
  | { type: 'error'; agent: AgentKey; retryHistory: Exchange[]; retryIndex: number }
  | { type: 'saving' }
  | { type: 'done'; results: { agent: AgentKey; learnings: string }[] }

const TOPICS = [
  { id: 'general', label: 'General', desc: 'Anything and everything' },
  { id: 'creative', label: 'Creative Strategy', desc: 'Taste, formats, what works' },
  { id: 'clients', label: 'Client Work', desc: 'How you run accounts' },
  { id: 'culture', label: 'Culture & Taste', desc: 'What you notice, what excites you' },
  { id: 'thinking', label: 'How I Think', desc: 'Decisions, instincts, process' },
  { id: 'writing', label: 'Writing Voice', desc: 'Scripts, copy, what sounds right' },
]

// ─── TRANSCRIPT TAB TYPES ───────────────────────────────────────────────────

type MemoryType = 'client' | 'contact' | 'decision' | 'creative_insight' | 'taste_note' | 'process_rule' | 'opinion' | 'general'

type ExtractedMemory = {
  type: MemoryType
  content: string
  related_client?: string
  tags?: string[]
  approved: boolean
}

const TYPE_LABELS: Record<MemoryType, string> = {
  client: 'Client',
  contact: 'Contact',
  decision: 'Decision',
  creative_insight: 'Creative Insight',
  taste_note: 'Taste',
  process_rule: 'Rule',
  opinion: 'Opinion',
  general: 'General',
}

const TYPE_COLORS: Record<MemoryType, string> = {
  client: 'text-blue-400/80 border-blue-400/20 bg-blue-400/5',
  contact: 'text-purple-400/80 border-purple-400/20 bg-purple-400/5',
  decision: 'text-yellow-400/80 border-yellow-400/20 bg-yellow-400/5',
  creative_insight: 'text-[#EF22DA]/80 border-[#EF22DA]/20 bg-[#EF22DA]/5',
  taste_note: 'text-orange-400/80 border-orange-400/20 bg-orange-400/5',
  process_rule: 'text-emerald-400/80 border-emerald-400/20 bg-emerald-400/5',
  opinion: 'text-red-400/80 border-red-400/20 bg-red-400/5',
  general: 'text-[#6c6c70] border-white/10 bg-white/[0.03]',
}

const MEMORY_TYPES: MemoryType[] = ['client', 'contact', 'decision', 'creative_insight', 'taste_note', 'process_rule', 'opinion', 'general']

// ─── TRANSCRIPT TAB ─────────────────────────────────────────────────────────

function TranscriptTab() {
  const [transcript, setTranscript] = useState('')
  const [processing, setProcessing] = useState(false)
  const [memories, setMemories] = useState<ExtractedMemory[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  async function process() {
    if (!transcript.trim()) return
    setProcessing(true)
    setError('')
    setMemories(null)
    setSaved(false)

    try {
      const res = await fetch('/api/train/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Processing failed'); return }
      setMemories(data.memories.map((m: ExtractedMemory) => ({ ...m, approved: true })))
    } catch {
      setError('Something went wrong')
    } finally {
      setProcessing(false)
    }
  }

  async function saveApproved() {
    if (!memories) return
    const approved = memories.filter(m => m.approved)
    if (!approved.length) return
    setSaving(true)
    try {
      await fetch('/api/train/save-memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memories: approved, source: 'transcript' }),
      })
      setSaved(true)
      setMemories(null)
      setTranscript('')
    } finally {
      setSaving(false)
    }
  }

  function toggle(i: number) {
    setMemories(prev => prev ? prev.map((m, idx) => idx === i ? { ...m, approved: !m.approved } : m) : prev)
  }

  function edit(i: number, content: string) {
    setMemories(prev => prev ? prev.map((m, idx) => idx === i ? { ...m, content } : m) : prev)
  }

  function changeType(i: number, type: MemoryType) {
    setMemories(prev => prev ? prev.map((m, idx) => idx === i ? { ...m, type } : m) : prev)
  }

  if (saved) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-xl">✓</div>
        <p className="text-[#1c1c1e] font-semibold">Saved to Caspar's memory</p>
        <button onClick={() => setSaved(false)} className="text-xs text-[#8e8e93] hover:text-[#6c6c70] font-mono transition-colors">Process another →</button>
      </div>
    )
  }

  return (
    <div className="flex gap-6 h-full">
      {/* Input side */}
      <div className="flex-1 flex flex-col gap-4">
        <div>
          <label className="font-mono text-[10px] uppercase tracking-widest text-[#8e8e93] block mb-2">
            Transcript / Notes / Voice Memo
          </label>
          <textarea
            value={transcript}
            onChange={e => setTranscript(e.target.value)}
            placeholder="Paste a Granola transcript, voice memo text, meeting notes, or anything you want Caspar to learn from..."
            className="w-full h-64 bg-white border border-black/[0.07] rounded-xl px-4 py-3 text-sm text-[#1c1c1e] placeholder:text-[#8e8e93] focus:outline-none focus:border-black/[0.14] resize-none transition-colors"
          />
          <p className="text-[10px] text-[#8e8e93] font-mono mt-1.5">
            Works with Granola exports, meeting notes, voice transcripts, brain dumps
          </p>
        </div>

        {error && <p className="text-xs text-red-400/70 font-mono">{error}</p>}

        <button
          onClick={process}
          disabled={!transcript.trim() || processing}
          className="bg-[#EF22DA] text-black text-sm font-bold py-3 rounded-xl disabled:opacity-25 hover:opacity-90 active:scale-[0.98] transition-all"
        >
          {processing ? 'Caspar is reading…' : 'Extract Memories →'}
        </button>
      </div>

      {/* Review side */}
      {memories && (
        <div className="flex-1 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] uppercase tracking-widest text-[#8e8e93]">
              {memories.filter(m => m.approved).length} of {memories.length} selected
            </p>
            <div className="flex gap-2">
              <button onClick={() => setMemories(m => m?.map(x => ({ ...x, approved: true })) ?? null)} className="text-[10px] font-mono text-[#8e8e93] hover:text-[#6c6c70]">all</button>
              <button onClick={() => setMemories(m => m?.map(x => ({ ...x, approved: false })) ?? null)} className="text-[10px] font-mono text-[#8e8e93] hover:text-[#6c6c70]">none</button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto flex flex-col gap-2">
            {memories.map((m, i) => (
              <div
                key={i}
                className={`border rounded-xl p-3 transition-all ${m.approved ? 'border-black/[0.08] bg-white' : 'border-white/[0.03] bg-transparent opacity-40'}`}
              >
                <div className="flex items-start gap-2.5">
                  <button
                    onClick={() => toggle(i)}
                    className={`mt-0.5 w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors ${m.approved ? 'bg-[#EF22DA] border-[#EF22DA]' : 'border-black/20'}`}
                  >
                    {m.approved && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3 5.5L6.5 2.5" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <select
                        value={m.type}
                        onChange={e => changeType(i, e.target.value as MemoryType)}
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-full border cursor-pointer bg-transparent ${TYPE_COLORS[m.type]}`}
                      >
                        {MEMORY_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                      </select>
                      {m.related_client && (
                        <span className="text-[10px] font-mono text-[#8e8e93] bg-black/[0.03] px-2 py-0.5 rounded-full">{m.related_client}</span>
                      )}
                    </div>
                    <input
                      value={m.content}
                      onChange={e => edit(i, e.target.value)}
                      className="w-full bg-transparent text-sm text-[#3a3a3c] focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={saveApproved}
            disabled={saving || !memories.some(m => m.approved)}
            className="bg-[#EF22DA] text-black text-sm font-bold py-3 rounded-xl disabled:opacity-25 hover:opacity-90 transition-all"
          >
            {saving ? 'Saving…' : `Save ${memories.filter(m => m.approved).length} to Caspar →`}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── QUICK MEMORY TAB ───────────────────────────────────────────────────────

function QuickMemoryTab() {
  const [content, setContent] = useState('')
  const [type, setType] = useState<MemoryType>('process_rule')
  const [client, setClient] = useState('')
  const [saving, setSaving] = useState(false)
  const [recentSaved, setRecentSaved] = useState<ExtractedMemory[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  async function save() {
    const text = content.trim()
    if (!text) return
    setSaving(true)
    await fetch('/api/train/save-memories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        memories: [{ type, content: text, related_client: client || undefined }],
        source: 'quick',
      }),
    })
    setRecentSaved(prev => [{ type, content: text, related_client: client || undefined, approved: true }, ...prev.slice(0, 9)])
    setContent('')
    setClient('')
    setSaving(false)
    inputRef.current?.focus()
  }

  return (
    <div className="flex gap-6 h-full">
      <div className="flex-1 flex flex-col gap-4">
        <div>
          <label className="font-mono text-[10px] uppercase tracking-widest text-[#8e8e93] block mb-2">Memory</label>
          <input
            ref={inputRef}
            value={content}
            onChange={e => setContent(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && save()}
            placeholder="Never pitch retainers under 3k. Or: Zoe handles Bar None. Or: Lo-fi with direct address outperforms polished..."
            className="w-full bg-white border border-black/[0.07] rounded-xl px-4 py-3 text-sm text-[#1c1c1e] placeholder:text-[#8e8e93] focus:outline-none focus:border-black/[0.14] transition-colors"
          />
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="font-mono text-[10px] uppercase tracking-widest text-[#8e8e93] block mb-2">Type</label>
            <select
              value={type}
              onChange={e => setType(e.target.value as MemoryType)}
              className="w-full bg-white border border-black/[0.07] rounded-xl px-3 py-2.5 text-xs text-[#1c1c1e] focus:outline-none focus:border-black/[0.14] transition-colors"
            >
              {MEMORY_TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="font-mono text-[10px] uppercase tracking-widest text-[#8e8e93] block mb-2">Client (optional)</label>
            <input
              value={client}
              onChange={e => setClient(e.target.value)}
              placeholder="e.g. Tokyo Headspa"
              className="w-full bg-white border border-black/[0.07] rounded-xl px-3 py-2.5 text-xs text-[#1c1c1e] placeholder:text-[#8e8e93] focus:outline-none focus:border-black/[0.14] transition-colors"
            />
          </div>
        </div>

        <button
          onClick={save}
          disabled={!content.trim() || saving}
          className="bg-[#EF22DA] text-black text-sm font-bold py-3 rounded-xl disabled:opacity-25 hover:opacity-90 active:scale-[0.98] transition-all"
        >
          {saving ? 'Saving…' : 'Save to Memory ↵'}
        </button>

        <p className="text-[10px] text-[#8e8e93] font-mono">Press Enter to save quickly</p>
      </div>

      {/* Recent saves */}
      {recentSaved.length > 0 && (
        <div className="w-64 shrink-0">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#8e8e93] mb-3">Just saved</p>
          <div className="flex flex-col gap-2">
            {recentSaved.map((m, i) => (
              <div key={i} className="bg-white border border-black/[0.07] rounded-xl p-3">
                <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${TYPE_COLORS[m.type]} mr-2`}>{TYPE_LABELS[m.type]}</span>
                <p className="text-xs text-[#6c6c70] mt-1.5 leading-relaxed">{m.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Q&A TAB ────────────────────────────────────────────────────────────────

function QATab() {
  const [topic, setTopic] = useState('general')
  const [started, setStarted] = useState(false)
  const [history, setHistory] = useState<Exchange[]>([])
  const [state, setState] = useState<SessionState>({ type: 'idle' })
  const [answer, setAnswer] = useState('')
  const [turnIndex, setTurnIndex] = useState(0)
  const [voiceMode, setVoiceMode] = useState(false)
  const [listening, setListening] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const latestTranscriptRef = useRef('')

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [history, state])
  useEffect(() => { if (state.type === 'waiting_for_answer' && !voiceMode) textareaRef.current?.focus() }, [state, voiceMode])

  const askNext = useCallback(async (currentHistory: Exchange[], index: number) => {
    const agentKey: AgentKey = 'caspar'
    setState({ type: 'agent_thinking', agent: agentKey })
    try {
      const res = await fetch('/api/train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ history: currentHistory, agentKey, topic }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      if (!data.question) throw new Error()
      setState({ type: 'waiting_for_answer', agent: agentKey, question: data.question })
    } catch {
      setState({ type: 'error', agent: agentKey, retryHistory: currentHistory, retryIndex: index })
    }
  }, [topic])

  async function start() {
    setStarted(true)
    setHistory([])
    setTurnIndex(0)
    await askNext([], 0)
  }

  async function submitAnswer(text?: string) {
    const val = (text ?? answer).trim()
    if (!val || state.type !== 'waiting_for_answer') return
    const newExchange: Exchange = { agent: state.agent, question: state.question, answer: val }
    const newHistory = [...history, newExchange]
    setHistory(newHistory)
    setTurnIndex(i => i + 1)
    setAnswer('')
    await askNext(newHistory, turnIndex + 1)
  }

  async function endSession() {
    if (history.length === 0) { setStarted(false); return }
    setState({ type: 'saving' })
    const res = await fetch('/api/train/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ history, topic: TOPICS.find(t => t.id === topic)?.label }),
    })
    const data = await res.json()
    setState({ type: 'done', results: data.results ?? [] })
  }

  function startVoiceAnswer() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    const recognition = new SR()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = 'en-AU'
    latestTranscriptRef.current = ''
    recognition.onstart = () => setListening(true)
    recognition.onresult = (e) => {
      const t = Array.from(e.results).map(r => r[0].transcript).join('')
      setAnswer(t)
      latestTranscriptRef.current = t
    }
    recognition.onend = () => {
      setListening(false)
      if (latestTranscriptRef.current.trim()) submitAnswer(latestTranscriptRef.current.trim())
    }
    recognition.onerror = () => setListening(false)
    recognitionRef.current = recognition
    recognition.start()
  }

  if (!started) {
    return (
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3">
          {TOPICS.map(t => (
            <button
              key={t.id}
              onClick={() => setTopic(t.id)}
              className={`p-4 rounded-xl border-2 text-left transition-all ${topic === t.id ? 'border-[#EF22DA] bg-[#EF22DA]/5' : 'border-black/[0.07] hover:border-black/[0.14]'}`}
            >
              <div className={`text-sm font-semibold mb-0.5 ${topic === t.id ? 'text-[#EF22DA]' : 'text-[#1c1c1e]'}`}>{t.label}</div>
              <div className="text-xs text-[#8e8e93]">{t.desc}</div>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[#8e8e93]">Voice mode</span>
          <button onClick={() => setVoiceMode(!voiceMode)} className={`w-10 rounded-full transition-colors relative ${voiceMode ? 'bg-[#EF22DA]' : 'bg-white/[0.08]'}`} style={{ height: '22px' }}>
            <span className={`absolute top-0.5 w-4 h-4 bg-transparent rounded-full shadow transition-transform ${voiceMode ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>
        <button onClick={start} className="bg-[#EF22DA] text-black font-bold text-sm py-3 rounded-xl hover:opacity-90 transition-opacity">
          Start session →
        </button>
      </div>
    )
  }

  if (state.type === 'done') {
    return (
      <div className="flex flex-col gap-4">
        <p className="font-mono text-[10px] uppercase tracking-widest text-emerald-400/60">Session saved</p>
        <div className="flex flex-col gap-3">
          {state.results.map(({ agent, learnings }) => learnings && (
            <div key={agent} className="bg-white border border-black/[0.07] rounded-xl p-4">
              <p className="text-xs font-mono text-[#EF22DA]/60 mb-2">Caspar learned</p>
              {learnings.split('\n').filter(l => l.trim()).map((line, i) => (
                <p key={i} className="text-sm text-[#3a3a3c] leading-relaxed">{line}</p>
              ))}
            </div>
          ))}
        </div>
        <button onClick={() => { setStarted(false); setState({ type: 'idle' }); setHistory([]) }} className="bg-[#EF22DA] text-black font-bold text-sm py-3 rounded-xl hover:opacity-90">
          New session →
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-[#8e8e93] font-mono">{TOPICS.find(t => t.id === topic)?.label} · {history.length} exchanges</p>
        <button onClick={endSession} disabled={state.type === 'saving' || state.type === 'agent_thinking'} className="text-xs font-mono text-[#6c6c70] hover:text-[#1c1c1e] disabled:opacity-30 transition-colors">
          {state.type === 'saving' ? 'Saving…' : 'End & Save'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col gap-4 mb-4">
        {history.map((ex, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="bg-white border border-black/[0.07] rounded-xl rounded-tl-sm px-4 py-3 text-sm text-[#1c1c1e] leading-relaxed max-w-lg">{ex.question}</div>
            <div className="self-end bg-[#EF22DA]/10 border border-[#EF22DA]/20 text-[#1c1c1e] rounded-xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed max-w-lg">{ex.answer}</div>
          </div>
        ))}
        {state.type === 'agent_thinking' && (
          <div className="bg-white border border-black/[0.07] rounded-xl rounded-tl-sm px-4 py-3 text-sm text-[#8e8e93] italic animate-pulse max-w-lg">thinking…</div>
        )}
        {state.type === 'waiting_for_answer' && (
          <div className="bg-white border border-black/[0.07] rounded-xl rounded-tl-sm px-4 py-3 text-sm text-[#1c1c1e] leading-relaxed max-w-lg">{state.question}</div>
        )}
        <div ref={bottomRef} />
      </div>

      {state.type === 'waiting_for_answer' && (
        <div className="flex gap-2">
          {voiceMode ? (
            <button onClick={listening ? () => recognitionRef.current?.stop() : startVoiceAnswer} className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all ${listening ? 'bg-[#EF22DA] text-black animate-pulse' : 'bg-white text-[#1c1c1e] border border-black/[0.07]'}`}>
              {listening ? 'Listening… tap to send' : 'Tap to speak'}
            </button>
          ) : (
            <>
              <textarea ref={textareaRef} value={answer} onChange={e => setAnswer(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), submitAnswer())} placeholder="Answer honestly… (Enter to send)" className="flex-1 bg-white border border-black/[0.07] rounded-xl px-4 py-3 text-sm text-[#1c1c1e] focus:outline-none focus:border-black/[0.14] resize-none" rows={2} />
              <button onClick={() => submitAnswer()} disabled={!answer.trim()} className="bg-[#EF22DA] text-black text-sm font-bold px-5 rounded-xl disabled:opacity-40 hover:opacity-90 self-end py-3">Send</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── GRANOLA TAB ────────────────────────────────────────────────────────────

type GranolaNote = {
  id: string
  title: string
  created_at?: string
  alreadySynced: boolean
}

type ProposedTask = {
  name: string
  assignee: 'josh' | 'zoe' | 'molly' | 'ellie' | 'ria' | 'lever' | null
  listName: string | null
  notes?: string
}

type SyncResult = {
  id: string
  title: string
  status: 'synced' | 'skipped' | 'error'
  memoriesSaved?: number
  recap?: string
  casparTake?: string
  proposedTasks?: ProposedTask[]
  slackPosted?: boolean
  error?: string
}

function GranolaTab() {
  const [notes, setNotes] = useState<GranolaNote[]>([])
  const [loadingNotes, setLoadingNotes] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [catchingUp, setCatchingUp] = useState(false)
  const [catchupResult, setCatchupResult] = useState<{ processed: number; todosAdded: number; remaining: number } | null>(null)
  const [results, setResults] = useState<SyncResult[]>([])
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  // Tasks confirmation: keyed by meeting ID
  const [pendingTasks, setPendingTasks] = useState<Record<string, ProposedTask[]>>({})
  const [creatingTasks, setCreatingTasks] = useState<Record<string, boolean>>({})
  const [createdTasks, setCreatedTasks] = useState<Record<string, boolean>>({})

  async function catchUpAll() {
    setCatchingUp(true)
    setCatchupResult(null)
    setError('')
    try {
      const res = await fetch('/api/granola/catchup', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Catch-up failed'); return }
      setCatchupResult({ processed: data.processed ?? 0, todosAdded: data.todosAdded ?? 0, remaining: data.remaining ?? 0 })
      loadNotes()
    } catch {
      setError('Catch-up failed')
    } finally {
      setCatchingUp(false)
    }
  }

  async function loadNotes() {
    setLoadingNotes(true)
    setError('')
    try {
      const res = await fetch('/api/granola/sync')
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to connect to Granola'); return }
      setNotes(data.notes ?? [])
    } catch {
      setError('Could not reach Granola API')
    } finally {
      setLoadingNotes(false)
    }
  }

  async function syncAll() {
    setSyncing(true)
    setResults([])
    setPendingTasks({})
    setCreatedTasks({})
    setError('')
    try {
      const res = await fetch('/api/granola/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Sync failed'); return }
      const syncResults: SyncResult[] = data.results ?? []
      setResults(syncResults)
      // Pre-populate pending tasks for each synced meeting
      const taskMap: Record<string, ProposedTask[]> = {}
      for (const r of syncResults) {
        if (r.proposedTasks?.length) taskMap[r.id] = r.proposedTasks
      }
      setPendingTasks(taskMap)
      // Expand the first synced result automatically
      const first = syncResults.find(r => r.status === 'synced')
      if (first) setExpanded(first.id)
      loadNotes()
    } catch {
      setError('Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  async function createTasks(meetingId: string) {
    const tasks = pendingTasks[meetingId]
    if (!tasks?.length) return
    setCreatingTasks(prev => ({ ...prev, [meetingId]: true }))
    try {
      await fetch('/api/clickup/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks }),
      })
      setCreatedTasks(prev => ({ ...prev, [meetingId]: true }))
      setPendingTasks(prev => ({ ...prev, [meetingId]: [] }))
    } finally {
      setCreatingTasks(prev => ({ ...prev, [meetingId]: false }))
    }
  }

  function toggleTask(meetingId: string, index: number) {
    setPendingTasks(prev => {
      const tasks = [...(prev[meetingId] ?? [])]
      tasks.splice(index, 1)
      return { ...prev, [meetingId]: tasks }
    })
  }

  useEffect(() => {
    // On load: fetch notes, then auto-sync any new unsynced meetings
    async function init() {
      setLoadingNotes(true)
      setError('')
      try {
        const res = await fetch('/api/granola/sync')
        const data = await res.json()
        if (!res.ok) { setError(data.error || 'Failed to connect to Granola'); return }
        const fetched = data.notes ?? []
        setNotes(fetched)
        // Auto-trigger full sync if there are new unsynced meetings
        const hasNew = fetched.some((n: { alreadySynced: boolean }) => !n.alreadySynced)
        if (hasNew) {
          setSyncing(true)
          const syncRes = await fetch('/api/granola/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          })
          const syncData = await syncRes.json()
          if (syncRes.ok) {
            const syncResults: SyncResult[] = syncData.results ?? []
            setResults(syncResults)
            const taskMap: Record<string, ProposedTask[]> = {}
            for (const r of syncResults) {
              if (r.proposedTasks?.length) taskMap[r.id] = r.proposedTasks
            }
            setPendingTasks(taskMap)
            const first = syncResults.find(r => r.status === 'synced')
            if (first) setExpanded(first.id)
            // Refresh note list after sync
            const refreshRes = await fetch('/api/granola/sync')
            const refreshData = await refreshRes.json()
            if (refreshRes.ok) setNotes(refreshData.notes ?? [])
          }
          setSyncing(false)
        }
      } catch {
        setError('Could not reach Granola API')
      } finally {
        setLoadingNotes(false)
      }
    }
    init()
  }, [])

  const newNotes = notes.filter(n => !n.alreadySynced)
  const syncedNotes = notes.filter(n => n.alreadySynced)

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-[#1c1c1e] font-medium">Granola Meetings</p>
          <p className="text-xs text-[#8e8e93] mt-0.5">Pull your meeting notes into Caspar's memory</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadNotes}
            disabled={loadingNotes}
            className="text-xs font-mono text-[#8e8e93] hover:text-[#6c6c70] disabled:opacity-40 transition-colors"
          >
            {loadingNotes ? 'Loading…' : 'Refresh'}
          </button>
          <button
            onClick={catchUpAll}
            disabled={catchingUp || syncing}
            className="text-xs font-mono text-[#8e8e93] border border-black/[0.08] px-3 py-1.5 rounded-lg hover:text-[#1c1c1e] hover:border-black/[0.15] disabled:opacity-40 transition-all"
          >
            {catchingUp ? 'Catching up…' : 'Catch up all history'}
          </button>
          <button
            onClick={syncAll}
            disabled={syncing || newNotes.length === 0}
            className="bg-[#EF22DA] text-black text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-30 hover:opacity-90 transition-all"
          >
            {syncing ? 'Syncing…' : `Sync ${newNotes.length} new`}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-xl text-xs text-red-400 font-mono">{error}</div>
      )}

      {catchupResult && (
        <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl text-xs text-emerald-600 font-mono">
          {catchupResult.processed === 0
            ? 'All caught up. No new meetings to process.'
            : `Processed ${catchupResult.processed} meetings. ${catchupResult.todosAdded} action items added to your todo list.${catchupResult.remaining > 0 ? ` ${catchupResult.remaining} more — run again to continue.` : ' Posted to #yay.'}`}
        </div>
      )}

      {/* Sync results */}
      {results.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#8e8e93]">
            {results.filter(r => r.status === 'synced').length} synced
          </p>
          {results.map(r => (
            <div key={r.id} className="bg-white border border-black/[0.08] rounded-xl overflow-hidden">
              <button
                onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                className="w-full flex items-center justify-between p-4 text-left"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${r.status === 'synced' ? 'bg-emerald-400' : r.status === 'error' ? 'bg-red-400' : 'bg-[#c7c7cc]'}`} />
                  <span className="text-sm text-[#1c1c1e]">{r.title}</span>
                </div>
                <div className="flex items-center gap-3">
                  {r.memoriesSaved !== undefined && (
                    <span className="text-xs font-mono text-[#8e8e93]">{r.memoriesSaved} memories</span>
                  )}
                  {r.slackPosted && (
                    <span className="text-[10px] font-mono text-emerald-400">slack ✓</span>
                  )}
                  {(pendingTasks[r.id]?.length ?? 0) > 0 && (
                    <span className="text-[10px] font-mono text-yellow-400">{pendingTasks[r.id].length} tasks</span>
                  )}
                  <span className="text-[10px] text-[#8e8e93] font-mono">{expanded === r.id ? '↑' : '↓'}</span>
                </div>
              </button>

              {expanded === r.id && (
                <div className="border-t border-black/[0.07]">
                  {/* Recap */}
                  {r.recap && (
                    <div className="px-4 py-4 border-b border-black/[0.05]">
                      <p className="font-mono text-[10px] uppercase tracking-widest text-[#8e8e93] mb-2">Recap</p>
                      <p className="text-sm text-[#3a3a3c] leading-relaxed">{r.recap}</p>
                    </div>
                  )}

                  {/* Caspar's personal take */}
                  {r.casparTake && (
                    <div className="px-4 py-4 border-b border-black/[0.05] bg-[#EF22DA]/[0.03]">
                      <p className="font-mono text-[10px] uppercase tracking-widest text-[#EF22DA]/60 mb-2">Caspar's take</p>
                      <p className="text-sm text-[#3a3a3c] whitespace-pre-wrap leading-relaxed italic">{r.casparTake}</p>
                    </div>
                  )}

                  {/* Task confirmation */}
                  {(pendingTasks[r.id]?.length ?? 0) > 0 && (
                    <div className="px-4 py-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="font-mono text-[10px] uppercase tracking-widest text-yellow-400">Proposed ClickUp tasks — confirm to create</p>
                      </div>
                      <div className="flex flex-col gap-2 mb-3">
                        {pendingTasks[r.id].map((task, i) => (
                          <div key={i} className="flex items-start gap-3 p-3 bg-black/[0.04] border border-black/[0.07] rounded-xl">
                            <div className="flex-1">
                              <p className="text-sm text-[#1c1c1e]">{task.name}</p>
                              <div className="flex items-center gap-2 mt-1">
                                {task.assignee && (
                                  <span className="text-[10px] font-mono text-[#EF22DA] bg-[#EF22DA]/10 px-2 py-0.5 rounded-full">
                                    {task.assignee}
                                  </span>
                                )}
                                {task.listName && (
                                  <span className="text-[10px] font-mono text-[#8e8e93]">{task.listName}</span>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={() => toggleTask(r.id, i)}
                              className="text-[#8e8e93] hover:text-red-400 text-xs font-mono transition-colors shrink-0 mt-0.5"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => createTasks(r.id)}
                        disabled={creatingTasks[r.id]}
                        className="w-full bg-[#EF22DA] text-black text-sm font-bold py-2.5 rounded-xl disabled:opacity-30 hover:opacity-90 transition-all"
                      >
                        {creatingTasks[r.id] ? 'Creating in Asana…' : `Create ${pendingTasks[r.id].length} tasks in Asana →`}
                      </button>
                    </div>
                  )}

                  {createdTasks[r.id] && (
                    <div className="px-4 pb-4">
                      <p className="text-xs text-emerald-400 font-mono">Tasks created in Asana ✓</p>
                    </div>
                  )}

                  {r.error && (
                    <div className="px-4 pb-4">
                      <p className="text-xs text-red-400 font-mono">{r.error}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Notes list */}
      {notes.length === 0 && !loadingNotes && !error && (
        <div className="text-center py-12 text-[#8e8e93] text-sm">No meetings found in Granola</div>
      )}

      {newNotes.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#8e8e93]">New — not yet synced</p>
          {newNotes.map(n => (
            <div key={n.id} className="flex items-center justify-between p-3.5 bg-white border border-black/[0.08] rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-[#EF22DA]" />
                <span className="text-sm text-[#1c1c1e]">{n.title || 'Untitled meeting'}</span>
              </div>
              {n.created_at && (
                <span className="text-xs text-[#8e8e93] font-mono">
                  {new Date(n.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {syncedNotes.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#8e8e93]">Already in Caspar's memory</p>
          {syncedNotes.map(n => (
            <div key={n.id} className="flex items-center justify-between p-3.5 bg-transparent border border-black/[0.05] rounded-xl opacity-50">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-emerald-400/50" />
                <span className="text-sm text-[#6c6c70]">{n.title || 'Untitled meeting'}</span>
              </div>
              {n.created_at && (
                <span className="text-xs text-[#8e8e93] font-mono">
                  {new Date(n.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── MAIN PAGE ───────────────────────────────────────────────────────────────

export default function TrainPage() {
  const [tab, setTab] = useState<Tab>('granola')

  const tabs: { id: Tab; label: string; desc: string }[] = [
    { id: 'granola', label: 'Granola', desc: 'Sync meetings directly from Granola' },
    { id: 'transcript', label: 'Transcript', desc: 'Process meeting notes, Granola exports, voice memos' },
    { id: 'quick', label: 'Quick Memory', desc: 'One-line rules, corrections, opinions' },
    { id: 'qa', label: 'Q&A Session', desc: 'Caspar interviews you' },
  ]

  return (
    <div className="flex h-full bg-transparent">
      {/* Left panel — tabs */}
      <div className="w-[240px] shrink-0 border-r border-black/[0.06] flex flex-col">
        <div className="px-6 pt-7 pb-5 border-b border-black/[0.06]">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#8e8e93] mb-1">Intelligence</p>
          <h1 className="text-lg font-semibold text-[#1c1c1e] tracking-tight">Train Caspar</h1>
        </div>

        <div className="p-4 flex flex-col gap-1">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`text-left px-3 py-3 rounded-xl transition-all ${tab === t.id ? 'bg-[#EF22DA]/10 border border-[#EF22DA]/20' : 'hover:bg-black/[0.04] border border-transparent'}`}
            >
              <div className={`text-sm font-semibold ${tab === t.id ? 'text-[#EF22DA]' : 'text-[#1c1c1e]'}`}>{t.label}</div>
              <div className="text-[11px] text-[#8e8e93] mt-0.5 leading-snug">{t.desc}</div>
            </button>
          ))}
        </div>

        <div className="p-4 mt-auto border-t border-black/[0.06]">
          <p className="text-[10px] text-[#8e8e93] font-mono leading-relaxed">
            Granola API connected
          </p>
        </div>
      </div>

      {/* Right panel — content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl h-full">
          {tab === 'granola' && <GranolaTab />}
          {tab === 'transcript' && <TranscriptTab />}
          {tab === 'quick' && <QuickMemoryTab />}
          {tab === 'qa' && <QATab />}
        </div>
      </div>
    </div>
  )
}
