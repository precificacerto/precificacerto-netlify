import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

export type DeviceType = 'mobile' | 'tablet' | 'desktop'

export interface DeviceContextValue {
  device: DeviceType
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean
}

const DeviceContext = createContext<DeviceContextValue>({
  device: 'desktop',
  isMobile: false,
  isTablet: false,
  isDesktop: true,
})

const readWidthDevice = (): DeviceType => {
  if (typeof window === 'undefined') return 'desktop'
  const w = window.innerWidth
  if (w <= 639) return 'mobile'
  if (w <= 1023) return 'tablet'
  return 'desktop'
}

export function DeviceProvider({ initialDevice, children }: { initialDevice: DeviceType; children: ReactNode }) {
  const [device, setDevice] = useState<DeviceType>(initialDevice)

  useEffect(() => {
    // Fonte de verdade no CLIENTE = largura real da viewport (mobile-first). O
    // `initialDevice` (SSR, derivado do user-agent no middleware) serve apenas para o
    // primeiro paint e evita flash de layout; a partir da hidratacao a LARGURA manda.
    // Antes, o cookie/user-agent podia TRAVAR a tela em 'tablet'/'desktop' mesmo num
    // aparelho estreito — Relatorio PO 05/08 (item 1): navegadores in-app Android sem
    // "Mobile" no UA (WhatsApp/Instagram/WebView) eram classificados como 'tablet', e
    // so a tela de Produtos renderizava a <Table> desktop truncada em vez da lista
    // compacta de "Itens do produto". Alinha useDevice com o resto do app mobile.
    const apply = () => setDevice(readWidthDevice())
    apply()
    window.addEventListener('resize', apply)
    window.addEventListener('orientationchange', apply)
    return () => {
      window.removeEventListener('resize', apply)
      window.removeEventListener('orientationchange', apply)
    }
  }, [])

  const value: DeviceContextValue = {
    device,
    isMobile: device === 'mobile',
    isTablet: device === 'tablet',
    isDesktop: device === 'desktop',
  }

  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>
}

export const useDevice = (): DeviceContextValue => useContext(DeviceContext)
