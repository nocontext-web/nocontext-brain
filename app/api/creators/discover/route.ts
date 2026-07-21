import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { askLightreelStructured, LightreelError } from '@/lib/lightreel'
import { CREATOR_TYPES, COUNTRIES, normalizeCategories, normalizeToList } from '@/lib/creator-taxonomy'

// Lightreel only ever proposes candidates here — nothing is auto-approved.
// Every row lands with status 'scouted', the same status the manual
// IG/TikTok-link import already uses, so it goes through the exact same
// review Josh/Ria do before a creator reaches outreach or ClickUp.
export async function POST(req: NextRequest) {
  const { brief } = (await req.json()) as { brief?: string }
  if (!brief) return NextResponse.json({ error: 'brief is required' }, { status: 400 })

  // Lightreel's response_fields caps out at 5 — median-views and the
  // age-check flag used to be their own fields but that pushed this over the
  // limit once city/country were added, which was silently breaking every
  // call (LightreelError before the request even went out). Folded both into
  // fit_reason's prose instead of dropping the location/category fields.
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
      location: {
        type: 'array',
        description: 'the city and country this creator appears to be based in, formatted as "City, Country", or empty string if unknown — index-aligned with handles',
      },
      categories: {
        type: 'array',
        description: `1-4 values from exactly this list, comma separated, that best describe what this creator is good for: ${CREATOR_TYPES.join(', ')}. Do not invent new categories. Index-aligned with handles.`,
      },
      fit_reason: {
        type: 'array',
        description:
          'why this creator fits the brief, citing specific content or performance evidence (not a generic compliment) — include their approximate recent median view count and note explicitly if age could not be confirmed and needs verification before outreach — index-aligned with handles',
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
    location = [],
    categories = [],
    fit_reason = [],
  } = result.answer as Record<string, string[]>

  if (!handles.length) {
    return NextResponse.json({ creators: [], conversationId: result.conversationId })
  }

  const rows = handles.map((handle, i) => {
    const [rawCity, rawCountry] = (location[i] || '').split(',').map(s => s.trim())
    const country = normalizeToList(rawCountry, COUNTRIES)
    return {
      name: handle.replace(/^@/, ''),
      ig_handle: platform[i] === 'instagram' ? handle : null,
      tt_handle: platform[i] === 'tiktok' ? handle : null,
      city: rawCity || null,
      country,
      location: location[i] || null,
      categories: normalizeCategories((categories[i] || '').split(',')),
      status: 'scouted',
      notes: [
        `[Lightreel] Brief: ${brief}`,
        fit_reason[i] ? `Fit: ${fit_reason[i]}` : null,
        `Lightreel conversation: ${result.conversationId}`,
      ]
        .filter(Boolean)
        .join('\n'),
    }
  })

  const { data, error } = await supabase.from('creators').insert(rows).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ creators: data, conversationId: result.conversationId })
}
