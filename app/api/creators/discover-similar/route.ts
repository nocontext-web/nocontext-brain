import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { askLightreelStructured, LightreelError } from '@/lib/lightreel'
import { COUNTRIES, normalizeToList } from '@/lib/creator-taxonomy'

// Same review gate as /api/creators/discover: Lightreel only ever proposes,
// everything lands as 'scouted' for a human to promote before outreach.
// The difference here is the input is a reference video URL, not a text
// brief -- Lightreel already recognises specific TikTok/IG posts directly
// (confirmed working against real posts), so we hand the URL straight
// through as part of the question rather than trying to describe it first.
export async function POST(req: NextRequest) {
  const { referenceUrl, note } = (await req.json()) as { referenceUrl?: string; note?: string }
  if (!referenceUrl) return NextResponse.json({ error: 'referenceUrl is required' }, { status: 400 })

  const question = `Here is a reference video: ${referenceUrl}. ${
    note || 'Find creators making similar content in the same hook/format style.'
  } For each recommended creator, give their handle, platform, a direct URL to one of their own videos in this same style, and why it fits the reference.`

  // Lightreel's response_fields caps out at 5 — city and country used to be
  // separate fields, which pushed this over the limit and was silently
  // breaking every call (LightreelError before the request even went out).
  // Combined into one "location" field to stay under the cap.
  let result: Awaited<ReturnType<typeof askLightreelStructured>>
  try {
    result = await askLightreelStructured(question, {
      handles: {
        type: 'array',
        description: 'the creator\'s @handle, one per recommended creator',
      },
      platform: {
        type: 'array',
        description: 'primary platform for this creator, exactly "tiktok" or "instagram" — index-aligned with handles',
      },
      similar_video_urls: {
        type: 'array',
        description: 'a direct URL to one specific video by this creator that matches the reference style — index-aligned with handles',
      },
      fit_reason: {
        type: 'array',
        description: 'one to two sentences on how this creator/video matches the reference\'s hook or format, citing specifics — index-aligned with handles',
      },
      location: {
        type: 'array',
        description: 'the city and country this creator appears to be based in, formatted as "City, Country", or empty string if unknown — index-aligned with handles',
      },
    })
  } catch (err) {
    if (err instanceof LightreelError) {
      return NextResponse.json({ error: err.message, type: err.type }, { status: err.status ?? 502 })
    }
    throw err
  }

  const {
    handles = [],
    platform = [],
    similar_video_urls = [],
    fit_reason = [],
    location = [],
  } = result.answer as Record<string, string[]>

  if (!handles.length) {
    return NextResponse.json({ creators: [], conversationId: result.conversationId })
  }

  const rows = handles.map((handle, i) => {
    const [rawCity, rawCountry] = (location[i] || '').split(',').map(s => s.trim())
    return {
      name: handle.replace(/^@/, ''),
      ig_handle: platform[i] === 'instagram' ? handle : null,
      tt_handle: platform[i] === 'tiktok' ? handle : null,
      city: rawCity || null,
      country: normalizeToList(rawCountry, COUNTRIES),
      location: location[i] || null,
      status: 'scouted',
      notes: [
        `[Lightreel, similar to ${referenceUrl}]`,
        fit_reason[i] ? `Fit: ${fit_reason[i]}` : null,
        similar_video_urls[i] ? `Video: ${similar_video_urls[i]}` : null,
        `Lightreel conversation: ${result.conversationId}`,
      ]
        .filter(Boolean)
        .join('\n'),
    }
  })

  const { data, error } = await supabase.from('creators').insert(rows).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const creators = (data ?? []).map((c, i) => ({ ...c, videoUrl: similar_video_urls[i] ?? null }))
  return NextResponse.json({ creators, conversationId: result.conversationId })
}
