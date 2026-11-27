/**
 * A leitura da REFERÊNCIA POR NÚMERO (pedido 0050): o levantamento ou o orçamento N da empresa, ou os 5 últimos quando N não existe. Todo acesso
 * leva o tenant; quem não é admin só alcança o que é dele (como o resto da conversa), e o que é de outro responde como inexistente.
 */
import { supabaseAdmin } from '@/supabase/admin'
import type { ReferenciaPorNumero, RegistroDaLista } from './referencia-por-numero'

export type LevantamentoAchado = { id: string; numero: number; nome: string; estado: string; remetente_id: string; itens: { total: number; cores: string[] } }
export type Achado =
    | { achou: 'levantamento'; lev: LevantamentoAchado }
    | { achou: 'orcamento'; orc: { id: string; numero: number; nome: string; levantamento_id: string | null }; lev: LevantamentoAchado }
    | { achou: 'nenhum'; ultimos: RegistroDaLista[] }

type LinhaLev = { id: string; numero: number | null; nome: string; estado: string; remetente_id: string }

async function levantamentoComItens(tenantId: string, l: LinhaLev): Promise<LevantamentoAchado> {
    const itens = await supabaseAdmin.from('orcamentista_levantamento_item').select('cor_perfil').eq('tenant_id', tenantId).eq('levantamento_id', l.id)
    if (itens.error) throw new Error(`referência por número: ${itens.error.message}`)
    const linhas = (itens.data ?? []) as Array<{ cor_perfil: string | null }>
    const cores = [...new Set(linhas.map((i) => (i.cor_perfil ?? '').trim()).filter((c) => c !== ''))]
    return { id: l.id, numero: Number(l.numero), nome: l.nome, estado: l.estado, remetente_id: l.remetente_id, itens: { total: linhas.length, cores } }
}

export async function acharReferencia(tenantId: string, remetenteId: string, admin: boolean, ref: ReferenciaPorNumero): Promise<Achado> {
    // quem não é admin só alcança o que é dele; o tipo do construtor do PostgREST é fundo demais para um genérico
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dono = (q: any) => (admin ? q : q.eq('remetente_id', remetenteId))
    const COLS = 'id, numero, nome, estado, remetente_id'
    if (ref.tipo === 'levantamento') {
        const r = await dono(supabaseAdmin.from('orcamentista_levantamento').select(COLS).eq('tenant_id', tenantId).eq('numero', ref.numero)).maybeSingle()
        if (r.error) throw new Error(`referência por número: ${r.error.message}`)
        if (r.data) return { achou: 'levantamento', lev: await levantamentoComItens(tenantId, r.data as unknown as LinhaLev) }
        const ult = await dono(supabaseAdmin.from('orcamentista_levantamento').select(COLS).eq('tenant_id', tenantId)).order('criado_em', { ascending: false }).limit(5)
        if (ult.error) throw new Error(`referência por número: ${ult.error.message}`)
        return { achou: 'nenhum', ultimos: ((ult.data ?? []) as unknown as LinhaLev[]).map((l) => ({ tipo: 'levantamento' as const, numero: Number(l.numero), nome: l.nome })) }
    }
    // o orçamento N: só o do agente (com levantamento), da empresa, não apagado; o que é de outro vendedor responde como inexistente
    const o = await supabaseAdmin.from('orcamentista_orcamento').select('id, numero, nome, levantamento_id, criado_em').eq('tenant_id', tenantId).eq('numero', ref.numero).is('deleted_at', null).maybeSingle()
    if (o.error) throw new Error(`referência por número: ${o.error.message}`)
    const orc = o.data as { id: string; numero: number; nome: string; levantamento_id: string | null } | null
    if (orc?.levantamento_id) {
        const l = await dono(supabaseAdmin.from('orcamentista_levantamento').select(COLS).eq('tenant_id', tenantId).eq('id', orc.levantamento_id)).maybeSingle()
        if (l.error) throw new Error(`referência por número: ${l.error.message}`)
        if (l.data) return { achou: 'orcamento', orc, lev: await levantamentoComItens(tenantId, l.data as unknown as LinhaLev) }
    }
    // os 5 últimos orçamentos que a pessoa alcança: os dos levantamentos dela (ou de todos, para o admin)
    const levs = await dono(supabaseAdmin.from('orcamentista_levantamento').select('id').eq('tenant_id', tenantId))
    if (levs.error) throw new Error(`referência por número: ${levs.error.message}`)
    const ids = ((levs.data ?? []) as Array<{ id: string }>).map((l) => l.id)
    if (ids.length === 0) return { achou: 'nenhum', ultimos: [] }
    const ult = await supabaseAdmin.from('orcamentista_orcamento').select('numero, nome').eq('tenant_id', tenantId).in('levantamento_id', ids).is('deleted_at', null)
        .order('criado_em', { ascending: false }).limit(5)
    if (ult.error) throw new Error(`referência por número: ${ult.error.message}`)
    return { achou: 'nenhum', ultimos: ((ult.data ?? []) as Array<{ numero: number; nome: string }>).map((x) => ({ tipo: 'orcamento' as const, numero: Number(x.numero), nome: x.nome })) }
}
