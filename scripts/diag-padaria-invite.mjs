#!/usr/bin/env node
/**
 * Diagnóstico READ-ONLY — contexto recente de tenants/convites/usuários.
 * NÃO envia email nem altera nada.
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('❌ Faltam credenciais Supabase no .env'); process.exit(1) }

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const fmt = (v) => (v ? new Date(v).toLocaleString('pt-BR') : '—')

// 1) Tenants recentes
const { data: tenants } = await sb
  .from('tenants')
  .select('id, name, is_free, plan_status, created_at')
  .order('created_at', { ascending: false })
  .limit(12)
console.log('🏢 12 TENANTS MAIS RECENTES:')
for (const t of (tenants || [])) {
  console.log(`   ${fmt(t.created_at)} | ${t.name}  (free=${t.is_free}, ${t.plan_status})`)
}

// 2) Convites recentes
const { data: invites } = await sb
  .from('tenant_invitations')
  .select('email, role, accepted_at, created_at, tenant_id, tenants(name)')
  .order('created_at', { ascending: false })
  .limit(12)
console.log('\n✉️  12 CONVITES MAIS RECENTES (tenant_invitations):')
for (const i of (invites || [])) {
  console.log(`   ${fmt(i.created_at)} | ${i.email} → ${i.tenants?.name || i.tenant_id} | ${i.accepted_at ? 'ACEITO' : 'pendente'}`)
}

// 3) Usuários auth recém-criados / convidados
const recent = []
let page = 1
while (page <= 5) {
  const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 })
  if (error) { console.error('listUsers erro:', error.message); break }
  const users = data?.users || []
  recent.push(...users)
  if (users.length < 200) break
  page += 1
}
recent.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
console.log('\n👤 12 USUÁRIOS AUTH MAIS RECENTES:')
for (const u of recent.slice(0, 12)) {
  console.log(`   ${fmt(u.created_at)} | ${u.email}`)
  console.log(`        invited_at=${fmt(u.invited_at)} | confirmation_sent_at=${fmt(u.confirmation_sent_at)} | confirmed=${fmt(u.email_confirmed_at)} | last_sign_in=${fmt(u.last_sign_in_at)}`)
}

console.log(`\n(total de usuários auth carregados: ${recent.length})`)
process.exit(0)
