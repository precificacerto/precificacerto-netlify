/**
 * GET /api/atendimentos-ia/config-de-despesas — a configuração de despesas da empresa (`tenant_expense_config`) que o bloco da precificação do orçamento I.A.
 * precisa para montar o `calcBase`, lida PELO SERVIDOR no tenant do chamador (pedido 0051, 27/11/2026): a tela do Atendimentos I.A. não importa o cliente do
 * Supabase (`atendimentos-ia-a-tela-nao-fala-com-o-banco`), e a leitura do navegador dependia de política de linha que a rota dispensa. Só lê; permissão de VER.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/supabase/admin'
import { chamadorDoOrcamentista, MODULO_DO_ORCAMENTISTA } from '@/lib/atendimentos-ia/orcamentista-da-empresa'

export const FRASE_SEM_CONFIG_DE_DESPESAS = 'Não foi possível ler a configuração de despesas da empresa.'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
    const caller = await chamadorDoOrcamentista(req, res, 'ver', MODULO_DO_ORCAMENTISTA)
    if (!caller) return
    try {
        const { data, error } = await supabaseAdmin.from('tenant_expense_config').select('*').eq('tenant_id', caller.tenant_id).maybeSingle()
        if (error) throw new Error(error.message)
        return res.status(200).json({ config: data ?? null })
    } catch (e) {
        console.error('[config de despesas]', e instanceof Error ? e.message : e)
        return res.status(500).json({ error: FRASE_SEM_CONFIG_DE_DESPESAS })
    }
}
