/**
 * GET  /api/super-admin/atendimentos-ia/categorias — as categorias (as ramificações) da plataforma, NA ORDEM, cada uma com `estrutural`
 *      (decisão 3, 02/11/2026: PERFIL, VIDRO, FERRAGENS e INSTALACAO têm a remoção recusada). Com `?usos=1`, também QUEM USA (tabelas, motores,
 *      famílias e empresas), para a aba Categorias; sem ele, a lista leve de onde a tela escolhe a categoria da TABELA de fornecedor
 *      (dono do produto, 27/10/2026: "uma tabela = uma categoria"; migração 20261027000005).
 * POST /api/super-admin/atendimentos-ia/categorias — `{ rotulo }`: acrescenta uma categoria no FIM da lista, com a chave derivada do nome
 *      (dono do produto, 02/11/2026: "criar, renomear e remover categoria, como já faço com etapa"; migração 20261102000002).
 *
 * A ROTA confere o que dá frase em português — a forma do corpo (`lerCategoriaNova`), a chave e o nome repetidos (sem olhar a caixa) —, e a
 * FUNÇÃO (`superadmin_criar_categoria`, que loga e calcula a ordem sob trava) confere de novo: a recusa dela numa corrida volta com a frase dela
 * (22023 → 409). Só o super admin. Editar o nome mora em `categorias/[chave]`; remover é a rota `catalogo/remover`, com o arrasto por empresa.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import { codigoDoErro, criarCategoria, falhaInterna, listarCategorias, usosDasCategorias } from '@/lib/atendimentos-ia/repositorio'
import { ehCategoriaEstrutural, fraseDaCategoriaComNomeRepetido, lerCategoriaNova, type CategoriaDoCatalogo } from '@/utils/atendimentos-ia-catalogo'

export const fraseDaChaveRepetida = (chave: string, rotulo: string) => `Já há uma categoria com a chave ${chave} no catálogo ("${rotulo}"). Escolha outro nome.`

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const caller = await requireSuperAdmin(req, res)
  if (!caller) return

  if (req.method === 'GET') {
    try {
      const categorias = (await listarCategorias()).sort((a, b) => a.ordem - b.ordem).map((c) => ({ ...c, estrutural: ehCategoriaEstrutural(c.chave) }))
      if (req.query.usos !== '1') return res.status(200).json(categorias)
      const usos = await usosDasCategorias()
      const completas: CategoriaDoCatalogo[] = categorias.map((c) => ({ ...c, usos: usos.get(c.chave) ?? { tabelas: 0, motores: 0, familias: [], empresas: [] } }))
      return res.status(200).json(completas)
    } catch (e) {
      return falhaInterna(res, 'categorias GET', e, 'Não foi possível ler as categorias.')
    }
  }

  const leitura = lerCategoriaNova(req.body)
  if (leitura.ok === false) return res.status(400).json({ error: leitura.erro })
  const { chave, rotulo } = leitura.corpo
  try {
    const todas = await listarCategorias()
    const mesmaChave = todas.find((c) => c.chave === chave)
    if (mesmaChave) return res.status(409).json({ error: fraseDaChaveRepetida(chave, mesmaChave.rotulo) })
    const igual = todas.find((c) => c.rotulo.trim().toLocaleLowerCase('pt-BR') === rotulo.toLocaleLowerCase('pt-BR'))
    if (igual) return res.status(409).json({ error: fraseDaCategoriaComNomeRepetido(igual.rotulo) })
    return res.status(201).json(await criarCategoria({ por: caller.user_id, chave, rotulo }))
  } catch (e) {
    const codigo = codigoDoErro(e)
    if (codigo === '42501') return res.status(403).json({ error: 'Só o super admin altera o catálogo.' })
    if (codigo === '22023' && e instanceof Error && e.message.trim() !== '') return res.status(409).json({ error: e.message })
    return falhaInterna(res, 'categorias POST', e, 'Não foi possível acrescentar a categoria.')
  }
}
