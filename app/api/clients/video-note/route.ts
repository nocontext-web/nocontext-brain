import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { supabase } from '@/lib/supabase'
import { saveMemory } from '@/lib/memory'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!)

// Same fetch-and-inline approach as [id]/analyze-video, kept separate because
// the prompt and the write-back are different: that route analyses a
// reference/competitor video and only returns JSON for the UI to display.
// This one is for Josh talking to camera about a client (via Hermes) and
// needs the takeaway to actually land in the brain, not just be displayed.
function isYouTube(url: string) {
  return url.includes('youtube.com') || url.includes('youtu.be')
}

function getMimeType(url: string): string {
  if (url.includes('.mov')) return 'video/quicktime'
  if (url.includes('.webm')) return 'video/webm'
  return 'video/mp4'
}

export async function POST(req: NextRequest) {
  const { name, url } = (await req.json()) as { name?: string; url?: string }
  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 })
  if (!url?.trim()) return NextResponse.json({ error: 'url is required' }, { status: 400 })

  const { data: client } = await supabase
    .from('clients')
    .select('id, name, brief, context_notes')
    .ilike('name', `%${name}%`)
    .limit(1)
    .single()

  if (!client) return NextResponse.json({ error: `No client matching "${name}"` }, { status: 404 })

  const prompt = `Josh, founder of NO CONTEXT (a social-first creative agency), just recorded himself talking through something about a client. Watch and listen to the whole thing.

Client: ${client.name}
${client.brief ? `Brand brief: ${client.brief.slice(0, 500)}` : ''}
${client.context_notes ? `Existing notes: ${client.context_notes.slice(0, 500)}` : ''}

Write a clear, complete takeaway of what he said — what he wants, any decisions, context, or direction for this client. Write it so someone with no other context could pick it up and act on it or write a doc from it. Plain prose, no headers, no markdown. 3-6 sentences depending on how much he actually said.`

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

    let videoPart: object
    if (isYouTube(url)) {
      videoPart = { fileData: { mimeType: 'video/mp4', fileUri: url } }
    } else {
      const videoRes = await fetch(url, { signal: AbortSignal.timeout(20000) })
      if (!videoRes.ok) throw new Error(`Could not fetch video: ${videoRes.status}`)
      const contentType = videoRes.headers.get('content-type') ?? getMimeType(url)
      const buffer = await videoRes.arrayBuffer()
      if (buffer.byteLength > 20 * 1024 * 1024) throw new Error('Video too large (max 20MB)')
      videoPart = { inlineData: { data: Buffer.from(buffer).toString('base64'), mimeType: contentType.split(';')[0] } }
    }

    const result = await model.generateContent([videoPart as any, prompt])
    const takeaway = result.response.text().trim()

    const date = new Date().toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short', year: 'numeric' })

    // saveMemory (not a raw insert) is what actually syncs to the real
    // Obsidian vault note for this client — a raw insert into `memories`
    // would sit in the database but never reach a .md file on disk.
    await saveMemory({
      type: 'client',
      content: `${client.name}: ${takeaway}`,
      source: 'hermes_video',
      related_client: client.name,
      tags: ['hermes', 'video-note'],
      status: 'active',
    })

    // context_notes is a single free-text field the client panel also edits,
    // so this must append, never overwrite, or it wipes out unrelated notes.
    const appended = `${client.context_notes ?? ''}\n[${date}, via Hermes video] ${takeaway}`.trim()
    await supabase.from('clients').update({ context_notes: appended }).eq('id', client.id)

    return NextResponse.json({ ok: true, client: client.name, takeaway })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
