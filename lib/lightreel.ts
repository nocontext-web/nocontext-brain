const LIGHTREEL_BASE = 'https://api.lightreel.ai/v1'

// Lightreel runs a live agent per request (web search, scoring, ranking) —
// their own docs say this can take several minutes, so the timeout here is
// deliberately generous, not a leftover default.
const REQUEST_TIMEOUT_MS = 6 * 60 * 1000

export class LightreelError extends Error {
  type: string
  status: number | null
  constructor(message: string, type: string, status: number | null) {
    super(message)
    this.name = 'LightreelError'
    this.type = type
    this.status = status
  }
}

type ResponseFieldType = 'string' | 'array'
export type ResponseFields = Record<string, { type: ResponseFieldType; description: string }>

async function lightreelFetch(path: string, init: RequestInit = {}) {
  const key = process.env.LIGHTREEL_API_KEY
  if (!key) throw new LightreelError('LIGHTREEL_API_KEY not set', 'config_error', null)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(`${LIGHTREEL_BASE}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...init.headers },
      signal: controller.signal,
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new LightreelError(
        'Lightreel timed out — the agent can genuinely take several minutes on a hard brief, this may not be a real failure',
        'timeout',
        null
      )
    }
    throw new LightreelError(`Network error calling Lightreel: ${(err as Error).message}`, 'network_error', null)
  } finally {
    clearTimeout(timer)
  }

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const err = data?.error ?? {}
    throw new LightreelError(err.message || `Lightreel returned ${res.status}`, err.type || 'unknown_error', res.status)
  }
  return data
}

// Plain-prose ask. answer is a string here.
export async function askLightreel(
  question: string,
  conversationId?: string
): Promise<{ answer: string; conversationId: string }> {
  const data = await lightreelFetch('/chat', {
    method: 'POST',
    body: JSON.stringify({ question, ...(conversationId ? { conversation_id: conversationId } : {}) }),
  })
  return { answer: data.answer, conversationId: data.conversationId }
}

// Structured ask. answer is an object keyed by whatever you asked for in responseFields.
export async function askLightreelStructured(
  question: string,
  responseFields: ResponseFields,
  conversationId?: string
): Promise<{ answer: Record<string, unknown>; conversationId: string }> {
  if (Object.keys(responseFields).length > 5) {
    throw new LightreelError('response_fields supports at most 5 fields', 'invalid_request_error', null)
  }
  const data = await lightreelFetch('/chat', {
    method: 'POST',
    body: JSON.stringify({
      question,
      response_fields: responseFields,
      ...(conversationId ? { conversation_id: conversationId } : {}),
    }),
  })
  return { answer: data.answer, conversationId: data.conversationId }
}

export async function getLightreelChat(conversationId: string) {
  return lightreelFetch(`/chat/${encodeURIComponent(conversationId)}`)
}

export async function listLightreelChats(): Promise<unknown[]> {
  const data = await lightreelFetch('/chats')
  return data.conversations ?? []
}
