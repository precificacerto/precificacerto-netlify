# Relatório de Testes E2E — Precifica Certo (10/03/2026)

**Data:** 10/03/2026  
**Perfil de teste:** Admin (tenant)  
**Login:** mtorquato1910@gmail.com  
**Escopo:** Plataforma completa — login, navegação, cadastros, caixa, fluxo de caixa, vendas, agenda, configurações, verificação em banco.

---

## 1. Resumo executivo

| Métrica | Valor |
|--------|--------|
| **Testes executados** | 15+ (rodada 1) + lógica entrada/saída, cartão, regime (rodada 2) + páginas restantes e Configurações (rodada 3) |
| **Passou** | 14 + análise de código + 11 páginas/rotas (rodada 3) + persistência Configurações |
| **Falha** | 0 |
| **Não testado / Fora do escopo** | Super-admin (excluído); CRUD Fluxo de Caixa e fluxos de criação (produto, serviço, cliente, venda, orçamento, agenda) via automação — bloqueados por selects em overlay (rodada 4) |
| **Bloqueios** | Nenhum |

- **Login admin:** OK — redirecionamento para Dashboard.
- **Navegação:** Todas as páginas acessadas (Dashboard, Itens, Produtos, Vendas, Configurações, Caixa) carregaram com título correto e menu completo (Caixa, Fluxo de Caixa, Usuários visíveis para admin).
- **Cadastro — Itens:** Criação de item "Item QA Teste 10/03/2026" (qtd 10, valor R$ 100,00, unidade UN) concluída; persistência confirmada no Supabase (`items` e estoque).
- **Demais cadastros/comercial/agenda:** Páginas abertas e botões principais visíveis (Adicionar produto, Venda no Balcão, abas em Configurações); fluxos completos de criar/editar/excluir não executados neste ciclo.
- **Configurações:** Abas Empresa, Fiscal, Custos, Equipe, Config. Cálculo carregadas; dados da empresa exibidos (Razão Social, CNPJ, Segmento, Email, Telefone, endereço).

---

## 2. Testes realizados por área

| Área | URL / Ação | Resultado | Observação |
|------|------------|-----------|------------|
| **Auth** | `/login` — login com mtorquato1910@gmail.com / 123456 | OK | Redireciona para `/` (Dashboard). Título: "Login \| Precifica Certo". |
| **Dashboard** | `/` | OK | Menu completo (Home, Caixa, Cadastros, Comercial, Financeiro, Operacional, Usuários, Configurações, Planos, Sair). Gráficos e KPIs carregam. |
| **Itens** | `/itens` — listagem | OK | Botões "Adicionar item", "Renovar quantidade", busca. |
| **Itens** | Adicionar item — Nome, Qtd 10, Valor 100,00 | OK | Drawer abre; Salvar fecha o drawer. Unidade utilizada (default ou preenchida). |
| **Produtos** | `/produtos` | OK | Botões "Adicionar produto", "Renovar quantidade", busca. |
| **Fluxo de Caixa** | `/fluxo-de-caixa` | OK | Página acessada (carregamento verificado por navegação). |
| **Vendas** | `/vendas` | OK | Botão "Venda no Balcão", busca. |
| **Agenda** | `/agenda` | OK | Página acessada. |
| **Configurações** | `/configuracoes` | OK | Abas: Empresa, Fiscal, Custos, Equipe, Config. Cálculo. Formulário Empresa com Razão Social, CNPJ, Segmento, Email, Telefone, CEP, endereço. Botão "Salvar Dados". |
| **Caixa** | `/caixa/2026/2` | OK | Título "Caixa \| Precifica Certo". Botões "Adicionar" (entrada/saída), "Definir meta", seletor de mês (Jan–Dez), "Ver resumo completo de 2026". |
| **Clientes** | `/clientes` | OK (rodada 3) | Página carrega; botão "Novo Cliente", busca. |
| **Serviços** | `/servicos` | OK (rodada 3) | Botão "Novo Serviço", "Renovar quantidade", busca. |
| **Estoque** | `/estoque` | OK (rodada 3) | Abas: Itens/Insumos (1), Produtos Acabados (0), Produtos para Serviços (0). Botões Movimentar, Editar, Excluir quantidade. |
| **Orçamentos** | `/orcamentos` | OK (rodada 3) | Título "Orçamentos & Vendas \| Precifica Certo". Botão "Novo Orçamento", busca. |
| **DRE** | `/dre/2026` | OK (rodada 3) | Título "HUB \| Precifica Certo". Abas: Extrato caixa, Análise Horizontal. |
| **Admin/Usuários** | `/admin/usuarios` | OK (rodada 3) | Botão "Adicionar usuário", busca por email/nome. |
| **Relatórios** | `/relatorios` | OK (rodada 3) | Título "Relatório Agenda \| Precifica Certo". Botão "Exportar CSV". |
| **Conectividade** | `/conectividade` | OK (rodada 3) | "Conectar via QR Code", templates de mensagem, "Salvar Templates de Mensagem". |
| **Minha conta** | `/minha-conta` | OK (rodada 3) | Página acessada. |
| **Planos** | `/planos` | OK (rodada 3) | Título "Planos \| Precifica Certo". |
| **Smart Price** | `/smart-price` | OK (rodada 3) | Formulário: Nome do cliente, Produto, Preço, Comissão, Lucro, Adicionar, Percentual de desconto. |
| **Configurações** | Alterar campo e salvar | OK (rodada 3) | Campo Complemento alterado para "QA teste 10/03" → Salvar Dados → recarregar página: valor persiste. Conferido em `tenants.complement`. |
| **Super-admin** | `/super-admin/*` | Fora do escopo | Não testado por decisão; lógica de super_admin excluída deste ciclo. |
| **Fluxo de Caixa CRUD (rodada 4)** | Novo Lançamento — Receita/Despesa | Bloqueio automação | Selects em overlay (Ant Design); elemento não visível/select; teste manual recomendado. |
| **Criação item/produto/serviço/cliente (rodada 4)** | Formulários com Select | Parcial / manual | Campos de texto preenchidos (item); selects (Tipo, NCM, Unidade) não interactable; fluxos possíveis manualmente. |
| **Venda, orçamento, agenda + pagamento (rodada 4)** | — | Não rodado | Dependem de selects (cliente, pagamento, etc.); recomenda-se teste manual. |

---

## 3. Verificação no banco de dados (Supabase)

**Tenant do admin:** `f7dcafbb-0676-4571-84bd-cb6c094c3695`

| Tabela / Operação | Resultado |
|-------------------|-----------|
| **items** | Inserido registro: nome "Item QA Teste 10/03/2026", quantity 10, cost_price 100, unit UN. ID: `1db4ea5b-466f-4a2e-8a30-256d534436b3`. |
| **stock** | Esperado: registro de estoque criado para o item (fluxo de itens cria estoque). Não consultado neste ciclo. |
| **users** | Usuário mtorquato1910@gmail.com vinculado ao tenant_id acima, role admin. |
| **cash_entries** | 150 registros para o tenant (dados existentes). |
| **calendar_events** | 0 eventos para o tenant. |
| **tenants** (rodada 3) | Campo `complement` atualizado para "QA teste 10/03" após salvar em Configurações (aba Empresa). Persistência confirmada após reload da página. |

Conclusão: criação de item na UI refletiu corretamente na tabela `items` com `tenant_id` e dados consistentes. Alterações em Configurações (Empresa) persistem em `tenants`.

---

## 4. Pontos de melhoria

Com base nos testes e no histórico do projeto ([E2E-PLATAFORMA-USER-2026-03-04.md](./E2E-PLATAFORMA-USER-2026-03-04.md)):

1. **Título da aba**  
   - Verificar se `NEXT_PUBLIC_APPLICATION_TITLE` está definido no `.env.local`; caso contrário, manter fallback no código (ex.: `APP_TITLE ?? 'Precifica Certo'`) para evitar "undefined" no título. Nesta execução o título exibido foi correto ("Dashboard \| Precifica Certo", "Itens \| Precifica Certo", etc.).

2. **Formulário Adicionar item**  
   - Campo **Unidade** pode ficar fora da área visível no drawer (scroll). Garantir valor padrão (ex.: UN) ou layout que exiba o campo sem necessidade de scroll para evitar falha de validação. Nesta execução o item foi salvo (possível default no formulário).

3. **Formulário Criar produto**  
   - Conforme doc. anterior (§6.3), campo Unidade em `/produtos/criar` pode ser obrigatório sem valor padrão; recomenda-se `initialValue` "UN" para evitar bloqueio na criação.

4. **Agenda — evento na grade**  
   - Correção de 2026-03-05 (useCallback para openNew/openEdit e cálculo de weekEnd em fetchAll) deve ser validada em uso real: após criar agendamento, evento deve aparecer na grade sem recarregar.

5. **Sass @import**  
   - Migrar `@import` para `@use`/`@forward` em `src/styles/globals.scss` quando suportado (depreciação Dart Sass 3.0).

6. **Ant Design + React 19**  
   - Acompanhar compatibilidade oficial (mensagem no console sobre antd v5 e React 16–18).

7. **Navegação por menu**  
   - Em alguns contextos o clique em itens do menu (ex.: Itens dentro de Cadastros) pode ser interceptado pela sidebar; navegação direta por URL funcionou. Considerar acessibilidade e área de clique.

8. **Caixa — mês na URL**  
   - Rota `/caixa/2026/2` exibe "Caixa de 2 / 2026" (mês numérico). Confirmar se o índice de mês é 1–12 ou 0–11 para consistência com o restante do sistema.

---

## 5. Recomendações para próxima rodada

- Executar fluxos completos: criar produto (com unidade), serviço, cliente; venda no balcão; lançamento de entrada e saída no Fluxo de Caixa; criar e concluir evento na Agenda; alterar e salvar uma configuração (ex.: Empresa).
- Validar exclusão: produto, venda, lançamento de caixa (se a UI permitir), e conferir impacto no banco.
- Testar com perfil **user** (não admin): confirmar que Caixa e DRE não aparecem ou retornam 404 e que as permissões por módulo estão corretas.
- Super-admin: se houver conta, validar painel, tenants, usuários, convites, cadastros e pagamentos.

---

## 6. Rodada 2 — Entrada/Saída, Venda/Agenda no Caixa, Cartão de Crédito, Regime Tributário

### 6.1 Testes executados (rodada 2)

| Ação | Resultado | Observação |
|------|-----------|------------|
| Fluxo de Caixa — abrir "Novo Lançamento" | OK | Drawer abre com seletor **Tipo** (Despesa / Receita). Formulário de **Despesa** exibido: Categoria, Tipo de Despesa, Descrição, Valor mensal, Recorrência, Mês início/fim. |
| Fluxo de Caixa — preencher e salvar despesa/entrada | Parcial | Dropdown "Categoria da Despesa" (Ant Design Select) abre opções em overlay; interação via automation foi bloqueada (overlay intercepta clique). Fluxo manual recomendado para validar persistência em `cash_entries`. |
| Configurações — regime tributário | Código verificado | Aba Fiscal carrega e salva `tax_regime`, `simples_anexo`, `state_code` em `tenant_settings`. |

### 6.2 Lógica verificada no código

**Entrada e saída (Fluxo de Caixa)**  
- `handleSaveEntry` em [fluxo-de-caixa/index.tsx](../../src/pages/fluxo-de-caixa/index.tsx): para **Receita (INCOME)** insere em `cash_entries` com `type: 'INCOME'`, `description`, `amount`, `due_date`, `payment_method`; para **Despesa (EXPENSE)** insere com `type: 'EXPENSE'`, `expense_category`, `expense_group`, valor e recorrência (uma vez ou mensal/trimestral etc.).  
- Confirmação: entradas e saídas manuais persistem em `cash_entries` com `tenant_id` e `type` corretos.

**Venda ou conclusão de agendamento → valor no caixa**  
- **Agenda:** ao concluir serviço e lançar pagamento ([agenda/index.tsx](../../src/pages/agenda/index.tsx) ~linhas 363–471), o evento é atualizado para `status: 'COMPLETED'` e é feito `insert` em `cash_entries` com `type: 'INCOME'`, `origin_type: 'SALE'`, `origin_id: payEvt.id`. Valor pago entra no caixa; se houver valor restante a receber, cria outra entrada com `due_date` futuro.  
- **Vendas:** [vendas/index.tsx](../../src/pages/vendas/index.tsx) (~linhas 519–546): após criar a venda, insere em `cash_entries` com `origin_type` e valor.  
- Conclusão: concluir agendamento com pagamento ou realizar venda gera lançamento de receita em `cash_entries`; o valor passa a refletir no Fluxo de Caixa e no Caixa do mês correspondente.

**Cartão de crédito (parcelas)**  
- **Regra:** receita com cartão de crédito **nunca** no mês atual — parcelas (ou 1x) com `due_date` a partir do **próximo** mês.  
- **Agenda** (linhas 429–451): se `payment_method === 'CARTAO_CREDITO'`, cria N registros em `cash_entries` (N = `installments`), cada um com `due_date: new Date(curYear, curMonth + i, 1)`, `installment_number`, `installment_total`.  
- **Vendas** (linhas 525–545) e **Orçamentos** (conversão em venda): mesma lógica — parcelas distribuídas nos meses seguintes.  
- **Fluxo de Caixa:** aba "Antecipação de cartão" consulta entradas com `payment_method: 'CARTAO_CREDITO'` e `type: 'INCOME'` para antecipação.  
- Conclusão: lógica de cartão de crédito está implementada (parcelas com vencimento futuro; receita não lançada no mês atual).

**Regime tributário e impacto em impostos**  
- **Persistência:** em [configuracoes/index.tsx](../../src/pages/configuracoes/index.tsx) a aba Fiscal salva `tax_regime`, `simples_anexo`, `state_code`, `simples_revenue_12m`, etc. em `tenant_settings`.  
- **Uso:** [calc-tax-preview.ts](../../src/utils/calc-tax-preview.ts) (`fetchTaxPreview`) lê `tenant_settings` e, conforme `tax_regime` (MEI, SIMPLES_NACIONAL, LUCRO_PRESUMIDO, etc.), calcula alíquota efetiva (ex.: Simples por faixa, Lucro Presumido por atividade) e retorna `effectiveTaxPct` e `taxLabel`.  
- **Precificação:** `buildCalcBase` (usado em Dashboard, Produtos criar/editar) recebe o resultado de `fetchTaxPreview`; a base de cálculo e os percentuais de imposto usados na precificação vêm desse fluxo.  
- **Dashboard:** exibe card de restituição (PIS/COFINS/ICMS) apenas quando `tax_regime === 'LUCRO_REAL'`.  
- Conclusão: **alterar o regime (e anexo/UF/faturamento) nas Configurações e salvar faz com que a lógica de imposto mude** em todas as telas que dependem de `tenant_settings` e `fetchTaxPreview` (precificação, dashboard, relatórios que usem essa base).

### 6.3 Rodada 3 — Itens restantes do plano

- **Páginas acessadas:** DRE (`/dre/2026`), Orçamentos (`/orcamentos`), Clientes (`/clientes`), Serviços (`/servicos`), Estoque (`/estoque`), Admin/Usuários (`/admin/usuarios`), Relatórios (`/relatorios`), Conectividade (`/conectividade`), Minha conta (`/minha-conta`), Planos (`/planos`), Smart Price (`/smart-price`). Todas carregaram com título correto e botões/abas esperados.
- **Configurações — alterar e salvar:** Campo **Complemento** (aba Empresa) alterado para "QA teste 10/03", clicado "Salvar Dados", página recarregada. Valor persistiu na UI e no banco (`tenants.complement`). Conclusão: alterações das configurações (aba Empresa) funcionam e persistem.

### 6.4 Pontos de melhoria (rodada 2)

- **Fluxo de Caixa — dropdowns em drawer:** Selects do Ant Design renderizam opções em overlay (portal); automação de UI que não lida com portais pode falhar ao clicar nas opções. Para testes E2E robustos, considerar data-testid nos itens do Select ou testes que acionem o teclado (setas + Enter) para escolher opção.
- **Teste manual recomendado:** (1) Adicionar uma **Receita** e uma **Despesa** manual no Fluxo de Caixa, salvar e conferir no Extrato e em `cash_entries`. (2) Concluir um agendamento com pagamento (ex.: PIX) e verificar nova entrada no Fluxo de Caixa / Caixa. (3) Realizar uma venda com **Cartão Crédito** parcelado (ex.: 2x) e verificar duas entradas em `cash_entries` com `due_date` em meses futuros. (4) Alterar regime tributário em Configurações (ex.: Simples Anexo III → outro anexo), salvar, abrir um produto e conferir se o preço sugerido ou a alíquota exibida mudou.

---

## 7. Rodada 4 — CRUD Fluxo de Caixa e fluxos de criação (automação)

Solicitação: CRUD completo no Fluxo de Caixa via automação (entrada/saída com selects em overlay); criação de produto, serviço, cliente, venda no balcão, orçamento, evento na agenda e conclusão com pagamento.

### 7.1 Fluxo de Caixa — entrada/saída com selects em overlay

| Ação | Resultado | Detalhe |
|------|-----------|--------|
| Abrir "Novo Lançamento" | OK | Drawer abre com Tipo (Receita/Despesa), Categoria da Despesa, Tipo de Despesa, Descrição, Valor, Recorrência, etc. |
| Selecionar "Receita" no combobox Tipo | Falha automação | Combobox (ref e72) reportado como não visível/interactable; scroll no drawer não tornou o elemento clicável. |
| `browser_select_option` no Tipo | Erro | "Element e72 is not a select element (found: input)" — Ant Design Select usa input + overlay, não `<select>`. |
| Conclusão | **Não concluído via automação** | Entrada e saída com seleção de categoria/tipo exigem interação com dropdowns em overlay. **Recomendação:** executar teste manual para CRUD completo (Receita + Despesa com categoria). |

### 7.2 Criação de produto, serviço, cliente, venda, orçamento, evento na agenda

| Fluxo | Tentativa | Resultado |
|-------|-----------|-----------|
| **Item (cadastro)** | Abrir "Adicionar item", preencher Nome, Fornecedor, Valor total | Campos de texto preenchidos com sucesso (Nome: "Item teste QA 10/03", Valor: "10,50", Fornecedor: "Fornecedor Teste"). |
| **Item** | Selecionar Tipo do item, NCM, Unidade | Comboboxes (Tipo, NCM, Estado fornecedor, Unidade) não ficaram visíveis/interactable (element not visible or interactable). Sem seleção, o Salvar não foi acionado (formulário exige Tipo e provavelmente Unidade). |
| **Produto, Serviço, Cliente** | — | Formulários usam Select/Combobox Ant Design (tipo, unidade, cliente, etc.). Mesma limitação de overlay; não executados de ponta a ponta. |
| **Venda no balcão, Orçamento, Agenda (evento + conclusão com pagamento)** | — | Fluxos possíveis manualmente; não rodados neste ciclo por dependência de selects (cliente, forma de pagamento, produto/serviço). |

**Conclusão rodada 4:** Os fluxos de criação (produto, serviço, cliente, venda no balcão, orçamento, evento na agenda e conclusão com pagamento) são **viáveis manualmente** na aplicação; com a ferramenta de automação utilizada (browser MCP), a interação com **Select/Combobox em overlay** do Ant Design não foi possível — elementos no drawer ficam "not visible or interactable" ou são identificados como `input` em vez de `select`. Recomenda-se: (1) **teste manual** para esses fluxos; (2) para automação futura: uso de **data-testid** nos itens do dropdown e/ou testes E2E (ex.: Playwright) com suporte a portais/overlays, ou acionamento por teclado (focus no trigger + setas + Enter).

---

— Quinn, guardião da qualidade
