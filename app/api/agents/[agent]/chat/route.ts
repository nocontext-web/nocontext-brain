import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'
import { DEFAULT_PROMPTS, AGENT_KEYS, AgentKey } from '@/lib/agents'
import { webSearch } from '@/lib/search'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()

async function findCanonicalNote(folder: string, title: string) {
  const { data: notes } = await supabase.from('obsidian_notes').select('path, title, content').eq('folder', folder)
  if (!notes || notes.length === 0) return null

  const normNew = normalise(title)
  const newWords = normNew.split(' ').filter((w: string) => w.length > 2)

  let best: { path: string; title: string; content: string } | null = null
  let bestScore = 0

  for (const note of notes) {
    const normExisting = normalise(note.title)
    if (normExisting === normNew) return note
    const existingWords = normExisting.split(' ').filter((w: string) => w.length > 2)
    const overlap = newWords.filter((w: string) => existingWords.includes(w) || normExisting.includes(w)).length
    const score = overlap / Math.max(newWords.length, 1)
    const contains = normExisting.includes(normNew) || normNew.includes(normExisting)
    if ((score > 0.5 || contains) && score > bestScore) {
      best = note
      bestScore = contains ? 0.9 : score
    }
  }

  return bestScore > 0.5 ? best : null
}

async function saveLearnigns(agentKey: AgentKey, userMessage: string, reply: string, existingMemory: string, ai: Anthropic) {
  const check = await ai.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `You are ${agentKey}. This exchange just happened:

Josh: ${userMessage}
You: ${reply}

Did Josh share anything new and specific worth remembering — about clients, projects, decisions, plans, opinions, or personal context?

If yes: {"save": true, "memory": "one sentence fact", "folder": "Clients|Creators|Culture|Campaigns|Taste|Josh", "title": "entity name only e.g. 'Mr Katz' not 'Mr Katz Strategy'", "insight": "2-3 sentence summary"}
If no: {"save": false}

Title must be the entity name only — client name, person, or topic. Short and canonical. JSON only.`
    }]
  })

  const text = check.content[0].type === 'text' ? check.content[0].text : ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return
  const decision = JSON.parse(match[0])
  if (!decision.save) return

  if (decision.memory) {
    const updated = existingMemory ? `${existingMemory}\n- ${decision.memory}` : `- ${decision.memory}`
    await supabase.from('agent_memory').upsert({ agent: agentKey, content: updated }, { onConflict: 'agent' })
  }

  if (decision.folder && decision.title && decision.insight) {
    // Find canonical note — don't create duplicates
    const canonical = await findCanonicalNote(decision.folder, decision.title)
    const title = canonical?.title ?? decision.title
    const notePath = `${decision.folder}/${title}.md`
    const existingContent = canonical?.content ?? ''

    const mergeRes = await ai.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: existingContent
          ? `Existing note about "${title}":\n${existingContent}\n\nNew info to add:\n${decision.insight}\n\nMerge into one clean, well-structured living document. Sections where useful. Remove redundancy. Add your own synthesis. No preamble.`
          : `Create a clean note about "${title}":\n${decision.insight}\n\nStructure it well. Add your own synthesis where useful. No preamble.`
      }]
    })
    const content = mergeRes.content[0].type === 'text' ? mergeRes.content[0].text.trim() : ''
    if (content) {
      await supabase.from('obsidian_notes').upsert(
        { path: notePath, folder: decision.folder, title, content, source: 'agent', updated_at: new Date().toISOString() },
        { onConflict: 'path' }
      )
    }
  }
}

// Parse THOUGHT:, OPINION:, QUESTION:, OBSERVATION: lines out of a response
function extractThoughts(text: string): { type: string; content: string }[] {
  const thoughts: { type: string; content: string }[] = []
  const lines = text.split('\n')
  const types = ['THOUGHT', 'OPINION', 'QUESTION', 'OBSERVATION', 'FEELING']

  for (const line of lines) {
    for (const type of types) {
      if (line.startsWith(`${type}:`)) {
        const content = line.slice(type.length + 1).trim()
        if (content) thoughts.push({ type: type.toLowerCase(), content })
      }
    }
  }
  return thoughts
}

// Strip the THOUGHT/OPINION/QUESTION/OBSERVATION/FEELING lines from the visible reply
function stripThoughts(text: string): string {
  const types = ['THOUGHT', 'OPINION', 'QUESTION', 'OBSERVATION', 'FEELING']
  return text
    .split('\n')
    .filter(line => !types.some(t => line.startsWith(`${t}:`)))
    .join('\n')
    .trim()
}

async function getCalendarContext(): Promise<string> {
  const now = new Date().toISOString()
  const { data } = await supabase
    .from('calendar_events')
    .select('title, start_time, end_time, location, attendees')
    .gte('start_time', now)
    .order('start_time', { ascending: true })
    .limit(10)

  if (!data || data.length === 0) return ''

  const lines = data.map(e => {
    const start = new Date(e.start_time)
    const dateStr = start.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
    const timeStr = start.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
    const attendees = e.attendees?.length ? ` · with ${e.attendees.slice(0, 3).join(', ')}` : ''
    const location = e.location ? ` @ ${e.location}` : ''
    return `- ${dateStr} ${timeStr}: ${e.title}${location}${attendees}`
  })

  return `## JOSH'S UPCOMING CALENDAR:\n${lines.join('\n')}`
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ agent: string }> }) {
  const { agent } = await params

  if (!AGENT_KEYS.includes(agent as AgentKey)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { message, history = [] } = await req.json()

  const [promptRes, memoryRes, todoRes] = await Promise.all([
    supabase.from('agent_prompts').select('prompt').eq('agent', agent).single(),
    supabase.from('agent_memory').select('content').eq('agent', agent).single(),
    agent === 'caspar' ? supabase.from('todos').select('id, content').eq('done', false).order('created_at').limit(30) : Promise.resolve({ data: null }),
  ])

  const basePrompt = promptRes.data?.prompt ?? DEFAULT_PROMPTS[agent as AgentKey] ?? ''
  const memory = memoryRes.data?.content ?? ''
  const currentTodos = todoRes.data ?? []

  let systemPrompt = memory ? `${basePrompt}\n\n## YOUR MEMORY:\n${memory}` : basePrompt

  // Add calendar + todos context for Caspar
  if (agent === 'caspar') {
    const calendarCtx = await getCalendarContext()
    if (calendarCtx) systemPrompt += `\n\n${calendarCtx}`
    if (currentTodos.length > 0) {
      const todoBlock = currentTodos.map((t: { id: string; content: string }, i: number) => `${i + 1}. [${t.id}] ${t.content}`).join('\n')
      systemPrompt += `\n\n## JOSH'S CURRENT TODO LIST (use IDs when completing):\n${todoBlock}`
    }
  }

  const messages = [
    ...history.slice(-10),
    { role: 'user' as const, content: message },
  ]

  const tools: Anthropic.Tool[] = [
    {
      name: 'web_search',
      description: 'Search the internet for current information, news, creators, brands, trends, or anything you don\'t already know. Use this whenever the question needs real-world or up-to-date data.',
      input_schema: {
        type: 'object' as const,
        properties: {
          query: { type: 'string', description: 'The search query' },
        },
        required: ['query'],
      },
    },
    ...(agent === 'caspar' ? [
      {
        name: 'add_todo',
        description: 'Add a new item to Josh\'s todo list. Use when Josh asks you to add, remember, or note something he needs to do.',
        input_schema: {
          type: 'object' as const,
          properties: {
            content: { type: 'string', description: 'The todo item text — be specific and action-oriented' },
          },
          required: ['content'],
        },
      },
      {
        name: 'complete_todo',
        description: 'Mark one or more todos as done. Use the todo IDs from the TODO LIST in your context.',
        input_schema: {
          type: 'object' as const,
          properties: {
            ids: { type: 'array', items: { type: 'string' }, description: 'Array of todo IDs to mark as done' },
          },
          required: ['ids'],
        },
      },
    ] as Anthropic.Tool[] : []),
  ]

  const model = agent === 'caspar' ? 'claude-opus-4-6' : 'claude-sonnet-4-6'
  const encoder = new TextEncoder()
  let fullReply = ''

  const readable = new ReadableStream({
    async start(controller) {
      // First pass — may use tool
      const firstResponse = await anthropic.messages.create({
        model,
        max_tokens: 1500,
        system: systemPrompt,
        messages,
        tools,
      })

      // If agent wants to use a tool
      if (firstResponse.stop_reason === 'tool_use') {
        const toolUse = firstResponse.content.find(b => b.type === 'tool_use') as Anthropic.ToolUseBlock
        let toolResult = ''

        if (toolUse.name === 'web_search') {
          const query = (toolUse.input as { query: string }).query
          controller.enqueue(encoder.encode(`_Searching: "${query}"..._\n\n`))
          toolResult = await webSearch(query)

        } else if (toolUse.name === 'add_todo') {
          const content = (toolUse.input as { content: string }).content
          // Deduplicate: don't add if a similar open todo already exists
          const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
          const normNew = norm(content)
          const isDupe = currentTodos.some((t: { content: string }) => {
            const normEx = norm(t.content)
            if (normEx === normNew) return true
            if (normEx.includes(normNew) || normNew.includes(normEx)) return true
            const wordsNew = normNew.split(' ').filter((w: string) => w.length > 3)
            const wordsEx = normEx.split(' ').filter((w: string) => w.length > 3)
            if (wordsNew.length === 0) return false
            return wordsNew.filter((w: string) => wordsEx.includes(w)).length / wordsNew.length >= 0.8
          })
          if (!isDupe) {
            await supabase.from('todos').insert({ content, done: false })
            toolResult = `Added todo: "${content}"`
          } else {
            toolResult = `Skipped — a similar todo already exists`
          }
          controller.enqueue(encoder.encode(`\x00refresh_todos\x00`))

        } else if (toolUse.name === 'complete_todo') {
          const ids = (toolUse.input as { ids: string[] }).ids
          await supabase.from('todos').update({ done: true }).in('id', ids)
          const matched = currentTodos.filter((t: { id: string; content: string }) => ids.includes(t.id))
          toolResult = matched.length > 0
            ? `Marked done: ${matched.map((t: { content: string }) => `"${t.content}"`).join(', ')}`
            : `Marked ${ids.length} todo(s) as done`
          controller.enqueue(encoder.encode(`\x00refresh_todos\x00`))
        }

        // Second pass with tool result — stream this one
        const stream = anthropic.messages.stream({
          model,
          max_tokens: 1500,
          system: systemPrompt,
          messages: [
            ...messages,
            { role: 'assistant' as const, content: firstResponse.content },
            {
              role: 'user' as const,
              content: [{ type: 'tool_result' as const, tool_use_id: toolUse.id, content: toolResult }],
            },
          ],
        })

        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            fullReply += chunk.delta.text
            controller.enqueue(encoder.encode(chunk.delta.text))
          }
        }
      } else {
        // No tool use — stream directly from first response content
        for (const block of firstResponse.content) {
          if (block.type === 'text') {
            fullReply += block.text
            // Stream in chunks so it feels live
            const words = block.text.split(' ')
            for (const word of words) {
              controller.enqueue(encoder.encode(word + ' '))
            }
          }
        }
      }

      controller.close()

      // After stream completes, save thoughts + learnings async
      const rawReply = fullReply
      const thoughts = extractThoughts(rawReply)
      const reply = stripThoughts(rawReply)

      if (thoughts.length > 0) {
        Promise.all(
          thoughts.map(t =>
            supabase.from('agent_thoughts').insert({
              agent,
              type: t.type,
              content: t.content,
              context: `Chat: "${message.slice(0, 100)}"`,
            })
          )
        ).catch(() => {})
      }

      saveLearnigns(agent as AgentKey, message, reply, memory, anthropic).catch(() => {})
    }
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Agent': agent,
      'Cache-Control': 'no-cache',
    },
  })
}
