/**
 * PORTÃO — A REFERÊNCIA DO PERFIL + COR (dono do produto, 24/11/2026; migração 20261124000002): "o casamento do motor passa a ser referência do
 * perfil + cor, igual, nunca pelo parecido nem pelo código do fornecedor. O sufixo /WOLFF do motor não entra na referência."
 *
 * Os itens são os de produção (medidos em 24/11/2026 na tabela de PERFIL da Wolf): o HF88S tem uma linha por cor (9641 em BRANCO, 96420 em PRETO
 * TEXTURADO, 96421 em "LAMINADO GOLDEN OAK"…), e o motor pede `HF88/WOLFF`. A referência e a cor são as que o arquivo passa a trazer nas colunas
 * `codigo_wvetro` e `cor`.
 */
import {
    referenciaDoMotor, resolverPelaReferencia, resolverReferencia, temReferencia, GRUPO_DE_COR, ROTULO_DO_COMO,
    type ItemResolvivel, type ReferenciaProcurada,
} from '@/lib/atendimentos-ia/resolucao-de-referencia'

type Item = ItemResolvivel & { descricao: string }
const item = (codigo: string, descricao: string, referencia_perfil: string | null = null, cor: string | null = null): Item => ({ codigo, descricao, referencia_perfil, cor })
const HF88_BRANCO = item('9641', 'HF88S - MARCO CORRER DUPLO COM ABA - BRANCO', 'HF88', 'BRANCO')
const HF88_PRETO = item('96420', 'HF88S - MARCO CORRER DUPLO COM ABA - PRETO TEXTURADO', 'HF88', 'PRETO TEXTURADO')
const HF88_OAK = item('96421', 'HF88S - MARCO CORRER DUPLO COM ABA - LAMINADO GOLDEN OAK', 'HF88', 'AMADEIRADO GOLDEN OAK')
const SF66_BRANCO = item('9681', 'SF66 - FOLHA DE JANELA - BRANCO', 'SF66', 'BRANCO')
const REFORCO = item('8432', 'REFORÇO EM AÇO GALVANIZADO  PARA HF112 OU HF 88S (17 X 29 X 17)', '8432', null)
const TABELA = [HF88_BRANCO, HF88_PRETO, HF88_OAK, SF66_BRANCO, REFORCO]
const CORES = [['1', 'BRANCO'], ['20', 'PRETO TEXTURADO'], ['21', 'AMADEIRADO GOLDEN OAK'], ['30', 'BRONZE']].map(([codigo, nome]) => ({ grupo: 'PERFIS DE PVC', codigo, nome }))
const CTX = { cores: CORES, grupoDeCor: GRUPO_DE_COR.perfil }
const pedido = (codigoDoMotor: string, corPedida: string | null, x: Partial<ReferenciaProcurada> = {}): ReferenciaProcurada =>
    ({ codigoDoMotor, codigoDaPonte: null, ponteDoCodigo: [], descricaoDoMotor: 'MARCO CORRER DUPLO COM ABA', corPedida, ...x })
const achado = (r: ReturnType<typeof resolverReferencia<Item>> | null) => (r === null ? null : 'item' in r ? [r.item.codigo, r.como] : [r.motivo])

describe('a referência que o motor pede', () => {
    it('é o código do motor SEM o sufixo do fornecedor, e o resto fica cru (nem caixa, nem zero, nem ponto)', () => {
        expect(referenciaDoMotor('HF88S/WOLFF')).toBe('HF88S')
        expect(referenciaDoMotor('GB34/WOLFF')).toBe('GB34')
        expect(referenciaDoMotor('1317.1/WOLFF')).toBe('1317.1')
        expect(referenciaDoMotor('hf88s')).toBe('hf88s')
        expect(referenciaDoMotor('0HF88')).toBe('0HF88')
    })
    it('o item tem referência quando a coluna vem preenchida; nula ou ausente, não', () => {
        expect(temReferencia(HF88_BRANCO)).toBe(true)
        expect(temReferencia(item('9641', 'HF88S', null))).toBe(false)
        expect(temReferencia({ codigo: '9641' })).toBe(false)
    })
    it('o rótulo de como achou diz que foi pela referência + cor', () => {
        expect(ROTULO_DO_COMO.referencia).toBe('referência do perfil + cor')
    })
})

describe('a referência + cor acha UM item, igual', () => {
    it('HF88/WOLFF em cada cor acha a linha DAQUELA cor — e diz que foi pela referência', () => {
        expect(achado(resolverReferencia(pedido('HF88/WOLFF', 'BRANCO'), TABELA, CTX))).toEqual(['9641', 'referencia'])
        expect(achado(resolverReferencia(pedido('HF88/WOLFF', 'PRETO TEXTURADO'), TABELA, CTX))).toEqual(['96420', 'referencia'])
        expect(achado(resolverReferencia(pedido('HF88/WOLFF', 'AMADEIRADO GOLDEN OAK'), TABELA, CTX))).toEqual(['96421', 'referencia'])
    })
    it('a cor é comparada como toda cor do módulo (sem caixa e sem acento): a conversa grava "Branco", a tabela "BRANCO"', () => {
        expect(achado(resolverReferencia(pedido('HF88/WOLFF', 'Branco'), TABELA, CTX))).toEqual(['9641', 'referencia'])
        expect(achado(resolverReferencia(pedido('HF88/WOLFF', ' preto  texturado '), TABELA, CTX))).toEqual(['96420', 'referencia'])
        // outra cor não é "quase a mesma": PRETO não é PRETO TEXTURADO
        expect(achado(resolverReferencia(pedido('HF88/WOLFF', 'PRETO'), TABELA, CTX))).toEqual(['REFERENCIA_SEM_A_COR'])
    })
    it('a referência é IGUAL, crua: a caixa, o "S" a mais e o espaço fazem outra referência — que não é achada', () => {
        for (const outra of ['hf88/WOLFF', 'HF88S/WOLFF', 'HF 88/WOLFF', 'HF8/WOLFF']) expect(resolverPelaReferencia(pedido(outra, 'BRANCO'), TABELA)).toBeNull()
    })
    it('NÃO passa pelo guarda da descrição: a referência é identidade — vale com a descrição do motor ausente ou sem palavra em comum', () => {
        expect(achado(resolverReferencia(pedido('HF88/WOLFF', 'BRANCO', { descricaoDoMotor: null }), TABELA, CTX))).toEqual(['9641', 'referencia'])
        expect(achado(resolverReferencia(pedido('HF88/WOLFF', 'BRANCO', { descricaoDoMotor: 'CREMONA' }), TABELA, CTX))).toEqual(['9641', 'referencia'])
    })
    it('a referência que não tem cor em NENHUM item (o reforço de aço) serve a qualquer cor pedida, e também sem cor pedida', () => {
        expect(achado(resolverReferencia(pedido('8432/WOLFF', 'PRETO TEXTURADO', { descricaoDoMotor: 'REFORÇO' }), TABELA, CTX))).toEqual(['8432', 'referencia'])
        expect(achado(resolverReferencia(pedido('8432/WOLFF', null, { descricaoDoMotor: 'REFORÇO' }), TABELA, CTX))).toEqual(['8432', 'referencia'])
        // a cor só de espaço é "sem cor"
        expect(achado(resolverPelaReferencia(pedido('X/WOLFF', 'BRANCO'), [item('1', 'PEÇA', 'X', '  ')]))).toEqual(['1', 'referencia'])
    })
})

describe('a falta é nomeada, nunca o parecido', () => {
    it('a referência existe mas NÃO na cor pedida: falta com as cores que ela tem — e nenhuma outra cor entra', () => {
        const r = resolverReferencia(pedido('HF88/WOLFF', 'BRONZE'), TABELA, CTX)
        expect(r).toMatchObject({ achada: false, motivo: 'REFERENCIA_SEM_A_COR', procurado: 'HF88/WOLFF' })
        if ('item' in r) throw new Error('achou')
        expect(r.frase).toBe('HF88/WOLFF (MARCO CORRER DUPLO COM ABA) em BRONZE: a referência HF88 existe na tabela de preço, mas não na cor BRONZE — as cores dela: BRANCO, PRETO TEXTURADO, AMADEIRADO GOLDEN OAK')
        expect(r.candidatas.map((c) => c.item.codigo)).toEqual(['9641', '96420', '96421'])
    })
    it('sem cor pedida, a referência que tem um item por cor não escolhe nenhum (não se assume branco)', () => {
        for (const semCor of [null, '', '   ']) {
            const r = resolverReferencia(pedido('HF88/WOLFF', semCor), TABELA, CTX)
            expect(achado(r)).toEqual(['SEM_COR'])
            if (!('item' in r)) expect(r.frase).toBe('HF88/WOLFF (MARCO CORRER DUPLO COM ABA): a cor não foi dita, e a referência HF88 tem um item por cor — não se assume branco')
        }
    })
    it('dois itens com a mesma referência na mesma cor (duas tabelas no escopo): AMBÍGUA, com os dois — nenhum é escolhido', () => {
        const outro = item('9641X', 'HF88S - MARCO - BRANCO', 'HF88', 'Branco')
        const r = resolverReferencia(pedido('HF88/WOLFF', 'BRANCO'), [...TABELA, outro], CTX)
        expect(achado(r)).toEqual(['AMBIGUA'])
        if (!('item' in r)) {
            expect(r.candidatas.map((c) => c.item.codigo)).toEqual(['9641', '9641X'])
            expect(r.frase).toBe('HF88/WOLFF (MARCO CORRER DUPLO COM ABA) em BRANCO tem 2 itens com a referência HF88 na cor BRANCO na tabela de preço, e nenhum é escolhido: 9641 (BRANCO); 9641X (Branco)')
        }
        // e dois itens da referência SEM cor também
        expect(achado(resolverPelaReferencia(pedido('8432/WOLFF', 'BRANCO'), [REFORCO, item('8432B', 'REFORÇO', '8432', null)]))).toEqual(['AMBIGUA'])
    })
    it('a referência com item colorido E item sem cor: o sem cor não vira coringa da cor que falta', () => {
        const misto = [HF88_BRANCO, item('964X', 'HF88S - MARCO', 'HF88', null)]
        expect(achado(resolverReferencia(pedido('HF88/WOLFF', 'BRONZE'), misto, CTX))).toEqual(['REFERENCIA_SEM_A_COR'])
        expect(achado(resolverReferencia(pedido('HF88/WOLFF', 'BRANCO'), misto, CTX))).toEqual(['9641', 'referencia'])
    })
})

describe('o item que TEM referência só é achado por ela', () => {
    // a mesma tabela de produção, com a referência no arquivo: o motor que pede OUTRA coisa não cai nesses itens por nenhum degrau da escada
    it('nunca pelo CÓDIGO DO FORNECEDOR: a ponte do motor que dá 9641, e o código exato 9641, não acham o item que tem referência', () => {
        expect(achado(resolverReferencia(pedido('OUTRO/WOLFF', 'BRANCO', { codigoDaPonte: '9641' }), TABELA, CTX))).toEqual(['NAO_ACHADA'])
        expect(achado(resolverReferencia(pedido('9641/WOLFF', 'BRANCO'), TABELA, CTX))).toEqual(['NAO_ACHADA'])
        // o controle: o MESMO item sem a referência é achado pela ponte e pelo código exato, como antes
        const semReferencia = TABELA.map((i): Item => ({ ...i, referencia_perfil: null as string | null }))
        expect(achado(resolverReferencia(pedido('OUTRO/WOLFF', 'BRANCO', { codigoDaPonte: '9641' }), semReferencia, CTX))).toEqual(['9641', 'ponte'])
        expect(achado(resolverReferencia(pedido('9641/WOLFF', 'BRANCO'), semReferencia, CTX))).toEqual(['9641', 'exato'])
    })
    it('nunca pelo PARECIDO: o nome técnico na descrição ("SF66 - FOLHA DE JANELA") não acha o item que tem OUTRA referência', () => {
        const comOutraReferencia = [item('9681', 'SF66 - FOLHA DE JANELA - BRANCO', 'SF66N', 'BRANCO')]
        const r = resolverReferencia(pedido('SF66/WOLFF', 'BRANCO', { descricaoDoMotor: 'FOLHA DE JANELA' }), comOutraReferencia, CTX)
        expect(achado(r)).toEqual(['NAO_ACHADA'])
        if (!('item' in r)) expect(r.frase).toBe('SF66/WOLFF (FOLHA DE JANELA) em BRANCO não está na tabela de preço: nem pela referência do perfil (SF66), nem pelo código, nem pelo nome técnico na descrição')
        // o controle: sem a referência, o nome técnico acha
        expect(achado(resolverReferencia(pedido('SF66/WOLFF', 'BRANCO', { descricaoDoMotor: 'FOLHA DE JANELA' }), [item('9681', 'SF66 - FOLHA DE JANELA - BRANCO')], CTX))).toEqual(['9681', 'nome_tecnico'])
    })
    it('a tabela ainda SEM referência (todas as linhas de hoje): a escada roda como antes, e a frase da falta não fala de referência', () => {
        const deHoje = TABELA.map((i): Item => ({ ...i, referencia_perfil: null as string | null, cor: null as string | null }))
        expect(achado(resolverReferencia(pedido('SF66/WOLFF', 'BRANCO', { descricaoDoMotor: 'FOLHA DE JANELA' }), deHoje, CTX))).toEqual(['9681', 'nome_tecnico'])
        const r = resolverReferencia(pedido('ZZ99/WOLFF', 'BRANCO'), deHoje, CTX)
        if ('item' in r) throw new Error('achou')
        expect(r.frase).toBe('ZZ99/WOLFF (MARCO CORRER DUPLO COM ABA) em BRANCO não está na tabela de preço: nem pelo código, nem pelo nome técnico na descrição')
    })
    it('a tabela MISTA (parte com referência, parte sem): o item sem referência continua na escada; o com referência, só pela referência', () => {
        const mista = [HF88_BRANCO, item('1023', 'CLICK GUIA DE ALUMÍNIO PARA TRILHO DE PVC')]
        expect(achado(resolverReferencia(pedido('1023/WOLFF', 'BRANCO', { descricaoDoMotor: 'GUIA DE ALUMÍNIO' }), mista, CTX))).toEqual(['1023', 'exato'])
        expect(achado(resolverReferencia(pedido('HF88/WOLFF', 'BRANCO'), mista, CTX))).toEqual(['9641', 'referencia'])
    })
    it('sem a referência pedida no escopo, `resolverPelaReferencia` devolve null (a escada decide); com ela, nunca null', () => {
        expect(resolverPelaReferencia(pedido('ZZ99/WOLFF', 'BRANCO'), TABELA)).toBeNull()
        expect(resolverPelaReferencia(pedido('HF88/WOLFF', 'BRANCO'), [])).toBeNull()
        expect(resolverPelaReferencia(pedido('HF88/WOLFF', 'BRONZE'), TABELA)).not.toBeNull()
    })
})

describe('A PEÇA QUE NÃO EXISTE NA COR DO PERFIL e o REFORÇO INTERNO SEM COR (dono do produto, 26/11/2026, pedido 0038; o orçamento 31-PVC em PRETO LISO)', () => {
    // as peças só branco/preto da Wolff, como estão em produção em 26/11/2026 (categoria da tabela de cada uma)
    const comCategoria = (i: Item, categoria: string) => ({ ...i, categoria })
    const T9125 = [comCategoria(item('91251', 'TRILHO "Z" ALUMINIO 25MM - BRANCO', '9125', 'BRANCO'), 'REFORCO'), comCategoria(item('91259', 'TRILHO "Z" ALUMINIO 25MM - PRETO', '9125', 'PRETO'), 'REFORCO')]
    const T2575 = [comCategoria(item('25751', 'ACABAMENTO DA SOLEIRA (AMP340) - BRANCO', '2575', 'BRANCO'), 'INSTALACAO'), comCategoria(item('25759', 'ACABAMENTO DA SOLEIRA (AMP340) - PRETO', '2575', 'PRETO'), 'INSTALACAO')]
    const T1352 = [comCategoria(item('13521', 'REFORÇO DE ALUMINIO PARA FOLHA DE TELA MF52', '1352', 'BRANCO'), 'REFORCO')]
    const T1318 = [comCategoria(item('13181', 'PERSIANA PVC 37MM', '1318', 'BRANCO'), 'PERSIANAS')]
    const pede = (codigo: string, cor: string | null) => ({ codigoDoMotor: codigo, descricaoDoMotor: 'PECA', corPedida: cor })

    it('a esquadria em PRETO LISO leva a peça em PRETO quando a referência não existe em PRETO LISO (9125, 2575) — e diz por quê', () => {
        for (const [codigo, tabela, esperado] of [['9125/WOLFF', T9125, '91259'], ['2575/WOLFF', T2575, '25759']] as const) {
            const r = resolverPelaReferencia(pede(codigo, 'Preto Liso'), tabela)
            expect(r && 'item' in r ? [r.item.codigo, r.como, r.substituicao] : r).toEqual([esperado, 'referencia', 'peca_sem_a_cor'])
        }
        // AMADEIRADO, GRAFITE, qualquer cor que não é BRANCO: o PRETO também
        const r = resolverPelaReferencia(pede('9125/WOLFF', 'AMADEIRADO GOLDEN OAK'), T9125)
        expect(r && 'item' in r ? r.item.codigo : null).toBe('91259')
    })
    it('a esquadria BRANCA nunca leva o PRETO: a peça que só existe em PRETO continua falta nomeada', () => {
        // a 2575 (INSTALACAO, não é reforço) só em PRETO e mais uma cor que não é a pedida
        const soPreto = [T2575[1], comCategoria(item('257536', 'ACABAMENTO DA SOLEIRA - PRETO LISO', '2575', 'PRETO LISO'), 'INSTALACAO')]
        expect(achado(resolverPelaReferencia(pede('2575/WOLFF', 'BRANCO'), soPreto))).toEqual(['REFERENCIA_SEM_A_COR'])
        expect(achado(resolverPelaReferencia(pede('2575/WOLFF', 'Branco'), soPreto))).toEqual(['REFERENCIA_SEM_A_COR'])
    })
    it('a esquadria BRANCA continua no BRANCO, sem substituição; e a cor que EXISTE vence o PRETO', () => {
        const r = resolverPelaReferencia(pede('9125/WOLFF', 'BRANCO'), T9125)
        expect(r && 'item' in r ? [r.item.codigo, r.substituicao] : r).toEqual(['91251', undefined])
        const comPretoLiso = [...T9125, comCategoria(item('912536', 'TRILHO Z - PRETO LISO', '9125', 'PRETO LISO'), 'REFORCO')]
        const p = resolverPelaReferencia(pede('9125/WOLFF', 'PRETO LISO'), comPretoLiso)
        expect(p && 'item' in p ? [p.item.codigo, p.substituicao] : p).toEqual(['912536', undefined])
    })
    it('sem PRETO, a peça continua FALTA nomeada (a persiana PVC 1318 só existe em branco); dois itens em PRETO são ambíguos', () => {
        const r = resolverPelaReferencia(pede('1318/WOLFF', 'PRETO LISO'), T1318)
        expect(achado(r)).toEqual(['REFERENCIA_SEM_A_COR'])
        const doisPretos = [...T9125, comCategoria(item('91259B', 'TRILHO Z - PRETO', '9125', 'PRETO'), 'REFORCO')]
        expect(achado(resolverPelaReferencia(pede('9125/WOLFF', 'PRETO LISO'), doisPretos))).toEqual(['AMBIGUA'])
    })
    it('o REFORÇO interno com UM item só entra pela referência, sem cor — em qualquer cor e sem cor dita (1352)', () => {
        for (const cor of ['PRETO LISO', 'BRANCO', null]) {
            const r = resolverPelaReferencia(pede('1352/WOLFF', cor), T1352)
            expect(r && 'item' in r ? [r.item.codigo, r.substituicao] : r).toEqual(['13521', 'reforco_sem_cor'])
        }
    })
    it('o item único que NÃO é de REFORÇO não ganha a regra; o reforço com várias cores continua exigindo a cor', () => {
        expect(achado(resolverPelaReferencia(pede('1318/WOLFF', 'PRETO LISO'), T1318))).toEqual(['REFERENCIA_SEM_A_COR'])
        const coluna = ['BRANCO', 'AMADEIRADO GOLDEN OAK', 'GRAFITE'].map((c, k) => comCategoria(item(`3485${k}`, `COLUNA 3485 - ${c}`, '3485', c), 'REFORCO'))
        expect(achado(resolverPelaReferencia(pede('3485/WOLFF', 'PRETO LISO'), coluna))).toEqual(['REFERENCIA_SEM_A_COR'])
        expect(achado(resolverPelaReferencia(pede('3485/WOLFF', null), coluna))).toEqual(['SEM_COR'])
    })
})
