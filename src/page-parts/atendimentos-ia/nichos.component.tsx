/**
 * Os NICHOS da plataforma, agrupados por modelo, com criar e excluir — e cada um ABRE a sua página.
 *
 * O NICHO É O CONTAINER (dono do produto, 29/10/2026, opção A): famílias, fornecedores e motores vivem DENTRO do nicho, na página dele
 * (`rotaDoNicho`), em três abas. Esta lista é a porta: o nome leva à página, e a contagem diz quantos fornecedores há lá dentro.
 *
 * NÃO ESTÁ NO MOCKUP como tela — lá os nichos vêm prontos. Está aqui porque o catálogo nasce vazio (`20261019000001` não semeia nenhum) e
 * sem nicho não se credencia fornecedor. Nicho em uso o banco não deixa excluir, e a rota diz quem o usa. Excluir é um botão à parte, com
 * confirmação: clicar no nome abre o nicho, nunca o exclui.
 */
import React, { useState } from 'react'
import { Button, Card, Input, Popconfirm, Select, Space, Typography } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { MODELOS, ROTULO_DO_MODELO, rotaDoNicho, type Modelo, type Nicho } from '@/utils/atendimentos-ia-catalogo'

interface Props {
    nichos: Nicho[]
    /** Quantos fornecedores cada nicho tem, pelo id; o nicho ausente tem zero. */
    fornecedoresPorNicho: Record<string, number>
    onCriar: (n: { modelo: Modelo; nome: string }) => Promise<boolean>
    onExcluir: (n: Nicho) => void
}

export const fraseDosFornecedoresDoNicho = (n: number) => (n === 0 ? 'nenhum fornecedor' : n === 1 ? '1 fornecedor' : `${n} fornecedores`)

export function NichosCard({ nichos, fornecedoresPorNicho, onCriar, onExcluir }: Props) {
    const [modelo, setModelo] = useState<Modelo | undefined>(undefined)
    const [nome, setNome] = useState('')

    return (
        <Card title="Nichos" size="small" style={{ marginTop: 16 }}>
            {MODELOS.map((m) => {
                const doModelo = nichos.filter((n) => n.modelo === m)
                return (
                    <div key={m} style={{ marginBottom: 10 }} data-modelo={m}>
                        <Typography.Text type="secondary">{ROTULO_DO_MODELO[m]}: </Typography.Text>
                        {doModelo.length === 0 ? <Typography.Text type="secondary">nenhum</Typography.Text> : (
                            <Space wrap size={[16, 4]}>
                                {doModelo.map((n) => (
                                    <Space key={n.id} size={4} data-nicho={n.id}>
                                        <a href={rotaDoNicho(n.id)} data-abrir-nicho>{n.nome}</a>
                                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>({fraseDosFornecedoresDoNicho(fornecedoresPorNicho[n.id] ?? 0)})</Typography.Text>
                                        <Popconfirm title={`Excluir o nicho "${n.nome}"?`} okText="Excluir" cancelText="Cancelar" onConfirm={() => onExcluir(n)}>
                                            <Button type="link" size="small" danger aria-label={`Excluir o nicho ${n.nome}`} data-excluir-nicho>×</Button>
                                        </Popconfirm>
                                    </Space>
                                ))}
                            </Space>
                        )}
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
