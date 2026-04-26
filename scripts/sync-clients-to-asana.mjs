/**
 * Reads all client notes from the Obsidian vault and creates
 * matching Asana projects in the NO*CONTEXT workspace.
 * Skips any that already exist. Safe to run multiple times.
 */

import * as fs from 'fs'
import * as path from 'path'

const VAULT = '/Users/joshua/Desktop/secret'
const TOKEN = process.env.ASANA_TOKEN || fs.readFileSync('/Users/joshua/nocontext-brain/.env.local', 'utf8').match(/ASANA_TOKEN=(.+)/)?.[1]?.trim()

if (!TOKEN) { console.error('No ASANA_TOKEN found'); process.exit(1) }

async function asana(method, path_, body) {
  const res = await fetch(`https://app.asana.com/api/1.0${path_}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify({ data: body }) } : {}),
  })
  const json = await res.json()
  if (json.errors) throw new Error(json.errors[0].message)
  return json.data
}

// Get NO*CONTEXT workspace
const workspaces = await asana('GET', '/workspaces')
const workspace = workspaces.find(w => w.name.toLowerCase().includes('context')) ?? workspaces[0]
console.log(`Workspace: ${workspace.name} (${workspace.gid})\n`)

// Get existing projects
const existing = await asana('GET', `/workspaces/${workspace.gid}/projects?archived=false&limit=100`)
const existingNames = new Set(existing.map(p => p.name.toLowerCase().trim()))
console.log(`Existing Asana projects (${existing.length}):`)
existing.forEach(p => console.log(`  - ${p.name}`))
console.log()

// Read client names from Obsidian vault
const clientFiles = fs.readdirSync(path.join(VAULT, 'Clients')).filter(f => f.endsWith('.md'))
const clients = clientFiles.map(f => f.replace('.md', ''))

console.log(`Clients in Obsidian (${clients.length}):`)
clients.forEach(c => console.log(`  - ${c}`))
console.log()

// Create missing projects
let created = 0
let skipped = 0

for (const client of clients) {
  const norm = client.toLowerCase().trim()

  // Check if already exists (fuzzy)
  const alreadyExists = existingNames.has(norm) ||
    [...existingNames].some(e => e.includes(norm) || norm.includes(e))

  if (alreadyExists) {
    console.log(`  — Exists:  ${client}`)
    skipped++
    continue
  }

  // Read brief from Obsidian note for the project description
  const notePath = path.join(VAULT, 'Clients', `${client}.md`)
  const noteContent = fs.readFileSync(notePath, 'utf8')
  const briefMatch = noteContent.match(/## Brief\n([\s\S]*?)(?=\n##|$)/)
  const notes = briefMatch ? briefMatch[1].trim().slice(0, 500) : ''

  try {
    const project = await asana('POST', '/projects', {
      name: client,
      workspace: workspace.gid,
      default_view: 'list',
      ...(notes ? { notes } : {}),
    })
    console.log(`  ✓ Created: ${client} → ${project.permalink_url}`)
    created++
  } catch (e) {
    console.error(`  ✗ Failed:  ${client} — ${e.message}`)
  }
}

console.log(`\nDone. Created ${created} projects, skipped ${skipped} that already existed.`)
