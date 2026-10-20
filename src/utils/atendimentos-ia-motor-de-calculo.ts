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
 * ══ O LÍQUIDO NÃO É CALCULADO NESTA VERSÃO ══
 * Dono do produto, 20/10/2026: o bruto é o valor da tabela, com ICMS, PIS e COFINS POR DENTRO; o
 * IPI é por fora. A BASE do crédito de PIS/COFINS — o bruto inteiro, ou o bruto menos o ICMS — está
 * EM ABERTO, e sem ela o líquido não sai: líquido chutado é pior que líquido ausente. A entrada já
 * recebe as alíquotas e a base (`EntradaFiscal`); a saída devolve o líquido NULO e diz por quê.
 *
 * ══ A FAMÍLIA DÁ O VALOR DA VARIÁVEL; O USUÁRIO VENCE ══
 * As fórmulas da família definem variáveis por LINHA (NF=4, NP=3, QMA=(NF-1) em PVC EUROPA 42). O
 * valor do usuário vence o da família; faltando os dois, a regra vai para pendentes nomeando a
 * variável. `pct_padrao` NÃO É USADO: medido, ele vem como 1 · 0,6606 · 0,4679, com "109
 * tipologias" na coluna ao lado — é uma proporção, e NÃO SE SABE O QUE ELA MEDE.
 *
 * Portão: `src/utils/__tests__/atendimentos-ia-motor-de-calculo.test.ts`.
 */
import {
    COLUNA_DA_CATEGORIA_DO_FORNECEDOR, type FormulaLida, type ItemLido, type RegraLida,
} from '@/utils/atendimentos-ia-importacao'

// ── A entrada ──────────────────────────────────────────────────────────────────────────────
/** Uma regra do motor, como vem de `orcamentista_motor_regra`. */
export type RegraDoMotor = Pick<RegraLida,
    typeof COLUNA_DA_CATEGORIA_DO_FORNECEDOR | 'codigo' | 'descricao' | 'cor' | 'linha' | 'tipo' | 'eixo' | 'corte'
    | 'formula_em_lh' | 'formula_qtde' | 'condicao' | 'tipologias'>

/** Um item de preço, como vem de `orcamentista_tabela_item`. */
export type ItemDoPreco = Pick<ItemLido,
    'codigo' | 'descricao' | 'medida_barra_m' | 'peso' | 'vendido_por'
    | 'valor_metro_interno' | 'valor_barra_interno' | 'valor_metro_12' | 'valor_barra_12'>

/** Uma fórmula da família, como vem de `orcamentista_motor_formula_familia`. `pct_padrao` não entra. */
export type FormulaDaFamilia = Pick<FormulaLida, 'linha' | 'variavel' | 'formula'>

export type ModoDeCobranca = 'barra-inteira' | 'consumo'

/** Qual coluna de valor usar. O motor NÃO decide operação interna nem interestadual: vem na entrada. */
export type ColunaDePreco = 'interna' | 'doze'

/**
 * Os tributos que creditam — PREPARADA, NÃO USADA nesta versão (ver o cabeçalho). O motor não
 * decide regime fiscal: o que credita, e quanto, vem daqui.
 */
export interface EntradaFiscal {
    icmsPct: number | null
    creditaIcms: boolean
    pisCofinsPct: number | null
    creditaPisCofins: boolean
    basePisCofins: 'bruto' | 'bruto-menos-icms' | null
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
export const MOTIVO_SEM_LIQUIDO =
    'o líquido não é calculado: a base do crédito de PIS/COFINS (o bruto inteiro, ou o bruto menos o ICMS) está em aberto com o dono do produto (20/10/2026)'

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
    valorLiquido: null
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

export interface Aviso { tipo: 'peso_ausente' | 'categoria_divergente' | 'tipologia_sem_regras'; codigo?: string; mensagem: string }

export interface TotalDoCalculo {
    valorBruto: number
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
    valorLiquido: null
    motivoSemLiquido: typeof MOTIVO_SEM_LIQUIDO
}

export function calcularTipologia(_e: EntradaDoMotor): ResultadoDoMotor { throw new Error('não implementado') }
