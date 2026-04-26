import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { supabase } from '@/lib/supabase'
import { getAuthClient } from '@/lib/google'

export async function POST() {
  try {
    const { auth } = await getAuthClient()
    const calendar = google.calendar({ version: 'v3', auth })

    const now = new Date()
    const twoWeeksAhead = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)

    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: twoWeeksAhead.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 50,
    })

    const events = res.data.items ?? []

    // Clear upcoming events and re-insert
    await supabase.from('calendar_events').delete().gte('start_time', now.toISOString())

    if (events.length === 0) return NextResponse.json({ ok: true, synced: 0 })

    const rows = events
      .filter(e => e.summary && (e.start?.dateTime || e.start?.date))
      .map(e => ({
        id: e.id!,
        title: e.summary!,
        start_time: e.start?.dateTime ?? e.start?.date ?? '',
        end_time: e.end?.dateTime ?? e.end?.date ?? '',
        location: e.location ?? null,
        description: e.description ? e.description.slice(0, 500) : null,
        attendees: e.attendees?.map(a => a.email).filter(Boolean) ?? [],
        updated_at: new Date().toISOString(),
      }))

    await supabase.from('calendar_events').upsert(rows, { onConflict: 'id' })

    return NextResponse.json({ ok: true, synced: rows.length })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function GET() {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('calendar_events')
    .select('*')
    .gte('start_time', now)
    .order('start_time', { ascending: true })
    .limit(20)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, events: data })
}
