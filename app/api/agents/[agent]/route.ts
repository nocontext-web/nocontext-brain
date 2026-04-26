import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { DEFAULT_PROMPTS, AGENT_KEYS, AgentKey } from '@/lib/agents'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ agent: string }> }) {
  const { agent } = await params

  if (!AGENT_KEYS.includes(agent as AgentKey)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const [promptRes, memoryRes] = await Promise.all([
    supabase.from('agent_prompts').select('prompt').eq('agent', agent).single(),
    supabase.from('agent_memory').select('content').eq('agent', agent).single(),
  ])

  const prompt = promptRes.data?.prompt ?? DEFAULT_PROMPTS[agent as AgentKey] ?? ''
  const memory = memoryRes.data?.content ?? ''

  return NextResponse.json({ prompt, memory })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ agent: string }> }) {
  const { agent } = await params

  if (!AGENT_KEYS.includes(agent as AgentKey)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { prompt } = await req.json()

  await supabase
    .from('agent_prompts')
    .upsert({ agent, prompt, updated_at: new Date().toISOString() })

  return NextResponse.json({ ok: true })
}
