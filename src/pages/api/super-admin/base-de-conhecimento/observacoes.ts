/**
 * GET e PUT /api/super-admin/base-de-conhecimento/observacoes?tenant=<uuid> — lê e grava as OBSERVAÇÕES que o
 * arquivo do orçamento imprime no bloco "OBSERVAÇÕES" (dono do produto, 16/11/2026).
 *
 * O GET devolve `{ observacoes }` — o texto gravado, ou null. O PUT grava pela função
 * `superadmin_gravar_observacoes_do_orcamento`, que valida, grava e loga na mesma transação.
 *   corpo: { observacoes: "PRAZOS…\nVALIDADE…" | null }
 *
 * O bloco já existia no PDF e saía SEMPRE VAZIO, porque não havia de onde ler o texto (medido em 16/11/2026: nenhuma
 * coluna do banco o guardava). `null` limpa, e o bloco volta a sair vazio.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/supabase/admin'
import { superAdminOu404 } from '@/lib/get-caller-tenant'
import { lerCorpoDasObservacoes } from '@/lib/atendimentos-ia/base-de-conhecimento'
import {
    empresaDoPedido, falhaDeLeitura, gravarPelaFuncaoComAMensagemDela, metodoNaoPermitido, recusaNomeada,
} from '@/lib/atendimentos-ia/base-de-conhecimento-servidor'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const caller = await superAdminOu404(req, res)
    if (!caller) return
    if (req.method !== 'PUT' && req.method !== 'GET') return metodoNaoPermitido(res, ['GET', 'PUT'])

    try {
        const tenantId = await empresaDoPedido(req, res)
        if (!tenantId) return

        if (req.method === 'GET') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a coluna é posterior a `database.types.ts`
            const db = () => supabaseAdmin as any
            const s = await db().from('tenant_settings').select('orcamento_observacoes').eq('tenant_id', tenantId).maybeSingle()
            if (s.error) throw new Error(`tenant_settings: ${s.error.message}`)
            const texto = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
            return res.status(200).json({ observacoes: texto(s.data?.orcamento_observacoes) })
        }

        const corpo = lerCorpoDasObservacoes(req.body)
        if (corpo.erros.length > 0) return recusaNomeada(res, corpo.erros)

        return gravarPelaFuncaoComAMensagemDela(res, 'superadmin_gravar_observacoes_do_orcamento', {
            p_tenant: tenantId, p_por: caller.user_id, p_texto: corpo.observacoes,
        })
    } catch (e) {
        return falhaDeLeitura(res, e)
    }
}
