/**
 * PUT /api/super-admin/base-de-conhecimento/formato-da-materia-prima?tenant=<uuid>
 *     corpo: { materia_prima: <uuid>, formato: 'FABRICACAO' | 'REVENDA' }
 *
 * Define o FORMATO da família (a matéria-prima) pela função `superadmin_definir_formato_da_materia_prima` (migração 20261123000001),
 * que confere que a matéria-prima é DESTA empresa, normaliza o formato, não grava nem loga o mesmo valor, e loga a troca na mesma
 * transação. Dono do produto, 23/11/2026: "o formato é carregado pela FAMÍLIA, e a escolha entre principal e secundário acontece na
 * tela da família". O principal é o modelo da conta; a conta não ganha coluna.
 *
 * 1:1, sem lógica própria além do formato. O autor é o usuário da sessão; `por` no corpo é erro. Os erros da função vêm com a mensagem
 * dela (42501, P0002, 22023). O portão (super admin ou 404; empresa uuid e existente, ou 404) está em
 * `src/lib/atendimentos-ia/base-de-conhecimento-servidor.ts`.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { superAdminOu404 } from '@/lib/get-caller-tenant'
import { lerCorpoDoFormatoDaMateriaPrima } from '@/lib/atendimentos-ia/base-de-conhecimento'
import {
    empresaDoPedido, falhaDeLeitura, gravarPelaFuncaoComAMensagemDela, metodoNaoPermitido, recusaNomeada,
} from '@/lib/atendimentos-ia/base-de-conhecimento-servidor'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const caller = await superAdminOu404(req, res)
    if (!caller) return
    if (req.method !== 'PUT') return metodoNaoPermitido(res, ['PUT'])

    try {
        const tenantId = await empresaDoPedido(req, res)
        if (!tenantId) return

        const corpo = lerCorpoDoFormatoDaMateriaPrima(req.body)
        if (corpo.erros.length > 0) return recusaNomeada(res, corpo.erros)
        return gravarPelaFuncaoComAMensagemDela(res, 'superadmin_definir_formato_da_materia_prima', {
            p_tenant: tenantId, p_por: caller.user_id, p_materia_prima: corpo.materia_prima, p_formato: corpo.formato,
        })
    } catch (e) {
        return falhaDeLeitura(res, e)
    }
}
