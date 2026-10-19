/**
 * GET  /api/super-admin/atendimentos-ia/nichos — os nichos da plataforma, por modelo.
 * POST /api/super-admin/atendimentos-ia/nichos — cria um nicho { modelo, nome }.
 *
 * Só o super admin, checado ANTES de ler o corpo. Escrita com `service_role` pelo repositório:
 * as quatro tabelas do catálogo não têm privilégio nenhum para `authenticated`
 * (`20261019000001`). O nome é APARADO antes de gravar (`lerCorpoDoNicho`); o banco recusa o
 * repetido no mesmo modelo sem distinguir maiúsculas (`orcamentista_nicho_modelo_nome_key`).
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import { codigoDoErro, criarNicho, falhaInterna, listarNichos } from '@/lib/atendimentos-ia/repositorio'
import { lerCorpoDoNicho, recusada } from '@/utils/atendimentos-ia-catalogo'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const caller = await requireSuperAdmin(req, res)
  if (!caller) return

  if (req.method === 'GET') {
    try {
      return res.status(200).json(await listarNichos())
    } catch (e) {
      return falhaInterna(res, 'nichos GET', e, 'Não foi possível ler os nichos.')
    }
  }

  const leitura = lerCorpoDoNicho(req.body)
  if (recusada(leitura)) return res.status(400).json({ error: leitura.erro })
  try {
    const nicho = await criarNicho({ ...leitura.corpo, criado_por: caller.user_id })
    return res.status(201).json(nicho)
  } catch (e) {
    if (codigoDoErro(e) === '23505') return res.status(409).json({ error: 'Já existe um nicho com esse nome neste modelo.' })
    return falhaInterna(res, 'nichos POST', e, 'Não foi possível criar o nicho.')
  }
}
