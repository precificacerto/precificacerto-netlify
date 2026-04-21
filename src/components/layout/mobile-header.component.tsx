import { ReactNode } from 'react'
import { useRouter } from 'next/router'
import { ArrowLeftOutlined, MoreOutlined } from '@ant-design/icons'
import { Dropdown, MenuProps } from 'antd'

type Props = {
  title?: string
  subtitle?: string
  showBack?: boolean
  onBack?: () => void
  primaryAction?: ReactNode
  menuItems?: MenuProps['items']
}

const MobileHeader = ({ title, subtitle, showBack, onBack, primaryAction, menuItems }: Props) => {
  const router = useRouter()

  const handleBack = () => {
    if (onBack) return onBack()
    if (typeof window !== 'undefined' && window.history.length > 1) router.back()
    else router.push('/')
  }

  return (
    <header className="pc-mobile-header">
      <div className="pc-mobile-header-left">
        {showBack && (
          <button
            type="button"
            className="pc-mobile-header-icon-btn"
            onClick={handleBack}
            aria-label="Voltar"
          >
            <ArrowLeftOutlined />
          </button>
        )}
        <div className="pc-mobile-header-titles">
          {title && <h1 className="pc-mobile-header-title">{title}</h1>}
          {subtitle && <p className="pc-mobile-header-subtitle">{subtitle}</p>}
        </div>
      </div>
      <div className="pc-mobile-header-actions">
        {primaryAction}
        {menuItems && menuItems.length > 0 && (
          <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
            <button
              type="button"
              className="pc-mobile-header-icon-btn"
              aria-label="Mais ações"
            >
              <MoreOutlined />
            </button>
          </Dropdown>
        )}
      </div>
    </header>
  )
}

export { MobileHeader }
