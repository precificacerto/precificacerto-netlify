/**
 * @jest-environment node
 *
 * PORTÃO — A FRONTEIRA ENTRE O AGENTE E O MOTOR, nas escolhas (dono do produto, 20/11/2026): "vamos tirar do motor a decisão". Cada variável com
 * opções chega ao motor DECIDIDA — o vendedor, a política da empresa, o padrão do motor que não acrescenta peça, a principal —, e o motor recusa
 * decidir ele (`VARIAVEL_DE_IDENTIFICACAO`). A tipologia real é a DP-02 do motor da Wolff (`abas-do-motor-wolff-DP-02.json`) e a DP-39 do caso
 * Gerson Boss (`fixtures/caso-gerson-boss.json`).
 */
jest.mock('@/supabase/admin', () => ({ supabaseAdmin: {} }))
/* eslint-disable @typescript-eslint/no-require-imports */
const A = () => require('@/lib/atendimentos-ia/avaliador-de-formulas') as typeof import('@/lib/atendimentos-ia/avaliador-de-formulas')
const F = () => require('@/lib/atendimentos-ia/fronteira-das-escolhas') as typeof import('@/lib/atendimentos-ia/fronteira-das-escolhas')
const P = () => require('@/lib/atendimentos-ia/politica-da-empresa') as typeof import('@/lib/atendimentos-ia/politica-da-empresa')
const AB = () => require('@/utils/atendimentos-ia-abas-do-motor') as typeof import('@/utils/atendimentos-ia-abas-do-motor')
const TIPOLOGIAS = require('@/lib/atendimentos-ia/abas-do-motor-wolff-DP-02.json')
const CASO = require('./fixtures/caso-gerson-boss.json') as { colunas: Record<string, string[]>; linhas: Record<string, unknown[][]> }
/* eslint-enable @typescript-eslint/no-require-imports */
import type { Tipologia } from '@/lib/atendimentos-ia/avaliador-de-formulas'

function dp02(): Tipologia {
    const r = A().lerTipologia(TIPOLOGIAS, 'DP-02')
    if ('recusas' in r) throw new Error('fixture recusado')
    return r.tipologia
}
function doCaso(codigo: string): Tipologia {
    const abas = Object.fromEntries(Object.keys(A().COLUNAS_LIDAS).map((nome) => {
        const aba = AB().abaDeclarada(nome)
        const cols = CASO.colunas[aba.tabela]
        const linhas = (CASO.linhas[aba.tabela] ?? []).map((v) => Object.fromEntries(cols.map((c, i) => [c, v[i]])))
        return [nome, AB().abaDoBanco(aba, linhas)]
    }))
    const r = A().lerTipologia(abas as never, codigo)
    if ('recusas' in r) throw new Error('fixture recusado')
    return r.tipologia
}
/** A política da De Paula como o dono do produto gravou no nicho em 20/11/2026. */
const DE_PAULA = { usa_arremate_interno: true, guarnicao_interna: 'BZ1770', usa_arremate_externo: true, guarnicao_externa: 'BZ0010', montagem_arremate_externo: 'PERIMETRAL', medida_arremate_externo: 'VAO+50MM (CORTE 90/90)' }

describe('(1) o arremate é POLÍTICA DA EMPRESA: definido, vale sem perguntar; não definido, nunca entra pelo padrão do motor', () => {
    it('a política da De Paula na DP-02: BZ1770 (ARI 2), BZ0010 (ARE 1), VÃO+50 (MAE 2) — origem "politica"', () => {
        const r = F().escolhasDoCalculo(dp02(), {}, DE_PAULA)
        expect([r.escolhas.ARI, r.escolhas.ARE, r.escolhas.MAE]).toEqual([2, 1, 2])
        expect([r.origem.ARI, r.origem.ARE, r.origem.MAE]).toEqual(['politica', 'politica', 'politica'])
        expect(r.voltas).toEqual([])
    })
    it('sem política: o padrão do motor (ARI 1 = BZ0006, ARE 1 = BZ0010) ACRESCENTA peça — entra a principal, a opção sem a peça', () => {
        const r = F().escolhasDoCalculo(dp02(), {}, {})
        expect([r.escolhas.ARI, r.escolhas.ARE]).toEqual([4, 2])
        expect([r.origem.ARI, r.origem.ARE]).toEqual(['principal', 'principal'])
    })
    it('o que o vendedor disse vence a política; "usa = não" na política é a opção sem a peça, achada pelas peças', () => {
        const r = F().escolhasDoCalculo(dp02(), { ARI: 3 }, { ...DE_PAULA, usa_arremate_externo: false })
        expect([r.escolhas.ARI, r.origem.ARI]).toEqual([3, 'vendedor'])
        expect([r.escolhas.ARE, r.origem.ARE]).toEqual([2, 'politica'])
    })
    it('a política que não casa NENHUMA opção volta ao agente, nomeada, e nada é escolhido para ela', () => {
        const r = F().escolhasDoCalculo(dp02(), {}, { ...DE_PAULA, guarnicao_interna: 'BZ9999' })
        expect(r.escolhas.ARI).toBeUndefined()
        expect(r.voltas.map((v) => v.variavel)).toEqual(['ARI'])
        expect(r.voltas[0].frase).toContain('guarnicao_interna = "BZ9999"')
    })
})

describe('(2) o padrão do motor só vale quando NÃO acrescenta peça — senão a principal; sem principal, volta ao agente', () => {
    const base = (): Tipologia => ({ ...dp02() })
    /** Uma tipologia mínima: a variável X com três opções e as linhas que cada uma liga. */
    function sintetica(padrao: string, condicoes: string[]): Tipologia {
        const t = base()
        return {
            ...t,
            variaveis: [{ variavel: 'X', descricao: 'PEÇA X', padrao, condicao: 'sempre', opcoes: '1 = UM; 2 = DOIS; 3 = TRÊS', condicao_opcoes: null }],
            perfis: condicoes.map((condicao, i) => ({ perfil: `P${i}`, descricao: `P${i}`, corte: '90/90', qtd: '1', medida: 'L', posicao: 'Largura', esp_vidro: null as string | null, condicao })),
            insumos: [], vidros: [],
        }
    }
    it('o padrão que só TROCA uma peça por outra (as opções não se contêm) vale: é o motor aplicando, não acrescentando', () => {
        const r = F().escolhasDoCalculo(sintetica('1', ['(X=1)', '(X=2)', '(X=3)']), {}, {})
        expect([r.escolhas.X, r.origem.X]).toEqual([1, 'padrao_do_motor'])
    })
    it('o padrão que ACRESCENTA (a opção 2 tem menos linhas, contidas nas dele): a principal, a de menos', () => {
        const r = F().escolhasDoCalculo(sintetica('1', ['(X=1) or (X=2)', '(X=1)', '(X=1) or (X=3)']), {}, {})
        // X=1: {0,1,2}; X=2: {0}; X=3: {2} — 2 e 3 não se contêm: nenhuma é "a de menos"
        expect(r.escolhas.X).toBeUndefined()
        expect(r.voltas.map((v) => v.variavel)).toEqual(['X'])
        expect(r.voltas[0].frase).toContain('nenhuma é a de menos')
        // com a opção 3 ligando também a linha 0, a 2 está contida em todas: ela é a principal
        const r2 = F().escolhasDoCalculo(sintetica('1', ['(X=1) or (X=2) or (X=3)', '(X=1)', '(X=1) or (X=3)']), {}, {})
        expect([r2.escolhas.X, r2.origem.X]).toEqual([2, 'principal'])
    })
    it('a RESSALVA DA TRAVESSA (19/11/2026): a tipologia que diz "travessa" no nome fica com a peça do padrão', () => {
        const t = { ...sintetica('1', ['(UT=1)', 'sempre']), variaveis: [{ variavel: 'UT', descricao: 'USA TRAVESSA?', padrao: '1', condicao: 'sempre', opcoes: '1 = SIM; 2 = NÃO', condicao_opcoes: null as string | null }] }
        expect(F().escolhasDoCalculo(t, {}, {}).escolhas.UT).toBe(2)
        expect(F().escolhasDoCalculo(t, {}, {}, 'PORTA DE CORRER COM TRAVESSA | EUROPA 42').escolhas.UT).toBe(1)
    })
    it('O CASO REAL do Gerson Boss: na DP-39, o arremate de piso (ARRP, Padrão 1 = SIM, o AMP340) acrescenta peça e sai pela principal (NÃO)', () => {
        const r = F().escolhasDoCalculo(doCaso('DP-39'), {}, DE_PAULA)
        expect([r.escolhas.ARRP, r.origem.ARRP]).toEqual([0, 'principal'])
        // e o que só troca (a cor dos acessórios) fica no padrão do motor
        expect(r.origem.CA).toBe('padrao_do_motor')
    })
})

describe('(3) a TRAVA no motor: com as escolhas vindas da fronteira, o padrão não decide variação lá dentro', () => {
    it('variável COM opções sem valor: VARIAVEL_DE_IDENTIFICACAO, nomeada; sem a marca, o de antes (o padrão)', () => {
        const t = dp02()
        const com = A().avaliarTipologia({ tipologia: t, L_mm: 1200, H_mm: 1000, escolhas: {}, espessura_vidro_mm: 5, semDecidirVariacao: true })
        expect(com.ok).toBe(false)
        expect(!com.ok && com.recusas.some((x: { motivo: string }) => x.motivo === 'VARIAVEL_DE_IDENTIFICACAO')).toBe(true)
        const sem = A().avaliarTipologia({ tipologia: t, L_mm: 1200, H_mm: 1000, escolhas: {}, espessura_vidro_mm: 5 })
        expect(sem.ok).toBe(true)
        // com as escolhas da fronteira, a avaliação fecha com a marca
        const decididas = F().escolhasDoCalculo(t, {}, DE_PAULA).escolhas
        expect(A().avaliarTipologia({ tipologia: t, L_mm: 1200, H_mm: 1000, escolhas: decididas, espessura_vidro_mm: 5, semDecidirVariacao: true }).ok).toBe(true)
    })
})

describe('(4) a política: a EMPRESA sobre o NICHO, campo a campo; a tradução é estrita, pelo rótulo da opção', () => {
    it('NULL herda o nicho; false da empresa é decisão e vence o true do nicho', () => {
        expect(P().politicaEfetiva(null, { usa_arremate_interno: true, guarnicao_interna: 'BZ1770' })).toEqual({ usa_arremate_interno: true, guarnicao_interna: 'BZ1770' })
        expect(P().politicaEfetiva({ usa_arremate_interno: false, guarnicao_interna: null }, { usa_arremate_interno: true, guarnicao_interna: 'BZ1770' }))
            .toEqual({ usa_arremate_interno: false, guarnicao_interna: 'BZ1770' })
    })
    it('a política que casa MAIS DE UMA opção é recusa nomeada — nunca a primeira', () => {
        const ari = { variavel: 'ARI', opcoes: '1 = BZ1770 - ARREMATE 70MM; 2 = BZ1770 - ARREMATE 70MM LAMINADO; 3 = SEM ARREMATE INTERNO' }
        const t = P().traduzirPolitica('DP-XX', ari, DE_PAULA)
        expect(t && 'recusa' in t ? t.recusa : null).toContain('mais de uma opção de ARI')
    })
    it('cores, cor predominante e serra NÃO são lidas daqui (a fonte é mp_categoria.config, decisão de 03/11/2026)', () => {
        const p = P().politicaEfetiva({ cores_perfil: ['BRANCO'], cor_perfil_predominante: 'BRANCO', serra_mm: 5, barra_mm: 6000, solda: 'SPVCAL 6MM' }, null)
        expect(p).toEqual({})
    })
    it('o booleano casa o rótulo SIM ou NÃO; o texto casa o COMEÇO do rótulo, sem acento nem espaço; o que não casa é recusa nomeada', () => {
        const rl = { variavel: 'RL', opcoes: '1 = SIM; 2 = NÃO' }
        expect(P().traduzirPolitica('DP-02', rl, { regiao_litoranea: false })).toEqual({ valor: 2, campo: 'regiao_litoranea' })
        expect(P().traduzirPolitica('DP-02', rl, {})).toBeNull()
        const mae = { variavel: 'MAE', opcoes: '1 = MEDIDA DO VÃO (CORTE 45); 2 = VÃO+90MM (CORTE 90/90) - PARA AJUSTE EM OBRA [90,00]' }
        // a DP-90 da De Paula: a política diz VÃO+50, e a opção 2 dela é VÃO+90 — recusa, nunca "a mais parecida"
        const t = P().traduzirPolitica('DP-90', mae, DE_PAULA)
        expect(t && 'recusa' in t ? t.recusa : null).toContain('na tipologia DP-90 nenhuma opção de MAE')
    })
})
