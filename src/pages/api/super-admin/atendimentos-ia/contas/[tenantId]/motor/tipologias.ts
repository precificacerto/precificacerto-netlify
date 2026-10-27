/**
 * GET /api/super-admin/atendimentos-ia/contas/[tenantId]/motor/tipologias?tabela=<uuid> | ?motor=<uuid> — as
 * tipologias do motor (a aba Detalhe), com as medidas e o tempo de fabricação. `tabela` é o motor preso à tabela do
 * fornecedor; `motor` é a PLANILHA (`orcamentista_motor`). Só o que a conta USA (tabela de fornecedor vinculado;
 * planilha ativa de fornecedor vinculado); o de outra conta é 404. Só o super admin. Só lê.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { superAdminOu404 } from '@/lib/get-caller-tenant'
import { contaUsaAPlanilha, contaUsaATabela, lerTipologiasDoMotor } from '@/lib/atendimentos-ia/motor-da-conta'
import { ehUuid } from '@/utils/atendimentos-ia-catalogo'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const caller = await superAdminOu404(req, res)
    if (!caller) return
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET')
        return res.status(405).json({ error: 'Method not allowed' })
    }
    const { tenantId, tabela, motor } = req.query as { tenantId?: string; tabela?: string; motor?: string }
    if (tabela !== undefined && motor !== undefined) return res.status(400).json({ error: 'Diga a tabela ou o motor, não os dois.' })
    const alvo = motor !== undefined ? motor : tabela
    if (!ehUuid(tenantId) || !ehUuid(alvo)) return res.status(404).json({ error: 'Motor não encontrado nesta conta.' })
    try {
        const daPlanilha = motor !== undefined
        if (!(await (daPlanilha ? contaUsaAPlanilha(tenantId, alvo) : contaUsaATabela(tenantId, alvo)))) return res.status(404).json({ error: 'Motor não encontrado nesta conta.' })
        return res.status(200).json(await lerTipologiasDoMotor(alvo, daPlanilha ? 'motor_id' : 'tabela_id'))
    } catch (e) {
        console.error('[MOTOR] tipologias:', e instanceof Error ? e.message : 'erro')
        return res.status(500).json({ error: 'Não foi possível ler as tipologias.' })
    }
}
