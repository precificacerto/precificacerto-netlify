import { useMemo } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { Drawer } from 'antd'
import {
  UnorderedListOutlined,
  AppstoreOutlined,
  ToolOutlined,
  DatabaseOutlined,
  TeamOutlined,
  IdcardOutlined,
  FileTextOutlined,
  ShoppingOutlined,
  BarChartOutlined,
  CalendarOutlined,
  FundOutlined,
  SettingOutlined,
  UserOutlined,
  CustomerServiceOutlined,
  LogoutOutlined,
  CrownOutlined,
  SafetyCertificateOutlined,
  BankOutlined,
  MailOutlined,
  ClockCircleOutlined,
  WalletOutlined,
  DollarOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/hooks/use-auth.hook'
import { usePermissions, MODULES, type ModuleKey } from '@/hooks/use-permissions.hook'
import { PERMISSIONS } from '@/shared/enums/permissions'

type Props = {
  open: boolean
  onClose: () => void
}

type Item = {
  key: string
  label: string
  href?: string
  icon: React.ReactNode
  section: string
  adminOnly?: boolean
  superAdminOnly?: boolean
  hideForRepresentative?: boolean
  hideForSuperAdmin?: boolean
  hideForRevenda?: boolean
  module?: ModuleKey
  onClick?: () => void
}

const MobileMoreDrawer = ({ open, onClose }: Props) => {
  const router = useRouter()
  const { logout, currentUser } = useAuth()
  const { isSuperAdmin, canView } = usePermissions()

  const isAdmin = !!currentUser?.permissions?.find((p) => p === PERMISSIONS.ADMIN)
  const isRepresentative = !!currentUser?.permissions?.find((p) => p === PERMISSIONS.REPRESENTATIVE)
  const isRevenda = currentUser?.calcType === 'RESALE'

  const handleSupport = () => {
    const url = `https://api.whatsapp.com/send?phone=555199114290&text=Ol%C3%A1%2C%20estou%20precisando%20de%20suporte%2C%20meu%20email%20%C3%A9%3A%20${currentUser?.email}`
    if (typeof window !== 'undefined') window.open(url, '_blank')
  }

  const items: Item[] = useMemo(() => ([
    // Cadastros
    { key: 'items', label: 'Itens', href: ROUTES.ITEMS, icon: <UnorderedListOutlined />, section: 'Cadastros', module: MODULES.ITEMS },
    { key: 'products', label: 'Produtos', href: ROUTES.PRODUCTS, icon: <AppstoreOutlined />, section: 'Cadastros', module: MODULES.PRODUCTS },
    { key: 'services', label: 'Serviços', href: ROUTES.SERVICES, icon: <ToolOutlined />, section: 'Cadastros', module: MODULES.SERVICES, hideForRevenda: true },
    { key: 'stock', label: 'Estoque', href: ROUTES.STOCK, icon: <DatabaseOutlined />, section: 'Cadastros', module: MODULES.STOCK },
    { key: 'clients', label: 'Clientes', href: ROUTES.CLIENTS, icon: <TeamOutlined />, section: 'Cadastros', module: MODULES.CUSTOMERS },
    { key: 'employees', label: 'Funcionários', href: ROUTES.EMPLOYEES, icon: <IdcardOutlined />, section: 'Cadastros', adminOnly: true, module: MODULES.EMPLOYEES },

    // Comercial
    { key: 'budgets', label: 'Orçamentos', href: ROUTES.BUDGETS, icon: <FileTextOutlined />, section: 'Comercial', module: MODULES.BUDGETS },
    { key: 'orders', label: 'Pedidos', href: ROUTES.ORDERS, icon: <ShoppingOutlined />, section: 'Comercial', module: MODULES.ORDERS },
    { key: 'sales-report', label: 'Relatório de Vendas', href: ROUTES.SALES_REPORT, icon: <BarChartOutlined />, section: 'Comercial', module: MODULES.SALES_REPORT },
    { key: 'recurrence', label: 'Recorrência', href: ROUTES.RECURRENCE, icon: <CalendarOutlined />, section: 'Comercial', module: MODULES.RECURRENCE },

    // Financeiro
    { key: 'cashier', label: 'Caixa', href: `/caixa/${dayjs().format('YYYY')}/${dayjs().format('MM')}`, icon: <WalletOutlined />, section: 'Financeiro', module: MODULES.CASH_FLOW },
    { key: 'cashflow-overview', label: 'Fluxo de Caixa', href: ROUTES.CASH_FLOW, icon: <DollarOutlined />, section: 'Financeiro', hideForRepresentative: true, module: MODULES.CASH_FLOW },
    { key: 'financial', label: 'Controle Financeiro', href: ROUTES.FINANCIAL_CONTROL, icon: <ShoppingOutlined />, section: 'Financeiro', module: MODULES.CASH_FLOW },
    { key: 'dfc', label: 'Análise Financeira', href: ROUTES.DFC, icon: <FundOutlined />, section: 'Financeiro', module: MODULES.DFC },
    { key: 'commission', label: 'Comissão de Vendedor', href: ROUTES.COMMISSION, icon: <IdcardOutlined />, section: 'Financeiro', module: MODULES.COMMISSION },

    // Operacional
    { key: 'schedule', label: 'Agenda', href: ROUTES.SCHEDULE, icon: <CalendarOutlined />, section: 'Operacional', module: MODULES.AGENDA },
    { key: 'reports', label: 'Relatório Agenda', href: ROUTES.REPORTS, icon: <BarChartOutlined />, section: 'Operacional', module: MODULES.REPORTS },
    { key: 'connectivity', label: 'Conectividade', href: ROUTES.CONNECTIVITY, icon: <SettingOutlined />, section: 'Operacional', module: MODULES.CONNECTIVITY },
    { key: 'users', label: 'Usuários', href: ROUTES.USUARIOS, icon: <TeamOutlined />, section: 'Operacional', adminOnly: true, hideForSuperAdmin: true },

    // Super Admin
    { key: 'super-admin', label: 'Painel Super Admin', href: ROUTES.SUPER_ADMIN_PANEL, icon: <SafetyCertificateOutlined />, section: 'Super Admin', superAdminOnly: true },
    { key: 'super-tenants', label: 'Tenants', href: ROUTES.SUPER_ADMIN_TENANTS, icon: <TeamOutlined />, section: 'Super Admin', superAdminOnly: true },
    { key: 'super-users', label: 'Usuários', href: ROUTES.SUPER_ADMIN_USERS, icon: <UserOutlined />, section: 'Super Admin', superAdminOnly: true },
    { key: 'super-billing', label: 'Pagamentos', href: ROUTES.SUPER_ADMIN_BILLING, icon: <BankOutlined />, section: 'Super Admin', superAdminOnly: true },
    { key: 'super-invites', label: 'Convites', href: ROUTES.SUPER_ADMIN_INVITES, icon: <MailOutlined />, section: 'Super Admin', superAdminOnly: true },
    { key: 'super-cadastros', label: 'Cadastros', href: ROUTES.SUPER_ADMIN_CADASTROS, icon: <ClockCircleOutlined />, section: 'Super Admin', superAdminOnly: true },
    { key: 'super-plans', label: 'Planos Expirando', href: ROUTES.SUPER_ADMIN_PLANS_EXPIRING, icon: <ClockCircleOutlined />, section: 'Super Admin', superAdminOnly: true },

    // Conta
    { key: 'my-account', label: 'Minha Conta', href: ROUTES.MY_ACCOUNT, icon: <UserOutlined />, section: 'Conta' },
    { key: 'settings', label: 'Configurações', href: ROUTES.SETTINGS, icon: <SettingOutlined />, section: 'Conta', adminOnly: true, hideForSuperAdmin: true },
    { key: 'plans', label: 'Planos', href: ROUTES.PLANS, icon: <CrownOutlined />, section: 'Conta', adminOnly: true, hideForSuperAdmin: true },
    { key: 'support', label: 'Suporte', icon: <CustomerServiceOutlined />, section: 'Conta', hideForSuperAdmin: true, onClick: handleSupport },
    { key: 'logout', label: 'Sair', icon: <LogoutOutlined />, section: 'Conta', onClick: logout },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ]), [currentUser])

  const visibleItems = items.filter((item) => {
    if (item.adminOnly && !isAdmin) return false
    if (item.superAdminOnly && !isSuperAdmin) return false
    if (item.hideForRepresentative && isRepresentative) return false
    if (item.hideForSuperAdmin && isSuperAdmin) return false
    if (item.hideForRevenda && isRevenda) return false
    if (item.module && !canView(item.module)) return false
    return true
  })

  const sectionOrder = ['Cadastros', 'Comercial', 'Financeiro', 'Operacional', 'Super Admin', 'Conta']
  const grouped = sectionOrder
    .map((section) => ({ section, list: visibleItems.filter((i) => i.section === section) }))
    .filter((g) => g.list.length > 0)

  const handleItemClick = (item: Item) => {
    onClose()
    if (item.onClick) item.onClick()
    else if (item.href) router.push(item.href)
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      placement="bottom"
      height="85vh"
      title="Menu"
      className="pc-mobile-more-drawer"
      styles={{ body: { padding: 0 } }}
    >
      <div className="pc-mobile-more-drawer-content">
        {grouped.map((group) => (
          <div key={group.section} className="pc-mobile-more-section">
            <h3 className="pc-mobile-more-section-title">{group.section}</h3>
            <div className="pc-mobile-more-grid">
              {group.list.map((item) => {
                const isLogout = item.key === 'logout'
                const className = `pc-mobile-more-item${isLogout ? ' danger' : ''}`
                if (item.href && !item.onClick) {
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      className={className}
                      onClick={() => onClose()}
                    >
                      <span className="pc-mobile-more-item-icon">{item.icon}</span>
                      <span className="pc-mobile-more-item-label">{item.label}</span>
                    </Link>
                  )
                }
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={className}
                    onClick={() => handleItemClick(item)}
                  >
                    <span className="pc-mobile-more-item-icon">{item.icon}</span>
                    <span className="pc-mobile-more-item-label">{item.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </Drawer>
  )
}

export { MobileMoreDrawer }
