/**
 * GET /api/atendimentos-ia/orcamentista/painel — o que a página `/atendimentos-ia/orcamentista`
 * mostra: o estado da conexão, as pessoas liberadas e os levantamentos (`lerPainel`).
 *
 * LEITURA APENAS: só GET, e nenhuma escrita — a pré-definição não cria orçamento no sistema maior.
 * O tenant é o do usuário logado (`getCallerContext`): um `tenant_id` no corpo ou na query é
 * ignorado. Seção desligada: 404. Sem permissão do módulo `orcamentista`: 403. As tabelas têm
 * REVOKE ALL de anon e authenticated — o acesso é só por aqui, com `service_role`.
 *
 * Arquitetura: `src/lib/atendimentos-ia/orcamentista-da-empresa.ts`.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { chamadorDoOrcamentista, lerPainel, MODULO_DO_ORCAMENTISTA } from '@/lib/atendimentos-ia/orcamentista-da-empresa'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const caller = await chamadorDoOrcamentista(req, res, 'ver', MODULO_DO_ORCAMENTISTA)
  if (!caller) return

  try {
    return res.status(200).json(await lerPainel(caller.tenant_id))
  } catch (e) {
    console.error('orcamentista painel:', e instanceof Error ? e.message : e)
    return res.status(500).json({ error: 'Não foi possível ler o painel do Orçamentista.' })
  }
}
