/**
 * A LEITURA do relatório de materiais (SÓ SERVIDOR). A montagem é pura e mora em `relatorio-de-materiais.ts`.
 *
 * - os itens do orçamento que valem (sem `removido_em`), do tenant;
 * - de cada item, os materiais do CÁLCULO VIGENTE (`calculo_id` do item): uma linha de material de um cálculo anterior não entra;
 * - a categoria de cada código: a das tabelas da conta que valem (`derivarTabelasDaConta`), pelo código como a tabela o tem;
 * - a ordem: as ramificações da família dos itens na base de conhecimento (`orcamentista_familia_ramificacao.ordem`), e o catálogo depois.
 */
import { supabaseAdmin } from '@/supabase/admin'
import { ErroNaoEncontrado, TABELA_DO_ITEM, TABELA_DO_ORCAMENTO } from './orcamentos-ia'
import { derivarTabelasDaConta } from './tabelas-da-conta'
import { materiaisDoCalculoVigente, montarRelatorioDeMateriais, type MaterialGravado, type RelatorioDeMateriais } from './relatorio-de-materiais'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- as tabelas são posteriores a `database.types.ts`
const db = () => supabaseAdmin as any
const falhou = (tabela: string, e: { message: string }): never => { throw new Error(`${tabela}: ${e.message}`) }

export type RelatorioDeMateriaisDoOrcamento = RelatorioDeMateriais & {
    /** As esquadrias sem cálculo vigente: os materiais delas não entram, e o relatório diz quais. */
    itensSemCalculo: number[]
}

export async function lerRelatorioDeMateriais(tenantId: string, orcamentoId: string): Promise<RelatorioDeMateriaisDoOrcamento> {
    const o = await db().from(TABELA_DO_ORCAMENTO).select('id').eq('tenant_id', tenantId).eq('id', orcamentoId).is('deleted_at', null).maybeSingle()
    if (o.error) falhou(TABELA_DO_ORCAMENTO, o.error)
    if (!o.data) throw new ErroNaoEncontrado()
    const it = await db().from(TABELA_DO_ITEM).select('id, ordem, calculo_id, familia').eq('tenant_id', tenantId).eq('orcamento_id', orcamentoId).is('removido_em', null).order('ordem')
    if (it.error) falhou(TABELA_DO_ITEM, it.error)
    const itens = (it.data ?? []) as Array<{ id: string; ordem: number; calculo_id: string | null; familia: string | null }>
    const calculados = itens.filter((i) => i.calculo_id)
    const itensSemCalculo = itens.filter((i) => !i.calculo_id).map((i) => i.ordem)

    let materiais: MaterialGravado[] = []
    if (calculados.length) {
        const m = await db().from('orcamentista_orcamento_item_material')
            .select('orcamento_item_id, calculo_id, codigo_na_tabela, descricao, unidade_compra, consumo_item, caminho')
            .eq('tenant_id', tenantId).in('orcamento_item_id', calculados.map((i) => i.id))
        if (m.error) falhou('orcamentista_orcamento_item_material', m.error)
        materiais = materiaisDoCalculoVigente(calculados, (m.data ?? []) as Array<MaterialGravado & { orcamento_item_id: string; calculo_id: string; consumo_item: number | string }>)
            .map((x) => ({ codigo_na_tabela: x.codigo_na_tabela, descricao: x.descricao, unidade_compra: x.unidade_compra, consumo_item: Number(x.consumo_item), caminho: x.caminho }))
    }

    // a categoria de cada código: as tabelas da conta que VALEM, e só as que têm categoria
    const codigos = [...new Set(materiais.map((x) => x.codigo_na_tabela))]
    const categoriasDoCodigo = new Map<string, string[]>()
    if (codigos.length) {
        const { tabelas } = await derivarTabelasDaConta(tenantId)
        const categoriaDaTabela = new Map(tabelas.filter((t) => t.vale && t.categoria).map((t) => [t.tabelaId, t.categoria as string]))
        if (categoriaDaTabela.size) {
            const ti = await db().from('orcamentista_tabela_item').select('tabela_id, codigo').in('tabela_id', [...categoriaDaTabela.keys()]).in('codigo', codigos)
            if (ti.error) falhou('orcamentista_tabela_item', ti.error)
            for (const x of (ti.data ?? []) as Array<{ tabela_id: string; codigo: string }>) {
                categoriasDoCodigo.set(x.codigo, [...(categoriasDoCodigo.get(x.codigo) ?? []), categoriaDaTabela.get(x.tabela_id) as string])
            }
        }
    }

    // a ordem da base de conhecimento: as ramificações das famílias dos itens, e o catálogo para o rótulo e o que ficar de fora
    const familias = [...new Set(itens.map((i) => i.familia).filter((f): f is string => !!f))]
    const [ram, cat] = await Promise.all([
        familias.length
            ? db().from('orcamentista_familia_ramificacao').select('familia, categoria_chave, ordem').in('familia', familias).order('ordem')
            : Promise.resolve({ data: [], error: null }),
        db().from('orcamentista_categoria_catalogo').select('chave, rotulo, ordem').order('ordem'),
    ])
    if (ram.error) falhou('orcamentista_familia_ramificacao', ram.error)
    if (cat.error) falhou('orcamentista_categoria_catalogo', cat.error)
    const ordem: string[] = []
    for (const r of (ram.data ?? []) as Array<{ categoria_chave: string; ordem: number }>) if (!ordem.includes(r.categoria_chave)) ordem.push(r.categoria_chave)
    const rotulos = new Map(((cat.data ?? []) as Array<{ chave: string; rotulo: string }>).map((c) => [c.chave, c.rotulo]))

    return { ...montarRelatorioDeMateriais(materiais, categoriasDoCodigo, ordem, rotulos), itensSemCalculo }
}
