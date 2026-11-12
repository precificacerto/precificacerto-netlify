/**
 * Atendimentos I.A. → Catálogo → Motores → UM motor → Referências. A conferência de cada código que as regras do motor citam contra as tabelas
 * de preço (dono do produto, 12/11/2026). Só o super admin. Tudo pela rota (`atendimentos-ia-a-tela-nao-fala-com-o-banco`).
 */
import React from 'react'
import { useRouter } from 'next/router'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/hooks/use-auth.hook'
import { ReferenciasDoMotor } from '@/page-parts/atendimentos-ia/referencias-do-motor.component'

export default function ReferenciasDoMotorPagina() {
    const router = useRouter()
    const { currentUser } = useAuth()
    const ehSuperAdmin = !!currentUser?.is_super_admin
    const id = typeof router.query.id === 'string' ? router.query.id : null
    if (currentUser && !ehSuperAdmin) {
        router.replace(ROUTES.DASHBOARD)
        return null
    }
    if (!ehSuperAdmin || !id) return null
    return (
        <Layout title={PAGE_TITLES.SUPER_ADMIN_IA_REFERENCIAS_DO_MOTOR}>
            <ReferenciasDoMotor motorId={id} />
        </Layout>
    )
}
