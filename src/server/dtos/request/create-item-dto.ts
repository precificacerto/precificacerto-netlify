import { UNIT_TYPE_ENUM } from '@/shared/enums/unit-type'

export type CreateItemDto = {
  name: string
  quantity: number
  unitType: UNIT_TYPE_ENUM
  price: number
  observation: string
}
