import { ReactNode, useState } from 'react'
import { MenuProps } from 'antd'
import { MobileHeader } from './mobile-header.component'
import { MobileBottomNav } from './mobile-bottom-nav.component'
import { MobileMoreDrawer } from './mobile-more-drawer.component'

type Props = {
  children: ReactNode
  title?: string
  subtitle?: string
  showBack?: boolean
  onBack?: () => void
  primaryAction?: ReactNode
  menuItems?: MenuProps['items']
  fab?: ReactNode
}

const MobileShell = ({
  children,
  title,
  subtitle,
  showBack,
  onBack,
  primaryAction,
  menuItems,
  fab,
}: Props) => {
  const [moreOpen, setMoreOpen] = useState(false)

  return (
    <div className="pc-mobile-shell">
      <MobileHeader
        title={title}
        subtitle={subtitle}
        showBack={showBack}
        onBack={onBack}
        primaryAction={primaryAction}
        menuItems={menuItems}
      />
      <main className="pc-mobile-shell-content" id="main-content">
        {children}
      </main>
      {fab && <div className="pc-mobile-fab-slot">{fab}</div>}
      <MobileBottomNav onOpenMore={() => setMoreOpen(true)} />
      <MobileMoreDrawer open={moreOpen} onClose={() => setMoreOpen(false)} />
    </div>
  )
}

export { MobileShell }
