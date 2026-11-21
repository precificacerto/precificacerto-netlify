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
    // A NATUREZA DA VARIÁVEL (20261121000001)
    it('natureza CALCULO: o motor resolve com o padrão — mesmo o que ACRESCENTA peça —, e nunca volta ao agente', () => {
        const t = sintetica('1', ['(X=1) or (X=2)', '(X=1)', '(X=1) or (X=3)'])
        const calc = { porVariavel: { X: { natureza: 'CALCULO' as const, opcao: null as string | null } } }
        const r = F().escolhasDoCalculo(t, {}, calc)
        expect([r.escolhas.X, r.origem.X, r.voltas]).toEqual([1, 'calculo', []])
        // o vendedor continua vencendo
        expect(F().escolhasDoCalculo(t, { X: 3 }, calc).escolhas.X).toBe(3)
    })
    it('natureza ITEM: a fronteira de sempre (o padrão que acrescenta peça sem principal volta ao agente)', () => {
        const t = sintetica('1', ['(X=1) or (X=2)', '(X=1)', '(X=1) or (X=3)'])
        const r = F().escolhasDoCalculo(t, {}, { porVariavel: { X: { natureza: 'ITEM' as const, opcao: null as string | null } } })
        expect(r.voltas.map((v) => v.variavel)).toEqual(['X'])
    })
    it('natureza POLITICA de QUALQUER variável (não só as do mapa): a opção pelo começo do rótulo; SIM/NÃO pelo rótulo inteiro', () => {
        const t = sintetica('1', ['(X=1)', '(X=2)', '(X=3)'])
        expect(F().escolhasDoCalculo(t, {}, { porVariavel: { X: { natureza: 'POLITICA' as const, opcao: 'dois' } } }).escolhas.X).toBe(2)
        const ut = { ...sintetica('1', ['(UT=1)', 'sempre']), variaveis: [{ variavel: 'UT', descricao: 'USA TRAVESSA?', padrao: '1', condicao: 'sempre', opcoes: '1 = SIM; 2 = NÃO; 3 = NÃO SEI', condicao_opcoes: null as string | null }] }
        const r = F().escolhasDoCalculo(ut, {}, { porVariavel: { UT: { natureza: 'POLITICA' as const, opcao: 'NAO' } } })
        expect([r.escolhas.UT, r.origem.UT]).toEqual([2, 'politica'])
        // mais de uma opção começando pelo texto: volta ao agente, nomeada
        const amb = F().escolhasDoCalculo(ut, {}, { porVariavel: { UT: { natureza: 'POLITICA' as const, opcao: 'N' } } })
        expect(amb.voltas[0].frase).toContain('a política da empresa diz UT = "N", e na tipologia')
    })
    it('a natureza vazia NÃO cai nos campos de antes: com porVariavel, o mapa não é lido', () => {
        const ari = { variavel: 'ARI', opcoes: '1 = BZ0006 - ARREMATE 65MM; 2 = BZ1770 - ARREMATE 70MM; 4 = SEM ARREMATE INTERNO' }
        expect(P().traduzirPolitica('DP-02', ari, { usa_arremate_interno: true, guarnicao_interna: 'BZ1770', porVariavel: {} })).toBeNull()
        expect(P().traduzirPolitica('DP-02', ari, { usa_arremate_interno: true, guarnicao_interna: 'BZ1770' })).toEqual({ valor: 2, campo: 'guarnicao_interna' })
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
        expect('recusas' in com && com.recusas.some((x) => x.motivo === 'VARIAVEL_DE_IDENTIFICACAO')).toBe(true)
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
    it('o FECHAMENTO e o INTERLOCK não são lidos da política (20/11/2026): o texto da De Paula não diz uma opção só — nunca recusa por eles', () => {
        const mfi = { variavel: 'MFI', opcoes: '1 = CREMONA COM MAÇANETA SEM CHAVE; 2 = CREMONA COM MAÇANETA COM CHAVE' }
        expect(P().traduzirPolitica('DP-39', mfi, { fechamento_folha_interna: 'CREMONA + MACANETA' } as never)).toBeNull()
        expect(P().traduzirPolitica('DP-39', { variavel: 'MFE', opcoes: mfi.opcoes }, { fechamento_folha_externa: 'CREMONA COM MAÇANETA' } as never)).toBeNull()
        expect(P().traduzirPolitica('DP-39', { variavel: 'INT', opcoes: '1 = ÚNICO; 2 = INTERLOCK + CAPA' }, { modelo_interlock: 'ÚNICO' } as never)).toBeNull()
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

/*
 * (9) O ARREMATE EXTERNO SEM O "VÃO+50" (dono do produto, 21/11/2026): onde a variação não oferece a opção da política, entra a de AJUSTE EM OBRA
 * dela (a de menor acréscimo), e só sem nenhuma a opção 1 — nunca calado. As opções são as medidas no motor da Wolff em 21/11/2026.
 */
describe('(9) a MAE sem a opção da política: o ajuste em obra que a variação oferece', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const P = () => require('@/lib/atendimentos-ia/politica-da-empresa') as typeof import('@/lib/atendimentos-ia/politica-da-empresa')
    const POLITICA = { porVariavel: { MAE: { natureza: 'POLITICA' as const, opcao: 'VAO+50MM (CORTE 90/90)' } } }
    const MEDIDAS = {
        'DP-113': '1 = MEDIDA DO VÃO (CORTE 45); 2 = VÃO+40MM (CORTE 90/90) - PARA AJUSTE EM OBRA [40,00]',
        'DP-49': '1 = MEDIDA DO VÃO (CORTE 45/45); 2 = VÃO+100MM (CORTE 90/90) - PARA AJUSTE EM OBRA [100,00]',
        'DP-90': '1 = MEDIDA DO VÃO (CORTE 45/45); 2 = VÃO+90MM (CORTE 90/90) - PARA AJUSTE EM OBRA [90,00]',
        'DP-02': '1 = MEDIDA DO VÃO (CORTE 45/45); 2 = VÃO+50MM (CORTE 90/90) - PARA AJUSTE EM OBRA [50,00]',
    }
    const traduz = (codigo: string, opcoes: string) => P().traduzirPolitica(codigo, { variavel: 'MAE', opcoes }, POLITICA)
    it('a variação COM VÃO+50: casa pelo texto, sem ajuste', () => {
        expect(traduz('DP-02', MEDIDAS['DP-02'])).toEqual({ valor: 2, campo: 'MAE' })
    })
    it('as cinco que travavam: entra a de ajuste em obra que a variação oferece, com o motivo nas palavras do motor', () => {
        expect(traduz('DP-113', MEDIDAS['DP-113'])).toEqual({ valor: 2, campo: 'MAE', ajuste:
            'a política diz MAE = "VAO+50MM (CORTE 90/90)", que a tipologia DP-113 não oferece; entrou a opção 2 = VÃO+40MM (CORTE 90/90) - PARA AJUSTE EM OBRA (ajuste em obra de menor acréscimo)' })
        expect(traduz('DP-49', MEDIDAS['DP-49'])).toMatchObject({ valor: 2, ajuste: expect.stringContaining('VÃO+100MM (CORTE 90/90) - PARA AJUSTE EM OBRA') })
        expect(traduz('DP-90', MEDIDAS['DP-90'])).toMatchObject({ valor: 2, ajuste: expect.stringContaining('VÃO+90MM') })
    })
    it('mais de uma de ajuste: a de MENOR acréscimo, nunca a primeira da lista', () => {
        expect(traduz('X', '1 = MEDIDA DO VÃO; 2 = VÃO+90MM (CORTE 90/90) - PARA AJUSTE EM OBRA; 3 = VÃO+40MM (CORTE 90/90) - PARA AJUSTE EM OBRA'))
            .toMatchObject({ valor: 3, ajuste: expect.stringContaining('VÃO+40MM') })
    })
    it('o ajuste exige as palavras do motor: CORTE 90/90 E AJUSTE EM OBRA — sem elas, a opção 1', () => {
        expect(traduz('X', '1 = MEDIDA DO VÃO (CORTE 45); 2 = VÃO+40MM (CORTE 45/45) - PARA AJUSTE EM OBRA'))
            .toMatchObject({ valor: 1, ajuste: expect.stringContaining('sem opção de ajuste em obra: a opção 1 do motor') })
        expect(traduz('X', '1 = MEDIDA DO VÃO (CORTE 45); 2 = VÃO+40MM (CORTE 90/90)')).toMatchObject({ valor: 1 })
    })
    it('nenhuma de ajuste e nenhuma opção 1: recusa nomeada, nunca uma opção inventada', () => {
        expect(traduz('X', '2 = MEDIDA DO VÃO (CORTE 45)')).toMatchObject({ recusa: expect.stringContaining('nenhuma opção de MAE') })
    })
    it('mais de uma casando pelo texto continua RECUSA (a ambiguidade não é a falta)', () => {
        expect(traduz('X', '1 = VAO+50MM (CORTE 90/90) A; 2 = VAO+50MM (CORTE 90/90) B; 3 = VÃO+40MM (CORTE 90/90) - PARA AJUSTE EM OBRA'))
            .toMatchObject({ recusa: expect.stringContaining('mais de uma opção') })
    })
    it('a regra é SÓ da MAE: outra variável sem a opção continua recusa', () => {
        expect(P().traduzirPolitica('DP-113', { variavel: 'ARE', opcoes: MEDIDAS['DP-113'] }, { porVariavel: { ARE: { natureza: 'POLITICA' as const, opcao: 'VAO+50' } } }))
            .toMatchObject({ recusa: expect.any(String) })
    })
    it('na fronteira: a origem é politica_ajuste_em_obra e o ajuste vai em `ajustes`; com a opção existente, origem politica e nada em ajustes', () => {
        const t = (opcoes: string): Tipologia => ({ ...dp02(), variaveis: [{ variavel: 'MAE', descricao: 'MEDIDA DO ARREMATE EXTERNO', padrao: '1', condicao: 'sempre', opcoes, condicao_opcoes: null }], perfis: [], insumos: [], vidros: [] })
        const r = F().escolhasDoCalculo(t(MEDIDAS['DP-113']), {}, POLITICA)
        expect([r.escolhas.MAE, r.origem.MAE, r.ajustes.map((a) => a.variavel)]).toEqual([2, 'politica_ajuste_em_obra', ['MAE']])
        const ok = F().escolhasDoCalculo(t(MEDIDAS['DP-02']), {}, POLITICA)
        expect([ok.escolhas.MAE, ok.origem.MAE, ok.ajustes]).toEqual([2, 'politica', []])
        // o vendedor que disse vence a política (a hierarquia de sempre)
        expect(F().escolhasDoCalculo(t(MEDIDAS['DP-113']), { MAE: 1 }, POLITICA).ajustes).toEqual([])
    })
    it('a linha do documento diz de onde veio, com o rótulo do motor', () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const E = require('@/lib/atendimentos-ia/escolhas-da-tipologia') as typeof import('@/lib/atendimentos-ia/escolhas-da-tipologia')
        const tip = { variaveis: [{ variavel: 'MAE', descricao: 'MEDIDA DO ARREMATE EXTERNO', padrao: '1', condicao: 'sempre', opcoes: MEDIDAS['DP-113'], condicao_opcoes: null }] }
        expect(E.descreverArremate(tip, { MAE: 2 }, { MAE: 'politica_ajuste_em_obra' }))
            .toBe('medida do arremate externo: VÃO+40MM (CORTE 90/90) - PARA AJUSTE EM OBRA (a opção da política não existe nesta tipologia: ajuste em obra)')
    })
})
