/**
 * /api/atendimentos-ia/orcamentos/[id]/arquivo — o ÚLTIMO arquivo "Orçamento" gerado (o PDF que o salvar da precificação gravou, 11/11/2026), lido do
 * bucket pela linha mais nova de `orcamentista_orcamento_arquivo`, no tenant do chamador. GET só lê (permissão de VER; `?download=1` baixa em vez de
 * mostrar); sem arquivo ainda: 404 dizendo isso.
 *
 * POST (pedido 0051, 27/11/2026: o PDF é regerado a cada cálculo e a cada salvamento; permissão de EDITAR): `{ "modo": "precificar" }`, depois do
 * "Calcular", forma o preço como o agente (o mesmo caminho do "sim" da conversa, sem envio) e grava o arquivo; sem o modo, regera o arquivo com os
 * números JÁ gravados, sem recalcular nada. O preço que falta volta como 422 com as faltas nomeadas.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { chamadorDoOrcamentista, MODULO_DO_ORCAMENTISTA } from '@/lib/atendimentos-ia/orcamentista-da-empresa'
import { lerUltimoArquivo } from '@/lib/atendimentos-ia/arquivo-do-orcamento-servidor'
import { regerarOArquivo } from '@/lib/atendimentos-ia/orcamento-precificado'
import { precificarComoAgente } from '@/lib/atendimentos-ia/preco-do-orcamento-servidor'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const FRASE_SEM_ARQUIVO = 'Este orçamento ainda não tem arquivo: ele é gerado ao salvar a precificação.'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const caller = await chamadorDoOrcamentista(req, res, req.method === 'GET' ? 'ver' : 'editar', MODULO_DO_ORCAMENTISTA)
    if (!caller) return
    const id = typeof req.query.id === 'string' ? req.query.id : ''
    if (!UUID.test(id)) return res.status(404).json({ error: 'Orçamento não encontrado.' })
    try {
        if (req.method === 'POST') {
            const modo = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>).modo : undefined
            if (modo === 'precificar') {
                const p = await precificarComoAgente(caller.tenant_id, id)
                if ('faltas' in p) return res.status(422).json({ error: 'O preço não se formou, e por isso o arquivo não foi gerado.', recusas: p.faltas })
                if (!p.gravado.arquivo) return res.status(422).json({ error: 'O preço foi salvo, mas o arquivo não saiu.', recusas: p.gravado.recusasDoArquivo })
                return res.status(200).json({ ok: true })
            }
            const r = await regerarOArquivo(caller.tenant_id, id)
            if ('recusas' in r) return res.status(422).json({ error: 'O arquivo não foi regerado.', recusas: r.recusas })
            return res.status(200).json({ ok: true })
        }
        const a = await lerUltimoArquivo(caller.tenant_id, id)
        if (!a) return res.status(404).json({ error: FRASE_SEM_ARQUIVO })
        res.setHeader('Content-Type', 'application/pdf')
        res.setHeader('Cache-Control', 'no-store')
        res.setHeader('Content-Disposition', `${req.query.download === '1' ? 'attachment' : 'inline'}; filename="orcamento-${id}.pdf"`)
        return res.status(200).send(a.pdf)
    } catch (e) {
        console.error('[orcamento arquivo]', e instanceof Error ? e.message : e)
        return res.status(500).json({ error: 'Não foi possível ler o arquivo do orçamento.' })
    }
}
