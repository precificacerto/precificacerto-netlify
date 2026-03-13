import React, { ReactNode } from 'react'
import { Input, Button } from 'antd'
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons'

interface FilterBarProps {
    searchPlaceholder?: string
    searchValue?: string
    onSearchChange?: (value: string) => void
    onClearFilters?: () => void
    showClearButton?: boolean
    children?: ReactNode // additional filter elements (Select, DatePicker, etc.)
}

const FilterBar = ({
    searchPlaceholder = 'Buscar...',
    searchValue,
    onSearchChange,
    onClearFilters,
    showClearButton = false,
    children,
}: FilterBarProps) => {
    return (
        <div className="filter-bar" id="filter-bar">
            {/* Search Input */}
            <Input
                prefix={<SearchOutlined style={{ color: 'var(--color-neutral-400)' }} />}
                placeholder={searchPlaceholder}
                value={searchValue}
                onChange={(e) => onSearchChange?.(e.target.value)}
                style={{ maxWidth: 320, flex: '0 0 auto' }}
                allowClear
            />

            {/* Additional Filters */}
            {children}

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {/* Clear Filters */}
            {showClearButton && (
                <Button
                    icon={<ReloadOutlined />}
                    onClick={onClearFilters}
                    size="middle"
                >
                    Limpar
                </Button>
            )}
        </div>
    )
}

export { FilterBar }
export type { FilterBarProps }
