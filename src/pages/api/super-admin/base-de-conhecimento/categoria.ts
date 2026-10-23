/**
 * PUT /api/super-admin/base-de-conhecimento/categoria?tenant=<uuid>&materia_prima=<uuid>&categoria=<CHAVE>
 *   → `superadmin_gravar_mp_categoria`.   corpo: { config: { <campo do catálogo>: valor | null } }
 *
 * 1:1, sem lógica própria. A função faz MERGE no config: chave ausente fica, chave com null limpa,
 * false grava false. Ela confere a chave e o tipo contra `orcamentista_categoria_campo` e que a
 * matéria-prima é desta empresa — a rota não repete nada disso. `por` no corpo é erro.
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
        const materiaPrimaId = idDoQuery(req, 'materia_prima')
        if (!materiaPrimaId) return res.status(404).json({ error: 'Matéria-prima não encontrada.' })
        // a chave é conferida pela FUNÇÃO contra o catálogo; aqui só se exige que tenha vindo, uma vez
        const categoria = req.query.categoria
        if (typeof categoria !== 'string' || categoria === '') return recusaNomeada(res, [{ campo: 'categoria', mensagem: 'obrigatório no endereço' }])

        const corpo = lerEnvelope(req.body, 'config')
        if (corpo.erros.length > 0) return recusaNomeada(res, corpo.erros)
        return gravarPelaFuncaoComAMensagemDela(res, 'superadmin_gravar_mp_categoria', {
            p_tenant: tenantId, p_por: caller.user_id, p_materia_prima: materiaPrimaId, p_categoria: categoria, p_corpo: corpo.valor,
        })
    } catch (e) {
        return falhaDeLeitura(res, e)
    }
}
