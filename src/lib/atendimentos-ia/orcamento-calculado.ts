/**
 * CALCULAR E GRAVAR o orçamento I.A. (o 1b, dono do produto, 09/11/2026): as esquadrias do orçamento passam pelo caminho completo
 * (`custoDoLevantamento`), e o resultado é gravado NO ORÇAMENTO — nunca na conversa:
 *   1. as linhas de `orcamentista_orcamento_item_material` com um `calculo_id` NOVO (a tabela é só de INSERT: o cálculo de antes fica);
 *   2. cada item: `calculo_id`, `calculado_em` e os valores da 20261109000002 (o par bruto/líquido, os efetivos, a fabricação, o total);
 *   3. o orçamento: o modo de aproveitamento do pedido (o fallback, com origem e motivo) e os totais bruto e líquido. O valor de venda NÃO
 *      se grava aqui: ele sai da precificação final, na tela.
 * Os percentuais da comissão, da reserva técnica e do lucro do orçamento do agente vêm CONGELADOS do levantamento (os nomes e as faixas
 * são os mesmos); o manual não os tem de onde copiar e fica com o que tiver.
 *
 * A ORDEM DA ESCRITA É A QUE NÃO DEIXA NÚMERO SEM ORIGEM: o material antes do item (o item só aponta um cálculo que já existe — a CHECK
 * `..._valores_com_calculo` e a leitura por `calculo_id`), o item antes do orçamento. As três escritas não são uma transação: se a segunda
 * ou a terceira falha, o material gravado fica órfão de apontador (legível, nunca lido como vigente) e a recusa diz o que ficou.
 *
 * Toda leitura e escrita leva o `tenant_id` do chamador. Nada evolui com falta: a recusa do cálculo volta nomeada e nada é gravado.
 */
import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/supabase/admin'
import { lerOrcamento, ErroSemMigracao, TABELA_DO_ITEM, TABELA_DO_ORCAMENTO, tabelaAusente } from './orcamentos-ia'
import { custoDoLevantamento } from './custo-do-orcamento-servidor'
import { lerFamiliasDaEmpresa, type EsquadriaGravada } from './levantamento-da-conversa'
import { MODO_DO_FALLBACK, ORIGEM_DO_FALLBACK, MOTIVO_DO_FALLBACK, PERCENTUAIS, type CustoDoItem } from './custo-do-orcamento'

export const TABELA_DO_MATERIAL = 'orcamentista_orcamento_item_material'
export const FRASE_SEM_MIGRACAO_DO_CALCULO =
    'O cálculo do orçamento ainda não está disponível: a estrutura do banco (migrações 20261109000002 e 20261109000003) não foi aplicada.'

export class ErroSemMigracaoDoCalculo extends Error {
    constructor() { super(FRASE_SEM_MIGRACAO_DO_CALCULO) }
}
/** O cálculo recusou: as faltas nomeadas, e nada foi gravado. */
export class ErroDoCalculo extends Error {
    constructor(readonly recusas: string[]) { super(recusas.join(' | ')) }
}

/** Coluna que não existe (a 20261109000002 ou a 20261109000003 pendente): o Postgres diz 42703; o PostgREST, PGRST204. */
const colunaAusente = (e: { code?: string } | null | undefined) => e?.code === '42703' || e?.code === 'PGRST204'
function falhou(tabela: string, error: { code?: string; message: string }): never {
    if (colunaAusente(error) || (tabela === TABELA_DO_MATERIAL && tabelaAusente(error))) throw new ErroSemMigracaoDoCalculo()
    if (tabelaAusente(error)) throw new ErroSemMigracao()
    throw new Error(`${tabela}: ${error.message}`)
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- as tabelas são posteriores a `database.types.ts`
const db = () => supabaseAdmin as any

export type ResultadoDoCalculo = {
    calculo_id: string
    calculado_em: string
    itens: Array<{ id: string; ordem: number } & Omit<CustoDoItem, 'materiais'>>
    valor_total_bruto: number
    valor_total_liquido: number
}

/** O levantamento de onde o orçamento do agente veio: os percentuais congelados, e as escolhas e a família de cada item. */
async function lerDoLevantamento(tenantId: string, levantamentoId: string, idsDosItens: string[]) {
    const { data: lev, error } = await db().from('orcamentista_levantamento')
        .select('comissao_percentual, comissao_modo, reserva_tecnica_percentual, reserva_tecnica_responsavel, lucro_projetado_percentual')
        .eq('tenant_id', tenantId).eq('id', levantamentoId).maybeSingle()
    if (error) falhou('orcamentista_levantamento', error)
    let itens: Array<{ id: string; escolhas: unknown; familia: unknown }> = []
    if (idsDosItens.length) {
        const r = await db().from('orcamentista_levantamento_item').select('id, escolhas, familia').eq('tenant_id', tenantId).in('id', idsDosItens)
        if (r.error) falhou('orcamentista_levantamento_item', r.error)
        itens = r.data ?? []
    }
    return { congelados: (lev ?? null) as Record<string, unknown> | null, porItem: new Map(itens.map((i) => [i.id, i])) }
}

/**
 * Calcula o orçamento `id` da empresa `tenantId` e grava o resultado. `agora` e `novoId` existem para o teste; em produção são o relógio e
 * `randomUUID`.
 */
export async function calcularOrcamento(tenantId: string, id: string, agora: Date = new Date(), novoId: () => string = randomUUID): Promise<ResultadoDoCalculo> {
    const orc = await lerOrcamento(tenantId, id)
    if (orc.itens.length === 0) throw new ErroDoCalculo(['as esquadrias do orçamento: ele não tem nenhum item'])
    const doLevantamento = orc.levantamento_id
        ? await lerDoLevantamento(tenantId, orc.levantamento_id, orc.itens.map((i) => i.levantamento_item_id).filter((x): x is string => !!x))
        : null
    const esquadrias: EsquadriaGravada[] = orc.itens.map((i) => {
        const deOrigem = i.levantamento_item_id ? doLevantamento?.porItem.get(i.levantamento_item_id) : undefined
        return {
            ordem: i.ordem, tipologia: i.tipologia, largura_mm: i.largura_mm, altura_mm: i.altura_mm, quantidade: i.quantidade,
            cor_perfil: i.cor_perfil, vidro: i.vidro, escolhas: deOrigem?.escolhas ?? null, familia: deOrigem?.familia ?? null,
        }
    })
    const custo = await custoDoLevantamento(tenantId, await lerFamiliasDaEmpresa(tenantId), { nome: orc.nome, itens: esquadrias })
    if ('recusas' in custo) throw new ErroDoCalculo(custo.recusas)

    const calculo_id = novoId()
    const calculado_em = agora.toISOString()
    // 1. o material, com o cálculo novo
    const linhas = custo.itens.flatMap((c, k) => c.materiais.map((m) => ({ tenant_id: tenantId, orcamento_item_id: orc.itens[k].id, calculo_id, ...m })))
    if (linhas.length) {
        const { error } = await db().from(TABELA_DO_MATERIAL).insert(linhas)
        if (error) falhou(TABELA_DO_MATERIAL, error)
    }
    // 2. cada item aponta o cálculo e guarda os valores — conferido pela contagem atingida
    const itens = custo.itens.map((c, k) => {
        const { materiais: _materiais, ...valores } = c
        void _materiais
        return { id: orc.itens[k].id, ordem: orc.itens[k].ordem, ...valores }
    })
    for (const it of itens) {
        const { id: idDoItem, ordem: _ordem, ...valores } = it
        void _ordem
        const { data, error } = await db().from(TABELA_DO_ITEM)
            .update({ calculo_id, calculado_em, ...Object.fromEntries(PERCENTUAIS.map((p) => [p, valores[p]])),
                custo_bruto_materiais: valores.custo_bruto_materiais, custo_liquido_materiais: valores.custo_liquido_materiais,
                tempo_fabricacao_min: valores.tempo_fabricacao_min, valor_minuto: valores.valor_minuto, custo_fabricacao: valores.custo_fabricacao,
                custo_liquido_total: valores.custo_liquido_total, atualizado_em: calculado_em })
            .eq('tenant_id', tenantId).eq('orcamento_id', id).eq('id', idDoItem).select('id')
        if (error) falhou(TABELA_DO_ITEM, error)
        if (!data || data.length !== 1) throw new Error(`${TABELA_DO_ITEM}: o item ${idDoItem} não foi atualizado (o cálculo ${calculo_id} ficou gravado no material)`)
    }
    // 3. o orçamento: o modo do pedido e os totais (o bruto é o dos materiais mais a fabricação; o líquido, a soma dos totais dos itens)
    const valor_total_bruto = custo.itens.reduce((t, c) => t + c.custo_bruto_materiais + c.custo_fabricacao, 0)
    const valor_total_liquido = custo.itens.reduce((t, c) => t + c.custo_liquido_total, 0)
    const congelados = doLevantamento?.congelados
    const { data, error } = await db().from(TABELA_DO_ORCAMENTO)
        .update({
            aproveitamento_modo: MODO_DO_FALLBACK, aproveitamento_origem: ORIGEM_DO_FALLBACK, aproveitamento_motivo: MOTIVO_DO_FALLBACK, aproveitamento_por: null,
            valor_total_bruto, valor_total_liquido, atualizado_em: calculado_em,
            ...(congelados ? {
                comissao_percentual: congelados.comissao_percentual ?? null, comissao_modo: congelados.comissao_modo ?? null,
                reserva_tecnica_percentual: congelados.reserva_tecnica_percentual ?? null,
                reserva_tecnica_responsavel: congelados.reserva_tecnica_responsavel ?? null,
                lucro_projetado_percentual: congelados.lucro_projetado_percentual ?? null,
            } : {}),
        })
        .eq('tenant_id', tenantId).eq('id', id).select('id')
    if (error) falhou(TABELA_DO_ORCAMENTO, error)
    if (!data || data.length !== 1) throw new Error(`${TABELA_DO_ORCAMENTO}: o orçamento ${id} não foi atualizado (os itens já apontam o cálculo ${calculo_id})`)
    return { calculo_id, calculado_em, itens, valor_total_bruto, valor_total_liquido }
}
