/**
 * /api/atendimentos-ia/orcamentos/[id]/orientativo-de-montagem — O ORIENTATIVO DE MONTAGEM do orçamento I.A. (22/11/2026): GET, SÓ LEITURA.
 * Por esquadria: o desenho, os perfis (com a Obs. da linha do motor), os acessórios, o vidro e os serviços (`orientativo-de-montagem.ts`).
 * Não grava nada e não toca no preço: o recálculo (`custoDeAgora`) só lê.
 * Sem a migração 20261117000001, 503 com a frase. Quem pode ver o orçamentista lê; o tenant é o do usuário logado.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { chamadorDoOrcamentista, MODULO_DO_ORCAMENTISTA } from '@/lib/atendimentos-ia/orcamentista-da-empresa'
import { ErroNaoEncontrado } from '@/lib/atendimentos-ia/orcamentos-ia'
import { responderErroDoOrcamento } from '@/lib/atendimentos-ia/orcamentos-ia-rota'
import { lerOrientativoDeMontagem } from '@/lib/atendimentos-ia/orientativo-de-montagem-servidor'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
    const caller = await chamadorDoOrcamentista(req, res, 'ver', MODULO_DO_ORCAMENTISTA)
    if (!caller) return
    const id = typeof req.query.id === 'string' ? req.query.id : ''
    try {
        if (!UUID.test(id)) throw new ErroNaoEncontrado()
        const relatorio = await lerOrientativoDeMontagem(caller.tenant_id, id)
        if ('semMigracao' in relatorio) return res.status(503).json({ error: relatorio.semMigracao, sem_migracao: true })
        return res.status(200).json({ relatorio })
    } catch (e) {
        return responderErroDoOrcamento(res, e, 'orientativo-de-montagem')
    }
}
