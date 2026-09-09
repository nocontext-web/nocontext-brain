import { sydneyDayBoundsUTC } from '@/lib/sydney-time'
import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { supabase } from '@/lib/supabase'
import { getAuthClient } from '@/lib/google'

export async function POST() {
  try {
    const { auth } = await getAuthClient()
    const calendar = google.calendar({ version: 'v3', auth })

    const now = new Date()
    const { startOfDay } = sydneyDayBoundsUTC(now)
    const twoWeeksAhead = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)

    const events: import('googleapis').calendar_v3.Schema$Event[] = []
    let pageToken: string | undefined
    do {
      const res = await calendar.events.list({calendarId:'primary',timeMin:startOfDay.toISOString(),timeMax:twoWeeksAhead.toISOString(),singleEvents:true,orderBy:'startTime',maxResults:250,pageToken})
      events.push(...(res.data.items??[]));pageToken=res.data.nextPageToken??undefined
    } while(pageToken)

    const rows = events
      .filter(e => e.status !== 'cancelled' && !e.attendees?.some(a=>a.self&&a.responseStatus==='declined') && e.summary && (e.start?.dateTime || e.start?.date))
      .map(e => ({
        id: e.id!,
        title: e.summary!,
        start_time: e.start?.dateTime ?? (e.start?.date ? sydneyDayBoundsUTC(new Date(e.start.date + 'T12:00:00Z')).startOfDay.toISOString() : ''),
        end_time: e.end?.dateTime ?? (e.end?.date ? sydneyDayBoundsUTC(new Date(e.end.date + 'T12:00:00Z')).startOfDay.toISOString() : ''),
        location: e.location ?? null,
        description: e.description ? e.description.slice(0, 500) : null,
        attendees: e.attendees?.map(a => a.email).filter(Boolean) ?? [],
        updated_at: new Date().toISOString(),
      }))

    const { error } = await supabase.rpc('replace_calendar_window', { p_start:startOfDay.toISOString(),p_end:twoWeeksAhead.toISOString(),p_events:rows })
    if (error) throw error

    return NextResponse.json({ ok: true, synced: rows.length })
  } catch (err: any) {
    await supabase.from('source_sync_status').upsert({source:'calendar',checked_at:new Date().toISOString(),succeeded:false,error:err.message},{onConflict:'source'})
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
