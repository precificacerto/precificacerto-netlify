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
import { Alert, Button, Card, Input, Space, Typography, message } from 'antd'
import { LIMITE_DAS_OBSERVACOES, fraseDasObservacoesGrandes } from '@/lib/atendimentos-ia/base-de-conhecimento'
import { chamarRota } from '@/page-parts/atendimentos-ia/api'
import { ROTAS_DA_BASE } from './formulario'

/** O que o usuário lê ANTES de salvar; a do banco é a que não deixa passar por outro caminho. */
export function recusaDasObservacoes(texto: string): string | null {
    const aparado = texto.trim()
    return aparado.length > LIMITE_DAS_OBSERVACOES ? fraseDasObservacoesGrandes(aparado.length) : null
}

/** O texto como ele será gravado (aparado); vazio e só-espaço são null, que limpa. */
export const paraGravar = (texto: string): string | null => (texto.trim() === '' ? null : texto.trim())

export function ObservacoesDoOrcamento({ tenantId }: { tenantId: string }) {
    const [gravado, setGravado] = useState<string | null | undefined>(undefined)
    const [texto, setTexto] = useState('')
    const [erro, setErro] = useState<string | null>(null)
    const [gravando, setGravando] = useState(false)

    const ler = useCallback(async () => {
        try {
            const r = await chamarRota<{ observacoes: string | null }>(ROTAS_DA_BASE.observacoes(tenantId))
            setGravado(r.observacoes)
            setTexto(r.observacoes ?? '')
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
        const corpo = paraGravar(texto)
        setGravando(true)
        try {
            await chamarRota(ROTAS_DA_BASE.observacoes(tenantId), 'PUT', { observacoes: corpo })
            setGravado(corpo)
            setTexto(corpo ?? '')
            setErro(null)
            message.success(corpo === null ? 'Observações removidas.' : 'Observações gravadas.')
        } catch (e) {
            setErro((e as Error).message)
            message.error('As observações não foram gravadas.')
        } finally {
            setGravando(false)
        }
    }

    const tamanho = texto.trim().length
    const mudou = (gravado ?? '') !== texto.trim()

    return (
        <Card key="observacoes" data-bloco="observacoes" title="Observações do orçamento" style={{ marginBottom: 16 }}>
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
                <Typography.Text type="secondary">
                    É o texto do bloco OBSERVAÇÕES, no pé do arquivo do orçamento: prazos de entrega, validade da proposta e o que não está
                    incluso. Sai igual em todo orçamento desta empresa. Sem texto, o bloco sai vazio.
                </Typography.Text>
                {erro && <Alert type="error" showIcon message="As observações não foram gravadas." description={erro} />}
                <Input.TextArea
                    data-observacoes
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    autoSize={{ minRows: 6, maxRows: 20 }}
                    // o exemplo não usa a palavra proibida no texto que vai ao vendedor (`atendimentos-ia-item-no-lugar-de-esquadria`)
                    placeholder={'Prazos de entrega após a medição final:\nPVC branco: 45 dias\nProposta válida por 7 dias a partir da emissão.\nNão contempla remoção e descarte do que já está instalado.'}
                    disabled={gravado === undefined}
                />
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
