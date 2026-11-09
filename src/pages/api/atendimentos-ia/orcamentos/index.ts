/**
 * /api/atendimentos-ia/orcamentos — a lista dos ORÇAMENTOS I.A. da empresa (GET) e o "Criar orçamento" (POST, origem manual).
 * Migração `20261109000001_orcamento_ia` (pendente até ser aplicada): sem ela, 503 com `FRASE_SEM_MIGRACAO`.
 * A seção, a permissão do módulo `orcamentista` (ver para ler, editar para criar) e o tenant do usuário logado são conferidos por
 * `chamadorDoOrcamentista`; o `tenant_id` do corpo ou da query nunca é lido.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { chamadorDoOrcamentista, MODULO_DO_ORCAMENTISTA } from '@/lib/atendimentos-ia/orcamentista-da-empresa'
import { criarOrcamentoManual, listarOrcamentos } from '@/lib/atendimentos-ia/orcamentos-ia'
import { responderErroDoOrcamento } from '@/lib/atendimentos-ia/orcamentos-ia-rota'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const caller = await chamadorDoOrcamentista(req, res, req.method === 'GET' ? 'ver' : 'editar', MODULO_DO_ORCAMENTISTA)
    if (!caller) return
    try {
        if (req.method === 'GET') return res.status(200).json({ orcamentos: await listarOrcamentos(caller.tenant_id) })
        const corpo = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, unknown>
        return res.status(201).json({ orcamento: await criarOrcamentoManual(caller.tenant_id, caller.user_id, { nome: corpo.nome, obs: corpo.obs }) })
    } catch (e) {
        return responderErroDoOrcamento(res, e, 'orcamentos')
    }
}
