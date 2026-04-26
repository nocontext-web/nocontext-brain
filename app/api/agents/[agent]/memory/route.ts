import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { AGENT_KEYS, AgentKey } from '@/lib/agents'

export async function POST(req: NextRequest, { params }: { params: Promise<{ agent: string }> }) {
  const { agent } = await params

  if (!AGENT_KEYS.includes(agent as AgentKey)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { memory } = await req.json()

  await supabase
    .from('agent_memory')
    .upsert({ agent, content: memory })

  return NextResponse.json({ ok: true })
}
