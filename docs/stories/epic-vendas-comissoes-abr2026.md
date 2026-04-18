# Epic: Melhorias Vendas & Comissões — Abril 2026

**ID:** VENDAS-COMISSOES-ABR2026
**Status:** Ready
**Data:** 2026-04-18
**Regime:** Todos os regimes (SN, LP, LR, MEI)

---

## Objetivo

Três ajustes conectados ao fluxo de vendas, comissões e relatórios — (1) nova aba de Relatório de Comissões, (2) seletor de modo de aplicação de desconto, (3) enriquecimento do painel lateral de comissões do vendedor.

---

## Histórias do Epic

| ID | Título | Status | Prioridade |
|----|--------|--------|------------|
| VENDAS-COMISSOES-ABR2026-001 | Relatório de Comissões (nova aba) | Ready | Alta |
| VENDAS-COMISSOES-ABR2026-002 | Seletor de modo de desconto | Ready | Alta |
| VENDAS-COMISSOES-ABR2026-003 | Painel lateral de comissão mais completo | Ready | Média |

---

---

# Story VENDAS-COMISSOES-ABR2026-001
## Relatório de Comissões (Nova Aba)

**Status:** Ready
**Complexidade estimada:** M (Medium — 3-5 dias)
**Arquivo principal:** `src/pages/relatorio-vendas/index.tsx`

---

### Contexto de Negócio

Dentro de `src/pages/relatorio-vendas/index.tsx` (linhas 1319-1342) há Tabs com: `RECEIVABLES` ("Recebimento / Lançamentos Futuros"), `PRODUCTS` ("Curva ABC - Produtos"), `SERVICES` ("Curva ABC - Serviços"). É necessário adicionar uma nova aba `COMMISSIONS` ("Relatório de Comissões") posicionada **entre** `RECEIVABLES` e `PRODUCTS`. Vale para todos os regimes tributários (SN, LP, LR, MEI).

A granularidade da aba é **uma linha por PEDIDO** (não por item) — o marco de referência é o pedido de venda, não cada produto/serviço individual.

---

### Colunas Obrigatórias

1. **Data** (data do pedido)
2. **Nº do Pedido**
3. **Cliente** (via join com `customers`)
4. **Vendedor** (via join com `employees`)
5. **Valor Preciso** (custo total do pedido)
6. **Valor Vendido** (valor final do pedido)
7. **Comissão Paga (R$)** (valor absoluto)
8. **% Comissão** (percentual aplicado)
9. **Lucro da Empresa (R$)**

---

### Filtros

- **Vendedores** (multi-select)
- **Pedidos** (busca por número do pedido)
- **Produtos do pedido** (multi-select)

Todos os filtros funcionam em combinação (AND lógico).

---

### Fontes de Dados (Supabase)

- `sales` — cabeçalho do pedido
- `sale_items` — itens do pedido (para filtro por produtos e somas)
- `products` / `services` — nomes e referências
- `employees` — vendedor do pedido
- `customers` — cliente do pedido

Aproveitar queries existentes em `src/pages/comissao-vendedor/index.tsx` como referência para o cálculo de comissão.

---

### Critérios de Aceitação

- [ ] Aba "Relatório de Comissões" aparece entre "Recebimento / Lançamentos Futuros" e "Curva ABC - Produtos" em todos os regimes — **inclusive Revenda (sem guard `!isRevenda`)**
- [ ] Exibe uma linha por pedido com as 9 colunas descritas acima
- [ ] Filtros (vendedores, pedidos, produtos) funcionam em combinação (AND)
- [ ] Somatório no rodapé: total vendido, total comissão, total lucro
- [ ] Exportação CSV reutiliza o mesmo padrão das outras abas do relatório

---

### Edge Cases

- Pedido sem `employee_id` (vendedor): exibir `—` na coluna Vendedor e contabilizar comissão = 0
- Pedido cancelado (status `CANCELLED`): EXCLUIR do relatório
- Pedido sem itens (edge): não deve quebrar a query — fallback `valor preciso = 0`
- Pedido com produto excluído (soft-delete): mostrar "Produto removido" no filtro de produtos

### Escopo OUT (não faz parte desta story)

- Drill-down clicável do nº do pedido (abrir modal do pedido) — fica para backlog
- Edição inline de comissão pela tabela — NÃO
- Recálculo retroativo de comissão — NÃO (só exibe o persistido)
- Gráficos ou KPIs acima da tabela — NÃO (apenas cards de totais simples no rodapé)

### Default do filtro de data

- Default: últimos 30 dias (evita full-scan). Usuário pode estender via `DatePicker.RangePicker`.

### Comportamento em Revenda

- A aba "Relatório de Comissões" aparece **em todos os regimes incluindo Revenda** (a guarda `!isRevenda` usada para a aba SERVICES NÃO se aplica aqui).

---

### Tarefas de Implementação

- [ ] **T1** — Criar tipo `CommissionsReportRow` com os 9 campos descritos (Data, OrderNumber, Customer, Seller, PreciseValue, SoldValue, CommissionPaid, CommissionPct, CompanyProfit)
- [ ] **T2** — Adicionar `COMMISSIONS` ao array de tabs em `relatorio-vendas/index.tsx` (linhas 1319-1342) entre `RECEIVABLES` e `PRODUCTS`
- [ ] **T3** — Criar query que agrega dados por `sales.id` com joins em `sale_items`, `employees`, `customers`, `products` — retornando 1 linha por pedido
- [ ] **T4** — Implementar os 3 filtros (vendedores multi-select, busca por nº do pedido, produtos multi-select) com controlled state + aplicação via `useMemo`
- [ ] **T5** — Renderizar `Table` do Ant Design com as 9 colunas e rodapé (`summary`) mostrando total vendido, total comissão e total lucro
- [ ] **T6** — Adicionar exportação CSV seguindo o padrão já existente nas outras abas (mesma função utilitária)

---

### Arquivos Afetados

- `src/pages/relatorio-vendas/index.tsx`

---

---

# Story VENDAS-COMISSOES-ABR2026-002
## Seletor de Modo de Desconto

**Status:** Ready
**Complexidade estimada:** L (Large — 5-8 dias, envolve migration + 3 telas + snapshot de regressão)
**Arquivos principais:** `src/utils/calculate-discount.ts`, `src/pages/vendas/index.tsx`, `src/pages/agenda/index.tsx`

---

### Contexto de Negócio

Hoje, ao aplicar desconto em venda balcão (`src/pages/vendas/index.tsx`) ou dentro do fluxo do agente, o sistema usa `src/utils/calculate-discount.ts` (linhas 35-37) que divide o desconto **50/50 entre comissão e lucro**. O teto atual do desconto é `profit_percent + commission_percent` do produto/serviço.

Essa divisão automática não é adequada para todos os cenários de negócio — em algumas vendas o empresário quer que o desconto saia **apenas do lucro** (para preservar a motivação do vendedor), em outras quer que saia **apenas da comissão** (quando o vendedor oferece o desconto por conta própria).

---

### Mudança Proposta

Antes do campo "desconto %" adicionar um `Select` com 3 opções (pré-setado em "Proporcional"):

1. **Proporcional** — mantém lógica atual 50/50 entre comissão e lucro.
   - Teto = `profit_percent + commission_percent`
2. **Redução do Lucro** — desconto sai apenas do lucro.
   - Teto = `profit_percent` do produto/serviço
3. **Redução do Vendedor** — desconto sai apenas da comissão do vendedor.
   - Teto = `commission_percent` do produto/serviço

O campo de desconto % passa a ter **teto dinâmico** conforme o modo escolhido.

---

### Impactos a Mapear

A feature deve ser aplicada em **todos os lugares que registram comissões**:

- Venda balcão (`src/pages/vendas/index.tsx`)
- Venda via agenda (`src/pages/agenda/index.tsx` — linhas 557, 718, 749 onde `discount_percent` é usado)
- Persistência em `sales` e `sale_items` (`commission_amount`, `discount`, `profit_amount` se existir)
- Leitura em `comissao-vendedor/index.tsx`
- Leitura no novo relatório da Story 1

---

### Critérios de Aceitação

- [ ] Select "Modo de desconto" aparece antes do campo "desconto %" em venda balcão e venda agente
- [ ] Opção default: "Proporcional"
- [ ] Modo "Proporcional" mantém comportamento atual (50/50) — sem regressão
- [ ] Modo "Redução do Lucro" limita teto do desconto a `profit_percent` e subtrai apenas do lucro
- [ ] Modo "Redução do Vendedor" limita teto do desconto a `commission_percent` e subtrai apenas da comissão
- [ ] Valor de comissão persistido em `sales.commission_amount` reflete corretamente o modo escolhido
- [ ] Modo escolhido é persistido no pedido (novo campo `discount_mode` em `sales`)
- [ ] Relatório de Comissões (Story 1) e painel do vendedor (Story 3) refletem o valor correto de comissão resultante
- [ ] Backfill: todas as vendas pré-existentes ficam com `discount_mode='PROPORTIONAL'` (sem regressão)
- [ ] Edge case: quando `commission_percent=0` E mode=`SELLER_REDUCTION` → teto do desconto = 0% (campo fica disabled com tooltip "Comissão zero — sem margem de vendedor para reduzir")
- [ ] Edge case: quando `profit_percent=0` E mode=`PROFIT_REDUCTION` → mesmo comportamento (teto=0, disabled)
- [ ] Teto do campo recalcula automaticamente ao trocar de modo (useMemo react ao `discountMode`)
- [ ] Agenda (`agenda/index.tsx`) e venda balcão mostram o mesmo Select consistentemente
- [ ] Snapshot de teste: comissões dos últimos 30 dias com mode=`PROPORTIONAL` antes e depois da migration são IDÊNTICAS (prova de zero regressão)

---

### Tarefas de Implementação

#### Backend — Migration Supabase

- [ ] **T1** — Criar migration adicionando coluna `discount_mode` (enum: `PROPORTIONAL` | `PROFIT_REDUCTION` | `SELLER_REDUCTION`) em `sales` (decisão do @architect: localização travada em `sales`, nível do pedido)

```sql
-- Migration: 2026XXXX_add_discount_mode_to_sales.sql
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS discount_mode TEXT NOT NULL DEFAULT 'PROPORTIONAL'
  CHECK (discount_mode IN ('PROPORTIONAL', 'PROFIT_REDUCTION', 'SELLER_REDUCTION'));

COMMENT ON COLUMN public.sales.discount_mode IS
  'Modo de aplicação do desconto: PROPORTIONAL (50/50 lucro+comissão), PROFIT_REDUCTION (só lucro), SELLER_REDUCTION (só comissão do vendedor).';

-- Backfill: vendas pré-existentes herdam PROPORTIONAL (equivalente ao comportamento antigo)
UPDATE public.sales SET discount_mode = 'PROPORTIONAL' WHERE discount_mode IS NULL;
```

#### Utilitário — calculate-discount.ts

- [ ] **T2** — Estender `src/utils/calculate-discount.ts` (linhas 35-37) para receber `mode` e retornar `commissionReduction` + `profitReduction` conforme a regra:

```typescript
export type DiscountMode = 'PROPORTIONAL' | 'PROFIT_REDUCTION' | 'SELLER_REDUCTION'

/**
 * discountPercent é % DA MARGEM (commission+profit), não % absoluto.
 * Quando mode != PROPORTIONAL, o teto do discountPercent é diferente:
 *   PROFIT_REDUCTION:  teto = profitPct / (profitPct + commissionPct) * 100
 *   SELLER_REDUCTION:  teto = commissionPct / (profitPct + commissionPct) * 100
 * (Quando profitPct+commissionPct = 0, teto = 0.)
 *
 * Retorno mantém a mesma shape da função atual — apenas a divisão muda.
 */
export function calculateDiscountedPrice(
  salePrice: number,
  costWithTaxes: number,
  discountPercent: number,
  mode: DiscountMode = 'PROPORTIONAL',
): { finalPrice: number; discountValue: number; commissionReduction: number; profitReduction: number } {
  if (discountPercent <= 0) {
    return { finalPrice: salePrice, discountValue: 0, commissionReduction: 0, profitReduction: 0 }
  }
  const margin = Math.max(0, salePrice - costWithTaxes)
  const clampedPercent = Math.min(discountPercent, 100)
  const discountValue = margin * clampedPercent / 100
  const finalPrice = salePrice - discountValue

  let commissionReduction: number
  let profitReduction: number
  switch (mode) {
    case 'PROFIT_REDUCTION':
      commissionReduction = 0
      profitReduction = discountValue
      break
    case 'SELLER_REDUCTION':
      commissionReduction = discountValue
      profitReduction = 0
      break
    case 'PROPORTIONAL':
    default:
      commissionReduction = discountValue / 2
      profitReduction = discountValue / 2
  }
  return { finalPrice, discountValue, commissionReduction, profitReduction }
}
```

#### Frontend — Venda Balcão e Venda Agente

- [ ] **T3** — Adicionar `Select` antes do `InputNumber` de desconto em venda balcão (`src/pages/vendas/index.tsx`)
- [ ] **T4** — Replicar o `Select` em `src/pages/agenda/index.tsx` (mesmo padrão de Select + InputNumber), reutilizando o componente criado em T3
- [ ] **T5** — Atualizar cálculo do teto do desconto baseado no modo escolhido (`useMemo` reagindo a `discountMode` + produto/serviço atual)
- [ ] **T6** — Persistir `discount_mode` ao salvar o pedido (`INSERT` em `sales` ou `sale_items`)
- [ ] **T7** — Ajustar leitura nas páginas de comissão (`comissao-vendedor/index.tsx`) e no novo relatório (Story 1) para considerar `discount_mode` quando houver recálculo

---

### Arquivos Afetados

- `src/utils/calculate-discount.ts`
- `src/pages/vendas/index.tsx`
- `src/pages/agenda/index.tsx`
- `supabase/migrations/` (nova migration)
- `src/pages/comissao-vendedor/index.tsx` (leitura)
- `src/pages/relatorio-vendas/index.tsx` (leitura)

---

---

# Story VENDAS-COMISSOES-ABR2026-003
## Painel Lateral de Comissão Mais Completo

**Status:** Ready
**Complexidade estimada:** S (Small — 1-2 dias)
**Arquivo principal:** `src/pages/comissao-vendedor/index.tsx`

---

### Contexto de Negócio

Em `src/pages/comissao-vendedor/index.tsx` (linhas 711-712, 944-1011), o ícone olho (`EyeOutlined`) abre um `Drawer` lateral (`drawerOpen`, `drawerRow`). A tabela de detalhes atual (linhas 625-700) tem 8 colunas: Tipo, Status, Data, Produto/Serviço, Cliente, % Comissão, Valor Base, Comissão.

O drawer precisa ser ampliado e enriquecido para dar mais contexto ao vendedor sobre cada comissão — em especial **a que pedido ela pertence** e **se foi um pagamento parcelado**.

---

### Mudanças

1. **Aumentar a largura do Drawer** (atual padrão ~520px) para `width={800}` ou `width="60%"` — ficar confortável para leitura das novas colunas
2. **Adicionar 2 novas colunas em `detailColumns`:**
   - **Parcela** — exibe `X/Y` quando o pagamento for parcelado; em branco ou `"À vista"` quando não for
   - **Nº do Pedido** — referência a `sales.order_id` ou `sales.id` (clicável se viável)
3. **Garantir que a coluna "Cliente" exibe o nome** quando houver vínculo via join com `customers` (fallback `—` se não houver)

---

### Critérios de Aceitação

- [ ] Drawer abre com largura ampliada (confortável para ler as 10 colunas)
- [ ] Coluna "Parcela" exibe `X/Y` quando pagamento for parcelado, ou traço (`—`) quando à vista
- [ ] Coluna "Nº do Pedido" exibe o identificador do pedido (clicável se viável)
- [ ] Coluna "Cliente" continua mostrando o nome do cliente quando há `customer_id` vinculado
- [ ] Sem regressão nas 8 colunas existentes (Tipo, Status, Data, Produto/Serviço, Cliente, % Comissão, Valor Base, Comissão)
- [ ] Drawer funcional em mobile (viewport <800px) — sem scroll horizontal forçado
- [ ] Comissão sem vínculo de pedido (edge raro): coluna "Nº do Pedido" exibe `—` sem quebrar a renderização
- [ ] Venda à vista (1 única linha em `pending_receivables`): coluna "Parcela" exibe `—` (não `1/1`)

---

### Tarefas de Implementação

- [ ] **T1** — Alterar prop width do Drawer (linha ~945) para responsivo: width={{ xs: '100%', md: 800 }} ou width="min(800px, 95vw)" para suportar mobile
- [ ] **T2** — Estender interface `CommissionDetailRow` (linhas 35-46) com os campos:
  ```typescript
  interface CommissionDetailRow {
    // ... campos existentes
    installment_current?: number | null;
    installment_total?: number | null;
    order_id?: string | null;
  }
  ```
- [ ] **T3** — Ajustar queries em `detail_rows` (linhas 317-573) para trazer parcela e `order_id`:
  - **Parcela:** cada parcela é uma linha em `pending_receivables` (coluna `sale_id`, `launch_date`). Derivar `installment_current`/`installment_total` via:
    ```sql
    SELECT
      pr.*,
      ROW_NUMBER() OVER (PARTITION BY pr.sale_id ORDER BY pr.launch_date) AS installment_current,
      COUNT(*)    OVER (PARTITION BY pr.sale_id)                           AS installment_total
    FROM pending_receivables pr
    WHERE pr.sale_id = ANY($sale_ids)
    ```
    OU equivalente client-side via `groupBy(sale_id)` após SELECT. **NÃO existe coluna `installment_number` na base** — é derivada.
  - **order_id:** join direto com `sales(id)`
- [ ] **T4** — Adicionar duas novas colunas em `detailColumns` (linhas 625-700) com formatação `X/Y`:
  ```tsx
  {
    title: 'Parcela',
    key: 'installment',
    render: (_: any, row: CommissionDetailRow) =>
      row.installment_total && row.installment_total > 1
        ? `${row.installment_current}/${row.installment_total}`
        : '—',
  },
  {
    title: 'Nº do Pedido',
    dataIndex: 'order_id',
    key: 'order_id',
    render: (orderId: string | null) => orderId ?? '—',
  },
  ```
- [ ] **T5** — Validar o join com `customers` já existente — reforçar fallback `—` quando não houver cliente vinculado

---

### Arquivos Afetados

- `src/pages/comissao-vendedor/index.tsx`

---

## Riscos e Dependências

- **Story 2 é bloqueante para o Relatório da Story 1:** o valor de comissão exibido no novo relatório deve refletir o `discount_mode` escolhido no pedido. Sem a Story 2, o relatório pode mostrar comissões inconsistentes para pedidos que receberam desconto.
- **Story 3 se beneficia da Story 2:** ao adicionar a coluna "Nº do Pedido" no drawer, o vendedor poderá rastrear para cada comissão o modo de desconto aplicado — útil para entender reduções de comissão.
- **Risco de migration (Story 2):** adicionar `discount_mode` a `sales` ou `sale_items` exige backfill de pedidos antigos com `PROPORTIONAL` (default) para não quebrar leitura existente.
- **Risco de performance (Story 1):** agregar 1 linha por pedido com múltiplos joins (`sales` + `sale_items` + `employees` + `customers` + `products`) pode ser custoso. Considerar paginação ou limites de data por padrão.
- **Consistência de snapshot (Story 2):** antes do deploy da migration, exportar CSV das comissões dos últimos 30 dias. Após deploy, reexportar com mode=PROPORTIONAL. Valores devem ser idênticos — senão, rollback obrigatório.
- **Ambiguidade "agente" vs "agenda":** o termo usado pelo solicitante era "agente", mas o fluxo real é "agenda" (`src/pages/agenda/index.tsx`). Documentado para evitar confusão futura.
- **Derivação de parcela (Story 3):** se um dia o modelo mudar para uma tabela `sale_installments` própria, a query da Story 3 precisa ser reescrita. Hoje derivamos de `pending_receivables` via window function.

---

## Definição de Pronto (DoD) do Epic

- [ ] Todas as 3 stories com status `Done`
- [ ] Nenhum erro de lint (`npm run lint`)
- [ ] Build sem erros (`npm run build`)
- [ ] Migration SQL da Story 2 aplicada no Supabase
- [ ] Testado manualmente nos fluxos descritos em cada story
- [ ] Valores de comissão consistentes entre: venda balcão, venda agente, relatório de comissões e painel do vendedor

---

## Change Log

| Data | Versão | Descrição | Autor |
|------|--------|-----------|-------|
| 2026-04-18 | v1.0 | Epic criado | @pm (Morgan) |
| 2026-04-18 | v1.1 | Refinamento pós-QA: API `calculateDiscountedPrice` alinhada, `discount_mode` travado em `sales`, `agenda/index.tsx` confirmada, parcela derivada de `pending_receivables`, edge cases e estimativas adicionados | @pm (Morgan) |
