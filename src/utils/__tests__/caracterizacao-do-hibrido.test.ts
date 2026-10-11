/**
 * CARACTERIZAÇÃO DO SIMPLES HÍBRIDO — a rede para a unificação futura.
 *
 * Obrigatório no commit do passo XI-3, por exigência do dono do produto (11/10/2026).
 *
 * ══ O QUE É UM PORTÃO DE CARACTERIZAÇÃO, E POR QUE ESTE EXISTE ════════════════════════════
 *
 * Ele não afirma que os números estão CERTOS. Afirma que são **ESTES**, medidos no estado de
 * hoje, para que qualquer mudança futura no caminho do Híbrido apareça como diferença em vez
 * de passar.
 *
 * Formulação do dono do produto:
 *
 *   > Sem ele, este passo passa a ser o que pode mover o tenant vivo sem ninguém ver.
 *
 * ══ POR QUE O HÍBRIDO FICOU FORA DO XI-3 ═════════════════════════════════════════════════
 *
 * O XI-3 trocou `REGIMES_COM_MATRIZ = ['LUCRO_REAL']` por leitura da matriz: quem tem célula
 * `POR_FORA` é governado por ela. O Híbrido **tem** — IBS, CBS e IS —, então o critério o
 * traria. Ele é exceção NOMEADA em `REGIMES_COM_CAMINHO_PROPRIO` (`sale-context.ts`), com três
 * razões escritas lá:
 *
 * 1. `construirPrecoHibrido` (`simples-hibrido.ts:160`) é caminho à parte — o `c` dele não sai
 *    de `buildTaxBreakdown`, porque ICMS, ISS e PIS/COFINS não são linha no regime (estão no
 *    DAS) e a base de IBS/CBS é `P × (1 − dedução)`;
 * 2. a falta dele é OUTRA — **pendência 7**, uma condição ausente em `externalNominalByTax`
 *    (`budget-decomposition-input.ts:354`), não "regime sem matriz";
 * 3. **é o único dos três candidatos com tenant vivo.** Presumido e RET têm ZERO tenants;
 *    o Híbrido tem 1. Arrastá-lo seria duas mudanças no mesmo commit, no único lugar com
 *    exposição real.
 *
 * ══ O QUE ESTE ARQUIVO NÃO É ═════════════════════════════════════════════════════════════
 *
 * Não é um portão da REGRA do Híbrido — essa está em
 * `decomposicao-simples-hibrido-planilha.test.ts`, conferida contra a planilha do PO. Este é
 * só a fotografia dos números, e a diferença importa: quem unificar os caminhos vai mudar
 * estes valores de propósito, e então **atualiza este arquivo deliberadamente**, com os dois
 * valores à vista. É o oposto de descobrir depois que o tenant vivo mudou de preço.
 */

import { construirPrecoHibrido } from '@/utils/simples-hibrido'
import { buildProductConstruction } from '@/utils/product-price-construction'
import { REGIMES_COM_MATRIZ } from '@/utils/sale-context'
import { tributosPorForaNaMatriz } from '@/utils/matriz-fiscal'

/**
 * A entrada medida em 11/10/2026, antes e depois do XI-3. Os percentuais são os mesmos dos
 * outros portões desta campanha, e nenhum coincide com outro — um caso em que o DAS fosse
 * igual à despesa não distinguiria qual dos dois o coeficiente usou.
 */
const ENTRADA = {
  custoTotal: 1_000,
  despesasPct: 0.22,
  rtPct: 0.01,
  comissaoPct: 0.05,
  lucroPct: 0.10,
  dasHibridoPct: 0.06,
  deducaoBasePct: 0.17,
  isPct: 0,
  ibsPct: 0.01,
  cbsPct: 0.09,
} as const

describe('CARACTERIZAÇÃO — os números do Híbrido, para a unificação futura ter rede', () => {
  it('>>> os seis valores, medidos em 11/10/2026 e INALTERADOS pelo XI-3 <<<', () => {
    // Se qualquer um destes mover, o tenant vivo mudou de preço. Os valores vêm da medição
    // registrada no comando do PO, não de uma conta refeita aqui — refazê-la faria o caso
    // concordar consigo mesmo.
    const r = construirPrecoHibrido({ ...ENTRADA, segmento: 'INDUSTRIALIZACAO' })

    expect(r.precoPorDentro).toBeCloseTo(1785.714285714286, 9)
    expect(r.baseIVA).toBeCloseTo(1482.142857142857, 9)
    expect(r.ibsValue).toBeCloseTo(14.821428571428573, 9)
    expect(r.cbsValue).toBeCloseTo(133.39285714285717, 9)
    expect(r.totalACobrar).toBeCloseTo(1933.9285714285718, 9)
    expect(r.k).toBeCloseTo(1.083, 9)
  })

  it('e os TRÊS segmentos dão o mesmo — o Híbrido não ramifica por segmento nesta entrada', () => {
    // Com `isPct: 0` as três colunas coincidem, e é isso que o caso fixa: uma mudança que
    // introduzisse ramificação por segmento aqui apareceria como diferença.
    const ind = construirPrecoHibrido({ ...ENTRADA, segmento: 'INDUSTRIALIZACAO' })
    for (const seg of ['REVENDA', 'SERVICO'] as const) {
      const r = construirPrecoHibrido({ ...ENTRADA, segmento: seg })
      expect(r.precoPorDentro).toBe(ind.precoPorDentro)
      expect(r.totalACobrar).toBe(ind.totalACobrar)
      expect(r.k).toBe(ind.k)
    }
  })

  it('com IS em industrialização os números são ESTES — o IS entra no `k`', () => {
    // O par do caso acima: com `isPct > 0` o `k` sobe, o que prova que os três segmentos
    // coincidirem no primeiro caso é consequência do `isPct: 0` e não de o IS ser ignorado.
    const r = construirPrecoHibrido({ ...ENTRADA, isPct: 0.05, segmento: 'INDUSTRIALIZACAO' })
    expect(r.precoPorDentro).toBeCloseTo(1785.714285714286, 9)
    expect(r.isValue).toBeCloseTo(74.10714285714288, 9)
    expect(r.totalACobrar).toBeCloseTo(2015.446428571429, 9)
    expect(r.k).toBeCloseTo(1.12865, 9)
    expect(r.k).toBeGreaterThan(1.083)
  })
})

describe('a EXCEÇÃO é deliberada, e isto é o que a prova', () => {
  it('>>> o Híbrido TEM por fora na matriz — logo o critério o traria <<<', () => {
    // Sem esta asserção, "o Híbrido está fora" seria indistinguível de "a matriz não o tem".
    // Ele tem os três, e é a decisão nomeada que o tira — não a ausência de célula.
    expect([...tributosPorForaNaMatriz('SIMPLES_HIBRIDO')].sort()).toEqual(['CBS', 'IBS', 'IS'])
    expect(tributosPorForaNaMatriz('SIMPLES_HIBRIDO').length).toBeGreaterThan(0)
  })

  it('>>> e mesmo assim NÃO está em `REGIMES_COM_MATRIZ` <<<', () => {
    expect([...REGIMES_COM_MATRIZ].sort()).toEqual([
      'LUCRO_PRESUMIDO', 'LUCRO_PRESUMIDO_RET', 'LUCRO_REAL',
    ])
    expect(REGIMES_COM_MATRIZ).not.toContain('SIMPLES_HIBRIDO')
    // e os dois que saem por NÃO ter por fora saem por outra razão
    expect(REGIMES_COM_MATRIZ).not.toContain('SIMPLES_NACIONAL')
    expect(REGIMES_COM_MATRIZ).not.toContain('MEI')
    expect(tributosPorForaNaMatriz('SIMPLES_NACIONAL')).toEqual([])
    expect(tributosPorForaNaMatriz('MEI')).toEqual([])
  })

  it('a porta de produção o recusa com a razão PRÓPRIA dele, não com "regime sem matriz"', () => {
    // É a asserção que distingue exceção de esquecimento, e o `not` vale tanto quanto o
    // `toMatch`: se ele caísse na recusa genérica, a razão seria a errada e ninguém veria.
    const h = buildProductConstruction({
      taxableRegime: 'SIMPLES_HIBRIDO',
      segment: 'INDUSTRIALIZACAO',
      buyerType: 'CONSUMIDOR_FINAL',
      saleScope: 'INTRAESTADUAL',
      costTotal: 1_000,
      despAcessorias: 0,
      structurePct: 0.22, rtReservePct: 0.01, commissionPct: 0.05, profitPct: 0.10,
      profitTaxPct: 0,
      rates: { icmsPct: 0.18, pisCofinsEffectivePct: 0.02993, ibsPct: 0.01, cbsPct: 0.09 },
    })
    expect(h.applied).toBe(false)
    expect(h.reason).not.toMatch(/regime sem matriz/i)
    expect(h.reason).toMatch(/anexo|faixa/i)
  })
})
