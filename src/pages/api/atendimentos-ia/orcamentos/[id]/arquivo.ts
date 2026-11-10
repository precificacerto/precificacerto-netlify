/**
 * /api/atendimentos-ia/orcamentos/[id]/arquivo — o ÚLTIMO arquivo "Orçamento" gerado (o PDF que o salvar da precificação gravou, 11/11/2026), lido do
 * bucket pela linha mais nova de `orcamentista_orcamento_arquivo`, no tenant do chamador. Só lê; permissão de VER. Sem arquivo ainda: 404 dizendo isso.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { chamadorDoOrcamentista, MODULO_DO_ORCAMENTISTA } from '@/lib/atendimentos-ia/orcamentista-da-empresa'
import { lerUltimoArquivo } from '@/lib/atendimentos-ia/arquivo-do-orcamento-servidor'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const FRASE_SEM_ARQUIVO = 'Este orçamento ainda não tem arquivo: ele é gerado ao salvar a precificação.'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
    const caller = await chamadorDoOrcamentista(req, res, 'ver', MODULO_DO_ORCAMENTISTA)
    if (!caller) return
    const id = typeof req.query.id === 'string' ? req.query.id : ''
    if (!UUID.test(id)) return res.status(404).json({ error: 'Orçamento não encontrado.' })
    try {
        const a = await lerUltimoArquivo(caller.tenant_id, id)
        if (!a) return res.status(404).json({ error: FRASE_SEM_ARQUIVO })
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Content-Disposition', `inline; filename="orcamento-${id}.pdf"`)
        return res.status(200).send(a.pdf)
    } catch (e) {
        console.error('[orcamento arquivo]', e instanceof Error ? e.message : e)
        return res.status(500).json({ error: 'Não foi possível ler o arquivo do orçamento.' })
    }
}
