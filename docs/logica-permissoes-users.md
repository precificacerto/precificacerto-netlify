# Lógica de permissões e escopo por usuário

## Visão geral

- **Admin (tenant)** e **super_admin**: veem e editam tudo da tenant (sem filtro por usuário).
- **User (funcionário)**:
  - Só vê dados da tenant à qual está vinculado.
  - Por módulo: **Não ver** (aba oculta), **Visualizar** (só leitura), **Editar** (criar/editar).
  - Em alguns módulos, vê e edita **apenas** registros vinculados ao seu **user_id** ou ao seu **employee_id** (employees.user_id = users.id).

## Níveis de permissão por módulo

| Nível      | Efeito |
|-----------|--------|
| **Não ver** | Aba não aparece no menu; usuário não acessa a rota. A lógica de negócio continua: ex. itens/produtos criados por ele entram no estoque e o admin vê. |
| **Visualizar** | Aba visível; usuário só consulta. Não pode criar nem editar (botões de novo/editar ocultos ou desabilitados). |
| **Editar** | Aba visível; pode criar e editar dentro do escopo permitido. |

## Módulos com escopo por usuário/employee

Para **Clientes**, **Funcionários**, **Agenda** e **Relatórios**, o user (não admin) só vê/edita registros vinculados ao seu ID. **Orçamentos** e **Vendas** são por tenant (admin vê tudo).

- **Clientes**: `customers.owner_id` = responsável (employee_id). User vê só onde `owner_id = get_my_employee_id()`. Ao criar cliente, não-admin recebe `owner_id = currentUser.employee_id`.
- **Funcionários**: user vê só a linha em que `employees.user_id = auth.uid()` (o próprio funcionário).
- **Orçamentos** e **Vendas**: RLS é por **tenant_id** (todos da tenant veem todos os orçamentos/vendas). Assim o **admin vê tudo** que o user cria (mesmo tenant). O front pode filtrar por `created_by` para exibir “meus” vs “todos” se desejar.
- **Agenda**: RLS restringe por `user_id = auth.uid()` para não-admin; admin vê todos da tenant.
- **Relatórios**: `report_snapshots` restringe por `created_by = auth.uid()`.

## Banco de dados (Supabase)

- **Função** `get_my_employee_id()`: retorna `employees.id` do usuário atual na tenant (para uso em RLS).
- **RLS**:
  - **customers**: SELECT/UPDATE/DELETE para não-admin só onde `owner_id = get_my_employee_id()`.
  - **employees**: SELECT para não-admin só onde `user_id = auth.uid()`.
  - **budgets**, **sales**, **calendar_events**, **report_snapshots**: já filtram por `created_by`/`user_id` = auth.uid() para não-admin.

## Frontend

- **Nav**: item de menu exibido só se `canView(module)` (e demais regras: adminOnly, etc.).
- **Páginas**: botões "Novo X" e ações de editar/excluir exibidos só se `canEdit(module)` (e, onde aplicável, se o registro pertence ao user, ex. `canEditCustomer(record)`).
- **Auth**: perfil do user inclui `employee_id` (employees.id onde user_id = uid) para uso em clientes e futuras regras de escopo.

## Itens, Produtos, Serviços e Estoque (todos da tenant)

- **Itens**, **produtos**, **serviços** e **estoque** são vinculados à tenant (tenant_id). Não há filtro por usuário: **todos os usuários ligados à tenant** veem os mesmos itens, produtos, serviços e estoque. RLS restringe por `tenant_id`; qualquer usuário da tenant vê tudo registrado na tenant.

## Estoque e “Não ver”

- Itens e produtos são sempre por **tenant_id** (sem owner_id).
- Quem tem permissão de editar Itens/Produtos cria registros na tenant; o **Estoque** apenas consulta esses dados.
- Se o user tiver **Não ver** em Estoque: a aba não aparece para ele, mas os itens/produtos que ele criar continuam no banco e aparecem no Estoque para o admin.

## Admin vê tudo da tenant

- Orçamentos, vendas, fluxo de caixa: dados são por **tenant_id**. O admin (e super_admin) vê todos.
- Quando um user cria orçamento ou venda, os registros ficam na mesma tenant; entradas em **cash_entries** (fluxo de caixa) também. O admin vê o total somando o que ele lança e o que os users lançam.

## Histórico do cliente para o user

- User com cliente vinculado (owner_id = seu employee_id) vê o **histórico completo** desse cliente: orçamentos, serviços, anexos. RLS em **budgets** permite SELECT quando `customer_id` pertence a um cliente que o user possui (`owner_id = get_my_employee_id()`).

## Agenda: vista semanal e agendamentos por usuário

- Para usuário (não admin), a agenda abre em **formato semanal** por padrão; o botão "Voltar para vista do dia" fica oculto. Admin continua podendo usar vista do dia e da semana.
- **Criação de agendamento**: ao criar um evento, o front envia `user_id = auth.uid()` no insert em `calendar_events`. Assim o user vê o agendamento que criou (RLS SELECT permite `user_id = auth.uid()` ou admin vê todos).
- **Admin** vê todos os agendamentos da tenant (de todos os users) e os que ele mesmo cria.
- **Concluir e lançar pagamento**: tanto admin quanto user (com permissão de editar agenda) podem concluir o serviço e marcar como pago. O valor é lançado em **cash_entries** (tenant_id + created_by). Entra no **fluxo de caixa**, **caixa** e **home** para o admin; mesmo que o user não tenha acesso a essas abas, o valor soma para o admin. O histórico do cliente é atualizado (customer_service_history, completed_services) e fica visível para o user (dono do cliente) e para o admin.

## Conectividade (WhatsApp) por usuário

- Modo **Próprio (OWN)**: cada usuário da tenant conecta **seu próprio** WhatsApp (token em `users.wuzapi_token`). Mensagens (lembretes, orçamentos) saem do número que o usuário conectou, não do admin.
- Modo **Compartilhado (SHARED)**: um único WhatsApp (do super admin) é usado por todos.

## Exclusão de user (ou bloqueio de admin)

- **User excluído**: removem-se apenas acesso e cadastro (permissões, employee.user_id, auth). **Não** se excluem budgets, sales, customers, cash_entries nem qualquer dado de negócio; o admin continua vendo tudo.
- **Admin excluído ou tenant sem pagamento**: nada é apagado; apenas o acesso do admin é bloqueado (ex.: is_active ou restrição de plano).
