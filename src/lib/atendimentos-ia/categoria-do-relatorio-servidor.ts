/**
 * A LEITURA da categoria e da ordem para os RELATÓRIOS I.A. (materiais e corte) — SÓ SERVIDOR, e uma só para os dois (`copia-divergente`).
 * A regra mora em `categoria-do-relatorio.ts`.
 *
 * - A CATEGORIA NÃO SAI DO TEXTO DA LINHA; SAI DA TABELA QUE DEU O PREÇO (dono do produto, 22/11/2026). De cada linha (o código como a tabela o
 *   tem, o caminho do cálculo e a família do item): as tabelas de preço da família em que o código está (`lerFamiliasDaEmpresa`, as mesmas do
 *   cálculo), e delas as que o cálculo olha pelo caminho (`tabelasDeOndeOPrecoSai`, os escopos do custo: o motor do cálculo, os principais e a
 *   descida). A `categoria_chave` dessa tabela é a categoria. A categoria do fornecedor escrita no item da tabela (`COLUNA_DA_CATEGORIA_DO_FORNECEDOR`) não é lida. Isto CLASSIFICA, não resolve preço.
 * - LIMITE CONHECIDO: o cálculo não grava a tabela de cada material (seria migração, e o pedido é sem migração). A tabela é derivada de novo,
 *   com os escopos de hoje; se a base de conhecimento trocar o principal de uma categoria depois do cálculo, o relatório segue a configuração nova.
 * - a ordem: as ramificações das famílias na base de conhecimento (`orcamentista_familia_ramificacao.ordem`); o catálogo dá o rótulo e a
 *   ordem do que ficar de fora.
 */
import { supabaseAdmin } from '@/supabase/admin'
import { ErroNaoEncontrado, TABELA_DO_ITEM, TABELA_DO_ORCAMENTO } from './orcamentos-ia'
import { categoriaDoPreco, juntarCategoriasDoCodigo, type CategoriaDoPreco } from './categoria-do-relatorio'
import { lerFamiliasDaEmpresa } from './levantamento-da-conversa'
import { principaisDaConta } from './tabelas-da-conta'
import { tabelasDeOndeOPrecoSai } from './custo-do-orcamento-servidor'
import type { EscopoDoMotor } from './resolucao-de-referencia'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- as tabelas são posteriores a `database.types.ts`
const db = () => supabaseAdmin as any
const falhou = (tabela: string, e: { message: string }): never => { throw new Error(`${tabela}: ${e.message}`) }

export type ClassificacaoDoRelatorio = {
    categoriasDoCodigo: Map<string, string[]>
    /** Por que o código ficou sem categoria, ou em mais de uma: nunca sem motivo. */
    motivos: Map<string, string>
    ordem: string[]
    rotulos: Map<string, string>
}
/** Uma linha a classificar: o código como a tabela o tem, o caminho do cálculo ('perfil', 'insumo', 'vidro') e a família do item. */
export type LinhaAClassificar = { codigo: string; caminho: string; familia: string | null }

export const motivoDaConfiguracao = (frase: string) => `a configuração da conta não deixa saber de onde o preço sai: ${frase}`
export const MOTIVO_ITEM_SEM_FAMILIA = 'o item não tem uma família da conta: não há de onde o preço sair'

type TabelaDoItem = { tabela_id: string; fornecedor_id: string; familia: string | null; categoria: string | null }

async function categoriasPelaTabelaDoPreco(tenantId: string, linhas: readonly LinhaAClassificar[]): Promise<Array<{ codigo: string; r: CategoriaDoPreco }>> {
    if (!linhas.length) return []
    const [fam, principais] = await Promise.all([lerFamiliasDaEmpresa(tenantId), principaisDaConta(tenantId)])
    // `'frase' in`: com `strictNullChecks: false` o `ok` não estreita a união
    if ('frase' in fam) {
        const motivo = motivoDaConfiguracao(fam.frase)
        return linhas.map((l): { codigo: string; r: CategoriaDoPreco } => ({ codigo: l.codigo, r: { categoria: null, categorias: [], motivo } }))
    }

    const ids = [...new Set(fam.familias.flatMap((f) => f.tabelasDePreco))]
    const motores = [...new Set(fam.familias.map((f) => f.calculo?.id).filter((m): m is string => !!m))]
    const codigos = [...new Set(linhas.map((l) => l.codigo))]
    const [tab, itens, mot, mfam] = await Promise.all([
        ids.length ? db().from('orcamentista_tabela').select('id, fornecedor_id, familia, categoria_chave').in('id', ids) : Promise.resolve({ data: [], error: null }),
        ids.length ? db().from('orcamentista_tabela_item').select('tabela_id, codigo').in('tabela_id', ids).in('codigo', codigos) : Promise.resolve({ data: [], error: null }),
        motores.length ? db().from('orcamentista_motor').select('id, fornecedor_id').in('id', motores) : Promise.resolve({ data: [], error: null }),
        motores.length ? db().from('orcamentista_motor_familia').select('motor_id, familia').in('motor_id', motores) : Promise.resolve({ data: [], error: null }),
    ])
    if (tab.error) falhou('orcamentista_tabela', tab.error)
    if (itens.error) falhou('orcamentista_tabela_item', itens.error)
    if (mot.error) falhou('orcamentista_motor', mot.error)
    if (mfam.error) falhou('orcamentista_motor_familia', mfam.error)
    const daTabela = new Map(((tab.data ?? []) as Array<{ id: string; fornecedor_id: string; familia: string | null; categoria_chave: string | null }>)
        .map((t) => [t.id, { tabela_id: t.id, fornecedor_id: t.fornecedor_id, familia: t.familia, categoria: t.categoria_chave }]))
    const tabelasDoCodigo = new Map<string, TabelaDoItem[]>()
    for (const x of (itens.data ?? []) as Array<{ tabela_id: string; codigo: string }>) {
        const t = daTabela.get(x.tabela_id)
        if (t && !(tabelasDoCodigo.get(x.codigo) ?? []).some((y) => y.tabela_id === t.tabela_id)) tabelasDoCodigo.set(x.codigo, [...(tabelasDoCodigo.get(x.codigo) ?? []), t])
    }
    const escopoDoMotor = new Map<string, EscopoDoMotor>()
    for (const m of (mot.data ?? []) as Array<{ id: string; fornecedor_id: string }>) {
        escopoDoMotor.set(m.id, { fornecedor_id: m.fornecedor_id, familias: ((mfam.data ?? []) as Array<{ motor_id: string; familia: string }>).filter((f) => f.motor_id === m.id).map((f) => f.familia) })
    }

    return linhas.map((l) => {
        const f = fam.familias.find((x) => x.familia === l.familia)
        if (!f) return { codigo: l.codigo, r: { categoria: null, categorias: [], motivo: MOTIVO_ITEM_SEM_FAMILIA } }
        const daFamilia = new Set(f.tabelasDePreco)
        const doCodigo = (tabelasDoCodigo.get(l.codigo) ?? []).filter((t) => daFamilia.has(t.tabela_id))
        const motor = f.calculo ? escopoDoMotor.get(f.calculo.id) ?? null : null
        return { codigo: l.codigo, r: categoriaDoPreco(l.caminho, doCodigo, tabelasDeOndeOPrecoSai(l.caminho, doCodigo, motor, principais)) }
    })
}

export async function classificacaoDoRelatorio(tenantId: string, linhas: readonly LinhaAClassificar[], familias: readonly string[]): Promise<ClassificacaoDoRelatorio> {
    // uma resposta por (código, caminho, família): é o que muda a tabela de onde o preço sai
    const unicas = [...new Map(linhas.map((l) => [JSON.stringify([l.codigo, l.caminho, l.familia]), l])).values()]
    const { categoriasDoCodigo, motivos } = juntarCategoriasDoCodigo(await categoriasPelaTabelaDoPreco(tenantId, unicas))
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
    return { categoriasDoCodigo, motivos, ordem, rotulos }
}

export type ItemDoRelatorio = { id: string; ordem: number; calculo_id: string | null; familia: string | null; /** A cor do perfil do item: decide o refilo das barras (pedido 0034). */ cor_perfil?: string | null }

/** O orçamento do tenant (não apagado) e os itens que valem (sem `removido_em`), na ordem; 404 quando o orçamento não é da conta. */
export async function itensDoRelatorio(tenantId: string, orcamentoId: string): Promise<ItemDoRelatorio[]> {
    const o = await db().from(TABELA_DO_ORCAMENTO).select('id').eq('tenant_id', tenantId).eq('id', orcamentoId).is('deleted_at', null).maybeSingle()
    if (o.error) falhou(TABELA_DO_ORCAMENTO, o.error)
    if (!o.data) throw new ErroNaoEncontrado()
    const it = await db().from(TABELA_DO_ITEM).select('id, ordem, calculo_id, familia, cor_perfil').eq('tenant_id', tenantId).eq('orcamento_id', orcamentoId).is('removido_em', null).order('ordem')
    if (it.error) falhou(TABELA_DO_ITEM, it.error)
    return (it.data ?? []) as ItemDoRelatorio[]
}
