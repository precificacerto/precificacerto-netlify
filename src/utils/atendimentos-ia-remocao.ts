/**
 * O CATÁLOGO É SOBERANO NAS QUATRO SEÇÕES — família, fornecedor, motor e etapa (dono do produto, 31/10/2026; migração 20261031000003).
 *
 * "A remoção é soberana. [...] Família, fornecedor, motor e etapa. Isso é soberano dentro do catálogo." Remover deixa de ser recusa por uso e passa a
 * ser ARRASTO DECLARADO E CONFIRMADO:
 *   1. a rota MEDE antes, sem apagar (`superadmin_arrasto_do_catalogo`): por tipo de linha, a quantidade e até dez nomes ("e mais N"); o que FICA
 *      (Storage, texto `fornecedor_perfil`, categorias da conta); os avisos; os impedimentos; e a ASSINATURA das quantidades;
 *   2. a tela mostra tudo e exige a confirmação explícita;
 *   3. só com a confirmação e a assinatura do que foi mostrado, a função apaga EXPLICITAMENTE, em ordem, numa transação, logando cada linha
 *      (`superadmin_remover_do_catalogo`). Se o arrasto mudou desde a medição, recusa e a tela mostra o novo.
 * AS FKs CONTINUAM COMO ESTÃO. DOCUMENTO DE CLIENTE NÃO É ARRASTADO: o item de levantamento fica e perde o vínculo.
 *
 * Este módulo é puro: os tipos da resposta, a leitura do corpo, a leitura da resposta (forma errada é ERRO, nunca arrasto vazio —
 * `ausente-vs-falso.md`) e as frases, com acento, do que a função devolve como dado.
 */
import { ehChaveDeFamilia, ehUuid, type Leitura } from '@/utils/atendimentos-ia-catalogo'

export const TIPOS_DE_REMOCAO = ['familia', 'fornecedor', 'motor', 'etapa'] as const
export type TipoDeRemocao = (typeof TIPOS_DE_REMOCAO)[number]
export const ehTipoDeRemocao = (v: unknown): v is TipoDeRemocao => typeof v === 'string' && (TIPOS_DE_REMOCAO as readonly string[]).includes(v)

/** O nome do que se remove, para o título da confirmação. */
export const NOME_DO_TIPO: Record<TipoDeRemocao, string> = { familia: 'a família', fornecedor: 'o fornecedor', motor: 'o motor', etapa: 'a etapa do catálogo' }

export const ROTA_DA_REMOCAO = '/api/super-admin/atendimentos-ia/catalogo/remover'
export const rotaDoArrasto = (tipo: TipoDeRemocao, chave: string) => `${ROTA_DA_REMOCAO}?tipo=${tipo}&chave=${encodeURIComponent(chave)}`

/** A chave de cada tipo: a família é a CHAVE do catálogo (texto); os outros três, o uuid da linha. */
export const chaveDaRemocaoValida = (tipo: TipoDeRemocao, chave: unknown): chave is string => (tipo === 'familia' ? ehChaveDeFamilia(chave) : ehUuid(chave))

export interface PassoDoArrasto {
    passo: number
    tabela: string
    acao: 'sai' | 'perde_o_vinculo'
    rotulo: string
    quantidade: number
    nomes: string[]
    mais: number
}
export interface FicaNoArrasto { rotulo: string; quantidade: number; nomes: string[]; mais: number }
export type AvisoDoArrasto =
    | { tipo: 'conversa_para'; tabela_id: string; arquivo: string; empresas: string[] }
    | { tipo: 'renumeracao' }
export interface ImpedimentoDoArrasto { tipo: 'vigentes_sem_familia'; fornecedor: string; categoria: string | null; tabelas: Array<{ id: string; arquivo: string }> }
export interface Arrasto {
    tipo: TipoDeRemocao
    chave: string
    nome: string
    passos: PassoDoArrasto[]
    ficam: FicaNoArrasto[]
    avisos: AvisoDoArrasto[]
    impedimentos: ImpedimentoDoArrasto[]
    sai: number
    perde_o_vinculo: number
    assinatura: string
}

const ehTexto = (v: unknown): v is string => typeof v === 'string'
const ehInteiro = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0
const ehListaDeTextos = (v: unknown): v is string[] => Array.isArray(v) && v.every(ehTexto)
const ehObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const ehNomeado = (v: unknown) => ehObjeto(v) && ehTexto(v.rotulo) && ehInteiro(v.quantidade) && ehListaDeTextos(v.nomes) && ehInteiro(v.mais)

function ehAviso(v: unknown): v is AvisoDoArrasto {
    if (!ehObjeto(v)) return false
    if (v.tipo === 'renumeracao') return true
    return v.tipo === 'conversa_para' && ehUuid(v.tabela_id) && ehTexto(v.arquivo) && ehListaDeTextos(v.empresas)
}
function ehImpedimento(v: unknown): v is ImpedimentoDoArrasto {
    return ehObjeto(v) && v.tipo === 'vigentes_sem_familia' && ehTexto(v.fornecedor) && (v.categoria === null || ehTexto(v.categoria))
        && Array.isArray(v.tabelas) && v.tabelas.every((t) => ehObjeto(t) && ehUuid(t.id) && ehTexto(t.arquivo))
}

/** A resposta da medição, conferida campo a campo. Forma errada é `null` — quem chama mostra ERRO, nunca um arrasto vazio. */
export function lerArrasto(v: unknown): Arrasto | null {
    if (!ehObjeto(v) || !ehTipoDeRemocao(v.tipo) || !ehTexto(v.chave) || !ehTexto(v.nome) || !ehInteiro(v.sai) || !ehInteiro(v.perde_o_vinculo)) return null
    if (!ehTexto(v.assinatura) || !/^[0-9a-f]{32}$/.test(v.assinatura)) return null
    if (!Array.isArray(v.passos) || !v.passos.every((p) => ehNomeado(p) && ehInteiro((p as Record<string, unknown>).passo)
        && ehTexto((p as Record<string, unknown>).tabela) && ['sai', 'perde_o_vinculo'].includes((p as Record<string, unknown>).acao as string))) return null
    if (!Array.isArray(v.ficam) || !v.ficam.every(ehNomeado)) return null
    if (!Array.isArray(v.avisos) || !v.avisos.every(ehAviso) || !Array.isArray(v.impedimentos) || !v.impedimentos.every(ehImpedimento)) return null
    return v as unknown as Arrasto
}

// ── O pedido de remoção ─────────────────────────────────────────────────────────────────────
export const CONFIRMACAO_OBRIGATORIA = 'A remoção só acontece com a confirmação explícita de quem leu o que sai (confirmo: true).'
export const ASSINATURA_OBRIGATORIA = 'Falta a assinatura do arrasto mostrado: meça de novo antes de remover.'
export const TIPO_DESCONHECIDO = 'Tipo de remoção desconhecido: só família, fornecedor, motor ou etapa.'
export const CHAVE_INVALIDA = 'O item do catálogo a remover não foi informado, ou não tem a forma do tipo.'

export interface PedidoDeRemocao { tipo: TipoDeRemocao; chave: string; assinatura: string }

/** O corpo do POST: `{ tipo, chave, assinatura, confirmo: true }` e nada mais. */
export function lerPedidoDeRemocao(corpo: unknown): Leitura<PedidoDeRemocao> {
    if (!ehObjeto(corpo)) return { ok: false, erro: 'O corpo do pedido não é um objeto.' }
    const fora = Object.keys(corpo).filter((k) => !['tipo', 'chave', 'assinatura', 'confirmo'].includes(k))
    if (fora.length > 0) return { ok: false, erro: `Campo desconhecido no corpo: ${fora.join(', ')} (só tipo, chave, assinatura e confirmo).` }
    if (!ehTipoDeRemocao(corpo.tipo)) return { ok: false, erro: TIPO_DESCONHECIDO }
    if (!chaveDaRemocaoValida(corpo.tipo, corpo.chave)) return { ok: false, erro: CHAVE_INVALIDA }
    if (corpo.confirmo !== true) return { ok: false, erro: CONFIRMACAO_OBRIGATORIA }
    if (!ehTexto(corpo.assinatura) || !/^[0-9a-f]{32}$/.test(corpo.assinatura)) return { ok: false, erro: ASSINATURA_OBRIGATORIA }
    return { ok: true, corpo: { tipo: corpo.tipo, chave: corpo.chave, assinatura: corpo.assinatura } }
}

// ── As frases ───────────────────────────────────────────────────────────────────────────────
export const ARRASTO_MUDOU = 'O que sai mudou desde que foi mostrado (alguém mexeu no catálogo ou nas contas). Nada foi removido: veja de novo o que sai e confirme.'
export const ITEM_INEXISTENTE = 'O item do catálogo não existe mais: talvez outra pessoa o tenha removido.'
export const REMOCAO_PASSOU_DO_TEMPO = 'A remoção passou do tempo e foi desfeita inteira: nada foi removido. Tente de novo.'

/** O rótulo de cada passo, com acento (a função manda ASCII). Passo que esta lista não conhece usa o rótulo da função. */
const ROTULO: Record<string, string> = {
    'orcamentista_levantamento_item:perde_o_vinculo': 'item de levantamento (documento de cliente — fica, perde o vínculo)',
    'orcamentista_familia_etapa:sai': 'etapa de conta',
    'orcamentista_familia_etapa:perde_o_vinculo': 'etapa de conta (fica sem motor)',
    'orcamentista_etapa_catalogo:sai': 'etapa do catálogo',
    'orcamentista_importacao:sai': 'importação',
    'orcamentista_tabela_item:sai': 'item de preço',
    'orcamentista_conta_tabela:sai': 'tabela escolhida por conta',
    'orcamentista_motor_familia:sai': 'ligação motor–família',
    'orcamentista_motor:sai': 'motor',
    'orcamentista_tabela:sai': 'tabela de fornecedor',
    'orcamentista_tabela:perde_o_vinculo': 'tabela de outra categoria (fica, perde a família)',
    'orcamentista_materia_prima:perde_o_vinculo': 'família de conta (fica, sem tipo)',
    'orcamentista_familia_ramificacao:sai': 'ramificação da família',
    'orcamentista_familia_catalogo:sai': 'família do catálogo',
    'orcamentista_mp_categoria_fornecedor:sai': 'fornecedor escolhido por conta',
    'orcamentista_fornecedor:sai': 'fornecedor',
}
export function rotuloDoPasso(p: Pick<PassoDoArrasto, 'tabela' | 'acao' | 'rotulo'>): string {
    const conhecido = ROTULO[`${p.tabela}:${p.acao}`]
    if (conhecido) return conhecido
    if (p.tabela.startsWith('orcamentista_motor_')) return `${p.rotulo === 'conteudo de motor da tabela' ? 'conteúdo de motor da tabela' : 'conteúdo do motor'} (${p.tabela.slice('orcamentista_motor_'.length).replace(/_/g, ' ')})`
    return p.rotulo
}

const ROTULO_DO_QUE_FICA: Record<string, string> = {
    'arquivo no Storage (fica)': 'arquivo no Storage',
    'texto fornecedor_perfil com este nome (fica)': 'texto "fornecedor_perfil" com este nome',
    'categoria da materia-prima, com os dados (fica)': 'categoria da família de conta, com os dados',
}
export const rotuloDoQueFica = (f: Pick<FicaNoArrasto, 'rotulo'>) => ROTULO_DO_QUE_FICA[f.rotulo] ?? f.rotulo

/** Os nomes e o resto: `A, B e mais 3`. Sem nomes, vazio. */
export function nomesComOResto(nomes: readonly string[], mais: number): string {
    if (nomes.length === 0) return ''
    return mais > 0 ? `${nomes.join(', ')} e mais ${mais.toLocaleString('pt-BR')}` : nomes.join(', ')
}

/** Os passos que mexem em alguma linha, separados entre os que SAEM e os que PERDEM O VÍNCULO (ficam), na ordem de execução. */
export function passosQueMexem(a: Pick<Arrasto, 'passos'>): { sai: PassoDoArrasto[]; perde: PassoDoArrasto[] } {
    const com = a.passos.filter((p) => p.quantidade > 0).sort((x, y) => x.passo - y.passo)
    return { sai: com.filter((p) => p.acao === 'sai'), perde: com.filter((p) => p.acao === 'perde_o_vinculo') }
}

/** Decisão 4 do dono do produto: o aviso EXPLÍCITO de que a conversa para. Sai quando o PR D entrar (a conversa passa a ler o motor pelo catálogo). */
export function fraseDoAviso(a: AvisoDoArrasto): string {
    if (a.tipo === 'renumeracao') return 'Nas famílias de conta que perdem uma etapa, as de baixo sobem um número (1..N, sem buraco).'
    const tabela = `${a.arquivo} (${a.tabela_id.slice(0, 8)})`
    const frase = a.empresas.length === 0
        ? `Nenhuma empresa usa hoje a tabela ${tabela}, de onde a conversa lê o motor no lugar do catálogo. `
        : `A conversa de ${a.empresas.join(', ')} PARA de funcionar até ser reconfigurada: ela ainda lê o motor pela tabela ${tabela}, não pelo catálogo. `
    return frase
        + 'Este aviso sai quando a conversa passar a ler o motor pelo catálogo (PR D).'
}

/** O impedimento: não é uso, é o conflito que o banco recusaria no meio — duas tabelas vigentes do mesmo fornecedor e categoria ficariam sem família. */
export function fraseDoImpedimento(i: ImpedimentoDoArrasto): string {
    const tabelas = i.tabelas.map((t) => `${t.arquivo} (${t.id.slice(0, 8)})`).join(', ')
    return `As tabelas ${tabelas} ficariam vigentes juntas, sem família (fornecedor ${i.fornecedor}, categoria ${i.categoria ?? 'sem categoria'}): `
        + 'arquive ou tire a vigência de uma delas antes de remover a família.'
}

/** O resumo da confirmação: `Sai: 62 linha(s). Fica e perde o vínculo: 3.` */
export function resumoDoArrasto(a: Pick<Arrasto, 'sai' | 'perde_o_vinculo'>): string {
    const partes = [`Sai: ${a.sai.toLocaleString('pt-BR')} linha(s).`]
    if (a.perde_o_vinculo > 0) partes.push(`Fica e perde o vínculo: ${a.perde_o_vinculo.toLocaleString('pt-BR')} linha(s).`)
    return partes.join(' ')
}

export const CONFIRMO_O_ARRASTO = 'Li o que sai e o que perde o vínculo, e confirmo a remoção.'
export const tituloDaRemocao = (tipo: TipoDeRemocao, nome: string) => `Remover ${NOME_DO_TIPO[tipo]} "${nome}"?`
