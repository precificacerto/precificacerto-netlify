/**
 * AS ABAS POR COR da tabela de perfis (dono do produto, pedido 0055): o quadro "cor × quantidade de referências", o que falta em cada cor contra
 * o BRANCO, e uma aba por cor com os itens (referência, código do fornecedor, descrição, preço e barra). Só mostra o que a rota `/conteudo` leu
 * do banco (`perfis_por_cor`); a tabela sem item com cor não monta este cartão. Nada pelo cliente do Supabase.
 */
import React from 'react'
import { Card, Empty, Space, Table, Tabs, Typography } from 'antd'
import type { ItemDaAba, PerfisPorCor } from '@/utils/atendimentos-ia-abas-por-cor'
import { COR_BASE_DAS_ABAS } from '@/utils/atendimentos-ia-abas-por-cor'

const nenhum = <Typography.Text type="secondary">—</Typography.Text>
const dinheiro = (v: number | null) => (v === null ? nenhum : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
const lista = (xs: readonly string[], max = 30) => `${xs.slice(0, max).join(', ')}${xs.length > max ? ` e mais ${xs.length - max}` : ''}`

export function PerfisPorCorCard({ perfis }: { perfis: PerfisPorCor }) {
    const faltaDe = (cor: string) => perfis.faltas.find((f) => f.cor === cor)
    return (
        <Card size="small" title="Perfis por cor" data-perfis-por-cor>
            <Space direction="vertical" style={{ width: '100%' }}>
                <Table
                    size="small"
                    rowKey="cor"
                    pagination={false}
                    dataSource={perfis.quadro}
                    onRow={(q) => ({ 'data-quadro-cor': q.cor } as React.HTMLAttributes<HTMLElement>)}
                    columns={[
                        { title: 'Cor', dataIndex: 'cor' },
                        { title: 'Referências', align: 'right', render: (_, q) => <span data-referencias>{q.referencias}</span> },
                        { title: 'Itens sem referência', align: 'right', render: (_, q) => <span data-sem-referencia>{q.semReferencia}</span> },
                        { title: `Faltam contra o ${COR_BASE_DAS_ABAS}`, render: (_, q) => {
                            if (q.cor === COR_BASE_DAS_ABAS) return nenhum
                            const f = faltaDe(q.cor)
                            return f && f.faltam.length > 0 ? <span data-faltam>{f.faltam.length}</span> : <span data-faltam>0</span>
                        } },
                    ]}
                />
                <Tabs
                    size="small"
                    type="card"
                    items={perfis.abas.map((a) => {
                        const f = faltaDe(a.cor)
                        return {
                            key: a.cor,
                            label: a.cor,
                            children: (
                                <Space direction="vertical" style={{ width: '100%' }}>
                                    {f && f.faltam.length > 0 && (
                                        <Typography.Text data-faltas-da-aba={a.cor} type="warning">
                                            Falta nesta aba (tem no {COR_BASE_DAS_ABAS}): {lista(f.faltam)}
                                        </Typography.Text>
                                    )}
                                    {f && f.sobram.length > 0 && (
                                        <Typography.Text data-sobras-da-aba={a.cor} type="secondary">
                                            Só desta aba (não tem no {COR_BASE_DAS_ABAS}): {lista(f.sobram)}
                                        </Typography.Text>
                                    )}
                                    <Table<ItemDaAba>
                                        size="small"
                                        rowKey="codigo"
                                        pagination={false}
                                        dataSource={a.itens}
                                        locale={{ emptyText: <Empty description="Nenhum item nesta aba." /> }}
                                        columns={[
                                            { title: 'Referência', render: (_, i) => i.referencia_perfil ?? <Typography.Text type="danger">sem referência</Typography.Text> },
                                            { title: 'Código do fornecedor', dataIndex: 'codigo' },
                                            { title: 'Descrição', render: (_, i) => i.descricao ?? nenhum },
                                            { title: 'Preço', align: 'right', render: (_, i) => dinheiro(i.custo) },
                                            { title: 'Barra (m)', align: 'right', render: (_, i) => (i.medida_barra_m === null ? nenhum : String(i.medida_barra_m).replace('.', ',')) },
                                        ]}
                                    />
                                </Space>
                            ),
                        }
                    })}
                />
            </Space>
        </Card>
    )
}
