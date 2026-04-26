import { createClient, SupabaseClient } from '@supabase/supabase-js'

let _supabase: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!
    )
  }
  return _supabase
}

// Named export for convenience — only call from API routes (server-side)
export const supabase = {
  get from() { return getSupabase().from.bind(getSupabase()) },
}
