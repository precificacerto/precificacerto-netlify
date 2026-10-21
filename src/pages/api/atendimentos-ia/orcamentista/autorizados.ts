/**
 * GET  /api/atendimentos-ia/orcamentista/autorizados — os funcionários ativos e a autorização de
 *      cada um para falar com o orçamentista.
 * POST /api/atendimentos-ia/orcamentista/autorizados — { employee_id, acao }, com acao em
 *      'ligar' | 'desligar' | 'atualizar-telefone'.
 *
 * O tenant é SEMPRE o do usuário logado: um `tenant_id` no corpo é ignorado. Desligar é UPDATE
 * `ativo = false`, nunca DELETE. Funcionário sem telefone não liga: 422, e nada é gravado.
 * Ler: quem vê Conectividade. Mudar: quem edita.
 *
 * Arquitetura: `src/lib/atendimentos-ia/orcamentista-da-empresa.ts`.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { aplicarAcao, chamadorDoOrcamentista, listarQuemPodeFalar, type AcaoNaLista } from '@/lib/atendimentos-ia/orcamentista-da-empresa'

const ACOES: AcaoNaLista[] = ['ligar', 'desligar', 'atualizar-telefone']

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const caller = await chamadorDoOrcamentista(req, res, req.method === 'GET' ? 'ver' : 'editar')
  if (!caller) return

  try {
    if (req.method === 'GET') return res.status(200).json({ linhas: await listarQuemPodeFalar(caller.tenant_id) })

    const { employee_id: employeeId, acao } = (req.body ?? {}) as { employee_id?: unknown; acao?: unknown }
    if (typeof employeeId !== 'string' || !ACOES.includes(acao as AcaoNaLista)) {
      return res.status(400).json({ error: 'Informe employee_id e uma ação válida.' })
    }
    const r = await aplicarAcao(caller.tenant_id, employeeId, acao as AcaoNaLista)
    return res.status(r.status).json(r.corpo)
  } catch (e) {
    console.error('orcamentista autorizados:', e instanceof Error ? e.message : e)
    return res.status(500).json({ error: 'Não foi possível ler ou alterar a lista do orçamentista.' })
  }
}
