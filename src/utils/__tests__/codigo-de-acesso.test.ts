/**
 * O CÓDIGO DE ACESSO — seis dígitos que autorizam cancelar o agendamento de alguém.
 *
 * Comando do PO de 08/10/2026, Fase 2B, §5.
 *
 * >>> O CASO MAIS IMPORTANTE DESTA SUÍTE É O DO 'bloqueado' COM O CÓDIGO CERTO <<<
 *
 * Ele é o único que distingue "três tentativas" de "três erros". Com o código CERTO na quarta
 * tentativa, um módulo que comparasse antes de checar `attempts` deixaria entrar — e o limite
 * de tentativas, que é a única defesa contra força bruta de 10^6, deixaria de existir.
 */

import {
  MAX_TENTATIVAS,
  VALIDADE_MIN,
  codigoRecusado,
  expiraEm,
  gerarCodigo,
  gerarSal,
  hashDoCodigo,
  validarCodigo,
  type ValidacaoDoCodigo,
} from '@/utils/codigo-de-acesso'

/** Um instante fixo. Nenhum caso lê o relógio real. */
const AGORA = new Date(2026, 9, 8, 12, 0, 0, 0)
const SAL = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4'
const CODIGO = '042137'

/** Cinco minutos no futuro: dentro do prazo de 10. */
const DENTRO = new Date(AGORA.getTime() + 5 * 60_000).toISOString()
/** Um minuto no passado. */
const VENCIDO = new Date(AGORA.getTime() - 60_000).toISOString()

function base(over: Partial<Parameters<typeof validarCodigo>[0]> = {}) {
  return validarCodigo({
    hash: hashDoCodigo(CODIGO, SAL),
    codigo: CODIGO,
    sal: SAL,
    expiresAt: DENTRO,
    attempts: 0,
    usedAt: null,
    agora: AGORA,
    ...over,
  })
}

function motivo(r: ValidacaoDoCodigo): string {
  if (!codigoRecusado(r)) throw new Error('esperava recusa e veio ok:true')
  return r.motivo
}

describe('validarCodigo — os cinco resultados', () => {
  it('código CERTO dentro do prazo → ok', () => {
    expect(base().ok).toBe(true)
  })

  it('código certo DEPOIS de expirar → `expirado`', () => {
    // >>> É O CASO QUE A MUTAÇÃO M16 MATA <<<
    expect(motivo(base({ expiresAt: VENCIDO }))).toBe('expirado')
  })

  it('código certo JÁ USADO → `usado`', () => {
    // >>> É O CASO QUE A MUTAÇÃO M18 MATA <<<
    // Uso único é o que impede quem viu o WhatsApp do cliente por cima do ombro de usar o
    // mesmo código meia hora depois.
    expect(motivo(base({ usedAt: new Date(AGORA.getTime() - 60_000).toISOString() }))).toBe('usado')
  })

  it('código ERRADO → `errado`', () => {
    expect(motivo(base({ codigo: '999999' }))).toBe('errado')
  })

  it('attempts >= 3 → `bloqueado`, MESMO COM O CÓDIGO CERTO', () => {
    // >>> É O CASO QUE A MUTAÇÃO M17 MATA, E O MAIS IMPORTANTE DA SUÍTE <<<
    // O código é o CERTO e o prazo está aberto. Só o contador recusa. Um módulo que comparasse
    // o hash antes de olhar `attempts` deixaria entrar na quarta tentativa — e o limite, que é
    // a única defesa contra força bruta de um milhão de combinações, não existiria.
    expect(motivo(base({ attempts: MAX_TENTATIVAS }))).toBe('bloqueado')
    expect(motivo(base({ attempts: 7 }))).toBe('bloqueado')
  })

  it('attempts = 2 ainda PASSA — o espelho que fixa onde o limite cai', () => {
    // Sem ele, "bloqueia em 3" ficaria verde num módulo que bloqueasse em 1.
    expect(base({ attempts: MAX_TENTATIVAS - 1 }).ok).toBe(true)
  })

  it('a ORDEM das recusas: bloqueado vence usado, expirado e errado', () => {
    // Todos os quatro estados ruins ao mesmo tempo. A resposta é 'bloqueado' porque é a que
    // importa para a segurança — e a ordem está escrita no módulo com a razão.
    expect(motivo(base({
      attempts: 9, usedAt: VENCIDO, expiresAt: VENCIDO, codigo: '111111',
    }))).toBe('bloqueado')
  })

  it('a ORDEM: usado vence expirado e errado', () => {
    expect(motivo(base({ usedAt: VENCIDO, expiresAt: VENCIDO, codigo: '111111' }))).toBe('usado')
  })

  it('a ORDEM: expirado vence errado', () => {
    expect(motivo(base({ expiresAt: VENCIDO, codigo: '111111' }))).toBe('expirado')
  })
})

describe('validarCodigo — as bordas, e o lado seguro de cada uma', () => {
  it('`expiresAt` EXATAMENTE agora conta como expirado', () => {
    // O `<=` do módulo. Na dúvida, recusa — um código que vale "até agora" já não vale.
    expect(motivo(base({ expiresAt: AGORA.toISOString() }))).toBe('expirado')
  })

  it('`expiresAt` ilegível conta como EXPIRADO, não como eterno', () => {
    // `ausente-vs-falso.md` aplicado a segurança: um `NaN` lido como "não expira" transformaria
    // uma linha corrompida em código permanente.
    expect(motivo(base({ expiresAt: 'nao-e-data' }))).toBe('expirado')
  })

  it('`agora` ausente também recusa, em vez de passar', () => {
    expect(motivo(base({ agora: undefined as any }))).toBe('expirado')
  })

  it('SAL diferente dá `errado` — é o sal que impede a rainbow table', () => {
    // O mesmo código, outro sal: hash diferente. Sem sal por linha, uma tabela de 10^6 entradas
    // quebraria todos os códigos do banco numa passada.
    expect(motivo(base({ sal: 'f'.repeat(32) }))).toBe('errado')
  })

  it('hash de tamanho diferente dá `errado` em vez de jogar', () => {
    // `timingSafeEqual` LANÇA quando os tamanhos diferem. A comparação de tamanho antes é o que
    // transforma uma linha truncada em recusa em vez de 500.
    expect(motivo(base({ hash: 'abc' }))).toBe('errado')
  })

  it('código com formato errado dá `errado`, não exceção', () => {
    for (const c of ['', '42', 'abcdef', '0421370']) {
      expect(motivo(base({ codigo: c }))).toBe('errado')
    }
  })
})

describe('hashDoCodigo', () => {
  it('é determinístico e tem 64 hex — sha256', () => {
    const h = hashDoCodigo(CODIGO, SAL)
    expect(h).toHaveLength(64)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(hashDoCodigo(CODIGO, SAL)).toBe(h)
  })

  it('o CÓDIGO não aparece dentro do hash — é a razão de ele existir', () => {
    expect(hashDoCodigo(CODIGO, SAL)).not.toContain(CODIGO)
  })

  it('sais diferentes dão hashes diferentes para o MESMO código', () => {
    expect(hashDoCodigo(CODIGO, SAL)).not.toBe(hashDoCodigo(CODIGO, 'b'.repeat(32)))
  })

  it('o separador `:` desambigua a concatenação', () => {
    // Sem ele, `sal='ab', codigo='1cd'` e `sal='ab1', codigo='cd'` colidiriam.
    expect(hashDoCodigo('1cd', 'ab')).not.toBe(hashDoCodigo('cd', 'ab1'))
  })
})

describe('gerarCodigo — `crypto.randomInt`, NUNCA `Math.random`', () => {
  it('mil vezes: todos com 6 dígitos', () => {
    for (let i = 0; i < 1000; i += 1) {
      const c = gerarCodigo()
      expect(c).toHaveLength(6)
      expect(c).toMatch(/^\d{6}$/)
    }
  })

  it('mil vezes: mais de 900 DISTINTOS', () => {
    // O limiar do comando. Um gerador que devolvesse sempre o mesmo, ou que tivesse viés forte,
    // cairia aqui. Com 10^6 valores e 1000 sorteios, o esperado é ~999,5 distintos.
    const vistos = new Set<string>()
    for (let i = 0; i < 1000; i += 1) vistos.add(gerarCodigo())
    expect(vistos.size).toBeGreaterThan(900)
  })

  it('os ZEROS À ESQUERDA são preservados — `000042` é código legítimo', () => {
    // `padStart` é o que faz isso. Sem ele, `randomInt` devolveria `42` e a comparação com o
    // que o cliente digita (`000042`) falharia — e o cliente veria "código inválido" tendo
    // digitado o que recebeu. Em 1000 sorteios, códigos abaixo de 100000 são ~10%.
    let viuComZero = false
    for (let i = 0; i < 3000 && !viuComZero; i += 1) {
      if (gerarCodigo().startsWith('0')) viuComZero = true
    }
    expect(viuComZero).toBe(true)
  })

  it('o módulo NÃO contém `Math.random` — medido no PROGRAMA, não na prosa', () => {
    // >>> A ASSERÇÃO ESTRUTURAL QUE ACOMPANHA A DE COMPORTAMENTO <<<
    // `Math.random` é um PRNG não criptográfico: conhecidas algumas saídas, as seguintes são
    // deriváveis. Para um segredo de 6 dígitos que autoriza cancelar agendamento, isso basta
    // para abusar — e o teste de distribuição NÃO pegaria, porque `Math.random` também passa
    // em "mais de 900 distintos".
    //
    // Mede o programa sem comentários: o cabeçalho do arquivo CITA `Math.random` ao explicar
    // por que não o usa, e medir a prosa já ficou vermelho antes nesta campanha.
    const fonte = require('fs').readFileSync(
      require('path').resolve(__dirname, '../codigo-de-acesso.ts'), 'utf8',
    ) as string
    const programa = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    expect(programa).not.toContain('Math.random')
    // e o gerador certo ESTÁ lá — senão "não tem Math.random" ficaria verde num arquivo vazio
    expect(programa).toContain('randomInt(')
  })
})

describe('gerarSal e expiraEm', () => {
  it('o sal tem 32 hex e é diferente a cada chamada', () => {
    const a = gerarSal()
    expect(a).toMatch(/^[0-9a-f]{32}$/)
    const vistos = new Set<string>()
    for (let i = 0; i < 200; i += 1) vistos.add(gerarSal())
    expect(vistos.size).toBe(200)
  })

  it('`expiraEm` soma 10 minutos ao `agora` INJETADO', () => {
    expect(expiraEm(AGORA).getTime() - AGORA.getTime()).toBe(VALIDADE_MIN * 60_000)
    // e com outro relógio o resultado muda — a prova de que ele não lê o sistema
    const outro = new Date(2027, 0, 1, 0, 0, 0, 0)
    expect(expiraEm(outro).getTime()).toBe(outro.getTime() + VALIDADE_MIN * 60_000)
  })

  it('o código recém-gerado passa na validação com `expiraEm`', () => {
    // O caso que liga as quatro funções: gerar, salgar, hashear e validar. Sem ele, cada uma
    // poderia estar certa consigo mesma e errada em conjunto (`copia-divergente.md`).
    const codigo = gerarCodigo()
    const sal = gerarSal()
    const r = validarCodigo({
      hash: hashDoCodigo(codigo, sal),
      codigo, sal,
      expiresAt: expiraEm(AGORA).toISOString(),
      attempts: 0, usedAt: null, agora: AGORA,
    })
    expect(r.ok).toBe(true)
  })
})
