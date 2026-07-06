#!/usr/bin/env node
/**
 * Obsidian ↔ Supabase two-way sync
 * - Obsidian → Supabase: file changes push to DB immediately
 * - Supabase → Obsidian: agent-updated notes get written back to vault every 15s
 * Run: node scripts/sync-obsidian.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') })

const chokidar = require('chokidar')
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const VAULT = '/Users/joshua/nocontext-vault'
const FOLDERS = ['Clients', 'Creators', 'Culture', 'Campaigns', 'Taste', 'Josh', 'People', 'Decisions', 'Creative', 'Rules', 'Caspar', 'Daily']
const POLL_INTERVAL = 15000 // 15 seconds

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

// Track last time we polled so we only fetch newly agent-updated notes
let lastPoll = new Date().toISOString()

function parsePath(filePath) {
  const rel = path.relative(VAULT, filePath)
  const parts = rel.split(path.sep)
  const folder = parts[0]
  const title = path.basename(filePath, '.md')
  return { rel, folder, title }
}

async function upsertNote(filePath) {
  const { rel, folder, title } = parsePath(filePath)
  if (!FOLDERS.includes(folder)) return
  if (!filePath.endsWith('.md')) return

  const content = fs.readFileSync(filePath, 'utf8').trim()
  if (!content) return

  const { error } = await supabase
    .from('obsidian_notes')
    .upsert(
      { path: rel, folder, title, content, source: 'watcher', updated_at: new Date().toISOString() },
      { onConflict: 'path' }
    )

  if (error) {
    console.error(`Error syncing ${rel}:`, error.message)
  } else {
    console.log(`✓ Synced: ${rel}`)
  }
}

async function deleteNote(filePath) {
  const { rel } = parsePath(filePath)
  await supabase.from('obsidian_notes').delete().eq('path', rel)
  console.log(`✗ Deleted: ${rel}`)
}

async function syncAll() {
  console.log('Doing full sync...')
  for (const folder of FOLDERS) {
    const dir = path.join(VAULT, folder)
    if (!fs.existsSync(dir)) continue
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'))
    for (const file of files) {
      await upsertNote(path.join(dir, file))
    }
  }
  console.log('Full sync complete.')
}

// Poll Supabase for notes updated by agents and write them back to vault.
// `full: true` pulls every agent-authored note regardless of when it was last
// updated — used once on startup so a fresh/stopped vault backfills everything
// instead of only catching updates from this point forward.
async function pullAgentUpdates(full = false) {
  const since = lastPoll
  lastPoll = new Date().toISOString()

  let query = supabase
    .from('obsidian_notes')
    .select('path, folder, title, content')
    .eq('source', 'agent')

  if (!full) query = query.gte('updated_at', since)

  const { data, error } = await query
  if (error) { console.error('pullAgentUpdates error:', error.message); return }
  if (!data || data.length === 0) return

  for (const note of data) {
    const folderDir = path.join(VAULT, note.folder)
    if (!fs.existsSync(folderDir)) fs.mkdirSync(folderDir, { recursive: true })

    const filePath = path.join(VAULT, note.path)
    fs.writeFileSync(filePath, note.content, 'utf8')
    console.log(`← Agent updated: ${note.path}`)
  }

  if (full) console.log(`← Backfilled ${data.length} agent notes`)
}

async function main() {
  console.log('Obsidian sync started (two-way)')
  console.log('Vault:', VAULT)

  await syncAll()

  // Backfill everything Caspar/Hermes have already written before we start
  // watching — otherwise notes written while this script wasn't running are
  // invisible forever (it only used to catch updates from the moment it starts).
  await pullAgentUpdates(true)

  // Watch vault for your changes → Supabase
  const watcher = chokidar.watch(FOLDERS.map(f => path.join(VAULT, f)), {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 800 },
  })

  watcher
    .on('add', upsertNote)
    .on('change', upsertNote)
    .on('unlink', deleteNote)

  // Poll Supabase for agent updates → vault
  setInterval(() => pullAgentUpdates(false), POLL_INTERVAL)

  console.log('Watching for changes... (Ctrl+C to stop)')
}

main().catch(console.error)
