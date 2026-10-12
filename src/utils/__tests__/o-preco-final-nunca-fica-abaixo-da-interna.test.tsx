/**
 * O PREÇO FINAL NUNCA FICA ABAIXO DA OPERAÇÃO INTERNA — a invariante que faltava.
 *
 * Passo ZERO do XI-3, exigido pelo PO em 11/10/2026, e feito ANTES da correção de propósito.
 *
 * ══ POR QUE ELE NASCE ANTES, E POR QUE ISSO É O PONTO ════════════════════════════════════
 *
 * Formulação do dono do produto, registrada como está:
 *
 *   > O defeito que você achou só apareceu porque você MEDIU A TELA. Isso não é aceitável
 *   > como rede: a próxima pessoa não mede.
 *
 * O §0 do XI-3 encontrou, medindo o DOM à mão, que admitir o RET em `REGIMES_COM_MATRIZ`
 * fazia a tela mostrar `Total Operação Interna = R$ 2.500,00` e
 * `Preço Final com Impostos = R$ 1.498,28` — o final ABAIXO da interna. Nenhum caso e nenhum
 * alerta vigiavam isso.
 *
 * `portao-que-nao-alcanca.md` pergunta *"o que faz este portão ficar vermelho?"*. Para esta
 * identidade a resposta era **nada**: a invariante da soma das linhas tem caso E alerta na
 * tela; esta não tinha nenhum dos dois.
 *
 * ══ A IDENTIDADE, E POR QUE ELA NÃO É PREFERÊNCIA ════════════════════════════════════════
 *
 * O preço final é a operação interna MAIS os tributos por fora — `P ÷ (1 − c)`, R8 da
 * `cascata-lucro-real.md`. Com `c ∈ [0, 1)` o divisor nunca passa de 1, logo
 * `final >= interna` **sempre**, em qualquer regime, com qualquer alíquota. Um final menor não
 * é "preço baixo": é sinal de que as duas linhas do resumo estão lendo PREÇOS DIFERENTES, e
 * aí nenhuma das duas serve.
 *
 * ══ ESTE ARQUIVO PASSA VERDE HOJE, E É ISSO QUE O TORNA ÚTIL ═════════════════════════════
 *
 * Ele é o estado CORRETO de hoje, fixado antes de a correção entrar. É assim que ele vira
 * rede em vez de descrição: quando o patch do XI-3 for reaplicado sem a saída 3, o caso do
 * RET fica VERMELHO — e isso foi medido, está no relatório da rodada. Um portão que só
 * nascesse depois da correção não provaria nada sobre ela.
 */

import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { readFileSync } from 'fs'
import { join } from 'path'
import { ProductPrice } from '@/page-parts/products/product-price.component'

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
    icmsPct: 0.18,
    pisCofinsLRPct: 0.0925,
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

/** O valor em R$ da linha cujo rótulo é `rotulo`, lido pelo RÓTULO e não por posição. */
function valorDaLinha(c: HTMLElement, rotulo: string): number | null {
  for (const div of Array.from(c.querySelectorAll('div'))) {
    const spans = Array.from(div.querySelectorAll(':scope > span'))
    if (spans.length !== 2) continue
    if ((spans[0].textContent || '').trim() !== rotulo) continue
    const cru = (spans[1].textContent || '').trim()
    const n = Number(cru.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'))
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** A tolerância é a MESMA da invariante da soma das linhas: um centavo. */
const TOLERANCIA = 0.01

/**
 * Afirma a identidade num regime, e devolve o par medido.
 *
 * >>> `null` NÃO PASSA DE GRAÇA <<<
 * Nos regimes sem bloco de resumo (Simples, MEI) as duas linhas são ausentes, e um caso que
 * só comparasse números leria dois `null` e passaria sem exercitar nada
 * (`teste-que-nao-exercita.md`). Por isso a função devolve o par e cada caso afirma
 * explicitamente se esperava presença ou ausência.
 */
function medeOResumo(regime: string, over: Record<string, unknown> = {}) {
  const r = renderRegime(regime, over)
  try {
    const interna = valorDaLinha(r.container, 'Total Operação Interna')
    const final = valorDaLinha(r.container, 'Preço Final com Impostos')
    const alerta = (r.container.textContent || '').includes('ficou ABAIXO da')
    return { interna, final, alerta }
  } finally { r.unmount() }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// UM CASO POR REGIME — OS SEIS
// ═══════════════════════════════════════════════════════════════════════════════════════════

describe('a identidade `final >= interna`, regime por regime', () => {
  it('>>> LUCRO_REAL: o final é MAIOR que a interna, e o alerta NÃO aparece <<<', () => {
    // O modelo de referência. Com IBS 9% o `c` é apurado, então o final sobe de verdade — um
    // caso com alíquota zero não distinguiria `final > interna` de `final === interna`.
    const m = medeOResumo('LUCRO_REAL', { ibsPct: 9 })
    expect(m.interna).not.toBeNull()
    expect(m.final).not.toBeNull()
    expect(m.final!).toBeGreaterThan(m.interna!)
    expect(m.final! + TOLERANCIA).toBeGreaterThanOrEqual(m.interna!)
    expect(m.alerta).toBe(false)
  })

  it('>>> LUCRO_PRESUMIDO: o final é MAIOR que a interna, e o alerta NÃO aparece <<<', () => {
    const m = medeOResumo('LUCRO_PRESUMIDO', { ibsPct: 9 })
    expect(m.interna).not.toBeNull()
    expect(m.final).not.toBeNull()
    expect(m.final!).toBeGreaterThan(m.interna!)
    expect(m.alerta).toBe(false)
  })

  it('>>> LUCRO_PRESUMIDO_RET: o final é MAIOR que a interna, e o alerta NÃO aparece <<<', () => {
    // >>> É ESTE O CASO QUE O XI-3 SEM A SAÍDA 3 DERRUBA <<<
    // Medido em 11/10/2026 com o patch do XI-3 aplicado sem corrigir `baseForSalePrice`:
    // interna R$ 2.500,00 e final R$ 1.498,28 — o final 40% abaixo da interna. Este caso é a
    // rede daquele defeito, e ele existia antes da correção para poder ser rede.
    const m = medeOResumo('LUCRO_PRESUMIDO_RET', { ibsPct: 9 })
    expect(m.interna).not.toBeNull()
    expect(m.final).not.toBeNull()
    expect(m.final!).toBeGreaterThan(m.interna!)
    expect(m.alerta).toBe(false)
  })

  it('>>> SIMPLES_HIBRIDO: o final é MAIOR que a interna, e o alerta NÃO aparece <<<', () => {
    const m = medeOResumo('SIMPLES_HIBRIDO', { ibsPct: 9 })
    expect(m.interna).not.toBeNull()
    expect(m.final).not.toBeNull()
    expect(m.final!).toBeGreaterThan(m.interna!)
    expect(m.alerta).toBe(false)
  })

  it('SIMPLES_NACIONAL: não há bloco de resumo — e a AUSÊNCIA é afirmada, não suposta', () => {
    // A identidade não tem o que vigiar aqui, e o caso diz isso explicitamente em vez de
    // comparar dois `null` e passar por acidente.
    const m = medeOResumo('SIMPLES_NACIONAL', { ibsPct: 9, cbsPct: 9, isPct: 9, ipiPct: 9 })
    expect(m.interna).toBeNull()
    expect(m.final).toBeNull()
    expect(m.alerta).toBe(false)
  })

  it('MEI: não há bloco de resumo — e a AUSÊNCIA é afirmada, não suposta', () => {
    const m = medeOResumo('MEI', { ibsPct: 9, cbsPct: 9, isPct: 9, ipiPct: 9 })
    expect(m.interna).toBeNull()
    expect(m.final).toBeNull()
    expect(m.alerta).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// O ALERTA EXISTE NA TELA, E É IRMÃO DO DA SOMA DAS LINHAS
// ═══════════════════════════════════════════════════════════════════════════════════════════

describe('a invariante VISÍVEL', () => {
  const src = readFileSync(
    join(__dirname, '..', '..', 'page-parts', 'products', 'product-price.component.tsx'),
    'utf-8',
  )

  it('>>> o alerta existe, e diz que os números NÃO PODEM SER USADOS <<<', () => {
    // A mesma frase da conferência da soma das linhas, de propósito: quem vê uma reconhece a
    // outra. `decomposicao-na-tela.md` — um sinal que não interrompe ninguém é
    // `portao-que-nao-alcanca.md` em forma de interface.
    expect(src).toContain('ficou ABAIXO da')
    expect(src).toContain('Os números desta precificação não podem ser usados.')
  })

  it('a grandeza é derivada em UM lugar, com a mesma tolerância da invariante irmã', () => {
    // Uma segunda expressão da mesma comparação seria `copia-divergente.md`: bastaria mudar a
    // tolerância num lado para o alerta e o portão discordarem.
    expect(src).toContain('const precoFinalAbaixoDaInterna = finalPriceWithTaxes + INVARIANTE_TOLERANCIA < baseForSalePrice')
    expect(src).toContain('const INVARIANTE_TOLERANCIA = 0.01')
    // a irmã, que já usava 0.01
    expect(src).toContain('Math.abs(linhas.residual) >= 0.01')
  })

  it('e o rótulo do preço final fica VERMELHO quando a identidade quebra', () => {
    // Sem isto o alerta apareceria embaixo e o número continuaria verde — duas afirmações
    // contrárias na mesma tela.
    expect(src).toContain("color: precoFinalAbaixoDaInterna ? '#fca5a5' : '#4ade80'")
  })
})
