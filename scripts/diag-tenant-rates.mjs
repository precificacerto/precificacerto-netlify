#!/usr/bin/env node
/**
 * Vê quais tax_rates estão configurados no tenant do Gancho.
 */
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
)

const TENANT_ID = '20e08592-f957-4e72-b7eb-251387e34eb9' // Esquadrias De Paula

const { data: rates } = await supabase
  .from('tax_rates')
  .select('*')
  .eq('tenant_id', TENANT_ID)

console.log('🗂️  tax_rates do tenant Esquadrias De Paula:')
if (!rates || rates.length === 0) {
  console.log('  ❌ VAZIO — nenhum rate configurado no tenant')
} else {
  rates.forEach(r => {
    console.log(`  ${r.tax_type}: ${r.rate_pct} (válido de ${r.valid_from} até ${r.valid_until || 'indefinido'})`)
  })
}
