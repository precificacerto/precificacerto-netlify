# Plano de Melhorias — Precifica Certo (2026-03)

> **Criado por:** Orion (AIOS Master Orchestrator)  
> **Data:** 2026-03-05  
> **Escopo:** Melhorias 3–19 (Agenda, Observação, Pagamento, Cliente, Relatório, Conectividade, Orçamento, Custo, Mão de obra, Itens, Comissão, Desconto, Fluxo de caixa)  
> **Revisão (compatibilidade):** Ver plano "Revisão Plano Melhorias" — riscos e ordem de execução segura.

### Status de execução

| Fase | Descrição | Status |
|------|-----------|--------|
| **Fase 1** | Migrations (installments, customer_service_history, max_discount_percent) + labels #4, #7, #16 | Concluída |
| **Fase 2** | Agenda (#3, #5, #8) + histórico cliente (#6) | Concluída |
| **Fase 3** | Orçamento e precificação (#9, #15, #17, #18) | Concluída |
| **Fase 4** | Custo produto (#11) + atualizar produtos (#14) | Concluída |
| **Fase 5** | Comissão fluxo (#19); #12 (mão de obra produtiva) adiado | Parcial (#19 concluída) |

---

## Resumo executivo

| # | Melhoria | Impacto DB | Agente sugerido | Prioridade |
|---|----------|------------|-----------------|------------|
| 3 | Agenda: organizar por dia/funcionário + botão nome → agenda da semana do funcionário | Baixo | @dev | Alta |
| 4 | Observação: "Observação de pagamento" → "Observação do serviço" (agenda) | Nenhum | @dev | Baixa |
| 5 | Agenda pagamento: se cartão crédito → campo à vista ou parcelado 2x–12x | Sim (coluna) | @dev + @data-engineer | Alta |
| 6 | Histórico do cliente: observações de serviços → base de dados do cliente | Sim (nova tabela) | @data-engineer + @dev | Alta |
| 7 | Renomear "Relatórios" (operacional) → "Relatório Agenda" | Nenhum | @dev | Baixa |
| 8 | Conectividade: botão "Marcar todos" no disparo manual | Nenhum | @dev | Média |
| 9 | Sequência disparo orçamento: msg conectividade → msg texto orçamento → PDF | Nenhum | @dev | Alta |
| 11 | Custo do produto: usar custo unitário (não dividir pela quantidade criada) | Revisão lógica | @dev | Alta |
| 12 | Mão de obra produtiva: valor/minuto; separar produtiva vs administrativa na precificação | Sim (config/cálculo) | @data-engineer + @dev | Alta |
| 14 | Item: botão "Atualizar produtos" quando custo unitário do item mudar | Nenhum | @dev | Média |
| 15 | Comissão vendedor no orçamento: incluir % no cálculo antes de enviar | Revisão | @dev | Alta |
| 16 | Renomear "Comissão vendedor" → "Comissão total do vendedor" (precificação) | Nenhum | @dev | Baixa |
| 17 | Desconto no orçamento: sair de comissão e lucro (proporcional) | Nenhum | @dev | Alta |
| 18 | Produto: campo "máximo desconto %" por produto | Sim (coluna) | @data-engineer + @dev | Média |
| 19 | Fluxo de caixa: aba "Comissão vendedores" + cálculo por período | Sim (categorias/entradas) | @data-engineer + @dev | Alta |

---

## 1. Banco de dados (Supabase) — Alterações necessárias

### 1.1 Tabelas/colunas a criar ou alterar

| Tabela | Alteração | Justificativa |
|--------|-----------|---------------|
| **calendar_events** | Adicionar `installments` (integer, nullable) | #5: parcelas 1 (à vista) ou 2–12 quando pagamento = cartão crédito |
| **customers** | — | Sem alteração de colunas; histórico em tabela separada |
| **customer_service_history** (nova) | Criar tabela: `id`, `tenant_id`, `customer_id`, `calendar_event_id` (nullable), `sale_id` (nullable), `service_observation`, `product_observation`, `created_at`, `created_by` | #6: histórico de observações por serviço/atendimento para o cliente |
| **products** | Adicionar `max_discount_percent` (numeric, nullable) | #18: limite máximo de desconto por produto |
| **tenant_settings** ou **employees** | Confirmar se já existe campo para “mensagem antes do orçamento”; se não, usar apenas `whatsapp_budget_message` na ordem correta | #9: ordem de envio já definida por fluxo na API |
| **cash_entries** | Garantir categoria/expense_group para “Comissão vendedor” (ex.: `COMISSAO_VENDEDOR`); possivelmente `contact_id` ou metadado para vincular a `employee_id` | #19: lançamentos de pagamento de comissão |
| **pricing_calculations** / **tenant_settings** | Campos para mão de obra produtiva (valor total, horas, qtd funcionários, valor/minuto) e separação produtiva vs administrativa | #12: novo modelo de custo por minuto (produtiva) e lógica atual (administrativa) |

### 1.2 Migrations sugeridas (ordem)

1. **calendar_events.installments** — migration pequena, sem dependências.
2. **customer_service_history** — nova tabela com RLS por `tenant_id` e FKs para `customers`, `calendar_events`, `sales`.
3. **products.max_discount_percent** — uma coluna, default null.
4. **Categorias fluxo de caixa** — garantir categoria “Comissão vendedor” em `cashier_categories` (ou equivalente) e uso em `cash_entries` para #19.
5. **Mão de obra produtiva** — conforme desenho de #12 (tenant_settings e/ou tabela auxiliar de configuração de custo/hora produtiva).

---

## 2. Melhorias por item (detalhamento)

### 3 — Agenda: organizar por dia e por funcionário + botão no nome

- **Comportamento atual:** Grade por semana, filtro por funcionário; nomes na lista.
- **Alterações:**
  - Manter organização por dia (colunas) e por funcionário (linhas ou abas).
  - Nome do funcionário **clicável**: ao clicar, abrir a mesma tela de agenda já filtrada pela semana atual e pelo funcionário clicado (ou navegar para `/agenda?employee_id=xxx` e carregar semana desse funcionário).
- **Arquivos:** `src/pages/agenda/index.tsx`, possivelmente `src/constants/routes.ts` (query param).
- **Agente:** @dev.

---

### 4 — Observação: de “pagamento” para “serviço”

- **Comportamento atual:** Label "Observações de Pagamento" e campo `payment_notes` no modal de lançar pagamento (agenda).
- **Alterações:** Alterar apenas o **texto** do label para "Observação do serviço"; manter `payment_notes` no banco (ou, opcionalmente, renomear para `service_notes` em migration + código).
- **Arquivos:** `src/pages/agenda/index.tsx`.
- **Agente:** @dev.

---

### 5 — Cartão de crédito: à vista ou parcelado 2x–12x

- **Comportamento atual:** Forma de pagamento selecionável; sem campo de parcelas no modal de pagamento da agenda.
- **Alterações:**
  - Se `payment_method === 'CARTAO_CREDITO'`, exibir campo: **À vista** (1x) ou **Parcelado** (2x a 12x).
  - Persistir em `calendar_events.installments` (integer; 1 = à vista).
  - Incluir informação de parcelas no lançamento em `cash_entries` (description ou metadado), se aplicável.
- **DB:** Migration adicionando `installments` em `calendar_events`.
- **Arquivos:** `src/pages/agenda/index.tsx`, tipos Supabase.
- **Agentes:** @data-engineer (migration), @dev (UI + integração).

---

### 6 — Histórico do cliente (observações de serviços)

- **Comportamento desejado:** Todo serviço (agenda ou venda) que tiver observação deve gerar um registro de histórico do cliente.
- **Alterações:**
  - Criar tabela `customer_service_history` (ou `customer_observations`) com: `tenant_id`, `customer_id`, referência ao evento/venda (`calendar_event_id`, `sale_id`), texto da observação, `created_at`, `created_by`.
  - Ao concluir/lançar pagamento na agenda: se houver observação (ex.: `payment_notes` ou novo `service_notes`), inserir em `customer_service_history`.
  - Na tela de cliente (ex.: drawer ou aba “Histórico”), listar registros ordenados por data.
- **DB:** Nova tabela + RLS.
- **Arquivos:** Nova migration, `src/pages/agenda/index.tsx` (insert histórico), `src/pages/clientes/index.tsx` (ou componente de detalhe do cliente).
- **Agentes:** @data-engineer (modelo + migration), @dev (regras de negócio + UI).

---

### 7 — “Relatório Agenda” (nome do módulo operacional)

- **Comportamento atual:** Menu/navegação com "Relatórios" (operacional).
- **Alterações:** Onde o módulo é listado como “Relatórios” no contexto **operacional**, exibir **“Relatório Agenda”** (título da página e/ou item de menu).
- **Arquivos:** `src/constants/page-titles.ts` (ex.: `REPORTS` ou novo título), `src/components/layout/nav.component.tsx`, `src/pages/relatorios/index.tsx` (subtitle/title).
- **Agente:** @dev.

---

### 8 — Conectividade: “Marcar todos” no disparo manual

- **Comportamento atual:** Lista de clientes com checkbox; seleção um a um.
- **Alterações:** Botão **“Marcar todos”** que seleciona todos os clientes da lista (com telefone/WhatsApp) para o disparo manual; opcionalmente “Desmarcar todos”.
- **Arquivos:** `src/pages/conectividade/index.tsx`.
- **Agente:** @dev.

---

### 9 — Sequência de disparo do orçamento (WhatsApp)

- **Comportamento desejado:**
  1. Se houver mensagem configurada em Conectividade (ex.: `whatsapp_budget_message` ou mensagem “antes do orçamento”), enviar **essa mensagem primeiro**.
  2. Depois, enviar a **mensagem em texto padrão** do orçamento (resumo com itens, total, etc.).
  3. Por fim, enviar o **PDF** do orçamento.
  - Se **não** houver mensagem em Conectividade: enviar só **mensagem texto do orçamento** + **PDF**.
- **Alterações:** No handler de envio (ex.: `src/pages/api/orcamentos/[id]/send-whatsapp.ts`): (1) se existir template/mensagem “conectividade”, enviar 1ª mensagem; (2) enviar texto padrão do orçamento; (3) enviar documento PDF. Respeitar throttle entre envios.
- **Arquivos:** `src/pages/api/orcamentos/[id]/send-whatsapp.ts`, possivelmente `tenant_settings` (uso de `whatsapp_budget_message` como “mensagem antes”).
- **Agente:** @dev.

---

### 11 — Custo do produto (criar produto)

- **Comportamento desejado:** O custo do produto deve refletir o **custo unitário** (por unidade de produto), e **não** ser obtido dividindo pela quantidade produzida/criada.
- **Alterações:** Revisar onde `cost_total` é calculado e persistido ao criar/editar produto (ex.: `content.component.tsx`, `pricing-engine.ts`). Garantir que:
  - Entrada do motor seja “custo total dos insumos para 1 unidade do produto” (ou equivalente).
  - `products.cost_total` armazene **custo unitário** do produto (já é o que o motor retorna como `cmvUnit`; verificar se em algum fluxo se está usando `cmvTotal` ou dividindo de forma errada por `yield_quantity`).
- **Arquivos:** `src/page-parts/products/content.component.tsx`, `src/utils/pricing-engine.ts`, `src/pages/producao/index.tsx` (se usar custo na produção).
- **Agente:** @dev.

---

### 12 — Mão de obra produtiva (valor/minuto) e separação produtiva vs administrativa

- **Comportamento desejado:**
  - **Produtiva:** Valor total da mão de obra produtiva, horas trabalhadas, quantidade de funcionários → dividir por 60 → **valor por minuto**. Usado na precificação de **serviços e produtos**, mensurado em **minutos**.
  - **Administrativa:** Manter lógica atual de mão de obra; na precificação, **separar** em “mão de obra produtiva” e “mão de obra administrativa”.
- **Alterações:**
  - Configuração (ex.: em Configurações ou `tenant_settings`): valor total mão de obra produtiva, horas trabalhadas (ou minutos), quantidade de funcionários; derivar “custo por minuto” (ex.: total / (horas * 60) ou total / minutos_totais).
  - Motor de precificação: entrada de “minutos” do produto/serviço; aplicar custo/minuto produtivo; manter parcela administrativa como hoje.
  - UI de precificação: exibir duas linhas (produtiva e administrativa).
- **DB:** Campos em `tenant_settings` (ou tabela de configuração de custo) para produtiva; possivelmente `pricing_calculations` com colunas para valores produtivos vs administrativos.
- **Arquivos:** Configurações, `pricing-engine.ts`, componentes de precificação (produto e serviço).
- **Agentes:** @data-engineer (esquema), @dev (cálculo + UI).

---

### 14 — Item: botão “Atualizar produtos” quando custo do item mudar

- **Comportamento desejado:** Em cada item da listagem, se o **custo unitário** do item foi alterado (ex.: comparação com último valor usado nos produtos), exibir botão **“Atualizar produtos”** que dispara a atualização dos produtos que usam esse item (recalcular custo e precificação).
- **Alterações:**
  - Detectar “item com custo alterado” (ex.: comparar `items.cost_price` ou `cost_per_base_unit` com o que está em `product_items` ou em cache de último custo).
  - Botão por item: “Atualizar produtos vinculados” → chamar lógica que, para cada produto que usa o item, recalcula custo (e preço de venda, se aplicável) e atualiza `products.cost_total` e `pricing_calculations`.
- **Arquivos:** `src/pages/itens/index.tsx`, possível API ou função de recálculo em `src/utils/pricing-engine.ts` / serviços de produto.
- **Agente:** @dev.

---

### 15 — Comissão do vendedor no orçamento

- **Comportamento desejado:** Se o funcionário (vendedor) tem **% de comissão** preenchido, ao criar/editar orçamento o valor exibido para o vendedor deve ser o valor da precificação **mais** a comissão desse vendedor; a comissão deve entrar no **cálculo do produto** antes de enviar o orçamento (não só exibição).
- **Alterações:**
  - Ao montar itens do orçamento (produtos/serviços), se o orçamento for do vendedor com `commission_percent` preenchido, aplicar esse % sobre o preço (ou sobre a parte de margem) e refletir no `unit_price` dos itens do orçamento (ou em campo auxiliar).
  - Garantir que o valor final do orçamento já inclua a comissão quando o criador for vendedor com comissão.
- **Arquivos:** `src/pages/orcamentos/index.tsx`, lógica de cálculo de preço por item (e possivelmente `budget_items`).
- **Agente:** @dev.

---

### 16 — Nome “Comissão total do vendedor” (precificação)

- **Comportamento:** Apenas renomear labels de “Comissão vendedor” para **“Comissão total do vendedor”** nas telas de precificação (produto/serviço).
- **Arquivos:** `src/page-parts/products/product-price.component.tsx`, `src/page-parts/services/content.component.tsx`, outros textos de precificação.
- **Agente:** @dev.

---

### 17 — Desconto no orçamento (proporcional a comissão e lucro)

- **Comportamento desejado:** Campo de **desconto** no orçamento; o valor do desconto deve sair **proporcionalmente** da **comissão** e do **lucro** do produto, **nunca** de despesas fixas, variáveis ou impostos.
- **Alterações:**
  - Ao aplicar desconto no orçamento (global ou por item), calcular a redução proporcional em comissão e lucro (por item ou no total), mantendo custos e impostos intactos.
  - Persistir desconto em `budgets` e/ou `budget_items` (já existe `discount` em `budget_items`); garantir que a lógica de exibição e de totais use essa regra.
- **Arquivos:** `src/pages/orcamentos/index.tsx`, lógica de totalização e possivelmente API de orçamento.
- **Agente:** @dev.

---

### 18 — Máximo de desconto por produto

- **Comportamento desejado:** No cadastro do produto, campo **“Máximo desconto (%)”**; na criação/edição do orçamento (e onde aplicar desconto), validar que o desconto não ultrapasse esse máximo por produto.
- **DB:** Coluna `products.max_discount_percent` (numeric, nullable).
- **Arquivos:** Formulário de produto (criar/editar), formulário de orçamento (validação ao aplicar desconto).
- **Agentes:** @data-engineer (migration), @dev (UI + validação).

---

### 19 — Fluxo de caixa: comissão dos vendedores

- **Comportamento desejado:**
  - Calcular **comissão paga** por vendedor e por período (ex.: mês).
  - Nova **aba** no Fluxo de Caixa com relatório/organização desses valores (por vendedor, por período).
  - Pagamentos de comissão devem poder ser lançados no fluxo (ex.: categoria “Comissão vendedor”) e vinculados ao vendedor/período.
- **Alterações:**
  - Cálculo: a partir de vendas/orçamentos convertidos em venda, onde há `employee_id` (vendedor) e `commission_percent`, calcular valor de comissão por venda; agregar por vendedor e período.
  - Nova aba em `src/pages/fluxo-de-caixa/index.tsx`: “Comissão vendedores” — listagem por período (ex.: mês) e por funcionário; totais.
  - Garantir categoria de despesa para “Comissão vendedor” em `cash_entries` (e possivelmente `origin_id`/metadado para rastrear vendedor).
- **DB:** Verificar se `cashier_categories` tem categoria para comissão; se não, criar. Possivelmente `cash_entries.contact_id` ou JSON para `employee_id` quando tipo = comissão.
- **Arquivos:** `src/pages/fluxo-de-caixa/index.tsx`, queries para vendas com comissão, possivelmente seed de categorias.
- **Agentes:** @data-engineer (categoria e estrutura), @dev (cálculo + aba + UI).

---

## 3. Ordem de execução sugerida

1. **Fase 1 — DB e nomes (rápidos)**  
   - #4 (label observação), #7 (Relatório Agenda), #16 (Comissão total do vendedor).  
   - Migrations: #5 `installments`, #18 `max_discount_percent`, #6 `customer_service_history`, #19 categorias/comissão.

2. **Fase 2 — Agenda e conectividade**  
   - #3 (agenda por funcionário + botão), #5 (parcelas cartão crédito na agenda), #8 (marcar todos).

3. **Fase 3 — Orçamento e precificação**  
   - #9 (sequência disparo), #15 (comissão vendedor no orçamento), #17 (desconto proporcional), #18 (validação máximo desconto).

4. **Fase 4 — Cliente e produto**  
   - #6 (histórico cliente + persistência ao concluir serviço), #11 (revisão custo produto), #14 (atualizar produtos a partir do item).

5. **Fase 5 — Mão de obra e fluxo de caixa**  
   - #12 (mão de obra produtiva por minuto + separação), #19 (aba comissão vendedores no fluxo de caixa).

---

## 4. Agentes e responsabilidades

| Agente | Uso principal |
|--------|----------------|
| **@data-engineer** | Migrations (calendar_events.installments, customer_service_history, products.max_discount_percent, categorias cash_entries, config mão de obra produtiva); RLS; revisão de esquema. |
| **@dev** | Implementação de UI, APIs e regras de negócio em todas as melhorias; integração com Supabase após migrations. |
| **@qa** | Validação de cada melhoria (critérios de aceite, testes manuais/E2E). |
| **@aios-master (Orion)** | Orquestração do plano, quebra em stories (se desejado) e acompanhamento. |

---

## 5. Próximos passos

1. **Validar plano** com o time (product/PO).  
2. **Quebrar em stories** (ex.: no formato `docs/stories/`) e priorizar no backlog.  
3. **Executar migrations** na ordem acima (preferencialmente em branch de desenvolvimento).  
4. **Implementar** por fases, com @dev e @data-engineer conforme a tabela de agentes.  
5. **Revisar** com @qa antes de considerar cada item fechado.

— Orion, orquestrando o sistema
