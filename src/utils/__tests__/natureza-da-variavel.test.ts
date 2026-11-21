/**
 * PORTÃO — A NATUREZA DA VARIÁVEL (dono do produto, 20 e 21/11/2026; migração 20261121000001): a chave (empresa, família, [linha], [formato],
 * variável) dá a natureza e a opção padrão; a linha mais específica vence; o formato é o grupo da tipologia.
 */
import { formatoDoGrupo, grupoDoFormato, naturezaPara, naturezasPara, type LinhaDaNatureza } from '@/lib/atendimentos-ia/natureza-da-variavel'

const L = (variavel: string, natureza: LinhaDaNatureza['natureza'], opcao: string | null, extra: Partial<LinhaDaNatureza> = {}): LinhaDaNatureza =>
    ({ familia: 'PVC', linha: null, formato: null, variavel, natureza, opcao_padrao: opcao, ...extra })

describe('a especificidade', () => {
    const linhas = [
        L('VIDRO', 'POLITICA', 'VIN04'),
        L('VIDRO', 'POLITICA', 'VIN05', { formato: 'janela correr' }),
        L('VIDRO', 'POLITICA', 'VIN06', { linha: 'EUROPA 42' }),
        L('VIDRO', 'POLITICA', 'VIN08', { linha: 'EUROPA 42', formato: 'janela correr' }),
        L('VIDRO', 'POLITICA', 'ALU', { familia: 'ALUMINIO' }),
    ]
    it('linha + formato > linha > formato > a família inteira', () => {
        expect(naturezaPara(linhas, 'VIDRO', { familia: 'PVC', linha: 'EUROPA 42', formato: 'janela correr' })?.opcao).toBe('VIN08')
        expect(naturezaPara(linhas, 'VIDRO', { familia: 'PVC', linha: 'EUROPA 42', formato: 'maxim-ar' })?.opcao).toBe('VIN06')
        expect(naturezaPara(linhas, 'VIDRO', { familia: 'PVC', linha: 'EUROPA 60', formato: 'janela correr' })?.opcao).toBe('VIN05')
        expect(naturezaPara(linhas, 'VIDRO', { familia: 'PVC', linha: null, formato: null })?.opcao).toBe('VIN04')
    })
    it('a família tem de ser a da esquadria; sem linha que case, null (vale a fronteira de sempre)', () => {
        expect(naturezaPara(linhas, 'VIDRO', { familia: 'ALUMINIO', linha: null, formato: null })?.opcao).toBe('ALU')
        expect(naturezaPara(linhas, 'VIDRO', { familia: 'MADEIRA', linha: null, formato: null })).toBeNull()
        expect(naturezaPara(linhas, 'UT', { familia: 'PVC', linha: null, formato: null })).toBeNull()
    })
    it('naturezasPara junta cada variável com a sua linha', () => {
        const r = naturezasPara([L('ARI', 'POLITICA', 'BZ1770'), L('INT', 'CALCULO', null), L('UT', 'ITEM', null), L('ARI', 'POLITICA', 'X', { familia: 'ALUMINIO' })],
            { familia: 'PVC', linha: null, formato: null })
        expect(r).toEqual({ ARI: { natureza: 'POLITICA', opcao: 'BZ1770' }, INT: { natureza: 'CALCULO', opcao: null }, UT: { natureza: 'ITEM', opcao: null } })
    })
})

describe('o formato é o grupo', () => {
    it('ida e volta: "janela correr", "porta correr", "maxim-ar"', () => {
        expect(formatoDoGrupo({ abertura: 'janela', tipo: 'correr' })).toBe('janela correr')
        expect(formatoDoGrupo({ abertura: null, tipo: 'maxim-ar' })).toBe('maxim-ar')
        expect(formatoDoGrupo(null)).toBeNull()
        expect(grupoDoFormato('janela correr')).toEqual({ abertura: 'janela', tipo: 'correr' })
        expect(grupoDoFormato('porta correr')).toEqual({ abertura: 'porta', tipo: 'correr' })
        expect(grupoDoFormato('maxim-ar')).toEqual({ abertura: null, tipo: 'maxim-ar' })
    })
})
