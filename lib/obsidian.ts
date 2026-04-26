import * as fs from 'fs'
import * as path from 'path'
import type { Memory, MemoryType } from '@/lib/memory'

const VAULT = '/Users/joshua/Desktop/secret'

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

function ensureDir(folder: string) {
  const dir = path.join(VAULT, folder)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
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

/**
 * Append a line to a note. Creates the note if it doesn't exist.
 */
function appendToNote(folder: string, filename: string, line: string, heading?: string) {
  ensureDir(folder)
  const filepath = path.join(VAULT, folder, `${sanitizeFilename(filename)}.md`)
  const date = today()

  if (!fs.existsSync(filepath)) {
    // Create new note with frontmatter
    const initial = `---
created: ${date}
updated: ${date}
---

# ${filename}

## ${heading || 'Notes'}
- ${line}
`
    fs.writeFileSync(filepath, initial, 'utf8')
    return
  }

  const existing = fs.readFileSync(filepath, 'utf8')

  // Update frontmatter updated date
  const updatedContent = existing.replace(/^updated: .+$/m, `updated: ${date}`)

  // Check if the heading section exists
  const headingLine = `## ${heading || 'Notes'}`
  if (updatedContent.includes(headingLine)) {
    // Append under the heading (find the section and add before next ## or EOF)
    const lines = updatedContent.split('\n')
    const headingIdx = lines.findIndex(l => l.trim() === headingLine)
    if (headingIdx !== -1) {
      lines.splice(headingIdx + 1, 0, `- ${line}`)
      fs.writeFileSync(filepath, lines.join('\n'), 'utf8')
      return
    }
  }

  // Append new section at end
  const appended = `${updatedContent.trimEnd()}\n\n## ${heading || 'Notes'}\n- ${line}\n`
  fs.writeFileSync(filepath, appended, 'utf8')
}

/**
 * Write to today's daily log.
 */
function appendToDailyLog(memory: Memory) {
  ensureDir('Daily')
  const date = today()
  const filepath = path.join(VAULT, 'Daily', `${date}.md`)

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

  if (!fs.existsSync(filepath)) {
    const initial = `---
date: ${date}
---

# ${date}

${line}
`
    fs.writeFileSync(filepath, initial, 'utf8')
    return
  }

  const existing = fs.readFileSync(filepath, 'utf8')
  fs.writeFileSync(filepath, `${existing.trimEnd()}\n${line}\n`, 'utf8')
}

/**
 * Update or create a client's living note.
 * Client notes are special — they consolidate everything about one client.
 */
export function syncClientNote(clientName: string, content: string, source?: string) {
  ensureDir('Clients')
  const filepath = path.join(VAULT, 'Clients', `${sanitizeFilename(clientName)}.md`)
  const date = today()
  const sourceTag = source ? ` *(${source})*` : ''
  const line = `${content}${sourceTag}`

  if (!fs.existsSync(filepath)) {
    const initial = `---
created: ${date}
updated: ${date}
---

# ${clientName}

## Context
- ${line}
`
    fs.writeFileSync(filepath, initial, 'utf8')
    return
  }

  appendToNote('Clients', clientName, line, 'Context')
}

/**
 * Main sync function — takes a memory and writes it to the right place.
 */
export function syncMemoryToVault(memory: Memory) {
  try {
    const folder = TYPE_TO_FOLDER[memory.type]
    const heading = TYPE_TO_HEADING[memory.type]
    const line = addWikilinks(memory.content, memory.related_client || undefined)
    const sourceTag = memory.source ? ` *(${memory.source})*` : ''

    if (memory.type === 'client' && memory.related_client) {
      // Client memories → client's own note
      syncClientNote(memory.related_client, `${line}${sourceTag}`, undefined)
    } else if (memory.type === 'contact' && memory.related_client) {
      // Contact memories → people note named after the person
      appendToNote('People', memory.related_client, `${line}${sourceTag}`, 'Notes')
    } else {
      // Everything else → the appropriate aggregate note
      const noteName = TYPE_TO_NOTE[memory.type] || 'Notes'
      appendToNote(folder, noteName, `${line}${sourceTag}`, heading)
    }

    // Everything also goes in the daily log
    appendToDailyLog(memory)
  } catch (err) {
    // Never let Obsidian sync break the main save
    console.error('[obsidian] sync error:', err)
  }
}

/**
 * Sync all existing memories from the database to the vault.
 * Run this once to backfill.
 */
export async function syncAllMemoriesToVault(memories: Memory[]) {
  for (const memory of memories) {
    syncMemoryToVault(memory)
  }
  console.log(`[obsidian] synced ${memories.length} memories to vault`)
}

/**
 * Sync a Caspar thought/feeling/observation to the vault.
 * Goes into Caspar/Mind.md and the daily log.
 */
export function syncThoughtToVault(thought: {
  type: string
  content: string
  context?: string
}) {
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

    // Append to Caspar/Mind.md under the right section
    ensureDir('Caspar')
    const mindPath = path.join(VAULT, 'Caspar', 'Mind.md')

    if (!fs.existsSync(mindPath)) {
      const initial = `---
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
      fs.writeFileSync(mindPath, initial, 'utf8')
    }

    const heading = `## ${thought.type.charAt(0).toUpperCase() + thought.type.slice(1)}s`
    const existing = fs.readFileSync(mindPath, 'utf8')
    const updatedContent = existing.replace(/^updated: .+$/m, `updated: ${date}`)
    const lines = updatedContent.split('\n')
    const headingIdx = lines.findIndex(l => l.trim() === heading)

    if (headingIdx !== -1) {
      lines.splice(headingIdx + 1, 0, `- ${date}: ${line}`)
      fs.writeFileSync(mindPath, lines.join('\n'), 'utf8')
    } else {
      const appended = `${updatedContent.trimEnd()}\n\n${heading}\n- ${date}: ${line}\n`
      fs.writeFileSync(mindPath, appended, 'utf8')
    }

    // Also in daily log
    ensureDir('Daily')
    const dailyPath = path.join(VAULT, 'Daily', `${date}.md`)
    const dailyLine = `- ${label} [[Caspar]]: ${line}`

    if (!fs.existsSync(dailyPath)) {
      fs.writeFileSync(dailyPath, `---\ndate: ${date}\n---\n\n# ${date}\n\n${dailyLine}\n`, 'utf8')
    } else {
      const d = fs.readFileSync(dailyPath, 'utf8')
      fs.writeFileSync(dailyPath, `${d.trimEnd()}\n${dailyLine}\n`, 'utf8')
    }
  } catch (err) {
    console.error('[obsidian] thought sync error:', err)
  }
}
