'use client'

import { useState, useEffect, use, useRef } from 'react'
import Link from 'next/link'

type Client = {
  id: string
  name: string
  website?: string
  instagram?: string
  tiktok?: string
  brief?: string
  notes?: string
  north_star?: string
  research_notes?: string
  status?: string
  monthly_value?: number
  next_action?: string
}

type ResearchPattern = {
  id: string
  platform: string
  author: string
  hook: string
  pattern: string
  why_it_popped: string
  no_context_angles: string
  created_at: string
}

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [client, setClient] = useState<Client | null>(null)
  const [tab, setTab] = useState<'brief' | 'research' | 'chat'>('brief')
  const [researching, setResearching] = useState(false)
  const [researchLog, setResearchLog] = useState<string[]>([])
  const [patterns, setPatterns] = useState<ResearchPattern[]>([])
  const [brief, setBrief] = useState('')
  const [briefSaved, setBriefSaved] = useState(false)
  const [dropInput, setDropInput] = useState('')
  const [dropping, setDropping] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([])
  const [chatLoading, setChatLoading] = useState(false)
  const chatBottomRef = useRef<HTMLDivElement>(null)
  const [editing, setEditing] = useState<Partial<Client>>({})
  const [savingField, setSavingField] = useState(false)

  useEffect(() => {
    fetch(`/api/clients/${id}`).then(r => r.json()).then((c: Client) => {
      setClient(c)
      setBrief(c.brief || '')
    })
    // Load research patterns for this client
    const sb = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    fetch(`${sb}/rest/v1/research_patterns?client_id=eq.${id}&order=created_at.desc&limit=20`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    }).then(r => r.json()).then(d => setPatterns(Array.isArray(d) ? d : []))
  }, [id])

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function runResearch() {
    setResearching(true)
    setResearchLog([])
    setTab('research')
    const data = await fetch(`/api/clients/${id}/research`, { method: 'POST' }).then(r => r.json())
    setResearchLog(data.log || [])
    if (data.brief) { setBrief(data.brief); setClient(prev => prev ? { ...prev, brief: data.brief } : prev) }
    setResearching(false)
  }

  async function dropContent() {
    if (!dropInput.trim()) return
    setDropping(true)
    const data = await fetch(`/api/clients/${id}/research`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: dropInput.trim() }),
    }).then(r => r.json())
    setResearchLog(prev => [...prev, ...(data.log || [])])
    if (data.brief) { setBrief(data.brief); setClient(prev => prev ? { ...prev, brief: data.brief } : prev) }
    setDropInput('')
    setDropping(false)
    setTab('research')
  }

  async function saveBrief() {
    await fetch(`/api/clients/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brief }),
    })
    setBriefSaved(true)
    setTimeout(() => setBriefSaved(false), 2000)
  }

  async function saveField(field: string, value: string) {
    setSavingField(true)
    const updated = await fetch(`/api/clients/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    }).then(r => r.json())
    setClient(updated)
    setEditing({})
    setSavingField(false)
  }

  async function sendChat() {
    if (!chatInput.trim() || chatLoading) return
    const userMsg = chatInput.trim()
    setChatInput('')
    const newHistory = [...messages, { role: 'user' as const, content: userMsg }]
    setMessages([...newHistory, { role: 'assistant', content: '' }])
    setChatLoading(true)

    const res = await fetch(`/api/clients/${id}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: userMsg, history: messages }),
    })

    if (!res.body) { setChatLoading(false); return }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let reply = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      reply += decoder.decode(value, { stream: true })
      setMessages([...newHistory, { role: 'assistant', content: reply }])
    }

    setChatLoading(false)
  }

  if (!client) {
    return (
      <div className="p-8 flex flex-col gap-3">
        <div className="h-3 bg-black/[0.04] rounded w-16 animate-pulse" />
        <div className="h-6 bg-black/[0.04] rounded w-48 animate-pulse" />
        <div className="h-4 bg-black/[0.04] rounded w-64 animate-pulse mt-2" />
      </div>
    )
  }

  const igClean = client.instagram?.replace('@', '')
  const ttClean = client.tiktok?.replace('@', '')

  return (
    <div className="flex h-full">

      {/* Left sidebar — client info */}
      <div className="w-72 shrink-0 border-r border-black/[0.06] flex flex-col bg-white/60 overflow-y-auto">
        <div className="p-6 border-b border-black/[0.05]">
          <Link href="/clients" className="font-mono text-[10px] uppercase tracking-widest text-[#aeaeb2] hover:text-[#6c6c70] flex items-center gap-1 mb-5 w-fit">
            ← Clients
          </Link>

          {/* Avatar + name */}
          <div className="flex items-center gap-3 mb-5">
            <div className="w-12 h-12 rounded-2xl bg-[#EF22DA]/[0.08] border border-[#EF22DA]/[0.15] flex items-center justify-center text-xl font-bold text-[#EF22DA] shrink-0">
              {client.name[0].toUpperCase()}
            </div>
            <div>
              <h1 className="text-[16px] font-semibold text-[#1c1c1e] leading-tight">{client.name}</h1>
              {client.monthly_value && (
                <p className="text-[12px] text-[#6c6c70] mt-0.5">${client.monthly_value.toLocaleString()}<span className="text-[#aeaeb2]">/mo</span></p>
              )}
            </div>
          </div>

          {/* Handles */}
          <div className="flex flex-col gap-2 mb-5">
            {client.instagram && (
              <a href={`https://instagram.com/${igClean}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2.5 px-3 py-2 bg-black/[0.03] border border-black/[0.06] rounded-xl hover:border-black/[0.12] hover:bg-black/[0.05] transition-all group">
                <span className="font-mono text-[9px] uppercase tracking-widest text-[#aeaeb2] w-5">IG</span>
                <span className="text-[12px] text-[#3a3a3c] font-mono group-hover:text-[#EF22DA] transition-colors">{client.instagram}</span>
                <span className="ml-auto text-[#aeaeb2] text-xs group-hover:text-[#EF22DA]">↗</span>
              </a>
            )}
            {client.tiktok && (
              <a href={`https://tiktok.com/@${ttClean}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2.5 px-3 py-2 bg-black/[0.03] border border-black/[0.06] rounded-xl hover:border-black/[0.12] hover:bg-black/[0.05] transition-all group">
                <span className="font-mono text-[9px] uppercase tracking-widest text-[#aeaeb2] w-5">TT</span>
                <span className="text-[12px] text-[#3a3a3c] font-mono group-hover:text-[#EF22DA] transition-colors">{client.tiktok}</span>
                <span className="ml-auto text-[#aeaeb2] text-xs group-hover:text-[#EF22DA]">↗</span>
              </a>
            )}
            {client.website && (
              <a href={client.website} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2.5 px-3 py-2 bg-black/[0.03] border border-black/[0.06] rounded-xl hover:border-black/[0.12] hover:bg-black/[0.05] transition-all group">
                <span className="font-mono text-[9px] uppercase tracking-widest text-[#aeaeb2] w-5">WEB</span>
                <span className="text-[11px] text-[#3a3a3c] font-mono truncate group-hover:text-[#EF22DA] transition-colors">
                  {client.website.replace(/https?:\/\/(www\.)?/, '')}
                </span>
                <span className="ml-auto text-[#aeaeb2] text-xs shrink-0 group-hover:text-[#EF22DA]">↗</span>
              </a>
            )}
          </div>

          {/* Missing handles prompt */}
          {(!client.instagram || !client.tiktok) && (
            <div className="text-[11px] text-[#aeaeb2] bg-black/[0.02] border border-black/[0.05] rounded-xl px-3 py-2 mb-4">
              {!client.instagram && !client.tiktok ? 'Add IG + TikTok handles to enable research' :
               !client.instagram ? 'Add Instagram handle' : 'Add TikTok handle'}
              {' '}
              <button onClick={() => setEditing({ instagram: client.instagram || '', tiktok: client.tiktok || '' })}
                className="text-[#EF22DA] underline underline-offset-2">Edit</button>
            </div>
          )}

          {/* Edit handles inline */}
          {(editing.instagram !== undefined || editing.tiktok !== undefined) && (
            <div className="flex flex-col gap-2 mb-4 p-3 bg-white border border-black/[0.07] rounded-xl">
              <input
                value={editing.instagram ?? client.instagram ?? ''}
                onChange={e => setEditing(p => ({ ...p, instagram: e.target.value }))}
                placeholder="@instagram"
                className="bg-black/[0.03] border border-black/[0.07] rounded-lg px-3 py-1.5 text-[12px] text-[#1c1c1e] placeholder:text-[#aeaeb2] focus:outline-none font-mono"
              />
              <input
                value={editing.tiktok ?? client.tiktok ?? ''}
                onChange={e => setEditing(p => ({ ...p, tiktok: e.target.value }))}
                placeholder="@tiktok"
                className="bg-black/[0.03] border border-black/[0.07] rounded-lg px-3 py-1.5 text-[12px] text-[#1c1c1e] placeholder:text-[#aeaeb2] focus:outline-none font-mono"
              />
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    setSavingField(true)
                    const updated = await fetch(`/api/clients/${id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ instagram: editing.instagram, tiktok: editing.tiktok }),
                    }).then(r => r.json())
                    setClient(updated)
                    setEditing({})
                    setSavingField(false)
                  }}
                  disabled={savingField}
                  className="text-[11px] bg-[#EF22DA] text-white font-semibold px-3 py-1 rounded-lg disabled:opacity-40"
                >
                  {savingField ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => setEditing({})} className="text-[11px] text-[#aeaeb2]">Cancel</button>
              </div>
            </div>
          )}

          {/* Context notes */}
          <div className="mb-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-[#aeaeb2] mb-1.5">Context notes</p>
            {editing.notes !== undefined ? (
              <div className="flex flex-col gap-2">
                <textarea
                  value={editing.notes}
                  onChange={e => setEditing(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Who is the founder, what's worked before, what to avoid, key contacts…"
                  rows={4}
                  className="w-full bg-white border border-black/[0.07] rounded-xl px-3 py-2 text-[12px] text-[#1c1c1e] placeholder:text-[#aeaeb2] focus:outline-none resize-none leading-relaxed"
                />
                <div className="flex gap-2">
                  <button onClick={() => saveField('notes', editing.notes ?? '')} disabled={savingField}
                    className="text-[11px] bg-[#EF22DA] text-white font-semibold px-3 py-1 rounded-lg disabled:opacity-40">
                    {savingField ? 'Saving…' : 'Save'}
                  </button>
                  <button onClick={() => setEditing({})} className="text-[11px] text-[#aeaeb2]">Cancel</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setEditing({ notes: client.notes ?? '' })}
                className="w-full text-left px-3 py-2.5 bg-black/[0.02] border border-black/[0.06] border-dashed rounded-xl text-[12px] text-[#aeaeb2] hover:border-black/[0.12] hover:text-[#6c6c70] transition-all"
              >
                {client.notes || '+ Add context notes…'}
              </button>
            )}
          </div>

          {/* Drop URL */}
          <div className="flex gap-2 mb-4">
            <input value={dropInput} onChange={e => setDropInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && dropContent()}
              placeholder="Drop a URL…"
              className="flex-1 bg-white border border-black/[0.07] rounded-xl px-3 py-2 text-[12px] text-[#1c1c1e] placeholder:text-[#aeaeb2] focus:outline-none focus:border-black/[0.15] font-mono min-w-0"
            />
            <button onClick={dropContent} disabled={dropping || !dropInput.trim()}
              className="px-3 py-2 bg-black/[0.04] border border-black/[0.07] rounded-xl text-[11px] text-[#6c6c70] hover:border-black/[0.14] disabled:opacity-40 shrink-0">
              {dropping ? '…' : 'Drop'}
            </button>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <button onClick={runResearch} disabled={researching}
              className="w-full py-2.5 bg-black/[0.04] border border-black/[0.07] rounded-xl text-[13px] font-semibold text-[#3a3a3c] hover:bg-black/[0.07] hover:border-black/[0.12] disabled:opacity-40 transition-all">
              {researching ? 'Researching…' : '↻ Run Research'}
            </button>
            <Link href={`/ideate?clientId=${id}`}
              className="w-full py-2.5 bg-[#EF22DA]/[0.07] border border-[#EF22DA]/[0.15] rounded-xl text-[13px] font-semibold text-[#EF22DA] hover:bg-[#EF22DA]/[0.12] transition-all text-center">
              Ideate →
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="p-5 flex flex-col gap-3">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#aeaeb2]">At a Glance</p>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-[#aeaeb2]">Brief</span>
              <span className={`text-[11px] font-mono ${client.brief ? 'text-emerald-500' : 'text-[#aeaeb2]'}`}>
                {client.brief ? '✓ Ready' : 'Not set'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-[#aeaeb2]">Research patterns</span>
              <span className="text-[11px] font-mono text-[#6c6c70]">{patterns.length}</span>
            </div>
            {client.next_action && (
              <div className="mt-2 p-3 bg-amber-50 border border-amber-100 rounded-xl">
                <p className="text-[10px] font-mono uppercase tracking-widest text-amber-400 mb-1">Next action</p>
                <p className="text-[12px] text-[#3a3a3c]">{client.next_action}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right — tabbed content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Tab bar */}
        <div className="px-8 pt-6 pb-0 border-b border-black/[0.06] flex items-center gap-0">
          {(['brief', 'research', 'chat'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-5 py-3 text-[13px] font-medium border-b-2 transition-colors ${
                tab === t ? 'border-[#EF22DA] text-[#1c1c1e]' : 'border-transparent text-[#8e8e93] hover:text-[#3a3a3c]'
              }`}>
              {t === 'brief' ? 'Brand Brief' : t === 'research' ? `Research${patterns.length > 0 ? ` (${patterns.length})` : ''}` : 'Ask Caspar'}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-8">

          {/* BRIEF TAB */}
          {tab === 'brief' && (
            <div className="max-w-2xl">
              {!brief && (
                <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-100 rounded-xl text-sm text-amber-700 mb-5">
                  <span>No brief yet.</span>
                  <button onClick={runResearch} disabled={researching}
                    className="font-semibold underline underline-offset-2 disabled:opacity-40">
                    Run Research →
                  </button>
                </div>
              )}
              <textarea value={brief} onChange={e => setBrief(e.target.value)}
                placeholder="Write or paste the brand brief here…"
                className="w-full h-[calc(100vh-320px)] min-h-64 bg-white border border-black/[0.07] rounded-2xl p-5 text-[13px] text-[#3a3a3c] leading-relaxed resize-none focus:outline-none focus:border-black/[0.14] placeholder:text-[#aeaeb2] shadow-[0_1px_4px_rgba(0,0,0,0.04)]"
              />
              <button onClick={saveBrief}
                className="mt-3 bg-[#EF22DA] text-white text-[13px] font-semibold px-5 py-2.5 rounded-xl hover:opacity-90 shadow-[0_1px_3px_rgba(239,34,218,0.25)]">
                {briefSaved ? '✓ Saved' : 'Save Brief'}
              </button>
            </div>
          )}

          {/* RESEARCH TAB */}
          {tab === 'research' && (
            <div className="max-w-2xl flex flex-col gap-6">
              {/* Research patterns from DB */}
              {patterns.length > 0 && (
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-[#aeaeb2] mb-3">Saved Research Patterns</p>
                  <div className="flex flex-col gap-3">
                    {patterns.map((p, i) => (
                      <div key={p.id} className="bg-white border border-black/[0.07] rounded-2xl p-4 animate-fade-up shadow-[0_1px_4px_rgba(0,0,0,0.04)]" style={{ animationDelay: `${i * 20}ms` }}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-mono text-[9px] uppercase tracking-widest text-[#aeaeb2]">{p.platform}</span>
                          {p.author && <span className="text-[11px] text-[#6c6c70]">@{p.author}</span>}
                        </div>
                        {p.hook && <p className="text-[13px] font-semibold text-[#1c1c1e] mb-1.5 leading-snug">"{p.hook}"</p>}
                        {p.pattern && <p className="text-[12px] text-[#6c6c70] mb-1.5 leading-relaxed">{p.pattern}</p>}
                        {p.no_context_angles && (
                          <p className="text-[11px] text-[#EF22DA]/70 leading-relaxed">{p.no_context_angles}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Research log */}
              {(researchLog.length > 0 || researching) && (
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-widest text-[#aeaeb2] mb-3">Research Log</p>
                  {researching && <p className="text-[12px] text-[#6c6c70] animate-pulse mb-2">Analysing sources…</p>}
                  <div className="flex flex-col gap-1.5">
                    {researchLog.map((log, i) => (
                      <div key={i} className="px-3 py-2 bg-white border border-black/[0.06] rounded-xl text-[12px] text-[#3a3a3c] font-mono animate-fade-up" style={{ animationDelay: `${i * 20}ms` }}>
                        {log}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {patterns.length === 0 && researchLog.length === 0 && !researching && (
                <div className="text-center py-16">
                  <p className="text-[#aeaeb2] text-sm mb-3">No research yet for {client.name}.</p>
                  <p className="text-[12px] text-[#c7c7cc]">Run research to scrape their website, or drop TikTok/IG video URLs to analyse their content patterns.</p>
                </div>
              )}
            </div>
          )}

          {/* CHAT TAB */}
          {tab === 'chat' && (
            <div className="max-w-2xl flex flex-col h-full" style={{ height: 'calc(100vh - 200px)' }}>
              <div className="flex-1 overflow-y-auto flex flex-col gap-3 pb-4">
                {messages.length === 0 && (
                  <div className="flex flex-col gap-2 pt-2">
                    <p className="text-[11px] text-[#aeaeb2] font-mono uppercase tracking-widest mb-1">Ask about {client.name}</p>
                    {[
                      'What content angles should we focus on?',
                      'What does their audience care about?',
                      'Give me 5 hook ideas for their next campaign.',
                    ].map(s => (
                      <button key={s} onClick={() => setChatInput(s)}
                        className="text-left text-[12px] text-[#6c6c70] px-4 py-2.5 bg-white border border-black/[0.06] rounded-xl hover:border-black/[0.12] hover:text-[#1c1c1e] transition-all shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
                        {s}
                      </button>
                    ))}
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-up`}>
                    <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap ${
                      m.role === 'user'
                        ? 'bg-[#EF22DA] text-white rounded-br-sm'
                        : 'bg-white border border-black/[0.07] text-[#3a3a3c] rounded-bl-sm shadow-[0_1px_3px_rgba(0,0,0,0.04)]'
                    }`}>
                      {m.content || (chatLoading && i === messages.length - 1 && m.role === 'assistant' ? (
                        <span className="flex gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#EF22DA] animate-pulse" />
                          <span className="w-1.5 h-1.5 rounded-full bg-[#EF22DA] animate-pulse" style={{ animationDelay: '150ms' }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-[#EF22DA] animate-pulse" style={{ animationDelay: '300ms' }} />
                        </span>
                      ) : '')}
                    </div>
                  </div>
                ))}
                <div ref={chatBottomRef} />
              </div>
              <div className="flex gap-2 items-end shrink-0 border-t border-black/[0.05] pt-4">
                <textarea value={chatInput} onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }}
                  placeholder={`Ask Caspar about ${client.name}…`}
                  rows={2}
                  className="flex-1 bg-white border border-black/[0.07] rounded-xl px-4 py-3 text-[13px] text-[#1c1c1e] placeholder:text-[#aeaeb2] focus:outline-none focus:border-black/[0.15] resize-none shadow-[0_1px_3px_rgba(0,0,0,0.03)]"
                />
                <button onClick={sendChat} disabled={chatLoading || !chatInput.trim()}
                  className="w-9 h-9 rounded-xl bg-[#EF22DA] flex items-center justify-center text-white disabled:opacity-30 hover:opacity-90 self-end shadow-[0_1px_3px_rgba(239,34,218,0.25)]">
                  <span className="text-xs">↑</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
