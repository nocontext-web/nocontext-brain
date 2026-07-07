import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// agent_memory.content is an append-only log every agent (Caspar, Hermes, MCP,
// training sessions, video filings) writes one line to and nobody ever prunes.
// Every consumer that injects "YOUR MEMORY" into a prompt truncates it with
// .slice(0, N) — which reads the FRONT of the string, i.e. the oldest entries.
// Once the log outgrows the biggest slice window (currently 3000 chars), every
// fact appended after that point is invisible to every agent except the
// unsliced MCP get_memory tool. This runs nightly to rewrite the raw log into
// a compact, current, organised document so the whole thing stays small enough
// to actually be read, and duplicates/superseded facts stop competing with the
// correction that replaced them.

function today() {
  return new Date().toISOString().split('T')[0]
}

export async function POST() {
  const { data } = await supabase.from('agent_memory').select('content').eq('agent', 'caspar').single()
  const raw = data?.content ?? ''

  if (raw.trim().length < 4000) {
    return NextResponse.json({ ok: true, skipped: 'memory small enough, nothing to consolidate', length: raw.length })
  }

  const date = today()

  const prompt = `You are Caspar, maintaining your own memory about Josh Kessel and NO CONTEXT. Below is your raw memory log — every fact you've picked up over time, appended in the order you learned it. It has never been cleaned up: it contains duplicates, superseded facts, and corrections sitting right next to the wrong information they corrected.

Rewrite it into a clean, current memory document. This is not a summary that loses detail — it's an edit that removes noise so what's left is denser and more useful.

RAW MEMORY LOG:
${raw}

Rules:
- Where a later entry corrects or supersedes an earlier one (e.g. "X is NOT true, previous memory was wrong"), keep only the corrected version. Drop the superseded fact entirely — don't keep both.
- Merge duplicate or near-duplicate entries about the same fact into one.
- Keep specific names, numbers, dates and quotes. Don't generalise detail away.
- Organise into these sections (omit a section if you genuinely have nothing for it):

## Core Facts & Rules
Durable stuff that basically never changes — team, contacts you'll always need, hard style rules ("no em dashes ever"), how Josh likes to work.

## Active Clients — Current State
One entry per client, current status only — not a chronological history of how it got there. If a client's situation is fully resolved or closed, either drop it or compress it to one line.

## Taste & Strategy Patterns
What you've learned about how Josh thinks — creative taste, decision-making style, what he looks for in clients or content. This is the stuff from training sessions and reference videos — keep it rich, this is the highest-value section.

## Recent Signal
Things from roughly the last 30 days that matter but haven't fully settled into the sections above yet.

## Open Questions
Genuine gaps or unresolved contradictions you noticed while doing this rewrite — things worth actually asking Josh. Don't invent questions for the sake of it. Only include this section if something real surfaced.

Output format — exactly this, no other text before or after:

===MEMORY===
(the rewritten document)
===QUESTIONS===
(one open question per line, or nothing if none)`

  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = res.content[0].type === 'text' ? res.content[0].text.trim() : ''
  const memoryMatch = text.match(/===MEMORY===([\s\S]*?)===QUESTIONS===/)
  const questionsMatch = text.match(/===QUESTIONS===([\s\S]*)$/)

  const consolidated = memoryMatch?.[1]?.trim()
  if (!consolidated) {
    return NextResponse.json({ ok: false, error: 'Could not parse consolidation output', raw: text.slice(0, 500) }, { status: 500 })
  }

  const questions = (questionsMatch?.[1] ?? '')
    .split('\n')
    .map(l => l.replace(/^[-*\d.]+\s*/, '').trim())
    .filter(Boolean)

  // Archive the pre-consolidation raw log to the Obsidian vault before overwriting —
  // nothing is destroyed, it's just no longer what gets read into prompts.
  await supabase.from('obsidian_notes').upsert({
    path: `System/Memory Archive ${date}.md`,
    folder: 'System',
    title: `Memory Archive ${date}`,
    content: raw,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'path' })

  await supabase.from('agent_memory').update({ content: consolidated }).eq('agent', 'caspar')

  // Replace last run's open questions rather than piling up forever — if a
  // question got answered, the fact it was answered shows up in the next
  // raw log and this pass just won't regenerate it.
  await supabase.from('agent_thoughts').delete().eq('agent', 'caspar').eq('type', 'question').eq('context', 'memory-consolidation')
  if (questions.length) {
    await supabase.from('agent_thoughts').insert(
      questions.map(q => ({ agent: 'caspar', type: 'question', content: q, context: 'memory-consolidation' }))
    )
  }

  return NextResponse.json({
    ok: true,
    before: raw.length,
    after: consolidated.length,
    questions: questions.length,
  })
}
