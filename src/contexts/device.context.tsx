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

const readCookieDevice = (): DeviceType | null => {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(/(?:^|;\s*)pc-device=(mobile|tablet|desktop)/)
  return (match?.[1] as DeviceType) ?? null
}

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
    const cookie = readCookieDevice()
    const width = readWidthDevice()
    const resolved: DeviceType = cookie === 'desktop' && width !== 'desktop' ? width : (cookie ?? width)
    if (resolved !== device) setDevice(resolved)

    const onResize = () => {
      const next = readWidthDevice()
      const c = readCookieDevice()
      if (c && c !== 'desktop') return
      setDevice(next)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
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
