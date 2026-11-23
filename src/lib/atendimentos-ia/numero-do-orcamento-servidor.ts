/**
 * O número exibido de vários orçamentos de uma vez (SÓ SERVIDOR): o número do levantamento de cada um e a sigla da família dele, lidos no tenant
 * do chamador (o levantamento) e no catálogo global (a sigla). A regra mora em `numero-do-orcamento.ts`.
 */
import { supabaseAdmin } from '@/supabase/admin'
import { numeroExibido } from './numero-do-orcamento'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- as tabelas são posteriores a `database.types.ts`
const db = () => supabaseAdmin as any
const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

export type OrcamentoParaONumero = { id: string; numero: number; levantamento_id: string | null; familia?: string | null }

export async function numerosExibidos(tenantId: string, orcs: readonly OrcamentoParaONumero[]): Promise<Map<string, string>> {
    const levs = [...new Set(orcs.map((o) => o.levantamento_id).filter((x): x is string => typeof x === 'string'))]
    const familias = [...new Set(orcs.map((o) => texto(o.familia)).filter((x): x is string => x !== null))]
    const [l, f] = await Promise.all([
        levs.length ? db().from('orcamentista_levantamento').select('id, numero').eq('tenant_id', tenantId).in('id', levs) : Promise.resolve({ data: [], error: null }),
        familias.length ? db().from('orcamentista_familia_catalogo').select('chave, sigla').in('chave', familias) : Promise.resolve({ data: [], error: null }),
    ])
    if (l.error) throw new Error(`orcamentista_levantamento: ${l.error.message}`)
    if (f.error) throw new Error(`orcamentista_familia_catalogo: ${f.error.message}`)
    const numeroDoLev = new Map(((l.data ?? []) as Array<{ id: string; numero: number }>).map((x) => [x.id, Number(x.numero)]))
    const siglaDa = new Map(((f.data ?? []) as Array<{ chave: string; sigla?: string | null }>).map((x) => [x.chave, texto(x.sigla)]))
    return new Map(orcs.map((o) => [o.id, numeroExibido({
        numero: Number(o.numero),
        levantamentoNumero: o.levantamento_id ? numeroDoLev.get(o.levantamento_id) ?? null : null,
        sigla: texto(o.familia) ? siglaDa.get(texto(o.familia) as string) ?? null : null,
    })]))
}
