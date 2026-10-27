/**
 * GET /api/super-admin/atendimentos-ia/contas/[tenantId]/motor/tipologia?tabela=<uuid> | ?motor=<uuid>&tipologia=<código>
 * — as abas de UMA tipologia (Perfis, Fórmulas, Variáveis, Vidros, Baguetes, Insumos, Validações), inteiras e na
 * ordem do arquivo. `tabela` é o motor preso à tabela do fornecedor; `motor` é a PLANILHA. Só o que a conta USA; o de
 * outra conta é 404. Só o super admin. Só lê.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { superAdminOu404 } from '@/lib/get-caller-tenant'
import { contaUsaAPlanilha, contaUsaATabela, lerAbasDaTipologia } from '@/lib/atendimentos-ia/motor-da-conta'
import { ehUuid } from '@/utils/atendimentos-ia-catalogo'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const caller = await superAdminOu404(req, res)
    if (!caller) return
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET')
        return res.status(405).json({ error: 'Method not allowed' })
    }
    const { tenantId, tabela, motor, tipologia } = req.query as { tenantId?: string; tabela?: string; motor?: string; tipologia?: string }
    if (tabela !== undefined && motor !== undefined) return res.status(400).json({ error: 'Diga a tabela ou o motor, não os dois.' })
    const alvo = motor !== undefined ? motor : tabela
    if (!ehUuid(tenantId) || !ehUuid(alvo)) return res.status(404).json({ error: 'Motor não encontrado nesta conta.' })
    if (typeof tipologia !== 'string' || tipologia.trim() === '') return res.status(400).json({ error: 'Diga a tipologia.' })
    try {
        const daPlanilha = motor !== undefined
        if (!(await (daPlanilha ? contaUsaAPlanilha(tenantId, alvo) : contaUsaATabela(tenantId, alvo)))) return res.status(404).json({ error: 'Motor não encontrado nesta conta.' })
        return res.status(200).json(await lerAbasDaTipologia(alvo, tipologia, daPlanilha ? 'motor_id' : 'tabela_id'))
    } catch (e) {
        console.error('[MOTOR] tipologia:', e instanceof Error ? e.message : 'erro')
        return res.status(500).json({ error: 'Não foi possível ler as abas da tipologia.' })
    }
}
