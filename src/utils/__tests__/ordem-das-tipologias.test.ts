/**
 * A ORDEM DETERMINANTE DAS TIPOLOGIAS (dono do produto, 20/11/2026): FAMÍLIA > LINHA > FORMATO > FOLHAS/MÓDULOS > VARIAÇÕES. O catálogo é o do motor
 * de produção 259035a9 (`fixtures/catalogo-do-motor-259035a9.json`, 170 tipologias, conferido por md5 contra o banco em 20/11/2026).
 */
import { arvoreDoCatalogo, compararCodigo, compararNaSecao, formatoDe, normalizarQualificador, posicaoDaLinha, posicaoNaOrdem, principalDoGrupo, palavrasPedidas, secaoDe } from '@/lib/atendimentos-ia/ordem-das-tipologias'
import { tipologiaPadrao } from '@/lib/atendimentos-ia/tipologia-padrao'
import { trechosDoAcumulado } from '@/lib/atendimentos-ia/tipologias-candidatas'
import type { CandidatoDeTipologia } from '@/lib/atendimentos-ia/levantamento-da-conversa'
import type { ItemDoLevantamento } from '@/lib/atendimentos-ia/levantamento-em-montagem'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const CAT = require('./fixtures/catalogo-do-motor-259035a9.json') as { tipologias: [string, string, string, string][] }

const CANDIDATOS: CandidatoDeTipologia[] = CAT.tipologias.map(([tipologia, tipo, linha, descricao]) => ({
    tipologia, tipo, linha, descricao, familia: 'PVC', rotulo: 'PVC Wolf', fornecedor: 'Wolff', larg_min_mm: null as number | null, larg_max_mm: null as number | null, alt_min_mm: null as number | null, alt_max_mm: null as number | null,
}))
const item = (largura_mm: number | null = null, altura_mm: number | null = null): ItemDoLevantamento =>
    ({ ordem: 1, tipologia: null, largura_mm, altura_mm, quantidade: 1, cor_perfil: null, vidro: null, escolhas: null, familia: null } as unknown as ItemDoLevantamento)
const de = (t: string) => CANDIDATOS.find((c) => c.tipologia === t)!
const principal = (codigo: string, texto = '', cs = CANDIDATOS) => principalDoGrupo(codigo, cs, item(1500, 1200), texto) ?? codigo

describe('a classificação lida pelas BARRAS VERTICAIS: a primeira parte é formato e folhas, a última é a linha, o meio são os qualificadores', () => {
    it('a contagem dos qualificadores é a das partes do meio — sem lista de palavras', () => {
        expect(posicaoNaOrdem(de('DP-09')).qualificadores).toEqual([])
        expect(posicaoNaOrdem(de('DP-10')).qualificadores).toEqual(['VENEZIANA'])
        expect(posicaoNaOrdem(de('DP-19')).qualificadores).toEqual(['02 VIDRO 01 TELA', 'PEITORIL FIXO'])
        expect(posicaoNaOrdem(de('DP-151')).qualificadores).toEqual(['VIDRO'])
        // a descrição sem parte do meio (só formato e linha) e a sem barra nenhuma não têm qualificador
        expect(posicaoNaOrdem({ ...de('DP-09'), descricao: 'JANELA DE CORRER 03 FOLHAS MÓVEIS' }).qualificadores).toEqual([])
    })
    it('os SINÔNIMOS normalizam antes de comparar: FECH = FECHAMENTO, 2 = 02, VZ VENT = VENEZIANA VENTILADA, plural = singular', () => {
        expect(posicaoNaOrdem(de('DP-83')).qualificadores[0]).toBe(posicaoNaOrdem(de('DP-82')).qualificadores[0])
        expect(posicaoNaOrdem(de('DP-70')).qualificadores[0]).toBe(posicaoNaOrdem(de('DP-69')).qualificadores[0])
        expect(posicaoNaOrdem(de('DP-58')).qualificadores[0]).toBe(posicaoNaOrdem(de('DP-57')).qualificadores[0])
        expect(posicaoNaOrdem(de('DP-97')).qualificadores[0]).toBe(posicaoNaOrdem(de('DP-96')).qualificadores[0])
        expect(normalizarQualificador('2 Vidros - 1 Tela')).toBe('02 VIDRO 01 TELA')
        expect(normalizarQualificador('FECH CENTRAL')).toBe('FECHAMENTO CENTRAL')
    })
    it('o FORMATO: janela e porta separados também no oscilo-batente (DP-122 ≠ DP-165); "+ GIRO" é formato próprio (DP-126 ≠ DP-127); a persiana é do formato', () => {
        const f = (t: string) => posicaoNaOrdem(de(t)).formato
        expect([f('DP-122'), f('DP-165')]).toEqual(['JANELA OSCILO BATENTE', 'PORTA OSCILO BATENTE'])
        expect([f('DP-126'), f('DP-127'), f('DP-167')]).toEqual(['JANELA OSCILO BATENTE', 'JANELA OSCILO BATENTE + GIRO', 'PORTA OSCILO BATENTE + GIRO'])
        expect(formatoDe(posicaoNaOrdem(de('DP-126')))).not.toBe(formatoDe(posicaoNaOrdem(de('DP-127'))))
        expect([f('DP-07'), f('DP-116'), f('DP-168'), f('DP-01'), f('DP-142')]).toEqual(['JANELA DE CORRER COM PERSIANA', 'JANELA DE GIRO COM PERSIANA', 'PORTA DE GIRO PIVOTANTE', 'MAXIM-AR', 'FIXO'])
    })
    it('a QUANTIDADE: as folhas (com ou sem "MÓVEIS"), os módulos verticais ("V" variável; sem vertical, 1), e "variavel" no alumínio', () => {
        const q = (t: string) => posicaoNaOrdem(de(t)).quantidade
        expect([q('DP-09'), q('DP-58'), q('DP-113'), q('DP-128'), q('DP-129'), q('DP-137'), q('DP-146'), q('DP-133')]).toEqual([3, 3, 1, 1, 1, 2, 2, 'V'])
        const alu = { ...de('DP-09'), familia: 'ALUMINIO', linha: 'ALU SUPREMA', tipologia: 'AL-1', descricao: 'JANELA DE CORRER | SUPREMA' }
        const comTela = { ...alu, tipologia: 'AL-2', descricao: 'JANELA DE CORRER | COM TELA | SUPREMA' }
        expect(posicaoNaOrdem(alu)).toEqual(expect.objectContaining({ familia: 'ALUMINIO', formato: 'JANELA DE CORRER', quantidade: 'variavel', qualificadores: [] }))
        expect(secaoDe(posicaoNaOrdem(comTela))).toBe(secaoDe(posicaoNaOrdem(alu)))
        expect(principalDoGrupo('AL-2', [alu, comTela], item(1500, 1200), '')).toBe('AL-1')
    })
    it('a ordem das linhas: EUROPA 42, EUROPA 60, DESIGN; a linha desconhecida, depois delas', () => {
        expect(['PVC WOLFF EUROPA 42', 'PVC WOLFF EUROPA 60', 'PVC WOLFF DESIGN', 'ALU SUPREMA', null].map(posicaoDaLinha)).toEqual([0, 1, 2, 3, 3])
        expect(posicaoDaLinha('PVC WOLFF EUROPA 600')).toBe(3)
    })
    it('o código pelo NÚMERO, nunca pelo texto nem pela ordem do arquivo: DP-09 < DP-10 < DP-017 < DP-18', () => {
        expect(['DP-18', 'DP-10', 'DP-017', 'DP-09'].sort(compararCodigo)).toEqual(['DP-09', 'DP-10', 'DP-017', 'DP-18'])
        expect(compararCodigo('DP-017', 'DP-17')).not.toBe(0)
    })
    it('o FORNECEDOR não entra na escolha (é do insumo, no preço): duas iguais de fornecedores diferentes se ordenam pelo código', () => {
        const outra: CandidatoDeTipologia = { ...de('DP-09'), tipologia: 'DP-09B', fornecedor: 'Veza' }
        expect(compararNaSecao(de('DP-09'), outra)).toBeLessThan(0)
        expect(compararNaSecao({ ...de('DP-09'), fornecedor: 'Zzz' } as CandidatoDeTipologia, outra)).toBeLessThan(0)
    })
})

describe('a PRINCIPAL: na seção, a de MENOS qualificadores; empate, o MENOR código — salvo o que o vendedor pediu com todas as letras', () => {
    it('O EXEMPLO REAL: "janela de correr 3 folhas" em PVC — a DP-09 é a principal, e qualquer das outras sem pedido vira ela', () => {
        for (const t of ['DP-10', 'DP-11', 'DP-12', 'DP-13', 'DP-14', 'DP-15', 'DP-017', 'DP-18']) expect([t, principal(t)]).toEqual([t, 'DP-09'])
        expect(principalDoGrupo('DP-09', CANDIDATOS, item(1500, 1200), 'janela de correr 3 folhas vidro 4mm')).toBeNull()
    })
    it('o mesmo pedido pelo PADRÃO DO CÓDIGO: "janela de correr 3 folhas" cai na DP-09 — sem perguntar a linha', () => {
        const trechos = trechosDoAcumulado(['janela de correr 3 folhas 1,50 x 1,20'], [...new Set(CANDIDATOS.map((c) => c.tipo as string))])
        expect(tipologiaPadrao(item(1500, 1200), 'janela', trechos, CANDIDATOS)).toEqual({ tipologia: 'DP-09' })
    })
    it('a porta de giro 01 folha: a DP-151 ("| VIDRO") é a principal — não há "zero qualificadores", e a DP-153, a DP-155 e a DP-156 viram ela', () => {
        for (const t of ['DP-152', 'DP-153', 'DP-155', 'DP-156', 'DP-158']) expect([t, principal(t)]).toEqual([t, 'DP-151'])
        expect(principal('DP-151', 'porta de giro vidro 8mm')).toBe('DP-151')
    })
    it('o qualificador PEDIDO fica: "com veneziana" é a DP-10, não a DP-11; "com bandeira" a DP-13; "peitoril" a DP-14; "2 vidros e 1 tela" a DP-12', () => {
        expect(principal('DP-11', 'janela de correr 3 folhas com veneziana')).toBe('DP-10')
        expect(principal('DP-09', 'com veneziana')).toBe('DP-10')
        expect(principal('DP-09', 'com bandeira')).toBe('DP-13')
        expect(principal('DP-09', 'com peitoril')).toBe('DP-14')
        expect(principal('DP-09', 'com 2 vidros e 1 tela')).toBe('DP-12')
        // o vidro dito ("vidro 4mm") não pede "02 VIDRO - 01 TELA": falta a tela
        expect(principal('DP-12', 'vidro 4mm')).toBe('DP-09')
        expect([...palavrasPedidas('trilho de alumínio, vidro 4mm, pvc branco', ['TRILHO ALUMINIO', 'TRILHO PVC EMBUTIDO', '02 VIDRO 01 TELA'])]).toEqual(['TRILHO', 'ALUMINIO'])
        // "com tela" pede a tela, e a DP-12 a tem (o vidro dela não precisa ser dito)
        expect(principal('DP-09', 'janela de correr 3 folhas com tela')).toBe('DP-12')
        // a travessa dita na maxim-ar com bandeira: a DP-134; o perfil de modulação: a DP-129
        expect(principal('DP-129', 'maxim-ar com bandeira e travessa')).toBe('DP-134')
        expect(principal('DP-134', 'maxim-ar com bandeira, perfil de modulação')).toBe('DP-129')
    })
    it('os desempates com pedido: o total de qualificadores, e depois as palavras que sobram no qualificador que toca no pedido — antes do código', () => {
        const sint = (t: string, meio: string): CandidatoDeTipologia => ({ ...de('DP-09'), tipologia: t, descricao: `JANELA DE CORRER 05 FOLHAS MÓVEIS | ${meio} | EUROPA 42` })
        // os dois tocam no pedido; a de UM qualificador vence a de dois, mesmo com o código maior
        const dois = [sint('DP-901', 'VENEZIANA | TRILHO ALUMÍNIO'), sint('DP-902', 'VENEZIANA TRILHO ALUMÍNIO')]
        expect(principalDoGrupo('DP-901', dois, item(1500, 1200), 'com veneziana e trilho de alumínio')).toBe('DP-902')
        // um qualificador cada; a que não traz palavra a mais vence, mesmo com o código maior
        const sobra = [sint('DP-903', 'VENEZIANA VENTILADA'), sint('DP-904', 'VENEZIANA')]
        expect(principalDoGrupo('DP-903', sobra, item(1500, 1200), 'com veneziana')).toBe('DP-904')
    })
    it('a porta de correr 02 folhas: DP-39 é a principal; DP-40 a DP-47 viram ela sem pedido; com o pedido, a pedida', () => {
        for (const t of ['DP-40', 'DP-41', 'DP-42', 'DP-43', 'DP-44', 'DP-45', 'DP-46', 'DP-47']) expect([t, principal(t)]).toEqual([t, 'DP-39'])
        expect(principal('DP-39', 'trilho de alumínio')).toBe('DP-41')
        expect(principal('DP-39', 'com veneziana e trilho embutido em pvc')).toBe('DP-43')
        // "pvc" sozinho é a família, não o trilho
        expect(principal('DP-40', 'porta de correr pvc')).toBe('DP-39')
    })
    it('o empate de qualificadores se resolve pelo MENOR código, nunca pela ordem do arquivo: DP-29 × DP-32, DP-138 × DP-139, DP-148 × DP-149', () => {
        expect(principal('DP-32')).toBe('DP-29')
        expect(principal('DP-139')).toBe('DP-138')
        expect(principal('DP-149')).toBe('DP-148')
        expect(principal('DP-32', '', [...CANDIDATOS].reverse())).toBe('DP-29')
    })
    it('a maxim-ar: a DP-01 (DESIGN) vira a DP-128 — a linha se deduz (a 60 ganha da DESIGN), e a DP-128 empata com a DP-132 e vence pelo código', () => {
        expect(principal('DP-01')).toBe('DP-128')
        expect(principal('DP-132')).toBe('DP-128')
        expect(principal('DP-01', '', [...CANDIDATOS].reverse())).toBe('DP-128')
        expect(principal('DP-143')).toBe('DP-142')
        // a bandeira pedida: DP-129 e DP-134 têm dois qualificadores, e o código decide
        expect(principal('DP-134', 'maxim-ar com bandeira')).toBe('DP-129')
    })
    it('a persiana é do FORMATO: a DP-07 é principal dela, e a DP-02 da sua', () => {
        expect(principal('DP-08')).toBe('DP-07')
        expect(principal('DP-07')).toBe('DP-07')
        expect(principal('DP-02')).toBe('DP-02')
    })
    it('a FAMÍLIA é nível de verdade: a tipologia de outra família nunca é a principal de uma do PVC', () => {
        const alu: CandidatoDeTipologia = { ...de('DP-09'), tipologia: 'AL-09', familia: 'ALUMINIO', linha: 'ALU SUPREMA', descricao: 'JANELA DE CORRER 03 FOLHAS MÓVEIS | SUPREMA' }
        const semA09 = CANDIDATOS.filter((c) => c.tipologia !== 'DP-09')
        // sem a DP-09, a principal do PVC é a DP-10 (um qualificador, menor código) — a AL-09, lisa, de outra família, não conta
        expect(principalDoGrupo('DP-13', [...semA09, alu], item(1500, 1200), '')).toBe('DP-10')
        expect(principalDoGrupo('AL-09', [...CANDIDATOS, alu], item(1500, 1200), '')).toBeNull()
    })
    it('a medida que não cabe na principal NUNCA empurra para uma variação que ninguém pediu: nada muda; e, entre linhas, passa à linha seguinte', () => {
        const semCaber = CANDIDATOS.map((c) => (c.tipologia === 'DP-09' ? { ...c, larg_max_mm: 1000 } : c))
        expect(principalDoGrupo('DP-13', semCaber, item(1500, 1200), '')).toBeNull()
        expect(principalDoGrupo('DP-09', semCaber, item(1500, 1200), '')).toBeNull()
        // a DP-128 e a DP-132 (o primeiro lugar da 60) sem caber: a DESIGN (DP-01) — nunca a DP-129, com bandeira
        const a60Limitada = CANDIDATOS.map((c) => (['DP-128', 'DP-132'].includes(c.tipologia) ? { ...c, larg_max_mm: 1000 } : c))
        expect(principalDoGrupo('DP-129', a60Limitada, item(1500, 1200), '')).toBe('DP-01')
        // só a DP-128 sem caber: a DP-132, empatada com ela no primeiro lugar
        const so128 = CANDIDATOS.map((c) => (c.tipologia === 'DP-128' ? { ...c, larg_max_mm: 1000 } : c))
        expect(principalDoGrupo('DP-01', so128, item(1500, 1200), '')).toBe('DP-132')
    })
    it('duas linhas que a ordem não conhece, empatadas: a linha não se adivinha', () => {
        const alu = (t: string, l: string): CandidatoDeTipologia => ({ ...de('DP-09'), tipologia: t, familia: 'ALUMINIO', linha: `ALU ${l}`, descricao: `JANELA DE CORRER | TELA | ${l}` })
        expect(principalDoGrupo('AL-2', [alu('AL-1', 'SUPREMA'), alu('AL-2', 'GOLD'), { ...alu('AL-3', 'GOLD'), descricao: 'JANELA DE CORRER | GOLD' }], item(1500, 1200), '')).toBeNull()
        // e o empate na posição da 42 (duas linhas "EUROPA 42") não passa à 60 de trás: a linha não se adivinha, nem se pula
        const pvc = (t: string, l: string, meio = ''): CandidatoDeTipologia => ({ ...de('DP-09'), tipologia: t, linha: l, descricao: `JANELA DE CORRER 07 FOLHAS MÓVEIS |${meio ? ` ${meio} |` : ''} ${l}` })
        const empate42 = [pvc('XX-1', 'PVC A EUROPA 42'), pvc('XX-2', 'PVC B EUROPA 42'), pvc('XX-3', 'PVC WOLFF EUROPA 60', 'VENEZIANA')]
        expect(principalDoGrupo('XX-1', empate42, item(1500, 1200), '')).toBeNull()
    })
})

describe('a ÁRVORE do catálogo 259035a9: família > linha > formato > folhas/módulos, a principal e quantas variações', () => {
    it('43 seções, 170 tipologias, toda tipologia em exatamente uma', () => {
        const a = arvoreDoCatalogo(CANDIDATOS)
        expect(a).toHaveLength(43)
        expect(a.reduce((n, r) => n + r.variacoes + 1, 0)).toBe(170)
        expect(new Set(a.flatMap((r) => r.codigos)).size).toBe(170)
        const ramo = (formato: string, q: number | string, linha = 'PVC WOLFF EUROPA 42') => a.find((r) => r.formato === formato && r.quantidade === q && r.linha === linha)!
        expect([ramo('JANELA DE CORRER', 3).principal, ramo('JANELA DE CORRER', 3).variacoes]).toEqual(['DP-09', 8])
        expect([ramo('PORTA DE GIRO', 1, 'PVC WOLFF EUROPA 60').principal, ramo('PORTA DE GIRO', 1, 'PVC WOLFF EUROPA 60').variacoes]).toEqual(['DP-151', 7])
        expect(ramo('MAXIM-AR', 1, 'PVC WOLFF EUROPA 60').principal).toBe('DP-128')
        expect(ramo('MAXIM-AR', 1, 'PVC WOLFF DESIGN').principal).toBe('DP-01')
    })
})
