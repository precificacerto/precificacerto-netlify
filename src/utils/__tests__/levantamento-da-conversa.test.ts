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
/** A tabela de PREÇO da conta (a da Wolff): o motor não é lido por ela desde o PR D. */
const TABELA = '72366020-57c9-489f-9385-397b7fa3dedb'
/** O motor do catálogo que as etapas 1 e 2 da família apontam (o Motor_Wolf_PVC de produção). */
const MOTOR = '9a233c55-f377-45d3-b2ae-b1a740a98e44'
const MOTOR_SUL = 'motor-sul-aluminio'
const OUTRA = 'tabela-perfis-sul'
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
            const ordem: string[] = []
            const filtradas = () => (banco.db[tabela] ?? []).filter((l) => predicados.every((p) => p(l)))
            type Resposta = { data: Linha[] | null; error: { code: string; message: string } | null; count: number | null }
            const resposta = (): Resposta => {
                if (banco.ausentes.has(tabela)) return { data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${tabela}' in the schema cache` }, count: null }
                let linhas = filtradas()
                // como o PostgREST: ordenar por coluna que a tabela não tem é erro, não lista desordenada
                const semColuna = ordem.find((c) => linhas.some((l) => !(c in l)))
                if (semColuna) return { data: null, error: { code: '42703', message: `column ${tabela}.${semColuna} does not exist` }, count: null }
                const compara = (x: unknown, y: unknown) => (typeof x === 'number' && typeof y === 'number' ? x - y : String(x) < String(y) ? -1 : String(x) > String(y) ? 1 : 0)
                if (ordem.length) linhas = [...linhas].sort((a, b) => ordem.reduce((r, c) => r || compara(a[c], b[c]), 0))
                const total = linhas.length
                if (faixa) linhas = linhas.slice(faixa[0], faixa[1] + 1)
                return { data: linhas, error: null, count: contar ? total : null }
            }
            const q: Record<string, unknown> = {}
            q.select = (_c?: string, o?: { count?: string }) => { contar = o?.count === 'exact'; return q }
            q.eq = (c: string, v: unknown) => { predicados.push((l) => l[c] === v); return q }
            q.in = (c: string, vs: unknown[]) => { predicados.push((l) => vs.includes(l[c])); return q }
            q.contains = (c: string, vs: unknown[]) => { predicados.push((l) => Array.isArray(l[c]) && vs.every((v) => (l[c] as unknown[]).includes(v))); return q }
            q.order = (c: string) => { ordem.push(c); return q }
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
/** As abas da DP-02 como produção as tem: do MOTOR (`motor_id`), com `tabela_id` nulo — o levantamento as lê do banco, não do JSON. */
const ABAS_NO_BANCO = () => abasDaDP02NoBanco(MOTOR, 'motor') as Record<string, Linha[]>
/** O conteúdo do motor na forma ANTIGA, por tabela_id da tabela da conta: o PR D não o lê, nem como reserva. */
const comConteudoPorTabela = () => {
    const antigas = abasDaDP02NoBanco(TABELA) as Record<string, Linha[]>
    for (const [t, linhas] of Object.entries(antigas)) banco.db[t] = [...(banco.db[t] ?? []), ...linhas]
    banco.db.orcamentista_motor_tipologia_detalhe.push({ tabela_id: TABELA, tipologia: 'TB-99', descricao: 'SÓ NA TABELA', tipo: 'Correr', ordem: null })
    banco.db.orcamentista_motor_regra.push(...DE_PARA.regras.map((r) => comId({ ...r, tabela_id: TABELA, tipologias: ['DP-02'] })))
    banco.db.orcamentista_motor_tipologia_tempo.push({ tabela_id: TABELA, tipologia: 'DP-02', tempo_fabricacao_min: 777, tempo_origem: 'ESTIMADO' })
}

function montar() {
    banco.ausentes = new Set()
    banco.db = {
        // A FAMÍLIA da conta é a da base de conhecimento (PR D, 02/11/2026): a família-instância, e as etapas 1 e 2 dela com o motor
        orcamentista_materia_prima: [{ id: 'mp-pvc', tenant_id: TENANT, nome: 'Esquadrias de PVC', familia: 'PVC' }],
        orcamentista_familia_etapa: [
            { tenant_id: TENANT, materia_prima_id: 'mp-pvc', numero: 1, motor_id: MOTOR },
            { tenant_id: TENANT, materia_prima_id: 'mp-pvc', numero: 2, motor_id: MOTOR },
            // a etapa 3 não é lida pela conversa (o fluxo fixo usa a 1 e a 2)
            { tenant_id: TENANT, materia_prima_id: 'mp-pvc', numero: 3, motor_id: null },
        ],
        orcamentista_motor: [{ id: MOTOR, nome: 'Motor_Wolf_PVC', fornecedor_id: 'f-wolff', arquivado_em: null }],
        // as tabelas de PREÇO da empresa são DERIVADAS (26/10/2026): a base de conhecimento vincula a Wolff no PERFIL
        orcamentista_mp_categoria_fornecedor: [{ tenant_id: TENANT, mp_categoria_id: 'c-perfil', fornecedor_id: 'f-wolff' }],
        orcamentista_tabela: [{ id: TABELA, fornecedor_id: 'f-wolff', arquivo_nome: 'Tabela Wolff.xlsx', familia: 'PVC', categoria_chave: 'PERFIL', vigente: false }],
        orcamentista_fornecedor: [{ id: 'f-wolff', nome: 'Wolff Perfis' }],
        orcamentista_familia_catalogo: [{ chave: 'PVC', rotulo: 'PVC', ordem: 1 }, { chave: 'ALUMINIO', rotulo: 'Alumínio', ordem: 2 }],
        ...ABAS_NO_BANCO(),
        orcamentista_motor_tipologia_detalhe: [
            ...ABAS_NO_BANCO().orcamentista_motor_tipologia_detalhe,
            // `ordem` nula, como as 164 linhas de produção antes da reimportação (a coluna existe e está vazia)
            { tabela_id: null, motor_id: MOTOR, tipologia: 'DP-01', descricao: 'MAXIM-AR COM "N" MÓDULOS HORIZONTAIS E 01 MÓDULO VERTICAL | DESIGN', tipo: 'Maxim-ar', ordem: null },
        ],
        orcamentista_motor_regra: DE_PARA.regras.map((r) => comId({ ...r, tabela_id: null, motor_id: MOTOR, tipologias: ['DP-02'] })),
        orcamentista_tabela_item: DE_PARA.itens.map((i) => ({ ...i, tabela_id: TABELA })),
        orcamentista_mp_categoria: [{ id: 'c-perfil', tenant_id: TENANT, categoria_chave: 'PERFIL', config: { serra_mm: 5, cores: ['BRANCO'], cor_predominante: 'BRANCO' } as Linha }],
        // as colunas ANTIGAS de tempo continuam preenchidas em produção (obsoletas, saem numa migração
        // posterior) — e aqui com OUTRO número, para que ler a coluna antiga apareça no resultado
        orcamentista_motor_tipologia: [{ tabela_id: null, motor_id: MOTOR, tipologia: 'DP-02', linha: 'EUROPA 42', tempo_fabricacao_min: 999, tempo_origem: 'ESTIMADO' }],
        // o tempo mora na tabela própria (20261024000003), que a importação não apaga
        orcamentista_motor_tipologia_tempo: [{ tabela_id: null, motor_id: MOTOR, tipologia: 'DP-02', tempo_fabricacao_min: 150, tempo_origem: 'IMPORTADO' }],
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
const ESQUADRIA = { ordem: 1, tipologia: 'DP-02', largura_mm: 1200, altura_mm: 1000, quantidade: 1, cor_perfil: 'BRANCO' as string | null, vidro: 'Temperado 5mm', escolhas: null as Record<string, number> | null, familia: null as string | null }
/** O levantamento gravado — nome e esquadrias — como a conversa o entrega ao levantamento. */
const lev = (o: Partial<typeof ESQUADRIA> = {}) => ({ nome: 'Casa do João', itens: [{ ...ESQUADRIA, ...o }] })
/** Os dados da esquadria como a FRASE os recebe: as escolhas já descritas. */
const DESCRITAS = 'arremate interno: SEM ARREMATE INTERNO (como você pediu); arremate externo: BZ0010 - ARREMATE 20MM (como você pediu); medida arremate externo: VÃO+50MM (CORTE 90/90) - PARA AJUSTE EM OBRA (como você pediu)'
const DADOS = { nome: 'Casa do João', cor: 'BRANCO', esquadrias: [{ numero: 1, tipologia: 'DP-02', largura_mm: 1200, altura_mm: 1000, quantidade: 1, escolhas: DESCRITAS }] }
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

describe('(1) a família da conta, o motor dela e as tipologias candidatas (PR D, dono do produto, 02/11/2026)', () => {
    /** A família da conta como produção a tem hoje: 1 família (PVC), as etapas 1 e 2 apontando o Motor_Wolf_PVC. */
    const FAMILIA_DE_PAULA = {
        familia: 'PVC', rotulo: 'PVC', fornecedor: 'Wolff Perfis',
        levantamento: { id: MOTOR, nome: 'Motor_Wolf_PVC' }, calculo: { id: MOTOR, nome: 'Motor_Wolf_PVC' }, tabelasDePreco: [TABELA],
    }

    it('DE PAULA — 1 família: é ela, sem perguntar; a lista vem do motor da etapa 1, POR motor_id, em ordem de código', async () => {
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        if (!('candidatos' in t)) throw new Error('era para ler a lista: ' + t.frase)
        expect(t.familias).toEqual([FAMILIA_DE_PAULA])
        expect(t.candidatos.map((c) => c.tipologia)).toEqual(['DP-01', 'DP-02'])
        expect(M().linhaDoCandidato(t.candidatos[1], false)).toBe('DP-02 | JANELA DE CORRER 02 FOLHAS MÓVEIS | EUROPA 42 | Correr')
        expect(M().familiasDoCodigo(t)('DP-02')).toEqual([{ familia: 'PVC', rotulo: 'PVC', fornecedor: 'Wolff Perfis', motorId: MOTOR }])
    })

    it('o conteúdo do motor gravado por tabela_id NÃO é lido: nem como lista, nem como reserva', async () => {
        comConteudoPorTabela()
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        if (!('candidatos' in t)) throw new Error('era para ler a lista: ' + t.frase)
        expect(t.candidatos.map((c) => c.tipologia)).not.toContain('TB-99')
        expect(t.candidatos.map((c) => c.tipologia)).toEqual(['DP-01', 'DP-02'])
    })

    it('a família vem da BASE DE CONHECIMENTO, não da tabela: a tabela é de ALUMÍNIO e a família da conta continua PVC — e a tabela de alumínio não dá preço', async () => {
        banco.db.orcamentista_tabela.push({ id: 'tabela-aluminio', fornecedor_id: 'f-wolff', arquivo_nome: 'Wolff Alumínio.xlsx', familia: 'ALUMINIO', categoria_chave: 'PERFIL', vigente: false })
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        if (!('candidatos' in t)) throw new Error('era para ler a lista: ' + t.frase)
        expect(t.familias.map((f) => f.familia)).toEqual(['PVC'])
        expect(t.familias[0].tabelasDePreco).toEqual([TABELA])
    })

    it('o PREÇO vem de TODAS as tabelas vigentes da família — de qualquer categoria, e as de "qualquer linha" (família nula)', async () => {
        banco.db.orcamentista_mp_categoria_fornecedor.push({ tenant_id: TENANT, mp_categoria_id: 'c-ferragem', fornecedor_id: 'f-imab' })
        banco.db.orcamentista_mp_categoria.push({ id: 'c-ferragem', tenant_id: TENANT, categoria_chave: 'FERRAGENS', config: {} })
        banco.db.orcamentista_fornecedor.push({ id: 'f-imab', nome: 'IMAB' })
        banco.db.orcamentista_tabela.push(
            { id: 'tabela-ferragens', fornecedor_id: 'f-imab', arquivo_nome: 'FERRAGENS - IMAB.xlsx', familia: 'PVC', categoria_chave: 'FERRAGENS', vigente: false },
            { id: 'tabela-qualquer-linha', fornecedor_id: 'f-imab', arquivo_nome: 'Acessórios.xlsx', familia: null, categoria_chave: 'ACESSORIOS', vigente: false },
        )
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        if (!('candidatos' in t)) throw new Error('era para ler a lista: ' + t.frase)
        expect(t.familias[0].tabelasDePreco).toEqual([TABELA, 'tabela-ferragens', 'tabela-qualquer-linha'].sort())
    })

    it('duas instâncias da MESMA família com o MESMO motor: uma família só, sem perguntar', async () => {
        banco.db.orcamentista_materia_prima.push({ id: 'mp-pvc-2', tenant_id: TENANT, nome: 'PVC da obra', familia: 'PVC' })
        banco.db.orcamentista_familia_etapa.push(
            { tenant_id: TENANT, materia_prima_id: 'mp-pvc-2', numero: 1, motor_id: MOTOR }, { tenant_id: TENANT, materia_prima_id: 'mp-pvc-2', numero: 2, motor_id: MOTOR })
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        if (!('candidatos' in t)) throw new Error('era para ler a lista: ' + t.frase)
        expect(t.familias).toEqual([FAMILIA_DE_PAULA])
    })

    /**
     * ERRO EXPLÍCITO, nunca fallback e nunca voltar a ler por tabela_id (item 4 do pedido). Em todos, o conteúdo do motor
     * gravado por tabela_id da tabela da conta EXISTE (`comConteudoPorTabela`): se o código caísse na leitura antiga, acharia lista.
     * As frases esperadas são escritas aqui por extenso, não montadas pela função que se testa.
     */
    describe('(1e) a falta de configuração', () => {
        beforeEach(comConteudoPorTabela)
        const falta = async () => { const t = await M().lerFamiliasDaEmpresa(TENANT); return 'frase' in t ? [t.motivo, t.frase] : ['LEU', ''] }

        it('conta SEM FAMÍLIA na base de conhecimento (a família-instância sem família): erro de configuração, não cai na família da tabela', async () => {
            banco.db.orcamentista_materia_prima[0].familia = null
            expect(await falta()).toEqual(['SEM_FAMILIA', 'Falta de configuração — a base de conhecimento da empresa não tem família: verifique o catálogo em Base de conhecimento › Famílias.'])
        })

        it('conta sem NENHUMA família-instância: o mesmo erro', async () => {
            banco.db.orcamentista_materia_prima = []
            expect((await falta())[0]).toBe('SEM_FAMILIA')
        })

        it('família SEM ETAPA cadastrada (a 2): erro nomeando a família e a etapa', async () => {
            banco.db.orcamentista_familia_etapa = banco.db.orcamentista_familia_etapa.filter((e) => e.numero !== 2)
            expect(await falta()).toEqual(['SEM_ETAPA', 'Falta de configuração — a família Esquadrias de PVC não tem a etapa 2 (Calcular as barras e os materiais) cadastrada: verifique o catálogo em Base de conhecimento › Etapas da família.'])
        })

        it('ETAPA SEM MOTOR (a 1): erro nomeando a etapa e a família', async () => {
            banco.db.orcamentista_familia_etapa.find((e) => e.numero === 1)!.motor_id = null
            expect(await falta()).toEqual(['ETAPA_SEM_MOTOR', 'Falta de configuração — a etapa 1 (Gerar o levantamento) da família Esquadrias de PVC não tem motor: verifique o catálogo em Base de conhecimento › Etapas da família.'])
        })

        it('MOTOR ARQUIVADO: erro nomeando o motor', async () => {
            banco.db.orcamentista_motor[0].arquivado_em = '2026-11-01T12:00:00Z'
            expect(await falta()).toEqual(['MOTOR_ARQUIVADO', 'Falta de configuração — o motor Motor_Wolf_PVC, da etapa 1 da família Esquadrias de PVC, está arquivado: verifique o catálogo em Catálogo › Motores.'])
        })

        it('MOTOR SEM CONTEÚDO importado (0 tipologias por motor_id) — com as tipologias da tabela lá: erro, e a lista por tabela_id não é lida', async () => {
            banco.db.orcamentista_motor_tipologia_detalhe = banco.db.orcamentista_motor_tipologia_detalhe.filter((l) => l.motor_id !== MOTOR)
            expect(banco.db.orcamentista_motor_tipologia_detalhe.length).toBeGreaterThan(0)
            expect(await falta()).toEqual(['MOTOR_SEM_CONTEUDO', 'Falta de configuração — o motor Motor_Wolf_PVC, da etapa 1 da família Esquadrias de PVC, não tem tipologias importadas: verifique o catálogo em Catálogo › Motores.'])
        })

        it('família SEM NENHUMA TABELA VIGENTE (nenhum fornecedor vinculado): erro nomeando a família', async () => {
            banco.db.orcamentista_mp_categoria_fornecedor = []
            expect(await falta()).toEqual(['SEM_TABELA_VIGENTE', 'Falta de configuração — a família PVC não tem nenhuma tabela de preço vigente: verifique o catálogo em Catálogo › Fornecedores.'])
        })

        it('família sem tabela vigente porque a única tabela é de OUTRA família: o mesmo erro', async () => {
            banco.db.orcamentista_tabela[0].familia = 'ALUMINIO'
            expect((await falta())[0]).toBe('SEM_TABELA_VIGENTE')
        })

        it('duas tabelas no mesmo grupo e nenhuma marcada vigente: recusa nomeada SEM_VIGENTE, não escolho', async () => {
            banco.db.orcamentista_tabela.push({ id: 'tabela-2', fornecedor_id: 'f-wolff', arquivo_nome: 'Wolff 2.xlsx', familia: 'PVC', categoria_chave: 'PERFIL', vigente: false })
            expect(await falta()).toEqual(['SEM_VIGENTE', M().fraseSemVigente('Wolff Perfis', 'PVC', 2)])
            // com a marca, a marcada vale — e só ela
            banco.db.orcamentista_tabela[1].vigente = true
            const t = await M().lerFamiliasDaEmpresa(TENANT)
            expect('familias' in t && t.familias[0].tabelasDePreco).toEqual(['tabela-2'])
        })

        it('duas instâncias da mesma família com MOTORES DIFERENTES na mesma etapa: erro de configuração', async () => {
            banco.db.orcamentista_materia_prima.push({ id: 'mp-pvc-2', tenant_id: TENANT, nome: 'PVC da obra', familia: 'PVC' })
            banco.db.orcamentista_familia_etapa.push(
                { tenant_id: TENANT, materia_prima_id: 'mp-pvc-2', numero: 1, motor_id: MOTOR }, { tenant_id: TENANT, materia_prima_id: 'mp-pvc-2', numero: 2, motor_id: 'motor-outro' })
            expect(await falta()).toEqual(['MOTORES_DIVERGENTES', 'Falta de configuração — as famílias Esquadrias de PVC e PVC da obra (PVC) apontam motores diferentes na etapa 2: verifique o catálogo em Base de conhecimento › Etapas da família.'])
        })

        it('a lista de tipologias AINDA NÃO EXISTE no banco: recusa nomeada, nunca a lista de outro lugar', async () => {
            banco.ausentes.add('orcamentista_motor_tipologia_detalhe')
            const t = await M().lerFamiliasDaEmpresa(TENANT)
            expect('frase' in t && [t.motivo, t.frase, t.detalhe]).toEqual([
                'SEM_LISTA_DE_TIPOLOGIAS', 'Ainda não consigo escolher a tipologia: a lista de tipologias do motor, com a descrição de cada uma, ainda não foi carregada.', 'codigo=PGRST205'])
        })
    })

    /**
     * 2+ FAMÍLIAS (item 1 do pedido): junta as tipologias dos motores de cada família, e cada uma sabe de qual família e de
     * qual motor é. A segunda família tem motor PRÓPRIO (Motor_Sul_ALU, do fornecedor Perfis Sul) e tabela de preço própria.
     */
    const comOutraFamilia = () => {
        banco.db.orcamentista_materia_prima.push({ id: 'mp-alu', tenant_id: TENANT, nome: 'Esquadrias de alumínio', familia: 'ALUMINIO' })
        banco.db.orcamentista_familia_etapa.push(
            { tenant_id: TENANT, materia_prima_id: 'mp-alu', numero: 1, motor_id: MOTOR_SUL }, { tenant_id: TENANT, materia_prima_id: 'mp-alu', numero: 2, motor_id: MOTOR_SUL })
        banco.db.orcamentista_motor.push({ id: MOTOR_SUL, nome: 'Motor_Sul_ALU', fornecedor_id: 'f-sul', arquivado_em: null })
        banco.db.orcamentista_mp_categoria_fornecedor.push({ tenant_id: TENANT, mp_categoria_id: 'c-perfil', fornecedor_id: 'f-sul' })
        banco.db.orcamentista_tabela.push({ id: OUTRA, fornecedor_id: 'f-sul', arquivo_nome: 'Sul 2026.xlsx', familia: 'ALUMINIO', categoria_chave: 'PERFIL', vigente: false })
        banco.db.orcamentista_fornecedor.push({ id: 'f-sul', nome: 'Perfis Sul' })
        banco.db.orcamentista_motor_tipologia_detalhe.push(
            { tabela_id: null, motor_id: MOTOR_SUL, tipologia: 'DP-02', descricao: 'JANELA DE CORRER 02 FOLHAS | LINHA SUL', tipo: 'Correr', ordem: null },
            { tabela_id: null, motor_id: MOTOR_SUL, tipologia: 'SU-07', descricao: 'PORTA PIVOTANTE | LINHA SUL', tipo: 'Porta', ordem: null },
        )
    }

    it('DUAS FAMÍLIAS: a lista junta os dois motores, e cada tipologia traz a família e o fornecedor do motor dela', async () => {
        comOutraFamilia()
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        if (!('candidatos' in t)) throw new Error('era para ler a lista: ' + t.frase)
        expect(t.familias.map((f) => [f.familia, f.rotulo, f.fornecedor, f.levantamento.id, f.calculo.id, f.tabelasDePreco])).toEqual([
            ['ALUMINIO', 'Alumínio', 'Perfis Sul', MOTOR_SUL, MOTOR_SUL, [OUTRA]], ['PVC', 'PVC', 'Wolff Perfis', MOTOR, MOTOR, [TABELA]],
        ])
        expect(t.candidatos.map((c) => [c.tipologia, c.familia])).toEqual([['DP-01', 'PVC'], ['DP-02', 'ALUMINIO'], ['DP-02', 'PVC'], ['SU-07', 'ALUMINIO']])
        // com mais de uma família, a linha do prompt diz a família e o fornecedor; com uma só, é a de sempre
        expect(M().linhaDoCandidato(t.candidatos[1], true)).toBe('DP-02 | JANELA DE CORRER 02 FOLHAS | LINHA SUL | Correr | família: Alumínio | fornecedor: Perfis Sul')
        expect(M().linhaDoCandidato(t.candidatos[1], false)).toBe('DP-02 | JANELA DE CORRER 02 FOLHAS | LINHA SUL | Correr')
        expect(M().familiasDoCodigo(t)('DP-02')).toEqual([
            { familia: 'ALUMINIO', rotulo: 'Alumínio', fornecedor: 'Perfis Sul', motorId: MOTOR_SUL }, { familia: 'PVC', rotulo: 'PVC', fornecedor: 'Wolff Perfis', motorId: MOTOR },
        ])
        expect(M().familiasDoCodigo(t)('SU-07').map((f) => f.familia)).toEqual(['ALUMINIO'])
    })

    it('a etapa 2 com OUTRO motor que a 1: a lista vem do motor da 1, e o cálculo é o motor da 2', async () => {
        banco.db.orcamentista_motor.push({ id: 'motor-calculo', nome: 'Motor_Calculo', fornecedor_id: 'f-wolff', arquivado_em: null })
        banco.db.orcamentista_motor_tipologia_detalhe.push({ tabela_id: null, motor_id: 'motor-calculo', tipologia: 'ZZ-01', descricao: 'SÓ NO DO CÁLCULO', tipo: 'Correr', ordem: null })
        banco.db.orcamentista_familia_etapa.find((e) => e.numero === 2)!.motor_id = 'motor-calculo'
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        if (!('candidatos' in t)) throw new Error('era para ler a lista: ' + t.frase)
        expect(t.candidatos.map((c) => c.tipologia)).toEqual(['DP-01', 'DP-02'])
        expect([t.familias[0].levantamento.id, t.familias[0].calculo.id]).toEqual([MOTOR, 'motor-calculo'])
        expect(M().familiasDoCodigo(t)('DP-02')[0].motorId).toBe('motor-calculo')
        // o CÁLCULO lê as abas do motor da etapa 2, que não tem a DP-02: recusa nomeada — as abas do motor da 1 não valem para ele
        const r = await M().mensagemDoLevantamento(TENANT, t, lev({ escolhas: { ARI: 4, ARE: 1, MAE: 2 } }))
        expect(r.desfecho).toBe('recusou')
        expect(r.texto).toContain(M().fraseDaTipologiaSemAbas('DP-02'))
    })

    it('o contraste: com as abas, as regras e o tempo da DP-02 no motor da etapa 2 (com OUTROS códigos), a conta sai com os códigos DELE', async () => {
        banco.db.orcamentista_motor.push({ id: 'motor-calculo', nome: 'Motor_Calculo', fornecedor_id: 'f-wolff', arquivado_em: null })
        banco.db.orcamentista_motor_tipologia_detalhe.push({ tabela_id: null, motor_id: 'motor-calculo', tipologia: 'ZZ-01', descricao: 'SÓ NO DO CÁLCULO', tipo: 'Correr', ordem: null })
        banco.db.orcamentista_familia_etapa.find((e) => e.numero === 2)!.motor_id = 'motor-calculo'
        // as abas inteiras, a Detalhe junto (o cálculo também a lê); a lista de candidatas continua a do motor da etapa 1
        for (const [tab, linhas] of Object.entries(abasDaDP02NoBanco('motor-calculo', 'motor') as Record<string, Linha[]>)) banco.db[tab] = [...(banco.db[tab] ?? []), ...linhas]
        banco.db.orcamentista_motor_tipologia.push({ tabela_id: null, motor_id: 'motor-calculo', tipologia: 'DP-02', linha: 'EUROPA 42', tempo_fabricacao_min: 999, tempo_origem: 'ESTIMADO' })
        banco.db.orcamentista_motor_regra.push(...DE_PARA.regras.map((x) => comId({ ...x, codigo: `K${String(x.codigo)}`, tabela_id: null, motor_id: 'motor-calculo', tipologias: ['DP-02'] })))
        banco.db.orcamentista_tabela_item.push(...DE_PARA.itens.map((x) => ({ ...x, codigo: `K${String(x.codigo)}`, tabela_id: TABELA })))
        banco.db.orcamentista_motor_tipologia_tempo.push({ tabela_id: null, motor_id: 'motor-calculo', tipologia: 'DP-02', tempo_fabricacao_min: 150, tempo_origem: 'IMPORTADO' })
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev({ escolhas: { ARI: 4, ARE: 1, MAE: 2 } }))
        expect(r.desfecho).toBe('levantou')
        const barras = r.texto.split('\n').filter((l) => l.startsWith('• ')).map((l) => l.slice(2).split(' ')[0])
        expect(barras.length).toBeGreaterThan(0)
        expect(barras.every((c) => c.startsWith('K'))).toBe(true)
        expect(t.ok && t.candidatos.map((c) => c.tipologia)).toEqual(['DP-01', 'DP-02'])
    })

    /**
     * DUAS FAMÍLIAS NO MESMO LEVANTAMENTO: cada família vira um produto, calculado com o MOTOR DELA (abas e regras por motor_id)
     * e as TABELAS DE PREÇO dela (por tabela_id). A segunda família é uma cópia da Wolff com os CÓDIGOS trocados (S…): é o que
     * deixa ver de onde veio cada barra.
     */
    const comSegundaFamiliaCalculavel = () => {
        comOutraFamilia()
        const abas = abasDaDP02NoBanco(MOTOR_SUL, 'motor') as Record<string, Linha[]>
        for (const [t, linhas] of Object.entries(abas)) {
            if (t === 'orcamentista_motor_tipologia_detalhe') continue
            banco.db[t] = [...(banco.db[t] ?? []), ...linhas]
        }
        banco.db.orcamentista_motor_regra.push(...DE_PARA.regras.map((r) => comId({ ...r, codigo: `S${String(r.codigo)}`, tabela_id: null, motor_id: MOTOR_SUL, tipologias: ['DP-02'] })))
        banco.db.orcamentista_tabela_item.push(...DE_PARA.itens.map((it) => ({ ...it, codigo: `S${String(it.codigo)}`, tabela_id: OUTRA })))
        banco.db.orcamentista_motor_tipologia_tempo.push({ tabela_id: null, motor_id: MOTOR_SUL, tipologia: 'DP-02', tempo_fabricacao_min: 150, tempo_origem: 'IMPORTADO' })
    }
    const duasFamilias = () => ({
        nome: 'Casa do João',
        itens: [
            { ...ESQUADRIA, escolhas: { ARI: 4, ARE: 1, MAE: 2 }, familia: 'PVC' },
            { ...ESQUADRIA, ordem: 2, escolhas: { ARI: 4, ARE: 1, MAE: 2 }, familia: 'ALUMINIO' },
        ],
    })
    const barrasDo = (bloco: string) => bloco.split('\n').filter((l) => l.startsWith('• ')).map((l) => l.slice(2).split(' ')[0])

    it('DUAS FAMÍLIAS no mesmo levantamento: calcula, e sai UMA relação por família, cada uma com as barras do seu motor e do seu preço', async () => {
        comSegundaFamiliaCalculavel()
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, duasFamilias())
        expect(r.desfecho).toBe('levantou')
        const blocos = r.texto.split(/\n(?=Família )/)
        const pvc = blocos.find((b) => b.startsWith('Família PVC — Wolff Perfis'))
        const aluminio = blocos.find((b) => b.startsWith('Família Alumínio — Perfis Sul'))
        if (!pvc || !aluminio) throw new Error('faltou o bloco de uma família:\n' + r.texto)
        expect(barrasDo(pvc).length).toBeGreaterThan(0)
        expect(barrasDo(pvc).every((c) => !c.startsWith('S'))).toBe(true)
        expect(barrasDo(aluminio).length).toBeGreaterThan(0)
        expect(barrasDo(aluminio).every((c) => c.startsWith('S'))).toBe(true)
        const umaSo = barrasDo(TEXTO_QUE_FECHA)
        expect(barrasDo(pvc)).toEqual(umaSo)
        expect(barrasDo(aluminio)).toEqual(umaSo.map((c) => `S${c}`))
        expect(aluminio).toContain('Esquadria 2: DP-02')
        expect(pvc).not.toContain('Esquadria 2:')
    })

    it('a mesma família com DUAS esquadrias continua UMA relação: o agrupamento junta as barras dentro da família', async () => {
        comOutraFamilia()
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, {
            nome: 'Casa do João',
            itens: [{ ...ESQUADRIA, escolhas: { ARI: 4, ARE: 1, MAE: 2 }, familia: 'PVC' }, { ...ESQUADRIA, ordem: 2, escolhas: { ARI: 4, ARE: 1, MAE: 2 }, familia: 'PVC' }],
        })
        expect(r.desfecho).toBe('levantou')
        expect(r.texto.startsWith('Levantamento “Casa do João”, perfil BRANCO.')).toBe(true)
        expect(r.texto).not.toContain('Família ')
    })

    it('a esquadria cuja tipologia está nos dois motores e não tem a família dita: recusa dizendo que falta a família', async () => {
        comOutraFamilia()
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, { nome: 'Casa do João', itens: [{ ...ESQUADRIA, familia: null }] })
        expect(r.desfecho).toBe('recusou')
        expect(r.texto).toContain('A esquadria 1 (DP-02) está no motor de mais de uma família da empresa (Alumínio, PVC), e falta dizer de qual.')
    })

    it('com a família dita, a esquadria calcula pelo motor e pelo preço DELA — o mesmo levantamento de uma família só', async () => {
        comOutraFamilia()
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev({ escolhas: { ARI: 4, ARE: 1, MAE: 2 }, familia: 'PVC' }))
        expect(r).toEqual({ desfecho: 'levantou', texto: TEXTO_QUE_FECHA })
    })

    it('a tipologia que nenhum motor tem: recusa nomeada', async () => {
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev({ tipologia: 'XX-01' }))
        expect(r.texto).toContain('A esquadria 1 (XX-01) não está na lista de tipologias do motor de nenhuma família da empresa.')
    })

    it('a falta de configuração chega ao vendedor como recusa, com a frase do padrão', async () => {
        banco.db.orcamentista_familia_etapa = []
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev())
        expect(r.desfecho).toBe('recusou')
        expect(r.texto).toContain('• Falta de configuração — a família Esquadrias de PVC não tem a etapa 1 (Gerar o levantamento) cadastrada: verifique o catálogo em Base de conhecimento › Etapas da família.')
    })
})

describe('(2) o tempo de fabricação — da tabela própria, orcamentista_motor_tipologia_tempo', () => {
    it('lê o tempo e a origem da tabela própria — e NÃO das colunas antigas, que têm outro número', async () => {
        expect(await M().tempoDeFabricacao(MOTOR, 'DP-02')).toEqual({ minutos: 150, origem: 'IMPORTADO' })
    })

    it('sem linha na tabela própria: null, nunca zero — mesmo com a coluna antiga preenchida', async () => {
        banco.db.orcamentista_motor_tipologia.push({ tabela_id: null, motor_id: MOTOR, tipologia: 'DP-01', linha: 'DESIGN', tempo_fabricacao_min: 90, tempo_origem: 'ESTIMADO' })
        expect(await M().tempoDeFabricacao(MOTOR, 'DP-01')).toBeNull()
    })

    it('o tempo da MESMA tipologia em outro motor não é lido', async () => {
        banco.db.orcamentista_motor_tipologia_tempo = [{ tabela_id: null, motor_id: 'outro-motor', tipologia: 'DP-02', tempo_fabricacao_min: 777, tempo_origem: 'ESTIMADO' }]
        expect(await M().tempoDeFabricacao(MOTOR, 'DP-02')).toBeNull()
    })

    it('o tempo gravado por tabela_id (a forma antiga) não é lido: a chave é o motor', async () => {
        banco.db.orcamentista_motor_tipologia_tempo = [{ tabela_id: MOTOR, motor_id: null, tipologia: 'DP-02', tempo_fabricacao_min: 777, tempo_origem: 'ESTIMADO' }]
        expect(await M().tempoDeFabricacao(MOTOR, 'DP-02')).toBeNull()
    })

    it('a tabela própria AINDA NÃO EXISTE no banco: ausência declarada, não "sem tempo" e não erro', async () => {
        banco.ausentes.add('orcamentista_motor_tipologia_tempo')
        expect(await M().tempoDeFabricacao(MOTOR, 'DP-02')).toEqual({ ausente: true })
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
        const muitas = Array.from({ length: 2500 }, (_, k) => comId({ tabela_id: null, motor_id: MOTOR, codigo: `C${k}`, codigo_wvetro: `P${k}/WOLFF`, cor: 'BRANCO', tipologias: ['DP-07'] }))
        banco.db.orcamentista_motor_regra.push(...muitas)
        // as mesmas regras por tabela_id (a forma antiga) não entram
        banco.db.orcamentista_motor_regra.push(comId({ tabela_id: MOTOR, codigo: 'INTRUSA', codigo_wvetro: 'X/WOLFF', cor: 'BRANCO', tipologias: ['DP-07'] }))
        const lidas = await M().lerRegras(MOTOR, 'DP-07')
        expect(lidas).toHaveLength(2500)
        expect(new Set(lidas.map((r) => r.codigo)).size).toBe(2500)
        expect(await M().lerRegras(MOTOR, 'DP-02')).toHaveLength(DE_PARA.regras.length)
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
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev({ escolhas: { ARI: 4, ARE: 1, MAE: 2 } }))
        expect(r).toEqual({ desfecho: 'levantou', texto: TEXTO_QUE_FECHA })
    })

    it('SEM escolhas, o PADRÃO fecha (decisões do dono do produto, 25/10/2026): MAE 1 = 0 mm, e o BZ0012 pela variante única', async () => {
        const t = await M().lerFamiliasDaEmpresa(TENANT)
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
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev({ escolhas: { MAI: 2 } }))
        // MAI não é capturada: a linha do arremate é a do padrão, como sem chave nenhuma
        expect(r.texto).toContain('Arremate e guarnição — arremate interno: BZ0006 - ARREMATE 65MM (padrão)')
    })
})

describe('(6) a RECUSA chega como texto, inteira e nomeada', () => {
    it('uma escolha gravada que não é opção (MAE 9): recusa nomeada, em português e sem o prefixo de esquadria', async () => {
        const t = await M().lerFamiliasDaEmpresa(TENANT)
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
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev({ escolhas: { ARI: 2, MAE: 2 } }))
        expect(r.desfecho).toBe('recusou')
        expect(r.texto).toContain('O perfil BZ1770/WOLFF não tem código para a cor BRANCO na tabela do fornecedor')
    })

    it('OUTRO DP: "a tipologia DP-01 não tem as abas do motor importadas"', async () => {
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev({ tipologia: 'DP-01' }))
        expect(r).toEqual({
            desfecho: 'recusou',
            // sem as abas não há variável conhecida: a linha das escolhas não aparece
            texto: 'Não consegui fechar o levantamento “Casa do João”, perfil BRANCO.\nEsquadria 1: DP-01, 1.200 x 1.000 mm, 1 unidade(s).\nFalta:\n'
                + '• A tipologia DP-01 não tem as abas do motor importadas (Variáveis, Fórmulas, Perfis): ainda não consigo calcular as barras dela.',
        })
    })

    it('a DP-02 de OUTRO MOTOR também não tem abas: as do Motor_Wolf_PVC não valem para outro motor', async () => {
        banco.db.orcamentista_motor.push({ id: 'motor-de-outro-fornecedor', nome: 'Motor_Outro', fornecedor_id: 'f-wolff', arquivado_em: null })
        for (const e of banco.db.orcamentista_familia_etapa) if (e.numero !== 3) e.motor_id = 'motor-de-outro-fornecedor'
        banco.db.orcamentista_motor_tipologia_detalhe.push({ tabela_id: null, motor_id: 'motor-de-outro-fornecedor', tipologia: 'DP-02', descricao: 'OUTRA', tipo: 'Correr', ordem: null })
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev())
        expect(r.texto).toContain(M().fraseDaTipologiaSemAbas('DP-02'))
    })

    it('SEM SERRA na base de conhecimento: a recusa diz que falta a serra', async () => {
        delete (banco.db.orcamentista_mp_categoria[0].config as Linha).serra_mm
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev())
        expect(r.texto).toContain('• A largura da serra não está na base de conhecimento da empresa (categoria Perfil). Falta: a serra, em mm.')
    })

    it('DUAS SERRAS diferentes: não escolhe uma', async () => {
        banco.db.orcamentista_mp_categoria.push({ tenant_id: TENANT, categoria_chave: 'PERFIL', config: { serra_mm: 4 } })
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev())
        expect(r.texto).toContain('2 larguras de serra diferentes')
    })

    it('a empresa SEM TABELA de preço, no fechamento: a recusa diz isso, em português, com o padrão da falta de configuração', async () => {
        banco.db.orcamentista_mp_categoria_fornecedor = []
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev())
        expect(r.texto).toContain('• Falta de configuração — a família PVC não tem nenhuma tabela de preço vigente: verifique o catálogo em Catálogo › Fornecedores.')
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
        expect(await M().lerMaoDeObra(TENANT, MOTOR, 'DP-02', 1)).toEqual(MAO_DE_OBRA)
    })

    it('SERVICO: a administrativa e a fixa ENTRAM no custo do minuto (custoMensalDeMaoDeObra) — o segmento decide', async () => {
        banco.db.tenant_settings[0].calc_type = 'SERVICO'
        const mo = await M().lerMaoDeObra(TENANT, MOTOR, 'DP-02', 1)
        // 40.813,03 + 27.649,76 + 17.884,79 = 86.347,58; ÷ 158.400 × 150 = 81,7685 → 81,77
        // a soma é a da tela, em ponto flutuante, na mesma ordem — não um literal arredondado
        expect(mo).toEqual({ ...MAO_DE_OBRA, custoMensal: 40813.03 + (27649.76 + 0 + 0) + 17884.79, porUnidade: 81.77, total: 81.77 })
    })

    it('a quantidade multiplica: 3 unidades', async () => {
        expect(await M().lerMaoDeObra(TENANT, MOTOR, 'DP-02', 3)).toEqual({ ...MAO_DE_OBRA, quantidade: 3, total: 115.95 })
    })

    it('productive_value_per_minute NÃO é lido: com 9,99 gravado nele, o número é o mesmo', async () => {
        banco.db.tenant_expense_config[0].productive_value_per_minute = 9.99
        expect(await M().lerMaoDeObra(TENANT, MOTOR, 'DP-02', 1)).toEqual(MAO_DE_OBRA)
    })

    it.each([
        ['sem tempo de fabricação da tipologia', () => { banco.db.orcamentista_motor_tipologia_tempo = [] }, 'o tempo de fabricação de DP-02 não está cadastrado'],
        ['a tabela dos tempos ainda não existe', () => { banco.ausentes.add('orcamentista_motor_tipologia_tempo') }, 'a tabela dos tempos de fabricação ainda não foi carregada no banco'],
        ['sem carga horária', () => { banco.db.tenant_settings[0].monthly_workload = 0 }, 'a carga horária mensal da empresa não está configurada'],
        // sem a linha, faltam DUAS coisas, e as duas saem — uma não esconde a outra
        ['sem tenant_settings', () => { banco.db.tenant_settings = [] }, 'o tipo de cálculo da empresa (industrialização, revenda ou serviço) não está configurado; a carga horária mensal da empresa não está configurada'],
        ['sem custo de mão de obra produtiva', () => { banco.db.tenant_expense_config[0].production_labor_cost_hub = 0 }, 'o custo mensal da mão de obra produtiva da empresa não está configurado'],
        ['sem tipo de cálculo', () => { banco.db.tenant_settings[0].calc_type = null }, 'o tipo de cálculo da empresa (industrialização, revenda ou serviço) não está configurado'],
        ['empresa de REVENDA', () => { banco.db.tenant_settings[0].calc_type = 'REVENDA' }, 'a empresa está configurada como revenda, e na revenda o tempo de fabricação não entra no custo'],
    ])('%s: a falta é NOMEADA — nunca zero', async (_nome, preparar, falta) => {
        preparar()
        expect(await M().lerMaoDeObra(TENANT, MOTOR, 'DP-02', 1)).toEqual({ ok: false, falta })
    })
})

describe('(8) a COR é a da pré-definição, comparada exata com a coluna cor do motor', () => {
    it('em BRANCO, a DP-02 fecha — e o cabeçalho diz BRANCO', async () => {
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev({ escolhas: { ARI: 4, ARE: 1, MAE: 2 } }))
        expect(r).toEqual({ desfecho: 'levantou', texto: TEXTO_QUE_FECHA })
    })

    it('em PRETO TEXTURADO, a mesma esquadria é RECUSADA nomeando o perfil e a cor — nenhuma cor parecida entra', async () => {
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev({ cor_perfil: 'PRETO TEXTURADO', escolhas: { ARI: 4, ARE: 1, MAE: 2 } }))
        expect(r.desfecho).toBe('recusou')
        expect(r.texto.startsWith('Não consegui fechar o levantamento “Casa do João”, perfil PRETO TEXTURADO.\nEsquadria 1: DP-02, 1.200 x 1.000 mm, 1 unidade(s).\n')).toBe(true)
        expect(r.texto).toContain('• O perfil HF88/WOLFF não tem código para a cor PRETO TEXTURADO na tabela do fornecedor; as variantes que existem são: BRANCO. Falta: o código de HF88/WOLFF em PRETO TEXTURADO.')
    })

    it('"Branco" não é BRANCO: a caixa diferente é recusada, não normalizada', async () => {
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev({ cor_perfil: 'Branco', escolhas: { ARI: 4, ARE: 1, MAE: 2 } }))
        expect(r.desfecho).toBe('recusou')
        expect(r.texto).toContain('não tem código para a cor Branco')
    })

    it('SEM COR na pré-definição: a recusa diz que falta a cor do perfil', async () => {
        const t = await M().lerFamiliasDaEmpresa(TENANT)
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
        const dados = { ...DADOS, esquadrias: [DADOS.esquadrias[0], { ...DADOS.esquadrias[0], numero: 2, largura_mm: 800, quantidade: 2 }] }
        const texto = M().fraseDoLevantamento(dados, resultadoDeUma(), [MAO_DE_OBRA, { ...MAO_DE_OBRA, quantidade: 2, total: 77.3 }])
        expect(texto).toContain('Esquadria 2: DP-02, 800 x 1.000 mm, 2 unidade(s).')
        expect(texto).toContain('Mão de obra da esquadria 1: 150 min por unidade (IMPORTADO) × 1 unidade(s), a R$ 0,257658 o minuto (R$ 40.813,03 ÷ 158.400 min): R$ 38,65.')
        expect(texto).toContain('Mão de obra da esquadria 2: 150 min por unidade (IMPORTADO) × 2 unidade(s), a R$ 0,257658 o minuto (R$ 40.813,03 ÷ 158.400 min): R$ 77,30.')
        expect(texto).toContain('Mão de obra total: R$ 115,95.')
        // 1.342,09 + 115,95
        expect(texto).toContain('Total por barra inteira (perfis + mão de obra): R$ 1.458,04.')
    })

    it('a mão de obra de UMA esquadria ausente: os totais com mão de obra não saem', () => {
        const dados = { ...DADOS, esquadrias: [DADOS.esquadrias[0], { ...DADOS.esquadrias[0], numero: 2, tipologia: 'DP-01' }] }
        const texto = M().fraseDoLevantamento(dados, resultadoDeUma(), [MAO_DE_OBRA, { ok: false, falta: 'o tempo de fabricação de DP-01 não está cadastrado' }])
        expect(texto).toContain('Mão de obra da esquadria 2: não sai — o tempo de fabricação de DP-01 não está cadastrado.')
        expect(texto).toContain('Total por consumo real (perfis + mão de obra): não sai — falta a mão de obra.')
    })

    it('CORES DIFERENTES no mesmo levantamento: recusa nomeada, com a cor de cada esquadria', async () => {
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, {
            nome: 'Casa do João',
            itens: [{ ...ESQUADRIA, escolhas: { ARI: 4, ARE: 1, MAE: 2 } }, { ...ESQUADRIA, ordem: 2, cor_perfil: 'PRETO TEXTURADO', escolhas: { ARI: 4, ARE: 2 } }],
        })
        expect(r.desfecho).toBe('recusou')
        expect(r.texto).toContain('• As esquadrias têm cores diferentes (esquadria 1: BRANCO; esquadria 2: PRETO TEXTURADO): ainda não calculo um levantamento com cores misturadas.')
    })

    it('DUAS esquadrias DP-02 iguais: as barras são do levantamento inteiro, e a mão de obra é a das duas', async () => {
        const t = await M().lerFamiliasDaEmpresa(TENANT)
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

describe('(10) as abas vêm do BANCO: a Fórmulas da tipologia é a fonte, a da linha é fallback ROTULADO', () => {
    const ESCOLHAS = { ARI: 4, ARE: 1, MAE: 2 }
    const semDaDP02 = (tabela: string) => { banco.db[tabela] = banco.db[tabela].filter((l) => l.tipologia !== 'DP-02') }
    /** As fórmulas próprias da DP-02 como fórmulas da linha — o cálculo com elas tem de dar o mesmo número. */
    const comoDaLinha = (linha: string, motorId = MOTOR): Linha[] => banco.db.orcamentista_motor_formula
        .filter((l) => l.tipologia === 'DP-02')
        .map((l) => comId({ tabela_id: null, motor_id: motorId, linha, linha_original: `PVC ${linha}`, variavel: l.variavel, descricao: l.descricao, formula: l.formula, formula_em_lh: null, pct_padrao: null }))
    const levantar = async () => M().mensagemDoLevantamento(TENANT, await M().lerFamiliasDaEmpresa(TENANT), lev({ escolhas: ESCOLHAS }))

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

    it('SEM fórmulas próprias: as da LINHA calculam, e a resposta DIZ que são as da linha — o número é o mesmo, o rótulo não', async () => {
        // a linha certa, e duas que NÃO podem entrar: outra linha e a mesma linha de outra tabela
        const outraLinha = comoDaLinha('EUROPA 60').map((l) => ({ ...l, formula: '(L+5000)' }))
        const outraTabela = comoDaLinha('EUROPA 42', 'tabela-de-outro-fornecedor').map((l) => ({ ...l, formula: '(L+7000)' }))
        banco.db.orcamentista_motor_formula_familia = [...outraLinha, ...outraTabela, ...comoDaLinha('EUROPA 42')]
        semDaDP02('orcamentista_motor_formula')
        const r = await levantar()
        expect(r).toEqual({ desfecho: 'levantou', texto: `${TEXTO_QUE_FECHA}\n\n${M().fraseDasFormulasDaLinha('DP-02', 'EUROPA 42')}` })
        expect(M().fraseDasFormulasDaLinha('DP-02', 'EUROPA 42')).toBe(
            'Atenção: as fórmulas da DP-02 são as da LINHA EUROPA 42 (fallback) — a tipologia não tem fórmulas próprias na aba "Fórmulas" do arquivo do fornecedor.')
    })

    it('COM fórmulas próprias, as da linha NÃO são lidas nem citadas — mesmo que existam', async () => {
        banco.db.orcamentista_motor_formula_familia = comoDaLinha('EUROPA 42').map((l) => ({ ...l, formula: '(L+5000)' }))
        const r = await levantar()
        expect(r).toEqual({ desfecho: 'levantou', texto: TEXTO_QUE_FECHA })
    })

    it('a recusa também carrega o rótulo: o vendedor sabe que a conta recusada foi a das fórmulas da linha', async () => {
        banco.db.orcamentista_motor_formula_familia = comoDaLinha('EUROPA 42')
        semDaDP02('orcamentista_motor_formula')
        // sem a serra, a recusa vem DEPOIS de as fórmulas da linha terem sido usadas (a categoria fica: ela vincula a tabela)
        delete (banco.db.orcamentista_mp_categoria[0].config as Linha).serra_mm
        const r = await levantar()
        expect(r.desfecho).toBe('recusou')
        expect(r.texto.endsWith(`\n\n${M().fraseDasFormulasDaLinha('DP-02', 'EUROPA 42')}`)).toBe(true)
    })

    it('sem fórmulas próprias e SEM a linha da tipologia: recusa nomeada — a linha não é adivinhada', async () => {
        banco.db.orcamentista_motor_formula_familia = comoDaLinha('EUROPA 42')
        banco.db.orcamentista_motor_tipologia[0].linha = null
        semDaDP02('orcamentista_motor_formula')
        const r = await levantar()
        expect(r.desfecho).toBe('recusou')
        expect(r.texto).toContain(M().fraseDaTipologiaSemLinha('DP-02'))
    })

    it('sem fórmulas próprias e a LINHA sem fórmulas: recusa nomeando a linha', async () => {
        banco.db.orcamentista_motor_formula_familia = comoDaLinha('EUROPA 60')
        semDaDP02('orcamentista_motor_formula')
        const r = await levantar()
        expect(r.desfecho).toBe('recusou')
        expect(r.texto).toContain(M().fraseDaLinhaSemFormulas('DP-02', 'EUROPA 42'))
    })

    it('a tipologia com DUAS linhas no motor: recusa nomeando as duas — a linha não é escolhida', async () => {
        banco.db.orcamentista_motor_formula_familia = comoDaLinha('EUROPA 42')
        banco.db.orcamentista_motor_tipologia.push({ tabela_id: null, motor_id: MOTOR, tipologia: 'DP-02', linha: 'EUROPA 60', tempo_fabricacao_min: 150, tempo_origem: 'IMPORTADO' })
        semDaDP02('orcamentista_motor_formula')
        const r = await levantar()
        expect(r.desfecho).toBe('recusou')
        expect(r.texto).toContain(M().fraseDaTipologiaComDuasLinhas('DP-02', ['EUROPA 42', 'EUROPA 60']))
    })

    it('o VOCABULÁRIO (dono do produto, 26/10/2026): as frases dizem LINHA; "família" só no nome da aba do arquivo', () => {
        const frases = [
            M().fraseDasFormulasDaLinha('DP-02', 'EUROPA 42'), M().fraseDaTipologiaSemLinha('DP-02'),
            M().fraseDaTipologiaComDuasLinhas('DP-02', ['EUROPA 42', 'EUROPA 60']), M().fraseDaLinhaSemFormulas('DP-02', 'EUROPA 42'),
            M().fraseDaLinhaComVariavelRepetida('EUROPA 42', 'L'),
        ]
        // o nome da aba é do arquivo do fornecedor e fica entre aspas; fora dele, "família" não aparece
        for (const f of frases) expect(f.replace(/"Fórmulas da família"/g, '').toLowerCase()).not.toContain('família')
        expect(frases.filter((f) => /\blinha\b/i.test(f))).toHaveLength(frases.length)
    })

    it('a linha com a MESMA variável duas vezes: recusa nomeando a variável — não escolhe uma', async () => {
        const familia = comoDaLinha('EUROPA 42')
        banco.db.orcamentista_motor_formula_familia = [...familia, comId({ ...familia[0], formula: '(L+9)' })]
        semDaDP02('orcamentista_motor_formula')
        const r = await levantar()
        expect(r.desfecho).toBe('recusou')
        expect(r.texto).toContain(M().fraseDaLinhaComVariavelRepetida('EUROPA 42', String(familia[0].variavel)))
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
        const muitas = Array.from({ length: 2500 }, (_, k) => comId({ tabela_id: null, motor_id: MOTOR, tipologia: `DP-${1000 + Math.floor(k / 10)}`, ordem: (k % 10) + 2, variavel: `V${k % 10}`, descricao: null, padrao: null, min_max: null, condicao: null, opcoes: null }))
        banco.db.orcamentista_motor_variavel.push(...muitas, comId({ tabela_id: null, motor_id: 'outro', tipologia: 'DP-02', ordem: 99, variavel: 'INTRUSA' }), comId({ tabela_id: MOTOR, tipologia: 'DP-02', ordem: 98, variavel: 'POR_TABELA' }))
        const v = await M().lerVariaveisDasTipologias(MOTOR)
        expect(Object.keys(v)).toHaveLength(251)
        expect(v['DP-1249'].variaveis.map((x) => x.variavel)).toEqual(['V0', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7', 'V8', 'V9'])
        expect(v['DP-02'].variaveis.map((x) => x.variavel)).toEqual((ABAS['Variáveis'].linhas as Linha[]).map((l) => l['Var.']))
    })

    it('as Variáveis com a tabela AUSENTE no banco: nenhuma definição, sem lançar — a conversa segue sem escolhas', async () => {
        banco.ausentes.add('orcamentista_motor_variavel')
        expect(await M().lerVariaveisDasTipologias(MOTOR)).toEqual({})
    })
})

describe('(11) o banco falso recusa ordenar por coluna que a tabela não tem — em TODAS as abas, como o PostgREST', () => {
    // sem isto, o falso aceitou ordenar a Detalhe por `id` e o portão ficou verde com produção parada (26/10/2026)
    const ABAS = ['orcamentista_motor_tipologia_detalhe', 'orcamentista_motor_formula', 'orcamentista_motor_perfil', 'orcamentista_motor_vidro', 'orcamentista_motor_baguete', 'orcamentista_motor_variavel', 'orcamentista_motor_validacao']
    /* eslint-disable @typescript-eslint/no-require-imports */
    const db = () => require('@/supabase/admin').supabaseAdmin as { from: (t: string) => { select: (c: string) => { eq: (c: string, v: unknown) => { order: (c: string) => PromiseLike<{ data: unknown; error: { code: string } | null }> } } } }
    /* eslint-enable @typescript-eslint/no-require-imports */

    it.each(ABAS.map((t) => [t]))('%s: coluna inexistente é erro 42703', async (tabela) => {
        expect(banco.db[tabela]?.length).toBeGreaterThan(0)
        const r = await db().from(tabela).select('*').eq('motor_id', MOTOR).order('coluna_que_nao_existe')
        expect(r.error?.code).toBe('42703')
    })

    it.each(ABAS.map((t) => [t]))('%s: (tipologia, ordem), a ordem que a leitura usa, existe', async (tabela) => {
        const r = await db().from(tabela).select('*').eq('motor_id', MOTOR).order('tipologia')
        expect(r.error).toBeNull()
    })

    it('ordenar a Detalhe por id é erro, como em produção', async () => {
        const r = await db().from('orcamentista_motor_tipologia_detalhe').select('*').eq('motor_id', MOTOR).order('id')
        expect(r.error?.code).toBe('42703')
    })
})
