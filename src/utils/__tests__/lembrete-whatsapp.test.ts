/**
 * QUANDO O LEMBRETE DISPARA — a regra extraída de `agenda/index.tsx` em 08/10/2026.
 *
 * >>> ESTA SUÍTE É O QUE TORNA A EXTRAÇÃO SEGURA <<<
 *
 * A regra viveu dez linhas inline no modal da agenda, SEM portão nenhum. Extraí-la sem caso
 * seria mover código não testado para um lugar novo e chamar isso de melhoria. Os casos abaixo
 * afirmam a regra COMO ELA ERA — `>=24h` dispara 24h antes, `<24h` dispara 10 min depois de
 * salvar —, para que a extração seja comprovadamente sem mudança de comportamento.
 *
 * `agora` é INJETADO em todos. A regra dos 10 minutos é relativa ao instante do salvamento; com
 * `new Date()` dentro, o resultado mudaria a cada execução.
 */

import { calcularReminderSendAt } from '@/utils/lembrete-whatsapp'

const AGORA = new Date(2026, 9, 8, 12, 0, 0, 0)

/** `emHoras(30)` é 30 horas depois de `AGORA`. */
function emHoras(h: number): Date {
  return new Date(AGORA.getTime() + h * 3600_000)
}

describe('a regra dos dois ramos', () => {
  it('30 horas à frente → dispara 24h ANTES do evento', () => {
    const r = calcularReminderSendAt({ inicio: emHoras(30), agora: AGORA, temCliente: true })
    expect(r).toBe(emHoras(6).toISOString())
  })

  it('5 horas à frente → dispara 10 MINUTOS depois de agora', () => {
    const r = calcularReminderSendAt({ inicio: emHoras(5), agora: AGORA, temCliente: true })
    expect(r).toBe(new Date(AGORA.getTime() + 10 * 60_000).toISOString())
  })

  it('EXATAMENTE 24 horas cai no ramo das 24h — o limiar é `>= 24`', () => {
    // A regra original era `hoursUntilEvent >= 24`. Com `> 24`, o evento de exatamente 24h
    // cairia no ramo dos 10 minutos e o cliente receberia o lembrete um dia antes do previsto.
    const r = calcularReminderSendAt({ inicio: emHoras(24), agora: AGORA, temCliente: true })
    expect(r).toBe(AGORA.toISOString())
  })

  it('23h59 cai no ramo dos 10 minutos — o outro lado do limiar', () => {
    // O par obrigatório. Sem ele, "o limiar é 24" ficaria verde num módulo que pusesse tudo no
    // ramo das 24h.
    const inicio = new Date(AGORA.getTime() + 24 * 3600_000 - 60_000)
    const r = calcularReminderSendAt({ inicio, agora: AGORA, temCliente: true })
    expect(r).toBe(new Date(AGORA.getTime() + 10 * 60_000).toISOString())
  })
})

describe('os casos em que NÃO há lembrete', () => {
  it('SEM cliente vinculado → `null`', () => {
    // Sem cliente não há para quem mandar. A regra original começava com `if (hasCustomer)`.
    expect(calcularReminderSendAt({ inicio: emHoras(30), agora: AGORA, temCliente: false })).toBeNull()
  })

  it('evento no PASSADO → `null`', () => {
    // Avisar de algo que já aconteceu é pior que não avisar.
    expect(calcularReminderSendAt({ inicio: emHoras(-5), agora: AGORA, temCliente: true })).toBeNull()
  })

  it('evento EXATAMENTE agora → `null` — o `> 0` estrito da regra original', () => {
    expect(calcularReminderSendAt({ inicio: AGORA, agora: AGORA, temCliente: true })).toBeNull()
  })

  it('parâmetros faltando → `null`, não exceção', () => {
    expect(calcularReminderSendAt({ inicio: undefined as any, agora: AGORA, temCliente: true })).toBeNull()
    expect(calcularReminderSendAt({ inicio: emHoras(30), agora: undefined as any, temCliente: true })).toBeNull()
  })
})

describe('`agora` é injetado — a prova', () => {
  it('o MESMO evento com dois relógios dá resultados DIFERENTES', () => {
    // >>> O CASO QUE PROVA A INJEÇÃO <<<
    // Com `new Date()` dentro, os dois seriam iguais e este caso ficaria vermelho.
    const inicio = emHoras(30)
    const deAgora = calcularReminderSendAt({ inicio, agora: AGORA, temCliente: true })
    // Vinte e nove horas depois, o mesmo evento está a 1 hora — cai no outro ramo.
    const depois = new Date(AGORA.getTime() + 29 * 3600_000)
    const deDepois = calcularReminderSendAt({ inicio, agora: depois, temCliente: true })
    expect(deAgora).not.toBe(deDepois)
    expect(deDepois).toBe(new Date(depois.getTime() + 10 * 60_000).toISOString())
  })

  it('o módulo não contém `new Date()` sem argumento — medido no PROGRAMA', () => {
    const fonte = require('fs').readFileSync(
      require('path').resolve(__dirname, '../lembrete-whatsapp.ts'), 'utf8',
    ) as string
    const programa = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    expect(programa).not.toMatch(/new Date\(\s*\)/)
  })
})

describe('os DOIS chamadores leem a MESMA função', () => {
  const fs = require('fs')
  const path = require('path')
  const raiz = path.resolve(__dirname, '../..')

  it('a agenda interna importa `calcularReminderSendAt` e não tem mais a fórmula inline', () => {
    // >>> A ASSERÇÃO QUE IMPEDE A SEGUNDA CÓPIA DE VOLTAR <<<
    // A regra estava em `agenda/index.tsx:696-711`. Extraí-la e DEIXAR a inline lá seriam duas
    // contas do mesmo critério — `copia-divergente.md` — e a divergência apareceria como um
    // cliente recebendo lembrete na hora errada só pelo caminho público.
    const fonte = fs.readFileSync(path.join(raiz, 'pages/agenda/index.tsx'), 'utf8') as string
    const programa = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    expect(programa).toContain('calcularReminderSendAt')
    // a fórmula antiga, pelos dois trechos que a identificavam
    expect(programa).not.toContain("diff(dayjs(), 'hour', true)")
    expect(programa).not.toContain("subtract(24, 'hour')")
  })

  it('a rota pública de remarcar também a importa', () => {
    const fonte = fs.readFileSync(
      path.join(raiz, 'pages/api/public/agenda/[token]/remarcar.ts'), 'utf8',
    ) as string
    const programa = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    expect(programa).toContain('calcularReminderSendAt')
  })

  it('e a fórmula não existe em NENHUM outro lugar do repositório', () => {
    // A varredura que fecha: se alguém escrever a terceira cópia, este caso pega.
    //
    // >>> O `--exclude-dir=__tests__` EXISTE PORQUE O PADRÃO CASAVA COM ESTE ARQUIVO <<<
    // Este caso cita a fórmula na própria asserção, então a primeira versão da varredura se
    // encontrava e ficava vermelha para sempre. `instrumento-que-nao-enxerga.md` outra vez, no
    // lado do falso positivo — e a terceira vez nesta rodada que um padrão meu precisou ser
    // confrontado com o repositório antes de o número valer.
    const { execSync } = require('child_process')
    const saida = execSync(
      `grep -rl --exclude-dir=__tests__ "diff(dayjs(), 'hour', true)" ${raiz} || true`,
      { encoding: 'utf8' },
    ) as string
    expect(saida.trim()).toBe('')

    // E o espelho: o padrão AINDA acha quando a cópia existe. Sem isto, um `--exclude-dir`
    // largo demais faria a varredura não achar nada nunca, e o verde seria decorativo
    // (`portao-que-nao-alcanca.md`).
    const achaAlgo = execSync(
      `grep -rl --exclude-dir=__tests__ "calcularReminderSendAt" ${raiz} || true`,
      { encoding: 'utf8' },
    ) as string
    expect(achaAlgo.trim().length).toBeGreaterThan(0)
  })
})
