/**
 * /api/atendimentos-ia/levantamentos — a LISTA dos levantamentos da empresa (GET), para os Levantamentos I.A. A permissão é a do módulo
 * `orcamentista` (ver), e a seção tem de estar ligada (`chamadorDoOrcamentista`); o tenant é o do usuário logado, nunca o da query.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { chamadorDoOrcamentista, MODULO_DO_ORCAMENTISTA } from '@/lib/atendimentos-ia/orcamentista-da-empresa'
import { listarLevantamentos } from '@/lib/atendimentos-ia/levantamentos-ia'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
    const caller = await chamadorDoOrcamentista(req, res, 'ver', MODULO_DO_ORCAMENTISTA)
    if (!caller) return
    try {
        return res.status(200).json({ levantamentos: await listarLevantamentos(caller.tenant_id) })
    } catch (e) {
        console.error('[levantamentos-ia]', e instanceof Error ? e.message : e)
        return res.status(500).json({ error: 'Não foi possível ler os levantamentos.' })
    }
}
