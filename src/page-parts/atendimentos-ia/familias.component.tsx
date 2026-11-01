/**
 * As FAMÍLIAS DO CATÁLOGO, na aba Famílias do nicho: CRIAR, EDITAR e REMOVER (dono do produto, 29/10/2026: "não dá para editar a família que
 * existe, nem excluir, nem adicionar. O dono do produto precisa das três"; migração 20261029000004).
 *
 * A FAMÍLIA É O NOME E AS RAMIFICAÇÕES: as categorias que a base de conhecimento mostra numa matéria-prima dessa família. Criar e editar pedem as
 * duas coisas — ao menos uma categoria, na ordem do catálogo de categorias (é a ordem que a PVC tem, medida em 29/10/2026). A CHAVE não se
 * edita: é derivada do nome na criação e é o que as chaves estrangeiras citam.
 *
 * REMOVER é SOBERANO (dono do produto, 31/10/2026; migração 20261031000003): a confirmação (`RemocaoDoCatalogo`) mostra o arrasto medido — o
 * motor de família única e a tabela de Perfil saem junto; a família de conta fica sem tipo; as etapas dela saem; o item de levantamento perde o
 * vínculo — e só remove com a confirmação explícita. A recusa da criação e da edição aparece dentro do modal, e o modal não fecha.
 *
 * A família é GLOBAL (a aba diz isso, `AVISO_DA_FAMILIA_GLOBAL`): editar aqui vale para todos os nichos.
 */
import React, { useState } from 'react'
import { Alert, Button, Card, Checkbox, Empty, Input, Modal, Space, Table, Tag, Typography } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { FAMILIA_SEM_RAMIFICACAO, LIMITE_DO_ROTULO_DA_FAMILIA, familiaNaoMudou, type Categoria, type FamiliaDoCatalogo } from '@/utils/atendimentos-ia-catalogo'
import { RemocaoDoCatalogo, type AlvoDaRemocao } from '@/page-parts/atendimentos-ia/remocao-do-catalogo.component'

export const TITULO_DAS_FAMILIAS = 'Famílias'
export const SEM_FAMILIA_NO_CATALOGO = 'Nenhuma família no catálogo.'

export interface DadosDaFamilia { rotulo: string; ramificacoes: string[] }

interface Props {
    familias: FamiliaDoCatalogo[]
    categorias: Categoria[]
    /** Cada ação devolve null quando gravou, ou a frase da recusa (que aparece dentro do modal). */
    onCriar: (d: DadosDaFamilia) => Promise<string | null>
    onEditar: (chave: string, d: DadosDaFamilia) => Promise<string | null>
    /** Depois de removida (o arrasto confirmado): quem chama relê o catálogo. */
    onRemovida: () => void
}

type Edicao = { modo: 'criar' } | { modo: 'editar'; familia: FamiliaDoCatalogo }

export function FamiliasCard({ familias, categorias, onCriar, onEditar, onRemovida }: Props) {
    const ordenadas = [...familias].sort((a, b) => a.ordem - b.ordem)
    const catalogo = [...categorias].sort((a, b) => a.ordem - b.ordem)
    const rotuloDaCategoria = (c: string) => categorias.find((x) => x.chave === c)?.rotulo ?? c

    const [edicao, setEdicao] = useState<Edicao | null>(null)
    const [rotulo, setRotulo] = useState('')
    const [marcadas, setMarcadas] = useState<string[]>([])
    const [erro, setErro] = useState<string | null>(null)
    const [salvando, setSalvando] = useState(false)
    const [removendo, setRemovendo] = useState<AlvoDaRemocao | null>(null)

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
                                <Button size="small" danger onClick={() => setRemovendo({ tipo: 'familia', chave: f.chave, nome: f.rotulo })} aria-label={`Remover ${f.rotulo}`}>Remover</Button>
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
            <RemocaoDoCatalogo alvo={removendo} onFechar={() => setRemovendo(null)} onRemovido={() => { setRemovendo(null); onRemovida() }} />
        </Card>
    )
}
