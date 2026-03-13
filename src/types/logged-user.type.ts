import { CALC_TYPE_ENUM } from '@/shared/enums/calc-type'
import { UNIT_MEASURE_ENUM } from '@/shared/enums/unit-measure-type'

export type LoggedUser = {
  uid: string
  email: string
  name?: string
  isActive: boolean
  permissions: string[]
  calcType: CALC_TYPE_ENUM
  monthlyWorkloadInMinutes: number
  unitMeasure: UNIT_MEASURE_ENUM
  numProductiveSectorEmployee: number
  numComercialSectorEmployee: number
  numAdministrativeSectorEmployee: number
  taxableRegime: string
  taxableRegimeValue: number
  representsFor?: string
  representedBy?: string
  tenant_id?: string
  role?: string
  is_super_admin?: boolean
  /** Employee id for this user in the current tenant (employees.id where user_id = uid). Used for user-scoped modules. */
  employee_id?: string | null
  onboardingCompleted?: boolean
  modulePermissions: Record<string, { can_view: boolean; can_edit: boolean }>
  itemAccess: { all: boolean; itemIds: string[] }
  cashflowSetupDone?: boolean
  planStatus?: 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED'
  trialEndsAt?: string
  planEndsAt?: string
  planSlug?: string
  revenueTier?: string
  isFree?: boolean
}
