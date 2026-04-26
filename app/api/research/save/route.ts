import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { result, clientId } = await req.json()

  // Save structured pattern to research_patterns
  await supabase.from('research_patterns').insert({
    client_id: clientId || null,
    platform: result.platform,
    author: result.author,
    video_url: result.url,
    caption: result.caption,
    views: result.views || 0,
    likes: result.likes || 0,
    hook: extractSection(result.analysis, 'HOOK'),
    format: extractSection(result.analysis, 'FORMAT'),
    why_it_popped: extractSection(result.analysis, 'WHY IT HITS'),
    pattern: extractSection(result.analysis, 'THE PATTERN'),
    no_context_angles: extractSection(result.analysis, 'NO CONTEXT ANGLES'),
    full_analysis: result.analysis,
  })

  // Also append to Caspar's memory blob (keeps backward compat)
  const { data: current } = await supabase
    .from('agent_memory')
    .select('content')
    .eq('agent', 'caspar')
    .single()

  const existing = current?.content || ''
  const date = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
  const entry = `\n\n---\n[CONTENT PATTERN — ${date}]\nPlatform: ${result.platform} · @${result.author}\n${result.analysis}\n---`

  await supabase
    .from('agent_memory')
    .upsert({ agent: 'caspar', content: existing + entry }, { onConflict: 'agent' })

  return NextResponse.json({ ok: true })
}

function extractSection(text: string, key: string): string {
  if (!text) return ''
  const keys = ['HOOK', 'FORMAT', 'WHY IT HITS', 'THE PATTERN', 'NO CONTEXT ANGLES']
  const escaped = keys.map(k => k.replace(/ /g, '\\s+'))
  const pattern = new RegExp(`(${escaped.join('|')}):`, 'g')
  const matches: { key: string; index: number }[] = []
  let m
  while ((m = pattern.exec(text)) !== null) {
    matches.push({ key: m[1].replace(/\s+/g, ' '), index: m.index + m[0].length })
  }
  for (let i = 0; i < matches.length; i++) {
    if (matches[i].key === key) {
      const start = matches[i].index
      const end = i + 1 < matches.length ? matches[i + 1].index - matches[i + 1].key.length - 1 : text.length
      return text.slice(start, end).trim()
    }
  }
  return ''
}
