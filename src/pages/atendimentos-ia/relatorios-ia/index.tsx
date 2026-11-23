/**
 * /atendimentos-ia/relatorios-ia — os RELATÓRIOS I.A. (dono do produto, 11/11/2026), a terceira seção de Agentes I.A.: por CLIENTE ORÇADO
 * (um orçamento I.A.), as abas — o relatório de materiais (`RelatorioDeMateriais`), o relatório de corte (`RelatorioDeCorte`) e, desde 22/11/2026, as
 * barras do pedido (`BarrasDoPedidoDoOrcamento`); o orientativo de montagem (`OrientativoDeMontagem`, 22/11/2026); os dois primeiros
 * desde 16/11/2026. `TEXTO_DA_ABA_SEM_CONTEUDO` fica para uma aba nova que nasça sem conteúdo.
 *
 * Desde 17/11/2026 (dono do produto): "todos os clientes abertos na própria página. E selecionando ele, a gente acessa o relatório individual
 * de cada um." A lista é uma tabela (número, cliente, data, itens); a linha escolhida abre as duas abas, cada uma com o seu PDF.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, Empty, Spin, Table, Tabs, Typography } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'

import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { RelatorioDeMateriais } from '@/page-parts/atendimentos-ia/relatorio-de-materiais.component'
import { RelatorioDeCorte } from '@/page-parts/atendimentos-ia/relatorio-de-corte.component'
import { BarrasDoPedidoDoOrcamento } from '@/page-parts/atendimentos-ia/barras-do-pedido.component'
import { OrientativoDeMontagem } from '@/page-parts/atendimentos-ia/orientativo-de-montagem.component'

type OrcamentoParaRelatorio = { id: string; numero: number; numero_exibido?: string; nome: string; criado_em: string; itens: number }
type Estado =
    | { tipo: 'carregando' }
    | { tipo: 'desligada' }
    | { tipo: 'sem-permissao' }
    | { tipo: 'erro'; mensagem: string }
    | { tipo: 'pronto'; orcamentos: OrcamentoParaRelatorio[] }

export const ABAS_DOS_RELATORIOS = [
    { key: 'materiais', label: 'Relatório de materiais' },
    { key: 'corte', label: 'Relatório de corte' },
    { key: 'barras', label: 'Barras do pedido' },
    { key: 'orientativo', label: 'Orientativo de montagem' },
] as const
export const TEXTO_DA_ABA_SEM_CONTEUDO = 'Este relatório ainda não foi construído: a seção e a navegação já existem, o conteúdo entra numa próxima entrega.'
export const TEXTO_SEM_ORCAMENTO = 'Escolha o cliente orçado na lista para ver os relatórios.'
export const TEXTO_SEM_CLIENTE = 'Nenhum orçamento ainda.'
const dataBR = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

const RelatoriosIA: React.FC = () => {
    const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' })
    const [escolhido, setEscolhido] = useState<string | null>(null)
    const carregar = useCallback(async () => {
        try {
            const r = await fetch('/api/atendimentos-ia/orcamentos')
            const corpo = (await r.json().catch(() => ({}))) as Record<string, unknown>
            if (r.status === 404) return setEstado({ tipo: 'desligada' })
            if (r.status === 403) return setEstado({ tipo: 'sem-permissao' })
            if (!r.ok) return setEstado({ tipo: 'erro', mensagem: String(corpo.error ?? 'Não foi possível ler os orçamentos.') })
            setEstado({ tipo: 'pronto', orcamentos: (corpo.orcamentos ?? []) as OrcamentoParaRelatorio[] })
        } catch {
            setEstado({ tipo: 'erro', mensagem: 'Não foi possível ler os orçamentos.' })
        }
    }, [])
    useEffect(() => { void carregar() }, [carregar])
    const aberto = estado.tipo === 'pronto' ? estado.orcamentos.find((o) => o.id === escolhido) ?? null : null

    return (
        <Layout title={PAGE_TITLES.RELATORIOS_IA} subtitle="Agentes I.A.">
            <div data-pagina-dos-relatorios-ia="" data-estado={estado.tipo}>
                {estado.tipo === 'carregando' && <div style={{ padding: 32, textAlign: 'center' }}><Spin /></div>}
                {estado.tipo === 'desligada' && <Alert type="info" showIcon message="O Atendimentos I.A. não está ligado nesta conta." />}
                {estado.tipo === 'sem-permissao' && <Alert type="warning" showIcon message="Você não tem permissão para ver os Relatórios I.A." />}
                {estado.tipo === 'erro' && <Alert type="error" showIcon message={estado.mensagem} />}
                {/* UM CLIENTE DE CADA VEZ (dono do produto, 22/11/2026): com um cliente aberto, a lista SOME; trocar de cliente é "Voltar" */}
                {estado.tipo === 'pronto' && aberto === null && (
                    <Card size="small">
                        <Table<OrcamentoParaRelatorio> size="small" rowKey="id" data-lista-de-clientes=""
                            pagination={estado.orcamentos.length > 20 ? { pageSize: 20 } : false} locale={{ emptyText: TEXTO_SEM_CLIENTE }}
                            dataSource={estado.orcamentos}
                            onRow={(o) => ({ onClick: () => setEscolhido(o.id), style: { cursor: 'pointer' }, 'data-cliente': o.id } as React.HTMLAttributes<HTMLElement>)}
                            columns={[
                                { title: 'Nº', key: 'numero', width: 90, render: (_: unknown, o: OrcamentoParaRelatorio) => o.numero_exibido ?? o.numero },
                                { title: 'Cliente', dataIndex: 'nome', key: 'nome' },
                                { title: 'Data', dataIndex: 'criado_em', key: 'criado_em', width: 110, render: (d: string) => dataBR(d) },
                                { title: 'Itens', dataIndex: 'itens', key: 'itens', width: 70, align: 'right' as const },
                                { title: '', key: 'abrir', width: 120, render: () => <Button size="small">Ver relatórios</Button> },
                            ]} />
                        <Typography.Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0 }} data-sem-orcamento="">{TEXTO_SEM_ORCAMENTO}</Typography.Paragraph>
                    </Card>
                )}
                {estado.tipo === 'pronto' && aberto !== null && (
                    <Card size="small">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                            <Button icon={<ArrowLeftOutlined />} onClick={() => setEscolhido(null)} data-voltar-a-lista="">Voltar</Button>
                            <Typography.Title level={5} style={{ margin: 0 }} data-cliente-aberto="">{`Orçamento ${aberto.numero_exibido ?? aberto.numero} — ${aberto.nome}`}</Typography.Title>
                        </div>
                        <Tabs key={aberto.id} items={ABAS_DOS_RELATORIOS.map((a) => ({
                            key: a.key, label: a.label,
                            children: (
                                <div data-aba-do-relatorio={a.key}>
                                    {a.key === 'materiais' ? <RelatorioDeMateriais orcamentoId={aberto.id} numero={aberto.numero} cliente={aberto.nome} /> : a.key === 'corte' ? <RelatorioDeCorte orcamentoId={aberto.id} numero={aberto.numero} cliente={aberto.nome} /> : a.key === 'barras' ? <BarrasDoPedidoDoOrcamento orcamentoId={aberto.id} numero={aberto.numero} cliente={aberto.nome} /> : a.key === 'orientativo' ? <OrientativoDeMontagem orcamentoId={aberto.id} numero={aberto.numero} cliente={aberto.nome} /> : <Empty description={TEXTO_DA_ABA_SEM_CONTEUDO} />}
                                </div>
                            ),
                        }))} />
                    </Card>
                )}
            </div>
        </Layout>
    )
}

export default RelatoriosIA
