/**
 * GET e PUT /api/super-admin/base-de-conhecimento/marca?tenant=<uuid> — lê e grava a MARCA (logo) da empresa.
 *
 * O GET devolve `{ logo }` — o data URL gravado, ou null. O PUT grava pela função
 * `superadmin_gravar_marca_da_empresa`, que valida, grava e loga na mesma transação.
 *   corpo: { logo: "data:image/png;base64,…" | null }
 *
 * A marca é a imagem que o cabeçalho do arquivo do orçamento já desenhava e que nenhuma tela gravava (medido em
 * 16/11/2026: `logo_url` existia nas duas tabelas, o PDF a lia, e nada no sistema a escrevia). `null` limpa.
 *
 * O LOG NÃO LEVA A IMAGEM: a função grava só o tamanho e se havia marca antes.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/supabase/admin'
import { superAdminOu404 } from '@/lib/get-caller-tenant'
import { lerCorpoDaMarca } from '@/lib/atendimentos-ia/base-de-conhecimento'
import {
    empresaDoPedido, falhaDeLeitura, gravarPelaFuncaoComAMensagemDela, metodoNaoPermitido, recusaNomeada,
} from '@/lib/atendimentos-ia/base-de-conhecimento-servidor'

/** O corpo é uma imagem em base64: o limite do Next (1 MB) é pequeno demais para 400 mil caracteres com folga. */
export const config = { api: { bodyParser: { sizeLimit: '2mb' } } }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const caller = await superAdminOu404(req, res)
    if (!caller) return
    if (req.method !== 'PUT' && req.method !== 'GET') return metodoNaoPermitido(res, ['GET', 'PUT'])

    try {
        const tenantId = await empresaDoPedido(req, res)
        if (!tenantId) return

        if (req.method === 'GET') {
            // a marca da empresa: a das settings vence a do cadastro, como o leitor do PDF (`lerEmpresa`)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- as tabelas do cadastro são anteriores a `database.types.ts`
            const db = () => supabaseAdmin as any
            const s = await db().from('tenant_settings').select('logo_url').eq('tenant_id', tenantId).maybeSingle()
            if (s.error) throw new Error(`tenant_settings: ${s.error.message}`)
            const t = await db().from('tenants').select('logo_url').eq('id', tenantId).maybeSingle()
            if (t.error) throw new Error(`tenants: ${t.error.message}`)
            const texto = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
            return res.status(200).json({ logo: texto(s.data?.logo_url) ?? texto(t.data?.logo_url) })
        }

        const corpo = lerCorpoDaMarca(req.body)
        if (corpo.erros.length > 0) return recusaNomeada(res, corpo.erros)

        return gravarPelaFuncaoComAMensagemDela(res, 'superadmin_gravar_marca_da_empresa', { p_tenant: tenantId, p_por: caller.user_id, p_logo: corpo.logo })
    } catch (e) {
        return falhaDeLeitura(res, e)
    }
}
