/**
 * O bloco PROMPT DE ATENDIMENTO da conta (dono do produto, 26/10/2026): "como conversar" — texto livre, até
 * 4.000 caracteres, uma linha por empresa, gravado pela função com log (`superadmin_gravar_contexto_do_atendimento`).
 *
 * A LINHA QUE SEPARA AS CAMADAS, dita no próprio bloco: o contexto manda em QUANDO e EM QUE FORMA; o número é
 * do código. VAZIO É O PADRÃO: o campo vazio é o padrão, e a conversa segue como hoje — o bloco diz isso, e
 * nenhum texto é posto no campo por ele.
 *
 * O limite é contado como o banco conta (`contarCaracteres`, pontos de código): acima dele, o salvar não sai e a
 * frase diz quantos. Falha de leitura é ERRO, nunca um campo vazio que alguém salvaria por cima do gravado.
 * Portão: `src/utils/__tests__/atendimentos-ia-prompt-de-atendimento-a-tela.test.tsx`.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Input, Space, Typography, message } from 'antd'
import { chamarRota } from '@/page-parts/atendimentos-ia/api'
import {
    AVISO_DO_CONTEXTO_VAZIO, A_LINHA_DAS_CAMADAS, LIMITE_DO_CONTEXTO, contarCaracteres, fraseDoLimiteDoContexto, rotaDoContexto,
    type ContextoGravado,
} from '@/utils/atendimentos-ia-contexto'

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

export function PromptDeAtendimento({ tenantId }: { tenantId: string }) {
    const [gravado, setGravado] = useState<ContextoGravado | null>(null)
    const [texto, setTexto] = useState('')
    const [erroAoLer, setErroAoLer] = useState<string | null>(null)
    const [erroAoSalvar, setErroAoSalvar] = useState<string | null>(null)
    const [salvando, setSalvando] = useState(false)

    const carregar = useCallback(async () => {
        try {
            const c = await chamarRota<ContextoGravado>(rotaDoContexto(tenantId))
            setGravado(c)
            setTexto(c.texto ?? '')
            setErroAoLer(null)
        } catch (e) {
            setErroAoLer((e as Error).message)
        }
    }, [tenantId])
    useEffect(() => { carregar() }, [carregar])

    const n = contarCaracteres(texto)
    const passou = n > LIMITE_DO_CONTEXTO

    async function salvar() {
        setSalvando(true)
        setErroAoSalvar(null)
        try {
            await chamarRota(rotaDoContexto(tenantId), 'PUT', { texto })
            message.success('Contexto do atendimento salvo')
            await carregar()
        } catch (e) {
            setErroAoSalvar((e as Error).message)
        } finally {
            setSalvando(false)
        }
    }

    return (
        <div data-grupo="contexto-do-atendimento">
            <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>{A_LINHA_DAS_CAMADAS}</Typography.Paragraph>
            {erroAoLer && <Alert type="error" showIcon message="Não foi possível ler o contexto do atendimento." description={erroAoLer} action={<Button onClick={carregar}>Tentar de novo</Button>} />}
            {!erroAoLer && gravado && (
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                    <Input.TextArea
                        value={texto}
                        onChange={(e) => setTexto(e.target.value)}
                        autoSize={{ minRows: 6, maxRows: 18 }}
                        aria-label="Contexto do atendimento"
                        data-contexto
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <Typography.Text type={passou ? 'danger' : 'secondary'} style={{ fontSize: 12 }} data-contador-do-contexto>
                            {`${n.toLocaleString('pt-BR')} / ${LIMITE_DO_CONTEXTO.toLocaleString('pt-BR')}`}
                        </Typography.Text>
                        {gravado.atualizado_em && (
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                {`Alterado${gravado.atualizado_por ? ` por ${gravado.atualizado_por}` : ''} em ${quando(gravado.atualizado_em)}`}
                            </Typography.Text>
                        )}
                    </div>
                    {texto.trim() === '' && <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: 0 }}>{AVISO_DO_CONTEXTO_VAZIO}</Typography.Paragraph>}
                    {passou && <Alert type="warning" showIcon message={fraseDoLimiteDoContexto(n)} />}
                    <div>
                        <Button type="primary" onClick={salvar} loading={salvando} disabled={passou} data-salvar-contexto>Salvar contexto</Button>
                    </div>
                    {erroAoSalvar && <Alert type="error" showIcon message="O contexto não foi salvo." description={erroAoSalvar} />}
                </Space>
            )}
        </div>
    )
}
