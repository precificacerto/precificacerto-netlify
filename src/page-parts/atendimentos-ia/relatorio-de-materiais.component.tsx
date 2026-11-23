/**
 * A ABA "Relatório de materiais" dos Relatórios I.A. (dono do produto, 16/11/2026): o que o pedido inteiro precisa, por categoria, na ordem
 * da base de conhecimento (Perfil, Persianas, Reforço…). Lê `/api/atendimentos-ia/orcamentos/[id]/relatorio-de-materiais`.
 *
 * A categoria é a da TABELA DE ONDE O PREÇO SAIU (22/11/2026), não o texto da linha. O que não tem categoria, ou tem mais de uma, aparece
 * numa lista própria, nomeado e com o motivo — nunca dentro de uma categoria escolhida. Cada categoria tem o total (custo bruto e líquido), e
 * o fim, o total geral do pedido; o total com um código sem custo gravado não sai, e diz qual. A esquadria sem cálculo é dita: os materiais
 * dela não estão no relatório (nunca um relatório que pareça completo sem estar).
 */
import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Empty, Spin, Table, Typography } from 'antd'
import { FolhaA4, SeletorDaVista, VISTA_PADRAO, type VistaDoRelatorio } from './folha-a4.component'
import { fraseDoTotalSemCusto, quantidadeNoRelatorio, reaisNoRelatorio, type MaterialDoRelatorio, type TotalDoGrupo } from '@/lib/atendimentos-ia/relatorio-de-materiais'
import type { RelatorioDeMateriaisDoOrcamento } from '@/lib/atendimentos-ia/relatorio-de-materiais-servidor'

type Estado = { tipo: 'carregando' } | { tipo: 'erro'; mensagem: string } | { tipo: 'pronto'; relatorio: RelatorioDeMateriaisDoOrcamento }

export const TEXTO_SEM_MATERIAL = 'Nenhum material calculado neste orçamento: calcule os itens para ver o relatório.'
export const fraseDosItensSemCalculo = (ordens: readonly number[]) =>
    `${ordens.length === 1 ? 'O item' : 'Os itens'} ${ordens.join(', ')} ${ordens.length === 1 ? 'não tem' : 'não têm'} cálculo: os materiais ${ordens.length === 1 ? 'dele' : 'deles'} não estão neste relatório.`

const colunas = [
    { title: 'Código', dataIndex: 'codigo', key: 'codigo', width: 120 },
    { title: 'Descrição', dataIndex: 'descricao', key: 'descricao', render: (d: string | null) => d ?? '—' },
    { title: 'Quantidade', key: 'quantidade', align: 'right' as const, width: 140, render: (_: unknown, m: MaterialDoRelatorio) => quantidadeNoRelatorio(m.quantidade, m.unidade) },
    { title: 'Custo bruto', key: 'custo_bruto', align: 'right' as const, width: 140, render: (_: unknown, m: MaterialDoRelatorio) => reaisNoRelatorio(m.custo_bruto) },
    { title: 'Custo líquido', key: 'custo_liquido', align: 'right' as const, width: 140, render: (_: unknown, m: MaterialDoRelatorio) => reaisNoRelatorio(m.custo_liquido) },
]

/** O total de um grupo: os dois custos, ou a frase que nomeia os códigos sem custo gravado. */
export function TotalDoGrupoNaTela({ nome, total, geral = false }: { nome: string; total: TotalDoGrupo; geral?: boolean }) {
    const texto = total.codigosSemCusto.length
        ? `${nome}: ${fraseDoTotalSemCusto(total.codigosSemCusto)}.`
        : `${nome}: custo bruto ${reaisNoRelatorio(total.custo_bruto)} · custo líquido ${reaisNoRelatorio(total.custo_liquido)}`
    return <Typography.Paragraph strong={geral} type={total.codigosSemCusto.length ? 'warning' : undefined} style={{ textAlign: 'right', margin: '6px 0 0' }} data-total={geral ? 'geral' : nome}>{texto}</Typography.Paragraph>
}

function TabelaDeMateriais({ materiais }: { materiais: readonly MaterialDoRelatorio[] }) {
    return <Table size="small" pagination={false} rowKey={(m) => `${m.codigo}-${m.unidade}`} columns={colunas} dataSource={[...materiais]} scroll={{ x: true }} />
}

export function RelatorioDeMateriais({ orcamentoId, numero, cliente, vistaInicial = VISTA_PADRAO }: { orcamentoId: string; numero: number; cliente: string; vistaInicial?: VistaDoRelatorio }) {
    const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' })
    // a FOLHA A4 é a vista padrão (dono do produto, 22/11/2026): o próprio PDF, pela mesma função do "Baixar PDF"
    const [vista, setVista] = useState<VistaDoRelatorio>(vistaInicial)
    const pronto = estado.tipo === 'pronto' ? estado.relatorio : null
    const gerar = useCallback(async () => {
        const m = await import('@/lib/atendimentos-ia/relatorios-em-pdf')
        return m.pdfDoRelatorioDeMateriais(pronto as NonNullable<typeof pronto>, { numero, cliente, geradoEm: new Date() })
    }, [pronto, numero, cliente])
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
    const { categorias, semCategoria, ambiguos, itensSemCalculo, totalGeral } = estado.relatorio
    const vazio = categorias.length === 0 && semCategoria.length === 0 && ambiguos.length === 0
    return (
        <div data-relatorio-de-materiais="">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <SeletorDaVista vista={vista} mudar={setVista} />
                <Button data-baixar-pdf="materiais" onClick={async () => { const m = await import('@/lib/atendimentos-ia/relatorios-em-pdf'); m.baixarPdf(await gerar(), m.nomeDoRelatorio('materiais', numero, cliente)) }}>Baixar PDF</Button>
            </div>
            {vista === 'a4' ? <FolhaA4 gerar={gerar} titulo="Relatório de materiais" /> : (<>
            {itensSemCalculo.length > 0 && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={fraseDosItensSemCalculo(itensSemCalculo)} data-itens-sem-calculo="" />}
            {vazio && <Empty description={TEXTO_SEM_MATERIAL} />}
            {categorias.map((c) => (
                <section key={c.chave} data-categoria={c.chave} style={{ marginBottom: 16 }}>
                    <Typography.Title level={5} style={{ marginBottom: 8 }}>{c.rotulo}</Typography.Title>
                    <TabelaDeMateriais materiais={c.materiais} />
                    <TotalDoGrupoNaTela nome={`Total de ${c.rotulo}`} total={c.total} />
                </section>
            ))}
            {ambiguos.length > 0 && (
                <section data-categoria="ambiguos" style={{ marginBottom: 16 }}>
                    <Typography.Title level={5} style={{ marginBottom: 4 }}>Em mais de uma categoria</Typography.Title>
                    <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
                        Nenhuma categoria é escolhida para estes códigos: {ambiguos.map((a) => `${a.codigo} (${a.categorias.join(', ')}: ${a.motivo})`).join('; ')}.
                    </Typography.Paragraph>
                    <TabelaDeMateriais materiais={ambiguos} />
                </section>
            )}
            {semCategoria.length > 0 && (
                <section data-categoria="sem-categoria">
                    <Typography.Title level={5} style={{ marginBottom: 4 }}>Sem categoria</Typography.Title>
                    <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
                        Sem a tabela de onde o preço saiu, com categoria: {semCategoria.map((m) => `${m.codigo} (${m.motivo})`).join('; ')}.
                    </Typography.Paragraph>
                    <TabelaDeMateriais materiais={semCategoria} />
                </section>
            )}
            {!vazio && <TotalDoGrupoNaTela nome="Total geral do pedido" total={totalGeral} geral />}
            </>)}
        </div>
    )
}
