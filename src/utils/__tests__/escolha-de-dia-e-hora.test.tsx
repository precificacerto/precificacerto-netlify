/**
 * A FAIXA DE DIAS E OS CHIPS DE HORÁRIO — o componente único da página pública.
 *
 * Comando do PO de 09/10/2026.
 *
 * ══ O QUE ESTE PORTÃO ALCANÇA, E O QUE NÃO ══════════════════════════════════════════════
 *
 * Ele renderiza o componente no jsdom com `buscarHorarios` de mentira. Então:
 *
 *   1. **A rota `/horarios` NÃO é exercida.** Nenhuma linha daqui fala com `fetch`, com o
 *      Next ou com o Postgres. Quem cobre a rota é `agendamento-fase2b-rotas.test.ts`, e quem
 *      cobre o cálculo é `horarios-disponiveis.test.ts`, com 23 casos.
 *   2. **O layout não é medido.** Não há CSS no jsdom: `overflow-x`, largura de cartão e scroll
 *      horizontal não aparecem aqui. As asserções são de ATRIBUTO e de TEXTO, nunca de cor nem
 *      de pixel — exigência do comando: *"afirme o atributo, não a cor"*.
 *
 * `portao-que-nao-alcanca.md`: um portão verde prova que AQUELE portão passou.
 */

import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import EscolhaDeDiaEHora from '@/components/agendar/escolha-de-dia-e-hora.component'
import { proximosDias } from '@/utils/faixa-de-dias'

// Sem `IS_REACT_ACT_ENVIRONMENT` o `act()` avisa no desmonte e engole o erro real num
// `AggregateError` — a mesma razão registrada no portão do painel de agendamento.
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement | null = null
let root: Root | null = null

function renderizar(node: React.ReactElement) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => { root!.render(node) })
}

/**
 * Deixa as microtarefas rodarem DENTRO de `act`.
 *
 * O pré-carregamento é `Promise.allSettled` dentro de `useEffect`, e a pré-seleção dispara num
 * segundo efeito, DEPOIS de `vagas` mudar. Uma volta só não basta: são três estados em cascata
 * (sondagem → `vagas` → pré-seleção → `horarios`). O laço é o preço de medir o efeito em vez de
 * afirmar que a função foi chamada.
 */
async function assentar(voltas = 8) {
  for (let i = 0; i < voltas; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { await Promise.resolve() })
  }
}

function desmontar() {
  if (root) act(() => { root!.unmount() })
  if (host && host.parentNode) host.parentNode.removeChild(host)
  root = null; host = null
}

afterEach(desmontar)

/** Os cartões de dia, na ordem em que estão no DOM. */
function cartoesDeDia(): HTMLButtonElement[] {
  return Array.from(document.body.querySelectorAll('button[data-dia]')) as HTMLButtonElement[]
}
function cartaoDoDia(valor: string): HTMLButtonElement | null {
  return document.body.querySelector(`button[data-dia="${valor}"]`) as HTMLButtonElement | null
}
/** Os chips de horário, na ordem em que estão no DOM. */
function chipsDeHora(): HTMLButtonElement[] {
  return Array.from(document.body.querySelectorAll('button[data-hora]')) as HTMLButtonElement[]
}
function textoDaTela(): string {
  return (document.body.textContent || '').replace(/\s+/g, ' ')
}
function clicar(el: Element | null) {
  act(() => { (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })) })
}

/** O relógio de referência dos casos, para montar os `YYYY-MM-DD` esperados. */
const HOJE = new Date()
const DIAS = proximosDias(30, HOJE)
const D = (i: number) => DIAS[i].valor

describe('a FAIXA DE DIAS', () => {
  it('mostra SETE dias por janela, começando em hoje', async () => {
    renderizar(<EscolhaDeDiaEHora
      horizonteDias={30} buscarHorarios={async () => []} onEscolher={() => {}}
    />)
    await assentar()
    expect(cartoesDeDia()).toHaveLength(7)
    expect(cartoesDeDia()[0].getAttribute('data-dia')).toBe(D(0))
    expect(cartoesDeDia()[6].getAttribute('data-dia')).toBe(D(6))
  })

  it('cada cartão tem as TRÊS linhas: dia da semana, dia e mês', async () => {
    renderizar(<EscolhaDeDiaEHora
      horizonteDias={30} buscarHorarios={async () => []} onEscolher={() => {}}
    />)
    await assentar()
    const c = cartoesDeDia()[0]
    // As três partes vêm separadas de `proximosDias`, e é por isso que a faixa é possível.
    expect(c.textContent).toContain(DIAS[0].diaSemana)
    expect(c.textContent).toContain(DIAS[0].dia)
    expect(c.textContent).toContain(DIAS[0].mes)
  })

  it('o HORIZONTE manda: com 3, a faixa tem 3 cartões e nenhuma seta adiante', async () => {
    // Era aqui que o 30 e o 14 chutados viviam. Agora o número vem da rota.
    renderizar(<EscolhaDeDiaEHora
      horizonteDias={3} buscarHorarios={async () => []} onEscolher={() => {}}
    />)
    await assentar()
    expect(cartoesDeDia()).toHaveLength(3)
    const proxima = document.body.querySelector('button[aria-label="Próximos dias"]') as HTMLButtonElement
    expect(proxima.disabled).toBe(true)
  })

  it('a seta avança a janela em sete, e a de voltar nasce desabilitada', async () => {
    renderizar(<EscolhaDeDiaEHora
      horizonteDias={30} buscarHorarios={async () => []} onEscolher={() => {}}
    />)
    await assentar()
    const anterior = () => document.body.querySelector('button[aria-label="Dias anteriores"]') as HTMLButtonElement
    const proxima = () => document.body.querySelector('button[aria-label="Próximos dias"]') as HTMLButtonElement
    expect(anterior().disabled).toBe(true)

    clicar(proxima())
    await assentar()
    expect(cartoesDeDia()[0].getAttribute('data-dia')).toBe(D(7))
    expect(anterior().disabled).toBe(false)

    clicar(anterior())
    await assentar()
    expect(cartoesDeDia()[0].getAttribute('data-dia')).toBe(D(0))
  })
})

describe('>>> DIA SEM VAGA NASCE DESABILITADO — O ATRIBUTO, NÃO A COR <<<', () => {
  it('o dia que a sondagem devolveu VAZIO fica `disabled` e `aria-disabled`', async () => {
    // O terceiro dia da janela é o único sem vaga. Os outros seis TÊM — é o par que faz o caso
    // discriminar: se tudo viesse vazio, "está desabilitado" ficaria verde num componente que
    // desabilita sempre.
    renderizar(<EscolhaDeDiaEHora
      horizonteDias={30}
      buscarHorarios={async (d) => (d === D(2) ? [] : ['09:00'])}
      onEscolher={() => {}}
    />)
    await assentar()

    const cheio = cartaoDoDia(D(2))!
    expect(cheio.disabled).toBe(true)
    expect(cheio.getAttribute('aria-disabled')).toBe('true')
    // o rótulo diz por quê, para quem usa leitor de tela
    expect(cheio.getAttribute('aria-label')).toContain('sem horários')

    // >>> O PAR: os outros NÃO estão desabilitados <<<
    for (const i of [0, 1, 3, 4, 5, 6]) {
      const c = cartaoDoDia(D(i))!
      expect(c.disabled).toBe(false)
      expect(c.getAttribute('aria-disabled')).toBeNull()
    }
  })

  it('>>> FALHA ABRE: sondagem que LANÇA deixa o dia HABILITADO <<<', async () => {
    // A condição (a) do comando: *"Se o pre-carregamento da janela falhar ou demorar, os dias
    // nascem HABILITADOS, e o usuario descobre ao clicar."*
    //
    // E a distinção que faz isso funcionar é de `ausente-vs-falso.md`: `[]` AFIRMA que o dia
    // está cheio; uma falha não afirma nada. Se a falha gravasse `0`, este caso ficaria
    // vermelho — e é exatamente o defeito que ele existe para barrar.
    renderizar(<EscolhaDeDiaEHora
      horizonteDias={30}
      buscarHorarios={async (d) => { if (d === D(2)) throw new Error('rede'); return ['09:00'] }}
      onEscolher={() => {}}
    />)
    await assentar()
    const c = cartaoDoDia(D(2))!
    expect(c.disabled).toBe(false)
    expect(c.getAttribute('aria-disabled')).toBeNull()
  })

  it('e sondagem que NÃO VOLTOU também deixa habilitado', async () => {
    // A promessa pendente é o estado real dos primeiros instantes da tela. Nenhum cartão pode
    // nascer desabilitado por falta de resposta.
    renderizar(<EscolhaDeDiaEHora
      horizonteDias={30}
      buscarHorarios={() => new Promise<string[]>(() => { /* nunca resolve */ })}
      onEscolher={() => {}}
    />)
    await assentar()
    expect(cartoesDeDia()).toHaveLength(7)
    for (const c of cartoesDeDia()) {
      expect(c.disabled).toBe(false)
      expect(c.getAttribute('aria-disabled')).toBeNull()
    }
  })
})

describe('>>> O PRIMEIRO DIA COM VAGA VEM PRÉ-SELECIONADO <<<', () => {
  it('os dois primeiros cheios: o TERCEIRO nasce selecionado e com os horários carregados', async () => {
    // O caso discrimina porque os dois primeiros estão cheios: um componente que
    // pré-selecionasse "o primeiro da faixa" ficaria vermelho aqui, e verde num caso em que o
    // dia 0 tivesse vaga.
    renderizar(<EscolhaDeDiaEHora
      horizonteDias={30}
      buscarHorarios={async (d) => (d === D(0) || d === D(1) ? [] : ['14:00', '14:30'])}
      onEscolher={() => {}}
    />)
    await assentar()

    expect(cartaoDoDia(D(2))!.getAttribute('aria-pressed')).toBe('true')
    expect(cartaoDoDia(D(0))!.getAttribute('aria-pressed')).toBe('false')
    expect(cartaoDoDia(D(1))!.getAttribute('aria-pressed')).toBe('false')
    // e o EFEITO: os horários daquele dia estão na tela
    expect(chipsDeHora().map((c) => c.textContent)).toEqual(['14:00', '14:30'])
  })

  it('a janela TODA cheia não pré-seleciona nada, e a frase de convite fica', async () => {
    // Pré-selecionar um dia cheio mostraria "Sem horários neste dia" na abertura — a pior
    // primeira tela possível.
    renderizar(<EscolhaDeDiaEHora
      horizonteDias={30} buscarHorarios={async () => []} onEscolher={() => {}}
    />)
    await assentar()
    for (const c of cartoesDeDia()) expect(c.getAttribute('aria-pressed')).toBe('false')
    expect(textoDaTela()).toContain('Escolha um dia para ver os horários.')
  })

  it('a pré-seleção não briga com a escolha do usuário — ela acontece UMA vez', async () => {
    renderizar(<EscolhaDeDiaEHora
      horizonteDias={30}
      buscarHorarios={async (d) => (d === D(0) ? ['09:00'] : ['16:00'])}
      onEscolher={() => {}}
    />)
    await assentar()
    expect(cartaoDoDia(D(0))!.getAttribute('aria-pressed')).toBe('true')

    clicar(cartaoDoDia(D(4)))
    await assentar()
    // o escolhido é o do usuário, e a pré-seleção não o puxou de volta
    expect(cartaoDoDia(D(4))!.getAttribute('aria-pressed')).toBe('true')
    expect(cartaoDoDia(D(0))!.getAttribute('aria-pressed')).toBe('false')
    expect(chipsDeHora().map((c) => c.textContent)).toEqual(['16:00'])
  })
})

describe('os CHIPS, agrupados por período', () => {
  it('os três títulos aparecem, na ordem, com os chips de cada um', async () => {
    renderizar(<EscolhaDeDiaEHora
      horizonteDias={30}
      buscarHorarios={async () => ['09:00', '09:30', '14:00', '19:00', '19:30']}
      onEscolher={() => {}}
    />)
    await assentar()
    const t = textoDaTela()
    expect(t).toContain('MANHÃ')
    expect(t).toContain('TARDE')
    expect(t).toContain('NOITE')
    expect(t.indexOf('MANHÃ')).toBeLessThan(t.indexOf('TARDE'))
    expect(t.indexOf('TARDE')).toBeLessThan(t.indexOf('NOITE'))
    expect(chipsDeHora().map((c) => c.textContent))
      .toEqual(['09:00', '09:30', '14:00', '19:00', '19:30'])
  })

  it('>>> PERÍODO SEM HORÁRIO NÃO RENDERIZA NEM O TÍTULO <<<', async () => {
    // Só tarde. MANHÃ e NOITE não podem aparecer — nem como título vazio, que afirmaria que há
    // atendimento naquele período e que ele está todo ocupado (`ausente-vs-falso.md`).
    renderizar(<EscolhaDeDiaEHora
      horizonteDias={30}
      buscarHorarios={async () => ['14:00', '15:30']}
      onEscolher={() => {}}
    />)
    await assentar()
    const t = textoDaTela()
    expect(t).toContain('TARDE')
    expect(t).not.toContain('MANHÃ')
    expect(t).not.toContain('NOITE')
    expect(chipsDeHora()).toHaveLength(2)
  })

  it('>>> NENHUM CHIP DE HORÁRIO DESABILITADO: só os disponíveis chegam <<<', async () => {
    // A decisão de 09/10/2026: a constante `MOSTRAR_HORARIOS_OCUPADOS` NÃO foi criada, porque
    // `/horarios` devolve `string[]` só com os livres — uma chave que prometesse expor o
    // movimento da barbearia sem ter o dado seria `portao-que-nao-alcanca.md` em forma de
    // interruptor. Este caso afirma a consequência: não há chip desabilitado na tela.
    renderizar(<EscolhaDeDiaEHora
      horizonteDias={30}
      buscarHorarios={async () => ['09:00', '14:00', '19:00']}
      onEscolher={() => {}}
    />)
    await assentar()
    expect(chipsDeHora()).toHaveLength(3)
    for (const c of chipsDeHora()) {
      expect(c.disabled).toBe(false)
      expect(c.getAttribute('aria-disabled')).toBeNull()
    }
  })

  it('o chip selecionado fica destacado, e só UM por vez', async () => {
    const vistos: string[] = []
    function Caixa() {
      const [hora, setHora] = React.useState('')
      return (
        <EscolhaDeDiaEHora
          horizonteDias={30}
          buscarHorarios={async () => ['09:00', '09:30', '10:00']}
          horaSelecionada={hora}
          onEscolher={(d, h) => { vistos.push(`${d} ${h}`); setHora(h) }}
        />
      )
    }
    renderizar(<Caixa />)
    await assentar()

    clicar(chipsDeHora()[1])
    await assentar()
    const marcados = chipsDeHora().filter((c) => c.getAttribute('aria-pressed') === 'true')
    expect(marcados).toHaveLength(1)
    expect(marcados[0].textContent).toBe('09:30')

    clicar(chipsDeHora()[2])
    await assentar()
    const agora = chipsDeHora().filter((c) => c.getAttribute('aria-pressed') === 'true')
    expect(agora).toHaveLength(1)
    expect(agora[0].textContent).toBe('10:00')
    // e o chamador recebeu dia E hora nas duas vezes
    expect(vistos).toEqual([`${D(0)} 09:30`, `${D(0)} 10:00`])
  })

  it('`ocupado` trava os chips durante um envio em curso', async () => {
    renderizar(<EscolhaDeDiaEHora
      horizonteDias={30} ocupado
      buscarHorarios={async () => ['09:00']}
      onEscolher={() => {}}
    />)
    await assentar()
    expect(chipsDeHora()[0].disabled).toBe(true)
  })
})

describe('>>> DIA VAZIO: A FRASE E O BOTÃO DO PRÓXIMO COM VAGA <<<', () => {
  it('clicar num dia que volta vazio mostra a frase e o botão do próximo com vaga', async () => {
    // O dia 2 está cheio na sondagem, então nasce desabilitado — para exercitar o ramo do dia
    // vazio, o que volta vazio é um dia que a sondagem disse ter vaga e que ESVAZIOU na
    // segunda leitura. É o caso real: alguém marcou no meio.
    let primeiraLeitura = true
    renderizar(<EscolhaDeDiaEHora
      horizonteDias={30}
      buscarHorarios={async (d) => {
        if (d === D(0)) {
          if (primeiraLeitura) { primeiraLeitura = false; return ['09:00'] }
          return []
        }
        return d === D(3) ? ['15:00'] : []
      }}
      onEscolher={() => {}}
    />)
    await assentar()

    // a pré-seleção pegou o dia 0 e a segunda leitura veio vazia
    expect(textoDaTela()).toContain('Sem horários neste dia.')
    expect(chipsDeHora()).toHaveLength(0)

    // e o botão aponta para o dia 3, que é o próximo COM vaga conhecida
    const d3 = DIAS[3].valor.split('-')
    const alvo = `${d3[2]}/${d3[1]}`
    expect(textoDaTela()).toContain(`Ver ${alvo}, o próximo com vaga`)
  })

  it('e o botão LEVA para lá — os horários do próximo dia aparecem', async () => {
    let primeiraLeitura = true
    renderizar(<EscolhaDeDiaEHora
      horizonteDias={30}
      buscarHorarios={async (d) => {
        if (d === D(0)) {
          if (primeiraLeitura) { primeiraLeitura = false; return ['09:00'] }
          return []
        }
        return d === D(3) ? ['15:00', '15:30'] : []
      }}
      onEscolher={() => {}}
    />)
    await assentar()

    const botao = Array.from(document.body.querySelectorAll('button'))
      .find((b) => (b.textContent || '').includes('o próximo com vaga'))
    expect(botao).toBeTruthy()
    clicar(botao!)
    await assentar()

    expect(cartaoDoDia(D(3))!.getAttribute('aria-pressed')).toBe('true')
    expect(chipsDeHora().map((c) => c.textContent)).toEqual(['15:00', '15:30'])
    expect(textoDaTela()).not.toContain('Sem horários neste dia.')
  })

  it('SEM próximo dia com vaga, o botão NÃO aparece — mas a frase, sim', async () => {
    // Um botão que não leva a lugar nenhum afirma que há para onde ir. `proximoDiaComVaga`
    // devolve `null` e o botão deixa de existir.
    let primeira = true
    renderizar(<EscolhaDeDiaEHora
      horizonteDias={30}
      buscarHorarios={async (d) => {
        if (d === D(0) && primeira) { primeira = false; return ['09:00'] }
        return []
      }}
      onEscolher={() => {}}
    />)
    await assentar()
    expect(textoDaTela()).toContain('Sem horários neste dia.')
    expect(textoDaTela()).not.toContain('o próximo com vaga')
  })
})

describe('o CUSTO do pré-carregamento, afirmado para não crescer sem alguém ver', () => {
  it('sonda SETE dias na primeira janela, e NÃO os 30', async () => {
    // Sete requisições, ~49 selects. O número está no comentário do componente, com a saída
    // (a rota aceitar vários dias) registrada como rodada própria. Este caso impede que a
    // janela cresça para o horizonte inteiro sem ninguém decidir.
    const pedidos: string[] = []
    renderizar(<EscolhaDeDiaEHora
      horizonteDias={30}
      buscarHorarios={async (d) => { pedidos.push(d); return [] }}
      onEscolher={() => {}}
    />)
    await assentar()
    expect(pedidos).toHaveLength(7)
    expect(pedidos.sort()).toEqual(DIAS.slice(0, 7).map((d) => d.valor).sort())
  })

  it('e NÃO re-sonda o dia já conhecido ao voltar para a janela anterior', async () => {
    const pedidos: string[] = []
    renderizar(<EscolhaDeDiaEHora
      horizonteDias={30}
      buscarHorarios={async (d) => { pedidos.push(d); return [] }}
      onEscolher={() => {}}
    />)
    await assentar()
    const proxima = document.body.querySelector('button[aria-label="Próximos dias"]') as HTMLButtonElement
    clicar(proxima)
    await assentar()
    expect(pedidos).toHaveLength(14)

    const anterior = document.body.querySelector('button[aria-label="Dias anteriores"]') as HTMLButtonElement
    clicar(anterior)
    await assentar()
    // a volta não gera pedido novo: os sete primeiros já são dado conhecido
    expect(pedidos).toHaveLength(14)
  })
})

describe('o componente NÃO fala com o banco — a regra inviolável, do lado do cliente', () => {
  it('ZERO menção a supabase, tenant_id ou chave de serviço no arquivo', () => {
    // >>> O PORTÃO FOI ESTENDIDO PARA CÁ NESTA RODADA <<<
    // A asserção equivalente em `agendamento-fase2b-rotas.test.ts` lia só
    // `pages/agendar/[token].tsx`. Com a escolha de dia e hora saindo da página para este
    // arquivo, um portão que continuasse lendo só a página deixaria de alcançar o código que
    // saiu dela — `portao-que-nao-alcanca.md`. A asserção lá também passou a ler este arquivo.
    const fs = require('fs')
    const path = require('path')
    const fonte = fs.readFileSync(
      path.resolve(__dirname, '../../components/agendar/escolha-de-dia-e-hora.component.tsx'),
      'utf8',
    ) as string
    const programa = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    expect(programa).not.toMatch(/supabase/i)
    expect(programa).not.toMatch(/createClient/)
    expect(programa).not.toContain('tenant_id')
    expect(programa).not.toMatch(/SERVICE_ROLE|service_role/)
    // e ele não monta URL nenhuma: a busca é INJETADA
    expect(programa).not.toContain('fetch(')
    expect(programa).not.toContain('/api/')
  })
})
