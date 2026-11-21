/**
 * O CATÁLOGO DE ETAPAS, na quarta aba do nicho, ao lado de Motores (dono do produto, 31/10/2026; migração 20261031000002): "Vamos criar a aba das
 * etapas para que a gente consiga partir dela, alimentar ela, fazer as integrações, as divisões corretas, informando onde vai cada coisa". E: "O
 * apanhado, o levantamento, a definição de cada etapa, qual motor vai ser colocado, eu vou determinar manualmente." A aba é só a estrutura: CRIAR,
 * RENOMEAR/EDITAR (nome, ação, abas) e REMOVER. Nada aqui inventa etapa.
 *
 * O ITEM É O NOME, A AÇÃO (da lista fechada) E AS ABAS da planilha que a etapa carrega — "técnico, igual para toda empresa". A conta SELECIONA o item na
 * base de conhecimento e guarda a instrução, o número e o motor. Editar vale também com uso: a tela diz quantas etapas de conta o usam, porque a
 * mudança chega a todas. REMOVER é SOBERANO (dono do produto, 31/10/2026; migração 20261031000003): a confirmação mostra o arrasto — as etapas de
 * conta que usam o item saem junto, e as de baixo sobem um número — e só remove com a confirmação explícita. A recusa por uso caiu.
 *
 * O catálogo é GLOBAL, como o de famílias (`AVISO_DA_ETAPA_GLOBAL`). Tudo pelas rotas; a falha de leitura aparece como ERRO, nunca como lista vazia
 * (`ausente-vs-falso.md`). A recusa da edição aparece dentro do modal, e o modal não fecha.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, Checkbox, Empty, Input, Modal, Select, Space, Table, Tag, Typography, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { chamarRota } from '@/page-parts/atendimentos-ia/api'
import { RemocaoDoCatalogo, type AlvoDaRemocao } from '@/page-parts/atendimentos-ia/remocao-do-catalogo.component'
import {
    ABAS_DA_ETAPA, ACOES_DA_ETAPA, LIMITE_DA_DESCRICAO_DA_ETAPA, LIMITE_DO_NOME_DA_ETAPA, ROTULO_DA_ABA, ROTULO_DA_ACAO, abasEmOrdem,
    etapaDoCatalogoMudou, rotaDaDescricaoDaEtapa, rotaDaEtapaDoCatalogo, rotaDoCatalogoDeEtapas, type AcaoDaEtapa, type EtapaDoCatalogo,
} from '@/utils/atendimentos-ia-etapas'

export const TITULO_DO_CATALOGO_DE_ETAPAS = 'Etapas'
export const SEM_ETAPA_NO_CATALOGO = 'Nenhuma etapa no catálogo.'
export const AVISO_DA_ETAPA_GLOBAL =
    'As etapas são da plataforma, não do nicho: a lista é a mesma em todos os nichos. Cada item diz o nome, a ação e as abas do motor que a etapa carrega; '
    + 'a conta escolhe o item na base de conhecimento e escreve a instrução dela.'
export const AVISO_DA_EDICAO_COM_USO = (n: number) =>
    `Este item é usado por ${n} etapa(s) de conta: a mudança vale para todas elas.`
export const usoNaLista = (u: EtapaDoCatalogo['usos'][number]) => `${u.empresa} · ${u.familia} · etapa ${u.numero}`

type Edicao = { modo: 'criar' } | { modo: 'editar'; item: EtapaDoCatalogo }

export const SEM_A_COLUNA_DA_DESCRICAO = 'A descrição ainda não pode ser escrita: falta aplicar a migração 20261120000001.'
export const AJUDA_DA_DESCRICAO =
    'O que a etapa entrega e o que NÃO é dela. Vale para toda conta que usa o item e entra no prompt quando a etapa é a corrente (a de levantamento).'

/**
 * A DESCRIÇÃO do item (dono do produto, 20/11/2026; migração 20261120000001): editada no lugar, salva sozinha (PUT). Sem a coluna no banco
 * (`descricao` ausente no item), diz que falta a migração em vez de mostrar um campo que não grava.
 */
export function DescricaoDaEtapa({ item, aoSalvar }: { item: EtapaDoCatalogo; aoSalvar: () => void }) {
    const [texto, setTexto] = useState(item.descricao ?? '')
    const [erro, setErro] = useState<string | null>(null)
    const [salvando, setSalvando] = useState(false)
    if (!('descricao' in item)) return <Typography.Text type="secondary" data-sem-coluna-da-descricao>{SEM_A_COLUNA_DA_DESCRICAO}</Typography.Text>
    const caracteres = [...texto.trim()].length
    const acima = caracteres > LIMITE_DA_DESCRICAO_DA_ETAPA
    const mudou = (texto.trim() === '' ? null : texto.trim()) !== (item.descricao ?? null)
    async function salvar() {
        setSalvando(true)
        setErro(null)
        try {
            await chamarRota(rotaDaDescricaoDaEtapa(item.id), 'PUT', { descricao: texto.trim() === '' ? null : texto.trim() })
            message.success('Descrição da etapa gravada')
            aoSalvar()
        } catch (e) {
            setErro((e as Error).message)
        } finally {
            setSalvando(false)
        }
    }
    return (
        <Space direction="vertical" size={4} style={{ width: '100%', minWidth: 260 }} data-descricao-da-etapa={item.id}>
            <Input.TextArea value={texto} onChange={(e) => setTexto(e.target.value)} autoSize={{ minRows: 2, maxRows: 8 }} placeholder={AJUDA_DA_DESCRICAO} />
            <Space wrap>
                <Typography.Text type={acima ? 'danger' : 'secondary'} style={{ fontSize: 12 }} data-contador-da-descricao>{caracteres} / {LIMITE_DA_DESCRICAO_DA_ETAPA.toLocaleString('pt-BR')}</Typography.Text>
                <Button size="small" type="primary" disabled={!mudou || acima} loading={salvando} onClick={salvar} data-salvar-descricao>Salvar descrição</Button>
            </Space>
            {erro && <Alert type="error" showIcon message={erro} />}
        </Space>
    )
}

export function EtapasDoCatalogo() {
    const [itens, setItens] = useState<EtapaDoCatalogo[] | null>(null)
    const [erroAoLer, setErroAoLer] = useState<string | null>(null)
    const [edicao, setEdicao] = useState<Edicao | null>(null)
    const [nome, setNome] = useState('')
    const [acao, setAcao] = useState<AcaoDaEtapa | null>(null)
    const [abas, setAbas] = useState<string[]>([])
    const [erro, setErro] = useState<string | null>(null)
    const [salvando, setSalvando] = useState(false)
    const [removendo, setRemovendo] = useState<AlvoDaRemocao | null>(null)

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
                        { title: 'O que entrega (e o que não é dela)', render: (_, c) => <DescricaoDaEtapa key={`${c.id}:${c.descricao ?? ''}`} item={c} aoSalvar={carregar} /> },
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
                                    <Button size="small" danger onClick={() => setRemovendo({ tipo: 'etapa', chave: c.id, nome: c.nome })} aria-label={`Remover ${c.nome}`}>Remover</Button>
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
            <RemocaoDoCatalogo alvo={removendo} onFechar={() => setRemovendo(null)}
                onRemovido={() => { setRemovendo(null); message.success('Etapa removida do catálogo'); carregar() }} />
        </div>
    )
}
