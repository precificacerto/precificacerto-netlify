/**
 * A TRAVESSIA do levantamento para o orçamento I.A. — a parte PURA (o plano, as faltas, as frases, os tipos), sem banco: a tela e os testes do
 * navegador a importam sem levar o cliente do servidor. O porquê de cada regra está em `travessia-do-levantamento.ts`.
 */
import { MODO_DO_FALLBACK, MOTIVO_DO_FALLBACK, ORIGEM_DO_FALLBACK } from './custo-do-orcamento'
import { PRESET_DA_COMERCIALIZACAO } from './precificacao-do-orcamento'

export const ESTADO_COMPLETO = 'COMPLETO'
/** O nome do orçamento: a CHECK `orcamentista_orcamento_nome_forma` (até 120 caracteres). O mesmo número de `LIMITE_DO_NOME` (`orcamentos-ia.ts`), preso por teste — aqui sem importá-lo, porque aquele módulo leva o cliente do servidor. */
export const LIMITE_DO_NOME = 120

// ── O CONTRATO ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type LevantamentoNaTravessia = {
    id: string
    tenant_id: string
    numero: number
    nome: string
    estado: string
    comissao_percentual: number | null
    comissao_modo: string | null
    reserva_tecnica_percentual: number | null
    reserva_tecnica_responsavel: string | null
    lucro_projetado_percentual: number | null
    /** o vendedor do levantamento: de quem é a pré-definição da base de conhecimento (`orcamentista_vendedor_perfil`) */
    vendedor_employee_id?: string | null
}
/**
 * A PRÉ-DEFINIÇÃO DE CONTEXTO da base de conhecimento para os percentuais: o perfil do vendedor do levantamento
 * (`orcamentista_vendedor_perfil`, a seção Vendedores da base). Nulo quando o levantamento não tem vendedor ou o vendedor não tem perfil.
 */
export type PreDefinicaoDoVendedor = {
    comissao_percentual: number | null
    comissao_modo: string | null
    reserva_tecnica_percentual: number | null
    lucro_projetado_percentual: number | null
}
/** De onde veio cada um dos três percentuais na travessia (dono do produto, 11/11/2026): a ordem é esta, e o zero é o ÚLTIMO recurso. */
export const ORIGENS_DO_PERCENTUAL = ['levantamento', 'base_de_conhecimento', 'zero_por_ausencia'] as const
export type OrigemDoPercentual = (typeof ORIGENS_DO_PERCENTUAL)[number]
export const PERCENTUAIS_COM_ZERO = ['comissao_percentual', 'reserva_tecnica_percentual', 'lucro_projetado_percentual'] as const
export type PercentualComZero = (typeof PERCENTUAIS_COM_ZERO)[number]
export type OrigensDosPercentuais = Record<PercentualComZero, OrigemDoPercentual>
export type ItemDoLevantamentoNaTravessia = {
    id: string
    ordem: number
    tipologia: string | null
    largura_mm: number | null
    altura_mm: number | null
    quantidade: number | null
    cor_perfil: string | null
    vidro: string | null
    ambientes: unknown
    escolhas: unknown
}
/** O orçamento como a travessia o grava (sem `numero`, que é reservado na escrita). */
export type OrcamentoDaTravessia = {
    tenant_id: string
    origem: 'agente'
    levantamento_id: string
    nome: string
    obs: null
    criado_por: null
    comissao_percentual: number
    comissao_modo: string | null
    reserva_tecnica_percentual: number
    reserva_tecnica_responsavel: string | null
    lucro_projetado_percentual: number
    aproveitamento_modo: string
    aproveitamento_origem: string
    aproveitamento_motivo: string | null
    aproveitamento_por: null
    // o preset da comercialização (dono do produto, 11/11/2026), gravado na criação; a tela da precificação os altera por orçamento
    sale_scope: typeof PRESET_DA_COMERCIALIZACAO.sale_scope
    buyer_type: typeof PRESET_DA_COMERCIALIZACAO.buyer_type
    uf_destino: null
    ncm_code: null
}
export type ItemDaTravessia = {
    ordem: number
    levantamento_item_id: string
    tipologia: string | null
    largura_mm: number | null
    altura_mm: number | null
    quantidade: number
    cor_perfil: string | null
    vidro: string | null
    ambientes: unknown
    escolhas: unknown
}
/** O modo de aproveitamento que a base de conhecimento deu, ou nulo quando ela não responde. */
export type ModoDaBase = 'COM' | 'SEM' | null

export class ErroDaTravessia extends Error {
    constructor(readonly recusas: string[]) { super(recusas.join(' | ')) }
}
/** O levantamento já tem orçamento: a travessia não cria o segundo. */
export class ErroJaAtravessado extends Error {
    constructor(readonly levantamentoNumero: number, readonly orcamentoId: string, readonly orcamentoNumero: number) {
        super(fraseJaAtravessado(levantamentoNumero, orcamentoNumero))
    }
}

export const fraseJaAtravessado = (levantamento: number, orcamento: number) =>
    `O levantamento ${levantamento} já tem o orçamento ${orcamento}: a travessia não cria um segundo.`
export const fraseNaoCompleto = (numero: number, estado: string) =>
    `o levantamento ${numero} completo: ele está "${estado}", e só o completo atravessa para o orçamento`
export const fraseSemItens = (numero: number) => `as esquadrias do levantamento ${numero}: ele não tem nenhuma`
export const fraseSemQuantidade = (ordem: number) => `a quantidade da esquadria ${ordem}: sem ela o item não atravessa (vazio não vira 1)`
export const fraseDoNome = (numero: number) =>
    `o nome do cliente do levantamento ${numero}, com até ${LIMITE_DO_NOME} caracteres: o orçamento não nasce sem ele`

// A REGRA DO ZERO (dono do produto, 11/11/2026): "a ausência de imputação significa ZERO, nos três: comissao_percentual,
// lucro_projetado_percentual e reserva_tecnica_percentual" — lucro zero pode ser intencional, para achar o limite. Os três nunca são falta;
// o zero por ausência é DESTACADO na tela (`ORIGEM_DO_PERCENTUAL`), nunca silencioso. O responsável pela RT é nome livre, não entra em
// cálculo nenhum, e nulo ali NÃO é falta. Resta o modo da comissão, que não tem zero.
export const FALTA_DO_MODO_DA_COMISSAO = 'o modo da comissão: nem o levantamento nem a pré-definição do vendedor o têm, e o orçamento nasce sem ele'

// ── O PURO ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * As faltas do que o orçamento do agente CONGELOU, lidas sobre o ORÇAMENTO (a tela e a travessia dizem o mesmo). Pela regra do zero
 * (11/11/2026), só o modo da comissão pode faltar: os três percentuais nunca faltam, e o responsável pela RT nunca é falta.
 */
export function faltasDoCongelado(o: Pick<OrcamentoDaTravessia, 'comissao_modo'>): string[] {
    return o.comissao_modo === null ? [FALTA_DO_MODO_DA_COMISSAO] : []
}

/** O percentual na ordem decidida: o do levantamento; senão o da pré-definição do vendedor; senão ZERO explícito — nunca o zero primeiro. */
export function resolverPercentual(doLevantamento: unknown, daBase: unknown): { valor: number; origem: OrigemDoPercentual } {
    const l = numeroOuNulo(doLevantamento)
    if (l !== null) return { valor: l, origem: 'levantamento' }
    const b = numeroOuNulo(daBase)
    if (b !== null) return { valor: b, origem: 'base_de_conhecimento' }
    return { valor: 0, origem: 'zero_por_ausencia' }
}

/**
 * A ORIGEM que a TELA exibe, derivada por comparação (sem coluna — dono do produto, 11/11/2026: "a tela compara com o levantamento"):
 * o valor do orçamento igual ao do levantamento veio dele; com o levantamento sem valor, igual ao da pré-definição veio da base; zero com
 * os dois sem valor é o zero por ausência; qualquer outro foi ALTERADO no orçamento depois da travessia. A pré-definição é lida AGORA: se
 * ela mudou depois da travessia, o valor de então aparece como alterado (é a leitura viva, e a tela o diz assim).
 */
export type OrigemNaTela = OrigemDoPercentual | 'alterado_no_orcamento'
/** Um dos três percentuais como a tela o mostra: o valor gravado no orçamento e a origem derivada. */
export type PercentualNaTela = { campo: PercentualComZero; valor: number | null; origem: OrigemNaTela | null }
export function origemNaTela(doOrcamento: unknown, doLevantamento: unknown, daBase: unknown): OrigemNaTela | null {
    const o = numeroOuNulo(doOrcamento)
    if (o === null) return null
    const l = numeroOuNulo(doLevantamento)
    if (l !== null) return o === l ? 'levantamento' : 'alterado_no_orcamento'
    const b = numeroOuNulo(daBase)
    if (b !== null) return o === b ? 'base_de_conhecimento' : 'alterado_no_orcamento'
    return o === 0 ? 'zero_por_ausencia' : 'alterado_no_orcamento'
}
export const ROTULO_DA_ORIGEM_DO_PERCENTUAL: Readonly<Record<OrigemNaTela, string>> = {
    levantamento: 'da conversa (levantamento)',
    base_de_conhecimento: 'da pré-definição do vendedor (base de conhecimento)',
    zero_por_ausencia: 'ZERO por ausência: nem a conversa nem a base o tinham',
    alterado_no_orcamento: 'alterado no orçamento',
}

/** O aproveitamento do orçamento: o que a base deu, ou o fallback que nunca barateia. Ninguém escolheu: nunca há autor. */
export function aproveitamentoDaTravessia(daBase: ModoDaBase): Pick<OrcamentoDaTravessia, 'aproveitamento_modo' | 'aproveitamento_origem' | 'aproveitamento_motivo' | 'aproveitamento_por'> {
    if (daBase !== null) return { aproveitamento_modo: daBase, aproveitamento_origem: 'base_de_conhecimento', aproveitamento_motivo: null, aproveitamento_por: null }
    return { aproveitamento_modo: MODO_DO_FALLBACK, aproveitamento_origem: ORIGEM_DO_FALLBACK, aproveitamento_motivo: MOTIVO_DO_FALLBACK, aproveitamento_por: null }
}

/** O número do banco (numeric chega como texto), sem transformar nulo em zero. */
const numeroOuNulo = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
}
const textoOuNulo = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

/**
 * O PLANO da travessia: o orçamento e os itens que serão gravados, e as faltas do congelado — ou as recusas, e nada é gravado. Puro.
 */
export function planoDaTravessia(lev: LevantamentoNaTravessia, itens: readonly ItemDoLevantamentoNaTravessia[], daBase: ModoDaBase, doVendedor: PreDefinicaoDoVendedor | null):
    { ok: true; orcamento: OrcamentoDaTravessia; itens: ItemDaTravessia[]; faltas: string[]; origens: OrigensDosPercentuais } | { ok: false; recusas: string[] } {
    const recusas: string[] = []
    if (lev.estado !== ESTADO_COMPLETO) recusas.push(fraseNaoCompleto(lev.numero, lev.estado))
    const nome = textoOuNulo(lev.nome)
    if (nome === null || [...nome].length > LIMITE_DO_NOME) recusas.push(fraseDoNome(lev.numero))
    if (itens.length === 0) recusas.push(fraseSemItens(lev.numero))
    const ordenados = [...itens].sort((a, b) => a.ordem - b.ordem)
    for (const i of ordenados) {
        const q = numeroOuNulo(i.quantidade)
        if (q === null || !Number.isInteger(q) || q < 1) recusas.push(fraseSemQuantidade(i.ordem))
    }
    if (recusas.length) return { ok: false, recusas }
    const comissao = resolverPercentual(lev.comissao_percentual, doVendedor?.comissao_percentual)
    const rt = resolverPercentual(lev.reserva_tecnica_percentual, doVendedor?.reserva_tecnica_percentual)
    const lucro = resolverPercentual(lev.lucro_projetado_percentual, doVendedor?.lucro_projetado_percentual)
    const orcamento: OrcamentoDaTravessia = {
        tenant_id: lev.tenant_id, origem: 'agente', levantamento_id: lev.id, nome: nome as string, obs: null, criado_por: null,
        comissao_percentual: comissao.valor,
        comissao_modo: textoOuNulo(lev.comissao_modo) ?? textoOuNulo(doVendedor?.comissao_modo),
        reserva_tecnica_percentual: rt.valor,
        reserva_tecnica_responsavel: textoOuNulo(lev.reserva_tecnica_responsavel),
        lucro_projetado_percentual: lucro.valor,
        ...aproveitamentoDaTravessia(daBase),
        ...PRESET_DA_COMERCIALIZACAO,
    }
    return {
        ok: true,
        origens: { comissao_percentual: comissao.origem, reserva_tecnica_percentual: rt.origem, lucro_projetado_percentual: lucro.origem },
        orcamento,
        itens: ordenados.map((i) => ({
            ordem: i.ordem, levantamento_item_id: i.id, tipologia: i.tipologia, largura_mm: i.largura_mm, altura_mm: i.altura_mm,
            quantidade: numeroOuNulo(i.quantidade) as number, cor_perfil: i.cor_perfil, vidro: i.vidro,
            ambientes: i.ambientes ?? null, escolhas: i.escolhas ?? null,
        })),
        faltas: faltasDoCongelado(orcamento),
    }
}

/** O cliente e o vendedor do orçamento do agente, LIDOS do levantamento de origem (não são copiados — decisão de 10/11/2026). */
export type ClienteDoLevantamento = {
    levantamento_numero: number
    nome: string
    telefone: string | null
    email: string | null
    endereco: string | null
    edificacao: string | null
    obs_obra: string | null
    data_entrega: string | null
    vendedor_nome: string | null
    vendedor_employee_id: string | null
}
