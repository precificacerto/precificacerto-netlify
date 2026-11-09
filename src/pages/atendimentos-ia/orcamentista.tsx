/**
 * /atendimentos-ia/orcamentista — "Conectividade I.A.", na seção Agentes I.A. do menu.
 *
 * É SÓ A LIGAÇÃO (dono do produto, 09/11/2026: "Conectividade é a ligação; levantamentos é os arquivos gerados sobre a conversa"): o ESTADO DA
 * CONEXÃO (conectado ou não, último estado registrado) e quantas pessoas estão liberadas. Sem conexão, uma linha dizendo isso e o link para
 * Conectividade. A célula de conexão NÃO se repete aqui: conectar e mexer na lista é em Conectividade.
 *
 * A lista de levantamentos que esta página mostrava (`orcamentista_pre_definicao`, a estrutura antiga da conversa) SAIU: os levantamentos ganham
 * seção própria, "Levantamentos I.A.", alimentada por `orcamentista_levantamento` — a desenhar. A rota do painel ainda devolve a lista antiga, sem
 * ninguém a mostrar.
 *
 * LEITURA APENAS: nenhum botão, nenhuma escrita. Tudo pela rota `/api/atendimentos-ia/orcamentista/painel`, que confere a seção, a permissão do
 * módulo `orcamentista` e o tenant do usuário logado. Seção desligada (404): a página não desenha o painel — a decisão é do servidor.
 */
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { Alert, Card, Spin, Tag, Typography } from 'antd'
import { LinkOutlined } from '@ant-design/icons'

import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { ROUTES } from '@/constants/routes'

export const TEXTO_SEM_CONEXAO = 'O WhatsApp do orçamentista ainda não foi conectado.'
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
                        <Card size="small">
                            <Conexao painel={estado.painel} />
                        </Card>
                    </div>
                )}
            </div>
        </Layout>
    )
}

export default Orcamentista
