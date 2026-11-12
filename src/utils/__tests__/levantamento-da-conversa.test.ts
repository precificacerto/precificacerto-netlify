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
import { CATALOGO_DE_ETAPAS, ITEM_DO_CALCULO, ITEM_DO_LEVANTAMENTO, etapa, etapasPadrao } from './fixtures/etapas-da-familia'

type Linha = Record<string, unknown>

const TENANT = 'tenant-1'
/** A tabela de PREÇO da conta (a da Wolff): o motor não é lido por ela desde o PR D. */
const TABELA = '72366020-57c9-489f-9385-397b7fa3dedb'
/** O motor do catálogo que as etapas 1 e 2 da família apontam (o Motor_Wolf_PVC de produção). */
const MOTOR = '9a233c55-f377-45d3-b2ae-b1a740a98e44'
const MOTOR_SUL = 'motor-sul-aluminio'
const OUTRA = 'tabela-perfis-sul'
/* eslint-disable @typescript-eslint/no-require-imports */
const DE_PARA_DE_HOJE = require('./fixtures/fixture_de-para_DP-02.json') as { regras: Linha[]; itens: Linha[] }
/** O motor com o arquivo CORRIGIDO (`fixtures/arquivo-do-motor-corrigido.ts`): o BZ0012 sem a cor 'CLICK'. */
const DE_PARA = { ...DE_PARA_DE_HOJE, regras: (require('./fixtures/arquivo-do-motor-corrigido') as typeof import('./fixtures/arquivo-do-motor-corrigido')).comACorLimpa(DE_PARA_DE_HOJE.regras) }
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
            // o banco dá id a toda linha; as fixtures de item não o escrevem (a leitura do cálculo pagina por id, 12/11/2026)
            if (tabela === 'orcamentista_tabela_item') for (const l of banco.db[tabela] ?? []) if (!('id' in l)) l.id = `item-${String(++sequenciaDeItem).padStart(6, '0')}`
            // a ligação motor ↔ família (20261029000003): sem ela declarada no caso, a das ETAPAS — toda etapa que aponta um motor exige que ele
            // atue na família dela (a FK da etapa aponta a ligação), então a etapa é a prova de que a ligação existe
            const linhasDe = (nome: string): Linha[] => (nome === 'orcamentista_motor_familia' && banco.db[nome] === undefined
                ? [...new Map((banco.db.orcamentista_familia_etapa ?? []).filter((e) => e.motor_id).flatMap((e) => {
                    const familia = (banco.db.orcamentista_materia_prima ?? []).find((m) => m.id === e.materia_prima_id)?.familia
                    return familia ? [[`${e.motor_id}|${familia}`, { motor_id: e.motor_id, familia }] as const] : []
                })).values()]
                : banco.db[nome] ?? [])
            const filtradas = () => linhasDe(tabela).filter((l) => predicados.every((p) => p(l)))
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
const VI = () => require('@/lib/atendimentos-ia/vidro') as typeof import('@/lib/atendimentos-ia/vidro')
const M = () => require('@/lib/atendimentos-ia/levantamento-da-conversa') as Modulo
type Ligacao = typeof import('@/lib/atendimentos-ia/levantamento-de-barras')
const LB = () => require('@/lib/atendimentos-ia/levantamento-de-barras') as Ligacao
type Avaliador = typeof import('@/lib/atendimentos-ia/avaliador-de-formulas')
const AV = () => require('@/lib/atendimentos-ia/avaliador-de-formulas') as Avaliador
const ABAS = require('@/lib/atendimentos-ia/abas-do-motor-wolff-DP-02.json')
/* eslint-enable @typescript-eslint/no-require-imports */

let sequencia = 0
let sequenciaDeItem = 0
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
        // as ETAPAS DECLARADAS (04/11/2026): 1 levantamento (GERAR_LEVANTAMENTO) e 2 cálculo (CALCULAR_BARRAS), o mesmo motor — a De Paula
        orcamentista_familia_etapa: etapasPadrao(TENANT, 'mp-pvc', MOTOR),
        orcamentista_etapa_catalogo: CATALOGO_DE_ETAPAS.map((c) => ({ ...c })),
        orcamentista_motor: [{ id: MOTOR, nome: 'Motor_Wolf_PVC', fornecedor_id: 'f-wolff', arquivado_em: null }],
        // as tabelas de PREÇO da empresa são DERIVADAS (26/10/2026): a base de conhecimento vincula a Wolff no PERFIL
        orcamentista_mp_categoria_fornecedor: [{ tenant_id: TENANT, mp_categoria_id: 'c-perfil', fornecedor_id: 'f-wolff' }],
        orcamentista_tabela: [{ id: TABELA, fornecedor_id: 'f-wolff', arquivo_nome: 'Tabela Wolff.xlsx', familia: 'PVC', categoria_chave: 'PERFIL', vigente: false }],
        orcamentista_fornecedor: [{ id: 'f-wolff', nome: 'Wolff Perfis' }],
        // a tabela de cores da Wolf (20261112000006): o degrau "código + cor" e o guarda da cor do nome técnico
        orcamentista_fornecedor_cor: [['1', 'BRANCO'], ['20', 'PRETO TEXTURADO'], ['36', 'PRETO LISO'], ['30', 'BRONZE']]
            .map(([codigo, nome]) => ({ fornecedor_id: 'f-wolff', grupo: 'PERFIS DE PVC', codigo, nome })),
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

/** O texto e o desfecho, exatos; o resumo do cálculo para o log (06/11/2026) é conferido nos testes dele. */
const semEtapa = (r: { texto: string; desfecho: string; etapa?: unknown }) => ({ texto: r.texto, desfecho: r.desfecho })

describe('(1) a família da conta, o motor dela e as tipologias candidatas (PR D, dono do produto, 02/11/2026)', () => {
    /** A família da conta como produção a tem hoje: 1 família (PVC), as etapas 1 e 2 apontando o Motor_Wolf_PVC. */
    const WOLF = { id: MOTOR, nome: 'Motor_Wolf_PVC' }
    const FAMILIA_DE_PAULA = {
        familia: 'PVC', rotulo: 'PVC', fornecedor: 'Wolff Perfis',
        // as etapas declaradas, na ordem, cada uma com o papel (o executor) que a AÇÃO dá (04/11/2026)
        etapas: [
            { numero: 1, rotulo: 'Apanhado e levantamento de esquadrias', acao: 'GERAR_LEVANTAMENTO', executor: 'levantamento', instrucao: '', motor: WOLF },
            { numero: 2, rotulo: 'Relação de barras, materiais e tempo', acao: 'CALCULAR_BARRAS', executor: 'calculo', instrucao: '', motor: WOLF },
        ],
        levantamento: WOLF, calculo: WOLF, instrucaoDoLevantamento: null as unknown, instrucoesSemEfeito: [] as unknown[], tabelasDePreco: [TABELA],
    }

    it('DE PAULA — 1 família: é ela, sem perguntar; a lista vem do motor da etapa 1, POR motor_id, em ordem de código', async () => {
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        if (!('candidatos' in t)) throw new Error('era para ler a lista: ' + t.frase)
        expect(t.familias).toEqual([FAMILIA_DE_PAULA])
        expect(t.candidatos.map((c) => c.tipologia)).toEqual(['DP-01', 'DP-02'])
        // desde 03/11/2026 a linha leva os limites do motor; desde 05/11/2026 ENXUTA: a linha de produto sai da descrição (a Detalhe a traz) e o limite é compacto
        expect(t.candidatos[1].linha).toBe('PVC WOLFF EUROPA 42')
        expect(M().linhaDoCandidato(t.candidatos[1], false)).toBe('DP-02 | JANELA DE CORRER 02 FOLHAS MÓVEIS | Correr | A 388-2439')
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
        banco.db.orcamentista_familia_etapa.push(...etapasPadrao(TENANT, 'mp-pvc-2', MOTOR))
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        if (!('candidatos' in t)) throw new Error('era para ler a lista: ' + t.frase)
        expect(t.familias).toEqual([FAMILIA_DE_PAULA])
    })

    /**
     * ERRO EXPLÍCITO, nunca fallback e nunca voltar a ler por tabela_id (item 4 do pedido). Em todos, o conteúdo do motor
     * gravado por tabela_id da tabela da conta EXISTE (`comConteudoPorTabela`): se o código caísse na leitura antiga, acharia lista.
     * As frases esperadas são escritas aqui por extenso, não montadas pela função que se testa.
     */
    const comConteudoPorTabelaSo = () => banco.db.orcamentista_motor_tipologia_detalhe.filter((l) => l.tabela_id === TABELA)
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

        it('família SEM NENHUMA ETAPA cadastrada: erro nomeando a família — a frase é a da conferência única (04/11/2026)', async () => {
            banco.db.orcamentista_familia_etapa = []
            expect(await falta()).toEqual(['ETAPAS', 'Falta de configuração — etapa: "Esquadrias de PVC" não tem etapas. Veja a configuração: cadastre as etapas, cada uma com o seu motor.'])
        })

        it('ETAPA SEM MOTOR (a do levantamento): erro nomeando a etapa pelo número E pelo nome do catálogo', async () => {
            banco.db.orcamentista_familia_etapa.find((e) => e.etapa_catalogo_id === ITEM_DO_LEVANTAMENTO)!.motor_id = null
            expect(await falta()).toEqual(['ETAPAS', 'Falta de configuração — motor: a etapa 1 ("Apanhado e levantamento de esquadrias") está sem motor. Veja a configuração: escolha um motor para ela.'])
        })

        it('MOTOR ARQUIVADO: erro nomeando o motor', async () => {
            banco.db.orcamentista_motor[0].arquivado_em = '2026-11-01T12:00:00Z'
            expect(await falta()).toEqual(['MOTOR_ARQUIVADO', 'Falta de configuração — o motor Motor_Wolf_PVC, da etapa 1 ("Apanhado e levantamento de esquadrias") da família Esquadrias de PVC, está arquivado: verifique o catálogo em Catálogo › Motores.'])
        })

        it('MOTOR SEM CONTEÚDO importado (0 tipologias por motor_id) — com as tipologias da tabela lá: erro, e a lista por tabela_id não é lida', async () => {
            banco.db.orcamentista_motor_tipologia_detalhe = banco.db.orcamentista_motor_tipologia_detalhe.filter((l) => l.motor_id !== MOTOR)
            expect(banco.db.orcamentista_motor_tipologia_detalhe.length).toBeGreaterThan(0)
            expect(await falta()).toEqual(['MOTOR_SEM_CONTEUDO', 'Falta de configuração — o motor Motor_Wolf_PVC, da etapa 1 ("Apanhado e levantamento de esquadrias") da família Esquadrias de PVC, não tem tipologias importadas: verifique o catálogo em Catálogo › Motores.'])
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
            banco.db.orcamentista_familia_etapa.push(etapa(TENANT, 'mp-pvc-2', 1, ITEM_DO_LEVANTAMENTO, MOTOR), etapa(TENANT, 'mp-pvc-2', 2, ITEM_DO_CALCULO, 'motor-outro'))
            // a divergência é dita pela AÇÃO (o papel), não pelo número (04/11/2026)
            expect(await falta()).toEqual(['MOTORES_DIVERGENTES', 'Falta de configuração — as famílias Esquadrias de PVC e PVC da obra (PVC) apontam motores diferentes na etapa de cálculo: verifique o catálogo em Base de conhecimento › Etapas da família.'])
        })

        it('o motor com linhas na lista mas NENHUM código válido (tipologia vazia): recusa nomeando o motor e a família — não segue com lista vazia', async () => {
            banco.db.orcamentista_motor_tipologia_detalhe = [{ tabela_id: null, motor_id: MOTOR, tipologia: '', descricao: 'SEM CÓDIGO', tipo: 'Correr', ordem: null }, ...comConteudoPorTabelaSo()]
            const t = await M().lerFamiliasDaEmpresa(TENANT)
            expect('frase' in t && [t.motivo, t.frase, t.detalhe]).toEqual(['SEM_LISTA_DE_TIPOLOGIAS', M().fraseSemListaDoMotor('Motor_Wolf_PVC', 'PVC'), 'linhas=0'])
            expect(M().fraseSemListaDoMotor('Motor_Wolf_PVC', 'PVC')).toContain('Motor_Wolf_PVC')
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
        banco.db.orcamentista_familia_etapa.push(...etapasPadrao(TENANT, 'mp-alu', MOTOR_SUL))
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
        // a Detalhe do Sul não traz a linha: a descrição fica inteira; sem limite no arquivo, nenhum trecho de limites (05/11/2026)
        expect(t.candidatos[1].linha).toBeNull()
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
        banco.db.orcamentista_familia_etapa.find((e) => e.etapa_catalogo_id === ITEM_DO_CALCULO)!.motor_id = 'motor-calculo'
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
        banco.db.orcamentista_familia_etapa.find((e) => e.etapa_catalogo_id === ITEM_DO_CALCULO)!.motor_id = 'motor-calculo'
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

    it('DUAS FAMÍLIAS, a falta de preço na segunda (12/11/2026): a família evolui sem o S1023, e a falta sai no bloco dela, com a esquadria do LEVANTAMENTO (a 2)', async () => {
        comSegundaFamiliaCalculavel()
        banco.db.orcamentista_tabela_item = banco.db.orcamentista_tabela_item.filter((i) => i.codigo !== 'S1023')
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, duasFamilias())
        expect(r.desfecho).toBe('levantou')
        const aluminio = r.texto.split(/\n(?=Família )/).find((b) => b.startsWith('Família Alumínio — Perfis Sul'))!
        expect(aluminio).toContain('Sem preço — fica fora dos totais, e o orçamento sai PARCIAL:')
        // o fornecedor da segunda família não tem a tabela de cores: a frase diz que a cor e o nome técnico não rodaram
        expect(aluminio).toMatch(/• 1023\/WOLFF \(CLICK GUIA DE ALUMÍNIO PARA TRILHO DE PVC\) em BRANCO não está na tabela de preço[^\n]*\(esquadria 2\)\./)
        expect(aluminio).not.toContain('• S1023 (')
        expect(r.etapa?.faltou).toContain('e2:SEM_TABELA_DE_CORES:1023/WOLFF')
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
        expect(r.texto).toBe('Não consegui fechar o levantamento “Casa do João”. Falta: dizer de qual família é a DP-02: ela está no motor de mais de uma família da empresa (Alumínio, PVC) (esquadria 1).')
    })

    it('com a família dita, a esquadria calcula pelo motor e pelo preço DELA — o mesmo levantamento de uma família só', async () => {
        comOutraFamilia()
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev({ escolhas: { ARI: 4, ARE: 1, MAE: 2 }, familia: 'PVC' }))
        expect(semEtapa(r)).toEqual({ desfecho: 'levantou', texto: TEXTO_QUE_FECHA })
    })

    it('a tipologia que nenhum motor tem: recusa nomeada', async () => {
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev({ tipologia: 'XX-01' }))
        expect(r.texto).toBe('Não consegui fechar o levantamento “Casa do João”. Falta: a tipologia XX-01 no motor de alguma família da empresa: ela não está na lista de tipologias de nenhuma (esquadria 1).')
    })

    it('a falta de configuração chega ao vendedor como recusa, com a frase do padrão', async () => {
        banco.db.orcamentista_familia_etapa = []
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev())
        expect(r.desfecho).toBe('recusou')
        // a frase de configuração é inteira: vai como está, sem um segundo "Falta:"
        expect(r.texto).toBe('Não consegui fechar o levantamento “Casa do João”. Falta de configuração — etapa: "Esquadrias de PVC" não tem etapas. Veja a configuração: cadastre as etapas, cada uma com o seu motor.')
    })
})

/**
 * (1f) AS ETAPAS DECLARADAS — A AÇÃO MANDA, O NÚMERO É SÓ ORDEM (dono do produto, 04/11/2026). O leitor da conversa lê TODAS as etapas da família com
 * o item do catálogo de cada uma, chama `conferirEtapasParaExecutar` (a conferência única, a mesma da tela) e dá o papel pela AÇÃO: o motor da etapa com
 * GERAR_LEVANTAMENTO dá a lista; o da etapa com CALCULAR_BARRAS calcula. Falta de etapa, etapa sem motor, ação sem executor, ação repetida ou cálculo
 * antes do levantamento é erro NOMEADO, nunca silêncio. A família só com a etapa de levantamento só levanta.
 */
describe('(1f) as etapas declaradas: a ação decide o papel, e toda falta é nomeada (04/11/2026)', () => {
    const falta = async () => { const t = await M().lerFamiliasDaEmpresa(TENANT); return 'frase' in t ? [t.motivo, t.frase] : ['LEU', ''] }
    const lida = async () => { const t = await M().lerFamiliasDaEmpresa(TENANT); if (!('candidatos' in t)) throw new Error('era para ler: ' + t.frase); return t }
    const motorDeCalculo = () => {
        banco.db.orcamentista_motor.push({ id: 'motor-calculo', nome: 'Motor_Calculo', fornecedor_id: 'f-wolff', arquivado_em: null })
        banco.db.orcamentista_motor_tipologia_detalhe.push({ tabela_id: null, motor_id: 'motor-calculo', tipologia: 'ZZ-01', descricao: 'SÓ NO DO CÁLCULO', tipo: 'Correr', ordem: null })
    }

    it('a ORDEM TROCADA (o cálculo na 1, o levantamento na 2) é falta nomeada — os motores NUNCA trocam de papel em silêncio', async () => {
        motorDeCalculo()
        banco.db.orcamentista_familia_etapa = [etapa(TENANT, 'mp-pvc', 1, ITEM_DO_CALCULO, 'motor-calculo'), etapa(TENANT, 'mp-pvc', 2, ITEM_DO_LEVANTAMENTO, MOTOR)]
        expect(await falta()).toEqual(['ETAPAS',
            'Falta de configuração — etapa: a etapa 1 ("Relação de barras, materiais e tempo") de cálculo precisa de uma etapa de levantamento antes dela. Veja a configuração: ponha antes dela uma etapa com a ação "Gerar o levantamento".'])
    })

    it('o levantamento na 2 e o cálculo na 3, com motores diferentes: a lista é a do motor da ação de levantamento, o cálculo é o da ação de cálculo — pelo número seria o contrário', async () => {
        motorDeCalculo()
        banco.db.orcamentista_familia_etapa = [etapa(TENANT, 'mp-pvc', 2, ITEM_DO_LEVANTAMENTO, MOTOR), etapa(TENANT, 'mp-pvc', 3, ITEM_DO_CALCULO, 'motor-calculo')]
        const t = await lida()
        expect(t.candidatos.map((c) => c.tipologia)).toEqual(['DP-01', 'DP-02'])
        expect([t.familias[0].levantamento.id, t.familias[0].calculo?.id]).toEqual([MOTOR, 'motor-calculo'])
        expect(t.familias[0].etapas.map((e) => [e.numero, e.acao, e.executor, e.motor.id])).toEqual([[2, 'GERAR_LEVANTAMENTO', 'levantamento', MOTOR], [3, 'CALCULAR_BARRAS', 'calculo', 'motor-calculo']])
        expect(M().familiasDoCodigo(t)('DP-02')[0].motorId).toBe('motor-calculo')
    })

    it('a TERCEIRA etapa com ação sem executor (ENVIAR) é falta nomeada — antes era ignorada em silêncio', async () => {
        banco.db.orcamentista_familia_etapa.push(etapa(TENANT, 'mp-pvc', 3, 'cat-envio', MOTOR))
        expect(await falta()).toEqual(['ETAPAS',
            'Falta de configuração — etapa: a etapa 3 ("Envio ao vendedor") tem a ação "Enviar ao vendedor", que o sistema ainda não executa. '
            + 'Veja a configuração: retire a etapa, ou troque-a por uma com ação executada ("Gerar o levantamento" ou "Calcular as barras e os materiais").'])
    })

    it('a ação REPETIDA é falta nomeada', async () => {
        banco.db.orcamentista_familia_etapa.push(etapa(TENANT, 'mp-pvc', 3, ITEM_DO_CALCULO, MOTOR))
        expect(await falta()).toEqual(['ETAPAS', 'Falta de configuração — etapa: a ação "Calcular as barras e os materiais" está nas etapas 2 e 3; cada ação entra uma vez só. Veja a configuração: deixe uma etapa com ela.'])
    })

    it('duas instâncias da MESMA família que não declaram as MESMAS etapas (uma só levanta, a outra calcula): não escolho — falta nomeada', async () => {
        banco.db.orcamentista_materia_prima.push({ id: 'mp-pvc-2', tenant_id: TENANT, nome: 'PVC da obra', familia: 'PVC' })
        banco.db.orcamentista_familia_etapa.push(etapa(TENANT, 'mp-pvc-2', 1, ITEM_DO_LEVANTAMENTO, MOTOR))
        expect(await falta()).toEqual(['MOTORES_DIVERGENTES', 'Falta de configuração — as famílias Esquadrias de PVC e PVC da obra (PVC) não declaram as mesmas etapas: verifique o catálogo em Base de conhecimento › Etapas da família.'])
    })

    it('o item do catálogo com ação fora da lista é falta nomeada, não um lançamento', async () => {
        banco.db.orcamentista_etapa_catalogo.push({ id: 'cat-xpto', nome: 'Etapa estranha', acao: 'XPTO', abas: [], ordem: 9 })
        banco.db.orcamentista_familia_etapa.push(etapa(TENANT, 'mp-pvc', 3, 'cat-xpto', MOTOR))
        expect(await falta()).toEqual(['ETAPAS', 'Falta de configuração — etapa: a etapa 3 ("Etapa estranha") tem a ação "XPTO", que não é da lista. Veja a configuração: escolha para ela um item do catálogo de etapas com ação da lista.'])
    })

    it('várias faltas saem juntas, uma por linha: a etapa sem motor E a terceira sem executor', async () => {
        banco.db.orcamentista_familia_etapa.find((e) => e.etapa_catalogo_id === ITEM_DO_CALCULO)!.motor_id = null
        banco.db.orcamentista_familia_etapa.push(etapa(TENANT, 'mp-pvc', 3, 'cat-apanhado', MOTOR))
        const [motivo, frase] = await falta()
        expect(motivo).toBe('ETAPAS')
        expect(frase.split('\n').map((l) => l.split(':')[0])).toEqual(['Falta de configuração — motor', 'Falta de configuração — etapa'])
        expect(frase).toContain('a etapa 2 ("Relação de barras, materiais e tempo") está sem motor')
        expect(frase).toContain('a etapa 3 ("Apanhado do pedido") tem a ação "Apanhar o que o vendedor pede"')
    })

    describe('a família SÓ com a etapa de levantamento só levanta (decisão do dono do produto, 04/11/2026)', () => {
        beforeEach(() => { banco.db.orcamentista_familia_etapa = [etapa(TENANT, 'mp-pvc', 1, ITEM_DO_LEVANTAMENTO, MOTOR)] })

        it('lê: a lista vem do motor do levantamento, o cálculo é nulo, e a esquadria fica SEM motor (ausente, não o do levantamento)', async () => {
            const t = await lida()
            expect(t.candidatos.map((c) => c.tipologia)).toEqual(['DP-01', 'DP-02'])
            expect([t.familias[0].levantamento.id, t.familias[0].calculo]).toEqual([MOTOR, null])
            expect(M().familiasDoCodigo(t)('DP-02')).toEqual([{ familia: 'PVC', rotulo: 'PVC', fornecedor: 'Wolff Perfis', motorId: null }])
        })

        it('a mensagem final traz as esquadrias como gravadas e diz que não há cálculo — nenhum número de barra, mão de obra ou preço', async () => {
            const t = await lida()
            const r = await M().mensagemDoLevantamento(TENANT, t, lev({ escolhas: { ARI: 4, ARE: 1, MAE: 2 } }))
            expect(r.desfecho).toBe('levantou')
            expect(r.texto).toBe([
                'Levantamento “Casa do João”, perfil BRANCO.',
                'Esquadria 1: DP-02, 1.200 x 1.000 mm, 1 unidade(s).',
                '',
                'Esta família não tem etapa de cálculo: as barras, a mão de obra e o preço não saem. O levantamento fica registrado como está.',
            ].join('\n'))
            expect(r.texto).not.toContain('R$')
            expect(r.texto).not.toContain('Barras por código')
            expect(r.texto).not.toContain(M().O_QUE_O_PRECO_COBRE)
        })

        it('com duas famílias, uma que calcula e uma que só levanta: o bloco de cada uma, e "o que o preço cobre" uma vez, pela que calculou', async () => {
            banco.db.orcamentista_materia_prima.push({ id: 'mp-alu', tenant_id: TENANT, nome: 'Esquadrias de alumínio', familia: 'ALUMINIO' })
            banco.db.orcamentista_familia_etapa.push(etapa(TENANT, 'mp-alu', 1, ITEM_DO_LEVANTAMENTO, MOTOR_SUL))
            banco.db.orcamentista_motor.push({ id: MOTOR_SUL, nome: 'Motor_Sul_ALU', fornecedor_id: 'f-sul', arquivado_em: null })
            banco.db.orcamentista_mp_categoria_fornecedor.push({ tenant_id: TENANT, mp_categoria_id: 'c-perfil', fornecedor_id: 'f-sul' })
            banco.db.orcamentista_tabela.push({ id: 'tabela-sul', fornecedor_id: 'f-sul', arquivo_nome: 'Sul.xlsx', familia: 'ALUMINIO', categoria_chave: 'PERFIL', vigente: false })
            banco.db.orcamentista_fornecedor.push({ id: 'f-sul', nome: 'Perfis Sul' })
            banco.db.orcamentista_motor_tipologia_detalhe.push({ tabela_id: null, motor_id: MOTOR_SUL, tipologia: 'SU-07', descricao: 'PORTA PIVOTANTE | LINHA SUL', tipo: 'Porta', ordem: null })
            // o PVC volta a calcular; só o alumínio só levanta
            banco.db.orcamentista_familia_etapa.push(etapa(TENANT, 'mp-pvc', 2, ITEM_DO_CALCULO, MOTOR))
            const t = await lida()
            const r = await M().mensagemDoLevantamento(TENANT, t, {
                nome: 'Casa do João',
                itens: [{ ...ESQUADRIA, escolhas: { ARI: 4, ARE: 1, MAE: 2 }, familia: 'PVC' }, { ...ESQUADRIA, ordem: 2, tipologia: 'SU-07', familia: 'ALUMINIO', escolhas: null }],
            })
            expect(r.desfecho).toBe('levantou')
            expect(r.texto).toContain('Família PVC — Wolff Perfis, perfil BRANCO.')
            expect(r.texto).toContain('Família Alumínio — Perfis Sul, perfil BRANCO.\nEsquadria 2: SU-07, 1.200 x 1.000 mm, 1 unidade(s).\n\nEsta família não tem etapa de cálculo')
            expect(r.texto.split(M().O_QUE_O_PRECO_COBRE).length - 1).toBe(1)
        })

        it('com duas famílias que SÓ levantam: dois blocos sem número e NENHUM "o que o preço cobre" — não há preço a cobrir', async () => {
            banco.db.orcamentista_materia_prima.push({ id: 'mp-alu', tenant_id: TENANT, nome: 'Esquadrias de alumínio', familia: 'ALUMINIO' })
            banco.db.orcamentista_familia_etapa.push(etapa(TENANT, 'mp-alu', 1, ITEM_DO_LEVANTAMENTO, MOTOR_SUL))
            banco.db.orcamentista_motor.push({ id: MOTOR_SUL, nome: 'Motor_Sul_ALU', fornecedor_id: 'f-sul', arquivado_em: null })
            banco.db.orcamentista_mp_categoria_fornecedor.push({ tenant_id: TENANT, mp_categoria_id: 'c-perfil', fornecedor_id: 'f-sul' })
            banco.db.orcamentista_tabela.push({ id: 'tabela-sul', fornecedor_id: 'f-sul', arquivo_nome: 'Sul.xlsx', familia: 'ALUMINIO', categoria_chave: 'PERFIL', vigente: false })
            banco.db.orcamentista_fornecedor.push({ id: 'f-sul', nome: 'Perfis Sul' })
            banco.db.orcamentista_motor_tipologia_detalhe.push({ tabela_id: null, motor_id: MOTOR_SUL, tipologia: 'SU-07', descricao: 'PORTA PIVOTANTE | LINHA SUL', tipo: 'Porta', ordem: null })
            const t = await lida()
            const r = await M().mensagemDoLevantamento(TENANT, t, {
                nome: 'Casa do João',
                itens: [{ ...ESQUADRIA, escolhas: null, familia: 'PVC' }, { ...ESQUADRIA, ordem: 2, tipologia: 'SU-07', familia: 'ALUMINIO', escolhas: null }],
            })
            expect(r.desfecho).toBe('levantou')
            expect(r.texto.split('Esta família não tem etapa de cálculo').length - 1).toBe(2)
            expect(r.texto).not.toContain(M().O_QUE_O_PRECO_COBRE)
            expect(r.texto).not.toContain('R$')
        })
    })

    describe('a instrução da etapa (04/11/2026): só a da etapa que fala com o modelo tem efeito', () => {
        it('a instrução da etapa de LEVANTAMENTO vem identificada pela etapa e pela família; a de CÁLCULO é anotada como sem efeito', async () => {
            banco.db.orcamentista_familia_etapa.find((e) => e.etapa_catalogo_id === ITEM_DO_LEVANTAMENTO)!.instrucao = '  Pergunte o andar da obra.  '
            banco.db.orcamentista_familia_etapa.find((e) => e.etapa_catalogo_id === ITEM_DO_CALCULO)!.instrucao = 'Some 10% de perda.'
            const t = await lida()
            expect(t.familias[0].instrucaoDoLevantamento).toEqual({ numero: 1, rotulo: 'Apanhado e levantamento de esquadrias', texto: 'Pergunte o andar da obra.', familia: 'PVC' })
            expect(t.familias[0].instrucoesSemEfeito).toEqual([{ numero: 2, rotulo: 'Relação de barras, materiais e tempo', acao: 'CALCULAR_BARRAS', caracteres: 18 }])
        })

        it('sem instrução preenchida (a De Paula hoje): nulo e vazio — nenhuma seção, nenhuma anotação', async () => {
            const t = await lida()
            expect([t.familias[0].instrucaoDoLevantamento, t.familias[0].instrucoesSemEfeito]).toEqual([null, []])
        })
    })
})

/**
 * (1p) A DE PAULA COMO PRODUÇÃO ESTÁ, medida em 02/11/2026 (só leitura), com o PR D: 1 família (PVC, "Esquadrias de PVC WOLF"), as
 * etapas 1 e 2 apontando o Motor_Wolf_PVC (`9a233c55`: 12.116 regras, 164 tipologias e 164 tempos, TODOS por motor_id e nenhum por
 * tabela_id), e o preço nas duas tabelas vinculadas: a Wolf `21acfa75` (PVC, Perfil, 485 itens) e a Estrela `5f7acebf` (qualquer linha).
 * As abas da DP-02 do motor de produção são as da fixture, conferidas por md5 coluna a coluna: Perfis 34 linhas `9293e816…`, Fórmulas
 * 21 `8d93754e…`, Variáveis 19 `90def4b2…`, Validações 1 `f73ccaa3…`, Detalhe 1 `bd4fdca7…`. O que difere da fixture, e entra aqui:
 * os códigos 1023, 8432 e 8433 não estão em NENHUMA tabela de preço do catálogo; o tempo é 300 min ESTIMADO; a carga horária, 176 h.
 * O resultado é a recusa nomeada dos três códigos — nunca estimados, nunca escondidos.
 */
describe('(1p) a De Paula como produção está: o motor da família, e os códigos sem preço nomeados', () => {
    it('a DP-02 EVOLUI sem 1023, 8432 e 8433, e os nomeia como falta (12/11/2026) — o preço é das tabelas da família, e o resto do levantamento não é inventado', async () => {
        banco.db.orcamentista_tabela = [
            { id: '21acfa75-e4e7-4de6-9b96-cdd95525467d', fornecedor_id: 'f-wolff', arquivo_nome: 'Tabela_Wolff_Perfis_PVC.xlsx', familia: 'PVC', categoria_chave: 'PERFIL', vigente: false },
            { id: '5f7acebf-3c91-46de-af00-57a47f8be288', fornecedor_id: 'f-estrela', arquivo_nome: 'Estrela.xlsx', familia: null, categoria_chave: null, vigente: false },
        ]
        banco.db.orcamentista_fornecedor.push({ id: 'f-estrela', nome: 'INDUSTRIA DE VIDROS TEMPERADOS ESTRELA LTDA' })
        banco.db.orcamentista_mp_categoria.push({ id: 'c-vidro', tenant_id: TENANT, categoria_chave: 'VIDRO', config: {} })
        banco.db.orcamentista_mp_categoria_fornecedor.push({ tenant_id: TENANT, mp_categoria_id: 'c-vidro', fornecedor_id: 'f-estrela' })
        banco.db.orcamentista_tabela_item = DE_PARA.itens.filter((i) => !['1023', '8432', '8433'].includes(String(i.codigo))).map((i) => ({ ...i, tabela_id: '21acfa75-e4e7-4de6-9b96-cdd95525467d' }))
        banco.db.orcamentista_motor_tipologia_tempo = [{ tabela_id: null, motor_id: MOTOR, tipologia: 'DP-02', tempo_fabricacao_min: 300, tempo_origem: 'ESTIMADO' }]
        banco.db.tenant_settings[0].monthly_workload = 176
        banco.db.orcamentista_familia_etapa = banco.db.orcamentista_familia_etapa.filter((e) => e.numero !== 3)
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        if (!('familias' in t)) throw new Error('era para ler: ' + t.frase)
        expect(t.familias.map((f) => [f.familia, f.levantamento.id, f.calculo.id, f.tabelasDePreco])).toEqual([
            ['PVC', MOTOR, MOTOR, ['21acfa75-e4e7-4de6-9b96-cdd95525467d', '5f7acebf-3c91-46de-af00-57a47f8be288']],
        ])
        const r = await M().mensagemDoLevantamento(TENANT, t, lev({ escolhas: { ARI: 4, ARE: 1, MAE: 2 } }))
        expect(r.desfecho).toBe('levantou')
        const faltas = r.texto.slice(r.texto.indexOf('Sem preço — fica fora dos totais, e o orçamento sai PARCIAL:')).split('\n')
        expect(faltas.slice(1).map((l) => l.split(' ')[1])).toEqual(['1023/WOLFF', '8432/WOLFF', '8433/WOLFF'])
        // as barras saem SÓ dos códigos com preço
        expect(r.texto).not.toMatch(/• (1023|8432|8433) \(/)
        // o resumo para o log (06/11/2026): os três códigos sem preço, cada um com a esquadria e o motivo
        expect(r.etapa?.faltou).toEqual(['e1:NAO_ACHADA:1023/WOLFF', 'e1:NAO_ACHADA:8432/WOLFF', 'e1:NAO_ACHADA:8433/WOLFF'])
        expect(r.etapa?.semPreco).toBe(3)
        // O ESCOPO PRIMEIRO (dono do produto, 12/11/2026): os três na tabela da ESTRELA — outro fornecedor, fora do escopo do motor da Wolf — NÃO
        // valem: o preço de um perfil da Wolf nunca vem da tabela de vidro de outro fornecedor. A falta continua, nomeando os três
        const dosTres = DE_PARA.itens.filter((i) => ['1023', '8432', '8433'].includes(String(i.codigo)))
        banco.db.orcamentista_tabela_item.push(...dosTres.map((i) => ({ ...i, tabela_id: '5f7acebf-3c91-46de-af00-57a47f8be288' })))
        const foraDoEscopo = await M().mensagemDoLevantamento(TENANT, t, lev({ escolhas: { ARI: 4, ARE: 1, MAE: 2 } }))
        expect(foraDoEscopo.etapa?.faltou).toEqual(['e1:NAO_ACHADA:1023/WOLFF', 'e1:NAO_ACHADA:8432/WOLFF', 'e1:NAO_ACHADA:8433/WOLFF'])
        // o contraste: com os três na tabela da WOLF (o fornecedor e a família do motor), a mesma esquadria fecha sem falta
        banco.db.orcamentista_tabela_item.push(...dosTres.map((i) => ({ ...i, tabela_id: '21acfa75-e4e7-4de6-9b96-cdd95525467d' })))
        const completo = await M().mensagemDoLevantamento(TENANT, t, lev({ escolhas: { ARI: 4, ARE: 1, MAE: 2 } }))
        expect([completo.desfecho, completo.etapa?.faltou, completo.texto.includes('PARCIAL')]).toEqual(['levantou', [], false])
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

    it('a linha com o tempo VAZIO não é tempo: null, nunca zero', async () => {
        banco.db.orcamentista_motor_tipologia_tempo[0].tempo_fabricacao_min = null
        expect(await M().tempoDeFabricacao(MOTOR, 'DP-02')).toBeNull()
    })

    it('DOIS tempos para a mesma tipologia no mesmo motor: erro do banco — nunca a escolha de um (a leitura de antes, maybeSingle, também lançava)', async () => {
        banco.db.orcamentista_motor_tipologia_tempo.push({ tabela_id: null, motor_id: MOTOR, tipologia: 'DP-02', tempo_fabricacao_min: 999, tempo_origem: 'ESTIMADO' })
        await expect(M().tempoDeFabricacao(MOTOR, 'DP-02')).rejects.toThrow('a tipologia DP-02 tem mais de um tempo no motor')
    })

    it('os tempos de VÁRIAS tipologias numa leitura só: cada uma com o seu, e a que não tem fica fora do mapa', async () => {
        banco.db.orcamentista_motor_tipologia_tempo.push({ tabela_id: null, motor_id: MOTOR, tipologia: 'DP-01', tempo_fabricacao_min: 70, tempo_origem: 'ESTIMADO' })
        const t = await M().temposDeFabricacao(MOTOR, ['DP-02', 'DP-01', 'DP-99', 'DP-02'])
        if ('ausente' in t) throw new Error('a tabela existe')
        expect([...t.entries()].sort()).toEqual([['DP-01', { minutos: 70, origem: 'ESTIMADO' }], ['DP-02', { minutos: 150, origem: 'IMPORTADO' }]])
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
        expect(VI().lerVidro(vidro).espessura_mm).toBe(esperado)
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
            esquadrias: [{ tipologia: 'DP-02', L_mm: 1200, H_mm: 1000, quantidade: 1, escolhas: { MAE: 2, ARI: 4 }, espessura_vidro_mm: 5 }],
            tipologias: { 'DP-02': lida.tipologia }, regras: DE_PARA.regras as never, itens: DE_PARA.itens as never, serra_mm: 5,
        })
        if ('recusas' in r) throw new Error('recusado: ' + r.recusas.map((x) => x.mensagem).join(' | '))
        return r
    }

    it('o LEVANTAMENTO QUE FECHA: barras, aproveitamento, os dois totais de material, a diferença, a mão de obra e os dois totais — o texto inteiro', () => {
        expect(M().fraseDoLevantamento(DADOS, resultadoQueFecha(), [MAO_DE_OBRA])).toBe(TEXTO_QUE_FECHA)
    })

    it('PREÇO AUSENTE NUNCA CHEGA À MENSAGEM (08/11/2026): um total de material nulo é defeito, e a frase LANÇA — nunca um preço parcial', () => {
        const r = resultadoQueFecha()
        for (const campo of ['total_por_barra_inteira', 'total_por_consumo_real'] as const) {
            const semUm = { ...r, total: { ...r.total, [campo]: null as number | null } }
            expect(() => M().fraseDoLevantamento(DADOS, semUm, [MAO_DE_OBRA])).toThrow('levantamento sem um dos totais de material')
        }
    })

    it('PREÇO AUSENTE na conversa (12/11/2026): o item sem o valor do metro fica FORA dos totais e é nomeado — o levantamento evolui', async () => {
        const item = banco.db.orcamentista_tabela_item.find((i) => i.codigo === '9641')!
        item.valor_metro_interno = null
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev({ escolhas: { ARI: 4, ARE: 1, MAE: 2 } }))
        expect(r.desfecho).toBe('levantou')
        expect(r.texto).toContain('Sem preço — fica fora dos totais, e o orçamento sai PARCIAL:')
        expect(r.texto).toContain('• HF88/WOLFF: o item 9641 da tabela de preço')
        expect(r.texto).toContain('sem o valor do metro.')
        expect(r.texto).not.toContain('• 9641 (HF88/WOLFF)')
        expect(r.etapa?.faltou).toEqual(['e1:SEM_VALOR:HF88/WOLFF'])
    })

    it('MÃO DE OBRA AUSENTE por CONFIGURAÇÃO da empresa (a falta de TEMPO recusa antes, desde 08/11/2026): a linha diz o que falta, e os totais com mão de obra NÃO saem — o material sai', () => {
        const texto = M().fraseDoLevantamento(DADOS, resultadoQueFecha(), [{ ok: false, falta: 'a carga horária mensal da empresa não está configurada', semTempo: false }])
        expect(texto).toContain('Mão de obra: não sai — a carga horária mensal da empresa não está configurada.')
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
        expect(semEtapa(r)).toEqual({ desfecho: 'levantou', texto: TEXTO_QUE_FECHA })
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
        // a recusa técnica do motor é frase inteira: vai depois do nome, sem a relação da esquadria (08/11/2026)
        expect(r.texto.startsWith('Não consegui fechar o levantamento “Casa do João”. ')).toBe(true)
        expect(r.texto).not.toContain('Arremate e guarnição')
        // R4 e a mudança de produto: a recusa nomeia a variável em português, nunca pelo código interno
        expect(r.texto).toContain('MEDIDA ARREMATE EXTERNO')
        expect(r.texto).not.toMatch(/\b(ARI|ARE|MAE|MAI)\b/)
        // com uma esquadria só, a falta vem sem o número dela
        expect(r.texto).not.toMatch(/Esquadrias? \d/)
    })

    it('o arremate interno de 70 mm (BZ1770) em BRANCO: a ponte não tem BRANCO, e o nome técnico acha o 90531 — o CÓDIGO afirma a cor (9053 + 1, BRANCO na tabela da Wolf), aceito pelo dono do produto em 12/11/2026', async () => {
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev({ escolhas: { ARI: 2, MAE: 2 } }))
        expect(r.desfecho).toBe('levantou')
        expect(r.texto).toContain('• 90531 (BZ1770/WOLFF)')
        expect(r.texto).not.toContain('PARCIAL')
        expect(r.texto).not.toMatch(/• 9053\d\d \(BZ1770/)
    })

    it('OUTRO DP: "a tipologia DP-01 não tem as abas do motor importadas"', async () => {
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev({ tipologia: 'DP-01' }))
        expect(semEtapa(r)).toEqual({
            desfecho: 'recusou',
            // sem as abas não há variável conhecida: a linha das escolhas não aparece
            texto: 'Não consegui fechar o levantamento “Casa do João”. A tipologia DP-01 não tem as abas do motor importadas (Variáveis, Fórmulas, Perfis): ainda não consigo calcular as barras dela.',
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
        expect(r.texto).toBe('Não consegui fechar o levantamento “Casa do João”. A largura da serra não está na base de conhecimento da empresa (categoria Perfil). Falta: a serra, em mm.')
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
        expect(r.texto).toBe('Não consegui fechar o levantamento “Casa do João”. Falta de configuração — a família PVC não tem nenhuma tabela de preço vigente: verifique o catálogo em Catálogo › Fornecedores.')
    })

    it('mais de 8 faltas: as 8 primeiras e a contagem do resto — nenhuma calada', () => {
        const faltas = Array.from({ length: 11 }, (_, k) => `o valor do código ${k + 1}`)
        const texto = M().fraseDaRecusa(DADOS, faltas)
        expect(texto.split('\n')[0]).toBe(`Não consegui fechar o levantamento “${DADOS.nome}”. Falta:`)
        expect(texto.split('\n').filter((l) => /^• o valor do código \d+\.$/.test(l))).toHaveLength(8)
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
        // `semTempo` (08/11/2026): só a falta do TEMPO recusa o levantamento; as da empresa seguem como "não sai"
        ['sem tempo de fabricação da tipologia', () => { banco.db.orcamentista_motor_tipologia_tempo = [] }, 'o tempo de fabricação de DP-02 não está cadastrado', true],
        ['a tabela dos tempos ainda não existe', () => { banco.ausentes.add('orcamentista_motor_tipologia_tempo') }, 'a tabela dos tempos de fabricação ainda não foi carregada no banco', true],
        ['sem carga horária', () => { banco.db.tenant_settings[0].monthly_workload = 0 }, 'a carga horária mensal da empresa não está configurada', false],
        // sem a linha, faltam DUAS coisas, e as duas saem — uma não esconde a outra
        ['sem tenant_settings', () => { banco.db.tenant_settings = [] }, 'o tipo de cálculo da empresa (industrialização, revenda ou serviço) não está configurado; a carga horária mensal da empresa não está configurada', false],
        ['sem custo de mão de obra produtiva', () => { banco.db.tenant_expense_config[0].production_labor_cost_hub = 0 }, 'o custo mensal da mão de obra produtiva da empresa não está configurado', false],
        ['sem tipo de cálculo', () => { banco.db.tenant_settings[0].calc_type = null }, 'o tipo de cálculo da empresa (industrialização, revenda ou serviço) não está configurado', false],
        ['empresa de REVENDA', () => { banco.db.tenant_settings[0].calc_type = 'REVENDA' }, 'a empresa está configurada como revenda, e na revenda o tempo de fabricação não entra no custo', false],
    ])('%s: a falta é NOMEADA — nunca zero', async (_nome, preparar, falta, semTempo) => {
        preparar()
        expect(await M().lerMaoDeObra(TENANT, MOTOR, 'DP-02', 1)).toEqual({ ok: false, falta, semTempo })
    })
})

describe('(7b) FALTOU TEMPO, NADA EVOLUI (dono do produto, 08/11/2026): a falta do tempo de fabricação recusa o levantamento — antes saía "não sai"', () => {
    const FECHA = { escolhas: { ARI: 4, ARE: 1, MAE: 2 } }

    it('sem o tempo da DP-02: RECUSA, nomeando a tipologia e o motor — nenhum R$ sai, e a falta é de CADASTRO', async () => {
        banco.db.orcamentista_motor_tipologia_tempo = []
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev(FECHA))
        const FALTA = 'o tempo de fabricação de DP-02 no motor Motor_Wolf_PVC'
        expect(r.desfecho).toBe('recusou')
        expect(r.texto).toBe(`Não consegui fechar o levantamento “Casa do João”. Falta: ${FALTA}.`)
        expect(r.texto).not.toMatch(/R\$/)
        expect(r.etapa?.faltou).toEqual(['e1:SEM_TEMPO:DP-02'])
    })

    it('a mesma tipologia sem tempo em DUAS esquadrias: uma falta, com as duas esquadrias', async () => {
        banco.db.orcamentista_motor_tipologia_tempo = []
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, { nome: 'Casa do João', itens: [{ ...ESQUADRIA, ...FECHA }, { ...ESQUADRIA, ...FECHA, ordem: 2, quantidade: 2 }] })
        expect(r.texto).toBe('Não consegui fechar o levantamento “Casa do João”. Falta: o tempo de fabricação de DP-02 no motor Motor_Wolf_PVC (esquadrias 1 e 2).')
        expect(r.etapa?.faltou).toEqual(['e1+e2:SEM_TEMPO:DP-02'])
    })

    it('a tabela dos tempos ausente: a mesma recusa, dizendo que é a tabela', async () => {
        banco.ausentes.add('orcamentista_motor_tipologia_tempo')
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev(FECHA))
        expect(r.texto).toBe('Não consegui fechar o levantamento “Casa do João”. Falta: a tabela dos tempos de fabricação, com o tempo de DP-02: a tabela dos tempos de fabricação ainda não foi carregada no banco.')
    })

    it('a falta da CONFIGURAÇÃO da empresa (carga horária) continua como antes: não é recusa — o material sai, e a mão de obra "não sai"', async () => {
        banco.db.tenant_settings[0].monthly_workload = 0
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev(FECHA))
        expect(r.desfecho).toBe('levantou')
        expect(r.texto).toContain('Mão de obra: não sai — a carga horária mensal da empresa não está configurada.')
        expect(r.texto).not.toContain('Não consegui fechar')
    })
})

describe('(8) a COR é a da pré-definição, comparada SEM CAIXA (e só sem caixa) com a coluna cor do motor', () => {
    it('em BRANCO, a DP-02 fecha — e o cabeçalho diz BRANCO', async () => {
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev({ escolhas: { ARI: 4, ARE: 1, MAE: 2 } }))
        expect(semEtapa(r)).toEqual({ desfecho: 'levantou', texto: TEXTO_QUE_FECHA })
    })

    it('em PRETO TEXTURADO, os perfis que só existem em BRANCO são FALTA nomeada com a cor — nenhuma cor parecida entra, nenhum código branco sai', async () => {
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev({ cor_perfil: 'PRETO TEXTURADO', escolhas: { ARI: 4, ARE: 1, MAE: 2 } }))
        expect(r.desfecho).toBe('levantou')
        expect(r.texto).toContain('Sem preço — fica fora dos totais, e o orçamento sai PARCIAL:')
        expect(r.texto).toMatch(/• HF88\/WOLFF \([^)]*\) em PRETO TEXTURADO /)
        // os brancos não entram nas barras
        for (const c of ['9641', '9681', '9711', '9801', '10511']) expect(r.texto).not.toContain(`• ${c} (`)
        // o sem variante (cor vazia) segue
        expect(r.texto).toContain('• 1023 (1023/WOLFF)')
    })

    it('"Branco" (a grafia da lista da base) casa com BRANCO do motor — o defeito do “Gerson Boss”, 08/11/2026: o mesmo levantamento, com o cabeçalho na grafia gravada', async () => {
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev({ cor_perfil: 'Branco', escolhas: { ARI: 4, ARE: 1, MAE: 2 } }))
        expect(r.desfecho).toBe('levantou')
        expect(semEtapa(r).texto).toBe(TEXTO_QUE_FECHA.replace('perfil BRANCO', 'perfil Branco'))
    })

    it('SEM COR na pré-definição: a recusa diz que falta a cor do perfil', async () => {
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev({ cor_perfil: null, escolhas: { ARI: 4, ARE: 1, MAE: 2 } }))
        expect(r.desfecho).toBe('recusou')
        expect(r.texto).toBe('Não consegui fechar o levantamento “Casa do João”. Falta: a cor do perfil.')
        // o resumo para o log (06/11/2026): o código da falta, e nada cortado
        expect(r.etapa).toEqual({ esquadrias: 1, pecas: null, barras: null, codigos: null, semPreco: null, maoDeObra: null, faltou: ['e1:SEM_COR'] })
    })

    it('O RESUMO DO CÁLCULO para o log por etapa (06/11/2026): o que fecha conta peças, barras, códigos e a mão de obra; nunca um valor em reais', async () => {
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, lev({ cor_perfil: 'BRANCO', escolhas: { ARI: 4, ARE: 1, MAE: 2 } }))
        expect(r.desfecho).toBe('levantou')
        expect(r.etapa).toEqual({ esquadrias: 1, pecas: 40, barras: 9, codigos: 8, semPreco: 0, maoDeObra: 'ok', faltou: [] })
        // só contagens e códigos: nenhum número do resumo é dinheiro
        expect(JSON.stringify(r.etapa)).not.toMatch(/R\$|,\d{2}\b/)
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
        const texto = M().fraseDoLevantamento(dados, resultadoDeUma(), [MAO_DE_OBRA, { ok: false, falta: 'a carga horária mensal da empresa não está configurada', semTempo: false }])
        expect(texto).toContain('Mão de obra da esquadria 2: não sai — a carga horária mensal da empresa não está configurada.')
        expect(texto).toContain('Total por consumo real (perfis + mão de obra): não sai — falta a mão de obra.')
    })

    it('CORES DIFERENTES no mesmo levantamento: recusa nomeada, com a cor de cada esquadria', async () => {
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, {
            nome: 'Casa do João',
            itens: [{ ...ESQUADRIA, escolhas: { ARI: 4, ARE: 1, MAE: 2 } }, { ...ESQUADRIA, ordem: 2, cor_perfil: 'PRETO TEXTURADO', escolhas: { ARI: 4, ARE: 2 } }],
        })
        expect(r.desfecho).toBe('recusou')
        expect(r.texto).toBe('Não consegui fechar o levantamento “Casa do João”. Falta: uma cor só para o perfil: as esquadrias têm cores diferentes (esquadria 1: BRANCO; esquadria 2: PRETO TEXTURADO), e ainda não calculo um levantamento com cores misturadas.')
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
        expect(semEtapa(antes)).toEqual({ desfecho: 'levantou', texto: TEXTO_QUE_FECHA })
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
        expect(semEtapa(r)).toEqual({ desfecho: 'levantou', texto: `${TEXTO_QUE_FECHA}\n\n${M().fraseDasFormulasDaLinha('DP-02', 'EUROPA 42')}` })
        expect(M().fraseDasFormulasDaLinha('DP-02', 'EUROPA 42')).toBe(
            'Atenção: as fórmulas da DP-02 são as da LINHA EUROPA 42 (fallback) — a tipologia não tem fórmulas próprias na aba "Fórmulas" do arquivo do fornecedor.')
    })

    it('COM fórmulas próprias, as da linha NÃO são lidas nem citadas — mesmo que existam', async () => {
        banco.db.orcamentista_motor_formula_familia = comoDaLinha('EUROPA 42').map((l) => ({ ...l, formula: '(L+5000)' }))
        const r = await levantar()
        expect(semEtapa(r)).toEqual({ desfecho: 'levantou', texto: TEXTO_QUE_FECHA })
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

/**
 * (R) A FRASE CURTA DA FALTA — o caso real "Renan Bauer" (dono do produto, 08/11/2026). A mensagem de 15:58:36 UTC repetia, para cada
 * esquadria, a relação inteira ("Arremate e guarnição — arremate interno: BZ0006…"), e a falta do baguete despejava os códigos e os pares
 * repetidos ("GB25/WOLFF: 5,6,8; GB25/WOLFF: 5,6,8; GB8/WOLFF: …"). O formato novo: "Não consegui fechar o levantamento <nome>. Falta: <o que
 * falta>." — e a mesma falta em várias esquadrias é UMA linha, com as esquadrias entre parênteses.
 */
describe('(R) a frase curta da falta: o nome e o que falta, e a mesma falta uma vez só', () => {
    const tres = (vidros: string[]) => ({ nome: 'Renan Bauer', itens: vidros.map((vidro, k) => ({ ...ESQUADRIA, ...FECHA_R, ordem: k + 1, vidro })) })
    const FECHA_R = { escolhas: { ARI: 4, ARE: 1, MAE: 2 } }

    it('O CASO REAL: a DP-02 com o vidro de 4 mm — a falta diz, na linguagem do vendedor, que o 4 mm não é aceito e quais espessuras são; sem códigos de baguete, sem a relação', async () => {
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, { nome: 'Renan Bauer', itens: [{ ...ESQUADRIA, ...FECHA_R, vidro: 'incolor 4 mm comum' }] })
        expect(r.desfecho).toBe('recusou')
        // a falta curta e, em uma linha, o CAMINHO que a resolve (08/11/2026): o vidro que ele disse, com a menor espessura aceita acima dos 4 mm
        expect(r.texto).toBe([
            'Não consegui fechar o levantamento “Renan Bauer”. Falta: o vidro de 4 mm não é aceito nesta tipologia; as espessuras disponíveis são 5, 6, 8, 18, 20, 21 e 24 mm.',
            'Para trocar, diga: muda o vidro da esquadria 1 para incolor 5 mm comum.',
        ].join('\n'))
        expect(r.texto).not.toContain('GB25')
        expect(r.texto).not.toContain('Arremate e guarnição')
        expect(r.etapa?.faltou).toEqual(['e1:NENHUM_BAGUETE_PARA_A_ESPESSURA'])
        // o contraste: com 6 mm a mesma esquadria fecha
        expect((await M().mensagemDoLevantamento(TENANT, t, { nome: 'Renan Bauer', itens: [{ ...ESQUADRIA, ...FECHA_R, vidro: 'incolor 6 mm' }] })).desfecho).toBe('levantou')
    })

    // O CASO "Antonio Rock" (08/11/2026): o vidro "incolor 4", lido pelo leitor canônico com as espessuras que os baguetes da DP-02 aceitam
    const comO4NoMotor = () => { for (const p of banco.db.orcamentista_motor_perfil) if (p.tipologia === 'DP-02' && p.esp_vidro === '5,6,8') p.esp_vidro = '4,5,6,8' }

    it('ANTONIO ROCK: "incolor 4" com o motor que aceita 4 (GB25 4,5,6,8 e GB8 18,20,21,24) — o 4 sem unidade é a espessura, e o levantamento fecha', async () => {
        comO4NoMotor()
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, { nome: 'Antonio Rock', itens: [{ ...ESQUADRIA, ...FECHA_R, vidro: 'incolor 4' }] })
        expect(r.texto).not.toContain('Falta')
        expect(r.desfecho).toBe('levantou')
    })

    it('ANTONIO ROCK no motor de antes (sem o 4): o 4 sem unidade não vale, falta a espessura — e o caminho é "incolor 5 mm", nunca "incolor 4 5 mm"', async () => {
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, { nome: 'Antonio Rock', itens: [{ ...ESQUADRIA, ...FECHA_R, vidro: 'incolor 4' }] })
        expect(r.texto).toBe([
            'Não consegui fechar o levantamento “Antonio Rock”. Falta: a espessura do vidro: os baguetes desta tipologia dependem dela, e aceitam 5, 6, 8, 18, 20, 21 e 24 mm.',
            'Para trocar, diga: muda o vidro da esquadria 1 para incolor 5 mm.',
        ].join('\n'))
        // seguido ao pé da letra, fecha
        expect((await M().mensagemDoLevantamento(TENANT, t, { nome: 'Antonio Rock', itens: [{ ...ESQUADRIA, ...FECHA_R, vidro: 'incolor 5 mm' }] })).desfecho).toBe('levantou')
    })

    it('os DOIS conjuntos de baguete da DP-02 valem para o número sem unidade: "laminado 20" é do GB8 (18,20,21,24), e a espessura não falta', async () => {
        comO4NoMotor()
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, { nome: 'Antonio Rock', itens: [{ ...ESQUADRIA, ...FECHA_R, vidro: 'laminado 20' }] })
        expect(r.texto).not.toContain('a espessura do vidro')
        expect(r.texto).not.toContain('não é aceito')
        // e o 4, do GB25, também
        expect((await M().mensagemDoLevantamento(TENANT, t, { nome: 'Antonio Rock', itens: [{ ...ESQUADRIA, ...FECHA_R, vidro: 'incolor 4' }] })).texto).not.toContain('a espessura do vidro')
    })

    it('o vidro AMBÍGUO ("incolor 4 ou 6", os dois aceitos): a falta pergunta qual, sem caminho inventado', async () => {
        comO4NoMotor()
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, { nome: 'Antonio Rock', itens: [{ ...ESQUADRIA, ...FECHA_R, vidro: 'incolor 4 ou 6' }] })
        expect(r.desfecho).toBe('recusou')
        expect(r.texto).toBe('Não consegui fechar o levantamento “Antonio Rock”. Falta: a espessura do vidro: “incolor 4 ou 6” pode ser 4 ou 6 mm; diga qual.')
        expect(r.texto).not.toContain('Para trocar')
    })

    it('TRÊS esquadrias com o mesmo vidro que o motor não aceita: UMA linha, dizendo quais — e a que tem vidro aceito não entra na lista', async () => {
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const todas = await M().mensagemDoLevantamento(TENANT, t, tres(['4mm', '4 mm', 'vidro 4mm']))
        // uma falta só; os caminhos, um por vidro sugerido — as esquadrias com o mesmo vidro numa frase só
        expect(todas.texto).toBe([
            'Não consegui fechar o levantamento “Renan Bauer”. Falta: o vidro de 4 mm não é aceito nesta tipologia; as espessuras disponíveis são 5, 6, 8, 18, 20, 21 e 24 mm (esquadrias 1, 2 e 3, DP-02).',
            'Para trocar, diga: muda o vidro das esquadrias 1 e 2 para 5 mm.',
            'Para trocar, diga: muda o vidro da esquadria 3 para vidro 5 mm.',
        ].join('\n'))
        const duas = await M().mensagemDoLevantamento(TENANT, t, tres(['4mm', '6mm', '4mm']))
        expect(duas.texto).toBe([
            'Não consegui fechar o levantamento “Renan Bauer”. Falta: o vidro de 4 mm não é aceito nesta tipologia; as espessuras disponíveis são 5, 6, 8, 18, 20, 21 e 24 mm (esquadrias 1 e 3, DP-02).',
            'Para trocar, diga: muda o vidro das esquadrias 1 e 3 para 5 mm.',
        ].join('\n'))
    })

    it('O MESMO MATERIAL sem preço em três esquadrias: UMA linha de falta, com as três — um cadastro resolve as três (e o levantamento evolui, 12/11/2026)', async () => {
        banco.db.orcamentista_tabela_item = banco.db.orcamentista_tabela_item.filter((i) => i.codigo !== '1023')
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, tres(['6mm', '6mm', '6mm']))
        expect(r.desfecho).toBe('levantou')
        const linhas = r.texto.split('\n').filter((l) => l.startsWith('• 1023/WOLFF'))
        expect(linhas).toHaveLength(1)
        expect(linhas[0]).toMatch(/\(esquadrias 1, 2 e 3\)\.$/)
        // a falta é do cadastro: nenhum caminho de alteração
        expect(r.texto).not.toContain('Para trocar')
    })

    it('A RECUSA (o vidro que a tipologia não aceita) vence a falta de preço: o levantamento não evolui, e a recusa sai com o caminho', async () => {
        banco.db.orcamentista_tabela_item = banco.db.orcamentista_tabela_item.filter((i) => i.codigo !== '1023')
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, tres(['6mm', '4mm', '6mm']))
        expect(r.desfecho).toBe('recusou')
        expect(r.texto.split('\n')).toEqual([
            'Não consegui fechar o levantamento “Renan Bauer”. Falta: o vidro de 4 mm não é aceito nesta tipologia; as espessuras disponíveis são 5, 6, 8, 18, 20, 21 e 24 mm (esquadria 2, DP-02).',
            'Para trocar, diga: muda o vidro da esquadria 2 para 5 mm.',
        ])
    })

    it('o vidro SEM ESPESSURA dita ("mini boreal") numa DP-02: UMA falta curta — era uma linha técnica por baguete —, e o caminho com o vidro dito e uma espessura aceita', async () => {
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, { nome: 'Renan Bauer', itens: [{ ...ESQUADRIA, ...FECHA_R, vidro: 'mini boreal' }] })
        expect(r.texto).toBe([
            'Não consegui fechar o levantamento “Renan Bauer”. Falta: a espessura do vidro: os baguetes desta tipologia dependem dela, e aceitam 5, 6, 8, 18, 20, 21 e 24 mm.',
            'Para trocar, diga: muda o vidro da esquadria 1 para mini boreal 5 mm.',
        ].join('\n'))
        expect(r.texto).not.toMatch(/Linha \d+ da aba Perfis/)
        // seguido ao pé da letra, fecha
        expect((await M().mensagemDoLevantamento(TENANT, t, { nome: 'Renan Bauer', itens: [{ ...ESQUADRIA, ...FECHA_R, vidro: 'mini boreal 5 mm' }] })).desfecho).toBe('levantou')
    })

    it('vidroComEspessura e espessuraSugerida: troca a espessura dita, acrescenta a que faltava; sugere a menor aceita não menor que a pedida', () => {
        expect(VI().vidroComEspessura('temperado incolor 4mm', 5)).toBe('temperado incolor 5 mm')
        expect(VI().vidroComEspessura('incolor 4,5 mm comum', 6)).toBe('incolor 6 mm comum')
        expect(VI().vidroComEspessura('mini boreal', 5)).toBe('mini boreal 5 mm')
        expect(VI().vidroComEspessura(null, 8)).toBe('8 mm')
        expect(VI().vidroComEspessura('  ', 6.5)).toBe('6,5 mm')
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const B = require('@/lib/atendimentos-ia/levantamento-de-barras') as typeof import('@/lib/atendimentos-ia/levantamento-de-barras')
        expect(B.espessuraSugerida(4, [18, 5, 6, 8])).toBe(5)
        expect(B.espessuraSugerida(6, [5, 6, 8])).toBe(6)
        expect(B.espessuraSugerida(7, [5, 6, 8])).toBe(8)
        expect(B.espessuraSugerida(30, [5, 6, 8, 24])).toBe(24)
        expect(B.espessuraSugerida(null, [8, 5])).toBe(5)
        expect(B.espessuraSugerida(4, [])).toBeNull()
    })

    it('fraseDaRecusa: a falta curta vai depois de "Falta:"; a frase de configuração, inteira, vai como está — nunca "Falta: falta de"', () => {
        expect(M().fraseDaRecusa(DADOS, ['o valor da barra do código 9641'])).toBe(`Não consegui fechar o levantamento “${DADOS.nome}”. Falta: o valor da barra do código 9641.`)
        expect(M().fraseDaRecusa(DADOS, ['Falta de configuração — a família PVC não tem etapa.'])).toBe(`Não consegui fechar o levantamento “${DADOS.nome}”. Falta de configuração — a família PVC não tem etapa.`)
        expect(M().fraseDaRecusa(DADOS, ['a cor do perfil (esquadria 1)', 'A largura da serra não está na base.'])).toBe(
            `Não consegui fechar o levantamento “${DADOS.nome}”. Falta:\n• a cor do perfil (esquadria 1).\n• A largura da serra não está na base.`)
        expect(M().esquadriasDaFalta([3], 1)).toBe('')
        expect(M().esquadriasDaFalta([3], 3)).toBe(' (esquadria 3)')
        expect(M().esquadriasDaFalta([1, 2, 3], 3, 'DP-02')).toBe(' (esquadrias 1, 2 e 3, DP-02)')
    })

    it('a esquadria SEM COR num levantamento de várias: a falta diz qual é', async () => {
        const t = await M().lerFamiliasDaEmpresa(TENANT)
        const r = await M().mensagemDoLevantamento(TENANT, t, { nome: 'Renan Bauer', itens: [{ ...ESQUADRIA, ...FECHA_R }, { ...ESQUADRIA, ...FECHA_R, ordem: 2, cor_perfil: null }] })
        expect(r.texto).toBe('Não consegui fechar o levantamento “Renan Bauer”. Falta: a cor do perfil (esquadria 2).')
    })

    it('faltaDoVidroSemBaguete: as espessuras distintas e em ordem, por extenso com vírgula decimal; uma só no singular', () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const A = require('@/lib/atendimentos-ia/avaliador-de-formulas') as typeof import('@/lib/atendimentos-ia/avaliador-de-formulas')
        expect(A.faltaDoVidroSemBaguete(4, [18, 20, 5, 6, 8, 5, 6, 8, 21, 24])).toBe('o vidro de 4 mm não é aceito nesta tipologia; as espessuras disponíveis são 5, 6, 8, 18, 20, 21 e 24 mm')
        expect(A.faltaDoVidroSemBaguete(6.5, [10, 12])).toBe('o vidro de 6,5 mm não é aceito nesta tipologia; as espessuras disponíveis são 10 e 12 mm')
        expect(A.faltaDoVidroSemBaguete(4, [6])).toBe('o vidro de 4 mm não é aceito nesta tipologia; a espessura disponível é 6 mm')
        expect(A.fraseDoVidroSemBaguete(4, [8, 5])).toBe('O vidro de 4 mm não é aceito nesta tipologia; as espessuras disponíveis são 5 e 8 mm.')
    })
})

describe('(ORC) o custo do orçamento I.A. pelo CAMINHO COMPLETO, e a reconciliação da D2 sobre ele (dono do produto, 09/11/2026)', () => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const S = () => require('@/lib/atendimentos-ia/custo-do-orcamento-servidor') as typeof import('@/lib/atendimentos-ia/custo-do-orcamento-servidor')
    const C = () => require('@/lib/atendimentos-ia/custo-do-orcamento') as typeof import('@/lib/atendimentos-ia/custo-do-orcamento')
    const PE = () => require('@/utils/pricing-engine') as typeof import('@/utils/pricing-engine')
    /* eslint-enable @typescript-eslint/no-require-imports */
    const ESCOLHAS = { ARI: 4, ARE: 1, MAE: 2 }
    const duas = () => ({ nome: 'Casa do João', itens: [{ ...ESQUADRIA, escolhas: ESCOLHAS }, { ...ESQUADRIA, ordem: 2, largura_mm: 800, altura_mm: 600, quantidade: 2, escolhas: ESCOLHAS }] })
    const reais = (t: string, rotulo: string) => Number((t.split('\n').find((l) => l.startsWith(rotulo)) ?? '').replace(/^.*R\$ /, '').replace(/\.$/, '').replace(/\./g, '').replace(',', '.'))
    const custoOk = async (l: { nome: string; itens: (typeof ESQUADRIA)[] }) => {
        const r = await S().custoDoLevantamento(TENANT, await M().lerFamiliasDaEmpresa(TENANT), l)
        if ('recusas' in r) throw new Error('recusou: ' + r.recusas.join(' | '))
        return r
    }
    /** A precificação final pelo motor da tela: o custo líquido dos materiais e os minutos somados (D2), e a mão de obra da empresa. */
    const doMotor = (r: Awaited<ReturnType<typeof custoOk>>) => {
        const e = C().entradaDaPrecificacao(r.itens)
        return PE().calculatePricing({
            calcType: 'INDUSTRIALIZACAO', totalItemsCost: e.totalItemsCost, yieldQuantity: 1,
            laborCostMonthly: r.maoDeObra.custoMensal, numProductiveEmployees: 5, monthlyWorkloadMinutes: r.maoDeObra.minutosDaEmpresa,
            productWorkloadMinutes: e.productWorkloadMinutes, structurePct: 0.2, taxPct: 0.1, commissionPct: 0.05, profitPct: 0.1,
        })
    }

    it('uma esquadria: o bruto do item é o "perfis por barra inteira" da conversa, e a fabricação é a mão de obra dela', async () => {
        const l = lev({ escolhas: ESCOLHAS })
        const r = await custoOk(l)
        expect(r.itens).toHaveLength(1)
        expect(r.itens[0].custo_bruto_materiais).toBeCloseTo(1342.09, 2)
        expect(r.itens[0].custo_fabricacao).toBeCloseTo(150 * (40813.03 / 158400), 10)
        expect(Math.abs(r.itens[0].custo_fabricacao - 38.65)).toBeLessThanOrEqual(0.005)
        expect(r.maoDeObra).toEqual({ custoMensal: 40813.03, minutosDaEmpresa: 158400, valorDoMinuto: 40813.03 / 158400 })
    })

    it('duas esquadrias: a soma dos brutos é o "perfis por barra inteira" que a CONVERSA dá ao mesmo levantamento — o mesmo cálculo', async () => {
        const l = duas()
        const r = await custoOk(l)
        const m = await M().mensagemDoLevantamento(TENANT, await M().lerFamiliasDaEmpresa(TENANT), l)
        expect(m.desfecho).toBe('levantou')
        const soma = r.itens.reduce((t, i) => t + i.custo_bruto_materiais, 0)
        expect(soma).toBeCloseTo(reais(m.texto, 'Perfis por barra inteira'), 2)
        // a quantidade do item 2 (2 unidades) está no tempo dele, e o rateio dá mais ao item que consome mais
        expect(r.itens[1].tempo_fabricacao_min).toBe(300)
        expect(r.itens.every((i) => i.custo_bruto_materiais > 0)).toBe(true)
    })

    it('com o bloco da tabela de hoje (nenhum crédito, o par do IPI desconhecido): o líquido é o bruto, e toda linha nomeia os três', async () => {
        const r = await custoOk(lev({ escolhas: ESCOLHAS }))
        expect(r.itens[0].custo_liquido_materiais).toBeCloseTo(r.itens[0].custo_bruto_materiais, 9)
        expect(r.itens[0].materiais.every((x) => x.credito_nao_apurado === 'faltou no bloco tributario: cred_icms_pct, cred_pis_cofins_pct, o par do IPI (cred_ipi_pct ou nc_ipi_pct)')).toBe(true)
    })

    it('com o bloco preenchido (12 + 9,25, IPI creditável 0, IBS e CBS nulos): a cascata cheia, 20,14% sobre o bruto', async () => {
        for (const i of banco.db.orcamentista_tabela_item) Object.assign(i, { cred_icms_pct: 12, cred_pis_cofins_pct: 9.25, cred_ipi_pct: 0, nc_ipi_pct: null, cred_ibs_pct: null, cred_cbs_pct: null })
        const r = await custoOk(lev({ escolhas: ESCOLHAS }))
        expect(r.itens[0].custo_liquido_materiais).toBeCloseTo(r.itens[0].custo_bruto_materiais * (1 - 0.2014), 6)
        expect(r.itens[0].materiais.every((x) => x.credito_nao_apurado === null)).toBe(true)
    })

    it.each([
        ['uma esquadria, sem crédito', () => lev({ escolhas: ESCOLHAS }), false],
        ['duas esquadrias, sem crédito', duas, false],
        ['duas esquadrias, com a cascata cheia', duas, true],
    ])('RECONCILIAÇÃO (%s): soma(líquido + fabricação) == custo + mão de obra da precificação final, ao centavo', async (_, l, comBloco) => {
        if (comBloco) for (const i of banco.db.orcamentista_tabela_item) Object.assign(i, { cred_icms_pct: 12, cred_pis_cofins_pct: 9.25, cred_ipi_pct: 0, nc_ipi_pct: null })
        const r = await custoOk(l())
        const motor = doMotor(r)
        expect(motor.isValid).toBe(true)
        // o motor arredonda o custo e a mão de obra ao centavo (pricing-engine.ts:547-556); a soma das linhas, não
        expect(Math.abs(motor.cmvUnit - C().somaDosItens(r.itens))).toBeLessThanOrEqual(0.01)
        expect(Math.abs(motor.productiveLaborCost - r.itens.reduce((t, i) => t + i.custo_fabricacao, 0))).toBeLessThanOrEqual(0.005)
    })

    it('CONTRASTE do caminho completo: a fabricação somada no custo quebra a reconciliação pela fabricação inteira', async () => {
        const r = await custoOk(duas())
        const errado = PE().calculatePricing({
            calcType: 'INDUSTRIALIZACAO', totalItemsCost: C().somaDosItens(r.itens), yieldQuantity: 1,
            laborCostMonthly: r.maoDeObra.custoMensal, numProductiveEmployees: 5, monthlyWorkloadMinutes: r.maoDeObra.minutosDaEmpresa,
            productWorkloadMinutes: C().entradaDaPrecificacao(r.itens).productWorkloadMinutes, structurePct: 0.2, taxPct: 0.1, commissionPct: 0.05, profitPct: 0.1,
        })
        const fabricacao = r.itens.reduce((t, i) => t + i.custo_fabricacao, 0)
        expect(errado.cmvUnit - C().somaDosItens(r.itens)).toBeCloseTo(fabricacao, 1)
    })

    it('a família sem etapa de cálculo: recusa nomeada — o orçamento não tem custo sem as barras e a mão de obra', async () => {
        banco.db.orcamentista_familia_etapa = banco.db.orcamentista_familia_etapa.filter((e) => e.etapa_catalogo_id !== ITEM_DO_CALCULO)
        const r = await S().custoDoLevantamento(TENANT, await M().lerFamiliasDaEmpresa(TENANT), lev({ escolhas: ESCOLHAS }))
        expect('recusas' in r && r.recusas).toEqual([S().fraseDaFamiliaSemCalculo('PVC')])
    })
    it('sem a configuração de mão de obra da empresa: a conversa fecha (a linha da mão de obra "não sai"), mas o orçamento recusa — sem valor do minuto, nunca 0', async () => {
        banco.db.tenant_expense_config = []
        const l = lev({ escolhas: ESCOLHAS })
        const m = await M().mensagemDoLevantamento(TENANT, await M().lerFamiliasDaEmpresa(TENANT), l)
        expect(m.desfecho).toBe('levantou')
        const r = await S().custoDoLevantamento(TENANT, await M().lerFamiliasDaEmpresa(TENANT), l)
        expect('recusas' in r && r.recusas).toContain('o valor do minuto da mão de obra: a configuração de mão de obra da empresa não fecha')
    })
    it('a leitura do item da tabela pede o bloco tributário pelos NOMES da tabela, e NÃO a coluna antiga `ipi`', () => {
        const colunas = M().COLUNAS_DO_ITEM_DA_TABELA.split(',').map((c) => c.trim())
        for (const p of C().PERCENTUAIS) expect(colunas).toContain(p)
        expect(colunas).toContain('unidade')
        expect(colunas).not.toContain('ipi')
    })
    it('nada evolui com falta: a recusa do levantamento é a frase que o vendedor leria, e nenhum item sai custeado', async () => {
        banco.db.orcamentista_motor_tipologia_tempo = []
        const l = lev({ escolhas: ESCOLHAS })
        const r = await S().custoDoLevantamento(TENANT, await M().lerFamiliasDaEmpresa(TENANT), l)
        const m = await M().mensagemDoLevantamento(TENANT, await M().lerFamiliasDaEmpresa(TENANT), l)
        expect(m.desfecho).toBe('recusou')
        expect('recusas' in r && r.recusas).toEqual([m.texto])
    })
})
