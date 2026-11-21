/**
 * Atendimentos I.A. → Contas ligadas → UMA conta → Natureza das variáveis (dono do produto, item (3) da ordem, 21/11/2026). Só o super admin.
 * A empresa está no CAMINHO da URL, como na Base de conhecimento (a regra das telas de contas); a tela está em
 * `src/page-parts/atendimentos-ia/natureza/natureza-da-variavel.component.tsx`.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Alert, Button, Space, Typography } from 'antd'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/hooks/use-auth.hook'
import { ROTAS_DO_CATALOGO, type ContaLigada } from '@/utils/atendimentos-ia-catalogo'
import { chamarRota } from '@/page-parts/atendimentos-ia/api'
import { NaturezaDaVariavel } from '@/page-parts/atendimentos-ia/natureza/natureza-da-variavel.component'

export default function NaturezaDaConta() {
    const router = useRouter()
    const { currentUser } = useAuth()
    const ehSuperAdmin = !!currentUser?.is_super_admin
    const tenantId = typeof router.query.tenantId === 'string' ? router.query.tenantId : null
    const [conta, setConta] = useState<ContaLigada | null | undefined>(undefined)
    const [erro, setErro] = useState<string | null>(null)

    const carregar = useCallback(async () => {
        if (!tenantId) return
        try {
            const cs = await chamarRota<ContaLigada[]>(ROTAS_DO_CATALOGO.contas)
            setConta(cs.find((c) => c.tenant_id === tenantId) ?? null)
            setErro(null)
        } catch (e) {
            setErro((e as Error).message)
        }
    }, [tenantId])
    useEffect(() => { if (ehSuperAdmin) carregar() }, [ehSuperAdmin, carregar])

    if (currentUser && !ehSuperAdmin) { router.replace(ROUTES.DASHBOARD); return null }
    if (!ehSuperAdmin) return null
    const titulo = PAGE_TITLES.SUPER_ADMIN_IA_NATUREZA
    if (erro) return <Layout title={titulo}><Alert type="error" showIcon message="Não foi possível ler a conta." description={erro} action={<Button onClick={carregar}>Tentar de novo</Button>} /></Layout>
    if (conta === null) return <Layout title={titulo}><Alert type="warning" showIcon message="Esta conta não está com o Atendimentos I.A. ligado." /></Layout>
    if (conta === undefined) return <Layout title={titulo}>{null}</Layout>
    return (
        <Layout title={conta.nome} subtitle={titulo}>
            <Space style={{ marginBottom: 16 }} wrap>
                <Typography.Text type="secondary">Editando a empresa</Typography.Text>
                <Typography.Text strong>{conta.nome}</Typography.Text>
                <Button onClick={() => router.push(`${ROUTES.SUPER_ADMIN_IA_CONTAS}/${conta.tenant_id}`)}>← Voltar à conta</Button>
            </Space>
            <NaturezaDaVariavel tenantId={conta.tenant_id} />
        </Layout>
    )
}
