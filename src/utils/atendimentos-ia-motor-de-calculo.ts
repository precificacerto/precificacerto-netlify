/**
 * Atendimentos I.A. — o MOTOR DE CÁLCULO de uma tipologia: das regras do motor do fornecedor, dos
 * itens de preço e das fórmulas da família, às linhas por código com cortes, peças, barras, pesos
 * e valor bruto.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * REGRA INVIOLÁVEL: a tela mostra apenas o nome da conta e a configuração do Atendimentos I.A.
 * Nada do conteúdo da conta — nem clientes, nem orçamentos, nem funcionários, nem valores. O
 * super admin não tem tenant e não pode enxergar dado de cliente por construção.
 * ══════════════════════════════════════════════════════════════════════════════════════════
 *
 * FUNÇÃO PURA: não lê banco nem tela. O chamador busca as regras, os itens e as fórmulas e os
 * entrega como vieram das tabelas; o motor não sabe o que é Supabase. As fórmulas passam pelo
 * avaliador restrito de `atendimentos-ia-motor-formula.ts` — nada de `eval`.
 *
 * O que cada coluna é foi medido pela sessão de verificação nos arquivos reais da Wolff
 * (20/10/2026) e decidido pelo dono do produto no mesmo dia.
 *
 * ══ A MEDIDA SAI DA COLUNA 11, COM AS OPÇÕES PADRÃO — AS VARIÁVEIS DO USUÁRIO NÃO MUDAM A MEDIDA ══
 * `formula_medida` (col. 10) é a fórmula LITERAL do WVetro, simbólica ("LFOL+SPVCAL", "HFOL"), e
 * não é calculável sozinha. `formula_em_lh` (col. 11) é a MESMA fórmula já resolvida em L e H
 * ("1/2·L − 4,2", "H − 87,8") — e o Leia-me do arquivo diz que ela foi resolvida "com as opções
 * PADRÃO da tipologia exemplo". É a 11 que o motor calcula. LIMITE DESTA VERSÃO: as variáveis que
 * o usuário informar mudam a QUANTIDADE (col. 12) e decidem a CONDIÇÃO (col. 15), mas NÃO mudam a
 * medida do corte. Usá-las na medida exigiria interpretar a col. 10 junto com a família — é o
 * trabalho seguinte, não este.
 *
 * ══ A QUANTIDADE AMBÍGUA: 1.398 DE 4.055 REGRAS (34%), MEDIDO EM 20/10/2026 ══
 * A coluna 12 traz até TRÊS alternativas separadas por "|": 2.657 regras com uma, 979 com duas,
 * 419 com três — "(NF*2) | (QT*2)", "(QMA*2) | (QMA)*2 | QMA". O ARQUIVO NÃO DIZ QUAL VALE, e a
 * pergunta está com o WVetro. Decisão do dono do produto, 20/10/2026: usar a PRIMEIRA — "vamos
 * trabalhar com a quantidade número 1, que seja mais fácil para implementar isso logo e fazer
 * andar. Depois a gente faz os ajustes necessários." Mas NUNCA calada: cada corte diz quantas
 * alternativas existiam e qual foi usada, e a saída soma as regras DAQUELE cálculo com quantidade
 * ambígua. Usar a primeira sem marcar é o mesmo gesto que nos custou dois produtos na regra do
 * separador do código.
 *
 * ══ A COR FILTRA O PERFIL, E NÃO FILTRA TUDO ══
 * O motor lista o mesmo perfil em TODAS as cores, cada cor com o seu código (SF66 branco é 9681).
 * Medição da sessão de verificação na DP-02: sem filtrar a cor, o pedido dá R$ 20.563; filtrando
 * branco, R$ 893. A cor filtra a REGRA; o item de preço é achado só pelo código, que já carrega a
 * cor. Perfil filtra pela cor do perfil; REFORÇO não tem cor e não é filtrado; acessório filtra
 * pela cor do ACESSÓRIO. Regra sem cor escrita não é filtrada — não há com o que comparar.
 * A categoria que decide isso é a do MOTOR (col. 3: "Perfil PVC", "Reforço", "Acessórios"), porque
 * é a regra que está sendo aplicada; a do preço fica como informação do item.
 *
 * ══ PERFIL E INSUMO (col. 7) ══
 * "Perfil" tem medida de corte e é cobrado por barra; "Insumo" não tem medida, só peças, e é
 * cobrado por unidade. `eixo` e `corte` (col. 8 e 9) são da relação de corte e NÃO entram na conta.
 *
 * ══ O PREÇO DO ITEM VENDIDO POR UNIDADE ESTÁ NA COLUNA DO METRO — ARMADILHA ══
 * Na seção vendida por unidade, os rótulos são "VALOR UNIT" e "VALOR TOTAL", e o leitor os gravou
 * em `valor_metro_interno` e `valor_barra_interno`. O PREÇO UNITÁRIO ESTÁ EM `valor_metro_interno`,
 * apesar do nome dizer metro. E não se mediu onde estaria o unitário a 12%: com a coluna de 12%, o
 * item por unidade vai para pendentes em vez de ler uma coluna que ninguém conferiu.
 * HOJE A ARMADILHA NÃO MUDA RESULTADO — medido no banco de produção, 20/10/2026: nos 48 itens por
 * unidade da Wolff os dois valores são IGUAIS (unit = total; 8595: 1,26 e 1,26 · 9411: 2,04 e
 * 2,04). A regra continua valendo, porque o próximo arquivo pode não ser assim. E a seção TEM
 * percentual no cabeçalho ("VALOR UNIT 17%", "VALOR TOTAL 17%"): os 48 têm `aliquota_interna_pct`
 * 17, e o líquido dos acessórios sai.
 *
 * ══ 26 INSUMOS CUJO ITEM É VENDIDO POR BARRA — PENDENTES, E NÃO SÃO RAROS ══
 * Medido em 20/10/2026: 26 códigos de Insumo têm o item vendido por barra (e zero Perfil por
 * unidade). Cobrar a barra inteira por peça seria inventar preço; usar o valor da barra como
 * unitário seria uma afirmação sobre dinheiro que ninguém fez. Ficam pendentes, visíveis, e a
 * pergunta vai ao fornecedor: naquela seção, "barra" é pacote?
 *
 * ══ A BARRA INTEIRA É A CONTA SIMPLES — NÃO É PLANO DE CORTE ══
 * Por código: total de mm ÷ medida da barra, arredondado para cima. Isso NÃO considera que um
 * pedaço não se emenda, nem a sobra entre peças: o número real de barras de uma fábrica pode ser
 * MAIOR. O dono do produto decide depois se quer plano de corte de verdade (20/10/2026).
 * No modo 'consumo', o perfil é cobrado pelo proporcional: metros usados × valor do metro.
 *
 * ══ O PESO É INFERÊNCIA, NÃO MEDIÇÃO ══
 * `peso` foi lido como kg por METRO no item de barra e kg por UNIDADE no item de unidade. Isso vem
 * da convenção de catálogo de extrusão e de a conta dar ~28 kg numa janela 1,5 × 1,2 — plausível,
 * NÃO provado. A saída marca o peso como APROXIMADO até alguém conferir um perfil real com a Wolff.
 * São DOIS pesos: o CONSUMIDO (mm usados × peso — o da esquadria) e o COMPRADO (barras inteiras ×
 * medida da barra × peso — o do frete). No modo 'consumo' são iguais; na barra inteira a diferença
 * é a sucata.
 *
 * ══ O IPI É POR FORA, E A COLUNA `ipi` É FRAÇÃO ══
 * Dono do produto, 20/10/2026: o bruto é o valor da tabela, com ICMS, PIS e COFINS POR DENTRO; o
 * IPI é calculado POR FORA: IPI = bruto × `ipi`. A coluna vem como FRAÇÃO, não percentual — medido
 * nos itens reais: 0,065 · 0,0325 · 0, ou seja, 6,5% vem como 0,065. Item sem `ipi` não vira zero:
 * a linha fica sem IPI, o total também, e há aviso. Zero gravado é zero.
 *
 * ══ O LÍQUIDO: BRUTO MENOS ICMS, PIS E COFINS — TODOS SOBRE O BRUTO ══
 * Dono do produto, 20/10/2026: "O ICMS e o PIS e COFINS estão dentro do valor bruto. E esse valor
 * bruto já é o valor pós-desconto. Ou seja, o valor bruto menos ICMS menos PIS e COFINS, nós
 * encontramos o valor líquido da barra. Se tiver incidência de IPI, ele é calculado sobre o valor
 * bruto."
 *   ICMS = bruto × alíquota da operação · PIS = bruto × alíquota do PIS · COFINS = bruto × a do COFINS
 *   LÍQUIDO = bruto − ICMS − PIS − COFINS · IPI = bruto × `ipi`, POR FORA, em linha própria
 * DE ONDE VEM CADA ALÍQUOTA — e o motor não decide nenhuma:
 *   - ICMS: na coluna INTERNA de preço, de `aliquota_interna_pct` do item; na de 12%, da ENTRADA
 *     (`icmsInterestadualPct`). O motor não decide a operação: ela vem com a coluna de preço;
 *   - PIS e COFINS: SÓ DA ENTRADA, e NÃO HÁ VALOR PADRÃO no código — dependem do regime da conta, e
 *     o motor não conhece regime. Um portão proíbe as alíquotas usuais escritas nestes dois arquivos;
 *   - IPI: a fração do próprio item.
 * ══ DUAS UNIDADES NA MESMA CONTA, E É DE PROPÓSITO — NÃO UNIFORMIZE ══
 * ICMS, PIS e COFINS são PERCENTUAIS — 17 é 17%, e a conta divide por 100 —, porque é assim que
 * `aliquota_interna_pct` vem do item e é assim que a entrada os recebe. O `ipi` é FRAÇÃO — 0,065 é
 * 6,5%, e a conta multiplica direto —, porque é assim que a coluna vem do arquivo. CADA UM VEM COMO
 * VEM. "Uniformizar" um deles sem mudar a origem faz o IPI sair cem vezes maior, ou o ICMS cem vezes
 * menor — e os portões (5b) e (9) ficam vermelhos.
 * FALTANDO QUALQUER ALÍQUOTA, O LÍQUIDO NÃO SAI: a linha mostra o bruto e diz qual faltou, e o total
 * fica nulo se uma linha ficou. Líquido chutado é pior que líquido ausente.
 * O QUE SE FAZ COM O IPI vem da entrada (`tratamentoDoIpi`): somado ao custo, ou creditado. Faltando
 * essa informação, o IPI é EXIBIDO e NÃO é aplicado em nenhum dos dois lados — o `custo` fica nulo.
 *
 * ══ A FAMÍLIA DÁ O VALOR DA VARIÁVEL; O USUÁRIO VENCE ══
 * As fórmulas da família definem variáveis por LINHA (NF=4, NP=3, QMA=(NF-1) em PVC EUROPA 42). O
 * valor do usuário vence o da família; faltando os dois, a regra vai para pendentes nomeando a
 * variável. `pct_padrao` NÃO É USADO: medido, ele vem como 1 · 0,6606 · 0,4679, com "109
 * tipologias" na coluna ao lado — é uma proporção, e NÃO SE SABE O QUE ELA MEDE.
 *
 * Portão: `src/utils/__tests__/atendimentos-ia-motor-de-calculo.test.ts`.
 */
import { avaliarCondicao, avaliarNumero, falhaDe, type Avaliacao, type Resolver } from '@/utils/atendimentos-ia-motor-formula'
import {
    COLUNA_DA_CATEGORIA_DO_FORNECEDOR, normalizarLinha, type FormulaLida, type ItemLido, type RegraLida,
} from '@/utils/atendimentos-ia-importacao'

// ── A entrada ──────────────────────────────────────────────────────────────────────────────
/** Uma regra do motor, como vem de `orcamentista_motor_regra`. */
export type RegraDoMotor = Pick<RegraLida,
    typeof COLUNA_DA_CATEGORIA_DO_FORNECEDOR | 'codigo' | 'descricao' | 'cor' | 'linha' | 'tipo' | 'eixo' | 'corte'
    | 'formula_em_lh' | 'formula_qtde' | 'condicao' | 'tipologias'>

/** Um item de preço, como vem de `orcamentista_tabela_item`. */
export type ItemDoPreco = Pick<ItemLido,
    'codigo' | 'descricao' | 'medida_barra_m' | 'peso' | 'ipi' | 'aliquota_interna_pct' | 'vendido_por'
    | 'valor_metro_interno' | 'valor_barra_interno' | 'valor_metro_12' | 'valor_barra_12'>

/** Uma fórmula da família, como vem de `orcamentista_motor_formula_familia`. `pct_padrao` não entra. */
export type FormulaDaFamilia = Pick<FormulaLida, 'linha' | 'variavel' | 'formula'>

export type ModoDeCobranca = 'barra-inteira' | 'consumo'

/** Qual coluna de valor usar. O motor NÃO decide operação interna nem interestadual: vem na entrada. */
export type ColunaDePreco = 'interna' | 'doze'

/**
 * As alíquotas que o motor NÃO decide — ver o cabeçalho. Percentuais (17, não 0,17), como a
 * `aliquota_interna_pct` do item. NULL = não informado, e o líquido não sai.
 */
export interface EntradaFiscal {
    /** Só na coluna de 12%. Na interna o ICMS sai do item. */
    icmsInterestadualPct: number | null
    pisPct: number | null
    cofinsPct: number | null
    /** O que se faz com o IPI por fora. NULL = não informado: exibido, não aplicado. */
    tratamentoDoIpi: 'soma-ao-custo' | 'credita' | null
}

export interface EntradaDoMotor {
    regras: RegraDoMotor[]
    itens: ItemDoPreco[]
    formulas: FormulaDaFamilia[]
    tipologia: string
    linha: string
    /** Largura e altura da esquadria, em mm. */
    L: number
    H: number
    /** Quantidade de esquadrias. */
    quantidade: number
    corPerfil: string
    corAcessorio: string
    /** O que o usuário informou: nome → número. Vence a família. */
    variaveis: Record<string, number>
    modo: ModoDeCobranca
    colunaDePreco: ColunaDePreco
    fiscal?: EntradaFiscal
}

// ── A saída ────────────────────────────────────────────────────────────────────────────────
export const PESO_E_APROXIMADO =
    'peso aproximado: kg por metro no item de barra e kg por unidade no de unidade é INFERÊNCIA, não medição — falta conferir um perfil real com a Wolff'

export const MOTIVO_INSUMO_VENDIDO_POR_BARRA =
    'insumo cujo item é vendido por BARRA: cobrar a barra por peça seria inventar preço, e usar o valor da barra como unitário seria afirmar um preço que ninguém deu — pergunta ao fornecedor: naquela seção, "barra" é pacote?'

/** Um corte: uma regra aplicada. */
export interface Corte {
    /** mm por peça; NULL no Insumo, que não tem medida. */
    medidaMm: number | null
    pecas: number
    eixo: string | null
    corte: string | null
    formulaEmLh: string | null
    /** A coluna 12 como está escrita, com todas as alternativas. */
    formulaQtde: string
    /** Quantas alternativas a coluna 12 trazia (1 a 3). */
    alternativasDaQuantidade: number
    /** A alternativa usada — sempre a primeira (decisão de 20/10/2026). */
    quantidadeUsada: string
}

export interface LinhaDoCalculo {
    codigo: string
    descricao: string | null
    /** A categoria do MOTOR (col. 3), como veio: "Perfil PVC", "Reforço", "Acessórios". */
    categoria: string
    tipo: 'Perfil' | 'Insumo'
    cortes: Corte[]
    pecas: number
    mmTotais: number | null
    barras: number | null
    /** mm usados ÷ mm comprados. NULL no Insumo. */
    aproveitamento: number | null
    pesoConsumidoKg: number | null
    pesoCompradoKg: number | null
    valorBruto: number
    /** bruto × `ipi` do item (fração). NULL quando o item não traz `ipi`. */
    ipiPorFora: number | null
    /** bruto × alíquota. NULL quando a alíquota não veio. */
    icms: number | null
    pis: number | null
    cofins: number | null
    /** bruto − ICMS − PIS − COFINS. NULL quando falta QUALQUER alíquota — e `motivoSemLiquido` diz qual. */
    valorLiquido: number | null
    motivoSemLiquido: string | null
    /** O líquido com o IPI aplicado como a entrada mandou. NULL sem líquido, ou sem o tratamento do IPI. */
    custo: number | null
}

export interface Pendente {
    nivel: 'regra' | 'codigo'
    codigo: string
    descricao: string | null
    motivo: string
    /** A fórmula COMO ESTÁ ESCRITA, quando o motivo é uma fórmula. */
    formula: string | null
    /** A variável que faltou, quando é esse o motivo. */
    variavel?: string
}

export interface Aviso { tipo: 'peso_ausente' | 'ipi_ausente' | 'aliquota_ausente' | 'ipi_sem_tratamento' | 'categoria_divergente' | 'tipologia_sem_regras'; codigo?: string; mensagem: string }

export interface TotalDoCalculo {
    valorBruto: number
    /** NULL quando alguma linha somada não tem IPI — pela mesma razão do peso. */
    ipiPorFora: number | null
    /** NULL quando alguma linha somada não tem líquido: a regra das linhas vale para o total. */
    valorLiquido: number | null
    custo: number | null
    /** NULL quando alguma linha somada não tem peso: somar o resto diria menos do que há. */
    pesoConsumidoKg: number | null
    pesoCompradoKg: number | null
    linhas: number
}

export interface ResultadoDoMotor {
    linhas: LinhaDoCalculo[]
    totaisPorCategoria: Array<TotalDoCalculo & { categoria: string }>
    total: TotalDoCalculo
    pendentes: Pendente[]
    avisos: Aviso[]
    /** As regras DESTE cálculo cuja coluna 12 tinha mais de uma alternativa. */
    regrasComQuantidadeAmbigua: number
    pesoAproximado: typeof PESO_E_APROXIMADO
}

// ── O cálculo ──────────────────────────────────────────────────────────────────────────────
type Classe = 'perfil' | 'reforco' | 'acessorio'

/** A classe da categoria do MOTOR. Fora das três medidas → NULL, e a regra fica pendente. */
function classeDaCategoria(categoria: string | null): Classe | null {
    const c = (categoria ?? '').trim().toLowerCase()
    if (c.startsWith('perfil')) return 'perfil'
    if (c.startsWith('reforço') || c.startsWith('reforco')) return 'reforco'
    if (c.startsWith('acessório') || c.startsWith('acessorio')) return 'acessorio'
    return null
}

const mesmaCor = (a: string, b: string) => a.trim().toUpperCase() === b.trim().toUpperCase()
const semRuido = (x: number) => Number(x.toFixed(9))

/** As variáveis: L e H da entrada; o usuário; a família da linha. Faltando, a falta sobe com o nome. */
function resolverDasVariaveis(e: EntradaDoMotor, linha: string | null): Resolver {
    const daFamilia = new Map<string, string[]>()
    for (const f of e.formulas) {
        if (f.linha !== linha || !f.variavel || f.formula === null) continue
        daFamilia.set(f.variavel, [...(daFamilia.get(f.variavel) ?? []), f.formula])
    }
    const cache = new Map<string, Avaliacao<number>>()
    const emCurso = new Set<string>()
    const resolver: Resolver = (nome) => {
        if (nome === 'L') return { ok: true, valor: e.L }
        if (nome === 'H') return { ok: true, valor: e.H }
        if (Object.prototype.hasOwnProperty.call(e.variaveis, nome) && Number.isFinite(e.variaveis[nome])) return { ok: true, valor: e.variaveis[nome] }
        const cacheado = cache.get(nome)
        if (cacheado) return cacheado
        const defs = [...new Set(daFamilia.get(nome) ?? [])]
        if (defs.length === 0) return { ok: false, motivo: `a variável ${nome} não foi informada, e a família da linha não a define`, variavel: nome }
        if (defs.length > 1) return { ok: false, motivo: `a variável ${nome} tem ${defs.length} fórmulas diferentes na família da linha: ${defs.join(' · ')}`, variavel: nome }
        if (emCurso.has(nome)) return { ok: false, motivo: `a variável ${nome} depende dela mesma na família`, variavel: nome }
        emCurso.add(nome)
        const r = avaliarNumero(defs[0], resolver)
        emCurso.delete(nome)
        const final: Avaliacao<number> = r.ok ? r : { ...falhaDe(r), motivo: `a variável ${nome} da família (${defs[0]}): ${falhaDe(r).motivo}` }
        cache.set(nome, final)
        return final
    }
    return resolver
}

interface Aplicada { regra: RegraDoMotor; classe: Classe; tipo: 'Perfil' | 'Insumo'; corte: Corte }

export function calcularTipologia(e: EntradaDoMotor): ResultadoDoMotor {
    const linha = normalizarLinha(e.linha)
    const resolver = resolverDasVariaveis(e, linha)
    const pendentes: Pendente[] = []
    const avisos: Aviso[] = []
    let regrasComQuantidadeAmbigua = 0

    const pendenteDaRegra = (r: RegraDoMotor, motivo: string, formula: string | null, variavel?: string) =>
        pendentes.push({ nivel: 'regra', codigo: r.codigo, descricao: r.descricao, motivo, formula, ...(variavel ? { variavel } : {}) })

    // As faltas da ENTRADA valem para o cálculo inteiro: um aviso só, nomeando a alíquota.
    for (const [nome, pct] of [['PIS', e.fiscal?.pisPct], ['COFINS', e.fiscal?.cofinsPct]] as const) {
        if (pct === null || pct === undefined) avisos.push({ tipo: 'aliquota_ausente', mensagem: `a alíquota de ${nome} não veio na entrada — o líquido não é calculado` })
    }
    if (e.colunaDePreco === 'doze' && (e.fiscal?.icmsInterestadualPct ?? null) === null) {
        avisos.push({ tipo: 'aliquota_ausente', mensagem: 'a alíquota de ICMS interestadual não veio na entrada — o líquido não é calculado' })
    }
    if ((e.fiscal?.tratamentoDoIpi ?? null) === null) {
        avisos.push({ tipo: 'ipi_sem_tratamento', mensagem: 'a entrada não diz se o IPI soma ao custo ou credita — ele é exibido e não é aplicado' })
    }

    const daTipologia = e.regras.filter((r) => r.tipologias.includes(e.tipologia) && (r.linha === null || normalizarLinha(r.linha) === linha))
    if (daTipologia.length === 0) avisos.push({ tipo: 'tipologia_sem_regras', mensagem: `nenhuma regra da tipologia ${e.tipologia} na linha ${e.linha}` })

    const aplicadas: Aplicada[] = []
    for (const r of daTipologia) {
        const categoria = r[COLUNA_DA_CATEGORIA_DO_FORNECEDOR]
        const classe = classeDaCategoria(categoria)
        if (!classe) { pendenteDaRegra(r, `categoria do motor fora das medidas: "${categoria ?? ''}"`, null); continue }

        // A cor filtra o perfil pela cor do perfil, o acessório pela do acessório; o reforço não.
        if (r.cor !== null && classe === 'perfil' && !mesmaCor(r.cor, e.corPerfil)) continue
        if (r.cor !== null && classe === 'acessorio' && !mesmaCor(r.cor, e.corAcessorio)) continue

        if (r.condicao !== null) {
            const c = avaliarCondicao(r.condicao, resolver)
            if (!c.ok) { pendenteDaRegra(r, `condição: ${falhaDe(c).motivo}`, r.condicao, falhaDe(c).variavel); continue }
            if (!c.valor) continue
        }

        const tipo = (r.tipo ?? '').trim().toLowerCase() === 'perfil' ? 'Perfil' : (r.tipo ?? '').trim().toLowerCase() === 'insumo' ? 'Insumo' : null
        if (!tipo) { pendenteDaRegra(r, `tipo fora dos medidos ("Perfil", "Insumo"): "${r.tipo ?? ''}"`, null); continue }

        if (r.formula_qtde === null) { pendenteDaRegra(r, 'a regra não tem fórmula de quantidade', null); continue }
        const alternativas = r.formula_qtde.split('|').map((x) => x.trim()).filter((x) => x !== '')
        if (alternativas.length === 0) { pendenteDaRegra(r, 'a fórmula de quantidade está vazia', r.formula_qtde); continue }
        const q = avaliarNumero(alternativas[0], resolver)
        if (!q.ok) { pendenteDaRegra(r, `quantidade: ${falhaDe(q).motivo}`, r.formula_qtde, falhaDe(q).variavel); continue }
        if (q.valor < 0) { pendenteDaRegra(r, `quantidade negativa (${q.valor})`, r.formula_qtde); continue }

        let medidaMm: number | null = null
        if (tipo === 'Perfil') {
            if (r.formula_em_lh === null) { pendenteDaRegra(r, 'perfil sem fórmula de medida em L/H (col. 11)', null); continue }
            const m = avaliarNumero(r.formula_em_lh, resolver)
            if (!m.ok) { pendenteDaRegra(r, `medida: ${falhaDe(m).motivo}`, r.formula_em_lh, falhaDe(m).variavel); continue }
            if (m.valor <= 0) { pendenteDaRegra(r, `medida não positiva (${m.valor} mm)`, r.formula_em_lh); continue }
            medidaMm = m.valor
        }

        if (alternativas.length > 1) regrasComQuantidadeAmbigua++
        aplicadas.push({
            regra: r, classe, tipo,
            corte: {
                medidaMm, pecas: q.valor * e.quantidade, eixo: r.eixo, corte: r.corte, formulaEmLh: r.formula_em_lh,
                formulaQtde: r.formula_qtde, alternativasDaQuantidade: alternativas.length, quantidadeUsada: alternativas[0],
            },
        })
    }

    // Por código.
    const porCodigo = new Map<string, Aplicada[]>()
    for (const a of aplicadas) porCodigo.set(a.regra.codigo, [...(porCodigo.get(a.regra.codigo) ?? []), a])
    const itemPorCodigo = new Map(e.itens.map((i) => [i.codigo, i]))

    const linhas: LinhaDoCalculo[] = []
    for (const [codigo, grupo] of porCodigo) {
        const primeira = grupo[0]
        const descricaoDaRegra = primeira.regra.descricao
        const pendenteDoCodigo = (motivo: string) =>
            pendentes.push({ nivel: 'codigo', codigo, descricao: descricaoDaRegra, motivo: `${motivo} (${grupo.length} regra(s))`, formula: null })

        const categorias = [...new Set(grupo.map((a) => a.regra[COLUNA_DA_CATEGORIA_DO_FORNECEDOR] ?? ''))]
        if (categorias.length > 1) avisos.push({ tipo: 'categoria_divergente', codigo, mensagem: `o código ${codigo} tem regras de categorias diferentes (${categorias.join(', ')}) — vale a da primeira` })
        if (new Set(grupo.map((a) => a.tipo)).size > 1) { pendenteDoCodigo('o código tem regras de Perfil e de Insumo ao mesmo tempo'); continue }

        const item = itemPorCodigo.get(codigo)
        if (!item) { pendenteDoCodigo('o código não está na tabela de preço'); continue }

        const cortes = grupo.map((a) => a.corte)
        const pecas = cortes.reduce((s, c) => s + c.pecas, 0)
        // O bruto e o que sai dele: o IPI POR FORA (bruto × `ipi`, FRAÇÃO; sem `ipi`, sem IPI — nunca
        // zero), e o LÍQUIDO (bruto − ICMS − PIS − COFINS), que só sai com as três alíquotas.
        const valores = (valorBruto: number) => {
            if (item.ipi === null) avisos.push({ tipo: 'ipi_ausente', codigo, mensagem: `o item ${codigo} não tem IPI` })
            const ipiPorFora = item.ipi === null ? null : valorBruto * item.ipi
            const icmsPct = e.colunaDePreco === 'interna' ? item.aliquota_interna_pct : e.fiscal?.icmsInterestadualPct ?? null
            if (e.colunaDePreco === 'interna' && icmsPct === null) avisos.push({ tipo: 'aliquota_ausente', codigo, mensagem: `o item ${codigo} não tem a alíquota interna de ICMS` })
            // PERCENTUAL ÷ 100 aqui; o `ipi`, acima, é FRAÇÃO e multiplica direto. Ver o cabeçalho.
            const sobreOBruto = (pct: number | null) => (pct === null ? null : valorBruto * (pct / 100))
            const icms = sobreOBruto(icmsPct)
            const pis = sobreOBruto(e.fiscal?.pisPct ?? null)
            const cofins = sobreOBruto(e.fiscal?.cofinsPct ?? null)
            const faltam = [icms === null ? 'ICMS' : null, pis === null ? 'PIS' : null, cofins === null ? 'COFINS' : null].filter((x): x is string => x !== null)
            const valorLiquido = faltam.length > 0 ? null : valorBruto - (icms as number) - (pis as number) - (cofins as number)
            const tratamento = e.fiscal?.tratamentoDoIpi ?? null
            const custo = valorLiquido === null || tratamento === null ? null
                : tratamento === 'credita' ? valorLiquido
                    : ipiPorFora === null ? null : valorLiquido + ipiPorFora
            return {
                valorBruto, ipiPorFora, icms, pis, cofins, valorLiquido,
                motivoSemLiquido: faltam.length > 0 ? `faltou a alíquota de ${faltam.join(', ')} — o líquido não é calculado` : null,
                custo,
            }
        }
        const base = { codigo, descricao: item.descricao ?? descricaoDaRegra, categoria: categorias[0], tipo: primeira.tipo, cortes, pecas }

        if (primeira.tipo === 'Insumo') {
            if (item.vendido_por === 'barra') { pendenteDoCodigo(MOTIVO_INSUMO_VENDIDO_POR_BARRA); continue }
            if (item.vendido_por !== 'unidade') { pendenteDoCodigo('o item do insumo não diz como é vendido'); continue }
            // ARMADILHA: na seção por unidade o UNITÁRIO está em `valor_metro_interno` ("VALOR UNIT").
            if (e.colunaDePreco === 'doze') { pendenteDoCodigo('item por unidade com a coluna de 12%: não se mediu onde está o unitário a 12%'); continue }
            const unitario = item.valor_metro_interno
            if (unitario === null) { pendenteDoCodigo('o item não tem o valor unitário ("VALOR UNIT")'); continue }
            const peso = item.peso === null ? null : pecas * item.peso
            if (peso === null) avisos.push({ tipo: 'peso_ausente', codigo, mensagem: `o item ${codigo} não tem peso` })
            linhas.push({ ...base, mmTotais: null, barras: null, aproveitamento: null, pesoConsumidoKg: peso, pesoCompradoKg: peso, ...valores(pecas * unitario) })
            continue
        }

        if (item.vendido_por !== 'barra') { pendenteDoCodigo(`perfil cujo item não é vendido por barra ("${item.vendido_por ?? 'não diz'}")`); continue }
        if (item.medida_barra_m === null || item.medida_barra_m <= 0) { pendenteDoCodigo('o item não tem a medida da barra'); continue }
        const mmTotais = cortes.reduce((s, c) => s + (c.medidaMm as number) * c.pecas, 0)
        const barraMm = item.medida_barra_m * 1000
        const barras = Math.ceil(semRuido(mmTotais / barraMm))
        const aproveitamento = barras > 0 ? mmTotais / (barras * barraMm) : null

        let valorBruto: number
        if (e.modo === 'barra-inteira') {
            const valorDaBarra = e.colunaDePreco === 'interna' ? item.valor_barra_interno : item.valor_barra_12
            if (valorDaBarra === null) { pendenteDoCodigo(`o item não tem o valor da barra (${e.colunaDePreco})`); continue }
            valorBruto = barras * valorDaBarra
        } else {
            const valorDoMetro = e.colunaDePreco === 'interna' ? item.valor_metro_interno : item.valor_metro_12
            if (valorDoMetro === null) { pendenteDoCodigo(`o item não tem o valor do metro (${e.colunaDePreco})`); continue }
            valorBruto = (mmTotais / 1000) * valorDoMetro
        }

        const pesoConsumidoKg = item.peso === null ? null : (mmTotais / 1000) * item.peso
        const pesoCompradoKg = item.peso === null ? null : e.modo === 'consumo' ? pesoConsumidoKg : barras * item.medida_barra_m * item.peso
        if (item.peso === null) avisos.push({ tipo: 'peso_ausente', codigo, mensagem: `o item ${codigo} não tem peso` })
        linhas.push({ ...base, mmTotais, barras, aproveitamento, pesoConsumidoKg, pesoCompradoKg, ...valores(valorBruto) })
    }

    // A soma de um campo que pode faltar: NULL se faltar em UMA linha — somar o resto diria menos do que há.
    const somaOuNada = (ls: LinhaDoCalculo[], campo: (l: LinhaDoCalculo) => number | null) =>
        ls.some((l) => campo(l) === null) ? null : ls.reduce((s, l) => s + (campo(l) as number), 0)
    const somar = (ls: LinhaDoCalculo[]): TotalDoCalculo => ({
        valorBruto: ls.reduce((s, l) => s + l.valorBruto, 0),
        ipiPorFora: somaOuNada(ls, (l) => l.ipiPorFora),
        valorLiquido: somaOuNada(ls, (l) => l.valorLiquido),
        custo: somaOuNada(ls, (l) => l.custo),
        pesoConsumidoKg: ls.some((l) => l.pesoConsumidoKg === null) ? null : ls.reduce((s, l) => s + (l.pesoConsumidoKg as number), 0),
        pesoCompradoKg: ls.some((l) => l.pesoCompradoKg === null) ? null : ls.reduce((s, l) => s + (l.pesoCompradoKg as number), 0),
        linhas: ls.length,
    })
    const categorias = [...new Set(linhas.map((l) => l.categoria))]
    return {
        linhas,
        totaisPorCategoria: categorias.map((categoria) => ({ categoria, ...somar(linhas.filter((l) => l.categoria === categoria)) })),
        total: somar(linhas),
        pendentes,
        avisos,
        regrasComQuantidadeAmbigua,
        pesoAproximado: PESO_E_APROXIMADO,
    }
}
