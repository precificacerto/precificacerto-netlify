/**
 * PORTÃO DE CONCORDÂNCIA — a matriz nova reproduz os derivados, par a par.
 *
 * Fase 2A item 5, comando do PO de 11/10/2026.
 *
 * ══ O QUE ESTE PORTÃO EXISTE PARA IMPEDIR ════════════════════════════════════════════════
 *
 * A rodada inverteu a dependência: `TAX_MATRIX`, `placementOf` e `POR_FORA_POR_REGIME`
 * deixaram de guardar dado e passaram a LER `matriz-fiscal.ts`. O risco dessa inversão não é
 * quebrar — é **não inverter de verdade**: se sobrasse dado duplicado em algum lugar, os casos
 * continuariam verdes e ninguém saberia que há duas fontes.
 *
 * `copia-divergente.md`: *"o mesmo mapeamento escrito duas vezes, uma delas esquecendo um
 * campo — e nada falha."* Este arquivo é o que faz falhar.
 *
 * >>> E A PROVA É A MUTAÇÃO, NÃO ESTE ARQUIVO <<<
 *
 * Um caso que compare a matriz com os derivados fica verde tanto numa derivação real quanto
 * numa duplicação em que as duas cópias concordam hoje. O que distingue é o item 6: mudar UMA
 * célula da matriz e exigir que os casos ANTIGOS — `por-fora-por-regime.test.tsx` e
 * `matriz-e-contexto-da-venda.test.ts` — fiquem vermelhos. Verdes significariam dado
 * duplicado. O resultado da mutação está no relatório da rodada.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { TAX_MATRIX, placementOf, type CalcType, type TaxName, type Placement } from '@/utils/pricing-engine'
import {
  MATRIZ_FISCAL, celulaDe, colocacaoVigente, tributosPorForaNaMatriz,
  type Colocacao, type TributoFiscal,
} from '@/utils/matriz-fiscal'
import { POR_FORA_POR_REGIME, tributosPorForaDoRegime } from '@/utils/por-fora-por-regime'
import { tributoExisteNoSegmento } from '@/utils/campos-do-segmento'
import type { TaxRegime } from '@/supabase/types'

/** Os seis regimes do `TaxRegime` de `supabase/types.ts` — o único que tem o RET. */
const REGIMES: readonly TaxRegime[] = [
  'MEI', 'SIMPLES_NACIONAL', 'SIMPLES_HIBRIDO',
  'LUCRO_PRESUMIDO', 'LUCRO_REAL', 'LUCRO_PRESUMIDO_RET',
]
const SEGMENTOS: readonly CalcType[] = ['INDUSTRIALIZACAO', 'REVENDA', 'SERVICO']
const NOMES_DO_MOTOR: readonly TaxName[] = ['ICMS', 'ISS', 'PIS_COFINS', 'IPI', 'IS', 'IBS', 'CBS']

/** Os 18 pares regime × segmento, montados e não digitados. */
const PARES: readonly [TaxRegime, CalcType][] =
  REGIMES.flatMap((r) => SEGMENTOS.map((s) => [r, s] as [TaxRegime, CalcType]))

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 0 · A MATRIZ ESTÁ COMPLETA, E NÃO TEM NÚMERO
// ═══════════════════════════════════════════════════════════════════════════════════════════

describe('0 · a forma da matriz', () => {
  it('são 18 pares regime × segmento, e todos existem', () => {
    expect(PARES).toHaveLength(18)
    for (const [regime, segmento] of PARES) {
      expect(MATRIZ_FISCAL[regime]).toBeDefined()
      expect(MATRIZ_FISCAL[regime][segmento]).toBeDefined()
    }
  })

  it('>>> NENHUM PERCENTUAL NO ARQUIVO DA MATRIZ — é a regra I.3 <<<', () => {
    // *"Só há colocação aqui. Nenhum percentual. Se um número aparecer nesta parte, é defeito
    // de redação."* As datas de vigência são strings ISO e não casam com decimal.
    const fonte = readFileSync(join(__dirname, '..', 'matriz-fiscal.ts'), 'utf-8')
    const programa = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    expect(programa).not.toMatch(/\d+[.,]\d+/)
  })

  it('toda célula não decidida nomeia a pendência E declara o vigente', () => {
    // Sem `vigenteHoje` a derivação cairia em `INEXISTENTE` por fallback, e uma pendência
    // viraria decisão por omissão — exatamente o que a forma da célula existe para impedir.
    let naoDecididas = 0
    for (const [regime, segmento] of PARES) {
      for (const [, celula] of Object.entries(MATRIZ_FISCAL[regime][segmento])) {
        if (celula.colocacao === 'NAO_DECIDIDA') {
          naoDecididas++
          expect(celula.pendencia).toBeTruthy()
          expect(celula.vigenteHoje).toBeTruthy()
        }
        if (celula.credito === 'NAO_DECIDIDO') expect(celula.pendencia).toBeTruthy()
      }
    }
    // As cinco pendências da XIV.9 mais a do IS em revenda, espalhadas pelos pares.
    expect(naoDecididas).toBeGreaterThan(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// a) `placementOf` DEVOLVE O MESMO QUE A CÉLULA DIZ, NO EIXO SEGMENTO
// ═══════════════════════════════════════════════════════════════════════════════════════════

describe('a) `placementOf` concorda com a matriz, célula a célula', () => {
  it('>>> as 21 células do eixo segmento: `placementOf` === `colocacaoVigente(LUCRO_REAL, …)` <<<', () => {
    // `placementOf` não recebe regime e sempre foi a matriz do Lucro Real — o cabeçalho
    // original dizia isso. Esta é a asserção que torna a projeção verificável em vez de
    // declarada: se a derivação lesse outro regime, ou outro campo, ela cai.
    let conferidas = 0
    for (const segmento of SEGMENTOS) {
      for (const tributo of NOMES_DO_MOTOR) {
        expect(placementOf(segmento, tributo))
          .toBe(colocacaoVigente('LUCRO_REAL', segmento, tributo))
        conferidas++
      }
    }
    expect(conferidas).toBe(21)
  })

  it('e `TAX_MATRIX` é exatamente essa projeção — a constante não guarda dado próprio', () => {
    for (const segmento of SEGMENTOS) {
      for (const tributo of NOMES_DO_MOTOR) {
        expect(TAX_MATRIX[segmento][tributo])
          .toBe(colocacaoVigente('LUCRO_REAL', segmento, tributo))
      }
    }
  })

  it('>>> a REGRESSÃO do dado literal: as 21 células valem o que valiam antes da inversão <<<', () => {
    // Os valores abaixo são o literal que `TAX_MATRIX` guardava até 11/10/2026, copiados do
    // commit anterior. Se a matriz nova mudar qualquer um deles, este caso acusa — e é ele que
    // garante que a inversão NÃO foi uma troca de dado.
    const ANTES: Readonly<Record<CalcType, Readonly<Record<TaxName, Placement>>>> = {
      INDUSTRIALIZACAO: {
        ICMS: 'POR_DENTRO', ISS: 'INEXISTENTE', PIS_COFINS: 'POR_DENTRO',
        IPI: 'POR_FORA', IS: 'POR_FORA', IBS: 'POR_FORA', CBS: 'POR_FORA',
      },
      REVENDA: {
        ICMS: 'POR_DENTRO', ISS: 'INEXISTENTE', PIS_COFINS: 'POR_DENTRO',
        IPI: 'INEXISTENTE', IS: 'POR_FORA', IBS: 'POR_FORA', CBS: 'POR_FORA',
      },
      SERVICO: {
        ICMS: 'INEXISTENTE', ISS: 'POR_DENTRO', PIS_COFINS: 'POR_DENTRO',
        IPI: 'INEXISTENTE', IS: 'INEXISTENTE', IBS: 'POR_FORA', CBS: 'POR_FORA',
      },
    }
    expect(TAX_MATRIX).toEqual(ANTES)
  })

  it('a célula do IS em REVENDA é NÃO DECIDIDA na matriz, e `POR_FORA` no comportamento', () => {
    // >>> O PAR QUE PROVA QUE A PENDÊNCIA 11 NÃO FOI DECIDIDA <<<
    // Se alguém tivesse escrito `POR_FORA` na célula para "fazer passar", a primeira asserção
    // cairia. Se tivesse escrito `INEXISTENTE`, a segunda cairia — e com ela três casos
    // antigos. As duas juntas afirmam que a disputa está registrada e o comportamento intacto.
    for (const regime of ['LUCRO_REAL', 'LUCRO_PRESUMIDO', 'SIMPLES_HIBRIDO'] as const) {
      const c = celulaDe(regime, 'REVENDA', 'IS')
      expect(c?.colocacao).toBe('NAO_DECIDIDA')
      expect(c?.pendencia).toBe('PENDENCIA_11')
      expect(c?.vigenteHoje).toBe('POR_FORA')
      expect(colocacaoVigente(regime, 'REVENDA', 'IS')).toBe('POR_FORA')
    }
    expect(placementOf('REVENDA', 'IS')).toBe('POR_FORA')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// b) `tributosPorForaDoRegime` DEVOLVE EXATAMENTE AS CÉLULAS `POR_FORA`
// ═══════════════════════════════════════════════════════════════════════════════════════════

describe('b) o eixo de regime concorda com a matriz, regime a regime', () => {
  it('>>> para os SEIS regimes: a lista é exatamente o conjunto `POR_FORA` da matriz <<<', () => {
    for (const regime of REGIMES) {
      const daMatriz = NOMES_DO_MOTOR.filter((t) =>
        SEGMENTOS.some((s) => colocacaoVigente(regime, s, t) === 'POR_FORA'))
      expect([...tributosPorForaDoRegime(regime)].sort()).toEqual([...daMatriz].sort())
      expect([...POR_FORA_POR_REGIME[regime]].sort()).toEqual([...daMatriz].sort())
    }
  })

  it('>>> a REGRESSÃO da tabela literal: as seis listas valem o que valiam <<<', () => {
    // O literal que `POR_FORA_POR_REGIME` guardava até 11/10/2026. Ordenado porque a ordem
    // passou a ser a da matriz, e nenhum caso depende dela.
    const ANTES: Record<TaxRegime, readonly TaxName[]> = {
      LUCRO_REAL: ['IPI', 'IS', 'IBS', 'CBS'],
      LUCRO_PRESUMIDO: ['IPI', 'IS', 'IBS', 'CBS'],
      LUCRO_PRESUMIDO_RET: ['IBS', 'CBS'],
      SIMPLES_HIBRIDO: ['IBS', 'CBS', 'IS'],
      SIMPLES_NACIONAL: [],
      MEI: [],
    }
    for (const regime of REGIMES) {
      expect([...POR_FORA_POR_REGIME[regime]].sort()).toEqual([...ANTES[regime]].sort())
    }
  })

  it('e `tributosPorForaNaMatriz` é a mesma coisa — não há terceira fonte', () => {
    for (const regime of REGIMES) {
      expect([...tributosPorForaDoRegime(regime)]).toEqual([...tributosPorForaNaMatriz(regime)])
    }
  })

  it('regime desconhecido continua devolvendo `[]` — fechado por padrão', () => {
    // A inversão não podia abrir o default. Um campo de alíquota que não deveria existir é
    // pior que um faltando, porque o usuário digita e o número entra na conta.
    for (const r of ['', null, undefined, 'LUCRO_IRREAL', 'PRESUMIDO_RET', 42]) {
      expect(tributosPorForaDoRegime(r as unknown)).toEqual([])
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// c) NENHUMA CÉLULA `ACRESCIMO` ENTRA NO COEFICIENTE
// ═══════════════════════════════════════════════════════════════════════════════════════════

describe('c) o acréscimo não forma preço', () => {
  it('ICMS-ST e DIFAL são `ACRESCIMO` nos 18 pares onde têm linha, e nunca POR_DENTRO nem POR_FORA', () => {
    // *"Acréscimo, em todos: ICMS-ST e DIFAL. Custo puro sobre a nota — não formam preço."*
    for (const [regime, segmento] of PARES) {
      for (const tributo of ['ICMS_ST', 'DIFAL'] as const) {
        const place = colocacaoVigente(regime, segmento, tributo)
        expect(['ACRESCIMO', 'INEXISTENTE']).toContain(place)
        expect(place).not.toBe('POR_DENTRO')
        expect(place).not.toBe('POR_FORA')
      }
    }
  })

  it('>>> NENHUM `ACRESCIMO` aparece entre os tributos do MOTOR — é o que o mantém fora do `c` <<<', () => {
    // O coeficiente é montado a partir dos tributos POR_FORA de `TaxName` (o `porFora` de
    // `sale-context.ts:297`). Afirmar que nenhum dos sete é `ACRESCIMO` em par nenhum é
    // afirmar que o acréscimo não tem como entrar no `c` — e é mais forte que afirmar o
    // valor do `c`, porque vale para os 18 pares de uma vez.
    for (const [regime, segmento] of PARES) {
      for (const tributo of NOMES_DO_MOTOR) {
        expect(colocacaoVigente(regime, segmento, tributo)).not.toBe('ACRESCIMO')
      }
    }
  })

  it('e o acréscimo NÃO tem linha na tabela do preço — a DECISÃO 1 do PO', () => {
    // `tributoExisteNoSegmento` lê `POR_DENTRO || POR_FORA`. ICMS-ST não é `TaxName`, então
    // não passa por ela; o que este caso afirma é a condição POSITIVA — um estado novo nasce
    // sem linha. Afirmado pelos sete nomes do motor nos três segmentos.
    for (const segmento of SEGMENTOS) {
      for (const tributo of NOMES_DO_MOTOR) {
        const place = placementOf(segmento, tributo)
        expect(tributoExisteNoSegmento(segmento, tributo))
          .toBe(place === 'POR_DENTRO' || place === 'POR_FORA')
      }
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// d) `SOMEM_NA_GUIA_UNICA` — A MATRIZ O REPRODUZ. O `Set` NÃO MUDA.
// ═══════════════════════════════════════════════════════════════════════════════════════════

describe('d) a guia única: a matriz reproduz o `Set` de `decomposition-dre.ts:850`', () => {
  /**
   * O `Set` é dado literal em `decomposition-dre.ts` e **não é tocado nesta rodada** — o
   * comando é explícito. Este caso só prova que a matriz o REPRODUZ, para que o passo seguinte
   * possa derivá-lo com rede.
   *
   * As chaves são as da DECOMPOSIÇÃO (`icms`, `pis_cofins`, …), não as da matriz. O mapa
   * abaixo é a tradução, e ele é declarado aqui porque é só do teste: pôr um mapa de chaves de
   * linha dentro da matriz fiscal seria dar a ela uma responsabilidade de apresentação.
   */
  const CHAVE_DA_LINHA: Readonly<Record<string, TributoFiscal>> = {
    icms: 'ICMS', iss: 'ISS', pis_cofins: 'PIS_COFINS', irpj: 'IRPJ', csll: 'CSLL',
  }
  /** O literal de `decomposition-dre.ts:850`, copiado. */
  const SOMEM_NA_GUIA_UNICA = ['icms', 'iss', 'pis_cofins', 'irpj', 'csll']
  const GUIA_UNICA: readonly TaxRegime[] = ['SIMPLES_NACIONAL', 'MEI', 'SIMPLES_HIBRIDO']

  it('>>> nos TRÊS regimes de guia única, a matriz diz INEXISTENTE para os cinco <<<', () => {
    // É a prova de que o `Set` não é uma lista arbitrária: ele é o conjunto das células que a
    // matriz já marca como sem linha nesses regimes. Derivá-lo, no passo seguinte, não muda
    // comportamento — e se mudar, este caso é quem avisa.
    for (const regime of GUIA_UNICA) {
      for (const chave of SOMEM_NA_GUIA_UNICA) {
        const tributo = CHAVE_DA_LINHA[chave]
        for (const segmento of SEGMENTOS) {
          expect(colocacaoVigente(regime, segmento, tributo)).toBe('INEXISTENTE')
        }
      }
    }
  })

  it('e o conjunto que a matriz produz é EXATAMENTE o `Set`, sem sobra nem falta', () => {
    // >>> A ASSERÇÃO DE IGUALDADE, não de inclusão <<<
    // A anterior passaria se a matriz dissesse INEXISTENTE para MAIS tributos que os cinco —
    // e aí derivar o `Set` dela faria linhas extras desaparecerem da decomposição. Este caso
    // fecha os dois lados: entre os cinco candidatos de `CHAVE_DA_LINHA`, o conjunto
    // INEXISTENTE em todos os três regimes é igual ao `Set`.
    const candidatos = Object.keys(CHAVE_DA_LINHA)
    const daMatriz = candidatos.filter((chave) =>
      GUIA_UNICA.every((regime) =>
        SEGMENTOS.every((s) => colocacaoVigente(regime, s, CHAVE_DA_LINHA[chave]) === 'INEXISTENTE')))
    expect(daMatriz.sort()).toEqual([...SOMEM_NA_GUIA_UNICA].sort())
  })

  it('e nos regimes DISCRIMINADOS os cinco NÃO são todos inexistentes — o par que discrimina', () => {
    // Sem este caso, uma matriz que dissesse INEXISTENTE para os cinco em TODOS os regimes
    // passaria os dois casos acima. No Lucro Real o ICMS é POR_DENTRO em dois segmentos e o
    // IRPJ é POR_DENTRO nos três — logo o `Set` é mesmo específico da guia única.
    expect(colocacaoVigente('LUCRO_REAL', 'INDUSTRIALIZACAO', 'ICMS')).toBe('POR_DENTRO')
    expect(colocacaoVigente('LUCRO_REAL', 'SERVICO', 'ISS')).toBe('POR_DENTRO')
    expect(colocacaoVigente('LUCRO_REAL', 'INDUSTRIALIZACAO', 'IRPJ')).toBe('POR_DENTRO')
    expect(colocacaoVigente('LUCRO_PRESUMIDO', 'INDUSTRIALIZACAO', 'CSLL')).toBe('POR_DENTRO')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// e) O QUE DISTINGUE REAL DE PRESUMIDO É A ETAPA, NÃO A COLOCAÇÃO
// ═══════════════════════════════════════════════════════════════════════════════════════════

describe('e) IRPJ e CSLL: mesma colocação, etapas diferentes', () => {
  it('>>> a colocação é POR_DENTRO nos dois; a BASE e a ETAPA é que mudam <<<', () => {
    // *"Não existe um quinto estado de colocação para isso."* É o que permite a matriz
    // distinguir os dois regimes sem inventar valor no eixo errado — e é a divergência que os
    // casos C5 e C7 de `portoes-presumido-e-ret.test.ts` documentam no código de hoje.
    for (const segmento of SEGMENTOS) {
      for (const tributo of ['IRPJ', 'CSLL', 'ADICIONAL_IRPJ'] as const) {
        const real = celulaDe('LUCRO_REAL', segmento, tributo)
        const presumido = celulaDe('LUCRO_PRESUMIDO', segmento, tributo)

        expect(real?.colocacao).toBe('POR_DENTRO')
        expect(presumido?.colocacao).toBe('POR_DENTRO')
        expect(real?.colocacao).toBe(presumido?.colocacao)

        expect(real?.base).toBe('LUCRO')
        expect(real?.etapa).toBe('16')
        expect(presumido?.base).toBe('PRESUNCAO')
        expect(presumido?.etapa).toBe('13C')
      }
    }
  })

  it('e no RET eles não existem — estão dentro dos 4%, inclusive de 2029', () => {
    for (const segmento of SEGMENTOS) {
      expect(colocacaoVigente('LUCRO_PRESUMIDO_RET', segmento, 'IRPJ')).toBe('INEXISTENTE')
      expect(colocacaoVigente('LUCRO_PRESUMIDO_RET', segmento, 'CSLL')).toBe('INEXISTENTE')
      expect(celulaDe('LUCRO_PRESUMIDO_RET', segmento, 'RET')?.base).toBe('RECEITA_RECEBIDA')
      expect(celulaDe('LUCRO_PRESUMIDO_RET', segmento, 'RET')?.etapa).toBe('13A')
    }
  })

  it('o eixo de vigência existe e tem as datas da XIV.7, sem nenhum percentual', () => {
    // A data muda COLOCAÇÃO, nunca alíquota. Afirmado nos dois extremos: o PIS/COFINS termina
    // em 2026 (substituído pela CBS) e a CBS começa em 2026.
    const pc = celulaDe('LUCRO_REAL', 'INDUSTRIALIZACAO', 'PIS_COFINS')
    expect(pc?.vigenciaFim).toBe('2026-12-31')
    const cbs = celulaDe('LUCRO_REAL', 'INDUSTRIALIZACAO', 'CBS')
    expect(cbs?.vigenciaInicio).toBe('2026-01-01')
    expect(cbs?.vigenciaFim).toBeNull()
    const is = celulaDe('LUCRO_REAL', 'INDUSTRIALIZACAO', 'IS')
    expect(is?.vigenciaInicio).toBe('2027-01-01')
  })
})
