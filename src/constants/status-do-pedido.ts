/**
 * O STATUS DO PEDIDO — cor e rótulo, fonte única.
 *
 * Saiu de `pages/pedidos/index.tsx:78` ao extrair a lista para componente: a lista e o drawer
 * de detalhe da página leem o mesmo mapa, e deixá-lo na página faria o componente declarar
 * uma segunda cópia — `copia-divergente.md` criada dentro do PR que existe para apagar
 * cópias. Nenhum valor mudou.
 */
export const STATUS_DO_PEDIDO: Record<string, { color: string; label: string }> = {
    DRAFT: { color: 'default', label: 'Rascunho' },
    AWAITING_PAYMENT: { color: 'processing', label: 'Aguardando pagamento' },
    SENT_TO_SALE: { color: 'warning', label: 'Aguardando aprovação' },
    PAID: { color: 'green', label: '✅ Pago' },
    CANCELLED: { color: 'red', label: 'Cancelado' },
}
