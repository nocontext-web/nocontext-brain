// Consolidates scattered Obsidian notes into single canonical notes per entity
// Run with: node scripts/consolidate-notes.js

require('dotenv').config({ path: '.env.local' })
const Anthropic = require('@anthropic-ai/sdk')
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const normalise = str => str.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()

// Group notes that are about the same entity
function groupNotes(notes) {
  const groups = []
  const assigned = new Set()

  for (const note of notes) {
    if (assigned.has(note.path)) continue

    const normTitle = normalise(note.title)
    const titleWords = normTitle.split(' ').filter(w => w.length > 2)
    const group = [note]
    assigned.add(note.path)

    for (const other of notes) {
      if (assigned.has(other.path)) continue
      const normOther = normalise(other.title)
      const otherWords = normOther.split(' ').filter(w => w.length > 2)

      // Check overlap
      const overlap = titleWords.filter(w => otherWords.includes(w) || normOther.includes(w)).length
      const score = overlap / Math.max(titleWords.length, 1)

      const containsEither = normTitle.includes(normOther) || normOther.includes(normTitle)

      if (score > 0.5 || containsEither) {
        group.push(other)
        assigned.add(other.path)
      }
    }

    groups.push(group)
  }

  return groups
}

// Pick the best canonical title from a group (shortest/simplest = most likely the entity name)
function canonicalTitle(group) {
  return group.sort((a, b) => a.title.length - b.title.length)[0].title
}

async function mergeGroup(folder, group) {
  if (group.length === 1) return // Nothing to merge

  const canonical = canonicalTitle(group)
  console.log(`\n  Merging ${group.length} notes → "${canonical}":`)
  group.forEach(n => console.log(`    - ${n.title}`))

  const combined = group.map(n => `### ${n.title}\n${n.content}`).join('\n\n---\n\n')

  const mergeRes = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `You are building a second brain for a creative agency director named Josh.

Below are multiple notes about the same entity ("${canonical}") that were saved separately and need to be consolidated into one clean, useful master note.

${combined}

Write a single, well-structured note that:
- Merges all unique information without repetition
- Is organised with clear sections (e.g. Overview, Key Info, Campaign Notes, Conversations, Insights)
- Adds your own synthesis and useful observations where relevant
- Reads like a living document that will keep growing — not a log
- Is concise but complete
- If two of the source notes actually contradict each other (not just cover different things), don't silently pick one — add a "> [!contradiction]" callout quoting both claims so Josh can resolve it himself

Return only the note content, no preamble or explanation.`
    }]
  })

  const mergedContent = mergeRes.content[0].type === 'text' ? mergeRes.content[0].text.trim() : ''
  if (!mergedContent) return

  const canonicalPath = `${folder}/${canonical}.md`

  // Upsert the canonical note
  await supabase.from('obsidian_notes').upsert(
    { path: canonicalPath, folder, title: canonical, content: mergedContent, source: 'agent', updated_at: new Date().toISOString() },
    { onConflict: 'path' }
  )

  // Delete the other notes (keep only canonical)
  const toDelete = group.filter(n => n.title !== canonical).map(n => n.path)
  if (toDelete.length > 0) {
    await supabase.from('obsidian_notes').delete().in('path', toDelete)
  }

  console.log(`  ✓ Consolidated into: ${canonicalPath}`)
}

async function run() {
  console.log('Loading all Obsidian notes...')
  const { data: notes } = await supabase
    .from('obsidian_notes')
    .select('path, folder, title, content')
    .order('folder')

  if (!notes || notes.length === 0) {
    console.log('No notes found.')
    return
  }

  console.log(`Found ${notes.length} notes across ${[...new Set(notes.map(n => n.folder))].join(', ')}`)

  // Process each folder separately
  const folders = [...new Set(notes.map(n => n.folder))]

  for (const folder of folders) {
    const folderNotes = notes.filter(n => n.folder === folder)
    console.log(`\nFolder: ${folder} (${folderNotes.length} notes)`)

    const groups = groupNotes(folderNotes)
    console.log(`  → ${groups.length} unique entities`)

    for (const group of groups) {
      await mergeGroup(folder, group)
    }
  }

  console.log('\n✓ Done. All notes consolidated.')
}

run().catch(console.error)
