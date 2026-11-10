/**
 * A TRAVESSIA do levantamento para o orçamento I.A. (dono do produto, 10/11/2026): o levantamento COMPLETO vira um `orcamentista_orcamento`
 * do agente, com um item por item do levantamento. Dois gatilhos, ESTE código: o "sim" da confirmação na conversa e a ação manual da seção
 * Orçamentos I.A. (um levantamento por vez, o selecionado).
 *
 * O que vai, e de onde:
 *   - o orçamento: `origem = 'agente'`, `levantamento_id` = a origem, `nome` = o nome do levantamento, `criado_por` NULO (a CHECK
 *     `orcamentista_orcamento_origem_amarrada`: o do agente não tem autor humano — por isso a ação manual também não grava quem clicou);
 *   - CONGELADO, nunca relido depois — SÓ o que muda preço, e todos já têm coluna: `comissao_percentual`, `comissao_modo`,
 *     `reserva_tecnica_percentual`, `reserva_tecnica_responsavel`, `lucro_projetado_percentual`;
 *   - o APROVEITAMENTO é do orçamento, não do levantamento (dono do produto, 10/11/2026): primeiro a base de conhecimento; sem resposta, o
 *     fallback SEM, origem `fallback_barra_inteira`, com o motivo, e sem autor. Medido em 10/11/2026: a base não tem o campo do modo em
 *     nenhuma das quatro tabelas (esquadrias base, padrão, base de conhecimento, nicho) — ela não responde, e o fallback é o que vale;
 *   - os itens: `levantamento_item_id`, a ordem, `tipologia`, `largura_mm`, `altura_mm`, `quantidade`, `cor_perfil`, `vidro`, `ambientes` e
 *     `escolhas`, como estão no levantamento;
 *   - NÃO forma preço: `valor_venda` e `valor_operacao_interna` ficam nulos; o custo é o "Calcular" (`calcularOrcamento`).
 *
 * O CLIENTE E O VENDEDOR NÃO SÃO COPIADOS (dono do produto, 10/11/2026): a tela os lê do levantamento, por `levantamento_id`, no mesmo tenant;
 * o congelamento do que o cliente recebeu é o arquivo "Orçamento" (`orcamentista_orcamento_arquivo`, com o sha256).
 *
 * VAZIO NÃO É ZERO: o percentual que o levantamento não tem nasce NULO no orçamento, e a falta é nomeada (`faltasDoCongelado`) — nada é lido
 * do tenant, nada vira 0. IDEMPOTENTE por levantamento: o orçamento que já existe (o índice `orcamentista_orcamento_um_por_levantamento`) é
 * recusa que diz qual é — salvo o que existe SEM nenhum item (a travessia interrompida entre as duas escritas), que recebe os itens agora.
 * ISOLAMENTO: toda leitura e escrita leva o `tenant_id` do chamador; o levantamento de outra empresa é "não encontrado". NADA no levantamento
 * é alterado: esta travessia só lê `orcamentista_levantamento` e `orcamentista_levantamento_item`.
 */
import { supabaseAdmin } from '@/supabase/admin'
import { ErroNaoEncontrado, ErroSemMigracao, TABELA_DO_ITEM, TABELA_DO_ORCAMENTO, tabelaAusente } from './orcamentos-ia'
import { lerPerfilDoVendedor } from './arquivo-do-levantamento'
import { calcularOrcamento, ErroDoCalculo } from './orcamento-calculado'
import {
    ESTADO_COMPLETO, ErroDaTravessia, ErroJaAtravessado, faltasDoCongelado, origemNaTela, planoDaTravessia, PERCENTUAIS_COM_ZERO,
    type ClienteDoLevantamento, type ItemDaTravessia, type ItemDoLevantamentoNaTravessia, type LevantamentoNaTravessia, type ModoDaBase,
    type OrigensDosPercentuais, type PercentualComZero, type PercentualNaTela,
} from './travessia-do-levantamento-plano'

export * from './travessia-do-levantamento-plano'

const TENTATIVAS_DO_NUMERO = 5
const numeroOuNulo = (v: unknown): number | null => {
    if (v === null || v === undefined || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
}
const textoOuNulo = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

// ── A ESCRITA ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- as tabelas são posteriores a `database.types.ts`
const db = () => supabaseAdmin as any
function falhou(tabela: string, error: { code?: string; message: string }): never {
    if (tabelaAusente(error)) throw new ErroSemMigracao()
    throw new Error(`${tabela}: ${error.message}`)
}
const COLUNAS_DO_LEVANTAMENTO = 'id, tenant_id, numero, nome, estado, comissao_percentual, comissao_modo, reserva_tecnica_percentual, reserva_tecnica_responsavel, lucro_projetado_percentual, vendedor_employee_id'
const COLUNAS_DO_ITEM_DO_LEVANTAMENTO = 'id, ordem, tipologia, largura_mm, altura_mm, quantidade, cor_perfil, vidro, ambientes, escolhas'
/** O índice que faz "um orçamento por levantamento" no banco: a violação dele é a segunda travessia que perdeu a corrida. */
const INDICE_UM_POR_LEVANTAMENTO = 'orcamentista_orcamento_um_por_levantamento'

/**
 * O modo de aproveitamento da base de conhecimento para o orçamento. A base NÃO tem o campo hoje (medido em 10/11/2026): não há o que ler,
 * e a resposta é nula — o fallback. Quando o campo existir, é aqui que ele é lido; nunca um nome de chave inventado antes.
 */
export async function modoDaBaseDeConhecimento(_tenantId: string): Promise<ModoDaBase> {
    void _tenantId
    return null
}

export type ResultadoDaTravessia = { orcamento: { id: string; numero: number }; itens: number; faltas: string[]; retomada: boolean; origens: OrigensDosPercentuais }

/** O orçamento que já existe para o levantamento, com quantos itens tem. */
async function orcamentoDoLevantamento(tenantId: string, levantamentoId: string): Promise<{ id: string; numero: number; itens: number } | null> {
    const { data, error } = await db().from(TABELA_DO_ORCAMENTO).select('id, numero').eq('tenant_id', tenantId).eq('levantamento_id', levantamentoId).maybeSingle()
    if (error) falhou(TABELA_DO_ORCAMENTO, error)
    if (!data) return null
    const r = await db().from(TABELA_DO_ITEM).select('id').eq('tenant_id', tenantId).eq('orcamento_id', data.id)
    if (r.error) falhou(TABELA_DO_ITEM, r.error)
    return { id: data.id as string, numero: data.numero as number, itens: (r.data ?? []).length }
}

async function gravarItens(tenantId: string, orcamentoId: string, itens: readonly ItemDaTravessia[]) {
    if (itens.length === 0) return
    const { error } = await db().from(TABELA_DO_ITEM).insert(itens.map((i) => ({ ...i, tenant_id: tenantId, orcamento_id: orcamentoId })))
    if (error) falhou(TABELA_DO_ITEM, error)
}

/**
 * Atravessa o levantamento `levantamentoId` da empresa `tenantId`. Recusa nomeada (`ErroDaTravessia`), já atravessado (`ErroJaAtravessado`),
 * ou o orçamento criado. Só LÊ o levantamento; só ESCREVE em `orcamentista_orcamento` e `orcamentista_orcamento_item`.
 */
export async function atravessarLevantamento(tenantId: string, levantamentoId: string): Promise<ResultadoDaTravessia> {
    const { data: lev, error } = await db().from('orcamentista_levantamento').select(COLUNAS_DO_LEVANTAMENTO).eq('tenant_id', tenantId).eq('id', levantamentoId).maybeSingle()
    if (error) falhou('orcamentista_levantamento', error)
    if (!lev || lev.tenant_id !== tenantId) throw new ErroNaoEncontrado()
    const r = await db().from('orcamentista_levantamento_item').select(COLUNAS_DO_ITEM_DO_LEVANTAMENTO).eq('tenant_id', tenantId).eq('levantamento_id', levantamentoId)
    if (r.error) falhou('orcamentista_levantamento_item', r.error)
    // a pré-definição de contexto da base (o perfil do vendedor do levantamento), lida no tenant do chamador — o (b) da regra do zero
    const doVendedor = await lerPerfilDoVendedor(tenantId, textoOuNulo(lev.vendedor_employee_id))
    const plano = planoDaTravessia(lev as LevantamentoNaTravessia, (r.data ?? []) as ItemDoLevantamentoNaTravessia[], await modoDaBaseDeConhecimento(tenantId), doVendedor)
    // `'recusas' in`, e não `ok`: com `strictNullChecks: false` (o tsconfig daqui) o tsc não estreita a união pelo booleano
    if ('recusas' in plano) throw new ErroDaTravessia(plano.recusas)

    const existente = await orcamentoDoLevantamento(tenantId, levantamentoId)
    if (existente && existente.itens > 0) throw new ErroJaAtravessado(lev.numero, existente.id, existente.numero)
    if (existente) {
        // a travessia que parou entre as duas escritas: o orçamento existe sem item nenhum, e recebe os itens agora
        await gravarItens(tenantId, existente.id, plano.itens)
        return { orcamento: { id: existente.id, numero: existente.numero }, itens: plano.itens.length, faltas: plano.faltas, retomada: true, origens: plano.origens }
    }
    for (let tentativa = 1; tentativa <= TENTATIVAS_DO_NUMERO; tentativa++) {
        const { data: ultimo, error: e1 } = await db().from(TABELA_DO_ORCAMENTO).select('numero').eq('tenant_id', tenantId).order('numero', { ascending: false }).limit(1)
        if (e1) falhou(TABELA_DO_ORCAMENTO, e1)
        const numero = (((ultimo ?? []) as Array<{ numero: number }>)[0]?.numero ?? 0) + 1
        const { data: criado, error: e2 } = await db().from(TABELA_DO_ORCAMENTO).insert({ ...plano.orcamento, numero }).select('id, numero').single()
        if (!e2) {
            try {
                await gravarItens(tenantId, criado.id, plano.itens)
            } catch (e) {
                throw new Error(`o orçamento ${criado.numero} foi criado sem os itens (atravesse de novo para gravá-los): ${e instanceof Error ? e.message : e}`)
            }
            return { orcamento: { id: criado.id, numero: criado.numero }, itens: plano.itens.length, faltas: plano.faltas, retomada: false, origens: plano.origens }
        }
        if (e2.code === '23505' && `${e2.message} ${e2.details ?? ''}`.includes(INDICE_UM_POR_LEVANTAMENTO)) {
            const outro = await orcamentoDoLevantamento(tenantId, levantamentoId)
            if (outro) throw new ErroJaAtravessado(lev.numero, outro.id, outro.numero)
        }
        if (e2.code === '23505' && tentativa < TENTATIVAS_DO_NUMERO) continue
        falhou(TABELA_DO_ORCAMENTO, e2)
    }
    throw new Error(`${TABELA_DO_ORCAMENTO}: o número não foi reservado em ${TENTATIVAS_DO_NUMERO} tentativas`)
}

/** Os levantamentos COMPLETOS da empresa, com o orçamento de cada um (nulo quando ainda não atravessou) — para a ação manual escolher UM. */
export async function levantamentosParaAtravessar(tenantId: string): Promise<Array<{ id: string; numero: number; nome: string; orcamento: { id: string; numero: number } | null }>> {
    const { data, error } = await db().from('orcamentista_levantamento').select('id, numero, nome').eq('tenant_id', tenantId).eq('estado', ESTADO_COMPLETO).order('numero', { ascending: false })
    if (error) falhou('orcamentista_levantamento', error)
    const levs = (data ?? []) as Array<{ id: string; numero: number; nome: string }>
    if (levs.length === 0) return []
    const o = await db().from(TABELA_DO_ORCAMENTO).select('id, numero, levantamento_id').eq('tenant_id', tenantId).in('levantamento_id', levs.map((l) => l.id))
    if (o.error) falhou(TABELA_DO_ORCAMENTO, o.error)
    const porLev = new Map(((o.data ?? []) as Array<{ id: string; numero: number; levantamento_id: string }>).map((x) => [x.levantamento_id, { id: x.id, numero: x.numero }]))
    return levs.map((l) => ({ ...l, orcamento: porLev.get(l.id) ?? null }))
}

const COLUNAS_DO_CLIENTE = 'numero, nome, telefone, email, endereco, edificacao, obs_obra, data_entrega, vendedor_nome, vendedor_employee_id'

/** O cliente do levantamento `levantamentoId`, no tenant do chamador; nulo quando não há levantamento (o orçamento manual) ou ele não é achado. */
export async function lerClienteDoLevantamento(tenantId: string, levantamentoId: string | null): Promise<ClienteDoLevantamento | null> {
    if (!levantamentoId) return null
    const { data, error } = await db().from('orcamentista_levantamento').select(COLUNAS_DO_CLIENTE).eq('tenant_id', tenantId).eq('id', levantamentoId).maybeSingle()
    if (error) falhou('orcamentista_levantamento', error)
    if (!data) return null
    const { numero, ...resto } = data as { numero: number } & Omit<ClienteDoLevantamento, 'levantamento_numero'>
    return { levantamento_numero: numero, ...resto }
}

/** As faltas do que o orçamento `id` congelou, lidas das colunas dele (nulo é falta; nunca o default). Vazia para o orçamento manual. */
export async function faltasDoOrcamento(tenantId: string, id: string): Promise<string[]> {
    const { data, error } = await db().from(TABELA_DO_ORCAMENTO).select('origem, comissao_modo').eq('tenant_id', tenantId).eq('id', id).maybeSingle()
    if (error) falhou(TABELA_DO_ORCAMENTO, error)
    if (!data || data.origem !== 'agente') return []
    return faltasDoCongelado({ comissao_modo: textoOuNulo(data.comissao_modo) })
}

/**
 * Os três percentuais do orçamento do agente com a ORIGEM ao lado, derivada por comparação com o levantamento e com a pré-definição do
 * vendedor (`origemNaTela`) — sem coluna. Vazia para o orçamento manual. Tudo no tenant do chamador.
 */
export async function percentuaisDoOrcamento(tenantId: string, id: string): Promise<PercentualNaTela[]> {
    const { data: orc, error } = await db().from(TABELA_DO_ORCAMENTO).select(`origem, levantamento_id, ${PERCENTUAIS_COM_ZERO.join(', ')}`)
        .eq('tenant_id', tenantId).eq('id', id).maybeSingle()
    if (error) falhou(TABELA_DO_ORCAMENTO, error)
    if (!orc || orc.origem !== 'agente' || !orc.levantamento_id) return []
    const { data: lev, error: e2 } = await db().from('orcamentista_levantamento').select(`vendedor_employee_id, ${PERCENTUAIS_COM_ZERO.join(', ')}`)
        .eq('tenant_id', tenantId).eq('id', orc.levantamento_id).maybeSingle()
    if (e2) falhou('orcamentista_levantamento', e2)
    const doVendedor = lev ? await lerPerfilDoVendedor(tenantId, textoOuNulo(lev.vendedor_employee_id)) : null
    return PERCENTUAIS_COM_ZERO.map((campo) => ({
        campo, valor: numeroOuNulo(orc[campo]), origem: origemNaTela(orc[campo], lev?.[campo], doVendedor?.[campo]),
    }))
}

/**
 * O GATILHO DO "SIM" na conversa: atravessa e devolve o que vai ao log [IA] — nunca lança. A falha da travessia não derruba a resposta ao
 * vendedor (o levantamento já foi gravado e enviado); fica nomeada no log, e a ação manual da seção Orçamentos I.A. atravessa depois.
 */
export async function atravessarNoSim(tenantId: string, levantamentoId: string): Promise<string> {
    let r: ResultadoDaTravessia
    try {
        r = await atravessarLevantamento(tenantId, levantamentoId)
    } catch (e) {
        if (e instanceof ErroJaAtravessado) return `ja_existe=${e.orcamentoNumero} parou=travessia`
        if (e instanceof ErroDaTravessia) return `recusou=${e.recusas.length} parou=travessia`
        return `falhou parou=travessia motivo="${motivoDoLog(e)}"`
    }
    const origens = PERCENTUAIS_COM_ZERO.map((p) => `${ROTULO_NO_LOG[p]}:${r.origens[p]}`).join(',')
    const travessia = `orcamento=${r.orcamento.numero} itens=${r.itens} faltas=${r.faltas.length}${r.retomada ? ' retomada=sim' : ''} origens=${origens}`
    // O "SIM" ENCADEIA (dono do produto, 11/11/2026): travessia -> cálculo do custo (grava os materiais) -> precificação. A precificação só
    // completa com o #258; até lá o encadeamento PARA no cálculo, com o custo fechado e o valor de venda nulo, e diz que falta a precificação
    try {
        const c = await calcularOrcamento(tenantId, r.orcamento.id)
        return `${travessia} calculo=ok liquido=${c.valor_total_liquido.toFixed(2)} parou=precificacao motivo="${MOTIVO_SEM_PRECIFICACAO}"`
    } catch (e) {
        if (e instanceof ErroDoCalculo) return `${travessia} calculo=recusou recusas=${e.recusas.length} parou=calculo motivo="${e.recusas.join(' | ').slice(0, 120)}"`
        return `${travessia} calculo=falhou parou=calculo motivo="${motivoDoLog(e)}"`
    }
}
/** Por que o encadeamento para depois do cálculo: a precificação automática do orçamento ainda não existe (vem com o #258). */
export const MOTIVO_SEM_PRECIFICACAO = 'falta a precificação: o valor de venda fica nulo até a precificação do orçamento entrar'
const ROTULO_NO_LOG: Readonly<Record<PercentualComZero, string>> = { comissao_percentual: 'comissao', reserva_tecnica_percentual: 'rt', lucro_projetado_percentual: 'lucro' }
const motivoDoLog = (e: unknown) => (e instanceof Error ? e.message.slice(0, 120) : 'desconhecido')
