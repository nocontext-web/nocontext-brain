'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

type Client = { id: string; name: string; brief?: string }

type Concept = {
  format: 'lofi' | 'jai' | 'axe'
  title: string
  hook: string
  concept: string
  why?: string
}

const FORMAT_META: Record<string, { label: string; color: string; dot: string; desc: string }> = {
  lofi: { label: 'Lo-Fi',        color: 'text-[#3a3a3c]',   dot: 'bg-[#8a8f98]',  desc: 'Trend-native · raw · quick' },
  jai:  { label: 'Jai Script',   color: 'text-[#EF22DA]',   dot: 'bg-[#EF22DA]',  desc: 'Voiceover storytelling' },
  axe:  { label: 'Axe Video',    color: 'text-violet-400',  dot: 'bg-violet-500', desc: 'Fast-cut · high energy' },
}

function ConceptCard({ concept, onScriptIt }: { concept: Concept; onScriptIt: (c: Concept) => void }) {
  const meta = FORMAT_META[concept.format]
  return (
    <div
      className="group bg-white border border-black/[0.07] rounded-xl overflow-hidden hover:border-black/[0.15] transition-all animate-slide-up"
    >
      <div className="px-4 pt-4 pb-3 border-b border-black/[0.06] flex items-center gap-2">
        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.dot}`} />
        <span className={`text-[10px] font-mono uppercase tracking-widest ${meta.color}`}>{meta.label}</span>
        <span className="text-[10px] font-mono text-[#8e8e93] ml-auto">{meta.desc}</span>
      </div>
      <div className="p-4 flex flex-col gap-3">
        <div>
          <div className="font-semibold text-[#1c1c1e] text-sm leading-snug mb-1">{concept.title}</div>
          <div className="text-xs text-[#EF22DA]/80 font-mono leading-relaxed">{concept.hook}</div>
        </div>
        <p className="text-sm text-[#6c6c70] leading-relaxed">{concept.concept}</p>
        {concept.why && (
          <p className="text-xs text-[#8e8e93] leading-relaxed border-t border-black/[0.05] pt-3">{concept.why}</p>
        )}
      </div>
      <div className="px-4 pb-4">
        <button
          onClick={() => onScriptIt(concept)}
          className="w-full py-2 rounded-lg bg-black/[0.03] border border-black/[0.07] text-xs font-medium text-[#6c6c70] hover:text-[#1c1c1e] hover:bg-black/[0.04] hover:border-black/[0.15] transition-all"
        >
          Script this →
        </button>
      </div>
    </div>
  )
}

function IdeateContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const initialClientId = searchParams.get('clientId') || ''

  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState(initialClientId)
  const [concepts, setConcepts] = useState<Concept[]>([])
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [hasGenerated, setHasGenerated] = useState(false)

  useEffect(() => {
    fetch('/api/clients').then(r => r.json()).then(setClients).catch(() => {})
  }, [])

  async function generate() {
    setGenerating(true)
    setConcepts([])
    setError('')

    try {
      const res = await fetch('/api/ideate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: selectedClient || null }),
      })

      if (!res.body) throw new Error('No response stream')

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
            if (msg.error) setError(msg.error)
            if (msg.concepts) setConcepts(msg.concepts)
          } catch { /* skip */ }
        }
      }

      setHasGenerated(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setGenerating(false)
    }
  }

  function handleScriptIt(concept: Concept) {
    localStorage.setItem('nc_concept', JSON.stringify({
      clientId: selectedClient,
      format: concept.format === 'jai' ? 'jai' : concept.format === 'axe' ? 'axe' : 'lofi',
      title: concept.title,
      hook: concept.hook,
      brief: `${concept.concept}${concept.why ? '\n\nWhy it works: ' + concept.why : ''}`,
    }))
    router.push('/generate')
  }

  const client = clients.find(c => c.id === selectedClient)

  const lofi = concepts.filter(c => c.format === 'lofi')
  const jai  = concepts.filter(c => c.format === 'jai')
  const axe  = concepts.filter(c => c.format === 'axe')

  return (
    <div className="flex h-full bg-transparent">
      {/* Left panel */}
      <div className="w-[280px] shrink-0 border-r border-black/[0.06] flex flex-col">
        <div className="px-6 pt-7 pb-5 border-b border-black/[0.06]">
          <p className="font-mono text-[10px] uppercase tracking-widest text-[#8e8e93] mb-1">Content Engine</p>
          <h1 className="text-lg font-semibold text-[#1c1c1e] tracking-tight">Ideate</h1>
        </div>

        <div className="flex-1 p-5 flex flex-col gap-5">
          {/* Client selector */}
          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-[#8e8e93] mb-2 block">Client</label>
            <select
              value={selectedClient}
              onChange={e => setSelectedClient(e.target.value)}
              className="w-full bg-white border border-black/[0.08] rounded-lg px-3 py-2.5 text-sm text-[#1c1c1e] focus:outline-none focus:border-black/[0.16] transition-colors"
            >
              <option value="">General / No client</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Client brief preview */}
          {client?.brief && (
            <div className="bg-white border border-black/[0.07] rounded-lg p-3">
              <p className="font-mono text-[9px] uppercase tracking-widest text-[#8e8e93] mb-2">Brief loaded</p>
              <p className="text-xs text-[#6c6c70] leading-relaxed line-clamp-4">{client.brief}</p>
            </div>
          )}

          {/* What's generated */}
          <div className="flex flex-col gap-1.5">
            <p className="font-mono text-[10px] uppercase tracking-widest text-[#8e8e93] mb-1">Output</p>
            {['lofi', 'jai', 'axe'].map(fmt => {
              const meta = FORMAT_META[fmt]
              const count = concepts.filter(c => c.format === fmt).length
              return (
                <div key={fmt} className="flex items-center gap-2.5 py-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${meta.dot} ${count === 0 ? 'opacity-20' : ''}`} />
                  <span className={`text-xs ${count > 0 ? meta.color : 'text-[#8e8e93]'}`}>{meta.label}</span>
                  <span className="text-[10px] font-mono text-[#8e8e93] ml-auto">{count > 0 ? `${count}` : '—'}</span>
                </div>
              )
            })}
          </div>

          <button
            onClick={generate}
            disabled={generating}
            className="w-full bg-[#EF22DA] text-black text-sm font-bold py-3 rounded-xl disabled:opacity-25 hover:opacity-90 active:scale-[0.98] transition-all mt-auto"
          >
            {generating ? (
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
                Thinking
              </span>
            ) : hasGenerated ? 'Regenerate' : 'Generate Concepts'}
          </button>
        </div>
      </div>

      {/* Right panel — concepts grid */}
      <div className="flex-1 overflow-y-auto">
        <style>{`
          @keyframes fadeDot {
            0%, 100% { opacity: 0.2; }
            50% { opacity: 1; }
          }
        `}</style>

        {!hasGenerated && !generating && !error && (
          <div className="h-full flex flex-col items-center justify-center gap-3 px-8">
            <div className="flex gap-3 mb-2">
              {['lofi', 'jai', 'axe'].map(fmt => (
                <div key={fmt} className="w-8 h-8 rounded-lg bg-white border border-black/[0.07] flex items-center justify-center">
                  <div className={`w-2 h-2 rounded-full ${FORMAT_META[fmt].dot} opacity-40`} />
                </div>
              ))}
            </div>
            <p className="text-sm text-[#8e8e93] text-center max-w-xs leading-relaxed">
              Select a client, hit Generate. Get 9 concepts — 3 Lo-Fi, 3 Jai, 3 Axe — powered by your research and Caspar's brain.
            </p>
          </div>
        )}

        {generating && (
          <div className="h-full flex flex-col items-center justify-center gap-3">
            <div className="flex gap-1.5">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-[#EF22DA]"
                  style={{ animation: `fadeDot 1.2s ease ${i * 0.2}s infinite` }}
                />
              ))}
            </div>
            <p className="text-xs text-[#8e8e93] font-mono">Caspar is ideating...</p>
          </div>
        )}

        {error && (
          <div className="p-6">
            <div className="bg-red-500/5 border border-red-500/10 rounded-xl px-4 py-3">
              <p className="text-xs text-red-400 font-mono">{error}</p>
            </div>
          </div>
        )}

        {concepts.length > 0 && (
          <div className="p-6 flex flex-col gap-8">
            {/* Three columns by format */}
            <div className="grid grid-cols-3 gap-4">
              {/* Lo-Fi column */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 pb-2 border-b border-black/[0.06]">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#8a8f98]" />
                  <span className="font-mono text-[10px] uppercase tracking-widest text-[#6c6c70]">Lo-Fi</span>
                </div>
                {lofi.map((c, i) => (
                  <ConceptCard key={i} concept={c} onScriptIt={handleScriptIt} />
                ))}
              </div>

              {/* Jai column */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 pb-2 border-b border-black/[0.06]">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#EF22DA]" />
                  <span className="font-mono text-[10px] uppercase tracking-widest text-[#EF22DA]/80">Jai Script</span>
                </div>
                {jai.map((c, i) => (
                  <ConceptCard key={i} concept={c} onScriptIt={handleScriptIt} />
                ))}
              </div>

              {/* Axe column */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 pb-2 border-b border-black/[0.06]">
                  <div className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                  <span className="font-mono text-[10px] uppercase tracking-widest text-violet-400">Axe Video</span>
                </div>
                {axe.map((c, i) => (
                  <ConceptCard key={i} concept={c} onScriptIt={handleScriptIt} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function IdeatePage() {
  return (
    <Suspense>
      <IdeateContent />
    </Suspense>
  )
}
