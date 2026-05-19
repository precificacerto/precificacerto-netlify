/**
 * RequiresReviewBadge — Tag vermelha persistente exibida em listings de
 * budgets/orders/sales quando `requires_review = true` (Story MRM-V2-S2.3).
 *
 * Visual leve, sem ações — apenas sinaliza para o usuário que o documento
 * caiu na regra de RRO ≤ 0 e precisa de revisão antes de prosseguir.
 */
import React from 'react'
import { Tag, Tooltip } from 'antd'
import { WarningOutlined } from '@ant-design/icons'

export interface RequiresReviewBadgeProps {
  /** Texto opcional. Default: "Requer revisão". */
  label?: string
  /** Tooltip extra explicando a causa. Default: mensagem padrão da policy. */
  tooltip?: string
}

const DEFAULT_TOOLTIP =
  'Margem residual zero ou negativa apurada pelo MRM. Revise antes de aprovar.'

export function RequiresReviewBadge({
  label = 'Requer revisão',
  tooltip = DEFAULT_TOOLTIP,
}: RequiresReviewBadgeProps) {
  return (
    <Tooltip title={tooltip}>
      <Tag color="red" icon={<WarningOutlined />} style={{ marginLeft: 6, fontWeight: 600 }}>
        {label}
      </Tag>
    </Tooltip>
  )
}

export default RequiresReviewBadge
