/**
 * A ÚLTIMA FAIXA ANTES DO "SALVAR PRECIFICAÇÃO" do orçamento I.A. (dono do produto, 11/11/2026): "Todos os itens, com as suas variáveis, já
 * precificados individualmente. Depois deles, o total."
 *
 * Os itens são os MESMOS que o arquivo "Orçamento" imprime (`itensDoArquivo`), e o valor de cada um é o MESMO rateio exato da operação interna
 * (`ratearOperacaoInterna`): o que a pessoa vê aqui antes de salvar é o que o cliente recebe. O rateio que não fecha aparece aqui, nomeado,
 * antes do clique. Sem preço formado, a faixa diz isso em vez de mostrar zero.
 */
import React from 'react'
import { Alert, Card, Typography } from 'antd'
import { ratearOperacaoInterna, reais } from '@/lib/atendimentos-ia/rateio-do-orcamento'
import type { ItemDoArquivo } from '@/lib/atendimentos-ia/arquivo-do-orcamento'

export const TITULO_DA_FAIXA = 'Itens precificados'
export const FRASE_SEM_PRECO = 'O preço ainda não se formou: os itens aparecem aqui precificados quando a precificação sair.'

type Props = {
    itens: readonly ItemDoArquivo[] | null
    recusaDosItens: string | null
    /** O custo líquido total de cada item (o peso do rateio), por ordem. */
    pesos: ReadonlyArray<{ ordem: number; quantidade: number; peso: number | null }>
    /** A operação interna que a tela formou agora; 0 = não formou. */
    interna: number
}

const medidas = (i: ItemDoArquivo) => (i.largura_mm && i.altura_mm ? `${i.largura_mm} x ${i.altura_mm} mm` : '')

export function ItensPrecificados({ itens, recusaDosItens, pesos, interna }: Props) {
    if (recusaDosItens) return <Alert type="error" showIcon data-itens-precificados="recusa" message="Os itens do arquivo não se montam:" description={recusaDosItens} style={{ marginTop: 16 }} />
    if (!itens) return null
    const rateio = interna > 0 ? ratearOperacaoInterna(Math.round(interna * 100) / 100, pesos.map((p) => ({ ordem: p.ordem, quantidade: p.quantidade, peso: p.peso ?? NaN }))) : null
    const doRateio = rateio && !('recusa' in rateio) ? new Map(rateio.itens.map((r) => [r.ordem, r])) : null
    return (
        <Card size="small" title={TITULO_DA_FAIXA} style={{ marginTop: 16 }} data-itens-precificados="">
            {rateio === null && <Typography.Paragraph type="secondary" data-sem-preco="">{FRASE_SEM_PRECO}</Typography.Paragraph>}
            {rateio && 'recusa' in rateio && <Alert type="error" showIcon data-recusa-do-rateio="" message={rateio.recusa} style={{ marginBottom: 8 }} />}
            {[...itens].sort((a, b) => a.ordem - b.ordem).map((i) => {
                const r = doRateio?.get(i.ordem)
                return (
                    <div key={i.ordem} data-item-precificado={i.ordem} style={{ display: 'flex', gap: 12, justifyContent: 'space-between', borderTop: '1px solid #e5e7eb', padding: '8px 0', flexWrap: 'wrap' }}>
                        <div style={{ minWidth: 0, flex: '1 1 320px' }}>
                            <Typography.Text strong>Item {i.ordem}{i.tipologia ? ` — ${i.tipologia}` : ''}</Typography.Text>
                            {i.descricao && i.descricao !== i.tipologia && <div style={{ fontSize: 12 }}>{i.descricao}</div>}
                            <div style={{ fontSize: 12, color: '#475569' }} data-detalhe-do-item="">
                                {[medidas(i), `${i.quantidade} un.`, i.corPerfil && `cor ${i.corPerfil}`, i.vidro && `vidro ${i.vidro}`, i.ambientes].filter(Boolean).join(' · ')}
                            </div>
                            {i.variaveis.length > 0 && <div style={{ fontSize: 12, color: '#475569' }} data-variaveis-do-item="">{i.variaveis.join(' · ')}</div>}
                        </div>
                        <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }} data-valor-do-item="">
                            {r ? <><div style={{ fontSize: 12 }}>{reais(r.unitario)} × {r.quantidade}</div><Typography.Text strong>{reais(r.total)}</Typography.Text></> : '—'}
                        </div>
                    </div>
                )
            })}
            {rateio && !('recusa' in rateio) && (
                <div data-total-dos-itens="" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #0f172a', paddingTop: 8 }}>
                    <Typography.Text strong>Total</Typography.Text>
                    <Typography.Text strong>{reais(rateio.centavos)}</Typography.Text>
                </div>
            )}
        </Card>
    )
}
