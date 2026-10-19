/**
 * Atendimentos I.A. → Fornecedores e tabelas (EPIC §5.5). Só o super admin.
 *
 * TUDO PELAS ROTAS (`ROTAS_DO_CATALOGO`), nada pelo cliente do Supabase: as quatro tabelas não
 * dão privilégio ao navegador, e uma lista lida por ele chegaria VAZIA, dizendo "nenhum
 * fornecedor" sobre um dado que ninguém leu. Pelo mesmo motivo, falha de leitura aqui aparece
 * como ERRO, nunca como lista vazia (`ausente-vs-falso.md`).
 */
import React, { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Alert, Button, Empty, Table, Tag, Typography, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/hooks/use-auth.hook'
import { AVISO_DO_CATALOGO, ROTAS_DO_CATALOGO, ROTULO_DO_MODELO, type FornecedorDaLista, type Modelo, type Nicho } from '@/utils/atendimentos-ia-catalogo'
import { chamarRota, gravarTabelaNova } from '@/page-parts/atendimentos-ia/api'
import { FornecedorModal, type DadosDoFornecedor } from '@/page-parts/atendimentos-ia/fornecedor-modal.component'
import { NichosCard } from '@/page-parts/atendimentos-ia/nichos.component'

export default function FornecedoresETabelas() {
    const router = useRouter()
    const { currentUser } = useAuth()
    const ehSuperAdmin = !!currentUser?.is_super_admin

    const [fornecedores, setFornecedores] = useState<FornecedorDaLista[] | null>(null)
    const [nichos, setNichos] = useState<Nicho[]>([])
    const [erro, setErro] = useState<string | null>(null)
    const [credenciando, setCredenciando] = useState(false)
    const [salvando, setSalvando] = useState(false)

    const carregar = useCallback(async () => {
        try {
            const [fs, ns] = await Promise.all([
                chamarRota<FornecedorDaLista[]>(ROTAS_DO_CATALOGO.fornecedores),
                chamarRota<Nicho[]>(ROTAS_DO_CATALOGO.nichos),
            ])
            setFornecedores(fs)
            setNichos(ns)
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

    async function credenciar(d: DadosDoFornecedor) {
        setSalvando(true)
        try {
            const { id } = await chamarRota<{ id: string }>(ROTAS_DO_CATALOGO.fornecedores, 'POST', { nome: d.nome, nicho_id: d.nicho_id })
            const falhas: string[] = []
            for (const t of d.tabelas) {
                try { await gravarTabelaNova(id, t) } catch (e) { falhas.push(`${t.arquivo?.name}: ${(e as Error).message}`) }
            }
            if (falhas.length) message.warning(`Fornecedor credenciado, mas ${falhas.length} tabela(s) não entraram — ${falhas.join('; ')}`, 8)
            else message.success('Fornecedor credenciado')
            setCredenciando(false)
            await carregar()
        } catch (e) {
            message.error((e as Error).message)
        } finally {
            setSalvando(false)
        }
    }

    async function criarNicho(n: { modelo: Modelo; nome: string }) {
        try {
            await chamarRota(ROTAS_DO_CATALOGO.nichos, 'POST', n)
            message.success('Nicho criado')
            await carregar()
            return true
        } catch (e) {
            message.error((e as Error).message)
            return false
        }
    }

    async function excluirNicho(n: Nicho) {
        try {
            await chamarRota(ROTAS_DO_CATALOGO.nicho(n.id), 'DELETE')
            message.success('Nicho excluído')
            await carregar()
        } catch (e) {
            message.error((e as Error).message, 8)
        }
    }

    return (
        <Layout title={PAGE_TITLES.SUPER_ADMIN_IA_FORNECEDORES} subtitle={AVISO_DO_CATALOGO}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setCredenciando(true)} disabled={!!erro}>
                    Credenciar fornecedor
                </Button>
            </div>

            {erro ? (
                <Alert type="error" showIcon message="Não foi possível ler o catálogo." description={erro} action={<Button onClick={carregar}>Tentar de novo</Button>} />
            ) : (
                <div className="pc-card--table">
                    <Table<FornecedorDaLista>
                        rowKey="id"
                        loading={fornecedores === null}
                        dataSource={fornecedores ?? []}
                        pagination={false}
                        locale={{ emptyText: <Empty description="Nenhum fornecedor credenciado." /> }}
                        columns={[
                            { title: 'Fornecedor', dataIndex: 'nome' },
                            { title: 'Nicho', render: (_, f) => <span>{f.nicho_nome} {f.modelo && <Tag>{ROTULO_DO_MODELO[f.modelo]}</Tag>}</span> },
                            { title: 'Contas usando', render: (_, f) => (f.contas_usando.length ? f.contas_usando.join(', ') : <Typography.Text type="secondary">—</Typography.Text>) },
                            {
                                title: '',
                                align: 'right',
                                render: (_, f) => (
                                    <Button size="small" onClick={() => router.push(`${ROUTES.SUPER_ADMIN_IA_FORNECEDORES}/${f.id}`)}>
                                        Tabelas ({f.tabelas})
                                    </Button>
                                ),
                            },
                        ]}
                    />
                </div>
            )}

            {!erro && <NichosCard nichos={nichos} onCriar={criarNicho} onExcluir={excluirNicho} />}

            <FornecedorModal
                aberto={credenciando}
                modo="credenciar"
                nichos={nichos}
                salvando={salvando}
                onCancelar={() => setCredenciando(false)}
                onSalvar={credenciar}
            />
        </Layout>
    )
}
