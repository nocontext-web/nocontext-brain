'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

type Client = {
  id: string
  name: string
  website?: string
  instagram?: string
  tiktok?: string
  brief?: string
  status?: string
  monthly_value?: number
  priority?: string
  next_action?: string
  created_at: string
}

const STATUS_STYLES: Record<string, { dot: string; label: string }> = {
  active:    { dot: 'bg-emerald-400', label: 'Active' },
  prospect:  { dot: 'bg-amber-400',   label: 'Prospect' },
  paused:    { dot: 'bg-zinc-300',    label: 'Paused' },
  churned:   { dot: 'bg-red-300',     label: 'Churned' },
}

function briefSnippet(brief?: string) {
  if (!brief) return null
  const firstLine = brief.replace(/^#+\s*/m, '').split('\n').find(l => l.trim().length > 20)
  return firstLine ? firstLine.slice(0, 90) + (firstLine.length > 90 ? '…' : '') : null
}

function Handle({ platform, handle }: { platform: 'ig' | 'tt'; handle: string }) {
  const clean = handle.replace('@', '')
  const url = platform === 'ig'
    ? `https://instagram.com/${clean}`
    : `https://tiktok.com/@${clean}`
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => e.stopPropagation()}
      className="flex items-center gap-1 text-[11px] font-mono text-[#6c6c70] hover:text-[#EF22DA] transition-colors"
    >
      <span className="text-[9px] uppercase tracking-widest text-[#aeaeb2]">{platform === 'ig' ? 'IG' : 'TT'}</span>
      <span>{handle}</span>
    </a>
  )
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ name: '', website: '', instagram: '', tiktok: '', monthly_value: '' })
  const [saving, setSaving] = useState(false)
  const [researching, setResearching] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/clients').then(r => r.json()).then(setClients)
  }, [])

  const filtered = clients.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.instagram?.includes(search) || c.tiktok?.includes(search)
  )

  async function createClient() {
    if (!form.name.trim()) return
    setSaving(true)
    const res = await fetch('/api/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        website: form.website || undefined,
        instagram: form.instagram || undefined,
        tiktok: form.tiktok || undefined,
        monthly_value: form.monthly_value ? Number(form.monthly_value) : undefined,
        status: 'active',
      }),
    })
    const client = await res.json()
    setClients(prev => [client, ...prev])
    setForm({ name: '', website: '', instagram: '', tiktok: '', monthly_value: '' })
    setShowNew(false)
    setSaving(false)
  }

  async function quickResearch(e: React.MouseEvent, clientId: string) {
    e.preventDefault()
    e.stopPropagation()
    setResearching(clientId)
    await fetch(`/api/clients/${clientId}/research`, { method: 'POST' })
    const updated = await fetch('/api/clients').then(r => r.json())
    setClients(updated)
    setResearching(null)
  }

  const totalMRR = clients.reduce((sum, c) => sum + (c.monthly_value || 0), 0)
  const activeCount = clients.filter(c => c.status === 'active' || !c.status).length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-8 pt-8 pb-6 border-b border-black/[0.05] flex items-start justify-between">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#aeaeb2] mb-1">Work</p>
          <h1 className="text-[22px] font-semibold text-[#1c1c1e] tracking-tight">Clients</h1>
          <div className="flex items-center gap-4 mt-1.5">
            <span className="text-[12px] text-[#6c6c70]">{activeCount} active</span>
            {totalMRR > 0 && (
              <span className="text-[12px] text-[#6c6c70]">
                ${totalMRR.toLocaleString()}<span className="text-[#aeaeb2]">/mo</span>
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => setShowNew(!showNew)}
          className="bg-[#EF22DA] text-white text-[13px] font-semibold px-4 py-2 rounded-xl hover:opacity-90 shadow-[0_1px_3px_rgba(239,34,218,0.25)]"
        >
          + New Client
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6 flex flex-col gap-4 max-w-4xl">

        {/* New client form */}
        {showNew && (
          <div className="bg-white border border-black/[0.07] rounded-2xl p-5 shadow-[0_1px_4px_rgba(0,0,0,0.05)] animate-fade-up">
            <p className="font-mono text-[10px] uppercase tracking-widest text-[#aeaeb2] mb-4">New Client</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <input placeholder="Client name *" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="col-span-2 bg-black/[0.03] border border-black/[0.07] rounded-xl px-3 py-2.5 text-sm text-[#1c1c1e] placeholder:text-[#aeaeb2] focus:outline-none focus:border-black/[0.18]"
              />
              <input placeholder="Instagram @handle" value={form.instagram}
                onChange={e => setForm(f => ({ ...f, instagram: e.target.value }))}
                className="bg-black/[0.03] border border-black/[0.07] rounded-xl px-3 py-2.5 text-sm text-[#1c1c1e] placeholder:text-[#aeaeb2] focus:outline-none focus:border-black/[0.18]"
              />
              <input placeholder="TikTok @handle" value={form.tiktok}
                onChange={e => setForm(f => ({ ...f, tiktok: e.target.value }))}
                className="bg-black/[0.03] border border-black/[0.07] rounded-xl px-3 py-2.5 text-sm text-[#1c1c1e] placeholder:text-[#aeaeb2] focus:outline-none focus:border-black/[0.18]"
              />
              <input placeholder="Website URL" value={form.website}
                onChange={e => setForm(f => ({ ...f, website: e.target.value }))}
                className="bg-black/[0.03] border border-black/[0.07] rounded-xl px-3 py-2.5 text-sm text-[#1c1c1e] placeholder:text-[#aeaeb2] focus:outline-none focus:border-black/[0.18]"
              />
              <input placeholder="Monthly value ($)" value={form.monthly_value}
                onChange={e => setForm(f => ({ ...f, monthly_value: e.target.value }))}
                type="number"
                className="bg-black/[0.03] border border-black/[0.07] rounded-xl px-3 py-2.5 text-sm text-[#1c1c1e] placeholder:text-[#aeaeb2] focus:outline-none focus:border-black/[0.18]"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={createClient} disabled={saving || !form.name.trim()}
                className="bg-[#EF22DA] text-white text-sm font-semibold px-5 py-2 rounded-xl disabled:opacity-30 hover:opacity-90">
                {saving ? 'Creating…' : 'Create Client'}
              </button>
              <button onClick={() => setShowNew(false)} className="text-sm text-[#aeaeb2] hover:text-[#6c6c70] px-3 py-2">Cancel</button>
            </div>
          </div>
        )}

        {/* Search */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search clients, handles…"
          className="bg-white border border-black/[0.07] rounded-xl px-4 py-2.5 text-sm text-[#1c1c1e] placeholder:text-[#aeaeb2] focus:outline-none focus:border-black/[0.15] shadow-[0_1px_3px_rgba(0,0,0,0.03)]"
        />

        {/* Client list */}
        {filtered.length === 0 ? (
          <p className="text-[#aeaeb2] text-sm text-center py-12">
            {search ? 'No clients match.' : 'No clients yet — add one above.'}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((client, i) => {
              const status = STATUS_STYLES[client.status || 'active'] ?? STATUS_STYLES.active
              const snippet = briefSnippet(client.brief)
              return (
                <Link
                  key={client.id}
                  href={`/clients/${client.id}`}
                  className="group bg-white border border-black/[0.07] rounded-2xl p-5 hover:border-black/[0.13] hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-all animate-fade-up"
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  <div className="flex items-start gap-4">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-xl bg-[#EF22DA]/[0.08] border border-[#EF22DA]/[0.15] flex items-center justify-center text-[15px] font-bold text-[#EF22DA] shrink-0">
                      {client.name[0].toUpperCase()}
                    </div>

                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 mb-1">
                        <span className="font-semibold text-[14px] text-[#1c1c1e]">{client.name}</span>
                        <div className="flex items-center gap-1">
                          <div className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                          <span className="text-[10px] font-mono text-[#aeaeb2] uppercase tracking-wide">{status.label}</span>
                        </div>
                        {client.monthly_value && (
                          <span className="text-[11px] font-mono text-[#6c6c70] ml-1">
                            ${client.monthly_value.toLocaleString()}<span className="text-[#aeaeb2]">/mo</span>
                          </span>
                        )}
                      </div>

                      {/* Handles */}
                      <div className="flex items-center gap-3 mb-2">
                        {client.instagram && <Handle platform="ig" handle={client.instagram} />}
                        {client.tiktok && <Handle platform="tt" handle={client.tiktok} />}
                        {client.website && (
                          <a href={client.website} target="_blank" rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="text-[11px] font-mono text-[#aeaeb2] hover:text-[#6c6c70] transition-colors truncate max-w-[160px]">
                            {client.website.replace(/https?:\/\/(www\.)?/, '')}
                          </a>
                        )}
                      </div>

                      {/* Brief snippet */}
                      {snippet && (
                        <p className="text-[12px] text-[#8e8e93] leading-snug line-clamp-1">{snippet}</p>
                      )}

                      {!client.brief && (
                        <p className="text-[11px] text-[#aeaeb2] italic">No brief yet — run research to generate one</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={e => quickResearch(e, client.id)}
                        disabled={researching === client.id}
                        className="text-[11px] font-mono px-3 py-1.5 bg-black/[0.04] border border-black/[0.07] rounded-lg text-[#6c6c70] hover:text-[#1c1c1e] hover:border-black/[0.14] disabled:opacity-40 transition-all"
                      >
                        {researching === client.id ? 'Running…' : '↻ Research'}
                      </button>
                      <Link
                        href={`/ideate?clientId=${client.id}`}
                        onClick={e => e.stopPropagation()}
                        className="text-[11px] font-mono px-3 py-1.5 bg-[#EF22DA]/[0.07] border border-[#EF22DA]/[0.15] rounded-lg text-[#EF22DA] hover:bg-[#EF22DA]/[0.12] transition-all"
                      >
                        Ideate
                      </Link>
                      <span className="text-[#aeaeb2] text-sm">→</span>
                    </div>
                  </div>

                  {/* Next action if set */}
                  {client.next_action && (
                    <div className="mt-3 pt-3 border-t border-black/[0.04] flex items-center gap-2">
                      <span className="text-[10px] font-mono uppercase tracking-widest text-[#aeaeb2]">Next</span>
                      <span className="text-[12px] text-[#6c6c70]">{client.next_action}</span>
                    </div>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
