'use client'

import { useState, useEffect, useCallback } from 'react'

type Task = {
  gid: string
  name: string
  project: string
  projectColor: string
  due_on: string | null
  permalink_url: string
}

type Member = {
  assignee: { gid: string; name: string }
  tasks: Task[]
}

// Map Asana color names to CSS colours
const PROJECT_COLORS: Record<string, string> = {
  'dark-pink': '#F06A9B',
  'dark-green': '#4ECB71',
  'dark-blue': '#4186E0',
  'dark-red': '#E8384F',
  'dark-teal': '#02A8A8',
  'dark-brown': '#8DA3A6',
  'dark-orange': '#FD612C',
  'dark-purple': '#9B59B6',
  'light-pink': '#F8ADCF',
  'light-green': '#A4DEBB',
  'light-blue': '#9EE7E3',
  'light-red': '#FFAEA9',
  'light-teal': '#8CE9E2',
  'light-yellow': '#F8DF72',
  'light-orange': '#FFD08A',
  'light-purple': '#C0A5E3',
  'none': '#4b5563',
}

function projectColor(colorName: string) {
  return PROJECT_COLORS[colorName] ?? '#4b5563'
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function dueLabel(due_on: string | null): { label: string; urgent: boolean; overdue: boolean } {
  if (!due_on) return { label: '', urgent: false, overdue: false }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(due_on + 'T00:00:00')
  const diff = Math.floor((due.getTime() - today.getTime()) / 86400000)
  if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, urgent: false, overdue: true }
  if (diff === 0) return { label: 'Today', urgent: true, overdue: false }
  if (diff === 1) return { label: 'Tomorrow', urgent: true, overdue: false }
  if (diff <= 7) return { label: `${diff}d`, urgent: false, overdue: false }
  return { label: due_on, urgent: false, overdue: false }
}

function TaskCard({ task }: { task: Task }) {
  const due = dueLabel(task.due_on)
  const color = projectColor(task.projectColor)

  return (
    <a
      href={task.permalink_url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block bg-[#111214] border border-black/[0.07] rounded-lg px-3 py-2.5 hover:border-black/[0.14] hover:bg-[#141618] transition-all"
    >
      <div className="flex items-start gap-2">
        <div className="w-1 rounded-full shrink-0 mt-1" style={{ backgroundColor: color, height: '14px' }} />
        <div className="flex-1 min-w-0">
          <div className="text-[12px] text-[#c8ccd4] leading-snug group-hover:text-white transition-colors line-clamp-2">
            {task.name}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded"
              style={{ backgroundColor: `${color}18`, color }}
            >
              {task.project}
            </span>
            {due.label && (
              <span className={`text-[10px] font-mono ${due.overdue ? 'text-red-400' : due.urgent ? 'text-amber-400' : 'text-[#4b5563]'}`}>
                {due.label}
              </span>
            )}
          </div>
        </div>
      </div>
    </a>
  )
}

function MemberColumn({ member }: { member: Member }) {
  const name = member.assignee.name
  const tasks = member.tasks
  const isUnassigned = member.assignee.gid === 'unassigned'

  return (
    <div className="flex flex-col min-w-[240px] max-w-[280px] w-[260px]">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-3 px-1">
        {isUnassigned ? (
          <div className="w-7 h-7 rounded-full bg-black/[0.07] border border-black/[0.08] flex items-center justify-center">
            <span className="text-[10px] text-[#4b5563]">?</span>
          </div>
        ) : (
          <div className="w-7 h-7 rounded-full bg-[#EF22DA]/10 border border-[#EF22DA]/20 flex items-center justify-center shrink-0">
            <span className="text-[10px] font-bold text-[#EF22DA]">{initials(name)}</span>
          </div>
        )}
        <div>
          <div className="text-[13px] font-medium text-[#3a3a3c]">{name}</div>
          <div className="text-[11px] text-[#4b5563]">{tasks.length} task{tasks.length !== 1 ? 's' : ''}</div>
        </div>
      </div>

      {/* Tasks */}
      <div className="flex flex-col gap-1.5">
        {tasks.length === 0 ? (
          <div className="text-[11px] text-[#28282c] px-1 py-4 text-center border border-dashed border-black/[0.05] rounded-lg">
            Clear
          </div>
        ) : (
          tasks.map(task => <TaskCard key={task.gid} task={task} />)
        )}
      </div>
    </div>
  )
}

export default function BoardPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/asana/tasks')
      const data = await res.json()
      if (data.error) {
        setError(data.error)
      } else {
        setMembers(data.members ?? [])
        setLastUpdated(new Date())
        setError('')
      }
    } catch {
      setError('Failed to fetch from Asana')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    // Auto-refresh every 30 seconds
    const interval = setInterval(load, 30_000)
    return () => clearInterval(interval)
  }, [load])

  const totalTasks = members.reduce((sum, m) => sum + m.tasks.length, 0)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-black/[0.07] shrink-0">
        <div>
          <h1 className="text-[15px] font-semibold text-[#e8ecf0]">Board</h1>
          {!loading && !error && (
            <p className="text-[11px] text-[#4b5563] mt-0.5">
              {members.length} people · {totalTasks} open tasks
              {lastUpdated && ` · updated ${lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
            </p>
          )}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="text-[11px] text-[#4b5563] hover:text-[#3a3a3c] transition-colors px-2 py-1 rounded hover:bg-black/[0.04] disabled:opacity-40"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-x-auto overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-[13px] text-[#4b5563]">Loading Asana...</div>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="text-[13px] text-red-400">{error}</div>
            {error.includes('ASANA_TOKEN') && (
              <div className="text-[11px] text-[#4b5563] text-center max-w-xs">
                Add <code className="bg-white/[0.06] px-1 rounded">ASANA_TOKEN</code> to your{' '}
                <code className="bg-white/[0.06] px-1 rounded">.env.local</code> file.
                <br />
                Get it from Asana → Profile → Apps → Developer Console → Personal Access Token
              </div>
            )}
          </div>
        ) : members.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-[13px] text-[#4b5563]">No open tasks found</div>
          </div>
        ) : (
          <div className="flex gap-4 p-6 min-h-full items-start">
            {members.map(member => (
              <MemberColumn key={member.assignee.gid} member={member} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
