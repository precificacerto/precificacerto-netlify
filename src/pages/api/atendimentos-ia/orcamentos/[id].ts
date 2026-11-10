/**
 * /api/atendimentos-ia/orcamentos/[id] — um ORÇAMENTO I.A. com os itens (GET) e a ALTERAÇÃO MANUAL (PATCH: o cabeçalho, os itens com `id` e os
 * novos). Não há DELETE: o item que não vem no corpo fica como está. Toda alteração grava a marca da edição manual.
 * O GET do orçamento do agente traz também o cliente e o vendedor, lidos do levantamento de origem, e as faltas do que ele congelou.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { chamadorDoOrcamentista, MODULO_DO_ORCAMENTISTA } from '@/lib/atendimentos-ia/orcamentista-da-empresa'
import { alterarOrcamento, ErroNaoEncontrado, lerOrcamento } from '@/lib/atendimentos-ia/orcamentos-ia'
import { responderErroDoOrcamento } from '@/lib/atendimentos-ia/orcamentos-ia-rota'
import { faltasDoOrcamento, lerClienteDoLevantamento } from '@/lib/atendimentos-ia/travessia-do-levantamento'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET' && req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' })
    const caller = await chamadorDoOrcamentista(req, res, req.method === 'GET' ? 'ver' : 'editar', MODULO_DO_ORCAMENTISTA)
    if (!caller) return
    const id = typeof req.query.id === 'string' ? req.query.id : ''
    try {
        if (!UUID.test(id)) throw new ErroNaoEncontrado()
        if (req.method === 'GET') {
            const orcamento = await lerOrcamento(caller.tenant_id, id)
            // o cliente e o vendedor do orçamento do agente vêm do levantamento de origem (lidos, nunca copiados); e as faltas do que ele congelou
            const cliente = await lerClienteDoLevantamento(caller.tenant_id, orcamento.levantamento_id)
            const faltas = await faltasDoOrcamento(caller.tenant_id, id)
            return res.status(200).json({ orcamento, cliente, faltas })
        }
        const corpo = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>
        return res.status(200).json({ orcamento: await alterarOrcamento(caller.tenant_id, caller.user_id, id, { nome: corpo.nome, obs: corpo.obs, itens: corpo.itens }) })
    } catch (e) {
        return responderErroDoOrcamento(res, e, 'orcamento')
    }
}
