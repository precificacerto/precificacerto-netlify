/**
 * O CAMPO SOME ONDE A MATRIZ DIZ INEXISTENTE — e a recusa, quando sobra, é VISÍVEL.
 *
 * Decisão do dono do produto, 17/09/2026, registrada como está:
 *
 *   "O CAMPO SOME. IPI não aparece em revenda. Se o tributo não existe no segmento, não
 *    há campo. Some também o IS, e qualquer outro que a matriz diga INEXISTENTE no
 *    segmento. NÃO TRATE O IPI COMO CASO ESPECIAL — a matriz é a fonte."
 *
 *   "NÃO BLOQUEIE O SAVE. Mas o SILÊNCIO acaba. O preço tem que ficar visivelmente
 *    não-formado, dizendo por quê. Salvar continua permitido; fingir que a conta saiu, não."
 *
 * ── O DEFEITO MEDIDO, em 17/09/2026 ──────────────────────────────────────────
 *
 * Tela de produto em REVENDA, custo R$ 1.250, ICMS 17%, PIS/COFINS efetivo 7,678%,
 * IBS 1%, CBS 9%:
 *
 * |               | `applied` | `c`     | MC       | P        |
 * |---------------|-----------|--------:|---------:|---------:|
 * | **com IPI 9%**| **false** | **0**   | 43,2020% | 2.893,38 |
 * | sem IPI       | true      | 6,9055% | 39,6750% | 3.150,59 |
 *
 * O campo aceitava a alíquota; `buildProductConstruction` recusava com
 * `reason = 'alíquota declarada onde a matriz diz INEXISTENTE'`; o componente descartava
 * `applied`, `reason` E `errors` — medido: ZERO ocorrências de `_matriz.reason` fora do
 * módulo — e caía em `computeIvaDualOutside`, que soma por cima. A R9:
 *
 *   "Somar o IPI por cima do preço sem IPI é erro, não atalho."
 *
 * ── O CONTRASTE É O QUE FAZ ESTE ARQUIVO VALER ───────────────────────────────
 *
 * Um caso que só afirmasse "o IPI não aparece em revenda" passaria num `if` que nomeia o
 * IPI — e aí acrescentar um tributo à matriz não mudaria a tela, e mudar uma célula não
 * mudaria o campo. Por isso TODO caso aqui exercita mais de um segmento e mais de um
 * tributo, e um deles afirma a matriz INTEIRA célula a célula.
 */

import {
  apenasTributosQueExistem,
  tributoExisteNoSegmento,
} from '@/utils/campos-do-segmento'
import { TAX_MATRIX, type CalcType, type TaxName } from '@/utils/pricing-engine'
import { buildProductConstruction } from '@/utils/product-price-construction'
import { buildProductPriceRows } from '@/utils/product-price-rows'
import { resolveSegmentoDaConstrucao } from '@/utils/despesas-do-segmento'
import { readFileSync } from 'fs'
import { join } from 'path'

const TRIBUTOS: TaxName[] = ['ICMS', 'ISS', 'PIS_COFINS', 'IPI', 'IS', 'IBS', 'CBS']
const SEGMENTOS: CalcType[] = ['INDUSTRIALIZACAO', 'REVENDA', 'SERVICO']

describe('1. A MATRIZ decide, e nenhum tributo é nomeado na condição', () => {
  it('>>> o IPI EXISTE em industrialização e NÃO existe em revenda <<<', () => {
    expect(tributoExisteNoSegmento('INDUSTRIALIZACAO', 'IPI')).toBe(true)
    expect(tributoExisteNoSegmento('REVENDA', 'IPI')).toBe(false)
    expect(tributoExisteNoSegmento('SERVICO', 'IPI')).toBe(false)
  })

  it('e o IS some no SERVIÇO, onde o IPI também some — não é regra do IPI', () => {
    // O discriminante contra um `if` que nomeie o IPI: aqui é OUTRO tributo sumindo,
    // em OUTRO segmento. Um caso só com IPI não distinguiria os dois desenhos.
    expect(tributoExisteNoSegmento('REVENDA', 'IS')).toBe(true)
    expect(tributoExisteNoSegmento('SERVICO', 'IS')).toBe(false)
    // E o ICMS e o ISS trocam de lugar entre mercadoria e serviço.
    expect(tributoExisteNoSegmento('REVENDA', 'ICMS')).toBe(true)
    expect(tributoExisteNoSegmento('SERVICO', 'ICMS')).toBe(false)
    expect(tributoExisteNoSegmento('REVENDA', 'ISS')).toBe(false)
    expect(tributoExisteNoSegmento('SERVICO', 'ISS')).toBe(true)
  })

  it('a função É a matriz — as 21 células, uma a uma', () => {
    // Afirma a TABELA inteira contra a fonte. Qualquer célula que mude e a função não
    // acompanhe quebra aqui, sem precisar de um caso por tributo.
    let inexistentes = 0
    for (const seg of SEGMENTOS) {
      for (const t of TRIBUTOS) {
        const existe = TAX_MATRIX[seg][t] !== 'INEXISTENTE'
        expect(tributoExisteNoSegmento(seg, t)).toBe(existe)
        if (!existe) inexistentes += 1
      }
    }
    // 21 células; 6 são INEXISTENTE (ISS em 2, IPI em 2, ICMS em 1, IS em 1). Sem esta
    // contagem, uma matriz que virasse toda POR_DENTRO passaria no laço acima.
    expect(SEGMENTOS.length * TRIBUTOS.length).toBe(21)
    expect(inexistentes).toBe(6)
  })

  it('POR_DENTRO e POR_FORA os DOIS têm campo — o lado muda a conta, não a existência', () => {
    expect(TAX_MATRIX.REVENDA.ICMS).toBe('POR_DENTRO')
    expect(TAX_MATRIX.REVENDA.IBS).toBe('POR_FORA')
    expect(tributoExisteNoSegmento('REVENDA', 'ICMS')).toBe(true)
    expect(tributoExisteNoSegmento('REVENDA', 'IBS')).toBe(true)
  })
})

describe('2. O FILTRO da tela — as linhas somem, e a ordem fica', () => {
  const LINHAS = [
    { tributo: 'IS' as const, label: 'IS — Imposto Seletivo (%)' },
    { tributo: 'IPI' as const, label: 'IPI (%)' },
  ]

  it('em INDUSTRIALIZAÇÃO ficam as duas', () => {
    expect(apenasTributosQueExistem('INDUSTRIALIZACAO', LINHAS).map((l) => l.tributo))
      .toEqual(['IS', 'IPI'])
  })

  it('>>> em REVENDA sobra SÓ o IS — o campo do IPI não existe <<<', () => {
    expect(apenasTributosQueExistem('REVENDA', LINHAS).map((l) => l.tributo)).toEqual(['IS'])
  })

  it('e em SERVIÇO não sobra nenhuma — o bloco inteiro some', () => {
    expect(apenasTributosQueExistem('SERVICO', LINHAS)).toHaveLength(0)
  })

  it('a ORDEM é preservada, e o objeto volta inteiro', () => {
    const cheio = [
      { tributo: 'IPI' as const, label: 'a', extra: 1 },
      { tributo: 'IS' as const, label: 'b', extra: 2 },
    ]
    // IPI primeiro na entrada; em industrialização ele continua primeiro.
    expect(apenasTributosQueExistem('INDUSTRIALIZACAO', cheio).map((l) => l.label)).toEqual(['a', 'b'])
    // E o filtro não reconstrói o objeto — `extra` sobrevive.
    expect(apenasTributosQueExistem('REVENDA', cheio)[0]).toEqual({ tributo: 'IS', label: 'b', extra: 2 })
  })
})

describe('3. A TELA lê o filtro — e não nomeia tributo na condição', () => {
  const src = readFileSync(
    join(__dirname, '..', '..', 'page-parts', 'products', 'product-price.component.tsx'),
    'utf-8',
  )

  it('o bloco IS/IPI passa pelo filtro e some inteiro quando nada sobra', () => {
    expect(src).toContain('apenasTributosQueExistem(_segmento, [')
    expect(src).toContain('if (isIpiRows.length === 0) return null')
  })

  it('o ICMS também é decidido pela matriz, não por `!isCalcTypeService`', () => {
    expect(src).toContain("tributoExisteNoSegmento(_segmento, 'ICMS')")
    expect(src).not.toContain("(isLucroReal || isLucroPresumed) && !isCalcTypeService\n      ? [{ key: 'icms'")
  })

  it('>>> o SEGMENTO sai da fonte única — a expressão inline era a TERCEIRA cópia <<<', () => {
    expect(src).toContain('const _segmento = resolveSegmentoDaConstrucao({')
    expect(src).not.toContain("segment: (isCalcTypeService || isCalcTypeResale || isResaleProduct) ? 'REVENDA' : 'INDUSTRIALIZACAO'")
    expect(src).toContain('segment: _segmento,')
  })

  it('e o rótulo do bloco é DERIVADO das linhas que sobraram', () => {
    // `Impostos (IS / IPI)` fixo mentiria em revenda, onde só o IS tem campo.
    expect(src).toContain("{`Impostos (${isIpiRows.map((r) => r.tributo).join(' / ')})`}")
    expect(src).not.toContain('Impostos (IS / IPI)')
  })
})

describe('4. O SEGMENTO da tela — mercadoria nunca vira SERVICO pelo tenant', () => {
  it('produto de revenda é REVENDA em qualquer tenant', () => {
    for (const t of ['INDUSTRIALIZACAO', 'REVENDA', 'SERVICO']) {
      expect(resolveSegmentoDaConstrucao({ isProduct: true, productType: 'REVENDA', tenantCalcType: t }))
        .toBe('REVENDA')
    }
  })

  it('>>> e um PRODUZIDO em tenant de SERVIÇO cai em REVENDA, não em SERVICO <<<', () => {
    // A lacuna que este PR fecha. Sem `isProduct`, a função caía na segmentação do tenant
    // e devolvia SERVICO — matriz de serviço num PRODUTO: ICMS INEXISTENTE e ISS POR
    // DENTRO. A tela nunca fez isso; a função é que dizia outra coisa.
    expect(resolveSegmentoDaConstrucao({ isProduct: true, productType: 'PRODUZIDO', tenantCalcType: 'SERVICO' }))
      .toBe('REVENDA')
    // O DISCRIMINANTE: sem o sinal, o mesmo caso devolve SERVICO.
    expect(resolveSegmentoDaConstrucao({ productType: 'PRODUZIDO', tenantCalcType: 'SERVICO' }))
      .toBe('SERVICO')
    // E o SERVIÇO cadastrado continua SERVICO — `isProduct` não atropela `isService`.
    expect(resolveSegmentoDaConstrucao({ isService: true, isProduct: true, tenantCalcType: 'SERVICO' }))
      .toBe('SERVICO')
  })

  it('e o efeito disso na matriz: o ICMS do produto sobrevive no tenant de serviço', () => {
    const seg = resolveSegmentoDaConstrucao({ isProduct: true, productType: 'PRODUZIDO', tenantCalcType: 'SERVICO' })
    expect(tributoExisteNoSegmento(seg, 'ICMS')).toBe(true)
    expect(tributoExisteNoSegmento(seg, 'ISS')).toBe(false)
  })
})

/**
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * 5. A RECUSA — o que ela custava, e o que ela passa a dizer
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const CUSTO = 1250
const FICHA = { icms: 17, pisCofEfet: 7.678, ibs: 1, cbs: 9 }
const STRUCT = 14.72, COM = 5, LUCRO = 10, IRPJ = 1.5, CSLL = 0.9

const construir = (segment: CalcType, ipiPct: number, despAcessorias = 0) =>
  buildProductConstruction({
    taxableRegime: 'LUCRO_REAL', segment,
    buyerType: 'CONSUMIDOR_FINAL', saleScope: 'INTRAESTADUAL',
    costTotal: CUSTO,
    structurePct: STRUCT / 100, rtReservePct: 0,
    commissionPct: COM / 100, profitPct: LUCRO / 100,
    profitTaxPct: (IRPJ + CSLL) / 100,
    rates: {
      icmsPct: FICHA.icms / 100, issPct: null, pisCofinsEffectivePct: FICHA.pisCofEfet / 100,
      ipiPct: ipiPct / 100, isPct: 0, ibsPct: FICHA.ibs / 100, cbsPct: FICHA.cbs / 100,
      ivaReductionIbs: null, ivaReductionCbs: null,
    },
    baseCodes: { ibs: null, cbs: null, is: null, ipi: null },
    despAcessorias,
  })

const mcEPreco = (m: ReturnType<typeof construir>) => {
  const linhas = buildProductPriceRows({
    rows: [
      { key: 'struct', originalPct: STRUCT },
      { key: 'commission', originalPct: COM },
      { key: 'profit', originalPct: LUCRO },
      { key: 'irpj', originalPct: IRPJ },
      { key: 'csll', originalPct: CSLL },
      { key: 'icms', originalPct: FICHA.icms, kind: 'ICMS' as const },
      { key: 'pisCofins', originalPct: FICHA.pisCofEfet, kind: 'PIS_COFINS' as const },
    ],
    costTotal: CUSTO,
    opInterna: m.applied ? m.opInterna : null,
    resolved: m.applied ? m.resolved! : null,
  })
  return { mc: linhas.mcAplicadaPct, P: linhas.opInterna }
}

describe('5. A RECUSA existia e era MUDA — o número que ela custava', () => {
  const comIpi = construir('REVENDA', 9)
  const semIpi = construir('REVENDA', 0)

  it('>>> com IPI em revenda a matriz NÃO governa, e o `c` cai a ZERO <<<', () => {
    expect(comIpi.applied).toBe(false)
    expect(comIpi.reason).toContain('INEXISTENTE')
    expect(comIpi.errors.join(' ')).toContain('IPI')
    const { mc, P } = mcEPreco(comIpi)
    expect(mc).toBeCloseTo(43.2020, 3)
    expect(P).toBeCloseTo(2893.38, 1)
  })

  it('>>> e SEM o IPI o `c` volta: 6,9055%, MC 39,6750%, P 3.150,59 <<<', () => {
    expect(semIpi.applied).toBe(true)
    expect(semIpi.resolved!.externalOpsCoefficient * 100).toBeCloseTo(6.9055, 3)
    const { mc, P } = mcEPreco(semIpi)
    expect(mc).toBeCloseTo(39.6750, 3)
    expect(P).toBeCloseTo(3150.59, 1)
    expect(semIpi.totalGeral).toBeCloseTo(3384.29, 1)
    // O DISCRIMINANTE do defeito: o `c` ESTÁ ligado em revenda. Não era o coeficiente
    // morto — era a recusa. Sem este caso, o de cima não distinguiria as duas causas.
    expect(P).toBeGreaterThan(mcEPreco(comIpi).P)
  })

  it('o `c` usa a PIS/COFINS NOMINAL, não a efetiva do cadastro', () => {
    // 6,9055% sai com 9,25% (nominal); 7,0151% sairia usando os 7,678% do cadastro.
    // A R3 pede a nominal, e `sale-context.ts` a reconstitui antes de montar a matriz.
    expect(semIpi.resolved!.externalOpsCoefficient * 100).toBeCloseTo(6.9055, 3)
    expect(semIpi.resolved!.externalOpsCoefficient * 100).not.toBeCloseTo(7.0151, 3)
  })

  it('a SEGUNDA porta — acréscimos gravados no produto (R11) — também recusa', () => {
    // São 4 produtos em produção, e eles caem no mesmo silêncio pela mesma linha.
    const comAcrescimo = construir('REVENDA', 0, 500)
    expect(comAcrescimo.applied).toBe(false)
    expect(comAcrescimo.reason).toContain('acréscimos')
    // E o CONTRASTE: mesma entrada sem acréscimo passa.
    expect(construir('REVENDA', 0, 0).applied).toBe(true)
  })

  it('em INDUSTRIALIZAÇÃO o MESMO IPI é aceito — é a matriz, não a alíquota', () => {
    const ind = construir('INDUSTRIALIZACAO', 9)
    expect(ind.applied).toBe(true)
    expect(ind.resolved!.externalOpsCoefficient * 100).toBeCloseTo(14.0014, 3)
    expect(ind.resolved!.externalTaxes.ipi?.value).toBeGreaterThan(0)
  })
})

describe('6. E AGORA ELA SOBE PARA A TELA — o silêncio acaba', () => {
  const src = readFileSync(
    join(__dirname, '..', '..', 'page-parts', 'products', 'product-price.component.tsx'),
    'utf-8',
  )

  it('>>> `reason` e `errors` são RENDERIZADOS, e antes não havia uma ocorrência <<<', () => {
    // A medição de 17/09: `grep _matriz.reason` fora do módulo dava ZERO. O aviso é o
    // único lugar do componente que lê os dois.
    expect(src).toContain('data-testid="matriz-nao-aplicada"')
    expect(src).toContain('{_matriz.reason}')
    expect(src).toContain('{_matriz.errors.map((e) => <li key={e}>{e}</li>)}')
  })

  it('o aviso aparece EXATAMENTE quando a matriz não governou', () => {
    expect(src).toContain('!_matriz.applied && (')
  })

  it('e o SAVE continua permitido — o aviso não vira bloqueio', () => {
    // Decisão explícita: "NÃO BLOQUEIE O SAVE". Um `disabled` atrelado ao aviso seria
    // o contrário do que foi decidido.
    const bloco = src.slice(src.indexOf('data-testid="matriz-nao-aplicada"'))
    const fim = bloco.indexOf('{/* IBS / CBS')
    expect(bloco.slice(0, fim)).not.toContain('disabled')
    expect(bloco.slice(0, fim)).toContain('Salvar é permitido')
  })

  it('o aviso diz que o coeficiente vai como NÃO APURADO — e é a verdade', () => {
    // `externalOpsCoefficientToFreeze` devolve `null` quando a matriz recusa, e isso está
    // CERTO por `ausente-vs-falso.md`: `null` é "não apurado", `0` seria "apurado e vale
    // nada". 111 de 112 produtos LR/LP estão com `null` hoje. NÃO preencher com zero.
    expect(src).toContain('não apurado')
  })
})
