/**
 * A PRECIFICAÇÃO FINAL DO ORÇAMENTO I.A., do lado do servidor (o 1b, dono do produto, 09/11/2026): ler o orçamento com o que o cálculo gravou
 * e o bloco fiscal (a `20261109000004`), e GRAVAR o preço que a tela formou — no ORÇAMENTO, nunca em `products`.
 *
 * O que se grava: o valor de venda, o bloco fiscal (NCM, escopo, comprador, UF de destino) e os três percentuais com que o preço foi formado
 * (comissão, reserva técnica, lucro — o preço é fato daquele instante, e os percentuais vão junto: `fato-vs-referencia.md`).
 *
 * A rota RECUSA, nomeando, pelas mesmas regras da tela (`faltasDoFiscal`, `estadoDoCalculo`): sem o cálculo completo não há preço; sem NCM
 * não há preço; a venda interestadual exige a UF. O valor de venda é o que a tela formou — o servidor confere que é número positivo, não o
 * recalcula (é o mesmo contrato da tela de Produtos com `sale_price`).
 *
 * Toda leitura e escrita leva o `tenant_id` do chamador.
 */
import { supabaseAdmin } from '@/supabase/admin'
import { ratearOperacaoInterna } from './rateio-do-orcamento'
import { gerarEGravarArquivo, lerDadosDoArquivo, type ArquivoGravado } from './arquivo-do-orcamento-servidor'
import { ErroDeValidacao, ErroNaoEncontrado, ErroSemMigracao, TABELA_DO_ITEM, TABELA_DO_ORCAMENTO, tabelaAusente } from './orcamentos-ia'
import {
    estadoDoCalculo, faltasDoFiscal, FORMA_DA_UF, FRASE_DO_ESTADO,
    type EscopoDaVenda, type GravacaoDaPrecificacao, type ItemNaPrecificacao, type OrcamentoNaPrecificacao, type TipoDeComprador,
} from './precificacao-do-orcamento'

export const FRASE_SEM_MIGRACAO_DA_PRECIFICACAO =
    'A precificação do orçamento ainda não está disponível: a estrutura do banco (migrações 20261109000002 a 20261109000005 e 20261110000001) não foi aplicada.'
export class ErroSemMigracaoDaPrecificacao extends Error {
    constructor() { super(FRASE_SEM_MIGRACAO_DA_PRECIFICACAO) }
}
/** O orçamento não pode ser precificado agora (o cálculo não está completo): 409, com a frase. */
export class ErroDoEstado extends Error {}

const COLUNAS_DO_ORCAMENTO = 'id, numero, nome, comissao_percentual, reserva_tecnica_percentual, lucro_projetado_percentual, '
    + 'valor_total_bruto, valor_total_liquido, valor_venda, valor_operacao_interna, ncm_code, sale_scope, buyer_type, uf_destino'
export const COLUNAS_DO_ITEM_NA_PRECIFICACAO = 'id, ordem, tipologia, largura_mm, altura_mm, quantidade, calculo_id, calculado_em, atualizado_em, '
    + 'custo_bruto_materiais, custo_liquido_materiais, tempo_fabricacao_min, valor_minuto, custo_fabricacao, custo_liquido_total'

const colunaAusente = (e: { code?: string } | null | undefined) => e?.code === '42703' || e?.code === 'PGRST204'
function falhou(tabela: string, error: { code?: string; message: string }): never {
    if (colunaAusente(error)) throw new ErroSemMigracaoDaPrecificacao()
    if (tabelaAusente(error)) throw new ErroSemMigracao()
    throw new Error(`${tabela}: ${error.message}`)
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- as tabelas são posteriores a `database.types.ts`
const db = () => supabaseAdmin as any

/** O numeric do PostgREST chega como número ou texto; ausente é NULO, nunca zero. */
const numeroOuNulo = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null
    const n = typeof v === 'number' ? v : Number(v)
    return Number.isFinite(n) ? n : null
}
const NUMERICOS_DO_ORCAMENTO = ['comissao_percentual', 'reserva_tecnica_percentual', 'lucro_projetado_percentual', 'valor_total_bruto', 'valor_total_liquido', 'valor_venda', 'valor_operacao_interna'] as const
const NUMERICOS_DO_ITEM = ['custo_bruto_materiais', 'custo_liquido_materiais', 'tempo_fabricacao_min', 'valor_minuto', 'custo_fabricacao', 'custo_liquido_total'] as const

export async function lerOrcamentoParaPrecificar(tenantId: string, id: string): Promise<OrcamentoNaPrecificacao> {
    const { data, error } = await db().from(TABELA_DO_ORCAMENTO).select(COLUNAS_DO_ORCAMENTO).eq('tenant_id', tenantId).eq('id', id).maybeSingle()
    if (error) falhou(TABELA_DO_ORCAMENTO, error)
    if (!data) throw new ErroNaoEncontrado()
    const { data: itens, error: e2 } = await db().from(TABELA_DO_ITEM).select(COLUNAS_DO_ITEM_NA_PRECIFICACAO)
        .eq('tenant_id', tenantId).eq('orcamento_id', id).order('ordem')
    if (e2) falhou(TABELA_DO_ITEM, e2)
    const o = data as Record<string, unknown>
    return {
        ...(o as unknown as OrcamentoNaPrecificacao),
        ...Object.fromEntries(NUMERICOS_DO_ORCAMENTO.map((c) => [c, numeroOuNulo(o[c])])),
        itens: ((itens ?? []) as Array<Record<string, unknown>>).map((i) => ({
            ...(i as unknown as ItemNaPrecificacao),
            ...Object.fromEntries(NUMERICOS_DO_ITEM.map((c) => [c, numeroOuNulo(i[c])])),
        })),
    }
}

const textoOuNulo = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
function percentual(v: unknown, rotulo: string, erros: string[]): number {
    const n = numeroOuNulo(v)
    if (n === null || n < 0 || n > 100) { erros.push(`${rotulo}: tem de ser um percentual de 0 a 100.`); return 0 }
    return n
}

/** O corpo do PATCH validado, ou a recusa que nomeia cada campo. */
export function validarGravacao(corpo: Record<string, unknown>): GravacaoDaPrecificacao {
    const erros: string[] = []
    const valor = numeroOuNulo(corpo.valor_venda)
    if (valor === null || valor <= 0) erros.push('Valor de venda: tem de ser um número maior que zero.')
    // a interna, em CENTAVOS exatos e até a venda arredondada (as CHECKs da 20261110000001, ditas aqui antes de o banco as dizer)
    const interna = numeroOuNulo(corpo.valor_operacao_interna)
    if (interna === null || interna <= 0) erros.push('Operação interna: tem de ser um número maior que zero.')
    else if (Math.abs(interna * 100 - Math.round(interna * 100)) > 1e-6) erros.push(`Operação interna: tem de estar em centavos (veio ${interna}).`)
    else if (valor !== null && valor > 0 && Math.round(interna * 100) > Math.round(valor * 100)) erros.push('Operação interna: não pode passar do valor de venda.')
    const sale_scope: EscopoDaVenda | null = corpo.sale_scope === 'INTRAESTADUAL' || corpo.sale_scope === 'INTERESTADUAL' ? corpo.sale_scope : null
    if (corpo.sale_scope != null && sale_scope === null) erros.push('Escopo da venda: INTRAESTADUAL ou INTERESTADUAL.')
    const buyer_type: TipoDeComprador | null = corpo.buyer_type === 'CONSUMIDOR_FINAL' || corpo.buyer_type === 'CONTRIBUINTE_PJ' ? corpo.buyer_type : null
    if (corpo.buyer_type != null && buyer_type === null) erros.push('Tipo de comprador: CONSUMIDOR_FINAL ou CONTRIBUINTE_PJ.')
    const uf = textoOuNulo(corpo.uf_destino)
    if (uf !== null && !FORMA_DA_UF.test(uf)) erros.push(`UF de destino: duas letras maiúsculas (veio "${uf}").`)
    const fiscal = { ncm_code: textoOuNulo(corpo.ncm_code), sale_scope, buyer_type, uf_destino: uf }
    erros.push(...faltasDoFiscal(fiscal).map((f) => `Falta ${f}.`))
    const g: GravacaoDaPrecificacao = {
        ...fiscal,
        valor_venda: valor as number,
        valor_operacao_interna: interna as number,
        comissao_percentual: percentual(corpo.comissao_percentual, 'Comissão', erros),
        reserva_tecnica_percentual: percentual(corpo.reserva_tecnica_percentual, 'Reserva técnica', erros),
        lucro_projetado_percentual: percentual(corpo.lucro_projetado_percentual, 'Lucro', erros),
    }
    if (erros.length) throw new ErroDeValidacao(erros)
    return g
}

/**
 * GRAVA a precificação no orçamento `id` da empresa `tenantId`: só depois de conferir que o cálculo gravado está completo — com ele
 * incompleto, desatualizado ou ausente, o preço não tem de onde ter saído. A escrita confere a linha atingida.
 */
export type ResultadoDaGravacao = {
    orcamento: OrcamentoNaPrecificacao
    /** O arquivo "Orçamento" gerado ao salvar (11/11/2026); nulo quando ele não pôde sair — e então `recusasDoArquivo` diz por quê. */
    arquivo: ArquivoGravado | null
    recusasDoArquivo: string[]
}

/** O rateio da interna pelos itens gravados: o peso é o custo líquido total de cada um (material + fabricação). */
export function rateioDoOrcamento(orc: OrcamentoNaPrecificacao, interna: number) {
    return ratearOperacaoInterna(interna, orc.itens.map((i) => ({ ordem: i.ordem, quantidade: i.quantidade, peso: i.custo_liquido_total ?? NaN })))
}

export async function gravarPrecificacao(tenantId: string, id: string, corpo: Record<string, unknown>, autor: string, agora: Date = new Date()): Promise<ResultadoDaGravacao> {
    const g = validarGravacao(corpo)
    const orc = await lerOrcamentoParaPrecificar(tenantId, id)
    const estado = estadoDoCalculo(orc)
    if (estado !== 'completo') throw new ErroDoEstado(FRASE_DO_ESTADO[estado])
    const { data, error } = await db().from(TABELA_DO_ORCAMENTO)
        .update({ ...g, atualizado_em: agora.toISOString() })
        .eq('tenant_id', tenantId).eq('id', id).select('id')
    if (error) {
        if (error.code === '23503') throw new ErroDeValidacao([`UF de destino: "${g.uf_destino}" não é uma UF.`])
        if (error.code === '23514') throw new ErroDeValidacao([`O orçamento não aceitou a precificação: ${error.message}`])
        falhou(TABELA_DO_ORCAMENTO, error)
    }
    if (!data || data.length !== 1) throw new Error(`${TABELA_DO_ORCAMENTO}: o orçamento ${id} não foi atingido ao gravar a precificação`)
    const gravado = await lerOrcamentoParaPrecificar(tenantId, id)
    // O ARQUIVO É GERADO AO SALVAR (dono do produto, 11/11/2026), DEPOIS do preço: o rateio exato e o PDF. O que impede o arquivo (o rateio que não
    // fecha, a venda diferente da interna, a configuração da empresa) é RECUSA NOMEADA na resposta — o preço salvo fica, e a tela diz por que o
    // arquivo não saiu. Nunca um arquivo com centavo a mais ou a menos.
    const rateio = rateioDoOrcamento(gravado, g.valor_operacao_interna)
    if ('recusa' in rateio) return { orcamento: gravado, arquivo: null, recusasDoArquivo: [rateio.recusa] }
    const lido = await lerDadosDoArquivo(tenantId, id, { operacaoInterna: g.valor_operacao_interna, valorVenda: g.valor_venda, rateio: rateio.itens, geradoEm: agora })
    if ('recusa' in lido) return { orcamento: gravado, arquivo: null, recusasDoArquivo: [lido.recusa] }
    const r = await gerarEGravarArquivo(tenantId, id, autor, lido.dados, lido.calculoId)
    return 'recusas' in r ? { orcamento: gravado, arquivo: null, recusasDoArquivo: r.recusas } : { orcamento: gravado, arquivo: r.arquivo, recusasDoArquivo: [] }
}
