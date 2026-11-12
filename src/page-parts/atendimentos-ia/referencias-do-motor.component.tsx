/**
 * A CONFERÊNCIA DE REFERÊNCIAS DO MOTOR, na tela (dono do produto, 12/11/2026): "será que não tem um comando para que você identifique se a
 * referência, o código, está dentro do sistema com alguma variável?". LISTAS NOMEADAS, nunca um número solto:
 *   - achadas com preço; achadas SEM preço; NÃO achadas; NÃO RESOLVIDAS (há candidatas e nenhuma vale — cada uma com a razão);
 *   - e, à parte, as achadas pelo sufixo do fornecedor cuja descrição é outra — o código casou, e alguém confere se é o mesmo produto.
 * A resolução é a MESMA do cálculo (`resolucao-de-referencia.ts`), no escopo do motor: o fornecedor e as famílias dele.
 * Cada código diz o peso (em quantas regras e tipologias), sob qual código foi achado e COMO, e, do item, o preço, os créditos (ICMS,
 * PIS/COFINS, IPI), o NCM, o fornecedor e a categoria. AUSENTE NÃO É ZERO: o que o fornecedor não informou aparece como "não informado".
 * A tela não calcula nada: tudo vem da rota (`ROTAS_DO_CATALOGO.referenciasDoMotor`), e a escada mora em `conferencia-de-referencias.ts`.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, Collapse, Space, Table, Tag, Typography } from 'antd'
import type { ItemAchado, ReferenciaConferida } from '@/lib/atendimentos-ia/conferencia-de-referencias'
import { ROTULO_DO_COMO, type ComoAchou } from '@/lib/atendimentos-ia/resolucao-de-referencia'
import { ROTAS_DO_CATALOGO } from '@/utils/atendimentos-ia-catalogo'
import { chamarRota } from '@/page-parts/atendimentos-ia/api'

export interface RespostaDasReferencias {
    motor: { id: string; nome: string | null; arquivado: boolean; fornecedor: string | null; familias: string[] }
    itens_nas_tabelas: number
    itens_no_escopo: number
    codigos: number
    regras: number
    achadas_com_preco: ReferenciaConferida[]
    achadas_sem_preco: ReferenciaConferida[]
    nao_achadas: ReferenciaConferida[]
    nao_resolvidas: ReferenciaConferida[]
    sufixo_com_outra_descricao: ReferenciaConferida[]
}

/** As listas, na ordem e com os nomes do pedido. */
export const LISTAS_DA_CONFERENCIA = [
    { chave: 'achadas_com_preco', titulo: 'Achadas com preço' },
    { chave: 'achadas_sem_preco', titulo: 'Achadas SEM preço' },
    { chave: 'nao_achadas', titulo: 'NÃO achadas na tabela do fornecedor do motor' },
    { chave: 'nao_resolvidas', titulo: 'NÃO resolvidas — há candidatas, e nenhuma vale: decida' },
    { chave: 'sufixo_com_outra_descricao', titulo: 'Achadas pelo sufixo do fornecedor, com outra descrição — confira se é o mesmo produto' },
] as const


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
                { title: 'Como achou', dataIndex: 'como', render: (v: ComoAchou | null) => (v === null ? '—' : <Tag color={v === 'exato' ? undefined : 'blue'}>{ROTULO_DO_COMO[v]}</Tag>) },
                { title: 'Na tabela', key: 'itens', render: (_: unknown, r) => (r.itens.length > 0 ? r.itens.map((i) => <DoItem key={`${i.tabela_id}-${i.codigo}`} i={i} />) : r.falta === null ? '—' : (
                    <div data-falta={r.codigo}>
                        <div>{r.falta.frase}</div>
                        {r.falta.candidatas.map((c) => <div key={`${c.item.tabela_id}-${c.item.codigo}`} data-candidata={c.item.codigo} style={{ marginTop: 4 }}><DoItem i={c.item} /><Typography.Text type="secondary">Não vale: {c.porque}.</Typography.Text></div>)}
                    </div>
                )) },
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
                    distintos em {dados.regras.toLocaleString('pt-BR')} regras, conferidos contra os {dados.itens_no_escopo.toLocaleString('pt-BR')} itens das tabelas
                    de {dados.motor.fornecedor ?? 'o fornecedor do motor'} ({dados.motor.familias.join(', ') || 'sem família'}) — de {dados.itens_nas_tabelas.toLocaleString('pt-BR')} itens em todas as tabelas.
                </Typography.Paragraph>
                <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                    A ordem: só as tabelas do fornecedor e da família do motor; o código exato; o mesmo código com ou sem o sufixo do fornecedor; a base com a
                    cor nomeada na descrição; e o código aproximado só com a descrição igual. Duas candidatas, ou a descrição que não bate, é falta nomeada —
                    nunca palpite. Abaixo, as listas, cada uma com o peso de cada código.
                </Typography.Paragraph>
                <Button size="small" onClick={carregar} loading={lendo} style={{ marginTop: 8 }}>Conferir de novo</Button>
            </Card>
            <Collapse defaultActiveKey={['achadas_sem_preco', 'nao_achadas', 'nao_resolvidas', 'sufixo_com_outra_descricao']}
                items={LISTAS_DA_CONFERENCIA.map(({ chave, titulo }) => ({
                    key: chave,
                    label: <span data-titulo={chave}>{titulo}: <strong>{dados[chave].length.toLocaleString('pt-BR')}</strong></span>,
                    children: dados[chave].length === 0 ? <Typography.Text type="secondary">Nenhuma.</Typography.Text> : <Lista chave={chave} linhas={dados[chave]} />,
                }))} />
        </Space>
    )
}
