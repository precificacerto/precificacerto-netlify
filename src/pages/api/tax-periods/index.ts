import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/supabase/admin'
import { getCallerContext } from '@/lib/get-caller-tenant'
import type { TaxRatePeriod, TaxType } from '@/types/mrm'

/**
 * GET /api/tax-periods?date=YYYY-MM-DD&tax_type=ICMS&origin_state=SP&dest_state=RJ
 *
 * Retorna alíquotas tributárias vigentes na data informada para o tenant do caller.
 *
 * Query params (todos opcionais):
 *   - date         : YYYY-MM-DD (default: hoje)
 *   - tax_type     : filtro por tributo (ICMS, PIS, COFINS, ISS, IPI, ICMS_ST, DIFAL, FCP, IBS, CBS, ISS_RETIDO)
 *   - origin_state : UF de origem (interestadual)
 *   - dest_state   : UF de destino (interestadual)
 *
 * Resposta:
 *   { date: string, rates: TaxRatePeriod[] }
 *
 * Vigência: rate é considerada vigente se valid_from <= date AND (valid_until IS NULL OR valid_until >= date).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const caller = await getCallerContext(req, res)
  if (!caller) return

  const date = typeof req.query.date === 'string' && req.query.date
    ? req.query.date
    : new Date().toISOString().slice(0, 10)

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Invalid date format. Expected YYYY-MM-DD.' })
  }

  const tax_type = typeof req.query.tax_type === 'string' ? (req.query.tax_type as TaxType) : null
  const origin_state = typeof req.query.origin_state === 'string' ? req.query.origin_state.toUpperCase() : null
  const dest_state = typeof req.query.dest_state === 'string' ? req.query.dest_state.toUpperCase() : null

  let query = supabaseAdmin
    .from('tax_rates_periods')
    .select('id, tenant_id, tax_type, origin_state, dest_state, rate_pct, valid_from, valid_until, notes')
    .eq('tenant_id', caller.tenant_id)
    .lte('valid_from', date)
    .or(`valid_until.is.null,valid_until.gte.${date}`)

  if (tax_type) query = query.eq('tax_type', tax_type)
  if (origin_state) query = query.eq('origin_state', origin_state)
  if (dest_state) query = query.eq('dest_state', dest_state)

  const { data, error } = await query

  if (error) {
    return res.status(500).json({ error: error.message })
  }

  return res.status(200).json({
    date,
    rates: (data ?? []) as TaxRatePeriod[],
  })
}
