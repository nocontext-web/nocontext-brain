import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { saveMemories } from '@/lib/memory'
import type { MemoryType } from '@/lib/memory'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export type ExtractedMemory = {
  type: MemoryType
  content: string
  related_client?: string
  tags?: string[]
  approved?: boolean
}

export async function POST(req: NextRequest) {
  const { transcript, source = 'transcript', autoSave = false } = await req.json() as {
    transcript: string
    source?: string
    autoSave?: boolean
  }

  if (!transcript?.trim()) {
    return NextResponse.json({ error: 'No transcript provided' }, { status: 400 })
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: `You are extracting structured knowledge from a transcript or notes for Caspar — the AI creative director at NO CONTEXT, a social-first creative agency in Sydney. Extract everything worth remembering. Be specific. Don't summarise vaguely.`,
    messages: [{
      role: 'user',
      content: `Extract all learnings from this transcript. Return a JSON array of memory objects. Nothing else — no explanation, no markdown.

Each object:
{
  "type": "client" | "contact" | "decision" | "creative_insight" | "taste_note" | "process_rule" | "opinion" | "general",
  "content": "one clear, specific, useful sentence",
  "related_client": "client name if relevant, otherwise omit",
  "tags": ["optional", "tags"]
}

Types:
- client: facts about a specific client (their brief, goals, constraints, relationships)
- contact: facts about a specific person
- decision: a strategic or operational decision that was made
- creative_insight: what makes content work, format patterns, platform observations
- taste_note: aesthetic preferences, what good looks like, what to avoid
- process_rule: how things work at NO CONTEXT, pricing rules, workflow rules
- opinion: Josh's views on things
- general: anything else worth knowing

Extract EVERYTHING worth remembering. Aim for 5-20 items depending on the transcript length.

TRANSCRIPT:
${transcript}`,
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  let memories: ExtractedMemory[] = []
  try {
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) throw new Error('No JSON array found')
    memories = JSON.parse(match[0])
    if (!Array.isArray(memories)) throw new Error('Not an array')
    // Default all to approved for review
    memories = memories.map(m => ({ ...m, approved: true }))
  } catch (err) {
    console.error('[train/process] parse error:', err, '\nRaw:', text.slice(0, 500))
    return NextResponse.json({ error: 'Failed to extract memories from transcript' }, { status: 422 })
  }

  // If autoSave (e.g. from Granola webhook), save immediately
  if (autoSave) {
    await saveMemories(memories.map(m => ({
      type: m.type,
      content: m.content,
      source,
      status: 'active' as const,
      related_client: m.related_client,
      tags: m.tags,
    })))
    return NextResponse.json({ saved: memories.length, memories })
  }

  // Otherwise return for review
  return NextResponse.json({ memories })
}
