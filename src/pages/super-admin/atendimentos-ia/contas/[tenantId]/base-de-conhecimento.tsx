/**
 * Atendimentos I.A. → Contas ligadas → UMA conta → Base de conhecimento. Só o super admin.
 *
 * É a ÚNICA tela do sistema em que o tenant vem do pedido — o super admin não tem tenant. Por isso
 * a empresa está no CAMINHO da URL, escolhida navegando da lista de contas ligadas, e não num seletor
 * dentro do formulário: é por um seletor assim que uma escrita cairia na empresa errada, e foi essa a
 * porta que as rotas cercaram com portão, log e verificação no banco (decisão do dono do produto,
 * 23/10/2026). O nome da empresa fica na barra do topo, presa ao rolar (`Affix` — o `sticky` não
 * prende aqui, porque `.app-main` tem `overflow-x: hidden` e vira o contêiner de rolagem).
 *
 * A conta é LIDA da lista de contas ligadas, como na tela de configuração da conta: conta que não
 * está lá não está ligada, e não ganha formulário. Os blocos e a gravação estão em
 * `src/page-parts/atendimentos-ia/base-de-conhecimento/`.
 *
 * A REGRA INVIOLÁVEL das telas de contas vale aqui, com a exceção nominal de id e nome de
 * funcionário para atribuir perfil de vendedor — ver o cabeçalho de `contas/[tenantId].tsx`.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Affix, Alert, Button, Space, Typography } from 'antd'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/hooks/use-auth.hook'
import { ROTAS_DO_CATALOGO, type ContaLigada } from '@/utils/atendimentos-ia-catalogo'
import { chamarRota } from '@/page-parts/atendimentos-ia/api'
import { BaseDeConhecimento } from '@/page-parts/atendimentos-ia/base-de-conhecimento/base-de-conhecimento.component'

export default function BaseDeConhecimentoDaConta() {
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

    if (currentUser && !ehSuperAdmin) {
        router.replace(ROUTES.DASHBOARD)
        return null
    }
    if (!ehSuperAdmin) return null

    const voltar = <Button onClick={() => router.push(`${ROUTES.SUPER_ADMIN_IA_CONTAS}/${tenantId}`)}>← Voltar à conta</Button>

    if (erro) {
        return (
            <Layout title={PAGE_TITLES.SUPER_ADMIN_IA_BASE_DE_CONHECIMENTO}>
                <Alert type="error" showIcon message="Não foi possível ler a conta." description={erro} action={<Button onClick={carregar}>Tentar de novo</Button>} />
            </Layout>
        )
    }
    if (conta === null) {
        return (
            <Layout title={PAGE_TITLES.SUPER_ADMIN_IA_BASE_DE_CONHECIMENTO}>
                <Alert type="warning" showIcon message="Esta conta não está com o Atendimentos I.A. ligado."
                    description="Ligue em Super Admin → Tenants; depois ela aparece em Contas ligadas."
                    action={<Button onClick={() => router.push(ROUTES.SUPER_ADMIN_IA_CONTAS)}>← Contas ligadas</Button>} />
            </Layout>
        )
    }
    if (conta === undefined) return <Layout title={PAGE_TITLES.SUPER_ADMIN_IA_BASE_DE_CONHECIMENTO}>{null}</Layout>

    return (
        <Layout title={conta.nome} subtitle={PAGE_TITLES.SUPER_ADMIN_IA_BASE_DE_CONHECIMENTO}>
            <Affix offsetTop={0}>
                <div data-empresa-no-topo style={{
                    display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                    padding: '10px 14px', marginBottom: 16, borderRadius: 8, background: '#fffbe6', border: '1px solid #ffe58f',
                }}>
                    <Space size={6} wrap>
                        <Typography.Text type="secondary">Editando a empresa</Typography.Text>
                        <Typography.Text strong style={{ fontSize: 16 }}>{conta.nome}</Typography.Text>
                        <Typography.Text type="secondary">· nicho {conta.nicho_nome ?? 'não definido'}</Typography.Text>
                    </Space>
                    {voltar}
                </div>
            </Affix>
            <BaseDeConhecimento tenantId={conta.tenant_id} />
        </Layout>
    )
}
