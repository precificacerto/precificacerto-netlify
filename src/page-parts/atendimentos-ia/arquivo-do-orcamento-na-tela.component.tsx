/**
 * O ARQUIVO PDF DO ORÇAMENTO, no fim da página do orçamento I.A. (pedido 0051, 27/11/2026): visualização e download do ÚLTIMO arquivo gerado, relido
 * a cada `sinal` (o cálculo e o salvamento regeram o arquivo). Lê pela rota do arquivo, no tenant do chamador; sem arquivo, diz por quê.
 */
import { useEffect, useState } from 'react'
import { Alert, Button, Card, Spin } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'

export const TITULO_DO_ARQUIVO = 'Arquivo PDF do orçamento'

export function ArquivoDoOrcamentoNaTela({ id, numero, sinal, recusas = [] }: { id: string; numero: string | number; sinal: number; recusas?: readonly string[] }) {
    const [estado, setEstado] = useState<{ tipo: 'carregando' } | { tipo: 'sem'; frase: string } | { tipo: 'pronto'; url: string }>({ tipo: 'carregando' })
    useEffect(() => {
        let fim = false
        let url: string | null = null
        setEstado({ tipo: 'carregando' })
        void (async () => {
            try {
                const r = await fetch(`/api/atendimentos-ia/orcamentos/${id}/arquivo`, { cache: 'no-store' })
                if (fim) return
                if (!r.ok) {
                    const corpo = (await r.json().catch(() => ({}))) as { error?: string }
                    return setEstado({ tipo: 'sem', frase: corpo.error ?? 'Não foi possível ler o arquivo do orçamento.' })
                }
                url = URL.createObjectURL(await r.blob())
                if (fim) { URL.revokeObjectURL(url); return }
                setEstado({ tipo: 'pronto', url })
            } catch {
                if (!fim) setEstado({ tipo: 'sem', frase: 'Não foi possível ler o arquivo do orçamento.' })
            }
        })()
        return () => { fim = true; if (url) URL.revokeObjectURL(url) }
    }, [id, sinal])
    return (
        <Card size="small" title={TITULO_DO_ARQUIVO} data-arquivo-do-orcamento=""
            extra={estado.tipo === 'pronto' ? <Button size="small" icon={<DownloadOutlined />} href={estado.url} download={`orcamento-${numero}.pdf`} data-baixar-arquivo="">Baixar</Button> : null}>
            {recusas.length > 0 && (
                <Alert type="warning" showIcon style={{ marginBottom: 12 }} data-recusas-do-arquivo-novo="" message="O arquivo não foi regerado:"
                    description={<ul style={{ margin: 0, paddingLeft: 18 }}>{recusas.map((f) => <li key={f}>{f}</li>)}</ul>} />
            )}
            {estado.tipo === 'carregando' && <div style={{ padding: 16, textAlign: 'center' }}><Spin /></div>}
            {estado.tipo === 'sem' && <Alert type="info" showIcon data-sem-arquivo="" message={estado.frase} />}
            {estado.tipo === 'pronto' && <iframe title={TITULO_DO_ARQUIVO} src={estado.url} data-visualizador-do-arquivo="" style={{ width: '100%', height: 720, border: '1px solid #d9d9d9', borderRadius: 4 }} />}
        </Card>
    )
}
