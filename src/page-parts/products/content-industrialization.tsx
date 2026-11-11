import { ChangeEvent, FC, ReactNode } from 'react'
import { Button, Card, Form, FormInstance, Input, Table } from 'antd'
import { Select } from '@/components/ui/app-select.component'
import { IItemModel } from '@/server/model/item'
import { IItemProductModel } from '@/server/model/item-product-item'
import { ColumnsType } from 'antd/es/table'
import { getMonetaryValue } from '@/utils/get-monetary-value'
import { CalcBaseType } from '@/types/calc-base.type'
import { ProductPrice, AdvancedTaxParams, type PrecoEmitido } from './product-price.component'
import { LoggedUser } from '@/types/logged-user.type'
import { ProductPriceInfoType } from './content.component'
import { useDevice } from '@/contexts/device.context'

/**
 * No modo orçamento a linha da mão de obra é SÓ o tempo total de produção da obra, em minutos, SEM valor (dono do produto, 11/11/2026): "o
 * valor já aparece em cada item". O custo da fabricação continua gravado por item (`custo_fabricacao`); isto é só apresentação.
 */
export const ROTULO_DO_TEMPO_DA_OBRA = 'Tempo total de produção da obra'

interface ContentIndustrializationProps {
  itemsForm: FormInstance
  productForm: FormInstance
  handleClickAddItem: (value: { item: string }) => void
  filterOption: (input: string, option: { children: string }) => boolean
  items: IItemModel[]
  columns: ColumnsType<IItemProductModel>
  productItemsData: IItemProductModel[]
  handleChangePrecificationInputs: (event: ChangeEvent<HTMLInputElement>) => void
  productPriceInfo: ProductPriceInfoType
  doProductCalc: () => void
  calcBase: CalcBaseType
  currentUser: LoggedUser
  customTaxPercent?: number | null
  onCustomTaxPercentChange?: (value: number) => void
  additionalIrpjPercent?: number
  onAdditionalIrpjChange?: (value: number) => void
  icmsPct?: number
  onIcmsPctChange?: (value: number) => void
  pisCofinsLRPct?: number
  onPisCofinsLRPctChange?: (value: number) => void
  freightValue?: number
  insuranceValue?: number
  accessoryExpensesValue?: number
  ibsPct?: number | null
  onIbsPctChange?: (value: number) => void
  cbsPct?: number | null
  /** orçamento I.A.: os impostos são os da empresa, só leitura (11/11/2026) */
  impostosDaEmpresa?: boolean
  onCbsPctChange?: (value: number) => void
  ivaReductionIbsPct?: number | null
  ivaReductionCbsPct?: number | null
  isPct?: number
  onIsPctChange?: (value: number) => void
  ipiPct?: number
  onIpiPctChange?: (value: number) => void
  /* R3 — código de base por tributo por fora. `null` = não classificado (padrão da R3). */
  ibsBaseCode?: number | null
  cbsBaseCode?: number | null
  isBaseCode?: number | null
  ipiBaseCode?: number | null
  onFinalPriceWithTaxesChange?: (data: PrecoEmitido) => void
  /** Só no modo "orçamento": o preço deixou de se formar. Ver `ProductPrice`. */
  onPrecoNaoFormado?: () => void
  advancedTaxesSection?: ReactNode
  /**
   * Alerta de carga horária não configurada. Quando presente, SUBSTITUI o card de
   * resultado (`ProductPrice`): sem carga horária o custo por minuto da mão de obra
   * produtiva não existe, então não há preço a exibir — só o caminho para resolver.
   */
  workloadAlert?: ReactNode
  advancedTaxParams?: AdvancedTaxParams
  /** Frente 2: lista compacta dos itens renderizada SÓ no mobile (≤639). */
  mobileItemsList?: ReactNode
  /**
   * O modo "orçamento" (o 1b): os itens são as esquadrias do orçamento calculado e os minutos são os da fabricação delas — só leitura. Sem
   * o campo de incluir item e com os minutos travados; mudar é no orçamento, e recalcular.
   */
  somenteLeitura?: boolean
}
export const ContentIndustrialization: FC<ContentIndustrializationProps> = ({
  itemsForm,
  productForm,
  handleClickAddItem,
  filterOption,
  items,
  columns,
  productItemsData,
  handleChangePrecificationInputs,
  productPriceInfo,
  doProductCalc,
  calcBase,
  currentUser,
  customTaxPercent,
  onCustomTaxPercentChange,
  additionalIrpjPercent,
  onAdditionalIrpjChange,
  icmsPct,
  onIcmsPctChange,
  pisCofinsLRPct,
  onPisCofinsLRPctChange,
  freightValue,
  insuranceValue,
  accessoryExpensesValue,
  ibsPct,
  onIbsPctChange,
  cbsPct,
  impostosDaEmpresa,
  onCbsPctChange,
  ivaReductionIbsPct,
  ivaReductionCbsPct,
  isPct,
  onIsPctChange,
  ipiPct,
  onIpiPctChange,
  ibsBaseCode,
  cbsBaseCode,
  isBaseCode,
  ipiBaseCode,
  onFinalPriceWithTaxesChange,
  onPrecoNaoFormado,
  advancedTaxesSection,
  workloadAlert,
  advancedTaxParams,
  mobileItemsList,
  somenteLeitura = false,
}: ContentIndustrializationProps) => {
  const { isMobile } = useDevice()
  return (
    <>
      <Card size="small" className="mt-5 mb-5">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl">{somenteLeitura ? 'Itens do orçamento' : 'Itens do produto'}</h1>
        </div>

        {!somenteLeitura && (
        <div className="flex flex-col column mb-5">
          {/* Relatório 30/07 (mobile #2): campo "Buscar item" e botão "Incluir" alinhados.
              Mobile (≤639) empilha em coluna (Select 100% + botão 100% maior, mesma largura).
              Desktop mantém inline (Select flex:1 + botão à direita). */}
          <Form
            form={itemsForm}
            layout={isMobile ? 'vertical' : 'inline'}
            className="ps-additem-form"
            style={{ display: 'flex', gap: 8, alignItems: isMobile ? 'stretch' : 'flex-end', width: '100%', flexDirection: isMobile ? 'column' : 'row' }}
            onFinish={handleClickAddItem}
          >
            <Form.Item
              style={{ flex: 1, marginBottom: 0, width: isMobile ? '100%' : undefined }}
              label="Buscar item"
              name="item"
              rules={[{ required: true }]}
            >
              <Select
                showSearch
                filterOption={filterOption}
                notFoundContent={
                  <div className="p-3 text-center text-neutral-500">
                    Não há itens, cadastre-os antes de criar um produto
                  </div>
                }
              >
                {items.map(({ id, name }) => (
                  <Select.Option key={id} value={id}>
                    {name}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>

            <Button
              htmlType="submit"
              type="primary"
              className={isMobile ? '' : 'ml-2'}
              block={isMobile}
              size={isMobile ? 'large' : 'middle'}
            >
              Incluir
            </Button>
          </Form>
        </div>
        )}
        {isMobile && mobileItemsList ? (
          mobileItemsList
        ) : (
          <Table pagination={false} columns={columns} dataSource={productItemsData} scroll={{ x: 'max-content' }} />
        )}
        {/* Relatório 30/07 (item 4 desktop): a linha "Mão de obra produtiva" ALINHA com as colunas
            da tabela "Itens do produto" — minutos sob "QTD. POR UNIDADE", valor sob "LÍQUIDO".
            Relatório 30/07 (mobile #2): no celular a linha vira 2 colunas na MESMA linha —
            minutos à ESQUERDA, valor em R$ à DIREITA — abaixo do rótulo. */}
        {isMobile ? (
          <section className="p-1 mt-3">
            <div style={{ fontWeight: 500, marginBottom: 6 }}>{somenteLeitura ? ROTULO_DO_TEMPO_DA_OBRA : 'Mão de obra produtiva'}</div>
            {/* Relatório mobile #3: o campo de MINUTOS ocupa no MÁXIMO 50% da largura; o valor
                (R$) ocupa os outros 50%, alinhado à borda DIREITA (padrão de valores do sistema). */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: '0 0 50%', maxWidth: '50%', minWidth: 0 }}>
                <Input
                  name="productWorkloadInMinutes"
                  placeholder="Inserir manualmente"
                  autoComplete="off"
                  suffix="Minuto(s)"
                  style={{ width: '100%' }}
                  type="number"
                  min={1}
                  minLength={1}
                  onChange={handleChangePrecificationInputs}
                  value={productPriceInfo.productWorkloadInMinutes}
                  readOnly={somenteLeitura}
                />
              </div>
              {!somenteLeitura && (
                <div style={{ flex: '1 1 50%', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600 }} data-valor-da-mao-de-obra="">
                  R$ {getMonetaryValue(productPriceInfo.productWorkloadInMinutesPrice)}
                </div>
              )}
            </div>
          </section>
        ) : (
          <section className="flex items-center p-1 mt-3 ps-row-flex">
            {/* Coluna Nome (22%) — rótulo */}
            <div className="p-2" style={{ width: '22%', fontWeight: 500 }}>{somenteLeitura ? ROTULO_DO_TEMPO_DA_OBRA : 'Mão de obra produtiva'}</div>
            {/* Coluna Qtd. por unidade (16%) — campo de minutos */}
            <div style={{ width: '16%', padding: '0 4px' }}>
              <Input
                name="productWorkloadInMinutes"
                placeholder="Inserir manualmente"
                autoComplete="off"
                suffix="Minuto(s)"
                style={{ width: '100%' }}
                type="number"
                min={1}
                minLength={1}
                onChange={handleChangePrecificationInputs}
                value={productPriceInfo.productWorkloadInMinutes}
                readOnly={somenteLeitura}
              />
            </div>
            {/* Colunas Qtd. Total (14%) + Bruto (12%) — espaçadores para manter o alinhamento */}
            <div style={{ width: '26%' }} />
            {/* Coluna Líquido (12%) — valor em R$ */}
            <div style={{ width: '12%', textAlign: 'left', whiteSpace: 'nowrap', fontWeight: 600 }} data-valor-da-mao-de-obra="">
              {!somenteLeitura && <>R$ {getMonetaryValue(productPriceInfo.productWorkloadInMinutesPrice)}</>}
            </div>
            {/* Coluna Ações (resto) — espaçador */}
            <div style={{ flex: 1 }} />
          </section>
        )}
      </Card>

      {workloadAlert ?? (
      <ProductPrice
        calcBase={calcBase}
        productPriceInfo={productPriceInfo}
        handleChangePrecificationInputs={handleChangePrecificationInputs}
        currentUser={currentUser}
        productForm={productForm}
        customTaxPercent={customTaxPercent}
        onCustomTaxPercentChange={onCustomTaxPercentChange}
        additionalIrpjPercent={additionalIrpjPercent}
        onAdditionalIrpjChange={onAdditionalIrpjChange}
        icmsPct={icmsPct}
        onIcmsPctChange={onIcmsPctChange}
        pisCofinsLRPct={pisCofinsLRPct}
        onPisCofinsLRPctChange={onPisCofinsLRPctChange}
        freightValue={freightValue}
        insuranceValue={insuranceValue}
        accessoryExpensesValue={accessoryExpensesValue}
        ibsPct={ibsPct}
        onIbsPctChange={onIbsPctChange}
        cbsPct={cbsPct}
        impostosDaEmpresa={impostosDaEmpresa}
        ivaReductionIbsPct={ivaReductionIbsPct}
        ivaReductionCbsPct={ivaReductionCbsPct}
        onCbsPctChange={onCbsPctChange}
        isPct={isPct}
        onIsPctChange={onIsPctChange}
        ipiPct={ipiPct}
        onIpiPctChange={onIpiPctChange}
        ibsBaseCode={ibsBaseCode}
        cbsBaseCode={cbsBaseCode}
        isBaseCode={isBaseCode}
        ipiBaseCode={ipiBaseCode}
        onFinalPriceWithTaxesChange={onFinalPriceWithTaxesChange}
        onPrecoNaoFormado={onPrecoNaoFormado}
        advancedTaxesSection={advancedTaxesSection}
        advancedTaxParams={advancedTaxParams}
        /* ITEM 1.5: produto PRODUZIDO (receita) — fraciona o preço de venda pela Quantidade
           de produção. Só nesta tela (industrialização); a revenda não fraciona. */
        fractionByYield
      />
      )}
    </>
  )
}
