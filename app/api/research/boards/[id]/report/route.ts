import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// The rollup is the actual deliverable here — one video is an anecdote, the
// synthesis across everything analysed in the keyword set is the trend the
// team can act on. Only runs against videos that have already been
// individually analysed (full_analysis populated) — never re-triggers video
// analysis itself.
export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data: board } = await supabase.from('research_boards').select('*').eq('id', id).single()
  if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 })

  const { data: videos } = await supabase
    .from('research_patterns')
    .select('platform, author, caption, views, virality_score, hook, format, why_it_popped, pattern, no_context_angles, comment_analysis')
    .eq('board_id', id)
    .not('full_analysis', 'is', null)
    .order('virality_score', { ascending: false })

  if (!videos?.length) {
    return NextResponse.json({ error: 'No analysed videos on this board yet — analyse at least a few before generating a rollup' }, { status: 400 })
  }

  const digest = videos.map((v, i) => `
VIDEO ${i + 1} — ${v.platform} @${v.author || 'unknown'} — virality ${v.virality_score ?? '?'}/100 — ${v.views?.toLocaleString() ?? '?'} views
Hook: ${v.hook || '—'}
Format: ${v.format || '—'}
Why it hits: ${v.why_it_popped || '—'}
Pattern: ${v.pattern || '—'}
${v.comment_analysis?.audienceLanguage ? `Audience language: ${v.comment_analysis.audienceLanguage}` : ''}`).join('\n')

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: 'You are a creative director at NO CONTEXT, a social-first creative agency, briefing your team on a batch of research.',
    messages: [{
      role: 'user',
      content: `Here are ${videos.length} videos pulled for the keyword set "${board.keywords.join(', ')}"${board.client_name ? ` for the client ${board.client_name}` : ''}, each already individually analysed:
${digest}

Synthesize the trend across ALL of these — not a recap of each video. Write in flowing prose, no bullet menus, no bold, no markdown headers beyond plain labels.

FORMATS: Which formats/mechanics show up repeatedly across this set, and which ones correlate with the highest virality scores?

RECURRING HOOKS: The hook patterns that keep working across different creators/topics in this set.

AUDIENCE SIGNAL: If comment/audience language data is present, what does it reveal about what this audience actually wants or asks for?

RECOMMENDATIONS: 3-5 concrete, specific creative recommendations for what NO CONTEXT should make next based on this batch — name actual formats and angles, not generic advice.`,
    }],
  })

  const report = response.content[0].type === 'text' ? response.content[0].text : ''

  const { data, error } = await supabase
    .from('research_boards')
    .update({ rollup_report: report, rollup_generated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
