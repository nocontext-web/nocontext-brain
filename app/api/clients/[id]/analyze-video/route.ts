import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { supabase } from '@/lib/supabase'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!)

function isYouTube(url: string) {
  return url.includes('youtube.com') || url.includes('youtu.be')
}

function getMimeType(url: string): string {
  if (url.includes('.mp4')) return 'video/mp4'
  if (url.includes('.mov')) return 'video/quicktime'
  if (url.includes('.webm')) return 'video/webm'
  return 'video/mp4'
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { url } = await req.json()

  if (!url?.trim()) {
    return NextResponse.json({ error: 'URL required' }, { status: 400 })
  }

  const { data: client } = await supabase
    .from('clients')
    .select('name, brief, context_notes')
    .eq('id', id)
    .single()

  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const clientContext = [
    client.brief ? `Brand brief: ${client.brief.slice(0, 500)}` : '',
    client.context_notes ? `Notes: ${client.context_notes.slice(0, 300)}` : '',
  ].filter(Boolean).join('\n')

  const prompt = `You are analysing a social media video for NO CONTEXT, a social-first creative agency.
Client: ${client.name}
${clientContext}

Analyse this video and return JSON only — no markdown, no explanation:
{
  "hook_type": "what kind of hook (curiosity gap, bold statement, question, POV, transformation, etc)",
  "hook_line": "the exact opening line or visual hook if you can identify it",
  "format": "brief description of the video structure/format",
  "what_works": ["3-5 specific things making this video effective"],
  "why_it_pops": "one sentence on the core mechanic driving engagement",
  "angles_for_client": ["3 content angles adapted specifically for ${client.name}"]
}`

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

    let videoPart: object

    if (isYouTube(url)) {
      videoPart = { fileData: { mimeType: 'video/mp4', fileUri: url } }
    } else {
      const videoRes = await fetch(url, { signal: AbortSignal.timeout(15000) })
      if (!videoRes.ok) throw new Error(`Could not fetch video: ${videoRes.status}`)

      const contentType = videoRes.headers.get('content-type') ?? getMimeType(url)
      const buffer = await videoRes.arrayBuffer()

      if (buffer.byteLength > 20 * 1024 * 1024) {
        throw new Error('Video too large (max 20MB). Try a YouTube link instead.')
      }

      const base64 = Buffer.from(buffer).toString('base64')
      videoPart = { inlineData: { data: base64, mimeType: contentType.split(';')[0] } }
    }

    const result = await model.generateContent([videoPart as any, prompt])
    const text = result.response.text()

    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('Could not parse Gemini response')

    const analysis = JSON.parse(match[0])
    return NextResponse.json({ ok: true, analysis })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
