'use client'

import { useState, useEffect } from 'react'

type CalendarEvent = {
  id: string
  title: string
  start_time: string
  end_time: string
  location?: string
  attendees?: string[]
}

type SyncStatus = {
  google: boolean
  email?: string
  lastGmailSync?: string
  lastCalendarSync?: string
}

export default function SettingsPage() {
  const [status, setStatus] = useState<SyncStatus>({ google: false })
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [syncing, setSyncing] = useState<'gmail' | 'calendar' | null>(null)
  const [syncResult, setSyncResult] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('connected') === 'true') {
      setStatus(s => ({ ...s, google: true }))
      setSyncResult('Google connected successfully')
      window.history.replaceState({}, '', '/settings')
    }
    if (params.get('error')) {
      setSyncResult(`Error: ${params.get('error')}`)
      window.history.replaceState({}, '', '/settings')
    }
    loadEvents()
  }, [])

  async function loadEvents() {
    const res = await fetch('/api/sync/calendar')
    if (res.ok) {
      const data = await res.json()
      if (data.events?.length) {
        setEvents(data.events)
        setStatus(s => ({ ...s, google: true }))
      }
    }
  }

  async function syncGmail() {
    setSyncing('gmail')
    setSyncResult(null)
    const res = await fetch('/api/sync/gmail', { method: 'POST' })
    const data = await res.json()
    setSyncing(null)
    setSyncResult(data.ok
      ? `Gmail synced — ${data.synced} client emails saved`
      : `Gmail sync failed: ${data.error}`)
  }

  async function syncCalendar() {
    setSyncing('calendar')
    setSyncResult(null)
    const res = await fetch('/api/sync/calendar', { method: 'POST' })
    const data = await res.json()
    setSyncing(null)
    if (data.ok) {
      setSyncResult(`Calendar synced — ${data.synced} events loaded`)
      loadEvents()
    } else {
      setSyncResult(`Calendar sync failed: ${data.error}`)
    }
  }

  return (
    <div className="flex flex-col h-full bg-transparent">
      <div className="px-7 pt-7 pb-5 border-b border-black/[0.07]">
        <p className="font-mono text-[10px] uppercase tracking-widest text-[#8e8e93] mb-1">System</p>
        <h1 className="text-xl font-semibold text-[#1c1c1e] tracking-tight">Settings</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-6 max-w-xl">
        <div className="flex flex-col gap-3">
          {/* Google Integration */}
          <div className="bg-white border border-black/[0.08] rounded-xl p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="font-semibold text-[#1c1c1e] text-sm">Google</h2>
                <p className="text-xs text-[#6c6c70] mt-0.5">Gmail + Calendar access for agents</p>
              </div>
              {status.google ? (
                <span className="text-[10px] font-mono bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-full border border-emerald-500/20">
                  Connected
                </span>
              ) : (
                <a
                  href="/api/auth/google"
                  className="bg-[#EF22DA] text-black text-xs font-bold px-3 py-2 rounded-lg hover:opacity-90 transition-opacity"
                >
                  Connect Google
                </a>
              )}
            </div>

            {status.google && (
              <div className="flex gap-2 mt-2">
                <button
                  onClick={syncGmail}
                  disabled={syncing === 'gmail'}
                  className="flex-1 py-2.5 rounded-lg text-xs font-medium bg-black/[0.03] border border-black/[0.08] text-[#3a3a3c] hover:bg-black/[0.04] disabled:opacity-40 transition-colors"
                >
                  {syncing === 'gmail' ? 'Syncing...' : 'Sync Gmail'}
                </button>
                <button
                  onClick={syncCalendar}
                  disabled={syncing === 'calendar'}
                  className="flex-1 py-2.5 rounded-lg text-xs font-medium bg-black/[0.03] border border-black/[0.08] text-[#3a3a3c] hover:bg-black/[0.04] disabled:opacity-40 transition-colors"
                >
                  {syncing === 'calendar' ? 'Syncing...' : 'Sync Calendar'}
                </button>
              </div>
            )}

            {syncResult && (
              <p className={`mt-3 text-xs font-mono ${syncResult.includes('failed') || syncResult.includes('Error') ? 'text-red-400' : 'text-emerald-400'}`}>
                {syncResult}
              </p>
            )}
          </div>

          {/* Upcoming Calendar Events */}
          {events.length > 0 && (
            <div className="bg-white border border-black/[0.08] rounded-xl p-5">
              <p className="font-mono text-[10px] uppercase tracking-widest text-[#8e8e93] mb-4">Upcoming — next 2 weeks</p>
              <div className="flex flex-col divide-y divide-white/[0.05]">
                {events.map(event => {
                  const start = new Date(event.start_time)
                  const isToday = start.toDateString() === new Date().toDateString()
                  return (
                    <div key={event.id} className="flex gap-4 items-start py-3 first:pt-0 last:pb-0">
                      <div className="w-12 text-right shrink-0">
                        <div className={`text-[10px] font-mono uppercase ${isToday ? 'text-[#EF22DA]' : 'text-[#8e8e93]'}`}>
                          {start.toLocaleDateString('en-AU', { weekday: 'short' })}
                        </div>
                        <div className="text-sm font-semibold text-[#3a3a3c]">
                          {start.getDate()}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-[#1c1c1e] truncate">{event.title}</div>
                        <div className="text-[11px] text-[#6c6c70] font-mono mt-0.5">
                          {start.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                          {event.location && ` · ${event.location}`}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Obsidian */}
          <div className="bg-white border border-black/[0.08] rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-[#1c1c1e] text-sm">Obsidian</h2>
                <p className="text-xs text-[#6c6c70] mt-0.5">Two-way sync with your vault at ~/Desktop/secret</p>
              </div>
              <span className="text-[10px] font-mono bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-full border border-emerald-500/20">
                Active
              </span>
            </div>
            <p className="text-xs text-[#8e8e93] font-mono mt-3">
              Run <code className="bg-white/[0.06] px-1.5 py-0.5 rounded text-[#3a3a3c]">npm run obsidian</code> to start the watcher
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
