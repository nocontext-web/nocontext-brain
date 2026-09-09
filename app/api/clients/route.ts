import { clientInput } from '@/lib/client-input'
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: 'Client data unavailable' }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  let input
  try { input = clientInput(await req.json(), true) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid client' }, { status: 400 }) }

  const { data, error } = await supabase
    .from('clients')
    .insert({ ...input, status: input.status ?? 'active' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}
