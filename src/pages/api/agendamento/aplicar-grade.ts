/**
 * POST /api/agendamento/aplicar-grade — copia a grade de um funcionário para vários.
 *
 * >>> ROTA AUTENTICADA. O `tenant_id` VEM DO PERFIL, NUNCA DO CORPO. <<<
 * Aceitá-lo do cliente deixaria um autenticado reescrever a grade de outro salão.
 *
 * A sequência compensada por destino — e a razão de a ordem ser inserir-depois-apagar — vive em
 * `@/utils/aplicar-grade`, com repositório injetado. Esta rota é só o repositório sobre o
 * Supabase mais a autenticação: a lógica está lá para que o portão possa EXECUTÁ-LA e afirmar o
 * estado final das faixas, em vez de afirmar o texto deste arquivo (`portao-que-nao-alcanca.md`).
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/supabase/admin'
import { getCallerContext } from '@/lib/get-caller-tenant'
import {
  aplicarGradeEmDestinos,
  type FaixaParaCopiar,
  type FaixaPersistida,
  type RepositorioDaGrade,
} from '@/utils/aplicar-grade'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const caller = await getCallerContext(req, res)
  if (!caller) return

  const tenant_id = caller.tenant_id
  const { origem_id, destino_ids } = (req.body ?? {}) as { origem_id?: string; destino_ids?: string[] }

  if (!origem_id) return res.status(400).json({ error: 'origem_id é obrigatório' })
  if (!Array.isArray(destino_ids) || destino_ids.length === 0) {
    return res.status(400).json({ error: 'destino_ids é obrigatório' })
  }
  if (destino_ids.includes(origem_id)) {
    return res.status(400).json({ error: 'A origem não pode ser um dos destinos' })
  }

  // O `tenant_id` entra em TODA operação do repositório. A RLS já isola, mas o `supabaseAdmin`
  // passa por cima dela — aqui o filtro é a única proteção que resta.
  const repo: RepositorioDaGrade = {
    lerFaixas: async (employee_id: string): Promise<FaixaPersistida[]> => {
      const { data, error } = await supabaseAdmin
        .from('employee_working_hours')
        .select('id, employee_id, weekday, start_time, end_time, is_active')
        .eq('tenant_id', tenant_id)
        .eq('employee_id', employee_id)
      if (error) throw error
      return (data ?? []) as FaixaPersistida[]
    },
    inserirFaixas: async (employee_id: string, faixas: FaixaParaCopiar[]): Promise<string[]> => {
      const { data, error } = await supabaseAdmin
        .from('employee_working_hours')
        .insert(faixas.map((f) => ({
          tenant_id,
          employee_id,
          weekday: f.weekday,
          start_time: f.start_time,
          end_time: f.end_time,
          is_active: f.is_active !== false,
        })))
        .select('id')
      if (error) throw error
      return (data ?? []).map((r: any) => r.id)
    },
    apagarFaixas: async (ids: string[]): Promise<void> => {
      const { error } = await supabaseAdmin
        .from('employee_working_hours')
        .delete()
        .eq('tenant_id', tenant_id)
        .in('id', ids)
      if (error) throw error
    },
  }

  try {
    const resultados = await aplicarGradeEmDestinos(repo, origem_id, destino_ids)
    const algumFalhou = resultados.some((r) => !r.aplicado)
    return res.status(algumFalhou ? 207 : 200).json({ resultados })
  } catch (error: any) {
    console.error('Aplicar grade de agendamento:', error?.message || 'Unknown error')
    return res.status(500).json({ error: error?.message || 'Internal server error' })
  }
}
