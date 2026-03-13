import React, { ReactNode } from 'react'
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons'

type CardVariant = 'green' | 'blue' | 'orange' | 'red'

interface CardKPIProps {
    title: string
    value: string | number
    icon: ReactNode
    variant?: CardVariant
    trend?: {
        value: number
        label?: string
    }
    onClick?: () => void
}

const CardKPI = ({ title, value, icon, variant = 'green', trend, onClick }: CardKPIProps) => {
    const isPositiveTrend = trend && trend.value >= 0

    return (
        <div
            className={`kpi-card variant-${variant}`}
            onClick={onClick}
            style={{ cursor: onClick ? 'pointer' : 'default' }}
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
        >
            {/* Header: icon + trend */}
            <div className="kpi-card-header">
                <div className={`kpi-card-icon ${variant}`}>
                    {icon}
                </div>
                {trend && (
                    <div className={`kpi-card-trend ${isPositiveTrend ? 'up' : 'down'}`}>
                        {isPositiveTrend ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                        <span>{Math.abs(trend.value)}%</span>
                    </div>
                )}
            </div>

            {/* Value */}
            <div className="kpi-card-value">{value}</div>

            {/* Label */}
            <div className="kpi-card-label">
                {title}
                {trend?.label && (
                    <span style={{
                        color: 'var(--color-neutral-400)',
                        marginLeft: 4,
                        fontSize: '12px'
                    }}>
                        {trend.label}
                    </span>
                )}
            </div>
        </div>
    )
}

export { CardKPI }
export type { CardKPIProps }
