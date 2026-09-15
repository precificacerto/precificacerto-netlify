/**
 * decomposition-table.component.tsx — a DECOMPOSIÇÃO, com uma coluna por produto.
 *
 * Requisitos de tela: relatório "Motor RRO — Lucro Real", seção 6.4. Regra:
 * `.claude/rules/cascata-lucro-real.md` R15 a R20.
 *
 * As colunas, na ordem que a 6.4 fixa:
 *   Demonstrativo   — a linha do DRE, CONGELADA À ESQUERDA
 *   Base de cálculo — o valor sobre o qual o percentual incide
 *   Percentual      — alíquota ou peso; com produtos heterogêneos, rotulado "% médio"
 *   Produto 1 … N   — o valor da linha naquele produto; scroll horizontal
 *   Total           — soma das colunas de produto (R16)
 *   AV %            — análise vertical sobre a receita após descontos
 *
 * >>> NENHUM TEXTO OU VALOR TRUNCADO, EM NENHUMA COLUNA, EM NENHUM BREAKPOINT <<<
 * É requisito literal da 6.4, e é o motivo de não haver `text-overflow: ellipsis` nem largura
 * fixa em célula de valor aqui: a coluna do Demonstrativo fica grudada à esquerda e as de
 * produto rolam, em vez de espremerem o número até ele mentir.
 */

import React from 'react'

import { analiseVertical, type DecompositionResult, type DecompositionRow } from '@/utils/decomposition-dre'

/** Formato brasileiro obrigatório (6.4): `R$ 1.234,56`. */
function brl(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(v)
}

/** Formato brasileiro obrigatório (6.4): `12,34%`. `null` vira travessão, nunca `0,00%`. */
function pct(v: number | null | undefined, casas = 2): string {
  if (v == null || !Number.isFinite(v)) return '—'
  return `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: 4 })}%`
}

/** Tolerância do residual em R$. Acima disso a linha vira alerta (6.4). */
const RESIDUAL_TOLERANCE = 0.01

interface Props {
  decomposition: DecompositionResult
  /** Rótulo de cada coluna de produto, paralelo a `perItem`. */
  itemLabels: string[]
  marginTop?: number
}

export function DecompositionTable({ decomposition, itemLabels, marginTop = 16 }: Props) {
  const { rows, residual, receitaAposDesconto } = decomposition

  if (rows.length === 0) return null

  const residualForaDeZero = Math.abs(residual.total) > RESIDUAL_TOLERANCE

  const cell = (align: 'left' | 'right'): React.CSSProperties => ({
    padding: '6px 10px',
    textAlign: align,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
    borderBottom: '1px solid rgba(148, 163, 184, 0.12)',
  })

  /** A coluna do Demonstrativo é a única grudada: é o eixo de leitura da tabela. */
  const stickyCell = (row?: DecompositionRow): React.CSSProperties => ({
    ...cell('left'),
    position: 'sticky',
    left: 0,
    zIndex: 1,
    background: '#0f172a',
    fontWeight: row?.isSubtotal ? 700 : 400,
    color: row?.isSubtotal ? '#f1f5f9' : '#cbd5e1',
  })

  return (
    <div style={{ marginTop }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', marginBottom: 8 }}>
        Decomposição — DRE da venda
      </div>

      <div style={{ overflowX: 'auto', border: '1px solid rgba(148, 163, 184, 0.18)', borderRadius: 8 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12, minWidth: 720 }}>
          <thead>
            <tr style={{ background: 'rgba(148, 163, 184, 0.08)', color: '#94a3b8' }}>
              <th style={{ ...stickyCell(), background: '#111d33', fontWeight: 700 }}>Demonstrativo</th>
              <th style={{ ...cell('right'), fontWeight: 700 }}>Base de cálculo</th>
              <th style={{ ...cell('right'), fontWeight: 700 }}>Percentual</th>
              {itemLabels.map((l, i) => (
                <th key={i} style={{ ...cell('right'), fontWeight: 700 }}>{l}</th>
              ))}
              <th style={{ ...cell('right'), fontWeight: 700 }}>Total</th>
              <th style={{ ...cell('right'), fontWeight: 700 }}>AV %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isResidual = row.key === 'residual'
              const alerta = isResidual && residualForaDeZero
              return (
                <tr key={row.key} style={alerta ? { background: 'rgba(239, 68, 68, 0.12)' } : undefined}>
                  <td style={stickyCell(row)}>
                    {row.label}
                    {/* 6.4 — com produtos heterogêneos o percentual do total é média ponderada
                        DERIVADA, e precisa dizer isso. Um número derivado exibido como se
                        fosse alíquota cadastrada é um percentual que a construção nunca usou. */}
                    {row.isDerivedAverage && (
                      <span style={{ color: '#fbbf24', fontSize: 10, marginLeft: 6 }}>% médio</span>
                    )}
                  </td>
                  <td style={{ ...cell('right'), color: '#94a3b8' }}>{row.base != null ? brl(row.base) : '—'}</td>
                  <td style={{ ...cell('right'), color: row.isDerivedAverage ? '#fbbf24' : '#94a3b8' }}>
                    {pct(row.pct)}
                  </td>
                  {row.perItem.map((v, i) => (
                    <td key={i} style={{ ...cell('right'), color: v < 0 ? '#fca5a5' : '#cbd5e1' }}>
                      {row.perItem.length > 0 && (row.key === 'desconto' || row.key === 'repasse_manuais' || row.key === 'receita_apos_desconto')
                        ? '—'
                        : brl(v)}
                    </td>
                  ))}
                  <td style={{
                    ...cell('right'),
                    fontWeight: row.isSubtotal ? 700 : 500,
                    color: alerta ? '#fca5a5' : row.total < 0 ? '#fca5a5' : row.isSubtotal ? '#f1f5f9' : '#cbd5e1',
                  }}>
                    {brl(row.total)}
                  </td>
                  <td style={{ ...cell('right'), color: '#64748b' }}>
                    {pct(analiseVertical(row.total, receitaAposDesconto))}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {alertaResidual(residualForaDeZero, residual.total)}
    </div>
  )
}

/**
 * 6.4 — "Última linha: RESIDUAL, deve exibir R$ 0,00. Diferente de zero → alerta."
 *
 * O alerta é EXPLÍCITO e não silencioso: um residual diferente de zero significa que a
 * distribuição do RRO não fechou, e a tela que o exibisse em cinza ao lado dos outros
 * números seria a `portao-que-nao-alcanca` em forma de interface.
 */
function alertaResidual(foraDeZero: boolean, valor: number) {
  if (!foraDeZero) return null
  return (
    <div style={{
      marginTop: 8, padding: '8px 12px', borderRadius: 6,
      background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)',
      color: '#fca5a5', fontSize: 12,
    }}>
      ⚠ O residual da decomposição é {brl(valor)}, e deveria ser R$ 0,00. A distribuição do
      RRO não fechou — os números desta decomposição não podem ser usados até isso ser apurado.
    </div>
  )
}
