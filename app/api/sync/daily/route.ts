import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

function today() {
  return new Date().toISOString().split('T')[0]
}

function sanitize(name: string) {
  return name.replace(/[/\\:*?"<>|]/g, '-').trim()
}

async function readNote(folder: string, filename: string): Promise<string> {
  const path = `${folder}/${sanitize(filename)}.md`
  const { data } = await supabase.from('obsidian_notes').select('content').eq('path', path).single()
  return data?.content ?? ''
}

async function writeNote(folder: string, filename: string, content: string): Promise<void> {
  const title = sanitize(filename)
  const path = `${folder}/${title}.md`
  await supabase.from('obsidian_notes').upsert(
    { path, folder, title, content, source: 'agent', updated_at: new Date().toISOString() },
    { onConflict: 'path' }
  )
}

function appendToSection(content: string, section: string, lines: string): string {
  const heading = `## ${section}`
  if (content.includes(heading)) {
    return content.replace(heading, `${heading}\n${lines}`)
  }
  return `${content.trimEnd()}\n\n## ${section}\n${lines}\n`
}

export async function POST() {
  const date = today()

  // 1. Pull everything from the last 24 hours
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [memoriesRes, researchRes, casparPromptRes] = await Promise.all([
    supabase.from('memories').select('*').gte('created_at', since).eq('status', 'active').order('created_at'),
    supabase.from('research_patterns').select('*').gte('created_at', since).order('created_at'),
    supabase.from('agent_prompts').select('prompt').eq('agent', 'caspar').single(),
  ])

  const todaysMemories = memoriesRes.data ?? []
  const todaysResearch = researchRes.data ?? []
  const casparPrompt = casparPromptRes.data?.prompt ?? ''

  const hasActivity = todaysMemories.length > 0 || todaysResearch.length > 0

  // 2. Build context of what happened today
  const memoryLines = todaysMemories.map(m =>
    `[${m.type}${m.related_client ? ` · ${m.related_client}` : ''}] ${m.content}`
  ).join('\n')

  const researchLines = todaysResearch.map(r =>
    `[${r.platform} @${r.author}] Pattern: ${r.pattern || '—'} | Why it hits: ${(r.why_it_popped || '').slice(0, 150)}`
  ).join('\n')

  // 3. Load Josh's profile note for context
  const joshProfile = await readNote('Josh', 'Profile')

  // 4. Ask Caspar to synthesise the day — in his voice, with genuine observations
  const synthesisPrompt = hasActivity
    ? `${casparPrompt}

You are writing your end-of-day notes in your private Obsidian vault. This is NOT for Josh to action — this is YOUR thinking space. Write like you're reflecting at the end of the day.

TODAY'S DATE: ${date}

WHAT HAPPENED TODAY:
${memoryLines || '(no new memories saved)'}

${researchLines ? `CONTENT RESEARCHED:\n${researchLines}` : ''}

WHAT I KNOW ABOUT JOSH SO FAR:
${joshProfile.slice(0, 1000) || '(building picture)'}

Write three sections:

## What I Learned Today
Bullet points — specific things I now know that I didn't before. Not just facts, but what they mean. What patterns am I seeing?

## What I'm Noticing About Josh
Genuine observations about how he thinks, what he cares about, what he's building toward, how he operates. This is me building my understanding of him as a person and a founder — not a performance review, just honest observations. 2-3 paragraphs.

## Questions I'm Sitting With
Things I'm uncertain about, patterns I haven't figured out yet, things worth exploring in our next conversation.

Write in first person as Caspar. Be specific. Be honest. This is private reflection, not a report.`
    : `${casparPrompt}

WHAT I KNOW ABOUT JOSH SO FAR:
${joshProfile.slice(0, 1000) || '(building picture)'}

Write a brief end-of-day note for ${date}. It was a quiet day — no new information came in. Reflect briefly on what you already know (from the profile above) and what you're still building a picture of with Josh and NO CONTEXT. Keep it short. Be honest — but honest about the actual gaps, not a disclaimer that you have no memory at all, because you do (it's right above).`

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{ role: 'user', content: synthesisPrompt }],
  })

  const synthesis = response.content[0].type === 'text' ? response.content[0].text.trim() : ''

  // 5. Write today's daily note
  const dailyContent = `---
date: ${date}
memories_saved: ${todaysMemories.length}
research_done: ${todaysResearch.length}
---

# ${date}

${hasActivity ? `*${todaysMemories.length} memories · ${todaysResearch.length} research patterns*\n` : '*Quiet day*\n'}
${synthesis}

---

## Raw Log
${todaysMemories.length > 0 ? todaysMemories.map(m => `- **${m.type}**${m.related_client ? ` [[${m.related_client}]]` : ''}: ${m.content}`).join('\n') : '*(nothing logged today)*'}
${todaysResearch.length > 0 ? '\n### Content Researched\n' + todaysResearch.map(r => `- [[${r.platform}]] @${r.author}: ${r.pattern || '—'}`).join('\n') : ''}
`
  await writeNote('Daily', date, dailyContent)

  // 6. Update client notes with anything new learned today
  const clientMemories = todaysMemories.filter(m => m.related_client)
  const clientGroups: Record<string, typeof todaysMemories> = {}
  for (const m of clientMemories) {
    if (!clientGroups[m.related_client!]) clientGroups[m.related_client!] = []
    clientGroups[m.related_client!].push(m)
  }

  for (const [clientName, memories] of Object.entries(clientGroups)) {
    const existing = await readNote('Clients', clientName)
    if (!existing) continue

    const newLines = memories.map(m => `- ${m.content} *(${date})*`).join('\n')
    const updated = appendToSection(
      existing.replace(/^updated: .+$/m, `updated: ${date}`),
      'Context',
      newLines
    )
    await writeNote('Clients', clientName, updated)
  }

  // 7. Update Josh's profile note with observations about him
  if (synthesis.includes('What I\'m Noticing About Josh')) {
    const observationMatch = synthesis.match(/## What I'm Noticing About Josh\n([\s\S]*?)(?=\n##|$)/)
    if (observationMatch) {
      const observation = observationMatch[1].trim()
      const existing = await readNote('Josh', 'Profile')
      const entry = `\n### ${date}\n${observation}\n`
      const updated = existing
        ? appendToSection(existing.replace(/^updated: .+$/m, `updated: ${date}`), "Caspar's Observations", entry)
        : `---\ncreated: ${date}\nupdated: ${date}\n---\n\n# Josh — Profile\n\n## Caspar's Observations\n${entry}`
      await writeNote('Josh', 'Profile', updated)
    }
  }

  // 8. Update the Content Patterns note with new research
  if (todaysResearch.length > 0) {
    const existing = await readNote('Creative', 'Content Patterns')
    const newLines = todaysResearch
      .filter(r => r.pattern)
      .map(r => `- **${r.platform}** @${r.author}: ${r.pattern} *(${date})*`)
      .join('\n')

    if (newLines) {
      const updated = existing
        ? appendToSection(existing.replace(/^updated: .+$/m, `updated: ${date}`), 'Patterns', newLines)
        : `---\ncreated: ${date}\nupdated: ${date}\n---\n\n# Content Patterns\n\n## Patterns\n${newLines}\n`
      await writeNote('Creative', 'Content Patterns', updated)
    }
  }

  return NextResponse.json({
    ok: true,
    date,
    memories: todaysMemories.length,
    research: todaysResearch.length,
    clients_updated: Object.keys(clientGroups).length,
  })
}
