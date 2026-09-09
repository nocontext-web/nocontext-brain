import { clientInput } from '@/lib/client-input'
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data } = await supabase.from('clients').select('*').eq('id', id).single()
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let body
  try { body = clientInput(await req.json()) }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid client' }, { status: 400 }) }
  const { data, error } = await supabase.from('clients').update(body).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: 'Client update failed' }, { status: 500 })
  return NextResponse.json(data)
}
