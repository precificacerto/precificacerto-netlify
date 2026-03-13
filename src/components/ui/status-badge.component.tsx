import React from 'react'

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral'

interface StatusBadgeProps {
    label: string
    variant?: BadgeVariant
    showDot?: boolean
}

const variantLabels: Record<string, BadgeVariant> = {
    ativo: 'success',
    active: 'success',
    aprovado: 'success',
    approved: 'success',
    concluído: 'success',
    completed: 'success',
    pendente: 'warning',
    pending: 'warning',
    aguardando: 'warning',
    waiting: 'warning',
    inativo: 'error',
    inactive: 'error',
    cancelado: 'error',
    cancelled: 'error',
    rejeitado: 'error',
    rejected: 'error',
    rascunho: 'neutral',
    draft: 'neutral',
    info: 'info',
    novo: 'info',
    new: 'info',
}

/**
 * Auto-detect variant from label if not explicitly provided.
 */
function autoDetectVariant(label: string): BadgeVariant {
    const normalizedLabel = label.toLowerCase().trim()
    return variantLabels[normalizedLabel] || 'neutral'
}

const StatusBadge = ({ label, variant, showDot = true }: StatusBadgeProps) => {
    const resolvedVariant = variant || autoDetectVariant(label)

    return (
        <span className={`status-badge ${resolvedVariant}`}>
            {showDot && <span className="status-badge-dot" />}
            {label}
        </span>
    )
}

export { StatusBadge }
export type { StatusBadgeProps, BadgeVariant }
