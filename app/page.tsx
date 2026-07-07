'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

type CalendarEvent = {
  id: string
  title: string
  start_time: string
  end_time: string
  location?: string
  attendees?: string[]
}

type Email = {
  id: string
  subject: string
  from_address: string
  priority: 'high' | 'normal'
  reason: string
  suggested_reply?: string
  related_client?: string
}

type Todo = {
  id: string
  content: string
  created_at: string
}

type Thought = {
  id: string
  type: string
  content: string
  context?: string
  created_at: string
}

type ChatMessage = { role: 'user' | 'assistant'; content: string }

function timeStr(iso: string) {
  return new Date(iso).toLocaleTimeString('en-AU', {
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Australia/Sydney',
  })
}

function greeting() {
  const h = parseInt(new Date().toLocaleString('en-AU', { hour: 'numeric', hour12: false, timeZone: 'Australia/Sydney' }))
  if (h < 12) return 'Morning'
  if (h < 17) return 'Afternoon'
  return 'Evening'
}

function dayStr() {
  return new Date().toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long',
    timeZone: 'Australia/Sydney',
  })
}

const THOUGHT_DOTS: Record<string, string> = {
  feeling:     'bg-[#EF22DA]',
  observation: 'bg-blue-400',
  thought:     'bg-zinc-300',
  opinion:     'bg-orange-400',
  question:    'bg-yellow-400',
}

function Skeleton({ className }: { className?: string }) {
  return <div className={`rounded-xl shimmer ${className}`} />
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-black/[0.07] rounded-2xl shadow-[0_1px_4px_rgba(0,0,0,0.05)] ${className}`}>
      {children}
    </div>
  )
}

export default function TodayPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [emails, setEmails] = useState<Email[]>([])
  const [todos, setTodos] = useState<Todo[]>([])
  const [thoughts, setThoughts] = useState<Thought[]>([])
  const [syncing, setSyncing] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [googleError, setGoogleError] = useState(false)
  const [greetingText, setGreetingText] = useState('')
  const [dayText, setDayText] = useState('')

  useEffect(() => {
    setGreetingText(greeting())
    setDayText(dayStr())
  }, [])

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatBottomRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLTextAreaElement>(null)

  async function loadAll() {
    const sb = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const headers = { apikey: key, Authorization: `Bearer ${key}` }

    const now = new Date().toISOString()
    const endOfDay = new Date()
    endOfDay.setHours(23, 59, 59, 999)

    const [evRes, emailRes, todoRes, thoughtRes] = await Promise.all([
      fetch(`${sb}/rest/v1/calendar_events?start_time=gte.${now}&start_time=lte.${endOfDay.toISOString()}&order=start_time&limit=10`, { headers }),
      fetch(`${sb}/rest/v1/email_inbox?needs_attention=eq.true&status=eq.unread&order=priority.desc&limit=8`, { headers }),
      fetch(`${sb}/rest/v1/todos?done=eq.false&order=created_at&limit=20`, { headers }),
      // Only show auto-think thoughts — these are always fresh from the last sync
      fetch(`${sb}/rest/v1/agent_thoughts?agent=eq.caspar&context=eq.auto-think&order=created_at.desc&limit=4`, { headers }),
    ])

    const [evData, emailData, todoData, thoughtData] = await Promise.all([
      evRes.json(), emailRes.json(), todoRes.json(), thoughtRes.json(),
    ])

    setEvents(Array.isArray(evData) ? evData : [])
    setEmails(Array.isArray(emailData) ? emailData : [])
    setTodos(Array.isArray(todoData) ? todoData : [])
    setThoughts(Array.isArray(thoughtData) ? thoughtData : [])
    setLoaded(true)
  }

  async function syncAndLoad() {
    setSyncing(true)
    setGoogleError(false)

    const [calRes, gmailRes] = await Promise.allSettled([
      fetch('/api/sync/calendar', { method: 'POST' }),
      fetch('/api/sync/gmail', { method: 'POST' }),
    ])

    const hasError = await Promise.any([calRes, gmailRes].map(async r => {
      if (r.status === 'fulfilled') {
        const data = await r.value.clone().json().catch(() => ({}))
        if (!r.value.ok || data?.error?.toLowerCase().includes('not connected') || data?.error?.toLowerCase().includes('google')) return true
      }
      return false
    })).catch(() => false)
    if (hasError) setGoogleError(true)

    // Run in background — don't block the UI
    fetch('/api/granola/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }).catch(() => {})
    fetch('/api/sync/morning', { method: 'POST' }).catch(() => {})

    // Thinking loop — regenerate Caspar's mind from current state
    // Run this after calendar + gmail so it has fresh data
    fetch('/api/sync/think', { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        if (data.ok && data.thoughts) {
          setThoughts(data.thoughts.map((t: { type: string; content: string }, i: number) => ({
            id: String(i),
            type: t.type,
            content: t.content,
            created_at: new Date().toISOString(),
          })))
        }
      })
      .catch(() => {})

    await loadAll()
    setSyncing(false)
  }

  async function sendChat() {
    const msg = chatInput.trim()
    if (!msg || chatLoading) return
    const newHistory: ChatMessage[] = [...chatMessages, { role: 'user', content: msg }]
    setChatMessages(newHistory)
    setChatInput('')
    setChatLoading(true)
    setChatMessages([...newHistory, { role: 'assistant', content: '' }])

    const res = await fetch('/api/agents/caspar/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg, history: chatMessages }),
    })

    if (!res.body) { setChatLoading(false); return }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let reply = ''
    let shouldRefreshTodos = false

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      if (chunk.includes('\x00refresh_todos\x00')) {
        shouldRefreshTodos = true
        reply += chunk.replace(/\x00refresh_todos\x00/g, '')
      } else {
        reply += chunk
      }
      setChatMessages([...newHistory, { role: 'assistant', content: reply }])
    }

    setChatLoading(false)
    if (shouldRefreshTodos) {
      const sb = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      fetch(`${sb}/rest/v1/todos?done=eq.false&order=created_at&limit=20`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      }).then(r => r.json()).then(data => setTodos(Array.isArray(data) ? data : []))
    }
  }

  useEffect(() => { syncAndLoad() }, [])

  // Auto-refresh everything every 15 min — keeps the whole dashboard current
  // without a manual Sync click. Used to only refresh Caspar's Mind, which is
  // why todos/emails/calendar could sit stale for as long as the tab stayed open.
  useEffect(() => {
    const interval = setInterval(() => { syncAndLoad() }, 15 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  // Refresh everything when tab regains focus — same reasoning, this used to
  // only refresh todos.
  useEffect(() => {
    function onFocus() { syncAndLoad() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const highEmails = emails.filter(e => e.priority === 'high')
  const normalEmails = emails.filter(e => e.priority === 'normal')
  const isStreaming = chatLoading && chatMessages[chatMessages.length - 1]?.role === 'assistant' && chatMessages[chatMessages.length - 1]?.content !== ''

  return (
    <div className="flex h-full">

      {/* Left: dashboard */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Header */}
        <div className="px-8 pt-8 pb-6 border-b border-black/[0.05] flex items-center justify-between shrink-0">
          <div>
            <p className="text-[#aeaeb2] text-[11px] font-mono tracking-widest uppercase">{dayText}</p>
            <h1 className="text-[26px] font-semibold text-[#1c1c1e] tracking-tight mt-1 leading-none">
              {greetingText ? `${greetingText}, Josh.` : ''}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {googleError && (
              <a
                href="/settings"
                className="text-[11px] font-mono text-[#EF22DA] hover:underline tracking-wide"
              >
                ⚠ Connect Google
              </a>
            )}
            <button
              onClick={syncAndLoad}
              disabled={syncing}
              className="text-[11px] font-mono text-[#aeaeb2] hover:text-[#6c6c70] disabled:opacity-40 tracking-wide"
            >
              {syncing ? 'Syncing…' : '↻ Sync'}
            </button>
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 p-6">
          <div className="max-w-4xl grid grid-cols-3 gap-4">

            {/* Todos — spans 2 rows */}
            <Card className="p-5 flex flex-col row-span-2">
              <div className="flex items-center justify-between mb-4">
                <p className="font-mono text-[10px] uppercase tracking-widest text-[#aeaeb2]">To Do</p>
                {todos.length > 0 && <span className="text-[10px] font-mono text-[#c7c7cc]">{todos.length}</span>}
              </div>
              {!loaded ? (
                <div className="flex flex-col gap-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-8" />)}</div>
              ) : todos.length === 0 ? (
                <p className="text-sm text-[#c7c7cc] italic">All clear.</p>
              ) : (
                <div className="flex flex-col gap-0.5 flex-1 overflow-y-auto">
                  {todos.map((t, i) => (
                    <div key={t.id} className="flex items-start gap-3 px-2.5 py-2.5 rounded-xl hover:bg-black/[0.03] group cursor-default animate-fade-up" style={{ animationDelay: `${i * 25}ms` }}>
                      <div className="w-1.5 h-1.5 rounded-full border border-[#EF22DA]/40 mt-[5px] shrink-0 group-hover:bg-[#EF22DA]/20 transition-all" />
                      <p className="text-[13px] text-[#6c6c70] leading-snug group-hover:text-[#1c1c1e] transition-colors">{t.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Calendar */}
            <Card className="col-span-2 p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="font-mono text-[10px] uppercase tracking-widest text-[#aeaeb2]">Calendar</p>
                <span className="text-[10px] font-mono text-[#c7c7cc]">Today</span>
              </div>
              {!loaded ? (
                <div className="flex flex-col gap-2">{[1,2].map(i => <Skeleton key={i} className="h-12" />)}</div>
              ) : events.length === 0 ? (
                <p className="text-sm text-[#c7c7cc] italic">Nothing on today.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {events.map((e, i) => (
                    <div key={e.id} className="flex items-center gap-4 px-4 py-3 bg-black/[0.025] border border-black/[0.04] rounded-xl animate-fade-up" style={{ animationDelay: `${i * 40}ms` }}>
                      <div className="text-[11px] font-mono text-[#EF22DA]/70 shrink-0 w-14 tabular-nums">{timeStr(e.start_time)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-[#1c1c1e] font-medium truncate">{e.title}</p>
                        {e.location && <p className="text-[11px] text-[#aeaeb2] truncate mt-0.5">{e.location}</p>}
                      </div>
                      {e.attendees && e.attendees.length > 1 && (
                        <span className="text-[10px] font-mono text-[#c7c7cc] shrink-0">{e.attendees.length} people</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Inbox */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="font-mono text-[10px] uppercase tracking-widest text-[#aeaeb2]">Inbox</p>
                {emails.length > 0 && <span className="text-[10px] font-mono bg-[#EF22DA]/[0.08] text-[#EF22DA] px-2 py-0.5 rounded-full">{emails.length}</span>}
              </div>
              {!loaded ? (
                <div className="flex flex-col gap-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14" />)}</div>
              ) : emails.length === 0 ? (
                <p className="text-sm text-[#c7c7cc] italic">Inbox clear.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {[...highEmails, ...normalEmails].map((e, i) => (
                    <div key={e.id} className="group flex items-start gap-3 px-3 py-3 bg-black/[0.025] border border-black/[0.04] rounded-xl animate-fade-up" style={{ animationDelay: `${i * 35}ms` }}>
                      <div className={`w-1.5 h-1.5 rounded-full mt-[5px] shrink-0 ${e.priority === 'high' ? 'bg-[#EF22DA]' : 'bg-black/[0.12]'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-[#1c1c1e] font-medium truncate">{e.subject}</p>
                        <p className="text-[11px] text-[#aeaeb2] truncate mt-0.5">{e.from_address.replace(/<.*?>/, '').trim()}</p>
                        {e.suggested_reply && <p className="text-[11px] text-[#EF22DA]/60 mt-1 leading-snug">{e.suggested_reply}</p>}
                      </div>
                      <button
                        onClick={async () => {
                          const sb = process.env.NEXT_PUBLIC_SUPABASE_URL!
                          const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
                          await fetch(`${sb}/rest/v1/email_inbox?id=eq.${e.id}`, {
                            method: 'PATCH',
                            headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
                            body: JSON.stringify({ status: 'done' }),
                          })
                          setEmails(prev => prev.filter(x => x.id !== e.id))
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-[11px] text-[#aeaeb2] hover:text-[#6c6c70] px-1.5 py-0.5 rounded-lg hover:bg-black/[0.04]"
                        title="Dismiss"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Caspar's Mind */}
            <Card className="p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="font-mono text-[10px] uppercase tracking-widest text-[#aeaeb2]">Caspar's Mind</p>
                <span className="text-[9px] font-mono text-[#c7c7cc] uppercase tracking-widest">Live</span>
              </div>
              {!loaded ? (
                <div className="flex flex-col gap-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10" />)}</div>
              ) : thoughts.length === 0 ? (
                <p className="text-sm text-[#c7c7cc] italic">Hit sync to wake Caspar up.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {thoughts.map((t, i) => (
                    <div key={t.id} className="flex items-start gap-2.5 animate-fade-up" style={{ animationDelay: `${i * 40}ms` }}>
                      <div className={`w-1.5 h-1.5 rounded-full mt-[5px] shrink-0 ${THOUGHT_DOTS[t.type] ?? 'bg-zinc-300'}`} />
                      <p className="text-[12px] text-[#6c6c70] leading-relaxed">{t.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Quick actions */}
            <div className="col-span-3 grid grid-cols-4 gap-3">
              {[
                { href: '/research', label: 'Research',     sub: 'Analyse a TikTok or Reel',    icon: '⌕' },
                { href: '/ideate',   label: 'Ideate',       sub: 'Brief → hook concepts',       icon: '⊹' },
                { href: '/generate', label: 'Scripts',      sub: 'Concept → shooting script',   icon: '≡' },
                { href: '/train',    label: 'Train Caspar', sub: 'Granola, notes, transcripts', icon: '⬡' },
              ].map(({ href, label, sub, icon }, i) => (
                <Link key={href} href={href}
                  className="flex items-start gap-3 p-4 bg-white/60 border border-black/[0.05] rounded-2xl hover:bg-white hover:border-black/[0.09] hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-all group animate-fade-up"
                  style={{ animationDelay: `${300 + i * 50}ms` }}
                >
                  <span className="text-[#c7c7cc] text-sm group-hover:text-[#EF22DA] transition-colors mt-0.5">{icon}</span>
                  <div>
                    <p className="text-[13px] font-semibold text-[#3a3a3c] group-hover:text-[#1c1c1e] transition-colors">{label}</p>
                    <p className="text-[11px] text-[#aeaeb2] mt-0.5">{sub}</p>
                  </div>
                </Link>
              ))}
            </div>

          </div>
        </div>
      </div>

      {/* Right: Caspar chat panel */}
      <div className="w-80 shrink-0 border-l border-black/[0.06] flex flex-col bg-white">
        {/* Chat header */}
        <div className="px-5 pt-5 pb-4 border-b border-black/[0.05] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-[#EF22DA]/10 border border-[#EF22DA]/20 flex items-center justify-center">
              <span className="text-[#EF22DA] text-[11px] font-bold">C</span>
            </div>
            <div>
              <p className="text-[13px] font-semibold text-[#1c1c1e]">Caspar</p>
              <p className="text-[10px] text-[#aeaeb2]">Strategy, Creative, Scripts & Ops</p>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
          {chatMessages.length === 0 && (
            <div className="flex flex-col gap-2 mt-2">
              <p className="text-[11px] text-[#aeaeb2] font-mono uppercase tracking-widest mb-1">Try asking</p>
              {[
                "What's on today?",
                "Any emails I should respond to?",
                "What should I focus on this afternoon?",
              ].map(s => (
                <button key={s} onClick={() => { setChatInput(s); chatInputRef.current?.focus() }}
                  className="text-left text-[12px] text-[#6c6c70] px-3 py-2 bg-black/[0.025] border border-black/[0.05] rounded-xl hover:border-black/[0.10] hover:text-[#1c1c1e] transition-all">
                  {s}
                </button>
              ))}
            </div>
          )}
          {chatMessages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-up`}>
              <div className={`max-w-[85%] px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap ${
                m.role === 'user'
                  ? 'bg-[#EF22DA] text-white rounded-br-sm'
                  : 'bg-black/[0.04] text-[#1c1c1e] rounded-bl-sm border border-black/[0.05]'
              }`}>
                {m.content}
                {isStreaming && i === chatMessages.length - 1 && m.role === 'assistant' && (
                  <span className="typing-cursor" />
                )}
              </div>
            </div>
          ))}
          {chatLoading && chatMessages[chatMessages.length - 1]?.content === '' && (
            <div className="flex justify-start">
              <div className="px-3.5 py-2.5 bg-black/[0.04] border border-black/[0.05] rounded-2xl rounded-bl-sm flex gap-1 items-center">
                <div className="w-1.5 h-1.5 rounded-full bg-[#EF22DA] animate-pulse" />
                <div className="w-1.5 h-1.5 rounded-full bg-[#EF22DA] animate-pulse" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-[#EF22DA] animate-pulse" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
          <div ref={chatBottomRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-black/[0.05] shrink-0">
          <div className="flex gap-2 items-end">
            <textarea
              ref={chatInputRef}
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() } }}
              placeholder="Ask Caspar anything…"
              rows={2}
              className="flex-1 bg-black/[0.03] border border-black/[0.07] rounded-xl px-3 py-2.5 text-[13px] text-[#1c1c1e] placeholder:text-[#c7c7cc] focus:outline-none focus:border-black/[0.15] resize-none"
            />
            <button
              onClick={sendChat}
              disabled={chatLoading || !chatInput.trim()}
              className="w-8 h-8 rounded-xl bg-[#EF22DA] flex items-center justify-center text-white disabled:opacity-30 hover:opacity-90 shrink-0 self-end"
            >
              <span className="text-xs">↑</span>
            </button>
          </div>
        </div>
      </div>

    </div>
  )
}
