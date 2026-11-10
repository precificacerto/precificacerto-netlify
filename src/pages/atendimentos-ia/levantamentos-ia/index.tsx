/**
 * /atendimentos-ia/levantamentos-ia — os LEVANTAMENTOS I.A. (dono do produto, 11/11/2026), a primeira das três seções de Agentes I.A.: a lista
 * dos levantamentos que a conversa gerou na empresa, do mais novo ao mais antigo, com o ARQUIVO de cada um (a mesma folha que a conversa envia,
 * aberta numa aba nova). Só lê: nada aqui altera o levantamento.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, Spin, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { FilePdfOutlined } from '@ant-design/icons'

import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { ROTULO_DO_ESTADO, type LinhaDoLevantamento } from '@/lib/atendimentos-ia/levantamentos-ia-tela'

type Estado =
    | { tipo: 'carregando' }
    | { tipo: 'desligada' }
    | { tipo: 'sem-permissao' }
    | { tipo: 'erro'; mensagem: string }
    | { tipo: 'pronto'; levantamentos: LinhaDoLevantamento[] }

export const TEXTO_DA_LISTA_VAZIA = 'Nenhum levantamento ainda. Os levantamentos que o agente gera na conversa aparecem nesta lista.'
export const urlDoArquivo = (id: string) => `/api/atendimentos-ia/levantamentos/${id}/arquivo`
const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

const LevantamentosIA: React.FC = () => {
    const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' })
    const carregar = useCallback(async () => {
        try {
            const r = await fetch('/api/atendimentos-ia/levantamentos')
            const corpo = (await r.json().catch(() => ({}))) as Record<string, unknown>
            if (r.status === 404) return setEstado({ tipo: 'desligada' })
            if (r.status === 403) return setEstado({ tipo: 'sem-permissao' })
            if (!r.ok) return setEstado({ tipo: 'erro', mensagem: String(corpo.error ?? 'Não foi possível ler os levantamentos.') })
            setEstado({ tipo: 'pronto', levantamentos: (corpo.levantamentos ?? []) as LinhaDoLevantamento[] })
        } catch {
            setEstado({ tipo: 'erro', mensagem: 'Não foi possível ler os levantamentos.' })
        }
    }, [])
    useEffect(() => { void carregar() }, [carregar])

    const colunas: ColumnsType<LinhaDoLevantamento> = [
        { title: 'Nº', dataIndex: 'numero', key: 'numero', width: 80 },
        { title: 'Cliente', dataIndex: 'nome', key: 'nome' },
        { title: 'Estado', dataIndex: 'estado', key: 'estado', width: 140, render: (e: string) => <Tag color={e === 'COMPLETO' ? 'green' : 'default'} data-estado-do-levantamento={e}>{ROTULO_DO_ESTADO[e] ?? e}</Tag> },
        { title: 'Vendedor', dataIndex: 'vendedor_nome', key: 'vendedor', width: 200, render: (v: string | null) => v ?? '—' },
        { title: 'Criado em', dataIndex: 'criado_em', key: 'criado_em', width: 160, render: (v: string) => quando(v) },
        {
            title: 'Arquivo', key: 'arquivo', width: 120, align: 'center',
            render: (_: unknown, l: LinhaDoLevantamento) => (
                <Button type="link" size="small" icon={<FilePdfOutlined />} href={urlDoArquivo(l.id)} target="_blank" rel="noopener noreferrer" aria-label={`Abrir o arquivo do levantamento ${l.numero}`}>Abrir</Button>
            ),
        },
    ]

    return (
        <Layout title={PAGE_TITLES.LEVANTAMENTOS_IA} subtitle="Agentes I.A.">
            <div data-pagina-dos-levantamentos-ia="" data-estado={estado.tipo}>
                {estado.tipo === 'carregando' && <div style={{ padding: 32, textAlign: 'center' }}><Spin /></div>}
                {estado.tipo === 'desligada' && <Alert type="info" showIcon message="O Atendimentos I.A. não está ligado nesta conta." />}
                {estado.tipo === 'sem-permissao' && <Alert type="warning" showIcon message="Você não tem permissão para ver os Levantamentos I.A." />}
                {estado.tipo === 'erro' && <Alert type="error" showIcon message={estado.mensagem} />}
                {estado.tipo === 'pronto' && (
                    <Card size="small">
                        <Table rowKey="id" columns={colunas} dataSource={estado.levantamentos} pagination={{ pageSize: 20, hideOnSinglePage: true }} scroll={{ x: 760 }}
                            locale={{ emptyText: <Typography.Text type="secondary">{TEXTO_DA_LISTA_VAZIA}</Typography.Text> }} />
                    </Card>
                )}
            </div>
        </Layout>
    )
}

export default LevantamentosIA
