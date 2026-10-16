/**
 * tela-da-parcela.component.tsx — a parcela em LEITURA, largura inteira, endereço próprio.
 *
 * NÃO É POP-UP. O endereço é `?parcela=<id>` na própria ficha, e a escolha é do dono do
 * produto: a ficha já tem o mecanismo de URL montado (`?aba=`, `?editar=1`, `?mais=1`), e
 * uma rota aninhada (`/clientes/[id]/parcela/[parcelaId]`) obrigaria a recarregar o cliente
 * inteiro para mostrar uma parcela dele.
 *
 * ESTA ETAPA É LEITURA. Nenhum campo editável, nenhum botão de gravar — a baixa é a 5b, e
 * há caso no portão afirmando a ausência. É ele que impede a 5b entrar sem comando.
 */

import React from 'react'
import { Button, Tag } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'

import { formatBRL } from '@/utils/formatters'
import type { LinhaDeVencimento } from '@/utils/vencimentos-da-ficha'

export const TEXTO_PARCELA_NAO_ENCONTRADA = 'Parcela não encontrada.'
export const TITULO_DA_TELA_DA_PARCELA = 'Parcela'
export const TITULO_DAS_IRMAS = 'As outras parcelas desta venda'

const TRAVESSAO = '—'

const SELO: Record<LinhaDeVencimento['estado'], { cor: string; rotulo: string }> = {
    PAGA: { cor: 'green', rotulo: 'Paga' },
    VENCIDA: { cor: 'red', rotulo: 'Vencida' },
    A_VENCER: { cor: 'orange', rotulo: 'Em aberto' },
    SEM_VENCIMENTO: { cor: 'default', rotulo: 'Sem vencimento' },
}

function diaBR(iso: string | null | undefined): string {
    if (iso === null || iso === undefined || iso === '') return TRAVESSAO
    const [a, m, d] = iso.slice(0, 10).split('-')
    return `${d}/${m}/${a}`
}

/** O que a tela mostra da VENDA. Tudo opcional: a parcela órfã não tem venda nenhuma. */
export interface VendaDaParcela {
    codigo?: string | null
    /** `sales.sale_date` — a data de efetivação. */
    efetivadaEm?: string | null
    vendedor?: string | null
    /** `cash_entries.payment_method` — a forma COMBINADA, que vive na parcela. */
    formaCombinada?: string | null
}

export interface TelaDaParcelaProps {
    /** `null` quando o `?parcela=` não resolve: a ficha NÃO cai, mostra o estado. */
    linha: LinhaDeVencimento | null
    venda: VendaDaParcela
    irmas: LinhaDeVencimento[]
    aoFechar: () => void
}

function Campo({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
    return (
        <div style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <span style={{ minWidth: 190, color: 'var(--color-neutral-400)', fontSize: 13 }}>{rotulo}</span>
            <span style={{ fontSize: 13 }}>{valor}</span>
        </div>
    )
}

export function TelaDaParcela({ linha, venda, irmas, aoFechar }: TelaDaParcelaProps) {
    if (linha === null) {
        return (
            <div data-testid="tela-da-parcela" style={{ padding: 40, textAlign: 'center' }}>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>{TEXTO_PARCELA_NAO_ENCONTRADA}</div>
                <Button icon={<ArrowLeftOutlined />} onClick={aoFechar}>Voltar para a ficha</Button>
            </div>
        )
    }

    const selo = SELO[linha.estado]
    const textoDoSelo = linha.estado === 'VENCIDA' && linha.diasDeAtraso !== null
        ? (linha.diasDeAtraso === 1 ? 'Vencida há 1 dia' : `Vencida há ${linha.diasDeAtraso} dias`)
        : linha.estado === 'PAGA' && linha.pagaEm !== null
            ? `Paga em ${diaBR(linha.pagaEm)}`
            : selo.rotulo

    return (
        // LARGURA INTEIRA: a tela da parcela ocupa a ficha, não um painel ao lado.
        <div data-testid="tela-da-parcela" style={{ width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <Button icon={<ArrowLeftOutlined />} onClick={aoFechar}>Voltar</Button>
                <span style={{ fontSize: 18, fontWeight: 800 }}>
                    {TITULO_DA_TELA_DA_PARCELA} {linha.numero} de {linha.de}
                </span>
                <Tag color={selo.cor}>{textoDoSelo}</Tag>
            </div>

            <div style={{ maxWidth: 720 }}>
                <Campo rotulo="Código da venda" valor={venda.codigo ?? TRAVESSAO} />
                <Campo rotulo="Efetivada em" valor={diaBR(venda.efetivadaEm)} />
                <Campo rotulo="Vendedor" valor={venda.vendedor ?? TRAVESSAO} />
                <Campo rotulo="Vencimento" valor={diaBR(linha.vencimento)} />
                <Campo rotulo="Valor" valor={formatBRL(linha.valor)} />
                {/* A forma vive na PARCELA (`cash_entries.payment_method`), não na venda —
                    medido: a coluna existe e o fluxo de caixa já a altera na baixa. Aqui
                    ela é só exibida; alterá-la é a 5b. */}
                <Campo rotulo="Forma combinada" valor={venda.formaCombinada ?? TRAVESSAO} />
            </div>

            {irmas.length > 1 && (
                <div style={{ marginTop: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{TITULO_DAS_IRMAS}</div>
                    {irmas.map((i) => {
                        const s = SELO[i.estado]
                        return (
                            <div
                                key={i.id}
                                style={{
                                    display: 'flex', gap: 12, padding: '6px 0', alignItems: 'center',
                                    opacity: i.id === linha.id ? 1 : 0.75,
                                    fontWeight: i.id === linha.id ? 700 : 400,
                                }}
                            >
                                <span style={{ minWidth: 70 }}>{i.numero} de {i.de}</span>
                                <span style={{ minWidth: 110 }}>{diaBR(i.vencimento)}</span>
                                <span style={{ minWidth: 120, fontVariantNumeric: 'tabular-nums' }}>{formatBRL(i.valor)}</span>
                                <Tag color={s.cor}>{s.rotulo}</Tag>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
