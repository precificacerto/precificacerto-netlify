/**
 * /api/super-admin/base-de-conhecimento/textos-do-caminho?tenant=<uuid> — os TEXTOS da empresa por FAMÍLIA e por FORNECEDOR (dono do produto,
 * 20/11/2026, item (4) da ordem; migração 20261121000003). A leitura vai com a tela da natureza (`natureza.ts`, GET).
 *
 *   PUT → `superadmin_gravar_texto_do_caminho`: corpo `{ familia, texto }` OU `{ fornecedor_id, texto }`. Texto aparado; vazio ou null LIMPA
 *         (grava null, não apaga a linha). A forma é recusa nomeada AQUI (`lerCorpoDoTexto`); a família fora da empresa e o fornecedor fora do
 *         caminho dela a função recusa (22023), com a mensagem dela. O autor é o da sessão.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { superAdminOu404 } from '@/lib/get-caller-tenant'
import { empresaDoPedido, falhaDeLeitura, gravarPelaFuncaoComAMensagemDela, metodoNaoPermitido } from '@/lib/atendimentos-ia/base-de-conhecimento-servidor'
import { lerCorpoDoTexto } from '@/lib/atendimentos-ia/textos-do-caminho'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const caller = await superAdminOu404(req, res)
    if (!caller) return
    if (req.method !== 'PUT') return metodoNaoPermitido(res, ['PUT'])
    try {
        const tenantId = await empresaDoPedido(req, res)
        if (!tenantId) return
        const lido = lerCorpoDoTexto(req.body)
        if (lido.ok === false) return res.status(400).json({ error: lido.erros.join(' '), erros: lido.erros })
        return gravarPelaFuncaoComAMensagemDela(res, 'superadmin_gravar_texto_do_caminho', { p_tenant: tenantId, p_por: caller.user_id, p_alvo: lido.alvo })
    } catch (e) {
        return falhaDeLeitura(res, e)
    }
}
