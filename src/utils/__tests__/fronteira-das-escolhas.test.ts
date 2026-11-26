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
        const ari = { variavel: 'ARI', opcoes: '1 = BZ0006 - ARREMATE 65MM; 2 = BZ1770 - ARREMATE 70MM; 4 = SEM ARREMATE INTERNO', padrao: null as string | null }
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
        const mfi = { variavel: 'MFI', opcoes: '1 = CREMONA COM MAÇANETA SEM CHAVE; 2 = CREMONA COM MAÇANETA COM CHAVE', padrao: null as string | null }
        expect(P().traduzirPolitica('DP-39', mfi, { fechamento_folha_interna: 'CREMONA + MACANETA' } as never)).toBeNull()
        expect(P().traduzirPolitica('DP-39', { variavel: 'MFE', opcoes: mfi.opcoes, padrao: null as string | null }, { fechamento_folha_externa: 'CREMONA COM MAÇANETA' } as never)).toBeNull()
        expect(P().traduzirPolitica('DP-39', { variavel: 'INT', opcoes: '1 = ÚNICO; 2 = INTERLOCK + CAPA', padrao: null as string | null }, { modelo_interlock: 'ÚNICO' } as never)).toBeNull()
    })
    it('a política que casa MAIS DE UMA opção é recusa nomeada — nunca a primeira', () => {
        const ari = { variavel: 'ARI', opcoes: '1 = BZ1770 - ARREMATE 70MM; 2 = BZ1770 - ARREMATE 70MM LAMINADO; 3 = SEM ARREMATE INTERNO', padrao: null as string | null }
        const t = P().traduzirPolitica('DP-XX', ari, DE_PAULA)
        expect(t && 'recusa' in t ? t.recusa : null).toContain('mais de uma opção de ARI')
    })
    it('cores, cor predominante e serra NÃO são lidas daqui (a fonte é mp_categoria.config, decisão de 03/11/2026)', () => {
        const p = P().politicaEfetiva({ cores_perfil: ['BRANCO'], cor_perfil_predominante: 'BRANCO', serra_mm: 5, barra_mm: 6000, solda: 'SPVCAL 6MM' }, null)
        expect(p).toEqual({})
    })
    it('o booleano casa o rótulo SIM ou NÃO; o texto casa o COMEÇO do rótulo, sem acento nem espaço; o que não casa é recusa nomeada', () => {
        const rl = { variavel: 'RL', opcoes: '1 = SIM; 2 = NÃO', padrao: null as string | null }
        expect(P().traduzirPolitica('DP-02', rl, { regiao_litoranea: false })).toEqual({ valor: 2, campo: 'regiao_litoranea' })
        expect(P().traduzirPolitica('DP-02', rl, {})).toBeNull()
        const mae = { variavel: 'MAE', opcoes: '1 = MEDIDA DO VÃO (CORTE 45); 2 = VÃO+90MM (CORTE 90/90) - PARA AJUSTE EM OBRA [90,00]', padrao: null as string | null }
        // a DP-90 da De Paula: a política diz VÃO+50, e a opção 2 dela é VÃO+90 — recusa, nunca "a mais parecida"
        const t = P().traduzirPolitica('DP-90', mae, DE_PAULA)
        expect(t && 'recusa' in t ? t.recusa : null).toContain('na tipologia DP-90 nenhuma opção de MAE')
    })
})

/*
 * (9) O ARREMATE EXTERNO SEM O "VÃO+50" (dono do produto, 21/11/2026): onde a variação não oferece a opção da política, entra a de AJUSTE EM OBRA
 * dela (a de menor acréscimo), e só sem nenhuma o padrão da tipologia (22/11/2026; era a opção 1) — nunca calado. As opções são as medidas no motor da Wolff em 21/11/2026.
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
    const traduz = (codigo: string, opcoes: string) => P().traduzirPolitica(codigo, { variavel: 'MAE', opcoes, padrao: null as string | null }, POLITICA)
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
    const comPadrao = (codigo: string, opcoes: string, padrao: string | null) => P().traduzirPolitica(codigo, { variavel: 'MAE', opcoes, padrao }, POLITICA)
    it('o ajuste exige as palavras do motor: CORTE 90/90 E AJUSTE EM OBRA — sem elas, o PADRÃO DA TIPOLOGIA (22/11/2026)', () => {
        expect(comPadrao('X', '1 = MEDIDA DO VÃO (CORTE 45); 2 = VÃO+40MM (CORTE 45/45) - PARA AJUSTE EM OBRA', '1'))
            .toMatchObject({ valor: 1, ajuste: expect.stringContaining('sem opção de ajuste em obra: o padrão da tipologia') })
        expect(comPadrao('X', '1 = MEDIDA DO VÃO (CORTE 45); 2 = VÃO+40MM (CORTE 90/90)', '1')).toMatchObject({ valor: 1 })
    })
    it('sem opção de ajuste, vale o PADRÃO da tipologia, não a opção 1 fixa', () => {
        expect(comPadrao('X', '1 = MEDIDA DO VÃO (CORTE 45); 2 = VÃO+40MM (CORTE 90/90)', '2'))
            .toEqual({ valor: 2, campo: 'MAE', ajuste: 'a política diz MAE = "VAO+50MM (CORTE 90/90)", que a tipologia X não oferece; entrou a opção 2 = VÃO+40MM (CORTE 90/90) (sem opção de ajuste em obra: o padrão da tipologia)' })
    })
    it('com opção de ajuste, o padrão da tipologia NÃO é olhado: entra a de ajuste, mesmo com padrão 1 = MEDIDA DO VÃO', () => {
        expect(comPadrao('DP-113', MEDIDAS['DP-113'], '1')).toMatchObject({ valor: 2, ajuste: expect.stringContaining('ajuste em obra de menor acréscimo') })
    })
    it('nenhuma de ajuste e nenhum padrão válido na lista: recusa nomeada, nunca uma opção inventada', () => {
        expect(comPadrao('X', '2 = MEDIDA DO VÃO (CORTE 45)', null)).toMatchObject({ recusa: expect.stringContaining('nem há uma de ajuste em obra, nem um padrão na lista') })
        expect(comPadrao('X', '2 = MEDIDA DO VÃO (CORTE 45)', '1')).toMatchObject({ recusa: expect.any(String) })
    })
    it('mais de uma casando pelo texto continua RECUSA (a ambiguidade não é a falta)', () => {
        expect(traduz('X', '1 = VAO+50MM (CORTE 90/90) A; 2 = VAO+50MM (CORTE 90/90) B; 3 = VÃO+40MM (CORTE 90/90) - PARA AJUSTE EM OBRA'))
            .toMatchObject({ recusa: expect.stringContaining('mais de uma opção') })
    })
    it('a regra é SÓ da MAE: outra variável sem a opção continua recusa', () => {
        expect(P().traduzirPolitica('DP-113', { variavel: 'ARE', opcoes: MEDIDAS['DP-113'], padrao: null as string | null }, { porVariavel: { ARE: { natureza: 'POLITICA' as const, opcao: 'VAO+50' } } }))
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
        const tip = { variaveis: [{ variavel: 'MAE', descricao: 'MEDIDA DO ARREMATE EXTERNO', padrao: '1', condicao: 'sempre', opcoes: MEDIDAS['DP-113'], condicao_opcoes: null as string | null }] }
        expect(E.descreverArremate(tip, { MAE: 2 }, { MAE: 'politica_ajuste_em_obra' }))
            .toBe('medida do arremate externo: VÃO+40MM (CORTE 90/90) - PARA AJUSTE EM OBRA (a opção da política não existe nesta tipologia: ajuste em obra)')
    })
})

/*
 * (10) O FECHAMENTO (dono do produto, 22/11/2026): "por padrão, sempre e sem chave: cremona com maçaneta sem chave. Quando houver chave, será
 * informado através do vendedor." E a medição do chat: "CREMONA COM MAÇANETA" e "… SEM CHAVE" acionam os MESMOS insumos; "COM CHAVE" é outra
 * peça. A regra: texto; sem ele, e SÓ quando a lista não fala em chave, "X SEM CHAVE" casa "X". Nunca prefixo genérico. As listas são as 7
 * distintas de MFI/MFE com maçaneta no motor ativo (259035a9), medidas em 22/11/2026.
 */
describe('(10) o fechamento: a equivalência pela ausência de chave na lista, nunca por prefixo; e o "com chave" do vendedor', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const P = () => require('@/lib/atendimentos-ia/politica-da-empresa') as typeof import('@/lib/atendimentos-ia/politica-da-empresa')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const E = () => require('@/lib/atendimentos-ia/escolhas-da-tipologia') as typeof import('@/lib/atendimentos-ia/escolhas-da-tipologia')
    const SEM_CHAVE = 'CREMONA COM MACANETA SEM CHAVE'
    const POLITICA = { porVariavel: { MFI: { natureza: 'POLITICA' as const, opcao: SEM_CHAVE } } }
    const SEM_MENCAO_A_CHAVE = [
        '1 = CREMONA COM MAÇANETA; 2 = CREMONA COM FECHO ALAVANCA; 3 = CREMONA OCULTA; 4 = CREMONA COM CONCHA PRÁTIKA',
        '1 = CREMONA COM MAÇANETA; 2 = CREMONA COM FECHO ALAVANCA; 4 = CREMONA COM CONCHA PRÁTIKA',
    ]
    const QUE_SEPARAM = [
        '1 = CREMONA COM MAÇANETA SEM CHAVE; 2 = CREMONA COM MAÇANETA COM CHAVE; 3 = CREMONA COM FECHO ALAVANCA; 4 = CREMONA OCULTA; 5 = CREMONA COM CONCHA PRÁTIKA',
        '1 = CREMONA COM MAÇANETA SEM CHAVE; 2 = CREMONA COM MAÇANETA COM CHAVE; 3 = CREMONA COM FECHO ALAVANCA; 5 = CREMONA COM CONCHA PRÁTIKA',
        '1 = CREMONA COM MAÇANETA SEM CHAVE; 3 = CREMONA COM FECHO ALAVANCA; 4 = CREMONA OCULTA; 5 = CREMONA COM CONCHA PRÁTIKA',
        '1 = CREMONA COM MAÇANETA SEM CHAVE; 3 = CREMONA COM FECHO ALAVANCA; 5 = CREMONA COM CONCHA PRÁTIKA',
        '3 = CREMONA COM FECHO ALAVANCA; 5 = CREMONA COM CONCHA PRÁTIKA; 1 = CREMONA COM MAÇANETA SEM CHAVE; 3 = CREMONA COM FECHO ALAVANCA; 5 = CREMONA COM CONCHA PRÁTIKA',
    ]
    const traduz = (opcoes: string, opcao = SEM_CHAVE, codigo = 'X') =>
        P().traduzirPolitica(codigo, { variavel: 'MFI', opcoes, padrao: null as string | null }, { porVariavel: { MFI: { natureza: 'POLITICA' as const, opcao } } })
    it('as listas que NÃO falam em chave: casa a "CREMONA COM MAÇANETA", por equivalência, dita', () => {
        for (const l of SEM_MENCAO_A_CHAVE) {
            expect(traduz(l, SEM_CHAVE, 'DP-017')).toEqual({ valor: 1, campo: 'MFI', equivalencia:
                'a política diz MFI = "CREMONA COM MACANETA SEM CHAVE", e a lista da tipologia DP-017 não fala em chave; entrou a opção 1 = CREMONA COM MAÇANETA (a mesma peça, por equivalência)' })
        }
    })
    it('as listas que separam: casa a SEM CHAVE pelo texto, sem equivalência', () => {
        for (const l of QUE_SEPARAM) expect(traduz(l)).toEqual({ valor: 1, campo: 'MFI' })
    })
    it('NUNCA por prefixo: a lista que fala em chave e não tem a SEM CHAVE recusa — nunca a "CREMONA COM MAÇANETA", nunca a COM CHAVE', () => {
        expect(traduz('1 = CREMONA COM MAÇANETA; 2 = CREMONA COM MAÇANETA COM CHAVE; 3 = CREMONA OCULTA')).toMatchObject({ recusa: expect.stringContaining('nenhuma opção de MFI') })
        expect(traduz('2 = CREMONA COM MAÇANETA COM CHAVE; 3 = CREMONA OCULTA')).toMatchObject({ recusa: expect.any(String) })
    })
    it('a equivalência é a do rótulo INTEIRO sem "sem chave": um rótulo mais curto, ou outro, não casa', () => {
        expect(traduz('1 = CREMONA; 2 = CREMONA OCULTA')).toMatchObject({ recusa: expect.any(String) })
        expect(traduz('1 = CREMONA COM MAÇANETA DUPLA; 2 = CREMONA OCULTA')).toMatchObject({ recusa: expect.any(String) })
    })
    it('só para o texto que diz SEM CHAVE: outra política sem casar continua recusa', () => {
        expect(traduz(SEM_MENCAO_A_CHAVE[0], 'CREMONA COM MACANETA DUPLA')).toMatchObject({ recusa: expect.any(String) })
        // "COM CHAVE" é outra peça: numa lista que não fala em chave, nunca vira a "CREMONA COM MAÇANETA"
        expect(traduz(SEM_MENCAO_A_CHAVE[0], 'CREMONA COM MACANETA COM CHAVE')).toMatchObject({ recusa: expect.any(String) })
    })
    it('duas opções iguais ao rótulo sem a chave: ambiguidade, recusa', () => {
        expect(traduz('1 = CREMONA COM MAÇANETA; 2 = CREMONA COM MAÇANETA')).toMatchObject({ recusa: expect.any(String) })
    })
    it('sem maçaneta nenhuma (DP-57, DP-58, DP-59, DP-96, DP-98): recusa nomeada, nunca uma opção inventada', () => {
        expect(traduz('3 = CREMONA COM FECHO ALAVANCA; 5 = CREMONA COM CONCHA PRÁTIKA')).toMatchObject({ recusa: expect.stringContaining('nenhuma opção de MFI') })
    })
    it('na fronteira: a equivalência vai a `equivalencias` (o rastro), com origem política; o texto exato não vai', () => {
        const t = (opcoes: string): Tipologia => ({ ...dp02(), variaveis: [{ variavel: 'MFI', descricao: 'MODO DE FECHAMENTO', padrao: '1', condicao: 'sempre', opcoes, condicao_opcoes: null }], perfis: [], insumos: [], vidros: [] })
        const eq = F().escolhasDoCalculo(t(SEM_MENCAO_A_CHAVE[0]), {}, POLITICA)
        expect([eq.escolhas.MFI, eq.origem.MFI, eq.equivalencias.map((q) => q.variavel), eq.voltas]).toEqual([1, 'politica', ['MFI'], []])
        const exato = F().escolhasDoCalculo(t(QUE_SEPARAM[0]), {}, POLITICA)
        expect([exato.escolhas.MFI, exato.equivalencias]).toEqual([1, []])
    })
    it('o "com chave" do vendedor sobrepõe a política: item → política → motor', () => {
        const t: Tipologia = { ...dp02(), variaveis: [{ variavel: 'MFI', descricao: 'MODO DE FECHAMENTO', padrao: '1', condicao: 'sempre', opcoes: QUE_SEPARAM[0], condicao_opcoes: null }], perfis: [], insumos: [], vidros: [] }
        const comChave = F().escolhasDoCalculo(t, { MFI: 2 }, POLITICA)
        expect([comChave.escolhas.MFI, comChave.origem.MFI, comChave.voltas, comChave.equivalencias]).toEqual([2, 'vendedor', [], []])
    })
    it('o vendedor pode dizer o fechamento: a escolha vale, fica gravada, e vai ao prompt — mas nunca é perguntada nem entra na linha do arremate', () => {
        const tip = { variaveis: [{ variavel: 'MFI', descricao: 'MODO DE FECHAMENTO', padrao: '1', condicao: 'sempre', opcoes: QUE_SEPARAM[0], condicao_opcoes: null as string | null }] }
        expect(E().validarEscolha(tip, {}, { variavel: 'MFI', opcao: 2 })).toEqual({ gravar: { MFI: 2 }, propostos: 1, descartados: 0 })
        expect(E().validarEscolha(tip, {}, { variavel: 'MFI', opcao: 9 })).toMatchObject({ gravar: null, descartados: 1 })
        expect(E().lerEscolhasGravadas({ MFI: 2, MFE: 1, XYZ: 3 })).toEqual({ MFI: 2, MFE: 1 })
        expect(E().lerEscolhasGravadas({ MFI: 0 })).toEqual({})
        expect(E().escolhasParaOPrompt(tip)).toEqual([`MFI = MODO DE FECHAMENTO: ${QUE_SEPARAM[0]}`])
        expect(E().escolhasPendentes(tip, {})).toEqual([])
        expect(E().descreverArremate(tip, { MFI: 2 })).toBeNull()
    })
})

/*
 * (11) A TIPOLOGIA MANDA (dono do produto, 22/11/2026, REGRA GERAL): "O critério que nós temos que tomar como regra é a TIPOLOGIA. A tipologia vai
 * informar como que deve ser feito. O motor, ele só define as proporções." A política escolhe ENTRE o que a tipologia oferece; a opção que a lista
 * não tem não é falta — entra o padrão da tipologia, no rastro. As listas e os padrões das cinco folhas de veneziana são os do motor ativo
 * (259035a9), medidos em 22/11/2026.
 */
describe('(11) a tipologia manda: a política escolhe entre o que ela oferece, e o que ela não tem dá lugar ao padrão dela', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const P = () => require('@/lib/atendimentos-ia/politica-da-empresa') as typeof import('@/lib/atendimentos-ia/politica-da-empresa')
    const SEM_CHAVE = 'CREMONA COM MACANETA SEM CHAVE'
    const VENEZIANA = {
        MFE: { tipologias: ['DP-57', 'DP-58', 'DP-59'], opcoes: '3 = CREMONA COM FECHO ALAVANCA; 4 = CREMONA OCULTA; 5 = CREMONA COM CONCHA PRÁTIKA', padrao: '3' },
        MFI: { tipologias: ['DP-96', 'DP-98'], opcoes: '3 = CREMONA COM FECHO ALAVANCA; 5 = CREMONA COM CONCHA PRÁTIKA', padrao: '3' },
    }
    const pol = (variavel: string, opcao: string) => ({ porVariavel: { [variavel]: { natureza: 'POLITICA' as const, opcao } } })
    const traduz = (variavel: string, opcoes: string, padrao: string | null, opcao: string, codigo = 'X') =>
        P().traduzirPolitica(codigo, { variavel, opcoes, padrao }, pol(variavel, opcao))
    it('as cinco folhas de veneziana: a lista não tem maçaneta, e entra o padrão da tipologia (3 = FECHO ALAVANCA), dito', () => {
        for (const [variavel, { tipologias, opcoes, padrao }] of Object.entries(VENEZIANA)) {
            for (const t of tipologias) {
                expect(traduz(variavel, opcoes, padrao, SEM_CHAVE, t)).toEqual({ valor: 3, campo: variavel, pelaTipologia:
                    `a política diz ${variavel} = "${SEM_CHAVE}", que a tipologia ${t} não oferece; entrou o padrão da tipologia, 3 = CREMONA COM FECHO ALAVANCA` })
            }
        }
    })
    it('a política vence quando a opção EXISTE na lista: o padrão da tipologia nem é olhado', () => {
        expect(traduz('MFE', '1 = CREMONA COM MAÇANETA SEM CHAVE; 3 = CREMONA COM FECHO ALAVANCA', '3', SEM_CHAVE)).toEqual({ valor: 1, campo: 'MFE' })
        expect(traduz('MFE', VENEZIANA.MFE.opcoes, '3', 'CREMONA OCULTA')).toEqual({ valor: 4, campo: 'MFE' })
    })
    it('é REGRA GERAL: qualquer variável, qualquer texto — não uma lista das cinco', () => {
        expect(traduz('ARE', '1 = BZ0010 - ARREMATE 20MM; 2 = SEM ARREMATE EXTERNO', '2', 'BZ9999')).toMatchObject({ valor: 2, pelaTipologia: expect.stringContaining('entrou o padrão da tipologia, 2 = SEM ARREMATE EXTERNO') })
        expect(traduz('XYZ', '7 = QUALQUER; 8 = OUTRA', '8', 'NENHUMA DESSAS')).toMatchObject({ valor: 8, campo: 'XYZ' })
    })
    it('a lista que TEM uma opção que é o começo do texto (o texto diverge de uma opção que existe): falta, e se pergunta — nunca o padrão', () => {
        expect(traduz('MFI', '1 = CREMONA COM MAÇANETA; 2 = CREMONA COM MAÇANETA COM CHAVE; 3 = CREMONA COM FECHO ALAVANCA', '1', SEM_CHAVE))
            .toMatchObject({ recusa: expect.stringContaining('nenhuma opção de MFI') })
    })
    it('o rótulo vazio na lista não é "uma opção parecida": a lista continua sem a opção, e entra o padrão', () => {
        expect(traduz('X', '1 = ; 2 = CREMONA OCULTA', '2', 'NADA DISSO')).toMatchObject({ valor: 2, pelaTipologia: expect.any(String) })
    })
    it('mais de uma casando continua pergunta (a ambiguidade não é a falta)', () => {
        expect(traduz('X', '1 = CREMONA A; 2 = CREMONA B', '1', 'CREMONA')).toMatchObject({ recusa: expect.stringContaining('mais de uma opção') })
    })
    it('sem padrão válido na tipologia (vazio, não número, ou fora da lista): recusa nomeada, nunca uma opção inventada', () => {
        expect(traduz('MFI', VENEZIANA.MFI.opcoes, null, SEM_CHAVE)).toMatchObject({ recusa: expect.any(String) })
        expect(traduz('MFI', VENEZIANA.MFI.opcoes, 'X', SEM_CHAVE)).toMatchObject({ recusa: expect.any(String) })
        expect(traduz('MFI', VENEZIANA.MFI.opcoes, '4', SEM_CHAVE)).toMatchObject({ recusa: expect.any(String) })
    })
    it('a MAE segue a regra própria (21/11/2026): o ajuste em obra vem ANTES do padrão da tipologia', () => {
        expect(traduz('MAE', '1 = MEDIDA DO VÃO (CORTE 45); 2 = VÃO+40MM (CORTE 90/90) - PARA AJUSTE EM OBRA [40,00]', '1', 'VAO+50MM (CORTE 90/90)'))
            .toMatchObject({ valor: 2, ajuste: expect.any(String) })
    })
    it('na fronteira: a origem é `tipologia`, o motivo vai a `pelaTipologia` (o rastro), e o vendedor continua vencendo', () => {
        const t: Tipologia = { ...dp02(), variaveis: [{ variavel: 'MFE', descricao: 'MODO DE FECHAMENTO DA FOLHA EXTERNA', padrao: '3', condicao: 'sempre', opcoes: VENEZIANA.MFE.opcoes, condicao_opcoes: null }], perfis: [], insumos: [], vidros: [] }
        const r = F().escolhasDoCalculo(t, {}, pol('MFE', SEM_CHAVE))
        expect([r.escolhas.MFE, r.origem.MFE, r.pelaTipologia.map((q) => q.variavel), r.voltas]).toEqual([3, 'tipologia', ['MFE'], []])
        const doVendedor = F().escolhasDoCalculo(t, { MFE: 5 }, pol('MFE', SEM_CHAVE))
        expect([doVendedor.escolhas.MFE, doVendedor.origem.MFE, doVendedor.pelaTipologia]).toEqual([5, 'vendedor', []])
    })
})

describe('A PERSIANA PELA COR DA ESQUADRIA (dono do produto, 26/11/2026, pedido 0038; o WVetro do orçamento 1207, todo em preto liso)', () => {
    /** A tipologia com persiana: a variável PP como no motor 259035a9 (padrão 37) e uma peça por opção. */
    const comPersiana = (): Tipologia => ({
        ...dp02(),
        variaveis: [{ variavel: 'PP', descricao: 'MODELO DA PALHETA', padrao: '37', condicao: 'sempre', opcoes: '37 = PERSIANA DE PVC 37MM; 57 = PERSIANA DE PVC 57MM; 45 = PERSIANA DE ALUMÍNIO 45MM', condicao_opcoes: null }],
        perfis: ['(PP=37)', '(PP=57)', '(PP=45)'].map((condicao, i) => ({ perfil: `P${i}`, descricao: `P${i}`, corte: '90/90', qtd: '1', medida: 'L', posicao: 'Largura', esp_vidro: null as string | null, condicao })),
        insumos: [], vidros: [],
    })
    it('BRANCO dá 37 (PVC); qualquer outra cor dá 45 (alumínio) — e a origem diz "pela_cor"', () => {
        for (const [cor, pp] of [['BRANCO', 37], ['Branco', 37], ['PRETO LISO', 45], ['AMADEIRADO GOLDEN OAK', 45], ['Preto', 45]] as const) {
            const r = F().escolhasDoCalculo(comPersiana(), {}, {}, null, cor)
            expect([cor, r.escolhas.PP, r.origem.PP]).toEqual([cor, pp, 'pela_cor'])
        }
    })
    it('o vendedor que disse o modelo vence a cor', () => {
        const r = F().escolhasDoCalculo(comPersiana(), { PP: 57 }, {}, null, 'PRETO LISO')
        expect([r.escolhas.PP, r.origem.PP]).toEqual([57, 'vendedor'])
    })
    it('sem a cor, vale o de antes (o padrão do motor); e a tipologia sem a opção 45 não a ganha', () => {
        const semCor = F().escolhasDoCalculo(comPersiana(), {}, {})
        expect(semCor.origem.PP).not.toBe('pela_cor')
        const sem45: Tipologia = { ...comPersiana(), variaveis: [{ variavel: 'PP', descricao: 'MODELO DA PALHETA', padrao: '37', condicao: 'sempre', opcoes: '37 = PVC 37MM; 57 = PVC 57MM', condicao_opcoes: null }] }
        const r = F().escolhasDoCalculo(sem45, {}, {}, null, 'PRETO LISO')
        expect(r.escolhas.PP === 45 || r.origem.PP === 'pela_cor').toBe(false)
    })
    it('palhetaPelaCor: a regra pura', () => {
        expect(F().palhetaPelaCor('branco')).toBe(37)
        expect(F().palhetaPelaCor('BRANCÓ'.replace('Ó', 'O'))).toBe(37)
        expect(F().palhetaPelaCor('PRETO TEXTURADO')).toBe(45)
    })
})

describe('NA PERSIANA A COR VENCE A POLÍTICA (dono do produto, 26/11/2026, pedido 0039; o levantamento 31 em preto liso saiu com o 1318 PVC)', () => {
    const comPersiana = (): Tipologia => ({
        ...dp02(),
        variaveis: [{ variavel: 'PP', descricao: 'MODELO DA PALHETA', padrao: '37', condicao: 'sempre', opcoes: '37 = PERSIANA DE PVC 37MM; 57 = PERSIANA DE PVC 57MM; 45 = PERSIANA DE ALUMÍNIO 45MM', condicao_opcoes: null }],
        perfis: ['(PP=37)', '(PP=57)', '(PP=45)'].map((condicao, i) => ({ perfil: `P${i}`, descricao: `P${i}`, corte: '90/90', qtd: '1', medida: 'L', posicao: 'Largura', esp_vidro: null as string | null, condicao })),
        insumos: [], vidros: [],
    })
    // a política da De Paula, como em produção: PP = "PERSIANA DE PVC 37MM", natureza POLITICA
    const DE_PAULA_PP = { porVariavel: { PP: { natureza: 'POLITICA' as const, opcao: 'PERSIANA DE PVC 37MM' } } }
    it('PRETO LISO: a cor vence a política — 45 (alumínio), origem "pela_cor"', () => {
        const r = F().escolhasDoCalculo(comPersiana(), {}, DE_PAULA_PP, null, 'Preto Liso')
        expect([r.escolhas.PP, r.origem.PP]).toEqual([45, 'pela_cor'])
    })
    it('BRANCO: a política vale (37, PVC), como antes', () => {
        const r = F().escolhasDoCalculo(comPersiana(), {}, DE_PAULA_PP, null, 'BRANCO')
        expect([r.escolhas.PP, r.origem.PP]).toEqual([37, 'politica'])
    })
    it('só o vendedor vence a cor: o modelo dito fica, em qualquer cor', () => {
        const r = F().escolhasDoCalculo(comPersiana(), { PP: 37 }, DE_PAULA_PP, null, 'PRETO LISO')
        expect([r.escolhas.PP, r.origem.PP]).toEqual([37, 'vendedor'])
    })
    it('a política das OUTRAS variáveis continua valendo na esquadria colorida; e sem a cor, a política vale', () => {
        const t: Tipologia = { ...comPersiana(), variaveis: [...comPersiana().variaveis, { variavel: 'X', descricao: 'PEÇA X', padrao: '1', condicao: 'sempre', opcoes: '1 = UM; 2 = DOIS', condicao_opcoes: null }] }
        const r = F().escolhasDoCalculo(t, {}, { porVariavel: { ...DE_PAULA_PP.porVariavel, X: { natureza: 'POLITICA' as const, opcao: 'dois' } } }, null, 'PRETO LISO')
        expect([r.escolhas.X, r.origem.X]).toEqual([2, 'politica'])
        expect(F().escolhasDoCalculo(comPersiana(), {}, DE_PAULA_PP).origem.PP).toBe('politica')
    })
})
