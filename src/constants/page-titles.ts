export enum PAGE_TITLES {
  LANDING = 'Precifica Certo',
  LOGIN = 'Login',
  DASHBOARD = 'Dashboard',
  PRODUCTS = 'Produtos',
  NEW_PRODUCT = 'Criar produto',
  EDIT_PRODUCT = 'Editar produto',
  CATEGORIES = 'Categorias',
  CASHIER = 'Caixa',
  ITEMS = 'Itens',
  HUB = 'HUB',
  NOT_FOUND = 'Oops! 404',
  USERS = 'Usuários',
  RESET_PASSWORD = 'Recuperar Senha',
  INTRODUCTION = 'Introdução',
  SMART_PRICE = 'Smart Price',

  // ── Phase 1: Dados Core ──
  CLIENTS = 'Clientes',
  EMPLOYEES = 'Funcionários',
  SETTINGS = 'Configurações',
  CONNECTIVITY = 'Conectividade',

  // ── Phase 2: Produtos + Estoque ──
  SERVICES = 'Serviços',
  NEW_SERVICE = 'Novo Serviço',
  EDIT_SERVICE = 'Editar Serviço',
  STOCK = 'Estoque',
  PRODUCTION = 'Lançar produção',

  // ── Phase 3: Pipeline Comercial ──
  BUDGETS = 'Orçamentos',
  ORDERS = 'Pedidos',
  SALES = 'Vendas',
  SALES_REPORT = 'Relatório de Vendas',

  // ── Phase 4: Financeiro ──
  CASH_FLOW = 'Fluxo de Caixa',
  FINANCIAL_CONTROL = 'Controle Financeiro',
  DFC = 'Análise Financeira',
  COMMISSION = 'Comissão de Vendedor',

  // ── Phase 5: Operacional ──
  SCHEDULE = 'Agenda',
  REPORTS = 'Relatório Agenda',

  // ── Conta ──
  MY_ACCOUNT = 'Minha Conta',

  // ── Super Admin ──
  SUPER_ADMIN_LOGIN = 'Login Super Admin',
  SUPER_ADMIN_PANEL = 'Painel Super Admin',
  SUPER_ADMIN_TENANTS = 'Tenants',
  SUPER_ADMIN_USERS = 'Usuários (Global)',
  SUPER_ADMIN_BILLING = 'Pagamentos',
  SUPER_ADMIN_INVITES = 'Convites',
  SUPER_ADMIN_CADASTROS = 'Cadastros Pendentes',
  SUPER_ADMIN_PLANS_EXPIRING = 'Planos Expirando',
}

export const APP_TITLE = process.env.NEXT_PUBLIC_APPLICATION_TITLE ?? 'Precifica Certo'
