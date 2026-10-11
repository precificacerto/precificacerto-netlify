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

// ═══════════════════════════════════════════════════════════════════════════════════════════
// O BANCO DE MENTIRA — e as DUAS unidades, que não se misturam
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * >>> `effectiveTaxPct` É DECIMAL. `taxesPercent` e `taxableRegimePercent` SÃO PERCENTUAIS <<<
 *
 * Medido em 11/10/2026, porque a primeira redação destes casos multiplicou por 100 e os onze
 * ficaram vermelhos de uma vez. O ramo do LP devolve objeto literal com
 * `effectiveTaxPct: taxPct` (`calc-tax-preview.ts:273`), e `taxPct` é a soma dos DECIMAIS de
 * `:271`. Quem passa por `buildResult` (`:73-89`) recebe percentuais e divide por 100 — são
 * dois caminhos com duas unidades, e o campo com o mesmo nome significa a mesma coisa nos
 * dois, mas os ARGUMENTOS não.
 *
 * Os valores abaixo são os MEDIDOS, não os calculados à mão. A conta à mão entra ao lado,
 * como conferência, e onde ela divergiu está registrado.
 *
 * O mock registra qual `activity_type` foi pedido. É o registro que torna C3 e C10 asserções
 * de EFEITO em vez de passagem: sem ele o caso só veria o percentual final, e um percentual
 * igual por coincidência não distinguiria a chave consultada (`teste-que-nao-exercita.md`).
 */
let TS: Record<string, unknown> = {}
let LP_ROWS: Record<string, Record<string, number>> = {}
let ACTIVITIES_PEDIDAS: string[] = []

jest.mock('@/supabase/client', () => ({
  supabase: {
    from: (tabela: string) => {
      const api: any = {
        _activity: null as string | null,
        select: () => api,
        order: () => api,
        eq: (col: string, val: string) => {
          if (tabela === 'lucro_presumido_rates' && col === 'activity_type') {
            api._activity = val
            ACTIVITIES_PEDIDAS.push(val)
          }
          return api
        },
        single: () => (tabela === 'tenant_settings' ? { data: TS } : { data: null }),
        maybeSingle: () => {
          if (tabela === 'tenant_settings') return { data: TS }
          if (tabela === 'lucro_presumido_rates') {
            return { data: api._activity ? (LP_ROWS[api._activity] ?? null) : null }
          }
          return { data: null }
        },
        then: (fn: (v: unknown) => unknown) => {
          const resp = tabela === 'brazilian_states'
            ? { data: [{ code: 'SP', icms_internal_rate: 0.18 }] }
            : tabela === 'tenant_settings' ? { data: TS } : { data: null }
          return Promise.resolve(resp).then(fn)
        },
      }
      return api
    },
  },
}))

/** As duas linhas da tabela oficial que os casos usam. Decimais 0-1, como o banco guarda. */
const LINHAS_OFICIAIS: Record<string, Record<string, number>> = {
  COMERCIO: { irpj_presumption_percent: 0.08, irpj_rate: 0.15, csll_presumption_percent: 0.12, csll_rate: 0.09 },
  SERVICOS_32: { irpj_presumption_percent: 0.32, irpj_rate: 0.15, csll_presumption_percent: 0.32, csll_rate: 0.09 },
}

function prepara(ts: Record<string, unknown>) {
  TS = ts
  LP_ROWS = LINHAS_OFICIAIS
  ACTIVITIES_PEDIDAS = []
}

/**
 * O tenant base do Presumido industrialização.
 *
 * >>> `icms_contribuinte: true` É OBRIGATÓRIO, E A MEDIÇÃO É QUE ENSINOU ISSO <<<
 * `calc-tax-preview.ts:215` → `else if (!ts.icms_contribuinte) { lpIcms = 0 }`. Sem o campo,
 * o ICMS sai ZERO **e** o PIS/COFINS perde a exclusão, caindo em 3,65% cheio: o agregado vai
 * de 0,2327 para 0,0593. A primeira redação destes casos omitia o campo e media outro
 * cenário sem saber. Há um caso próprio para isso logo abaixo.
 */
const LP_IND = {
  tenant_id: 't1', tax_regime: 'LUCRO_PRESUMIDO', calc_type: 'INDUSTRIALIZACAO',
  state_code: 'SP', icms_contribuinte: true,
} as const

// ═══════════════════════════════════════════════════════════════════════════════════════════
// C2 · A DERIVAÇÃO DA PRESUNÇÃO — receita → base → alíquota
// ═══════════════════════════════════════════════════════════════════════════════════════════

describe('C2 · Presumido: a derivação da presunção', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { fetchTaxPreview } = require('@/utils/calc-tax-preview')

  it('>>> base 8% (IRPJ) e 12% (CSLL) × alíquota legal — e o caso FALHA se a base trocar <<<', async () => {
    // É o caso que o §0 mostrou não existir: hoje a presunção aparece em FIXTURE, com a conta
    // no comentário (`margin-reapuration-v6-discount-modes.test.ts:39-40`), e o número certo
    // num comentário não é uma asserção.
    prepara({ ...LP_IND, lucro_presumido_activity: 'COMERCIO' })

    const r = await fetchTaxPreview('t1')

    // A chave consultada foi a do tenant — não um default silencioso.
    expect(ACTIVITIES_PEDIDAS).toEqual(['COMERCIO'])

    // MEDIDO: 0,2327. Conferência à mão, que fecha:
    //   ICMS                       0,180000
    //   PIS/COFINS 3,65% × (1−ICMS) 0,029930
    //   IRPJ  0,08 × 0,15           0,012000
    //   CSLL  0,12 × 0,09           0,010800
    //                              ─────────
    //                               0,232730  → round4 → 0,2327
    expect(r.effectiveTaxPct).toBeCloseTo(0.2327, 4)

    // >>> AS PARCELAS SEPARADAS, que é o que faz o caso FALHAR se a base trocar <<<
    // `taxableRegimePercent` é só IRPJ + CSLL, em PERCENTUAL: 1,20 + 1,08 = 2,28.
    // Trocar a base do IRPJ de 8% para 32% move este número para 5,88 — e nenhuma outra
    // asserção do arquivo veria isso, porque o agregado também mudaria junto.
    expect(r.taxableRegimePercent).toBeCloseTo(2.28, 4)
    expect(0.08 * 0.15 * 100 + 0.12 * 0.09 * 100).toBeCloseTo(2.28, 4)
    expect(r.taxLabel).toBe('Lucro Presumido')
  })

  it('a base 32% move IRPJ+CSLL de 2,28% para 7,68% — é o que prova que a base é LIDA', async () => {
    // O par do caso acima: mesma alíquota legal, base diferente, resultado diferente. Com um
    // caso só, uma base hard-coded passaria verde.
    prepara({ ...LP_IND, lucro_presumido_activity: 'SERVICOS_32' })

    const r = await fetchTaxPreview('t1')

    expect(ACTIVITIES_PEDIDAS).toEqual(['SERVICOS_32'])
    // MEDIDO: 0,2867 · 7,68. À mão: 0,32×0,15 = 0,048 · 0,32×0,09 = 0,0288 → 7,68%
    expect(r.effectiveTaxPct).toBeCloseTo(0.2867, 4)
    expect(r.taxableRegimePercent).toBeCloseTo(7.68, 4)
  })

  it('o valor MANUAL do tenant vence a tabela — `calc-tax-preview.ts:247-253`', async () => {
    // Precedência declarada no código: *"Valores manuais do tenant têm prioridade sobre a
    // tabela lucro_presumido_rates."* Sem este caso, inverter a precedência passaria verde.
    // O manual mexe SÓ no IRPJ; a CSLL continua pela tabela — e é esse par que discrimina.
    prepara({ ...LP_IND, lucro_presumido_activity: 'COMERCIO', lp_irpj_presumption_percent: 0.32 })

    const r = await fetchTaxPreview('t1')

    // MEDIDO: 0,2687 · 5,88. À mão: IRPJ manual 0,32×0,15 = 4,80% + CSLL tabela 1,08% = 5,88%
    expect(r.effectiveTaxPct).toBeCloseTo(0.2687, 4)
    expect(r.taxableRegimePercent).toBeCloseTo(5.88, 4)
    // a tabela do COMERCIO continuou sendo consultada — o manual não pulou a consulta
    expect(ACTIVITIES_PEDIDAS).toEqual(['COMERCIO'])
  })

  it('>>> sem `icms_contribuinte` o ICMS sai ZERO e o PIS/COFINS perde a exclusão <<<', async () => {
    // Achado da medição, e ele entra como caso porque foi o que derrubou a primeira redação
    // deste arquivo: a fixture sem o campo media 0,0593 enquanto eu afirmava 0,2327.
    //
    // `calc-tax-preview.ts:215` → `else if (!ts.icms_contribuinte) { lpIcms = 0 }`. É
    // `ausente-vs-falso.md` no campo: ausente é lido como "não contribuinte", que é uma
    // afirmação sobre o cadastro, não uma lacuna.
    prepara({
      tenant_id: 't1', tax_regime: 'LUCRO_PRESUMIDO', calc_type: 'INDUSTRIALIZACAO',
      state_code: 'SP', lucro_presumido_activity: 'COMERCIO',
      // icms_contribuinte AUSENTE — é o ponto do caso
    })

    const r = await fetchTaxPreview('t1')

    // MEDIDO: 0,0593 = 3,65% cheio + 1,20% + 1,08%. O ICMS não entrou, e o PIS/COFINS
    // tampouco foi reduzido — as duas coisas de uma vez.
    expect(r.effectiveTaxPct).toBeCloseTo(0.0593, 4)
    expect(r.taxesPercent).toBeCloseTo(3.65, 4)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// C3 · PRESUMIDO SERVIÇO — base 32%, e o caso do `lucro_presumido_activity` NULO
// ═══════════════════════════════════════════════════════════════════════════════════════════

describe('C3 · Presumido serviço: base 32% e a chave nula', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { fetchTaxPreview } = require('@/utils/calc-tax-preview')

  const LP_SVC = {
    tenant_id: 't1', tax_regime: 'LUCRO_PRESUMIDO', calc_type: 'SERVICO',
    state_code: 'SP', iss_municipality_rate: 0.05,
  } as const

  it('serviço com a chave gravada: base 32%, ISS no lugar do ICMS, PIS/COFINS cheio', async () => {
    prepara({ ...LP_SVC, lucro_presumido_activity: 'SERVICOS_32' })

    const r = await fetchTaxPreview('t1')

    expect(ACTIVITIES_PEDIDAS).toEqual(['SERVICOS_32'])
    // MEDIDO: 0,1633. À mão: ISS 5% + PIS/COFINS 3,65% CHEIO (serviço não tem ICMS na base,
    // `:224-225`) + IRPJ 4,80% + CSLL 2,88% = 16,33%.
    // A primeira redação dizia 15,33 — erro de soma meu, derrubado por este caso.
    expect(r.effectiveTaxPct).toBeCloseTo(0.1633, 4)
    expect(r.taxesPercent).toBeCloseTo(8.65, 4)      // ISS 5,00 + PIS/COFINS 3,65
    expect(r.taxableRegimePercent).toBeCloseTo(7.68, 4)
  })

  it('>>> serviço SEM `lucro_presumido_activity`: cai em COMERCIO e recebe 8%, não 32% — DIVERGE DA ESPEC (pendência 13), esperado após correção: 32% para serviço <<<', async () => {
    // O defeito que o §0 confirmou em `calc-tax-preview.ts:238`:
    //   const activity = ts.lucro_presumido_activity || 'COMERCIO'
    // O caso afirma o VALOR DE HOJE. Afirmar 32% aqui subiria vermelho e seria desligado na
    // primeira semana — é a regra que o comando fixou.
    prepara({ ...LP_SVC })   // sem `lucro_presumido_activity`

    const r = await fetchTaxPreview('t1')

    // >>> A ASSERÇÃO DE EFEITO: a chave pedida foi COMERCIO, num tenant de SERVIÇO <<<
    // Ela é mais forte que o percentual, porque nomeia a causa em vez do sintoma.
    expect(ACTIVITIES_PEDIDAS).toEqual(['COMERCIO'])

    // MEDIDO hoje: 0,1093 · IRPJ+CSLL 2,28% (o do comércio)
    expect(r.effectiveTaxPct).toBeCloseTo(0.1093, 4)
    expect(r.taxableRegimePercent).toBeCloseTo(2.28, 4)

    // E o que a ESPEC pede, afirmado como DIFERENÇA — nunca como se o código já o cumprisse.
    // 0,1633 é o valor medido no caso anterior, com a chave correta.
    expect(r.effectiveTaxPct).not.toBeCloseTo(0.1633, 4)
    expect(r.taxableRegimePercent).not.toBeCloseTo(7.68, 4)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// C4 · ADICIONAL DE IRPJ — abaixo e acima do limite
// ═══════════════════════════════════════════════════════════════════════════════════════════

describe('C4 · Adicional de IRPJ: um caso abaixo do limite e um acima', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { fetchTaxPreview } = require('@/utils/calc-tax-preview')

  /** `calc-tax-preview.ts:261` — R$ 20.000/mês × 12. */
  const LIMITE = 240_000

  it('ABAIXO do limite: base presumida de R$ 240.000 EXATOS — adicional não apurado', async () => {
    // Receita × 8% = 240.000 ⇒ receita = 3.000.000. O excedente é 0, e `:265` exige `> 0`.
    // O caso está no limite de propósito: é onde um `>=` no lugar do `>` passaria.
    prepara({ ...LP_IND, lucro_presumido_activity: 'COMERCIO', lp_estimated_annual_revenue: 3_000_000 })
    const r = await fetchTaxPreview('t1')

    expect(3_000_000 * 0.08).toBe(LIMITE)
    expect(r.effectiveTaxPct).toBeCloseTo(0.2327, 4)       // MEDIDO, igual ao sem receita
    expect(r.taxableRegimePercent).toBeCloseTo(2.28, 4)    // IRPJ+CSLL sem adicional
  })

  it('>>> ACIMA do limite: o adicional aparece, e é `(excedente × 10%) ÷ receita` <<<', async () => {
    // Receita 6.000.000 ⇒ base 480.000 ⇒ excedente 240.000 ⇒ adicional 24.000 ⇒ 0,40%.
    prepara({ ...LP_IND, lucro_presumido_activity: 'COMERCIO', lp_estimated_annual_revenue: 6_000_000 })
    const r = await fetchTaxPreview('t1')

    const excedente = 6_000_000 * 0.08 - LIMITE
    expect(excedente).toBe(240_000)
    expect((excedente * 0.10) / 6_000_000).toBeCloseTo(0.004, 6)

    // MEDIDO: 0,2367 e 2,68. O par com o caso acima é o que discrimina: 0,2327 → 0,2367.
    expect(r.effectiveTaxPct).toBeCloseTo(0.2367, 4)
    expect(r.taxableRegimePercent).toBeCloseTo(2.68, 4)    // 2,28 + 0,40 do adicional
    expect(r.effectiveTaxPct).toBeGreaterThan(0.2327)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// C11 · ADICIONAL COM `annualRevenue = 0`
// ═══════════════════════════════════════════════════════════════════════════════════════════

describe('C11 · Adicional de IRPJ com receita anual zero ou ausente', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { fetchTaxPreview } = require('@/utils/calc-tax-preview')

  it('>>> `lp_estimated_annual_revenue = 0`: o adicional NÃO é apurado — `:263` exige `> 0` <<<', async () => {
    // O que acontece HOJE. Não é "o adicional é zero porque a empresa é pequena": é o
    // adicional NÃO APURADO, porque a receita estimada não foi informada. A distinção é
    // `ausente-vs-falso.md`, e o código trata as duas como zero — o que vale registrar.
    prepara({ ...LP_IND, lucro_presumido_activity: 'COMERCIO', lp_estimated_annual_revenue: 0 })
    const r = await fetchTaxPreview('t1')

    expect(r.effectiveTaxPct).toBeCloseTo(0.2327, 4)
    expect(r.taxableRegimePercent).toBeCloseTo(2.28, 4)
  })

  it('campo AUSENTE dá o MESMO que zero — e é por isso que ele não distingue os dois', async () => {
    // O par do caso acima. `Number(undefined) || 0` e `Number(0) || 0` chegam ao mesmo
    // número, então o campo não separa "não informado" de "informado como zero". Afirmar a
    // igualdade é afirmar o limite do dado, não aprová-lo.
    prepara({ ...LP_IND, lucro_presumido_activity: 'COMERCIO' })
    const semCampo = await fetchTaxPreview('t1')

    prepara({ ...LP_IND, lucro_presumido_activity: 'COMERCIO', lp_estimated_annual_revenue: 0 })
    const comZero = await fetchTaxPreview('t1')

    expect(semCampo.effectiveTaxPct).toBe(comZero.effectiveTaxPct)
    expect(semCampo.taxableRegimePercent).toBe(comZero.taxableRegimePercent)
  })
})
