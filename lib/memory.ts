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

/** Shared private retrieval. Team requests receive no private records. */
export async function getCasparContext(relatedClient?: string, isJosh = true): Promise<string> {
  const promptRes = await supabase.from('agent_prompts').select('prompt').eq('agent','caspar').single()
  const prompt = promptRes.data?.prompt ?? DEFAULT_PROMPTS.caspar
  if (!isJosh) return `${prompt}\nYou have no access to Josh's private context or financial records.`
  const { data, error } = await supabase.rpc('get_caspar_knowledge', { p_query: relatedClient || '' })
  if (error) throw new Error(`Shared knowledge unavailable: ${error.message}`)
  return `${prompt}\nSHARED KNOWLEDGE:\n${data}`

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
