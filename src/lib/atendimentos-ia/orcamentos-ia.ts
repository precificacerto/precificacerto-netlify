/**
 * Atendimentos I.A. — os ORÇAMENTOS I.A. (dono do produto, 09/11/2026; migração `20261109000001_orcamento_ia`, PENDENTE até ser aplicada).
 *
 * As decisões, como foram ditas:
 *   - "tabela própria com os itens pendurados, com a coluna `origem` obrigatória (`agente` | `manual`) conferida pelo banco, e o orçamento
 *     apontando para o levantamento de onde veio. Não reaproveitar products." O orçamento criado na tela é `manual`, sem levantamento e com autor;
 *     o do agente vem de um levantamento e não tem autor humano — a CHECK `orcamentista_orcamento_origem_amarrada` não deixa trocar.
 *   - "a edição manual MARCA o orçamento, e a partir daí o agente NÃO sobrescreve calado": toda alteração feita pela tela grava
 *     `editado_manualmente_em` e `editado_manualmente_por`. Quem for escrever o agente que atualiza o orçamento lê a marca antes.
 *   - "sem excluir, sem estoque, sem seção, sem tabela de preços, sem cálculo de preço": nada aqui apaga, e o item que não vem no corpo da
 *     alteração fica como está. O banco também não deixa: o service_role não tem DELETE nas duas tabelas.
 *
 * Campo sem dado é NULO, nunca o default (`ausente-vs-falso.md`): texto vazio vira null; medida não dita fica null. Só a quantidade é obrigatória.
 * Sem a migração, toda leitura e escrita recusa com `FRASE_SEM_MIGRACAO` (`ErroSemMigracao`) — a tela a mostra, nada quebra.
 */
import { supabaseAdmin } from '@/supabase/admin'

export const TABELA_DO_ORCAMENTO = 'orcamentista_orcamento'
export const TABELA_DO_ITEM = 'orcamentista_orcamento_item'
export const FRASE_SEM_MIGRACAO = 'Os Orçamentos I.A. ainda não estão disponíveis: a estrutura do banco (migração 20261109000001) não foi aplicada.'
export const FRASE_NAO_ENCONTRADO = 'Orçamento não encontrado.'

export const LIMITE_DO_NOME = 120
export const LIMITE_DO_TEXTO_CURTO = 120
export const LIMITE_DA_OBS = 1000

export type Origem = 'agente' | 'manual'
export const ROTULO_DA_ORIGEM: Record<Origem, string> = { agente: 'Agente I.A.', manual: 'Manual' }

export type ItemDoOrcamento = {
    id: string
    ordem: number
    levantamento_item_id: string | null
    tipologia: string | null
    largura_mm: number | null
    altura_mm: number | null
    quantidade: number
    cor_perfil: string | null
    vidro: string | null
    obs: string | null
}
export type OrcamentoIA = {
    id: string
    numero: number
    origem: Origem
    levantamento_id: string | null
    nome: string
    obs: string | null
    editado_manualmente_em: string | null
    editado_manualmente_por: string | null
    criado_por: string | null
    criado_em: string
    atualizado_em: string
}
export type LinhaDaLista = OrcamentoIA & { itens: number }

export class ErroSemMigracao extends Error {
    constructor() { super(FRASE_SEM_MIGRACAO) }
}
export class ErroDeValidacao extends Error {
    constructor(readonly erros: string[]) { super(erros.join(' ')) }
}
export class ErroNaoEncontrado extends Error {
    constructor() { super(FRASE_NAO_ENCONTRADO) }
}

/** A tabela ainda não existe: o PostgREST diz PGRST205 (não está no cache) e o Postgres, 42P01. */
export const tabelaAusente = (e: { code?: string } | null | undefined) => e?.code === 'PGRST205' || e?.code === '42P01'

function falhou(tabela: string, error: { code?: string; message: string }): never {
    if (tabelaAusente(error)) throw new ErroSemMigracao()
    throw new Error(`${tabela}: ${error.message}`)
}

// ── A validação: o que a tela manda vira o que o banco aceita, ou uma recusa que nomeia o campo ──────────────────────────────
/** Texto aparado; vazio ou só espaço é NULO (não informado). Acima do limite, recusa. */
function textoOuNulo(v: unknown, rotulo: string, limite: number, erros: string[]): string | null {
    if (v === undefined || v === null) return null
    if (typeof v !== 'string') { erros.push(`${rotulo}: tem de ser texto.`); return null }
    const t = v.trim()
    if (t === '') return null
    if ([...t].length > limite) { erros.push(`${rotulo}: no máximo ${limite} caracteres (veio ${[...t].length}).`); return null }
    return t
}

/** Inteiro de 1 em diante, ou NULO quando não foi dito. Zero, negativo, fração ou texto recusam — nunca viram outro número. */
function inteiroPositivoOuNulo(v: unknown, rotulo: string, erros: string[]): number | null {
    if (v === undefined || v === null || v === '') return null
    const n = typeof v === 'string' ? Number(v.trim()) : v
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) { erros.push(`${rotulo}: tem de ser um número inteiro maior que zero.`); return null }
    return n
}

export type Cabecalho = { nome: string; obs: string | null }
export function validarCabecalho(corpo: { nome?: unknown; obs?: unknown }): Cabecalho {
    const erros: string[] = []
    const nome = textoOuNulo(corpo.nome, 'Nome do cliente', LIMITE_DO_NOME, erros)
    if (nome === null && erros.length === 0) erros.push('Nome do cliente: é obrigatório.')
    const obs = textoOuNulo(corpo.obs, 'Observação', LIMITE_DA_OBS, erros)
    if (erros.length) throw new ErroDeValidacao(erros)
    return { nome: nome as string, obs }
}

export type ItemValidado = Omit<ItemDoOrcamento, 'id' | 'ordem' | 'levantamento_item_id'> & { id: string | null }
export function validarItem(item: Record<string, unknown>, posicao: number): ItemValidado {
    const erros: string[] = []
    const r = (campo: string) => `Item ${posicao}, ${campo}`
    const quantidade = inteiroPositivoOuNulo(item.quantidade, r('quantidade'), erros)
    if (quantidade === null && !erros.some((e) => e.startsWith(r('quantidade')))) erros.push(`${r('quantidade')}: é obrigatória.`)
    const saida: ItemValidado = {
        id: typeof item.id === 'string' && item.id !== '' ? item.id : null,
        tipologia: textoOuNulo(item.tipologia, r('tipologia'), LIMITE_DO_TEXTO_CURTO, erros),
        largura_mm: inteiroPositivoOuNulo(item.largura_mm, r('largura (mm)'), erros),
        altura_mm: inteiroPositivoOuNulo(item.altura_mm, r('altura (mm)'), erros),
        quantidade: quantidade as number,
        cor_perfil: textoOuNulo(item.cor_perfil, r('cor do perfil'), LIMITE_DO_TEXTO_CURTO, erros),
        vidro: textoOuNulo(item.vidro, r('vidro'), LIMITE_DO_TEXTO_CURTO, erros),
        obs: textoOuNulo(item.obs, r('observação'), LIMITE_DA_OBS, erros),
    }
    if (erros.length) throw new ErroDeValidacao(erros)
    return saida
}

// ── A leitura ────────────────────────────────────────────────────────────────────────────────────────────────────────────
const COLUNAS_DO_ORCAMENTO = 'id, numero, origem, levantamento_id, nome, obs, editado_manualmente_em, editado_manualmente_por, criado_por, criado_em, atualizado_em'
const COLUNAS_DO_ITEM = 'id, ordem, levantamento_item_id, tipologia, largura_mm, altura_mm, quantidade, cor_perfil, vidro, obs'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- as tabelas são posteriores a `database.types.ts`
const db = () => supabaseAdmin as any

/** TODOS os orçamentos da empresa, os do agente e os manuais, do mais novo ao mais antigo, com quantos itens cada um tem. */
export async function listarOrcamentos(tenantId: string): Promise<LinhaDaLista[]> {
    const { data, error } = await db().from(TABELA_DO_ORCAMENTO).select(COLUNAS_DO_ORCAMENTO).eq('tenant_id', tenantId).order('numero', { ascending: false })
    if (error) falhou(TABELA_DO_ORCAMENTO, error)
    const orcamentos = (data ?? []) as OrcamentoIA[]
    if (orcamentos.length === 0) return []
    const { data: itens, error: e2 } = await db().from(TABELA_DO_ITEM).select('orcamento_id').eq('tenant_id', tenantId).in('orcamento_id', orcamentos.map((o) => o.id))
    if (e2) falhou(TABELA_DO_ITEM, e2)
    const porOrcamento = new Map<string, number>()
    for (const i of (itens ?? []) as Array<{ orcamento_id: string }>) porOrcamento.set(i.orcamento_id, (porOrcamento.get(i.orcamento_id) ?? 0) + 1)
    return orcamentos.map((o) => ({ ...o, itens: porOrcamento.get(o.id) ?? 0 }))
}

export async function lerOrcamento(tenantId: string, id: string): Promise<OrcamentoIA & { itens: ItemDoOrcamento[] }> {
    const { data, error } = await db().from(TABELA_DO_ORCAMENTO).select(COLUNAS_DO_ORCAMENTO).eq('tenant_id', tenantId).eq('id', id).maybeSingle()
    if (error) falhou(TABELA_DO_ORCAMENTO, error)
    if (!data) throw new ErroNaoEncontrado()
    const { data: itens, error: e2 } = await db().from(TABELA_DO_ITEM).select(COLUNAS_DO_ITEM).eq('tenant_id', tenantId).eq('orcamento_id', id).order('ordem')
    if (e2) falhou(TABELA_DO_ITEM, e2)
    return { ...(data as OrcamentoIA), itens: (itens ?? []) as ItemDoOrcamento[] }
}

// ── A escrita ────────────────────────────────────────────────────────────────────────────────────────────────────────────
const TENTATIVAS_DO_NUMERO = 3

/** O orçamento criado na tela: `manual`, sem levantamento, com o autor. O número é o próximo da empresa; a corrida no número tenta de novo. */
export async function criarOrcamentoManual(tenantId: string, autor: string, corpo: { nome?: unknown; obs?: unknown }): Promise<OrcamentoIA> {
    const cabecalho = validarCabecalho(corpo)
    for (let tentativa = 1; tentativa <= TENTATIVAS_DO_NUMERO; tentativa++) {
        const { data: ultimo, error: e1 } = await db().from(TABELA_DO_ORCAMENTO).select('numero').eq('tenant_id', tenantId).order('numero', { ascending: false }).limit(1)
        if (e1) falhou(TABELA_DO_ORCAMENTO, e1)
        const numero = (((ultimo ?? []) as Array<{ numero: number }>)[0]?.numero ?? 0) + 1
        const { data, error } = await db().from(TABELA_DO_ORCAMENTO)
            .insert({ tenant_id: tenantId, numero, origem: 'manual', levantamento_id: null, nome: cabecalho.nome, obs: cabecalho.obs, criado_por: autor })
            .select(COLUNAS_DO_ORCAMENTO).single()
        if (!error) return data as OrcamentoIA
        if (error.code === '23505' && tentativa < TENTATIVAS_DO_NUMERO) continue
        falhou(TABELA_DO_ORCAMENTO, error)
    }
    throw new Error(`${TABELA_DO_ORCAMENTO}: o número não foi reservado em ${TENTATIVAS_DO_NUMERO} tentativas`)
}

/**
 * A ALTERAÇÃO MANUAL: o cabeçalho, os itens que vieram com `id` (do orçamento, conferido) e os itens novos (sem `id`, no fim da ordem). O item
 * que não veio fica como está — não há exclusão. Tudo é validado ANTES de gravar; e a marca da edição manual é gravada com o cabeçalho.
 */
export async function alterarOrcamento(
    tenantId: string, autor: string, id: string, corpo: { nome?: unknown; obs?: unknown; itens?: unknown },
): Promise<OrcamentoIA & { itens: ItemDoOrcamento[] }> {
    const cabecalho = validarCabecalho(corpo)
    if (corpo.itens !== undefined && !Array.isArray(corpo.itens)) throw new ErroDeValidacao(['Itens: tem de ser uma lista.'])
    const erros: string[] = []
    const itens: ItemValidado[] = []
    ;((corpo.itens as unknown[] | undefined) ?? []).forEach((it, k) => {
        if (typeof it !== 'object' || it === null) { erros.push(`Item ${k + 1}: formato inválido.`); return }
        try { itens.push(validarItem(it as Record<string, unknown>, k + 1)) } catch (e) { if (e instanceof ErroDeValidacao) erros.push(...e.erros); else throw e }
    })
    if (erros.length) throw new ErroDeValidacao(erros)

    const atual = await lerOrcamento(tenantId, id)
    const doOrcamento = new Set(atual.itens.map((i) => i.id))
    const estranhos = itens.filter((i) => i.id !== null && !doOrcamento.has(i.id))
    if (estranhos.length) throw new ErroDeValidacao([`${estranhos.length === 1 ? 'Um item enviado não é' : `${estranhos.length} itens enviados não são`} deste orçamento.`])

    const agora = new Date().toISOString()
    const { error } = await db().from(TABELA_DO_ORCAMENTO)
        .update({ nome: cabecalho.nome, obs: cabecalho.obs, editado_manualmente_em: agora, editado_manualmente_por: autor, atualizado_em: agora })
        .eq('tenant_id', tenantId).eq('id', id)
    if (error) falhou(TABELA_DO_ORCAMENTO, error)

    let proxima = atual.itens.reduce((m, i) => Math.max(m, i.ordem), 0)
    for (const it of itens) {
        const { id: idDoItem, ...campos } = it
        if (idDoItem !== null) {
            // O VIDRO ESCOLHIDO É DO TEXTO DE QUANDO FOI ESCOLHIDO (20261112000006): trocar o texto do vidro anula o código — senão o custo leria
            // o vidro velho pelo código. Só quando o texto mudou: sem mudança, o insert é o de antes (e não depende da migração)
            const antes = atual.itens.find((i) => i.id === idDoItem)
            const vidroMudou = antes !== undefined && (antes.vidro ?? null) !== (campos.vidro ?? null)
            const { error: e } = await db().from(TABELA_DO_ITEM).update({ ...campos, ...(vidroMudou ? { vidro_codigo: null } : {}), atualizado_em: agora })
                .eq('tenant_id', tenantId).eq('orcamento_id', id).eq('id', idDoItem)
            if (e && vidroMudou && (e.code === '42703' || e.code === 'PGRST204')) {
                // sem a coluna, nenhum vidro foi escolhido: grava sem ela
                const { error: e2 } = await db().from(TABELA_DO_ITEM).update({ ...campos, atualizado_em: agora }).eq('tenant_id', tenantId).eq('orcamento_id', id).eq('id', idDoItem)
                if (e2) falhou(TABELA_DO_ITEM, e2)
            } else if (e) falhou(TABELA_DO_ITEM, e)
        } else {
            proxima += 1
            const { error: e } = await db().from(TABELA_DO_ITEM).insert({ ...campos, tenant_id: tenantId, orcamento_id: id, ordem: proxima, levantamento_item_id: null })
            if (e) falhou(TABELA_DO_ITEM, e)
        }
    }
    return lerOrcamento(tenantId, id)
}
