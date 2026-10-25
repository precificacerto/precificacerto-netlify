/**
 * O `c` DA CONSTRUÇÃO É CONGELADO COM O PREÇO.
 *
 * `products.external_ops_coefficient` existe desde a migração `20260915000003`, com este
 * comentário no catálogo:
 *
 *   "R3 — o `c` que ESTA construção usou, congelado junto com o preço. FATO HISTÓRICO, não
 *    referência viva (docs/regras/fato-vs-referencia.md): decompor um preço antigo com o
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
 * `docs/regras/teste-que-nao-exercita.md`: o defeito É a ausência da gravação, e não há
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
      ipiPct: 0, isPct: 0, ibsPct: ibsPct / 100, cbsPct: cbsPct / 100, ivaReductionIbs: null, ivaReductionCbs: null,
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
    // >>> O LADO `null` MUDOU DE REGIME NO PASSO XI-3 (11/10/2026) <<<
    // Era `LUCRO_PRESUMIDO`, e ele passou a TER matriz — `REGIMES_COM_MATRIZ` deixou de ser
    // `['LUCRO_REAL']` e virou leitura da célula. O par continua existindo, agora contra o
    // MEI, que segue sem operação por fora e portanto sem `c` apurado.
    // A distinção que o caso protege é a mesma: `0` é "a matriz governou e não há tributo por
    // fora", apurado; `null` é "não há regra escrita para este regime", não apurado.
    expect(aCongelar(construir(0, 0))).not.toBeNull()
    expect(aCongelar(construir(1, 8.8, 'MEI'))).toBeNull()
  })

  // ═════════════════════════════════════════════════════════════════════════════════════════
  // 7b — O QUE O XI-3 MUDOU NA GRAVAÇÃO. Medido, não suposto.
  // ═════════════════════════════════════════════════════════════════════════════════════════

  it('>>> PRESUMIDO e RET passam a gravar NÚMERO — a prova POSITIVA do XI-3 <<<', () => {
    // Antes do XI-3 os dois gravavam `null` ("regime sem matriz escrita"). A matriz passou a
    // governá-los, então o `c` deles é APURADO e vai para a coluna como número.
    for (const regime of ['LUCRO_PRESUMIDO', 'LUCRO_PRESUMIDO_RET'] as const) {
      const c = construir(1, 8.8, regime)
      expect(c.applied).toBe(true)
      const v = aCongelar(c)
      expect(v).not.toBeNull()
      // e cabe na CHECK do banco, igual ao Lucro Real
      expect(v!).toBeGreaterThanOrEqual(0)
      expect(v!).toBeLessThan(1)
    }
  })

  it('o par `null` × `0` segue VIVO — contra Simples e MEI, que não têm por fora', () => {
    // Sem este caso a distinção de `ausente-vs-falso` ficaria sem portão depois do XI-3: os
    // dois regimes que a sustentavam (Presumido e RET) mudaram de lado.
    for (const regime of ['SIMPLES_NACIONAL', 'MEI'] as const) {
      const c = construir(1, 8.8, regime)
      expect(c.applied).toBe(false)
      expect(aCongelar(c)).toBeNull()
      expect(aCongelar(c)).not.toBe(0)
    }
    // e o lado `0`: matriz governou, sem tributo por fora → apurado e vale nada
    expect(aCongelar(construir(0, 0))).toBe(0)
  })

  it('>>> LINHA ANTIGA com `null` relida DEPOIS do XI-3: a guarda `!= null` continua de pé <<<', () => {
    // >>> É O CASO QUE O PO PEDIU, E ELE TRAVA UMA PROPRIEDADE MEDIDA <<<
    //
    // Medição de 11/10/2026 (itens 7c e 7d): a coluna `external_ops_coefficient` tem
    // exatamente TRÊS pontos de contato em `src`, e NENHUM faz conta com ela —
    // `content.component.tsx:509-511` lê para inicializar o ref, `:525` atualiza quando o
    // `ProductPrice` emite, `:1367` grava. Não há soma, média nem leitura agregada, em `src`
    // nem em `supabase/functions/`.
    //
    // Logo não existe caminho em que uma linha antiga (`null`) entre numa conta junto com
    // linhas novas (número). O que existe é a RELEITURA por produto, e ela depende da guarda
    // `!= null` de `:509-511`, cuja razão está escrita lá: um save sem novo cálculo não pode
    // APAGAR o coeficiente de uma construção anterior.
    //
    // Este caso afirma a guarda, para que a próxima pessoa não precise medir de novo.
    const guardaDoRef = (gravado: unknown): number | null =>
      gravado != null ? Number(gravado) : null

    // a linha ANTIGA, gravada antes de a coluna existir ou antes do XI-3
    expect(guardaDoRef(null)).toBeNull()
    expect(guardaDoRef(undefined)).toBeNull()
    // a linha NOVA, do Presumido depois do XI-3
    const novo = aCongelar(construir(1, 8.8, 'LUCRO_PRESUMIDO'))
    expect(guardaDoRef(novo)).toBe(novo)
    // >>> E O ZERO NÃO É CONFUNDIDO COM AUSENTE — é o que `!= null` compra sobre `!gravado` <<<
    // Um `gravado ? Number(gravado) : null` leria o zero legítimo como nunca apurado.
    expect(guardaDoRef(0)).toBe(0)
    expect(guardaDoRef(0)).not.toBeNull()
    // a expressão afirmada é a do componente, não uma cópia da regra aqui
    const src = ler('page-parts/products/content.component.tsx')
    expect(src).toContain("(product as any)?.external_ops_coefficient != null ? Number((product as any).external_ops_coefficient) : null")
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
    // tipo que entra em duas e esquece a terceira — `docs/regras/copia-divergente.md`.
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
