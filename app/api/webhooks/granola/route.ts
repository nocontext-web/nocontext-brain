import { NextRequest, NextResponse } from 'next/server'

/**
 * Granola webhook endpoint.
 *
 * To connect Granola:
 * 1. In Granola → Settings → Integrations → Webhooks
 * 2. Add webhook URL: https://your-domain.com/api/webhooks/granola
 * 3. Set GRANOLA_WEBHOOK_SECRET in .env.local
 *
 * Granola sends a POST with the meeting transcript after each meeting.
 * We auto-process it into structured memories for Caspar.
 */

export async function POST(req: NextRequest) {
  // Optional: verify webhook secret
  const secret = process.env.GRANOLA_WEBHOOK_SECRET
  if (secret) {
    const sig = req.headers.get('x-granola-signature') || req.headers.get('authorization')
    if (!sig || !sig.includes(secret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Granola sends different payload shapes depending on version
  // Handle both the structured format and raw transcript
  const transcript: string =
    body.transcript ||
    body.content ||
    body.notes ||
    body.summary ||
    (body.meeting?.transcript) ||
    (body.meeting?.notes) ||
    ''

  const meetingTitle: string =
    body.title ||
    body.meeting?.title ||
    body.name ||
    'Meeting'

  if (!transcript.trim()) {
    console.log('[granola webhook] received payload with no transcript:', Object.keys(body))
    return NextResponse.json({ ok: true, message: 'No transcript content, skipped' })
  }

  console.log(`[granola webhook] processing: "${meetingTitle}" (${transcript.length} chars)`)

  // Call our transcript processor with autoSave = true
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const res = await fetch(`${baseUrl}/api/train/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      transcript: `MEETING: ${meetingTitle}\n\n${transcript}`,
      source: 'granola',
      autoSave: true,
    }),
  })

  const result = await res.json()
  console.log(`[granola webhook] saved ${result.saved ?? 0} memories from "${meetingTitle}"`)

  return NextResponse.json({ ok: true, saved: result.saved ?? 0, meeting: meetingTitle })
}
