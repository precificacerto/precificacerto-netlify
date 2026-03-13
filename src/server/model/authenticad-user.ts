import * as yup from 'yup'
import { CALC_TYPE_ENUM } from '@/shared/enums/calc-type'
import { UNIT_MEASURE_ENUM } from '@/shared/enums/unit-measure-type'

export const authenticatedUserSchema = yup.object({
  uid: yup.string().required(),
  email: yup.string().email().required(),
  isActive: yup.boolean().required(),
  permissions: yup.array(),
  calcType: yup.string().oneOf(Object.values(CALC_TYPE_ENUM)).required(),
  monthlyWorkloadInMinutes: yup.number().min(0).required(),
  unitMeasure: yup.string().oneOf(Object.values(UNIT_MEASURE_ENUM)).required(),
  numProductiveSectorEmployee: yup.number().min(0).required(),
  numComercialSectorEmployee: yup.number().min(0).required(),
  numAdministrativeSectorEmployee: yup.number().min(0).required(),
  representsFor: yup.string().optional(),
  representedBy: yup.string().optional(),
})

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IAuthenticatedUserModel extends yup.InferType<typeof authenticatedUserSchema> {}
