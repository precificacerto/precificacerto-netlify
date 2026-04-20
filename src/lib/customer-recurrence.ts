import type { SupabaseClient } from '@supabase/supabase-js'

type SyncParams = {
    supabase: SupabaseClient<any>
    tenantId: string
    customerId: string
    saleId?: string | null
    saleDate: string
    userId: string
}

/**
 * Sync customer-level recurrence on every sale.
 *
 * Behavior: if the customer has recurrence_active + recurrence_days set, every
 * sale cancels any previously pending CUSTOMER-type dispatch for that customer
 * and (re)creates a new one at sale_date + recurrence_days. This implements the
 * "last order resets the timer" rule.
 */
export async function syncCustomerRecurrenceOnSale({
    supabase,
    tenantId,
    customerId,
    saleId,
    saleDate,
    userId,
}: SyncParams): Promise<void> {
    if (!tenantId || !customerId) return
    const sb: any = supabase

    const { data: customer, error: custErr } = await sb
        .from('customers')
        .select('id, recurrence_active, recurrence_days, recurrence_message')
        .eq('id', customerId)
        .maybeSingle()

    if (custErr || !customer) return
    if (!customer.recurrence_active) return

    const days = Number(customer.recurrence_days || 0)
    if (!days || days <= 0) return

    const { data: pending } = await sb
        .from('recurrence_records')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('customer_id', customerId)
        .eq('type', 'CUSTOMER')
        .eq('status', 'PENDING')
        .eq('is_active', true)

    const pendingIds = (pending || []).map((p: any) => p.id)
    if (pendingIds.length > 0) {
        await sb
            .from('recurrence_dispatch_queue')
            .update({ status: 'CANCELLED' })
            .in('recurrence_record_id', pendingIds)
            .eq('status', 'PENDING')
        await sb
            .from('recurrence_records')
            .update({ status: 'CANCELLED', is_active: false, updated_at: new Date().toISOString() })
            .in('id', pendingIds)
    }

    const base = new Date(saleDate + 'T12:00:00')
    base.setDate(base.getDate() + days)
    const dispatchDate = base.toISOString().slice(0, 10)

    const { data: newRecord, error: recErr } = await sb
        .from('recurrence_records')
        .insert({
            tenant_id: tenantId,
            customer_id: customerId,
            sale_id: saleId || null,
            sale_date: saleDate,
            dispatch_date: dispatchDate,
            recurrence_days: days,
            amount: 0,
            type: 'CUSTOMER',
            custom_message: customer.recurrence_message || null,
            created_by: userId,
        })
        .select('id')
        .single()

    if (recErr || !newRecord) return

    await sb.from('recurrence_dispatch_queue').insert({
        tenant_id: tenantId,
        recurrence_record_id: newRecord.id,
        scheduled_at: `${dispatchDate}T12:00:00-03:00`,
        user_id: userId,
    })
}

/**
 * Recalculate the pending CUSTOMER dispatch when the user edits the customer's
 * recurrence settings (days or message). Keeps the last sale_date as the anchor.
 */
export async function recalcCustomerRecurrenceOnEdit({
    supabase,
    tenantId,
    customerId,
    userId,
}: {
    supabase: SupabaseClient<any>
    tenantId: string
    customerId: string
    userId: string
}): Promise<void> {
    if (!tenantId || !customerId) return
    const sb: any = supabase

    const { data: customer } = await sb
        .from('customers')
        .select('id, recurrence_active, recurrence_days, recurrence_message')
        .eq('id', customerId)
        .maybeSingle()
    if (!customer) return

    const { data: pending } = await sb
        .from('recurrence_records')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('customer_id', customerId)
        .eq('type', 'CUSTOMER')
        .eq('status', 'PENDING')
        .eq('is_active', true)
    const pendingIds = (pending || []).map((p: any) => p.id)

    if (pendingIds.length > 0) {
        await sb
            .from('recurrence_dispatch_queue')
            .update({ status: 'CANCELLED' })
            .in('recurrence_record_id', pendingIds)
            .eq('status', 'PENDING')
        await sb
            .from('recurrence_records')
            .update({ status: 'CANCELLED', is_active: false, updated_at: new Date().toISOString() })
            .in('id', pendingIds)
    }

    if (!customer.recurrence_active) return
    const days = Number(customer.recurrence_days || 0)
    if (!days || days <= 0) return

    const { data: lastSale } = await sb
        .from('sales')
        .select('id, sale_date, created_at')
        .eq('tenant_id', tenantId)
        .eq('customer_id', customerId)
        .eq('is_active', true)
        .order('sale_date', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (!lastSale) return

    const saleDate = lastSale.sale_date || (lastSale.created_at ? String(lastSale.created_at).slice(0, 10) : null)
    if (!saleDate) return

    const base = new Date(saleDate + 'T12:00:00')
    base.setDate(base.getDate() + days)
    const dispatchDate = base.toISOString().slice(0, 10)

    const { data: newRecord } = await sb
        .from('recurrence_records')
        .insert({
            tenant_id: tenantId,
            customer_id: customerId,
            sale_id: lastSale.id,
            sale_date: saleDate,
            dispatch_date: dispatchDate,
            recurrence_days: days,
            amount: 0,
            type: 'CUSTOMER',
            custom_message: customer.recurrence_message || null,
            created_by: userId,
        })
        .select('id')
        .single()

    if (!newRecord) return

    await sb.from('recurrence_dispatch_queue').insert({
        tenant_id: tenantId,
        recurrence_record_id: newRecord.id,
        scheduled_at: `${dispatchDate}T12:00:00-03:00`,
        user_id: userId,
    })
}
