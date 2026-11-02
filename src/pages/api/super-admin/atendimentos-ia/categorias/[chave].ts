/**
 * PATCH  /api/super-admin/atendimentos-ia/categorias/[chave] — `{ rotulo }`: RENOMEIA a categoria. SÓ O RÓTULO (decisão 1 do dono do produto,
 *        02/11/2026): a chave é imutável, como na família — é ela que as tabelas, os motores, as famílias, as contas, as CHECKs e o código citam.
 *        Um corpo que traga `chave` é recusado com a frase que diz isso. Vale também para as quatro estruturais: delas só a remoção é recusada.
 * REMOVER a categoria é da rota `catalogo/remover` (migração 20261102000002): o arrasto medido, nomeando cada empresa, confirmado e logado linha a
 * linha. Aqui não há DELETE.
 *
 * A função é `superadmin_editar_categoria` (migração 20261102000002), com log. A rota confere o que dá frase em português — a categoria existe
 * (404), o nome não é o de OUTRA (409, sem olhar a caixa), a forma do corpo (400) e algo mudou (400); a função confere de novo.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import { codigoDoErro, editarCategoria, falhaInterna, listarCategorias } from '@/lib/atendimentos-ia/repositorio'
import {
  CATEGORIA_INEXISTENTE, CATEGORIA_QUE_NAO_MUDOU, ehChaveDeCategoria, fraseDaCategoriaComNomeRepetido, lerEdicaoDaCategoria,
} from '@/utils/atendimentos-ia-catalogo'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' })

  const caller = await requireSuperAdmin(req, res)
  if (!caller) return

  const { chave } = req.query as { chave?: string }
  if (!ehChaveDeCategoria(chave)) return res.status(404).json({ error: CATEGORIA_INEXISTENTE })

  const leitura = lerEdicaoDaCategoria(req.body)
  if (leitura.ok === false) return res.status(400).json({ error: leitura.erro })
  const { rotulo } = leitura.corpo
  try {
    const todas = await listarCategorias()
    const atual = todas.find((c) => c.chave === chave)
    if (!atual) return res.status(404).json({ error: CATEGORIA_INEXISTENTE })
    const igual = todas.find((c) => c.chave !== chave && c.rotulo.trim().toLocaleLowerCase('pt-BR') === rotulo.toLocaleLowerCase('pt-BR'))
    if (igual) return res.status(409).json({ error: fraseDaCategoriaComNomeRepetido(igual.rotulo) })
    if (atual.rotulo.trim() === rotulo) return res.status(400).json({ error: CATEGORIA_QUE_NAO_MUDOU })
    return res.status(200).json(await editarCategoria({ por: caller.user_id, chave, rotulo }))
  } catch (e) {
    const codigo = codigoDoErro(e)
    if (codigo === 'P0002') return res.status(404).json({ error: CATEGORIA_INEXISTENTE })
    if (codigo === '42501') return res.status(403).json({ error: 'Só o super admin altera o catálogo.' })
    if (codigo === '22023' && e instanceof Error && e.message.trim() !== '') return res.status(409).json({ error: e.message })
    return falhaInterna(res, 'categoria PATCH', e, 'Não foi possível renomear a categoria.')
  }
}
