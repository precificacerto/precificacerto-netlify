// TODO(EPIC-RR-DISPLAY+1): cobrir branches JSX (hidesProfitTaxes / requiresReview /
// rodapé condicional) com testes de render quando @testing-library/react 19 +
// peer @testing-library/dom estiverem estáveis no projeto. Hoje a lógica de
// formatação é coberta indiretamente via formatResidualLine (S1, 14 testes).
//
/**
 * ResidualDistributionBlock — Componente compartilhado (S2 do EPIC-RR-DISPLAY).
 *
 * Renderiza a "Distribuição do resultado" semanticamente correta conforme
 * spec consolidada PDF GPT + DOCX Claude (20/05/2026):
 *
 *   "X,XXX% original → Y,YYY% sobre o total c/ desconto"
 *
 * Quando NÃO há desconto: exibe apenas o % original (sem seta).
 * Quando regime MEI/SIMPLES_NACIONAL: cartões IRPJ/CSLL ficam ocultos.
 *
 * Usado por orçamento, pedido e venda (replicado sem variação visual).
 */

import React from 'react'

import { formatBRL } from '@/utils/formatters'
import {
  formatResidualLine,
  type ResidualDistribution,
  type ResidualLine,
} from '@/utils/residual-distribution'

interface CardConfig {
  label: string
  bgColor: string
  valueColor: string
  line: ResidualLine
}

function DistributionCard({ label, bgColor, valueColor, line, hasDiscount }: CardConfig & { hasDiscount: boolean }) {
  return (
    <div style={{ padding: '8px 12px', background: bgColor, borderRadius: 6 }}>
      <div style={{ fontSize: 11, color: '#94a3b8' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: valueColor }}>{formatBRL(line.amount)}</div>
      <div style={{ fontSize: 11, color: '#64748b' }}>{formatResidualLine(line, hasDiscount)}</div>
    </div>
  )
}

export interface ResidualDistributionBlockProps {
  /** Output do hook `useResidualDistribution` ou da função pura `computeResidualDistribution`. */
  distribution: ResidualDistribution
  /** Quando true, esconde o rodapé italico explicativo (usar em layouts compactos). */
  hideFooterNote?: boolean
  /** Espaçamento superior (default: 8). */
  marginTop?: number
  /**
   * Sprint S9 — Aviso de configuração incompleta. Quando preenchido, renderiza
   * banner amarelo no topo do bloco alertando que a apuração do residual pode
   * estar degradada (ex: produto sem custo, tenant sem despesas operacionais).
   *
   * Exemplos:
   *   "Configure custos dos produtos para apuração precisa do residual."
   *   "Configure despesas operacionais em Configurações → Estrutura."
   */
  configWarning?: string | null
  /**
   * Story MRM-V5-005 AC4 — banner de guard MEI/SN.
   *
   * Quando regime ∈ {MEI, SIMPLES_NACIONAL} E (csll_pct > 0 OU irpj_pct > 0)
   * configurados em tenant_settings, exibir banner inline.
   *
   * Exemplo: { regime: 'MEI', attempted_csll: 0.0207, attempted_irpj: 0.0345 }
   *
   * Quando null/undefined, banner não aparece. Caller (page que monta o bloco)
   * é responsável por compor o objeto baseado em tenant_settings.
   */
  regimeGuardActive?: {
    regime: 'MEI' | 'SIMPLES_NACIONAL'
    attempted_csll: number
    attempted_irpj: number
  } | null
}

/**
 * Bloco compacto da distribuição residual. Não recebe `tax_breakdown` cru —
 * sempre recebe a `ResidualDistribution` já agregada (separação de
 * responsabilidades: cálculo vs renderização).
 */
export function ResidualDistributionBlock({
  distribution,
  hideFooterNote = false,
  marginTop = 8,
  configWarning = null,
  regimeGuardActive = null,
}: ResidualDistributionBlockProps) {
  const { commission, profit, irpj, csll, hasDiscount, hidesProfitTaxes, requiresReview } = distribution

  const cards: CardConfig[] = [
    { label: 'Comissão do Vendedor', bgColor: 'rgba(99,102,241,0.12)', valueColor: '#818cf8', line: commission },
    { label: 'Lucro da Empresa', bgColor: 'rgba(16,185,129,0.12)', valueColor: '#34d399', line: profit },
  ]

  if (!hidesProfitTaxes) {
    cards.push(
      { label: 'IRPJ', bgColor: 'rgba(251,146,60,0.12)', valueColor: '#fb923c', line: irpj },
      { label: 'CSLL', bgColor: 'rgba(251,146,60,0.12)', valueColor: '#fb923c', line: csll },
    )
  }

  return (
    <div
      style={{
        marginTop,
        padding: '12px 16px',
        background: 'rgba(99, 102, 241, 0.08)',
        border: '1px solid rgba(99, 102, 241, 0.25)',
        borderRadius: 8,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: '#a5b4fc', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Distribuição do resultado</span>
        {requiresReview && (
          <span style={{ fontSize: 10, fontWeight: 500, color: '#facc15', background: 'rgba(234,179,8,0.15)', padding: '2px 8px', borderRadius: 4 }}>
            Atualizando para nova versão do motor
          </span>
        )}
      </div>
      {configWarning && (
        <div style={{
          fontSize: 11,
          color: '#fde68a',
          background: 'rgba(234,179,8,0.10)',
          border: '1px solid rgba(234,179,8,0.35)',
          padding: '8px 12px',
          borderRadius: 6,
          marginBottom: 8,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
        }}>
          <span style={{ fontSize: 13 }}>⚠</span>
          <span>{configWarning}</span>
        </div>
      )}
      {/* Story MRM-V5-005 AC4+AC6 — Banner guard MEI/SN (role="alert" para a11y) */}
      {regimeGuardActive && (regimeGuardActive.attempted_csll > 0 || regimeGuardActive.attempted_irpj > 0) && (
        <div
          role="alert"
          style={{
            fontSize: 11,
            color: '#fde68a',
            background: 'rgba(234,179,8,0.10)',
            border: '1px solid rgba(234,179,8,0.35)',
            padding: '8px 12px',
            borderRadius: 6,
            marginBottom: 8,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 13 }}>⚠</span>
          <span>
            <strong>Guard ativo:</strong> regime{' '}
            {regimeGuardActive.regime === 'MEI' ? 'MEI' : 'Simples Nacional'} não rateia CSLL/IRPJ.
            Valores configurados (
            CSLL {(regimeGuardActive.attempted_csll * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%
            {' / '}
            IRPJ {(regimeGuardActive.attempted_irpj * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%
            ) foram forçados a 0 no cálculo. DAS absorve esses tributos no regime cumulativo.
          </span>
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
        {cards.map((card) => (
          <DistributionCard key={card.label} {...card} hasDiscount={hasDiscount} />
        ))}
      </div>
      {!hideFooterNote && !hidesProfitTaxes && hasDiscount && (
        <div style={{ fontSize: 11, color: '#64748b', marginTop: 8, fontStyle: 'italic' }}>
          Percentuais calculados sobre o total da venda pós-desconto. Custos, despesas e impostos por dentro são preservados; comissão, lucro, IRPJ e CSLL são proporcionalmente redistribuídos sobre o Resultado Residual Operacional.
        </div>
      )}
    </div>
  )
}
