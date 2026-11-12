/**
 * CALCULAR E GRAVAR o orçamento I.A. (o 1b, dono do produto, 09/11/2026): as esquadrias do orçamento passam pelo caminho completo
 * (`custoDoLevantamento`), e o resultado é gravado NO ORÇAMENTO — nunca na conversa:
 *   1. as linhas de `orcamentista_orcamento_item_material` com um `calculo_id` NOVO (a tabela é só de INSERT: o cálculo de antes fica);
 *   2. cada item: `calculo_id`, `calculado_em` e os valores da 20261109000002 (o par bruto/líquido, os efetivos, a fabricação, o total);
 *   3. o orçamento: o modo de aproveitamento do pedido (o fallback, com origem e motivo) e os totais bruto e líquido. O valor de venda NÃO
 *      se grava aqui: ele sai da precificação final, na tela.
 * Os percentuais da comissão, da reserva técnica e do lucro NÃO são tocados aqui (dono do produto, 11/11/2026): a TRAVESSIA os congela uma
 * vez, pela regra do zero (o levantamento, senão a pré-definição do vendedor, senão zero), e eles podem ser alterados no orçamento. Regravá-los
 * do levantamento a cada cálculo era uma segunda cópia (`copia-divergente.md`): devolvia o NULO que a regra do zero resolveu e apagava a
 * alteração feita na precificação.
 *
 * A ORDEM DA ESCRITA É A QUE NÃO DEIXA NÚMERO ERRADO (dono do produto, 09/11/2026):
 *   0. ANULA, no orçamento, os totais e o valor de venda — o cálculo de antes deixa de valer ANTES de qualquer número novo;
 *   1. o material, com o `calculo_id` novo (o item só aponta um cálculo que já existe);
 *   2. os itens, apontando o cálculo;
 *   3. o orçamento: os totais e os percentuais.
 * As escritas não são uma transação. A falha no meio deixa os totais NULOS — ausentes e visíveis ("cálculo incompleto — recalcule", na
 * tela) — nunca os VELHOS ao lado dos itens novos, que seria número errado em dinheiro. O material de um cálculo interrompido fica sem
 * apontador (legível, nunca lido como vigente): DÍVIDA CONHECIDA e aceita pelo dono do produto; a forma atômica seria uma função no banco.
 *
 * Toda leitura e escrita leva o `tenant_id` do chamador. Nada evolui com falta: a recusa do cálculo volta nomeada e nada é gravado.
 *
 * A TABELA É A VIGENTE (dono do produto, 10/11/2026): o preço é o das tabelas que valem para a família NO MOMENTO DO CÁLCULO
 * (`lerFamiliasDaEmpresa`), nunca a que o levantamento congelou. O `tabela_id` congelado no item de origem só serve para AVISAR
 * (`avisosDeDivergencia`): quando ele não está entre as vigentes, o resultado traz a frase com as duas tabelas e a diferença de custo. Não bloqueia.
 */
import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/supabase/admin'
import { lerOrcamento, ErroSemMigracao, TABELA_DO_ITEM, TABELA_DO_ORCAMENTO, tabelaAusente } from './orcamentos-ia'
import { custoDoLevantamento } from './custo-do-orcamento-servidor'
import { lerFamiliasDaEmpresa, type EsquadriaGravada } from './levantamento-da-conversa'
import { MODO_DO_FALLBACK, ORIGEM_DO_FALLBACK, MOTIVO_DO_FALLBACK, PERCENTUAIS, type CustoDoItem } from './custo-do-orcamento'
import { avisosDeDivergencia, type LinhaDaTabelaCongelada } from './divergencia-da-tabela'

export const TABELA_DO_MATERIAL = 'orcamentista_orcamento_item_material'
/** As colunas da fotografia da resolução de referência (migração 20261112000001). */
export const COLUNAS_DA_RESOLUCAO = ['codigo_na_tabela', 'resolucao'] as const
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
    /** A tabela congelada no levantamento que não é a vigente usada, por item; vazia quando nenhuma divergiu ou nenhuma foi congelada. */
    avisos: string[]
    /**
     * A FOTOGRAFIA DA RESOLUÇÃO (12/11/2026, migração 20261112000001): `gravada` quando o material guardou o código na tabela e o como achou;
     * `sem_migracao` quando as duas colunas ainda não existem e o material foi gravado sem elas — o cálculo não para por isso, e quem chama diz.
     */
    fotografia_da_resolucao: 'gravada' | 'sem_migracao'
}

/** Os itens do levantamento de onde o orçamento do agente veio: as escolhas, a família e a tabela congelada de cada um. */
async function lerDoLevantamento(tenantId: string, idsDosItens: string[]) {
    let itens: Array<{ id: string; escolhas: unknown; familia: unknown; tabela_id: string | null }> = []
    if (idsDosItens.length) {
        const r = await db().from('orcamentista_levantamento_item').select('id, escolhas, familia, tabela_id').eq('tenant_id', tenantId).in('id', idsDosItens)
        if (r.error) falhou('orcamentista_levantamento_item', r.error)
        itens = r.data ?? []
    }
    return { porItem: new Map(itens.map((i) => [i.id, i])) }
}

/**
 * Calcula o orçamento `id` da empresa `tenantId` e grava o resultado. `agora` e `novoId` existem para o teste; em produção são o relógio e
 * `randomUUID`.
 */
export async function calcularOrcamento(tenantId: string, id: string, agora: Date = new Date(), novoId: () => string = randomUUID): Promise<ResultadoDoCalculo> {
    const orc = await lerOrcamento(tenantId, id)
    if (orc.itens.length === 0) throw new ErroDoCalculo(['as esquadrias do orçamento: ele não tem nenhum item'])
    const doLevantamento = orc.levantamento_id
        ? await lerDoLevantamento(tenantId, orc.itens.map((i) => i.levantamento_item_id).filter((x): x is string => !!x))
        : null
    const esquadrias: EsquadriaGravada[] = orc.itens.map((i) => {
        const deOrigem = i.levantamento_item_id ? doLevantamento?.porItem.get(i.levantamento_item_id) : undefined
        return {
            ordem: i.ordem, tipologia: i.tipologia, largura_mm: i.largura_mm, altura_mm: i.altura_mm, quantidade: i.quantidade,
            cor_perfil: i.cor_perfil, vidro: i.vidro, escolhas: deOrigem?.escolhas ?? null, familia: deOrigem?.familia ?? null,
        }
    })
    const fonte = await lerFamiliasDaEmpresa(tenantId)
    const custo = await custoDoLevantamento(tenantId, fonte, { nome: orc.nome, itens: esquadrias })
    if ('recusas' in custo) throw new ErroDoCalculo(custo.recusas)
    const avisos = await avisosDaTabelaCongelada(tenantId, fonte, orc.itens, custo.itens, doLevantamento?.porItem ?? new Map())

    const calculo_id = novoId()
    const calculado_em = agora.toISOString()
    // 0. o cálculo de antes deixa de valer: os totais e o valor de venda ficam nulos até o passo 3
    {
        const { data, error } = await db().from(TABELA_DO_ORCAMENTO)
            .update({ valor_total_bruto: null, valor_total_liquido: null, valor_venda: null, atualizado_em: calculado_em })
            .eq('tenant_id', tenantId).eq('id', id).select('id')
        if (error) falhou(TABELA_DO_ORCAMENTO, error)
        if (!data || data.length !== 1) throw new Error(`${TABELA_DO_ORCAMENTO}: o orçamento ${id} não foi atingido ao anular os totais; nada foi gravado`)
    }
    // 1. o material, com o cálculo novo
    const linhas = custo.itens.flatMap((c, k) => c.materiais.map((m) => ({ tenant_id: tenantId, orcamento_item_id: orc.itens[k].id, calculo_id, ...m })))
    let fotografia_da_resolucao: 'gravada' | 'sem_migracao' = 'gravada'
    if (linhas.length) {
        const { error } = await db().from(TABELA_DO_MATERIAL).insert(linhas)
        // A DEFESA QUE NÃO DEPENDE DA ORDEM (`migracao.md`, Parte I): sem a 20261112000001, faltam SÓ as duas colunas da resolução — o material
        // é gravado sem elas, e o resultado diz. Qualquer outra falta continua sendo a recusa de sempre
        if (error && colunaAusente(error) && COLUNAS_DA_RESOLUCAO.some((c) => (error.message ?? '').includes(c))) {
            const semAsDuas = linhas.map(({ codigo_na_tabela: _c, resolucao: _r, ...resto }) => { void _c; void _r; return resto })
            const outra = await db().from(TABELA_DO_MATERIAL).insert(semAsDuas)
            if (outra.error) falhou(TABELA_DO_MATERIAL, outra.error)
            fotografia_da_resolucao = 'sem_migracao'
        } else if (error) falhou(TABELA_DO_MATERIAL, error)
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
    const { data, error } = await db().from(TABELA_DO_ORCAMENTO)
        .update({
            aproveitamento_modo: MODO_DO_FALLBACK, aproveitamento_origem: ORIGEM_DO_FALLBACK, aproveitamento_motivo: MOTIVO_DO_FALLBACK, aproveitamento_por: null,
            valor_total_bruto, valor_total_liquido, atualizado_em: calculado_em,
        })
        .eq('tenant_id', tenantId).eq('id', id).select('id')
    if (error) falhou(TABELA_DO_ORCAMENTO, error)
    if (!data || data.length !== 1) throw new Error(`${TABELA_DO_ORCAMENTO}: o orçamento ${id} não foi atualizado (os itens já apontam o cálculo ${calculo_id})`)
    return { calculo_id, calculado_em, itens, valor_total_bruto, valor_total_liquido, avisos, fotografia_da_resolucao }
}

/**
 * Os avisos da tabela congelada: para cada item cujo item de origem congelou uma tabela que não está entre as vigentes da família dele, as linhas
 * dessa tabela para os códigos do item, e a frase. Só lê; nada aqui muda o cálculo nem é gravado.
 */
async function avisosDaTabelaCongelada(
    tenantId: string, fonte: Awaited<ReturnType<typeof lerFamiliasDaEmpresa>>, itensDoOrcamento: ReadonlyArray<{ ordem: number; levantamento_item_id: string | null }>,
    custos: readonly CustoDoItem[], porItem: ReadonlyMap<string, { familia: unknown; tabela_id: string | null }>,
): Promise<string[]> {
    void tenantId
    const vigentesDa = new Map(('familias' in fonte ? fonte.familias : []).map((f) => [f.familia, f.tabelasDePreco]))
    const itens = itensDoOrcamento.map((i, k) => {
        const origem = i.levantamento_item_id ? porItem.get(i.levantamento_item_id) : undefined
        return { ordem: i.ordem, tabelaCongelada: origem?.tabela_id ?? null, tabelasVigentes: vigentesDa.get(String(origem?.familia ?? '')) ?? [], materiais: custos[k].materiais }
    })
    const divergentes = itens.filter((i) => i.tabelaCongelada !== null && !i.tabelasVigentes.includes(i.tabelaCongelada))
    if (divergentes.length === 0) return []
    const congeladas = new Map<string, LinhaDaTabelaCongelada[]>()
    for (const t of new Set(divergentes.map((i) => i.tabelaCongelada as string))) {
        // o item JÁ RESOLVIDO, pelo código dele na tabela (a fotografia, 12/11/2026): reler a mesma linha, nunca resolver de novo
        const codigos = [...new Set(divergentes.filter((i) => i.tabelaCongelada === t).flatMap((i) => i.materiais.map((m) => m.codigo_na_tabela)))]
        const { data, error } = await db().from('orcamentista_tabela_item').select(`codigo, valor_barra_interno, ${PERCENTUAIS.join(', ')}`).eq('tabela_id', t).in('codigo', codigos)
        if (error) falhou('orcamentista_tabela_item', error)
        congeladas.set(t, (data ?? []) as LinhaDaTabelaCongelada[])
    }
    const ids = [...new Set(divergentes.flatMap((i) => [i.tabelaCongelada as string, ...i.tabelasVigentes]))]
    const { data: tabelas, error } = await db().from('orcamentista_tabela').select('id, arquivo_nome').in('id', ids)
    if (error) falhou('orcamentista_tabela', error)
    const nomes = new Map(((tabelas ?? []) as Array<{ id: string; arquivo_nome: string }>).map((t) => [t.id, t.arquivo_nome]))
    return avisosDeDivergencia(divergentes, congeladas, nomes)
}
