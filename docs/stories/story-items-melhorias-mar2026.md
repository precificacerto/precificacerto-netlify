# Story: Melhorias em Itens, Produtos e Serviços — Março 2026

**ID:** ITEMS-001
**Status:** Done
**Data:** 2026-03-25
**Regime:** Todos os regimes (SN, LP, LR, MEI)

---

## Objetivo

Três melhorias interligadas na aba **Itens** e nas páginas de **Produtos** e **Serviços**:

1. **QTD. Medida** — campo de volume/medida por unidade comprada para fracionamento de custo
2. **Rename** — "Excluir quantidade" → "Excluir item"
3. **Lógica de atualização** — auto-update ao renovar + mover botões para Produtos/Serviços

---

## Contexto de Negócio

**Caso de uso principal:** Um usuário compra um item que vem com 900 mililitros (1 unidade). Ele precisa saber que essa unidade tem 900ml para fracionar o custo ao usar o item em produtos/serviços. Ex: se a unidade custa R$9,00 e ele usa 100ml num produto, o custo do item nesse produto deve ser R$1,00 (não R$9,00).

---

## Melhoria 1 — QTD. Medida e Reformulação do Formulário/Relatório

### Mudanças no Formulário (Criar/Editar Item — "Dados da Compra")

Reorganizar seção "Dados da Compra" no `new-item-form.component.tsx`:

**Linha 1 (grid 3 colunas):**
- **Unidade de medida** — campo já existente (`unit`)
- **QTD. Medida** — **novo campo** (`measure_quantity`): volume/medida do item (ex: 900 para 900ml). Padrão: 1. Tooltip: "Volume ou medida de cada unidade comprada. Usado para fracionar o custo na precificação."
- **Valor unitário** — campo já existente (`cost_price`, preenchido como custo por unidade)

**Linha 2 (grid 2 colunas):**
- **QTD. Comprado** — campo já existente (`quantity`): quantidade de unidades compradas (entra no estoque)
- **Estoque mínimo Alerta** — campo já existente (`min_limit` do stock, ou novo campo `min_stock_alert` no item)

> **Observação:** O campo `min_limit` já existe na tabela `stock`. Deve ser exibido no formulário de criação do item e salvo na tabela `stock` ao criar/editar o item.

### Mudanças no Relatório (Tabela da Página `/itens`)

**Colunas REMOVIDAS:** NCM, Custo total, Fornecedor

**Colunas NOVAS/MANTIDAS (ordem):**
| # | Coluna | Fonte |
|---|--------|-------|
| 1 | Nome | `items.name` |
| 2 | Tipo | `items.item_type` (tag colorida) |
| 3 | QTD. Medida | `items.measure_quantity + items.unit` (ex: "900 ml") |
| 4 | Custo/Unid. | `items.cost_per_base_unit` (custo por unidade base) |
| 5 | QTD. Estoque | `stock.quantity_current` (buscar join com stock) |
| 6 | Ações | Editar / Excluir item |

### Mudanças na Lógica de Precificação

**Supabase — Trigger `calc_cost_per_base_unit`:**
```sql
-- ANTES
NEW.cost_per_base_unit := NEW.cost_price / NULLIF(NEW.quantity, 0);

-- DEPOIS (considera measure_quantity)
NEW.cost_per_base_unit := NEW.cost_price / NULLIF(NEW.quantity * COALESCE(NEW.measure_quantity, 1), 0);
```

**Frontend — `calculateItemPrice` / uso nos serviços e produtos:**
Em todos os lugares onde se calcula custo proporcional:
```js
// ANTES
const refQty = Number(si.item?.quantity) || 1
const refPrice = Number(si.item?.cost_price) || 0
return calculateItemPrice(neededQty, refPrice, refQty)

// DEPOIS (considera measure_quantity)
const measureQty = Number(si.item?.measure_quantity) || 1
const refQty = (Number(si.item?.quantity) || 1) * measureQty
const refPrice = Number(si.item?.cost_price) || 0
return calculateItemPrice(neededQty, refPrice, refQty)
```

Arquivos afetados:
- `src/pages/servicos/index.tsx` — `calcServiceMaterialCost()` linha 82
- `src/page-parts/services/content.component.tsx` — linhas 115, 221, 239
- `src/pages/produtos/index.tsx` — onde usa `calculateItemPrice`
- `src/page-parts/products/content.component.tsx` — linha 494

### Migração Supabase

**Arquivo:** `supabase/migrations/20260325000001_add_measure_quantity_and_update_flags.sql`

```sql
-- 1. Adiciona measure_quantity à tabela items
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS measure_quantity NUMERIC DEFAULT 1;

-- 2. Atualiza trigger para considerar measure_quantity
CREATE OR REPLACE FUNCTION calc_cost_per_base_unit()
RETURNS TRIGGER AS $$
BEGIN
  NEW.cost_per_base_unit := NEW.cost_price / NULLIF(NEW.quantity * COALESCE(NEW.measure_quantity, 1), 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Adiciona needs_cost_update em products
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS needs_cost_update BOOLEAN DEFAULT FALSE;

-- 4. Adiciona needs_cost_update em services
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS needs_cost_update BOOLEAN DEFAULT FALSE;
```

---

## Melhoria 2 — Rename "Excluir quantidade" → "Excluir item"

**Arquivo:** `src/pages/itens/index.tsx`

Trocar em 3 lugares:
1. Linha ~965: botão "Excluir quantidade" na coluna Ações → **"Excluir item"**
2. Linha ~1073: título do Drawer `Excluir quantidade: ${name}` → **"Excluir item: ${name}"**
3. Linha ~1080: botão de confirmação "Excluir quantidade" → **"Excluir item"**

---

## Melhoria 3 — Lógica de Atualização (Mover Botões + Auto-update)

### 3a. Auto-update ao Renovar Quantidade

**Arquivo:** `src/pages/itens/index.tsx` — `handleSaveRenew()`

Após salvar a renovação de quantidade:
1. Calcular se o `cost_per_base_unit` mudou (comparar antes/depois)
2. Chamar automaticamente `updateProductsForItemCore(itemId, ...)` (já existe)
3. Marcar `needs_cost_update = true` em produtos e serviços vinculados:
   - **Produtos:** sempre (qty e value)
   - **Serviços:** somente se `cost_per_base_unit` mudou

```ts
// Após o update do item, antes de reloadItems():
const oldCost = Number(currentItem.cost_per_base_unit) || 0
const costChanged = Math.abs(newUnitCost - oldCost) > 0.0001

// Marca produtos como needs_cost_update = true
const { data: affectedProductItems } = await supabase
  .from('product_items')
  .select('product_id')
  .eq('item_id', itemId)
const { data: revendaProds } = await supabase
  .from('products')
  .select('id')
  .eq('base_item_id', itemId)
const productIds = [...new Set([
  ...(affectedProductItems || []).map(r => r.product_id),
  ...(revendaProds || []).map(r => r.id)
])]
if (productIds.length > 0) {
  await supabase.from('products').update({ needs_cost_update: true }).in('id', productIds)
}

// Marca serviços como needs_cost_update = true (somente se custo mudou)
if (costChanged) {
  const { data: affectedServiceItems } = await supabase
    .from('service_items')
    .select('service_id')
    .eq('item_id', itemId)
  const serviceIds = [...new Set((affectedServiceItems || []).map(r => r.service_id))]
  if (serviceIds.length > 0) {
    await supabase.from('services').update({ needs_cost_update: true }).in('id', serviceIds)
  }
}
```

### 3b. Ocultar Botões da Aba Itens

**Arquivo:** `src/pages/itens/index.tsx`

- **Remover** botão global "Atualizar todos os produtos e serviços" (linha ~994-999)
- **Remover** botão por item "Atualizar produtos e serviços" (linha ~953-963)
- Manter o estado `dirtyItems` apenas para uso interno ou remover se não mais necessário

### 3c. Adicionar Botões em Produtos

**Arquivo:** `src/pages/produtos/index.tsx`

1. **Buscar** `needs_cost_update` ao carregar produtos (`useProducts` hook ou query direta)
2. **Botão global** "Atualizar todos os produtos":
   - Posição: barra de filtros (filter-bar), ao lado do botão "+ Novo produto"
   - Verde (`type="primary"` com `style={{ background: '#16a34a', borderColor: '#15803d' }}`) quando `rawProducts.some(p => p.needs_cost_update)`
   - Disabled quando nenhum produto precisa de update
   - Ao clicar: roda `updateProductsForItemCore` para todos os produtos com `needs_cost_update=true`, depois seta `needs_cost_update=false`
3. **Botão por produto** "Atualizar produto":
   - Na coluna Ações da tabela de produtos
   - Verde quando `product.needs_cost_update === true`
   - Ao clicar: roda o update para aquele produto, depois seta `needs_cost_update=false`

**Lógica de atualização por produto:**
```ts
async function handleUpdateProduct(productId: string) {
  // Buscar todos os items do produto, recalcular cost_total, recalc sale_price via edge function
  // Setar products.needs_cost_update = false para esse produto
}

async function handleUpdateAllProducts() {
  const toUpdate = rawProducts.filter(p => p.needs_cost_update)
  for (const p of toUpdate) await handleUpdateProduct(p.id)
}
```

### 3d. Adicionar Botões em Serviços

**Arquivo:** `src/pages/servicos/index.tsx`

1. **Buscar** `needs_cost_update` ao carregar serviços
2. **Botão global** "Atualizar todos os serviços":
   - Posição: barra de filtros
   - Verde quando `services.some(s => s.needs_cost_update)`
   - Ao clicar: roda update para todos com `needs_cost_update=true`, depois seta `false`
3. **Botão por serviço** "Atualizar serviço":
   - Na coluna Ações da tabela de serviços
   - Verde quando `service.needs_cost_update === true`
   - Ao clicar: roda o update daquele serviço, seta `needs_cost_update=false`

**Lógica de atualização por serviço (só valor, não quantidade):**
```ts
async function handleUpdateService(serviceId: string) {
  // Buscar service_items com items, recalcular cost_total
  // Chamar computeServiceSellingPrice() para novo base_price
  // Atualizar services.cost_total, services.base_price, services.labor_cost
  // Setar services.needs_cost_update = false
}
```

### 3e. Após Update — Limpar Flag

Tanto em produtos quanto em serviços, após rodar o update com sucesso:
```ts
await supabase.from('products').update({ needs_cost_update: false }).eq('id', productId)
await supabase.from('services').update({ needs_cost_update: false }).eq('id', serviceId)
```

---

## Arquivos a Modificar

| # | Arquivo | Mudança |
|---|---------|---------|
| 1 | `supabase/migrations/20260325000001_add_measure_quantity_and_update_flags.sql` | **CRIAR** — migration Supabase |
| 2 | `src/page-parts/items/new-item-form.component.tsx` | Adicionar campo `measure_quantity` em "Dados da Compra" |
| 3 | `src/pages/itens/index.tsx` | Atualizar tabela, rename, remover botões, auto-update em `handleSaveRenew` |
| 4 | `src/pages/produtos/index.tsx` | Adicionar botões verde de update (global + por produto) |
| 5 | `src/pages/servicos/index.tsx` | Adicionar botões verde de update (global + por serviço) |
| 6 | `src/pages/servicos/index.tsx` | Atualizar `calcServiceMaterialCost` para usar `measure_quantity` |
| 7 | `src/page-parts/services/content.component.tsx` | Atualizar cálculo para usar `measure_quantity` |
| 8 | `src/page-parts/products/content.component.tsx` | Atualizar cálculo para usar `measure_quantity` |
| 9 | `src/pages/produtos/index.tsx` | Atualizar cálculo `calculateItemPrice` para usar `measure_quantity` |

---

## Critérios de Aceitação

- [x] Campo `measure_quantity` salvo e carregado no formulário de criação/edição de item
- [x] `cost_per_base_unit` calculado com `measure_quantity` (trigger atualizado)
- [x] Relatório de itens: colunas corretas (Nome, Tipo, QTD. Medida, Custo/Unid., QTD. Estoque, Ações)
- [x] Botão "Excluir item" substitui "Excluir quantidade" em todos os lugares
- [x] Ao renovar quantidade: `needs_cost_update` setado em produtos (sempre) e serviços (só se custo mudou)
- [x] Botões "Atualizar todos os produtos e serviços" removidos da aba Itens
- [x] Página Produtos: botão "Atualizar todos os produtos" verde quando há updates pendentes
- [x] Página Produtos: botão "Atualizar produto" verde por produto com update pendente
- [x] Página Serviços: botão "Atualizar todos os serviços" verde quando há updates pendentes
- [x] Página Serviços: botão "Atualizar serviço" verde por serviço com update pendente
- [x] Após update: `needs_cost_update` = false, botões voltam ao estado normal
- [x] Custo proporcional em produtos/serviços considera `measure_quantity` para fracionamento

---

## Notas Técnicas

- `measure_quantity` padrão = 1 (backward compatible — sem quebrar items existentes)
- O trigger SQL já existe (`trg_calc_cost_per_base_unit`), apenas a função precisa ser atualizada
- `needs_cost_update` é persistido no Supabase para funcionar entre sessões/abas
- A função `updateProductsForItemCore` em `itens/index.tsx` já contém toda a lógica de recálculo — reutilizar em produtos/serviços (extrair para utility ou duplicar a lógica necessária)
