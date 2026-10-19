/**
 * Atendimentos I.A. — o catálogo da plataforma (bloco 2B.2): nicho → fornecedor → tabela, com o
 * motor preso à tabela. Regras PURAS, lidas pela rota e pela tela — sem banco aqui.
 *
 * A TELA NÃO FALA COM O BANCO. As quatro tabelas têm `REVOKE ALL` de `anon` e `authenticated`
 * (`20261019000001`): pelo cliente do navegador a lista chegaria vazia e pareceria "nenhum
 * fornecedor". Tudo passa pelas rotas de `ROTAS_DO_CATALOGO`, que escrevem com `service_role`.
 * Portão: `atendimentos-ia-a-tela-nao-fala-com-o-banco.test.ts`.
 *
 * Fonte das regras: `docs/prd/EPIC-ATENDIMENTOS-IA.md` (§3 e §5.5–5.6) e o mockup.
 */

export const MODELOS = ['FABRICACAO', 'REVENDA', 'SERVICO'] as const
export type Modelo = (typeof MODELOS)[number]

/** Os rótulos do mockup (seção 2 do EPIC). */
export const ROTULO_DO_MODELO: Record<Modelo, string> = {
    FABRICACAO: 'Fabricação',
    REVENDA: 'Revenda',
    SERVICO: 'Prestação de serviço',
}

/** O bucket privado criado pela `20261019000001`. */
export const BUCKET_DO_CATALOGO = 'atendimentos-ia'

/** O que o modal da tabela aceita, nos DOIS arquivos (EPIC §5.6). */
export const EXTENSOES_ACEITAS = ['.xlsx', '.xls', '.csv', '.pdf'] as const

export const ROTAS_DO_CATALOGO = {
    nichos: '/api/super-admin/atendimentos-ia/nichos',
    nicho: (id: string) => `/api/super-admin/atendimentos-ia/nichos/${id}`,
    fornecedores: '/api/super-admin/atendimentos-ia/fornecedores',
    fornecedor: (id: string) => `/api/super-admin/atendimentos-ia/fornecedores/${id}`,
    tabelas: '/api/super-admin/atendimentos-ia/tabelas',
    tabela: (id: string) => `/api/super-admin/atendimentos-ia/tabelas/${id}`,
    urlDeEnvio: '/api/super-admin/atendimentos-ia/tabelas/url-de-envio',
} as const

/** A frase do mockup na tela de fornecedores (EPIC §3.3). */
export const AVISO_DO_CATALOGO = 'Nada aqui pertence a um cliente — são tabelas do fornecedor.'

export const MENSAGEM_MOTOR_OBRIGATORIO = 'O motor é obrigatório: toda tabela entra com o arquivo do motor.'

// ── Os tipos que a rota devolve e a tela lê ─────────────────────────────────────────────────
export interface Nicho { id: string; modelo: Modelo; nome: string; ativo: boolean }

export interface FornecedorDaLista {
    id: string
    nome: string
    nicho_id: string
    nicho_nome: string
    modelo: Modelo
    tabelas: number
    /** Nomes das contas que usam ALGUMA tabela deste fornecedor, sem repetição. */
    contas_usando: string[]
}

export interface TabelaDoFornecedor {
    id: string
    fornecedor_id: string
    arquivo_nome: string
    arquivo_path: string
    motor_nome: string
    motor_path: string
    vigencia: string | null
    /** "Subido em". */
    criado_em: string
    contas_usando: string[]
}

export interface FornecedorComTabelas extends FornecedorDaLista { tabelas_da_lista: TabelaDoFornecedor[] }

export type TipoDeArquivo = 'arquivo' | 'motor'

// ── A leitura dos corpos — SÓ as chaves do contrato, e o trim antes de gravar ──────────────
export type Leitura<T> = { ok: true; corpo: T } | { ok: false; erro: string }

/** Guardas explícitas: com `strictNullChecks` desligado, `if (!l.ok)` não estreita a união. */
export function recusada<T>(l: Leitura<T>): l is { ok: false; erro: string } { return l.ok === false }
export function aceita<T>(l: Leitura<T>): l is { ok: true; corpo: T } { return l.ok === true }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const ehUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)

const obj = (b: unknown): Record<string, unknown> => (b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {})
/** Texto aparado; vazio ou não-texto é `null`. O TRIM é aqui, antes de qualquer gravação. */
export function textoAparado(v: unknown): string | null {
    if (typeof v !== 'string') return null
    const t = v.trim()
    return t === '' ? null : t
}

export function lerCorpoDoNicho(body: unknown): Leitura<{ modelo: Modelo; nome: string }> {
    const b = obj(body)
    const modelo = b.modelo
    if (typeof modelo !== 'string' || !(MODELOS as readonly string[]).includes(modelo)) return { ok: false, erro: 'Escolha o modelo do nicho.' }
    const nome = textoAparado(b.nome)
    if (!nome) return { ok: false, erro: 'Dê um nome ao nicho.' }
    return { ok: true, corpo: { modelo: modelo as Modelo, nome } }
}

export function lerCorpoDoFornecedor(body: unknown): Leitura<{ nome: string; nicho_id: string }> {
    const b = obj(body)
    const nome = textoAparado(b.nome)
    if (!nome) return { ok: false, erro: 'Dê um nome ao fornecedor.' }
    if (!ehUuid(b.nicho_id)) return { ok: false, erro: 'Escolha o nicho do fornecedor.' }
    return { ok: true, corpo: { nome, nicho_id: b.nicho_id } }
}

/** O caminho de um arquivo no bucket: tem de estar DENTRO da pasta do fornecedor. */
const dentroDoFornecedor = (caminho: string, fornecedorId: string) => caminho.startsWith(`${fornecedorId}/`) && !caminho.includes('..')

export interface CorpoDaTabela {
    fornecedor_id: string
    arquivo_path: string
    arquivo_nome: string
    motor_path: string
    motor_nome: string
    vigencia: string | null
}

/**
 * A tabela NOVA. O MOTOR É OBRIGATÓRIO — aqui, na rota, e não só na tela: "quando for inserida
 * uma nova tabela, tem que inserir o motor de aplicação" (dono do produto, EPIC §3.8). O banco
 * também recusa (`motor_path` e `motor_nome` NOT NULL), mas a rota recusa antes, com a frase.
 */
export function lerCorpoDaTabela(body: unknown): Leitura<CorpoDaTabela> {
    const b = obj(body)
    if (!ehUuid(b.fornecedor_id)) return { ok: false, erro: 'Fornecedor inválido.' }
    const fornecedor_id = b.fornecedor_id
    const arquivo_path = textoAparado(b.arquivo_path)
    const arquivo_nome = textoAparado(b.arquivo_nome)
    if (!arquivo_path || !arquivo_nome) return { ok: false, erro: 'Suba o arquivo da tabela.' }
    const motor_path = textoAparado(b.motor_path)
    const motor_nome = textoAparado(b.motor_nome)
    if (!motor_path || !motor_nome) return { ok: false, erro: MENSAGEM_MOTOR_OBRIGATORIO }
    if (!dentroDoFornecedor(arquivo_path, fornecedor_id) || !dentroDoFornecedor(motor_path, fornecedor_id)) {
        return { ok: false, erro: 'Os arquivos não pertencem a este fornecedor.' }
    }
    return { ok: true, corpo: { fornecedor_id, arquivo_path, arquivo_nome, motor_path, motor_nome, vigencia: textoAparado(b.vigencia) } }
}

/** A EDIÇÃO de uma tabela: cada arquivo troca inteiro (caminho E nome) ou não troca; o motor não sai. */
export interface EdicaoDaTabela {
    arquivo?: { path: string; nome: string }
    motor?: { path: string; nome: string }
    /** `undefined` = não mexe; `null` = apaga a vigência. */
    vigencia?: string | null
}

export function lerEdicaoDaTabela(body: unknown, fornecedorId: string): Leitura<EdicaoDaTabela> {
    const b = obj(body)
    const out: EdicaoDaTabela = {}
    for (const tipo of ['arquivo', 'motor'] as const) {
        const temPath = `${tipo}_path` in b
        const temNome = `${tipo}_nome` in b
        if (!temPath && !temNome) continue
        const p = textoAparado(b[`${tipo}_path`])
        const n = textoAparado(b[`${tipo}_nome`])
        if (!p || !n) return { ok: false, erro: tipo === 'motor' ? MENSAGEM_MOTOR_OBRIGATORIO : 'Suba o arquivo da tabela.' }
        if (!dentroDoFornecedor(p, fornecedorId)) return { ok: false, erro: 'Os arquivos não pertencem a este fornecedor.' }
        out[tipo] = { path: p, nome: n }
    }
    if ('vigencia' in b) out.vigencia = textoAparado(b.vigencia)
    if (Object.keys(out).length === 0) return { ok: false, erro: 'Nada a alterar.' }
    return { ok: true, corpo: out }
}

export function extensaoAceita(nome: string): boolean {
    const n = nome.toLowerCase()
    return EXTENSOES_ACEITAS.some((e) => n.endsWith(e))
}

/** O pedido de URL de envio: a rota decide o caminho; o navegador só manda o nome original. */
export function lerPedidoDeEnvio(body: unknown): Leitura<{ fornecedor_id: string; tipo: TipoDeArquivo; nome: string }> {
    const b = obj(body)
    if (!ehUuid(b.fornecedor_id)) return { ok: false, erro: 'Fornecedor inválido.' }
    if (b.tipo !== 'arquivo' && b.tipo !== 'motor') return { ok: false, erro: 'Tipo de arquivo inválido.' }
    const nome = textoAparado(b.nome)
    if (!nome) return { ok: false, erro: 'Arquivo sem nome.' }
    if (!extensaoAceita(nome)) return { ok: false, erro: `Formato não aceito. Use ${EXTENSOES_ACEITAS.join(', ')}.` }
    return { ok: true, corpo: { fornecedor_id: b.fornecedor_id, tipo: b.tipo, nome } }
}

/**
 * O nome do arquivo como o Storage aceita: sem acento, sem caractere fora do conjunto permitido.
 * O nome ORIGINAL não se perde — ele vai para `arquivo_nome` / `motor_nome`.
 */
export function nomeSeguroParaOBucket(nome: string): string {
    const limpo = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
    return limpo || 'arquivo'
}

/** `<fornecedor>/<arquivo|motor>/<id único>-<nome seguro>` — a pasta do fornecedor é a primeira. */
export function caminhoNoBucket(fornecedorId: string, tipo: TipoDeArquivo, nome: string, idUnico: string): string {
    return `${fornecedorId}/${tipo}/${idUnico}-${nomeSeguroParaOBucket(nome)}`
}

/** "Em uso por: A, B" — a frase do mockup (EPIC §3.7). Sem nomes, não há frase. */
export function emUsoPor(contas: string[]): string {
    return `Em uso por: ${[...new Set(contas)].sort((a, b) => a.localeCompare(b, 'pt-BR')).join(', ')}`
}
