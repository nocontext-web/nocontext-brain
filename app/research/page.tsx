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

      {/* Header */}
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

      {/* Analysis — hero content */}
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

        {/* Fallback if sections didn't parse */}
        {Object.keys(sections).length === 0 && state.result.analysis && (
          <div className="px-5 py-4">
            <div className="text-sm text-[#3a3a3c] leading-relaxed whitespace-pre-wrap">{state.result.analysis}</div>
          </div>
        )}
      </div>

      {/* Footer */}
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

export default function ResearchPage() {
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
    <div className="flex h-full bg-transparent">
      <style>{`
        @keyframes fadeDot {
          0%, 100% { opacity: 0.2; }
          50% { opacity: 1; }
        }
      `}</style>

      {/* Left panel */}
      <div className="w-[320px] shrink-0 border-r border-black/[0.06] flex flex-col">
        <div className="px-6 pt-7 pb-5 border-b border-black/[0.06]">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#8e8e93] mb-1">Content Intelligence</p>
          <h1 className="text-lg font-semibold text-[#1c1c1e] tracking-tight">Research</h1>
        </div>

        <div className="flex-1 p-5 flex flex-col gap-4">
          {/* URL input area */}
          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-[#8e8e93] mb-2.5 block">
              URLs
            </label>

            {/* Chips + input */}
            <div
              className="min-h-[80px] bg-white border border-black/[0.07] rounded-xl p-3 flex flex-wrap gap-2 cursor-text focus-within:border-black/[0.14] transition-colors"
              onClick={() => inputRef.current?.focus()}
            >
              {urls.map(url => (
                <UrlChip
                  key={url}
                  url={url}
                  onRemove={() => setUrls(prev => prev.filter(u => u !== url))}
                />
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
            <p className="text-[10px] text-[#8e8e93] font-mono mt-1.5">
              TikTok + Instagram · press Enter after each URL
            </p>
          </div>

          {/* Client selector */}
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
            {running ? (
              <span className="flex items-center justify-center gap-2">
                <span className="flex gap-1">
                  {[0, 1, 2].map(i => (
                    <span
                      key={i}
                      className="w-1 h-1 bg-black rounded-full inline-block"
                      style={{ animation: `fadeDot 1.2s ease ${i * 0.2}s infinite` }}
                    />
                  ))}
                </span>
                Analysing
              </span>
            ) : `Analyse${urls.length > 1 ? ` ${urls.length} videos` : ''}`}
          </button>

          {/* Progress */}
          {videos.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between mb-0.5">
                <span className="font-mono text-[10px] uppercase tracking-widest text-[#8e8e93]">Progress</span>
                <span className="font-mono text-[10px] text-[#6c6c70]">{doneCount}/{videos.length}</span>
              </div>

              {/* Progress bar */}
              <div className="h-0.5 bg-black/[0.04] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#EF22DA] rounded-full transition-all duration-500"
                  style={{ width: `${videos.length ? (doneCount / videos.length) * 100 : 0}%` }}
                />
              </div>

              <div className="flex flex-col gap-1 mt-1">
                {videos.map(v => (
                  <div key={v.url} className="flex items-center gap-2.5">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${
                      v.status === 'done' ? 'bg-emerald-500/60' :
                      v.status === 'error' ? 'bg-red-500/40' :
                      'bg-[#EF22DA]'
                    }`}
                    style={v.status !== 'done' && v.status !== 'error'
                      ? { animation: 'pulse 1s ease-in-out infinite' }
                      : undefined}
                    />
                    <span className="text-[11px] text-[#8e8e93] font-mono truncate">
                      {v.url.replace(/https?:\/\/(www\.)?/, '').split('/').slice(0, 2).join('/')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right panel — results */}
      <div className="flex-1 overflow-y-auto">
        {videos.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 px-8">
            <div className="w-10 h-10 rounded-2xl bg-white border border-black/[0.07] flex items-center justify-center text-xl mb-1">
              🎯
            </div>
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
