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
      // V8 (2026-05-24, ADR-011): inclui product_items.item_cost_net + quantity_needed
      // como FONTE PRIMÁRIA do custo (cenário real do user: cost_total=0 mas item_cost_net
      // tem o valor correto). Mantém pricing_calculations como fallback secundário.
      const { data, error } = await supabase
        .from('products')
        // V8.5 (2026-05-24): SELECT * em pricing_calculations + labor_costs para garantir
        // que TODOS os campos cheguem (mesma estratégia do cadastro de produto).
        .select('*, pricing_calculations(*), product_items(item_id, item_cost_net, item_cost_gross, quantity_needed, items(item_type)), labor_costs(*)')
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
        .select('*, customer:customers(id, name, phone, whatsapp_phone), employee:employees(id, name), budget_items(product_id, service_id, products(name), services(name))')
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
      // ATENÇÃO: não incluir `pricing_calculations`, `product_items` nem `labor_costs`
      // neste select. Essas três tabelas se relacionam apenas com PRODUTOS — possuem
      // somente `product_id`, sem `service_id` nem chave estrangeira para `services`.
      // O PostgREST não consegue resolver esses embeds a partir de `services` e falha a
      // consulta INTEIRA, fazendo a lista chegar vazia (a tela de Orçamentos então exibe
      // "Não há dados", como se não houvesse serviço cadastrado).
      //
      // O custo do serviço não depende desses embeds: a cadeia de
      // `resolveProductCostTotal` cai no nível `cost_total`, que é coluna da própria
      // tabela `services` e já vem no `select *`.
      const { data, error } = await supabase
        .from('services')
        .select('*')
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
