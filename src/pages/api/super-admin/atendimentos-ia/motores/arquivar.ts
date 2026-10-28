/**
 * POST /api/super-admin/atendimentos-ia/motores/arquivar — `{ motor_id }`: arquiva um motor do catálogo pela função `superadmin_arquivar_motor`
 * (migração 20261028000001), que loga na mesma transação. ARQUIVAR NÃO APAGA: o conteúdo continua, e o motor sai do combo das etapas.
 *
 * A ETAPA VENCE: o motor que alguma etapa aponta não se arquiva — a função recusa nomeando a etapa, a família e a EMPRESA (o motor é global),
 * e a mensagem dela vai na resposta (42501→403, P0002→404, 22023→400). O autor é o usuário da sessão; campo a mais no corpo é erro.
 * Só o super admin (os outros recebem 404).
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { superAdminOu404 } from '@/lib/get-caller-tenant'
import { gravarPelaFuncaoComAMensagemDela, metodoNaoPermitido } from '@/lib/atendimentos-ia/base-de-conhecimento-servidor'
import { falhaInterna } from '@/lib/atendimentos-ia/repositorio'
import { lerCorpoDoArquivar } from '@/utils/atendimentos-ia-catalogo-de-motores'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const caller = await superAdminOu404(req, res)
    if (!caller) return
    if (req.method !== 'POST') return metodoNaoPermitido(res, ['POST'])

    const corpo = lerCorpoDoArquivar(req.body)
    if (corpo.ok === false) return res.status(400).json({ error: corpo.erro })
    try {
        return await gravarPelaFuncaoComAMensagemDela(res, 'superadmin_arquivar_motor', { p_motor: corpo.corpo.motor_id, p_por: caller.user_id })
    } catch (e) {
        return falhaInterna(res, 'arquivar motor', e, 'Não foi possível arquivar o motor.')
    }
}
