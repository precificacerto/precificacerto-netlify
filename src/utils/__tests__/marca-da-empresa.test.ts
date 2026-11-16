/**
 * PORTÃO — A MARCA DA EMPRESA (dono do produto, 16/11/2026): a logo que o cabeçalho do arquivo do orçamento já
 * desenhava e que nenhuma tela gravava. O que este portão prende é a GUARDA: o que entra como marca e o que é
 * recusado com frase, antes de chegar ao banco.
 *
 * A mesma guarda existe em `superadmin_gravar_marca_da_empresa` (migração 20261116000003): a daqui é a frase que o
 * usuário lê, a de lá é a que não deixa passar por outro caminho.
 */
import {
    FORMA_DA_MARCA, LIMITE_DA_MARCA, fraseDaMarcaForaDoFormato, fraseDaMarcaGrande, lerCorpoDaMarca,
} from '@/lib/atendimentos-ia/base-de-conhecimento'
import { recusaDaMarca } from '@/page-parts/atendimentos-ia/base-de-conhecimento/marca-da-empresa.component'

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQ=='

describe('a marca que entra', () => {
    it('PNG e JPEG passam, e o data URL volta aparado', () => {
        expect(lerCorpoDaMarca({ logo: PNG })).toEqual({ erros: [], logo: PNG })
        expect(lerCorpoDaMarca({ logo: JPEG })).toEqual({ erros: [], logo: JPEG })
        expect(lerCorpoDaMarca({ logo: `  ${PNG}  ` })).toEqual({ erros: [], logo: PNG })
    })
    it('null, vazio e só-espaço LIMPAM a marca — nenhum deles é recusa', () => {
        for (const v of [null, '', '   ']) expect(lerCorpoDaMarca({ logo: v })).toEqual({ erros: [], logo: null })
    })
    it('o campo AUSENTE é recusa nomeada: limpar se diz com null, nunca por omissão', () => {
        const r = lerCorpoDaMarca({})
        expect(r.logo).toBeNull()
        expect(r.erros.map((e) => e.campo)).toEqual(['logo'])
        // a frase diz o que fazer: é OUTRA da recusa do tipo errado, para o ausente não se confundir com "null limpa"
        expect(r.erros[0].mensagem).toContain('null para limpar')
        expect(r.erros[0].mensagem).not.toBe(lerCorpoDaMarca({ logo: 42 }).erros[0].mensagem)
    })
})

describe('a marca que NÃO entra', () => {
    it.each([
        ['um SVG', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='],
        ['um GIF', 'data:image/gif;base64,R0lGODlhAQABAAAAACw='],
        ['uma URL http', 'https://exemplo.com/logo.png'],
        ['texto solto', 'a logo da empresa'],
        ['base64 sem o cabeçalho', 'iVBORw0KGgoAAAANSUhEUg=='],
    ])('%s é recusado, com a frase do formato', (_, v) => {
        const r = lerCorpoDaMarca({ logo: v })
        expect(r.logo).toBeNull()
        expect(r.erros.map((e) => e.mensagem)).toEqual([fraseDaMarcaForaDoFormato])
        expect(recusaDaMarca(v)).toBe(fraseDaMarcaForaDoFormato)
    })
    it('acima do limite é recusado, e a frase diz o tamanho e o limite', () => {
        const grande = `data:image/png;base64,${'A'.repeat(LIMITE_DA_MARCA)}`
        const r = lerCorpoDaMarca({ logo: grande })
        expect(r.logo).toBeNull()
        expect(r.erros[0].mensagem).toBe(fraseDaMarcaGrande(grande.length))
        expect(r.erros[0].mensagem).toContain('300 KB')
        expect(recusaDaMarca(grande)).toBe(r.erros[0].mensagem)
        // e o que cabe no limite passa
        expect(recusaDaMarca(`data:image/png;base64,${'A'.repeat(LIMITE_DA_MARCA - 23)}`)).toBeNull()
    })
    it('o que não é texto nem null é recusa, nunca um valor silencioso', () => {
        for (const v of [42, true, { dados: PNG }, [PNG]]) {
            const r = lerCorpoDaMarca({ logo: v })
            expect([v, r.logo, r.erros.length > 0]).toEqual([v, null, true])
        }
    })
    it('a forma é a MESMA nos dois lados da guarda', () => {
        expect(FORMA_DA_MARCA.test(PNG)).toBe(true)
        expect(FORMA_DA_MARCA.test('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false)
    })
})

export {}
