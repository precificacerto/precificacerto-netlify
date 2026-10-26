/**
 * GET /api/super-admin/atendimentos-ia/tabelas/[id]/conteudo — o que a importação gravou para a
 * tabela: as tipologias e o total de fórmulas da linha.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * REGRA INVIOLÁVEL: a tela mostra apenas o nome da conta e a configuração do Atendimentos I.A.
 * Nada do conteúdo da conta — nem clientes, nem orçamentos, nem funcionários, nem valores. O
 * super admin não tem tenant e não pode enxergar dado de cliente por construção.
 * ══════════════════════════════════════════════════════════════════════════════════════════
 *
 * A ORDEM é a proporção de condicionais, da maior para a menor (`ordenarPorProporcaoDeCondicionais`),
 * feita AQUI: a tela recebe a lista ordenada e não calcula nada (dono do produto, 20/10/2026).
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import { contarFormulas, falhaInterna, listarTipologias, obterArquivosDaTabela } from '@/lib/atendimentos-ia/repositorio'
import { ehUuid } from '@/utils/atendimentos-ia-catalogo'
import { ordenarPorProporcaoDeCondicionais } from '@/utils/atendimentos-ia-importacao-apresentacao'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const caller = await requireSuperAdmin(req, res)
  if (!caller) return

  const { id } = req.query as { id?: string }
  if (!ehUuid(id)) return res.status(400).json({ error: 'Tabela inválida.' })

  try {
    if (!(await obterArquivosDaTabela(id))) return res.status(404).json({ error: 'Tabela não encontrada.' })
    const [tipologias, formulas] = await Promise.all([listarTipologias(id), contarFormulas(id)])
    return res.status(200).json({ tipologias: ordenarPorProporcaoDeCondicionais(tipologias), formulas })
  } catch (e) {
    return falhaInterna(res, 'conteúdo da tabela', e, 'Não foi possível ler o conteúdo da tabela.')
  }
}
