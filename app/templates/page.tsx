'use client'

import { useState, useEffect, useRef } from 'react'

type Template = {
  id: string
  name: string
  description: string
  content: string
  created_at: string
}

const FORMAT_TYPES = [
  { id: 'jai',      label: 'Jai Script',         icon: '◐', color: '#EF22DA' },
  { id: 'lofi',     label: 'Lo-Fi Concepts',      icon: '◎', color: '#8a8f98' },
  { id: 'axe',      label: 'Axe Video',           icon: '⚡', color: '#a78bfa' },
  { id: 'josh',     label: 'Josh from Marketing', icon: '✦', color: '#fb923c' },
  { id: 'proposal', label: 'Proposal',            icon: '⊡', color: '#34d399' },
  { id: 'brief',    label: 'Brand Brief',         icon: '≡', color: '#60a5fa' },
  { id: 'other',    label: 'Other',               icon: '⊹', color: '#aeaeb2' },
]

function formatIcon(name: string) {
  const lower = name.toLowerCase()
  if (lower.includes('jai') || lower.includes('voiceover')) return FORMAT_TYPES[0]
  if (lower.includes('lo-fi') || lower.includes('lofi')) return FORMAT_TYPES[1]
  if (lower.includes('axe') || lower.includes('fast-cut')) return FORMAT_TYPES[2]
  if (lower.includes('josh') || lower.includes('marketing')) return FORMAT_TYPES[3]
  if (lower.includes('proposal')) return FORMAT_TYPES[4]
  if (lower.includes('brief')) return FORMAT_TYPES[5]
  return FORMAT_TYPES[6]
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [selected, setSelected] = useState<Template | null>(null)
  const [view, setView] = useState<'list' | 'new'>('list')
  const [form, setForm] = useState({ name: '', description: '', content: '' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/templates').then(r => r.json()).then(setTemplates)
  }, [])

  async function handleFile(file: File) {
    setUploading(true)
    setUploadError('')
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/templates/extract', { method: 'POST', body: fd })
    const data = await res.json()
    if (!res.ok) {
      setUploadError(data.error || 'Upload failed')
    } else {
      setForm(f => ({ ...f, name: data.name || f.name, content: data.content }))
      setView('new')
    }
    setUploading(false)
  }

  async function createTemplate() {
    if (!form.name.trim() || !form.content.trim()) return
    setSaving(true)
    const res = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const t = await res.json()
    setTemplates(prev => [t, ...prev])
    setForm({ name: '', description: '', content: '' })
    setView('list')
    setSelected(t)
    setSaving(false)
  }

  async function saveTemplate() {
    if (!selected) return
    await fetch(`/api/templates/${selected.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: selected.content, description: selected.description, name: selected.name }),
    })
    setSaved(true)
    setTemplates(prev => prev.map(t => t.id === selected.id ? selected : t))
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex h-full">

      {/* Left sidebar */}
      <div className="w-64 shrink-0 border-r border-black/[0.06] flex flex-col bg-white/60 h-full">
        <div className="px-5 pt-6 pb-4 border-b border-black/[0.05]">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#aeaeb2] mb-1">Create</p>
          <h1 className="text-[16px] font-semibold text-[#1c1c1e]">Templates</h1>
          <p className="text-[11px] text-[#aeaeb2] mt-0.5">{templates.length} saved</p>
        </div>

        {/* Upload drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
          onClick={() => fileRef.current?.click()}
          className={`mx-4 mt-4 mb-3 border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
            dragging ? 'border-[#EF22DA]/50 bg-[#EF22DA]/[0.04]' : 'border-black/[0.08] hover:border-black/[0.14] hover:bg-black/[0.02]'
          }`}
        >
          <input ref={fileRef} type="file" accept=".txt,.md,.docx" className="hidden"
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          {uploading ? (
            <p className="text-[11px] text-[#6c6c70] animate-pulse">Extracting…</p>
          ) : (
            <>
              <p className="text-[12px] text-[#6c6c70] font-medium">Upload a doc</p>
              <p className="text-[10px] text-[#aeaeb2] mt-0.5">.docx · .txt · .md</p>
            </>
          )}
        </div>
        {uploadError && <p className="text-[11px] text-red-400 font-mono px-4 mb-2">{uploadError}</p>}

        <button
          onClick={() => { setView('new'); setSelected(null); setForm({ name: '', description: '', content: '' }) }}
          className="mx-4 mb-3 py-2 text-[12px] font-semibold text-[#EF22DA] border border-[#EF22DA]/20 bg-[#EF22DA]/[0.06] rounded-xl hover:bg-[#EF22DA]/[0.10] transition-colors"
        >
          + New Template
        </button>

        {/* Template list */}
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {templates.length === 0 && (
            <p className="text-[11px] text-[#aeaeb2] px-3 py-4">No templates yet.</p>
          )}
          {templates.map(t => {
            const fmt = formatIcon(t.name)
            const isActive = selected?.id === t.id && view === 'list'
            return (
              <button key={t.id} onClick={() => { setSelected(t); setView('list') }}
                className={`w-full text-left px-3 py-2.5 rounded-xl transition-all flex items-center gap-2.5 ${
                  isActive ? 'bg-white shadow-[0_1px_4px_rgba(0,0,0,0.08)] border border-black/[0.06]' : 'hover:bg-black/[0.04]'
                }`}
              >
                <span style={{ color: fmt.color }} className="text-[11px] shrink-0">{fmt.icon}</span>
                <div className="min-w-0">
                  <p className={`text-[13px] font-medium truncate ${isActive ? 'text-[#1c1c1e]' : 'text-[#3a3a3c]'}`}>{t.name}</p>
                  {t.description && <p className="text-[10px] text-[#aeaeb2] truncate mt-0.5">{t.description}</p>}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-8">

        {/* Empty state */}
        {!selected && view === 'list' && (
          <div className="max-w-lg pt-8">
            <p className="font-mono text-[10px] uppercase tracking-widest text-[#aeaeb2] mb-3">How it works</p>
            <h2 className="text-[20px] font-semibold text-[#1c1c1e] mb-3">Format Templates</h2>
            <p className="text-[14px] text-[#6c6c70] leading-relaxed mb-6">
              Save your format docs here — Jai Scripts, Lo-Fi concept docs, Axe Video briefs, proposals. Upload a Word doc or paste the content directly. The agents use these as the exact format to follow.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {FORMAT_TYPES.slice(0, 4).map(f => (
                <button key={f.id}
                  onClick={() => { setView('new'); setForm(p => ({ ...p, name: f.label })) }}
                  className="flex items-center gap-2.5 p-3.5 bg-white border border-black/[0.07] rounded-xl hover:border-black/[0.13] hover:shadow-[0_1px_4px_rgba(0,0,0,0.05)] transition-all group">
                  <span style={{ color: f.color }} className="text-[13px]">{f.icon}</span>
                  <span className="text-[13px] font-medium text-[#3a3a3c] group-hover:text-[#1c1c1e]">{f.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* New template form */}
        {view === 'new' && (
          <div className="max-w-2xl">
            <div className="flex items-center gap-3 mb-6">
              <h2 className="text-[18px] font-semibold text-[#1c1c1e]">New Template</h2>
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <label className="font-mono text-[10px] uppercase tracking-widest text-[#aeaeb2] mb-1.5 block">Name</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Jai Script, Lo-Fi Concepts, Proposal"
                  className="w-full bg-white border border-black/[0.07] rounded-xl px-4 py-2.5 text-[13px] text-[#1c1c1e] placeholder:text-[#aeaeb2] focus:outline-none focus:border-black/[0.16] shadow-[0_1px_3px_rgba(0,0,0,0.03)]"
                />
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase tracking-widest text-[#aeaeb2] mb-1.5 block">Description <span className="normal-case tracking-normal text-[#c7c7cc]">(optional)</span></label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="What's this template for?"
                  className="w-full bg-white border border-black/[0.07] rounded-xl px-4 py-2.5 text-[13px] text-[#1c1c1e] placeholder:text-[#aeaeb2] focus:outline-none focus:border-black/[0.16] shadow-[0_1px_3px_rgba(0,0,0,0.03)]"
                />
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase tracking-widest text-[#aeaeb2] mb-1.5 block">Format</label>
                <p className="text-[11px] text-[#aeaeb2] mb-2">Paste your perfect example. The agent replicates this exact structure for any client.</p>
                <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  placeholder="Paste the format or example content here…"
                  className="w-full h-[calc(100vh-440px)] min-h-64 bg-white border border-black/[0.07] rounded-2xl p-4 text-[13px] text-[#3a3a3c] font-mono resize-none focus:outline-none focus:border-black/[0.16] shadow-[0_1px_3px_rgba(0,0,0,0.03)]"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={createTemplate} disabled={saving || !form.name.trim() || !form.content.trim()}
                className="bg-[#EF22DA] text-white text-[13px] font-semibold px-5 py-2.5 rounded-xl disabled:opacity-30 hover:opacity-90 shadow-[0_1px_3px_rgba(239,34,218,0.25)]">
                {saving ? 'Saving…' : 'Save Template'}
              </button>
              <button onClick={() => { setView('list'); setForm({ name: '', description: '', content: '' }) }}
                className="text-[13px] text-[#aeaeb2] hover:text-[#6c6c70] px-3 py-2.5">Cancel</button>
            </div>
          </div>
        )}

        {/* Selected template */}
        {selected && view === 'list' && (
          <div className="max-w-2xl">
            <div className="flex items-center gap-3 mb-5">
              <span style={{ color: formatIcon(selected.name).color }} className="text-[16px]">
                {formatIcon(selected.name).icon}
              </span>
              <input
                value={selected.name}
                onChange={e => setSelected(s => s ? { ...s, name: e.target.value } : s)}
                className="text-[18px] font-semibold text-[#1c1c1e] bg-transparent border-b border-transparent hover:border-black/[0.10] focus:border-black/[0.15] focus:outline-none pb-0.5 flex-1"
              />
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <label className="font-mono text-[10px] uppercase tracking-widest text-[#aeaeb2] mb-1.5 block">Description</label>
                <input value={selected.description || ''} onChange={e => setSelected(s => s ? { ...s, description: e.target.value } : s)}
                  placeholder="What's this for?"
                  className="w-full bg-white border border-black/[0.07] rounded-xl px-4 py-2.5 text-[13px] text-[#1c1c1e] placeholder:text-[#aeaeb2] focus:outline-none focus:border-black/[0.16] shadow-[0_1px_3px_rgba(0,0,0,0.03)]"
                />
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase tracking-widest text-[#aeaeb2] mb-1.5 block">Format</label>
                <textarea
                  value={selected.content}
                  onChange={e => setSelected(s => s ? { ...s, content: e.target.value } : s)}
                  className="w-full h-[calc(100vh-380px)] min-h-64 bg-white border border-black/[0.07] rounded-2xl p-4 text-[13px] text-[#3a3a3c] font-mono resize-none focus:outline-none focus:border-black/[0.16] shadow-[0_1px_3px_rgba(0,0,0,0.03)]"
                />
              </div>
            </div>
            <button onClick={saveTemplate}
              className="mt-3 bg-[#EF22DA] text-white text-[13px] font-semibold px-5 py-2.5 rounded-xl hover:opacity-90 shadow-[0_1px_3px_rgba(239,34,218,0.25)]">
              {saved ? '✓ Saved' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
