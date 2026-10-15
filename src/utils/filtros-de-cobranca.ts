/**
 * filtros-de-cobranca.ts — os três filtros de cobrança da lista de Clientes, e a travessia
 * deles para a URL.
 *
 * PURO: não lê relógio, não lê `router`, não consulta. `hoje` é parâmetro, pela mesma razão
 * de `parcelas-do-cliente.ts` — os atalhos "este mês" e "7 dias" são derivados da data, e um
 * módulo que lesse o relógio não seria testável.
 *
 * OS PARÂMETROS SÃO SEPARADOS E LEGÍVEIS, NUNCA UM BLOB
 * -----------------------------------------------------
 *   ?atraso=1&a_vencer=1&atraso_de=31&atraso_ate=60
 *   &vence_de=2026-10-01&vence_ate=2026-10-31&situacao=ACTIVE&segmento=Varejo&busca=silva
 *
 * Parâmetro separado se lê, se linka e se conserta à mão; blob serializado é opaco, e o
 * primeiro que editar a URL quebra tudo. Estende o padrão que já existe em
 * `agenda/index.tsx:540-541` (`router.replace` + `shallow`), em vez de inventar mecanismo.
 *
 * O ATALHO ESCREVE O VALOR RESOLVIDO, NÃO O NOME DO ATALHO
 * ---------------------------------------------------------
 * "Este mês" vira `vence_de=2026-10-01&vence_ate=2026-10-31`, e não `vence=este_mes`. Um
 * link com o nome do atalho significa OUTRA COISA no mês seguinte — e a URL existe
 * justamente para ser guardada e compartilhada. O mesmo vale para "1-30 dias", que vira
 * `atraso_de=1&atraso_ate=30`.
 *
 * PERÍODO É ORTOGONAL A ESTADO
 * -----------------------------
 * A faixa de vencimento NÃO decide se a parcela está vencida. "Este mês" + EM ATRASO são as
 * VENCIDAS de outubro; "este mês" sozinho são as de outubro, vencidas ou não. Os dois testes
 * são aplicados à MESMA parcela, e o cliente entra na lista se ao menos uma parcela passa
 * nos dois.
 */

import type { AgregadoDoCliente, DiaISO, Parcela } from '@/utils/parcelas-do-cliente'

export interface FiltrosDeCobranca {
    /** Interruptor independente. Pode estar ligado junto com `aVencer`. */
    emAtraso: boolean
    /** Interruptor independente. Os dois ligados = quem me deve qualquer coisa. */
    aVencer: boolean
    /** Faixa de dias de atraso, inclusiva nas duas pontas. `null` em cada ponta = sem limite. */
    atrasoDe: number | null
    atrasoAte: number | null
    /** Faixa de VENCIMENTO, `YYYY-MM-DD`, inclusiva nas duas pontas. */
    venceDe: DiaISO | null
    venceAte: DiaISO | null
    /** `customers.status`. Sobe do filtro de coluna do antd para o estado da página. */
    situacao: string[]
    /** `customers.segment`. Idem. */
    segmento: string[]
    busca: string
}

export const FILTROS_DE_COBRANCA_VAZIOS: FiltrosDeCobranca = {
    emAtraso: false,
    aVencer: false,
    atrasoDe: null,
    atrasoAte: null,
    venceDe: null,
    venceAte: null,
    situacao: [],
    segmento: [],
    busca: '',
}

/** O rótulo da faixa de vencimento. NUNCA "período": o usuário precisa saber de QUAL data. */
export const ROTULO_DA_FAIXA_DE_VENCIMENTO = 'Vencimento entre'

export type AtalhoDeAtraso = '1-30' | '31-60' | '61-90' | '90+'
export type AtalhoDeVencimento = '7' | '15' | '30' | 'este-mes' | 'mes-que-vem'

export const ATALHOS_DE_ATRASO: ReadonlyArray<{ chave: AtalhoDeAtraso; rotulo: string }> = [
    { chave: '1-30', rotulo: '1 a 30 dias' },
    { chave: '31-60', rotulo: '31 a 60 dias' },
    { chave: '61-90', rotulo: '61 a 90 dias' },
    { chave: '90+', rotulo: 'mais de 90 dias' },
]

export const ATALHOS_DE_VENCIMENTO: ReadonlyArray<{ chave: AtalhoDeVencimento; rotulo: string }> = [
    { chave: '7', rotulo: 'vence em 7 dias' },
    { chave: '15', rotulo: 'vence em 15 dias' },
    { chave: '30', rotulo: 'vence em 30 dias' },
    { chave: 'este-mes', rotulo: 'este mês' },
    { chave: 'mes-que-vem', rotulo: 'mês que vem' },
]

function partes(dia: DiaISO): [number, number, number] {
    const [a, m, d] = dia.split('-').map(Number)
    return [a, m, d]
}

function paraISO(ano: number, mes: number, dia: number): DiaISO {
    const p = (n: number, tamanho = 2) => String(n).padStart(tamanho, '0')
    return `${p(ano, 4)}-${p(mes)}-${p(dia)}`
}

function somarDias(dia: DiaISO, n: number): DiaISO {
    const [a, m, d] = partes(dia)
    const t = new Date(Date.UTC(a, m - 1, d + n))
    return paraISO(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
}

function ultimoDiaDoMes(ano: number, mes: number): number {
    return new Date(Date.UTC(ano, mes, 0)).getUTCDate()
}

/** A faixa de dias que o atalho de atraso representa. */
export function faixaDoAtalhoDeAtraso(atalho: AtalhoDeAtraso): { de: number; ate: number | null } {
    switch (atalho) {
        case '1-30': return { de: 1, ate: 30 }
        case '31-60': return { de: 31, ate: 60 }
        case '61-90': return { de: 61, ate: 90 }
        case '90+': return { de: 91, ate: null }
    }
}

/** A faixa de datas que o atalho de vencimento representa, resolvida contra `hoje`. */
export function faixaDoAtalhoDeVencimento(atalho: AtalhoDeVencimento, hoje: DiaISO): { de: DiaISO; ate: DiaISO } {
    const [ano, mes] = partes(hoje)
    switch (atalho) {
        case '7': return { de: hoje, ate: somarDias(hoje, 7) }
        case '15': return { de: hoje, ate: somarDias(hoje, 15) }
        case '30': return { de: hoje, ate: somarDias(hoje, 30) }
        case 'este-mes':
            return { de: paraISO(ano, mes, 1), ate: paraISO(ano, mes, ultimoDiaDoMes(ano, mes)) }
        case 'mes-que-vem': {
            const proximoAno = mes === 12 ? ano + 1 : ano
            const proximoMes = mes === 12 ? 1 : mes + 1
            return {
                de: paraISO(proximoAno, proximoMes, 1),
                ate: paraISO(proximoAno, proximoMes, ultimoDiaDoMes(proximoAno, proximoMes)),
            }
        }
    }
}

// ── A travessia para a URL ──────────────────────────────────────────────────────────────

/** O que o `router.query` entrega: string, lista de strings, ou nada. */
export type ValorDaQuery = string | string[] | undefined

function umaString(v: ValorDaQuery): string | null {
    const bruto = Array.isArray(v) ? v[0] : v
    const texto = (bruto ?? '').trim()
    return texto === '' ? null : texto
}

function umaLista(v: ValorDaQuery): string[] {
    const texto = umaString(v)
    if (texto === null) return []
    return texto.split(',').map((s) => s.trim()).filter((s) => s !== '')
}

function umInteiro(v: ValorDaQuery): number | null {
    const texto = umaString(v)
    if (texto === null) return null
    const n = Number(texto)
    return Number.isInteger(n) && n >= 0 ? n : null
}

const DIA = /^\d{4}-\d{2}-\d{2}$/
function umDia(v: ValorDaQuery): DiaISO | null {
    const texto = umaString(v)
    return texto !== null && DIA.test(texto) ? texto : null
}

/**
 * Lê os filtros da query. Parâmetro ausente ou inválido vira o vazio daquele filtro — a URL
 * é editável à mão, e um valor que não casa não pode derrubar a tela.
 */
export function lerFiltrosDaQuery(query: Record<string, ValorDaQuery>): FiltrosDeCobranca {
    return {
        emAtraso: umaString(query.atraso) === '1',
        aVencer: umaString(query.a_vencer) === '1',
        atrasoDe: umInteiro(query.atraso_de),
        atrasoAte: umInteiro(query.atraso_ate),
        venceDe: umDia(query.vence_de),
        venceAte: umDia(query.vence_ate),
        situacao: umaLista(query.situacao),
        segmento: umaLista(query.segmento),
        busca: umaString(query.busca) ?? '',
    }
}

/**
 * Escreve os filtros como query. **Filtro vazio não vira parâmetro vazio, vira ausência** —
 * `?busca=` na URL não é a mesma coisa que não filtrar, e deixar o rastro de um filtro
 * desligado é `ausente-vs-falso.md` na barra de endereço.
 */
export function escreverFiltrosNaQuery(filtros: FiltrosDeCobranca): Record<string, string> {
    const q: Record<string, string> = {}
    if (filtros.emAtraso) q.atraso = '1'
    if (filtros.aVencer) q.a_vencer = '1'
    if (filtros.atrasoDe !== null) q.atraso_de = String(filtros.atrasoDe)
    if (filtros.atrasoAte !== null) q.atraso_ate = String(filtros.atrasoAte)
    if (filtros.venceDe !== null) q.vence_de = filtros.venceDe
    if (filtros.venceAte !== null) q.vence_ate = filtros.venceAte
    if (filtros.situacao.length > 0) q.situacao = filtros.situacao.join(',')
    if (filtros.segmento.length > 0) q.segmento = filtros.segmento.join(',')
    if (filtros.busca !== '') q.busca = filtros.busca
    return q
}

/** `true` quando nenhum filtro de COBRANÇA está ligado — os de cadastro não contam aqui. */
export function semFiltroDeCobranca(f: FiltrosDeCobranca): boolean {
    return (
        !f.emAtraso && !f.aVencer &&
        f.atrasoDe === null && f.atrasoAte === null &&
        f.venceDe === null && f.venceAte === null
    )
}

// ── A aplicação ─────────────────────────────────────────────────────────────────────────

/** A parcela passa nos filtros de cobrança? Estado e faixa são testados na MESMA parcela. */
function parcelaPassa(p: Parcela, f: FiltrosDeCobranca): boolean {
    // Sem interruptor, os dois estados em aberto valem. Com um, só ele. Com os dois, a união.
    const estadosAceitos: Parcela['estado'][] =
        f.emAtraso && f.aVencer ? ['VENCIDA', 'A_VENCER']
            : f.emAtraso ? ['VENCIDA']
                : f.aVencer ? ['A_VENCER']
                    : ['VENCIDA', 'A_VENCER']
    if (!estadosAceitos.includes(p.estado)) return false

    // A faixa de atraso só se aplica a quem tem atraso.
    if (f.atrasoDe !== null || f.atrasoAte !== null) {
        if (p.diasDeAtraso === null) return false
        if (f.atrasoDe !== null && p.diasDeAtraso < f.atrasoDe) return false
        if (f.atrasoAte !== null && p.diasDeAtraso > f.atrasoAte) return false
    }

    // A faixa de VENCIMENTO. Ortogonal ao estado: ela recorta a data, não classifica.
    if (f.venceDe !== null || f.venceAte !== null) {
        if (p.vencimento === null) return false
        if (f.venceDe !== null && p.vencimento < f.venceDe) return false
        if (f.venceAte !== null && p.vencimento > f.venceAte) return false
    }

    return true
}

/**
 * Filtra e ordena a lista de clientes.
 *
 * A ORDENAÇÃO COM EM ATRASO LIGADO É POR MAIOR ATRASO EM DIAS, não por valor: 120 dias
 * devendo R$ 200 é problema diferente de vencer ontem devendo R$ 20.000, e a primeira
 * coluna de decisão é o TEMPO. Sem o interruptor, a ordem é a de sempre (nome).
 */
export function aplicarFiltrosDeCobranca<T extends { id: string; name: string }>(args: {
    clientes: readonly T[]
    porCliente: Record<string, AgregadoDoCliente>
    parcelas: readonly Parcela[]
    filtros: FiltrosDeCobranca
}): T[] {
    const { clientes, porCliente, parcelas, filtros } = args

    let resultado = [...clientes]

    if (!semFiltroDeCobranca(filtros)) {
        const comParcelaQuePassa = new Set<string>()
        for (const p of parcelas) {
            if (p.customerId === null) continue
            if (parcelaPassa(p, filtros)) comParcelaQuePassa.add(p.customerId)
        }
        resultado = resultado.filter((c) => comParcelaQuePassa.has(c.id))
    }

    if (filtros.emAtraso) {
        resultado.sort((a, b) => {
            const da = porCliente[a.id]?.maiorAtrasoDias ?? -1
            const db = porCliente[b.id]?.maiorAtrasoDias ?? -1
            if (da !== db) return db - da
            return a.name.localeCompare(b.name)
        })
    }

    return resultado
}
