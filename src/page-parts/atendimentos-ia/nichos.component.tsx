/**
 * Os NICHOS da plataforma, agrupados por modelo, com criar e excluir.
 *
 * NÃO ESTÁ NO MOCKUP como tela — lá os nichos vêm prontos. Está aqui porque o catálogo nasce
 * vazio (`20261019000001` não semeia nenhum) e sem nicho não se credencia fornecedor. Mora DENTRO
 * de "Fornecedores e tabelas", e não como entrada própria do menu, até o dono do produto decidir
 * onde ele fica. Nicho em uso o banco não deixa excluir, e a rota diz quem o usa.
 */
import React, { useState } from 'react'
import { Button, Card, Input, Popconfirm, Select, Space, Tag, Typography } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { MODELOS, ROTULO_DO_MODELO, type Modelo, type Nicho } from '@/utils/atendimentos-ia-catalogo'

interface Props {
    nichos: Nicho[]
    onCriar: (n: { modelo: Modelo; nome: string }) => Promise<boolean>
    onExcluir: (n: Nicho) => void
}

export function NichosCard({ nichos, onCriar, onExcluir }: Props) {
    const [modelo, setModelo] = useState<Modelo | undefined>(undefined)
    const [nome, setNome] = useState('')

    return (
        <Card title="Nichos" size="small" style={{ marginTop: 16 }}>
            {MODELOS.map((m) => {
                const doModelo = nichos.filter((n) => n.modelo === m)
                return (
                    <div key={m} style={{ marginBottom: 10 }} data-modelo={m}>
                        <Typography.Text type="secondary">{ROTULO_DO_MODELO[m]}: </Typography.Text>
                        {doModelo.length === 0 ? <Typography.Text type="secondary">nenhum</Typography.Text> : doModelo.map((n) => (
                            <Popconfirm key={n.id} title={`Excluir o nicho "${n.nome}"?`} okText="Excluir" cancelText="Cancelar" onConfirm={() => onExcluir(n)}>
                                <Tag closable onClose={(e) => e.preventDefault()} style={{ cursor: 'pointer' }}>{n.nome}</Tag>
                            </Popconfirm>
                        ))}
                    </div>
                )
            })}
            <Space.Compact style={{ width: '100%', maxWidth: 520 }}>
                <Select style={{ width: 200 }} placeholder="Modelo" value={modelo} onChange={setModelo} options={MODELOS.map((m) => ({ value: m, label: ROTULO_DO_MODELO[m] }))} aria-label="Modelo do nicho" />
                <Input placeholder="Nome do nicho" value={nome} onChange={(e) => setNome(e.target.value)} aria-label="Nome do nicho" />
                <Button
                    icon={<PlusOutlined />}
                    disabled={!modelo || nome.trim() === ''}
                    onClick={async () => { if (modelo && (await onCriar({ modelo, nome }))) setNome('') }}
                >
                    Novo nicho
                </Button>
            </Space.Compact>
        </Card>
    )
}
