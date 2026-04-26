import { NextRequest } from 'next/server'
import { GoogleAIFileManager, FileState } from '@google/generative-ai/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import Anthropic from '@anthropic-ai/sdk'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { exec as execCb } from 'child_process'
import { promisify } from 'util'

const exec = promisify(execCb)
import { supabase } from '@/lib/supabase'
import { getCasparContext } from '@/lib/memory'

const fileManager = new GoogleAIFileManager(process.env.GOOGLE_AI_API_KEY!)
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!)

type VideoData = {
  platform: 'TikTok' | 'Instagram'
  url: string
  caption: string
  views: number
  likes: number
  comments: number
  shares: number
  author: string
  videoUrl: string
}

function detectPlatform(url: string): 'tiktok' | 'instagram' | null {
  if (url.includes('tiktok.com') || url.includes('vm.tiktok') || url.includes('vt.tiktok')) return 'tiktok'
  if (url.includes('instagram.com')) return 'instagram'
  return null
}

// Follow redirects to expand shortened URLs like vt.tiktok.com
async function expandUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' })
    return res.url || url
  } catch {
    return url
  }
}

async function fetchFromApify(actorId: string, input: object): Promise<any[]> {
  const token = process.env.APIFY_API_KEY
  const res = await fetch(
    `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${token}&timeout=120`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }
  )
  const data = await res.json().catch(() => null)
  if (!res.ok || !Array.isArray(data)) {
    const msg = data?.error?.message || data?.message || `Apify returned ${res.status}`
    // Truncate long error messages — no raw JSON in the UI
    throw new Error(String(msg).slice(0, 120))
  }
  return data
}

async function fetchTikTokData(url: string): Promise<VideoData> {
  const resolvedUrl = await expandUrl(url)
  const token = process.env.APIFY_API_KEY!
  const data = await fetchFromApify('clockworks~tiktok-scraper', {
    postURLs: [resolvedUrl],
    shouldDownloadVideos: true,   // Apify downloads on their servers (not IP-blocked)
    shouldDownloadCovers: false,
    shouldDownloadSubtitles: false,
    maxItems: 1,
  })
  if (!data.length) throw new Error('No data returned for this TikTok URL')
  const item = data[0]

  // When shouldDownloadVideos: true, Apify stores the file in its KV store.
  // The dataset item contains an Apify storage URL — we append our token to fetch it.
  let videoUrl: string =
    item.videoUrlNoWaterMark ||
    item.videoUrl ||
    item.video?.playAddr ||
    item.video?.downloadAddr ||
    item.mediaUrls?.[0] ||
    item.downloadURL ||
    item.playUrl ||
    ''

  // Append Apify token so we can pull from their storage without TikTok auth
  if (videoUrl && videoUrl.includes('api.apify.com')) {
    videoUrl = videoUrl.includes('?') ? `${videoUrl}&token=${token}` : `${videoUrl}?token=${token}`
  }

  if (process.env.NODE_ENV === 'development') {
    console.log('[research] TikTok videoUrl:', videoUrl || '(none)')
    if (!videoUrl) {
      console.log('[research] item keys:', Object.keys(item))
      console.log('[research] item.video keys:', item.video ? Object.keys(item.video) : 'no video field')
    }
  }

  return {
    platform: 'TikTok',
    url,
    caption: item.text || '',
    views: item.playCount || 0,
    likes: item.diggCount || 0,
    comments: item.commentCount || 0,
    shares: item.shareCount || 0,
    author: item.authorMeta?.nickName || item.authorMeta?.name || '',
    videoUrl,
  }
}

async function fetchInstagramData(url: string): Promise<VideoData> {
  const data = await fetchFromApify('apify~instagram-scraper', {
    directUrls: [url],
    resultsType: 'posts',
    resultsLimit: 1,
  })
  if (!data.length) throw new Error('No data returned for this Instagram URL')
  const item = data[0]
  const videoUrl = item.videoUrl || item.videoSrc || ''
  if (!videoUrl) throw new Error('No video URL returned from Apify for this Reel')
  return {
    platform: 'Instagram',
    url,
    caption: item.caption || '',
    views: item.videoViewCount || 0,
    likes: item.likesCount || 0,
    comments: item.commentsCount || 0,
    shares: 0,
    author: item.ownerUsername || '',
    videoUrl,
  }
}

async function downloadVideo(videoUrl: string): Promise<string> {
  const tmpPath = path.join(os.tmpdir(), `nc_research_${Date.now()}.mp4`)
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Accept': '*/*',
  }
  // TikTok CDN requires a Referer — Apify storage URLs don't need it
  if (!videoUrl.includes('api.apify.com')) {
    headers['Referer'] = 'https://www.tiktok.com/'
  }
  const res = await fetch(videoUrl, { headers })
  if (!res.ok) throw new Error(`Failed to download video: ${res.status}`)
  const buffer = await res.arrayBuffer()
  fs.writeFileSync(tmpPath, Buffer.from(buffer))
  return tmpPath
}

async function downloadWithYtDlp(url: string): Promise<string> {
  const tmpPath = path.join(os.tmpdir(), `nc_ytdlp_${Date.now()}.mp4`)
  try {
    const { stderr } = await exec(
      `python3 -m yt_dlp -o "${tmpPath}" --no-playlist -q --no-warnings ` +
      `--user-agent "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" ` +
      `"${url}"`,
      { timeout: 90000 }
    )
    if (stderr) console.log('[yt-dlp stderr]', stderr)
  } catch (err: unknown) {
    const e = err as { stderr?: string; stdout?: string; message?: string }
    const detail = e.stderr || e.stdout || e.message || String(err)
    throw new Error(`yt-dlp failed: ${String(detail).slice(0, 300)}`)
  }
  if (!fs.existsSync(tmpPath)) throw new Error('yt-dlp: file not found after download')
  return tmpPath
}

async function analyseWithGemini(videoPath: string, video: VideoData, casparContext: string): Promise<string> {
  // Upload to Gemini Files API
  const upload = await fileManager.uploadFile(videoPath, {
    mimeType: 'video/mp4',
    displayName: `nc_${Date.now()}`,
  })

  // Wait for Gemini to process the video
  let file = await fileManager.getFile(upload.file.name)
  let attempts = 0
  while (file.state === FileState.PROCESSING && attempts < 30) {
    await new Promise(r => setTimeout(r, 2000))
    file = await fileManager.getFile(upload.file.name)
    attempts++
  }

  if (file.state === FileState.FAILED) {
    throw new Error('Gemini failed to process the video')
  }

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: casparContext,
  })

  const result = await model.generateContent([
    {
      fileData: {
        mimeType: upload.file.mimeType,
        fileUri: upload.file.uri,
      },
    },
    {
      text: `Watch this entire ${video.platform} video — every second. ${video.views ? `${video.views.toLocaleString()} views, ${video.likes.toLocaleString()} likes.` : ''}
${video.caption ? `Caption: "${video.caption}"` : ''}
${video.author ? `Creator: @${video.author}` : ''}

Watch it like a creative director who has to brief someone on how to steal it tomorrow. You're not summarising. You're diagnosing. What is it actually doing?

Use this format exactly. No preamble. No bold. No markdown.

HOOK: What literally happens in the first 2-3 seconds. The exact visual, action, text, or audio — not the theme, the actual thing that makes someone stop scrolling.

FORMAT: How it's made. Handheld or tripod, single take or edited, direct-to-camera or observational, what the audio is doing. One short paragraph.

WHY IT HITS: This is the most important section — write at least a full paragraph. Go beyond "it's relatable." What is the specific psychological or cultural mechanic at play? What tension does it create or release? What does the audience feel and at what exact moment — and why? If it's funny, name the specific type of funny (subverted expectation, absurd escalation, self-own, timing, contrast). If it's emotional, name the exact human truth. If it's satisfying, what itch does it scratch? What does this video understand about people that most content misses?

THE PATTERN: Strip away the topic entirely. What's the underlying format mechanic? One sentence — clean enough to brief any brand.

NO CONTEXT ANGLES: Don't apply this literally. Think about what this video is actually doing at a conceptual level — the intellectual move, the cultural shorthand, the structural trick. Then ask: what other subjects, industries, or brands could make that same move in a completely different context? The topic should change. The mechanic stays. For each angle: name the brand category or subject, explain how the same underlying move translates, and give one specific execution idea. These should feel surprising — not "a fitness brand does the same thing" but "here's an unexpected context where this exact type of thinking unlocks something".`,
    },
  ])

  // Clean up the uploaded file
  await fileManager.deleteFile(upload.file.name).catch(() => {})

  return result.response.text()
}

async function analyseFromMetadata(video: VideoData, casparContext: string): Promise<string> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1200,
    system: `${casparContext}

You're analysing a video based on metadata only — caption, creator, performance numbers. The video file wasn't available. Make confident, specific inferences from what you have. Do not refuse or hedge. Give a real analysis in your voice.`,
    messages: [{
      role: 'user',
      content: `Analyse this ${video.platform} post based on its metadata. Make specific inferences — use the caption, creator identity, and performance numbers to reason about what the content is and why it worked.

PLATFORM: ${video.platform}
${video.author ? `CREATOR: @${video.author}` : ''}
${video.caption ? `CAPTION: "${video.caption}"` : '(no caption)'}
${video.views ? `PERFORMANCE: ${video.views.toLocaleString()} views · ${video.likes.toLocaleString()} likes · ${video.comments.toLocaleString()} comments` : ''}

Use this exact format. No preamble. No bold. No markdown. No hedging.

HOOK: What likely stops the scroll in the first 2-3 seconds — infer from the creator's style and caption
FORMAT: The content format — talking head / text overlay / POV / trending audio / skit / day-in-life / reaction / etc. One short paragraph.
WHY IT HITS: At least a full paragraph. What is the specific psychological or cultural mechanic? What tension does it create or release? What does the audience feel and why? If it's funny — what type of funny and what makes the timing land? If it's emotional — what exact human truth? What does this video understand about people that most content misses? Use the performance numbers to support your read.
THE PATTERN: The repeatable underlying mechanic any brand could steal. One clean sentence.
NO CONTEXT ANGLES: Don't apply this literally. Think about what this video is actually doing at a conceptual level — the intellectual move, the cultural shorthand, the structural trick. Then ask: what other subjects, industries, or brands could make that same move in a completely different context? The topic should change. The mechanic stays. For each angle: name the brand category or subject, explain how the same underlying move translates, and give one specific execution idea. These should feel surprising — not "a fitness brand does the same thing" but "here's an unexpected context where this exact type of thinking unlocks something".`,
    }],
  })
  return response.content[0].type === 'text' ? response.content[0].text : ''
}

function extractSection(text: string, key: string): string {
  const keys = ['HOOK', 'FORMAT', 'WHY IT HITS', 'THE PATTERN', 'NO CONTEXT ANGLES']
  const escaped = keys.map(k => k.replace(/ /g, '\\s+'))
  const pattern = new RegExp(`(${escaped.join('|')}):`, 'g')
  const matches: { key: string; index: number }[] = []
  let m
  while ((m = pattern.exec(text)) !== null) {
    matches.push({ key: m[1].replace(/\s+/g, ' '), index: m.index + m[0].length })
  }
  for (let i = 0; i < matches.length; i++) {
    if (matches[i].key === key) {
      const start = matches[i].index
      const end = i + 1 < matches.length ? matches[i + 1].index - matches[i + 1].key.length - 1 : text.length
      return text.slice(start, end).trim()
    }
  }
  return ''
}

async function saveToMemory(video: VideoData, analysis: string): Promise<void> {
  // Save structured row to research_patterns
  await supabase.from('research_patterns').insert({
    platform: video.platform,
    author: video.author || null,
    video_url: video.url,
    caption: video.caption || null,
    views: video.views || 0,
    likes: video.likes || 0,
    hook: extractSection(analysis, 'HOOK'),
    format: extractSection(analysis, 'FORMAT'),
    why_it_popped: extractSection(analysis, 'WHY IT HITS'),
    pattern: extractSection(analysis, 'THE PATTERN'),
    no_context_angles: extractSection(analysis, 'NO CONTEXT ANGLES'),
    full_analysis: analysis,
  })

  // Save a creative insight to the structured memories table
  const pattern = extractSection(analysis, 'THE PATTERN')
  const why = extractSection(analysis, 'WHY IT HITS')
  if (pattern) {
    await supabase.from('memories').insert({
      type: 'creative_insight',
      content: `${video.platform}${video.author ? ` @${video.author}` : ''}: ${pattern}${why ? ` — ${why.slice(0, 150)}` : ''}`,
      source: 'research',
      status: 'active',
      tags: [video.platform.toLowerCase(), 'content-pattern'],
    })
  }
}

export async function POST(req: NextRequest) {
  const { urls } = await req.json() as { urls: string[] }
  if (!urls?.length) return new Response('No URLs provided', { status: 400 })

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'))

      // Load Caspar's context once for all URLs in this batch
      const casparContext = await getCasparContext()

      for (const rawUrl of urls) {
        const url = rawUrl.trim()
        if (!url) continue

        const platform = detectPlatform(url)
        if (!platform) {
          send({ url, error: 'Unsupported URL. TikTok and Instagram only.' })
          continue
        }

        let tmpPath: string | null = null
        try {
          send({ url, status: 'fetching' })

          let videoData: VideoData | null = null
          try {
            videoData = platform === 'tiktok'
              ? await fetchTikTokData(url)
              : await fetchInstagramData(url)
          } catch (apifyErr) {
            // Apify failed — build minimal data from the URL so we can still analyse
            videoData = {
              platform: platform === 'tiktok' ? 'TikTok' : 'Instagram',
              url,
              caption: '',
              views: 0, likes: 0, comments: 0, shares: 0,
              author: '',
              videoUrl: '',
            }
          }

          send({ url, status: 'downloading' })

          let analysis: string
          if (videoData.videoUrl) {
            // Apify gave us a URL (Apify storage or CDN) — try direct download first
            try {
              tmpPath = await downloadVideo(videoData.videoUrl)
            } catch {
              // CDN blocked — fall back to yt-dlp
              tmpPath = await downloadWithYtDlp(url)
            }
          } else {
            // Apify didn't return a video URL — download directly with yt-dlp
            tmpPath = await downloadWithYtDlp(url)
          }

          send({ url, status: 'analysing' })
          analysis = await analyseWithGemini(tmpPath, videoData, casparContext)

          // Auto-save to Caspar's memory — fire and forget, don't block the stream
          saveToMemory(videoData, analysis).catch(() => {})

          send({ url, status: 'done', result: { ...videoData, analysis } })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          send({ url, error: msg.length > 200 ? msg.slice(0, 200) + '…' : msg })
        } finally {
          if (tmpPath) fs.unlink(tmpPath, () => {})
        }
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson' },
  })
}
