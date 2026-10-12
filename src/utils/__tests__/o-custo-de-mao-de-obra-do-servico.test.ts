/**
 * O CUSTO DE MÃO DE OBRA NO SEGMENTO SERVIÇO — numerador, não percentual.
 *
 * Rodada de 11/10/2026. Decisão do dono do produto, registrada como está:
 *
 *   > No serviço, MO administrativa e despesa fixa entram no NUMERADOR, somadas à MO
 *   > produtiva, e o conjunto é dividido pelo TEMPO. Não é percentual sobre receita.
 *
 * ══ OS TRÊS TRABALHOS DESTE ARQUIVO, E QUAL DELES É VERMELHO ANTES ══════════════════════
 *
 * (a) **O DEFEITO DO CAMINHO DO PRODUTO** — vermelho antes da correção. A tela de produto
 *     tirava a administrativa e a fixa do DIVISOR (segmento SERVIÇO) e não as somava ao
 *     CUSTO, porque `calcBase` só carregava os percentuais. As duas desapareciam do preço.
 *
 * (b) **A CONCORDÂNCIA ENTRE OS DOIS CAMINHOS** — vermelho antes. É o caso que impede o
 *     produto e o serviço de divergirem de novo: mesma entrada, mesmo preço.
 *
 * (c) **A CONCORDÂNCIA ENTRE AS DUAS CÓPIAS DO COMBINADO** — verde antes e depois, e está
 *     declarado. `services/content.component.tsx` monta a soma por conta própria e
 *     `compute-service-price.ts` lê a função compartilhada. Hoje concordam; o caso existe
 *     para que o dia em que deixarem de concordar seja vermelho em vez de silencioso.
 *     `copia-divergente.md` — o remédio é apagar uma cópia, e a unificação é de outra
 *     rodada, por decisão do dono do produto: ali mora o preço de um tenant vivo.
 *
 * (d) **CARACTERIZAÇÃO DO SALÃO ELIANE** — verde antes e depois. Prega os três preços e o
 *     custo por minuto medidos em produção em 11/10/2026.
 */

import {
  custoMensalDeMaoDeObra,
  custoMensalDeMaoDeObraDoProduto,
  divisorDaEstruturaPct,
} from '@/utils/despesas-do-segmento'
import { combinadoMensalDaTelaDeServico } from '@/page-parts/services/content.component'
import { computeServiceSellingPrice } from '@/utils/compute-service-price'
import { calculatePricing } from '@/utils/pricing-engine'
import { resolveMonthlyWorkload } from '@/utils/resolve-monthly-workload'

/**
 * A configuração MEDIDA do Salão Eliane em 11/10/2026, por consulta ao banco. Os valores são
 * os reais, e nenhum coincide com outro — uma config em que a administrativa fosse igual à
 * fixa não distinguiria qual das duas o numerador somou.
 */
const ELIANE_HOJE: CfgDeDespesa = {
  production_labor_cost: 0,
  production_labor_cost_hub: 0,
  admin_salary_total: 7000,
  admin_fgts_total: 0,
  admin_other_costs: 0,
  fixed_expense_monthly: 4750,
  fixed_expense_percent: 7.25,
  financial_commitments_percent: 0,
  variable_expense_percent: 1.6,
  financial_expense_percent: 0.46,
}

/**
 * A MESMA config, com os percentuais do `expense_snapshot` CONGELADO nos três serviços
 * (`variavel_pct: 1.62`, `financeira_pct: 0.46`, gravados em 05 e 19/09/2026).
 *
 * >>> ELES DIVERGEM DA CONFIG VIVA, E ISSO É UM ACHADO <<<
 *
 * A config de hoje traz `variable_expense_percent: 1.6`; o congelado diz `1.62`. São 2
 * centésimos de ponto, e dão R$ 0,08 no Corte e Barba — 131,14 contra 131,06. Pequeno, e
 * exatamente a forma de `fato-vs-referencia.md`: o preço é memória de um cálculo que
 * aconteceu, e relê-lo contra a configuração de hoje reescreve o passado.
 *
 * Os três preços gravados reproduzem do CONGELADO, não da config viva. É por isso que a
 * caracterização usa este objeto, e não o de cima: pregar 131,14 com `1.6` seria pregar um
 * número que nem a config de hoje nem o congelado produzem.
 */
const ELIANE_CONGELADO: CfgDeDespesa = { ...ELIANE_HOJE, variable_expense_percent: 1.62 }

/** 6.000 em MINUTES × 3 funcionários produtivos = 18.000 min/mês. Medido. */
const ELIANE_USER = {
  monthlyWorkloadInMinutes: 6000,
  unitMeasure: 'MINUTES',
  numProductiveSectorEmployee: 3,
} as const

const ELIANE_MINUTOS = 18_000
const ELIANE_CUSTO_MINUTO = 0.6527777777777778

/**
 * Uma config em que os TRÊS termos são diferentes e nenhum é zero — para que trocar dois
 * deles de lugar mude o número. A do Eliane tem a produtiva em zero, então ela sozinha não
 * distinguiria "somou a produtiva" de "não somou".
 */
type CfgDeDespesa = {
  production_labor_cost_hub?: number
  production_labor_cost?: number
  admin_salary_total?: number
  admin_fgts_total?: number
  admin_other_costs?: number
  fixed_expense_monthly?: number
  fixed_expense_percent?: number
  financial_commitments_percent?: number
  variable_expense_percent?: number
  financial_expense_percent?: number
}

const TRES_DISTINTOS: CfgDeDespesa = {
  production_labor_cost_hub: 3000,
  admin_salary_total: 5000,
  admin_fgts_total: 0,
  admin_other_costs: 0,
  fixed_expense_monthly: 7000,
  fixed_expense_percent: 20,
  financial_commitments_percent: 0,
  variable_expense_percent: 2,
  financial_expense_percent: 1,
}

function somaAdmin(cfg: { admin_salary_total?: number; admin_fgts_total?: number; admin_other_costs?: number }) {
  return (cfg.admin_salary_total || 0) + (cfg.admin_fgts_total || 0) + (cfg.admin_other_costs || 0)
}

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('(a) O NUMERADOR, por segmento', () => {
  it('>>> em SERVICO soma produtiva + administrativa + fixa <<<', () => {
    const r = custoMensalDeMaoDeObra({
      segmentoDaDespesa: 'SERVICO',
      produtivaMensal: 3000,
      adminMensal: 5000,
      fixaMensal: 7000,
    })
    expect(r).toBe(15_000)
  })

  it('e fora de SERVICO devolve SÓ a produtiva — os dois outros ficam no divisor', () => {
    // O par que prova que a função discrimina por segmento. Sem ele, o caso acima passaria
    // com um `return produtiva + admin + fixa` sem condição nenhuma.
    for (const seg of ['REVENDA', 'INDUSTRIALIZACAO'] as const) {
      expect(custoMensalDeMaoDeObra({
        segmentoDaDespesa: seg, produtivaMensal: 3000, adminMensal: 5000, fixaMensal: 7000,
      })).toBe(3000)
    }
  })

  it('o NUMERADOR e o DIVISOR são complementares: o que sai de um entra no outro', () => {
    // É a asserção que liga as duas funções. Em SERVICO a fixa não está no divisor E está no
    // numerador; fora de SERVICO, o contrário. Uma mudança que a tirasse dos DOIS lados —
    // que é exatamente o defeito desta rodada — quebra aqui.
    const divisorServico = divisorDaEstruturaPct({
      segmentoDaDespesa: 'SERVICO', fixaPct: 20, variavelPct: 2, financeiraPct: 1,
      compromissoPct: 0, indiretaAgrupadaPct: 10,
    })
    const divisorIndustria = divisorDaEstruturaPct({
      segmentoDaDespesa: 'INDUSTRIALIZACAO', fixaPct: 20, variavelPct: 2, financeiraPct: 1,
      compromissoPct: 0, indiretaAgrupadaPct: 10,
    })
    expect(divisorServico).toBe(3)        // 2 + 1, sem a fixa de 20 nem a MOI de 10
    expect(divisorIndustria).toBe(33)     // 20 + 2 + 1 + 10
    // e o numerador faz o movimento inverso
    expect(custoMensalDeMaoDeObra({ segmentoDaDespesa: 'SERVICO', produtivaMensal: 0, adminMensal: 5000, fixaMensal: 7000 })).toBe(12_000)
    expect(custoMensalDeMaoDeObra({ segmentoDaDespesa: 'INDUSTRIALIZACAO', produtivaMensal: 0, adminMensal: 5000, fixaMensal: 7000 })).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('(b) OS DOIS CAMINHOS DÃO O MESMO PREÇO — produto e serviço', () => {
  /**
   * O caminho do SERVIÇO é `computeServiceSellingPrice`. O do PRODUTO é a montagem que
   * `products/content.component.tsx` faz: `custoMensalDeMaoDeObra` no numerador e
   * `divisorDaEstruturaPct` no divisor, alimentando `calculatePricing`.
   *
   * ANTES DA CORREÇÃO o caminho do produto passava só a MO produtiva, e este `describe` fica
   * VERMELHO: com a config de três termos distintos o produto sai R$ 3.000/mês de numerador
   * contra R$ 15.000 do serviço.
   */
  const MINUTOS_DO_ITEM = 60
  const COMISSAO = 10
  const LUCRO = 20

  function precoPeloCaminhoDoProduto(cfg: CfgDeDespesa, user: typeof ELIANE_USER) {
    const workload = resolveMonthlyWorkload(
      user.monthlyWorkloadInMinutes, user.unitMeasure, user.numProductiveSectorEmployee,
    )
    return calculatePricing({
      calcType: 'SERVICO',
      totalItemsCost: 100,
      yieldQuantity: 1,
      // A FUNÇÃO DA TELA, não uma reconstrução da conta aqui: um caso que montasse a soma
      // por fora estaria afirmando a si mesmo e passaria verde com o defeito presente.
      laborCostMonthly: custoMensalDeMaoDeObraDoProduto({
        effectiveCalcType: 'SERVICO',
        segmentoDaDespesa: 'SERVICO',
        produtivaMensal: Number(cfg.production_labor_cost_hub) || 0,
        adminMensal: somaAdmin(cfg),
        fixaMensal: Number(cfg.fixed_expense_monthly) || 0,
      }),
      numProductiveEmployees: workload.totalEmployees,
      monthlyWorkloadMinutes: workload.monthlyWorkloadMinutes,
      productWorkloadMinutes: MINUTOS_DO_ITEM,
      structurePct: divisorDaEstruturaPct({
        segmentoDaDespesa: 'SERVICO',
        fixaPct: cfg.fixed_expense_percent,
        variavelPct: cfg.variable_expense_percent,
        financeiraPct: cfg.financial_expense_percent,
        compromissoPct: cfg.financial_commitments_percent,
        indiretaAgrupadaPct: 0,
      }) / 100,
      taxPct: 0,
      commissionPct: COMISSAO / 100,
      profitPct: LUCRO / 100,
    })
  }

  function precoPeloCaminhoDoServico(cfg: CfgDeDespesa, user: typeof ELIANE_USER) {
    return computeServiceSellingPrice({
      materialCost: 100,
      commissionPercent: COMISSAO,
      profitPercent: LUCRO,
      taxableRegimePercent: 0,
      expenseConfig: cfg,
      taxPreview: null,
      currentUser: user,
      serviceWorkloadMinutes: MINUTOS_DO_ITEM,
    } as Parameters<typeof computeServiceSellingPrice>[0])
  }

  it('>>> com os três termos DISTINTOS, produto e serviço dão o MESMO preço <<<', () => {
    const prod = precoPeloCaminhoDoProduto(TRES_DISTINTOS, ELIANE_USER)
    const svc = precoPeloCaminhoDoServico(TRES_DISTINTOS, ELIANE_USER)
    expect(prod.isValid).toBe(true)
    expect(svc.sellingPrice).toBeGreaterThan(0)
    expect(prod.priceUnit).toBeCloseTo(svc.sellingPrice, 2)
  })

  it('>>> e o mesmo CMV: a MO do item é a mesma nos dois <<<', () => {
    // Afirma o EFEITO no número intermediário, não só no preço: um preço igual por
    // compensação de dois erros passaria no caso acima e falharia aqui.
    const prod = precoPeloCaminhoDoProduto(TRES_DISTINTOS, ELIANE_USER)
    const svc = precoPeloCaminhoDoServico(TRES_DISTINTOS, ELIANE_USER)
    expect(prod.cmvUnit).toBeCloseTo(svc.totalCost, 2)
    expect(prod.productiveLaborCost).toBeCloseTo(svc.laborCost, 2)
  })

  it('>>> a administrativa e a fixa NÃO desaparecem do preço do produto <<<', () => {
    // O caso que nomeia o defeito. Com os dois termos zerados o preço tem de CAIR; se não
    // cair, eles não estavam participando — que era o estado anterior a esta rodada.
    const comAsDuas = precoPeloCaminhoDoProduto(TRES_DISTINTOS, ELIANE_USER)
    const semAsDuas = precoPeloCaminhoDoProduto({
      ...TRES_DISTINTOS, admin_salary_total: 0, fixed_expense_monthly: 0,
    }, ELIANE_USER)
    expect(comAsDuas.priceUnit).toBeGreaterThan(semAsDuas.priceUnit)
    // e a diferença é a dos 12.000/mês sobre 60 minutos, não um epsilon
    expect(comAsDuas.priceUnit - semAsDuas.priceUnit).toBeGreaterThan(50)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('(c) AS DUAS CÓPIAS DO COMBINADO CONCORDAM — verde antes e depois', () => {
  /**
   * Declarado: este grupo NÃO distingue o antes do depois, porque as duas cópias já
   * concordavam. Ele existe para que a divergência futura seja vermelha em vez de silenciosa
   * — a cópia da tela não era chamável por caso nenhum até hoje.
   */
  const compartilhado = (cfg: Record<string, number>) => custoMensalDeMaoDeObra({
    segmentoDaDespesa: 'SERVICO',
    produtivaMensal: Number(cfg.production_labor_cost_hub) || Number(cfg.production_labor_cost) || 0,
    adminMensal: somaAdmin(cfg),
    fixaMensal: Number(cfg.fixed_expense_monthly) || 0,
  })

  it('>>> a cópia da TELA e a função COMPARTILHADA devolvem o mesmo número <<<', () => {
    for (const cfg of [ELIANE_HOJE, ELIANE_CONGELADO, TRES_DISTINTOS]) {
      expect(combinadoMensalDaTelaDeServico(cfg)).toBe(compartilhado(cfg as unknown as Record<string, number>))
    }
  })

  it('e concordam nos casos de borda que separam `||` de `??`', () => {
    // O `||` do Hub: produtiva do Hub em ZERO cai para o valor manual. É a diferença que um
    // `??` apagaria, e as duas cópias têm de concordar sobre ela.
    const hubZero = { production_labor_cost_hub: 0, production_labor_cost: 1234, admin_salary_total: 0, admin_fgts_total: 0, admin_other_costs: 0, fixed_expense_monthly: 0 }
    expect(combinadoMensalDaTelaDeServico(hubZero)).toBe(1234)
    expect(compartilhado(hubZero as unknown as Record<string, number>)).toBe(1234)

    const vazio = {}
    expect(combinadoMensalDaTelaDeServico(vazio)).toBe(0)
    expect(compartilhado(vazio as unknown as Record<string, number>)).toBe(0)

    expect(combinadoMensalDaTelaDeServico(null)).toBe(0)
    expect(combinadoMensalDaTelaDeServico(undefined)).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('(d) CARACTERIZAÇÃO — o Salão Eliane, medido em produção em 11/10/2026', () => {
  /**
   * Verde antes e depois. Prega os números do tenant vivo: se qualquer um mover, o preço de
   * alguém mudou. É a mesma natureza de `caracterizacao-do-hibrido.test.ts`, e o dono do
   * produto pediu exatamente estes três depois de a medição mostrar que nada há a corrigir
   * no serviço dele.
   */
  it('>>> a carga horária e o custo por minuto são ESTES <<<', () => {
    const w = resolveMonthlyWorkload(
      ELIANE_USER.monthlyWorkloadInMinutes, ELIANE_USER.unitMeasure, ELIANE_USER.numProductiveSectorEmployee,
    )
    expect(w.monthlyWorkloadMinutes).toBe(ELIANE_MINUTOS)
    expect(w.isUnset).toBe(false)
    const combinado = combinadoMensalDaTelaDeServico(ELIANE_HOJE)
    expect(combinado).toBe(11_750)
    expect(combinado / ELIANE_MINUTOS).toBeCloseTo(ELIANE_CUSTO_MINUTO, 12)
  })

  it('>>> os TRÊS preços: 131,14 · 96,63 · 83,78 <<<', () => {
    // Material = `cost_total − labor_cost` de cada linha, medido no banco. Comissão 50%,
    // lucro 15%, regime 0% (MEI — D17). O imposto JÁ é zero no gravado, e é por isso que
    // este caso é caracterização e não correção.
    const casos: ReadonlyArray<readonly [string, number, number, number]> = [
      ['Corte e Barba', 4.00, 60, 131.14],
      ['Hidratação', 12.23, 30, 96.63],
      ['Coloração', 8.00, 30, 83.78],
    ]
    for (const [nome, material, minutos, esperado] of casos) {
      const r = computeServiceSellingPrice({
        materialCost: material,
        commissionPercent: 50,
        profitPercent: 15,
        taxableRegimePercent: 0,
        expenseConfig: ELIANE_CONGELADO,
        taxPreview: null,
        currentUser: ELIANE_USER,
        serviceWorkloadMinutes: minutos,
      } as Parameters<typeof computeServiceSellingPrice>[0])
      expect(`${nome}: ${r.sellingPrice.toFixed(2)}`).toBe(`${nome}: ${esperado.toFixed(2)}`)
    }
  })

  it('>>> a config VIVA já não reproduz o gravado: R$ 0,08 no Corte e Barba <<<', () => {
    // `fato-vs-referencia.md`, medido. Não é defeito desta rodada e não se corrige aqui: o
    // snapshot existe justamente para que o preço gravado continue explicável. O caso prega a
    // diferença para que ela não cresça sem ninguém ver — e o `not` vale tanto quanto o valor.
    const comum: Omit<Parameters<typeof computeServiceSellingPrice>[0], 'expenseConfig'> = {
      materialCost: 4, commissionPercent: 50, profitPercent: 15,
      taxableRegimePercent: 0, taxPreview: null, currentUser: ELIANE_USER, serviceWorkloadMinutes: 60 }
    const peloCongelado = computeServiceSellingPrice({ ...comum, expenseConfig: ELIANE_CONGELADO } as Parameters<typeof computeServiceSellingPrice>[0])
    const peloVivo = computeServiceSellingPrice({ ...comum, expenseConfig: ELIANE_HOJE } as Parameters<typeof computeServiceSellingPrice>[0])
    expect(peloCongelado.sellingPrice).toBeCloseTo(131.14, 2)
    expect(peloVivo.sellingPrice).toBeCloseTo(131.06, 2)
    expect(peloVivo.sellingPrice).not.toBeCloseTo(peloCongelado.sellingPrice, 2)
  })

  it('e o imposto do MEI é ZERO no preço — D17, afirmado pelo CONTRASTE', () => {
    // Sem o par, "o imposto é zero" seria indistinguível de "o campo não chega". Com 7% o
    // preço TEM de subir; se não subir, o parâmetro é inerte e o zero não prova nada.
    const base: Omit<Parameters<typeof computeServiceSellingPrice>[0], 'taxableRegimePercent'> = {
      materialCost: 4, commissionPercent: 50, profitPercent: 15,
      expenseConfig: ELIANE_CONGELADO, taxPreview: null, currentUser: ELIANE_USER, serviceWorkloadMinutes: 60 }
    const semImposto = computeServiceSellingPrice({ ...base, taxableRegimePercent: 0 } as Parameters<typeof computeServiceSellingPrice>[0])
    const comImposto = computeServiceSellingPrice({ ...base, taxableRegimePercent: 7 } as Parameters<typeof computeServiceSellingPrice>[0])
    expect(semImposto.sellingPrice).toBeCloseTo(131.14, 2)
    expect(comImposto.sellingPrice).toBeGreaterThan(semImposto.sellingPrice)
  })
})

// ─────────────────────────────────────────────────────────────────────────────────────────
describe('(e) MICHELE CAMPOS — o `base_price` gravado NÃO é reescrito', () => {
  /**
   * >>> O QUE ESTE GRUPO AFIRMA, E O QUE ELE EXPLICITAMENTE NÃO AFIRMA <<<
   *
   * Ele NÃO afirma reprodução. Medido em 11/10/2026, por consulta ao banco: **nenhum dos 7
   * serviços dela reproduz** com a configuração de hoje, e isso é anterior a esta rodada.
   * Duas causas, as duas medidas:
   *
   * 1. o custo por minuto mudou — a MO gravada implica R$ 12.669,60/mês de combinado, e a
   *    config de hoje dá R$ 10.490,47. Serviços gravados em 01/05/2026, config alterada em
   *    19/07/2026;
   * 2. **nenhum dos 7 tem `expense_snapshot`** — não há construção congelada com que
   *    comparar. `fato-vs-referencia.md`, e é pendência de HISTÓRICO, não desta rodada.
   *
   * Um caso que afirmasse "o motor devolve 130,00" ficaria vermelho hoje por uma razão que
   * não é a desta rodada — seria `baseline-measurement.md` no outro instrumento: medição que
   * parece rigorosa e compara a coisa errada.
   *
   * O que ele afirma é o que o dono do produto pediu: **esta rodada não move o número que o
   * motor devolve para as entradas dela.** Os valores abaixo são os medidos com o código de
   * hoje, e qualquer mudança futura que os mova aparece aqui.
   */
  const MICHELE: CfgDeDespesa = {
    production_labor_cost_hub: 100,
    production_labor_cost: 0,
    admin_salary_total: 0,
    admin_fgts_total: 0,
    admin_other_costs: 0,
    fixed_expense_monthly: 10390.47,
    fixed_expense_percent: 50.06,
    variable_expense_percent: 17.09,
    financial_expense_percent: 3.37,
    // `financial_commitments_percent` é NULL no banco dela — ausente contribui ZERO, e aqui
    // isso é o correto: enquanto a coluna não foi recalculada, o compromisso ainda está
    // dentro de `fixed_expense_monthly`. Ver `build-calc-base.ts`.
  }
  const MICHELE_USER = {
    monthlyWorkloadInMinutes: 80, unitMeasure: 'HOURS', numProductiveSectorEmployee: 1,
  } as const

  it('a carga horária dela é 4.800 min e o combinado R$ 10.490,47', () => {
    const w = resolveMonthlyWorkload(
      MICHELE_USER.monthlyWorkloadInMinutes, MICHELE_USER.unitMeasure, MICHELE_USER.numProductiveSectorEmployee,
    )
    expect(w.monthlyWorkloadMinutes).toBe(4800)
    expect(combinadoMensalDaTelaDeServico(MICHELE)).toBeCloseTo(10_490.47, 2)
  })

  it('>>> e o que o motor devolve para os 7 é ESTE, medido hoje — não o `base_price` <<<', () => {
    // material = `cost_total − labor_cost` de cada linha, medido no banco. A coluna
    // `base_price` gravada vai ao lado, e a asserção `not` é parte do ponto: a divergência é
    // o estado de hoje, e pregá-la impede que ela seja lida como objetivo.
    const casos: ReadonlyArray<readonly [string, number, number, number, number, number]> = [
      // nome,            material, minutos, lucro,  regime, gravado
      ['Aparelho',             3.00, 20, 48.850, 7.095,  130.00],
      ['Clareamento',          7.40, 60, 49.257, 7.095,  390.00],
      ['Harmonização Facial',200.00, 30, 68.841, 2.100, 1000.00],
      ['Ortodontia',           1.60, 20, 54.920, 2.100,  130.00],
      ['Restauração',          2.60, 30, 59.583, 2.100,  220.00],
      ['Toxina Butolínica',  281.30, 20, 59.222, 2.100,  890.00],
    ]
    const medidos: Record<string, number> = {
      'Aparelho': 197.97, 'Clareamento': 597.42, 'Harmonização Facial': 3088.38,
      'Ortodontia': 201.20, 'Restauração': 381.76, 'Toxina Butolínica': 1784.00,
    }
    for (const [nome, material, minutos, lucro, regime, gravado] of casos) {
      const r = computeServiceSellingPrice({
        materialCost: material,
        commissionPercent: 0,
        profitPercent: lucro,
        taxableRegimePercent: regime,
        expenseConfig: MICHELE,
        taxPreview: null,
        currentUser: MICHELE_USER,
        serviceWorkloadMinutes: minutos,
      } as Parameters<typeof computeServiceSellingPrice>[0])
      expect(`${nome}: ${r.sellingPrice.toFixed(2)}`).toBe(`${nome}: ${medidos[nome].toFixed(2)}`)
      // e a divergência contra o gravado É o estado de hoje, não o alvo
      expect(r.sellingPrice).not.toBeCloseTo(gravado, 2)
    }
  })

  it('e a MO administrativa dela é ZERO, então o numerador é produtiva + fixa', () => {
    // O par que impede o grupo de passar por acaso: no caso dela a administrativa não
    // participa (os três campos do Hub estão em zero), e o que carrega o custo por minuto é
    // a despesa FIXA de R$ 10.390,47. Zerá-la tem de derrubar o combinado para R$ 100,00.
    expect(combinadoMensalDaTelaDeServico({ ...MICHELE, fixed_expense_monthly: 0 })).toBe(100)
    expect(custoMensalDeMaoDeObra({
      segmentoDaDespesa: 'SERVICO', produtivaMensal: 100, adminMensal: 0, fixaMensal: 10390.47,
    })).toBeCloseTo(10_490.47, 2)
  })
})
