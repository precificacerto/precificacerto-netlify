/**
 * GET    /api/super-admin/atendimentos-ia/fornecedores/[id] — o fornecedor e as tabelas dele
 *        (Arquivo · Motor · Vigência · Subido em · Contas usando — EPIC §5.6).
 * PATCH  — edita { nome, nicho_id }. Mover de nicho é isto.
 * DELETE — exclui o fornecedor SEM tabela.
 *
 * Fornecedor com tabela, ou vinculado na base de conhecimento de alguma conta, o BANCO recusa (FK RESTRICT,
 * 23503). A rota não engole: traduz para uma resposta que diz QUAIS tabelas o seguram e QUAIS contas o vinculam.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'
import {
  atualizarFornecedor,
  codigoDoErro,
  excluirFornecedor,
  falhaInterna,
  obterFornecedor,
  quemSeguraOFornecedor,
} from '@/lib/atendimentos-ia/repositorio'
import { ehUuid, emUsoPor, lerCorpoDoFornecedor, recusada } from '@/utils/atendimentos-ia-catalogo'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'PATCH' && req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' })

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

  if (req.method === 'PATCH') {
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

  try {
    const n = await excluirFornecedor(id)
    if (n === 0) return res.status(404).json({ error: 'Fornecedor não encontrado.' })
    return res.status(200).json({ ok: true })
  } catch (e) {
    if (codigoDoErro(e) !== '23503') return falhaInterna(res, 'fornecedor DELETE', e, 'Não foi possível excluir o fornecedor.')
    try {
      const { tabelas, contas } = await quemSeguraOFornecedor(id)
      // a base de conhecimento das contas também segura o fornecedor (FK RESTRICT de `orcamentista_mp_categoria_fornecedor`)
      const partes = [
        tabelas.length ? `O fornecedor tem ${tabelas.length} tabela(s): ${tabelas.join(', ')} — exclua as tabelas primeiro.` : '',
        contas.length ? `${emUsoPor(contas)}: a base de conhecimento dessas contas vincula o fornecedor.` : '',
      ].filter(Boolean)
      return res.status(409).json({ error: partes.join(' ') || 'O fornecedor está em uso e não pode ser excluído: o banco recusou a exclusão.', tabelas, contas })
    } catch (e2) {
      return falhaInterna(res, 'fornecedor DELETE (quem segura)', e2, 'O fornecedor tem tabelas e não pode ser excluído; não foi possível listá-las.')
    }
  }
}
