import { NextRequest, NextResponse } from 'next/server'
import { GoogleAIFileManager, FileState } from '@google/generative-ai/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { supabase } from '@/lib/supabase'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { exec as execCb } from 'child_process'
import { promisify } from 'util'

const exec = promisify(execCb)
const fileManager = new GoogleAIFileManager(process.env.GOOGLE_AI_API_KEY!)
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!)

async function fetchFromApify(actorId: string, input: object): Promise<any[]> {
  const token = process.env.APIFY_API_KEY
  const res = await fetch(
    `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${token}&timeout=60`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }
  )
  const data = await res.json().catch(() => null)
  if (!res.ok || !Array.isArray(data)) {
    throw new Error(String(data?.error?.message || data?.message || `Apify ${res.status}`).slice(0, 120))
  }
  return data
}

function formatFollowers(n: number): string {
  if (!n) return ''
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function inferTier(followers: number): string {
  if (followers >= 500_000) return 'celebrity'
  if (followers >= 200_000) return 'macro'
  if (followers >= 50_000) return 'mid'
  return 'micro'
}

function extractUsername(url: string): string {
  return url
    .replace(/https?:\/\/(www\.)?(instagram\.com|tiktok\.com)\/@?/, '')
    .replace(/\/$/, '').replace(/^@/, '').split('/')[0].split('?')[0]
}

async function scrapeInstagram(url: string) {
  const username = extractUsername(url)
  const data = await fetchFromApify('apify~instagram-scraper', {
    directUrls: [`https://www.instagram.com/${username}/`],
    // The actor's actual allowed values are "posts" | "details" | "comments" —
    // "profiles" isn't one of them and was failing every single import.
    resultsType: 'details',
    resultsLimit: 1,
  })
  if (!data.length) throw new Error('No Instagram profile data returned')
  const p = data[0]
  return {
    ig_handle: `@${p.username || username}`,
    ig_followers: formatFollowers(p.followersCount),
    ig_followers_raw: p.followersCount || 0,
    name: p.fullName || p.username || username,
    location: p.city || p.location || '',
    bio: p.biography || '',
  }
}

async function scrapeTikTok(url: string) {
  const username = extractUsername(url)
  const data = await fetchFromApify('clockworks~tiktok-profile-scraper', {
    profiles: [`https://www.tiktok.com/@${username}`],
    // The actor rejects 0 ("Field input.resultsPerPage must be >= 1") even
    // though only profile stats are read below, not any posts it returns.
    resultsPerPage: 1,
  })
  if (!data.length) throw new Error('No TikTok profile data returned')
  const p = data[0]
  return {
    tt_handle: `@${p.uniqueId || username}`,
    tt_followers: formatFollowers(p.followers || p.followerCount),
    tt_followers_raw: p.followers || p.followerCount || 0,
    name: p.nickname || p.uniqueId || username,
  }
}

async function downloadVideo(videoUrl: string): Promise<string> {
  const tmpPath = path.join(os.tmpdir(), `nc_creator_${Date.now()}.mp4`)
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Accept': '*/*',
  }
  if (!videoUrl.includes('api.apify.com')) headers['Referer'] = 'https://www.tiktok.com/'
  const res = await fetch(videoUrl, { headers })
  if (!res.ok) throw new Error(`Download failed: ${res.status}`)
  fs.writeFileSync(tmpPath, Buffer.from(await res.arrayBuffer()))
  return tmpPath
}

async function downloadWithYtDlp(url: string): Promise<string> {
  const tmpPath = path.join(os.tmpdir(), `nc_ytdlp_${Date.now()}.mp4`)
  await exec(
    `python3 -m yt_dlp -o "${tmpPath}" --no-playlist -q --no-warnings ` +
    `--user-agent "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" ` +
    `"${url}"`,
    { timeout: 90000 }
  )
  if (!fs.existsSync(tmpPath)) throw new Error('yt-dlp: file not found')
  return tmpPath
}

function extractField(text: string, key: string): string {
  const pattern = new RegExp(`${key}:\\s*([\\s\\S]*?)(?=\\n[A-Z]+:|$)`, 'i')
  return text.match(pattern)?.[1]?.trim() ?? ''
}

async function analyseCreatorStyle(
  videoPath: string,
  creatorName: string,
  requestedUseCase?: string
): Promise<{ notes: string; categories: string[]; location: string }> {
  const upload = await fileManager.uploadFile(videoPath, {
    mimeType: 'video/mp4',
    displayName: `nc_creator_${Date.now()}`,
  })

  let file = await fileManager.getFile(upload.file.name)
  let attempts = 0
  while (file.state === FileState.PROCESSING && attempts < 30) {
    await new Promise(r => setTimeout(r, 2000))
    file = await fileManager.getFile(upload.file.name)
    attempts++
  }
  if (file.state === FileState.FAILED) throw new Error('Gemini failed to process video')

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
  // When Josh names a use-case ("amazing creator for how-to content", "good
  // UGC for USA"), the notes need to specifically argue why this creator
  // fits *that*, not just describe them generically — and that use-case has
  // to come back out as a clean tag so it's actually findable later.
  const useCaseInstruction = requestedUseCase
    ? `Josh said this about them: "${requestedUseCase}". Your NOTES must specifically explain why the video supports (or doesn't support) that claim, citing what you actually see. Your CATEGORIES must include a clean, short tag for that exact use-case (e.g. "how-to content", "usa ugc") in addition to any other tags you'd naturally add.`
    : ''
  const result = await model.generateContent([
    { fileData: { mimeType: upload.file.mimeType, fileUri: upload.file.uri } },
    {
      text: `Watch this video. You're building a creative brief on this creator for a social media agency, to file into a creator rolodex.
${useCaseInstruction}

Respond in exactly this format, no markdown, no extra text before or after:

NOTES: 3-4 sentences covering their on-camera presence and energy, their editing style and pacing, what kind of content they make and what makes it work, and what type of brand they'd be best suited to. Be specific and direct — this will be used to brief clients on why this creator is a good fit.

CATEGORIES: 2-4 short tags for what this creator is good for (e.g. comedy, talking head, founder story, lo-fi, high production, product demo, observational). Comma separated, lowercase, 1-3 words each.

LOCATION: If they mention or it's visually obvious where they're based (city/region), name it. Otherwise write unknown.`,
    },
  ])

  await fileManager.deleteFile(upload.file.name).catch(() => {})
  const text = result.response.text().trim()

  const notes = extractField(text, 'NOTES') || text
  const categories = extractField(text, 'CATEGORIES')
    .split(',')
    .map(c => c.trim().toLowerCase())
    .filter(Boolean)
  const location = extractField(text, 'LOCATION')
  return { notes, categories, location: /^unknown$/i.test(location) ? '' : location }
}

// Josh sending just a profile link (no specific video) is the common case —
// grab their most recent post automatically instead of requiring him to dig
// up and paste a separate reel/video link every time.
async function getRecentPostVideoUrl(profileUrl: string, platform: 'instagram' | 'tiktok'): Promise<string> {
  const token = process.env.APIFY_API_KEY!
  if (platform === 'instagram') {
    const data = await fetchFromApify('apify~instagram-scraper', {
      directUrls: [profileUrl], resultsType: 'posts', resultsLimit: 1,
    })
    return data[0]?.videoUrl || data[0]?.videoSrc || ''
  }
  const username = extractUsername(profileUrl)
  const data = await fetchFromApify('clockworks~tiktok-scraper', {
    profiles: [username], resultsPerPage: 1,
    shouldDownloadVideos: true, shouldDownloadCovers: false, shouldDownloadSubtitles: false,
  })
  const item = data[0]
  let videoUrl = item?.videoUrlNoWaterMark || item?.videoUrl || item?.mediaUrls?.[0] || ''
  if (videoUrl?.includes('api.apify.com')) {
    videoUrl = videoUrl.includes('?') ? `${videoUrl}&token=${token}` : `${videoUrl}?token=${token}`
  }
  return videoUrl
}

async function getVideoUrl(url: string): Promise<string> {
  const isInstagram = url.includes('instagram.com')
  const token = process.env.APIFY_API_KEY!

  if (isInstagram) {
    const data = await fetchFromApify('apify~instagram-scraper', {
      directUrls: [url], resultsType: 'posts', resultsLimit: 1,
    })
    const videoUrl = data[0]?.videoUrl || data[0]?.videoSrc || ''
    if (videoUrl) return videoUrl
  } else {
    const data = await fetchFromApify('clockworks~tiktok-scraper', {
      postURLs: [url], shouldDownloadVideos: true, shouldDownloadCovers: false,
      shouldDownloadSubtitles: false, maxItems: 1,
    })
    const item = data[0]
    let videoUrl = item?.videoUrlNoWaterMark || item?.videoUrl || item?.mediaUrls?.[0] || ''
    if (videoUrl?.includes('api.apify.com')) {
      videoUrl = videoUrl.includes('?') ? `${videoUrl}&token=${token}` : `${videoUrl}?token=${token}`
    }
    if (videoUrl) return videoUrl
  }
  return ''
}

export async function POST(req: NextRequest) {
  const { igUrl, ttUrl, videoUrl, note } = await req.json() as {
    igUrl?: string; ttUrl?: string; videoUrl?: string; note?: string
  }

  if (!igUrl && !ttUrl) {
    return NextResponse.json({ error: 'Provide at least one profile URL' }, { status: 400 })
  }

  const igData: Record<string, any> = {}
  const ttData: Record<string, any> = {}
  const errors: string[] = []

  await Promise.all([
    igUrl ? scrapeInstagram(igUrl).then(d => Object.assign(igData, d)).catch(e => errors.push(`Instagram: ${e.message}`)) : Promise.resolve(),
    ttUrl ? scrapeTikTok(ttUrl).then(d => Object.assign(ttData, d)).catch(e => errors.push(`TikTok: ${e.message}`)) : Promise.resolve(),
  ])

  if (!igData.ig_handle && !ttData.tt_handle) {
    return NextResponse.json({ error: errors.join(' · ') || 'Could not fetch profile data' }, { status: 422 })
  }

  const igFollowers = igData.ig_followers_raw || 0
  const ttFollowers = ttData.tt_followers_raw || 0
  const maxFollowers = Math.max(igFollowers, ttFollowers)

  // Analyse creator style from video — this is also where "what they're good
  // for" (categories) and a location fallback come from, since the TikTok
  // scraper doesn't return location at all and Instagram's is often blank
  // too. Run this whenever there's an explicit video, OR Josh gave a note
  // ("amazing creator for how-to content") — that note needs an actual watch
  // to back it up, not just get repeated back as a tag.
  let styleNotes = igData.bio || ''
  let categories: string[] = []
  let videoLocation = ''
  if (videoUrl || note) {
    let tmpPath: string | null = null
    try {
      let dlUrl: string
      let fallbackUrl: string
      if (videoUrl) {
        // An explicit post/reel page link — resolve it to a raw video URL.
        dlUrl = await getVideoUrl(videoUrl).catch(() => '')
        fallbackUrl = videoUrl
      } else {
        // No specific video given — pull their most recent post automatically
        // instead of requiring Josh to dig one up and paste it separately.
        // This is already a raw downloadable URL, not a page link.
        dlUrl = await getRecentPostVideoUrl(igUrl || ttUrl || '', igUrl ? 'instagram' : 'tiktok')
        fallbackUrl = dlUrl
      }
      if (!dlUrl && !fallbackUrl) throw new Error('Could not find a recent video to analyse')

      tmpPath = dlUrl
        ? await downloadVideo(dlUrl).catch(() => downloadWithYtDlp(fallbackUrl))
        : await downloadWithYtDlp(fallbackUrl)
      const analysis = await analyseCreatorStyle(tmpPath, igData.name || ttData.name || '', note)
      styleNotes = analysis.notes
      categories = analysis.categories
      videoLocation = analysis.location
    } catch (e: any) {
      errors.push(`Video analysis: ${String(e.message).slice(0, 100)}`)
    } finally {
      if (tmpPath) fs.unlink(tmpPath, () => {})
    }
  }

  const creator = {
    name: igData.name || ttData.name || '',
    ig_handle: igData.ig_handle || '',
    ig_followers: igData.ig_followers || '',
    tt_handle: ttData.tt_handle || '',
    tt_followers: ttData.tt_followers || '',
    tier: inferTier(maxFollowers),
    location: igData.location || videoLocation || '',
    notes: styleNotes,
    // 'scouted' — this is Josh building out a personal rolodex of creators he
    // rates, not Ria's active outreach/deal pipeline. 'prospect' implies
    // we've already started pursuing them for a specific client; someone can
    // promote a creator to that once real outreach actually begins.
    status: 'scouted',
    categories,
  }

  const { data, error } = await supabase.from('creators').insert(creator).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ creator: data, warnings: errors.length ? errors : undefined })
}
