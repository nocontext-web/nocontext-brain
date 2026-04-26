/**
 * Migrates the legacy agent_memory blob into structured memories rows.
 * Sends the blob through Claude to extract typed memories, then saves them.
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || (await import('fs')).readFileSync('/Users/joshua/nocontext-brain/.env.local', 'utf8').match(/ANTHROPIC_API_KEY=(.+)/)?.[1] })
const supabase = createClient(
  'https://zcbdxyvymjfytyzisyof.supabase.co',
  'process.env.SUPABASE_SECRET_KEY'
)

const blob = fs.readFileSync('/tmp/caspar_blob.txt', 'utf8')

console.log(`Processing ${blob.length} chars of legacy memory...\n`)

const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 4000,
  messages: [{
    role: 'user',
    content: `You are extracting structured knowledge from Caspar's legacy memory blob for NO CONTEXT, a social-first creative agency in Sydney run by Josh.

Extract every distinct piece of knowledge into a typed memory row. Skip duplicates. Skip vague or incomplete entries. Keep specific, useful facts.

Return a JSON array only — no explanation, no markdown.

Each object:
{
  "type": "client" | "contact" | "decision" | "creative_insight" | "taste_note" | "process_rule" | "opinion" | "general",
  "content": "one clear, specific, useful sentence",
  "related_client": "client name if relevant, otherwise omit"
}

Types:
- client: facts about a specific client
- contact: facts about a specific person (name, role, relationship)
- decision: a strategic or operational decision that was made
- creative_insight: what makes content work, format patterns
- taste_note: aesthetic preferences, what good looks like
- process_rule: how things work, pricing rules, workflow
- opinion: Josh's views
- general: anything else

LEGACY MEMORY:
${blob}`
  }]
})

const text = response.content[0].type === 'text' ? response.content[0].text : ''
const match = text.match(/\[[\s\S]*\]/)
if (!match) { console.error('No JSON found'); process.exit(1) }

const memories = JSON.parse(match[0])
console.log(`Extracted ${memories.length} memories\n`)

// Show preview
const byType = {}
memories.forEach(m => { byType[m.type] = (byType[m.type] || 0) + 1 })
console.log('By type:', byType)
console.log('\nSample:')
memories.slice(0, 5).forEach(m => console.log(` [${m.type}] ${m.content}`))

// Save to memories table
const toInsert = memories.map(m => ({
  type: m.type,
  content: m.content,
  source: 'migration',
  status: 'active',
  related_client: m.related_client || null,
}))

const { error } = await supabase.from('memories').insert(toInsert)
if (error) { console.error('Insert error:', error.message); process.exit(1) }

console.log(`\n✓ Saved ${memories.length} memories to Supabase`)
console.log('The legacy blob is still intact as fallback.')
