import { CASHIER_CATEGORY } from '@/constants/cashier-category'

export function getCategoryName(category: string): string | undefined {
  for (const key in CASHIER_CATEGORY) {
    // @ts-ignore
    if (CASHIER_CATEGORY[key][category]) {
      // @ts-ignore
      return CASHIER_CATEGORY[key][category].value
    }
  }

  return undefined
}
