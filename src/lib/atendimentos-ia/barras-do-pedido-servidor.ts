/**
 * A LEITURA das barras do pedido (SÓ SERVIDOR). A montagem é pura e mora em `barras-do-pedido.ts`.
 *
 * SÓ LEITURA: as peças do CÁLCULO VIGENTE de cada item (`orcamentista_orcamento_item_peca`, as mesmas do relatório de corte), a ordem, a
 * tipologia e a cor de cada item, e o peso (kg/m) de cada código nas tabelas de preço da conta que VALEM (`derivarTabelasDaConta`). Nada é
 * gravado, e nenhum valor do orçamento é lido para ser mudado: o aproveitamento de barras é do pedido, não do preço.
 *
 * O peso: a linha do código com barra (`medida_barra_m`) e peso; o mesmo código numa tabela de ferragem, por unidade e sem peso, não conta.
 * Dois pesos diferentes para o mesmo código: o peso não sai (nenhum é escolhido).
 */
import { supabaseAdmin } from '@/supabase/admin'
import { tabelaAusente, TABELA_DO_ITEM } from './orcamentos-ia'
import { itensDoRelatorio } from './categoria-do-relatorio-servidor'
import { linhasDoCalculoVigente } from './relatorio-de-materiais'
import { derivarTabelasDaConta } from './tabelas-da-conta'
import { TABELA_DAS_PECAS, FRASE_SEM_MIGRACAO_DO_CORTE } from './relatorio-de-corte-servidor'
import { montarBarrasDoPedido, pesosDosCodigos, type BarrasDoPedido, type PecaDoPedido } from './barras-do-pedido'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- as tabelas são posteriores a `database.types.ts`
const db = () => supabaseAdmin as any
const falhou = (tabela: string, e: { message: string }): never => { throw new Error(`${tabela}: ${e.message}`) }

export type BarrasDoPedidoDoOrcamento =
    | (BarrasDoPedido & {
        itensSemCalculo: number[]
        itensSemPecas: number[]
        /** Os códigos sem peso na tabela (ou com dois pesos): o peso deles não sai. */
        codigosSemPeso: string[]
    })
    | { semMigracao: string }

const numero = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v))

/**
 * O PESO (kg/m) de cada código nas tabelas da conta que VALEM: a linha com barra e peso (`pesosDosCodigos`). Um só lugar para as barras do
 * pedido e o orientativo de montagem (`copia-divergente`). Só leitura.
 */
export async function pesosNasTabelasQueValem(tenantId: string, codigos: readonly string[], familias: readonly string[] = []): Promise<Map<string, number>> {
    if (!codigos.length) return new Map()
    const { tabelas } = await derivarTabelasDaConta(tenantId)
    // UM ORÇAMENTO POR FAMÍLIA (23/11/2026): o peso vem das tabelas da FAMÍLIA dos itens (ou das de "qualquer linha", sem família) — a de
    // outra família não entra, e um código nas duas não vira "dois pesos" por causa dela. Sem família nos itens (o orçamento de antes), todas.
    const dasFamilias = new Set(familias)
    const ids = tabelas.filter((t) => t.vale && (dasFamilias.size === 0 || t.familiaChave === null || dasFamilias.has(t.familiaChave))).map((t) => t.tabelaId)
    if (!ids.length) return new Map()
    const ti = await db().from('orcamentista_tabela_item').select('codigo, peso, medida_barra_m').in('tabela_id', ids).in('codigo', [...codigos])
    if (ti.error) falhou('orcamentista_tabela_item', ti.error)
    return pesosDosCodigos((ti.data ?? []) as Array<{ codigo: string; peso: unknown; medida_barra_m: unknown }>)
}

export async function lerBarrasDoPedido(tenantId: string, orcamentoId: string): Promise<BarrasDoPedidoDoOrcamento> {
    const itens = await itensDoRelatorio(tenantId, orcamentoId)
    const calculados = itens.filter((i) => i.calculo_id)
    const itensSemCalculo = itens.filter((i) => !i.calculo_id).map((i) => i.ordem)
    if (!calculados.length) return { ...montarBarrasDoPedido([], new Map()), itensSemCalculo, itensSemPecas: [], codigosSemPeso: [] }

    const [p, it] = await Promise.all([
        db().from(TABELA_DAS_PECAS)
            .select('orcamento_item_id, calculo_id, ordem, perfil, codigo, descricao, comprimento_mm, quantidade, corte, posicao, comprimento_barra_mm, serra_mm')
            .eq('tenant_id', tenantId).in('orcamento_item_id', calculados.map((i) => i.id)).order('ordem'),
        db().from(TABELA_DO_ITEM).select('id, tipologia, cor_perfil').eq('tenant_id', tenantId).in('id', calculados.map((i) => i.id)),
    ])
    if (p.error && tabelaAusente(p.error)) return { semMigracao: FRASE_SEM_MIGRACAO_DO_CORTE }
    if (p.error) falhou(TABELA_DAS_PECAS, p.error)
    if (it.error) falhou(TABELA_DO_ITEM, it.error)
    const doItem = new Map(((it.data ?? []) as Array<{ id: string; tipologia: string | null; cor_perfil: string | null }>).map((x) => [x.id, x]))
    const ordemDo = new Map(calculados.map((i) => [i.id, i.ordem]))

    const vigentes = linhasDoCalculoVigente(calculados, (p.data ?? []) as Array<Record<string, unknown> & { orcamento_item_id: string; calculo_id: string }>)
    const pecas: PecaDoPedido[] = vigentes.map((x) => ({
        codigo: String(x.codigo), perfil: String(x.perfil), descricao: (x.descricao as string | null) ?? null,
        comprimento_mm: Number(x.comprimento_mm), quantidade: Number(x.quantidade),
        corte: (x.corte as string | null) ?? null, posicao: (x.posicao as string | null) ?? null,
        comprimento_barra_mm: numero(x.comprimento_barra_mm), serra_mm: Number(x.serra_mm),
        item: ordemDo.get(x.orcamento_item_id) as number,
        tipologia: doItem.get(x.orcamento_item_id)?.tipologia ?? null,
        cor: doItem.get(x.orcamento_item_id)?.cor_perfil ?? null,
    }))
    const comPecas = new Set(vigentes.map((l) => l.orcamento_item_id))
    const itensSemPecas = calculados.filter((i) => !comPecas.has(i.id)).map((i) => i.ordem)

    const codigos = [...new Set(pecas.map((x) => x.codigo))]
    const pesos = await pesosNasTabelasQueValem(tenantId, codigos, [...new Set(calculados.map((i) => i.familia).filter((f): f is string => !!f))])
    const r = montarBarrasDoPedido(pecas, pesos)
    return { ...r, itensSemCalculo, itensSemPecas, codigosSemPeso: codigos.filter((c) => !pesos.has(c)).sort() }
}
