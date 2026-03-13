export enum ROUTES {
  LOGIN = '/login',
  DASHBOARD = '/',
  CASHIER = '/caixa',
  DRE = '/dre',
  CASHIER_SUMMARY = '/dre?tab=resumo-caixa',
  PRODUCTS = '/produtos',
  NEW_PRODUCT = '/produtos/criar',
  ITEMS = '/itens',
  CATEGORIES = '/categorias',
  USUARIOS = '/admin/usuarios',
  RESET_PASSWORD = '/reset-password',
  SET_PASSWORD = '/criar-senha',
  ONBOARDING = '/onboarding',
  ONBOARDING_EXPENSES = '/onboarding-expenses',
  BILLING = '/assinar',
  ACCEPT_INVITE = '/aceitar-convite',
  INTRODUCTION = '/introducao',
  SMART_PRICE = '/smart-price',

  // ── Phase 1: Dados Core ──
  CLIENTS = '/clientes',
  EMPLOYEES = '/funcionarios',
  EMPLOYEE_PERMISSIONS = '/funcionarios/{id}/permissoes',
  SETTINGS = '/configuracoes',
  CONNECTIVITY = '/conectividade',

  // ── Phase 2: Produtos + Estoque ──
  SERVICES = '/servicos',
  NEW_SERVICE = '/servicos/criar',
  STOCK = '/estoque',
  PRODUCTION = '/producao',

  // ── Phase 3: Pipeline Comercial ──
  BUDGETS = '/orcamentos',
  SALES = '/vendas',

  // ── Phase 4: Financeiro ──
  CASH_FLOW = '/fluxo-de-caixa',

  // ── Phase 5: Operacional ──
  SCHEDULE = '/agenda',
  REPORTS = '/relatorios',

  // ── Conta ──
  MY_ACCOUNT = '/minha-conta',
  PLANS = '/planos',

  // ── Super Admin ──
  SUPER_ADMIN_LOGIN = '/super-admin/login',
  SUPER_ADMIN_PANEL = '/super-admin',
  SUPER_ADMIN_TENANTS = '/super-admin/tenants',
  SUPER_ADMIN_USERS = '/super-admin/usuarios',
  SUPER_ADMIN_BILLING = '/super-admin/pagamentos',
  SUPER_ADMIN_INVITES = '/super-admin/convites',
  SUPER_ADMIN_CADASTROS = '/super-admin/cadastros',
  SUPER_ADMIN_PLANS_EXPIRING = '/super-admin/planos-expirando',

  // Cadastro pago (Stripe) — sucesso após pagamento
  CADASTRO_SUCESSO = '/cadastro/sucesso',
}
