/**
 * GET /api/super-admin/base-de-conhecimento/contexto?tenant=<uuid> — o CONTEXTO DO ATENDIMENTO da empresa: o
 *     texto, quando e quem alterou. Sem linha, `texto` null — vazio é o padrão (dono do produto, 26/10/2026).
 * PUT /api/super-admin/base-de-conhecimento/contexto?tenant=<uuid> — grava `{ texto }` pela função
 *     `superadmin_gravar_contexto_do_atendimento` (migração 20261027000001), que loga na mesma transação.
 *     Texto vazio grava vazio: é a volta ao padrão.
 *
 * O LIMITE de 4.000 caracteres é conferido aqui, ANTES da função, com a frase que diz quantos — e de novo na
 * função e no CHECK do banco. A linha que separa as camadas está em `src/utils/atendimentos-ia-contexto.ts`.
 *
 * O portão (super admin ou 404; empresa do query string, uuid e existente, ou 404) está em
 * `src/lib/atendimentos-ia/base-de-conhecimento-servidor.ts`.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { superAdminOu404 } from '@/lib/get-caller-tenant'
import { lerCorpoDoContexto } from '@/utils/atendimentos-ia-contexto'
import {
    empresaDoPedido, falhaDeLeitura, gravarPelaFuncao, lerContextoGravado, metodoNaoPermitido,
} from '@/lib/atendimentos-ia/base-de-conhecimento-servidor'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const caller = await superAdminOu404(req, res)
    if (!caller) return
    if (req.method !== 'GET' && req.method !== 'PUT') return metodoNaoPermitido(res, ['GET', 'PUT'])

    try {
        const tenantId = await empresaDoPedido(req, res)
        if (!tenantId) return

        if (req.method === 'GET') return res.status(200).json(await lerContextoGravado(tenantId))

        const corpo = lerCorpoDoContexto(req.body)
        if (corpo.ok === false) return res.status(400).json({ error: corpo.erro })
        return gravarPelaFuncao(res, 'superadmin_gravar_contexto_do_atendimento', { p_tenant: tenantId, p_por: caller.user_id, p_texto: corpo.texto })
    } catch (e) {
        return falhaDeLeitura(res, e)
    }
}
