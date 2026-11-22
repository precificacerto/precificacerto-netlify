/**
 * A ABA "Orientativo de montagem" dos Relatórios I.A. (dono do produto, 22/11/2026): por esquadria, no molde que a fábrica conhece — o desenho,
 * a tipologia e a medida no cabeçalho; depois PERFIS, ACESSÓRIOS, VIDRO e SERVIÇOS, nesta ordem. Lê
 * `/api/atendimentos-ia/orcamentos/[id]/orientativo-de-montagem`. Só leitura: não grava nada e não muda o preço.
 *
 * O que não veio é dito (lacuna nomeada), nunca preenchido: a cor e a posição do vidro, os serviços, a figura do acessório.
 */
import React, { useEffect, useState } from 'react'
import { Alert, Button, Card, Empty, Spin, Table, Typography } from 'antd'
import {
    COLUNAS_DO_VIDRO, COLUNAS_DOS_ACESSORIOS, COLUNAS_DOS_PERFIS, COLUNAS_DOS_SERVICOS, celulasDoAcessorio, celulasDoPerfil, celulasDoVidro,
    fimDoVidro, fimDosPerfis, medidaDaEsquadria, tituloDaEsquadria, type EsquadriaDoOrientativo,
} from '@/lib/atendimentos-ia/orientativo-de-montagem'
import type { OrientativoDoOrcamento } from '@/lib/atendimentos-ia/orientativo-de-montagem-servidor'

type Pronto = Exclude<OrientativoDoOrcamento, { semMigracao: string }>
type Estado = { tipo: 'carregando' } | { tipo: 'erro'; mensagem: string } | { tipo: 'pronto'; relatorio: Pronto }

export const TEXTO_SEM_ESQUADRIA = 'Nenhum item calculado neste orçamento: calcule os itens para ver o orientativo de montagem.'
const lista = (ordens: readonly number[]) => `${ordens.length === 1 ? 'O item' : 'Os itens'} ${ordens.join(', ')}`

/** Uma tabela a partir das colunas e das células comuns com o PDF. */
function Grade({ colunas, linhas, vazio }: { colunas: readonly string[]; linhas: string[][]; vazio?: string }) {
    return (
        <Table<{ k: string; l: string[] }> size="small" pagination={false} scroll={{ x: true }} rowKey="k"
            locale={{ emptyText: vazio ?? 'Nenhuma linha.' }}
            dataSource={linhas.map((l, k) => ({ k: String(k), l }))}
            columns={colunas.map((titulo, i) => ({ title: titulo, key: String(i), render: (_: unknown, r: { l: string[] }) => r.l[i] }))} />
    )
}

function Esquadria({ e }: { e: EsquadriaDoOrientativo }) {
    return (
        <Card size="small" style={{ marginBottom: 16 }} data-esquadria={e.ordem}
            title={<span data-titulo-da-esquadria="">{tituloDaEsquadria(e)}</span>}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 8 }}>
                <div style={{ width: 160, minHeight: 100, border: '1px solid #e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'center' }} data-desenho="">
                    {e.desenho
                        // o desenho vem como data URL do catálogo (já sem a tarja): `next/image` não otimiza data URL
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={e.desenho.dados} alt={`Desenho da tipologia ${e.tipologia ?? ''}`} style={{ maxWidth: '100%', maxHeight: 160 }} />
                        : <Typography.Text type="secondary" style={{ padding: 8, fontSize: 12 }} data-sem-desenho="">{e.semDesenho}</Typography.Text>}
                </div>
                <Typography.Text data-medida-da-esquadria="">{medidaDaEsquadria(e)}</Typography.Text>
            </div>
            {e.aviso && <Alert type="warning" showIcon style={{ marginBottom: 8 }} message={e.aviso} data-aviso-da-fonte="" />}
            <Typography.Title level={5} style={{ margin: '8px 0' }}>Perfis</Typography.Title>
            <Grade colunas={COLUNAS_DOS_PERFIS} linhas={e.perfis.linhas.map(celulasDoPerfil)} />
            <Typography.Paragraph strong style={{ textAlign: 'right', margin: '4px 0 0' }} data-fim-dos-perfis="">{fimDosPerfis(e.perfis)}</Typography.Paragraph>
            <Typography.Title level={5} style={{ margin: '8px 0' }}>Acessórios</Typography.Title>
            <Grade colunas={COLUNAS_DOS_ACESSORIOS} linhas={e.acessorios.map(celulasDoAcessorio)} />
            <Typography.Title level={5} style={{ margin: '8px 0' }}>Vidro</Typography.Title>
            <Grade colunas={COLUNAS_DO_VIDRO} linhas={e.vidros.linhas.map(celulasDoVidro)} />
            {e.vidros.linhas.length > 0 && <Typography.Paragraph strong style={{ textAlign: 'right', margin: '4px 0 0' }} data-fim-do-vidro="">{fimDoVidro(e.vidros)}</Typography.Paragraph>}
            <Typography.Title level={5} style={{ margin: '8px 0' }}>Serviços</Typography.Title>
            <Grade colunas={COLUNAS_DOS_SERVICOS} linhas={[]} vazio={e.servicos.falta} />
            {e.lacunas.length > 0 && (
                <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: '#8a6d00', fontSize: 12 }} data-lacunas="">
                    {e.lacunas.map((l) => <li key={l}>{l}</li>)}
                </ul>
            )}
        </Card>
    )
}

export function OrientativoDeMontagem({ orcamentoId, numero, cliente }: { orcamentoId: string; numero: number; cliente: string }) {
    const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' })
    useEffect(() => {
        let vivo = true
        setEstado({ tipo: 'carregando' })
        void (async () => {
            try {
                const r = await fetch(`/api/atendimentos-ia/orcamentos/${orcamentoId}/orientativo-de-montagem`)
                const corpo = (await r.json().catch(() => ({}))) as { relatorio?: Pronto; error?: string }
                if (!vivo) return
                if (!r.ok || !corpo.relatorio) return setEstado({ tipo: 'erro', mensagem: corpo.error ?? 'Não foi possível ler o orientativo de montagem.' })
                setEstado({ tipo: 'pronto', relatorio: corpo.relatorio })
            } catch {
                if (vivo) setEstado({ tipo: 'erro', mensagem: 'Não foi possível ler o orientativo de montagem.' })
            }
        })()
        return () => { vivo = false }
    }, [orcamentoId])

    if (estado.tipo === 'carregando') return <div style={{ padding: 24, textAlign: 'center' }}><Spin /></div>
    if (estado.tipo === 'erro') return <Alert type="error" showIcon message={estado.mensagem} />
    const r = estado.relatorio
    return (
        <div data-orientativo-de-montagem="">
            <div style={{ textAlign: 'right', marginBottom: 12 }}>
                <Button data-baixar-pdf="orientativo_de_montagem" onClick={async () => { const m = await import('@/lib/atendimentos-ia/relatorios-em-pdf'); m.baixarPdf(m.pdfDoOrientativoDeMontagem(r, { numero, cliente, geradoEm: new Date() }), m.nomeDoRelatorio('orientativo_de_montagem', numero, cliente)) }}>Baixar PDF</Button>
            </div>
            {r.itensSemCalculo.length > 0 && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={`${lista(r.itensSemCalculo)} sem cálculo: não estão neste orientativo.`} data-itens-sem-calculo="" />}
            {r.esquadrias.length === 0 && <Empty description={TEXTO_SEM_ESQUADRIA} />}
            {r.esquadrias.map((e) => <Esquadria key={e.ordem} e={e} />)}
            {r.esquadrias.length > 0 && (
                <Alert type="info" style={{ marginTop: 8 }} data-avisos-do-rodape="" message={<ul style={{ margin: 0, paddingLeft: 18 }}>{r.avisosDoRodape.map((a) => <li key={a}>{a}</li>)}</ul>} />
            )}
        </div>
    )
}
