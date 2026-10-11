/**
 * O RESUMO POR FORA — quais regimes o têm, e que o preço final SOMA o tributo.
 *
 * Comando do PO de 11/10/2026.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * >>> UM CASO DO COMANDO NÃO ESTÁ AQUI, E ISSO É DELIBERADO <<<
 *
 * O comando pedia: *"RET com IBS e CBS em zero: o resumo aparece e o preço final é IGUAL ao
 * Total Operação Interna"*. **Ele não está implementado, e por isso não é afirmado aqui.**
 *
 * Medido em 11/10/2026, antes de qualquer alteração: com alíquota ZERO o resumo **não aparece
 * em regime nenhum, nem no LUCRO_REAL**. Quem o suprime é o `totalInlineTax > 0` de
 * `hasInlineTaxes`, que não distingue regime. E o MESMO comando pede, no caso 5, que o
 * `LUCRO_REAL` apareça *"igual a hoje (regressão)"*.
 *
 * Os dois casos não cabem juntos: tirar o `> 0` faz o resumo nascer para TODO tenant de Lucro
 * Real de hoje — `ibs_active` e `cbs_active` são `false` em 100% dos cálculos de produção, logo
 * todos eles estão no caso "alíquota zero". Seria mudança no modelo de referência, decidida por
 * mim. `razao-longe-da-restricao.md`: restrição sem razão citada no ponto de declaração autoriza
 * **pergunta**, não remoção.
 *
 * O que ESTE arquivo afirma, no lugar daquele caso, é a SIMETRIA medida: com alíquota zero o
 * resumo está ausente no RET **e** no Lucro Real, pelo mesmo motivo. Se o dono do produto
 * decidir que ele deve aparecer com zero, a mudança é no `> 0` e vale para os dois — e é aquele
 * caso de simetria que fica vermelho, o que é exatamente o aviso que se quer.
 * ══════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── O QUE ELE ALCANÇA, E O QUE NÃO ───────────────────────────────────────────────────────
 *
 * Alcança a condição de render do bloco de RESUMO e o EFEITO NUMÉRICO dele: o caso central não
 * afirma que o bloco apareceu, afirma que `Preço Final com Impostos − Total Operação Interna`
 * é igual ao valor do IBS exibido. `teste-que-nao-exercita.md` manda preferir efeito a
 * passagem, e aqui o efeito existe e é mensurável na própria tela.
 *
 * NÃO alcança `_ivaApplies` (`:399`), que continua nomeando dois regimes e zerando `icmsPct` e
 * `pisCofinsPct` no RET. Isso está CERTO — o RET não tem esses dois em separado — e o comando
 * manda não tocar. Um caso abaixo afirma que ele continua como está, para que a próxima pessoa
 * não o "uniformize" junto com o resumo.
 */

import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'fs'
import { join } from 'path'
import { ProductPrice } from '@/page-parts/products/product-price.component'

// ── o banco de mentira, igual ao de `por-fora-por-regime.test.tsx` ─────────────────────────
let REGIME = 'LUCRO_REAL'

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
    matches: false,
    media: query,
    // `onchange: null` sem anotação infere `any` com `strictNullChecks: false` e sobe o
    // baseline do `tsc` em 1 (`TS7018`).
    onchange: null as ((e: any) => void) | null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }),
})
jest.mock('@/contexts/device.context', () => ({ useDevice: () => ({ isMobile: false }) }))

const FORM: any = { getFieldValue: (k: string) => (k === 'quantity' ? 1 : 'UN') }

function props(regime: string, over: Record<string, unknown> = {}) {
  const preco = 2_500
  return {
    calcBase: {
      adminLaborPct: 7, fixedExpensePct: 10, variableExpensePct: 3, financialExpensePct: 2,
      financialCommitmentsPct: 0, taxPct: 0, taxLabel: 'Impostos', isMei: regime === 'MEI',
    } as any,
    productPriceInfo: {
      productCost: 1_000, totalProductPrice: preco,
      productProfitPercent: 5, productProfitPrice: preco * 0.05,
      salesCommissionPercent: 5, salesCommissionPrice: preco * 0.05,
      rtReservePercent: 0, taxesPrice: 0,
    } as any,
    currentUser: { taxableRegime: regime, calcType: 'INDUSTRIALIZATION' } as any,
    productForm: FORM,
    handleChangePrecificationInputs: () => {},
    icmsPct: 0,
    pisCofinsLRPct: 0,
    isResaleProduct: false,
    ...over,
  } as any
}

function renderRegime(regime: string, over: Record<string, unknown> = {}) {
  REGIME = regime
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(<ProductPrice {...props(regime, over)} />) })
  return { container, unmount: () => { act(() => root.unmount()); container.remove() } }
}

/** `true` quando o bloco de resumo está na tela. As duas linhas que o definem. */
function temResumo(c: HTMLElement): boolean {
  const t = c.textContent || ''
  return t.includes('Total Operação Interna') && t.includes('Preço Final com Impostos')
}

/**
 * O valor em R$ da linha cujo rótulo é `rotulo`, dentro do bloco de resumo.
 *
 * Lê a linha pelo RÓTULO e não por posição: o bloco omite as linhas de tributo zerado, então
 * a ordem muda conforme o que foi preenchido, e um índice fixo leria a linha errada.
 */
function valorDaLinha(c: HTMLElement, rotulo: string): number | null {
  for (const div of Array.from(c.querySelectorAll('div'))) {
    const spans = Array.from(div.querySelectorAll(':scope > span'))
    if (spans.length !== 2) continue
    if ((spans[0].textContent || '').trim() !== rotulo) continue
    const cru = (spans[1].textContent || '').trim()
    // `R$ 2.724,69` → 2724.69
    const n = Number(cru.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  return null
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// O RESUMO, REGIME POR REGIME
// ═══════════════════════════════════════════════════════════════════════════════════════════

describe('o resumo por fora lê a tabela de regime, não uma lista de regimes', () => {
  it('>>> RET: o resumo APARECE, e a linha "Preço Final com Impostos" existe <<<', () => {
    // O defeito que esta rodada corrige. Antes da correção: o dono digitava o IBS, o valor era
    // calculado (`computeIvaDualOutside` é cego a regime) e este bloco não existia.
    // É o caso que a mutação M33 mata.
    const r = renderRegime('LUCRO_PRESUMIDO_RET', { ibsPct: 9 })
    try {
      expect(temResumo(r.container)).toBe(true)
      expect(r.container.textContent || '').toContain('Preço Final com Impostos')
    } finally { r.unmount() }
  })

  it('>>> RET com IBS preenchido: o preço final é MAIOR, e a diferença é o valor do IBS <<<', () => {
    // >>> ESTE É O CASO DE EFEITO, E ELE É A RAZÃO DA RODADA <<<
    // "Imposto que entra e não aparece no preço final some sem dizer para onde foi." Afirmar
    // que o bloco apareceu seria afirmar PASSAGEM; o que se afirma aqui é que o número que o
    // bloco publica FECHA — o preço final menos o total interno é exatamente o IBS exibido.
    const r = renderRegime('LUCRO_PRESUMIDO_RET', { ibsPct: 9 })
    try {
      const interno = valorDaLinha(r.container, 'Total Operação Interna')
      const ibs = valorDaLinha(r.container, '+ IBS')
      const final = valorDaLinha(r.container, 'Preço Final com Impostos')

      // sem isto o caso passaria verde com o bloco ausente, lendo três `null`
      expect(interno).not.toBeNull()
      expect(ibs).not.toBeNull()
      expect(final).not.toBeNull()

      expect(ibs!).toBeGreaterThan(0)
      expect(final!).toBeGreaterThan(interno!)
      // um centavo de tolerância: as três linhas são formatadas com duas casas
      expect(final! - interno!).toBeCloseTo(ibs!, 2)
    } finally { r.unmount() }
  })

  it('>>> SIMPLES_NACIONAL: o resumo NÃO aparece <<<', () => {
    // É o caso que a mutação M32 mata. A alíquota vai preenchida de propósito: com ela em
    // zero o `totalInlineTax > 0` já barraria o bloco, e o caso ficaria verde pelo motivo
    // errado — não distinguiria a tabela de regime de nada.
    const r = renderRegime('SIMPLES_NACIONAL', { ibsPct: 9, cbsPct: 9, isPct: 9, ipiPct: 9 })
    try {
      expect(temResumo(r.container)).toBe(false)
      expect(r.container.textContent || '').not.toContain('Preço Final com Impostos')
    } finally { r.unmount() }
  })

  it('>>> MEI: o resumo NÃO aparece <<<', () => {
    const r = renderRegime('MEI', { ibsPct: 9, cbsPct: 9, isPct: 9, ipiPct: 9 })
    try {
      expect(temResumo(r.container)).toBe(false)
      expect(r.container.textContent || '').not.toContain('Preço Final com Impostos')
    } finally { r.unmount() }
  })

  it('>>> LUCRO_REAL: aparece igual a hoje — a REGRESSÃO do modelo de referência <<<', () => {
    const r = renderRegime('LUCRO_REAL', { ibsPct: 9 })
    try {
      expect(temResumo(r.container)).toBe(true)
      const interno = valorDaLinha(r.container, 'Total Operação Interna')
      const ibs = valorDaLinha(r.container, '+ IBS')
      const final = valorDaLinha(r.container, 'Preço Final com Impostos')
      expect(interno).not.toBeNull()
      expect(final! - interno!).toBeCloseTo(ibs!, 2)
    } finally { r.unmount() }
  })

  it('o Híbrido continua tendo resumo — ele já tinha, e não podia perder', () => {
    // Ele estava na lista antiga de três regimes. A tabela também o tem (IBS · CBS · IS), e
    // este caso é o que pegaria uma tabela que o esquecesse.
    const r = renderRegime('SIMPLES_HIBRIDO', { ibsPct: 9 })
    try {
      expect(temResumo(r.container)).toBe(true)
    } finally { r.unmount() }
  })

  it('>>> A SIMETRIA DO ZERO: com alíquota zero o resumo está ausente no RET E no Lucro Real <<<', () => {
    // >>> É AQUI QUE A PENDÊNCIA DO CABEÇALHO MORA <<<
    // O comando pedia que o RET com zero MOSTRASSE o resumo. Não mostra, porque o
    // `totalInlineTax > 0` não distingue regime — e o Lucro Real, que é o modelo e não pode
    // mudar, também não mostra. Este caso afirma o par, não cada um: é ele que fica vermelho
    // no dia em que alguém tirar o `> 0`, obrigando a decisão a ser consciente em vez de
    // tratar o Lucro Real como efeito colateral.
    const ret = renderRegime('LUCRO_PRESUMIDO_RET')
    const retTem = temResumo(ret.container)
    ret.unmount()

    const real = renderRegime('LUCRO_REAL')
    const realTem = temResumo(real.container)
    real.unmount()

    expect(retTem).toBe(false)
    expect(realTem).toBe(false)
    expect(retTem).toBe(realTem)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// O QUE NÃO MUDOU
// ═══════════════════════════════════════════════════════════════════════════════════════════

describe('a condição não nomeia regime, e `_ivaApplies` ficou como estava', () => {
  const src = readFileSync(
    join(__dirname, '..', '..', 'page-parts', 'products', 'product-price.component.tsx'),
    'utf-8',
  )
  const programa = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

  it('>>> `hasInlineTaxes` lê a tabela e NÃO nomeia regime — é a mutação M33 <<<', () => {
    expect(programa).toContain(
      'const hasInlineTaxes = tributosPorForaDoRegime(currentUser?.taxableRegime).length > 0',
    )
    expect(programa).not.toContain(
      'const hasInlineTaxes = (isLucroReal || isLucroPresumed || isSimplesHibrido)',
    )
  })

  it('>>> `_ivaApplies` continua `isLucroReal || isLucroPresumed` — NÃO foi uniformizado <<<', () => {
    // O comando: *"`_ivaApplies` fica COMO ESTA. Ele zera icmsPct e pisCofinsPct no RET, e
    // isso está CERTO: o RET não tem esses dois em separado. Não toque."* A razão mora aqui,
    // no ponto de declaração, e não só no comando — `razao-longe-da-restricao.md`.
    expect(programa).toContain('const _ivaApplies = isLucroReal || isLucroPresumed\n')
    expect(programa).toContain('icmsPct: _ivaApplies ? icmsPct : 0,')
    expect(programa).toContain('pisCofinsPct: _ivaApplies ? pisCofinsLRPct : 0,')
  })

  it('a linha de base do rodapé NÃO foi tocada — ela não estava no comando', () => {
    // `:1027` ainda nomeia os três regimes. Fica registrado para que a ausência seja vista
    // como escolha e não como esquecimento: o comando dizia "uma coisa só".
    expect(programa).toContain(
      '{(isLucroReal || isLucroPresumed || isSimplesHibrido) && (terceirizadasTotal > 0 || totalInlineTax > 0) && (',
    )
  })
})
