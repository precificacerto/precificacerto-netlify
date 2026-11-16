/**
 * PORTÃO — O DESENHO DA TIPOLOGIA, do catálogo importado (regra do dono do produto, 11/11/2026; implementada em
 * 16/11/2026). As linhas abaixo são as de produção, lidas em 16/11/2026: a DP-39 tem três desenhos por variável, com
 * as condições `(HI<>1)`, `(HI=1) and (UT=1)` e `(HI=1) and (UT=2)`; o índice principal do PVC tem `*DP-02` com a
 * descrição "JANELA DE CORRER 02 FOLHAS MÓVEIS | EUROPA 42".
 *
 * O que este portão prende é a REGRA INTEIRA, inclusive a metade que não desenha: "desenho errado é pior que desenho
 * nenhum [...] nunca a figura mais parecida".
 */
import {
    descricaoComparavel, escolherDesenho, fraseDeDuasCandidatas, fraseDeVariavelSemValor, fraseSemArquivo, fraseSemCandidata, valoresDoDesenho,
    type DesenhoDoCatalogo,
} from '@/lib/atendimentos-ia/desenho-do-catalogo'

const porVariavel = (codigo: string, condicao: string, caminho: string | null): DesenhoDoCatalogo =>
    ({ fonte: 'por_variavel', grupo: 'PVC', codigo, descricao: null, condicao, caminho_no_storage: caminho })
const principal = (codigo: string, descricao: string, caminho: string | null, grupo = 'PVC'): DesenhoDoCatalogo =>
    ({ fonte: 'principal', grupo, codigo, descricao, condicao: null, caminho_no_storage: caminho })

const CATALOGO: DesenhoDoCatalogo[] = [
    porVariavel('DP-39', '(HI<>1)', 'PVC/dp39-a.png'),
    porVariavel('DP-39', '(HI=1) and (UT=1)', 'PVC/dp39-b.png'),
    porVariavel('DP-39', '(HI=1) and (UT=2)', 'PVC/dp39-c.png'),
    principal('*DP-02', 'JANELA DE CORRER 02 FOLHAS MÓVEIS | EUROPA 42', 'PVC/dp02.jpg'),
    principal('*DP-05', 'JANELA DE CORRER 02 FOLHAS MÓVEIS | PEITORIL FIXO | EUROPA 42', 'PVC/dp05.jpg'),
]
const item = (tipologia: string, valores: Record<string, number> = {}, descricao: string | null = null) =>
    ({ tipologia, descricao, valores })

describe('1. o degrau POR VARIÁVEL: a condição que casa com as escolhas gravadas', () => {
    it('cada combinação de HI e UT leva ao SEU desenho — não ao primeiro da lista', () => {
        expect(escolherDesenho(item('DP-39', { HI: 2, UT: 1 }), CATALOGO)).toMatchObject({ caminho: 'PVC/dp39-a.png', degrau: 'por_variavel' })
        expect(escolherDesenho(item('DP-39', { HI: 1, UT: 1 }), CATALOGO)).toMatchObject({ caminho: 'PVC/dp39-b.png' })
        expect(escolherDesenho(item('DP-39', { HI: 1, UT: 2 }), CATALOGO)).toMatchObject({ caminho: 'PVC/dp39-c.png' })
    })
    // o `codigo_dp` é DADO, NUNCA CHAVE (12/11/2026): a escolha nem o conhece — casa pelo `codigo` cru
    it('o código cru é a identidade: a caixa e os espaços não contam, outro código não casa', () => {
        expect(escolherDesenho(item(' dp-39 ', { HI: 1, UT: 1 }), CATALOGO)).toMatchObject({ caminho: 'PVC/dp39-b.png' })
        expect(escolherDesenho(item('DP39', { HI: 1, UT: 1 }), CATALOGO)).toMatchObject({ motivo: 'SEM_CANDIDATA' })
    })
    it('o degrau 1 vence o 2: tendo condição que casa, a descrição não é consultada', () => {
        const comOs2 = [...CATALOGO, principal('*DP-39', 'QUALQUER COISA | EUROPA 42', 'PVC/nao-e-esse.jpg')]
        expect(escolherDesenho(item('DP-39', { HI: 1, UT: 2 }, 'QUALQUER COISA | EUROPA 42'), comOs2)).toMatchObject({ caminho: 'PVC/dp39-c.png' })
    })
})

describe('2. o degrau do ÍNDICE PRINCIPAL: a mesma descrição, ignorando a linha e o grupo', () => {
    it('a descrição casa, e a LINHA no fim não atrapalha — a imagem é da forma, não do material', () => {
        expect(escolherDesenho(item('DP-02', {}, 'JANELA DE CORRER 02 FOLHAS MÓVEIS | EUROPA 42'), CATALOGO))
            .toMatchObject({ caminho: 'PVC/dp02.jpg', degrau: 'principal' })
        // a MESMA forma noutra linha acha o mesmo desenho
        expect(escolherDesenho(item('XX-99', {}, 'JANELA DE CORRER 02 FOLHAS MÓVEIS | EUROPA 60'), CATALOGO))
            .toMatchObject({ caminho: 'PVC/dp02.jpg' })
    })
    it('a comparação ignora caixa, acento e pontuação, e NÃO ignora o que muda a forma', () => {
        expect(descricaoComparavel('JANELA DE CORRER 02 FOLHAS MÓVEIS | EUROPA 42'))
            .toBe(descricaoComparavel('janela de correr 02 folhas moveis | europa 60'))
        // o peitoril fixo é outra forma: não casa com a sem peitoril
        expect(descricaoComparavel('JANELA DE CORRER 02 FOLHAS MÓVEIS | PEITORIL FIXO | EUROPA 42'))
            .not.toBe(descricaoComparavel('JANELA DE CORRER 02 FOLHAS MÓVEIS | EUROPA 42'))
        expect(escolherDesenho(item('DP-05', {}, 'JANELA DE CORRER 02 FOLHAS MÓVEIS | PEITORIL FIXO | EUROPA 42'), CATALOGO))
            .toMatchObject({ caminho: 'PVC/dp05.jpg' })
    })
})

describe('3. a metade que NÃO desenha: nunca a figura mais parecida', () => {
    it('tipologia sem candidata: nada, e a frase nomeia a tipologia', () => {
        const r = escolherDesenho(item('DP-77', { HI: 1 }, 'FORMA QUE NINGUÉM TEM | EUROPA 42'), CATALOGO)
        expect(r).toEqual({ motivo: 'SEM_CANDIDATA', frase: fraseSemCandidata('DP-77') })
        expect('caminho' in r).toBe(false)
    })
    it('VARIÁVEL SEM VALOR: nada, e a frase diz QUAL variável falta', () => {
        const r = escolherDesenho(item('DP-39', {}), CATALOGO)
        expect(r).toEqual({ motivo: 'VARIAVEL_SEM_VALOR', frase: fraseDeVariavelSemValor('DP-39', 'HI') })
    })
    it('DUAS condições que casam: nada, e a frase diz quantas', () => {
        const ambiguo = [porVariavel('DP-50', '(N=1)', 'a.png'), porVariavel('DP-50', '(N>0)', 'b.png')]
        expect(escolherDesenho(item('DP-50', { N: 1 }), ambiguo)).toEqual({ motivo: 'DUAS_CANDIDATAS', frase: fraseDeDuasCandidatas('DP-50', 2) })
    })
    it('DOIS desenhos principais com a mesma descrição: nada — a descrição não desempata sozinha', () => {
        const dois = [principal('*A', 'MESMA FORMA | EUROPA 42', 'a.jpg'), principal('*B', 'MESMA FORMA | EUROPA 60', 'b.jpg')]
        expect(escolherDesenho(item('DP-X', {}, 'MESMA FORMA | EUROPA 42'), dois)).toMatchObject({ motivo: 'DUAS_CANDIDATAS' })
    })
    it('no ÍNDICE mas SEM ARQUIVO no Storage: nada, e a frase diz isso — nunca um caminho vazio', () => {
        expect(escolherDesenho(item('DP-60', { N: 1 }), [porVariavel('DP-60', '(N=1)', null)]))
            .toEqual({ motivo: 'SEM_ARQUIVO', frase: fraseSemArquivo('DP-60') })
        expect(escolherDesenho(item('DP-61', { N: 1 }), [porVariavel('DP-61', '(N=1)', '   ')]))
            .toMatchObject({ motivo: 'SEM_ARQUIVO' })
        expect(escolherDesenho(item('DP-Y', {}, 'SÓ NO ÍNDICE | EUROPA 42'), [principal('*Y', 'SÓ NO ÍNDICE | EUROPA 42', null)]))
            .toMatchObject({ motivo: 'SEM_ARQUIVO' })
    })
    it('o catálogo VAZIO não desenha nada, e não estoura', () => {
        expect(escolherDesenho(item('DP-02', { HI: 1 }, 'JANELA DE CORRER 02 FOLHAS MÓVEIS | EUROPA 42'), [])).toMatchObject({ motivo: 'SEM_CANDIDATA' })
    })
})

// ══ O DESEMPATE PELO GRUPO DA FAMÍLIA ══
// As quatro linhas abaixo são as de produção, medidas em 16/11/2026: "JANELA DE CORRER 02 FOLHAS MÓVEIS" está no grupo
// PVC (dois códigos, UM arquivo) e no Blindex (outro arquivo). Sem o desempate, a DP-02 — a tipologia mais usada — e as
// DP-09, DP-11 e DP-20 sairiam SEM figura. Com ele, a esquadria de PVC leva a de PVC, e NUNCA a de outro material.
describe('o desempate pelo GRUPO, quando a mesma forma existe em dois materiais', () => {
    const DOIS_MATERIAIS: DesenhoDoCatalogo[] = [
        principal('VT-JS2-01', 'JANELA DE CORRER 02 FOLHAS MÓVEIS | BLINDEX', 'tipologias/blindex-vidro-temperado/00001__VT_JCS_001.jpg', 'Blindex / vidro temperado'),
        principal('*DP-02', 'JANELA DE CORRER 02 FOLHAS MÓVEIS | EUROPA 42', 'tipologias/pvc/00001__PNG_JANELA_200_todas_moveis_correta.png'),
        principal('WOL-EUR42-JCR200', 'JANELA DE CORRER 02 FOLHAS MÓVEIS | EUROPA 42', 'tipologias/pvc/00001__PNG_JANELA_200_todas_moveis_correta.png'),
    ]
    const daDP02 = (familia: string | null) => escolherDesenho({ tipologia: 'DP-02', descricao: 'JANELA DE CORRER 02 FOLHAS MÓVEIS | EUROPA 42', familia, valores: {} }, DOIS_MATERIAIS)

    it('a família PVC leva a figura de PVC — e nunca a do Blindex', () => {
        expect(daDP02('PVC')).toEqual({ caminho: 'tipologias/pvc/00001__PNG_JANELA_200_todas_moveis_correta.png', degrau: 'principal', condicao: null })
    })
    it('a família do item é lida sem caixa e sem acento, como o grupo do catálogo o escreve', () => {
        expect(daDP02('pvc')).toMatchObject({ caminho: expect.stringContaining('/pvc/') })
        expect(escolherDesenho({ tipologia: 'DP-02', descricao: 'JANELA DE CORRER 02 FOLHAS MÓVEIS | EUROPA 42', familia: 'blindex / vidro temperado', valores: {} }, DOIS_MATERIAIS))
            .toMatchObject({ caminho: expect.stringContaining('/blindex-') })
    })
    it('SEM família, nada: o desempate não acontece, e a recusa é a de duas candidatas', () => {
        expect(daDP02(null)).toEqual({ motivo: 'DUAS_CANDIDATAS', frase: fraseDeDuasCandidatas('DP-02', 2) })
        expect(daDP02('   ')).toMatchObject({ motivo: 'DUAS_CANDIDATAS' })
    })
    it('o GRUPO VAZIO no catálogo não casa com a família VAZIA do item: ausente não é igual a ausente (`ausente-vs-falso.md`)', () => {
        const semGrupo = [principal('*A', 'MESMA FORMA | EUROPA 42', 'a.png', null as unknown as string), principal('*B', 'MESMA FORMA | EUROPA 60', 'b.png')]
        expect(escolherDesenho({ tipologia: 'DP-X', descricao: 'MESMA FORMA | EUROPA 42', familia: null, valores: {} }, semGrupo))
            .toMatchObject({ motivo: 'DUAS_CANDIDATAS' })
    })
    it('família que não é nenhum dos grupos: recusa — nunca a "mais parecida" de outro material', () => {
        expect(daDP02('ALUMÍNIO')).toMatchObject({ motivo: 'DUAS_CANDIDATAS' })
    })
    it('DUAS figuras DENTRO do grupo da família: recusa, porque aí o grupo não desempata', () => {
        const duasNoPvc = [...DOIS_MATERIAIS, principal('OUTRO', 'JANELA DE CORRER 02 FOLHAS MÓVEIS | EUROPA 60', 'tipologias/pvc/outra.png')]
        expect(escolherDesenho({ tipologia: 'DP-02', descricao: 'JANELA DE CORRER 02 FOLHAS MÓVEIS | EUROPA 42', familia: 'PVC', valores: {} }, duasNoPvc))
            .toMatchObject({ motivo: 'DUAS_CANDIDATAS' })
    })
})

// ══ OS VALORES QUE A CONDIÇÃO LÊ ══
// Medido em 16/11/2026, nas 771 condições: dos 310 pares código × variável, 304 são variável da aba com padrão
// NUMÉRICO e 6 são de tipologia que o motor não tem; NENHUMA é fórmula. É por isso que ler o padrão numérico basta.
describe('os valores da condição (o padrão da aba e a escolha do vendedor)', () => {
    // a DP-017 em produção: N = "1 = 01 MÓDULO; 2 = 02 MÓDULOS", padrão 1; LT = o lado, padrão 1
    const DEF = { variaveis: [{ variavel: 'N', padrao: '1' }, { variavel: 'LT', padrao: '1' }, { variavel: 'MAI', padrao: 'MEDIDA DO VÃO' }] }

    it('o PADRÃO NUMÉRICO da aba entra; o padrão que é texto (ou fórmula) NÃO — a variável fica sem valor, e a falta sai nomeada', () => {
        expect(valoresDoDesenho(DEF, {})).toEqual({ N: 1, LT: 1 })
        const so = [porVariavel('DP-9', '(MAI=1)', 'x.jpg')]
        expect(escolherDesenho({ tipologia: 'DP-9', descricao: null, valores: valoresDoDesenho(DEF, {}) }, so))
            .toEqual({ motivo: 'VARIAVEL_SEM_VALOR', frase: fraseDeVariavelSemValor('DP-9', 'MAI') })
    })
    it('a ESCOLHA DO VENDEDOR vence o padrão, e é ela que escolhe a figura', () => {
        expect(valoresDoDesenho(DEF, { N: 2 })).toEqual({ N: 2, LT: 1 })
        const duas = [porVariavel('DP-017', '(LT=1) and (N=1)', 'um.png'), porVariavel('DP-017', '(LT=1) and (N=2)', 'dois.png')]
        expect(escolherDesenho({ tipologia: 'DP-017', descricao: null, valores: valoresDoDesenho(DEF, {}) }, duas)).toMatchObject({ caminho: 'um.png' })
        expect(escolherDesenho({ tipologia: 'DP-017', descricao: null, valores: valoresDoDesenho(DEF, { N: 2 }) }, duas)).toMatchObject({ caminho: 'dois.png' })
    })
    it('sem definição da tipologia (o item manual), nenhum valor — e nenhuma condição casa', () => {
        expect(valoresDoDesenho(null, {})).toEqual({})
        // a marca "o vendedor pediu as opções" é nula na chave: não é valor, e não entra
        expect(valoresDoDesenho(DEF, { N: null } as unknown as Record<string, number>)).toEqual({ N: 1, LT: 1 })
    })
})

export {}
