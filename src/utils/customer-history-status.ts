/**
 * customer-history-status.ts — o critério ÚNICO do Histórico do Cliente: quais documentos
 * aparecem e COMO aparecem.
 *
 * O CRITÉRIO É O STATUS, NÃO `is_active`
 * ---------------------------------------
 * `sales.is_active = false` já significa TRÊS coisas: venda CANCELADA (24 linhas), venda
 * EXCLUÍDA (1) e um terceiro estado sem nome — `COMPLETED` com a flag baixada (3 linhas,
 * VD-2AA2A9, VD-C90058 e VD-A8246D, todas do Salão Eliane, ninguém sabe por quê). Filtrar por
 * esse booleano esconde os três SEM DISTINGUIR; o status separa.
 *
 * Por isso o histórico exibe TODAS as vendas do cliente, e o status decide o tratamento:
 * `COMPLETED` normal, `CANCELLED` marcada, `EXCLUIDO` esmaecida.
 *
 * O QUE ISSO CORRIGE, E É DEFEITO PREEXISTENTE
 * ---------------------------------------------
 * Até aqui as duas consultas de venda do histórico carregavam `.eq('is_active', true)` e
 * `.neq('status','CANCELLED')`, escritos em 31/07/2026 (commit `d1a4442`, "relatório 30/07")
 * sob a regra da época — *"Histórico exibe SOMENTE vendas efetivadas"*. Não é descuido de quem
 * construiu: é o nível que a regra daquele dia cobria (`.claude/rules/decisao-sob-regra-da-
 * epoca.md`). A regra "excluído aparece apagado" nasceu agora, e conflita com aquela.
 * Consequência medida: 22 vendas voltam a aparecer, em 6 clientes.
 *
 * POR QUE O MARCADOR DE STATUS É ELEMENTO PRÓPRIO, E NÃO O SELO QUE JÁ EXISTE
 * ---------------------------------------------------------------------------
 * O selo da venda no histórico é o status de PAGAMENTO, derivado das `cash_entries` ATIVAS — e
 * as duas cascatas (`cancel_sale_cascade`, `delete_sale_cascade`) as desativam. Medido: a venda
 * excluída VD-96AF84 é PIX e cai no valor inicial `'Pago'` verde; as três canceladas BOLETO têm
 * 4 lançamentos cada, ZERO ativos, e sairiam com `'Aguardando Pagamento'` laranja — uma delas
 * de R$ 291.644,28. Exibir com o status viraria exibir com um selo que MENTE.
 * O marcador entra AO LADO do selo: substituí-lo perderia a informação de pagamento.
 *
 * ESMAECIDO NÃO É O MARCADOR — É O REFORÇO
 * -----------------------------------------
 * Opacidade só se lê por CONTRASTE. Um cliente com uma venda só, e ela excluída, não tem com o
 * que comparar: o apagado sozinho não afirma nada. Por isso todo documento morto leva rótulo
 * em texto, e a opacidade é o reforço.
 *
 * CANCELADO E EXCLUÍDO PRECISAM SER DIFERENTES
 * ---------------------------------------------
 * `CANCELLED` voltou à etapa anterior e PODE ser retomado; `EXCLUIDO` é a última instância,
 * irreversível (ver `document-deleted.ts`). Aparências iguais apagariam a distinção que o #52
 * criou — e que custou uma migração de enum para existir.
 */

/** O que o status diz sobre a VIDA do documento, que é o que a tela precisa saber. */
export type DocumentLifecycle = 'ATIVO' | 'CANCELADO' | 'EXCLUIDO'

/**
 * Traduz o status gravado para o estado de vida.
 *
 * Status desconhecido é ATIVO por decisão: o histórico não deve esconder nem marcar um
 * documento por não reconhecer o rótulo dele. `orders.status` e `sales.status` são TEXT sem
 * CHECK e aceitam qualquer string — tratar o desconhecido como morto seria afirmar o que não
 * se sabe.
 */
export function resolveDocumentLifecycle(status?: string | null): DocumentLifecycle {
    if (status === 'EXCLUIDO') return 'EXCLUIDO'
    if (status === 'CANCELLED' || status === 'REJECTED') return 'CANCELADO'
    return 'ATIVO'
}

/** `true` para documento que não evolui mais — cancelado ou excluído. */
export function isDeadDocument(lifecycle: DocumentLifecycle): boolean {
    return lifecycle !== 'ATIVO'
}

export interface LifecycleStyle {
    /** Opacidade do bloco. Reforço do rótulo, nunca o marcador sozinho. */
    opacity: number
    /** Risco no valor — só o excluído leva, e é o que o separa do cancelado à distância. */
    riscarValor: boolean
    /** Rótulo do marcador. `null` no documento vivo: nada a marcar. */
    markerLabel: string | null
    /** Cor do marcador na paleta do antd. */
    markerColor: string
}

/**
 * As três aparências. CANCELADO fica em opacidade CHEIA de propósito: é documento vivo, pode
 * ser retomado, e esmaecê-lo diria o contrário. O que o distingue é o marcador vermelho.
 */
export const LIFECYCLE_STYLE: Record<DocumentLifecycle, LifecycleStyle> = {
    ATIVO: { opacity: 1, riscarValor: false, markerLabel: null, markerColor: 'default' },
    CANCELADO: { opacity: 1, riscarValor: false, markerLabel: 'Cancelado', markerColor: 'red' },
    EXCLUIDO: { opacity: 0.45, riscarValor: true, markerLabel: 'Excluído', markerColor: 'default' },
}

/**
 * A SUSPENSÃO PARCIAL DA REGRA DE 31/07, E A RAZÃO — porque isto revoga uma decisão anterior
 * ------------------------------------------------------------------------------------------
 * A regra de 31/07/2026 (commit `d1a4442`) dizia *"Histórico exibe SOMENTE vendas efetivadas"*,
 * e por ela cadeia morta em documento cancelado não aparecia em lugar nenhum. **Esta rodada
 * revoga essa parte**, e o motivo precisa ficar escrito com estas palavras:
 *
 * > NÃO É DEFEITO DA REGRA ANTIGA NEM DESCUIDO DE QUEM A ESCREVEU — É MUDANÇA DE PROPÓSITO.
 * > A regra da época cobria um histórico que NÃO TINHA PROPÓSITO DE AUDITORIA. O propósito
 * > nasceu agora.
 *
 * É a família de `.claude/rules/decisao-sob-regra-da-epoca.md`. Sem a suspensão, *"a cadeia
 * aparece uma vez, no estágio em que morreu"* valeria SÓ PARA AS CADEIAS QUE DERAM CERTO, e o
 * rastro das que FALHARAM continuaria invisível — o oposto do que a auditoria precisa.
 *
 * O QUE **NÃO** FOI REVOGADO: `DRAFT`. Rascunho não é cadeia morta, é cadeia que ainda não
 * começou, e esconder rascunho era a outra metade da regra de 30/07 — essa continua valendo.
 */

/**
 * Status de orçamento que o histórico exibe.
 *
 * `EXCLUIDO` e `CANCELLED` entram: a cadeia morta aparece no estágio em que morreu. `DRAFT`
 * fica fora — ver acima. `SENT_TO_ORDER` também entrou, e é correção de lacuna medida: o
 * status foi criado DEPOIS da regra de 30/07 e ficava escondido sem ninguém ter decidido (2
 * linhas na base, uma delas o ORC-8520 do Felipe Klein).
 */
export const BUDGET_STATUSES_NO_HISTORICO: readonly string[] = [
    'SENT',
    'SENT_TO_ORDER',
    'APPROVED',
    'PAID',
    'AWAITING_PAYMENT',
    'EXPIRED',
    'CANCELLED',
    'REJECTED',
    'EXCLUIDO',
]

/**
 * Status de pedido que o histórico NÃO exibe.
 *
 * Só `DRAFT`. `CANCELLED` saiu daqui pela suspensão acima — é ele que deixava as cadeias 2 e 4
 * do Felipe Klein (2 e 3 pedidos cancelados) invisíveis em qualquer seção.
 */
export const ORDER_STATUSES_FORA_DO_HISTORICO: readonly string[] = ['DRAFT']

/** `true` quando o status do documento pode aparecer no histórico. */
export function statusExibivelNoHistorico(
    stage: 'ORCAMENTO' | 'PEDIDO' | 'VENDA',
    status?: string | null,
): boolean {
    if (stage === 'VENDA') return true
    if (stage === 'PEDIDO') return !ORDER_STATUSES_FORA_DO_HISTORICO.includes(status || '')
    return BUDGET_STATUSES_NO_HISTORICO.includes(status || '')
}

/**
 * Rótulo e cor de cada status de pedido.
 *
 * `EXCLUIDO` entrou porque sem ele o mapa caía no fallback e imprimia a STRING CRUA `EXCLUIDO`
 * na tela — a única seção onde um documento excluído já vazava, e vazava sem tradução.
 */
export const ORDER_STATUS_LABELS: Record<string, { label: string; color: string }> = {
    DRAFT: { label: 'Rascunho', color: 'default' },
    AWAITING_PAYMENT: { label: 'Aguardando Pagamento', color: 'orange' },
    SENT_TO_SALE: { label: 'Efetivado', color: 'success' },
    PAID: { label: 'Pago', color: 'green' },
    CANCELLED: { label: 'Cancelado', color: 'red' },
    EXCLUIDO: { label: 'Excluído', color: 'default' },
}

/** Rótulo do pedido, com fallback para o status cru quando ele não for conhecido. */
export function resolveOrderStatusLabel(status?: string | null): { label: string; color: string } {
    if (status && ORDER_STATUS_LABELS[status]) return ORDER_STATUS_LABELS[status]
    return { label: status || 'Sem status', color: 'default' }
}

/**
 * O RÓTULO DO CARIMBO DE TEMPO — e a razão de ele ser este e não "Excluído em".
 *
 * Não há histórico de status em lugar nenhum do sistema: `updated_at` é o melhor proxy que
 * existe para "quando o documento morreu", e é um proxy IMPRECISO — é carimbo GLOBAL da linha.
 * No VD-96AF84 ele é confiável porque a cascata foi a última escrita, mas QUALQUER EDIÇÃO
 * POSTERIOR o move, e nada na linha registra qual escrita foi.
 *
 * Escrever "Excluído em 08/09" AFIRMARIA MAIS DO QUE SE SABE. É `ausente-vs-falso.md` aplicado
 * ao RÓTULO em vez de ao dado: **rótulo preciso sobre dado impreciso é afirmação falsa**. O
 * auditor tem de saber o que está lendo, então o rótulo diz que é a última alteração, e a
 * ressalva vai junto — na TELA, não só no código.
 */
export const ROTULO_ULTIMA_ALTERACAO = 'Última alteração'
export const RESSALVA_ULTIMA_ALTERACAO =
    'carimbo da última escrita nesta linha, não necessariamente da exclusão — o sistema não guarda histórico de status'

export interface CarimboDeTempo {
    rotulo: string
    valor: string
    ressalva: string
}

/**
 * O carimbo exibido no documento morto.
 *
 * `null` quando o documento está vivo (não há nada a auditar) ou quando não há `updated_at`
 * — ausência não vira traço nem data inventada.
 */
export function buildCarimboUltimaAlteracao(args: {
    lifecycle: DocumentLifecycle
    updatedAt?: string | null
}): CarimboDeTempo | null {
    if (!isDeadDocument(args.lifecycle)) return null
    if (!args.updatedAt) return null
    return {
        rotulo: ROTULO_ULTIMA_ALTERACAO,
        valor: new Date(args.updatedAt).toLocaleString('pt-BR'),
        ressalva: RESSALVA_ULTIMA_ALTERACAO,
    }
}
