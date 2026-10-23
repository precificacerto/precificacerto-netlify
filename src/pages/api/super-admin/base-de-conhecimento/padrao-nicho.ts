/**
 * PUT /api/super-admin/base-de-conhecimento/padrao-nicho?nicho=<uuid> — grava o PADRÃO de esquadrias
 * do nicho, pela função `superadmin_gravar_esquadrias_padrao`, que loga na mesma transação, com
 * `tenant_id` NULL: o padrão não é de empresa nenhuma, e vale de herança para todas do nicho.
 *   corpo: { esquadrias: {...} } — chave ausente não mexe, null limpa, false grava false.
 *
 * SÓ o nicho Esquadrias: o schema não impede padrão de esquadrias noutro nicho (um CHECK não lê
 * outra tabela) — limite aceito pelo dono do produto, 22/10/2026, que fica com a rota. O nicho é
 * reconhecido pelo NOME no catálogo; ausente ou duplicado tem erro próprio (`exigirNichoDasEsquadrias`).
 *
 * O portão está em `src/lib/atendimentos-ia/base-de-conhecimento-servidor.ts`.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { superAdminOu404 } from '@/lib/get-caller-tenant'
import { lerCorpoDoPadrao } from '@/lib/atendimentos-ia/base-de-conhecimento'
import {
    exigirNichoDasEsquadrias, falhaDeLeitura, gravarPelaFuncao, metodoNaoPermitido, nichoDoPedido, recusaNomeada,
} from '@/lib/atendimentos-ia/base-de-conhecimento-servidor'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const caller = await superAdminOu404(req, res)
    if (!caller) return
    if (req.method !== 'PUT') return metodoNaoPermitido(res, ['PUT'])

    try {
        const nicho = await nichoDoPedido(req, res)
        if (!nicho) return
        if (!(await exigirNichoDasEsquadrias(res, nicho.id, `O nicho ${nicho.nome}`))) return

        const corpo = lerCorpoDoPadrao(req.body)
        if (corpo.erros.length > 0) return recusaNomeada(res, corpo.erros)

        return gravarPelaFuncao(res, 'superadmin_gravar_esquadrias_padrao', { p_nicho: nicho.id, p_por: caller.user_id, p_campos: corpo.esquadrias })
    } catch (e) {
        return falhaDeLeitura(res, e)
    }
}
