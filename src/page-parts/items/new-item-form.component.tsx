import { Input, Form, InputNumber, FormInstance, Divider, Tooltip, Tag, AutoComplete, Spin, Checkbox } from 'antd'
import { Select } from '@/components/ui/app-select.component'
import { PercentInput } from '@/components/percent-input.component'
import { InfoCircleOutlined, SearchOutlined } from '@ant-design/icons'
import { currencyMask, currencyDotMask } from '@/utils/currency-mask'
/*
  §2 — A MESMA entrada `% | R$` da tela de despesa, e a MESMA travessia de borda. Um segundo
  campo com conversão própria divergiria na base, e os dois lados fechariam consigo mesmos.
*/
import EntradaDeImposto from '@/components/despesas/entrada-de-imposto.component'
import { baseDaLinha, CAMPO_DA_ALIQUOTA, type FormatoDaEntrada } from '@/utils/entrada-de-imposto'
import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { getMonetaryValue } from '@/utils/get-monetary-value'
import { supabase } from '@/supabase/client'
import { useAuth } from '@/hooks/use-auth.hook'

type Props = {
  form: FormInstance
  taxableRegime?: string | null
}

const STATES = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]

const REQUIRED = 'Campo obrigatório!'

const capitalizeFirst = (value: string) =>
  value.charAt(0).toUpperCase() + value.slice(1)

const UNIT_CONVERSIONS: Record<string, { base: string; factor: number }> = {
  KG: { base: 'g', factor: 1000 },
  G: { base: 'g', factor: 1 },
  L: { base: 'ml', factor: 1000 },
  ML: { base: 'ml', factor: 1 },
  M: { base: 'cm', factor: 100 },
  CM: { base: 'cm', factor: 1 },
  MM: { base: 'mm', factor: 1 },
  KM: { base: 'm', factor: 1000 },
  M2: { base: 'm²', factor: 1 },
  M3: { base: 'm³', factor: 1 },
  UN: { base: 'un', factor: 1 },
  W: { base: 'w', factor: 1 },
}

interface NcmSuggestion {
  code: string
  description: string
}

const formatBRL3 = (v: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })

// Lucro Real — base PIS+COFINS não-cumulativo (1,65% + 7,6% = 9,25%)
import PurchaseTaxCredits from '@/page-parts/items/purchase-tax-credits.component'
import { bandeirasGravadasDaPosicao, posicoesDosTributos } from '@/utils/posicao-do-tributo'
import {
  calcularCustoDoItem, resolverFlagsDoItem, icmsEfetivoPctDe,
  type BandeirasDeCredito, type CustoDoItem, type TributoCreditavel,
} from '@/utils/custo-liquido-do-item'

const PIS_COFINS_BASE = 9.25
const PIS_COFINS_LP = 3.65

const NewItemForm = ({ form, taxableRegime }: Props) => {
  const isLucroReal = taxableRegime === 'LUCRO_REAL'
  const isLucroPresumido = taxableRegime === 'LUCRO_PRESUMIDO'
  const isSimplesHibrido = taxableRegime === 'SIMPLES_HIBRIDO'
  const isLucroRealOrLP = isLucroReal || isLucroPresumido || isSimplesHibrido
  const { currentUser } = useAuth()
  const isRevenda = currentUser?.calcType === 'RESALE'

  const [costPerUnit, setCostPerUnit] = useState<string | null>(null)
  const [baseUnitLabel, setBaseUnitLabel] = useState<string>('un')
  const [ncmSuggestions, setNcmSuggestions] = useState<NcmSuggestion[]>([])
  const [ncmSearching, setNcmSearching] = useState(false)
  const [ncmOptions, setNcmOptions] = useState<{ value: string; label: React.ReactNode }[]>([])
  const [ncmFieldSearching, setNcmFieldSearching] = useState(false)
  const [productTables, setProductTables] = useState<{ id: string; name: string }[]>([])
  const itemTypeWatch = Form.useWatch('item_type', form)
  const [netCostDisplay, setNetCostDisplay] = useState<string | null>(null)
  const [impostosRecuperaveisDisplay, setImpostosRecuperaveisDisplay] = useState<number>(0)
  /** O resultado da fórmula única — bruto, créditos e líquido, para o rodapé do bloco. */
  const [custoDoItem, setCustoDoItem] = useState<CustoDoItem | null>(null)
  /** As bandeiras resolvidas: quem está ligado, quem está vedado e por quê. */
  const [bandeiras, setBandeiras] = useState<BandeirasDeCredito | null>(null)
  // Lucro Real — quando o usuário edita PIS/COFINS manualmente, o auto-cálculo é suspenso
  const [pisCofinsManuallyEdited, setPisCofinsManuallyEdited] = useState(false)
  /* §2 — o formato de cada linha. R$ é o inicial de ICMS, CBS e IBS. */
  const [formatoDaLinha, setFormatoDaLinha] = useState<Partial<Record<TributoCreditavel, FormatoDaEntrada>>>({})
  const nameDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const ncmDebounceRef = useRef<NodeJS.Timeout | null>(null)

  // Lê diretamente do form para evitar dependência de estado
  const icmsDeferidoEnabled = Form.useWatch('icms_deferido_enabled', form) ?? false
  const difalOrigemWatch = Form.useWatch('difal_origem_pct', form) ?? 0
  const difalDestinoWatch = Form.useWatch('difal_destino_pct', form) ?? 0
  const icmsStWatch = Form.useWatch('icms_st_value', form) ?? 0
  const ipiNrPctWatch = Form.useWatch('ipi_nr_pct', form) ?? 0
  const priceWatch = Form.useWatch('price', form) ?? '0'
  // §4, ADENDO DO ICMS DEFERIDO — os dois números que compõem o efetivo.
  const icmsRateWatch = Form.useWatch('icms_rate', form) ?? 0
  const icmsDeferidoRateWatch = Form.useWatch('icms_deferido_rate', form) ?? 0
  /* Subiu para cá: `Form.useWatch` dentro do JSX de um `extras` rodaria condicionalmente. */
  const pisCofinsRateWatch = Form.useWatch('pis_cofins_rate', form) ?? 0
  const fcpValueWatch = Form.useWatch('fcp_value', form)

  /**
   * O CUSTO LÍQUIDO, pela fórmula ÚNICA de `custo-liquido-do-item.ts`.
   *
   * Até 20/09/2026 a conta morava AQUI dentro, com a regra de crédito como premissa fixa:
   * ICMS e PIS/COFINS sempre recuperáveis, IPI nunca. Agora cada tributo tem a sua bandeira,
   * e a regra é a legal — mas a conta saiu do componente por outra razão, que é a de
   * `copia-divergente.md`: a próxima tela que precisar do custo líquido vai precisar da
   * MESMA conta, e a segunda cópia é como as duas passam a divergir.
   *
   * REGRESSÃO: com as bandeiras do backfill (ICMS on, PIS/COFINS on, IPI off) o número sai
   * IDÊNTICO ao de antes. É o caso A do gabarito, e ele está afirmado termo a termo em
   * `custo-liquido-do-item.test.ts`.
   */
  const recalcNetCost = useCallback(() => {
    // Simples e MEI não têm bloco de impostos da compra: o imposto está no DAS e o custo é o
    // bruto. A função retornava cedo aqui antes desta mudança, e continua retornando — os 46
    // itens desses regimes têm `cost_net = 0` hoje e NÃO passam a ser recalculados.
    if (!isLucroRealOrLP) return
    const values = form.getFieldsValue()
    const isDeferidoEnabled = Boolean(values.icms_deferido_enabled)
    const priceStr = String(values.price || '0').replace(/\./g, '').replace(',', '.')
    const priceNum = parseFloat(priceStr) || 0
    const icms = Number(values.icms_rate) || 0
    const icmsDeferido = isDeferidoEnabled ? (Number(values.icms_deferido_rate) || 0) : 0

    /*
      UMA SÓ FÓRMULA DO ICMS EFETIVO. Esta linha escrevia `icms * (1 - icmsDeferido / 100)`
      à mão, ao lado de `icmsEfetivoPctDe`, que faz exatamente isso e é a fonte que
      `baseDoTributo` também lê. Duas escritas da mesma conta são `copia-divergente.md` com
      a pior assinatura: o dia em que o diferimento mudar de regra, uma delas muda e a outra
      não, e a diferença aparece como base do PIS/COFINS, nunca como erro.

      O NÚMERO NÃO MUDA — a função devolve `destacado × (1 − deferido)`, e `?? 0` cobre só o
      caso em que a alíquota é nula, onde a linha antiga já lia zero por `Number(...) || 0`.
    */
    const impostosRec = icmsEfetivoPctDe({
      base: priceNum,
      icmsPct: icms,
      icmsDeferidoAtivo: isDeferidoEnabled,
      icmsDeferidoPct: icmsDeferido,
    }) ?? 0
    setImpostosRecuperaveisDisplay(parseFloat(impostosRec.toFixed(4)))

    // Lucro Real: campo único pis_cofins_rate. Padrão fixo 9,25% (1,65% + 7,6%) — editável.
    // Simples Híbrido: dois campos separados (pis_rate + cofins_rate).
    let pisCofinsTotal = 0
    if (isLucroReal) {
      if (!pisCofinsManuallyEdited) {
        form.setFieldsValue({ pis_cofins_rate: PIS_COFINS_BASE })
        pisCofinsTotal = PIS_COFINS_BASE
      } else {
        pisCofinsTotal = Number(values.pis_cofins_rate) || 0
      }
    } else if (isLucroPresumido) {
      // LP usa regime cumulativo: PIS 0,65% + COFINS 3% = 3,65% padrão (editável via pis_cofins_rate)
      if (!pisCofinsManuallyEdited) {
        form.setFieldsValue({ pis_cofins_rate: PIS_COFINS_LP })
        pisCofinsTotal = PIS_COFINS_LP
      } else {
        pisCofinsTotal = Number(values.pis_cofins_rate) || 0
      }
    } else if (isSimplesHibrido) {
      pisCofinsTotal = (Number(values.pis_rate) || 0) + (Number(values.cofins_rate) || 0)
    }

    if (priceNum > 0) {
      const flags = resolverFlagsDoItem(
        {
          regime: taxableRegime,
          destinacao: values.destination ?? null,
          segmento: currentUser?.calcType,
          cstIcms: values.cst_icms ?? null,
          cstIpi: values.cst_ipi ?? null,
          cstPisCofins: values.cst_pis_cofins ?? null,
          fornecedorSimplesSemRegimeRegular: values.supplier_simples_sem_regime_regular ?? null,
        },
        // `?? null` e NÃO `Boolean(...)`: ausente cai no padrão da destinação, desligado é
        // escolha do usuário. Achatar os dois aqui apagaria a distinção logo depois de a
        // coluna tê-la preservado.
        {
          ICMS: values.icms_credit_enabled ?? null,
          PIS_COFINS: values.pis_cofins_credit_enabled ?? null,
          IPI: values.ipi_credit_enabled ?? null,
          CBS: values.cbs_credit_enabled ?? null,
          IBS: values.ibs_credit_enabled ?? null,
        },
      )
      setBandeiras(flags)

      /**
       * §4.5 — AS BANDEIRAS PASSAM A SER DERIVADAS DA POSIÇÃO.
       *
       * Com o switch fora, o que fica gravado tem de ser o que a tela MOSTRA. Sem isto, um
       * item cuja destinação mudou continuaria gravando a bandeira antiga: a linha apareceria
       * no bloco de custo e a coluna diria `true`, e o próximo a abrir veria a linha voltar
       * para cima sem ninguém ter mexido.
       *
       * O VEDADO não vira `false` gravado — `bandeirasGravadasDaPosicao` devolve `null` ali,
       * porque uma proibição da lei não é uma escolha do usuário a registrar para sempre.
       *
       * NENHUMA MIGRAÇÃO DE DADO: as colunas são as mesmas, com os mesmos valores.
       */
      const gravadas = bandeirasGravadasDaPosicao(posicoesDosTributos(flags), flags)
      form.setFieldsValue({
        icms_credit_enabled: gravadas.ICMS,
        pis_cofins_credit_enabled: gravadas.PIS_COFINS,
        ipi_credit_enabled: gravadas.IPI,
        cbs_credit_enabled: gravadas.CBS,
        ibs_credit_enabled: gravadas.IBS,
      })

      const r = calcularCustoDoItem(
        {
          base: priceNum,
          /*
            §3 — O DESTACADO VAI PARA O MOTOR, E O DIFERIMENTO VAI COM ELE.

            Antes a tela mandava a alíquota JÁ EFETIVADA e omitia as bandeiras. O número era
            o mesmo, e a informação não: `icmsEfetivoPctDe` não tinha como saber que houve
            diferimento, e a borda da entrada em R$ não teria de onde derivar o destacado.

            A PARCELA DEFERIDA NÃO FOI COBRADA PELO FORNECEDOR. Ela não credita, e também
            não é custo — não está no preço. É por isso que a base do PIS/COFINS deduz o
            ICMS EFETIVO, e não o destacado: deduzir 180,00 tiraria da base um valor que
            ninguém pagou. Quem faz as duas contas é `icmsEfetivoPctDe` e `baseDoTributo`,
            e nenhuma das duas é reimplementada aqui.

            O resultado é IDÊNTICO ao de antes: `icmsEfetivoPctDe` devolve
            `destacado × (1 − deferido)`, que é o que a tela já vinha mandando pronto.
          */
          icmsPct: icms,
          icmsDeferidoAtivo: isDeferidoEnabled,
          icmsDeferidoPct: icmsDeferido,
          pisCofinsPct: pisCofinsTotal,
          ipiPct: Number(values.ipi_nr_pct) || 0,
          cbsPct: Number(values.cbs_rate) || 0,
          ibsPct: Number(values.ibs_rate) || 0,
          icmsSt: Number(values.icms_st_value) || 0,
          // QTD. medida — em quantas frações a unidade comprada se divide. É o que dá o
          // custo POR FRAÇÃO, que é o número que a receita do produto consome.
          qtdMedida: Number(values.measure_quantity) || null,
          difalOrigemPct: Number(values.difal_origem_pct) || 0,
          difalDestinoPct: Number(values.difal_destino_pct) || 0,
          // `null` e não `|| 0`: o item que nunca teve FCP não passa a afirmar que ele é
          // zero. O motor já sabe somar `null` como ausência.
          fcp: values.fcp_value == null || values.fcp_value === '' ? null : Number(values.fcp_value),
        },
        flags,
      )

      setCustoDoItem(r)
      setNetCostDisplay(getMonetaryValue(r.custoLiquido))
      form.setFieldsValue({ cost_net: r.custoLiquido, cost_gross: r.custoBruto })
    } else {
      setNetCostDisplay(null)
      setCustoDoItem(null)
      form.setFieldsValue({ cost_net: 0, cost_gross: 0 })
    }
  }, [form, isLucroReal, isLucroPresumido, isLucroRealOrLP, isSimplesHibrido, pisCofinsManuallyEdited, taxableRegime, currentUser?.calcType])

  /**
   * Liga ou desliga a bandeira de um tributo.
   *
   * Grava `true`/`false` EXPLÍCITOS — nunca deixa voltar a `null`. `null` significa "o
   * usuário nunca decidiu", e depois de ele ter mexido no botão isso deixou de ser verdade.
   */
  const handleToggleCredito = useCallback((tributo: TributoCreditavel, valor: boolean) => {
    const campo: Record<TributoCreditavel, string> = {
      ICMS: 'icms_credit_enabled',
      PIS_COFINS: 'pis_cofins_credit_enabled',
      IPI: 'ipi_credit_enabled',
      CBS: 'cbs_credit_enabled',
      IBS: 'ibs_credit_enabled',
    }
    form.setFieldsValue({ [campo[tributo]]: valor })
    setTimeout(recalcNetCost, 0)
  }, [form, recalcNetCost])

  const fetchAndFillNcmRates = useCallback(async (code: string) => {
    // Lucro Real: PIS/COFINS é fixo em 9,25% (não usa NCM).
    // Apenas Simples Híbrido busca alíquotas no NCM.
    if (!code || !isSimplesHibrido) return
    const digits = code.replace(/\D/g, '')
    if (digits.length < 4) return
    const formatted = digits.length >= 8
      ? `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`
      : digits.length >= 6
        ? `${digits.slice(0, 4)}.${digits.slice(4, 6)}`
        : digits
    try {
      const { data: rows } = await supabase
        .from('ncm_codes')
        .select('pis_rate_nao_cumulativo, cofins_rate_nao_cumulativo')
        .in('code', [formatted, digits])
        .limit(1)
      const data = rows?.[0]
      if (data) {
        const toPercent = (v: any) => v != null ? parseFloat((Number(v) * 100).toFixed(2)) : 0
        form.setFieldsValue({
          pis_rate: toPercent(data.pis_rate_nao_cumulativo),
          cofins_rate: toPercent(data.cofins_rate_nao_cumulativo),
        })
        setTimeout(recalcNetCost, 50)
      }
    } catch { /* silent */ }
  }, [form, isSimplesHibrido, recalcNetCost])

  const searchNcmByName = useCallback(async (name: string) => {
    if (name.length < 2) { setNcmSuggestions([]); return }
    setNcmSearching(true)
    try {
      const { data, error } = await supabase.functions.invoke('lookup-ncm', {
        body: { search: name },
      })
      if (!error && data?.success && data.results) {
        setNcmSuggestions(data.results.slice(0, 8).map((r: any) => ({
          code: r.code,
          description: r.description,
        })))
      } else {
        setNcmSuggestions([])
      }
    } catch { setNcmSuggestions([]) }
    finally { setNcmSearching(false) }
  }, [])

  const handleNameChange = useCallback((value: string) => {
    form.setFieldsValue({ name: capitalizeFirst(value) })
    if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current)
    nameDebounceRef.current = setTimeout(() => searchNcmByName(value), 280)
  }, [form, searchNcmByName])

  const handleSelectNcm = useCallback((code: string) => {
    form.setFieldsValue({ ncm_code: code })
    setNcmSuggestions([])
    fetchAndFillNcmRates(code)
  }, [form, fetchAndFillNcmRates])

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
              <span style={{ fontSize: 13, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</span>
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

  const handleNcmFieldSelect = useCallback((value: string) => {
    form.setFieldsValue({ ncm_code: value })
    fetchAndFillNcmRates(value)
  }, [form, fetchAndFillNcmRates])

  const handleChangePrice = (value: string) => {
    form.setFieldsValue({ price: currencyDotMask(currencyMask(value)) })
    recalcCostPerUnit()
    setTimeout(recalcNetCost, 50)
  }

  const recalcCostPerUnit = () => {
    const values = form.getFieldsValue()
    const priceStr = String(values.price || '0').replace(/\./g, '').replace(',', '.')
    const unitPrice = parseFloat(priceStr)
    const qty = parseFloat(values.quantity)
    const measureQty = parseFloat(values.measure_quantity) || 1
    const unit = values.unitType || 'UN'

    const conv = UNIT_CONVERSIONS[unit] || { base: 'un', factor: 1 }
    setBaseUnitLabel(conv.base)

    if (unitPrice > 0 && measureQty > 0) {
      const costPerBase = unitPrice / measureQty
      setCostPerUnit(`R$ ${getMonetaryValue(costPerBase)}`)
    } else {
      setCostPerUnit(null)
    }
  }

  useEffect(() => {
    recalcCostPerUnit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const tenantId = currentUser?.tenant_id
      if (!tenantId) return
      const { data } = await supabase
        .from('commission_tables')
        .select('id, name')
        .eq('tenant_id', tenantId)
        .eq('type', 'PRODUCT')
        .order('name')
      if (!cancelled) setProductTables((data as any[]) || [])
    })()
    return () => { cancelled = true }
  }, [currentUser?.tenant_id])

  // Recalcula impostos recuperáveis e custo líquido na montagem do form
  // Necessário para edição de itens existentes (form já preenchido pelo componente pai)
  useEffect(() => {
    if (!isLucroRealOrLP) return
    // Lucro Real: se o item editado tem pis_cofins_rate ≠ 9,25% padrão,
    // o usuário editou manualmente — preservar e suspender auto-fill.
    if (isLucroReal || isLucroPresumido) {
      const values = form.getFieldsValue()
      const saved = Number(values.pis_cofins_rate) || 0
      const defaultRate = isLucroReal ? PIS_COFINS_BASE : PIS_COFINS_LP
      if (saved > 0 && Math.abs(saved - defaultRate) > 0.001) {
        setPisCofinsManuallyEdited(true)
      }
    }
    setTimeout(recalcNetCost, 150)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLucroRealOrLP])

  // Recalcula custo líquido quando impostos não recuperáveis mudam
  useEffect(() => {
    if (!isLucroRealOrLP) return
    setTimeout(recalcNetCost, 50)
  }, [icmsStWatch, ipiNrPctWatch, difalOrigemWatch, difalDestinoWatch, recalcNetCost, isLucroRealOrLP])

  const handleDeferidoToggle = (checked: boolean) => {
    form.setFieldsValue({
      icms_deferido_enabled: checked,
      ...(checked ? {} : { icms_deferido_rate: undefined }),
    })
    setTimeout(recalcNetCost, 50)
  }

  // Campos reutilizados nos dois layouts
  const quantidadeField = (
    <Form.Item
      name="quantity"
      label="QTD. Comprado"
      rules={[{ required: true, message: REQUIRED }]}
      tooltip="Quantidade total que você comprou (ex: 1 para 1kg, 500 para 500ml)"
      style={{ marginBottom: 24 }}
    >
      <Input
        type="number"
        min="0.001"
        step="any"
        placeholder="Ex: 1"
        onChange={() => setTimeout(recalcCostPerUnit, 50)}
      />
    </Form.Item>
  )

  const estoqueField = (
    <Form.Item
      name="min_limit"
      label="Estoque mínimo Alerta"
      initialValue={0}
      tooltip="Abaixo deste valor o item aparecerá em status Baixo/Crítico na aba Estoque."
      style={{ marginBottom: 24 }}
    >
      <InputNumber min={0} step={1} style={{ width: '100%' }} placeholder="0" />
    </Form.Item>
  )

  const priceForDifal = parseFloat(String(priceWatch || '0').replace(/\./g, '').replace(',', '.')) || 0
  const difalCalc = (() => {
    if (!difalOrigemWatch && !difalDestinoWatch) return 0
    const base = priceForDifal
    const icmsOrigem = base * ((difalOrigemWatch as number) / 100)
    const baseAposOrigem = base - icmsOrigem
    const destPct = (difalDestinoWatch as number) / 100
    if (destPct >= 1) return 0
    const grossed = baseAposOrigem / (1 - destPct)
    const impostoDestino = grossed * destPct
    return Math.max(0, impostoDestino - icmsOrigem)
  })()
  const ipiCalc = priceForDifal * ((ipiNrPctWatch as number) / 100)
  // §4.3 — o FCP é campo NOVO, em R$, e SEM `initialValue`: ausente tem de continuar
  // distinguível de zero nos 72 itens que nunca o tiveram (`ausente-vs-falso.md`).
  const fcpCalc = Number(fcpValueWatch) || 0
  const totalNaoRec = ((icmsStWatch as number) || 0) + ipiCalc + difalCalc + fcpCalc
  const fmtBRL = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  /**
   * §2 — A ANATOMIA DE CADA LINHA, e ela é o contrato visual deste PR.
   *
   *   RÓTULO + legenda      [R$|%]   entrada        valor apurado   efeito
   *
   * As quatro colunas são iguais em todas as linhas. A legenda vai sob o RÓTULO, apagada, e
   * não desloca a coluna de entrada — posta ao lado do campo, ela desalinharia as linhas.
   *
   * >>> R$ É O FORMATO INICIAL DE ICMS, CBS E IBS; PIS/COFINS NÃO TEM SELETOR <<<
   *
   * Os três primeiros vêm DESTACADOS no documento, e é o valor que o usuário copia. O
   * PIS/COFINS não vem: ele é apurado sobre uma base que a nota não traz, e oferecer R$ ali
   * pediria um número que o documento não tem.
   *
   * A conversão R$ → alíquota é a travessia de `entrada-de-imposto.ts`, com a base vinda de
   * `baseDoTributo` — a MESMA que a conta usa. Recompor a base aqui faria os dois lados
   * fecharem consigo mesmos (`copia-divergente.md`).
   */
  const valoresParaBase = useMemo(() => ({
    base: priceForDifal,
    icmsPct: icmsRateWatch,
    icmsDeferidoAtivo: icmsDeferidoEnabled,
    icmsDeferidoPct: icmsDeferidoRateWatch,
  }), [priceForDifal, icmsRateWatch, icmsDeferidoEnabled, icmsDeferidoRateWatch])

  /*
    `obrigatorio` existe só para o ICMS, e é a regra que a linha legada já tinha: alíquota
    apagada NÃO é alíquota zero (`ausente-vs-falso.md`), e o formulário recusa o save em vez
    de gravar um zero que ninguém digitou.
  */
  const entradaEmReais = (t: TributoCreditavel, obrigatorio = false) => (
    <Form.Item
      name={CAMPO_DA_ALIQUOTA[t]}
      noStyle
      initialValue={0}
      rules={obrigatorio
        ? [{ validator: (_: unknown, v: unknown) => (v !== undefined && v !== null) ? Promise.resolve() : Promise.reject(new Error(REQUIRED)) }]
        : undefined}
    >
      <EntradaDeImposto
        base={baseDaLinha(valoresParaBase as never, t)}
        formato={formatoDaLinha[t] ?? 'BRL'}
        onFormato={(f) => setFormatoDaLinha((prev) => ({ ...prev, [t]: f }))}
      />
    </Form.Item>
  )

  const camposDeAliquota: Partial<Record<TributoCreditavel, React.ReactNode>> = {
    ICMS: (
      <div style={{ display: 'grid', gap: 6, width: 360 }}>
        {entradaEmReais('ICMS', true)}
        {/*
          O DIFERIMENTO FICA NA LINHA DO ICMS, e mostra o EFETIVO em R$.

          >>> A PARCELA DEFERIDA NÃO CREDITA E NÃO É CUSTO <<<

          Não credita porque não foi cobrada pelo fornecedor — não há imposto recolhido na
          etapa anterior a recuperar. E não é custo porque não está no preço pago: o
          diferimento adia a incidência, não a embute na nota. Não é uma coisa nem outra, e
          é por isso que o número que o usuário precisa ver é o TERCEIRO — o EFETIVO.

          O valor digitado é o DESTACADO; o que credita é `destacado × (1 − deferido)`. O
          percentual efetivo vem de `impostosRecuperaveisDisplay`, que `recalcNetCost` já
          calcula com `icmsEfetivoPctDe` e é o MESMO número que entra em
          `calcularCustoDoItem`. Recalculá-lo aqui seria a segunda fórmula do ICMS efetivo
          que `copia-divergente.md` proíbe — divergiria no dia em que o diferimento mudasse
          de regra num dos dois lados.

          COM O CHECKBOX DESLIGADO a leitura NÃO aparece: "efetivo = destacado" treinaria o
          usuário a ignorar a linha, e a que importa é justamente a que só existe com
          diferimento.
        */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
          <Checkbox checked={icmsDeferidoEnabled} onChange={(e) => handleDeferidoToggle(e.target.checked)}>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>diferido</span>
          </Checkbox>
          {icmsDeferidoEnabled && (
            <>
              <Form.Item name="icms_deferido_rate" noStyle>
                <PercentInput min={0} max={100} style={{ width: 110 }} onChange={() => setTimeout(recalcNetCost, 50)} />
              </Form.Item>
              <span style={{ color: '#22C55E', fontWeight: 600 }}>
                → efetivo {fmtBRL(priceForDifal * (Number(impostosRecuperaveisDisplay) || 0) / 100)}
                <Tooltip title="A parcela deferida NÃO foi cobrada pelo fornecedor: ela não gera crédito e também não é custo, porque não está no preço pago. Por isso a base do PIS/COFINS deduz o ICMS efetivo, e não o destacado.">
                  <InfoCircleOutlined style={{ color: '#64748b', marginLeft: 6 }} />
                </Tooltip>
              </span>
            </>
          )}
        </div>
      </div>
    ),
    /*
      PIS/COFINS: SÓ PERCENTUAL, e o padrão por regime continua exatamente como está —
      9,25% no Lucro Real, 3,65% no Presumido, e o auto-preenchimento suspenso depois de
      uma edição manual, reativado quando o campo é limpo.
    */
    PIS_COFINS: (
      <div style={{ width: 360 }}>
        <Tooltip title={isLucroPresumido
          ? 'Padrão: 3,65% (PIS 0,65% + COFINS 3%, regime cumulativo). Pode ser editado manualmente; após edição, o auto-preenchimento fica suspenso até você limpar o campo.'
          : 'Padrão: 9,25% (PIS 1,65% + COFINS 7,6%, regime não-cumulativo). Pode ser editado manualmente; após edição, o auto-preenchimento fica suspenso até você limpar o campo.'}>
          <InputNumber
            value={pisCofinsRateWatch}
            min={0}
            max={100}
            step={0.0001}
            precision={4}
            style={{ width: 130 }}
            placeholder="0,0000"
            suffix="%"
            formatter={(v) => v != null ? String(v).replace('.', ',') : ''}
            parser={(v) => Number((v || '0').replace(',', '.'))}
            onChange={(v) => {
              const numeric = v !== null && v !== undefined ? Number(v) : 0
              setPisCofinsManuallyEdited(v !== null && v !== undefined)
              form.setFieldsValue({ pis_cofins_rate: numeric })
              setTimeout(recalcNetCost, 50)
            }}
          />
        </Tooltip>
      </div>
    ),
    CBS: <div style={{ width: 360 }}>{entradaEmReais('CBS')}</div>,
    IBS: <div style={{ width: 360 }}>{entradaEmReais('IBS')}</div>,
  }

  /** §2 — a legenda de cada linha, sob o rótulo. */
  const legendasDasLinhas: Partial<Record<TributoCreditavel, React.ReactNode>> = {
    ICMS: 'destacado, já dentro do preço',
    PIS_COFINS: `base após o ICMS: ${fmtBRL(baseDaLinha(valoresParaBase as never, 'PIS_COFINS'))}`,
    CBS: 'por fora, sobre o valor do item',
    IBS: 'por fora, sobre o valor do item',
  }

  return (
    <Form layout="vertical" form={form}>
      <Form.Item name="id" hidden><Input /></Form.Item>
      <Form.Item name="cost_net" hidden><InputNumber /></Form.Item>
      <Form.Item name="icms_deferido_enabled" hidden><Input /></Form.Item>
      {/*
        As bandeiras e os CST viajam no form como campos ocultos: quem as edita é o bloco
        `PurchaseTaxCredits` (as bandeiras) e a importação do XML da NF-e (os CST, fase 2).
        Ficarem no form é o que faz `cost_net` e `cost_gross` serem gravados junto com elas,
        numa transação só — bandeira gravada sem o custo correspondente seria o documento
        dizendo uma coisa e o número dizendo outra.
      */}
      <Form.Item name="icms_credit_enabled" hidden><Input /></Form.Item>
      <Form.Item name="pis_cofins_credit_enabled" hidden><Input /></Form.Item>
      <Form.Item name="ipi_credit_enabled" hidden><Input /></Form.Item>
      <Form.Item name="cbs_credit_enabled" hidden><Input /></Form.Item>
      <Form.Item name="ibs_credit_enabled" hidden><Input /></Form.Item>
      <Form.Item name="cst_icms" hidden><Input /></Form.Item>
      <Form.Item name="cst_ipi" hidden><Input /></Form.Item>
      <Form.Item name="cst_pis_cofins" hidden><Input /></Form.Item>
      <Form.Item name="cost_gross" hidden><Input /></Form.Item>
      <Form.Item name="pis_cofins_rate" hidden><InputNumber /></Form.Item>

      <Divider orientation="left" style={{ fontSize: 12, color: '#94a3b8', marginTop: 0 }}>
        Identificação
      </Divider>

      <Form.Item
        name="name"
        label="Nome do item / insumo"
        rules={[{ required: true, message: REQUIRED }]}
      >
        <Input
          placeholder="Ex: Farinha de trigo, Açúcar, Parafuso M6..."
          onChange={(e) => handleNameChange(e.target.value)}
        />
      </Form.Item>

      <Form.Item
        name="item_type"
        label={
          <span>
            Tipo do item&nbsp;
            <Tooltip title="Insumos para beneficiamento: materiais utilizados na produção. Revenda: produto acabado comprado para revender.">
              <InfoCircleOutlined style={{ color: '#64748b' }} />
            </Tooltip>
          </span>
        }
        rules={[{ required: true, message: REQUIRED }]}
        initialValue={isRevenda ? 'REVENDA' : 'INSUMO'}
      >
        <Select>
          {!isRevenda && <Select.Option value="INSUMO">🧪 Insumos para beneficiamento</Select.Option>}
          <Select.Option value="REVENDA">📦 Mercadoria para revenda</Select.Option>
        </Select>
      </Form.Item>

      {itemTypeWatch === 'REVENDA' && (
        <Form.Item
          name="product_table_id"
          label={
            <span>
              Escolher Tabela&nbsp;
              <Tooltip title="Item de revenda entrará nesta tabela de produto como 'aguardando precificação'. Ao precificar, os dados (NCM, descrição, custo) já virão preenchidos.">
                <InfoCircleOutlined style={{ color: '#64748b' }} />
              </Tooltip>
            </span>
          }
        >
          <Select
            allowClear
            placeholder={productTables.length === 0 ? 'Nenhuma tabela de produto cadastrada' : 'Selecione a tabela de produto'}
            disabled={productTables.length === 0}
            options={productTables.map((t) => ({ value: t.id, label: t.name }))}
          />
        </Form.Item>
      )}

      <Form.Item
        name="ncm_code"
        label={
          <span>
            NCM&nbsp;
            <Tooltip title="Nomenclatura Comum do Mercosul — digite o código ou pesquise por nome do produto">
              <InfoCircleOutlined style={{ color: '#64748b' }} />
            </Tooltip>
          </span>
        }
      >
        <AutoComplete
          options={ncmOptions}
          onSearch={handleNcmSearch}
          onSelect={handleNcmFieldSelect}
          placeholder="Digite o NCM ou pesquise (ex: farinha, 1901...)"
          notFoundContent={ncmFieldSearching ? <Spin size="small" /> : null}
          allowClear
        />
      </Form.Item>

      {(ncmSearching || ncmSuggestions.length > 0) && (
        <div style={{
          marginTop: -12, marginBottom: 12, padding: '8px 12px',
          background: '#0a1628', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8,
        }}>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
            <SearchOutlined style={{ fontSize: 10 }} />
            Sugestões de NCM para o nome digitado:
          </div>
          {ncmSearching ? (
            <div style={{ textAlign: 'center', padding: '8px 0' }}><Spin size="small" /></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {ncmSuggestions.map((s) => (
                <div
                  key={s.code}
                  onClick={() => handleSelectNcm(s.code)}
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
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
        Dados da Compra
      </Divider>

      {/* Linha 1: Unidade de medida | QTD. Medida | Valor unitário */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, alignItems: 'end' }}>
        <Form.Item
          name="unitType"
          label="Unidade de medida"
          rules={[{ required: true, message: REQUIRED }]}
          initialValue="UN"
          style={{ marginBottom: 24 }}
        >
          <Select onChange={() => setTimeout(recalcCostPerUnit, 50)}>
            <Select.Option value="G">Gramas (g)</Select.Option>
            <Select.Option value="KG">Quilos (kg)</Select.Option>
            <Select.Option value="ML">Mililitros (ml)</Select.Option>
            <Select.Option value="L">Litros (l)</Select.Option>
            <Select.Option value="MM">Milímetros (mm)</Select.Option>
            <Select.Option value="CM">Centímetros (cm)</Select.Option>
            <Select.Option value="M">Metros (m)</Select.Option>
            <Select.Option value="M2">Área (m²)</Select.Option>
            <Select.Option value="M3">Volume (m³)</Select.Option>
            <Select.Option value="UN">Unidade (un)</Select.Option>
          </Select>
        </Form.Item>

        <Form.Item
          name="measure_quantity"
          label={
            <span>
              QTD. Medida&nbsp;
              <Tooltip title="Volume ou medida de cada unidade comprada (ex: 900 para uma garrafa de 900ml). Usado para fracionar o custo na precificação.">
                <InfoCircleOutlined style={{ color: '#64748b' }} />
              </Tooltip>
            </span>
          }
          initialValue={1}
          style={{ marginBottom: 24 }}
        >
          <InputNumber
            min={0.001}
            step="any"
            style={{ width: '100%' }}
            placeholder="Ex: 900"
            onChange={() => setTimeout(recalcCostPerUnit, 50)}
          />
        </Form.Item>

        <Form.Item
          name="price"
          label={
            <span>
              Valor unitário&nbsp;
              <Tooltip title="Valor unitário do item (por unidade de medida). O valor custo líquido será calculado automaticamente.">
                <InfoCircleOutlined style={{ color: '#64748b' }} />
              </Tooltip>
            </span>
          }
          rules={[{ required: true, message: REQUIRED }]}
          style={{ marginBottom: 24 }}
        >
          <Input
            prefix="R$"
            autoComplete="off"
            placeholder="0,00"
            onChange={({ target }) => handleChangePrice(target.value)}
          />
        </Form.Item>
      </div>

      {/*
        AS DUAS LINHAS LEGADAS DE ALÍQUOTA SAÍRAM em 26/09/2026.

        "Linha de impostos 1" (ICMS, ICMS Deferido e a leitura de recuperáveis) e
        "Linha de impostos 2" (PIS/COFINS) perguntavam as MESMAS alíquotas que o container
        "Impostos da compra" já lista logo abaixo. O usuário preenchia em cima, via repetido
        embaixo, e não conseguia editar embaixo.

        `copia-divergente.md` manda apagar uma das duas, e a que fica é a que descreve a
        regra certa: o container conhece a posição de cada tributo, a vedação por regime e o
        crédito em R$. Os CAMPOS são os mesmos, com os mesmos nomes e a mesma gravação — o
        que mudou foi ONDE se digita, pela costura `extras`.

        A LINHA DO SIMPLES HÍBRIDO CONTINUA abaixo: ela usa `pis_rate` e `cofins_rate`, que
        são outros dois campos, e o §3 do comando nomeia só `pis_cofins_rate`.
      */}
      {isLucroRealOrLP && (
        <>
          {/* Linha de impostos 2 (Simples Híbrido): PIS | COFINS não-cumulativo (vindos do NCM) */}
          {isSimplesHibrido && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, alignItems: 'end' }}>
              <Form.Item
                name="pis_rate"
                label={
                  <span>
                    PIS (%)&nbsp;
                    <Tooltip title="Alíquota PIS não-cumulativo. Preenchida automaticamente ao selecionar o NCM (1,65%), mas pode ser editada manualmente conforme a nota fiscal.">
                      <InfoCircleOutlined style={{ color: '#64748b' }} />
                    </Tooltip>
                  </span>
                }
                initialValue={0}
                style={{ marginBottom: 24 }}
              >
                <PercentInput
                  min={0}
                  max={100}
                  style={{ width: '100%' }}
                  onChange={() => setTimeout(recalcNetCost, 50)}
                />
              </Form.Item>

              <Form.Item
                name="cofins_rate"
                label={
                  <span>
                    COFINS (%)&nbsp;
                    <Tooltip title="Alíquota COFINS não-cumulativo. Preenchida automaticamente ao selecionar o NCM (7,6%), mas pode ser editada manualmente conforme a nota fiscal.">
                      <InfoCircleOutlined style={{ color: '#64748b' }} />
                    </Tooltip>
                  </span>
                }
                initialValue={0}
                style={{ marginBottom: 24 }}
              >
                <PercentInput
                  min={0}
                  max={100}
                  style={{ width: '100%' }}
                  onChange={() => setTimeout(recalcNetCost, 50)}
                />
              </Form.Item>
            </div>
          )}

          {/*
            §4.1 — A ORDEM SE INVERTE, E OS DOIS VIRAM AS DUAS METADES DO MESMO COMPONENTE.

            "Impostos não recuperáveis" vinha ANTES do bloco de crédito, e a ordem ensinava
            a coisa errada: o que compõe o custo aparecia primeiro, e o que sai dele depois.
            Agora crédito em cima, custo embaixo, com os rótulos do §2 — e o bloco de custo
            é PASSADO ao componente, não desenhado ao lado dele. Ao lado, ele seria uma
            segunda tabela com regra própria; dentro, ele é a metade de baixo da mesma.
          */}
          <PurchaseTaxCredits
            modo="posicao"
            /*
              O SUBTÍTULO DEIXOU DE SER FIXO NO COMPONENTE em 24/09/2026, e passa a vir de
              quem o usa. O item continua com o texto de sempre — ele descreve o que ESTA
              tela faz, e é aqui que "custo bruto" e "custo líquido" continuam na tela.
            */
            subtitulo="O custo bruto é o valor da compra. O custo líquido — que é o que a precificação usa — é o bruto menos o que gera crédito."
            bandeiras={bandeiras}
            custo={custoDoItem}
            visivel={isLucroRealOrLP}
            unidadeLabel={baseUnitLabel}
            onToggle={handleToggleCredito}
            onRecalc={recalcNetCost}
            extras={camposDeAliquota}
            legenda={legendasDasLinhas}
            blocoDeCusto={(
              <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: 8, padding: '12px 14px', marginTop: 12, marginBottom: 4 }}>
            {/* ICMS-ST: valor manual em R$ */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              {/*
                §4.2 — OS CAMPOS EXISTENTES FICAM COM OS NOMES E COM O `initialValue={0}`
                QUE TÊM. Trocá-lo por vazio mudaria o SIGNIFICADO do que já está gravado:
                zero passaria a ser "não informado" em 72 itens que o gravaram como zero.
                O campo NOVO (`fcp_value`) nasce sem default, que é a regra para o que
                ainda não existe.
              */}
              <Form.Item name="icms_st_value" label="ICMS-ST (valor inserido manualmente)" initialValue={0} style={{ marginBottom: 0 }}>
                <InputNumber
                  min={0} step={0.01} precision={2} style={{ width: '100%' }}
                  placeholder="0,00"
                  formatter={(v: any) => { const n = Number(v ?? 0); return 'R$ ' + (isNaN(n) ? '0,00' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) }}
                  parser={(v: any) => { const r = String(v || '0').replace('R$', '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.').trim(); return isNaN(Number(r)) ? 0 : Number(r) }}
                />
              </Form.Item>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 12 }}>
              <Form.Item
                name="fcp_value"
                label={<span>FCP (valor da nota)<Tooltip title="Fundo de Combate à Pobreza — vFCPUFDest na NF-e. Nunca gera crédito. Deixe vazio se a nota não traz o campo: vazio e zero são coisas diferentes."><InfoCircleOutlined style={{ color: '#64748b', marginLeft: 4 }} /></Tooltip></span>}
                style={{ marginBottom: 0 }}
              >
                <InputNumber
                  min={0} step={0.01} precision={2} style={{ width: '100%' }}
                  placeholder="não informado"
                  onChange={() => setTimeout(recalcNetCost, 50)}
                  formatter={(v: any) => (v == null || v === '' ? '' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}
                  parser={(v: any) => { const r = String(v || '').replace('R$', '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.').trim(); return r === '' ? (null as any) : Number(r) }}
                />
              </Form.Item>
            </div>

            {/* IPI: alíquota % → R$ calculado */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12, alignItems: 'end' }}>
              <Form.Item name="ipi_nr_pct" label="IPI — Alíquota (%)" initialValue={0} style={{ marginBottom: 0 }}>
                <PercentInput min={0} max={100} style={{ width: '100%' }} />
              </Form.Item>
              <div style={{ paddingBottom: 1 }}>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>IPI calculado</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: ipiCalc > 0 ? '#fca5a5' : '#64748b' }}>{fmtBRL(ipiCalc)}</div>
              </div>
            </div>

            {/* DIFAL: alíquota origem + destino → R$ calculado */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12, marginTop: 12, alignItems: 'end' }}>
              <Form.Item name="difal_origem_pct" label={<span>DIFAL — Alíq. origem (%)<Tooltip title="Alíquota de ICMS interestadual do estado de origem do fornecedor."><InfoCircleOutlined style={{ color: '#64748b', marginLeft: 4 }} /></Tooltip></span>} initialValue={0} style={{ marginBottom: 0 }}>
                <PercentInput min={0} max={100} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="difal_destino_pct" label={<span>DIFAL — Alíq. destino (%)<Tooltip title="Alíquota de ICMS do estado de destino da venda."><InfoCircleOutlined style={{ color: '#64748b', marginLeft: 4 }} /></Tooltip></span>} initialValue={0} style={{ marginBottom: 0 }}>
                <PercentInput min={0} max={100} style={{ width: '100%' }} />
              </Form.Item>
              <div style={{ paddingBottom: 1 }}>
                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>DIFAL calculado</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: difalCalc > 0 ? '#fca5a5' : '#64748b' }}>{fmtBRL(difalCalc)}</div>
              </div>
            </div>
            {totalNaoRec > 0 && (
              <div style={{ borderTop: '1px solid rgba(239,68,68,0.2)', marginTop: 12, paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#94a3b8' }}>Total impostos não recuperáveis</span>
                <span style={{ fontWeight: 700, color: '#fca5a5' }}>{fmtBRL(totalNaoRec)}</span>
              </div>
            )}
              </div>
            )}
          />


          {/* Linha de impostos 3 (Lucro Real / Lucro Presumido): Valor custo líquido | QTD. Comprado | Estoque mínimo */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, alignItems: 'end' }}>
            <Form.Item
              label={
                <span>
                  Valor custo líquido&nbsp;
                  <Tooltip title={isLucroPresumido ? 'Calculado: Valor unit. − ICMS rec. + Impostos não recuperáveis (ICMS-ST + IPI + DIFAL).' : 'Calculado: Valor unit. − ICMS rec. − PIS/COFINS + Impostos não recuperáveis (ICMS-ST + IPI + DIFAL).'}>
                    <InfoCircleOutlined style={{ color: '#64748b' }} />
                  </Tooltip>
                </span>
              }
              style={{ marginBottom: 24 }}
            >
              <Input
                prefix="R$"
                value={netCostDisplay || ''}
                disabled
                placeholder="Preencha valor e impostos"
                style={{ background: 'rgba(34, 197, 94, 0.08)', borderColor: 'rgba(34, 197, 94, 0.3)', color: '#22C55E', fontWeight: 600 }}
              />
            </Form.Item>

            {quantidadeField}
            {estoqueField}
          </div>
        </>
      )}

      {/* Linha QTD + Estoque para não-Lucro Real e não-Lucro Presumido */}
      {!isLucroRealOrLP && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, alignItems: 'start' }}>
          {quantidadeField}
          {estoqueField}
        </div>
      )}

      {/* Observação */}
      {isLucroRealOrLP ? (() => {
        const vals = form.getFieldsValue()
        const priceStr = String(vals.price || '0').replace(/\./g, '').replace(',', '.')
        const priceNum = parseFloat(priceStr) || 0
        const costNet = Number(vals.cost_net) || 0
        const qty = Number(vals.quantity) || 0
        const totalNet = costNet * qty
        return (
          <div style={{
            background: 'rgba(34, 197, 94, 0.12)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: 12,
            color: '#e2e8f0',
            marginBottom: 16,
          }}>
            <InfoCircleOutlined style={{ color: '#22C55E', marginRight: 6 }} />
            <strong>Valor Unitário cheio:&nbsp;</strong>
            <Tag color="blue" style={{ fontSize: 13, fontWeight: 600 }}>
              R$&nbsp;{priceNum > 0 ? getMonetaryValue(priceNum) : '—'}
            </Tag>
            <br />
            <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, display: 'inline-block' }}>
              {costNet > 0 && qty > 0
                ? `Ex: valor custo líquido R$ ${formatBRL3(costNet)} × ${qty} un = Valor total R$ ${getMonetaryValue(totalNet)}`
                : 'Preencha o valor unitário e os impostos para calcular o custo líquido total.'
              }
            </span>
          </div>
        )
      })() : (
        <div style={{
          background: 'rgba(34, 197, 94, 0.12)',
          border: '1px solid rgba(34, 197, 94, 0.3)',
          borderRadius: 8,
          padding: '10px 14px',
          fontSize: 12,
          color: '#e2e8f0',
          marginBottom: 16,
        }}>
          <InfoCircleOutlined style={{ color: '#22C55E', marginRight: 6 }} />
          <strong>Valor total (auto calculado):</strong>{' '}
          {costPerUnit ? (
            <Tag color="green" style={{ fontSize: 13, fontWeight: 600 }}>
              {costPerUnit}
            </Tag>
          ) : (
            <span style={{ color: '#64748b' }}>Preencha valor unitário e quantidade para calcular</span>
          )}
          <br />
          <span style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, display: 'inline-block' }}>
            Ex: valor unitário R$&nbsp;5,00 × 10&nbsp;un = Valor total R$&nbsp;50,00.
          </span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        <Form.Item name="supplier_name" label="Fornecedor">
          <Input placeholder="Nome do fornecedor" onChange={(e) => form.setFieldsValue({ supplier_name: capitalizeFirst(e.target.value) })} />
        </Form.Item>

        <Form.Item
          name="supplier_state"
          label={
            <span>
              Estado do fornecedor&nbsp;
              <Tooltip title={isLucroRealOrLP ? 'Usado para calcular ICMS na entrada (crédito) e o Valor Custo Líquido' : 'Usado para calcular ICMS na entrada (crédito)'}>
                <InfoCircleOutlined style={{ color: '#64748b' }} />
              </Tooltip>
            </span>
          }
        >
          <Select
            placeholder="UF"
            showSearch
            allowClear
          >
            {STATES.map(s => (
              <Select.Option key={s} value={s}>{s}</Select.Option>
            ))}
          </Select>
        </Form.Item>
      </div>

      <Form.Item name="observation" label="Observação">
        <Input.TextArea rows={3} style={{ resize: 'none' }} placeholder="Informações adicionais..." />
      </Form.Item>
    </Form>
  )
}

export { NewItemForm }
