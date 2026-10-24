/**
 * PORTÃO — o AVALIADOR DE FÓRMULAS (`src/lib/atendimentos-ia/avaliador-de-formulas.ts`), começando
 * SÓ pela DP-02: dadas a tipologia, L e H em mm e as escolhas das variáveis, a lista de PEÇAS que o
 * agrupador de barras recebe.
 *
 * O FIXTURE (`fixtures/fixture_DP-02.json`) foi extraído pelo dono do produto do
 * Motor_Wolf_PVC.xlsx em 24/10/2026 e copiado aqui como veio, aba por aba — MENOS a aba
 * 'Fórmulas da família (EUROPA 42)' (68 linhas), que o avaliador não lê. As linhas da família que
 * este portão compara estão citadas no bloco (9), com a fonte.
 *
 * ═════ O ORÁCULO É A CONTA DA DP-02, FEITA À MÃO — NÃO A COLUNA "Em L/H" DA FAMÍLIA ═════
 * O pedido mandava conferir cada comprimento contra "Em L/H" da família. Medido no próprio fixture:
 * a família mostra a fórmula MAIS COMUM entre 109 tipologias ("% padrão"), com as variáveis da
 * família (NF = 4, NP = 3), e a DP-02 tem fórmula PRÓPRIA na aba 'Fórmulas' — HFOL = HMC−88.4
 * (família 87,8), LFOL com 66·QMA (família 92), HREFF = HFOL−80−80 (família 106), LTRI = LMC−104.2
 * (família 104), NF = 2. Conferir contra a família faria o portão exigir números que a DP-02 nunca
 * produz. A divergência está medida, variável a variável, no bloco (9).
 *
 * AS CONTAS À MÃO, L = 1200, H = 1000, X = Y = 0 (WOLFIL/WOLFIH), SPVCAL = WOLSPVC = 6, NF = 2,
 * NP = 2, QMA = NF−1 = 1, &ARI = 33 (ARI = 1: "[33,00]"), &MAE = 50 (MAE = 2: "[50,00]"):
 *   LMC  = L−X = 1200                    HMC  = H−Y = 1000
 *   LARI = (L−X)+(&ARI·2) = 1266         HARI = (H−Y)+(&ARI·2) = 1066
 *   LARE = L+&MAE = 1250                 HARE = H+&MAE = 1050
 *   LFOL = (LMC−86.4+66·QMA)/NF = 1179.6/2 = 589.8
 *   HFOL = HMC−88.4 = 911.6
 *   LREFF = LFOL−160 = 429.8             HREFF = HFOL−160 = 751.6
 *   LREFM = LMC−164 = 1036               HREFM = HMC−164 = 836
 *   LTRI = LMC−104.2 = 1095.8
 *   LBAG = LFOL−100 = 489.8              HBAG = HFOL−100 = 811.6
 *   Qtd do BZ0012 = ⌈(1200/450+1)·2⌉ + ⌈(1000/450+1)·2⌉ = ⌈7,333…⌉ + ⌈6,444…⌉ = 8 + 7 = 15
 *
 * O RECORTE QUE FECHA SEM VALOR INVENTADO. O pedido era "ARI e ARE com as opções padrão". Com ARE
 * no padrão (1), MAE também fica no padrão (1) = "MEDIDA DO VÃO (CORTE 45/45)" — SEM colchete. Pela
 * regra do próprio pedido, `&MAE` sem colchete é ERRO, nunca zero: as linhas 10 e 11 (BZ0010,
 * LARE/HARE) são recusadas. Esse é o caso (5). O recorte que fecha é MAE = 2 ("[50,00]"), no
 * caso (4); e ARE = 2 (sem arremate externo) fecha também, no caso (6).
 *
 * Cada caso fica VERMELHO sem a sua regra: a bateria está em `scripts/harness/avaliador-de-formulas/`.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
// Lido DENTRO dos casos: no commit do portão o módulo ainda não existe, e cada caso tem de ficar
// vermelho por conta própria.
type Avaliador = typeof import('@/lib/atendimentos-ia/avaliador-de-formulas')
const A = () => require('@/lib/atendimentos-ia/avaliador-de-formulas') as Avaliador
type Agrupador = typeof import('@/lib/atendimentos-ia/agrupador-de-barras')
const G = () => require('@/lib/atendimentos-ia/agrupador-de-barras') as Agrupador
const FIXTURE = require('./fixtures/fixture_DP-02.json')
/* eslint-enable @typescript-eslint/no-require-imports */
// O estreitamento é por `'recusas' in r` / `'recusa' in r`: com `strictNullChecks: false`, o tsc não
// estreita a união pelo booleano `ok`.

type Linha = Record<string, unknown>

function dp02() {
    const r = A().lerTipologia(FIXTURE, 'DP-02')
    if ('recusas' in r) throw new Error('fixture recusado: ' + r.recusas.map((x) => x.mensagem).join(' | '))
    return r.tipologia
}
type Entrada = { L_mm: number; H_mm: number; escolhas?: Record<string, number>; espessura_vidro_mm?: number | null }
function avaliar(e: Entrada, tipologia = dp02()) {
    return A().avaliarTipologia({ tipologia, ...e })
}
function ok(e: Entrada, tipologia = dp02()) {
    const r = avaliar(e, tipologia)
    if ('recusas' in r) throw new Error('recusado: ' + r.recusas.map((x) => x.mensagem).join(' | '))
    return r
}
function texto(t: string, valores: Record<string, number> = {}) {
    return A().avaliarTexto(t, valores)
}
function valor(t: string, valores: Record<string, number> = {}) {
    const r = texto(t, valores)
    if ('recusa' in r) throw new Error('recusado: ' + r.recusa.mensagem)
    return r.valor
}
function recusa(t: string, valores: Record<string, number> = {}) {
    const r = texto(t, valores)
    if (!('recusa' in r)) throw new Error('esperava recusa, veio ' + JSON.stringify(r.valor))
    return r.recusa
}
/** A peça como o portão a compara: os seis campos, nesta ordem. */
const p = (codigo: string, descricao: string, comprimento_mm: number, quantidade: number, corte: string, posicao: string) =>
    ({ codigo, descricao, comprimento_mm, quantidade, corte, posicao })

/** Uma tipologia sintética, para os casos que a DP-02 não exercita (ciclo, quantidade, nome solto). */
function sintetica(o: { formulas?: Array<[string, string]>; perfis?: Linha[]; variaveis?: Linha[] }) {
    return {
        codigo: 'SINT',
        detalhe: { larg_min_mm: null, larg_max_mm: null, alt_min_mm: null, alt_max_mm: null },
        variaveis: (o.variaveis ?? []) as never,
        formulas: (o.formulas ?? []).map(([variavel, formula]) => ({ variavel, formula })),
        perfis: (o.perfis ?? []).map((x) => ({ perfil: 'P/SINT', descricao: 'PEÇA', corte: '90/90', qtd: '1', medida: '100', posicao: 'Largura', esp_vidro: null, condicao: 'sempre', ...x })) as never,
        validacoes: [],
    }
}

// ═══════════════════════════════════════════════════════════════════════════════════════
describe('(1) o PARSER — aritmética exata, precedência, funções, e nada de eval', () => {
    it('precedência e associatividade: 2+3*4 = 14, (2+3)*4 = 20, 10-4-3 = 3, 12/4/3 = 1', () => {
        expect(valor('2+3*4')).toBe(14)
        expect(valor('(2+3)*4')).toBe(20)
        expect(valor('10-4-3')).toBe(3)
        expect(valor('12/4/3')).toBe(1)
    })

    it('a conta é EXATA: (0.1+0.2)=0.3 é verdadeiro, e ARREDMAIOR((0.1+0.2)*10) é 3 — em ponto flutuante daria 4', () => {
        // medido: em JavaScript, (0.1+0.2)*10 = 3.0000000000000004, e Math.ceil dá 4
        expect((0.1 + 0.2) * 10).not.toBe(3)
        expect(valor('(0.1+0.2)=0.3')).toBe(true)
        expect(valor('ARREDMAIOR((0.1+0.2)*10)')).toBe(3)
    })

    it('ARREDMAIOR é o teto: 2.1 → 3, 2 → 2, e (900/450+1)*2 = 6 fica 6', () => {
        expect(valor('ARREDMAIOR(2.1)')).toBe(3)
        expect(valor('ARREDMAIOR(2)')).toBe(2)
        expect(valor('ARREDMAIOR(((900/450)+1)*2)')).toBe(6)
    })

    it('comparações e lógica: =, >, <, >=, <=, and, or', () => {
        expect(valor('(1=1) and (2>3)')).toBe(false)
        expect(valor('(1=1) or (2>3)')).toBe(true)
        expect(valor('(2>=2) and (2<=2) and (1<2)')).toBe(true)
        expect(valor('A=3', { A: 3 })).toBe(true)
    })

    it('IIF escolhe o ramo E SÓ AVALIA O RAMO ESCOLHIDO: IIF(1<3,5,1/0) = 5', () => {
        expect(valor('IIF(1<3,5,6)')).toBe(5)
        expect(valor('IIF(4<3,5,6)')).toBe(6)
        expect(valor('IIF(1<3,5,1/0)')).toBe(5)
    })

    it('nomes vêm dos valores dados', () => {
        expect(valor('(L-X)+(33*2)', { L: 1200, X: 0 })).toBe(1266)
    })

    it('RECUSAS NOMEADAS: função desconhecida, IIF com 4 argumentos, parênteses abertos, caractere estranho, divisão por zero, tipo errado, nome sem valor', () => {
        expect(recusa('SOMA(1,2)')).toEqual(expect.objectContaining({ motivo: 'FUNCAO_DESCONHECIDA', formula: 'SOMA(1,2)' }))
        expect(recusa('IIF(M=1,80,64,8)', { M: 1 })).toEqual(expect.objectContaining({ motivo: 'ARGUMENTOS_DA_FUNCAO' }))
        expect(recusa('(1+2')).toEqual(expect.objectContaining({ motivo: 'NAO_PARSEIA', formula: '(1+2' }))
        expect(recusa('1 $ 2')).toEqual(expect.objectContaining({ motivo: 'NAO_PARSEIA' }))
        expect(recusa('1/0')).toEqual(expect.objectContaining({ motivo: 'DIVISAO_POR_ZERO' }))
        expect(recusa('1+(2>1)')).toEqual(expect.objectContaining({ motivo: 'TIPO_ERRADO' }))
        expect(recusa('ZZZ+1')).toEqual(expect.objectContaining({ motivo: 'VARIAVEL_SEM_VALOR', variavel: 'ZZZ' }))
    })

    it('a vírgula decimal da família ("87,8") NÃO é número: é separador de argumento, e fora de função não parseia', () => {
        expect(recusa('(HMC-87,8)', { HMC: 1000 })).toEqual(expect.objectContaining({ motivo: 'NAO_PARSEIA' }))
    })

    it('o módulo não usa eval nem new Function', () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const fonte = require('fs').readFileSync(require('path').join(__dirname, '../../lib/atendimentos-ia/avaliador-de-formulas.ts'), 'utf8') as string
        const semComentario = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
        expect(semComentario).not.toMatch(/\beval\s*\(/)
        expect(semComentario).not.toMatch(/new\s+Function\b/)
    })
})

describe('(2) a TIPOLOGIA é lida pelo NOME da coluna, nunca pela posição', () => {
    it('a DP-02: 19 variáveis, 21 fórmulas, 34 perfis, 1 validação, e os limites do detalhe', () => {
        const t = dp02()
        expect(t.variaveis).toHaveLength(19)
        expect(t.formulas).toHaveLength(21)
        expect(t.perfis).toHaveLength(34)
        expect(t.validacoes).toHaveLength(1)
        expect(t.detalhe).toEqual({ larg_min_mm: null, larg_max_mm: null, alt_min_mm: 388, alt_max_mm: 2439 })
    })

    it('com as colunas da aba Perfis em OUTRA ORDEM no cabeçalho, a tipologia lida é a mesma', () => {
        const abas = JSON.parse(JSON.stringify(FIXTURE))
        abas['Perfis'].cabecalho = [...abas['Perfis'].cabecalho].reverse()
        const r = A().lerTipologia(abas, 'DP-02')
        if ('recusas' in r) throw new Error('recusado')
        expect(r.tipologia).toEqual(dp02())
    })

    it('coluna que falta no cabeçalho é RECUSA nomeando a aba e a coluna', () => {
        const abas = JSON.parse(JSON.stringify(FIXTURE))
        abas['Perfis'].cabecalho = abas['Perfis'].cabecalho.filter((c: string) => c !== 'Medida')
        const r = A().lerTipologia(abas, 'DP-02')
        expect('recusas' in r && r.recusas).toEqual([expect.objectContaining({ motivo: 'CABECALHO_AUSENTE', aba: 'Perfis', coluna: 'Medida' })])
    })

    it('tipologia que não está no detalhe é recusada', () => {
        const r = A().lerTipologia(FIXTURE, 'DP-99')
        expect('recusas' in r && r.recusas.map((x) => x.motivo)).toEqual(['TIPOLOGIA_AUSENTE'])
    })
})

describe('(3) as VARIÁVEIS, as CONSTANTES do Leia-me e o &X', () => {
    it('as constantes do Leia-me: WOLFIL = 0, WOLFIH = 0, WOLSPVC = 6', () => {
        expect(A().CONSTANTES_DO_LEIA_ME).toEqual({ WOLFIL: 0, WOLFIH: 0, WOLSPVC: 6 })
    })

    it('X e Y saem do Padrão (WOLFIL/WOLFIH) e SPVCAL da fórmula (WOLSPVC): 0, 0 e 6', () => {
        const e = { tipologia: dp02(), L_mm: 1200, H_mm: 1000, escolhas: { MAE: 2 }, espessura_vidro_mm: 6 }
        expect(A().valorDaVariavel(e, 'X')).toBe(0)
        expect(A().valorDaVariavel(e, 'Y')).toBe(0)
        expect(A().valorDaVariavel(e, 'SPVCAL')).toBe(6)
    })

    it('a ESCOLHA vale sobre o Padrão: INT = 2 → IL42 e KT42 no lugar do IL36', () => {
        const r = ok({ L_mm: 1200, H_mm: 1000, escolhas: { MAE: 2, INT: 2 }, espessura_vidro_mm: 6 })
        const codigos = r.pecas.map((x) => x.codigo)
        expect(codigos).toContain('IL42/WOLFF')
        expect(codigos).toContain('KT42/WOLFF')
        expect(codigos).not.toContain('IL36/WOLFF')
    })

    it('&ARI = 33: o número entre colchetes da opção ESCOLHIDA, com vírgula decimal', () => {
        const e = { tipologia: dp02(), L_mm: 1200, H_mm: 1000, escolhas: { MAE: 2 }, espessura_vidro_mm: 6 }
        expect(A().valorDaVariavel(e, 'LARI')).toBe(1266)
        expect(A().valorDaVariavel(e, 'HARI')).toBe(1066)
        expect(A().valorDaVariavel({ ...e, escolhas: { MAE: 3 } }, 'LARE')).toBe(1300)
    })

    it('escolha de variável que não existe é recusada; escolha fora das opções também', () => {
        const r1 = avaliar({ L_mm: 1200, H_mm: 1000, escolhas: { MAE: 2, ZZZ: 1 }, espessura_vidro_mm: 6 })
        expect('recusas' in r1 && r1.recusas).toEqual([expect.objectContaining({ motivo: 'ESCOLHA_DESCONHECIDA', variavel: 'ZZZ' })])
        const r2 = avaliar({ L_mm: 1200, H_mm: 1000, escolhas: { MAE: 9 }, espessura_vidro_mm: 6 })
        expect('recusas' in r2 && r2.recusas).toEqual([expect.objectContaining({ motivo: 'ESCOLHA_FORA_DAS_OPCOES', variavel: 'MAE' })])
    })

    it('L e H têm de ser medidas positivas', () => {
        const r = avaliar({ L_mm: 0, H_mm: -5, escolhas: { MAE: 2 }, espessura_vidro_mm: 6 })
        expect('recusas' in r && r.recusas.map((x) => x.motivo)).toEqual(['MEDIDA_INVALIDA', 'MEDIDA_INVALIDA'])
    })
})

describe('(4) A DP-02, L = 1200, H = 1000, MAE = 2, vidro 6 mm — peça a peça, conferida à mão', () => {
    const ENTRADA: Entrada = { L_mm: 1200, H_mm: 1000, escolhas: { MAE: 2 }, espessura_vidro_mm: 6 }

    it('as 17 peças, na ordem da aba, com o comprimento de cada uma conferido contra a conta do cabeçalho', () => {
        expect(ok(ENTRADA).pecas).toEqual([
            p('BZ0006/WOLFF', 'GUARNIÇÃO', 1266, 2, '45/45', 'Largura'),                                              // linha 1: LARI
            p('BZ0006/WOLFF', 'GUARNIÇÃO', 1066, 2, '45/45', 'Altura'),                                               // linha 2: HARI
            p('BZ0012/WOLFF', 'BASE DE GUARNIÇAO', 10, 15, '90/90', 'Largura'),                                       // linha 3: Medida 10, Qtd 8+7
            p('BZ0010/WOLFF', 'APLIQUE - ARREMATE', 1250, 2, '90/90', 'Largura'),                                     // linha 12: LARE
            p('BZ0010/WOLFF', 'APLIQUE - ARREMATE', 1050, 2, '90/90', 'Altura'),                                      // linha 13: HARE
            p('HF88/WOLFF', 'MARCO DE CORRER - 2 TRILHOS', 1206, 2, '45S/45S', 'Largura'),                            // linha 19: LMC+6
            p('HF88/WOLFF', 'MARCO DE CORRER - 2 TRILHOS', 1006, 2, '45S/45S', 'Altura'),                             // linha 20: HMC+6
            p('1023/WOLFF', 'CLICK GUIA DE ALUMÍNIO PARA TRILHO DE PVC', 1095.8, 2, '90/90', 'Largura'),              // linha 21: LTRI, Qtd NP
            p('8432/WOLFF', 'REFORÇO EM AÇO GALVANIZADO  PARA HF112 OU HF 88S (17 X 29 X 17)', 1036, 2, '90/90', 'Largura'), // linha 22: LREFM
            p('8432/WOLFF', 'REFORÇO EM AÇO GALVANIZADO  PARA HF112 OU HF 88S (17 X 29 X 17)', 836, 2, '90/90', 'Altura'),   // linha 23: HREFM
            p('SF66/WOLFF', 'FOLHA PARA JANELA', 595.8, 4, '45S/45S', 'Largura'),                                     // linha 24: LFOL+6, Qtd NF*2
            p('SF66/WOLFF', 'FOLHA PARA JANELA', 917.6, 4, '45S/45S', 'Altura'),                                      // linha 25: HFOL+6
            p('8433/WOLFF', 'REFORÇO EM AÇO GALVANIZADO PARA SF66  (42 X 66)', 429.8, 4, '90/90', 'Largura'),         // linha 26: LREFF
            p('8433/WOLFF', 'REFORÇO EM AÇO GALVANIZADO PARA SF66  (42 X 66)', 751.6, 4, '90/90', 'Altura'),          // linha 27: HREFF
            p('IL36/WOLFF', 'INTERLOCK / MÃO DE AMIGO', 911.6, 2, '90/90', 'Altura'),                                 // linha 28: HFOL, Qtd QMA*2
            p('GB25/WOLFF', 'BAGUETE DE 25MM', 489.8, 4, '45/45', 'Largura'),                                         // linha 31: LBAG
            p('GB25/WOLFF', 'BAGUETE DE 25MM', 811.6, 4, '45/45', 'Altura'),                                          // linha 32: HBAG
        ])
    })

    it('as 34 linhas da aba: quais entraram, e por que cada uma das outras ficou de fora', () => {
        const linhas = ok(ENTRADA).linhas
        expect(linhas).toHaveLength(34)
        expect(linhas.filter((l) => l.entrou).map((l) => l.linha)).toEqual([1, 2, 3, 12, 13, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 31, 32])
        expect(linhas.filter((l) => l.motivo === 'ESPESSURA_NAO_ATENDIDA').map((l) => l.linha)).toEqual([33, 34])
        expect(linhas.filter((l) => l.motivo === 'CONDICAO_FALSA').map((l) => l.linha))
            .toEqual([4, 5, 6, 7, 8, 9, 10, 11, 14, 15, 16, 17, 18, 29, 30])
    })

    it('a cadeia HBAG → HFOL → HMC → (H−Y) resolve por dependência: 811.6, 911.6, 1000', () => {
        const e = { tipologia: dp02(), ...ENTRADA }
        expect(A().valorDaVariavel(e, 'HBAG')).toBe(811.6)
        expect(A().valorDaVariavel(e, 'HFOL')).toBe(911.6)
        expect(A().valorDaVariavel(e, 'HMC')).toBe(1000)
    })

    it('dentro dos limites: nenhum aviso', () => {
        expect(ok(ENTRADA).avisos).toEqual([])
    })

    it('as peças são a entrada do agrupador de barras: ele as aceita e agrupa', () => {
        const r = ok(ENTRADA)
        const barras = Object.fromEntries([...new Set(r.pecas.map((x) => x.codigo))].map((c) => [c, { comprimento_mm: 6000 }]))
        const g = G().agruparEmBarras({ pecas: r.pecas, barras, serra_mm: 5 })
        if ('recusas' in g) throw new Error('o agrupador recusou: ' + g.recusas.map((x) => x.mensagem).join(' | '))
        expect(g.por_codigo.reduce((s, c) => s + c.n_pecas, 0)).toBe(r.pecas.reduce((s, x) => s + x.quantidade, 0))
    })
})

describe('(5) OS PADRÕES (ARE = 1, MAE = 1) NÃO FECHAM: &MAE sem colchete é recusa nomeada, nunca zero', () => {
    it('as linhas 10 e 11 (BZ0010, LARE/HARE) são recusadas, cada uma com o perfil, a variável e a fórmula', () => {
        const r = avaliar({ L_mm: 1200, H_mm: 1000, espessura_vidro_mm: 6 })
        expect('recusas' in r).toBe(true)
        if (!('recusas' in r)) return
        expect(r.recusas).toEqual([
            expect.objectContaining({ motivo: 'MEDIDA_DA_OPCAO_AUSENTE', linha: 10, perfil: 'BZ0010/WOLFF', campo: 'Medida', variavel: 'MAE', formula: '(L+&MAE)' }),
            expect.objectContaining({ motivo: 'MEDIDA_DA_OPCAO_AUSENTE', linha: 11, perfil: 'BZ0010/WOLFF', campo: 'Medida', variavel: 'MAE', formula: '(H+&MAE)' }),
        ])
        expect(r.recusas[0].mensagem).toContain('MEDIDA DO VÃO (CORTE 45/45)')
    })

    it('com ARI = 1, o IIF de HARI NÃO avalia o ramo de &MAI — cuja opção padrão também não tem colchete', () => {
        const e = { tipologia: dp02(), L_mm: 1200, H_mm: 1000, escolhas: { MAE: 2 }, espessura_vidro_mm: 6 }
        expect(A().valorDaVariavel(e, 'HARI')).toBe(1066)
    })

    it('com ARI = 3 e MAI no padrão, aí sim o ramo é avaliado, e &MAI sem colchete é recusa', () => {
        const r = avaliar({ L_mm: 1200, H_mm: 1000, escolhas: { MAE: 2, ARI: 3 }, espessura_vidro_mm: 6 })
        expect('recusas' in r && r.recusas.map((x) => [x.linha, x.motivo, x.variavel])).toEqual([
            [6, 'MEDIDA_DA_OPCAO_AUSENTE', 'MAI'], [7, 'MEDIDA_DA_OPCAO_AUSENTE', 'MAI'],
        ])
    })
})

describe('(6) ARE = 2 (sem arremate externo) também fecha — e LARE nem é calculada', () => {
    it('as 15 peças: as 17 do caso (4) menos as duas do arremate externo', () => {
        const r = ok({ L_mm: 1200, H_mm: 1000, escolhas: { ARE: 2 }, espessura_vidro_mm: 6 })
        expect(r.pecas).toHaveLength(15)
        expect(r.pecas.filter((x) => x.codigo === 'BZ0010/WOLFF')).toEqual([])
    })
})

describe('(7) os LIMITES não travam: calcula e devolve AVISO com o valor e o limite', () => {
    it('H = 380: HFOL = 291.6 fora de (299, 2351) e H abaixo de 388 — dois avisos, e as peças saem', () => {
        const r = ok({ L_mm: 1200, H_mm: 380, escolhas: { MAE: 2 }, espessura_vidro_mm: 6 })
        expect(r.pecas.length).toBeGreaterThan(0)
        expect(r.avisos).toEqual([
            expect.objectContaining({ origem: 'VALIDACAO', condicao: '(HFOL>299) and (HFOL<2351)', valores: { HFOL: 291.6 } }),
            expect.objectContaining({ origem: 'LIMITE', medida: 'H', limite: 'MIN', valor_mm: 380, limite_mm: 388, excesso_mm: 8 }),
        ])
        expect((r.avisos[0] as Linha).mensagem).toContain('MAIOR QUE 390MM')
        expect((r.avisos[1] as Linha).excesso_pct).toBeCloseTo((8 / 388) * 100, 6)
    })

    it('H = 2500: acima dos dois limites — HFOL = 2411.6 e H 61 mm acima de 2439', () => {
        const r = ok({ L_mm: 1200, H_mm: 2500, escolhas: { MAE: 2 }, espessura_vidro_mm: 6 })
        expect(r.avisos).toEqual([
            expect.objectContaining({ origem: 'VALIDACAO', valores: { HFOL: 2411.6 } }),
            expect.objectContaining({ origem: 'LIMITE', medida: 'H', limite: 'MAX', valor_mm: 2500, limite_mm: 2439, excesso_mm: 61 }),
        ])
        expect((r.avisos[1] as Linha).excesso_pct).toBeCloseTo((61 / 2439) * 100, 6)
    })

    it('largura sem limite no detalhe (null) não gera aviso nenhum — ausente não é zero', () => {
        expect(ok({ L_mm: 50000, H_mm: 1000, escolhas: { MAE: 2 }, espessura_vidro_mm: 6 }).avisos).toEqual([])
    })
})

describe('(8) o BAGUETE é escolhido pela espessura do vidro (Leia-me)', () => {
    it('vidro de 20 mm: entra o GB8, sai o GB25', () => {
        const codigos = ok({ L_mm: 1200, H_mm: 1000, escolhas: { MAE: 2 }, espessura_vidro_mm: 20 }).pecas.map((x) => x.codigo)
        expect(codigos.filter((c) => c.startsWith('GB'))).toEqual(['GB8/WOLFF', 'GB8/WOLFF'])
    })

    it('sem a espessura, as linhas de baguete são recusadas, uma a uma — nenhuma é suposta', () => {
        const r = avaliar({ L_mm: 1200, H_mm: 1000, escolhas: { MAE: 2 } })
        expect('recusas' in r && r.recusas.map((x) => [x.linha, x.motivo, x.perfil])).toEqual([
            [31, 'ESPESSURA_DO_VIDRO_AUSENTE', 'GB25/WOLFF'], [32, 'ESPESSURA_DO_VIDRO_AUSENTE', 'GB25/WOLFF'],
            [33, 'ESPESSURA_DO_VIDRO_AUSENTE', 'GB8/WOLFF'], [34, 'ESPESSURA_DO_VIDRO_AUSENTE', 'GB8/WOLFF'],
        ])
    })

    it('espessura que nenhum baguete atende (10 mm) é recusa — o vidro ficaria sem baguete em silêncio', () => {
        const r = avaliar({ L_mm: 1200, H_mm: 1000, escolhas: { MAE: 2 }, espessura_vidro_mm: 10 })
        expect('recusas' in r && r.recusas).toEqual([expect.objectContaining({ motivo: 'NENHUM_BAGUETE_PARA_A_ESPESSURA', espessura_vidro_mm: 10 })])
    })
})

describe('(9) A FAMÍLIA NÃO É O ORÁCULO DA DP-02 — a divergência, medida', () => {
    // "Em L/H" da aba 'Fórmulas da família (EUROPA 42)' do fixture do dono do produto, com
    // L = 1200 e H = 1000, e a conta da DP-02 pelo avaliador. Linha a linha da família:
    //   LMC "L"; HMC "H"; LARI "L + 66"; HARI "H + 33"; HFOL "H − 87,8"; HREFF "H − 299,8";
    //   HREFM "H − 164"; LREFM "L − 164"; LFOL "1/2·L + 2,8"; LBAG "1/4·L − 130,1";
    //   LREFF "1/4·L − 190,1"; LTRI "L − 104"; QMA "1"; SPVCAL "6"; NF "4"; NP "3".
    const FAMILIA: Record<string, number> = {
        LMC: 1200, HMC: 1000, LARI: 1266, HARI: 1033, HFOL: 912.2, HREFF: 700.2, HREFM: 836, LREFM: 1036,
        LFOL: 602.8, LBAG: 169.9, LREFF: 109.9, LTRI: 1096, QMA: 1, SPVCAL: 6, NF: 4, NP: 3,
    }

    it('coincidem SÓ LMC, HMC, LARI, HREFM, LREFM, QMA e SPVCAL; as outras nove divergem', () => {
        const e = { tipologia: dp02(), L_mm: 1200, H_mm: 1000, escolhas: { MAE: 2 }, espessura_vidro_mm: 6 }
        const iguais = Object.keys(FAMILIA).filter((v) => A().valorDaVariavel(e, v) === FAMILIA[v]).sort()
        expect(iguais).toEqual(['HMC', 'HREFM', 'LARI', 'LMC', 'LREFM', 'QMA', 'SPVCAL'])
    })
})

describe('(10) RECUSAS NOMEADAS da avaliação — ciclo, nome solto, quantidade, comprimento', () => {
    it('CICLO: A depende de B e B de A — recusa com a cadeia, em vez de estourar a pilha', () => {
        const t = sintetica({ formulas: [['A', '(B+1)'], ['B', '(A+1)']], perfis: [{ medida: 'A' }] })
        const r = avaliar({ L_mm: 1000, H_mm: 1000 }, t as never)
        expect('recusas' in r && r.recusas).toEqual([expect.objectContaining({ motivo: 'CICLO', linha: 1, perfil: 'P/SINT', campo: 'Medida', cadeia: ['A', 'B', 'A'] })])
    })

    it('variável sem valor nem padrão: recusa com o perfil, a linha, o campo e a variável', () => {
        const t = sintetica({ perfis: [{ medida: 'ZZZ+1' }] })
        const r = avaliar({ L_mm: 1000, H_mm: 1000 }, t as never)
        expect('recusas' in r && r.recusas).toEqual([expect.objectContaining({ motivo: 'VARIAVEL_SEM_VALOR', linha: 1, perfil: 'P/SINT', campo: 'Medida', variavel: 'ZZZ', formula: 'ZZZ+1' })])
    })

    it('condição que não parseia: recusa no campo Condição', () => {
        const t = sintetica({ perfis: [{ condicao: '(L>1000' }] })
        const r = avaliar({ L_mm: 1000, H_mm: 1000 }, t as never)
        expect('recusas' in r && r.recusas).toEqual([expect.objectContaining({ motivo: 'NAO_PARSEIA', campo: 'Condição', formula: '(L>1000' })])
    })

    it('Qtd fracionária é recusa; Qtd negativa é recusa; Qtd zero tira a linha, registrando por quê', () => {
        const t = sintetica({ perfis: [{ qtd: '3/2' }, { qtd: '0-1' }, { qtd: '0' }] })
        const r = avaliar({ L_mm: 1000, H_mm: 1000 }, t as never)
        expect('recusas' in r && r.recusas.map((x) => [x.linha, x.motivo])).toEqual([[1, 'QUANTIDADE_NAO_INTEIRA'], [2, 'QUANTIDADE_NEGATIVA']])
        const t2 = sintetica({ perfis: [{ qtd: '0' }] })
        const r2 = ok({ L_mm: 1000, H_mm: 1000 }, t2 as never)
        expect(r2.pecas).toEqual([])
        expect(r2.linhas).toEqual([expect.objectContaining({ linha: 1, entrou: false, motivo: 'QUANTIDADE_ZERO' })])
    })

    it('comprimento zero ou negativo é recusa — uma peça de −40 mm não vai para o agrupador', () => {
        const t = sintetica({ perfis: [{ medida: 'L-1040' }] })
        const r = avaliar({ L_mm: 1000, H_mm: 1000 }, t as never)
        expect('recusas' in r && r.recusas).toEqual([expect.objectContaining({ motivo: 'COMPRIMENTO_NAO_POSITIVO', linha: 1, comprimento_mm: -40 })])
    })

    it('todas as recusas saem, na ordem das linhas — uma não esconde as outras', () => {
        const t = sintetica({ perfis: [{ medida: 'AAA' }, { medida: 'BBB' }] })
        const r = avaliar({ L_mm: 1000, H_mm: 1000 }, t as never)
        expect('recusas' in r && r.recusas.map((x) => [x.linha, x.variavel])).toEqual([[1, 'AAA'], [2, 'BBB']])
    })
})
