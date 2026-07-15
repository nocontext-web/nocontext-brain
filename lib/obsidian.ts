import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'
import type { Memory, MemoryType } from '@/lib/memory'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Types prone to becoming a single ever-growing bullet list (Taste Notes.md,
// Content Patterns.md, etc) go through integrateFact instead of appendToNote —
// it decides whether a fact belongs in an existing focused note or deserves
// its own, and integrates it into the actual prose instead of tacking on a
// bullet. client/contact stay on appendToNote: they're already one note per
// entity, so there's no "which note" decision to make.
const SMART_INTEGRATE_TYPES: MemoryType[] = ['creative_insight', 'taste_note', 'process_rule', 'opinion', 'general']

// Notes live in Supabase (obsidian_notes), not on disk — this code runs on Railway,
// which has no access to Josh's laptop filesystem. A local watcher script
// (scripts/sync-obsidian.js) mirrors these rows down into the actual Obsidian vault
// at ~/nocontext-vault, and pushes Josh's own local edits back up. Source of truth
// is always this table; the vault is a synced, human-editable view onto it.

// Memory type → which folder and note it belongs to
const TYPE_TO_FOLDER: Record<MemoryType, string> = {
  client: 'Clients',
  contact: 'People',
  decision: 'Decisions',
  creative_insight: 'Creative',
  taste_note: 'Taste',
  process_rule: 'Rules',
  opinion: 'Josh',
  general: 'Josh',
}

const TYPE_TO_NOTE: Record<MemoryType, string> = {
  client: '', // uses related_client as filename
  contact: '', // uses related_client or parsed name
  decision: 'Decision Log',
  creative_insight: 'Content Patterns',
  taste_note: 'Taste Notes',
  process_rule: 'Process & Rules',
  opinion: 'Opinions',
  general: 'Notes',
}

const TYPE_TO_HEADING: Record<MemoryType, string> = {
  client: 'Context',
  contact: 'Notes',
  decision: 'Decisions',
  creative_insight: 'Insights',
  taste_note: 'Notes',
  process_rule: 'Rules',
  opinion: 'Opinions',
  general: 'Notes',
}

function today(): string {
  return new Date().toISOString().split('T')[0]
}

function sanitizeFilename(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '-').trim()
}

/**
 * Extract wikilinks from content — any client name, creator, or known entity
 * gets wrapped as [[Name]] to build the graph.
 */
function addWikilinks(content: string, relatedClient?: string): string {
  let result = content
  if (relatedClient && !content.includes(`[[${relatedClient}]]`)) {
    result = `${result} [[${relatedClient}]]`
  }
  return result
}

async function readNoteContent(notePath: string): Promise<string> {
  const { data } = await supabase.from('obsidian_notes').select('content').eq('path', notePath).single()
  return data?.content ?? ''
}

async function upsertNote(notePath: string, folder: string, title: string, content: string): Promise<void> {
  await supabase.from('obsidian_notes').upsert(
    { path: notePath, folder, title, content, source: 'agent', updated_at: new Date().toISOString() },
    { onConflict: 'path' }
  )
}

/**
 * Append a line to a note. Creates the note if it doesn't exist.
 */
async function appendToNote(folder: string, filename: string, line: string, heading?: string): Promise<void> {
  const title = sanitizeFilename(filename)
  const notePath = `${folder}/${title}.md`
  const date = today()
  const existing = await readNoteContent(notePath)

  if (!existing) {
    const initial = `---
created: ${date}
updated: ${date}
---

# ${filename}

## ${heading || 'Notes'}
- ${line}
`
    await upsertNote(notePath, folder, title, initial)
    return
  }

  const updatedContent = existing.replace(/^updated: .+$/m, `updated: ${date}`)
  const headingLine = `## ${heading || 'Notes'}`
  if (updatedContent.includes(headingLine)) {
    const lines = updatedContent.split('\n')
    const headingIdx = lines.findIndex(l => l.trim() === headingLine)
    if (headingIdx !== -1) {
      lines.splice(headingIdx + 1, 0, `- ${line}`)
      await upsertNote(notePath, folder, title, lines.join('\n'))
      return
    }
  }

  const appended = `${updatedContent.trimEnd()}\n\n## ${heading || 'Notes'}\n- ${line}\n`
  await upsertNote(notePath, folder, title, appended)
}

/**
 * Files a fact into the right existing note, or a new one, instead of
 * appending a bullet to one big aggregate note. Two Claude calls: a cheap one
 * to decide where it goes, then one to actually integrate it — rewriting the
 * relevant part of the note, and inserting a `> [!contradiction]` callout
 * (citing both the old and new claim) if the fact conflicts with what's
 * already there, instead of silently overwriting it.
 */
async function integrateFact(folder: string, fact: string, opts: { relatedClient?: string; source?: string } = {}): Promise<void> {
  const line = addWikilinks(fact, opts.relatedClient)
  const sourceTag = opts.source ? ` (${opts.source})` : ''
  const factLine = `${line}${sourceTag}`

  const { data: existingNotes } = await supabase
    .from('obsidian_notes')
    .select('path, title, content')
    .eq('folder', folder)

  const notes = existingNotes ?? []
  const catalog = notes.length ? notes.map(n => `- ${n.title}`).join('\n') : '(folder is empty)'

  const decisionRes = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: `You maintain a personal knowledge vault (Obsidian) for Josh, founder of a social-first creative agency.

New fact for the "${folder}" folder: "${factLine}"

Existing notes in this folder:
${catalog}

Decide where it belongs. Reply with JSON only, no markdown:
{ "action": "integrate" | "new_note", "title": "exact existing title to integrate into, or a short new Title Case name with no file extension" }

Only choose "integrate" if the fact is genuinely about the same specific concept as an existing note — not just the same broad topic. Prefer a new, focused note over cramming unrelated facts into a broad one.`,
    }],
  })

  const decisionText = decisionRes.content[0]?.type === 'text' ? decisionRes.content[0].text : ''
  const match = decisionText.match(/\{[\s\S]*\}/)
  const decision: { action: 'integrate' | 'new_note'; title: string } = match
    ? JSON.parse(match[0])
    : { action: 'new_note', title: sanitizeFilename(fact.slice(0, 40)) }

  const target = notes.find(n => n.title === decision.title)
  const date = today()

  if (decision.action === 'integrate' && target) {
    const writeRes = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      messages: [{
        role: 'user',
        content: `Integrate this new fact into the existing note below. Don't just append a bullet — weave it into the right section, or add a new section if none fits.

If the new fact contradicts something already in the note, don't silently overwrite it: insert a callout in exactly this form, right above the affected section —
> [!contradiction] ${date}
> Existing: "<the old claim>"
> New: "<the new claim>" (${factLine})
Leave both claims visible so Josh can resolve it himself.

NEW FACT: ${factLine}

EXISTING NOTE ("${target.title}"):
${target.content}

Return only the full updated note content (markdown), no preamble or explanation.`,
      }],
    })
    const updated = writeRes.content[0]?.type === 'text' ? writeRes.content[0].text.trim() : target.content
    if (updated) await upsertNote(target.path, folder, target.title, updated)
    return
  }

  // new_note
  const title = sanitizeFilename(decision.title || fact.slice(0, 40))
  const notePath = `${folder}/${title}.md`
  const initial = `---
created: ${date}
updated: ${date}
---

# ${title}

${factLine}
`
  await upsertNote(notePath, folder, title, initial)
}

/**
 * Write to today's daily log.
 */
async function appendToDailyLog(memory: Memory): Promise<void> {
  const date = today()
  const notePath = `Daily/${date}.md`

  const typeLabel: Record<MemoryType, string> = {
    client: '🏢 Client',
    contact: '👤 Contact',
    decision: '⚡ Decision',
    creative_insight: '💡 Creative',
    taste_note: '🎨 Taste',
    process_rule: '📋 Rule',
    opinion: '💭 Opinion',
    general: '📝 Note',
  }

  const label = typeLabel[memory.type] || '📝'
  const clientTag = memory.related_client ? ` [[${memory.related_client}]]` : ''
  const line = `- ${label}${clientTag}: ${memory.content}`

  const existing = await readNoteContent(notePath)
  if (!existing) {
    await upsertNote(notePath, 'Daily', date, `---\ndate: ${date}\n---\n\n# ${date}\n\n${line}\n`)
    return
  }

  await upsertNote(notePath, 'Daily', date, `${existing.trimEnd()}\n${line}\n`)
}

/**
 * Update or create a client's living note.
 * Client notes are special — they consolidate everything about one client.
 */
export async function syncClientNote(clientName: string, content: string, source?: string): Promise<void> {
  const sourceTag = source ? ` *(${source})*` : ''
  await appendToNote('Clients', clientName, `${content}${sourceTag}`, 'Context')
}

/**
 * Main sync function — takes a memory and writes it to the right place.
 */
export async function syncMemoryToVault(memory: Memory): Promise<void> {
  try {
    const folder = TYPE_TO_FOLDER[memory.type]
    const heading = TYPE_TO_HEADING[memory.type]
    const line = addWikilinks(memory.content, memory.related_client || undefined)
    const sourceTag = memory.source ? ` *(${memory.source})*` : ''

    if (memory.type === 'client' && memory.related_client) {
      // Client memories → client's own note
      await syncClientNote(memory.related_client, `${line}${sourceTag}`, undefined)
    } else if (memory.type === 'contact' && memory.related_client) {
      // Contact memories → people note named after the person
      await appendToNote('People', memory.related_client, `${line}${sourceTag}`, 'Notes')
    } else if (SMART_INTEGRATE_TYPES.includes(memory.type)) {
      // These used to all pile into one ever-growing note (e.g. every taste_note
      // as a bullet in Taste/Taste Notes.md) — integrateFact decides whether this
      // belongs in an existing focused note or deserves its own.
      await integrateFact(folder, memory.content, { relatedClient: memory.related_client || undefined, source: memory.source })
    } else {
      // decision: a running log is the right shape for this one, keep it simple.
      const noteName = TYPE_TO_NOTE[memory.type] || 'Notes'
      await appendToNote(folder, noteName, `${line}${sourceTag}`, heading)
    }

    // Everything also goes in the daily log
    await appendToDailyLog(memory)
  } catch (err) {
    // Never let vault sync break the main save
    console.error('[obsidian] sync error:', err)
  }
}

/**
 * Sync all existing memories from the database to the vault.
 * Run this once to backfill.
 */
export async function syncAllMemoriesToVault(memories: Memory[]): Promise<void> {
  for (const memory of memories) {
    await syncMemoryToVault(memory)
  }
  console.log(`[obsidian] synced ${memories.length} memories to vault`)
}

/**
 * Sync a Caspar thought/feeling/observation to the vault.
 * Goes into Caspar/Mind.md and the daily log.
 */
export async function syncThoughtToVault(thought: {
  type: string
  content: string
  context?: string
}): Promise<void> {
  try {
    const date = today()
    const typeLabel: Record<string, string> = {
      feeling:     '💜 Feeling',
      observation: '👁 Observation',
      thought:     '💭 Thought',
      opinion:     '🔥 Opinion',
      question:    '❓ Question',
      reaction:    '⚡ Reaction',
    }
    const label = typeLabel[thought.type] ?? '💭 Thought'
    const contextTag = thought.context ? ` *(${thought.context})*` : ''
    const line = `${thought.content}${contextTag}`

    const mindPath = 'Caspar/Mind.md'
    let existing = await readNoteContent(mindPath)

    if (!existing) {
      existing = `---
created: ${date}
updated: ${date}
---

# Caspar's Mind

## Thoughts
## Feelings
## Observations
## Opinions
## Questions
## Reactions
`
    }

    const heading = `## ${thought.type.charAt(0).toUpperCase() + thought.type.slice(1)}s`
    const updatedContent = existing.replace(/^updated: .+$/m, `updated: ${date}`)
    const lines = updatedContent.split('\n')
    const headingIdx = lines.findIndex(l => l.trim() === heading)

    let finalContent: string
    if (headingIdx !== -1) {
      lines.splice(headingIdx + 1, 0, `- ${date}: ${line}`)
      finalContent = lines.join('\n')
    } else {
      finalContent = `${updatedContent.trimEnd()}\n\n${heading}\n- ${date}: ${line}\n`
    }
    await upsertNote(mindPath, 'Caspar', 'Mind', finalContent)

    // Also in daily log
    const dailyPath = `Daily/${date}.md`
    const dailyLine = `- ${label} [[Caspar]]: ${line}`
    const dailyExisting = await readNoteContent(dailyPath)
    if (!dailyExisting) {
      await upsertNote(dailyPath, 'Daily', date, `---\ndate: ${date}\n---\n\n# ${date}\n\n${dailyLine}\n`)
    } else {
      await upsertNote(dailyPath, 'Daily', date, `${dailyExisting.trimEnd()}\n${dailyLine}\n`)
    }
  } catch (err) {
    console.error('[obsidian] thought sync error:', err)
  }
}
