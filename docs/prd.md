# Precifica Certo — Product Requirements Document (PRD)

**Versão:** 1.0  
**Data:** 2026-03-10  
**Status:** Em vigor

---

## 1. Objetivos e contexto

### 1.1 Objetivos

- Oferecer um **SaaS B2B multi-tenant** de gestão financeira e comercial para pequenos negócios no Brasil (salões, prestadores de serviço, comércio).
- Permitir **precificação correta** com custo (CMV), despesas (fixas, variáveis, financeiras), mão de obra, impostos por regime tributário (Simples Nacional, Lucro Presumido, Lucro Real, MEI), comissão e lucro.
- Centralizar **fluxo de caixa**, orçamentos, vendas, clientes, funcionários, agenda e relatórios em uma única aplicação web.
- Garantir **isolamento por tenant** (uma empresa = um tenant) em dados, autenticação e configurações.
- Manter **compatibilidade** com a stack atual (Next.js, React, Ant Design, Supabase, Stripe) e evoluir de forma incremental.

### 1.2 Contexto

O Precifica Certo nasce da necessidade de pequenos negócios brasileiros terem uma ferramenta que una precificação baseada em custos reais e regime tributário, fluxo de caixa e operação comercial (orçamentos, vendas, clientes, equipe). O sistema já está em produção (https://app.precificacerto.com.br), com onboarding, dashboard, caixa, DRE, produtos/serviços/itens, estoque, orçamentos, vendas, agenda, funcionários, clientes e configurações. Este PRD consolida o escopo do produto e os requisitos para evolução e manutenção alinhados à documentação técnica existente e ao plano de melhorias.

### 1.3 Change Log

| Data       | Versão | Descrição                          | Autor   |
|-----------|--------|------------------------------------|---------|
| 2026-03-10 | 1.0   | Criação inicial do PRD do projeto  | Orion   |

---

## 2. Requisitos

### 2.1 Funcionais

- **FR1:** O sistema deve permitir cadastro e gestão de itens (insumos), produtos (produzido/revenda) e serviços, com composição por itens e custos por unidade.
- **FR2:** O sistema deve calcular preço de venda com CMV, despesas (fixas, variáveis, financeiras), mão de obra (indireta e produtiva), impostos conforme regime tributário (Simples Nacional, Simples Híbrido, Lucro Presumido, Lucro Real, MEI), comissão e lucro, utilizando motor de precificação (front e/ou Edge Function).
- **FR3:** O sistema deve suportar recálculo de percentuais de despesas a partir dos lançamentos do fluxo de caixa (últimos 12 meses), com persistência em `tenant_expense_config`.
- **FR4:** O sistema deve permitir gestão de orçamentos (rascunho, enviado, aprovado, etc.) com itens (produtos/serviços), vínculo com cliente e conversão em venda.
- **FR5:** O sistema deve registrar vendas (balcão ou a partir de orçamento), com itens de venda e valor final.
- **FR6:** O sistema deve manter fluxo de caixa com lançamentos de entrada/saída por mês, categorização e `expense_group` (DESPESA_FIXA, DESPESA_VARIAVEL, DESPESA_FINANCEIRA) para alimentar o recálculo de despesas.
- **FR7:** O sistema deve permitir CRUD de clientes, com dono opcional (funcionário), endereço, IE e indicador de contribuinte ICMS.
- **FR8:** O sistema deve permitir CRUD de funcionários, vínculo com usuários (Auth) e permissões por módulo (Não ver / Visualizar / Editar).
- **FR9:** O sistema deve oferecer agenda com eventos por usuário, conclusão de serviço e lançamento de pagamento no caixa (incluindo parcelas quando cartão crédito).
- **FR10:** O sistema deve exibir dashboard com KPIs (entradas/saídas do mês), gráficos e dados agregados por tenant.
- **FR11:** O sistema deve permitir configuração por tenant: regime tributário, tipo de cálculo (industrialização/revenda/serviço), despesas %, carga horária, mão de obra, integração WhatsApp, etc.
- **FR12:** O sistema deve oferecer onboarding inicial: dados da empresa, endereço, tributação (regime, anexo Simples, faturamento 12m, atividade Lucro Presumido), equipe e conclusão.
- **FR13:** O sistema deve controlar estoque (saldo por item/produto/serviço) e movimentações.
- **FR14:** O sistema deve suportar multi-tenant com isolamento total por `tenant_id` em dados, RLS e lógica de negócio.
- **FR15:** O sistema deve permitir assinatura/faturamento do tenant via Stripe (planos, pagamentos).
- **FR16:** O sistema deve permitir envio de mensagens (ex.: WhatsApp) a partir de orçamentos e conectividade configurada, com sequência definida (mensagem conectividade → mensagem texto orçamento → PDF).
- **FR17:** O sistema deve registrar histórico de observações de serviços/atendimentos por cliente (customer_service_history).
- **FR18:** O sistema deve permitir desconto no orçamento com impacto proporcional em comissão e lucro, e campo de máximo desconto % por produto quando aplicável.
- **FR19:** O sistema deve exibir aba de comissão de vendedores no fluxo de caixa, com cálculo por período.

### 2.2 Não funcionais

- **NFR1:** A aplicação deve ser web (Next.js Pages Router), responsiva, em português (pt-BR).
- **NFR2:** Autenticação via Supabase Auth (email/senha); token em cookie; proteção de rotas e redirecionamento para login ou onboarding quando aplicável.
- **NFR3:** Dados operacionais e configurações devem residir no Supabase (PostgreSQL), com RLS por tenant e políticas por papel (super_admin, admin, user) e escopo (ex.: clientes por owner_id).
- **NFR4:** Cálculos de imposto e precificação devem respeitar tabelas de referência fiscal (Simples Nacional, Lucro Presumido, Lucro Real, UFs, NCM/NBS) e configuração do tenant.
- **NFR5:** Performance e uso de memória devem permanecer adequados ao uso por pequenas equipes; uso de cache (ex.: dashboard) onde fizer sentido.
- **NFR6:** Código deve seguir padrões do projeto (ESLint, TypeScript), com testes (unitários/integração) para regras críticas de negócio e precificação.
- **NFR7:** Integrações externas (Stripe, e-mail, WhatsApp) devem usar variáveis de ambiente e configurações por tenant quando aplicável.

### 2.3 Compatibilidade

- **CR1:** APIs e contratos existentes (Supabase client, Edge Functions de precificação, webhooks) devem ser mantidos ou evoluídos com retrocompatibilidade documentada.
- **CR2:** Alterações em esquema de banco (migrations) devem preservar dados existentes e incluir RLS/índices necessários.
- **CR3:** Novas telas e fluxos devem seguir o design system e padrões de UI já adotados (Ant Design, rotas e títulos definidos).
- **CR4:** Integrações (Stripe, Supabase Auth, n8n, SMTP) devem continuar funcionando conforme configuração atual do tenant.

---

## 3. Objetivos de interface do usuário

### 3.1 Visão geral de UX

Interface limpa e orientada a tarefas para usuários de pequenos negócios: navegação por módulos (Dashboard, Caixa, Produtos, Serviços, Itens, Estoque, Orçamentos, Vendas, Clientes, Funcionários, Agenda, Relatórios, Configurações), com hierarquia clara e acesso conforme permissões (Não ver / Visualizar / Editar).

### 3.2 Paradigmas de interação

- Navegação por sidebar e rotas fixas; filtros por mês/ano onde aplicável (Dashboard, Caixa, DRE).
- Formulários com validação (ex.: Yup); feedback de sucesso/erro consistente.
- Listagens com busca, ordenação e ações (editar, excluir) conforme permissão.
- Uso de abas e modais quando reduzir ruído (ex.: configurações, detalhes de orçamento).

### 3.3 Telas e vistas principais

- Login; Onboarding (novos tenants); Dashboard (KPIs e gráficos).
- Fluxo de Caixa (por ano/mês); DRE (por ano).
- Produtos (lista, criar, editar); Serviços (lista, criar, editar); Itens (lista, criar, editar).
- Estoque (saldos e movimentações).
- Orçamentos e Vendas (lista, criação a partir de orçamento ou balcão).
- Clientes; Funcionários (e permissões por módulo).
- Agenda (eventos por semana/funcionário); Relatórios (ex.: Agenda).
- Configurações (empresa, regime tributário, despesas, equipe, WhatsApp, etc.).
- Smart Price (calculadora de precificação com exportação PDF).
- Planos e assinatura (Stripe); Minha conta; Super-admin (tenants, usuários, convites, planos, pagamentos) quando aplicável.

### 3.4 Acessibilidade

Alvo: boas práticas de acessibilidade (labels, contraste, foco). WCAG AA como objetivo de evolução onde possível.

### 3.5 Marca e plataformas

- Identidade visual do Precifica Certo; consistência com Ant Design e tokens do projeto.
- Plataforma alvo: Web responsiva (desktop e mobile).

---

## 4. Premissas técnicas

### 4.1 Stack atual

- **Frontend:** Next.js (Pages Router), React 19, Ant Design, Chart.js, SWR, TypeScript.
- **Backend/BaaS:** Supabase (PostgreSQL, Auth, Edge Functions, Storage).
- **Pagamentos:** Stripe (assinaturas, planos).
- **Utilitários:** jspdf (PDF), nodemailer (e-mail), máscaras (CPF/CNPJ), validação (Yup).

### 4.2 Estrutura do repositório

Monorepo atual (web-app) com `src/pages`, `src/components`, `src/utils`, `src/supabase`, `src/constants`, `src/hooks`, `src/contexts`; migrations em `supabase/migrations`.

### 4.3 Arquitetura de serviços

Aplicação monolítica (front Next.js + Supabase); lógica de precificação no front (`pricing-engine`, `calc-tax-preview`) e/ou em Edge Function (`calc-tax-engine`); jobs e integrações externas (n8n, SMTP) conforme configuração.

### 4.4 Testes

Unitários e de integração (Jest, Testing Library) para regras críticas (precificação, despesas, permissões); E2E e manuais conforme plano de qualidade.

### 4.5 Premissas adicionais

- Motor de precificação e tabelas fiscais (Simples, Lucro Presumido, Lucro Real) são fonte da verdade; alterações devem ser validadas e documentadas.
- Multi-tenancy é obrigatório: todas as queries e RLS consideram `tenant_id`.
- Novas funcionalidades devem seguir padrões de rotas (`ROUTES`, `PAGE_TITLES`), layout e uso de `getTenantId()` / `useAuth()`.

---

## 5. Lista de épicos

Os épicos abaixo descrevem blocos de valor já existentes ou em evolução no produto, não uma sequência única de implementação.

| # | Épico | Objetivo em uma linha |
|---|--------|------------------------|
| 1 | Fundação e identidade do produto | Multi-tenant, auth, onboarding e configurações por tenant (regime tributário, despesas, equipe). |
| 2 | Cadastros e precificação | Itens, produtos (produzido/revenda), serviços, composição, motor de preço e impostos por regime. |
| 3 | Fluxo de caixa e DRE | Lançamentos mensais, categorias, expense_group, recálculo de despesas e demonstrativo (DRE). |
| 4 | Comercial (orçamentos e vendas) | Orçamentos com itens e status, conversão em venda, desconto e comissão; fluxo de envio (WhatsApp, PDF). |
| 5 | Clientes e equipe | CRUD de clientes (e dono), funcionários, vínculo com usuários e permissões por módulo. |
| 6 | Agenda e atendimento | Eventos por usuário/funcionário, conclusão de serviço, pagamento (à vista/parcelado), histórico por cliente. |
| 7 | Estoque e relatórios | Saldo e movimentações de estoque; relatórios (ex.: agenda, comissão vendedores no caixa). |
| 8 | Assinatura e operação | Planos Stripe, gestão de assinatura, super-admin (tenants, usuários, convites, planos, pagamentos). |

---

## 6. Próximos passos

- **Revisão do PRD:** Validar requisitos e épicos com produto e time; atualizar Change Log.
- **UX/UI:** Usar este PRD como entrada para refinamento de fluxos e design system (@ux-design-expert).
- **Arquitetura:** Usar este PRD como entrada para decisões de arquitetura e evolução de integrações (@architect).
- **Backlog:** Priorizar itens do plano de melhorias (ex.: plano-melhorias-2026-03.md) e quebrar em stories alinhadas a estes épicos.

— Orion, orquestrando o sistema
