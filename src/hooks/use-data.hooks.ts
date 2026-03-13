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
      const { data, error } = await supabase
        .from('products')
        .select('*, pricing_calculations(sale_price_total, sale_price_per_unit)')
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

export function useStock() {
  const { tenantId } = useAuth()
  return useSWR(
    tenantId ? `stock-${tenantId}` : null,
    async () => {
      const { data, error } = await supabase
        .from('stock')
        .select('*, items(name, unit, quantity, cost_price, cost_per_base_unit), products(name, unit, cost_total)')
        .eq('is_active', true)
      if (error) throw error
      return data
    },
    SWR_CONFIG
  )
}
