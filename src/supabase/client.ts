import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const hasConfig = Boolean(supabaseUrl && supabaseAnonKey)

// Evita 500 quando variáveis não estão definidas (ex.: testes E2E, build sem .env).
// Se faltar config, criamos um client dummy para a app carregar (login/redirect); chamadas falham até .env estar correto.
function createSupabaseClient(): SupabaseClient<Database> {
  if (!hasConfig) {
    // Client mínimo para não quebrar no carregamento do módulo (SSR ou build)
    return {
      auth: {
        getSession: () => Promise.resolve({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signInWithPassword: () => Promise.reject(new Error('Supabase não configurado (NEXT_PUBLIC_SUPABASE_* ausentes)')),
        signUp: () => Promise.reject(new Error('Supabase não configurado')),
        signOut: () => Promise.resolve({ error: null }),
      },
      from: () => ({
        select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }),
        eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }),
      }) as any,
      channel: () => ({ subscribe: () => ({}) }) as any,
    } as SupabaseClient<Database>
  }
  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: typeof window !== 'undefined' ? window.sessionStorage : undefined,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  })
}

export const supabase = createSupabaseClient()
