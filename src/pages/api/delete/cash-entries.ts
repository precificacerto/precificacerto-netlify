import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/supabase/admin'
import { getCallerContext } from '@/lib/get-caller-tenant'
import { podeEditarModulo } from '@/lib/permissao-do-modulo'

/**
 * A desativação de UM lançamento. O comportamento desta rota NÃO mudou em 23/09/2026:
 * mesmas consultas, mesmos códigos, mesmas mensagens. O que saiu daqui foi a checagem de
 * permissão, que virou `permissao-do-modulo.ts` para que a rota de SÉRIE a leia em vez de
 * copiá-la (`copia-divergente.md`: o remédio não é conferir as duas, é apagar uma).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const caller = await getCallerContext(req, res)
  if (!caller) return

  const { id } = req.body
  if (!id) return res.status(400).json({ error: 'id é obrigatório' })

  try {
    const { data: entry } = await supabaseAdmin
      .from('cash_entries')
      .select('id, tenant_id')
      .eq('id', id)
      .eq('tenant_id', caller.tenant_id)
      .single()

    if (!entry) return res.status(404).json({ error: 'Lançamento não encontrado' })

    // A ORDEM é a de sempre: 404 antes de 403. Uniformizá-la com a rota de série mudaria o
    // código devolvido em casos que ninguém pediu para mudar.
    if (!(await podeEditarModulo(caller, 'cash_flow'))) {
      return res.status(403).json({ error: 'Sem permissão para excluir lançamentos' })
    }

    const { error } = await supabaseAdmin
      .from('cash_entries')
      .update({ is_active: false })
      .eq('id', id)
      .eq('tenant_id', caller.tenant_id)
    if (error) throw error

    return res.status(200).json({ success: true })
  } catch (error: any) {
    console.error('Deactivate cash entry error:', error?.message || 'Unknown error')
    return res.status(500).json({ error: error.message || 'Erro ao desativar lançamento' })
  }
}
