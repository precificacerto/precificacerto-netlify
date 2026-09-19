import { tenantOffersServices } from '../segment-visibility'

describe('Serviços só existem na segmentação Prestação de Serviços', () => {
    it.each([
        ['SERVICO', true], ['SERVICE', true],
        ['INDUSTRIALIZACAO', false], ['INDUSTRIALIZATION', false],
        ['REVENDA', false], ['RESALE', false],
        [null, false], [undefined, false], ['', false],
    ])('segmento %p → Serviços visível = %p', (seg, esperado) => {
        expect(tenantOffersServices(seg)).toBe(esperado)
    })
})


describe('Paridade menu ↔ Permissões: uma função decide os dois', () => {
    const { moduleVisibleForSegment } = require('../segment-visibility')

    it('Serviços some do menu e das permissões fora de Prestação de Serviços', () => {
        for (const seg of ['INDUSTRIALIZACAO', 'INDUSTRIALIZATION', 'REVENDA', 'RESALE']) {
            expect(moduleVisibleForSegment('services', seg)).toBe(false)
        }
        expect(moduleVisibleForSegment('services', 'SERVICO')).toBe(true)
        expect(moduleVisibleForSegment('services', 'SERVICE')).toBe(true)
    })

    it('módulos que não dependem de segmentação continuam visíveis em todas', () => {
        for (const seg of ['INDUSTRIALIZACAO', 'SERVICO', 'REVENDA', null]) {
            for (const mod of ['products', 'items', 'stock', 'budgets', 'agenda', undefined]) {
                expect(moduleVisibleForSegment(mod, seg)).toBe(true)
            }
        }
    })

    it('as telas de menu e de permissões chamam a MESMA função (sem cópia da regra)', () => {
        const fs = require('fs')
        const path = require('path')
        const root = path.join(__dirname, '..', '..')
        for (const f of [
            'components/layout/nav.component.tsx',
            'components/layout/mobile-more-drawer.component.tsx',
            'pages/funcionarios/index.tsx',
            'pages/funcionarios/[id]/permissoes.tsx',
            'pages/admin/usuarios.tsx',
        ]) {
            const src = fs.readFileSync(path.join(root, f), 'utf8')
            expect(src).toContain('moduleVisibleForSegment(')
            expect(src).not.toContain('hideForRevenda')
        }
    })
})
