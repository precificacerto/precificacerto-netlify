import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/supabase/admin'
import { getCallerContext } from '@/lib/get-caller-tenant'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const caller = await getCallerContext(req, res)
    if (!caller) return

    const { employee_id } = req.body
    if (!employee_id) {
        return res.status(400).json({ error: 'employee_id is required' })
    }

    const tenant_id = caller.tenant_id

    try {
        const { data: employee } = await supabaseAdmin
            .from('employees')
            .select('id, user_id, email')
            .eq('id', employee_id)
            .eq('tenant_id', tenant_id)
            .single()

        if (!employee) {
            return res.status(404).json({ error: 'Funcionário não encontrado' })
        }

        const { error: empErr } = await supabaseAdmin
            .from('employees')
            .update({ is_active: false })
            .eq('id', employee_id)
            .eq('tenant_id', tenant_id)
        if (empErr) throw empErr

        if (employee.user_id) {
            const { error: userErr } = await supabaseAdmin
                .from('users')
                .update({ is_active: false, updated_at: new Date().toISOString() })
                .eq('id', employee.user_id)
                .eq('tenant_id', tenant_id)
            if (userErr) throw userErr
        }

        return res.status(200).json({ success: true })
    } catch (error: any) {
        console.error('Deactivate employee error:', error?.message || 'Unknown error')
        return res.status(500).json({ error: error.message || 'Internal server error' })
    }
}
