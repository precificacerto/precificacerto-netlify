/**
 * GET  /api/super-admin/atendimentos-ia/contas/[tenantId]/tabelas — as tabelas em uso pela
 *      conta, e os fornecedores DO NICHO DELA com as tabelas de cada um.
 * POST /api/super-admin/atendimentos-ia/contas/[tenantId]/tabelas — põe uma tabela em uso:
 *      `{ tabela_id }`.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * REGRA INVIOLÁVEL: a tela mostra apenas o nome da conta e a configuração do Atendimentos I.A.
 * Nada do conteúdo da conta — nem clientes, nem orçamentos, nem funcionários, nem valores. O
 * super admin não tem tenant e não pode enxergar dado de cliente por construção. Esta rota não
 * lê `tenants`: devolve só catálogo.
 * ══════════════════════════════════════════════════════════════════════════════════════════
 *
 * A CASCATA (dono do produto): "escolho a segmentação, e aí eu tenho todos os fornecedores
 * daquela segmentação; escolho a tabela daquele fornecedor".
 * (dito em 19/10/2026; citação, mantida como foi dita. O vocabulário da área foi decidido
 * depois, em 20/10/2026: na área, a palavra é MODELO — EPIC §11.)
 * O nicho é o SALVO da conta, lido
 * aqui — não o que a tela diz. Nicho sem fornecedor, ou conta sem nicho: lista VAZIA, nunca a da
 * plataforma.
 *
 * SÓ FABRICAÇÃO USA TABELA (decisão do dono do produto, 19/10/2026; aplicada em 20/10/2026 —
 * `MODELO_COM_FORNECEDOR`): conta de Revenda ou de Prestação de serviço não recebe fornecedor na
 * lista e tem a inclusão recusada (409), dizendo por quê. A tela esconde o grupo; a rota fecha a
 * porta dos fundos.
 *
 * A TRAVA DO NICHO É DA ROTA, não só da tela: tabela de fornecedor de outro nicho é recusada
 * (409) antes de qualquer escrita. O banco não tem essa trava — `orcamentista_conta_tabela` não
 * referencia o nicho —, e um POST feito fora da tela passaria sem ela.
 *
 * Os erros do banco seguem a convenção da área: 23505 (já em uso) e 23503 (a tabela ou a conta
 * sumiu entre a conferência e a escrita) → 409; 23502 → 400; o resto → 500 com a causa no log.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import {
  adicionarTabelaNaConta,
  codigoDoErro,
  falhaInterna,
  listarFornecedoresDoNicho,
  listarTabelasDaConta,
  obterModeloENichoDaConta,
  obterTabelaComNicho,
} from '@/lib/atendimentos-ia/repositorio'
import {
  ehUuid,
  fraseDoModeloSemFornecedor,
  lerPedidoDeTabelaDaConta,
  recusada,
  usaTabelaDeFornecedor,
  type ModeloSemFornecedor,
  type TabelasDaConta,
} from '@/utils/atendimentos-ia-catalogo'

const SEM_CONFIGURACAO = 'Esta conta não tem o Atendimentos I.A. configurado. Ligue em Tenants primeiro.'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const caller = await requireSuperAdmin(req, res)
  if (!caller) return

  const { tenantId } = req.query as { tenantId?: string }
  if (!ehUuid(tenantId)) return res.status(400).json({ error: 'Conta inválida.' })

  if (req.method === 'GET') {
    try {
      const seg = await obterModeloENichoDaConta(tenantId)
      if (!seg) return res.status(404).json({ error: SEM_CONFIGURACAO })
      const corpo: TabelasDaConta = {
        nicho_id: seg.nicho_id,
        em_uso: await listarTabelasDaConta(tenantId),
        fornecedores: seg.nicho_id && usaTabelaDeFornecedor(seg.modelo) ? await listarFornecedoresDoNicho(seg.nicho_id) : [],
      }
      return res.status(200).json(corpo)
    } catch (e) {
      return falhaInterna(res, 'tabelas da conta GET', e, 'Não foi possível ler as tabelas da conta.')
    }
  }

  const leitura = lerPedidoDeTabelaDaConta(req.body)
  if (recusada(leitura)) return res.status(400).json({ error: leitura.erro })
  const { tabela_id } = leitura.corpo

  try {
    const seg = await obterModeloENichoDaConta(tenantId)
    if (!seg) return res.status(404).json({ error: SEM_CONFIGURACAO })
    // O modelo vem ANTES do nicho: a uma conta de Revenda sem nicho, pedir o nicho mandaria
    // escolher algo que não a deixaria usar tabela de qualquer jeito.
    if (seg.modelo && !usaTabelaDeFornecedor(seg.modelo)) {
      return res.status(409).json({ error: fraseDoModeloSemFornecedor(seg.modelo as ModeloSemFornecedor) })
    }
    if (!seg.nicho_id) return res.status(400).json({ error: 'Escolha e salve o modelo e o nicho da conta antes de escolher as tabelas.' })
    const t = await obterTabelaComNicho(tabela_id)
    if (!t) return res.status(404).json({ error: 'Tabela não encontrada.' })
    if (t.nicho_id !== seg.nicho_id) {
      return res.status(409).json({ error: `A tabela “${t.arquivo_nome}” é do fornecedor “${t.fornecedor_nome}”, de outro nicho. Esta conta usa só os fornecedores do nicho dela.` })
    }
    await adicionarTabelaNaConta({ tenant_id: tenantId, tabela_id, criado_por: caller.user_id })
    return res.status(201).json({ ok: true })
  } catch (e) {
    const codigo = codigoDoErro(e)
    if (codigo === '23505') return res.status(409).json({ error: 'Esta tabela já está em uso nesta conta.' })
    if (codigo === '23503') return res.status(409).json({ error: 'A tabela ou a conta deixou de existir enquanto você escolhia. Recarregue a página.' })
    if (codigo === '23502') return res.status(400).json({ error: 'O banco recusou a inclusão: falta um campo obrigatório.' })
    return falhaInterna(res, 'tabelas da conta POST', e, 'Não foi possível pôr a tabela em uso.')
  }
}
