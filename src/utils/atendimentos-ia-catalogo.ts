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

/**
 * O que o modal da tabela aceita, nos DOIS arquivos — tabela e motor (EPIC §5.6). É a LISTA ÚNICA:
 * o modal (o `accept` e o rodapé), a recusa da tela e a recusa da rota leem daqui. O EPIC e o
 * mockup citam esta constante em vez de repetir a lista.
 *
 * `.xlsm` entrou em 20/10/2026: a tabela de pedidos da Wolff Perfis é uma planilha com macro.
 *
 * ══ A VALIDAÇÃO DE FORMATO EXISTE DUAS VEZES, E NÃO É REPETIÇÃO (dono do produto, 20/10/2026) ══
 * O `accept` do input é SUGESTÃO, não trava: o usuário escolhe "Todos os arquivos" no diálogo do
 * sistema e passa. Por isso a checagem existe em dois pontos, cada um com o seu papel:
 *   - na TELA (`TabelaModal`, ao escolher): para AVISAR CEDO, dentro do modal, com o nome do
 *     arquivo e o motivo — antes de qualquer envio;
 *   - na ROTA (`lerPedidoDeEnvio`, em `tabelas/url-de-envio.ts`): para VALER — a tela é do
 *     navegador, e o que vale é o que o servidor recusa.
 * Tirar qualquer uma das duas achando que é repetição fica vermelho em
 * `atendimentos-ia-formato-do-arquivo.test.tsx`. E a recusa precisa ser VISÍVEL: a da rota já
 * existia e funcionava em 20/10/2026, e o defeito era ninguém vê-la.
 *
 * ══ A RECUSA APARECE ONDE A AÇÃO ACONTECEU (dono do produto, 20/10/2026) ══
 * Mensagem passageira no topo da página não é aviso — é sorte. Na área inteira:
 *   - o clique foi num MODAL (tabela nova, editar tabela, editar ou excluir fornecedor,
 *     credenciar) → o erro aparece num Alert DENTRO dele;
 *   - o clique foi na PÁGINA (excluir tabela, num balão de confirmação) → Alert na página, acima
 *     da lista;
 *   - o credenciamento gravou o fornecedor e alguma tabela falhou → o modal fecha (outro clique
 *     criaria um segundo fornecedor) e as falhas ficam num Alert FIXO na página, cada arquivo
 *     nomeado UMA vez (`fraseDoArquivo` / `fraseDaTabela`).
 * Portão: `atendimentos-ia-recusa-onde-a-acao-aconteceu.test.tsx`.
 */
export const EXTENSOES_ACEITAS = ['.xlsx', '.xlsm', '.xls', '.csv', '.pdf'] as const

/**
 * O que a IMPORTAÇÃO lê — o conteúdo da tabela e do motor (20/10/2026). Só planilha no formato
 * do Excel moderno, que o `exceljs` abre. `.csv` e `.pdf` continuam ACEITOS NO ENVIO (a lista
 * acima), mas NÃO são importáveis — decisão do dono do produto; `.xls`, o formato binário antigo,
 * também não, porque o `exceljs` não o lê. A tela diz isso com o nome e a extensão
 * (`fraseDoArquivoNaoImportavel`) — nunca falha calada.
 */
export const EXTENSOES_IMPORTAVEIS = ['.xlsx', '.xlsm'] as const

/** A extensão do nome, em minúsculas e com o ponto — `''` quando não há. */
export function extensaoDoArquivo(nome: string): string {
    const m = /\.[^./\\]+$/.exec(nome.trim())
    return m ? m[0].toLowerCase() : ''
}

export const arquivoImportavel = (nome: string) => (EXTENSOES_IMPORTAVEIS as readonly string[]).includes(extensaoDoArquivo(nome))

/** O PORQUÊ de cada extensão aceita no envio e não importável — a tela diz a extensão e o motivo dela. */
export const MOTIVO_DA_EXTENSAO_NAO_IMPORTAVEL: Record<string, string> = {
    '.xls': 'é o formato antigo do Excel, que o leitor não abre — salve a planilha como .xlsx ou .xlsm',
    '.csv': 'não é uma planilha do Excel, e a importação só lê planilha',
    '.pdf': 'não é uma planilha do Excel, e a importação só lê planilha',
}

export function fraseDoArquivoNaoImportavel(nome: string): string {
    const ext = extensaoDoArquivo(nome)
    const porque = MOTIVO_DA_EXTENSAO_NAO_IMPORTAVEL[ext] ?? 'não é uma planilha que a importação leia'
    return fraseDoArquivo(nome, `a extensão ${ext || '(sem extensão)'} é aceita no envio, mas não é importável: ${porque}. A importação lê ${EXTENSOES_IMPORTAVEIS.join(' e ')}.`)
}

/** O motivo da recusa de formato — o mesmo na tela e na rota. */
export const MOTIVO_DO_FORMATO_RECUSADO = `Formato não aceito. Use ${EXTENSOES_ACEITAS.join(', ')}.`

/** Uma recusa que diz QUAL arquivo: `Arquivo "x.docx": Formato não aceito…`. */
export const fraseDoArquivo = (nome: string, motivo: string) => `Arquivo "${nome}": ${motivo}`

/** A gravação da tabela recusada DEPOIS dos envios: `Tabela "x.xlsm": …` — nomeada pelo arquivo da tabela. */
export const fraseDaTabela = (nome: string, motivo: string) => `Tabela "${nome}": ${motivo}`

/** O título do Alert, na página, quando excluir uma tabela é recusado. */
export const TITULO_DA_TABELA_NAO_EXCLUIDA = 'A tabela não foi excluída.'

export const ROTAS_DO_CATALOGO = {
    nichos: '/api/super-admin/atendimentos-ia/nichos',
    nicho: (id: string) => `/api/super-admin/atendimentos-ia/nichos/${id}`,
    fornecedores: '/api/super-admin/atendimentos-ia/fornecedores',
    fornecedor: (id: string) => `/api/super-admin/atendimentos-ia/fornecedores/${id}`,
    tabelas: '/api/super-admin/atendimentos-ia/tabelas',
    tabela: (id: string) => `/api/super-admin/atendimentos-ia/tabelas/${id}`,
    urlDeEnvio: '/api/super-admin/atendimentos-ia/tabelas/url-de-envio',
    /** A importação da tabela: POST importa os dois arquivos; GET a última importação, ou null. */
    importacao: (tabelaId: string) => `/api/super-admin/atendimentos-ia/tabelas/${tabelaId}/importar`,
    /** Bloco 2C.1 — as contas com o Atendimentos I.A. ligado (só nome, modelo e nicho). */
    contas: '/api/super-admin/atendimentos-ia/contas',
    /** "Tabelas em uso" da conta: GET lista e opções do nicho; POST adiciona `{ tabela_id }`. */
    tabelasDaConta: (tenantId: string) => `/api/super-admin/atendimentos-ia/contas/${tenantId}/tabelas`,
    /** DELETE tira UMA tabela de uso DAQUELA conta. */
    tabelaDaConta: (tenantId: string, tabelaId: string) => `/api/super-admin/atendimentos-ia/contas/${tenantId}/tabelas/${tabelaId}`,
} as const

/**
 * O ÚNICO modelo que usa fornecedor → tabela → motor. Decisão do dono do produto, 19/10/2026
 * (EPIC §3.2). Nas palavras dele: "Prestação de serviço vai considerar os produtos e os serviços
 * salvos dentro do sistema"; e, sobre Revenda, "o motor dele vai considerar a base de
 * conhecimento, que são os produtos salvos no próprio sistema".
 *
 * Aplicada em 20/10/2026 ao USO POR CONTA: a tela da conta só mostra "Tabelas em uso" neste
 * modelo, e a rota recusa (409) tabela para conta de outro modelo. O CATÁLOGO não é restrito —
 * nicho, fornecedor e tabela podem existir nos três modelos.
 *
 * >>> O CASO DE BORDA: conta fora de Fabricação COM tabela em uso <<<
 * Nela a tela esconderia a tabela junto com o grupo, e com ela o "Remover". Medido em produção
 * em 20/10/2026 pela sessão de verificação: 0 contas fora de FABRICACAO com tabela em uso (1
 * tabela em uso ao todo, numa conta FABRICACAO). O estado é INALCANÇÁVEL pela tela: a troca de
 * modelo é recusada enquanto houver tabela em uso (`gravarModeloENicho`, na rota PATCH da conta),
 * então nenhuma conta sai de Fabricação carregando tabela. Só nasceria por escrita direta no
 * banco. Se um dia aparecer, a saída é MOSTRAR a lista com "Remover" nesses casos — e NÃO apagar
 * nada automaticamente.
 */
export const MODELO_COM_FORNECEDOR: Modelo = 'FABRICACAO'
export const usaTabelaDeFornecedor = (m: Modelo | null) => m === MODELO_COM_FORNECEDOR

/** Os modelos que montam o orçamento a partir do cadastro do próprio cliente. */
export type ModeloSemFornecedor = Exclude<Modelo, 'FABRICACAO'>

export const TITULO_DA_BASE_DO_CADASTRO = 'Base de cálculo do motor'

/**
 * O texto do mockup (`docs/prd/atendimentos-ia-mockup.html`, "Base de cálculo do motor") para
 * cada modelo que NÃO usa fornecedor. A linha de números do mockup ("1.284 produtos · …") NÃO
 * entra: ela mostraria o tamanho do cadastro do cliente, que é conteúdo da conta — a regra
 * inviolável da área.
 */
export const BASE_DO_CADASTRO: Record<ModeloSemFornecedor, string> = {
    REVENDA: 'A I.A. monta o orçamento a partir dos produtos cadastrados no sistema do próprio cliente. Não usa fornecedor nem tabela externa.',
    SERVICO: 'A I.A. monta o orçamento a partir dos produtos e serviços cadastrados no sistema do próprio cliente. Não usa fornecedor nem tabela externa.',
}

/** A recusa da rota a tabela para conta de modelo que não usa fornecedor — diz por quê. */
export function fraseDoModeloSemFornecedor(m: ModeloSemFornecedor): string {
    const base = m === 'SERVICO' ? 'os produtos e os serviços' : 'os produtos'
    return `Só contas do modelo ${ROTULO_DO_MODELO[MODELO_COM_FORNECEDOR]} usam tabela de fornecedor. No modelo ${ROTULO_DO_MODELO[m]}, o motor considera ${base} cadastrados no sistema do próprio cliente.`
}

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

/**
 * Uma conta da lista "Contas ligadas" (bloco 2C.1). SÓ isto, e é a REGRA INVIOLÁVEL: a
 * identificação da conta e a configuração do Atendimentos I.A. — nada do conteúdo da conta.
 * `nicho_nome` é o nome do NICHO (catálogo da plataforma), não dado do cliente.
 */
export interface ContaLigada {
    tenant_id: string
    nome: string
    modelo: Modelo | null
    nicho_id: string | null
    nicho_nome: string | null
}

// ── "Tabelas em uso" da conta ──────────────────────────────────────────────────────────────
/**
 * Uma tabela em uso por uma conta. SÓ catálogo — fornecedor, arquivo, motor, vigência — e é a
 * REGRA INVIOLÁVEL: nada do conteúdo da conta.
 *
 * `vigencia` é o TEXTO COMO FOI DIGITADO. Se ela é data de upload ou prazo é decisão em aberto
 * (EPIC §9), e por isso não há regra de vencimento em lugar nenhum: nada a interpreta.
 */
export interface TabelaEmUso {
    tabela_id: string
    fornecedor_id: string
    fornecedor_nome: string
    arquivo_nome: string
    motor_nome: string
    vigencia: string | null
}

/** Uma tabela que a conta pode escolher — do fornecedor, que é do nicho da conta. */
export interface TabelaParaEscolher { id: string; arquivo_nome: string; motor_nome: string; vigencia: string | null }

/** Um fornecedor do NICHO DA CONTA, com as tabelas dele. */
export interface FornecedorDoNicho { id: string; nome: string; tabelas: TabelaParaEscolher[] }

/**
 * O que a rota das tabelas da conta devolve. `fornecedores` são SÓ os do nicho salvo da conta —
 * e vazio quando o nicho não tem fornecedor ou a conta não tem nicho: NUNCA a lista da
 * plataforma (instrução do dono do produto; o mockup caía para a lista inteira).
 */
export interface TabelasDaConta {
    nicho_id: string | null
    em_uso: TabelaEmUso[]
    fornecedores: FornecedorDoNicho[]
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
    if (!extensaoAceita(nome)) return { ok: false, erro: MOTIVO_DO_FORMATO_RECUSADO }
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

/** O corpo de "adicionar tabela à conta": só `tabela_id`. A conta vem da URL, o autor da sessão. */
export function lerPedidoDeTabelaDaConta(body: unknown): Leitura<{ tabela_id: string }> {
    if (!body || typeof body !== 'object') return { ok: false, erro: 'Corpo inválido.' }
    const b = body as Record<string, unknown>
    if (!ehUuid(b.tabela_id)) return { ok: false, erro: 'Escolha a tabela.' }
    return { ok: true, corpo: { tabela_id: b.tabela_id } }
}

/** "Alumínio Sul · sul-outubro.xlsx" — como uma tabela em uso é nomeada nas recusas. */
export const nomeDaTabelaEmUso = (t: Pick<TabelaEmUso, 'fornecedor_nome' | 'arquivo_nome'>) => `${t.fornecedor_nome} · ${t.arquivo_nome}`

/**
 * A recusa da troca de modelo ou nicho com tabela em uso — nomeia QUEM SEGURA, como as recusas
 * por RESTRICT desta área (EPIC §3.7).
 */
export function fraseDasTabelasQueSeguram(emUso: Pick<TabelaEmUso, 'fornecedor_nome' | 'arquivo_nome'>[]): string {
    const nomes = emUso.map(nomeDaTabelaEmUso).sort((a, b) => a.localeCompare(b, 'pt-BR'))
    return `O modelo e o nicho não podem ser trocados enquanto houver tabela em uso. Remova antes: ${nomes.join('; ')}.`
}

/** "Em uso por: A, B" — a frase do mockup (EPIC §3.7). Sem nomes, não há frase. */
export function emUsoPor(contas: string[]): string {
    return `Em uso por: ${[...new Set(contas)].sort((a, b) => a.localeCompare(b, 'pt-BR')).join(', ')}`
}
