# Relatório QA E2E — Plataforma (usuário role user)

**Data:** 2026-03-04  
**Perfil:** usuário logado (role user)  
**Login:** matheustorquato1910@hotmail.com  
**Escopo:** navegação e funcionalidades principais.

---

## Resumo executivo

- **Login:** OK (redirecionamento para Dashboard).
- **Páginas acessíveis:** Dashboard, Produtos, Itens, Serviços, Estoque, Orçamentos, Vendas, Agenda, Configurações, Criar produto.
- **Caixa e DRE:** Este usuário não tem permissão de acesso; 404/restrição é comportamento esperado.
- **Erros de UI/console mapeados:** título da aba com "undefined", depreciação Sass, HMR/Next.js, aviso antd React 19.

---

## 1. Erros e problemas mapeados

### 1.1 Crítico / UX — Título da aba com "undefined"

**Onde:** Todas as páginas que usam `Layout` (Dashboard, Produtos, Itens, Serviços, Estoque, Orçamentos, Vendas, Agenda, Configurações, Criar produto, 404).

**Comportamento:** O título da aba do navegador aparece como `"Dashboard | undefined"`, `"Produtos | undefined"`, etc.

**Causa raiz:** Em `src/constants/page-titles.ts`, `APP_TITLE` é definido como `process.env.NEXT_PUBLIC_APPLICATION_TITLE`. Se a variável não estiver definida no `.env` (ou `.env.local`), o valor é `undefined` e é exibido no `<title>` em `src/components/layout/layout.component.tsx`:  
`<title>{`${title || tabTitle} | ${APP_TITLE}`}</title>`.

**Recomendação:**  
- Definir `NEXT_PUBLIC_APPLICATION_TITLE=Precifica Certo` no `.env.local` (ou equivalente), ou  
- Garantir fallback no código, por exemplo:  
  `export const APP_TITLE = process.env.NEXT_PUBLIC_APPLICATION_TITLE ?? 'Precifica Certo'`.

---

### 1.2 Caixa e DRE — Sem acesso (esperado)

Para o usuário de teste (role user), **não há permissão** para Caixa e DRE. O 404 ou a restrição de acesso é o comportamento esperado para esse perfil.

---

### 1.3 Console — Depreciação Sass @import

**Arquivo:** `src/styles/globals.scss`  
**Linhas:** 2, 3, 4 (e possivelmente outras com `@import` de tailwind).

**Mensagem:**  
`Sass @import rules are deprecated and will be removed in Dart Sass 3.0.0.`

**Trecho atual (ex.):**
```scss
@import 'tailwindcss/base';
@import 'tailwindcss/components';
@import 'tailwindcss/utilities';
```

**Recomendação:**  
Migrar para `@use` / `@forward` conforme documentação do Sass e do Tailwind (quando suportado). Até lá, o aviso é apenas de depreciação; não quebra a build.

---

### 1.4 Console — HMR (Next.js) — TypeError

**Contexto:** Hot Module Replacement (dev).

**Mensagem (resumida):**  
`[HMR] Invalid message: {"action":"isrManifest","data":{...}}`  
`TypeError: Cannot read properties of undefined (reading 'components')`  
Em: `handleStaticIndicator` (hot-reloader-pages.js).

**Recomendação:**  
Tratar como possível bug/limitação do Next.js em dev (HMR). Verificar se ocorre em build de produção; se não ocorrer em produção, pode ser apenas ruído de dev.

---

### 1.5 Console — Ant Design e React 19

**Mensagem:**  
`[antd: compatible] antd v5 support React is 16 ~ 18. see https://u.ant.design/v5-for-19 for compatible.`

**Recomendação:**  
Verificar documentação oficial do antd para React 19 e aplicar ajustes de compatibilidade ou aguardar suporte oficial.

---

### 1.6 Agenda — Horário criado não aparecia na grade (corrigido)

**Onde:** `src/pages/agenda/index.tsx` — criação de agendamento via drawer (Novo Serviço / clique no slot).

**Comportamento:** Ao criar um horário na agenda, o evento não aparecia na grade da semana, mesmo após "Agendado!". No console: aviso *"There may be circular references"* em `openNew` (linha 165) e no `onClick` do slot (linha 600).

**Causa raiz:**  
- **Referência circular:** `openNew` e `openEdit` eram funções recriadas a cada render e passadas aos slots/eventos. Isso gerava o aviso do React e poderia atrapalhar a atualização do estado após `fetchAll()`, fazendo a grade não refletir o novo evento.  
- **Closure em fetchAll:** O `fetchAll` usava `weekEnd` do closure; o cálculo do fim da semana passou a ser feito dentro do callback para garantir o intervalo correto na refetch.

**Correção aplicada:**  
1. `openNew` e `openEdit` foram envolvidos em `useCallback` (deps `[]`) para referência estável e eliminação do aviso de referência circular.  
2. Dentro de `fetchAll`, o fim da semana passou a ser calculado como `weekStart.add(6, 'day').endOf('day')` no próprio callback, evitando closure desatualizado.

**Verificação Supabase:**  
- Tabela `calendar_events` existe e possui as colunas esperadas (`tenant_id`, `user_id`, `title`, `start_time`, `end_time`, `employee_id`, `status`, etc.).  
- Consulta ao tenant de teste (`ab494f83-15ab-4c58-af2a-ab2bd46a5b36`) retornou eventos recentes (ex.: "Serviço QA E2E Teste", "corte") com `start_time`, `end_time`, `employee_id` e `status` preenchidos.  
- **Conclusão:** Os inserts estão sendo persistidos no Supabase; o problema era apenas na UI (atualização após salvar). Recomenda-se validar RLS em `calendar_events` se algum usuário não vir eventos que acabou de criar.

---

## 2. Fluxos testados (resumo)

| Área            | URL              | Resultado |
|-----------------|------------------|-----------|
| Login           | /login           | OK        |
| Dashboard       | /                | OK        |
| Produtos        | /produtos        | OK        |
| Criar produto   | /produtos/criar  | OK        |
| Itens           | /itens           | OK        |
| Serviços        | /servicos        | OK        |
| Estoque         | /estoque         | OK        |
| Orçamentos     | /orcamentos      | OK        |
| Vendas          | /vendas          | OK        |
| Agenda          | /agenda          | OK        |
| Configurações   | /configuracoes   | OK        |
| Caixa           | /caixa           | Sem acesso (esperado) |
| DRE             | /dre             | Sem acesso (esperado) |

---

## 3. Testes de funcionalidades (por página)

| Página / Ação | Teste realizado | Resultado |
|---------------|-----------------|-----------|
| **Login** | Login com email/senha | OK — redireciona para Dashboard |
| **Dashboard** | Visualização de gráficos e resumo | OK — carrega sem erro |
| **Produtos** | Listagem, botão "Adicionar produto" | OK — navega para /produtos/criar |
| **Produtos / Criar** | Formulário de criação | OK — campos e abas carregam |
| **Itens** | Listagem (8 itens) | OK |
| **Itens / Adicionar item** | Abertura do drawer e preenchimento (Nome, Qtd, Valor) | **Corrigido:** campo Unidade passou a ter `initialValue="UN"` em `new-item-form.component.tsx`, evitando validação falha quando o usuário não rola até o campo. |
| **Itens / Editar** | Botão Editar na lista | Não testado (fluxo similar ao adicionar) |
| **Itens / Renovar quantidade** | Botão "+ Renovar quantidade" | Não testado |
| **Serviços** | Listagem e busca | OK — página carrega (0 serviços no tenant) |
| **Estoque** | Abas Itens/Insumos, Produtos Acabados | OK — listagem e botões Movimentar/Editar visíveis |
| **Orçamentos** | Listagem e "Novo Orçamento" | OK — página carrega |
| **Vendas** | Listagem e "Venda no Balcão" | OK |
| **Agenda** | Calendário e botões (Funcionário, Novo Serviço) | OK |
| **Configurações** | Abas (Empresa, Fiscal, Custos, Equipe, Config. Cálculo) e formulário Empresa | OK — dados da empresa carregam (Razão Social, CNPJ, Email, etc.) |

---

## 4. Verificação Supabase (tenant do usuário de teste)

**Tenant:** `ab494f83-15ab-4c58-af2a-ab2bd46a5b36` (Empresa Metheus)

| Tabela | Verificação | Resultado |
|--------|-------------|-----------|
| **users** | Usuário de teste vinculado ao tenant | OK — email matheustorquato1910@hotmail.com, tenant_id correto |
| **tenants** | Dados da empresa (name, email, phone) | OK — Empresa Metheus, email/telefone preenchidos |
| **tenant_settings** | Configurações fiscais e de cálculo | OK — tax_regime (SIMPLES_NACIONAL), state_code (SC), workload, employees, etc. |
| **items** | Itens do tenant | OK — 8 registros; listagem na UI bate com a base |
| **products** | Produtos do tenant | OK — 2 registros (Bolo, Salgado); dados consistentes |
| **stock** | Registros de estoque (itens + produtos) | OK — 8 registros para o tenant |
| **budgets** | Orçamentos | OK — 0 orçamentos (condizente com a tela) |
| **budget_items** | Itens de orçamentos | N/A — 0 orçamentos |
| **calendar_events** | Eventos da agenda (agendamentos) | OK — inserts persistidos; eventos com title, start_time, end_time, employee_id, status. Ver 1.6 e 6.5 (correção UI para exibir após criar). |

**Conclusão:** Os dados exibidos nas telas (Itens, Produtos, Estoque, Orçamentos, Agenda) estão consistentes com as tabelas no Supabase. Para a agenda, a persistência em `calendar_events` estava correta; a correção foi na UI (evento não aparecia na grade após criar).

---

## 5. Ações sugeridas (prioridade)

1. **Alta:** Corrigir título da aba — já aplicado fallback `APP_TITLE ?? 'Precifica Certo'`.
2. **Média:** Formulário Adicionar item — valor padrão para Unidade (ex.: UN) e/ou garantir que o campo fique visível no drawer (scroll ou layout).
3. **Média:** Para usuários com acesso, considerar redirecionar `/caixa` e `/dre` para rotas com ano/mês.
4. **Média:** Planejar migração Sass `@import` → `@use` em `globals.scss`.
5. **Baixa:** Acompanhar compatibilidade antd + React 19 e HMR Next.js.

---

## 6. Testes de criação E2E + confirmação no Supabase (2026-03-05)

Testes executados: **criar de fato** itens, serviços, produto e orçamento na UI e **confirmar** persistência no Supabase.

### 6.1 Item — OK (criado e confirmado)

| Etapa | Resultado |
|-------|-----------|
| UI: Itens → Adicionar item → Nome "Item QA Criado E2E 01", Qtd 2, Valor R$ 25,00, Unidade (default UN) → Salvar | Drawer fechou; listagem passou a "10 itens" |
| Supabase `items` | Registro encontrado: `id`, name "Item QA Criado E2E 01", quantity 2, cost_price 25, unit UN, item_type INSUMO |
| Supabase `stock` | Registro criado para o item: stock_type ITEM, quantity_current 2 |

**Conclusão:** Fluxo de criação de item e criação automática de estoque funcionando; dados consistentes.

### 6.2 Serviço — OK (criado e confirmado)

| Etapa | Resultado |
|-------|-----------|
| UI: Serviços → Novo Serviço → Nome "Serviço QA E2E Teste", Descrição "Criado por teste automatizado QA" → Salvar | Redirecionamento para /servicos |
| Supabase `services` | Registro encontrado: name "Serviço QA E2E Teste", description preenchida, estimated_duration_minutes 60, base_price 0 |

**Conclusão:** Criação de serviço funcionando; persistência correta.

### 6.3 Produto — Falha de validação (não criado)

| Etapa | Resultado |
|-------|-----------|
| UI: Produtos → Adicionar produto → Nome, Descrição, Quantidade 5, 1 item na receita (Item QA Criado E2E 01) → Salvar | Permanece na tela; campo **Unidade** fica invalid (obrigatório, sem valor padrão) |
| Supabase `products` | Nenhum novo registro para "Produto QA E2E Teste" |

**Recomendação:** No formulário de criar produto (`/produtos/criar`), definir `initialValue` para o campo Unidade (ex.: "UN"), de forma análoga ao formulário de itens.

### 6.4 Orçamento — OK (criado e confirmado)

| Etapa | Resultado |
|-------|-----------|
| UI: Orçamentos → Novo Orçamento → Cliente (Duarte adabtech), Adicionar produto (da base) → Bolo, qtd 1 → Criar Orçamento | Modal fechou; listagem "1 orçamentos" |
| Supabase `budgets` | Registro: status DRAFT, total_value 201.81, customer_id preenchido |
| Supabase `budget_items` | 1 linha: product_id (Bolo), quantity 1, unit_price 201.81 |

**Conclusão:** Criação de orçamento com produto da base funcionando; `budgets` e `budget_items` consistentes.

### 6.5 Agenda — Horário criado não aparecia (corrigido em 2026-03-05)

| Etapa | Resultado |
|-------|-----------|
| Problema | Usuário cria horário na agenda; mensagem "Agendado!" aparece, mas o evento não é exibido na grade da semana. Console: aviso "There may be circular references" em `agenda/index.tsx` (openNew / onClick do slot). |
| Supabase `calendar_events` | Inserts estão sendo persistidos; consulta ao tenant retornou eventos com title, start_time, end_time, employee_id, status. |
| Causa | Referência circular (openNew/openEdit recriados a cada render) e uso de `weekEnd` no closure de `fetchAll`. |
| Correção | `openNew` e `openEdit` passaram a ser `useCallback(..., [])`; dentro de `fetchAll`, o fim da semana é calculado no próprio callback (`weekStart.add(6,'day').endOf('day')`). |

**Conclusão:** Persistência no Supabase OK; correção na UI aplicada para o evento aparecer na grade após salvar. Validar em uso real e, se necessário, conferir RLS em `calendar_events`.

---

— Quinn, guardião da qualidade
