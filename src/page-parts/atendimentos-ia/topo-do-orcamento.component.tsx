/**
 * O TOPO DO ORÇAMENTO na tela da precificação (dono do produto, 11/11/2026): as credenciais do cliente, lidas do levantamento de origem por
 * `levantamento_id` — as MESMAS que o PDF imprime, com os MESMOS rótulos (`CAMPOS_DO_CLIENTE`). Campo sem dado fica EM BRANCO: o rótulo
 * aparece e o valor fica vazio — nunca zero, nunca texto inventado, nunca a linha escondida.
 */
import React from 'react'
import { Alert, Card } from 'antd'
import { CAMPOS_DO_CLIENTE, type ClienteDoArquivo } from '@/lib/atendimentos-ia/arquivo-do-orcamento'
import { fraseDoFiscalDivergente, type CampoDivergente } from '@/lib/atendimentos-ia/precificacao-do-orcamento'

export function TopoDoOrcamento({ cliente }: { cliente: ClienteDoArquivo }) {
    return (
        <Card size="small" title="Cliente" style={{ marginBottom: 12 }} data-topo-do-orcamento="">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 14rem), 1fr))', gap: '6px 16px' }}>
                {CAMPOS_DO_CLIENTE.map(([rotulo, chave]) => (
                    <div key={chave} data-campo-do-cliente={chave} style={{ display: 'flex', gap: 6, minWidth: 0, fontSize: 13 }}>
                        <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{rotulo}</span>
                        <span data-valor-do-cliente="" style={{ overflowWrap: 'anywhere' }}>{cliente[chave] ?? ''}</span>
                    </div>
                ))}
            </div>
        </Card>
    )
}

/**
 * O AVISO DO FISCAL DIVERGENTE (dono do produto, 11/11/2026: "aviso, não recusa"): o orçamento tem gravado um fiscal fora do preset — só por fora
 * do código, porque a tela não tem seletor. Diz O QUE está gravado e que o salvar volta ao preset, registrando o que sobrescrever. Não trava o
 * salvar: sem caminho manual na tela, recusar deixaria o orçamento morto, sem ninguém poder destravar.
 */
export function AvisoDoFiscalDivergente({ divergencia }: { divergencia: readonly CampoDivergente[] }) {
    if (divergencia.length === 0) return null
    return <Alert type="warning" showIcon style={{ marginBottom: 12 }} data-fiscal-divergente="" message={fraseDoFiscalDivergente(divergencia)} />
}
