/**
 * Reads each client's Obsidian note and writes a brief overview
 * (no financials) into the Asana project description.
 */

import * as fs from 'fs'
import * as path from 'path'
import Anthropic from '@anthropic-ai/sdk'

const VAULT = '/Users/joshua/Desktop/secret'
const envFile = fs.readFileSync('/Users/joshua/nocontext-brain/.env.local', 'utf8')
const TOKEN = process.env.ASANA_TOKEN || envFile.match(/ASANA_TOKEN=(.+)/)?.[1]?.trim()
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || envFile.match(/ANTHROPIC_API_KEY=(.+)/)?.[1]?.trim()

const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY })

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

// Get all projects
const workspaces = await asana('GET', '/workspaces')
const workspace = workspaces.find(w => w.name.toLowerCase().includes('context')) ?? workspaces[0]
const projects = await asana('GET', `/workspaces/${workspace.gid}/projects?archived=false&limit=100`)
const projectMap = {}
for (const p of projects) projectMap[p.name.toLowerCase().trim()] = p

// Process each client
const clientFiles = fs.readdirSync(path.join(VAULT, 'Clients')).filter(f => f.endsWith('.md'))

for (const file of clientFiles) {
  const clientName = file.replace('.md', '')
  const norm = clientName.toLowerCase().trim()

  // Find matching Asana project
  const project = projectMap[norm] || projects.find(p => {
    const pn = p.name.toLowerCase().trim()
    return pn.includes(norm) || norm.includes(pn)
  })

  if (!project) {
    console.log(`  — No Asana project found for: ${clientName}`)
    continue
  }

  // Read Obsidian note
  const notePath = path.join(VAULT, 'Clients', file)
  const noteContent = fs.readFileSync(notePath, 'utf8')

  // Use Claude to extract a clean overview (no financials)
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: `From this client note, write 2 sentences max for an Asana project description. First sentence: what the client is. Second sentence: what NO CONTEXT does for them. Simple, direct, no jargon. No pricing, no dollar figures, no markdown.

CLIENT NOTE:
${noteContent.slice(0, 3000)}`
    }]
  })

  const overview = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
  if (!overview) { console.log(`  — No overview generated for ${clientName}`); continue }

  try {
    await asana('PUT', `/projects/${project.gid}`, { notes: overview })
    console.log(`  ✓ ${clientName}`)
  } catch (e) {
    console.log(`  ✗ ${clientName} — ${e.message}`)
  }
}

console.log('\nDone.')
