'use client'

import { useState, useEffect, useRef } from 'react'

type Client = { id: string; name: string; brief?: string }
type Message = { role: 'user' | 'assistant'; content: string }

const TEMPLATES = [
  {
    key: 'jai',
    name: 'Jai Script',
    desc: 'Voiceover storytelling video',
    detail: 'Narrative-led, hook-driven. Built for Jai\'s editing style.',
    emoji: '🎬',
    fields: [
      { key: 'angle', label: 'What\'s the angle or story?', placeholder: 'e.g. How we went from 0 to 1000 customers in 3 months...' },
      { key: 'tone', label: 'Tone', placeholder: 'e.g. Inspirational, raw, funny, calm...' },
    ],
  },
  {
    key: 'axe',
    name: 'Axe Video',
    desc: 'Highly edited, fast-cut video',
    detail: 'Shot-by-shot. Energy-driven. Built for Axe\'s editing style.',
    emoji: '⚡',
    fields: [
      { key: 'concept', label: 'What\'s the concept?', placeholder: 'e.g. Product launch, behind the scenes, transformation...' },
      { key: 'vibe', label: 'Vibe / energy', placeholder: 'e.g. Hype, clean, cinematic, chaotic...' },
    ],
  },
  {
    key: 'lofi',
    name: 'Lo-Fi Ideas',
    desc: '8 lo-fi concepts for the brand',
    detail: 'Trends, overlays, skits. Raw and native. 8 ready-to-shoot ideas.',
    emoji: '📱',
    fields: [
      { key: 'focus', label: 'Any specific focus or upcoming moment?', placeholder: 'e.g. Launch, seasonal, specific product, no preference...' },
    ],
  },
  {
    key: 'josh',
    name: 'Josh from Marketing',
    desc: 'Observational humour script',
    detail: 'Relatable brand moment + overlay punchline. Like the Fig & Bloom vase water video.',
    emoji: '😂',
    fields: [
      { key: 'situation', label: 'What\'s the situation, product, or brand moment to work with?', placeholder: 'e.g. The barista keeps giving away free coffees, the florist drinks the vase water...' },
    ],
  },
]

export default function GeneratePage() {
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState('')
  const [selectedTemplate, setSelectedTemplate] = useState('')
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [brief, setBrief] = useState('')
  const [generating, setGenerating] = useState(false)
  const [history, setHistory] = useState<Message[]>([])
  const [feedback, setFeedback] = useState('')
  const [copied, setCopied] = useState<number | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const feedbackRef = useRef<HTMLTextAreaElement>(null)
  const fromIdeate = useRef(false)

  useEffect(() => {
    fetch('/api/clients').then(r => r.json()).then((data: Client[]) => {
      setClients(data)
      // Check for concept pre-populated from Ideate
      const raw = localStorage.getItem('nc_concept')
      if (raw) {
        try {
          const concept = JSON.parse(raw)
          fromIdeate.current = true
          if (concept.clientId) setSelectedClient(concept.clientId)
          if (concept.format) setSelectedTemplate(concept.format === 'lofi' ? 'lofi' : concept.format === 'jai' ? 'jai' : 'axe')
          if (concept.brief) setBrief(concept.brief)
          if (concept.hook && concept.format) {
            const fieldKey = concept.format === 'jai' ? 'angle' : concept.format === 'axe' ? 'concept' : 'focus'
            setFieldValues({ [fieldKey]: concept.hook + (concept.title ? ` — ${concept.title}` : '') })
          }
          localStorage.removeItem('nc_concept')
        } catch { /* ignore */ }
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (fromIdeate.current) { fromIdeate.current = false; return }
    setFieldValues({})
    setHistory([])
    setFeedback('')
  }, [selectedTemplate])

  const template = TEMPLATES.find(t => t.key === selectedTemplate)

  async function streamResponse(body: object, appendToHistory: (text: string) => void) {
    const res = await fetch('/api/generate/script', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.body) return ''
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let full = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      full += chunk
      appendToHistory(chunk)
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
    return full
  }

  async function generate() {
    if (!selectedClient || !selectedTemplate) return
    setGenerating(true)
    setHistory([])
    setFeedback('')

    const client = clients.find(c => c.id === selectedClient)

    // Add placeholder assistant message that we'll stream into
    setHistory([{ role: 'assistant', content: '' }])

    const full = await streamResponse(
      { clientId: selectedClient, clientName: client?.name, clientBrief: client?.brief, templateKey: selectedTemplate, fieldValues, brief },
      (chunk) => setHistory(prev => {
        const last = prev[prev.length - 1]
        return [...prev.slice(0, -1), { ...last, content: last.content + chunk }]
      })
    )

    // Store the initial user prompt in history for refinement context
    const client2 = clients.find(c => c.id === selectedClient)
    const userPrompt = [
      `Client: ${client2?.name}`,
      brief ? `Direction: ${brief}` : '',
      ...Object.entries(fieldValues).map(([k, v]) => `${k}: ${v}`),
    ].filter(Boolean).join('\n')

    setHistory([
      { role: 'user', content: userPrompt },
      { role: 'assistant', content: full },
    ])

    setGenerating(false)
    setTimeout(() => feedbackRef.current?.focus(), 100)
  }

  async function refine() {
    if (!feedback.trim() || generating) return
    const fb = feedback.trim()
    setFeedback('')
    setGenerating(true)

    const newHistory: Message[] = [...history, { role: 'user', content: fb }, { role: 'assistant', content: '' }]
    setHistory(newHistory)

    const full = await streamResponse(
      { templateKey: selectedTemplate, history: newHistory.slice(0, -1) },
      (chunk) => setHistory(prev => {
        const last = prev[prev.length - 1]
        return [...prev.slice(0, -1), { ...last, content: last.content + chunk }]
      })
    )

    setHistory(prev => [...prev.slice(0, -1), { role: 'assistant', content: full }])
    setGenerating(false)
    setTimeout(() => feedbackRef.current?.focus(), 100)
  }

  const canGenerate = selectedClient && selectedTemplate && !generating
  const latestScript = history.filter(m => m.role === 'assistant').at(-1)?.content ?? ''

  return (
    <div className="flex flex-col h-full bg-transparent">
      <div className="px-8 pt-8 pb-6 border-b border-white/7">
        <p className="font-mono text-xs uppercase tracking-widest text-[#6c6c70] mb-1">Output Engine</p>
        <h1 className="text-2xl font-semibold text-[#1c1c1e]">Script Generator</h1>
        <p className="text-[#6c6c70] text-sm mt-1">Pick a client, pick a format, get a script back.</p>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — config */}
        <div className="w-[420px] shrink-0 border-r border-white/7 overflow-y-auto p-6 flex flex-col gap-6">

          {/* Client */}
          <div>
            <label className="font-mono text-xs uppercase tracking-widest text-[#6c6c70] mb-2 block">Client</label>
            <select
              value={selectedClient}
              onChange={e => setSelectedClient(e.target.value)}
              className="w-full bg-white border border-white/7 rounded-xl px-4 py-3 text-sm text-[#1c1c1e] focus:outline-none focus:border-black/20 appearance-none"
            >
              <option value="">Select a client...</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Template selection */}
          <div>
            <label className="font-mono text-xs uppercase tracking-widest text-[#6c6c70] mb-2 block">Format</label>
            <div className="flex flex-col gap-2">
              {TEMPLATES.map(t => (
                <button
                  key={t.key}
                  onClick={() => setSelectedTemplate(t.key)}
                  className={`text-left p-4 rounded-xl border transition-all ${
                    selectedTemplate === t.key
                      ? 'border-[#EF22DA] bg-[#EF22DA]/8'
                      : 'border-white/7 bg-white hover:border-white/15'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-lg">{t.emoji}</span>
                    <span className="font-semibold text-[#1c1c1e] text-sm">{t.name}</span>
                    <span className={`ml-auto text-xs font-mono ${selectedTemplate === t.key ? 'text-[#EF22DA]' : 'text-[#8e8e93]'}`}>
                      {selectedTemplate === t.key ? '●' : '○'}
                    </span>
                  </div>
                  <p className="text-xs text-[#6c6c70] ml-8 leading-relaxed">{t.detail}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Template-specific fields */}
          {template && (
            <div className="flex flex-col gap-4">
              {template.fields.map(f => (
                <div key={f.key}>
                  <label className="font-mono text-xs uppercase tracking-widest text-[#6c6c70] mb-2 block">{f.label}</label>
                  <textarea
                    value={fieldValues[f.key] || ''}
                    onChange={e => setFieldValues(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full bg-white border border-white/7 rounded-xl px-4 py-3 text-sm text-[#1c1c1e] placeholder:placeholder:text-[#8e8e93] resize-none focus:outline-none focus:border-black/20"
                    rows={2}
                  />
                </div>
              ))}
              <div>
                <label className="font-mono text-xs uppercase tracking-widest text-[#6c6c70] mb-2 block">Anything else to know?</label>
                <textarea
                  value={brief}
                  onChange={e => setBrief(e.target.value)}
                  placeholder="Extra context, specific products, references, constraints..."
                  className="w-full bg-white border border-white/7 rounded-xl px-4 py-3 text-sm text-[#1c1c1e] placeholder:placeholder:text-[#8e8e93] resize-none focus:outline-none focus:border-black/20"
                  rows={2}
                />
              </div>
            </div>
          )}

          <button
            onClick={generate}
            disabled={!canGenerate}
            className="bg-[#EF22DA] text-black text-sm font-bold px-5 py-3.5 rounded-xl disabled:opacity-30 hover:opacity-90 transition-opacity"
          >
            {generating ? 'Generating...' : `Generate ${template ? template.name : 'Script'}`}
          </button>
        </div>

        {/* Right panel — iterative workspace */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {history.length === 0 && !generating ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="text-4xl mb-4">{template ? template.emoji : '✍️'}</div>
                <p className="text-[#8e8e93] text-sm">
                  {template ? `Ready to generate a ${template.name}.` : 'Select a client and format to get started.'}
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Conversation thread */}
              <div className="flex-1 overflow-y-auto p-8">
                <div className="max-w-2xl flex flex-col gap-6">

                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-xs uppercase tracking-widest text-[#EF22DA]">
                        {template?.name}
                        {generating && <span className="animate-pulse"> · generating</span>}
                      </p>
                      <p className="text-xs text-[#8e8e93] mt-0.5">{clients.find(c => c.id === selectedClient)?.name}</p>
                    </div>
                    <div className="flex gap-2">
                      {latestScript && !generating && (
                        <button
                          onClick={() => { navigator.clipboard.writeText(latestScript); setCopied(-1); setTimeout(() => setCopied(null), 2000) }}
                          className="font-mono text-xs text-[#6c6c70] hover:text-[#1c1c1e] transition-colors px-3 py-1.5 border border-white/7 rounded-lg"
                        >
                          {copied === -1 ? '✓ Copied' : 'Copy latest'}
                        </button>
                      )}
                      {!generating && (
                        <button
                          onClick={() => { setHistory([]); setFeedback(''); generate() }}
                          className="font-mono text-xs text-[#6c6c70] hover:text-[#1c1c1e] transition-colors px-3 py-1.5 border border-white/7 rounded-lg"
                        >
                          ↺ Start over
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Messages */}
                  {history.map((msg, i) => (
                    msg.role === 'assistant' ? (
                      <div key={i} className="relative group">
                        <div className="text-sm text-[#3a3a3c] whitespace-pre-wrap leading-relaxed font-mono bg-white border border-white/7 rounded-2xl p-6">
                          {msg.content}
                          {generating && i === history.length - 1 && (
                            <span className="animate-pulse text-[#EF22DA]">▋</span>
                          )}
                        </div>
                        {msg.content && !generating && (
                          <button
                            onClick={() => { navigator.clipboard.writeText(msg.content); setCopied(i); setTimeout(() => setCopied(null), 2000) }}
                            className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 font-mono text-[10px] text-[#8e8e93] hover:text-[#1c1c1e] transition-all px-2 py-1 bg-transparent border border-white/7 rounded-lg"
                          >
                            {copied === i ? '✓' : 'Copy'}
                          </button>
                        )}
                      </div>
                    ) : i > 0 ? (
                      // Show user feedback messages (skip the first user message which is just the prompt)
                      <div key={i} className="flex justify-end">
                        <div className="bg-[#EF22DA]/10 border border-[#EF22DA]/20 rounded-2xl px-4 py-3 max-w-md">
                          <p className="text-sm text-[#f0c0ec]">{msg.content}</p>
                        </div>
                      </div>
                    ) : null
                  ))}

                  <div ref={bottomRef} />
                </div>
              </div>

              {/* Feedback bar */}
              {!generating && history.length > 0 && (
                <div className="border-t border-white/7 p-4">
                  <div className="max-w-2xl flex gap-3 items-end">
                    <textarea
                      ref={feedbackRef}
                      value={feedback}
                      onChange={e => setFeedback(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); refine() } }}
                      placeholder="Make the hook punchier... change the tone to... cut it down... try a different angle..."
                      rows={2}
                      className="flex-1 bg-white border border-white/7 rounded-xl px-4 py-3 text-sm text-[#1c1c1e] placeholder:text-[#8e8e93] resize-none focus:outline-none focus:border-black/20"
                    />
                    <button
                      onClick={refine}
                      disabled={!feedback.trim()}
                      className="bg-[#EF22DA] text-black text-sm font-bold px-5 py-3 rounded-xl disabled:opacity-30 hover:opacity-90 transition-opacity shrink-0"
                    >
                      Refine
                    </button>
                  </div>
                  <p className="text-[10px] text-[#28282c] font-mono mt-2 ml-0.5">Enter to refine · Shift+Enter for new line</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
