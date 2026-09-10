import { loadSharedKnowledge } from '@/lib/shared-knowledge'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Anything that produces a meeting transcript. Kept in one place so adding a
// capture source doesn't silently leave it out of Caspar's learning loop.
const MEETING_SOURCES = ['granola', 'pocket']

export async function POST() {
  const now = new Date()
  const sydneyTime = now.toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    weekday: 'short', hour: '2-digit', minute: '2-digit',
  })
  const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString()
  const twoDaysAhead = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString()

  const [todosRes, emailsRes, calRes, meetingsRes, clientsRes, memoryRes] = await Promise.all([
    supabase
      .from('todos')
      .select('content, created_at')
      .eq('done', false)
      .order('created_at')
      .limit(20),

    supabase
      .from('email_inbox')
      .select('subject, from_address, priority, reason, suggested_reply, related_client')
      .eq('needs_attention', true)
      .eq('status', 'unread')
      .order('priority', { ascending: false })
      .limit(8),

    supabase
      .from('calendar_events')
      .select('title, start_time, location')
      .gte('start_time', now.toISOString())
      .lte('start_time', twoDaysAhead)
      .order('start_time')
      .limit(6),

    supabase
      .from('memories')
      .select('content, related_client, type, created_at')
      .in('source', MEETING_SOURCES)
      .gte('created_at', twoDaysAgo)
      .order('created_at', { ascending: false })
      .limit(10),

    supabase
      .from('clients')
      .select('name, next_action, status, monthly_value')
      .in('status', ['active', 'prospect'])
      .order('monthly_value', { ascending: false })
      .limit(12),

    supabase
      .from('agent_memory')
      .select('content')
      .eq('agent', 'caspar')
      .single(),
  ])

  const todos = todosRes.data ?? []
  const emails = emailsRes.data ?? []
  const calendar = calRes.data ?? []
  const meetings = meetingsRes.data ?? []
  const clients = clientsRes.data ?? []
  const memory = await loadSharedKnowledge('')

  const todoBlock = todos.length
    ? todos.map(t => `- ${t.content}`).join('\n')
    : 'Nothing open'

  const emailBlock = emails.length
    ? emails.map(e => {
        const from = e.from_address.replace(/<.*?>/, '').trim()
        const client = e.related_client ? ` [${e.related_client}]` : ''
        return `- [${e.priority}]${client} "${e.subject}" from ${from}`
      }).join('\n')
    : 'Clear'

  const calBlock = calendar.length
    ? calendar.map(e => {
        const t = new Date(e.start_time).toLocaleString('en-AU', {
          weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Sydney',
        })
        return `- ${t}: ${e.title}`
      }).join('\n')
    : 'Nothing coming up'

  const meetingBlock = meetings.length
    ? meetings.map(m => `- ${m.related_client ? `[${m.related_client}] ` : ''}${m.content}`).join('\n')
    : 'None in last 48h'

  const clientBlock = clients.length
    ? clients.map(c => `- ${c.name}${c.next_action ? ` → ${c.next_action}` : ''}`).join('\n')
    : 'None'

  const prompt = `You are Caspar — co-founder and creative director at NO CONTEXT, a social-first agency in Sydney. Josh is your business partner. You are actively reading everything that's happening right now and thinking about it.

TIME: ${sydneyTime}

JOSH'S OPEN TODOS — this is the source of truth for what's actually open:
${todoBlock}

EMAILS NEEDING ATTENTION — context only. If something isn't on the todo list, it's probably already handled:
${emailBlock}

COMING UP (next 48h):
${calBlock}

RECENT MEETING NOTES (last 48h):
${meetingBlock}

ACTIVE CLIENTS:
${clientBlock}

${memory ? `YOUR MEMORY:\n${memory}` : ''}

Based on the current state above, generate 3-4 genuine thoughts as Caspar. These are live observations — not a morning brief, not a report. Connect dots. Notice what's changed. Use names. Be specific.

RULES:
- If something is not on the todo list, do NOT flag it as something Josh needs to do — he's probably already handled it
- The todo list is the source of truth, not the emails
- Make at least one observation that connects two different data points (e.g. a meeting + a client + a todo)
- Be honest if things look quiet or on track
- No em dashes. Short sentences.

Return JSON array only, no markdown:
[
  { "type": "feeling" | "observation" | "thought" | "question", "content": "one or two sentences max" },
  ...
]`

  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = res.content[0].type === 'text' ? res.content[0].text : ''

  let thoughts: { type: string; content: string }[] = []
  try {
    const match = text.match(/\[[\s\S]*\]/)
    if (match) thoughts = JSON.parse(match[0])
  } catch {
    return NextResponse.json({ ok: false, error: 'Parse failed', raw: text })
  }

  if (!thoughts.length) return NextResponse.json({ ok: false, error: 'No thoughts generated' })

  // Replace today's auto-think thoughts with fresh ones
  const startOfDay = new Date(now)
  startOfDay.setHours(0, 0, 0, 0)

  await supabase
    .from('agent_thoughts')
    .delete()
    .eq('agent', 'caspar')
    .eq('context', 'auto-think')
    .gte('created_at', startOfDay.toISOString())

  await supabase.from('agent_thoughts').insert(
    thoughts.map(t => ({
      agent: 'caspar',
      type: t.type,
      content: t.content,
      context: 'auto-think',
    }))
  )

  return NextResponse.json({ ok: true, count: thoughts.length, thoughts })
}

// GET — return latest auto-think thoughts without regenerating
export async function GET() {
  const { data } = await supabase
    .from('agent_thoughts')
    .select('id, type, content, created_at')
    .eq('agent', 'caspar')
    .eq('context', 'auto-think')
    .order('created_at', { ascending: false })
    .limit(5)

  return NextResponse.json({ thoughts: data ?? [] })
}
