/**
 * /api/atendimentos-ia/orcamentos/[id]/relatorio-de-corte — o RELATÓRIO DE CORTE do orçamento I.A. (16/11/2026): GET, só leitura.
 * As peças que o cálculo gravou, por código e categoria, com o plano de barras pela barra e pela serra gravadas (`relatorio-de-corte.ts`).
 * Sem a migração 20261117000001, 503 com a frase. Quem pode ver o orçamentista lê; o tenant é o do usuário logado.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { chamadorDoOrcamentista, MODULO_DO_ORCAMENTISTA } from '@/lib/atendimentos-ia/orcamentista-da-empresa'
import { ErroNaoEncontrado } from '@/lib/atendimentos-ia/orcamentos-ia'
import { responderErroDoOrcamento } from '@/lib/atendimentos-ia/orcamentos-ia-rota'
import { lerRelatorioDeCorte } from '@/lib/atendimentos-ia/relatorio-de-corte-servidor'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
    const caller = await chamadorDoOrcamentista(req, res, 'ver', MODULO_DO_ORCAMENTISTA)
    if (!caller) return
    const id = typeof req.query.id === 'string' ? req.query.id : ''
    try {
        if (!UUID.test(id)) throw new ErroNaoEncontrado()
        const relatorio = await lerRelatorioDeCorte(caller.tenant_id, id)
        if ('semMigracao' in relatorio) return res.status(503).json({ error: relatorio.semMigracao, sem_migracao: true })
        return res.status(200).json({ relatorio })
    } catch (e) {
        return responderErroDoOrcamento(res, e, 'relatorio-de-corte')
    }
}
