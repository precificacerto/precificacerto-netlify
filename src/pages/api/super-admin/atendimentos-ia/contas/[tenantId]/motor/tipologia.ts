/**
 * GET /api/super-admin/atendimentos-ia/contas/[tenantId]/motor/tipologia?tabela=<uuid>&tipologia=<código> —
 * as abas de UMA tipologia da tabela (Perfis, Fórmulas, Variáveis, Vidros, Baguetes, Insumos, Validações),
 * inteiras e na ordem do arquivo. Só tabela EM USO na conta; a de outra conta é 404. Só o super admin. Só lê.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { superAdminOu404 } from '@/lib/get-caller-tenant'
import { contaUsaATabela, lerAbasDaTipologia } from '@/lib/atendimentos-ia/motor-da-conta'
import { ehUuid } from '@/utils/atendimentos-ia-catalogo'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const caller = await superAdminOu404(req, res)
    if (!caller) return
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET')
        return res.status(405).json({ error: 'Method not allowed' })
    }
    const { tenantId, tabela, tipologia } = req.query as { tenantId?: string; tabela?: string; tipologia?: string }
    if (!ehUuid(tenantId) || !ehUuid(tabela)) return res.status(404).json({ error: 'Tabela não encontrada nesta conta.' })
    if (typeof tipologia !== 'string' || tipologia.trim() === '') return res.status(400).json({ error: 'Diga a tipologia.' })
    try {
        if (!(await contaUsaATabela(tenantId, tabela))) return res.status(404).json({ error: 'Tabela não encontrada nesta conta.' })
        return res.status(200).json(await lerAbasDaTipologia(tabela, tipologia))
    } catch (e) {
        console.error('[MOTOR] tipologia:', e instanceof Error ? e.message : 'erro')
        return res.status(500).json({ error: 'Não foi possível ler as abas da tipologia.' })
    }
}
