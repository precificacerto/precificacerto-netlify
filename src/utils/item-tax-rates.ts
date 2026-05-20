/**
 * Item Tax Rates — Helper para alíquotas tributárias POR ITEM (Sprint S11).
 *
 * Spec: EPIC-RR-V2 — cada produto/serviço persiste suas próprias alíquotas
 * (Produto A com ICMS 4% e PIS+COFINS 9,25%; Produto B com ICMS 12% e
 * PIS+COFINS 3,65%, por exemplo). O motor RR rodando POR ITEM deve consumir
 * essas alíquotas específicas em vez do tenant uniforme.
 *
 * Convenção de fallback (precedência):
 *   1. Alíquota do item (NOT NULL e > 0)
 *   2. Alíquota do tenant (via TaxRatePeriod[])
 *   3. Zero (não tributado)
 *
 * NULL no item = "não cadastrado" → fallback para tenant.
 * 0 explícito no item = "isento" → vence o fallback (override).
 */

import type { TaxRatePeriod, TaxType } from '@/types/mrm'

/**
 * Alíquotas tributárias persistidas em `products`/`services` (todas em DECIMAL).
 * NULL/undefined = não cadastrado (fallback tenant).
 */
export interface ItemTaxRates {
  // Bloco A — impostos por dentro
  icms_pct?: number | null
  pis_pct?: number | null
  cofins_pct?: number | null
  iss_pct?: number | null
  // Bloco B — impostos por fora
  ipi_pct?: number | null
  icms_st_pct?: number | null
  difal_pct?: number | null
  fcp_pct?: number | null
  ibs_pct?: number | null
  cbs_pct?: number | null
  iss_retido_pct?: number | null
  // Rateio RR
  irpj_pct?: number | null
  csll_pct?: number | null
}

const ITEM_RATE_BY_TAX_TYPE: Record<TaxType, keyof ItemTaxRates> = {
  ICMS: 'icms_pct',
  PIS: 'pis_pct',
  COFINS: 'cofins_pct',
  ISS: 'iss_pct',
  IPI: 'ipi_pct',
  ICMS_ST: 'icms_st_pct',
  DIFAL: 'difal_pct',
  FCP: 'fcp_pct',
  IBS: 'ibs_pct',
  CBS: 'cbs_pct',
  ISS_RETIDO: 'iss_retido_pct',
}

/**
 * Constrói um TaxRatePeriod[] efetivo para o motor RR, combinando alíquotas
 * do item (override) com alíquotas do tenant (fallback).
 *
 * Comportamento por TaxType:
 *   - Se item.X_pct NOT NULL (incluindo 0) → usa valor do item (override)
 *   - Se item.X_pct NULL/undefined → usa tenant rate matching (fallback)
 *   - Se nenhum dos dois → tax_type omitido (motor ignora)
 */
export function mergeItemAndTenantRates(
  itemRates: ItemTaxRates | null | undefined,
  tenantRates: TaxRatePeriod[],
): TaxRatePeriod[] {
  const result: TaxRatePeriod[] = []
  const handledTypes = new Set<TaxType>()

  // 1) Iterar tax_types conhecidos e aplicar precedência item > tenant
  for (const [taxType, field] of Object.entries(ITEM_RATE_BY_TAX_TYPE) as Array<[TaxType, keyof ItemTaxRates]>) {
    const itemVal = itemRates?.[field]
    const hasItemValue = itemVal != null && Number.isFinite(itemVal)

    if (hasItemValue) {
      // Override item — só inclui no array se > 0 (motor ignora rate 0 por design)
      if (Number(itemVal) > 0) {
        result.push({
          id: `item-override-${taxType}`,
          tenant_id: 'item-override',
          tax_type: taxType,
          origin_state: null,
          dest_state: null,
          rate_pct: Number(itemVal),
          valid_from: '2026-01-01',
          valid_until: null,
          notes: 'override from item-level tax rates (S11)',
        })
      }
      handledTypes.add(taxType)
    }
  }

  // 2) Adicionar tenant rates apenas para tax_types NÃO sobrescritos pelo item
  for (const tenantRate of tenantRates) {
    if (!handledTypes.has(tenantRate.tax_type)) {
      result.push(tenantRate)
    }
  }

  return result
}

/**
 * Extrai a alíquota efetiva de CSLL para o item (override item > fallback tenant).
 * Retorna decimal (0.0207 = 2,07%).
 */
export function resolveItemCsllPct(
  itemRates: ItemTaxRates | null | undefined,
  tenantCsllPct: number,
): number {
  const itemVal = itemRates?.csll_pct
  return itemVal != null && Number.isFinite(itemVal) ? Number(itemVal) : tenantCsllPct
}

/**
 * Extrai a alíquota efetiva de IRPJ para o item (override item > fallback tenant).
 */
export function resolveItemIrpjPct(
  itemRates: ItemTaxRates | null | undefined,
  tenantIrpjPct: number,
): number {
  const itemVal = itemRates?.irpj_pct
  return itemVal != null && Number.isFinite(itemVal) ? Number(itemVal) : tenantIrpjPct
}
