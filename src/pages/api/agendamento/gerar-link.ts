/**
 * POST /api/agendamento/gerar-link — cria ou devolve a configuração do agendamento do tenant.
 *
 * >>> ROTA AUTENTICADA. NÃO É A ROTA PÚBLICA DA FASE 2. <<<
 *
 * `getCallerContext` exige o cookie de sessão e devolve 401 sem ele. O tenant vem do PERFIL
 * do chamador, nunca do corpo da requisição: aceitar `tenant_id` do cliente deixaria qualquer
 * usuário autenticado gerar link para outro salão.
 *
 * O token é gerado AQUI, no servidor, com `crypto.randomBytes` — ver `agendamento-token.ts`.
 *
 * A linha nasce com `is_enabled = false`: gerar o link não liga o agendamento. São dois
 * gestos separados porque, na fase 1, o link ainda não resolve página nenhuma.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/supabase/admin'
import { getCallerContext } from '@/lib/get-caller-tenant'
import { gerarTokenDeAgendamento } from '@/utils/agendamento-token'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const caller = await getCallerContext(req, res)
  if (!caller) return

  const tenant_id = caller.tenant_id

  try {
    // Já existe? Devolve a existente em vez de rodar o token.
    //
    // >>> TROCAR O TOKEN QUEBRARIA OS LINKS JÁ DISTRIBUÍDOS <<<
    // O token é FATO HISTÓRICO: ele foi impresso em cartão, colado no Instagram, mandado no
    // WhatsApp. Regerá-lo a cada clique em "Gerar link" invalidaria tudo isso em silêncio —
    // `fato-vs-referencia.md`. Rotação de token, se for preciso, é gesto próprio e explícito.
    const { data: existente, error: erroLeitura } = await supabaseAdmin
      .from('tenant_booking_settings')
      .select('*')
      .eq('tenant_id', tenant_id)
      .maybeSingle()

    if (erroLeitura) throw erroLeitura
    if (existente) return res.status(200).json({ settings: existente, criado: false })

    const { data: criado, error: erroInsert } = await supabaseAdmin
      .from('tenant_booking_settings')
      .insert({
        tenant_id,
        public_token: gerarTokenDeAgendamento(),
        is_enabled: false,
      })
      .select('*')
      .single()

    if (erroInsert) throw erroInsert
    return res.status(201).json({ settings: criado, criado: true })
  } catch (error: any) {
    console.error('Gerar link de agendamento:', error?.message || 'Unknown error')
    return res.status(500).json({ error: error?.message || 'Internal server error' })
  }
}
