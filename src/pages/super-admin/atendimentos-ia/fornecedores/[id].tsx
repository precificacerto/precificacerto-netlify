/**
 * Atendimentos I.A. → Fornecedores e tabelas → UM fornecedor (EPIC §5.6). Só o super admin.
 *
 * As tabelas: Arquivo · Motor · Vigência · Subido em · Contas usando, com Editar e Excluir; e
 * "+ Nova tabela", "Editar fornecedor" (nome e nicho) e "Excluir fornecedor". Tudo pelas rotas.
 * Excluir o que está em uso a ROTA recusa e diz quais contas usam — a mensagem é mostrada
 * inteira, não trocada por um "não foi possível".
 *
 * O erro de salvar uma TABELA (nova ou edição) aparece DENTRO do modal (`erroDaTabela` → prop
 * `erro`), com o arquivo e o motivo — nunca num `message` passageiro fora dele: o modal fica
 * aberto quando a gravação falha, e aberto sem explicação manda o usuário adivinhar (20/10/2026,
 * `atendimentos-ia-formato-do-arquivo.test.tsx`).
 */
import React, { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Alert, Button, Empty, Popconfirm, Space, Table, Tag, Typography, message } from 'antd'
import { ArrowLeftOutlined, PlusOutlined } from '@ant-design/icons'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/hooks/use-auth.hook'
import { ROTAS_DO_CATALOGO, ROTULO_DO_MODELO, type FornecedorComTabelas, type Nicho, type TabelaDoFornecedor } from '@/utils/atendimentos-ia-catalogo'
import { chamarRota, enviarArquivo, gravarTabelaNova, type TabelaPendente } from '@/page-parts/atendimentos-ia/api'
import { FornecedorModal, type DadosDoFornecedor } from '@/page-parts/atendimentos-ia/fornecedor-modal.component'
import { TabelaModal } from '@/page-parts/atendimentos-ia/tabela-modal.component'
import { ESTILO_DA_DATA } from '@/page-parts/atendimentos-ia/linha-da-tabela.component'

const dataBR = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')

export default function TabelasDoFornecedor() {
    const router = useRouter()
    const { currentUser } = useAuth()
    const ehSuperAdmin = !!currentUser?.is_super_admin
    const id = typeof router.query.id === 'string' ? router.query.id : null

    const [fornecedor, setFornecedor] = useState<FornecedorComTabelas | null>(null)
    const [nichos, setNichos] = useState<Nicho[]>([])
    const [erro, setErro] = useState<string | null>(null)
    const [editandoFornecedor, setEditandoFornecedor] = useState(false)
    const [tabelaNova, setTabelaNova] = useState(false)
    const [tabelaEmEdicao, setTabelaEmEdicao] = useState<TabelaDoFornecedor | null>(null)
    const [salvando, setSalvando] = useState(false)
    const [erroDaTabela, setErroDaTabela] = useState<string | null>(null)

    const carregar = useCallback(async () => {
        if (!id) return
        try {
            const [f, ns] = await Promise.all([
                chamarRota<FornecedorComTabelas>(ROTAS_DO_CATALOGO.fornecedor(id)),
                chamarRota<Nicho[]>(ROTAS_DO_CATALOGO.nichos),
            ])
            setFornecedor(f)
            setNichos(ns)
            setErro(null)
        } catch (e) {
            setErro((e as Error).message)
        }
    }, [id])

    useEffect(() => { if (ehSuperAdmin) carregar() }, [ehSuperAdmin, carregar])

    if (currentUser && !ehSuperAdmin) {
        router.replace(ROUTES.DASHBOARD)
        return null
    }
    if (!ehSuperAdmin) return null

    const voltar = () => router.push(ROUTES.SUPER_ADMIN_IA_FORNECEDORES)

    async function salvarFornecedor(d: DadosDoFornecedor) {
        if (!id) return
        setSalvando(true)
        try {
            const antes = fornecedor?.nicho_id
            await chamarRota(ROTAS_DO_CATALOGO.fornecedor(id), 'PATCH', { nome: d.nome, nicho_id: d.nicho_id })
            message.success(antes && antes !== d.nicho_id ? 'Fornecedor alterado e movido de nicho' : 'Fornecedor alterado')
            setEditandoFornecedor(false)
            await carregar()
        } catch (e) {
            message.error((e as Error).message, 8)
        } finally {
            setSalvando(false)
        }
    }

    async function excluirFornecedor() {
        if (!id) return
        try {
            await chamarRota(ROTAS_DO_CATALOGO.fornecedor(id), 'DELETE')
            message.success('Fornecedor excluído')
            voltar()
        } catch (e) {
            message.error((e as Error).message, 8)
        }
    }

    /** Abre ou fecha um modal de tabela sempre SEM o erro da tentativa anterior. */
    const abrirTabelaNova = (aberto: boolean) => { setErroDaTabela(null); setTabelaNova(aberto) }
    const editarTabela = (t: TabelaDoFornecedor | null) => { setErroDaTabela(null); setTabelaEmEdicao(t) }

    async function salvarTabelaNova(t: TabelaPendente) {
        if (!id) return
        setSalvando(true)
        setErroDaTabela(null)
        try {
            await gravarTabelaNova(id, t)
            message.success('Tabela adicionada')
            abrirTabelaNova(false)
            await carregar()
        } catch (e) {
            setErroDaTabela((e as Error).message)
        } finally {
            setSalvando(false)
        }
    }

    async function salvarEdicao(t: TabelaPendente) {
        if (!id || !tabelaEmEdicao) return
        setSalvando(true)
        setErroDaTabela(null)
        try {
            const corpo: Record<string, string> = { vigencia: t.vigencia }
            if (t.arquivo) { const a = await enviarArquivo(id, 'arquivo', t.arquivo); corpo.arquivo_path = a.path; corpo.arquivo_nome = a.nome }
            if (t.motor) { const m = await enviarArquivo(id, 'motor', t.motor); corpo.motor_path = m.path; corpo.motor_nome = m.nome }
            const r = await chamarRota<{ ok: true; aviso?: string }>(ROTAS_DO_CATALOGO.tabela(tabelaEmEdicao.id), 'PATCH', corpo)
            if (r.aviso) message.warning(r.aviso, 8)
            else message.success('Tabela alterada')
            editarTabela(null)
            await carregar()
        } catch (e) {
            setErroDaTabela((e as Error).message)
        } finally {
            setSalvando(false)
        }
    }

    async function excluirTabela(t: TabelaDoFornecedor) {
        try {
            const r = await chamarRota<{ ok: true; aviso?: string }>(ROTAS_DO_CATALOGO.tabela(t.id), 'DELETE')
            if (r.aviso) message.warning(r.aviso, 8)
            else message.success('Tabela excluída')
            await carregar()
        } catch (e) {
            message.error((e as Error).message, 8)
        }
    }

    return (
        <Layout title={fornecedor?.nome ?? PAGE_TITLES.SUPER_ADMIN_IA_FORNECEDORES} subtitle="Tabelas do fornecedor">
            <Space style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }} wrap>
                <Button icon={<ArrowLeftOutlined />} onClick={voltar}>Voltar para fornecedores</Button>
                {fornecedor && (
                    <Space>
                        <Button onClick={() => setEditandoFornecedor(true)}>Editar fornecedor</Button>
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => abrirTabelaNova(true)}>Nova tabela</Button>
                    </Space>
                )}
            </Space>

            {erro ? (
                <Alert type="error" showIcon message="Não foi possível ler o fornecedor." description={erro} action={<Button onClick={carregar}>Tentar de novo</Button>} />
            ) : (
                <>
                    {fornecedor && (
                        <Typography.Paragraph>
                            Nicho: <b>{fornecedor.nicho_nome}</b> {fornecedor.modelo && <Tag>{ROTULO_DO_MODELO[fornecedor.modelo]}</Tag>}
                        </Typography.Paragraph>
                    )}
                    <div className="pc-card--table">
                        <Table<TabelaDoFornecedor>
                            rowKey="id"
                            loading={fornecedor === null}
                            dataSource={fornecedor?.tabelas_da_lista ?? []}
                            pagination={false}
                            locale={{ emptyText: <Empty description="Nenhuma tabela. Use “Nova tabela”." /> }}
                            columns={[
                                { title: 'Arquivo', dataIndex: 'arquivo_nome' },
                                { title: 'Motor', dataIndex: 'motor_nome' },
                                { title: 'Vigência', render: (_, t) => t.vigencia ?? <Typography.Text type="secondary">—</Typography.Text> },
                                // A data na borda direita, em `tabular-nums` — o mesmo estilo da lista do credenciamento.
                                { title: 'Subido em', align: 'right', render: (_, t) => <span style={ESTILO_DA_DATA} data-coluna="subido-em">{dataBR(t.criado_em)}</span> },
                                { title: 'Contas usando', render: (_, t) => (t.contas_usando.length ? t.contas_usando.join(', ') : <Typography.Text type="secondary">—</Typography.Text>) },
                                {
                                    title: '',
                                    align: 'right',
                                    render: (_, t) => (
                                        <Space>
                                            <Button size="small" onClick={() => editarTabela(t)}>Editar</Button>
                                            <Popconfirm title="Excluir esta tabela?" okText="Excluir" cancelText="Cancelar" onConfirm={() => excluirTabela(t)}>
                                                <Button size="small" danger>Excluir</Button>
                                            </Popconfirm>
                                        </Space>
                                    ),
                                },
                            ]}
                        />
                    </div>
                </>
            )}

            <TabelaModal aberto={tabelaNova} titulo="Nova tabela" salvando={salvando} erro={tabelaNova ? erroDaTabela : null} onCancelar={() => abrirTabelaNova(false)} onSalvar={salvarTabelaNova} />
            <TabelaModal
                aberto={!!tabelaEmEdicao}
                titulo="Editar tabela"
                atual={tabelaEmEdicao ?? undefined}
                salvando={salvando}
                erro={tabelaEmEdicao ? erroDaTabela : null}
                onCancelar={() => editarTabela(null)}
                onSalvar={salvarEdicao}
            />
            <FornecedorModal
                aberto={editandoFornecedor}
                modo="editar"
                nichos={nichos}
                inicial={fornecedor ? { nome: fornecedor.nome, nicho_id: fornecedor.nicho_id } : undefined}
                salvando={salvando}
                onCancelar={() => setEditandoFornecedor(false)}
                onSalvar={salvarFornecedor}
                onExcluir={excluirFornecedor}
            />
        </Layout>
    )
}
