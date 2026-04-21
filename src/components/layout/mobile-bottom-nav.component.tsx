import { useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import {
  HomeOutlined,
  WalletOutlined,
  ShoppingOutlined,
  FundOutlined,
  AppstoreOutlined,
} from '@ant-design/icons'
import { ROUTES } from '@/constants/routes'
import { monthObjects } from '@/constants/month'

type Props = {
  onOpenMore: () => void
}

const MobileBottomNav = ({ onOpenMore }: Props) => {
  const router = useRouter()

  const cashierHref = useMemo(() => {
    const now = new Date()
    const year = now.getFullYear()
    const month = Object.values(monthObjects).find((m) => m.number === now.getMonth())?.short
    return `${ROUTES.CASHIER}/${year}/${month}`
  }, [])

  const pathStartsWith = (prefix: string) => router.pathname === prefix || router.pathname.startsWith(prefix + '/')
  const isHome = router.pathname === '/'
  const isCashier = pathStartsWith('/caixa')
  const isSales = pathStartsWith('/vendas')
  const isCashFlow = pathStartsWith('/fluxo-de-caixa')

  const itemClass = (active: boolean) =>
    `pc-mobile-bottom-nav-item${active ? ' active' : ''}`

  return (
    <nav className="pc-mobile-bottom-nav" aria-label="Navegação principal">
      <Link
        href={ROUTES.DASHBOARD}
        className={itemClass(isHome)}
        aria-label="Home"
        aria-current={isHome ? 'page' : undefined}
      >
        <HomeOutlined />
        <span>Home</span>
      </Link>
      <Link
        href={cashierHref}
        className={itemClass(isCashier)}
        aria-label="Caixa"
        aria-current={isCashier ? 'page' : undefined}
      >
        <WalletOutlined />
        <span>Caixa</span>
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
        href={ROUTES.CASH_FLOW}
        className={itemClass(isCashFlow)}
        aria-label="Fluxo de Caixa"
        aria-current={isCashFlow ? 'page' : undefined}
      >
        <FundOutlined />
        <span>Fluxo</span>
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
