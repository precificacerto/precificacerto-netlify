import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '@/supabase/admin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const token = req.cookies.token

        if (!token) {
            return res.status(401).json({ error: 'No auth token' })
        }

        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

        if (authError || !user) {
            return res.status(401).json({ error: 'Invalid token' })
        }

        const { data: profile, error } = await supabaseAdmin
            .from('users')
            .select('tenant_id')
            .eq('id', user.id)
            .single()

        if (error || !profile) {
            return res.status(404).json({ error: 'User not found' })
        }

        return res.status(200).json({ tenant_id: profile.tenant_id })
    } catch (error: any) {
        console.error('Get tenant error:', error?.message || 'Unknown error')
        return res.status(500).json({ error: error.message || 'Internal server error' })
    }
}
