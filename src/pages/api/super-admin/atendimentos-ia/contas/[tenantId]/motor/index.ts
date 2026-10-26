/**
 * GET /api/super-admin/atendimentos-ia/contas/[tenantId]/motor — o BLOCO MOTOR da conta: por tabela em uso
 * na conta, o fornecedor, a família, as contas que a usam, as linhas, a contagem exata de cada aba e a
 * otimização; a lista das famílias; e o critério de custo das barras de cada matéria-prima.
 *
 * Só o super admin; quem não é recebe 404. Só lê — ver `src/lib/atendimentos-ia/motor-da-conta.ts`.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { superAdminOu404 } from '@/lib/get-caller-tenant'
import { lerMotorDaConta } from '@/lib/atendimentos-ia/motor-da-conta'
import { ehUuid } from '@/utils/atendimentos-ia-catalogo'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const caller = await superAdminOu404(req, res)
    if (!caller) return
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET')
        return res.status(405).json({ error: 'Method not allowed' })
    }
    const { tenantId } = req.query as { tenantId?: string }
    if (!ehUuid(tenantId)) return res.status(404).json({ error: 'Conta não encontrada.' })
    try {
        return res.status(200).json(await lerMotorDaConta(tenantId))
    } catch (e) {
        console.error('[MOTOR] resumo:', e instanceof Error ? e.message : 'erro')
        return res.status(500).json({ error: 'Não foi possível ler o motor da conta.' })
    }
}
