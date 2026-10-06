/**
 * GET /api/public/agenda/[token]/servicos?barbeiro=ID — os serviços daquele barbeiro.
 *
 * O tenant sai do TOKEN. O barbeiro é validado CONTRA o tenant do token antes de qualquer
 * consulta: um id de outro salão não encontra nada, e a resposta é a genérica.
 *
 * Com DUAS tabelas de serviço vinculadas, recusa em vez de escolher — adivinhar ofereceria preço
 * que o salão não cobra.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { CORPO_INDISPONIVEL, barbeiroValido, contextoDoToken, servicosDoBarbeiro } from '@/lib/agendamento-publico'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json(CORPO_INDISPONIVEL)
  try {
    const ctx = await contextoDoToken(req.query.token)
    if (!ctx) return res.status(404).json(CORPO_INDISPONIVEL)

    const barbeiro = await barbeiroValido(ctx.tenant_id, req.query.barbeiro)
    if (!barbeiro) return res.status(404).json(CORPO_INDISPONIVEL)

    const servicos = await servicosDoBarbeiro(ctx.tenant_id, barbeiro)
    if (!servicos) return res.status(409).json(CORPO_INDISPONIVEL)

    // SÓ id, nome e duração.
    return res.status(200).json(servicos)
  } catch (e: any) {
    console.error('[public/agenda] servicos:', e?.message || 'Unknown error')
    return res.status(500).json(CORPO_INDISPONIVEL)
  }
}
