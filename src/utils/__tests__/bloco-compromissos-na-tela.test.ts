/**
 * O BLOCO NA TELA — HUB com subtotal, DRE contábil intacto, investimento depois do lucro.
 *
 * Comando do PO de 21/09/2026, §7 e §11:
 *
 *   > Para NÃO contar duas vezes, a amortização deixa de aparecer em qualquer outro ponto do
 *   > HUB/Análise: ela existe só dentro do bloco. (…) O DRE **não** muda de valor.
 *
 * >>> O QUE ESTE ARQUIVO PRECISA DISTINGUIR <<<
 *
 * Um caso que só conferisse "a linha Compromissos Financeiros aparece" ficaria verde com a
 * implementação que soma o subtotal junto dos membros — a linha estaria lá igual, e o
 * resultado do mês teria mudado sem nada acusar. Por isso todo cenário com bloco afirma
 * TAMBÉM o número do mês, contra a montagem anterior recalculada à mão.
 * (`teste-que-nao-exercita.md`, variante 3: afirmar passagem não é afirmar efeito.)
 */
import { processYearEntries, somaMensalDasLinhas } from '@/utils/dre-ano-entradas'
import {
  buildDreLucroRealPresumido,
  buildDrePresumidoRET,
  buildDreSimplesNacional,
  type AggregatedData,
  type MonthlyValues,
  type DreRow,
} from '@/pages/dfc'
import { LABEL_DO_BLOCO, CATEGORIAS_OFERECIDAS_DO_BLOCO, CATEGORIAS_DO_BLOCO, CATEGORIAS_DE_INVESTIMENTO, ordemNoBloco } from '@/utils/compromissos-financeiros'
import { CASHIER_CATEGORY } from '@/constants/cashier-category'
import { LINHAS_DE_APRESENTACAO_DO_CUSTO, DETALHE_DO_CREDITO_POR_TRIBUTO, ordemDaLinhaDeApresentacao } from '@/utils/custo-produtos-no-dre'
import {
  getExpenseCategoryOptionsForRegime,
  getGroupForCategoryByRegime,
} from '@/constants/expense-categories-by-regime'

// ── O HUB / Extrato de caixa ───────────────────────────────────────────────────────────────

const despesa = (category: string, group: string, amount: number) => ({
  type: 'EXPENSE', due_date: '2026-03-10', paid_date: '2026-03-10',
  amount, expense_group: group, expense_category: category,
})
const VENDA = {
  type: 'INCOME', due_date: '2026-03-20', paid_date: '2026-03-20',
  amount: 100000, expense_category: 'RECEITA_VENDAS', payment_method: 'PIX',
}

/** O cenário do §8: fixas comuns 20.000 + os quatro compromissos. */
const LANCAMENTOS = [
  VENDA,
  despesa('Aluguel', 'DESPESA_FIXA', 20000),
  despesa('Empréstimos', 'DESPESA_FIXA', 1000),
  despesa('Consórcios', 'DESPESA_FIXA', 800),
  despesa('Aplicações', 'DESPESA_FIXA', 200),
  despesa('Amortização de Dívida (principal)', 'AMORTIZACAO', 2500),
  despesa('Obras e benfeitorias', 'INVESTIMENTO', 10000),
]

const r = processYearEntries(LANCAMENTOS, 2026, 'LUCRO_REAL')
const linha = (cat: string) => r.expenseData.find((l) => l.category === cat)

describe('§7 — o bloco dentro de Despesa Fixa', () => {
  it('>>> a AMORTIZAÇÃO aparece UMA vez, e lida como Despesa Fixa <<<', () => {
    const amortizacoes = r.expenseData.filter((l) => l.category === 'Amortização de Dívida (principal)')
    expect(amortizacoes).toHaveLength(1)
    expect(amortizacoes[0].expenseGroup).toBe('DESPESA_FIXA')
    expect(amortizacoes[0].expenseGroup).not.toBe('AMORTIZACAO')
    expect(amortizacoes[0].mar).toBeCloseTo(2500, 2)
  })

  it('o subtotal existe e é a soma dos quatro compromissos', () => {
    expect(linha(LABEL_DO_BLOCO)?.mar).toBeCloseTo(1000 + 800 + 200 + 2500, 2)
  })

  it('>>> e ele se DECLARA subtotal — é o campo que impede a dupla contagem <<<', () => {
    expect((linha(LABEL_DO_BLOCO) as { apenasApresentacao?: boolean }).apenasApresentacao).toBe(true)
    expect((linha('Aluguel') as { apenasApresentacao?: boolean }).apenasApresentacao).toBeFalsy()
  })

  it('o bloco sai junto e em ordem — subtotal antes dos membros', () => {
    const ordem = (c: string) => (linha(c) as { ordem?: number }).ordem as number
    expect(ordem(LABEL_DO_BLOCO)).toBeLessThan(ordem('Amortização de Dívida (principal)'))
    expect(ordem('Amortização de Dívida (principal)')).toBeLessThan(ordem('Empréstimos'))
    expect((linha('Aluguel') as { ordem?: number }).ordem).toBeUndefined()
  })
})

describe('>>> §11 — o resultado do mês NÃO muda: é aqui que a dupla contagem fica vermelha <<<', () => {
  it('saída de março = 34.500,00, a soma dos lançamentos, e não 39.000,00', () => {
    const saidas = somaMensalDasLinhas(r.expenseData)
    // 20.000 + 1.000 + 800 + 200 + 2.500 + 10.000 (investimento, que é saída de caixa)
    expect(saidas.mar).toBeCloseTo(34500, 10)
    // Com o subtotal somado junto seriam 34.500 + 4.500 = 39.000. O campo impede.
    expect(saidas.mar).not.toBeCloseTo(39000, 2)
  })

  it('>>> somar TODAS as linhas devolve 39.000,00 — a dupla contagem, medida <<<', () => {
    const somaCega = r.expenseData.reduce((a, l) => a + (l.mar || 0), 0)
    expect(somaCega).toBeCloseTo(39000, 2)
  })

  it('o resultado do mês é entradas − saídas', () => {
    const entradas = somaMensalDasLinhas(r.incomeData)
    expect(entradas.mar - somaMensalDasLinhas(r.expenseData).mar).toBeCloseTo(65500, 10)
  })

  it('>>> sem NENHUM compromisso não há subtotal — R$ 0,00 afirmaria que não há dívida <<<', () => {
    const semBloco = processYearEntries([VENDA, despesa('Aluguel', 'DESPESA_FIXA', 20000)], 2026, 'LUCRO_REAL')
    expect(semBloco.expenseData.find((l) => l.category === LABEL_DO_BLOCO)).toBeUndefined()
    expect(somaMensalDasLinhas(semBloco.expenseData).mar).toBeCloseTo(20000, 10)
  })
})

// ── A Análise Financeira contábil (`pages/dfc`) ────────────────────────────────────────────

const ZERO: MonthlyValues = {
  jan: 0, feb: 0, mar: 0, apr: 0, may: 0, jun: 0,
  jul: 0, aug: 0, sep: 0, oct: 0, nov: 0, dec: 0,
}
const mes = (v: number): MonthlyValues => ({ ...ZERO, jan: v })

const AMORTIZACAO = 2500
const INVESTIMENTO = 10000
/*
  As categorias do bloco entraram no fixture em 02/10/2026, com valor DIFERENTE de zero de
  propósito: com zero a linha de Compromissos Financeiros carregaria só a amortização, e os
  casos abaixo não distinguiriam a soma das cinco da subcategoria sozinha
  (`teste-que-nao-exercita.md`, variante 2).
*/
const COMPROMISSO = 4000

const base = (): AggregatedData => ({
  receitaBruta: mes(100000),
  deducaoReceita: { ...ZERO },
  repasse: { ...ZERO },
  investimento: mes(INVESTIMENTO),
  imposto: mes(5000),
  impostoPorDentro: mes(3000),
  maoDeObraProdutiva: mes(1100),
  maoDeObraAdministrativa: mes(1200),
  maoDeObra: { ...ZERO },
  // O compromisso SAI da fixa, não se soma a ela — no pipeline real `aggregateEntries` o
  // roteia para o balde próprio e a fixa encolhe pelo mesmo valor (§0).
  despesaFixa: mes(20000 - COMPROMISSO),
  despesaVariavel: mes(1400),
  despesaFinanceira: mes(500),
  comissoes: mes(1600),
  reservaTecnica: { ...ZERO },
  custoProduto: mes(20000),
  impostosRecuperaveisCusto: { ...ZERO },
  atividadesTerceirizadas: { ...ZERO },
  // A amortização entra pelo balde do BLOCO: o `case 'AMORTIZACAO'` soma lá desde 02/10/2026,
  // e o balde próprio deixou de existir.
  compromissosFinanceiros: mes(COMPROMISSO + AMORTIZACAO),
  compromissoPorCategoria: { 'Empréstimos': mes(1500), 'Consórcios': mes(2500) },
})
const semInvestimento = (): AggregatedData => ({ ...base(), investimento: { ...ZERO } })

const VARIANTES: { nome: string; build: (a: AggregatedData) => DreRow[] }[] = [
  { nome: 'Lucro Real', build: (a) => buildDreLucroRealPresumido(a, 'RESALE', 'LUCRO_REAL') },
  { nome: 'Presumido RET', build: (a) => buildDrePresumidoRET(a) },
  { nome: 'Simples Nacional', build: (a) => buildDreSimplesNacional(a, 'RESALE') },
]

describe.each(VARIANTES)('$nome — o DRE contábil NÃO muda de valor', ({ build }) => {
  const rows = build(base())
  const pega = (key: string) => rows.find((l) => l.key === key)

  /*
    ═══ ÂNCORAS REESCRITAS EM 02/10/2026 — §B e §C do adendo ═══

    A linha era `'amortizacao'`, com o rótulo "(-) Amortização de Dívida (principal)". Amortização
    é UMA das cinco subcategorias e não dá nome à linha: ela passou a ser a da CATEGORIA,
    `'compromissos_financeiros'`, e o valor soma o grupo `AMORTIZACAO` com as categorias do bloco.

    O CRITÉRIO É O MESMO — a linha vem depois do resultado e ANTES do Lucro Líquido, e a nota
    diz ao usuário que aquilo já entrou no preço. Mudaram a chave, o rótulo e o valor.
  */
  it('>>> a linha da CATEGORIA vem depois do resultado, e soma as duas origens <<<', () => {
    expect(pega('compromissos_financeiros')?.values.jan).toBeCloseTo(AMORTIZACAO + COMPROMISSO, 2)
    const iComp = rows.findIndex((l) => l.key === 'compromissos_financeiros')
    const iLucro = rows.findIndex((l) => l.key === 'lucro_liquido')
    expect(iComp).toBeGreaterThanOrEqual(0)
    expect(iComp).toBeLessThan(iLucro)
    // E a subcategoria NÃO dá mais nome a uma linha própria.
    expect(pega('amortizacao')).toBeUndefined()
  })

  it('>>> e a nota está na linha: o usuário precisa saber que ela JÁ entrou no preço <<<', () => {
    expect(pega('compromissos_financeiros')?.label).toContain('já considerados na formação do preço')
    expect(pega('compromissos_financeiros')?.label).toContain('Compromissos Financeiros')
  })

  it('>>> §D — a linha diz que ali é o PRINCIPAL, e que os juros estão na de cima <<<', () => {
    // "Despesas Financeiras" e "Compromissos Financeiros" ficam coladas e são coisas diferentes.
    // Sem o texto de apoio, o rótulo sozinho não distingue juros de principal.
    const ajuda = (pega('compromissos_financeiros') as { ajuda?: string }).ajuda ?? ''
    expect(ajuda).toContain('PRINCIPAL')
    expect(ajuda).toContain('Despesas Financeiras')
    const iJuros = rows.findIndex((l) => l.key === 'desp_financeira')
    const iPrincipal = rows.findIndex((l) => l.key === 'compromissos_financeiros')
    expect(iJuros).toBeLessThan(iPrincipal)
  })

  it('>>> o LUCRO LÍQUIDO é o mesmo com e sem investimento — ele vem DEPOIS <<<', () => {
    const comInv = build(base()).find((l) => l.key === 'lucro_liquido')?.values.jan
    const semInv = build(semInvestimento()).find((l) => l.key === 'lucro_liquido')?.values.jan
    expect(comInv).toBeCloseTo(semInv as number, 10)
  })

  it('o investimento tem linha própria, depois do lucro, e a sobra desconta dele', () => {
    const iInv = rows.findIndex((l) => l.key === 'investimento')
    const iLucro = rows.findIndex((l) => l.key === 'lucro_liquido')
    expect(iInv).toBeGreaterThan(iLucro)
    expect(pega('investimento')?.values.jan).toBeCloseTo(INVESTIMENTO, 2)
    /*
      A âncora VOLTOU ao Lucro Líquido em 02/10/2026, e isso é o §C do adendo corrigindo o §5
      do comando: a linha de Compromissos Financeiros entra ANTES do Lucro Líquido, no lugar
      onde a amortização já estava, e NÃO depois dele. Não existe mais "Lucro Livre".
    */
    expect(pega('sobra_apos_investimento')?.values.jan)
      .toBeCloseTo((pega('lucro_liquido')?.values.jan as number) - INVESTIMENTO, 2)
    expect(pega('lucro_livre')).toBeUndefined()
  })

  it('>>> sem o `case` no switch o valor SUMIRIA: a linha carrega o número, não zero <<<', () => {
    expect(pega('investimento')?.values.jan).not.toBe(0)
  })
})

// ── O SELETOR DE LANÇAMENTO ────────────────────────────────────────────────────────────────

const REGIMES = ['LUCRO_REAL', 'LUCRO_PRESUMIDO', 'SIMPLES_NACIONAL', 'MEI', 'SIMPLES_HIBRIDO', 'PRESUMIDO_RET', null]

describe.each(REGIMES)('§7 — o seletor no regime %s', (regime) => {
  const grupos = getExpenseCategoryOptionsForRegime(regime)
  const rotulos = grupos.map((g) => g.label)

  it('>>> o bloco vem LOGO DEPOIS de Despesas Fixas, e os Investimentos abaixo dele <<<', () => {
    const iFixas = rotulos.indexOf('── Despesas Fixas ──')
    expect(iFixas).toBeGreaterThanOrEqual(0)
    expect(rotulos[iFixas + 1]).toBe(`── ${LABEL_DO_BLOCO} ──`)
    expect(rotulos[iFixas + 2]).toBe('── Investimentos ──')
  })

  it('as CINCO do bloco estão lá, e só elas — os legados não são mais oferecidos', () => {
    const doBloco = grupos.find((g) => g.label === `── ${LABEL_DO_BLOCO} ──`)!.options.map((o) => o.value)
    expect(doBloco).toEqual(CATEGORIAS_OFERECIDAS_DO_BLOCO.map((c) => c.category))
    expect(doBloco).not.toContain('Aplicações / Consórcios')
    expect(doBloco).not.toContain('Empréstimos / Financiamentos')
  })

  it('as cinco de investimento estão no optgroup próprio', () => {
    const inv = grupos.find((g) => g.label === '── Investimentos ──')!.options.map((o) => o.value)
    expect(inv).toEqual(CATEGORIAS_DE_INVESTIMENTO.map((c) => c.category))
  })

  it('>>> a AMORTIZAÇÃO não é mais escolhível em DOIS lugares <<<', () => {
    expect(rotulos).not.toContain('── Amortização ──')
    const ondeAparece = grupos.filter((g) =>
      g.options.some((o) => o.value === 'Amortização de Dívida (principal)'))
    expect(ondeAparece).toHaveLength(1)
    expect(ondeAparece[0].label).toBe(`── ${LABEL_DO_BLOCO} ──`)
  })

  /*
    ═══ ÂNCORAS REESCRITAS EM 02/10/2026 — o grupo das cinco é UM SÓ ═══

    Elas afirmavam `DESPESA_FIXA` nos quatro e `AMORTIZACAO` na amortização: dois grupos para o
    que é uma categoria só. Era o estado certo sob a regra da época — não havia grupo próprio.

    O CRITÉRIO NÃO MUDOU: todo rótulo do bloco, inclusive os dois legados, RESOLVE para um grupo
    (devolver `undefined` faria o lançamento antigo cair no balde do desconhecido, sem erro —
    medido em 21/09/2026: R$ 108.353,95). Mudou QUAL grupo, e agora é o mesmo para todos.
  */
  it('>>> todo rótulo do bloco resolve para o grupo ÚNICO — inclusive os dois legados <<<', () => {
    for (const rotulo of [
      'Amortização de Dívida (principal)', 'Financiamentos', 'Empréstimos', 'Consórcios',
      'Aplicações', 'Aplicações / Consórcios', 'Empréstimos / Financiamentos',
    ]) {
      expect(getGroupForCategoryByRegime(regime, rotulo)).toBe('COMPROMISSOS_FINANCEIROS')
    }
  })

  it('>>> e NENHUM deles resolve para `DESPESA_FIXA` nem para `AMORTIZACAO` <<<', () => {
    // O discriminante: sem esta metade, um rótulo que voltasse a `DESPESA_FIXA` passaria verde
    // se o caso acima só conferisse os outros seis.
    for (const rotulo of [
      'Amortização de Dívida (principal)', 'Financiamentos', 'Empréstimos', 'Consórcios',
      'Aplicações', 'Aplicações / Consórcios', 'Empréstimos / Financiamentos',
    ]) {
      expect(getGroupForCategoryByRegime(regime, rotulo)).not.toBe('DESPESA_FIXA')
      expect(getGroupForCategoryByRegime(regime, rotulo)).not.toBe('AMORTIZACAO')
    }
    // E o Aluguel, que É despesa fixa, continua sendo — o grupo novo não capturou vizinhos.
    expect(getGroupForCategoryByRegime(regime, 'Aluguel')).toBe('DESPESA_FIXA')
  })

  it('>>> as DUAS declarações do grupo concordam, categoria a categoria <<<', () => {
    /*
      O grupo das cinco é declarado em DOIS lugares, e até 02/10/2026 ninguém afirmava que eles
      batiam: `CATEGORIAS_DO_BLOCO` (lido por `getGroupForCategoryByRegime`, na gravação por
      regime) e `CASHIER_CATEGORY.EXPENSE[...].group` (lido por `getDefaultGroupForCategory`,
      no outro caminho de gravação).

      Mudar só uma deixaria o outro caminho ainda escrevendo `DESPESA_FIXA` no banco —
      `copia-divergente.md` no ponto exato que decide o que vai gravado. Era assim que a
      correção poderia parecer feita e não estar.
    */
    const porChave = Object.values(CASHIER_CATEGORY.EXPENSE) as { value: string; group?: string }[]

    /*
      >>> AS DUAS LISTAS NÃO COBREM O MESMO CONJUNTO, E ISSO FICA MEDIDO <<<

      'Empréstimos' existe só em `CATEGORIAS_DO_BLOCO`: em `CASHIER_CATEGORY` a chave
      `EMPRESTIMOS` tem o rótulo LEGADO 'Empréstimos / Financiamentos'. A primeira versão deste
      caso exigia cobertura dos dois lados e ficou vermelha nele — e estava certa em olhar.

      A ausência fica REGISTRADA como lista, não escondida num `if`: se outra categoria sair da
      segunda lista, o caso quebra em vez de a divergência passar. E quem for criar a chave
      `EMPRESTIMOS_SOZINHO` um dia tira o rótulo daqui.
    */
    const SO_NA_FONTE_UNICA = ['Empréstimos']

    for (const c of CATEGORIAS_DO_BLOCO) {
      const naOutraLista = porChave.filter((x) => x.value === c.category)
      if (SO_NA_FONTE_UNICA.includes(c.category)) {
        expect(naOutraLista).toEqual([])
        continue
      }
      expect(naOutraLista.length).toBeGreaterThan(0)
      for (const x of naOutraLista) expect(x.group).toBe(c.group)
    }

    // E o discriminante: a segunda lista não deixou NENHUMA das chaves do bloco com o grupo
    // antigo. Sem isto, uma chave esquecida lá passaria porque o laço acima não a visitaria.
    for (const chave of ['AMORTIZACAO', 'FINANCIAMENTOS', 'EMPRESTIMOS', 'CONSORCIOS', 'APLICACOES', 'APLICACOES_CONSORCIOS']) {
      const e = (CASHIER_CATEGORY.EXPENSE as Record<string, { group?: string }>)[chave]
      expect(e?.group).toBe('COMPROMISSOS_FINANCEIROS')
    }
  })

  it('o investimento grava o grupo próprio, não `LUCRO`', () => {
    expect(getGroupForCategoryByRegime(regime, 'Obras e benfeitorias')).toBe('INVESTIMENTO')
  })
})

describe('A categoria ANTIGA de investimento continua onde está', () => {
  /**
   * >>> UMA OBSERVAÇÃO QUE NÃO É DESTA RODADA, E ESTÁ AQUI PARA NÃO SE PERDER <<<
   *
   * `'INVESTIMENTOS (Máquinas, Equipamentos, Expansão e Melhorias)'` só existe em `LR_LUCRO`,
   * consultada nos regimes de Lucro Real e Presumido. Em Simples, MEI e na lista base,
   * `getGroupForCategoryByRegime` devolve `undefined` para ela — um lançamento com esse rótulo
   * não teria grupo RESOLVÍVEL ali.
   *
   * Hoje é inócuo por duas razões, as duas MEDIDAS em 21/09/2026: o `expense_group` já está
   * GRAVADO na linha e o resolvedor só é chamado ao lançar; e as 16 linhas com esse rótulo
   * (R$ 127.548,00) são todas de um tenant em LUCRO_REAL, onde a lista é consultada.
   *
   * Fica registrado, não corrigido: mexer nisso é reclassificar o passado, que é decisão do
   * usuário e não desta rodada (`fato-vs-referencia.md`).
   */
  it.each(['LUCRO_REAL', 'LUCRO_PRESUMIDO', 'SIMPLES_HIBRIDO', 'PRESUMIDO_RET'])(
    'em %s ela continua resolvendo `LUCRO` — nada foi reclassificado', (regime) => {
      expect(getGroupForCategoryByRegime(regime, 'INVESTIMENTOS (Máquinas, Equipamentos, Expansão e Melhorias)')).toBe('LUCRO')
    })

  it.each(['SIMPLES_NACIONAL', 'MEI'])('em %s ela NÃO resolve — e já não resolvia antes', (regime) => {
    expect(getGroupForCategoryByRegime(regime, 'INVESTIMENTOS (Máquinas, Equipamentos, Expansão e Melhorias)')).toBeUndefined()
  })
})

describe('>>> OS DOIS BLOCOS NA MESMA TELA — é aqui que o rebase do #68 com o #69 se prova <<<', () => {
  /**
   * O #68 pôs um bloco de três linhas em CUSTO DOS PRODUTOS (bruto · dedução · líquido) e o
   * #69 pôs um bloco em DESPESA FIXA (subtotal · membros). Os dois usam `apenasApresentacao`
   * e `ordem`, e os dois são filtrados da mesma soma.
   *
   * O risco do merge não é nenhum deles sozinho: é um APAGAR o outro. Por isso este bloco
   * afirma os dois JUNTOS, no mesmo `processYearEntries`, e afirma o número do mês.
   */
  const COMPRA = {
    type: 'EXPENSE', due_date: '2026-03-05', paid_date: '2026-03-05',
    amount: 1000, expense_group: 'CUSTO_PRODUTOS', expense_category: 'Fornecedores',
    valor_icms: 180, valor_pis: 16.5, valor_cofins: 76,
    valor_ipi: 50, valor_cbs: 88, valor_ibs: 1,
  }
  const CREDITO = 180 + 16.5 + 76 + 50 + 88 + 1  // 411,50

  const dois = processYearEntries([...LANCAMENTOS, COMPRA], 2026, 'LUCRO_REAL')
  const l = (cat: string) => dois.expenseData.find((x) => x.category === cat)

  it('o bloco do CUSTO existe, com os seus três números', () => {
    expect(l('Fornecedores')?.mar).toBeCloseTo(1000, 2)
    expect(l(LINHAS_DE_APRESENTACAO_DO_CUSTO.creditos.label)?.mar).toBeCloseTo(-CREDITO, 2)
    expect(l(LINHAS_DE_APRESENTACAO_DO_CUSTO.liquido.label)?.mar).toBeCloseTo(1000 - CREDITO, 2)
  })

  it('e o bloco dos COMPROMISSOS continua inteiro, ao lado dele', () => {
    expect(l(LABEL_DO_BLOCO)?.mar).toBeCloseTo(1000 + 800 + 200 + 2500, 2)
    expect(l('Amortização de Dívida (principal)')?.expenseGroup).toBe('DESPESA_FIXA')
  })

  it('>>> TODAS as linhas de apresentação se declaram, e nenhuma entra no mês <<<', () => {
    // O bloco do Custo cresceu em 21/09/2026 (§2): líquido, bruto, créditos e o detalhe por
    // tributo. A lista é derivada, não escrita à mão — assim ela acompanha o bloco, e o que
    // o caso afirma continua sendo o que importa: quem se declara não entra no mês.
    const apresentacao = dois.expenseData.filter((x) => x.apenasApresentacao).map((x) => x.category)
    expect(apresentacao.sort()).toEqual([
      ...Object.values(LINHAS_DE_APRESENTACAO_DO_CUSTO).map((l) => l.label),
      ...Object.values(DETALHE_DO_CREDITO_POR_TRIBUTO).map((d) => d.label),
      LABEL_DO_BLOCO,
    ].sort())
  })

  it('>>> o resultado do mês é 35.500,00 — os 34.500,00 de antes mais a compra <<<', () => {
    const saidas = somaMensalDasLinhas(dois.expenseData)
    expect(saidas.mar).toBeCloseTo(34500 + 1000, 10)
    // Somar as quatro linhas de apresentação junto daria 35.500 − 411,50 + 588,50 + 4.500.
    const somaCega = dois.expenseData.reduce((a, x) => a + (x.mar || 0), 0)
    expect(somaCega).not.toBeCloseTo(35500, 2)
  })

  it('>>> e as ORDENS não colidem: cada categoria pertence a um bloco só <<<', () => {
    for (const cat of dois.expenseData.map((x) => x.category)) {
      const noCusto = ordemDaLinhaDeApresentacao(cat)
      const noFixa = ordemNoBloco(cat)
      expect(noCusto != null && noFixa != null).toBe(false)
    }
  })
})
