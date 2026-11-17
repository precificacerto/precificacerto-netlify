/**
 * A ABA "Relatório de materiais" dos Relatórios I.A. (dono do produto, 16/11/2026): o que o pedido inteiro precisa, por categoria, na ordem
 * da base de conhecimento (Perfil, Persianas, Reforço…). Lê `/api/atendimentos-ia/orcamentos/[id]/relatorio-de-materiais`.
 *
 * O que não tem categoria, ou tem mais de uma, aparece numa lista própria, nomeado — nunca dentro de uma categoria escolhida. A esquadria sem
 * cálculo é dito: os materiais dele não estão no relatório (nunca um relatório que pareça completo sem estar).
 */
import React, { useEffect, useState } from 'react'
import { Alert, Button, Empty, Spin, Table, Typography } from 'antd'
import { quantidadeNoRelatorio, type MaterialDoRelatorio } from '@/lib/atendimentos-ia/relatorio-de-materiais'
import type { RelatorioDeMateriaisDoOrcamento } from '@/lib/atendimentos-ia/relatorio-de-materiais-servidor'

type Estado = { tipo: 'carregando' } | { tipo: 'erro'; mensagem: string } | { tipo: 'pronto'; relatorio: RelatorioDeMateriaisDoOrcamento }

export const TEXTO_SEM_MATERIAL = 'Nenhum material calculado neste orçamento: calcule os itens para ver o relatório.'
export const fraseDosItensSemCalculo = (ordens: readonly number[]) =>
    `${ordens.length === 1 ? 'O item' : 'Os itens'} ${ordens.join(', ')} ${ordens.length === 1 ? 'não tem' : 'não têm'} cálculo: os materiais ${ordens.length === 1 ? 'dele' : 'deles'} não estão neste relatório.`

const colunas = [
    { title: 'Código', dataIndex: 'codigo', key: 'codigo', width: 120 },
    { title: 'Descrição', dataIndex: 'descricao', key: 'descricao', render: (d: string | null) => d ?? '—' },
    { title: 'Quantidade', key: 'quantidade', align: 'right' as const, width: 140, render: (_: unknown, m: MaterialDoRelatorio) => quantidadeNoRelatorio(m.quantidade, m.unidade) },
]

function TabelaDeMateriais({ materiais }: { materiais: readonly MaterialDoRelatorio[] }) {
    return <Table size="small" pagination={false} rowKey={(m) => `${m.codigo}-${m.unidade}`} columns={colunas} dataSource={[...materiais]} scroll={{ x: true }} />
}

export function RelatorioDeMateriais({ orcamentoId, numero, cliente }: { orcamentoId: string; numero: number; cliente: string }) {
    const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' })
    useEffect(() => {
        let vivo = true
        setEstado({ tipo: 'carregando' })
        void (async () => {
            try {
                const r = await fetch(`/api/atendimentos-ia/orcamentos/${orcamentoId}/relatorio-de-materiais`)
                const corpo = (await r.json().catch(() => ({}))) as { relatorio?: RelatorioDeMateriaisDoOrcamento; error?: string }
                if (!vivo) return
                if (!r.ok || !corpo.relatorio) return setEstado({ tipo: 'erro', mensagem: corpo.error ?? 'Não foi possível ler o relatório de materiais.' })
                setEstado({ tipo: 'pronto', relatorio: corpo.relatorio })
            } catch {
                if (vivo) setEstado({ tipo: 'erro', mensagem: 'Não foi possível ler o relatório de materiais.' })
            }
        })()
        return () => { vivo = false }
    }, [orcamentoId])

    if (estado.tipo === 'carregando') return <div style={{ padding: 24, textAlign: 'center' }}><Spin /></div>
    if (estado.tipo === 'erro') return <Alert type="error" showIcon message={estado.mensagem} />
    const { categorias, semCategoria, ambiguos, itensSemCalculo } = estado.relatorio
    const vazio = categorias.length === 0 && semCategoria.length === 0 && ambiguos.length === 0
    return (
        <div data-relatorio-de-materiais="">
            <div style={{ textAlign: 'right', marginBottom: 12 }}>
                <Button data-baixar-pdf="materiais" onClick={async () => { const r = estado.relatorio; const m = await import('@/lib/atendimentos-ia/relatorios-em-pdf'); m.baixarPdf(m.pdfDoRelatorioDeMateriais(r, { numero, cliente, geradoEm: new Date() }), m.nomeDoRelatorio('materiais', numero, cliente)) }}>Baixar PDF</Button>
            </div>
            {itensSemCalculo.length > 0 && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={fraseDosItensSemCalculo(itensSemCalculo)} data-itens-sem-calculo="" />}
            {vazio && <Empty description={TEXTO_SEM_MATERIAL} />}
            {categorias.map((c) => (
                <section key={c.chave} data-categoria={c.chave} style={{ marginBottom: 16 }}>
                    <Typography.Title level={5} style={{ marginBottom: 8 }}>{c.rotulo}</Typography.Title>
                    <TabelaDeMateriais materiais={c.materiais} />
                </section>
            ))}
            {ambiguos.length > 0 && (
                <section data-categoria="ambiguos" style={{ marginBottom: 16 }}>
                    <Typography.Title level={5} style={{ marginBottom: 4 }}>Em mais de uma categoria</Typography.Title>
                    <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
                        Estes códigos estão em tabelas de categorias diferentes, e nenhuma é escolhida: {ambiguos.map((a) => `${a.codigo} (${a.categorias.join(', ')})`).join('; ')}.
                    </Typography.Paragraph>
                    <TabelaDeMateriais materiais={ambiguos} />
                </section>
            )}
            {semCategoria.length > 0 && (
                <section data-categoria="sem-categoria">
                    <Typography.Title level={5} style={{ marginBottom: 4 }}>Sem categoria</Typography.Title>
                    <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>Estes códigos não estão em nenhuma tabela de preço da conta com categoria.</Typography.Paragraph>
                    <TabelaDeMateriais materiais={semCategoria} />
                </section>
            )}
        </div>
    )
}
