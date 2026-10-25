/**
 * @jest-environment node
 *
 * PORTÃO — o LEVANTAMENTO NA CONVERSA (`src/lib/atendimentos-ia/levantamento-da-conversa.ts`): a
 * tabela em uso da empresa, as tipologias candidatas, o tempo de fabricação (leitura TEMPORÁRIA da
 * coluna antiga), a espessura do vidro, e as duas mensagens que o vendedor lê — a do levantamento e a
 * da recusa. O banco é falso, em memória. Os dados da DP-02 são os mesmos do portão da ligação: as
 * abas em `abas-do-motor-wolff-DP-02.json` e o recorte conferido por md5 em
 * `fixtures/fixture_de-para_DP-02.json`.
 *
 * A primeira versão (dono do produto, 25/10/2026): cor fixa BRANCO, só as escolhas que a conversa
 * captura (hoje nenhuma: tudo no Padrão), uma esquadria por conversa, nada persistido, e só a DP-02
 * da tabela Wolff com as abas do motor.
 */
export {}

type Linha = Record<string, unknown>

const TENANT = 'tenant-1'
const TABELA = '72366020-57c9-489f-9385-397b7fa3dedb'
/* eslint-disable @typescript-eslint/no-require-imports */
const DE_PARA = require('./fixtures/fixture_de-para_DP-02.json') as { regras: Linha[]; itens: Linha[] }
/* eslint-enable @typescript-eslint/no-require-imports */

const banco = {
    db: {} as Record<string, Linha[]>,
    /** Tabelas que "não existem": a leitura volta com o erro do PostgREST. */
    ausentes: new Set<string>(),
}

jest.mock('@/supabase/admin', () => ({
    supabaseAdmin: {
        from: (tabela: string) => {
            const predicados: Array<(l: Linha) => boolean> = []
            let contar = false
            let faixa: [number, number] | null = null
            let ordem: string | null = null
            const filtradas = () => (banco.db[tabela] ?? []).filter((l) => predicados.every((p) => p(l)))
            type Resposta = { data: Linha[] | null; error: { code: string; message: string } | null; count: number | null }
            const resposta = (): Resposta => {
                if (banco.ausentes.has(tabela)) return { data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${tabela}' in the schema cache` }, count: null }
                let linhas = filtradas()
                if (ordem) { const c = ordem; linhas = [...linhas].sort((a, b) => (String(a[c]) < String(b[c]) ? -1 : String(a[c]) > String(b[c]) ? 1 : 0)) }
                const total = linhas.length
                if (faixa) linhas = linhas.slice(faixa[0], faixa[1] + 1)
                return { data: linhas, error: null, count: contar ? total : null }
            }
            const q: Record<string, unknown> = {}
            q.select = (_c?: string, o?: { count?: string }) => { contar = o?.count === 'exact'; return q }
            q.eq = (c: string, v: unknown) => { predicados.push((l) => l[c] === v); return q }
            q.in = (c: string, vs: unknown[]) => { predicados.push((l) => vs.includes(l[c])); return q }
            q.contains = (c: string, vs: unknown[]) => { predicados.push((l) => Array.isArray(l[c]) && vs.every((v) => (l[c] as unknown[]).includes(v))); return q }
            q.order = (c: string) => { ordem = c; return q }
            q.range = (de: number, ate: number) => { faixa = [de, ate]; return q }
            q.maybeSingle = async () => { const r = resposta(); return { data: r.data ? r.data[0] ?? null : null, error: r.error } }
            q.then = (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(resposta()).then(ok, erro)
            return q
        },
    },
}))

/* eslint-disable @typescript-eslint/no-require-imports */
type Modulo = typeof import('@/lib/atendimentos-ia/levantamento-da-conversa')
const M = () => require('@/lib/atendimentos-ia/levantamento-da-conversa') as Modulo
type Ligacao = typeof import('@/lib/atendimentos-ia/levantamento-de-barras')
const LB = () => require('@/lib/atendimentos-ia/levantamento-de-barras') as Ligacao
type Avaliador = typeof import('@/lib/atendimentos-ia/avaliador-de-formulas')
const AV = () => require('@/lib/atendimentos-ia/avaliador-de-formulas') as Avaliador
const ABAS = require('@/lib/atendimentos-ia/abas-do-motor-wolff-DP-02.json')
/* eslint-enable @typescript-eslint/no-require-imports */

let sequencia = 0
const comId = (l: Linha) => ({ id: `r-${String(++sequencia).padStart(6, '0')}`, ...l })

function montar() {
    banco.ausentes = new Set()
    banco.db = {
        orcamentista_conta_tabela: [{ tenant_id: TENANT, tabela_id: TABELA }],
        orcamentista_motor_tipologia_detalhe: [
            { tabela_id: TABELA, tipologia: 'DP-02', descricao: 'JANELA DE CORRER 02 FOLHAS MÓVEIS | EUROPA 42', tipo: 'Correr' },
            { tabela_id: TABELA, tipologia: 'DP-01', descricao: 'MAXIM-AR COM "N" MÓDULOS HORIZONTAIS E 01 MÓDULO VERTICAL | DESIGN', tipo: 'Maxim-ar' },
        ],
        orcamentista_motor_regra: DE_PARA.regras.map((r) => comId({ ...r, tabela_id: TABELA, tipologias: ['DP-02'] })),
        orcamentista_tabela_item: DE_PARA.itens.map((i) => ({ ...i, tabela_id: TABELA })),
        orcamentista_mp_categoria: [{ tenant_id: TENANT, categoria_chave: 'PERFIL', config: { serra_mm: 5, cores: ['BRANCO'], cor_predominante: 'BRANCO' } }],
        orcamentista_motor_tipologia: [{ tabela_id: TABELA, tipologia: 'DP-02', tempo_fabricacao_min: 150, tempo_origem: 'IMPORTADO' }],
    }
}
beforeEach(montar)

const ESQUADRIA = { tipologia: 'DP-02', largura_mm: 1200, altura_mm: 1000, quantidade: 1, vidro: 'Temperado 5mm' }

describe('(1) a tabela da empresa e as tipologias candidatas', () => {
    it('a lista vem de orcamentista_motor_tipologia_detalhe da tabela LIGADA à empresa, em ordem de código', async () => {
        const t = await M().lerTabelaDaEmpresa(TENANT)
        if (!('candidatos' in t)) throw new Error('era para ler a lista: ' + t.frase)
        expect(t.tabelaId).toBe(TABELA)
        expect(t.candidatos.map((c) => c.tipologia)).toEqual(['DP-01', 'DP-02'])
        expect(M().linhaDoCandidato(t.candidatos[1])).toBe('DP-02 | JANELA DE CORRER 02 FOLHAS MÓVEIS | EUROPA 42 | Correr')
    })

    it('SEM TABELA LIGADA: a frase diz que a empresa não tem tabela', async () => {
        banco.db.orcamentista_conta_tabela = []
        const t = await M().lerTabelaDaEmpresa(TENANT)
        expect('frase' in t && [t.motivo, t.frase]).toEqual(['SEM_TABELA', M().FRASE_SEM_TABELA])
    })

    it('MAIS DE UMA TABELA: não escolhe uma — a frase diz quantas', async () => {
        banco.db.orcamentista_conta_tabela.push({ tenant_id: TENANT, tabela_id: 'outra-tabela' })
        const t = await M().lerTabelaDaEmpresa(TENANT)
        expect('frase' in t && [t.motivo, t.frase]).toEqual(['MAIS_DE_UMA_TABELA', M().fraseDeMaisDeUmaTabela(2)])
    })

    it('a LISTA AINDA NÃO EXISTE (a tabela do banco não está lá): a frase diz que a lista não foi carregada', async () => {
        banco.ausentes.add('orcamentista_motor_tipologia_detalhe')
        const t = await M().lerTabelaDaEmpresa(TENANT)
        expect('frase' in t && [t.motivo, t.frase, t.detalhe]).toEqual(['SEM_LISTA_DE_TIPOLOGIAS', M().FRASE_SEM_LISTA_DE_TIPOLOGIAS, 'codigo=PGRST205'])
    })

    it('a lista existe e está VAZIA para a tabela da empresa: a mesma frase', async () => {
        banco.db.orcamentista_motor_tipologia_detalhe = []
        const t = await M().lerTabelaDaEmpresa(TENANT)
        expect('frase' in t && t.motivo).toBe('SEM_LISTA_DE_TIPOLOGIAS')
    })
})

describe('(2) o tempo de fabricação — leitura TEMPORÁRIA da coluna antiga', () => {
    it('lê tempo_fabricacao_min e tempo_origem de orcamentista_motor_tipologia', async () => {
        expect(await M().tempoDeFabricacao(TABELA, 'DP-02')).toEqual({ minutos: 150, origem: 'IMPORTADO' })
    })

    it('sem tempo cadastrado: null, nunca zero', async () => {
        expect(await M().tempoDeFabricacao(TABELA, 'DP-01')).toBeNull()
    })
})

describe('(3) a espessura do vidro', () => {
    it.each([
        ['Temperado 6mm', 6],
        ['temperado 8 MM', 8],
        ['Laminado 6,38 mm', 6.38],
        ['Laminado 4+4 mm', null],
        ['Temperado incolor', null],
        ['Temperado 6', null],
        ['6 mm ou 8 mm', null],
    ])('"%s" → %s', (vidro, esperado) => {
        expect(M().espessuraDoVidro(vidro)).toBe(esperado)
    })
})

describe('(4) as regras são lidas TODAS, página a página', () => {
    it('com 2.500 regras na tipologia, as 2.500 chegam — e as de outra tipologia, não', async () => {
        const muitas = Array.from({ length: 2500 }, (_, k) => comId({ tabela_id: TABELA, codigo: `C${k}`, codigo_wvetro: `P${k}/WOLFF`, cor: 'BRANCO', tipologias: ['DP-07'] }))
        banco.db.orcamentista_motor_regra.push(...muitas)
        const lidas = await M().lerRegras(TABELA, 'DP-07')
        expect(lidas).toHaveLength(2500)
        expect(new Set(lidas.map((r) => r.codigo)).size).toBe(2500)
        expect(await M().lerRegras(TABELA, 'DP-02')).toHaveLength(DE_PARA.regras.length)
    })
})

describe('(5) a mensagem do levantamento', () => {
    function resultadoQueFecha() {
        const lida = AV().lerTipologia(ABAS, 'DP-02')
        if ('recusas' in lida) throw new Error('abas recusadas')
        const r = LB().levantarBarras({
            esquadrias: [{ tipologia: 'DP-02', L_mm: 1200, H_mm: 1000, quantidade: 1, escolhas: { MAE: 2, ARI: 4 }, espessura_vidro_mm: 5 }],
            tipologias: { 'DP-02': lida.tipologia }, regras: DE_PARA.regras as never, itens: DE_PARA.itens as never, serra_mm: 5,
        })
        if ('recusas' in r) throw new Error('recusado: ' + r.recusas.map((x) => x.mensagem).join(' | '))
        return r
    }

    it('o LEVANTAMENTO QUE FECHA: barras por código, aproveitamento, os dois totais e o tempo — o texto inteiro', () => {
        const texto = M().fraseDoLevantamento(ESQUADRIA, resultadoQueFecha(), { minutos: 150, origem: 'IMPORTADO' })
        expect(texto).toBe([
            'Levantamento de DP-02, 1.200 x 1.000 mm, 1 unidade(s), perfil BRANCO.',
            '',
            'Barras por código:',
            '• 1023 (1023/WOLFF): 1 barra(s) de 6 m',
            '• 10511 (BZ0010/WOLFF): 1 barra(s) de 6 m',
            '• 8432 (8432/WOLFF): 1 barra(s) de 6 m',
            '• 8433 (8433/WOLFF): 1 barra(s) de 6 m',
            '• 9641 (HF88/WOLFF): 1 barra(s) de 6 m',
            '• 9681 (SF66/WOLFF): 2 barra(s) de 6 m',
            '• 9711 (IL36/WOLFF): 1 barra(s) de 6 m',
            '• 9801 (GB25/WOLFF): 1 barra(s) de 6 m',
            '',
            'Aproveitamento do levantamento: 60,7% (32,77 m úteis de 54,00 m comprados).',
            'Total por barra inteira: R$ 1.342,09.',
            'Total por consumo real: R$ 829,79.',
            'Tempo de fabricação da tipologia: 150 min (IMPORTADO).',
        ].join('\n'))
    })

    it('PREÇO AUSENTE: o total que não sai diz qual código falta — nunca R$ 0,00', () => {
        const r = resultadoQueFecha()
        const semBarra = { ...r, total: { ...r.total, total_por_barra_inteira: null as number | null }, falta_para_o_total: [{ codigo: '9641', perfil: 'HF88/WOLFF', falta: 'valor_barra_interno' as const, total: 'total_por_barra_inteira' as const, mensagem: '' }] }
        const texto = M().fraseDoLevantamento(ESQUADRIA, semBarra, null)
        expect(texto).toContain('Total por barra inteira: não sai — falta o valor da barra de 9641 (HF88/WOLFF).')
        expect(texto).toContain('Tempo de fabricação da tipologia: não está cadastrado para DP-02.')
        expect(texto).not.toContain('R$ 0,00')
    })

    it('os AVISOS do avaliador saem em português, com a medida e o limite', () => {
        const r = resultadoQueFecha()
        const comAviso = { ...r, avisos: [{ origem: 'LIMITE' as const, medida: 'H' as const, limite: 'MIN' as const, valor_mm: 380, limite_mm: 388, excesso_mm: 8, excesso_pct: 2.0618556701, esquadria: 1 }] }
        expect(M().fraseDoLevantamento(ESQUADRIA, comAviso, null)).toContain('Atenção:\n• A altura de 380 mm está abaixo do mínimo da tipologia (388 mm), 8 mm (2,1%).')
    })
})

describe('(6) a RECUSA chega como texto, inteira e nomeada', () => {
    it('a DP-02 no PADRÃO (a conversa não captura escolha): MAE sem colchete é recusado, sem o prefixo de esquadria', async () => {
        const t = await M().lerTabelaDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, ESQUADRIA)
        expect(r.desfecho).toBe('recusou')
        expect(r.texto.startsWith('Não consegui fechar o levantamento de DP-02, 1.200 x 1.000 mm, 1 unidade(s), perfil BRANCO. Falta:\n• ')).toBe(true)
        expect(r.texto).toContain('MAE')
        expect(r.texto).toContain('MEDIDA DO VÃO')
        expect(r.texto).not.toMatch(/Esquadrias? \d/)
    })

    it('OUTRO DP: "a tipologia DP-01 não tem as abas do motor importadas"', async () => {
        const t = await M().lerTabelaDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, { ...ESQUADRIA, tipologia: 'DP-01' })
        expect(r).toEqual({
            desfecho: 'recusou',
            texto: 'Não consegui fechar o levantamento de DP-01, 1.200 x 1.000 mm, 1 unidade(s), perfil BRANCO. Falta:\n'
                + '• A tipologia DP-01 não tem as abas do motor importadas (Variáveis, Fórmulas, Perfis): ainda não consigo calcular as barras dela.',
        })
    })

    it('a DP-02 de OUTRA TABELA também não tem abas: as da Wolff não valem para outro fornecedor', async () => {
        banco.db.orcamentista_conta_tabela = [{ tenant_id: TENANT, tabela_id: 'tabela-de-outro-fornecedor' }]
        banco.db.orcamentista_motor_tipologia_detalhe.push({ tabela_id: 'tabela-de-outro-fornecedor', tipologia: 'DP-02', descricao: 'OUTRA', tipo: 'Correr' })
        const t = await M().lerTabelaDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, ESQUADRIA)
        expect(r.texto).toContain(M().fraseDaTipologiaSemAbas('DP-02'))
    })

    it('SEM SERRA na base de conhecimento: a recusa diz que falta a serra', async () => {
        banco.db.orcamentista_mp_categoria = []
        const t = await M().lerTabelaDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, ESQUADRIA)
        expect(r.texto).toContain('• A largura da serra não está na base de conhecimento da empresa (categoria Perfil). Falta: a serra, em mm.')
    })

    it('DUAS SERRAS diferentes: não escolhe uma', async () => {
        banco.db.orcamentista_mp_categoria.push({ tenant_id: TENANT, categoria_chave: 'PERFIL', config: { serra_mm: 4 } })
        const t = await M().lerTabelaDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, ESQUADRIA)
        expect(r.texto).toContain('2 larguras de serra diferentes')
    })

    it('a empresa SEM TABELA, no fechamento: a recusa diz isso, em português', async () => {
        banco.db.orcamentista_conta_tabela = []
        const t = await M().lerTabelaDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, ESQUADRIA)
        expect(r.texto).toContain('• A sua empresa não tem uma tabela de fornecedor ligada ao orçamentista.')
    })

    it('mais de 8 faltas: as 8 primeiras e a contagem do resto — nenhuma calada', () => {
        const faltas = Array.from({ length: 11 }, (_, k) => `Falta ${k + 1}.`)
        const texto = M().fraseDaRecusa(ESQUADRIA, faltas)
        expect(texto.split('\n').filter((l) => l.startsWith('• Falta'))).toHaveLength(8)
        expect(texto).toContain('• e mais 3 falta(s) do mesmo levantamento.')
    })
})
