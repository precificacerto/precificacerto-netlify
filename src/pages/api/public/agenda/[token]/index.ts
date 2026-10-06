/**
 * GET /api/public/agenda/[token] — a empresa e os barbeiros que aceitam agendamento.
 *
 * ROTA PÚBLICA, SEM LOGIN. O tenant sai do TOKEN e de nenhum outro lugar: esta rota NÃO aceita
 * `tenant_id` no corpo, na query nem em header, e se chegar é ignorado por nunca ser lido.
 *
 * Token inexistente e token desligado respondem EXATAMENTE o mesmo 404 genérico — ver
 * `contextoDoToken`.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { CORPO_INDISPONIVEL, barbeirosDoLink, contextoDoToken } from '@/lib/agendamento-publico'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json(CORPO_INDISPONIVEL)
  try {
    const ctx = await contextoDoToken(req.query.token)
    if (!ctx) return res.status(404).json(CORPO_INDISPONIVEL)
    const barbeiros = await barbeirosDoLink(ctx.tenant_id)
    // SÓ id e nome. Nada de telefone, e-mail ou cargo — a regra 4 do §2.
    return res.status(200).json({ empresa: ctx.empresa, barbeiros })
  } catch (e: any) {
    console.error('[public/agenda] index:', e?.message || 'Unknown error')
    return res.status(500).json(CORPO_INDISPONIVEL)
  }
}
