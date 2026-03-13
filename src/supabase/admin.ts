import { createClient } from '@supabase/supabase-js'

// Em produção, o URL pode estar em SUPABASE_URL (backend) ou NEXT_PUBLIC_SUPABASE_URL (frontend).
// Usamos ambos como fallback para evitar erro caso apenas um deles esteja configurado.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || ''
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!supabaseUrl || !serviceRoleKey) {
  // Lançar erro explícito ajuda a identificar problemas de configuração no deploy (Netlify, etc.)
  throw new Error('Supabase admin não configurado: verifique SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY')
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

