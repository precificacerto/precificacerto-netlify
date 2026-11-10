/**
 * /api/atendimentos-ia/levantamentos/[id]/arquivo — o ARQUIVO (PDF) de um levantamento da empresa: a MESMA folha que a conversa envia ao
 * vendedor, montada do que está gravado (`arquivoDoLevantamentoGravado`). Só lê. O levantamento de outra empresa é "não encontrado"; a folha
 * que não fecha volta 422 com as recusas nomeadas.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { chamadorDoOrcamentista, MODULO_DO_ORCAMENTISTA } from '@/lib/atendimentos-ia/orcamentista-da-empresa'
import { arquivoDoLevantamentoGravado } from '@/lib/atendimentos-ia/conversa-da-ia'
import { FRASE_DO_LEVANTAMENTO_NAO_ACHADO as FRASE_NAO_ACHADO } from '@/lib/atendimentos-ia/arquivo-do-levantamento'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
    const caller = await chamadorDoOrcamentista(req, res, 'ver', MODULO_DO_ORCAMENTISTA)
    if (!caller) return
    const id = typeof req.query.id === 'string' ? req.query.id : ''
    if (!UUID.test(id)) return res.status(404).json({ error: FRASE_NAO_ACHADO })
    try {
        const folha = await arquivoDoLevantamentoGravado(caller.tenant_id, id)
        if ('recusas' in folha) {
            if (folha.recusas.length === 1 && folha.recusas[0] === FRASE_NAO_ACHADO) return res.status(404).json({ error: FRASE_NAO_ACHADO })
            return res.status(422).json({ error: 'O arquivo do levantamento não fecha.', recusas: folha.recusas })
        }
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', `inline; filename="${folha.nomeDoArquivo.replace(/"/g, '')}"`)
        return res.status(200).send(Buffer.from(folha.pdf))
    } catch (e) {
        console.error('[levantamentos-ia arquivo]', e instanceof Error ? e.message : e)
        return res.status(500).json({ error: 'Não foi possível gerar o arquivo do levantamento.' })
    }
}
