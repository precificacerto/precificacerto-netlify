/**
 * /api/atendimentos-ia/orcamentos/atravessar — a AÇÃO MANUAL da travessia (dono do produto, 10/11/2026): atravessa UM levantamento, o que veio
 * no corpo (`levantamento_id`), nunca todos. GET lista os levantamentos COMPLETOS da empresa, com o orçamento de cada um (para a tela escolher).
 * O tenant é o do usuário logado (`chamadorDoOrcamentista`); o `tenant_id` do corpo nunca é lido. Já atravessado: 409 nomeando o orçamento.
 * UM ORÇAMENTO POR FAMÍLIA (23/11/2026): o POST devolve `{ orcamentos: [...] }`, um por família criada.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { chamadorDoOrcamentista, MODULO_DO_ORCAMENTISTA } from '@/lib/atendimentos-ia/orcamentista-da-empresa'
import { numeroExibidoDoOrcamento } from '@/lib/atendimentos-ia/numero-do-orcamento-servidor'
import { atravessarLevantamento, levantamentosParaAtravessar, ErroDaTravessia, ErroJaAtravessado } from '@/lib/atendimentos-ia/travessia-do-levantamento'
import { responderErroDoOrcamento } from '@/lib/atendimentos-ia/orcamentos-ia-rota'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const caller = await chamadorDoOrcamentista(req, res, req.method === 'GET' ? 'ver' : 'editar', MODULO_DO_ORCAMENTISTA)
    if (!caller) return
    try {
        if (req.method === 'GET') return res.status(200).json({ levantamentos: await levantamentosParaAtravessar(caller.tenant_id) })
        const corpo = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>
        const id = corpo.levantamento_id
        if (typeof id !== 'string' || id.trim() === '') return res.status(400).json({ error: 'Escolha UM levantamento para atravessar.' })
        const criados = await atravessarLevantamento(caller.tenant_id, id.trim())
        // o NÚMERO EXIBIDO (23/11/2026) de cada orçamento criado, relido do banco; a leitura que falha fica com o número próprio
        const orcamentos = await Promise.all(criados.map(async (c) => ({
            ...c, orcamento: { ...c.orcamento, numero_exibido: await numeroExibidoDoOrcamento(caller.tenant_id, c.orcamento.id).catch(() => String(c.orcamento.numero)) },
        })))
        return res.status(201).json({ orcamentos })
    } catch (e) {
        if (e instanceof ErroJaAtravessado) {
            const numero_exibido = await numeroExibidoDoOrcamento(caller.tenant_id, e.orcamentoId).catch(() => String(e.orcamentoNumero))
            return res.status(409).json({ error: e.message, orcamento: { id: e.orcamentoId, numero: e.orcamentoNumero, numero_exibido } })
        }
        if (e instanceof ErroDaTravessia) return res.status(422).json({ error: 'O levantamento não atravessa.', recusas: e.recusas })
        return responderErroDoOrcamento(res, e, 'atravessar')
    }
}
