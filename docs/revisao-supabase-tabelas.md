# Revisão das tabelas Supabase (Precifica Certo)

Última revisão: março 2026.

## Preço de venda e custo (products / pricing_calculations)

- **products.sale_price** e **products.cost_total**: devem armazenar **valores por unidade** (preço de venda por unidade e custo por unidade), alinhados à tela de "Precificação final do produto".
- A edge **calc-tax-engine** foi ajustada para usar `yieldQuantity: 1` no motor de preço, de modo que o resultado seja sempre por unidade e não seja dividido pelo `yield_quantity` do produto.
- **pricing_calculations**: guarda o último cálculo fiscal (sale_price_per_unit, cmv, etc.). A lista de produtos prioriza `products.sale_price` e `products.cost_total`; o fallback é pricing_calculations.

## Tabelas principais conferidas

| Tabela | Observação |
|--------|-------------|
| **products** | sale_price, cost_total, yield_quantity, product_type, base_item_id. OK. |
| **product_items** | product_id, item_id, quantity_needed; items com cost_per_base_unit. OK. |
| **items** | cost_price, quantity, cost_per_base_unit (trigger). OK. |
| **pricing_calculations** | product_id, sale_price_per_unit, cmv, calculated_at. OK. |
| **budgets** | tenant_id, created_by, status, sale_id, employee_id. OK. |
| **sales** | tenant_id, created_by, budget_id, final_value. OK. |
| **customers** | tenant_id, owner_id (employee_id). OK. |
| **employees** | tenant_id, user_id, pending_permissions. OK. |
| **users** | tenant_id, role (super_admin, admin, user). OK. |
| **services** | tenant_id, base_price, cost_total. OK. |
| **service_items** | service_id, item_id, quantity, cost_per_base_unit, item_quantity_snapshot. OK. |
| **stock** | tenant_id, product_id/item_id/service_id, quantity_current. OK. |
| **cash_entries** | tenant_id, created_by. OK. |
| **calendar_events** | tenant_id, user_id. OK. |

## Avisos de segurança (Supabase Advisors)

- **Function search_path**: funções `check_employee_user_not_super_admin`, `calc_cost_per_base_unit`, `update_fixed_expenses_updated_at` sem `search_path` fixo. Recomendação: definir `search_path` nas funções.
- **Extensions em public**: `pg_trgm` e `unaccent` no schema public. Opcional: mover para schema próprio.
- **RLS com USING/WITH CHECK true**: em `schedule_employees`, `service_items`, `tenant_billing` há políticas com `true` para INSERT/UPDATE/DELETE. Ideal restringir por `tenant_id` (ex.: `tenant_id = get_auth_tenant_id()`).
- **Leaked password protection**: proteção contra senhas vazadas desativada no Auth. Recomendação: ativar em Authentication > Settings.

## Migrações aplicadas

Todas as migrações listadas em `supabase/migrations` estão aplicadas, incluindo:

- `fix_revenda_products_cost_from_base_item` (correção de cost_total para REVENDA)
- `add_cost_per_base_unit_to_service_items`, `add_service_items_item_quantity_snapshot`
- `add_awaiting_payment_to_budget_status`, `add_budgets_sale_id_fkey`
- RLS de clientes (get_my_employee_id), serviços (tenant_isolation), orçamentos (tenant_all).
