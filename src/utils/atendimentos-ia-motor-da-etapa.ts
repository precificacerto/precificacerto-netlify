/**
 * O MOTOR QUE A ETAPA SOBE (dono do produto, 27/10/2026; migração 20261027000010): a lista de etapas da família é a lista de motores.
 * Cada etapa tem o seu campo de arquivo; subir o arquivo CRIA a linha em `orcamentista_motor` (família = a da etapa, sem fornecedor) e
 * JÁ aponta a etapa, numa transação só (`superadmin_criar_motor_da_etapa`). O motor é GLOBAL (opção A): não se duplica por conta.
 *
 * Aqui mora o que é PURO e compartilhado entre a tela e as rotas: as URLs, o caminho no bucket, a leitura dos dois corpos e as frases.
 * O arquivo vai em dois passos, como o da tabela: a rota assina o envio para um caminho que ELA escolhe (`familia/<chave>/motor/…`),
 * o navegador manda os bytes, e a segunda rota lê o objeto do bucket e chama a função. Os bytes não passam pelas rotas.
 *
 * Trocar o arquivo é subir outro na mesma etapa: o motor novo nasce, a etapa passa a apontá-lo, e o velho fica arquivável (a função
 * `superadmin_arquivar_motor` recusa arquivar o que uma etapa ainda aponta). O motor novo NASCE SEM TEMPO: os tempos de fabricação
 * ficam como estão (`orcamentista_motor_tipologia_tempo`, dívida registrada em `tabela-de-preco-por-categoria.md`).
 */
import { arquivoImportavel, fraseDoArquivoNaoImportavel, nomeSeguroParaOBucket } from '@/utils/atendimentos-ia-catalogo'

const RAIZ = '/api/super-admin/atendimentos-ia/familias'

/** POST `{ nome }` → `{ path, signedUrl }`: assina o envio para a pasta DA FAMÍLIA. */
export const rotaDoEnvioDoMotor = (familia: string) => `${RAIZ}/${encodeURIComponent(familia)}/motor-url-de-envio`
/** POST `{ path, nome }`: lê o objeto, cria o motor e aponta a etapa. */
export const rotaDoMotorDaEtapa = (familia: string, etapaId: string) => `${RAIZ}/${encodeURIComponent(familia)}/etapas/${encodeURIComponent(etapaId)}/motor`

/** A pasta do bucket onde mora o arquivo de motor de uma família. A função do banco confere o MESMO prefixo. */
export const pastaDoMotorDaFamilia = (familia: string) => `familia/${familia}/motor/`

/** `familia/<chave>/motor/<id único>-<nome seguro>` — a pasta da família é a primeira. */
export const caminhoDoMotorDaFamilia = (familia: string, nome: string, idUnico: string) => `${pastaDoMotorDaFamilia(familia)}${idUnico}-${nomeSeguroParaOBucket(nome)}`

type Leitura<T> = { ok: true; corpo: T } | { ok: false; erro: string }

const objeto = (b: unknown): Record<string, unknown> => (b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {})
const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** O pedido de URL de envio: a rota decide o caminho; o navegador só manda o nome original. Só o que a leitura abre (.xlsx, .xlsm). */
export function lerPedidoDeEnvioDoMotor(body: unknown): Leitura<{ nome: string }> {
    const nome = texto(objeto(body).nome)
    if (!nome) return { ok: false, erro: 'Arquivo sem nome.' }
    if (!arquivoImportavel(nome)) return { ok: false, erro: fraseDoArquivoNaoImportavel(nome) }
    return { ok: true, corpo: { nome } }
}

/** O corpo da subida: o caminho que a rota assinou (na pasta da família) e o nome original. Campo a mais é erro — o autor é o da sessão. */
export function lerCorpoDaSubidaDoMotor(body: unknown, familia: string): Leitura<{ path: string; nome: string }> {
    const b = objeto(body)
    const extra = Object.keys(b).filter((k) => k !== 'path' && k !== 'nome')
    if (extra.length > 0) return { ok: false, erro: `Campo desconhecido no corpo: ${extra.join(', ')} (só path e nome).` }
    const path = texto(b.path)
    const nome = texto(b.nome)
    if (!path || !nome) return { ok: false, erro: 'O corpo é { path, nome }: o caminho do arquivo enviado e o nome dele.' }
    if (!path.startsWith(pastaDoMotorDaFamilia(familia)) || path.includes('..')) return { ok: false, erro: 'O arquivo não está na pasta de motor desta família.' }
    if (!arquivoImportavel(nome)) return { ok: false, erro: fraseDoArquivoNaoImportavel(nome) }
    return { ok: true, corpo: { path, nome } }
}

/**
 * O motivo da gravação que falhou, com o CÓDIGO do banco quando não há frase própria (nunca o texto dele). A transação é uma só:
 * em todos os casos nada foi gravado — nem o motor, nem as linhas, nem o apontamento da etapa.
 */
export function fraseDoMotorQueNaoFoiGravado(codigo: string | null): string {
    const nada = 'Nada foi gravado: o motor não foi criado e a etapa continua apontando o que apontava.'
    if (codigo === '57014') return `O motor não foi gravado: a gravação passou do limite de tempo do banco (35 s) e foi interrompida. ${nada}`
    if (codigo === '55P03') return `O motor não foi gravado: a família estava travada por outra operação (outra subida de arquivo ou a gravação da lista de etapas). ${nada}`
    if (codigo) return `O motor não foi gravado: o banco recusou a gravação (código ${codigo}). ${nada}`
    return `O motor não foi gravado. ${nada}`
}

/** O que a tela diz quando o motor foi criado: quantas tipologias e regras entraram, e a lembrança dos tempos. */
export function fraseDoMotorCriado(r: { regras: number; tipologias: number; detalhes?: number }): string {
    const tip = r.detalhes ?? r.tipologias
    return `Motor criado: ${tip.toLocaleString('pt-BR')} ${tip === 1 ? 'tipologia' : 'tipologias'} e ${r.regras.toLocaleString('pt-BR')} ${r.regras === 1 ? 'regra' : 'regras'}. A etapa já aponta o motor novo. Os tempos de fabricação não vêm no arquivo: este motor nasce sem tempo.`
}

/**
 * O AVISO de que o motor é GLOBAL (opção A): vale para todas as contas da família. Editar etapa ou subir arquivo aqui muda o que as
 * outras contas da mesma família enxergam — o aviso nomeia quantas e quais, por NOME (nunca dado de cliente).
 */
export function avisoDoMotorGlobal(contas: readonly string[]): string {
    const base = 'O motor e as etapas são da plataforma: o que for alterado aqui vale para TODAS as contas desta família, não só para esta.'
    if (contas.length === 0) return base
    return `${base} Contas que usam esta família: ${[...contas].sort((a, b) => a.localeCompare(b, 'pt-BR')).join(', ')}.`
}
