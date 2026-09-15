/**
 * Correção 5 — o contexto da venda deriva as bases e as telas montam o `taxBreakdown`.
 *
 * Regra: `.claude/rules/cascata-lucro-real.md` — Parte 0 (matriz), R3, R5, R8, R9.
 *
 * >>> CADA ASSERÇÃO PRECISA FALHAR SEM A CORREÇÃO <<<
 * `.claude/rules/teste-que-nao-exercita.md`. Por isso os casos abaixo evitam três armadilhas
 * nomeadas lá:
 *   - nenhum caso afirma que "a prop chegou": afirmam o NÚMERO que muda;
 *   - os valores DISTINGUEM os dois estados — nunca uma alíquota que dá o mesmo resultado
 *     nos dois lados;
 *   - a igualdade que o teste 1 da Parte 5 exige é afirmada contra o número do caminho
 *     ANTIGO calculado no próprio caso, não contra uma constante copiada.
 */

import { calculatePricing, resolveExternalOpsCoefficient, TAX_MATRIX, placementOf } from '@/utils/pricing-engine'
import {
  buildTaxBreakdown,
  pisCofinsNominalFromEffective,
  resolveBuyerKind,
  resolveSaleContext,
  resolveConstructionTaxInput,
  DEFAULT_BASE_CODE,
} from '@/utils/sale-context'
import { buildProductConstruction } from '@/utils/product-price-construction'

const CUSTO = 1000

/** A construção do caminho ANTIGO: `taxPct` agregado, sem tributo por fora. */
function precoCaminhoAntigo(taxPctAgregado: number) {
  return calculatePricing({
    calcType: 'INDUSTRIALIZACAO',
    totalItemsCost: CUSTO,
    yieldQuantity: 1,
    laborCostMonthly: 0,
    numProductiveEmployees: 0,
    monthlyWorkloadMinutes: 0,
    productWorkloadMinutes: 0,
    structurePct: 0.2,
    taxPct: taxPctAgregado,
    commissionPct: 0.05,
    profitPct: 0.15,
  })
}

describe('correção 5 — a matriz e o contexto da venda', () => {
  describe('1. a matriz é FONTE ÚNICA — não há segunda cópia', () => {
    it('`sale-context` re-exporta a matriz do motor: é o MESMO objeto, não uma transcrição igual', async () => {
      const saleContext = await import('@/utils/sale-context')
      const engine = await import('@/utils/pricing-engine')
      // `toBe`, não `toEqual`: duas transcrições idênticas passariam num `toEqual` e é
      // exatamente a cópia divergente que a Parte 0 proíbe. Identidade referencial é a
      // única asserção que distingue "re-export" de "cópia que hoje coincide".
      expect(saleContext.TAX_MATRIX).toBe(engine.TAX_MATRIX)
      expect(saleContext.placementOf).toBe(engine.placementOf)
    })

    it('a validação do motor LÊ a matriz: mudar a célula muda o veredito, sem tocar em nenhum `if`', () => {
      // A matriz diz IPI INEXISTENTE em REVENDA. O motor precisa recusar.
      expect(placementOf('REVENDA', 'IPI')).toBe('INEXISTENTE')
      const recusado = calculatePricing({
        calcType: 'REVENDA',
        totalItemsCost: CUSTO,
        yieldQuantity: 1,
        laborCostMonthly: 0,
        numProductiveEmployees: 0,
        monthlyWorkloadMinutes: 0,
        productWorkloadMinutes: 0,
        structurePct: 0.2,
        taxPct: 0.17,
        commissionPct: 0.05,
        profitPct: 0.15,
        taxBreakdown: { icmsPct: 0.17, pisCofinsPct: 0, ipi: { rate: 0.05, baseCode: 1 } },
      })
      expect(recusado.isValid).toBe(false)
      expect(recusado.validationErrors.join(' ')).toContain('ipi declarado em REVENDA')

      // A MESMA entrada em INDUSTRIALIZACAO, onde a célula diz POR FORA, é aceita.
      expect(placementOf('INDUSTRIALIZACAO', 'IPI')).toBe('POR_FORA')
      const aceito = calculatePricing({
        calcType: 'INDUSTRIALIZACAO',
        totalItemsCost: CUSTO,
        yieldQuantity: 1,
        laborCostMonthly: 0,
        numProductiveEmployees: 0,
        monthlyWorkloadMinutes: 0,
        productWorkloadMinutes: 0,
        structurePct: 0.2,
        taxPct: 0.17,
        commissionPct: 0.05,
        profitPct: 0.15,
        taxBreakdown: { icmsPct: 0.17, pisCofinsPct: 0, ipi: { rate: 0.05, baseCode: 1 } },
      })
      expect(aceito.isValid).toBe(true)
    })

    it('as 21 células da matriz estão na regra — INEXISTENTE nunca é zero', () => {
      expect(TAX_MATRIX.INDUSTRIALIZACAO).toEqual({
        ICMS: 'POR_DENTRO', ISS: 'INEXISTENTE', PIS_COFINS: 'POR_DENTRO',
        IPI: 'POR_FORA', IS: 'POR_FORA', IBS: 'POR_FORA', CBS: 'POR_FORA',
      })
      expect(TAX_MATRIX.REVENDA).toEqual({
        ICMS: 'POR_DENTRO', ISS: 'INEXISTENTE', PIS_COFINS: 'POR_DENTRO',
        IPI: 'INEXISTENTE', IS: 'POR_FORA', IBS: 'POR_FORA', CBS: 'POR_FORA',
      })
      expect(TAX_MATRIX.SERVICO).toEqual({
        ICMS: 'INEXISTENTE', ISS: 'POR_DENTRO', PIS_COFINS: 'POR_DENTRO',
        IPI: 'INEXISTENTE', IS: 'INEXISTENTE', IBS: 'POR_FORA', CBS: 'POR_FORA',
      })
    })
  })

  describe('2. `buildTaxBreakdown` lê a matriz em vez de decidir por `if`', () => {
    it('ICMS em SERVIÇO é recusado — e o ISS do mesmo serviço passa', () => {
      const r = buildTaxBreakdown({
        segment: 'SERVICO',
        buyerType: 'CONSUMIDOR_FINAL',
        saleScope: 'INTRAESTADUAL',
        rates: { icmsPct: 0.17, issPct: 0.05, pisCofinsPct: 0.0925 },
      })
      expect(r.taxBreakdown).toBeNull()
      expect(r.errors.join(' ')).toContain('ICMS veio com alíquota 0.17 em SERVICO')

      const ok = buildTaxBreakdown({
        segment: 'SERVICO',
        buyerType: 'CONSUMIDOR_FINAL',
        saleScope: 'INTRAESTADUAL',
        rates: { issPct: 0.05, pisCofinsPct: 0.0925 },
      })
      expect(ok.errors).toEqual([])
      // INEXISTENTE vira `undefined`, jamais 0 — `0` afirmaria que o ICMS existe e é nulo.
      expect(ok.taxBreakdown!.icmsPct).toBeUndefined()
      expect(ok.taxBreakdown!.issPct).toBe(0.05)
    })

    it('o fator de redução do IVA DUAL vale só para IBS e CBS (R4) — IS e IPI não o sofrem', () => {
      const r = buildTaxBreakdown({
        segment: 'INDUSTRIALIZACAO',
        buyerType: 'CONSUMIDOR_FINAL',
        saleScope: 'INTRAESTADUAL',
        rates: {
          icmsPct: 0.17, pisCofinsPct: 0.0925,
          ibsPct: 0.088, cbsPct: 0.088, isPct: 0.02, ipiPct: 0.05,
          ivaDualReductionFactor: 0.6,
        },
      })
      expect(r.taxBreakdown!.ibs!.reductionFactor).toBe(0.6)
      expect(r.taxBreakdown!.cbs!.reductionFactor).toBe(0.6)
      expect(r.taxBreakdown!.is!.reductionFactor).toBe(0)
      expect(r.taxBreakdown!.ipi!.reductionFactor).toBe(0)
    })

    it('os códigos de base saem do padrão da R3: IBS e CBS no 4, IS e IPI no 1', () => {
      const r = buildTaxBreakdown({
        segment: 'INDUSTRIALIZACAO',
        buyerType: 'CONSUMIDOR_FINAL',
        saleScope: 'INTRAESTADUAL',
        rates: { icmsPct: 0.17, pisCofinsPct: 0.0925, ibsPct: 0.088, cbsPct: 0.088, isPct: 0.02, ipiPct: 0.05 },
      })
      expect(r.taxBreakdown!.ibs!.baseCode).toBe(4)
      expect(r.taxBreakdown!.cbs!.baseCode).toBe(4)
      expect(r.taxBreakdown!.is!.baseCode).toBe(1)
      expect(r.taxBreakdown!.ipi!.baseCode).toBe(1)
      expect(DEFAULT_BASE_CODE).toEqual({ IPI: 1, IS: 1, IBS: 4, CBS: 4 })
    })
  })

  describe('3. R9 — o contexto da venda muda o NÚMERO do ICMS', () => {
    // Caso escolhido para DISTINGUIR: com IPI de 5% os dois estados dão ICMS diferente.
    // Sem IPI declarado dariam o mesmo número e o caso não exercitaria nada.
    const entrada = {
      icmsPct: 0.17,
      issPct: 0,
      pisCofinsPct: 0.0925,
      ibs: { rate: 0.088, baseCode: 4 as const },
      ipi: { rate: 0.05, baseCode: 1 as const },
    }

    it('contribuinte para revenda: o IPI SAI da base do ICMS e o ICMS apurado CAI', () => {
      const integra = resolveExternalOpsCoefficient({ ...entrada, ipiIntegraBaseIcms: true })
      const naoIntegra = resolveExternalOpsCoefficient({ ...entrada, ipiIntegraBaseIcms: false })

      expect(integra.isValid && naoIntegra.isValid).toBe(true)
      // Com o IPI dentro, o ICMS é a alíquota cheia sobre o total geral.
      expect(integra.icmsPctOverTotalGeral).toBeCloseTo(0.17, 12)
      // Com o IPI fora, é estritamente menor — e não é "quase": a diferença é mensurável.
      expect(naoIntegra.icmsPctOverTotalGeral).toBeLessThan(0.17)
      expect(0.17 - naoIntegra.icmsPctOverTotalGeral).toBeGreaterThan(0.005)
      // E o `c` muda junto, porque o ICMS entra na base do IBS.
      expect(naoIntegra.externalOpsCoefficient).not.toBeCloseTo(integra.externalOpsCoefficient, 6)
    })

    it('sem IPI, as duas linhas da R9 dão EXATAMENTE o mesmo número — a bandeira não inventa efeito', () => {
      const semIpi = { icmsPct: 0.17, issPct: 0, pisCofinsPct: 0.0925, ibs: { rate: 0.088, baseCode: 4 as const } }
      const a = resolveExternalOpsCoefficient({ ...semIpi, ipiIntegraBaseIcms: true })
      const b = resolveExternalOpsCoefficient({ ...semIpi, ipiIntegraBaseIcms: false })
      expect(b.externalOpsCoefficient).toBe(a.externalOpsCoefficient)
      expect(b.icmsPctOverTotalGeral).toBe(a.icmsPctOverTotalGeral)
    })

    it('a tabela da R9 tem TRÊS linhas e o enum do banco tem DUAS — o não classificado é `null`', () => {
      expect(resolveBuyerKind('CONSUMIDOR_FINAL')).toBe('NAO_CONTRIBUINTE')
      // `CONTRIBUINTE_PJ` sem destinação NÃO é classificável. `null`, nunca um chute.
      expect(resolveBuyerKind('CONTRIBUINTE_PJ')).toBeNull()
      expect(resolveBuyerKind('CONTRIBUINTE_PJ', 'REVENDA_INDUSTRIALIZACAO'))
        .toBe('CONTRIBUINTE_REVENDA_INDUSTRIALIZACAO')
      expect(resolveBuyerKind('CONTRIBUINTE_PJ', 'USO_CONSUMO_ATIVO'))
        .toBe('CONTRIBUINTE_USO_CONSUMO_ATIVO')
    })

    it('as três linhas da R9, célula a célula', () => {
      expect(resolveSaleContext({ buyerType: 'CONTRIBUINTE_PJ', saleScope: 'INTERESTADUAL', buyerPurpose: 'REVENDA_INDUSTRIALIZACAO' }))
        .toEqual({ buyerKind: 'CONTRIBUINTE_REVENDA_INDUSTRIALIZACAO', ipiIntegraBaseIcms: false, difalAplica: false })
      expect(resolveSaleContext({ buyerType: 'CONTRIBUINTE_PJ', saleScope: 'INTERESTADUAL', buyerPurpose: 'USO_CONSUMO_ATIVO' }))
        .toEqual({ buyerKind: 'CONTRIBUINTE_USO_CONSUMO_ATIVO', ipiIntegraBaseIcms: true, difalAplica: true })
      expect(resolveSaleContext({ buyerType: 'CONSUMIDOR_FINAL', saleScope: 'INTRAESTADUAL' }))
        .toEqual({ buyerKind: 'NAO_CONTRIBUINTE', ipiIntegraBaseIcms: true, difalAplica: false })
      // Não classificado: o DIFAL sai `null` — "não apurado" não é "não devido".
      expect(resolveSaleContext({ buyerType: 'CONTRIBUINTE_PJ', saleScope: 'INTERESTADUAL' }))
        .toEqual({ buyerKind: null, ipiIntegraBaseIcms: true, difalAplica: null })
    })
  })

  describe('4. R9 — somar por cima contra entrar no `c`', () => {
    it('o total geral bate com o número da regra: R$ 3.168,64', () => {
      const r = calculatePricing({
        calcType: 'INDUSTRIALIZACAO',
        totalItemsCost: 1000,
        yieldQuantity: 1,
        laborCostMonthly: 0,
        numProductiveEmployees: 0,
        monthlyWorkloadMinutes: 0,
        productWorkloadMinutes: 0,
        structurePct: 0.4,
        taxPct: 0.17,
        commissionPct: 0,
        profitPct: 0,
        taxBreakdown: {
          icmsPct: 0.17,
          pisCofinsPct: 0,
          ibs: { rate: 0.098, baseCode: 4 },
          ipi: { rate: 0.05, baseCode: 1 },
        },
      })
      expect(r.isValid).toBe(true)
      // A regra publica R$ 3.168,64; o motor arredonda em R$ 3.168,65. Um centavo.
      expect(r.taxBreakdownResolved!.totalGeral).toBeCloseTo(3168.64, 1)
    })

    it('somar o IPI por cima dá MENOS que o preço correto — a diferença é o erro da R9', () => {
      const comum = {
        calcType: 'INDUSTRIALIZACAO' as const,
        totalItemsCost: 1000, yieldQuantity: 1,
        laborCostMonthly: 0, numProductiveEmployees: 0,
        monthlyWorkloadMinutes: 0, productWorkloadMinutes: 0,
        structurePct: 0.4, taxPct: 0.17, commissionPct: 0, profitPct: 0,
      }
      const correto = calculatePricing({
        ...comum,
        taxBreakdown: { icmsPct: 0.17, pisCofinsPct: 0, ibs: { rate: 0.098, baseCode: 4 }, ipi: { rate: 0.05, baseCode: 1 } },
      })
      const semIpi = calculatePricing({
        ...comum,
        taxBreakdown: { icmsPct: 0.17, pisCofinsPct: 0, ibs: { rate: 0.098, baseCode: 4 } },
      })
      const somadoPorCima = semIpi.taxBreakdownResolved!.totalGeral * 1.05

      expect(somadoPorCima).toBeLessThan(correto.taxBreakdownResolved!.totalGeral)
      // Não é arredondamento: a diferença passa de R$ 200 num preço de R$ 3.100.
      expect(correto.taxBreakdownResolved!.totalGeral - somadoPorCima).toBeGreaterThan(200)
    })
  })

  describe('5. REGRESSÃO — quem não tem IBS/CBS continua com o preço IDÊNTICO', () => {
    it('PIS/COFINS: a nominal reconstituída devolve a MESMA efetivada em `c = 0`', () => {
      // 9,25% com ICMS 17% é o que o cadastro grava: 7,6775%.
      const gravado = 0.0925 * (1 - 0.17)
      const nominal = pisCofinsNominalFromEffective(gravado, 0.17, 0)
      expect(nominal).toBeCloseTo(0.0925, 12)
      // E a exceção da R5 aplicada sobre ela devolve exatamente o gravado.
      expect(nominal * (1 - 0.17)).toBeCloseTo(gravado, 12)
    })

    it('produto SEM tributo por fora: a matriz e o caminho antigo dão o MESMO preço', () => {
      const icms = 0.17
      const pisCofinsGravado = 0.0925 * (1 - icms)
      const profitTax = 0.15 * 0.15 + 0.15 * 0.09 // IRPJ + CSLL sobre 15% de lucro

      const antigo = precoCaminhoAntigo(icms + pisCofinsGravado + profitTax)
      const comMatriz = buildProductConstruction({
        taxableRegime: 'LUCRO_REAL',
        segment: 'INDUSTRIALIZACAO',
        buyerType: 'CONSUMIDOR_FINAL',
        saleScope: 'INTRAESTADUAL',
        costTotal: CUSTO,
        structurePct: 0.2,
        rtReservePct: 0,
        commissionPct: 0.05,
        profitPct: 0.15,
        profitTaxPct: profitTax,
        rates: { icmsPct: icms, issPct: null, pisCofinsEffectivePct: pisCofinsGravado },
        despAcessorias: 0,
      })

      expect(comMatriz.applied).toBe(true)
      expect(comMatriz.resolved!.externalOpsCoefficient).toBe(0)
      // O MESMO centavo. Não é "próximo": é o teste 1 da Parte 5.
      expect(comMatriz.opInterna).toBe(antigo.priceUnit)
      expect(comMatriz.totalGeral).toBe(antigo.priceUnit)
    })

    it('produto COM IBS: o preço SOBE, e sobe porque a margem de contribuição encolheu', () => {
      const icms = 0.17
      const pisCofinsGravado = 0.0925 * (1 - icms)
      const profitTax = 0.15 * 0.15 + 0.15 * 0.09
      const comum = {
        taxableRegime: 'LUCRO_REAL',
        segment: 'INDUSTRIALIZACAO' as const,
        buyerType: 'CONSUMIDOR_FINAL' as const,
        saleScope: 'INTRAESTADUAL' as const,
        costTotal: CUSTO,
        structurePct: 0.2,
        rtReservePct: 0,
        commissionPct: 0.05,
        profitPct: 0.15,
        profitTaxPct: profitTax,
        despAcessorias: 0,
      }
      const sem = buildProductConstruction({
        ...comum,
        rates: { icmsPct: icms, issPct: null, pisCofinsEffectivePct: pisCofinsGravado },
      })
      const com = buildProductConstruction({
        ...comum,
        rates: { icmsPct: icms, issPct: null, pisCofinsEffectivePct: pisCofinsGravado, ibsPct: 0.088 },
      })

      expect(com.resolved!.externalOpsCoefficient).toBeGreaterThan(0)
      // A operação INTERNA sobe — é o que distingue "entrar no `c`" de "somar por cima",
      // onde P ficaria igual e só o total mudaria.
      expect(com.opInterna).toBeGreaterThan(sem.opInterna)
      expect(com.totalGeral).toBeGreaterThan(com.opInterna)
    })
  })

  describe('6. as portas que dizem "não se aplica" em vez de calcular por dedução', () => {
    it('regime sem matriz escrita: `applied` é falso e NENHUM número é produzido', () => {
      for (const regime of ['LUCRO_PRESUMIDO', 'SIMPLES_NACIONAL', 'SIMPLES_HIBRIDO', 'MEI', null]) {
        const r = buildProductConstruction({
          taxableRegime: regime,
          segment: 'INDUSTRIALIZACAO',
          buyerType: 'CONSUMIDOR_FINAL',
          saleScope: 'INTRAESTADUAL',
          costTotal: CUSTO,
          structurePct: 0.2, rtReservePct: 0, commissionPct: 0.05, profitPct: 0.15, profitTaxPct: 0,
          rates: { icmsPct: 0.17, issPct: null, pisCofinsEffectivePct: 0.0768, ibsPct: 0.088 },
          despAcessorias: 0,
        })
        expect(r.applied).toBe(false)
        expect(r.totalGeral).toBe(0)
      }
      // E em Lucro Real, a MESMA entrada produz preço.
      const lr = buildProductConstruction({
        taxableRegime: 'LUCRO_REAL',
        segment: 'INDUSTRIALIZACAO',
        buyerType: 'CONSUMIDOR_FINAL',
        saleScope: 'INTRAESTADUAL',
        costTotal: CUSTO,
        structurePct: 0.2, rtReservePct: 0, commissionPct: 0.05, profitPct: 0.15, profitTaxPct: 0,
        rates: { icmsPct: 0.17, issPct: null, pisCofinsEffectivePct: 0.0768, ibsPct: 0.088 },
        despAcessorias: 0,
      })
      expect(lr.applied).toBe(true)
      expect(lr.totalGeral).toBeGreaterThan(0)
    })

    it('acréscimos gravados no produto: a base deles é do orçamento (R11), então a matriz recua', () => {
      const comum = {
        taxableRegime: 'LUCRO_REAL',
        segment: 'INDUSTRIALIZACAO' as const,
        buyerType: 'CONSUMIDOR_FINAL' as const,
        saleScope: 'INTRAESTADUAL' as const,
        costTotal: CUSTO,
        structurePct: 0.2, rtReservePct: 0, commissionPct: 0.05, profitPct: 0.15, profitTaxPct: 0,
        rates: { icmsPct: 0.17, issPct: null as number | null, pisCofinsEffectivePct: 0.0768, ibsPct: 0.088 },
      }
      expect(buildProductConstruction({ ...comum, despAcessorias: 120 }).applied).toBe(false)
      expect(buildProductConstruction({ ...comum, despAcessorias: 0 }).applied).toBe(true)
    })
  })

  describe('7. IRPJ e CSLL têm campo próprio (R6) — não cabem no `taxPct`', () => {
    it('`profitTaxPct` sem `taxBreakdown` é RECUSADO: somar aos dois conta duas vezes', () => {
      const r = calculatePricing({
        calcType: 'INDUSTRIALIZACAO',
        totalItemsCost: CUSTO, yieldQuantity: 1,
        laborCostMonthly: 0, numProductiveEmployees: 0,
        monthlyWorkloadMinutes: 0, productWorkloadMinutes: 0,
        structurePct: 0.2, taxPct: 0.25, profitTaxPct: 0.036,
        commissionPct: 0.05, profitPct: 0.15,
      })
      expect(r.isValid).toBe(false)
      expect(r.validationErrors.join(' ')).toContain('profitTaxPct exige taxBreakdown')
    })

    it('`profitTaxPct` encolhe a margem de contribuição — omiti-lo barateava o preço', () => {
      const comum = {
        calcType: 'INDUSTRIALIZACAO' as const,
        totalItemsCost: CUSTO, yieldQuantity: 1,
        laborCostMonthly: 0, numProductiveEmployees: 0,
        monthlyWorkloadMinutes: 0, productWorkloadMinutes: 0,
        structurePct: 0.2, taxPct: 0.17, commissionPct: 0.05, profitPct: 0.15,
        taxBreakdown: { icmsPct: 0.17, pisCofinsPct: 0 },
      }
      const sem = calculatePricing(comum)
      const com = calculatePricing({ ...comum, profitTaxPct: 0.036 })
      expect(com.priceUnit).toBeGreaterThan(sem.priceUnit)
      expect(com.profitTaxValue).toBeGreaterThan(0)
      expect(sem.profitTaxValue).toBe(0)
    })
  })

  describe('8b. ORÁCULOS EXTERNOS — a planilha "Cascata Lucro Real", linhas 101 a 106', () => {
    /**
     * Estes números NÃO saem do código: saem da planilha de referência do dono do produto,
     * aba "Lucro Real", bloco "Parâmetros (não editar)". São a única asserção deste arquivo
     * cujo valor esperado tem origem FORA do repositório — e por isso a única que pega um
     * erro sistemático que o motor e o teste cometessem juntos.
     *
     * Entrada da planilha: ICMS 17%, ISS 0, PIS/COFINS 0, IBS 1% e CBS 8,8% no código 4,
     * IS e IPI zerados no código 1.
     */
    it('industrialização e revenda: c = 0,07408014571949', () => {
      const r = resolveExternalOpsCoefficient({
        icmsPct: 0.17,
        issPct: 0,
        pisCofinsPct: 0,
        ibs: { rate: 0.01, reductionFactor: 0, baseCode: 4 },
        cbs: { rate: 0.088, reductionFactor: 0, baseCode: 4 },
        is: { rate: 0, reductionFactor: 0, baseCode: 1 },
        ipi: { rate: 0, reductionFactor: 0, baseCode: 1 },
      })
      expect(r.isValid).toBe(true)
      expect(r.externalOpsCoefficient).toBeCloseTo(0.07408014571949, 12)
    })

    it('prestação de serviço: c = 0,0892531876138433 — e o ICMS INEXISTENTE é o que os separa', () => {
      const r = resolveExternalOpsCoefficient({
        // Na planilha a célula do ICMS do serviço diz "Não se aplica", e a fórmula do alfa
        // traz `0` literal no lugar dele. Aqui isso chega como ICMS zero na entrada do
        // resolvedor — a matriz já barrou a alíquota antes, em `buildTaxBreakdown`.
        icmsPct: 0,
        issPct: 0,
        pisCofinsPct: 0,
        ibs: { rate: 0.01, reductionFactor: 0, baseCode: 4 },
        cbs: { rate: 0.088, reductionFactor: 0, baseCode: 4 },
      })
      expect(r.isValid).toBe(true)
      expect(r.externalOpsCoefficient).toBeCloseTo(0.0892531876138433, 12)
    })

    it('os dois c DIFEREM — e diferem porque o ICMS está numa cadeia e não na outra', () => {
      const comIcms = resolveExternalOpsCoefficient({
        icmsPct: 0.17, issPct: 0, pisCofinsPct: 0,
        ibs: { rate: 0.01, baseCode: 4 }, cbs: { rate: 0.088, baseCode: 4 },
      })
      const semIcms = resolveExternalOpsCoefficient({
        icmsPct: 0, issPct: 0, pisCofinsPct: 0,
        ibs: { rate: 0.01, baseCode: 4 }, cbs: { rate: 0.088, baseCode: 4 },
      })
      expect(semIcms.externalOpsCoefficient - comIcms.externalOpsCoefficient).toBeCloseTo(0.015173, 5)
    })
  })

  describe('8. a decomposição LÊ o que a construção usou, em vez de redescobrir', () => {
    it('cada tributo por fora volta com a sua base, e a soma das bases fecha com o `c`', () => {
      const r = calculatePricing({
        calcType: 'INDUSTRIALIZACAO',
        totalItemsCost: CUSTO, yieldQuantity: 1,
        laborCostMonthly: 0, numProductiveEmployees: 0,
        monthlyWorkloadMinutes: 0, productWorkloadMinutes: 0,
        structurePct: 0.2, taxPct: 0.17, commissionPct: 0.05, profitPct: 0.15,
        taxBreakdown: {
          icmsPct: 0.17, pisCofinsPct: 0,
          ibs: { rate: 0.088, baseCode: 4 },
          cbs: { rate: 0.009, baseCode: 4 },
          is: { rate: 0.02, baseCode: 1 },
          ipi: { rate: 0.05, baseCode: 1 },
        },
      })
      const ext = r.taxBreakdownResolved!.externalTaxes
      // As bases são DIFERENTES entre si: IS e IPI no código 1 (P), IBS/CBS no 4.
      expect(ext.ipi!.baseCode).toBe(1)
      expect(ext.ibs!.baseCode).toBe(4)
      expect(ext.ibs!.baseValue).not.toBeCloseTo(ext.ipi!.baseValue, 2)
      // Cada valor é base × alíquota efetiva — nada de "valor ÷ âncora".
      expect(ext.ibs!.value).toBeCloseTo(ext.ibs!.baseValue * 0.088, 1)
      // E a soma dos quatro é a operação externa inteira.
      const soma = ext.ibs!.value + ext.cbs!.value + ext.is!.value + ext.ipi!.value
      expect(soma).toBeCloseTo(r.taxBreakdownResolved!.externalValue, 1)
    })

    it('o fator de redução chega na alíquota EFETIVA do IBS, não num desconto no fim (R4)', () => {
      const tax = resolveConstructionTaxInput({
        taxableRegime: 'LUCRO_REAL',
        segment: 'INDUSTRIALIZACAO',
        buyerType: 'CONSUMIDOR_FINAL',
        saleScope: 'INTRAESTADUAL',
        rates: { icmsPct: 0.17, pisCofinsEffectivePct: 0.0768, ibsPct: 0.1, ivaDualReductionFactor: 0.5 },
        profitTaxPct: 0,
      })
      const r = calculatePricing({
        calcType: 'INDUSTRIALIZACAO',
        totalItemsCost: CUSTO, yieldQuantity: 1,
        laborCostMonthly: 0, numProductiveEmployees: 0,
        monthlyWorkloadMinutes: 0, productWorkloadMinutes: 0,
        structurePct: 0.2, commissionPct: 0.05, profitPct: 0.15,
        taxPct: tax.engineInput!.taxPct,
        profitTaxPct: tax.engineInput!.profitTaxPct,
        taxBreakdown: tax.engineInput!.taxBreakdown,
      })
      // "Alíquota 10% com fator 50 resulta em efetiva 5%" — formulação do dono do produto.
      expect(r.taxBreakdownResolved!.externalTaxes.ibs!.effectiveRate).toBeCloseTo(0.05, 12)
    })
  })
})
