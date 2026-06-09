import { FC, useState } from 'react'
import { Button, Drawer, Empty, Input, Popconfirm, Space } from 'antd'
import { MoreOutlined } from '@ant-design/icons'
import { Dropdown } from 'antd'
import { IItemProductModel } from '@/server/model/item-product-item'
import { getMonetaryValue } from '@/utils/get-monetary-value'
import { UNIT_TYPE } from '@/constants/item-unit-types'

/**
 * Frente 2 — lista compacta mobile dos "Itens do produto".
 * Substitui a <Table> de itens APENAS no mobile (≤639). Tablet/desktop continuam
 * com a Table original. Reusa exatamente os mesmos handlers (handleQuantityChange,
 * handleClickUpdateItemPrice, handleClickRemoveItem) das columns existentes —
 * nenhuma lógica de cálculo é recriada aqui.
 */

type MobileItem = IItemProductModel & {
  unitGross?: number
  unitNet?: number
  grossPerUnit?: number
  hasItemTaxes?: boolean
}

interface ProductItemsMobileListProps {
  items: IItemProductModel[]
  /** quantidade de rendimento do produto (productForm 'quantity'), usada na Qtd. Total */
  yieldQty: number
  isEditingMode: boolean
  handleQuantityChange: (id: string, value: string) => void
  handleClickUpdateItemPrice: (id: string) => void
  handleClickRemoveItem: (id: string) => void
}

const INT_UNITS = ['ML', 'L', 'G', 'KG', 'M', 'CM', 'MM', 'KM', 'M2', 'M3']

const getUnitLabel = (unitType: string | undefined) =>
  (UNIT_TYPE as Record<string, string>)[unitType?.toUpperCase() || ''] || unitType || 'Unidade'

export const ProductItemsMobileList: FC<ProductItemsMobileListProps> = ({
  items,
  yieldQty,
  isEditingMode,
  handleQuantityChange,
  handleClickUpdateItemPrice,
  handleClickRemoveItem,
}) => {
  const [openId, setOpenId] = useState<string | null>(null)

  const selected = (items as MobileItem[]).find((i) => i.id === openId) || null

  const renderQuantityInput = (record: MobileItem) => {
    const unit = (record.unitType || 'UN').toUpperCase()
    const isIntUnit = INT_UNITS.includes(unit)
    return (
      <Input
        key={record.id}
        value={record.quantity as unknown as number}
        type="number"
        step={isIntUnit ? '1' : '0.01'}
        min={isIntUnit ? '1' : '0.01'}
        onChange={(e) =>
          handleQuantityChange(
            record.id,
            isIntUnit ? String(Math.round(Number(e.target.value) || 0) || 1) : e.target.value,
          )
        }
        suffix={getUnitLabel(record.unitType)}
      />
    )
  }

  if (!items.length) {
    return <Empty description="Nenhum item adicionado" image={Empty.PRESENTED_IMAGE_SIMPLE} />
  }

  return (
    <>
      <div className="product-items-mobile-list">
        {(items as MobileItem[]).map((record) => {
          const menuItems = [
            { key: 'detail', label: 'Detalhes do item', onClick: () => setOpenId(record.id) },
            ...(isEditingMode
              ? [{ key: 'update', label: 'Atualizar valor item', onClick: () => handleClickUpdateItemPrice(record.id) }]
              : []),
            { key: 'del', label: 'Excluir', danger: true, onClick: () => handleClickRemoveItem(record.id) },
          ]
          return (
            <div key={record.id} className="pc-row-compact" onClick={() => setOpenId(record.id)}>
              <div className="pc-row-compact__main">
                <span className="pc-row-compact__title">{record.name}</span>
                <span className="pc-row-compact__sub">
                  {record.quantity} {getUnitLabel(record.unitType)}
                </span>
              </div>
              <span className="pc-row-compact__value">R$ {getMonetaryValue(record.price)}</span>
              <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
                <span className="pc-row-compact__kebab" onClick={(e) => e.stopPropagation()}>
                  <MoreOutlined />
                </span>
              </Dropdown>
            </div>
          )
        })}
      </div>

      <Drawer
        title="Detalhes do item"
        placement="bottom"
        height="auto"
        open={!!selected}
        onClose={() => setOpenId(null)}
      >
        {selected && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{selected.name}</div>
              {selected.unitGross != null && (
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                  Valor unitário (Bruto): <strong>R$ {getMonetaryValue(selected.unitGross)}</strong>
                  {selected.unitNet != null && (
                    <>
                      {' · '}Custo líquido:{' '}
                      <strong style={{ color: '#B42318' }}>R$ {getMonetaryValue(selected.unitNet)}</strong>
                    </>
                  )}
                </div>
              )}
            </div>

            <div>
              <label style={{ fontSize: 12, color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                Qtd. por unidade
              </label>
              {renderQuantityInput(selected)}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: '#94a3b8' }}>Qtd. Total</span>
              <span style={{ fontWeight: 500 }}>
                {(() => {
                  const total = (selected.quantity || 0) * yieldQty
                  return total % 1 === 0
                    ? total
                    : total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                })()}{' '}
                {getUnitLabel(selected.unitType)}
              </span>
            </div>

            {selected.hasItemTaxes && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#94a3b8' }}>Bruto</span>
                <span style={{ fontWeight: 500 }}>
                  R$ {getMonetaryValue((selected.grossPerUnit || 0) * (selected.quantity || 0))}
                </span>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span style={{ color: '#94a3b8' }}>Líquido</span>
              <span style={{ fontWeight: 600 }}>R$ {getMonetaryValue(selected.price)}</span>
            </div>

            <Space style={{ marginTop: 8 }}>
              {isEditingMode && (
                <Button type="primary" onClick={() => handleClickUpdateItemPrice(selected.id)}>
                  Atualizar valor item
                </Button>
              )}
              <Popconfirm
                title="Tem certeza?"
                onConfirm={() => {
                  handleClickRemoveItem(selected.id)
                  setOpenId(null)
                }}
              >
                <Button danger>Excluir</Button>
              </Popconfirm>
            </Space>
          </div>
        )}
      </Drawer>
    </>
  )
}
