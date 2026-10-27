/**
 * GET /api/super-admin/atendimentos-ia/categorias — as categorias (as ramificações) da plataforma, NA ORDEM.
 *
 * É de onde a tela escolhe a categoria da TABELA de fornecedor (dono do produto, 27/10/2026: "uma tabela = uma
 * categoria"; migração 20261027000005). A lista é a de `orcamentista_categoria_catalogo`, da plataforma: só leitura
 * aqui — quem a acrescenta é migração, e a tela não inventa categoria.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import { falhaInterna, listarCategorias } from '@/lib/atendimentos-ia/repositorio'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const caller = await requireSuperAdmin(req, res)
  if (!caller) return

  try {
    return res.status(200).json((await listarCategorias()).sort((a, b) => a.ordem - b.ordem))
  } catch (e) {
    return falhaInterna(res, 'categorias GET', e, 'Não foi possível ler as categorias.')
  }
}
