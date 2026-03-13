# 👑 Precifica Certo — Plano de Sprints (Master Plan)

> **Documento criado por:** Orion (AIOS Master Orchestrator)
> **Data:** 2026-02-13
> **Versão:** 1.0

---

## 📊 Análise de Gap (AS-IS → TO-BE)

### Legenda de Status
- ✅ Existe e pode ser reaproveitado
- 🔄 Existe mas precisa de refatoração pesada
- 🆕 Módulo totalmente novo
- ❌ Não existe

| # | Módulo | Status | Detalhes |
|---|--------|--------|----------|
| 1 | **Auth / Multi-tenant** | 🔄 | Firebase Auth → Supabase Auth + tenant isolation |
| 2 | **Introdução** | ✅ | Página existente, só ajustar layout |
| 3 | **Home / Navegação** | 🔄 | Sidebar + Layout existem, precisam dos novos menus |
| 4 | **Dashboard (Análises)** | 🔄 | Charts básicos existem, precisa KPIs + novos gráficos |
| 5 | **Itens (Fiscal + Custo)** | 🔄 | CRUD existe, precisa NCM/NBS + impostos detalhados (ICMS, PIS/COFINS, IPI, CBS, IBS, IS) + custo líquido |
| 6 | **Produtos (Composição + Créditos + Precificação)** | 🔄 | Motor de precificação existe (3 modos), precisa créditos tributários + cálculo por tributo + nova estrutura |
| 7 | **Estoque** | 🆕 | Totalmente novo |
| 8 | **Clientes** | 🆕 | Totalmente novo (CNPJ/CPF, CEP, segmento) |
| 9 | **Orçamentos / Vendas (Pipeline)** | 🆕 | Totalmente novo (Orçamento → Pedido → Alocação → Venda) |
| 10 | **Caixa (HUB + DFC)** | 🔄 | Existe básico, precisa HUB, Extrato, Análise Horizontal, DFC |
| 11 | **Fluxo de Caixa** | 🔄 | Parcialmente existe, precisa modelos (tabela/dia/mês/ano) |
| 12 | **Agenda** | 🆕 | Totalmente novo (calendário, colunas por usuário) |
| 13 | **Relatórios** | 🆕 | Totalmente novo (filtros, visões por tipo, pagamento/abatimento) |
| 14 | **Suporte (IA + Automação)** | 🆕 | Totalmente novo (Agente IA, workflows, recorrência por segmento) |
| 15 | **Configurações (Regimes + Usuários + WhatsApp)** | 🔄 | Existe modal basico, precisa regimes expandidos + permissões granulares + WhatsApp Business |

---

## 🏗️ Dependências entre Módulos

```
FASE 0: FUNDAÇÃO
  └─ Auth + Multi-tenant + Supabase Migration + Design System
       │
FASE 1: DADOS CORE
  ├─ Itens (fiscal + custo líquido)
  ├─ Configurações (regimes tributários)
  └─ Clientes
       │
FASE 2: PRODUTOS + ESTOQUE
  ├─ Produtos (créditos + precificação + tributos)
  └─ Estoque (quantidade + limites + status)
       │
FASE 3: PIPELINE COMERCIAL
  ├─ Orçamentos → Pedidos → Alocações → Vendas
  └─ WhatsApp integration
       │
FASE 4: FINANCEIRO
  ├─ Fluxo de Caixa (entradas/saídas + modelos)
  ├─ Caixa HUB + DFC + Análise Horizontal
  └─ Dashboard (KPIs + gráficos avançados)
       │
FASE 5: OPERACIONAL
  ├─ Agenda (calendário + colunas por usuário)
  └─ Relatórios (filtros + visões + pagamento)
       │
FASE 6: INTELIGÊNCIA
  ├─ Suporte (Agente IA)
  └─ Automação (disparos + recorrência + segmentos)
```

---

## 🗓️ SPRINTS DETALHADAS

---

### 🟢 FASE 0 — FUNDAÇÃO (Sprints 0.1 a 0.3)

---

#### Sprint 0.1 — Design System & Layout Base
**Duração estimada:** 1 semana
**Agente responsável:** `@ux-design-expert` → `@dev`

**Objetivo:** Criar o novo Design System e layout responsivo (Desktop + Mobile)

**Tasks:**
- [ ] **0.1.1** — Definir paleta de cores, tipografia e tokens do Design System
- [ ] **0.1.2** — Redesenhar sidebar/navbar com TODOS os itens de menu:
  - Home, Dashboard, Caixa, Itens, Produtos, Estoque, Orçamentos/Vendas, Fluxo de Caixa, Agenda, Relatórios, Suporte, Configurações
- [ ] **0.1.3** — Criar layout responsivo (Desktop sidebar → Mobile bottom nav / hamburger)
- [ ] **0.1.4** — Atualizar componente `Layout` com o novo sistema
- [ ] **0.1.5** — Criar componentes base reutilizáveis (PageHeader, DataTable, FilterBar, StatusBadge, Modal padrão, CardKPI)

**Entregáveis:**
- Design System documentado
- Layout responsivo funcionando
- Componentes base criados

---

#### Sprint 0.2 — Migração Auth: Firebase → Supabase
**Duração estimada:** 1 semana
**Agente responsável:** `@architect` → `@data-engineer` → `@dev`

**Objetivo:** Migrar toda a autenticação para Supabase Auth com multi-tenancy

**Tasks:**
- [ ] **0.2.1** — Configurar Supabase Auth (email/password)
- [ ] **0.2.2** — Criar trigger `handle_new_auth_user()` (já no SQL, precisa testar)
- [ ] **0.2.3** — Reescrever `auth.context.tsx` para usar Supabase Auth
- [ ] **0.2.4** — Reescrever `use-auth.hook.tsx` para Supabase
- [ ] **0.2.5** — Criar middleware de autenticação (SSR com Supabase)
- [ ] **0.2.6** — Atualizar `login.tsx` e `reset-password`
- [ ] **0.2.7** — Implementar RLS policies para `users` e `tenants`
- [ ] **0.2.8** — Remover dependências do Firebase Auth
- [ ] **0.2.9** — Criar tela de **Registro/Signup** (criar tenant + user)

**Entregáveis:**
- Login/Logout/Register funcionando com Supabase
- Multi-tenancy isolando dados por empresa
- Cookies/sessão SSR configurados

---

#### Sprint 0.3 — Migração Database: Firestore → Supabase
**Duração estimada:** 1 semana
**Agente responsável:** `@data-engineer` → `@dev`

**Objetivo:** Migrar camada de dados de Firestore para Supabase PostgreSQL

**Tasks:**
- [ ] **0.3.1** — Executar migration SQL no Supabase (`20260212000000_initial_schema.sql`)
- [ ] **0.3.2** — Verificar e ajustar schema conforme novos requisitos (campos fiscais em `items`, etc.)
- [ ] **0.3.3** — Criar camada de serviço genérica Supabase (substituir `crud-firestore.ts`)
- [ ] **0.3.4** — Script de migração de dados: Firestore → Supabase (users, items, products, cashier)
- [ ] **0.3.5** — Reescrever services de `user` para Supabase
- [ ] **0.3.6** — Atualizar `http/request.http.ts` para usar Supabase client onde aplicável
- [ ] **0.3.7** — Criar API routes com proteção por tenant_id
- [ ] **0.3.8** — Criar seeds de dados para desenvolvimento

**Entregáveis:**
- Dados migrados de Firestore para Supabase
- Services reescritos
- APIs funcionando com PostgreSQL

---

### 🔵 FASE 1 — DADOS CORE (Sprints 1.1 a 1.3)

---

#### Sprint 1.1 — Configurações (Regimes Tributários + Usuários)
**Duração estimada:** 1 semana
**Agente responsável:** `@dev`

**Objetivo:** Módulo de configurações expandido com regimes tributários e gestão de usuários

**Tasks:**
- [ ] **1.1.1** — Redesenhar tela de Configurações (substituir modal `ChooseCalcModal`)
- [ ] **1.1.2** — Implementar seleção de regime tributário:
  - MEI | Simples | Simples Híbrido | Lucro Presumido | Lucro Presumido (RET) | Lucro Real
- [ ] **1.1.3** — Salvar regime no `tenant_settings` (Supabase)
- [ ] **1.1.4** — CRUD de Usuários expandido:
  - Permissões de acesso (módulos)
  - Horários de funcionamento / Agenda
  - Acesso a tabelas de preço (A, B, C, D)
  - Permissão de descontos (Admin / próprio)
- [ ] **1.1.5** — Modelo novo de precificação conectado aos regimes
- [ ] **1.1.6** — Placeholder para "Ativação WhatsApp Business via QR Code" (implementação real na Sprint 3.2)

**Entregáveis:**
- Página /configuracoes com tabs (Empresa, Regime, Usuários)
- Regimes tributários salvos
- Permissões granulares por usuário

---

#### Sprint 1.2 — Itens (Cadastro Fiscal + Custo Líquido)
**Duração estimada:** 1.5 semanas
**Agente responsável:** `@dev`

**Objetivo:** Expandir módulo de Itens com NCM/NBS, impostos detalhados e custo líquido

**Tasks:**
- [ ] **1.2.1** — Atualizar tabela `items` no Supabase: adicionar `ncm_nbs`, `c_class_trib`
- [ ] **1.2.2** — Criar/atualizar tabela `item_tax_details`: ICMS, PIS/COFINS, IPI, CBS, IBS, IS
- [ ] **1.2.3** — Redesenhar formulário de criação de Item com fluxo:
  1. Custo Bruto do item
  2. NCM/NBS
  3. Impostos do item (ICMS, PIS/COFINS, IPI, cClassTrib)
  4. Tributos reforma (CBS, IBS, IS)
  5. → Custo Líquido (calculado automaticamente)
- [ ] **1.2.4** — Reescrever services de items para Supabase
- [ ] **1.2.5** — Reescrever API routes (`/api/items/*`) para Supabase
- [ ] **1.2.6** — Atualizar listagem de itens com colunas de impostos
- [ ] **1.2.7** — Testes unitários para cálculo de custo líquido

**Entregáveis:**
- CRUD de Itens com campos fiscais completos
- Cálculo automático de custo líquido
- APIs migradas para Supabase

---

#### Sprint 1.3 — Clientes
**Duração estimada:** 1 semana
**Agente responsável:** `@dev`

**Objetivo:** Módulo de cadastro de clientes

**Tasks:**
- [ ] **1.3.1** — Criar página `/clientes` (listagem + busca + filtros)
- [ ] **1.3.2** — Criar formulário/modal de cadastro de cliente:
  - Nome, CNPJ/CPF, CEP (com busca automática), Email, Telefone, Endereço, Segmento
- [ ] **1.3.3** — Services Supabase para `customers`
- [ ] **1.3.4** — API routes `/api/customers/*`
- [ ] **1.3.5** — Componente reutilizável `BuscarCliente` (usado em Orçamentos e Agenda)
- [ ] **1.3.6** — Integração com API de CEP (ViaCEP) para preenchimento automático

**Entregáveis:**
- CRUD completo de Clientes
- Busca por CEP automática
- Componente reutilizável para buscar/selecionar cliente

---

### 🟣 FASE 2 — PRODUTOS + ESTOQUE (Sprints 2.1 a 2.2)

---

#### Sprint 2.1 — Produtos (Créditos Tributários + Precificação Expandida)
**Duração estimada:** 2 semanas
**Agente responsável:** `@architect` (design cálculos) → `@dev` (implementação)

**Objetivo:** Expandir o motor de precificação com créditos tributários e cálculos detalhados por tributo

**Tasks:**
- [ ] **2.1.1** — Redesenhar fluxo de criação/edição de produto:
  1. Dados básicos (código, nome, descrição, rendimento, unidade)
  2. Busca e adição de itens
  3. **NOVO:** Para cada item → Cálculo de créditos (ICMS, PIS/COFINS, IPI, CBS, IBS)
  4. **NOVO:** Total custo líquido + Total crédito tributos
  5. **NOVO:** Resumo de tributos do produto (tabela ICMS|PIS/COFINS|IPI|ISS|CBS|IBS)
  6. Precificação Base "interna" (motor existente adaptado)
  7. **NOVO:** Cálculo detalhado de tributos com base de cálculo individual:
     - ICMS → base de cálculo
     - PIS/COFINS → base de cálculo
     - IPI → base de cálculo
     - ISS → base de cálculo
     - CBS → base de cálculo
     - IBS → base de cálculo
     - ICMS – MVA → base de cálculo
     - PIS/COFINS – Monofásico → base de cálculo
- [ ] **2.1.2** — Atualizar services de `product-calc` com créditos e novos tributos
- [ ] **2.1.3** — Atualizar tabela `product_items` para armazenar créditos por tributo
- [ ] **2.1.4** — Criar tabela/lógica `product_tax_calculations` com cada tributo
- [ ] **2.1.5** — Refatorar `content.component.tsx`, `content-industrialization.tsx`, etc.
- [ ] **2.1.6** — Reescrever services de products para Supabase
- [ ] **2.1.7** — Reescrever API routes `/api/products/*` para Supabase
- [ ] **2.1.8** — **NOVO:** Ação "Adicionar ao estoque" pós-salvamento
- [ ] **2.1.9** — **NOVO:** Acionador de mensagens (gatilho de comunicação) — placeholder
- [ ] **2.1.10** — Testes unitários para cálculos de créditos e tributos

**Entregáveis:**
- Motor de precificação com créditos tributários
- Cálculo detalhado por tributo
- Integração com estoque
- APIs migradas para Supabase

---

#### Sprint 2.2 — Estoque
**Duração estimada:** 1.5 semanas
**Agente responsável:** `@dev`

**Objetivo:** Módulo completo de gestão de estoque

**Tasks:**
- [ ] **2.2.1** — Criar página `/estoque` com tabs ou visões:
  - Todos | Por Status (Orçamentos | Pedidos | Alocados | Vendidos)
- [ ] **2.2.2** — Formulário "Adicionar ao Estoque":
  - Buscar produto, quantidade, limite mínimo
- [ ] **2.2.3** — Services Supabase para `stock` e `stock_movements`
- [ ] **2.2.4** — API routes `/api/stock/*`
- [ ] **2.2.5** — Alertas visuais quando estoque ≤ limite mínimo
- [ ] **2.2.6** — Movimentações automáticas (entrada/saída) ao criar pedido, alocar, vender
- [ ] **2.2.7** — Botão imprimir / Gerar arquivo (PDF/Excel) por status
- [ ] **2.2.8** — Testes unitários para movimentações e limites

**Entregáveis:**
- CRUD completo de Estoque
- Visões por status com exportação
- Alertas de estoque mínimo

---

### 🟠 FASE 3 — PIPELINE COMERCIAL (Sprints 3.1 a 3.2)

---

#### Sprint 3.1 — Orçamentos / Vendas (Pipeline Completo)
**Duração estimada:** 2.5 semanas
**Agente responsável:** `@architect` (fluxo) → `@dev` (implementação)

**Objetivo:** Pipeline comercial completo: Orçamento → Pedido → Alocação → Venda

**Tasks:**
- [ ] **3.1.1** — Criar página `/orcamentos-vendas` com tabs:
  - Orçamentos | Pedidos | Alocados | Vendas
- [ ] **3.1.2** — Cada tab com: listagem, pesquisa/filtros, botão imprimir
- [ ] **3.1.3** — Criar modal/formulário "Criar Orçamento" com blocos:
  1. Vendedor/Usuário (seleção)
  2. Buscar/Inserir Cliente (componente reutilizável)
  3. Dados do Cliente (CNPJ, CEP, NCM/NBS, cClassTrib)
  4. Buscar/Inserir Produtos (tabela com quantidade, preço, descontos)
  5. Descontos "User Admin" (bloqueado por permissão)
  6. Formas de pagamento (integração com `payment_methods`)
  7. Totais
- [ ] **3.1.4** — Ações do pipeline:
  - Salvar Orçamento (status: DRAFT)
  - Enviar Orçamento (status: SENT)
  - Gerar Pedido (status: APPROVED → cria Order)
  - Alocar produtos do estoque (cria Allocations + decrementa stock)
  - Finalizar Venda (cria Sale + invoice)
- [ ] **3.1.5** — Services Supabase: `budgets`, `budget_items`, `orders`, `allocations`, `sales`
- [ ] **3.1.6** — API routes `/api/budgets/*`, `/api/orders/*`, `/api/sales/*`
- [ ] **3.1.7** — Controle de permissão de desconto por usuário
- [ ] **3.1.8** — Tabelas de preço A/B/C/D (por produto, controlado por config do usuário)
- [ ] **3.1.9** — Geração de PDF de orçamento
- [ ] **3.1.10** — Testes para fluxo completo do pipeline

**Entregáveis:**
- Pipeline completo Orçamento → Pedido → Alocação → Venda
- Controle de permissões e descontos
- PDF de orçamento

---

#### Sprint 3.2 — Integração WhatsApp
**Duração estimada:** 1 semana
**Agente responsável:** `@dev` → `@devops`

**Objetivo:** Envio de orçamentos via WhatsApp + ativação WhatsApp Business

**Tasks:**
- [ ] **3.2.1** — Integrar API do WhatsApp Business (Meta Cloud API ou Evolution API)
- [ ] **3.2.2** — Ativação via QR Code na tela de Configurações
- [ ] **3.2.3** — Botão "Enviar Orçamento via WhatsApp" na listagem de orçamentos
- [ ] **3.2.4** — Formatação da mensagem do orçamento para WhatsApp
- [ ] **3.2.5** — Salvar status de envio (enviado, lido, respondido)

**Entregáveis:**
- WhatsApp Business conectado via QR Code
- Envio de orçamentos pelo WhatsApp

---

### 🔴 FASE 4 — FINANCEIRO (Sprints 4.1 a 4.3)

---

#### Sprint 4.1 — Fluxo de Caixa (Lançamentos + Modelos de Visão)
**Duração estimada:** 1.5 semanas
**Agente responsável:** `@dev`

**Objetivo:** Módulo de fluxo de caixa com lançamentos e múltiplas visões

**Tasks:**
- [ ] **4.1.1** — Criar página `/fluxo-caixa`
- [ ] **4.1.2** — Modal "Inserir Entrada" (pop-up com categoria, valor, data, descrição)
- [ ] **4.1.3** — Modal "Inserir Saída" (pop-up com categoria, valor, data, descrição)
- [ ] **4.1.4** — 4 modelos de visualização:
  - Modelo Tabela (visão spreadsheet)
  - Modelo Dia (lançamentos do dia)
  - Modelo Mês (consolidado mensal)
  - Modelo Ano (consolidado anual)
- [ ] **4.1.5** — Services Supabase: `cash_entries`, `cashier_months`, `cashier_categories`
- [ ] **4.1.6** — API routes `/api/cashier/*` reescritas para Supabase
- [ ] **4.1.7** — Categorias configuráveis por tenant (CRUD de `cashier_categories`)

**Entregáveis:**
- Lançamentos de entradas/saídas
- 4 modelos de visualização
- Categorias configuráveis

---

#### Sprint 4.2 — Caixa HUB + DFC + Análise Horizontal
**Duração estimada:** 1.5 semanas
**Agente responsável:** `@dev`

**Objetivo:** Expandir o módulo Caixa existente com HUB, DFC e análise horizontal

**Tasks:**
- [ ] **4.2.1** — Criar página `/caixa` com submenu:
  - HUB | Extrato Caixa | Análise Horizontal | DFC
- [ ] **4.2.2** — **HUB:** Visão consolidada de entradas/saídas (refatorar DRE existente)
- [ ] **4.2.3** — **Extrato Caixa:** Lista cronológica de todos os lançamentos com filtros
- [ ] **4.2.4** — **Análise Horizontal:** Comparação mês a mês / ano a ano
- [ ] **4.2.5** — **DFC (Demonstrativo de Fluxo de Caixa):** Relatório padrão contábil
- [ ] **4.2.6** — Filtros de pesquisa por período/categoria
- [ ] **4.2.7** — Botão imprimir (PDF) para cada visão
- [ ] **4.2.8** — Refatorar services de DRE existentes para Supabase

**Entregáveis:**
- 4 subpáginas do módulo Caixa
- Análise horizontal
- DFC padrão contábil

---

#### Sprint 4.3 — Dashboard (Análises Avançadas)
**Duração estimada:** 1 semana
**Agente responsável:** `@dev`

**Objetivo:** Dashboard com KPIs e gráficos avançados

**Tasks:**
- [ ] **4.3.1** — Redesenhar Dashboard com cards de KPI:
  - Faturamento mês, Ticket médio, Vendas realizadas, Estoque baixo, Orçamentos pendentes
- [ ] **4.3.2** — Gráficos avançados:
  - Entradas x Saídas x Metas (existente, melhorar)
  - Vendas por vendedor
  - Produtos mais vendidos
  - Estoque por status
  - Fluxo de caixa projetado
- [ ] **4.3.3** — Filtros por período
- [ ] **4.3.4** — Refatorar services de home para Supabase

**Entregáveis:**
- Dashboard rico com KPIs
- Gráficos interativos

---

### 🟡 FASE 5 — OPERACIONAL (Sprints 5.1 a 5.2)

---

#### Sprint 5.1 — Agenda (Calendário)
**Duração estimada:** 1.5 semanas
**Agente responsável:** `@dev`

**Objetivo:** Módulo de agenda com calendário e visualizações

**Tasks:**
- [ ] **5.1.1** — Criar página `/agenda`
- [ ] **5.1.2** — Integrar biblioteca de calendário (FullCalendar ou similar)
- [ ] **5.1.3** — Busca por Cliente/Data
- [ ] **5.1.4** — Modal "Inserir Evento":
  - Cliente (buscar), Título, Data/hora início e fim, Descrição, Usuário responsável
- [ ] **5.1.5** — Visualizações:
  - Dia | Semana | Mês
- [ ] **5.1.6** — Layout: Colunas por usuário (como Calendly/Cal.com)
- [ ] **5.1.7** — Services Supabase: `calendar_events`
- [ ] **5.1.8** — API routes `/api/calendar/*`
- [ ] **5.1.9** — Status de eventos: Agendado → Confirmado → Concluído → Cancelado

**Entregáveis:**
- Calendário interativo com drag & drop
- Visualizações dia/semana/mês
- Colunas por usuário

---

#### Sprint 5.2 — Relatórios
**Duração estimada:** 1.5 semanas
**Agente responsável:** `@dev`

**Objetivo:** Módulo de relatórios com filtros e múltiplas visões

**Tasks:**
- [ ] **5.2.1** — Criar página `/relatorios`
- [ ] **5.2.2** — Filtros: Vendedor, Cliente, Data (período)
- [ ] **5.2.3** — Visões de relatórios:
  1. Orçamentos / Pedidos / Alocados / Vendas
  2. Produtos vendidos
  3. Cliente – Valores / Saldo
  4. Vendas realizadas / Comissões por vendedor
- [ ] **5.2.4** — Ação "Fazer pagamento/abatimento" (registrar pagamento parcial/total)
- [ ] **5.2.5** — Pesquisa por período (rodapé)
- [ ] **5.2.6** — Botão imprimir (PDF) por visão
- [ ] **5.2.7** — Services Supabase: queries agregadas, `report_snapshots` (opcional)
- [ ] **5.2.8** — Exportação para Excel/CSV

**Entregáveis:**
- 4 visões de relatórios
- Pagamento/abatimento
- Exportação PDF e Excel

---

### ⚫ FASE 6 — INTELIGÊNCIA (Sprints 6.1 a 6.2)

---

#### Sprint 6.1 — Suporte (Agente IA)
**Duração estimada:** 2 semanas
**Agente responsável:** `@architect` (design) → `@dev` (implementação)

**Objetivo:** Módulo de suporte com IA e workflows de mensagens

**Tasks:**
- [ ] **6.1.1** — Criar página `/suporte`
- [ ] **6.1.2** — Integrar Agente IA (OpenAI/Anthropic API) com contexto do negócio
- [ ] **6.1.3** — Configurar `ai_agent_config` por tenant (persona, knowledge base)
- [ ] **6.1.4** — Workflow de disparo de mensagens configurável pelo Admin:
  - **A) Agendamentos:**
    - Confirmação automática de agendamentos
    - Mensagem automática 1 e 2 com hora/definição de disparo
  - **B) Relacionamento:**
    - Feedback pós-venda/serviço
    - Ofertas Home Care (baseado no histórico)
  - **C) Recorrência:**
    - Lembrete de agendamento/manutenção/recompra
    - Configurável por segmento:
      - Barbearia (15 dias)
      - Salão de beleza (120 dias tintura, 45 dias hidratação)
      - Mecânica (180 dias óleo, 2000 dias amortecedor)
      - Odontologia (120 dias botox, 180 dias limpeza)
      - Pizzaria (último pedido 21 dias)
      - Madeireira (todo dia às 16h)
- [ ] **6.1.5** — Services Supabase: `automation_rules`, `automation_logs`, `message_templates`
- [ ] **6.1.6** — API routes `/api/automations/*`

**Entregáveis:**
- Chat com IA com contexto do negócio
- 3 trilhas de automação de mensagens
- Configuração por segmento

---

#### Sprint 6.2 — Automação de Disparos (WhatsApp + Scheduling)
**Duração estimada:** 1.5 semanas
**Agente responsável:** `@dev` → `@devops`

**Objetivo:** Implementar o engine de disparos automáticos

**Tasks:**
- [ ] **6.2.1** — Criar job scheduler (cron ou Supabase Edge Functions)
- [ ] **6.2.2** — Processar triggers: BUDGET_EXPIRED, BUDGET_CREATED, SALE_COMPLETED, STOCK_LOW
- [ ] **6.2.3** — Disparar mensagens via WhatsApp conforme regras
- [ ] **6.2.4** — Logs de automação (quando disparou, resultado)
- [ ] **6.2.5** — Dashboard de automações (Admin)
- [ ] **6.2.6** — Templates de mensagem editáveis pelo Admin
- [ ] **6.2.7** — Testes de integração para workflows completos

**Entregáveis:**
- Engine de automação rodando
- Disparos automáticos via WhatsApp
- Dashboard e logs de automação

---

## 📊 Resumo Executivo

| Fase | Sprints | Duração Estimada | Agentes Envolvidos |
|------|---------|------------------|--------------------|
| **Fase 0 — Fundação** | 0.1, 0.2, 0.3 | ~3 semanas | @ux-design-expert, @architect, @data-engineer, @dev |
| **Fase 1 — Dados Core** | 1.1, 1.2, 1.3 | ~3.5 semanas | @dev |
| **Fase 2 — Produtos + Estoque** | 2.1, 2.2 | ~3.5 semanas | @architect, @dev |
| **Fase 3 — Pipeline Comercial** | 3.1, 3.2 | ~3.5 semanas | @architect, @dev, @devops |
| **Fase 4 — Financeiro** | 4.1, 4.2, 4.3 | ~4 semanas | @dev |
| **Fase 5 — Operacional** | 5.1, 5.2 | ~3 semanas | @dev |
| **Fase 6 — Inteligência** | 6.1, 6.2 | ~3.5 semanas | @architect, @dev, @devops |
| **TOTAL** | **16 sprints** | **~24 semanas** | — |

---

## 🚦 Ordem de Execução Recomendada

```
Sprint 0.1 → Sprint 0.2 → Sprint 0.3
     ↓
Sprint 1.1 ─┬─ Sprint 1.2 → Sprint 2.1
             └─ Sprint 1.3 → Sprint 3.1
                               ↓
Sprint 2.2 ──────────────────→ Sprint 3.1
                               ↓
Sprint 3.2 (WhatsApp)    Sprint 4.1 → Sprint 4.2 → Sprint 4.3
                               ↓
                          Sprint 5.1 ─┬─ Sprint 5.2
                                      ↓
                          Sprint 6.1 → Sprint 6.2
```

---

## 🔧 Ajustes no Schema Supabase Necessários

O schema SQL existente (`20260212000000_initial_schema.sql`) precisa dos seguintes ajustes para atender ao projeto completo:

1. **Tabela `items`** — Adicionar: `ncm_nbs text`, `c_class_trib text`, `cost_gross numeric`, `cost_net numeric`
2. **Tabela `item_tax_details`** — Expandir `tax_type` enum com: `CBS`, `IBS`, `IS`
3. **Tabela `product_items`** — Adicionar: `credit_icms numeric`, `credit_pis_cofins numeric`, `credit_ipi numeric`, `credit_cbs numeric`, `credit_ibs numeric`
4. **Tabela `product_tax_calculations`** — Expandir para guardar cada tributo individualmente com base de cálculo
5. **Tabela `users`** — Adicionar: `work_hours jsonb`, `max_discount_percent numeric`, `whatsapp_connected boolean`
6. **Tabela `products`** — Adicionar: `price_table_a numeric`, `price_table_b numeric`, `price_table_c numeric`, `price_table_d numeric`
7. **Tabela `tenant_settings`** — Expandir `tax_regime` enum com: `SIMPLES_HIBRIDO`, `LUCRO_PRESUMIDO_RET`
8. **Tabela `automation_rules`** — Adicionar: `segment text`, `recurrence_days integer`, `recurrence_time time`

---

## 📝 Notas Importantes

1. **Priorize Fase 0** — Sem a fundação (auth + database Supabase), nada mais funciona
2. **A Sprint 2.1 (Produtos)** é a mais complexa — considere dividir em sub-sprints se necessário
3. **Sprint 6.1 (IA)** pode ser parcialmente paralela com outras sprints
4. **WhatsApp (3.2 + 6.2)** depende da escolha de provider (Meta Cloud API vs Evolution API vs outro)
5. **Testes** devem ser escritos em CADA sprint, não deixar para o final
6. **O schema Supabase precisa ser ajustado** ANTES de começar a Fase 1 (fazer na Sprint 0.3)

---

> 👑 *"Um projeto bem orquestrado é um projeto entregue."*
> — Orion, orquestrando o sistema 🎯
