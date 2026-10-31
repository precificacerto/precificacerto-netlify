/**
 * PATCH  /api/super-admin/atendimentos-ia/familias/[chave] — `{ rotulo, ramificacoes }`: EDITA o nome e as ramificações da família. A CHAVE não
 *        se renomeia (dono do produto, 28/10/2026): é ela que as chaves estrangeiras citam; o nome é o que se vê.
 * DELETE /api/super-admin/atendimentos-ia/familias/[chave] — REMOVE a família sem uso, com as ramificações dela.
 *
 * Dono do produto, 29/10/2026: "criar, renomear e remover família no catálogo, com as travas que o dado exige — remover família em uso é
 * RECUSA NOMEADA, nunca cascata." As funções são `superadmin_editar_familia` e `superadmin_remover_familia` (migração 20261029000004), com log.
 *   - EDITAR: a rota confere o que dá frase em português — a família existe (404), o nome não é o de OUTRA (409, sem olhar a caixa), as
 *     ramificações são do catálogo (400) e algo mudou (400); a função confere de novo.
 *   - REMOVER: a função conta o uso — matéria-prima (empresa e nome), tabela de fornecedor (fornecedor e arquivo), motor (fornecedor e arquivo),
 *     etapa e item de levantamento — e RECUSA nomeando (22023 → 409, com a frase dela). As chaves estrangeiras continuam ON DELETE RESTRICT.
 *     Tirar uma ramificação NÃO apaga dado da base de conhecimento: a categoria com dado gravado continua aparecendo, marcada como fora da família.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import { codigoDoErro, editarFamilia, falhaInterna, removerFamilia } from '@/lib/atendimentos-ia/repositorio'
import { ehChaveDeFamilia, familiaNaoMudou, fraseDaFamiliaComNomeRepetido, lerEdicaoDaFamilia, recusada } from '@/utils/atendimentos-ia-catalogo'
import { familiasDoCatalogo, fraseDaRamificacaoForaDoCatalogo, ramificacoesForaDoCatalogo } from '@/lib/atendimentos-ia/familias-do-catalogo'

export const FAMILIA_QUE_NAO_MUDOU = 'Nada mudou: o nome e as categorias são os de agora.'
const FAMILIA_INEXISTENTE = 'Família não encontrada.'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH' && req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' })

  const caller = await requireSuperAdmin(req, res)
  if (!caller) return

  const { chave } = req.query as { chave?: string }
  if (!ehChaveDeFamilia(chave)) return res.status(404).json({ error: FAMILIA_INEXISTENTE })

  if (req.method === 'PATCH') {
    const leitura = lerEdicaoDaFamilia(req.body)
    if (recusada(leitura)) return res.status(400).json({ error: leitura.erro })
    const ed = leitura.corpo
    try {
      const todas = await familiasDoCatalogo()
      const atual = todas.find((f) => f.chave === chave)
      if (!atual) return res.status(404).json({ error: FAMILIA_INEXISTENTE })
      const igual = todas.find((f) => f.chave !== chave && f.rotulo.trim().toLocaleLowerCase('pt-BR') === ed.rotulo.toLocaleLowerCase('pt-BR'))
      if (igual) return res.status(409).json({ error: fraseDaFamiliaComNomeRepetido(igual.rotulo) })
      const fora = await ramificacoesForaDoCatalogo(ed.ramificacoes)
      if (fora.length > 0) return res.status(400).json({ error: fraseDaRamificacaoForaDoCatalogo(fora) })
      if (familiaNaoMudou(atual, ed)) return res.status(400).json({ error: FAMILIA_QUE_NAO_MUDOU })
      return res.status(200).json(await editarFamilia({ por: caller.user_id, chave, rotulo: ed.rotulo, ramificacoes: ed.ramificacoes }))
    } catch (e) {
      return recusaDaFuncao(res, e, 'familia PATCH', 'Não foi possível editar a família.')
    }
  }

  try {
    return res.status(200).json(await removerFamilia({ por: caller.user_id, chave }))
  } catch (e) {
    return recusaDaFuncao(res, e, 'familia DELETE', 'Não foi possível remover a família.')
  }
}

/** A recusa da função vai com a frase dela (22023 → 409; P0002 → 404; 42501 → 403); outro erro é 500, sem o texto do banco. */
function recusaDaFuncao(res: NextApiResponse, e: unknown, contexto: string, mensagem: string) {
  const codigo = codigoDoErro(e)
  if (codigo === 'P0002') return res.status(404).json({ error: FAMILIA_INEXISTENTE })
  if (codigo === '42501') return res.status(403).json({ error: 'Só o super admin altera o catálogo.' })
  if (codigo === '22023' && e instanceof Error && e.message.trim() !== '') return res.status(409).json({ error: e.message })
  return falhaInterna(res, contexto, e, mensagem)
}
