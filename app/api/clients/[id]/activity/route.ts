import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// Anything that produces a meeting transcript. Kept in one place so adding a
// capture source doesn't silently leave it out of Caspar's learning loop.
const MEETING_SOURCES = ['granola', 'pocket']

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const { data: client } = await supabase
    .from('clients')
    .select('name')
    .eq('id', id)
    .single()

  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const name = client.name
  const now = new Date().toISOString()

  const [emailsRes, memoriesRes, calendarRes, todosRes] = await Promise.all([
    supabase
      .from('email_inbox')
      .select('id, subject, from_address, received_at, priority, needs_attention, reason, suggested_reply, status')
      .ilike('related_client', `%${name}%`)
      .order('received_at', { ascending: false })
      .limit(10),

    supabase
      .from('memories')
      .select('id, content, type, related_client, created_at, tags')
      .in('source', MEETING_SOURCES)
      .ilike('related_client', `%${name}%`)
      .order('created_at', { ascending: false })
      .limit(15),

    supabase
      .from('calendar_events')
      .select('id, title, start_time, end_time, location, attendees')
      .ilike('title', `%${name}%`)
      .gte('start_time', now)
      .order('start_time', { ascending: true })
      .limit(5),

    supabase
      .from('todos')
      .select('id, content, created_at')
      .eq('done', false)
      .ilike('content', `%${name}%`)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  return NextResponse.json({
    emails: emailsRes.data ?? [],
    meetings: memoriesRes.data ?? [],
    calendar: calendarRes.data ?? [],
    todos: todosRes.data ?? [],
  })
}
