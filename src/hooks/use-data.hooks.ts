import useSWR from 'swr'
import { supabase } from '@/supabase/client'
import { useAuth } from './use-auth.hook'

const SWR_CONFIG = {
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  revalidateOnMount: true,
  dedupingInterval: 60_000,
}

export function useCustomers() {
  const { tenantId } = useAuth()
  return useSWR(
    tenantId ? `customers-${tenantId}` : null,
    async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true })
      if (error) throw error
      return data
    },
    SWR_CONFIG
  )
}

export function useProducts() {
  const { tenantId } = useAuth()
  return useSWR(
    tenantId ? `products-${tenantId}` : null,
    async () => {
      // V7+ (2026-05-24): inclui total_material_cost_net + total_labor_net + cmv
      // para fallback de custo quando products.cost_total = 0 (produtos antigos).
      const { data, error } = await supabase
        .from('products')
        .select('*, pricing_calculations(sale_price_total, sale_price_per_unit, pct_profit_margin, cmv, total_material_cost_net, total_labor_net), product_items(item_id, items(item_type))')
        .or('is_active.is.null,is_active.eq.true')
        .order('name')
      if (error) throw error
      return data
    },
    SWR_CONFIG
  )
}

export function useItems() {
  const { tenantId } = useAuth()
  return useSWR(
    tenantId ? `items-${tenantId}` : null,
    async () => {
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .or('is_active.is.null,is_active.eq.true')
        .order('name')
      if (error) throw error
      return data
    },
    SWR_CONFIG
  )
}

export function useBudgets() {
  const { tenantId } = useAuth()
  return useSWR(
    tenantId ? `budgets-${tenantId}` : null,
    async () => {
      const { data, error } = await supabase
        .from('budgets')
        .select('*, customer:customers(id, name, phone, whatsapp_phone), employee:employees(id, name)')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    SWR_CONFIG
  )
}

export function useEmployees() {
  const { tenantId } = useAuth()
  return useSWR(
    tenantId ? `employees-${tenantId}` : null,
    async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('is_active', true)
        .order('name')
      if (error) throw error
      return data
    },
    SWR_CONFIG
  )
}

export function useServices() {
  const { tenantId } = useAuth()
  return useSWR(
    tenantId ? `services-${tenantId}` : null,
    async () => {
      // V7+ (2026-05-24): inclui alíquotas tributárias + pricing_calculations.cmv para
      // fallback de custo (mesmo padrão dos produtos). pis_cofins_pct é lido em
      // buildItemTaxRatesFromProduct.
      const { data, error } = await supabase
        .from('services')
        .select('*, pricing_calculations(cmv, total_material_cost_net, total_labor_net)')
        .eq('status', 'ACTIVE')
        .order('name')
      if (error) throw error
      return data
    },
    SWR_CONFIG
  )
}

export function useStock() {
  const { tenantId } = useAuth()
  return useSWR(
    tenantId ? `stock-${tenantId}` : null,
    async () => {
      const { data, error } = await supabase
        .from('stock')
        .select('*, items(name, unit, quantity, cost_price, cost_per_base_unit), products(name, unit, cost_total, profit_percent, sale_price, section_id, code)')
        .eq('is_active', true)
      if (error) throw error
      return data
    },
    SWR_CONFIG
  )
}
