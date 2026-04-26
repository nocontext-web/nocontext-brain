'use client'

import { useState, useEffect } from 'react'

type Reference = {
  id: string
  url: string
  category: string | null
  creator_name: string | null
  notes: string | null
  hook: string
  format: string
  why_it_works: string
  style_dna: string
  steal_this: string
  created_at: string
}

const FORMATS = [
  {
    key: 'jai',
    name: 'Jai',
    desc: 'Voiceover storytelling',
    detail: 'Narrative-led, hook-driven. Documentary feel, emotional pull.',
    emoji: '🎬',
  },
  {
    key: 'axe',
    name: 'Axe',
    desc: 'Highly edited, fast-cut',
    detail: 'Shot-by-shot. Energy-driven. Fast transitions, text overlays.',
    emoji: '⚡',
  },
  {
    key: 'lofi',
    name: 'Lo-Fi',
    desc: 'Raw and native',
    detail: 'Trends, overlays, skits. Shot on iPhone, no production needed.',
    emoji: '📱',
  },
  {
    key: 'josh',
    name: 'Josh from Marketing',
    desc: 'Observational humour',
    detail: 'Real brand moment + dry overlay punchline.',
    emoji: '😂',
  },
]

function ReferenceCard({ ref: r }: { ref: Reference }) {
  const [open, setOpen] = useState(false)
  const format = FORMATS.find(f => f.key === r.creator_name?.toLowerCase() || f.key === r.category?.toLowerCase())

  return (
    <div className="bg-white border border-white/7 rounded-2xl overflow-hidden hover:border-white/15 transition-all">
      <button onClick={() => setOpen(!open)} className="w-full text-left p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              {format && <span className="text-lg">{format.emoji}</span>}
              {format && (
                <span className="text-[11px] font-semibold text-[#EF22DA] bg-[#EF22DA]/10 px-2 py-0.5 rounded-full">
                  {format.name}
                </span>
              )}
              <span className="text-[10px] text-[#8e8e93] font-mono ml-auto">
                {new Date(r.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
              </span>
            </div>
            {r.hook && (
              <p className="text-sm text-[#3a3a3c] leading-snug line-clamp-2">
                <span className="text-[#8e8e93] text-[10px] uppercase tracking-wider font-mono mr-2">Hook</span>
                {r.hook}
              </p>
            )}
            {r.notes && (
              <p className="text-xs text-[#8e8e93] mt-1.5 italic line-clamp-1">"{r.notes}"</p>
            )}
          </div>
          <span className="text-[#4b5563] text-xs shrink-0 mt-1">{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-white/7 p-5 flex flex-col gap-4">
          {[
            { label: 'Format', value: r.format },
            { label: 'Why it works', value: r.why_it_works },
            { label: 'Style DNA', value: r.style_dna },
            { label: 'Steal this', value: r.steal_this },
          ].map(({ label, value }) => value ? (
            <div key={label}>
              <div className="font-mono text-[10px] uppercase tracking-widest text-[#6c6c70] mb-1.5">{label}</div>
              <p className="text-sm text-[#3a3a3c] leading-relaxed whitespace-pre-line">{value}</p>
            </div>
          ) : null)}
          <a href={r.url} target="_blank" rel="noopener noreferrer"
            className="text-xs text-[#4b5563] hover:text-[#EF22DA] transition-colors font-mono truncate">
            {r.url} →
          </a>
        </div>
      )}
    </div>
  )
}

export default function ReferencesPage() {
  const [references, setReferences] = useState<Reference[]>([])
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [activeFilter, setActiveFilter] = useState('')

  const [url, setUrl] = useState('')
  const [selectedFormat, setSelectedFormat] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    fetch('/api/references')
      .then(r => r.json())
      .then(data => { setReferences(data.references ?? []); setLoading(false) })
  }, [])

  async function submit() {
    if (!url.trim() || !selectedFormat) return
    setAnalyzing(true)
    setError('')
    setStatus('Downloading video...')

    const format = FORMATS.find(f => f.key === selectedFormat)

    try {
      const res = await fetch('/api/references/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          category: selectedFormat,
          creator_name: format?.name ?? selectedFormat,
          notes: notes || null,
        }),
      })
      setStatus('Analysing with Gemini...')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      setReferences(prev => [data.reference, ...prev])
      setUrl(''); setNotes(''); setSelectedFormat('')
      setStatus('')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setStatus('')
    } finally {
      setAnalyzing(false)
    }
  }

  const filtered = activeFilter
    ? references.filter(r => r.creator_name?.toLowerCase() === activeFilter || r.category?.toLowerCase() === activeFilter)
    : references

  const countFor = (key: string) => references.filter(r =>
    r.creator_name?.toLowerCase() === key || r.category?.toLowerCase() === key
  ).length

  return (
    <div className="flex flex-col h-full bg-transparent">
      <div className="px-8 pt-8 pb-6 border-b border-white/7">
        <p className="font-mono text-xs uppercase tracking-widest text-[#6c6c70] mb-1">Creative Library</p>
        <h1 className="text-2xl font-semibold text-[#1c1c1e]">References</h1>
        <p className="text-[#6c6c70] text-sm mt-1">Feed videos so Caspar learns what good looks like per format.</p>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <div className="w-[420px] shrink-0 border-r border-white/7 overflow-y-auto p-6 flex flex-col gap-6">

          {/* Format selector */}
          <div>
            <label className="font-mono text-xs uppercase tracking-widest text-[#6c6c70] mb-2 block">Format</label>
            <div className="flex flex-col gap-2">
              {FORMATS.map(f => (
                <button
                  key={f.key}
                  onClick={() => setSelectedFormat(selectedFormat === f.key ? '' : f.key)}
                  className={`text-left p-4 rounded-xl border transition-all ${
                    selectedFormat === f.key
                      ? 'border-[#EF22DA] bg-[#EF22DA]/8'
                      : 'border-white/7 bg-white hover:border-white/15'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-lg">{f.emoji}</span>
                    <span className="font-semibold text-[#1c1c1e] text-sm">{f.name}</span>
                    <span className={`ml-auto text-xs font-mono ${selectedFormat === f.key ? 'text-[#EF22DA]' : 'text-[#8e8e93]'}`}>
                      {selectedFormat === f.key ? '●' : '○'}
                    </span>
                  </div>
                  <p className="text-xs text-[#6c6c70] ml-8 leading-relaxed">{f.detail}</p>
                </button>
              ))}
            </div>
          </div>

          {/* URL */}
          <div>
            <label className="font-mono text-xs uppercase tracking-widest text-[#6c6c70] mb-2 block">Video URL</label>
            <input
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
              placeholder="TikTok, Instagram, YouTube..."
              className="w-full bg-white border border-white/7 rounded-xl px-4 py-3 text-sm text-[#1c1c1e] placeholder:text-[#8e8e93] focus:outline-none focus:border-black/20"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="font-mono text-xs uppercase tracking-widest text-[#6c6c70] mb-2 block">Why you like it</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="What specifically is working here..."
              rows={3}
              className="w-full bg-white border border-white/7 rounded-xl px-4 py-3 text-sm text-[#1c1c1e] placeholder:text-[#8e8e93] resize-none focus:outline-none focus:border-black/20"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}
          {status && <p className="text-xs text-[#6c6c70] animate-pulse font-mono">{status}</p>}

          <button
            onClick={submit}
            disabled={analyzing || !url.trim() || !selectedFormat}
            className="bg-[#EF22DA] text-black text-sm font-bold px-5 py-3.5 rounded-xl disabled:opacity-30 hover:opacity-90 transition-opacity"
          >
            {analyzing ? 'Analysing...' : 'Add reference'}
          </button>
        </div>

        {/* Right panel */}
        <div className="flex-1 overflow-y-auto p-8">
          {/* Format filter tabs */}
          {references.length > 0 && (
            <div className="flex items-center gap-2 mb-6 flex-wrap">
              <button
                onClick={() => setActiveFilter('')}
                className={`text-xs px-3 py-1.5 rounded-lg border font-mono transition-all ${
                  !activeFilter ? 'border-[#EF22DA] text-[#EF22DA] bg-[#EF22DA]/8' : 'border-white/7 text-[#8e8e93] hover:border-white/15'
                }`}
              >
                All ({references.length})
              </button>
              {FORMATS.map(f => countFor(f.key) > 0 && (
                <button
                  key={f.key}
                  onClick={() => setActiveFilter(activeFilter === f.key ? '' : f.key)}
                  className={`text-xs px-3 py-1.5 rounded-lg border font-mono transition-all ${
                    activeFilter === f.key ? 'border-[#EF22DA] text-[#EF22DA] bg-[#EF22DA]/8' : 'border-white/7 text-[#8e8e93] hover:border-white/15'
                  }`}
                >
                  {f.emoji} {f.name} ({countFor(f.key)})
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className="text-sm text-[#8e8e93] text-center mt-20">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <div className="text-4xl mb-4">🎬</div>
                <p className="text-[#8e8e93] text-sm">
                  {references.length === 0
                    ? 'Pick a format and drop a video URL to start building the library.'
                    : 'No references for this format yet.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 max-w-3xl">
              {filtered.map(r => <ReferenceCard key={r.id} ref={r} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
