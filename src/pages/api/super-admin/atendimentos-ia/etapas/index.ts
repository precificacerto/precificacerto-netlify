/**
 * GET  /api/super-admin/atendimentos-ia/etapas — o CATÁLOGO DE ETAPAS, na ordem, cada item com o nome, a ação, as abas e QUEM USA
 *      (empresa · família · número da etapa).
 * POST /api/super-admin/atendimentos-ia/etapas — `{ nome, acao, abas }`: acrescenta um item no FIM da lista.
 *
 * A ETAPA VIRA ITEM DE CATÁLOGO (dono do produto, 31/10/2026; migração 20261031000002): "Vamos criar a aba das etapas para que a gente consiga
 * partir dela, alimentar ela, fazer as integrações, as divisões corretas, informando onde vai cada coisa". O item é GLOBAL, como o catálogo de
 * famílias (sem nicho — a mesma dívida, registrada na regra); a etapa da conta o SELECIONA e guarda a instrução, o número e o motor. Editar e
 * remover moram em `etapas/[id]`.
 *
 * A ROTA confere o que dá frase em português — a forma do corpo (`lerCorpoDaEtapaDoCatalogo`) e o nome repetido, sem olhar a caixa —, e a FUNÇÃO
 * (`superadmin_criar_etapa_do_catalogo`, que loga e calcula a ordem sob trava) confere de novo: a recusa dela numa corrida volta com a frase dela
 * (22023 → 409). Só o super admin.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import { codigoDoErro, falhaInterna } from '@/lib/atendimentos-ia/repositorio'
import { criarEtapaDoCatalogo, lerCatalogoDeEtapas } from '@/lib/atendimentos-ia/etapas-da-familia'
import { fraseDaEtapaDoCatalogoComNomeRepetido, lerCorpoDaEtapaDoCatalogo } from '@/utils/atendimentos-ia-etapas'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const caller = await requireSuperAdmin(req, res)
  if (!caller) return

  if (req.method === 'GET') {
    try {
      return res.status(200).json(await lerCatalogoDeEtapas())
    } catch (e) {
      return falhaInterna(res, 'etapas do catalogo GET', e, 'Não foi possível ler o catálogo de etapas.')
    }
  }

  const leitura = lerCorpoDaEtapaDoCatalogo(req.body)
  if (leitura.ok === false) return res.status(400).json({ error: leitura.erro })
  const { nome, acao, abas } = leitura.corpo
  try {
    const igual = (await lerCatalogoDeEtapas({ usos: false })).find((c) => c.nome.toLocaleLowerCase('pt-BR') === nome.toLocaleLowerCase('pt-BR'))
    if (igual) return res.status(409).json({ error: fraseDaEtapaDoCatalogoComNomeRepetido(igual.nome) })
    return res.status(201).json(await criarEtapaDoCatalogo({ por: caller.user_id, nome, acao, abas }))
  } catch (e) {
    const codigo = codigoDoErro(e)
    if (codigo === '42501') return res.status(403).json({ error: 'Só o super admin altera o catálogo.' })
    if (codigo === '22023' && e instanceof Error && e.message.trim() !== '') return res.status(409).json({ error: e.message })
    return falhaInterna(res, 'etapas do catalogo POST', e, 'Não foi possível acrescentar a etapa.')
  }
}
