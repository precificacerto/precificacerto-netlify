/**
 * /api/atendimentos-ia/orcamentos/[id]/relatorio-de-materiais — o RELATÓRIO DE MATERIAIS do orçamento I.A. (16/11/2026): GET, só leitura.
 * Os materiais que o cálculo gravou, somados por código e agrupados pela categoria da base de conhecimento (`relatorio-de-materiais.ts`).
 * Quem pode ver o orçamentista lê; o tenant é o do usuário logado.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { chamadorDoOrcamentista, MODULO_DO_ORCAMENTISTA } from '@/lib/atendimentos-ia/orcamentista-da-empresa'
import { ErroNaoEncontrado } from '@/lib/atendimentos-ia/orcamentos-ia'
import { responderErroDoOrcamento } from '@/lib/atendimentos-ia/orcamentos-ia-rota'
import { lerRelatorioDeMateriais } from '@/lib/atendimentos-ia/relatorio-de-materiais-servidor'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
    const caller = await chamadorDoOrcamentista(req, res, 'ver', MODULO_DO_ORCAMENTISTA)
    if (!caller) return
    const id = typeof req.query.id === 'string' ? req.query.id : ''
    try {
        if (!UUID.test(id)) throw new ErroNaoEncontrado()
        return res.status(200).json({ relatorio: await lerRelatorioDeMateriais(caller.tenant_id, id) })
    } catch (e) {
        return responderErroDoOrcamento(res, e, 'relatorio-de-materiais')
    }
}
