/**
 * DELETE /api/super-admin/atendimentos-ia/nichos/[id] — exclui um nicho que ninguém usa.
 *
 * Nicho com fornecedor, ou escolhido por alguma conta, o BANCO recusa (FK RESTRICT, 23503). A
 * rota não engole o erro: traduz para uma resposta que DIZ quem segura o nicho — os fornecedores
 * dele e as contas que o escolheram.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import { codigoDoErro, excluirNicho, falhaInterna, quemSeguraONicho } from '@/lib/atendimentos-ia/repositorio'
import { ehUuid, emUsoPor } from '@/utils/atendimentos-ia-catalogo'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' })

  const caller = await requireSuperAdmin(req, res)
  if (!caller) return

  const { id } = req.query as { id?: string }
  if (!ehUuid(id)) return res.status(400).json({ error: 'Nicho inválido.' })

  try {
    const n = await excluirNicho(id)
    if (n === 0) return res.status(404).json({ error: 'Nicho não encontrado.' })
    return res.status(200).json({ ok: true })
  } catch (e) {
    if (codigoDoErro(e) !== '23503') return falhaInterna(res, 'nicho DELETE', e, 'Não foi possível excluir o nicho.')
    try {
      const { fornecedores, contas } = await quemSeguraONicho(id)
      const partes = [
        fornecedores.length ? `Fornecedores deste nicho: ${fornecedores.join(', ')}.` : '',
        contas.length ? `${emUsoPor(contas)}.` : '',
      ].filter(Boolean)
      return res.status(409).json({ error: `O nicho não pode ser excluído. ${partes.join(' ')}`.trim(), fornecedores, contas })
    } catch (e2) {
      return falhaInterna(res, 'nicho DELETE (quem segura)', e2, 'O nicho está em uso e não pode ser excluído; não foi possível listar quem o usa.')
    }
  }
}
