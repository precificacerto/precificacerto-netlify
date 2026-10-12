/**
 * O PORTÃO DE COMPONENTE DA AUTORIZAÇÃO — ESPEC Parte VII.2, as três telas.
 *
 * Rodada final de teste, 12/10/2026. Ele fecha o gap que o relatório do XI-6 declarou com
 * estas palavras: *"o `<Alert>`, o `<Checkbox>`, o reset da autorização a cada mudança de
 * desconto e a guarda do save são lógica afirmada por leitura, não por caso vermelho."*
 *
 * ── O QUE TORNOU O PORTÃO POSSÍVEL, e é a parte que importa ───────────────────────────────
 *
 * O bloco não podia ser renderizado enquanto morava dentro de três páginas de milhares de
 * linhas, cada uma com dezenas de hooks, Supabase e router. A saída não foi montar as páginas:
 * foi **apagar duas das três cópias**, que é o remédio que `copia-divergente.md` prescreve e o
 * que já tinha falhado — a terceira cópia, a de `pedidos`, nasceu SEM o parágrafo do modo de
 * absorção que a VII.5 manda exibir, e nada falhou, porque texto que falta não levanta erro.
 *
 * Então o portão não é um teste que se acrescentou ao desenho: ele é o que o desenho certo
 * permitiu. Antes dele só havia `expect(src).toContain(...)`, que afirma CAMINHO — a variante 3
 * de `teste-que-nao-exercita.md`, a que o dono do produto apontou.
 *
 * ── O QUE ELE ALCANÇA ─────────────────────────────────────────────────────────────────────
 *
 * A CADEIA INTEIRA, com as peças REAIS e nenhuma reimplementada:
 *   `useAutorizacaoDoDesconto` (o estado e o reset) → `estadoDoDesconto` (os três estados)
 *   → `<AutorizacaoDoDesconto>` (o Alert e o Checkbox) → `bloqueiaOSave` (a guarda).
 *
 * O harness abaixo monta só o que uma tela monta em volta delas: um campo de desconto e um
 * botão de salvar. Ele NÃO decide nada — quem decide é a cadeia. Essa distinção é o que
 * separa este arquivo do portão que eu já escrevi errado uma vez nesta campanha, quando o caso
 * replicou a lógica CORRIGIDA e passou verde com o defeito presente.
 *
 * ── O QUE ELE NÃO ALCANÇA, dito por extenso ───────────────────────────────────────────────
 *
 * Que cada PÁGINA liga a cadeia. Isso continua sendo afirmação de caminho, e está no bloco
 * final — com a diferença de que agora o efeito está medido aqui ao lado, e o que falta provar
 * é só a ligação. É o caso-limite que a própria regra admite: *"a regra não proíbe afirmar
 * caminho; proíbe afirmar caminho quando existe efeito mensurável e ele foi deixado de fora."*
 *
 * ── POR QUE `createRoot` E NÃO `@testing-library/react` ───────────────────────────────────
 *
 * A primeira versão deste arquivo usou `render`/`screen`/`userEvent`, e a suíte **FALHOU AO
 * CARREGAR**: `Cannot find module '@testing-library/dom'` — o pacote está em `package.json`
 * como dependência de `@testing-library/react`, e não está em `node_modules`. É por isso que
 * TODOS os 19 testes de componente deste repositório usam `createRoot` + `act`: o atalho não
 * existe aqui.
 *
 * Fica registrado porque o modo de falha é o pior possível — `Tests: 0 total` com
 * `Test Suites: 1 failed`. A linha que eu confiro é `Test Suites`, e não `Tests: N passed`,
 * que é a aparição 6 de `portao-que-nao-alcanca.md` e já me custou um commit vermelho nesta
 * campanha. Instalar o pacote faltante seria mexer no `package-lock.json` numa rodada de
 * teste, e não foi autorizado.
 */

import React, { useState } from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  AVISO_DE_SAVE_BLOQUEADO,
  ROTULO_DA_AUTORIZACAO,
  bloqueiaOSave,
  estadoDoDesconto,
} from '@/utils/limite-de-desconto'
import {
  AutorizacaoDoDesconto,
  useAutorizacaoDoDesconto,
  type ModoDeAbsorcao,
} from '@/page-parts/shared/autorizacao-do-desconto.component'

const raiz = join(__dirname, '..', '..')
const ler = (p: string) => readFileSync(join(raiz, p), 'utf-8')

/**
 * O limite e o descoberto são os MEDIDOS no portão do motor
 * (`a-trava-do-desconto-vira-autorizacao.test.ts`): entrada de referência rb 100.000,
 * cp 40.000, dop 10%, comissão 5%, lucro 10%, ICMS 17% + PIS/COFINS 9,25%.
 */
const LIMITE_PCT = 32.2033898
const DESCOBERTO_PROPORCIONAL = 5_750

/**
 * O harness. Ele é PROPOSITALMENTE burro: o único lugar onde há decisão é a cadeia real.
 *
 * O desconto entra por um `<input>` de verdade para que o caso 4 seja o que o usuário faz —
 * digitar outro número — e não uma chamada a um setter.
 */
function TelaDeDesconto(props: {
  nomeDoDocumento: string
  modo: ModoDeAbsorcao
  descontoInicialPct: number
  limitePct?: number | null
  limiteIncompleto?: readonly string[]
  descoberto?: number
  onSalvou: () => void
}) {
  const [descontoPct, setDescontoPct] = useState(props.descontoInicialPct)
  const [aviso, setAviso] = useState<string | null>(null)
  const limitePct = props.limitePct === undefined ? LIMITE_PCT : props.limitePct

  const { autorizado, setAutorizado } = useAutorizacaoDoDesconto(descontoPct)
  const estado = estadoDoDesconto({
    descontoFracao: descontoPct / 100,
    descontoMaximoFracao: limitePct == null ? null : limitePct / 100,
    autorizado,
  })

  return (
    <div>
      <label htmlFor="desc">Desconto (%)</label>
      <input
        id="desc"
        value={String(descontoPct)}
        onChange={(e) => { setAviso(null); setDescontoPct(Number(e.target.value) || 0) }}
      />
      <AutorizacaoDoDesconto
        estado={estado}
        descontoFracao={descontoPct / 100}
        limiteFracao={limitePct == null ? null : limitePct / 100}
        limiteIncompleto={props.limiteIncompleto}
        descoberto={props.descoberto ?? DESCOBERTO_PROPORCIONAL}
        modo={props.modo}
        nomeDoDocumento={props.nomeDoDocumento}
        autorizado={autorizado}
        onAutorizadoChange={setAutorizado}
      />
      <button
        type="button"
        onClick={() => {
          // As MESMAS três linhas dos três handlers, e a função é a real.
          if (bloqueiaOSave(estado)) { setAviso(AVISO_DE_SAVE_BLOQUEADO); return }
          props.onSalvou()
        }}
      >
        Salvar
      </button>
      {aviso && <div role="status">{aviso}</div>}
    </div>
  )
}

/** As três telas, com o que distingue cada uma: o nome do documento e o modo vigente. */
const TELAS: ReadonlyArray<{ tela: string; nomeDoDocumento: string; modo: ModoDeAbsorcao }> = [
  { tela: 'orçamento', nomeDoDocumento: 'esta venda', modo: 'PROPORTIONAL' },
  { tela: 'pedido', nomeDoDocumento: 'este pedido', modo: 'SELLER_REDUCTION' },
  { tela: 'venda (balcão)', nomeDoDocumento: 'esta venda', modo: 'PROFIT_REDUCTION' },
]

// ─────────────────────────── O instrumento, no idioma do repositório ───────────────────────

let atual: { container: HTMLElement; unmount: () => void } | null = null

function montarTela(props: React.ComponentProps<typeof TelaDeDesconto>) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(<TelaDeDesconto {...props} />) })
  atual = { container, unmount: () => { act(() => root.unmount()); container.remove() } }
  return container
}

afterEach(() => { atual?.unmount(); atual = null; document.body.innerHTML = '' })

/** O Alert do antd expõe `role="alert"`. `null` quando o bloco não está na tela. */
const alerta = (c: HTMLElement) => c.querySelector('[role="alert"]') as HTMLElement | null

/** O Checkbox do antd renderiza um `input[type=checkbox]` de verdade — é nele que se clica. */
const caixa = (c: HTMLElement) => c.querySelector('input[type="checkbox"]') as HTMLInputElement | null

const botaoSalvar = (c: HTMLElement) => {
  const b = Array.from(c.querySelectorAll('button')).find((x) => (x.textContent || '').trim() === 'Salvar')
  expect(b).toBeTruthy() // sem a guarda, um rótulo errado faria o caso passar sem clicar em nada
  return b as HTMLButtonElement
}

const clicar = (el: HTMLElement) => {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
}

/** O aviso do save bloqueado, quando existe. */
const aviso = (c: HTMLElement) => c.querySelector('[role="status"]') as HTMLElement | null

/**
 * Digita um novo percentual no campo. O `value` é setado pelo descriptor nativo porque o React
 * sobrescreve o setter do input controlado — sem isso o `onChange` não dispara e o caso 4
 * passaria verde sem ter mudado nada, que é `teste-que-nao-exercita.md` na forma mais direta.
 */
function digitarDesconto(c: HTMLElement, valor: string) {
  const input = c.querySelector('#desc') as HTMLInputElement
  expect(input).toBeTruthy()
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, valor)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

for (const { tela, nomeDoDocumento, modo } of TELAS) {
  describe(`A TELA DE ${tela.toUpperCase()}`, () => {
    const montar = (
      descontoInicialPct: number,
      extra: Partial<React.ComponentProps<typeof TelaDeDesconto>> = {},
    ) => {
      const onSalvou = jest.fn()
      const c = montarTela({
        nomeDoDocumento,
        modo,
        descontoInicialPct,
        onSalvou,
        ...extra,
      } as React.ComponentProps<typeof TelaDeDesconto>)
      return { onSalvou, c }
    }

    // ───────────────────────────────── CASO 1 ─────────────────────────────────
    it('1 · desconto ABAIXO do limite: nenhum Alert, nenhum Checkbox, e o save PASSA', () => {
      const { onSalvou, c } = montar(20)
      expect(alerta(c)).toBeNull()
      expect(caixa(c)).toBeNull()
      clicar(botaoSalvar(c))
      expect(onSalvou).toHaveBeenCalledTimes(1)
      expect(aviso(c)).toBeNull()
    })

    it('1b · desconto IGUAL ao limite ainda é verde — o limite é alcançável, não proibido', () => {
      const { onSalvou, c } = montar(LIMITE_PCT)
      expect(alerta(c)).toBeNull()
      clicar(botaoSalvar(c))
      expect(onSalvou).toHaveBeenCalledTimes(1)
    })

    // ───────────────────────────────── CASO 2 ─────────────────────────────────
    it('2 · ACIMA do limite sem o clique: Alert com os dois números, Checkbox DESMARCADO, save TRAVA', () => {
      const { onSalvou, c } = montar(40)

      // O Alert apareceu, e o texto nomeia o DESCONTO e o LIMITE. Afirmar só que ele
      // apareceu deixaria passar uma mensagem que não diz qual é o limite.
      const a = alerta(c)
      expect(a).not.toBeNull()
      expect(a!.textContent).toContain('40,00%')
      expect(a!.textContent).toContain('32,20%')

      // O Checkbox existe e começa DESMARCADO. "Existe" sozinho passaria com ele marcado,
      // que é exatamente o defeito que tornaria a autorização automática.
      const k = caixa(c)
      expect(k).not.toBeNull()
      expect(k!.checked).toBe(false)

      clicar(botaoSalvar(c))
      expect(onSalvou).not.toHaveBeenCalled()
      expect(aviso(c)!.textContent).toBe(AVISO_DE_SAVE_BLOQUEADO)
    })

    it('2b · o rótulo do Checkbox é o LITERAL da VII.2, e o descoberto está à vista', () => {
      const { c } = montar(40)
      const t = alerta(c)!.textContent!
      expect(t).toContain(ROTULO_DA_AUTORIZACAO)
      // R$ 5.750,00 — e no modo congelado a VII.5 manda dizer que congelar o AUMENTA.
      expect(t).toContain('5.750,00')
      if (modo === 'PROPORTIONAL') {
        expect(t).not.toContain('Congelar AUMENTA')
      } else {
        expect(t).toContain('Congelar AUMENTA')
      }
    })

    // ───────────────────────────────── CASO 3 ─────────────────────────────────
    it('3 · ACIMA do limite COM o clique: o save AVANÇA, em lucro zero', () => {
      const { onSalvou, c } = montar(40)
      clicar(caixa(c)!)
      expect(caixa(c)!.checked).toBe(true)
      // O Alert muda de amarelo para vermelho autorizado — o título diz isso.
      expect(alerta(c)!.textContent).toContain('Desconto autorizado')
      clicar(botaoSalvar(c))
      expect(onSalvou).toHaveBeenCalledTimes(1)
      expect(aviso(c)).toBeNull()
    })

    // ───────────────────────────────── CASO 4 ─────────────────────────────────
    it('4 · >>> AUTORIZADO, e o usuário MUDA o desconto: a autorização RESETA e o save VOLTA A TRAVAR <<<', () => {
      const { onSalvou, c } = montar(40)

      clicar(caixa(c)!)
      expect(caixa(c)!.checked).toBe(true)
      clicar(botaoSalvar(c))
      expect(onSalvou).toHaveBeenCalledTimes(1)

      // O usuário digita OUTRO número, ainda acima do limite. Autorizar 40% não é
      // autorizar 60%: a mensagem nomeia o percentual, e ela acabou de mudar.
      digitarDesconto(c, '60')

      expect(alerta(c)!.textContent).toContain('60,00%')
      expect(caixa(c)!.checked).toBe(false)

      clicar(botaoSalvar(c))
      // Continua UMA: o save do novo percentual NÃO passou.
      expect(onSalvou).toHaveBeenCalledTimes(1)
      expect(aviso(c)!.textContent).toBe(AVISO_DE_SAVE_BLOQUEADO)
    })

    it('4b · o reset vale também DESCENDO para dentro do limite — e aí não há bloco nenhum', () => {
      const { onSalvou, c } = montar(40)
      clicar(caixa(c)!)
      digitarDesconto(c, '10')
      expect(alerta(c)).toBeNull()
      expect(caixa(c)).toBeNull()
      clicar(botaoSalvar(c))
      expect(onSalvou).toHaveBeenCalledTimes(1)
    })

    // ─────────────────────── O LIMITE NÃO CALCULÁVEL E O INCOMPLETO ───────────────────────
    it('5 · limite `null` (não calculável): nenhum bloco, e o save passa — ausência não é zero', () => {
      const { onSalvou, c } = montar(90, { limitePct: null })
      expect(alerta(c)).toBeNull()
      expect(caixa(c)).toBeNull()
      clicar(botaoSalvar(c))
      expect(onSalvou).toHaveBeenCalledTimes(1)
    })

    it('6 · limite INCOMPLETO: o Alert nomeia o tributo que ficou de fora e diz que está frouxo', () => {
      const { c } = montar(40, { limiteIncompleto: ['ICMS', 'IBS'] })
      const t = alerta(c)!.textContent!
      expect(t).toContain('ICMS, IBS')
      expect(t).toContain('mais frouxo que o real')
    })

    it('7 · descoberto ABAIXO de meio centavo não vira linha — `R$ 0,00` afirmaria descoberto', () => {
      const { c } = montar(40, { descoberto: 0 })
      expect(alerta(c)!.textContent).not.toContain('Descoberto')
    })
  })
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// A LIGAÇÃO NAS TRÊS PÁGINAS — afirmação de CAMINHO, e é só o que falta provar
// ══════════════════════════════════════════════════════════════════════════════════════════
//
// O efeito está medido acima, com as peças reais. O que estes casos afirmam é que cada página
// usa ESSAS peças, em vez de ter a sua. É o que pegaria uma quarta cópia nascendo — foi
// exatamente assim que a cópia de `pedidos` divergiu sem nada falhar.
describe('AS TRÊS PÁGINAS LIGAM A CADEIA — e nenhuma tem cópia própria', () => {
  const PAGINAS = [
    'pages/orcamentos/index.tsx',
    'pages/pedidos/index.tsx',
    'pages/vendas/index.tsx',
  ] as const

  for (const pagina of PAGINAS) {
    it(`${pagina} monta <AutorizacaoDoDesconto>, usa o hook e a guarda`, () => {
      const src = ler(pagina)
      expect(src).toContain('<AutorizacaoDoDesconto')
      expect(src).toContain('useAutorizacaoDoDesconto(')
      expect(src).toContain('bloqueiaOSave(')
    })

    it(`${pagina} NÃO tem cópia própria do Alert, do Checkbox nem da mensagem`, () => {
      const src = ler(pagina)
      // `ROTULO_DA_AUTORIZACAO` e `mensagemDoLimite` só podem ser lidos pelo componente.
      expect(src).not.toContain('ROTULO_DA_AUTORIZACAO')
      expect(src).not.toContain('mensagemDoLimite')
      // E nenhum reset solto: o reset é do hook, num lugar só.
      expect(src).not.toMatch(/setDesconto[A-Za-z]*\(false\)/)
    })
  }
})
