/**
 * GET  /api/super-admin/atendimentos-ia/fornecedores — a lista: Fornecedor · Nicho · Contas
 *      usando · quantas tabelas (EPIC §5.5).
 * POST /api/super-admin/atendimentos-ia/fornecedores — credencia { nome, nicho_id }.
 *
 * O fornecedor é DA PLATAFORMA, não de uma conta (EPIC §3.3). Só o super admin; escrita com
 * `service_role`; nome APARADO antes de gravar (`lerCorpoDoFornecedor`).
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import { codigoDoErro, criarFornecedor, falhaInterna, listarFornecedores } from '@/lib/atendimentos-ia/repositorio'
import { lerCorpoDoFornecedor, recusada } from '@/utils/atendimentos-ia-catalogo'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const caller = await requireSuperAdmin(req, res)
  if (!caller) return

  if (req.method === 'GET') {
    try {
      return res.status(200).json(await listarFornecedores())
    } catch (e) {
      return falhaInterna(res, 'fornecedores GET', e, 'Não foi possível ler os fornecedores.')
    }
  }

  const leitura = lerCorpoDoFornecedor(req.body)
  if (recusada(leitura)) return res.status(400).json({ error: leitura.erro })
  try {
    const f = await criarFornecedor({ ...leitura.corpo, criado_por: caller.user_id })
    return res.status(201).json(f)
  } catch (e) {
    if (codigoDoErro(e) === '23503') return res.status(400).json({ error: 'O nicho escolhido não existe mais.' })
    return falhaInterna(res, 'fornecedores POST', e, 'Não foi possível credenciar o fornecedor.')
  }
}
