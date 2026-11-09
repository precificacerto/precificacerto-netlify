/**
 * /api/atendimentos-ia/orcamentos/[id]/precificacao — a PRECIFICAÇÃO FINAL do orçamento I.A. (o 1b, dono do produto, 09/11/2026).
 *   GET: o orçamento com os valores do cálculo e o bloco fiscal, para a tela de precificação (o modo "orçamento" da tela de Produtos).
 *   PATCH: grava o valor de venda, o bloco fiscal e os percentuais NO ORÇAMENTO — nunca em `products`. Recusa nomeando (400) o que falta, e
 *   (409) quando o cálculo gravado não está completo.
 * Ver ver: GET; quem edita: PATCH. O tenant entra em toda leitura e escrita.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { chamadorDoOrcamentista, MODULO_DO_ORCAMENTISTA } from '@/lib/atendimentos-ia/orcamentista-da-empresa'
import { ErroNaoEncontrado } from '@/lib/atendimentos-ia/orcamentos-ia'
import { responderErroDoOrcamento } from '@/lib/atendimentos-ia/orcamentos-ia-rota'
import {
    ErroDoEstado, ErroSemMigracaoDaPrecificacao, FRASE_SEM_MIGRACAO_DA_PRECIFICACAO, gravarPrecificacao, lerOrcamentoParaPrecificar,
} from '@/lib/atendimentos-ia/orcamento-precificado'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET' && req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' })
    const caller = await chamadorDoOrcamentista(req, res, req.method === 'GET' ? 'ver' : 'editar', MODULO_DO_ORCAMENTISTA)
    if (!caller) return
    const id = typeof req.query.id === 'string' ? req.query.id : ''
    try {
        if (!UUID.test(id)) throw new ErroNaoEncontrado()
        if (req.method === 'GET') return res.status(200).json({ orcamento: await lerOrcamentoParaPrecificar(caller.tenant_id, id) })
        const corpo = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>
        return res.status(200).json({ orcamento: await gravarPrecificacao(caller.tenant_id, id, corpo) })
    } catch (e) {
        if (e instanceof ErroDoEstado) return res.status(409).json({ error: e.message })
        if (e instanceof ErroSemMigracaoDaPrecificacao) return res.status(503).json({ error: FRASE_SEM_MIGRACAO_DA_PRECIFICACAO, sem_migracao: true })
        return responderErroDoOrcamento(res, e, 'precificacao')
    }
}
