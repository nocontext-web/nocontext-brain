import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const { data } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false })

  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const { name, website, instagram, tiktok, monthly_value, status } = await req.json()

  const { data, error } = await supabase
    .from('clients')
    .insert({ name, website, instagram, tiktok, monthly_value, status: status ?? 'active' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}
