/**
 * GET    /api/super-admin/atendimentos-ia/fornecedores/[id] — o fornecedor e as tabelas dele
 *        (Arquivo · Motor · Vigência · Subido em · Contas usando — EPIC §5.6).
 * PATCH  — edita { nome, nicho_id }. Mover de nicho é isto.
 *
 * REMOVER o fornecedor é da rota `catalogo/remover` (migração 20261031000003, dono do produto, 31/10/2026: "o catálogo é soberano"): as tabelas,
 * os motores, o conteúdo e os vínculos de conta saem com ele, medidos, confirmados e logados linha a linha. Aqui não há mais DELETE.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import {
  atualizarFornecedor,
  codigoDoErro,
  falhaInterna,
  obterFornecedor,
} from '@/lib/atendimentos-ia/repositorio'
import { ehUuid, lerCorpoDoFornecedor, recusada } from '@/utils/atendimentos-ia-catalogo'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' })

  const caller = await requireSuperAdmin(req, res)
  if (!caller) return

  const { id } = req.query as { id?: string }
  if (!ehUuid(id)) return res.status(400).json({ error: 'Fornecedor inválido.' })

  if (req.method === 'GET') {
    try {
      const f = await obterFornecedor(id)
      if (!f) return res.status(404).json({ error: 'Fornecedor não encontrado.' })
      return res.status(200).json(f)
    } catch (e) {
      return falhaInterna(res, 'fornecedor GET', e, 'Não foi possível ler o fornecedor.')
    }
  }

  {
    const leitura = lerCorpoDoFornecedor(req.body)
    if (recusada(leitura)) return res.status(400).json({ error: leitura.erro })
    try {
      const n = await atualizarFornecedor(id, leitura.corpo)
      if (n === 0) return res.status(404).json({ error: 'Fornecedor não encontrado.' })
      return res.status(200).json({ ok: true })
    } catch (e) {
      if (codigoDoErro(e) === '23503') return res.status(400).json({ error: 'O nicho escolhido não existe mais.' })
      return falhaInterna(res, 'fornecedor PATCH', e, 'Não foi possível alterar o fornecedor.')
    }
  }
}
