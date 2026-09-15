/**
 * O `c` DA CONSTRUÇÃO É CONGELADO COM O PREÇO.
 *
 * `products.external_ops_coefficient` existe desde a migração `20260915000003`, com este
 * comentário no catálogo:
 *
 *   "R3 — o `c` que ESTA construção usou, congelado junto com o preço. FATO HISTÓRICO, não
 *    referência viva (.claude/rules/fato-vs-referencia.md): decompor um preço antigo com o
 *    `c` de hoje reescreve o passado. NULL = preço formado antes desta coluna existir."
 *
 * Consultado o banco: a coluna está `NULL` em TODOS os produtos — inclusive nos que têm
 * IBS/CBS e cujo preço já foi formado com `c` ≠ 0. A coluna existia e nada a gravava, então
 * o `NULL` dizia "preço anterior à coluna" sobre preços que não eram.
 *
 * É a 7ª aparição da classe de `fato-vs-referencia.md`, com uma diferença que vale registrar:
 * nas seis anteriores faltava a DECISÃO de congelar. Aqui a decisão estava tomada, escrita no
 * comentário da coluna e com a CHECK no lugar — faltava a GRAVAÇÃO. O default silencioso não
 * veio de ninguém ter esquecido de decidir; veio de a decisão não ter chegado ao código.
 *
 * >>> POR QUE O TESTE É ASSIM <<<
 * O save vive no componente, e a suíte não tem teste de componente. O que se pode afirmar por
 * EFEITO é o VALOR a congelar — que sai de `buildProductConstruction` —, e é o que os blocos
 * 1 e 2 fazem. O bloco 3 afirma o caminho, que é o caso-limite honesto de
 * `.claude/rules/teste-que-nao-exercita.md`: o defeito É a ausência da gravação, e não há
 * efeito numérico a medir nela.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { buildProductConstruction, externalOpsCoefficientToFreeze } from '@/utils/product-price-construction'

const raiz = join(__dirname, '..', '..')
const ler = (p: string) => readFileSync(join(raiz, p), 'utf-8')

function construir(ibsPct: number, cbsPct: number, regime = 'LUCRO_REAL') {
  return buildProductConstruction({
    taxableRegime: regime,
    segment: 'INDUSTRIALIZACAO',
    buyerType: 'CONSUMIDOR_FINAL',
    saleScope: 'INTRAESTADUAL',
    costTotal: 798.60,
    structurePct: 0.1792, rtReservePct: 0, commissionPct: 0.02, profitPct: 0.02, profitTaxPct: 0.01,
    rates: {
      icmsPct: 0.17, issPct: null, pisCofinsEffectivePct: 0.076775,
      ipiPct: 0, isPct: 0, ibsPct: ibsPct / 100, cbsPct: cbsPct / 100, ivaDualReductionFactor: null,
    },
    despAcessorias: 0,
  })
}

/**
 * A MESMA função que o componente emite — não uma cópia da regra aqui. Reescrever
 * `applied ? … : null` neste arquivo faria o teste concordar consigo mesmo.
 */
const aCongelar = externalOpsCoefficientToFreeze

describe('1. O VALOR congelado é o que a construção usou', () => {
  it('com IBS 1,00% + CBS 8,80%, é 6,7787% — o mesmo que formou o preço', () => {
    const c = construir(1.00, 8.80)
    expect(aCongelar(c)).toBeCloseTo(0.067787, 6)
    // Ligado ao preço, e não só ao número: é `P ÷ (1 − c)` que dá o total geral (R8).
    expect(c.opInterna / (1 - aCongelar(c)!)).toBeCloseTo(c.totalGeral, 2)
  })

  it('cabe na CHECK do banco: NULL, ou [0, 1)', () => {
    for (const [ibs, cbs] of [[0, 0], [1, 8.8], [0.1, 0.9], [5, 5]]) {
      const v = aCongelar(construir(ibs, cbs))
      expect(v).not.toBeNull()
      expect(v!).toBeGreaterThanOrEqual(0)
      expect(v!).toBeLessThan(1)
    }
  })
})

describe('2. ZERO e AUSENTE são gravados diferente', () => {
  it('matriz governou e não há tributo por fora → grava ZERO, que é apurado', () => {
    const c = construir(0, 0)
    expect(c.applied).toBe(true)
    expect(aCongelar(c)).toBe(0)
  })

  it('matriz NÃO governou → grava NULL, que é "não apurado"', () => {
    const c = construir(1.00, 8.80, 'SIMPLES_NACIONAL')
    expect(c.applied).toBe(false)
    // O discriminante: os dois casos acima produzem preços por caminhos diferentes, e um
    // `0` aqui afirmaria que alguém apurou o coeficiente do Simples e deu zero.
    expect(aCongelar(c)).toBeNull()
  })

  it('e os dois NÃO são o mesmo valor — é o ponto de `ausente-vs-falso`', () => {
    expect(aCongelar(construir(0, 0))).not.toBeNull()
    expect(aCongelar(construir(1, 8.8, 'LUCRO_PRESUMIDO'))).toBeNull()
  })
})

describe('3. A GRAVAÇÃO existe, e sai de um handler só', () => {
  const content = ler('page-parts/products/content.component.tsx')
  const price = ler('page-parts/products/product-price.component.tsx')

  it('o save grava a coluna', () => {
    expect(content).toContain('extraFields.external_ops_coefficient = externalOpsCoefficientRef.current')
  })

  it('o `c` viaja JUNTO do preço, no mesmo evento', () => {
    // Separar os dois deixaria gravar um coeficiente que não é o da construção que produziu
    // aquele preço — exatamente o que a coluna existe para impedir.
    expect(price).toContain('externalOpsCoefficient: externalOpsCoefficientToFreeze(_matriz)')
  })

  it('há UM handler, não três literais iguais', () => {
    // Eram três cópias do mesmo literal, uma por `<Content*>`. O campo novo é justamente o
    // tipo que entra em duas e esquece a terceira — `.claude/rules/copia-divergente.md`.
    expect((content.match(/onFinalPriceWithTaxesChange=\{handleFinalPriceWithTaxes\}/g) || []).length).toBe(3)
    expect(content).not.toMatch(/onFinalPriceWithTaxesChange=\{\(d\) =>/)
  })

  it('o ref começa com o que JÁ está gravado — save sem recálculo não apaga', () => {
    expect(content).toContain("(product as any)?.external_ops_coefficient != null")
  })

  it('a coluna que o save usa é a que a migração criou', () => {
    const sql = readFileSync(
      join(raiz, '..', 'supabase', 'migrations', '20260915000003_base_codes_e_coeficiente_por_fora_em_products.sql'),
      'utf-8',
    )
    expect(sql).toContain('external_ops_coefficient numeric(12, 8)')
    expect(sql).toContain('external_ops_coefficient >= 0 AND external_ops_coefficient < 1')
  })
})
