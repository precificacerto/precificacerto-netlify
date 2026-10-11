/**
 * PORTÕES DE MOTOR — LUCRO PRESUMIDO e LUCRO PRESUMIDO RET.
 *
 * Comando do PO de 11/10/2026, Parte C. Medição prévia (§0) no relatório da rodada.
 *
 * ══ POR QUE ESTE ARQUIVO EXISTE ANTES DE QUALQUER CORREÇÃO ════════════════════════════════
 *
 * A ESPEC de 11/10/2026 põe, como passo 1 da ordem de execução: *"faltam portões onde a
 * correção vai acontecer… corrigir ramo sem rede, com zero tenants para reclamar, é mudar no
 * escuro."* Medido em 11/10: `ret_rate`, `retRate` e `ret_iss_separate` têm **zero** arquivos
 * de teste, e `lucro_presumido_activity` também. Este arquivo é a rede.
 *
 * ══ OS NÚMEROS AQUI SÃO DA DERIVAÇÃO, SOB MOCK — LEIA ANTES DE CITÁ-LOS ═══════════════════
 *
 * Exigência literal do dono do produto:
 *
 *   > Os números deste arquivo são da DERIVAÇÃO (presunção × alíquota) sob mock.
 *   > NÃO afirmam nada sobre o valor gravado no seed nem na tabela de produção,
 *   > que não foram medidos. Verde aqui não é "o seed está certo".
 *
 * ══ DOIS NÍVEIS DE CASO, E A DIFERENÇA É DELIBERADA ══════════════════════════════════════
 *
 * | nível | quando | forma |
 * |---|---|---|
 * | **trava de valor** | a ESPEC diz que o comportamento de hoje está CORRETO | `it` verde, afirmando o número |
 * | **divergência documentada** | a ESPEC diz que hoje DIVERGE | `it` verde afirmando **o valor de HOJE**, com `DIVERGE DA ESPEC <seção>` e o esperado no NOME |
 *
 * O segundo nível é a regra que o comando fixou: *"Nunca afirme a regra como se o código já
 * a cumprisse."* Um caso que afirmasse XIV.4 hoje subiria vermelho e seria desligado na
 * primeira semana; um que afirme o valor de hoje **sem dizer que ele diverge** vira
 * `cascata-lucro-real.md` — o defeito com status de regra, que esta campanha já encontrou
 * duas vezes (o mapeamento RET → Presumido e o IS em revenda). O nome do caso é o que impede
 * as duas coisas.
 */

import { calculatePricing } from '@/utils/pricing-engine'
import { buildProductConstruction, externalOpsCoefficientToFreeze } from '@/utils/product-price-construction'
import { buildBudgetDecompositionInput } from '@/utils/budget-decomposition-input'

// ═══════════════════════════════════════════════════════════════════════════════════════════
// NÍVEL 0 — A PROVA DE QUE `it.failing` EXECUTA
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * >>> O PRIMEIRO CASO DO ARQUIVO PROVA O INSTRUMENTO, NÃO O SISTEMA <<<
 *
 * O §0 provou que `failing` existe no `jest-circus` **instalado** (`build/index.js:149-161`),
 * por leitura do pacote. Leitura não é execução — `instrumento-que-nao-enxerga.md`: *"antes de
 * confiar num número que saiu de um padrão escrito à mão, construa de propósito um caso que
 * deveria aparecer e verifique se o instrumento o enxerga."*
 *
 * Este caso é a fixture do instrumento: uma asserção que **falha de propósito**. Se
 * `it.failing` funciona, o caso aparece como PASSOU. Se o recurso não existisse ou se
 * comportasse de outro jeito, este arquivo ficaria vermelho na primeira linha, e aí a Parte C
 * pararia aqui em vez de usar um recurso que não funciona.
 */
it.failing('NÍVEL 0 — `it.failing` executa: esta asserção falha DE PROPÓSITO', () => {
  expect(1).toBe(2)
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// FIXTURES — o tenant e o item, iguais para os dois regimes
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * Os percentuais da estrutura, em DECIMAIS sobre o total geral.
 *
 * Valores escolhidos para que nenhum deles coincida com outro: um caso em que estrutura e
 * imposto fossem iguais não distinguiria qual dos dois o coeficiente usou
 * (`teste-que-nao-exercita.md`, variante 2).
 */
const ESTRUTURA = {
  structurePct: 0.22,
  commissionPct: 0.05,
  profitPct: 0.10,
  rtReservePct: 0.01,
} as const

/** CMV em R$ por unidade. Número redondo, para a conta ser conferível à mão. */
const CUSTO = 1_000

// ═══════════════════════════════════════════════════════════════════════════════════════════
// C1 · PRESUMIDO INDUSTRIALIZAÇÃO — o coeficiente pelo AGREGADO
// ═══════════════════════════════════════════════════════════════════════════════════════════

describe('C1 · Lucro Presumido industrialização — preço e coeficiente', () => {
  /**
   * O agregado do Presumido, montado com os componentes que a ESPEC XIV.4 manda SEPARAR.
   *
   * `calc-tax-preview.ts:271` soma tudo num número:
   *   `taxPct = lpIcms + pisCofins + iss + irpjEquiv + csllEquiv + lpIrpjAdditional`
   *
   * Aqui: ICMS 18% × ... não — o ICMS do LP entra como `lpIcms`, e o PIS/COFINS cumulativo
   * é 3,65% com a exclusão do ICMS (`calc-tax-preview.ts:225-229`:
   * `0.0365 * (1 - lpIcms)` quando `lpIcms > 0`).
   */
  const LP_ICMS = 0.18
  const LP_PIS_COFINS = 0.0365 * (1 - LP_ICMS)      // 0.02993 — a exclusão do ICMS, R5
  const LP_IRPJ = 0.08 * 0.15                        // 0.012  — presunção × alíquota
  const LP_CSLL = 0.12 * 0.09                        // 0.0108 — presunção × alíquota
  const AGREGADO = LP_ICMS + LP_PIS_COFINS + LP_IRPJ + LP_CSLL

  it('a soma do agregado é a que `calc-tax-preview.ts:271` produz — conferida à mão', () => {
    // 0,18 + 0,029930 + 0,012 + 0,0108 = 0,232730
    expect(LP_PIS_COFINS).toBeCloseTo(0.02993, 6)
    expect(AGREGADO).toBeCloseTo(0.23273, 6)
  })

  it('Presumido industrialização: coeficiente pelo agregado — DIVERGE DA ESPEC XIV.4, esperado após correção: ICMS em 13A, PIS/COFINS em 13B, presunção em 13C, separados', () => {
    const r = calculatePricing({
      calcType: 'INDUSTRIALIZACAO',
      totalItemsCost: CUSTO,
      yieldQuantity: 1,
      laborCostMonthly: 0,
      numProductiveEmployees: 1,
      monthlyWorkloadMinutes: 10_000,
      productWorkloadMinutes: 0,
      taxPct: AGREGADO,
      ...ESTRUTURA,
    })

    expect(r.isValid).toBe(true)

    // O divisor de `pricing-engine.ts:232`, conferido à mão:
    //   1 − (0,22 + 0,232730 + 0,01 + 0,05 + 0,10) = 0,387270
    const coefEsperado = 1 - (0.22 + AGREGADO + 0.01 + 0.05 + 0.10)
    expect(coefEsperado).toBeCloseTo(0.38727, 6)
    expect(r.coefficient).toBeCloseTo(coefEsperado, 6)

    // >>> 1.000 ÷ 0,387270 = 2.582,1778… → R$ 2.582,18 <<<
    //
    // A PRIMEIRA REDAÇÃO DESTE CASO DIZIA 2.582,20, E ELE A DERRUBOU na primeira execução.
    // Arredondei `1 ÷ 0,38727` para 2,5822 quando é 2,582178 — dois centavos. É
    // `hipotese-derrubada-pela-propria-medicao.md`: o caso escrito para confirmar o número
    // foi o que o desmentiu, e quem o formulou foi quem o escreveu. Fica registrado em vez
    // de corrigido em silêncio, porque o comando pede "número conferido na mão" e a conta
    // à mão foi a que errou.
    expect(r.priceUnit).toBeCloseTo(CUSTO / coefEsperado, 2)
    expect(r.priceUnit).toBeCloseTo(2582.18, 2)
  })

  it('>>> o Presumido NÃO chega ao `taxBreakdown` — `sale-context.ts:445` o recusa <<<', () => {
    // É a prova de que a separação da XIV.4 não existe em caminho nenhum hoje, e por isso o
    // caso acima trava o agregado em vez de afirmar a separação.
    const c = buildProductConstruction({
      taxableRegime: 'LUCRO_PRESUMIDO',
      segment: 'INDUSTRIALIZACAO',
      buyerType: 'CONSUMIDOR_FINAL',
      saleScope: 'INTRAESTADUAL',
      costTotal: CUSTO,
      ...ESTRUTURA,
      profitTaxPct: LP_IRPJ + LP_CSLL,
      rates: { icmsPct: LP_ICMS, pisCofinsEffectivePct: LP_PIS_COFINS },
    })

    expect(c.applied).toBe(false)
    expect(c.reason).toBe('regime sem matriz escrita')
  })
})
