import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const GRANOLA_BASE = 'https://public-api.granola.ai'

async function fetchGranolaHeaders() {
  const key = process.env.GRANOLA_API_KEY
  if (!key) throw new Error('GRANOLA_API_KEY not set')
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
}

async function postToSlack(text: string): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN
  const channel = process.env.YAY_CHANNEL_ID
  if (!token || !channel) return
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, text, unfurl_links: false }),
  })
}

// Fetch all notes by paginating with created_before cursor
async function fetchAllNotes(): Promise<{ id: string; title: string; created_at?: string }[]> {
  const headers = await fetchGranolaHeaders()
  const all: { id: string; title: string; created_at?: string }[] = []
  let cursor: string | undefined

  while (true) {
    const params = new URLSearchParams({ page_size: '50' })
    if (cursor) params.set('created_before', cursor)

    const res = await fetch(`${GRANOLA_BASE}/v1/notes?${params}`, { headers })
    if (!res.ok) break

    const data = await res.json()
    const notes: { id: string; title: string; created_at?: string }[] = data.notes ?? []
    if (!notes.length) break

    all.push(...notes)

    // If we got fewer than 50, we've reached the end
    if (notes.length < 50) break

    // Paginate using oldest note's created_at as cursor
    const oldest = notes[notes.length - 1]
    if (!oldest.created_at || oldest.created_at === cursor) break
    cursor = oldest.created_at
  }

  return all
}

async function getAlreadySyncedIds(): Promise<Set<string>> {
  const { data } = await supabase
    .from('memories')
    .select('tags')
    .eq('source', 'granola')
    .not('tags', 'is', null)

  const ids = new Set<string>()
  for (const row of data ?? []) {
    for (const tag of row.tags ?? []) {
      if (tag.startsWith('granola:')) ids.add(tag.replace('granola:', ''))
    }
  }
  return ids
}

// POST — bulk catchup: sync all unprocessed meetings and add their tasks to todos
export async function POST() {
  try {
    const [allNotes, alreadySynced] = await Promise.all([
      fetchAllNotes(),
      getAlreadySyncedIds(),
    ])

    const unsynced = allNotes.filter(n => !alreadySynced.has(n.id))

    if (!unsynced.length) {
      return NextResponse.json({ ok: true, message: 'All caught up — no new meetings to process', processed: 0 })
    }

    // Trigger the main sync route in batches of 5 to avoid timeout
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    let totalSynced = 0
    let totalTodos = 0
    const titles: string[] = []

    // Process in chunks — the sync route handles dedup and Slack posting
    // We'll pass each meeting ID directly to avoid re-fetching the full list
    // For now, trigger the regular sync which will pick up unprocessed ones
    const syncRes = await fetch(`${baseUrl}/api/granola/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })

    const syncData = await syncRes.json()
    const results = syncData.results ?? []

    for (const r of results) {
      if (r.status === 'synced') {
        totalSynced++
        titles.push(r.title)
        totalTodos += r.todosAdded ?? 0
      }
    }

    // If there are more unsynced beyond the first 20, report back
    const remaining = unsynced.length - 20
    const hasMore = remaining > 0

    if (hasMore) {
      await postToSlack(
        `🩷 *Catching up on ${unsynced.length} unprocessed meetings*\n\nProcessed ${totalSynced} so far. ${remaining} more to go — run catch-up again to continue.${totalTodos > 0 ? `\n\n*Added ${totalTodos} action items to your todo list.*` : ''}`
      )
    }

    return NextResponse.json({
      ok: true,
      total: allNotes.length,
      unsynced: unsynced.length,
      processed: totalSynced,
      todosAdded: totalTodos,
      remaining: Math.max(0, remaining),
      titles,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// GET — just check how many unsynced meetings exist
export async function GET() {
  try {
    const [allNotes, alreadySynced] = await Promise.all([
      fetchAllNotes(),
      getAlreadySyncedIds(),
    ])
    const unsynced = allNotes.filter(n => !alreadySynced.has(n.id))
    return NextResponse.json({
      total: allNotes.length,
      synced: alreadySynced.size,
      unsynced: unsynced.length,
      unsyncedTitles: unsynced.slice(0, 10).map(n => ({ id: n.id, title: n.title, created_at: n.created_at })),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
