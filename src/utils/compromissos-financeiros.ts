/**
 * compromissos-financeiros.ts — a FONTE ÚNICA do bloco Compromissos Financeiros e do grupo
 * Investimento.
 *
 * Formulação do dono do produto, registrada como está (21/09/2026):
 *
 *   > O preço tem que cobrir o que vence de qualquer jeito. Parcela de financiamento,
 *   > empréstimo, consórcio e amortização de principal vencem mesmo sem venda: são
 *   > compromisso assumido. Investimento não — ele só acontece se sobrar dinheiro, então sai
 *   > do lucro e não entra no preço.
 *
 * >>> A DISTINÇÃO QUE O ARQUIVO INTEIRO SERVE <<<
 *
 * | | vence sem venda? | entra no rateio? |
 * |---|---|---|
 * | compromisso financeiro | **sim** — o contrato já foi assinado | **sim** |
 * | investimento | **não** — só acontece se sobrar | **não**, sai do lucro |
 *
 * Tratar as duas como a mesma coisa é o que hoje deixa o preço sem cobrir a parcela, e faz o
 * "lucro" exibido ser maior do que o dinheiro que sobra.
 *
 * >>> POR QUE ESTE MÓDULO EXISTE, E NÃO UMA LISTA EM CADA TELA <<<
 *
 * As categorias de despesa já vivem em DUAS listas divergentes — `CATEGORY_GROUP_MAP` diz
 * `'Empréstimos'` e `SN_CATEGORY_GROUP_MAP` diz `'Empréstimos / Financiamentos'` para a mesma
 * coisa, e o banco tem lançamentos com os DOIS rótulos. É `copia-divergente.md` já
 * materializado, e é por isso que a pertinência ao bloco é decidida AQUI, numa função, e não
 * repetida em cada consumidor.
 */

/** O rótulo do bloco, como ele aparece no seletor, no HUB e na Análise. */
export const LABEL_DO_BLOCO = 'Compromissos Financeiros'

/** A chave do subgrupo de apresentação. NÃO é um `expense_group` — ver o aviso abaixo. */
export const BLOCO_COMPROMISSOS = 'COMPROMISSOS_FINANCEIROS'

/**
 * >>> O GRUPO TÉCNICO DE CADA CATEGORIA **NÃO MUDA** <<<
 *
 * `COMPROMISSOS_FINANCEIROS` é subgrupo de APRESENTAÇÃO e de RATEIO. O `expense_group` gravado
 * continua sendo `DESPESA_FIXA` ou `AMORTIZACAO`, porque a Análise Financeira (`dfc/`) depende
 * dele para pôr a amortização DEPOIS do resultado operacional. Trocar o grupo moveria a linha
 * de lugar na demonstração contábil — que é exatamente o que o §7 do comando proíbe.
 */
export interface CategoriaDoBloco {
  /** O valor gravado em `cash_entries.expense_category` — é o RÓTULO, não uma chave. */
  category: string
  /** O `expense_group` que ela mantém. */
  group: 'DESPESA_FIXA' | 'AMORTIZACAO'
  /**
   * `true` = rótulo LEGADO, que continua sendo lido mas não é mais oferecido no seletor.
   *
   * Medido no banco em 21/09/2026, antes de qualquer mudança:
   *   'Empréstimos'                  10 lançamentos · R$ 53.780,75
   *   'Aplicações / Consórcios'      13 lançamentos · R$ 43.223,20
   *   'Empréstimos / Financiamentos'  3 lançamentos · R$ 11.350,00
   *
   * Tirá-los da lista faria 26 lançamentos e R$ 108.353,95 deixarem de ser reconhecidos como
   * compromisso — sem erro nenhum, porque o resolvedor devolve `undefined` e o lançamento cai
   * no balde do desconhecido.
   */
  legado?: boolean
}

/**
 * As CINCO categorias do bloco, mais os três rótulos legados que o banco já tem.
 *
 * "Aplicações / Consórcios" e "Empréstimos / Financiamentos" eram cada uma DUAS naturezas num
 * rótulo só. Desmembrar é o §3; manter os rótulos antigos lendo é o que impede que a
 * desmembração apague o passado.
 */
export const CATEGORIAS_DO_BLOCO: CategoriaDoBloco[] = [
  { category: 'Amortização de Dívida (principal)', group: 'AMORTIZACAO' },
  { category: 'Financiamentos', group: 'DESPESA_FIXA' },
  { category: 'Empréstimos', group: 'DESPESA_FIXA' },
  { category: 'Consórcios', group: 'DESPESA_FIXA' },
  { category: 'Aplicações', group: 'DESPESA_FIXA' },
  // ── legados: lidos, não oferecidos ──
  { category: 'Empréstimos / Financiamentos', group: 'DESPESA_FIXA', legado: true },
  { category: 'Aplicações / Consórcios', group: 'DESPESA_FIXA', legado: true },
]

/** Só as oferecidas no seletor — as cinco do §3, na ordem do bloco. */
export const CATEGORIAS_OFERECIDAS_DO_BLOCO = CATEGORIAS_DO_BLOCO.filter((c) => !c.legado)

/**
 * O rótulo que substitui cada legado quando alguém quiser exibir a natureza desmembrada.
 *
 * `'Empréstimos'` NÃO está aqui: ele continua sendo uma das cinco, com o mesmo texto. O que
 * ele perdeu foi a metade "/ Financiamentos", que virou categoria própria.
 */
export const LEGADO_PARA_ATUAL: Record<string, string> = {
  'Empréstimos / Financiamentos': 'Empréstimos',
  'Aplicações / Consórcios': 'Consórcios',
}

/** A categoria pertence ao bloco? Rótulo vazio ou desconhecido devolve `false`. */
export function ehCompromissoFinanceiro(category: string | null | undefined): boolean {
  if (!category) return false
  return CATEGORIAS_DO_BLOCO.some((c) => c.category === category)
}

/**
 * OS GRUPOS QUE COMPÕEM A BASE DO RATEIO DE DESPESA FIXA — §5.
 *
 * `AMORTIZACAO` entra porque TODAS as suas categorias são do bloco. Isso não é suposição: há
 * caso afirmando a cobertura, e ele fica vermelho no dia em que alguém criar uma categoria de
 * amortização que não seja compromisso — em vez de ela entrar no preço em silêncio.
 *
 * As outras quatro categorias do bloco já são `DESPESA_FIXA` e já estavam na base.
 */
export const GRUPOS_DA_BASE_DA_DESPESA_FIXA = ['DESPESA_FIXA', 'AMORTIZACAO'] as const

/**
 * >>> INVESTIMENTO NUNCA ENTRA <<<
 *
 * Está escrito como constante e afirmado em teste porque o modo de falhar é por OMISSÃO:
 * acrescentar `INVESTIMENTO` à base seria uma linha, e nada quebraria — o preço só subiria.
 */
export const GRUPO_INVESTIMENTO = 'INVESTIMENTO'

/** As cinco categorias de investimento do §4. O grupo delas é `INVESTIMENTO`. */
export const CATEGORIAS_DE_INVESTIMENTO: { category: string; group: string }[] = [
  { category: 'Aquisição de máquinas e equipamentos', group: GRUPO_INVESTIMENTO },
  { category: 'Obras e benfeitorias', group: GRUPO_INVESTIMENTO },
  { category: 'Software e tecnologia', group: GRUPO_INVESTIMENTO },
  { category: 'Participação societária', group: GRUPO_INVESTIMENTO },
  { category: 'Outros investimentos', group: GRUPO_INVESTIMENTO },
]

// ───────────────────────────────────────────────────────────────────────────────────────────
// §6 — JUROS E PRINCIPAL NA MESMA PARCELA
// ───────────────────────────────────────────────────────────────────────────────────────────

export interface ParcelaInformada {
  /** O total da parcela, como o usuário o digitou. */
  total: number
  /** Juros. `null`/`undefined` = NÃO INFORMADO, que não é zero. */
  juros?: number | null
  /** Principal. `null`/`undefined` = não informado. */
  principal?: number | null
}

export interface ParcelaSeparada {
  /** O que vai para `DESPESA_FINANCEIRA`. `null` quando o usuário não informou juros. */
  juros: number | null
  /** O que vai para o bloco. Recebe o valor cheio quando nada foi informado. */
  principal: number
  /** `true` quando o usuário não separou e o valor cheio foi tratado como principal. */
  usouValorCheio: boolean
  /** `true` quando `juros + principal` não fecha com o total informado. */
  divergeDoTotal: boolean
}

const n = (v: unknown): number => {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

/**
 * Separa a parcela em juros e principal, segundo o §6.
 *
 * >>> `null` NÃO É ZERO, E É ESSA A LINHA QUE IMPORTA <<<
 *
 * Formulação do dono do produto: *"Parcela sem juros informado NÃO é parcela com juros zero."*
 * Gravar `0` afirmaria que a parcela não tem juros — uma afirmação sobre um contrato que
 * ninguém leu. Gravar `null` não afirma nada (`ausente-vs-falso.md`), e é o que permite, um
 * dia, distinguir "não separou" de "separou e deu zero".
 *
 * Quando nada é informado, o valor cheio vai TODO para o principal. É a escolha conservadora
 * do ponto de vista do preço: o principal entra no rateio, os juros também entrariam por
 * `DESPESA_FINANCEIRA`, e o que não pode acontecer é a parcela sumir das duas.
 */
export function separarJurosEPrincipal(parcela: ParcelaInformada): ParcelaSeparada {
  const total = n(parcela.total)
  const temJuros = parcela.juros != null && Number.isFinite(Number(parcela.juros))
  const temPrincipal = parcela.principal != null && Number.isFinite(Number(parcela.principal))

  if (!temJuros && !temPrincipal) {
    return { juros: null, principal: total, usouValorCheio: true, divergeDoTotal: false }
  }

  const juros = temJuros ? n(parcela.juros) : 0
  // Só um dos dois informado: o outro é o RESTO do total, não zero — o usuário informou a
  // parte que conhecia, e o total é dado.
  const principal = temPrincipal ? n(parcela.principal) : total - juros

  return {
    juros: temJuros ? juros : null,
    principal,
    usouValorCheio: false,
    divergeDoTotal: Math.abs(juros + principal - total) > 0.005,
  }
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// A CLASSIFICAÇÃO DE UM LANÇAMENTO — a implementação ÚNICA do §5
// ───────────────────────────────────────────────────────────────────────────────────────────

/** A categoria que recebe a parcela de juros de um compromisso. */
export const CATEGORIA_JUROS = 'Juros'

export interface LancamentoDeDespesa {
  expense_group?: string | null
  expense_category?: string | null
  amount: number
  juros_value?: number | null
  principal_value?: number | null
}

export interface ParteDoLancamento {
  group: string
  category: string
  amount: number
  /** `true` na parcela de juros que foi DESTACADA de um compromisso. */
  destacadaDoCompromisso?: boolean
}

/**
 * Em que PARTES um lançamento de despesa se decompõe para o HUB e para o rateio.
 *
 * >>> A SOMA DAS PARTES É SEMPRE O `amount` <<<
 *
 * O `amount` é o que saiu do caixa, e o HUB é por caixa: se as partes somassem outra coisa, o
 * "Total Despesas" da tela deixaria de bater com o extrato. Por isso o principal é SEMPRE
 * `total − juros`, e não o `principal_value` digitado — divergência entre os dois é problema
 * do formulário, que a recusa antes de gravar (`separarJurosEPrincipal().divergeDoTotal`), e
 * nunca um número que o HUB inventa para fechar.
 *
 * >>> O COMPROMISSO VAI PARA `DESPESA_FIXA`, INCLUSIVE O QUE ERA `AMORTIZACAO` <<<
 *
 * É o §7: *"a amortização deixa de aparecer em qualquer outro ponto do HUB/Análise: ela existe
 * só dentro do bloco"*. O `expense_group` GRAVADO não muda — quem muda de lugar é a leitura do
 * HUB. A Análise Financeira contábil (`pages/dfc/`) lê `cash_entries` direto e continua pondo
 * a amortização depois do resultado operacional.
 */
export function classificarLancamentoDeDespesa(entry: LancamentoDeDespesa): ParteDoLancamento[] {
  const total = n(entry.amount)
  const categoria = entry.expense_category || ''
  const grupoGravado = entry.expense_group || 'OUTROS'

  if (!ehCompromissoFinanceiro(categoria)) {
    return [{ group: grupoGravado, category: categoria, amount: total }]
  }

  const { juros } = separarJurosEPrincipal({
    total,
    juros: entry.juros_value,
    principal: entry.principal_value,
  })

  // Juros ausente (`null`) ou zero não abre linha: uma linha de R$ 0,00 em despesa financeira
  // afirmaria que houve juros e eles deram zero. Ausente não afirma nada.
  if (juros == null || juros === 0) {
    return [{ group: 'DESPESA_FIXA', category: categoria, amount: total }]
  }

  return [
    { group: 'DESPESA_FIXA', category: categoria, amount: total - juros },
    { group: 'DESPESA_FINANCEIRA', category: CATEGORIA_JUROS, amount: juros, destacadaDoCompromisso: true },
  ]
}

/**
 * A ORDEM das linhas do bloco na tela — o subtotal ANTES dos membros, como o §7 desenha:
 *
 *     Compromissos Financeiros                 ← subtotal do bloco
 *         Amortização · Financiamentos · Empréstimos · Consórcios · Aplicações
 *
 * Sem ordem explícita as seis linhas caem no `?? 999` do mapa de ordem das categorias e saem
 * intercaladas com o aluguel e a energia — o bloco deixa de ser bloco.
 */
export function ordemNoBloco(category: string): number | null {
  if (category === LABEL_DO_BLOCO) return 9000
  const i = CATEGORIAS_DO_BLOCO.findIndex((c) => c.category === category)
  return i < 0 ? null : 9001 + i
}
