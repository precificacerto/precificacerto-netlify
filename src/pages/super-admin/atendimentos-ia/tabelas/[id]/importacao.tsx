/**
 * Atendimentos I.A. → Fornecedores e tabelas → UMA tabela → Importação. Só o super admin.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * REGRA INVIOLÁVEL: a tela mostra apenas o nome da conta e a configuração do Atendimentos I.A.
 * Nada do conteúdo da conta — nem clientes, nem orçamentos, nem funcionários, nem valores. O
 * super admin não tem tenant e não pode enxergar dado de cliente por construção.
 * ══════════════════════════════════════════════════════════════════════════════════════════
 *
 * A TELA NÃO CALCULA NADA (dono do produto, 20/10/2026). Todo número vem da rota — a última
 * importação (`/importar`) e o que está no banco (`/conteudo`) —, e a ordem das tipologias
 * também. ANTES da primeira importação não há contagem, e a tela não mostra zero no lugar
 * (`ausente-vs-falso.md`): mostra os dois arquivos, se são importáveis, e o botão.
 *
 * O ERRO DA ROTA aparece AQUI, com o motivo — a extensão, o Storage, a planilha que o leitor
 * recusa, e a contagem divergente com os dois números lado a lado. A recusa aparece onde a ação
 * aconteceu (cabeçalho de `EXTENSOES_ACEITAS`).
 *
 * Tudo pelas rotas, nada pelo cliente do Supabase (`atendimentos-ia-a-tela-nao-fala-com-o-banco`).
 */
import React, { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Alert, Button, Card, Empty, List, Space, Table, Tag, Typography } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { ROUTES } from '@/constants/routes'
import { useAuth } from '@/hooks/use-auth.hook'
import { ROTAS_DO_CATALOGO, arquivoImportavel, extensaoDoArquivo, fraseDoArquivoNaoImportavel } from '@/utils/atendimentos-ia-catalogo'
import type { Aviso, ContagensDaGravacao, TipologiaLida } from '@/utils/atendimentos-ia-importacao'
import { quandoFoiImportado, textoDoAviso } from '@/utils/atendimentos-ia-importacao-apresentacao'
import { ErroDaRota, chamarRota } from '@/page-parts/atendimentos-ia/api'
import { ESTILO_DA_DATA } from '@/page-parts/atendimentos-ia/linha-da-tabela.component'

interface DadosDaTabela { id: string; fornecedor_id: string; fornecedor_nome: string | null; arquivo_nome: string; motor_nome: string; vigencia: string | null }
interface UltimaImportacao {
    importado_em: string
    importado_por_nome: string | null
    itens: number
    regras: number
    tipologias: number
    cruzam: number
    nao_cruzam: number
    normalizados: number
    avisos: Aviso[]
}
interface Conteudo { formulas: number; tipologias: TipologiaLida[] }
interface ErroDaImportacao { motivo: string; divergencia: { enviado: ContagensDaGravacao; gravado: ContagensDaGravacao } | null }

const num = (x: number) => x.toLocaleString('pt-BR')
const ROTULO_DA_CONTAGEM: Record<keyof ContagensDaGravacao, string> = { itens: 'Itens de preço', regras: 'Regras do motor', tipologias: 'Tipologias', formulas: 'Fórmulas da família' }

function Contagem({ chave, rotulo, valor }: { chave: string; rotulo: string; valor: number }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <Typography.Text type="secondary">{rotulo}</Typography.Text>
            <strong style={ESTILO_DA_DATA} data-contagem={chave}>{num(valor)}</strong>
        </div>
    )
}

export default function ImportacaoDaTabela() {
    const router = useRouter()
    const { currentUser } = useAuth()
    const ehSuperAdmin = !!currentUser?.is_super_admin
    const id = typeof router.query.id === 'string' ? router.query.id : null

    const [tabela, setTabela] = useState<DadosDaTabela | null>(null)
    const [ultima, setUltima] = useState<UltimaImportacao | null>(null)
    const [conteudo, setConteudo] = useState<Conteudo | null>(null)
    const [erroAoLer, setErroAoLer] = useState<string | null>(null)
    const [erroDaImportacao, setErroDaImportacao] = useState<ErroDaImportacao | null>(null)
    const [importando, setImportando] = useState(false)

    const carregar = useCallback(async () => {
        if (!id) return
        try {
            const [t, u, c] = await Promise.all([
                chamarRota<DadosDaTabela>(ROTAS_DO_CATALOGO.tabela(id)),
                chamarRota<UltimaImportacao | null>(ROTAS_DO_CATALOGO.importacao(id)),
                chamarRota<Conteudo>(ROTAS_DO_CATALOGO.conteudoDaTabela(id)),
            ])
            setTabela(t)
            setUltima(u)
            setConteudo(c)
            setErroAoLer(null)
        } catch (e) {
            setErroAoLer((e as Error).message)
        }
    }, [id])

    useEffect(() => { if (ehSuperAdmin) carregar() }, [ehSuperAdmin, carregar])

    if (currentUser && !ehSuperAdmin) {
        router.replace(ROUTES.DASHBOARD)
        return null
    }
    if (!ehSuperAdmin) return null

    async function importar() {
        if (!id) return
        setImportando(true)
        setErroDaImportacao(null)
        try {
            await chamarRota(ROTAS_DO_CATALOGO.importacao(id), 'POST')
            await carregar()
        } catch (e) {
            const corpo = (e instanceof ErroDaRota ? e.corpo : null) as { enviado?: ContagensDaGravacao; gravado?: ContagensDaGravacao } | null
            setErroDaImportacao({
                motivo: (e as Error).message,
                divergencia: corpo?.enviado && corpo?.gravado ? { enviado: corpo.enviado, gravado: corpo.gravado } : null,
            })
        } finally {
            setImportando(false)
        }
    }

    const voltar = () => router.push(tabela ? `${ROUTES.SUPER_ADMIN_IA_FORNECEDORES}/${tabela.fornecedor_id}` : ROUTES.SUPER_ADMIN_IA_FORNECEDORES)

    const arquivos = tabela ? [
        { papel: 'tabela' as const, rotulo: 'Arquivo da tabela', nome: tabela.arquivo_nome },
        { papel: 'motor' as const, rotulo: 'Arquivo do motor', nome: tabela.motor_nome },
    ] : []

    return (
        <Layout title={PAGE_TITLES.SUPER_ADMIN_IA_IMPORTACAO} subtitle={tabela?.fornecedor_nome ?? undefined}>
            <Space style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }} wrap>
                <Button icon={<ArrowLeftOutlined />} onClick={voltar}>Voltar para o fornecedor</Button>
                {tabela && <Button type="primary" onClick={importar} loading={importando}>Importar</Button>}
            </Space>

            {erroAoLer ? (
                <Alert type="error" showIcon message="Não foi possível ler a tabela." description={erroAoLer} action={<Button onClick={carregar}>Tentar de novo</Button>} />
            ) : tabela === null ? null : (
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                    {erroDaImportacao && (
                        <Alert
                            type="error"
                            showIcon
                            closable
                            onClose={() => setErroDaImportacao(null)}
                            message="A importação não foi concluída."
                            data-erro-da-importacao
                            description={
                                <>
                                    <div>{erroDaImportacao.motivo}</div>
                                    {erroDaImportacao.divergencia && (
                                        <table style={{ marginTop: 8 }}>
                                            <thead><tr><th style={{ textAlign: 'left', paddingRight: 16 }} /><th style={{ textAlign: 'right', paddingRight: 16 }}>Lido</th><th style={{ textAlign: 'right' }}>Gravado</th></tr></thead>
                                            <tbody>
                                                {(Object.keys(ROTULO_DA_CONTAGEM) as Array<keyof ContagensDaGravacao>).map((k) => (
                                                    <tr key={k} data-divergencia={k}>
                                                        <td style={{ paddingRight: 16 }}>{ROTULO_DA_CONTAGEM[k]}</td>
                                                        <td style={{ ...ESTILO_DA_DATA, paddingRight: 16 }}>{num(erroDaImportacao.divergencia!.enviado[k])}</td>
                                                        <td style={ESTILO_DA_DATA}>{num(erroDaImportacao.divergencia!.gravado[k])}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </>
                            }
                        />
                    )}

                    <Card size="small" title="Arquivos">
                        <Space direction="vertical" style={{ width: '100%' }}>
                            {arquivos.map((a) => {
                                const importavel = arquivoImportavel(a.nome)
                                return (
                                    <div key={a.papel} data-arquivo-da-importacao={a.papel} data-importavel={importavel ? 'sim' : 'nao'} style={{ padding: '6px 0' }}>
                                        <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                                            <Typography.Text type="secondary">{a.rotulo}</Typography.Text>
                                            <strong>{a.nome}</strong>
                                            <Tag>{extensaoDoArquivo(a.nome) || 'sem extensão'}</Tag>
                                            {importavel ? <Tag color="green">importável</Tag> : <Tag color="red">não importável</Tag>}
                                        </div>
                                        {!importavel && <Typography.Paragraph type="danger" style={{ margin: '4px 0 0' }}>{fraseDoArquivoNaoImportavel(a.nome)}</Typography.Paragraph>}
                                        {ultima && a.papel === 'tabela' && (
                                            <div style={{ maxWidth: 360, marginTop: 6 }}>
                                                <Contagem chave="itens" rotulo={ROTULO_DA_CONTAGEM.itens} valor={ultima.itens} />
                                            </div>
                                        )}
                                        {ultima && a.papel === 'motor' && (
                                            <div style={{ maxWidth: 360, marginTop: 6 }}>
                                                <Contagem chave="regras" rotulo={ROTULO_DA_CONTAGEM.regras} valor={ultima.regras} />
                                                <Contagem chave="tipologias" rotulo={ROTULO_DA_CONTAGEM.tipologias} valor={ultima.tipologias} />
                                                {conteudo && <Contagem chave="formulas" rotulo={ROTULO_DA_CONTAGEM.formulas} valor={conteudo.formulas} />}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </Space>
                    </Card>

                    {!ultima ? (
                        <Typography.Text type="secondary">Esta tabela ainda não foi importada.</Typography.Text>
                    ) : (
                        <>
                            <Typography.Paragraph data-ultima-importacao style={{ margin: 0 }}>
                                Última importação: <span style={ESTILO_DA_DATA}>{quandoFoiImportado(ultima.importado_em)}</span>
                                {' · '}por <b>{ultima.importado_por_nome ?? '—'}</b>
                            </Typography.Paragraph>

                            <Card size="small" title="Cruzamento do motor com o preço" data-cruzamento>
                                <div style={{ maxWidth: 360 }}>
                                    <Contagem chave="cruzam" rotulo="Códigos do motor que acharam preço" valor={ultima.cruzam} />
                                    <Contagem chave="nao_cruzam" rotulo="Códigos do motor sem preço" valor={ultima.nao_cruzam} />
                                    <Contagem chave="normalizados" rotulo="Linhas normalizadas" valor={ultima.normalizados} />
                                </div>
                            </Card>

                            <Card size="small" title="Tipologias" className="pc-card--table">
                                <Table<TipologiaLida>
                                    rowKey="tipologia"
                                    dataSource={conteudo?.tipologias ?? []}
                                    pagination={false}
                                    size="small"
                                    onRow={(t) => ({ 'data-tipologia': t.tipologia } as React.HTMLAttributes<HTMLElement>)}
                                    locale={{ emptyText: <Empty description="Nenhuma tipologia gravada." /> }}
                                    columns={[
                                        { title: 'Tipologia', dataIndex: 'tipologia' },
                                        { title: 'Linha', render: (_, t) => t.linha ?? <Typography.Text type="secondary">—</Typography.Text> },
                                        { title: 'Regras', align: 'right', render: (_, t) => <span style={ESTILO_DA_DATA}>{num(t.n_regras)}</span> },
                                        { title: 'Condicionais', align: 'right', render: (_, t) => <span style={ESTILO_DA_DATA}>{num(t.n_condicionais)}</span> },
                                        { title: 'Variáveis exigidas', render: (_, t) => <span data-variaveis>{t.variaveis.length ? t.variaveis.join(', ') : 'nenhuma'}</span> },
                                    ]}
                                />
                            </Card>

                            <Card size="small" title="Avisos">
                                {ultima.avisos.length === 0 ? (
                                    <Typography.Text type="secondary">A importação não deixou aviso.</Typography.Text>
                                ) : (
                                    <List
                                        size="small"
                                        dataSource={ultima.avisos}
                                        renderItem={(a, i) => {
                                            const { titulo, texto } = textoDoAviso(a)
                                            return (
                                                <List.Item key={i} data-aviso>
                                                    <div><b>{titulo}</b><div>{texto}</div></div>
                                                </List.Item>
                                            )
                                        }}
                                    />
                                )}
                            </Card>
                        </>
                    )}
                </Space>
            )}
        </Layout>
    )
}
