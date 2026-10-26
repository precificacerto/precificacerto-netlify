/**
 * O TESTE DE ENVIO DE ANEXO da conta, na tela da conta do super admin (26/10/2026). Um botão: o servidor envia um PDF
 * de teste, de uma página, ao remetente autorizado ativo, pela conexão do orçamentista, e a tela diz se foi — com o
 * status do WUZAPI, o tamanho e o tempo. Nada do telefone nem do token chega aqui. É o instrumento que mede se o passo 2
 * do roteiro (um arquivo no WhatsApp) é possível por essa conexão, antes de construí-lo.
 */
import React, { useState } from 'react'
import { Alert, Button, Typography } from 'antd'
import { ROTAS_DO_CATALOGO } from '@/utils/atendimentos-ia-catalogo'
import { ErroDaRota, chamarRota } from '@/page-parts/atendimentos-ia/api'

type Resultado = { enviado: boolean; status: number; bytes: number; ms: number; detalhe?: string }

export function TesteDeAnexo({ tenantId }: { tenantId: string }) {
    const [enviando, setEnviando] = useState(false)
    const [resultado, setResultado] = useState<Resultado | null>(null)
    const [erro, setErro] = useState<string | null>(null)

    async function enviar() {
        setEnviando(true); setErro(null); setResultado(null)
        try {
            setResultado(await chamarRota<Resultado>(ROTAS_DO_CATALOGO.testeDeAnexo(tenantId), 'POST', {}))
        } catch (e) {
            // o 502 traz o resultado do WUZAPI no corpo: é medida, não falha da tela
            const corpo = e instanceof ErroDaRota ? (e.corpo as Resultado | null) : null
            if (corpo && typeof corpo.enviado === 'boolean') setResultado(corpo)
            else setErro((e as Error).message)
        } finally {
            setEnviando(false)
        }
    }

    return (
        <div data-grupo="teste-de-anexo">
            <Typography.Title level={5} style={{ marginTop: 0 }}>Teste de envio de anexo</Typography.Title>
            <Typography.Paragraph type="secondary" style={{ fontSize: 13 }}>
                Envia um PDF de teste, de uma página, ao remetente autorizado ativo desta conta, pela conexão do orçamentista.
            </Typography.Paragraph>
            <Button data-enviar-teste-de-anexo onClick={enviar} loading={enviando} disabled={enviando}>Enviar PDF de teste</Button>
            {resultado && (
                <Alert data-resultado-do-teste-de-anexo style={{ marginTop: 12 }} showIcon type={resultado.enviado ? 'success' : 'error'}
                    message={resultado.enviado ? 'O anexo saiu pela conexão do orçamentista.' : 'O anexo NÃO saiu pela conexão do orçamentista.'}
                    description={`Status do WUZAPI: ${resultado.status} · arquivo de ${resultado.bytes} bytes · ${resultado.ms} ms${resultado.detalhe ? ` · ${resultado.detalhe}` : ''}`} />
            )}
            {erro && <Alert style={{ marginTop: 12 }} showIcon type="warning" message={erro} />}
        </div>
    )
}
