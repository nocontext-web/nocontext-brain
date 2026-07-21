import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await supabase
    .from('research_boards')
    .select('*, research_patterns(id)')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Flatten the join down to a count — the board list only needs "how many
  // videos", the board detail page loads the actual rows.
  const boards = (data ?? []).map(b => ({ ...b, video_count: b.research_patterns?.length ?? 0, research_patterns: undefined }))
  return NextResponse.json(boards)
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { name?: string; keywords?: string[]; platforms?: string[]; clientId?: string; clientName?: string }
  if (!body.name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (!body.keywords?.length) return NextResponse.json({ error: 'at least one keyword is required' }, { status: 400 })

  const { data, error } = await supabase
    .from('research_boards')
    .insert({
      name: body.name.trim(),
      keywords: body.keywords.map(k => k.trim()).filter(Boolean),
      platforms: body.platforms?.length ? body.platforms : ['tiktok', 'instagram'],
      client_id: body.clientId || null,
      client_name: body.clientName || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
