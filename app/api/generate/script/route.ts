import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Map template key → what to match against in reference_videos
const TEMPLATE_MATCH: Record<string, string[]> = {
  jai:   ['jai'],
  axe:   ['axe'],
  lofi:  ['lofi', 'lo-fi', 'lo fi', 'lofi concepts'],
  josh:  ['josh', 'josh from marketing'],
}

async function getReferencesForTemplate(templateKey: string): Promise<string> {
  const terms = TEMPLATE_MATCH[templateKey]
  if (!terms) return ''

  const { data } = await supabase
    .from('reference_videos')
    .select('creator_name,category,hook,format,why_it_works,style_dna,steal_this,notes')
    .order('created_at', { ascending: false })
    .limit(20)

  if (!data?.length) return ''

  const relevant = data.filter(r => {
    const haystack = [r.creator_name, r.category].join(' ').toLowerCase()
    return terms.some(t => haystack.includes(t))
  })

  if (!relevant.length) return ''

  const lines = relevant.map((r, i) => {
    const parts = [
      `Reference ${i + 1}${r.creator_name ? ` (${r.creator_name})` : ''}:`,
      r.hook ? `  Hook: ${r.hook}` : '',
      r.format ? `  Format: ${r.format}` : '',
      r.why_it_works ? `  Why it works: ${r.why_it_works}` : '',
      r.style_dna ? `  Style DNA: ${r.style_dna}` : '',
      r.steal_this ? `  Steal this: ${r.steal_this}` : '',
      r.notes ? `  Josh's notes: ${r.notes}` : '',
    ].filter(Boolean)
    return parts.join('\n')
  }).join('\n\n')

  return `\n\nREFERENCE VIDEOS (study these — write in this style):\n${lines}`
}

const SYSTEM = `You are Caspar, creative director at NO CONTEXT — a social-first creative agency in Sydney.

You write scripts and content ideas for brands. You think like a creator, not a marketer. Native over polished. The hook is everything. If the first line doesn't stop someone mid-scroll, nothing else matters.

Rules:
- Never use em dashes. Use a comma or full stop.
- No corporate language. No "leverage", "synergy", "authentic", "resonate".
- Write like a real person talking, not a brand.
- Short sentences. Active voice. Every line earns its place.`

function buildPrompt(
  templateKey: string,
  clientName: string,
  clientBrief: string,
  fieldValues: Record<string, string>,
  brief: string
): string {
  const context = [
    `CLIENT: ${clientName}`,
    clientBrief ? `BRAND CONTEXT:\n${clientBrief}` : '',
    brief ? `EXTRA DIRECTION:\n${brief}` : '',
  ].filter(Boolean).join('\n\n')

  switch (templateKey) {

    case 'jai':
      return `${context}

ANGLE / STORY: ${fieldValues.angle || 'Not specified'}
TONE: ${fieldValues.tone || 'Not specified'}

Write a Jai-style voiceover script. Jai edits narrative storytelling videos — think documentary feel, tight pacing, emotional pull. The script should feel like someone telling a real story, not reading an ad.

FORMAT:

HOOK (first 3 seconds — one line, stops the scroll):
[hook line]

VOICEOVER SCRIPT:
[full script, broken into short punchy paragraphs — each paragraph is roughly one cut]

VISUAL NOTES:
[what the editor sees — describe the shots, overlays, or moments that match each section. Keep it brief and practical]

CLOSING LINE:
[last thing heard — lands the message, doesn't sell]

Rules:
- No more than 90 seconds when read aloud (roughly 200-230 words of voiceover)
- Every sentence should feel like it could be cut without losing the thread — tight
- No call to action unless it feels completely natural
- The hook must be the most interesting sentence in the whole script`

    case 'axe':
      return `${context}

CONCEPT: ${fieldValues.concept || 'Not specified'}
VIBE / ENERGY: ${fieldValues.vibe || 'Not specified'}

Write an Axe-style video script. Axe edits highly cut, high-energy videos — fast transitions, text overlays, sound design moments, visual rhythm. This is a shot-by-shot production document, not a traditional script.

FORMAT:

HOOK SHOT (0-2 seconds):
[the very first frame — what instantly grabs attention]

SHOT LIST:
[numbered shots — each one is: shot description | overlay text (if any) | duration in seconds]
Example:
1. Close on hands opening box | "you've been waiting for this" | 1.5s
2. Product reveal, slow push in | — | 2s
3. Cut to reaction face | "yeah." | 0.5s

SOUND / MUSIC DIRECTION:
[describe the energy — beat drops, silence moments, sound effects that matter]

END FRAME:
[final shot and any closing text]

EDITOR NOTES:
[any specific pacing, transition, or colour grade notes worth flagging]

Rules:
- Total video should be 30-60 seconds
- At least one moment of contrast (speed up / slow down, loud / silent, chaos / calm)
- Text overlays should be short — 5 words max per card
- Think about what this looks like on mute`

    case 'lofi':
      return `${context}

FOCUS / UPCOMING MOMENT: ${fieldValues.focus || 'No specific focus'}

Generate 8 lo-fi video concepts for this brand. Lo-fi means raw, native-looking, shot on iPhone, no production value needed. The ideas should span different formats — trends, overlays, skits, POV, day-in-the-life, reaction formats, etc.

FORMAT FOR EACH CONCEPT:

CONCEPT [number]: [name]
Format: [trend / overlay / skit / POV / reaction / talking to camera / etc]
Setup: [one sentence — what you see]
Hook / Overlay: [the text that appears or the opening line — this is the most important part]
Why it works: [one sentence on why this lands for this brand specifically]

---

Rules:
- Each concept should be genuinely different — no two the same format
- At least 2 should be trend-based (something currently working on TikTok/Reels)
- At least 2 should be brand-specific moments that only this brand could do
- The hook/overlay is the most important part — make each one genuinely good
- Think about what a real person at this brand could film tomorrow with their phone
- No concepts that require talent, scripting, or production planning`

    case 'josh':
      return `${context}

SITUATION / BRAND MOMENT: ${fieldValues.situation || 'Not specified'}

Write 3 "Josh from Marketing" style video concepts. This format is observational humour — you film a real, slightly absurd thing that happens at or around the brand, and the overlay text is the dry punchline. Like: Zoe from Fig & Bloom keeps drinking the water from the flower vases, overlay is "the new hire keeps drinking the water out of the flower vases".

The humour comes from the gap between how normal the person acts and how absurd the situation is. It's never mean. It's always something the brand can laugh at themselves about.

FORMAT FOR EACH CONCEPT:

CONCEPT [number]: [name]
The situation: [what actually happens — describe it like you're watching it on someone's phone]
The overlay text: [the dry punchline that appears on screen — this is everything, make it perfect]
Visual setup: [how you'd actually film this — what the shot looks like]
Why it lands: [one sentence on what makes this funny for this specific brand]

---

Rules:
- The overlay text is the whole joke — it has to be specific, dry, and true-feeling
- The situation should feel real, not staged — like someone actually filmed this by accident
- Never punch at the customer or make fun of the product
- The funniest ones are the most specific — "the new hire drinks the vase water" not "the staff do funny things"
- Write 3 concepts, escalating in boldness`

    default:
      return `${context}\n\nGenerate content for this brand.`
  }
}

export async function POST(req: NextRequest) {
  const { clientName, clientBrief, templateKey, fieldValues, brief, history } = await req.json()

  // history = [{role, content}] for refinement iterations
  // if history is provided, it's a refinement — just append and stream
  const references = await getReferencesForTemplate(templateKey)
  const system = references ? `${SYSTEM}\n\n${references}` : SYSTEM

  let messages
  if (history?.length) {
    // Refinement — history already contains the full conversation
    messages = history
  } else {
    const prompt = buildPrompt(templateKey, clientName || 'Unknown client', clientBrief || '', fieldValues || {}, brief || '')
    messages = [{ role: 'user', content: prompt }]
  }

  const stream = await anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system,
    messages,
  })

  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          controller.enqueue(encoder.encode(chunk.delta.text))
        }
      }
      controller.close()
    },
  })

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
