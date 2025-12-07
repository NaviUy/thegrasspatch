import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_PUBLIC_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_PUBLIC_KEY) {
  console.warn('Supabase credentials are missing. Realtime will be disabled.')
}

export const supabase =
  SUPABASE_URL && SUPABASE_PUBLIC_KEY
    ? createClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
        auth: {
          persistSession: false,
        },
      })
    : null
