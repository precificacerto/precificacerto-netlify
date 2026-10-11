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

  it('>>> XIV.4 CUMPRIDA no XI-3: o Presumido CHEGA ao `taxBreakdown`, e o `c` é NÚMERO <<<', () => {
    // >>> ESTE CASO MUDOU DE LADO EM 11/10/2026, E É O QUE O XI-3 FEZ <<<
    //
    // Ele afirmava `applied: false` e `reason: 'regime sem matriz escrita'` — o estado que a
    // trava `REGIMES_COM_MATRIZ = ['LUCRO_REAL']` produzia. O passo XI-3 trocou a lista
    // literal por leitura da matriz, e o Presumido passou a ser governado por ela.
    //
    // A razão de a trava cair agora e não antes está escrita nela própria: ela dizia que o
    // Presumido ficava fora *"até que a regra deles exista"*. A regra passou a existir — é a
    // Parte XIV da especificação, em `matriz-fiscal.ts`.
    //
    // O caso do agregado acima CONTINUA valendo e continua verde: a tela de produto chama
    // `calculatePricing` sem `taxBreakdown` (`content.component.tsx:941`), e esse caminho não
    // mudou. O que mudou é a PORTA da matriz, que é outra.
    const c = buildProductConstruction({
      taxableRegime: 'LUCRO_PRESUMIDO',
      segment: 'INDUSTRIALIZACAO',
      buyerType: 'CONSUMIDOR_FINAL',
      saleScope: 'INTRAESTADUAL',
      costTotal: CUSTO,
      // OBRIGATÓRIO no tipo, e o `tsc` enumerou as quatro chamadas de uma vez quando ele
      // faltou — é `construtor-empobrecido.md` funcionando: *"campo de cálculo é
      // obrigatório, e o custo de torná-lo obrigatório é exatamente o benefício"*. `0`
      // afirma "esta construção não tem acréscimos", que é o cenário dos casos.
      despAcessorias: 0,
      ...ESTRUTURA,
      profitTaxPct: LP_IRPJ + LP_CSLL,
      rates: { icmsPct: LP_ICMS, pisCofinsEffectivePct: LP_PIS_COFINS },
    })

    expect(c.applied).toBe(true)
    expect(c.reason).toBe('')
    // o `c` passou a ser APURADO — e com IBS/CBS zerados nesta entrada ele sai zero, que é
    // "apurado e vale nada", não "não apurado". A distinção é o C8.
    expect(externalOpsCoefficientToFreeze(c)).not.toBeNull()
    expect(c.opInterna).toBeGreaterThan(0)
    expect(c.totalGeral).toBeGreaterThanOrEqual(c.opInterna)
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

  it('>>> `lp_estimated_annual_revenue = 0`: o adicional não é apurado, e o resultado NÃO É NaN <<<', async () => {
    // O que acontece HOJE. Não é "o adicional é zero porque a empresa é pequena": é o
    // adicional NÃO APURADO, porque a receita estimada não foi informada. A distinção é
    // `ausente-vs-falso.md`, e o código trata as duas como zero — o que vale registrar.
    //
    // >>> A PROTEÇÃO É DUPLA E REDUNDANTE, E A PRIMEIRA REDAÇÃO DESTE CASO ERROU QUAL É <<<
    //
    // Ela dizia "`:263` exige `> 0`", como se a guarda externa fosse o que impede o
    // adicional. Medido na Parte D: trocar `annualRevenue > 0` por `>= 0` (`:263`) **não
    // deixa este caso vermelho**, e trocar `excedente > 0` por `>= 0` (`:266`) também não.
    // Cada uma protege sozinha, então nenhuma é necessária — e um portão que afirma a linha
    // errada é `portao-que-nao-alcanca.md` no próprio teste: a pergunta *"o que faz este
    // caso ficar vermelho?"* tinha a resposta "nada que aconteça à linha que o comentário
    // cita".
    //
    // O que o deixa vermelho é remover AS DUAS: aí `(0 × 0,10) ÷ 0` vira **NaN** e o
    // agregado inteiro contamina. A asserção de `Number.isNaN` abaixo é o que torna este
    // caso o guardião da divisão por zero, em vez de uma repetição do C4.
    prepara({ ...LP_IND, lucro_presumido_activity: 'COMERCIO', lp_estimated_annual_revenue: 0 })
    const r = await fetchTaxPreview('t1')

    expect(Number.isNaN(r.effectiveTaxPct)).toBe(false)
    expect(Number.isNaN(r.taxableRegimePercent)).toBe(false)
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

// ═══════════════════════════════════════════════════════════════════════════════════════════
// C10 · O DEFAULT `'COMERCIO'` EM DUAS CÓPIAS
// ═══════════════════════════════════════════════════════════════════════════════════════════

describe('C10 · o default da atividade está escrito duas vezes', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { fetchTaxPreview } = require('@/utils/calc-tax-preview')
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { loadTenantTaxComponents } = require('@/utils/tax-sync')

  it('default da atividade: as duas cópias concordam — pendência 22', async () => {
    // >>> POR QUE ESTE CASO EXISTE ANTES DE A CÓPIA SER APAGADA <<<
    //
    // `ts.lucro_presumido_activity || 'COMERCIO'` está escrito em DOIS lugares:
    //   `calc-tax-preview.ts:238`  — o preview que a tela usa
    //   `tax-sync.ts:376`          — o que alimenta o motor
    //
    // `copia-divergente.md`: *"o mesmo mapeamento escrito duas vezes, uma delas esquecendo
    // um campo — e nada falha."* O remédio dela é apagar uma, e isso é correção de outra
    // rodada. Até lá, este caso é o que faz a divergência ACUSAR em vez de chegar como
    // número plausível: mudar o default num dos dois arquivos o deixa vermelho.
    //
    // A asserção é sobre a CHAVE CONSULTADA, não sobre o percentual: os dois caminhos
    // produzem resultados de formatos diferentes, e o que tem de coincidir é a chave.
    const cenarios: [string, Record<string, unknown>][] = [
      ['chave ausente', { tenant_id: 't1', tax_regime: 'LUCRO_PRESUMIDO', calc_type: 'SERVICO', state_code: 'SP' }],
      ['chave gravada', { tenant_id: 't1', tax_regime: 'LUCRO_PRESUMIDO', calc_type: 'SERVICO', state_code: 'SP', lucro_presumido_activity: 'SERVICOS_32' }],
      ['chave vazia ""', { tenant_id: 't1', tax_regime: 'LUCRO_PRESUMIDO', calc_type: 'SERVICO', state_code: 'SP', lucro_presumido_activity: '' }],
    ]

    for (const [nome, ts] of cenarios) {
      prepara(ts)
      await fetchTaxPreview('t1')
      const doPreview = [...ACTIVITIES_PEDIDAS]

      prepara(ts)
      await loadTenantTaxComponents('t1')
      const doTaxSync = [...ACTIVITIES_PEDIDAS]

      // MEDIDO em 11/10/2026: as duas pedem a mesma chave nos três cenários.
      expect(doPreview).toEqual(doTaxSync)
      expect(doPreview).toHaveLength(1)
      // e o cenário do default é o que importa — `|| 'COMERCIO'` nos dois
      if (nome !== 'chave gravada') expect(doPreview).toEqual(['COMERCIO'])
      else expect(doPreview).toEqual(['SERVICOS_32'])
    }
  })

  it('a string VAZIA cai no default igual ao ausente — `||` não distingue os dois', async () => {
    // O `||` trata `''` e `undefined` do mesmo jeito. Vale afirmar porque um `??` no lugar
    // do `||` mudaria só o caso da string vazia, e nenhum outro caso do arquivo veria.
    prepara({ tenant_id: 't1', tax_regime: 'LUCRO_PRESUMIDO', calc_type: 'SERVICO', state_code: 'SP', lucro_presumido_activity: '' })
    await fetchTaxPreview('t1')
    expect(ACTIVITIES_PEDIDAS).toEqual(['COMERCIO'])
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// C6 · RET — o coeficiente pelo AGREGADO
// ═══════════════════════════════════════════════════════════════════════════════════════════

describe('C6 · RET: preço e coeficiente pela alíquota única', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { fetchTaxPreview } = require('@/utils/calc-tax-preview')

  const RET = {
    tenant_id: 't1', tax_regime: 'LUCRO_PRESUMIDO_RET', calc_type: 'INDUSTRIALIZACAO',
    state_code: 'SP',
  } as const

  it('RET: coeficiente pelo agregado (retRate + issRate) — DIVERGE DA ESPEC XIV.6, esperado após correção: linha única RET, sem ICMS, ISS nem PIS/COFINS', async () => {
    // O ramo próprio do RET (`calc-tax-preview.ts:172-188`) devolve UM número. Ele não abre
    // ICMS, ISS nem PIS/COFINS — mas não por obedecer a XIV.6: é porque NADA abre nessa
    // cadeia. A separação da XIV.6 e o agregado de hoje produzem o mesmo preço por
    // coincidência de estrutura, não por acerto, e é por isso que a divergência vai no nome.
    prepara({ ...RET })
    const preview = await fetchTaxPreview('t1')

    // MEDIDO: 0,04 — o default de `ret_rate` em `:175` (`Number(ts.ret_rate) || 0.04`)
    expect(preview.effectiveTaxPct).toBeCloseTo(0.04, 4)
    expect(preview.taxLabel).toBe('Lucro Presumido RET (4,00%)')

    const r = calculatePricing({
      calcType: 'INDUSTRIALIZACAO',
      totalItemsCost: CUSTO,
      yieldQuantity: 1,
      laborCostMonthly: 0,
      numProductiveEmployees: 1,
      monthlyWorkloadMinutes: 10_000,
      productWorkloadMinutes: 0,
      taxPct: preview.effectiveTaxPct,
      ...ESTRUTURA,
    })

    expect(r.isValid).toBe(true)
    // 1 − (0,22 + 0,04 + 0,01 + 0,05 + 0,10) = 0,58 · 1.000 ÷ 0,58 = 1.724,14
    expect(r.coefficient).toBeCloseTo(0.58, 6)
    expect(r.priceUnit).toBeCloseTo(1724.14, 2)
  })

  it('`ret_rate` gravado vence o default — 1% do Minha Casa Minha Vida', async () => {
    // O par que prova que o 0,04 do caso acima é DEFAULT e não constante: com `ret_rate`
    // gravado o número muda, e muda o preço com ele.
    prepara({ ...RET, ret_rate: 0.01 })
    const preview = await fetchTaxPreview('t1')

    expect(preview.effectiveTaxPct).toBeCloseTo(0.01, 4)
    expect(preview.taxLabel).toBe('Lucro Presumido RET (1,00%)')

    const r = calculatePricing({
      calcType: 'INDUSTRIALIZACAO', totalItemsCost: CUSTO, yieldQuantity: 1,
      laborCostMonthly: 0, numProductiveEmployees: 1, monthlyWorkloadMinutes: 10_000,
      productWorkloadMinutes: 0, taxPct: preview.effectiveTaxPct, ...ESTRUTURA,
    })
    // 1 − (0,22 + 0,01 + 0,01 + 0,05 + 0,10) = 0,61 · 1.000 ÷ 0,61 = 1.639,34
    expect(r.coefficient).toBeCloseTo(0.61, 6)
    expect(r.priceUnit).toBeCloseTo(1639.34, 2)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// C9 · `ret_iss_separate` — o DEFAULT soma o ISS aos 4%
// ═══════════════════════════════════════════════════════════════════════════════════════════

describe('C9 · RET: o ISS e a flag que ninguém gravou', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { fetchTaxPreview } = require('@/utils/calc-tax-preview')

  const RET_ISS = {
    tenant_id: 't1', tax_regime: 'LUCRO_PRESUMIDO_RET', calc_type: 'INDUSTRIALIZACAO',
    state_code: 'SP', iss_municipality_rate: 0.05,
  } as const

  it('RET: ISS somado aos 4% por DEFAULT — lado herdado, não decidido. Pendência 23', async () => {
    // `calc-tax-preview.ts:176` → `const retIssSeparate = ts.ret_iss_separate !== false`
    // Ou seja: **ausente é TRUE**. A pergunta própria do VIII.6 — *"o ISS está embutido nos
    // 4% ou é acréscimo municipal da obra? Não deduzir"* — já tem um lado implementado por
    // default, e o default é "soma".
    //
    // O caso afirma o que acontece HOJE, e o nome diz que o lado foi herdado. Se a decisão
    // for "embutido", este caso fica vermelho e é isso que se quer: a mudança passa por
    // alguém em vez de ser silenciosa.
    prepara({ ...RET_ISS })   // sem `ret_iss_separate`
    const r = await fetchTaxPreview('t1')

    // MEDIDO: 0,09 = 4% + 5%. Se o ISS estivesse embutido, seria 0,04.
    expect(r.effectiveTaxPct).toBeCloseTo(0.09, 4)
    expect(r.taxLabel).toBe('Lucro Presumido RET (4,00% + ISS 5,00%)')
    expect(r.effectiveTaxPct).not.toBeCloseTo(0.04, 4)
  })

  it('com a flag em `false` o ISS NÃO entra — e é o par que prova que o default é `true`', async () => {
    prepara({ ...RET_ISS, ret_iss_separate: false })
    const r = await fetchTaxPreview('t1')

    // MEDIDO: 0,04 — o ISS saiu, e o rótulo deixou de nomeá-lo.
    expect(r.effectiveTaxPct).toBeCloseTo(0.04, 4)
    expect(r.taxLabel).toBe('Lucro Presumido RET (4,00%)')
  })

  it('a flag em `true` explícito dá o mesmo que ausente — `!== false`', async () => {
    // Fecha as três possibilidades do campo: `true`, `false` e ausente. É o que torna o
    // caso acima uma afirmação sobre o DEFAULT e não sobre um valor gravado.
    prepara({ ...RET_ISS, ret_iss_separate: true })
    const explicito = await fetchTaxPreview('t1')
    prepara({ ...RET_ISS })
    const ausente = await fetchTaxPreview('t1')

    expect(explicito.effectiveTaxPct).toBe(ausente.effectiveTaxPct)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// C8 · O `c` DO RET É `null`, NÃO `0`
// ═══════════════════════════════════════════════════════════════════════════════════════════

describe('C8 · RET: o coeficiente da operação por fora é NÃO APURADO', () => {
  const ENTRADA = {
    segment: 'INDUSTRIALIZACAO' as const,
    buyerType: 'CONSUMIDOR_FINAL' as const,
    saleScope: 'INTRAESTADUAL' as const,
    costTotal: CUSTO,
    /** Obrigatório no tipo — ver a nota em C1. `0` = sem acréscimos nesta construção. */
    despAcessorias: 0,
    ...ESTRUTURA,
    profitTaxPct: 0.0228,
    rates: { icmsPct: 0.18, pisCofinsEffectivePct: 0.02993, ibsPct: 0, cbsPct: 0 },
  }

  it('>>> o `c` do MEI é `null` e o do Lucro Real é `0` — não apurado ≠ apurado e vale nada <<<', () => {
    // >>> O PAR É A ASSERÇÃO. Nenhum dos dois lados sozinho afirma a distinção <<<
    //
    // `ausente-vs-falso.md`, e a razão está escrita no próprio
    // `product-price-construction.ts:273-275`: *"`0` e `null` NÃO são a mesma coisa: `0` é
    // 'a matriz governou e não há tributo por fora', apurado; `null` é 'não há regra escrita
    // para este regime', não apurado."*
    //
    // Com alíquotas de IBS e CBS em ZERO nos dois casos, um sistema que confundisse os dois
    // estados daria o MESMO número — e é exatamente por isso que o caso usa zero em ambos:
    // o que distingue não é a alíquota, é o regime ter ou não regra escrita.
    // >>> O LADO `null` MUDOU DE REGIME NO XI-3, E O PAR TINHA DE CONTINUAR EXISTINDO <<<
    // Era o RET. Ele passou a ter matriz, então o `c` dele é apurado. O MEI ocupa o lugar:
    // `tributosPorForaNaMatriz('MEI')` é `[]`, logo não há operação por fora e não há `c`.
    // Sem esta troca, a distinção de `ausente-vs-falso` ficaria sem portão nenhum.
    const real = buildProductConstruction({ ...ENTRADA, taxableRegime: 'LUCRO_REAL' })
    const mei = buildProductConstruction({ ...ENTRADA, taxableRegime: 'MEI' })

    // LUCRO REAL: a matriz governou, as alíquotas por fora são zero → `c = 0`, APURADO
    expect(real.applied).toBe(true)
    expect(externalOpsCoefficientToFreeze(real)).toBe(0)

    // MEI: não há regra escrita → `c = null`, NÃO APURADO
    expect(mei.applied).toBe(false)
    expect(mei.reason).toBe('regime sem matriz escrita')
    expect(externalOpsCoefficientToFreeze(mei)).toBeNull()

    // >>> E A ASSERÇÃO QUE PROÍBE A CONFUSÃO <<<
    // `toBeNull` passaria sozinho se alguém trocasse o retorno por `0`? Não — mas `toBe(0)`
    // passaria se alguém trocasse `null` por `0`, porque `0 === 0`. O par abaixo é o que
    // impede isso: os dois estados são DIFERENTES entre si, e nenhum é falsy-equivalente ao
    // outro para esta asserção.
    expect(externalOpsCoefficientToFreeze(mei)).not.toBe(0)
    expect(externalOpsCoefficientToFreeze(real)).not.toBeNull()
  })

  it('a estrutura por fora do RET EXISTE — é o que dá sentido ao `null`', () => {
    // Sem esta metade, o `null` acima poderia ser lido como "o RET não tem operação por
    // fora". Tem: a ESPEC III.5 manda a estrutura existir desde já, com alíquota zero, e a
    // tabela de regime a tem. O `null` diz que o COEFICIENTE não foi apurado, não que o
    // tributo não exista.
    //
    // Afirmado pela tabela, não pela tela — o caso de tela já existe em
    // `por-fora-por-regime.test.tsx` e não se repete aqui.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { tributosPorForaDoRegime } = require('@/utils/por-fora-por-regime')
    expect([...tributosPorForaDoRegime('LUCRO_PRESUMIDO_RET')].sort()).toEqual(['CBS', 'IBS'])
  })

  it('>>> XIV.6 CUMPRIDA no XI-3: o `c` do RET e do Presumido passou a ser NÚMERO <<<', () => {
    // >>> A PROVA POSITIVA DA MUDANÇA, pedida pelo PO <<<
    // O caso anterior afirma que o `null` ainda existe (no MEI); este afirma que ele DEIXOU
    // de existir onde a matriz passou a governar. Os dois juntos dizem o que mudou e o que
    // não — um só diria metade.
    for (const regime of ['LUCRO_PRESUMIDO', 'LUCRO_PRESUMIDO_RET'] as const) {
      const c = buildProductConstruction({ ...ENTRADA, taxableRegime: regime })
      expect(c.applied).toBe(true)
      expect(c.reason).toBe('')
      const congelado = externalOpsCoefficientToFreeze(c)
      expect(congelado).not.toBeNull()
      expect(typeof congelado).toBe('number')
      // cabe na CHECK do banco: `[0, 1)`
      expect(congelado!).toBeGreaterThanOrEqual(0)
      expect(congelado!).toBeLessThan(1)
    }
  })

  it('e o Simples Nacional continua FORA — por não ter operação por fora, não por nome', () => {
    // O par que mostra que a admissão é por CÉLULA e não por lista: Simples e MEI seguem
    // recusados porque `tributosPorForaNaMatriz` devolve `[]` neles.
    const sn = buildProductConstruction({ ...ENTRADA, taxableRegime: 'SIMPLES_NACIONAL' })
    expect(sn.applied).toBe(false)
    expect(externalOpsCoefficientToFreeze(sn)).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// C5 e C7 · A DECOMPOSIÇÃO — em que etapa IRPJ e CSLL aparecem
// ═══════════════════════════════════════════════════════════════════════════════════════════

describe('C5 e C7 · IRPJ e CSLL na decomposição, por regime', () => {
  const ITEM = {
    key: 'i1', label: 'P1', quantity: 1, unitPrice: 2_500,
    costUnit: CUSTO, productiveLaborUnit: 0,
    commissionPct: 5, profitPct: 10, rtPct: 0,
  }
  const DESPESAS = { fixaPct: 0.10, variavelPct: 0.03, financeiraPct: 0.02, moIndiretaPct: 0.07 }

  const categoriasDe = (regime: string) => buildBudgetDecompositionInput({
    items: [ITEM as never], discountPct: 0, despesas: DESPESAS as never,
    tenantCalcType: 'INDUSTRIALIZACAO', regime,
  }).input.items[0].categories

  it('C5 · Presumido: IRPJ e CSLL caem na ETAPA 16, derivados do LUCRO — DIVERGE DA ESPEC XIV.4, esperado após correção: etapa 13C, presunção sobre a RECEITA', () => {
    // A linha que decide é `budget-decomposition-input.ts:318-319`:
    //   irpjPct: guiaUnica ? 0 : lucroPct * IRPJ_RATE_ON_PROFIT
    // `guiaUnica` (`:216`) é SIMPLES_NACIONAL || MEI || hibrido — o Presumido não está lá,
    // então cai no `else`, que é o ramo do Lucro Real.
    const c = categoriasDe('LUCRO_PRESUMIDO')

    // MEDIDO: lucro 10% × 0,15 = 0,015 e × 0,09 = 0,009. Derivado do LUCRO, não da receita.
    expect(c.irpjPct).toBeCloseTo(0.015, 6)
    expect(c.csllPct).toBeCloseTo(0.009, 6)

    // >>> A ASSERÇÃO QUE NOMEIA A DIVERGÊNCIA <<<
    // Os pesos entram na soma do RRO (`decomposition-dre.ts:586`), ou seja na ETAPA 16. Se a
    // correção os mover para a 13, eles passam a ser ZERO aqui — como no Simples, onde já
    // estão no DAS. O caso abaixo é o par que mostra qual é o estado "na etapa 13".
    expect(c.irpjPct).not.toBe(0)
    expect(c.csllPct).not.toBe(0)
  })

  it('C5 · e é IDÊNTICO ao Lucro Real — é o que prova que o Presumido empresta a conta dele', () => {
    // A frase da ESPEC: *"Presumido e RET 'funcionam' porque emprestam a conta do Lucro
    // Real."* Esta é a asserção dela: bit a bit o mesmo número.
    const presumido = categoriasDe('LUCRO_PRESUMIDO')
    const real = categoriasDe('LUCRO_REAL')
    expect(presumido.irpjPct).toBe(real.irpjPct)
    expect(presumido.csllPct).toBe(real.csllPct)
  })

  it('C7 · RET: o MESMO — `regimeNorm` não está em `guiaUnica` e cai no ramo do Lucro Real — DIVERGE DA ESPEC XIV.6, esperado após correção: IRPJ e CSLL ZERADOS, dentro dos 4%', () => {
    const ret = categoriasDe('LUCRO_PRESUMIDO_RET')
    const real = categoriasDe('LUCRO_REAL')

    // MEDIDO: 0,015 e 0,009, iguais ao Lucro Real.
    expect(ret.irpjPct).toBeCloseTo(0.015, 6)
    expect(ret.csllPct).toBeCloseTo(0.009, 6)
    expect(ret.irpjPct).toBe(real.irpjPct)
    expect(ret.csllPct).toBe(real.csllPct)
  })

  it('>>> o par que mostra o estado CERTO: na guia única IRPJ e CSLL são ZERO <<<', () => {
    // Sem este caso, os dois acima afirmariam um número sem referência: `0,015` seria só um
    // número. Com ele, fica claro que o código JÁ SABE zerar IRPJ/CSLL quando eles estão
    // dentro de outra guia — e que o RET, cujos 4% os englobam (XIV.6), deveria estar aqui.
    for (const regime of ['SIMPLES_NACIONAL', 'MEI', 'SIMPLES_HIBRIDO']) {
      const c = categoriasDe(regime)
      expect(c.irpjPct).toBe(0)
      expect(c.csllPct).toBe(0)
      // e a comissão e o lucro NÃO são zerados — a guia única mexe só nos dois tributos
      expect(c.comissaoPct).toBeCloseTo(0.05, 6)
      expect(c.lucroPct).toBeCloseTo(0.10, 6)
    }
  })
})
