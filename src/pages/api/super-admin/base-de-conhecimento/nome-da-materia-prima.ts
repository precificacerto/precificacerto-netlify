/**
 * PUT /api/super-admin/base-de-conhecimento/nome-da-materia-prima?tenant=<uuid>
 *     corpo: { materia_prima: <uuid>, nome: <texto de 1 a 80 caracteres> }
 *
 * O TÍTULO DA FAMÍLIA É DIGITADO (dono do produto, 27/10/2026): o consultor escreve o rótulo da família ("Esquadrias de PVC") e é ele o
 * título da matéria-prima na tela — não o rótulo do catálogo. Grava o `nome` da matéria-prima pela função
 * `superadmin_renomear_materia_prima` (migração 20261027000010), que confere que a matéria-prima é DESTA empresa, que o nome tem de 1 a 80
 * caracteres e que a empresa não tem outra com o mesmo nome (sem olhar a caixa), e loga antes e depois na mesma transação. A chave da
 * árvore é o nome: a tela só renomeia sem alteração pendente, e relê a árvore depois.
 *
 * 1:1, sem lógica própria além do formato. O autor é o usuário da sessão; `por` no corpo é erro. Os erros da função vêm com a mensagem
 * dela (42501, P0002, 22023). O portão (super admin ou 404; empresa uuid e existente, ou 404) está em
 * `src/lib/atendimentos-ia/base-de-conhecimento-servidor.ts`.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { superAdminOu404 } from '@/lib/get-caller-tenant'
import { lerCorpoDoNomeDaMateriaPrima } from '@/lib/atendimentos-ia/base-de-conhecimento'
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

        const corpo = lerCorpoDoNomeDaMateriaPrima(req.body)
        if (corpo.erros.length > 0) return recusaNomeada(res, corpo.erros)
        return gravarPelaFuncaoComAMensagemDela(res, 'superadmin_renomear_materia_prima', {
            p_tenant: tenantId, p_por: caller.user_id, p_materia_prima: corpo.materia_prima, p_nome: corpo.nome,
        })
    } catch (e) {
        return falhaDeLeitura(res, e)
    }
}
