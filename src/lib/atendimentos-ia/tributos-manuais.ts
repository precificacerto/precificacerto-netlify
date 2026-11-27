/**
 * TRIBUTOS EDITADOS A MÃO no orçamento (pedido 0044, dono do produto, 27/11/2026).
 *
 * A decisão de 11/11/2026 FICA: ICMS, PIS/Cofins, IBS e CBS vêm das credenciais da empresa como valor SUGERIDO. O que muda é que o
 * usuário pode editar qualquer tributo (ICMS, PIS/Cofins, CBS, IBS, IS, IPI e o fator de redução); o editado fica marcado "manual",
 * volta ao valor das credenciais por um botão e entra no snapshot do orçamento, do pedido e da venda.
 *
 * Forma gravada (`orcamentista_orcamento.tributos_manuais`, migração 20261127000001): objeto cuja CHAVE PRESENTE é o tributo manual;
 * a ausente usa a credencial. Cada valor é `{ pct }` com `pct` de 0 a 100. NULO = nada editado: o cálculo é o de antes, centavo a centavo.
 *
 * Módulo puro: sem banco, sem tela. A fonte do valor sugerido é de quem chama; aqui só se decide QUAL valor vale e como ele é marcado.
 */

export const TRIBUTOS_MANUAIS_CHAVES = ['icms', 'pis_cofins', 'cbs', 'ibs', 'is', 'ipi', 'reducao_ibs', 'reducao_cbs'] as const
export type ChaveDoTributoManual = (typeof TRIBUTOS_MANUAIS_CHAVES)[number]

export type TributosManuais = Partial<Record<ChaveDoTributoManual, { pct: number }>>

export const FRASE_SEM_COLUNA_DOS_TRIBUTOS_MANUAIS =
    'Tributos manuais indisponíveis: a estrutura do banco (migração 20261127000001) não foi aplicada. O cálculo segue com os tributos das credenciais da empresa.'

export const ROTULO_DO_TRIBUTO_MANUAL: Record<ChaveDoTributoManual, string> = {
    icms: 'ICMS',
    pis_cofins: 'PIS/Cofins',
    cbs: 'CBS',
    ibs: 'IBS',
    is: 'IS',
    ipi: 'IPI',
    reducao_ibs: 'Fator de redução do IBS',
    reducao_cbs: 'Fator de redução da CBS',
}

const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Número finito de 0 a 100; o texto numérico (com vírgula) é aceito. Fora disso, nulo — nunca zero. */
function percentualValido(v: unknown): number | null {
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v.trim().replace(',', '.')) : NaN
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null
}

export type TributosManuaisValidados = { tributos: TributosManuais | null } | { erros: string[] }

/**
 * Valida o que a tela mandou. `undefined` = a tela não falou nos tributos manuais (a gravação não os toca); `null` ou `{}` = nada editado
 * (grava NULO). Chave desconhecida, valor sem `pct` ou `pct` fora de 0..100 recusam NOMEANDO o tributo — nada é corrigido em silêncio.
 */
export function validarTributosManuais(bruto: unknown): { tocado: false } | ({ tocado: true } & TributosManuaisValidados) {
    if (bruto === undefined) return { tocado: false }
    if (bruto === null) return { tocado: true, tributos: null }
    if (!ehObjeto(bruto)) return { tocado: true, erros: ['Tributos manuais: tem de ser um objeto com um item por tributo editado.'] }
    const erros: string[] = []
    const saida: TributosManuais = {}
    for (const [chave, valor] of Object.entries(bruto)) {
        if (!(TRIBUTOS_MANUAIS_CHAVES as readonly string[]).includes(chave)) {
            erros.push(`Tributos manuais: "${chave}" não é um tributo editável (${TRIBUTOS_MANUAIS_CHAVES.join(', ')}).`)
            continue
        }
        const k = chave as ChaveDoTributoManual
        const pct = ehObjeto(valor) ? percentualValido(valor.pct) : null
        if (pct === null) erros.push(`${ROTULO_DO_TRIBUTO_MANUAL[k]}: tem de ser um percentual de 0 a 100.`)
        else saida[k] = { pct }
    }
    if (erros.length) return { tocado: true, erros }
    return { tocado: true, tributos: Object.keys(saida).length ? saida : null }
}

/** A leitura do banco: a coluna ausente ou malformada é "nada editado" (nunca derruba o cálculo); o valor ruim de uma chave é descartado. */
export function lerTributosManuais(bruto: unknown): TributosManuais | null {
    if (!ehObjeto(bruto)) return null
    const saida: TributosManuais = {}
    for (const k of TRIBUTOS_MANUAIS_CHAVES) {
        const v = bruto[k]
        const pct = ehObjeto(v) ? percentualValido(v.pct) : null
        if (pct !== null) saida[k] = { pct }
    }
    return Object.keys(saida).length ? saida : null
}

export type OrigemDoTributo = 'credenciais' | 'manual'
export type TributoResolvido = { pct: number | null; origem: OrigemDoTributo; sugerido: number | null }

/**
 * O valor que VALE para um tributo: o manual, se há; senão o sugerido (credenciais). `sugerido` acompanha sempre, para a tela mostrar o
 * botão "voltar ao valor das credenciais" e dizer qual é. Sem manual e sem sugerido, `pct` é NULO (ausente não é zero).
 */
export function resolverTributo(chave: ChaveDoTributoManual, sugerido: number | null | undefined, manuais: TributosManuais | null | undefined): TributoResolvido {
    const sug = sugerido === undefined || sugerido === null || !Number.isFinite(sugerido) ? null : sugerido
    const m = manuais?.[chave]
    if (m) return { pct: m.pct, origem: 'manual', sugerido: sug }
    return { pct: sug, origem: 'credenciais', sugerido: sug }
}

/** Troca um tributo à mão. Devolve o objeto novo (nunca altera o recebido); vazio vira nulo. */
export function editarTributo(atuais: TributosManuais | null | undefined, chave: ChaveDoTributoManual, pct: number): TributosManuais | null {
    const v = percentualValido(pct)
    if (v === null) throw new Error(`${ROTULO_DO_TRIBUTO_MANUAL[chave]}: tem de ser um percentual de 0 a 100.`)
    return { ...(atuais ?? {}), [chave]: { pct: v } }
}

/** O botão "voltar ao valor das credenciais": tira a chave. Sem sobra, nulo. */
export function voltarAoValorDasCredenciais(atuais: TributosManuais | null | undefined, chave: ChaveDoTributoManual): TributosManuais | null {
    if (!atuais) return null
    const { [chave]: _fora, ...resto } = atuais // eslint-disable-line @typescript-eslint/no-unused-vars
    return Object.keys(resto).length ? (resto as TributosManuais) : null
}

/**
 * Alíquota EFETIVA de IBS/CBS: nominal × (1 − redução). Com a redução ausente, a efetiva é a nominal. O PIS/Cofins efetivo é o nominal
 * × (1 − fração do ICMS na base), computado por quem chama (a base exclui o ICMS); aqui só a conta do fator.
 */
export function aliquotaEfetiva(nominalPct: number | null, reducaoPct: number | null | undefined): number | null {
    if (nominalPct === null || !Number.isFinite(nominalPct)) return null
    const r = reducaoPct === null || reducaoPct === undefined || !Number.isFinite(reducaoPct) ? 0 : reducaoPct
    return nominalPct * (1 - r / 100)
}

/** O que entra no snapshot (orçamento, pedido, venda): só o que foi editado, marcado como manual. Sem edição, nada — o snapshot é o de antes. */
export function snapshotDosTributosManuais(manuais: TributosManuais | null | undefined): Array<{ tributo: ChaveDoTributoManual; pct: number; origem: 'manual' }> {
    if (!manuais) return []
    return TRIBUTOS_MANUAIS_CHAVES.filter((k) => manuais[k]).map((k) => ({ tributo: k, pct: (manuais[k] as { pct: number }).pct, origem: 'manual' as const }))
}
