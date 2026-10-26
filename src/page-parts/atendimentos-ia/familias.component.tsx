/**
 * As FAMÍLIAS das tabelas de fornecedor (dono do produto, 26/10/2026; migração 20261026000004), na
 * ordem, com "Nova família". LISTA FECHADA: a tabela escolhe dela no cadastro, e o super admin a
 * acrescenta aqui ("Portas de ACM e Portas de garagem ainda vão aparecer"). A chave vem do nome,
 * pela rota; não há excluir nem renomear.
 *
 * Mora em "Fornecedores e tabelas", ao lado dos nichos. A recusa da rota aparece pela página que
 * chama `onCriar`, como a dos nichos.
 */
import React, { useState } from 'react'
import { Button, Card, Input, Space, Tag, Typography } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { LIMITE_DO_ROTULO_DA_FAMILIA, type Familia } from '@/utils/atendimentos-ia-catalogo'

interface Props {
    familias: Familia[]
    /** Acrescenta pelo rótulo; true quando gravou (o campo esvazia). */
    onCriar: (rotulo: string) => Promise<boolean>
}

export function FamiliasCard({ familias, onCriar }: Props) {
    const [rotulo, setRotulo] = useState('')
    const ordenadas = [...familias].sort((a, b) => a.ordem - b.ordem)

    return (
        <Card title="Famílias das tabelas" size="small" style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 10 }}>
                {ordenadas.length === 0
                    ? <Typography.Text type="secondary">nenhuma</Typography.Text>
                    : ordenadas.map((f) => <Tag key={f.chave} data-familia-do-catalogo={f.chave}>{f.rotulo}</Tag>)}
            </div>
            <Space.Compact style={{ width: '100%', maxWidth: 520 }}>
                <Input placeholder="Nome da família" value={rotulo} maxLength={LIMITE_DO_ROTULO_DA_FAMILIA} onChange={(e) => setRotulo(e.target.value)} aria-label="Nome da família" />
                <Button icon={<PlusOutlined />} disabled={rotulo.trim() === ''} onClick={async () => { if (await onCriar(rotulo)) setRotulo('') }}>
                    Nova família
                </Button>
            </Space.Compact>
        </Card>
    )
}
