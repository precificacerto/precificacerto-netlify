import React, { useState, useEffect, useMemo } from 'react'
import {
    Button, DatePicker, Space, message, Alert,
    Form, Input, InputNumber, Drawer, Modal, Table, Tag, Radio, Popconfirm, Tooltip, Checkbox, Collapse,
} from 'antd'
import { Select } from '@/components/ui/app-select.component'
import { CurrencyInput } from '@/components/currency-input.component'
import dayjs, { type Dayjs } from 'dayjs'
import { Layout } from '@/components/layout/layout.component'
import { PAGE_TITLES } from '@/constants/page-titles'
import { supabase } from '@/supabase/client'
import { getTenantId } from '@/utils/get-tenant-id'
import { getEffectiveIncomeAmount } from '@/utils/cash-entry-amount'
import {
    ehRecebimentoPrevisto, entraNaProjecao, efeitoNoSaldo, rotuloDaFaixaDePrevisto,
    saldoAcumuladoPorDia,
} from '@/utils/projecao-de-caixa'
import { mergeExpenseConfig } from '@/utils/recalc-expense-config'
import { ehCompromissoFinanceiro, separarJurosEPrincipal, LABEL_DO_BLOCO } from '@/utils/compromissos-financeiros'
import { naturezaDaDespesa, formaDoBlocoFiscal } from '@/utils/natureza-da-despesa'
import {
    useVencidos, FaixaDeVencidos, VencidosModal, deveAbrirSozinho,
} from '@/components/cashflow/vencidos-modal.component'
import { chaveDeDispensa } from '@/utils/vencidos-do-tenant'
import { LARGURA_MODAL_50 } from '@/utils/largura-de-modal'
import {
    ehGuiaDeImposto, competenciaSugerida, guiaEntraNaApuracao,
    OPCOES_DE_TRIBUTO, OPCOES_DE_TIPO_DE_GUIA,
} from '@/utils/apuracao-de-tributos'
import {
    resolverFlagsDoItem, calcularCustoDoItem,
    TRIBUTOS_CREDITAVEIS, type TributoCreditavel,
} from '@/utils/custo-liquido-do-item'
import PurchaseTaxCredits from '@/page-parts/items/purchase-tax-credits.component'
import EntradaDeImposto from '@/components/despesas/entrada-de-imposto.component'
import { baseDaLinha, colunasDaEntrada, valorAPartirDaAliquota, CAMPO_DA_ALIQUOTA, FORMATO_PADRAO, type FormatoDaEntrada } from '@/utils/entrada-de-imposto'
import { descascarANota, ratearParcelas, linhasDoDescascamento } from '@/utils/nota-de-compra'
import { vinculoDaSerie, AVISO_SEM_VINCULO, espelhoDoEstorno, notaEstaEstornada } from '@/utils/serie-e-estorno'
import PercentInput from '@/components/percent-input.component'
import {
    calcularImpactoDoRateio, houveMudancaDoPercentual, type ImpactoDoRateio,
} from '@/utils/impacto-do-rateio'

/** As quatro colunas que o aviso de impacto do §9 lê de `products`. */
type ProdutoDoImpacto = { id: string; name?: string | null; cost_total?: number | null; sale_price?: number | null }
import {
    CalendarOutlined, FileExcelOutlined, InfoCircleOutlined, WarningOutlined,
} from '@ant-design/icons'
import { usePermissions, MODULES } from '@/hooks/use-permissions.hook'
import { useDevice } from '@/contexts/device.context'

// Onda 3 / CRÍT-perf (Founder 2026-05-27): types/helpers leves importados
// estaticamente; funções pesadas (ExcelJS, jsPDF) via dynamic import.
import { INCOME_LABELS, getIncomeLabel } from '@/utils/cash-flow-types'
import { ExportFormatModal } from '@/components/ui/export-format-modal.component'
import { getExpenseGroupLabel, getExpenseGroupColor } from '@/constants/cashier-category'
import {
    CATEGORY_GROUP_MAP,
    getExpenseCategoryOptionsForRegime,
    getGroupForCategoryByRegime,
} from '@/constants/expense-categories-by-regime'
import { formatBRL } from '@/utils/formatters'
import { PAGE_SIZE } from '@/constants/pagination'

const formatCurrency = formatBRL

const EXPENSE_PAYMENT_METHODS = [
    { value: 'DINHEIRO', label: '💵 Dinheiro' },
    { value: 'PIX', label: '⚡ PIX' },
    { value: 'TRANSFERENCIA', label: '🏦 Transferência' },
    { value: 'CARTAO_DEBITO', label: '💳 Cartão de Débito' },
    { value: 'CARTAO_CREDITO', label: '💳 Cartão de Crédito' },
    { value: 'BOLETO', label: '📄 Boleto' },
    { value: 'CHEQUE', label: '🧾 Cheque' },
    { value: 'CHEQUE_PRE_DATADO', label: '🗓️ Cheque Pré-datado' },
]

const PAYMENT_CONDITIONS = [
    { value: '30', label: '30 dias' },
    { value: '30_60', label: '30/60 dias' },
    { value: '30_60_90', label: '30/60/90 dias' },
]

function getGroupForCategory(cat: string): string | undefined {
    return CATEGORY_GROUP_MAP.find(c => c.category === cat)?.group
}

// ── Ordered list of expense groups for display ──
const GROUP_ORDER = [
    'CUSTO_PRODUTOS',
    'MAO_DE_OBRA_PRODUTIVA',
    'MAO_DE_OBRA_ADMINISTRATIVA',
    'MAO_DE_OBRA',
    'DESPESA_FIXA',
    'DESPESA_VARIAVEL',
    'ATIVIDADES_TERCEIRIZADAS',
    'DESPESA_FINANCEIRA',
    'COMISSOES',
    'RESERVA_TECNICA',
    'LUCRO',
    'IMPOSTO_LUCRO',
    'IMPOSTO_FATURAMENTO_DENTRO',
    'IMPOSTO',
    'REGIME_TRIBUTARIO',
    'OUTROS',
]

const GROUP_COLORS: Record<string, string> = {
    CUSTO_PRODUTOS:              '#EF4444',
    MAO_DE_OBRA_PRODUTIVA:       '#7C3AED',
    MAO_DE_OBRA_ADMINISTRATIVA:  '#A855F7',
    MAO_DE_OBRA:                 '#8B5CF6',
    DESPESA_FIXA:                '#2563EB',
    DESPESA_VARIAVEL:            '#059669',
    ATIVIDADES_TERCEIRIZADAS:    '#0891B2',
    DESPESA_FINANCEIRA:          '#D97706',
    COMISSOES:                   '#14B8A6',
    RESERVA_TECNICA:             '#06B6D4',
    LUCRO:                       '#16A34A',
    IMPOSTO_LUCRO:               '#9B1C1C',
    IMPOSTO_FATURAMENTO_DENTRO:  '#C81E1E',
    IMPOSTO:                     '#DC2626',
    REGIME_TRIBUTARIO:           '#B91C1C',
    OUTROS:                      '#64748b',
}

const currencyMaskFn = (value: string) => {
    const digits = value.replace(/\D/g, '')
    if (!digits) return ''
    const num = parseInt(digits, 10) / 100
    return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
const parseCurrencyFn = (val: string) =>
    parseFloat(val.replace(/\./g, '').replace(',', '.')) || 0

// AntD InputNumber formatters (mostram "12.548,98" com ponto para milhares e vírgula decimal)
const brlFormatter = (value: number | string | undefined): string => {
    if (value == null || value === '') return ''
    const num = typeof value === 'string' ? parseFloat(value) : value
    if (isNaN(num as number)) return ''
    return (num as number).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
const brlParser = (value: string | undefined): string => {
    if (!value) return ''
    const cleaned = value.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')
    return cleaned
}

/** R$ no formato brasileiro, para as leituras do bloco de impostos e do total da nota. */
const brl = (v: number | null | undefined): string =>
    'R$ ' + (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * §5.3 — OS QUATRO CAMPOS DO BLOCO DE CUSTO DA NOTA.
 *
 * A lista mora aqui, e não inline no JSX, porque ela é o MESMO mapeamento que o `insert` da
 * nota usa: acrescentar um tributo ao bloco sem acrescentá-lo à gravação seria a cópia
 * divergente com a assinatura de sempre — o campo aparece na tela e não chega ao banco.
 */
const CAMPOS_DO_BLOCO_DE_CUSTO = [
    { name: 'valor_ipi_custo', linha: 1, label: 'IPI de custo (sem crédito)', ajuda: 'A parte do IPI da nota que NÃO gera crédito — revenda, uso e consumo. A parte creditável fica no bloco de cima, e a mesma nota pode ter as duas.' },
    { name: 'valor_icms_st', linha: 2, label: 'ICMS-ST', ajuda: 'Na NF-e: vICMSST. A substituição encerra a cadeia e o adquirente não credita.' },
    { name: 'valor_difal', linha: 2, label: 'DIFAL', ajuda: 'Diferencial de alíquota, em R$, como apurado na nota. Informado, ele vence a fórmula de base dupla.' },
    { name: 'valor_fcp', linha: 2, label: 'FCP', ajuda: 'Na NF-e: vFCPUFDest. Nunca gera crédito. Deixe vazio se a nota não traz o campo.' },
] as const

/**
 * §1 — AS DUAS LINHAS DO BLOCO 1A, NA ORDEM DO DOCUMENTO.
 *
 * O campo `linha` mora na MESMA lista dos campos, e não numa segunda estrutura ao lado:
 * duas listas fariam um tributo novo entrar na tela sem entrar no layout — ele cairia na
 * linha errada sem nada falhar, que é a assinatura de `copia-divergente.md`.
 *
 * A divisão não é estética. A primeira linha tem os dois que são do PRODUTO e vêm
 * destacados no corpo da nota (o IPI de custo e o IS); a segunda tem os três que são da
 * OPERAÇÃO interestadual (ICMS-ST, DIFAL, FCP). É a ordem em que o usuário lê o documento,
 * e é por isso que a grade deixou de ser `auto-fit`: ela reagrupava os campos conforme a
 * largura da tela e desfazia a leitura.
 */
const linhaDoBloco1A = (n: 1 | 2) => CAMPOS_DO_BLOCO_DE_CUSTO.filter((c) => c.linha === n)

/** O input em R$ do bloco fiscal. Sem `initialValue`: vazio é vazio (`ausente-vs-falso.md`). */
const INPUT_EM_REAIS = {
    min: 0,
    step: 0.01,
    precision: 2,
    style: { width: '100%' },
    placeholder: 'não informado',
    formatter: (v: unknown) => (v == null || v === '' ? '' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })),
    parser: (v?: string) => {
        const r = String(v ?? '').replace('R$', '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.').trim()
        return (r === '' ? null : Number(r)) as unknown as number
    },
} as const

/**
 * Um DEGRAU da escada — o saldo e a base.
 *
 * Eles são leitura, não campo: o usuário não digita nem um nem outro. Destacá-los é o que
 * faz a escada ser lida como escada, em vez de uma lista de campos onde dois por acaso não
 * aceitam clique.
 */
function LinhaDeDegrau({ rotulo, valor, apoio }: { rotulo: string; valor: number | null; apoio?: string }) {
    return (
        <div style={{ margin: '4px 0 14px', padding: '10px 14px', background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.3)', borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <strong style={{ fontSize: 13, color: '#93c5fd' }}>{rotulo}</strong>
                <strong style={{ fontSize: 15, color: '#e2e8f0' }}>
                    {/* Travessão quando não é calculável: zero afirmaria uma base que ninguém apurou. */}
                    {valor == null ? '—' : 'R$ ' + valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>
            </div>
            {apoio && <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>{apoio}</div>}
        </div>
    )
}

/**
 * O FORMATO INICIAL DE CADA LINHA NA TELA DE DESPESA — §3 do comando de 24/09/2026.
 *
 * `FORMATO_PADRAO` continua sendo `'BRL'`, e continua sendo o padrão do repositório: os
 * valores vêm destacados na nota. O PIS/COFINS é a exceção, e por um motivo próprio — a
 * base dele NÃO está no documento (é `saldo − ICMS`, que o descascamento calcula), então o
 * que o usuário conhece ali é a alíquota. Pedir o valor obrigaria a conferir contra uma
 * base que a nota não traz.
 *
 * É formato de APRESENTAÇÃO de linha nova. Nota já gravada reabre no formato gravado.
 */
const FORMATO_DA_LINHA: Record<TributoCreditavel, FormatoDaEntrada> = {
    ICMS: 'BRL',
    IPI: 'BRL',
    CBS: 'BRL',
    IBS: 'BRL',
    PIS_COFINS: 'PCT',
}

/**
 * A TERCEIRA LINHA DO BLOCO 3 — a base manual do PIS/COFINS.
 *
 * >>> POR QUE UM CHECK, E NÃO UM CAMPO SEMPRE VISÍVEL <<<
 * Porque a base nativa é a resposta certa em quase toda nota, e um campo vazio ao lado dela
 * convida a preenchê-lo. O check afirma que há uma exceção; quem não tem exceção não vê
 * campo nenhum.
 *
 * >>> O AVISO NÃO É ORNAMENTO <<<
 * A base manual é usada COMO ESTÁ — o ICMS não é deduzido de novo. Sem o aviso, quem digita
 * "a base é 820" e vê 75,85 acha que o sistema deduziu; quem digita 1.000 esperando 75,85
 * recebe 92,50 e não sabe por quê.
 *
 * >>> A ALÍQUOTA DESCE PARA CÁ <<<
 * Ela é o MESMO campo `pis_cofins_rate`, e não uma segunda cópia: dois `Form.Item` com o
 * mesmo `name` seriam dois controles para um número, e a linha de cima mostraria um valor
 * que a de baixo acabou de mudar. Com a base manual ligada, o par (base, alíquota) fica
 * junto, que é como ele é lido.
 */
function LinhaDaBaseManual({ ligado, baseEfetiva, formatoDaAliquota, onFormato, desabilitado }: {
    ligado: boolean
    baseEfetiva: number
    formatoDaAliquota: FormatoDaEntrada
    onFormato: (f: FormatoDaEntrada) => void
    desabilitado: boolean
}) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 12, padding: '10px 0 0' }}>
            <span />
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <Form.Item name="usar_base_manual_pis_cofins" valuePropName="checked" style={{ marginBottom: 0 }}>
                    <Checkbox><span style={{ fontSize: 12 }}>a base não é essa — informar manualmente</span></Checkbox>
                </Form.Item>
                {ligado && (
                    <>
                        <Form.Item name="base_manual_pis_cofins" style={{ marginBottom: 0, width: 170 }}>
                            <InputNumber {...INPUT_EM_REAIS} placeholder="base em R$" />
                        </Form.Item>
                        <Form.Item name="pis_cofins_rate" noStyle>
                            <EntradaDeImposto
                                base={baseEfetiva}
                                formato={formatoDaAliquota}
                                onFormato={onFormato}
                                disabled={desabilitado}
                            />
                        </Form.Item>
                        <span style={{ fontSize: 11, color: '#fca5a5' }}>
                            usada como está — o ICMS não é deduzido de novo
                        </span>
                    </>
                )}
            </div>
        </div>
    )
}

/**
 * A BASE de cada linha, para o campo em R$ converter.
 *
 * Ela vem do DESCASCAMENTO, que é quem sabe a ordem: os por fora incidem sobre a base, o
 * ICMS sobre a base menos a fatia em ST, e o PIS/COFINS sobre a base menos o ICMS e a fatia
 * monofásica. Uma segunda opinião aqui faria o campo converter por uma base e a conta usar
 * outra — e os dois lados fechariam consigo mesmos.
 */
const BASE_DA_LINHA_NO_DESCASCAMENTO = (
    d: { base: number | null; basesPorDentro: { icms: number; pisCofins: number } },
    t: TributoCreditavel,
): number => {
    if (t === 'ICMS') return d.basesPorDentro.icms
    if (t === 'PIS_COFINS') return d.basesPorDentro.pisCofins
    return d.base ?? 0
}

const PAYMENT_METHODS = [
    { value: 'PIX', label: '⚡ PIX' },
    { value: 'DINHEIRO', label: '💵 Dinheiro' },
    { value: 'CARTAO_CREDITO', label: '💳 Cartão Crédito' },
    { value: 'CARTAO_DEBITO', label: '💳 Cartão Débito' },
    { value: 'BOLETO', label: '📄 Boleto' },
    { value: 'TRANSFERENCIA', label: '🏦 Transferência' },
    { value: 'CHEQUE', label: '🧾 Cheque' },
    { value: 'CHEQUE_PRE_DATADO', label: '🗓️ Cheque Pré-datado' },
]

const INSTALLMENT_PRESETS = [
    { value: 'customizado', label: 'Cheque pré-datado' },
    { value: '30', label: '30' },
    { value: '30_60', label: '30/60' },
    { value: '30_60_90', label: '30/60/90' },
    { value: '30_60_90_120', label: '30/60/90/120' },
    { value: '30_60_90_120_150', label: '30/60/90/120/150' },
]

function buildInstallmentsByPreset(preset: string): { date: any; amount: number }[] {
    const today = dayjs()
    if (preset === '30') return [{ date: today.add(30, 'day'), amount: 0 }]
    if (preset === '30_60') return [{ date: today.add(30, 'day'), amount: 0 }, { date: today.add(60, 'day'), amount: 0 }]
    if (preset === '30_60_90') return [{ date: today.add(30, 'day'), amount: 0 }, { date: today.add(60, 'day'), amount: 0 }, { date: today.add(90, 'day'), amount: 0 }]
    if (preset === '30_60_90_120') return [{ date: today.add(30, 'day'), amount: 0 }, { date: today.add(60, 'day'), amount: 0 }, { date: today.add(90, 'day'), amount: 0 }, { date: today.add(120, 'day'), amount: 0 }]
    if (preset === '30_60_90_120_150') return [{ date: today.add(30, 'day'), amount: 0 }, { date: today.add(60, 'day'), amount: 0 }, { date: today.add(90, 'day'), amount: 0 }, { date: today.add(120, 'day'), amount: 0 }, { date: today.add(150, 'day'), amount: 0 }]
    return [{ date: null, amount: 0 }]
}

export default function CashFlow() {
    const [data, setData] = useState<any[]>([])
    const { canView, canEdit } = usePermissions()
    const { isMobile, isTablet } = useDevice()
    const isCompact = isMobile || isTablet
    const [employees, setEmployees] = useState<any[]>([])
    const [customerMap, setCustomerMap] = useState<Record<string, string>>({})
    const [saleCodeMap, setSaleCodeMap] = useState<Record<string, string>>({})
    const [taxRegime, setTaxRegime] = useState<string | null>(null)
    /** A segmentação do tenant — é ela que decide o padrão do IPI no crédito da compra. */
    const [calcType, setCalcType] = useState<string | null>(null)
    const [tenantIdDaTela, setTenantIdDaTela] = useState<string | null>(null)
    const [vencidosAbertos, setVencidosAbertos] = useState(false)
    const [vencidosToken, setVencidosToken] = useState(0)
    const [loading, setLoading] = useState(false)
    const [month, setMonth] = useState(dayjs())

    const [drawerOpen, setDrawerOpen] = useState(false)
    const [expenseAmount, setExpenseAmount] = useState('')
    /* §1 — o link "esta nota tem outros tributos". Sessão do drawer, nunca preferência. */
    const [revelarEscadaCompleta, setRevelarEscadaCompleta] = useState(false)
    const [selectedDay, setSelectedDay] = useState<number | null>(null)
    const [loadingPrevBalance, setLoadingPrevBalance] = useState(false)
    const [prevBalanceModalOpen, setPrevBalanceModalOpen] = useState(false)
    // Item 10 (Relatório 24/07): `prevBalanceInput` guarda a MAGNITUDE (>= 0); o sinal
    // fica em `prevBalanceNegative`, pois a máscara monetária padrão não digita "−".
    const [prevBalanceInput, setPrevBalanceInput] = useState<number>(0)
    const [prevBalanceNegative, setPrevBalanceNegative] = useState<boolean>(false)
    const [expPaymentMethod, setExpPaymentMethod] = useState<string>('')
    const [expInstallments, setExpInstallments] = useState<{ date: any; amount: number }[]>([{ date: null, amount: 0 }])
    const [expInstallmentPreset, setExpInstallmentPreset] = useState<'customizado' | '30' | '30_60' | '30_60_90' | '30_60_90_120' | '30_60_90_120_150'>('customizado')
    // Correção Felipe (10/08): para métodos que não são Boleto/Cheque Pré-datado, permitir
    // detalhar manualmente cada vencimento (data + valor), além do parcelamento mensal
    // automático. Quando `expManualDates` é true, reutiliza o mesmo editor de datas/valores.
    const [expManualDates, setExpManualDates] = useState(false)

    // Lucro Real / Simples Híbrido — detalhamento de impostos no custo dos produtos
    const [selectedExpenseCategory, setSelectedExpenseCategory] = useState('')
    // Item 1.2 (Relatório 03/08): PIS e COFINS unificados em um único campo na UI.
    // Ao salvar, o valor TOTAL vai para `valor_pis` e `valor_cofins` recebe 0 (mantém
    // compatibilidade com relatórios que somam as duas colunas).
    // §6 — juros e principal da parcela de um compromisso financeiro. STRING VAZIA é "não
    // informado", e é ela que vira `null` no banco: `ausente-vs-falso.md`.
    const [compJuros, setCompJuros] = useState<string>('')
    const [compPrincipal, setCompPrincipal] = useState<string>('')
    // §3 — o bloco de impostos passa a valer para TODA despesa. As alíquotas entram por
    // `Form.Item`, e as bandeiras ficam aqui: `null` é "o usuário não decidiu" e cai no
    // padrão da natureza; `false` é "desligou" e vence o padrão (`ausente-vs-falso.md`).
    /*
      §5.1 — `creditoGravado` SAIU.

      Ele guardava, em estado local, o que o switch de cada linha dizia. Com a POSIÇÃO como
      decisão, esse estado seria uma segunda fonte para o mesmo fato: a bandeira resolvida
      por `resolverFlagsDoItem` já diz em que bloco a linha está, e um segundo lugar para
      guardá-lo é como a divergência começa (`copia-divergente.md`).

      Aqui, diferente do cadastro de item, não há coluna a gravar: o lançamento de despesa
      grava o CRÉDITO EM R$ na nota, e quem decide o crédito é a natureza da despesa mais a
      lei. Não há o que o usuário escolha por tributo — e era isso que o switch fingia.
    */
    /**
     * §4 — O FORMATO DE ENTRADA DE CADA LINHA: % ou R$.
     *
     * Ele é POR LINHA porque a nota é assim: o ICMS vem destacado em reais e a alíquota do
     * IPI vem em percentual, na mesma nota. Um seletor único obrigaria o usuário a converter
     * uma das duas à mão — que é exatamente a conta que este campo existe para evitar.
     */
    const [formatoDeEntrada, setFormatoDeEntrada] = useState<Partial<Record<TributoCreditavel, FormatoDaEntrada>>>({})
    // §9 — o aviso de impacto. NADA é regravado: a lista existe para o usuário DECIDIR o que
    // remargear (`fato-vs-referencia.md`).
    const [impactoAberto, setImpactoAberto] = useState(false)
    const [impactoPct, setImpactoPct] = useState<{ antes: number; depois: number }>({ antes: 0, depois: 0 })
    const [impactos, setImpactos] = useState<ImpactoDoRateio[]>([])

    const [form] = Form.useForm()

    const [messageApi, contextHolder] = message.useMessage()

    // Payment modal state
    const [paymentModalOpen, setPaymentModalOpen] = useState(false)
    const [paymentEntry, setPaymentEntry] = useState<any>(null)
    const [excluindoVenda, setExcluindoVenda] = useState(false)
    const [paymentDate, setPaymentDate] = useState<dayjs.Dayjs | null>(null)
    const [paymentDueDate, setPaymentDueDate] = useState<dayjs.Dayjs | null>(null)
    const [paymentMethodModal, setPaymentMethodModal] = useState<string>('')
    const [paymentAmount, setPaymentAmount] = useState<number>(0)
    const [savingPayment, setSavingPayment] = useState(false)

    // Selection modal for multiple pending income entries on same day
    const [pendingSelectOpen, setPendingSelectOpen] = useState(false)
    const [pendingSelectEntries, setPendingSelectEntries] = useState<any[]>([])

    // Selection modal for multiple expense entries on same day
    const [expenseSelectOpen, setExpenseSelectOpen] = useState(false)
    const [expenseSelectEntries, setExpenseSelectEntries] = useState<any[]>([])

    // Export modal
    const [exportModalOpen, setExportModalOpen] = useState(false)
    const [exportRange, setExportRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([month.startOf('month'), month.endOf('month')])
    const [exporting, setExporting] = useState(false)

    // Export format modals (PDF vs Excel)
    const [exportFormatModalOpen, setExportFormatModalOpen] = useState(false)

    const startOfMonth = month.startOf('month').format('YYYY-MM-DD')
    const endOfMonth = month.endOf('month').format('YYYY-MM-DD')

    const fetchData = async () => {
        setLoading(true)
        try {
            const sbf = supabase as any
            const tenantId = await getTenantId()
            const [{ data: entries }, { data: emps }, { data: tenantSettings }, { data: custs }] = await Promise.all([
                tenantId
                    ? sbf.from('cash_entries')
                        .select('*')
                        .eq('tenant_id', tenantId)
                        .gte('due_date', startOfMonth)
                        .lte('due_date', endOfMonth)
                        .eq('is_active', true)
                        .order('due_date', { ascending: true })
                    : Promise.resolve({ data: [] }),
                tenantId
                    ? sbf.from('employees').select('id, name, salary').eq('tenant_id', tenantId).eq('status', 'ACTIVE').eq('is_active', true)
                    : Promise.resolve({ data: [] }),
                tenantId
                    ? sbf.from('tenant_settings').select('tax_regime, calc_type').eq('tenant_id', tenantId).maybeSingle()
                    : Promise.resolve({ data: null }),
                tenantId
                    ? sbf.from('customers').select('id, name').eq('tenant_id', tenantId).eq('is_active', true)
                    : Promise.resolve({ data: [] }),
            ])
            setData(entries || [])
            setEmployees(emps || [])
            const cMap: Record<string, string> = {}
            ;(custs || []).forEach((c: any) => { cMap[c.id] = c.name })
            setCustomerMap(cMap)

            const saleIds = Array.from(new Set((entries || [])
                .filter((e: any) => e.origin_type === 'SALE' && e.origin_id)
                .map((e: any) => e.origin_id as string)))
            if (tenantId && saleIds.length > 0) {
                const { data: salesRows } = await sbf.from('sales').select('id, sale_code').in('id', saleIds)
                const sMap: Record<string, string> = {}
                ;(salesRows || []).forEach((s: any) => { if (s.sale_code) sMap[s.id] = s.sale_code })
                setSaleCodeMap(sMap)
            } else {
                setSaleCodeMap({})
            }

            setTenantIdDaTela(tenantId)
            if (tenantSettings?.tax_regime) setTaxRegime(tenantSettings.tax_regime)
            if (tenantSettings?.calc_type) setCalcType(tenantSettings.calc_type)
        } catch {
            messageApi.error('Erro ao carregar dados.')
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => { fetchData() }, [month])

    const isSimples = taxRegime === 'SIMPLES_NACIONAL' || taxRegime === 'MEI'
    const isLucroReal = taxRegime === 'LUCRO_REAL'
    const isSimplesHibrido = taxRegime === 'SIMPLES_HIBRIDO'
    const activeGroupForCategory = (cat: string) => getGroupForCategoryByRegime(taxRegime, cat)


    // ── §3: O BLOCO DE IMPOSTOS EM TODA DESPESA ──────────────────────────────────────────
    // A conta é a MESMA do cadastro de item. Uma segunda implementação aqui seria
    // `copia-divergente.md` na pior forma: as duas fechariam consigo mesmas e a divergência
    // só apareceria como crédito errado, meses depois.
    const grupoDaCategoria = activeGroupForCategory(selectedExpenseCategory) || 'DESPESA_FIXA'
    const naturezaDoLancamento = naturezaDaDespesa(selectedExpenseCategory, grupoDaCategoria)
    const temBlocoDeImposto = !!selectedExpenseCategory && naturezaDoLancamento.estado !== 'SEM_BLOCO'

    /**
     * §1 — A FORMA COMPACTA: duas linhas, e mais nada.
     *
     * Conta de luz, aluguel e serviço tomado não têm ST, DIFAL, IPI nem fatia. A escada
     * inteira ali é ruído com aparência de exigência: o usuário lê nove campos vazios e
     * conclui que o lançamento está incompleto, quando o que falta não existe.
     *
     * O gatilho é `COM_CREDITO` + `USO_CONSUMO`, e não uma lista de categorias — a lista
     * mora em `natureza-da-despesa.ts`, que é quem sabe. `INSUMO` e `REVENDA` seguem na
     * forma completa porque matéria-prima, revenda e embalagem têm esses tributos de
     * verdade, e `VEDADO` segue como está: bloco visível, travado, com o motivo.
     *
     * >>> O LINK NÃO É PREFERÊNCIA <<<
     * `revelarEscadaCompleta` vive na sessão do drawer e nasce falso a cada abertura. Salvar
     * a escolha faria a tela de um lançamento decidir a do próximo, e o caso raro viraria o
     * padrão de quem o encontrou uma vez.
     */
    const formaCompacta = formaDoBlocoFiscal(naturezaDoLancamento, revelarEscadaCompleta) === 'COMPACTA'

    // §5 — o lançamento de GUIA pede tributo, competência e tipo. Sem competência não há
    // apuração: a guia vence em setembro e apura agosto, e somar uma na outra é o erro que o
    // quadro existe para impedir.
    const ehGuia = !!selectedExpenseCategory && ehGuiaDeImposto(grupoDaCategoria)
    const tributoDaGuia = Form.useWatch('tax_kind', form)
    const tipoDaGuia = Form.useWatch('guide_type', form)

    const taxaIcms = Form.useWatch('icms_rate', form)
    const taxaPisCofins = Form.useWatch('pis_cofins_rate', form)
    const taxaIpi = Form.useWatch('ipi_rate', form)
    const taxaCbs = Form.useWatch('cbs_rate', form)
    const taxaIbs = Form.useWatch('ibs_rate', form)

    const contextoDoCredito = useMemo(() => ({
        regime: taxRegime,
        segmento: calcType,
        destinacao: naturezaDoLancamento.destinacao,
    }), [taxRegime, calcType, naturezaDoLancamento.destinacao])

    const bandeirasDoLancamento = useMemo(() => {
        const base = resolverFlagsDoItem(contextoDoCredito, {})
        // VEDADO é o terceiro estado: há imposto na operação e a lei proíbe o crédito. Ele
        // trava os cinco botões com o motivo à vista, e não some o bloco — sumir afirmaria
        // que não houve imposto.
        if (naturezaDoLancamento.estado !== 'VEDADO') return base
        return Object.fromEntries(TRIBUTOS_CREDITAVEIS.map((t) => [t, {
            ativo: false, vedado: true, motivo: naturezaDoLancamento.motivo ?? '', origem: 'vedacao' as const,
        }])) as typeof base
    }, [contextoDoCredito, naturezaDoLancamento.estado, naturezaDoLancamento.motivo])

    /*
      §7 — O DESCASCAMENTO SUBSTITUI A SOMA.

      Até o #73 esta tela SOMAVA: o usuário digitava o valor dos produtos e o total era
      calculado. Agora ele digita o TOTAL DA NOTA — que é o que vira as parcelas e entra no
      caixa — e a base é revelada degrau por degrau.

      TODOS os campos abaixo entram em `descascarANota`, que é quem sabe a ordem. A tela não
      soma, não subtrai e não calcula imposto: ela coleta e exibe.
    */
    const valorIpiCusto = Form.useWatch('valor_ipi_custo', form)
    const valorIcmsSt = Form.useWatch('valor_icms_st', form)
    const valorDifal = Form.useWatch('valor_difal', form)
    const valorFcp = Form.useWatch('valor_fcp', form)
    const valorFrete = Form.useWatch('frete', form)
    const valorSeguro = Form.useWatch('seguro', form)
    const valorIsDaNota = Form.useWatch('valor_is', form)
    /*
      §3 e §4 — TRÊS CONTROLES SAÍRAM DA TELA, e os watches saem com eles.

      Fatia em ST, fatia monofásica e base manual de ICMS não têm mais campo. As duas fatias
      duplicavam a base manual pelo lado negativo (§4); a base manual de ICMS ficou sem
      função quando o ICMS passou a ser digitado em R$ — com o valor destacado na mão, o
      crédito É o valor, e a base dele não muda número nenhum.

      Um `useWatch` de campo que não existe devolve `undefined` para sempre, e
      `soNumero(undefined)` é `null`: manter os três seria gravar "não informado" por um
      caminho que ninguém pode informar. Sai o controle, sai o watch, sai a gravação.
    */
    const baseManualPisCofins = Form.useWatch('base_manual_pis_cofins', form)
    const usarBaseManualPisCofins = Form.useWatch('usar_base_manual_pis_cofins', form)
    const cstIcmsDoc = Form.useWatch('cst_icms', form)
    const cstIpiDoc = Form.useWatch('cst_ipi', form)
    const cstPisCofinsDoc = Form.useWatch('cst_pis_cofins', form)

    /** `null` e não `0`: campo vazio é campo vazio, e a nota não afirma nada sobre ele. */
    const soNumero = (v: unknown): number | null =>
        v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v)

    /**
     * A entrada de UM tributo, no formato que o descascamento espera.
     *
     * O formato escolhido na linha decide em qual campo o número entra — `brl` ou `pct` —, e
     * o módulo já sabe que o `brl` vence. Mandar os dois preenchidos faria a tela ter opinião
     * sobre um desempate que não é dela.
     */
    const entradaDe = (tributo: TributoCreditavel, valor: unknown) => {
        const n = soNumero(valor)
        if (n == null) return null
        return (formatoDeEntrada[tributo] ?? FORMATO_PADRAO) === 'BRL' ? { brl: n } : { pct: n }
    }

    /**
     * §1 — NA FORMA COMPACTA A BASE DO CRÉDITO É O VALOR TOTAL DO LANÇAMENTO.
     *
     * A conta de luz de R$ 1.000,00 com CBS de 8,80% dá R$ 88,00, não R$ 69,56: os tributos
     * já estão DENTRO do que o fornecedor cobrou, e não há por fora a descascar. Mandar a
     * alíquota como `pct` faria o motor descontá-la do saldo antes de aplicá-la — que é a
     * conta certa para a nota de mercadoria, e a errada para esta.
     *
     * A conversão é a MESMA travessia da borda de `entrada-de-imposto.ts`, e é ela que a
     * linha usa para exibir o R$. Reescrever `valor = total × pct / 100` aqui seria
     * `copia-divergente.md` com a assinatura que ela descreve: os dois lados fechariam
     * consigo mesmos e a divergência apareceria como crédito errado.
     */
    const totalDoLancamento = parseCurrencyFn(expenseAmount)
    const creditoSobreOTotal = (aliquota: unknown) => {
        const v = valorAPartirDaAliquota(soNumero(aliquota), totalDoLancamento)
        return v == null ? null : { brl: v }
    }

    const descascamentoDaNota = useMemo(() => descascarANota(formaCompacta ? {
        /*
          SEM DEGRAUS: nenhuma redução, nenhum por dentro, nenhuma fatia. O que não é
          enviado não é zero — é ausente, e ausente não entra na conta
          (`ausente-vs-falso.md`). Os campos da escada nem estão na tela nesta forma, e
          mandá-los daqui faria um valor esquecido de uma edição anterior mandar num
          lançamento em que ele não aparece.
        */
        total: totalDoLancamento,
        porFora: { cbs: creditoSobreOTotal(taxaCbs), ibs: creditoSobreOTotal(taxaIbs) },
        bandeiras: bandeirasDoLancamento,
    } : {
        total: totalDoLancamento,
        composicao: { frete: soNumero(valorFrete), seguro: soNumero(valorSeguro) },
        reducoes: {
            ipiCusto: soNumero(valorIpiCusto),
            icmsSt: soNumero(valorIcmsSt),
            difal: soNumero(valorDifal),
            fcp: soNumero(valorFcp),
        },
        porFora: {
            ipi: entradaDe('IPI', taxaIpi),
            cbs: entradaDe('CBS', taxaCbs),
            ibs: entradaDe('IBS', taxaIbs),
        },
        /*
          §2 — SEMPRE POR FORA, porque a tela não pergunta mais.
          Neste bloco a MENÇÃO é a afirmação: o IPI que está aqui é o creditável por fora.
          O parâmetro continua no motor, e o caso do #74 que compara as duas bases segue
          verde — o que saiu foi o CONTROLE, não a regra.
        */
        ipiPorDentro: false,
        valorIs: soNumero(valorIsDaNota),
        /*
          O PARÂMETRO `fatias` CONTINUA NO MOTOR, e a tela passa a mandá-lo vazio.
          `descascarANota` não mudou — quem o chamar com fatia continua funcionando, e os
          casos do #74 que afirmam a regra seguem verdes. O que saiu foi o CONTROLE.
        */
        fatias: null,
        porDentro: {
            icms: entradaDe('ICMS', taxaIcms),
            pisCofins: entradaDe('PIS_COFINS', taxaPisCofins),
            baseManualIcms: null,
            // O check é que liga a base manual: sem ele, um número esquecido no campo
            // continuaria mandando na conta depois de o usuário desmarcar.
            baseManualPisCofins: usarBaseManualPisCofins ? soNumero(baseManualPisCofins) : null,
        },
        cst: { icms: cstIcmsDoc ?? null, ipi: cstIpiDoc ?? null, pisCofins: cstPisCofinsDoc ?? null },
        bandeiras: bandeirasDoLancamento,
    }), [
        formaCompacta, totalDoLancamento, expenseAmount, valorFrete, valorSeguro, valorIpiCusto, valorIcmsSt, valorDifal, valorFcp,
        taxaIpi, taxaCbs, taxaIbs, taxaIcms, taxaPisCofins, valorIsDaNota,
        usarBaseManualPisCofins, baseManualPisCofins, cstIcmsDoc, cstIpiDoc, cstPisCofinsDoc,
        bandeirasDoLancamento, formatoDeEntrada,
    ])

    /**
     * OS CAMPOS DE CADA LINHA DE TRIBUTO — §3 do comando de 24/09/2026.
     *
     * Eram seis controles para dois tributos; passam a ser um por linha, mais a terceira
     * linha do bloco 3. O que cada linha carrega:
     *
     * - ICMS: o campo em R$, com o seletor RECOLHIDO. Ele vem destacado na nota (`vICMS`) e
     *   é esse número que o usuário copia; a alíquota é o caso raro, e continua a um clique.
     * - PIS/COFINS: a alíquota, e a BASE exibida ao lado — `saldo − ICMS`, que o
     *   descascamento calcula. Ela não está no documento, então exibi-la é a informação que
     *   permite conferir o crédito sem refazer a conta.
     *
     * As fatias em ST e monofásica saíram: ver o comentário do bloco 3.
     */
    const extrasDosTributos = useMemo(() => Object.fromEntries(
        TRIBUTOS_CREDITAVEIS.map((t) => [t, (
            /*
              §3 — AS CINCO LINHAS TÊM A MESMA ANATOMIA.

              O slot é uma GRADE de largura fixa, e não um flex que encolhe com o conteúdo:
              coluna 1 é a entrada `% | R$`, sempre com a mesma largura nos dois formatos;
              coluna 2 é o texto de apoio, que só o PIS/COFINS tem. Assim a leitura do valor
              — que vem logo depois deste nó, dentro do componente — começa no MESMO x nas
              cinco linhas, com ou sem texto ao lado.

              Era aqui que estavam as duas exceções de alinhamento: o ICMS com o seletor
              recolhido (uma largura a menos) e o PIS/COFINS com o texto da base empurrando a
              leitura para a direita.
            */
            <div key={t} style={{ display: 'grid', gridTemplateColumns: '200px 1fr', alignItems: 'center', gap: 10, width: 360 }}>
                {/*
                  COM A BASE MANUAL LIGADA, A ALÍQUOTA NÃO FICA AQUI — ela desce para a
                  terceira linha, junto da base. Repeti-la seria o mesmo `name` em dois
                  `Form.Item`: dois controles para um número.
                */}
                {t === 'PIS_COFINS' && usarBaseManualPisCofins === true ? (
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>alíquota e base na linha abaixo</span>
                ) : (
                    <Form.Item name={CAMPO_DA_ALIQUOTA[t]} noStyle>
                        <EntradaDeImposto
                            /*
                              §1 — NA FORMA COMPACTA A BASE DA LINHA É O TOTAL.
                              É a mesma base que `creditoSobreOTotal` usa para mandar o valor
                              ao motor. Converter por uma base e calcular por outra é o erro
                              que `entrada-de-imposto.ts` existe para impedir.
                            */
                            base={formaCompacta ? (totalDoLancamento ?? 0) : BASE_DA_LINHA_NO_DESCASCAMENTO(descascamentoDaNota, t)}
                            formato={formatoDeEntrada[t] ?? FORMATO_DA_LINHA[t]}
                            onFormato={(f) => setFormatoDeEntrada((prev) => ({ ...prev, [t]: f }))}
                            disabled={descascamentoDaNota.base == null || bandeirasDoLancamento[t]?.tipoVedacao === 'REGIME'}
                        />
                    </Form.Item>
                )}
                {t === 'PIS_COFINS' && (
                    <span style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>
                        sobre a base de {brl(descascamentoDaNota.basesPorDentro.pisCofins)}
                    </span>
                )}
            </div>
        )]),
    ) as Partial<Record<TributoCreditavel, React.ReactNode>>,
    [descascamentoDaNota, formatoDeEntrada, bandeirasDoLancamento, usarBaseManualPisCofins,
     formaCompacta, totalDoLancamento])

    /**
     * A LEITURA DO CRÉDITO DE CADA LINHA.
     *
     * O bloco pede um `CustoDoItem` para exibir valores, e esta tela não tem um: ela tem o
     * descascamento da NOTA. Montar um `CustoDoItem` parcial aqui seria um segundo produtor
     * do mesmo contrato com menos campos — `construtor-empobrecido.md` —, e o que faltasse
     * chegaria zero sem nada falhar. A prop `leitura` entrega o número pronto.
     */
    const leiturasDoCredito = useMemo(() => ({
        ICMS: brl(descascamentoDaNota.creditos.icms),
        PIS_COFINS: brl(descascamentoDaNota.creditos.pisCofins),
        IPI: brl(descascamentoDaNota.creditos.ipi),
        CBS: brl(descascamentoDaNota.creditos.cbs),
        IBS: brl(descascamentoDaNota.creditos.ibs),
    }), [descascamentoDaNota])

    /**
     * O bloco de custo, como a NOTA o grava. Ele é leitura do que já foi coletado acima —
     * um segundo `soNumero` por campo seria a cópia nascendo no mesmo arquivo.
     */
    const blocoDeCustoDaNota = useMemo(() => ({
        ipiCusto: soNumero(valorIpiCusto),
        icmsSt: soNumero(valorIcmsSt),
        difal: soNumero(valorDifal),
        fcp: soNumero(valorFcp),
    }), [valorIpiCusto, valorIcmsSt, valorDifal, valorFcp])

    // §6 — os dois campos só aparecem nas categorias do bloco Compromissos Financeiros.
    const isCompromissoFinanceiro = ehCompromissoFinanceiro(selectedExpenseCategory)
    const compSeparacao = separarJurosEPrincipal({
        total: parseCurrencyFn(expenseAmount),
        juros: compJuros === '' ? null : parseCurrencyFn(compJuros),
        principal: compPrincipal === '' ? null : parseCurrencyFn(compPrincipal),
    })
    // §3 — UMA fonte para o modal e para a faixa.
    const { resumo: vencidos, recarregar: recarregarVencidos } = useVencidos(tenantIdDaTela, vencidosToken)

    useEffect(() => {
        // >>> ABRE UMA VEZ POR SESSÃO **E POR CONJUNTO** <<<
        // `sessionStorage` some no logout, que é o "novo login" do §3; a assinatura dos ids
        // na chave é o que faz o modal voltar quando surge um vencido NOVO.
        if (!deveAbrirSozinho(tenantIdDaTela, vencidos, (k) => {
            try { return sessionStorage.getItem(k) === '1' } catch { return false }
        })) return
        setVencidosAbertos(true)
    }, [tenantIdDaTela, vencidos])

    const dispensarVencidos = () => {
        setVencidosAbertos(false)
        if (!tenantIdDaTela) return
        try { sessionStorage.setItem(chaveDeDispensa(tenantIdDaTela, vencidos), '1') } catch { /* private mode */ }
    }

    const activeCategoryOptions = getExpenseCategoryOptionsForRegime(taxRegime)

    const handleOpenPaymentModal = (entry: any) => {
        setPaymentEntry(entry)
        setPaymentDate(entry.paid_date ? dayjs(entry.paid_date + 'T00:00:00') : dayjs())
        setPaymentDueDate(entry.due_date ? dayjs(entry.due_date + 'T00:00:00') : null)
        setPaymentMethodModal(entry.payment_method || '')
        setPaymentAmount(Number(entry.amount) || 0)
        setPaymentModalOpen(true)
    }

    /**
     * EXCLUIR A VENDA a partir do Fluxo de Caixa.
     *
     * NÃO É ROTA NOVA: é a MESMA `/api/delete/sales-permanent` da tela de Vendas, com a mesma
     * `delete_sale_cascade`, a mesma pré-condição de parcela paga e o mesmo efeito em cadeia.
     * A ação é uma só, acessível de dois pontos — e é por isso que ela chama a rota existente
     * em vez de ganhar uma cópia. `.claude/rules/copia-divergente.md`.
     *
     * ISTO NÃO É "REVERTER O #52". O botão que aquele PR removeu daqui chamava
     * `/api/delete/cash-entries` e apagava O LANÇAMENTO; este chama `delete_sale_cascade` e
     * apaga A CADEIA. Mesmo rótulo, mesmo lugar, AÇÃO DIFERENTE. A decisão da época era que a
     * exclusão de venda existiria só em Vendas, e ela mudou — é `decisao-sob-regra-da-epoca.md`:
     * não houve erro no #52, houve mudança de critério.
     */
    const handleExcluirVendaDoLancamento = async () => {
        const saleId = paymentEntry?.origin_id
        if (!saleId) return
        setExcluindoVenda(true)
        try {
            const res = await fetch('/api/delete/sales-permanent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: saleId }),
            })
            const result = await res.json()
            if (res.status === 409) {
                messageApi.warning(result.error || 'Esta venda possui pagamentos registrados.')
                return
            }
            if (!res.ok) throw new Error(result.error || 'Erro ao excluir')
            messageApi.success('Venda excluída. Os lançamentos dela saíram do caixa.')
            setPaymentModalOpen(false)
            setPaymentEntry(null)
            await fetchData()
        } catch (error: unknown) {
            messageApi.error(error instanceof Error ? error.message : 'Erro ao excluir venda')
        } finally {
            setExcluindoVenda(false)
        }
    }

    /**
     * §6 — EXCLUSÃO DE SÉRIE.
     *
     * A tela manda `id` e `escopo`, e MAIS NADA. Quem decide quais lançamentos saem é o
     * servidor, relendo a série: uma lista montada aqui é a que apaga a parcela que alguém
     * pagou entre o clique e o confirm.
     */
    const [excluindoSerie, setExcluindoSerie] = useState(false)
    const [pagasDaSerie, setPagasDaSerie] = useState<{ id: string; due_date: string; amount: number }[]>([])
    const [estornando, setEstornando] = useState(false)
    const [dataDoEstorno, setDataDoEstorno] = useState<Dayjs>(dayjs())

    const excluirLancamento = async (escopo: 'SERIE' | 'SO_ESTE') => {
        if (!paymentEntry) return
        setExcluindoSerie(true)
        try {
            const r = await fetch('/api/delete/cash-entry-series', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: paymentEntry.id, escopo }),
            })
            const j = await r.json()
            if (r.status === 409) {
                // O VETO. A tela NÃO insiste: ela mostra as pagas e oferece os dois caminhos.
                setPagasDaSerie(j.pagas ?? [])
                messageApi.warning(j.error || 'A série tem parcela paga.')
                return
            }
            if (!r.ok) throw new Error(j.error || 'Erro ao excluir')
            messageApi.success(
                `${j.desativadas} lançamento(s) excluído(s).` + (j.nota_desativada ? ' A nota de compra saiu junto.' : ''),
            )
            setPaymentModalOpen(false)
            setPagasDaSerie([])
            await fetchData()
        } catch (err: any) {
            messageApi.error(err?.message || 'Erro ao excluir lançamento')
        } finally {
            setExcluindoSerie(false)
        }
    }

    /**
     * §6.6 — O ESTORNO. O pagamento OCORREU e foi desfeito.
     *
     * Ele NÃO limpa `paid_date`: isso é o "Cancelar Pagamento", que é outra ação e existe
     * ao lado. Aqui o espelho é lançado na data do estorno, e o mês original fica intacto.
     */
    const estornarLancamento = async () => {
        if (!paymentEntry) return
        setEstornando(true)
        try {
            const tenant_id = await getTenantId()
            const data = dataDoEstorno.format('YYYY-MM-DD')
            const espelho = espelhoDoEstorno({
                id: paymentEntry.id,
                tenant_id,
                type: paymentEntry.type === 'INCOME' ? 'INCOME' : 'EXPENSE',
                amount: Number(paymentEntry.amount) || 0,
                description: paymentEntry.description,
                paid_date: paymentEntry.paid_date,
                expense_category: paymentEntry.expense_category ?? null,
                expense_group: paymentEntry.expense_group ?? null,
            }, data)

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const db = supabase as any
            const { data: criado, error: erroEspelho } = await db
                .from('cash_entries').insert(espelho).select('id').single()
            if (erroEspelho) throw erroEspelho

            // O original recebe os dois ponteiros. `paid_date` PERMANECE.
            const { error: erroOriginal } = await db.from('cash_entries')
                .update({ reversed_at: data, reversal_entry_id: criado?.id ?? null })
                .eq('id', paymentEntry.id).eq('tenant_id', tenant_id)
            if (erroOriginal) throw erroOriginal

            /*
              A NOTA só é dada por estornada quando NENHUMA entrada dela segue viva. Uma
              parcela ainda de pé significa que parte da compra continua, e o crédito com ela.
            */
            if (paymentEntry.purchase_invoice_id) {
                const { data: irmas } = await db.from('cash_entries')
                    .select('id, due_date, amount, paid_date, is_active, reversed_at')
                    .eq('tenant_id', tenant_id)
                    .eq('purchase_invoice_id', paymentEntry.purchase_invoice_id)
                const lista = ((irmas ?? []) as any[]).map((e) => ({
                    ...e,
                    reversed_at: e.id === paymentEntry.id ? data : e.reversed_at,
                }))
                if (notaEstaEstornada(lista)) {
                    await db.from('purchase_invoices')
                        .update({ reversed_at: data })
                        .eq('id', paymentEntry.purchase_invoice_id).eq('tenant_id', tenant_id)
                }
            }

            messageApi.success('Estorno lançado. O pagamento original continua registrado.')
            setPaymentModalOpen(false)
            await fetchData()
        } catch (err: any) {
            messageApi.error('Erro ao estornar: ' + (err?.message || ''))
        } finally {
            setEstornando(false)
        }
    }

    const handleCancelPayment = async () => {
        if (!paymentEntry) return
        setSavingPayment(true)
        try {
            const tenant_id = await getTenantId()
            // For BOLETO/CHEQUE income: preserve payment_method so the entry stays visible as pending (yellow)
            const isBoletoOrChequeIncome = paymentEntry.type === 'INCOME' &&
                (paymentEntry.payment_method === 'BOLETO' || paymentEntry.payment_method === 'CHEQUE_PRE_DATADO')
            const updatePayload: any = { paid_date: null }
            if (!isBoletoOrChequeIncome) updatePayload.payment_method = null
            const { error } = await (supabase as any).from('cash_entries').update(updatePayload)
                .eq('id', paymentEntry.id).eq('tenant_id', tenant_id)
            if (error) throw error
            messageApi.success(paymentEntry.type === 'INCOME' ? 'Recebimento desfeito — voltou para pendente.' : 'Pagamento cancelado — despesa voltou para não paga.')
            setPaymentModalOpen(false)
            await fetchData()
        } catch (err: any) {
            messageApi.error('Erro ao cancelar pagamento: ' + (err?.message || 'Erro desconhecido'))
        } finally {
            setSavingPayment(false)
        }
    }

    const handleRegisterPayment = async () => {
        if (!paymentEntry) return
        setSavingPayment(true)
        try {
            const tenant_id = await getTenantId()
            const originalDueDate = paymentEntry.due_date
            const newDueDate = paymentDueDate ? paymentDueDate.format('YYYY-MM-DD') : originalDueDate
            const dueDateChanged = newDueDate !== originalDueDate
            const updatePayload: any = {
                paid_date: paymentDate ? paymentDate.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
                payment_method: paymentMethodModal || null,
                amount: paymentAmount > 0 ? paymentAmount : paymentEntry.amount,
            }
            if (dueDateChanged) updatePayload.due_date = newDueDate
            const { error } = await (supabase as any).from('cash_entries').update(updatePayload)
                .eq('id', paymentEntry.id).eq('tenant_id', tenant_id)
            if (error) throw error
            messageApi.success('Pagamento registrado!')
            setPaymentModalOpen(false)
            await fetchData()
        } catch (err: any) {
            messageApi.error('Erro ao registrar pagamento: ' + (err?.message || 'Erro desconhecido'))
        } finally {
            setSavingPayment(false)
        }
    }

    const handleExportMultiMonth = async () => {
        setExporting(true)
        try {
            const [start, end] = exportRange
            const startMonth = start.startOf('month')
            const endMonth = end.startOf('month')

            const months: { data: any[]; month: dayjs.Dayjs }[] = []
            let current = startMonth

            while (current.isBefore(endMonth) || current.isSame(endMonth, 'month')) {
                const s = current.startOf('month').format('YYYY-MM-DD')
                const e = current.endOf('month').format('YYYY-MM-DD')
                const exportTenantId = await getTenantId()
                const { data: entries } = await (supabase as any)
                    .from('cash_entries')
                    .select('*')
                    .eq('tenant_id', exportTenantId)
                    .gte('due_date', s)
                    .lte('due_date', e)
                    .eq('is_active', true)
                    .order('due_date', { ascending: true })
                months.push({ data: entries || [], month: current })
                current = current.add(1, 'month')
            }

            const { exportCashFlowToExcel, exportCashFlowMultiMonth } = await import('@/utils/export-cash-flow-excel')
            if (months.length === 1) {
                await exportCashFlowToExcel(months[0].data, months[0].month)
            } else {
                await exportCashFlowMultiMonth(months)
            }
            setExportModalOpen(false)
            messageApi.success('Excel exportado com sucesso!')
        } catch (err: any) {
            messageApi.error('Erro ao exportar: ' + (err?.message || 'Erro desconhecido'))
        } finally {
            setExporting(false)
        }
    }

    const handleExportCashFlowPdf = async () => {
        if (data.length === 0) { messageApi.warning('Nenhum dado para exportar.'); return }
        try {
        const monthLabel = month.format('MMMM/YYYY')
        const headers = ['Data', 'Descrição', 'Tipo', 'Valor']

        // Compute totals (mirror panel summary)
        let totalIncome = 0
        let totalExpense = 0
        data.forEach((r: any) => {
            const amt = r.type === 'INCOME' ? getEffectiveIncomeAmount(r) : Number(r.amount || 0)
            if (r.type === 'INCOME') totalIncome += amt
            else totalExpense += amt
        })
        const balance = totalIncome - totalExpense

        const rows: (string | number)[][] = data.map((r: any) => {
            const displayAmount = r.type === 'INCOME' ? getEffectiveIncomeAmount(r) : Number(r.amount || 0)
            return [
                r.due_date ? r.due_date.substring(8, 10) + '/' + r.due_date.substring(5, 7) + '/' + r.due_date.substring(0, 4) : '',
                r.description || '',
                r.type === 'INCOME' ? 'Receita' : 'Despesa',
                `${r.type === 'INCOME' ? '+' : '-'} ${formatCurrency(displayAmount)}`,
            ]
        })
        rows.push(['', 'TOTAL', '', `${balance >= 0 ? '+' : ''} ${formatCurrency(balance)}`])

        const { exportTableToPdf } = await import('@/utils/export-generic-pdf')
        exportTableToPdf({
            title: `Fluxo de Caixa — ${monthLabel}`,
            subtitle: `${data.length} lançamentos`,
            headers,
            rows,
            filename: `Fluxo_de_Caixa_${month.format('YYYY-MM')}.pdf`,
            orientation: 'landscape',
            columnStyles: { 3: { halign: 'right' } },
            kpis: [
                { label: 'Lançamentos', value: String(data.length) },
                { label: 'Total Receitas', value: `+ ${formatCurrency(totalIncome)}` },
                { label: 'Total Despesas', value: `- ${formatCurrency(totalExpense)}` },
                { label: 'Saldo', value: `${balance >= 0 ? '+' : ''} ${formatCurrency(balance)}` },
            ],
            highlightLastRow: true,
        })
        messageApi.success('PDF exportado com sucesso!')
        } catch (err: any) {
            console.error('Erro ao exportar PDF Fluxo de Caixa', err)
            messageApi.error('Erro ao exportar PDF: ' + (err?.message || 'Erro desconhecido'))
        }
    }

    if (!canView(MODULES.CASH_FLOW)) {
        return <Layout title={PAGE_TITLES.CASH_FLOW}><div style={{ padding: 40, textAlign: 'center' }}>Você não tem acesso a este módulo.</div></Layout>
    }

    // ── Regular entries (exclude PREV_MONTH_BALANCE from all calculations) ──
    const regularData = useMemo(() => data.filter((e: any) => e.origin_type !== 'PREV_MONTH_BALANCE'), [data])

    // ── Aviso de ações pendentes para HOJE ──
    const todayStr = dayjs().format('YYYY-MM-DD')
    const todayPendingEntries = useMemo(() => {
        return regularData.filter((e: any) => {
            if (e.due_date !== todayStr) return false
            if (e.type === 'EXPENSE') return !e.paid_date
            // §3 — a condição era inline aqui; o comportamento não muda, a porta sim.
            if (e.type === 'INCOME') return ehRecebimentoPrevisto(e)
            return false
        })
    }, [regularData, todayStr])

    // ── Filtered data for DFC (respects day selection from calendar) ──
    const dfcData = useMemo(() => {
        if (selectedDay === null) return regularData
        const dayStr = String(selectedDay).padStart(2, '0')
        return regularData.filter((e: any) => e.due_date && e.due_date.substring(8, 10) === dayStr)
    }, [regularData, selectedDay])

    // ── Extrato structured data (grouped by expense_group) ──
    const extratoData = useMemo(() => {
        // Income by label
        const incomeByLabel: Record<string, number> = {}
        for (const label of INCOME_LABELS) incomeByLabel[label] = 0

        // Expense grouped by expense_group
        const groupTotals: Record<string, number> = {}

        for (const entry of dfcData) {
            if (entry.type === 'INCOME') {
                if (!entraNaProjecao(entry)) continue
                const label = getIncomeLabel(entry)
                incomeByLabel[label] = (incomeByLabel[label] || 0) + getEffectiveIncomeAmount(entry)
            } else {
                const group = (entry as any).expense_group || getGroupForCategory(entry.description) || 'OUTROS'
                groupTotals[group] = (groupTotals[group] || 0) + (Number(entry.amount) || 0)
            }
        }

        const totalEntradas = Object.values(incomeByLabel).reduce((a, b) => a + b, 0)
        const totalSaidas = Object.values(groupTotals).reduce((a, b) => a + b, 0)
        const resultado = totalEntradas - totalSaidas

        return { incomeByLabel, groupTotals, totalEntradas, totalSaidas, resultado }
    }, [dfcData])

    // ── Daily totals for the calendar row (Item 9) ──
    const dailyTotals = useMemo(() => {
        const daysInMonth = month.daysInMonth()
        const totals: Record<number, number> = {}
        for (let d = 1; d <= daysInMonth; d++) totals[d] = 0
        for (const entry of regularData) {
            if (!entry.due_date) continue
            const day = parseInt(entry.due_date.substring(8, 10), 10)
            if (day < 1 || day > daysInMonth) continue
            // §4.3 — o total diário segue o MESMO modo do saldo. Três leituras da mesma
            // tela em modos diferentes é o bug de hoje com outra roupa.
            totals[day] += efeitoNoSaldo(entry)
        }
        return { totals, daysInMonth }
    }, [regularData, month])

    // ── Pivot: per-day per-group/description amounts for grid ──
    const pivotByDay = useMemo(() => {
        const daysInMonth = month.daysInMonth()
        const result: Record<string, Record<number, number>> = {}
        const unpaidAmounts: Record<string, Record<number, number>> = {}
        const entriesMap: Record<string, Record<number, any[]>> = {}
        const paidEntriesMap: Record<string, Record<number, any[]>> = {}

        // Initialize income labels
        for (const label of INCOME_LABELS) {
            result[label] = {}; unpaidAmounts[label] = {}; entriesMap[label] = {}; paidEntriesMap[label] = {}
            for (let d = 1; d <= daysInMonth; d++) {
                result[label][d] = 0; unpaidAmounts[label][d] = 0; entriesMap[label][d] = []; paidEntriesMap[label][d] = []
            }
        }

        const ensureKey = (key: string) => {
            if (result[key]) return
            result[key] = {}; unpaidAmounts[key] = {}; entriesMap[key] = {}; paidEntriesMap[key] = {}
            for (let d = 1; d <= daysInMonth; d++) {
                result[key][d] = 0; unpaidAmounts[key][d] = 0; entriesMap[key][d] = []; paidEntriesMap[key][d] = []
            }
        }

        const descsByGroup: Record<string, string[]> = {}

        for (const entry of regularData) {
            if (!entry.due_date) continue
            const day = parseInt(entry.due_date.substring(8, 10), 10)
            if (day < 1 || day > daysInMonth) continue
            if (entry.type === 'INCOME') {
                if (ehRecebimentoPrevisto(entry)) {
                    // Track as pending income (a receber) instead of confirmed income
                    const pendingKey = '__PENDING_INCOME__'
                    if (!result[pendingKey]) {
                        result[pendingKey] = {}; unpaidAmounts[pendingKey] = {}; entriesMap[pendingKey] = {}; paidEntriesMap[pendingKey] = {}
                        for (let d = 1; d <= daysInMonth; d++) {
                            result[pendingKey][d] = 0; unpaidAmounts[pendingKey][d] = 0; entriesMap[pendingKey][d] = []; paidEntriesMap[pendingKey][d] = []
                        }
                    }
                    result[pendingKey][day] = (result[pendingKey][day] || 0) + getEffectiveIncomeAmount(entry)
                    unpaidAmounts[pendingKey][day] = (unpaidAmounts[pendingKey][day] || 0) + getEffectiveIncomeAmount(entry)
                    entriesMap[pendingKey][day] = [...(entriesMap[pendingKey][day] || []), entry]
                    continue
                }
                const label = getIncomeLabel(entry)
                if (!result[label]) {
                    result[label] = {}; unpaidAmounts[label] = {}; entriesMap[label] = {}; paidEntriesMap[label] = {}
                    for (let d = 1; d <= daysInMonth; d++) {
                        result[label][d] = 0; unpaidAmounts[label][d] = 0; entriesMap[label][d] = []; paidEntriesMap[label][d] = []
                    }
                }
                result[label][day] = (result[label][day] || 0) + getEffectiveIncomeAmount(entry)
                if (entry.paid_date) {
                    paidEntriesMap[label][day] = [...(paidEntriesMap[label][day] || []), entry]
                } else {
                    entriesMap[label][day] = [...(entriesMap[label][day] || []), entry]
                }
            } else {
                const amt = Number(entry.amount) || 0
                const group = (entry as any).expense_group || getGroupForCategory(entry.description) || 'OUTROS'
                const rawDesc = entry.description || '—'
                const desc = rawDesc.startsWith('Fornecedores') ? 'Fornecedores' : rawDesc
                const descKey = `${group}||${desc}`

                ensureKey(group)
                ensureKey(descKey)

                if (!descsByGroup[group]) descsByGroup[group] = []
                if (!descsByGroup[group].includes(desc)) descsByGroup[group].push(desc)

                result[group][day] = (result[group][day] || 0) + amt
                result[descKey][day] = (result[descKey][day] || 0) + amt

                if (!entry.paid_date) {
                    unpaidAmounts[group][day] = (unpaidAmounts[group][day] || 0) + amt
                    unpaidAmounts[descKey][day] = (unpaidAmounts[descKey][day] || 0) + amt
                    entriesMap[group][day] = [...(entriesMap[group][day] || []), entry]
                    entriesMap[descKey][day] = [...(entriesMap[descKey][day] || []), entry]
                } else {
                    paidEntriesMap[group][day] = [...(paidEntriesMap[group][day] || []), entry]
                    paidEntriesMap[descKey][day] = [...(paidEntriesMap[descKey][day] || []), entry]
                }
            }
        }

        // Group totals for ordering/filtering
        const groupTotals: Record<string, number> = {}
        for (const group of Object.keys(descsByGroup)) {
            groupTotals[group] = Object.values(result[group] || {}).reduce((a: number, b: number) => a + b, 0)
        }

        return { data: result, daysInMonth, unpaidAmounts, entriesMap, paidEntriesMap, groupTotals, descsByGroup }
    }, [regularData, month])

    // ── Saldo do Mês Anterior (valor fixo inserido pelo usuário) ──
    const prevMonthBalanceValue = useMemo(() => {
        const entry = (data as any[]).find((e) => e.origin_type === 'PREV_MONTH_BALANCE')
        if (!entry) return 0
        return entry.type === 'INCOME' ? Number(entry.amount) : -Number(entry.amount)
    }, [data])

    /**
     * ── O SALDO, DIA A DIA ──
     *
     * (o título desta seção evita de propósito a expressão que rotula a LINHA do saldo na
     * tabela: há um caso que a localiza por `indexOf`, e um comentário com o mesmo texto
     * acima dela o faria apontar para a prosa em vez da linha)
     *
     * >>> A REGRA NOVA, E O COMENTÁRIO QUE ELA SUBSTITUI <<<
     *
     * Estava escrito aqui, e era o defeito com todas as letras:
     *
     *   // Receitas: apenas confirmadas (BOLETO/CHEQUE_PRE_DATADO exigem paid_date)
     *   // Despesas: TODAS contam (lançadas = comprometidas)
     *
     * Passivo previsto com ativo confirmado. Uma projeção que soma todo o passivo e ignora
     * todo o ativo não é conservadora — ela erra o número que dispara decisão de caixa, e
     * sempre para pior. Medido: R$ 68.925,99 fora do saldo num único mês.
     *
     * Agora os dois lados seguem o MESMO modo, e quem decide é `efeitoNoSaldo`.
     *
     * >>> E ELE SOMA AS ENTRADAS, NÃO AS CÉLULAS DO PIVÔ <<<
     *
     * A versão anterior somava `INCOME_LABELS` e `GROUP_ORDER` sobre o pivô. Era por aí que
     * o recebimento previsto escapava: ele vai para `__PENDING_INCOME__`, que não está em
     * `INCOME_LABELS` — a faixa existia na tela e não existia no saldo. Somar as ENTRADAS
     * tira a lista de rótulos do caminho: um balde novo não precisa ser lembrado aqui.
     */
    const projecaoDoMes = useMemo(() => saldoAcumuladoPorDia(regularData, {
        diasNoMes: month.daysInMonth(),
        saldoInicial: prevMonthBalanceValue,
    }), [regularData, month, prevMonthBalanceValue])

    const saldoDiaAnterior = projecaoDoMes.saldoDiaAnterior
    const dailyAccumulatedBalance = projecaoDoMes.saldoAcumulado

    // ── Saldo do Mês Anterior (Item 11) — usuário insere valor manualmente ──
    // Pré-preenche com o valor já lançado (se houver), permitindo correção ou
    // exclusão (zerar → o save remove o lançamento). Usado tanto pelo botão da
    // toolbar quanto pelo clique na linha "Saldo Mês Anterior" da tabela.
    const handlePrevMonthBalance = () => {
        setPrevBalanceInput(Math.abs(prevMonthBalanceValue))
        setPrevBalanceNegative(prevMonthBalanceValue < 0)
        setPrevBalanceModalOpen(true)
    }

    const handleSavePrevBalance = async () => {
        setLoadingPrevBalance(true)
        try {
            const tenant_id = await getTenantId()
            if (!tenant_id) { messageApi.warning('Sessão inválida.'); return }

            const value = prevBalanceNegative ? -Math.abs(prevBalanceInput) : Math.abs(prevBalanceInput)
            const absValue = Math.abs(value)
            const currentMonthStr = month.format('YYYY-MM')
            const due_date = `${currentMonthStr}-01`

            // Remover lançamento anterior do mesmo mês (se houver)
            await (supabase as any).from('cash_entries')
                .delete()
                .eq('tenant_id', tenant_id)
                .eq('origin_type', 'PREV_MONTH_BALANCE')
                .gte('due_date', startOfMonth)
                .lte('due_date', endOfMonth)

            if (absValue > 0) {
                const { error } = await (supabase as any).from('cash_entries').insert({
                    tenant_id,
                    type: value >= 0 ? 'INCOME' : 'EXPENSE',
                    origin_type: 'PREV_MONTH_BALANCE',
                    description: 'Saldo do mês anterior',
                    amount: absValue,
                    due_date,
                })
                if (error) throw error
            }

            messageApi.success(`Saldo do mês anterior salvo: ${formatCurrency(value)}`)
            setPrevBalanceModalOpen(false)
            await fetchData()
        } catch (err: any) {
            messageApi.error('Erro ao salvar saldo do mês anterior: ' + (err?.message || ''))
        } finally {
            setLoadingPrevBalance(false)
        }
    }

    // ── Salvar Novo ──
    const handleSaveEntry = async () => {
        /*
          §7.3 — SALVAR BLOQUEADO QUANDO A BASE NÃO É CALCULÁVEL.

          `base === null` significa que as alíquotas informadas somam mais que o total da
          nota. Gravar assim colocaria crédito sobre base negativa no NUMERADOR do preço —
          um número inventado, que nada faria falhar depois.

          O guard vem ANTES de qualquer insert, e é ele que o oráculo P afirma: o caso olha o
          bloqueio, não a existência do aviso na tela.
        */
        if (temBlocoDeImposto && descascamentoDaNota.base == null) {
            messageApi.error(
                descascamentoDaNota.motivo === 'ALIQUOTAS_MAIORES_QUE_O_TOTAL'
                    ? 'As alíquotas informadas somam mais que o total da nota — confira o documento.'
                    : 'A base da nota não é calculável — confira os valores informados.',
            )
            return
        }
        try {
            const values = await form.validateFields()
            const tenant_id = await getTenantId()
            if (!tenant_id) return

            {
                const amountNum = parseCurrencyFn(expenseAmount)
                if (amountNum <= 0) { messageApi.warning('Informe o valor da despesa.'); return }
                if (!values.expense_category) { messageApi.warning('Selecione a categoria.'); return }

                /**
                 * O QUE VAI PARA `valor_*` É O CRÉDITO, NÃO O DESTACADO.
                 *
                 * É o que o HUB já consome: `creditoRecuperavelDaCompra` soma esses seis e os
                 * deduz. Gravar o destacado de um tributo cujo botão está DESLIGADO faria o
                 * Hub deduzir um crédito que o usuário disse não ter — e o custo líquido da
                 * tela diria uma coisa e o cabeçalho do Hub outra.
                 *
                 * Sem bloco, nenhum dos seis é gravado: `null` é "não há imposto nesta
                 * operação", e zero afirmaria que há e ele deu zero (`ausente-vs-falso.md`).
                 */
                /**
                 * OS TRÊS CAMPOS DA GUIA — §5.
                 *
                 * Só são gravados quando o lançamento É uma guia. Num lançamento comum eles
                 * ficam `null`, e não com um tributo qualquer: `ausente-vs-falso.md`.
                 */
                const camposDaGuia = () => {
                    if (!ehGuia) return {}
                    const comp = values.competence_month
                    return {
                        tax_kind: values.tax_kind ?? null,
                        guide_type: values.guide_type ?? null,
                        competence_month: comp ? dayjs(comp).startOf('month').format('YYYY-MM-DD') : null,
                    }
                }

                const creditoRateado = (fracao: number) => {
                    if (!temBlocoDeImposto) return {}
                    const r = (v: number) => Math.round(v * fracao * 100) / 100
                    const c = descascamentoDaNota.creditos
                    return {
                        valor_icms: r(c.icms),
                        valor_pis: r(c.pisCofins),
                        valor_cofins: 0,
                        valor_ipi: r(c.ipi),
                        valor_cbs: r(c.cbs),
                        valor_ibs: r(c.ibs),
                    }
                }
                // §6 — "com o total da parcela conferindo com a soma". A soma que não fecha é
                // RECUSADA aqui, e não corrigida em silêncio: o HUB grava `total − juros` como
                // principal, e gravar uma soma divergente faria a tela dizer uma coisa e a
                // leitura outra.
                if (ehCompromissoFinanceiro(values.expense_category) && compSeparacao.divergeDoTotal) {
                    messageApi.warning('Juros + Principal precisa fechar com o Valor Total da parcela.')
                    return
                }

                const desc = values.expense_description
                    ? `${values.expense_category} — ${values.expense_description}`
                    : values.expense_category

                const parcelas: number = values.parcelas && values.parcelas >= 1 ? Math.floor(values.parcelas) : 1
                const startDate: dayjs.Dayjs = values.expense_start_date || month.startOf('month')
                const expenseGroup = activeGroupForCategory(values.expense_category) || 'DESPESA_FIXA'
                const paymentMethod: string = values.payment_method || ''
                const isBoletoOrCheque = paymentMethod === 'BOLETO' || paymentMethod === 'CHEQUE_PRE_DATADO'
                // Correção Felipe (10/08): o editor manual de vencimentos vale para Boleto/Cheque
                // Pré-datado (sempre) e para qualquer outro método quando "Personalizar vencimentos"
                // estiver ativo (expManualDates).
                const useManualInstallments = isBoletoOrCheque || expManualDates
                const payCondition: string = values.payment_condition || '30'

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const entries: any[] = []

                /**
                 * §7 — O GRUPO DA SÉRIE, gerado UMA vez e gravado em TODAS as parcelas.
                 *
                 * Ele é o que permite excluir a série sem adivinhar quem são as irmãs. Gerar
                 * dentro de cada caminho do `insert` produziria dois grupos para o mesmo
                 * lançamento no dia em que alguém mexesse num só — é o mesmo `for` da cópia
                 * divergente.
                 */
                const grupoDaSerie = typeof crypto !== 'undefined' && crypto.randomUUID
                    ? crypto.randomUUID()
                    : `${Date.now()}-${Math.random().toString(16).slice(2)}`

                /**
                 * §5 — O QUE VAI PARA O CAIXA É O TOTAL DA NOTA.
                 *
                 * Sem bloco de imposto (guia, compromisso financeiro, despesa comum) ele é
                 * EXATAMENTE o valor digitado — e é isso que o oráculo A afirma, centavo a
                 * centavo, sobre o `amount` gravado.
                 */
                /*
                  §7.3 — O TOTAL DIGITADO É O QUE VAI PARA O CAIXA, SEMPRE.
                  Com o descascamento, ele deixou de ser resultado de soma: é o fato que o
                  usuário leu no documento. `amountNum` e o total da nota são o mesmo número
                  agora, e a linha existe para dizer isso em vez de deixar implícito.
                */
                const totalParaOCaixa = amountNum

                if (useManualInstallments) {
                    const validInst = expInstallments.filter(r => r.date && r.amount > 0)
                    if (validInst.length === 0) {
                        messageApi.error('Informe ao menos uma data e valor de vencimento.')
                        return
                    }
                    const today = dayjs().startOf('day')
                    const totalInst = validInst.reduce((s, r) => s + r.amount, 0)
                    /**
                     * As parcelas DIGITADAS viram PESOS, e o rateio é do Total da nota.
                     *
                     * Quem pôs 30% na entrada continua com 30% — da nota inteira, não do
                     * valor dos produtos. Manter os valores digitados faria a soma das
                     * parcelas ficar abaixo do total, e a diferença não apareceria em lugar
                     * nenhum.
                     */
                    const valoresRateados = ratearParcelas(totalParaOCaixa, validInst.map((i) => i.amount))
                    validInst.forEach((inst, idx) => {
                        const ratio = totalInst > 0 ? inst.amount / totalInst : 1 / validInst.length
                        // Métodos à vista (não Boleto/Cheque Pré-datado) com vencimento hoje/passado
                        // são baixados automaticamente — mesma regra do parcelamento mensal.
                        const autoPaidDate = (paymentMethod && !isBoletoOrCheque && !inst.date.isAfter(today, 'day'))
                            ? inst.date.format('YYYY-MM-DD')
                            : null
                        entries.push({
                            tenant_id,
                            type: 'EXPENSE' as const,
                            origin_type: 'MANUAL',
                            recurrence_type: 'ONCE',
                            description: validInst.length > 1 ? `${desc} (${idx + 1}/${validInst.length})` : desc,
                            amount: valoresRateados[idx],
                            installment_group_id: grupoDaSerie,
                            due_date: inst.date.format('YYYY-MM-DD'),
                            expense_group: expenseGroup,
                            expense_category: values.expense_category,
                            ...(paymentMethod ? { payment_method: paymentMethod } : {}),
                            ...(autoPaidDate ? { paid_date: autoPaidDate } : {}),
                            // §6 — `null` quando o usuário não separou. NUNCA zero: zero
                            // afirmaria que a parcela não tem juros.
                            ...(isCompromissoFinanceiro ? {
                                juros_value: compSeparacao.juros == null ? null : Math.round(compSeparacao.juros * ratio * 100) / 100,
                                principal_value: compSeparacao.juros == null ? null : Math.round(compSeparacao.principal * ratio * 100) / 100,
                            } : {}),
                            ...creditoRateado(ratio),
                            ...camposDaGuia(),
                        })
                    })
                } else {
                    // A sobra de arredondamento vai para a ÚLTIMA parcela: `1.172,00 ÷ 3`
                    // arredondado em cada uma daria 1.172,01, e a nota cobraria um centavo
                    // que ela não tem.
                    const valoresRateados = ratearParcelas(totalParaOCaixa, Array.from({ length: parcelas }, () => 1))
                    const today = dayjs().startOf('day')
                    for (let i = 0; i < parcelas; i++) {
                        const due = startDate.add(i, 'month')
                        const autoPaidDate = (paymentMethod && paymentMethod !== 'BOLETO' && paymentMethod !== 'CHEQUE_PRE_DATADO' && !due.isAfter(today, 'day'))
                            ? due.format('YYYY-MM-DD')
                            : null
                        entries.push({
                            tenant_id,
                            type: 'EXPENSE' as const,
                            origin_type: 'MANUAL',
                            recurrence_type: 'ONCE',
                            description: parcelas > 1 ? `${desc} (${i + 1}/${parcelas})` : desc,
                            amount: valoresRateados[i],
                            installment_group_id: grupoDaSerie,
                            due_date: due.format('YYYY-MM-DD'),
                            expense_group: expenseGroup,
                            expense_category: values.expense_category,
                            ...(paymentMethod ? { payment_method: paymentMethod } : {}),
                            ...(autoPaidDate ? { paid_date: autoPaidDate } : {}),
                            ...(isCompromissoFinanceiro ? {
                                juros_value: compSeparacao.juros == null ? null : Math.round(compSeparacao.juros / parcelas * 100) / 100,
                                principal_value: compSeparacao.juros == null ? null : Math.round(compSeparacao.principal / parcelas * 100) / 100,
                            } : {}),
                            ...creditoRateado(1 / parcelas),
                            ...camposDaGuia(),
                        })
                    }
                }

                /**
                 * A NOTA DE COMPRA — §1 e §5.
                 *
                 * >>> QUEM RECEBE A MERCADORIA LANÇA A NOTA, E A ENTRADA MANDA <<<
                 * `credit_date` recebe a DATA DE ENTRADA, não a emissão: recebeu 30/08 e
                 * lançou 02/09 → crédito de setembro, e isso é aceito. A emissão é
                 * informação da nota e não entra em conta nenhuma.
                 *
                 * A nota é UMA para todas as parcelas: o crédito é dela, não da parcela. É
                 * por isso que `purchase_invoices` existe separada — uma nota em 6x produz
                 * seis lançamentos e um crédito só.
                 */
                let notaId: string | null = null
                if (temBlocoDeImposto && descascamentoDaNota.creditoTotal > 0) {
                    const entrada = values.entry_date
                        ? dayjs(values.entry_date).format('YYYY-MM-DD')
                        : dayjs().format('YYYY-MM-DD')
                    const c = descascamentoDaNota.creditos
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    // O cast é do `database.types.ts` desatualizado: a tabela nasceu na
                    // migração `20260922000002` e os tipos gerados ainda não a conhecem.
                    const { data: nota, error: erroNota } = await (supabase as any)
                        .from('purchase_invoices')
                        .insert({
                            tenant_id,
                            invoice_number: values.invoice_number || null,
                            supplier_name: values.supplier_name || null,
                            // A emissão é opcional e NÃO define nada — `null` quando ausente,
                            // porque preenchê-la com a entrada afirmaria uma emissão que
                            // ninguém informou (`ausente-vs-falso.md`).
                            issue_date: values.issue_date ? dayjs(values.issue_date).format('YYYY-MM-DD') : null,
                            entry_date: entrada,
                            credit_date: entrada,
                            credit_date_estimated: false,
                            expense_nature: naturezaDoLancamento.destinacao,
                            expense_category: values.expense_category,
                            // §5 — o TOTAL DA NOTA, não o valor dos produtos: é ele que o
                            // fornecedor cobrou e é ele que o caixa registra.
                            total_amount: amountNum,
                            /*
                              §5 — OS QUATRO DO BLOCO DE CUSTO SÃO GRAVADOS NA NOTA, e NÃO
                              rateados por parcela: eles são fato do DOCUMENTO. Ratear o
                              ICMS-ST em seis inventaria seis frações de um número que a nota
                              traz uma vez só.
                            */
                            valor_ipi_custo: blocoDeCustoDaNota.ipiCusto,
                            valor_icms_st: blocoDeCustoDaNota.icmsSt,
                            valor_difal: blocoDeCustoDaNota.difal,
                            valor_fcp: blocoDeCustoDaNota.fcp,
                            /*
                              §9 — OS ONZE CAMPOS NOVOS, todos NULL quando não informados.
                              Gravá-los como zero afirmaria que a nota foi avaliada e não
                              tinha frete, IS ou fatia — e nenhuma das 327 notas anteriores
                              foi (`ausente-vs-falso.md`).
                            */
                            frete: soNumero(valorFrete),
                            seguro: soNumero(valorSeguro),
                            valor_is: soNumero(valorIsDaNota),
                            /*
                              §4 — `parcela_st`, `parcela_monofasica` e `base_manual_icms`
                              DEIXAM DE SER GRAVADAS PELA TELA. As colunas permanecem no
                              banco, e não há migração: omitir a coluna no insert deixa NULL,
                              que é "não informado" — o que é verdade, porque a tela não tem
                              mais onde informar (`ausente-vs-falso.md`).
                            */
                            base_manual_pis_cofins: usarBaseManualPisCofins ? soNumero(baseManualPisCofins) : null,
                            // `null` quando o usuário não tocou: o padrão é POR FORA, e
                            // gravar `false` afirmaria uma escolha que ninguém fez.
                            /*
                              §2 — `ipi_por_dentro` DEIXA DE SER GRAVADO. A coluna permanece
                              no banco, e omiti-la no insert a deixa NULL — "não informado",
                              que é verdade: a tela não tem mais onde informar. Gravar
                              `false` afirmaria uma escolha que ninguém fez
                              (`ausente-vs-falso.md`).
                            */
                            cst_icms: cstIcmsDoc || null,
                            cst_ipi: cstIpiDoc || null,
                            cst_pis_cofins: cstPisCofinsDoc || null,
                            credit_icms: c.icms,
                            credit_pis_cofins: c.pisCofins,
                            credit_ipi: c.ipi,
                            credit_cbs: c.cbs,
                            credit_ibs: c.ibs,
                            /*
                              §4 — A ALÍQUOTA E O FORMATO DE CADA LINHA.
                              O crédito em R$ sozinho não reabre a nota do jeito que ela foi
                              digitada: ele é o RESULTADO. O que o usuário digitou — 18% ou
                              R$ 1.800,00 — é outra informação, e é ela que ele vai conferir
                              contra a nota na gaveta.
                            */
                            ...colunasDaEntrada(
                                { ICMS: taxaIcms, PIS_COFINS: taxaPisCofins, IPI: taxaIpi, CBS: taxaCbs, IBS: taxaIbs },
                                formatoDeEntrada,
                            ),
                            origin: 'NOVO',
                        })
                        .select('id')
                        .single()
                    if (erroNota) throw erroNota
                    notaId = (nota as { id?: string } | null)?.id ?? null
                }

                if (entries.length > 0) {
                    const comNota = notaId
                        ? entries.map((e) => ({ ...e, purchase_invoice_id: notaId }))
                        : entries
                    const { error } = await supabase.from('cash_entries').insert(comNota)
                    if (error) throw error
                }
                messageApi.success(`${entries.length} lançamento(s) de despesa criado(s)!`)
                // §9 — mudar a base do rateio muda o preço sugerido de TODO produto. O
                // recálculo continua acontecendo; o que muda é que ele deixa de ser silencioso.
                void (async () => {
                    try {
                        const cfg = await mergeExpenseConfig(tenant_id)
                        if (!cfg || !houveMudancaDoPercentual(cfg.fixed_expense_percent_anterior, cfg.fixed_expense_percent)) return
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        // O cast é do `database.types.ts` desatualizado, não da consulta: sem
                        // ele o `tsc` estoura em TS2589 nesta cadeia. As quatro colunas existem.
                        const { data: prods } = await (supabase as any)
                            .from('products')
                            .select('id, name, cost_total, sale_price')
                            .eq('tenant_id', tenant_id)
                            .eq('is_active', true)
                        const lista = calcularImpactoDoRateio({
                            pctAntes: cfg.fixed_expense_percent_anterior as number,
                            pctDepois: cfg.fixed_expense_percent,
                            produtos: ((prods ?? []) as ProdutoDoImpacto[]).map((p) => ({
                                id: String(p.id),
                                nome: String(p.name ?? ''),
                                custoAtual: Number(p.cost_total) || 0,
                                precoAtual: Number(p.sale_price) || 0,
                            })),
                        })
                        setImpactoPct({ antes: cfg.fixed_expense_percent_anterior as number, depois: cfg.fixed_expense_percent })
                        setImpactos(lista)
                        setImpactoAberto(true)
                    } catch { /* o aviso é informativo: falhar nele não pode derrubar o lançamento */ }
                })()
            }

            setDrawerOpen(false)
            form.resetFields()
            setExpenseAmount('')
            setExpPaymentMethod('')
            setExpInstallments([{ date: null, amount: 0 }])
            setExpInstallmentPreset('customizado')
            setExpManualDates(false)
            setSelectedExpenseCategory('')
            await fetchData()
        } catch (err: any) {
            if (err && err.name === 'ValidateError') {
                messageApi.error('Preencha os campos obrigatórios.')
            } else if (err && err.message) {
                messageApi.error('Erro ao salvar lançamento: ' + err.message)
            } else {
                messageApi.error('Preencha os campos obrigatórios.')
            }
        }
    }

    return (
        <Layout title={PAGE_TITLES.CASH_FLOW} subtitle="Relatório de Fluxo de Caixa">
            {contextHolder}

            {/*
              §3 — A FAIXA. Ela é clicável e reabre o modal, e some sozinha quando não há
              vencido: uma faixa exibindo "0 vencidos" treinaria o usuário a ignorá-la.
            */}
            {vencidos.temVencidos && (
                <div style={{ marginBottom: 12 }}>
                    <FaixaDeVencidos resumo={vencidos} onAbrir={() => setVencidosAbertos(true)} />
                </div>
            )}

            <VencidosModal
                resumo={vencidos}
                aberto={vencidosAbertos}
                onFechar={dispensarVencidos}
                onMudou={() => { setVencidosToken((t) => t + 1); void fetchData() }}
            />

            <div className="pc-card cashflow-toolbar" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                {/* Doc 28/07 (item 35): "Atualizar" removido (dados carregam automaticamente).
                    Linha 1 = seletor de mês (reduzido) + "Novo Lançamento" (sem o ícone "+" redundante
                    com o texto). Linha 2 = "Saldo Mês Ant." + "Exportar". */}
                {/* Relatório 30/07 (mobile #6): no celular, Linha 1 = mês (esq.) + "Novo Lançamento"
                    na borda direita da MESMA linha; Linha 2 = "Saldo Mês Ant." + "Exportar". */}
                <Space wrap className="cashflow-toolbar-group cashflow-toolbar-group--primary">
                    <CalendarOutlined style={{ fontSize: 18, color: '#94a3b8' }} />
                    <DatePicker picker="month" value={month} onChange={(d) => d && setMonth(d)} allowClear={false} format="MMMM YYYY" />
                    {canEdit(MODULES.CASH_FLOW) && (
                        <Button type="primary" onClick={() => { form.resetFields(); setExpenseAmount(''); setExpPaymentMethod(''); setExpInstallments([{ date: null, amount: 0 }]); setExpInstallmentPreset('customizado'); setExpManualDates(false); setSelectedExpenseCategory(''); setFormatoDeEntrada({}); setRevelarEscadaCompleta(false);      setDrawerOpen(true) }}>
                            + Novo Lançamento
                        </Button>
                    )}
                </Space>
                <Space wrap className="cashflow-toolbar-group cashflow-toolbar-group--secondary">
                    {canEdit(MODULES.CASH_FLOW) && (
                        <Button loading={loadingPrevBalance} onClick={handlePrevMonthBalance}>
                            <span className="cashflow-btn-label-full">Saldo do Mês Anterior</span>
                            <span className="cashflow-btn-label-short">Saldo Mês Ant.</span>
                        </Button>
                    )}
                    <Button
                        icon={<FileExcelOutlined />}
                        onClick={() => setExportFormatModalOpen(true)}
                        style={{ background: '#217346', borderColor: '#217346', color: '#fff' }}
                    >
                        Exportar
                    </Button>
                </Space>
            </div>

            {/* ── Aviso de ações pendentes hoje ── */}
            {todayPendingEntries.length > 0 && (
                <Alert
                    type="warning"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message={`Você tem ${todayPendingEntries.length} lançamento${todayPendingEntries.length > 1 ? 's' : ''} pendente${todayPendingEntries.length > 1 ? 's' : ''} para hoje (${dayjs().format('DD/MM/YYYY')})`}
                    description={(() => {
                        const expenses = todayPendingEntries.filter((e: any) => e.type === 'EXPENSE')
                        const incomes = todayPendingEntries.filter((e: any) => e.type === 'INCOME')
                        const parts: string[] = []
                        if (expenses.length > 0) parts.push(`${expenses.length} despesa${expenses.length > 1 ? 's' : ''} a pagar`)
                        if (incomes.length > 0) parts.push(`${incomes.length} recebimento${incomes.length > 1 ? 's' : ''} a confirmar`)
                        return `Ações a tomar: ${parts.join(' e ')}. Clique nos valores na tabela para registrar.`
                    })()}
                />
            )}

            {/* ── Pivot Table: Excel-like Grid ── */}
            <div className="cashflow-pivot-card" style={{ background: '#0d1b2a', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)', marginTop: 0 }}>
                {/* Header */}
                <div className="cashflow-section-header" style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#1a2744', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>
                        Fluxo de Caixa — {month.format('MMMM [de] YYYY')}
                    </span>
                    {/*
                      O SELETOR "Previsto | Confirmado" SAIU em 26/09/2026.

                      O fluxo de caixa tem UMA leitura: entradas lançadas menos saídas
                      lançadas, com ou sem baixa. "Confirmado" é extrato do que já ocorreu, e
                      essa pergunta é do DRE por caixa — duas leituras aqui obrigavam o
                      usuário a saber em qual delas estava antes de acreditar no número, e o
                      modo errado é indistinguível do certo num print.
                    */}
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>
                        Visão por dia — tudo que está lançado, dos dois lados
                    </span>
                </div>

                {/* Pivot Table */}
                <div className="cashflow-pivot-scroll" style={{ overflowX: 'auto', width: '100%', WebkitOverflowScrolling: 'touch' }}>
                    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#1a2744' }}>
                                <th style={{ padding: '8px 12px', textAlign: 'left', color: '#94a3b8', fontWeight: 600, minWidth: 180, position: 'sticky', left: 0, background: '#1a2744', zIndex: 2, borderRight: '1px solid rgba(255,255,255,0.1)' }}>
                                    Categoria
                                </th>
                                {Array.from({ length: pivotByDay.daysInMonth }, (_, i) => i + 1).map(day => (
                                    <th key={day} style={{ padding: '6px 8px', textAlign: 'center', color: '#94a3b8', fontWeight: 600, minWidth: 92, borderRight: '1px solid rgba(255,255,255,0.04)' }}>
                                        {String(day).padStart(2, '0')}
                                    </th>
                                ))}
                                <th style={{ padding: '8px 12px', textAlign: 'right', color: '#e2e8f0', fontWeight: 700, minWidth: 110, background: '#1a2744', borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
                                    TOTAL
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {/* ── Saldo Mês Anterior ── */}
                            {prevMonthBalanceValue !== 0 && (
                                <tr style={{ background: '#1a2f4a', borderLeft: '3px solid #f59e0b' }}>
                                    <td style={{ padding: '6px 12px', color: '#fbbf24', fontWeight: 700, position: 'sticky', left: 0, background: '#12233a', borderRight: '1px solid rgba(255,255,255,0.06)', zIndex: 1, whiteSpace: 'nowrap', fontSize: 12 }}>
                                        Saldo Mês Anterior
                                    </td>
                                    {Array.from({ length: pivotByDay.daysInMonth }, (_, i) => i + 1).map(day => (
                                        <td key={day} style={{ padding: '5px 4px', textAlign: 'right', color: '#fbbf24', fontWeight: 600, fontVariantNumeric: 'tabular-nums', borderRight: '1px solid rgba(255,255,255,0.04)', fontSize: 11 }}>
                                            {day === 1 ? (
                                                /* Item 11 (Relatório 24/07): valor clicável → abre o modal
                                                   de correção/exclusão do Saldo do Mês Anterior. */
                                                <span
                                                    onClick={handlePrevMonthBalance}
                                                    style={{ cursor: 'pointer', borderBottom: '1px dashed rgba(251,191,36,0.6)' }}
                                                    title="Clique para corrigir ou excluir o saldo do mês anterior"
                                                >
                                                    {formatCurrency(prevMonthBalanceValue)}
                                                </span>
                                            ) : ''}
                                        </td>
                                    ))}
                                    <td style={{ padding: '5px 12px', textAlign: 'right', color: prevMonthBalanceValue >= 0 ? '#4ade80' : '#f87171', fontWeight: 700, fontVariantNumeric: 'tabular-nums', borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
                                        <span
                                            onClick={handlePrevMonthBalance}
                                            style={{ cursor: 'pointer', borderBottom: '1px dashed rgba(255,255,255,0.3)' }}
                                            title="Clique para corrigir ou excluir o saldo do mês anterior"
                                        >
                                            {formatCurrency(prevMonthBalanceValue)}
                                        </span>
                                    </td>
                                </tr>
                            )}

                            {/* ── Saldo Dia Anterior ── */}
                            <tr style={{ background: '#1e3a5f', borderLeft: '3px solid #3b82f6' }}>
                                <td style={{ padding: '6px 12px', color: '#93c5fd', fontWeight: 700, position: 'sticky', left: 0, background: '#162f4d', borderRight: '1px solid rgba(255,255,255,0.06)', zIndex: 1, whiteSpace: 'nowrap', fontSize: 12 }}>
                                    Saldo do Dia Anterior
                                </td>
                                {Array.from({ length: pivotByDay.daysInMonth }, (_, i) => i + 1).map(day => {
                                    const val = saldoDiaAnterior[day] || 0
                                    return (
                                        <td key={day} style={{ padding: '5px 4px', textAlign: 'right', color: val > 0 ? '#4ade80' : val < 0 ? '#f87171' : '#334155', fontWeight: 600, fontVariantNumeric: 'tabular-nums', borderRight: '1px solid rgba(255,255,255,0.04)', fontSize: 11 }}>
                                            {val !== 0 ? formatCurrency(val) : ''}
                                        </td>
                                    )
                                })}
                                <td style={{ padding: '5px 12px', textAlign: 'right', color: '#93c5fd', fontWeight: 600, fontVariantNumeric: 'tabular-nums', borderLeft: '1px solid rgba(255,255,255,0.1)' }}>—</td>
                            </tr>

                            {/* ── ENTRADAS header ── */}
                            <tr style={{ background: '#00B050' }}>
                                <td colSpan={pivotByDay.daysInMonth + 2} style={{ padding: '7px 12px', fontWeight: 700, color: '#fff', fontSize: 13, letterSpacing: 1, position: 'sticky', left: 0 }}>
                                    ENTRADAS
                                </td>
                            </tr>
                            {INCOME_LABELS.map((label, idx) => {
                                const rowTotal = Object.values(pivotByDay.data[label] || {}).reduce((a, b) => a + b, 0)
                                if (rowTotal === 0) return null
                                return (
                                    <tr key={label} style={{ background: idx % 2 === 0 ? 'rgba(0,176,80,0.06)' : 'rgba(0,176,80,0.03)', borderLeft: '3px solid #00B050' }}>
                                        <td style={{ padding: '6px 12px', color: '#cbd5e1', position: 'sticky', left: 0, background: idx % 2 === 0 ? '#0d2a1a' : '#0a2016', borderRight: '1px solid rgba(255,255,255,0.06)', zIndex: 1, whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: 180, textOverflow: 'ellipsis' }}>
                                            {label}
                                        </td>
                                        {Array.from({ length: pivotByDay.daysInMonth }, (_, i) => i + 1).map(day => {
                                            const val = (pivotByDay.data[label] || {})[day] || 0
                                            const cellPaid = (pivotByDay.paidEntriesMap[label] || {})[day] || []
                                            const cellUnpaid = (pivotByDay.entriesMap[label] || {})[day] || []
                                            const cellEntries = [...cellPaid, ...cellUnpaid]
                                            return (
                                                <td key={day} style={{ padding: '5px 4px', textAlign: 'right', color: val > 0 ? '#4ade80' : '#334155', fontVariantNumeric: 'tabular-nums', borderRight: '1px solid rgba(255,255,255,0.04)', fontSize: 11 }}>
                                                    {val > 0 && cellEntries.length > 0 ? (
                                                        <span
                                                            onClick={() => {
                                                                if (cellEntries.length === 1) {
                                                                    handleOpenPaymentModal(cellEntries[0])
                                                                } else {
                                                                    setPendingSelectEntries(cellEntries)
                                                                    setPendingSelectOpen(true)
                                                                }
                                                            }}
                                                            style={{ cursor: 'pointer', color: '#4ade80', borderBottom: '1px dashed rgba(74,222,128,0.6)' }}
                                                            title={cellEntries.length > 1 ? `${cellEntries.length} lançamentos — clique para selecionar` : 'Clique para editar lançamento'}
                                                        >
                                                            {formatCurrency(val)}
                                                            {cellEntries.length > 1 && <span style={{ fontSize: 10, marginLeft: 3, background: '#4ade80', color: '#000', borderRadius: 8, padding: '0 4px' }}>{cellEntries.length}</span>}
                                                        </span>
                                                    ) : val > 0 ? formatCurrency(val) : ''}
                                                </td>
                                            )
                                        })}
                                        <td style={{ padding: '5px 12px', textAlign: 'right', color: rowTotal > 0 ? '#4ade80' : '#64748b', fontWeight: 600, fontVariantNumeric: 'tabular-nums', borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
                                            {rowTotal > 0 ? formatCurrency(rowTotal) : '—'}
                                        </td>
                                    </tr>
                                )
                            })}
                            {/* Pending income row (Boleto/Cheque a receber) */}
                            {(() => {
                                const pendingKey = '__PENDING_INCOME__'
                                const pendingRowTotal = Object.values(pivotByDay.data[pendingKey] || {}).reduce((a: number, b: number) => a + b, 0)
                                if (pendingRowTotal === 0) return null
                                return (
                                    <tr style={{ background: 'rgba(251,191,36,0.08)', borderLeft: '3px solid #f59e0b' }}>
                                        <td style={{ padding: '6px 12px', color: '#fbbf24', position: 'sticky', left: 0, background: '#1a1500', borderRight: '1px solid rgba(255,255,255,0.06)', zIndex: 1, whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: 180, textOverflow: 'ellipsis', fontSize: 12 }}>
                                            ⏳ A Receber (Boleto/Cheque)
                                            {/*
                                              §4.2 — O RÓTULO QUE IMPEDE A LEITURA DUPLA.
                                              A faixa é a DECOMPOSIÇÃO do que o saldo já
                                              somou, nunca um total paralelo. Sem dizer
                                              isso, o usuário soma o valor ao saldo de novo —
                                              e o número que ele obtém não existe em lugar
                                              nenhum do sistema.
                                            */}
                                            <div style={{ fontSize: 10, color: '#a16207', fontWeight: 600 }}>
                                                {rotuloDaFaixaDePrevisto()}
                                            </div>
                                        </td>
                                        {Array.from({ length: pivotByDay.daysInMonth }, (_, i) => i + 1).map(day => {
                                            const val = (pivotByDay.data[pendingKey] || {})[day] || 0
                                            const cellEntries = (pivotByDay.entriesMap[pendingKey] || {})[day] || []
                                            return (
                                                <td key={day} style={{ padding: '5px 4px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', borderRight: '1px solid rgba(255,255,255,0.04)', fontSize: 11 }}>
                                                    {val > 0 && cellEntries.length > 0 ? (
                                                        <span
                                                            onClick={() => {
                                                                if (cellEntries.length === 1) {
                                                                    handleOpenPaymentModal(cellEntries[0])
                                                                } else {
                                                                    setPendingSelectEntries(cellEntries)
                                                                    setPendingSelectOpen(true)
                                                                }
                                                            }}
                                                            style={{ cursor: 'pointer', color: '#fbbf24', borderBottom: '1px dashed rgba(251,191,36,0.6)' }}
                                                            title={cellEntries.length > 1 ? `${cellEntries.length} lançamentos — clique para selecionar` : 'Clique para confirmar recebimento'}
                                                        >
                                                            {formatCurrency(val)}
                                                            {cellEntries.length > 1 && <span style={{ fontSize: 10, marginLeft: 3, background: '#f59e0b', color: '#000', borderRadius: 8, padding: '0 4px' }}>{cellEntries.length}</span>}
                                                        </span>
                                                    ) : val > 0 ? <span style={{ color: '#fbbf24' }}>{formatCurrency(val)}</span> : ''}
                                                </td>
                                            )
                                        })}
                                        <td style={{ padding: '5px 12px', textAlign: 'right', color: '#fbbf24', fontWeight: 600, fontVariantNumeric: 'tabular-nums', borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
                                            {formatCurrency(pendingRowTotal)}
                                        </td>
                                    </tr>
                                )
                            })()}
                            {/* Total Entradas */}
                            <tr style={{ background: '#00B050' }}>
                                <td style={{ padding: '7px 12px', fontWeight: 700, color: '#fff', fontSize: 12, position: 'sticky', left: 0, background: '#00B050', zIndex: 1 }}>
                                    TOTAL ENTRADAS
                                </td>
                                {Array.from({ length: pivotByDay.daysInMonth }, (_, i) => i + 1).map(day => {
                                    const dayTotal = INCOME_LABELS.reduce((sum, label) => sum + ((pivotByDay.data[label] || {})[day] || 0), 0)
                                    return (
                                        <td key={day} style={{ padding: '5px 4px', textAlign: 'right', color: dayTotal > 0 ? '#fff' : 'rgba(255,255,255,0.3)', fontWeight: 600, fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
                                            {dayTotal > 0 ? formatCurrency(dayTotal) : ''}
                                        </td>
                                    )
                                })}
                                <td style={{ padding: '7px 12px', textAlign: 'right', color: '#fff', fontWeight: 700, fontVariantNumeric: 'tabular-nums', borderLeft: '1px solid rgba(255,255,255,0.2)' }}>
                                    {formatCurrency(extratoData.totalEntradas)}
                                </td>
                            </tr>

                            {/* Spacer */}
                            <tr><td colSpan={pivotByDay.daysInMonth + 2} style={{ height: 8, background: '#0d1b2a' }} /></tr>

                            {/* ── SAIDAS header ── */}
                            <tr style={{ background: '#DC2626' }}>
                                <td colSpan={pivotByDay.daysInMonth + 2} style={{ padding: '7px 12px', fontWeight: 700, color: '#fff', fontSize: 13, letterSpacing: 1, position: 'sticky', left: 0 }}>
                                    SAÍDAS
                                </td>
                            </tr>
                            {GROUP_ORDER.map(group => {
                                const groupTotal = extratoData.groupTotals[group] || 0
                                if (groupTotal === 0) return null
                                const color = GROUP_COLORS[group] || '#64748b'
                                const label = getExpenseGroupLabel(group)
                                const descs = pivotByDay.descsByGroup[group] || []
                                return (
                                    <React.Fragment key={group}>
                                        {/* Group header row */}
                                        <tr style={{ background: `${color}33`, borderLeft: `4px solid ${color}` }}>
                                            <td style={{ padding: '6px 12px', color: '#e2e8f0', fontWeight: 700, position: 'sticky', left: 0, background: `linear-gradient(${color}44, ${color}44), #0d1b2a`, borderRight: '1px solid rgba(255,255,255,0.06)', zIndex: 1, whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: 180, textOverflow: 'ellipsis', fontSize: 12 }}>
                                                {label}
                                            </td>
                                            {Array.from({ length: pivotByDay.daysInMonth }, (_, i) => i + 1).map(day => {
                                                const val = (pivotByDay.data[group] || {})[day] || 0
                                                const hasUnpaid = ((pivotByDay.unpaidAmounts[group] || {})[day] || 0) > 0
                                                const cellEntries = (pivotByDay.entriesMap[group] || {})[day] || []
                                                const paidCellEntries = (pivotByDay.paidEntriesMap[group] || {})[day] || []
                                                const textColor = val > 0 ? (hasUnpaid ? '#f87171' : 'rgba(255,255,255,0.3)') : '#334155'
                                                const activeEntries = hasUnpaid ? cellEntries : paidCellEntries
                                                return (
                                                    <td key={day} style={{ padding: '5px 4px', textAlign: 'right', color: textColor, fontVariantNumeric: 'tabular-nums', borderRight: '1px solid rgba(255,255,255,0.04)', fontSize: 11 }}>
                                                        {val > 0 && activeEntries.length > 0 ? (
                                                            <span
                                                                onClick={() => {
                                                                    if (activeEntries.length === 1) {
                                                                        handleOpenPaymentModal(activeEntries[0])
                                                                    } else {
                                                                        setExpenseSelectEntries(activeEntries)
                                                                        setExpenseSelectOpen(true)
                                                                    }
                                                                }}
                                                                style={{ cursor: 'pointer', borderBottom: hasUnpaid ? '1px dashed rgba(248,113,113,0.6)' : '1px dashed rgba(255,255,255,0.2)' }}
                                                                title={activeEntries.length > 1 ? `${activeEntries.length} lançamentos — clique para selecionar` : (hasUnpaid ? 'Clique para registrar pagamento' : 'Pago — clique para editar ou cancelar')}
                                                            >
                                                                {formatCurrency(val)}
                                                                {activeEntries.length > 1 && <span style={{ fontSize: 10, marginLeft: 3, background: '#ef4444', color: '#fff', borderRadius: 8, padding: '0 4px' }}>{activeEntries.length}</span>}
                                                            </span>
                                                        ) : val > 0 ? formatCurrency(val) : ''}
                                                    </td>
                                                )
                                            })}
                                            <td style={{ padding: '5px 12px', textAlign: 'right', color: '#f87171', fontWeight: 700, fontVariantNumeric: 'tabular-nums', borderLeft: '1px solid rgba(255,255,255,0.1)' }}>
                                                {formatCurrency(groupTotal)}
                                            </td>
                                        </tr>
                                        {/* Description sub-rows */}
                                        {descs.map(desc => {
                                            const descKey = `${group}||${desc}`
                                            const descTotal = Object.values(pivotByDay.data[descKey] || {}).reduce((a: number, b: number) => a + b, 0)
                                            if (descTotal === 0) return null
                                            return (
                                                <tr key={descKey} style={{ background: `${color}11`, borderLeft: `4px solid ${color}` }}>
                                                    <td style={{ padding: '4px 12px 4px 28px', color: '#94a3b8', position: 'sticky', left: 0, background: `linear-gradient(${color}18, ${color}18), #0d1b2a`, borderRight: '1px solid rgba(255,255,255,0.04)', zIndex: 1, whiteSpace: 'nowrap', overflow: 'hidden', maxWidth: 180, textOverflow: 'ellipsis', fontSize: 11 }}>
                                                        ↳ {desc}
                                                    </td>
                                                    {Array.from({ length: pivotByDay.daysInMonth }, (_, i) => i + 1).map(day => {
                                                        const val = (pivotByDay.data[descKey] || {})[day] || 0
                                                        const hasUnpaid = ((pivotByDay.unpaidAmounts[descKey] || {})[day] || 0) > 0
                                                        const cellEntries = (pivotByDay.entriesMap[descKey] || {})[day] || []
                                                        const paidCellEntries = (pivotByDay.paidEntriesMap[descKey] || {})[day] || []
                                                        const textColor = val > 0 ? (hasUnpaid ? '#fca5a5' : 'rgba(255,255,255,0.3)') : '#334155'
                                                        const activeDescEntries = hasUnpaid ? cellEntries : paidCellEntries
                                                        return (
                                                            <td key={day} style={{ padding: '4px 4px', textAlign: 'right', color: textColor, fontVariantNumeric: 'tabular-nums', borderRight: '1px solid rgba(255,255,255,0.02)', fontSize: 10 }}>
                                                                {val > 0 && activeDescEntries.length > 0 ? (
                                                                    <span
                                                                        onClick={() => {
                                                                            if (activeDescEntries.length === 1) {
                                                                                handleOpenPaymentModal(activeDescEntries[0])
                                                                            } else {
                                                                                setExpenseSelectEntries(activeDescEntries)
                                                                                setExpenseSelectOpen(true)
                                                                            }
                                                                        }}
                                                                        style={{ cursor: 'pointer', borderBottom: hasUnpaid ? '1px dashed rgba(252,165,165,0.6)' : '1px dashed rgba(255,255,255,0.2)' }}
                                                                        title={activeDescEntries.length > 1 ? `${activeDescEntries.length} lançamentos — clique para selecionar` : (hasUnpaid ? 'Clique para registrar pagamento' : 'Pago — clique para editar ou cancelar')}
                                                                    >
                                                                        {formatCurrency(val)}
                                                                        {activeDescEntries.length > 1 && <span style={{ fontSize: 9, marginLeft: 3, background: '#ef4444', color: '#fff', borderRadius: 8, padding: '0 3px' }}>{activeDescEntries.length}</span>}
                                                                    </span>
                                                                ) : val > 0 ? formatCurrency(val) : ''}
                                                            </td>
                                                        )
                                                    })}
                                                    <td style={{ padding: '4px 12px', textAlign: 'right', color: '#fca5a5', fontWeight: 500, fontVariantNumeric: 'tabular-nums', borderLeft: '1px solid rgba(255,255,255,0.06)', fontSize: 11 }}>
                                                        {formatCurrency(descTotal)}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </React.Fragment>
                                )
                            })}
                            {/* Total Saidas */}
                            <tr style={{ background: '#DC2626' }}>
                                <td style={{ padding: '7px 12px', fontWeight: 700, color: '#fff', fontSize: 12, position: 'sticky', left: 0, background: '#DC2626', zIndex: 1 }}>
                                    TOTAL SAÍDAS
                                </td>
                                {Array.from({ length: pivotByDay.daysInMonth }, (_, i) => i + 1).map(day => {
                                    const dayTotal = GROUP_ORDER.reduce((sum, g) => sum + ((pivotByDay.data[g] || {})[day] || 0), 0)
                                    return (
                                        <td key={day} style={{ padding: '5px 4px', textAlign: 'right', color: dayTotal > 0 ? '#fff' : 'rgba(255,255,255,0.3)', fontWeight: 600, fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
                                            {dayTotal > 0 ? formatCurrency(dayTotal) : ''}
                                        </td>
                                    )
                                })}
                                <td style={{ padding: '7px 12px', textAlign: 'right', color: '#fff', fontWeight: 700, fontVariantNumeric: 'tabular-nums', borderLeft: '1px solid rgba(255,255,255,0.2)' }}>
                                    {formatCurrency(extratoData.totalSaidas)}
                                </td>
                            </tr>

                            {/*
                              ── DIA CONSIDERADO — §4 ──
                              Entre "Total de saídas" e "Saldo acumulado", a data que cada
                              coluna representa.

                              >>> É APRESENTAÇÃO: NÃO ENTRA EM SOMA NENHUMA <<<
                              A linha é `<tr>` de texto, e nenhuma célula dela é lida por
                              `dailyAccumulatedBalance` nem por `extratoData`. O saldo
                              acumulado antes é igual ao depois, e há caso afirmando isso.
                            */}
                            <tr style={{ background: '#0f172a' }}>
                                <td style={{ padding: '6px 12px', fontWeight: 600, color: '#94a3b8', fontSize: 11, position: 'sticky', left: 0, background: '#0f172a', zIndex: 1, whiteSpace: 'nowrap' }}>
                                    DIA CONSIDERADO
                                </td>
                                {Array.from({ length: pivotByDay.daysInMonth }, (_, i) => i + 1).map(day => (
                                    <td key={day} style={{ padding: '5px 4px', textAlign: 'right', color: '#64748b', fontSize: 10, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                                        {month.date(day).format('DD/MM/YYYY')}
                                    </td>
                                ))}
                                {/* Na coluna de MÊS, o INTERVALO — ela não representa um dia. */}
                                <td style={{ padding: '6px 12px', textAlign: 'right', color: '#64748b', fontSize: 10, whiteSpace: 'nowrap', borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
                                    {month.startOf('month').format('DD/MM')} a {month.endOf('month').format('DD/MM')}
                                </td>
                            </tr>

                            {/* ── SALDO ACUMULADO ── */}
                            <tr style={{ background: '#1e1b4b', borderLeft: '5px solid #818cf8' }}>
                                <td style={{ padding: '10px 12px', fontWeight: 700, color: '#c7d2fe', fontSize: 13, position: 'sticky', left: 0, background: '#1e1b4b', borderRight: '1px solid rgba(255,255,255,0.1)', zIndex: 1, whiteSpace: 'nowrap' }}>
                                    SALDO ACUMULADO
                                </td>
                                {Array.from({ length: pivotByDay.daysInMonth }, (_, i) => i + 1).map(day => {
                                    const val = dailyAccumulatedBalance[day] ?? 0
                                    return (
                                        <td key={day} style={{ padding: '5px 4px', textAlign: 'right', color: val > 0 ? '#4ade80' : val < 0 ? '#f87171' : '#475569', fontWeight: 700, fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
                                            {val !== 0 ? formatCurrency(val) : ''}
                                        </td>
                                    )
                                })}
                                <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, fontSize: 16, fontVariantNumeric: 'tabular-nums', color: (dailyAccumulatedBalance[pivotByDay.daysInMonth] ?? 0) >= 0 ? '#4ade80' : '#f87171', borderLeft: '1px solid rgba(255,255,255,0.15)' }}>
                                    {formatCurrency(dailyAccumulatedBalance[pivotByDay.daysInMonth] ?? 0)}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>


            {/* ── Tabela Diária ── */}
            <div style={{ marginTop: 24, background: '#0d1b2a', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="cashflow-section-header" style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#1a2744', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>
                        Lançamentos por Dia — {month.format('MMMM/YYYY')}
                    </span>
                    {selectedDay !== null && (
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>
                            Filtrando dia <strong style={{ color: '#60a5fa' }}>{selectedDay}</strong>
                        </span>
                    )}
                </div>
                {isCompact ? (
                    <div className="cashflow-entries-mobile" style={{ padding: '0 0 8px' }}>
                        {[...dfcData].sort((a: any, b: any) => (a.due_date || '').localeCompare(b.due_date || '')).map((r: any) => {
                            const val = r.type === 'INCOME' ? getEffectiveIncomeAmount(r) : Number(r.amount || 0)
                            const dateLabel = r.due_date ? `${r.due_date.substring(8, 10)}/${r.due_date.substring(5, 7)}` : '—'
                            const description = (r.description?.split(' — ')[0] || r.description || '—') as string
                            const saleCode = r.origin_type === 'SALE' && r.origin_id ? saleCodeMap[r.origin_id] : null
                            const isIncome = r.type === 'INCOME'
                            const needsConfirmation = r.payment_method === 'BOLETO' || r.payment_method === 'CHEQUE_PRE_DATADO'
                            const paidIncome = isIncome && needsConfirmation && r.paid_date
                            const pendingIncome = isIncome && needsConfirmation && !r.paid_date
                            const paidExpense = !isIncome && r.paid_date
                            const pendingExpense = !isIncome && !r.paid_date
                            let amountClass = isIncome ? 'positive' : 'negative'
                            let amountColor: string | undefined
                            if (paidExpense) amountColor = 'rgba(255,255,255,0.35)'
                            else if (paidIncome) amountColor = 'rgba(74,222,128,0.45)'
                            else if (pendingIncome) amountColor = '#fbbf24'
                            const sign = isIncome ? '+' : '-'
                            const tappable = isIncome ? needsConfirmation : true
                            const groupLabel = !isIncome && r.expense_group ? getExpenseGroupLabel(r.expense_group) : null
                            const groupColor = !isIncome && r.expense_group ? getExpenseGroupColor(r.expense_group) : null
                            return (
                                <div
                                    key={r.id}
                                    className="pc-mobile-card"
                                    onClick={tappable ? () => handleOpenPaymentModal(r) : undefined}
                                    style={{ cursor: tappable ? 'pointer' : 'default' }}
                                >
                                    <div className="pc-mobile-card-header">
                                        <div style={{ minWidth: 0, flex: 1 }}>
                                            <h3 className="pc-mobile-card-title">{description}</h3>
                                            <p className="pc-mobile-card-subtitle">
                                                {dateLabel}
                                                {saleCode && <Tag color="blue" style={{ marginLeft: 6, fontSize: 10 }}>{saleCode}</Tag>}
                                            </p>
                                        </div>
                                        <strong
                                            className={`pc-mobile-card-amount ${amountClass}`}
                                            style={amountColor ? { color: amountColor } : undefined}
                                        >
                                            {sign} {formatCurrency(val)}
                                        </strong>
                                    </div>
                                    <div className="pc-mobile-card-body">
                                        <span>
                                            <Tag color={isIncome ? 'green' : 'red'} style={{ fontSize: 10, marginRight: 0 }}>
                                                {isIncome ? 'Receita' : 'Despesa'}
                                            </Tag>
                                        </span>
                                        {groupLabel && groupColor && (
                                            <span>
                                                <Tag style={{ fontSize: 10, background: groupColor + '22', color: groupColor, border: `1px solid ${groupColor}55`, marginRight: 0 }}>
                                                    {groupLabel}
                                                </Tag>
                                            </span>
                                        )}
                                        {pendingExpense && <span style={{ color: '#f87171' }}>Pendente</span>}
                                        {pendingIncome && <span style={{ color: '#fbbf24' }}>Aguardando</span>}
                                    </div>
                                </div>
                            )
                        })}
                        {dfcData.length === 0 && (
                            <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
                                Nenhum lançamento neste período.
                            </div>
                        )}
                    </div>
                ) : (
                <div className="no-mobile-stack cashflow-entries-table" style={{ padding: '0 0 8px' }}>
                    <Table
                        scroll={{ x: 'max-content' }}
                        dataSource={[...dfcData].sort((a: any, b: any) => (a.due_date || '').localeCompare(b.due_date || ''))}
                        rowKey="id"
                        size="small"
                        pagination={{ pageSize: PAGE_SIZE, showTotal: (t) => `${t} lançamentos` }}
                        columns={[
                            {
                                title: 'Data',
                                dataIndex: 'due_date',
                                key: 'due_date',
                                width: 100,
                                render: (v: string) => v ? v.substring(8, 10) + '/' + v.substring(5, 7) + '/' + v.substring(0, 4) : '—',
                            },
                            {
                                title: 'Descrição',
                                dataIndex: 'description',
                                key: 'description',
                                render: (t: string, r: any) => {
                                    const head = t?.split(' — ')[0] || t || '—'
                                    const saleCode = r?.origin_type === 'SALE' && r?.origin_id ? saleCodeMap[r.origin_id] : null
                                    return (
                                        <span style={{ fontSize: 13 }}>
                                            {head}
                                            {saleCode && (
                                                <Tag color="blue" style={{ marginLeft: 8, fontSize: 10 }}>{saleCode}</Tag>
                                            )}
                                        </span>
                                    )
                                },
                            },
                            {
                                title: 'Tipo',
                                dataIndex: 'type',
                                key: 'type',
                                width: 90,
                                render: (v: string) => (
                                    <Tag color={v === 'INCOME' ? 'green' : 'red'} style={{ fontSize: 11 }}>
                                        {v === 'INCOME' ? 'Receita' : 'Despesa'}
                                    </Tag>
                                ),
                            },
                            {
                                title: 'Categoria',
                                dataIndex: 'expense_group',
                                key: 'expense_group',
                                width: 140,
                                render: (v: string, r: any) => {
                                    if (r.type !== 'EXPENSE' || !v) return <span style={{ color: '#475569', fontSize: 11 }}>—</span>
                                    const color = getExpenseGroupColor(v)
                                    return (
                                        <Tag style={{ fontSize: 10, background: color + '22', color, border: `1px solid ${color}55` }}>
                                            {getExpenseGroupLabel(v)}
                                        </Tag>
                                    )
                                },
                            },
                            {
                                title: 'Valor',
                                key: 'valor',
                                width: 130,
                                align: 'right' as const,
                                render: (_: any, r: any) => {
                                    const val = r.type === 'INCOME' ? getEffectiveIncomeAmount(r) : Number(r.amount || 0)
                                    if (r.type === 'EXPENSE') {
                                        if (r.paid_date) {
                                            return (
                                                <strong
                                                    onClick={() => handleOpenPaymentModal(r)}
                                                    style={{ color: 'rgba(255,255,255,0.3)', fontVariantNumeric: 'tabular-nums', cursor: 'pointer', borderBottom: '1px dashed rgba(255,255,255,0.15)' }}
                                                    title="Pago — clique para editar ou cancelar pagamento"
                                                >
                                                    - {formatCurrency(val)}
                                                </strong>
                                            )
                                        }
                                        return (
                                            <strong
                                                onClick={() => handleOpenPaymentModal(r)}
                                                style={{ color: '#f87171', fontVariantNumeric: 'tabular-nums', cursor: 'pointer', borderBottom: '1px dashed rgba(248,113,113,0.6)' }}
                                                title="Clique para registrar pagamento ou excluir"
                                            >
                                                - {formatCurrency(val)}
                                            </strong>
                                        )
                                    }
                                    const needsConfirmation = r.payment_method === 'BOLETO' || r.payment_method === 'CHEQUE_PRE_DATADO'
                                    if (needsConfirmation) {
                                        if (r.paid_date) {
                                            return (
                                                <strong
                                                    onClick={() => handleOpenPaymentModal(r)}
                                                    style={{ color: 'rgba(74,222,128,0.4)', fontVariantNumeric: 'tabular-nums', cursor: 'pointer', borderBottom: '1px dashed rgba(74,222,128,0.3)' }}
                                                    title="Recebido — clique para editar ou desfazer confirmação"
                                                >
                                                    + {formatCurrency(val)}
                                                </strong>
                                            )
                                        }
                                        return (
                                            <strong
                                                onClick={() => handleOpenPaymentModal(r)}
                                                style={{ color: '#fbbf24', fontVariantNumeric: 'tabular-nums', cursor: 'pointer', borderBottom: '1px dashed rgba(251,191,36,0.6)' }}
                                                title="Aguardando recebimento — clique para confirmar"
                                            >
                                                + {formatCurrency(val)}
                                            </strong>
                                        )
                                    }
                                    return (
                                        <strong
                                            onClick={() => handleOpenPaymentModal(r)}
                                            style={{ color: '#4ade80', fontVariantNumeric: 'tabular-nums', cursor: 'pointer', borderBottom: '1px dashed rgba(74,222,128,0.6)' }}
                                            title="Clique para editar ou excluir lançamento"
                                        >
                                            + {formatCurrency(val)}
                                        </strong>
                                    )
                                },
                            },
                        ]}
                        locale={{ emptyText: 'Nenhum lançamento neste período.' }}
                        style={{ background: 'transparent' }}
                    />
                </div>
                )}
            </div>

            {/* §9 — Aviso de impacto do rateio. NADA é regravado aqui. */}
            <Modal
                title="O percentual de despesa fixa mudou"
                open={impactoAberto}
                onCancel={() => setImpactoAberto(false)}
                footer={<Button onClick={() => setImpactoAberto(false)}>Entendi</Button>}
                width={760}
            >
                <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
                    <div>
                        <div style={{ fontSize: 12, color: '#94a3b8' }}>% antes</div>
                        <div style={{ fontSize: 20 }}>{impactoPct.antes.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</div>
                    </div>
                    <div>
                        <div style={{ fontSize: 12, color: '#94a3b8' }}>% depois</div>
                        <div style={{ fontSize: 20, fontWeight: 600 }}>{impactoPct.depois.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</div>
                    </div>
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 12 }}>
                    Nenhum preço foi alterado. A lista abaixo é uma ESTIMATIVA de quanto cada
                    produto precisaria custar com o percentual novo — quem já foi precificado
                    mantém o preço até você remargear.
                </div>
                <Table
                    size="small"
                    rowKey="id"
                    pagination={{ pageSize: 8 }}
                    dataSource={impactos}
                    columns={[
                        { title: 'Produto', dataIndex: 'nome', key: 'nome' },
                        {
                            title: 'Preço atual', dataIndex: 'precoAtual', key: 'precoAtual',
                            render: (v: number) => v > 0 ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—',
                        },
                        {
                            title: 'Preço recalculado', dataIndex: 'precoNovo', key: 'precoNovo',
                            // Travessão, nunca R$ 0,00: `null` é "não dá para dizer".
                            render: (v: number | null) => v == null ? '—' : `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                        },
                        {
                            title: 'Variação', dataIndex: 'variacao', key: 'variacao',
                            render: (v: number | null) => v == null ? '—' : (
                                <span style={{ color: v > 0 ? '#DC2626' : v < 0 ? '#12B76A' : undefined }}>
                                    {v > 0 ? '+' : ''}{v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            ),
                        },
                    ]}
                />
            </Modal>

            {/* Drawer: Novo Lançamento (Despesa) */}
            {/*
              §2 — O MODAL DE DESPESA EM 50vw, com piso de 720px e teto de 1100px.
              O piso existe para que o bloco de impostos não seja espremido: ele tem quatro
              colunas, e abaixo de 720px elas começam a truncar. O teto evita colunas
              perdidas numa tela larga. A regra mora em `largura-de-modal.ts`, e o CSS
              global cuida de tablet (92vw) e mobile (tela cheia).
            */}
            <Drawer title="Novo Lançamento de Despesa" width={LARGURA_MODAL_50.width} className="drawer-50" open={drawerOpen} destroyOnClose onClose={() => { setDrawerOpen(false); setExpPaymentMethod(''); setExpInstallments([{ date: null, amount: 0 }]); setExpInstallmentPreset('customizado'); setExpManualDates(false); setSelectedExpenseCategory(''); setFormatoDeEntrada({}); setRevelarEscadaCompleta(false);      setCompJuros(''); setCompPrincipal('') }}
                extra={<Button type="primary" onClick={handleSaveEntry}>Salvar</Button>}>
                <Form form={form} layout="vertical">
                    <Form.Item name="expense_category" label="Categoria da Despesa" rules={[{ required: true, message: 'Selecione a categoria' }]}>
                        <Select
                            placeholder="Selecione a categoria"
                            options={activeCategoryOptions}
                            showSearch
                            filterOption={(input, option) => (option?.label as string || '').toLowerCase().includes(input.toLowerCase())}
                            onChange={(v: string) => {
                                setSelectedExpenseCategory(v || '')
                                setCompJuros('')
                                setCompPrincipal('')
                                setFormatoDeEntrada({})
                                // A sugestão do §5: mês ANTERIOR ao vencimento. Ela aparece
                                // no campo, onde o usuário a vê e pode corrigi-la.
                                const venc = expInstallments[0]?.date?.format('YYYY-MM-DD') ?? null
                                const sug = competenciaSugerida(venc)
                                form.setFieldValue('competence_month', sug ? dayjs(`${sug}-01`) : null)
                            }}
                        />
                    </Form.Item>
                    <Form.Item name="expense_description" label="Descrição (opcional)">
                        <Input placeholder="Ex: Conta de luz da loja" />
                    </Form.Item>
                    {/*
                      §5 — O RÓTULO PASSA A DIZER O QUE O CAMPO É.
                      "Valor Total" e o total da nota não eram a mesma coisa, e o campo
                      chamava de total o que é apenas a parcela dos produtos. É o contrato
                      que `ValoresDaCompra.base` já documenta: SEM IPI, ST, DIFAL e FCP.
                    */}
                    {/*
                      §7.2 — O RÓTULO VOLTA A SER "VALOR TOTAL DA NOTA".
                      O #73 o trocou para "Valor dos produtos" porque a tela SOMAVA. Com o
                      descascamento, o campo voltou a ser o total — e é ele que vira as
                      parcelas.
                    */}
                    <Form.Item label={temBlocoDeImposto ? 'Valor total da nota' : 'Valor Total'} required
                        extra={temBlocoDeImposto ? 'É este valor que será dividido nas parcelas e entrará no caixa.' : undefined}>
                        <Input
                            prefix="R$"
                            placeholder="0,00"
                            value={expenseAmount}
                            onChange={(e) => {
                                const newVal = currencyMaskFn(e.target.value)
                                setExpenseAmount(newVal)
                                if (expInstallmentPreset !== 'customizado') {
                                    const total = parseCurrencyFn(newVal)
                                    const n = expInstallments.length
                                    const amt = n > 0 && total > 0 ? Math.round((total / n) * 100) / 100 : 0
                                    setExpInstallments(prev => prev.map(inst => ({ ...inst, amount: amt })))
                                }
                            }}
                        />
                    </Form.Item>
                    {/*
                      §5 — AS CONDIÇÕES DE PAGAMENTO VÊM LOGO APÓS O VALOR TOTAL.

                      Antes elas ficavam DEPOIS do bloco de impostos, e a ordem ensinava a
                      coisa errada: quem lança uma despesa decide primeiro quanto é e como
                      paga — o imposto é leitura da nota, e vem depois. Com o bloco de
                      impostos no meio, o usuário atravessava cinco linhas de tributo para
                      informar o número de parcelas de uma conta de luz.

                      A ordem de TABULAÇÃO acompanha porque é a ordem do DOM: o bloco foi
                      movido, não reposicionado por CSS. `order` do flexbox deixaria o Tab
                      seguindo a ordem antiga, e o teclado veria um formulário diferente do
                      que a tela mostra.
                    */}
                    <Form.Item name="payment_method" label="Método de Pagamento">
                        <Select
                            placeholder="Selecione o método (opcional)"
                            allowClear
                            options={EXPENSE_PAYMENT_METHODS}
                            onChange={(v) => { setExpPaymentMethod(v || ''); setExpInstallments([{ date: null, amount: 0 }]); setExpInstallmentPreset('customizado'); setExpManualDates(false) }}
                        />
                    </Form.Item>
                    {(() => {
                        const isBoletoOrCheque = expPaymentMethod === 'BOLETO' || expPaymentMethod === 'CHEQUE_PRE_DATADO'
                        // Boleto/Cheque Pré-datado sempre usam o editor manual. Para os demais
                        // métodos, o editor manual fica disponível via toggle "Personalizar vencimentos".
                        const showManualEditor = isBoletoOrCheque || expManualDates
                        return (
                            <>
                                {/* Correção Felipe (10/08): seletor Automático x Personalizado — só para
                                    métodos que não são Boleto/Cheque Pré-datado (esses já são sempre manuais). */}
                                {!isBoletoOrCheque && (
                                    <div style={{ marginBottom: 12 }}>
                                        <div style={{ marginBottom: 6, color: '#94a3b8', fontSize: 13, fontWeight: 500 }}>Condição de Pagamento</div>
                                        <Radio.Group
                                            value={expManualDates ? 'manual' : 'auto'}
                                            onChange={(e) => {
                                                const manual = e.target.value === 'manual'
                                                setExpManualDates(manual)
                                                if (manual) {
                                                    // Ao personalizar, começa com uma linha em branco já com o valor total.
                                                    setExpInstallmentPreset('customizado')
                                                    setExpInstallments([{ date: null, amount: parseCurrencyFn(expenseAmount) || 0 }])
                                                }
                                            }}
                                            optionType="button"
                                            size="small"
                                        >
                                            <Radio.Button value="auto">Parcelas mensais</Radio.Button>
                                            <Radio.Button value="manual">Personalizar vencimentos</Radio.Button>
                                        </Radio.Group>
                                    </div>
                                )}

                                {showManualEditor ? (
                                    <div style={{ marginBottom: 16, padding: 12, background: 'rgba(96, 165, 250, 0.08)', border: '1px solid rgba(96,165,250,0.25)', borderRadius: 8 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: '#93c5fd', marginBottom: 8 }}>
                                            Datas e valores de vencimento
                                        </div>
                                        <div style={{ marginBottom: 10 }}>
                                            <Radio.Group
                                                value={expInstallmentPreset}
                                                onChange={(e) => {
                                                    const p = e.target.value
                                                    setExpInstallmentPreset(p)
                                                    const insts = buildInstallmentsByPreset(p)
                                                    const total = parseCurrencyFn(expenseAmount)
                                                    const n = insts.length
                                                    const amt = n > 0 && total > 0 ? Math.round((total / n) * 100) / 100 : 0
                                                    setExpInstallments(insts.map(inst => ({ ...inst, amount: amt })))
                                                }}
                                                size="small"
                                            >
                                                {INSTALLMENT_PRESETS.map(p => <Radio.Button key={p.value} value={p.value}>{p.label}</Radio.Button>)}
                                            </Radio.Group>
                                        </div>
                                        {expInstallments.map((item, idx) => (
                                            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                                                <DatePicker
                                                    placeholder="Data de vencimento"
                                                    format="DD/MM/YYYY"
                                                    value={item.date}
                                                    onChange={(d) => setExpInstallments(prev => prev.map((r, i) => i === idx ? { ...r, date: d } : r))}
                                                    style={{ width: '100%' }}
                                                />
                                                <InputNumber
                                                    min={0} step={0.01} precision={2} style={{ width: '100%' }}
                                                    placeholder="Valor (R$)" value={item.amount || undefined} addonBefore="R$"
                                                    decimalSeparator="," formatter={brlFormatter as any} parser={brlParser as any}
                                                    onChange={(v) => setExpInstallments(prev => prev.map((r, i) => i === idx ? { ...r, amount: Number(v) || 0 } : r))}
                                                />
                                                <Button danger size="small" type="text"
                                                    disabled={expInstallmentPreset !== 'customizado' || expInstallments.length === 1}
                                                    onClick={() => setExpInstallments(prev => prev.filter((_, i) => i !== idx))}>✕</Button>
                                            </div>
                                        ))}
                                        {expInstallmentPreset === 'customizado' && (
                                            <Button type="dashed" size="small" style={{ width: '100%' }}
                                                onClick={() => setExpInstallments(prev => [...prev, { date: null, amount: 0 }])}>
                                                + Adicionar data/valor
                                            </Button>
                                        )}
                                    </div>
                                ) : (
                                    <>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                                            <Form.Item name="parcelas" label="Número de parcelas" initialValue={1}>
                                                <InputNumber min={1} max={120} style={{ width: '100%' }} placeholder="1 = à vista" />
                                            </Form.Item>
                                            <Form.Item name="expense_start_date" label="Data de início" rules={[{ required: true, message: 'Informe a data de início' }]}>
                                                {/* BUG-FLUXOCAIXA-CALENDARIO-001: o calendário abre no mês ativo do filtro
                                                    (month), não no mês corrente do sistema. A key remonta o picker quando o
                                                    filtro muda, garantindo que o defaultPickerValue seja reavaliado. */}
                                                <DatePicker key={month.format('YYYY-MM')} defaultPickerValue={month} style={{ width: '100%' }} format="DD/MM/YYYY" placeholder="DD/MM/AAAA" />
                                            </Form.Item>
                                        </div>
                                        <div style={{ fontSize: 12, color: '#64748b', marginTop: -8 }}>
                                            1 parcela = à vista. 2+ parcelas = parcelado mensalmente a partir da data de início.
                                        </div>
                                    </>
                                )}
                            </>
                        )
                    })()}
                    {isCompromissoFinanceiro && (
                        <div style={{ marginBottom: 16, padding: '12px 14px', background: 'rgba(37,99,235,0.06)', borderRadius: 6, border: '1px solid rgba(37,99,235,0.2)' }}>
                            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>
                                {LABEL_DO_BLOCO} — a parcela tem duas naturezas
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                                <div>
                                    <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Juros (vai para Despesa Financeira)</div>
                                    <Input
                                        prefix="R$"
                                        placeholder="0,00"
                                        value={compJuros}
                                        onChange={(e) => {
                                            const v = currencyMaskFn(e.target.value)
                                            setCompJuros(v)
                                            // O principal acompanha: ele é o RESTO do total, e
                                            // deixá-lo parado convidaria a soma a não fechar.
                                            const total = parseCurrencyFn(expenseAmount)
                                            const j = v === '' ? null : parseCurrencyFn(v)
                                            // `Math.max(0, …)` porque a máscara descarta o sinal: juros maior que o total
                                            // mostraria o resto NEGATIVO como positivo. Zerado, a
                                            // soma não fecha e o aviso de divergência barra o salvar.
                                            setCompPrincipal(j == null ? '' : currencyMaskFn((Math.max(0, total - j) * 100).toFixed(0)))
                                        }}
                                    />
                                </div>
                                <div>
                                    <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Principal — amortização (entra no preço)</div>
                                    <Input
                                        prefix="R$"
                                        placeholder="0,00"
                                        value={compPrincipal}
                                        onChange={(e) => setCompPrincipal(currencyMaskFn(e.target.value))}
                                    />
                                </div>
                            </div>
                            <div style={{ fontSize: 12, color: compSeparacao.divergeDoTotal ? '#DC2626' : '#94a3b8', marginTop: 10 }}>
                                {compSeparacao.divergeDoTotal
                                    ? 'Juros + Principal não fecha com o Valor Total — corrija antes de salvar.'
                                    : compSeparacao.usouValorCheio
                                        ? 'Sem separação, o valor cheio entra como principal e vai inteiro para o preço. Informe os juros para separá-los.'
                                        : 'Os juros vão para Despesa Financeira; o principal entra na base da despesa fixa.'}
                            </div>
                        </div>
                    )}
                    {/*
                      §5 — OS CAMPOS DA GUIA. A competência é SUGERIDA, não imposta: ela vem
                      do vencimento e o usuário a corrige. Um default no banco afirmaria a
                      competência de toda guia antiga (`ausente-vs-falso.md`).
                    */}
                    {ehGuia && (
                        <div style={{ marginBottom: 16, padding: '12px 14px', background: 'rgba(220,38,38,0.06)', borderRadius: 6, border: '1px solid rgba(220,38,38,0.2)' }}>
                            <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 10 }}>
                                Guia de imposto — um tributo por lançamento
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                                <Form.Item name="tax_kind" label="Tributo" style={{ marginBottom: 0 }}>
                                    <Select
                                        placeholder="Selecione o tributo"
                                        showSearch
                                        options={OPCOES_DE_TRIBUTO.map((o) => ({
                                            value: o.value,
                                            label: o.apura ? o.label : `${o.label} — despesa, fora da apuração`,
                                        }))}
                                    />
                                </Form.Item>
                                <Form.Item name="guide_type" label="Tipo" initialValue="principal" style={{ marginBottom: 0 }}>
                                    <Select
                                        options={OPCOES_DE_TIPO_DE_GUIA.map((o) => ({
                                            value: o.value,
                                            label: o.apura ? o.label : `${o.label} — fora da apuração`,
                                        }))}
                                    />
                                </Form.Item>
                                <Form.Item name="competence_month" label="Competência" style={{ marginBottom: 0 }}>
                                    <DatePicker picker="month" format="MM/YYYY" style={{ width: '100%' }} />
                                </Form.Item>
                            </div>
                            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 10 }}>
                                {guiaEntraNaApuracao(tributoDaGuia, tipoDaGuia)
                                    ? 'Esta guia ENTRA no quadro de apuração da competência escolhida.'
                                    : 'Esta guia é DESPESA: ela não entra no quadro de apuração.'}
                            </div>
                        </div>
                    )}
                    {/*
                      §1 — A NOTA. A DATA DE ENTRADA nasce como HOJE e é editável, porque
                      quem recebe a mercadoria lança a nota. É ela que define o mês do
                      crédito; a emissão é só informação, e o vencimento das parcelas manda
                      apenas no caixa.
                    */}
                    {temBlocoDeImposto && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
                            <Form.Item
                                name="entry_date"
                                label={(
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        Data de entrada
                                        <Tooltip title="Quando a mercadoria ou o serviço entrou. É ELA que define o mês do crédito — recebeu 30/08 e lançou 02/09, o crédito é de setembro.">
                                            <InfoCircleOutlined style={{ color: '#64748b' }} />
                                        </Tooltip>
                                    </span>
                                )}
                                initialValue={dayjs()}
                                style={{ marginBottom: 0 }}
                            >
                                <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} allowClear={false} />
                            </Form.Item>
                            <Form.Item
                                name="issue_date"
                                label={(
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        Emissão (opcional)
                                        <Tooltip title="Data de emissão da nota. É informação: ela NÃO define o mês do crédito.">
                                            <InfoCircleOutlined style={{ color: '#64748b' }} />
                                        </Tooltip>
                                    </span>
                                )}
                                style={{ marginBottom: 0 }}
                            >
                                <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} />
                            </Form.Item>
                            <Form.Item name="invoice_number" label="Nº da NF (opcional)" style={{ marginBottom: 0 }}>
                                <Input placeholder="Ex: 12345" />
                            </Form.Item>
                            <Form.Item name="supplier_name" label="Fornecedor (opcional)" style={{ marginBottom: 0 }}>
                                <Input placeholder="Razão social" />
                            </Form.Item>
                        </div>
                    )}
                    {/*
                      §3 — O BLOCO DE IMPOSTOS EM TODA DESPESA.
                      Antes daqui havia CINCO campos de VALOR, e só para as quatro categorias
                      de custo de produto do Lucro Real. Na LC 214/2025 quase toda aquisição
                      para a atividade gera crédito, e um crédito que só existe em
                      matéria-prima infla o custo de todo o resto.

                      O componente é o MESMO do cadastro de item, e a conta também. O que
                      muda é de onde vêm as alíquotas: ali elas têm campo próprio fora do
                      bloco, aqui os cinco entram por dentro — é para isso que existe a
                      costura `extras`.
                    */}
                    {temBlocoDeImposto && (
                        <>
                            {/*
                              §7.2 — A DESTINAÇÃO VIRA LEGENDA, e some do título.
                              Ela NÃO é um degrau da hierarquia — o título de cada bloco
                              agora diz a POSIÇÃO do tributo, que é o que a ordem ensina.
                              Mas ela decide QUAIS linhas creditam (`bandeirasDoLancamento`),
                              e apagá-la de vez deixaria o leitor sem o porquê de uma linha
                              estar marcada e a vizinha não.
                            */}
                            <div style={{ marginBottom: 10, fontSize: 12, color: '#94a3b8' }}>
                                Destinação:{' '}
                                <strong style={{ color: '#cbd5e1' }}>
                                    {naturezaDoLancamento.destinacao === 'INSUMO' ? 'insumo'
                                        : naturezaDoLancamento.destinacao === 'REVENDA' ? 'revenda'
                                        : 'uso e consumo'}
                                </strong>
                            </div>

                            {naturezaDoLancamento.motivo && naturezaDoLancamento.estado === 'VEDADO' && (
                                <div style={{ marginBottom: 12, fontSize: 12, color: '#fca5a5' }}>
                                    {naturezaDoLancamento.motivo}
                                </div>
                            )}

                            {/*
                              §7.3 — A BASE NÃO É CALCULÁVEL: os blocos 2 e 3 ficam em LEITURA
                              e o salvar é bloqueado. Deixá-los editáveis convidaria o usuário
                              a "consertar" digitando mais — e o que falta é conferir o
                              documento.
                            */}
                            {descascamentoDaNota.base == null && (
                                <div style={{ marginBottom: 12, padding: '10px 12px', background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.3)', borderRadius: 6, fontSize: 12, color: '#fca5a5' }}>
                                    As alíquotas informadas somam mais que o total da nota — confira o documento.
                                </div>
                            )}

                            {/*
                              ════ A FORMA COMPACTA — DUAS LINHAS ════

                              §1 do comando de 24/09/2026. O MESMO componente do bloco de
                              matéria-prima, com `tributos` filtrando para CBS e IBS: rótulo,
                              entrada `% | R$` com R$ à frente, leitura e o efeito "crédito".
                              Nenhuma tabela nova, nenhum arquivo copiado — uma segunda tabela
                              aqui divergiria na primeira correção de tooltip
                              (`copia-divergente.md`).

                              Sem degraus: não há redução, saldo, base, ICMS, PIS/COFINS, IPI,
                              fatia nem CST. A base do crédito é o valor total do lançamento,
                              e é o que `creditoSobreOTotal` manda ao motor.
                            */}
                            {formaCompacta && (
                                <>
                                    {/*
                                      §4 — A RESSALVA DA CATEGORIA, com o bloco ABERTO.
                                      Ela não é um `motivo` de sinal trocado: motivo explica
                                      por que não há crédito, e aparece onde o bloco está
                                      ausente ou travado. Isto diz em que condição o crédito
                                      que está sendo oferecido existe.
                                    */}
                                    {naturezaDoLancamento.aviso && (
                                        <div style={{ marginBottom: 12, padding: '10px 12px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 6, fontSize: 12, color: '#fbbf24' }}>
                                            {naturezaDoLancamento.aviso}
                                        </div>
                                    )}

                                    <PurchaseTaxCredits
                                        modo="posicao"
                                        visivel
                                        semDestinacao
                                        semBlocoB
                                        semRodape
                                        semFornecedorDoSimples
                                        titulo="Crédito de IBS/CBS sobre esta despesa"
                                        tributos={['CBS', 'IBS']}
                                        bandeiras={bandeirasDoLancamento}
                                        custo={null}
                                        leitura={leiturasDoCredito}
                                        onToggle={() => { /* a POSIÇÃO é a decisão — não há botão */ }}
                                        onRecalc={() => { /* o cálculo é derivado do `Form.useWatch` */ }}
                                        extras={extrasDosTributos}
                                    />
                                </>
                            )}


                            {!formaCompacta && (
                                <>
                                {/* ════ BLOCO 1A — REDUÇÕES ════ */}
                                <div style={{ marginBottom: 14, padding: '12px 14px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.18)', borderRadius: 8 }}>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: '#fca5a5', marginBottom: 2 }}>
                                        Reduções — não geram crédito
                                    </div>
                                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 10 }}>
                                        Já estão dentro do total da nota. Serão abatidos para achar a base.
                                    </div>
                    {/*
                                      §1 — DUAS LINHAS EXPLÍCITAS, NA ORDEM DO DOCUMENTO.

                                      Linha 1: os dois do PRODUTO, destacados no corpo da nota.
                                      Linha 2: os três da OPERAÇÃO interestadual.

                                      A grade `auto-fit` que estava aqui reagrupava os cinco
                                      campos conforme a largura, e o IS ficava solto abaixo. Ela
                                      não tinha opinião sobre a ordem — e a ordem é a informação.
                                    */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, alignItems: 'flex-end' }}>
                                        {linhaDoBloco1A(1).map((c) => (
                                            <Form.Item key={c.name} name={c.name} label={(
                                                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    {c.label}
                                                    <Tooltip title={c.ajuda}><InfoCircleOutlined style={{ color: '#64748b' }} /></Tooltip>
                                                </span>
                                            )} style={{ marginBottom: 0 }}>
                                                <InputNumber {...INPUT_EM_REAIS} />
                                            </Form.Item>
                                        ))}

                                        {/*
                                          O IS DIVIDE A PRIMEIRA LINHA COM O IPI DE CUSTO.

                                          Ele é do PRODUTO e vem destacado como o IPI, e é entre
                                          os que NÃO GERAM CRÉDITO que o usuário procura por ele.

                                          >>> E MESMO AQUI ELE NÃO REDUZ <<<
                                          `valorIs` continua FORA de `reducoesTotal` em
                                          `nota-de-compra.ts`: saldo e base com IS de R$ 50,00 são
                                          IDÊNTICOS aos com IS zero. O rótulo ao lado diz isso na
                                          tela, porque a POSIÇÃO neste bloco afirmaria o contrário
                                          se ficasse calada.
                                        */}
                                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
                                            <Form.Item
                                                name="valor_is"
                                                label={(
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        IS (Imposto Seletivo)
                                                        <Tooltip title="Não gera crédito, mas a lei manda mantê-lo na base do ICMS, do IBS e da CBS (EC 132/2023, art. 153 §6º V) — por isso ele não é abatido.">
                                                            <InfoCircleOutlined style={{ color: '#64748b' }} />
                                                        </Tooltip>
                                                    </span>
                                                )}
                                                style={{ marginBottom: 0, flex: 1 }}
                                            >
                                                <InputNumber {...INPUT_EM_REAIS} />
                                            </Form.Item>
                                            <span style={{ fontSize: 12, color: '#fbbf24', paddingBottom: 6, whiteSpace: 'nowrap' }}>não reduz</span>
                                        </div>
                                    </div>

                                    <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                                        {linhaDoBloco1A(2).map((c) => (
                                            <Form.Item key={c.name} name={c.name} label={(
                                                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    {c.label}
                                                    <Tooltip title={c.ajuda}><InfoCircleOutlined style={{ color: '#64748b' }} /></Tooltip>
                                                </span>
                                            )} style={{ marginBottom: 0 }}>
                                                <InputNumber {...INPUT_EM_REAIS} />
                                            </Form.Item>
                                        ))}
                                    </div>

                                    {/*
                                      FRETE E SEGURO NO MESMO BLOCO, E MARCADOS COMO NÃO-REDUÇÃO.

                                      Eles estão aqui porque é aqui que o usuário procura "o que
                                      mais veio na nota" — e estão MARCADOS porque a natureza deles
                                      é oposta à das quatro linhas acima: integram a base e geram
                                      crédito (LC 87/1996 art. 13 §1º II; RIPI art. 190 §1º; LC
                                      214/2025 art. 12 §1º). Abatê-los jogaria crédito legítimo
                                      fora, e a aba Créditos passaria a divergir da guia.
                                    */}
                                    <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed rgba(148,163,184,0.25)' }}>
                                        <div style={{ fontSize: 11, color: '#22C55E', marginBottom: 8, fontWeight: 600 }}>
                                            não reduz — integra a base e credita junto
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
                                            <Form.Item name="frete" label="Frete cobrado na nota" style={{ marginBottom: 0 }}>
                                                <InputNumber {...INPUT_EM_REAIS} />
                                            </Form.Item>
                                            <Form.Item name="seguro" label="Seguro cobrado na nota" style={{ marginBottom: 0 }}>
                                                <InputNumber {...INPUT_EM_REAIS} />
                                            </Form.Item>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#94a3b8', marginTop: 10 }}>
                                            <span>Valor das mercadorias</span>
                                            <strong style={{ color: '#e2e8f0' }}>{brl(descascamentoDaNota.valorDasMercadorias)}</strong>
                                        </div>
                                    </div>
                                </div>

                                {/* ════ O SALDO ════ */}
                                <LinhaDeDegrau rotulo="Saldo (base para os demais tributos)" valor={descascamentoDaNota.saldo} />

                                {/*
                                  ════ BLOCO 2 — GERA CRÉDITO, POR FORA ════

                                  >>> DOIS RENDERS DO MESMO COMPONENTE, E NÃO DUAS TABELAS <<<

                                  A hierarquia fiscal separa os por fora dos por dentro: os
                                  primeiros SAEM da base, os segundos incidem SOBRE ela. Numa
                                  tabela só, o usuário lê cinco linhas irmãs e aprende a conta
                                  errada — mesmo com o número certo.

                                  Escrever a segunda tabela aqui seria `copia-divergente.md`
                                  nascendo: acrescentar um tributo, corrigir um tooltip ou mudar a
                                  ajuda da NF-e passaria a exigir duas edições, e a segunda seria
                                  esquecida. Com `tributos`, é o MESMO componente duas vezes.

                                    §2 — O SELETOR POR FORA | POR DENTRO SAIU, e a linha do IPI
                                    ficou idêntica às de CBS e IBS.

                                    >>> NESTE BLOCO A MENÇÃO É A AFIRMAÇÃO <<<
                                    Se o IPI está AQUI com valor, ele gera crédito e é por fora
                                    — é isso que o título do bloco diz, e é isso que a posição
                                    da linha já decidiu. O seletor pedia do usuário uma decisão
                                    que ele acabara de tomar ao digitar naquela linha, e uma
                                    segunda pergunta sobre um fato já afirmado é onde as duas
                                    respostas divergem.

                                    CONSEQUÊNCIA, declarada: o caso "IPI por dentro" deixa de
                                    ser informável pela tela, e `ipi_por_dentro` deixa de ser
                                    gravado. A coluna PERMANECE no banco e `descascarANota`
                                    MANTÉM o parâmetro — o caso do #74 que afirma "por fora →
                                    base 1.000,00; por dentro → base 1.060,00" continua verde
                                    sem edição. A regra não se perdeu; ela saiu da tela.
                                */}
                                <PurchaseTaxCredits
                                    modo="posicao"
                                    visivel
                                    semDestinacao
                                    semBlocoB
                                    semRodape
                                    titulo="Gera crédito — por fora"
                                    tributos={['IPI', 'CBS', 'IBS']}
                                    bandeiras={bandeirasDoLancamento}
                                    custo={null}
                                    onToggle={() => { /* a POSIÇÃO é a decisão — não há botão */ }}
                                    onRecalc={() => { /* o cálculo é derivado do `Form.useWatch` */ }}
                                    semFornecedorDoSimples
                                    leitura={leiturasDoCredito}
                                    extras={extrasDosTributos}
                                />

                                {/* ════ A BASE — separador, não linha de lista ════ */}
                                <LinhaDeDegrau
                                    rotulo="Base dos produtos (vProd)"
                                    valor={descascamentoDaNota.base}
                                    apoio="A operação por dentro incide sobre esta base."
                                />

                                {/*
                                  ════ BLOCO 3 — GERA CRÉDITO, POR DENTRO — TRÊS LINHAS ════

                                  §3 do comando de 24/09/2026. Eram SEIS controles para DOIS
                                  tributos: duas entradas, duas fatias e duas bases manuais.

                                  >>> AS FATIAS SAÍRAM DA TELA, E A RAZÃO É QUE ELAS DUPLICAM <<<
                                  "Parcela em ST" e "parcela monofásica" fazem o MESMO trabalho
                                  que a base manual, pelo lado negativo — e dois controles para o
                                  mesmo fato é onde o usuário erra: ele informa a fatia E a base,
                                  e o desconto acontece duas vezes. Fica a base manual, que é a
                                  que ele consegue conferir contra o documento.

                                  É decisão de TELA, não de motor: `descascarANota` mantém o
                                  parâmetro `fatias`, e os casos F e G do #74 continuam verdes sem
                                  edição — a regra não se perdeu, só saiu daqui. As colunas
                                  `parcela_st` e `parcela_monofasica` permanecem no banco.

                                  O ICMS é campo em R$ e mais nada: ele vem SEMPRE destacado na
                                  nota, e é esse número que o usuário copia. O PIS/COFINS é o
                                  oposto — a alíquota é que se conhece, e a base sai sozinha do
                                  descascamento e é exibida na própria linha.
                                */}
                                <PurchaseTaxCredits
                                    modo="posicao"
                                    visivel
                                    semDestinacao
                                    semBlocoB
                                    semRodape
                                    titulo="Gera crédito — por dentro"
                                    tributos={['ICMS', 'PIS_COFINS']}
                                    bandeiras={bandeirasDoLancamento}
                                    custo={null}
                                    semFornecedorDoSimples
                                    leitura={leiturasDoCredito}
                                    onToggle={() => { /* a POSIÇÃO é a decisão — não há botão */ }}
                                    onRecalc={() => { /* o cálculo é derivado do `Form.useWatch` */ }}
                                    depoisDasLinhas={<LinhaDaBaseManual
                                        ligado={usarBaseManualPisCofins === true}
                                        baseEfetiva={descascamentoDaNota.basesPorDentro.pisCofins}
                                        formatoDaAliquota={formatoDeEntrada.PIS_COFINS ?? FORMATO_DA_LINHA.PIS_COFINS}
                                        onFormato={(f) => setFormatoDeEntrada((prev) => ({ ...prev, PIS_COFINS: f }))}
                                        desabilitado={descascamentoDaNota.base == null}
                                    />}
                                    blocoDeCusto={(
                                        <Collapse
                                            ghost
                                            size="small"
                                            items={[{
                                                key: 'cst',
                                                label: <span style={{ fontSize: 12, color: '#94a3b8' }}>CST do documento (opcional)</span>,
                                                children: (
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                                                        <Form.Item name="cst_icms" label="CST ICMS" style={{ marginBottom: 0 }}>
                                                            <Input placeholder="ex: 00" maxLength={3} />
                                                        </Form.Item>
                                                        <Form.Item name="cst_ipi" label="CST IPI" style={{ marginBottom: 0 }}>
                                                            <Input placeholder="ex: 00" maxLength={3} />
                                                        </Form.Item>
                                                        <Form.Item name="cst_pis_cofins" label="CST PIS/COFINS" style={{ marginBottom: 0 }}>
                                                            <Input placeholder="ex: 01" maxLength={3} />
                                                        </Form.Item>
                                                    </div>
                                                ),
                                            }]}
                                        />
                                    )}
                                    extras={extrasDosTributos}
                                />

                                </>
                            )}


                            {/*
                              §1 — O LINK DO CASO RARO.

                              Ele REVELA campos, e não muda nada do que já foi digitado: o que
                              for preenchido na escada grava pelo mesmo caminho de sempre. Não
                              há volta porque voltar esconderia um campo COM VALOR, e um valor
                              escondido que continua na conta é o pior dos dois mundos.
                            */}
                            {formaCompacta && (
                                <div style={{ marginTop: 10 }}>
                                    <a
                                        onClick={(ev) => { ev.preventDefault(); setRevelarEscadaCompleta(true) }}
                                        style={{ fontSize: 12, color: '#64748b', textDecoration: 'underline' }}
                                    >
                                        esta nota tem outros tributos
                                    </a>
                                </div>
                            )}


                            {/* ════ RODAPÉ — crédito total e custo líquido ════ */}
                            <div style={{ marginTop: 14, padding: '12px 14px', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8, display: 'grid', gap: 6 }}>
                                {/*
                                  O VALOR TOTAL APARECE NO RODAPÉ DA FORMA COMPACTA.
                                  Na escada ele é o topo de uma sequência que o leitor
                                  percorreu; aqui não há sequência, e "crédito de 265" sem o
                                  número de que ele saiu não dá para conferir.
                                */}
                                {formaCompacta && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                                        <span style={{ color: '#94a3b8' }}>Valor total</span>
                                        <span>{brl(totalDoLancamento)}</span>
                                    </div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                                    <span style={{ color: '#94a3b8' }}>Crédito total</span>
                                    <strong style={{ color: '#22C55E' }}>{brl(descascamentoDaNota.creditoTotal)}</strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, paddingTop: 6, borderTop: '1px solid rgba(148,163,184,0.2)' }}>
                                    <strong>CUSTO LÍQUIDO</strong>
                                    <strong style={{ color: '#22C55E' }}>{brl(descascamentoDaNota.custoLiquido)}</strong>
                                </div>
                                <div style={{ fontSize: 11, color: '#64748b' }}>
                                    Total da nota menos o crédito. O que não gera crédito permanece no custo.
                                </div>
                            </div>
                        </>
                    )}
                </Form>
            </Drawer>

            {/* Modal: Registrar / Confirmar Pagamento ou Recebimento */}
            <Modal
                title={
                    paymentEntry?.type === 'INCOME'
                        ? (paymentEntry?.paid_date ? 'Editar Recebimento Confirmado' : 'Confirmar Recebimento')
                        : (paymentEntry?.paid_date ? 'Editar Pagamento Registrado' : 'Registrar Pagamento de Despesa')
                }
                open={paymentModalOpen}
                onCancel={() => setPaymentModalOpen(false)}
                footer={null}
                width={620}
            >
                {paymentEntry && (
                    <div>
                        <div style={{ marginBottom: 16, padding: 14, background: paymentEntry.paid_date ? 'rgba(255,255,255,0.05)' : (paymentEntry.type === 'INCOME' ? 'rgba(251,191,36,0.08)' : 'rgba(240,68,56,0.08)'), border: `1px solid ${paymentEntry.paid_date ? 'rgba(255,255,255,0.15)' : (paymentEntry.type === 'INCOME' ? 'rgba(251,191,36,0.3)' : 'rgba(240,68,56,0.2)')}`, borderRadius: 8 }}>
                            {/* Client and employee info */}
                            {(() => {
                                const clientName = (paymentEntry.customer_id && customerMap[paymentEntry.customer_id]) || (paymentEntry.contact_id && customerMap[paymentEntry.contact_id]) || null
                                const empName = paymentEntry.employee_id ? employees.find((e: any) => e.id === paymentEntry.employee_id)?.name : null
                                if (!clientName && !empName) return null
                                return (
                                    <div style={{ marginBottom: 8, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                                        {clientName && <span style={{ fontSize: 12, color: '#94a3b8' }}>👤 Cliente: <strong style={{ color: '#e2e8f0' }}>{clientName}</strong></span>}
                                        {empName && <span style={{ fontSize: 12, color: '#94a3b8' }}>🧑‍💼 Vendedor: <strong style={{ color: '#e2e8f0' }}>{empName}</strong></span>}
                                    </div>
                                )
                            })()}
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                                <div style={{ fontWeight: 600, fontSize: 15, flex: 1 }}>{paymentEntry.description?.split(' — ')[0]?.split('|')[0]?.replace(/^Serviço:\s*/i, '').replace(/^Venda balcão:\s*/i, '').trim() || paymentEntry.description}</div>
                                {paymentEntry.expense_group && (
                                    <Tag style={{ flexShrink: 0, background: getExpenseGroupColor(paymentEntry.expense_group) + '33', color: getExpenseGroupColor(paymentEntry.expense_group), border: `1px solid ${getExpenseGroupColor(paymentEntry.expense_group)}66`, fontSize: 11 }}>
                                        {getExpenseGroupLabel(paymentEntry.expense_group)}
                                    </Tag>
                                )}
                            </div>
                            {(() => {
                                const desc = paymentEntry.description || ''
                                const segments = desc.split('|').map((s: string) => s.trim()).filter(Boolean)
                                const infoSegments = segments.slice(1) // skip first (service/product name)
                                const afterDash = desc.includes(' — ') ? desc.split(' — ').slice(1).join(' — ') : ''
                                const parsed: { label: string; value: string }[] = []
                                for (const seg of infoSegments) {
                                    const colonIdx = seg.indexOf(':')
                                    if (colonIdx > -1) {
                                        parsed.push({ label: seg.slice(0, colonIdx).trim(), value: seg.slice(colonIdx + 1).trim() })
                                    } else if (seg) {
                                        parsed.push({ label: '', value: seg })
                                    }
                                }
                                if (afterDash && !infoSegments.length) {
                                    parsed.push({ label: '', value: afterDash })
                                }
                                if (!parsed.length) return null
                                return (
                                    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                        {parsed.map((p, i) => (
                                            <div key={i} style={{ fontSize: 12, color: '#94a3b8' }}>
                                                {p.label ? <><span style={{ color: '#64748b' }}>{p.label}:</span> {p.value}</> : p.value}
                                            </div>
                                        ))}
                                    </div>
                                )
                            })()}
                            <div style={{ marginTop: 8 }}>
                                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Valor</div>
                                <InputNumber
                                    value={paymentAmount}
                                    onChange={(v) => setPaymentAmount(Number(v) || 0)}
                                    min={0}
                                    precision={2}
                                    decimalSeparator=","
                                    formatter={brlFormatter as any}
                                    parser={brlParser as any}
                                    prefix={paymentEntry.type === 'INCOME' ? '+R$' : '-R$'}
                                    style={{ width: '100%', fontWeight: 700, fontSize: 16 }}
                                />
                            </div>
                            {/* Due date: editable for all entry types */}
                            <div style={{ marginTop: 8 }}>
                                <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Data de vencimento (altere para salvar nova data)</div>
                                <DatePicker
                                    value={paymentDueDate}
                                    onChange={(d) => setPaymentDueDate(d)}
                                    format="DD/MM/YYYY"
                                    style={{ width: '100%' }}
                                    placeholder="Data de vencimento"
                                />
                            </div>
                            {paymentEntry.paid_date && (
                                <div style={{ color: '#4ade80', fontSize: 12, marginTop: 2, fontWeight: 500 }}>
                                    ✓ {paymentEntry.type === 'INCOME' ? 'Recebido em' : 'Pago em'}: {dayjs(paymentEntry.paid_date + 'T00:00:00').format('DD/MM/YYYY')}
                                    {paymentEntry.payment_method ? ` — ${paymentEntry.payment_method}` : ''}
                                </div>
                            )}
                        </div>
                        <div style={{ marginBottom: 16 }}>
                            <div style={{ fontWeight: 500, marginBottom: 6 }}>{paymentEntry.type === 'INCOME' ? 'Data de Recebimento' : 'Data de Pagamento'}</div>
                            <DatePicker
                                value={paymentDate}
                                onChange={(d) => setPaymentDate(d)}
                                format="DD/MM/YYYY"
                                style={{ width: '100%' }}
                                placeholder={paymentEntry.type === 'INCOME' ? 'Selecione a data de recebimento' : 'Selecione a data de pagamento'}
                            />
                        </div>
                        <div style={{ marginBottom: 24 }}>
                            <div style={{ fontWeight: 500, marginBottom: 6 }}>Método de Pagamento</div>
                            <Select
                                value={paymentMethodModal || undefined}
                                onChange={(v) => setPaymentMethodModal(v || '')}
                                allowClear
                                placeholder="Selecione o método (opcional)"
                                options={EXPENSE_PAYMENT_METHODS}
                                style={{ width: '100%' }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            {/* O botão "Excluir" saiu daqui. Excluir um lançamento de venda pelo
                                Fluxo de Caixa desfazia o efeito financeiro e deixava a VENDA
                                intacta — o caixa e o relatório passavam a discordar sobre o mesmo
                                fato. A exclusão passa a existir SÓ em Comercial > Vendas, onde ela
                                trata a cadeia inteira: caixa, estoque, pedido e orçamento.
                                A rota `/api/delete/cash-entries` CONTINUA existindo e em uso por
                                QUATRO call sites: Agenda, Controle Financeiro (×2) e Relatórios.
                                Eram cinco no levantamento, e o quinto era este handler — ou seja
                                a tela do Fluxo de Caixa deixa de chamá-la por completo. A rota
                                fica pelos outros quatro; o que saiu foi o botão e o handler dele. */}
                            {/* EXCLUIR A VENDA — só quando o lançamento VEIO de uma venda.
                                Em lançamento MANUAL não há venda a excluir, e um botão que não
                                tem o que fazer é pior que botão ausente: ele afirma que a ação
                                existe ali. `.claude/rules/ausente-vs-falso.md`.
                                O Popconfirm é o mesmo nos dois tamanhos de tela — esta página
                                não tem cartão mobile, então a assimetria que o #56 achou em
                                Clientes não se aplica aqui; há um ponto só, e ele pergunta. */}
                            {paymentEntry.origin_type === 'SALE' && paymentEntry.origin_id && (
                                <Popconfirm
                                    title="Excluir a venda inteira?"
                                    description={
                                        <div style={{ maxWidth: 340 }}>
                                            <p style={{ marginBottom: 6 }}>É a MESMA exclusão da tela de Vendas. Serão removidos:</p>
                                            <ul style={{ paddingLeft: 18, marginBottom: 6 }}>
                                                <li>a venda e seus itens;</li>
                                                <li>todos os lançamentos dela no caixa, inclusive as parcelas pendentes;</li>
                                                <li>a comissão do vendedor e o RT;</li>
                                                <li>o pedido e o orçamento de origem, quando houver.</li>
                                            </ul>
                                            <p style={{ marginBottom: 0 }}>Os produtos voltam ao estoque.</p>
                                            <p style={{ marginTop: 6, marginBottom: 0, color: '#dc2626', fontWeight: 600 }}>
                                                Irreversível. Venda com pagamento registrado é bloqueada.
                                            </p>
                                        </div>
                                    }
                                    onConfirm={handleExcluirVendaDoLancamento}
                                    okText="Sim, excluir a venda"
                                    cancelText="Voltar"
                                    okButtonProps={{ danger: true }}
                                >
                                    <Tooltip title="Exclui a venda de origem e toda a cadeia. Venda com pagamento registrado não pode ser excluída.">
                                        <Button danger loading={excluindoVenda}>Excluir venda</Button>
                                    </Tooltip>
                                </Popconfirm>
                            )}
                            {/*
                              §6.1 — EXCLUIR, e SÓ quando não vem de venda.
                              Lançamento de venda continua exclusivamente com "Excluir venda":
                              caixa e venda não podem discordar sobre o mesmo fato, e a
                              decisão registrada acima permanece de pé.
                            */}
                            {paymentEntry.origin_type !== 'SALE' && (
                                <Popconfirm
                                    title={vinculoDaSerie(paymentEntry) === 'SOZINHO' ? 'Excluir este lançamento?' : 'Excluir a série inteira?'}
                                    description={(
                                        <div style={{ maxWidth: 380 }}>
                                            {vinculoDaSerie(paymentEntry) === 'SOZINHO' ? (
                                                <p style={{ marginBottom: 6 }}>{AVISO_SEM_VINCULO}</p>
                                            ) : (
                                                <p style={{ marginBottom: 6 }}>
                                                    Todas as parcelas {vinculoDaSerie(paymentEntry) === 'NOTA' ? 'desta nota' : 'deste lançamento'} serão
                                                    excluídas juntas. Nenhuma pode estar paga.
                                                </p>
                                            )}
                                            {/*
                                              AS PAGAS, com data e valor — elas só aparecem DEPOIS do
                                              veto, porque é o servidor que as descobre. Listá-las antes
                                              exigiria montar a série aqui, que é o que o §6.5 proíbe.
                                            */}
                                            {pagasDaSerie.length > 0 && (
                                                <div style={{ marginTop: 6, padding: 8, background: 'rgba(220,38,38,0.08)', borderRadius: 6 }}>
                                                    <div style={{ fontWeight: 600, color: '#fca5a5', marginBottom: 4 }}>
                                                        Parcelas pagas — a série não pode ser excluída:
                                                    </div>
                                                    {pagasDaSerie.map((p) => (
                                                        <div key={p.id} style={{ fontSize: 12 }}>
                                                            {dayjs(p.due_date).format('DD/MM/YYYY')} — {brl(p.amount)}
                                                        </div>
                                                    ))}
                                                    <div style={{ fontSize: 12, marginTop: 6 }}>
                                                        Use <strong>Excluir só este vencimento</strong> no pendente, ou <strong>Estornar</strong> em cada paga.
                                                    </div>
                                                </div>
                                            )}
                                            <p style={{ marginTop: 8, marginBottom: 0, fontSize: 12, color: '#94a3b8' }}>
                                                A exclusão é por desativação: o histórico não é apagado.
                                            </p>
                                        </div>
                                    )}
                                    onConfirm={() => void excluirLancamento('SERIE')}
                                    onCancel={() => { if (pagasDaSerie.length > 0 && !paymentEntry.paid_date) void excluirLancamento('SO_ESTE') }}
                                    okText={vinculoDaSerie(paymentEntry) === 'SOZINHO' ? 'Excluir' : 'Excluir a série'}
                                    cancelText={pagasDaSerie.length > 0 && !paymentEntry.paid_date ? 'Excluir só este vencimento' : 'Voltar'}
                                    okButtonProps={{ danger: true }}
                                >
                                    <Button danger loading={excluindoSerie}>Excluir</Button>
                                </Popconfirm>
                            )}
                            {/*
                              §6.6 — ESTORNAR é diferente de CANCELAR PAGAMENTO, e os textos
                              dizem isso: cancelar é "nunca ocorreu"; estornar é "ocorreu e foi
                              desfeito". O estorno NÃO limpa `paid_date`.
                            */}
                            {paymentEntry.paid_date && paymentEntry.origin_type !== 'SALE' && !paymentEntry.reversed_at && (
                                <Popconfirm
                                    title="Estornar este pagamento?"
                                    description={(
                                        <div style={{ maxWidth: 380 }}>
                                            <p style={{ marginBottom: 6 }}>
                                                O pagamento OCORREU e está sendo desfeito — devolução, nota cancelada, chargeback.
                                                Um lançamento espelho será criado na data do estorno.
                                            </p>
                                            <p style={{ marginBottom: 6, fontSize: 12, color: '#94a3b8' }}>
                                                O pagamento original continua registrado. Se ele nunca ocorreu, use
                                                <strong> Cancelar Pagamento</strong> em vez disto.
                                            </p>
                                            <div style={{ marginTop: 8 }}>
                                                <span style={{ fontSize: 12, color: '#94a3b8', marginRight: 8 }}>Data do estorno</span>
                                                <DatePicker
                                                    size="small" format="DD/MM/YYYY" allowClear={false}
                                                    value={dataDoEstorno}
                                                    onChange={(d) => setDataDoEstorno(d ?? dayjs())}
                                                />
                                            </div>
                                            <p style={{ marginTop: 8, marginBottom: 0, fontSize: 12, color: '#fca5a5' }}>
                                                Estorno não tem desfazer. Estornar um estorno é lançar de novo.
                                            </p>
                                        </div>
                                    )}
                                    onConfirm={() => void estornarLancamento()}
                                    okText="Estornar"
                                    cancelText="Voltar"
                                    okButtonProps={{ danger: true }}
                                >
                                    <Button danger loading={estornando}>Estornar</Button>
                                </Popconfirm>
                            )}
                            {paymentEntry.paid_date && (
                                <Popconfirm
                                    title={paymentEntry.type === 'INCOME' ? 'Desfazer confirmação?' : 'Cancelar pagamento?'}
                                    description={paymentEntry.type === 'INCOME' ? 'O valor voltará para pendente de recebimento (amarelo).' : 'A despesa voltará a aparecer como não paga (vermelha).'}
                                    onConfirm={handleCancelPayment}
                                    okText={paymentEntry.type === 'INCOME' ? 'Desfazer' : 'Cancelar pagamento'}
                                    cancelText="Não"
                                    okButtonProps={{ danger: true }}
                                >
                                    <Button loading={savingPayment}>{paymentEntry.type === 'INCOME' ? 'Desfazer Confirmação' : 'Cancelar Pagamento'}</Button>
                                </Popconfirm>
                            )}
                            {/* Save due date button — appears whenever date is changed, for any entry type */}
                            {paymentDueDate && paymentDueDate.format('YYYY-MM-DD') !== paymentEntry.due_date && (
                                <Button
                                    loading={savingPayment}
                                    onClick={async () => {
                                        if (!paymentEntry || !paymentDueDate) return
                                        setSavingPayment(true)
                                        try {
                                            const tenant_id = await getTenantId()
                                            const { error } = await (supabase as any).from('cash_entries').update({
                                                due_date: paymentDueDate.format('YYYY-MM-DD'),
                                            }).eq('id', paymentEntry.id).eq('tenant_id', tenant_id)
                                            if (error) throw error
                                            messageApi.success('Data de vencimento salva!')
                                            setPaymentModalOpen(false)
                                            await fetchData()
                                        } catch (err: any) {
                                            messageApi.error('Erro ao salvar data: ' + (err?.message || ''))
                                        } finally {
                                            setSavingPayment(false)
                                        }
                                    }}
                                >
                                    Salvar Data
                                </Button>
                            )}
                            <Button onClick={() => setPaymentModalOpen(false)}>Fechar</Button>
                            <Button type="primary" loading={savingPayment} onClick={handleRegisterPayment}>
                                {paymentEntry.paid_date ? 'Salvar Edição' : (paymentEntry.type === 'INCOME' ? 'Confirmar Recebimento' : 'Registrar Pagamento')}
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>

            {/* Modal: Selecionar lançamento pendente (múltiplos no mesmo dia) */}
            <Modal
                title="Selecionar lançamento para confirmar"
                open={pendingSelectOpen}
                onCancel={() => setPendingSelectOpen(false)}
                footer={<Button onClick={() => setPendingSelectOpen(false)}>Fechar</Button>}
                width="min(600px, calc(100vw - 32px))"
            >
                <div style={{ marginBottom: 12, color: '#94a3b8', fontSize: 13 }}>
                    Há {pendingSelectEntries.length} lançamentos pendentes neste dia. Selecione qual deseja confirmar:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {pendingSelectEntries.map((entry: any, idx: number) => {
                        const clientName = (entry.customer_id && customerMap[entry.customer_id]) || (entry.contact_id && customerMap[entry.contact_id]) || null
                        const empName = entry.employee_id ? employees.find((e: any) => e.id === entry.employee_id)?.name : null
                        const cleanDesc = entry.description?.split('|')[0]?.replace(/^Serviço:\s*/i,'').replace(/^Venda balcão:\s*/i,'').replace(/^Venda orçamento:\s*/i,'').split('—')[0]?.trim() || entry.description || '—'
                        return (
                            <div
                                key={entry.id || idx}
                                onClick={() => { setPendingSelectOpen(false); handleOpenPaymentModal(entry) }}
                                style={{ padding: '10px 14px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 8, cursor: 'pointer' }}
                            >
                                <div style={{ fontWeight: 600, color: '#fbbf24', fontSize: 14, marginBottom: 4 }}>
                                    {formatCurrency(Number(entry.amount) || 0)}
                                </div>
                                <div style={{ fontSize: 12, color: '#e2e8f0' }}>{cleanDesc}</div>
                                {clientName && <div style={{ fontSize: 11, color: '#94a3b8' }}>Cliente: {clientName}</div>}
                                {empName && <div style={{ fontSize: 11, color: '#94a3b8' }}>Vendedor: {empName}</div>}
                                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                                    Venc: {entry.due_date ? entry.due_date.substring(8,10)+'/'+entry.due_date.substring(5,7)+'/'+entry.due_date.substring(0,4) : '—'}
                                    {entry.payment_method ? ` • ${entry.payment_method}` : ''}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </Modal>

            {/* Modal: Selecionar lançamento de despesa (múltiplos no mesmo dia) */}
            <Modal
                title="Selecionar despesa para confirmar"
                open={expenseSelectOpen}
                onCancel={() => setExpenseSelectOpen(false)}
                footer={<Button onClick={() => setExpenseSelectOpen(false)}>Fechar</Button>}
                width="min(600px, calc(100vw - 32px))"
            >
                <div style={{ marginBottom: 12, color: '#94a3b8', fontSize: 13 }}>
                    Há {expenseSelectEntries.length} lançamentos neste dia. Selecione qual deseja confirmar:
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {expenseSelectEntries.map((entry: any, idx: number) => {
                        const cleanDesc = entry.description?.split('|')[0]?.trim() || entry.description || '—'
                        const isPaid = entry.paid === true || entry.status === 'paid'
                        return (
                            <div
                                key={entry.id || idx}
                                onClick={() => { setExpenseSelectOpen(false); handleOpenPaymentModal(entry) }}
                                style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.08)', border: `1px solid ${isPaid ? 'rgba(100,116,139,0.3)' : 'rgba(239,68,68,0.3)'}`, borderRadius: 8, cursor: 'pointer' }}
                            >
                                <div style={{ fontWeight: 600, color: isPaid ? '#94a3b8' : '#f87171', fontSize: 14, marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    {formatCurrency(Number(entry.amount) || 0)}
                                    {isPaid && <span style={{ fontSize: 11, background: '#1e293b', color: '#64748b', borderRadius: 4, padding: '1px 6px' }}>Pago</span>}
                                </div>
                                <div style={{ fontSize: 12, color: '#e2e8f0' }}>{cleanDesc}</div>
                                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                                    Venc: {entry.due_date ? entry.due_date.substring(8,10)+'/'+entry.due_date.substring(5,7)+'/'+entry.due_date.substring(0,4) : '—'}
                                    {entry.payment_method ? ` • ${entry.payment_method}` : ''}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </Modal>

            {/* Modal: Saldo do Mês Anterior */}
            <Modal
                title="Saldo do Mês Anterior"
                open={prevBalanceModalOpen}
                onCancel={() => setPrevBalanceModalOpen(false)}
                onOk={handleSavePrevBalance}
                confirmLoading={loadingPrevBalance}
                okText="Salvar"
                cancelText="Cancelar"
            >
                <div style={{ marginBottom: 12, color: '#94a3b8', fontSize: 13 }}>
                    Informe o saldo do mês anterior. Escolha o sinal (positivo/negativo) e digite o valor.
                    <br />Mês atual: <strong>{month.format('MMMM/YYYY')}</strong>
                </div>
                {/* Item 10/11 (Relatório 24/07): campo segue a máscara monetária padrão
                    do sistema (CurrencyInput). Como a máscara não digita "−", o sinal fica
                    num seletor dedicado, preservando o suporte a saldo negativo. */}
                <Radio.Group
                    value={prevBalanceNegative ? 'neg' : 'pos'}
                    onChange={(e) => setPrevBalanceNegative(e.target.value === 'neg')}
                    style={{ marginBottom: 8 }}
                >
                    <Radio.Button value="pos">Positivo (+)</Radio.Button>
                    <Radio.Button value="neg">Negativo (−)</Radio.Button>
                </Radio.Group>
                <CurrencyInput
                    style={{ width: '100%' }}
                    size="large"
                    value={prevBalanceInput}
                    onChange={(v) => setPrevBalanceInput(Math.abs(Number(v) || 0))}
                    placeholder="Ex: 5.000,00"
                />
                {prevBalanceInput !== 0 && (
                    <div style={{ marginTop: 8, fontSize: 13, color: prevBalanceNegative ? '#f87171' : '#4ade80' }}>
                        {prevBalanceNegative ? '⚠️ Saldo negativo' : '✅ Saldo positivo'}: {formatCurrency(Math.abs(prevBalanceInput))}
                    </div>
                )}
            </Modal>

            {/* Export range modal */}
            <Modal
                title="Exportar Fluxo de Caixa"
                open={exportModalOpen}
                onCancel={() => setExportModalOpen(false)}
                onOk={handleExportMultiMonth}
                confirmLoading={exporting}
                okText="Exportar"
                cancelText="Cancelar"
                okButtonProps={{ style: { background: '#217346', borderColor: '#217346' } }}
            >
                <div style={{ marginBottom: 16 }}>
                    <p style={{ marginBottom: 12, color: '#94a3b8' }}>
                        Selecione o período que deseja exportar. Cada mês será uma aba no Excel.
                    </p>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, marginBottom: 4, color: '#94a3b8' }}>Mês inicial</div>
                            <DatePicker
                                picker="month"
                                value={exportRange[0]}
                                onChange={(v) => {
                                    if (v) {
                                        setExportRange(prev => [v, prev[1].isBefore(v) ? v : prev[1]])
                                    }
                                }}
                                style={{ width: '100%' }}
                                format="MMMM/YYYY"
                            />
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, marginBottom: 4, color: '#94a3b8' }}>Mês final</div>
                            <DatePicker
                                picker="month"
                                value={exportRange[1]}
                                onChange={(v) => {
                                    if (v) {
                                        setExportRange(prev => [prev[0], v.isBefore(prev[0]) ? prev[0] : v])
                                    }
                                }}
                                style={{ width: '100%' }}
                                format="MMMM/YYYY"
                            />
                        </div>
                    </div>
                    {exportRange[0] && exportRange[1] && (
                        <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(33, 115, 70, 0.1)', borderRadius: 6, fontSize: 13 }}>
                            {(() => {
                                const diff = exportRange[1].diff(exportRange[0], 'month') + 1
                                return `${diff} ${diff === 1 ? 'mês selecionado (1 aba)' : `meses selecionados (${diff} abas)`}`
                            })()}
                        </div>
                    )}
                </div>
            </Modal>

            {/* Export format modal — Cash Flow */}
            <ExportFormatModal
                open={exportFormatModalOpen}
                onClose={() => setExportFormatModalOpen(false)}
                title="Exportar Controle Financeiro"
                skipDateRange
                onExportExcel={() => {
                    setExportRange([month.startOf('month'), month.startOf('month')])
                    setExportModalOpen(true)
                }}
                onExportPdf={handleExportCashFlowPdf}
            />

        </Layout>
    )
}
