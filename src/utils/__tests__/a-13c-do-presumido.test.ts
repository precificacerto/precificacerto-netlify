/**
 * A 13C DO PRESUMIDO — IRPJ e CSLL saem do resíduo e viram tributo sobre a receita.
 *
 * ESPEC VIII.4 e XIV.4. Rodada 13C, 12/10/2026.
 *
 * ── O QUE A MEDIÇÃO MOSTROU, e muda o enquadramento da rodada ──────────────────────────────
 *
 * **A CONSTRUÇÃO JÁ FAZIA A PRESUNÇÃO SOBRE A RECEITA.** `tax-sync.ts` devolve, para o
 * Presumido, `irpj = presunção_irpj × 15%` e `csll = presunção_csll × 9%` — alíquotas sobre
 * RECEITA —, e as soma no `total` que forma o preço. Quem apurava sobre o LUCRO era só a
 * DECOMPOSIÇÃO, que tratava os dois como resíduo da etapa 16.
 *
 * Então a rodada não ensina a conta ao sistema: ela faz a decomposição LER a conta que a
 * construção já usava. É `regime-e-segmento-determinam-a-construcao.md` na forma exata —
 * *"a decomposição NÃO INFERE, ela LÊ o que a construção usou"* — e a aparição era a de número
 * 1 daquela página, com os dois lados fechando entre si.
 *
 * ── E A PRESUNÇÃO NÃO VEM DO SEGMENTO ─────────────────────────────────────────────────────
 *
 * O comando dá os números por segmento (8/12 indústria-comércio, 32/32 serviço). Medido: eles
 * são DADO, não constante — vivem em `lucro_presumido_rates`, consultada pela
 * `lucro_presumido_activity` do tenant, com os manuais do tenant tendo precedência.
 *
 * Inferi-los do `calc_type` daria 32% a um tenant de serviço cuja atividade cadastrada é
 * `COMERCIO`: um número que a construção nunca usou. Por isso os casos de segmento abaixo
 * afirmam a DERIVAÇÃO (base × alíquota) com as duas bases, e a origem do percentual fica onde
 * ela está — no cadastro.
 */

import {
  ADICIONAL_IRPJ_LIMITE_ANUAL,
  ADICIONAL_IRPJ_RATE,
  CSLL_RATE,
  IRPJ_RATE,
  presuncaoSobreReceita,
} from '@/utils/presuncao-do-presumido'
import { buildBudgetDecompositionInput } from '@/utils/budget-decomposition-input'
import { buildDecomposition } from '@/utils/decomposition-dre'
import { celulaDe } from '@/utils/matriz-fiscal'
import { applyDecompositionToResidual } from '@/utils/residual-from-decomposition'
import { readFileSync } from 'fs'
import { join } from 'path'

// ═══════════════════════════════════════════════════════════════════════════════════════════
// (a) A FONTE ÚNICA — e o adicional SEPARADO, que antes vinha somado dentro do IRPJ
// ═══════════════════════════════════════════════════════════════════════════════════════════

describe('(a) a presunção sobre a receita, de uma fonte só', () => {
  it('>>> indústria/comércio: 8% × 15% = 1,20% e 12% × 9% = 1,08% <<<', () => {
    const p = presuncaoSobreReceita({ irpjPresuncaoPct: 0.08, csllPresuncaoPct: 0.12 })
    expect(p.irpjPct).toBeCloseTo(0.012, 10)
    expect(p.csllPct).toBeCloseTo(0.0108, 10)
    expect(p.adicionalPct).toBe(0)
  })

  it('>>> serviço: 32% nas duas → 4,80% e 2,88% <<<', () => {
    // O par do caso acima. Com uma base só, um percentual hard-coded passaria verde.
    const p = presuncaoSobreReceita({ irpjPresuncaoPct: 0.32, csllPresuncaoPct: 0.32 })
    expect(p.irpjPct).toBeCloseTo(0.048, 10)
    expect(p.csllPct).toBeCloseTo(0.0288, 10)
    // e as duas bases DIVERGEM — é o que torna o par discriminante
    expect(p.irpjPct).not.toBeCloseTo(0.012, 6)
  })

  it('a alíquota legal é 15% e 9%, e o caso falha se trocarem', () => {
    expect(IRPJ_RATE).toBe(0.15)
    expect(CSLL_RATE).toBe(0.09)
    expect(ADICIONAL_IRPJ_RATE).toBe(0.10)
    expect(ADICIONAL_IRPJ_LIMITE_ANUAL).toBe(240_000)
  })

  it('>>> o ADICIONAL: ABAIXO dos R$ 240.000 de base ele é ZERO <<<', () => {
    // Receita 2.000.000 × 8% = 160.000 de base. Abaixo do limite.
    const p = presuncaoSobreReceita({
      irpjPresuncaoPct: 0.08, csllPresuncaoPct: 0.12, receitaAnualEstimada: 2_000_000,
    })
    expect(p.adicionalPct).toBe(0)
  })

  it('>>> o ADICIONAL: ACIMA dos R$ 240.000 de base ele aparece, e o valor confere <<<', () => {
    // Receita 5.000.000 × 8% = 400.000 de base. Excedente 160.000 × 10% = 16.000.
    // Em alíquota sobre a receita: 16.000 ÷ 5.000.000 = 0,32%.
    const p = presuncaoSobreReceita({
      irpjPresuncaoPct: 0.08, csllPresuncaoPct: 0.12, receitaAnualEstimada: 5_000_000,
    })
    expect(p.adicionalPct).toBeCloseTo(0.0032, 10)
    // o IRPJ "puro" NÃO engordou — o adicional é linha própria, e é o ponto
    expect(p.irpjPct).toBeCloseTo(0.012, 10)
  })

  it('o limite é EXATO: base igual a R$ 240.000 não gera adicional', () => {
    // 3.000.000 × 8% = 240.000, exatamente o limite.
    const p = presuncaoSobreReceita({ irpjPresuncaoPct: 0.08, receitaAnualEstimada: 3_000_000 })
    expect(p.adicionalPct).toBe(0)
  })

  it('sem receita anual estimada o adicional é ZERO — e isso é o comportamento de hoje', () => {
    // `ausente-vs-falso.md`: ausência de estimativa não é receita zero, mas o adicional sem
    // ela não é apurável. Preservado como estava, e nomeado em vez de silencioso.
    expect(presuncaoSobreReceita({ irpjPresuncaoPct: 0.08 }).adicionalPct).toBe(0)
    expect(presuncaoSobreReceita({ irpjPresuncaoPct: 0.08, receitaAnualEstimada: 0 }).adicionalPct).toBe(0)
    expect(presuncaoSobreReceita({ irpjPresuncaoPct: 0.08, receitaAnualEstimada: null }).adicionalPct).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// (b) A MATRIZ DIZ A BASE, e o código passa a LÊ-LA
// ═══════════════════════════════════════════════════════════════════════════════════════════

describe('(b) a matriz é quem manda', () => {
  it('Presumido: base PRESUNCAO, etapa 13C — nos três segmentos', () => {
    for (const seg of ['INDUSTRIALIZACAO', 'REVENDA', 'SERVICO'] as const) {
      for (const t of ['IRPJ', 'CSLL', 'ADICIONAL_IRPJ'] as const) {
        const c = celulaDe('LUCRO_PRESUMIDO' as never, seg, t)
        expect(`${seg}/${t}: ${c?.base} ${c?.etapa}`).toBe(`${seg}/${t}: PRESUNCAO 13C`)
      }
    }
  })

  it('>>> Lucro Real: base LUCRO, etapa 16 — e é por isso que ele NÃO muda <<<', () => {
    for (const seg of ['INDUSTRIALIZACAO', 'REVENDA', 'SERVICO'] as const) {
      for (const t of ['IRPJ', 'CSLL'] as const) {
        const c = celulaDe('LUCRO_REAL' as never, seg, t)
        expect(`${seg}/${t}: ${c?.base} ${c?.etapa}`).toBe(`${seg}/${t}: LUCRO 16`)
      }
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// (c) A DECOMPOSIÇÃO — IRPJ/CSLL do Presumido SAEM da 16 e ENTRAM na 13C
// ═══════════════════════════════════════════════════════════════════════════════════════════

const CUSTO = 1_000
const ITEM = {
  key: 'i1', label: 'P1', quantity: 1, unitPrice: 2_500,
  costUnit: CUSTO, productiveLaborUnit: 0,
  commissionPct: 5, profitPct: 10, rtPct: 0,
  rates: { icms_pct: 18, pis_pct: 0.65, cofins_pct: 3.00 },
}
const DESPESAS = { fixa: 0.10, compromisso: 0, variavel: 0.03, financeira: 0.02, indireta: 0.07, moProdutiva: 0 }

/** A presunção que a construção leu, passada à decomposição — nunca inferida aqui. */
const PRESUNCAO_IND = presuncaoSobreReceita({ irpjPresuncaoPct: 0.08, csllPresuncaoPct: 0.12 })

function montar(regime: string, over: Record<string, unknown> = {}) {
  const p = buildBudgetDecompositionInput({
    items: [ITEM as never],
    discountPct: 0,
    despesas: DESPESAS as never,
    tenantCalcType: 'INDUSTRIALIZACAO',
    regime,
    presuncao: regime === 'LUCRO_PRESUMIDO' ? PRESUNCAO_IND : undefined,
    ...over,
  } as never)
  return { params: p, result: buildDecomposition(p.input) }
}

const linha = (r: ReturnType<typeof buildDecomposition>, key: string) => r.rows.find((x) => x.key === key)
const total = (r: ReturnType<typeof buildDecomposition>, key: string) => linha(r, key)?.total ?? null

describe('(c) a 13C na decomposição do Presumido', () => {
  it('>>> as TRÊS LINHAS da 13C existem, e são ANTES da receita líquida <<<', () => {
    const { result } = montar('LUCRO_PRESUMIDO')
    const chaves = result.rows.map((r) => r.key)
    for (const k of ['irpj_13c', 'csll_13c', 'adicional_irpj_13c']) {
      expect(chaves).toContain(k)
      expect(chaves.indexOf(k)).toBeLessThan(chaves.indexOf('receita_liquida'))
    }
  })

  it('>>> o valor é a PRESUNÇÃO sobre a receita de produtos, como o ICMS <<<', () => {
    const { result } = montar('LUCRO_PRESUMIDO')
    const rp = 2_500 // sem desconto e sem acréscimos, a receita de produtos é o total
    // IRPJ: 2.500 × 1,20% = 30,00 · CSLL: 2.500 × 1,08% = 27,00
    expect(total(result, 'irpj_13c')).toBeCloseTo(-30, 2)
    expect(total(result, 'csll_13c')).toBeCloseTo(-27, 2)
    expect(total(result, 'irpj_13c')).toBeCloseTo(-rp * PRESUNCAO_IND.irpjPct, 6)
    // e o ICMS da MESMA base, para provar que é o mesmo tratamento: 2.500 × 18% = 450
    expect(total(result, 'icms')).toBeCloseTo(-450, 2)
  })

  it('>>> a ETAPA 16 do Presumido tem DUAS linhas, e os pesos somam 1 <<<', () => {
    const { result } = montar('LUCRO_PRESUMIDO')
    // As linhas de IRPJ e CSLL da etapa 16 NÃO existem mais aqui.
    expect(linha(result, 'irpj')).toBeUndefined()
    expect(linha(result, 'csll')).toBeUndefined()
    const com = linha(result, 'comissao')!
    const luc = linha(result, 'lucro')!
    expect(com).toBeDefined()
    expect(luc).toBeDefined()
    // peso_comissão + peso_lucro = 1
    expect((com.pct ?? 0) + (luc.pct ?? 0)).toBeCloseTo(1, 10)
    // e o peso de cada um é o cadastrado sobre a soma dos dois: 5/15 e 10/15
    expect(com.pct).toBeCloseTo(5 / 15, 10)
    expect(luc.pct).toBeCloseTo(10 / 15, 10)
  })

  it('>>> a ETAPA 17 FECHA: o residual é ZERO <<<', () => {
    const { result } = montar('LUCRO_PRESUMIDO')
    expect(result.residual.total).toBeCloseTo(0, 6)
    expect(result.errors).toEqual([])
  })

  it('a etapa 17 fecha TAMBÉM com desconto, que é onde o resíduo costuma vazar', () => {
    for (const d of [0.05, 0.20, 0.40]) {
      const { result } = montar('LUCRO_PRESUMIDO', { discountPct: d })
      expect(`d=${d}`).toBe(`d=${d}`)
      expect(result.residual.total).toBeCloseTo(0, 6)
      expect(result.errors).toEqual([])
    }
  })

  it('>>> o RRO do Presumido MUDA DE VALOR — a conta abate IRPJ/CSLL antes <<<', () => {
    const presumido = montar('LUCRO_PRESUMIDO').result
    const real = montar('LUCRO_REAL').result
    // O RRO do Presumido é MENOR: 57,00 saíram antes (30 + 27).
    expect(presumido.rro!.apurado).toBeLessThan(real.rro!.apurado)
    expect(real.rro!.apurado - presumido.rro!.apurado).toBeCloseTo(57, 2)

    // >>> O INVARIANTE DO RRO *NÃO* É AFIRMADO AQUI, e a razão é medida <<<
    //
    // A primeira redação deste caso afirmava `foraDeZero === false` nos dois. Ela ficou
    // vermelha, e o errado era o caso: esta fixture tem `unitPrice` ARBITRÁRIO, então a
    // construção nunca formou este preço com estes percentuais, e o invariante
    // construção-contra-decomposição acusa nos DOIS regimes — medido: Real −26,25 e
    // Presumido −23,25. A divergência é da fixture, não da conta.
    //
    // O que a medição mostra, e vale registrar: a do Presumido ficou MENOR em módulo, ou
    // seja, a correção andou na direção de zero. O invariante propriamente dito é afirmado
    // no caso seguinte, com fixture DERIVADA do coeficiente da construção.
    //
    // `teste-que-nao-exercita.md`: afirmar `foraDeZero` sobre fixture incoerente seria uma
    // asserção que passa ou falha por razão alheia à correção.
    expect(Math.abs(presumido.rro!.divergencia)).toBeLessThan(Math.abs(real.rro!.divergencia))
  })

  it('>>> O INVARIANTE FECHA com fixture COERENTE: a decomposição concorda com a construção <<<', () => {
    // A fixture é DERIVADA do coeficiente da construção, não escolhida: é o que torna o caso
    // uma afirmação sobre a conta em vez de sobre o número que eu digitei.
    //
    //   Σ = despesas + taxPct + RT + comissão + lucro          (`pricing-engine.ts:232`)
    //   taxPct do Presumido = ICMS + PIS/COFINS efetivo + IRPJ_pres + CSLL_pres  (`tax-sync.ts`)
    //   preço = custo ÷ (1 − Σ)
    const DESP = 0.10 + 0.03 + 0.02 + 0.07          // 22,00% — os baldes da INDUSTRIALIZACAO
    const ICMS = 0.18
    const PIS_COFINS_EFETIVO = 0.0365 * (1 - ICMS)  // a exclusão do ICMS da base, R5 exceção 1
    const taxPct = ICMS + PIS_COFINS_EFETIVO + PRESUNCAO_IND.irpjPct + PRESUNCAO_IND.csllPct
    const SIGMA = DESP + taxPct + 0.05 + 0.10
    const preco = CUSTO / (1 - SIGMA)

    // >>> E O CADASTRO GUARDA O PIS/COFINS *EFETIVO*, não o nominal <<<
    //
    // Medido ao escrever este caso, e foi o que derrubou a primeira fixture: `item_tax_rates`
    // guarda a alíquota EFETIVA (no Lucro Real, 7,678% para uma nominal de 9,25%), e
    // `budget-decomposition-input.ts` a converte de volta ao nominal por
    // `pisCofinsNominalFromEffective` antes de aplicá-la sobre `P − ICMS − ISS`.
    //
    // Passar 3,65 ali — que é a NOMINAL — fazia a conversão engordá-la para 4,4512% e a
    // dedução virar 3,65% da receita INTEIRA, R$ 16,54 a mais num item de R$ 2.517,18. O
    // invariante acusou, corretamente, e o errado era a minha fixture.
    const itemCoerente = {
      ...ITEM,
      unitPrice: preco,
      rates: {
        icms_pct: ICMS * 100,
        pis_pct: PIS_COFINS_EFETIVO * 100 * (0.65 / 3.65),
        cofins_pct: PIS_COFINS_EFETIVO * 100 * (3.00 / 3.65),
      },
    }

    const p = buildBudgetDecompositionInput({
      items: [itemCoerente as never],
      discountPct: 0,
      despesas: DESPESAS as never,
      tenantCalcType: 'INDUSTRIALIZACAO',
      regime: 'LUCRO_PRESUMIDO',
      presuncao: PRESUNCAO_IND,
    } as never)
    const result = buildDecomposition(p.input)

    // O RRO apurado por SUBTRAÇÃO é o reservado pela construção: `preço × (5% + 10%)`.
    expect(result.rro!.esperado).toBeCloseTo(preco * 0.15, 6)
    expect(result.rro!.apurado).toBeCloseTo(preco * 0.15, 6)
    expect(result.rro!.divergencia).toBeCloseTo(0, 6)
    expect(result.rro!.foraDeZero).toBe(false)
    // e a etapa 17 fecha
    expect(result.residual.total).toBeCloseTo(0, 6)

    // >>> O PAR QUE DISCRIMINA: sem a presunção a decomposição ACUSA, e não deduz menos <<<
    //
    // Estado real, achado aqui: a matriz manda IRPJ/CSLL para a 13C, logo eles saem do
    // resíduo da etapa 16 — mas se as alíquotas não chegam, as três linhas da 13C também não
    // existem, e os dois ficam fora de lugar nenhum. O RRO sai MAIOR do que a construção
    // reservou, e nada falha: os dois lados fecham entre si.
    //
    // Por isso virou ERRO. Sem este par, "o invariante fecha" passaria verde num mundo em que
    // a ausência da presunção produzisse um RRO plausível.
    const semPresuncao = buildDecomposition(buildBudgetDecompositionInput({
      items: [itemCoerente as never],
      discountPct: 0,
      despesas: DESPESAS as never,
      tenantCalcType: 'INDUSTRIALIZACAO',
      regime: 'LUCRO_PRESUMIDO',
    } as never).input)
    expect(semPresuncao.errors.length).toBeGreaterThan(0)
    expect(semPresuncao.errors.join(' ')).toContain('13C')
    // e o número que ele produziria é MAIOR que o reservado — a razão de o erro existir
    expect(semPresuncao.rro!.apurado).toBeGreaterThan(preco * 0.15)
    expect(semPresuncao.rro!.apurado - result.rro!.apurado).toBeCloseTo(preco * 0.0228, 6)
  })

  it('o adicional entra na 13C quando existe, e some quando não', () => {
    const semAdicional = montar('LUCRO_PRESUMIDO').result
    expect(total(semAdicional, 'adicional_irpj_13c')).toBeCloseTo(0, 6)

    const comAdicional = montar('LUCRO_PRESUMIDO', {
      presuncao: presuncaoSobreReceita({
        irpjPresuncaoPct: 0.08, csllPresuncaoPct: 0.12, receitaAnualEstimada: 5_000_000,
      }),
    }).result
    // 2.500 × 0,32% = 8,00
    expect(total(comAdicional, 'adicional_irpj_13c')).toBeCloseTo(-8, 2)
    // e o residual continua fechando com a linha nova dentro
    expect(comAdicional.residual.total).toBeCloseTo(0, 6)
    // o RRO caiu os 8,00 a mais
    expect(semAdicional.rro!.apurado - comAdicional.rro!.apurado).toBeCloseTo(8, 2)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// (d) O LUCRO REAL NÃO MUDA UM CENTAVO — e a prova é por contraste, não por asserção isolada
// ═══════════════════════════════════════════════════════════════════════════════════════════

describe('(d) o Lucro Real intocado', () => {
  it('>>> no Real as linhas da 13C NÃO EXISTEM, e IRPJ/CSLL seguem na etapa 16 <<<', () => {
    const { result } = montar('LUCRO_REAL')
    for (const k of ['irpj_13c', 'csll_13c', 'adicional_irpj_13c']) {
      expect(linha(result, k)).toBeUndefined()
    }
    expect(linha(result, 'irpj')).toBeDefined()
    expect(linha(result, 'csll')).toBeDefined()
  })

  it('>>> e o caso do Real: IRPJ/CSLL são 15%/9% DO LUCRO distribuído <<<', () => {
    // É a asserção do `:80` da Esquadrias, replicada aqui para que esta rodada tenha a sua
    // própria rede: se a 13C vazar para o Real, este caso cai antes da Esquadrias.
    const { result } = montar('LUCRO_REAL')
    const luc = total(result, 'lucro')!
    expect(total(result, 'irpj')! / luc).toBeCloseTo(0.15, 8)
    expect(total(result, 'csll')! / luc).toBeCloseTo(0.09, 8)
    // RRO = comissão + lucro + IRPJ + CSLL
    const soma = total(result, 'comissao')! + luc + total(result, 'irpj')! + total(result, 'csll')!
    expect(soma).toBeCloseTo(result.rro!.apurado, 6)
  })

  it('no Real a etapa 16 tem QUATRO linhas — o contraste com as duas do Presumido', () => {
    // >>> CORREÇÃO DE UMA ASSERÇÃO MINHA, e ela fica registrada <<<
    //
    // A primeira redação afirmava que os `pct` das quatro linhas somavam 1. Ela ficou
    // VERMELHA antes de qualquer alteração, e o errado era o caso: por R17 as linhas de
    // IRPJ e CSLL exibem a ALÍQUOTA LEGAL sobre o lucro distribuído (15% e 9%), não o peso —
    // só Comissão e Lucro exibem peso. Somar os quatro `pct` soma coisas de naturezas
    // diferentes.
    //
    // O que de fato distingue os dois formatos é a CONTAGEM de linhas e o que FECHA o RRO.
    const { result } = montar('LUCRO_REAL')
    const chaves = result.rows.map((r) => r.key)
    expect(chaves).toContain('irpj')
    expect(chaves).toContain('csll')

    // Os pesos de Comissão e Lucro NÃO somam 1 no Real, porque IRPJ e CSLL também pesam:
    // a soma dos quatro cadastrados é 5 + 10 + 1,5 + 0,9 = 17,4, então Comissão + Lucro
    // pesam 15/17,4 = 0,8621. É o contraste direto com o Presumido, onde eles somam 1.
    const soma2 = (linha(result, 'comissao')!.pct ?? 0) + (linha(result, 'lucro')!.pct ?? 0)
    expect(soma2).toBeCloseTo(15 / 17.4, 6)
    expect(soma2).toBeLessThan(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// (e) OS CARDS — a ausência das linhas da 16 não pode derrubar a decomposição inteira
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// `residual-from-decomposition.ts` é TUDO OU NADA de propósito: com uma rubrica faltando, o
// bloco voltaria a misturar três cards da decomposição com um da Etapa 16. A regra é boa, e foi
// ela que quase produziu uma regressão silenciosa nesta rodada: sem as linhas `irpj`/`csll`, o
// Presumido caía no `return distribution` e os cards exibiam a repartição ANTIGA, calada.
//
// A correção é o mesmo mecanismo que já existia para a guia única — zero LEGÍTIMO —, com um
// sinal próprio, porque as duas causas são afirmações diferentes: "não existe tributo" e
// "existe, e não é resíduo".
describe('(e) os cards aceitam a decomposição do Presumido', () => {
  it('>>> sem as linhas da etapa 16, os cards NÃO voltam para a Etapa 16 <<<', () => {
    const { result } = montar('LUCRO_PRESUMIDO')
    expect(result.presuncaoNa13C).toBe(true)

    const antes = { marcador: 'etapa16' } as never
    const d = applyDecompositionToResidual(antes, result) as any

    // >>> A ASSERÇÃO QUE DISCRIMINA: o objeto NÃO é o `antes` <<<
    // Sem ela, "os cards têm comissão e lucro" passaria verde com a repartição antiga, que
    // também os tem. É a diferença entre afirmar que a decomposição foi ACEITA e afirmar que
    // algum número chegou.
    expect(d).not.toBe(antes)
    expect(d.marcador).toBe('etapa16')

    // IRPJ e CSLL são ZERO nos cards — eles saíram na 13C, não no resíduo.
    expect(d.irpj.amount).toBe(0)
    expect(d.csll.amount).toBe(0)
    // e o total do RRO é comissão + lucro, que é o RRO apurado
    expect(d.commission.amount + d.profit.amount).toBeCloseTo(result.rro!.apurado, 6)
    expect(d.total.amount).toBeCloseTo(result.rro!.apurado, 6)
  })

  it('o LUCRO REAL continua aceitando pelas quatro rubricas — nada mudou lá', () => {
    const { result } = montar('LUCRO_REAL')
    expect(result.presuncaoNa13C).toBeUndefined()
    const antes = { marcador: 'etapa16' } as never
    const d = applyDecompositionToResidual(antes, result) as any
    expect(d).not.toBe(antes)
    // e no Real os quatro são diferentes de zero — o contraste com o Presumido
    expect(d.irpj.amount).not.toBe(0)
    expect(d.csll.amount).not.toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// (f) AS TRÊS TELAS PASSAM A PRESUNÇÃO — sem isto a 13C nasceria decorativa
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// Afirmação de CAMINHO, e é só o que falta: o efeito está medido acima, com o módulo e a
// decomposição reais. O que estes casos pegam é a 13C existir e nenhuma tela ligá-la — que é
// `portao-que-nao-alcanca.md` em forma de cobertura, e já aconteceu neste repositório: a
// correção 7 criou a decomposição inteira, verde, e não tocou página nenhuma.
describe('(f) as três telas ligam a 13C', () => {
  const raiz = join(__dirname, '..', '..')
  for (const pagina of ['pages/orcamentos/index.tsx', 'pages/pedidos/index.tsx', 'pages/vendas/index.tsx']) {
    it(`${pagina} passa \`presuncao\` ao construtor da decomposição`, () => {
      const src = readFileSync(join(raiz, pagina), 'utf-8')
      expect(src).toContain('presuncao: mrmConfig.components?.irpjPresuncao != null')
      expect(src).toContain('adicionalPct: Number(mrmConfig.components.irpjAdicional)')
    })
  }
})
