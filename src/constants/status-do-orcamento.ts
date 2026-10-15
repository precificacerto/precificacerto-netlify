/**
 * O STATUS DO ORÇAMENTO — cor, rótulo e ETAPA, fonte única.
 *
 * Saiu de `pages/orcamentos/index.tsx:144` ao extrair a lista para componente. A lista usa
 * `color` e `label`; o `<Steps>` do drawer de detalhe da página usa `stage`. Os dois leem o
 * mesmo mapa, então deixá-lo na página faria o componente declarar uma segunda cópia.
 * Nenhum valor mudou.
 */
export const STATUS_DO_ORCAMENTO: Record<string, { color: string; label: string; stage: number }> = {
    DRAFT: { color: 'default', label: 'Rascunho', stage: 0 },
    AWAITING_PAYMENT: { color: 'processing', label: 'Aguardando pagamento', stage: 1 },
    SENT: { color: 'processing', label: 'Enviado', stage: 1 },
    APPROVED: { color: 'success', label: 'Aprovado', stage: 1 },
    PAID: { color: 'green', label: '✅ Pago', stage: 2 },
    EXPIRED: { color: 'warning', label: 'Expirado', stage: -1 },
    REJECTED: { color: 'error', label: 'Recusado', stage: -1 },
    SENT_TO_ORDER: { color: 'cyan', label: '📦 Enviado para Pedido', stage: 2 },
}
