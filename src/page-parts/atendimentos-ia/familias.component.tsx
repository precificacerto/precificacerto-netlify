/**
 * As FAMÍLIAS DO CATÁLOGO, na aba Famílias do nicho: CRIAR, EDITAR e REMOVER (dono do produto, 29/10/2026: "não dá para editar a família que
 * existe, nem excluir, nem adicionar. O dono do produto precisa das três"; migração 20261029000004).
 *
 * A FAMÍLIA É O NOME E AS RAMIFICAÇÕES: as categorias que a base de conhecimento mostra numa matéria-prima dessa família. Criar e editar pedem as
 * duas coisas — ao menos uma categoria, na ordem do catálogo de categorias (é a ordem que a PVC tem, medida em 29/10/2026). A CHAVE não se
 * edita: é derivada do nome na criação e é o que as chaves estrangeiras citam.
 *
 * REMOVER pede confirmação, e a família EM USO não sai: a recusa do banco nomeia quem a usa (matéria-prima, tabela, motor, etapa, item de
 * levantamento). A recusa aparece onde a ação aconteceu — dentro do modal da criação, da edição ou da remoção —, e o modal não fecha.
 *
 * A família é GLOBAL (a aba diz isso, `AVISO_DA_FAMILIA_GLOBAL`): editar aqui vale para todos os nichos.
 */
import React, { useState } from 'react'
import { Alert, Button, Card, Checkbox, Empty, Input, Modal, Space, Table, Tag, Typography } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { FAMILIA_SEM_RAMIFICACAO, LIMITE_DO_ROTULO_DA_FAMILIA, familiaNaoMudou, type Categoria, type FamiliaDoCatalogo } from '@/utils/atendimentos-ia-catalogo'

export const TITULO_DAS_FAMILIAS = 'Famílias'
export const SEM_FAMILIA_NO_CATALOGO = 'Nenhuma família no catálogo.'
export const AVISO_DA_REMOCAO_DA_FAMILIA =
    'A família sai com as categorias dela. Família em uso não sai: a recusa diz quem a usa (matéria-prima, tabela, motor, etapa ou levantamento).'
export const fraseDaRemocao = (rotulo: string) => `Remover a família "${rotulo}"?`

export interface DadosDaFamilia { rotulo: string; ramificacoes: string[] }

interface Props {
    familias: FamiliaDoCatalogo[]
    categorias: Categoria[]
    /** Cada ação devolve null quando gravou, ou a frase da recusa (que aparece dentro do modal). */
    onCriar: (d: DadosDaFamilia) => Promise<string | null>
    onEditar: (chave: string, d: DadosDaFamilia) => Promise<string | null>
    onRemover: (chave: string) => Promise<string | null>
}

type Edicao = { modo: 'criar' } | { modo: 'editar'; familia: FamiliaDoCatalogo }

export function FamiliasCard({ familias, categorias, onCriar, onEditar, onRemover }: Props) {
    const ordenadas = [...familias].sort((a, b) => a.ordem - b.ordem)
    const catalogo = [...categorias].sort((a, b) => a.ordem - b.ordem)
    const rotuloDaCategoria = (c: string) => categorias.find((x) => x.chave === c)?.rotulo ?? c

    const [edicao, setEdicao] = useState<Edicao | null>(null)
    const [rotulo, setRotulo] = useState('')
    const [marcadas, setMarcadas] = useState<string[]>([])
    const [erro, setErro] = useState<string | null>(null)
    const [salvando, setSalvando] = useState(false)
    const [removendo, setRemovendo] = useState<FamiliaDoCatalogo | null>(null)
    const [erroAoRemover, setErroAoRemover] = useState<string | null>(null)

    // as marcadas vão na ORDEM DO CATÁLOGO de categorias, não na ordem do clique
    const ramificacoes = catalogo.map((c) => c.chave).filter((c) => marcadas.includes(c))
    const dados: DadosDaFamilia = { rotulo: rotulo.trim(), ramificacoes }
    const mudou = edicao?.modo !== 'editar' || !familiaNaoMudou(edicao.familia, dados)
    const podeSalvar = dados.rotulo !== '' && ramificacoes.length > 0 && mudou && !salvando

    function abrir(e: Edicao) {
        setErro(null)
        setRotulo(e.modo === 'editar' ? e.familia.rotulo : '')
        setMarcadas(e.modo === 'editar' ? [...e.familia.ramificacoes] : [])
        setEdicao(e)
    }

    async function salvar() {
        if (!edicao || !podeSalvar) return
        setSalvando(true)
        setErro(null)
        try {
            const recusa = edicao.modo === 'criar' ? await onCriar(dados) : await onEditar(edicao.familia.chave, dados)
            if (recusa === null) setEdicao(null)
            else setErro(recusa)
        } finally {
            setSalvando(false)
        }
    }

    async function remover() {
        if (!removendo) return
        setSalvando(true)
        setErroAoRemover(null)
        try {
            const recusa = await onRemover(removendo.chave)
            if (recusa === null) setRemovendo(null)
            else setErroAoRemover(recusa)
        } finally {
            setSalvando(false)
        }
    }

    return (
        <Card title={TITULO_DAS_FAMILIAS} size="small" style={{ marginTop: 16 }} data-familias-do-catalogo
            extra={<Button size="small" icon={<PlusOutlined />} onClick={() => abrir({ modo: 'criar' })} data-nova-familia>Nova família</Button>}>
            <Table<FamiliaDoCatalogo>
                rowKey="chave" size="small" dataSource={ordenadas} pagination={false}
                locale={{ emptyText: <Empty description={SEM_FAMILIA_NO_CATALOGO} /> }}
                onRow={(f) => ({ 'data-familia-do-catalogo': f.chave } as React.HTMLAttributes<HTMLElement>)}
                columns={[
                    { title: 'Família', dataIndex: 'rotulo' },
                    {
                        title: 'Categorias',
                        render: (_, f) => (f.ramificacoes.length === 0
                            ? <Typography.Text type="secondary" data-sem-ramificacao>nenhuma</Typography.Text>
                            : <span data-ramificacoes>{f.ramificacoes.map((c) => <Tag key={c}>{rotuloDaCategoria(c)}</Tag>)}</span>),
                    },
                    {
                        title: '',
                        align: 'right',
                        render: (_, f) => (
                            <Space size={4}>
                                <Button size="small" onClick={() => abrir({ modo: 'editar', familia: f })} aria-label={`Editar ${f.rotulo}`}>Editar</Button>
                                <Button size="small" danger onClick={() => { setErroAoRemover(null); setRemovendo(f) }} aria-label={`Remover ${f.rotulo}`}>Remover</Button>
                            </Space>
                        ),
                    },
                ]}
            />
            <Modal title={edicao?.modo === 'editar' ? `Editar ${edicao.familia.rotulo}` : 'Nova família'} open={edicao !== null} onCancel={() => setEdicao(null)}
                okText="Salvar" onOk={salvar} okButtonProps={{ disabled: !podeSalvar, loading: salvando }} destroyOnClose>
                <Space direction="vertical" style={{ width: '100%' }} data-modal-da-familia>
                    <Input placeholder="Nome da família" value={rotulo} maxLength={LIMITE_DO_ROTULO_DA_FAMILIA} onChange={(e) => setRotulo(e.target.value)} aria-label="Nome da família" />
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>Categorias que a base de conhecimento mostra nesta família:</Typography.Text>
                    <Checkbox.Group value={marcadas} onChange={(v) => setMarcadas(v as string[])} aria-label="Categorias da família">
                        <Space direction="vertical">
                            {catalogo.map((c) => <span key={c.chave} data-categoria-da-familia={c.chave}><Checkbox value={c.chave}>{c.rotulo}</Checkbox></span>)}
                        </Space>
                    </Checkbox.Group>
                    {ramificacoes.length === 0 && <Typography.Text type="secondary" style={{ fontSize: 12 }} data-sem-ramificacao-marcada>{FAMILIA_SEM_RAMIFICACAO}</Typography.Text>}
                    {erro && <Alert type="error" showIcon message="A família não foi gravada." description={erro} data-erro-da-familia />}
                </Space>
            </Modal>
            <Modal title={removendo ? fraseDaRemocao(removendo.rotulo) : 'Remover a família'} open={removendo !== null} onCancel={() => setRemovendo(null)}
                okText="Remover" okButtonProps={{ danger: true, loading: salvando }} onOk={remover} destroyOnClose>
                <Space direction="vertical" style={{ width: '100%' }} data-modal-da-remocao>
                    <Typography.Paragraph type="secondary" style={{ margin: 0 }}>{AVISO_DA_REMOCAO_DA_FAMILIA}</Typography.Paragraph>
                    {erroAoRemover && <Alert type="error" showIcon message="A família não foi removida." description={erroAoRemover} data-erro-ao-remover-familia />}
                </Space>
            </Modal>
        </Card>
    )
}
