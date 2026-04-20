/**
 * useDeviceInfo — SSR-safe device detection hook
 *
 * Provides information that CSS media queries alone cannot (touch input,
 * iOS notch, real viewport height with virtual keyboard open, orientation).
 * For pure layout decisions, prefer CSS media queries or AntD `Grid.useBreakpoint()`.
 *
 * Breakpoints aligned with Tailwind:
 *   mobile:  0–639px
 *   tablet:  640–1023px
 *   desktop: >=1024px
 */

import { useEffect, useState } from 'react'

export type DeviceType = 'mobile' | 'tablet' | 'desktop'
export type Orientation = 'portrait' | 'landscape'

export interface DeviceInfo {
  deviceType: DeviceType
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean
  isTouchDevice: boolean
  hasNotch: boolean
  orientation: Orientation
  /** Real viewport height (uses visualViewport when available — shrinks with virtual keyboard on iOS) */
  viewportHeight: number
  viewportWidth: number
}

const MOBILE_MAX = 639
const TABLET_MAX = 1023

const DEFAULT_INFO: DeviceInfo = {
  deviceType: 'desktop',
  isMobile: false,
  isTablet: false,
  isDesktop: true,
  isTouchDevice: false,
  hasNotch: false,
  orientation: 'landscape',
  viewportHeight: 0,
  viewportWidth: 0,
}

const deriveDeviceType = (width: number): DeviceType => {
  if (width <= MOBILE_MAX) return 'mobile'
  if (width <= TABLET_MAX) return 'tablet'
  return 'desktop'
}

const detectTouchDevice = (): boolean => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(hover: none) and (pointer: coarse)').matches
}

const detectNotch = (): boolean => {
  if (typeof window === 'undefined' || typeof CSS === 'undefined' || typeof CSS.supports !== 'function') {
    return false
  }
  try {
    if (!CSS.supports('padding-top: env(safe-area-inset-top)')) return false
    const probe = document.createElement('div')
    probe.style.cssText = 'position:fixed;top:0;padding-top:env(safe-area-inset-top);visibility:hidden;pointer-events:none;'
    document.body.appendChild(probe)
    const inset = parseInt(getComputedStyle(probe).paddingTop, 10)
    document.body.removeChild(probe)
    return inset > 0
  } catch {
    return false
  }
}

const getOrientation = (): Orientation => {
  if (typeof window === 'undefined') return 'landscape'
  return window.innerWidth > window.innerHeight ? 'landscape' : 'portrait'
}

const getViewportHeight = (): number => {
  if (typeof window === 'undefined') return 0
  if (window.visualViewport) return Math.round(window.visualViewport.height)
  return window.innerHeight
}

const readCurrentInfo = (): DeviceInfo => {
  if (typeof window === 'undefined') return DEFAULT_INFO
  const width = window.innerWidth
  const type = deriveDeviceType(width)
  return {
    deviceType: type,
    isMobile: type === 'mobile',
    isTablet: type === 'tablet',
    isDesktop: type === 'desktop',
    isTouchDevice: detectTouchDevice(),
    hasNotch: detectNotch(),
    orientation: getOrientation(),
    viewportHeight: getViewportHeight(),
    viewportWidth: width,
  }
}

export const useDeviceInfo = (): DeviceInfo => {
  const [info, setInfo] = useState<DeviceInfo>(DEFAULT_INFO)

  useEffect(() => {
    if (typeof window === 'undefined') return

    let frame = 0
    const update = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setInfo(readCurrentInfo()))
    }

    update()

    window.addEventListener('resize', update)
    window.addEventListener('orientationchange', update)
    const visualViewport = window.visualViewport
    if (visualViewport) visualViewport.addEventListener('resize', update)

    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener('resize', update)
      window.removeEventListener('orientationchange', update)
      if (visualViewport) visualViewport.removeEventListener('resize', update)
    }
  }, [])

  return info
}

export default useDeviceInfo
