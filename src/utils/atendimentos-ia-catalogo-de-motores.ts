/**
 * O CATÁLOGO DE MOTORES (dono do produto, 28/10/2026; migração 20261028000001): o motor é GLOBAL e COMPARTILHADO — "empresas diferentes
 * podem usar o mesmo motor" —, mora no CATÁLOGO (o antigo "Fornecedores e tabelas"), depois dos fornecedores, e cada um tem FAMÍLIA + CATEGORIA + FORNECEDOR
 * (`familia`: PVC, ALUMINIO…). A etapa da família-instância só SELECIONA um motor do catálogo; ela não sobe arquivo (subir motor de
 * dentro da página de uma conta criaria dado global fora do catálogo).
 *
 * Aqui mora o que é PURO e compartilhado entre a tela e as rotas: as URLs, a leitura do corpo, a ordem do combo da etapa e as frases.
 * O arquivo vai em dois passos, como o da tabela: `tabelas/url-de-envio` com `tipo: 'motor'` assina um caminho na pasta DO FORNECEDOR
 * (`<fornecedor>/motor/…`), o navegador manda os bytes, e `POST motores` lê o objeto e chama `superadmin_criar_motor`, que confere o
 * MESMO prefixo. Os bytes não passam pelas rotas.
 *
 * O motor novo NASCE SEM TEMPO e sem etapa: quem o aponta é a etapa, na base de conhecimento da conta.
 */
import { arquivoImportavel, ehUuid, fraseDoArquivoNaoImportavel } from '@/utils/atendimentos-ia-catalogo'

const RAIZ = '/api/super-admin/atendimentos-ia/motores'

export const ROTAS_DOS_MOTORES = {
    /** GET → `{ motores }` (o catálogo inteiro, também os arquivados); POST `{ fornecedor_id, categoria, familia, path, nome }` cria. */
    lista: RAIZ,
    /** POST `{ motor_id }` — `superadmin_arquivar_motor`, que recusa o motor que uma etapa aponta. */
    arquivar: `${RAIZ}/arquivar`,
}

/** A âncora do cartão dos motores na página do Catálogo: o link "cadastrar motor no catálogo" da etapa leva até ela. */
export const ANCORA_DO_CATALOGO_DE_MOTORES = 'motores'

/** A pasta do bucket onde mora o arquivo de motor de um fornecedor. A função do banco confere o MESMO prefixo. */
export const pastaDoMotorDoFornecedor = (fornecedorId: string) => `${fornecedorId}/motor/`

/**
 * Quem usa o motor: uma FAMÍLIA (o título digitado) de uma empresa — só nomes, nunca dado de cliente. A ETAPA NÃO APARECE no catálogo
 * (dono do produto, 29/10/2026: "etapa deve ser desconsiderada"): a etapa é da empresa, e o mesmo motor serve empresas que numeram
 * diferente. Três etapas da mesma família que apontam o motor são UM uso.
 */
export interface UsoDoMotor {
    empresa: string
    familia: string
}

/** Um motor do catálogo como as rotas o entregam. */
export interface MotorDoCatalogo {
    id: string
    /** O TIPO (`orcamentista_familia_catalogo.chave`): a etapa só aponta motor do mesmo tipo da família dela. */
    familia: string
    fornecedor_id: string
    fornecedor: string
    categoria: string
    arquivo_nome: string
    criado_em: string
    arquivado_em: string | null
    /** As tipologias que o arquivo trouxe; null quando a contagem não foi lida (a lista da etapa não precisa dela). */
    tipologias: number | null
    usos: UsoDoMotor[]
}

type Leitura<T> = { ok: true; corpo: T } | { ok: false; erro: string }
const objeto = (b: unknown): Record<string, unknown> => (b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {})
const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

export interface CorpoDoMotorNovo { fornecedor_id: string; categoria: string; familia: string; path: string; nome: string }
const CAMPOS_DO_MOTOR_NOVO = ['fornecedor_id', 'categoria', 'familia', 'path', 'nome']

/**
 * O corpo da criação: o fornecedor, a categoria, o tipo, o caminho que `url-de-envio` assinou (na pasta de motor DESTE fornecedor) e o
 * nome original. Campo a mais é erro — o autor é o da sessão. Categoria e tipo existirem na lista é a função quem confere.
 */
export function lerCorpoDoMotorNovo(body: unknown): Leitura<CorpoDoMotorNovo> {
    const b = objeto(body)
    const extra = Object.keys(b).filter((k) => !CAMPOS_DO_MOTOR_NOVO.includes(k))
    if (extra.length > 0) return { ok: false, erro: `Campo desconhecido no corpo: ${extra.join(', ')} (só ${CAMPOS_DO_MOTOR_NOVO.join(', ')}).` }
    if (!ehUuid(b.fornecedor_id)) return { ok: false, erro: 'Escolha o fornecedor do motor.' }
    const categoria = texto(b.categoria)
    if (!categoria) return { ok: false, erro: 'Escolha a categoria do motor.' }
    const familia = texto(b.familia)
    if (!familia) return { ok: false, erro: 'Escolha o tipo (família) do motor.' }
    const path = texto(b.path)
    const nome = texto(b.nome)
    if (!path || !nome) return { ok: false, erro: 'Falta o arquivo: o corpo leva o caminho do arquivo enviado e o nome dele.' }
    if (!path.startsWith(pastaDoMotorDoFornecedor(b.fornecedor_id)) || path.includes('..')) return { ok: false, erro: 'O arquivo não está na pasta de motor deste fornecedor.' }
    if (!arquivoImportavel(nome)) return { ok: false, erro: fraseDoArquivoNaoImportavel(nome) }
    return { ok: true, corpo: { fornecedor_id: b.fornecedor_id, categoria, familia, path, nome } }
}

/** O corpo do arquivar: `{ motor_id }`. Campo a mais é erro. */
export function lerCorpoDoArquivar(body: unknown): Leitura<{ motor_id: string }> {
    const b = objeto(body)
    const extra = Object.keys(b).filter((k) => k !== 'motor_id')
    if (extra.length > 0) return { ok: false, erro: `Campo desconhecido no corpo: ${extra.join(', ')} (só motor_id).` }
    if (!ehUuid(b.motor_id)) return { ok: false, erro: 'O motor_id não é um uuid.' }
    return { ok: true, corpo: { motor_id: b.motor_id } }
}

/**
 * O motivo da criação que falhou, com o CÓDIGO do banco quando não há frase própria (nunca o texto dele). A transação é uma só: em
 * todos os casos nada foi gravado.
 */
export function fraseDoMotorQueNaoFoiGravado(codigo: string | null): string {
    const nada = 'Nada foi gravado: o motor não foi criado.'
    if (codigo === '57014') return `O motor não foi gravado: a gravação passou do limite de tempo do banco (35 s) e foi interrompida. ${nada}`
    if (codigo) return `O motor não foi gravado: o banco recusou a gravação (código ${codigo}). ${nada}`
    return `O motor não foi gravado. ${nada}`
}

/** O que a tela diz quando o motor foi criado: quantas tipologias e regras entraram, e a lembrança dos tempos e da etapa. */
/**
 * A FAMÍLIA DO MOTOR DE PERFIL VEM DA TABELA DE PERFIL DO FORNECEDOR (dono do produto, 29/10/2026): o motor de perfil cita os códigos
 * daquela linha. Sem tabela de Perfil, não há de onde tirar; com uma família só, ela vem escolhida; com mais de uma, escolhe-se entre elas.
 */
export const fraseSemTabelaDePerfil = (fornecedor = 'O fornecedor') =>
    `${fornecedor} não tem tabela de Perfil: a família do motor de Perfil vem dela. Cadastre a tabela de Perfil do fornecedor antes do motor.`
export const fraseDaFamiliaForaDoPerfil = (familia: string, doPerfil: readonly string[]) =>
    `A família do motor de Perfil vem da tabela de Perfil do fornecedor (${doPerfil.join(', ')}), e ${familia} não está entre elas.`

export function fraseDoMotorCriado(r: { regras: number; tipologias: number; detalhes?: number }): string {
    const tip = r.detalhes ?? r.tipologias
    return `Motor criado no catálogo: ${tip.toLocaleString('pt-BR')} ${tip === 1 ? 'tipologia' : 'tipologias'} e ${r.regras.toLocaleString('pt-BR')} ${r.regras === 1 ? 'regra' : 'regras'}. `
        + 'Nenhuma etapa o aponta ainda: escolha-o na etapa da família, na base de conhecimento da conta. Os tempos de fabricação não vêm no arquivo: este motor nasce sem tempo.'
}

/** "Wolf · Perfil · motor-wolff.xlsm" — como o motor aparece no combo da etapa e nas frases. */
export const rotuloDoMotor = (m: Pick<MotorDoCatalogo, 'fornecedor' | 'categoria' | 'arquivo_nome'>, rotuloDaCategoria: (c: string) => string = (c) => c) =>
    `${m.fornecedor} · ${rotuloDaCategoria(m.categoria)} · ${m.arquivo_nome}`

/**
 * Os motores que o combo da etapa oferece: do MESMO TIPO da família e não arquivados (os que a função aceita). Primeiro os dos
 * fornecedores PRINCIPAIS desta família-instância (o motor da etapa busca fornecedores pelos códigos de cada perfil, e o principal é o
 * que a família já usa), depois os outros; dentro de cada grupo, por fornecedor e arquivo.
 */
export function motoresParaAEtapa(motores: readonly MotorDoCatalogo[], familia: string, principais: readonly string[]): MotorDoCatalogo[] {
    const principal = new Set(principais)
    return motores
        .filter((m) => m.familia === familia && m.arquivado_em === null)
        .sort((a, b) => Number(principal.has(b.fornecedor_id)) - Number(principal.has(a.fornecedor_id))
            || a.fornecedor.localeCompare(b.fornecedor, 'pt-BR') || a.arquivo_nome.localeCompare(b.arquivo_nome, 'pt-BR'))
}

/** "Esquadrias De Paula Ltda · Esquadrias de PVC WOLF" — quem usa, por nome. */
export const fraseDoUso = (u: UsoDoMotor) => `${u.empresa} · ${u.familia}`

export const MOTOR_SEM_USO = 'Nenhuma família usa este motor.'
export const fraseDoMotorEmUso = (n: number) =>
    `${n === 1 ? 'Uma família usa' : `${n} famílias usam`} este motor: troque o motor ${n === 1 ? 'dela' : 'delas'}, na base de conhecimento da conta, antes de arquivar.`
