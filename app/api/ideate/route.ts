import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'
import { DEFAULT_PROMPTS } from '@/lib/agents'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { clientId } = await req.json()

  // Fetch client, Caspar's memory/prompt, and recent research patterns in parallel
  const [clientRes, promptRes, memoryRes, patternsRes] = await Promise.all([
    clientId
      ? supabase.from('clients').select('*').eq('id', clientId).single()
      : Promise.resolve({ data: null }),
    supabase.from('agent_prompts').select('prompt').eq('agent', 'caspar').single(),
    supabase.from('agent_memory').select('content').eq('agent', 'caspar').single(),
    clientId
      ? supabase.from('research_patterns').select('*').eq('client_id', clientId).order('created_at', { ascending: false }).limit(10)
      : supabase.from('research_patterns').select('*').order('created_at', { ascending: false }).limit(10),
  ])

  const client = clientRes.data
  const casparPrompt = promptRes.data?.prompt ?? DEFAULT_PROMPTS['caspar'] ?? ''
  const casparMemory = memoryRes.data?.content ?? ''
  const patterns = patternsRes.data ?? []

  const patternContext = patterns.length > 0
    ? patterns.map(p =>
        [
          `PLATFORM: ${p.platform}${p.author ? ` @${p.author}` : ''}`,
          p.hook ? `HOOK: ${p.hook}` : '',
          p.format ? `FORMAT: ${p.format}` : '',
          p.why_it_popped ? `WHY IT HITS: ${p.why_it_popped}` : '',
          p.pattern ? `THE PATTERN: ${p.pattern}` : '',
          p.no_context_angles ? `NO CONTEXT ANGLES: ${p.no_context_angles}` : '',
        ].filter(Boolean).join('\n')
      ).join('\n\n---\n\n')
    : 'No research patterns saved yet.'

  const clientContext = client
    ? `CLIENT: ${client.name}\n${client.brief ? `BRAND BRIEF:\n${client.brief}` : `No formal brief yet. Use the client name and any memory context to infer their industry, product, and audience. Generate confidently — bold assumptions beat empty output.`}`
    : 'No specific client — generate strong general social content examples.'

  const systemPrompt = `${casparPrompt}${casparMemory ? `\n\n## YOUR MEMORY:\n${casparMemory}` : ''}`

  const userPrompt = `${clientContext}

## RECENT RESEARCH PATTERNS:
${patternContext}

Generate 9 content concepts. Three of each format:
- 3x Lo-Fi (trend-native, raw — skits, overlays, POV, trending audio)
- 3x Jai Script (voiceover storytelling — narrative-led, emotional, hook-driven)
- 3x Axe Video (highly edited, fast-cut, energy-driven)

RULES:
- Always output all 9. Never refuse. Never ask for more info. If brief is thin, infer and go.
- Steal mechanics from the research patterns above — change the topic, keep the structure.
- Name the brand directly in every concept.

Return ONLY a raw JSON array. Nothing before [. Nothing after ]. No markdown, no explanation.

Each object has exactly:
- "format": "lofi" | "jai" | "axe"
- "title": 5 words max
- "hook": exact first words or visual — what stops the scroll in 2 seconds
- "concept": 2-3 sentences on what the video is and how it plays out
- "why": one sentence on why this works for this brand right now`

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'))

      try {
        send({ status: 'generating' })

        const response = await anthropic.messages.create({
          model: 'claude-opus-4-6',
          max_tokens: 4000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
        })

        const text = response.content[0].type === 'text' ? response.content[0].text : ''

        // Extract JSON array from anywhere in the response
        let concepts: object[] = []
        try {
          // Try direct parse first
          const direct = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
          try {
            concepts = JSON.parse(direct)
          } catch {
            // Find the first [ ... ] block in the response
            const match = text.match(/\[[\s\S]*\]/)
            if (!match) throw new Error(`No JSON array found. Response preview: ${text.slice(0, 300)}`)
            concepts = JSON.parse(match[0])
          }
          if (!Array.isArray(concepts)) throw new Error('Response was not a JSON array')
        } catch (parseErr) {
          console.error('[ideate] parse error:', parseErr)
          console.error('[ideate] raw response:', text.slice(0, 500))
          send({ error: `Parse error: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}` })
          controller.close()
          return
        }

        send({ status: 'done', concepts })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        send({ error: msg.slice(0, 200) })
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson' },
  })
}
