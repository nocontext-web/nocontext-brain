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

const VAULT = '/Users/joshua/Desktop/secret'
const FOLDERS = ['Clients', 'Creators', 'Culture', 'Campaigns', 'Taste', 'Josh']
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

// Poll Supabase for notes updated by agents and write them back to vault
async function pullAgentUpdates() {
  const since = lastPoll
  lastPoll = new Date().toISOString()

  const { data, error } = await supabase
    .from('obsidian_notes')
    .select('path, folder, title, content')
    .eq('source', 'agent')
    .gte('updated_at', since)

  if (error || !data || data.length === 0) return

  for (const note of data) {
    const folderDir = path.join(VAULT, note.folder)
    if (!fs.existsSync(folderDir)) fs.mkdirSync(folderDir, { recursive: true })

    const filePath = path.join(VAULT, note.path)
    fs.writeFileSync(filePath, note.content, 'utf8')
    console.log(`← Agent updated: ${note.path}`)
  }
}

async function main() {
  console.log('Obsidian sync started (two-way)')
  console.log('Vault:', VAULT)

  await syncAll()

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
  setInterval(pullAgentUpdates, POLL_INTERVAL)

  console.log('Watching for changes... (Ctrl+C to stop)')
}

main().catch(console.error)
