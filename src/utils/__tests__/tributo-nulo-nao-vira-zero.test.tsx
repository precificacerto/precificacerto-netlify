/**
 * NULO NÃO É ZERO — o ICMS e o PIS/COFINS de Produtos (dono do produto, 10/11/2026). A função pura (`tributo-por-dentro-informado.ts`) e o
 * `ProductPrice` sozinho: com o tributo não informado no Lucro Real ou no Presumido, nenhum preço é emitido para gravar.
 * Os casos do `Content` inteiro (o salvar) estão em `atendimentos-ia-precificacao-do-orcamento-tela.test.tsx`.
 */
import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ProductPrice } from '@/page-parts/products/product-price.component'
import { FALTA_DO_ICMS, FALTA_DO_PIS_COFINS, doBanco, faltasDosTributosPorDentro, paraGravar } from '@/utils/tributo-por-dentro-informado'

let REGIME = 'LUCRO_REAL'
jest.mock('@/supabase/client', () => ({
  supabase: {
    from: (tabela: string) => {
      const resposta = tabela === 'tenant_settings'
        ? { data: { tenant_id: 't1', tax_regime: REGIME, calc_type: 'INDUSTRIALIZACAO', state_code: 'SP' } }
        : tabela === 'brazilian_states'
          ? { data: [{ code: 'SP', icms_internal_rate: 18 }] }
          : { data: null }
      const encadeia: Record<string, unknown> = {
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

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null as ((e: unknown) => void) | null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }),
})
jest.mock('@/contexts/device.context', () => ({ useDevice: () => ({ isMobile: false }) }))

const FORM = { getFieldValue: (k: string) => (k === 'quantity' ? 1 : 'UN') }

describe('a função: quando o tributo é exigido, e o que é "informado"', () => {
    const f = (taxableRegime: string, icmsPct: number | null, pisCofinsPct: number | null, segmento: 'INDUSTRIALIZACAO' | 'REVENDA' | 'SERVICO' = 'INDUSTRIALIZACAO') =>
        faltasDosTributosPorDentro({ taxableRegime, segmento, icmsPct, pisCofinsPct })
    it('Lucro Real e Presumido: nulo é falta, um de cada vez', () => {
        for (const r of ['LUCRO_REAL', 'LUCRO_PRESUMIDO']) {
            expect(f(r, null, 9.25)).toEqual([FALTA_DO_ICMS])
            expect(f(r, 17, null)).toEqual([FALTA_DO_PIS_COFINS])
            expect(f(r, null, null)).toEqual([FALTA_DO_ICMS, FALTA_DO_PIS_COFINS])
        }
    })
    it('zero informado NÃO é falta', () => {
        expect(f('LUCRO_REAL', 0, 0)).toEqual([])
        expect(f('LUCRO_PRESUMIDO', 0, 0)).toEqual([])
    })
    it('NaN é "não informado"', () => {
        expect(f('LUCRO_REAL', Number.NaN, 9.25)).toEqual([FALTA_DO_ICMS])
    })
    it('RET, Simples, Híbrido e MEI não exigem os dois campos', () => {
        for (const r of ['LUCRO_PRESUMIDO_RET', 'SIMPLES_NACIONAL', 'SIMPLES_HIBRIDO', 'MEI']) expect(f(r, null, null)).toEqual([])
    })
    it('no segmento de SERVIÇO o ICMS não existe (a matriz), e não é exigido; o PIS/COFINS é', () => {
        expect(f('LUCRO_REAL', null, null, 'SERVICO')).toEqual([FALTA_DO_PIS_COFINS])
    })
    it('o que vai para o banco e o que volta dele: nulo fica nulo, zero fica zero', () => {
        expect(paraGravar(null)).toBeNull()
        expect(paraGravar(undefined)).toBeNull()
        expect(paraGravar(Number.NaN)).toBeNull()
        expect(paraGravar(0)).toBe(0)
        expect(paraGravar(4.32)).toBe(4.32)
        expect(doBanco(null)).toBeNull()
        expect(doBanco(undefined)).toBeNull()
        expect(doBanco('')).toBeNull()
        expect(doBanco('0')).toBe(0)
        expect(doBanco('10.5')).toBe(10.5)
        expect(doBanco(17)).toBe(17)
    })
})

describe('o ProductPrice sozinho: sem o tributo informado, nenhum preço sai para gravar', () => {
    function monta(icmsPct: number | null, regime = 'LUCRO_REAL') {
        REGIME = regime
        const emitido = jest.fn(), naoFormado = jest.fn(), faltas = jest.fn()
        const c = document.createElement('div'); document.body.appendChild(c); const root = createRoot(c)
        const p = {
            calcBase: { adminLaborPct: 7, fixedExpensePct: 10, variableExpensePct: 3, financialExpensePct: 2, financialCommitmentsPct: 0, taxPct: 0, taxLabel: 'Impostos', isMei: false },
            productPriceInfo: { productCost: 1_000, totalProductPrice: 2_500, productProfitPercent: 5, productProfitPrice: 125, salesCommissionPercent: 5, salesCommissionPrice: 125, rtReservePercent: 0, taxesPrice: 0 },
            currentUser: { taxableRegime: regime, calcType: 'INDUSTRIALIZATION' }, productForm: FORM, handleChangePrecificationInputs: () => {},
            icmsPct, pisCofinsLRPct: 9.25, isResaleProduct: false,
            onFinalPriceWithTaxesChange: emitido, onPrecoNaoFormado: naoFormado, onFaltasDosTributosChange: faltas,
        } as unknown as React.ComponentProps<typeof ProductPrice>
        // eslint-disable-next-line testing-library/no-unnecessary-act -- a raiz do React 19 monta aqui, sem a testing-library (como os outros testes de tela)
        act(() => { root.render(<ProductPrice {...p} />) })
        const texto = c.textContent ?? ''
        act(() => root.unmount()); c.remove()
        return { emitido, naoFormado, faltas, texto }
    }
    it('Lucro Real com ICMS nulo: não emite preço, avisa que não se formou, entrega a falta e a nomeia na tela', () => {
        const r = monta(null)
        expect(r.emitido).not.toHaveBeenCalled()
        expect(r.naoFormado).toHaveBeenCalled()
        expect(r.faltas).toHaveBeenLastCalledWith([FALTA_DO_ICMS])
        expect(r.texto).toContain(FALTA_DO_ICMS)
        expect(r.texto).not.toContain('Preço de Venda por Unidade')
    })
    it('CONTRASTE: o mesmo produto com ICMS 0 informado emite o preço, e a falta é vazia', () => {
        const r = monta(0)
        expect(r.emitido).toHaveBeenCalled()
        expect(r.faltas).toHaveBeenLastCalledWith([])
        expect(r.texto).not.toContain(FALTA_DO_ICMS)
    })
    it('RET com ICMS nulo: não é falta (o RET não tem ICMS em separado), e o preço sai', () => {
        const r = monta(null, 'LUCRO_PRESUMIDO_RET')
        expect(r.faltas).toHaveBeenLastCalledWith([])
        expect(r.emitido).toHaveBeenCalled()
    })
})
