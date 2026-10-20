/**
 * DELETE /api/super-admin/atendimentos-ia/contas/[tenantId]/tabelas/[tabelaId] — tira UMA
 * tabela de uso DAQUELA conta. A tabela continua no catálogo; só a linha de
 * `orcamentista_conta_tabela` sai, filtrada pelas duas chaves.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * REGRA INVIOLÁVEL: a tela mostra apenas o nome da conta e a configuração do Atendimentos I.A.
 * Nada do conteúdo da conta — nem clientes, nem orçamentos, nem funcionários, nem valores. O
 * super admin não tem tenant e não pode enxergar dado de cliente por construção.
 * ══════════════════════════════════════════════════════════════════════════════════════════
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import { falhaInterna, removerTabelaDaConta } from '@/lib/atendimentos-ia/repositorio'
import { ehUuid } from '@/utils/atendimentos-ia-catalogo'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' })

  const caller = await requireSuperAdmin(req, res)
  if (!caller) return

  const { tenantId, tabelaId } = req.query as { tenantId?: string; tabelaId?: string }
  if (!ehUuid(tenantId) || !ehUuid(tabelaId)) return res.status(400).json({ error: 'Conta ou tabela inválida.' })

  try {
    const n = await removerTabelaDaConta(tenantId, tabelaId)
    if (n === 0) return res.status(404).json({ error: 'Esta tabela não está em uso nesta conta.' })
    return res.status(200).json({ ok: true })
  } catch (e) {
    return falhaInterna(res, 'tabela da conta DELETE', e, 'Não foi possível tirar a tabela de uso.')
  }
}
