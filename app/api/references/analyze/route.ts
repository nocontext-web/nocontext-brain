import { NextRequest, NextResponse } from 'next/server'
import { GoogleAIFileManager, FileState } from '@google/generative-ai/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { exec as execCb } from 'child_process'
import { promisify } from 'util'
import { supabase } from '@/lib/supabase'
import { getCasparContext } from '@/lib/memory'

const exec = promisify(execCb)
const fileManager = new GoogleAIFileManager(process.env.GOOGLE_AI_API_KEY!)
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!)

// Deploy targets (Railway) don't have python3, and we don't want a build-time
// dependency on a specific builder's package syntax — so fetch the official
// standalone yt-dlp binary once per container and cache it in tmpdir, instead
// of shelling out to a system python3 + pip-installed yt_dlp module.
async function ensureYtDlpBinary(): Promise<string> {
  const binName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp'
  const binPath = path.join(os.tmpdir(), binName)
  if (fs.existsSync(binPath)) return binPath

  const assetName = process.platform === 'win32'
    ? 'yt-dlp.exe'
    : process.platform === 'darwin'
      ? 'yt-dlp_macos'
      : 'yt-dlp_linux'

  const res = await fetch(`https://github.com/yt-dlp/yt-dlp/releases/latest/download/${assetName}`, { redirect: 'follow' })
  if (!res.ok) throw new Error(`Failed to download yt-dlp binary: ${res.status}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(binPath, buffer, { mode: 0o755 })
  fs.chmodSync(binPath, 0o755)
  return binPath
}

async function downloadWithYtDlp(url: string): Promise<string> {
  const ytDlpPath = await ensureYtDlpBinary()
  const tmpPath = path.join(os.tmpdir(), `nc_ref_${Date.now()}.mp4`)
  // Deliberately no custom --user-agent here: TikTok's extractor uses browser
  // impersonation (curl_cffi) to bypass bot detection, and overriding the
  // user-agent breaks that fingerprint, causing "Video not available, status
  // code 0" even on genuinely available videos. Let yt-dlp manage its own UA.
  await exec(
    `"${ytDlpPath}" -o "${tmpPath}" --no-playlist -q --no-warnings "${url}"`,
    { timeout: 120000 }
  )
  if (!fs.existsSync(tmpPath)) throw new Error('yt-dlp: file not found after download')
  return tmpPath
}

function extractSection(text: string, key: string): string {
  const pattern = new RegExp(`${key}:\\s*([\\s\\S]*?)(?=\\n[A-Z ]+:|$)`, 'i')
  return text.match(pattern)?.[1]?.trim() ?? ''
}

export async function POST(req: NextRequest) {
  let body: { url?: string; category?: string; creator_name?: string; notes?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }

  const { url, category, creator_name, notes } = body
  if (!url) return NextResponse.json({ error: 'URL required' }, { status: 400 })

  let tmpPath: string | null = null

  try {
    // Download the video
    tmpPath = await downloadWithYtDlp(url)

    // Upload to Gemini
    const upload = await fileManager.uploadFile(tmpPath, {
      mimeType: 'video/mp4',
      displayName: `ref_${Date.now()}`,
    })

    let file = await fileManager.getFile(upload.file.name)
    let attempts = 0
    while (file.state === FileState.PROCESSING && attempts < 30) {
      await new Promise(r => setTimeout(r, 2000))
      file = await fileManager.getFile(upload.file.name)
      attempts++
    }
    if (file.state === FileState.FAILED) throw new Error('Gemini failed to process video')

    const casparContext = await getCasparContext()
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: casparContext,
    })

    const creatorLine = creator_name ? `Creator: ${creator_name}` : ''
    const categoryLine = category ? `Style category: ${category}` : ''
    const notesLine = notes ? `Notes from Josh: ${notes}` : ''

    const result = await model.generateContent([
      { fileData: { mimeType: upload.file.mimeType, fileUri: upload.file.uri } },
      { text: `Watch this entire video — every second. This is a reference video being added to NO CONTEXT's creative library to inform future scripts and concepts.
${creatorLine}
${categoryLine}
${notesLine}

Analyse it like a creative director building a playbook. Be specific — not generic observations, but the actual things happening in this video that make it work.

Use this exact format. No preamble. No bold. No markdown.

HOOK: What literally happens in the first 2-3 seconds. The exact visual, action, sound or text that stops the scroll.

FORMAT: How it's built. Camera style, editing pace, single take or cuts, direct-to-camera or observational, what the audio is doing. One short paragraph.

WHY IT WORKS: The real reason this performs. Psychology, tension, cultural relevance, humour mechanic — whatever is actually driving it. One paragraph, be honest.

STYLE DNA: The aesthetic fingerprint. What makes this feel like this creator/brand. The things that would make someone recognise it instantly — lighting, pacing, energy, tone, edit style.

STEAL THIS: 3 specific, actionable things NO CONTEXT could lift and apply to client work. Concrete, not vague.` }
    ])

    const analysis = result.response.text().trim()

    // Save to Supabase
    const { data, error } = await supabase.from('reference_videos').insert({
      url,
      category: category || null,
      creator_name: creator_name || null,
      notes: notes || null,
      hook: extractSection(analysis, 'HOOK'),
      format: extractSection(analysis, 'FORMAT'),
      why_it_works: extractSection(analysis, 'WHY IT WORKS'),
      style_dna: extractSection(analysis, 'STYLE DNA'),
      steal_this: extractSection(analysis, 'STEAL THIS'),
      raw_analysis: analysis,
    }).select().single()

    if (error) throw new Error(error.message)

    return NextResponse.json({ ok: true, reference: data })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[references/analyze]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  } finally {
    if (tmpPath && fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
  }
}
