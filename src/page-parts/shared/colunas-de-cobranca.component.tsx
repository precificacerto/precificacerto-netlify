/**
 * colunas-de-cobranca.component.tsx — a coluna "Em aberto" PARTIDA EM DUAS, e a terceira.
 *
 * POR QUE PARTIDA, e não um total só
 * -----------------------------------
 * Somar vencido e a vencer esconde a informação que faz alguém pegar o telefone. "R$ 5.000
 * em aberto" não diz se é dívida ou agenda; "R$ 4.800 vencido e R$ 200 a vencer" diz.
 *
 * A TERCEIRA COLUNA SÓ APARECE QUANDO HÁ O QUE MOSTRAR
 * -----------------------------------------------------
 * `SEM VENCIMENTO` é renderizada só se ALGUM cliente da lista tem valor sem vencimento.
 * Hoje são 0 linhas na base inteira — uma coluna permanentemente em branco treina o olho a
 * ignorá-la, e aí a primeira linha sem vencimento que aparecer não vai ser vista.
 *
 * VENCIDO E A VENCER SÓ EXISTEM COM O FILTRO LIGADO (17/10/2026)
 * ----------------------------------------------------------------
 * Pedido do dono do produto: a lista vai ao celular, e as duas saem da visão padrão. Cada uma
 * é RENDERIZADA só quando o seu interruptor está ligado — `mostrar`, derivado da URL por
 * `colunasCondicionais`. Não é coluna vazia nem CSS: com o filtro desligado ela não está no
 * array. `SEM VENCIMENTO` NÃO entrou na lista do pedido e segue a regra própria, acima.
 *
 * TRAVESSÃO, NUNCA R$ 0,00
 * -------------------------
 * Cliente sem parcela nenhuma não tem agregado, e a célula exibe travessão. `formatBRL(0)`
 * devolveria "R$ 0,00", que AFIRMA que o cliente não deve nada — e é a mesma afirmação para
 * quem deve zero e para quem não tem lançamento nenhum (`ausente-vs-falso.md`). Zero
 * APURADO, esse sim, sai como R$ 0,00: ele vem de um agregado que existe.
 */

import React from 'react'
import type { ColumnsType } from 'antd/es/table'

import { formatBRL } from '@/utils/formatters'
import type { AgregadoDoCliente } from '@/utils/parcelas-do-cliente'

export interface LinhaComCobranca {
    id: string
}

/** O título de cada coluna, exportado para que o portão não dependa de string solta. */
export const TITULO_VENCIDO = 'Vencido'
export const TITULO_A_VENCER = 'A vencer'
export const TITULO_SEM_VENCIMENTO = 'Sem vencimento'

/** "há 1 dia" / "há N dias" — o MESMO texto na célula e no cartão. */
function textoDoAtraso(dias: number): string {
    return dias === 1 ? 'há 1 dia' : `há ${dias} dias`
}

/** `—` em vez de `R$ 0,00` quando não há agregado: ausência não é zero. */
function celula(valor: number | undefined, cor?: string): React.ReactNode {
    if (valor === undefined) return <span style={{ color: 'var(--color-neutral-400)' }}>—</span>
    return <span style={{ color: cor, fontVariantNumeric: 'tabular-nums' }}>{formatBRL(valor)}</span>
}

/**
 * As colunas de cobrança. São DUAS, e viram TRÊS quando algum cliente da lista tem valor
 * sem vencimento — a decisão é da LISTA, não da linha, senão a tabela teria uma coluna que
 * existe para umas linhas e não para outras.
 */
export function colunasDeCobranca<T extends LinhaComCobranca>(
    porCliente: Record<string, AgregadoDoCliente>,
    /** Obrigatório, SEM default: quem chama decide, pelo filtro — ver o cabeçalho. */
    mostrar: { vencido: boolean; aVencer: boolean },
): ColumnsType<T> {
    const alguemSemVencimento = Object.values(porCliente).some((a) => a.semVencimento > 0)

    const colunas: ColumnsType<T> = []

    if (mostrar.vencido) colunas.push(
        {
            title: TITULO_VENCIDO,
            key: 'vencido',
            align: 'right',
            width: 130,
            sorter: (a, b) => (porCliente[a.id]?.vencido ?? 0) - (porCliente[b.id]?.vencido ?? 0),
            render: (_, record) => {
                const agregado = porCliente[record.id]
                if (!agregado) return celula(undefined)
                const atraso = agregado.maiorAtrasoDias
                return (
                    <div>
                        {celula(agregado.vencido, agregado.vencido > 0 ? 'var(--color-danger-600, #b42318)' : undefined)}
                        {atraso !== null && (
                            <div style={{ fontSize: 11, color: 'var(--color-neutral-400)' }}>
                                {textoDoAtraso(atraso)}
                            </div>
                        )}
                    </div>
                )
            },
        },
    )

    if (mostrar.aVencer) colunas.push(
        {
            title: TITULO_A_VENCER,
            key: 'a_vencer',
            align: 'right',
            width: 130,
            sorter: (a, b) => (porCliente[a.id]?.aVencer ?? 0) - (porCliente[b.id]?.aVencer ?? 0),
            render: (_, record) => celula(porCliente[record.id]?.aVencer),
        },
    )

    if (alguemSemVencimento) {
        colunas.push({
            title: TITULO_SEM_VENCIMENTO,
            key: 'sem_vencimento',
            align: 'right',
            width: 140,
            render: (_, record) => {
                const agregado = porCliente[record.id]
                if (!agregado || agregado.semVencimento === 0) return celula(undefined)
                return celula(agregado.semVencimento)
            },
        })
    }

    return colunas
}

/**
 * AS MESMAS DUAS, NO CARTÃO DO MOBILE — uma linha com rótulo cada, nunca coluna.
 *
 * A VII.3: "um filtro de atraso que devolve lista cuja coluna não mostra o atraso não serve
 * para nada" — e o cartão é a tela do celular, que é a razão desta rodada. Ligar EM ATRASO no
 * celular filtrava por um número que a tela não mostrava. Mesma regra da tabela: cada linha só
 * EXISTE com o seu interruptor ligado; desligados, o cartão fica como era.
 *
 * Mesma fonte de valor e de formatação das células (`celula`, `textoDoAtraso`): duas
 * renderizações do mesmo número escritas à parte divergiriam (`copia-divergente.md`).
 */
export function LinhasDeCobrancaNoCartao({ agregado, mostrar }: {
    agregado: AgregadoDoCliente | undefined
    mostrar: { vencido: boolean; aVencer: boolean }
}) {
    if (!mostrar.vencido && !mostrar.aVencer) return null
    return (
        <span className="pc-row-compact__sub" data-testid="cobranca-no-cartao">
            {mostrar.vencido && (
                <span data-testid="cartao-vencido" style={{ display: 'block' }}>
                    {TITULO_VENCIDO}: {celula(agregado?.vencido, agregado && agregado.vencido > 0 ? 'var(--color-danger-600, #b42318)' : undefined)}
                    {agregado && agregado.maiorAtrasoDias !== null && ` · ${textoDoAtraso(agregado.maiorAtrasoDias)}`}
                </span>
            )}
            {mostrar.aVencer && (
                <span data-testid="cartao-a-vencer" style={{ display: 'block' }}>
                    {TITULO_A_VENCER}: {celula(agregado?.aVencer)}
                </span>
            )}
        </span>
    )
}
