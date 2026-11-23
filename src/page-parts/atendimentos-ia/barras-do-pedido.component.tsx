/**
 * A ABA "Barras do pedido" dos Relatórios I.A. (dono do produto, 22/11/2026): "a relação das barras e como elas devem ser cortadas para que a
 * gente consiga identificar um aproveitamento do pedido." Por perfil + cor, como o WVetro mostra: uma barra por linha, com as frações (medida,
 * corte e o item/tipologia de origem) e a sobra; e o resumo por perfil — barras, peso bruto, peso líquido e aproveitamento.
 * Lê `/api/atendimentos-ia/orcamentos/[id]/barras-do-pedido`. Não muda o preço do orçamento.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, Empty, Spin, Table, Typography } from 'antd'
import { FolhaA4, SeletorDaVista, VISTA_PADRAO, type VistaDoRelatorio } from './folha-a4.component'
import type { PlanoDoPerfil } from '@/lib/atendimentos-ia/barras-do-pedido'
import type { BarrasDoPedidoDoOrcamento } from '@/lib/atendimentos-ia/barras-do-pedido-servidor'
import { fracaoNoRelatorio, resumoDoPerfil, tituloDoPerfil } from '@/lib/atendimentos-ia/relatorios-em-pdf'

type Pronto = Exclude<BarrasDoPedidoDoOrcamento, { semMigracao: string }>
type Estado = { tipo: 'carregando' } | { tipo: 'erro'; mensagem: string } | { tipo: 'pronto'; relatorio: Pronto }

export const TEXTO_SEM_BARRA = 'Nenhuma peça de corte neste orçamento: calcule os itens para ver as barras do pedido.'
export const AVISO_DO_PRECO = 'Aproveitamento do PEDIDO: não muda o preço do orçamento, que cobra o consumo de cada item.'
const mm = (n: number) => `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(n)} mm`
const pct = (n: number) => `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n)}%`
const kg = (n: number | null) => (n === null ? '—' : `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} kg`)
const lista = (ordens: readonly number[]) => `${ordens.length === 1 ? 'O item' : 'Os itens'} ${ordens.join(', ')}`

function BlocoDoPerfil({ p }: { p: PlanoDoPerfil }) {
    return (
        <Card size="small" style={{ marginBottom: 12 }} data-perfil-do-pedido={`${p.codigo}|${p.cor ?? ''}`} title={tituloDoPerfil(p)}>
            <Typography.Text strong data-resumo-do-perfil="">{resumoDoPerfil(p)}</Typography.Text>
            <Table size="small" pagination={false} style={{ marginTop: 8 }} rowKey={(_, i) => String(i)} scroll={{ x: true }}
                dataSource={p.barras.map((b, i) => ({ ...b, n: i + 1 }))}
                columns={[
                    { title: 'Barra', dataIndex: 'n', key: 'n', width: 60, align: 'right' as const },
                    { title: 'Frações (medida, corte e origem)', key: 'fracoes', render: (_: unknown, b) => b.fracoes.map(fracaoNoRelatorio).join(' + ') },
                    { title: 'Sobra', key: 'sobra', width: 100, align: 'right' as const, render: (_: unknown, b) => mm(b.sobra_mm) },
                ]} />
        </Card>
    )
}

export function BarrasDoPedidoDoOrcamento({ orcamentoId, numero, cliente, vistaInicial = VISTA_PADRAO }: { orcamentoId: string; numero: number | string; cliente: string; vistaInicial?: VistaDoRelatorio }) {
    const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' })
    // a FOLHA A4 é a vista padrão (dono do produto, 22/11/2026): o próprio PDF, pela mesma função do "Baixar PDF"
    const [vista, setVista] = useState<VistaDoRelatorio>(vistaInicial)
    const pronto = estado.tipo === 'pronto' ? estado.relatorio : null
    const gerar = useCallback(async () => {
        const m = await import('@/lib/atendimentos-ia/relatorios-em-pdf')
        return m.pdfDasBarrasDoPedido(pronto as NonNullable<typeof pronto>, { numero, cliente, geradoEm: new Date() })
    }, [pronto, numero, cliente])
    useEffect(() => {
        let vivo = true
        setEstado({ tipo: 'carregando' })
        void (async () => {
            try {
                const r = await fetch(`/api/atendimentos-ia/orcamentos/${orcamentoId}/barras-do-pedido`)
                const corpo = (await r.json().catch(() => ({}))) as { relatorio?: Pronto; error?: string }
                if (!vivo) return
                if (!r.ok || !corpo.relatorio) return setEstado({ tipo: 'erro', mensagem: corpo.error ?? 'Não foi possível ler as barras do pedido.' })
                setEstado({ tipo: 'pronto', relatorio: corpo.relatorio })
            } catch {
                if (vivo) setEstado({ tipo: 'erro', mensagem: 'Não foi possível ler as barras do pedido.' })
            }
        })()
        return () => { vivo = false }
    }, [orcamentoId])

    if (estado.tipo === 'carregando') return <div style={{ padding: 24, textAlign: 'center' }}><Spin /></div>
    if (estado.tipo === 'erro') return <Alert type="error" showIcon message={estado.mensagem} />
    const r = estado.relatorio
    const vazio = r.perfis.length === 0 && r.semPlano.length === 0
    return (
        <div data-barras-do-pedido="">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <SeletorDaVista vista={vista} mudar={setVista} />
                <Button data-baixar-pdf="barras_do_pedido" onClick={async () => { const m = await import('@/lib/atendimentos-ia/relatorios-em-pdf'); m.baixarPdf(await gerar(), m.nomeDoRelatorio('barras_do_pedido', numero, cliente)) }}>Baixar PDF</Button>
            </div>
            {vista === 'a4' ? <FolhaA4 gerar={gerar} titulo="Barras do pedido" /> : (<>
            <Alert type="info" showIcon style={{ marginBottom: 12 }} message={AVISO_DO_PRECO} />
            {r.itensSemCalculo.length > 0 && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={`${lista(r.itensSemCalculo)} sem cálculo: as peças não estão neste relatório.`} data-itens-sem-calculo="" />}
            {r.itensSemPecas.length > 0 && <Alert type="info" showIcon style={{ marginBottom: 12 }} message={`${lista(r.itensSemPecas)} calculado(s) antes do relatório de corte existir: recalcule o orçamento para ver as peças.`} data-itens-sem-pecas="" />}
            {r.codigosSemPeso.length > 0 && <Alert type="warning" showIcon style={{ marginBottom: 12 }} data-sem-peso="" message={`Sem peso na tabela de preço: ${r.codigosSemPeso.join(', ')} — o peso desses perfis não sai, e o total de peso também não.`} />}
            {vazio && <Empty description={TEXTO_SEM_BARRA} />}
            {r.perfis.length > 0 && (
                <Card size="small" title="Resumo por perfil" style={{ marginBottom: 16 }} data-resumo-do-pedido="">
                    <Table size="small" pagination={false} rowKey={(p) => `${p.codigo}|${p.cor ?? ''}`} scroll={{ x: true }} dataSource={r.perfis}
                        columns={[
                            { title: 'Perfil', key: 'perfil', render: (_: unknown, p: PlanoDoPerfil) => `${p.codigo}${p.descricao ? ` — ${p.descricao}` : ''}` },
                            { title: 'Cor', dataIndex: 'cor', key: 'cor', render: (c: string | null) => c ?? '—' },
                            { title: 'Barras', dataIndex: 'n_barras', key: 'n_barras', align: 'right' as const },
                            { title: 'Peso bruto', key: 'pb', align: 'right' as const, render: (_: unknown, p: PlanoDoPerfil) => kg(p.peso_bruto_kg) },
                            { title: 'Peso líquido', key: 'pl', align: 'right' as const, render: (_: unknown, p: PlanoDoPerfil) => kg(p.peso_liquido_kg) },
                            { title: 'Aproveitamento', key: 'ap', align: 'right' as const, render: (_: unknown, p: PlanoDoPerfil) => pct(p.aproveitamento_pct) },
                        ]}
                        summary={() => (
                            <Table.Summary.Row data-total-do-pedido="">
                                <Table.Summary.Cell index={0}><strong>Total</strong></Table.Summary.Cell>
                                <Table.Summary.Cell index={1} />
                                <Table.Summary.Cell index={2} align="right"><strong>{r.total.n_barras}</strong></Table.Summary.Cell>
                                <Table.Summary.Cell index={3} align="right"><strong>{kg(r.total.peso_bruto_kg)}</strong></Table.Summary.Cell>
                                <Table.Summary.Cell index={4} align="right"><strong>{kg(r.total.peso_liquido_kg)}</strong></Table.Summary.Cell>
                                <Table.Summary.Cell index={5} align="right"><strong>{r.total.aproveitamento_pct === null ? '—' : pct(r.total.aproveitamento_pct)}</strong></Table.Summary.Cell>
                            </Table.Summary.Row>
                        )} />
                </Card>
            )}
            {r.perfis.map((p) => <BlocoDoPerfil key={`${p.codigo}|${p.cor ?? ''}`} p={p} />)}
            {r.semPlano.length > 0 && (
                <section data-sem-plano="">
                    <Typography.Title level={5}>Sem plano de barras</Typography.Title>
                    {r.semPlano.map((s) => <Alert key={`${s.codigo}|${s.cor ?? ''}`} type="warning" showIcon style={{ marginBottom: 8 }} message={`${tituloDoPerfil(s)}: ${s.motivo.replace(/\.$/, '')}.`} />)}
                </section>
            )}
            </>)}
        </div>
    )
}
