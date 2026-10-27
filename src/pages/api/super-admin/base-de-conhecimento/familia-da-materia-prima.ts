/**
 * PUT /api/super-admin/base-de-conhecimento/familia-da-materia-prima?tenant=<uuid>
 *     corpo: { materia_prima: <uuid>, familia: <chave da lista> | null }
 *
 * Define (ou limpa, com `null`) a FAMÍLIA da matéria-prima pela função `superadmin_definir_familia_da_materia_prima`
 * (migração 20261027000003), que confere que a matéria-prima é DESTA empresa, que a família é da lista, e que a
 * empresa não tem outra matéria-prima na mesma família (uma por família). Loga na mesma transação.
 *
 * A FAMÍLIA ESCOLHE AS RAMIFICAÇÕES (dono do produto, 27/10/2026): a tela da base mostra, por matéria-prima, as
 * categorias que a família dela declara em `orcamentista_familia_ramificacao` — não a lista inteira do catálogo.
 * Sem família, a tela mostra todas e AVISA. Esta rota não mexe em categoria nem em fornecedor: grava só a família.
 *
 * 1:1, sem lógica própria além do formato. O autor é o usuário da sessão; `por` no corpo é erro. Os erros da função
 * vêm com a mensagem dela (42501, P0002, 22023, 23503). O portão (super admin ou 404; empresa uuid e existente, ou
 * 404) está em `src/lib/atendimentos-ia/base-de-conhecimento-servidor.ts`.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { superAdminOu404 } from '@/lib/get-caller-tenant'
import { lerCorpoDaFamiliaDaMateriaPrima } from '@/lib/atendimentos-ia/base-de-conhecimento'
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

        const corpo = lerCorpoDaFamiliaDaMateriaPrima(req.body)
        if (corpo.erros.length > 0) return recusaNomeada(res, corpo.erros)
        return gravarPelaFuncaoComAMensagemDela(res, 'superadmin_definir_familia_da_materia_prima', {
            p_tenant: tenantId, p_por: caller.user_id, p_materia_prima: corpo.materia_prima, p_familia: corpo.familia,
        })
    } catch (e) {
        return falhaDeLeitura(res, e)
    }
}
