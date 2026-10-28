/**
 * POST /api/super-admin/atendimentos-ia/contas/[tenantId]/motor/arquivar — `{ motor }`: ARQUIVA a planilha do
 * motor (`orcamentista_motor`) pela função `superadmin_arquivar_motor` (migração 20261027000003), que grava
 * `arquivado_em` e `arquivado_por`, tira a marca de vigente e loga na mesma transação.
 *
 * EXCLUIR É ARQUIVAR (dono do produto, 27/10/2026). Motor arquivado sai da lista e da conversa; o dado fica. Esta
 * rota NÃO exclui nada e não existe outra que exclua: DELETE só com autorização explícita do dono do produto, e
 * recusado enquanto houver levantamento ou tempo pendurado (`motor_id` é RESTRICT: são 62.299 linhas do motor; os 164 tempos
 * ESTIMADO têm 3 valores, 600/300/900, preenchidos por regra — correção de 27/10/2026). Só a planilha DESTA conta (ativa, de fornecedor que a conta vincula); outra é 404.
 * Só o super admin (os outros recebem 404).
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { superAdminOu404 } from '@/lib/get-caller-tenant'
import { contaUsaAPlanilha } from '@/lib/atendimentos-ia/motor-da-conta'
import { gravarPelaFuncaoComAMensagemDela, metodoNaoPermitido } from '@/lib/atendimentos-ia/base-de-conhecimento-servidor'
import { ehUuid } from '@/utils/atendimentos-ia-catalogo'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const caller = await superAdminOu404(req, res)
    if (!caller) return
    if (req.method !== 'POST') return metodoNaoPermitido(res, ['POST'])
    const { tenantId } = req.query as { tenantId?: string }
    const motor = req.body && typeof req.body === 'object' ? (req.body as { motor?: unknown }).motor : undefined
    if (!ehUuid(tenantId) || !ehUuid(motor)) return res.status(404).json({ error: 'Motor não encontrado nesta conta.' })
    try {
        if (!(await contaUsaAPlanilha(tenantId, motor))) return res.status(404).json({ error: 'Motor não encontrado nesta conta.' })
        return gravarPelaFuncaoComAMensagemDela(res, 'superadmin_arquivar_motor', { p_motor: motor, p_por: caller.user_id })
    } catch (e) {
        console.error('[MOTOR] arquivar:', e instanceof Error ? e.message : 'erro')
        return res.status(500).json({ error: 'Falha ao arquivar.' })
    }
}
