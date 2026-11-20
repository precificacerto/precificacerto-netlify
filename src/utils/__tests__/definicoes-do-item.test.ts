/**
 * @jest-environment node
 *
 * PORTÃO — AS DEFINIÇÕES DE INSTALAÇÃO E ARREMATE no PDF (dono do produto, 12/11/2026, 4.2): por esquadria, a opção efetiva de cada variável capturada,
 * com "(política da empresa)" na que o vendedor não disse e a política definiu (20/11/2026; antes, "(padrão)", o do motor) — e sem marca na que ele disse. A tipologia é a DP-02 do motor da Wolff (a mesma dos portões do levantamento).
 */
jest.mock('@/supabase/admin', () => ({ supabaseAdmin: {} }))
/* eslint-disable @typescript-eslint/no-require-imports */
const A = () => require('@/lib/atendimentos-ia/avaliador-de-formulas') as typeof import('@/lib/atendimentos-ia/avaliador-de-formulas')
const S = () => require('@/lib/atendimentos-ia/arquivo-do-orcamento-servidor') as typeof import('@/lib/atendimentos-ia/arquivo-do-orcamento-servidor')
const TIPOLOGIAS = require('@/lib/atendimentos-ia/abas-do-motor-wolff-DP-02.json')
/* eslint-enable @typescript-eslint/no-require-imports */

function dp02() {
    const r = A().lerTipologia(TIPOLOGIAS, 'DP-02')
    if ('recusas' in r) throw new Error('fixture recusado')
    return r.tipologia
}

// A FRONTEIRA (20/11/2026): o que vale é o que o vendedor disse ou a POLÍTICA DA EMPRESA — o padrão do motor nunca é dito como o que vale
const POLITICA = { usa_arremate_interno: true, guarnicao_interna: 'BZ1770', usa_arremate_externo: true, guarnicao_externa: 'BZ0010', medida_arremate_externo: 'VAO+50MM (CORTE 90/90)' }
describe('as definições do item', () => {
    it('o que o vendedor disse sai sem marca; o que veio da política sai com "(política da empresa)"', () => {
        const d = S().definicoesDoItem(dp02(), { ARI: 4 }, POLITICA, 'DP-02')
        const ari = d.find((x: string) => /ARREMATE INTERNO/i.test(x) && !/MEDIDA/i.test(x))!
        expect(ari).toBe('ARREMATE INTERNO: 4 = SEM ARREMATE INTERNO'.replace('4 = ', ''))
        expect(d).toContain('ARREMATE EXTERNO: BZ0010 - ARREMATE 20MM (política da empresa)')
        expect(d.some((x: string) => x.includes('(padrão)'))).toBe(false)
    })
    it('nada dito e sem política: "não definido" — nunca o padrão do motor', () => {
        const d = S().definicoesDoItem(dp02(), {})
        expect(d.length).toBeGreaterThan(0)
        expect(d.every((x: string) => x.includes('não definido'))).toBe(true)
        expect(d.some((x: string) => x.includes('BZ0006'))).toBe(false)
    })
})

export {}
