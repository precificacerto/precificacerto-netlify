/**
 * GET /api/public/agenda/[token] — a empresa e os barbeiros que aceitam agendamento.
 *
 * ROTA PÚBLICA, SEM LOGIN. O tenant sai do TOKEN e de nenhum outro lugar: esta rota NÃO aceita
 * `tenant_id` no corpo, na query nem em header, e se chegar é ignorado por nunca ser lido.
 *
 * Token inexistente e token desligado respondem EXATAMENTE o mesmo 404 genérico — ver
 * `contextoDoToken`.
 *
 * ══ 09/10/2026 — `horizonteDias` ENTRA, E É UM CAMPO A MAIS ══════════════════════════════
 *
 * Autorização do dono do produto, registrada como está: *"A rota indice passa a devolver
 * { empresa, barbeiros, horizonteDias }. E um campo A MAIS. Nenhum campo sai, nenhum muda de
 * nome, nenhum consumidor quebra."*
 *
 * >>> A RAZÃO: A TELA REPETIA O DEFAULT EM VEZ DE LER O PARÂMETRO <<<
 *
 * `/agendar/[token]` chutava `proximosDias(30)` no agendar e `proximosDias(14)` no remarcar.
 * Medido em 09/10/2026: existe UMA linha em `tenant_booking_settings`, com `horizon_days = 30`,
 * e o `column_default` da coluna também é 30 — então o 30 do código batia **por coincidência
 * com o default, não por leitura**. No dia em que um tenant pusesse 60, a faixa pararia no 30 e
 * o cliente não veria os outros 30 dias; com 15, ofereceria 15 dias que esta mesma rota recusa.
 * É `fato-vs-referencia.md` ao contrário: a tela não lia o parâmetro, repetia o default.
 *
 * E ele não expõe nada: é inteiro, vem de `tenant_booking_settings.horizon_days`, e o próprio
 * tenant o escolhe na tela de configuração do link.
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
    // `horizonteDias` é o terceiro campo, e nada identifica cliente nenhum aqui.
    return res.status(200).json({
      empresa: ctx.empresa,
      barbeiros,
      horizonteDias: ctx.horizon_days,
    })
  } catch (e: any) {
    console.error('[public/agenda] index:', e?.message || 'Unknown error')
    return res.status(500).json(CORPO_INDISPONIVEL)
  }
}
