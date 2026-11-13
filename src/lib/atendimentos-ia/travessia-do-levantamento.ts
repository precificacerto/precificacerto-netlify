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
import { calcularOrcamento, ErroDoCalculo, faltaDoParcial, type FaltaDoParcial } from './orcamento-calculado'
import type { ResultadoDaEtapa } from './cadeia-do-sim'
import { fraseDoArquivoQueNaoChegou } from './arquivo-que-nao-chegou'
import {
    CABECALHO_SINCRONIZADO, diferencaDoOrcamento, ESTADO_COMPLETO, ErroDaTravessia, ErroJaAtravessado, ErroOrcamentoArquivado, faltasDoCongelado, origemNaTela, planoDaTravessia, PERCENTUAIS_COM_ZERO,
    type ClienteDoLevantamento, type ItemAtivoDoOrcamento, type ItemDaTravessia, type ItemDoLevantamentoNaTravessia, type LevantamentoNaTravessia, type ModoDaBase,
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
const COLUNAS_DO_ITEM_DO_LEVANTAMENTO = 'id, ordem, tipologia, largura_mm, altura_mm, quantidade, cor_perfil, vidro, ambientes, escolhas, familia'
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
    // TODOS os itens, os removidos também (medido pela mutação L5, 13/11/2026): esta contagem só reconhece a travessia que parou entre as duas
    // escritas — o orçamento SEM item nenhum. O orçamento com todos os itens removidos é um orçamento real: vai à ATUALIZAÇÃO (que confere o
    // arquivado, relê os percentuais e avisa da edição manual), nunca à retomada, que só insere
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
    const { lev, plano } = await lerPlanoDoLevantamento(tenantId, levantamentoId)
    const existente = await orcamentoDoLevantamento(tenantId, levantamentoId)
    if (existente && existente.itens > 0) throw new ErroJaAtravessado(lev.numero, existente.id, existente.numero)
    return criarOuRetomar(tenantId, levantamentoId, lev, plano, existente)
}

/** O levantamento lido e o PLANO dele (o que a primeira travessia grava), e a família de cada item — o mesmo para criar e para atualizar. */
async function lerPlanoDoLevantamento(tenantId: string, levantamentoId: string) {
    const { data: lev, error } = await db().from('orcamentista_levantamento').select(COLUNAS_DO_LEVANTAMENTO).eq('tenant_id', tenantId).eq('id', levantamentoId).maybeSingle()
    if (error) falhou('orcamentista_levantamento', error)
    if (!lev || lev.tenant_id !== tenantId) throw new ErroNaoEncontrado()
    const lerItens = (colunas: string) => db().from('orcamentista_levantamento_item').select(colunas).eq('tenant_id', tenantId).eq('levantamento_id', levantamentoId)
    // o código do vidro ESCOLHIDO (20261112000006) viaja junto; sem a coluna, nenhum foi escolhido
    let r = await lerItens(`${COLUNAS_DO_ITEM_DO_LEVANTAMENTO}, vidro_codigo`)
    if (r.error && (r.error.code === '42703' || r.error.code === 'PGRST204')) r = await lerItens(COLUNAS_DO_ITEM_DO_LEVANTAMENTO)
    if (r.error) falhou('orcamentista_levantamento_item', r.error)
    const vidroCodigo = new Map(((r.data ?? []) as Array<{ id: string; vidro_codigo?: string | null }>).flatMap((i) => (textoOuNulo(i.vidro_codigo) ? [[i.id, textoOuNulo(i.vidro_codigo) as string]] : [])))
    // a pré-definição de contexto da base (o perfil do vendedor do levantamento), lida no tenant do chamador — o (b) da regra do zero
    const doVendedor = await lerPerfilDoVendedor(tenantId, textoOuNulo(lev.vendedor_employee_id))
    const plano = planoDaTravessia(lev as LevantamentoNaTravessia, (r.data ?? []) as ItemDoLevantamentoNaTravessia[], await modoDaBaseDeConhecimento(tenantId), doVendedor)
    // `'recusas' in`, e não `ok`: com `strictNullChecks: false` (o tsconfig daqui) o tsc não estreita a união pelo booleano
    if ('recusas' in plano) throw new ErroDaTravessia(plano.recusas)
    // a coluna só vai no INSERT quando algum item tem o código: sem escolha, o insert é o de antes (e não depende da migração)
    if (vidroCodigo.size) plano.itens = plano.itens.map((i) => ({ ...i, vidro_codigo: vidroCodigo.get(String(i.levantamento_item_id)) ?? null }))
    const familias = new Map(((r.data ?? []) as Array<{ id: string; familia?: unknown }>).map((i) => [String(i.id), textoOuNulo(i.familia)]))
    return { lev: lev as LevantamentoNaTravessia, plano, familias, temVidroCodigo: vidroCodigo.size > 0 }
}

async function criarOuRetomar(
    tenantId: string, levantamentoId: string, lev: LevantamentoNaTravessia,
    plano: Awaited<ReturnType<typeof lerPlanoDoLevantamento>>['plano'], existente: { id: string; numero: number; itens: number } | null,
): Promise<ResultadoDaTravessia> {
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
 * O GATILHO DO "SIM" na conversa: atravessa, calcula e roda a ETAPA DO PREÇO (precificar, gerar o PDF, enviá-lo ao dono do levantamento —
 * `cadeia-do-sim.ts`), e devolve o que vai ao log [IA] e o texto que acompanha a resposta ao vendedor — nunca lança. "O sim do levantamento
 * dispara TUDO, sem intervenção humana" (dono do produto, 11/11/2026; a cadeia ligada em 11/11/2026, depois do relógio aprovado). A falha de um
 * passo não desfaz o anterior: fica nomeada no log, e a ação manual da seção Orçamentos I.A. retoma depois.
 */
// ── A ATUALIZAÇÃO DO ORÇAMENTO N, COM O MESMO NÚMERO (dono do produto, 13/11/2026) ─────────────────────────────────────────────────────
export type ResultadoDaAtualizacao = {
    orcamento: { id: string; numero: number; nome: string }
    semMudanca: boolean
    novos: number; mudados: number; removidos: number; cabecalhoMudou: boolean
    /** A edição manual (a tela) MAIS NOVA que a última atualização foi substituída por esta — a conversa avisa, nunca em silêncio. */
    edicaoManualSubstituida: boolean
    itens: number
    origens: OrigensDosPercentuais
}
const COLUNAS_DO_ITEM_ATIVO = 'id, levantamento_item_id, familia, ordem, tipologia, largura_mm, altura_mm, quantidade, cor_perfil, vidro, ambientes, escolhas, vidro_codigo'
/** A edição manual mais nova que a última atualização: `editado_manualmente_em` depois de `atualizado_em` (sem `atualizado_em`, ela é a mais nova). */
export const edicaoManualMaisNova = (o: { editado_manualmente_em?: unknown; atualizado_em?: unknown }) => {
    const editado = typeof o.editado_manualmente_em === 'string' ? Date.parse(o.editado_manualmente_em) : NaN
    if (!Number.isFinite(editado)) return false
    const atualizado = typeof o.atualizado_em === 'string' ? Date.parse(o.atualizado_em) : NaN
    return !Number.isFinite(atualizado) || editado > atualizado
}
/**
 * ATUALIZA o orçamento `orcamentoId` pelo levantamento — o mesmo número, nada de segundo orçamento, NADA APAGADO (zero DELETE): o item que saiu
 * do levantamento ganha a MARCA de removido; o mudado é atualizado no lugar; o acrescentado é inserido; o nome e os percentuais são RELIDOS do
 * levantamento. O "sim" SEM MUDANÇA não grava nada (`semMudanca`). O arquivado RECUSA (`ErroOrcamentoArquivado`), e continua arquivado. A
 * edição manual NÃO é apagada (nem a data nem o autor): `atualizado_em` passa a ser o mais novo, e o aviso para sozinho.
 */
export async function atualizarOrcamento(tenantId: string, levantamentoId: string, orcamentoId: string, agora: Date = new Date()): Promise<ResultadoDaAtualizacao> {
    const { data: orc, error } = await db().from(TABELA_DO_ORCAMENTO)
        .select(`id, numero, deleted_at, editado_manualmente_em, atualizado_em, ${CABECALHO_SINCRONIZADO.join(', ')}`)
        .eq('tenant_id', tenantId).eq('id', orcamentoId).maybeSingle()
    if (error) falhou(TABELA_DO_ORCAMENTO, error)
    if (!orc) throw new ErroNaoEncontrado()
    if (orc.deleted_at) throw new ErroOrcamentoArquivado(Number(orc.numero))
    const { plano, familias, temVidroCodigo } = await lerPlanoDoLevantamento(tenantId, levantamentoId)
    const r = await db().from(TABELA_DO_ITEM).select(COLUNAS_DO_ITEM_ATIVO).eq('tenant_id', tenantId).eq('orcamento_id', orcamentoId).is('removido_em', null)
    if (r.error) falhou(TABELA_DO_ITEM, r.error)
    const ativos = (r.data ?? []) as ItemAtivoDoOrcamento[]
    const comparado = plano.itens.map((i) => ({ ...i, familia: familias.get(String(i.levantamento_item_id)) ?? null }))
    const d = diferencaDoOrcamento(orc, plano.orcamento, ativos, comparado)
    const numero = Number(orc.numero)
    const resultado: ResultadoDaAtualizacao = {
        orcamento: { id: orcamentoId, numero, nome: plano.orcamento.nome }, semMudanca: d.semMudanca,
        novos: d.novos.length, mudados: d.mudados.length, removidos: d.removidos.length, cabecalhoMudou: d.cabecalhoMudou,
        edicaoManualSubstituida: !d.semMudanca && edicaoManualMaisNova(orc), itens: plano.itens.length, origens: plano.origens,
    }
    if (d.semMudanca) return resultado
    const quando = agora.toISOString()
    // 1. o REMOVIDO, primeiro: a marca (nunca DELETE) — e ela libera a ordem para o item novo (o índice único é só entre os que valem)
    if (d.removidos.length) {
        const ids = d.removidos.map((x) => x.id)
        const { data: marcados, error: e } = await db().from(TABELA_DO_ITEM).update({ removido_em: quando, atualizado_em: quando })
            .eq('tenant_id', tenantId).eq('orcamento_id', orcamentoId).in('id', ids).is('removido_em', null).select('id')
        if (e) falhou(TABELA_DO_ITEM, e)
        if ((marcados ?? []).length !== ids.length) throw new Error(`${TABELA_DO_ITEM}: a marca de removido atingiu ${(marcados ?? []).length} item(ns), e devia atingir ${ids.length}`)
    }
    // 2. o MUDADO, no lugar: os mesmos campos da primeira travessia (o código do vidro sempre, para não ficar o de antes)
    for (const m of d.mudados) {
        const { data: tocados, error: e } = await db().from(TABELA_DO_ITEM).update({ ...m.item, vidro_codigo: m.item.vidro_codigo ?? null, atualizado_em: quando })
            .eq('tenant_id', tenantId).eq('orcamento_id', orcamentoId).eq('id', m.id).is('removido_em', null).select('id')
        if (e) falhou(TABELA_DO_ITEM, e)
        if ((tocados ?? []).length !== 1) throw new Error(`${TABELA_DO_ITEM}: a atualização do item ${m.item.ordem} atingiu ${(tocados ?? []).length} linha(s), e devia atingir 1`)
    }
    // 3. o ACRESCENTADO
    await gravarItens(tenantId, orcamentoId, temVidroCodigo ? d.novos : d.novos.map(({ vidro_codigo: _v, ...i }) => { void _v; return i }))
    // 4. o cabeçalho: o nome e os percentuais RELIDOS do levantamento; `atualizado_em` passa a ser o mais novo (a edição manual fica registrada)
    const cabecalho = Object.fromEntries(CABECALHO_SINCRONIZADO.map((c) => [c, plano.orcamento[c]]))
    const { data: atingido, error: e4 } = await db().from(TABELA_DO_ORCAMENTO).update({ ...cabecalho, atualizado_em: quando })
        .eq('tenant_id', tenantId).eq('id', orcamentoId).select('id')
    if (e4) falhou(TABELA_DO_ORCAMENTO, e4)
    if ((atingido ?? []).length !== 1) throw new Error(`${TABELA_DO_ORCAMENTO}: a atualização do orçamento ${numero} atingiu ${(atingido ?? []).length} linha(s), e devia atingir 1`)
    return resultado
}

export type EtapaDoPrecoNoSim = (orcamentoId: string) => Promise<ResultadoDaEtapa>
/** O "sim" SEM MUDANÇA: manda o arquivo que JÁ existe (nada recalculado, nada gerado). `semArquivo`: não há arquivo — a atualização roda. */
export type ReenvioNoSim = (orcamento: { id: string; numero: number; nome: string }) => Promise<ResultadoDaEtapa & { semArquivo?: true }>
/**
 * `enviadoPara`: o número que recebeu o arquivo (a etapa do preço o diz). `questionamentos`: as faltas nomeadas do cálculo (12/11/2026, 4.3) —
 * a ÚNICA coisa que a conversa manda por texto quando o arquivo chegou; o resto (barras, aproveitamento, mão de obra) está no PDF.
 */
export type ResultadoDoSim = { rastro: string; paraOVendedor: string | null; enviadoPara?: string; idDoEnvio?: string | null; questionamentos?: string; aviso?: string }
/**
 * O QUE O VENDEDOR RECEBE quando a cadeia PARA antes do arquivo (dono do produto, 13/11/2026): o arquivo não chegou, e por quê — a falta
 * nomeada, e nada mais. Nunca o resultado por texto (`arquivo-que-nao-chegou.ts`).
 */
const naoChegou = fraseDoArquivoQueNaoChegou
/** O orçamento arquivado: a falta nomeada, e ele continua arquivado (nada é reativado). */
export const fraseDoOrcamentoArquivado = (numero: number) =>
    naoChegou(null, `o orçamento ${numero} está arquivado: a atualização não foi feita, e ele continua arquivado`)
/** O "sim" sem mudança: o orçamento já está atualizado, e o arquivo que existe vai de novo. */
export const fraseDoOrcamentoJaAtualizado = (numero: number) =>
    `O orçamento ${numero} já está atualizado: nada mudou no levantamento desde a última vez. O arquivo dele vai de novo.`
/** A edição manual substituída — dita, nunca em silêncio. */
export const fraseDaEdicaoManualSubstituida = (numero: number) =>
    `O orçamento ${numero} tinha edição manual na seção Orçamentos I.A., e ela foi substituída por esta atualização do levantamento.`
/** Os questionamentos de um orçamento PARCIAL: uma linha por código, com o que falta. Sem falta, nulo — nada a perguntar. */
export function fraseDosQuestionamentos(numero: number, faltas: ReadonlyArray<{ codigo_do_motor: string; frase: string; esquadria: number }>): string | null {
    if (faltas.length === 0) return null
    const { codigos, linhas } = linhasDasFaltas(faltas)
    return [`O orçamento ${numero} saiu PARCIAL — ${codigos > 1 ? `faltam ${codigos} valores` : 'falta 1 valor'}. Para completar, preciso de:`, ...linhas].join('\n')
}
/** Uma linha por código que falta, com as esquadrias onde ele falta. */
function linhasDasFaltas(faltas: ReadonlyArray<{ codigo_do_motor: string; frase: string; esquadria: number }>) {
    const porCodigo = new Map<string, { frase: string; esquadrias: Set<number> }>()
    for (const f of faltas) {
        const x = porCodigo.get(f.codigo_do_motor) ?? { frase: f.frase, esquadrias: new Set<number>() }
        x.esquadrias.add(f.esquadria)
        porCodigo.set(f.codigo_do_motor, x)
    }
    const linhas = [...porCodigo.entries()].map(([codigo, x]) => {
        const es = [...x.esquadrias].sort((a, b) => a - b)
        const onde = `${es.length > 1 ? 'itens' : 'item'} ${es.join(', ')}`
        // a frase que já começa pelo código não o repete: o código vai uma vez, e as esquadrias no fim
        return x.frase.startsWith(codigo) ? `• ${x.frase.replace(/\.$/, '')} (${onde}).` : `• ${codigo} (${onde}): ${x.frase.replace(/\.$/, '')}.`
    })
    return { codigos: porCodigo.size, linhas }
}
/**
 * O PARCIAL que CONTINUA no "sim" sem mudança (dono do produto, 13/11/2026): nada é recalculado, o arquivo vai de novo, e o que continua
 * faltando vai NOMEADO — nunca o "já está atualizado" seco, que esconde a razão.
 */
export function fraseDoParcialQueContinua(numero: number, faltas: ReadonlyArray<{ codigo_do_motor: string; frase: string; esquadria: number }>, recusas: readonly string[] = []): string {
    const { codigos, linhas } = linhasDasFaltas(faltas)
    const quantos = codigos > 1 ? `${codigos} valores continuam` : '1 valor continua'
    return [
        `O orçamento ${numero} continua PARCIAL: nada mudou no levantamento, e ${quantos} sem preço. O arquivo dele vai de novo, sem recálculo.`,
        ...(recusas.length ? [`O custo de agora também recusou. Falta: ${recusas.join('; ')}.`] : []),
        ['Para completar, preciso de:', ...linhas].join('\n'),
    ].join('\n')
}
export async function atravessarNoSim(tenantId: string, levantamentoId: string, etapaDoPreco: EtapaDoPrecoNoSim, reenviar?: ReenvioNoSim): Promise<ResultadoDoSim> {
    let r: ResultadoDaTravessia
    let atualizacao: ResultadoDaAtualizacao | null = null
    let parcial: FaltaDoParcial | null = null
    try {
        try {
            r = await atravessarLevantamento(tenantId, levantamentoId)
        } catch (e) {
            if (!(e instanceof ErroJaAtravessado)) throw e
            // O ORÇAMENTO N JÁ EXISTE: a parada de antes é o caminho da ATUALIZAÇÃO, com o mesmo número (13/11/2026)
            atualizacao = await atualizarOrcamento(tenantId, levantamentoId, e.orcamentoId)
            const a = atualizacao
            if (a.semMudanca && reenviar) {
                // SEM MUDANÇA: o COMPLETO é fotografia — nada recalculado, nada gerado, o arquivo que existe vai de novo. O PARCIAL cujas faltas
                // nomeadas TODAS têm preço agora é a ÚNICA exceção: recalcula, com o mesmo número (dono do produto, 13/11/2026). Sem arquivo, a
                // atualização roda inteira
                parcial = await faltaDoParcial(tenantId, a.orcamento.id)
                const resolvido = parcial.parcial && parcial.continuam.length === 0 && parcial.recusas.length === 0
                if (!resolvido) {
                    const env = await reenviar(a.orcamento)
                    if (!env.semArquivo) {
                        const p = parcial.parcial ? parcial : null
                        return {
                            rastro: `orcamento=${a.orcamento.numero} atualizacao=sem_mudanca${p ? ` parcial=continua faltas_de_preco=${p.continuam.length}/${p.nomeadas}` : ''} ${env.rastro}`,
                            paraOVendedor: env.paraOVendedor,
                            aviso: p ? fraseDoParcialQueContinua(a.orcamento.numero, p.continuam, p.recusas) : fraseDoOrcamentoJaAtualizado(a.orcamento.numero),
                            ...(env.enviadoPara ? { enviadoPara: env.enviadoPara, idDoEnvio: env.idDoEnvio ?? null } : {}),
                        }
                    }
                }
            }
            r = { orcamento: { id: a.orcamento.id, numero: a.orcamento.numero }, itens: a.itens, faltas: [], retomada: false, origens: a.origens }
        }
    } catch (e) {
        if (e instanceof ErroOrcamentoArquivado) return { rastro: `orcamento=${e.orcamentoNumero} atualizacao=arquivado parou=travessia`, paraOVendedor: fraseDoOrcamentoArquivado(e.orcamentoNumero) }
        if (e instanceof ErroDaTravessia) {
            return { rastro: `recusou=${e.recusas.length} parou=travessia`, paraOVendedor: naoChegou(null, `o levantamento não passou para o orçamento. Falta: ${e.recusas.join('; ')}. Corrija isso no levantamento: o arquivo volta para você conferir, e o "sim" faz o orçamento`) }
        }
        return { rastro: `falhou parou=travessia motivo="${motivoDoLog(e)}"`, paraOVendedor: naoChegou(null, 'a passagem do levantamento para o orçamento falhou. Para tentar de novo, diga o nome do levantamento: o arquivo volta para você conferir, e o "sim" faz o orçamento') }
    }
    const origens = PERCENTUAIS_COM_ZERO.map((p) => `${ROTULO_NO_LOG[p]}:${r.origens[p]}`).join(',')
    const doAtualizado = atualizacao
        ? ` atualizacao=sim novos=${atualizacao.novos} mudados=${atualizacao.mudados} removidos=${atualizacao.removidos} cabecalho=${atualizacao.cabecalhoMudou ? 'sim' : 'nao'}${atualizacao.edicaoManualSubstituida ? ' edicao_manual=substituida' : ''}${parcial?.parcial ? ` parcial=resolvido faltas_de_preco=0/${parcial.nomeadas}` : ''}`
        : ''
    const travessia = `orcamento=${r.orcamento.numero} itens=${r.itens} faltas=${r.faltas.length}${r.retomada ? ' retomada=sim' : ''}${doAtualizado} origens=${origens}`
    // a EDIÇÃO MANUAL substituída é dita, em todo desfecho daqui para frente (13/11/2026: "Nunca em silêncio")
    const comAviso = <T extends ResultadoDoSim>(x: T): T => (atualizacao?.edicaoManualSubstituida ? { ...x, aviso: fraseDaEdicaoManualSubstituida(atualizacao.orcamento.numero) } : x)
    let doCalculo: string
    let questionamentos: string | null = null
    try {
        const c = await calcularOrcamento(tenantId, r.orcamento.id)
        doCalculo = `${travessia} calculo=ok liquido=${c.valor_total_liquido.toFixed(2)}${c.parcial ? ` parcial=sim faltas_de_preco=${c.faltas.length}` : ''}`
        questionamentos = fraseDosQuestionamentos(r.orcamento.numero, c.faltas)
    } catch (e) {
        if (e instanceof ErroDoCalculo) return comAviso({ rastro: `${travessia} calculo=recusou recusas=${e.recusas.length} parou=calculo motivo="${e.recusas.join(' | ').slice(0, 120)}"`, paraOVendedor: naoChegou(null, `o cálculo do orçamento ${r.orcamento.numero} recusou. Falta: ${e.recusas.join('; ')}. Com isso cadastrado, abra o orçamento ${r.orcamento.numero} na seção Orçamentos I.A. e use Calcular`) })
        return comAviso({ rastro: `${travessia} calculo=falhou parou=calculo motivo="${motivoDoLog(e)}"`, paraOVendedor: naoChegou(null, `o cálculo do orçamento ${r.orcamento.numero} falhou. Para tentar de novo, abra o orçamento ${r.orcamento.numero} na seção Orçamentos I.A. e use Calcular`) })
    }
    try {
        const etapa = await etapaDoPreco(r.orcamento.id)
        return comAviso({
            rastro: `${doCalculo} ${etapa.rastro}`, paraOVendedor: etapa.paraOVendedor,
            ...(etapa.enviadoPara ? { enviadoPara: etapa.enviadoPara, idDoEnvio: etapa.idDoEnvio ?? null } : {}), ...(questionamentos ? { questionamentos } : {}),
        })
    } catch (e) {
        return comAviso({ rastro: `${doCalculo} precificacao=falhou parou=precificacao motivo="${motivoDoLog(e)}"`, paraOVendedor: naoChegou(null, `a precificação do orçamento ${r.orcamento.numero} falhou. Para tentar de novo, abra o orçamento ${r.orcamento.numero} na seção Orçamentos I.A. e use Precificar`) })
    }
}
const ROTULO_NO_LOG: Readonly<Record<PercentualComZero, string>> = { comissao_percentual: 'comissao', reserva_tecnica_percentual: 'rt', lucro_projetado_percentual: 'lucro' }
const motivoDoLog = (e: unknown) => (e instanceof Error ? e.message.slice(0, 120) : 'desconhecido')
