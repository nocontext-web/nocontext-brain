'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { CREATOR_TYPES, COUNTRIES } from '@/lib/creator-taxonomy'
import { FacetFilter } from '@/app/components/FacetFilter'

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
  city: string
  country: string
  status: string
  notes: string
  creator_campaigns: Campaign[]
}

const STATUSES = ['scouted', 'prospect', 'active', 'complete', 'fell_through']

const STATUS_DOT: Record<string, string> = {
  scouted: 'bg-amber-400/60',
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

function locationLabel(c: Creator) {
  return [c.city, c.country].filter(Boolean).join(', ') || c.location || ''
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

function ImportTab({ onAdded }: { onAdded: (creator: Creator) => void }) {
  const [urls, setUrls] = useState<string[]>([])
  const [inputVal, setInputVal] = useState('')
  const [note, setNote] = useState('')
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
        body: JSON.stringify({ igUrl: igProfile, ttUrl: ttProfile, videoUrl: video, note: note.trim() || undefined }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Import failed'); return }
      if (json.warnings?.length) setWarnings(json.warnings)
      onAdded(json.creator)
      setUrls([])
      setNote('')
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
    <div>
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

      <input
        type="text"
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder='Optional note — "good NYC comedian" — this steers the tags and location'
        className="w-full bg-transparent border border-black/[0.07] rounded-xl px-3 py-2.5 text-xs text-[#1c1c1e] placeholder:text-[#8e8e93] focus:outline-none focus:border-black/[0.14] transition-colors mb-3"
      />

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

function LightreelResultList({ result }: { result: { creators: Creator[]; conversationId?: string } | null }) {
  if (!result) return null
  if (!result.creators.length) {
    return <p className="text-xs text-[#8e8e93] font-mono mt-3">No matches came back for that one.</p>
  }
  return (
    <div className="mt-3 flex flex-col gap-1.5">
      <p className="text-[11px] text-[#8e8e93] font-mono">Filed {result.creators.length} as scouted — review below.</p>
      {result.creators.map(c => (
        <div key={c.id} className="text-xs text-[#3a3a3c] bg-black/[0.02] rounded-lg px-3 py-2">
          <span className="font-medium">{c.name || 'Unnamed'}</span>
          {c.ig_handle && <span className="text-[#8e8e93] ml-2">{c.ig_handle}</span>}
          {c.tt_handle && <span className="text-[#8e8e93] ml-2">{c.tt_handle}</span>}
        </div>
      ))}
    </div>
  )
}

function FindTab({ onAdded }: { onAdded: (creators: Creator[]) => void }) {
  const [mode, setMode] = useState<'brief' | 'similar'>('brief')
  const [brief, setBrief] = useState('')
  const [referenceUrl, setReferenceUrl] = useState('')
  const [note, setNote] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ creators: Creator[]; conversationId?: string } | null>(null)

  async function run() {
    setError('')
    setResult(null)
    setRunning(true)
    try {
      const res = await fetch(mode === 'brief' ? '/api/creators/discover' : '/api/creators/discover-similar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'brief' ? { brief } : { referenceUrl, note: note.trim() || undefined }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Lightreel search failed'); return }
      setResult({ creators: json.creators ?? [], conversationId: json.conversationId })
      if (json.creators?.length) onAdded(json.creators)
    } catch {
      setError('Something went wrong')
    } finally {
      setRunning(false)
    }
  }

  const canRun = mode === 'brief' ? brief.trim().length > 0 : referenceUrl.trim().length > 0

  return (
    <div>
      <div className="flex gap-1 mb-3">
        {(['brief', 'similar'] as const).map(m => (
          <button
            key={m}
            onClick={() => { setMode(m); setResult(null); setError('') }}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition-colors ${
              mode === m ? 'bg-black/[0.05] text-[#1c1c1e]' : 'text-[#8e8e93] hover:text-[#6c6c70]'
            }`}
          >
            {m === 'brief' ? 'From a brief' : 'Similar to a video'}
          </button>
        ))}
      </div>

      {mode === 'brief' ? (
        <textarea
          value={brief}
          onChange={e => setBrief(e.target.value)}
          placeholder='e.g. "good NYC comedian, TikTok, 50k+ followers, talking-head style"'
          rows={2}
          className="w-full bg-transparent border border-black/[0.07] rounded-xl px-3 py-2.5 text-xs text-[#1c1c1e] placeholder:text-[#8e8e93] focus:outline-none focus:border-black/[0.14] transition-colors mb-3 resize-none"
        />
      ) : (
        <>
          <input
            type="text"
            value={referenceUrl}
            onChange={e => setReferenceUrl(e.target.value)}
            placeholder="Paste a TikTok or Instagram video URL"
            className="w-full bg-transparent border border-black/[0.07] rounded-xl px-3 py-2.5 text-xs text-[#1c1c1e] placeholder:text-[#8e8e93] focus:outline-none focus:border-black/[0.14] transition-colors mb-3"
          />
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Optional — what to look for (default: same hook/format style)"
            className="w-full bg-transparent border border-black/[0.07] rounded-xl px-3 py-2.5 text-xs text-[#1c1c1e] placeholder:text-[#8e8e93] focus:outline-none focus:border-black/[0.14] transition-colors mb-3"
          />
        </>
      )}

      {error && <p className="text-xs text-red-400/70 font-mono mb-3">{error}</p>}

      <button
        onClick={run}
        disabled={!canRun || running}
        className="bg-[#EF22DA] text-black text-sm font-bold px-4 py-2 rounded-lg disabled:opacity-25 hover:opacity-90 transition-all active:scale-[0.98]"
      >
        {running ? 'Lightreel is searching…' : 'Search with Lightreel'}
      </button>
      {running && (
        <p className="text-[11px] text-[#8e8e93] font-mono mt-2">
          This is a live research agent, not a lookup — it can genuinely take a few minutes.
        </p>
      )}

      <LightreelResultList result={result} />
    </div>
  )
}

function AddPanel({ onAdded }: { onAdded: (creators: Creator[]) => void }) {
  const [tab, setTab] = useState<'import' | 'find'>('import')

  return (
    <div className="bg-white border border-black/[0.07] rounded-2xl p-5 mb-6 animate-slide-up">
      <div className="flex gap-1 mb-4">
        {(['import', 'find'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              tab === t ? 'bg-[#EF22DA]/10 text-[#EF22DA]' : 'text-[#8e8e93] hover:text-[#6c6c70]'
            }`}
          >
            {t === 'import' ? 'Import a link' : 'Find with Lightreel'}
          </button>
        ))}
      </div>
      {tab === 'import'
        ? <ImportTab onAdded={c => onAdded([c])} />
        : <FindTab onAdded={onAdded} />}
    </div>
  )
}

export default function CreatorsPage() {
  const [creators, setCreators] = useState<Creator[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [countryFilter, setCountryFilter] = useState<string[]>([])
  const [typeFilter, setTypeFilter] = useState<string[]>([])
  const [showAdd, setShowAdd] = useState(false)

  useEffect(() => {
    fetch('/api/creators')
      .then(r => {
        if (!r.ok) throw new Error('failed')
        return r.json()
      })
      .then(data => setCreators(Array.isArray(data) ? data : []))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }, [])

  const countryOptions = useMemo(
    () => COUNTRIES.map(c => ({ key: c, label: c, count: creators.filter(cr => cr.country === c).length })),
    [creators]
  )

  const typeOptions = useMemo(
    () => CREATOR_TYPES.map(t => ({ key: t, label: t, count: creators.filter(cr => cr.categories?.includes(t)).length })),
    [creators]
  )

  const filtered = useMemo(() => {
    return creators.filter(c => {
      const haystack = [c.name, c.ig_handle, c.tt_handle, c.city, c.country, c.location, ...(c.categories ?? [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      const matchesSearch = !search || haystack.includes(search.toLowerCase())
      const matchesStatus = statusFilter === 'all' || c.status === statusFilter
      const matchesCountry = countryFilter.length === 0 || countryFilter.includes(c.country)
      const matchesType = typeFilter.length === 0 || typeFilter.some(t => c.categories?.includes(t))
      return matchesSearch && matchesStatus && matchesCountry && matchesType
    })
  }, [creators, search, statusFilter, countryFilter, typeFilter])

  function handleAdded(added: Creator[]) {
    setCreators(prev => [...added, ...prev])
  }

  const anyFilterActive = !!search || statusFilter !== 'all' || countryFilter.length > 0 || typeFilter.length > 0

  function clearFilters() {
    setSearch('')
    setStatusFilter('all')
    setCountryFilter([])
    setTypeFilter([])
  }

  return (
    <div className="flex h-full bg-transparent">
      {/* Left panel */}
      <div className="w-[300px] shrink-0 border-r border-black/[0.06] flex flex-col overflow-y-auto">
        <div className="px-6 pt-7 pb-5 border-b border-black/[0.06]">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#8e8e93] mb-1">Talent</p>
          <h1 className="text-lg font-semibold text-[#1c1c1e] tracking-tight">Creators</h1>
          <p className="text-xs text-[#8e8e93] mt-0.5">{creators.length} on roster</p>
        </div>

        <div className="p-5 flex flex-col gap-5">
          <div className="flex flex-col gap-3 px-1">
            <input
              type="text"
              placeholder="Search name, handle, city..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white border border-black/[0.07] rounded-xl px-3 py-2.5 text-xs text-[#1c1c1e] placeholder:text-[#8e8e93] focus:outline-none focus:border-black/[0.14] transition-colors"
            />
            {anyFilterActive && (
              <button
                onClick={clearFilters}
                className="self-start text-[10px] font-mono uppercase tracking-widest text-[#8e8e93] hover:text-[#1c1c1e] transition-colors"
              >
                Clear filters
              </button>
            )}
          </div>

          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-[#8e8e93] mb-1.5 px-3">Status</p>
            <div className="flex flex-col gap-1">
              {['all', ...STATUSES].map(s => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`text-left px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${
                    statusFilter === s ? 'bg-black/[0.04] text-[#1c1c1e]' : 'text-[#8e8e93] hover:text-[#6c6c70]'
                  }`}
                >
                  {s === 'all' ? 'All' : statusLabel(s)}
                  <span className="float-right text-[#8e8e93]">
                    {s === 'all' ? creators.length : creators.filter(c => c.status === s).length}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <FacetFilter title="Country" options={countryOptions} selected={countryFilter} onChange={setCountryFilter} />
          <FacetFilter title="Type" options={typeOptions} selected={typeFilter} onChange={setTypeFilter} />

          <button
            onClick={() => setShowAdd(!showAdd)}
            className="w-full bg-[#EF22DA]/10 border border-[#EF22DA]/20 text-[#EF22DA] text-xs font-semibold py-2.5 rounded-xl hover:bg-[#EF22DA]/15 transition-colors"
          >
            + Add Creator
          </button>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 overflow-y-auto p-6">
        {showAdd && <AddPanel onAdded={handleAdded} />}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="rounded-2xl border border-black/[0.07] bg-white p-5 flex flex-col gap-3">
                <div className="shimmer h-3 w-16 rounded" />
                <div className="shimmer h-4 w-32 rounded" />
                <div className="shimmer h-3 w-24 rounded" />
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div className="h-full flex flex-col items-center justify-center gap-1">
            <p className="text-sm text-[#1c1c1e] font-medium">Couldn't load the roster</p>
            <p className="text-xs text-[#8e8e93]">The creators table may be missing — check the Supabase schema.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3">
            <p className="text-sm text-[#8e8e93]">
              {anyFilterActive ? 'No creators match' : 'No creators yet — add one above'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map(creator => (
              <a
                key={creator.id}
                href={`/creators/${creator.id}`}
                className="block bg-white border border-black/[0.07] rounded-2xl p-5 hover:border-black/[0.14] hover:shadow-sm transition-all group animate-slide-up"
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

                <h3 className="font-semibold text-[#1c1c1e] mb-0.5 group-hover:text-[#EF22DA] transition-colors">
                  {creator.name || 'Unnamed creator'}
                </h3>
                {locationLabel(creator) && (
                  <p className="text-[11px] text-[#8e8e93] mb-3">{locationLabel(creator)}</p>
                )}

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
