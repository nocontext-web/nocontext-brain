import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [{ data: board }, { data: videos, error: videosError }] = await Promise.all([
    supabase.from('research_boards').select('*').eq('id', id).single(),
    supabase.from('research_patterns').select('*').eq('board_id', id).order('virality_score', { ascending: false, nullsFirst: false }),
  ])

  if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 })
  if (videosError) return NextResponse.json({ error: videosError.message }, { status: 500 })

  return NextResponse.json({ ...board, videos: videos ?? [] })
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await supabase.from('research_boards').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
