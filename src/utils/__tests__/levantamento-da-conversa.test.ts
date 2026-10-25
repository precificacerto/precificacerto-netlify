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
 * A primeira versão (dono do produto, 25/10/2026): só as escolhas que a conversa captura, uma
 * esquadria por conversa, nada persistido, e só a DP-02 da tabela Wolff com as abas do motor.
 *
 * DESDE A RODADA DO PREÇO NA CONVERSA (25/10/2026):
 *   - a COR é a da pré-definição (`cor_perfil`), comparada EXATA com a coluna `cor` do motor — não
 *     mais BRANCO fixo;
 *   - a MÃO DE OBRA é o tempo da tipologia × o valor do minuto que a TELA DE PRODUTO usa:
 *     `calculatePricing` (passo 1) com `resolveMonthlyWorkload` e `custoMensalDeMaoDeObraDoProduto`.
 *     O banco falso traz os números de produção do tenant ativo — e a MO administrativa e a fixa,
 *     que NÃO podem entrar em INDUSTRIALIZACAO: é o que discrimina o segmento;
 *   - os dois totais de material, a DIFERENÇA entre eles, e os dois totais com a mão de obra.
 */
import { abasDaDP02NoBanco } from './fixtures/abas-da-DP-02-no-banco'

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
/** As abas da DP-02 como a importação as grava — o levantamento as lê do banco, não do JSON. */
const ABAS_NO_BANCO = () => abasDaDP02NoBanco(TABELA) as Record<string, Linha[]>

function montar() {
    banco.ausentes = new Set()
    banco.db = {
        orcamentista_conta_tabela: [{ tenant_id: TENANT, tabela_id: TABELA }],
        ...ABAS_NO_BANCO(),
        orcamentista_motor_tipologia_detalhe: [
            ...ABAS_NO_BANCO().orcamentista_motor_tipologia_detalhe,
            { tabela_id: TABELA, tipologia: 'DP-01', descricao: 'MAXIM-AR COM "N" MÓDULOS HORIZONTAIS E 01 MÓDULO VERTICAL | DESIGN', tipo: 'Maxim-ar' },
        ],
        orcamentista_motor_regra: DE_PARA.regras.map((r) => comId({ ...r, tabela_id: TABELA, tipologias: ['DP-02'] })),
        orcamentista_tabela_item: DE_PARA.itens.map((i) => ({ ...i, tabela_id: TABELA })),
        orcamentista_mp_categoria: [{ tenant_id: TENANT, categoria_chave: 'PERFIL', config: { serra_mm: 5, cores: ['BRANCO'], cor_predominante: 'BRANCO' } }],
        orcamentista_motor_tipologia: [{ tabela_id: TABELA, tipologia: 'DP-02', linha: 'EUROPA 42', tempo_fabricacao_min: 150, tempo_origem: 'IMPORTADO' }],
        // os números do tenant ativo em produção, medidos em 25/10/2026
        tenant_settings: [{ tenant_id: TENANT, calc_type: 'INDUSTRIALIZACAO', monthly_workload: 528, workload_unit: 'HOURS', num_productive_employees: 5 }],
        tenant_expense_config: [{
            tenant_id: TENANT, production_labor_cost_hub: 40813.03, production_labor_cost: 0,
            // ZERO em produção, e nada escreve nele: o caminho da tela não o lê — o caso (7) põe outro valor e afirma que nada muda
            productive_value_per_minute: 0,
            admin_salary_total: 27649.76, admin_fgts_total: 0, admin_other_costs: 0, fixed_expense_monthly: 17884.79,
        }],
    }
}
beforeEach(montar)

/** O que a pré-definição gravada traz para o levantamento — `escolhas` é o jsonb da coluna. */
const ESQUADRIA = { ordem: 1, tipologia: 'DP-02', largura_mm: 1200, altura_mm: 1000, quantidade: 1, cor_perfil: 'BRANCO' as string | null, vidro: 'Temperado 5mm', escolhas: null as Record<string, number> | null }
/** O levantamento gravado — nome e esquadrias — como a conversa o entrega ao levantamento. */
const lev = (o: Partial<typeof ESQUADRIA> = {}) => ({ nome: 'Casa do João', itens: [{ ...ESQUADRIA, ...o }] })
/** Os dados da esquadria como a FRASE os recebe: as escolhas já descritas. */
const DESCRITAS = 'arremate interno: SEM ARREMATE INTERNO (como você pediu); arremate externo: BZ0010 - ARREMATE 20MM (como você pediu); medida arremate externo: VÃO+50MM (CORTE 90/90) - PARA AJUSTE EM OBRA (como você pediu)'
const DADOS = { nome: 'Casa do João', cor: 'BRANCO', esquadrias: [{ tipologia: 'DP-02', largura_mm: 1200, altura_mm: 1000, quantidade: 1, escolhas: DESCRITAS }] }
/**
 * A mão de obra da DP-02 com os números de produção: 150 min × (40.813,03 ÷ (5 × 528 h × 60)).
 * 5 × 528 × 60 = 158.400 min; 40.813,03 ÷ 158.400 = 0,25765802…; × 150 = 38,6487 → R$ 38,65.
 */
const MAO_DE_OBRA = { ok: true as const, minutosPorUnidade: 150, origem: 'IMPORTADO', quantidade: 1, custoMensal: 40813.03, minutosDaEmpresa: 158400, porUnidade: 38.65, total: 38.65 }
/** O texto inteiro do levantamento que fecha — conta à mão no portão da ligação. */
const TEXTO_QUE_FECHA = [
    'Levantamento “Casa do João”, perfil BRANCO.',
    'Esquadria 1: DP-02, 1.200 x 1.000 mm, 1 unidade(s).',
    `Arremate e guarnição — ${DESCRITAS}.`,
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
    '',
    'Perfis por barra inteira: R$ 1.342,09.',
    'Perfis por consumo real: R$ 829,79.',
    'Diferença entre os dois: R$ 512,30.',
    'Mão de obra: 150 min por unidade (IMPORTADO) × 1 unidade(s), a R$ 0,257658 o minuto (R$ 40.813,03 ÷ 158.400 min): R$ 38,65.',
    '',
    'Total por barra inteira (perfis + mão de obra): R$ 1.380,74.',
    'Total por consumo real (perfis + mão de obra): R$ 868,44.',
    '',
    'O que este preço cobre: os perfis (o baguete incluído), pela tabela do fornecedor, e a mão de obra. NÃO cobre o vidro nem os insumos e acessórios (ferragens, escovas, calços e outros): eles ainda não estão na base.',
].join('\n')

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
            cor: 'BRANCO',
            coresDaEmpresa: ['BRANCO'],
            esquadrias: [{ tipologia: 'DP-02', L_mm: 1200, H_mm: 1000, quantidade: 1, escolhas: { MAE: 2, ARI: 4 }, espessura_vidro_mm: 5 }],
            tipologias: { 'DP-02': lida.tipologia }, regras: DE_PARA.regras as never, itens: DE_PARA.itens as never, serra_mm: 5,
        })
        if ('recusas' in r) throw new Error('recusado: ' + r.recusas.map((x) => x.mensagem).join(' | '))
        return r
    }

    it('o LEVANTAMENTO QUE FECHA: barras, aproveitamento, os dois totais de material, a diferença, a mão de obra e os dois totais — o texto inteiro', () => {
        expect(M().fraseDoLevantamento(DADOS, resultadoQueFecha(), [MAO_DE_OBRA])).toBe(TEXTO_QUE_FECHA)
    })

    it('PREÇO AUSENTE: o total que não sai diz qual código falta, e a diferença e o total com mão de obra também não saem — nunca R$ 0,00', () => {
        const r = resultadoQueFecha()
        const semBarra = { ...r, total: { ...r.total, total_por_barra_inteira: null as number | null }, falta_para_o_total: [{ codigo: '9641', perfil: 'HF88/WOLFF', falta: 'valor_barra_interno' as const, total: 'total_por_barra_inteira' as const, mensagem: '' }] }
        const texto = M().fraseDoLevantamento(DADOS, semBarra, [MAO_DE_OBRA])
        expect(texto).toContain('Perfis por barra inteira: não sai — falta o valor da barra de 9641 (HF88/WOLFF) em BRANCO.')
        expect(texto).toContain('Diferença entre os dois: não sai — falta o total por barra inteira.')
        expect(texto).toContain('Total por barra inteira (perfis + mão de obra): não sai — falta o valor dos perfis por barra inteira.')
        // o outro critério continua saindo inteiro
        expect(texto).toContain('Total por consumo real (perfis + mão de obra): R$ 868,44.')
        expect(texto).not.toContain('R$ 0,00')
    })

    it('MÃO DE OBRA AUSENTE: a linha diz o que falta, e os totais com mão de obra NÃO saem — o material sai', () => {
        const texto = M().fraseDoLevantamento(DADOS, resultadoQueFecha(), [{ ok: false, falta: 'o tempo de fabricação de DP-02 não está cadastrado' }])
        expect(texto).toContain('Mão de obra: não sai — o tempo de fabricação de DP-02 não está cadastrado.')
        expect(texto).toContain('Perfis por barra inteira: R$ 1.342,09.')
        expect(texto).toContain('Total por barra inteira (perfis + mão de obra): não sai — falta a mão de obra.')
        expect(texto).toContain('Total por consumo real (perfis + mão de obra): não sai — falta a mão de obra.')
        expect(texto).not.toContain('R$ 0,00')
    })

    it('a QUANTIDADE multiplica a mão de obra: 3 unidades, 3 × R$ 38,65', () => {
        const texto = M().fraseDoLevantamento({ ...DADOS, esquadrias: [{ ...DADOS.esquadrias[0], quantidade: 3 }] }, resultadoQueFecha(), [{ ...MAO_DE_OBRA, quantidade: 3, total: 115.95 }])
        expect(texto).toContain('Mão de obra: 150 min por unidade (IMPORTADO) × 3 unidade(s), a R$ 0,257658 o minuto (R$ 40.813,03 ÷ 158.400 min): R$ 115,95.')
    })

    it('os AVISOS do avaliador saem em português, com a medida e o limite', () => {
        const r = resultadoQueFecha()
        const comAviso = { ...r, avisos: [{ origem: 'LIMITE' as const, medida: 'H' as const, limite: 'MIN' as const, valor_mm: 380, limite_mm: 388, excesso_mm: 8, excesso_pct: 2.0618556701, esquadria: 1 }] }
        expect(M().fraseDoLevantamento(DADOS, comAviso, [MAO_DE_OBRA])).toContain('Atenção:\n• A altura de 380 mm está abaixo do mínimo da tipologia (388 mm), 8 mm (2,1%).')
    })
})

describe('(5b) as ESCOLHAS gravadas chegam ao avaliador', () => {
    it('com ARI 4, ARE 1 e MAE 2 gravados, a DP-02 FECHA — e o texto é o da conta à mão, com as escolhas', async () => {
        const t = await M().lerTabelaDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev({ escolhas: { ARI: 4, ARE: 1, MAE: 2 } }))
        expect(r).toEqual({ desfecho: 'levantou', texto: TEXTO_QUE_FECHA })
    })

    it('SEM escolhas, o PADRÃO fecha (decisões do dono do produto, 25/10/2026): MAE 1 = 0 mm, e o BZ0012 pela variante única', async () => {
        const t = await M().lerTabelaDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev())
        expect(r.desfecho).toBe('levantou')
        expect(r.texto).toContain('• 10491 (BZ0012/WOLFF): 1 barra(s) de 6 m')
        expect(r.texto).toContain('• 10501 (BZ0006/WOLFF): 1 barra(s) de 6 m')
        // a barra inteira, derivada da FONTE: o total da conta à mão (ARI 4, MAE 2: 1.342,0875) mais uma barra
        // do BZ0006 e uma do BZ0012, pelo valor da tabela — o BZ0010 continua numa barra só
        const valor = (c: string) => Number((DE_PARA.itens as Linha[]).find((i) => i.codigo === c)?.valor_barra_interno)
        const barra = Math.round((1342.0875 + valor('10501') + valor('10491')) * 100) / 100
        expect(r.texto).toContain(`Perfis por barra inteira: ${LB().formatarReais(barra)}.`)
    })

    it('uma chave que não é capturada, no jsonb, não vira escolha: {"MAI": 2} sozinho não muda nada', async () => {
        const t = await M().lerTabelaDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev({ escolhas: { MAI: 2 } }))
        // MAI não é capturada: a linha do arremate é a do padrão, como sem chave nenhuma
        expect(r.texto).toContain('Arremate e guarnição — arremate interno: BZ0006 - ARREMATE 65MM (padrão)')
    })
})

describe('(6) a RECUSA chega como texto, inteira e nomeada', () => {
    it('uma escolha gravada que não é opção (MAE 9): recusa nomeada, em português e sem o prefixo de esquadria', async () => {
        const t = await M().lerTabelaDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev({ escolhas: { MAE: 9 } }))
        expect(r.desfecho).toBe('recusou')
        expect(r.texto.startsWith('Não consegui fechar o levantamento “Casa do João”, perfil BRANCO.\nEsquadria 1: DP-02, 1.200 x 1.000 mm, 1 unidade(s).\n')).toBe(true)
        // R4 e a mudança de produto: a recusa nomeia a variável em português, nunca pelo código interno
        expect(r.texto.split('Falta:\n')[1]).toContain('MEDIDA ARREMATE EXTERNO')
        expect(r.texto).not.toMatch(/\b(ARI|ARE|MAE|MAI)\b/)
        // o cabeçalho numera a esquadria; a FALTA, com uma esquadria só, vem sem o prefixo do avaliador
        expect(r.texto.split('Falta:\n')[1]).not.toMatch(/Esquadrias? \d/)
    })

    it('o arremate interno de 70 mm (BZ1770), que tem várias variantes e nenhuma branca: recusa nomeando o código e a cor', async () => {
        const t = await M().lerTabelaDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev({ escolhas: { ARI: 2, MAE: 2 } }))
        expect(r.desfecho).toBe('recusou')
        expect(r.texto).toContain('O perfil BZ1770/WOLFF não tem código para a cor BRANCO na tabela do fornecedor')
    })

    it('OUTRO DP: "a tipologia DP-01 não tem as abas do motor importadas"', async () => {
        const t = await M().lerTabelaDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev({ tipologia: 'DP-01' }))
        expect(r).toEqual({
            desfecho: 'recusou',
            // sem as abas não há variável conhecida: a linha das escolhas não aparece
            texto: 'Não consegui fechar o levantamento “Casa do João”, perfil BRANCO.\nEsquadria 1: DP-01, 1.200 x 1.000 mm, 1 unidade(s).\nFalta:\n'
                + '• A tipologia DP-01 não tem as abas do motor importadas (Variáveis, Fórmulas, Perfis): ainda não consigo calcular as barras dela.',
        })
    })

    it('a DP-02 de OUTRA TABELA também não tem abas: as da Wolff não valem para outro fornecedor', async () => {
        banco.db.orcamentista_conta_tabela = [{ tenant_id: TENANT, tabela_id: 'tabela-de-outro-fornecedor' }]
        banco.db.orcamentista_motor_tipologia_detalhe.push({ tabela_id: 'tabela-de-outro-fornecedor', tipologia: 'DP-02', descricao: 'OUTRA', tipo: 'Correr' })
        const t = await M().lerTabelaDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev())
        expect(r.texto).toContain(M().fraseDaTipologiaSemAbas('DP-02'))
    })

    it('SEM SERRA na base de conhecimento: a recusa diz que falta a serra', async () => {
        banco.db.orcamentista_mp_categoria = []
        const t = await M().lerTabelaDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev())
        expect(r.texto).toContain('• A largura da serra não está na base de conhecimento da empresa (categoria Perfil). Falta: a serra, em mm.')
    })

    it('DUAS SERRAS diferentes: não escolhe uma', async () => {
        banco.db.orcamentista_mp_categoria.push({ tenant_id: TENANT, categoria_chave: 'PERFIL', config: { serra_mm: 4 } })
        const t = await M().lerTabelaDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev())
        expect(r.texto).toContain('2 larguras de serra diferentes')
    })

    it('a empresa SEM TABELA, no fechamento: a recusa diz isso, em português', async () => {
        banco.db.orcamentista_conta_tabela = []
        const t = await M().lerTabelaDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev())
        expect(r.texto).toContain('• A sua empresa não tem uma tabela de fornecedor ligada ao orçamentista.')
    })

    it('mais de 8 faltas: as 8 primeiras e a contagem do resto — nenhuma calada', () => {
        const faltas = Array.from({ length: 11 }, (_, k) => `Falta ${k + 1}.`)
        const texto = M().fraseDaRecusa(DADOS, faltas)
        expect(texto.split('\n').filter((l) => l.startsWith('• Falta'))).toHaveLength(8)
        expect(texto).toContain('• e mais 3 falta(s) do mesmo levantamento.')
    })
})

describe('(7) a MÃO DE OBRA — o mesmo caminho da tela de produto, com os números de produção', () => {
    it('INDUSTRIALIZACAO: custo do Hub ÷ (5 × 528 h × 60 min) × 150 min = R$ 38,65 — a administrativa e a fixa NÃO entram', async () => {
        expect(await M().lerMaoDeObra(TENANT, TABELA, 'DP-02', 1)).toEqual(MAO_DE_OBRA)
    })

    it('SERVICO: a administrativa e a fixa ENTRAM no custo do minuto (custoMensalDeMaoDeObra) — o segmento decide', async () => {
        banco.db.tenant_settings[0].calc_type = 'SERVICO'
        const mo = await M().lerMaoDeObra(TENANT, TABELA, 'DP-02', 1)
        // 40.813,03 + 27.649,76 + 17.884,79 = 86.347,58; ÷ 158.400 × 150 = 81,7685 → 81,77
        // a soma é a da tela, em ponto flutuante, na mesma ordem — não um literal arredondado
        expect(mo).toEqual({ ...MAO_DE_OBRA, custoMensal: 40813.03 + (27649.76 + 0 + 0) + 17884.79, porUnidade: 81.77, total: 81.77 })
    })

    it('a quantidade multiplica: 3 unidades', async () => {
        expect(await M().lerMaoDeObra(TENANT, TABELA, 'DP-02', 3)).toEqual({ ...MAO_DE_OBRA, quantidade: 3, total: 115.95 })
    })

    it('productive_value_per_minute NÃO é lido: com 9,99 gravado nele, o número é o mesmo', async () => {
        banco.db.tenant_expense_config[0].productive_value_per_minute = 9.99
        expect(await M().lerMaoDeObra(TENANT, TABELA, 'DP-02', 1)).toEqual(MAO_DE_OBRA)
    })

    it.each([
        ['sem tempo de fabricação da tipologia', () => { banco.db.orcamentista_motor_tipologia = [] }, 'o tempo de fabricação de DP-02 não está cadastrado'],
        ['sem carga horária', () => { banco.db.tenant_settings[0].monthly_workload = 0 }, 'a carga horária mensal da empresa não está configurada'],
        // sem a linha, faltam DUAS coisas, e as duas saem — uma não esconde a outra
        ['sem tenant_settings', () => { banco.db.tenant_settings = [] }, 'o tipo de cálculo da empresa (industrialização, revenda ou serviço) não está configurado; a carga horária mensal da empresa não está configurada'],
        ['sem custo de mão de obra produtiva', () => { banco.db.tenant_expense_config[0].production_labor_cost_hub = 0 }, 'o custo mensal da mão de obra produtiva da empresa não está configurado'],
        ['sem tipo de cálculo', () => { banco.db.tenant_settings[0].calc_type = null }, 'o tipo de cálculo da empresa (industrialização, revenda ou serviço) não está configurado'],
        ['empresa de REVENDA', () => { banco.db.tenant_settings[0].calc_type = 'REVENDA' }, 'a empresa está configurada como revenda, e na revenda o tempo de fabricação não entra no custo'],
    ])('%s: a falta é NOMEADA — nunca zero', async (_nome, preparar, falta) => {
        preparar()
        expect(await M().lerMaoDeObra(TENANT, TABELA, 'DP-02', 1)).toEqual({ ok: false, falta })
    })
})

describe('(8) a COR é a da pré-definição, comparada exata com a coluna cor do motor', () => {
    it('em BRANCO, a DP-02 fecha — e o cabeçalho diz BRANCO', async () => {
        const t = await M().lerTabelaDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev({ escolhas: { ARI: 4, ARE: 1, MAE: 2 } }))
        expect(r).toEqual({ desfecho: 'levantou', texto: TEXTO_QUE_FECHA })
    })

    it('em PRETO TEXTURADO, a mesma esquadria é RECUSADA nomeando o perfil e a cor — nenhuma cor parecida entra', async () => {
        const t = await M().lerTabelaDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev({ cor_perfil: 'PRETO TEXTURADO', escolhas: { ARI: 4, ARE: 1, MAE: 2 } }))
        expect(r.desfecho).toBe('recusou')
        expect(r.texto.startsWith('Não consegui fechar o levantamento “Casa do João”, perfil PRETO TEXTURADO.\nEsquadria 1: DP-02, 1.200 x 1.000 mm, 1 unidade(s).\n')).toBe(true)
        expect(r.texto).toContain('• O perfil HF88/WOLFF não tem código para a cor PRETO TEXTURADO na tabela do fornecedor; as variantes que existem são: BRANCO. Falta: o código de HF88/WOLFF em PRETO TEXTURADO.')
    })

    it('"Branco" não é BRANCO: a caixa diferente é recusada, não normalizada', async () => {
        const t = await M().lerTabelaDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev({ cor_perfil: 'Branco', escolhas: { ARI: 4, ARE: 1, MAE: 2 } }))
        expect(r.desfecho).toBe('recusou')
        expect(r.texto).toContain('não tem código para a cor Branco')
    })

    it('SEM COR na pré-definição: a recusa diz que falta a cor do perfil', async () => {
        const t = await M().lerTabelaDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev({ cor_perfil: null, escolhas: { ARI: 4, ARE: 1, MAE: 2 } }))
        expect(r.desfecho).toBe('recusou')
        expect(r.texto).toContain('• A esquadria 1 está sem a cor do perfil.')
    })

    it('as cores da empresa vêm da base de conhecimento (Perfil), juntas e sem repetição, na ordem em que aparecem', async () => {
        banco.db.orcamentista_mp_categoria.push({ tenant_id: TENANT, categoria_chave: 'PERFIL', config: { serra_mm: 5, cores: ['PRETO TEXTURADO', 'BRANCO'] } })
        banco.db.orcamentista_mp_categoria.push({ tenant_id: 'outro-tenant', categoria_chave: 'PERFIL', config: { cores: ['AZUL'] } })
        expect(await M().lerCoresDaEmpresa(TENANT)).toEqual(['BRANCO', 'PRETO TEXTURADO'])
    })
})

describe('(9) o levantamento com N esquadrias', () => {
    function resultadoDeUma() {
        const lida = AV().lerTipologia(ABAS, 'DP-02')
        if ('recusas' in lida) throw new Error('abas recusadas')
        const r = LB().levantarBarras({
            cor: 'BRANCO',
            coresDaEmpresa: ['BRANCO'],
            esquadrias: [{ tipologia: 'DP-02', L_mm: 1200, H_mm: 1000, quantidade: 1, escolhas: { MAE: 2, ARI: 4 }, espessura_vidro_mm: 5 }],
            tipologias: { 'DP-02': lida.tipologia }, regras: DE_PARA.regras as never, itens: DE_PARA.itens as never, serra_mm: 5,
        })
        if ('recusas' in r) throw new Error('recusado')
        return r
    }

    it('DUAS esquadrias: uma linha de mão de obra POR esquadria, a total, e os totais somam a total', () => {
        const dados = { ...DADOS, esquadrias: [DADOS.esquadrias[0], { ...DADOS.esquadrias[0], largura_mm: 800, quantidade: 2 }] }
        const texto = M().fraseDoLevantamento(dados, resultadoDeUma(), [MAO_DE_OBRA, { ...MAO_DE_OBRA, quantidade: 2, total: 77.3 }])
        expect(texto).toContain('Esquadria 2: DP-02, 800 x 1.000 mm, 2 unidade(s).')
        expect(texto).toContain('Mão de obra da esquadria 1: 150 min por unidade (IMPORTADO) × 1 unidade(s), a R$ 0,257658 o minuto (R$ 40.813,03 ÷ 158.400 min): R$ 38,65.')
        expect(texto).toContain('Mão de obra da esquadria 2: 150 min por unidade (IMPORTADO) × 2 unidade(s), a R$ 0,257658 o minuto (R$ 40.813,03 ÷ 158.400 min): R$ 77,30.')
        expect(texto).toContain('Mão de obra total: R$ 115,95.')
        // 1.342,09 + 115,95
        expect(texto).toContain('Total por barra inteira (perfis + mão de obra): R$ 1.458,04.')
    })

    it('a mão de obra de UMA esquadria ausente: os totais com mão de obra não saem', () => {
        const dados = { ...DADOS, esquadrias: [DADOS.esquadrias[0], { ...DADOS.esquadrias[0], tipologia: 'DP-01' }] }
        const texto = M().fraseDoLevantamento(dados, resultadoDeUma(), [MAO_DE_OBRA, { ok: false, falta: 'o tempo de fabricação de DP-01 não está cadastrado' }])
        expect(texto).toContain('Mão de obra da esquadria 2: não sai — o tempo de fabricação de DP-01 não está cadastrado.')
        expect(texto).toContain('Total por consumo real (perfis + mão de obra): não sai — falta a mão de obra.')
    })

    it('CORES DIFERENTES no mesmo levantamento: recusa nomeada, com a cor de cada esquadria', async () => {
        const t = await M().lerTabelaDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, {
            nome: 'Casa do João',
            itens: [{ ...ESQUADRIA, escolhas: { ARI: 4, ARE: 1, MAE: 2 } }, { ...ESQUADRIA, ordem: 2, cor_perfil: 'PRETO TEXTURADO', escolhas: { ARI: 4, ARE: 2 } }],
        })
        expect(r.desfecho).toBe('recusou')
        expect(r.texto).toContain('• As esquadrias têm cores diferentes (esquadria 1: BRANCO; esquadria 2: PRETO TEXTURADO): ainda não calculo um levantamento com cores misturadas.')
    })

    it('DUAS esquadrias DP-02 iguais: as barras são do levantamento inteiro, e a mão de obra é a das duas', async () => {
        const t = await M().lerTabelaDaEmpresa(TENANT)
        const uma = await M().mensagemDoLevantamento(TENANT, t, lev({ escolhas: { ARI: 4, ARE: 1, MAE: 2 } }))
        const duas = await M().mensagemDoLevantamento(TENANT, t, {
            nome: 'Casa do João',
            itens: [{ ...ESQUADRIA, escolhas: { ARI: 4, ARE: 1, MAE: 2 } }, { ...ESQUADRIA, ordem: 2, escolhas: { ARI: 4, ARE: 1, MAE: 2 } }],
        })
        expect(duas.desfecho).toBe('levantou')
        expect(duas.texto).toContain('Mão de obra total: R$ 77,30.')
        const material = (x: string) => x.split('\n').find((l) => l.startsWith('Perfis por consumo real:'))
        // o consumo real de duas é o dobro do de uma, ao centavo: 829,79 × 2
        expect(material(uma.texto)).toBe('Perfis por consumo real: R$ 829,79.')
        expect(material(duas.texto)).toBe('Perfis por consumo real: R$ 1.659,59.')
    })
})

describe('(10) as abas vêm do BANCO: a Fórmulas da tipologia é a fonte, a da família é fallback ROTULADO', () => {
    const ESCOLHAS = { ARI: 4, ARE: 1, MAE: 2 }
    const semDaDP02 = (tabela: string) => { banco.db[tabela] = banco.db[tabela].filter((l) => l.tipologia !== 'DP-02') }
    /** As fórmulas próprias da DP-02 como linhas da família — o cálculo com elas tem de dar o mesmo número. */
    const comoFamilia = (linha: string, tabelaId = TABELA) => banco.db.orcamentista_motor_formula
        .filter((l) => l.tipologia === 'DP-02')
        .map((l) => comId({ tabela_id: tabelaId, linha, linha_original: `PVC ${linha}`, variavel: l.variavel, descricao: l.descricao, formula: l.formula, formula_em_lh: null, pct_padrao: null }))
    const levantar = async () => M().mensagemDoLevantamento(TENANT, await M().lerTabelaDaEmpresa(TENANT), lev({ escolhas: ESCOLHAS }))

    it('o JSON do repositório NÃO é mais fonte: sem as abas da DP-02 no banco, a DP-02 é recusada pelo nome', async () => {
        for (const t of ['orcamentista_motor_variavel', 'orcamentista_motor_formula', 'orcamentista_motor_perfil']) semDaDP02(t)
        const r = await levantar()
        expect(r.desfecho).toBe('recusou')
        expect(r.texto).toContain(M().fraseDaTipologiaSemAbas('DP-02'))
    })

    it('a Fórmulas DO BANCO é a que calcula: HFOL alterada no banco muda o consumo real', async () => {
        const antes = await levantar()
        const hfol = banco.db.orcamentista_motor_formula.find((l) => l.tipologia === 'DP-02' && l.variavel === 'HFOL')
        if (!hfol) throw new Error('o fixture não tem HFOL')
        hfol.formula = `${String(hfol.formula)}-100`
        const depois = await levantar()
        const consumo = (x: string) => x.split('\n').find((l) => l.startsWith('Perfis por consumo real:'))
        expect(antes).toEqual({ desfecho: 'levantou', texto: TEXTO_QUE_FECHA })
        expect(depois.desfecho).toBe('levantou')
        expect(consumo(depois.texto)).not.toBe(consumo(antes.texto))
    })

    it('SEM fórmulas próprias: as da FAMÍLIA da linha calculam, e a resposta DIZ que é a família — o número é o mesmo, o rótulo não', async () => {
        // a família certa, e duas que NÃO podem entrar: outra linha e a mesma linha de outra tabela
        const outraLinha = comoFamilia('EUROPA 60').map((l) => ({ ...l, formula: '(L+5000)' }))
        const outraTabela = comoFamilia('EUROPA 42', 'tabela-de-outro-fornecedor').map((l) => ({ ...l, formula: '(L+7000)' }))
        banco.db.orcamentista_motor_formula_familia = [...outraLinha, ...outraTabela, ...comoFamilia('EUROPA 42')]
        semDaDP02('orcamentista_motor_formula')
        const r = await levantar()
        expect(r).toEqual({ desfecho: 'levantou', texto: `${TEXTO_QUE_FECHA}\n\n${M().fraseDasFormulasDaFamilia('DP-02', 'EUROPA 42')}` })
        expect(M().fraseDasFormulasDaFamilia('DP-02', 'EUROPA 42')).toBe(
            'Atenção: as fórmulas da DP-02 são as da FAMÍLIA EUROPA 42 (fallback) — a tipologia não tem fórmulas próprias na aba "Fórmulas" do arquivo do fornecedor.')
    })

    it('COM fórmulas próprias, a família NÃO é lida nem citada — mesmo que exista', async () => {
        banco.db.orcamentista_motor_formula_familia = comoFamilia('EUROPA 42').map((l) => ({ ...l, formula: '(L+5000)' }))
        const r = await levantar()
        expect(r).toEqual({ desfecho: 'levantou', texto: TEXTO_QUE_FECHA })
    })

    it('a recusa também carrega o rótulo: o vendedor sabe que a conta recusada foi a da família', async () => {
        banco.db.orcamentista_motor_formula_familia = comoFamilia('EUROPA 42')
        semDaDP02('orcamentista_motor_formula')
        banco.db.orcamentista_mp_categoria = []
        const r = await levantar()
        expect(r.desfecho).toBe('recusou')
        expect(r.texto.endsWith(`\n\n${M().fraseDasFormulasDaFamilia('DP-02', 'EUROPA 42')}`)).toBe(true)
    })

    it('sem fórmulas próprias e SEM a linha da tipologia: recusa nomeada — a família não é adivinhada', async () => {
        banco.db.orcamentista_motor_formula_familia = comoFamilia('EUROPA 42')
        banco.db.orcamentista_motor_tipologia[0].linha = null
        semDaDP02('orcamentista_motor_formula')
        const r = await levantar()
        expect(r.desfecho).toBe('recusou')
        expect(r.texto).toContain(M().fraseDaFamiliaSemLinha('DP-02'))
    })

    it('sem fórmulas próprias e a FAMÍLIA sem fórmulas: recusa nomeando a linha', async () => {
        banco.db.orcamentista_motor_formula_familia = comoFamilia('EUROPA 60')
        semDaDP02('orcamentista_motor_formula')
        const r = await levantar()
        expect(r.desfecho).toBe('recusou')
        expect(r.texto).toContain(M().fraseDaFamiliaSemFormulas('DP-02', 'EUROPA 42'))
    })

    it('sem PERFIS: recusa nomeada — sem perfil não há barra a calcular', async () => {
        semDaDP02('orcamentista_motor_perfil')
        const r = await levantar()
        expect(r.desfecho).toBe('recusou')
        expect(r.texto).toContain(M().fraseDaTipologiaSemPerfis('DP-02'))
    })

    it('a tabela de uma aba AINDA NÃO EXISTE no banco (a migração não foi aplicada): recusa nomeando a aba', async () => {
        banco.ausentes.add('orcamentista_motor_perfil')
        const r = await levantar()
        expect(r.desfecho).toBe('recusou')
        expect(r.texto).toContain(M().fraseDaAbaNaoCarregada('Perfis'))
    })

    it('as Variáveis da conversa vêm do banco, TODAS, página a página — e só as da tabela', async () => {
        const muitas = Array.from({ length: 2500 }, (_, k) => comId({ tabela_id: TABELA, tipologia: `DP-${1000 + Math.floor(k / 10)}`, ordem: (k % 10) + 2, variavel: `V${k % 10}`, descricao: null, padrao: null, min_max: null, condicao: null, opcoes: null }))
        banco.db.orcamentista_motor_variavel.push(...muitas, comId({ tabela_id: 'outra', tipologia: 'DP-02', ordem: 99, variavel: 'INTRUSA' }))
        const v = await M().lerVariaveisDasTipologias(TABELA)
        expect(Object.keys(v)).toHaveLength(251)
        expect(v['DP-1249'].variaveis.map((x) => x.variavel)).toEqual(['V0', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9'])
        expect(v['DP-02'].variaveis.map((x) => x.variavel)).toEqual((ABAS['Variáveis'].linhas as Linha[]).map((l) => l['Var.']))
    })

    it('as Variáveis com a tabela AUSENTE no banco: nenhuma definição, sem lançar — a conversa segue sem escolhas', async () => {
        banco.ausentes.add('orcamentista_motor_variavel')
        expect(await M().lerVariaveisDasTipologias(TABELA)).toEqual({})
    })
})
