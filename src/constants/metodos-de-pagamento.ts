/**
 * OS MÉTODOS DE PAGAMENTO EXIBIDOS NA LISTA DE PEDIDOS E NA DE VENDAS.
 *
 * ══ POR QUE SÃO DOIS, E NÃO UM ══════════════════════════════════════════════════════════
 *
 * Porque eles JÁ DIVERGEM em produção, e unificá-los mudaria o que a tela mostra. Medido em
 * 14/10/2026, ao extrair as listas para componente:
 *
 * | chave | `pedidos` e `orcamentos` | `vendas` |
 * |---|---|---|
 * | `CHEQUE_PRE_DATADO` | `'🗓️ Cheque Pré-datado'` | **`'Cheque pré-datado'`** |
 *
 * Mesma chave, dois rótulos — sem emoji e com `p` minúsculo na venda. As outras oito linhas
 * são idênticas nas duas.
 *
 * ══ E SÃO SETE CÓPIAS NO REPOSITÓRIO, NÃO DUAS ══════════════════════════════════════════
 *
 * `const PAYMENT_METHODS` é declarado em SETE arquivos: `agenda`, `vendas`,
 * `controle-financeiro`, `pedidos`, `onboarding`, `fluxo-de-caixa` e `orcamentos`. É
 * `copia-divergente.md` com sete cópias e uma já divergente, e o remédio dela — apagar as
 * outras — é rodada PRÓPRIA: exige conferir as sete, decidir o rótulo vencedor de cada
 * divergência e medir a mudança em cada tela.
 *
 * **Esta rodada não a faz.** O portão da extração exige diff de comportamento VAZIO, e
 * unificar aqui mudaria o rótulo que a tela de Vendas exibe para cheque pré-datado — mudança
 * de comportamento no PR que existe para não ter nenhuma.
 *
 * O que este arquivo faz é o mínimo que a extração obriga: as duas listas que os componentes
 * precisam passam a ter UMA declaração cada, em vez de uma na página e outra no componente.
 * Duas cópias a menos; cinco continuam onde estavam, e esta nota é o registro de que foram
 * vistas e deixadas de propósito.
 */

export type MetodoDePagamento = { value: string; label: string }

/** A grafia de `pedidos` — e idêntica à de `orcamentos`, que não foi tocada. */
export const METODOS_DE_PAGAMENTO_PEDIDO: readonly MetodoDePagamento[] = [
  { value: 'PIX', label: '⚡ PIX' },
  { value: 'DINHEIRO', label: '💵 Dinheiro' },
  { value: 'CARTAO_CREDITO', label: '💳 Cartão de Crédito' },
  { value: 'CARTAO_DEBITO', label: '💳 Cartão de Débito' },
  { value: 'BOLETO', label: '📄 Boleto' },
  { value: 'TRANSFERENCIA', label: '🏦 Transferência' },
  { value: 'CHEQUE', label: '🧾 Cheque' },
  { value: 'CHEQUE_PRE_DATADO', label: '🗓️ Cheque Pré-datado' },
  { value: 'LANCAMENTOS_A_RECEBER', label: '📋 Lançamentos a Receber' },
]

/** A grafia de `vendas`. Diverge da de cima em `CHEQUE_PRE_DATADO`, e é assim de propósito. */
export const METODOS_DE_PAGAMENTO_VENDA: readonly MetodoDePagamento[] = [
  { value: 'PIX', label: '⚡ PIX' },
  { value: 'DINHEIRO', label: '💵 Dinheiro' },
  { value: 'CARTAO_CREDITO', label: '💳 Cartão de Crédito' },
  { value: 'CARTAO_DEBITO', label: '💳 Cartão de Débito' },
  { value: 'BOLETO', label: '📄 Boleto' },
  { value: 'TRANSFERENCIA', label: '🏦 Transferência' },
  { value: 'CHEQUE', label: '🧾 Cheque' },
  { value: 'CHEQUE_PRE_DATADO', label: 'Cheque pré-datado' },
  { value: 'LANCAMENTOS_A_RECEBER', label: '📋 Lançamentos a Receber' },
]
