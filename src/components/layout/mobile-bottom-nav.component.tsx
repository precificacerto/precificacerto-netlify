import Link from 'next/link'
import { useRouter } from 'next/router'
import {
  FileTextOutlined,
  ShoppingOutlined,
  CalendarOutlined,
  AppstoreOutlined,
} from '@ant-design/icons'
import { ROUTES } from '@/constants/routes'

type Props = {
  onOpenMore: () => void
}

const MobileBottomNav = ({ onOpenMore }: Props) => {
  const router = useRouter()

  const pathStartsWith = (prefix: string) => router.pathname === prefix || router.pathname.startsWith(prefix + '/')
  const isBudgets = pathStartsWith('/orcamentos')
  const isSales = pathStartsWith('/vendas')
  const isSchedule = pathStartsWith('/agenda')

  const itemClass = (active: boolean) =>
    `pc-mobile-bottom-nav-item${active ? ' active' : ''}`

  return (
    <nav className="pc-mobile-bottom-nav" aria-label="Navegação principal">
      <Link
        href={ROUTES.BUDGETS}
        className={itemClass(isBudgets)}
        aria-label="Orçamentos"
        aria-current={isBudgets ? 'page' : undefined}
      >
        <FileTextOutlined />
        <span>Orçamentos</span>
      </Link>
      <Link
        href={ROUTES.SALES}
        className={itemClass(isSales)}
        aria-label="Vendas"
        aria-current={isSales ? 'page' : undefined}
      >
        <ShoppingOutlined />
        <span>Vendas</span>
      </Link>
      <Link
        href={ROUTES.SCHEDULE}
        className={itemClass(isSchedule)}
        aria-label="Agenda"
        aria-current={isSchedule ? 'page' : undefined}
      >
        <CalendarOutlined />
        <span>Agenda</span>
      </Link>
      <button
        type="button"
        className="pc-mobile-bottom-nav-item"
        onClick={onOpenMore}
        aria-label="Mais opções"
      >
        <AppstoreOutlined />
        <span>Mais</span>
      </button>
    </nav>
  )
}

export { MobileBottomNav }
