import { NextRequest, NextResponse } from 'next/server'

const MOBILE_UA = /iPhone|iPod|Android.+Mobile|IEMobile|BlackBerry|Opera Mini|webOS/i
const TABLET_UA = /iPad|Android(?!.*Mobile)|Tablet|PlayBook|Silk/i

export type PcDevice = 'mobile' | 'tablet' | 'desktop'

const detectDevice = (userAgent: string): PcDevice => {
  if (!userAgent) return 'desktop'
  if (TABLET_UA.test(userAgent)) return 'tablet'
  if (MOBILE_UA.test(userAgent)) return 'mobile'
  return 'desktop'
}

export function middleware(request: NextRequest) {
  const userAgent = request.headers.get('user-agent') || ''
  const device = detectDevice(userAgent)

  const response = NextResponse.next()
  response.headers.set('x-pc-device', device)
  response.cookies.set('pc-device', device, {
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
  })
  return response
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|assets|.*\\..*).*)'],
}
