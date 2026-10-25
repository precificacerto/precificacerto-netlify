/**
 * @jest-environment node
 *
 * PORTÃO — o LEVANTAMENTO POR NOME no WhatsApp (`src/lib/atendimentos-ia/conversa-da-ia.ts`), pela
 * rota de entrada (`/api/atendimentos-ia/inbound`). A Anthropic e o WUZAPI são FALSOS (um `fetch` que
 * roteia pela URL e registra cada chamada); o banco é falso, em memória, registra cada escrita e
 * projeta as colunas do select como o PostgREST.
 *
 * A ARQUITETURA (dono do produto, 25/10/2026): o LEVANTAMENTO é a entidade, achado pelo NOME, de um
 * remetente. A conversa deixa de ser identidade de qualquer coisa:
 *   - com um levantamento EM_MONTAGEM do remetente, a mensagem continua nele — é isso que faz a resposta a
 *     uma pergunta em aberto cair no lugar;
 *   - sem ele: nome que não existe → NOVO; nome que existe (sem caixa e sem acento) → ALTERAÇÃO, e o
 *     trajeto INTEIRO é refeito; nome ausente, parcial ou parecido → a IA PERGUNTA;
 *   - nenhuma linha nova em `orcamentista_mensagem` nem em `orcamentista_conversa`, e nada em
 *     `orcamentista_pre_definicao`: o estado mora no levantamento;
 *   - remetente autorizado é SEMPRE respondido; silêncio só para o desconhecido.
 *
 * DECISÃO 2, REVISTA (dono do produto, 25/10/2026): altera um levantamento (a) o vendedor que o criou e
 * (b) quem é admin NA EMPRESA (`users.role = 'admin'`, pela cadeia remetente → employees → users, com
 * falha fechada). O nome continua único por vendedor: o admin pode achar o mesmo nome em dois
 * vendedores, e então PERGUNTA de qual. Quem não é admin e pede para alterar um nome que não é dele
 * recebe "não encontrei um levantamento seu com esse nome" — a MESMA frase exista ou não o levantamento
 * de outro vendedor. Bloco (12).
 *
 * O ARREMATE (dono do produto, 25/10/2026): o padrão da tipologia é ASSUMIDO e confirmado ("Considerando
 * guarnição e arremate padrão, certo!"), nunca perguntado; ARI, ARE, MAE e número de opção são vocabulário
 * interno e não aparecem em resposta nenhuma. Só quando o vendedor pede outro arremate as opções são
 * mostradas, por extenso.
 *
 * O PADRÃO DA DP-02 FECHA EM BRANCO desde as decisões do dono do produto de 25/10/2026: a opção sem
 * colchete e sem acréscimo no nome ("MEDIDA DO VÃO") vale 0 mm, e o perfil com uma variante só no motor
 * (o BZ0012, 'CLICK') usa essa variante. Antes delas, o aceite 1 era recusa nomeada.
 *
 * O TESTE QUE VALE (dono do produto): pedidos seguidos do MESMO telefone, todos respondidos — "Casa do
 * João", "Obra Centro", a alteração por "casa do joao" — e "Casa do João 2", que tem de PERGUNTAR.
 * Está no bloco (1), na ordem.
 */
import type { NextApiRequest, NextApiResponse } from 'next'

type Linha = Record<string, unknown>

const SEGREDO = '0123456789abcdef0123456789abcdef'
const TOKEN = 'orc_TOKEN_DA_CONEXAO_9f8e7d'
const TENANT = 'tenant-da-conexao'
const VENDEDOR = 'remetente-1'
const OUTRO_VENDEDOR = 'remetente-2'
const TERCEIRO = 'remetente-3'
const TELEFONE_DO_WEBHOOK = '555199114290'
const TELEFONE_GRAVADO = '51999114290'
const TELEFONE_DO_OUTRO = '555188887777'
const TELEFONE_DO_TERCEIRO = '555177776666'
const CHAVE = 'sk-ant-CHAVE-DE-TESTE-nao-pode-ir-ao-log'
const ANTHROPIC = 'https://api.anthropic.com/v1/messages'
const TABELA = '72366020-57c9-489f-9385-397b7fa3dedb'
const CANDIDATAS = [
    { tabela_id: TABELA, tipologia: 'DP-01', descricao: 'MAXIM-AR COM "N" MÓDULOS HORIZONTAIS E 01 MÓDULO VERTICAL | DESIGN', tipo: 'Maxim-ar' },
    { tabela_id: TABELA, tipologia: 'DP-02', descricao: 'JANELA DE CORRER 02 FOLHAS MÓVEIS | EUROPA 42', tipo: 'Correr' },
]
/* eslint-disable @typescript-eslint/no-require-imports */
const DE_PARA = require('./fixtures/fixture_de-para_DP-02.json') as { regras: Linha[]; itens: Linha[] }
/* eslint-enable @typescript-eslint/no-require-imports */

/** A esquadria do aceite: DP-02, 1200 x 1000, branco, temperado 5 mm. */
const DP02 = { tipologia: 'DP-02', largura_mm: 1200, altura_mm: 1000, quantidade: 1, cor_perfil: 'BRANCO', vidro: 'Temperado 5mm' }
/** A pergunta do vidro: o campo que falta nos casos de montagem. */
const PERGUNTA_DO_VIDRO = 'Qual o vidro?'
/** O que nenhuma resposta ao vendedor pode conter: o vocabulário interno do arremate e a opção numerada. */
const VOCABULARIO_INTERNO = /\b(ARI|ARE|MAE|MAI|MTE)\b|qual opção\?|\b\d+ = /

/**
 * O levantamento que fecha, inteiro — os números são os da conta à mão do portão da ligação, com o
 * tempo de produção (300 min, ESTIMADO) e os números do tenant ativo para a mão de obra.
 */
const LEVANTAMENTO_CASA_DO_JOAO = [
    'Considerando o arremate que você pediu, e o padrão no que não foi dito, certo!',
    '',
    'Levantamento “Casa do João”, perfil BRANCO.',
    'Esquadria 1: DP-02, 1.200 x 1.000 mm, 1 unidade(s).',
    'Arremate e guarnição — arremate interno: SEM ARREMATE INTERNO (como você pediu); arremate externo: BZ0010 - ARREMATE 20MM (padrão); '
        + 'medida arremate externo: VÃO+50MM (CORTE 90/90) - PARA AJUSTE EM OBRA (como você pediu).',
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
    'Mão de obra: 300 min por unidade (ESTIMADO) × 1 unidade(s), a R$ 0,257658 o minuto (R$ 40.813,03 ÷ 158.400 min): R$ 77,30.',
    '',
    'Total por barra inteira (perfis + mão de obra): R$ 1.419,39.',
    'Total por consumo real (perfis + mão de obra): R$ 907,09.',
    '',
    'O que este preço cobre: os perfis (o baguete incluído), pela tabela do fornecedor, e a mão de obra. NÃO cobre o vidro nem os insumos e acessórios (ferragens, escovas, calços e outros): eles ainda não estão na base.',
].join('\n')

const estado = {
    db: {} as Record<string, Linha[]>,
    escritas: [] as Array<{ tabela: string; op: string; carga: unknown }>,
    respostasDaLlm: [] as Array<{ status: number; corpo: unknown } | 'lanca'>,
    chamadasDaLlm: [] as Array<{ headers: Record<string, string>; corpo: Record<string, unknown> }>,
    envioStatus: 200,
    envios: [] as Array<{ corpo: Record<string, unknown> }>,
    ausentes: new Set<string>(),
    /**
     * Quando preenchida, a LLM falsa responde a partir do PROMPT, como a de verdade: o código da variável
     * só se o prompt o der ("ARI = ARREMATE INTERNO" ou "ARI: ARREMATE INTERNO"), senão a descrição que
     * ela vê; o número da opção só se o prompt o der. E responde no formato da ferramenta enviada.
     */
    respostaPeloPrompt: null as null | { variavelDescrita: string; opcaoDescrita: string; nome: string },
    /** R1: a tabela cujo update NÃO atinge linha nenhuma (como uma linha apagada entre a leitura e a escrita). */
    updateNaoAtinge: null as string | null,
}

function montar() {
    estado.db = {
        whatsapp_conexao: [{ id: 'c1', tenant_id: TENANT, canal: 'ORCAMENTISTA', wuzapi_token: TOKEN, webhook_segredo: SEGREDO, ativo: true }],
        orcamentista_config: [{ tenant_id: TENANT, ativo: true, modelo: 'FABRICACAO' }],
        orcamentista_remetente_autorizado: [
            // MEDIDO em produção (25/10/2026): o remetente de teste TEM employee_id, e o employees.user_id dele é NULO
            { id: VENDEDOR, tenant_id: TENANT, telefone: TELEFONE_GRAVADO, ativo: true, nome: 'Cristiano Fernandes', employee_id: 'e-cristiano' },
            { id: OUTRO_VENDEDOR, tenant_id: TENANT, telefone: '51988887777', ativo: true, nome: 'Fulano de Tal', employee_id: null },
            // sem nome no remetente: o nome que a pergunta cita vem do employees
            { id: TERCEIRO, tenant_id: TENANT, telefone: '51977776666', ativo: true, nome: null, employee_id: 'e-beltrana' },
        ],
        employees: [
            { id: 'e-cristiano', tenant_id: TENANT, name: 'Cristiano Fernandes', user_id: null, role: 'COMMERCIAL' },
            { id: 'e-beltrana', tenant_id: TENANT, name: 'Beltrana Souza', user_id: null, role: 'COMMERCIAL' },
        ],
        users: [],
        orcamentista_tentativa_desconhecida: [],
        orcamentista_conversa: [],
        orcamentista_mensagem: [],
        orcamentista_pre_definicao: [],
        orcamentista_levantamento: [],
        orcamentista_levantamento_item: [],
        orcamentista_conta_tabela: [{ tenant_id: TENANT, tabela_id: TABELA }],
        orcamentista_motor_tipologia_detalhe: CANDIDATAS.map((c) => ({ ...c })),
        orcamentista_mp_categoria: [{ tenant_id: TENANT, categoria_chave: 'PERFIL', config: { serra_mm: 5, cores: ['BRANCO'] } }],
        orcamentista_motor_regra: DE_PARA.regras.map((r, k) => ({ id: `r-${String(k).padStart(4, '0')}`, ...r, tabela_id: TABELA, tipologias: ['DP-02'] })),
        orcamentista_tabela_item: DE_PARA.itens.map((i) => ({ ...i, tabela_id: TABELA })),
        orcamentista_motor_tipologia: [{ tabela_id: TABELA, tipologia: 'DP-02', tempo_fabricacao_min: 300, tempo_origem: 'ESTIMADO' }],
        tenant_settings: [{ tenant_id: TENANT, calc_type: 'INDUSTRIALIZACAO', monthly_workload: 528, workload_unit: 'HOURS', num_productive_employees: 5 }],
        tenant_expense_config: [{ tenant_id: TENANT, production_labor_cost_hub: 40813.03, production_labor_cost: 0, productive_value_per_minute: 0, admin_salary_total: 27649.76, admin_fgts_total: 0, admin_other_costs: 0, fixed_expense_monthly: 17884.79 }],
    }
    estado.escritas = []
    estado.respostasDaLlm = []
    estado.chamadasDaLlm = []
    estado.envioStatus = 200
    estado.envios = []
    estado.ausentes = new Set()
    estado.respostaPeloPrompt = null
    estado.updateNaoAtinge = null
}

/** As UNIQUE da migração 20261025000003 que importam aqui, para o banco falso recusar como o real. */
function violaUnica(tabela: string, nova: Linha, linhas: Linha[]): boolean {
    if (tabela !== 'orcamentista_levantamento') return false
    return linhas.some((l) => l.tenant_id === nova.tenant_id && l.remetente_id === nova.remetente_id
        && (l.nome_normalizado === nova.nome_normalizado || (l.estado === 'EM_MONTAGEM' && nova.estado === 'EM_MONTAGEM')))
}

let sequencia = 0
jest.mock('@/supabase/admin', () => ({
    supabaseAdmin: {
        from: (tabela: string) => {
            const filtros: Array<[string, unknown]> = []
            const predicados: Array<(l: Linha) => boolean> = []
            let contar = false
            let faixa: [number, number] | null = null
            let ordem: { coluna: string; asc: boolean } | null = null
            let limite: number | null = null
            let atualizacao: Linha | null = null
            let colunas: string[] | null = null
            // `.update(...).select(...)`: o PostgREST devolve as linhas que o update atingiu
            let devolveAtingidas = false
            const projetar = (l: Linha): Linha => (colunas ? Object.fromEntries(colunas.filter((c) => c in l).map((c) => [c, l[c]])) : l)
            const casa = (l: Linha) => filtros.every(([c, v]) => l[c] === v) && predicados.every((f) => f(l))
            const ler = () => {
                let linhas = (estado.db[tabela] ?? []).filter(casa)
                if (ordem) {
                    const { coluna, asc } = ordem
                    linhas = [...linhas].sort((a, b) => (String(a[coluna]) < String(b[coluna]) ? -1 : String(a[coluna]) > String(b[coluna]) ? 1 : 0) * (asc ? 1 : -1))
                }
                if (limite !== null) linhas = linhas.slice(0, limite)
                if (faixa) linhas = linhas.slice(faixa[0], faixa[1] + 1)
                return linhas
            }
            const ausente = () => ({ data: null as Linha | null, error: { code: 'PGRST205', message: `Could not find the table 'public.${tabela}'` } })
            const q: Record<string, unknown> = {}
            q.select = (c?: string, o?: { count?: string }) => {
                if (atualizacao) devolveAtingidas = true
                contar = o?.count === 'exact'
                colunas = c && /^[a-z_0-9,\s]+$/i.test(c) ? c.split(',').map((x) => x.trim()).filter(Boolean) : null
                return q
            }
            q.in = (c: string, vs: unknown[]) => { predicados.push((l) => vs.includes(l[c])); return q }
            q.contains = (c: string, vs: unknown[]) => { predicados.push((l) => Array.isArray(l[c]) && vs.every((v) => (l[c] as unknown[]).includes(v))); return q }
            q.range = (de: number, ate: number) => { faixa = [de, ate]; return q }
            q.eq = (c: string, v: unknown) => { filtros.push([c, v]); return q }
            q.order = (c: string, o?: { ascending?: boolean }) => { ordem = { coluna: c, asc: o?.ascending !== false }; return q }
            q.limit = (n: number) => { limite = n; return q }
            q.maybeSingle = async () => (estado.ausentes.has(tabela) ? ausente() : { data: ler().map(projetar)[0] ?? null, error: null })
            q.update = (carga: Linha) => { atualizacao = carga; return q }
            q.then = (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => {
                if (atualizacao) {
                    estado.escritas.push({ tabela, op: 'update', carga: atualizacao })
                    const atingidas = estado.updateNaoAtinge === tabela ? [] : (estado.db[tabela] ?? []).filter(casa)
                    for (const l of atingidas) Object.assign(l, atualizacao)
                    return Promise.resolve({ data: devolveAtingidas ? atingidas.map(projetar) : null, error: null }).then(ok, erro)
                }
                if (estado.ausentes.has(tabela)) return Promise.resolve(ausente()).then(ok, erro)
                const total = (estado.db[tabela] ?? []).filter(casa).length
                return Promise.resolve({ data: ler().map(projetar), error: null, ...(contar ? { count: total } : {}) }).then(ok, erro)
            }
            q.insert = (carga: Linha | Linha[]) => {
                estado.escritas.push({ tabela, op: 'insert', carga })
                const linhas = (estado.db[tabela] ??= [])
                const novas: Linha[] = []
                let erro: { code: string; message: string } | null = null
                for (const c of Array.isArray(carga) ? carga : [carga]) {
                    if (violaUnica(tabela, c, linhas)) { erro = { code: '23505', message: 'duplicate key value violates unique constraint' }; break }
                    sequencia += 1
                    const nova: Linha = { id: `${tabela}-${sequencia}`, criado_em: new Date(Date.UTC(2026, 9, 25, 1, 0, sequencia)).toISOString(), ...c }
                    linhas.push(nova)
                    novas.push(nova)
                }
                const r = { data: erro ? null : (Array.isArray(carga) ? novas : novas[0]), error: erro }
                return {
                    select: () => ({ single: async () => r, then: (ok: (v: unknown) => unknown) => Promise.resolve(r).then(ok) }),
                    then: (ok: (v: unknown) => unknown, e?: (x: unknown) => unknown) => Promise.resolve({ data: null, error: r.error }).then(ok, e),
                }
            }
            for (const proibido of ['upsert', 'delete']) {
                q[proibido] = () => { throw new Error(`a conversa não pode ${proibido} em ${tabela}`) }
            }
            return q
        },
    },
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const rota = require('@/pages/api/atendimentos-ia/inbound').default as (req: NextApiRequest, res: NextApiResponse) => Promise<unknown>
// eslint-disable-next-line @typescript-eslint/no-require-imports
const conversa = require('@/lib/atendimentos-ia/conversa-da-ia') as typeof import('@/lib/atendimentos-ia/conversa-da-ia')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { formatarReais } = require('@/lib/atendimentos-ia/levantamento-de-barras') as typeof import('@/lib/atendimentos-ia/levantamento-de-barras')

type Proposta = { nome?: string; novo?: boolean; itens?: Linha[]; escolhas?: Linha[]; opcoes_de?: string[]; pergunta?: { texto: string } } & Linha
function respostaComFerramenta(p: Proposta) {
    return {
        id: 'msg_teste', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'toolu_teste', name: conversa.NOME_DA_FERRAMENTA, input: { itens: [] as Linha[], ...p } }],
        usage: { input_tokens: 100, output_tokens: 50 },
    }
}
const llmResponde = (p: Proposta) => { estado.respostasDaLlm.push({ status: 200, corpo: respostaComFerramenta(p) }) }

async function chamar(texto: string, opcoes: { id?: string; senderAlt?: string } = {}) {
    const saida = { status: 0 }
    const res = { status(n: number) { saida.status = n; return res }, json() { return res }, end() { return res }, setHeader() { return res } } as unknown as NextApiResponse
    sequencia += 1
    const req = {
        method: 'POST',
        query: { c: SEGREDO },
        headers: { 'content-type': 'application/json' },
        body: {
            type: 'Message',
            event: {
                Info: { ID: opcoes.id ?? `MSG_${sequencia}`, Sender: '1234:33@lid', SenderAlt: `${opcoes.senderAlt ?? TELEFONE_DO_WEBHOOK}:33@s.whatsapp.net`, IsFromMe: false, IsGroup: false, Type: 'text' },
                Message: { conversation: texto },
            },
        },
    } as unknown as NextApiRequest
    await rota(req, res)
    return saida
}

const enviados = () => estado.envios.map((e) => String(e.corpo.Body))
const ultimoEnviado = () => enviados()[enviados().length - 1]
const levantamentos = () => estado.db.orcamentista_levantamento ?? []
const itensDe = (id: unknown) => (estado.db.orcamentista_levantamento_item ?? []).filter((i) => i.levantamento_id === id).sort((a, b) => Number(a.ordem) - Number(b.ordem))
const linhaIa = () => erros.filter((l) => l.startsWith('[IA]'))

/** As escolhas em palavras que fazem a DP-02 fechar em branco: "sem arremate interno" e "externo com folga de 50". */
const ESCOLHAS_QUE_FECHAM = [{ variavel: 'ARI', opcao: 4 }, { variavel: 'MAE', opcao: 2 }]
/** Uma esquadria DP-02 completa, com o arremate dito em palavras, numa mensagem só — devolve a resposta. */
async function fecharDp02(nome: string, opcoes: { senderAlt?: string } = {}) {
    llmResponde({ nome, itens: [{ ...DP02 }], escolhas: ESCOLHAS_QUE_FECHAM })
    await chamar(`Levantamento ${nome}: DP-02 1200 x 1000, 1 unidade, branco, temperado 5mm, sem arremate interno, arremate externo com folga de 50`, opcoes)
    return ultimoEnviado()
}
const linhaDa = (texto: string, comeco: string) => texto.split('\n').find((l) => l.startsWith(comeco))
/** Abre um levantamento EM_MONTAGEM: a esquadria sem o vidro, e a pergunta do vidro em aberto. */
async function abrirSemVidro(nome: string) {
    llmResponde({ nome, itens: [{ ...DP02, vidro: undefined }] })
    await chamar(`Levantamento ${nome}: DP-02 1200 x 1000, 1 unidade, branco`)
}

let erros: string[] = []
let espioes: jest.SpyInstance[] = []
beforeEach(() => {
    montar()
    process.env.ANTHROPIC_API_KEY = CHAVE
    ;(globalThis as { fetch: unknown }).fetch = jest.fn(async (url: string, init?: { headers?: Record<string, string>; body?: string }) => {
        const corpo = init?.body ? JSON.parse(init.body) : {}
        const headers = init?.headers ?? {}
        if (url === ANTHROPIC) {
            estado.chamadasDaLlm.push({ headers, corpo })
            const pelo = estado.respostaPeloPrompt
            if (pelo) {
                const sistema = String(corpo.system)
                const props = (corpo.tools as Array<{ input_schema: { properties: Record<string, unknown> } }>)[0].input_schema.properties
                const codigo = new RegExp(`\\b([A-Z]{2,5})\\s*[=:]\\s*${pelo.variavelDescrita}\\b`).exec(sistema)?.[1] ?? pelo.variavelDescrita
                const opcao = Number(new RegExp(`(\\d+)\\s*=\\s*${pelo.opcaoDescrita}`).exec(sistema)?.[1] ?? NaN)
                const escolha = { variavel: codigo, opcao: Number.isFinite(opcao) ? opcao : 0 }
                const input = { nome: pelo.nome, itens: [] as Linha[], ...('escolhas' in props ? { escolhas: [escolha] } : { escolha }) }
                return { ok: true, status: 200, json: async () => ({ ...respostaComFerramenta({}), content: [{ type: 'tool_use', id: 't', name: conversa.NOME_DA_FERRAMENTA, input }] }) }
            }
            const proxima = estado.respostasDaLlm.shift() ?? { status: 200, corpo: respostaComFerramenta({}) }
            if (proxima === 'lanca') throw new Error('fetch failed')
            return { ok: proxima.status >= 200 && proxima.status < 300, status: proxima.status, json: async () => proxima.corpo }
        }
        if (url.endsWith('/chat/send/text')) {
            estado.envios.push({ corpo })
            const ok = estado.envioStatus >= 200 && estado.envioStatus < 300
            return { ok, status: estado.envioStatus, json: async () => (ok ? { data: { Id: 'WAMID_SAIDA' } } : { error: 'falhou' }) }
        }
        throw new Error(`fetch inesperado: ${url}`)
    })
    erros = []
    espioes = [
        jest.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { erros.push(a.map(String).join(' ')) }),
        ...(['log', 'info', 'warn', 'debug'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => undefined)),
    ]
})
afterEach(() => {
    espioes.forEach((e) => e.mockRestore())
    jest.restoreAllMocks()
    delete process.env.ANTHROPIC_API_KEY
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('(1) O TESTE QUE VALE: pedidos seguidos do MESMO telefone, todos respondidos, e um que pergunta', () => {
    // nomes novos no roteiro: o "Casa do João" de produção é dado de teste do dono do produto
    const ACEITE_1 = 'Levantamento Casa do Pedro — janela de correr 2 folhas móveis Europa 42, 1200 x 1000 mm, 1 unidade, perfil branco, vidro 5mm'

    it('1. a esquadria inteira, SEM nenhuma pergunta de arremate: o padrão é assumido e confirmado, e a resposta sai JÁ com os dois totais', async () => {
        llmResponde({ nome: 'Casa do Pedro', itens: [{ ...DP02, vidro: 'vidro 5mm' }] })
        await chamar(ACEITE_1)
        expect(enviados()).toHaveLength(1)
        const r = enviados()[0]
        expect(r.split('\n')[0]).toBe(conversa.FRASE_ARREMATE_PADRAO)
        // a resposta diz, por extenso, qual arremate foi usado
        expect(r).toContain('Arremate e guarnição — arremate interno: BZ0006 - ARREMATE 65MM (padrão); arremate externo: BZ0010 - ARREMATE 20MM (padrão); medida arremate externo: MEDIDA DO VÃO (CORTE 45/45) (padrão).')
        expect(r).not.toContain('Não consegui')
        // os dois totais. A barra inteira é DERIVADA DA FONTE, não lida da saída: a conta à mão de 1b
        // (ARI 4, MAE 2: R$ 1.342,0875) mais uma barra do BZ0006 e uma do BZ0012, pelo valor da tabela, e a
        // mão de obra de R$ 77,30. MEDIDO em 25/10/2026: R$ 1.506,52 e R$ 955,30 — NÃO os R$ 1.419,39 e R$ 907,09
        // esperados, que são os de "sem arremate interno" com MAE 2 (o caso 1b). Relatado ao dono do produto.
        const valor = (c: string) => Number((DE_PARA.itens as Linha[]).find((i) => i.codigo === c)?.valor_barra_interno)
        const perfis = Math.round((1342.0875 + valor('10501') + valor('10491')) * 100) / 100
        expect(r).toContain(`Perfis por barra inteira: ${formatarReais(perfis)}.`)
        expect(r).toContain(`Total por barra inteira (perfis + mão de obra): ${formatarReais(Math.round((perfis + 77.3) * 100) / 100)}.`)
        expect(r).toMatch(/Total por consumo real \(perfis \+ mão de obra\): R\$ [\d.]+,\d{2}\./)
        expect(r).toContain('NÃO cobre o vidro nem os insumos e acessórios')
        expect(r).not.toMatch(VOCABULARIO_INTERNO)
        expect(levantamentos()[0]).toEqual(expect.objectContaining({ nome: 'Casa do Pedro', estado: 'COMPLETO' }))
    })

    it('1b. o MESMO pedido com o arremate dito em palavras: sai JÁ, com os dois totais, o arremate usado e o que o preço cobre e não cobre', async () => {
        expect(await fecharDp02('Casa do João')).toBe(LEVANTAMENTO_CASA_DO_JOAO)
        expect(enviados()).toHaveLength(1)
        expect(itensDe(levantamentos()[0].id)).toEqual([expect.objectContaining({ ordem: 1, ...DP02, escolhas: { ARI: 4, MAE: 2 } })])
        expect(LEVANTAMENTO_CASA_DO_JOAO).not.toMatch(VOCABULARIO_INTERNO)
    })

    it('2. "Levantamento Obra Centro" logo depois: responde, e são DOIS levantamentos distintos', async () => {
        await fecharDp02('Casa do João')
        llmResponde({ nome: 'Obra Centro', itens: [{ ...DP02, largura_mm: 800, altura_mm: 600 }], escolhas: [{ variavel: 'ARI', opcao: 4 }, { variavel: 'ARE', opcao: 2 }] })
        await chamar('Levantamento Obra Centro: DP-02 800 x 600, branco, temperado 5mm, sem arremate interno nem externo')
        expect(enviados()).toHaveLength(2)
        expect(ultimoEnviado()).toContain('Levantamento “Obra Centro”, perfil BRANCO.')
        expect(ultimoEnviado()).toContain('Esquadria 1: DP-02, 800 x 600 mm, 1 unidade(s).')
        expect(ultimoEnviado()).toMatch(/Total por consumo real \(perfis \+ mão de obra\): R\$ [\d.]+,\d{2}\./)
        expect(levantamentos().map((l) => [l.nome, l.estado])).toEqual([['Casa do João', 'COMPLETO'], ['Obra Centro', 'COMPLETO']])
        expect(itensDe(levantamentos()[0].id)[0]).toEqual(expect.objectContaining({ largura_mm: 1200, altura_mm: 1000 }))
    })

    it('3. "casa do joao" (minúscula, sem acento) trocando a altura para 1200: é ALTERAÇÃO do primeiro, refaz tudo e responde com os números novos', async () => {
        const antes = await fecharDp02('Casa do João')
        const escritasAntes = estado.escritas.length
        llmResponde({ nome: 'casa do joao', alteracao: true, itens: [{ altura_mm: 1200 }] })
        await chamar('casa do joao, trocar a altura para 1200')
        const depois = ultimoEnviado()
        expect(levantamentos()).toHaveLength(1)
        expect(levantamentos()[0]).toEqual(expect.objectContaining({ nome: 'Casa do João', estado: 'COMPLETO' }))
        expect(estado.escritas.slice(escritasAntes).some((e) => e.tabela === 'orcamentista_levantamento' && e.op === 'update'
            && typeof (e.carga as Linha).atualizado_em === 'string')).toBe(true)
        expect(itensDe(levantamentos()[0].id)).toEqual([expect.objectContaining({ ordem: 1, altura_mm: 1200, escolhas: { ARI: 4, MAE: 2 } })])
        expect(linhaDa(depois, 'Esquadria 1:')).toBe('Esquadria 1: DP-02, 1.200 x 1.200 mm, 1 unidade(s).')
        expect(linhaDa(depois, 'Perfis por consumo real:')).toBeDefined()
        expect(linhaDa(depois, 'Perfis por consumo real:')).not.toBe(linhaDa(antes, 'Perfis por consumo real:'))
        expect(depois).toMatch(/Total por barra inteira \(perfis \+ mão de obra\): R\$ [\d.]+,\d{2}\./)
    })

    it('4. "Casa do João 2": PERGUNTA se é novo ou se é sobre o "Casa do João" — e não cria nem altera nada', async () => {
        await fecharDp02('Casa do João')
        const itensAntes = JSON.stringify(estado.db.orcamentista_levantamento_item)
        llmResponde({ nome: 'Casa do João 2', itens: [{ ...DP02 }] })
        await chamar('Levantamento Casa do João 2: DP-02 1200 x 1000 branco temperado 5mm')
        expect(ultimoEnviado()).toBe(conversa.fraseDoNomeParecido('Casa do João 2', ['Casa do João']))
        expect(ultimoEnviado()).toContain('“Casa do João”')
        expect(levantamentos()).toHaveLength(1)
        expect(JSON.stringify(estado.db.orcamentista_levantamento_item)).toBe(itensAntes)
    })
})

describe('(1c) o arremate só é perguntado quando o vendedor PEDE outro — e as opções vão por extenso', () => {
    it('"quero trocar o arremate externo" mostra as opções em palavras; "sem arremate externo" é gravado e o preço sai refeito', async () => {
        await fecharDp02('Casa do João')
        llmResponde({ nome: 'Casa do João', alteracao: true, opcoes_de: ['ARE'] })
        await chamar('Casa do João: quero trocar o arremate externo')
        expect(ultimoEnviado()).toBe('Para arremate externo, as opções são: BZ0010 - ARREMATE 20MM; SEM ARREMATE EXTERNO. Qual você quer?')
        expect(levantamentos()[0].estado).toBe('EM_MONTAGEM')

        // a resposta vem SEM o nome: o levantamento está em montagem, e a LLM só sabe o que o prompt diz
        estado.respostaPeloPrompt = { variavelDescrita: 'ARREMATE EXTERNO', opcaoDescrita: 'SEM ARREMATE EXTERNO', nome: '' }
        await chamar('sem arremate externo')
        // a pergunta em aberto foi RELIDA do item (o null da variável) e foi ao prompt: é o que dá sentido à resposta sem nome
        expect(String(estado.chamadasDaLlm[estado.chamadasDaLlm.length - 1].corpo.system))
            .toContain('Pergunta em aberto: Para arremate externo, as opções são: BZ0010 - ARREMATE 20MM; SEM ARREMATE EXTERNO. Qual você quer?')
        expect(itensDe(levantamentos()[0].id)[0].escolhas).toEqual({ ARI: 4, MAE: 2, ARE: 2 })
        expect(levantamentos()[0].estado).toBe('COMPLETO')
        expect(ultimoEnviado()).toContain('arremate externo: SEM ARREMATE EXTERNO (como você pediu)')
        expect(ultimoEnviado()).toMatch(/Total por barra inteira \(perfis \+ mão de obra\): R\$ [\d.]+,\d{2}\./)
        for (const t of enviados()) expect(t).not.toMatch(VOCABULARIO_INTERNO)
    })
})

describe('(2) o roteamento por nome', () => {
    it('sem levantamento em montagem e SEM nome na mensagem: pergunta se é novo ou sobre um já feito, e não cria nada', async () => {
        llmResponde({ itens: [{ ...DP02 }] })
        await chamar('DP-02 1200 x 1000 branco')
        expect(enviados()).toEqual([conversa.FRASE_SEM_NOME])
        expect(levantamentos()).toEqual([])
    })

    it('o nome que a IA propõe e NÃO está no texto do vendedor é inventado: conta como sem nome', async () => {
        llmResponde({ nome: 'Casa do João', itens: [{ ...DP02 }] })
        await chamar('DP-02 1200 x 1000 branco')
        expect(enviados()).toEqual([conversa.FRASE_SEM_NOME])
        expect(levantamentos()).toEqual([])
    })

    it('o vendedor responde dizendo que é NOVO, com o nome: "novo Casa do João 2" cria o segundo, e responde JÁ', async () => {
        await fecharDp02('Casa do João')
        llmResponde({ nome: 'Casa do João 2', novo: true, itens: [{ ...DP02 }] })
        await chamar('novo Casa do João 2: DP-02 1200 x 1000 branco temperado 5mm')
        expect(levantamentos().map((l) => l.nome)).toEqual(['Casa do João', 'Casa do João 2'])
        expect(ultimoEnviado().split('\n')[0]).toBe(conversa.FRASE_ARREMATE_PADRAO)
    })

    it('"novo" com um nome que JÁ existe não cria outro: diz que o nome já existe', async () => {
        await fecharDp02('Casa do João')
        llmResponde({ nome: 'casa do joão', novo: true, itens: [{ ...DP02 }] })
        await chamar('novo casa do joão')
        expect(levantamentos()).toHaveLength(1)
        expect(ultimoEnviado()).toBe(conversa.fraseDoNomeQueJaExiste('Casa do João'))
    })

    it('com um levantamento EM_MONTAGEM, a mensagem continua nele — mesmo trazendo outro nome', async () => {
        await abrirSemVidro('Casa do João')
        expect(ultimoEnviado()).toBe(PERGUNTA_DO_VIDRO)
        llmResponde({ nome: 'Obra Centro', itens: [{ vidro: 'Temperado 5mm' }] })
        await chamar('Obra Centro? não, vidro temperado 5mm')
        expect(levantamentos()).toHaveLength(1)
        expect(itensDe(levantamentos()[0].id)[0].vidro).toBe('Temperado 5mm')
        expect(levantamentos()[0].estado).toBe('COMPLETO')
    })

    it('o nome é único POR VENDEDOR: o OUTRO vendedor, CRIANDO com o MESMO nome, cria o DELE — não altera o do primeiro', async () => {
        await fecharDp02('Casa do João')
        llmResponde({ nome: 'Casa do João', itens: [{ ...DP02, altura_mm: 1500 }] })
        await chamar('Levantamento Casa do João: DP-02 1200 x 1500 branco temperado 5mm', { senderAlt: TELEFONE_DO_OUTRO })
        expect(levantamentos().map((l) => [l.nome, l.remetente_id])).toEqual([['Casa do João', VENDEDOR], ['Casa do João', OUTRO_VENDEDOR]])
        expect(itensDe(levantamentos()[0].id)[0].altura_mm).toBe(1000)
    })

    it('ALTERAÇÃO com duas esquadrias e sem dizer qual: pergunta qual esquadria, e não muda nada', async () => {
        await fecharDp02('Casa do João')
        const id = levantamentos()[0].id
        estado.db.orcamentista_levantamento_item.push({ id: 'item-2', tenant_id: TENANT, levantamento_id: id, ordem: 2, ...DP02, tipologia: 'DP-01', escolhas: null })
        llmResponde({ nome: 'casa do joao', alteracao: true, itens: [{ altura_mm: 1300 }] })
        await chamar('casa do joao, altura 1300')
        expect(ultimoEnviado()).toBe(conversa.fraseDeQualEsquadria('Casa do João', 2))
        expect(itensDe(id).map((i) => i.altura_mm)).toEqual([1000, 1000])
    })

    it('ALTERAÇÃO com a ordem dita e a MESMA tipologia: as escolhas ficam, e sai o levantamento refeito', async () => {
        await fecharDp02('Casa do João')
        llmResponde({ nome: 'Casa do João', alteracao: true, itens: [{ ordem: 1, tipologia: 'DP-02', largura_mm: 1500 }] })
        await chamar('Casa do João: largura 1500')
        expect(linhaDa(ultimoEnviado(), 'Esquadria 1:')).toBe('Esquadria 1: DP-02, 1.500 x 1.000 mm, 1 unidade(s).')
        expect(itensDe(levantamentos()[0].id)[0].escolhas).toEqual({ ARI: 4, MAE: 2 })
        expect(levantamentos()[0].estado).toBe('COMPLETO')
    })
})

describe('(3) o estado mora no levantamento: NADA em mensagem, conversa ou pré-definição', () => {
    it('os pedidos do teste que vale não escrevem uma linha em orcamentista_mensagem, _conversa ou _pre_definicao', async () => {
        await fecharDp02('Casa do João')
        llmResponde({ nome: 'casa do joao', alteracao: true, itens: [{ altura_mm: 1200 }] })
        await chamar('casa do joao, trocar a altura para 1200')
        const tocadas = new Set(estado.escritas.map((e) => e.tabela))
        expect([...tocadas].sort()).toEqual(['orcamentista_levantamento', 'orcamentista_levantamento_item'])
        expect(estado.db.orcamentista_mensagem).toEqual([])
        expect(estado.db.orcamentista_conversa).toEqual([])
        expect(estado.db.orcamentista_pre_definicao).toEqual([])
    })

    it('a LLM recebe SÓ a mensagem desta vez — não há histórico — e, em montagem, a pergunta em aberto no prompt', async () => {
        await abrirSemVidro('Casa do João')
        llmResponde({ itens: [{ vidro: 'Temperado 5mm' }] })
        await chamar('temperado 5mm')
        const segunda = estado.chamadasDaLlm[1].corpo
        expect(segunda.messages).toEqual([{ role: 'user', content: 'temperado 5mm' }])
        expect(String(segunda.system)).toContain(`Pergunta em aberto: ${PERGUNTA_DO_VIDRO}`)
    })

    it('a LLM não escolhe tenant nem remetente: as chaves propostas são ignoradas', async () => {
        llmResponde({ nome: 'Casa do João', tenant_id: 'outro', remetente_id: 'outro', itens: [{ ...DP02, tenant_id: 'outro' }] })
        await chamar('Levantamento Casa do João: DP-02 1200 x 1000 branco temperado 5mm')
        expect(levantamentos()[0]).toEqual(expect.objectContaining({ tenant_id: TENANT, remetente_id: VENDEDOR }))
        expect(itensDe(levantamentos()[0].id)[0].tenant_id).toBe(TENANT)
    })
})

describe('(4) a lista: a tipologia e a cor só da lista, exatas', () => {
    it('as tipologias, as cores e as escolhas de arremate (internas, com o código) vão ao prompt', async () => {
        await chamar('oi')
        const sistema = String(estado.chamadasDaLlm[0].corpo.system)
        expect(sistema).toContain('DP-02 | JANELA DE CORRER 02 FOLHAS MÓVEIS | EUROPA 42 | Correr')
        expect(sistema).toContain('Cores da empresa (cor_perfil, escreva EXATAMENTE uma delas): BRANCO')
        // sem o código e o número no prompt, a LLM não tem como registrar a escolha — o defeito 1
        expect(sistema).toContain('ARI = ARREMATE INTERNO: 1 = BZ0006 - ARREMATE 65MM; 2 = BZ1770 - ARREMATE 70MM; 3 = BZ0010 - ARREMATE 20MM; 4 = SEM ARREMATE INTERNO')
        // a escolha que muda o preço é do vendedor: o prompt proíbe a IA de escolher
        expect(sistema).toContain('NUNCA escolha sozinho')
    })

    it('"Branco" não é BRANCO, e "Janela de correr" não é tipologia: descartados, e a pergunta é a do primeiro campo vazio', async () => {
        llmResponde({ nome: 'Casa do João', itens: [{ ...DP02, tipologia: 'Janela de correr', cor_perfil: 'Branco' }] })
        await chamar('Levantamento Casa do João: janela de correr 1200 x 1000 Branco temperado 5mm')
        const item = itensDe(levantamentos()[0].id)[0]
        expect([item.tipologia, item.cor_perfil]).toEqual([null, null])
        expect(ultimoEnviado()).toBe('Qual a tipologia das esquadrias?')
    })

    it('SEM LISTA de tipologias (a tabela não carregada): a conversa diz o que falta, sem chamar a LLM', async () => {
        estado.ausentes.add('orcamentista_motor_tipologia_detalhe')
        await chamar('Levantamento Casa do João: DP-02')
        expect(estado.chamadasDaLlm).toHaveLength(0)
        expect(enviados()).toHaveLength(1)
        expect(enviados()[0]).toContain('a lista de tipologias do fornecedor')
    })

    it('SEM LISTA DE CORES: quando a vez é da cor, a conversa diz o que falta em vez de perguntar', async () => {
        estado.db.orcamentista_mp_categoria = [{ tenant_id: TENANT, categoria_chave: 'PERFIL', config: { serra_mm: 5 } }]
        llmResponde({ nome: 'Casa do João', itens: [{ tipologia: 'DP-02', largura_mm: 1200, altura_mm: 1000, quantidade: 1 }] })
        await chamar('Levantamento Casa do João: DP-02 1200 x 1000, 1 unidade')
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { FRASE_SEM_CORES } = require('@/lib/atendimentos-ia/levantamento-da-conversa') as { FRASE_SEM_CORES: string }
        expect(enviados()).toEqual([FRASE_SEM_CORES])
    })
})

describe('(5) remetente autorizado é SEMPRE respondido; silêncio só para o desconhecido', () => {
    it('desconhecido: a LLM não é chamada, nada é enviado, e a tentativa é gravada', async () => {
        await chamar('oi', { senderAlt: '555100000000' })
        expect(estado.chamadasDaLlm).toHaveLength(0)
        expect(enviados()).toEqual([])
        expect(estado.db.orcamentista_tentativa_desconhecida).toHaveLength(1)
    })

    it('autorizado com o histórico antigo inteiro (uma pré-definição COMPLETA numa conversa antiga): É respondido', async () => {
        estado.db.orcamentista_conversa = [{ id: 'antiga', tenant_id: TENANT, remetente_id: VENDEDOR, telefone: TELEFONE_DO_WEBHOOK, criado_em: '2026-10-22T00:00:00Z' }]
        estado.db.orcamentista_pre_definicao = [{ id: 'pd', tenant_id: TENANT, conversa_id: 'antiga', estado: 'COMPLETA', tipologia: 'janela de correr 2 folhas Europa 42' }]
        await fecharDp02('Casa do João')
        expect(enviados()).toEqual([LEVANTAMENTO_CASA_DO_JOAO])
        expect(estado.db.orcamentista_pre_definicao).toEqual([expect.objectContaining({ id: 'pd', estado: 'COMPLETA' })])
    })
})

describe('(6) DEFEITO 3: toda falha vira resposta que diz o que falhou — 200 ao WUZAPI, e nada técnico', () => {
    it('sem ANTHROPIC_API_KEY: a LLM não é chamada, e o vendedor sabe que falta a chave', async () => {
        delete process.env.ANTHROPIC_API_KEY
        const r = await chamar('oi')
        expect(r.status).toBe(200)
        expect(estado.chamadasDaLlm).toHaveLength(0)
        expect(enviados()).toEqual([conversa.FALHA_SEM_CHAVE])
        expect(linhaIa()[0]).toContain('desfecho=sem-chave')
    })

    it.each([
        ['402 billing_error', 402, { type: 'error', error: { type: 'billing_error', message: 'Your credit balance is too low' } }, 'sem-saldo', 'FALHA_SEM_SALDO'],
        ['500', 500, { type: 'error', error: { type: 'api_error', message: 'interno' } }, 'erro-da-llm', 'FALHA_DA_IA'],
    ])('%s → desfecho %s, a frase da falha, nada gravado', async (_n, status, corpo, desfecho, frase) => {
        estado.respostasDaLlm.push({ status, corpo })
        const r = await chamar('Levantamento Casa do João')
        expect(r.status).toBe(200)
        expect(enviados()).toEqual([(conversa as unknown as Record<string, string>)[frase]])
        expect(levantamentos()).toEqual([])
        expect(linhaIa()[0]).toContain(`desfecho=${desfecho}`)
    })

    it('4xx: a mensagem de erro vai ao log, MASCARADA — a chave nunca aparece', async () => {
        estado.respostasDaLlm.push({ status: 400, corpo: { type: 'error', error: { type: 'invalid_request_error', message: `tools.0.input_schema: inválido; chave ${CHAVE}` } } })
        await chamar('oi')
        expect(linhaIa()[0]).toContain('mensagem="tools.0.input_schema')
        expect(erros.join('\n')).not.toContain(CHAVE)
    })

    it('RECUSA (stop_reason refusal): nada gravado, e a frase diz que o serviço recusou', async () => {
        estado.respostasDaLlm.push({ status: 200, corpo: { ...respostaComFerramenta({ nome: 'Casa do João', itens: [{ ...DP02 }] }), stop_reason: 'refusal' } })
        await chamar('Levantamento Casa do João')
        expect(levantamentos()).toEqual([])
        expect(enviados()).toEqual([conversa.FALHA_RECUSA])
        expect(linhaIa()[0]).toContain('desfecho=recusa')
    })

    it('falha no envio: 200, o levantamento fica gravado, e o log diz', async () => {
        estado.envioStatus = 500
        llmResponde({ nome: 'Casa do João', itens: [{ ...DP02 }] })
        const r = await chamar('Levantamento Casa do João: DP-02 1200 x 1000 branco temperado 5mm')
        expect(r.status).toBe(200)
        expect(levantamentos()).toHaveLength(1)
        expect(linhaIa()[0]).toContain('desfecho=envio-falhou')
    })

    it('erro do banco ANTES de gravar: o vendedor sabe que nada foi gravado', async () => {
        estado.ausentes.add('orcamentista_levantamento')
        llmResponde({ nome: 'Casa do João', itens: [{ ...DP02 }] })
        await chamar('Levantamento Casa do João: DP-02 1200 x 1000 branco temperado 5mm')
        expect(enviados()).toEqual([conversa.FALHA_DO_BANCO_ANTES])
        expect(linhaIa()[0]).toContain('desfecho=erro')
    })
})

describe('(6b) R1 e R2: nenhum update falha em silêncio, e a pergunta respondida não volta igual', () => {
    it('R1: o update da esquadria que NÃO atinge linha é erro — o vendedor sabe, e o log diz quantas linhas', async () => {
        await fecharDp02('Casa do João')
        estado.updateNaoAtinge = 'orcamentista_levantamento_item'
        llmResponde({ nome: 'casa do joao', alteracao: true, itens: [{ altura_mm: 1200 }] })
        await chamar('casa do joao, trocar a altura para 1200')
        expect(ultimoEnviado()).toBe(conversa.FALHA_DO_BANCO_AO_GRAVAR)
        expect(linhaIa().pop()).toMatch(/desfecho=erro .*atingiu 0 linha\(s\)/)
    })

    it('R1: o mesmo para o update do levantamento', async () => {
        await fecharDp02('Casa do João')
        estado.updateNaoAtinge = 'orcamentista_levantamento'
        llmResponde({ nome: 'casa do joao', alteracao: true, itens: [{ altura_mm: 1200 }] })
        await chamar('casa do joao, trocar a altura para 1200')
        expect(ultimoEnviado()).toBe(conversa.FALHA_DO_BANCO_AO_GRAVAR)
    })

    it('R2: a resposta que não muda nada, com a pergunta em aberto, NÃO devolve a mesma pergunta: diz que não registrou — e nada é gravado', async () => {
        await abrirSemVidro('Casa do João')
        const escritasAntes = estado.escritas.length
        llmResponde({ itens: [] })
        await chamar('hmm, sei lá')
        expect(ultimoEnviado()).toBe(conversa.fraseDeNaoRegistrei(PERGUNTA_DO_VIDRO))
        expect(ultimoEnviado()).not.toBe(PERGUNTA_DO_VIDRO)
        expect(estado.escritas.length).toBe(escritasAntes)
        expect(linhaIa().pop()).toContain('desfecho=nao-avancou')
    })

    it('R2: numa alteração, o que foi proposto e não vale aparece — nada alterado, nada gravado', async () => {
        await fecharDp02('Casa do João')
        const escritasAntes = estado.escritas.length
        llmResponde({ nome: 'casa do joao', alteracao: true, itens: [{ cor_perfil: 'Azul Piscina' }] })
        await chamar('casa do joao, troca a cor para azul piscina')
        expect(ultimoEnviado()).toBe(conversa.fraseDeNaoApliquei('Casa do João'))
        expect(estado.escritas.length).toBe(escritasAntes)
    })

    it('mandar só o nome refaz a conta e NÃO toca o banco: o rastro (atualizado_em) é só de mudança', async () => {
        await fecharDp02('Casa do João')
        const escritasAntes = estado.escritas.length
        llmResponde({ nome: 'Casa do João' })
        await chamar('Casa do João')
        expect(ultimoEnviado()).toBe(LEVANTAMENTO_CASA_DO_JOAO)
        expect(estado.escritas.length).toBe(escritasAntes)
    })
})

describe('(7) o log [IA]: o levantamento e o desfecho — nunca a chave, o telefone ou o texto', () => {
    it('levantamento, propostos, descartados, se enviou e o desfecho', async () => {
        await fecharDp02('Casa do João')
        expect(linhaIa()[0]).toMatch(/^\[IA\] levantamento=\S+ rota=NOVO propostos=8 descartados=0 enviou=sim desfecho=levantou/)
    })

    it('nem a chave, nem o telefone, nem o texto, nem a resposta enviada', async () => {
        await fecharDp02('Casa do João')
        const tudo = erros.join('\n')
        for (const proibido of [CHAVE, TELEFONE_DO_WEBHOOK, TELEFONE_GRAVADO, 'Casa do João', 'ARREMATE INTERNO', TOKEN]) expect(tudo).not.toContain(proibido)
    })
})

describe('(8) o esquema da ferramenta cabe nos limites do strict', () => {
    function contar(esquema: unknown, caminho = ''): { unioes: number; opcionais: number } {
        let unioes = 0
        let opcionais = 0
        const e = esquema as { type?: unknown; anyOf?: unknown; properties?: Record<string, unknown>; required?: string[]; items?: unknown }
        if (Array.isArray(e.type) || Array.isArray(e.anyOf)) unioes += 1
        if (e.properties) {
            for (const [k, v] of Object.entries(e.properties)) {
                if (!(e.required ?? []).includes(k)) opcionais += 1
                const r = contar(v, `${caminho}.${k}`)
                unioes += r.unioes
                opcionais += r.opcionais
            }
        }
        if (e.items) { const r = contar(e.items, `${caminho}[]`); unioes += r.unioes; opcionais += r.opcionais }
        return { unioes, opcionais }
    }

    it('o esquema ENVIADO: até 16 uniões, até 24 opcionais, uma ferramenta strict', async () => {
        await chamar('oi')
        const tools = estado.chamadasDaLlm[0].corpo.tools as Array<{ strict: boolean; input_schema: unknown }>
        expect(tools).toHaveLength(1)
        expect(tools[0].strict).toBe(true)
        const { unioes, opcionais } = contar(tools[0].input_schema)
        expect(unioes).toBeLessThanOrEqual(16)
        expect(opcionais).toBeLessThanOrEqual(24)
    })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Os casos abaixo vêm de `atendimentos-ia-conversa-da-ia.test.ts`, removido com a pré-definição:
// testam comportamento que NÃO mudou (o contrato com a Anthropic, a janela do 4xx, o saldo, o esquema
// e a lista de cores por empresa), e por isso foram portados em vez de perdidos.
describe('(9) o contrato da chamada à Anthropic', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const modelo = require('@/lib/atendimentos-ia/modelo-da-ia') as { MODELO_PADRAO_DA_IA: string; VERSAO_DA_API_ANTHROPIC: string }

    it('POST com a chave no header, anthropic-version, o modelo da CONSTANTE — não o config.modelo, que é o modelo de atendimento', async () => {
        await chamar('oi')
        expect(estado.chamadasDaLlm).toHaveLength(1)
        const [c] = estado.chamadasDaLlm
        expect(c.headers['x-api-key']).toBe(CHAVE)
        expect(c.headers['anthropic-version']).toBe(modelo.VERSAO_DA_API_ANTHROPIC)
        expect(modelo.VERSAO_DA_API_ANTHROPIC).toBe('2026-10-21')
        expect(c.corpo.model).toBe(modelo.MODELO_PADRAO_DA_IA)
        expect(modelo.MODELO_PADRAO_DA_IA).toBe('claude-sonnet-5-5')
        expect(c.corpo.model).not.toBe('FABRICACAO')
    })

    it('UMA ferramenta strict, tool_choice auto (o forçado é 400 neste modelo), e nada de temperature/top_p/top_k', async () => {
        await chamar('oi')
        const corpo = estado.chamadasDaLlm[0].corpo
        const tools = corpo.tools as Array<Record<string, unknown>>
        expect(tools.map((t) => [t.name, t.strict])).toEqual([[conversa.NOME_DA_FERRAMENTA, true]])
        expect(corpo.tool_choice).toEqual({ type: 'auto' })
        for (const k of ['temperature', 'top_p', 'top_k']) expect(corpo).not.toHaveProperty(k)
    })

    it('a chave NUNCA vai para o log', async () => {
        llmResponde({ nome: 'Casa do João', itens: [{ ...DP02 }] })
        await chamar('Levantamento Casa do João: DP-02 1200 x 1000 branco temperado 5mm')
        expect(erros.join('\n')).not.toContain(CHAVE)
    })

    it('o esquema RESTRINGE: sem chave extra, cada campo com o seu tipo, a opção da escolha inteira', async () => {
        await chamar('oi')
        type Esquema = { type?: string; additionalProperties?: boolean; properties: Record<string, Esquema>; items?: Esquema }
        const e = (estado.chamadasDaLlm[0].corpo.tools as Array<{ input_schema: Esquema }>)[0].input_schema
        expect(e.additionalProperties).toBe(false)
        const item = e.properties.itens.items as Esquema
        expect(item.additionalProperties).toBe(false)
        expect(Object.keys(item.properties).sort()).toEqual(['altura_mm', 'cor_perfil', 'largura_mm', 'ordem', 'quantidade', 'tipologia', 'vidro'])
        for (const k of ['ordem', 'largura_mm', 'altura_mm', 'quantidade']) expect(item.properties[k].type).toBe('integer')
        expect(item.properties.tipologia.type).toBe('string')
        const escolha = e.properties.escolhas.items as Esquema
        expect(escolha.additionalProperties).toBe(false)
        expect(escolha.properties.opcao.type).toBe('integer')
        expect((e.properties.opcoes_de.items as Esquema).type).toBe('string')
        expect(e.properties.novo.type).toBe('boolean')
    })
})

describe('(10) saldo, erro e a janela do 4xx — mascarada, cortada, e só no 4xx', () => {
    const erro400 = (message: string) => ({ status: 400, corpo: { type: 'error', error: { type: 'invalid_request_error', message } } })
    const mensagemDoLog = () => { const m = /mensagem="([^"]*)"/.exec(linhaIa()[0] ?? ''); return m ? m[1] : null }

    it('400 com "credit balance is too low" também é SEM SALDO', async () => {
        estado.respostasDaLlm.push(erro400('Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing.'))
        await chamar('oi')
        expect(enviados()).toEqual([conversa.FALHA_SEM_SALDO])
        expect(linhaIa()[0]).toContain('desfecho=sem-saldo')
        expect(erros.join('\n')).toMatch(/saldo/i)
    })

    it('o contraste: OUTRO erro 400 não é saldo', async () => {
        estado.respostasDaLlm.push(erro400('max_tokens: invalid'))
        await chamar('oi')
        expect(linhaIa()[0]).toContain('desfecho=erro-da-llm')
        expect(linhaIa()[0]).not.toContain('sem-saldo')
    })

    it.each([
        ['exceção de rede', () => { estado.respostasDaLlm.push('lanca') }],
        ['resposta sem chamar a ferramenta', () => { estado.respostasDaLlm.push({ status: 200, corpo: { type: 'message', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Olá!' }] } }) }],
    ])('LLM: %s → 200, a frase da falha, nada gravado', async (_n, preparar) => {
        preparar()
        const r = await chamar('Levantamento Casa do João')
        expect(r.status).toBe(200)
        expect(enviados()).toEqual([conversa.FALHA_DA_IA])
        expect(estado.escritas).toEqual([])
    })

    it('400 → a linha [IA] leva a mensagem, que nomeia o CAMPO malformado', async () => {
        estado.respostasDaLlm.push(erro400('tools.0.custom: Schema is too complex for compilation.'))
        await chamar('oi')
        expect(mensagemDoLog()).toBe('tools.0.custom: Schema is too complex for compilation.')
    })

    it('a chave atravessando o corte dos 300 não deixa PEDAÇO dela: mascara antes de cortar', async () => {
        // a chave começa no caractere 282: um corte ANTES da máscara deixaria os primeiros dela
        estado.respostasDaLlm.push(erro400(`${'a'.repeat(280)} ${CHAVE} fim`))
        await chamar('oi')
        expect(mensagemDoLog()).toContain('<segredo>')
        expect(erros.join('\n')).not.toContain(CHAVE.slice(0, 12))
    })

    it('cortada em 300 caracteres', async () => {
        estado.respostasDaLlm.push(erro400('campo invalido. '.repeat(100)))
        await chamar('oi')
        expect(mensagemDoLog()).toHaveLength(300)
    })

    it('402 sem saldo também é 4xx: leva a mensagem', async () => {
        estado.respostasDaLlm.push({ status: 402, corpo: { type: 'error', error: { type: 'billing_error', message: 'Your credit balance is too low.' } } })
        await chamar('oi')
        expect(mensagemDoLog()).toBe('Your credit balance is too low.')
    })

    it.each([
        ['5xx', () => { estado.respostasDaLlm.push({ status: 500, corpo: { type: 'error', error: { type: 'api_error', message: 'detalhe interno do servidor' } } }) }],
        ['exceção de rede', () => { estado.respostasDaLlm.push('lanca') }],
    ])('o contraste: %s → a mensagem NÃO vai ao log', async (_n, preparar) => {
        preparar()
        await chamar('oi')
        expect(linhaIa()[0]).toContain('desfecho=erro-da-llm')
        expect(linhaIa()[0]).not.toContain('mensagem=')
        expect(erros.join('\n')).not.toContain('detalhe interno do servidor')
    })
})

describe('(11) a lista de cores é a DESTA empresa', () => {
    it('a cor de outro tenant não vale: AZUL, da base de outra empresa, é descartada', async () => {
        estado.db.orcamentista_mp_categoria.push({ tenant_id: 'outro-tenant', categoria_chave: 'PERFIL', config: { cores: ['AZUL'] } })
        llmResponde({ nome: 'Casa do João', itens: [{ ...DP02, cor_perfil: 'AZUL' }] })
        await chamar('Levantamento Casa do João: DP-02 1200 x 1000 azul temperado 5mm')
        expect(itensDe(levantamentos()[0].id)[0].cor_perfil).toBeNull()
        expect(String(estado.chamadasDaLlm[0].corpo.system)).not.toContain('AZUL')
    })
})

describe('(12) decisão 2, revista: quem altera — o criador, ou o admin da empresa', () => {
    /** Liga o remetente a um user da empresa com o papel dado — a cadeia remetente → employees → users. */
    function comPapel(remetenteId: string, role: string | null, opcoes: { tenantDoUser?: string | null; userId?: string | null } = {}) {
        const r = estado.db.orcamentista_remetente_autorizado.find((x) => x.id === remetenteId) as Linha
        const empregado = `e-${remetenteId}`
        r.employee_id = empregado
        const userId = opcoes.userId === undefined ? `u-${remetenteId}` : opcoes.userId
        estado.db.employees.push({ id: empregado, tenant_id: TENANT, name: String(r.nome), user_id: userId, role: 'ADMINISTRATIVE' })
        if (userId) estado.db.users.push({ id: userId, tenant_id: opcoes.tenantDoUser === undefined ? TENANT : opcoes.tenantDoUser, role, name: String(r.nome), email: 'x@y.z' })
    }
    const doOutro = { senderAlt: TELEFONE_DO_OUTRO }
    const alterarAltura = async (nome: string, opcoes: { senderAlt?: string } = {}) => {
        llmResponde({ nome, alteracao: true, itens: [{ altura_mm: 1200 }] })
        await chamar(`${nome}, troca a altura para 1200`, opcoes)
    }
    const alturaDe = (remetenteId: string) => itensDe(levantamentos().find((l) => l.remetente_id === remetenteId)?.id)[0]?.altura_mm

    it('5. o CRIADOR altera o próprio levantamento — permitido (o remetente de teste NÃO é admin: employees.user_id nulo)', async () => {
        await fecharDp02('Casa do João')
        await alterarAltura('casa do joao')
        expect(alturaDe(VENDEDOR)).toBe(1200)
        expect(linhaDa(ultimoEnviado(), 'Esquadria 1:')).toBe('Esquadria 1: DP-02, 1.200 x 1.200 mm, 1 unidade(s).')
    })

    it('6. outro vendedor SEM admin tenta alterar pelo nome → "não encontrei um levantamento seu", nada gravado — a MESMA frase de quando o levantamento não existe', async () => {
        await fecharDp02('Casa do João')
        const itensAntes = JSON.stringify(estado.db.orcamentista_levantamento_item)
        const escritasAntes = estado.escritas.length
        await alterarAltura('casa do joao', doOutro)
        const comOutroDono = ultimoEnviado()
        expect(comOutroDono).toBe(conversa.fraseDeNaoEncontrei('casa do joao'))
        expect(estado.escritas.length).toBe(escritasAntes)
        expect(JSON.stringify(estado.db.orcamentista_levantamento_item)).toBe(itensAntes)

        // o contraste que prova que não vaza: ninguém tem "Casa do João", e a resposta é IDÊNTICA
        montar()
        await alterarAltura('casa do joao', doOutro)
        expect(ultimoEnviado()).toBe(comOutroDono)
    })

    it('7. o ADMIN altera o levantamento de OUTRO vendedor — permitido, e o levantamento continua do criador', async () => {
        await fecharDp02('Casa do João')
        comPapel(OUTRO_VENDEDOR, 'admin')
        levantamentos()[0].atualizado_em = 'antes-da-alteracao'
        await alterarAltura('casa do joao', doOutro)
        expect(levantamentos()).toHaveLength(1)
        // o rastro (decisão 3) é gravado NA LINHA DO CRIADOR: um update filtrado pelo admin não acharia linha nenhuma
        expect(levantamentos()[0].atualizado_em).not.toBe('antes-da-alteracao')
        expect(levantamentos()[0]).toEqual(expect.objectContaining({ remetente_id: VENDEDOR, nome: 'Casa do João', estado: 'COMPLETO' }))
        expect(alturaDe(VENDEDOR)).toBe(1200)
        expect(linhaDa(ultimoEnviado(), 'Esquadria 1:')).toBe('Esquadria 1: DP-02, 1.200 x 1.200 mm, 1 unidade(s).')
        expect(ultimoEnviado()).toMatch(/Total por consumo real \(perfis \+ mão de obra\): R\$ [\d.]+,\d{2}\./)
    })

    it('8. o ADMIN busca um nome que existe em DOIS vendedores → pergunta de qual, citando os nomes, e não escolhe; com o vendedor dito, altera o certo', async () => {
        await fecharDp02('Casa do João')
        await fecharDp02('Casa do João', { senderAlt: TELEFONE_DO_TERCEIRO })
        comPapel(OUTRO_VENDEDOR, 'admin')
        const itensAntes = JSON.stringify(estado.db.orcamentista_levantamento_item)
        await alterarAltura('casa do joao', doOutro)
        // o nome do TERCEIRO vem do employees: o remetente dele não tem nome
        expect(ultimoEnviado()).toBe(conversa.fraseDeQualVendedor('casa do joao', ['Cristiano Fernandes', 'Beltrana Souza']))
        expect(JSON.stringify(estado.db.orcamentista_levantamento_item)).toBe(itensAntes)

        llmResponde({ nome: 'casa do joao', vendedor: 'Beltrana Souza', alteracao: true, itens: [{ altura_mm: 1200 }] })
        await chamar('casa do joao da Beltrana Souza, troca a altura para 1200', doOutro)
        expect([alturaDe(VENDEDOR), alturaDe(TERCEIRO)]).toEqual([1000, 1200])
        // os nomes dos vendedores não vão ao log
        for (const nome of ['Cristiano Fernandes', 'Beltrana Souza', 'Fulano de Tal']) expect(erros.join('\n')).not.toContain(nome)
    })

    it('8b. o vendedor dito pelo admin que NÃO está no texto é inventado: pergunta de novo, e não altera', async () => {
        await fecharDp02('Casa do João')
        await fecharDp02('Casa do João', { senderAlt: TELEFONE_DO_TERCEIRO })
        comPapel(OUTRO_VENDEDOR, 'admin')
        llmResponde({ nome: 'casa do joao', vendedor: 'Beltrana Souza', alteracao: true, itens: [{ altura_mm: 1200 }] })
        await chamar('casa do joao, troca a altura para 1200', doOutro)
        expect(ultimoEnviado()).toBe(conversa.fraseDeQualVendedor('casa do joao', ['Cristiano Fernandes', 'Beltrana Souza']))
        expect([alturaDe(VENDEDOR), alturaDe(TERCEIRO)]).toEqual([1000, 1000])
    })

    it.each([
        ['employees.user_id NULO', (r: string) => comPapel(r, 'admin', { userId: null })],
        ['users.role NULO', (r: string) => comPapel(r, null)],
        ['users.role user', (r: string) => comPapel(r, 'user')],
        ['users.role super_admin', (r: string) => comPapel(r, 'super_admin')],
        ['user admin de OUTRO tenant', (r: string) => comPapel(r, 'admin', { tenantDoUser: 'tenant-de-outra-conta' })],
        ['employees.role ADMINISTRATIVE sem users admin (centro de custo não é permissão)', (r: string) => comPapel(r, 'user')],
    ])('9. %s → tratado como NÃO admin: "não encontrei", nada alterado', async (_n, preparar) => {
        await fecharDp02('Casa do João')
        preparar(OUTRO_VENDEDOR)
        await alterarAltura('casa do joao', doOutro)
        expect(ultimoEnviado()).toBe(conversa.fraseDeNaoEncontrei('casa do joao'))
        expect(alturaDe(VENDEDOR)).toBe(1000)
    })

    it('o ADMIN com um nome que não existe na empresa: diz que não encontrou na empresa', async () => {
        comPapel(OUTRO_VENDEDOR, 'admin')
        await alterarAltura('casa do joao', doOutro)
        expect(ultimoEnviado()).toBe(conversa.fraseDeNaoEncontreiNaEmpresa('casa do joao'))
        expect(levantamentos()).toEqual([])
    })

    it('o ADMIN que deixaria o levantamento de outro INCOMPLETO: nada é gravado, e a resposta diz o que falta', async () => {
        await abrirSemVidro('Casa do João')
        comPapel(OUTRO_VENDEDOR, 'admin')
        const itensAntes = JSON.stringify(estado.db.orcamentista_levantamento_item)
        await alterarAltura('casa do joao', doOutro)
        expect(ultimoEnviado()).toBe(conversa.fraseDaAlteracaoIncompleta('Casa do João', 'Cristiano Fernandes', PERGUNTA_DO_VIDRO))
        expect(JSON.stringify(estado.db.orcamentista_levantamento_item)).toBe(itensAntes)
        expect(levantamentos()[0].estado).toBe('EM_MONTAGEM')
    })

    it('sem pedido de ALTERAÇÃO, o admin com um nome de outro vendedor CRIA o dele — não mexe no do outro', async () => {
        await fecharDp02('Casa do João')
        comPapel(OUTRO_VENDEDOR, 'admin')
        llmResponde({ nome: 'Casa do João', itens: [{ ...DP02, altura_mm: 1500 }] })
        await chamar('Levantamento Casa do João: DP-02 1200 x 1500 branco temperado 5mm', doOutro)
        expect(levantamentos().map((l) => l.remetente_id)).toEqual([VENDEDOR, OUTRO_VENDEDOR])
        expect(alturaDe(VENDEDOR)).toBe(1000)
    })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('(13) DEFEITO 1, medido em produção (b0465e57, 25/10/2026): a escolha respondida nunca chegava ao item', () => {
    // O log de produção das três respostas ("1", "4", "2"): `rota=MONTAGEM propostos=1 descartados=1`. A
    // escolha chegava à validação e era DESCARTADA: o prompt não trazia o código da variável, e a LLM
    // propunha o que via — a descrição. Os casos acima não pegavam porque a LLM falsa SABIA o código.
    // Esta LLM falsa só sabe o que o prompt diz, e responde no formato da ferramenta que recebeu.

    it('respondida a escolha do arremate interno em palavras, ela é GRAVADA no item e a mesma pergunta NÃO volta', async () => {
        llmResponde({ nome: 'Casa Teste', itens: [{ ...DP02 }] })
        await chamar('Levantamento Casa Teste: DP-02 1200 x 1000, 1 unidade, branco, temperado 5mm')
        const antes = ultimoEnviado()
        estado.respostaPeloPrompt = { variavelDescrita: 'ARREMATE INTERNO', opcaoDescrita: 'SEM ARREMATE INTERNO', nome: 'Casa Teste' }
        await chamar('Casa Teste: sem arremate interno')
        const item = itensDe(levantamentos()[0].id)[0]
        expect(item.escolhas).toEqual(expect.objectContaining({ ARI: 4 }))
        expect(ultimoEnviado()).not.toBe(antes)
    })
})
