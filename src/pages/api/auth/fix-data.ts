import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/supabase/admin'
import { requireSuperAdmin } from '@/lib/get-caller-tenant'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const caller = await requireSuperAdmin(req, res)
    if (!caller) return

    const results: string[] = []

    try {
        const { data: superAdmins } = await supabaseAdmin
            .from('users')
            .select('id, tenant_id, email, role, is_super_admin')
            .eq('is_super_admin', true)

        for (const admin of superAdmins || []) {
            if (admin.role !== 'super_admin') {
                await supabaseAdmin
                    .from('users')
                    .update({ role: 'super_admin', updated_at: new Date().toISOString() })
                    .eq('id', admin.id)
                results.push(`Fixed role for user ${admin.email}: ${admin.role} -> super_admin`)
            }

            await supabaseAdmin.auth.admin.updateUserById(admin.id, {
                user_metadata: {
                    tenant_id: admin.tenant_id,
                    role: 'super_admin',
                    is_super_admin: true,
                },
            })
            results.push(`Updated metadata for user ${admin.email}`)
        }

        const { data: employees } = await supabaseAdmin
            .from('employees')
            .select('id, tenant_id, email, user_id')
            .is('user_id', null)

        for (const emp of employees || []) {
            if (!emp.email) continue

            const { data: matchedUser } = await supabaseAdmin
                .from('users')
                .select('id')
                .eq('email', emp.email)
                .eq('tenant_id', emp.tenant_id)
                .single()

            if (matchedUser) {
                await supabaseAdmin
                    .from('employees')
                    .update({ user_id: matchedUser.id, updated_at: new Date().toISOString() })
                    .eq('id', emp.id)
                results.push(`Linked employee ${emp.email} -> user ${matchedUser.id}`)
            }
        }

        return res.status(200).json({ success: true, results })
    } catch (error: any) {
        console.error('Fix data error:', error?.message || 'Unknown error')
        return res.status(500).json({ error: error.message })
    }
}
