import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'
import { AGENT_KEYS, AgentKey } from '@/lib/agents'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

type Exchange = {
  agent: string
  question: string
  answer: string
}

export async function POST(req: NextRequest) {
  const { history, topic } = await req.json() as { history: Exchange[]; topic?: string }

  if (!history || history.length === 0) {
    return NextResponse.json({ ok: false, error: 'No history to save' })
  }

  const sessionText = history
    .map(e => `${e.agent.toUpperCase()} asked: "${e.question}"\nJosh answered: "${e.answer}"`)
    .join('\n\n')

  const saves = AGENT_KEYS.map(async (agentKey: AgentKey) => {
    const memoryRes = await supabase
      .from('agent_memory')
      .select('content')
      .eq('agent', agentKey)
      .single()

    const existingMemory = memoryRes.data?.content ?? ''

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: `You are ${agentKey} from NO CONTEXT. You just completed a training session with Josh (founder).`,
      messages: [{
        role: 'user',
        content: `Here is the full training session${topic ? ` (topic: ${topic})` : ''}:\n\n${sessionText}\n\nSummarise what you personally learned about Josh — his taste, how he thinks, what he values, how he makes decisions. Be specific. 3-6 bullet points. Start directly with the bullets, no intro.`,
      }],
    })

    const learnings = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
    if (!learnings) return { agent: agentKey, learnings: '' }

    const newMemory = existingMemory
      ? `${existingMemory}\n\n## Training Session ${new Date().toLocaleDateString('en-AU')}${topic ? ` — ${topic}` : ''}:\n${learnings}`
      : `## Training Session ${new Date().toLocaleDateString('en-AU')}${topic ? ` — ${topic}` : ''}:\n${learnings}`

    await supabase
      .from('agent_memory')
      .upsert({ agent: agentKey, content: newMemory }, { onConflict: 'agent' })

    // Also save key learnings to Josh's Obsidian folder
    await saveToObsidian(agentKey, learnings, topic)

    return { agent: agentKey, learnings }
  })

  const results = await Promise.all(saves)
  return NextResponse.json({ ok: true, results: results.filter(Boolean) })
}

async function saveToObsidian(agentKey: AgentKey, learnings: string, topic?: string) {
  const title = `Training — ${agentKey}`
  const notePath = `Josh/${title}.md`

  const { data: existing } = await supabase
    .from('obsidian_notes')
    .select('content')
    .eq('path', notePath)
    .single()

  const date = new Date().toLocaleDateString('en-AU')
  const newSection = `\n\n## ${date}${topic ? ` · ${topic}` : ''}\n${learnings}`
  const content = (existing?.content ?? '') + newSection

  await supabase.from('obsidian_notes').upsert(
    { path: notePath, folder: 'Josh', title, content, source: 'agent', updated_at: new Date().toISOString() },
    { onConflict: 'path' }
  )
}
