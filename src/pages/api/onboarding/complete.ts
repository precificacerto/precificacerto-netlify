import { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/supabase/admin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const token = req.cookies.token
    if (!token) {
      return res.status(401).json({ error: 'Não autenticado' })
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (authError || !user) {
      return res.status(401).json({ error: 'Token inválido' })
    }

    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('tenant_id')
      .eq('id', user.id)
      .single()

    if (!profile?.tenant_id) {
      return res.status(400).json({ error: 'Tenant não encontrado' })
    }

    const { company, settings } = req.body

    const { error: tenantError } = await supabaseAdmin
      .from('tenants')
      .update({
        name: company.name,
        cnpj_cpf: company.cnpj_cpf,
        segment: company.segment,
        email: company.email || null,
        phone: company.phone || null,
        cep: company.cep || null,
        street: company.street || null,
        number: company.number || null,
        complement: company.complement || null,
        neighborhood: company.neighborhood || null,
        city: company.city || null,
        state_code: company.state_code || null,
      })
      .eq('id', profile.tenant_id)

    if (tenantError) throw tenantError

    const settingsUpdate: Record<string, any> = {
      tax_regime: settings.tax_regime,
      calc_type: settings.calc_type,
      cashflow_setup_done: true,
      expense_setup_done: true,
      state_code: company.state_code || null,
      cnae_code: settings.cnae_code || null,
      simples_anexo: settings.simples_anexo || null,
      simples_revenue_12m: settings.simples_revenue_12m || 0,
      workload_unit: settings.workload_unit || 'HOURS',
      monthly_workload: settings.monthly_workload || 0,
      num_productive_employees: settings.num_productive_employees || 1,
      num_commercial_employees: settings.num_commercial_employees || 0,
      num_administrative_employees: settings.num_administrative_employees || 0,
      administrative_monthly_workload: settings.administrative_monthly_workload || 176,
      icms_contribuinte: settings.icms_contribuinte ?? false,
      inscricao_estadual: settings.inscricao_estadual || null,
      ie_state_code: settings.ie_state_code || null,
      sales_scope: settings.sales_scope || 'INTRAESTADUAL',
      buyer_type: settings.buyer_type || 'CONSUMIDOR_FINAL',
    }

    const { error: settingsError } = await supabaseAdmin
      .from('tenant_settings')
      .update(settingsUpdate)
      .eq('tenant_id', profile.tenant_id)

    if (settingsError) {
      if (settingsError.message?.includes('inscricao_estadual') ||
          settingsError.message?.includes('ie_state_code') ||
          settingsError.message?.includes('sales_scope') ||
          settingsError.message?.includes('buyer_type')) {
        const { inscricao_estadual, ie_state_code, sales_scope, buyer_type, ...fallbackUpdate } = settingsUpdate
        const { error: fallbackError } = await supabaseAdmin
          .from('tenant_settings')
          .update(fallbackUpdate)
          .eq('tenant_id', profile.tenant_id)

        if (fallbackError) throw fallbackError
        console.warn('Colunas novas não existem ainda. Salvou dados parciais.')
      } else {
        throw settingsError
      }
    }

    return res.json({ success: true })
  } catch (error: any) {
    console.error('Erro no onboarding:', error?.message || 'Unknown error')
    return res.status(500).json({ error: error.message || 'Erro inesperado' })
  }
}
