/**
 * PATCH  /api/super-admin/atendimentos-ia/etapas/[id] — `{ nome, acao, abas }`: EDITA o item do catálogo — renomear, trocar a ação e as abas —,
 *        também COM uso: o item é o mesmo para toda conta que o seleciona, e a resposta da tela diz quantas o usam.
 * DELETE /api/super-admin/atendimentos-ia/etapas/[id] — REMOVE o item sem uso.
 *
 * Dono do produto, 31/10/2026: "Remover etapa do catálogo que alguma conta usa é RECUSA NOMEADA (empresa · família · número), nunca cascata." As
 * funções são `superadmin_editar_etapa_do_catalogo` e `superadmin_remover_etapa_do_catalogo` (migração 20261031000002), com log. A FK da etapa da
 * conta para o item é ON DELETE RESTRICT.
 *   - EDITAR: a rota confere o que dá frase em português — o item existe (404), o nome não é o de OUTRO (409, sem olhar a caixa), a forma do corpo
 *     (400) e algo mudou (400); a função confere de novo.
 *   - REMOVER: a rota nomeia o uso (409, empresa · família · etapa N) antes de chamar a função; a função conta de novo com o item travado, e a recusa
 *     dela numa corrida volta com a frase dela (22023 → 409).
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import { codigoDoErro, falhaInterna } from '@/lib/atendimentos-ia/repositorio'
import { editarEtapaDoCatalogo, lerCatalogoDeEtapas, removerEtapaDoCatalogo } from '@/lib/atendimentos-ia/etapas-da-familia'
import { ehUuid } from '@/utils/atendimentos-ia-catalogo'
import {
  ETAPA_DO_CATALOGO_INEXISTENTE, ETAPA_DO_CATALOGO_QUE_NAO_MUDOU, etapaDoCatalogoMudou, fraseDaEtapaDoCatalogoComNomeRepetido, fraseDaEtapaDoCatalogoEmUso,
  lerCorpoDaEtapaDoCatalogo,
} from '@/utils/atendimentos-ia-etapas'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH' && req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' })

  const caller = await requireSuperAdmin(req, res)
  if (!caller) return

  const { id } = req.query as { id?: string }
  if (!ehUuid(id)) return res.status(404).json({ error: ETAPA_DO_CATALOGO_INEXISTENTE })

  if (req.method === 'PATCH') {
    const leitura = lerCorpoDaEtapaDoCatalogo(req.body)
    if (leitura.ok === false) return res.status(400).json({ error: leitura.erro })
    const ed = leitura.corpo
    try {
      const todos = await lerCatalogoDeEtapas({ usos: false })
      const atual = todos.find((c) => c.id === id)
      if (!atual) return res.status(404).json({ error: ETAPA_DO_CATALOGO_INEXISTENTE })
      const igual = todos.find((c) => c.id !== id && c.nome.toLocaleLowerCase('pt-BR') === ed.nome.toLocaleLowerCase('pt-BR'))
      if (igual) return res.status(409).json({ error: fraseDaEtapaDoCatalogoComNomeRepetido(igual.nome) })
      if (!etapaDoCatalogoMudou(atual, ed)) return res.status(400).json({ error: ETAPA_DO_CATALOGO_QUE_NAO_MUDOU })
      return res.status(200).json(await editarEtapaDoCatalogo({ por: caller.user_id, id, ...ed }))
    } catch (e) {
      return recusaDaFuncao(res, e, 'etapa do catalogo PATCH', 'Não foi possível editar a etapa.')
    }
  }

  try {
    const atual = (await lerCatalogoDeEtapas()).find((c) => c.id === id)
    if (!atual) return res.status(404).json({ error: ETAPA_DO_CATALOGO_INEXISTENTE })
    if (atual.usos.length > 0) return res.status(409).json({ error: fraseDaEtapaDoCatalogoEmUso(atual.nome, atual.usos) })
    return res.status(200).json(await removerEtapaDoCatalogo({ por: caller.user_id, id }))
  } catch (e) {
    return recusaDaFuncao(res, e, 'etapa do catalogo DELETE', 'Não foi possível remover a etapa.')
  }
}

/** A recusa da função vai com a frase dela (22023 → 409; P0002 → 404; 42501 → 403); outro erro é 500, sem o texto do banco. */
function recusaDaFuncao(res: NextApiResponse, e: unknown, contexto: string, mensagem: string) {
  const codigo = codigoDoErro(e)
  if (codigo === 'P0002') return res.status(404).json({ error: ETAPA_DO_CATALOGO_INEXISTENTE })
  if (codigo === '42501') return res.status(403).json({ error: 'Só o super admin altera o catálogo.' })
  if (codigo === '22023' && e instanceof Error && e.message.trim() !== '') return res.status(409).json({ error: e.message })
  return falhaInterna(res, contexto, e, mensagem)
}
