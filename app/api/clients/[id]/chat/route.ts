import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { message, history = [] } = await req.json()

  const [clientRes, casparPromptRes, casparMemoryRes] = await Promise.all([
    supabase.from('clients').select('*').eq('id', id).single(),
    supabase.from('agent_prompts').select('prompt').eq('agent', 'caspar').single(),
    supabase.from('agent_memory').select('content').eq('agent', 'caspar').single(),
  ])

  const client = clientRes.data
  if (!client) return new Response('Not found', { status: 404 })

  const basePrompt = casparPromptRes.data?.prompt ?? ''
  const memory = casparMemoryRes.data?.content ?? ''

  const clientContext = client.brief
    ? `\n\n## CLIENT CONTEXT — ${client.name.toUpperCase()}:\n${client.brief}`
    : `\n\n## CLIENT: ${client.name}\nNo brief yet. Answer based on the client name and any handles provided.`

  const systemPrompt = `${basePrompt}${clientContext}${memory ? `\n\n## YOUR MEMORY:\n${memory}` : ''}`

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await anthropic.messages.create({
          model: 'claude-opus-4-6',
          max_tokens: 1500,
          system: systemPrompt,
          messages: [
            ...history.slice(-10).map((m: { role: string; content: string }) => ({
              role: m.role as 'user' | 'assistant',
              content: m.content,
            })),
            { role: 'user', content: message },
          ],
          stream: true,
        })

        for await (const event of response) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(event.delta.text))
          }
        }
      } catch (err) {
        controller.enqueue(encoder.encode(`\n\nError: ${err instanceof Error ? err.message : String(err)}`))
      }
      controller.close()
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
