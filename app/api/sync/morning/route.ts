import { sydneyDayBoundsUTC } from '@/lib/sydney-time'
import { eventPhase } from '@/lib/email-thread'
import { POST as syncGmail } from '../gmail/route'
import { POST as syncCalendar } from '../calendar/route'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function postToSlack(text: string): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN
  const channel = process.env.YAY_CHANNEL_ID
  if (!token || !channel) throw new Error('Morning Slack destination is not configured')

  const response = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ channel, text, unfurl_links: false }),
  })
  const result=await response.json()
  if(!response.ok||!result.ok)throw new Error(result.error||'Morning message was not confirmed')
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
  const { data: existing, error: existingError } = await supabase
    .from('agent_thoughts')
    .select('id')
    .eq('agent', 'caspar')
    .eq('type', 'morning_briefing')
    .gte('created_at', startOfDay.toISOString())
    .limit(1)

  if(existingError)return NextResponse.json({ok:false,error:'Could not check prior briefing delivery'},{status:503})
  if (existing && existing.length > 0) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'already posted today' })
  }

  // Refresh first. A failed source is excluded, not silently treated as current.
  const refresh = await Promise.allSettled([syncCalendar(),syncGmail()])
  const fresh = refresh.map(r=>r.status==='fulfilled' && r.value.ok)
  const [eventsRes, emailsRes, todosRes, memoryRes, pocketRes, syncRes] = await Promise.all([
    supabase
      .from('calendar_events')
      .select('title, start_time, end_time, location, attendees')
      .gte('start_time', startOfDay.toISOString())
      .lte('start_time', endOfDay.toISOString())
      .order('start_time'),
    supabase
      .from('email_inbox')
      .select('subject, from_address, priority, reason, suggested_reply, reply_state, checked_at')
      .eq('needs_attention', true)
      .eq('status', 'unread')
      .eq('reply_state', 'awaiting_reply')
      .gte('checked_at',new Date(Date.now()-15*60000).toISOString())
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
    supabase.from('memories').select('content,source_recorded_at,created_at').eq('source','pocket').gte('created_at',new Date(Date.now()-24*3600000).toISOString()).order('created_at',{ascending:false}).limit(40),
    supabase.from('source_sync_status').select('*').in('source',['pocket','gmail','calendar']),
  ])

  if(todosRes.error || memoryRes.error || syncRes.error) return NextResponse.json({ok:false,error:'Briefing context unavailable'},{status:503})
  const events = fresh[0]&&!eventsRes.error ? eventsRes.data ?? [] : []
  const emails = fresh[1]&&!emailsRes.error ? emailsRes.data ?? [] : []
  const pocketStatus=syncRes.data?.find(s=>s.source==='pocket')
  const pocketFresh=pocketStatus?.succeeded && Date.now()-Date.parse(pocketStatus.checked_at)<15*60000
  const limitations=[!fresh[0]||eventsRes.error?'Calendar could not be refreshed.':null,!fresh[1]||emailsRes.error?'Email reply status could not be refreshed.':null,!pocketFresh||pocketRes.error?'Pocket could not be refreshed.':pocketStatus?.details?.more?'Some Pocket recordings are still being processed.':null].filter(Boolean)
  const todos = todosRes.data ?? []
  const memory = memoryRes.data?.content ?? ''

  const dayOfWeek = now.toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'Australia/Sydney' })
  const dateStr = now.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', timeZone: 'Australia/Sydney' })

  const calBlock = events.length
    ? events.map(e => {
        const t = new Date(e.start_time).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Sydney' })
        const attendees = e.attendees?.length > 1 ? ` (${e.attendees.length} people)` : ''
        const loc = e.location ? ` @ ${e.location}` : ''
        return `[${eventPhase(e.start_time,e.end_time,now)}] ${t}: ${e.title}${loc}${attendees}`
      }).join('\n')
    : fresh[0]?'No events in the synced calendar window':'Calendar unavailable'

  const emailBlock = emails.length
    ? emails.map(e => `- ${e.priority === 'high' ? '🔴' : '⚪'} ${e.subject} — ${e.from_address.replace(/<.*?>/, '').trim()}`).join('\n')
    : fresh[1]?'No reply-needed threads found in the checked set':'Email status unavailable'

  const todoBlock = todos.length
    ? todos.map(t => `- ${t.content}`).join('\n')
    : 'Nothing open'

  const prompt = `You are Caspar. Josh's co-founder at NO CONTEXT. It's ${dayOfWeek} ${dateStr}, ${now.toLocaleTimeString('en-AU',{timeZone:'Australia/Sydney',hour:'2-digit',minute:'2-digit'})} in Sydney.

Write a short morning message to Josh in #yay. Sound like yourself — sharp, direct, like a mate who knows what's on. Not a report. Not a list with headers. A few short punchy sentences. Max 120 words.

RULES:
- The calendar explicitly labels already-ended, in-progress and upcoming events. Never describe an ended event as ahead. Do not invent focus blocks or free time.
- Only the listed email threads have been verified as potentially waiting for Josh. Do not say the whole inbox is clear or invent another unanswered thread from memory.
- Pocket statements can explain a change or completion. If a task conflicts with a recent capture, surface the discrepancy instead of repeating the task as certainly undone.
- Include any SOURCE LIMITATIONS briefly. A failed sync is not an empty source.
- Only suggest Josh action something if it's on his OPEN TODOS list. Do not push him to do things based on emails alone — if it's not on the list, it might already be handled.
- Emails are context only. Flag them if they need a reply, but don't assume the underlying work isn't done.
- If todos are empty or quiet, say so. Don't manufacture urgency.
- Never use em dashes. Never use bold headers.
${memory ? `\nYour memory:\n${memory.slice(0, 500)}` : ''}

TODAY'S CALENDAR:
${calBlock}

EMAILS NEEDING ATTENTION (context only — don't push action unless it maps to a todo):
${emailBlock}

OPEN TODOS (may need reconciliation with recent Pocket evidence):
${todoBlock}

RECENT POCKET CAPTURES (recorded time matters; do not treat old recordings as new events):
${pocketFresh&&!pocketRes.error?(pocketRes.data??[]).map(m=>`[recorded ${m.source_recorded_at||'unknown'}] ${m.content}`).join('\n'):'Unavailable'}

SOURCE LIMITATIONS:
${limitations.join(' ')||'All listed sources refreshed.'}`

  const dayKey=now.toLocaleDateString('en-CA',{timeZone:'Australia/Sydney'})
  const {error:claimError}=await supabase.from('briefing_deliveries').insert({day_key:dayKey,status:'preparing'})
  if(claimError?.code==='23505')return NextResponse.json({ok:true,skipped:true,reason:'briefing already claimed'})
  if(claimError)return NextResponse.json({ok:false,error:'Could not reserve briefing delivery'},{status:503})
  let delivering=false
  try {
  const res = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  })

  const message = res.content[0].type === 'text' ? res.content[0].text.trim() : ''
  if (!message) throw new Error('No message generated')

  const slackText = `🩷 *${dayOfWeek} ${dateStr}*\n\n${message}`
  const {error:saveError}=await supabase.from('briefing_deliveries').update({status:'sending',message:slackText}).eq('day_key',dayKey)
  if(saveError)throw saveError
  delivering=true
  await postToSlack(slackText)
  const {error:receiptError}=await supabase.from('briefing_deliveries').update({status:'sent'}).eq('day_key',dayKey)
  if(receiptError)throw receiptError

  // Mark as done so we don't re-post
  await supabase.from('agent_thoughts').insert({
    agent: 'caspar',
    type: 'morning_briefing',
    content: message,
    context: `Morning briefing — ${dateStr}`,
  })

  return NextResponse.json({ ok: true, posted: true, message })
  } catch(error:any) {
    if(delivering)await supabase.from('briefing_deliveries').update({status:'uncertain',error:error.message}).eq('day_key',dayKey)
    else await supabase.from('briefing_deliveries').delete().eq('day_key',dayKey).eq('status','preparing')
    return NextResponse.json({ok:false,error:'Morning briefing could not be confirmed'},{status:503})
  }
}
