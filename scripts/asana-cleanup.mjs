import * as fs from 'fs'

const TOKEN = process.env.ASANA_TOKEN || fs.readFileSync('/Users/joshua/nocontext-brain/.env.local', 'utf8').match(/ASANA_TOKEN=(.+)/)?.[1]?.trim()

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

const workspaces = await asana('GET', '/workspaces')
const workspace = workspaces.find(w => w.name.toLowerCase().includes('context')) ?? workspaces[0]
const projects = await asana('GET', `/workspaces/${workspace.gid}/projects?archived=false&limit=100`)

// --- Archive old projects ---
const TO_ARCHIVE = ['blossom', 'scale app', 'taxi box']

console.log('Archiving...')
for (const p of projects) {
  if (TO_ARCHIVE.includes(p.name.toLowerCase().trim())) {
    try {
      await asana('PUT', `/projects/${p.gid}`, { archived: true })
      console.log(`  ✓ Archived: ${p.name}`)
    } catch (e) {
      console.log(`  ✗ ${p.name} — no permission (delete manually: open project → ··· → Delete)`)
    }
  }
}

// --- Assign colours to client projects ---
const COLOURS = {
  'Bar None':           'dark-orange',
  'Big Sam Young':      'dark-blue',
  'Face Factor':        'dark-pink',
  'Fig & Bloom':        'dark-green',
  'FutureRent':         'dark-teal',
  'Grumpy Bums':        'dark-red',
  'Hide & Seek':        'dark-purple',
  'Koala':              'light-green',
  'Mimi and Munch':     'light-pink',
  'Mr. Katz':           'dark-brown',
  'NOON':               'light-orange',
  'Salt Water and Song':'light-teal',
  'Sortd':              'light-blue',
  'Taxibox':            'light-yellow',
  'Tokyo Headspa':      'light-purple',
  'Unyoked':            'light-red',
}

console.log('\nAssigning colours...')
for (const p of projects) {
  const colour = COLOURS[p.name]
  if (!colour) continue
  try {
    await asana('PUT', `/projects/${p.gid}`, { color: colour })
    console.log(`  ✓ ${p.name} → ${colour}`)
  } catch (e) {
    console.log(`  ✗ ${p.name} — ${e.message}`)
  }
}

console.log('\nDone.')
