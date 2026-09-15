/**
 * REGRESSÃO DA CAMPANHA INTEIRA — o preço de quem não tem IBS/CBS não mudou.
 *
 * Teste 1 da Parte 5 de `.claude/rules/cascata-lucro-real.md`, e o único marcado
 * "Regressão — bloqueante": com `c = 0`, o motor precisa reproduzir EXATAMENTE o resultado
 * de antes. Hoje `cbs_active` e `ibs_active` são false em 109 de 109 cálculos, então `c = 0`
 * é o estado real de produção — este arquivo cobre todas as precificações existentes.
 *
 * >>> A MEDIDA É O MOTOR ANTIGO, NÃO UMA LISTA DE NÚMEROS <<<
 * O oráculo é `__oraculos__/pricing-engine-antes-da-campanha.ts`, cópia literal do commit
 * `423b1d4`. Uma lista de números esperados teria sido escrita por mim, depois da mudança —
 * e quem acabou de mudar o código é quem tem menos condições de notar que copiou o valor
 * novo. O motor antigo foi escrito antes de a mudança existir.
 */

import { calculatePricing, type CalcType, type PricingInput } from '@/utils/pricing-engine'
import { calculatePricing as calculatePricingAntes } from '../__oraculos__/pricing-engine-antes-da-campanha'

/** Os campos que os dois motores têm em comum. Os da campanha ficam de fora por construção. */
const CAMPOS_COMUNS = [
  'isValid', 'validationErrors', 'cmvTotal', 'cmvUnit', 'laborValue', 'laborPctShown',
  'structurePct', 'taxPct', 'commissionPct', 'profitPct', 'rtReservePct',
  'productiveLaborCost', 'rtReserveValue', 'coefficient',
  'priceUnit', 'priceTotal', 'structureValue', 'taxValue', 'commissionValue', 'profitValue',
] as const

function comparavel(r: Record<string, unknown>) {
  const out: Record<string, unknown> = {}
  for (const k of CAMPOS_COMUNS) out[k] = r[k]
  return out
}

/** Cenários reais dos três segmentos, com números que NÃO se confundem entre si. */
const SEGMENTOS: ReadonlyArray<{ nome: string; base: PricingInput }> = [
  {
    nome: 'INDUSTRIALIZAÇÃO — com MO produtiva e rendimento > 1',
    base: {
      calcType: 'INDUSTRIALIZACAO',
      totalItemsCost: 2428.2,
      yieldQuantity: 7,
      laborCostMonthly: 18500,
      numProductiveEmployees: 4,
      monthlyWorkloadMinutes: 42240,
      productWorkloadMinutes: 95,
      structurePct: 0.2292,
      taxPct: 0.2468,
      commissionPct: 0.05,
      profitPct: 0.08,
      rtReservePct: 0.01,
    },
  },
  {
    // A MO produtiva vem PREENCHIDA de propósito. Com ela zerada, "REVENDA não soma MO no
    // CMV" e "REVENDA soma MO no CMV" dão o MESMO número, e o caso não distingue os dois
    // estados — variante 2 de `.claude/rules/teste-que-nao-exercita.md`. Uma mutação que
    // fazia a revenda somar a MO SOBREVIVEU à primeira versão deste arquivo por isso.
    // O tenant de revenda com MO produtiva configurada é o caso real, não o artificial.
    nome: 'REVENDA — MO produtiva configurada e IGNORADA no CMV',
    base: {
      calcType: 'REVENDA',
      totalItemsCost: 849.62,
      yieldQuantity: 1,
      laborCostMonthly: 22400,
      numProductiveEmployees: 5,
      monthlyWorkloadMinutes: 52800,
      productWorkloadMinutes: 180,
      structurePct: 0.3105,
      taxPct: 0.1832,
      commissionPct: 0.032,
      profitPct: 0.117,
      rtReservePct: 0,
    },
  },
  {
    nome: 'SERVIÇO — MO no CMV, despesa fixa fora da MC',
    base: {
      calcType: 'SERVICO',
      totalItemsCost: 137.4,
      yieldQuantity: 1,
      laborCostMonthly: 26300,
      numProductiveEmployees: 3,
      monthlyWorkloadMinutes: 31680,
      productWorkloadMinutes: 240,
      structurePct: 0.0587,
      taxPct: 0.1739,
      commissionPct: 0.4,
      profitPct: 0.1,
      rtReservePct: 0.02,
    },
  },
]

/** Variações aplicadas a cada segmento — para que a igualdade não seja de um caso só. */
const VARIACOES: ReadonlyArray<{ nome: string; muda: (b: PricingInput) => PricingInput }> = [
  { nome: 'como cadastrado', muda: (b) => b },
  { nome: 'sem RT', muda: (b) => ({ ...b, rtReservePct: 0 }) },
  { nome: 'sem comissão', muda: (b) => ({ ...b, commissionPct: 0 }) },
  { nome: 'custo zero', muda: (b) => ({ ...b, totalItemsCost: 0 }) },
  { nome: 'rendimento alto', muda: (b) => ({ ...b, yieldQuantity: 250 }) },
  { nome: 'margem apertada — coeficiente perto de zero', muda: (b) => ({ ...b, profitPct: 0.4 }) },
  { nome: 'coeficiente NEGATIVO — os dois têm de recusar igual', muda: (b) => ({ ...b, profitPct: 0.9 }) },
  { nome: 'yieldQuantity inválido — os dois têm de recusar igual', muda: (b) => ({ ...b, yieldQuantity: 0 }) },
  // Força MO produtiva em TODOS os segmentos, inclusive REVENDA: é o que distingue quem a
  // soma no CMV de quem a ignora.
  {
    nome: 'com MO produtiva alta',
    muda: (b) => ({ ...b, laborCostMonthly: 40000, monthlyWorkloadMinutes: 26400, productWorkloadMinutes: 310 }),
  },
]

describe('REGRESSÃO — o preço de quem não tem IBS/CBS não mudou, nos três segmentos', () => {
  describe('1. CONTRATO ANTIGO — o caminho que 100% da produção usa hoje', () => {
    for (const seg of SEGMENTOS) {
      for (const v of VARIACOES) {
        it(`${seg.nome} · ${v.nome}`, () => {
          const entrada = v.muda(seg.base)
          const antes = calculatePricingAntes(entrada)
          const agora = calculatePricing(entrada)
          // Campo a campo, sem tolerância: é o MESMO centavo, não um número próximo.
          expect(comparavel(agora as unknown as Record<string, unknown>))
            .toEqual(comparavel(antes as unknown as Record<string, unknown>))
        })
      }
    }
  })

  describe('2. CONTRATO NOVO com `c = 0` — a matriz governando, sem tributo por fora', () => {
    /**
     * Aqui a construção passa pelo `taxBreakdown`, pela matriz e pela reconstituição da
     * nominal do PIS/COFINS. O resultado tem de ser o MESMO do motor antigo — é o que
     * protege a base instalada quando a matriz for ligada.
     */
    const porDentro: Record<CalcType, { icms?: number; iss?: number; pisCofinsEfetivado: number }> = {
      INDUSTRIALIZACAO: { icms: 0.17, pisCofinsEfetivado: 0.0925 * (1 - 0.17) },
      REVENDA: { icms: 0.12, pisCofinsEfetivado: 0.0925 * (1 - 0.12) },
      // No serviço o ICMS é INEXISTENTE e o ISS é POR DENTRO.
      SERVICO: { iss: 0.05, pisCofinsEfetivado: 0.0925 },
    }

    for (const seg of SEGMENTOS) {
      it(`${seg.nome} — o caminho da matriz dá o MESMO preço`, () => {
        const t = porDentro[seg.base.calcType]
        const somaPorDentro = (t.icms ?? 0) + (t.iss ?? 0) + t.pisCofinsEfetivado
        const profitTax = 0.15 * seg.base.profitPct + 0.09 * seg.base.profitPct

        // O motor ANTIGO recebe tudo agregado em `taxPct`, como as telas sempre fizeram.
        const antes = calculatePricingAntes({ ...seg.base, taxPct: somaPorDentro + profitTax })

        // O motor NOVO recebe a matriz, e a nominal do PIS/COFINS reconstituída da efetivada.
        const nominal = t.pisCofinsEfetivado / (1 - (t.icms ?? 0) - (t.iss ?? 0))
        const agora = calculatePricing({
          ...seg.base,
          taxPct: (t.icms ?? 0) + (t.iss ?? 0) + nominal,
          profitTaxPct: profitTax,
          taxBreakdown: { icmsPct: t.icms, issPct: t.iss, pisCofinsPct: nominal },
        })

        expect(agora.isValid).toBe(true)
        expect(agora.taxBreakdownResolved!.externalOpsCoefficient).toBe(0)
        // O MESMO centavo.
        expect(agora.priceUnit).toBe(antes.priceUnit)
        expect(agora.priceTotal).toBe(antes.priceTotal)
        expect(agora.cmvUnit).toBe(antes.cmvUnit)
        expect(agora.coefficient).toBeCloseTo(antes.coefficient, 12)
      })
    }

    it('REVENDA IGNORA a MO produtiva no CMV, e os dois motores concordam nisso', () => {
      // O caso que faltava: com MO configurada, o CMV da revenda é SÓ o custo do item. Se um
      // dos dois motores passasse a somar a MO, os dois números divergiriam aqui.
      const revenda = SEGMENTOS.find((x) => x.base.calcType === 'REVENDA')!.base
      expect(revenda.productWorkloadMinutes).toBeGreaterThan(0)
      expect(revenda.laborCostMonthly).toBeGreaterThan(0)

      const agora = calculatePricing(revenda)
      const antes = calculatePricingAntes(revenda)
      // O CMV é o custo do item, e NÃO custo + MO.
      expect(agora.cmvUnit).toBe(revenda.totalItemsCost)
      expect(agora.cmvUnit).toBe(antes.cmvUnit)
      // E a MO produtiva foi de fato calculada — não é zero por a entrada ser zero.
      expect(agora.productiveLaborCost).toBeGreaterThan(0)
      expect(agora.productiveLaborCost).toBe(antes.productiveLaborCost)
      // `laborValue` é zero em REVENDA, e é outra coisa: a MO não vira linha do preço.
      expect(agora.laborValue).toBe(0)
      expect(agora.laborValue).toBe(antes.laborValue)
    })

    it('e COM IBS o preço SOBE — o contraste que prova que o caminho está vivo', () => {
      // Sem este caso, a igualdade acima passaria também num motor que ignorasse o
      // `taxBreakdown` por completo. É a variante 2 de `teste-que-nao-exercita.md`.
      const seg = SEGMENTOS[0].base
      const comum = {
        ...seg,
        taxPct: 0.17 + 0.0925,
        profitTaxPct: 0.15 * seg.profitPct + 0.09 * seg.profitPct,
      }
      const sem = calculatePricing({ ...comum, taxBreakdown: { icmsPct: 0.17, pisCofinsPct: 0.0925 } })
      const com = calculatePricing({
        ...comum,
        taxBreakdown: { icmsPct: 0.17, pisCofinsPct: 0.0925, ibs: { rate: 0.088, baseCode: 4 } },
      })
      expect(com.priceUnit).toBeGreaterThan(sem.priceUnit)
      expect(com.taxBreakdownResolved!.externalOpsCoefficient).toBeGreaterThan(0)
    })
  })

  describe('3. O ORÁCULO é o motor antigo de verdade', () => {
    it('ele NÃO conhece nenhum campo da campanha', () => {
      // Se alguém "sincronizar" o oráculo com o motor atual, a regressão inteira vira
      // tautologia — os dois lados passariam a ser o mesmo código. Este caso pega.
      const fonte = require('fs').readFileSync(
        require('path').join(__dirname, '..', '__oraculos__', 'pricing-engine-antes-da-campanha.ts'),
        'utf-8',
      ) as string
      const corpo = fonte.slice(fonte.indexOf('*/') + 2)
      for (const termo of ['taxBreakdown', 'externalOpsCoefficient', 'profitTaxPct', 'TAX_MATRIX', 'placementOf']) {
        expect(corpo).not.toContain(termo)
      }
    })

    it('os campos da campanha existem no motor ATUAL — os dois lados não são iguais', () => {
      const r = calculatePricing({
        ...SEGMENTOS[0].base,
        taxPct: 0.17,
        profitTaxPct: 0.0192,
        taxBreakdown: { icmsPct: 0.17, pisCofinsPct: 0 },
      })
      expect(r.taxBreakdownResolved).toBeDefined()
      expect(r.profitTaxValue).toBeGreaterThan(0)
    })
  })
})
