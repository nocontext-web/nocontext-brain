import { NextRequest, NextResponse } from 'next/server'
import { GoogleAIFileManager, FileState } from '@google/generative-ai/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const fileManager = new GoogleAIFileManager(process.env.GOOGLE_AI_API_KEY!)
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!)

export async function POST(req: NextRequest) {
  let tmpPath: string | null = null

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    // Write to tmp
    const buffer = Buffer.from(await file.arrayBuffer())
    const ext = path.extname(file.name) || '.mp4'
    tmpPath = path.join(os.tmpdir(), `nc_transcribe_${Date.now()}${ext}`)
    fs.writeFileSync(tmpPath, buffer)

    // Upload to Gemini
    const upload = await fileManager.uploadFile(tmpPath, {
      mimeType: file.type || 'audio/mpeg',
      displayName: file.name,
    })

    // Wait for processing
    let uploaded = await fileManager.getFile(upload.file.name)
    let attempts = 0
    while (uploaded.state === FileState.PROCESSING && attempts < 30) {
      await new Promise(r => setTimeout(r, 2000))
      uploaded = await fileManager.getFile(upload.file.name)
      attempts++
    }
    if (uploaded.state === FileState.FAILED) throw new Error('Gemini failed to process file')

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' })

    const result = await model.generateContent([
      { fileData: { mimeType: uploaded.mimeType, fileUri: uploaded.uri } },
      { text: `Transcribe this audio/video verbatim. Return only the transcript — no timestamps, no speaker labels unless there are clearly multiple speakers, no preamble. If there are multiple speakers, prefix each line with "Speaker 1:", "Speaker 2:", etc. Clean up filler words like "um" and "uh" silently.` },
    ])

    const transcript = result.response.text().trim()
    return NextResponse.json({ transcript })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[transcribe]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  } finally {
    if (tmpPath && fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath)
  }
}
