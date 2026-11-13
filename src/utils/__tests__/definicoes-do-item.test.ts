/**
 * @jest-environment node
 *
 * PORTÃO — AS DEFINIÇÕES DE INSTALAÇÃO E ARREMATE no PDF (dono do produto, 12/11/2026, 4.2): por esquadria, a opção efetiva de cada variável capturada,
 * com "(padrão)" na que o vendedor não disse — e sem ele na que disse. A tipologia é a DP-02 do motor da Wolff (a mesma dos portões do levantamento).
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

describe('as definições do item', () => {
    it('o que o vendedor disse sai sem marca; o que ficou no padrão sai com "(padrão)"', () => {
        const d = S().definicoesDoItem(dp02(), { ARI: 4 })
        const ari = d.find((x: string) => /ARREMATE INTERNO/i.test(x) && !/MEDIDA/i.test(x))!
        expect(ari).toBeDefined()
        expect(ari).not.toContain('(padrão)')
        expect(d.filter((x: string) => x.endsWith('(padrão)')).length).toBeGreaterThan(0)
    })
    it('nada dito: tudo "(padrão)"', () => {
        const d = S().definicoesDoItem(dp02(), {})
        expect(d.length).toBeGreaterThan(0)
        expect(d.every((x: string) => x.endsWith('(padrão)'))).toBe(true)
    })
})

export {}
