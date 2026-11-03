/**
 * O bloco PROMPT DE ATENDIMENTO da conta (dono do produto, 26/10/2026): "como conversar" — texto livre, até
 * 4.000 caracteres, uma linha por empresa, gravado pela função com log (`superadmin_gravar_contexto_do_atendimento`).
 *
 * A LINHA QUE SEPARA AS CAMADAS, dita no próprio bloco: o contexto manda em QUANDO e EM QUE FORMA; o número é
 * do código. O PROMPT BASE DO PRODUTO (03/11/2026) aparece ACIMA do campo, em leitura — "para a pessoa saber o que já
 * está valendo e não copiar de novo" —, e é o mesmo texto que abre o sistema da conversa (`PROMPT_BASE`). Com o campo
 * vazio, a conversa segue só com o base; nenhum texto é posto no campo pelo bloco.
 *
 * O limite é contado como o banco conta (`contarCaracteres`, pontos de código): acima dele, o salvar não sai e a
 * frase diz quantos. Falha de leitura é ERRO, nunca um campo vazio que alguém salvaria por cima do gravado.
 * Portão: `src/utils/__tests__/atendimentos-ia-prompt-de-atendimento-a-tela.test.tsx`.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Input, Space, Typography, message } from 'antd'
import { chamarRota } from '@/page-parts/atendimentos-ia/api'
import { PROMPT_BASE, TITULO_DO_PROMPT_BASE } from '@/utils/atendimentos-ia-prompt-base'
import {
    AVISO_DO_CONTEXTO_VAZIO, AVISO_DO_PROMPT_BASE, A_LINHA_DAS_CAMADAS, LIMITE_DO_CONTEXTO, contarCaracteres, fraseDoLimiteDoContexto, rotaDoContexto,
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
            {/* o base aparece sempre, também quando a leitura do contexto falha: ele não depende dela */}
            <section data-prompt-base aria-label={`${TITULO_DO_PROMPT_BASE} (somente leitura)`} style={{ marginBottom: 16 }}>
                <Typography.Text strong>{TITULO_DO_PROMPT_BASE}</Typography.Text>
                <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: '4px 0 8px' }}>{AVISO_DO_PROMPT_BASE}</Typography.Paragraph>
                <pre
                    data-texto-do-prompt-base
                    style={{
                        whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: 0, padding: 12, fontSize: 12, fontFamily: 'inherit',
                        background: 'rgba(0, 0, 0, 0.03)', border: '1px solid rgba(0, 0, 0, 0.08)', borderRadius: 6, maxHeight: 360, overflowY: 'auto',
                    }}
                >
                    {PROMPT_BASE}
                </pre>
            </section>
            <Typography.Text strong>Contexto da empresa</Typography.Text>
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
