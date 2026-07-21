import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { fetchFromApify, computeViralityScore } from '@/lib/research-analysis'

// Keyword pull is intentionally stats-only and free — no video download, no
// AI. shouldDownloadVideos stays false here; a video only gets downloaded
// and watched when someone clicks Analyze on it (see /api/research, reused
// as-is for that step since it already does exactly that against a single
// URL and upserts the same research_patterns row via video_url).
const RESULTS_PER_PLATFORM = 25

export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data: board } = await supabase.from('research_boards').select('*').eq('id', id).single()
  if (!board) return NextResponse.json({ error: 'Board not found' }, { status: 404 })
  if (!board.keywords?.length) return NextResponse.json({ error: 'Board has no keywords' }, { status: 400 })

  const rows: Record<string, unknown>[] = []
  const errors: string[] = []

  if (board.platforms?.includes('tiktok')) {
    try {
      const items = await fetchFromApify('clockworks~tiktok-scraper', {
        searchQueries: board.keywords,
        resultsPerPage: RESULTS_PER_PLATFORM,
        shouldDownloadVideos: false,
      }, 180)
      for (const item of items) {
        const views = item.playCount || 0
        const likes = item.diggCount || 0
        const shares = item.shareCount || 0
        const saves = item.collectCount || 0
        const comments = item.commentCount || 0
        rows.push({
          board_id: id,
          platform: 'TikTok',
          author: item.authorMeta?.nickName || item.authorMeta?.name || null,
          video_url: item.webVideoUrl,
          caption: item.text || null,
          thumbnail_url: item.videoMeta?.coverUrl || null,
          views, likes, shares, saves, comments,
          virality_score: computeViralityScore({ views, likes, shares, saves, comments }),
        })
      }
    } catch (e: unknown) {
      errors.push(`TikTok: ${(e as Error).message}`)
    }
  }

  if (board.platforms?.includes('instagram')) {
    try {
      // Instagram doesn't expose shares/saves publicly, unlike TikTok — the
      // virality score for these leans on reach/likes/comments only and will
      // read lower than an equivalent TikTok video. That's honest, not a bug
      // (see computeViralityScore's comment in lib/research-analysis.ts).
      const hashtags = board.keywords.map((k: string) => k.replace(/^#/, ''))
      const items = await fetchFromApify('apify~instagram-hashtag-scraper', {
        hashtags,
        resultsType: 'reels',
        resultsLimit: RESULTS_PER_PLATFORM,
      }, 180)
      for (const item of items) {
        const views = item.videoPlayCount || item.igPlayCount || 0
        const likes = item.likesCount || 0
        const comments = item.commentsCount || 0
        rows.push({
          board_id: id,
          platform: 'Instagram',
          author: item.ownerUsername || null,
          video_url: item.url,
          caption: item.caption || null,
          thumbnail_url: item.displayUrl || null,
          views, likes, shares: 0, saves: 0, comments,
          virality_score: computeViralityScore({ views, likes, shares: 0, saves: 0, comments }),
        })
      }
    } catch (e: unknown) {
      errors.push(`Instagram: ${(e as Error).message}`)
    }
  }

  const validRows = rows.filter(r => r.video_url)
  if (!validRows.length) {
    return NextResponse.json({ error: errors.join(' · ') || 'No results found for these keywords', pulled: 0 }, { status: errors.length ? 502 : 200 })
  }

  const { data, error } = await supabase.from('research_patterns').upsert(validRows, { onConflict: 'video_url' }).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ pulled: data?.length ?? 0, warnings: errors.length ? errors : undefined })
}
