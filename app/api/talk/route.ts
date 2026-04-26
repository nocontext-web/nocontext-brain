import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'
import { DEFAULT_PROMPTS, AgentKey } from '@/lib/agents'
import { saveMemory } from '@/lib/memory'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function saveLearnigns(agentKey: AgentKey, userMessage: string, reply: string, existingMemory: string, ai: Anthropic) {
  const check = await ai.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: `This voice exchange just happened:

Josh: ${userMessage}
Caspar: ${reply}

Did Josh share anything new and specific worth remembering?

If yes: {"save": true, "type": "client|contact|decision|creative_insight|taste_note|process_rule|opinion|general", "content": "one clear sentence to remember", "related_client": "client name or null", "folder": "Clients|Creators|Culture|Campaigns|Taste|Josh", "title": "note title", "insight": "2-3 sentence summary"}
If no: {"save": false}

JSON only. Pick the most specific type that fits.`
    }]
  })

  const text = check.content[0].type === 'text' ? check.content[0].text : ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return

  const decision = JSON.parse(match[0])
  if (!decision.save) return

  // Save to structured memories table
  if (decision.content) {
    await saveMemory({
      type: decision.type || 'general',
      content: decision.content,
      source: 'voice',
      status: 'active',
      related_client: decision.related_client || undefined,
    })
  }

  // Update Obsidian note
  if (decision.folder && decision.title && decision.insight) {
    const notePath = `${decision.folder}/${decision.title}.md`
    const { data: existing } = await supabase.from('obsidian_notes').select('content').eq('path', notePath).single()

    const mergeRes = await ai.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: existing?.content
          ? `Existing note:\n${existing.content}\n\nNew info:\n${decision.insight}\n\nMerge into a clean, useful note. No preamble, just the note.`
          : `Write a clean note based on:\n${decision.insight}\n\nNo preamble, just the note.`
      }]
    })

    const content = mergeRes.content[0].type === 'text' ? mergeRes.content[0].text.trim() : ''
    if (content) {
      await supabase.from('obsidian_notes').upsert(
        { path: notePath, folder: decision.folder, title: decision.title, content, source: 'agent', updated_at: new Date().toISOString() },
        { onConflict: 'path' }
      )
    }
  }
}

const VOICE_IDS: Record<AgentKey, string> = {
  caspar: 'wDsJlOXPqcvIUKdLXjDs',
}

export async function POST(req: NextRequest) {
  const { message, agentKey, history = [] } = await req.json() as {
    message: string
    agentKey: AgentKey
    history: { role: string; content: string }[]
  }

  // Load agent memory
  const [promptRes, memoryRes] = await Promise.all([
    supabase.from('agent_prompts').select('prompt').eq('agent', agentKey).single(),
    supabase.from('agent_memory').select('content').eq('agent', agentKey).single(),
  ])

  const basePrompt = promptRes.data?.prompt ?? DEFAULT_PROMPTS[agentKey] ?? ''
  const memory = memoryRes.data?.content ?? ''

  let calendarCtx = ''
  if (agentKey === 'caspar') {
    const now = new Date().toISOString()
    const { data: events } = await supabase
      .from('calendar_events')
      .select('title, start_time, location, attendees')
      .gte('start_time', now)
      .order('start_time', { ascending: true })
      .limit(8)
    if (events?.length) {
      const lines = events.map(e => {
        const start = new Date(e.start_time)
        const dateStr = start.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
        const timeStr = start.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
        return `- ${dateStr} ${timeStr}: ${e.title}${e.location ? ` @ ${e.location}` : ''}`
      })
      calendarCtx = `\n\n## JOSH'S UPCOMING CALENDAR:\n${lines.join('\n')}`
    }
  }

  const systemPrompt = `${basePrompt}${memory ? `\n\n## YOUR MEMORY:\n${memory}` : ''}${calendarCtx}

## VOICE CONVERSATION MODE
You are in a live voice conversation. Keep responses SHORT — 1-3 sentences max.
Speak naturally, like a real person talking. No bullet points, no markdown, no lists.
Be direct and conversational. Think out loud. Ask one follow-up question if relevant.`

  // Get Claude response fast with Haiku
  const messages = [
    ...history.slice(-6).map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content: message }
  ]

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    system: systemPrompt,
    messages,
  })

  const reply = response.content[0].type === 'text' ? response.content[0].text.trim() : ''

  // Save learnings to agent_memory + Obsidian async (don't block audio)
  saveLearnigns(agentKey, message, reply, memory, anthropic).catch(() => {})

  // Stream audio from ElevenLabs immediately
  const voiceId = VOICE_IDS[agentKey]
  const ttsRes = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
    method: 'POST',
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: reply,
      model_id: 'eleven_turbo_v2',
      voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0, use_speaker_boost: true },
    }),
  })

  if (!ttsRes.ok || !ttsRes.body) {
    return NextResponse.json({ reply, audio: null })
  }

  // Stream audio back with reply text in header
  return new NextResponse(ttsRes.body, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'X-Reply-Text': encodeURIComponent(reply),
      'Cache-Control': 'no-cache',
    },
  })
}
