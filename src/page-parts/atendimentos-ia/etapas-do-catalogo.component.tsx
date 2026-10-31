/**
 * O CATÁLOGO DE ETAPAS, na quarta aba do nicho, ao lado de Motores (dono do produto, 31/10/2026; migração 20261031000002): "Vamos criar a aba das
 * etapas para que a gente consiga partir dela, alimentar ela, fazer as integrações, as divisões corretas, informando onde vai cada coisa". E: "O
 * apanhado, o levantamento, a definição de cada etapa, qual motor vai ser colocado, eu vou determinar manualmente." A aba é só a estrutura: CRIAR,
 * RENOMEAR/EDITAR (nome, ação, abas) e REMOVER. Nada aqui inventa etapa.
 *
 * O ITEM É O NOME, A AÇÃO (da lista fechada) E AS ABAS da planilha que a etapa carrega — "técnico, igual para toda empresa". A conta SELECIONA o item na
 * base de conhecimento e guarda a instrução, o número e o motor. Editar vale também com uso: a tela diz quantas etapas de conta o usam, porque a
 * mudança chega a todas. REMOVER o item em uso é RECUSA NOMEADA (empresa · família · número), nunca cascata — a lista "Quem usa" já mostra isso.
 *
 * O catálogo é GLOBAL, como o de famílias (`AVISO_DA_ETAPA_GLOBAL`). Tudo pelas rotas; a falha de leitura aparece como ERRO, nunca como lista vazia
 * (`ausente-vs-falso.md`). A recusa aparece dentro do modal da ação, e o modal não fecha.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, Checkbox, Empty, Input, Modal, Select, Space, Table, Tag, Typography, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { chamarRota } from '@/page-parts/atendimentos-ia/api'
import {
    ABAS_DA_ETAPA, ACOES_DA_ETAPA, LIMITE_DO_NOME_DA_ETAPA, ROTULO_DA_ABA, ROTULO_DA_ACAO, abasEmOrdem, etapaDoCatalogoMudou, rotaDaEtapaDoCatalogo,
    rotaDoCatalogoDeEtapas, type AcaoDaEtapa, type EtapaDoCatalogo,
} from '@/utils/atendimentos-ia-etapas'

export const TITULO_DO_CATALOGO_DE_ETAPAS = 'Etapas'
export const SEM_ETAPA_NO_CATALOGO = 'Nenhuma etapa no catálogo.'
export const AVISO_DA_ETAPA_GLOBAL =
    'As etapas são da plataforma, não do nicho: a lista é a mesma em todos os nichos. Cada item diz o nome, a ação e as abas do motor que a etapa carrega; '
    + 'a conta escolhe o item na base de conhecimento e escreve a instrução dela.'
export const AVISO_DA_EDICAO_COM_USO = (n: number) =>
    `Este item é usado por ${n} etapa(s) de conta: a mudança vale para todas elas.`
export const AVISO_DA_REMOCAO_DA_ETAPA = 'O item sai do catálogo. Item em uso não sai: a recusa diz quem o usa (empresa · família · número da etapa).'
export const fraseDaRemocaoDaEtapa = (nome: string) => `Remover a etapa "${nome}" do catálogo?`
export const usoNaLista = (u: EtapaDoCatalogo['usos'][number]) => `${u.empresa} · ${u.familia} · etapa ${u.numero}`

type Edicao = { modo: 'criar' } | { modo: 'editar'; item: EtapaDoCatalogo }

export function EtapasDoCatalogo() {
    const [itens, setItens] = useState<EtapaDoCatalogo[] | null>(null)
    const [erroAoLer, setErroAoLer] = useState<string | null>(null)
    const [edicao, setEdicao] = useState<Edicao | null>(null)
    const [nome, setNome] = useState('')
    const [acao, setAcao] = useState<AcaoDaEtapa | null>(null)
    const [abas, setAbas] = useState<string[]>([])
    const [erro, setErro] = useState<string | null>(null)
    const [salvando, setSalvando] = useState(false)
    const [removendo, setRemovendo] = useState<EtapaDoCatalogo | null>(null)
    const [erroAoRemover, setErroAoRemover] = useState<string | null>(null)

    const carregar = useCallback(async () => {
        try {
            setItens(await chamarRota<EtapaDoCatalogo[]>(rotaDoCatalogoDeEtapas))
            setErroAoLer(null)
        } catch (e) {
            setItens(null)
            setErroAoLer((e as Error).message)
        }
    }, [])
    useEffect(() => { carregar() }, [carregar])

    const dados = { nome: nome.trim(), acao, abas: abasEmOrdem(abas) }
    const mudou = edicao?.modo !== 'editar' || (acao !== null && etapaDoCatalogoMudou(edicao.item, { nome: dados.nome, acao, abas: dados.abas }))
    const podeSalvar = dados.nome !== '' && acao !== null && mudou && !salvando

    function abrir(e: Edicao) {
        setErro(null)
        setNome(e.modo === 'editar' ? e.item.nome : '')
        setAcao(e.modo === 'editar' ? e.item.acao : null)
        setAbas(e.modo === 'editar' ? [...e.item.abas] : [])
        setEdicao(e)
    }

    async function salvar() {
        if (!edicao || !podeSalvar) return
        setSalvando(true)
        setErro(null)
        try {
            if (edicao.modo === 'criar') await chamarRota(rotaDoCatalogoDeEtapas, 'POST', dados)
            else await chamarRota(rotaDaEtapaDoCatalogo(edicao.item.id), 'PATCH', dados)
            message.success(edicao.modo === 'criar' ? 'Etapa acrescentada ao catálogo' : 'Etapa alterada')
            setEdicao(null)
            await carregar()
        } catch (e) {
            setErro((e as Error).message)
        } finally {
            setSalvando(false)
        }
    }

    async function remover() {
        if (!removendo) return
        setSalvando(true)
        setErroAoRemover(null)
        try {
            await chamarRota(rotaDaEtapaDoCatalogo(removendo.id), 'DELETE')
            message.success('Etapa removida do catálogo')
            setRemovendo(null)
            await carregar()
        } catch (e) {
            setErroAoRemover((e as Error).message)
        } finally {
            setSalvando(false)
        }
    }

    if (erroAoLer) {
        return <Alert type="error" showIcon message="Não foi possível ler o catálogo de etapas." description={erroAoLer} action={<Button onClick={carregar}>Tentar de novo</Button>} data-erro-do-catalogo-de-etapas />
    }
    const usosDaEdicao = edicao?.modo === 'editar' ? edicao.item.usos.length : 0
    return (
        <div data-catalogo-de-etapas>
            <Alert type="info" showIcon style={{ marginBottom: 12 }} message={AVISO_DA_ETAPA_GLOBAL} data-etapa-global />
            <Card title={TITULO_DO_CATALOGO_DE_ETAPAS} size="small"
                extra={<Button size="small" icon={<PlusOutlined />} onClick={() => abrir({ modo: 'criar' })} data-nova-etapa-do-catalogo>Nova etapa</Button>}>
                <Table<EtapaDoCatalogo>
                    rowKey="id" size="small" loading={itens === null} dataSource={itens ?? []} pagination={false}
                    locale={{ emptyText: <Empty description={SEM_ETAPA_NO_CATALOGO} /> }}
                    onRow={(c) => ({ 'data-etapa-do-catalogo': c.id } as React.HTMLAttributes<HTMLElement>)}
                    columns={[
                        { title: 'Etapa', dataIndex: 'nome' },
                        { title: 'Ação', render: (_, c) => <span data-acao-do-item>{ROTULO_DA_ACAO[c.acao]}</span> },
                        {
                            title: 'Abas do motor que carrega',
                            render: (_, c) => (c.abas.length === 0
                                ? <Typography.Text type="secondary" data-sem-abas>nenhuma</Typography.Text>
                                : <span data-abas-do-item>{c.abas.map((a) => <Tag key={a}>{ROTULO_DA_ABA[a]}</Tag>)}</span>),
                        },
                        {
                            title: 'Quem usa',
                            render: (_, c) => (c.usos.length === 0
                                ? <Typography.Text type="secondary" data-sem-uso>ninguém</Typography.Text>
                                : <ul style={{ margin: 0, paddingLeft: 16 }} data-usos-do-item>{c.usos.map((u) => <li key={usoNaLista(u)}>{usoNaLista(u)}</li>)}</ul>),
                        },
                        {
                            title: '',
                            align: 'right',
                            render: (_, c) => (
                                <Space size={4}>
                                    <Button size="small" onClick={() => abrir({ modo: 'editar', item: c })} aria-label={`Editar ${c.nome}`}>Editar</Button>
                                    <Button size="small" danger onClick={() => { setErroAoRemover(null); setRemovendo(c) }} aria-label={`Remover ${c.nome}`}>Remover</Button>
                                </Space>
                            ),
                        },
                    ]}
                />
            </Card>
            <Modal title={edicao?.modo === 'editar' ? `Editar ${edicao.item.nome}` : 'Nova etapa do catálogo'} open={edicao !== null} onCancel={() => setEdicao(null)}
                okText="Salvar" onOk={salvar} okButtonProps={{ disabled: !podeSalvar, loading: salvando }} destroyOnClose>
                <Space direction="vertical" style={{ width: '100%' }} data-modal-da-etapa-do-catalogo>
                    {usosDaEdicao > 0 && <Alert type="warning" showIcon message={AVISO_DA_EDICAO_COM_USO(usosDaEdicao)} data-edicao-com-uso />}
                    <Input placeholder="Nome da etapa" value={nome} maxLength={LIMITE_DO_NOME_DA_ETAPA} onChange={(e) => setNome(e.target.value)} aria-label="Nome da etapa" />
                    <Select aria-label="Ação da etapa" style={{ width: '100%' }} placeholder="Escolha a ação" value={acao ?? undefined} onChange={(v) => setAcao(v)}
                        options={ACOES_DA_ETAPA.map((a) => ({ value: a, label: ROTULO_DA_ACAO[a] }))} />
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>Abas da planilha do motor que a etapa carrega:</Typography.Text>
                    <Checkbox.Group value={abas} onChange={(v) => setAbas(abasEmOrdem(v as string[]))} aria-label="Abas da etapa"
                        options={ABAS_DA_ETAPA.map((a) => ({ value: a, label: ROTULO_DA_ABA[a] }))} />
                    {erro && <Alert type="error" showIcon message="A etapa não foi gravada." description={erro} data-erro-da-etapa-do-catalogo />}
                </Space>
            </Modal>
            <Modal title={removendo ? fraseDaRemocaoDaEtapa(removendo.nome) : 'Remover a etapa'} open={removendo !== null} onCancel={() => setRemovendo(null)}
                okText="Remover" okButtonProps={{ danger: true, loading: salvando }} onOk={remover} destroyOnClose>
                <Space direction="vertical" style={{ width: '100%' }} data-modal-da-remocao-da-etapa>
                    <Typography.Paragraph type="secondary" style={{ margin: 0 }}>{AVISO_DA_REMOCAO_DA_ETAPA}</Typography.Paragraph>
                    {erroAoRemover && <Alert type="error" showIcon message="A etapa não foi removida." description={erroAoRemover} data-erro-ao-remover-etapa />}
                </Space>
            </Modal>
        </div>
    )
}
