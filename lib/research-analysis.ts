import { GoogleAIFileManager, FileState } from '@google/generative-ai/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { exec as execCb } from 'child_process'
import { promisify } from 'util'

const exec = promisify(execCb)
const fileManager = new GoogleAIFileManager(process.env.GOOGLE_AI_API_KEY!)
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!)

export async function fetchFromApify(actorId: string, input: object, timeoutSec = 120): Promise<any[]> {
  const token = process.env.APIFY_API_KEY
  const res = await fetch(
    `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${token}&timeout=${timeoutSec}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }
  )
  const data = await res.json().catch(() => null)
  if (!res.ok || !Array.isArray(data)) {
    const msg = data?.error?.message || data?.message || `Apify returned ${res.status}`
    throw new Error(String(msg).slice(0, 120))
  }
  return data
}

export async function downloadVideo(videoUrl: string): Promise<string> {
  const tmpPath = path.join(os.tmpdir(), `nc_research_${Date.now()}.mp4`)
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Accept': '*/*',
  }
  if (!videoUrl.includes('api.apify.com')) headers['Referer'] = 'https://www.tiktok.com/'
  const res = await fetch(videoUrl, { headers })
  if (!res.ok) throw new Error(`Failed to download video: ${res.status}`)
  fs.writeFileSync(tmpPath, Buffer.from(await res.arrayBuffer()))
  return tmpPath
}

export async function downloadWithYtDlp(url: string): Promise<string> {
  const tmpPath = path.join(os.tmpdir(), `nc_ytdlp_${Date.now()}.mp4`)
  try {
    const { stderr } = await exec(
      `python3 -m yt_dlp -o "${tmpPath}" --no-playlist -q --no-warnings ` +
      `--user-agent "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" ` +
      `"${url}"`,
      { timeout: 90000 }
    )
    if (stderr && process.env.NODE_ENV === 'development') console.log('[yt-dlp stderr]', stderr)
  } catch (err: unknown) {
    const e = err as { stderr?: string; stdout?: string; message?: string }
    const detail = e.stderr || e.stdout || e.message || String(err)
    throw new Error(`yt-dlp failed: ${String(detail).slice(0, 300)}`)
  }
  if (!fs.existsSync(tmpPath)) throw new Error('yt-dlp: file not found after download')
  return tmpPath
}

export type VideoMeta = {
  platform: 'TikTok' | 'Instagram'
  caption?: string
  views?: number
  likes?: number
  author?: string
}

const ANALYSIS_KEYS = ['HOOK', 'FORMAT', 'WHY IT HITS', 'THE PATTERN', 'NO CONTEXT ANGLES']

export function extractSection(text: string, key: string): string {
  const escaped = ANALYSIS_KEYS.map(k => k.replace(/ /g, '\\s+'))
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

// Watch the actual video (not the caption) and diagnose why it works, in the
// exact HOOK/FORMAT/WHY IT HITS/THE PATTERN/NO CONTEXT ANGLES format the rest
// of the app (research_patterns rows, the /research page) already parses.
export async function analyseVideoWithGemini(videoPath: string, video: VideoMeta, systemContext: string): Promise<string> {
  const upload = await fileManager.uploadFile(videoPath, {
    mimeType: 'video/mp4',
    displayName: `nc_${Date.now()}`,
  })

  let file = await fileManager.getFile(upload.file.name)
  let attempts = 0
  while (file.state === FileState.PROCESSING && attempts < 30) {
    await new Promise(r => setTimeout(r, 2000))
    file = await fileManager.getFile(upload.file.name)
    attempts++
  }
  if (file.state === FileState.FAILED) throw new Error('Gemini failed to process the video')

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', systemInstruction: systemContext })

  const result = await model.generateContent([
    { fileData: { mimeType: upload.file.mimeType, fileUri: upload.file.uri } },
    {
      text: `Watch this entire ${video.platform} video — every second. ${video.views ? `${video.views.toLocaleString()} views, ${(video.likes ?? 0).toLocaleString()} likes.` : ''}
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

  await fileManager.deleteFile(upload.file.name).catch(() => {})
  return result.response.text()
}

// Step 5 of the research doc — free audience research straight from the
// winner's comment section: what people ask for in the comments is the next
// script. Kept separate from the video analysis since it's a distinct signal
// (audience language) rather than a read on the creative itself.
export async function analyseComments(comments: string[], video: { platform: string; caption?: string }): Promise<{ questions: string[]; objections: string[]; audienceLanguage: string }> {
  if (!comments.length) return { questions: [], objections: [], audienceLanguage: '' }

  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })
  const result = await model.generateContent([
    {
      text: `Here are top comments on a ${video.platform} video${video.caption ? ` (caption: "${video.caption}")` : ''}:

${comments.slice(0, 60).map((c, i) => `${i + 1}. ${c}`).join('\n')}

This is voice-of-customer research. Respond in exactly this format, no markdown:

QUESTIONS: comma-separated list of the actual questions people keep asking in these comments (empty if none)
OBJECTIONS: comma-separated list of doubts/pushback/objections that keep coming up (empty if none)
LANGUAGE: 2-3 sentences on the specific words and phrasing real people use to describe this problem/product/feeling — the exact language a script should borrow, not a paraphrase.`,
    },
  ])
  const text = result.response.text()
  const parseList = (key: string) => {
    const m = text.match(new RegExp(`${key}:\\s*(.*)`))
    return m ? m[1].split(',').map(s => s.trim()).filter(Boolean) : []
  }
  const langMatch = text.match(/LANGUAGE:\s*([\s\S]*)/)
  return {
    questions: parseList('QUESTIONS'),
    objections: parseList('OBJECTIONS'),
    audienceLanguage: langMatch ? langMatch[1].trim() : '',
  }
}

export type ViralityStats = { views: number; likes: number; shares: number; saves: number; comments: number }

// Free, deterministic, computed the instant a video lands — no AI cost. Used
// to rank and gate: only the videos that clear a threshold here are worth
// spending Gemini time/money watching.
//   Reach: log-scaled views (10k->8, 100k->16, 1M->24, 10M->32), capped 40.
//   Engagement depth: (likes+shares+saves+comments)/views, 10% = full 35pts.
//   Viral spread: (shares+saves)/views, 2% = full 25pts.
// Instagram's hashtag scraper doesn't expose shares/saves (IG doesn't make
// them public), so those stay 0 for IG-sourced videos — the score leans
// harder on reach/likes/comments there and will read lower than an
// equivalent TikTok video. That's an honest reflection of what's knowable,
// not a bug.
export function computeViralityScore(stats: ViralityStats): number {
  const { views, likes, shares, saves, comments } = stats
  if (!views) return 0

  const reach = Math.min(40, Math.max(0, Math.log10(Math.max(views, 1) / 1000) * 8))
  const engagementRate = (likes + shares + saves + comments) / views
  const engagement = Math.min(35, (engagementRate / 0.10) * 35)
  const spreadRate = (shares + saves) / views
  const spread = Math.min(25, (spreadRate / 0.02) * 25)

  return Math.round(Math.min(100, reach + engagement + spread))
}
