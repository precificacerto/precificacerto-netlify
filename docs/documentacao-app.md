# Documentação — PrecificaCerto

> Referência mínima para entender e modificar o app sem necessidade de reinspeção completa.

---

## 1. Visão Geral

**PrecificaCerto** é um SaaS B2B de gestão financeira e comercial para pequenos negócios brasileiros (salões, prestadores de serviço, etc.).

- **URL de produção:** https://app.precificacerto.com.br
- **Stack:** Next.js (Pages Router) · React · Ant Design · Chart.js · Supabase (BaaS)
- **Idioma:** Português (pt-BR)
- **Multi-tenant:** cada empresa tem um `tenant_id` / `Tenant` isolado no Supabase

---

## 2. Estrutura de Pastas

```
src/
├── pages/               # Rotas Next.js (Pages Router)
│   ├── index.tsx        # Dashboard
│   ├── login.tsx
│   ├── onboarding.tsx
│   ├── caixa/[year]/[month].tsx
│   ├── dre/[year].tsx
│   ├── smart-price/index.tsx
│   ├── produtos/index.tsx
│   ├── clientes/index.tsx
│   ├── funcionarios/index.tsx
│   ├── orcamentos/index.tsx
│   ├── vendas/index.tsx
│   ├── estoque/index.tsx
│   └── configuracoes/index.tsx
├── components/          # Componentes reutilizáveis
│   ├── layout/          # Layout principal (sidebar, header)
│   ├── ui/card-kpi.component.tsx
│   ├── charts/          # Gráficos Chart.js encapsulados
│   └── months/          # Navegador de meses
├── constants/
│   ├── routes.ts        # Enum ROUTES
│   ├── page-titles.ts   # Enum PAGE_TITLES
│   ├── month.ts         # Objetos de meses
│   └── cashier-category.ts # Categorias de caixa
├── contexts/
│   └── auth.context.tsx # AuthContext + tokenName
├── hooks/
│   └── use-auth.hook.ts
├── supabase/
│   ├── client.ts        # Instância do Supabase
│   └── types.ts         # Tipos TypeScript gerados
└── utils/               # Funções auxiliares
```

---

## 3. Rotas da Aplicação

| Rota | Título | Descrição |
|------|--------|-----------|
| `/login` | Login | Autenticação |
| `/` | Dashboard | KPIs e gráficos financeiros |
| `/onboarding` | Onboarding | Configuração inicial da empresa |
| `/caixa/[year]/[month]` | Caixa | Lançamentos mensais de entradas/saídas |
| `/dre/[year]` | DRE | Demonstrativo de Resultado do Exercício |
| `/smart-price` | Smart Price | Calculadora de precificação com PDF |
| `/produtos` | Produtos | Catálogo de produtos/serviços |
| `/produtos/criar` | Criar produto | Cadastro de novo produto |
| `/produtos/[id]` | Editar produto | Edição de produto |
| `/clientes` | Clientes | CRUD de clientes |
| `/funcionarios` | Funcionários | CRUD de equipe + folha |
| `/orcamentos` | Orçamentos & Vendas | Pipeline comercial |
| `/vendas` | Vendas | Histórico de vendas |
| `/estoque` | Estoque | Controle de estoque (itens e produtos) |
| `/configuracoes` | Configurações | Empresa, impostos, equipe, WhatsApp |

---

## 4. Autenticação

- **Provedor:** Supabase Auth (email + senha)
- **Credenciais de Teste (Local/Dev):**
  - **Login:** `mtorquato1910@gmail.com`
  - **Senha:** `Precifica123`
- **Token:** armazenado via `nookies` com a chave `tokenName` (definida em `auth.context.tsx`)
- **Hook:** `useAuth()` → expõe `user`, `session`, `signOut`
- **Tenant:** obtido via `getTenantId()` (util que busca `tenant_id` do usuário autenticado)
- **Proteção:** páginas redirecionam para `/login` se sem sessão
- **Onboarding:** novos usuários são direcionados a `/onboarding` antes do dashboard

---

## 5. Banco de Dados (Supabase)

### Tabelas Principais

| Tabela | Descrição |
|--------|-----------|
| `tenants` | Dados da empresa (CNPJ, endereço, regime tributário) |
| `tenant_settings` | Configurações (WhatsApp, webhook, horários) |
| `customers` | Clientes da empresa |
| `employees` | Funcionários (salário, carga horária, papel) |
| `products` | Produtos/serviços |
| `product_items` | Composição (insumos) de cada produto |
| `pricing_calculations` | Cálculo de preço de venda por produto |
| `items` | Insumos/matérias-primas |
| `stock` | Estoque atual (itens e produtos) |
| `stock_movements` | Histórico de movimentações de estoque |
| `budgets` | Orçamentos comerciais |
| `budget_items` | Itens de cada orçamento |
| `sales` | Vendas realizadas (balcão e via orçamento) |
| `sale_items` | Itens de cada venda |
| `cash_entries` | Entradas do fluxo de caixa |
| `payment_revenue_titles` | Lançamentos do caixa mensal (Caixa) |
| `whatsapp_dispatches` | Histórico de envios WhatsApp |

### Padrão de Acesso
Todas queries filtram por `tenant_id` (RLS e código). Exemplo:
```ts
supabase.from('products').select('*').eq('tenant_id', tenantId)
```

---

## 6. Páginas — Detalhamento Funcional

### 6.1 Login (`/login`)
- Formulário email + senha via componente `SignInWithEmailPassword`
- Sucesso → redireciona para `/`
- Sem lógica adicional na página (delegado ao componente)

---

### 6.2 Onboarding (`/onboarding`)
**Fluxo multi-step (5 etapas):**
1. **Empresa** — Razão Social, Nome Fantasia, CNPJ/CPF (com máscara)
2. **Endereço** — CEP (com busca ViaCEP implícita), Rua, Número, Bairro, Cidade, UF
3. **Tributação** — Regime tributário, CNAE, alíquotas
4. **Equipe** — Número de funcionários, horas/dia, dias/mês
5. **Conclusão** — Dados salvos no Supabase, redirecionamento para dashboard

**Dependências:** `vanilla-masker` para CPF/CNPJ/CEP/Telefone, Ant Design `Steps`

---

### 6.3 Dashboard (`/`)
**KPIs exibidos:**
- Total de Entradas (mês atual)
- Total de Saídas (mês atual)
- Saldo Atual
- Meta Mensal (comparativa)

**Gráficos:**
- Linha: Entradas × Saídas × Meta (12 meses) via `react-chartjs-2`
- `MonthIncomeExpenseChart`: comparativo mensal
- `CashierExpensePercentuals`: % das categorias de despesa

**Dados:** Buscados do Supabase, agregando `payment_revenue_titles` por mês

---

### 6.4 Caixa (`/caixa/[year]/[month]`)
**Funcionalidades:**
- Navegação por mês/ano via componente `Months`
- Tabelas separadas: **Entradas** e **Saídas** do mês
- Adicionar/Editar lançamento via `Drawer` (`NewPaymentRevenueForm`)
- Campos: Tipo, Categoria, Valor (com máscara), Data, Descrição
- Definir **Meta Mensal** (valor salvo por mês/ano)
- Alerta de saldo negativo

**Categorias de caixa:** definidas em `CASHIER_CATEGORY` (constante com entradas e saídas separadas)

**Tabela Supabase:** `payment_revenue_titles`

---

### 6.5 DRE (`/dre/[year]`)
**Abas:**
1. **DRE** — Tabela anual com categorias × meses, totais e análise horizontal (%)
2. **Resumo Caixa** — Visão consolidada do fluxo de caixa

**Cálculos:**
- Horizontal: variação % em relação à média do período
- Subcategorias agrupadas por categoria pai (`CATEGORIES_SUBCATEGORIES`)
- Tradução de categorias via `CATEGORIES_TRANSLATION`

**Seleção de ano** via `Select` (navega para `/dre/[year]`)

---

### 6.6 Smart Price (`/smart-price`)
**Propósito:** Calculadora "o que preciso cobrar" para uma lista de serviços/produtos.

**Fluxo:**
1. Usuário adiciona itens (Nome do produto, Preço de custo, % Comissão, % Lucro)
2. O sistema calcula automaticamente o preço de venda sugerido
3. Desconto opcional aplicável ao total
4. Geração de PDF via utilitário `createSmartPricePDF` (download direto)

**Dados não persistidos no Supabase** — é uma ferramenta de sessão/cálculo

---

### 6.7 Produtos (`/produtos`)
- Listagem com busca por nome, ordenação por nome
- Colunas: Código, Nome, Descrição, Preço (de `pricing_calculations`)
- Ações: **Editar** (navega para `/produtos/[id]`), **Excluir** (cascata: exclui `product_items` e `pricing_calculations`)
- Botão "Adicionar produto" navega para `/produtos/criar`

**Tabelas:** `products`, `product_items`, `pricing_calculations`

---

### 6.8 Clientes (`/clientes`)
**KPIs:** Total, Ativos, PJ (CNPJ), Com WhatsApp

**Tabela com colunas:** Nome, Documento, Telefone, Tipo (PF/PJ), Status, Ações

**Drawer de cadastro/edição:**
- Nome, Documento (CPF/CNPJ), Email, Telefone, WhatsApp
- Tipo: Pessoa Física / Pessoa Jurídica
- Status: Ativo / Inativo
- Observações

**Tabela Supabase:** `customers`

---

### 6.9 Funcionários (`/funcionarios`)
**KPIs:** Total, Ativos, Folha Mensal (R$), Horas/Mês (equipe)

**Tabela:** Nome/Cargo, Email, Telefone, Setor (Produtivo/Comercial/Administrativo), Salário, Carga Horária, Acesso (vinculado à plataforma?), Status

**Setor (papel):**
- `PRODUCTIVE` → Produtivo (verde)
- `COMMERCIAL` → Comercial (azul)
- `ADMINISTRATIVE` → Administrativo (roxo)

**Status:** ACTIVE / INACTIVE / ON_LEAVE

**Funcionalidades extras:**
- Convidar funcionário por email (`/api/employees/send-invite`)
- Salvar via API route (`/api/employees/save`) — não diretamente no Supabase via client

**Tabela Supabase:** `employees`

---

### 6.10 Orçamentos (`/orcamentos`)
**Pipeline visual (Steps):** Rascunho → Enviado → Aprovado → Pago

**KPIs:** Total, Pendentes, Finalizados, Valor Pipeline

**Fluxo completo:**
1. Criar orçamento: selecionar cliente, validade, adicionar produtos (inline table)
2. Avançar etapas: DRAFT → SENT → APPROVED
3. Finalizar pagamento (APPROVED → PAID): abre modal com forma de pagamento + parcelas
4. **Ao finalizar:**
   - Cria registro em `sales`
   - Copia itens para `sale_items`
   - Desconta estoque (`stock` + `stock_movements`)
   - Lança receita em `cash_entries`
   - Atualiza `budgets` como PAID
5. Enviar via WhatsApp (compõe mensagem formatada → n8n webhook ou WhatsApp Web)

**Tabelas:** `budgets`, `budget_items`, `sales`, `sale_items`, `stock`, `stock_movements`, `cash_entries`, `whatsapp_dispatches`

---

### 6.11 Vendas (`/vendas`)
**KPIs (mês atual):** Vendas, Receita, Ticket Médio, Via Orçamento

**Tipos de venda:**
- `FROM_BUDGET` — gerada ao finalizar orçamento
- `MANUAL` — "Venda no Balcão" registrada diretamente

**Drawer "Venda no Balcão":**
- Selecionar produtos (com quantidade e preço editáveis)
- Forma de pagamento + parcelas (crédito)
- Cliente (opcional) e data
- **Ao salvar:** desconta estoque + lança em `cash_entries`

**Tabelas:** `sales`, `sale_items`, `stock`, `stock_movements`, `cash_entries`

---

### 6.12 Estoque (`/estoque`)
**KPIs:** Total no Estoque, Itens com Baixo Estoque, Valor em Estoque, Movimentações/mês

**Abas:**
- **Itens / Insumos** — matérias-primas (tipo `ITEM`)
- **Produtos Acabados** — produtos finais (tipo `PRODUCT`)

**Status derivado:**
- `Normal` — qty > min_limit
- `Baixo` — 0 < qty < min_limit
- `Crítico` — qty ≤ 0

**Ações por item:**
- **Movimentar** → Drawer: tipo (entrada/saída), quantidade, observação
- **Editar** → Drawer: alterar `min_limit`
- **Excluir**

**Tabelas:** `stock`, `stock_movements`

---

### 6.13 Configurações (`/configuracoes`)
**Abas:**

1. **Empresa** — Razão Social, CNPJ, Endereço, Telefone, Email
2. **Tributação** — Regime tributário (Simples Nacional, Lucro Presumido, etc.), CNAE, alíquotas ISS/IRPJ/CSLL
3. **Equipe / Carga Horária** — horas/dia, dias/mês (usado no cálculo de custo-hora)
4. **WhatsApp** — Conectar via QR Code (integração com n8n), webhook URL, status de conexão

**Tabelas:** `tenants`, `tenant_settings`

---

## 7. Componentes Reutilizáveis

| Componente | Função |
|------------|--------|
| `Layout` | Shell com sidebar, header e título de página |
| `CardKPI` | Card de indicador com ícone, valor e variante de cor |
| `Months` | Navegador de mês anterior/próximo |
| `MonthIncomeExpenseChart` | Gráfico linhas receitas vs despesas |
| `CashierExpensePercentuals` | Gráfico pizza/barras de categorias de despesa |
| `SignInWithEmailPassword` | Formulário de login completo |
| `NewPaymentRevenueForm` | Formulário de lançamento no caixa |

---

## 8. Utilitários Principais

| Utility | Função |
|---------|--------|
| `getTenantId()` | Busca o `tenant_id` do usuário atual |
| `getMonetaryValue(v)` | Formata número como "1.234,56" |
| `currencyMask(str)` | Máscara de input monetário |
| `getCategoryName(cat)` | Traduz código de categoria para nome |
| `getFormattedDate(d)` | Formata datas BR |
| `createSmartPricePDF(data)` | Gera e faz download de PDF (Smart Price) |

---

## 9. Integrações Externas

| Integração | Como |
|------------|------|
| **WhatsApp** | Via n8n webhook (`n8n_webhook_url` em `tenant_settings`). Fallback: WhatsApp Web (`api.whatsapp.com`) |
| **ViaCEP** | Provável uso no onboarding para auto-preencher endereço por CEP |
| **PDF** | Geração client-side (utilitário `createSmartPricePDF`) |

---

## 10. Padrões de Desenvolvimento

### Padrão de Página
```tsx
function PageName() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const tenantId = await getTenantId()

  // Busca Supabase filtrada por tenant_id
  // KPIs derivados do state
  // Colunas da tabela Ant Design
  // Drawer para criar/editar
  // return <Layout title={PAGE_TITLES.X}> ... </Layout>
}
```

### Multi-tenant
Toda insert/select filtra por `tenant_id`. Nunca omitir esse filtro.

### Formulários
Sempre Ant Design `Form` com `form.validateFields()` antes de salvar.

### Deleções em cascata
Excluir manualmente registros dependentes antes de excluir o pai (Supabase não tem FK cascade automático configurado na maioria das tabelas).

---

## 11. Seções Planejadas (não implementadas)

As rotas abaixo existem nas constantes mas as páginas podem estar vazias/em desenvolvimento:

- `/fluxo-de-caixa` — Fluxo de Caixa (Phase 4)
- `/agenda` — Agenda (Phase 5)
- `/relatorios` — Relatórios (Phase 5)
- `/minha-conta` — Minha Conta
