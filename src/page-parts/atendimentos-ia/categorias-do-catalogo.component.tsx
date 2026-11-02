/**
 * A ABA CATEGORIAS do nicho, logo depois de Famílias (dono do produto, 02/11/2026; migração 20261102000002): "Hoje as categorias
 * (orcamentista_categoria_catalogo) não têm tela. Quero criar, renomear e remover categoria, como já faço com etapa."
 *
 * As três decisões do dono do produto:
 *   1. RENOMEAR É SÓ O RÓTULO. A chave é imutável, como na família: na edição ela aparece travada, e tentar mexer nela mostra a frase
 *      (`CHAVE_DA_CATEGORIA_NAO_MUDA`). Na criação, a chave é derivada do nome e mostrada antes de salvar.
 *   2. REMOVER ARRASTA, como nas outras raízes: a confirmação (`RemocaoDoCatalogo`) mostra o que sai — tabelas, motores, a base de conhecimento das
 *      contas, campos, ramificações — e NOMEIA CADA EMPRESA com a contagem por empresa; só remove confirmado, e recusa se a assinatura mudou.
 *   3. PERFIL, VIDRO, FERRAGENS e INSTALACAO são ESTRUTURAIS: o botão Remover delas vem desligado, com o motivo; a função também recusa.
 *
 * O catálogo é GLOBAL, como o de famílias e o de etapas (`AVISO_DA_CATEGORIA_GLOBAL`). Tudo pelas rotas; a falha de leitura aparece como ERRO,
 * nunca como lista vazia (`ausente-vs-falso.md`). A recusa da criação e da edição aparece dentro do modal, e o modal não fecha.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, Empty, Input, Modal, Space, Table, Tag, Tooltip, Typography, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { chamarRota } from '@/page-parts/atendimentos-ia/api'
import { RemocaoDoCatalogo, type AlvoDaRemocao } from '@/page-parts/atendimentos-ia/remocao-do-catalogo.component'
import {
    AVISO_DA_CATEGORIA_GLOBAL, CHAVE_DA_CATEGORIA_NAO_MUDA, LIMITE_DO_ROTULO_DA_CATEGORIA, ROTA_DAS_CATEGORIAS, chaveDaCategoria, fraseDaCategoriaEstrutural,
    rotaDaCategoria, usoDaCategoria, type CategoriaDoCatalogo,
} from '@/utils/atendimentos-ia-catalogo'

export const TITULO_DAS_CATEGORIAS = 'Categorias'
export const SEM_CATEGORIA_NO_CATALOGO = 'Nenhuma categoria no catálogo.'
export const ROTA_DA_ABA_DE_CATEGORIAS = `${ROTA_DAS_CATEGORIAS}?usos=1`
export const CHAVE_SEM_LETRA = 'O nome precisa começar por uma letra: é dele que sai a chave.'
export const AVISO_DA_EDICAO_COM_USO = (resumo: string) => `Esta categoria é usada por ${resumo}: o nome novo vale em todos esses lugares.`

type Edicao = { modo: 'criar' } | { modo: 'editar'; item: CategoriaDoCatalogo }

export function CategoriasDoCatalogo() {
    const [itens, setItens] = useState<CategoriaDoCatalogo[] | null>(null)
    const [erroAoLer, setErroAoLer] = useState<string | null>(null)
    const [edicao, setEdicao] = useState<Edicao | null>(null)
    const [rotulo, setRotulo] = useState('')
    const [tentouAChave, setTentouAChave] = useState(false)
    const [erro, setErro] = useState<string | null>(null)
    const [salvando, setSalvando] = useState(false)
    const [removendo, setRemovendo] = useState<AlvoDaRemocao | null>(null)

    const carregar = useCallback(async () => {
        try {
            setItens(await chamarRota<CategoriaDoCatalogo[]>(ROTA_DA_ABA_DE_CATEGORIAS))
            setErroAoLer(null)
        } catch (e) {
            setItens(null)
            setErroAoLer((e as Error).message)
        }
    }, [])
    useEffect(() => { carregar() }, [carregar])

    const nome = rotulo.trim()
    const chaveNova = edicao?.modo === 'criar' ? chaveDaCategoria(nome) : null
    const mudou = edicao?.modo !== 'editar' || edicao.item.rotulo.trim() !== nome
    const podeSalvar = nome !== '' && mudou && !salvando && (edicao?.modo !== 'criar' || chaveNova !== null)

    function abrir(e: Edicao) {
        setErro(null)
        setTentouAChave(false)
        setRotulo(e.modo === 'editar' ? e.item.rotulo : '')
        setEdicao(e)
    }

    async function salvar() {
        if (!edicao || !podeSalvar) return
        setSalvando(true)
        setErro(null)
        try {
            if (edicao.modo === 'criar') await chamarRota(ROTA_DAS_CATEGORIAS, 'POST', { rotulo: nome })
            else await chamarRota(rotaDaCategoria(edicao.item.chave), 'PATCH', { rotulo: nome })
            message.success(edicao.modo === 'criar' ? 'Categoria acrescentada ao catálogo' : 'Categoria renomeada')
            setEdicao(null)
            await carregar()
        } catch (e) {
            setErro((e as Error).message)
        } finally {
            setSalvando(false)
        }
    }

    if (erroAoLer) {
        return <Alert type="error" showIcon message="Não foi possível ler o catálogo de categorias." description={erroAoLer} action={<Button onClick={carregar}>Tentar de novo</Button>} data-erro-do-catalogo-de-categorias />
    }
    const usoDaEdicao = edicao?.modo === 'editar' ? usoDaCategoria(edicao.item.usos) : ''
    return (
        <div data-catalogo-de-categorias>
            <Alert type="info" showIcon style={{ marginBottom: 12 }} message={AVISO_DA_CATEGORIA_GLOBAL} data-categoria-global />
            <Card title={TITULO_DAS_CATEGORIAS} size="small"
                extra={<Button size="small" icon={<PlusOutlined />} onClick={() => abrir({ modo: 'criar' })} data-nova-categoria>Nova categoria</Button>}>
                <Table<CategoriaDoCatalogo>
                    rowKey="chave" size="small" loading={itens === null} dataSource={itens ?? []} pagination={false}
                    locale={{ emptyText: <Empty description={SEM_CATEGORIA_NO_CATALOGO} /> }}
                    onRow={(c) => ({ 'data-categoria-do-catalogo': c.chave } as React.HTMLAttributes<HTMLElement>)}
                    columns={[
                        { title: 'Categoria', dataIndex: 'rotulo' },
                        { title: 'Chave', render: (_, c) => <Typography.Text code data-chave-da-categoria>{c.chave}</Typography.Text> },
                        {
                            title: 'Quem usa',
                            render: (_, c) => (usoDaCategoria(c.usos) === ''
                                ? <Typography.Text type="secondary" data-sem-uso>ninguém</Typography.Text>
                                : <span data-usos-da-categoria>{usoDaCategoria(c.usos)}</span>),
                        },
                        {
                            title: '',
                            align: 'right',
                            render: (_, c) => (
                                <Space size={4}>
                                    {c.estrutural && <Tag data-categoria-estrutural>estrutural</Tag>}
                                    <Button size="small" onClick={() => abrir({ modo: 'editar', item: c })} aria-label={`Renomear ${c.rotulo}`}>Renomear</Button>
                                    <Tooltip title={c.estrutural ? fraseDaCategoriaEstrutural(c.chave) : undefined}>
                                        <Button size="small" danger disabled={c.estrutural} onClick={() => setRemovendo({ tipo: 'categoria', chave: c.chave, nome: c.rotulo })} aria-label={`Remover ${c.rotulo}`}>Remover</Button>
                                    </Tooltip>
                                </Space>
                            ),
                        },
                    ]}
                />
            </Card>
            <Modal title={edicao?.modo === 'editar' ? `Renomear ${edicao.item.rotulo}` : 'Nova categoria do catálogo'} open={edicao !== null} onCancel={() => setEdicao(null)}
                okText="Salvar" onOk={salvar} okButtonProps={{ disabled: !podeSalvar, loading: salvando }} destroyOnClose>
                <Space direction="vertical" style={{ width: '100%' }} data-modal-da-categoria>
                    {usoDaEdicao !== '' && <Alert type="warning" showIcon message={AVISO_DA_EDICAO_COM_USO(usoDaEdicao)} data-edicao-com-uso />}
                    <Input placeholder="Nome da categoria" value={rotulo} maxLength={LIMITE_DO_ROTULO_DA_CATEGORIA} onChange={(e) => setRotulo(e.target.value)} aria-label="Nome da categoria" />
                    {edicao?.modo === 'criar' && (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }} data-chave-derivada={chaveNova ?? ''}>
                            {nome === '' ? 'A chave sai do nome e depois não muda.' : chaveNova ? <>Chave: <Typography.Text code>{chaveNova}</Typography.Text> (não muda depois)</> : CHAVE_SEM_LETRA}
                        </Typography.Text>
                    )}
                    {edicao?.modo === 'editar' && (
                        <>
                            {/* decisão 1: a chave aparece, travada; clicar nela diz por quê */}
                            <span onClick={() => setTentouAChave(true)} data-chave-travada>
                                <Input value={edicao.item.chave} readOnly disabled aria-label="Chave da categoria" style={{ pointerEvents: 'none' }} />
                            </span>
                            {tentouAChave && <Alert type="info" showIcon message={CHAVE_DA_CATEGORIA_NAO_MUDA} data-chave-nao-muda />}
                        </>
                    )}
                    {erro && <Alert type="error" showIcon message="A categoria não foi gravada." description={erro} data-erro-da-categoria />}
                </Space>
            </Modal>
            <RemocaoDoCatalogo alvo={removendo} onFechar={() => setRemovendo(null)}
                onRemovido={() => { setRemovendo(null); message.success('Categoria removida do catálogo'); carregar() }} />
        </div>
    )
}
