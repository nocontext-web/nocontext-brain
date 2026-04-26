/**
 * 1. Archives Blossom, Scale App, Taxi Box
 * 2. Sets all client projects to board view with To do / Doing / Done sections
 */

import * as fs from 'fs'

const TOKEN = process.env.ASANA_TOKEN || fs.readFileSync('/Users/joshua/nocontext-brain/.env.local', 'utf8').match(/ASANA_TOKEN=(.+)/)?.[1]?.trim()

async function asana(method, path, body) {
  const res = await fetch(`https://app.asana.com/api/1.0${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify({ data: body }) } : {}),
  })
  const json = await res.json()
  if (json.errors) throw new Error(json.errors[0].message)
  return json.data
}

const workspaces = await asana('GET', '/workspaces')
const workspace = workspaces.find(w => w.name.toLowerCase().includes('context')) ?? workspaces[0]
console.log(`Workspace: ${workspace.name}\n`)

const projects = await asana('GET', `/workspaces/${workspace.gid}/projects?archived=false&limit=100`)

// --- 1. Archive old projects ---
const TO_ARCHIVE = ['blossom', 'scale app', 'taxi box']

console.log('Archiving old projects...')
for (const project of projects) {
  const norm = project.name.toLowerCase().trim()
  if (TO_ARCHIVE.includes(norm)) {
    try {
      await asana('PUT', `/projects/${project.gid}`, { archived: true })
      console.log(`  ✓ Archived: ${project.name}`)
    } catch (e) {
      console.log(`  ✗ Can't archive ${project.name} — ${e.message} (delete manually in Asana)`)
    }
  }
}

// --- 2. Set board view + add sections to client projects ---
// Skip internal/non-client projects
const SKIP = ['no context', 'lenddus', 'messina']

console.log('\nSetting up board sections...')
for (const project of projects) {
  const norm = project.name.toLowerCase().trim()
  if (TO_ARCHIVE.includes(norm) || SKIP.includes(norm)) continue

  // Set default view to board
  try {
    await asana('PUT', `/projects/${project.gid}`, { default_view: 'board' })
  } catch {
    // ignore — some plans restrict this
  }

  // Get existing sections
  const sections = await asana('GET', `/projects/${project.gid}/sections`)
  const existingNames = sections.map(s => s.name.toLowerCase())

  const SECTIONS = ['To do', 'Doing', 'Done']
  let added = 0
  for (const sectionName of SECTIONS) {
    if (!existingNames.includes(sectionName.toLowerCase())) {
      await asana('POST', `/projects/${project.gid}/sections`, { name: sectionName })
      added++
    }
  }

  console.log(`  ✓ ${project.name}${added > 0 ? ` — added ${added} section(s)` : ' — sections already exist'}`)
}

console.log('\nDone.')
