/**
 * O RÓTULO DE IMPOSTO NÃO NOMEIA O MEI.
 *
 * Decisão do PO, 05/10/2026: o MEI NUNCA está na categoria de imposto. O DAS do MEI é
 * DESPESA FIXA, e é lá que ele está lançado (`expense-setup-blocks.ts:116,274`, com
 * `expense_group: 'DESPESA_FIXA'`). Pôr "MEI" no rótulo da linha de Impostos afirma um
 * enquadramento que o próprio cadastro contradiz.
 *
 * >>> POR QUE ESTE ARQUIVO EXISTE, e por que ele RENDERIZA <<<
 *
 * A primeira metade da correção colapsou o SEGUNDO ramo do ternário das telas
 * (`: isMei ? 'Impostos (MEI — DAS fixo)' : 'Impostos'`) e foi entregue SEM caso, por acordo.
 * Ela não resolveu o problema: em tenant MEI o PRIMEIRO ramo vencia, porque
 * `calc-tax-preview.ts` devolvia `label = 'MEI'` → `calcBase.taxLabel = 'MEI'` →
 * `Impostos (${calcBase.taxLabel})`. A tela seguiu mostrando "Impostos (MEI)", com o segundo
 * ramo inalcançável.
 *
 * É `teste-que-nao-exercita.md` na forma mais direta: a correção foi feita no ramo que o caso
 * de MEI nunca percorre. Um caso que afirmasse `taxLabel` — o INTERMEDIÁRIO — também passaria
 * sem dizer o que o usuário lê. Por isso aqui se afirma o TEXTO DA CÉLULA no DOM, e a cadeia
 * inteira roda de verdade: `fetchTaxPreview` → `buildCalcBase` → ternário → `<td>`.
 *
 * >>> O QUE O PAR DISTINGUE <<<
 *
 * Os quatro regimes no mesmo `it.each`, porque afirmar só o MEI não distinguiria "o MEI perdeu
 * o rótulo" de "TODO regime perdeu o rótulo" — e apagar o nome do Simples ou do Lucro Real da
 * linha seria o erro espelhado.
 */

import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ProductPrice } from '@/page-parts/products/product-price.component'
import { fetchTaxPreview } from '@/utils/calc-tax-preview'
import { buildCalcBase } from '@/utils/build-calc-base'

// ── o banco, respondendo por TABELA ────────────────────────────────────────────────────────
//
// `tax_regime` é trocado por caso. `simples_nacional_brackets` volta VAZIO de propósito: sem
// faixa o ramo do Simples cai em `buildResult(0, 0, 'Simples Nacional', false)`, que é o label
// que este arquivo afirma. Lucro Real e Lucro Presumido devolvem o label por literal, sem
// depender de query.
let REGIME = 'MEI'

jest.mock('@/supabase/client', () => ({
  supabase: {
    from: (tabela: string) => {
      const resposta = tabela === 'tenant_settings'
        ? { data: { tenant_id: 't1', tax_regime: REGIME, calc_type: 'INDUSTRIALIZACAO', state_code: 'SP' } }
        : tabela === 'brazilian_states'
          ? { data: [{ code: 'SP', icms_internal_rate: 18 }] }
          : { data: null }
      const encadeia: any = {
        select: () => encadeia,
        eq: () => encadeia,
        order: () => ({ ...resposta, data: tabela === 'simples_nacional_brackets' ? [] : resposta.data }),
        single: () => resposta,
        maybeSingle: () => resposta,
        then: (fn: (v: unknown) => unknown) => Promise.resolve(resposta).then(fn),
      }
      return encadeia
    },
  },
}))

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false, media: query, onchange: null as any,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }),
})
jest.mock('@/contexts/device.context', () => ({ useDevice: () => ({ isMobile: false }) }))

function renderIn(node: React.ReactElement) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(node) })
  return { container, unmount: () => { act(() => root.unmount()); container.remove() } }
}

const EXPENSE = {
  admin_labor_percent: 7, fixed_expense_percent: 10, variable_expense_percent: 3,
  financial_expense_percent: 2, financial_commitments_percent: 0,
}

const CUSTO = 1_000
const FORM: any = { getFieldValue: (k: string) => (k === 'quantity' ? 1 : 'UN') }

function props(calcBase: any, regime: string) {
  const preco = 2_500
  return {
    calcBase,
    productPriceInfo: {
      productCost: CUSTO, totalProductPrice: preco,
      productProfitPercent: 5, productProfitPrice: preco * 0.05,
      salesCommissionPercent: 5, salesCommissionPrice: preco * 0.05,
      rtReservePercent: 0, taxesPrice: 0,
    } as any,
    currentUser: { taxableRegime: regime, calcType: 'RESALE' } as any,
    productForm: FORM,
    handleChangePrecificationInputs: () => {},
    icmsPct: 0, pisCofinsLRPct: 0,
    isResaleProduct: true,
  } as any
}

/** Os rótulos do `tbody`, na ordem — é a coluna "Despesa" que o usuário lê. */
const rotulos = (c: HTMLElement): string[] =>
  Array.from(c.querySelectorAll('tbody tr'))
    .map((tr) => (tr.querySelectorAll('td')[1]?.textContent || '').trim())
    .filter((t) => t.length > 0)

/** A linha de imposto AGREGADO — a que o `taxLabel` nomeia. */
const linhaDeImposto = (c: HTMLElement): string | undefined =>
  rotulos(c).find((r) => r === 'Impostos' || /^Impostos \(/.test(r))

// ═════════════════════════════════════════════════════════════════════════════════════════

type Caso = [regime: string, labelDaFonte: string, celula: string | null]

const CASOS: Caso[] = [
  // O MEI é o caso da correção: label VAZIO na fonte, e a célula sem parêntese.
  ['MEI', '', 'Impostos'],
  // Os outros três MANTÊM o nome. Sem eles, apagar o rótulo de todo mundo passaria verde.
  ['SIMPLES_NACIONAL', 'Simples Nacional', 'Impostos (Simples Nacional)'],
  // Em LR/LP a tela não renderiza a linha agregada (ela abre IRPJ/CSLL em linhas próprias),
  // então aqui o que se afirma é o label da FONTE mais a AUSÊNCIA da linha agregada.
  ['LUCRO_REAL', 'Lucro Real', null],
  ['LUCRO_PRESUMIDO', 'Lucro Presumido', null],
]

describe('o rótulo da linha de imposto, por regime', () => {
  it.each(CASOS)('%s → fonte %p, célula %p', async (regime, labelDaFonte, celula) => {
    REGIME = regime
    const preview = await fetchTaxPreview('t1')
    const calcBase = buildCalcBase(EXPENSE, preview)

    /*
      >>> A ORDEM DAS ASSERÇÕES É PARTE DO CASO, e a mutação a decidiu <<<

      A primeira versão afirmava a FONTE antes do DOM. Sob a mutação (devolver `'MEI'` ao 3º
      argumento de `buildResult`) o caso ficava vermelho em `preview.taxLabel`, ABORTAVA ali, e
      a asserção da célula nunca rodava — o portão morria no INTERMEDIÁRIO, que é exatamente o
      que o comando proibiu afirmar sozinho.

      O DOM vem primeiro. Agora a mutação quebra no texto que o usuário lê.
    */
    const r = renderIn(<ProductPrice {...props(calcBase, regime)} />)
    try {
      expect(linhaDeImposto(r.container)).toBe(celula ?? undefined)
      // E em NENHUM regime a palavra MEI aparece na coluna de rótulos.
      for (const rot of rotulos(r.container)) expect(rot).not.toMatch(/MEI/)
    } finally {
      r.unmount()
    }

    // Só DEPOIS a fonte, que é de onde o texto saiu.
    expect(preview.taxLabel).toBe(labelDaFonte)
    expect(preview.regimeLabel).toBe(labelDaFonte)
    // `isMei` NÃO muda com o rótulo: é ele que zera a alíquota e trava o campo.
    expect(preview.isMei).toBe(regime === 'MEI')
    expect(calcBase.taxLabel).toBe(labelDaFonte)
  })

  it('>>> O PAR QUE FALSIFICA: com o label de volta, a célula vira "Impostos (MEI)" <<<', async () => {
    /*
      Reverter o §2 é devolver `'MEI'` ao 3º argumento de `buildResult`. O efeito disso é
      `calcBase.taxLabel = 'MEI'`, e é esse estado que este caso monta À MÃO para mostrar o que
      a correção impede — sem ele, o caso de cima afirmaria 'Impostos' sem provar que o
      PRIMEIRO ramo do ternário é quem decide.

      Ele é o contraexemplo, não a regressão: a regressão de verdade é o `it.each`, que lê a
      fonte.
    */
    REGIME = 'MEI'
    const preview = await fetchTaxPreview('t1')
    const comoAntes = { ...buildCalcBase(EXPENSE, preview), taxLabel: 'MEI' }

    const r = renderIn(<ProductPrice {...props(comoAntes, 'MEI')} />)
    try {
      expect(linhaDeImposto(r.container)).toBe('Impostos (MEI)')
    } finally {
      r.unmount()
    }

    // E com o label que a FONTE devolve hoje, a célula é 'Impostos'. O `calcBase` NÃO é
    // retocado aqui — ele vem inteiro de `fetchTaxPreview`, e por isso esta asserção também
    // fica vermelha sob a mutação, no DOM e não no intermediário.
    const agora = buildCalcBase(EXPENSE, preview)
    const r2 = renderIn(<ProductPrice {...props(agora, 'MEI')} />)
    try {
      expect(linhaDeImposto(r2.container)).toBe('Impostos')
    } finally {
      r2.unmount()
    }
    expect(agora.taxLabel).toBe('')
  })

  it('o ALERTA do MEI continua, e ele explica o ZERO — não a categoria', () => {
    // O §3 do comando: o alerta não é rótulo de categoria. Se ele desaparecesse junto com o
    // rótulo, a linha zerada ficaria sem explicação nenhuma.
    REGIME = 'MEI'
    const calcBase = buildCalcBase(EXPENSE, {
      effectiveTaxPct: 0, taxLabel: '', isMei: true,
      taxesPercent: 0, taxableRegimePercent: 0, regimeLabel: '',
    })
    const r = renderIn(<ProductPrice {...props(calcBase, 'MEI')} />)
    try {
      const txt = r.container.textContent || ''
      expect(txt).toContain('Impostos não são calculados por produto')
      expect(txt).toContain('O DAS mensal é fixo')
    } finally {
      r.unmount()
    }
  })
})
