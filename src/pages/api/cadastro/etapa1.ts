import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/supabase/admin'
import {
  isValidEmailFormat,
  isValidBrazilianMobile,
  phoneDigits,
} from '@/utils/contact-validation'
import { verifyEmailDomainHasMx } from '@/utils/verify-email-domain'

/**
 * Etapa 1 do novo fluxo de cadastro (Escopo 13/08/2026): cria a CONTA antes do
 * pagamento. Ao contrário do fluxo antigo (o webhook do Stripe criava o tenant
 * só depois do checkout), aqui o tenant nasce em `PENDING_PAYMENT` e o usuário
 * segue para a Etapa 2 (escolha de quantidade de usuários) já autenticado.
 *
 * Passos, todos com service role (ignora RLS):
 *   1. Valida entradas (e-mail formato + MX, WhatsApp BR, senha, consentimento).
 *   2. Guarda de reentrada: se o e-mail já existe no Auth, não recria — manda logar.
 *   3. Cria tenant PENDING_PAYMENT via RPC create_tenant_from_stripe (sem Stripe).
 *   4. Cria auth.users com senha (o trigger handle_new_auth_user popula public.users).
 *   5. Vincula tenant_owners (o trigger do Caso 1 não faz isso).
 *   6. Upsert do lead por e-mail, apontando tenant_id.
 *   7. Grava tenants.lead_id de volta para o lead.
 *
 * Não é transação única (Auth + REST são chamadas separadas): em falha após
 * criar o tenant, faz cleanup best-effort do tenant para não deixar órfão.
 */

const CONSENT_VERSION_DEFAULT = 'v1-2026-08'
const MIN_PASSWORD_LEN = 8

type Etapa1Body = {
  name?: string
  email?: string
  whatsapp?: string
  company?: string
  password?: string
  consent?: boolean
  consentVersion?: string
  origemLead?: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmContent?: string
}

function badRequest(res: NextApiResponse, error: string) {
  return res.status(400).json({ error })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const {
    name,
    email,
    whatsapp,
    company,
    password,
    consent,
    consentVersion,
    origemLead,
    utmSource,
    utmMedium,
    utmCampaign,
    utmContent,
  } = (req.body || {}) as Etapa1Body

  // 1. Validações -----------------------------------------------------------
  const cleanName = (name || '').trim()
  const cleanEmail = (email || '').trim().toLowerCase()
  const cleanCompany = (company || '').trim()
  const whatsappLocal = phoneDigits(whatsapp || '') // 11 dígitos (DDD + 9 + número)

  if (!cleanName) return badRequest(res, 'Informe seu nome.')
  if (!cleanEmail || !isValidEmailFormat(cleanEmail)) {
    return badRequest(res, 'E-mail inválido. Verifique o endereço digitado.')
  }
  if (!isValidBrazilianMobile(whatsappLocal)) {
    return badRequest(res, 'WhatsApp inválido. Informe um celular com DDD, ex.: (11) 91234-5678.')
  }
  if (!password || password.length < MIN_PASSWORD_LEN) {
    return badRequest(res, `A senha deve ter ao menos ${MIN_PASSWORD_LEN} caracteres.`)
  }
  if (consent !== true) {
    return badRequest(res, 'É necessário aceitar o consentimento para prosseguir.')
  }

  const mx = await verifyEmailDomainHasMx(cleanEmail)
  if (!mx.ok) {
    return badRequest(res, 'O domínio do e-mail não recebe mensagens. Confira o endereço digitado.')
  }

  // WhatsApp no formato de armazenamento do lead: 55 + DDD + número (13 dígitos).
  const whatsappStored = `55${whatsappLocal}`

  try {
    // 2. Guarda de reentrada: e-mail já existe no Auth? --------------------
    const { data: listData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
    const existingAuthUser = listData?.users?.find(
      (u) => u.email?.toLowerCase() === cleanEmail
    )
    if (existingAuthUser) {
      // Conta já existe. Não recriamos nem sobrescrevemos senha (seria falha de
      // segurança). O usuário deve fazer login — o guard leva PENDING_PAYMENT a /assinar.
      return res.status(409).json({
        error: 'Já existe uma conta com este e-mail. Faça login para continuar.',
        code: 'EMAIL_EXISTS',
      })
    }

    // 3. Cria tenant PENDING_PAYMENT via RPC (cria tenant_settings/expense_config) --
    // A RPC usa p_admin_name como nome do tenant; passamos a empresa (ou o nome da
    // pessoa como fallback). O nome da PESSOA vai no metadata do auth user (passo 4).
    const tenantName = cleanCompany || cleanName
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('create_tenant_from_stripe', {
      p_name: tenantName,
      p_admin_email: cleanEmail,
      p_admin_name: tenantName,
      p_stripe_customer_id: null,
      p_stripe_subscription_id: null,
      p_revenue_tier: null,
      p_plan_slug: null,
      p_plan_status: 'PENDING_PAYMENT',
      p_trial_ends_at: null,
    })

    if (rpcError) {
      console.error('cadastro/etapa1: erro ao criar tenant', rpcError?.message)
      return res.status(500).json({ error: 'Não foi possível criar a conta. Tente novamente.' })
    }

    const tenantId = (rpcData as { tenant_id?: string })?.tenant_id
    if (!tenantId) {
      console.error('cadastro/etapa1: RPC não retornou tenant_id')
      return res.status(500).json({ error: 'Não foi possível criar a conta. Tente novamente.' })
    }

    // 4. Cria auth.users com senha (trigger popula public.users no tenant) ----
    const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: true,
      user_metadata: {
        tenant_id: tenantId,
        role: 'admin',
        from_admin_invite: 'true',
        name: cleanName,
        phone: whatsappLocal,
      },
    })

    if (createError || !createData?.user?.id) {
      console.error('cadastro/etapa1: erro ao criar usuário', createError?.message)
      await cleanupTenant(tenantId)
      return res.status(500).json({ error: 'Não foi possível criar a conta. Tente novamente.' })
    }

    const userId = createData.user.id

    // 5. Vincula tenant_owners (trigger Caso 1 não insere aqui) --------------
    const { error: ownerErr } = await supabaseAdmin
      .from('tenant_owners')
      .upsert({ tenant_id: tenantId, user_id: userId }, { onConflict: 'tenant_id' })
    if (ownerErr) {
      // Não bloqueia o cadastro — o dono pode ser reconciliado depois — mas registra.
      console.warn('cadastro/etapa1: falha ao vincular tenant_owners:', ownerErr.message)
    }

    // 6. Upsert do lead por e-mail, apontando o tenant recém-criado ----------
    const nowIso = new Date().toISOString()
    const { data: leadRow, error: leadErr } = await supabaseAdmin
      .from('leads')
      .upsert(
        {
          nome: cleanName,
          email: cleanEmail,
          whatsapp: whatsappStored,
          empresa: cleanCompany || null,
          origem_lead: (origemLead || '').trim() || null,
          utm_source: (utmSource || '').trim() || null,
          utm_medium: (utmMedium || '').trim() || null,
          utm_campaign: (utmCampaign || '').trim() || null,
          utm_content: (utmContent || '').trim() || null,
          consentimento_em: nowIso,
          consentimento_versao: (consentVersion || '').trim() || CONSENT_VERSION_DEFAULT,
          tenant_id: tenantId,
          status_lead: 'cadastrado',
          updated_at: nowIso,
        },
        { onConflict: 'email' }
      )
      .select('id')
      .single()

    if (leadErr) {
      // Lead é complementar (funil/remarketing); não impede o cadastro em si.
      console.warn('cadastro/etapa1: falha ao gravar lead:', leadErr.message)
    }

    // 7. Grava tenants.lead_id de volta --------------------------------------
    if (leadRow?.id) {
      const { error: linkErr } = await supabaseAdmin
        .from('tenants')
        .update({ lead_id: leadRow.id })
        .eq('id', tenantId)
      if (linkErr) console.warn('cadastro/etapa1: falha ao gravar tenants.lead_id:', linkErr.message)
    }

    return res.status(200).json({ tenantId, email: cleanEmail })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown'
    console.error('cadastro/etapa1: erro inesperado:', msg)
    return res.status(500).json({ error: 'Erro inesperado ao criar a conta. Tente novamente.' })
  }
}

/**
 * Cleanup best-effort de um tenant recém-criado (quando a criação do usuário
 * falha depois da RPC). Remove as linhas-filhas que a RPC cria e o próprio
 * tenant. Erros aqui são apenas logados — não há o que fazer além disso.
 */
async function cleanupTenant(tenantId: string): Promise<void> {
  try {
    await supabaseAdmin.from('tenant_expense_config').delete().eq('tenant_id', tenantId)
    await supabaseAdmin.from('tenant_settings').delete().eq('tenant_id', tenantId)
    await supabaseAdmin.from('tenants').delete().eq('id', tenantId)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'unknown'
    console.warn('cadastro/etapa1: cleanup do tenant órfão falhou:', msg)
  }
}
