/**
 * /api/super-admin/base-de-conhecimento/materia-prima?tenant=<uuid>
 *   PUT    → `superadmin_gravar_materia_prima`.   corpo: { materias_primas: [{ nome }] }
 *            A chave é `lower(nome)`: a função recusa `id` no item, e por isso NÃO HÁ RENOMEAR — um
 *            nome novo é uma matéria-prima nova (com as 6 categorias vazias), e a antiga fica.
 *   DELETE → `superadmin_remover_materia_prima`.  query: &materia_prima=<uuid>; sem corpo.
 *
 * 1:1, sem lógica própria: o valor vai à função como veio. A ORDEM é a posição na lista — a função
 * recusa `ordem` no corpo. O PUT não apaga: matéria-prima fora da lista fica; quem apaga é o DELETE,
 * que loga a árvore inteira que sai. O autor (`p_por`) é o usuário da sessão; `por` no corpo é erro.
 * Os erros da função vêm traduzidos em status com a mensagem dela (42501, P0002, 22023, 23503).
 *
 * O portão está em `src/lib/atendimentos-ia/base-de-conhecimento-servidor.ts`.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { superAdminOu404 } from '@/lib/get-caller-tenant'
import { errosDoCorpoVazio, lerEnvelope } from '@/lib/atendimentos-ia/base-de-conhecimento'
import {
    empresaDoPedido, falhaDeLeitura, gravarPelaFuncaoComAMensagemDela, idDoQuery, metodoNaoPermitido, recusaNomeada,
} from '@/lib/atendimentos-ia/base-de-conhecimento-servidor'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const caller = await superAdminOu404(req, res)
    if (!caller) return
    if (req.method !== 'PUT' && req.method !== 'DELETE') return metodoNaoPermitido(res, ['PUT', 'DELETE'])

    try {
        const tenantId = await empresaDoPedido(req, res)
        if (!tenantId) return

        if (req.method === 'DELETE') {
            const materiaPrimaId = idDoQuery(req, 'materia_prima')
            if (!materiaPrimaId) return res.status(404).json({ error: 'Matéria-prima não encontrada.' })
            const erros = errosDoCorpoVazio(req.body)
            if (erros.length > 0) return recusaNomeada(res, erros)
            return gravarPelaFuncaoComAMensagemDela(res, 'superadmin_remover_materia_prima', { p_tenant: tenantId, p_por: caller.user_id, p_materia_prima: materiaPrimaId })
        }

        const corpo = lerEnvelope(req.body, 'materias_primas')
        if (corpo.erros.length > 0) return recusaNomeada(res, corpo.erros)
        return gravarPelaFuncaoComAMensagemDela(res, 'superadmin_gravar_materia_prima', { p_tenant: tenantId, p_por: caller.user_id, p_lista: corpo.valor })
    } catch (e) {
        return falhaDeLeitura(res, e)
    }
}
