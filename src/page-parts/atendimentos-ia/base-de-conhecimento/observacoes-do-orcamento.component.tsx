/**
 * AS OBSERVAÇÕES DO ORÇAMENTO, na base de conhecimento (dono do produto, 16/11/2026).
 *
 * O arquivo do orçamento já desenhava o bloco "OBSERVAÇÕES" no rodapé — e o corpo saía SEMPRE VAZIO, porque não havia
 * de onde ler o texto (medido em 16/11/2026: nenhuma coluna do banco o guardava). É o que este bloco preenche.
 *
 * ONDE FICA, e por quê (decisão do dono do produto, perguntado): na base de conhecimento DA EMPRESA. O texto é dela —
 * os prazos de entrega, a validade da proposta e as exclusões mudam de empresa para empresa.
 *
 * GRAVA SOZINHO, fora do "Salvar alterações" da tela, como a marca: é uma ação inteira, e misturá-la ao formulário
 * faria o botão único gravar um texto que o usuário ainda estava escrevendo.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Card, Input, InputNumber, Space, Table, Typography, message } from 'antd'
import { LIMITE_DAS_OBSERVACOES, fraseDasObservacoesGrandes } from '@/lib/atendimentos-ia/base-de-conhecimento'
import {
    LIMITE_DE_EXCLUSOES, LIMITE_DE_PARCELAS, LIMITE_DE_PRAZOS, SEM_CAMPOS, lerCamposDasObservacoes, linhasDasObservacoes,
    type CamposDasObservacoes,
} from '@/lib/atendimentos-ia/campos-das-observacoes'
import { chamarRota } from '@/page-parts/atendimentos-ia/api'
import { ROTAS_DA_BASE } from './formulario'

/** O que o usuário lê ANTES de salvar; a do banco é a que não deixa passar por outro caminho. */
export function recusaDasObservacoes(texto: string): string | null {
    const aparado = texto.trim()
    return aparado.length > LIMITE_DAS_OBSERVACOES ? fraseDasObservacoesGrandes(aparado.length) : null
}

/** O texto como ele será gravado (aparado); vazio e só-espaço são null, que limpa. */
export const paraGravar = (texto: string): string | null => (texto.trim() === '' ? null : texto.trim())

/** O TOTAL de exemplo da prévia: o bloco mostra as parcelas como sairiam num orçamento deste valor. */
export const TOTAL_DA_PREVIA = 10000

export function ObservacoesDoOrcamento({ tenantId }: { tenantId: string }) {
    const [gravado, setGravado] = useState<string | null | undefined>(undefined)
    const [texto, setTexto] = useState('')
    const [campos, setCampos] = useState<CamposDasObservacoes>(SEM_CAMPOS)
    const [camposGravados, setCamposGravados] = useState<string>(JSON.stringify(SEM_CAMPOS))
    const [erro, setErro] = useState<string | null>(null)
    const [gravando, setGravando] = useState(false)

    const ler = useCallback(async () => {
        try {
            const r = await chamarRota<{ observacoes: string | null; campos: unknown }>(ROTAS_DA_BASE.observacoes(tenantId))
            setGravado(r.observacoes)
            setTexto(r.observacoes ?? '')
            const lidos = r.campos ? lerCamposDasObservacoes(r.campos).campos : SEM_CAMPOS
            setCampos(lidos)
            setCamposGravados(JSON.stringify(lidos))
            setErro(null)
        } catch (e) {
            setGravado(null)
            setErro((e as Error).message)
        }
    }, [tenantId])

    useEffect(() => { ler() }, [ler])

    const gravar = async () => {
        const recusa = recusaDasObservacoes(texto)
        if (recusa) { setErro(recusa); message.error(recusa); return }
        const daGuarda = lerCamposDasObservacoes(campos)
        if (daGuarda.erros.length > 0) {
            const frase = daGuarda.erros.map((x) => `${x.campo}: ${x.mensagem}`).join('; ')
            setErro(frase); message.error(frase); return
        }
        const corpo = paraGravar(texto)
        setGravando(true)
        try {
            await chamarRota(ROTAS_DA_BASE.observacoes(tenantId), 'PUT', { observacoes: corpo, campos: daGuarda.campos })
            setGravado(corpo)
            setTexto(corpo ?? '')
            setCampos(daGuarda.campos)
            setCamposGravados(JSON.stringify(daGuarda.campos))
            setErro(null)
            message.success('Observações gravadas.')
        } catch (e) {
            setErro((e as Error).message)
            message.error('As observações não foram gravadas.')
        } finally {
            setGravando(false)
        }
    }

    const tamanho = texto.trim().length
    const mudou = (gravado ?? '') !== texto.trim() || camposGravados !== JSON.stringify(campos)
    const trocar = (p: Partial<CamposDasObservacoes>) => setCampos((c) => ({ ...c, ...p }))
    const previa = linhasDasObservacoes(campos, { total: TOTAL_DA_PREVIA, textoLivre: texto })

    return (
        <Card key="observacoes" data-bloco="observacoes" title="Observações do orçamento" style={{ marginBottom: 16 }}>
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
                <Typography.Text type="secondary">
                    É o bloco OBSERVAÇÕES, no pé do arquivo do orçamento. Ele é MONTADO destes campos: os prazos de entrega, a validade da
                    proposta, o que não está incluso e as parcelas do pagamento — em percentual, porque os valores em reais saem do total de
                    cada orçamento. Sem campo nenhum, o bloco sai vazio.
                </Typography.Text>
                {erro && <Alert type="error" showIcon message="As observações não foram gravadas." description={erro} />}

                {/* OS PRAZOS: uma linha por grupo + acabamento + dias, como no modelo (PVC: BRANCO 45 DIAS) */}
                <Typography.Text strong>Prazos de entrega</Typography.Text>
                <Input
                    data-prazos-abertura
                    value={campos.prazosAbertura ?? ''}
                    onChange={(e) => trocar({ prazosAbertura: e.target.value === '' ? null : e.target.value })}
                    placeholder="Prazos de entrega após a medição final (salvo alterações em período de férias coletivas)."
                />
                <Table
                    data-prazos
                    size="small"
                    rowKey={(_r, i) => String(i)}
                    pagination={false}
                    dataSource={campos.prazos.map((p, i) => ({ ...p, i }))}
                    locale={{ emptyText: 'nenhum prazo' }}
                    columns={[
                        {
                            title: 'Grupo', dataIndex: 'grupo', width: '26%',
                            render: (v: string, r: { i: number }) => (
                                <Input value={v} placeholder="PVC" onChange={(e) => trocar({ prazos: campos.prazos.map((x, k) => (k === r.i ? { ...x, grupo: e.target.value } : x)) })} />
                            ),
                        },
                        {
                            title: 'Acabamento ou cor', dataIndex: 'acabamento',
                            render: (v: string, r: { i: number }) => (
                                <Input value={v} placeholder="BRANCO" onChange={(e) => trocar({ prazos: campos.prazos.map((x, k) => (k === r.i ? { ...x, acabamento: e.target.value } : x)) })} />
                            ),
                        },
                        {
                            title: 'Dias', dataIndex: 'dias', width: 110,
                            render: (v: number, r: { i: number }) => (
                                <InputNumber min={1} max={3650} value={v} onChange={(n) => trocar({ prazos: campos.prazos.map((x, k) => (k === r.i ? { ...x, dias: Number(n ?? 0) } : x)) })} />
                            ),
                        },
                        {
                            title: '', width: 90,
                            render: (_v: unknown, r: { i: number }) => (
                                <Button danger size="small" onClick={() => trocar({ prazos: campos.prazos.filter((_x, k) => k !== r.i) })}>Remover</Button>
                            ),
                        },
                    ]}
                />
                <Button
                    data-mais-prazo
                    disabled={campos.prazos.length >= LIMITE_DE_PRAZOS}
                    onClick={() => trocar({ prazos: [...campos.prazos, { grupo: campos.prazos[campos.prazos.length - 1]?.grupo ?? '', acabamento: '', dias: 45 }] })}
                >+ prazo</Button>

                {/* A VALIDADE: o número, e a frase é montada com ele */}
                <Space wrap>
                    <Typography.Text strong>Validade da proposta</Typography.Text>
                    <InputNumber data-validade min={1} max={3650} value={campos.validadeDias ?? undefined} placeholder="7"
                        onChange={(n) => trocar({ validadeDias: n === null || n === undefined ? null : Number(n) })} />
                    <Typography.Text type="secondary">dias — em branco, a linha não sai</Typography.Text>
                </Space>

                {/* AS EXCLUSÕES: uma linha cada */}
                <Typography.Text strong>O que não está incluso</Typography.Text>
                {campos.exclusoes.map((e, i) => (
                    <Space.Compact key={i} style={{ width: '100%' }}>
                        <Input data-exclusao value={e} onChange={(ev) => trocar({ exclusoes: campos.exclusoes.map((x, k) => (k === i ? ev.target.value : x)) })} />
                        <Button danger onClick={() => trocar({ exclusoes: campos.exclusoes.filter((_x, k) => k !== i) })}>Remover</Button>
                    </Space.Compact>
                ))}
                <Button data-mais-exclusao disabled={campos.exclusoes.length >= LIMITE_DE_EXCLUSOES}
                    onClick={() => trocar({ exclusoes: [...campos.exclusoes, ''] })}>+ exclusão</Button>

                {/* O PAGAMENTO: percentual e rótulo; os reais saem do total do orçamento */}
                <Typography.Text strong>Forma de pagamento</Typography.Text>
                {campos.pagamento.map((p, i) => (
                    <Space key={i} wrap>
                        <InputNumber data-parcela-percentual min={0.01} max={100} value={p.percentual} addonAfter="%"
                            onChange={(n) => trocar({ pagamento: campos.pagamento.map((x, k) => (k === i ? { ...x, percentual: Number(n ?? 0) } : x)) })} />
                        <Input data-parcela-rotulo value={p.rotulo} placeholder="de Entrada" style={{ width: 220 }}
                            onChange={(e) => trocar({ pagamento: campos.pagamento.map((x, k) => (k === i ? { ...x, rotulo: e.target.value } : x)) })} />
                        <Button danger onClick={() => trocar({ pagamento: campos.pagamento.filter((_x, k) => k !== i) })}>Remover</Button>
                    </Space>
                ))}
                <Space wrap>
                    <Button data-mais-parcela disabled={campos.pagamento.length >= LIMITE_DE_PARCELAS}
                        onClick={() => trocar({ pagamento: [...campos.pagamento, { percentual: 50, rotulo: '' }] })}>+ parcela</Button>
                    <Typography.Text data-soma-das-parcelas type={campos.pagamento.length > 0 && Number(campos.pagamento.reduce((s, p) => s + p.percentual, 0).toFixed(6)) !== 100 ? 'danger' : 'secondary'}>
                        soma {Number(campos.pagamento.reduce((s, p) => s + p.percentual, 0).toFixed(6))}% de 100%
                    </Typography.Text>
                </Space>

                <Typography.Text strong>Outras observações (texto livre)</Typography.Text>
                <Input.TextArea
                    data-observacoes
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    autoSize={{ minRows: 6, maxRows: 20 }}
                    // o exemplo não usa a palavra proibida no texto que vai ao vendedor (`atendimentos-ia-item-no-lugar-de-esquadria`)
                    placeholder={'Prazos de entrega após a medição final:\nPVC branco: 45 dias\nProposta válida por 7 dias a partir da emissão.\nNão contempla remoção e descarte do que já está instalado.'}
                    disabled={gravado === undefined}
                />
                {/* A PRÉVIA: o bloco como sairia, com um total de exemplo — é o que o cliente vai ler */}
                <Typography.Text strong>Como vai sair no orçamento</Typography.Text>
                <div data-previa style={{ padding: 10, border: '1px solid #f0f0f0', borderRadius: 6, background: '#fafafa', whiteSpace: 'pre-wrap', fontSize: 12 }}>
                    {previa.length === 0 ? <Typography.Text type="secondary">o bloco sai vazio</Typography.Text> : previa.join('\n')}
                </div>
                <Typography.Text type="secondary">
                    As parcelas acima usam {TOTAL_DA_PREVIA.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} como exemplo; em cada
                    orçamento elas saem do total dele.
                </Typography.Text>

                <Space wrap>
                    <Typography.Text data-contagem type={tamanho > LIMITE_DAS_OBSERVACOES ? 'danger' : 'secondary'}>
                        {tamanho} / {LIMITE_DAS_OBSERVACOES}
                    </Typography.Text>
                    <Button type="primary" loading={gravando} disabled={!mudou || tamanho > LIMITE_DAS_OBSERVACOES} onClick={gravar}>
                        Salvar observações
                    </Button>
                </Space>
            </Space>
        </Card>
    )
}
