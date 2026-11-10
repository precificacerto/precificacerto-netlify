/**
 * POST /api/atendimentos-ia/orcamentos/[id]/calcular — CALCULA o orçamento I.A. pelo caminho completo e GRAVA o resultado no orçamento (o 1b,
 * dono do produto, 09/11/2026): a relação de materiais de cada item (oculta na tela), os valores de cada item e os totais. Quem pode EDITAR
 * os orçamentos calcula. Nada evolui com falta: a recusa é 422 com as faltas nomeadas, e nada é gravado.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { chamadorDoOrcamentista, MODULO_DO_ORCAMENTISTA } from '@/lib/atendimentos-ia/orcamentista-da-empresa'
import { ErroNaoEncontrado } from '@/lib/atendimentos-ia/orcamentos-ia'
import { responderErroDoOrcamento } from '@/lib/atendimentos-ia/orcamentos-ia-rota'
import { calcularOrcamento, ErroDoCalculo, ErroSemMigracaoDoCalculo, FRASE_SEM_MIGRACAO_DO_CALCULO } from '@/lib/atendimentos-ia/orcamento-calculado'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const FRASE_DO_CALCULO_RECUSADO = 'O orçamento não foi calculado: falta o que está abaixo, e nada foi gravado.'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const caller = await chamadorDoOrcamentista(req, res, 'editar', MODULO_DO_ORCAMENTISTA)
    if (!caller) return
    const id = typeof req.query.id === 'string' ? req.query.id : ''
    try {
        if (!UUID.test(id)) throw new ErroNaoEncontrado()
        const calculo = await calcularOrcamento(caller.tenant_id, id)
        return res.status(200).json({ calculo, avisos: calculo.avisos })
    } catch (e) {
        if (e instanceof ErroDoCalculo) return res.status(422).json({ error: FRASE_DO_CALCULO_RECUSADO, recusas: e.recusas })
        if (e instanceof ErroSemMigracaoDoCalculo) return res.status(503).json({ error: FRASE_SEM_MIGRACAO_DO_CALCULO, sem_migracao: true })
        return responderErroDoOrcamento(res, e, 'calcular')
    }
}
