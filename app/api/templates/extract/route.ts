import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const name = file.name
  const ext = name.split('.').pop()?.toLowerCase()

  if (ext === 'txt' || ext === 'md') {
    const text = await file.text()
    return NextResponse.json({ content: text, name: name.replace(/\.[^.]+$/, '') })
  }

  if (ext === 'docx') {
    try {
      const mammoth = await import('mammoth')
      const buffer = Buffer.from(await file.arrayBuffer())
      const result = await mammoth.extractRawText({ buffer })
      return NextResponse.json({ content: result.value, name: name.replace(/\.[^.]+$/, '') })
    } catch {
      return NextResponse.json({ error: 'Could not extract Word doc — try copy-pasting instead' }, { status: 422 })
    }
  }

  return NextResponse.json({ error: 'Unsupported file type. Upload .txt, .md, or .docx' }, { status: 415 })
}
