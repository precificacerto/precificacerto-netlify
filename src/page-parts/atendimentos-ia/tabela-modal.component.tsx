/**
 * O modal da TABELA (EPIC §5.6): Arquivo → Motor → Vigência, NESSA ORDEM.
 *
 * O MOTOR É OBRIGATÓRIO: sem ele o botão de salvar não liga, e a frase diz por quê. Mas esta é a
 * trava da TELA — a da ROTA é a que vale (`lerCorpoDaTabela`), e o banco tem a terceira (NOT NULL).
 *
 * Serve dois usos: a tabela NOVA (os dois arquivos são exigidos) e a EDIÇÃO (cada arquivo é
 * trocado só se outro for escolhido; o atual aparece pelo nome).
 */
import React, { useEffect, useState } from 'react'
import { Alert, Button, Input, Modal, Typography, Upload } from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import { AVISO_DO_CATALOGO, EXTENSOES_ACEITAS, MENSAGEM_MOTOR_OBRIGATORIO } from '@/utils/atendimentos-ia-catalogo'
import type { TabelaPendente } from './api'

export const TEXTO_DO_MOTOR = 'O motor é quem faz as reduções de tipologia em cima dos perfis desta tabela. Sem ele a tabela não calcula.'

export interface AtualDaTabela { arquivo_nome: string; motor_nome: string; vigencia: string | null }

interface Props {
    aberto: boolean
    titulo: string
    /** Presente na edição: os arquivos atuais. Ausente na tabela nova. */
    atual?: AtualDaTabela
    salvando?: boolean
    onCancelar: () => void
    onSalvar: (t: TabelaPendente) => void
}

function Escolha({ rotulo, arquivo, atual, onEscolher }: { rotulo: string; arquivo: File | null; atual?: string; onEscolher: (f: File) => void }) {
    return (
        <div style={{ marginBottom: 14 }}>
            <Typography.Text strong>{rotulo}</Typography.Text>
            <div style={{ marginTop: 6 }}>
                <Upload
                    accept={EXTENSOES_ACEITAS.join(',')}
                    maxCount={1}
                    showUploadList={false}
                    beforeUpload={(f) => { onEscolher(f as File); return false }}
                >
                    <Button icon={<UploadOutlined />}>{arquivo || atual ? 'Trocar arquivo' : 'Escolher arquivo'}</Button>
                </Upload>
                <span style={{ marginLeft: 10 }} data-arquivo={rotulo}>
                    {arquivo ? arquivo.name : atual ? <>{atual} <Typography.Text type="secondary">(atual)</Typography.Text></> : <Typography.Text type="secondary">nenhum</Typography.Text>}
                </span>
            </div>
        </div>
    )
}

export function TabelaModal({ aberto, titulo, atual, salvando, onCancelar, onSalvar }: Props) {
    const [arquivo, setArquivo] = useState<File | null>(null)
    const [motor, setMotor] = useState<File | null>(null)
    const [vigencia, setVigencia] = useState('')

    useEffect(() => {
        if (!aberto) return
        setArquivo(null)
        setMotor(null)
        setVigencia(atual?.vigencia ?? '')
    // Só ao ABRIR — ver o mesmo comentário em `fornecedor-modal.component.tsx`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aberto])

    const temArquivo = !!arquivo || !!atual?.arquivo_nome
    const temMotor = !!motor || !!atual?.motor_nome

    return (
        <Modal
            open={aberto}
            title={titulo}
            onCancel={onCancelar}
            okText="Salvar tabela"
            cancelText="Cancelar"
            okButtonProps={{ disabled: !temArquivo || !temMotor, loading: salvando }}
            onOk={() => onSalvar({ arquivo, motor, vigencia })}
            destroyOnClose
        >
            <Escolha rotulo="Arquivo da tabela" arquivo={arquivo} atual={atual?.arquivo_nome} onEscolher={setArquivo} />
            <Escolha rotulo="Arquivo do motor" arquivo={motor} atual={atual?.motor_nome} onEscolher={setMotor} />
            <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: -6 }}>{TEXTO_DO_MOTOR}</Typography.Paragraph>
            {!temMotor && <Alert type="warning" showIcon message={MENSAGEM_MOTOR_OBRIGATORIO} style={{ marginBottom: 12 }} />}
            <Typography.Text strong>Vigência</Typography.Text>
            <Input
                style={{ marginTop: 6 }}
                placeholder="ex.: desde 01/10/2026"
                value={vigencia}
                onChange={(e) => setVigencia(e.target.value)}
                aria-label="Vigência"
            />
            <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 8 }}>
                Aceita {EXTENSOES_ACEITAS.join(', ')}. {AVISO_DO_CATALOGO}
            </Typography.Paragraph>
        </Modal>
    )
}
