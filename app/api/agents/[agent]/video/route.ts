import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { GoogleAIFileManager } from '@google/generative-ai/server'
import Anthropic from '@anthropic-ai/sdk'
import { writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { supabase } from '@/lib/supabase'
import { DEFAULT_PROMPTS, AGENT_KEYS, AgentKey } from '@/lib/agents'

const fileManager = new GoogleAIFileManager(process.env.GOOGLE_AI_API_KEY!)
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function extractThoughts(text: string): { type: string; content: string }[] {
  const thoughts: { type: string; content: string }[] = []
  const types = ['THOUGHT', 'OPINION', 'QUESTION', 'OBSERVATION', 'FEELING']
  for (const line of text.split('\n')) {
    for (const type of types) {
      if (line.startsWith(`${type}:`)) {
        const content = line.slice(type.length + 1).trim()
        if (content) thoughts.push({ type: type.toLowerCase(), content })
      }
    }
  }
  return thoughts
}

function stripThoughts(text: string): string {
  const types = ['THOUGHT', 'OPINION', 'QUESTION', 'OBSERVATION', 'FEELING']
  return text
    .split('\n')
    .filter(line => !types.some(t => line.startsWith(`${t}:`)))
    .join('\n')
    .trim()
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ agent: string }> }) {
  const { agent } = await params

  if (!AGENT_KEYS.includes(agent as AgentKey)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const formData = await req.formData()
  const file = formData.get('video') as File
  const note = formData.get('note') as string || ''

  if (!file) {
    return NextResponse.json({ error: 'No video file provided' }, { status: 400 })
  }

  // Write to temp file
  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const tmpPath = join(tmpdir(), `nocontext-${Date.now()}-${file.name}`)
  await writeFile(tmpPath, buffer)

  let reaction = ''
  let thoughts: { type: string; content: string }[] = []

  try {
    // Upload to Gemini Files API
    const uploadResponse = await fileManager.uploadFile(tmpPath, {
      mimeType: file.type || 'video/mp4',
      displayName: file.name,
    })

    // Wait for processing
    let geminiFile = await fileManager.getFile(uploadResponse.file.name)
    let attempts = 0
    while (geminiFile.state === 'PROCESSING' && attempts < 20) {
      await new Promise(r => setTimeout(r, 3000))
      geminiFile = await fileManager.getFile(uploadResponse.file.name)
      attempts++
    }

    if (geminiFile.state !== 'ACTIVE') {
      throw new Error('Video processing failed')
    }

    // Ask Gemini to analyse the video content
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' })
    const geminiResult = await model.generateContent([
      {
        fileData: {
          mimeType: geminiFile.mimeType,
          fileUri: geminiFile.uri,
        },
      },
      {
        text: `Analyse this video in detail for a social media creative agency. Cover:
- The hook (first 3 seconds — what happens, why it works or doesn't)
- Format and structure (how is it built, what's the pacing)
- Tone and energy
- What platform this feels native to and why
- What's working creatively
- What's lazy or weak
- The core pattern or mechanic being used
- Why someone would stop scrolling for this (or why they wouldn't)
${note ? `\nSpecific focus: ${note}` : ''}

Be specific and honest. No generic observations.`,
      },
    ])

    const videoAnalysis = geminiResult.response.text()

    // Now get the agent's reaction via Claude
    const [promptRes, memoryRes] = await Promise.all([
      supabase.from('agent_prompts').select('prompt').eq('agent', agent).single(),
      supabase.from('agent_memory').select('content').eq('agent', agent).single(),
    ])

    const basePrompt = promptRes.data?.prompt ?? DEFAULT_PROMPTS[agent as AgentKey] ?? ''
    const memory = memoryRes.data?.content ?? ''
    const systemPrompt = memory ? `${basePrompt}\n\n## YOUR MEMORY:\n${memory}` : basePrompt

    const claudeResponse = await anthropic.messages.create({
      model: agent === 'caspar' ? 'claude-opus-4-6' : 'claude-sonnet-4-6',
      max_tokens: 1200,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `I just dropped a video for you to watch and react to.

Here's what Gemini picked up from the video:

${videoAnalysis}

${note ? `My note: ${note}` : ''}

React as yourself. What's your honest take? What does this tell you? What are you feeling about it?

Then give your THOUGHT, OPINION, QUESTION, OBSERVATION, FEELING lines.`,
      }],
    })

    const rawReply = claudeResponse.content[0].type === 'text' ? claudeResponse.content[0].text : ''
    thoughts = extractThoughts(rawReply)
    reaction = stripThoughts(rawReply)

    // Save thoughts to mind log
    if (thoughts.length > 0) {
      await Promise.all(
        thoughts.map(t =>
          supabase.from('agent_thoughts').insert({
            agent,
            type: t.type,
            content: t.content,
            context: `Video drop: ${file.name}`,
          })
        )
      )
    }

    // Clean up Gemini file
    await fileManager.deleteFile(uploadResponse.file.name).catch(() => {})

  } finally {
    // Clean up temp file
    await unlink(tmpPath).catch(() => {})
  }

  return NextResponse.json({ reaction, thoughts })
}
