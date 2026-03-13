import { getDefaultRouteForUser } from '@/lib/default-route-by-role'
import { ROUTES } from '@/constants/routes'
import type { LoggedUser } from '@/types/logged-user.type'

describe('getDefaultRouteForUser', () => {
  it('retorna DASHBOARD quando user é null', () => {
    expect(getDefaultRouteForUser(null)).toBe(ROUTES.DASHBOARD)
  })

  it('retorna SUPER_ADMIN_PANEL quando user é super_admin', () => {
    const user = { is_super_admin: true } as LoggedUser
    expect(getDefaultRouteForUser(user)).toBe(ROUTES.SUPER_ADMIN_PANEL)
  })

  it('retorna DASHBOARD quando user é admin (não super_admin)', () => {
    const user = { is_super_admin: false, role: 'admin' } as LoggedUser
    expect(getDefaultRouteForUser(user)).toBe(ROUTES.DASHBOARD)
  })

  it('retorna DASHBOARD quando user é user', () => {
    const user = { is_super_admin: false, role: 'user' } as LoggedUser
    expect(getDefaultRouteForUser(user)).toBe(ROUTES.DASHBOARD)
  })

  it('retorna DASHBOARD quando is_super_admin é undefined', () => {
    const user = { role: 'admin' } as LoggedUser
    expect(getDefaultRouteForUser(user)).toBe(ROUTES.DASHBOARD)
  })
})
