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
 *
 * O MOTOR SERVE N FAMÍLIAS E UMA CATEGORIA (dono do produto, 29/10/2026; migração 20261029000003, que substitui a "família só no Perfil" da
 * 20261029000002): "A gente define, bota o arquivo do motor, a qual categoria ele pertence e para quais famílias ele atua." As famílias moram na
 * ligação `orcamentista_motor_familia`; todo motor tem PELO MENOS UMA (o gatilho adiado `orcamentista_motor_sem_familia`, no COMMIT), e a etapa
 * de família X só aponta motor que atua em X (a FK `(motor_id, motor_familia_exigida) -> orcamentista_motor_familia (motor_id, familia)`). A família
 * NÃO se amarra mais a uma tabela da categoria do fornecedor. O corpo aqui recusa antes, com frase: lista vazia, família repetida ou fora do
 * formato; a rota recusa a família fora do catálogo, nomeando-a.
 */
import { arquivoImportavel, ehUuid, fraseDoArquivoNaoImportavel } from '@/utils/atendimentos-ia-catalogo'

const RAIZ = '/api/super-admin/atendimentos-ia/motores'

export const ROTAS_DOS_MOTORES = {
    /** GET → `{ motores }` (o catálogo inteiro, também os arquivados); POST `{ fornecedor_id, categoria, familias, path, nome }` cria. */
    lista: RAIZ,
    /** POST `{ motor_id }` — `superadmin_arquivar_motor`, que recusa o motor que uma etapa aponta. */
    arquivar: `${RAIZ}/arquivar`,
    /** POST `{ motor_id, path, nome }` — trocar o arquivo é MOTOR NOVO (`superadmin_trocar_arquivo_do_motor`, 20261029000001). */
    trocarArquivo: `${RAIZ}/trocar-arquivo`,
    /**
     * POST `{ motor_id, fornecedor_id, categoria, familias }` (`superadmin_editar_motor`, 20261029000003): fornecedor e categoria só em motor SEM USO;
     * as famílias também COM uso, e tirar a que uma etapa ou item usa é 409 nomeando quem usa.
     */
    editar: `${RAIZ}/editar`,
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
    /**
     * As FAMÍLIAS em que o motor atua (`orcamentista_motor_familia`, 20261029000003), as chaves do catálogo em ordem: pelo menos uma. A etapa
     * de família X só aponta motor que tem X aqui.
     */
    familias: string[]
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

export interface CorpoDoMotorNovo { fornecedor_id: string; categoria: string; familias: string[]; path: string; nome: string }
const CAMPOS_DO_MOTOR_NOVO = ['fornecedor_id', 'categoria', 'familias', 'path', 'nome']

export const FAMILIAS_DO_MOTOR_OBRIGATORIAS = 'Escolha pelo menos uma família em que o motor atua.'
export const FAMILIAS_DO_MOTOR_INVALIDAS = 'As famílias do motor vão numa lista de chaves do catálogo.'
export const fraseDaFamiliaRepetidaNoMotor = (familia: string) => `A família ${familia} aparece mais de uma vez na lista.`
export const fraseDaFamiliaForaDoCatalogo = (familias: readonly string[]) =>
    `${familias.length === 1 ? 'A família' : 'As famílias'} ${familias.join(', ')} não ${familias.length === 1 ? 'está' : 'estão'} no catálogo de famílias.`
/** Tirar do motor a família que uma etapa ou item usa: a frase da tela quando a recusa vem da FK (23503), sem o nome de quem usa. */
export const FAMILIA_EM_USO_NAO_SAI_DO_MOTOR =
    'Uma família que alguma etapa ou item de levantamento usa não sai do motor: aponte-os para outro motor antes. Nada foi gravado.'

/** As famílias do corpo: uma lista não vazia de chaves (texto), sem repetição. Que cada uma esteja no catálogo, a rota confere. */
function familiasDoCorpo(valor: unknown): Leitura<string[]> {
    if (valor === undefined || valor === null || (Array.isArray(valor) && valor.length === 0)) return { ok: false, erro: FAMILIAS_DO_MOTOR_OBRIGATORIAS }
    if (!Array.isArray(valor) || valor.some((f) => typeof f !== 'string' || f.trim() === '')) return { ok: false, erro: FAMILIAS_DO_MOTOR_INVALIDAS }
    const familias = (valor as string[]).map((f) => f.trim())
    const repetida = familias.find((f, i) => familias.indexOf(f) !== i)
    if (repetida !== undefined) return { ok: false, erro: fraseDaFamiliaRepetidaNoMotor(repetida) }
    return { ok: true, corpo: familias }
}

/** As famílias da lista que o catálogo não tem, na ordem em que vieram; vazio quando todas estão lá. */
export const familiasForaDoCatalogo = (familias: readonly string[], doCatalogo: readonly { chave: string }[]) =>
    familias.filter((f) => !doCatalogo.some((c) => c.chave === f))

/**
 * O corpo da criação: o fornecedor, a categoria, as famílias (pelo menos uma), o caminho que `url-de-envio` assinou (na pasta de motor DESTE
 * fornecedor) e o nome original. Campo a mais é erro — o autor é o da sessão. A categoria existir na lista é a função quem confere; as
 * famílias, a rota (antes de baixar o arquivo) e a função.
 */
export function lerCorpoDoMotorNovo(body: unknown): Leitura<CorpoDoMotorNovo> {
    const b = objeto(body)
    const extra = Object.keys(b).filter((k) => !CAMPOS_DO_MOTOR_NOVO.includes(k))
    if (extra.length > 0) return { ok: false, erro: `Campo desconhecido no corpo: ${extra.join(', ')} (só ${CAMPOS_DO_MOTOR_NOVO.join(', ')}).` }
    if (!ehUuid(b.fornecedor_id)) return { ok: false, erro: 'Escolha o fornecedor do motor.' }
    const categoria = texto(b.categoria)
    if (!categoria) return { ok: false, erro: 'Escolha a categoria do motor.' }
    const familias = familiasDoCorpo(b.familias)
    if (familias.ok === false) return familias
    const path = texto(b.path)
    const nome = texto(b.nome)
    if (!path || !nome) return { ok: false, erro: 'Falta o arquivo: o corpo leva o caminho do arquivo enviado e o nome dele.' }
    if (!path.startsWith(pastaDoMotorDoFornecedor(b.fornecedor_id)) || path.includes('..')) return { ok: false, erro: 'O arquivo não está na pasta de motor deste fornecedor.' }
    if (!arquivoImportavel(nome)) return { ok: false, erro: fraseDoArquivoNaoImportavel(nome) }
    return { ok: true, corpo: { fornecedor_id: b.fornecedor_id, categoria, familias: familias.corpo, path, nome } }
}

/** O corpo do arquivar: `{ motor_id }`. Campo a mais é erro. */
/** O corpo de TROCAR O ARQUIVO: o motor e o arquivo enviado (a rota confere que ele está na pasta do fornecedor DO MOTOR). */
export function lerCorpoDaTroca(body: unknown): Leitura<{ motor_id: string; path: string; nome: string }> {
    const b = objeto(body)
    const extra = Object.keys(b).filter((k) => !['motor_id', 'path', 'nome'].includes(k))
    if (extra.length > 0) return { ok: false, erro: `Campo desconhecido no corpo: ${extra.join(', ')} (só motor_id, path, nome).` }
    if (!ehUuid(b.motor_id)) return { ok: false, erro: 'O motor_id não é um uuid.' }
    const path = texto(b.path)
    const nome = texto(b.nome)
    if (!path || !nome) return { ok: false, erro: 'Falta o arquivo: o corpo leva o caminho do arquivo enviado e o nome dele.' }
    if (!arquivoImportavel(nome)) return { ok: false, erro: fraseDoArquivoNaoImportavel(nome) }
    return { ok: true, corpo: { motor_id: b.motor_id, path, nome } }
}

/**
 * O corpo de EDITAR: o motor, o fornecedor, a categoria e as famílias — sempre os três (o que não muda vai igual). As famílias são a lista
 * INTEIRA de depois (pelo menos uma): a que sai é a que estava e não veio.
 */
export function lerCorpoDaEdicao(body: unknown): Leitura<{ motor_id: string; fornecedor_id: string; categoria: string; familias: string[] }> {
    const b = objeto(body)
    const extra = Object.keys(b).filter((k) => !['motor_id', 'fornecedor_id', 'categoria', 'familias'].includes(k))
    if (extra.length > 0) return { ok: false, erro: `Campo desconhecido no corpo: ${extra.join(', ')} (só motor_id, fornecedor_id, categoria, familias).` }
    if (!ehUuid(b.motor_id)) return { ok: false, erro: 'O motor_id não é um uuid.' }
    if (!ehUuid(b.fornecedor_id)) return { ok: false, erro: 'Escolha o fornecedor do motor.' }
    const categoria = texto(b.categoria)
    if (!categoria) return { ok: false, erro: 'Escolha a categoria do motor.' }
    const familias = familiasDoCorpo(b.familias)
    if (familias.ok === false) return familias
    return { ok: true, corpo: { motor_id: b.motor_id, fornecedor_id: b.fornecedor_id, categoria, familias: familias.corpo } }
}

/** "Arquivo trocado: …" — o motor novo, as famílias que passaram a ele e o antigo arquivado. */
export function fraseDoArquivoTrocado(r: { tipologias: number; etapas_reapontadas: number }): string {
    const etapas = r.etapas_reapontadas === 0 ? 'nenhuma etapa usava o motor' : `${r.etapas_reapontadas} etapa(s) passaram ao motor novo`
    return `Arquivo trocado: motor novo com ${r.tipologias} tipologia(s); ${etapas}; o antigo foi arquivado, com o conteúdo intacto.`
}
/**
 * Por que categoria e fornecedor estão travados na edição: só se editam em motor SEM USO (dono do produto, 29/10/2026). As famílias se editam
 * com uso (20261029000003); a que uma etapa ou item usa não sai.
 */
export const MOTOR_COM_USO_NAO_SE_EDITA =
    'Este motor tem uso: categoria e fornecedor só se editam em motor sem uso; as famílias, sim, e a que alguma etapa usa não sai. Para outro arquivo, troque o arquivo.'
export const MOTOR_ARQUIVADO_NAO_SE_EDITA = 'O motor está arquivado: motor arquivado não se edita nem troca de arquivo.'

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
export function fraseDoMotorCriado(r: { regras: number; tipologias: number; detalhes?: number }): string {
    const tip = r.detalhes ?? r.tipologias
    return `Motor criado no catálogo: ${tip.toLocaleString('pt-BR')} ${tip === 1 ? 'tipologia' : 'tipologias'} e ${r.regras.toLocaleString('pt-BR')} ${r.regras === 1 ? 'regra' : 'regras'}. `
        + 'Nenhuma etapa o aponta ainda: escolha-o na etapa da família, na base de conhecimento da conta. Os tempos de fabricação não vêm no arquivo: este motor nasce sem tempo.'
}

/** "Wolf · Perfil · motor-wolff.xlsm" — como o motor aparece no combo da etapa e nas frases. */
export const rotuloDoMotor = (m: Pick<MotorDoCatalogo, 'fornecedor' | 'categoria' | 'arquivo_nome'>, rotuloDaCategoria: (c: string) => string = (c) => c) =>
    `${m.fornecedor} · ${rotuloDaCategoria(m.categoria)} · ${m.arquivo_nome}`

/**
 * Os motores que o combo da etapa oferece: os que ATUAM na família dela (20261029000003), não arquivados — os que a FK aceita. Primeiro os dos
 * fornecedores PRINCIPAIS desta família-instância (o motor da etapa busca fornecedores pelos códigos de cada perfil, e o principal é o
 * que a família já usa), depois os outros; dentro de cada grupo, por fornecedor e arquivo.
 */
export function motoresParaAEtapa(motores: readonly MotorDoCatalogo[], familia: string, principais: readonly string[]): MotorDoCatalogo[] {
    const principal = new Set(principais)
    return motores
        .filter((m) => m.familias.includes(familia) && m.arquivado_em === null)
        .sort((a, b) => Number(principal.has(b.fornecedor_id)) - Number(principal.has(a.fornecedor_id))
            || a.fornecedor.localeCompare(b.fornecedor, 'pt-BR') || a.arquivo_nome.localeCompare(b.arquivo_nome, 'pt-BR'))
}

/** "Esquadrias De Paula Ltda · Esquadrias de PVC WOLF" — quem usa, por nome. */
export const fraseDoUso = (u: UsoDoMotor) => `${u.empresa} · ${u.familia}`

export const MOTOR_SEM_USO = 'Nenhuma família usa este motor.'
export const fraseDoMotorEmUso = (n: number) =>
    `${n === 1 ? 'Uma família usa' : `${n} famílias usam`} este motor: troque o motor ${n === 1 ? 'dela' : 'delas'}, na base de conhecimento da conta, antes de arquivar.`
