import React from 'react'
import { Card, Tooltip } from 'antd'

interface RestitutionSummaryProps {
  monthLabel: string
  pisCredit: number
  cofinsCredit: number
  icmsCredit: number
  totalRestitution: number
}

function formatCurrency(v: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v || 0)
}

export const RestitutionSummaryCard: React.FC<RestitutionSummaryProps> = ({
  monthLabel,
  pisCredit,
  cofinsCredit,
  icmsCredit,
  totalRestitution,
}) => {
  if (totalRestitution <= 0) return null

  return (
    <Card
      size="small"
      style={{ marginTop: 16, borderColor: 'rgba(56, 189, 248, 0.5)' }}
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Créditos fiscais estimados — {monthLabel}</span>
          <Tooltip title="Estimativa de créditos de PIS, COFINS e ICMS para ajudar na análise do Lucro Real. Consulte sempre seu contador para apuração oficial.">
            <span style={{ fontSize: 11, color: '#64748b' }}>Informativo</span>
          </Tooltip>
        </div>
      }
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>Créditos estimados este mês</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#0EA5E9' }}>
            {formatCurrency(totalRestitution)}
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12, color: '#94a3b8' }}>
          <div>PIS: <strong>{formatCurrency(pisCredit)}</strong></div>
          <div>COFINS: <strong>{formatCurrency(cofinsCredit)}</strong></div>
          <div>ICMS: <strong>{formatCurrency(icmsCredit)}</strong></div>
        </div>
      </div>
    </Card>
  )
}

