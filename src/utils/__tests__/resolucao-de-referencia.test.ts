/**
 * PORTÃO — A RESOLUÇÃO DE REFERÊNCIA (dono do produto, 12/11/2026): o módulo ÚNICO que a conferência e o cálculo usam. Cada degrau tem a prova
 * nos dados de hoje (os códigos e as descrições abaixo são os de produção, medidos em 12/11/2026):
 *   1. o ESCOPO primeiro — 8384 da CELSUS é uma cremona; 8384/WOLFF é a persiana PVC da Wolf;
 *   2. o SUFIXO DO FORNECEDOR, nos dois sentidos — 2202 e 2202/WOLFF; só o sufixo da regra (/VEZA, /24 e o vidro da Estrela não saem);
 *   3. a COR — a base com a cor nomeada na descrição; a base sozinha nunca;
 *   4. o APROXIMADO só com a descrição igual — 17569 (maçaneta Celsus) não é a veneziana 17561;
 *   5. a AMBIGUIDADE e a descrição que não bate são falta NOMEADA, nunca palpite;
 *   6. o resultado diz COMO achou.
 */
import {
    COMO_ACHOU, baseDoWvetro, candidatasDoDegrau, descricaoNormalizada, resolverReferencia, semOSufixo, sufixoDoFornecedor, tabelaNoEscopo,
    type ReferenciaProcurada,
} from '@/lib/atendimentos-ia/resolucao-de-referencia'

type Item = { codigo: string; descricao: string | null; de?: string }
const item = (codigo: string, descricao: string | null, de = 'Wolf'): Item => ({ codigo, descricao, de })
const ref = (codigo: string, codigo_wvetro: string | null, descricao: string | null, cor: string | null = null): ReferenciaProcurada => ({ codigo, codigo_wvetro, descricao, cor })

describe('as formas', () => {
    it('o sufixo do fornecedor é o do código WVetro, em caixa alta; sem barra, nenhum', () => {
        expect(sufixoDoFornecedor('2202/WOLFF')).toBe('WOLFF')
        expect(sufixoDoFornecedor('2202/wolff')).toBe('WOLFF')
        expect(sufixoDoFornecedor('BR60/WOLFF')).toBe('WOLFF')
        expect(sufixoDoFornecedor('2202')).toBeNull()
        expect(sufixoDoFornecedor(null)).toBeNull()
        // a barra com número ou com outra coisa depois não é sufixo de fornecedor
        expect(sufixoDoFornecedor('00384000162/24')).toBeNull()
    })
    it('tira SÓ o sufixo dado, sem olhar a caixa; o resto fica — nem zero, nem ponto, nem o outro fabricante', () => {
        expect(semOSufixo('2202/WOLFF', 'WOLFF')).toBe('2202')
        expect(semOSufixo('2202/wolff', 'WOLFF')).toBe('2202')
        expect(semOSufixo('0123/WOLFF', 'WOLFF')).toBe('0123')
        expect(semOSufixo('94718.1', 'WOLFF')).toBe('94718.1')
        expect(semOSufixo('ANC-242/VEZA', 'WOLFF')).toBe('ANC-242/VEZA')
        expect(semOSufixo('00384000162/24', 'WOLFF')).toBe('00384000162/24')
        expect(semOSufixo('DPVTIN06/8,5/VTIN06', 'WOLFF')).toBe('DPVTIN06/8,5/VTIN06')
        expect(semOSufixo('2202/WOLFF', null)).toBe('2202/WOLFF')
        // o sufixo com caractere de expressão não quebra a busca
        expect(semOSufixo('X/A.B', 'A.B')).toBe('X')
    })
    it('a base do WVetro; a descrição normalizada só para comparar', () => {
        expect(baseDoWvetro('1756/WOLFF')).toBe('1756')
        expect(baseDoWvetro('BR60/WOLFF')).toBe('BR60')
        expect(baseDoWvetro(null)).toBeNull()
        expect(baseDoWvetro('  ')).toBeNull()
        expect(baseDoWvetro('/WOLFF')).toBeNull()
        expect(descricaoNormalizada('Calço  de vidro - 1mm')).toBe('CALCO DE VIDRO 1MM')
        expect(descricaoNormalizada(null)).toBe('')
    })
})

describe('1) O ESCOPO PRIMEIRO, SEMPRE', () => {
    it('a tabela do fornecedor do motor e de uma família dele; a sem família serve a todas; outro fornecedor nunca', () => {
        const escopo = { fornecedor_id: 'wolf', familias: ['PVC'] }
        expect(tabelaNoEscopo({ fornecedor_id: 'wolf', familia: 'PVC' }, escopo)).toBe(true)
        expect(tabelaNoEscopo({ fornecedor_id: 'wolf', familia: null }, escopo)).toBe(true)
        expect(tabelaNoEscopo({ fornecedor_id: 'wolf', familia: 'ALUMINIO' }, escopo)).toBe(false)
        expect(tabelaNoEscopo({ fornecedor_id: 'celsus', familia: 'PVC' }, escopo)).toBe(false)
    })
    it('PROVA: com a base inteira, a persiana 8384/WOLFF casaria a cremona 8384 da Celsus; no escopo da Wolf, não há o que casar', () => {
        const persiana = ref('8384/WOLFF', '8384/WOLFF', 'PERSIANA PVC 63MM - BRANCO')
        const cremona = item('8384', 'CREMONA ZAMAK 1 PONTO OCULTA EP BR', 'Celsus')
        // a base inteira: a resolução, sozinha, aceitaria — é por isso que o escopo vem antes
        expect(resolverReferencia(persiana, [cremona])).toMatchObject({ achada: true, como: 'sufixo_do_fornecedor' })
        // no escopo (só os itens da Wolf), não há candidata
        expect(resolverReferencia(persiana, [cremona].filter((i) => i.de === 'Wolf'))).toMatchObject({ achada: false, motivo: 'NAO_ACHADA' })
    })
})

describe('2) o SUFIXO DO FORNECEDOR, nos dois sentidos', () => {
    it('o motor sem e a tabela com: 2202 → 2202/WOLFF', () => {
        expect(resolverReferencia(ref('2202', '2202/WOLFF', 'REFORÇO EMENDA 12MM'), [item('2202/WOLFF', 'REFORÇO EMENDA 12MM')]))
            .toMatchObject({ achada: true, como: 'sufixo_do_fornecedor', item: { codigo: '2202/WOLFF' } })
    })
    it('o motor com e a tabela sem: 1326/WOLFF → 1326', () => {
        expect(resolverReferencia(ref('1326/WOLFF', '1326/WOLFF', 'PONTEIRA'), [item('1326', 'PONTEIRA')]))
            .toMatchObject({ achada: true, como: 'sufixo_do_fornecedor', item: { codigo: '1326' } })
    })
    it('só o sufixo DA REGRA: a regra sem código WVetro não tira nada; /VEZA não é /WOLFF', () => {
        expect(candidatasDoDegrau('sufixo_do_fornecedor', ref('2202', null, 'X'), [item('2202/WOLFF', 'X')])).toEqual([])
        expect(candidatasDoDegrau('sufixo_do_fornecedor', ref('ANC-242', 'ANC-242/WOLFF', 'X'), [item('ANC-242/VEZA', 'X')])).toEqual([])
    })
    it('o exato vence: com 2202 e 2202/WOLFF na tabela, vale o 2202 (o degrau de cima para a escada)', () => {
        expect(resolverReferencia(ref('2202', '2202/WOLFF', 'R'), [item('2202/WOLFF', 'R'), item('2202', 'R')])).toMatchObject({ achada: true, como: 'exato', item: { codigo: '2202' } })
    })
})

describe('3) a COR — a base com a cor nomeada; a base sozinha nunca', () => {
    const preto = ref('13799', '1379/WOLFF', 'TRILHO DUPLO REBAIXADO DE ALUMÍNIO 24MM - PRETO', 'PRETO')
    it('a mesma base, a descrição nomeia a cor e, sem a cor, é a mesma: achada pela cor', () => {
        expect(resolverReferencia(preto, [item('137909', 'Trilho duplo rebaixado de alumínio 24mm preto')])).toMatchObject({ achada: true, como: 'cor', item: { codigo: '137909' } })
    })
    it('a base sozinha (sem a cor na descrição) NÃO vale — vira falta nomeada, "a descrição é outra"', () => {
        const r = resolverReferencia(preto, [item('1379', 'TRILHO DUPLO REBAIXADO DE ALUMÍNIO 24MM')])
        expect(r).toMatchObject({ achada: false, motivo: 'DESCRICAO_NAO_BATE' })
    })
    it('outra cor na descrição não vale', () => {
        expect(candidatasDoDegrau('cor', preto, [item('13791', 'TRILHO DUPLO REBAIXADO DE ALUMÍNIO 24MM - BRANCO')])).toEqual([])
    })
    it('a regra sem cor, sem código WVetro ou sem descrição não tenta pela cor', () => {
        expect(candidatasDoDegrau('cor', { ...preto, cor: null }, [item('137909', 'TRILHO DUPLO REBAIXADO DE ALUMÍNIO 24MM PRETO')])).toEqual([])
        expect(candidatasDoDegrau('cor', { ...preto, codigo_wvetro: null }, [item('137909', 'TRILHO DUPLO REBAIXADO DE ALUMÍNIO 24MM PRETO')])).toEqual([])
        expect(candidatasDoDegrau('cor', { ...preto, descricao: null }, [item('137909', 'PRETO')])).toEqual([])
    })
    it('a cor que é palavra solta de outra palavra não conta (PRETO não está em PRETOS)', () => {
        expect(candidatasDoDegrau('cor', preto, [item('137909', 'TRILHO DUPLO REBAIXADO DE ALUMÍNIO 24MM PRETOS')])).toEqual([])
    })
})

describe('4) o APROXIMADO só com a descrição concordando', () => {
    const veneziana = ref('17561', '1756/WOLFF', 'VENEZIANA TROPICAL COM VENTILAÇÃO - BRANCO', 'BRANCO')
    it('PROVA: 17569 é a maçaneta Celsus — prefixo igual, produto diferente: NÃO vale, e a falta nomeia a candidata e a razão', () => {
        const r = resolverReferencia(veneziana, [item('17569', 'MAÇANETA CELSUS MD1 QUADRI EIXO 35MM PRETO FOSCO RAL9005')])
        expect(r.achada).toBe(false)
        if ('item' in r) return
        expect(r.motivo).toBe('DESCRICAO_NAO_BATE')
        expect(r.procurado).toBe('17561')
        expect(r.candidatas.map((c) => [c.item.codigo, c.porque])).toEqual([['17569', 'o código começa com 1756, mas a descrição é outra']])
        expect(r.frase).toContain('17569 (MAÇANETA CELSUS MD1 QUADRI EIXO 35MM PRETO FOSCO RAL9005)')
    })
    it('com a descrição igual (normalizada), vale — e diz que foi aproximado', () => {
        const semCor = ref('X1', 'X/WOLFF', 'TRILHO Z ALUMINIO 25MM')
        expect(resolverReferencia(semCor, [item('X9', 'Trilho "Z" alumínio 25mm')])).toMatchObject({ achada: true, como: 'aproximado_com_descricao', item: { codigo: 'X9' } })
    })
    it('a descrição igual sem a mesma base NÃO vale (nunca a descrição sozinha)', () => {
        expect(resolverReferencia(ref('X1', 'X/WOLFF', 'TRILHO Z ALUMINIO 25MM'), [item('ZZ9', 'TRILHO Z ALUMINIO 25MM')])).toMatchObject({ achada: false, motivo: 'NAO_ACHADA' })
    })
})

describe('5) a AMBIGUIDADE é falta nomeada, nunca palpite', () => {
    it('duas candidatas no mesmo degrau: nenhuma é escolhida, e as duas aparecem', () => {
        const r = resolverReferencia(ref('2202', '2202/WOLFF', 'R'), [item('2202/WOLFF', 'R'), item('2202 / wolff', 'R')])
        expect(r).toMatchObject({ achada: false, motivo: 'AMBIGUA', procurado: '2202' })
        if ('item' in r) return
        expect(r.candidatas.map((c) => c.item.codigo)).toEqual(['2202/WOLFF', '2202 / wolff'])
        expect(r.candidatas[0].porque).toBe('2 itens no mesmo degrau (sufixo do fornecedor): nenhum é escolhido')
        expect(r.frase).toBe('o código 2202 tem 2 candidatos na tabela de preço do fornecedor do motor, e nenhum é escolhido: 2202/WOLFF (R); 2202 / wolff (R)')
    })
    it('o mesmo código em duas linhas também é ambíguo', () => {
        expect(resolverReferencia(ref('9471', 'BR60/WOLFF', 'M'), [item('9471', 'M'), item('9471', 'M')])).toMatchObject({ achada: false, motivo: 'AMBIGUA' })
    })
    it('nada: "não está na tabela de preço do fornecedor do motor", sem candidata', () => {
        expect(resolverReferencia(ref('4661', '4661/WOLFF', 'TERMINAL'), [])).toEqual({
            achada: false, motivo: 'NAO_ACHADA', procurado: '4661', candidatas: [], frase: 'o código 4661 não está na tabela de preço do fornecedor do motor',
        })
    })
})

describe('6) o resultado diz como achou, na ordem da escada', () => {
    it('as quatro formas, nessa ordem', () => {
        expect(COMO_ACHOU).toEqual(['exato', 'sufixo_do_fornecedor', 'cor', 'aproximado_com_descricao'])
    })
    it('o código do motor não se normaliza: 0123 não é 123, DP-017 não é DP-17', () => {
        expect(resolverReferencia(ref('0123', null, 'A'), [item('123', 'A')])).toMatchObject({ achada: false })
        expect(resolverReferencia(ref('DP-017', null, 'A'), [item('DP-17', 'A')])).toMatchObject({ achada: false })
    })
})
