/**
 * A PRECIFICAÇÃO FINAL DO ORÇAMENTO I.A. — o modo "orçamento" da tela de Produtos (o 1b, decisão 2 do dono do produto, 09/11/2026):
 * "um modo 'orçamento' no componente, sem segunda cópia da precificação". O cálculo é o MESMO de Produtos (`doProductCalc` →
 * `calculatePricing`, e o `ProductPrice` intocado); este módulo só decide DE ONDE vem a entrada, e o que falta para o preço sair.
 *
 * Puro e sem banco: a tela e a rota leem as MESMAS regras (`copia-divergente.md`).
 *
 *   - A ENTRADA DO MOTOR (`entradaDoMotor`) é o único ponto em que os dois modos divergem no cálculo. No modo "produto" ela devolve o que a
 *     tela de Produtos sempre usou (a soma dos itens e os minutos digitados); no modo "orçamento", a forma da D2: o LÍQUIDO DOS MATERIAIS e os
 *     MINUTOS somados dos itens calculados — nunca a fabricação no custo (ela entra pelos minutos, ou entraria duas vezes).
 *   - A RECONCILIAÇÃO DA D2 NA TELA (`reconciliacaoNaTela`): o custo do produto que o motor da tela formou tem de ser a soma das linhas do
 *     orçamento (líquido + fabricação), ao centavo. Diferente é FALTA, e o preço não se grava: a configuração de mão de obra mudou depois do
 *     cálculo, ou o cálculo e a tela leram outra coisa — número que não fecha não vira preço.
 *   - O ESTADO DO CÁLCULO (`estadoDoCalculo`): "cálculo incompleto — recalcule" quando algum item aponta um cálculo e o orçamento está sem os
 *     totais (o passo zero de `calcularOrcamento` os anulou e a escrita parou no meio), ou quando parte dos itens não tem cálculo.
 *   - AS FALTAS (`faltasDaPrecificacao`): SEM NCM a precificação RECUSA nomeando a falta — nunca zera o PIS/COFINS (decisão 1). O NCM é a
 *     FOLHA de oito dígitos (`0000.00.00`), a forma da CHECK `orcamentista_orcamento_ncm_forma`: um nível da hierarquia não resolve alíquota.
 *     A venda INTERESTADUAL exige a UF de destino, e a INTRAESTADUAL a recusa (a CHECK `orcamentista_orcamento_uf_destino_do_escopo`).
 */

/** O item do orçamento como a precificação o lê: os valores que `calcularOrcamento` gravou (nulos antes do cálculo). */
export type ItemNaPrecificacao = {
    id: string
    ordem: number
    tipologia: string | null
    largura_mm: number | null
    altura_mm: number | null
    quantidade: number
    calculo_id: string | null
    calculado_em: string | null
    atualizado_em: string | null
    custo_bruto_materiais: number | null
    custo_liquido_materiais: number | null
    tempo_fabricacao_min: number | null
    valor_minuto: number | null
    custo_fabricacao: number | null
    custo_liquido_total: number | null
}
export type EscopoDaVenda = 'INTRAESTADUAL' | 'INTERESTADUAL'
export type TipoDeComprador = 'CONSUMIDOR_FINAL' | 'CONTRIBUINTE_PJ'
export type OrcamentoNaPrecificacao = {
    id: string
    numero: number
    nome: string
    comissao_percentual: number | null
    reserva_tecnica_percentual: number | null
    lucro_projetado_percentual: number | null
    valor_total_bruto: number | null
    valor_total_liquido: number | null
    valor_venda: number | null
    /** a operação interna gravada com a venda (20261110000001); nula enquanto não há preço */
    valor_operacao_interna: number | null
    ncm_code: string | null
    sale_scope: EscopoDaVenda | null
    buyer_type: TipoDeComprador | null
    uf_destino: string | null
    itens: ItemNaPrecificacao[]
}

/** O cabeçalho fixo do orçamento na tela (decisão 1): só leitura, e nunca gravado em `products`. */
export const CABECALHO_FIXO = { tipo: 'Produzido', unidade: 'UN', secao: 'Orçamentos I.A.' } as const

export const FRASE_CALCULO_INCOMPLETO = 'Cálculo incompleto — recalcule.'
export const FRASE_SEM_CALCULO = 'O orçamento ainda não foi calculado: calcule antes de precificar.'
export const FRASE_CALCULO_DESATUALIZADO = 'Itens alterados depois do cálculo — recalcule.'
export const FALTA_DO_NCM = 'o NCM do orçamento: sem ele o PIS/COFINS não sai, e a precificação não o zera'
export const faltaDoNcmFora = (ncm: string) => `o NCM inteiro, de oito dígitos (0000.00.00): "${ncm}" é um nível da hierarquia e não resolve alíquota`
export const faltaDaAliquotaDoNcm = (ncm: string) => `a alíquota de PIS/COFINS do NCM ${ncm}: a tabela de NCM não a trouxe`
export const FALTA_DO_ESCOPO = 'o escopo da venda (dentro ou fora do estado)'
export const FALTA_DO_COMPRADOR = 'o tipo de comprador'
export const FALTA_DA_UF = 'a UF de destino: a venda é interestadual'
export const SOBRA_DA_UF = 'a UF de destino só existe na venda interestadual: tire a UF ou mude o escopo'
export const faltaDaReconciliacao = (somaDasLinhas: number, custoDoMotor: number) =>
    `o custo do produto (R$ ${custoDoMotor.toFixed(2)}) igual à soma das linhas do orçamento (R$ ${somaDasLinhas.toFixed(2)}): ` +
    'a mão de obra ou o material mudou depois do cálculo — recalcule'

/** A forma da folha do NCM, a mesma da CHECK `orcamentista_orcamento_ncm_forma` (a da tabela `ncm_codes`). */
export const FORMA_DO_NCM = /^[0-9]{4}\.[0-9]{2}\.[0-9]{2}$/
/** A UF como `brazilian_states.code` a guarda: duas letras maiúsculas. Quem confere que existe é a FK. */
export const FORMA_DA_UF = /^[A-Z]{2}$/

export type EstadoDoCalculo = 'sem_itens' | 'sem_calculo' | 'incompleto' | 'desatualizado' | 'completo'

/**
 * O estado do cálculo gravado. "Incompleto" é o caso que o passo zero produz quando a escrita para no meio: itens apontando um cálculo e o
 * orçamento sem os totais — ou parte dos itens calculada e parte não. "Desatualizado": um item foi alterado à mão depois do cálculo.
 */
export function estadoDoCalculo(orc: Pick<OrcamentoNaPrecificacao, 'valor_total_bruto' | 'valor_total_liquido' | 'itens'>): EstadoDoCalculo {
    if (orc.itens.length === 0) return 'sem_itens'
    const calculados = orc.itens.filter((i) => i.calculo_id !== null)
    const semTotais = orc.valor_total_bruto === null || orc.valor_total_liquido === null
    if (calculados.length === 0) return 'sem_calculo'
    if (semTotais || calculados.length < orc.itens.length) return 'incompleto'
    if (orc.itens.some((i) => i.custo_liquido_materiais === null || i.tempo_fabricacao_min === null || i.custo_liquido_total === null)) return 'incompleto'
    if (orc.itens.some((i) => i.calculado_em !== null && i.atualizado_em !== null && Date.parse(i.atualizado_em) > Date.parse(i.calculado_em))) return 'desatualizado'
    return 'completo'
}
export const FRASE_DO_ESTADO: Record<Exclude<EstadoDoCalculo, 'completo'>, string> = {
    sem_itens: 'O orçamento não tem nenhum item.',
    sem_calculo: FRASE_SEM_CALCULO,
    incompleto: FRASE_CALCULO_INCOMPLETO,
    desatualizado: FRASE_CALCULO_DESATUALIZADO,
}

/** O modo da tela. Sem orçamento é o modo "produto" — o de sempre, e o default. */
export type ModoDaPrecificacao = { tipo: 'produto' } | { tipo: 'orcamento'; itens: readonly ItemNaPrecificacao[] }
export const MODO_PRODUTO: ModoDaPrecificacao = { tipo: 'produto' }

/**
 * A ENTRADA DO MOTOR. No modo "produto", o que a tela de Produtos sempre passou ao `calculatePricing` (a soma dos itens e os minutos
 * digitados). No modo "orçamento", a forma da D2 (`entradaDaPrecificacao` do 1a): Σ líquido dos materiais e Σ minutos dos itens.
 */
export function entradaDoMotor(
    modo: ModoDaPrecificacao,
    produto: { itemsPriceSum: number; workloadMinutes: number },
): { totalItemsCost: number; productWorkloadMinutes: number } {
    if (modo.tipo === 'orcamento') {
        return {
            totalItemsCost: modo.itens.reduce((t, i) => t + (i.custo_liquido_materiais ?? 0), 0),
            productWorkloadMinutes: modo.itens.reduce((t, i) => t + (i.tempo_fabricacao_min ?? 0), 0),
        }
    }
    return { totalItemsCost: produto.itemsPriceSum, productWorkloadMinutes: produto.workloadMinutes }
}

/** A soma das linhas do orçamento como a borda direita as mostra: o líquido dos materiais mais a fabricação. */
export const somaDasLinhas = (itens: readonly ItemNaPrecificacao[]) =>
    itens.reduce((t, i) => t + (i.custo_liquido_materiais ?? 0) + (i.custo_fabricacao ?? 0), 0)

/**
 * A RECONCILIAÇÃO DA D2, sobre o número que a TELA formou: o custo do produto do motor (`productCost`, o CMV) contra a soma das linhas. O
 * motor arredonda o custo dos itens e a mão de obra ao centavo (`pricing-engine.ts`, passos 1 e 2); as linhas, não: a diferença cabe num
 * centavo — o mesmo limite do teste da D2 no servidor.
 */
export function reconciliacaoNaTela(itens: readonly ItemNaPrecificacao[], custoDoMotor: number) {
    const soma = somaDasLinhas(itens)
    const diferenca = custoDoMotor - soma
    return { fecha: Math.abs(diferenca) <= 0.01, somaDasLinhas: soma, custoDoMotor, diferenca }
}

export type FiscalDaTela = {
    ncm_code: string | null
    sale_scope: EscopoDaVenda | null
    buyer_type: TipoDeComprador | null
    uf_destino: string | null
}

/** As faltas do bloco fiscal, cada uma nomeada. A tela e a rota recusam pelas mesmas. */
export function faltasDoFiscal(f: FiscalDaTela): string[] {
    const faltas: string[] = []
    const ncm = f.ncm_code?.trim() ?? ''
    if (ncm === '') faltas.push(FALTA_DO_NCM)
    else if (!FORMA_DO_NCM.test(ncm)) faltas.push(faltaDoNcmFora(ncm))
    if (f.sale_scope === null) faltas.push(FALTA_DO_ESCOPO)
    if (f.buyer_type === null) faltas.push(FALTA_DO_COMPRADOR)
    const uf = f.uf_destino?.trim() ?? ''
    if (f.sale_scope === 'INTERESTADUAL' && uf === '') faltas.push(FALTA_DA_UF)
    if (f.sale_scope !== 'INTERESTADUAL' && uf !== '') faltas.push(SOBRA_DA_UF)
    return faltas
}

/**
 * TODAS as faltas da precificação do orçamento, na ordem em que o vendedor as resolve: o cálculo, o fiscal, a alíquota do NCM e a
 * reconciliação. Vazia = o preço pode ser gravado.
 */
export function faltasDaPrecificacao(args: {
    orcamento: OrcamentoNaPrecificacao
    fiscal: FiscalDaTela
    /** `null`: o regime não apura PIS/COFINS pelo NCM; `true`/`false`: a tabela trouxe a alíquota do NCM ou não. */
    aliquotaDoNcm: boolean | null
    custoDoMotor: number
}): string[] {
    const faltas: string[] = []
    const estado = estadoDoCalculo(args.orcamento)
    if (estado !== 'completo') faltas.push(FRASE_DO_ESTADO[estado])
    faltas.push(...faltasDoFiscal(args.fiscal))
    const ncm = args.fiscal.ncm_code?.trim() ?? ''
    if (args.aliquotaDoNcm === false && FORMA_DO_NCM.test(ncm)) faltas.push(faltaDaAliquotaDoNcm(ncm))
    if (estado === 'completo') {
        const r = reconciliacaoNaTela(args.orcamento.itens, args.custoDoMotor)
        if (!r.fecha) faltas.push(faltaDaReconciliacao(r.somaDasLinhas, r.custoDoMotor))
    }
    return faltas
}

/** O rótulo de cada esquadria na lista de itens da tela. */
export const rotuloDoItem = (i: Pick<ItemNaPrecificacao, 'ordem' | 'tipologia' | 'largura_mm' | 'altura_mm'>) =>
    `Esquadria ${i.ordem}${i.tipologia ? ` — ${i.tipologia}` : ''}${i.largura_mm && i.altura_mm ? ` ${i.largura_mm} x ${i.altura_mm} mm` : ''}`

/** O que a tela grava no orçamento ao salvar a precificação — e nada em `products`. */
export type GravacaoDaPrecificacao = FiscalDaTela & {
    valor_venda: number
    /** A "Total Operação Interna" que a tela mostrou, em CENTAVOS exatos (20261110000001): é ela que o arquivo reparte pelos itens. */
    valor_operacao_interna: number
    comissao_percentual: number
    reserva_tecnica_percentual: number
    lucro_projetado_percentual: number
}

// ── A OPERAÇÃO INTERNA (20261110000001, dono do produto, 10/11/2026) ─────────────────────────────────────────────────────────────
const emCentavos = (v: number) => Math.round(v * 100)
const reaisBR = (c: number) => `R$ ${(c / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const faltaDaInternaDivergente = (interna: number, precificado: number) =>
    `a operação interna (${reaisBR(emCentavos(interna))}) diverge do valor do produto precificado (${reaisBR(emCentavos(precificado))}) em mais de um centavo: `
    + 'a matriz não governou o preço, e nenhum dos dois serve para o arquivo — confira os acréscimos da precificação'
export const FALTA_DA_INTERNA = 'a operação interna: a precificação não a formou'

/**
 * A interna que se GRAVA: a "Total Operação Interna" da tela, arredondada ao centavo (a CHECK `operacao_interna_ao_centavo`). Ela e o "Valor do
 * produto precificado" são o mesmo número quando a matriz governa o preço; divergindo em MAIS DE UM CENTAVO, o salvar RECUSA nomeando (decisão do
 * dono do produto, 10/11/2026: "nenhum dos dois serve"). Um centavo é a tolerância do arredondamento dos dois lados.
 */
export function internaParaGravar(operacaoInterna: number, valorPrecificado: number): { interna: number } | { falta: string } {
    const i = emCentavos(operacaoInterna)
    if (!Number.isFinite(operacaoInterna) || i <= 0) return { falta: FALTA_DA_INTERNA }
    if (Math.abs(emCentavos(valorPrecificado) - i) > 1) return { falta: faltaDaInternaDivergente(operacaoInterna, valorPrecificado) }
    return { interna: i / 100 }
}
