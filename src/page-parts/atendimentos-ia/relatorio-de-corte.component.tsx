/**
 * A ABA "Relatório de corte" dos Relatórios I.A. (dono do produto, 16/11/2026): por categoria da base de conhecimento, cada código com as
 * peças a cortar — a medida, o corte ("45S/45S", "90/90"), a posição e a quantidade —, e o plano de barras com a barra e a serra que o
 * cálculo gravou. Lê `/api/atendimentos-ia/orcamentos/[id]/relatorio-de-corte`.
 *
 * O código sem plano diz por quê (sem barra, ou barras/serras diferentes entre os cálculos); o item calculado antes do corte existir diz que
 * precisa ser recalculado — nunca um relatório que pareça completo sem estar.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, Empty, Spin, Table, Typography } from 'antd'
import { FolhaA4, SeletorDaVista, VISTA_PADRAO, type VistaDoRelatorio } from './folha-a4.component'
import type { CodigoDoCorte, LinhaDeCorte } from '@/lib/atendimentos-ia/relatorio-de-corte'
import type { RelatorioDeCorteDoOrcamento } from '@/lib/atendimentos-ia/relatorio-de-corte-servidor'

type Pronto = Exclude<RelatorioDeCorteDoOrcamento, { semMigracao: string }>
type Estado = { tipo: 'carregando' } | { tipo: 'erro'; mensagem: string } | { tipo: 'pronto'; relatorio: Pronto }

export const TEXTO_SEM_PECA = 'Nenhuma peça de corte neste orçamento: calcule os itens para ver o relatório.'
const lista = (ordens: readonly number[]) => `${ordens.length === 1 ? 'O item' : 'Os itens'} ${ordens.join(', ')}`
export const fraseDosItensSemCalculoNoCorte = (ordens: readonly number[]) =>
    `${lista(ordens)} ${ordens.length === 1 ? 'não tem' : 'não têm'} cálculo: as peças ${ordens.length === 1 ? 'dele' : 'deles'} não estão neste relatório.`
export const fraseDosItensSemPecas = (ordens: readonly number[]) =>
    `${lista(ordens)} ${ordens.length === 1 ? 'foi calculado' : 'foram calculados'} antes do relatório de corte existir: recalcule o orçamento para ver as peças ${ordens.length === 1 ? 'dele' : 'deles'}.`

const mm = (n: number) => `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(n)} mm`
const pct = (n: number) => `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n)}%`

const colunas = [
    { title: 'Medida', key: 'medida', align: 'right' as const, render: (_: unknown, l: LinhaDeCorte) => mm(l.comprimento_mm) },
    { title: 'Corte', dataIndex: 'corte', key: 'corte', render: (c: string | null) => c ?? '—' },
    { title: 'Posição', dataIndex: 'posicao', key: 'posicao', render: (p: string | null) => p ?? '—' },
    { title: 'Quantidade', dataIndex: 'quantidade', key: 'quantidade', align: 'right' as const },
]

function BlocoDoCodigo({ c }: { c: CodigoDoCorte }) {
    return (
        <Card size="small" style={{ marginBottom: 12 }} data-codigo-do-corte={c.codigo}
            title={<span>{c.codigo}{c.descricao ? ` — ${c.descricao}` : ''} <Typography.Text type="secondary">({c.perfil})</Typography.Text></span>}>
            <Table size="small" pagination={false} rowKey={(l) => `${l.comprimento_mm}-${l.corte ?? ''}-${l.posicao ?? ''}`} columns={colunas} dataSource={c.linhas} scroll={{ x: true }} />
            {'semPlano' in c.plano ? (
                <Alert type="warning" showIcon style={{ marginTop: 8 }} message={`Sem plano de barras: ${c.plano.semPlano.replace(/\.$/, '')}.`} data-sem-plano="" />
            ) : (
                <div style={{ marginTop: 8 }} data-plano="">
                    <Typography.Text strong>
                        {`Barra de ${mm(c.plano.barra_mm)}, serra de ${mm(c.plano.serra_mm)}: ${c.plano.n_barras} ${c.plano.n_barras === 1 ? 'barra' : 'barras'}, aproveitamento de ${pct(c.plano.aproveitamento_pct)}`}
                    </Typography.Text>
                    <ol style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                        {c.plano.barras.map((b, k) => (
                            <li key={k}>{`${b.pecas_mm.map(mm).join(' + ')} · sobra ${mm(b.sobra_mm)}`}</li>
                        ))}
                    </ol>
                </div>
            )}
        </Card>
    )
}

export function RelatorioDeCorte({ orcamentoId, numero, cliente, vistaInicial = VISTA_PADRAO }: { orcamentoId: string; numero: number; cliente: string; vistaInicial?: VistaDoRelatorio }) {
    const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' })
    // a FOLHA A4 é a vista padrão (dono do produto, 22/11/2026): o próprio PDF, pela mesma função do "Baixar PDF"
    const [vista, setVista] = useState<VistaDoRelatorio>(vistaInicial)
    const pronto = estado.tipo === 'pronto' ? estado.relatorio : null
    const gerar = useCallback(async () => {
        const m = await import('@/lib/atendimentos-ia/relatorios-em-pdf')
        return m.pdfDoRelatorioDeCorte(pronto as NonNullable<typeof pronto>, { numero, cliente, geradoEm: new Date() })
    }, [pronto, numero, cliente])
    useEffect(() => {
        let vivo = true
        setEstado({ tipo: 'carregando' })
        void (async () => {
            try {
                const r = await fetch(`/api/atendimentos-ia/orcamentos/${orcamentoId}/relatorio-de-corte`)
                const corpo = (await r.json().catch(() => ({}))) as { relatorio?: Pronto; error?: string }
                if (!vivo) return
                if (!r.ok || !corpo.relatorio) return setEstado({ tipo: 'erro', mensagem: corpo.error ?? 'Não foi possível ler o relatório de corte.' })
                setEstado({ tipo: 'pronto', relatorio: corpo.relatorio })
            } catch {
                if (vivo) setEstado({ tipo: 'erro', mensagem: 'Não foi possível ler o relatório de corte.' })
            }
        })()
        return () => { vivo = false }
    }, [orcamentoId])

    if (estado.tipo === 'carregando') return <div style={{ padding: 24, textAlign: 'center' }}><Spin /></div>
    if (estado.tipo === 'erro') return <Alert type="error" showIcon message={estado.mensagem} />
    const { categorias, semCategoria, ambiguos, itensSemCalculo, itensSemPecas } = estado.relatorio
    const vazio = categorias.length === 0 && semCategoria.length === 0 && ambiguos.length === 0
    return (
        <div data-relatorio-de-corte="">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <SeletorDaVista vista={vista} mudar={setVista} />
                <Button data-baixar-pdf="corte" onClick={async () => { const m = await import('@/lib/atendimentos-ia/relatorios-em-pdf'); m.baixarPdf(await gerar(), m.nomeDoRelatorio('corte', numero, cliente)) }}>Baixar PDF</Button>
            </div>
            {vista === 'a4' ? <FolhaA4 gerar={gerar} titulo="Relatório de corte" /> : (<>
            {itensSemCalculo.length > 0 && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={fraseDosItensSemCalculoNoCorte(itensSemCalculo)} data-itens-sem-calculo="" />}
            {itensSemPecas.length > 0 && <Alert type="info" showIcon style={{ marginBottom: 12 }} message={fraseDosItensSemPecas(itensSemPecas)} data-itens-sem-pecas="" />}
            {vazio && <Empty description={TEXTO_SEM_PECA} />}
            {categorias.map((cat) => (
                <section key={cat.chave} data-categoria={cat.chave} style={{ marginBottom: 16 }}>
                    <Typography.Title level={5} style={{ marginBottom: 8 }}>{cat.rotulo}</Typography.Title>
                    {cat.codigos.map((c) => <BlocoDoCodigo key={c.codigo} c={c} />)}
                </section>
            ))}
            {ambiguos.length > 0 && (
                <section data-categoria="ambiguos" style={{ marginBottom: 16 }}>
                    <Typography.Title level={5} style={{ marginBottom: 4 }}>Em mais de uma categoria</Typography.Title>
                    <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
                        Estes códigos estão em tabelas de categorias diferentes, e nenhuma é escolhida: {ambiguos.map((a) => `${a.codigo} (${a.categorias.join(', ')})`).join('; ')}.
                    </Typography.Paragraph>
                    {ambiguos.map((c) => <BlocoDoCodigo key={c.codigo} c={c} />)}
                </section>
            )}
            {semCategoria.length > 0 && (
                <section data-categoria="sem-categoria">
                    <Typography.Title level={5} style={{ marginBottom: 4 }}>Sem categoria</Typography.Title>
                    <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>Estes códigos não estão em nenhuma tabela de preço da conta com categoria.</Typography.Paragraph>
                    {semCategoria.map((c) => <BlocoDoCodigo key={c.codigo} c={c} />)}
                </section>
            )}
            </>)}
        </div>
    )
}
