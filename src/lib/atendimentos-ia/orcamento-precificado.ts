/**
 * A PRECIFICAÇÃO FINAL DO ORÇAMENTO I.A., do lado do servidor (o 1b, dono do produto, 09/11/2026): ler o orçamento com o que o cálculo gravou
 * e o bloco fiscal (a `20261109000004`), e GRAVAR o preço que a tela formou — no ORÇAMENTO, nunca em `products`.
 *
 * O que se grava: o valor de venda, a operação interna, o fiscal e os três percentuais com que o preço foi formado (comissão, reserva técnica,
 * lucro — o preço é fato daquele instante, e os percentuais vão junto: `fato-vs-referencia.md`). O FISCAL é SEMPRE o preset da comercialização
 * (dono do produto, 11/11/2026: "O escopo vira automático e invisível"): o que o corpo trouxer em NCM, escopo, comprador ou UF é ignorado, e
 * sem caminho manual, de propósito, até o PR que trouxer a venda interestadual.
 *
 * A rota RECUSA, nomeando, pelas mesmas regras da tela (`estadoDoCalculo`): sem o cálculo completo não há preço. O valor de venda é o que a
 * tela formou — o servidor confere que é número positivo, não o recalcula (é o mesmo contrato da tela de Produtos com `sale_price`).
 *
 * Toda leitura e escrita leva o `tenant_id` do chamador.
 */
import { supabaseAdmin } from '@/supabase/admin'
import { FRASE_SEM_COLUNA_DOS_TRIBUTOS_MANUAIS, lerTributosManuais, validarTributosManuais, type TributosManuais } from './tributos-manuais'
import { ratearOperacaoInterna } from './rateio-do-orcamento'
import { gerarEGravarArquivo, lerDadosDoArquivo, type ArquivoGravado } from './arquivo-do-orcamento-servidor'
import { ErroDeValidacao, ErroNaoEncontrado, ErroSemMigracao, TABELA_DO_ITEM, TABELA_DO_ORCAMENTO, tabelaAusente } from './orcamentos-ia'
import {
    estadoDoCalculo, fiscalDivergente, fiscalDoOrcamento, FRASE_DO_ESTADO, PRESET_DA_COMERCIALIZACAO, rastroDoFiscalSobrescrito, MODELO_DO_ORCAMENTO_IA,
    type CampoDivergente, formatoDoOrcamento, type FormatoDoOrcamento,
    type GravacaoDaPrecificacao, type ItemNaPrecificacao, type OrcamentoNaPrecificacao,
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
    + 'custo_bruto_materiais, custo_liquido_materiais, tempo_fabricacao_min, valor_minuto, custo_fabricacao, custo_liquido_total, familia'

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
        // só os itens que VALEM: o removido (a marca `removido_em`, 20261113000002) fica no banco e sai de toda conta e de todo arquivo
        .eq('tenant_id', tenantId).eq('orcamento_id', id).is('removido_em', null).order('ordem')
    if (e2) falhou(TABELA_DO_ITEM, e2)
    const o = data as Record<string, unknown>
    const tributosManuais = await lerColunaDosTributosManuais(tenantId, id)
    const linhas = (itens ?? []) as Array<Record<string, unknown>>
    const familiaDe = (i: Record<string, unknown>) => (typeof i.familia === 'string' && i.familia !== '' ? i.familia : null)
    return {
        ...(o as unknown as OrcamentoNaPrecificacao),
        tributos_manuais: tributosManuais,
        ...Object.fromEntries(NUMERICOS_DO_ORCAMENTO.map((c) => [c, numeroOuNulo(o[c])])),
        itens: linhas.map((i) => ({
            ...(i as unknown as ItemNaPrecificacao),
            ...Object.fromEntries(NUMERICOS_DO_ITEM.map((c) => [c, numeroOuNulo(i[c])])),
        })),
        formato: await formatoLidoDoOrcamento(tenantId, linhas.map((i) => ({ ordem: Number(i.ordem), familia: familiaDe(i) }))),
    }
}

/**
 * Os tributos editados a mão (0044), lidos À PARTE do select principal: com a coluna ainda não aplicada (42703/PGRST204) a leitura do orçamento
 * segue como sempre e os tributos são os das credenciais (nulo) — nunca um erro. Qualquer outra falha é falha.
 */
export async function lerColunaDosTributosManuais(tenantId: string, id: string): Promise<TributosManuais | null> {
    const { data, error } = await db().from(TABELA_DO_ORCAMENTO).select('tributos_manuais').eq('tenant_id', tenantId).eq('id', id).maybeSingle()
    if (error) {
        if (colunaAusente(error)) return null
        throw new Error(`${TABELA_DO_ORCAMENTO}: ${error.message}`)
    }
    return lerTributosManuais((data as Record<string, unknown> | null)?.tributos_manuais)
}

/** O formato das famílias dos itens, lido da base de conhecimento DESTA empresa (23/11/2026). Instâncias da mesma família com formatos diferentes: recusa. */
async function formatoLidoDoOrcamento(tenantId: string, itens: Array<{ ordem: number; familia: string | null }>): Promise<FormatoDoOrcamento> {
    const familias = [...new Set(itens.map((i) => i.familia).filter((f): f is string => f !== null))]
    if (familias.length === 0) return formatoDoOrcamento(itens, new Map())
    const { data, error } = await db().from('orcamentista_materia_prima').select('familia, formato').eq('tenant_id', tenantId).in('familia', familias)
    if (error) falhou('orcamentista_materia_prima', error)
    const porFamilia = new Map<string, Set<'FABRICACAO' | 'REVENDA' | null>>()
    for (const m of (data ?? []) as Array<Record<string, unknown>>) {
        const f = String(m.familia)
        const v = m.formato === 'FABRICACAO' || m.formato === 'REVENDA' ? m.formato : null
        porFamilia.set(f, (porFamilia.get(f) ?? new Set()).add(v))
    }
    const divergentes = [...porFamilia.entries()].filter(([, v]) => v.size > 1).map(([f]) => f).sort()
    if (divergentes.length) return { recusa: `o formato da família ${divergentes.join(', ')}: as instâncias dela na base de conhecimento têm formatos diferentes` }
    return formatoDoOrcamento(itens, new Map([...porFamilia.entries()].map(([f, v]) => [f, [...v][0]])))
}

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
    // o fiscal é o do MODELO (11/11/2026): na industrialização, SEMPRE o preset — o corpo não decide NCM, escopo, comprador nem UF
    const doModelo = fiscalDoOrcamento(MODELO_DO_ORCAMENTO_IA)
    if ('recusa' in doModelo) erros.push(doModelo.recusa)
    const fiscal = 'fiscal' in doModelo ? doModelo.fiscal : { ...PRESET_DA_COMERCIALIZACAO }
    const g: GravacaoDaPrecificacao = {
        ...fiscal,
        valor_venda: valor as number,
        valor_operacao_interna: interna as number,
        comissao_percentual: percentual(corpo.comissao_percentual, 'Comissão', erros),
        reserva_tecnica_percentual: percentual(corpo.reserva_tecnica_percentual, 'Reserva técnica', erros),
        lucro_projetado_percentual: percentual(corpo.lucro_projetado_percentual, 'Lucro', erros),
    }
    // os tributos editados a mão (0044): só se a tela falou neles; `null` limpa. Recusa nomeia o tributo.
    const manuais = validarTributosManuais(corpo.tributos_manuais)
    if (manuais.tocado) {
        if ('erros' in manuais) erros.push(...manuais.erros)
        else g.tributos_manuais = manuais.tributos
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
    /** O fiscal gravado que divergia do preset e foi SOBRESCRITO por este salvar (11/11/2026); vazio quando não havia nada a sobrescrever. */
    fiscalSobrescrito: CampoDivergente[]
}

export const PREFIXO_DO_RASTRO_DA_PRECIFICACAO = '[ORCAMENTO-IA precificacao]'

/** O rateio da interna pelos itens gravados: o peso é o custo líquido total de cada um (material + fabricação). */
export function rateioDoOrcamento(orc: OrcamentoNaPrecificacao, interna: number) {
    return ratearOperacaoInterna(interna, orc.itens.map((i) => ({ ordem: i.ordem, quantidade: i.quantidade, peso: i.custo_liquido_total ?? NaN })))
}

/**
 * GRAVA a precificação no orçamento `id`: só com o cálculo completo. Com autor (a tela), a gravação é EDIÇÃO MANUAL — marca
 * `editado_manualmente_em`/`_por` (dono do produto, 11/11/2026; a CHECK `marca_inteira` os quer juntos). O fiscal que divergia do preset é
 * sobrescrito e REGISTRADO no rastro ("sobrescrever está certo; sobrescrever em silêncio, não").
 */
export async function gravarPrecificacao(tenantId: string, id: string, corpo: Record<string, unknown>, autor: string | null, agora: Date = new Date()): Promise<ResultadoDaGravacao> {
    const g = validarGravacao(corpo)
    const orc = await lerOrcamentoParaPrecificar(tenantId, id)
    const estado = estadoDoCalculo(orc)
    if (estado !== 'completo') throw new ErroDoEstado(FRASE_DO_ESTADO[estado])
    // o formato que não vale (23/11/2026): o preço não se grava com o tipo de produto errado
    if ('recusa' in orc.formato) throw new ErroDoEstado(`Falta: ${orc.formato.recusa}.`)
    const sobrescrito = fiscalDivergente(orc)
    // `tributos_manuais` é gravado À PARTE do preço (a coluna pode não existir ainda): o preço nunca depende dela
    const { tributos_manuais: manuaisDaTela, ...gDoPreco } = g
    const { data, error } = await db().from(TABELA_DO_ORCAMENTO)
        // o AGENTE (autor nulo, a cadeia do "sim") não é edição manual: a marca fica como está
        .update({ ...gDoPreco, atualizado_em: agora.toISOString(), ...(autor ? { editado_manualmente_em: agora.toISOString(), editado_manualmente_por: autor } : {}) })
        .eq('tenant_id', tenantId).eq('id', id).select('id')
    if (error) {
        if (error.code === '23514') throw new ErroDeValidacao([`O orçamento não aceitou a precificação: ${error.message}`])
        falhou(TABELA_DO_ORCAMENTO, error)
    }
    if (!data || data.length !== 1) throw new Error(`${TABELA_DO_ORCAMENTO}: o orçamento ${id} não foi atingido ao gravar a precificação`)
    if (manuaisDaTela !== undefined) await gravarTributosManuais(tenantId, id, manuaisDaTela)
    // o rastro do que foi sobrescrito: stderr, que é o que o log da Vercel deste projeto mostra (`orcamentista-da-empresa.ts`)
    if (sobrescrito.length) console.error(`${PREFIXO_DO_RASTRO_DA_PRECIFICACAO} orcamento=${id} fiscal_sobrescrito=${rastroDoFiscalSobrescrito(sobrescrito)}`)
    const gravado = await lerOrcamentoParaPrecificar(tenantId, id)
    return { orcamento: gravado, fiscalSobrescrito: sobrescrito, ...(await arquivoAoSalvar(tenantId, id, autor, g, gravado, agora)) }
}

/**
 * Grava os tributos manuais. Sem a coluna: se a tela mandou NULO (nada editado) não há o que gravar e segue; se mandou edição, recusa
 * NOMEADA — o preço já está salvo e a frase diz que a edição manual não foi guardada (nunca finge que guardou).
 */
async function gravarTributosManuais(tenantId: string, id: string, valor: TributosManuais | null): Promise<void> {
    const { data, error } = await db().from(TABELA_DO_ORCAMENTO).update({ tributos_manuais: valor }).eq('tenant_id', tenantId).eq('id', id).select('id')
    if (error) {
        if (colunaAusente(error)) {
            if (valor === null) return
            throw new ErroDeValidacao([FRASE_SEM_COLUNA_DOS_TRIBUTOS_MANUAIS])
        }
        if (error.code === '23514') throw new ErroDeValidacao([`O orçamento não aceitou os tributos manuais: ${error.message}`])
        throw new Error(`${TABELA_DO_ORCAMENTO}: ${error.message}`)
    }
    if (!data || data.length !== 1) throw new Error(`${TABELA_DO_ORCAMENTO}: o orçamento ${id} não foi atingido ao gravar os tributos manuais`)
}

/**
 * O ARQUIVO É GERADO AO SALVAR (dono do produto, 11/11/2026), DEPOIS do preço: o rateio exato e o PDF. O que impede o arquivo (o rateio que não
 * fecha, a venda diferente da interna, a configuração da empresa) é RECUSA NOMEADA na resposta — o preço salvo fica, e a tela diz por que o
 * arquivo não saiu. Nunca um arquivo com centavo a mais ou a menos. A FALHA (leitura, Storage, insert) também não derruba a resposta: o preço
 * ESTÁ salvo, e um 500 diria o contrário (prova local de 10/11/2026: uma coluna ausente dava 500 com o preço já gravado).
 */
async function arquivoAoSalvar(tenantId: string, id: string, autor: string | null, g: GravacaoDaPrecificacao, gravado: OrcamentoNaPrecificacao, agora: Date):
    Promise<{ arquivo: ArquivoGravado | null; recusasDoArquivo: string[] }> {
    const rateio = rateioDoOrcamento(gravado, g.valor_operacao_interna)
    if ('recusa' in rateio) return { arquivo: null, recusasDoArquivo: [rateio.recusa] }
    try {
        const lido = await lerDadosDoArquivo(tenantId, id, { operacaoInterna: g.valor_operacao_interna, valorVenda: g.valor_venda, rateio: rateio.itens, geradoEm: agora })
        if ('recusa' in lido) return { arquivo: null, recusasDoArquivo: [lido.recusa] }
        const r = await gerarEGravarArquivo(tenantId, id, autor, lido.dados, lido.calculoId)
        return 'recusas' in r ? { arquivo: null, recusasDoArquivo: r.recusas } : { arquivo: r.arquivo, recusasDoArquivo: [] }
    } catch (e) {
        return { arquivo: null, recusasDoArquivo: [fraseDaFalhaDoArquivo(e)] }
    }
}

/**
 * REGERA o arquivo do orçamento SEM RECALCULAR (dono do produto, 16/11/2026): o PDF é desenhado de novo a partir dos
 * NÚMEROS JÁ GRAVADOS — a operação interna, a venda e o rateio dos custos líquidos que estão no orçamento. Nenhum
 * preço se move, nenhuma tabela é relida: "nada se recalcula para trás".
 *
 * É o que o reenvio do "sim sem mudança" chama quando o arquivo guardado é de OUTRA versão de desenho
 * (`VERSAO_DO_ARQUIVO`) — o caso que mandou ao vendedor, às 18:01 de 16/11, o PDF das 14:05, sem as figuras e sem as
 * observações que entraram no meio. Gerado pelo AGENTE (autor nulo): não é edição manual.
 *
 * A recusa e a falha voltam NOMEADAS, e quem chama decide: nunca se engole um arquivo que não saiu.
 */
export async function regerarOArquivo(tenantId: string, id: string, agora: Date = new Date()):
    Promise<{ arquivo: ArquivoGravado } | { recusas: string[] }> {
    const gravado = await lerOrcamentoParaPrecificar(tenantId, id)
    const interna = gravado.valor_operacao_interna
    const venda = gravado.valor_venda
    if (!Number.isFinite(interna as number) || !Number.isFinite(venda as number)) {
        return { recusas: [`o orçamento ${gravado.numero} não tem a operação interna e a venda gravadas: o arquivo não pode ser regerado sem recalcular`] }
    }
    const rateio = rateioDoOrcamento(gravado, interna as number)
    if ('recusa' in rateio) return { recusas: [rateio.recusa] }
    const lido = await lerDadosDoArquivo(tenantId, id, { operacaoInterna: interna as number, valorVenda: venda as number, rateio: rateio.itens, geradoEm: agora })
    if ('recusa' in lido) return { recusas: [lido.recusa] }
    const r = await gerarEGravarArquivo(tenantId, id, null, lido.dados, lido.calculoId)
    return 'recusas' in r ? { recusas: r.recusas } : { arquivo: r.arquivo }
}

export const fraseDaFalhaDoArquivo = (e: unknown) =>
    `o arquivo não pôde ser gerado (${e instanceof Error ? e.message : String(e)}); a precificação está salva — salve de novo para tentar outra vez.`
