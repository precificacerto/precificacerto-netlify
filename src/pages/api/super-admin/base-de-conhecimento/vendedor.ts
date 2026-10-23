/**
 * PUT /api/super-admin/base-de-conhecimento/vendedor?tenant=<uuid> — grava os perfis de vendedor da
 * empresa, pela função `superadmin_gravar_vendedor_perfil`, que loga na mesma transação.
 *   corpo: { vendedores: [{ employee_id, comissao_percentual?, comissao_modo?,
 *            reserva_tecnica_percentual?, lucro_projetado_percentual? }] }
 * A LISTA É O ESTADO: perfil que não vier sai. O funcionário tem de ser DESTA empresa: a FK composta
 * já impede, mas a recusa vem antes, nomeando o funcionário.
 *
 * O portão está em `src/lib/atendimentos-ia/base-de-conhecimento-servidor.ts`.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { superAdminOu404 } from '@/lib/get-caller-tenant'
import { lerCorpoDosVendedores } from '@/lib/atendimentos-ia/base-de-conhecimento'
import {
    empresaDoPedido, falhaDeLeitura, funcionariosDeFora, gravarPelaFuncao, metodoNaoPermitido, recusaNomeada,
} from '@/lib/atendimentos-ia/base-de-conhecimento-servidor'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const caller = await superAdminOu404(req, res)
    if (!caller) return
    if (req.method !== 'PUT') return metodoNaoPermitido(res, ['PUT'])

    try {
        const tenantId = await empresaDoPedido(req, res)
        if (!tenantId) return

        const corpo = lerCorpoDosVendedores(req.body)
        if (corpo.erros.length > 0) return recusaNomeada(res, corpo.erros)

        const deFora = await funcionariosDeFora(tenantId, corpo.lista.map((v) => String(v.employee_id)))
        if (deFora.length > 0) return recusaNomeada(res, deFora)

        return gravarPelaFuncao(res, 'superadmin_gravar_vendedor_perfil', { p_tenant: tenantId, p_por: caller.user_id, p_lista: corpo.lista })
    } catch (e) {
        return falhaDeLeitura(res, e)
    }
}
