/**
 * AS QUATRO POR FORA GANHAM A BASE LEGAL E A ALÍQUOTA NOMINAL — NT 2025.002 da NF-e.
 *
 * "0,6830% não é alíquota de nada. Na NF-e, pIBS é 1,00% e vBC é a base do código 4. O valor
 *  em R$ está certo; o par base-alíquota não. E você está certo em não inferir por divisão —
 *  a regra da matriz proíbe, e foi exatamente assim que a Etapa 8 errava."
 *
 * >>> A MEDIÇÃO QUE ACHOU O PONTO: o campo EXISTIA e não era passado <<<
 *
 *   pricing-engine.ts:998        { effectiveRate, baseCode, basePctOfTotal, valuePctOfTotal }
 *   budget-accessories.ts:454    parcela(nome) = valuePctOfTotal      ← PERDIA três dos quatro
 *   budget-decomposition-input   repassava o que recebeu
 *   decomposition-dre.ts         pctPerItem = externalByTax[nome]
 *
 * A base do código 4 é `alfa_k + beta_k × c`, e o motor já a resolvia no passo 4 do `c` —
 * "não é conta nova: é o mesmo par (alfa, beta) do passo 3, agora resolvido", diz o próprio
 * comentário dele. A perda estava numa função de duas linhas que projetava quatro campos num
 * número.
 *
 * >>> A NT 2025.002 PEDE TRÊS ALÍQUOTAS, NÃO UMA <<<
 * O grupo `gRed` traz a nominal, `pRedAliq` (o percentual de redução) e `pAliqEfet` (a
 * efetiva, derivada das duas). Uma efetiva de 0,40% cabe em infinitos pares
 * (nominal, redutor) — devolver só ela obriga quem monta a nota a inventar os outros dois.
 *
 * A CÉLULA exibe base e efetiva, como já faz com o ICMS. A nominal e o redutor ficam no
 * dado, para quem for montar a nota.
 */

import { resolveExternalOpsCoefficient } from '@/utils/pricing-engine'
import { resolveItemFicha } from '@/utils/budget-accessories'
import { buildDecomposition } from '@/utils/decomposition-dre'
import { buildBudgetDecompositionInput } from '@/utils/budget-decomposition-input'
import { celulaDoProduto } from '@/lib/decomposition-pdf'

describe('1. O MOTOR devolve os quatro números, e eles fecham entre si', () => {
  const c = resolveExternalOpsCoefficient({
    icmsPct: 0.17, issPct: 0, pisCofinsPct: 0.0925,
    ibs: { rate: 0.01, reductionFactor: 0.6, baseCode: 4 },
    cbs: { rate: 0.09, reductionFactor: 0, baseCode: 4 },
    is: { rate: 0.02, reductionFactor: 0, baseCode: 1 },
    ipi: { rate: 0.05, reductionFactor: 0, baseCode: 1 },
  })

  it('COM fator de redução 60%: nominal 1,00%, redutor 60,00%, efetiva 0,40%', () => {
    const ibs = c.externalTaxes.ibs!
    expect(ibs.nominalRate).toBeCloseTo(0.01, 12)
    expect(ibs.reductionFactor).toBeCloseTo(0.6, 12)
    expect(ibs.effectiveRate).toBeCloseTo(0.004, 12)
    // O discriminante: sem o redutor viajando, a efetiva de 0,40% cabe em infinitos pares.
    // O CBS, sem redução, tem nominal IGUAL à efetiva — e é o contraste que separa os dois.
    expect(c.externalTaxes.cbs!.nominalRate).toBeCloseTo(c.externalTaxes.cbs!.effectiveRate, 12)
    expect(ibs.nominalRate).not.toBeCloseTo(ibs.effectiveRate, 4)
  })

  it('base × alíquota efetiva = valor, para os QUATRO', () => {
    for (const nome of ['ibs', 'cbs', 'is', 'ipi'] as const) {
      const t = c.externalTaxes[nome]!
      expect(t.effectiveRate * t.basePctOfTotal).toBeCloseTo(t.valuePctOfTotal, 14)
    }
  })

  it('e a soma dos valores é o próprio `c` — o invariante da R3', () => {
    const soma = (['ibs', 'cbs', 'is', 'ipi'] as const)
      .reduce((a, n) => a + c.externalTaxes[n]!.valuePctOfTotal, 0)
    expect(soma).toBeCloseTo(c.externalOpsCoefficient, 12)
  })

  it('as bases DIFEREM entre códigos — 1 é o total, 4 é o total menos os por dentro', () => {
    // Sem isto, "a base é a do código configurado" passaria com todas iguais a 1.
    expect(c.externalTaxes.is!.baseCode).toBe(1)
    expect(c.externalTaxes.ibs!.baseCode).toBe(4)
    expect(c.externalTaxes.is!.basePctOfTotal).toBeGreaterThan(c.externalTaxes.ibs!.basePctOfTotal)
    expect(c.externalTaxes.ibs!.basePctOfTotal).toBeLessThan(1)
  })
})

describe('2. A FICHA carrega os quatro mapas, e não mais um só', () => {
  const f = resolveItemFicha({
    segment: 'INDUSTRIALIZACAO',
    rates: {
      icmsPct: 0.17, issPct: null, pisCofinsPct: 0.0925,
      ipiPct: 0, isPct: 0, ibsPct: 0.01, cbsPct: 0.09,
      // R4 — a redução vale só para IBS e CBS, e desde 16/09/2026 são DUAS: ela DECORRE
      // do cClassTrib, e a tabela oficial separa `pRedIBS` de `pRedCBS`. Em FRAÇÃO: a
      // travessia percentual→fração é de `reductionFactorPctToFraction`, e não daqui.
      //
      // Os valores são os do código 200025 (educação, ProUni): 60% no IBS, 100% na CBS.
      // É o ÚNICO dos 164 em que os dois divergem, e é por isso que ele está aqui — com
      // valores iguais este caso não distinguiria "dois campos" de "um campo copiado".
      ivaReductionIbs: 0.6,
      ivaReductionCbs: 1,
    } as never,
  }).ficha!

  it('nominal, redutor, efetiva e base, cada um no seu mapa', () => {
    expect(f.externalNominalByTax.ibs).toBeCloseTo(0.01, 12)
    expect(f.externalReductionByTax.ibs).toBeCloseTo(0.6, 12)
    expect(f.externalRateByTax.ibs).toBeCloseTo(0.004, 12)
    expect(f.externalBaseByTax.ibs).toBeGreaterThan(0)
    expect(f.externalBaseByTax.ibs).toBeLessThan(1)
    // O CBS tem a SUA redução, e ela é OUTRA. Até 16/09/2026 este caso afirmava que o
    // fator era "do produto, não do tributo" — era a junta escrita como asserção.
    expect(f.externalReductionByTax.cbs).toBeCloseTo(1, 12)
    expect(f.externalNominalByTax.cbs).toBeCloseTo(0.09, 12)
    // 100% de redução zera a alíquota. Com o fator único de 60% ela sairia 3,60%.
    expect(f.externalRateByTax.cbs).toBeCloseTo(0, 12)
    expect(f.externalRateByTax.cbs).not.toBeCloseTo(0.036, 5)
  })

  it('AS DUAS REDUÇÕES CAMINHAM SEPARADAS — é o que um campo só não conseguia dizer', () => {
    // O contraste, e é ele que mata o colapso dos dois campos num só: se a CBS lesse a
    // redução do IBS, os dois redutores seriam 0,6 e as duas efetivas seriam proporcionais
    // à mesma fração.
    expect(f.externalReductionByTax.ibs).not.toBeCloseTo(f.externalReductionByTax.cbs, 5)
    expect(f.externalReductionByTax.ibs).toBeCloseTo(0.6, 12)
    expect(f.externalReductionByTax.cbs).toBeCloseTo(1, 12)
  })

  it('e `externalByTax` continua sendo o VALOR — é o que a R17 quer para o DRE', () => {
    // Se ele mudasse, o DRE se moveria. O caso afirma a identidade que o mantém no lugar.
    expect(f.externalByTax.ibs).toBeCloseTo(f.externalRateByTax.ibs * f.externalBaseByTax.ibs, 14)
    expect(f.externalByTax.ibs).not.toBeCloseTo(f.externalRateByTax.ibs, 5)
    expect(f.externalByTax.ibs).not.toBeCloseTo(f.externalNominalByTax.ibs, 5)
  })
})

describe('3. A COLUNA exibe a base do código 4 com a alíquota EFETIVA', () => {
  const ITENS = [
    { key: 'a', label: 'P1', quantity: 1, unitPrice: 12345.67, costUnit: 3000.11, productiveLaborUnit: 0,
      commissionPct: 5, profitPct: 10, rtPct: 0, acrescimos: 0,
      rates: { icms_pct: 17, pis_pct: 1.53, cofins_pct: 7.05, ibs_pct: 1, cbs_pct: 9, is_pct: 0, ipi_pct: 0 } },
    { key: 'b', label: 'P2', quantity: 2, unitPrice: 3456.79, costUnit: 800.33, productiveLaborUnit: 0,
      commissionPct: 8, profitPct: 6, rtPct: 0, acrescimos: 0,
      rates: { icms_pct: 12, pis_pct: 1.53, cofins_pct: 7.05, ibs_pct: 0.5, cbs_pct: 4, is_pct: 0, ipi_pct: 5 } },
    { key: 'c', label: 'P3', quantity: 5, unitPrice: 789.01, costUnit: 200.19, productiveLaborUnit: 0,
      commissionPct: 3, profitPct: 12, rtPct: 0, acrescimos: 0,
      rates: { icms_pct: 7, pis_pct: 1.53, cofins_pct: 7.05, ibs_pct: 0, cbs_pct: 0, is_pct: 0, ipi_pct: 0 } },
  ]
  const r = buildDecomposition(buildBudgetDecompositionInput({
    items: ITENS as never, discountPct: 0.05, despesasOperacionaisPct: 0.2292,
  }).input)
  const L = (k: string) => r.rows.find((x) => x.key === k)!

  it('base × alíquota = valor, POR ITEM, nas quatro linhas por fora', () => {
    // É o invariante que prova que a célula não inventa. Antes ele passava também — com a
    // base errada e a alíquota derivada para compensar. O que o separa do estado anterior é
    // o caso seguinte, que afirma QUAL alíquota.
    for (const k of ['por_fora_ibs', 'por_fora_cbs', 'por_fora_is', 'por_fora_ipi']) {
      const x = L(k)
      x.perItem.forEach((v, i) => {
        if (x.basePerItem[i] === 0) return
        expect(Math.abs(v)).toBeCloseTo(x.basePerItem[i] * x.pctPerItem[i], 8)
      })
    }
  })

  it('e a alíquota é a CADASTRADA — 1,00% e 9,00%, não 0,6830% e 6,1467%', () => {
    expect(L('por_fora_ibs').pctPerItem[0]).toBeCloseTo(0.01, 12)
    expect(L('por_fora_cbs').pctPerItem[0]).toBeCloseTo(0.09, 12)
    expect(L('por_fora_ibs').pctPerItem[1]).toBeCloseTo(0.005, 12)
    expect(L('por_fora_ipi').pctPerItem[1]).toBeCloseTo(0.05, 12)
  })

  it('a base é MENOR que a receita de produtos — código 4 exclui os por dentro', () => {
    const rp = L('receita_produtos').perItem
    L('por_fora_ibs').basePerItem.forEach((b, i) => {
      if (b === 0) return
      expect(b).toBeLessThan(rp[i])
    })
    // O IPI é código 1: a base dele É o total geral do item. As duas bases divergem de
    // verdade no segundo produto, que tem os dois.
    expect(L('por_fora_ipi').basePerItem[1]).toBeGreaterThan(L('por_fora_ibs').basePerItem[1])
  })

  it('>>> O DRE NÃO SE MOVEU — `externalByTax` continua mandando no valor <<<', () => {
    // O valor da linha é `receita de produtos × externalByTax`, e ele não mudou: o par novo
    // é só o que a célula EXIBE. Se o valor tivesse virado `base × alíquota` calculado aqui,
    // o residual acusaria.
    expect(r.residual.total).toBeCloseTo(0, 6)
    const porFora = ['por_fora_ibs', 'por_fora_cbs', 'por_fora_is', 'por_fora_ipi']
      .reduce((a, k) => a + Math.abs(L(k).total), 0)
    expect(porFora).toBeCloseTo(Math.abs(L('receita_produtos').total - L('operacao_por_dentro').total), 6)
  })

  it('a célula imprime base e efetiva, e o terceiro produto sai com 0,00%', () => {
    const c0 = celulaDoProduto(L('por_fora_ibs'), 0).replace(/ /g, ' ').split('\n')
    expect(c0).toHaveLength(3)
    expect(c0[1]).toMatch(/^base R\$ /)
    expect(c0[2]).toBe('1,00%')
    // Zero CADASTRADO é afirmação: o produto não tem IBS, e a célula diz isso.
    expect(celulaDoProduto(L('por_fora_ibs'), 2).replace(/ /g, ' ').split('\n')[2]).toBe('0,00%')
  })
})

describe('4. Trace LEGADO, sem a abertura: a célula OMITE o par em vez de derivar', () => {
  const r = buildDecomposition({
    items: [{
      id: 'a', label: 'P1', totalProduto: 10000, custo: 3000, acrescimos: 0,
      taxes: { icmsPct: 0.17, issPct: 0, pisCofinsPct: 0.0925, externalOpsCoefficient: 0.08 },
    }],
    categories: { despesasOperacionaisPct: 0.2, rtPct: 0, comissaoPct: 0.05, lucroPct: 0.1, irpjPct: 0.015, csllPct: 0.009 },
    discountPct: 0, itensManuaisComAcrescimos: 0,
  })
  const agregada = r.rows.find((x) => x.key === 'por_fora')!

  it('a linha agregada não recebe base nem alíquota — o `c` não é alíquota de nada', () => {
    // Derivar aqui seria exatamente o que a Etapa 8 fazia: `valor ÷ receita` apresentado
    // como taxa. Melhor a célula com o valor só (`regime-e-segmento-...`).
    expect(agregada.basePerItem).toEqual([])
    expect(agregada.pctPerItem).toEqual([])
    expect(celulaDoProduto(agregada, 0).split('\n')).toHaveLength(1)
  })

  it('e o valor dela continua correto — o DRE do legado não regrediu', () => {
    expect(Math.abs(agregada.total)).toBeCloseTo(10000 * 0.08, 6)
  })
})
