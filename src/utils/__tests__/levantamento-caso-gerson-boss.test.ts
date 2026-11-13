/**
 * @jest-environment node
 *
 * PORTÃO — o DEFEITO DE PRODUÇÃO do levantamento “Gerson Boss” (De Paula, 08/11/2026, 00:55 UTC) e a regra do PREÇO QUE FALTA.
 *
 * O QUE O AGENTE RESPONDEU: "o perfil BZ0006/WOLFF não tem código para a cor Branco na tabela do fornecedor; as variantes que
 * existem são: BRANCO" — para 2575, BZ0006, BZ0010, GB25, HF88, SF92, IL50, SP66.
 *
 * A CAUSA, MEDIDA em produção (só leitura) antes de corrigir:
 *   - a esquadria grava `cor_perfil` na grafia da LISTA da base (`orcamentista_mp_categoria.config.cores`): "Branco", hex 4272616e636f;
 *   - o motor grava a variante como o fornecedor escreve: "BRANCO", hex 4252414e434f — sem espaço nas pontas e sem acento;
 *   - a ponte (`levantamento-de-barras.ts`) comparava com `===`. Diverge SÓ A CAIXA. Todas as cores do motor estão em maiúscula, e
 *     todas as da lista em caixa de título ("Preto Texturado", "Golden OAK"): o defeito alcança toda cor, não só o branco;
 *   - o espaço NÃO é normalizado: no motor existem "LAMINADO  PRETO LISO" (dois espaços) e "LAMINADO PRETO LISO", e juntá-los seria
 *     escolher entre duas variantes que o fornecedor escreveu diferente.
 *
 * OS DADOS são reais: `fixtures/caso-gerson-boss.json`, conferido contra o banco por md5 em 08/11/2026 (o texto de cada linha
 * juntado por '|', nulo como '∅', as linhas por '\n', na ordem do arquivo):
 *   Perfis 2d7515748ee0af33a232347b969b6acb · Fórmulas cb2e9545ac8902dec16c915b52dd1683 · Variáveis 0a123e2a73599a7139082520afac8d2c
 *   Validações 71161b51eeba04d311adc90dfe31e677 · Detalhe 4c4ffbd16a3aea5d8c41a60b4f59558a
 *   regras (código; WVetro; cor) 2eda63eb3581513b8a67e7a27b02c0f4 · itens (código; descrição; barra; valores) bcf7faf9b19b99aa9322916940563abe
 *
 * O ACHADO QUE O CASO TRAZ: com a cor corrigida, a ponte resolve TODOS os perfis; mas o código 1023 (1023/WOLFF, "CLICK GUIA DE
 * ALUMÍNIO PARA TRILHO DE PVC", sempre presente na DP-39) não está em NENHUMA das 8 tabelas da família PVC da conta. O levantamento
 * real recusava nomeando-o (a regra de 08/11/2026, "nada evolui"). DESDE 12/11/2026 (o comando único) a falta de preço NÃO impede a evolução:
 * o 1023 sai em `faltas`, nomeado, e o resto do levantamento evolui.
 */

import { comACorLimpa } from './fixtures/arquivo-do-motor-corrigido'

/* eslint-disable @typescript-eslint/no-require-imports */
const VI = () => require('@/lib/atendimentos-ia/vidro') as typeof import('@/lib/atendimentos-ia/vidro')
jest.mock('@/supabase/admin', () => ({ supabaseAdmin: {} }))
type Ligacao = typeof import('@/lib/atendimentos-ia/levantamento-de-barras')
const LB = () => require('@/lib/atendimentos-ia/levantamento-de-barras') as Ligacao
type Avaliador = typeof import('@/lib/atendimentos-ia/avaliador-de-formulas')
const AV = () => require('@/lib/atendimentos-ia/avaliador-de-formulas') as Avaliador
type Abas = typeof import('@/utils/atendimentos-ia-abas-do-motor')
const AB = () => require('@/utils/atendimentos-ia-abas-do-motor') as Abas
type Escolhas = typeof import('@/lib/atendimentos-ia/escolhas-da-tipologia')
const ES = () => require('@/lib/atendimentos-ia/escolhas-da-tipologia') as Escolhas
const CASO = require('./fixtures/caso-gerson-boss.json') as {
    cor_perfil_gravada: string
    perfil_config: { cores: string[]; serra_mm: number }
    colunas: Record<string, string[]>
    linhas: Record<string, unknown[][]>
    regras: Array<[string, string, string | null]>
    itens: Array<[string, string, number, number | null, number | null]>
}
/* eslint-enable @typescript-eslint/no-require-imports */

type Item = import('@/lib/atendimentos-ia/levantamento-de-barras').ItemDaTabela
type Entrada = import('@/lib/atendimentos-ia/levantamento-de-barras').EntradaDoLevantamento

/** O motor de HOJE (o recorte como está em produção) e o do arquivo CORRIGIDO (`fixtures/arquivo-do-motor-corrigido.ts`). */
const REGRAS_DE_HOJE = CASO.regras.map(([codigo, codigo_wvetro, cor]) => ({ codigo, codigo_wvetro, cor }))
const REGRAS = comACorLimpa(REGRAS_DE_HOJE)
const ITENS: Item[] = CASO.itens.map(([codigo, descricao, medida_barra_m, valor_barra_interno, valor_metro_interno]) =>
    ({ codigo, descricao, medida_barra_m, valor_barra_interno, valor_metro_interno }))

/** As abas como a conversa as lê do banco (`lerTipologiasDoBanco`): as linhas pela coluna do banco, pelo mesmo mapa. */
function tipologia(codigo: string) {
    const abas = Object.fromEntries(Object.keys(AV().COLUNAS_LIDAS).map((nome) => {
        const aba = AB().abaDeclarada(nome)
        const cols = CASO.colunas[aba.tabela]
        const linhas = (CASO.linhas[aba.tabela] ?? []).map((v) => Object.fromEntries(cols.map((c, i) => [c, v[i]])))
        return [nome, AB().abaDoBanco(aba, linhas)]
    }))
    const r = AV().lerTipologia(abas as never, codigo)
    if ('recusas' in r) throw new Error('fixture recusado: ' + r.recusas.map((x) => x.mensagem).join(' | '))
    return r.tipologia
}

/** O levantamento “Gerson Boss” como a conversa o monta: DP-39 2.500 x 2.200 (vidro 8 mm) e DP-01 600 x 600 (mini boreal), os padrões do motor. */
/** A tabela de cores da Wolf, os perfis (20261112000006). */
const CORES = [['1', 'BRANCO'], ['20', 'PRETO TEXTURADO'], ['36', 'PRETO LISO'], ['30', 'BRONZE'], ['31', 'GRAFITE']].map(([codigo, nome]) => ({ grupo: 'PERFIS DE PVC', codigo, nome }))
function entrada(cor: string, itens: Item[] = ITENS): Entrada {
    const t = { 'DP-39': tipologia('DP-39'), 'DP-01': tipologia('DP-01') }
    return {
        cor, tipologias: t, regras: REGRAS, itens, serra_mm: CASO.perfil_config.serra_mm, cores: CORES,
        esquadrias: [
            { tipologia: 'DP-39', L_mm: 2500, H_mm: 2200, quantidade: 1, escolhas: ES().escolhasComPadrao(t['DP-39'], {}), espessura_vidro_mm: VI().lerVidro('temperado incolor 8mm').espessura_mm },
            { tipologia: 'DP-01', L_mm: 600, H_mm: 600, quantidade: 1, escolhas: ES().escolhasComPadrao(t['DP-01'], {}), espessura_vidro_mm: VI().lerVidro('mini boreal').espessura_mm },
        ],
    }
}

/** O código de cada perfil, em BRANCO, como a tabela do fornecedor o tem — escrito à mão a partir das regras do recorte. */
const CODIGO_EM_BRANCO: Record<string, string> = {
    '2575/WOLFF': '25751', 'BZ0006/WOLFF': '10501', 'BZ0010/WOLFF': '10511', 'BZ0012/WOLFF': '10491', 'GB25/WOLFF': '9801',
    'HF88/WOLFF': '9641', 'SF92/WOLFF': '9691', 'IL50/WOLFF': '9701', 'SP66/WOLFF': '9731',
    '1023/WOLFF': '1023', '8427/WOLFF': '8427', '8432/WOLFF': '8432', '8433/WOLFF': '8433',
}
/** Os perfis que o avaliador corta nas duas esquadrias com os padrões (medido rodando o avaliador neste recorte). */
const PERFIS_DO_CASO = Object.keys(CODIGO_EM_BRANCO).sort()

describe('(a) o caso real: “Gerson Boss”, perfil Branco, DP-39 2.500 x 2.200 e DP-01 600 x 600', () => {
    it('a ponte resolve TODOS os perfis — e a única FALTA é o 1023, sem item em tabela nenhuma; o resto evolui (12/11/2026)', () => {
        const r = LB().levantarBarras(entrada(CASO.cor_perfil_gravada))
        if ('recusas' in r) throw new Error('recusado: ' + r.recusas.map((x) => x.mensagem).join(' | '))
        expect(r.faltas.map((f) => [f.caminho, f.motivo, f.codigo_do_motor, f.esquadria])).toEqual([['perfil', 'NAO_ACHADA', '1023/WOLFF', 1]])
        // o perfil do motor e a descrição dele, para achar e corrigir o cadastro
        expect(r.faltas[0].frase).toContain('1023/WOLFF')
        expect(r.total.barras_por_codigo['1023']).toBeUndefined()
        expect(Object.keys(r.total.barras_por_codigo).length).toBe(PERFIS_DO_CASO.length - 1)
    })

    it('cada perfil cortado vira o código BRANCO da tabela — e nenhum outro (com o 1023 posto à mão, só para ver a ponte inteira)', () => {
        // a descrição concorda com a do motor (o guarda): o item hipotético é o mesmo produto
        const com1023 = [...ITENS, { codigo: '1023', descricao: 'CLICK GUIA DE ALUMÍNIO PARA TRILHO DE PVC (hipotético)', medida_barra_m: 6, valor_barra_interno: 10, valor_metro_interno: 2 }]
        const r = LB().levantarBarras(entrada(CASO.cor_perfil_gravada, com1023))
        if ('recusas' in r) throw new Error('recusado: ' + r.recusas.map((x) => x.mensagem).join(' | '))
        const pares = Object.fromEntries(r.por_codigo.map((c) => [c.perfil, c.codigo]))
        expect(Object.keys(pares).sort()).toEqual(PERFIS_DO_CASO)
        expect(pares).toEqual(CODIGO_EM_BRANCO)
        expect(r.cor).toBe('Branco')
        expect(r.faltas).toEqual([])
    })
})

describe('(b) a cor dita em qualquer caixa casa', () => {
    it.each(['branco', 'Branco', 'BRANCO', 'bRaNcO'])('"%s": os mesmos códigos, perfil a perfil', (cor) => {
        for (const perfil of PERFIS_DO_CASO) {
            const c = LB().codigoDaPeca(perfil, cor, REGRAS, ITENS)
            if ('recusa' in c) throw new Error(`${perfil} em ${cor}: ${c.recusa.mensagem}`)
            expect([perfil, c.codigo]).toEqual([perfil, CODIGO_EM_BRANCO[perfil]])
        }
    })

    it('a caixa vale para as outras cores também: "Preto Texturado" da lista acha PRETO TEXTURADO no HF88', () => {
        const c = LB().codigoDaPeca('HF88/WOLFF', 'Preto Texturado', REGRAS)
        expect('recusa' in c ? c.recusa.mensagem : c.codigo).toBe('96420')
    })

    it('com acento, a caixa também: "alumínio" acha ALUMÍNIO (o Í maiúsculo é a mesma letra)', () => {
        const regras = [{ codigo: 'A1', codigo_wvetro: 'A/WOLFF', cor: 'ALUMÍNIO' }, { codigo: 'A2', codigo_wvetro: 'A/WOLFF', cor: 'BRANCO' }]
        const c = LB().codigoDaPeca('A/WOLFF', 'alumínio', regras)
        expect('recusa' in c ? c.recusa.mensagem : c.codigo).toBe('A1')
    })
})

describe('(c) a cor que REALMENTE não existe continua recusada — a caixa não faz tudo casar', () => {
    it('"Roxo": todo perfil com variante é FALTA nomeada — nenhum código branco entra; os sem variante seguem', () => {
        const r = LB().levantarBarras(entrada('Roxo'))
        if ('recusas' in r) throw new Error('recusado: ' + r.recusas.map((x) => x.mensagem).join(' | '))
        const comFalta = [...new Set(r.faltas.map((f) => f.codigo_do_motor))].sort()
        expect(comFalta).toEqual(['1023/WOLFF', '2575/WOLFF', 'BZ0006/WOLFF', 'BZ0010/WOLFF', 'GB25/WOLFF', 'HF88/WOLFF', 'IL50/WOLFF', 'SF92/WOLFF', 'SP66/WOLFF'])
        for (const branco of ['25751', '10501', '10511', '9801', '9641', '9691', '9701', '9731']) expect(r.resolucoes[branco]).toBeUndefined()
        // os sem variante (cor vazia) seguem
        for (const c of ['8427', '8432', '8433', '10491']) expect(r.total.barras_por_codigo[c]).toBeGreaterThan(0)
    })

    it('A EMPRESA SEM BRANCO NA LISTA (dono do produto, 08/11/2026): o levantamento em Roxo com o BZ0006 — que só existe em BRANCO — nunca leva o código branco: falta nas duas esquadrias', () => {
        // a lista de cores da empresa não entra mais no cálculo: a variante única só serve para a cor que ela é, qualquer que seja a lista
        const r = LB().levantarBarras(entrada('Roxo', [...ITENS, { codigo: '1023', descricao: 'CLICK GUIA DE ALUMÍNIO', medida_barra_m: 6, valor_barra_interno: 10, valor_metro_interno: 2 }]))
        if ('recusas' in r) throw new Error('recusado: ' + r.recusas.map((x) => x.mensagem).join(' | '))
        expect(r.faltas.filter((f) => f.codigo_do_motor === 'BZ0006/WOLFF').map((f) => [f.esquadria, f.cor])).toEqual([[1, 'Roxo'], [2, 'Roxo']])
        expect(r.resolucoes['10501']).toBeUndefined()
        expect(r.faltas.some((f) => f.codigo_do_motor === 'BZ0010/WOLFF')).toBe(true)
    })

    it('"Preto" no BZ0006 (só BRANCO no motor): a variante única que é outra cor NÃO entra', () => {
        const c = LB().codigoDaPeca('BZ0006/WOLFF', 'Preto', REGRAS)
        if (!('recusa' in c)) throw new Error('levou o código branco para o preto: ' + c.codigo)
        expect(c.recusa.motivo).toBe('COR_SEM_CODIGO')
        expect(c.recusa.variantes).toEqual(['BRANCO'])
    })

    it('"Marrom" no HF88 (15 variantes, nenhuma marrom): recusa', () => {
        const c = LB().codigoDaPeca('HF88/WOLFF', 'Marrom', REGRAS)
        expect('recusa' in c ? c.recusa.motivo : c.codigo).toBe('COR_SEM_CODIGO')
    })

    it('"Preto" NÃO casa com "PRETO TEXTURADO" nem com "PRETO LISO": a caixa não vira busca por parte', () => {
        const c = LB().codigoDaPeca('8357/WOLFF', 'Preto', REGRAS)
        expect('recusa' in c ? c.recusa.motivo : c.codigo).toBe('COR_SEM_CODIGO')
    })

    it('o ESPAÇO não é normalizado: "Branco " (espaço no fim) recusa, e "LAMINADO PRETO LISO" não acha "LAMINADO  PRETO LISO"', () => {
        const c = LB().codigoDaPeca('HF88/WOLFF', 'Branco ', REGRAS)
        expect('recusa' in c ? c.recusa.motivo : c.codigo).toBe('COR_SEM_CODIGO')
        const regras = [{ codigo: 'D1', codigo_wvetro: 'D/WOLFF', cor: 'LAMINADO  PRETO LISO' }, { codigo: 'D2', codigo_wvetro: 'D/WOLFF', cor: 'BRANCO' }]
        const d = LB().codigoDaPeca('D/WOLFF', 'Laminado Preto Liso', regras)
        expect('recusa' in d ? d.recusa.motivo : d.codigo).toBe('COR_SEM_CODIGO')
    })

    it('DUAS GRAFIAS da mesma cor no motor (BRANCO e Branco, códigos diferentes): recusa nomeando as duas — nunca escolhe uma', () => {
        const regras = [{ codigo: 'X1', codigo_wvetro: 'X/WOLFF', cor: 'BRANCO' }, { codigo: 'X2', codigo_wvetro: 'X/WOLFF', cor: 'Branco' }, { codigo: 'X3', codigo_wvetro: 'X/WOLFF', cor: 'PRETO' }]
        const c = LB().codigoDaPeca('X/WOLFF', 'branco', regras)
        if (!('recusa' in c)) throw new Error('escolheu ' + c.codigo)
        expect(c.recusa.motivo).toBe('COR_EM_DUAS_GRAFIAS')
        expect(c.recusa.variantes).toEqual(['BRANCO', 'Branco'])
        expect(c.recusa.mensagem).toBe('O perfil X/WOLFF tem a cor branco escrita de 2 jeitos na tabela do fornecedor: BRANCO e Branco. Falta dizer qual delas é a cor pedida.')
    })
})

describe('(d) FALTOU PREÇO, A FALTA É NOMEADA E O RESTO EVOLUI (dono do produto, 12/11/2026 — substitui o "nada evolui" de 08/11)', () => {
    const com1023 = (valor_barra_interno: number | null, valor_metro_interno: number | null): Item[] =>
        [...ITENS, { codigo: '1023', descricao: 'CLICK GUIA DE ALUMÍNIO PARA TRILHO DE PVC', medida_barra_m: 6, valor_barra_interno, valor_metro_interno }]

    const ok = (e: Entrada) => {
        const r = LB().levantarBarras(e)
        if ('recusas' in r) throw new Error('recusado: ' + r.recusas.map((x) => x.mensagem).join(' | '))
        return r
    }
    it('o item com o valor da BARRA vazio: FALTA nomeada, e a DP-01, completa, sai', () => {
        const r = ok(entrada('Branco', com1023(null, 2)))
        expect(r.faltas.map((f) => [f.motivo, f.codigo_do_motor, f.esquadria])).toEqual([['SEM_VALOR', '1023/WOLFF', 1]])
        expect(r.faltas[0].frase).toContain('o item 1023 da tabela de preço')
        expect(r.faltas[0].frase).toContain('sem o valor da barra')
        expect(r.esquadrias[1].pecas.length).toBeGreaterThan(0)
    })

    it('o valor do METRO vazio também é falta, nomeando o metro', () => {
        const r = ok(entrada('Branco', com1023(10, null)))
        expect(r.faltas.map((f) => f.frase.match(/sem o valor do (barra|metro)/)?.[1])).toEqual(['metro'])
    })

    it('os dois vazios: UMA falta por esquadria, com as duas — o perfil que aparece nas duas esquadrias falta nas duas', () => {
        const itens = ITENS.map((i) => (i.codigo === '10501' ? { ...i, valor_barra_interno: null, valor_metro_interno: null } : i))
        const r = ok(entrada('Branco', [...itens, ...com1023(10, 2).slice(-1)]))
        expect(r.faltas.map((f) => [f.motivo, f.codigo_do_motor, f.esquadria])).toEqual([['SEM_VALOR', 'BZ0006/WOLFF', 1], ['SEM_VALOR', 'BZ0006/WOLFF', 2]])
        expect(r.faltas[0].frase).toContain('sem o valor da barra e sem o valor do metro')
    })

    it('ZERO é valor, não falta: o item com R$ 0,00 informado não recusa (ausente-vs-falso)', () => {
        const r = ok(entrada('Branco', com1023(0, 0)))
        expect(r.faltas).toEqual([])
    })
})
