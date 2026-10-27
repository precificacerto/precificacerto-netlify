/**
 * GET /api/super-admin/atendimentos-ia/familias/[chave]/etapas — as etapas da família, na ordem.
 * PUT /api/super-admin/atendimentos-ia/familias/[chave]/etapas — grava `{ etapas: [...] }`, a LISTA INTEIRA na
 *     ordem desejada (a posição é o número), pela função `superadmin_gravar_etapas_da_familia` (migração
 *     20261027000003), que loga na mesma transação. Item com `id` edita; sem `id`, cria. NÃO remove etapa.
 *
 * O rótulo é livre; a AÇÃO é de uma lista fechada (`ACOES_DA_ETAPA`): etapa sem ação da lista é erro, não etapa
 * nova. A rota confere o corpo ANTES da função, com a frase que diz qual etapa e por quê; a função e a CHECK do
 * banco conferem de novo. A mensagem da função vai na resposta nos códigos de `STATUS_COM_A_MENSAGEM_DA_FUNCAO`.
 *
 * Etapa é do catálogo da plataforma: só o super admin (os outros recebem 404). Nada aqui toca o cálculo.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { superAdminOu404 } from '@/lib/get-caller-tenant'
import { lerEtapasDaFamilia } from '@/lib/atendimentos-ia/etapas-da-familia'
import { gravarPelaFuncaoComAMensagemDela, metodoNaoPermitido } from '@/lib/atendimentos-ia/base-de-conhecimento-servidor'
import { lerCorpoDasEtapas } from '@/utils/atendimentos-ia-etapas'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const caller = await superAdminOu404(req, res)
    if (!caller) return
    if (req.method !== 'GET' && req.method !== 'PUT') return metodoNaoPermitido(res, ['GET', 'PUT'])

    const { chave } = req.query as { chave?: string }
    if (typeof chave !== 'string' || chave.trim() === '') return res.status(404).json({ error: 'Família não encontrada.' })

    try {
        if (req.method === 'GET') {
            const etapas = await lerEtapasDaFamilia(chave)
            if (etapas === null) return res.status(404).json({ error: 'Família não encontrada.' })
            return res.status(200).json({ familia: chave, etapas })
        }

        const corpo = lerCorpoDasEtapas(req.body)
        if (corpo.ok === false) return res.status(400).json({ error: corpo.erro })
        return gravarPelaFuncaoComAMensagemDela(res, 'superadmin_gravar_etapas_da_familia', { p_familia: chave, p_por: caller.user_id, p_etapas: corpo.etapas })
    } catch (e) {
        console.error('[ETAPAS]', req.method, e instanceof Error ? e.message : 'erro')
        return res.status(500).json({ error: req.method === 'GET' ? 'Não foi possível ler as etapas.' : 'Falha ao gravar.' })
    }
}
