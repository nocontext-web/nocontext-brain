'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { monthlyValue, RevenueClient } from '@/lib/revenue'

type Draft = { id?: string; name: string; status: string; monthly_value: string; next_action: string }
const empty: Draft = { name: '', status: 'active', monthly_value: '', next_action: '' }
const statuses = ['active', 'prospect', 'paused', 'adhoc', 'churned']

export default function ClientsPage() {
  const [clients, setClients] = useState<RevenueClient[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [filter, setFilter] = useState('all')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/clients', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Could not load clients. Please try again.')
      const data = await response.json()
      if (!Array.isArray(data)) throw new Error('Client data is unavailable.')
      setClients(data)
    }).catch(e => { if (e.name !== 'AbortError') setError(e.message) }).finally(() => setLoading(false))
    return () => controller.abort()
  }, [])
  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!draft) return
    const amount = draft.monthly_value.trim() === '' ? null : Number(draft.monthly_value)
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) { setError('Use a non-negative monthly value, or leave it blank.'); return }
    setSaving(true); setError('')
    try {
      const response = await fetch(draft.id ? `/api/clients/${draft.id}` : '/api/clients', {
        method: draft.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: draft.name.trim(), status: draft.status, monthly_value: amount, next_action: draft.next_action.trim() }),
      })
      if (!response.ok) throw new Error('The client was not saved. Your changes are still here; please try again.')
      const saved = await response.json()
      setClients(rows => draft.id ? rows.map(row => row.id === draft.id ? saved : row) : [...rows, saved])
      setDraft(null)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save client.') }
    finally { setSaving(false) }
  }
  const visible = clients.filter(c => filter === 'all' || (c.status || 'active') === filter).sort((a, b) => a.name.localeCompare(b.name))
  return <div className="min-h-full bg-[#f7f7f5] p-6 text-[#202020] md:p-12"><div className="mx-auto max-w-6xl">
    <header className="mb-8 flex items-end justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#a22487]">NO CONTEXT / Clients</p><h1 className="mt-4 text-4xl font-medium tracking-tight">Know where each client stands.</h1><p className="mt-3 text-sm text-black/50">Monthly retainers, status, and the next move. All in one place.</p></div><button disabled={saving} onClick={() => setDraft({ ...empty })} className="shrink-0 rounded-full bg-[#202020] px-5 py-3 text-xs text-white">Add client +</button></header>
    {error && <p role="alert" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">{error}</p>}
    {draft && <form onSubmit={save} className="mb-8 rounded-2xl border border-black/10 bg-white p-6"><h2 className="mb-5 text-lg font-medium">{draft.id ? 'Edit client' : 'New client'}</h2><div className="grid gap-4 md:grid-cols-3">
      <label className="text-xs text-black/60">Client name<input required disabled={saving} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} className="mt-2 block w-full rounded-lg border border-black/15 p-3 text-sm text-black" /></label>
      <label className="text-xs text-black/60">Status<select disabled={saving} value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value })} className="mt-2 block w-full rounded-lg border border-black/15 bg-white p-3 text-sm text-black">{statuses.map(s => <option key={s} value={s}>{s === 'adhoc' ? 'Project / ad hoc' : s}</option>)}</select></label>
      <label className="text-xs text-black/60">Contracted monthly retainer<input disabled={saving} type="number" min="0" step="0.01" placeholder="Not recorded" value={draft.monthly_value} onChange={e => setDraft({ ...draft, monthly_value: e.target.value })} className="mt-2 block w-full rounded-lg border border-black/15 p-3 text-sm text-black" /></label>
      <label className="text-xs text-black/60 md:col-span-3">Next action<input disabled={saving} value={draft.next_action} onChange={e => setDraft({ ...draft, next_action: e.target.value })} className="mt-2 block w-full rounded-lg border border-black/15 p-3 text-sm text-black" /></label>
    </div><div className="mt-5 flex gap-3"><button disabled={saving} className="rounded-full bg-[#202020] px-5 py-2.5 text-xs text-white">{saving ? 'Saving…' : 'Save client'}</button><button type="button" disabled={saving} onClick={() => setDraft(null)} className="px-4 text-xs">Cancel</button></div></form>}
    <div className="mb-5 flex flex-wrap gap-2" aria-label="Filter clients">{['all', ...statuses].map(s => <button key={s} onClick={() => setFilter(s)} aria-pressed={filter === s} className={`rounded-full border px-4 py-2 text-xs ${filter === s ? 'border-[#202020] bg-[#202020] text-white' : 'border-black/10 bg-white'}`}>{s === 'adhoc' ? 'Project / ad hoc' : s.charAt(0).toUpperCase() + s.slice(1)}</button>)}</div>
    <div className="overflow-x-auto rounded-2xl border border-black/10 bg-white"><table className="w-full min-w-[650px] text-left text-sm"><thead className="border-b border-black/10 text-[10px] uppercase tracking-widest text-black/45"><tr><th className="p-5 font-medium">Client</th><th className="p-5 font-medium">Status</th><th className="p-5 font-medium">Monthly retainer</th><th className="p-5 font-medium">Next action</th><th className="p-5"><span className="sr-only">Actions</span></th></tr></thead><tbody className="divide-y divide-black/5">{visible.map(c => <tr key={c.id}><td className="p-5 font-medium"><Link href={`/clients/${c.id}`} className="hover:underline">{c.name} ↗</Link></td><td className="p-5 text-xs text-black/55">{c.status || 'active'}</td><td className="p-5">{monthlyValue(c) == null ? 'Not recorded' : `$${monthlyValue(c)!.toLocaleString('en-AU')}`}</td><td className="max-w-xs p-5 text-black/55">{c.next_action || '—'}</td><td className="p-5"><button disabled={saving} onClick={() => setDraft({ id: c.id, name: c.name, status: c.status || 'active', monthly_value: c.monthly_value == null ? '' : String(c.monthly_value), next_action: c.next_action || '' })} className="text-xs underline">Edit</button></td></tr>)}</tbody></table>{!visible.length && <p className="p-6 text-sm text-black/50">{loading ? 'Loading clients…' : error ? 'Unable to display clients.' : 'No clients in this view.'}</p>}</div>
    <p className="mt-5 text-xs text-black/45">Retainers are contracted monthly values. Prospects, paused clients and project work are excluded from the active retainer total.</p>
  </div></div>
}
