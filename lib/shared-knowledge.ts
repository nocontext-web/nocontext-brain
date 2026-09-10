import { supabase } from './supabase'
export async function loadSharedKnowledge(query: string) {
 const { data, error } = await supabase.rpc('get_caspar_knowledge', { p_query: query })
 if(error) throw new Error('Shared knowledge unavailable: ' + error.message)
 return String(data || '')
}
