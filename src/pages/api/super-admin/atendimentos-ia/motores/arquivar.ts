/**
 * POST /api/super-admin/atendimentos-ia/motores/arquivar — `{ motor_id }`: arquiva um motor do catálogo pela função `superadmin_arquivar_motor`
 * (migração 20261029000005), que loga na mesma transação. ARQUIVAR NÃO APAGA: o conteúdo continua, e o motor sai do combo das etapas.
 *
 * ARQUIVAR MOTOR EM USO É PERMITIDO (dono do produto, 29/10/2026: "Excluir um motor que esteja vinculado a uma família ou etapa não é problema.
 * [...] eu posso apontar um outro motor [...] Aí ele volta a funcionar."): as etapas que o usam ficam SEM MOTOR, cada uma logada com o tenant
 * dela, e a resposta é `{ depois: { orcamentista_motor, etapas_sem_motor: [{ empresa, familia, numero, rotulo, … }] } }` — a tela diz onde repor.
 * O item de levantamento já gravado não é tocado. A recusa da função vai com a mensagem dela (42501→403, P0002→404, 22023→400). O autor é o
 * usuário da sessão; campo a mais no corpo é erro.
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
