/**
 * A AUSÊNCIA DE DIA INTEIRO — e a sobreposição que INCLUI as bordas.
 *
 * Comando do PO de 08/10/2026, quarta rodada.
 *
 * >>> O CASO MAIS IMPORTANTE DESTA SUÍTE É O PAR DO DIA 14 <<<
 *
 * `tocam no dia 14` e `encostado sem dia comum` são um PAR, e só juntos eles afirmam a regra.
 * Sozinho, o primeiro ficaria verde num módulo que recusasse tudo; sozinho, o segundo ficaria
 * verde num módulo que aceitasse tudo. É a diferença contra `montar-grade.ts`, onde encostar
 * convive — e é por isso que ela está escrita nos dois lugares.
 */

import {
  ERRO_FIM_ANTES,
  ERRO_PERIODO_OCUPADO,
  ERRO_SEM_INICIO,
  ausenciaRecusada,
  validarAusencia,
  type PeriodoDeAusencia,
  type ValidacaoDaAusencia,
} from '@/utils/validar-ausencia'

/** Uma data local, sem fuso a atrapalhar: `dia(2026, 10, 9)` é 09/10/2026. */
function dia(ano: number, mes: number, d: number): string {
  return new Date(ano, mes - 1, d, 12, 0, 0, 0).toISOString()
}

/** Um período gravado, do começo ao fim do dia, como a tela grava. */
function periodo(id: string, de: [number, number, number], ate: [number, number, number]): PeriodoDeAusencia {
  return {
    id,
    starts_at: new Date(de[0], de[1] - 1, de[2], 0, 0, 0, 0).toISOString(),
    ends_at: new Date(ate[0], ate[1] - 1, ate[2], 23, 59, 59, 999).toISOString(),
  }
}

function aceita(r: ValidacaoDaAusencia) {
  if (ausenciaRecusada(r)) throw new Error(`esperava ok:true e veio recusa: ${r.erro}`)
  return r
}

function recusa(r: ValidacaoDaAusencia) {
  if (!ausenciaRecusada(r)) throw new Error('esperava recusa e veio ok:true')
  return r
}

describe('as validações, na ordem do comando', () => {
  it('1 — início vazio recusa com a mensagem do início', () => {
    expect(recusa(validarAusencia({ inicio: null, fim: null, existentes: [] })).erro)
      .toBe(ERRO_SEM_INICIO)
    expect(recusa(validarAusencia({ inicio: '', fim: dia(2026, 10, 9), existentes: [] })).erro)
      .toBe(ERRO_SEM_INICIO)
  })

  it('2 — fim VAZIO não é erro: assume o mesmo dia do início', () => {
    // >>> É O CASO QUE A MUTAÇÃO M13 MATA <<<
    // Tratar o fim vazio como erro obrigaria o usuário a repetir a data para marcar um feriado
    // de um dia — e repetir dado é onde ele erra.
    const r = aceita(validarAusencia({ inicio: dia(2026, 10, 9), fim: null, existentes: [] }))
    const i = new Date(r.inicio)
    const f = new Date(r.fim)
    expect(i.getDate()).toBe(9)
    expect(f.getDate()).toBe(9)
    expect(i.getMonth()).toBe(9) // outubro
    expect(f.getMonth()).toBe(9)
  })

  it('2 — o fim devolvido é o FIM DO DIA, não a meia-noite', () => {
    // Sem o fim do dia, uma ausência de um dia só terminaria à 00:00 do próprio dia e não
    // cobriria nada. A razão já estava escrita no `DatePicker` da tela antiga.
    const r = aceita(validarAusencia({ inicio: dia(2026, 10, 9), fim: null, existentes: [] }))
    const f = new Date(r.fim)
    expect(f.getHours()).toBe(23)
    expect(f.getMinutes()).toBe(59)
    // e o início é o COMEÇO do dia, não meio-dia como a fixture
    expect(new Date(r.inicio).getHours()).toBe(0)
  })

  it('2 — fim vazio com string vazia também assume o início', () => {
    const r = aceita(validarAusencia({ inicio: dia(2026, 10, 9), fim: '', existentes: [] }))
    expect(new Date(r.fim).getDate()).toBe(9)
  })

  it('3 — fim ANTES do início recusa', () => {
    expect(recusa(validarAusencia({
      inicio: dia(2026, 10, 14), fim: dia(2026, 10, 9), existentes: [],
    })).erro).toBe(ERRO_FIM_ANTES)
  })

  it('3 — fim no MESMO dia do início é VÁLIDO: a ausência de um dia só', () => {
    // O espelho obrigatório. Sem ele, "fim antes recusa" ficaria verde num módulo que
    // recusasse o fim igual ao início — que é o caso mais comum da tela.
    const r = aceita(validarAusencia({
      inicio: dia(2026, 10, 9), fim: dia(2026, 10, 9), existentes: [],
    }))
    expect(new Date(r.inicio).getDate()).toBe(9)
    expect(new Date(r.fim).getDate()).toBe(9)
  })

  it('A ORDEM: sem início E com fim anterior, a queixa é do INÍCIO', () => {
    expect(recusa(validarAusencia({
      inicio: null, fim: dia(2026, 1, 1), existentes: [],
    })).erro).toBe(ERRO_SEM_INICIO)
  })

  it('nenhuma recusa carrega `inicio` nem `fim`', () => {
    // `teste-que-nao-exercita.md`: afirmar `ok: false` não afirma que nada vai ser gravado.
    // Quem grava lê os dois campos; se eles viessem preenchidos numa recusa, a tela recusaria
    // na mensagem e escreveria no banco.
    const r = validarAusencia({ inicio: null, fim: null, existentes: [] })
    expect((r as any).inicio).toBeUndefined()
    expect((r as any).fim).toBeUndefined()
  })
})

describe('4 — a sobreposição INCLUI as bordas, porque o dia é indivisível', () => {
  const JA_TEM = [periodo('a', [2026, 10, 9], [2026, 10, 14])]

  it('TOCANDO num dia só: 14/10–20/10 contra 09/10–14/10 → ok:false', () => {
    // >>> É O CASO QUE A MUTAÇÃO M12 MATA, E O MAIS IMPORTANTE DA SUÍTE <<<
    // O dia 14 é comum às duas, e não existe "metade do 14 de férias". Exigir dia comum
    // ESTRITO (sem as bordas) deixaria o 14 livre nas duas — e o profissional apareceria
    // ausente duas vezes no mesmo dia.
    //
    // É o CONTRÁRIO de `montar-grade.ts`, onde 09:00–12:00 e 12:00–18:00 convivem: lá o
    // instante 12:00 não tem duração; aqui o dia 14 tem 24 horas.
    expect(recusa(validarAusencia({
      inicio: dia(2026, 10, 14), fim: dia(2026, 10, 20), existentes: JA_TEM,
    })).erro).toBe(ERRO_PERIODO_OCUPADO)
  })

  it('tocando pelo OUTRO lado: 05/10–09/10 contra 09/10–14/10 → ok:false', () => {
    expect(recusa(validarAusencia({
      inicio: dia(2026, 10, 5), fim: dia(2026, 10, 9), existentes: JA_TEM,
    })).erro).toBe(ERRO_PERIODO_OCUPADO)
  })

  it('ENCOSTADO sem dia comum: termina 14/10, a nova começa 15/10 → ok:TRUE', () => {
    // >>> O PAR OBRIGATÓRIO DO CASO ACIMA <<<
    // Sem ele, "tocar recusa" ficaria verde num módulo que recusasse qualquer data próxima — e
    // férias em sequência é coisa normal. Juntos, os dois afirmam que o critério é o DIA
    // COMUM, nem mais frouxo nem mais apertado.
    const r = aceita(validarAusencia({
      inicio: dia(2026, 10, 15), fim: dia(2026, 10, 20), existentes: JA_TEM,
    }))
    expect(new Date(r.inicio).getDate()).toBe(15)
  })

  it('encostado antes, sem dia comum: termina 08/10, a existente começa 09/10 → ok:true', () => {
    const r = aceita(validarAusencia({
      inicio: dia(2026, 10, 1), fim: dia(2026, 10, 8), existentes: JA_TEM,
    }))
    expect(new Date(r.fim).getDate()).toBe(8)
  })

  it('DENTRO da existente: 10/10–12/10 → ok:false', () => {
    expect(recusa(validarAusencia({
      inicio: dia(2026, 10, 10), fim: dia(2026, 10, 12), existentes: JA_TEM,
    })).erro).toBe(ERRO_PERIODO_OCUPADO)
  })

  it('ENGLOBANDO a existente: 01/10–31/10 → ok:false', () => {
    // O caso espelhado do anterior: um critério que só olhasse "o novo está dentro do velho"
    // passaria aqui.
    expect(recusa(validarAusencia({
      inicio: dia(2026, 10, 1), fim: dia(2026, 10, 31), existentes: JA_TEM,
    })).erro).toBe(ERRO_PERIODO_OCUPADO)
  })

  it('IDÊNTICA à existente → ok:false', () => {
    expect(recusa(validarAusencia({
      inicio: dia(2026, 10, 9), fim: dia(2026, 10, 14), existentes: JA_TEM,
    })).erro).toBe(ERRO_PERIODO_OCUPADO)
  })

  it('NENHUMA existente → ok:true', () => {
    const r = aceita(validarAusencia({
      inicio: dia(2026, 10, 9), fim: dia(2026, 10, 14), existentes: [],
    }))
    expect(new Date(r.inicio).getDate()).toBe(9)
  })

  it('longe de todas, com TRÊS existentes → ok:true', () => {
    const r = aceita(validarAusencia({
      inicio: dia(2026, 12, 1),
      fim: dia(2026, 12, 5),
      existentes: [
        periodo('a', [2026, 10, 9], [2026, 10, 14]),
        periodo('b', [2026, 11, 2], [2026, 11, 2]),
        periodo('c', [2027, 1, 5], [2027, 1, 10]),
      ],
    }))
    expect(new Date(r.inicio).getMonth()).toBe(11) // dezembro
  })

  it('a SEGUNDA existente também é conferida, não só a primeira', () => {
    // Um laço que parasse na primeira passaria com a colisão na segunda.
    expect(recusa(validarAusencia({
      inicio: dia(2026, 11, 2),
      fim: dia(2026, 11, 2),
      existentes: [
        periodo('a', [2026, 10, 9], [2026, 10, 14]),
        periodo('b', [2026, 11, 2], [2026, 11, 2]),
      ],
    })).erro).toBe(ERRO_PERIODO_OCUPADO)
  })

  it('a hora gravada NÃO participa: o `endOf` 23:59 não estende para o dia seguinte', () => {
    // A existente termina 14/10 às 23:59:59.999. A nova começa 15/10 às 00:00. Comparar
    // INSTANTES as faria quase colidir por milissegundos de arredondamento; comparar DIAS, não.
    const r = aceita(validarAusencia({
      inicio: new Date(2026, 9, 15, 0, 0, 0, 0).toISOString(),
      fim: new Date(2026, 9, 15, 23, 59, 59, 999).toISOString(),
      existentes: JA_TEM,
    }))
    expect(new Date(r.inicio).getDate()).toBe(15)
  })
})

describe('a função NÃO conhece `employee_id` — e isso tem caso próprio', () => {
  it('ela considera TODA existente que recebe, venha de quem vier', () => {
    // >>> O CASO QUE IMPEDE A "MELHORIA" ERRADA <<<
    // `existentes` chega JÁ filtrada pela tela. Alguém pode achar que a função deveria filtrar
    // por profissional e acrescentar o campo — e aí a tela pararia de filtrar, confiando nela.
    // Este caso afirma o contrato como ele é: ela não filtra nada.
    //
    // A fixture carrega um campo a mais de propósito, que a função ignora.
    const comDonos = [
      { id: 'de-outro', employee_id: 'e2', ...periodo('x', [2026, 10, 9], [2026, 10, 14]) },
    ] as any
    expect(recusa(validarAusencia({
      inicio: dia(2026, 10, 10), fim: dia(2026, 10, 12), existentes: comDonos,
    })).erro).toBe(ERRO_PERIODO_OCUPADO)
  })

  it('e a assinatura não tem `employee_id` — se tivesse, este caso não compilaria', () => {
    // Asserção de CONTRATO, não de comportamento: `PeriodoDeAusencia` tem três campos, e um
    // objeto com exatamente eles basta. É `construtor-empobrecido.md` pelo lado bom — o tipo
    // enumera o que a função precisa, e nada mais.
    const minimo: PeriodoDeAusencia = {
      id: 'a',
      starts_at: dia(2026, 10, 9),
      ends_at: dia(2026, 10, 14),
    }
    expect(recusa(validarAusencia({
      inicio: dia(2026, 10, 10), fim: dia(2026, 10, 12), existentes: [minimo],
    })).erro).toBe(ERRO_PERIODO_OCUPADO)
  })
})
