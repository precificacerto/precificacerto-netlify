/**
 * /atendimentos-ia/relatorios-ia — os RELATÓRIOS I.A. (dono do produto, 11/11/2026), a terceira seção de Agentes I.A.: por CLIENTE ORÇADO
 * (um orçamento I.A.), duas abas — o relatório de materiais e o relatório de corte. Nesta entrega a seção nasce com a NAVEGAÇÃO e a ESTRUTURA:
 * a escolha do orçamento e as duas abas, ainda sem conteúdo, e a tela diz isso (nunca uma tabela vazia que pareça "sem material").
 */
import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Card, Empty, Select, Spin, Tabs, Typography } from 'antd'

import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'

type OrcamentoParaRelatorio = { id: string; numero: number; nome: string }
type Estado =
    | { tipo: 'carregando' }
    | { tipo: 'desligada' }
    | { tipo: 'sem-permissao' }
    | { tipo: 'erro'; mensagem: string }
    | { tipo: 'pronto'; orcamentos: OrcamentoParaRelatorio[] }

export const ABAS_DOS_RELATORIOS = [
    { key: 'materiais', label: 'Relatório de materiais' },
    { key: 'corte', label: 'Relatório de corte' },
] as const
export const TEXTO_DA_ABA_SEM_CONTEUDO = 'Este relatório ainda não foi construído: a seção e a navegação já existem, o conteúdo entra numa próxima entrega.'
export const TEXTO_SEM_ORCAMENTO = 'Escolha o cliente orçado para ver os relatórios.'

const RelatoriosIA: React.FC = () => {
    const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' })
    const [escolhido, setEscolhido] = useState<string | null>(null)
    const carregar = useCallback(async () => {
        try {
            const r = await fetch('/api/atendimentos-ia/orcamentos')
            const corpo = (await r.json().catch(() => ({}))) as Record<string, unknown>
            if (r.status === 404) return setEstado({ tipo: 'desligada' })
            if (r.status === 403) return setEstado({ tipo: 'sem-permissao' })
            if (!r.ok) return setEstado({ tipo: 'erro', mensagem: String(corpo.error ?? 'Não foi possível ler os orçamentos.') })
            setEstado({ tipo: 'pronto', orcamentos: (corpo.orcamentos ?? []) as OrcamentoParaRelatorio[] })
        } catch {
            setEstado({ tipo: 'erro', mensagem: 'Não foi possível ler os orçamentos.' })
        }
    }, [])
    useEffect(() => { void carregar() }, [carregar])

    return (
        <Layout title={PAGE_TITLES.RELATORIOS_IA} subtitle="Agentes I.A.">
            <div data-pagina-dos-relatorios-ia="" data-estado={estado.tipo}>
                {estado.tipo === 'carregando' && <div style={{ padding: 32, textAlign: 'center' }}><Spin /></div>}
                {estado.tipo === 'desligada' && <Alert type="info" showIcon message="O Atendimentos I.A. não está ligado nesta conta." />}
                {estado.tipo === 'sem-permissao' && <Alert type="warning" showIcon message="Você não tem permissão para ver os Relatórios I.A." />}
                {estado.tipo === 'erro' && <Alert type="error" showIcon message={estado.mensagem} />}
                {estado.tipo === 'pronto' && (
                    <Card size="small">
                        <Select style={{ width: '100%', maxWidth: 420, marginBottom: 16 }} placeholder="Cliente orçado" aria-label="Cliente orçado" value={escolhido ?? undefined}
                            onChange={(v: string) => setEscolhido(v)} options={estado.orcamentos.map((o) => ({ value: o.id, label: `Orçamento ${o.numero} — ${o.nome}` }))}
                            notFoundContent="Nenhum orçamento ainda." />
                        {escolhido === null ? <Typography.Paragraph type="secondary" data-sem-orcamento="">{TEXTO_SEM_ORCAMENTO}</Typography.Paragraph> : (
                            <Tabs items={ABAS_DOS_RELATORIOS.map((a) => ({
                                key: a.key, label: a.label,
                                children: <div data-aba-do-relatorio={a.key}><Empty description={TEXTO_DA_ABA_SEM_CONTEUDO} /></div>,
                            }))} />
                        )}
                    </Card>
                )}
            </div>
        </Layout>
    )
}

export default RelatoriosIA
