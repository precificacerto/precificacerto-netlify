/**
 * A TRAVESSIA do levantamento para o orçamento I.A. — a parte PURA (o plano, as faltas, as frases, os tipos), sem banco: a tela e os testes do
 * navegador a importam sem levar o cliente do servidor. O porquê de cada regra está em `travessia-do-levantamento.ts`.
 */
import { MODO_DO_FALLBACK, MOTIVO_DO_FALLBACK, ORIGEM_DO_FALLBACK } from './custo-do-orcamento'

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
}
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
    comissao_percentual: number | null
    comissao_modo: string | null
    reserva_tecnica_percentual: number | null
    reserva_tecnica_responsavel: string | null
    lucro_projetado_percentual: number | null
    aproveitamento_modo: string
    aproveitamento_origem: string
    aproveitamento_motivo: string | null
    aproveitamento_por: null
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

// as faltas do que não veio do levantamento: o orçamento nasce com o campo NULO, e a precificação o pede
export const FALTA_DA_COMISSAO = 'a comissão (%): o levantamento não a tem, e o orçamento nasce sem ela'
export const FALTA_DO_MODO_DA_COMISSAO = 'o modo da comissão: o levantamento não o tem, e o orçamento nasce sem ele'
export const FALTA_DA_RESERVA_TECNICA = 'a reserva técnica (%): o levantamento não a tem, e o orçamento nasce sem ela'
export const FALTA_DO_RESPONSAVEL_DA_RT = 'o responsável pela reserva técnica: o levantamento não o tem, e o orçamento nasce sem ele'
export const FALTA_DO_LUCRO = 'o lucro projetado (%): o levantamento não o tem, e o orçamento nasce sem ele'

// ── O PURO ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * As faltas do que o orçamento do agente CONGELOU: cada campo nulo, nomeado. Lido sobre o ORÇAMENTO (a tela e a travessia dizem o mesmo),
 * nunca sobre o levantamento. O responsável pela RT só falta quando há reserva técnica a ter responsável.
 */
export function faltasDoCongelado(o: Pick<OrcamentoDaTravessia, 'comissao_percentual' | 'comissao_modo' | 'reserva_tecnica_percentual' | 'reserva_tecnica_responsavel' | 'lucro_projetado_percentual'>): string[] {
    const faltas: string[] = []
    if (o.comissao_percentual === null) faltas.push(FALTA_DA_COMISSAO)
    if (o.comissao_modo === null) faltas.push(FALTA_DO_MODO_DA_COMISSAO)
    if (o.reserva_tecnica_percentual === null) faltas.push(FALTA_DA_RESERVA_TECNICA)
    else if (o.reserva_tecnica_percentual > 0 && o.reserva_tecnica_responsavel === null) faltas.push(FALTA_DO_RESPONSAVEL_DA_RT)
    if (o.lucro_projetado_percentual === null) faltas.push(FALTA_DO_LUCRO)
    return faltas
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
export function planoDaTravessia(lev: LevantamentoNaTravessia, itens: readonly ItemDoLevantamentoNaTravessia[], daBase: ModoDaBase):
    { ok: true; orcamento: OrcamentoDaTravessia; itens: ItemDaTravessia[]; faltas: string[] } | { ok: false; recusas: string[] } {
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
    const orcamento: OrcamentoDaTravessia = {
        tenant_id: lev.tenant_id, origem: 'agente', levantamento_id: lev.id, nome: nome as string, obs: null, criado_por: null,
        comissao_percentual: numeroOuNulo(lev.comissao_percentual),
        comissao_modo: textoOuNulo(lev.comissao_modo),
        reserva_tecnica_percentual: numeroOuNulo(lev.reserva_tecnica_percentual),
        reserva_tecnica_responsavel: textoOuNulo(lev.reserva_tecnica_responsavel),
        lucro_projetado_percentual: numeroOuNulo(lev.lucro_projetado_percentual),
        ...aproveitamentoDaTravessia(daBase),
    }
    return {
        ok: true,
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
