import React, { ReactNode } from 'react'
import { Table, Empty } from 'antd'
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table'
import { InboxOutlined } from '@ant-design/icons'

interface DataTableProps<T> {
    columns: ColumnsType<T>
    data: T[]
    loading?: boolean
    rowKey?: string | ((record: T) => string)
    pageSize?: number
    showPagination?: boolean
    emptyText?: string
    onRowClick?: (record: T) => void
    scroll?: { x?: number | string; y?: number | string }
    title?: ReactNode
    extra?: ReactNode
}

function DataTable<T extends object>({
    columns,
    data,
    loading = false,
    rowKey = 'id',
    pageSize = 10,
    showPagination = true,
    emptyText = 'Nenhum registro encontrado',
    onRowClick,
    scroll,
    title,
    extra,
}: DataTableProps<T>) {
    const pagination: TablePaginationConfig | false = showPagination
        ? {
            pageSize,
            showSizeChanger: true,
            pageSizeOptions: ['10', '25', '50', '100'],
            showTotal: (total, range) => `${range[0]}-${range[1]} de ${total} registros`,
            style: { marginRight: 16 },
        }
        : false

    return (
        <div className="pc-card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Table Header */}
            {(title || extra) && (
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '16px 24px',
                    borderBottom: '1px solid var(--color-neutral-100)',
                }}>
                    {title && (
                        <span style={{
                            fontSize: '16px',
                            fontWeight: 600,
                            color: 'var(--color-neutral-900)',
                        }}>
                            {title}
                        </span>
                    )}
                    {extra && <div>{extra}</div>}
                </div>
            )}

            <Table
                columns={columns}
                dataSource={data}
                loading={loading}
                rowKey={rowKey}
                pagination={pagination}
                scroll={scroll}
                locale={{
                    emptyText: (
                        <Empty
                            image={<InboxOutlined style={{ fontSize: 48, color: 'var(--color-neutral-300)' }} />}
                            description={
                                <span style={{ color: 'var(--color-neutral-400)' }}>{emptyText}</span>
                            }
                        />
                    ),
                }}
                onRow={onRowClick ? (record) => ({
                    onClick: () => onRowClick(record),
                    style: { cursor: 'pointer' },
                }) : undefined}
                style={{ borderRadius: 0 }}
            />
        </div>
    )
}

export { DataTable }
export type { DataTableProps }
