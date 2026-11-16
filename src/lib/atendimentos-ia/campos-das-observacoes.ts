/**
 * OS CAMPOS DAS OBSERVAÇÕES DO ORÇAMENTO (dono do produto, 16/11/2026): "a gente pode criar uma seção de observação
 * com as variáveis [...] como referência é o que consta nesse arquivo".
 *
 * A REFERÊNCIA é o bloco OBSERVAÇÕES do orçamento 1154 da De Paula (WVetro), extraído do PDF que ele subiu, LITERAL:
 *
 *     Prazos de entrega após a medição final (salvo alterações em período de férias coletivas).
 *     PVC:
 *     • BRANCO: 45 DIAS
 *     • LAMINADO TOTAL: 60 DIAS
 *     • LAMINADO SOMENTE EXTERNO: 75 DIAS
 *     ALUMÍNIO
 *     • CORES PADRÕES: 45 DIAS
 *     • CORES ESPECIAIS: 90 DIAS
 *     PROPOSTA VÁLIDA POR 7 DIAS A PARTIR DA EMISSÃO DA PRESENTE DATA.
 *     NÃO CONTEMPLA REMOÇÃO E DESCARTE DE ESQUADRIA EXISTENTE.
 *     NÃO INCLUSO NO ORÇAMENTO LOCAÇÃO DE PLATAFORMAS E GUINDASTES PARA INSTALAÇÃO DE VIDROS ESPECIAIS E PAINÉIS.
 *     Forma de Pagamento:
 *     50% de Entrada - R$ 14.962,63
 *     50% na Entrega - R$ 14.962,62
 *     Total: R$ 29.925,25
 *
 * Campo a campo, é isto — e nada além disto foi inventado:
 *   - a ABERTURA dos prazos: uma frase da empresa;
 *   - os PRAZOS: uma linha por (grupo, acabamento, dias) — o grupo é o cabeçalho ("PVC", "ALUMÍNIO");
 *   - a VALIDADE: um NÚMERO de dias, e a frase é montada com ele;
 *   - as EXCLUSÕES: uma linha cada;
 *   - a FORMA DE PAGAMENTO: as parcelas em PERCENTUAL, com o rótulo ("Entrada", "na Entrega"). **Os valores em reais
 *     NÃO são digitados: saem do total do orçamento**, e fecham ao centavo — a última parcela leva o resto, como o
 *     rateio da operação interna (`rateio-do-orcamento.ts`). Digitar valor seria o número velho num orçamento novo.
 *
 * Módulo PURO: não lê banco, não formata página. Quem grava é `superadmin_gravar_campos_das_observacoes`; quem imprime
 * é o arquivo do orçamento, que recebe as LINHAS prontas daqui.
 */

export type PrazoDeEntrega = { grupo: string; acabamento: string; dias: number }
export type ParcelaDoPagamento = { percentual: number; rotulo: string }
export type CamposDasObservacoes = {
    /** A frase que abre os prazos ("Prazos de entrega após a medição final…"); nula = sem abertura. */
    prazosAbertura: string | null
    prazos: PrazoDeEntrega[]
    /** Os dias de validade da proposta; nulo = a linha da validade não sai. */
    validadeDias: number | null
    exclusoes: string[]
    pagamento: ParcelaDoPagamento[]
}

export const SEM_CAMPOS: CamposDasObservacoes = { prazosAbertura: null, prazos: [], validadeDias: null, exclusoes: [], pagamento: [] }

export const LIMITE_DA_LINHA = 200
export const LIMITE_DE_PRAZOS = 30
export const LIMITE_DE_EXCLUSOES = 20
export const LIMITE_DE_PARCELAS = 12
export const LIMITE_DOS_DIAS = 3650

export const fraseDaValidade = (dias: number) =>
    `PROPOSTA VÁLIDA POR ${dias} ${dias === 1 ? 'DIA' : 'DIAS'} A PARTIR DA EMISSÃO DA PRESENTE DATA.`
export const ROTULO_DO_PAGAMENTO = 'Forma de Pagamento:'
export const ROTULO_DO_TOTAL = 'Total:'
export const fraseDoPagamentoQueNaoFecha = (soma: number) =>
    `as parcelas do pagamento somam ${soma}%, e têm de somar 100%`

/** Em reais, como o arquivo do orçamento escreve (duas casas, ponto de milhar). */
const emReais = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * OS VALORES DAS PARCELAS, em centavos, fechando EXATAMENTE no total: cada uma é o percentual arredondado ao centavo,
 * e a ÚLTIMA leva o que sobrou. É a mesma disciplina do rateio — a soma das partes é o todo, nunca "quase".
 */
export function valoresDasParcelas(totalEmCentavos: number, parcelas: readonly ParcelaDoPagamento[]): number[] {
    if (parcelas.length === 0) return []
    const valores = parcelas.map((p) => Math.round((totalEmCentavos * p.percentual) / 100))
    const soma = valores.slice(0, -1).reduce((s, v) => s + v, 0)
    valores[valores.length - 1] = totalEmCentavos - soma
    return valores
}

/**
 * AS LINHAS DO BLOCO, na ordem da referência. `total` é o valor de venda do orçamento, em REAIS; `textoLivre` é o que
 * a empresa escreve à mão (o campo de 16/11/2026), e vai POR ÚLTIMO. Sem campo nenhum e sem texto, nenhuma linha — e
 * o bloco sai com o rótulo e o corpo vazio, como antes.
 *
 * Os prazos saem TODOS, agrupados, como no modelo: a folha não escolhe por cor — quem lê é o cliente, e o modelo
 * mostra a tabela inteira.
 */
export function linhasDasObservacoes(c: CamposDasObservacoes, a: { total: number; textoLivre: string | null }): string[] {
    const linhas: string[] = []

    const abertura = (c.prazosAbertura ?? '').trim()
    if (abertura !== '') linhas.push(abertura)
    let grupoAberto: string | null = null
    for (const p of c.prazos) {
        const grupo = p.grupo.trim()
        if (grupo !== '' && grupo !== grupoAberto) { linhas.push(`${grupo}:`); grupoAberto = grupo }
        linhas.push(`• ${p.acabamento.trim()}: ${p.dias} ${p.dias === 1 ? 'DIA' : 'DIAS'}`)
    }

    if (c.validadeDias !== null) linhas.push(fraseDaValidade(c.validadeDias))
    for (const e of c.exclusoes) { const t = e.trim(); if (t !== '') linhas.push(t) }

    if (c.pagamento.length > 0) {
        linhas.push(ROTULO_DO_PAGAMENTO)
        // o total em centavos: é dele que as parcelas saem, e é a ele que elas voltam a somar
        const emCentavos = Math.round(total100(a.total))
        const valores = valoresDasParcelas(emCentavos, c.pagamento)
        c.pagamento.forEach((p, k) => linhas.push(`${p.percentual}% ${p.rotulo.trim()} - ${emReais(valores[k] / 100)}`))
        linhas.push(`${ROTULO_DO_TOTAL} ${emReais(emCentavos / 100)}`)
    }

    const livre = (a.textoLivre ?? '').trim()
    if (livre !== '') linhas.push(...livre.split('\n').map((l) => l.trimEnd()))
    return linhas
}

/** Os reais do orçamento em centavos, sem o erro de ponto flutuante do `* 100`. */
const total100 = (reais: number) => Number((reais * 100).toFixed(0))

// ── O QUE ENTRA (a guarda que o usuário lê antes de salvar; a do banco é a que não deixa passar por outro caminho) ──
export type ErroDoCampo = { campo: string; mensagem: string }

const textoDaLinha = (v: unknown, campo: string, erros: ErroDoCampo[]): string | null => {
    if (typeof v !== 'string') { erros.push({ campo, mensagem: 'tem de ser texto' }); return null }
    const t = v.trim()
    if (t === '') { erros.push({ campo, mensagem: 'não pode ser vazio' }); return null }
    if (t.length > LIMITE_DA_LINHA) { erros.push({ campo, mensagem: `tem ${t.length} caracteres, acima do limite de ${LIMITE_DA_LINHA}` }); return null }
    return t
}
const inteiroPositivo = (v: unknown, campo: string, limite: number, erros: ErroDoCampo[]): number | null => {
    if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0 || v > limite) {
        erros.push({ campo, mensagem: `tem de ser um número inteiro de 1 a ${limite}` })
        return null
    }
    return v
}

/** Lê o corpo gravável dos campos; a lista ausente é a lista VAZIA, e o campo com lixo é recusa nomeada. */
export function lerCamposDasObservacoes(corpo: unknown): { campos: CamposDasObservacoes; erros: ErroDoCampo[] } {
    const erros: ErroDoCampo[] = []
    const c = (corpo ?? {}) as Record<string, unknown>
    const lista = (v: unknown, campo: string, limite: number): unknown[] => {
        if (v === undefined || v === null) return []
        if (!Array.isArray(v)) { erros.push({ campo, mensagem: 'tem de ser uma lista' }); return [] }
        if (v.length > limite) { erros.push({ campo, mensagem: `tem ${v.length} linhas, acima do limite de ${limite}` }); return [] }
        return v
    }

    let prazosAbertura: string | null = null
    if (c.prazosAbertura !== undefined && c.prazosAbertura !== null && c.prazosAbertura !== '') {
        prazosAbertura = textoDaLinha(c.prazosAbertura, 'prazosAbertura', erros)
    }

    const prazos: PrazoDeEntrega[] = []
    lista(c.prazos, 'prazos', LIMITE_DE_PRAZOS).forEach((p, i) => {
        const o = (p ?? {}) as Record<string, unknown>
        const grupo = o.grupo === undefined || o.grupo === null || o.grupo === '' ? '' : textoDaLinha(o.grupo, `prazos[${i}].grupo`, erros) ?? ''
        const acabamento = textoDaLinha(o.acabamento, `prazos[${i}].acabamento`, erros)
        const dias = inteiroPositivo(o.dias, `prazos[${i}].dias`, LIMITE_DOS_DIAS, erros)
        if (acabamento !== null && dias !== null) prazos.push({ grupo, acabamento, dias })
    })

    let validadeDias: number | null = null
    if (c.validadeDias !== undefined && c.validadeDias !== null) validadeDias = inteiroPositivo(c.validadeDias, 'validadeDias', LIMITE_DOS_DIAS, erros)

    const exclusoes: string[] = []
    lista(c.exclusoes, 'exclusoes', LIMITE_DE_EXCLUSOES).forEach((e, i) => {
        const t = textoDaLinha(e, `exclusoes[${i}]`, erros)
        if (t !== null) exclusoes.push(t)
    })

    const pagamento: ParcelaDoPagamento[] = []
    lista(c.pagamento, 'pagamento', LIMITE_DE_PARCELAS).forEach((p, i) => {
        const o = (p ?? {}) as Record<string, unknown>
        const percentual = typeof o.percentual === 'number' && Number.isFinite(o.percentual) && o.percentual > 0 && o.percentual <= 100
            ? o.percentual
            : (erros.push({ campo: `pagamento[${i}].percentual`, mensagem: 'tem de ser um percentual maior que 0 e até 100' }), null)
        const rotulo = textoDaLinha(o.rotulo, `pagamento[${i}].rotulo`, erros)
        if (percentual !== null && rotulo !== null) pagamento.push({ percentual, rotulo })
    })
    // as parcelas têm de somar 100%: um pagamento que não fecha imprimiria um total que não é o do orçamento
    if (pagamento.length > 0 && erros.length === 0) {
        const soma = Number(pagamento.reduce((s, p) => s + p.percentual, 0).toFixed(6))
        if (soma !== 100) erros.push({ campo: 'pagamento', mensagem: fraseDoPagamentoQueNaoFecha(soma) })
    }

    return { campos: { prazosAbertura, prazos, validadeDias, exclusoes, pagamento }, erros }
}
