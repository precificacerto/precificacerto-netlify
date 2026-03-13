import React, { ReactNode } from 'react'
import { Breadcrumb } from 'antd'
import Link from 'next/link'

interface BreadcrumbItem {
    label: string
    href?: string
}

interface PageHeaderProps {
    title: string
    subtitle?: string
    breadcrumbs?: BreadcrumbItem[]
    actions?: ReactNode
}

const PageHeader = ({ title, subtitle, breadcrumbs, actions }: PageHeaderProps) => {
    return (
        <div className="page-header" id="page-header">
            {/* Breadcrumbs */}
            {breadcrumbs && breadcrumbs.length > 0 && (
                <Breadcrumb
                    style={{ marginBottom: 8 }}
                    items={breadcrumbs.map((item) => ({
                        title: item.href ? (
                            <Link href={item.href} style={{ color: 'var(--color-primary-600)' }}>
                                {item.label}
                            </Link>
                        ) : (
                            <span style={{ color: 'var(--color-neutral-500)' }}>{item.label}</span>
                        ),
                    }))}
                />
            )}

            {/* Header Row */}
            <div className="page-header-row">
                <div>
                    <h1>{title}</h1>
                    {subtitle && <p className="page-header-subtitle">{subtitle}</p>}
                </div>
                {actions && <div className="page-header-actions">{actions}</div>}
            </div>
        </div>
    )
}

export { PageHeader }
export type { PageHeaderProps, BreadcrumbItem }
