/**
 * OS PESOS ESTRUTURAIS SAEM DA TELA — E CONTINUAM NO MOTOR.
 *
 * "Pesos estruturais R$ 1,00 · └─ Peso Op Interna peso 0,931 R$ 0,93 · └─ Peso Op Externa
 *  peso 0,069 R$ 0,07. Isso é diagnóstico interno do motor exposto na tela do usuário.
 *  R$ 1,00 não é dinheiro — é a unidade normalizada. Um valor em reais que não é dinheiro é
 *  pior que não mostrar nada. Some da exibição. NÃO toque no motor: os pesos continuam sendo
 *  calculados e usados, só param de ser renderizados."
 *
 * >>> POR QUE ISTO É `ausente-vs-falso.md`, E NÃO UMA QUESTÃO DE GOSTO <<<
 * A coluna de valores da cascata é de REAIS. Um `1` renderizado ali vira `R$ 1,00`, e R$ 1,00
 * é uma afirmação sobre dinheiro. O número é correto como FRAÇÃO e falso como MOEDA — é a
 * mesma família do PIS/COFINS fora de escala: o valor existe, está na unidade errada, e nada
 * acusa.
 *
 * >>> O QUE ESTE ARQUIVO PROTEGE DOS DOIS LADOS <<<
 * Remover da tela e remover do motor são coisas diferentes, e a segunda quebraria a âncora
 * interna, o rateio do RRO e a Camada 2. Por isso metade dos casos afirma a AUSÊNCIA na
 * exibição e a outra metade afirma a PRESENÇA no `cascade-trace.ts`.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import {
  ETAPA_DOS_PESOS_ESTRUTURAIS,
  buildCascadeView,
} from '@/utils/cascade-display-view'
import type { CascadeStep } from '@/types/mrm'

const raiz = join(__dirname, '..', '..')
const ler = (p: string) => readFileSync(join(raiz, p), 'utf-8')

/** O trace como o motor o emite, com a etapa 10 e os dois filhos. */
const TRACE: CascadeStep[] = [
  { step: 9, label: 'Venda consolidada', base: null, rate: null, amount: 30000, formula: '', source: 'CONSOLIDADO' },
  {
    step: 10, label: 'Pesos estruturais', base: null, rate: null, amount: 1,
    formula: 'peso_interno + peso_externo = 1', source: 'CONSOLIDADO',
    children: [
      { step: 10, label: 'Peso Op Interna', base: null, rate: 0.931, amount: 0.931, formula: '', source: 'PONDERADO', peso: 0.931 },
      { step: 10, label: 'Peso Op Externa', base: null, rate: 0.069, amount: 0.069, formula: '', source: 'PONDERADO', peso: 0.069 },
    ],
  },
  { step: 11, label: 'Aplicação do desconto', base: 30000, rate: 0.05, amount: -1500, formula: '', source: 'INPUT' },
] as unknown as CascadeStep[]

describe('1. A ETAPA E OS DOIS FILHOS SOMEM DA EXIBIÇÃO', () => {
  const view = buildCascadeView(TRACE)

  it('a linha-título não é renderizada', () => {
    expect(view.map((r) => r.label)).not.toContain('Pesos estruturais')
    expect(view.some((r) => r.numero === ETAPA_DOS_PESOS_ESTRUTURAIS)).toBe(false)
  })

  it('e os DOIS filhos vão junto — um "Peso Op Interna" órfão seria pior', () => {
    expect(view.map((r) => r.label)).not.toContain('Peso Op Interna')
    expect(view.map((r) => r.label)).not.toContain('Peso Op Externa')
  })

  it('nenhum valor renderizado é uma FRAÇÃO disfarçada de real', () => {
    // O discriminante numérico, e é ele que distingue "sumiu a etapa certa" de "sumiu
    // alguma coisa": 1 · 0,931 · 0,069 eram os três únicos valores abaixo de R$ 10 na
    // cascata, e a coluna que os exibia é de moeda.
    expect(view.map((r) => r.valor)).not.toContain(1)
    expect(view.map((r) => r.valor)).not.toContain(0.931)
    expect(view.map((r) => r.valor)).not.toContain(0.069)
  })

  it('as etapas VIZINHAS continuam, com os valores intactos', () => {
    // Sem este caso, remover o trace inteiro passaria verde.
    expect(view.map((r) => r.numero)).toEqual([9, 11])
    expect(view.find((r) => r.numero === 9)!.valor).toBeCloseTo(30000, 6)
    expect(view.find((r) => r.numero === 11)!.valor).toBeCloseTo(-1500, 6)
  })

  it('a numeração NÃO é refeita — a 9 é seguida da 11', () => {
    // Número é identidade, não posição: renumerar quebraria as citações já escritas, e é a
    // mesma razão que manteve a numeração de exibição da decomposição começando em 12.
    const numeros = view.map((r) => r.numero)
    expect(numeros).not.toContain(10)
    expect(numeros[numeros.indexOf(9) + 1]).toBe(11)
  })
})

describe('2. O MOTOR SEGUE CALCULANDO — a remoção é de LEITURA', () => {
  const motor = ler('utils/mrm-engine-v17/cascade-trace.ts')

  it('`cascade-trace.ts` continua emitindo a etapa e os dois pesos', () => {
    expect(motor).toContain("label: 'Pesos estruturais'")
    expect(motor).toContain("label: 'Peso Op Interna'")
    expect(motor).toContain("label: 'Peso Op Externa'")
  })

  it('e `peso_op_interna_ponderado` segue sendo consumido pelo cálculo', () => {
    // A âncora interna, o rateio do RRO e a Camada 2 dependem dele. Apagar o peso do motor
    // para "limpar a tela" quebraria os três, e o teste da tela não veria.
    expect(ler('utils/mrm-engine-v17/consolidate.ts')).toContain('const ancora_interna = rv_total * peso_op_interna_ponderado')
    expect(ler('utils/mrm-engine-v17/absorption.ts')).toContain('const peso_int = view.peso_op_interna_ponderado')
  })
})
