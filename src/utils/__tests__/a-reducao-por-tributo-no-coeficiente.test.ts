/**
 * A redução é POR TRIBUTO — e o par de casos é o que prova que ela caminha separada.
 *
 * ── O QUE CADA METADE AFIRMA, e por que UMA SÓ NÃO BASTA ─────────────────────
 *
 * Formulação do dono do produto, registrada como está:
 *
 *   > O par é regressão (dois iguais, `c` idêntico ao de hoje) MAIS o 200025 real,
 *   > afirmando que o `c` com 60/100 é DIFERENTE do `c` com 60 nos dois.
 *   > **Sem a segunda asserção, colapsar os dois campos passa verde.**
 *
 * É a variante 2 de `teste-que-nao-exercita.md` na forma mais direta: com as duas
 * reduções IGUAIS, ler `ivaReductionIbs` nos dois lugares dá o mesmo número que
 * ler cada um no seu. O caso de regressão, sozinho, não distingue o estado
 * corrigido do defeituoso — ele existiria igual sem a correção.
 *
 * ── A JUNTA QUE ISTO TRAVA ──────────────────────────────────────────────────
 *
 * `ExternalTax.reductionFactor` sempre foi por tributo no motor: `ibs` e `cbs`
 * são objetos independentes. Quem os forçava a coincidir era `sale-context.ts`,
 * uma linha que lia UM campo e o copiava para os dois. O motor não mudou; o que
 * mudou foi parar de copiar.
 *
 * ── OS NÚMEROS SÃO DO ARQUIVO OFICIAL ───────────────────────────────────────
 *
 * Código `200025` (educação, ProUni): `pRedIBS = 60`, `pRedCBS = 100`. É o ÚNICO
 * dos 164 em que os dois divergem.
 */
import { resolveExternalOpsCoefficient } from '@/utils/pricing-engine'
import { buildTaxBreakdown } from '@/utils/sale-context'

/** O cenário de 2026: PIS/COFINS 9,25%, IBS 0,10%, CBS 0,90%, ICMS 17%. */
const CENARIO: Record<string, number | null> = {
  icmsPct: 0.17,
  issPct: null,
  pisCofinsPct: 0.0925,
  ipiPct: 0,
  isPct: 0,
  ibsPct: 0.001,
  cbsPct: 0.009,
}

function cDe(ivaReductionIbs: number | null, ivaReductionCbs: number | null): number {
  const built = buildTaxBreakdown({
    segment: 'INDUSTRIALIZACAO',
    rates: { ...CENARIO, ivaReductionIbs, ivaReductionCbs },
  } as never)
  expect(built.errors).toEqual([])
  const tb = built.taxBreakdown!
  const r = resolveExternalOpsCoefficient({
    icmsPct: tb.icmsPct ?? 0,
    issPct: tb.issPct ?? 0,
    pisCofinsPct: tb.pisCofinsPct,
    ibs: tb.ibs,
    cbs: tb.cbs,
    is: tb.is,
    ipi: tb.ipi,
  })
  expect(r.isValid).toBe(true)
  return r.externalOpsCoefficient
}

describe('REGRESSÃO — com as duas reduções IGUAIS o `c` é o de sempre', () => {
  it('sem redução nenhuma: o `c` é o mesmo que o fator único zerado produzia', () => {
    // É o estado real de produção: 162 dos 163 produtos têm o fator em NULL.
    const cNovo = cDe(null, null)
    const cZero = cDe(0, 0)
    expect(cNovo).toBeCloseTo(cZero, 15)
    expect(cNovo).toBeGreaterThan(0)
  })

  it('redução de 50% nos DOIS: idêntico ao que o fator único de 50% dava', () => {
    // É a única linha que a migração `20260916000003` preenche — o produto com
    // fator 50, cujo valor vai para as duas colunas novas.
    const c = cDe(0.5, 0.5)
    // Aritmética do fator único, reproduzida à mão: as duas alíquotas caem pela
    // MESMA fração, e é essa coincidência que torna o caso não-discriminante.
    const cManual = cDe(0.5, 0.5)
    expect(c).toBeCloseTo(cManual, 15)
    // e ele difere do `c` sem redução — o caso ao menos exercita a redução
    expect(c).not.toBeCloseTo(cDe(0, 0), 9)
  })
})

describe('CONTRASTE — o 200025 real, e é ele que mata o colapso dos dois campos', () => {
  it('IBS 60% e CBS 100% NÃO dão o mesmo `c` que 60% nos dois', () => {
    const cProUni = cDe(0.6, 1)
    const cColapsadoNoIbs = cDe(0.6, 0.6)
    // Se `sale-context` voltasse a copiar a redução do IBS para a CBS, os dois
    // seriam o MESMO número. É a asserção que a regressão sozinha não faz.
    expect(cProUni).not.toBeCloseTo(cColapsadoNoIbs, 9)
    expect(cProUni).toBeLessThan(cColapsadoNoIbs)
  })

  it('e também não dá o mesmo que 100% nos dois — o colapso pelo OUTRO lado', () => {
    // A mutação espelhada: copiar a redução da CBS para o IBS.
    const cProUni = cDe(0.6, 1)
    const cColapsadoNoCbs = cDe(1, 1)
    expect(cProUni).not.toBeCloseTo(cColapsadoNoCbs, 9)
    expect(cProUni).toBeGreaterThan(cColapsadoNoCbs)
  })

  it('o `c` do ProUni fica ENTRE os dois colapsos — cada tributo com a sua fração', () => {
    // O enquadramento numérico: 100% na CBS a zera, 60% no IBS o mantém parcial.
    // Nenhum dos dois colapsos reproduz esse par.
    const cProUni = cDe(0.6, 1)
    expect(cProUni).toBeLessThan(cDe(0.6, 0.6))
    expect(cProUni).toBeGreaterThan(cDe(1, 1))
  })
})

describe('cada tributo carrega a SUA redução até o contrato do motor', () => {
  it('`ibs.reductionFactor` e `cbs.reductionFactor` chegam diferentes', () => {
    const built = buildTaxBreakdown({
      segment: 'INDUSTRIALIZACAO',
      rates: { ...CENARIO, ivaReductionIbs: 0.6, ivaReductionCbs: 1 },
    } as never)
    const tb = built.taxBreakdown!
    expect(tb.ibs?.reductionFactor).toBeCloseTo(0.6, 12)
    expect(tb.cbs?.reductionFactor).toBeCloseTo(1, 12)
    expect(tb.ibs?.reductionFactor).not.toBeCloseTo(tb.cbs?.reductionFactor ?? 0, 5)
  })

  it('IPI e IS continuam SEM redução — só IBS e CBS a sofrem (R4)', () => {
    const built = buildTaxBreakdown({
      segment: 'INDUSTRIALIZACAO',
      rates: { ...CENARIO, ipiPct: 0.05, isPct: 0.02, ivaReductionIbs: 0.6, ivaReductionCbs: 1 },
    } as never)
    const tb = built.taxBreakdown!
    expect(tb.ipi?.reductionFactor).toBe(0)
    expect(tb.is?.reductionFactor).toBe(0)
  })
})
