/**
 * A LEITURA DA POLÍTICA DA EMPRESA (20/11/2026, `politica-da-empresa.ts`): a linha da empresa (`orcamentista_esquadrias_base`, por tenant) sobre a do
 * NICHO dela (`orcamentista_esquadrias_padrao`, pelo `orcamentista_config.nicho_id`). Sem linha, nada definido. Lida pela etapa 1 (a folha do
 * levantamento diz o que vai valer) e pela 2 (o cálculo aplica): uma leitura só, as duas leem o mesmo.
 */
import { supabaseAdmin } from '@/supabase/admin'
import { politicaEfetiva, type PoliticaDaEmpresa } from '@/lib/atendimentos-ia/politica-da-empresa'

export async function lerPoliticaDaEmpresa(tenantId: string): Promise<PoliticaDaEmpresa> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- as duas tabelas da base são lidas como linha solta
    const db = supabaseAdmin as any
    const [empresa, config] = await Promise.all([
        db.from('orcamentista_esquadrias_base').select('*').eq('tenant_id', tenantId).maybeSingle(),
        db.from('orcamentista_config').select('nicho_id').eq('tenant_id', tenantId).maybeSingle(),
    ])
    if (empresa.error) throw new Error(`orcamentista_esquadrias_base: ${empresa.error.message}`)
    if (config.error) throw new Error(`orcamentista_config: ${config.error.message}`)
    let nicho: Record<string, unknown> | null = null
    if (config.data?.nicho_id) {
        const n = await db.from('orcamentista_esquadrias_padrao').select('*').eq('nicho_id', config.data.nicho_id).maybeSingle()
        if (n.error) throw new Error(`orcamentista_esquadrias_padrao: ${n.error.message}`)
        nicho = n.data ?? null
    }
    return politicaEfetiva(empresa.data ?? null, nicho)
}
