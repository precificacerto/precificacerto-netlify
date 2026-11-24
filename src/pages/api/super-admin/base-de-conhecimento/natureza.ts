/**
 * /api/super-admin/base-de-conhecimento/natureza?tenant=<uuid> — a TELA DA NATUREZA DA VARIÁVEL (dono do produto, item (3) da ordem, 21/11/2026).
 *
 *   GET → por família da conta: o motor do levantamento, as variáveis dele (opções e tipologias), os formatos das tipologias e as linhas gravadas,
 *         cada política com a conferência contra as tipologias (`tela-da-natureza-servidor.ts`).
 *   PUT → `superadmin_gravar_natureza` (migração `20261121000002`): corpo `{ linha: { familia, formato?, variavel, natureza, opcao_padrao? } }`.
 *         DEFINE ou TROCA a linha da chave; não remove (a tela diz). As CHECKs da tabela são recusa nomeada AQUI, antes da função
 *         (`lerLinhaDaTela`); o que a função recusa (a família que não é da empresa, 22023) volta com a mensagem dela. O autor é o da sessão.
 *         O padrão do VIDRO é uma REFERÊNCIA (`codigo_wvetro`) da tabela de vidro do fornecedor principal (dono do produto, 24/11/2026): a que
 *         ela não tem é recusa nomeada (422), antes da função.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { superAdminOu404 } from '@/lib/get-caller-tenant'
import { empresaDoPedido, falhaDeLeitura, gravarPelaFuncaoComAMensagemDela, metodoNaoPermitido } from '@/lib/atendimentos-ia/base-de-conhecimento-servidor'
import { lerLinhaDaTela } from '@/lib/atendimentos-ia/tela-da-natureza'
import { lerTelaDaNatureza, recusaDoVidroDaLinha } from '@/lib/atendimentos-ia/tela-da-natureza-servidor'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const caller = await superAdminOu404(req, res)
    if (!caller) return
    if (req.method !== 'GET' && req.method !== 'PUT') return metodoNaoPermitido(res, ['GET', 'PUT'])
    try {
        const tenantId = await empresaDoPedido(req, res)
        if (!tenantId) return
        if (req.method === 'GET') return res.status(200).json(await lerTelaDaNatureza(tenantId))
        const lida = lerLinhaDaTela(req.body)
        if (lida.ok === false) return res.status(400).json({ error: lida.erros.join(' '), erros: lida.erros })
        const recusa = await recusaDoVidroDaLinha(tenantId, lida.linha)
        if (recusa !== null) return res.status(422).json({ error: recusa })
        return gravarPelaFuncaoComAMensagemDela(res, 'superadmin_gravar_natureza', { p_tenant: tenantId, p_por: caller.user_id, p_linha: lida.linha })
    } catch (e) {
        return falhaDeLeitura(res, e)
    }
}
