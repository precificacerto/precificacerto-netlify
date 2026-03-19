import React, { useEffect, useState } from 'react'
import { Form, Input, Modal, Select, message } from 'antd'
import { UNIT_MEASURE_ENUM } from '@/shared/enums/unit-measure-type'
import { CALC_TYPE_ENUM } from '@/shared/enums/calc-type'
import { useAuth } from '@/hooks/use-auth.hook'
import { LoggedUser } from '@/types/logged-user.type'
import { supabase } from '@/supabase/client'
import { getTenantId } from '@/utils/get-tenant-id'

interface ChooseCalcModalProps {
  open: boolean
  handleShowModal: (open: boolean) => void
}

const TEXT_ABOUT_CALC = {
  INDUSTRIALIZATION:
    'Industrialização: A industrialização é o processo de transformação \
    de matérias-primas em produtos acabados por meio de maquinaria e tecnologia avançada. \
    Exemplos de empresas nesse segmento incluem a Toyota, que fabrica carros, e a Nestlé, \
    que produz alimentos processados, restaurantes, panificadoras, fábricas de móveis e etc.',
  SERVICE:
    'Prestação de serviço: Empresas de prestação de serviços oferecem \
    uma variedade de serviços para atender às necessidades dos clientes. \
    Um exemplo notável é a Uber, que fornece serviços de transporte sob \
    demanda, e a Airbnb, que conecta pessoas que buscam acomodações \
    temporárias com anfitriões que têm quartos ou propriedades para alugar.',
  RESALE:
    'Revenda: Empresas de revenda compram produtos de fabricantes ou \
    atacadistas e os revendem aos consumidores finais. Grandes varejistas \
    como o Walmart e a Amazon são exemplos de empresas de revenda que \
    oferecem uma ampla gama de produtos, desde eletrônicos até produtos \
    de beleza, para os consumidores.',
}

const REGIME_TAXABLE_OPTIONS = {
  NATIONAL_SIMPLE: 'NATIONAL_SIMPLE',
  MEI: 'MEI',
}

type REGIME_TAXABLE_TYPES = 'NATIONAL_SIMPLE' | 'MEI'

const ChooseCalcModal = ({ open, handleShowModal }: ChooseCalcModalProps) => {
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [enableQuantityInput, setEnableQuantityInput] = useState(false)
  const [calcExplication, setCalcExplication] = useState('')
  const [taxableRegimeInput, setTaxableRegimeInput] = useState<REGIME_TAXABLE_TYPES>()

  const [form] = Form.useForm()
  const { currentUser, setCurrentUser } = useAuth()
  const [messageApi, contextHolder] = message.useMessage()

  const calcTypeValue = form.getFieldValue('calcType')

  const isIndustrialization = calcTypeValue === CALC_TYPE_ENUM.INDUSTRIALIZATION
  const isResale = calcTypeValue === CALC_TYPE_ENUM.RESALE
  const isService = calcTypeValue === CALC_TYPE_ENUM.SERVICE

  const canShowCancelButton = !currentUser?.calcType

  useEffect(() => {
    if (currentUser && open === true) {
      form.setFieldsValue({
        calcType: currentUser?.calcType,
        unitMeasure: currentUser?.unitMeasure,
        monthlyWorkloadInMinutes: currentUser?.monthlyWorkloadInMinutes,
        numProductiveSectorEmployee: currentUser?.numProductiveSectorEmployee,
        numComercialSectorEmployee: currentUser?.numComercialSectorEmployee,
        numAdministrativeSectorEmployee: currentUser?.numAdministrativeSectorEmployee,
        taxableRegime: currentUser?.taxableRegime,
        taxableRegimeValue: currentUser?.taxableRegimeValue,
      })

      setTaxableRegimeInput(currentUser?.taxableRegime as REGIME_TAXABLE_TYPES)
    }
  }, [currentUser, form, open])

  const handleOk = async () => {
    try {
      setConfirmLoading(true)

      await form.validateFields()

      const values = form.getFieldsValue()
      const updatedUser: LoggedUser = {
        ...currentUser,
        ...values,
        monthlyWorkloadInMinutes: Number(values.monthlyWorkloadInMinutes) || 0,
        numAdministrativeSectorEmployee: Number(values.numAdministrativeSectorEmployee),
        numComercialSectorEmployee: Number(values.numComercialSectorEmployee),
        numProductiveSectorEmployee: Number(values.numProductiveSectorEmployee),
        taxableRegimeValue: Number(values?.taxableRegimeValue),
        isActive: true,
      }

      if (isIndustrialization) {
        updatedUser.unitMeasure = UNIT_MEASURE_ENUM.HOURS
      }

      if (isResale) {
        updatedUser.unitMeasure = UNIT_MEASURE_ENUM.MINUTES
      }

      const tenantId = await getTenantId()
      if (!tenantId) throw new Error('Tenant não encontrado')

      // Map frontend enum → DB values (DB uses Portuguese names)
      const calcTypeToDb: Record<string, string> = {
        INDUSTRIALIZATION: 'INDUSTRIALIZACAO', SERVICE: 'SERVICO', RESALE: 'REVENDA',
        INDUSTRIALIZACAO: 'INDUSTRIALIZACAO', SERVICO: 'SERVICO', REVENDA: 'REVENDA',
      }
      const dbCalcType = calcTypeToDb[updatedUser.calcType as string] || updatedUser.calcType

      const { error: settingsError } = await supabase
        .from('tenant_settings')
        .update({
          calc_type: dbCalcType,
          workload_unit: updatedUser.unitMeasure,
          monthly_workload: updatedUser.monthlyWorkloadInMinutes,
          num_productive_employees: updatedUser.numProductiveSectorEmployee,
          num_commercial_employees: updatedUser.numComercialSectorEmployee,
          num_administrative_employees: updatedUser.numAdministrativeSectorEmployee,
        })
        .eq('tenant_id', tenantId)

      if (settingsError) throw settingsError

      const { error: expenseError } = await supabase
        .from('tenant_expense_config')
        .update({
          taxable_regime: updatedUser.taxableRegime,
          taxable_regime_percent: updatedUser.taxableRegimeValue,
        })
        .eq('tenant_id', tenantId)

      if (expenseError) throw expenseError

      setCurrentUser(updatedUser)
      handleShowModal(false)
    } catch (error: any) {
      messageApi.open({
        type: 'error',
        content:
          error?.message ||
          'Preencha todos os campos corretamente para atualizar as configurações.',
      })
    } finally {
      setConfirmLoading(false)
    }
  }

  const handleChangeUnitMeasure = () => {
    const isValid = form.isFieldValidating('unitMeasure')

    setEnableQuantityInput(isValid)
  }

  const handleChangeCalcType = (value: CALC_TYPE_ENUM) => {
    setCalcExplication(TEXT_ABOUT_CALC[value])
  }

  const handleChangeTaxableRegime = (value: REGIME_TAXABLE_TYPES) => {
    setTaxableRegimeInput(value)

    if (value === REGIME_TAXABLE_OPTIONS.MEI) {
      form.setFieldValue('taxableRegimeValue', 0)
    }
  }

  const handleCancel = () => {
    handleShowModal(false)
  }

  return (
    <Modal
      title="Defina o cálculo da aplicação"
      open={open}
      onOk={handleOk}
      okText="Salvar"
      confirmLoading={confirmLoading}
      onCancel={handleCancel}
      cancelButtonProps={{ disabled: canShowCancelButton, hidden: canShowCancelButton }}
      closable={false}
      maskClosable={false}
      keyboard={false}
      centered={true}
      className="m-5 min-w-[600px]"
    >
      {contextHolder}
      <iframe width="560" height="315" src="https://www.youtube.com/embed/b_yuP4aojEY?si=AkugMJ5HBdaB6G1-" title="YouTube video player" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerPolicy="strict-origin-when-cross-origin" allowFullScreen></iframe>
      <p className="text-justify pl-3 pr-3">
        Utilizaremos o cálculo a seguir para estabelecer os preços de todos os seus produtos,
        aplicando fórmulas específicas para cada modelo de negócio.
      </p>

      <Form layout="vertical" form={form}>
        <Form.Item
          className="w-[200px]"
          name="calcType"
          label="Segmentação"
          rules={[{ required: true }]}
        >
          <Select onChange={handleChangeCalcType}>
            <Select.Option value={CALC_TYPE_ENUM.INDUSTRIALIZATION}>Industrialização</Select.Option>
            <Select.Option value={CALC_TYPE_ENUM.SERVICE}>Prestação de Serviço</Select.Option>
            <Select.Option value={CALC_TYPE_ENUM.RESALE}>Revenda</Select.Option>
          </Select>
        </Form.Item>
        <p className="text-justify pl-3 pr-3 mb-10">{calcExplication}</p>

        <hr />

        {isIndustrialization || isService ? (
          <>
            <h3>Definição da mão de obra</h3>

            {isService && (
              <>
                <div>
                  Unidade de medida considerada na produção do produto ou entrega do serviço por
                  colaborador.
                </div>
                <Form.Item
                  className="w-[200px]"
                  name="unitMeasure"
                  label="Unidade de medida"
                  rules={[{ required: true }]}
                >
                  <Select onChange={handleChangeUnitMeasure}>
                    <Select.Option value="MINUTES">Minutos</Select.Option>
                    <Select.Option value="HOURS">Horas</Select.Option>
                    <Select.Option value="DAYS">Dias</Select.Option>
                    <Select.Option value="ACTIVITIES">Atendimento</Select.Option>
                  </Select>
                </Form.Item>
              </>
            )}
            <div>
              {isIndustrialization
                ? 'Quantidade de horas produtivas por colaborador considerado no mês.'
                : 'Quantidade/tempo/atividade produtivo(a) por colaborador considerado no mês.'}
            </div>
            <Form.Item
              className="w-[130px] mt-2"
              name="monthlyWorkloadInMinutes"
              rules={[{ required: true, message: 'Insira valor maior que 0' }]}
            >
              <Input
                type="number"
                min={0}
                minLength={0}
                suffix={isIndustrialization ? 'Horas' : null}
                disabled={!enableQuantityInput && !isIndustrialization}
              />
            </Form.Item>
            <div className="flex items-end"></div>
            <hr />
          </>
        ) : null}

        <h3>Definição de colaboradores</h3>
        <Form.Item
          name="numProductiveSectorEmployee"
          label="Quantidade colaboradores setor produtivo"
          rules={[{ required: true }]}
        >
          <Input type="number" min={0} />
        </Form.Item>
        <Form.Item
          name="numComercialSectorEmployee"
          label="Quantidade colaboradores setor comercial"
          rules={[{ required: true }]}
        >
          <Input type="number" min={0} />
        </Form.Item>
        <Form.Item
          name="numAdministrativeSectorEmployee"
          label="Quantidade colaboradores setor administrativo"
          rules={[{ required: true }]}
        >
          <Input type="number" min={0} />
        </Form.Item>

        {/* Regime Tributário e Imposto % configurados em Configurações > Fiscal/Tributário */}
        <Form.Item name="taxableRegime" hidden><Input /></Form.Item>
        <Form.Item name="taxableRegimeValue" hidden initialValue={0}><Input /></Form.Item>
      </Form>
    </Modal>
  )
}

export { ChooseCalcModal }
