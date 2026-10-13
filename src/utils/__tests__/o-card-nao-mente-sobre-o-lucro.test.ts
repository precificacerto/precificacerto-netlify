/**
 * O CARD NÃO MENTE SOBRE O LUCRO — o sinal, o piso e o descoberto.
 *
 * Defeito encontrado EM PRODUÇÃO pelo dono do produto, 13/10/2026, num orçamento real:
 *
 *     aviso:  "operação em lucro zero" · Descoberto R$ 1.093,16
 *     card:   Comissão R$ 0,00 (0,000% original) · LUCRO R$ 1.956,86 (7,441%)
 *
 * O aviso da Parte VII dizia lucro zero e o card exibia lucro positivo, na mesma tela.
 *
 * ── SÃO DOIS DEFEITOS EMPILHADOS, E O PRIMEIRO É PIOR ─────────────────────────────────────
 *
 * **1 · O SINAL.** `residual-from-decomposition.ts:76` fazia `Math.abs(row.total)` e
 * `decomposition-dre.ts:720` fazia `Math.abs(...)` no `pctSobreTotalGeral`. O comentário do
 * primeiro afirmava: *"as linhas do RRO saem POSITIVAS do DRE (são repartição, não dedução);
 * o `Math.abs` é defesa de contrato, não conversão de sinal."*
 *
 * Ele ERA conversão de sinal, exatamente no caso que a Parte VII criou. Com o desconto acima
 * do limite o RRO fica NEGATIVO, as quatro parcelas saem negativas, e o `abs` as exibia
 * positivas. **O card afirmava lucro onde havia prejuízo.**
 *
 * A premissa do comentário era verdadeira quando foi escrita — não havia como o RRO ficar
 * negativo, porque o clamp do desconto impedia (`decisao-sob-regra-da-epoca.md`). A Parte VII
 * removeu o clamp e a premissa caiu com ele; o `abs` sobreviveu.
 *
 * **2 · O PISO.** O piso zero da Parte VII mora em `absorption.ts` (etapa 16 do motor). O card
 * lê a DECOMPOSIÇÃO desde o `1934dbb`, e ela não tinha piso nenhum. Medido: `descoberto` tinha
 * ZERO ocorrências em `decomposition-dre.ts`, em `residual-from-decomposition.ts` e no próprio
 * componente do card.
 *
 * ── ONDE O PISO PASSOU A MORAR, E POR QUÊ ─────────────────────────────────────────────────
 *
 * Decisão do dono do produto, 13/10/2026: **na DECOMPOSIÇÃO, não no overlay.** Ela é a fonte
 * única desde o `1934dbb` e é quem produz as linhas `comissao`/`lucro`; pôr o piso no overlay
 * faria o card e a decomposição discordarem de novo — as duas fontes que aquele commit apagou
 * (`copia-divergente.md`).
 *
 * Então a decomposição passa a receber o estado da autorização, como já recebe o regime.
 */

import { calculateMotorV17 } from '@/utils/mrm-engine-v17'
import type { EngineItemV17, MotorV17Input } from '@/types/mrm'
import { descontoMaximoFracao, estadoDoDesconto } from '@/utils/limite-de-desconto'
import { buildDecomposition, type DecompositionInput } from '@/utils/decomposition-dre'
import { formatResidualLine } from '@/utils/residual-distribution'
import { buildBudgetDecompositionInput } from '@/utils/budget-decomposition-input'
import { applyDecompositionToResidual } from '@/utils/residual-from-decomposition'
import type { ResidualDistribution } from '@/utils/residual-distribution'

/*
  O DOCUMENTO — UM SÓ, lido pelo motor E pela decomposição.
  ────────────────────────────────────────────────────────────────────────────────────────────
  A primeira redação deste arquivo tinha DOIS: o motor com um `rb` calibrado e a decomposição
  com outro `unitPrice`. Os dois descreviam documentos diferentes, e o caso de caracterização
  ficou vermelho acusando "lucro negativo com desconto abaixo do limite" — que era a minha
  fixture, não o código. `teste-que-nao-exercita.md`: duas fontes no próprio teste.

  Calibrado para reproduzir as SAÍDAS da tela do dono do produto: limite 21,3200% e descoberto
  R$ 1.093,16 em 25%. As ENTRADAS do documento dele não estão aqui — ver a nota da seção (b).
*/
const ICMS = 0.17
const PIS_COFINS = 0.0925
/** A efetiva do PIS/COFINS: a nominal exclui o ICMS da base (R5, exceção 1). */
const EFETIVO_PC = PIS_COFINS * (1 - ICMS)
const RB = 40_278.70
const CP = 0.480265 * RB
const DOP = 0.10

/** Uma baseline de etapa 16 qualquer — o overlay a substitui, e é isso que se mede. */
const BASELINE: ResidualDistribution = {
  commission: { amount: 999, originalPct: 999, effectivePct: 999 },
  profit: { amount: 999, originalPct: 999, effectivePct: 999 },
  irpj: { amount: 999, originalPct: 999, effectivePct: 999 },
  csll: { amount: 999, originalPct: 999, effectivePct: 999 },
  total: { amount: 999, originalPct: 999, effectivePct: 999 },
  hasDiscount: true,
  requiresReview: false,
  regime: 'LUCRO_REAL',
  hidesProfitTaxes: false,
}

/**
 * O cenário do dono do produto, montado para que o RRO fique NEGATIVO com 25% de desconto.
 *
 * Comissão 0% é o cadastro dele — e é o que torna o caso interessante: a tela de hoje exibe
 * R$ 0,00 na comissão por CADASTRO, e exibiria R$ 0,00 por PISO, sem nada que distinga as
 * duas afirmações.
 */
function cenario(discountPct: number, autorizado?: boolean) {
  const p = buildBudgetDecompositionInput({
    items: [{
      key: 'i1', label: 'Produto', quantity: 1, unitPrice: RB,
      costUnit: CP, productiveLaborUnit: 0,
      commissionPct: 0, profitPct: 10, rtPct: 0,
      // O PIS/COFINS do cadastro é a EFETIVA (9,25% × (1 − ICMS)), convertida de volta à
      // nominal por `budget-decomposition-input`. Ver a rodada da 13C, onde isto derrubou
      // uma fixture minha.
      rates: { icms_pct: ICMS * 100, pis_pct: EFETIVO_PC * 100 * (1.65 / 9.25), cofins_pct: EFETIVO_PC * 100 * (7.6 / 9.25) },
    } as never],
    discountPct,
    despesas: { fixa: DOP, compromisso: 0, variavel: 0, financeira: 0, indireta: 0, moProdutiva: 0 } as never,
    tenantCalcType: 'INDUSTRIALIZACAO',
    regime: 'LUCRO_REAL',
    ...(autorizado ? { autorizacaoDoDesconto: { acimaDoLimite: true } } : {}),
  } as never)
  const result = buildDecomposition(p.input as DecompositionInput)
  return { result, card: applyDecompositionToResidual(BASELINE, result) }
}

const linha = (r: ReturnType<typeof buildDecomposition>, k: string) => r.rows.find((x) => x.key === k)

// ═══════════════════════════════════════════════════════════════════════════════════════════
// (a) O SINAL — e este caso sozinho justifica a rodada
// ═══════════════════════════════════════════════════════════════════════════════════════════

describe('(a) o SINAL: valor negativo chega negativo', () => {
  it('>>> a decomposição produz RRO e LUCRO negativos com desconto alto <<<', () => {
    const { result } = cenario(0.40)
    // Sem isto, tudo abaixo passaria num mundo em que o RRO nunca fica negativo — que era o
    // mundo de antes da Parte VII, e é a premissa que o comentário do `Math.abs` assumia.
    expect(result.rro!.apurado).toBeLessThan(0)
    expect(linha(result, 'lucro')!.total).toBeLessThan(0)
  })

  it('>>> o CARD exibe o valor NEGATIVO como negativo — nunca o módulo <<<', () => {
    const { result, card } = cenario(0.40)
    const lucroNaDecomposicao = linha(result, 'lucro')!.total
    expect(lucroNaDecomposicao).toBeLessThan(0)
    // ESTE é o caso que o `Math.abs` deixava vermelho de verdade: ele exibia +16.733,87 onde
    // a decomposição apurou −16.733,87.
    expect(card.profit.amount).toBe(lucroNaDecomposicao)
    expect(card.profit.amount).toBeLessThan(0)
  })

  it('>>> e o PERCENTUAL também é negativo — o segundo `Math.abs`, em decomposition-dre:720 <<<', () => {
    const { result, card } = cenario(0.40)
    expect(linha(result, 'lucro')!.pctSobreTotalGeral).toBeLessThan(0)
    expect(card.profit.effectivePct).toBeLessThan(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// (b) O PISO — os números da tela do dono do produto
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// >>> DE ONDE VÊM ESTES NÚMEROS, e a ressalva importa <<<
//
// Ele reportou a TELA: desconto 25%, limite 21,32%, Proporcional, Descoberto R$ 1.093,16, e
// o card exibindo LUCRO R$ 1.956,86. Eu não tenho as ENTRADAS do documento dele — nem o
// orçamento, nem o cadastro. O que fiz foi CALIBRAR uma entrada que reproduz as SAÍDAS que
// ele publicou: `rb = 40.278,70`, `cp = 48,0265% da rb`, `dop 10%`, comissão 0%, lucro 10%,
// ICMS 17% + PIS/COFINS 9,25% dão limite 21,3200% e descoberto R$ 1.093,16 ao centavo.
//
// Então o caso prega o COMPORTAMENTO nos números dele, não o documento dele. O R$ 1.956,86
// do lucro não é reproduzível por este caminho, porque ele saía da decomposição daquele
// documento — e é exatamente o número que a correção faz desaparecer.
function motor(d: number, policy: MotorV17Input['policy'] = 'RRO_PROPORTIONAL') {
  const item = {
    item_id: 'p1', rb: RB, cp: CP, mod_pct: 0, dop_pct: DOP,
    commission_pct: 0, profit_pct: 0.10, csll_pct: 0, irpj_pct: 0, peso_op_interna: 1,
    taxes_inside_amounts: { icms: RB * ICMS, iss: 0, pis_cofins: RB * PIS_COFINS },
  } as unknown as EngineItemV17
  return calculateMotorV17({
    items: [item], discount: { pct: d }, policy, regime: 'LUCRO_REAL',
    rates: [{ tax_type: 'ICMS', rate_pct: ICMS }, { tax_type: 'PIS', rate_pct: PIS_COFINS }] as never,
    effective_date: '2026-10-13', use_snapshot_rates: false,
  } as never)
}

/** O limite da VII.3 deste cenário, sobre a âncora SEM desconto. */
const LIMITE = (() => {
  const m = motor(0)
  return descontoMaximoFracao({ limiteMinimo: m.motor.limite_minimo, opDentro: m.motor.ancora })!
})()

/** A tela inteira: motor → estado → decomposição com o piso → card. */
function tela(d: number, policy: MotorV17Input['policy'] = 'RRO_PROPORTIONAL') {
  const m = motor(d, policy)
  const estado = estadoDoDesconto({
    descontoFracao: d, descontoMaximoFracao: LIMITE, autorizado: true,
  })
  const autorizado = estado === 'VERMELHO_AUTORIZADO'
  const { result, card } = cenario(d, autorizado)
  return { m, estado, result, card }
}

describe('(b) o PISO, nos números da tela', () => {
  it('o cenário calibrado reproduz o limite 21,32% e o descoberto R$ 1.093,16', () => {
    expect(LIMITE * 100).toBeCloseTo(21.32, 4)
    expect(motor(0.25).distribution.descoberto_autorizado).toBeCloseTo(1093.16, 2)
  })

  it('>>> desconto 25% autorizado: Comissão R$ 0,00 · Lucro R$ 0,00 · Descoberto exibido <<<', () => {
    const { estado, card, result } = tela(0.25)
    expect(estado).toBe('VERMELHO_AUTORIZADO')

    // >>> A ASSERÇÃO QUE O DEFEITO VIOLAVA: lucro ZERO, não positivo <<<
    expect(card.profit.amount).toBe(0)
    expect(card.commission.amount).toBe(0)
    // e o par que a torna discriminante: ela falha se o lucro vier POSITIVO, que era a tela
    expect(card.profit.amount).not.toBeGreaterThan(0)

    // O descoberto, e SÓ ele, mostra o que a venda deixou de cobrir — e ele é o da
    // DECOMPOSIÇÃO, apurado sobre o RRO dela. Ver a seção (c): ele DIVERGE do número do
    // aviso, que vem do motor, e a escolha de qual é a fonte é do dono do produto.
    expect(card.descobertoAutorizado).toBeGreaterThan(0)
    expect(card.descobertoAutorizado).toBeCloseTo(-result.rro!.apurado, 6)
  })

  it('>>> e o card DISTINGUE zero por piso de zero por cadastro <<<', () => {
    const { card } = tela(0.25)
    // A comissão é 0% CADASTRADA neste cenário — e mesmo assim a linha diz que foi a
    // autorização que zerou, porque no estado autorizado as duas coisas coincidem e a tela
    // tem de nomear a que vale.
    expect(card.commission.zeradaPorAutorizacao).toBe(true)
    expect(card.profit.zeradaPorAutorizacao).toBe(true)
    expect(formatResidualLine(card.profit, true)).toBe('10,000% original → ZERADO pela autorização do desconto')
    // o percentual CADASTRADO continua à vista — apagá-lo esconderia o que foi consumido
    expect(card.profit.originalPct).toBeCloseTo(10, 6)
  })

  it('>>> o residual da decomposição FECHA em zero com o descoberto dentro <<<', () => {
    const { result } = tela(0.25)
    // Sem o descoberto na conta, `residual = rro − 0 = rro`, e o RRO é negativo: o residual
    // sairia fora de zero e a R20 seria violada.
    expect(result.residual.total).toBeCloseTo(0, 6)
    // e o RRO APURADO segue negativo — o piso zera a REPARTIÇÃO, não apaga o prejuízo
    expect(result.rro!.apurado).toBeLessThan(0)
  })

  it('CARACTERIZAÇÃO — desconto ABAIXO do limite não muda nada', () => {
    const { estado, card } = tela(0.10)
    expect(estado).toBe('VERDE')
    // nenhum piso, nenhum descoberto, nenhuma marca
    expect(card.descobertoAutorizado).toBeUndefined()
    expect(card.profit.zeradaPorAutorizacao).toBeUndefined()
    expect(card.profit.amount).toBeGreaterThan(0)
  })

  it('>>> OS TRÊS MODOS: comissão e lucro ZERO nos três, e o descoberto do card é o MESMO <<<', () => {
    const doCard: string[] = []
    const doMotor: string[] = []
    for (const pol of ['RRO_PROPORTIONAL', 'COMMISSION_PROTECTED', 'PROFIT_PROTECTED'] as const) {
      const { card, m } = tela(0.25, pol)
      // A regra de 13/10/2026 não depende do modo: zero nos três.
      expect(`${pol} com=${card.commission.amount} luc=${card.profit.amount}`).toBe(`${pol} com=0 luc=0`)
      doCard.push(card.descobertoAutorizado!.toFixed(2))
      doMotor.push(m.distribution.descoberto_autorizado.toFixed(2))
    }
    // O descoberto do CARD é mode-independente — com as parcelas em zero não há congelado a
    // somar, e é isso que a regra nova quer dizer.
    expect(new Set(doCard).size).toBe(1)
    // >>> E O DO MOTOR AINDA VARIA POR MODO — a divergência está na seção (c) <<<
    expect(new Set(doMotor).size).toBeGreaterThan(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// (c) A DIVERGÊNCIA QUE A CORREÇÃO EXPÔS — e que NÃO foi decidida aqui
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// >>> O AVISO E O CARD VÃO EXIBIR DESCOBERTOS DIFERENTES <<<
//
// O aviso da Parte VII lê o MOTOR (`distribution.descoberto_autorizado`); o card lê a
// DECOMPOSIÇÃO. Os dois RRO são números diferentes, e isso é ANTIGO e DOCUMENTADO — o
// cabeçalho de `residual-from-decomposition.ts` diz que a decomposição *"corrige três coisas
// que a Etapa 16 não corrige: a ordem das deduções da R19, o CMV do item e a escala do
// PIS/COFINS"*. Foi por isso que o `1934dbb` fez o card trocar de fonte.
//
// Até 13/10/2026 a divergência não aparecia na tela, porque o card não exibia descoberto
// nenhum. Exibi-lo a torna VISÍVEL. Ela não foi criada por esta rodada, e também não foi
// resolvida: escolher qual das duas é a fonte do aviso é decisão do dono do produto, e
// `copia-divergente.md` diz que a escolha errada aqui recria as duas fontes.
//
// Estes casos MEDEM a divergência, para que ela deixe de ser surpresa e fique com número.
describe('(c) o descoberto do motor e o da decomposição divergem — MEDIDO, não decidido', () => {
  it('>>> os dois números, lado a lado, no cenário da tela <<<', () => {
    const { m, result, card } = tela(0.25)
    const doMotor = m.distribution.descoberto_autorizado
    const doCard = card.descobertoAutorizado!

    // Os dois existem, os dois são positivos, e NÃO são iguais.
    expect(doMotor).toBeCloseTo(1093.16, 2)
    expect(doCard).toBeCloseTo(-result.rro!.apurado, 6)
    expect(Math.abs(doMotor - doCard)).toBeGreaterThan(1)

    // O número exato da divergência, pregado para que uma mudança nela seja vista.
    console.log(
      `descoberto — motor: ${doMotor.toFixed(2)}  ·  decomposição: ${doCard.toFixed(2)}`
      + `  ·  divergência: ${(doMotor - doCard).toFixed(2)}`,
    )
  })

  it('a divergência é dos DOIS RRO, e existe COM E SEM autorização', () => {
    // O par que mostra que ela não é efeito do piso: sem autorização, com desconto abaixo do
    // limite, os dois RRO já diferem. Sem este caso, alguém leria a divergência como defeito
    // introduzido pela correção.
    const abaixo = tela(0.10)
    expect(abaixo.estado).toBe('VERDE')
    expect(Math.abs(abaixo.m.motor.rro - abaixo.result.rro!.apurado)).toBeGreaterThan(1)
  })
})
