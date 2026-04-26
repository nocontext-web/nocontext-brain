import { NextRequest, NextResponse } from 'next/server'
import { saveMemories } from '@/lib/memory'
import type { MemoryType } from '@/lib/memory'

export async function POST(req: NextRequest) {
  const { memories, source } = await req.json() as {
    memories: { type: MemoryType; content: string; related_client?: string; tags?: string[] }[]
    source?: string
  }

  if (!memories?.length) {
    return NextResponse.json({ error: 'No memories to save' }, { status: 400 })
  }

  await saveMemories(memories.map(m => ({
    type: m.type,
    content: m.content,
    source: source || 'manual',
    status: 'active' as const,
    related_client: m.related_client,
    tags: m.tags,
  })))

  return NextResponse.json({ saved: memories.length })
}
