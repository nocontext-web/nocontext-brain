import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { AGENT_KEYS, AgentKey } from '@/lib/agents'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ agent: string }> }) {
  const { agent } = await params
  if (!AGENT_KEYS.includes(agent as AgentKey)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data } = await supabase
    .from('agent_thoughts')
    .select('*')
    .eq('agent', agent)
    .order('created_at', { ascending: false })
    .limit(50)

  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ agent: string }> }) {
  const { agent } = await params
  const { type, content, context } = await req.json()

  const { data } = await supabase
    .from('agent_thoughts')
    .insert({ agent, type, content, context })
    .select()
    .single()

  return NextResponse.json(data)
}
