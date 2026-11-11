import { ChangeEvent, FC, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AutoComplete, Button, Card, Form, Input, InputNumber, Popconfirm, Space, Alert, Radio, Divider, Tooltip, Spin, Switch, Modal, Tag, Segmented } from 'antd'
import { Select } from '@/components/ui/app-select.component'
import { PercentInput } from '@/components/percent-input.component'
import IvaDualReductionFactorField from '@/components/iva-dual-reduction-factor-field'
import { InfoCircleOutlined, PlusOutlined, SearchOutlined, SyncOutlined, DeleteOutlined } from '@ant-design/icons'
import { PAGE_TITLES } from '@/constants/page-titles'
import { IItemModel } from '@/server/model/item'
import { IItemProductModel, itemProductSchema } from '@/server/model/item-product-item'
import { ColumnsType } from 'antd/es/table'
import { UNIT_TYPE } from '@/constants/item-unit-types'
import { calculateItemPrice } from '@/utils/calculate-item-price'
import { resolveProductTaxPercentToPersist } from '@/utils/product-tax-percent'
import { buildDestinationSnapshot } from '@/utils/destination-snapshot'
import { MessageInstance } from 'antd/es/message/interface'
import { useRouter } from 'next/router'
import { IProductModel } from '@/server/model/product'
import { ROUTES } from '@/constants/routes'
import { getMonetaryValue } from '@/utils/get-monetary-value'
import { CalcBaseType } from '@/types/calc-base.type'
import { resolveMonthlyWorkload } from '@/utils/resolve-monthly-workload'
import { computeIvaDualOutside } from '@/utils/iva-dual-outside'
import { resolveIvaDualEffectiveRate } from '@/utils/item-tax-rates'
import { resolvePisCofinsPctFromNcm } from '@/utils/ncm-pis-cofins'
import { pisCofinsDaReferenciaDoTenant } from '@/utils/ncm-pis-cofins'
import { FALTA_DA_CARGA_HORARIA, FALTA_DO_PRECO_FORMADO } from '@/lib/atendimentos-ia/preco-do-orcamento'
import { PRODUCT_PRICE_INFO_BASE } from '@/utils/product-price-info-base'
import { calcularNoMotorDoProduto, tipoDeCalculoEfetivo } from '@/utils/motor-do-produto'
import { resolveReducoesDoItem } from '@/utils/classificacao-fiscal'
import ClassificacaoFiscalBlock, { type ClassificacaoFiscalValue } from '@/page-parts/shared/classificacao-fiscal-block.component'
import { computeIcmsSt, computeDifal, computeIcmsComplementar, mvaAjustada } from '@/utils/icms-st-difal'
import { CALC_TYPE_ENUM } from '@/shared/enums/calc-type'
import { derivarBaseItemId } from '@/utils/base-item-derivado'
import { ContentIndustrialization } from './content-industrialization'
import { ContentResale } from './content-resale'
import { ContentService } from './content-service'
import { ProductPrice, type PrecoEmitido } from './product-price.component'
import { ItensPrecificados } from '@/page-parts/atendimentos-ia/itens-precificados.component'
import type { ItemDoArquivo } from '@/lib/atendimentos-ia/arquivo-do-orcamento'
import { LoggedUser } from '@/types/logged-user.type'
import { supabase } from '@/supabase/client'
import { getTenantId, getCurrentUserId } from '@/utils/get-tenant-id'
import { useDevice } from '@/contexts/device.context'
import { ProductItemsMobileList } from './product-items-mobile-list.component'
import {
  CABECALHO_FIXO, entradaDoMotor, estadoDoCalculo, faltasDaPrecificacao, FRASE_DO_ESTADO, internaParaGravar, PRESET_DA_COMERCIALIZACAO, MODO_PRODUTO, reconciliacaoNaTela, rotuloDoItem,
  type GravacaoDaPrecificacao, type ModoDaPrecificacao, type OrcamentoNaPrecificacao,
} from '@/lib/atendimentos-ia/precificacao-do-orcamento'

type ContentProps = {
  messageApi: MessageInstance
  isEditingMode: boolean
  product?: IProductModel
  itemsFromApi: IItemModel[]
  calcBase: CalcBaseType
  currentUser: LoggedUser
  prefill?: {
    productType?: 'PRODUZIDO' | 'REVENDA'
    baseItemId?: string | null
    name?: string
    description?: string
    unitType?: string
    quantity?: number
    ncm_code?: string
    commission_table_id?: string | null
  } | null
  /**
   * O MODO "ORÇAMENTO" (o 1b, decisão 2 do dono do produto, 09/11/2026): a mesma precificação, com a entrada vinda do orçamento I.A.
   * calculado — os itens são as esquadrias, o custo é o líquido dos materiais e os minutos são os da fabricação (a forma da D2). O cabeçalho
   * é fixo e só leitura, e o salvar grava NO ORÇAMENTO, nunca em `products`. Ausente, a tela é a de Produtos, sem nenhuma diferença.
   */
  orcamento?: OrcamentoNaPrecificacao
  /** Os itens como o arquivo "Orçamento" os mostra (a faixa antes do salvar, 11/11/2026), ou a recusa que impediu montá-los. */
  itensDoArquivo?: ItemDoArquivo[] | null
  recusaDosItensDoArquivo?: string | null
  /** Grava a precificação no orçamento; devolve as recusas nomeadas, ou `null` quando gravou. */
  onSalvarOrcamento?: (g: GravacaoDaPrecificacao) => Promise<string[] | null>
  /** Recalcula o orçamento (o cálculo do 1b) e relê; usado no aviso de cálculo incompleto. */
  onRecalcularOrcamento?: () => Promise<void>
}

export type ProductPriceInfoType = {
  salesCommissionPercent: number
  salesCommissionPrice: number

  salesCommissionPercentByProduct: number
  salesCommissionPriceByProduct: number

  productProfitPercent: number
  productProfitPrice: number

  productProfitPercentByProduct: number
  productProfitPriceByProduct: number

  // EPIC-RT v8: RT (Comissão Reserva Técnica) — % base 100 (ex.: 3.5 = 3,5%) + valor R$.
  rtReservePercent: number
  rtReservePrice: number

  indirectLaborExpensePrice: number
  /** laborUnit/priceUnit (0-100) for display. */
  laborPctShown: number
  fixedExpensePrice: number
  /**
   * COMPROMISSOS FINANCEIROS em R$ — ADENDO 2. UM produtor, lido pelas duas telas.
   *
   * Em 02/10/2026 `fixedExpensePct` passou a vir REDUZIDO (sem as cinco categorias do bloco).
   * `fixedExpensePrice` encolheu junto, e na tela de serviço ele compõe o R$ de "Mão de obra
   * produtiva" (MO direta + administrativa + desp. fixas) e a barra de composição — que
   * deixaram de somar o preço, sem nada acusar. Este campo devolve a parcela que saiu.
   *
   * Derivá-lo na tela filha a partir de `totalServicePrice` seria a segunda escrita da mesma
   * fórmula (`copia-divergente.md`): ele nasce aqui, ao lado das outras três.
   */
  financialCommitmentsPrice: number
  variableExpensePrice: number
  financialExpensePrice: number
  taxesPrice: number

  totalProductPrice: number

  productCost: number

  productWorkloadInMinutes: number
  productWorkloadInMinutesPrice: number

  totalServicePrice: number
  totalServiceProductPrice: number

  taxesPriceByProduct: number

  taxableRegimePercent: number
  taxableRegimePrice: number

  taxableRegimePercentByProduct: number
  taxableRegimePriceByProduct: number
}

const REQUIRED_INPUT_MESSAGE = 'Campo obrigatório!'

const capitalizeFirst = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1)

const STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]

export const Content: FC<ContentProps> = ({
  messageApi,
  isEditingMode,
  product,
  itemsFromApi,
  calcBase,
  currentUser,
  prefill,
  orcamento,
  itensDoArquivo = null,
  recusaDosItensDoArquivo = null,
  onSalvarOrcamento,
  onRecalcularOrcamento,
}: ContentProps) => {
  const { isMobile } = useDevice()
  // O modo decide SÓ a origem da entrada, o cabeçalho e o destino do salvar; o cálculo é o mesmo (`entradaDoMotor`).
  const modo: ModoDaPrecificacao = useMemo(
    () => (orcamento ? { tipo: 'orcamento', itens: orcamento.itens } : MODO_PRODUTO),
    [orcamento],
  )
  const ehOrcamento = modo.tipo === 'orcamento'
  const [productItemsData, setProductItemsData] = useState<IItemProductModel[]>(
    orcamento
      ? orcamento.itens.map((i) => ({
        id: i.id, key: i.id, name: rotuloDoItem(i), quantity: i.quantidade, referenceQuantity: i.quantidade, unitType: 'UN',
        price: i.custo_liquido_materiais ?? 0, referencePrice: i.custo_liquido_materiais ?? 0,
      } as IItemProductModel))
      : product?.items.map((item) => ({ ...item, key: item.id })) || []
  )
  const [items, setItems] = useState<IItemModel[]>(itemsFromApi || [])

  // Sincroniza items quando itemsFromApi mudar (ex: ao navegar de itens→produtos com item novo)
  useEffect(() => {
    setItems(itemsFromApi || [])
  }, [itemsFromApi])

  // Enriquecimento de productItemsData com BRUTO unitário (cost_gross/measure_quantity)
  // e valores unitários cheios do item (cost_gross / cost_net) — usados para exibição
  // do "Valor unitário" e "Valor custo líquido" cadastrados.
  useEffect(() => {
    if (!itemsFromApi?.length) return
    setProductItemsData((prev: IItemProductModel[]) => {
      const regimeCtx = currentUser?.taxableRegime
      const hasItemTaxesCtx = regimeCtx === 'LUCRO_REAL' || regimeCtx === 'LUCRO_PRESUMIDO' || regimeCtx === 'SIMPLES_HIBRIDO'
      let mutated = false
      const next = prev.map((it) => {
        const r = it as IItemProductModel & { grossPerUnit?: number; hasItemTaxes?: boolean; unitGross?: number; unitNet?: number }
        if (r.grossPerUnit != null && r.hasItemTaxes != null && r.unitGross != null) return r
        const apiItem = (itemsFromApi as any[]).find((i: any) => i.id === r.id)
        const measureQty = Number(apiItem?.measure_quantity) || 1
        const itemCostGross = Number(apiItem?.cost_gross) || 0
        const itemCostNet = Number(apiItem?.cost_net) || 0
        const itemCostPrice = Number(apiItem?.cost_price) || 0
        const grossUnit = itemCostGross > 0
          ? itemCostGross / measureQty
          : Number(r.referencePrice) || 0
        const unitGross = itemCostGross > 0 ? itemCostGross : itemCostPrice
        const unitNet = hasItemTaxesCtx && itemCostNet > 0 ? itemCostNet : undefined
        mutated = true
        return { ...r, grossPerUnit: grossUnit, hasItemTaxes: hasItemTaxesCtx, unitGross, unitNet }
      })
      return mutated ? next : prev
    })
  }, [itemsFromApi, currentUser?.taxableRegime])
  const [productPriceInfo, setProductPriceInfo] = useState<ProductPriceInfoType | null>(
    PRODUCT_PRICE_INFO_BASE
  )
  const [updatedProductPriceInfoWithApi, setUpdatedProductPriceInfoWithApi] = useState<number>(1)
  const [productForm] = Form.useForm()
  const [itemsForm] = Form.useForm()

  const isRevendaFromDb = (product as any)?.productType === 'REVENDA'
  const isCalcTypeService = currentUser?.calcType === CALC_TYPE_ENUM.SERVICE
  const isCalcTypeResale = currentUser?.calcType === CALC_TYPE_ENUM.RESALE

  const [productType, setProductType] = useState<'PRODUZIDO' | 'REVENDA'>(
    // o orçamento é PRODUZIDO por decisão (o cabeçalho fixo): a esquadria é fabricada, e a mão de obra dela entra no custo
    orcamento ? 'PRODUZIDO' : (isCalcTypeService || isCalcTypeResale) ? 'REVENDA' : ((product as any)?.productType || 'PRODUZIDO')
  )
  // O ORÇAMENTO DE INDUSTRIALIZAÇÃO (dono do produto, 11/11/2026): orçamento E segmento produzido, os dois — nunca só um. É ele, e não o modo
  // orçamento, que amarra os tributos às credenciais da empresa e tira o bloco Fiscal: na REVENDA o NCM e o ICMS vêm de cada produto, e um
  // orçamento de revenda não pode herdar "imposto da empresa" por acidente. Hoje todo orçamento nasce PRODUZIDO (o cabeçalho fixo).
  const ehOrcamentoDeIndustrializacao = ehOrcamento && productType === 'PRODUZIDO'
  const [baseItemId, setBaseItemId] = useState<string | null>(
    (product as any)?.baseItemId || null
  )
  // O contexto da venda do PRODUTO. No orçamento I.A. ele não é lido: o fiscal é o PRESET, automático e invisível (dono do produto,
  // 11/11/2026: "Sem pergunta, sem seletor, sem falta"), e o bloco Fiscal não aparece.
  const [saleScope, setSaleScope] = useState<'INTRAESTADUAL' | 'INTERESTADUAL'>('INTRAESTADUAL')
  const [buyerType, setBuyerType] = useState<'CONSUMIDOR_FINAL' | 'CONTRIBUINTE_PJ'>('CONSUMIDOR_FINAL')
  const [destinationState, setDestinationState] = useState<string | null>(null)
  // No orçamento I.A. os impostos vêm SEMPRE das credenciais da empresa (11/11/2026): ICMS da UF, PIS/COFINS pelo regime, IBS e CBS das
  // referências de `tenant_settings`. `referenciaDoTenant`: `null` = o regime não apura ICMS e PIS/COFINS por ela (ou ainda não foi lida);
  // false = a UF ou o ICMS interno dela não estão cadastrados (falta nomeada, nunca zero). IBS e CBS: o valor gravado, e NULO é "não há o que
  // apurar" — não entra, nem como zero, e não impede o preço.
  const [referenciaDoTenant, setReferenciaDoTenant] = useState<boolean | null>(null)
  const [pisCofinsDaReferencia, setPisCofinsDaReferencia] = useState<number | null>(null)
  const [ibsDaEmpresa, setIbsDaEmpresa] = useState<number | null>(null)
  const [cbsDaEmpresa, setCbsDaEmpresa] = useState<number | null>(null)
  const [salvandoOrcamento, setSalvandoOrcamento] = useState(false)
  const [recusasDoOrcamento, setRecusasDoOrcamento] = useState<string[]>([])
  const [customTaxPercent, setCustomTaxPercent] = useState<number | null>(
    (product as any)?.custom_tax_percent != null ? Number((product as any).custom_tax_percent) : null
  )
  const [additionalIrpjPercent, setAdditionalIrpjPercent] = useState<number>(
    (product as any)?.additional_irpj_percent != null ? Number((product as any).additional_irpj_percent) : 0
  )
  const [freightValue, setFreightValue] = useState<number>(
    (product as any)?.freight_value != null ? Number((product as any).freight_value) : 0
  )
  const [insuranceValue, setInsuranceValue] = useState<number>(
    (product as any)?.insurance_value != null ? Number((product as any).insurance_value) : 0
  )
  const [accessoryExpensesValue, setAccessoryExpensesValue] = useState<number>(
    (product as any)?.accessory_expenses_value != null ? Number((product as any).accessory_expenses_value) : 0
  )

  const isLucroRealProd = currentUser?.taxableRegime === 'LUCRO_REAL'
  const isLucroPresumidoProdOnly = currentUser?.taxableRegime === 'LUCRO_PRESUMIDO'
  const isSimplesHibridoProd = currentUser?.taxableRegime === 'SIMPLES_HIBRIDO'
  const isLRorLP = isLucroRealProd || isLucroPresumidoProdOnly
  const isLRorLPorSH = isLRorLP || isSimplesHibridoProd

  // Alíquotas de referência IBS/CBS do tenant (Lucro Real / Simples Híbrido)
  // ADR-022: prefere o snapshot da referência salvo no produto (imune a mudança posterior do
  // tenant); cai no tenant só quando o produto não tem snapshot (criação / produto legado).
  const [ibsReferencePct, setIbsReferencePct] = useState<number>(
    (product as any)?.ibs_reference_pct != null ? Number((product as any).ibs_reference_pct) : 0
  )
  const [cbsReferencePct, setCbsReferencePct] = useState<number>(
    (product as any)?.cbs_reference_pct != null ? Number((product as any).cbs_reference_pct) : 0
  )

  useEffect(() => {
    if (!isLRorLPorSH) return
    async function fetchIvaRefRates() {
      const tenantId = currentUser?.tenant_id
      if (!tenantId) return
      const { data } = await (supabase as any)
        .from('tenant_settings')
        .select('ibs_reference_pct, cbs_reference_pct, state_code')
        .eq('tenant_id', tenantId)
        .single()
      // O ICMS interno da UF da empresa: lido UMA vez, para o produto novo e para a referência do orçamento.
      const uf = typeof data?.state_code === 'string' ? data.state_code.trim() : ''
      const precisaDaUf = uf !== '' && (!isEditingMode || (ehOrcamentoDeIndustrializacao && isLRorLP))
      const { data: stateData } = precisaDaUf
        ? await (supabase as any).from('brazilian_states').select('icms_internal_rate').eq('code', uf).maybeSingle()
        : { data: null }
      const icmsDaUf = stateData?.icms_internal_rate != null ? Number(stateData.icms_internal_rate) * 100 : null
      // No orçamento (11/11/2026), a referência do tenant é o que dá o ICMS e o PIS/COFINS sem NCM: a falta dela é nomeada.
      if (ehOrcamentoDeIndustrializacao) {
        setIbsDaEmpresa(data?.ibs_reference_pct != null ? Number(data.ibs_reference_pct) : null)
        setCbsDaEmpresa(data?.cbs_reference_pct != null ? Number(data.cbs_reference_pct) : null)
      }
      if (ehOrcamentoDeIndustrializacao && isLRorLP) {
        setReferenciaDoTenant(icmsDaUf !== null)
        setPisCofinsDaReferencia(icmsDaUf === null ? null
          : pisCofinsDaReferenciaDoTenant({ isLucroReal: isLucroRealProd, isLucroPresumido: isLucroPresumidoProdOnly, icmsPct: icmsDaUf }))
      }
      if (data) {
        // Não sobrescreve o snapshot do produto (ADR-022): só usa a referência do tenant quando
        // o produto ainda não tem a sua própria (criação ou legado).
        if (data.ibs_reference_pct != null && (product as any)?.ibs_reference_pct == null) setIbsReferencePct(Number(data.ibs_reference_pct))
        if (data.cbs_reference_pct != null && (product as any)?.cbs_reference_pct == null) setCbsReferencePct(Number(data.cbs_reference_pct))
        // Auto-preenchimento do ICMS interno apenas para novos produtos (Lucro Real)
        if (!isEditingMode && icmsDaUf !== null) {
          const autoIcmsPct = icmsDaUf
          setIcmsPct(autoIcmsPct)
          // No orçamento, o PIS/COFINS da referência entra pelo efeito do NCM vazio, abaixo (11/11/2026): com NCM, ele vem do NCM.
          if (!orcamento) {
            const pisCofinsBase = isLucroPresumidoProdOnly ? 3.65 : 9.25
            setPisCofinsLRPct(parseFloat((pisCofinsBase * (1 - autoIcmsPct / 100)).toFixed(4)))
          }
        }
      }
    }
    fetchIvaRefRates()
  }, [isLRorLPorSH, currentUser?.tenant_id, isEditingMode, ehOrcamentoDeIndustrializacao])

  // ICMS e PIS/COFINS para Lucro Real (migrados do modal de lançar impostos)
  const initialIcms = (product as any)?.icms_pct != null ? Number((product as any).icms_pct) : 0
  const initialPisCofins = (product as any)?.pis_cofins_pct != null
    ? Number((product as any).pis_cofins_pct)
    : 0
  const [icmsPct, setIcmsPct] = useState<number>(initialIcms)
  const [pisCofinsLRPct, setPisCofinsLRPct] = useState<number>(initialPisCofins)

  // IVA DUAL — fator de redução por produto
  const [ivaDualReductionFactor, setIvaDualReductionFactor] = useState<number | null>(
    (product as any)?.iva_dual_reduction_factor != null ? Number((product as any).iva_dual_reduction_factor) : null
  )

  // ── A CLASSIFICAÇÃO FISCAL, de onde a redução DECORRE ───────────────────────
  // Seis estados porque são seis colunas, e cada uma responde uma pergunta
  // diferente. `cclass_trib_origem` e a publicação são FATO gravado no momento da
  // classificação, nunca deduzidos depois: contra uma tabela que muda, a dedução
  // erra nos dois sentidos e a resposta mudaria sozinha.
  const [classificacao, setClassificacao] = useState<ClassificacaoFiscalValue>({
    cstIbsCbsCode: (product as any)?.cst_ibs_cbs_code ?? null,
    cclassTrib: (product as any)?.cclass_trib ?? null,
    cclassTribOrigem: (product as any)?.cclass_trib_origem ?? null,
    cclassTribSourcePublishedAt: (product as any)?.cclass_trib_source_published_at ?? null,
    ivaReductionIbsPct: (product as any)?.iva_reduction_ibs_pct != null
      ? Number((product as any).iva_reduction_ibs_pct) : null,
    ivaReductionCbsPct: (product as any)?.iva_reduction_cbs_pct != null
      ? Number((product as any).iva_reduction_cbs_pct) : null,
  })
  // Par incompatível não grava e não salva — a SEFAZ o rejeita.
  const [bloqueioDaClassificacao, setBloqueioDaClassificacao] = useState<string | null>(null)

  // A TRAVESSIA ÚNICA. Tela e motor leem daqui, para que não possam divergir na
  // origem do número: as colunas novas vencem, e o fator legado só entra quando
  // as duas estão vazias.
  const reducoes = useMemo(
    () => resolveReducoesDoItem({
      iva_reduction_ibs_pct: classificacao.ivaReductionIbsPct,
      iva_reduction_cbs_pct: classificacao.ivaReductionCbsPct,
      iva_dual_reduction_factor: ivaDualReductionFactor,
    }),
    [classificacao.ivaReductionIbsPct, classificacao.ivaReductionCbsPct, ivaDualReductionFactor],
  )

  const [ibsPct, setIbsPct] = useState<number>(
    (product as any)?.ibs_pct != null ? Number((product as any).ibs_pct) : 0
  )
  const [cbsPct, setCbsPct] = useState<number>(
    (product as any)?.cbs_pct != null ? Number((product as any).cbs_pct) : 0
  )

  // Handler: ICMS muda → auto-recalcula PIS/COFINS via fórmula
  // LP: cumulativo 3,65% × (1 − ICMS); LR/SH: não-cumulativo 9,25% × (1 − ICMS)
  function handleIcmsPctChange(val: number) {
    setIcmsPct(val)
    if (isLRorLPorSH) {
      const pisCofinsBase = isLucroPresumidoProdOnly ? 3.65 : 9.25
      const newPisCofins = parseFloat((pisCofinsBase * (1 - val / 100)).toFixed(4))
      setPisCofinsLRPct(newPisCofins)
    }
  }

  // Handler: fator IVA DUAL muda (PC-BUG-FATOR-REDUCAO-002, regra do PO).
  // O campo IBS/CBS guarda a alíquota BRUTA digitada; a EFETIVA = bruta × (1 − fator) é
  // derivada on-read pelo motor (resolveIvaDualEffectiveRate). NÃO sobrescreve a bruta aqui —
  // o usuário vê a bruta digitada e a efetiva calculada ao lado (não dupla redução).
  // `handleIvaDualFactorChange` FOI REMOVIDA em 16/09/2026. O fator deixou de ser
  // ENTRADA: a redução decorre do cClassTrib, e o valor legado é exibido só em leitura.
  // Manter o handler seria deixar aberta a porta que a regra fechou.
  const [isPct, setIsPct] = useState<number>(
    (product as any)?.is_pct != null ? Number((product as any).is_pct) : 0
  )
  const [ipiPct, setIpiPct] = useState<number>(
    (product as any)?.ipi_pct != null ? Number((product as any).ipi_pct) : 0
  )

  // R3 — CÓDIGO DE BASE por tributo por fora (7.5, item 6: derivado do contexto da venda,
  // COM OVERRIDE MANUAL). `null` é NÃO CLASSIFICADO e cai no padrão (IPI e IS no 1, IBS e
  // CBS no 4); jamais o código 1 por omissão — `docs/regras/ausente-vs-falso.md`.
  //
  // O produto legado não tem as colunas, então chega `undefined` e vira `null`. Enquanto a
  // migração `20260915000003` não estiver aplicada, TODO produto está neste estado, e o
  // motor usa o padrão — que é o comportamento de hoje.
  const readBaseCode = (campo: string): number | null => {
    const v = (product as any)?.[campo]
    return v != null ? Number(v) : null
  }
  const [ibsBaseCode, setIbsBaseCode] = useState<number | null>(() => readBaseCode('ibs_base_code'))
  const [cbsBaseCode, setCbsBaseCode] = useState<number | null>(() => readBaseCode('cbs_base_code'))
  const [isBaseCode, setIsBaseCode] = useState<number | null>(() => readBaseCode('is_base_code'))
  const [ipiBaseCode, setIpiBaseCode] = useState<number | null>(() => readBaseCode('ipi_base_code'))

  // ───────── EPIC-POR-FORA-V3 / S1 — seção superior dos 7 campos % simples REMOVIDA ─────────
  // Os estados issPct/issRetidoPct/icmsStPct/difalPct/fcpPct/irpjItemPct/csllItemPct foram
  // removidos (decisão D1, 09/06). ICMS-ST/DIFAL/FCP usam o cálculo completo abaixo; ISS/IRPJ/CSLL
  // usam o padrão do tenant.

  // ───────── EPIC-POR-FORA-V2 (S4/S5) — ICMS-ST / DIFAL / ICMS Complementar avançados ─────────
  // Convenção BASE 100 direta (sem heurística decimal — Architect P0-3). Acionadores ST e DIFAL
  // são mutuamente exclusivos (doc v4 §9.3). ICMS Compl. é exibido como prévia; sua aplicação
  // efetiva depende do destinatário (consumidor final não contribuinte) e é resolvida no orçamento.
  const [icmsStActive, setIcmsStActive] = useState<boolean>((product as any)?.icms_st_active ?? false)
  const [difalActive, setDifalActive] = useState<boolean>((product as any)?.difal_active ?? false)
  const [stDifalInterestadual, setStDifalInterestadual] = useState<boolean>((product as any)?.st_difal_interestadual ?? false)
  const [difalBaseDupla, setDifalBaseDupla] = useState<boolean>((product as any)?.difal_base_dupla ?? false)
  const num100 = (v: any) => (v != null ? Number(v) : 0)
  const [mvaOriginalPct, setMvaOriginalPct] = useState<number>(num100((product as any)?.mva_original_pct))
  const [icmsAlqInternaDestinoPct, setIcmsAlqInternaDestinoPct] = useState<number>(num100((product as any)?.icms_alq_interna_destino_pct))
  const [icmsAlqInterestadualOrigemPct, setIcmsAlqInterestadualOrigemPct] = useState<number>(num100((product as any)?.icms_alq_interestadual_origem_pct))
  const [icmsInternaOrigemPct, setIcmsInternaOrigemPct] = useState<number>(num100((product as any)?.icms_interna_origem_pct))
  const [fcpAlqPct, setFcpAlqPct] = useState<number>(num100((product as any)?.fcp_alq_pct))

  const [recurrenceActive, setRecurrenceActive] = useState<boolean>((product as any)?.recurrence_active ?? false)
  const [recurrenceModalOpen, setRecurrenceModalOpen] = useState(false)
  const [recurrenceDays, setRecurrenceDays] = useState<number | null>((product as any)?.recurrence_days ?? null)
  const [recurrenceMessage, setRecurrenceMessage] = useState<string>((product as any)?.recurrence_message ?? '')
  const recurrenceTextareaRef = useRef<HTMLTextAreaElement>(null)

  // Product sections
  const [sections, setSections] = useState<{ id: string; name: string }[]>([])
  const [loadingSections, setLoadingSections] = useState(false)
  // BUG-PRODUCT-ITEMS-DUP: trava anti double-submit do save do produto.
  const [savingProduct, setSavingProduct] = useState(false)
  const [newSectionModalOpen, setNewSectionModalOpen] = useState(false)
  const [newSectionName, setNewSectionName] = useState('')
  const [savingNewSection, setSavingNewSection] = useState(false)

  const loadSections = useCallback(async () => {
    const tenantId = await getTenantId()
    if (!tenantId) return
    setLoadingSections(true)
    try {
      const { data, error } = await supabase
        .from('product_sections')
        .select('id, name')
        .eq('tenant_id', tenantId)
        .order('name', { ascending: true })
      if (!error && data) setSections(data)
    } finally {
      setLoadingSections(false)
    }
  }, [])

  useEffect(() => { loadSections() }, [loadSections])

  // Commission tables
  const [commissionTables, setCommissionTables] = useState<{ id: string; name: string; commission_percent: number }[]>([])

  const loadCommissionTables = useCallback(async () => {
    const { data } = await (supabase as any)
      .from('commission_tables')
      .select('id, name, commission_percent')
      .eq('type', 'PRODUCT')
      .order('name')
    if (data) setCommissionTables(data.map((t: any) => ({ ...t, commission_percent: Number(t.commission_percent) })))
  }, [])

  useEffect(() => { loadCommissionTables() }, [loadCommissionTables])

  const handleCreateSectionInline = async () => {
    const name = newSectionName.trim()
    if (!name) return
    const tenantId = await getTenantId()
    if (!tenantId) return
    setSavingNewSection(true)
    try {
      const { data, error } = await supabase
        .from('product_sections')
        .insert({ tenant_id: tenantId, name })
        .select('id, name')
        .single()
      if (error) throw error
      setSections(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      productForm.setFieldsValue({ section_id: data.id })
      setNewSectionName('')
      setNewSectionModalOpen(false)
    } catch (err: any) {
      console.error('Erro ao criar seção:', err)
    } finally {
      setSavingNewSection(false)
    }
  }

  function insertRecurrenceTag(tag: string) {
    const textarea = recurrenceTextareaRef.current
    if (textarea) {
      const start = textarea.selectionStart ?? recurrenceMessage.length
      const end = textarea.selectionEnd ?? recurrenceMessage.length
      const newText = recurrenceMessage.substring(0, start) + tag + recurrenceMessage.substring(end)
      setRecurrenceMessage(newText)
      setTimeout(() => {
        textarea.focus()
        const newPos = start + tag.length
        textarea.setSelectionRange(newPos, newPos)
      }, 0)
    } else {
      setRecurrenceMessage(prev => prev + tag)
    }
  }

  const [ncmSuggestions, setNcmSuggestions] = useState<{ code: string; description: string }[]>([])
  const [ncmSugLoading, setNcmSugLoading] = useState(false)
  const [ncmOptions, setNcmOptions] = useState<{ value: string; label: React.ReactNode }[]>([])
  const [ncmFieldSearching, setNcmFieldSearching] = useState(false)
  const ncmDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const nameDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const finalPriceWithTaxesRef = useRef<number>(0)
  const salePriceBaseRef = useRef<number>(0)
  /**
   * R3 — o `c` que ESTA construção usou, para congelar junto com o preço.
   *
   * Começa com o que já está gravado no produto, e não com `null`: o `ProductPrice` só emite
   * quando o preço sai positivo, e um save feito sem novo cálculo não pode APAGAR o
   * coeficiente de uma construção anterior. `null` aqui significa "nunca apurado", que é o
   * estado de todo produto anterior a esta coluna — `docs/regras/ausente-vs-falso.md`.
   */
  const externalOpsCoefficientRef = useRef<number | null>(
    (product as any)?.external_ops_coefficient != null ? Number((product as any).external_ops_coefficient) : null
  )

  /**
   * UM handler, e não três.
   *
   * Os três `<Content*>` recebiam o MESMO literal escrito à mão, e o campo que precisava
   * entrar agora é exatamente o tipo de campo que entra em duas cópias e esquece a terceira
   * — `docs/regras/copia-divergente.md`. O teste `congelar-o-coeficiente-por-fora` afirma
   * que existe um só.
   */
  // a "Total Operação Interna" e o "Valor do produto precificado" do último preço formado: o orçamento I.A. grava a interna (20261110000001)
  const operacaoInternaRef = useRef<number>(0)
  const valorPrecificadoRef = useRef<number>(0)
  // a interna também como estado: a faixa dos itens precificados (antes do salvar) se redesenha a cada preço formado
  const [internaNaTela, setInternaNaTela] = useState(0)
  const handleFinalPriceWithTaxes = useCallback(
    (d: PrecoEmitido) => {
      finalPriceWithTaxesRef.current = d.finalPrice
      salePriceBaseRef.current = d.basePrice
      externalOpsCoefficientRef.current = d.externalOpsCoefficient
      operacaoInternaRef.current = d.operacaoInterna
      valorPrecificadoRef.current = d.valorPrecificado
      setInternaNaTela(d.operacaoInterna)
    },
    [],
  )

  // No orçamento, o preço que deixou de se formar ZERA o último emitido: gravar o preço de antes da mudança seria número errado em dinheiro.
  const zerarPrecoNaoFormado = useCallback(() => { finalPriceWithTaxesRef.current = 0; operacaoInternaRef.current = 0; valorPrecificadoRef.current = 0; setInternaNaTela(0) }, [])

  const searchNcmByName = useCallback(async (name: string) => {
    if (name.length < 2) { setNcmSuggestions([]); return }
    setNcmSugLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('lookup-ncm', {
        body: { search: name },
      })
      if (!error && data?.success && data.results) {
        setNcmSuggestions(data.results.slice(0, 8).map((r: any) => ({
          code: r.code, description: r.description,
        })))
      } else { setNcmSuggestions([]) }
    } catch { setNcmSuggestions([]) }
    finally { setNcmSugLoading(false) }
  }, [])

  const handleProductNameChange = useCallback((name: string) => {
    productForm.setFieldsValue({ name: capitalizeFirst(name) })
    if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current)
    nameDebounceRef.current = setTimeout(() => searchNcmByName(name), 280)
  }, [productForm, searchNcmByName])

  const fetchNcmRatesForLR = useCallback(async (code: string): Promise<number | null | undefined> => {
    if (!isLRorLP || !code) return undefined
    // LP usa PIS/COFINS cumulativo e NÃO consulta o NCM: responde sem ir ao banco.
    if (isLucroPresumidoProdOnly) {
      const pct = resolvePisCofinsPctFromNcm({
        isLucroReal: false, isLucroPresumido: true, icmsPct, ncmRow: null,
      })
      if (pct != null) setPisCofinsLRPct(pct)
      return pct
    }
    // LR: busca as alíquotas não-cumulativas pela NCM. A CONTA vive em `ncm-pis-cofins.ts`,
    // exportada para que o efeito seja afirmável por teste — aqui fica só a ida ao banco.
    try {
      const { data } = await (supabase as any)
        .from('ncm_codes')
        .select('pis_rate_nao_cumulativo, cofins_rate_nao_cumulativo')
        .eq('code', code)
        .single()
      const pct = resolvePisCofinsPctFromNcm({
        isLucroReal: true, isLucroPresumido: false, icmsPct, ncmRow: data ?? null,
      })
      if (pct != null) setPisCofinsLRPct(pct)
      return pct
    } catch { return null }
  }, [isLRorLP, isLucroPresumidoProdOnly, icmsPct])

  const handleSelectNcmSuggestion = useCallback((code: string) => {
    productForm.setFieldsValue({ ncm_code: code })
    setNcmSuggestions([])
    fetchNcmRatesForLR(code)
  }, [productForm, fetchNcmRatesForLR])

  const searchNcmField = useCallback(async (term: string) => {
    const clean = term.replace(/\D/g, '')
    if (clean.length < 3 && term.length < 3) { setNcmOptions([]); return }
    setNcmFieldSearching(true)
    try {
      const isCode = clean.length >= 4 && !/[a-zA-Z]/.test(term)
      const { data, error } = await supabase.functions.invoke('lookup-ncm', {
        body: isCode ? { code: clean } : { search: term },
      })
      if (!error && data?.success && data.results) {
        setNcmOptions(data.results.map((r: any) => ({
          value: r.code,
          label: (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</span>
              <span style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>{r.code}</span>
            </div>
          ),
        })))
      }
    } catch { /* silent */ }
    finally { setNcmFieldSearching(false) }
  }, [])

  const handleNcmSearch = useCallback((value: string) => {
    if (ncmDebounceRef.current) clearTimeout(ncmDebounceRef.current)
    ncmDebounceRef.current = setTimeout(() => searchNcmField(value), 250)
  }, [searchNcmField])

  const router = useRouter()

  const itemsPriceSum = productItemsData.reduce(
    (prevValue: number, item: IItemProductModel) => prevValue + (Number(item.price) || 0),
    0
  )

  // Items filtrados por tipo: para Revenda, só mostrar itens do tipo REVENDA; para serviço/insumo, apenas não-REVENDA
  const itemsForSelection = (productType === 'REVENDA')
    ? items.filter((i: any) => i.item_type === 'REVENDA' || !i.item_type)
    : items.filter((i: any) => i.item_type !== 'REVENDA')

  // Quando muda para REVENDA e seleciona item base: custo = custo por unidade do item (puxado do cadastro do item).
  useEffect(() => {
    if (productType === 'REVENDA' && baseItemId) {
      const baseItem = items.find((i) => i.id === baseItemId) as (IItemModel & { cost_per_base_unit?: number }) | undefined
      if (baseItem) {
        const qty = Number(baseItem.quantity) || 1
        const totalCost = Number(baseItem.price) ?? Number((baseItem as any).cost_price) ?? 0
        const measureQty = Number((baseItem as any).measure_quantity) || 1
        const isLucroReal = currentUser?.taxableRegime === 'LUCRO_REAL'
        const isLucroPresumidoLocal = currentUser?.taxableRegime === 'LUCRO_PRESUMIDO'
        const isSimplesHibridoLocal = currentUser?.taxableRegime === 'SIMPLES_HIBRIDO'
        const hasItemTaxesLocal = isLucroReal || isLucroPresumidoLocal || isSimplesHibridoLocal
        const costNet = Number((baseItem as any).cost_net) || 0
        // Regimes com impostos no item: usar LÍQUIDO (cost_net/measure_quantity) na precificação.
        const costPerUnit = (hasItemTaxesLocal && costNet > 0)
          ? costNet / measureQty
          : baseItem.cost_per_base_unit != null
            ? Number(baseItem.cost_per_base_unit)
            : qty > 0 ? totalCost / qty : totalCost
        const newItem: IItemProductModel = {
          id: baseItem.id,
          name: baseItem.name,
          quantity: 1,
          referenceQuantity: 1,
          unitType: (baseItem.unitType || 'UN') as any,
          price: Math.max(0.01, costPerUnit),
          referencePrice: Math.max(0.01, costPerUnit),
        }
        setProductItemsData([newItem])
        setTimeout(() => setUpdatedProductPriceInfoWithApi(prev => prev + 1), 100)
      }
    }
  }, [productType, baseItemId, items])

  /**
   * O CICLO AO CONTRÁRIO — a composição PASSA A ESCREVER `baseItemId`.
   *
   * >>> O QUE ISTO CORRIGE, medido em 17/09/2026 <<<
   *
   * Ao remover o seletor "Item base", `base_item_id` passou a ser derivado na GRAVAÇÃO.
   * O que ficou de fora é que o seletor era também o **único escritor em tempo de
   * edição**, e o efeito acima — o que dá CUSTO ao produto de revenda — depende dele.
   * Medido: os pontos de UI que chamavam `setBaseItemId` caíram de DOIS para ZERO.
   *
   * Consequência num produto de REVENDA **novo**, criado direto nesta tela: composição
   * vazia, `itemsPriceSum = 0`, `doProductCalc` devolve preço 0, e a tabela inteira sai
   * `R$ 0,00` com IRPJ e CSLL em `0,000%`. Produto em EDIÇÃO não era afetado —
   * `baseItemId` vem do banco — nem o criado a partir de um item, que usa o prefill.
   *
   * >>> POR QUE A MESMA FUNÇÃO DA GRAVAÇÃO <<<
   *
   * `derivarBaseItemId` é a que o save chama. Escrever aqui uma segunda regra de "um
   * item vira base" seria `copia-divergente.md` entre o que a tela mostra e o que o
   * banco recebe. Com uma função só, a gravação passa a CONFIRMAR o que a tela já
   * resolveu, em vez de descobrir sozinha.
   *
   * >>> POR QUE NÃO ENTRA EM LAÇO COM O EFEITO ACIMA <<<
   *
   * A comparação é por ID. Item X entra na composição → aqui `baseItemId := X` → o
   * efeito acima dispara e reconstrói a composição com X → aqui `X === baseItemId` e
   * nada é setado. Converge numa volta. Sem a comparação, os dois efeitos se chamariam
   * para sempre.
   */
  useEffect(() => {
    if (productType !== 'REVENDA') return
    const derivado = derivarBaseItemId({
      productType,
      itens: productItemsData.map((i) => ({ id: String(i.id) })),
      baseItemIdAtual: baseItemId,
    })
    // Só a DERIVAÇÃO escreve. `PRESERVADO` é o caso de zero ou dois e mais itens, e ali
    // o valor gravado continua valendo — sobrescrevê-lo apagaria o vínculo dos 32
    // produtos medidos. Ver `base-item-derivado.ts`.
    if (derivado.origem !== 'DERIVADO_DA_COMPOSICAO') return
    if (derivado.baseItemId === baseItemId) return
    setBaseItemId(derivado.baseItemId)
  }, [productType, productItemsData, baseItemId])

  useEffect(() => {
    const autoTaxRegime = calcBase.taxableRegimeAutoPercent ?? 0
    const taxRegimeValue = autoTaxRegime > 0 ? autoTaxRegime : (currentUser?.taxableRegimeValue || 0)

    if (taxRegimeValue > 0 && productPriceInfo?.taxableRegimePercent === 0) {
      setProductPriceInfo((prev) => ({
        ...prev,
        taxableRegimePercent: taxRegimeValue,
        taxableRegimePercentByProduct: taxRegimeValue,
      }))
    }
  }, [calcBase.taxableRegimeAutoPercent, currentUser?.taxableRegimeValue, productPriceInfo?.taxableRegimePercent])

  useEffect(() => {
    if (isEditingMode && product) {
      productForm.setFieldsValue(product)
      setProductPriceInfo({
        ...PRODUCT_PRICE_INFO_BASE,
        productProfitPercent: Number((product as any)?.productPriceInfo?.productProfitPercent ?? (product as any)?.profit_percent) || 0,
        salesCommissionPercent: Number((product as any)?.productPriceInfo?.salesCommissionPercent ?? (product as any)?.commission_percent) || 0,
        rtReservePercent: Number((product as any)?.productPriceInfo?.rtReservePercent ?? (product as any)?.rt_reserve_percent) || 0,
        productWorkloadInMinutes: Number((product as any)?.productPriceInfo?.productWorkloadInMinutes) || 0,
      } as ProductPriceInfoType)
      setUpdatedProductPriceInfoWithApi((prev) => prev + 1)
      // Load custom_tax_percent from product if editing
      if ((product as any)?.custom_tax_percent != null) {
        setCustomTaxPercent(Number((product as any).custom_tax_percent))
      }
      if ((product as any)?.additional_irpj_percent != null) {
        setAdditionalIrpjPercent(Number((product as any).additional_irpj_percent))
      }
      // Load atividades terceirizadas fields
      if ((product as any)?.freight_value != null) {
        setFreightValue(Number((product as any).freight_value))
      }
      if ((product as any)?.insurance_value != null) {
        setInsuranceValue(Number((product as any).insurance_value))
      }
      if ((product as any)?.accessory_expenses_value != null) {
        setAccessoryExpensesValue(Number((product as any).accessory_expenses_value))
      }
      // Load ICMS e PIS/COFINS (Lucro Real)
      if ((product as any)?.icms_pct != null) {
        setIcmsPct(Number((product as any).icms_pct))
      }
      if ((product as any)?.pis_cofins_pct != null) {
        setPisCofinsLRPct(Number((product as any).pis_cofins_pct))
      }
      // Load IVA DUAL
      if ((product as any)?.iva_dual_reduction_factor != null) {
        setIvaDualReductionFactor(Number((product as any).iva_dual_reduction_factor))
      }
    }
  }, [productForm, isEditingMode, product])

  useEffect(() => {
    if (!isEditingMode && currentUser && calcBase) {
      const autoTaxRegime = calcBase.taxableRegimeAutoPercent ?? 0
      const taxRegimeValue = autoTaxRegime > 0 ? autoTaxRegime : (currentUser.taxableRegimeValue || 0)
      setProductPriceInfo({
        ...PRODUCT_PRICE_INFO_BASE,
        taxableRegimePercent: taxRegimeValue,
        taxableRegimePercentByProduct: taxRegimeValue,
        // No orçamento, os percentuais com que ele chegou (congelados do levantamento, no do agente). Nulo entra como 0 e é editável na
        // tabela de preço, como em Produtos; o que for usado é gravado junto com o preço.
        ...(orcamento ? {
          salesCommissionPercent: orcamento.comissao_percentual ?? 0,
          rtReservePercent: orcamento.reserva_tecnica_percentual ?? 0,
          productProfitPercent: orcamento.lucro_projetado_percentual ?? 0,
          // os minutos são os da fabricação dos itens, e só leitura: é o que a mão de obra exibe e o que o bloqueio de carga horária lê
          productWorkloadInMinutes: entradaDoMotor(modo, { itemsPriceSum: 0, workloadMinutes: 0 }).productWorkloadMinutes,
        } : {}),
      })
      setUpdatedProductPriceInfoWithApi((prev) => prev + 1)
    }
  }, [isEditingMode, currentUser, calcBase, orcamento, modo])

  // O cabeçalho do orçamento no formulário: código = o número, nome = o cliente, unidade UN, quantidade 1.
  useEffect(() => {
    if (!orcamento) return
    productForm.setFieldsValue({ code: String(orcamento.numero), name: orcamento.nome, unitType: CABECALHO_FIXO.unidade, quantity: 1 })
  }, [orcamento, productForm])

  // No orçamento o PIS/COFINS é SEMPRE o da empresa (pelo regime, sobre a base sem o ICMS da UF), nunca o do NCM (11/11/2026); sem a
  // referência, o campo fica como está e a falta é nomeada.
  useEffect(() => {
    if (ehOrcamentoDeIndustrializacao && pisCofinsDaReferencia !== null) setPisCofinsLRPct(pisCofinsDaReferencia)
  }, [ehOrcamentoDeIndustrializacao, pisCofinsDaReferencia])

  useEffect(() => {
    if (!isEditingMode && prefill) {
      if (prefill.productType) setProductType(prefill.productType)
      if (prefill.baseItemId) setBaseItemId(prefill.baseItemId)
      productForm.setFieldsValue({
        name: prefill.name || '',
        description: prefill.description || '',
        unitType: prefill.unitType || 'UN',
        quantity: prefill.quantity || 1,
        ncm_code: prefill.ncm_code || '',
        commission_table_id: prefill.commission_table_id || null,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill, isEditingMode])


  // --- Bloqueio por carga horária não configurada ----------------------------
  // O preço só depende do divisor de carga horária quando o produto consome tempo de
  // mão de obra produtiva. Por isso o bloqueio é condicional, e NÃO vale para revenda:
  //   - REVENDA: o motor recebe laborCostMonthly 0 e productWorkloadMinutes 0, então o
  //     divisor é irrelevante — produto de revenda continua salvando normalmente.
  //   - Sem tempo de MO cadastrado: idem, nada é dividido pela carga horária.
  // Só quando os dois pesam (tempo de MO > 0 e calcType ≠ REVENDA) a ausência de carga
  // horária tornaria o preço um número formado sobre MO produtiva zerada.
  const isWorkloadBlocking = useMemo(() => {
    const workload = resolveMonthlyWorkload(
      currentUser?.monthlyWorkloadInMinutes,
      currentUser?.unitMeasure,
      currentUser?.numProductiveSectorEmployee,
    )
    if (!workload.isUnset) return false

    const effectiveCalcType = tipoDeCalculoEfetivo(productType, currentUser?.calcType)
    if (effectiveCalcType === 'REVENDA') return false

    return (productPriceInfo?.productWorkloadInMinutes || 0) > 0
  }, [
    currentUser?.monthlyWorkloadInMinutes,
    currentUser?.unitMeasure,
    currentUser?.numProductiveSectorEmployee,
    currentUser?.calcType,
    productType,
    productPriceInfo?.productWorkloadInMinutes,
  ])

  // O alerta INFORMA e para por aí: nada aqui navega. Esta tela não tem persistência
  // de rascunho, então qualquer navegação disparada daqui desmontaria o formulário e
  // descartaria o que o usuário já digitou (num cadastro novo: nome, insumos, minutos,
  // percentuais). O usuário vai a Configurações quando quiser; ao voltar, o componente
  // monta de novo, `currentUser` já vem atualizado pelo refreshUser do handleSaveTeam,
  // e o bloqueio cai sozinho.
  const workloadAlert = isWorkloadBlocking ? (
    <Alert
      type="warning"
      showIcon
      style={{ marginTop: 12, marginBottom: 12 }}
      message="Carga horária da equipe não configurada"
      description={
        <p style={{ margin: 0 }}>
          Este produto consome tempo de mão de obra produtiva, e o custo desse tempo vem
          do <strong>custo por minuto</strong> da equipe (mão de obra mensal dividida pelas
          horas trabalhadas no mês). Sem a carga horária cadastrada não existe esse
          divisor, então o preço não pode ser calculado — e o produto não pode ser salvo.
          Configure a carga horária da equipe produtiva
          em <strong>Configurações &gt; Equipe</strong> e volte a esta tela.
        </p>
      }
    />
  ) : null

  // --- Pricing Engine (V2) ---------------------------------------------------
  const doProductCalc = useCallback(() => {
    // A CONTA mora em `calcularNoMotorDoProduto` (`src/utils/motor-do-produto.ts`) e em lugar nenhum mais: aqui só se grava no estado
    // (`copia-divergente.md`). Os comentários de cada regra foram junto com ela.
    const conta = calcularNoMotorDoProduto({
      currentUser, calcBase, productType, productPriceInfo, additionalIrpjPercent, customTaxPercent, isLRorLP, modo, itemsPriceSum,
    })
    if (conta) setProductPriceInfo((prev) => ({ ...prev, ...conta.campos, ...conta.porProdutoDoServico(prev) }))
  }, [
    currentUser,
    calcBase.laborCostMonthly,
    calcBase.structurePct,
    // Sem esta dependência o `doProductCalc` memoizado não recalcularia ao mudar a MO
    // Produtiva do tenant — o preço de revenda ficaria preso ao valor da renderização anterior.
    calcBase.laborPercent,
    calcBase.taxPct,
    calcBase.isMei,
    calcBase.indirectLaborPct,
    calcBase.fixedExpensePct,
    calcBase.variableExpensePct,
    calcBase.financialExpensePct,
    itemsPriceSum,
    productPriceInfo.productWorkloadInMinutes,
    productPriceInfo.rtReservePercent,
    productPriceInfo.productProfitPercent,
    productPriceInfo.productProfitPercentByProduct,
    productPriceInfo.salesCommissionPercent,
    productPriceInfo.salesCommissionPercentByProduct,
    productForm,
    customTaxPercent,
    additionalIrpjPercent,
    modo,
  ])

  useEffect(() => {
    if (currentUser) {
      doProductCalc()
    }
  }, [currentUser, product, updatedProductPriceInfoWithApi, productItemsData, doProductCalc])

  const handleQuantityChange = (id: string, value: string) => {
    const updatedProductItemsData = productItemsData.map((item) => {
      if (item.id === id) {
        const newQuantity = parseFloat(value) || null

        return {
          ...item,
          quantity: newQuantity,
          price: calculateItemPrice(newQuantity, item.referencePrice, item.referenceQuantity),
        }
      }
      return item
    })

    setProductItemsData(updatedProductItemsData)
  }

  const goBack = () => {
    router.back()
  }

  const handleClickAddItem = async (value: { item: string }) => {
    const itemAlreadyAdd = productItemsData.find(({ id }) => id === value.item)

    if (itemAlreadyAdd) {
      return messageApi.open({
        type: 'error',
        content: 'Item já adicionado ao produto.',
      })
    }

    const selectedItem = items.find(({ id }) => id === value.item)
    if (!selectedItem) return

    const unitType = (selectedItem.unitType || 'UN').toString().toUpperCase()
    const recipeQty = 1
    // Usar cost_net/measure_quantity (regimes com impostos no item) ou cost_per_base_unit como referência de preço (LÍQUIDO)
    const regimeCtx = currentUser?.taxableRegime
    const hasItemTaxesCtx = regimeCtx === 'LUCRO_REAL' || regimeCtx === 'LUCRO_PRESUMIDO' || regimeCtx === 'SIMPLES_HIBRIDO'
    const itemCostNet = Number((selectedItem as any).cost_net) || 0
    const itemCostGross = Number((selectedItem as any).cost_gross) || 0
    const itemMeasureQty = Number((selectedItem as any).measure_quantity) || 1
    const costPerUnitRaw = (hasItemTaxesCtx && itemCostNet > 0)
      ? itemCostNet / itemMeasureQty
      : Number((selectedItem as any).cost_per_base_unit) || Number(selectedItem.price) || 0
    const costPerUnit = Math.max(0.01, costPerUnitRaw)
    // BRUTO unitário (apenas regimes com impostos no item). Fallback: usa o líquido se cost_gross não persistido.
    const grossPerUnit = hasItemTaxesCtx
      ? (itemCostGross > 0 ? itemCostGross / itemMeasureQty : costPerUnit)
      : costPerUnit
    // Custo do item na receita = quantidade × custo por unidade base. referenceQuantity=1 pois referencePrice já é por unidade base.
    const priceForSchema = Math.max(0.01, recipeQty * costPerUnit)

    const newItem = await itemProductSchema.validate({
      ...selectedItem,
      unitType,
      quantity: recipeQty,
      price: priceForSchema,
      referencePrice: costPerUnit,
      referenceQuantity: 1,
    }) as IItemProductModel & { stockQuantity?: number | null; stockUnit?: string; grossPerUnit?: number; hasItemTaxes?: boolean; unitGross?: number; unitNet?: number }

    newItem.stockQuantity = (selectedItem as any).stockQuantity ?? null
    newItem.stockUnit = (selectedItem as any).stockUnit ?? unitType
    newItem.grossPerUnit = grossPerUnit
    newItem.hasItemTaxes = hasItemTaxesCtx
    // Valores unitários cheios do item (vindos do form do item: "Valor unitário" e "Valor custo líquido").
    newItem.unitGross = itemCostGross > 0 ? itemCostGross : (Number(selectedItem.price) || 0)
    newItem.unitNet = hasItemTaxesCtx && itemCostNet > 0 ? itemCostNet : undefined

    setProductItemsData((prev: IItemProductModel[]) => [...prev, newItem])
    setItems((prev: IItemModel[]) => prev.filter((item: IItemModel) => item.id !== value.item))

    itemsForm.resetFields()
  }

  const validateProductItems = () => {
    if (productType === 'REVENDA' && !isCalcTypeService) {
      // A MENSAGEM mudou junto com o seletor. Ela mandava "selecionar o item de revenda"
      // num formulário que não tem mais onde selecionar — instrução impossível de cumprir.
      // O bloqueio em si NÃO mudou: continua sendo um OU, e composição preenchida passa.
      if (!baseItemId && !productItemsData.length) {
        return 'Adicione o item de revenda à composição do produto — ele é a base do custo.'
      }
      return undefined
    }

    if (!productItemsData.length) {
      return 'Adicione pelo menos um item ao produto.'
    }

    const allItemsValid = productItemsData.every(({ quantity }) => quantity > 0)

    if (!allItemsValid) {
      return 'O campo "Quantidade" é obrigatório em todos os itens'
    }
  }

  // ── O SALVAR DO ORÇAMENTO: grava NO ORÇAMENTO (a rota da precificação), nunca em `products`, e só sem falta nomeada ──────────────
  // o fiscal do orçamento é o PRESET, sempre (11/11/2026): a tela não o pergunta e não o mostra
  const fiscalDaTela = () => ({ ...PRESET_DA_COMERCIALIZACAO })
  // a referência ainda não lida (null) no LR/LP não é "tem": só a leitura que achou a UF e o ICMS libera o salvar
  const referenciaExigida = (): boolean | null => (ehOrcamentoDeIndustrializacao && isLRorLP ? referenciaDoTenant === true : null)
  const faltasDoOrcamento = orcamento
    ? faltasDaPrecificacao({ orcamento, fiscal: fiscalDaTela(), aliquotaDoNcm: null, referenciaDoTenant: referenciaExigida(), custoDoMotor: Number(productPriceInfo?.productCost) || 0 })
    : []
  const salvarOrcamento = async () => {
    if (!orcamento || !onSalvarOrcamento || salvandoOrcamento) return
    if (isWorkloadBlocking) {
      setRecusasDoOrcamento([FALTA_DA_CARGA_HORARIA])
      return
    }
    doProductCalc()
    const faltas = faltasDaPrecificacao({ orcamento, fiscal: fiscalDaTela(), aliquotaDoNcm: null, referenciaDoTenant: referenciaExigida(), custoDoMotor: Number(productPriceInfo.productCost) || 0 })
    const valorDeVenda = finalPriceWithTaxesRef.current
    if (!(valorDeVenda > 0)) faltas.push(FALTA_DO_PRECO_FORMADO)
    // a interna que se grava (20261110000001), ao centavo, e a recusa quando ela diverge do valor precificado
    const interna = valorDeVenda > 0 ? internaParaGravar(operacaoInternaRef.current, valorPrecificadoRef.current) : null
    if (interna && 'falta' in interna) faltas.push(interna.falta)
    if (faltas.length) { setRecusasDoOrcamento(faltas); return }
    setSalvandoOrcamento(true)
    try {
      const recusas = await onSalvarOrcamento({
        ...fiscalDaTela(),
        valor_venda: valorDeVenda,
        valor_operacao_interna: interna && 'interna' in interna ? interna.interna : 0,
        comissao_percentual: Number(productPriceInfo.salesCommissionPercent) || 0,
        reserva_tecnica_percentual: Number(productPriceInfo.rtReservePercent) || 0,
        lucro_projetado_percentual: Number(productPriceInfo.productProfitPercent) || 0,
      })
      setRecusasDoOrcamento(recusas ?? [])
      if (!recusas) messageApi.success('Precificação do orçamento salva.')
    } finally {
      setSalvandoOrcamento(false)
    }
  }

  const handleSaveProduct = async () => {
    // O modo orçamento NUNCA chega ao caminho de `products` abaixo.
    if (orcamento) return salvarOrcamento()
    // Guard anti double-submit (BUG-PRODUCT-ITEMS-DUP): saves concorrentes duplicavam os
    // product_items (dobrando o CMV). Reforçado por upsert + UNIQUE(product_id,item_id).
    if (savingProduct) return

    // O custo da mão de obra produtiva deste produto vem do custo POR MINUTO da equipe.
    // Sem carga horária configurada esse divisor não existe, e salvar gravaria um preço
    // formado sobre MO produtiva zerada. Bloqueia na origem — orçamento, pedido e venda
    // só consomem preço já gravado. Produto de revenda (ou sem tempo de MO) não é
    // afetado: `isWorkloadBlocking` já é false nesses casos.
    if (isWorkloadBlocking) {
      messageApi.error('Configure a carga horária da equipe produtiva em Configurações → Equipe antes de salvar o produto.')
      return
    }

    doProductCalc()
    setSavingProduct(true)

    try {
      const validateProductItemsError = validateProductItems()

      if (validateProductItemsError) {
        return messageApi.open({
          type: 'error',
          content: validateProductItemsError,
        })
      }

      await productForm.validateFields()

      // Par CST × cClassTrib incompatível é rejeitado pela SEFAZ. Salvar gravaria
      // um documento que a nota recusa, e o usuário só descobriria na emissão.
      if (bloqueioDaClassificacao) {
        return messageApi.open({ type: 'error', content: bloqueioDaClassificacao })
      }

      const values = productForm.getFieldsValue()
      const tenantId = await getTenantId()
      if (!tenantId) {
        return messageApi.error('Não foi possível identificar o tenant.')
      }

      const yieldQty = Number(values.quantity) || 1
      const isCalcService = currentUser?.calcType === CALC_TYPE_ENUM.SERVICE

      // DIRETO: salvar exatamente o valor que aparece em "Preço de Venda por Unidade" na tela
      // Sem recalcular — o valor já foi calculado pelo doProductCalc (preview)
      const isLucroRealSave = currentUser?.taxableRegime === 'LUCRO_REAL'
      const isLucroPresumidoSave = currentUser?.taxableRegime === 'LUCRO_PRESUMIDO'
      const isSHSave = currentUser?.taxableRegime === 'SIMPLES_HIBRIDO'
      const isLRorLPSave = isLucroRealSave || isLucroPresumidoSave || isSHSave
      // ITEM 1.5: produto PRODUZIDO (receita) fraciona o preço pela Quantidade de produção
      // (ex.: R$ 150,00 ÷ 2,5 = R$ 60,00/kg). Revenda NÃO fraciona (quantity = estoque).
      // Divisor = 1 quando revenda ou quantidade ≤ 1 (1:1). O ProductPrice já emite o preço
      // por unidade via ref (finalPriceWithTaxesRef / salePriceBaseRef); aqui alinhamos os
      // fallbacks e o snapshot do valor precificado ao MESMO divisor.
      const yieldDivisorSave = (productType === 'PRODUZIDO' && yieldQty > 0) ? yieldQty : 1
      const terceirizadasSum = isLRorLPSave
        ? (freightValue || 0) + (insuranceValue || 0) + (accessoryExpensesValue || 0)
        : 0
      const salePriceToSave = ((Number(productPriceInfo.totalProductPrice) || 0) + terceirizadasSum) / yieldDivisorSave
      const costTotalToSave = Number(productPriceInfo.productCost) || 0

      // Usa o valor calculado em tempo real pelo ProductPrice (via ref) — inclui valorPrecificado
      // grossado com ICMS/PIS-COFINS + terceirizadas + IBS/CBS/IS/IPI, igual ao exibido na tela
      const finalSalePriceForSave = finalPriceWithTaxesRef.current > 0
        ? finalPriceWithTaxesRef.current
        : salePriceToSave

      // `base_item_id` sem seletor: derivado da composição, preservando o gravado quando
      // não há o que derivar. Ver `base-item-derivado.ts` — e a medição que mostrou que o
      // caso real é ZERO itens (32 produtos), não "dois ou mais" (0 produtos).
      const _baseItemDerivado = derivarBaseItemId({
        productType,
        itens: productItemsData.map((i) => ({ id: String(i.id) })),
        baseItemIdAtual: baseItemId,
      })

      let autoCode = values.code
      if (!autoCode) {
        const { data: lastProduct } = await supabase
          .from('products')
          .select('code')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
          .limit(50)

        let maxNum = 1000
        if (lastProduct) {
          for (const p of lastProduct) {
            const num = parseInt(p.code, 10)
            if (!isNaN(num) && num > maxNum) maxNum = num
          }
        }
        autoCode = String(maxNum + 1)
      }

      const productData: Record<string, any> = {
        tenant_id: tenantId,
        code: autoCode,
        name: values.name,
        description: values.description || null,
        section_id: values.section_id || null,
        commission_table_id: values.commission_table_id || null,
        yield_quantity: yieldQty,
        yield_unit: values.unitType || 'UN',
        unit: values.unitType || 'UN',
        sale_price: finalSalePriceForSave,
        cost_total: costTotalToSave,
        profit_percent: Number(productPriceInfo.productProfitPercent) || 0,
        commission_percent: Number(productPriceInfo.salesCommissionPercent) || 0,
        rt_reserve_percent: Number(productPriceInfo.rtReservePercent) || 0,
        product_type: productType,
        // DERIVADO da composição, não mais de um seletor (17/09/2026). Um item → é ele;
        // zero ou dois e mais → preserva o gravado, que num produto novo é `null`.
        // Apagar o que já existe quebraria a sincronização de estoque de 32 produtos
        // medidos — ver `base-item-derivado.ts`.
        base_item_id: _baseItemDerivado.baseItemId,
        ncm_code: values.ncm_code || null,
        nbs_code: values.nbs_code || null,
        updated_at: new Date().toISOString(),
      }

      if (isRevendaFromDb) {
        productData.status = 'ACTIVE'
      }

      let productId = values.id

      if (productId) {
        const { error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', productId)

        if (error) throw error
      } else {
        const { data: created, error } = await supabase
          .from('products')
          .insert(productData as any)
          .select('id')
          .single()

        if (error) throw error
        productId = created.id
      }

      // finalSalePriceForSave já calculado antes do insert (inclui IBS/CBS/IS/IPI para LR/LP/SH)

      const extraFields: Record<string, any> = {}
      // MOTOR 2 (Simples Nacional / MEI): `products.custom_tax_percent` é a ÚNICA fonte de
      // onde o Motor RRO lê a alíquota do DAS para montar as Etapas 7 e 13. Sem override
      // manual a tela exibe a alíquota AUTOMÁTICA do Anexo (`calcBase.taxPct`, a mesma que
      // product-price.component.tsx usa em `taxPctDisplay` e que doProductCalc usa em
      // `effectiveTaxPct`) — mas ela nunca era persistida: a coluna ficava `null` e a
      // cascata mostrava o DAS zerado. Aqui a efetiva é GRAVADA: override manual quando
      // houver, senão a automática do Anexo (0 no MEI, que mantém a linha presente e zerada).
      // Demais regimes: comportamento idêntico ao anterior (só grava se houver override).
      extraFields.custom_tax_percent = resolveProductTaxPercentToPersist({
        isMei: !!calcBase.isMei,
        isSimples: currentUser.taxableRegime === 'SIMPLES_NACIONAL',
        customTaxPercent,
        autoTaxPercent: calcBase.taxPct,
      })
      extraFields.additional_irpj_percent = additionalIrpjPercent || 0
      // R11 — os acréscimos NÃO são mais alimentados pelo cadastro. "Acréscimos pertencem ao
      // orçamento, não ao produto", e os campos do produto "deixam de ser alimentados DAQUI
      // PARA A FRENTE". As colunas continuam no banco e continuam sendo LIDAS: a precedência
      // documento × cadastro de `resolveAccessoriesSource` depende delas, e os produtos que
      // já têm valor permanecem como estão — SEM MIGRAÇÃO RETROATIVA, que é a outra metade
      // da mesma regra. Gravar `0` aqui seria migração retroativa disfarçada de save.
      if (isLRorLPorSH) {
        extraFields.icms_pct = icmsPct || 0
        extraFields.pis_cofins_pct = pisCofinsLRPct || 0
        // O fator legado FICA — a migração é aditiva e o produto com fator 50 não
        // pode perder o valor. Ele deixa de ser entrada, não de existir.
        extraFields.iva_dual_reduction_factor = ivaDualReductionFactor ?? null
        // A classificação fiscal e as DUAS reduções derivadas dela.
        extraFields.cst_ibs_cbs_code = classificacao.cstIbsCbsCode
        extraFields.cclass_trib = classificacao.cclassTrib
        extraFields.cclass_trib_origem = classificacao.cclassTribOrigem
        extraFields.cclass_trib_source_published_at = classificacao.cclassTribSourcePublishedAt
        extraFields.iva_reduction_ibs_pct = classificacao.ivaReductionIbsPct
        extraFields.iva_reduction_cbs_pct = classificacao.ivaReductionCbsPct
        // ADR-022: snapshota a referência BRUTA (fonte da verdade junto com o fator). O motor
        // deriva a efetiva = referência × (1 − fator) de forma idempotente. NULL = sem snapshot.
        extraFields.ibs_reference_pct = ibsReferencePct > 0 ? ibsReferencePct : null
        extraFields.cbs_reference_pct = cbsReferencePct > 0 ? cbsReferencePct : null
        // Impostos IBS/CBS/IS/IPI — usar basePrice capturado do ProductPrice via ref.
        // Bases individualizadas da Conferência Fiscal: OpDentro = preço por dentro SEM
        // Desp. Acessórias. As terceirizadas (frete + seguro + despesas acessórias) entram
        // como Desp. Acessórias (compõem base de IBS/CBS e IPI, não a do IS). ICMS Compl.
        // não se aplica no cadastro (depende do destinatário). Fonte única computeIvaDualOutside.
        const _saleBase = salePriceBaseRef.current > 0 ? salePriceBaseRef.current : salePriceToSave
        const _opDentro = Math.max(0, _saleBase - terceirizadasSum)
        // PC-BUG-FATOR-REDUCAO-002 Ponto 1: aplica o fator de redução SOBRE a alíquota bruta de
        // IBS/CBS (efetiva = bruta × (1 − fator)) ao gravar ibs_value/cbs_value. IPI/IS intactos.
        const _ibsEff2 = resolveIvaDualEffectiveRate(ibsPct, reducoes.ibs) || 0
        const _cbsEff2 = resolveIvaDualEffectiveRate(cbsPct, reducoes.cbs) || 0
        const _iva2 = computeIvaDualOutside({
          opInterna: _opDentro,
          despAcessorias: terceirizadasSum,
          icmsPct: icmsPct || 0,
          pisCofinsPct: pisCofinsLRPct || 0,
          issPct: 0, // EPIC-POR-FORA-V3/S1: produto é mercadoria (ISS=0). Campo ISS removido da UI.
          isPct: isPct || 0,
          ibsPct: _ibsEff2,
          cbsPct: _cbsEff2,
          ipiPct: ipiPct || 0,
        })
        extraFields.taxes_launched = true
        extraFields.is_pct = isPct || 0
        extraFields.is_value = _iva2.isValue
        extraFields.ibs_pct = ibsPct || 0
        extraFields.ibs_value = _iva2.ibsValue
        extraFields.cbs_pct = cbsPct || 0
        extraFields.cbs_value = _iva2.cbsValue
        extraFields.ipi_pct = ipiPct || 0
        extraFields.ipi_value = _iva2.ipiValue
        // NULL = não classificado, e é assim que fica quando ninguém escolheu. Gravar o
        // padrão aqui apagaria a diferença entre "escolhido" e "nunca escolhido".
        extraFields.ibs_base_code = ibsBaseCode
        extraFields.cbs_base_code = cbsBaseCode
        extraFields.is_base_code = isBaseCode
        extraFields.ipi_base_code = ipiBaseCode
        // R3 — o `c` desta construção, CONGELADO com o preço. É FATO HISTÓRICO, não
        // referência viva (`docs/regras/fato-vs-referencia.md`): decompor um preço antigo
        // com o `c` de hoje reescreve o passado, e o `c` muda toda vez que alguém edita
        // IBS, CBS, IS, IPI ou o fator de redução. A coluna existia desde a migração
        // `20260915000003` e NADA a gravava — inclusive em produtos cujo preço já tinha sido
        // formado com `c` ≠ 0.
        //
        // `null` quando a matriz não governou: é ausência de regra, nunca "o coeficiente é
        // zero". A CHECK do banco aceita `NULL` ou `[0, 1)`, e é o que o motor devolve.
        extraFields.external_ops_coefficient = externalOpsCoefficientRef.current
        extraFields.sale_price_base = _saleBase
        extraFields.sale_price_after_taxes = finalSalePriceForSave
        // ITEM 1.5: snapshot do valor precificado também por unidade de produção (mesmo divisor).
        extraFields.valor_precificado_icms_piscofins = (Number(productPriceInfo.totalProductPrice) || 0) / yieldDivisorSave

        // EPIC-POR-FORA-V2: ICMS-ST / DIFAL avançados (fonte única icms-st-difal.ts).
        // Bases incluem frete+seguro (terceirizadas) e o IPI(R$) apurado acima. Sem desconto aqui
        // (cadastro) — o recálculo sobre a âncora pós-desconto ocorre no Motor RRO (orçamento).
        const _icmsSt = icmsStActive
          ? computeIcmsSt({
              opInterna: _opDentro,
              despAcessorias: terceirizadasSum,
              ipiValue: _iva2.ipiValue,
              mvaOriginalPct,
              alqInternaDestinoPct: icmsAlqInternaDestinoPct,
              alqInterestadualOrigemPct: icmsAlqInterestadualOrigemPct,
              interestadual: stDifalInterestadual,
            })
          : null
        const _difal = difalActive
          ? computeDifal({
              opInterna: _opDentro,
              despAcessorias: terceirizadasSum,
              ipiValue: _iva2.ipiValue,
              alqInternaDestinoPct: icmsAlqInternaDestinoPct,
              alqInterestadualOrigemPct: icmsAlqInterestadualOrigemPct,
              fcpPct: fcpAlqPct,
              baseDupla: difalBaseDupla,
              icmsInternaOrigemPct,
            })
          : null
        extraFields.icms_st_value = _icmsSt ? _icmsSt.icmsSt : 0
        extraFields.difal_value = _difal ? _difal.difal : 0
        extraFields.fcp_value = _difal ? _difal.fcp : 0
      }

      // EPIC-POR-FORA-V3 / S1+S2: a seção superior dos 7 campos % simples foi removida.
      // ICMS-ST/DIFAL/FCP deixam de ser persistidos como % plano (eliminando a dupla contagem
      // com o cálculo completo — ver buildItemTaxRatesFromProduct que também neutraliza na leitura).
      // ISS/IRPJ/CSLL passam a usar o padrão do tenant (IRPJ/CSLL em LR já caem no cálculo estrutural).

      // EPIC-POR-FORA-V2: parâmetros avançados ICMS-ST/DIFAL — BASE 100 DIRETA (sem /100).
      // Acionadores e flags sempre persistidos; alíquotas null quando 0 (= não cadastrado).
      extraFields.icms_st_active = icmsStActive
      extraFields.difal_active = difalActive
      extraFields.st_difal_interestadual = stDifalInterestadual
      extraFields.difal_base_dupla = difalBaseDupla
      extraFields.mva_original_pct = mvaOriginalPct > 0 ? mvaOriginalPct : null
      extraFields.icms_alq_interna_destino_pct = icmsAlqInternaDestinoPct > 0 ? icmsAlqInternaDestinoPct : null
      extraFields.icms_alq_interestadual_origem_pct = icmsAlqInterestadualOrigemPct > 0 ? icmsAlqInterestadualOrigemPct : null
      extraFields.icms_interna_origem_pct = icmsInternaOrigemPct > 0 ? icmsInternaOrigemPct : null
      extraFields.fcp_alq_pct = fcpAlqPct > 0 ? fcpAlqPct : null

      extraFields.recurrence_active = recurrenceActive
      extraFields.recurrence_days = recurrenceActive && recurrenceDays ? recurrenceDays : null
      extraFields.recurrence_message = recurrenceActive && recurrenceMessage ? recurrenceMessage : null
      if (Object.keys(extraFields).length > 0) {
        const { error: extraErr } = await supabase.from('products').update(extraFields).eq('id', productId)
        if (extraErr) console.warn('Could not save recurrence/custom_tax_percent fields:', extraErr.message)
      }

      // BUG-PRODUCT-ITEMS-DUP (31/07/2026, tenant Fernandes): ao editar um produto os itens
      // duplicavam (dobrando o CMV e o preço). Causa: o delete não era verificado e não havia
      // trava de unicidade — em double-submit (ou delete falho) os itens eram re-inseridos.
      // Correção em camadas: (1) checar o erro do delete; (2) deduplicar por item_id antes do
      // insert; (3) UNIQUE(product_id, item_id) no banco (migration 20260731000001).
      const { error: delItemsErr } = await supabase.from('product_items').delete().eq('product_id', productId)
      if (delItemsErr) throw delItemsErr

      if (productItemsData.length > 0) {
        // Dedup defensivo por item_id: garante no máximo 1 linha por item (evita CMV dobrado
        // mesmo se o estado do formulário vier com itens repetidos).
        const seenItemIds = new Set<string>()
        const uniqueItemsData = productItemsData.filter((i) => {
          if (!i.id || seenItemIds.has(i.id)) return false
          seenItemIds.add(i.id)
          return true
        })

        const itemIdsForCost = uniqueItemsData.map(i => i.id)
        const { data: itemsCostData } = await supabase
          .from('items')
          .select('id, cost_per_base_unit')
          .in('id', itemIdsForCost)
        const costByItemId: Record<string, number> = {}
        for (const ic of (itemsCostData || [])) {
          costByItemId[ic.id] = Number(ic.cost_per_base_unit) || 0
        }

        const productItems = uniqueItemsData.map((item) => ({
          product_id: productId,
          item_id: item.id,
          quantity_needed: item.quantity,
          item_cost_gross: item.referencePrice || 0,
          item_cost_net: item.price || 0,
          cost_per_base_unit: costByItemId[item.id] || 0,
        }))

        // upsert com onConflict: se o delete não removeu (RLS/concorrência), atualiza a linha
        // existente em vez de duplicar — a UNIQUE(product_id,item_id) do banco garante a trava.
        const { error: piError } = await supabase
          .from('product_items')
          .upsert(productItems, { onConflict: 'product_id,item_id' })
        if (piError) throw piError
      }

      // Produto PRODUZIDO: garantir registro em estoque (Produtos acabados); quantidade inicial = quantidade de produção
      if (productType === 'PRODUZIDO') {
        const yieldQty = Number(values.quantity) || 0
        const productName = values.name || 'Produto'
        const { data: existingProductStock } = await supabase
          .from('stock')
          .select('id, quantity_current')
          .eq('product_id', productId)
          .eq('stock_type', 'PRODUCT')
          .maybeSingle()
        if (!existingProductStock) {
          const { error: errMudo18 } = await supabase.from('stock').insert({
            tenant_id: tenantId,
            product_id: productId,
            stock_type: 'PRODUCT',
            quantity_current: yieldQty,
            min_limit: values.minLimit ?? 0,
            unit: values.unitType || 'UN',
          })
          if (errMudo18) throw errMudo18
          const { error: errMudo17 } = await supabase.from('products').update({ quantity: yieldQty, updated_at: new Date().toISOString() }).eq('id', productId)
          if (errMudo17) throw errMudo17

          // Baixar insumos: dar baixa nos itens e no estoque de itens/insumos
          if (productItemsData.length > 0 && yieldQty > 0) {
            const createdBy = await getCurrentUserId()
            for (const pi of productItemsData) {
              const quantityUsed = (Number(pi.quantity) || 0) * yieldQty
              if (quantityUsed <= 0) continue
              const itemId = pi.id
              const { data: st } = await supabase
                .from('stock')
                .select('id, quantity_current')
                .eq('item_id', itemId)
                .eq('stock_type', 'ITEM')
                .maybeSingle()
              if (st) {
                const newQty = Math.max(0, (Number(st.quantity_current) || 0) - quantityUsed)
                const { error: errMudo16 } = await supabase.from('stock').update({ quantity_current: newQty, updated_at: new Date().toISOString() }).eq('id', st.id)
                if (errMudo16) throw errMudo16
                if (createdBy) {
                  const { error: errMudo15 } = await supabase.from('stock_movements').insert({
                    stock_id: st.id,
                    delta_quantity: -quantityUsed,
                    reason: `Produção — ${productName}`,
                    created_by: createdBy,
                  })
                  if (errMudo15) throw errMudo15
                }
              }
              const { data: itemRow } = await supabase.from('items').select('quantity, cost_per_base_unit').eq('id', itemId).single()
              if (itemRow) {
                const newItemQty = Math.max(0, (Number(itemRow.quantity) || 0) - quantityUsed)
                const unitCost = Number(itemRow.cost_per_base_unit) || 0
                const newCostTotal = newItemQty * unitCost
                const { error: errMudo14 } = await supabase.from('items').update({ quantity: newItemQty, cost_price: newCostTotal, updated_at: new Date().toISOString() }).eq('id', itemId)
                if (errMudo14) throw errMudo14
              }
            }
          }
        } else {
          const { error: errMudo13 } = await supabase.from('stock').update({
            min_limit: values.minLimit ?? 0,
            updated_at: new Date().toISOString(),
          }).eq('id', existingProductStock.id)
          if (errMudo13) throw errMudo13
          const { error: errMudo12 } = await supabase.from('products').update({ quantity: Number(existingProductStock.quantity_current) || 0, updated_at: new Date().toISOString() }).eq('id', productId)
          if (errMudo12) throw errMudo12
        }
      }

      // Produto REVENDA: atualizar min_limit do estoque do produto
      if (productType === 'REVENDA') {
        const { data: revendaStock } = await supabase
          .from('stock')
          .select('id')
          .eq('product_id', productId)
          .eq('stock_type', 'PRODUCT')
          .maybeSingle()
        if (revendaStock) {
          const { error: errMudo11 } = await supabase.from('stock').update({
            min_limit: values.minLimit ?? 0,
            updated_at: new Date().toISOString(),
          }).eq('id', revendaStock.id)
          if (errMudo11) throw errMudo11
        }
      }

      const normalizedWorkloadMinutes = productPriceInfo.productWorkloadInMinutes || 0

      const { data: calcResult, error: calcError } = await supabase.functions.invoke('calc-tax-engine', {
        body: {
          tenant_id: tenantId,
          product_id: productId,
          sale_scope: saleScope,
          buyer_type: buyerType,
          destination_state: destinationState,
          commission_percent: productPriceInfo.salesCommissionPercent || 0,
          profit_percent: productPriceInfo.productProfitPercent || 0,
          rt_reserve_percent: productPriceInfo.rtReservePercent || 0,
          product_workload_minutes: normalizedWorkloadMinutes,
        },
      })

      // Garantir que sale_price = "Preço de Venda por Unidade" após edge function (que pode sobrescrever)
      if (finalSalePriceForSave > 0) {
        const { error: errMudo10 } = await supabase.from('products').update({ sale_price: finalSalePriceForSave }).eq('id', productId)
        if (errMudo10) throw errMudo10
      }

      // D-A: o destino de cada categoria, congelado junto com o preço. A construção vem do
      // tipo do produto e a segmentação do tenant NESTE INSTANTE — depois disso o valor é
      // fato, e mudar o `calc_type` não reescreve a decomposição deste preço.
      // `as any`: os tipos gerados do Supabase (`database.types`) ainda não conhecem a
      // coluna, e regenerá-los aqui misturaria escopos. A coluna existe — verificada por
      // consulta ao `information_schema` na aplicação da migração.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: errMudo9 } = await (supabase as any).from('products').update({
        destination_snapshot: buildDestinationSnapshot({
          construction: productType === 'REVENDA' ? 'REVENDA' : 'INDUSTRIALIZACAO',
          tenantCalcType: currentUser?.calcType,
        }),
      }).eq('id', productId)
      if (errMudo9) throw errMudo9

      const calcFailed = !!calcError || !calcResult?.success
      if (calcFailed) {
        const is401 =
          typeof (calcError as any)?.context?.status === 'number' &&
          (calcError as any).context.status === 401
        const rawMsg =
          (calcResult as any)?.error || calcError?.message || 'Erro no motor fiscal.'
        const friendlyMsg = is401
          ? 'Não autorizado (sessão expirada?). Faça login novamente.'
          : rawMsg.includes('non-2xx') || rawMsg.includes('401')
            ? 'Servidor retornou erro. Se persistir, faça login novamente.'
            : rawMsg
        messageApi.open({
          type: 'warning',
          content: `Produto e itens salvos. Não foi possível atualizar o cálculo de impostos: ${friendlyMsg}`,
          duration: 8,
        })
      } else {
        messageApi.open({
          type: 'success',
          content: 'Produto salvo!',
        })
      }

      router.push(ROUTES.PRODUCTS)
    } catch (ex: any) {
      console.error('Erro ao salvar produto:', ex)
      messageApi.open({
        type: 'error',
        content: ex?.message || 'Preencha todos os campos corretamente para salvar o produto.',
      })
    } finally {
      setSavingProduct(false)
    }
  }

  const handleClickRemoveItem = (id: string) => {
    setProductItemsData((prev: IItemProductModel[]) =>
      prev.filter((item: IItemProductModel) => item.id !== id)
    )
  }

  const handleClickUpdateItemPrice = async (id: string) => {
    try {
      // Item 2 (Relatório 24/07): relê o VALOR DE COMPRA do item direto do cadastro
      // (itemsFromApi = fonte de verdade), respeitando Bruto vs Líquido POR ITEM. Antes
      // buscava em `items` (pool que perde os itens já adicionados) e usava só
      // cost_per_base_unit, ignorando a regra de imposto recuperável no item — o que
      // corrompia o valor. A lógica aqui espelha exatamente a do handleSelectItem (add).
      const apiItem =
        (itemsFromApi as any[])?.find((i) => i.id === id) ??
        (items as any[]).find((i) => i.id === id)
      if (!apiItem) {
        messageApi.open({ type: 'error', content: 'Item de referência não encontrado no cadastro.' })
        return
      }

      const regimeCtx = currentUser?.taxableRegime
      const hasItemTaxesCtx =
        regimeCtx === 'LUCRO_REAL' || regimeCtx === 'LUCRO_PRESUMIDO' || regimeCtx === 'SIMPLES_HIBRIDO'
      const itemCostNet = Number(apiItem.cost_net) || 0
      const itemCostGross = Number(apiItem.cost_gross) || 0
      const itemCostPrice = Number(apiItem.cost_price) || 0
      const itemMeasureQty = Number(apiItem.measure_quantity) || 1
      // Valor de COMPRA por unidade base, item a item:
      //  - regimes com imposto no item (LR/LP/SH): usa o LÍQUIDO (cost_net ÷ measure_qty);
      //  - demais regimes: usa cost_per_base_unit. Fallback: price/cost_price.
      const costPerUnitRaw =
        hasItemTaxesCtx && itemCostNet > 0
          ? itemCostNet / itemMeasureQty
          : Number(apiItem.cost_per_base_unit) || Number(apiItem.price) || 0
      const refPrice = Math.max(0.01, costPerUnitRaw)
      // BRUTO por unidade (só regimes com imposto no item; fallback = líquido).
      const grossPerUnit = hasItemTaxesCtx
        ? itemCostGross > 0
          ? itemCostGross / itemMeasureQty
          : refPrice
        : refPrice

      const updatedItemsData = productItemsData.map((item) => {
        if (item.id === id) {
          const qty = Number(item.quantity) || 1
          return {
            ...item,
            referencePrice: refPrice,
            referenceQuantity: 1,
            price: Math.max(0.01, qty * refPrice),
            grossPerUnit,
            hasItemTaxes: hasItemTaxesCtx,
            unitGross: itemCostGross > 0 ? itemCostGross : Number(apiItem.price) || itemCostPrice || 0,
            unitNet: hasItemTaxesCtx && itemCostNet > 0 ? itemCostNet : undefined,
          }
        }

        return item
      })

      setProductItemsData(updatedItemsData)
    } catch {
      messageApi.open({
        type: 'error',
        content: 'Não foi possível atualizar o valor do item.',
      })
    }
  }

  const yieldQty = Number(productForm.getFieldValue('quantity')) || 1

  const getUnitLabel = (unitType: string | undefined) =>
    (UNIT_TYPE as Record<string, string>)[unitType?.toUpperCase() || ''] || unitType || 'Unidade'

  const columns: ColumnsType<IItemProductModel> = [
    {
      title: 'Nome',
      dataIndex: 'name',
      key: 'name',
      width: '22%',
      render: (text, record) => {
        const r = record as IItemProductModel & { unitGross?: number; unitNet?: number; hasItemTaxes?: boolean }
        return (
          <div>
            <div style={{ fontWeight: 500 }}>{text}</div>
            {r.unitGross != null && (
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                Valor unitário (Bruto): <strong>R$ {getMonetaryValue(r.unitGross)}</strong>
                {r.unitNet != null && (
                  <> · Custo líquido: <strong style={{ color: '#B42318' }}>R$ {getMonetaryValue(r.unitNet)}</strong></>
                )}
              </div>
            )}
          </div>
        )
      },
    },
    {
      title: 'Qtd. por unidade',
      dataIndex: 'quantity',
      key: 'quantity',
      width: '16%',
      render: (text, record) => {
        const unit = (record.unitType || 'UN').toUpperCase()
        const isIntUnit = ['ML', 'L', 'G', 'KG', 'M', 'CM', 'MM', 'KM', 'M2', 'M3'].includes(unit)
        return (
          <Input
            key={record.id}
            value={text}
            type="number"
            step={isIntUnit ? '1' : '0.01'}
            min={isIntUnit ? '1' : '0.01'}
            onChange={(e) => handleQuantityChange(record.id, isIntUnit ? String(Math.round(Number(e.target.value) || 0) || 1) : e.target.value)}
            suffix={getUnitLabel(record.unitType)}
          />
        )
      },
    },
    {
      title: 'Qtd. Total',
      key: 'totalQty',
      width: '14%',
      render: (_, record) => {
        const total = (record.quantity || 0) * yieldQty
        return (
          <span style={{ background: 'rgba(255,255,255,0.06)', padding: '4px 8px', borderRadius: 4, fontSize: 13 }}>
            {total % 1 === 0 ? total : total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {getUnitLabel(record.unitType)}
          </span>
        )
      },
    },
    {
      title: 'Bruto',
      key: 'grossUnit',
      width: '12%',
      render: (_, record) => {
        const r = record as IItemProductModel & { grossPerUnit?: number; hasItemTaxes?: boolean }
        if (!r.hasItemTaxes) return <span style={{ color: '#94a3b8' }}>—</span>
        const totalGross = (r.grossPerUnit || 0) * (record.quantity || 0)
        return `R$ ${getMonetaryValue(totalGross)}`
      },
    },
    {
      title: 'Líquido',
      dataIndex: 'price',
      key: 'price',
      width: '12%',
      render: (value) => `R$ ${getMonetaryValue(value)}`,
    },
    {
      title: 'Ações',
      key: 'action',
      // Item 1 (Relatório 24/07): ações exibidas apenas como ÍCONES (com tooltip no
      // hover), reduzindo a largura da coluna e eliminando o scroll horizontal. Fixada
      // à direita para permanecer sempre visível.
      fixed: 'right',
      width: 90,
      align: 'right',
      render: (_, { id }: IItemProductModel) => (
        <Space size={4} style={{ whiteSpace: 'nowrap' }}>
          {isEditingMode && (
            <Tooltip title="Atualizar valor item">
              <Button
                onClick={() => handleClickUpdateItemPrice(id)}
                type="text"
                icon={<SyncOutlined />}
                aria-label="Atualizar valor item"
              />
            </Tooltip>
          )}

          <Popconfirm title="Tem certeza?" onConfirm={() => handleClickRemoveItem(id)}>
            <Tooltip title="Excluir">
              <Button type="text" danger icon={<DeleteOutlined />} aria-label="Excluir" />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  // No orçamento, os itens são as esquadrias calculadas, SÓ LEITURA: mudar um item é no orçamento, e recalcular.
  const dinheiroOuTraco = (v: number | null | undefined) => (v == null ? '—' : `R$ ${getMonetaryValue(v)}`)
  const itemDoOrcamento = (id: string) => orcamento?.itens.find((i) => i.id === id)
  const colunasDoOrcamento: ColumnsType<IItemProductModel> = [
    { title: 'Esquadria', dataIndex: 'name', key: 'name' },
    { title: 'Quantidade', dataIndex: 'quantity', key: 'quantity', align: 'right' },
    { title: 'Bruto', key: 'bruto', align: 'right', render: (_, r) => dinheiroOuTraco(itemDoOrcamento(String(r.id))?.custo_bruto_materiais) },
    { title: 'Líquido', key: 'liquido', align: 'right', render: (_, r) => dinheiroOuTraco(itemDoOrcamento(String(r.id))?.custo_liquido_materiais) },
    {
      title: 'Fabricação', key: 'fabricacao', align: 'right', render: (_, r) => {
        const i = itemDoOrcamento(String(r.id))
        return i?.tempo_fabricacao_min == null ? '—' : `${i.tempo_fabricacao_min.toLocaleString('pt-BR')} min · ${dinheiroOuTraco(i.custo_fabricacao)}`
      },
    },
    { title: 'Total', key: 'total', align: 'right', render: (_, r) => dinheiroOuTraco(itemDoOrcamento(String(r.id))?.custo_liquido_total) },
  ]
  const estadoDoOrcamento = orcamento ? estadoDoCalculo(orcamento) : null
  const reconciliacao = orcamento && estadoDoOrcamento === 'completo'
    ? reconciliacaoNaTela(orcamento.itens, Number(productPriceInfo?.productCost) || 0)
    : null
  const avisosDoOrcamento = orcamento ? (
    <div data-avisos-do-orcamento="" style={{ marginTop: 16 }}>
      {estadoDoOrcamento !== 'completo' && (
        <Alert type="warning" showIcon data-estado-do-calculo={estadoDoOrcamento}
          message={FRASE_DO_ESTADO[estadoDoOrcamento as Exclude<typeof estadoDoOrcamento, 'completo'>]}
          action={onRecalcularOrcamento && estadoDoOrcamento !== 'sem_itens'
            ? <Button size="small" onClick={() => { void onRecalcularOrcamento() }}>Recalcular</Button> : undefined} />
      )}
      {reconciliacao && (
        <div data-reconciliacao={reconciliacao.fecha ? 'fecha' : 'nao-fecha'} style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
          Soma das linhas do orçamento (líquido + fabricação): <strong>R$ {getMonetaryValue(reconciliacao.somaDasLinhas)}</strong>
          {' · '}custo do produto na precificação: <strong>R$ {getMonetaryValue(reconciliacao.custoDoMotor)}</strong>
          {reconciliacao.fecha ? ' — fecham.' : ' — NÃO fecham.'}
        </div>
      )}
      {faltasDoOrcamento.length > 0 && (
        <Alert type="error" showIcon style={{ marginTop: 8 }} data-faltas-do-orcamento=""
          message="O preço do orçamento não pode ser gravado. Falta:"
          description={<ul style={{ margin: 0, paddingLeft: 18 }}>{faltasDoOrcamento.map((f) => <li key={f}>{f}</li>)}</ul>} />
      )}
      {recusasDoOrcamento.length > 0 && (
        <Alert type="error" showIcon style={{ marginTop: 8 }} data-recusas-do-orcamento=""
          message="O orçamento não foi salvo."
          description={<ul style={{ margin: 0, paddingLeft: 18 }}>{recusasDoOrcamento.map((f) => <li key={f}>{f}</li>)}</ul>} />
      )}
    </div>
  ) : null

  // Frente 2 (mobile): lista compacta + Drawer dos itens, reusando os MESMOS handlers
  // das columns. Passada aos 3 subcomponentes; cada um a usa só quando isMobile (≤639).
  const productItemsMobileList = (
    <ProductItemsMobileList
      items={productItemsData}
      yieldQty={yieldQty}
      isEditingMode={isEditingMode}
      handleQuantityChange={handleQuantityChange}
      handleClickUpdateItemPrice={handleClickUpdateItemPrice}
      handleClickRemoveItem={handleClickRemoveItem}
    />
  )

  const handleChangePrecificationInputs = (event: ChangeEvent<HTMLInputElement>) => {
    event.preventDefault()

    setProductPriceInfo((prev) => ({
      ...prev,
      [event.target.name]: Number(event.target.value),
    }))
  }

  const filterOption = (input: string, option: { children: string }) =>
    (option?.children ?? '').toLowerCase().includes(input.toLowerCase())

  // EPIC-POR-FORA-V3: parâmetros ICMS-ST/DIFAL/FCP repassados ao card de preço para SOMAR
  // (apenas exibição) ao preço final ao cliente — sem alterar o cálculo de lucro/desconto/comissão.
  const advancedTaxParams = useMemo(() => ({
    icmsStActive,
    difalActive,
    stDifalInterestadual,
    difalBaseDupla,
    mvaOriginalPct,
    icmsAlqInternaDestinoPct,
    icmsAlqInterestadualOrigemPct,
    icmsInternaOrigemPct,
    fcpAlqPct,
  }), [icmsStActive, difalActive, stDifalInterestadual, difalBaseDupla, mvaOriginalPct, icmsAlqInternaDestinoPct, icmsAlqInterestadualOrigemPct, icmsInternaOrigemPct, fcpAlqPct])

  // EPIC-POR-FORA-V3: seção "Alíquotas tributárias adicionais (avançado)" — renderizada ACIMA do
  // card de Lucro Líquido / Preço de Venda (via prop advancedTaxesSection do ProductPrice).
  const advancedTaxesSection = (
    <details style={{ marginTop: 24, padding: 16, background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
      <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#475569' }}>
        🧾 Alíquotas tributárias adicionais (avançado)
      </summary>
      <div style={{ fontSize: 12, color: '#64748b', marginTop: 8, marginBottom: 12 }}>
        ICMS-ST, DIFAL e ICMS Complementar com cálculo completo (base capturada automaticamente do preço montado). Quando preenchidos, somam ao preço de venda exibido abaixo. Deixe os acionadores desligados para usar o padrão do tenant.
      </div>
      <div style={{ marginTop: 4, paddingTop: 4 }}>
        <div style={{ fontWeight: 600, color: '#475569', marginBottom: 4 }}>ICMS-ST e DIFAL (cálculo completo)</div>
        <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>
          ICMS-ST e DIFAL nunca coexistem na mesma operação. Bases incluem frete + seguro. Valores recalculados sobre a âncora no desconto.
        </div>
        <div style={{ display: 'flex', gap: 24, marginBottom: 12, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13, color: '#334155', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={icmsStActive} onChange={(e) => { setIcmsStActive(e.target.checked); if (e.target.checked) setDifalActive(false) }} />
            Ativar ICMS-ST
          </label>
          <label style={{ fontSize: 13, color: '#334155', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={difalActive} onChange={(e) => { setDifalActive(e.target.checked); if (e.target.checked) setIcmsStActive(false) }} />
            Ativar DIFAL
          </label>
        </div>
        {/* EPIC-POR-FORA-V3: seletor "Tipo de operação" (substitui o checkbox). Só p/ ICMS-ST —
            DIFAL é sempre interestadual e usa alíquotas destino/origem diretamente. */}
        {icmsStActive && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 6 }}>Tipo de operação</div>
            <Segmented
              value={stDifalInterestadual ? 'Interestadual' : 'Interna'}
              onChange={(v) => setStDifalInterestadual(v === 'Interestadual')}
              options={['Interna', 'Interestadual']}
            />
          </div>
        )}
        {(icmsStActive || difalActive) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: '#475569' }}>ALQ interna destino (%)</label>
              <PercentInput value={icmsAlqInternaDestinoPct} onChange={(v) => setIcmsAlqInternaDestinoPct(Number(v) || 0)} min={0} max={100} style={{ width: '100%' }} />
            </div>
            {/* EPIC-POR-FORA-V3: ALQ interestadual origem só no modo interestadual (ICMS-ST) ou no DIFAL */}
            {(stDifalInterestadual || difalActive) && (
              <div>
                <label style={{ fontSize: 12, color: '#475569' }}>ALQ interestadual origem (%)</label>
                <PercentInput value={icmsAlqInterestadualOrigemPct} onChange={(v) => setIcmsAlqInterestadualOrigemPct(Number(v) || 0)} min={0} max={100} style={{ width: '100%' }} />
              </div>
            )}
            {icmsStActive && (
              <div>
                <label style={{ fontSize: 12, color: '#475569' }}>MVA original (%)</label>
                <PercentInput value={mvaOriginalPct} onChange={(v) => setMvaOriginalPct(Number(v) || 0)} min={0} max={300} style={{ width: '100%' }} />
              </div>
            )}
            {icmsStActive && (
              <div>
                <label style={{ fontSize: 12, color: '#475569' }}>MVA ajustada (%)</label>
                <InputNumber
                  value={Number((mvaAjustada(mvaOriginalPct, icmsAlqInterestadualOrigemPct, icmsAlqInternaDestinoPct) * 100).toFixed(4))}
                  disabled
                  style={{ width: '100%', opacity: stDifalInterestadual ? 1 : 0.5 }}
                />
                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
                  {stDifalInterestadual
                    ? 'Calculada automaticamente (operação interestadual).'
                    : 'Não se aplica em operação interna (usa a MVA original).'}
                </div>
              </div>
            )}
            {difalActive && (
              <>
                <div>
                  <label style={{ fontSize: 12, color: '#475569' }}>FCP/FECP (%)</label>
                  <PercentInput value={fcpAlqPct} onChange={(v) => setFcpAlqPct(Number(v) || 0)} min={0} max={10} style={{ width: '100%' }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <label style={{ fontSize: 13, color: '#334155', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <input type="checkbox" checked={difalBaseDupla} onChange={(e) => setDifalBaseDupla(e.target.checked)} />
                    Base dupla (LC 190/2022)
                  </label>
                </div>
                {difalBaseDupla && (
                  <div>
                    <label style={{ fontSize: 12, color: '#475569' }}>ICMS interno origem (%)</label>
                    <PercentInput value={icmsInternaOrigemPct} onChange={(v) => setIcmsInternaOrigemPct(Number(v) || 0)} min={0} max={100} style={{ width: '100%' }} />
                  </div>
                )}
              </>
            )}
          </div>
        )}
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 10 }}>
          ℹ️ ICMS Complementar (LC 87/96) = (IPI + frete + seguro) × ICMS é aplicado automaticamente no orçamento quando o destinatário for consumidor final NÃO contribuinte do ICMS.
        </div>
      </div>
    </details>
  )

  return (
    <>
      <header className="flex justify-between mb-4">
        <div>
          <h1 className={isMobile ? 'text-xl' : 'text-3xl'}>
            {orcamento ? `Precificação do orçamento ${orcamento.numero}` : product ? PAGE_TITLES.EDIT_PRODUCT : PAGE_TITLES.NEW_PRODUCT}
          </h1>
          {isMobile && (
            <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
              {product
                ? 'Altere as informações do produto'
                : 'Preencha as informações do produto'}
            </p>
          )}
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════
          TIPO DO PRODUTO: Produzido (receita) ou Revenda
          ══════════════════════════════════════════════════════ */}
      <Card size="small" style={{ marginBottom: 16 }}>
        {orcamento ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }} data-tipo-do-orcamento="">
            <strong style={{ fontSize: 14 }}>Tipo do produto:</strong>
            <span>🛠️ {CABECALHO_FIXO.tipo}</span>
          </div>
        ) : isRevendaFromDb ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <strong style={{ fontSize: 14 }}>Tipo do produto:</strong>
            <span style={{
              background: '#FFF7E6', border: '1px solid #FFD591', borderRadius: 6,
              padding: '4px 14px', fontWeight: 600, fontSize: 13, color: '#000000',
            }}>📦 Revenda (produto acabado)</span>
          </div>
        ) : isCalcTypeService ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <strong style={{ fontSize: 14 }}>Tipo do produto:</strong>
            <span style={{
              background: '#E6F7FF', border: '1px solid #91D5FF', borderRadius: 6,
              padding: '4px 14px', fontWeight: 600, fontSize: 13, color: '#0a0a0a',
            }}>📦 Revenda</span>
          </div>
        ) : isCalcTypeResale ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
              <strong style={{ fontSize: 14 }}>Tipo do produto:</strong>
              <Radio.Group
                value={productType}
                onChange={(e) => setProductType(e.target.value)}
                optionType="button"
                buttonStyle="solid"
              >
                <Radio.Button value="REVENDA">📦 Revenda (produto acabado)</Radio.Button>
              </Radio.Group>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
              <strong style={{ fontSize: 14 }}>Tipo do produto:</strong>
              <Radio.Group
                value={productType}
                onChange={(e) => {
                  setProductType(e.target.value)
                  if (e.target.value === 'PRODUZIDO') {
                    setBaseItemId(null)
                    setProductItemsData([])
                  }
                }}
                optionType="button"
                buttonStyle="solid"
              >
                <Radio.Button value="PRODUZIDO">🛠️ Produzido (receita)</Radio.Button>
                <Radio.Button value="REVENDA">📦 Revenda (produto acabado)</Radio.Button>
              </Radio.Group>
            </div>

          </>
        )}
      </Card>

      {/* O <Form> abraça os DOIS Cards — Identificação e Fiscal. A indentação dos
          Cards não foi mexida de propósito: reindentar 400 linhas esconderia a
          mudança real no diff. Tirar um Form.Item de dentro deste escopo faz o campo
          sumir do `values` do save SEM erro nenhum — é o que o teste
          `o-ncm-mora-no-bloco-fiscal.test.ts` trava. */}
      <Form form={productForm} layout="vertical">
      {orcamento ? (
        <Card size="small" data-cabecalho-do-orcamento="">
          {/* O CABEÇALHO DO ORÇAMENTO (decisão 1): código = o número, nome = o cliente; tipo, unidade e seção fixos e só leitura. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
            <Form.Item name="code" label="Código"><Input disabled aria-label="Código" /></Form.Item>
            <Form.Item name="name" label="Cliente"><Input disabled aria-label="Cliente" /></Form.Item>
            <Form.Item label="Seção"><Input disabled value={CABECALHO_FIXO.secao} aria-label="Seção" /></Form.Item>
            <Form.Item name="unitType" label="Unidade de Medida"><Input disabled aria-label="Unidade de Medida" /></Form.Item>
            <Form.Item name="quantity" hidden><Input /></Form.Item>
          </div>
        </Card>
      ) : (
      <Card size="small">
          <Form.Item name="id" label="Id" hidden>
            <Input />
          </Form.Item>

          {/* Linha 1: Nome | Seção (+ Código se editando). O NCM saiu daqui para o bloco Fiscal. */}
          <div style={{ display: 'grid', gridTemplateColumns: isEditingMode ? 'repeat(auto-fit, minmax(180px, 1fr))' : 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            {isEditingMode && (
              <Form.Item
                name="code"
                label="Código"
                rules={[{ required: true, message: REQUIRED_INPUT_MESSAGE }]}
              >
                <Input />
              </Form.Item>
            )}

            <Form.Item
              name="name"
              label="Nome"
              rules={[{ required: true, message: REQUIRED_INPUT_MESSAGE }]}
            >
              <Input onChange={(e) => handleProductNameChange(e.target.value)} />
            </Form.Item>

            <Form.Item label="Seção" style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <Form.Item name="section_id" noStyle>
                  <Select
                    allowClear
                    loading={loadingSections}
                    placeholder="Selecionar seção"
                    style={{ flex: 1 }}
                    options={sections.map(s => ({ value: s.id, label: s.name }))}
                  />
                </Form.Item>
                <Button
                  icon={<PlusOutlined />}
                  onClick={() => setNewSectionModalOpen(true)}
                  title="Criar nova seção"
                />
              </div>
            </Form.Item>
          </div>

          {/* Linha 2: Unidade de Medida | Quantidade | Estoque mínimo */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            <Form.Item
              name="unitType"
              label="Unidade de Medida"
              rules={[{ required: true, message: REQUIRED_INPUT_MESSAGE }]}
              initialValue="UN"
            >
              <Select>
                <Select.Option value="G">Gramas (g)</Select.Option>
                <Select.Option value="KG">Quilos (kg)</Select.Option>
                <Select.Option value="ML">Mililitros (ml)</Select.Option>
                <Select.Option value="L">Litros (l)</Select.Option>
                <Select.Option value="MM">Milímetros (mm)</Select.Option>
                <Select.Option value="CM">Centímetros (cm)</Select.Option>
                <Select.Option value="M">Metros (m)</Select.Option>
                <Select.Option value="KM">Quilômetros (km)</Select.Option>
                <Select.Option value="M2">Área (m²)</Select.Option>
                <Select.Option value="M3">Volume (m³)</Select.Option>
                <Select.Option value="W">Potência (w)</Select.Option>
                <Select.Option value="UN">Unidade (un)</Select.Option>
              </Select>
            </Form.Item>

            <Form.Item
              name="quantity"
              label={productType === 'REVENDA' ? 'Adicionar quantidade no estoque' : 'Quantidade de produção'}
              rules={[{ required: true, message: REQUIRED_INPUT_MESSAGE }]}
            >
              <Input type="number" min="1" step="1" />
            </Form.Item>

            <Form.Item
              name="minLimit"
              label="Estoque mínimo (alerta)"
              initialValue={0}
              tooltip="Abaixo deste valor o produto aparecerá em status Baixo/Crítico na aba Estoque."
            >
              <InputNumber min={0} step={1} style={{ width: '100%' }} placeholder="0" />
            </Form.Item>
          </div>

          {/* Linha 3: Ativar Recorrência */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <Form.Item
              label={
                <span>
                  Ativar Recorrência de vendas&nbsp;
                  <Tooltip title="Ativa o contato automático com o cliente após a venda. Configure o prazo em dias e uma mensagem personalizada por produto.">
                    <InfoCircleOutlined style={{ color: '#64748b' }} />
                  </Tooltip>
                </span>
              }
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Switch
                  checked={recurrenceActive}
                  onChange={(checked) => {
                    setRecurrenceActive(checked)
                    if (checked) setRecurrenceModalOpen(true)
                  }}
                  checkedChildren={<SyncOutlined />}
                />
                {recurrenceActive && (
                  <span style={{ fontSize: 13, color: '#94a3b8' }}>
                    {recurrenceDays ? `${recurrenceDays} dias` : 'Sem prazo definido'}
                    {recurrenceMessage ? ' · Mensagem personalizada' : ''}
                  </span>
                )}
                {recurrenceActive && (
                  <Button size="small" type="link" style={{ padding: 0 }} onClick={() => setRecurrenceModalOpen(true)}>
                    Configurar
                  </Button>
                )}
              </div>
            </Form.Item>
          </div>

          <Form.Item
            name="commission_table_id"
            label="Tabela de Comissão"
            style={{ marginTop: 8 }}
            rules={[{ required: true, message: 'Selecione a tabela de comissão!' }]}
          >
            <Select
              placeholder="Selecione a tabela de comissão"
              options={commissionTables.map(t => ({ value: t.id, label: t.name }))}
              showSearch
              filterOption={(input, option) => (option?.label as string || '').toLowerCase().includes(input.toLowerCase())}
              onChange={(tableId: string) => {
                const table = commissionTables.find(t => t.id === tableId)
                if (table) {
                  setProductPriceInfo(prev => prev ? ({
                    ...prev,
                    salesCommissionPercent: Number(table.commission_percent) || 0,
                  }) : prev)
                }
              }}
            />
          </Form.Item>

          <Modal
            title="Configurar Recorrência"
            open={recurrenceModalOpen}
            onOk={() => setRecurrenceModalOpen(false)}
            onCancel={() => setRecurrenceModalOpen(false)}
            okText="Confirmar"
            cancelText="Fechar"
            width={560}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                  Dias para disparo&nbsp;
                  <Tooltip title="Quantos dias após a venda o cliente será contatado.">
                    <InfoCircleOutlined style={{ color: '#64748b' }} />
                  </Tooltip>
                </div>
                <InputNumber
                  min={1}
                  step={1}
                  style={{ width: '100%' }}
                  placeholder="Ex: 30"
                  value={recurrenceDays}
                  onChange={(v) => setRecurrenceDays(v)}
                  addonAfter="dias"
                />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                  Mensagem personalizada (opcional)&nbsp;
                  <Tooltip title="Mensagem específica para este produto. Se vazio, será usada a mensagem padrão da aba Recorrência.">
                    <InfoCircleOutlined style={{ color: '#64748b' }} />
                  </Tooltip>
                </div>
                <div style={{ marginBottom: 8, fontSize: 12, color: '#94a3b8' }}>
                  Clique nas tags para inserir na mensagem:{' '}
                  <Tag color="blue" style={{ fontSize: 11, cursor: 'pointer' }} onClick={() => insertRecurrenceTag('{{nome_cliente}}')}>
                    {'{{nome_cliente}}'}
                  </Tag>{' '}
                  <Tag color="blue" style={{ fontSize: 11, cursor: 'pointer' }} onClick={() => insertRecurrenceTag('{{nome_produto}}')}>
                    {'{{nome_produto}}'}
                  </Tag>
                </div>
                <Input.TextArea
                  ref={recurrenceTextareaRef as any}
                  rows={4}
                  placeholder="Olá {{nome_cliente}}, lembrete sobre {{nome_produto}}..."
                  value={recurrenceMessage}
                  onChange={(e) => setRecurrenceMessage(e.target.value)}
                />
              </div>
            </div>
          </Modal>

          {/* Inline new section modal */}
          <Modal
            title="Nova Seção"
            open={newSectionModalOpen}
            onOk={handleCreateSectionInline}
            onCancel={() => { setNewSectionModalOpen(false); setNewSectionName('') }}
            okText="Criar"
            okButtonProps={{ loading: savingNewSection }}
            width={360}
          >
            <Input
              placeholder="Nome da seção"
              value={newSectionName}
              onChange={e => setNewSectionName(e.target.value)}
              onPressEnter={handleCreateSectionInline}
              maxLength={80}
            />
          </Modal>

      </Card>
      )}

      {/* No orçamento I.A. o bloco Fiscal SAI (dono do produto, 11/11/2026): o NCM, o escopo, o comprador e a UF não aparecem — o fiscal é o
          preset, e os impostos são os da empresa. Não é escondido atrás de expansor: não é montado. */}
      {!ehOrcamentoDeIndustrializacao && (<>
      {/* ══════════════════════════════════════════════════════
          FISCAL — o que a NOTA exige do produto
          O NCM e o contexto da venda moram juntos porque respondem à mesma
          pergunta: qual é o tratamento tributário deste produto. O bloco está
          preparado para receber ORIGEM DA MERCADORIA, CST/CSOSN e cClassTrib,
          que a NT 2025.002 exige e que o schema ainda não tem —
          `cascata-lucro-real.md`, seção "O que falta para EMITIR nota".
          ══════════════════════════════════════════════════════ */}
      <Card size="small" style={{ marginTop: 16 }}>
        <Divider orientation="left" style={{ fontSize: 12, color: '#94a3b8', marginTop: 0 }}>
          Fiscal
        </Divider>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <Form.Item
            name="ncm_code"
            label={
              <span>
                NCM&nbsp;
                <Tooltip title="Nomenclatura Comum do Mercosul — código fiscal do produto final. Digite o código ou pesquise pelo nome do produto.">
                  <InfoCircleOutlined style={{ color: '#64748b' }} />
                </Tooltip>
              </span>
            }
            style={{ marginBottom: 0 }}
          >
            <AutoComplete
              options={ncmOptions}
              onSearch={handleNcmSearch}
              onSelect={(value: string) => {
                productForm.setFieldsValue({ ncm_code: value })
                fetchNcmRatesForLR(value)
              }}
              placeholder="Digite o NCM ou pesquise (ex: bolo, 1905...)"
              notFoundContent={ncmFieldSearching ? <Spin size="small" /> : null}
              allowClear
            />
          </Form.Item>
        </div>

        {/* ┌ LUGAR PREPARADO — campos que a NF-e exige e que NÃO existem no schema:
            │   • Origem da mercadoria (0 a 8)
            │   • CST / CSOSN
            │   • cClassTrib — 164 códigos na tabela oficial do Portal DF-e SVRS,
            │     publicação 2026-06-22 (o "156 da v1.40" é fonte secundária)
            └ Não criar sem a tabela de códigos: inventar a lista é pior que não tê-la. */}

        {/* As sugestões de NCM vêm do NOME digitado, que ficou no bloco de Identificação.
            Elas moram AQUI, junto do campo que preenchem. A consequência é conhecida e
            aceita: a sugestão aparece longe do campo que a dispara. Se incomodar no uso, a
            correção é o bloco reagir também ao NCM vazio — NÃO devolvê-lo para cima. */}
        {(ncmSugLoading || ncmSuggestions.length > 0) && (
          <div style={{
            marginTop: 8, marginBottom: 4, padding: '8px 12px',
            background: '#0a1628', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8,
          }}>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
              <SearchOutlined style={{ fontSize: 10 }} />
              Sugestões de NCM para o nome digitado:
            </div>
            {ncmSugLoading ? (
              <div style={{ textAlign: 'center', padding: '8px 0' }}><Spin size="small" /></div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {ncmSuggestions.map((s) => (
                  <div
                    key={s.code}
                    onClick={() => handleSelectNcmSuggestion(s.code)}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
                      background: '#111c2e', border: '1px solid rgba(255,255,255,0.06)',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#111c2e'
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'
                    }}
                  >
                    <span style={{ fontSize: 13, fontWeight: 500, color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.description}
                    </span>
                    <span style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap', fontFamily: 'monospace', marginLeft: 12 }}>
                      {s.code}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <Divider orientation="left" style={{ fontSize: 12, color: '#94a3b8' }}>
          Contexto da Venda (para cálculo de impostos)
        </Divider>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 13 }}>
              Onde vende?&nbsp;
              <Tooltip title="Define se a venda será dentro do mesmo estado (intraestadual) ou para outro estado (interestadual). Impacta na alíquota do ICMS.">
                <InfoCircleOutlined style={{ color: '#64748b' }} />
              </Tooltip>
            </label>
            <Select
              value={saleScope}
              onChange={(val) => setSaleScope(val)}
              placeholder="Não informado"
              aria-label="Onde vende?"
              style={{ width: '100%' }}
            >
              <Select.Option value="INTRAESTADUAL">🏠 Dentro do estado</Select.Option>
              <Select.Option value="INTERESTADUAL">🚛 Fora do estado</Select.Option>
            </Select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 13 }}>
              Tipo de comprador&nbsp;
              <Tooltip title="Consumidor final (pessoa física) ou PJ contribuinte (outra empresa). Impacta no ICMS e DIFAL.">
                <InfoCircleOutlined style={{ color: '#64748b' }} />
              </Tooltip>
            </label>
            <Select
              value={buyerType}
              onChange={(val) => setBuyerType(val)}
              placeholder="Não informado"
              aria-label="Tipo de comprador"
              style={{ width: '100%' }}
            >
              <Select.Option value="CONSUMIDOR_FINAL">👤 Consumidor final</Select.Option>
              <Select.Option value="CONTRIBUINTE_PJ">🏢 PJ Contribuinte</Select.Option>
            </Select>
          </div>

          {saleScope === 'INTERESTADUAL' && (
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500, fontSize: 13 }}>
                Estado de destino
              </label>
              <Select
                showSearch
                placeholder="UF destino"
                value={destinationState}
                onChange={(val) => setDestinationState(val)}
                style={{ width: '100%' }}
                allowClear
              >
                {STATES.map(s => (
                  <Select.Option key={s} value={s}>{s}</Select.Option>
                ))}
              </Select>
            </div>
          )}

        </div>

        {/* ── CLASSIFICAÇÃO FISCAL — de onde a redução DECORRE ──────────────────
            O seletor de oito faixas SAIU como entrada livre em 16/09/2026. A
            redução não é escolha do usuário: ela vem do cClassTrib, como a
            alíquota do IPI vem do NCM. O caminho de exceção é o código fora da
            tabela, e só ele aceita digitação — ver o bloco compartilhado. */}
        {isLRorLPorSH && (
          <ClassificacaoFiscalBlock
            value={classificacao}
            onChange={setClassificacao}
            fatorLegado={ivaDualReductionFactor}
            onBloqueioChange={setBloqueioDaClassificacao}
          />
        )}

        {isLRorLPorSH && (reducoes.ibs != null || reducoes.cbs != null) && (ibsPct > 0 || cbsPct > 0) && (
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 8 }}>
            IBS: {ibsPct.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}% (bruta) → {parseFloat((ibsPct * (1 - (reducoes.ibs ?? 0) / 100)).toFixed(4)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}% (efetiva)
            &nbsp;·&nbsp;
            CBS: {cbsPct.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}% (bruta) → {parseFloat((cbsPct * (1 - (reducoes.cbs ?? 0) / 100)).toFixed(4)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}% (efetiva)
          </div>
        )}

        <div style={{
          background: 'rgba(46, 144, 250, 0.12)', border: '1px solid rgba(46, 144, 250, 0.3)', borderRadius: 8,
          padding: '10px 14px', fontSize: 12, color: '#e2e8f0', marginTop: 16,
        }}>
          <InfoCircleOutlined style={{ color: '#38bdf8', marginRight: 6 }} />
          <strong>Como funciona:</strong> O mesmo produto pode ter impostos diferentes
          dependendo de onde é vendido e para quem. Essas informações são usadas na
          simulação de preço — o imposto não fica fixo no produto.
        </div>
      </Card>
      </>)}
      </Form>

      {avisosDoOrcamento}
      {productType === 'PRODUZIDO' && (
        <ContentIndustrialization
          itemsForm={itemsForm}
          handleClickAddItem={handleClickAddItem}
          filterOption={filterOption}
          items={itemsForSelection}
          columns={ehOrcamento ? colunasDoOrcamento : columns}
          somenteLeitura={ehOrcamento}
          onPrecoNaoFormado={ehOrcamento ? zerarPrecoNaoFormado : undefined}
          productItemsData={productItemsData}
          handleChangePrecificationInputs={handleChangePrecificationInputs}
          productPriceInfo={productPriceInfo}
          doProductCalc={doProductCalc}
          calcBase={calcBase}
          currentUser={currentUser}
          productForm={productForm}
          customTaxPercent={customTaxPercent}
          onCustomTaxPercentChange={setCustomTaxPercent}
          additionalIrpjPercent={additionalIrpjPercent}
          onAdditionalIrpjChange={setAdditionalIrpjPercent}
          icmsPct={icmsPct}
          onIcmsPctChange={ehOrcamentoDeIndustrializacao ? undefined : handleIcmsPctChange}
          pisCofinsLRPct={pisCofinsLRPct}
          onPisCofinsLRPctChange={ehOrcamentoDeIndustrializacao ? undefined : setPisCofinsLRPct}
          freightValue={freightValue}
          insuranceValue={insuranceValue}
          accessoryExpensesValue={accessoryExpensesValue}
          ibsPct={ehOrcamentoDeIndustrializacao ? ibsDaEmpresa : ibsPct}
          onIbsPctChange={ehOrcamentoDeIndustrializacao ? undefined : setIbsPct}
          cbsPct={ehOrcamentoDeIndustrializacao ? cbsDaEmpresa : cbsPct}
          onCbsPctChange={ehOrcamentoDeIndustrializacao ? undefined : setCbsPct}
          impostosDaEmpresa={ehOrcamentoDeIndustrializacao}
          ivaReductionIbsPct={reducoes.ibs}
          ivaReductionCbsPct={reducoes.cbs}
          isPct={isPct}
          onIsPctChange={setIsPct}
          ipiPct={ipiPct}
          onIpiPctChange={setIpiPct}
          ibsBaseCode={ibsBaseCode}
          cbsBaseCode={cbsBaseCode}
          isBaseCode={isBaseCode}
          ipiBaseCode={ipiBaseCode}
          onFinalPriceWithTaxesChange={handleFinalPriceWithTaxes}
          advancedTaxesSection={advancedTaxesSection}
          advancedTaxParams={advancedTaxParams}
          mobileItemsList={ehOrcamento ? undefined : productItemsMobileList}
          workloadAlert={workloadAlert}
        />
      )}
      {productType === 'REVENDA' && isCalcTypeService && (
        /* SERVICE segmentation: REVENDA hides mão de obra produtiva — uses resale form */
        <ContentResale
          itemsForm={itemsForm}
          handleClickAddItem={handleClickAddItem}
          filterOption={filterOption}
          items={itemsForSelection}
          columns={columns}
          productItemsData={productItemsData}
          handleChangePrecificationInputs={handleChangePrecificationInputs}
          productPriceInfo={productPriceInfo}
          doProductCalc={doProductCalc}
          calcBase={calcBase}
          currentUser={currentUser}
          productForm={productForm}
          customTaxPercent={customTaxPercent}
          onCustomTaxPercentChange={setCustomTaxPercent}
          additionalIrpjPercent={additionalIrpjPercent}
          onAdditionalIrpjChange={setAdditionalIrpjPercent}
          icmsPct={icmsPct}
          onIcmsPctChange={handleIcmsPctChange}
          pisCofinsLRPct={pisCofinsLRPct}
          onPisCofinsLRPctChange={setPisCofinsLRPct}
          freightValue={freightValue}
          insuranceValue={insuranceValue}
          accessoryExpensesValue={accessoryExpensesValue}
          ibsPct={ibsPct}
          onIbsPctChange={setIbsPct}
          cbsPct={cbsPct}
          onCbsPctChange={setCbsPct}
          ivaReductionIbsPct={reducoes.ibs}
          ivaReductionCbsPct={reducoes.cbs}
          isPct={isPct}
          onIsPctChange={setIsPct}
          ipiPct={ipiPct}
          onIpiPctChange={setIpiPct}
          ibsBaseCode={ibsBaseCode}
          cbsBaseCode={cbsBaseCode}
          isBaseCode={isBaseCode}
          ipiBaseCode={ipiBaseCode}
          onFinalPriceWithTaxesChange={handleFinalPriceWithTaxes}
          advancedTaxesSection={advancedTaxesSection}
          advancedTaxParams={advancedTaxParams}
          mobileItemsList={productItemsMobileList}
        />
      )}
      {productType === 'REVENDA' && !isCalcTypeService && (
        <ContentResale
          itemsForm={itemsForm}
          handleClickAddItem={handleClickAddItem}
          filterOption={filterOption}
          items={itemsForSelection}
          columns={columns}
          productItemsData={productItemsData}
          handleChangePrecificationInputs={handleChangePrecificationInputs}
          productPriceInfo={productPriceInfo}
          doProductCalc={doProductCalc}
          calcBase={calcBase}
          currentUser={currentUser}
          productForm={productForm}
          customTaxPercent={customTaxPercent}
          onCustomTaxPercentChange={setCustomTaxPercent}
          additionalIrpjPercent={additionalIrpjPercent}
          onAdditionalIrpjChange={setAdditionalIrpjPercent}
          icmsPct={icmsPct}
          onIcmsPctChange={handleIcmsPctChange}
          pisCofinsLRPct={pisCofinsLRPct}
          onPisCofinsLRPctChange={setPisCofinsLRPct}
          freightValue={freightValue}
          insuranceValue={insuranceValue}
          accessoryExpensesValue={accessoryExpensesValue}
          ibsPct={ibsPct}
          onIbsPctChange={setIbsPct}
          cbsPct={cbsPct}
          onCbsPctChange={setCbsPct}
          ivaReductionIbsPct={reducoes.ibs}
          ivaReductionCbsPct={reducoes.cbs}
          isPct={isPct}
          onIsPctChange={setIsPct}
          ipiPct={ipiPct}
          onIpiPctChange={setIpiPct}
          ibsBaseCode={ibsBaseCode}
          cbsBaseCode={cbsBaseCode}
          isBaseCode={isBaseCode}
          ipiBaseCode={ipiBaseCode}
          onFinalPriceWithTaxesChange={handleFinalPriceWithTaxes}
          advancedTaxesSection={advancedTaxesSection}
          advancedTaxParams={advancedTaxParams}
          mobileItemsList={productItemsMobileList}
        />
      )}
      {/* EPIC-POR-FORA-V3: a seção "Alíquotas tributárias adicionais (avançado)" foi movida para a
          const `advancedTaxesSection` e agora é renderizada ACIMA do card de Lucro Líquido /
          Preço de Venda (via prop advancedTaxesSection do ProductPrice), somando ICMS-ST/DIFAL/FCP
          ao preço final exibido. */}

      {/* Frente 1 (mobile): card "Dica" antes do footer */}
      {isMobile && (
        <div
          style={{
            background: 'rgba(46, 144, 250, 0.12)',
            border: '1px solid rgba(46, 144, 250, 0.3)',
            borderRadius: 8,
            padding: '12px 14px',
            fontSize: 12,
            color: '#e2e8f0',
            marginTop: 20,
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start',
          }}
        >
          <InfoCircleOutlined style={{ color: '#38bdf8', marginTop: 2 }} />
          <span>
            <strong>Dica:</strong> Mantenha as informações do produto sempre
            atualizadas para uma precificação mais precisa.
          </span>
        </div>
      )}

      {orcamento && (
        // a ÚLTIMA faixa antes do botão (11/11/2026): os itens com as variáveis, precificados um a um, e o total
        <ItensPrecificados itens={itensDoArquivo} recusaDosItens={recusaDosItensDoArquivo} interna={internaNaTela}
          pesos={orcamento.itens.map((i) => ({ ordem: i.ordem, quantidade: i.quantidade, peso: i.custo_liquido_total }))} />
      )}
      <footer className="flex flex-row-reverse mt-5 mr-4">
        <Button onClick={handleSaveProduct} type="primary" className="ml-2" loading={orcamento ? salvandoOrcamento : savingProduct}>
          {orcamento ? 'Salvar precificação do orçamento' : product ? 'Salvar alterações' : 'Salvar'}
        </Button>
        <Button onClick={goBack}>Cancelar</Button>
      </footer>
    </>
  )
}
