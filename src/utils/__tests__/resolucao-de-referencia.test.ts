/**
 * PORTÃO — A RESOLUÇÃO DE REFERÊNCIA (dono do produto, 12/11/2026, o comando único): o módulo ÚNICO que a conferência e o cálculo usam. A escada
 * é ponte → exato (o sufixo do fornecedor dentro) → código + cor (pela tabela de cores do fornecedor) → nome técnico na descrição, e o GUARDA
 * vale nos quatro degraus: pelo menos uma palavra significativa em comum com a descrição do motor. Os códigos e as descrições abaixo são os de
 * produção (Wolf, lidos em 12/11/2026); as cores, as da aba CORES que a migração 20261112000006 grava.
 */
import {
    COMO_ACHOU, GRUPO_DE_COR, candidatasDoDegrau, codigoComCor, coresNaDescricao, nomeTecnicoNaDescricao, nomeiaOutraCor, palavrasSignificativas, resolverReferencia,
    semOSufixo, sufixoDoFornecedor, tabelaNoEscopo, type CorDoFornecedor, type ReferenciaProcurada,
} from '@/lib/atendimentos-ia/resolucao-de-referencia'

type Item = { codigo: string; descricao: string | null }
const item = (codigo: string, descricao: string | null): Item => ({ codigo, descricao })
const CORES: CorDoFornecedor[] = [
    ['1', 'BRANCO'], ['18', 'EXTERNO PRETO TEXTURADO'], ['20', 'PRETO TEXTURADO'], ['30', 'BRONZE'], ['36', 'PRETO LISO'], ['38', 'EXTERNO PRETO LISO'],
].map(([codigo, nome]): CorDoFornecedor => ({ grupo: GRUPO_DE_COR.perfil, codigo, nome }))
    .concat([{ grupo: GRUPO_DE_COR.insumo, codigo: '9', nome: 'PRETO' }, { grupo: GRUPO_DE_COR.insumo, codigo: '1', nome: 'BRANCO' }])
const PERFIL = { cores: CORES, grupoDeCor: GRUPO_DE_COR.perfil }
const ref = (codigoDoMotor: string, descricaoDoMotor: string | null, corPedida: string | null = 'BRANCO', codigoDaPonte: string | null = null): ReferenciaProcurada =>
    ({ codigoDoMotor, codigoDaPonte, descricaoDoMotor, corPedida })
const como = (r: ReturnType<typeof resolverReferencia<Item>>) => ('item' in r ? `${r.como}:${r.item.codigo}` : r.motivo)

describe('as formas', () => {
    it('o sufixo do fornecedor é o do código do motor, em caixa alta; a barra com número não é sufixo', () => {
        expect(sufixoDoFornecedor('2202/wolff')).toBe('WOLFF')
        expect(sufixoDoFornecedor('2202')).toBeNull()
        expect(sufixoDoFornecedor('00384000162/24')).toBeNull()
    })
    it('tira SÓ o sufixo dado; o código do motor não se normaliza (nem zero, nem ponto, nem outro fabricante)', () => {
        expect(semOSufixo('0123/WOLFF', 'WOLFF')).toBe('0123')
        expect(semOSufixo('94718.1', 'WOLFF')).toBe('94718.1')
        expect(semOSufixo('ANC-242/VEZA', 'WOLFF')).toBe('ANC-242/VEZA')
    })
    it('o código + o dígito da cor; o ".1" (face menor) fica no fim', () => {
        expect(codigoComCor('1317', '1')).toBe('13171')
        expect(codigoComCor('1317.1', '1')).toBe('13171.1')
    })
    it('as palavras significativas: sem ligação, sem número ou medida, sem as cores do fornecedor e sem o nome técnico', () => {
        expect([...palavrasSignificativas('ESCOVA DE VEDAÇÃO COM BARREIRA 10X6MM - PRETO IL50', CORES, 'IL50')].sort()).toEqual(['BARREIRA', 'ESCOVA', 'VEDACAO'])
    })
    it('o nome técnico DELIMITADO e sem os espaços internos: IL50 casa "IL 50", não IL501 nem BIL50', () => {
        expect(nomeTecnicoNaDescricao('IL50', 'INTERLOCK PORTA IL 50 - BRANCO')).toEqual({ casou: true, noInicio: false })
        expect(nomeTecnicoNaDescricao('IL50', 'IL501 - INTERLOCK').casou).toBe(false)
        expect(nomeTecnicoNaDescricao('IL50', 'BIL50 - INTERLOCK').casou).toBe(false)
        expect(nomeTecnicoNaDescricao('SF92', 'SF92 - FOLHA DE PORTA - BRANCO')).toEqual({ casou: true, noInicio: true })
    })
    it('as cores da descrição: a mais longa primeiro — EXTERNO PRETO LISO não vira PRETO LISO', () => {
        expect(coresNaDescricao('MARCO 60 - EXTERNO PRETO LISO', CORES.filter((c) => c.grupo === GRUPO_DE_COR.perfil))).toEqual(['EXTERNO PRETO LISO'])
    })
    it('o escopo: o fornecedor do motor, e a família dele ou nenhuma', () => {
        const escopo = { fornecedor_id: 'wolf', familias: ['PVC'] }
        expect(tabelaNoEscopo({ fornecedor_id: 'wolf', familia: null }, escopo)).toBe(true)
        expect(tabelaNoEscopo({ fornecedor_id: 'wolf', familia: 'ALUMINIO' }, escopo)).toBe(false)
        expect(tabelaNoEscopo({ fornecedor_id: 'celsus', familia: 'PVC' }, escopo)).toBe(false)
    })
})

describe('a escada, degrau a degrau', () => {
    it('1) a PONTE vence: o código que a aba "Motor por barra" deu é achado pelo código', () => {
        const itens = [item('9691', 'SF92 - FOLHA DE PORTA - BRANCO'), item('9692', 'SF92 - FOLHA DE PORTA - PRETO TEXTURADO')]
        expect(como(resolverReferencia(ref('SF92/WOLFF', 'FOLHA DE PORTA', 'PRETO TEXTURADO', '9692'), itens, PERFIL))).toBe('ponte:9692')
    })
    it('2) o EXATO, com o sufixo do fornecedor nos dois sentidos', () => {
        expect(como(resolverReferencia(ref('2202/WOLFF', 'MARCO JANELA'), [item('2202', 'MARCO JANELA 60')], PERFIL))).toBe('exato:2202')
        expect(como(resolverReferencia(ref('2202', 'MARCO JANELA'), [item('2202/WOLFF', 'MARCO JANELA 60')], PERFIL))).toBe('exato:2202/WOLFF')
    })
    it('3) a COR pela tabela do fornecedor: 1317 + BRANCO = 13171, e 1317.1 + BRANCO = 13171.1', () => {
        const itens = [item('13171', 'MARCO JANELA LINHA 60 BRANCO'), item('13171.1', 'MARCO JANELA LINHA 60 FACE MENOR BRANCO')]
        expect(como(resolverReferencia(ref('1317/WOLFF', 'MARCO JANELA'), itens, PERFIL))).toBe('cor:13171')
        expect(como(resolverReferencia(ref('1317.1/WOLFF', 'MARCO JANELA'), itens, PERFIL))).toBe('cor:13171.1')
    })
    it('3) sem cor pedida, NÃO se assume branco; cor fora da tabela é "não resolvido"', () => {
        const itens = [item('13171', 'MARCO JANELA LINHA 60 BRANCO')]
        expect(como(resolverReferencia(ref('1317/WOLFF', 'MARCO JANELA', null), itens, PERFIL))).toBe('SEM_COR')
        expect(como(resolverReferencia(ref('1317/WOLFF', 'MARCO JANELA', 'ROXO'), itens, PERFIL))).toBe('COR_FORA_DA_TABELA')
        expect(candidatasDoDegrau('cor', ref('1317/WOLFF', 'MARCO JANELA', 'ROXO'), itens, PERFIL).pulado).toBe('COR_FORA_DA_TABELA')
    })
    it('4) o NOME TÉCNICO na descrição: SF92/WOLFF → 9691', () => {
        expect(como(resolverReferencia(ref('SF92/WOLFF', 'FOLHA DE PORTA'), [item('9691', 'SF92 - FOLHA DE PORTA - BRANCO')], PERFIL))).toBe('nome_tecnico:9691')
    })
    it('4) o nome técnico rejeita o item de OUTRA cor, e sem cor pedida rejeita o que nomeia uma cor', () => {
        const itens = [item('9692', 'SF92 - FOLHA DE PORTA - PRETO TEXTURADO')]
        expect(como(resolverReferencia(ref('SF92/WOLFF', 'FOLHA DE PORTA', 'BRANCO'), itens, PERFIL))).toBe('DESCRICAO_NAO_CONCORDA')
        expect(como(resolverReferencia(ref('SF92/WOLFF', 'FOLHA DE PORTA', null), itens, PERFIL))).toBe('DESCRICAO_NAO_CONCORDA')
    })
    it('4) SEM A TABELA DE CORES o nome técnico não roda: o "SF92 - ... - BRANCO" não serve a uma esquadria preta às cegas', () => {
        const r = resolverReferencia(ref('SF92/WOLFF', 'FOLHA DE PORTA', 'PRETO'), [item('9691', 'SF92 - FOLHA DE PORTA - BRANCO')], { cores: [], grupoDeCor: GRUPO_DE_COR.perfil })
        expect(como(r)).toBe('SEM_TABELA_DE_CORES')
        expect('frase' in r ? r.frase : '').toContain('o fornecedor não tem a tabela de cores')
    })
    it('4) PROVA (caso Gerson Boss): o SF92 em Roxo NÃO cai no reforço que cita o SF92 — havendo o item que É o produto, só ele conta', () => {
        const itens = [item('9691', 'SF92 - FOLHA DE PORTA - BRANCO'), item('8427', 'REFORÇO FOLHA SF92 AÇO GALVANIZADO (Z275) (PE679-5)'), item('83571', 'EMBELEZADOR EUROPA SF92')]
        const r = resolverReferencia(ref('SF92/WOLFF', 'FOLHA DE PORTA', 'PRETO TEXTURADO'), itens, PERFIL)
        expect(como(r)).toBe('DESCRICAO_NAO_CONCORDA')
        expect('candidatas' in r ? r.candidatas.map((c) => c.item.codigo) : []).toEqual(['9691'])
        // e sem o item ancorado, o que cita o nome segue para o guarda
        expect(como(resolverReferencia(ref('SF92/WOLFF', 'REFORÇO FOLHA'), itens.slice(1), PERFIL))).toBe('nome_tecnico:8427')
    })
    it('4) A COR PELA PALAVRA (medido na tabela da Wolf): "LAMINADO GOLDEN OAK", "LAMINADO NOGUEIRA", "PRETO ALUMÍNIO" nomeiam cor mesmo sem a frase da tabela; "ARREMATE EXTERNO" não', () => {
        const perfil = CORES.filter((c) => c.grupo === GRUPO_DE_COR.perfil).concat([{ grupo: GRUPO_DE_COR.perfil, codigo: '21', nome: 'AMADEIRADO GOLDEN OAK' }, { grupo: GRUPO_DE_COR.perfil, codigo: '37', nome: 'AMADEIRADO NOGUEIRA' }])
        expect(nomeiaOutraCor('BZ20010 - PERFIL PARA CAIXA DE PERSIANA 200MM - LAMINADO GOLDEN OAK', 'BRANCO', perfil, 'BZ20010')).toEqual(['GOLDEN', 'OAK'])
        expect(nomeiaOutraCor('GM42N - ENCONTRO CENTRAL 4 FOLHAS - PRETO ALUMÍNIO', 'BRANCO', perfil, 'GM42N')).toEqual(['PRETO'])
        expect(nomeiaOutraCor('BZ0010 - APLIQUE P/ VIDRO - ARREMATE EXTERNO - BRANCO', 'BRANCO', perfil, 'BZ0010')).toEqual([])
        expect(nomeiaOutraCor('SF92 - FOLHA DE PORTA - PRETO TEXTURADO', 'PRETO TEXTURADO', perfil, 'SF92')).toEqual([])
        expect(nomeiaOutraCor('SF92 - FOLHA DE PORTA - PRETO LISO', 'PRETO TEXTURADO', perfil, 'SF92')).toEqual(['PRETO', 'LISO'])
        // e no degrau: a variante de cor escrita de outro jeito não serve ao BRANCO
        const itens = [item('102419', 'BZ20010 - PERFIL PARA CAIXA DE PERSIANA 200MM - LAMINADO GOLDEN OAK'), item('10241', 'BZ20010 - PERFIL PARA CAIXA DE PERSIANA 200MM - BRANCO')]
        expect(como(resolverReferencia(ref('BZ20010/WOLFF', 'CAIXA DE PERSIANA'), itens, { cores: perfil, grupoDeCor: GRUPO_DE_COR.perfil }))).toBe('nome_tecnico:10241')
    })
    it('4) o código só de números não é nome técnico', () => {
        expect(candidatasDoDegrau('nome_tecnico', ref('8384', 'PERSIANA'), [item('9000', 'PERSIANA 8384')], PERFIL).candidatas).toEqual([])
    })
    it('4) o DESEMPATE: o BY60 — 22321 tem VENEZIANA + JAPONESA, as cremalheiras só VENEZIANA', () => {
        const itens = [
            item('22321', 'VENEZIANA JAPONESA BY60 - BRANCO'), item('22330', 'CREMALHEIRA VENEZIANA BY60 - BRANCO'), item('22331', 'CREMALHEIRA DA VENEZIANA BY60 - BRANCO'),
        ]
        expect(como(resolverReferencia(ref('BY60/WOLFF', 'VENEZIANA JAPONESA'), itens, PERFIL))).toBe('nome_tecnico:22321')
    })
    it('4) prefere a descrição que COMEÇA com o nome; empate nas palavras é falta, nunca o primeiro', () => {
        const comeca = [item('9711', 'IL36 - INTERLOCK JANELA - BRANCO'), item('9712', 'INTERLOCK JANELA IL36 MAO DE AMIGO - BRANCO')]
        expect(como(resolverReferencia(ref('IL36/WOLFF', 'INTERLOCK JANELA'), comeca, PERFIL))).toBe('nome_tecnico:9711')
        const empate = [item('A1', 'INTERLOCK JANELA IL36 - BRANCO'), item('A2', 'INTERLOCK JANELA LONGO IL36 - BRANCO')]
        const r = resolverReferencia(ref('IL36/WOLFF', 'INTERLOCK JANELA'), empate, PERFIL)
        expect(como(r)).toBe('AMBIGUA')
        expect('candidatas' in r ? r.candidatas.map((c) => c.item.codigo).sort() : []).toEqual(['A1', 'A2'])
    })
})

describe('o GUARDA, nos quatro degraus', () => {
    it('PROVA: 1756 (VENEZIANA TROPICAL) não leva o 17569 (MAÇANETA CELSUS) pela cor', () => {
        const r = resolverReferencia(ref('1756/WOLFF', 'VENEZIANA TROPICAL'), [item('17569', 'MACANETA CELSUS PRETA')], { cores: [{ grupo: GRUPO_DE_COR.perfil, codigo: '9', nome: 'BRANCO' }], grupoDeCor: GRUPO_DE_COR.perfil })
        expect(como(r)).toBe('DESCRICAO_NAO_CONCORDA')
        expect('frase' in r ? r.frase : '').toContain('17569')
    })
    it('PROVA: IL50 (INTERLOCK PORTA) não leva a escova 9347 — o "IL50" do fim é o nome técnico, e não conta', () => {
        const r = resolverReferencia(ref('IL50/WOLFF', 'INTERLOCK PORTA'), [item('9347', 'ESCOVA DE VEDACAO COM BARREIRA 10X6MM IL50')], PERFIL)
        expect(como(r)).toBe('DESCRICAO_NAO_CONCORDA')
    })
    it('o guarda vale também no exato e na ponte', () => {
        expect(como(resolverReferencia(ref('2202/WOLFF', 'MARCO JANELA'), [item('2202', 'PARAFUSO AUTOATARRAXANTE')], PERFIL))).toBe('DESCRICAO_NAO_CONCORDA')
        expect(como(resolverReferencia(ref('SF92/WOLFF', 'FOLHA DE PORTA', 'BRANCO', '9691'), [item('9691', 'PARAFUSO')], PERFIL))).toBe('DESCRICAO_NAO_CONCORDA')
    })
    it('sem descrição no motor, nada é aprovado às cegas', () => {
        expect(como(resolverReferencia(ref('2202/WOLFF', null), [item('2202', 'MARCO JANELA 60')], PERFIL))).toBe('DESCRICAO_DO_MOTOR_AUSENTE')
    })
    it('o recusado num degrau não impede o de baixo: o exato recusado, o nome técnico acha', () => {
        const itens = [item('SF92', 'PARAFUSO'), item('9691', 'SF92 - FOLHA DE PORTA - BRANCO')]
        expect(como(resolverReferencia(ref('SF92/WOLFF', 'FOLHA DE PORTA'), itens, PERFIL))).toBe('nome_tecnico:9691')
    })
})

describe('a falta é nomeada, nunca palpite', () => {
    it('duas no mesmo degrau (fora do nome técnico): AMBIGUA, com as duas', () => {
        const r = resolverReferencia(ref('2202/WOLFF', 'MARCO JANELA'), [item('2202', 'MARCO JANELA 60'), item('2202/WOLFF', 'MARCO JANELA 60')], PERFIL)
        expect(como(r)).toBe('AMBIGUA')
        expect('frase' in r ? r.frase : '').toContain('nenhum é escolhido')
    })
    it('nada: NAO_ACHADA, sem candidata', () => {
        const r = resolverReferencia(ref('ZS30/WOLFF', 'ZOCLO'), [item('9691', 'SF92 - FOLHA DE PORTA - BRANCO')], PERFIL)
        expect(como(r)).toBe('NAO_ACHADA')
        expect('candidatas' in r ? r.candidatas : null).toEqual([])
    })
    it('o código do motor não se normaliza: 0123 não é 123', () => {
        expect(como(resolverReferencia(ref('0123', 'MARCO'), [item('123', 'MARCO')], PERFIL))).toBe('NAO_ACHADA')
    })
    it('a ordem da escada é a do comando', () => {
        expect(COMO_ACHOU).toEqual(['ponte', 'exato', 'cor', 'nome_tecnico'])
    })
})
