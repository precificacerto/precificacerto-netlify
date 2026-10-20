/**
 * Atendimentos I.A. → Contas ligadas (EPIC §5.3, bloco 2C.1). Só o super admin.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * REGRA INVIOLÁVEL: a lista de contas e a tela de configuração mostram APENAS o
 * nome/identificação da conta e a configuração do Atendimentos I.A. NADA do conteúdo da conta —
 * nem clientes, nem orçamentos, nem funcionários, nem valores. O super admin não tem tenant e não
 * pode enxergar dado de cliente por construção.
 * ══════════════════════════════════════════════════════════════════════════════════════════
 *
 * O que a lista TEM, neste bloco: a conta e "modelo · nicho". O que ela NÃO tem, de propósito:
 * "Tabelas em uso" (bloco 2C.2), gasto no mês e projeção (bloco 2C.3) — colunas do mockup que
 * entram com os blocos que as calculam, e não como um traço que pareceria "zero".
 *
 * TUDO PELA ROTA (`ROTAS_DO_CATALOGO.contas`), nada pelo cliente do Supabase. Falha de leitura
 * aparece como ERRO, nunca como "nenhuma conta ligada" (`ausente-vs-falso.md`).
 */
import React, { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Alert, Button, Empty, Table, Tag } from 'antd'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/hooks/use-auth.hook'
import { ROTAS_DO_CATALOGO, ROTULO_DO_MODELO, type ContaLigada } from '@/utils/atendimentos-ia-catalogo'
import { chamarRota } from '@/page-parts/atendimentos-ia/api'

/** "Fabricação · Esquadrias", ou só o modelo quando o nicho não foi escolhido. */
function rotuloDoModeloENicho(c: Pick<ContaLigada, 'modelo' | 'nicho_nome'>): string | null {
    if (!c.modelo) return null
    return c.nicho_nome ? `${ROTULO_DO_MODELO[c.modelo]} · ${c.nicho_nome}` : ROTULO_DO_MODELO[c.modelo]
}

export default function ContasLigadas() {
    const router = useRouter()
    const { currentUser } = useAuth()
    const ehSuperAdmin = !!currentUser?.is_super_admin

    const [contas, setContas] = useState<ContaLigada[] | null>(null)
    const [erro, setErro] = useState<string | null>(null)

    const carregar = useCallback(async () => {
        try {
            setContas(await chamarRota<ContaLigada[]>(ROTAS_DO_CATALOGO.contas))
            setErro(null)
        } catch (e) {
            setErro((e as Error).message)
        }
    }, [])

    useEffect(() => { if (ehSuperAdmin) carregar() }, [ehSuperAdmin, carregar])

    if (currentUser && !ehSuperAdmin) {
        router.replace(ROUTES.DASHBOARD)
        return null
    }
    if (!ehSuperAdmin) return null

    return (
        <Layout title={PAGE_TITLES.SUPER_ADMIN_IA_CONTAS} subtitle="As contas com o Atendimentos I.A. ligado. Ligar e desligar é em Tenants.">
            {erro ? (
                <Alert type="error" showIcon message="Não foi possível ler as contas ligadas." description={erro} action={<Button onClick={carregar}>Tentar de novo</Button>} />
            ) : (
                <div className="pc-card--table">
                    <Table<ContaLigada>
                        rowKey="tenant_id"
                        loading={contas === null}
                        dataSource={contas ?? []}
                        pagination={false}
                        locale={{ emptyText: <Empty description="Nenhuma conta com o Atendimentos I.A. ligado. Ligue em Super Admin → Tenants." /> }}
                        columns={[
                            { title: 'Conta', dataIndex: 'nome' },
                            {
                                title: 'Modelo · nicho',
                                render: (_, c) => rotuloDoModeloENicho(c) ?? <Tag color="warning">não definido</Tag>,
                            },
                            {
                                title: '',
                                align: 'right',
                                render: (_, c) => (
                                    <Button size="small" onClick={() => router.push(`${ROUTES.SUPER_ADMIN_IA_CONTAS}/${c.tenant_id}`)}>
                                        Configurar
                                    </Button>
                                ),
                            },
                        ]}
                    />
                </div>
            )}
        </Layout>
    )
}
