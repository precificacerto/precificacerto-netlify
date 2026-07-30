# SPEC 3.1 — Pedidos espelhar Orçamentos 100% (eliminar o orçamento-espelho)

> Doc `Correcoes_Mobile_Desktop_29-07-2026_1.docx` §3.1 / §2.2. Planejamento — aguardando aprovação.
> Autor: Orion (aios-master) · Data: 30/07/2026

## 1. Objetivo
Tornar **Pedidos** uma entidade de 1ª classe com a **mesma estrutura funcional de Orçamentos**, e **eliminar o orçamento-espelho** criado hoje em `handleConfirmSendToSale` (paliativo da Fase 1, item 1.2.8, que apenas o *oculta* via `budgets.source_order_id`).

## 2. Estado atual
- **Orçamentos** (`orcamentos/index.tsx`): form completo — produto manual, desconto (%/R$ + modos de absorção), cards de Comissão/Lucro (`ResidualDistributionBlock`), Memória Cascata completa (`ConsolidatedDREBlock` + motor V17), seleção de vendedor, tabela de preços.
- **Pedidos** (`pedidos/index.tsx`): form **reduzido** — itens (produto cadastrado + qty + preço), sem produto manual, sem desconto, sem cards de distribuição, sem cascata editável, sem seleção de tabela de preços no fluxo de edição.
- **Fluxo Pedido→Venda**: passa por um **budget-espelho** (status `APPROVED`) que alimenta a fila de Vendas. Na Fase 1 ele foi ocultado de /Orçamentos (`source_order_id`) e rotulado "Pedido" na fila.

## 3. Gap a fechar (Pedidos precisa ganhar)
1. **Adicionar produto manual** (mesma UX de Orçamentos; `is_manual_cost`).
2. **Desconto** (%/R$ + modos de absorção PROPORTIONAL/SELLER/PROFIT/PROFIT_PROTECTED).
3. **Cards de Comissão/Lucro** (`ResidualDistributionBlock`) + **DRE/Memória Cascata** (`ConsolidatedDREBlock`).
4. **Seleção de vendedor** e **tabela de preços** no form de edição.
5. **Adicionar itens a um pedido já existente** sem criar novo (o doc §3.1 é explícito).

## 4. Arquitetura proposta
**Princípio:** extrair a área de edição de Orçamentos em um componente compartilhado e reusá-lo em Pedidos, evitando duplicação e divergência (a causa-raiz do espelho).

- **Fase A — Componente compartilhado `DocumentEditor`** (novo, `src/page-parts/document-editor/`): recebe `documentType: 'budget' | 'order'`, `items`, handlers e o contexto fiscal (`mrmConfig`). Encapsula: lista de itens (+ manual), desconto, cards de distribuição, cascata, vendedor, tabela de preços. Orçamentos e Pedidos passam a consumi-lo.
- **Fase B — Persistência de Pedidos**: `order_items` já tem `commission_pct`/`profit_pct`/`tax_breakdown` (paridade com `budget_items`). Confirmar colunas de desconto em `orders` (ver `project_supabase_migrations_lessons` — schema de desconto difere por tabela). Migration se faltar `discount_mode`/`global_discount_percent`.
- **Fase C — Eliminar o espelho**: `Pedido → Vendas` passa a inserir o pendente **direto de `orders`** (a fila `fetchPendingBudgets` ganha união com pedidos `SENT_TO_SALE`, ou uma nova `fetchPendingOrders`). `handleRegisterSaleFromBudget` ganha variante `fromOrder`. Remover `handleConfirmSendToSale`→criação de budget-espelho. `cancel_sale_cascade` simplifica (não há mais espelho a soft-deletar). Descontinuar `budgets.source_order_id` após migração dos dados existentes.

## 5. Faseamento sugerido (incremental, com commits)
1. Extrair `DocumentEditor` de Orçamentos **sem mudar comportamento** (refactor puro + testes de regressão visual/numérica).
2. Plugar `DocumentEditor` em Pedidos (ganha manual/desconto/cards/cascata/vendedor/tabela).
3. Migration de colunas de desconto em `orders` (se necessária).
4. Fila de Vendas lê pedidos diretamente; gerar venda a partir de pedido.
5. Remover a criação do espelho; migrar/limpar espelhos legados; retirar `source_order_id`.

## 6. Oráculos / validação
- **Numérico:** um pedido convertido em venda deve produzir os **mesmos** valores (RRO, comissão, lucro, tributos) que o orçamento equivalente — reusar os cenários de `mrm-engine-v17.test.ts`.
- **Fluxo:** cobrir Pedido→Venda direto (sem espelho) e cancelamento (devolve o pedido a editável).

## 7. Riscos
- **Alto acoplamento** do editor de Orçamentos ao seu `index.tsx` (extração exige cuidado).
- **Divergência de schema** budgets↔orders (desconto) — ver lição registrada.
- **Fila de Vendas** hoje 100% baseada em budgets; unir pedidos exige refactor testado.
- Migração de **dados legados** (pedidos com espelho ativo) — precisa de backfill.

## 8. Critérios de aceite
- Pedido tem paridade funcional com Orçamento (manual, desconto, cards, cascata, vendedor, tabela).
- É possível adicionar itens a um pedido existente sem criar outro.
- Pedido→Venda **não cria** nenhum registro em Orçamentos.
- Nenhum oráculo do motor quebra; fluxo de cancelamento devolve à origem.

## 9. Estimativa
Épico de **~3–5 dias** (refactor + fila + migração + validação). Recomenda-se rodar como sprint dedicada com QA.
