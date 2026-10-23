/**
 * PUT /api/super-admin/base-de-conhecimento/ambiente?tenant=<uuid> — grava o padrão por ambiente da
 * empresa, pela função `superadmin_gravar_padrao_ambiente`, que loga na mesma transação.
 *   corpo: { ambientes: [{ ambiente, vidro_padrao?, tipologia_usual? }] }
 * A LISTA É O ESTADO: ambiente que não vier sai. Dentro de um ambiente que já existia, campo ausente
 * fica e null limpa.
 *
 * O portão está em `src/lib/atendimentos-ia/base-de-conhecimento-servidor.ts`.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { superAdminOu404 } from '@/lib/get-caller-tenant'
import { lerCorpoDosAmbientes } from '@/lib/atendimentos-ia/base-de-conhecimento'
import {
    empresaDoPedido, falhaDeLeitura, gravarPelaFuncao, metodoNaoPermitido, recusaNomeada,
} from '@/lib/atendimentos-ia/base-de-conhecimento-servidor'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const caller = await superAdminOu404(req, res)
    if (!caller) return
    if (req.method !== 'PUT') return metodoNaoPermitido(res, ['PUT'])

    try {
        const tenantId = await empresaDoPedido(req, res)
        if (!tenantId) return

        const corpo = lerCorpoDosAmbientes(req.body)
        if (corpo.erros.length > 0) return recusaNomeada(res, corpo.erros)

        return gravarPelaFuncao(res, 'superadmin_gravar_padrao_ambiente', { p_tenant: tenantId, p_por: caller.user_id, p_lista: corpo.lista })
    } catch (e) {
        return falhaDeLeitura(res, e)
    }
}
