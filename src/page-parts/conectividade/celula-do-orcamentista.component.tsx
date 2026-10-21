/**
 * A célula do Atendimentos I.A. — Orçamentista, em Conectividade. Maquete aprovada pelo dono do
 * produto em 21/10/2026. É a PRIMEIRA da página, acima de "Sua conexão WhatsApp", que não muda.
 *
 * NÃO FALA COM O BANCO: as tabelas têm REVOKE ALL de anon e authenticated. Tudo pelas rotas de
 * `/api/atendimentos-ia/orcamentista/`, que conferem o tenant do usuário logado.
 * SÓ APARECE quando a seção está ligada para a conta: a rota responde 404 e o card não se
 * desenha. A decisão é do servidor — esconder aqui é consequência, não trava.
 *
 * A conexão daqui é a do ORÇAMENTISTA, da empresa — instância separada da de envio, que é por
 * usuário. Desconectar não toca na lista de autorizados.
 *
 * A lista mostra TODOS os funcionários ativos. Quem não tem telefone aparece com a chave
 * desligada e inoperante, escrito "sem telefone" — MEDIDO EM 21/10/2026: 1 de 16 funcionários da
 * plataforma tem telefone, e é assim que a tela abre hoje. O telefone se corrige no cadastro do
 * funcionário. Telefone do cadastro diferente do autorizado: aviso e botão para atualizar —
 * nunca sincroniza sozinho.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Button, Card, Space, Spin, Switch, Table, Tag, Tooltip, Typography } from 'antd'
import { QrcodeOutlined, DisconnectOutlined, RobotOutlined } from '@ant-design/icons'
import Link from 'next/link'

import { ROUTES } from '@/constants/routes'
import { phoneMask } from '@/utils/phone-br'

export const TITULO_DA_CELULA = 'Atendimentos I.A. — Orçamentista'
const BASE = '/api/atendimentos-ia/orcamentista'

interface Conexao {
    estado: 'conectado' | 'desconectado'
    conectadoPor: string | null
    conectadoEm: string | null
    numero: string | null
    motivoSemNumero: string | null
    aviso?: string
}

interface Linha {
    employee_id: string
    nome: string | null
    cargo: string | null
    telefone: string | null
    motivoSemTelefone: string | null
    autorizacao: { id: string; telefone: string; ativo: boolean } | null
    divergente: boolean
    podeLigar: boolean
    podeDesligar: boolean
}

const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : null)

async function lerJson(r: Response): Promise<Record<string, unknown>> {
    return (await r.json().catch(() => ({}))) as Record<string, unknown>
}

export function CelulaDoOrcamentista() {
    const [visivel, setVisivel] = useState<boolean | null>(null)
    const [conexao, setConexao] = useState<Conexao | null>(null)
    const [linhas, setLinhas] = useState<Linha[]>([])
    const [qr, setQr] = useState<string | null>(null)
    const [erro, setErro] = useState<string | null>(null)
    const [ocupado, setOcupado] = useState<string | null>(null)
    const espera = useRef<ReturnType<typeof setInterval> | null>(null)

    const carregarConexao = useCallback(async () => {
        const r = await fetch(`${BASE}/conexao`)
        if (r.status === 404) { setVisivel(false); return null }
        const corpo = await lerJson(r)
        if (!r.ok) { setVisivel(true); setErro(String(corpo.error ?? 'Não foi possível ler a conexão.')); return null }
        setVisivel(true)
        setConexao(corpo as unknown as Conexao)
        return corpo as unknown as Conexao
    }, [])

    const carregarLista = useCallback(async () => {
        const r = await fetch(`${BASE}/autorizados`)
        const corpo = await lerJson(r)
        if (r.ok) setLinhas((corpo.linhas as Linha[]) ?? [])
        else setErro(String(corpo.error ?? 'Não foi possível ler a lista.'))
    }, [])

    useEffect(() => {
        let vivo = true
        carregarConexao().then((c) => { if (vivo && c) carregarLista() })
        return () => { vivo = false; if (espera.current) clearInterval(espera.current) }
    }, [carregarConexao, carregarLista])

    const conectar = async () => {
        setErro(null); setOcupado('qr')
        const r = await fetch(`${BASE}/qr`, { method: 'POST' })
        const corpo = await lerJson(r)
        setOcupado(null)
        if (!r.ok) { setErro(String(corpo.error ?? 'Não foi possível gerar o QR Code.')); return }
        if (corpo.conectado) { await carregarConexao(); return }
        setQr(String(corpo.qr))
        if (espera.current) clearInterval(espera.current)
        espera.current = setInterval(async () => {
            const c = await carregarConexao()
            if (c?.estado === 'conectado') { setQr(null); if (espera.current) clearInterval(espera.current) }
        }, 3000)
    }

    const desconectar = async () => {
        setErro(null); setOcupado('desconectar')
        const r = await fetch(`${BASE}/conexao`, { method: 'DELETE' })
        const corpo = await lerJson(r)
        setOcupado(null)
        if (!r.ok) setErro(String(corpo.error ?? 'Não foi possível desconectar.'))
        await carregarConexao()
    }

    const agir = async (linha: Linha, acao: 'ligar' | 'desligar' | 'atualizar-telefone') => {
        setErro(null); setOcupado(linha.employee_id)
        const r = await fetch(`${BASE}/autorizados`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ employee_id: linha.employee_id, acao }),
        })
        const corpo = await lerJson(r)
        setOcupado(null)
        if (!r.ok) setErro(String(corpo.error ?? 'Não foi possível alterar o acesso.'))
        await carregarLista()
    }

    if (visivel === false) return null
    if (visivel === null) return <div style={{ textAlign: 'center', padding: 16 }}><Spin /></div>

    const conectado = conexao?.estado === 'conectado'

    return (
        <Card
            data-celula-do-orcamentista=""
            size="small"
            style={{ marginBottom: 24, borderRadius: 12 }}
            title={
                <Space wrap>
                    <RobotOutlined />
                    <span>{TITULO_DA_CELULA}</span>
                    <Tag color={conectado ? 'green' : 'default'} data-estado={conexao?.estado ?? ''}>{conectado ? 'Conectado' : 'Desconectado'}</Tag>
                </Space>
            }
            extra={conectado
                ? <Button danger icon={<DisconnectOutlined />} loading={ocupado === 'desconectar'} onClick={desconectar} data-desconectar="">Desconectar</Button>
                : <Button type="primary" icon={<QrcodeOutlined />} loading={ocupado === 'qr'} onClick={conectar} data-conectar="">Conectar via QR Code</Button>}
        >
            {conectado && (
                <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }} data-cabecalho-conectado="">
                    {conexao?.numero
                        ? <>Número {conexao.numero}</>
                        : <Tooltip title={conexao?.motivoSemNumero ?? undefined}><span>Número não informado</span></Tooltip>}
                    {conexao?.conectadoPor ? <> · conectado por {conexao.conectadoPor}</> : null}
                    {quando(conexao?.conectadoEm ?? null) ? <> em {quando(conexao?.conectadoEm ?? null)}</> : null}
                </Typography.Paragraph>
            )}
            {conexao?.aviso && <Alert type="warning" showIcon message={conexao.aviso} style={{ marginBottom: 12 }} />}
            {erro && <Alert type="error" showIcon message={erro} style={{ marginBottom: 12 }} data-erro-da-celula="" />}
            {qr && (
                <div style={{ textAlign: 'center', marginBottom: 16 }} data-qr-do-orcamentista="">
                    {/* `<img>` e não `next/image`: o QR é um data URI gerado na hora, sem nada a otimizar. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qr} alt="QR Code do orçamentista" style={{ width: 220, height: 220 }} />
                    <div style={{ fontSize: 12, color: '#888' }}>Leia com o WhatsApp do número da empresa para o orçamentista.</div>
                </div>
            )}

            <Typography.Title level={5} style={{ marginTop: 0 }}>Quem pode falar com o orçamentista</Typography.Title>
            <Table<Linha>
                size="small"
                rowKey="employee_id"
                pagination={false}
                dataSource={linhas}
                scroll={{ x: true }}
                onRow={(l) => ({ 'data-linha': l.employee_id } as React.HTMLAttributes<HTMLElement>)}
                columns={[
                    { title: 'Funcionário', dataIndex: 'nome', render: (v: string | null) => v ?? '—' },
                    { title: 'Cargo', dataIndex: 'cargo', render: (v: string | null) => v ?? '—' },
                    {
                        title: 'Telefone',
                        render: (_: unknown, l: Linha) => l.telefone
                            ? (
                                <div>
                                    <span>{phoneMask(l.telefone)}</span>
                                    {l.divergente && l.autorizacao && (
                                        <div data-divergente="">
                                            <Typography.Text type="warning" style={{ fontSize: 12 }}>
                                                Autorizado com {phoneMask(l.autorizacao.telefone)}, diferente do cadastro.
                                            </Typography.Text>{' '}
                                            <Button size="small" type="link" loading={ocupado === l.employee_id} onClick={() => agir(l, 'atualizar-telefone')}>
                                                Usar o do cadastro
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            )
                            : (
                                <span data-sem-telefone="">
                                    <Tooltip title={l.motivoSemTelefone ?? undefined}><Typography.Text type="secondary">sem telefone</Typography.Text></Tooltip>{' '}
                                    <Link href={ROUTES.EMPLOYEES}>cadastro do funcionário</Link>
                                </span>
                            ),
                    },
                    {
                        title: 'Acesso',
                        render: (_: unknown, l: Linha) => {
                            const ligado = l.autorizacao?.ativo === true
                            const operavel = ligado ? l.podeDesligar : l.podeLigar
                            return (
                                <Switch
                                    checked={ligado}
                                    disabled={!operavel}
                                    loading={ocupado === l.employee_id}
                                    onChange={() => { if (operavel) agir(l, ligado ? 'desligar' : 'ligar') }}
                                    data-chave={l.employee_id}
                                />
                            )
                        },
                    },
                ]}
            />
        </Card>
    )
}
