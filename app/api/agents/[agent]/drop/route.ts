import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'
import { DEFAULT_PROMPTS, AGENT_KEYS, AgentKey } from '@/lib/agents'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function fetchPageText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    })
    const html = await res.text()
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 6000)
  } catch {
    return ''
  }
}

function extractThoughts(text: string): { type: string; content: string }[] {
  const thoughts: { type: string; content: string }[] = []
  const types = ['THOUGHT', 'OPINION', 'QUESTION', 'OBSERVATION', 'FEELING']
  for (const line of text.split('\n')) {
    for (const type of types) {
      if (line.startsWith(`${type}:`)) {
        const content = line.slice(type.length + 1).trim()
        if (content) thoughts.push({ type: type.toLowerCase(), content })
      }
    }
  }
  return thoughts
}

function stripThoughts(text: string): string {
  const types = ['THOUGHT', 'OPINION', 'QUESTION', 'OBSERVATION', 'FEELING']
  return text
    .split('\n')
    .filter(line => !types.some(t => line.startsWith(`${t}:`)))
    .join('\n')
    .trim()
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ agent: string }> }) {
  const { agent } = await params

  if (!AGENT_KEYS.includes(agent as AgentKey)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { url, text: rawText, note } = await req.json()

  const [promptRes, memoryRes] = await Promise.all([
    supabase.from('agent_prompts').select('prompt').eq('agent', agent).single(),
    supabase.from('agent_memory').select('content').eq('agent', agent).single(),
  ])

  const basePrompt = promptRes.data?.prompt ?? DEFAULT_PROMPTS[agent as AgentKey] ?? ''
  const memory = memoryRes.data?.content ?? ''
  const systemPrompt = memory ? `${basePrompt}\n\n## YOUR MEMORY:\n${memory}` : basePrompt

  let content = rawText || ''
  let sourceLabel = rawText ? 'dropped text' : url

  if (url && !rawText) {
    const isVideo = /tiktok\.com|youtube\.com|youtu\.be|instagram\.com\/reel/.test(url)
    if (isVideo) {
      content = `Video URL: ${url}\n(Video content — react based on the URL, platform context, and any note provided)`
    } else {
      content = await fetchPageText(url)
    }
  }

  const userMessage = `I'm dropping this in for you to react to and form a take on:

${url ? `URL: ${url}` : ''}
${content ? `\nContent:\n${content}` : ''}
${note ? `\nMy note: ${note}` : ''}

React honestly. What do you think? What's your take? What does this tell you about what's working, what's changing, what's interesting or lazy?

Then give me your THOUGHT, OPINION, QUESTION, OBSERVATION lines.`

  const response = await anthropic.messages.create({
    model: agent === 'caspar' ? 'claude-opus-4-6' : 'claude-sonnet-4-6',
    max_tokens: 1200,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })

  const rawReply = response.content[0].type === 'text' ? response.content[0].text : ''
  const thoughts = extractThoughts(rawReply)

  // Save all thoughts to mind log
  if (thoughts.length > 0) {
    await Promise.all(
      thoughts.map(t =>
        supabase.from('agent_thoughts').insert({
          agent,
          type: t.type,
          content: t.content,
          context: `Culture drop: ${sourceLabel}`,
        })
      )
    )
  }

  const reaction = stripThoughts(rawReply)

  return NextResponse.json({ reaction, thoughts })
}
