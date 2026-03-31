import { useEffect } from 'react'
import { Spin } from 'antd'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/hooks/use-auth.hook'
import { supabase } from '@/supabase/client'

/**
 * Página de onboarding de despesas descontinuada.
 * As despesas agora são lançadas diretamente no Controle Financeiro ou Caixa.
 * Esta página marca expense_setup_done automaticamente e redireciona para Configurações.
 */
export default function OnboardingExpenses() {
  const router = useRouter()
  const { currentUser } = useAuth()

  useEffect(() => {
    if (!currentUser) return

    async function markDoneAndRedirect() {
      try {
        const tenantId = currentUser?.tenant_id
        if (tenantId) {
          // Marca expense_setup_done para não bloquear o fluxo de usuários existentes
          await supabase
            .from('tenant_settings')
            .update({ expense_setup_done: true, updated_at: new Date().toISOString() })
            .eq('tenant_id', tenantId)
        }
      } catch {
        /* silent — não bloquear o redirect por erro */
      } finally {
        router.replace(ROUTES.SETTINGS)
      }
    }

    markDoneAndRedirect()
  }, [currentUser, router])

  return (
    <>
      <Head>
        <title>Configurações | Precifica Certo</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
        background: '#0a1628',
        gap: 16,
      }}>
        <Spin size="large" />
        <p style={{ color: '#94a3b8', fontSize: 14 }}>
          Configure suas despesas no Controle Financeiro ou Caixa
        </p>
      </div>
    </>
  )
}
