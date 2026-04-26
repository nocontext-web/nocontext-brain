import * as fs from 'fs'

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

// Find Zoe
const users = await asana('GET', `/workspaces/${workspace.gid}/users?opt_fields=gid,name,email`)
const zoe = users.find(u => u.name.toLowerCase().includes('zoe'))
if (!zoe) { console.error('Could not find Zoe in workspace'); process.exit(1) }
console.log(`Found Zoe: ${zoe.name} (${zoe.gid})\n`)

// Get all projects
const projects = await asana('GET', `/workspaces/${workspace.gid}/projects?opt_fields=gid,name&archived=false`)
console.log(`Found ${projects.length} projects\n`)

// Add Zoe to each project
let ok = 0, fail = 0
for (const project of projects) {
  try {
    await asana('POST', `/projects/${project.gid}/addMembers`, { members: [zoe.gid] })
    console.log(`✓ ${project.name}`)
    ok++
  } catch (err) {
    console.log(`✗ ${project.name} — ${err.message}`)
    fail++
  }
}

console.log(`\nDone: ${ok} added, ${fail} failed`)
