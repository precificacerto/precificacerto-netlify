/**
 * OS CARDS SÃO A REPRESENTAÇÃO DO RRO — e não podem ser uma segunda conta.
 *
 * "Os cards de Comissão do Vendedor e Lucro da Empresa têm que mostrar exatamente o que está
 *  na distribuição do RRO da tabela logo abaixo. Não podem ser dois cálculos — o card LÊ a
 *  linha da decomposição."
 *
 * >>> MEDIDO ANTES DE MEXER, e o resultado mudou a correção <<<
 *
 * Os cards NÃO calculam sozinhos. `computeResidualDistribution` já lê a Etapa 16 do motor, e
 * há regra explícita no código contra recalcular — BUG-CARDS-RRO-001, "a Etapa 16 é a FONTE
 * DE VERDADE ABSOLUTA de Comissão e Lucro". A cascata da tela lê a MESMA Etapa 16.
 *
 * O que existia de conta própria era o FALLBACK display-first, para item sem nenhuma fonte do
 * motor — proporção sobre o cadastro. E ele tinha um buraco estreito: com TODOS os itens no
 * fallback, `usedMotorSource` fica falso (a regra da fonte mista não dispara) e
 * `itemsWithoutSource` fica ZERO, porque o item que entra no fallback dá `continue` antes da
 * contagem (a regra do legacy puro também não dispara). O documento inteiro saía por
 * proporção, SEM AVISO.
 *
 * A correção é essa: o fallback continua existindo — sem ele o item legado exibiria zero, e
 * zero afirma que não há comissão —, mas deixa de ser silencioso.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { computeResidualDistribution, type ResidualItemInput } from '@/utils/residual-distribution'

const raiz = join(__dirname, '..', '..')
const ler = (p: string) => readFileSync(join(raiz, p), 'utf-8')

/** Item COM a Etapa 16 do motor — a fonte de verdade. */
const COM_MOTOR: ResidualItemInput = {
  unit_price: 1000, quantity: 2, commission_percent: 5, profit_percent: 8,
  motor_new_commission: 77, motor_new_profit: 123, motor_new_irpj: 18, motor_new_csll: 11,
} as unknown as ResidualItemInput

/** Item SEM fonte do motor, mas com margem cadastrada — cai no fallback por proporção. */
const SEM_MOTOR: ResidualItemInput = {
  unit_price: 1000, quantity: 1, commission_percent: 5, profit_percent: 8,
} as unknown as ResidualItemInput

const rodar = (items: ResidualItemInput[], desconto = 0) =>
  computeResidualDistribution(items, 3000, 3000 * (1 - desconto / 100), 'LUCRO_REAL', { irpj: 0.15, csll: 0.09 }, desconto, 'PROPORTIONAL')

describe('1. COM a Etapa 16, o card É a Etapa 16 — sem reprocessar', () => {
  it('os valores saem do motor, não da alíquota × preço', () => {
    const d = rodar([COM_MOTOR])
    expect(d.commission.amount).toBeCloseTo(77, 6)
    expect(d.profit.amount).toBeCloseTo(123, 6)
    expect(d.irpj.amount).toBeCloseTo(18, 6)
    expect(d.csll.amount).toBeCloseTo(11, 6)
    // O discriminante: a proporção sobre o cadastro daria OUTRO número (5% de 2.000 = 100).
    // Sem esse contraste o caso não distinguiria "leu" de "recalculou".
    expect(d.commission.amount).not.toBeCloseTo(2000 * 0.05, 2)
  })

  it('e não pede revisão — a fonte é a certa', () => {
    expect(rodar([COM_MOTOR]).requiresReview).toBe(false)
  })
})

describe('2. O FALLBACK deixa de ser silencioso', () => {
  it('documento INTEIRO no fallback pede revisão — era o buraco', () => {
    const d = rodar([SEM_MOTOR])
    // Antes: `usedMotorSource` falso e `itemsWithoutSource` zero, então NENHUMA das duas
    // regras disparava e os cards exibiam proporção sem aviso.
    expect(d.requiresReview).toBe(true)
    // E o número continua sendo exibido: zero afirmaria que não há comissão.
    expect(d.commission.amount).toBeGreaterThan(0)
  })

  it('fonte MISTA continua pedindo revisão', () => {
    expect(rodar([COM_MOTOR, SEM_MOTOR]).requiresReview).toBe(true)
  })

  it('item sem fonte E sem margem — legacy puro — também pede', () => {
    const semNada = { unit_price: 1000, quantity: 1 } as unknown as ResidualItemInput
    expect(rodar([semNada]).requiresReview).toBe(true)
  })

  it('o contraste que fecha: SÓ com motor é o único caso sem aviso', () => {
    expect(rodar([COM_MOTOR, COM_MOTOR]).requiresReview).toBe(false)
  })
})

describe('3. A REGRA contra recalcular continua escrita onde se lê', () => {
  const src = ler('utils/residual-distribution.ts')

  it('o código declara a Etapa 16 como fonte de verdade', () => {
    expect(src).toContain('FONTE DE VERDADE ABSOLUTA de Comissão e Lucro')
    expect(src).toContain('é PROIBIDO recalcular')
  })

  it('e a condição de revisão cobre TODO uso do fallback', () => {
    expect(src).toContain('usedDisplayFirstFallback')
    const cond = src.slice(src.indexOf('const requiresReview ='), src.indexOf('const requiresReview =') + 220)
    // A condição antiga exigia `usedMotorSource &&` junto — é o que deixava o documento
    // inteiro no fallback passar calado.
    expect(cond).not.toContain('usedMotorSource && usedDisplayFirstFallback')
  })

  it('a tela mostra o aviso quando a revisão é pedida', () => {
    const bloco = ler('page-parts/shared/residual-distribution-block.component.tsx')
    expect(bloco).toContain('{requiresReview && (')
  })
})
