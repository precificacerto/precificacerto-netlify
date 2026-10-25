/**
 * PORTÃO — a LIGAÇÃO avaliador → agrupador (`src/lib/atendimentos-ia/levantamento-de-barras.ts`):
 * dadas N esquadrias (tipologia, L, H, quantidade, escolhas), as peças de cada uma pelo avaliador,
 * o CÓDIGO DO ITEM de cada peça pela tabela do fornecedor, e as barras do levantamento inteiro pelo
 * agrupador, com o aproveitamento e os dois totais.
 *
 * OS DADOS são reais. A tipologia é `fixtures/fixture_DP-02.json` (a do avaliador). O de-para e os
 * itens são `fixtures/fixture_de-para_DP-02.json`, um RECORTE de `orcamentista_motor_regra` e
 * `orcamentista_tabela_item` da tabela Wolff, lido em 24/10/2026 e conferido contra o banco: o md5
 * das 23 regras (`codigo;codigo_wvetro;cor`, ordenadas) e o dos 23 itens (`codigo;descricao;medida;
 * valor_barra;valor_metro`, com 6 casas) saíram IGUAIS no banco e no arquivo —
 * be9fd733373ea4c352ccc81daa000b3f e eed69af4ebbcb2468d6b95fff1b31721.
 *
 * AS DECISÕES DO DONO DO PRODUTO, 24/10/2026, que estes casos guardam:
 *   - a cor desta versão é BRANCO, fixa. As outras não estão no motor porque a tabela de preço
 *     delas não foi enviada; nenhum de-para de cor é inventado;
 *   - barra → referência → código → valor, UM valor por código. Dois códigos para o mesmo perfil e
 *     cor é dado incompleto: RECUSA, com os dois códigos e os dois valores — mesmo com preço igual;
 *   - faltou dado, recusa nomeada (`.claude/rules/faltou-dado-recusa-nomeada.md`): nunca aproxima,
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

/* eslint-disable @typescript-eslint/no-require-imports */
// Lido DENTRO dos casos: no commit do portão o módulo ainda não existe, e cada caso tem de ficar
// vermelho por conta própria.
type Ligacao = typeof import('@/lib/atendimentos-ia/levantamento-de-barras')
const L = () => require('@/lib/atendimentos-ia/levantamento-de-barras') as Ligacao
type Avaliador = typeof import('@/lib/atendimentos-ia/avaliador-de-formulas')
const A = () => require('@/lib/atendimentos-ia/avaliador-de-formulas') as Avaliador
const TIPOLOGIAS = require('./fixtures/fixture_DP-02.json')
const DE_PARA = require('./fixtures/fixture_de-para_DP-02.json')
/* eslint-enable @typescript-eslint/no-require-imports */
// O estreitamento é por `'recusas' in r`: com `strictNullChecks: false`, o tsc não estreita a união
// pelo booleano `ok`.

type Regra = { codigo: string; codigo_wvetro: string; cor: string | null }
type Item = { codigo: string; descricao: string | null; medida_barra_m: number | null; valor_barra_interno: number | null; valor_metro_interno: number | null }
type Esquadria = { tipologia: string; L_mm: number; H_mm: number; quantidade: number; escolhas?: Record<string, number>; espessura_vidro_mm?: number | null }

const REGRAS: Regra[] = DE_PARA.regras
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
function levantar(esquadrias: Esquadria[], o: { regras?: Regra[]; itens?: Item[]; tipologias?: Record<string, unknown> } = {}) {
    return L().levantarBarras({
        esquadrias,
        tipologias: (o.tipologias ?? { 'DP-02': dp02() }) as never,
        regras: o.regras ?? REGRAS,
        itens: o.itens ?? ITENS,
        serra_mm: SERRA,
    })
}
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
        expect(r.falta_para_o_total).toEqual([])
    })

    it('a esquadria sai com as peças DELA, cada uma com o perfil e o código do item', () => {
        const r = ok([esquadria()])
        expect(r.esquadrias).toHaveLength(1)
        const e = r.esquadrias[0]
        expect(e.indice).toBe(1)
        const sf66 = e.pecas.filter((p) => p.perfil === 'SF66/WOLFF')
        expect(sf66.map((p) => [p.codigo, p.comprimento_mm, p.quantidade])).toEqual([['9681', 595.8, 4], ['9681', 917.6, 4]])
    })

    it('a cor desta versão é BRANCO, e só BRANCO', () => {
        expect(L().COR_DA_PRIMEIRA_VERSAO).toBe('BRANCO')
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
    it('DOIS CÓDIGOS para o mesmo perfil e cor: recusa com os dois códigos e os dois valores', () => {
        // BZ4556/WOLFF em BRANCO, como está no banco: 1027.1 (PVC) e 10271 (alumínio)
        const r = recusado([esquadria({ tipologia: 'T-BZ4556', escolhas: {} })], { tipologias: { 'T-BZ4556': tipologiaDeUmPerfil('T-BZ4556', 'BZ4556/WOLFF') } })
        expect(r.recusas).toHaveLength(1)
        const x = r.recusas[0]
        expect(x.motivo).toBe('DOIS_CODIGOS')
        expect(x.perfil).toBe('BZ4556/WOLFF')
        expect(x.candidatos!.map((c) => c.codigo)).toEqual(['1027.1', '10271'])
        expect(x.mensagem).toContain('1027.1')
        expect(x.mensagem).toContain('10271')
        expect(x.mensagem).toContain(L().formatarReais(209.85989999999998))
        expect(x.mensagem).toContain(L().formatarReais(1055.25))
    })

    it('DOIS CÓDIGOS COM O MESMO PREÇO também é recusa', () => {
        const regras = [...REGRAS, { codigo: '10511-B', codigo_wvetro: 'BZ0010/WOLFF', cor: 'BRANCO' }]
        const itens = [...ITENS, { ...ITENS.find((i) => i.codigo === '10511')!, codigo: '10511-B' }]
        const r = recusado([esquadria()], { regras, itens })
        expect(r.recusas.map((x) => [x.motivo, x.perfil])).toEqual([['DOIS_CODIGOS', 'BZ0010/WOLFF']])
    })

    it('COR SEM CÓDIGO: BZ0012/WOLFF só tem CLICK, e a DP-02 com arremate interno é recusada nomeando a variante', () => {
        const r = recusado([esquadria({ escolhas: { MAE: 2 } })])   // ARI no padrão = 1 → BZ0012
        expect(r.recusas.map((x) => [x.motivo, x.perfil])).toEqual([['COR_SEM_CODIGO', 'BZ0012/WOLFF']])
        expect(r.recusas[0].variantes).toEqual(['CLICK'])
        expect(r.recusas[0].mensagem).toContain('CLICK')
        expect(r.recusas[0].mensagem).toContain('BRANCO')
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

    it('a cor é comparada EXATA: "Branco" não casa com BRANCO', () => {
        const regras = [{ codigo: 'Q1', codigo_wvetro: 'Q/WOLFF', cor: 'Branco' }]
        const c = L().codigoDaPeca('Q/WOLFF', 'BRANCO', regras)
        if (!('recusa' in c)) throw new Error('era para recusar, e saiu ' + c.codigo)
        expect(c.recusa.motivo).toBe('COR_SEM_CODIGO')
        expect(c.recusa.variantes).toEqual(['Branco'])
    })

    it('PERFIL SEM REGRA: recusa nomeando o perfil', () => {
        const r = recusado([esquadria({ tipologia: 'T-X', escolhas: {} })], { tipologias: { 'T-X': tipologiaDeUmPerfil('T-X', 'XX99/WOLFF') } })
        expect(r.recusas.map((x) => [x.motivo, x.perfil])).toEqual([['PERFIL_SEM_REGRA', 'XX99/WOLFF']])
        expect(r.recusas[0].mensagem).toContain('XX99/WOLFF')
    })
})

describe('(5) o item da tabela de preço', () => {
    it('ITEM AUSENTE na tabela de preço: recusa nomeando o código e o perfil', () => {
        const r = recusado([esquadria()], { itens: ITENS.filter((i) => i.codigo !== '10511') })
        expect(r.recusas.map((x) => [x.motivo, x.codigo, x.perfil])).toEqual([['ITEM_AUSENTE', '10511', 'BZ0010/WOLFF']])
        expect(r.recusas[0].mensagem).toContain('10511')
        expect(r.recusas[0].mensagem).toContain('BZ0010/WOLFF')
    })

    it('o MESMO código em duas linhas da tabela de preço: recusa, não pega a primeira', () => {
        const itens = [...ITENS, { ...ITENS.find((i) => i.codigo === '9641')!, valor_barra_interno: 1 }]
        const r = recusado([esquadria()], { itens })
        expect(r.recusas.map((x) => [x.motivo, x.codigo])).toEqual([['ITEM_EM_DUAS_LINHAS', '9641']])
    })

    it('PREÇO AUSENTE: as barras saem, o total daquele valor sai NULL, e a falta é nomeada', () => {
        const itens = ITENS.map((i) => (i.codigo === '9641' ? { ...i, valor_barra_interno: null } : i))
        const r = ok([esquadria()], { itens })
        expect(r.total.n_barras).toBe(9)
        expect(r.total.total_por_barra_inteira).toBeNull()
        expect(r.total.total_por_consumo_real).toBeCloseTo(829.7932204, 6)
        expect(r.falta_para_o_total.map((f) => [f.codigo, f.perfil, f.falta, f.total])).toEqual([['9641', 'HF88/WOLFF', 'valor_barra_interno', 'total_por_barra_inteira']])
        expect(r.falta_para_o_total[0].mensagem).toContain('9641')
    })

    it('a recusa do AGRUPADOR sai com o perfil: peça maior que a barra', () => {
        const itens = ITENS.map((i) => (i.codigo === '10511' ? { ...i, medida_barra_m: 1 } : i))
        const r = recusado([esquadria()], { itens })
        expect(r.recusas.map((x) => [x.origem, x.motivo, x.codigo, x.perfil])).toEqual([
            ['AGRUPADOR', 'PECA_MAIOR_QUE_A_BARRA', '10511', 'BZ0010/WOLFF'],
            ['AGRUPADOR', 'PECA_MAIOR_QUE_A_BARRA', '10511', 'BZ0010/WOLFF'],
        ])
        expect(r.recusas[0].mensagem).toContain('BZ0010/WOLFF')
    })
})

describe('(6) as recusas', () => {
    it('com qualquer recusa NÃO SAI BARRA NENHUMA — nada é calculado com o que sobrou', () => {
        // a 1ª esquadria fecha; a 2ª tem o BZ0012 sem código em BRANCO
        const r = levantar([esquadria(), esquadria({ escolhas: { MAE: 2 } })])
        expect('recusas' in r).toBe(true)
        expect('por_codigo' in r).toBe(false)
        expect('total' in r).toBe(false)
    })

    it('TODAS AS RECUSAS de uma vez, e a mesma falta em duas esquadrias sai UMA vez com as duas', () => {
        const r = recusado([
            esquadria({ escolhas: { MAE: 2 } }),          // 1: BZ0012
            esquadria({ escolhas: { MAE: 2 } }),          // 2: BZ0012 de novo
            esquadria({ tipologia: 'DP-99' }),           // 3: tipologia que não existe
            esquadria(),                                 // 4: fecha — mas o 9641 sumiu da tabela
        ], { itens: ITENS.filter((i) => i.codigo !== '9641') })
        const resumo = r.recusas.map((x) => [x.motivo, x.perfil ?? x.tipologia, x.esquadrias])
        expect(resumo).toEqual([
            ['TIPOLOGIA_SEM_DEFINICAO', 'DP-99', [3]],
            ['COR_SEM_CODIGO', 'BZ0012/WOLFF', [1, 2]],
            ['ITEM_AUSENTE', 'HF88/WOLFF', [1, 2, 4]],
        ])
        expect(r.recusas[1].mensagem).toContain('Esquadrias 1 e 2')
        expect(r.recusas[2].mensagem).toContain('Esquadrias 1, 2 e 4')
    })

    it('a recusa do AVALIADOR sai com o número da esquadria', () => {
        // ARE = 1 e MAE no padrão: "MEDIDA DO VÃO" não tem colchete, e &MAE não tem valor
        const r = recusado([esquadria(), esquadria({ escolhas: {} })])
        expect(r.recusas.length).toBeGreaterThan(0)
        for (const x of r.recusas) {
            expect(x.origem).toBe('AVALIADOR')
            expect(x.esquadrias).toEqual([2])
            expect(x.mensagem.startsWith('Esquadria 2 (DP-02): ')).toBe(true)
        }
        expect(r.recusas.map((x) => x.motivo)).toContain('MEDIDA_DA_OPCAO_AUSENTE')
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
        const y = esquadria({ escolhas: {} })                   // MEDIDA_DA_OPCAO_AUSENTE, do avaliador
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
