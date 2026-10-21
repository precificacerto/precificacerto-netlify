/**
 * /atendimentos-ia/orcamentista — a página do Orçamentista, na seção ATENDIMENTOS I.A. do menu
 * (dono do produto, 21/10/2026). Por enquanto ENXUTA E HONESTA:
 *
 *   - no topo, o ESTADO DA CONEXÃO (conectado ou não, último estado registrado) e quantas pessoas
 *     estão liberadas. Sem conexão, uma linha dizendo isso e o link para Conectividade. A célula
 *     de conexão NÃO se repete aqui: conectar e mexer na lista é em Conectividade;
 *   - abaixo, os LEVANTAMENTOS (`orcamentista_pre_definicao`): código da conversa, quem pediu,
 *     quando e o estado. Hoje a lista está VAZIA, porque a conversa ainda não chega — e o estado
 *     vazio diz o que vai aparecer e o que falta para aparecer, em vez de uma tela em branco.
 *
 * LEITURA APENAS: nenhum botão, nenhuma escrita. Tudo pela rota `/api/atendimentos-ia/orcamentista/
 * painel`, que confere a seção, a permissão do módulo `orcamentista` e o tenant do usuário logado.
 * Seção desligada (404): a página não desenha o painel — a decisão é do servidor.
 */
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { Alert, Card, Spin, Tag, Typography } from 'antd'
import { CheckCircleOutlined, ClockCircleOutlined, InboxOutlined, LinkOutlined } from '@ant-design/icons'

import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { ROUTES } from '@/constants/routes'

export const TEXTO_SEM_CONEXAO = 'O WhatsApp do orçamentista ainda não foi conectado.'
export const TEXTO_DO_VAZIO_O_QUE_APARECE =
    'Aqui vão aparecer os levantamentos que o orçamentista fizer nas conversas pelo WhatsApp: o código da conversa, quem pediu, quando e o estado de cada um.'
export const TEXTO_DO_VAZIO_O_QUE_FALTA =
    'Ainda não há nenhum porque as mensagens do WhatsApp ainda não chegam ao orçamentista: a recepção das conversas está em construção.'

interface Levantamento { id: string; codigo: string; quemPediu: string | null; quando: string; estado: string | null }
interface Painel {
    conexao: { existe: boolean; conectado: boolean; conectadoEm: string | null }
    liberadas: number
    levantamentos: Levantamento[]
}
type Estado =
    | { tipo: 'carregando' }
    | { tipo: 'desligada' }
    | { tipo: 'sem-permissao' }
    | { tipo: 'erro'; mensagem: string }
    | { tipo: 'pronto'; painel: Painel }

const TRAVESSAO = '—'
const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : TRAVESSAO)
const pessoas = (n: number) => (n === 0 ? 'Nenhuma pessoa liberada' : n === 1 ? '1 pessoa liberada' : `${n} pessoas liberadas`)

function Conexao({ painel }: { painel: Painel }) {
    const { conexao, liberadas } = painel
    const liberadasEl = <span data-liberadas={liberadas}>{pessoas(liberadas)} para falar com ele</span>
    if (!conexao.existe) {
        return (
            <div data-conexao="sem-conexao">
                <Typography.Text>{TEXTO_SEM_CONEXAO}</Typography.Text>{' '}
                <Link href={ROUTES.CONNECTIVITY}><LinkOutlined /> Conectar em Conectividade</Link>
                <div style={{ marginTop: 4 }}><Typography.Text type="secondary">{liberadasEl}</Typography.Text></div>
            </div>
        )
    }
    return (
        <div data-conexao={conexao.conectado ? 'conectado' : 'desconectado'}>
            <Tag color={conexao.conectado ? 'green' : 'default'}>{conexao.conectado ? 'Conectado' : 'Desconectado'}</Tag>
            <Typography.Text type="secondary">último estado registrado{conexao.conectadoEm ? `, desde ${quando(conexao.conectadoEm)}` : ''}</Typography.Text>
            {' · '}
            <Typography.Text>{liberadasEl}</Typography.Text>
            {' · '}
            <Link href={ROUTES.CONNECTIVITY}>Gerenciar em Conectividade</Link>
        </div>
    )
}

function ListaVazia({ painel }: { painel: Painel }) {
    const passos = [
        { feito: painel.conexao.existe, texto: painel.conexao.existe ? 'WhatsApp do orçamentista conectado em Conectividade' : 'Conectar o WhatsApp do orçamentista em Conectividade' },
        { feito: painel.liberadas > 0, texto: painel.liberadas > 0 ? pessoas(painel.liberadas) : 'Liberar quem pode falar com ele, em Conectividade' },
        { feito: false, texto: 'A recepção das conversas pelo WhatsApp — em construção' },
    ]
    return (
        <div data-lista-vazia="" style={{ textAlign: 'center', padding: '32px 16px' }}>
            <InboxOutlined style={{ fontSize: 40, color: 'var(--ant-color-text-quaternary, #bfbfbf)' }} />
            <Typography.Title level={5} style={{ marginTop: 12 }}>Nenhum levantamento ainda</Typography.Title>
            <Typography.Paragraph type="secondary" style={{ maxWidth: 560, margin: '0 auto 8px' }}>{TEXTO_DO_VAZIO_O_QUE_APARECE}</Typography.Paragraph>
            <Typography.Paragraph style={{ maxWidth: 560, margin: '0 auto 16px' }}>{TEXTO_DO_VAZIO_O_QUE_FALTA}</Typography.Paragraph>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 auto', maxWidth: 480, textAlign: 'left' }}>
                {passos.map((p) => (
                    <li key={p.texto} data-passo={p.feito ? 'feito' : 'pendente'} style={{ padding: '4px 0' }}>
                        {p.feito ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : <ClockCircleOutlined style={{ color: '#faad14' }} />} {p.texto}
                    </li>
                ))}
            </ul>
        </div>
    )
}

function Lista({ painel }: { painel: Painel }) {
    if (painel.levantamentos.length === 0) return <ListaVazia painel={painel} />
    return (
        <div style={{ overflowX: 'auto' }}>
            <table className="ant-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                    <tr>
                        {['Código da conversa', 'Quem pediu', 'Quando', 'Estado'].map((t) => (
                            <th key={t} style={{ textAlign: 'left', padding: '8px 12px', whiteSpace: 'nowrap' }}>{t}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {painel.levantamentos.map((l) => (
                        <tr key={l.id} data-levantamento={l.id}>
                            <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}><Typography.Text code>{l.codigo}</Typography.Text></td>
                            <td style={{ padding: '8px 12px' }}>{l.quemPediu ?? TRAVESSAO}</td>
                            <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{quando(l.quando)}</td>
                            <td style={{ padding: '8px 12px' }} data-estado-do-levantamento="">{l.estado ?? TRAVESSAO}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

function Orcamentista() {
    const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' })

    useEffect(() => {
        let vivo = true
        ;(async () => {
            try {
                const r = await fetch('/api/atendimentos-ia/orcamentista/painel')
                const corpo = (await r.json().catch(() => ({}))) as Record<string, unknown>
                if (!vivo) return
                if (r.status === 404) return setEstado({ tipo: 'desligada' })
                if (r.status === 403) return setEstado({ tipo: 'sem-permissao' })
                if (!r.ok) return setEstado({ tipo: 'erro', mensagem: String(corpo.error ?? 'Não foi possível ler o Orçamentista.') })
                setEstado({ tipo: 'pronto', painel: corpo as unknown as Painel })
            } catch {
                if (vivo) setEstado({ tipo: 'erro', mensagem: 'Não foi possível ler o Orçamentista.' })
            }
        })()
        return () => { vivo = false }
    }, [])

    return (
        <Layout title={PAGE_TITLES.ORCAMENTISTA} subtitle="Atendimentos I.A.">
            <div data-pagina-do-orcamentista="" data-estado={estado.tipo}>
                {estado.tipo === 'carregando' && <div style={{ padding: 32, textAlign: 'center' }}><Spin /></div>}
                {estado.tipo === 'desligada' && <Alert type="info" showIcon message="O Atendimentos I.A. não está ligado nesta conta." />}
                {estado.tipo === 'sem-permissao' && <Alert type="warning" showIcon message="Você não tem permissão para ver o Orçamentista." />}
                {estado.tipo === 'erro' && <Alert type="error" showIcon message={estado.mensagem} />}
                {estado.tipo === 'pronto' && (
                    <div data-painel="">
                        <Card size="small" style={{ marginBottom: 16 }}>
                            <Conexao painel={estado.painel} />
                        </Card>
                        <Card title="Levantamentos" size="small">
                            <Lista painel={estado.painel} />
                        </Card>
                    </div>
                )}
            </div>
        </Layout>
    )
}

export default Orcamentista
