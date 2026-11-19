/**
 * A AUTORIZAÇÃO DA MEDIDA FORA DO LIMITE (dono do produto, 18/11/2026, decisão 1, o caso Daiane Pilger): "Você deve questionar como pedindo
 * autorização para fabricar da mesma forma. Aí sim pode ser feito o levantamento e dando sequência nos orçamentos. Isso não é algo que pode
 * prejudicar, mas tem que ter a liberação." E: "A autorização fica GRAVADA no item, com quem autorizou e quando — é preciso saber depois quem
 * liberou uma peça fora de especificação. Sem resposta, não calcula."
 *
 * Mora no próprio item (migração `20261118000001`): o PEDIDO (a tipologia e a medida como foram perguntadas, e quando) e a AUTORIZAÇÃO (o
 * remetente que disse sim, e quando). A autorização vale para AQUELA tipologia e AQUELA medida: a medida que muda não herda a liberação.
 * Sem a migração (42703/PGRST204), a leitura devolve `sem_migracao` e a conversa segue como antes: a medida fora do limite pede a medida certa.
 */
import { supabaseAdmin } from '@/supabase/admin'

export const MIGRACAO_DA_AUTORIZACAO = '20261118000001_autorizacao_da_medida_fora_do_limite'

/** O que está gravado no item sobre o limite: o pedido e, se houve, quem autorizou. */
export type LimiteDoItem = {
    ordem: number
    tipologia: string
    largura_mm: number | null
    altura_mm: number | null
    autorizadoPor: string | null
}
type ComMedida = { tipologia: string | null; largura_mm: number | null; altura_mm: number | null }

const colunaAusente = (e: { code?: string } | null | undefined) => e?.code === '42703' || e?.code === 'PGRST204'
const COLUNAS = 'ordem, limite_tipologia, limite_largura_mm, limite_altura_mm, limite_autorizado_por'
const mesmaMedida = (l: LimiteDoItem, i: ComMedida) => l.largura_mm === i.largura_mm && l.altura_mm === i.altura_mm

/** A autorização vale para o item: foi dada, e a tipologia e a medida dele são as autorizadas. */
export const autorizacaoVale = (l: LimiteDoItem | undefined, i: ComMedida): boolean =>
    l !== undefined && l.autorizadoPor !== null && l.tipologia === i.tipologia && mesmaMedida(l, i)

/** O pedido está em aberto para o item: ainda sem resposta, o item sem tipologia e com a medida que foi perguntada. */
export const pedidoEmAberto = (l: LimiteDoItem | undefined, i: ComMedida): boolean =>
    l !== undefined && l.autorizadoPor === null && i.tipologia === null && mesmaMedida(l, i)

/** O que está gravado e não vale mais (a medida ou a tipologia mudou): sai inteiro, pedido e autorização juntos. */
export const limiteVencido = (l: LimiteDoItem | undefined, i: ComMedida): boolean =>
    l !== undefined && !autorizacaoVale(l, i) && !pedidoEmAberto(l, i)

export async function lerLimites(tenantId: string, levantamentoId: string): Promise<Map<number, LimiteDoItem> | 'sem_migracao'> {
    const { data, error } = await supabaseAdmin.from('orcamentista_levantamento_item').select(COLUNAS)
        .eq('tenant_id', tenantId).eq('levantamento_id', levantamentoId).not('limite_tipologia', 'is', null)
    if (error) {
        if (colunaAusente(error)) return 'sem_migracao'
        throw new Error(`orcamentista_levantamento_item (limite): ${error.message}`)
    }
    const linhas = (data ?? []) as unknown as Array<Record<string, unknown>>
    return new Map(linhas.map((r) => [Number(r.ordem), {
        ordem: Number(r.ordem), tipologia: String(r.limite_tipologia),
        largura_mm: typeof r.limite_largura_mm === 'number' ? r.limite_largura_mm : null,
        altura_mm: typeof r.limite_altura_mm === 'number' ? r.limite_altura_mm : null,
        autorizadoPor: typeof r.limite_autorizado_por === 'string' ? r.limite_autorizado_por : null,
    }]))
}

/** O levantamento que nasce nesta mensagem não tem item gravado: a sonda diz só se as colunas existem (a migração aplicada). */
export async function limitesDisponiveis(tenantId: string): Promise<Map<number, LimiteDoItem> | 'sem_migracao'> {
    const { error } = await supabaseAdmin.from('orcamentista_levantamento_item').select('limite_tipologia').eq('tenant_id', tenantId).limit(1)
    if (error) {
        if (colunaAusente(error)) return 'sem_migracao'
        throw new Error(`orcamentista_levantamento_item (limite): ${error.message}`)
    }
    return new Map()
}

/** O que a conversa grava num item, depois de gravar o levantamento: pedir, autorizar ou limpar. */
export type MudancaDoLimite =
    | { tipo: 'pedir'; ordem: number; tipologia: string; largura_mm: number | null; altura_mm: number | null }
    | { tipo: 'autorizar'; ordem: number; por: string }
    | { tipo: 'limpar'; ordem: number }

/**
 * Grava cada mudança pela (empresa, levantamento, ordem) — a chave única do item — e confere que atingiu UMA linha (R1). A autorização só
 * pega o item cujo pedido ainda está sem resposta. Sem a migração, nada se grava e devolve `sem_migracao`.
 */
export async function gravarLimites(tenantId: string, levantamentoId: string, mudancas: readonly MudancaDoLimite[]): Promise<'ok' | 'sem_migracao'> {
    const agora = new Date().toISOString()
    const nada = null as string | null
    for (const m of mudancas) {
        const valores = m.tipo === 'pedir'
            ? { limite_tipologia: m.tipologia, limite_largura_mm: m.largura_mm, limite_altura_mm: m.altura_mm, limite_pedido_em: agora, limite_autorizado_por: nada, limite_autorizado_em: nada }
            : m.tipo === 'autorizar' ? { limite_autorizado_por: m.por, limite_autorizado_em: agora }
                : { limite_tipologia: nada, limite_largura_mm: nada, limite_altura_mm: nada, limite_pedido_em: nada, limite_autorizado_por: nada, limite_autorizado_em: nada }
        let q = supabaseAdmin.from('orcamentista_levantamento_item').update(valores)
            .eq('tenant_id', tenantId).eq('levantamento_id', levantamentoId).eq('ordem', m.ordem)
        if (m.tipo === 'autorizar') q = q.not('limite_tipologia', 'is', null).is('limite_autorizado_por', null)
        const { data, error } = await q.select('id')
        if (error) {
            if (colunaAusente(error)) return 'sem_migracao'
            throw new Error(`orcamentista_levantamento_item (limite, item ${m.ordem}): ${error.message}`)
        }
        if ((data ?? []).length !== 1) throw new Error(`orcamentista_levantamento_item (limite, item ${m.ordem}): o update atingiu ${(data ?? []).length} linha(s), e devia atingir 1`)
    }
    return 'ok'
}
