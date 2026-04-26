'use client'

import { useState, useEffect, useMemo, useRef } from 'react'

type Campaign = { id: string; client_name: string; status: string }
type Creator = {
  id: string
  name: string
  ig_handle: string
  ig_followers: string
  tt_handle: string
  tt_followers: string
  tier: string
  categories: string[]
  location: string
  status: string
  notes: string
  creator_campaigns: Campaign[]
}

const STATUSES = ['prospect', 'active', 'complete', 'fell_through']

const STATUS_DOT: Record<string, string> = {
  active: 'bg-[#EF22DA]',
  prospect: 'bg-black/[0.06]',
  complete: 'bg-emerald-500/60',
  fell_through: 'bg-black/[0.04]',
}

const TIER_LABEL: Record<string, string> = {
  micro: 'Micro',
  mid: 'Mid',
  macro: 'Macro',
  celebrity: 'Celebrity',
}

function statusLabel(s: string) {
  if (s === 'fell_through') return 'Fell Through'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function detectUrlType(url: string): 'ig-profile' | 'tt-profile' | 'ig-video' | 'tt-video' | null {
  if (url.includes('instagram.com')) {
    // Video: contains /reel/ or /p/
    if (url.includes('/reel/') || url.includes('/p/')) return 'ig-video'
    return 'ig-profile'
  }
  if (url.includes('tiktok.com')) {
    if (url.includes('/video/')) return 'tt-video'
    return 'tt-profile'
  }
  return null
}

function ImportPanel({ onAdded }: { onAdded: (creator: Creator) => void }) {
  const [urls, setUrls] = useState<string[]>([])
  const [inputVal, setInputVal] = useState('')
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  function addUrl(raw: string) {
    const u = raw.trim()
    if (!u || urls.includes(u)) return
    if (!detectUrlType(u)) return
    setUrls(prev => [...prev, u])
    setInputVal('')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addUrl(inputVal) }
    if (e.key === 'Backspace' && !inputVal && urls.length) setUrls(prev => prev.slice(0, -1))
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const lines = e.clipboardData.getData('text').split(/[\n\s]+/).filter(l => l.startsWith('http'))
    if (lines.length > 1) lines.forEach(addUrl)
    else addUrl(e.clipboardData.getData('text'))
  }

  async function runImport() {
    setError('')
    setWarnings([])
    setImporting(true)

    const igProfile = urls.find(u => detectUrlType(u) === 'ig-profile')
    const ttProfile = urls.find(u => detectUrlType(u) === 'tt-profile')
    const video = urls.find(u => detectUrlType(u) === 'ig-video' || detectUrlType(u) === 'tt-video')

    try {
      const res = await fetch('/api/creators/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ igUrl: igProfile, ttUrl: ttProfile, videoUrl: video }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Import failed'); return }
      if (json.warnings?.length) setWarnings(json.warnings)
      onAdded(json.creator)
      setUrls([])
    } catch {
      setError('Something went wrong')
    } finally {
      setImporting(false)
    }
  }

  const igProfile = urls.find(u => detectUrlType(u) === 'ig-profile')
  const ttProfile = urls.find(u => detectUrlType(u) === 'tt-profile')
  const video = urls.find(u => detectUrlType(u) === 'ig-video' || detectUrlType(u) === 'tt-video')
  const hasProfile = !!(igProfile || ttProfile)

  return (
    <div className="bg-white border border-black/[0.07] rounded-2xl p-5 mb-6">
      <p className="font-mono text-[10px] uppercase tracking-widest text-[#8e8e93] mb-3">Add Creator</p>

      {/* URL chips + input */}
      <div
        className="min-h-[60px] bg-transparent border border-black/[0.07] rounded-xl p-3 flex flex-wrap gap-2 cursor-text focus-within:border-black/[0.14] transition-colors mb-3"
        onClick={() => inputRef.current?.focus()}
      >
        {urls.map(u => {
          const type = detectUrlType(u)
          const label = type === 'ig-profile' ? 'IG' : type === 'tt-profile' ? 'TT' : type === 'ig-video' ? 'IG video' : 'TT video'
          const short = u.replace(/https?:\/\/(www\.)?/, '').split('/').slice(0, 3).join('/')
          return (
            <div key={u} className="flex items-center gap-1.5 bg-black/[0.03] border border-black/[0.07] rounded-lg px-2.5 py-1">
              <span className={`text-[9px] font-mono uppercase tracking-widest ${
                label.startsWith('IG') ? 'text-[#EF22DA]/60' : 'text-black/30'
              }`}>{label}</span>
              <span className="text-[11px] text-[#6c6c70] font-mono max-w-[160px] truncate">{short}</span>
              <button onClick={() => setUrls(p => p.filter(x => x !== u))} className="text-[#8e8e93] hover:text-white ml-0.5 leading-none">×</button>
            </div>
          )
        })}
        <input
          ref={inputRef}
          value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={urls.length ? '' : 'Paste Instagram or TikTok URL — profile and/or a video you like'}
          className="flex-1 min-w-[200px] bg-transparent text-xs text-[#1c1c1e] placeholder:text-[#8e8e93] font-mono outline-none py-1"
        />
      </div>

      {/* What's detected */}
      {urls.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-3 text-[11px] font-mono text-[#8e8e93]">
          {igProfile && <span className="text-[#EF22DA]/60">✓ Instagram profile</span>}
          {ttProfile && <span className="text-black/40">✓ TikTok profile</span>}
          {video && <span className="text-[#EF22DA]/40">✓ video — Gemini will analyse their style</span>}
          {!hasProfile && <span className="text-yellow-500/50">Need at least one profile URL</span>}
        </div>
      )}

      {error && <p className="text-xs text-red-400/70 font-mono mb-3">{error}</p>}
      {warnings.map((w, i) => <p key={i} className="text-xs text-yellow-500/50 font-mono mb-1">{w}</p>)}

      <button
        onClick={runImport}
        disabled={!hasProfile || importing}
        className="bg-[#EF22DA] text-black text-sm font-bold px-4 py-2 rounded-lg disabled:opacity-25 hover:opacity-90 transition-all active:scale-[0.98]"
      >
        {importing ? (video ? 'Analysing video…' : 'Importing…') : 'Import Creator'}
      </button>
    </div>
  )
}

export default function CreatorsPage() {
  const [creators, setCreators] = useState<Creator[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    fetch('/api/creators').then(r => r.json()).then(setCreators)
  }, [])

  const filtered = useMemo(() => {
    return creators.filter(c => {
      const matchesSearch = !search || [c.name, c.ig_handle, c.tt_handle, c.location]
        .some(v => v?.toLowerCase().includes(search.toLowerCase()))
      const matchesStatus = statusFilter === 'all' || c.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [creators, search, statusFilter])

  function handleAdded(creator: Creator) {
    setCreators(prev => [creator, ...prev])
    setShowAdd(false)
  }

  return (
    <div className="flex h-full bg-transparent">
      {/* Left panel */}
      <div className="w-[300px] shrink-0 border-r border-black/[0.06] flex flex-col">
        <div className="px-6 pt-7 pb-5 border-b border-black/[0.06]">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#8e8e93] mb-1">Talent</p>
          <h1 className="text-lg font-semibold text-[#1c1c1e] tracking-tight">Creators</h1>
          <p className="text-xs text-[#8e8e93] mt-0.5">{creators.length} on roster</p>
        </div>

        <div className="p-5 flex flex-col gap-3">
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white border border-black/[0.07] rounded-xl px-3 py-2.5 text-xs text-[#1c1c1e] placeholder:text-[#8e8e93] focus:outline-none focus:border-black/[0.14] transition-colors"
          />

          <div className="flex flex-col gap-1">
            {['all', ...STATUSES].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`text-left px-3 py-2 rounded-lg text-xs font-mono transition-colors ${
                  statusFilter === s
                    ? 'bg-black/[0.04] text-[#1c1c1e]'
                    : 'text-[#8e8e93] hover:text-[#6c6c70]'
                }`}
              >
                {s === 'all' ? 'All' : statusLabel(s)}
                <span className="float-right text-[#8e8e93]">
                  {s === 'all' ? creators.length : creators.filter(c => c.status === s).length}
                </span>
              </button>
            ))}
          </div>

          <button
            onClick={() => setShowAdd(!showAdd)}
            className="mt-2 w-full bg-[#EF22DA]/10 border border-[#EF22DA]/20 text-[#EF22DA] text-xs font-semibold py-2.5 rounded-xl hover:bg-[#EF22DA]/15 transition-colors"
          >
            + Add Creator
          </button>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 overflow-y-auto p-6">
        {showAdd && <ImportPanel onAdded={handleAdded} />}

        {filtered.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3">
            <p className="text-sm text-[#8e8e93]">
              {search || statusFilter !== 'all' ? 'No creators match' : 'No creators yet — add one above'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map(creator => (
              <a
                key={creator.id}
                href={`/creators/${creator.id}`}
                className="block bg-white border border-black/[0.07] rounded-2xl p-5 hover:border-black/[0.14] transition-colors group"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[creator.status] ?? 'bg-black/[0.04]'}`} />
                    <span className="font-mono text-[10px] uppercase tracking-widest text-[#8e8e93]">{statusLabel(creator.status)}</span>
                  </div>
                  {creator.tier && (
                    <span className="font-mono text-[10px] uppercase tracking-widest text-[#8e8e93]">{TIER_LABEL[creator.tier]}</span>
                  )}
                </div>

                <h3 className="font-semibold text-[#1c1c1e] mb-3 group-hover:text-[#EF22DA] transition-colors">
                  {creator.name}
                </h3>

                <div className="space-y-1 mb-3">
                  {creator.ig_handle && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#8e8e93] font-mono">IG</span>
                      <span className="text-[#6c6c70]">{creator.ig_handle}</span>
                      {creator.ig_followers && <span className="text-[#8e8e93]">{creator.ig_followers}</span>}
                    </div>
                  )}
                  {creator.tt_handle && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#8e8e93] font-mono">TT</span>
                      <span className="text-[#6c6c70]">{creator.tt_handle}</span>
                      {creator.tt_followers && <span className="text-[#8e8e93]">{creator.tt_followers}</span>}
                    </div>
                  )}
                </div>

                {creator.location && (
                  <p className="text-[11px] text-[#8e8e93] mb-2">{creator.location}</p>
                )}

                {creator.categories?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-2">
                    {creator.categories.slice(0, 3).map(cat => (
                      <span key={cat} className="bg-black/[0.03] text-[#6c6c70] text-[10px] px-2 py-0.5 rounded-full">{cat}</span>
                    ))}
                  </div>
                )}

                {creator.creator_campaigns?.length > 0 && (
                  <div className="border-t border-black/[0.06] pt-2.5 flex flex-wrap gap-1">
                    {[...new Set(creator.creator_campaigns.map(c => c.client_name).filter(Boolean))].map(client => (
                      <span key={client} className="bg-[#EF22DA]/10 text-[#EF22DA] text-[10px] px-2 py-0.5 rounded-full font-medium">{client}</span>
                    ))}
                  </div>
                )}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
