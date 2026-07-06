import { supabase } from '@/lib/supabase'
import type { Memory, MemoryType } from '@/lib/memory'

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
    } else {
      // Everything else → the appropriate aggregate note
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
