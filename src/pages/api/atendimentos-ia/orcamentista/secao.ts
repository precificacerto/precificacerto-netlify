/**
 * GET /api/atendimentos-ia/orcamentista/secao — a seção ATENDIMENTOS I.A. está ligada para a conta
 * do usuário logado, e ele pode ver o Orçamentista?
 *
 * É a pergunta que o MENU faz antes de desenhar o item "Orçamentista" (desktop e drawer). Quem
 * decide é o servidor: com `orcamentista_config.ativo` diferente de `true`, 404; sem permissão do
 * módulo `orcamentista`, 403. A tela escondida não é trava — a página tem a mesma checagem na
 * rota do painel. Não lê nem devolve dado nenhum além disso.
 *
 * Arquitetura: `src/lib/atendimentos-ia/orcamentista-da-empresa.ts`.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { chamadorDoOrcamentista, MODULO_DO_ORCAMENTISTA } from '@/lib/atendimentos-ia/orcamentista-da-empresa'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const caller = await chamadorDoOrcamentista(req, res, 'ver', MODULO_DO_ORCAMENTISTA)
  if (!caller) return
  return res.status(200).json({ ativa: true })
}
