'use client'

import { useState, useRef, useEffect, KeyboardEvent } from 'react'

type VideoResult = {
  platform: 'TikTok' | 'Instagram'
  url: string
  caption: string
  views: number
  likes: number
  comments: number
  shares: number
  author: string
  thumbnailUrl: string
  analysis: string
}

type VideoState = {
  url: string
  status: 'fetching' | 'downloading' | 'analysing' | 'done' | 'error'
  result?: VideoResult
  error?: string
}

type Board = {
  id: string
  name: string
  keywords: string[]
  platforms: string[]
  client_name: string | null
  video_count: number
  rollup_report?: string | null
  rollup_generated_at?: string | null
}

type Pattern = {
  id: string
  platform: 'TikTok' | 'Instagram'
  author: string | null
  video_url: string
  caption: string | null
  thumbnail_url: string | null
  views: number
  likes: number
  shares: number
  saves: number
  comments: number
  virality_score: number | null
  hook: string | null
  format: string | null
  why_it_popped: string | null
  pattern: string | null
  no_context_angles: string | null
  full_analysis: string | null
  comment_analysis: { questions: string[]; objections: string[]; audienceLanguage: string } | null
  graduated: boolean
}

function formatNum(n: number): string {
  if (!n) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function detectPlatform(url: string): 'tiktok' | 'instagram' | null {
  if (url.includes('tiktok.com')) return 'tiktok'
  if (url.includes('instagram.com')) return 'instagram'
  return null
}

function parseAnalysis(text: string): Record<string, string> {
  const sections: Record<string, string> = {}
  const keys = ['HOOK', 'FORMAT', 'WHY IT HITS', 'THE PATTERN', 'NO CONTEXT ANGLES']
  const escaped = keys.map(k => k.replace(/ /g, '\\s+'))
  const pattern = new RegExp(`(${escaped.join('|')}):`, 'g')

  const matches: { key: string; index: number }[] = []
  let m
  while ((m = pattern.exec(text)) !== null) {
    matches.push({ key: m[1].replace(/\s+/g, ' '), index: m.index + m[0].length })
  }
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index
    const end = i + 1 < matches.length ? matches[i + 1].index - matches[i + 1].key.length - 1 : text.length
    sections[matches[i].key] = text.slice(start, end).trim()
  }
  return sections
}

const SECTION_META: { key: string; label: string; accent?: boolean }[] = [
  { key: 'HOOK', label: 'Hook' },
  { key: 'FORMAT', label: 'Format' },
  { key: 'WHY IT HITS', label: 'Why it hits', accent: true },
  { key: 'THE PATTERN', label: 'The pattern', accent: true },
  { key: 'NO CONTEXT ANGLES', label: 'NO CONTEXT angles', accent: true },
]

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-black/[0.07] bg-white overflow-hidden">
      <div className="p-5 border-b border-black/[0.06] flex items-center gap-3">
        <div className="shimmer h-5 w-16 rounded-full" />
        <div className="shimmer h-4 w-24 rounded" />
      </div>
      <div className="p-5 flex flex-col gap-4">
        {[80, 60, 90, 70].map((w, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="shimmer h-3 w-20 rounded" />
            <div className={`shimmer h-4 rounded`} style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
    </div>
  )
}

function StatusCard({ state }: { state: VideoState }) {
  const platform = detectPlatform(state.url)
  return (
    <div className="rounded-2xl border border-black/[0.07] bg-white overflow-hidden">
      <div className="p-5 flex items-center gap-3">
        <span className={`text-[10px] font-mono uppercase tracking-widest px-2.5 py-1 rounded-full border ${
          platform === 'tiktok'
            ? 'border-white/10 text-black/30'
            : 'border-[#EF22DA]/20 text-[#EF22DA]/40'
        }`}>
          {platform === 'tiktok' ? 'TikTok' : 'Instagram'}
        </span>
        <div className="flex items-center gap-2 ml-auto">
          <div className="flex gap-0.5">
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className="w-1 h-1 rounded-full bg-[#EF22DA]"
                style={{ animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite` }}
              />
            ))}
          </div>
          <span className="text-xs text-[#6c6c70] font-mono">
            {state.status === 'fetching' ? 'fetching video data...' : state.status === 'downloading' ? 'downloading video...' : 'gemini is watching...'}
          </span>
        </div>
      </div>
    </div>
  )
}

function ResultCard({ state }: { state: VideoState }) {
  if (state.status === 'error') {
    return (
      <div className="rounded-2xl border border-red-500/10 bg-white p-5">
        <p className="text-xs font-mono text-red-400/60">{state.error}</p>
      </div>
    )
  }

  if (state.status === 'fetching' || state.status === 'downloading' || state.status === 'analysing') {
    return <StatusCard state={state} />
  }

  if (!state.result) return null

  const sections = parseAnalysis(state.result.analysis)

  return (
    <div className="rounded-2xl border border-black/[0.07] bg-white overflow-hidden animate-slide-up">
      <div className="px-5 py-4 border-b border-black/[0.06] flex items-center gap-3">
        <span className={`text-[10px] font-mono uppercase tracking-widest px-2.5 py-1 rounded-full border ${
          state.result.platform === 'TikTok'
            ? 'border-white/10 text-black/30'
            : 'border-[#EF22DA]/20 text-[#EF22DA]/40'
        }`}>
          {state.result.platform}
        </span>
        {state.result.author && (
          <span className="text-sm text-[#6c6c70]">@{state.result.author}</span>
        )}
        <a
          href={state.result.url}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-[#8e8e93] hover:text-[#6c6c70] transition-colors"
          title="View original"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 12L12 2M12 2H6M12 2V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>
      </div>

      <div className="divide-y divide-white/[0.04]">
        {SECTION_META.map(({ key, label, accent }) => {
          const value = sections[key]
          if (!value) return null
          return (
            <div key={key} className="px-5 py-4">
              <div className={`font-mono text-[10px] uppercase tracking-widest mb-2 ${
                accent ? 'text-[#EF22DA]/60' : 'text-[#8e8e93]'
              }`}>
                {label}
              </div>
              <div className="text-sm text-[#3a3a3c] leading-relaxed">{value}</div>
            </div>
          )
        })}

        {Object.keys(sections).length === 0 && state.result.analysis && (
          <div className="px-5 py-4">
            <div className="text-sm text-[#3a3a3c] leading-relaxed whitespace-pre-wrap">{state.result.analysis}</div>
          </div>
        )}
      </div>

      <div className="px-5 py-3 border-t border-black/[0.06] flex items-center justify-between">
        <span className="text-[10px] font-mono text-[#8e8e93]">saved to caspar</span>
        <div className="flex items-center gap-4 text-[11px] font-mono text-[#8e8e93]">
          {state.result.views > 0 && <span>{formatNum(state.result.views)} views</span>}
          {state.result.likes > 0 && <span>{formatNum(state.result.likes)} likes</span>}
        </div>
      </div>
    </div>
  )
}

function UrlChip({ url, onRemove }: { url: string; onRemove: () => void }) {
  const platform = detectPlatform(url)
  const short = url.replace(/https?:\/\/(www\.)?/, '').split('/').slice(0, 3).join('/')
  return (
    <div className="flex items-center gap-2 bg-black/[0.03] border border-black/[0.07] rounded-lg px-3 py-1.5 group">
      <span className={`text-[9px] font-mono uppercase tracking-widest ${
        platform === 'tiktok' ? 'text-black/30' : 'text-[#EF22DA]/40'
      }`}>
        {platform === 'tiktok' ? 'TT' : 'IG'}
      </span>
      <span className="text-xs text-[#6c6c70] font-mono max-w-[180px] truncate">{short}</span>
      <button
        onClick={onRemove}
        className="text-[#8e8e93] hover:text-[#888] transition-colors ml-1 leading-none"
      >
        ×
      </button>
    </div>
  )
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return null
  const color = score >= 60 ? 'text-emerald-600 bg-emerald-500/10' : score >= 35 ? 'text-[#EF22DA] bg-[#EF22DA]/10' : 'text-[#8e8e93] bg-black/[0.04]'
  return <span className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded-full ${color}`}>{score}</span>
}

function VideoCard({ video, onChange }: { video: Pattern; onChange: (v: Pattern) => void }) {
  const [expanded, setExpanded] = useState(false)
  const [analysing, setAnalysing] = useState(false)
  const [gettingComments, setGettingComments] = useState(false)
  const [error, setError] = useState('')

  async function analyse() {
    setAnalysing(true)
    setError('')
    try {
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: [video.video_url] }),
      })
      if (!res.body) throw new Error('No response')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let lastMsg: Record<string, unknown> | null = null
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.trim()) continue
          try { lastMsg = JSON.parse(line) } catch { /* skip */ }
        }
      }
      if (lastMsg?.error) { setError(String(lastMsg.error)); return }
      // Re-fetch this row from the DB — /api/research upserts into
      // research_patterns (by video_url) with fresh stats + virality_score +
      // the analysis, but doesn't return the row shape this page expects.
      const fresh = await fetch(`/api/research/patterns/${video.id}`).then(r => r.json())
      if (fresh && !fresh.error) onChange(fresh)
      setExpanded(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed')
    } finally {
      setAnalysing(false)
    }
  }

  async function getComments() {
    setGettingComments(true)
    setError('')
    try {
      const res = await fetch(`/api/research/patterns/${video.id}/comments`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Comment analysis failed'); return }
      onChange(json)
    } catch {
      setError('Comment analysis failed')
    } finally {
      setGettingComments(false)
    }
  }

  async function toggleGraduate() {
    const res = await fetch(`/api/research/patterns/${video.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ graduated: !video.graduated }),
    })
    const json = await res.json()
    if (!json.error) onChange(json)
  }

  const sections = video.full_analysis ? parseAnalysis(video.full_analysis) : {}

  return (
    <div className="rounded-2xl border border-black/[0.07] bg-white overflow-hidden animate-slide-up">
      <div className="flex gap-3 p-4">
        {video.thumbnail_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={video.thumbnail_url} alt="" className="w-16 h-20 object-cover rounded-lg shrink-0 bg-black/[0.04]" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[9px] font-mono uppercase tracking-widest ${video.platform === 'TikTok' ? 'text-black/30' : 'text-[#EF22DA]/50'}`}>
              {video.platform}
            </span>
            <ScoreBadge score={video.virality_score} />
            {video.graduated && <span className="text-[9px] font-mono uppercase tracking-widest text-emerald-600">Graduated</span>}
          </div>
          <p className="text-sm font-medium text-[#1c1c1e] truncate">@{video.author || 'unknown'}</p>
          <p className="text-[11px] text-[#8e8e93] font-mono mt-0.5">
            {formatNum(video.views)} views · {formatNum(video.likes)} likes · {formatNum(video.comments)} comments
          </p>
          {video.caption && <p className="text-[11px] text-[#6c6c70] mt-1 line-clamp-2">{video.caption}</p>}
        </div>
      </div>

      <div className="px-4 pb-4 flex flex-wrap gap-2">
        <a href={video.video_url} target="_blank" rel="noopener noreferrer" className="text-[11px] font-mono text-[#8e8e93] hover:text-[#6c6c70] px-2.5 py-1.5 rounded-lg border border-black/[0.07]">
          View ↗
        </a>
        {!video.full_analysis ? (
          <button onClick={analyse} disabled={analysing} className="text-[11px] font-semibold text-black bg-[#EF22DA] px-2.5 py-1.5 rounded-lg disabled:opacity-40">
            {analysing ? 'Watching…' : 'Analyse'}
          </button>
        ) : (
          <button onClick={() => setExpanded(e => !e)} className="text-[11px] font-mono text-[#EF22DA] px-2.5 py-1.5 rounded-lg border border-[#EF22DA]/20">
            {expanded ? 'Hide breakdown' : 'Show breakdown'}
          </button>
        )}
        {video.full_analysis && !video.comment_analysis && (
          <button onClick={getComments} disabled={gettingComments} className="text-[11px] font-mono text-[#6c6c70] px-2.5 py-1.5 rounded-lg border border-black/[0.07] disabled:opacity-40">
            {gettingComments ? 'Reading comments…' : 'Read comments'}
          </button>
        )}
        <button onClick={toggleGraduate} className={`text-[11px] font-mono px-2.5 py-1.5 rounded-lg border ${video.graduated ? 'border-emerald-500/30 text-emerald-600' : 'border-black/[0.07] text-[#8e8e93]'}`}>
          {video.graduated ? '✓ In swipe file' : 'Graduate'}
        </button>
      </div>

      {error && <p className="px-4 pb-3 text-[11px] font-mono text-red-400/70">{error}</p>}

      {expanded && (
        <div className="border-t border-black/[0.06] divide-y divide-black/[0.04]">
          {SECTION_META.map(({ key, label, accent }) => {
            const value = sections[key]
            if (!value) return null
            return (
              <div key={key} className="px-4 py-3">
                <div className={`font-mono text-[10px] uppercase tracking-widest mb-1.5 ${accent ? 'text-[#EF22DA]/60' : 'text-[#8e8e93]'}`}>{label}</div>
                <div className="text-sm text-[#3a3a3c] leading-relaxed">{value}</div>
              </div>
            )
          })}
          {video.comment_analysis && (
            <div className="px-4 py-3 bg-black/[0.02]">
              <div className="font-mono text-[10px] uppercase tracking-widest mb-1.5 text-[#8e8e93]">Audience language</div>
              <div className="text-sm text-[#3a3a3c] leading-relaxed">{video.comment_analysis.audienceLanguage || 'Nothing distinct came up.'}</div>
              {video.comment_analysis.questions.length > 0 && (
                <p className="text-[11px] text-[#6c6c70] mt-2">Asks: {video.comment_analysis.questions.join(' · ')}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function CreateBoardForm({ onCreated, onCancel }: { onCreated: (b: Board) => void; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [keywords, setKeywords] = useState<string[]>([])
  const [kwInput, setKwInput] = useState('')
  const [platforms, setPlatforms] = useState<string[]>(['tiktok', 'instagram'])
  const [clients, setClients] = useState<{ id: string; name: string }[]>([])
  const [clientId, setClientId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { fetch('/api/clients').then(r => r.json()).then(setClients).catch(() => {}) }, [])

  function addKeyword(raw: string) {
    const k = raw.trim()
    if (!k || keywords.includes(k)) return
    setKeywords(prev => [...prev, k])
    setKwInput('')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addKeyword(kwInput) }
  }

  function togglePlatform(p: string) {
    setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }

  async function create() {
    setError('')
    if (!name.trim() || !keywords.length) { setError('Name and at least one keyword are required'); return }
    setSaving(true)
    try {
      const client = clients.find(c => c.id === clientId)
      const res = await fetch('/api/research/boards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, keywords, platforms, clientId: clientId || undefined, clientName: client?.name }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Failed to create board'); return }
      onCreated({ ...json, video_count: 0 })
    } catch {
      setError('Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white border border-black/[0.07] rounded-2xl p-5 animate-slide-up">
      <p className="font-mono text-[10px] uppercase tracking-widest text-[#8e8e93] mb-3">New board</p>
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder='Board name — e.g. "Dog content"'
        className="w-full bg-transparent border border-black/[0.07] rounded-xl px-3 py-2.5 text-xs text-[#1c1c1e] placeholder:text-[#8e8e93] focus:outline-none focus:border-black/[0.14] transition-colors mb-3"
      />
      <div className="min-h-[48px] bg-transparent border border-black/[0.07] rounded-xl p-3 flex flex-wrap gap-2 mb-3">
        {keywords.map(k => (
          <span key={k} className="flex items-center gap-1.5 bg-black/[0.03] border border-black/[0.07] rounded-lg px-2.5 py-1 text-[11px] text-[#6c6c70] font-mono">
            {k}
            <button onClick={() => setKeywords(prev => prev.filter(x => x !== k))} className="text-[#8e8e93] hover:text-black ml-0.5 leading-none">×</button>
          </span>
        ))}
        <input
          value={kwInput}
          onChange={e => setKwInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={keywords.length ? '' : 'Keywords/hashtags — press Enter after each'}
          className="flex-1 min-w-[140px] bg-transparent text-xs text-[#1c1c1e] placeholder:text-[#8e8e93] font-mono outline-none py-1"
        />
      </div>

      <div className="flex gap-2 mb-3">
        {(['tiktok', 'instagram'] as const).map(p => (
          <button
            key={p}
            onClick={() => togglePlatform(p)}
            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-mono transition-colors ${
              platforms.includes(p) ? 'bg-[#EF22DA]/10 text-[#EF22DA] border border-[#EF22DA]/20' : 'text-[#8e8e93] border border-black/[0.07]'
            }`}
          >
            {p === 'tiktok' ? 'TikTok' : 'Instagram'}
          </button>
        ))}
      </div>

      {clients.length > 0 && (
        <select
          value={clientId}
          onChange={e => setClientId(e.target.value)}
          className="w-full bg-transparent border border-black/[0.07] rounded-xl px-3 py-2.5 text-xs text-[#1c1c1e] focus:outline-none focus:border-black/[0.14] transition-colors mb-3"
        >
          <option value="">No client — general research</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}

      {error && <p className="text-xs text-red-400/70 font-mono mb-3">{error}</p>}

      <div className="flex gap-2">
        <button onClick={create} disabled={saving} className="bg-[#EF22DA] text-black text-sm font-bold px-4 py-2 rounded-lg disabled:opacity-40">
          {saving ? 'Creating…' : 'Create board'}
        </button>
        <button onClick={onCancel} className="text-sm text-[#8e8e93] hover:text-[#1c1c1e] px-3 py-2">Cancel</button>
      </div>
    </div>
  )
}

function BoardView({ board, onBoardUpdate }: { board: Board; onBoardUpdate: (b: Board) => void }) {
  const [videos, setVideos] = useState<Pattern[]>([])
  const [loading, setLoading] = useState(true)
  const [pulling, setPulling] = useState(false)
  const [pullError, setPullError] = useState('')
  const [generatingReport, setGeneratingReport] = useState(false)
  const [showReport, setShowReport] = useState(false)

  function load() {
    setLoading(true)
    fetch(`/api/research/boards/${board.id}`)
      .then(r => r.json())
      .then(data => { setVideos(data.videos ?? []); onBoardUpdate(data) })
      .finally(() => setLoading(false))
  }

  useEffect(load, [board.id])

  async function pull() {
    setPulling(true)
    setPullError('')
    try {
      const res = await fetch(`/api/research/boards/${board.id}/pull`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) { setPullError(json.error || 'Pull failed'); return }
      load()
    } catch {
      setPullError('Something went wrong')
    } finally {
      setPulling(false)
    }
  }

  async function generateReport() {
    setGeneratingReport(true)
    try {
      const res = await fetch(`/api/research/boards/${board.id}/report`, { method: 'POST' })
      const json = await res.json()
      if (res.ok) { onBoardUpdate(json); setShowReport(true) }
      else setPullError(json.error || 'Rollup failed')
    } finally {
      setGeneratingReport(false)
    }
  }

  function updateVideo(v: Pattern) {
    setVideos(prev => prev.map(x => x.id === v.id ? v : x))
  }

  const analysedCount = videos.filter(v => v.full_analysis).length

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold text-[#1c1c1e] mb-1">{board.name}</h2>
          <p className="text-xs text-[#8e8e93] font-mono">
            {board.keywords.join(', ')} {board.client_name ? `· ${board.client_name}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={pull} disabled={pulling} className="bg-[#EF22DA] text-black text-sm font-bold px-4 py-2 rounded-xl disabled:opacity-40">
            {pulling ? 'Pulling…' : 'Pull latest'}
          </button>
          {analysedCount > 0 && (
            <button onClick={generateReport} disabled={generatingReport} className="bg-white border border-black/[0.07] text-[#1c1c1e] text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-40">
              {generatingReport ? 'Synthesising…' : 'Generate rollup'}
            </button>
          )}
        </div>
      </div>

      {pulling && <p className="text-[11px] text-[#8e8e93] font-mono">Apify is searching {board.platforms.join(' + ')} — this can take a minute or two for a keyword set.</p>}
      {pullError && <p className="text-[11px] text-red-400/70 font-mono">{pullError}</p>}

      {board.rollup_report && (
        <div className="bg-white border border-[#EF22DA]/20 rounded-2xl p-5 animate-slide-up">
          <button onClick={() => setShowReport(s => !s)} className="flex items-center justify-between w-full">
            <p className="font-mono text-[10px] uppercase tracking-widest text-[#EF22DA]/70">Rollup report</p>
            <span className="text-[#8e8e93] text-xs">{showReport ? 'Hide' : 'Show'}</span>
          </button>
          {showReport && <p className="text-sm text-[#3a3a3c] leading-relaxed whitespace-pre-wrap mt-3">{board.rollup_report}</p>}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {[0, 1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : videos.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-16">
          <p className="text-sm text-[#8e8e93]">No videos pulled yet.</p>
          <button onClick={pull} className="text-[#EF22DA] text-sm font-semibold">Pull latest →</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {videos.map(v => <VideoCard key={v.id} video={v} onChange={updateVideo} />)}
        </div>
      )}
    </div>
  )
}

function QuickAnalyze() {
  const [inputVal, setInputVal] = useState('')
  const [urls, setUrls] = useState<string[]>([])
  const [videos, setVideos] = useState<VideoState[]>([])
  const [running, setRunning] = useState(false)
  const [clients, setClients] = useState<{id: string; name: string}[]>([])
  const [selectedClient, setSelectedClient] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/clients').then(r => r.json()).then(setClients).catch(() => {})
  }, [])

  function addUrl(raw: string) {
    const url = raw.trim()
    if (!url || urls.includes(url)) return
    setUrls(prev => [...prev, url])
    setInputVal('')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Tab') {
      e.preventDefault()
      addUrl(inputVal)
    }
    if (e.key === 'Backspace' && !inputVal && urls.length) {
      setUrls(prev => prev.slice(0, -1))
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const text = e.clipboardData.getData('text')
    const lines = text.split(/[\n\s]+/).filter(l => l.startsWith('http'))
    if (lines.length > 1) {
      lines.forEach(addUrl)
    } else {
      addUrl(text)
    }
  }

  async function analyse() {
    if (!urls.length || running) return
    setRunning(true)
    setVideos(urls.map(url => ({ url, status: 'fetching' })))

    try {
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      })
      if (!res.body) return

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const msg = JSON.parse(line)
            setVideos(prev => prev.map(v =>
              v.url !== msg.url ? v :
              msg.error ? { ...v, status: 'error', error: msg.error } :
              msg.status === 'done' ? { ...v, status: 'done', result: msg.result } :
              { ...v, status: msg.status }
            ))
          } catch { /* skip */ }
        }
      }
    } finally {
      setRunning(false)
    }
  }

  const doneCount = videos.filter(v => v.status === 'done').length

  return (
    <div className="flex h-full">
      <div className="w-[320px] shrink-0 border-r border-black/[0.06] flex flex-col">
        <div className="flex-1 p-5 flex flex-col gap-4">
          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-[#8e8e93] mb-2.5 block">URLs</label>
            <div
              className="min-h-[80px] bg-white border border-black/[0.07] rounded-xl p-3 flex flex-wrap gap-2 cursor-text focus-within:border-black/[0.14] transition-colors"
              onClick={() => inputRef.current?.focus()}
            >
              {urls.map(url => (
                <UrlChip key={url} url={url} onRemove={() => setUrls(prev => prev.filter(u => u !== url))} />
              ))}
              <input
                ref={inputRef}
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={urls.length ? '' : 'Paste a URL and press Enter'}
                className="flex-1 min-w-[120px] bg-transparent text-xs text-[#1c1c1e] placeholder:text-[#8e8e93] font-mono outline-none py-1"
              />
            </div>
            <p className="text-[10px] text-[#8e8e93] font-mono mt-1.5">TikTok + Instagram · press Enter after each URL</p>
          </div>

          {clients.length > 0 && (
            <div>
              <label className="font-mono text-[10px] uppercase tracking-widest text-[#8e8e93] mb-2 block">Client (optional)</label>
              <select
                value={selectedClient}
                onChange={e => setSelectedClient(e.target.value)}
                className="w-full bg-white border border-black/[0.07] rounded-xl px-3 py-2.5 text-xs text-[#1c1c1e] focus:outline-none focus:border-black/[0.14] transition-colors"
              >
                <option value="">General patterns</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}

          <button
            onClick={analyse}
            disabled={running || !urls.length}
            className="w-full bg-[#EF22DA] text-black text-sm font-bold py-3 rounded-xl disabled:opacity-25 hover:opacity-90 active:scale-[0.98] transition-all"
          >
            {running ? 'Analysing' : `Analyse${urls.length > 1 ? ` ${urls.length} videos` : ''}`}
          </button>

          {videos.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between mb-0.5">
                <span className="font-mono text-[10px] uppercase tracking-widest text-[#8e8e93]">Progress</span>
                <span className="font-mono text-[10px] text-[#6c6c70]">{doneCount}/{videos.length}</span>
              </div>
              <div className="h-0.5 bg-black/[0.04] rounded-full overflow-hidden">
                <div className="h-full bg-[#EF22DA] rounded-full transition-all duration-500" style={{ width: `${videos.length ? (doneCount / videos.length) * 100 : 0}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {videos.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 px-8">
            <div className="w-10 h-10 rounded-2xl bg-white border border-black/[0.07] flex items-center justify-center text-xl mb-1">🎯</div>
            <p className="text-sm text-[#8e8e93] text-center max-w-xs leading-relaxed">
              Paste TikTok or Instagram Reels URLs. Hit Analyse. Get back what works and why.
            </p>
          </div>
        ) : (
          <div className="p-6 flex flex-col gap-4 max-w-2xl">
            {videos.map(v =>
              v.status === 'fetching' || v.status === 'downloading' || v.status === 'analysing'
                ? <SkeletonCard key={v.url} />
                : <ResultCard key={v.url} state={v} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function ResearchPage() {
  const [boards, setBoards] = useState<Board[]>([])
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [loadingBoards, setLoadingBoards] = useState(true)

  useEffect(() => {
    fetch('/api/research/boards').then(r => r.json()).then(data => setBoards(Array.isArray(data) ? data : [])).finally(() => setLoadingBoards(false))
  }, [])

  const selectedBoard = boards.find(b => b.id === selectedBoardId) ?? null

  function handleBoardCreated(b: Board) {
    setBoards(prev => [b, ...prev])
    setShowCreate(false)
    setSelectedBoardId(b.id)
  }

  function handleBoardUpdate(updated: Partial<Board> & { id: string }) {
    setBoards(prev => prev.map(b => b.id === updated.id ? { ...b, ...updated } : b))
  }

  return (
    <div className="flex h-full bg-transparent">
      {/* Left panel */}
      <div className="w-[280px] shrink-0 border-r border-black/[0.06] flex flex-col overflow-y-auto">
        <div className="px-6 pt-7 pb-5 border-b border-black/[0.06]">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#8e8e93] mb-1">Content Intelligence</p>
          <h1 className="text-lg font-semibold text-[#1c1c1e] tracking-tight">Research</h1>
        </div>

        <div className="p-4 flex flex-col gap-1">
          <button
            onClick={() => setSelectedBoardId(null)}
            className={`text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
              !selectedBoardId ? 'bg-white shadow-sm text-[#1c1c1e]' : 'text-[#6c6c70] hover:bg-black/[0.03]'
            }`}
          >
            🎯 Quick analyse
          </button>
        </div>

        <div className="px-4 pb-2 flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#8e8e93]">Boards</p>
          <button onClick={() => { setShowCreate(true); setSelectedBoardId(null) }} className="text-[#EF22DA] text-xs font-semibold">+ New</button>
        </div>
        <div className="px-4 pb-4 flex flex-col gap-1">
          {loadingBoards ? (
            <div className="shimmer h-8 rounded-lg" />
          ) : boards.length === 0 ? (
            <p className="text-[11px] text-[#8e8e93] px-3">No boards yet — pull keyword research into one.</p>
          ) : (
            boards.map(b => (
              <button
                key={b.id}
                onClick={() => { setSelectedBoardId(b.id); setShowCreate(false) }}
                className={`text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-between ${
                  selectedBoardId === b.id ? 'bg-white shadow-sm text-[#1c1c1e]' : 'text-[#6c6c70] hover:bg-black/[0.03]'
                }`}
              >
                <span className="truncate">{b.name}</span>
                <span className="text-[#8e8e93] font-mono text-[10px] ml-2 shrink-0">{b.video_count}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 overflow-y-auto">
        {showCreate ? (
          <div className="p-6 max-w-lg">
            <CreateBoardForm onCreated={handleBoardCreated} onCancel={() => setShowCreate(false)} />
          </div>
        ) : selectedBoard ? (
          <div className="p-6 max-w-4xl">
            <BoardView board={selectedBoard} onBoardUpdate={handleBoardUpdate} />
          </div>
        ) : (
          <QuickAnalyze />
        )}
      </div>
    </div>
  )
}
