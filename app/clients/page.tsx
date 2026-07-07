'use client'

import { useState, useEffect, useRef } from 'react'

// ─── Types ──────────────────────────────────────────────────────────────────

type Client = {
  id: string; name: string; website?: string; instagram?: string; tiktok?: string
  status?: string; monthly_value?: number; next_action?: string; context_notes?: string; created_at: string
  services?: string[]
}
type Todo    = { id: string; content: string; done?: boolean; created_at: string }
type Email   = { id: string; subject: string; from_address: string; received_at: string; priority: string; needs_attention: boolean; reason?: string; suggested_reply?: string; status: string }
type Meeting = { id: string; content: string; related_client: string; created_at: string }
type Parsed  = { health: string; blocker: string; assigned: string; scope: string; notes: string }

// ─── context_notes codec ────────────────────────────────────────────────────

function parseNotes(raw?: string): Parsed {
  if (!raw?.trim()) return { health: '', blocker: '', assigned: '', scope: '', notes: '' }
  const out: Record<string, string> = {}; let cur = '', buf: string[] = []
  function flush() { if (cur) out[cur] = buf.join('\n').trim() }
  for (const line of raw.split('\n')) {
    const m = line.match(/^(HEALTH|BLOCKER|ASSIGNED|SCOPE|NOTES):(.*)$/)
    if (m) { flush(); cur = m[1]; buf = [m[2]] } else if (cur) buf.push(line)
  }
  flush()
  const { HEALTH: health='', BLOCKER: blocker='', ASSIGNED: assigned='', SCOPE: scope='', NOTES: notes='' } = out
  if (!health && !blocker && !assigned && !scope && !notes) return { health:'', blocker:'', assigned:'', scope:'', notes: raw.trim() }
  return { health, blocker, assigned, scope, notes }
}
function encodeNotes(p: Parsed) {
  const parts: string[] = []
  if (p.health)          parts.push(`HEALTH:${p.health}`)
  if (p.blocker.trim())  parts.push(`BLOCKER:${p.blocker.trim()}`)
  if (p.assigned.trim()) parts.push(`ASSIGNED:${p.assigned.trim()}`)
  if (p.scope.trim())    parts.push(`SCOPE:${p.scope.trim()}`)
  if (p.notes.trim())    parts.push(`NOTES:${p.notes.trim()}`)
  return parts.join('\n')
}

// ─── Services ───────────────────────────────────────────────────────────────

const SERVICE_TAGS = ['Creator Management', 'Ads Management', 'Content', 'Video Production', 'Creative Strategy', 'Brand Strategy', 'Community Management']

// ─── Columns ────────────────────────────────────────────────────────────────

const COLS = [
  { key:'blocked',         label:'Blocked',         dot:'bg-red-400',     header:'border-red-200 bg-red-50/60',       ring:'ring-red-300',    cnt:'bg-red-100 text-red-500',        accent:'border-l-red-400' },
  { key:'needs-attention', label:'Needs Attention',  dot:'bg-amber-400',   header:'border-amber-200 bg-amber-50/60',   ring:'ring-amber-300',  cnt:'bg-amber-100 text-amber-600',    accent:'border-l-amber-400' },
  { key:'on-track',        label:'On Track',         dot:'bg-emerald-400', header:'border-emerald-200 bg-emerald-50/60', ring:'ring-emerald-300',cnt:'bg-emerald-100 text-emerald-700', accent:'border-l-emerald-400' },
  { key:'prospect',        label:'Prospect',         dot:'bg-violet-400',  header:'border-violet-200 bg-violet-50/60', ring:'ring-violet-300', cnt:'bg-violet-100 text-violet-600',  accent:'border-l-violet-400' },
  { key:'paused',          label:'Paused',           dot:'bg-zinc-300',    header:'border-zinc-200 bg-zinc-50/60',     ring:'ring-zinc-300',   cnt:'bg-zinc-100 text-zinc-500',      accent:'border-l-zinc-300' },
]

function getCol(c: Client, urgentSet: Set<string>) {
  const s = c.status ?? 'active'
  if (s === 'paused' || s === 'churned') return 'paused'
  if (s === 'prospect') return 'prospect'
  const { health } = parseNotes(c.context_notes)
  if (health === 'blocked') return 'blocked'
  if (health === 'needs-attention' || urgentSet.has(c.name.toLowerCase())) return 'needs-attention'
  return 'on-track'
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const sbH = () => ({ apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' })
async function patchClient(id: string, body: Record<string, unknown>) {
  await fetch(`/api/clients/${id}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) })
}
function relTime(iso: string) {
  const d = Date.now()-new Date(iso).getTime(), h=Math.floor(d/3600000), days=Math.floor(d/86400000)
  if (h<1) return 'now'; if (h<24) return `${h}h`; if (days<7) return `${days}d`
  return new Date(iso).toLocaleDateString('en-AU',{day:'numeric',month:'short'})
}
function initials(name: string) { return name.split(/[\s,]+/).filter(Boolean).slice(0,2).map(p=>p[0].toUpperCase()).join('') }
function fmtMRR(n: number) { return n >= 1000 ? `$${(n/1000).toFixed(n%1000===0?0:1)}k` : `$${n}` }
function clientTodos(name: string, todos: Todo[]) {
  return todos.filter(t => t.content.toLowerCase().includes(name.toLowerCase()))
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function ClientsPage() {
  const [clients,   setClients]   = useState<Client[]>([])
  const [allTodos,  setAllTodos]  = useState<Todo[]>([])
  const [urgentSet, setUrgentSet] = useState<Set<string>>(new Set())
  const [panelId,   setPanelId]   = useState<string|null>(null)
  const [dragging,  setDragging]  = useState<string|null>(null)
  const [overCol,   setOverCol]   = useState<string|null>(null)
  const [showNew,   setShowNew]   = useState(false)
  const [newName,   setNewName]   = useState('')
  const [creating,  setCreating]  = useState(false)
  const [costs,     setCosts]     = useState(0)
  const [editCosts, setEditCosts] = useState(false)
  const [costsInput,setCostsInput]= useState('')

  useEffect(() => {
    fetch('/api/clients').then(r=>r.json()).then(setClients)
    fetch(`${SB_URL}/rest/v1/todos?done=eq.false&order=created_at.asc&limit=200`,{headers:sbH()})
      .then(r=>r.json()).then(d=>setAllTodos(Array.isArray(d)?d:[]))
    fetch(`${SB_URL}/rest/v1/email_inbox?needs_attention=eq.true&status=eq.unread&priority=eq.high&select=related_client`,{headers:sbH()})
      .then(r=>r.json()).then((rows:{related_client:string}[])=>
        setUrgentSet(new Set(rows.map(r=>r.related_client?.toLowerCase()).filter(Boolean)))
      )
    const saved = localStorage.getItem('nc_costs')
    if (saved) setCosts(Number(saved))
  }, [])

  function updateLocal(id: string, patch: Partial<Client>) { setClients(cs=>cs.map(c=>c.id===id?{...c,...patch}:c)) }

  async function completeTodo(id: string) {
    await fetch(`${SB_URL}/rest/v1/todos?id=eq.${id}`,{method:'PATCH',headers:{...sbH(),Prefer:'return=minimal'},body:JSON.stringify({done:true})})
    setAllTodos(ts=>ts.filter(t=>t.id!==id))
  }

  async function addTodoForClient(content: string, clientName: string) {
    const res = await fetch(`${SB_URL}/rest/v1/todos`,{method:'POST',headers:{...sbH(),Prefer:'return=representation'},body:JSON.stringify({content:`${content} [${clientName}]`,done:false})})
    const [created] = await res.json()
    if (created) setAllTodos(ts=>[...ts,created])
  }

  async function createClient() {
    if (!newName.trim()) return
    setCreating(true)
    const res = await fetch('/api/clients',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:newName.trim(),status:'active'})})
    const client = await res.json()
    setClients(cs=>[client,...cs]); setNewName(''); setShowNew(false); setCreating(false)
    setPanelId(client.id)
  }

  function saveCosts() {
    const v = Number(costsInput)||0; setCosts(v); localStorage.setItem('nc_costs',String(v)); setEditCosts(false)
  }

  function onDragStart(id: string) { setDragging(id) }
  function onDragEnd() { setDragging(null); setOverCol(null) }
  async function onDrop(colKey: string) {
    if (!dragging) return; setOverCol(null); setDragging(null)
    const client = clients.find(c=>c.id===dragging); if (!client) return
    const parsed = parseNotes(client.context_notes)
    if (colKey==='prospect') {
      const n=encodeNotes({...parsed,health:''}); await patchClient(client.id,{status:'prospect',context_notes:n}); updateLocal(client.id,{status:'prospect',context_notes:n})
    } else if (colKey==='paused') {
      const n=encodeNotes({...parsed,health:''}); await patchClient(client.id,{status:'paused',context_notes:n}); updateLocal(client.id,{status:'paused',context_notes:n})
    } else {
      const h:{[k:string]:string}={blocked:'blocked','needs-attention':'needs-attention','on-track':'on-track'}
      const newHealth=h[colKey]??''; const n=encodeNotes({...parsed,health:newHealth})
      const newStatus=(client.status==='paused'||client.status==='prospect')?'active':(client.status??'active')
      await patchClient(client.id,{status:newStatus,context_notes:n}); updateLocal(client.id,{status:newStatus,context_notes:n})
    }
  }

  const panelClient = clients.find(c=>c.id===panelId)??null
  const activeMRR   = clients.filter(c=>c.status==='active'||!c.status).reduce((s,c)=>s+(c.monthly_value??0),0)
  const net         = activeMRR - costs

  return (
    <div className="flex h-full overflow-hidden bg-[#f5f5f7]">
      <div className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${panelClient?'mr-[420px]':''}`}>

        {/* ── Top bar ─────────────────────────────────────── */}
        <div className="shrink-0 px-6 pt-4 pb-0 bg-white border-b border-black/[0.06]">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-[15px] font-semibold text-[#1c1c1e] tracking-tight">Clients</h1>
            <button onClick={()=>setShowNew(v=>!v)}
              className="flex items-center gap-1.5 bg-[#EF22DA] text-white text-[12px] font-semibold px-3.5 py-2 rounded-xl hover:opacity-85 shadow-sm">
              <span className="text-[16px] leading-none font-light">+</span> New client
            </button>
          </div>

          {/* ── Financials strip ────────────────────────── */}
          <div className="flex items-stretch gap-px bg-black/[0.06] rounded-2xl overflow-hidden mb-4 border border-black/[0.06]">
            <FinStat label="MRR" value={`$${activeMRR.toLocaleString()}`} sub={`${clients.filter(c=>c.status==='active'||!c.status).length} active`} dark />
            <FinStat
              label="Costs"
              value={editCosts
                ? <input autoFocus value={costsInput} onChange={e=>setCostsInput(e.target.value)} onBlur={saveCosts} onKeyDown={e=>e.key==='Enter'&&saveCosts()} type="number" placeholder="0" className="w-24 bg-transparent outline-none text-[22px] font-semibold text-[#1c1c1e] placeholder:text-[#c7c7cc]" />
                : <span onClick={()=>{setCostsInput(String(costs||'')); setEditCosts(true)}} className="cursor-text hover:opacity-70">{costs ? `$${costs.toLocaleString()}` : <span className="text-[#c7c7cc] text-[16px]">+ add</span>}</span>
              }
              sub={<span onClick={()=>{setCostsInput(String(costs||'')); setEditCosts(true)}} className="cursor-text text-[#aeaeb2] hover:text-[#6c6c70]">{editCosts ? 'enter to save' : 'click to edit'}</span>}
            />
            <FinStat
              label="Net"
              value={`${net>=0?'':'-'}$${Math.abs(net).toLocaleString()}`}
              sub={costs ? `${Math.round((net/Math.max(activeMRR,1))*100)}% margin` : '—'}
              valueClass={net >= 0 ? 'text-emerald-500' : 'text-red-500'}
            />
            <FinStat label="Pipeline" value={`$${clients.filter(c=>c.status==='prospect').reduce((s,c)=>s+(c.monthly_value??0),0).toLocaleString()}`} sub={`${clients.filter(c=>c.status==='prospect').length} prospects`} />
          </div>

          {/* Quick-add */}
          {showNew && (
            <div className="flex items-center gap-3 pb-4">
              <input autoFocus value={newName} onChange={e=>setNewName(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter')createClient();if(e.key==='Escape'){setShowNew(false);setNewName('')}}}
                placeholder="Client name… (Enter to create)"
                className="flex-1 max-w-sm bg-black/[0.03] border border-black/[0.08] rounded-xl px-4 py-2.5 text-[13px] text-[#1c1c1e] placeholder:text-[#c7c7cc] outline-none focus:border-[#EF22DA]/30" />
              <button onClick={createClient} disabled={creating||!newName.trim()}
                className="bg-[#EF22DA] text-white text-[12px] font-semibold px-4 py-2.5 rounded-xl disabled:opacity-30 hover:opacity-85">
                {creating?'…':'Create'}
              </button>
              <button onClick={()=>{setShowNew(false);setNewName('')}} className="text-[12px] text-[#aeaeb2] hover:text-[#6c6c70]">Cancel</button>
            </div>
          )}
        </div>

        {/* ── Board ───────────────────────────────────────── */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex gap-4 h-full px-6 py-5 min-w-max">
            {COLS.map(col => {
              const colClients = clients.filter(c=>getCol(c,urgentSet)===col.key)
              const colMRR     = colClients.reduce((s,c)=>s+(c.monthly_value??0),0)
              const isOver     = overCol===col.key
              return (
                <div key={col.key}
                  className={`flex flex-col w-[280px] shrink-0 rounded-2xl border transition-all duration-150 ${col.header} ${isOver?`ring-2 ${col.ring} ring-offset-1`:''}`}
                  onDragOver={e=>{e.preventDefault();setOverCol(col.key)}}
                  onDragLeave={()=>setOverCol(null)}
                  onDrop={()=>onDrop(col.key)}
                >
                  {/* Column header */}
                  <div className="flex items-center justify-between px-4 py-3 shrink-0">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${col.dot}`} />
                      <span className="text-[12px] font-semibold text-[#3c3c3e]">{col.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {colMRR > 0 && <span className="text-[10px] font-mono text-[#aeaeb2]">${colMRR.toLocaleString()}</span>}
                      <span className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded-md ${col.cnt}`}>{colClients.length}</span>
                    </div>
                  </div>

                  {/* Cards */}
                  <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-3">
                    {colClients.length===0 && (
                      <div className={`border-2 border-dashed rounded-xl h-14 flex items-center justify-center ${isOver?'opacity-50 border-current':'border-black/[0.06]'}`}>
                        <p className="text-[10px] text-[#c7c7cc]">drop here</p>
                      </div>
                    )}
                    {colClients.map(c => (
                      <ClientCard
                        key={c.id} client={c} urgentSet={urgentSet}
                        todos={clientTodos(c.name, allTodos)}
                        isSelected={panelId===c.id}
                        isDragging={dragging===c.id}
                        colAccent={col.accent}
                        onClick={()=>setPanelId(panelId===c.id?null:c.id)}
                        onDragStart={()=>onDragStart(c.id)}
                        onDragEnd={onDragEnd}
                        onCompleteTodo={completeTodo}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Panel ───────────────────────────────────────────── */}
      {panelClient && (
        <ClientPanel
          client={panelClient}
          todos={clientTodos(panelClient.name, allTodos)}
          onUpdate={patch=>updateLocal(panelClient.id,patch)}
          onClose={()=>setPanelId(null)}
          onCompleteTodo={completeTodo}
          onAddTodo={(content)=>addTodoForClient(content,panelClient.name)}
        />
      )}
    </div>
  )
}

// ─── Financial stat cell ─────────────────────────────────────────────────────

function FinStat({ label, value, sub, dark, valueClass }: {
  label: string; value: React.ReactNode; sub?: React.ReactNode; dark?: boolean; valueClass?: string
}) {
  return (
    <div className={`flex-1 px-5 py-4 flex flex-col gap-0.5 ${dark ? 'bg-[#1c1c1e]' : 'bg-white'}`}>
      <p className={`text-[9px] font-mono uppercase tracking-widest ${dark ? 'text-white/30' : 'text-[#aeaeb2]'}`}>{label}</p>
      <p className={`text-[22px] font-semibold tracking-tight leading-tight ${dark ? 'text-[#EF22DA]' : (valueClass ?? 'text-[#1c1c1e]')}`}>{value}</p>
      {sub && <p className={`text-[11px] ${dark ? 'text-white/40' : 'text-[#aeaeb2]'}`}>{sub}</p>}
    </div>
  )
}

// ─── Card ────────────────────────────────────────────────────────────────────

function ClientCard({ client, urgentSet, todos, isSelected, isDragging, onClick, onDragStart, onDragEnd, onCompleteTodo, colAccent }: {
  client: Client; urgentSet: Set<string>; todos: Todo[]; isSelected: boolean; isDragging: boolean; colAccent: string
  onClick: ()=>void; onDragStart: ()=>void; onDragEnd: ()=>void; onCompleteTodo: (id:string)=>Promise<void>
}) {
  const { assigned, scope, blocker } = parseNotes(client.context_notes)
  const isUrgent  = urgentSet.has(client.name.toLowerCase())
  const assignees = assigned ? assigned.split(',').map(s=>s.trim()).filter(Boolean) : []
  const shown     = todos.slice(0, 3)
  const remaining = todos.length - shown.length

  return (
    <div
      draggable onDragStart={onDragStart} onDragEnd={onDragEnd} onClick={onClick}
      className={`bg-white rounded-xl border-l-[3px] border border-black/[0.07] cursor-pointer select-none transition-all duration-150 group overflow-hidden ${colAccent} ${
        isDragging  ? 'opacity-40 shadow-xl scale-[0.97] rotate-1' :
        isSelected  ? 'border-[#EF22DA]/40 border-l-[#EF22DA] shadow-[0_2px_16px_rgba(0,0,0,0.1)]' :
                      'hover:border-black/[0.13] hover:shadow-[0_2px_12px_rgba(0,0,0,0.07)]'
      }`}
    >
      {/* Card top */}
      <div className="px-3.5 pt-3.5 pb-3">
        <div className="flex items-start justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-[#EF22DA]/[0.08] border border-[#EF22DA]/[0.15] flex items-center justify-center text-[12px] font-bold text-[#EF22DA] shrink-0">
              {client.name[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-[#1c1c1e] truncate leading-tight">{client.name}</p>
              {client.monthly_value != null ? (
                <p className="text-[13px] font-mono font-bold text-[#EF22DA] leading-tight">
                  {fmtMRR(client.monthly_value)}<span className="text-[#EF22DA]/40 text-[10px] font-normal">/mo</span>
                </p>
              ) : (
                <p className="text-[10px] font-mono text-[#c7c7cc] leading-tight">no retainer set</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {isUrgent && (
              <div title="email needs reply" className="w-1.5 h-1.5 rounded-full bg-[#EF22DA] animate-pulse" />
            )}
            <div className="text-[#c7c7cc] opacity-0 group-hover:opacity-100 transition-opacity cursor-grab text-[13px]">⠿</div>
          </div>
        </div>

        {client.services && client.services.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2.5">
            {client.services.map(s => (
              <span key={s} className="text-[9px] font-mono uppercase tracking-wide text-[#6c6c70] bg-black/[0.04] rounded-full px-1.5 py-0.5">{s}</span>
            ))}
          </div>
        )}

        {scope ? (
          <p className="text-[11px] text-[#6c6c70] leading-relaxed mb-2 line-clamp-2">{scope}</p>
        ) : (
          <p className="text-[10px] text-[#d0d0d5] italic leading-relaxed mb-2">No retainer scope set — click to add</p>
        )}

        {blocker && (
          <div className="flex items-center gap-1.5 bg-red-50 rounded-lg px-2.5 py-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
            <p className="text-[11px] text-red-500 font-medium line-clamp-1">{blocker}</p>
          </div>
        )}
      </div>

      {/* Todos section */}
      {todos.length > 0 && (
        <div className="border-t border-black/[0.05] px-3.5 pt-2.5 pb-3 bg-black/[0.015]">
          <p className="text-[9px] font-mono uppercase tracking-widest text-[#c7c7cc] mb-1.5">{todos.length} open</p>
          <div className="space-y-1.5">
            {shown.map(t => (
              <div key={t.id} className="flex items-start gap-2 group/todo" onClick={e=>e.stopPropagation()}>
                <button
                  onClick={()=>onCompleteTodo(t.id)}
                  className="mt-0.5 w-3.5 h-3.5 rounded border border-black/[0.15] flex items-center justify-center shrink-0 hover:border-emerald-400 hover:bg-emerald-50 transition-all"
                >
                  <span className="text-[8px] text-emerald-500 opacity-0 group-hover/todo:opacity-100 leading-none">✓</span>
                </button>
                <p className="text-[11px] text-[#3c3c3e] leading-snug line-clamp-1">{t.content.replace(new RegExp(`\\s*\\[${client.name}\\]\\s*`,'i'),'')}</p>
              </div>
            ))}
            {remaining > 0 && (
              <p className="text-[10px] font-mono text-[#aeaeb2] pl-5">+{remaining} more</p>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      {(assignees.length > 0 || (todos.length === 0 && client.next_action)) && (
        <div className="px-3.5 py-2 border-t border-black/[0.05] flex items-center justify-between">
          {assignees.length > 0 ? (
            <div className="flex items-center gap-1.5">
              <div className="flex items-center">
                {assignees.slice(0,3).map((a,i)=>(
                  <div key={i} title={a} className="w-5 h-5 rounded-full bg-[#f0f0f5] border-2 border-white flex items-center justify-center text-[7px] font-semibold text-[#6c6c70]" style={{marginLeft:i>0?'-5px':0}}>
                    {initials(a)}
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-[#aeaeb2] truncate">{assignees[0]}{assignees.length>1?` +${assignees.length-1}`:''}</p>
            </div>
          ) : client.next_action ? (
            <p className="text-[10px] text-[#aeaeb2] truncate flex-1 flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-amber-400 shrink-0 inline-block" />{client.next_action}
            </p>
          ) : <div />}
        </div>
      )}
    </div>
  )
}

// ─── Slide-out panel ─────────────────────────────────────────────────────────

function ClientPanel({ client, todos, onUpdate, onClose, onCompleteTodo, onAddTodo }: {
  client: Client; todos: Todo[]; onUpdate: (p:Partial<Client>)=>void; onClose: ()=>void
  onCompleteTodo: (id:string)=>Promise<void>; onAddTodo: (content:string)=>Promise<void>
}) {
  const [emails,   setEmails]   = useState<Email[]>([])
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [loading,  setLoading]  = useState(true)

  const p0 = parseNotes(client.context_notes)
  const [health,   setHealth]   = useState(p0.health)
  const [blocker,  setBlocker]  = useState(p0.blocker)
  const [assigned, setAssigned] = useState(p0.assigned)
  const [scope,    setScope]    = useState(p0.scope)
  const [notes,    setNotes]    = useState(p0.notes)
  const [nextAction,setNextAction]=useState(client.next_action??'')
  const [mrr,      setMrr]      = useState(String(client.monthly_value??''))
  const [editMrr,  setEditMrr]  = useState(false)
  const [services, setServices] = useState<string[]>(client.services??[])
  const [addingService,setAddingService]=useState(false)
  const [newService,setNewService]=useState('')
  const [newTodo,  setNewTodo]  = useState('')
  const [addingTodo,setAddingTodo]=useState(false)
  const [expEmail, setExpEmail] = useState<string|null>(null)
  const [expMtg,   setExpMtg]   = useState<string|null>(null)

  useEffect(()=>{
    setLoading(true)
    fetch(`/api/clients/${client.id}/activity`).then(r=>r.json()).then(d=>{
      setEmails(d.emails??[]); setMeetings(d.meetings??[]); setLoading(false)
    })
  },[client.id])

  async function saveNotes(overrides:Partial<Parsed>={}) {
    const encoded = encodeNotes({ health, blocker, assigned, scope, notes, ...overrides })
    await patchClient(client.id,{context_notes:encoded}); onUpdate({context_notes:encoded})
  }
  function toggleHealth(key:string) { const n=health===key?'':key; setHealth(n); saveNotes({health:n}) }
  async function saveNextAction() { await patchClient(client.id,{next_action:nextAction}); onUpdate({next_action:nextAction}) }
  async function saveMrr() {
    const val=mrr.trim()?Number(mrr):null; await patchClient(client.id,{monthly_value:val}); onUpdate({monthly_value:val??undefined}); setEditMrr(false)
  }
  async function saveStatus(s:string) { await patchClient(client.id,{status:s}); onUpdate({status:s}) }
  async function saveServices(next:string[]) {
    setServices(next); await patchClient(client.id,{services:next}); onUpdate({services:next})
  }
  function toggleService(s:string) { saveServices(services.includes(s)?services.filter(x=>x!==s):[...services,s]) }
  function addCustomService() {
    const s=newService.trim(); if (s && !services.includes(s)) saveServices([...services,s])
    setNewService(''); setAddingService(false)
  }
  async function dismissEmail(id:string) {
    await fetch(`${SB_URL}/rest/v1/email_inbox?id=eq.${id}`,{method:'PATCH',headers:{...sbH(),Prefer:'return=minimal'},body:JSON.stringify({status:'done'})})
    setEmails(es=>es.filter(e=>e.id!==id))
  }

  const urgentEmails = emails.filter(e=>e.needs_attention&&e.status!=='done')

  const HBTNS=[
    {key:'on-track',        label:'On Track',        on:'bg-emerald-500 text-white border-emerald-500',off:'bg-white text-[#6c6c70] border-black/[0.08] hover:border-emerald-200'},
    {key:'needs-attention', label:'Needs Attention', on:'bg-amber-400 text-white border-amber-400',   off:'bg-white text-[#6c6c70] border-black/[0.08] hover:border-amber-200'},
    {key:'blocked',         label:'Blocked',         on:'bg-red-500 text-white border-red-500',       off:'bg-white text-[#6c6c70] border-black/[0.08] hover:border-red-200'},
  ]

  return (
    <div className="fixed right-0 top-0 bottom-0 w-[420px] bg-white border-l border-black/[0.07] shadow-[-4px_0_24px_rgba(0,0,0,0.07)] flex flex-col z-40">

      {/* Header */}
      <div className="shrink-0 px-5 py-4 border-b border-black/[0.06] flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#EF22DA]/[0.08] border border-[#EF22DA]/[0.15] flex items-center justify-center text-[14px] font-bold text-[#EF22DA] shrink-0">
          {client.name[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold text-[#1c1c1e] truncate">{client.name}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={client.status??'active'} onChange={e=>saveStatus(e.target.value)}
              className="text-[11px] font-mono text-[#aeaeb2] bg-transparent border-0 outline-none cursor-pointer appearance-none hover:text-[#6c6c70]">
              {['active','prospect','paused','churned'].map(s=><option key={s} value={s}>{s}</option>)}
            </select>
            <span className="text-[#e0e0e0]">·</span>
            {editMrr ? (
              <input autoFocus value={mrr} onChange={e=>setMrr(e.target.value)} onBlur={saveMrr} onKeyDown={e=>e.key==='Enter'&&saveMrr()} type="number"
                className="text-[11px] font-mono w-24 border-b border-[#EF22DA]/40 outline-none text-[#1c1c1e]" placeholder="monthly retainer $" />
            ) : (
              <button onClick={()=>setEditMrr(true)} className={`text-[12px] font-mono font-semibold hover:opacity-70 ${client.monthly_value ? 'text-[#EF22DA]' : 'text-[#c7c7cc]'}`}>
                {client.monthly_value ? `$${client.monthly_value.toLocaleString()}/mo` : '+ set retainer'}
              </button>
            )}
          </div>
        </div>
        <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-[#aeaeb2] hover:text-[#6c6c70] hover:bg-black/[0.04] text-[15px]">✕</button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

        <PSection label="Health">
          <div className="flex gap-2 flex-wrap">
            {HBTNS.map(b=>(
              <button key={b.key} onClick={()=>toggleHealth(b.key)}
                className={`px-3 py-1.5 rounded-xl border text-[11px] font-medium transition-all ${health===b.key?b.on:b.off}`}>
                {b.label}
              </button>
            ))}
          </div>
        </PSection>

        <PSection label="Services">
          <div className="mt-2 flex flex-wrap gap-1.5">
            {SERVICE_TAGS.map(s=>(
              <button key={s} onClick={()=>toggleService(s)}
                className={`px-2.5 py-1 rounded-full border text-[11px] font-medium transition-all ${services.includes(s)?'bg-[#1c1c1e] text-white border-[#1c1c1e]':'bg-white text-[#6c6c70] border-black/[0.08] hover:border-black/[0.2]'}`}>
                {s}
              </button>
            ))}
            {services.filter(s=>!SERVICE_TAGS.includes(s)).map(s=>(
              <button key={s} onClick={()=>toggleService(s)}
                className="px-2.5 py-1 rounded-full border text-[11px] font-medium bg-[#1c1c1e] text-white border-[#1c1c1e]">
                {s} ✕
              </button>
            ))}
            {addingService ? (
              <input autoFocus value={newService} onChange={e=>setNewService(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter')addCustomService();if(e.key==='Escape'){setAddingService(false);setNewService('')}}}
                onBlur={addCustomService} placeholder="Custom service…"
                className="w-28 text-[11px] outline-none text-[#1c1c1e] placeholder:text-[#c7c7cc] border-b border-black/[0.15] pb-1 bg-transparent" />
            ) : (
              <button onClick={()=>setAddingService(true)}
                className="px-2.5 py-1 rounded-full border border-dashed border-black/[0.15] text-[11px] text-[#aeaeb2] hover:text-[#6c6c70] hover:border-black/[0.3]">
                + Other
              </button>
            )}
          </div>
        </PSection>

        <PSection label="Retainer Scope">
          <textarea value={scope} onChange={e=>setScope(e.target.value)} onBlur={()=>saveNotes({scope})}
            placeholder="What are we doing for this client? Deliverables, channels, cadence…" rows={3}
            className="mt-2 w-full resize-none bg-[#fafafa] border border-black/[0.07] focus:border-black/[0.13] rounded-xl px-3.5 py-3 text-[13px] text-[#1c1c1e] placeholder:text-[#c7c7cc] outline-none leading-relaxed" />
        </PSection>

        <PSection label="Next Action">
          <textarea value={nextAction} onChange={e=>setNextAction(e.target.value)} onBlur={saveNextAction}
            placeholder="What needs to happen next?" rows={2}
            className={`mt-2 w-full resize-none rounded-xl px-3.5 py-3 text-[13px] text-[#1c1c1e] placeholder:text-[#c7c7cc] outline-none border leading-relaxed transition-all ${nextAction?'bg-amber-50 border-amber-200':'bg-[#fafafa] border-black/[0.07] focus:border-black/[0.13]'}`} />
        </PSection>

        {(health==='blocked'||blocker) && (
          <PSection label="Blocker" labelClass="text-red-400">
            <textarea value={blocker} onChange={e=>setBlocker(e.target.value)} onBlur={()=>saveNotes({blocker})}
              placeholder="What's blocking progress?" rows={2}
              className="mt-2 w-full resize-none bg-red-50 border border-red-200 rounded-xl px-3.5 py-3 text-[13px] text-[#1c1c1e] placeholder:text-red-200 outline-none focus:border-red-300 leading-relaxed" />
          </PSection>
        )}

        <PSection label="Team">
          <input value={assigned} onChange={e=>setAssigned(e.target.value)} onBlur={()=>saveNotes({assigned})}
            placeholder="Who's on this? e.g. Josh, Sarah"
            className="mt-2 w-full bg-[#fafafa] border border-black/[0.07] focus:border-black/[0.13] rounded-xl px-3.5 py-2.5 text-[13px] text-[#1c1c1e] placeholder:text-[#c7c7cc] outline-none" />
        </PSection>

        <PSection label="Notes">
          <textarea value={notes} onChange={e=>setNotes(e.target.value)} onBlur={()=>saveNotes({notes})}
            placeholder="How's it going? Context, what's working, anything worth tracking…" rows={3}
            className="mt-2 w-full resize-none bg-[#fafafa] border border-black/[0.07] focus:border-black/[0.13] rounded-xl px-3.5 py-3 text-[13px] text-[#1c1c1e] placeholder:text-[#c7c7cc] outline-none leading-relaxed" />
        </PSection>

        <PSection label={<>Todos <span className="text-[#aeaeb2]">{todos.length > 0 ? todos.length : ''}</span></>}>
          <div className="mt-2 space-y-1.5">
            {todos.length===0&&!addingTodo && <p className="text-[12px] text-[#c7c7cc]">No open todos for this client</p>}
            {todos.map(t=>(
              <div key={t.id} className="flex items-start gap-2.5 group/td py-0.5">
                <button onClick={()=>onCompleteTodo(t.id)}
                  className="mt-0.5 w-4 h-4 rounded-md border border-black/[0.12] flex items-center justify-center shrink-0 hover:border-emerald-400 hover:bg-emerald-50 transition-all">
                  <span className="text-[8px] text-emerald-500 opacity-0 group-hover/td:opacity-100 leading-none">✓</span>
                </button>
                <p className="text-[12px] text-[#3c3c3e] leading-relaxed">
                  {t.content.replace(new RegExp(`\\s*\\[${client.name}\\]\\s*`,'i'),'')}
                </p>
              </div>
            ))}
            {addingTodo ? (
              <div className="flex items-center gap-2.5">
                <div className="w-4 h-4 rounded-md border border-[#EF22DA]/30 shrink-0" />
                <input autoFocus value={newTodo} onChange={e=>setNewTodo(e.target.value)}
                  onKeyDown={async e=>{
                    if(e.key==='Enter'&&newTodo.trim()){await onAddTodo(newTodo.trim());setNewTodo('');setAddingTodo(false)}
                    if(e.key==='Escape'){setAddingTodo(false);setNewTodo('')}
                  }}
                  onBlur={()=>{if(!newTodo.trim())setAddingTodo(false)}}
                  placeholder="New todo… (Enter to save)"
                  className="flex-1 text-[12px] outline-none text-[#1c1c1e] placeholder:text-[#c7c7cc] border-b border-black/[0.08] pb-1 bg-transparent" />
              </div>
            ):(
              <button onClick={()=>setAddingTodo(true)} className="flex items-center gap-2 text-[11px] text-[#aeaeb2] hover:text-[#EF22DA] transition-colors pt-0.5 group/add">
                <span className="w-4 h-4 rounded-md border border-black/[0.08] group-hover/add:border-[#EF22DA]/30 flex items-center justify-center text-[10px] group-hover/add:text-[#EF22DA] transition-all">+</span>
                Add todo
              </button>
            )}
          </div>
        </PSection>

        {!loading && urgentEmails.length > 0 && (
          <PSection label={<>Emails <span className="text-[#aeaeb2]">{urgentEmails.length} need reply</span></>}>
            <div className="mt-2 space-y-2">
              {urgentEmails.map(e=>{
                const from=e.from_address.replace(/<.*?>/,'').trim(); const isExp=expEmail===e.id
                return (
                  <div key={e.id} className={`rounded-xl border overflow-hidden ${e.priority==='high'?'border-red-100 bg-red-50/40':'border-black/[0.07] bg-white'}`}>
                    <div className="flex items-start gap-2.5 px-3.5 py-3 cursor-pointer" onClick={()=>setExpEmail(isExp?null:e.id)}>
                      <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${e.priority==='high'?'bg-red-400':'bg-[#c7c7cc]'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-medium text-[#1c1c1e] truncate">{e.subject}</p>
                        <p className="text-[10px] text-[#aeaeb2] mt-0.5">{from} · {relTime(e.received_at)}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] text-[#c7c7cc]">{isExp?'↑':'↓'}</span>
                        <button onClick={ev=>{ev.stopPropagation();dismissEmail(e.id)}} className="text-[10px] text-[#c7c7cc] hover:text-[#6c6c70]">✕</button>
                      </div>
                    </div>
                    {isExp&&(e.reason||e.suggested_reply)&&(
                      <div className="px-3.5 pb-3 border-t border-black/[0.05] space-y-2.5">
                        {e.reason&&<p className="text-[11px] text-[#6c6c70] leading-relaxed pt-2.5">{e.reason}</p>}
                        {e.suggested_reply&&(
                          <div className="bg-white border border-[#EF22DA]/[0.12] rounded-xl p-3">
                            <p className="text-[9px] font-mono text-[#EF22DA] uppercase tracking-wider mb-1.5">Suggested reply</p>
                            <p className="text-[11px] text-[#3c3c3e] leading-relaxed">{e.suggested_reply}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </PSection>
        )}

        {!loading && meetings.length > 0 && (
          <PSection label={<>Meeting Notes <span className="text-[#aeaeb2]">{meetings.length}</span></>}>
            <div className="mt-2 space-y-2">
              {meetings.map(m=>{
                const isExp=expMtg===m.id
                return (
                  <div key={m.id} onClick={()=>setExpMtg(isExp?null:m.id)}
                    className="bg-[#fafafa] border border-black/[0.07] hover:border-black/[0.11] rounded-xl px-3.5 py-3 cursor-pointer transition-all">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] font-mono text-[#aeaeb2]">{relTime(m.created_at)}</p>
                      <span className="text-[10px] text-[#c7c7cc]">{isExp?'↑':'↓'}</span>
                    </div>
                    <p className={`text-[12px] text-[#3c3c3e] leading-relaxed ${isExp?'whitespace-pre-wrap':'line-clamp-2'}`}>{m.content}</p>
                  </div>
                )
              })}
            </div>
          </PSection>
        )}
      </div>
    </div>
  )
}

function PSection({ label, labelClass, children }: { label: React.ReactNode; labelClass?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className={`font-mono text-[10px] uppercase tracking-widest ${labelClass??'text-[#aeaeb2]'}`}>{label}</p>
      {children}
    </div>
  )
}
