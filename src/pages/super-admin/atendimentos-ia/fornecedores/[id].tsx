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
 * `atendimentos-ia-formato-do-arquivo.test.tsx`). Pelo mesmo princípio — a recusa aparece ONDE A
 * AÇÃO ACONTECEU —, editar e excluir fornecedor mostram o erro dentro do modal "Editar
 * fornecedor", e excluir tabela (que não tem modal) mostra num Alert na página, acima da lista
 * (`atendimentos-ia-recusa-onde-a-acao-aconteceu.test.tsx`).
 */
import React, { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Alert, Button, Empty, Popconfirm, Space, Switch, Table, Tag, Typography, message } from 'antd'
import { ArrowLeftOutlined, PlusOutlined } from '@ant-design/icons'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/hooks/use-auth.hook'
import { ROTAS_DO_CATALOGO, ROTULO_DO_MODELO, ROTULO_QUALQUER_LINHA, familiaObrigatoria, rotaDoNicho, TITULO_DA_TABELA_NAO_EXCLUIDA, fraseDoArquivo, type Categoria, type Familia, type FornecedorComTabelas, type Nicho, type TabelaDoFornecedor } from '@/utils/atendimentos-ia-catalogo'
import { chamarRota, enviarArquivo, gravarTabelaNova, type TabelaPendente } from '@/page-parts/atendimentos-ia/api'
import { RemocaoDoCatalogo, type AlvoDaRemocao } from '@/page-parts/atendimentos-ia/remocao-do-catalogo.component'
import { FornecedorModal, TITULO_FORNECEDOR_NAO_SALVO, type DadosDoFornecedor, type ErroDoFornecedor } from '@/page-parts/atendimentos-ia/fornecedor-modal.component'
import { TabelaModal } from '@/page-parts/atendimentos-ia/tabela-modal.component'
import { ESTILO_DA_DATA } from '@/page-parts/atendimentos-ia/linha-da-tabela.component'

const dataBR = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')

export default function TabelasDoFornecedor() {
    const router = useRouter()
    const { currentUser } = useAuth()
    const ehSuperAdmin = !!currentUser?.is_super_admin
    const id = typeof router.query.id === 'string' ? router.query.id : null

    const [fornecedor, setFornecedor] = useState<FornecedorComTabelas | null>(null)
    const [removendo, setRemovendo] = useState<AlvoDaRemocao | null>(null)
    const [nichos, setNichos] = useState<Nicho[]>([])
    const [familias, setFamilias] = useState<Familia[]>([])
    const [categorias, setCategorias] = useState<Categoria[]>([])
    const [erro, setErro] = useState<string | null>(null)
    const [editandoFornecedor, setEditandoFornecedor] = useState(false)
    const [tabelaNova, setTabelaNova] = useState(false)
    const [tabelaEmEdicao, setTabelaEmEdicao] = useState<TabelaDoFornecedor | null>(null)
    const [salvando, setSalvando] = useState(false)
    const [erroDaTabela, setErroDaTabela] = useState<string | null>(null)
    const [erroDoFornecedor, setErroDoFornecedor] = useState<ErroDoFornecedor | null>(null)
    const [erroAoExcluirTabela, setErroAoExcluirTabela] = useState<string | null>(null)
    /** A recusa de marcar a vigente fica na página, acima da lista, com a frase inteira da rota. */
    const [erroDaVigente, setErroDaVigente] = useState<string | null>(null)

    const carregar = useCallback(async () => {
        if (!id) return
        try {
            const [f, ns, fams, cats] = await Promise.all([
                chamarRota<FornecedorComTabelas>(ROTAS_DO_CATALOGO.fornecedor(id)),
                chamarRota<Nicho[]>(ROTAS_DO_CATALOGO.nichos),
                chamarRota<Familia[]>(ROTAS_DO_CATALOGO.familias),
                chamarRota<Categoria[]>(ROTAS_DO_CATALOGO.categorias),
            ])
            setFornecedor(f)
            setNichos(ns)
            setFamilias(fams)
            setCategorias(cats)
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

    // o fornecedor mora no nicho (29/10/2026): voltar é voltar para a aba de fornecedores do nicho dele; sem o nicho lido, para o Catálogo
    const voltar = () => router.push(fornecedor?.nicho_id ? rotaDoNicho(fornecedor.nicho_id, 'fornecedores') : ROUTES.SUPER_ADMIN_IA_FORNECEDORES)

    /** Abre ou fecha "Editar fornecedor" sempre SEM o erro da tentativa anterior. */
    const editarFornecedor = (aberto: boolean) => { setErroDoFornecedor(null); setEditandoFornecedor(aberto) }

    async function salvarFornecedor(d: DadosDoFornecedor) {
        if (!id) return
        setSalvando(true)
        setErroDoFornecedor(null)
        try {
            const antes = fornecedor?.nicho_id
            await chamarRota(ROTAS_DO_CATALOGO.fornecedor(id), 'PATCH', { nome: d.nome, nicho_id: d.nicho_id })
            message.success(antes && antes !== d.nicho_id ? 'Fornecedor alterado e movido de nicho' : 'Fornecedor alterado')
            editarFornecedor(false)
            await carregar()
        } catch (e) {
            setErroDoFornecedor({ titulo: TITULO_FORNECEDOR_NAO_SALVO, motivo: (e as Error).message })
        } finally {
            setSalvando(false)
        }
    }

    /** Remover o fornecedor abre a confirmação do arrasto (o que sai junto, medido); a edição fecha para a confirmação aparecer sozinha. */
    function excluirFornecedor() {
        if (!id || !fornecedor) return
        editarFornecedor(false)
        setRemovendo({ tipo: 'fornecedor', chave: id, nome: fornecedor.nome })
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
            const corpo: Record<string, string | null> = { vigencia: t.vigencia }
            if (t.semFamilia) corpo.familia = null
            else if (t.familia) corpo.familia = t.familia
            if (t.categoria) corpo.categoria_chave = t.categoria
            if (t.arquivo) { const a = await enviarArquivo(id, 'arquivo', t.arquivo); corpo.arquivo_path = a.path; corpo.arquivo_nome = a.nome }
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

    /** A marca de vigente: no máximo uma por família; o banco recusa a segunda, e a rota nomeia a de hoje. */
    async function marcarVigente(t: TabelaDoFornecedor, vigente: boolean) {
        setErroDaVigente(null)
        try {
            await chamarRota(ROTAS_DO_CATALOGO.tabela(t.id), 'PATCH', { vigente })
            message.success(vigente ? 'Tabela marcada como vigente' : 'Marca de vigente retirada')
            await carregar()
        } catch (e) {
            setErroDaVigente(fraseDoArquivo(t.arquivo_nome, (e as Error).message))
        }
    }

    async function excluirTabela(t: TabelaDoFornecedor) {
        setErroAoExcluirTabela(null)
        try {
            const r = await chamarRota<{ ok: true; aviso?: string }>(ROTAS_DO_CATALOGO.tabela(t.id), 'DELETE')
            if (r.aviso) message.warning(r.aviso, 8)
            else message.success('Tabela excluída')
            await carregar()
        } catch (e) {
            setErroAoExcluirTabela(fraseDoArquivo(t.arquivo_nome, (e as Error).message))
        }
    }

    return (
        <Layout title={fornecedor?.nome ?? PAGE_TITLES.SUPER_ADMIN_IA_FORNECEDORES} subtitle="Tabelas do fornecedor">
            <Space style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }} wrap>
                <Button icon={<ArrowLeftOutlined />} onClick={voltar}>Voltar para fornecedores</Button>
                {fornecedor && (
                    <Space>
                        <Button onClick={() => editarFornecedor(true)}>Editar fornecedor</Button>
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
                    {erroAoExcluirTabela && (
                        <Alert
                            type="error"
                            showIcon
                            closable
                            onClose={() => setErroAoExcluirTabela(null)}
                            style={{ marginBottom: 12 }}
                            message={TITULO_DA_TABELA_NAO_EXCLUIDA}
                            description={erroAoExcluirTabela}
                            data-erro-da-tabela
                        />
                    )}
                    {erroDaVigente && (
                        <Alert type="error" showIcon closable onClose={() => setErroDaVigente(null)} style={{ marginBottom: 12 }}
                            message="A marca de vigente não foi gravada." description={erroDaVigente} data-erro-da-vigente />
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
                                { title: 'Motor', render: (_, t) => t.motor_nome ?? <Typography.Text type="secondary" data-sem-motor>sem motor (preço puro)</Typography.Text> },
                                {
                                    title: 'Família',
                                    render: (_, t) => (t.familia
                                        ? familias.find((f) => f.chave === t.familia)?.rotulo ?? t.familia
                                        // fora do Perfil, sem família é escolha: a tabela serve qualquer linha (28/10/2026)
                                        : t.categoria_chave && !familiaObrigatoria(t.categoria_chave)
                                            ? <Typography.Text type="secondary" data-qualquer-linha>{ROTULO_QUALQUER_LINHA}</Typography.Text>
                                            : <Typography.Text type="secondary" data-familia-nao-informada>não informada</Typography.Text>),
                                },
                                {
                                    title: 'Categoria',
                                    render: (_, t) => (t.categoria_chave
                                        ? categorias.find((c) => c.chave === t.categoria_chave)?.rotulo ?? t.categoria_chave
                                        : <Typography.Text type="secondary" data-categoria-nao-informada>não informada</Typography.Text>),
                                },
                                // a VIGENTE é a marca que decide o que levantamento novo usa (26/10/2026); a Vigência ao lado é só a nota do consultor
                                {
                                    title: 'Vigente',
                                    render: (_, t) => <Switch size="small" checked={t.vigente} onChange={(v) => marcarVigente(t, v)} data-vigente={t.id} aria-label={`Vigente: ${t.arquivo_nome}`} />,
                                },
                                { title: 'Vigência (nota)', render: (_, t) => t.vigencia ?? <Typography.Text type="secondary">—</Typography.Text> },
                                // A data na borda direita, em `tabular-nums` — o mesmo estilo da lista do credenciamento.
                                { title: 'Subido em', align: 'right', render: (_, t) => <span style={ESTILO_DA_DATA} data-coluna="subido-em">{dataBR(t.criado_em)}</span> },
                                { title: 'Contas usando', render: (_, t) => (t.contas_usando.length ? t.contas_usando.join(', ') : <Typography.Text type="secondary">—</Typography.Text>) },
                                {
                                    title: '',
                                    align: 'right',
                                    render: (_, t) => (
                                        <Space>
                                            <Button size="small" onClick={() => router.push(`${ROUTES.SUPER_ADMIN_IA_TABELAS}/${t.id}/importacao`)}>Importação</Button>
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

            <TabelaModal aberto={tabelaNova} titulo="Nova tabela" familias={familias} categorias={categorias} salvando={salvando} erro={tabelaNova ? erroDaTabela : null} onCancelar={() => abrirTabelaNova(false)} onSalvar={salvarTabelaNova} />
            <TabelaModal
                aberto={!!tabelaEmEdicao}
                titulo="Editar tabela"
                familias={familias}
                categorias={categorias}
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
                familias={familias}
                categorias={categorias}
                inicial={fornecedor ? { nome: fornecedor.nome, nicho_id: fornecedor.nicho_id } : undefined}
                salvando={salvando}
                erro={editandoFornecedor ? erroDoFornecedor : null}
                onCancelar={() => editarFornecedor(false)}
                onSalvar={salvarFornecedor}
                onExcluir={excluirFornecedor}
            />
            <RemocaoDoCatalogo alvo={removendo} onFechar={() => setRemovendo(null)}
                onRemovido={() => { setRemovendo(null); message.success('Fornecedor removido'); voltar() }} />
        </Layout>
    )
}
