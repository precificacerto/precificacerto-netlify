import { supabase } from '@/supabase/client'

/**
 * Resolves the tenant_id for the current user.
 * Tries Supabase session first, then falls back to the server-side API.
 */
export async function getTenantId(): Promise<string | null> {
    const { data: { session } } = await supabase.auth.getSession()

    if (session?.user) {
        const metaTenantId = session.user.user_metadata?.tenant_id
        if (metaTenantId) return metaTenantId

        const { data: profile } = await supabase
            .from('users')
            .select('tenant_id')
            .eq('id', session.user.id)
            .single()
        if (profile?.tenant_id) return profile.tenant_id
    }

    try {
        const res = await fetch('/api/auth/get-tenant')
        if (res.ok) {
            const data = await res.json()
            if (data.tenant_id) return data.tenant_id
        }
    } catch { /* fallback failed */ }

    return null
}

/**
 * Resolves the current user_id from Supabase session.
 */
export async function getCurrentUserId(): Promise<string | null> {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.user?.id ?? null
}
