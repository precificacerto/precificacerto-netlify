/**
 * PUT /api/super-admin/base-de-conhecimento/vidros?tenant=<uuid>&mp_categoria=<uuid>
 *   → `superadmin_gravar_mp_vidros`.   corpo: { vidros: [{ descricao, referencia?, onde_predomina? }] }
 *
 * 1:1, sem lógica própria: a lista vai à função como veio, e a ORDEM é a posição nela (a função
 * recusa `ordem` no corpo). A função relê a categoria com o tenant — id de outra empresa sai 404 —
 * e valida o resto. O autor é o usuário da sessão; `por` no corpo é erro. Os erros da função vêm
 * traduzidos em status com a mensagem dela (42501, P0002, 22023, 23503).
 *
 * O portão está em `src/lib/atendimentos-ia/base-de-conhecimento-servidor.ts`.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { superAdminOu404 } from '@/lib/get-caller-tenant'
import { lerEnvelope } from '@/lib/atendimentos-ia/base-de-conhecimento'
import {
    empresaDoPedido, falhaDeLeitura, gravarPelaFuncaoComAMensagemDela, idDoQuery, metodoNaoPermitido, recusaNomeada,
} from '@/lib/atendimentos-ia/base-de-conhecimento-servidor'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const caller = await superAdminOu404(req, res)
    if (!caller) return
    if (req.method !== 'PUT') return metodoNaoPermitido(res, ['PUT'])

    try {
        const tenantId = await empresaDoPedido(req, res)
        if (!tenantId) return
        const mpCategoriaId = idDoQuery(req, 'mp_categoria')
        if (!mpCategoriaId) return res.status(404).json({ error: 'Categoria não encontrada.' })

        const corpo = lerEnvelope(req.body, 'vidros')
        if (corpo.erros.length > 0) return recusaNomeada(res, corpo.erros)
        return gravarPelaFuncaoComAMensagemDela(res, 'superadmin_gravar_mp_vidros', { p_tenant: tenantId, p_por: caller.user_id, p_mp_categoria: mpCategoriaId, p_lista: corpo.valor })
    } catch (e) {
        return falhaDeLeitura(res, e)
    }
}
