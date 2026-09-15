/**
 * Correção 6 — acréscimos saem do produto e vão para o orçamento, com rateio.
 *
 * Regra: `.claude/rules/cascata-lucro-real.md` R10 a R13. Relatório "Motor RRO — Lucro Real",
 * seção 5.3. ORÁCULOS: planilha "Cascata Lucro Real", aba "Orçamento", linhas 46 a 59.
 *
 * Os números esperados dos casos 1 a 3 vêm da PLANILHA, não do código. São a única asserção
 * deste arquivo cuja origem é externa ao repositório, e por isso a única capaz de pegar um
 * erro sistemático que módulo e teste cometessem juntos
 * (`.claude/rules/teste-que-nao-exercita.md`).
 */

import {
  allocateAccessories,
  legacyAccessoriesTotal,
  resolveAccessoriesSource,
  checkInheritedAllocation,
  resolveItemFicha,
  roundAllocationsToCents,
  DEFAULT_ALLOCATION_CRITERIA,
} from '@/utils/budget-accessories'
import { calculatePricing, type ResolvedTaxBreakdown } from '@/utils/pricing-engine'

/**
 * Reproduz a ficha tributária de cada produto da aba "Orçamento", linhas 5 a 20, passando
 * pelo MOTOR — não por números copiados. Se o motor divergir da planilha, os oráculos caem.
 */
function fichaDaPlanilha(icms: number, fatorReducao: number, custo: number) {
  const r = calculatePricing({
    calcType: 'INDUSTRIALIZACAO',
    totalItemsCost: custo,
    yieldQuantity: 1,
    laborCostMonthly: 0,
    numProductiveEmployees: 0,
    monthlyWorkloadMinutes: 0,
    productWorkloadMinutes: 0,
    // Categorias da planilha, linhas 24 a 30 (coluna C, % Original).
    structurePct: 0.0792 + 0.0913 + 0.0554 + 0.0033,
    rtReservePct: 0.01,
    commissionPct: 0.05,
    profitPct: 0.08,
    // IRPJ 15% e CSLL 9% sobre o lucro de 8% (linhas 31 e 32).
    profitTaxPct: 0.15 * 0.08 + 0.09 * 0.08,
    taxPct: icms + 0.0925,
    taxBreakdown: {
      icmsPct: icms,
      pisCofinsPct: 0.0925,
      ibs: { rate: 0.01, reductionFactor: fatorReducao, baseCode: 4 },
      cbs: { rate: 0.088, reductionFactor: fatorReducao, baseCode: 4 },
    },
  })
  return r
}

describe('correção 6 — acréscimos no orçamento, com rateio', () => {
  // Produto 1: ICMS 17%, sem redutor, custo 79.272,61 (planilha E38).
  // Produto 2: ICMS 12%, redutor 60%, custo 33.973,97 (planilha F38).
  const p1 = fichaDaPlanilha(0.17, 0, 79272.61)
  const p2 = fichaDaPlanilha(0.12, 0.6, 33973.97)

  describe('0. a ficha tributária de cada produto bate com a planilha (linhas 15 a 41)', () => {
    it('coeficiente c: 6,77874% no Produto 1 e 3,02297% no Produto 2 — INDIVIDUAL, não global', () => {
      expect(p1.taxBreakdownResolved!.externalOpsCoefficient).toBeCloseTo(0.0677873794119943, 12)
      expect(p2.taxBreakdownResolved!.externalOpsCoefficient).toBeCloseTo(0.0302297276679407, 12)
    })

    it('margem de contribuição: 32,5363% e 39,4698% — o redutor do IVA DUAL a move', () => {
      expect(p1.coefficient).toBeCloseTo(0.325363491638098, 10)
      expect(p2.coefficient).toBeCloseTo(0.39469813940665, 10)
    })

    it('preço do produto (P) e total do produto batem com as linhas 39 e 41', () => {
      expect(p1.priceUnit).toBeCloseTo(243643.22, 1)
      expect(p2.priceUnit).toBeCloseTo(86075.83, 1)
      expect(p1.taxBreakdownResolved!.totalGeral).toBeCloseTo(261360.14, 1)
      expect(p2.taxBreakdownResolved!.totalGeral).toBeCloseTo(88758.99, 1)
    })

    it('ICMS efetivo sobre P e PIS/COFINS efetivo sobre P batem com as linhas 19 e 20', () => {
      expect(p1.taxBreakdownResolved!.icmsPctEffective).toBeCloseTo(0.182361830601232, 12)
      expect(p1.taxBreakdownResolved!.pisCofinsPctEffective).toBeCloseTo(0.0756315306693861, 12)
      expect(p2.taxBreakdownResolved!.icmsPctEffective).toBeCloseTo(0.123740646030971, 12)
      expect(p2.taxBreakdownResolved!.pisCofinsPctEffective).toBeCloseTo(0.0810539902421352, 12)
    })
  })

  const alvos = () => [
    { id: 'p1', totalValue: p1.taxBreakdownResolved!.totalGeral, isManual: false, resolved: p1.taxBreakdownResolved! },
    { id: 'p2', totalValue: p2.taxBreakdownResolved!.totalGeral, isManual: false, resolved: p2.taxBreakdownResolved! },
    { id: 'manual', totalValue: 8000, isManual: true },
  ]

  describe('1. MONTANTE A CARREGAR — R10: produtos precificados MAIS itens manuais', () => {
    it('é 358.119,13, e inclui o item manual: sem ele o rateio do frete seria outro', () => {
      const r = allocateAccessories({
        freightValue: 3000, insuranceValue: 500, accessoryExpensesValue: 0,
        criteria: 'VALOR', targets: alvos(),
      })
      expect(r.montanteACarregar).toBeCloseTo(358119.13, 1)

      // Sem o item manual, a base cai e as parcelas dos produtos SOBEM — é o que prova que
      // o item manual está mesmo na base, e não só listado ao lado dela.
      const semManual = allocateAccessories({
        freightValue: 3000, insuranceValue: 500, accessoryExpensesValue: 0,
        criteria: 'VALOR', targets: alvos().filter((t) => !t.isManual),
      })
      expect(semManual.montanteACarregar).toBeCloseTo(350119.13, 1)
      expect(semManual.perTarget[0].allocated).toBeGreaterThan(r.perTarget[0].allocated)
    })
  })

  describe('2. RATEIO POR VALOR — R12, planilha linhas 50 a 53', () => {
    const r = allocateAccessories({
      freightValue: 3000, insuranceValue: 500, accessoryExpensesValue: 0,
      criteria: 'VALOR', targets: alvos(),
    })

    it('as parcelas batem com a planilha: 2.554,35 · 867,47 · 78,19', () => {
      expect(r.perTarget[0].allocated).toBeCloseTo(2554.35, 1)
      expect(r.perTarget[1].allocated).toBeCloseTo(867.47, 1)
      expect(r.perTarget[2].allocated).toBeCloseTo(78.19, 1)
    })

    it('teste 14 do checklist — Σ parcelas = valor original, EXATO', () => {
      expect(r.totalAllocated).toBeCloseTo(3500, 10)
      expect(r.totalOriginal).toBe(3500)
    })

    it('o total com tributos bate: 3.692,81 · 1.124,88 · 78,19 — e soma 4.895,87', () => {
      expect(r.perTarget[0].total).toBeCloseTo(3692.81, 1)
      expect(r.perTarget[1].total).toBeCloseTo(1124.88, 1)
      expect(r.perTarget[2].total).toBeCloseTo(78.19, 1)
      expect(r.totalComTributos).toBeCloseTo(4895.87, 1)
    })

    it('a MC dos acréscimos é só tributo — 74,2007% e 79,5205% (planilha linha 54)', () => {
      // R13: nem despesa, nem comissão, nem RT, nem lucro, nem IRPJ, nem CSLL. Se a MC do
      // produto entrasse aqui, o número seria 32,54% — menos da metade.
      expect(r.perTarget[0].mcAccessories).toBeCloseTo(0.742006638729382, 10)
      expect(r.perTarget[1].mcAccessories).toBeCloseTo(0.795205363726894, 10)
      expect(r.perTarget[0].mcAccessories).not.toBeCloseTo(p1.coefficient, 3)
    })
  })

  describe('3. ITEM MANUAL — a parcela NÃO sofre gross-up (R12, planilha linha 57)', () => {
    const r = allocateAccessories({
      freightValue: 3000, insuranceValue: 500, accessoryExpensesValue: 0,
      criteria: 'VALOR', targets: alvos(),
    })
    const manual = r.perTarget[2]
    const produto = r.perTarget[0]

    it('entra R$ 78,19 e sai R$ 78,19 — preço e total IGUAIS à parcela', () => {
      expect(manual.allocated).toBeCloseTo(78.19, 1)
      expect(manual.price).toBe(manual.allocated)
      expect(manual.total).toBe(manual.allocated)
      expect(manual.mcAccessories).toBeNull()
    })

    it('e o produto ao lado SOFRE gross-up — é o contraste que prova a regra', () => {
      // Sem este segundo caso, "total = parcela" no manual poderia ser coincidência de um
      // gross-up que não roda para ninguém.
      expect(produto.total).toBeGreaterThan(produto.allocated)
      expect(produto.total / produto.allocated).toBeCloseTo(
        1 / (produto.mcAccessories! * (1 - p1.taxBreakdownResolved!.externalOpsCoefficient)),
        9,
      )
    })
  })

  describe('4. OS QUATRO CRITÉRIOS — R12', () => {
    const comGrandezas = () => [
      { id: 'p1', totalValue: 300, isManual: false, resolved: p1.taxBreakdownResolved!, weight: 1, volume: 9, manualWeight: 7 },
      { id: 'p2', totalValue: 100, isManual: false, resolved: p2.taxBreakdownResolved!, weight: 3, volume: 1, manualWeight: 3 },
    ]
    const ratear = (criteria: 'VALOR' | 'PESO' | 'VOLUME' | 'MANUAL') =>
      allocateAccessories({ freightValue: 1000, insuranceValue: 0, accessoryExpensesValue: 0, criteria, targets: comGrandezas() })

    it('os quatro dão parcelas DIFERENTES — as grandezas foram escolhidas para divergir', () => {
      // Valor 300:100 → 750/250. Peso 1:3 → 250/750. Volume 9:1 → 900/100. Manual 7:3 → 700/300.
      expect(ratear('VALOR').perTarget[0].allocated).toBeCloseTo(750, 9)
      expect(ratear('PESO').perTarget[0].allocated).toBeCloseTo(250, 9)
      expect(ratear('VOLUME').perTarget[0].allocated).toBeCloseTo(900, 9)
      expect(ratear('MANUAL').perTarget[0].allocated).toBeCloseTo(700, 9)
    })

    it('os quatro preservam Σ parcelas = valor original', () => {
      for (const c of ['VALOR', 'PESO', 'VOLUME', 'MANUAL'] as const) {
        expect(ratear(c).totalAllocated).toBeCloseTo(1000, 9)
      }
    })

    it('o MONTANTE A CARREGAR é o mesmo nos quatro — ele é valor, nunca quilo nem litro', () => {
      for (const c of ['VALOR', 'PESO', 'VOLUME', 'MANUAL'] as const) {
        expect(ratear(c).montanteACarregar).toBe(400)
      }
    })

    it('critério sem grandeza informada é ERRO — não rateio igualitário inventado', () => {
      const r = allocateAccessories({
        freightValue: 1000, insuranceValue: 0, accessoryExpensesValue: 0,
        criteria: 'PESO',
        targets: [
          { id: 'p1', totalValue: 300, isManual: false, resolved: p1.taxBreakdownResolved! },
          { id: 'p2', totalValue: 100, isManual: false, resolved: p2.taxBreakdownResolved! },
        ],
      })
      expect(r.errors.join(' ')).toContain('critério PESO escolhido')
      expect(r.perTarget).toEqual([])
    })
  })

  describe('5. A PARCELA HERDA AS ALÍQUOTAS DO PRODUTO QUE A RECEBEU (R12)', () => {
    it('dois produtos com fichas diferentes recebem parcelas iguais e devolvem totais DIFERENTES', () => {
      const r = allocateAccessories({
        freightValue: 1000, insuranceValue: 0, accessoryExpensesValue: 0,
        criteria: 'MANUAL',
        targets: [
          { id: 'p1', totalValue: 1, isManual: false, resolved: p1.taxBreakdownResolved!, manualWeight: 1 },
          { id: 'p2', totalValue: 1, isManual: false, resolved: p2.taxBreakdownResolved!, manualWeight: 1 },
        ],
      })
      // Mesma parcela: R$ 500 cada.
      expect(r.perTarget[0].allocated).toBeCloseTo(500, 9)
      expect(r.perTarget[1].allocated).toBeCloseTo(500, 9)
      // Totais diferentes, porque as alíquotas herdadas são diferentes. Se o módulo
      // inventasse uma alíquota única para o frete, os dois sairiam iguais.
      expect(r.perTarget[0].total).not.toBeCloseTo(r.perTarget[1].total, 2)
    })

    it('produto sem a ficha da construção é ERRO — sem ela não há alíquota a herdar', () => {
      const r = allocateAccessories({
        freightValue: 1000, insuranceValue: 0, accessoryExpensesValue: 0,
        criteria: 'VALOR',
        targets: [{ id: 'p1', totalValue: 100, isManual: false }],
      })
      expect(r.errors.join(' ')).toContain('não trouxe o que a construção resolveu')
    })
  })

  describe('6. ARREDONDAMENTO — nem perde nem inventa dinheiro', () => {
    it('três partes de R$ 100,00 em terços somam exatamente R$ 100,00', () => {
      const bruto = [100 / 3, 100 / 3, 100 / 3]
      const cents = roundAllocationsToCents(bruto, 100)
      expect(cents.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 10)
      // E o resíduo de um centavo caiu numa parcela só, não foi diluído.
      expect(cents.filter((c) => c === 33.34).length).toBe(1)
    })

    it('o resíduo vai para a MAIOR parcela', () => {
      const cents = roundAllocationsToCents([0.005, 10.004, 0.001], 10.01)
      expect(cents.reduce((a, b) => a + b, 0)).toBeCloseTo(10.01, 10)
      expect(cents[1]).toBeGreaterThan(cents[0])
      expect(cents[1]).toBeGreaterThan(cents[2])
    })
  })

  describe('7. R11 — de onde vêm os acréscimos, SEM retroatividade', () => {
    it('documento sem nada cotado cai no CADASTRO: o orçamento antigo não muda de preço', () => {
      // É o estado de todo orçamento existente, e também o estado enquanto a migração não
      // estiver aplicada — as colunas nem chegam ao objeto.
      expect(resolveAccessoriesSource(null).source).toBe('CADASTRO')
      expect(resolveAccessoriesSource({}).source).toBe('CADASTRO')
      expect(resolveAccessoriesSource({ freightValue: null, insuranceValue: null, accessoryExpensesValue: null }).source)
        .toBe('CADASTRO')
    })

    it('documento com QUALQUER acréscimo cotado manda, e o cadastro é ignorado', () => {
      const d = resolveAccessoriesSource({ freightValue: 3000 })
      expect(d.source).toBe('DOCUMENTO')
      expect(d.document!.freightValue).toBe(3000)
      // Os não cotados viram zero DENTRO do documento — o documento inteiro passou a mandar.
      expect(d.document!.insuranceValue).toBe(0)
      expect(d.document!.criteria).toBe(DEFAULT_ALLOCATION_CRITERIA)
    })

    it('ZERO EXPLÍCITO não é NULL: "cotei e não há frete" também ignora o cadastro', () => {
      // O contraste é a asserção. Com `null` o cadastro prevalece; com `0` não — e somar o
      // frete do cadastro depois de o usuário ter dito que não há contrariaria o que ele
      // afirmou. Se o módulo tratasse os dois como a mesma coisa, os dois casos dariam
      // 'CADASTRO' e nada distinguiria.
      expect(resolveAccessoriesSource({ freightValue: null }).source).toBe('CADASTRO')
      expect(resolveAccessoriesSource({ freightValue: 0 }).source).toBe('DOCUMENTO')
    })

    it('o critério do documento vence o padrão', () => {
      expect(resolveAccessoriesSource({ freightValue: 100, criteria: 'PESO' }).document!.criteria).toBe('PESO')
    })

    it('o caminho do CADASTRO segue somando por unidade × quantidade, como hoje', () => {
      expect(legacyAccessoriesTotal([
        { id: 'a', freightUnit: 10, insuranceUnit: 2, accessoryUnit: 0, quantity: 3 },
        { id: 'b', freightUnit: 0, insuranceUnit: 0, accessoryUnit: 5, quantity: 2 },
      ])).toBe(46)
    })
  })

  describe('8. FICHA TRIBUTÁRIA INDIVIDUAL do item no documento (relatório 5.1)', () => {
    it('reproduz a ficha dos dois produtos da planilha — e o `c` é POR PRODUTO, não global', () => {
      const f1 = resolveItemFicha({
        segment: 'INDUSTRIALIZACAO',
        rates: { icmsPct: 0.17, pisCofinsPct: 0.0925, ibsPct: 0.01, cbsPct: 0.088, ivaDualReductionFactor: 0 },
      })
      const f2 = resolveItemFicha({
        segment: 'INDUSTRIALIZACAO',
        rates: { icmsPct: 0.12, pisCofinsPct: 0.0925, ibsPct: 0.01, cbsPct: 0.088, ivaDualReductionFactor: 0.6 },
      })

      // Planilha aba "Orçamento", linhas 18 a 20.
      expect(f1.ficha!.externalOpsCoefficient).toBeCloseTo(0.0677873794119943, 12)
      expect(f1.ficha!.icmsPctEffective).toBeCloseTo(0.182361830601232, 12)
      expect(f1.ficha!.pisCofinsPctEffective).toBeCloseTo(0.0756315306693861, 12)

      expect(f2.ficha!.externalOpsCoefficient).toBeCloseTo(0.0302297276679407, 12)
      expect(f2.ficha!.icmsPctEffective).toBeCloseTo(0.123740646030971, 12)
      expect(f2.ficha!.pisCofinsPctEffective).toBeCloseTo(0.0810539902421352, 12)

      // O ponto da seção 5.1: os dois `c` são DIFERENTES no mesmo orçamento.
      expect(f2.ficha!.externalOpsCoefficient).not.toBeCloseTo(f1.ficha!.externalOpsCoefficient, 4)
    })

    it('a ficha do documento e a da construção casam no MESMO contrato de rateio', () => {
      const doDocumento = resolveItemFicha({
        segment: 'INDUSTRIALIZACAO',
        rates: { icmsPct: 0.17, pisCofinsPct: 0.0925, ibsPct: 0.01, cbsPct: 0.088 },
      }).ficha!
      const daConstrucao = p1.taxBreakdownResolved!

      // Não é "parecido": os quatro campos que o rateio lê batem em precisão cheia. Se as
      // duas rotas divergissem, a parcela de frete herdaria uma alíquota que a construção
      // nunca usou — a `copia-divergente` entre construção e decomposição.
      expect(doDocumento.icmsPctEffective).toBeCloseTo(daConstrucao.icmsPctEffective, 12)
      expect(doDocumento.issPctEffective).toBeCloseTo(daConstrucao.issPctEffective, 12)
      expect(doDocumento.pisCofinsPctEffective).toBeCloseTo(daConstrucao.pisCofinsPctEffective, 12)
      expect(doDocumento.externalOpsCoefficient).toBeCloseTo(daConstrucao.externalOpsCoefficient, 12)

      // E as duas produzem o MESMO rateio.
      const comum = { freightValue: 1000, insuranceValue: 0, accessoryExpensesValue: 0, criteria: 'VALOR' as const }
      const a = allocateAccessories({ ...comum, targets: [{ id: 'x', totalValue: 100, isManual: false, resolved: doDocumento }] })
      const b = allocateAccessories({ ...comum, targets: [{ id: 'x', totalValue: 100, isManual: false, resolved: daConstrucao }] })
      expect(a.perTarget[0].total).toBeCloseTo(b.perTarget[0].total, 9)
    })

    it('serviço: ICMS INEXISTENTE, e o `c` usa o ISS — teste 15 do checklist', () => {
      const f = resolveItemFicha({
        segment: 'SERVICO',
        rates: { issPct: 0.05, pisCofinsPct: 0.0925, ibsPct: 0.01, cbsPct: 0.088 },
      })
      expect(f.ficha!.icmsPctEffective).toBe(0)
      expect(f.ficha!.issPctEffective).toBe(0.05)
      // E o ISS de fato entra: sem ele o `c` seria outro.
      const semIss = resolveItemFicha({
        segment: 'SERVICO',
        rates: { issPct: 0, pisCofinsPct: 0.0925, ibsPct: 0.01, cbsPct: 0.088 },
      })
      expect(f.ficha!.externalOpsCoefficient).not.toBeCloseTo(semIss.ficha!.externalOpsCoefficient, 5)
    })

    it('alíquota onde a matriz diz INEXISTENTE não vira ficha — vira erro', () => {
      const f = resolveItemFicha({
        segment: 'SERVICO',
        rates: { icmsPct: 0.17, issPct: 0.05, pisCofinsPct: 0.0925 },
      })
      expect(f.ficha).toBeNull()
      expect(f.errors.join(' ')).toContain('ICMS veio com alíquota')
    })
  })

  describe('9. R21 — a TRAVESSIA: a venda congela, e sabe quando o congelado deixou de valer', () => {
    /** Orçamento: dois itens de 300 e 100, frete de R$ 1.000 rateado por valor. */
    const origem = { totalOriginal: 1000, base: 400, allocatedSum: 1000 }

    it('conjunto IDÊNTICO: o rateio herdado continua válido', () => {
      const r = checkInheritedAllocation(origem, [{ totalValue: 300 }, { totalValue: 100 }])
      expect(r.verdict).toBe('VALIDO')
      expect(r.montanteAtual).toBe(400)
    })

    it('item REMOVIDO: as parcelas não cobrem o cotado, e isso é dito', () => {
      // A venda saiu com um item só; a parcela dele era 750.
      const r = checkInheritedAllocation(
        { ...origem, allocatedSum: 750 },
        [{ totalValue: 300 }],
      )
      expect(r.verdict).toBe('CONJUNTO_MUDOU')
      expect(r.reason).toContain('acrescentados ou removidos')
    })

    it('QUANTIDADE mudou e a soma AINDA FECHA — o caso que só a base pega', () => {
      // As parcelas continuam somando 1.000, mas o documento passou a valer 500. O share
      // correto de cada item mudou, e sem `freight_allocation_base` isso passaria por válido.
      // É este caso que justifica a coluna acrescentada à seção 7.2.
      const r = checkInheritedAllocation(origem, [{ totalValue: 400 }, { totalValue: 100 }])
      expect(r.verdict).toBe('CONJUNTO_MUDOU')
      expect(r.reason).toContain('quantidades mudaram')

      // E o contraste que prova que é a BASE quem o pega, não a soma: sem a base, o mesmo
      // documento sai INDETERMINADO — nunca VALIDO, que seria afirmar uma conferência que
      // não aconteceu.
      const semBase = checkInheritedAllocation({ ...origem, base: null }, [{ totalValue: 400 }, { totalValue: 100 }])
      expect(semBase.verdict).toBe('INDETERMINADO')
    })

    it('documento SEM acréscimo cotado na origem: não há rateio a herdar', () => {
      const r = checkInheritedAllocation({ totalOriginal: null, base: null, allocatedSum: 0 }, [{ totalValue: 300 }])
      expect(r.verdict).toBe('SEM_RATEIO')
    })

    it('NÃO recalcula: a função não devolve parcela nenhuma, só o veredito', () => {
      // O ponto da R21. Recalcular mudaria a parcela de itens que ninguém tocou, porque o
      // share tem o conjunto inteiro no denominador. Se esta função um dia passar a devolver
      // parcelas, este caso quebra e manda ler a regra antes.
      const r = checkInheritedAllocation(origem, [{ totalValue: 300 }, { totalValue: 100 }])
      expect(Object.keys(r).sort()).toEqual(['montanteAtual', 'reason', 'verdict'])
    })

    it('o que o recálculo faria, medido — para que a escolha não seja de fé', () => {
      // Orçamento com três itens; a venda perde o do meio. O item 'a' NÃO foi tocado.
      const tres = [
        { id: 'a', totalValue: 300, isManual: false, resolved: p1.taxBreakdownResolved! },
        { id: 'b', totalValue: 500, isManual: false, resolved: p1.taxBreakdownResolved! },
        { id: 'c', totalValue: 200, isManual: false, resolved: p1.taxBreakdownResolved! },
      ]
      const comum = { freightValue: 1000, insuranceValue: 0, accessoryExpensesValue: 0, criteria: 'VALOR' as const }
      const noOrcamento = allocateAccessories({ ...comum, targets: tres })
      const recalculado = allocateAccessories({ ...comum, targets: [tres[0], tres[2]] })

      // Congelado, 'a' mantém 300. Recalculado, 'a' salta para 600 — sem ninguém ter tocado
      // nele. É o dobro, e é a razão de a R21 não recalcular.
      expect(noOrcamento.perTarget[0].allocated).toBeCloseTo(300, 6)
      expect(recalculado.perTarget[0].allocated).toBeCloseTo(600, 6)
    })

    it('tolerância de um centavo: arredondamento de rateio NÃO é mudança de conjunto', () => {
      const r = checkInheritedAllocation(
        { totalOriginal: 1000, base: 400, allocatedSum: 1000.004 },
        [{ totalValue: 300 }, { totalValue: 100.004 }],
      )
      expect(r.verdict).toBe('VALIDO')
    })
  })
})