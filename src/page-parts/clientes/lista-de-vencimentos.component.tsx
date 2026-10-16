/**
 * lista-de-vencimentos.component.tsx — os vencimentos, PRIMEIRO CONTEÚDO da ficha.
 *
 * Fica abaixo do cabeçalho e ANTES das abas: é a pergunta que faz alguém abrir a ficha de
 * um cliente. As abas respondem "o que ele comprou"; esta lista responde "o que ele deve, e
 * quando".
 *
 * UMA LISTA, NÃO AGRUPADA POR VENDA, ordenada por vencimento crescente — ver o cabeçalho de
 * `vencimentos-da-ficha.ts` para a razão.
 *
 * A SOMA DO RODAPÉ É EM CENTAVOS INTEIROS, e não tem precedente no repositório: o único
 * `rowSelection` que existe (`vencidos-modal.component.tsx:180-183`) seleciona para agir em
 * lote e exibe o total do CONJUNTO, não dos selecionados. A forma da seleção vem dele; a
 * soma nasce aqui.
 *
 * NENHUM BOTÃO DE BAIXA NESTA ETAPA. A pergunta que a lista já responde é "quanto dá se ela
 * pagar as próximas três?", e hoje ninguém responde sem calculadora.
 */

import React from 'react'
import { Button, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'

import { formatBRL } from '@/utils/formatters'
import { diaBR } from '@/utils/dia-de-hoje'
import {
    contarSelecionadas,
    somarSelecionadas,
    type LinhaDeVencimento,
    type VencimentosDaFicha,
} from '@/utils/vencimentos-da-ficha'

export const TITULO_DOS_VENCIMENTOS = 'Vencimentos'
export const TITULO_SEM_VENCIMENTO_LISTA = 'Sem vencimento'
export const VAZIO_DOS_VENCIMENTOS = 'Nenhuma parcela lançada para este cliente.'
export const ROTULO_DO_TOTAL_SELECIONADO = 'Selecionado'

const TRAVESSAO = '—'

/** O selo de cada estado. A vencida diz os dias; a paga diz o dia. */
const SELO: Record<LinhaDeVencimento['estado'], { cor: string; rotulo: string }> = {
    PAGA: { cor: 'green', rotulo: 'Paga' },
    VENCIDA: { cor: 'red', rotulo: 'Vencida' },
    A_VENCER: { cor: 'orange', rotulo: 'Em aberto' },
    SEM_VENCIMENTO: { cor: 'default', rotulo: 'Sem vencimento' },
}

function textoDoSelo(l: LinhaDeVencimento): string {
    if (l.estado === 'VENCIDA' && l.diasDeAtraso !== null) {
        return l.diasDeAtraso === 1 ? 'Vencida há 1 dia' : `Vencida há ${l.diasDeAtraso} dias`
    }
    if (l.estado === 'PAGA' && l.pagaEm !== null) return `Paga em ${diaBR(l.pagaEm)}`
    return SELO[l.estado].rotulo
}

export interface ListaDeVencimentosProps {
    vencimentos: VencimentosDaFicha
    selecionados: string[]
    aoSelecionar: (ids: string[]) => void
    /** Abre a tela da parcela, em `?parcela=<id>`. */
    aoAbrirParcela: (id: string) => void
}

export function ListaDeVencimentos({ vencimentos, selecionados, aoSelecionar, aoAbrirParcela }: ListaDeVencimentosProps) {
    const todas = [...vencimentos.datadas, ...vencimentos.semVencimento]
    const total = somarSelecionadas(todas, selecionados)
    const quantas = contarSelecionadas(todas, selecionados)

    const colunas: ColumnsType<LinhaDeVencimento> = [
        {
            title: 'Vencimento',
            key: 'vencimento',
            width: 130,
            render: (_, l) => diaBR(l.vencimento),
        },
        {
            title: 'Venda',
            key: 'venda',
            width: 130,
            // O UUID NUNCA aparece: ninguém dita um uuid por telefone. Sem código, travessão
            // e sem link — link que leva a lugar nenhum é pior que nenhum link.
            render: (_, l) => (l.codigoDaVenda === null
                ? <span style={{ color: 'var(--color-neutral-400)' }}>{TRAVESSAO}</span>
                : <span style={{ fontFamily: 'monospace' }}>{l.codigoDaVenda}</span>),
        },
        {
            title: 'Parcela',
            key: 'parcela',
            width: 100,
            render: (_, l) => `${l.numero} de ${l.de}`,
        },
        {
            title: 'Valor',
            key: 'valor',
            align: 'right',
            width: 130,
            render: (_, l) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatBRL(l.valor)}</span>,
        },
        {
            title: 'Situação',
            key: 'situacao',
            width: 180,
            render: (_, l) => <Tag color={SELO[l.estado].cor}>{textoDoSelo(l)}</Tag>,
        },
        {
            title: '',
            key: 'abrir',
            width: 90,
            render: (_, l) => (
                <Button type="link" size="small" onClick={() => aoAbrirParcela(l.id)}>Abrir</Button>
            ),
        },
    ]

    const tabela = (dados: LinhaDeVencimento[], chave: string) => (
        <Table
            key={chave}
            rowKey="id"
            size="small"
            pagination={false}
            columns={colunas}
            dataSource={dados}
            locale={{ emptyText: VAZIO_DOS_VENCIMENTOS }}
            rowSelection={{
                selectedRowKeys: selecionados,
                onChange: (k) => aoSelecionar(k as string[]),
                // Parcela PAGA não é selecionável: não há o que somar para cobrar. A trava
                // está TAMBÉM em `somarSelecionadas` — uma seleção herdada de um render
                // anterior não pode somar o que acabou de ser pago.
                getCheckboxProps: (l) => ({ disabled: !l.selecionavel }),
            }}
        />
    )

    return (
        <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{TITULO_DOS_VENCIMENTOS}</div>
            {tabela(vencimentos.datadas, 'datadas')}

            {/* O bloco sem vencimento só existe quando há linha — `due_date` é nulo em 0 de
                1.659 hoje, e um bloco permanentemente vazio treina o olho a ignorá-lo. */}
            {vencimentos.semVencimento.length > 0 && (
                <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{TITULO_SEM_VENCIMENTO_LISTA}</div>
                    {tabela(vencimentos.semVencimento, 'sem-vencimento')}
                </div>
            )}

            {/* O rodapé só aparece com algo selecionado: um "R$ 0,00 selecionado" permanente
                não responde pergunta nenhuma. */}
            {quantas > 0 && (
                <div
                    data-testid="rodape-da-soma"
                    style={{
                        marginTop: 8, padding: '8px 12px', borderRadius: 8,
                        background: 'rgba(46,144,250,0.10)', display: 'flex', gap: 12, alignItems: 'center',
                    }}
                >
                    <span style={{ color: 'var(--color-neutral-400)', fontSize: 12 }}>
                        {quantas === 1 ? '1 parcela selecionada' : `${quantas} parcelas selecionadas`}
                    </span>
                    <span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                        {ROTULO_DO_TOTAL_SELECIONADO}: {formatBRL(total)}
                    </span>
                </div>
            )}
        </div>
    )
}
