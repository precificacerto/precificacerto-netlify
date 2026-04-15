import React, { useState, useEffect, useRef, createContext, ReactNode } from 'react'
import { supabase } from '@/supabase/client'
import { useRouter } from 'next/router'
import { LoggedUser } from '@/types/logged-user.type'
import { Session } from '@supabase/supabase-js'
import { clearDashboardCache } from '@/utils/dashboard-cache'
import { clearSessionCache } from '@/lib/swr-cache-provider'
import { getTenantId } from '@/utils/get-tenant-id'

interface AuthContextType {
  currentUser: LoggedUser | null
  /** tenant_id do usuário ou fallback quando o perfil completo ainda não carregou (para listas carregarem) */
  tenantId: string | null
  loading: boolean
  emailConfirmed: boolean
  login: (auth: { email: string; password: string }) => Promise<any>
  signup: (data: { email: string; password: string; name: string }) => Promise<any>
  logout: () => Promise<void>
  setCurrentUser: (user: LoggedUser) => void
  refreshUser: () => Promise<LoggedUser | null>
}

export const tokenName = 'token'

/** Set httpOnly cookie via server endpoint */
async function setSessionCookie(accessToken: string): Promise<void> {
  try {
    await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: accessToken }),
    })
  } catch {
    // silent — cookie set is best-effort
  }
}

/** Clear httpOnly cookie via server endpoint */
async function clearSessionCookie(): Promise<void> {
  try {
    await fetch('/api/auth/session', { method: 'DELETE' })
  } catch {
    // silent
  }
}

export const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  tenantId: null,
  loading: true,
  emailConfirmed: false,
  setCurrentUser: () => null,
  login: async () => null,
  signup: async () => null,
  logout: async () => {},
  refreshUser: async () => null,
})

const PROFILE_CACHE_PREFIX = 'pc-user-profile-'

function getCachedProfile(userId: string): LoggedUser | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(`${PROFILE_CACHE_PREFIX}${userId}`)
    if (!raw) return null
    return JSON.parse(raw) as LoggedUser
  } catch {
    return null
  }
}

function setCachedProfile(userId: string, profile: LoggedUser): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(`${PROFILE_CACHE_PREFIX}${userId}`, JSON.stringify(profile))
  } catch {
    // quota exceeded
  }
}

function clearCachedProfiles(): void {
  if (typeof window === 'undefined') return
  try {
    const keys: string[] = []
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i)
      if (k?.startsWith(PROFILE_CACHE_PREFIX)) keys.push(k)
    }
    keys.forEach(k => sessionStorage.removeItem(k))
  } catch {
    // ignore
  }
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000
}

function normalizeAnexo(raw: string): string {
  if (!raw) return 'I'
  return raw.replace(/^ANEXO_/i, '')
}

function decimalToPercent(val: number): number {
  if (val > 0 && val < 1) return round4(val * 100)
  return val
}

/**
 * Approximate tax rate for quick display in the auth context (navbar, dashboard summary).
 *
 * IMPORTANT — INTENTIONAL SIMPLIFICATION:
 * This function uses hardcoded PIS/COFINS values and fixed IRPJ/CSLL presumption rates
 * (COMERCIO: 8% IRPJ, 12% CSLL) for ALL Lucro Presumido/Real activity types.
 * It does NOT apply the ICMS "por dentro" base adjustment to PIS/COFINS.
 *
 * The precise, activity-aware calculation lives in `src/utils/calc-tax-preview.ts`
 * (fetchTaxPreview), which reads `lucro_presumido_rates` from the database and
 * applies proper ICMS base adjustments. That function should be used for pricing
 * and tax preview screens.
 *
 * LP cumulativo: PIS 0.65% + COFINS 3.00% = 3.65%
 * LR não-cumulativo: PIS 1.65% + COFINS 7.60% = 9.25%
 * IRPJ: 8% presunção × 15% alíquota = 1.20% (hardcoded, COMERCIO/INDUSTRIA)
 * CSLL: 12% presunção × 9% alíquota = 1.08% (hardcoded, COMERCIO/INDUSTRIA)
 */
async function computeTaxableRegimeValue(settings: any): Promise<number> {
  if (!settings) return 0
  const regime = settings.tax_regime || 'SIMPLES_NACIONAL'

  if (regime === 'MEI') return 0

  if (regime === 'SIMPLES_NACIONAL') {
    const anexo = normalizeAnexo(settings.simples_anexo || '')
    const revenue12m = Number(settings.simples_revenue_12m) || 0

    const { data: brackets } = await supabase
      .from('simples_nacional_brackets')
      .select('nominal_rate, deduction, revenue_min, revenue_max')
      .eq('anexo', anexo)
      .order('bracket_order', { ascending: true })

    if (brackets && brackets.length > 0) {
      let bracket = brackets[0]
      for (const b of brackets) {
        if (revenue12m >= Number(b.revenue_min) && revenue12m <= Number(b.revenue_max)) {
          bracket = b
          break
        }
      }
      const nominalRate = Number(bracket.nominal_rate)
      const deduction = Number(bracket.deduction)
      const effectiveRate = revenue12m > 0
        ? (revenue12m * nominalRate - deduction) / revenue12m
        : nominalRate
      return round4(effectiveRate * 100)
    }
    return 0
  }

  if (regime === 'LUCRO_PRESUMIDO_RET') {
    // ret_rate + iss_municipality_rate (ambos decimal 0-1). Retorna em porcentagem (0-100).
    const retRate = Number(settings.ret_rate) || 0.04
    const retIssSeparate = settings.ret_iss_separate !== false // default true
    const issRate = retIssSeparate ? (Number(settings.iss_municipality_rate) || 0) : 0
    return round4((retRate + issRate) * 100)
  }

  if (regime === 'SIMPLES_HIBRIDO') {
    // Simples Híbrido espelha Lucro Real: PIS/COFINS 9,25% + ICMS + ISS + IRPJ 15% + CSLL 9%
    // (simplificação para navbar/dashboard; calc-tax-preview.ts faz o cálculo preciso)
    const calcType = settings.calc_type || 'INDUSTRIALIZACAO'
    const originState = settings.state_code || 'SP'

    const { data: statesData } = await supabase
      .from('brazilian_states')
      .select('code, icms_internal_rate')
      .eq('code', originState)
      .maybeSingle()

    const icmsInternalRate = decimalToPercent(Number(statesData?.icms_internal_rate) || 0.18)

    let total = 0
    total += 1.65 + 7.60 // PIS 1,65% + COFINS 7,60% (não-cumulativo)

    if (calcType !== 'SERVICO' && settings.icms_contribuinte) {
      total += icmsInternalRate
    }
    if (calcType === 'SERVICO') {
      total += decimalToPercent(Number(settings.iss_municipality_rate) || 0.05)
    }

    // IRPJ 15% + CSLL 9% sobre lucro projetado (presunção COMERCIO/INDUSTRIA como referência)
    total += round4(8 / 100 * 15) + round4(12 / 100 * 9) // 1,20% + 1,08% = 2,28%

    return round4(total)
  }

  if (regime === 'LUCRO_PRESUMIDO' || regime === 'LUCRO_REAL') {
    const calcType = settings.calc_type || 'INDUSTRIALIZACAO'
    const originState = settings.state_code || 'SP'

    const { data: statesData } = await supabase
      .from('brazilian_states')
      .select('code, icms_internal_rate')
      .eq('code', originState)
      .maybeSingle()

    const icmsInternalRate = decimalToPercent(Number(statesData?.icms_internal_rate) || 0.18)

    let total = 0

    // PIS/COFINS — hardcoded, sem ajuste de base por ICMS "por dentro"
    // (simplificação intencional; calc-tax-preview.ts faz o cálculo preciso)
    if (regime === 'LUCRO_PRESUMIDO') {
      total += 0.65 + 3.00 // PIS 0.65% + COFINS 3.00% (cumulativo)
    } else {
      total += 1.65 + 7.60 // PIS 1.65% + COFINS 7.60% (não-cumulativo)
    }

    if (calcType !== 'SERVICO') {
      total += icmsInternalRate // ICMS estadual (% já em formato percentual)
    }
    if (calcType === 'SERVICO') {
      total += decimalToPercent(Number(settings.iss_municipality_rate) || 0.05)
    }

    // IRPJ + CSLL — presunção fixa de COMERCIO/INDUSTRIA para todas as atividades
    // (simplificação; calc-tax-preview.ts busca taxas por atividade na tabela lucro_presumido_rates)
    total += round4(8 / 100 * 15) + round4(12 / 100 * 9) // IRPJ: 1.20% + CSLL: 1.08% = 2.28%

    return round4(total)
  }

  return 0
}

async function fetchUserProfile(userId: string): Promise<LoggedUser | null> {
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single()

  if (userError || !user) return null

  // Super_admin: por flag ou por role super_admin (minúsculas no banco)
  const roleValue = (user.role ?? user.user_role ?? '') as string
  const isSuperAdmin =
    (user.is_super_admin ?? false) ||
    String(roleValue).toLowerCase() === 'super_admin'
  if (isSuperAdmin) {
    return {
      uid: user.id,
      email: user.email,
      name: user.name ?? undefined,
      isActive: user.is_active ?? true,
      permissions: ['ADMIN', 'ALL'],
      calcType: null,
      monthlyWorkloadInMinutes: 0,
      unitMeasure: null,
      numProductiveSectorEmployee: 0,
      numComercialSectorEmployee: 0,
      numAdministrativeSectorEmployee: 0,
      taxableRegime: null,
      taxableRegimeValue: 0,
      tenant_id: null,
      role: user.role || 'super_admin',
      is_super_admin: true,
      onboardingCompleted: true,
      modulePermissions: {},
      itemAccess: { all: true, itemIds: [] },
      cashflowSetupDone: true,
    }
  }

  const [tenantRes, settingsRes, expenseRes, modulePermsRes, itemAccessRes, employeeRes, ownerRes] = await Promise.all([
    supabase.from('tenants').select('*').eq('id', user.tenant_id).single(),
    supabase.from('tenant_settings').select('*').eq('tenant_id', user.tenant_id).single(),
    supabase.from('tenant_expense_config').select('*').eq('tenant_id', user.tenant_id).single(),
    supabase.from('user_module_permissions').select('module, can_view, can_edit').eq('user_id', userId).eq('tenant_id', user.tenant_id),
    supabase.from('user_item_access').select('item_id, access_all_items').eq('user_id', userId).eq('tenant_id', user.tenant_id),
    supabase.from('employees').select('id').eq('user_id', userId).eq('tenant_id', user.tenant_id).maybeSingle(),
    supabase.from('tenant_owners').select('user_id').eq('tenant_id', user.tenant_id).eq('user_id', userId).maybeSingle(),
  ])

  const tenant = tenantRes.data
  const settings = settingsRes.data
  const expense = expenseRes.data
  const modulePermsData = modulePermsRes.data
  const itemAccessData = itemAccessRes.data
  const isTenantOwner = !!ownerRes.data

  const onboardingCompleted = !!(tenant?.cnpj_cpf && tenant?.segment)

  const permissions: string[] = []
  if (user.is_super_admin || user.role === 'admin') {
    permissions.push('ADMIN', 'ALL')
  } else {
    permissions.push('ALL')
  }

  const isSuperAdminUser = user.is_super_admin ?? false

  const ALL_MODULES = [
    'home', 'customers', 'items', 'products', 'budgets', 'sales',
    'stock', 'cashier', 'cash_flow', 'employees',
    'reports', 'agenda', 'services', 'connectivity', 'dfc', 'users_management',
  ]

  const isAdminRole = user.role === 'admin'
  // Admin principal (tenant owner) tem acesso total; admin convidado respeita user_module_permissions
  const hasFullAccess = isSuperAdminUser || (isAdminRole && isTenantOwner)

  let modulePermissions: Record<string, { can_view: boolean; can_edit: boolean }> = {}
  if (hasFullAccess) {
    ALL_MODULES.forEach(m => { modulePermissions[m] = { can_view: true, can_edit: true } })
  } else {
    modulePermsData?.forEach(p => {
      modulePermissions[p.module] = { can_view: p.can_view ?? false, can_edit: p.can_edit ?? false }
    })
  }

  let itemAccess: { all: boolean; itemIds: string[] }
  if (hasFullAccess) {
    itemAccess = { all: true, itemIds: [] }
  } else {
    const hasAllItems = itemAccessData?.some(i => i.access_all_items) ?? false
    const itemIds = itemAccessData?.filter(i => i.item_id).map(i => i.item_id!) ?? []
    itemAccess = { all: hasAllItems, itemIds }
  }

  const calcTypeMap: Record<string, string> = {
    INDUSTRIALIZACAO: 'INDUSTRIALIZATION',
    SERVICO: 'SERVICE',
    REVENDA: 'RESALE',
    INDUSTRIALIZATION: 'INDUSTRIALIZATION',
    SERVICE: 'SERVICE',
    RESALE: 'RESALE',
  }

  return {
    uid: user.id,
    email: user.email,
    name: user.name ?? undefined,
    isActive: user.is_active ?? true,
    permissions,
    calcType: (calcTypeMap[settings?.calc_type] || settings?.calc_type || null) as any,
    monthlyWorkloadInMinutes: settings?.monthly_workload ? Number(settings.monthly_workload) : 0,
    unitMeasure: settings?.workload_unit || null,
    numProductiveSectorEmployee: settings?.num_productive_employees ?? 1,
    numComercialSectorEmployee: settings?.num_commercial_employees ?? 0,
    numAdministrativeSectorEmployee: settings?.num_administrative_employees ?? 0,
    taxableRegime: settings?.tax_regime || null,
    taxableRegimeValue: await computeTaxableRegimeValue(settings),
    tenant_id: user.tenant_id,
    role: user.role,
    is_super_admin: isSuperAdminUser,
    onboardingCompleted,
    modulePermissions,
    itemAccess,
    cashflowSetupDone: settings?.cashflow_setup_done ?? false,
    planStatus: (tenant?.plan_status as 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED') ?? 'TRIAL',
    trialEndsAt: (tenant as any)?.trial_ends_at ?? undefined,
    planEndsAt: (tenant as any)?.plan_ends_at ?? undefined,
    planSlug: (tenant as any)?.plan_slug ?? undefined,
    revenueTier: (tenant as any)?.revenue_tier ?? undefined,
    isFree: user.is_free ?? tenant?.is_free ?? false,
    employee_id: employeeRes.data?.id ?? null,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<LoggedUser | null>(null)
  const [fallbackTenantId, setFallbackTenantId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [emailConfirmed, setEmailConfirmed] = useState(false)
  const fetchingRef = useRef(false)
  const tenantId = currentUser?.tenant_id ?? fallbackTenantId
  const lastUserIdRef = useRef<string | null>(null)
  const router = useRouter()

  async function login({ email, password }: { email: string; password: string }) {
    lastUserIdRef.current = null
    const result = await supabase.auth.signInWithPassword({ email, password })
    if (result.error) throw result.error
    // Garantir que o perfil seja carregado antes de retornar para o redirect da página de login funcionar
    if (result.data.session?.user?.id) {
      const profile = await fetchUserProfile(result.data.session.user.id)
      if (profile) {
        lastUserIdRef.current = result.data.session.user.id
        setCurrentUser(profile)
        setCachedProfile(result.data.session.user.id, profile)
        setFallbackTenantId(null)
      }
    }
    return result
  }

  async function signup({ email, password, name }: { email: string; password: string; name: string }) {
    const result = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
        emailRedirectTo: `${window.location.origin}/login`,
      },
    })
    if (result.error) throw result.error
    return result
  }

  async function logout() {
    lastUserIdRef.current = null
    clearDashboardCache()
    clearSessionCache()
    clearCachedProfiles()
    await supabase.auth.signOut()
    setCurrentUser(null)
    setEmailConfirmed(false)
    await clearSessionCookie()
    // Redirecionar qualquer usuário para a tela de login (replace evita voltar à área logada)
    if (typeof window !== 'undefined') {
      window.location.replace('/login')
    } else {
      router.push('/login')
    }
  }

  async function refreshUser(): Promise<LoggedUser | null> {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return null
    lastUserIdRef.current = null
    const profile = await fetchUserProfile(session.user.id)
    if (profile) {
      lastUserIdRef.current = session.user.id
      setCurrentUser(profile)
      setCachedProfile(session.user.id, profile)
      return profile
    }
    return null
  }

  async function handleSession(session: Session) {
    await setSessionCookie(session.access_token)

    const isConfirmed = !!session.user.email_confirmed_at
    setEmailConfirmed(isConfirmed)

    if (lastUserIdRef.current === session.user.id && currentUser) return
    if (fetchingRef.current) return
    fetchingRef.current = true

    try {
      // Instant load from cache while we fetch fresh data
      const cached = getCachedProfile(session.user.id)
      if (cached && !currentUser) {
        lastUserIdRef.current = session.user.id
        setCurrentUser(cached)
        setFallbackTenantId(null)
      }

      const tid = await getTenantId()
      if (tid) setFallbackTenantId(tid)

      const profile = await fetchUserProfile(session.user.id)
      if (profile) {
        lastUserIdRef.current = session.user.id
        setCurrentUser(profile)
        setCachedProfile(session.user.id, profile)
        setFallbackTenantId(null)
      } else if (!cached) {
        setCurrentUser(null)
      }
    } finally {
      fetchingRef.current = false
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        await handleSession(session)
      }
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        handleSession(session)
      } else {
        lastUserIdRef.current = null
        clearDashboardCache()
        clearSessionCache()
        clearCachedProfiles()
        setCurrentUser(null)
        setFallbackTenantId(null)
        setEmailConfirmed(false)
        clearSessionCookie()
      }
    })

    return () => subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const value = {
    currentUser,
    tenantId,
    loading,
    emailConfirmed,
    setCurrentUser,
    login,
    signup,
    logout,
    refreshUser,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
