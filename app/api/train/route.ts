import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'
import { DEFAULT_PROMPTS, AgentKey } from '@/lib/agents'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

type Exchange = {
  agent: string
  question: string
  answer: string
}

// Caspar's training focus
const AGENT_FOCUS: Record<AgentKey, string> = {
  caspar: `You are CASPAR. Ask about how Josh thinks, makes decisions, reads a brief, what success looks like to him. Ask about creative taste, what formats excite him, what makes content worth making. Ask about how he works with clients, what a good pitch looks like. You want to understand his full strategic and creative mind.`,
}

export async function POST(req: NextRequest) {
  const { history = [], agentKey } = await req.json() as { history: Exchange[]; agentKey: AgentKey }

  const [promptRes, memoryRes] = await Promise.all([
    supabase.from('agent_prompts').select('prompt').eq('agent', agentKey).single(),
    supabase.from('agent_memory').select('content').eq('agent', agentKey).single(),
  ])

  const basePrompt = promptRes.data?.prompt ?? DEFAULT_PROMPTS[agentKey] ?? ''
  const memory = memoryRes.data?.content ?? ''

  // Format conversation history for context
  const historyText = history.length === 0
    ? 'This is the start of the session.'
    : history.map(e => `${e.agent.toUpperCase()} asked: "${e.question}"\nJosh answered: "${e.answer}"`).join('\n\n')

  const systemPrompt = `${basePrompt}${memory ? `\n\n## YOUR MEMORY:\n${memory}` : ''}

---

## TRAINING SESSION

You are in a GROUP TRAINING SESSION with Josh (founder of NO CONTEXT). All four agents — Billy, Caspar, George, Ellie — are learning from Josh simultaneously. You each take turns asking him ONE question.

${AGENT_FOCUS[agentKey]}

YOUR RULES:
- Ask exactly ONE question. Nothing else — no greeting, no preamble, no "great answer!", just the question.
- Stay in your voice and your area
- Build on what's been said — go deeper, don't repeat ground already covered
- Early rounds: establish foundations. Later rounds: probe the nuance and the edge cases
- You want to understand how Josh THINKS, not just what he thinks
- Make it count — this is how you learn to be as good as him

EVERYTHING SAID SO FAR:
${historyText}`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    system: systemPrompt,
    messages: [{ role: 'user', content: 'Your turn. Ask Josh one question.' }],
  })

  const question = response.content[0].type === 'text' ? response.content[0].text.trim() : ''

  return NextResponse.json({ question })
}
