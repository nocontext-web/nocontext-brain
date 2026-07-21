import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { fetchFromApify, analyseComments } from '@/lib/research-analysis'

// Free audience research straight from the comment section: what people ask
// for in the comments is the next script. Separate from the video-watch
// analysis (POST /api/research) since it's a distinct signal — kept as its
// own action rather than bundled automatically, so it only runs on videos
// someone actually cares about (comment scraping costs an Apify run too).
export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data: pattern } = await supabase.from('research_patterns').select('*').eq('id', id).single()
  if (!pattern) return NextResponse.json({ error: 'Video not found' }, { status: 404 })
  if (!pattern.video_url) return NextResponse.json({ error: 'No video URL on this row' }, { status: 400 })

  let comments: string[] = []
  try {
    if (pattern.platform === 'TikTok') {
      const items = await fetchFromApify('clockworks~tiktok-comments-scraper', {
        postURLs: [pattern.video_url],
        maxItems: 60,
      }, 90)
      comments = items.map((c: { text?: string }) => c.text).filter((t: string | undefined): t is string => Boolean(t))
    } else {
      const items = await fetchFromApify('apify~instagram-scraper', {
        directUrls: [pattern.video_url],
        resultsType: 'comments',
        resultsLimit: 60,
      }, 90)
      comments = items.map((c: { text?: string }) => c.text).filter((t: string | undefined): t is string => Boolean(t))
    }
  } catch (e: unknown) {
    return NextResponse.json({ error: `Comment scrape failed: ${(e as Error).message}` }, { status: 502 })
  }

  const analysis = await analyseComments(comments, { platform: pattern.platform, caption: pattern.caption })

  const { data, error } = await supabase
    .from('research_patterns')
    .update({ comment_analysis: analysis })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
