import { useEffect, useState } from 'react'
import { Spin } from 'antd'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { useAuth } from '@/hooks/use-auth.hook'
import { useRouter } from 'next/router'
import { supabase } from '@/supabase/client'
import { getTenantId } from '@/utils/get-tenant-id'
import { fetchTaxPreview, TaxPreviewResult } from '@/utils/calc-tax-preview'
import { mergeExpenseConfig } from '@/utils/recalc-expense-config'
import { ServiceContent } from '@/page-parts/services/content.component'

interface RawItem {
    id: string; name: string; unit: string; cost_price: number; quantity: number; item_type?: string; measure_quantity?: number
}

export default function EditServicePage() {
    const { currentUser, tenantId } = useAuth()
    const router = useRouter()
    const { id } = router.query
    const effectiveTenantId = tenantId ?? currentUser?.tenant_id

    const [serviceData, setServiceData] = useState<any>(null)
    const [items, setItems] = useState<RawItem[]>([])
    const [expenseConfig, setExpenseConfig] = useState<any>(null)
    const [taxPreview, setTaxPreview] = useState<TaxPreviewResult | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!effectiveTenantId || !id) return

        async function load() {
            setLoading(true)
            try {
                const tid = await getTenantId()
                if (!tid) return

                await mergeExpenseConfig(tid)

                const [svcRes, itemsRes, cfgRes, tp] = await Promise.all([
                    supabase.from('services')
                        .select('*, service_items(*, item:items(id, name, unit, cost_price, quantity, measure_quantity))')
                        .eq('id', id as string)
                        .single(),
                    supabase.from('items').select('id, name, unit, cost_price, quantity, item_type, measure_quantity').order('name'),
                    supabase.from('tenant_expense_config').select('*').eq('tenant_id', tid).single(),
                    fetchTaxPreview(tid),
                ])

                if (svcRes.data) setServiceData(svcRes.data)

                setItems(
                    (itemsRes.data || [])
                        .filter((i: any) => i.item_type !== 'REVENDA')
                        .map((i: any) => ({
                            id: i.id,
                            name: i.name,
                            unit: i.unit || 'UN',
                            cost_price: Number(i.cost_price) || 0,
                            quantity: Number(i.quantity) || 1,
                            item_type: i.item_type,
                            measure_quantity: Number(i.measure_quantity) || 1,
                        }))
                )
                setExpenseConfig(cfgRes.data || null)
                if (tp) setTaxPreview(tp)
            } catch (e) {
                console.error('Erro ao carregar serviço:', e)
            } finally {
                setLoading(false)
            }
        }

        load()
    }, [effectiveTenantId, id])

    if (loading || !effectiveTenantId || !serviceData) {
        return (
            <Layout tabTitle={PAGE_TITLES.EDIT_SERVICE}>
                <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>
            </Layout>
        )
    }

    return (
        <Layout tabTitle={PAGE_TITLES.EDIT_SERVICE}>
            <ServiceContent
                isEditing={true}
                serviceData={serviceData}
                items={items}
                expenseConfig={expenseConfig}
                taxPreview={taxPreview}
            />
        </Layout>
    )
}
