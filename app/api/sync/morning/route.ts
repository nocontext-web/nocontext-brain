import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function postToSlack(text: string): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN
  const channel = process.env.YAY_CHANNEL_ID
  if (!token || !channel) return

  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ channel, text, unfurl_links: false }),
  })
}

function todayKey() {
  return new Date().toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney' })
}

// The server's local timezone (UTC on most hosts) is not Sydney's, so naive
// `setHours(0,0,0,0)` day-boundary math silently shifts by 10-11 hours and
// can pull yesterday's or tomorrow's events into "today". Compute the actual
// Sydney day boundaries as real UTC instants instead.
function sydneyDayBoundsUTC(now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Australia/Sydney',
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(now).reduce((acc, p) => { acc[p.type] = p.value; return acc }, {} as Record<string, string>)

  const sydneyWallAsUTC = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second)
  )
  const offsetMs = sydneyWallAsUTC - now.getTime()

  const startOfDay = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 0, 0, 0, 0) - offsetMs)
  const endOfDay = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 23, 59, 59, 999) - offsetMs)
  return { startOfDay, endOfDay }
}

export async function POST() {
  // Backstop: only post within the morning window, Sydney time. This is meant to run
  // off the 9am cron in nocontext-slack — if it's ever hit outside this window (stray
  // call, retry, manual curl), no-op instead of posting a "morning" message at night.
  const sydneyHour = Number(
    new Date().toLocaleString('en-US', { timeZone: 'Australia/Sydney', hour: 'numeric', hour12: false })
  )
  if (sydneyHour < 6 || sydneyHour >= 11) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'outside morning window' })
  }

  const now = new Date()
  const { startOfDay, endOfDay } = sydneyDayBoundsUTC(now)

  // Only post once per day — check if already done
  const { data: existing } = await supabase
    .from('agent_thoughts')
    .select('id')
    .eq('agent', 'caspar')
    .eq('type', 'morning_briefing')
    .gte('created_at', startOfDay.toISOString())
    .limit(1)

  if (existing && existing.length > 0) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'already posted today' })
  }

  const [eventsRes, emailsRes, todosRes, memoryRes] = await Promise.all([
    supabase
      .from('calendar_events')
      .select('title, start_time, end_time, location, attendees')
      .gte('start_time', startOfDay.toISOString())
      .lte('start_time', endOfDay.toISOString())
      .order('start_time'),
    supabase
      .from('email_inbox')
      .select('subject, from_address, priority, reason, suggested_reply')
      .eq('needs_attention', true)
      .eq('status', 'unread')
      .order('priority', { ascending: false })
      .limit(5),
    supabase
      .from('todos')
      .select('content')
      .eq('done', false)
      .order('created_at')
      .limit(10),
    supabase
      .from('agent_memory')
      .select('content')
      .eq('agent', 'caspar')
      .single(),
  ])

  const events = eventsRes.data ?? []
  const emails = emailsRes.data ?? []
  const todos = todosRes.data ?? []
  const memory = memoryRes.data?.content ?? ''

  const dayOfWeek = now.toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'Australia/Sydney' })
  const dateStr = now.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', timeZone: 'Australia/Sydney' })

  const calBlock = events.length
    ? events.map(e => {
        const t = new Date(e.start_time).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Sydney' })
        const attendees = e.attendees?.length > 1 ? ` (${e.attendees.length} people)` : ''
        const loc = e.location ? ` @ ${e.location}` : ''
        return `${t}: ${e.title}${loc}${attendees}`
      }).join('\n')
    : 'Nothing on'

  const emailBlock = emails.length
    ? emails.map(e => `- ${e.priority === 'high' ? '🔴' : '⚪'} ${e.subject} — ${e.from_address.replace(/<.*?>/, '').trim()}`).join('\n')
    : 'Inbox clear'

  const todoBlock = todos.length
    ? todos.map(t => `- ${t.content}`).join('\n')
    : 'Nothing open'

  const prompt = `You are Caspar. Josh's co-founder at NO CONTEXT. It's ${dayOfWeek} ${dateStr} in Sydney.

Write a short morning message to Josh in #yay. Sound like yourself — sharp, direct, like a mate who knows what's on. Not a report. Not a list with headers. A few short paragraphs, punchy sentences. Max 150 words.

Cover: what's on today, anything urgent in the inbox, what to focus on. If it's quiet, say so. End with one line — your honest read on the day or what matters most.

Never use em dashes. Never use bold headers.${memory ? `\n\nYour memory on Josh and the business:\n${memory.slice(0, 600)}` : ''}

TODAY'S CALENDAR:
${calBlock}

EMAILS NEEDING ATTENTION:
${emailBlock}

OPEN TODOS:
${todoBlock}`

  const res = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  })

  const message = res.content[0].type === 'text' ? res.content[0].text.trim() : ''
  if (!message) return NextResponse.json({ ok: false, error: 'No message generated' })

  const slackText = `🩷 *${dayOfWeek} ${dateStr}*\n\n${message}`
  await postToSlack(slackText)

  // Mark as done so we don't re-post
  await supabase.from('agent_thoughts').insert({
    agent: 'caspar',
    type: 'morning_briefing',
    content: message,
    context: `Morning briefing — ${dateStr}`,
  })

  return NextResponse.json({ ok: true, posted: true, message })
}
