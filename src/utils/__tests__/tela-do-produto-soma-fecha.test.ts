/**
 * Σ LINHAS DA OPERAÇÃO INTERNA + CUSTO = P — na TELA.
 *
 * É o teste 2 do checklist da Parte 5 de `.claude/rules/cascata-lucro-real.md`. Ele existia
 * no MOTOR e não na APRESENTAÇÃO, e foi por isso que o defeito passou: o preço já vinha das
 * % EFETIVADAS e a tela exibia as ORIGINAIS, com os R$ derivados delas.
 *
 * >>> O CASO É O MEDIDO NO PREVIEW, não um cenário inventado <<<
 * Produto novo, custo R$ 798,60, ICMS 17,00%, IBS 1,00% + CBS 8,80% (soma 9,80%). O dono do
 * produto conferiu no banco depois: existem produtos exatamente assim. A lacuna relatada foi
 * de R$ 44,89, e o caso 1 abaixo a reproduz.
 *
 * >>> UMA CORREÇÃO DE ARITMÉTICA QUE IMPORTA, e está registrada porque muda o teste <<<
 * O relato inicial deduziu `c = 5,5335%` dividindo a soma exibida pela soma real. Isso supõe
 * gross-up UNIFORME, e o PIS/COFINS não o sofre (exceção 2 da R5). O `c` verdadeiro é
 * 6,7787%, e é o que o motor devolve. Por isso este arquivo NUNCA escreve `original ÷ (1−c)`
 * para ICMS e PIS/COFINS: ele afirma que o valor veio do `resolved`.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { buildProductConstruction } from '@/utils/product-price-construction'
import { buildProductPriceRows, type PriceRowInput } from '@/utils/product-price-rows'

const CUSTO = 798.60
const ICMS = 0.17
const PIS_COFINS_EFETIVO = 0.076775 // 9,25% × (1 − 17%), como o cadastro o guarda

/** As linhas da tela, com as % ORIGINAIS. Somam 22,9205% fora de ICMS e PIS/COFINS. */
const LINHAS: PriceRowInput[] = [
  { key: 'labor', originalPct: 7.920 },
  { key: 'fixed', originalPct: 5.000 },
  { key: 'variable', originalPct: 3.000 },
  { key: 'financial', originalPct: 2.000 },
  { key: 'rt', originalPct: 0 },
  { key: 'commission', originalPct: 2.000 },
  { key: 'profit', originalPct: 2.000 },
  { key: 'irpj', originalPct: 0.300 },
  { key: 'csll', originalPct: 0.180 },
  { key: 'adicionalIrpj', originalPct: 0.5205 },
  { key: 'icms', originalPct: ICMS * 100, kind: 'ICMS' },
  { key: 'pisCofins', originalPct: PIS_COFINS_EFETIVO * 100, kind: 'PIS_COFINS' },
]

const somaOriginais = LINHAS.reduce((s, r) => s + r.originalPct, 0)

function construir(ibsPct: number, cbsPct: number) {
  const estrutura = LINHAS.filter((r) => ['labor', 'fixed', 'variable', 'financial'].includes(r.key))
    .reduce((s, r) => s + r.originalPct, 0) / 100
  const impostoSobreLucro = LINHAS.filter((r) => ['irpj', 'csll', 'adicionalIrpj'].includes(r.key))
    .reduce((s, r) => s + r.originalPct, 0) / 100
  return buildProductConstruction({
    taxableRegime: 'LUCRO_REAL',
    segment: 'INDUSTRIALIZACAO',
    buyerType: 'CONSUMIDOR_FINAL',
    saleScope: 'INTRAESTADUAL',
    costTotal: CUSTO,
    structurePct: estrutura,
    rtReservePct: 0,
    commissionPct: 0.02,
    profitPct: 0.02,
    profitTaxPct: impostoSobreLucro,
    rates: {
      icmsPct: ICMS,
      issPct: null,
      pisCofinsEffectivePct: PIS_COFINS_EFETIVO,
      ipiPct: 0,
      isPct: 0,
      ibsPct: ibsPct / 100,
      cbsPct: cbsPct / 100,
      ivaDualReductionFactor: null,
    },
    despAcessorias: 0,
  })
}

/** As linhas como a tela as montava ANTES: o R$ saindo da % ORIGINAL. */
function comoEraAntes(P: number) {
  return LINHAS.reduce((s, r) => s + P * r.originalPct / 100, 0)
}

describe('1. O DEFEITO, reproduzido — e a lacuna de R$ 44,89', () => {
  const construcao = construir(1.00, 8.80)

  it('a construção com IBS+CBS de 9,80% é a que produz o preço relatado', () => {
    expect(construcao.applied).toBe(true)
    expect(construcao.opInterna).toBeCloseTo(1609.64, 2)
    // O `c` é 6,7787% — NÃO os 5,5335% que a divisão uniforme sugeria.
    expect(construcao.resolved!.externalOpsCoefficient * 100).toBeCloseTo(6.7787, 3)
  })

  it('com os R$ saindo das ORIGINAIS, custo + linhas NÃO fecha com o preço', () => {
    const P = construcao.opInterna
    const lacuna = P - (CUSTO + comoEraAntes(P))
    // R$ 44,8836 contra os R$ 44,89 do relato: as linhas aqui são uma reconstrução que
    // preserva a SOMA medida (47,598%), não a repartição exata que o preview tinha — o
    // relato não a deu. A diferença é de seis milésimos de real, e está declarada em vez de
    // escondida atrás de uma precisão frouxa.
    //
    // Um teste que só afirmasse "fecha agora" não provaria que algo mudou: este afirma o
    // estado DEFEITUOSO, e é o que dá sentido ao caso seguinte.
    expect(lacuna).toBeCloseTo(44.89, 1)
  })

  it('com os R$ saindo das EFETIVADAS, fecha: residual ZERO', () => {
    const r = buildProductPriceRows({
      rows: LINHAS, costTotal: CUSTO, opInterna: construcao.opInterna, resolved: construcao.resolved,
    })
    // ZERO AO CENTAVO, e o limite é honesto: o motor arredonda P a centavos (`round2`) e os
    // percentuais não, então sobra ruído na terceira casa. É por isso que o alerta da tela
    // dispara em R$ 0,01 — abaixo disso é arredondamento, acima é defeito.
    expect(r.residual).toBeCloseTo(0, 2)
    expect(Math.abs(r.residual)).toBeLessThan(0.01)
    expect(CUSTO + r.rows.reduce((s, x) => s + x.value, 0)).toBeCloseTo(construcao.opInterna, 2)
  })

  it('a MC exibida deixa de prometer um preço que a tela não mostra', () => {
    const r = buildProductPriceRows({
      rows: LINHAS, costTotal: CUSTO, opInterna: construcao.opInterna, resolved: construcao.resolved,
    })
    const mcAntiga = 100 - somaOriginais
    // A MC antiga prometia R$ 1.523,99 — o número que o relato obteve dividindo o custo por
    // ela. A aplicada produz o preço que a tela de fato exibe.
    expect(CUSTO / (mcAntiga / 100)).toBeCloseTo(1523.99, 2)
    expect(CUSTO / (r.mcAplicadaPct / 100)).toBeCloseTo(construcao.opInterna, 1)
    expect(r.mcAplicadaPct).not.toBeCloseTo(mcAntiga, 3)
  })
})

describe('2. A % EFETIVA é LIDA do que a construção usou — não recalculada', () => {
  const construcao = construir(1.00, 8.80)
  const resolved = construcao.resolved!
  const k = 1 - resolved.externalOpsCoefficient
  const r = buildProductPriceRows({
    rows: LINHAS, costTotal: CUSTO, opInterna: construcao.opInterna, resolved,
  })
  const linha = (key: string) => r.rows.find((x) => x.key === key)!

  it('PIS/COFINS NÃO é `original ÷ (1 − c)` — é a exceção 2 da R5', () => {
    const efetivaLida = linha('pisCofins').effectivePct
    const seFosseDividido = PIS_COFINS_EFETIVO * 100 / k
    expect(efetivaLida).toBeCloseTo(resolved.pisCofinsPctEffective * 100, 9)
    // O discriminante: os dois números DIVERGEM. Sem isto, o caso não distinguiria "leu" de
    // "recalculou", e a asserção acima passaria com a fórmula errada.
    expect(Math.abs(efetivaLida - seFosseDividido)).toBeGreaterThan(0.1)
  })

  it('NESTE cenário o ICMS coincide com `÷ (1 − c)` — e por isso ele NÃO prova nada aqui', () => {
    // Registrado de propósito: sem IPI, `icmsPctOverTotalGeral === icmsPct` e as duas contas
    // dão o mesmo número. Um teste feito só com este cenário passaria com a tela
    // recalculando — é o caso que NÃO DISCRIMINA (`.claude/rules/teste-que-nao-exercita.md`),
    // nomeado em vez de omitido. O caso que discrimina é o seguinte.
    expect(linha('icms').effectivePct).toBeCloseTo(resolved.icmsPctEffective * 100, 9)
    expect(linha('icms').effectivePct).toBeCloseTo(ICMS * 100 / k, 6)
  })

  it('com IPI FORA da base do ICMS (R9), o ICMS lido DIVERGE do recalculado', () => {
    // A R9: comprador CONTRIBUINTE que revende NÃO tem o IPI na base do ICMS. Aí o motor
    // converte `icmsPctOverTotalGeral ÷ (1 − c)`, que não é `icmsPct ÷ (1 − c)` — e ler
    // passa a ser diferente de recalcular, com efeito numérico.
    const construcaoIpi = buildProductConstruction({
      taxableRegime: 'LUCRO_REAL',
      segment: 'INDUSTRIALIZACAO',
      buyerType: 'CONTRIBUINTE_PJ',
      buyerPurpose: 'REVENDA_INDUSTRIALIZACAO',
      saleScope: 'INTRAESTADUAL',
      costTotal: CUSTO,
      structurePct: 0.1792, rtReservePct: 0, commissionPct: 0.02, profitPct: 0.02, profitTaxPct: 0.01,
      rates: {
        icmsPct: ICMS, issPct: null, pisCofinsEffectivePct: PIS_COFINS_EFETIVO,
        ipiPct: 0.05, isPct: 0, ibsPct: 0.01, cbsPct: 0.088, ivaDualReductionFactor: null,
      },
      despAcessorias: 0,
    })
    expect(construcaoIpi.applied).toBe(true)
    const res = construcaoIpi.resolved!
    expect(res.ipiIntegraBaseIcms).toBe(false)

    const r2 = buildProductPriceRows({
      rows: LINHAS, costTotal: CUSTO, opInterna: construcaoIpi.opInterna, resolved: res,
    })
    const icms = r2.rows.find((x) => x.key === 'icms')!
    const k2 = 1 - res.externalOpsCoefficient
    expect(icms.effectivePct).toBeCloseTo(res.icmsPctEffective * 100, 9)
    // O discriminante, com o mesmo formato do caso do PIS/COFINS.
    expect(Math.abs(icms.effectivePct - ICMS * 100 / k2)).toBeGreaterThan(0.1)
  })

  it('as demais linhas sofrem a conversão PADRÃO da R5', () => {
    for (const key of ['labor', 'fixed', 'variable', 'financial', 'commission', 'profit', 'irpj', 'csll', 'adicionalIrpj']) {
      expect(linha(key).effectivePct).toBeCloseTo(linha(key).originalPct / k, 9)
    }
  })

  it('e o valor em R$ sai da EFETIVADA (R8), nunca da original', () => {
    const mo = linha('labor')
    expect(mo.value).toBeCloseTo(construcao.opInterna * mo.effectivePct / 100, 6)
    // O contraste numérico: R$ 127,48 era o que a tela mostrava com a original.
    expect(construcao.opInterna * mo.originalPct / 100).toBeCloseTo(127.48, 2)
    expect(mo.value).toBeGreaterThan(130)
  })
})

describe('3. SEM tributo por fora, nada muda — a regressão que protege a base instalada', () => {
  const construcao = construir(0, 0)

  it('`c = 0`, e o preço é o do divisor de sempre', () => {
    expect(construcao.applied).toBe(true)
    expect(construcao.resolved!.externalOpsCoefficient).toBe(0)
    expect(construcao.opInterna).toBeCloseTo(CUSTO / ((100 - somaOriginais) / 100), 1)
  })

  it('efetiva = original em TODAS as linhas, inclusive PIS/COFINS', () => {
    const r = buildProductPriceRows({
      rows: LINHAS, costTotal: CUSTO, opInterna: construcao.opInterna, resolved: construcao.resolved,
    })
    for (const linha of r.rows) {
      expect(linha.effectivePct).toBeCloseTo(linha.originalPct, 6)
    }
    expect(r.mcAplicadaPct).toBeCloseTo(100 - somaOriginais, 6)
    expect(Math.abs(r.residual)).toBeLessThan(0.01)
  })
})

describe('4. Fora da matriz, o `c` não é ZERO — é AUSENTE', () => {
  it('sem `resolved`, a tela não tem `c` a exibir', () => {
    const r = buildProductPriceRows({ rows: LINHAS, costTotal: CUSTO, opInterna: null, resolved: null })
    // `null`, e não `0`: um "0,0000%" na tela afirmaria que o coeficiente foi apurado e deu
    // zero, quando ninguém o apurou — `.claude/rules/ausente-vs-falso.md`.
    expect(r.externalOpsCoefficientPct).toBeNull()
  })

  it('e o preço é derivado do custo e da MC, com a soma fechando do mesmo jeito', () => {
    const r = buildProductPriceRows({ rows: LINHAS, costTotal: CUSTO, opInterna: null, resolved: null })
    expect(r.opInterna).toBeCloseTo(1523.99, 2)
    // Aqui P NÃO passou pelo `round2` do motor — foi derivado da MC — e o residual é zero
    // exato. O ruído do caso 1 é do arredondamento do preço, não da efetivação.
    expect(r.residual).toBeCloseTo(0, 9)
  })
})

describe('5. O regime SEM matriz escrita continua no caminho antigo', () => {
  it('Simples Nacional não ganha `c` nem efetivação', () => {
    const construcao = buildProductConstruction({
      taxableRegime: 'SIMPLES_NACIONAL',
      segment: 'REVENDA',
      buyerType: 'CONSUMIDOR_FINAL',
      saleScope: 'INTRAESTADUAL',
      costTotal: CUSTO,
      structurePct: 0.1792, rtReservePct: 0, commissionPct: 0.02, profitPct: 0.02, profitTaxPct: 0,
      rates: { icmsPct: ICMS, issPct: null, pisCofinsEffectivePct: PIS_COFINS_EFETIVO, ibsPct: 0.098 },
      despAcessorias: 0,
    })
    expect(construcao.applied).toBe(false)
    expect(construcao.reason).toContain('regime sem matriz')
  })
})

describe('6. A TELA consome o módulo — e não tem mais a conta própria', () => {
  // Asserção estrutural, e assumida como tal: a suíte não tem teste de componente, então o
  // que sobra sem cobertura é a renderização do JSX. A lógica inteira saiu do componente
  // justamente para reduzir essa superfície — `.claude/rules/teste-que-nao-exercita.md`, o
  // caso-limite honesto: aqui o defeito É a ausência, e não há efeito numérico a medir.
  const src = readFileSync(
    join(__dirname, '..', '..', 'page-parts', 'products', 'product-price.component.tsx'),
    'utf-8',
  )

  it('monta as linhas pelo módulo, com a base que a construção produziu', () => {
    expect(src).toContain('buildProductPriceRows')
    expect(src).toContain('resolved: _matriz.applied ? _matriz.resolved : null')
  })

  it('NENHUM valor em R$ é mais derivado de `base × % original`', () => {
    // Era assim que os R$ saíam da original: `displayBase * laborPct / 100`. Se um voltar,
    // este caso quebra — e era exatamente um deles (MO administrativa, R$ 127,48) que o
    // relato usou para mostrar o defeito.
    expect(src).not.toMatch(/displayBase \* \w+Pct \/ 100/)
    expect(src).not.toMatch(/valorPrecificado \* \w+Pct \/ 100/)
  })

  it('a coluna % EFETIVO existe, e o `c` é exibido', () => {
    expect(src).toContain('% Efetivo')
    expect(src).toContain('Coeficiente da operação por fora (c)')
    expect(src).toContain('linhas.externalOpsCoefficientPct != null')
  })

  it('a MC exibida é a APLICADA, e não há segunda fórmula de MC na tela', () => {
    expect(src).toContain('const mcPct = linhas.mcAplicadaPct')
    // A fórmula antiga somava as originais à mão. Duas fórmulas de MC na mesma tela é a
    // `copia-divergente.md` esperando divergir.
    expect(src).not.toMatch(/100 - totalPct/)
  })

  it('o residual vira ALERTA, não um número discreto ao lado dos outros', () => {
    expect(src).toContain('Math.abs(linhas.residual) >= 0.01')
  })
})
