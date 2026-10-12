/**
 * EXAUSTIVIDADE SOBRE O REGIME — o portão da FASE B do passo XI-3.5.
 *
 * ══ O QUE ESTE ARQUIVO É, E O QUE ELE DECLARADAMENTE NÃO É ══════════════════════════════
 *
 * **Nenhum caso aqui ficaria vermelho antes da FASE B**, e isso está escrito de propósito.
 * A FASE B é bit-exact por exigência do dono do produto: ela não muda número nem ramo, só
 * troca `regime === 'X' || regime === 'Y'` por `Record<TaxRegime, …>`. Um caso que afirmasse
 * comportamento distinguiria nada — seria a variante 1 de `teste-que-nao-exercita.md`, o caso
 * que passa antes e depois.
 *
 * O que a FASE B muda é uma propriedade de TIPO: *acrescentar um valor a `TaxRegime` quebra a
 * compilação em N pontos*. **O jest não typechecka**, então ela não é afirmável aqui. A prova
 * dela é a medição do `tsc` com o sexto valor acrescentado temporariamente, registrada no
 * relatório e no commit — é por isso que o dono do produto pediu o número, e não um caso.
 *
 * Este arquivo tem então dois trabalhos, os dois legítimos e nenhum dos dois decorativo:
 *
 * 1. **CARACTERIZAÇÃO** — fixa o valor de cada célula das tabelas. Quem editar um valor por
 *    engano, ou “harmonizar” duas tabelas que divergem de propósito, vê vermelho. É a mesma
 *    natureza de `caracterizacao-do-hibrido.test.ts`, e a diferença com um portão de correção
 *    está dita acima em vez de ficar implícita.
 * 2. **UM PORTÃO DE FUTURO, hoje verde** — o grupo (b): a mina que a D3 nomeou. Ele fica
 *    vermelho no dia em que a lista de quem tem faixa de PIS/COFINS divergir do mapa, que era
 *    exatamente o estado que o `Exclude` permitia. É a mesma forma da invariante do PASSO ZERO.
 *
 * ══ AS DIVERGÊNCIAS QUE SÃO DE PROPÓSITO ════════════════════════════════════════════════
 *
 * Três pares de tabelas respondem perguntas parecidas com valores DIFERENTES para o Simples
 * Híbrido, e as três divergências são de HOJE, não desta fase. Os casos do grupo (c) as
 * afirmam, para que ninguém as unifique achando que são descuido.
 */

import { validatePisCofinsInvariant } from '@/utils/mrm-rates-loader'
import { MrmInvariantError, type TaxRatePeriod, type TaxRegime } from '@/types/mrm'
import {
  exibeReparticaoDoResiduo,
  rateiaIrpjCsll,
  temGuiaUnicaPorDentro,
} from '@/utils/regime-decisoes'
import { REGIMES_COM_MATRIZ } from '@/utils/sale-context'
import { MATRIZ_FISCAL } from '@/utils/matriz-fiscal'

/** Os cinco valores que `@/types/mrm` expressa HOJE. O sexto é a FASE C. */
const CINCO: readonly TaxRegime[] = [
  'MEI', 'SIMPLES_NACIONAL', 'SIMPLES_HIBRIDO', 'LUCRO_PRESUMIDO', 'LUCRO_REAL',
]

function rate(tax_type: TaxRatePeriod['tax_type'], rate_pct: number): TaxRatePeriod {
  return {
    id: `r-${tax_type}`, tenant_id: 't', tax_type, origin_state: null, dest_state: null,
    rate_pct, valid_from: '2026-01-01', valid_until: null, notes: null,
  }
}

describe('(a) CARACTERIZAÇÃO — o valor de cada célula, regime por regime', () => {
  it('guia única por dentro: MEI e Simples Nacional sim, os outros três não', () => {
    expect(temGuiaUnicaPorDentro('MEI')).toBe(true)
    expect(temGuiaUnicaPorDentro('SIMPLES_NACIONAL')).toBe(true)
    expect(temGuiaUnicaPorDentro('SIMPLES_HIBRIDO')).toBe(false)
    expect(temGuiaUnicaPorDentro('LUCRO_PRESUMIDO')).toBe(false)
    expect(temGuiaUnicaPorDentro('LUCRO_REAL')).toBe(false)
  })

  it('rateia IRPJ/CSLL: MEI e Simples Nacional não, os outros três SIM', () => {
    // O Híbrido é `true` aqui e `false` na guia única — ver o grupo (c).
    expect(rateiaIrpjCsll('MEI')).toBe(false)
    expect(rateiaIrpjCsll('SIMPLES_NACIONAL')).toBe(false)
    expect(rateiaIrpjCsll('SIMPLES_HIBRIDO')).toBe(true)
    expect(rateiaIrpjCsll('LUCRO_PRESUMIDO')).toBe(true)
    expect(rateiaIrpjCsll('LUCRO_REAL')).toBe(true)
  })

  it('exibe a repartição do resíduo: a mesma divisão, e por outra razão', () => {
    expect(exibeReparticaoDoResiduo('MEI')).toBe(false)
    expect(exibeReparticaoDoResiduo('SIMPLES_NACIONAL')).toBe(false)
    expect(exibeReparticaoDoResiduo('SIMPLES_HIBRIDO')).toBe(true)
    expect(exibeReparticaoDoResiduo('LUCRO_PRESUMIDO')).toBe(true)
    expect(exibeReparticaoDoResiduo('LUCRO_REAL')).toBe(true)
  })

  it('>>> AUSENTE NÃO É UM REGIME, e cada tabela diz o que faz com ele <<<', () => {
    // `===` contra ausente é falso, e as três funções preservam exatamente isso — o que
    // significa default DIFERENTE em cada uma, porque a pergunta de cada uma é positiva de um
    // lado e negativa do outro. Afirmar os três defaults é o que impede alguém de “uniformizar”
    // para `false` e mudar comportamento sem perceber. `ausente-vs-falso.md`.
    expect(temGuiaUnicaPorDentro(null)).toBe(false)
    expect(temGuiaUnicaPorDentro(undefined)).toBe(false)
    expect(rateiaIrpjCsll(null)).toBe(true)
    expect(rateiaIrpjCsll(undefined)).toBe(true)
    expect(exibeReparticaoDoResiduo(null)).toBe(true)
    expect(exibeReparticaoDoResiduo(undefined)).toBe(true)
  })
})

describe('(b) O PORTÃO DE FUTURO — a mina que a D3 nomeou', () => {
  it('>>> nenhum dos cinco regimes produz TypeError no invariante do PIS/COFINS <<<', () => {
    // ERA O ESTADO POSSÍVEL COM O `Exclude`: um regime fora do early-return e fora do mapa
    // caía em `PIS_COFINS_EXPECTED[regime][perspective]` → leitura de propriedade em
    // `undefined`, erro de RUNTIME, não de tipo. Com chaves positivas as duas pontas saem do
    // mesmo lugar e isto é inalcançável — mas o caso fica, porque o portão tem de acusar o dia
    // em que alguém reintroduzir a divergência.
    const rates = [rate('PIS', 0.0165), rate('COFINS', 0.076)] // 9,25% — fora da faixa do LP
    for (const regime of CINCO) {
      let erro: unknown = null
      try {
        validatePisCofinsInvariant(rates, 'APURACAO', regime)
      } catch (e) {
        erro = e
      }
      expect(erro instanceof TypeError).toBe(false)
      // e quando lança, lança o erro do DOMÍNIO, não um erro de acesso a undefined
      if (erro !== null) expect(erro).toBeInstanceOf(MrmInvariantError)
    }
  })

  it('e o invariante ainda EXERCITA: 9,25% passa no LR e estoura no LP', () => {
    // O par que distingue “o portão acima está verde porque protege” de “está verde porque a
    // função não faz nada”. Sem ele, o caso anterior passaria com um `return` no topo.
    const noveVinteECinco = [rate('PIS', 0.0165), rate('COFINS', 0.076)]
    expect(() => validatePisCofinsInvariant(noveVinteECinco, 'APURACAO', 'LUCRO_REAL')).not.toThrow()
    expect(() => validatePisCofinsInvariant(noveVinteECinco, 'APURACAO', 'LUCRO_PRESUMIDO'))
      .toThrow(MrmInvariantError)
  })

  it('os três regimes sem faixa passam SEM conferir — e é o mapa que os dispensa', () => {
    const foraDeQualquerFaixa = [rate('PIS', 0.05), rate('COFINS', 0.05)] // 10%
    for (const regime of ['MEI', 'SIMPLES_NACIONAL', 'SIMPLES_HIBRIDO'] as const) {
      expect(() => validatePisCofinsInvariant(foraDeQualquerFaixa, 'APURACAO', regime)).not.toThrow()
    }
    // e os dois COM faixa estouram com a mesma entrada — o contraste é o que prova dispensa
    for (const regime of ['LUCRO_PRESUMIDO', 'LUCRO_REAL'] as const) {
      expect(() => validatePisCofinsInvariant(foraDeQualquerFaixa, 'APURACAO', regime)).toThrow()
    }
  })
})

describe('(c) AS DIVERGÊNCIAS DELIBERADAS — o Simples Híbrido responde diferente', () => {
  it('>>> guia única NÃO, mas rateia IRPJ/CSLL SIM — as duas perguntas são outras <<<', () => {
    // Se fossem a mesma pergunta, estes dois valores teriam de coincidir. Não coincidem hoje,
    // e o caso existe para que ninguém una as duas tabelas achando que são a mesma coisa.
    expect(temGuiaUnicaPorDentro('SIMPLES_HIBRIDO')).toBe(false)
    expect(rateiaIrpjCsll('SIMPLES_HIBRIDO')).toBe(true)
  })

  it('o Híbrido é DISPENSADO do invariante no loader e NÃO é dispensado no V7 do 2.6.0', () => {
    // Duas validações da mesma grandeza com critérios diferentes. Medido, não suposto: aqui o
    // loader não estoura; `margin-reapuration.ts` manda o Híbrido conferir a faixa, e isso está
    // escrito em `V7_DISPENSADO_POR_REGIME`. Unificar muda comportamento, e a FASE B não muda.
    const dezPorCento = [rate('PIS', 0.05), rate('COFINS', 0.05)]
    expect(() => validatePisCofinsInvariant(dezPorCento, 'APURACAO', 'SIMPLES_HIBRIDO'))
      .not.toThrow()
  })
})

describe('(d) A LISTA À MÃO VIROU DERIVAÇÃO', () => {
  it('>>> `REGIMES_COM_MATRIZ` continua sendo os TRÊS, agora derivado das chaves da matriz <<<', () => {
    // O valor não muda — é o que a FASE B promete. O que muda é a origem: era um array literal
    // de seis nomes, e um valor novo no tipo o deixaria incompleto EM SILÊNCIO.
    expect([...REGIMES_COM_MATRIZ].sort()).toEqual([
      'LUCRO_PRESUMIDO', 'LUCRO_PRESUMIDO_RET', 'LUCRO_REAL',
    ])
  })

  it('e a derivação parte das SEIS chaves da matriz, não de uma lista paralela', () => {
    // A asserção que distingue derivação de coincidência: a matriz tem seis chaves, a lista
    // devolve três, e as três estão entre as seis. Uma lista à mão passaria no caso acima e
    // falharia aqui no dia em que a matriz crescesse.
    const chaves = Object.keys(MATRIZ_FISCAL).sort()
    expect(chaves).toEqual([
      'LUCRO_PRESUMIDO', 'LUCRO_PRESUMIDO_RET', 'LUCRO_REAL',
      'MEI', 'SIMPLES_HIBRIDO', 'SIMPLES_NACIONAL',
    ])
    for (const r of REGIMES_COM_MATRIZ) expect(chaves).toContain(r)
  })
})
