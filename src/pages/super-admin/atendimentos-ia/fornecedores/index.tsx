/**
 * Atendimentos I.A. → Fornecedores e tabelas (EPIC §5.5). Só o super admin.
 *
 * TUDO PELAS ROTAS (`ROTAS_DO_CATALOGO`), nada pelo cliente do Supabase: as quatro tabelas não
 * dão privilégio ao navegador, e uma lista lida por ele chegaria VAZIA, dizendo "nenhum
 * fornecedor" sobre um dado que ninguém leu. Pelo mesmo motivo, falha de leitura aqui aparece
 * como ERRO, nunca como lista vazia (`ausente-vs-falso.md`).
 *
 * CREDENCIAR — a recusa aparece onde a ação aconteceu (cabeçalho de `EXTENSOES_ACEITAS`):
 *   - o fornecedor recusado: o erro aparece DENTRO do modal de credenciamento;
 *   - o fornecedor gravado e alguma tabela recusada: o modal FECHA — o fornecedor já existe, e um
 *     novo "Salvar credenciamento" criaria um SEGUNDO (não há índice único no nome) — e as falhas
 *     ficam num Alert FIXO na página, acima da lista, até o usuário fechar. Cada falha já vem
 *     com o arquivo nomeado uma vez (`gravarTabelaNova`); aqui não se acrescenta nome.
 * Portão: `atendimentos-ia-recusa-onde-a-acao-aconteceu.test.tsx`.
 *
 * AS FAMÍLIAS (dono do produto, 26/10/2026) moram aqui, ao lado dos nichos: a lista fechada que o
 * cadastro da tabela usa, com "Nova família" (`FamiliasCard`).
 */
import React, { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Alert, Button, Empty, Table, Tag, Typography, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/hooks/use-auth.hook'
import { AVISO_DO_CATALOGO, ROTAS_DO_CATALOGO, ROTULO_DO_MODELO, type Familia, type FornecedorDaLista, type Modelo, type Nicho } from '@/utils/atendimentos-ia-catalogo'
import { chamarRota, gravarTabelaNova } from '@/page-parts/atendimentos-ia/api'
import { FornecedorModal, TITULO_FORNECEDOR_NAO_CREDENCIADO, type DadosDoFornecedor, type ErroDoFornecedor } from '@/page-parts/atendimentos-ia/fornecedor-modal.component'
import { NichosCard } from '@/page-parts/atendimentos-ia/nichos.component'
import { FamiliasCard } from '@/page-parts/atendimentos-ia/familias.component'

export default function FornecedoresETabelas() {
    const router = useRouter()
    const { currentUser } = useAuth()
    const ehSuperAdmin = !!currentUser?.is_super_admin

    const [fornecedores, setFornecedores] = useState<FornecedorDaLista[] | null>(null)
    const [nichos, setNichos] = useState<Nicho[]>([])
    const [familias, setFamilias] = useState<Familia[]>([])
    const [erro, setErro] = useState<string | null>(null)
    const [credenciando, setCredenciando] = useState(false)
    const [salvando, setSalvando] = useState(false)
    const [erroAoCredenciar, setErroAoCredenciar] = useState<ErroDoFornecedor | null>(null)
    const [credenciadoComFalhas, setCredenciadoComFalhas] = useState<{ nome: string; falhas: string[] } | null>(null)

    const carregar = useCallback(async () => {
        try {
            const [fs, ns, fams] = await Promise.all([
                chamarRota<FornecedorDaLista[]>(ROTAS_DO_CATALOGO.fornecedores),
                chamarRota<Nicho[]>(ROTAS_DO_CATALOGO.nichos),
                chamarRota<Familia[]>(ROTAS_DO_CATALOGO.familias),
            ])
            setFornecedores(fs)
            setNichos(ns)
            setFamilias(fams)
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

    /** Abre ou fecha o credenciamento sempre SEM o erro da tentativa anterior. */
    const abrirCredenciamento = (aberto: boolean) => { setErroAoCredenciar(null); setCredenciando(aberto) }

    async function credenciar(d: DadosDoFornecedor) {
        setSalvando(true)
        setErroAoCredenciar(null)
        let id: string
        try {
            id = (await chamarRota<{ id: string }>(ROTAS_DO_CATALOGO.fornecedores, 'POST', { nome: d.nome, nicho_id: d.nicho_id })).id
        } catch (e) {
            setErroAoCredenciar({ titulo: TITULO_FORNECEDOR_NAO_CREDENCIADO, motivo: (e as Error).message })
            setSalvando(false)
            return
        }
        try {
            const falhas: string[] = []
            for (const t of d.tabelas) {
                try { await gravarTabelaNova(id, t) } catch (e) { falhas.push((e as Error).message) }
            }
            setCredenciadoComFalhas(falhas.length ? { nome: d.nome.trim(), falhas } : null)
            if (!falhas.length) message.success('Fornecedor credenciado')
            abrirCredenciamento(false)
            await carregar()
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

    async function criarFamilia(rotulo: string) {
        try {
            await chamarRota(ROTAS_DO_CATALOGO.familias, 'POST', { rotulo })
            message.success('Família acrescentada')
            await carregar()
            return true
        } catch (e) {
            message.error((e as Error).message, 8)
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
                <Button type="primary" icon={<PlusOutlined />} onClick={() => abrirCredenciamento(true)} disabled={!!erro}>
                    Credenciar fornecedor
                </Button>
            </div>

            {credenciadoComFalhas && (
                <Alert
                    type="warning"
                    showIcon
                    closable
                    onClose={() => setCredenciadoComFalhas(null)}
                    style={{ marginBottom: 12 }}
                    message={`Fornecedor "${credenciadoComFalhas.nome}" credenciado, mas ${credenciadoComFalhas.falhas.length} tabela(s) não entraram.`}
                    description={<ul style={{ margin: 0, paddingLeft: 18 }}>{credenciadoComFalhas.falhas.map((f, i) => <li key={i}>{f}</li>)}</ul>}
                    data-credenciado-com-falhas
                />
            )}

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
            {!erro && <FamiliasCard familias={familias} onCriar={criarFamilia} />}

            <FornecedorModal
                aberto={credenciando}
                modo="credenciar"
                nichos={nichos}
                familias={familias}
                salvando={salvando}
                erro={credenciando ? erroAoCredenciar : null}
                onCancelar={() => abrirCredenciamento(false)}
                onSalvar={credenciar}
            />
        </Layout>
    )
}
