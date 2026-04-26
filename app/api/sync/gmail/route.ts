import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'
import { getAuthClient } from '@/lib/google'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Gmail query — exclude obvious noise at the API level before we even fetch
const GMAIL_QUERY = [
  '-category:promotions',
  '-category:social',
  '-from:noreply',
  '-from:no-reply',
  '-from:notifications@',
  '-from:donotreply',
  '-from:billing@',
  '-from:invoices@',
  '-from:receipts@',
  '-from:facebookmail.com',
  '-from:meta.com',
  '-from:business.facebook.com',
  '-from:google.com',
  '-from:accounts.google',
  '-from:tiktok',
  '-from:linkedin',
  '-from:slack',
  '-from:asana',
  '-from:mailchimp',
  '-from:hubspot',
  '-subject:receipt',
  '-subject:invoice',
  '-subject:payment confirmation',
  '-subject:your order',
  '-subject:unsubscribe',
  '-subject:newsletter',
].join(' ')

type EmailClassification = {
  needsAttention: boolean
  reason: string         // why it does/doesn't need attention
  suggestedReply?: string // brief note on what response is needed
  relatedClient?: string  // if it's about a client
  priority: 'high' | 'normal' | 'ignore'
}

async function classifyEmail(
  subject: string,
  from: string,
  snippet: string,
  clientNames: string[]
): Promise<EmailClassification> {
  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 200,
    messages: [{
      role: 'user',
      content: `You are filtering emails for Josh Kessel, founder of NO CONTEXT creative agency in Sydney.

Email:
From: ${from}
Subject: ${subject}
Preview: ${snippet.slice(0, 300)}

Known clients: ${clientNames.slice(0, 20).join(', ')}

Classify this email. Return JSON only:
{
  "needsAttention": true/false,
  "priority": "high" | "normal" | "ignore",
  "reason": "one sentence",
  "suggestedReply": "what Josh needs to do — only if needsAttention is true",
  "relatedClient": "client name if relevant, else null"
}

needsAttention = true if: someone is waiting for a reply, a decision is needed, a client is asking something, a potential client reached out, a deliverable is being sent for review, a meeting is being requested.

needsAttention = false if: it's automated, a receipt, a notification, a system email, a newsletter, a billing confirmation, a report, or doesn't require any action from Josh.

priority "high" = client question, potential new business, something time-sensitive.
priority "normal" = needs reply but not urgent.
priority "ignore" = automated or no action needed.`
    }],
  })

  const text = res.content[0].type === 'text' ? res.content[0].text : ''
  try {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0])
  } catch { /* fall through */ }

  return { needsAttention: false, reason: 'Could not classify', priority: 'ignore' }
}

function extractBody(payload: any): string {
  if (!payload) return ''
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8')
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractBody(part)
      if (text) return text
    }
  }
  return ''
}

export async function POST() {
  try {
    const { auth } = await getAuthClient()
    const gmail = google.gmail({ version: 'v1', auth })

    const since = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: `after:${since} ${GMAIL_QUERY}`,
      maxResults: 50,
    })

    const messages = listRes.data.messages ?? []
    if (!messages.length) return NextResponse.json({ ok: true, synced: 0, needsAttention: 0 })

    // Load client names for context
    const { data: notes } = await supabase
      .from('obsidian_notes')
      .select('title')
      .eq('folder', 'Clients')
    const clientNames = (notes ?? []).map(n => n.title.toLowerCase())

    // Load already-processed message IDs to avoid re-classifying
    const { data: existing } = await supabase
      .from('email_inbox')
      .select('message_id')
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    const processedIds = new Set((existing ?? []).map(r => r.message_id))

    let synced = 0
    let needsAttentionCount = 0

    for (const msg of messages) {
      if (processedIds.has(msg.id!)) continue

      const meta = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id!,
        format: 'metadata',
        metadataHeaders: ['Subject', 'From', 'Date'],
      })

      const headers = meta.data.payload?.headers ?? []
      const subject = headers.find(h => h.name === 'Subject')?.value ?? '(no subject)'
      const from = headers.find(h => h.name === 'From')?.value ?? ''
      const date = headers.find(h => h.name === 'Date')?.value ?? ''
      const snippet = meta.data.snippet ?? ''

      // Classify with Haiku — fast and cheap
      const classification = await classifyEmail(subject, from, snippet, clientNames)

      if (classification.priority === 'ignore') continue

      // Fetch full body only for emails that need attention
      let body = snippet
      if (classification.needsAttention) {
        const full = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id!,
          format: 'full',
        })
        const extracted = extractBody(full.data.payload)
        if (extracted) body = extracted.slice(0, 1000)
      }

      // Save to email_inbox table
      await supabase.from('email_inbox').upsert({
        message_id: msg.id,
        subject,
        from_address: from,
        received_at: date ? new Date(date).toISOString() : new Date().toISOString(),
        snippet: snippet.slice(0, 500),
        body: body.slice(0, 1000),
        needs_attention: classification.needsAttention,
        priority: classification.priority,
        reason: classification.reason,
        suggested_reply: classification.suggestedReply ?? null,
        related_client: classification.relatedClient ?? null,
        status: 'unread',
      }, { onConflict: 'message_id' })

      if (classification.needsAttention) needsAttentionCount++
      synced++
    }

    return NextResponse.json({ ok: true, synced, needsAttention: needsAttentionCount, total: messages.length })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
