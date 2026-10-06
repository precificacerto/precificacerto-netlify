/**
 * GET /api/public/agenda/[token]/horarios?barbeiro=ID&servico=ID&dia=YYYY-MM-DD
 *
 * Os horários saem de `horariosDisponiveis`, a MESMA função que o POST usa para conferir. Se a
 * conferência tivesse critério próprio, bastaria uma divergência para o POST aceitar um horário
 * que esta rota nunca ofereceu.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/supabase/admin'
import { CORPO_INDISPONIVEL, barbeiroValido, contextoDoToken, servicosDoBarbeiro } from '@/lib/agendamento-publico'
import { horariosDisponiveis, instanteDoRelogioLocal } from '@/utils/horarios-disponiveis'

const DIA_RE = /^\d{4}-\d{2}-\d{2}$/

/** Lê grade, ausências e ocupados e devolve os horários. Compartilhado com o POST de propósito. */
export async function calcularHorarios(
  tenant_id: string, employee_id: string, duracaoMin: number, dia: string,
  grid_minutes: number, lead_time_min: number, horizon_days: number, agora: Date,
): Promise<string[]> {
  const { data: faixas, error: e1 } = await supabaseAdmin
    .from('employee_working_hours')
    .select('weekday, start_time, end_time, is_active')
    .eq('tenant_id', tenant_id).eq('employee_id', employee_id)
  if (e1) throw e1

  const { data: ausencias, error: e2 } = await supabaseAdmin
    .from('employee_time_off')
    .select('starts_at, ends_at')
    .eq('tenant_id', tenant_id).eq('employee_id', employee_id)
  if (e2) throw e2

  // A janela é o dia local inteiro, com folga de um dia para cada lado: um atendimento que começa
  // 23:30 atravessa a meia-noite, e cortar exatamente no dia perderia a sobreposição.
  const de = new Date(instanteDoRelogioLocal(dia, 0).getTime() - 86400000).toISOString()
  const ate = new Date(instanteDoRelogioLocal(dia, 0).getTime() + 2 * 86400000).toISOString()

  const { data: ocupados, error: e3 } = await supabaseAdmin
    .from('calendar_events')
    .select('start_time, end_time')
    .eq('tenant_id', tenant_id).eq('employee_id', employee_id)
    .eq('is_active', true)
    .neq('status', 'CANCELLED')      // cancelado libera o horário
    .gte('start_time', de).lte('start_time', ate)
  if (e3) throw e3

  return horariosDisponiveis({
    faixas: ((faixas ?? []) as any[]).filter((f) => f.is_active !== false),
    ausencias: (ausencias ?? []) as any[],
    ocupados: ((ocupados ?? []) as any[]).map((o) => ({ starts_at: o.start_time, ends_at: o.end_time })),
    dia, duracaoMin, passoMin: grid_minutes,
    antecedenciaMin: lead_time_min, horizonteDias: horizon_days, agora,
  })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json(CORPO_INDISPONIVEL)
  try {
    const ctx = await contextoDoToken(req.query.token)
    if (!ctx) return res.status(404).json(CORPO_INDISPONIVEL)

    const barbeiro = await barbeiroValido(ctx.tenant_id, req.query.barbeiro)
    if (!barbeiro) return res.status(404).json(CORPO_INDISPONIVEL)

    const dia = String(req.query.dia ?? '')
    if (!DIA_RE.test(dia)) return res.status(400).json(CORPO_INDISPONIVEL)

    const servicos = await servicosDoBarbeiro(ctx.tenant_id, barbeiro)
    if (!servicos) return res.status(409).json(CORPO_INDISPONIVEL)
    const svc = servicos.find((s) => s.id === String(req.query.servico ?? ''))
    if (!svc) return res.status(404).json(CORPO_INDISPONIVEL)

    const horarios = await calcularHorarios(
      ctx.tenant_id, barbeiro, svc.duracaoMin, dia,
      ctx.grid_minutes, ctx.lead_time_min, ctx.horizon_days, new Date(),
    )
    return res.status(200).json(horarios)
  } catch (e: any) {
    console.error('[public/agenda] horarios:', e?.message || 'Unknown error')
    return res.status(500).json(CORPO_INDISPONIVEL)
  }
}
