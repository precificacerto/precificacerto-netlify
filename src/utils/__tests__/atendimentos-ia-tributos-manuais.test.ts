/** Pedido 0044: tributos editados a mão. Módulo puro (src/lib/atendimentos-ia/tributos-manuais.ts). */
import {
    aliquotaEfetiva, editarTributo, lerTributosManuais, resolverTributo, snapshotDosTributosManuais, validarTributosManuais, voltarAoValorDasCredenciais,
} from '@/lib/atendimentos-ia/tributos-manuais'

describe('validarTributosManuais', () => {
    it('não falar nos tributos não toca a gravação', () => {
        expect(validarTributosManuais(undefined)).toEqual({ tocado: false })
    })
    it('null e objeto vazio gravam NULO (nada editado)', () => {
        expect(validarTributosManuais(null)).toEqual({ tocado: true, tributos: null })
        expect(validarTributosManuais({})).toEqual({ tocado: true, tributos: null })
    })
    it('aceita o percentual de 0 a 100, inclusive texto com vírgula, e zero é zero', () => {
        expect(validarTributosManuais({ icms: { pct: 17 }, pis_cofins: { pct: '7,678' }, cbs: { pct: 0 } }))
            .toEqual({ tocado: true, tributos: { icms: { pct: 17 }, pis_cofins: { pct: 7.678 }, cbs: { pct: 0 } } })
    })
    it.each([[101], [-1], ['abc'], [null], [undefined], [NaN], ['']])('recusa pct %p nomeando o tributo', (pct) => {
        const r = validarTributosManuais({ ibs: { pct } })
        expect(r).toEqual({ tocado: true, erros: ['IBS: tem de ser um percentual de 0 a 100.'] })
    })
    it('recusa valor que não é objeto, chave desconhecida e corpo que não é objeto', () => {
        expect(validarTributosManuais({ icms: 17 })).toEqual({ tocado: true, erros: ['ICMS: tem de ser um percentual de 0 a 100.'] })
        const r = validarTributosManuais({ xx: { pct: 1 } }) as { erros: string[] }
        expect(r.erros[0]).toContain('"xx" não é um tributo editável')
        expect(validarTributosManuais([] as unknown)).toEqual({ tocado: true, erros: ['Tributos manuais: tem de ser um objeto com um item por tributo editado.'] })
    })
})

describe('resolverTributo: sem edição nada muda', () => {
    it.each([null, undefined, {}])('manuais %p devolve o sugerido, origem credenciais', (m) => {
        expect(resolverTributo('icms', 17, m as never)).toEqual({ pct: 17, origem: 'credenciais', sugerido: 17 })
    })
    it('o manual vence e o sugerido acompanha (para o botão de voltar)', () => {
        expect(resolverTributo('icms', 17, { icms: { pct: 12 } })).toEqual({ pct: 12, origem: 'manual', sugerido: 17 })
    })
    it('manual zero vale zero (não cai no sugerido)', () => {
        expect(resolverTributo('cbs', 0.9, { cbs: { pct: 0 } }).pct).toBe(0)
    })
    it('sem sugerido e sem manual é NULO, não zero', () => {
        expect(resolverTributo('is', undefined, null)).toEqual({ pct: null, origem: 'credenciais', sugerido: null })
    })
})

describe('editar e voltar', () => {
    it('editar não altera o objeto recebido e voltar tira a chave', () => {
        const base = { icms: { pct: 12 } }
        const ed = editarTributo(base, 'pis_cofins', 9.25)
        expect(base).toEqual({ icms: { pct: 12 } })
        expect(ed).toEqual({ icms: { pct: 12 }, pis_cofins: { pct: 9.25 } })
        expect(voltarAoValorDasCredenciais(ed, 'icms')).toEqual({ pis_cofins: { pct: 9.25 } })
        expect(voltarAoValorDasCredenciais({ icms: { pct: 12 } }, 'icms')).toBeNull()
        expect(voltarAoValorDasCredenciais(null, 'icms')).toBeNull()
    })
    it('editar com valor inválido lança, nomeando', () => {
        expect(() => editarTributo(null, 'ipi', 150)).toThrow('IPI: tem de ser um percentual de 0 a 100.')
    })
})

describe('lerTributosManuais tolera o que o banco devolver', () => {
    it('coluna ausente, nula, forma errada: nada editado', () => {
        for (const v of [undefined, null, 'x', 3, []] as unknown[]) expect(lerTributosManuais(v)).toBeNull()
    })
    it('descarta a chave ruim e mantém as boas', () => {
        expect(lerTributosManuais({ icms: { pct: 17 }, cbs: { pct: 500 }, zz: { pct: 1 } })).toEqual({ icms: { pct: 17 } })
    })
})

describe('alíquota efetiva = nominal × (1 − redução)', () => {
    it('PIS/Cofins do exemplo do pedido: 9,25% com 17% de redução = 7,6775%', () => {
        expect(aliquotaEfetiva(9.25, 17)).toBeCloseTo(7.6775, 6)
    })
    it('redução ausente não reduz; nominal ausente é nulo', () => {
        expect(aliquotaEfetiva(9.25, null)).toBe(9.25)
        expect(aliquotaEfetiva(null, 17)).toBeNull()
    })
})

describe('snapshotDosTributosManuais', () => {
    it('sem edição, nada entra no snapshot', () => {
        expect(snapshotDosTributosManuais(null)).toEqual([])
    })
    it('o editado entra marcado como manual, na ordem fixa', () => {
        expect(snapshotDosTributosManuais({ ibs: { pct: 1 }, icms: { pct: 12 } })).toEqual([
            { tributo: 'icms', pct: 12, origem: 'manual' }, { tributo: 'ibs', pct: 1, origem: 'manual' },
        ])
    })
})
