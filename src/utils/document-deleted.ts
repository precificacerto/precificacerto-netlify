/**
 * document-deleted.ts — o critério ÚNICO de "documento excluído".
 *
 * POR QUE STATUS E NÃO `is_active`
 * ---------------------------------
 * O filtro "mostrar excluídos" é REQUISITO, e `is_active` NÃO DISTINGUE EXCLUÍDO de
 * CANCELADO: o cancelamento já grava `is_active = false` (ver `cancel_sale_cascade`), então
 * os dois estados virariam o mesmo booleano e o filtro seria impossível de escrever sem
 * ambiguidade. Medido em 06/09/2026, `is_active` já carrega dois significados que divergem do
 * status — 3 budgets DRAFT e 3 sales COMPLETED, todos com `is_active = false`.
 *
 * Por isso o marcador é `status = 'EXCLUIDO'`, e este módulo é o único lugar que sabe disso.
 *
 * A RELAÇÃO COM O `active-record-filter.ts` DO #43
 * -------------------------------------------------
 * Aquele módulo é o critério de EXCLUSÃO LÓGICA DE CADASTRO (produto, serviço, item), onde
 * `is_active` é o marcador e a distinção que importa é listagem × leitura de documento. Este
 * é o critério de DOCUMENTO EXCLUÍDO, onde o marcador é o status. São dois conceitos, dois
 * módulos — e é de propósito que não se misturem: juntá-los reintroduziria a ambiguidade que
 * motivou a escolha do status.
 *
 * CANCELAR × EXCLUIR, que é o que estes dois valores significam:
 *   CANCELLED → voltou à etapa anterior, PODE ser retomado.
 *   EXCLUIDO  → última instância, como se a evolução nunca tivesse chegado ali. Irreversível.
 */

/** O valor gravado em `budgets.status`, `orders.status` e `sales.status`. */
export const STATUS_EXCLUIDO = 'EXCLUIDO'

/**
 * Filtro PostgREST para `.not(...)`: traz tudo MENOS os excluídos.
 *
 * Usado como `.neq('status', STATUS_EXCLUIDO)`. Documento sem status (`null`) NÃO é excluído —
 * ausência é "nunca classificado", nunca "excluído" (`.claude/rules/ausente-vs-falso.md`), e
 * `neq` em SQL descarta `null`, então quem tiver status nulo precisa do filtro `or` abaixo.
 */
export const NOT_DELETED_FILTER = `status.is.null,status.neq.${STATUS_EXCLUIDO}`

/** Linha de documento no que este critério lê. */
export interface DocumentWithStatus {
    status?: string | null
}

/** `true` quando o documento foi EXCLUÍDO — não quando foi cancelado. */
export function isDeletedDocument(doc: DocumentWithStatus | null | undefined): boolean {
    return doc?.status === STATUS_EXCLUIDO
}

/**
 * Aplica o filtro "mostrar excluídos" a uma lista já carregada.
 *
 * `mostrarExcluidos = false` (padrão das três telas) esconde os excluídos e mantém todo o
 * resto, CANCELADOS INCLUSIVE — cancelar não é excluir, e a tela de Vendas continua listando
 * cancelados como sempre listou.
 */
export function filterDeletedDocuments<T extends DocumentWithStatus>(
    docs: readonly T[],
    mostrarExcluidos: boolean,
): T[] {
    return mostrarExcluidos ? [...docs] : docs.filter((d) => !isDeletedDocument(d))
}

/**
 * `true` quando a venda pode ser EXCLUÍDA.
 *
 * A pré-condição é uma só: NENHUM PAGAMENTO REGISTRADO. Havendo qualquer parcela paga, o
 * botão fica DESABILITADO com o motivo visível — botão ativo que falha depois é pior que
 * botão desabilitado que explica. `delete_sale_cascade` repete a checagem no banco, porque
 * uma UI não é uma garantia.
 */
export function canDeleteSale(input: {
    status?: string | null
    hasPaidReceivable: boolean
}): { allowed: boolean; reason: string | null } {
    if (isDeletedDocument(input)) {
        return { allowed: false, reason: 'Esta venda já foi excluída.' }
    }
    if (input.hasPaidReceivable) {
        return {
            allowed: false,
            reason:
                'Esta venda possui pagamentos registrados e não pode ser excluída. Cancele os recebimentos em Lançamentos a Receber antes.',
        }
    }
    return { allowed: true, reason: null }
}

/** O texto do tooltip que distingue as duas ações na coluna Ações de Vendas. */
export const TOOLTIP_CANCELAR =
    'Cancelar retorna o documento à etapa anterior e permite retomá-lo.'
export const TOOLTIP_EXCLUIR =
    'Excluir remove permanentemente a venda e a cadeia que a originou (pedido e orçamento). Estoque volta, lançamentos do caixa saem. Não há desfazer.'
