/**
 * A CONFERÊNCIA DE REFERÊNCIAS DO MOTOR, na tela (dono do produto, 12/11/2026): "será que não tem um comando para que você identifique se a
 * referência, o código, está dentro do sistema com alguma variável?". QUATRO LISTAS NOMEADAS, nunca um número solto:
 *   - achadas com preço; achadas SEM preço; NÃO achadas; achadas só por PALPITE de descrição (para alguém confirmar);
 *   - e, à parte, as achadas sem o sufixo do fornecedor cuja descrição é outra — o código casou, e alguém confere se é o mesmo produto.
 * Cada código diz o peso (em quantas regras e tipologias), sob qual código foi achado e por qual degrau, e, do item, o preço, os créditos (ICMS,
 * PIS/COFINS, IPI), o NCM, o fornecedor e a categoria. AUSENTE NÃO É ZERO: o que o fornecedor não informou aparece como "não informado".
 * A tela não calcula nada: tudo vem da rota (`ROTAS_DO_CATALOGO.referenciasDoMotor`), e a escada mora em `conferencia-de-referencias.ts`.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, Collapse, Space, Table, Tag, Typography } from 'antd'
import type { ItemAchado, ReferenciaConferida } from '@/lib/atendimentos-ia/conferencia-de-referencias'
import { ROTAS_DO_CATALOGO } from '@/utils/atendimentos-ia-catalogo'
import { chamarRota } from '@/page-parts/atendimentos-ia/api'

export interface RespostaDasReferencias {
    motor: { id: string; nome: string | null; arquivado: boolean }
    itens_nas_tabelas: number
    codigos: number
    regras: number
    achadas_com_preco: ReferenciaConferida[]
    achadas_sem_preco: ReferenciaConferida[]
    nao_achadas: ReferenciaConferida[]
    por_palpite: ReferenciaConferida[]
    sem_sufixo_com_outra_descricao: ReferenciaConferida[]
}

/** As listas, na ordem e com os nomes do pedido. */
export const LISTAS_DA_CONFERENCIA = [
    { chave: 'achadas_com_preco', titulo: 'Achadas com preço' },
    { chave: 'achadas_sem_preco', titulo: 'Achadas SEM preço' },
    { chave: 'nao_achadas', titulo: 'NÃO achadas em tabela nenhuma' },
    { chave: 'por_palpite', titulo: 'Achadas só por palpite de descrição — confirme' },
    { chave: 'sem_sufixo_com_outra_descricao', titulo: 'Achadas sem o sufixo do fornecedor, com outra descrição — confira se é o mesmo produto' },
] as const

export const ROTULO_DO_DEGRAU: Record<string, string> = {
    exato: 'código exato',
    sem_sufixo: 'código sem o sufixo do fornecedor',
    base_e_cor: 'base + cor, com a descrição igual',
    palpite_por_descricao: 'PALPITE pela descrição',
}

const NAO_INFORMADO = 'não informado'
const pct = (v: number | null) => (v === null ? NAO_INFORMADO : `${v.toLocaleString('pt-BR')}%`)
const reais = (v: number | null) => (v === null ? NAO_INFORMADO : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))

function DoItem({ i }: { i: ItemAchado }) {
    return (
        <div data-item={i.codigo} style={{ marginBottom: 8 }}>
            <div><strong>{i.codigo}</strong> — {i.descricao ?? NAO_INFORMADO}</div>
            <div>{i.fornecedor ?? NAO_INFORMADO} · {i.categoria ?? 'sem categoria'} · {i.tabela_arquivo ?? NAO_INFORMADO}</div>
            <div>Custo: {reais(i.preco.custo)} · barra: {reais(i.preco.valor_barra)} · metro: {reais(i.preco.valor_metro)}</div>
            <div>Crédito: ICMS {pct(i.credito.icms)} · PIS/COFINS {pct(i.credito.pis_cofins)} · IPI {pct(i.credito.ipi)} · IPI não creditável {pct(i.credito.ipi_nao_creditavel)} · NCM {i.ncm ?? NAO_INFORMADO}</div>
        </div>
    )
}

function Lista({ chave, linhas }: { chave: string; linhas: ReferenciaConferida[] }) {
    return (
        <Table<ReferenciaConferida>
            data-lista={chave} size="small" rowKey="codigo" dataSource={linhas} pagination={{ pageSize: 50, hideOnSinglePage: true }} scroll={{ x: true }}
            columns={[
                { title: 'Código no motor', dataIndex: 'codigo', render: (v: string) => <strong data-codigo={v}>{v}</strong> },
                { title: 'WVetro', dataIndex: 'codigo_wvetro', render: (v: string | null) => v ?? '—' },
                { title: 'Descrição no motor', dataIndex: 'descricao', render: (v: string | null) => v ?? NAO_INFORMADO },
                { title: 'Regras', dataIndex: 'regras', align: 'right' },
                { title: 'Tipologias', dataIndex: 'tipologias', align: 'right' },
                { title: 'Achada por', dataIndex: 'degrau', render: (v: string | null) => (v === null ? '—' : <Tag color={v === 'palpite_por_descricao' ? 'orange' : undefined}>{ROTULO_DO_DEGRAU[v] ?? v}</Tag>) },
                { title: 'Na tabela', key: 'itens', render: (_: unknown, r) => (r.itens.length === 0 ? '—' : r.itens.map((i) => <DoItem key={`${i.tabela_id}-${i.codigo}`} i={i} />)) },
            ]}
        />
    )
}

export function ReferenciasDoMotor({ motorId }: { motorId: string }) {
    const [dados, setDados] = useState<RespostaDasReferencias | null>(null)
    const [erro, setErro] = useState<string | null>(null)
    const [lendo, setLendo] = useState(false)

    const carregar = useCallback(async () => {
        setLendo(true)
        try {
            setDados(await chamarRota<RespostaDasReferencias>(ROTAS_DO_CATALOGO.referenciasDoMotor(motorId)))
            setErro(null)
        } catch (e) {
            setErro((e as Error).message)
        } finally {
            setLendo(false)
        }
    }, [motorId])
    useEffect(() => { carregar() }, [carregar])

    if (erro) return <Alert type="error" showIcon message="Não foi possível conferir as referências do motor." description={erro} action={<Button onClick={carregar}>Tentar de novo</Button>} data-erro />
    if (!dados) return <Card loading={lendo} />
    return (
        <Space direction="vertical" style={{ width: '100%' }}>
            <Card data-resumo>
                <Typography.Paragraph style={{ marginBottom: 0 }}>
                    Motor <strong>{dados.motor.nome ?? dados.motor.id}</strong>{dados.motor.arquivado ? ' (arquivado)' : ''}: {dados.codigos.toLocaleString('pt-BR')} códigos
                    distintos em {dados.regras.toLocaleString('pt-BR')} regras, conferidos contra {dados.itens_nas_tabelas.toLocaleString('pt-BR')} itens das tabelas de preço.
                </Typography.Paragraph>
                <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                    A ordem do casamento: o código exato; o código do item sem o sufixo do fornecedor; a base com a cor, só com a descrição igual (o prefixo
                    sozinho não vale); e, por último, a descrição — que é palpite, nunca achado. Abaixo, as listas, cada uma com o peso de cada código.
                </Typography.Paragraph>
                <Button size="small" onClick={carregar} loading={lendo} style={{ marginTop: 8 }}>Conferir de novo</Button>
            </Card>
            <Collapse defaultActiveKey={['achadas_sem_preco', 'nao_achadas', 'por_palpite', 'sem_sufixo_com_outra_descricao']}
                items={LISTAS_DA_CONFERENCIA.map(({ chave, titulo }) => ({
                    key: chave,
                    label: <span data-titulo={chave}>{titulo}: <strong>{dados[chave].length.toLocaleString('pt-BR')}</strong></span>,
                    children: dados[chave].length === 0 ? <Typography.Text type="secondary">Nenhuma.</Typography.Text> : <Lista chave={chave} linhas={dados[chave]} />,
                }))} />
        </Space>
    )
}
