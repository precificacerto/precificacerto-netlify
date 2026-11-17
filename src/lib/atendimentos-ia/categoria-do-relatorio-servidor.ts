/**
 * A LEITURA da categoria e da ordem para os RELATÓRIOS I.A. (materiais e corte, 16/11/2026) — SÓ SERVIDOR, e uma só para os dois
 * (`copia-divergente`). A regra de agrupar mora em `categoria-do-relatorio.ts`.
 *
 * - a categoria de cada código: a das tabelas da conta que VALEM e têm categoria (`derivarTabelasDaConta`), pelo código como a tabela o tem
 *   — o código que o cálculo já resolveu (`codigo_na_tabela`). Isto CLASSIFICA, não resolve preço nem escolhe item;
 * - a ordem: as ramificações das famílias na base de conhecimento (`orcamentista_familia_ramificacao.ordem`); o catálogo dá o rótulo e a
 *   ordem do que ficar de fora.
 */
import { supabaseAdmin } from '@/supabase/admin'
import { derivarTabelasDaConta } from './tabelas-da-conta'
import { ErroNaoEncontrado, TABELA_DO_ITEM, TABELA_DO_ORCAMENTO } from './orcamentos-ia'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- as tabelas são posteriores a `database.types.ts`
const db = () => supabaseAdmin as any
const falhou = (tabela: string, e: { message: string }): never => { throw new Error(`${tabela}: ${e.message}`) }

export type ClassificacaoDoRelatorio = {
    categoriasDoCodigo: Map<string, string[]>
    ordem: string[]
    rotulos: Map<string, string>
}

export async function classificacaoDoRelatorio(tenantId: string, codigos: readonly string[], familias: readonly string[]): Promise<ClassificacaoDoRelatorio> {
    const categoriasDoCodigo = new Map<string, string[]>()
    const distintos = [...new Set(codigos)]
    if (distintos.length) {
        const { tabelas } = await derivarTabelasDaConta(tenantId)
        const categoriaDaTabela = new Map(tabelas.filter((t) => t.vale && t.categoria).map((t) => [t.tabelaId, t.categoria as string]))
        if (categoriaDaTabela.size) {
            const ti = await db().from('orcamentista_tabela_item').select('tabela_id, codigo').in('tabela_id', [...categoriaDaTabela.keys()]).in('codigo', distintos)
            if (ti.error) falhou('orcamentista_tabela_item', ti.error)
            for (const x of (ti.data ?? []) as Array<{ tabela_id: string; codigo: string }>) {
                categoriasDoCodigo.set(x.codigo, [...(categoriasDoCodigo.get(x.codigo) ?? []), categoriaDaTabela.get(x.tabela_id) as string])
            }
        }
    }
    const fs = [...new Set(familias)]
    const [ram, cat] = await Promise.all([
        fs.length
            ? db().from('orcamentista_familia_ramificacao').select('familia, categoria_chave, ordem').in('familia', fs).order('ordem')
            : Promise.resolve({ data: [], error: null }),
        db().from('orcamentista_categoria_catalogo').select('chave, rotulo, ordem').order('ordem'),
    ])
    if (ram.error) falhou('orcamentista_familia_ramificacao', ram.error)
    if (cat.error) falhou('orcamentista_categoria_catalogo', cat.error)
    const ordem: string[] = []
    for (const r of (ram.data ?? []) as Array<{ categoria_chave: string }>) if (!ordem.includes(r.categoria_chave)) ordem.push(r.categoria_chave)
    const rotulos = new Map(((cat.data ?? []) as Array<{ chave: string; rotulo: string }>).map((c) => [c.chave, c.rotulo]))
    return { categoriasDoCodigo, ordem, rotulos }
}

export type ItemDoRelatorio = { id: string; ordem: number; calculo_id: string | null; familia: string | null }

/** O orçamento do tenant (não apagado) e os itens que valem (sem `removido_em`), na ordem; 404 quando o orçamento não é da conta. */
export async function itensDoRelatorio(tenantId: string, orcamentoId: string): Promise<ItemDoRelatorio[]> {
    const o = await db().from(TABELA_DO_ORCAMENTO).select('id').eq('tenant_id', tenantId).eq('id', orcamentoId).is('deleted_at', null).maybeSingle()
    if (o.error) falhou(TABELA_DO_ORCAMENTO, o.error)
    if (!o.data) throw new ErroNaoEncontrado()
    const it = await db().from(TABELA_DO_ITEM).select('id, ordem, calculo_id, familia').eq('tenant_id', tenantId).eq('orcamento_id', orcamentoId).is('removido_em', null).order('ordem')
    if (it.error) falhou(TABELA_DO_ITEM, it.error)
    return (it.data ?? []) as ItemDoRelatorio[]
}
