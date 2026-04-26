import { NextRequest, NextResponse } from 'next/server'

const VOICE_IDS: Record<string, string> = {
  billy:  'TX3LPaxmHKxFdv7VOQHJ', // Liam — Energetic, Social Media
  caspar: 'wDsJlOXPqcvIUKdLXjDs', // Jarvis — British Robotic Monotone
  george: 'IKne3meq5aSn9XLyUdCD', // Charlie — Deep, Confident
  ellie:  'cgSgspJ2msm6clMCkdW9', // Jessica — Warm, Bright
}

export async function POST(req: NextRequest) {
  const { text, agent } = await req.json()
  const voiceId = VOICE_IDS[agent] ?? VOICE_IDS.caspar

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
    method: 'POST',
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_turbo_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  })

  if (!res.ok) {
    return NextResponse.json({ error: 'TTS failed' }, { status: 500 })
  }

  const audio = await res.arrayBuffer()
  return new NextResponse(audio, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-cache',
    },
  })
}
