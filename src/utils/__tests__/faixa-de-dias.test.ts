/**
 * A FAIXA DE DIAS — as funções puras por trás da faixa horizontal.
 *
 * Comando do PO de 09/10/2026.
 *
 * >>> `hoje` É INJETADO, E É O QUE TORNA ESTES CASOS POSSÍVEIS <<<
 *
 * Nenhuma função daqui lê o relógio. Um `new Date()` dentro de `proximosDias` faria o caso da
 * virada do mês ser um teste que às vezes passa — e esta campanha já pagou por isso em
 * `horarios-disponiveis.test.ts`, onde a expectativa lia o fuso do contêiner.
 */

import {
  diaCurtoBR, diaSemVaga, primeiroDiaComVaga, proximoDiaComVaga, proximosDias,
  type VagasPorDia,
} from '@/utils/faixa-de-dias'

/** 09/10/2026 ao meio-dia UTC — 09:00 em São Paulo, bem longe da virada. */
const SEXTA = new Date('2026-10-09T15:00:00Z')

describe('`proximosDias` — as partes separadas', () => {
  it('devolve `n` dias, começando em HOJE', () => {
    const d = proximosDias(3, SEXTA)
    expect(d.map((x) => x.valor)).toEqual(['2026-10-09', '2026-10-10', '2026-10-11'])
  })

  it('>>> AS TRÊS PARTES SAEM SEPARADAS — é por isso que a faixa de 3 linhas é possível <<<', () => {
    // A `proximosDias` antiga devolvia `"sex., 09/10"` numa string só. Fatiar texto formatado
    // por `Intl` para tirar as três partes quebra quando a locale muda.
    const [sexta] = proximosDias(1, SEXTA)
    expect(sexta.diaSemana).toBe('SEX')
    expect(sexta.dia).toBe('09')
    expect(sexta.mes).toBe('out')
  })

  it('o dia da semana é CAIXA ALTA e SEM PONTO; o mês, sem ponto', () => {
    // `Intl` em pt-BR devolve `"sex."` e `"out."`. O ponto é da locale, a caixa alta é do
    // desenho — e nenhum dos dois pode chegar à tela como veio.
    //
    // >>> A PRIMEIRA VERSÃO DESTA ASSERÇÃO FICOU VERMELHA, E A CULPA ERA DELA <<<
    // Ela era `expect(d.diaSemana).toMatch(/^[A-ZÇ]{3}$/)` e quebrou em **SÁB** — a classe de
    // caracteres saiu da minha ideia de como os sete abreviados se parecem, e seis deles são
    // ASCII. É `instrumento-que-nao-enxerga.md`: o padrão foi escrito a partir dos exemplos
    // que eu tinha em mente, não do que a locale produz. A correção não é alargar a classe
    // para `[A-ZÁÇ]`; é afirmar contra o CONJUNTO real, que não depende de eu adivinhar quais
    // levam acento.
    const OS_SETE = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB']
    const vistos = new Set<string>()
    for (const d of proximosDias(14, SEXTA)) {
      expect(OS_SETE).toContain(d.diaSemana)
      expect(d.diaSemana).toBe(d.diaSemana.toUpperCase())
      expect(d.diaSemana).not.toContain('.')
      expect(d.mes).not.toContain('.')
      expect(d.dia).toMatch(/^\d{2}$/)
      vistos.add(d.diaSemana)
    }
    // catorze dias passam por TODOS os sete — o laço exercita o conjunto inteiro, não um
    // domingo que por sorte não apareceu.
    expect([...vistos].sort()).toEqual([...OS_SETE].sort())
  })

  it('o `rotulo` é POR EXTENSO — ele é o `aria-label`, não o que se lê na faixa', () => {
    const [sexta] = proximosDias(1, SEXTA)
    expect(sexta.rotulo).toContain('sexta-feira')
    expect(sexta.rotulo).toContain('outubro')
  })

  it('atravessa a virada do MÊS sem repetir nem pular', () => {
    // 29/10 + 5 dias cai em novembro. O caso existe porque somar 86400000ms é aritmética de
    // instante, não de calendário — e é ela que a função usa.
    const d = proximosDias(5, new Date('2026-10-29T15:00:00Z'))
    expect(d.map((x) => x.valor)).toEqual([
      '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02',
    ])
    expect(d[3].mes).toBe('nov')
  })

  it('atravessa a virada do ANO', () => {
    const d = proximosDias(3, new Date('2026-12-30T15:00:00Z'))
    expect(d.map((x) => x.valor)).toEqual(['2026-12-30', '2026-12-31', '2027-01-01'])
  })

  it('`n` zero, negativo ou lixo devolve `[]` — a tela não pode quebrar por isso', () => {
    // `horizonteDias` vem de uma resposta HTTP. Um `0` ou um `null` ali não pode deixar a
    // página branca para quem só queria marcar um horário.
    for (const n of [0, -1, NaN, undefined as any, null as any, 'x' as any]) {
      expect(proximosDias(n, SEXTA)).toEqual([])
    }
  })

  it('o `valor` é `YYYY-MM-DD` no fuso da BARBEARIA, não no do visitante', () => {
    // 10/10 às 02:00 UTC ainda é 09/10 em São Paulo. Um cliente acessando de outro fuso veria
    // a faixa começar no dia errado, e o `?dia=` que ele mandasse não casaria com o que a rota
    // calcula.
    const [d] = proximosDias(1, new Date('2026-10-10T02:00:00Z'))
    expect(d.valor).toBe('2026-10-09')
  })
})

describe('>>> `diaSemVaga` — `undefined` NÃO É `0`, e aqui está a diferença <<<', () => {
  const vagas: VagasPorDia = { '2026-10-09': 0, '2026-10-10': 3 }

  it('`0` afirma SEM VAGA e desabilita', () => {
    expect(diaSemVaga(vagas, '2026-10-09')).toBe(true)
  })

  it('número positivo tem vaga', () => {
    expect(diaSemVaga(vagas, '2026-10-10')).toBe(false)
  })

  it('>>> NÃO SONDADO (`undefined`) ABRE — é a condição (a) do comando <<<', () => {
    // *"Se o pre-carregamento da janela falhar ou demorar, os dias nascem HABILITADOS."*
    // `ausente-vs-falso.md`: a ausência de resposta não afirma que o dia está cheio. Se esta
    // asserção virasse `true`, a página travaria toda vez que a sondagem demorasse.
    expect(diaSemVaga(vagas, '2026-10-11')).toBe(false)
    expect(diaSemVaga({}, '2026-10-09')).toBe(false)
  })
})

describe('`primeiroDiaComVaga` e `proximoDiaComVaga`', () => {
  const dias = proximosDias(5, SEXTA)
  const v = (o: Record<string, number | undefined>): VagasPorDia => o

  it('o primeiro com vaga é o primeiro com número POSITIVO conhecido', () => {
    expect(primeiroDiaComVaga(dias, v({ '2026-10-09': 0, '2026-10-10': 0, '2026-10-11': 2 })))
      .toBe('2026-10-11')
  })

  it('>>> DIA NÃO SONDADO NÃO CONTA para a pré-seleção <<<', () => {
    // Pré-selecionar um dia que pode estar cheio mostraria "Sem horários neste dia" na
    // abertura — a pior primeira tela possível. Aqui o 09 e o 10 são desconhecidos.
    expect(primeiroDiaComVaga(dias, v({ '2026-10-11': 2 }))).toBe('2026-10-11')
    expect(primeiroDiaComVaga(dias, v({}))).toBeNull()
  })

  it('o próximo com vaga é DEPOIS da referência, nunca ela mesma', () => {
    const vagas = v({ '2026-10-09': 1, '2026-10-10': 0, '2026-10-11': 4 })
    expect(proximoDiaComVaga(dias, vagas, '2026-10-09')).toBe('2026-10-11')
    expect(proximoDiaComVaga(dias, vagas, '2026-10-11')).toBeNull()
  })

  it('referência fora da lista devolve `null`', () => {
    expect(proximoDiaComVaga(dias, v({ '2026-10-11': 4 }), '2025-01-01')).toBeNull()
  })

  it('e `null` é o que faz o BOTÃO não aparecer — não um botão que não leva a nada', () => {
    // Um botão "ver o próximo com vaga" que não navega afirma que há para onde ir.
    expect(proximoDiaComVaga(dias, v({ '2026-10-09': 1 }), '2026-10-09')).toBeNull()
  })
})

describe('`diaCurtoBR`', () => {
  it('`2026-10-11` → `11/10`', () => {
    expect(diaCurtoBR('2026-10-11')).toBe('11/10')
  })

  it('entrada estranha volta como veio, sem lançar', () => {
    expect(diaCurtoBR('')).toBe('')
    expect(diaCurtoBR('abc')).toBe('abc')
    expect(diaCurtoBR(null as any)).toBe('')
  })
})
