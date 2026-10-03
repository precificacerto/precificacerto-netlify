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

/**
 * O NOME, e ele é UM SÓ em todo o sistema — §A do adendo de 02/10/2026.
 *
 * Decisão do dono do produto, de 02/10/2026. O nome que foi descartado
 *
 *   > SAI do vocabulário: não pode sobrar em rótulo, em chave de grupo, em comentário, em
 *   > nome de teste nem em nome de arquivo.
 *
 * >>> E É POR ISSO QUE ELE NÃO ESTÁ ESCRITO AQUI <<<
 *
 * A citação acima é a única do repositório que teria razão para reproduzi-lo — e não o faz,
 * porque a própria decisão diz "nem em comentário". Escrevê-lo para explicar que ele saiu
 * deixaria o portão do §E com uma exceção, e exceção em portão é porta
 * (`portao-que-nao-alcanca.md`). A frase operativa está literal; só o nome morto saiu.
 *
 * A razão é a do §2.4 do comando: *"Lá dentro do HUB não pode ter ambiguidade. Empréstimos vai
 * só num lugar, investimentos vai só num lugar."* O rótulo já existia aqui desde 21/09/2026, e
 * criar um segundo nome para a mesma coisa é a duplicidade que aquele parágrafo proíbe para as
 * categorias — introduzida, nesta campanha, pelo próprio comando. O adendo a corrige.
 *
 * Este rótulo aparece IGUAL em: cadastro de categorias da precificação, lançamento de despesa
 * do fluxo de caixa, HUB, Análise Financeira, linha do DRE e bloco de despesas da decomposição.
 */
export const LABEL_DO_BLOCO = 'Compromissos Financeiros'

/**
 * A CHAVE — do subgrupo de apresentação E do grupo DERIVADO de rateio.
 *
 * >>> UMA CONSTANTE, E NÃO DUAS COM O MESMO VALOR <<<
 *
 * Até o adendo havia `BLOCO_COMPROMISSOS` ao lado desta, com outro texto para a
 * mesma coisa. Duas constantes com o mesmo papel são a cópia divergente em forma de nome: no
 * dia em que uma mudasse, a outra ficaria para trás e nada falharia. Ficou uma.
 *
 * >>> ELA NÃO É UM `expense_group` GRAVADO <<<
 *
 * O `cash_entries.expense_group` das cinco categorias continua sendo `DESPESA_FIXA` ou
 * `AMORTIZACAO`: a Análise Financeira contábil (`pages/dfc/`) lê o grupo gravado, e migrar os
 * 45 lançamentos medidos em 02/10/2026 é o que o §4 do comando proíbe nesta rodada. Quem
 * produz este grupo é a LEITURA — `classificarLancamentoDeDespesa`.
 */
export const BLOCO_COMPROMISSOS = 'COMPROMISSOS_FINANCEIROS'

/**
 * >>> O GRUPO TÉCNICO DAS CINCO PASSOU A SER UM — 02/10/2026 <<<
 *
 * Até esta data o `expense_group` era `DESPESA_FIXA` em quatro e `AMORTIZACAO` na amortização,
 * e o aviso que ficava aqui dizia que ele NÃO mudava: a Análise Financeira dependia do grupo
 * gravado para pôr a amortização depois do resultado operacional, e trocá-lo moveria a linha.
 *
 * Aquilo estava certo sob a regra da época (`decisao-sob-regra-da-epoca.md`): não havia grupo
 * próprio para onde mover. Agora há — `COMPROMISSOS_FINANCEIROS` —, e a linha da Análise é a
 * da CATEGORIA, no mesmo lugar onde a amortização estava. Nada se move de posição; o que muda
 * é que passa a haver UM grupo em vez de dois.
 *
 * >>> O DADO JÁ GRAVADO É ALINHADO POR MIGRAÇÃO, NÃO POR LEITURA <<<
 *
 * Os lançamentos existentes têm `DESPESA_FIXA` na coluna. A migração
 * `20261002000002_compromissos_financeiros_grupo_unico.sql` os alinha, e até ela ser aplicada
 * a leitura por CATEGORIA (`classificarLancamentoDeDespesa`) cobre os dois estados — é a ponte,
 * não o remendo.
 *
 * O que torna a reclassificação legítima, contra o que a decisão de 21/09 dizia: o usuário
 * escolhe a CATEGORIA, e o grupo é DERIVADO dela. Corrigir uma derivação não reescreve a
 * escolha de ninguém, e por isso não é o caso que `fato-vs-referencia.md` protege.
 */
export interface CategoriaDoBloco {
  /** O valor gravado em `cash_entries.expense_category` — é o RÓTULO, não uma chave. */
  category: string
  /**
   * O `expense_group` da categoria — e ele é **UM SÓ** desde 02/10/2026.
   *
   * >>> ATÉ AQUI ERAM DOIS, E ERA O DEFEITO <<<
   *
   * Quatro categorias declaravam `DESPESA_FIXA` e a amortização declarava `AMORTIZACAO`: dois
   * grupos técnicos para o que é UMA categoria. Formulação do dono do produto, registrada como
   * está:
   *
   *   > Compromissos Financeiros é uma categoria só. As cinco são subcategorias dela. Nenhuma é
   *   > despesa fixa. Amortização não é despesa fixa.
   *   >
   *   > Se a implementação ainda precisa somar "as categorias do bloco" mais "o grupo
   *   > AMORTIZACAO", é porque as cinco não foram para um grupo só. Elas continuariam
   *   > espalhadas em dois grupos, com a soma remendando por cima.
   *
   * O tipo é o literal ÚNICO de propósito: `'DESPESA_FIXA' | 'AMORTIZACAO'` deixava a divisão
   * antiga representável, e o compilador aceitaria a próxima categoria declarando despesa fixa.
   * Com um literal só, ela não cabe.
   */
  group: typeof BLOCO_COMPROMISSOS
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
 * As CINCO categorias do bloco, mais os dois rótulos legados que o banco já tem.
 *
 * "Aplicações / Consórcios" e "Empréstimos / Financiamentos" eram cada uma DUAS naturezas num
 * rótulo só. Desmembrar é o §3; manter os rótulos antigos lendo é o que impede que a
 * desmembração apague o passado.
 *
 * ───────────────────────────────────────────────────────────────────────────────────────────
 * >>> POR QUE "APLICAÇÕES" É COMPROMISSO, E NÃO INVESTIMENTO <<<
 *
 * A citação está AQUI, no ponto onde a lista é declarada, e não só no documento da rodada,
 * porque é aqui que alguém vem mexer. `razao-longe-da-restricao.md`: uma restrição declarada
 * muda parece escolha arbitrária, e escolha arbitrária convida a ser alargada — foi exatamente
 * o que aconteceu em 02/10/2026, quando se propôs mover "Aplicações" para o grupo
 * `INVESTIMENTO` por ela estar ao lado de "Empréstimos".
 *
 * Formulação do dono do produto, registrada como está (02/10/2026):
 *
 *   > Investimento pode ser investimento estrutural, investimento em máquinas. E aplicações
 *   > pode ser em CDI, em contas que podem render juros. São coisas diferentes.
 *   >
 *   > A aplicação é quando ela tem um valor que é direcionado a um vencimento. Eu fiz uma
 *   > aplicação lá que eu vou pagar tanto por mês naquela aplicação.
 *
 * Ou seja: a "Aplicação" desta lista é **APORTE PROGRAMADO** — tem parcela que vence todo mês
 * independentemente de venda, e por isso passa no MESMO critério do empréstimo. O investimento
 * vira ativo e só acontece se sobrar; a aplicação é parcela contratada.
 *
 * Mover "Aplicações" para `INVESTIMENTO` tiraria do preço uma parcela que vence de qualquer
 * jeito — e nada falharia, porque o preço só ficaria menor.
 * ───────────────────────────────────────────────────────────────────────────────────────────
 */
export const CATEGORIAS_DO_BLOCO: CategoriaDoBloco[] = [
  { category: 'Amortização de Dívida (principal)', group: BLOCO_COMPROMISSOS },
  { category: 'Financiamentos', group: BLOCO_COMPROMISSOS },
  { category: 'Empréstimos', group: BLOCO_COMPROMISSOS },
  { category: 'Consórcios', group: BLOCO_COMPROMISSOS },
  { category: 'Aplicações', group: BLOCO_COMPROMISSOS },
  // ── legados: lidos, não oferecidos ──
  { category: 'Empréstimos / Financiamentos', group: BLOCO_COMPROMISSOS, legado: true },
  { category: 'Aplicações / Consórcios', group: BLOCO_COMPROMISSOS, legado: true },
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
 * OS GRUPOS QUE COMPÕEM A BASE DO RATEIO DE DESPESA FIXA.
 *
 * >>> `AMORTIZACAO` CONTINUA AQUI, E AGORA SEM NENHUMA CATEGORIA DECLARADA <<<
 *
 * Em 21/09/2026 ela entrou porque TODAS as suas categorias eram do bloco. Desde 02/10/2026
 * NENHUMA categoria declara `AMORTIZACAO`: as cinco foram para `COMPROMISSOS_FINANCEIROS`, que
 * entra no divisor pelo termo PRÓPRIO (`capital`/`financial_commitments_percent`).
 *
 * Ela fica como REDE PARA DADO LEGADO, e a razão é o §0: tirá-la mudaria o percentual de um
 * tenant que tivesse lançamento gravado naquele grupo com categoria fora do bloco — zero
 * lançamentos medidos, mas um preço que se move é defeito, não efeito esperado. Mantida, a
 * reconstrução de `extractStructurePercents` continua BIT-EXACT à de antes.
 *
 * E há caso afirmando que nenhuma categoria a declara: no dia em que alguém criar uma, o caso
 * fica VERMELHO e a decisão volta à mesa, em vez de a categoria entrar no preço em silêncio por
 * um grupo que ninguém lembra que existe.
 */
export const GRUPOS_DA_BASE_DA_DESPESA_FIXA = ['DESPESA_FIXA', 'AMORTIZACAO'] as const

// ───────────────────────────────────────────────────────────────────────────────────────────
// O PERCENTUAL DO BLOCO NA PRECIFICAÇÃO — categoria independente, MESMO PERCENTUAL
// ───────────────────────────────────────────────────────────────────────────────────────────

/*
 * §0 e §1 do comando de 02/10/2026. Formulação do dono do produto, registrada como está:
 *
 *   > Na construção, ele permanece o percentual que foi considerado sobre a resultante do
 *   > faturamento. Aí então chegamos ao valor final do produto. Ponto. Na decomposição,
 *   > quando fizer o abatimento dentro dos orçamentos, pedidos ou vendas, ele entra com o
 *   > valor de origem, que é o valor congelado, o valor monetário, dentro das despesas, assim
 *   > como acontece com a despesa fixa, a despesa variável, a despesa financeira.
 *
 * >>> A TRAVA: NENHUM PREÇO MUDA <<<
 *
 * O bloco JÁ ESTÁ dentro do preço hoje, dentro da despesa fixa. Ele sai de lá e vira termo
 * próprio **com o mesmo percentual, no mesmo divisor** — a soma do divisor não muda, então o
 * preço não muda. Qualquer produto que mude de preço é DEFEITO, não efeito esperado.
 *
 * >>> O QUE FOI DESCARTADO, E NÃO DEVE SER RESSUSCITADO <<<
 *
 * Uma especificação anterior punha o bloco como "componente do lucro-alvo", entrando no motor
 * como "parâmetro de margem exigida", com gross-up de IRPJ/CSLL. ISSO FOI DESCARTADO pelo dono
 * do produto em 02/10/2026. Não há gross-up, não há margem exigida, e não há parâmetro novo no
 * motor além do percentual que já existia dentro da despesa fixa.
 *
 * Se essa formulação aparecer em algum documento do projeto, ela está VENCIDA.
 *
 * O rótulo é `LABEL_DO_BLOCO` e a chave é `BLOCO_COMPROMISSOS`, as duas no topo deste arquivo.
 */

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
 * >>> O COMPROMISSO VAI PARA `COMPROMISSOS_FINANCEIROS` — mudou em 02/10/2026 <<<
 *
 * Até esta data ele ia para `DESPESA_FIXA`, pelo §7 do comando de 21/09/2026: *"a amortização
 * deixa de aparecer em qualquer outro ponto do HUB/Análise: ela existe só dentro do bloco"*.
 * Aquele destino cumpriu o que a regra da época pedia — ver `decisao-sob-regra-da-epoca.md`:
 * a categoria independente ainda não existia, e o bloco dentro da Despesa Fixa era o nível de
 * separação que havia.
 *
 * O §0 de 02/10/2026 pede o nível seguinte: *"Ele sai de lá e vira categoria própria, COM O
 * MESMO PERCENTUAL, NO MESMO DIVISOR"*. O destino passa a ser `COMPROMISSOS_FINANCEIROS`, e o
 * efeito é só de LUGAR — o valor é o mesmo, e a soma com a Despesa Fixa é a Despesa Fixa de
 * antes.
 *
 * O `expense_group` GRAVADO continua intocado. A Análise Financeira contábil (`pages/dfc/`) lê
 * `cash_entries` direto, e lá o compromisso é reconhecido pela CATEGORIA, antes do `switch` de
 * grupo — o mesmo padrão que a RT, as comissões e o custo dos produtos já usam ali.
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
    return [{ group: BLOCO_COMPROMISSOS, category: categoria, amount: total }]
  }

  return [
    { group: BLOCO_COMPROMISSOS, category: categoria, amount: total - juros },
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
