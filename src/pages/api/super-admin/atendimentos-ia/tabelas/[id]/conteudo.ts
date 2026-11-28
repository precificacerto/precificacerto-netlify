/**
 * GET /api/super-admin/atendimentos-ia/tabelas/[id]/conteudo — o que a importação gravou para a
 * tabela: as tipologias, o total de fórmulas da linha e os ITENS de preço gravados (`itens`, 02/11/2026: é com ele que a tela diz
 * "não importada" — a contagem do banco, não a da última importação, porque a importação recusada não deixa registro).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * REGRA INVIOLÁVEL: a tela mostra apenas o nome da conta e a configuração do Atendimentos I.A.
 * Nada do conteúdo da conta — nem clientes, nem orçamentos, nem funcionários, nem valores. O
 * super admin não tem tenant e não pode enxergar dado de cliente por construção.
 * ══════════════════════════════════════════════════════════════════════════════════════════
 *
 * `perfis_por_cor` (pedido 0055): as abas por cor, o quadro cor × referências e o que falta em cada cor contra o BRANCO — só quando há item com cor.
 *
 * A ORDEM é a proporção de condicionais, da maior para a menor (`ordenarPorProporcaoDeCondicionais`),
 * feita AQUI: a tela recebe a lista ordenada e não calcula nada (dono do produto, 20/10/2026).
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import { contarFormulas, contarItensDaTabela, falhaInterna, itensDePerfisDaTabela, listarTipologias, obterArquivosDaTabela } from '@/lib/atendimentos-ia/repositorio'
import { perfisPorCor } from '@/utils/atendimentos-ia-abas-por-cor'
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
    const [tipologias, formulas, itens, doPreco] = await Promise.all([listarTipologias(id), contarFormulas(id), contarItensDaTabela(id), itensDePerfisDaTabela(id)])
    // as ABAS POR COR (pedido 0055): só quando algum item tem cor; a tabela sem cor não leva a chave (ausente não é "zero cores")
    const perfis = perfisPorCor(doPreco)
    return res.status(200).json({ tipologias: ordenarPorProporcaoDeCondicionais(tipologias), formulas, itens, ...(perfis ? { perfis_por_cor: perfis } : {}) })
  } catch (e) {
    return falhaInterna(res, 'conteúdo da tabela', e, 'Não foi possível ler o conteúdo da tabela.')
  }
}
