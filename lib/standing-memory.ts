import { getSupabase } from './supabase'

export async function appendStandingMemory(agent: string, note: string) {
  if (!note.trim()) return
  const { error } = await getSupabase().rpc('append_agent_memory', { p_agent: agent, p_note: note })
  if (error) throw new Error(`Memory was not saved; check reliability migration: ${error.message}`)
}
