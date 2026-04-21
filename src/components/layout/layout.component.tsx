import React, { ReactNode, useEffect, useState, useCallback, lazy, Suspense } from 'react'
import Head from 'next/head'
import { APP_TITLE } from '@/constants/page-titles'
import { Nav } from './nav.component'
import { useAuth } from '@/hooks/use-auth.hook'
import { PERMISSIONS } from '@/shared/enums/permissions'
import { TrialBanner } from '../trial-banner.component'
import { MenuOutlined } from '@ant-design/icons'
import { useDevice } from '@/contexts/device.context'
import { MobileShell } from './mobile-shell.component'
import type { MenuProps } from 'antd'

const ChooseCalcModal = lazy(() =>
  import('../choose-calc-modal.component').then(m => ({ default: m.ChooseCalcModal }))
)

type Props = {
  children: ReactNode
  showAside?: boolean
  title?: string
  tabTitle?: string
  subtitle?: string
  mobileShowBack?: boolean
  mobilePrimaryAction?: ReactNode
  mobileMenuItems?: MenuProps['items']
  mobileFab?: ReactNode
}

const Layout = ({
  children,
  showAside = true,
  title,
  tabTitle,
  subtitle,
  mobileShowBack,
  mobilePrimaryAction,
  mobileMenuItems,
  mobileFab,
}: Props) => {
  const [showCalcModal, setShowCalcModal] = useState<boolean>(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { currentUser } = useAuth()
  const { isMobile, isTablet } = useDevice()
  const useMobileShell = isMobile || isTablet

  const closeSidebar = useCallback(() => setSidebarOpen(false), [])

  useEffect(() => {
    if (
      !currentUser ||
      currentUser.is_super_admin ||
      currentUser.permissions.find((permission) => permission === PERMISSIONS.REPRESENTATIVE)
    )
      return

    if (
      currentUser.calcType === undefined ||
      currentUser.monthlyWorkloadInMinutes === undefined ||
      currentUser.unitMeasure === undefined ||
      currentUser.numProductiveSectorEmployee === undefined ||
      currentUser.numComercialSectorEmployee === undefined ||
      currentUser.numAdministrativeSectorEmployee === undefined
    ) {
      setShowCalcModal(true)
    } else {
      setShowCalcModal(false)
    }
  }, [currentUser])

  const metaDescription = subtitle || 'Precifica Certo - Plataforma de gestão e precificação inteligente para seu negócio'

  const head = (
    <Head>
      <title>{`${title || tabTitle} | ${APP_TITLE}`}</title>
      <meta name="description" content={metaDescription} />
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <link rel="icon" href="/favicon.ico" />
    </Head>
  )

  const calcModal = showCalcModal && (
    <Suspense fallback={null}>
      <ChooseCalcModal open={showCalcModal} handleShowModal={(value) => setShowCalcModal(value)} />
    </Suspense>
  )

  if (useMobileShell && showAside) {
    return (
      <>
        {head}
        <TrialBanner />
        <MobileShell
          title={title}
          subtitle={subtitle}
          showBack={mobileShowBack}
          primaryAction={mobilePrimaryAction}
          menuItems={mobileMenuItems}
          fab={mobileFab}
        >
          {children}
        </MobileShell>
        {calcModal}
      </>
    )
  }

  return (
    <>
      {head}

      <div className="app-layout">
        {/* Sidebar overlay (mobile) */}
        {showAside && (
          <div
            className={`sidebar-overlay${sidebarOpen ? ' active' : ''}`}
            onClick={closeSidebar}
          />
        )}

        {/* Sidebar */}
        {showAside && (
          <div className={sidebarOpen ? 'app-sidebar-wrapper open' : 'app-sidebar-wrapper'}>
            <Nav />
          </div>
        )}

        {/* Main Content */}
        <div className="app-main">
          <TrialBanner />
          <div className="app-content">
            {/* Mobile menu button */}
            {showAside && (
              <button
                className="mobile-menu-btn"
                onClick={() => setSidebarOpen(true)}
                aria-label="Abrir menu"
              >
                <MenuOutlined style={{ fontSize: 22 }} />
              </button>
            )}

            {/* Page Header */}
            {title && (
              <div className="page-header">
                <div className="page-header-row">
                  <div>
                    <h1>{title}</h1>
                    {subtitle && <p className="page-header-subtitle">{subtitle}</p>}
                  </div>
                </div>
              </div>
            )}

            {/* Page Content */}
            <main id="main-content">{children}</main>
          </div>
        </div>
      </div>

      {calcModal}
    </>
  )
}

export { Layout }
