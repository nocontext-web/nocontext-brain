'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'

type Client = {
  id: string
  name: string
  website?: string
  instagram?: string
  tiktok?: string
  brief?: string
  notes?: string
  status?: string
  monthly_value?: number
  next_action?: string
}

type Email = {
  id: string
  subject: string
  from_address: string
  received_at: string
  priority: string
  needs_attention: boolean
  reason: string
  suggested_reply?: string
  status: string
}

type Meeting = {
  id: string
  content: string
  type: string
  related_client: string
  created_at: string
  tags?: string[]
}

type CalEvent = {
  id: string
  title: string
  start_time: string
  end_time: string
  location?: string
  attendees?: string[]
}

type Todo = {
  id: string
  content: string
  created_at: string
}

type VideoAnalysis = {
  hook_type: string
  hook_line: string
  format: string
  what_works: string[]
  why_it_pops: string
  angles_for_client: string[]
}

const STATUS_OPTIONS = ['active', 'prospect', 'paused', 'churned']
const STATUS_STYLES: Record<string, { dot: string; label: string }> = {
  active:   { dot: 'bg-emerald-400', label: 'Active' },
  prospect: { dot: 'bg-amber-400',   label: 'Prospect' },
  paused:   { dot: 'bg-zinc-300',    label: 'Paused' },
  churned:  { dot: 'bg-red-300',     label: 'Churned' },
}

function SectionHeader({ label, count }: { label: string; count?: number }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <p className="font-mono text-[10px] uppercase tracking-widest text-[#aeaeb2]">{label}</p>
      {count !== undefined && count > 0 && (
        <span className="text-[10px] font-mono text-[#c7c7cc]">{count}</span>
      )}
      <div className="flex-1 h-px bg-black/[0.05]" />
    </div>
  )
}

function dateStr(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', {
    weekday: 'short', day: 'numeric', month: 'short',
    timeZone: 'Australia/Sydney',
  })
}

function timeStr(iso: string) {
  return new Date(iso).toLocaleTimeString('en-AU', {
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Australia/Sydney',
  })
}

function relativeDate(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return dateStr(iso)
}

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const [client, setClient] = useState<Client | null>(null)
  const [emails, setEmails] = useState<Email[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [calendar, setCalendar] = useState<CalEvent[]>([])
  const [todos, setTodos] = useState<Todo[]>([])
  const [activityLoaded, setActivityLoaded] = useState(false)

  // Editing state
  const [editingNextAction, setEditingNextAction] = useState(false)
  const [nextActionDraft, setNextActionDraft] = useState('')
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')
  const [editingStatus, setEditingStatus] = useState(false)
  const [editingBrief, setEditingBrief] = useState(false)
  const [briefDraft, setBriefDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [briefSaved, setBriefSaved] = useState(false)

  // Video analysis
  const [videoUrl, setVideoUrl] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [videoAnalysis, setVideoAnalysis] = useState<VideoAnalysis | null>(null)
  const [videoError, setVideoError] = useState('')

  useEffect(() => {
    fetch(`/api/clients/${id}`)
      .then(r => r.json())
      .then((c: Client) => {
        setClient(c)
        setBriefDraft(c.brief ?? '')
        setNotesDraft(c.notes ?? '')
        setNextActionDraft(c.next_action ?? '')
      })

    fetch(`/api/clients/${id}/activity`)
      .then(r => r.json())
      .then(data => {
        setEmails(data.emails ?? [])
        setMeetings(data.meetings ?? [])
        setCalendar(data.calendar ?? [])
        setTodos(data.todos ?? [])
        setActivityLoaded(true)
      })
  }, [id])

  async function saveField(field: string, value: string | number) {
    setSaving(true)
    const updated = await fetch(`/api/clients/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    }).then(r => r.json())
    setClient(updated)
    setSaving(false)
  }

  async function saveBrief() {
    setSaving(true)
    await fetch(`/api/clients/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brief: briefDraft }),
    })
    setClient(prev => prev ? { ...prev, brief: briefDraft } : prev)
    setBriefSaved(true)
    setEditingBrief(false)
    setSaving(false)
    setTimeout(() => setBriefSaved(false), 2000)
  }

  async function analyzeVideo() {
    if (!videoUrl.trim()) return
    setAnalyzing(true)
    setVideoError('')
    setVideoAnalysis(null)
    const res = await fetch(`/api/clients/${id}/analyze-video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: videoUrl.trim() }),
    }).then(r => r.json())
    if (res.ok) {
      setVideoAnalysis(res.analysis)
    } else {
      setVideoError(res.error ?? 'Analysis failed')
    }
    setAnalyzing(false)
  }

  if (!client) {
    return (
      <div className="p-8 flex flex-col gap-3 animate-pulse">
        <div className="h-3 bg-black/[0.04] rounded w-16" />
        <div className="h-7 bg-black/[0.04] rounded w-48" />
        <div className="h-4 bg-black/[0.04] rounded w-64 mt-2" />
      </div>
    )
  }

  const status = STATUS_STYLES[client.status ?? 'active'] ?? STATUS_STYLES.active
  const igClean = client.instagram?.replace('@', '')
  const ttClean = client.tiktok?.replace('@', '')
  const urgentEmails = emails.filter(e => e.priority === 'high' && e.status === 'unread')
  const otherEmails = emails.filter(e => !(e.priority === 'high' && e.status === 'unread'))

  return (
    <div className="flex h-full">

      {/* Sidebar */}
      <div className="w-64 shrink-0 border-r border-black/[0.06] bg-white/60 flex flex-col overflow-y-auto">
        <div className="p-5 border-b border-black/[0.05]">
          <Link href="/clients" className="font-mono text-[10px] uppercase tracking-widest text-[#aeaeb2] hover:text-[#6c6c70] flex items-center gap-1 mb-5 w-fit">
            ← Clients
          </Link>

          {/* Avatar + name */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-11 h-11 rounded-2xl bg-[#EF22DA]/[0.08] border border-[#EF22DA]/[0.15] flex items-center justify-center text-lg font-bold text-[#EF22DA] shrink-0">
              {client.name[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <h1 className="text-[15px] font-semibold text-[#1c1c1e] leading-tight truncate">{client.name}</h1>
              {client.monthly_value && (
                <p className="text-[12px] text-[#6c6c70]">${client.monthly_value.toLocaleString()}<span className="text-[#aeaeb2]">/mo</span></p>
              )}
            </div>
          </div>

          {/* Status */}
          {editingStatus ? (
            <div className="flex flex-col gap-1 mb-4 p-2 bg-white border border-black/[0.07] rounded-xl">
              {STATUS_OPTIONS.map(s => (
                <button
                  key={s}
                  onClick={async () => {
                    await saveField('status', s)
                    setEditingStatus(false)
                  }}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-[12px] text-left hover:bg-black/[0.04] ${client.status === s ? 'font-semibold' : ''}`}
                >
                  <div className={`w-1.5 h-1.5 rounded-full ${STATUS_STYLES[s].dot}`} />
                  {STATUS_STYLES[s].label}
                </button>
              ))}
            </div>
          ) : (
            <button
              onClick={() => setEditingStatus(true)}
              className="flex items-center gap-2 mb-4 px-2 py-1 rounded-lg hover:bg-black/[0.04] transition-colors -ml-2"
            >
              <div className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
              <span className="text-[11px] font-mono text-[#6c6c70]">{status.label}</span>
            </button>
          )}

          {/* Handles */}
          <div className="flex flex-col gap-1.5 mb-4">
            {client.instagram && (
              <a href={`https://instagram.com/${igClean}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-2.5 py-2 bg-black/[0.03] border border-black/[0.05] rounded-xl hover:border-black/[0.10] group transition-all">
                <span className="font-mono text-[9px] uppercase tracking-widest text-[#aeaeb2] w-4">IG</span>
                <span className="text-[11px] text-[#3a3a3c] font-mono group-hover:text-[#EF22DA] transition-colors truncate">{client.instagram}</span>
                <span className="ml-auto text-[#c7c7cc] text-xs shrink-0">↗</span>
              </a>
            )}
            {client.tiktok && (
              <a href={`https://tiktok.com/@${ttClean}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-2.5 py-2 bg-black/[0.03] border border-black/[0.05] rounded-xl hover:border-black/[0.10] group transition-all">
                <span className="font-mono text-[9px] uppercase tracking-widest text-[#aeaeb2] w-4">TT</span>
                <span className="text-[11px] text-[#3a3a3c] font-mono group-hover:text-[#EF22DA] transition-colors truncate">{client.tiktok}</span>
                <span className="ml-auto text-[#c7c7cc] text-xs shrink-0">↗</span>
              </a>
            )}
            {client.website && (
              <a href={client.website} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-2.5 py-2 bg-black/[0.03] border border-black/[0.05] rounded-xl hover:border-black/[0.10] group transition-all">
                <span className="font-mono text-[9px] uppercase tracking-widest text-[#aeaeb2] w-4">↗</span>
                <span className="text-[11px] text-[#3a3a3c] font-mono truncate group-hover:text-[#EF22DA] transition-colors">
                  {client.website.replace(/https?:\/\/(www\.)?/, '')}
                </span>
              </a>
            )}
          </div>
        </div>

        {/* Context notes */}
        <div className="p-5 border-b border-black/[0.05]">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#aeaeb2] mb-2">Notes</p>
          {editingNotes ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={notesDraft}
                onChange={e => setNotesDraft(e.target.value)}
                placeholder="Who's the contact, what's worked, what to avoid…"
                rows={5}
                autoFocus
                className="w-full bg-white border border-black/[0.07] rounded-xl px-3 py-2 text-[12px] text-[#1c1c1e] placeholder:text-[#aeaeb2] focus:outline-none resize-none leading-relaxed"
              />
              <div className="flex gap-2">
                <button
                  onClick={async () => { await saveField('notes', notesDraft); setEditingNotes(false) }}
                  disabled={saving}
                  className="text-[11px] bg-[#EF22DA] text-white font-semibold px-3 py-1 rounded-lg disabled:opacity-40"
                >
                  {saving ? '…' : 'Save'}
                </button>
                <button onClick={() => { setNotesDraft(client.notes ?? ''); setEditingNotes(false) }} className="text-[11px] text-[#aeaeb2]">Cancel</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setEditingNotes(true)}
              className="w-full text-left px-3 py-2.5 bg-black/[0.02] border border-dashed border-black/[0.06] rounded-xl text-[12px] text-[#aeaeb2] hover:border-black/[0.12] hover:text-[#6c6c70] transition-all leading-relaxed"
            >
              {client.notes || '+ Add context notes…'}
            </button>
          )}
        </div>

        {/* Quick links */}
        <div className="p-5">
          <Link
            href={`/ideate?clientId=${id}`}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#EF22DA]/[0.07] border border-[#EF22DA]/[0.15] rounded-xl text-[12px] font-semibold text-[#EF22DA] hover:bg-[#EF22DA]/[0.12] transition-all"
          >
            Ideate →
          </Link>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-8 py-8 flex flex-col gap-10">

          {/* NEXT ACTION */}
          <section>
            <SectionHeader label="Next Action" />
            {editingNextAction ? (
              <div className="flex gap-2 items-start">
                <input
                  value={nextActionDraft}
                  onChange={e => setNextActionDraft(e.target.value)}
                  onKeyDown={async e => {
                    if (e.key === 'Enter') {
                      await saveField('next_action', nextActionDraft)
                      setClient(prev => prev ? { ...prev, next_action: nextActionDraft } : prev)
                      setEditingNextAction(false)
                    }
                    if (e.key === 'Escape') setEditingNextAction(false)
                  }}
                  autoFocus
                  placeholder="What needs to happen next with this client?"
                  className="flex-1 bg-white border border-black/[0.10] rounded-xl px-4 py-3 text-[14px] text-[#1c1c1e] placeholder:text-[#aeaeb2] focus:outline-none focus:border-[#EF22DA]/40"
                />
                <button
                  onClick={async () => {
                    await saveField('next_action', nextActionDraft)
                    setClient(prev => prev ? { ...prev, next_action: nextActionDraft } : prev)
                    setEditingNextAction(false)
                  }}
                  className="px-4 py-3 bg-[#EF22DA] text-white text-[13px] font-semibold rounded-xl hover:opacity-90"
                >
                  Save
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setNextActionDraft(client.next_action ?? ''); setEditingNextAction(true) }}
                className={`w-full text-left px-4 py-4 rounded-2xl border transition-all ${
                  client.next_action
                    ? 'bg-amber-50 border-amber-100 hover:border-amber-200'
                    : 'bg-black/[0.02] border-dashed border-black/[0.07] hover:border-black/[0.14]'
                }`}
              >
                {client.next_action ? (
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                    <span className="text-[14px] text-[#1c1c1e] leading-snug">{client.next_action}</span>
                  </div>
                ) : (
                  <span className="text-[13px] text-[#aeaeb2]">+ Set next action…</span>
                )}
              </button>
            )}
          </section>

          {/* UPCOMING MEETINGS */}
          {(calendar.length > 0 || !activityLoaded) && (
            <section>
              <SectionHeader label="Upcoming" count={calendar.length} />
              {!activityLoaded ? (
                <div className="flex flex-col gap-2">
                  {[1,2].map(i => <div key={i} className="h-14 bg-black/[0.03] rounded-xl animate-pulse" />)}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {calendar.map(ev => (
                    <div key={ev.id} className="flex items-center gap-4 px-4 py-3 bg-white border border-black/[0.06] rounded-xl">
                      <div className="text-center shrink-0 w-10">
                        <p className="text-[10px] font-mono text-[#EF22DA]/70 uppercase">
                          {new Date(ev.start_time).toLocaleDateString('en-AU', { month: 'short', timeZone: 'Australia/Sydney' })}
                        </p>
                        <p className="text-[18px] font-semibold text-[#1c1c1e] leading-tight">
                          {new Date(ev.start_time).getDate()}
                        </p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-[#1c1c1e] truncate">{ev.title}</p>
                        <p className="text-[11px] text-[#aeaeb2] mt-0.5">
                          {timeStr(ev.start_time)}{ev.location ? ` · ${ev.location}` : ''}
                        </p>
                      </div>
                      {ev.attendees && ev.attendees.length > 1 && (
                        <span className="text-[10px] font-mono text-[#c7c7cc] shrink-0">{ev.attendees.length} people</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* EMAILS */}
          {(emails.length > 0 || !activityLoaded) && (
            <section>
              <SectionHeader label="Emails" count={emails.length} />
              {!activityLoaded ? (
                <div className="flex flex-col gap-2">
                  {[1,2].map(i => <div key={i} className="h-16 bg-black/[0.03] rounded-xl animate-pulse" />)}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {[...urgentEmails, ...otherEmails].map(email => (
                    <div
                      key={email.id}
                      className={`px-4 py-3.5 rounded-xl border ${
                        email.priority === 'high' && email.status === 'unread'
                          ? 'bg-white border-[#EF22DA]/20 shadow-[0_1px_4px_rgba(239,34,218,0.06)]'
                          : 'bg-white border-black/[0.06]'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${email.priority === 'high' ? 'bg-[#EF22DA]' : 'bg-black/[0.12]'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <p className="text-[13px] font-medium text-[#1c1c1e] truncate">{email.subject}</p>
                            <span className="text-[10px] text-[#aeaeb2] shrink-0">{relativeDate(email.received_at)}</span>
                          </div>
                          <p className="text-[11px] text-[#aeaeb2] mt-0.5">{email.from_address.replace(/<.*?>/, '').trim()}</p>
                          {email.suggested_reply && (
                            <p className="text-[12px] text-[#EF22DA]/70 mt-1.5 leading-snug">→ {email.suggested_reply}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* MEETING NOTES */}
          {(meetings.length > 0 || !activityLoaded) && (
            <section>
              <SectionHeader label="Meeting Notes" count={meetings.length} />
              {!activityLoaded ? (
                <div className="flex flex-col gap-2">
                  {[1,2,3].map(i => <div key={i} className="h-10 bg-black/[0.03] rounded-xl animate-pulse" />)}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {meetings.map(m => (
                    <div key={m.id} className="flex items-start gap-3 px-4 py-3 bg-white border border-black/[0.06] rounded-xl">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-300 mt-1.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-[#3a3a3c] leading-snug">{m.content}</p>
                        <p className="text-[10px] text-[#c7c7cc] mt-1">{relativeDate(m.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* OPEN TODOS */}
          {todos.length > 0 && (
            <section>
              <SectionHeader label="Open Todos" count={todos.length} />
              <div className="flex flex-col gap-1.5">
                {todos.map(t => (
                  <div key={t.id} className="flex items-start gap-3 px-4 py-3 bg-white border border-black/[0.06] rounded-xl">
                    <div className="w-1.5 h-1.5 rounded-full border border-[#EF22DA]/40 mt-1.5 shrink-0" />
                    <p className="text-[13px] text-[#6c6c70] leading-snug">{t.content}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* BRAND BRIEF */}
          <section>
            <div className="flex items-center gap-3 mb-4">
              <p className="font-mono text-[10px] uppercase tracking-widest text-[#aeaeb2]">Brand Brief</p>
              <div className="flex-1 h-px bg-black/[0.05]" />
              <button
                onClick={() => setEditingBrief(!editingBrief)}
                className="text-[10px] font-mono text-[#aeaeb2] hover:text-[#6c6c70] transition-colors"
              >
                {editingBrief ? 'Cancel' : 'Edit'}
              </button>
            </div>
            {editingBrief ? (
              <div>
                <textarea
                  value={briefDraft}
                  onChange={e => setBriefDraft(e.target.value)}
                  placeholder="Write or paste the brand brief here…"
                  className="w-full h-64 bg-white border border-black/[0.08] rounded-2xl p-5 text-[13px] text-[#3a3a3c] leading-relaxed resize-none focus:outline-none focus:border-black/[0.15] placeholder:text-[#aeaeb2] shadow-[0_1px_4px_rgba(0,0,0,0.04)]"
                />
                <button
                  onClick={saveBrief}
                  disabled={saving}
                  className="mt-3 bg-[#EF22DA] text-white text-[13px] font-semibold px-5 py-2.5 rounded-xl hover:opacity-90 disabled:opacity-40"
                >
                  {saving ? 'Saving…' : briefSaved ? '✓ Saved' : 'Save Brief'}
                </button>
              </div>
            ) : (
              <div
                onClick={() => setEditingBrief(true)}
                className="cursor-text px-5 py-4 bg-black/[0.02] border border-dashed border-black/[0.06] rounded-2xl hover:border-black/[0.12] transition-all"
              >
                {client.brief ? (
                  <p className="text-[13px] text-[#6c6c70] leading-relaxed whitespace-pre-wrap line-clamp-6">{client.brief}</p>
                ) : (
                  <p className="text-[13px] text-[#c7c7cc] italic">No brief yet — click to add one</p>
                )}
              </div>
            )}
          </section>

          {/* VIDEO ANALYSIS */}
          <section>
            <SectionHeader label="Video Analysis" />
            <div className="flex flex-col gap-4">
              <div className="flex gap-2">
                <input
                  value={videoUrl}
                  onChange={e => setVideoUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && analyzeVideo()}
                  placeholder="Paste a YouTube URL or video link…"
                  className="flex-1 bg-white border border-black/[0.07] rounded-xl px-4 py-2.5 text-[13px] text-[#1c1c1e] placeholder:text-[#aeaeb2] focus:outline-none focus:border-black/[0.15] font-mono"
                />
                <button
                  onClick={analyzeVideo}
                  disabled={analyzing || !videoUrl.trim()}
                  className="px-4 py-2.5 bg-[#EF22DA] text-white text-[13px] font-semibold rounded-xl hover:opacity-90 disabled:opacity-30 shrink-0"
                >
                  {analyzing ? 'Analysing…' : 'Analyse'}
                </button>
              </div>

              {videoError && (
                <p className="text-[12px] text-red-400 px-1">{videoError}</p>
              )}

              {videoAnalysis && (
                <div className="bg-white border border-black/[0.07] rounded-2xl p-5 flex flex-col gap-4 shadow-[0_1px_4px_rgba(0,0,0,0.05)]">
                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-widest text-[#aeaeb2] mb-1">Hook Type</p>
                    <p className="text-[13px] font-semibold text-[#1c1c1e]">{videoAnalysis.hook_type}</p>
                    {videoAnalysis.hook_line && (
                      <p className="text-[12px] text-[#6c6c70] mt-1 italic">"{videoAnalysis.hook_line}"</p>
                    )}
                  </div>

                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-widest text-[#aeaeb2] mb-1.5">Why It Pops</p>
                    <p className="text-[13px] text-[#3a3a3c] leading-snug">{videoAnalysis.why_it_pops}</p>
                  </div>

                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-widest text-[#aeaeb2] mb-2">What Works</p>
                    <div className="flex flex-col gap-1.5">
                      {videoAnalysis.what_works.map((w, i) => (
                        <div key={i} className="flex items-start gap-2">
                          <div className="w-1 h-1 rounded-full bg-[#EF22DA]/50 mt-[6px] shrink-0" />
                          <p className="text-[12px] text-[#6c6c70] leading-snug">{w}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="font-mono text-[9px] uppercase tracking-widest text-[#aeaeb2] mb-2">Angles for {client.name}</p>
                    <div className="flex flex-col gap-2">
                      {videoAnalysis.angles_for_client.map((a, i) => (
                        <div key={i} className="flex items-start gap-2 px-3 py-2.5 bg-[#EF22DA]/[0.04] border border-[#EF22DA]/[0.10] rounded-xl">
                          <span className="font-mono text-[10px] text-[#EF22DA]/50 mt-[2px] shrink-0">{i + 1}</span>
                          <p className="text-[12px] text-[#3a3a3c] leading-snug">{a}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          <div className="h-8" />
        </div>
      </div>
    </div>
  )
}
