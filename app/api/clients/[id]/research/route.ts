import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function scrapeWebsite(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NOCONTEXTBot/1.0)' },
      signal: AbortSignal.timeout(10000),
    })
    const html = await res.text()
    // Strip tags, collapse whitespace, limit length
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000)
    return text
  } catch {
    return ''
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))

  const { data: client } = await supabase.from('clients').select('id, name, website, instagram, tiktok, brief, notes').eq('id', id).single()
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const log: string[] = []
  const sources: string[] = []

  // If a specific URL was dropped
  if (body?.url) {
    const url = body.url
    log.push(`→ Analysing: ${url}`)

    if (url.includes('tiktok.com') || url.includes('youtube.com') || url.includes('youtu.be')) {
      log.push('ℹ Video URL detected — video analysis coming soon (needs yt-dlp on server)')
      sources.push(`Video URL: ${url}`)
    } else {
      log.push(`🌐 Fetching ${url}...`)
      const text = await scrapeWebsite(url)
      if (text) {
        sources.push(`FROM URL (${url}):\n${text}`)
        log.push(`✓ Scraped ${text.length} chars`)
      } else {
        log.push(`✗ Could not fetch ${url}`)
      }
    }
  } else {
    // Full research run
    if (client.website) {
      log.push(`🌐 Scraping website: ${client.website}`)
      const text = await scrapeWebsite(client.website)
      if (text) {
        sources.push(`FROM WEBSITE (${client.website}):\n${text}`)
        log.push(`✓ Website scraped — ${text.length} chars`)
      } else {
        log.push(`✗ Could not scrape website`)
      }
    }

    if (client.instagram) {
      log.push(`📸 Instagram: ${client.instagram} — manual drop required (Instagram blocks scraping)`)
      sources.push(`Instagram handle: ${client.instagram} — content not scraped, manual analysis needed`)
    }

    if (client.tiktok) {
      log.push(`🎵 TikTok: ${client.tiktok} — drop individual video URLs to analyse content`)
      sources.push(`TikTok handle: ${client.tiktok} — drop video URLs via the input above`)
    }
  }

  if (sources.length === 0) {
    log.push('No sources to analyse. Add a website or drop a URL.')
    return NextResponse.json({ log, brief: client.brief || '' })
  }

  // Ask Caspar to synthesise a brand brief
  log.push('🧠 Caspar synthesising brand brief...')

  const existing = client.brief ? `\nExisting brief (update/expand it):\n${client.brief}\n` : ''
  const notesBlock = client.notes ? `\nContext notes from the team:\n${client.notes}\n` : ''

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 2000,
    system: `You are Caspar, strategic co-founder at NO CONTEXT — a social-first creative agency in Sydney.

Your job is to read research about a client and write a sharp, useful brand brief that the creative team (Billy, George, Ellie) can use to do great work.

The brief should cover:
- Who they are and what they do
- Their tone of voice and aesthetic
- Their content goals (what they're trying to achieve on social)
- Their audience
- What good content looks like for them
- What to avoid
- True north star (the one thing all content should ladder up to)

Be specific. No generic agency waffle. Write it like you're briefing a smart creative team in person.`,
    messages: [
      {
        role: 'user',
        content: `Client: ${client.name}
${existing}${notesBlock}
Research sources:
${sources.join('\n\n---\n\n')}

Write the brand brief.`,
      },
    ],
  })

  const brief = response.content[0].type === 'text' ? response.content[0].text : ''
  log.push('✓ Brief generated')

  // Save to DB
  await supabase.from('clients').update({ brief }).eq('id', id)

  return NextResponse.json({ log, brief })
}
