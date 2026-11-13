/**
 * PORTÃO — a LIGAÇÃO avaliador → agrupador (`src/lib/atendimentos-ia/levantamento-de-barras.ts`):
 * dadas N esquadrias (tipologia, L, H, quantidade, escolhas), as peças de cada uma pelo avaliador,
 * o CÓDIGO DO ITEM de cada peça pela tabela do fornecedor, e as barras do levantamento inteiro pelo
 * agrupador, com o aproveitamento e os dois totais.
 *
 * OS DADOS são reais. A tipologia é `src/lib/atendimentos-ia/abas-do-motor-wolff-DP-02.json` (a do avaliador). O de-para e os
 * itens são `fixtures/fixture_de-para_DP-02.json`, um RECORTE de `orcamentista_motor_regra` e
 * `orcamentista_tabela_item` da tabela Wolff, lido em 24/10/2026 e conferido contra o banco: o md5
 * das 23 regras (`codigo;codigo_wvetro;cor`, ordenadas) e o dos 23 itens (`codigo;descricao;medida;
 * valor_barra;valor_metro`, com 6 casas) saíram IGUAIS no banco e no arquivo —
 * be9fd733373ea4c352ccc81daa000b3f e eed69af4ebbcb2468d6b95fff1b31721.
 *
 * A REGRA DE 12/11/2026 (o comando único): FALTA DE PREÇO NÃO IMPEDE A EVOLUÇÃO. O perfil sem item ou sem valor na tabela é FALTA NOMEADA em
 * `faltas` — as peças dele ficam fora das barras e dos totais —, nunca recusa. Recusa continua sendo o que impede o cálculo: a tipologia, o
 * avaliador, a cor em duas grafias, o agrupador (a peça maior que a barra).
 *
 * AS DECISÕES DO DONO DO PRODUTO, 24/10/2026, que estes casos guardam:
 *   - a cor desta versão é BRANCO, fixa. As outras não estão no motor porque a tabela de preço
 *     delas não foi enviada; nenhum de-para de cor é inventado;
 *   - barra → referência → código → valor, UM valor por código. Dois códigos para o mesmo perfil e
 *     cor é dado incompleto: RECUSA, com os dois códigos e os dois valores — mesmo com preço igual;
 *   - faltou dado, recusa nomeada (`docs/regras/faltou-dado-recusa-nomeada.md`): nunca aproxima,
 *     nunca escolhe o parecido, nunca calcula com o que sobrou.
 *
 * ═════ A CONTA À MÃO DO CASO (1) ═════
 * DP-02, L = 1200, H = 1000, MAE = 2 ("[50,00]"), ARI = 4 (sem arremate interno), vidro de 5 mm,
 * serra de 5 mm (a da base de conhecimento, categoria PERFIL), barras de 6 m (os 8 itens, medidos).
 * As peças do avaliador, e o código do item em BRANCO:
 *   BZ0010/WOLFF → 10511   1250 ×2, 1050 ×2    = 4.600,0 mm   1 barra
 *   HF88/WOLFF   → 9641    1206 ×2, 1006 ×2    = 4.424,0 mm   1 barra
 *   1023/WOLFF   → 1023    1095,8 ×2           = 2.191,6 mm   1 barra   (perfil sem variante: cor vazia em todas as linhas)
 *   8432/WOLFF   → 8432    1036 ×2, 836 ×2     = 3.744,0 mm   1 barra   (idem)
 *   SF66/WOLFF   → 9681    917,6 ×4, 595,8 ×4  = 6.053,6 mm   2 barras  (passa de 6.000)
 *   8433/WOLFF   → 8433    751,6 ×4, 429,8 ×4  = 4.725,6 mm   1 barra   (sem variante)
 *   IL36/WOLFF   → 9711    911,6 ×2            = 1.823,2 mm   1 barra
 *   GB25/WOLFF   → 9801    811,6 ×4, 489,8 ×4  = 5.205,6 mm   1 barra   (5.205,6 + 7 cortes de 5 = 5.240,6)
 *   9 barras; 32.767,6 mm úteis de 54.000 comprados → 60,6807407…%
 *   por barra inteira: 23,6493 + 398,304 + 60,9 + 124,32 + 2 × 241,4718 + 129,99 + 59,7456 + 62,235
 *                    = R$ 1.342,0875
 *   por consumo real:  4,6 × 3,94155 + 4,424 × 66,384 + 2,1916 × 10,15 + 3,744 × 20,72
 *                    + 6,0536 × 40,2453 + 4,7256 × 21,665 + 1,8232 × 9,9576 + 5,2056 × 10,3725
 *                    = 18,13113 + 293,682816 + 22,24474 + 77,57568 + 243,62894808 + 102,380124
 *                    + 18,15469632 + 53,995086 = R$ 829,7932204
 *
 * Cada caso fica VERMELHO sem a sua regra: a bateria está em `scripts/harness/levantamento-de-barras/`.
 */

import { comACorLimpa } from './fixtures/arquivo-do-motor-corrigido'

/* eslint-disable @typescript-eslint/no-require-imports */
// Lido DENTRO dos casos: no commit do portão o módulo ainda não existe, e cada caso tem de ficar
// vermelho por conta própria.
type Ligacao = typeof import('@/lib/atendimentos-ia/levantamento-de-barras')
const L = () => require('@/lib/atendimentos-ia/levantamento-de-barras') as Ligacao
type Avaliador = typeof import('@/lib/atendimentos-ia/avaliador-de-formulas')
const A = () => require('@/lib/atendimentos-ia/avaliador-de-formulas') as Avaliador
const TIPOLOGIAS = require('@/lib/atendimentos-ia/abas-do-motor-wolff-DP-02.json')
const DE_PARA = require('./fixtures/fixture_de-para_DP-02.json')
/* eslint-enable @typescript-eslint/no-require-imports */
// O estreitamento é por `'recusas' in r`: com `strictNullChecks: false`, o tsc não estreita a união
// pelo booleano `ok`.

type Regra = { codigo: string; codigo_wvetro: string; cor: string | null; descricao?: string | null }
type Item = { codigo: string; descricao: string | null; medida_barra_m: number | null; valor_barra_interno: number | null; valor_metro_interno: number | null }
type Esquadria = { tipologia: string; L_mm: number; H_mm: number; quantidade: number; escolhas?: Record<string, number>; espessura_vidro_mm?: number | null }

/** O motor com o arquivo CORRIGIDO (`fixtures/arquivo-do-motor-corrigido.ts`): o BZ0012 sem a cor 'CLICK'. O de HOJE é `REGRAS_DE_HOJE`. */
const REGRAS_DE_HOJE: Regra[] = DE_PARA.regras
const REGRAS: Regra[] = comACorLimpa(REGRAS_DE_HOJE)
const ITENS: Item[] = DE_PARA.itens
const SERRA = 5
const FECHA = { MAE: 2, ARI: 4 }

function dp02() {
    const r = A().lerTipologia(TIPOLOGIAS, 'DP-02')
    if ('recusas' in r) throw new Error('fixture recusado: ' + r.recusas.map((x) => x.mensagem).join(' | '))
    return r.tipologia
}
/** Uma tipologia mínima, escrita à mão, para os casos que precisam de um perfil que a DP-02 não tem. */
function tipologiaDeUmPerfil(codigo: string, perfil: string): import('@/lib/atendimentos-ia/avaliador-de-formulas').Tipologia {
    return {
        codigo,
        detalhe: { larg_min_mm: null, larg_max_mm: null, alt_min_mm: null, alt_max_mm: null },
        variaveis: [],
        formulas: [],
        perfis: [{ perfil, descricao: 'PEÇA DE TESTE', corte: '90/90', qtd: '1', medida: 'L', posicao: 'Largura', esp_vidro: null, condicao: 'sempre' }],
        validacoes: [],
    }
}
function esquadria(e: Partial<Esquadria> = {}): Esquadria {
    return { tipologia: 'DP-02', L_mm: 1200, H_mm: 1000, quantidade: 1, escolhas: FECHA, espessura_vidro_mm: 5, ...e }
}
/** As cores da empresa — as da base de conhecimento. Medido em produção (25/10/2026): só BRANCO. */
/** A tabela de cores da Wolf, os perfis (20261112000006). */
const CORES = [['1', 'BRANCO'], ['18', 'EXTERNO PRETO TEXTURADO'], ['19', 'EXTERNO GOLDEN OAK'], ['20', 'PRETO TEXTURADO'], ['21', 'AMADEIRADO GOLDEN OAK'], ['30', 'BRONZE'],
    ['31', 'GRAFITE'], ['32', 'EXTERNO BRONZE'], ['33', 'EXTERNO GRAFITE'], ['36', 'PRETO LISO'], ['37', 'AMADEIRADO NOGUEIRA'], ['38', 'EXTERNO PRETO LISO'],
    ['39', 'EXTERNO NOGUEIRA'], ['40', 'PIRITA'], ['41', 'EXTERNO PIRITA']].map(([codigo, nome]) => ({ grupo: 'PERFIS DE PVC', codigo, nome }))
function levantar(esquadrias: Esquadria[], o: { regras?: Regra[]; itens?: Item[]; tipologias?: Record<string, unknown>; cor?: string } = {}) {
    return L().levantarBarras({
        esquadrias,
        cor: o.cor ?? 'BRANCO',
        tipologias: (o.tipologias ?? { 'DP-02': dp02() }) as never,
        regras: o.regras ?? REGRAS,
        itens: o.itens ?? ITENS,
        serra_mm: SERRA,
        cores: CORES,
    })
}
/** As faltas de preço, resumidas: [motivo, perfil, esquadria]. */
const faltasDe = (r: ReturnType<typeof ok>) => r.faltas.map((f) => [f.motivo, f.codigo_do_motor, f.esquadria])
function ok(...args: Parameters<typeof levantar>) {
    const r = levantar(...args)
    if ('recusas' in r) throw new Error('recusado: ' + r.recusas.map((x) => x.mensagem).join(' | '))
    return r
}
function recusado(...args: Parameters<typeof levantar>) {
    const r = levantar(...args)
    if (!('recusas' in r)) throw new Error('era para recusar, e saiu: ' + JSON.stringify(r.total))
    return r
}
const doCodigo = (r: ReturnType<typeof ok>, codigo: string) => {
    const c = r.por_codigo.find((x) => x.codigo === codigo)
    if (!c) throw new Error(`o código ${codigo} não saiu; saíram ${r.por_codigo.map((x) => x.codigo).join(', ')}`)
    return c
}

describe('(1) a DP-02 em BRANCO, de ponta a ponta', () => {
    it('as peças viram CÓDIGOS DO ITEM, e as barras e os dois totais batem com a conta à mão', () => {
        const r = ok([esquadria()])
        expect(r.cor).toBe('BRANCO')
        expect(r.total.barras_por_codigo).toEqual({ '1023': 1, '10511': 1, '8432': 1, '8433': 1, '9641': 1, '9681': 2, '9711': 1, '9801': 1 })
        expect(r.total.n_barras).toBe(9)
        expect(r.total.metros_uteis).toBeCloseTo(32.7676, 9)
        expect(r.total.metros_comprados).toBe(54)
        expect(r.total.aproveitamento_pct).toBeCloseTo((32.7676 / 54) * 100, 9)
        expect(r.total.total_por_barra_inteira).toBeCloseTo(1342.0875, 6)
        expect(r.total.total_por_consumo_real).toBeCloseTo(829.7932204, 6)
        // o código do perfil fica ao lado do código do item, para quem confere
        expect(doCodigo(r, '10511').perfil).toBe('BZ0010/WOLFF')
        expect(doCodigo(r, '9681').perfil).toBe('SF66/WOLFF')
        // e nenhum código WVetro chega ao agrupador
        expect(r.por_codigo.some((c) => c.codigo.includes('/WOLFF'))).toBe(false)
    })

    it('a esquadria sai com as peças DELA, cada uma com o perfil e o código do item', () => {
        const r = ok([esquadria()])
        expect(r.esquadrias).toHaveLength(1)
        const e = r.esquadrias[0]
        expect(e.indice).toBe(1)
        const sf66 = e.pecas.filter((p) => p.perfil === 'SF66/WOLFF')
        expect(sf66.map((p) => [p.codigo, p.comprimento_mm, p.quantidade])).toEqual([['9681', 595.8, 4], ['9681', 917.6, 4]])
    })

    it('a COR É A DA ENTRADA, não uma fixa: em PRETO TEXTURADO, o HF88 só existe em BRANCO — é FALTA nomeada, e o branco não entra', () => {
        // com a cor fixa em BRANCO, o 9641 entraria: é a cor pedida que decide o código
        const r = ok([esquadria()], { cor: 'PRETO TEXTURADO' })
        const hf88 = r.faltas.find((f) => f.codigo_do_motor === 'HF88/WOLFF')
        expect(hf88).toMatchObject({ caminho: 'perfil', cor: 'PRETO TEXTURADO', esquadria: 1 })
        // a ponte não tem PRETO TEXTURADO; o nome técnico HF88 não casa "HF88S" (delimitado): nada acha — e o branco não entra
        expect(hf88!.motivo).toBe('NAO_ACHADA')
        expect(hf88!.frase).toContain('HF88/WOLFF')
        expect(r.total.barras_por_codigo['9641']).toBeUndefined()
        expect(r.esquadrias[0].pecas.some((p) => p.perfil === 'HF88/WOLFF')).toBe(false)
        // e o perfil SEM VARIANTE (cor vazia em todas as linhas) continua com o código único
        expect(r.total.barras_por_codigo['1023']).toBe(1)
    })
})

describe('(2) a QUANTIDADE da esquadria', () => {
    it('multiplica as peças: 1 esquadria × 2 é o mesmo que 2 esquadrias iguais', () => {
        const duas = ok([esquadria(), esquadria()])
        const vezesDois = ok([esquadria({ quantidade: 2 })])
        expect(vezesDois.total).toEqual(duas.total)
        expect(vezesDois.por_codigo).toEqual(duas.por_codigo)
        // 8 peças de SF66 por esquadria, 16 no levantamento
        expect(doCodigo(vezesDois, '9681').n_pecas).toBe(16)
        expect(vezesDois.esquadrias[0].pecas.find((p) => p.perfil === 'SF66/WOLFF')!.quantidade).toBe(8)
        expect(vezesDois.esquadrias[0].pecas.find((p) => p.perfil === 'SF66/WOLFF')!.quantidade_por_esquadria).toBe(4)
    })

    it('a recusa do AVALIADOR carrega a VARIÁVEL onde nasceu (06/11/2026, para o log por etapa); a recusa que não é de variável não tem a chave', () => {
        const t = dp02()
        const semX = { ...t, variaveis: t.variaveis.map((v) => (v.variavel === 'X' ? { ...v, padrao: null } : v)) }
        const r = recusado([esquadria()], { tipologias: { 'DP-02': semX } })
        const doAvaliador = r.recusas.filter((x) => x.origem === 'AVALIADOR')
        expect(doAvaliador.length).toBeGreaterThan(0)
        for (const x of doAvaliador) expect([x.motivo, x.variavel]).toEqual(['VARIAVEL_SEM_VALOR', 'X'])
        const q = recusado([esquadria({ quantidade: 0 })])
        expect(q.recusas.every((x) => !('variavel' in x))).toBe(true)
    })

    it('a QUANTIDADE DA ESQUADRIA inválida (0, 1,5, −1) é recusada', () => {
        for (const q of [0, 1.5, -1]) {
            const r = recusado([esquadria({ quantidade: q })])
            expect(r.recusas.map((x) => x.motivo)).toEqual(['QUANTIDADE_DA_ESQUADRIA_INVALIDA'])
            expect(r.recusas[0].esquadrias).toEqual([1])
        }
    })
})

describe('(3) o agrupamento é do LEVANTAMENTO', () => {
    it('peças de esquadrias diferentes com o mesmo código dividem barra', () => {
        // 1023: 1095,8 ×2 da grande e 495,8 ×2 da pequena = 3.183,2 mm — UMA barra para as duas
        const r = ok([esquadria(), esquadria({ L_mm: 600, H_mm: 500 })])
        expect(doCodigo(r, '1023').n_barras).toBe(1)
        expect(doCodigo(r, '1023').n_pecas).toBe(4)
        expect(r.esquadrias.map((e) => e.indice)).toEqual([1, 2])
    })
})

describe('(4) o código do item: um valor por código', () => {
    it('DOIS CÓDIGOS para o mesmo perfil e cor: falta PONTE_AMBIGUA com os dois códigos e os dois valores — nenhum é escolhido', () => {
        // BZ4556/WOLFF em BRANCO, como está no banco: 1027.1 (PVC) e 10271 (alumínio)
        const r = ok([esquadria({ tipologia: 'T-BZ4556', escolhas: {} })], { tipologias: { 'T-BZ4556': tipologiaDeUmPerfil('T-BZ4556', 'BZ4556/WOLFF') } })
        expect(faltasDe(r)).toEqual([['PONTE_AMBIGUA', 'BZ4556/WOLFF', 1]])
        const x = r.faltas[0]
        expect(x.candidatas.map((c) => c.codigo)).toEqual(['1027.1', '10271'])
        expect(x.frase).toContain(L().formatarReais(209.85989999999998))
        expect(x.frase).toContain(L().formatarReais(1055.25))
        expect(r.total.n_barras).toBe(0)
    })

    it('DOIS CÓDIGOS COM O MESMO PREÇO também é falta: nenhum dos dois entra', () => {
        const regras = [...REGRAS, { codigo: '10511-B', codigo_wvetro: 'BZ0010/WOLFF', cor: 'BRANCO' }]
        const itens = [...ITENS, { ...ITENS.find((i) => i.codigo === '10511')!, codigo: '10511-B' }]
        const r = ok([esquadria()], { regras, itens })
        expect(faltasDe(r)).toEqual([['PONTE_AMBIGUA', 'BZ0010/WOLFF', 1]])
        expect(r.total.barras_por_codigo['10511']).toBeUndefined()
        expect(r.total.barras_por_codigo['10511-B']).toBeUndefined()
    })

    // A REGRA DA COR (dono do produto, 08/11/2026 — substitui a de 25/10/2026): o perfil com variante casa pela cor pedida, e só por ela,
    // também quando a variante é UMA só. Sem a cor, é recusa nomeando o perfil, a cor e as variantes. O que não é cor ('CLICK', o aço) é o
    // DADO que diz: a coluna vazia no arquivo corrigido (`fixtures/arquivo-do-motor-corrigido.ts`), e então é "sem variante".
    it('o BZ0012 com a coluna Cor VAZIA (o arquivo corrigido): sem variante — serve a qualquer cor', () => {
        const r = ok([esquadria({ escolhas: { MAE: 2 } })])   // ARI no padrão = 1 → BZ0006 + BZ0012
        expect(r.por_codigo.map((c) => [c.codigo, c.perfil])).toContainEqual(['10491', 'BZ0012/WOLFF'])
        expect(L().codigoDaPeca('BZ0012/WOLFF', 'BRANCO', REGRAS)).toEqual({ ok: true, codigo: '10491', origem: 'SEM_VARIANTE' })
        expect(L().codigoDaPeca('BZ0012/WOLFF', 'PRETO', REGRAS)).toEqual({ ok: true, codigo: '10491', origem: 'SEM_VARIANTE' })
    })

    it('O MOTOR DE HOJE (o BZ0012 em CLICK, antes da correção do arquivo): a ponte não tem BRANCO, e o nome técnico acha o 10491 ("BZ0012 - BASE DA GUARNIÇÃO - CLICK") — mas nem o código (sem família) nem a descrição afirmam BRANCO: FALTA nomeada (a cor afirmada, 12/11/2026)', () => {
        const r = ok([esquadria({ escolhas: { MAE: 2 } })], { regras: REGRAS_DE_HOJE })
        expect(faltasDe(r)).toEqual([['DESCRICAO_NAO_CONCORDA', 'BZ0012/WOLFF', 1]])
        expect(r.faltas[0].frase).toContain('a cor BRANCO não foi afirmada')
        expect(r.resolucoes['10491']).toBeUndefined()
    })

    it('A VARIANTE ÚNICA SÓ SERVE PARA A COR QUE É — sempre, sem lista de cores da empresa: o BZ0006 (só em BRANCO) em PRETO, ROXO ou qualquer outra é recusa', () => {
        for (const cor of ['PRETO', 'ROXO', 'Laminado Golden Oak']) {
            const c = L().codigoDaPeca('BZ0006/WOLFF', cor, REGRAS)
            if (!('recusa' in c)) throw new Error(`levou o código branco ${c.codigo} para ${cor}`)
            expect([cor, c.recusa.motivo, c.recusa.variantes]).toEqual([cor, 'COR_SEM_CODIGO', ['BRANCO']])
        }
        expect(L().codigoDaPeca('BZ0006/WOLFF', 'branco', REGRAS)).toEqual({ ok: true, codigo: '10501', origem: 'COR' })
    })

    it('VÁRIAS VARIANTES e nenhuma na cor pedida: BZ1770/WOLFF (ARI = 2) em BRANCO — a ponte não tem BRANCO; o nome técnico recusa as sete que nomeiam cor (pela PALAVRA: "LAMINADO NOGUEIRA", "LAMINADO GOLDEN OAK") e fica o 90531, que não nomeia cor', () => {
        const r = ok([esquadria({ escolhas: { MAE: 2, ARI: 2 } })])
        expect(r.faltas).toEqual([])
        expect(r.resolucoes['90531']).toMatchObject({ como: 'nome_tecnico' })
        for (const c of ['905320', '905321', '905330', '905331', '905336', '905337', '905340']) expect(r.resolucoes[c]).toBeUndefined()
        // em PRETO TEXTURADO, o 905320 — o único que a nomeia — e não o sem cor
        const preto = ok([esquadria({ escolhas: { MAE: 2, ARI: 2 } })], { cor: 'PRETO TEXTURADO', regras: REGRAS.filter((g) => g.codigo_wvetro !== 'BZ1770/WOLFF') })
        expect(Object.keys(preto.resolucoes)).toContain('905320')
        expect(preto.resolucoes['90531']).toBeUndefined()
    })

    it('a GUARDA: a variante única que é uma COR DA EMPRESA, diferente da pedida, é recusa — o BZ0006 só existe BRANCO, e a janela é PRETO', () => {
        const c = L().codigoDaPeca('BZ0006/WOLFF', 'PRETO', REGRAS)
        if (!('recusa' in c)) throw new Error('era para recusar, e saiu ' + c.codigo)
        expect([c.recusa.motivo, c.recusa.variantes]).toEqual(['COR_SEM_CODIGO', ['BRANCO']])
    })

    it('perfil SEM VARIANTE nenhuma (cor vazia em todas as linhas) usa o único código', () => {
        const c = L().codigoDaPeca('1023/WOLFF', 'BRANCO', REGRAS)
        expect(c).toEqual({ ok: true, codigo: '1023', origem: 'SEM_VARIANTE' })
        expect(L().codigoDaPeca('BZ0010/WOLFF', 'BRANCO', REGRAS)).toEqual({ ok: true, codigo: '10511', origem: 'COR' })
    })

    it('cor vazia AO LADO de outras cores não é coringa: recusa', () => {
        const regras = [{ codigo: 'P1', codigo_wvetro: 'P/WOLFF', cor: null }, { codigo: 'P2', codigo_wvetro: 'P/WOLFF', cor: 'PRETO' }]
        const c = L().codigoDaPeca('P/WOLFF', 'BRANCO', regras)
        if (!('recusa' in c)) throw new Error('era para recusar, e saiu ' + c.codigo)
        expect(c.recusa.motivo).toBe('COR_SEM_CODIGO')
        expect(c.recusa.variantes).toEqual(['(vazia)', 'PRETO'])
    })

    it('a cor é comparada SEM CAIXA, e só sem caixa (08/11/2026): "Branco" casa com BRANCO; "Branco " e "Brancos" não', () => {
        const regras = [{ codigo: 'Q1', codigo_wvetro: 'Q/WOLFF', cor: 'Branco' }, { codigo: 'Q2', codigo_wvetro: 'Q/WOLFF', cor: 'PRETO' }]
        const c = L().codigoDaPeca('Q/WOLFF', 'BRANCO', regras)
        expect('recusa' in c ? c.recusa.mensagem : c.codigo).toBe('Q1')
        for (const cor of ['BRANCO ', 'BRANCOS', 'BRANCÓ']) {
            const x = L().codigoDaPeca('Q/WOLFF', cor, regras)
            expect([cor, 'recusa' in x ? x.recusa.motivo : x.codigo]).toEqual([cor, 'COR_SEM_CODIGO'])
        }
    })

    it('PERFIL SEM REGRA E SEM ITEM: falta nomeada (NAO_ACHADA) com o perfil — nada é calculado para ele', () => {
        const r = ok([esquadria({ tipologia: 'T-X', escolhas: {} })], { tipologias: { 'T-X': tipologiaDeUmPerfil('T-X', 'XX99/WOLFF') } })
        expect(faltasDe(r)).toEqual([['NAO_ACHADA', 'XX99/WOLFF', 1]])
        expect(r.faltas[0].frase).toContain('XX99/WOLFF')
    })
})

describe('(5) o item da tabela de preço', () => {
    it('ITEM AUSENTE na tabela de preço: FALTA nomeada com o perfil; as outras peças evoluem', () => {
        const r = ok([esquadria()], { itens: ITENS.filter((i) => i.codigo !== '10511') })
        expect(faltasDe(r)).toEqual([['NAO_ACHADA', 'BZ0010/WOLFF', 1]])
        expect(r.faltas[0].frase).toContain('BZ0010/WOLFF')
        expect(r.total.barras_por_codigo['10511']).toBeUndefined()
        expect(r.total.n_barras).toBe(8)
    })

    it('o MESMO código em duas linhas da tabela de preço: falta AMBIGUA, não pega a primeira', () => {
        const itens = [...ITENS, { ...ITENS.find((i) => i.codigo === '9641')!, valor_barra_interno: 1 }]
        const r = ok([esquadria()], { itens })
        expect(faltasDe(r)).toEqual([['AMBIGUA', 'HF88/WOLFF', 1]])
        expect(r.total.barras_por_codigo['9641']).toBeUndefined()
    })

    it('PREÇO AUSENTE é FALTA (12/11/2026 — substitui a recusa de 08/11): o código fica fora das barras e dos totais, e a falta nomeia o item e o perfil', () => {
        const itens = ITENS.map((i) => (i.codigo === '9641' ? { ...i, valor_barra_interno: null } : i))
        const r = ok([esquadria()], { itens })
        expect(faltasDe(r)).toEqual([['SEM_VALOR', 'HF88/WOLFF', 1]])
        expect(r.faltas[0].frase).toContain('9641')
        expect(r.faltas[0].frase).toContain('sem o valor da barra')
        expect(r.total.barras_por_codigo['9641']).toBeUndefined()
        // o total é SÓ do que tem preço: o de antes menos a barra do 9641
        expect(r.total.total_por_barra_inteira).toBeCloseTo(1342.0875 - 398.304, 6)
    })

    it('a recusa do AGRUPADOR sai com o perfil: peça maior que a barra — UMA por código, com a maior peça (08/11/2026), e a falta curta', () => {
        const itens = ITENS.map((i) => (i.codigo === '10511' ? { ...i, medida_barra_m: 1 } : i))
        const r = recusado([esquadria()], { itens })
        expect(r.recusas.map((x) => [x.origem, x.motivo, x.codigo, x.perfil])).toEqual([
            ['AGRUPADOR', 'PECA_MAIOR_QUE_A_BARRA', '10511', 'BZ0010/WOLFF'],
        ])
        expect(r.recusas[0].mensagem).toContain('BZ0010/WOLFF')
        expect(r.recusas[0].falta).toMatch(/^uma barra em que caiba a maior peça do código 10511, perfil BZ0010\/WOLFF: a peça tem [\d,]+ mm e a barra, 1000 mm$/)
        expect(r.recusas[0].caminho).toBeNull()
    })
})

describe('(5b) A RESOLUÇÃO DE REFERÊNCIA no cálculo (dono do produto, 12/11/2026): a mesma da conferência', () => {
    it('todo código da DP-02 achado pela PONTE do motor, e o resultado diz como — é o que a fotografia do material grava', () => {
        const r = ok([esquadria()])
        expect(Object.keys(r.resolucoes).sort()).toEqual(['1023', '10511', '8432', '8433', '9641', '9681', '9711', '9801'])
        expect(Object.values(r.resolucoes).every((x) => x.como === 'ponte')).toBe(true)
        expect(r.resolucoes['9641'].item.codigo).toBe('9641')
        expect(r.faltas).toEqual([])
    })

    it('O SUFIXO DO FORNECEDOR dentro do degrau: a tabela com 1023/WOLFF fecha a mesma DP-02, com as mesmas barras e o mesmo total', () => {
        const comSufixo = ITENS.map((i) => (i.codigo === '1023' ? { ...i, codigo: '1023/WOLFF' } : i))
        const r = ok([esquadria()], { itens: comSufixo })
        expect(r.total.barras_por_codigo).toEqual({ '1023': 1, '10511': 1, '8432': 1, '8433': 1, '9641': 1, '9681': 2, '9711': 1, '9801': 1 })
        expect(r.total.total_por_barra_inteira).toBeCloseTo(1342.0875, 6)
        expect(r.resolucoes['1023']).toMatchObject({ como: 'ponte', item: { codigo: '1023/WOLFF' } })
    })

    it('a AMBIGUIDADE: 1023 com o sufixo em duas grafias — nenhuma é escolhida; a falta nomeia o perfil e as duas candidatas', () => {
        const base = ITENS.find((i) => i.codigo === '1023')!
        const itens = [...ITENS.filter((i) => i.codigo !== '1023'), { ...base, codigo: '1023/WOLFF' }, { ...base, codigo: '1023 /wolff' }]
        const r = ok([esquadria()], { itens })
        expect(faltasDe(r)).toEqual([['AMBIGUA', '1023/WOLFF', 1]])
        expect(r.faltas[0].candidatas.map((c) => c.codigo).sort()).toEqual(['1023 /wolff', '1023/WOLFF'])
        expect(r.total.barras_por_codigo['1023']).toBeUndefined()
    })

    it('O GUARDA: o item da ponte que é outro produto não vira preço — a falta nomeia a candidata', () => {
        const itens = ITENS.map((i) => (i.codigo === '1023' ? { ...i, descricao: 'MAÇANETA QUALQUER' } : i))
        const r = ok([esquadria()], { itens })
        expect(faltasDe(r)).toEqual([['DESCRICAO_NAO_CONCORDA', '1023/WOLFF', 1]])
        expect(r.faltas[0].frase).toContain('MAÇANETA QUALQUER')
    })
})

describe('(6) as recusas', () => {
    it('com qualquer RECUSA (o que impede o cálculo) NÃO SAI BARRA NENHUMA — nada é calculado com o que sobrou', () => {
        // a 1ª esquadria fecha; a 2ª tem uma opção que não existe (MAE = 9): o avaliador recusa
        const r = levantar([esquadria(), esquadria({ escolhas: { ARI: 4, MAE: 9 } })])
        expect('recusas' in r).toBe(true)
        expect('por_codigo' in r).toBe(false)
        expect('total' in r).toBe(false)
    })

    it('TODAS AS RECUSAS de uma vez, e a mesma recusa em duas esquadrias sai UMA vez com as duas', () => {
        const r = recusado([
            esquadria({ tipologia: 'DP-99' }),           // 1: tipologia que não existe
            esquadria({ tipologia: 'DP-99' }),           // 2: de novo
            esquadria(),                                 // 3: fecha
        ])
        expect(r.recusas.map((x) => [x.motivo, x.tipologia, x.esquadrias])).toEqual([['TIPOLOGIA_SEM_DEFINICAO', 'DP-99', [1, 2]]])
        expect(r.recusas[0].mensagem).toContain('Itens 1 e 2')
    })

    it('A FALTA é uma por (perfil, esquadria): o 9641 que sumiu da tabela falta nas três esquadrias que o usam', () => {
        const r = ok([esquadria(), esquadria(), esquadria()], { itens: ITENS.filter((i) => i.codigo !== '9641') })
        expect(faltasDe(r)).toEqual([['NAO_ACHADA', 'HF88/WOLFF', 1], ['NAO_ACHADA', 'HF88/WOLFF', 2], ['NAO_ACHADA', 'HF88/WOLFF', 3]])
    })

    it('a recusa do AVALIADOR sai com o número da esquadria', () => {
        // MAE = 9: a opção não existe, e o avaliador recusa
        const r = recusado([esquadria(), esquadria({ escolhas: { ARI: 4, MAE: 9 } })])
        expect(r.recusas.length).toBeGreaterThan(0)
        for (const x of r.recusas) {
            expect(x.origem).toBe('AVALIADOR')
            expect(x.esquadrias).toEqual([2])
            expect(x.mensagem.startsWith('Item 2 (DP-02): ')).toBe(true)
        }
        expect(r.recusas.map((x) => x.motivo)).toContain('ESCOLHA_FORA_DAS_OPCOES')
    })

    it('TIPOLOGIA SEM DEFINIÇÃO é recusada', () => {
        const r = recusado([esquadria({ tipologia: 'DP-99' })])
        expect(r.recusas.map((x) => [x.motivo, x.tipologia, x.esquadrias])).toEqual([['TIPOLOGIA_SEM_DEFINICAO', 'DP-99', [1]]])
    })

    it('DETERMINÍSTICO: a ordem das esquadrias não muda as barras, os totais nem a ordem das recusas', () => {
        const a = esquadria()
        const b = esquadria({ L_mm: 600, H_mm: 500 })
        expect(ok([b, a]).por_codigo).toEqual(ok([a, b]).por_codigo)
        expect(ok([b, a]).total).toEqual(ok([a, b]).total)
        // Uma recusa de ESQUADRIA e uma do AVALIADOR: as duas nascem no mesmo passo, esquadria a
        // esquadria, na ordem da entrada — é a ordenação final que as põe no lugar. A primeira versão
        // deste caso usava duas recusas da ponte, que já saem na ordem do perfil; a mutação que tira a
        // ordenação (M15) passou verde por ela. Medido, e trocado.
        const x = esquadria({ tipologia: 'DP-99' })             // TIPOLOGIA_SEM_DEFINICAO
        const y = esquadria({ escolhas: { ARI: 4, MAE: 9 } })   // ESCOLHA_FORA_DAS_OPCOES, do avaliador
        const chave = (r: ReturnType<typeof recusado>) => r.recusas.map((z) => `${z.origem}/${z.motivo}`)
        expect(chave(recusado([y, x]))[0]).toBe('ESQUADRIA/TIPOLOGIA_SEM_DEFINICAO')
        expect(chave(recusado([x, y]))).toEqual(chave(recusado([y, x])))
    })
})

describe('(7) os avisos e a pureza', () => {
    it('os AVISOS do avaliador saem com o número da esquadria', () => {
        // H = 380 está abaixo do mínimo de altura da DP-02 (388): aviso, não recusa
        const r = ok([esquadria(), esquadria({ H_mm: 380 })])
        expect(r.esquadrias[0].avisos).toEqual([])
        expect(r.esquadrias[1].avisos.map((x) => x.origem)).toContain('LIMITE')
        expect(r.avisos.every((x) => x.esquadria === 2)).toBe(true)
        expect(r.avisos.length).toBeGreaterThan(0)
    })

    it('o valor em reais é formatado sem depender do ICU', () => {
        expect(L().formatarReais(1055.25)).toBe('R$ 1.055,25')
        expect(L().formatarReais(209.85989999999998)).toBe('R$ 209,86')
        expect(L().formatarReais(1234567.891)).toBe('R$ 1.234.567,89')
        expect(L().formatarReais(null)).toBe('sem valor')
    })

    it('função PURA: não lê banco nem rede', () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const src: string = require('fs').readFileSync(require('path').join(process.cwd(), 'src/lib/atendimentos-ia/levantamento-de-barras.ts'), 'utf8')
        expect(src).not.toMatch(/supabase/i)
        expect(src).not.toMatch(/\bfetch\(/)
    })
})

export {}
