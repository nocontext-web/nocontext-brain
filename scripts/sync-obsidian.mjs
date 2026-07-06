/**
 * One-time backfill: sync all existing memories + clients to the Obsidian vault.
 * Run with: node scripts/sync-obsidian.mjs
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const VAULT = '/Users/joshua/nocontext-vault'
const supabase = createClient(
  'https://zcbdxyvymjfytyzisyof.supabase.co',
  'process.env.SUPABASE_SECRET_KEY'
)

function sanitize(name) {
  return name.replace(/[/\\:*?"<>|]/g, '-').trim()
}

function ensureDir(folder) {
  const dir = path.join(VAULT, folder)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function today() {
  return new Date().toISOString().split('T')[0]
}

// Sync clients — create/update a rich living note for each
async function syncClients() {
  const { data: clients } = await supabase.from('clients').select('*')
  if (!clients?.length) return

  ensureDir('Clients')

  for (const client of clients) {
    const filepath = path.join(VAULT, 'Clients', `${sanitize(client.name)}.md`)

    // Build a rich note from the client data
    const status = client.status || 'active'
    const priority = client.priority || 'medium'
    const monthly = client.monthly_value ? `$${client.monthly_value.toLocaleString()}/month` : null
    const contact = client.contact_name || null

    const lines = []
    if (contact) lines.push(`**Contact:** ${contact}`)
    if (monthly) lines.push(`**Monthly value:** ${monthly}`)
    lines.push(`**Status:** ${status} · **Priority:** ${priority}`)
    if (client.next_action) lines.push(`**Next action:** ${client.next_action}`)
    if (client.website) lines.push(`**Website:** ${client.website}`)

    const briefSection = client.brief
      ? `\n## Brief\n${client.brief}`
      : ''

    const content = `---
created: ${today()}
updated: ${today()}
status: ${status}
priority: ${priority}
---

# ${client.name}

${lines.join('\n')}
${briefSection}

## Context

## Decisions

## Creative Notes
`

    // Only write if file doesn't exist (don't overwrite existing notes with richer content)
    if (!fs.existsSync(filepath)) {
      fs.writeFileSync(filepath, content, 'utf8')
      console.log(`  ✓ Created: Clients/${client.name}.md`)
    } else {
      console.log(`  — Exists:  Clients/${client.name}.md`)
    }
  }
}

// Sync structured memories
async function syncMemories() {
  const { data: memories } = await supabase
    .from('memories')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: true })

  if (!memories?.length) {
    console.log('No memories to sync yet')
    return
  }

  const TYPE_FOLDER = {
    client: 'Clients', contact: 'People', decision: 'Decisions',
    creative_insight: 'Creative', taste_note: 'Taste',
    process_rule: 'Rules', opinion: 'Josh', general: 'Josh',
  }
  const TYPE_NOTE = {
    client: '', contact: '', decision: 'Decision Log',
    creative_insight: 'Content Patterns', taste_note: 'Taste Notes',
    process_rule: 'Process & Rules', opinion: 'Opinions', general: 'Notes',
  }
  const TYPE_HEADING = {
    client: 'Context', contact: 'Notes', decision: 'Decisions',
    creative_insight: 'Insights', taste_note: 'Notes',
    process_rule: 'Rules', opinion: 'Opinions', general: 'Notes',
  }
  const TYPE_EMOJI = {
    client: '🏢', contact: '👤', decision: '⚡', creative_insight: '💡',
    taste_note: '🎨', process_rule: '📋', opinion: '💭', general: '📝',
  }

  for (const memory of memories) {
    const folder = TYPE_FOLDER[memory.type] || 'Josh'
    const heading = TYPE_HEADING[memory.type] || 'Notes'
    const clientTag = memory.related_client ? ` [[${memory.related_client}]]` : ''
    const line = `${memory.content}${clientTag}`
    const sourceTag = memory.source ? ` *(${memory.source})*` : ''

    ensureDir(folder)

    let noteName
    if (memory.type === 'client' && memory.related_client) {
      noteName = memory.related_client
    } else if (memory.type === 'contact' && memory.related_client) {
      noteName = memory.related_client
    } else {
      noteName = TYPE_NOTE[memory.type] || 'Notes'
    }

    const filepath = path.join(VAULT, folder, `${sanitize(noteName)}.md`)

    if (!fs.existsSync(filepath)) {
      fs.writeFileSync(filepath, `---\ncreated: ${today()}\n---\n\n# ${noteName}\n\n## ${heading}\n- ${line}${sourceTag}\n`, 'utf8')
    } else {
      const existing = fs.readFileSync(filepath, 'utf8')
      if (!existing.includes(memory.content)) {
        fs.writeFileSync(filepath, `${existing.trimEnd()}\n- ${line}${sourceTag}\n`, 'utf8')
      }
    }

    // Daily log
    const date = memory.created_at?.split('T')[0] || today()
    ensureDir('Daily')
    const dailyPath = path.join(VAULT, 'Daily', `${date}.md`)
    const emoji = TYPE_EMOJI[memory.type] || '📝'
    const dailyLine = `- ${emoji}${clientTag}: ${memory.content}\n`
    if (!fs.existsSync(dailyPath)) {
      fs.writeFileSync(dailyPath, `---\ndate: ${date}\n---\n\n# ${date}\n\n${dailyLine}`, 'utf8')
    } else {
      const existing = fs.readFileSync(dailyPath, 'utf8')
      if (!existing.includes(memory.content)) {
        fs.appendFileSync(dailyPath, dailyLine)
      }
    }
  }

  console.log(`  ✓ Synced ${memories.length} memories`)
}

// Create a Home note linking everything
function createHomeNote() {
  const filepath = path.join(VAULT, 'Home.md')
  if (fs.existsSync(filepath)) return

  const content = `---
created: ${today()}
---

# NO CONTEXT Brain

The operating brain for NO CONTEXT creative agency.

## Clients
[[Bar None]] · [[Big Sam Young]] · [[Fig & Bloom]] · [[Grumpy Bums]] · [[Hide & Seek]] · [[Mimi and Munch]] · [[Mr. Katz]] · [[Salt Water and Song]] · [[Taxibox]] · [[Tokyo Headspa]] · [[Unyoked]]

## Knowledge
[[Content Patterns]] · [[Taste Notes]] · [[Process & Rules]] · [[Decision Log]] · [[Opinions]]

## Josh
[[Profile]]

---
*Powered by Caspar · NO CONTEXT Brain*
`
  fs.writeFileSync(filepath, content, 'utf8')
  console.log('  ✓ Created Home.md')
}

console.log('Syncing to Obsidian vault...\n')
console.log('→ Clients')
await syncClients()
console.log('\n→ Memories')
await syncMemories()
console.log('\n→ Home note')
createHomeNote()
console.log('\n✓ Done. Open Obsidian to see the graph.')
