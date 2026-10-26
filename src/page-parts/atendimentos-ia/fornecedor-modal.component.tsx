/**
 * O modal do FORNECEDOR, em dois usos (EPIC §5.5 e §5.6):
 *   - CREDENCIAR: nome, nicho (agrupado por modelo) e "Tabelas deste fornecedor" — pode salvar
 *     sem nenhuma e subir depois. Cada tabela entra pelo MESMO modal da tabela, com o motor
 *     obrigatório: o atalho do protótipo, que criava tabela sem motor, NÃO é regra (EPIC §3.8).
 *   - EDITAR: nome e nicho, e "Excluir fornecedor".
 *
 * O erro de credenciar, salvar ou excluir vem da página pela prop `erro` e aparece DENTRO deste
 * modal — onde a ação aconteceu (ver o cabeçalho de `EXTENSOES_ACEITAS`).
 */
import React, { useEffect, useState } from 'react'
import { Alert, Button, Input, List, Modal, Popconfirm, Typography } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import type { Familia, Nicho } from '@/utils/atendimentos-ia-catalogo'
import { NichoSelect } from './nicho-select.component'
import { TabelaModal } from './tabela-modal.component'
import { LinhaDaTabela } from './linha-da-tabela.component'
import type { TabelaPendente } from './api'

export interface DadosDoFornecedor { nome: string; nicho_id: string; tabelas: TabelaPendente[] }

export const TITULO_FORNECEDOR_NAO_CREDENCIADO = 'O fornecedor não foi credenciado.'
export const TITULO_FORNECEDOR_NAO_SALVO = 'O fornecedor não foi salvo.'
export const TITULO_FORNECEDOR_NAO_EXCLUIDO = 'O fornecedor não foi excluído.'

/** A última tentativa que falhou: o título diz QUAL ação, o motivo é a frase da rota. */
export interface ErroDoFornecedor { titulo: string; motivo: string }

interface Props {
    aberto: boolean
    modo: 'credenciar' | 'editar'
    nichos: Nicho[]
    /** A lista das famílias, para o modal da tabela nova do credenciamento. */
    familias: Familia[]
    inicial?: { nome: string; nicho_id: string }
    salvando?: boolean
    erro?: ErroDoFornecedor | null
    onCancelar: () => void
    onSalvar: (d: DadosDoFornecedor) => void
    onExcluir?: () => void
}

export function FornecedorModal({ aberto, modo, nichos, familias, inicial, salvando, erro, onCancelar, onSalvar, onExcluir }: Props) {
    const [nome, setNome] = useState('')
    const [nichoId, setNichoId] = useState<string | undefined>(undefined)
    const [tabelas, setTabelas] = useState<TabelaPendente[]>([])
    const [tabelaAberta, setTabelaAberta] = useState(false)

    useEffect(() => {
        if (!aberto) return
        setNome(inicial?.nome ?? '')
        setNichoId(inicial?.nicho_id)
        setTabelas([])
    // Só ao ABRIR: `inicial` é montado a cada render da página, e reler a cada render apagaria o
    // que o usuário está digitando.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aberto])

    const pronto = nome.trim() !== '' && !!nichoId

    return (
        <Modal
            open={aberto}
            title={modo === 'credenciar' ? 'Credenciar fornecedor' : 'Editar fornecedor'}
            onCancel={onCancelar}
            okText={modo === 'credenciar' ? 'Salvar credenciamento' : 'Salvar'}
            cancelText="Cancelar"
            okButtonProps={{ disabled: !pronto, loading: salvando }}
            onOk={() => onSalvar({ nome, nicho_id: nichoId as string, tabelas })}
            destroyOnClose
        >
            <Typography.Text strong>Nome</Typography.Text>
            <Input style={{ margin: '6px 0 14px' }} value={nome} onChange={(e) => setNome(e.target.value)} aria-label="Nome do fornecedor" />
            <Typography.Text strong>Nicho</Typography.Text>
            <div style={{ margin: '6px 0 14px' }}><NichoSelect nichos={nichos} value={nichoId} onChange={setNichoId} /></div>

            {modo === 'credenciar' && (
                <>
                    <Typography.Text strong>Tabelas deste fornecedor</Typography.Text>
                    <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: '2px 0 6px' }}>Pode salvar sem nenhuma e subir depois.</Typography.Paragraph>
                    <List
                        size="small"
                        dataSource={tabelas}
                        locale={{ emptyText: 'Nenhuma tabela ainda.' }}
                        renderItem={(t, i) => (
                            <List.Item actions={[<Button key="x" size="small" type="link" onClick={() => setTabelas(tabelas.filter((_, j) => j !== i))}>remover</Button>]}>
                                <LinhaDaTabela arquivo={t.arquivo?.name ?? ''} motor={t.motor?.name ?? ''} data={t.vigencia} />
                            </List.Item>
                        )}
                    />
                    <Button style={{ marginTop: 8 }} icon={<PlusOutlined />} onClick={() => setTabelaAberta(true)}>Adicionar tabela</Button>
                    <TabelaModal
                        aberto={tabelaAberta}
                        titulo="Nova tabela"
                        familias={familias}
                        onCancelar={() => setTabelaAberta(false)}
                        onSalvar={(t) => { setTabelas([...tabelas, t]); setTabelaAberta(false) }}
                    />
                </>
            )}

            {modo === 'editar' && onExcluir && (
                <Popconfirm title="Excluir este fornecedor?" okText="Excluir" cancelText="Cancelar" onConfirm={onExcluir}>
                    <Button danger>Excluir fornecedor</Button>
                </Popconfirm>
            )}

            {erro && <Alert type="error" showIcon style={{ marginTop: 14 }} message={erro.titulo} description={erro.motivo} data-erro-do-fornecedor />}
        </Modal>
    )
}
