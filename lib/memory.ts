import { supabase } from '@/lib/supabase'
import { DEFAULT_PROMPTS } from '@/lib/agents'
import { syncMemoryToVault } from '@/lib/obsidian'

export type MemoryType = 'client' | 'contact' | 'decision' | 'creative_insight' | 'taste_note' | 'process_rule' | 'opinion' | 'general'
export type MemoryStatus = 'active' | 'superseded' | 'archived'

export type Memory = {
  id: string
  type: MemoryType
  content: string
  source?: string
  status: MemoryStatus
  related_client?: string
  tags?: string[]
  created_at: string
}

const TYPE_HEADERS: Record<MemoryType, string> = {
  process_rule: 'RULES & PROCESS',
  creative_insight: 'CREATIVE INSIGHTS',
  taste_note: 'TASTE & AESTHETICS',
  decision: 'DECISIONS MADE',
  client: 'CLIENT KNOWLEDGE',
  contact: 'PEOPLE & CONTACTS',
  opinion: 'OPINIONS',
  general: 'GENERAL',
}

const TYPE_ORDER: MemoryType[] = [
  'process_rule', 'creative_insight', 'taste_note', 'decision', 'client', 'contact', 'opinion', 'general'
]

const FINANCIAL_PATTERN = /(\$[\d,]+|\bmonthly value\b|\bretainer\b|\binvoice\b|\bpricing\b|\bfee\b|\bfees\b|\brate\b|\brates\b|\bquote\b|\bbudget\b|\bpaid\b|\bowing\b|\boverdue\b)/i

function isFinancial(text: string): boolean {
  return FINANCIAL_PATTERN.test(text)
}

/**
 * Load Caspar's full context: system prompt + structured memories.
 * Pass isJosh=false to strip all financial info (for team members).
 */
export async function getCasparContext(relatedClient?: string, isJosh = true): Promise<string> {
  const [promptRes, memoriesRes, legacyRes] = await Promise.all([
    supabase.from('agent_prompts').select('prompt').eq('agent', 'caspar').single(),
    supabase.from('memories').select('*').eq('status', 'active').order('created_at', { ascending: false }),
    // Keep loading legacy blob during migration
    supabase.from('agent_memory').select('content').eq('agent', 'caspar').single(),
  ])

  const systemPrompt = promptRes.data?.prompt ?? DEFAULT_PROMPTS['caspar'] ?? ''
  let memories: Memory[] = memoriesRes.data ?? []
  const legacyMemory: string = legacyRes.data?.content ?? ''

  // Strip financial memories for non-Josh users
  if (!isJosh) {
    memories = memories.filter(m => !isFinancial(m.content))
  }

  // Group active memories by type
  const grouped: Partial<Record<MemoryType, Memory[]>> = {}
  for (const m of memories) {
    if (!grouped[m.type]) grouped[m.type] = []
    grouped[m.type]!.push(m)
  }

  // Build structured memory context
  const sections: string[] = []

  for (const type of TYPE_ORDER) {
    const items = grouped[type]
    if (!items?.length) continue

    // If a client is specified, surface client-specific memories first
    const sorted = relatedClient
      ? [...items.filter(m => m.related_client?.toLowerCase() === relatedClient.toLowerCase()),
         ...items.filter(m => !m.related_client || m.related_client.toLowerCase() !== relatedClient.toLowerCase())]
      : items

    const lines = sorted.map(m => {
      const clientTag = m.related_client ? ` [${m.related_client}]` : ''
      return `- ${m.content}${clientTag}`
    }).join('\n')

    sections.push(`### ${TYPE_HEADERS[type]}\n${lines}`)
  }

  let memoryBlock = ''
  if (sections.length > 0) {
    memoryBlock = `\n\n## WHAT YOU KNOW\n${sections.join('\n\n')}`
  }

  // Append legacy blob during migration — strip financials for non-Josh
  if (legacyMemory && memories.length < 10) {
    const safeLegacy = isJosh
      ? legacyMemory
      : legacyMemory.split('\n').filter(l => !isFinancial(l)).join('\n')
    memoryBlock += `\n\n## ADDITIONAL CONTEXT\n${safeLegacy}`
  }

  const financialGuard = !isJosh
    ? `\n\nHARD RULE: You are speaking with a team member, not Josh. Never mention retainer amounts, monthly fees, pricing, invoice figures, or any financial information about clients — not even ranges or approximations. If asked, say that's between Josh and the client.`
    : ''

  return `${systemPrompt}${financialGuard}${memoryBlock}`
}

/**
 * Save a single memory row and sync to Obsidian vault.
 */
export async function saveMemory(memory: Omit<Memory, 'id' | 'created_at'>): Promise<void> {
  const { data } = await supabase.from('memories').insert(memory).select().single()
  if (data) syncMemoryToVault(data)
}

/**
 * Supersede old memories of the same type + client when saving a correction.
 */
export async function supersede(type: MemoryType, relatedClient?: string): Promise<void> {
  let q = supabase.from('memories').update({ status: 'superseded' }).eq('type', type).eq('status', 'active')
  if (relatedClient) q = q.eq('related_client', relatedClient)
  await q
}

/**
 * Save multiple memories at once and sync each to Obsidian vault.
 */
export async function saveMemories(memories: Omit<Memory, 'id' | 'created_at'>[]): Promise<void> {
  if (!memories.length) return
  const { data } = await supabase.from('memories').insert(memories).select()
  if (data) data.forEach(m => syncMemoryToVault(m))
}
