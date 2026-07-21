import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { askLightreelStructured, LightreelError } from '@/lib/lightreel'

// Lightreel only ever proposes candidates here — nothing is auto-approved.
// Every row lands with status 'scouted', the same status the manual
// IG/TikTok-link import already uses, so it goes through the exact same
// review Josh/Ria do before a creator reaches outreach or ClickUp.
export async function POST(req: NextRequest) {
  const { brief } = (await req.json()) as { brief?: string }
  if (!brief) return NextResponse.json({ error: 'brief is required' }, { status: 400 })

  let result: Awaited<ReturnType<typeof askLightreelStructured>>
  try {
    result = await askLightreelStructured(brief, {
      handles: {
        type: 'array',
        description: 'the creator\'s @handle, one per recommended creator, in the order Lightreel recommends outreach',
      },
      platform: {
        type: 'array',
        description: 'primary platform for this creator, exactly "tiktok" or "instagram" — index-aligned with handles',
      },
      fit_reason: {
        type: 'array',
        description:
          'one to two sentences on why this creator fits the brief, citing specific content or performance evidence (not a generic compliment) — index-aligned with handles',
      },
      recent_median_views: {
        type: 'array',
        description: 'their approximate recent median view count as a short string like "88K" — index-aligned with handles',
      },
      needs_age_check: {
        type: 'array',
        description:
          '"yes" if age could not be confirmed and must be verified before outreach, otherwise "no" — index-aligned with handles',
      },
      city: {
        type: 'array',
        description: 'the city/region this creator appears to be based in, or empty string if unknown — index-aligned with handles',
      },
      country: {
        type: 'array',
        description: 'the country this creator appears to be based in, or empty string if unknown — index-aligned with handles',
      },
    })
  } catch (err) {
    if (err instanceof LightreelError) {
      // authentication_error / invalid_request_error come back with a real
      // status from Lightreel; timeouts and network errors don't, so fall
      // back to 502 (bad gateway) since it's Lightreel's leg of the request that failed.
      return NextResponse.json({ error: err.message, type: err.type }, { status: err.status ?? 502 })
    }
    throw err
  }

  const {
    handles = [],
    platform = [],
    fit_reason = [],
    recent_median_views = [],
    needs_age_check = [],
    city = [],
    country = [],
  } = result.answer as Record<string, string[]>

  if (!handles.length) {
    return NextResponse.json({ creators: [], conversationId: result.conversationId })
  }

  const rows = handles.map((handle, i) => ({
    name: handle.replace(/^@/, ''),
    ig_handle: platform[i] === 'instagram' ? handle : null,
    tt_handle: platform[i] === 'tiktok' ? handle : null,
    city: city[i] || null,
    country: country[i] || null,
    location: [city[i], country[i]].filter(Boolean).join(', ') || null,
    status: 'scouted',
    notes: [
      `[Lightreel] Brief: ${brief}`,
      fit_reason[i] ? `Fit: ${fit_reason[i]}` : null,
      recent_median_views[i] ? `Recent median views: ${recent_median_views[i]}` : null,
      needs_age_check[i]?.toLowerCase() === 'yes' ? 'NEEDS AGE CONFIRMATION before outreach' : null,
      `Lightreel conversation: ${result.conversationId}`,
    ]
      .filter(Boolean)
      .join('\n'),
  }))

  const { data, error } = await supabase.from('creators').insert(rows).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ creators: data, conversationId: result.conversationId })
}
