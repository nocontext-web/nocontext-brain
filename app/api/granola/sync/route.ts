import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'
import { saveMemories } from '@/lib/memory'
import { syncThoughtToVault } from '@/lib/obsidian'
import { resolveClickUpList, createClickUpTask } from '@/lib/clickup'

const GRANOLA_BASE = 'https://public-api.granola.ai'

export type TeamAssignee = 'josh' | 'zoe' | 'molly' | 'ellie' | 'ria' | 'lever'

export type ProposedTask = {
  name: string
  assignee: TeamAssignee | null
  listName: string | null
  notes?: string
}

type GranolaNote = {
  id: string
  title: string
  created_at?: string
  summary?: string
}

type GranolaSpeaker = {
  source: 'microphone' | 'speaker'
  text?: string
  diarization_label?: string
}

type GranolaTranscript = {
  speakers?: GranolaSpeaker[]
  text?: string
}

async function fetchGranolaHeaders() {
  const key = process.env.GRANOLA_API_KEY
  if (!key) throw new Error('GRANOLA_API_KEY not set')
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  }
}

async function fetchRecentNotes(since?: string): Promise<GranolaNote[]> {
  const headers = await fetchGranolaHeaders()
  const params = new URLSearchParams()
  if (since) params.set('created_after', since)
  params.set('page_size', '20')

  const res = await fetch(`${GRANOLA_BASE}/v1/notes?${params}`, { headers })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Granola API error ${res.status}: ${err.slice(0, 200)}`)
  }
  const data = await res.json()
  return data.notes ?? []
}

async function fetchNoteTranscript(id: string): Promise<{ note: GranolaNote; transcript: string }> {
  const headers = await fetchGranolaHeaders()
  const res = await fetch(`${GRANOLA_BASE}/v1/notes/${id}?include=transcript`, { headers })
  if (!res.ok) throw new Error(`Failed to fetch note ${id}: ${res.status}`)
  const data = await res.json()

  const note: GranolaNote = data
  let transcript = ''
  const t: GranolaTranscript = data.transcript ?? {}

  if (t.speakers?.length) {
    transcript = t.speakers
      .filter((s: GranolaSpeaker) => s.text?.trim())
      .map((s: GranolaSpeaker) => {
        const label = s.source === 'microphone' ? 'You' : (s.diarization_label ?? 'Them')
        return `${label}: ${s.text}`
      })
      .join('\n')
  } else if (t.text) {
    transcript = t.text
  } else if (data.summary) {
    transcript = data.summary
  }

  return { note, transcript }
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

async function generateRecapAndTasks(
  title: string,
  transcript: string,
  memories: { content: string }[],
  casparMemory: string
): Promise<{ recap: string; casparTake: string; slackMessage: string; proposedTasks: ProposedTask[] }> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const res = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: `You are Caspar. Creative director, strategic co-founder, the brain at NO CONTEXT. You've just listened to a meeting and you're processing it — not just logging it. You think, feel, and learn from everything.

Your voice: short sentences. Direct. No corporate language. Never use em dashes. Sound like a sharp founder thinking out loud.

NAME ACCURACY: When writing task names, always use exact name spellings from your memory below. Meeting transcripts can mishear names (e.g. "Sean" when it's really "Sian", "Taylor" when it's "Tayla"). Cross-reference every name against your memory before writing it.${casparMemory ? `\n\nYOUR MEMORY (use this to resolve names and context):\n${casparMemory}` : ''}`,
    messages: [{
      role: 'user',
      content: `Meeting: "${title}"

Transcript:
${transcript.slice(0, 4000)}

Return a JSON object with exactly this shape — no markdown, JSON only:

{
  "recap": "Max 3 sentences. What actually happened. What was decided. Be specific about clients, projects, numbers if mentioned. Cut everything else.",
  "tasks": [
    {
      "name": "specific action — verb first, e.g. 'Write 3 hook concepts for Tokyo Head Spa relaunch'",
      "assignee": "josh" or "zoe" or "molly" or "ellie" or "ria" or "lever" or null,
      "notes": "optional — only if context genuinely helps"
    }
  ],
  "caspar_take": {
    "feeling": "1-2 sentences. How Caspar genuinely feels about this meeting. Excited, flat, energised, frustrated, curious — be honest and specific about why.",
    "learned": "1-2 sentences. Something real Caspar learned or noticed — about a client, about Josh's thinking, about the work, about the business.",
    "thinking": "1 sentence. The one thing Caspar is still turning over in his head from this meeting."
  }
}

Rules:
- recap: compress hard. No waffle. If nothing was decided, say so.
- tasks: every concrete action mentioned. Specific verbs. "Josh to follow up" is not a task. "Josh to send Bar None proposal by Friday" is.
- assignee: "josh" for Josh, "zoe"/"molly" for content, "ellie" for editing, "ria" for creator outreach, "lever" for ads. null if unclear or shared.
- caspar_take: this is personal. Not a summary. Caspar's actual internal response.`,
    }],
  })

  const text = res.content[0].type === 'text' ? res.content[0].text : ''
  let recap = ''
  let casparTake = ''
  let proposedTasks: ProposedTask[] = []
  let feeling = ''
  let learned = ''
  let thinking = ''

  try {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      const parsed = JSON.parse(match[0])
      recap = parsed.recap ?? ''
      feeling = parsed.caspar_take?.feeling ?? ''
      learned = parsed.caspar_take?.learned ?? ''
      thinking = parsed.caspar_take?.thinking ?? ''
      casparTake = [feeling, learned, thinking].filter(Boolean).join('\n\n')

      proposedTasks = (parsed.tasks ?? []).map((t: { name: string; assignee: string | null; notes?: string }) => ({
        name: t.name,
        assignee: t.assignee as TeamAssignee | null,
        listName: resolveClickUpList(t.assignee)?.listKey ?? null,
        notes: t.notes,
      }))
    }
  } catch {
    recap = text.slice(0, 300)
  }

  // Save Caspar's thoughts to living mind (Supabase + Obsidian)
  if (feeling || learned || thinking) {
    const thoughtsToSave = [
      feeling && { type: 'feeling', content: feeling, context: `From meeting: ${title}` },
      learned && { type: 'observation', content: learned, context: `From meeting: ${title}` },
      thinking && { type: 'thought', content: thinking, context: `From meeting: ${title}` },
    ].filter(Boolean) as { type: string; content: string; context: string }[]

    await Promise.all(
      thoughtsToSave.map(async t => {
        await supabase.from('agent_thoughts').insert({ agent: 'caspar', ...t })
        syncThoughtToVault(t)
      })
    )
  }

  // Format Slack message — clean and scannable, grouped by whoever it's assigned to
  const byAssignee = new Map<string, ProposedTask[]>()
  const unassigned: ProposedTask[] = []
  for (const t of proposedTasks) {
    if (!t.assignee) { unassigned.push(t); continue }
    const key = t.assignee[0].toUpperCase() + t.assignee.slice(1)
    if (!byAssignee.has(key)) byAssignee.set(key, [])
    byAssignee.get(key)!.push(t)
  }

  const taskBlock = [
    ...Array.from(byAssignee.entries()).map(([name, tasks]) => `*${name}*\n${tasks.map(t => `• ${t.name}`).join('\n')}`),
    unassigned.length ? `*TBD*\n${unassigned.map(t => `• ${t.name}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n')

  const slackMessage = [
    `🩷 *${title}*`,
    '',
    recap,
    taskBlock ? `\n*Actions*\n${taskBlock}` : '',
    casparTake ? `\n_${feeling}_` : '',
  ].filter(Boolean).join('\n')

  return { recap, casparTake, slackMessage, proposedTasks }
}

async function postToSlack(text: string): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN
  const channel = process.env.YAY_CHANNEL_ID
  if (!token || !channel) return

  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ channel, text, unfurl_links: false }),
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const since: string | undefined = body.since

  try {
    const notes = await fetchRecentNotes(since)
    if (!notes.length) return NextResponse.json({ synced: 0, skipped: 0, results: [] })

    const alreadySynced = await getAlreadySyncedIds()
    const newNotes = notes.filter(n => !alreadySynced.has(n.id))

    if (!newNotes.length) return NextResponse.json({ synced: 0, skipped: notes.length, results: [] })

    const results = []

    for (const noteStub of newNotes) {
      try {
        const { note, transcript } = await fetchNoteTranscript(noteStub.id)
        const title = note.title || noteStub.title || 'Meeting'

        if (!transcript.trim()) {
          results.push({ id: note.id, title, status: 'skipped', reason: 'no transcript' })
          continue
        }

        // Extract memories
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
        const processRes = await fetch(`${baseUrl}/api/train/process`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript: `MEETING: ${title}\n\n${transcript}`,
            source: 'granola',
            autoSave: false,
          }),
        })

        const processed = await processRes.json()
        const memories = processed.memories ?? []

        if (memories.length) {
          await saveMemories(
            memories.map((m: { type: string; content: string; related_client?: string; tags?: string[] }) => ({
              type: m.type,
              content: m.content,
              source: 'granola',
              status: 'active' as const,
              related_client: m.related_client,
              tags: [...(m.tags ?? []), `granola:${note.id}`],
            }))
          )
        }

        // Generate recap + extract tasks + save Caspar's thoughts
        const { data: memRow } = await supabase.from('agent_memory').select('content').eq('agent', 'caspar').single()
        const casparMemory = memRow?.content ?? ''
        const { recap, casparTake, slackMessage, proposedTasks } = await generateRecapAndTasks(title, transcript, memories, casparMemory)

        // Auto-add tasks to todos (with dedup)
        const { data: existingTodos } = await supabase.from('todos').select('content').eq('done', false)
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
        const addedTodos: string[] = []
        const addedClickUp: string[] = []

        for (const task of proposedTasks) {
          const normNew = norm(task.name)
          const isDupe = (existingTodos ?? []).some((t: { content: string }) => {
            const normEx = norm(t.content)
            if (normEx === normNew) return true
            const wordsNew = normNew.split(' ').filter((w: string) => w.length > 3)
            const wordsEx = normEx.split(' ').filter((w: string) => w.length > 3)
            if (wordsNew.length === 0) return false
            return wordsNew.filter((w: string) => wordsEx.includes(w)).length / wordsNew.length >= 0.75
          })
          if (isDupe) continue

          // Team-member tasks go to their ClickUp list — that's where they actually work.
          // Josh's own tasks (and anything unclear/shared) stay in the shared todos list.
          const list = resolveClickUpList(task.assignee)
          if (list) {
            try {
              await createClickUpTask({ listId: list.listId, title: task.name, description: task.notes, assignee: task.assignee })
              addedClickUp.push(`${task.name} → ${list.listKey}`)
            } catch (err) {
              // ClickUp not configured or errored — fall back to the shared todos list so nothing is lost
              await supabase.from('todos').insert({ content: task.name, done: false })
              addedTodos.push(`${task.name} (ClickUp failed: ${err instanceof Error ? err.message : String(err)})`)
            }
          } else {
            await supabase.from('todos').insert({ content: task.name, done: false })
            addedTodos.push(task.name)
          }
        }

        // Append summary to Slack message if anything was added
        const additions = [
          addedClickUp.length ? `*Added to ClickUp:*\n${addedClickUp.map(t => `• ${t}`).join('\n')}` : '',
          addedTodos.length ? `*Added to todos:*\n${addedTodos.map(t => `• ${t}`).join('\n')}` : '',
        ].filter(Boolean).join('\n\n')
        const fullSlackMessage = additions ? `${slackMessage}\n\n${additions}` : slackMessage

        // Post to #yay
        await postToSlack(fullSlackMessage)

        results.push({
          id: note.id,
          title,
          status: 'synced',
          memoriesSaved: memories.length,
          recap,
          casparTake,
          proposedTasks,
          todosAdded: addedTodos.length,
          slackPosted: true,
        })
      } catch (err) {
        results.push({
          id: noteStub.id,
          title: noteStub.title || 'Unknown',
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return NextResponse.json({
      synced: results.filter(r => r.status === 'synced').length,
      skipped: notes.length - newNotes.length,
      results,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// GET — fetch list of recent notes without syncing
export async function GET() {
  try {
    const notes = await fetchRecentNotes()
    const alreadySynced = await getAlreadySyncedIds()
    return NextResponse.json({
      notes: notes.map(n => ({
        id: n.id,
        title: n.title,
        created_at: n.created_at,
        alreadySynced: alreadySynced.has(n.id),
      })),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
