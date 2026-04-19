# Epic: 22 Melhorias do Sistema — Abril 2026

**ID:** MELHORIAS-22-ABR2026
**Status:** Ready
**Data:** 2026-04-19
**Regime:** Todos os regimes (SN, LP, LR, MEI)
**Owner:** @pm Morgan
**Sprint Plan:** 6 sprints lógicas (execução em 1 dia)

---

## Objetivo

Consolidar 22 melhorias UX + correção de bugs + features novas (nova aba Pedidos, anexos de clientes, card Ponto de Equilíbrio, padronização BRL/%, entrada+parcelamento em comercial) para aumentar coesão do sistema e fechar gaps operacionais.

---

## Sprints (ordem de execução)

| Sprint | Escopo | Stories |
|--------|--------|---------|
| **S1 — Fundação & Bugs Críticos** | Padronização de formato, bugs de schema | T1, T9, T19 |
| **S2 — Produtos, Serviços, Itens** | Ajustes de formulário e precificação | T2, T3, T4, T5, T6, T7, T8 |
| **S3 — Estoque & Clientes** | Soft delete + anexos no histórico | T10, T11, T20 |
| **S4 — Comercial (Orçamentos e UX)** | Filtros, reposicionamento, popups | T12, T13, T15 |
| **S5 — Nova Aba Pedidos + Descontos unificados** | Feature maior (Pedidos) e modos de desconto | T14, T16, T17, T18 |
| **S6 — Financeiro & Home** | Código venda no fluxo + card Ponto de Equilíbrio | T21, T22 |

---

## Histórias (22)

| ID | Título | Sprint | Prioridade | Complexidade |
|----|--------|--------|------------|--------------|
| T1 | Padronização BRL (2 casas) e % (3 casas) em todo sistema | S1 | Alta | M |
| T2 | Sugestão NCM abaixo do campo NCM (não de Tabela Comissão) | S2 | Média | S |
| T3 | Remover campo "Desconto máximo permitido" em produtos/serviços | S2 | Baixa | XS |
| T4 | Trocar "Comissão do Vendedor (%)" por "Observações" em criar tabela | S2 | Média | S |
| T5 | Item revenda vincular a 1 tabela de produto | S2 | Alta | L |
| T6 | Matéria-prima em serviço mostrar só nome do item | S2 | Baixa | XS |
| T7 | Quantidade inteira em matéria-prima de serviços | S2 | Baixa | XS |
| T8 | Inverter layout da precificação de serviços | S2 | Baixa | S |
| T9 | Corrigir Mão de Obra Produtiva em serviços (bug) | S1 | Alta | M |
| T10 | Botão excluir em estoque (soft delete + popup) | S3 | Alta | M |
| T11 | Anexos no histórico do cliente via Supabase Storage | S3 | Alta | L |
| T12 | Orçamentos pagos sumirem (mostrar só rascunho/aguardando) | S4 | Média | S |
| T13 | Reposicionar "Orçamento válido até" acima de Observação | S4 | Baixa | XS |
| T14 | Nova aba "Pedidos" completa | S5 | Alta | XL |
| T15 | Popups de confirmação "Enviar para Vendas/Pedido" | S4 | Média | S |
| T16 | Entrada + parcelamento em orçamentos/pedidos/vendas | S5 | Alta | L |
| T17 | Desconto em % ou R$ (com teto) | S5 | Alta | M |
| T18 | Ativar modos de desconto em orçamentos/pedidos/agenda | S5 | Alta | M |
| T19 | Corrigir Relatório de Comissões (bug sales.client_id) | S1 | Alta | S |
| T20 | Histórico correto de pagamento parcial no cliente | S3 | Alta | M |
| T21 | Código da venda no fluxo de caixa | S6 | Média | S |
| T22 | Card "Ponto de Equilíbrio" na Home | S6 | Alta | M |

---

## Migrations Supabase necessárias

1. **`20260419000001_create_orders_tables.sql`** — cria `orders`, `order_items`, `order_purchase_tracking`
2. **`20260419000002_create_client_attachments.sql`** — cria tabela `client_attachments` + políticas RLS (bucket `comprovantes` já existe)
3. **`20260419000003_add_orders_module.sql`** — adiciona `ORDERS` em `user_module_permissions` ou constant equivalente (MODULES é só frontend, verificar backend)
4. **`20260419000004_partial_payment_history_refinement.sql`** — se necessário para T20 (adicionar campo `partial_paid_at` em `pending_receivables`)

---

---

# Story T1 — Padronização BRL (2 casas) e % (3 casas) em todo sistema

**Status:** Ready | **Sprint:** S1

### Contexto
Sistema usa formatadores dispersos (`currency-mask.ts`, `toLocaleString inline`, `formatBRL3` duplicado em `new-item-form.component.tsx:45`). Precisa centralizar em `src/utils/formatters.ts` com `formatBRL()` (2 casas) e `formatPercent()` (3 casas) e varrer todo o sistema.

### Critérios de Aceitação
- [ ] Criados `src/utils/formatters.ts` com `formatBRL(value)` → `R$ 21.000,52` e `formatPercent(value)` → `14,524%`
- [ ] Todas exibições de R$ em dashboard, orçamentos, vendas, pedidos, produtos, serviços, DRE, fluxo-de-caixa, relatórios, PDFs usam `formatBRL`
- [ ] Todas exibições de % usam `formatPercent` com 3 casas
- [ ] Regimes afetados: SN, LP, LR, MEI (todos)
- [ ] Nenhum `toLocaleString` solto em páginas; usar o util central

### Tarefas
- [ ] Criar `src/utils/formatters.ts`
- [ ] Grep por `toLocaleString.*BRL`, `maximumFractionDigits`, `formatBRL`, `currencyMask` e substituir
- [ ] Revisar PDFs (`src/lib/pdf/*`) e `preview-pdf.ts`

### Arquivos Afetados (estimativa)
- `src/utils/formatters.ts` (novo)
- `src/utils/currency-mask.ts` (refatorar ou manter e adicionar re-export)
- `src/pages/index.tsx`, `src/pages/orcamentos/index.tsx`, `src/pages/vendas/index.tsx`, `src/pages/produtos/*`, `src/pages/servicos/*`, `src/pages/dre/[year].tsx`, `src/pages/fluxo-de-caixa/index.tsx`, `src/pages/relatorios/index.tsx`
- `src/components/*`, `src/page-parts/*`

---

# Story T2 — Sugestão NCM abaixo do campo NCM

**Status:** Ready | **Sprint:** S2

### Contexto
Hoje em `new-item-form.component.tsx:40` o componente de sugestão NCM aparece visualmente abaixo do campo "Tabela de Comissão". Precisa aparecer logo abaixo do campo NCM.

### Critérios de Aceitação
- [ ] Ao digitar nome do produto, sugestões aparecem diretamente abaixo do input NCM
- [ ] Comportamento aplicado também ao form de criar produto (`produtos/index.tsx` drawer)
- [ ] Funciona para todos os regimes

### Arquivos Afetados
- `src/page-parts/items/new-item-form.component.tsx`
- `src/pages/produtos/index.tsx`

---

# Story T3 — Remover campo "Desconto máximo permitido"

**Status:** Ready | **Sprint:** S2

### Critérios
- [ ] Campo removido do form de criar/editar produto
- [ ] Campo removido do form de criar/editar serviço
- [ ] Campo removido do form de precificação
- [ ] Coluna do banco mantida (backward-compatible)

### Arquivos
- `src/pages/produtos/[id].tsx`, `src/pages/produtos/criar.tsx`
- `src/pages/servicos/[id].tsx`, `src/pages/servicos/criar.tsx`
- `src/page-parts/products/*`, `src/page-parts/services/*`

---

# Story T4 — Comissão do Vendedor (%) → Observações em criar tabela

**Status:** Ready | **Sprint:** S2

### Contexto
Em produtos e serviços há botão "Criar Tabela" (modal). O campo "Comissão do Vendedor (%)" é substituído por "Observações" (textarea livre).

### Critérios
- [ ] Campo Comissão do Vendedor removido do modal criar tabela
- [ ] Adicionado campo Observações (textarea, max 500 chars)
- [ ] Observações salvas na tabela `commission_tables` ou `product_tables` (verificar schema — adicionar coluna `notes` se necessário)
- [ ] Exibir Observações ao editar tabela

### Migration
- `ALTER TABLE commission_tables ADD COLUMN notes TEXT` (se não existir)

---

# Story T5 — Item revenda vincular a 1 tabela de produto

**Status:** Ready | **Sprint:** S2

### Contexto
Regimes e segmentações que permitem revenda. Quando tipo=Revenda, aparece campo "Escolher Tabela" com dropdown das tabelas criadas em produtos. Após salvar, na aba produtos a tabela vinculada mostra o item com alerta amarelo "termine de precificar" (alerta já existe no sistema). Ao clicar, form de precificação abre com descrição, NCM e dados já preenchidos.

### Critérios
- [ ] No `new-item-form`, quando `type=REVENDA`, campo "Escolher Tabela" aparece abaixo de "Tipo do item"
- [ ] Dropdown lista apenas tabelas criadas em `/produtos` (ativas)
- [ ] 1 item vincula a 1 tabela (relação N:1 via coluna `product_table_id` em `items`)
- [ ] Ao salvar, o item entra na tabela selecionada com status "aguardando precificação" (alerta amarelo existente)
- [ ] Ao precificar, form já tem descrição/NCM/etc do item prontos
- [ ] Permite adicionar mais itens na mesma precificação

### Migration
- `ALTER TABLE items ADD COLUMN product_table_id UUID REFERENCES product_tables(id)`

### Arquivos
- `src/page-parts/items/new-item-form.component.tsx`
- `src/pages/produtos/index.tsx` (lista e alerta)
- `src/pages/produtos/criar.tsx` (fluxo precificação)

---

# Story T6 — Matéria-prima em serviço: só nome

**Status:** Ready | **Sprint:** S2

### Critério
- [ ] No select de matéria-prima em serviços, exibir apenas `item.name` (sem `R$ X,XX` ou quantidades)

### Arquivo
- `src/page-parts/services/content.component.tsx`

---

# Story T7 — Quantidade inteira em matéria-prima de serviços

**Status:** Ready | **Sprint:** S2

### Critério
- [ ] Input de quantidade de matéria-prima em serviços aceita apenas números inteiros (não fração)
- [ ] Validação Yup: `.integer()`

### Arquivo
- `src/page-parts/services/content.component.tsx`

---

# Story T8 — Inverter layout precificação de serviços

**Status:** Ready | **Sprint:** S2

### Critério
- [ ] "Preço de Venda Sugerido" aparece à direita (com valor)
- [ ] "Lucro líquido R$ 0,00 / Margem: 0,000%" aparece na tarja verde inferior/esquerda

### Arquivo
- `src/pages/servicos/[id].tsx` e `src/page-parts/services/content.component.tsx`

---

# Story T9 — Corrigir Mão de Obra Produtiva em serviços (bug)

**Status:** Ready | **Sprint:** S1

### Contexto
Botão "Mão de Obra Produtiva" em serviços não funciona. Em produtos funciona (usa `productWorkloadMinutes × custoMinuto`, pricing-engine). Replicar a lógica em serviços.

### Critérios
- [ ] Input de minutos funciona em serviços
- [ ] Cálculo por minuto usa `laborCostMonthly / monthlyWorkloadMinutes`
- [ ] Integrado ao `pricing-engine.ts` (calcType=SERVICO já inclui MO no CMV)
- [ ] Preço calculado corretamente

### Arquivo
- `src/page-parts/services/content.component.tsx`
- Verificar `src/utils/pricing-engine.ts` — pode já funcionar, apenas UI quebrada

---

# Story T10 — Excluir produto/serviço/item em estoque (soft delete + popup)

**Status:** Ready | **Sprint:** S3

### Critérios
- [ ] Na linha da tabela de estoque, botão Excluir (ícone lixeira)
- [ ] Clique abre modal Ant Design "Deseja excluir este item? Esta ação oculta do sistema." Sim/Não
- [ ] Sim → `UPDATE products/services/items SET is_active=false, deleted_at=NOW() WHERE id=X`
- [ ] Item excluído não aparece em produtos/serviços/itens/estoque
- [ ] Histórico de vendas/orçamentos preserva referência (FK mantida)

### Migration
- Garantir `deleted_at TIMESTAMP` em `products`, `services`, `items` (adicionar se faltar)

### Arquivo
- `src/pages/estoque/index.tsx`

---

# Story T11 — Anexos no histórico do cliente via Supabase Storage

**Status:** Ready | **Sprint:** S3

### Contexto
Quando lançamento é feito (venda balcão ou conclusão de agendamento) com anexo, salvar em bucket `comprovantes` (já existe). Criar tabela `client_attachments` para link customer ↔ arquivo ↔ sale/event.

### Critérios
- [ ] Upload de anexo em nova venda balcão (`src/pages/vendas/index.tsx`)
- [ ] Upload de anexo em conclusão de agendamento (`src/pages/agenda/index.tsx` já tem comprovante)
- [ ] PDF até 20 páginas (~10MB). Imagens PNG/JPG aceitas
- [ ] Anexo aparece no histórico do cliente (`src/pages/clientes/[id].tsx` ou detalhe)
- [ ] Botão "Baixar" gera URL assinada (Supabase Storage signed URL)
- [ ] RLS: apenas o tenant do cliente pode baixar

### Migration
```sql
CREATE TABLE client_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  sale_id UUID REFERENCES sales(id),
  calendar_event_id UUID REFERENCES calendar_events(id),
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);
ALTER TABLE client_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON client_attachments
  FOR ALL USING (tenant_id = (SELECT tenant_id FROM user_tenants WHERE user_id = auth.uid()));
```

---

# Story T12 — Orçamentos pagos sumirem

**Status:** Ready | **Sprint:** S4

### Critério
- [ ] Query em `/orcamentos` filtra `status IN ('DRAFT','SENT','APPROVED')` (ou seja: rascunho + aguardando_pagamento)
- [ ] Status `PAID` não aparece no frontend (histórico fica em vendas)
- [ ] Status novo `SENT_TO_ORDER` (enviado para pedido) **pode aparecer** — user confirmou

### Arquivo
- `src/pages/orcamentos/index.tsx`

---

# Story T13 — "Orçamento válido até" acima de "Observação"

**Status:** Ready | **Sprint:** S4

### Critério
- [ ] Reordenar campos no drawer de criar orçamento

### Arquivo
- `src/pages/orcamentos/index.tsx`

---

# Story T14 — Nova aba "Pedidos" completa (FEATURE GRANDE)

**Status:** Ready | **Sprint:** S5 | **Complexidade:** XL

### Contexto
Nova página `/pedidos` entre Orçamentos e Vendas. Fluxo: Orçamento → Pedido → Venda (paga em vendas). Quando pago, some de Pedidos (histórico fica em vendas).

### Critérios

**Navegação e permissão:**
- [ ] `ORDERS` adicionado em `MODULES` (`src/hooks/use-permissions.hook.ts`)
- [ ] Nav sidebar inclui link "Pedidos" entre Orçamentos e Vendas (`src/components/layout/nav.component.tsx`)
- [ ] Form de permissões em `/funcionarios/[id]/permissoes` inclui módulo ORDERS (não_ver/visualizar/editar)

**Fluxo orçamento → pedido:**
- [ ] Botão "Enviar para Pedido" em `/orcamentos` (linha de cada orçamento)
- [ ] Popup confirmação (compartilha com T15)
- [ ] Cria registro em `orders` com numeração `PED-XXXXXX`, copia: customer, employee, budget_id, items, payment_method, discount_mode, totals
- [ ] Status orçamento vira `SENT_TO_ORDER`

**Página /pedidos:**
- [ ] Lista pedidos com status `DRAFT` e `AWAITING_PAYMENT` (pagos somem)
- [ ] Edição permite adicionar mais produtos — **apenas produtos vinculados ao vendedor do pedido**
- [ ] Botão "Enviar para Vendas" finaliza com popup de confirmação
- [ ] Filtros: produto (principal), cliente, vendedor, orçamento
- [ ] Código do pedido visível

**Feature "Ver quantidade de produtos":**
- [ ] Botão abre Drawer lateral direito
- [ ] Lista de produtos compilados de pedidos abertos (soma quantidade por produto)
- [ ] Mostra quais pedidos contêm cada produto
- [ ] Checkbox "Comprado" persistido em `order_purchase_tracking` (por produto + tenant)
- [ ] Produtos de pedidos pagos somem da lista

**Finalização (enviar para vendas):**
- [ ] Cria sale com todo histórico (customer, employee, items, payment, discount)
- [ ] Quando sale.status=PAID, pedido correspondente some do frontend (mantém FK `orders.sale_id`)

### Migration completa

```sql
-- orders
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  order_code TEXT NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES customers(id),
  employee_id UUID REFERENCES auth.users(id),
  budget_id UUID REFERENCES budgets(id),
  sale_id UUID REFERENCES sales(id),
  status TEXT NOT NULL DEFAULT 'DRAFT', -- DRAFT | AWAITING_PAYMENT | SENT_TO_SALE | PAID
  total_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_mode TEXT, -- PROPORTIONAL | PROFIT_REDUCTION | SELLER_REDUCTION
  discount_value NUMERIC(14,2),
  discount_percent NUMERIC(6,3),
  payment_method TEXT,
  installments INT,
  entry_value NUMERIC(14,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);
CREATE INDEX idx_orders_tenant_status ON orders(tenant_id, status);
CREATE INDEX idx_orders_sale ON orders(sale_id);

-- order_items
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  service_id UUID REFERENCES services(id),
  quantity NUMERIC(14,3) NOT NULL,
  unit_price NUMERIC(14,2) NOT NULL,
  total_price NUMERIC(14,2) NOT NULL,
  CHECK ((product_id IS NOT NULL) OR (service_id IS NOT NULL))
);

-- order_purchase_tracking (checkbox comprado)
CREATE TABLE order_purchase_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  product_id UUID NOT NULL REFERENCES products(id),
  is_purchased BOOLEAN NOT NULL DEFAULT false,
  purchased_at TIMESTAMPTZ,
  UNIQUE(tenant_id, product_id)
);

-- RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_purchase_tracking ENABLE ROW LEVEL SECURITY;

-- Função para gerar order_code sequencial por tenant
-- (igual padrão de sale_code já existente)
```

### Arquivos
- `src/pages/pedidos/index.tsx` (novo)
- `src/pages/pedidos/[id].tsx` (novo — detalhe/editar)
- `src/hooks/use-permissions.hook.ts` (adicionar ORDERS)
- `src/components/layout/nav.component.tsx` (adicionar link)
- `src/pages/funcionarios/[id]/permissoes.tsx` (adicionar módulo)
- `src/pages/orcamentos/index.tsx` (botão "Enviar para Pedido")
- `src/pages/vendas/index.tsx` (quando PAID, update orders.status)

---

# Story T15 — Popups de confirmação Enviar para Vendas/Pedido

**Status:** Ready | **Sprint:** S4

### Critérios
- [ ] Botão "Enviar para Vendas" em orçamentos → popup Ant Design Modal "Você quer enviar este orçamento para vendas? Sim/Não"
- [ ] Botão "Enviar para Pedido" em orçamentos → popup similar
- [ ] Sim executa, Não fecha modal

### Arquivo
- `src/pages/orcamentos/index.tsx`

---

# Story T16 — Entrada + parcelamento em orçamentos/pedidos/vendas (igual agenda)

**Status:** Ready | **Sprint:** S5

### Contexto
Agenda (linhas 556-775 de `src/pages/agenda/index.tsx`) tem lógica completa: entry_value, installments, pending_receivables. Extrair para componente compartilhado.

### Critérios
- [ ] Criar `src/components/payment-with-installments.component.tsx` (componente compartilhado)
- [ ] Integrado em `/orcamentos`, `/pedidos`, `/vendas`
- [ ] Ao dar entrada parcial, restante cai automaticamente em `pending_receivables` com `origin_type` correto
- [ ] Aba `/relatorios` / recebimentos mostra os lançamentos futuros

### Arquivos
- `src/components/payment-with-installments.component.tsx` (novo)
- `src/pages/orcamentos/index.tsx`, `src/pages/pedidos/index.tsx`, `src/pages/vendas/index.tsx`
- Refatorar uso em `src/pages/agenda/index.tsx` para consumir o componente

---

# Story T17 — Desconto em % ou R$ (com teto)

**Status:** Ready | **Sprint:** S5

### Critérios
- [ ] Campo desconto suporta toggle % ou R$ (não os dois simultâneos)
- [ ] Depende do modo selecionado (proporcional / redução lucro / redução vendedor)
- [ ] Exibe o teto máximo permitido pelo modo escolhido (em % e em R$)
- [ ] Validação: não ultrapassa o teto; se ultrapassar, bloqueia salvar e toast de erro
- [ ] Aplicado em orçamentos, pedidos e vendas

### Arquivos
- `src/components/discount-input.component.tsx` (novo)
- `src/utils/calculate-discount.ts` (ajustar para retornar teto máximo)
- `src/pages/orcamentos/index.tsx`, `src/pages/pedidos/*`, `src/pages/vendas/index.tsx`

---

# Story T18 — Modos de desconto em orçamentos/pedidos/agenda

**Status:** Ready | **Sprint:** S5

### Critérios
- [ ] Seletor de modo (PROPORTIONAL / PROFIT_REDUCTION / SELLER_REDUCTION) aparece em orçamentos, pedidos e agenda (conclusão)
- [ ] Em agenda, seletor aparece no popup de conclusão do agendamento
- [ ] Lógica reusa `calculate-discount.ts`

### Arquivos
- `src/pages/orcamentos/index.tsx`, `src/pages/pedidos/*`
- `src/pages/agenda/index.tsx` (popup de conclusão)

---

# Story T19 — Corrigir Relatório de Comissões (bug sales.client_id)

**Status:** Ready | **Sprint:** S1

### Contexto
Erro 400: `column sales.client_id does not exist`. Schema real é `sales.customer_id`. Query do relatório está usando nome antigo.

### Critérios
- [ ] Localizar query em `src/pages/relatorios/index.tsx` ou `src/pages/relatorio-vendas/*` (arquivo `relatorio-vendas-7e1ae29aaf21c6d6.js` no browser build)
- [ ] Substituir `client_id` → `customer_id`
- [ ] Verificar outros usos com Grep
- [ ] Testar lançamento → verificar relatório de comissões mostra o registro

### Arquivos
- `src/pages/relatorios/index.tsx`
- Possíveis: `src/pages/relatorio-vendas.tsx`, `src/page-parts/reports/*`

---

# Story T20 — Histórico correto de pagamento parcial no cliente

**Status:** Ready | **Sprint:** S3

### Contexto
Hoje, quando usuário dá entrada parcial, histórico do cliente mostra "pago" — mas o restante ainda não foi recebido. Precisa mostrar "pago parcialmente R$ X,XX de R$ Y,YY — saldo devedor R$ Z,ZZ".

### Critérios
- [ ] No histórico do cliente (`/clientes` detail), entradas de `pending_receivables` com `amount_paid < amount` mostram status "Pago Parcial"
- [ ] Mostra valor pago + valor faltante
- [ ] Lista cronológica de pagamentos parciais subsequentes
- [ ] Não marca como "Pago" até `amount_remaining = 0`

### Arquivo
- `src/pages/clientes/index.tsx` (ou detail se existir)
- `src/page-parts/customers/history.component.tsx` (se existir)

---

# Story T21 — Código da venda em entradas do fluxo de caixa

**Status:** Ready | **Sprint:** S6

### Critério
- [ ] Em `/fluxo-de-caixa`, entradas com `origin=SALE` mostram `sale_code` associado (já existe no schema — só renderizar)

### Arquivo
- `src/pages/fluxo-de-caixa/index.tsx`

---

# Story T22 — Card "Ponto de Equilíbrio" na Home

**Status:** Ready | **Sprint:** S6

### Contexto
Ao lado de Meta Mensal na Home (`/`). Mostra o ponto de equilíbrio financeiro da empresa.

### Fórmula
```
PE = (Salários produtivos + MO administrativa + Despesa Fixa)
     / (1 - (% custo produtos + % despesa variável + % despesa financeira + % comissões + % lucro + % impostos por dentro))
```

**Ignorar**: "despesa de acessórios" (categoria não existe)
**Impostos**: apenas os "por dentro" (regime tributário)
**Fonte**: dados do HUB (`tenant_expense_config` + regime tributário)

### Exemplo
```
Numerador = R$ 15.000 (salários prod + MO admin + fixa)
Denominador = 1 - 0.70 = 0.30
PE = 15.000 / 0.30 = R$ 50.000,00
```

### Critérios
- [ ] Card aparece na Home ao lado do card Meta Mensal
- [ ] Valor calculado a partir dos dados atuais do tenant
- [ ] Atualiza quando o HUB é alterado
- [ ] Usa `formatBRL` (da T1)

### Arquivos
- `src/pages/index.tsx`
- `src/components/card-kpi.component.tsx` (reuso)
- `src/utils/breakeven-calculator.ts` (novo)

---

## QA & Definition of Done (Epic inteiro)

- [ ] Todos os critérios de aceitação marcados
- [ ] `npm run lint` passa
- [ ] `npm run typecheck` passa (`tsc --noEmit`)
- [ ] Smoke test manual das features críticas (T14 Pedidos, T11 Anexos, T22 Ponto de Equilíbrio)
- [ ] Nenhuma regressão em orçamentos/vendas/agenda
- [ ] Migrations aplicadas com sucesso
- [ ] Regimes testados: MEI, SN, LP, LR
- [ ] QA Gate PASS por @qa Quinn

---

## Change Log

| Data | Autor | Mudança |
|------|-------|---------|
| 2026-04-19 | @pm Morgan (via @aios-master) | Epic criado com 22 stories, 6 sprints, migrations mapeadas |
