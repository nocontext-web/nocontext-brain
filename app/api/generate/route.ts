import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'
import { DEFAULT_PROMPTS, AgentKey } from '@/lib/agents'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const { clientId, templateId, agent, brief } = await req.json()

  const [clientRes, templateRes, promptRes, memoryRes] = await Promise.all([
    supabase.from('clients').select('*').eq('id', clientId).single(),
    supabase.from('templates').select('*').eq('id', templateId).single(),
    supabase.from('agent_prompts').select('prompt').eq('agent', agent).single(),
    supabase.from('agent_memory').select('content').eq('agent', agent).single(),
  ])

  const client = clientRes.data
  const template = templateRes.data
  if (!client || !template) {
    return NextResponse.json({ error: 'Client or template not found' }, { status: 404 })
  }

  const basePrompt = promptRes.data?.prompt ?? DEFAULT_PROMPTS[agent as AgentKey] ?? ''
  const memory = memoryRes.data?.content ?? ''

  const systemPrompt = `${basePrompt}${memory ? `\n\n## YOUR MEMORY:\n${memory}` : ''}`

  const userMessage = `CLIENT: ${client.name}

${client.brief ? `BRAND BRIEF:\n${client.brief}\n` : ''}${brief ? `\nADDITIONAL DIRECTION:\n${brief}\n` : ''}
USE THIS EXACT FORMAT AND STRUCTURE:
${template.content}

Fill in the above format for this client. Match the format precisely.`

  const response = await anthropic.messages.create({
    model: agent === 'caspar' ? 'claude-opus-4-6' : 'claude-sonnet-4-6',
    max_tokens: 4000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  })

  const output = response.content[0].type === 'text' ? response.content[0].text : ''
  return NextResponse.json({ output })
}
