#!/usr/bin/env node
/**
 * Push a markdown note to Supabase so all agents (Slack + Brain) can read it.
 * Usage: node scripts/push-to-brain.js <path-to-md-file>
 * Example: node scripts/push-to-brain.js ~/Desktop/secret/Josh/Profile.md
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env.local') })

const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

const VAULT = '/Users/joshua/nocontext-vault'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
)

async function push(filePath) {
  filePath = filePath.replace(/^~/, process.env.HOME)
  const abs = path.resolve(filePath)

  if (!fs.existsSync(abs)) {
    console.error(`File not found: ${abs}`)
    process.exit(1)
  }

  const content = fs.readFileSync(abs, 'utf8').trim()
  const rel = path.relative(VAULT, abs)
  const parts = rel.split(path.sep)
  const folder = parts[0]
  const title = path.basename(abs, '.md')

  const { error } = await supabase
    .from('obsidian_notes')
    .upsert(
      { path: rel, folder, title, content, source: 'agent', updated_at: new Date().toISOString() },
      { onConflict: 'path' }
    )

  if (error) {
    console.error('Supabase error:', error.message)
    process.exit(1)
  }

  console.log(`✓ Pushed to brain: ${rel}`)
}

const file = process.argv[2]
if (!file) {
  console.error('Usage: node scripts/push-to-brain.js <path-to-md-file>')
  process.exit(1)
}

push(file).catch(e => { console.error(e); process.exit(1) })
