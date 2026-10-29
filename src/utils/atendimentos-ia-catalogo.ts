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
    /** As categorias (as ramificações) da plataforma, NA ORDEM: de onde a tabela nova escolhe a sua (27/10/2026). */
    categorias: '/api/super-admin/atendimentos-ia/categorias',
    tabela: (id: string) => `/api/super-admin/atendimentos-ia/tabelas/${id}`,
    urlDeEnvio: '/api/super-admin/atendimentos-ia/tabelas/url-de-envio',
    /** A importação da tabela: POST importa os dois arquivos; GET a última importação, ou null. */
    importacao: (tabelaId: string) => `/api/super-admin/atendimentos-ia/tabelas/${tabelaId}/importar`,
    /** O que está no banco da tabela importada: as tipologias, já ordenadas pela rota, e o total de fórmulas. */
    conteudoDaTabela: (tabelaId: string) => `/api/super-admin/atendimentos-ia/tabelas/${tabelaId}/conteudo`,
    /** Bloco 2C.1 — as contas com o Atendimentos I.A. ligado (só nome, modelo e nicho). */
    contas: '/api/super-admin/atendimentos-ia/contas',
    /** POST envia um PDF de teste ao remetente ativo da conta, pela conexão do orçamentista (26/10/2026). */
    testeDeAnexo: (tenantId: string) => `/api/super-admin/atendimentos-ia/contas/${tenantId}/teste-de-anexo`,
    /** As FAMÍLIAS das tabelas (26/10/2026): GET a lista, na ordem; POST acrescenta `{ rotulo }` no fim. */
    familias: '/api/super-admin/atendimentos-ia/familias',
} as const

/**
 * O ÚNICO modelo que usa fornecedor → tabela → motor. Decisão do dono do produto, 19/10/2026
 * (EPIC §3.2). Nas palavras dele: "Prestação de serviço vai considerar os produtos e os serviços
 * salvos dentro do sistema"; e, sobre Revenda, "o motor dele vai considerar a base de
 * conhecimento, que são os produtos salvos no próprio sistema".
 *
 * Aplicada em 20/10/2026 ao USO POR CONTA. O CATÁLOGO não é restrito — nicho, fornecedor e tabela
 * podem existir nos três modelos. Desde 26/10/2026 as tabelas da conta são DERIVADAS da base de
 * conhecimento (`tabelas-da-conta.ts`), e a troca de modelo continua recusada enquanto a base vincular
 * fornecedor com tabela (`gravarModeloENicho`, na rota PATCH da conta).
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

// ── O nicho é o CONTAINER (dono do produto, 29/10/2026, opção A) ─────────────────────────────
/** As abas da página do nicho, nesta ordem: famílias, fornecedores e motores vivem DENTRO do nicho. */
export const ABAS_DO_NICHO = ['familias', 'fornecedores', 'motores'] as const
export type AbaDoNicho = (typeof ABAS_DO_NICHO)[number]
export const ROTULO_DA_ABA_DO_NICHO: Record<AbaDoNicho, string> = { familias: 'Famílias', fornecedores: 'Fornecedores', motores: 'Motores' }
/** A aba pedida na URL, ou a primeira — o que não é aba vira a primeira, nunca uma aba vazia. */
export const abaDoNicho = (v: unknown): AbaDoNicho => (ABAS_DO_NICHO as readonly unknown[]).includes(v) ? (v as AbaDoNicho) : 'familias'
/** O endereço da página de um nicho, opcionalmente já numa aba. */
export const rotaDoNicho = (nichoId: string, aba?: AbaDoNicho) =>
    `/super-admin/atendimentos-ia/catalogo/${encodeURIComponent(nichoId)}${aba ? `?aba=${aba}` : ''}`
/**
 * A FAMÍLIA É GLOBAL (dono do produto, 29/10/2026): `orcamentista_familia_catalogo` não tem nicho, e não ganha agora — 12 nichos, um só com
 * fornecedores, nenhuma família além da PVC Wolf. É DÍVIDA registrada em `tabela-de-preco-por-categoria.md`, e a tela diz.
 */
export const AVISO_DA_FAMILIA_GLOBAL =
    'As famílias são da plataforma, não do nicho: a lista abaixo é a mesma em todos os nichos. Acrescentar uma família aqui a acrescenta em todos.'
export const NICHO_NAO_ENCONTRADO = 'Nicho não encontrado.'

/**
 * O ARQUIVO DO MOTOR NA TABELA É OPCIONAL EM TODA CATEGORIA (dono do produto, 27/10/2026, à noite): o motor mora na FAMÍLIA, em
 * `orcamentista_motor`, e entra pela etapa. A exigência que a `20261027000007` pôs na tabela de Perfil (CHECK
 * `orcamentista_tabela_perfil_exige_motor`) nasceu de manhã e saiu à noite, na `20261027000009`: não estava errada, o desenho mudou.
 */
export const MENSAGEM_MOTOR_INCOMPLETO = 'O arquivo do motor chegou pela metade: faltou o caminho ou o nome. Envie de novo.'
/**
 * O ARQUIVO DE UMA TABELA JÁ IMPORTADA NÃO SE TROCA (dono do produto, 29/10/2026). Os itens gravados são os do arquivo de antes: trocar só o
 * arquivo deixaria a tabela apontando um arquivo que não é o dos itens dela — e a rota apagava o objeto antigo. Em 29/10/2026, às 16:07, uma
 * edição trocou o arquivo da tabela da Wolff (735 itens) e a rota apagou o `.xlsm` original do bucket. Arquivo novo é TABELA NOVA.
 */
export const fraseDoArquivoDaTabelaImportada = (itens: number) =>
    `Esta tabela já tem ${itens.toLocaleString('pt-BR')} ${itens === 1 ? 'item importado' : 'itens importados'} do arquivo de antes: o arquivo dela não se troca. `
    + 'Para um arquivo novo, cadastre uma tabela nova do fornecedor, com a categoria dele. Nada foi alterado.'
export const MENSAGEM_MOTOR_NAO_SAI = 'O arquivo do motor não se apaga da tabela: troque por outro.'

// ── A FAMÍLIA da tabela (dono do produto, 26/10/2026; migração 20261026000004) ─────────────
/**
 * O primeiro degrau da cascata FAMÍLIA -> LINHA -> TIPOLOGIA -> PERFIS, VIDROS, INSUMOS -> PREÇO.
 * LISTA FECHADA (`orcamentista_familia_catalogo`), que o super admin acrescenta pela tela; a família
 * é atributo da TABELA DO FORNECEDOR, escolhida da lista no cadastro — nunca deduzida do prefixo de
 * `linha` nem de `orcamentista_motor_regra.segmento`. A conta pode ter duas tabelas da mesma família.
 * O que o motor chama de "família" (a aba "Fórmulas da família") é a LINHA.
 */
export interface Familia { chave: string; rotulo: string; ordem: number }

/**
 * A FAMÍLIA É OBRIGATÓRIA SÓ NA TABELA DE PERFIL (dono do produto, 28/10/2026; migração 20261028000002): a tabela de perfil é de UMA linha
 * (o motor daquela linha cita os códigos do perfil dela); a de ferragem, vidro, acessórios, persianas, reforço e instalação é da categoria
 * e serve qualquer linha — "a ferragem da Celsus é a mesma para PVC Wolf e PVC Veca". O banco tem a terceira trava
 * (CHECK `orcamentista_tabela_familia_no_perfil`).
 */
export const CATEGORIA_QUE_EXIGE_FAMILIA = 'PERFIL'
export const ROTULO_QUALQUER_LINHA = 'Qualquer linha'
export const familiaObrigatoria = (categoria: string | null | undefined) => categoria === CATEGORIA_QUE_EXIGE_FAMILIA
export const MENSAGEM_FAMILIA_OBRIGATORIA = 'A tabela de Perfil precisa da família: o motor da linha cita os códigos do perfil dela. Escolha a família.'
/** A trava do banco: tabela de PERFIL sem família (`orcamentista_tabela_familia_no_perfil`, 23514). */
export const ehTravaDaFamiliaNoPerfil = (e: unknown): boolean => /orcamentista_tabela_familia_no_perfil/.test((e as { message?: string } | null)?.message ?? '')
/** O nome de família que já existe, sem olhar a caixa: duas famílias com o mesmo nome no catálogo confundem quem escolhe. */
export const fraseDaFamiliaComNomeRepetido = (rotulo: string) => `Já há uma família chamada "${rotulo}" no catálogo.`
export const fraseDaFamiliaDesconhecida = (chave: string) => `A família "${chave}" não está na lista de famílias.`
/** O limite do rótulo: o mesmo da CHECK `orcamentista_familia_catalogo_rotulo_forma`. */
export const LIMITE_DO_ROTULO_DA_FAMILIA = 60
/** A forma da chave: a mesma da CHECK `orcamentista_familia_catalogo_chave_forma`. */
const FORMA_DA_CHAVE_DA_FAMILIA = /^[A-Z][A-Z0-9_]{0,39}$/
export const ehChaveDeFamilia = (v: unknown): v is string => typeof v === 'string' && FORMA_DA_CHAVE_DA_FAMILIA.test(v)

/** O 23505 é o do índice da tabela vigente (`orcamentista_tabela_uma_vigente`), e não outro. */
export const ehIndiceDaVigente = (e: unknown): boolean => /orcamentista_tabela_uma_vigente/.test((e as { message?: string } | null)?.message ?? '')
export const fraseDaVigenteQueJaExiste = (familia: string | null, arquivo: string, categoria: string | null = null) =>
    `Já há uma tabela vigente deste fornecedor na família ${familia ?? 'não informada'}${categoria === null ? '' : ` e na categoria ${categoria}`}: ${arquivo}. Desmarque-a antes de marcar outra.`

/** O 23503 é o da FK da família da tabela (`orcamentista_tabela_familia_fkey`), e não o do fornecedor: a mensagem do banco diz qual. */
export const ehFkDaFamilia = (e: unknown): boolean => /orcamentista_tabela_familia_fkey/.test((e as { message?: string } | null)?.message ?? '')

/** A chave da família pelo rótulo: maiúscula, sem acento, palavras unidas por "_", até 40. Sem letra no começo, null. */
export function chaveDaFamilia(rotulo: string): string | null {
    const chave = rotulo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40).replace(/_+$/, '')
    return ehChaveDeFamilia(chave) ? chave : null
}

// ── A CATEGORIA da tabela (dono do produto, 27/10/2026; migração 20261027000005) ─────────────
/**
 * UMA TABELA = UMA CATEGORIA (a ramificação: PERFIL, REFORCO, VIDRO…), da lista `orcamentista_categoria_catalogo`.
 * Obrigatória na tabela NOVA — a rota recusa, e o banco é a terceira trava. Uma vez dada, não se troca: tabela de
 * outra categoria é tabela nova. As de antes ficam sem (`null`): a da Wolff traz mais de uma categoria do
 * fornecedor no arquivo e não pode declarar uma só (`.claude/rules/tabela-de-preco-por-categoria.md`).
 * Não confundir com a CATEGORIA DO FORNECEDOR (`COLUNA_DA_CATEGORIA_DO_FORNECEDOR`), que é o que o arquivo traz
 * em cada item: a importação confere que o arquivo traz UMA só, mas não deduz uma da outra.
 */
export interface Categoria { chave: string; rotulo: string; ordem: number }

export const MENSAGEM_CATEGORIA_OBRIGATORIA = 'Escolha a categoria da tabela.'
export const fraseDaCategoriaDesconhecida = (chave: string) => `A categoria "${chave}" não está na lista de categorias.`
/** A forma da chave: a das chaves do catálogo (PERFIL, ACESSORIOS_VEDACAO…). A lista é conferida pela rota. */
const FORMA_DA_CHAVE_DA_CATEGORIA = /^[A-Z][A-Z0-9_]{0,39}$/
export const ehChaveDeCategoria = (v: unknown): v is string => typeof v === 'string' && FORMA_DA_CHAVE_DA_CATEGORIA.test(v)

const mensagemDoErro = (e: unknown): string => (e as { message?: string } | null)?.message ?? ''
/** O 23503 é o da FK da categoria da tabela (`orcamentista_tabela_categoria_fkey`), e não o da família nem o do fornecedor. */
export const ehFkDaCategoria = (e: unknown): boolean => /orcamentista_tabela_categoria_fkey/.test(mensagemDoErro(e))
/** O 23514 da CHECK do par: o caminho do motor sem o nome, ou o nome sem o caminho. */
export const ehTravaDoMotorPelaMetade = (e: unknown): boolean => /orcamentista_tabela_motor_par/.test(mensagemDoErro(e))
/** O 23514 da trava de INSERT: tabela nova sem categoria. */
export const ehTravaDaCategoriaObrigatoria = (e: unknown): boolean => /orcamentista_tabela_categoria_obrigatoria/.test(mensagemDoErro(e))
/** O 23514 da trava de UPDATE: a categoria dada não se troca nem se apaga. */
export const ehTravaDaCategoriaQueNaoSeTroca = (e: unknown): boolean => /orcamentista_tabela_categoria_nao_se_troca/.test(mensagemDoErro(e))
export const fraseDaCategoriaQueNaoSeTroca = (atual: string, pedida: string) =>
    `A categoria da tabela é ${atual} e não se troca${pedida === atual ? '' : ` (pedida: ${pedida})`}: para outra categoria, suba outra tabela.`

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
    /**
     * As categorias das tabelas DESTE fornecedor, sem repetição e em ordem (a categoria é da TABELA, não do fornecedor — 27/10/2026). É de
     * onde o cadastro de motor tira "os fornecedores daquela categoria" (28/10/2026). Tabela sem categoria não entra em categoria nenhuma.
     */
    categorias_das_tabelas: string[]
    /**
     * As FAMÍLIAS das tabelas de PERFIL deste fornecedor, sem repetição e em ordem: é de onde o motor de PERFIL tira a família (dono do produto,
     * 29/10/2026: "derivar da tabela de PERFIL do fornecedor quando ela existir"). A tabela de Perfil sempre tem família (`20261028000002`).
     */
    familias_do_perfil: string[]
}

export interface TabelaDoFornecedor {
    id: string
    fornecedor_id: string
    arquivo_nome: string
    arquivo_path: string
    /** Nulos nas tabelas de preço puro (Reforço, Acessórios…): só a de Perfil leva o arquivo do motor. */
    motor_nome: string | null
    motor_path: string | null
    vigencia: string | null
    /** A chave da família; null = não informada (as tabelas de antes de 26/10/2026). */
    familia: string | null
    /** A chave da categoria da tabela (27/10/2026); null = não declarada (as tabelas de antes). */
    categoria_chave: string | null
    /**
     * A tabela vigente do fornecedor na família dela (migração 20261026000005): decide o que levantamento NOVO
     * usa. No máximo uma por (fornecedor, família). A `vigencia` acima continua sendo só texto do consultor.
     */
    vigente: boolean
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

// ── As tabelas da conta, DERIVADAS da base de conhecimento (26/10/2026) ───────────────────
/**
 * Uma tabela da conta, como as recusas a nomeiam. SÓ catálogo — fornecedor e arquivo — e é a
 * REGRA INVIOLÁVEL: nada do conteúdo da conta.
 */
export interface TabelaEmUso {
    tabela_id: string
    fornecedor_id: string
    fornecedor_nome: string
    arquivo_nome: string
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
    /** Nulos quando a tabela não leva arquivo de motor (o normal); os dois vêm juntos. */
    motor_path: string | null
    motor_nome: string | null
    vigencia: string | null
    /** A chave da família, da lista; a rota confere que está na lista. Obrigatória só na tabela de PERFIL; nas outras, null = serve qualquer linha. */
    familia: string | null
    /** A chave da categoria, da lista. Obrigatória na tabela nova; a rota confere que está na lista. */
    categoria_chave: string
}

/** A família nova: `{ rotulo }`, aparado, com a chave derivada dele. */
export function lerFamiliaNova(body: unknown): Leitura<{ rotulo: string; chave: string }> {
    const rotulo = textoAparado(obj(body).rotulo)
    if (!rotulo) return { ok: false, erro: 'Escreva o nome da família.' }
    if (rotulo.length > LIMITE_DO_ROTULO_DA_FAMILIA) return { ok: false, erro: `O nome da família tem ${rotulo.length} caracteres; o limite é ${LIMITE_DO_ROTULO_DA_FAMILIA}.` }
    const chave = chaveDaFamilia(rotulo)
    if (!chave) return { ok: false, erro: 'O nome da família precisa começar por uma letra.' }
    return { ok: true, corpo: { rotulo, chave } }
}

/**
 * A tabela NOVA. O MOTOR É OPCIONAL EM TODA CATEGORIA (dono do produto, 27/10/2026, à noite): o motor mora na família, em
 * `orcamentista_motor`, e entra pela etapa. Se vier um motor, é gravado como veio (a Estrela já tem o dela); chegar pela metade —
 * caminho sem nome, ou o contrário — é recusa, aqui na rota, e o banco tem a terceira trava (CHECK `orcamentista_tabela_motor_par`).
 *
 * A CATEGORIA TAMBÉM É OBRIGATÓRIA (dono do produto, 27/10/2026): tabela sem categoria é recusa, aqui na rota; a
 * trava de INSERT do banco (23514) é a terceira.
 */
export function lerCorpoDaTabela(body: unknown): Leitura<CorpoDaTabela> {
    const b = obj(body)
    if (!ehUuid(b.fornecedor_id)) return { ok: false, erro: 'Fornecedor inválido.' }
    const fornecedor_id = b.fornecedor_id
    const arquivo_path = textoAparado(b.arquivo_path)
    const arquivo_nome = textoAparado(b.arquivo_nome)
    if (!arquivo_path || !arquivo_nome) return { ok: false, erro: 'Suba o arquivo da tabela.' }
    if (!ehChaveDeCategoria(b.categoria_chave)) return { ok: false, erro: MENSAGEM_CATEGORIA_OBRIGATORIA }
    const motor_path = textoAparado(b.motor_path)
    const motor_nome = textoAparado(b.motor_nome)
    if (!motor_path !== !motor_nome) return { ok: false, erro: MENSAGEM_MOTOR_INCOMPLETO }
    if (!dentroDoFornecedor(arquivo_path, fornecedor_id) || (motor_path !== null && !dentroDoFornecedor(motor_path, fornecedor_id))) {
        return { ok: false, erro: 'Os arquivos não pertencem a este fornecedor.' }
    }
    // ausente ou nulo é "sem família" (serve qualquer linha) — só no Perfil a família é obrigatória
    const semFamilia = b.familia === undefined || b.familia === null
    if (semFamilia ? familiaObrigatoria(b.categoria_chave) : !ehChaveDeFamilia(b.familia)) return { ok: false, erro: MENSAGEM_FAMILIA_OBRIGATORIA }
    return { ok: true, corpo: { fornecedor_id, arquivo_path, arquivo_nome, motor_path, motor_nome, vigencia: textoAparado(b.vigencia), familia: semFamilia ? null : b.familia as string, categoria_chave: b.categoria_chave } }
}

/** A EDIÇÃO de uma tabela: cada arquivo troca inteiro (caminho E nome) ou não troca; o motor não sai. */
export interface EdicaoDaTabela {
    arquivo?: { path: string; nome: string }
    motor?: { path: string; nome: string }
    /** `undefined` = não mexe; `null` = apaga a vigência. */
    vigencia?: string | null
    /** `undefined` = não mexe; `null` = tira a família (a tabela serve qualquer linha) — a rota recusa na tabela de PERFIL. */
    familia?: string | null
    /** `undefined` = não mexe. A categoria se DÁ uma vez (a de antes não tem) e depois não se troca nem se apaga. */
    categoria?: string
    /** `undefined` = não mexe. A marca de vigente (migração 20261026000005): no máximo uma por fornecedor e família. */
    vigente?: boolean
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
        if (tipo === 'motor' && !p && !n) return { ok: false, erro: MENSAGEM_MOTOR_NAO_SAI }
        if (!p || !n) return { ok: false, erro: tipo === 'motor' ? MENSAGEM_MOTOR_INCOMPLETO : 'Suba o arquivo da tabela.' }
        if (!dentroDoFornecedor(p, fornecedorId)) return { ok: false, erro: 'Os arquivos não pertencem a este fornecedor.' }
        out[tipo] = { path: p, nome: n }
    }
    if ('vigencia' in b) out.vigencia = textoAparado(b.vigencia)
    if ('familia' in b) {
        if (b.familia === null) out.familia = null
        else if (!ehChaveDeFamilia(b.familia)) return { ok: false, erro: MENSAGEM_FAMILIA_OBRIGATORIA }
        else out.familia = b.familia
    }
    if ('categoria_chave' in b) {
        if (!ehChaveDeCategoria(b.categoria_chave)) return { ok: false, erro: MENSAGEM_CATEGORIA_OBRIGATORIA }
        out.categoria = b.categoria_chave
    }
    if ('vigente' in b) {
        if (typeof b.vigente !== 'boolean') return { ok: false, erro: 'A marca de vigente é sim ou não.' }
        out.vigente = b.vigente
    }
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

/** "Alumínio Sul · sul-outubro.xlsx" — como uma tabela da conta é nomeada nas recusas. */
export const nomeDaTabelaEmUso = (t: Pick<TabelaEmUso, 'fornecedor_nome' | 'arquivo_nome'>) => `${t.fornecedor_nome} · ${t.arquivo_nome}`

/**
 * A TRAVA DO MODELO E DO NICHO, que continua existindo e mudou de fonte (dono do produto, 26/10/2026): ela é
 * sobre as tabelas DERIVADAS — as dos fornecedores que a base de conhecimento da conta vincula. O aviso fica na
 * tela, junto do modelo e do nicho; a recusa (409) nomeia QUEM SEGURA, como as recusas por RESTRICT desta área
 * (EPIC §3.7). Fornecedor vinculado SEM tabela não trava: a trava sempre foi sobre tabela.
 */
export const AVISO_DA_TRAVA_DO_MODELO_E_NICHO =
    'Enquanto a base de conhecimento desta conta vincular fornecedor com tabela cadastrada, o modelo e o nicho não podem ser trocados. '
    + 'Para trocar, tire esses fornecedores da base de conhecimento antes.'
export function fraseDasTabelasQueSeguram(emUso: Pick<TabelaEmUso, 'fornecedor_nome' | 'arquivo_nome'>[]): string {
    const nomes = emUso.map(nomeDaTabelaEmUso).sort((a, b) => a.localeCompare(b, 'pt-BR'))
    return `O modelo e o nicho não podem ser trocados enquanto a base de conhecimento desta conta vincular fornecedor com tabela cadastrada: ${nomes.join('; ')}. `
        + 'Tire esses fornecedores da base de conhecimento antes.'
}

/** "Em uso por: A, B" — a frase do mockup (EPIC §3.7). Sem nomes, não há frase. */
export function emUsoPor(contas: string[]): string {
    return `Em uso por: ${[...new Set(contas)].sort((a, b) => a.localeCompare(b, 'pt-BR')).join(', ')}`
}
