import { getDefaultRouteForUser } from '@/lib/default-route-by-role'
import { ROUTES } from '@/constants/routes'
import { CALC_TYPE_ENUM } from '@/shared/enums/calc-type'
import type { LoggedUser } from '@/types/logged-user.type'

describe('getDefaultRouteForUser', () => {
  it('retorna DASHBOARD quando user é null', () => {
    expect(getDefaultRouteForUser(null)).toBe(ROUTES.DASHBOARD)
  })

  it('retorna SUPER_ADMIN_PANEL quando user é super_admin', () => {
    const user = { is_super_admin: true } as LoggedUser
    expect(getDefaultRouteForUser(user)).toBe(ROUTES.SUPER_ADMIN_PANEL)
  })

  it('retorna SCHEDULE quando calcType é SERVICE (prestador de serviço)', () => {
    const user = { is_super_admin: false, calcType: CALC_TYPE_ENUM.SERVICE } as LoggedUser
    expect(getDefaultRouteForUser(user)).toBe(ROUTES.SCHEDULE)
  })

  it('retorna DASHBOARD quando user é admin (não super_admin) e calcType=RESALE', () => {
    const user = { is_super_admin: false, role: 'admin', calcType: CALC_TYPE_ENUM.RESALE } as LoggedUser
    expect(getDefaultRouteForUser(user)).toBe(ROUTES.DASHBOARD)
  })

  it('retorna DASHBOARD quando user é user e calcType=INDUSTRIALIZATION', () => {
    const user = { is_super_admin: false, role: 'user', calcType: CALC_TYPE_ENUM.INDUSTRIALIZATION } as LoggedUser
    expect(getDefaultRouteForUser(user)).toBe(ROUTES.DASHBOARD)
  })

  it('retorna DASHBOARD quando is_super_admin é undefined e sem calcType', () => {
    const user = { role: 'admin' } as LoggedUser
    expect(getDefaultRouteForUser(user)).toBe(ROUTES.DASHBOARD)
  })
})
