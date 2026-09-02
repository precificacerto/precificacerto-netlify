/**
 * useTenantTaxContext — Hook unificado MRM-V3 (Stories S1 + S3 + S5)
 *
 * Carrega TUDO que o `hydrateItemSnapshot` e `decideMrmAction` precisam:
 *   - regime tributário real do tenant (`tenants.tax_regime` via
 *     `tenant_settings.tax_regime`) — S1
 *   - csll_pct / irpj_pct sincronizados com a Formação de Preço — S3
 *     (extraídos de `extractEffectiveTaxComponents` em `tax-sync.ts`)
 *   - rro_policy do tenant — S5
 *   - rates vigentes (opcional) via mrm-rates-loader — S2
 *
 * Atende à Seção 7 do PDF (Sincronização): IRPJ/CSLL no motor RR DEVEM ser
 * os mesmos calculados na Formação de Preço — esta é a única ponte oficial.
 *
 * ADR-006: single source of truth para componentes tributários.
 * ADR-007: precedência csll/irpj = `tax-sync.ts` > `tenant_settings` > defaults.
 */

import useSWR from 'swr'
import { supabase } from '@/supabase/client'
import { useAuth } from './use-auth.hook'
import { isMrmEnabled } from '@/utils/mrm-feature-flag'
import { loadTenantTaxComponents, type TaxComponents } from '@/utils/tax-sync'
import { loadTaxRates } from '@/utils/mrm-rates-loader'
import { resolveMonthlyWorkload } from '@/utils/resolve-monthly-workload'
import type { RroPolicy } from '@/utils/mrm-policies'
import type { TaxRatePeriod, TaxRegime } from '@/types/mrm'

export interface TenantTaxContext {
  /** Feature flag MRM resolvida (env + tenant override). */
  enabled: boolean
  /** Snapshot mode (D2). Default TRUE (Q3). */
  useSnapshotRates: boolean
  /** Regime tributário real do tenant. Fallback SIMPLES_NACIONAL se NULL. */
  regime: TaxRegime
  /** % CSLL efetivo (decimal). Sincronizado com Formação de Preço (Seção 7). */
  csll_pct: number
  /** % IRPJ efetivo (decimal). Sincronizado com Formação de Preço (Seção 7). */
  irpj_pct: number
  /**
   * % DOP (Despesas Operacionais) em decimal — Sprint S8 do EPIC-RR-DISPLAY.
   * Soma: fixed_expense_percent + variable_expense_percent + financial_expense_percent +
   *       indirect_labor_percent (ou admin_labor_percent).
   * Usado pelo motor RR como dop_item = item_subtotal × dop_pct.
   */
  dop_pct: number
  /**
   * % MOD (Mão de Obra Direta) em decimal — Sprint S8 do EPIC-RR-DISPLAY.
   * Vem de production_labor_percent. Usado como mod_item = item_subtotal × mod_pct.
   */
  mod_pct: number
  /**
   * Breakdown dos 4 buckets de DOP — Sprint S14 do EPIC-RR-V2.
   * Usado pela DRE consolidada para exibir despesas operacionais separadas
   * (fixas / variáveis / financeiras / administrativas).
   * Todos em decimal. Soma = dop_pct.
   */
  expense_breakdown: {
    fixed_pct: number
    variable_pct: number
    financial_pct: number
    administrative_pct: number
  }
  /**
   * MO Produtiva do tenant em decimal (`production_labor_percent`). Mesmo número de
   * `mod_pct`, com nome próprio porque o uso é outro: em segmentação REVENDA ela é agrupada
   * com a MO Indireta na margem de contribuição. Ver `indirect-labor-grouping.ts`.
   */
  mo_produtiva_pct: number
  /**
   * Segmentação do tenant (`tenant_settings.calc_type`): INDUSTRIALIZACAO | REVENDA | SERVICO.
   *
   * Não decide o destino das categorias de despesa na cascata — isso é propriedade da
   * construção de CADA ITEM. É lido só para a exceção declarada do produto de revenda em
   * tenant SERVIÇO. Ver `expense-destination.ts`.
   */
  calc_type: string | null
  /** Override de policy (strict/permissive). NULL = defaults ADR-004. */
  rro_policy: RroPolicy | null
  /** Componentes tributários completos (para diagnóstico/UI). */
  components: TaxComponents | null
  /** Alíquotas vigentes para a data corrente (carregadas se loadRates=true). */
  rates: TaxRatePeriod[]
  /**
   * V8.7 (ADR-011): contexto para calcular MO produtiva em RUNTIME quando
   * pricing_calculations.product_workload_price está vazio.
   *
   * Fórmula preferencial (DIRETA):
   *   MOD = product_workload × productive_value_per_minute
   *
   * Fórmula fallback (quando productive_value_per_minute = 0):
   *   MOD = product_workload × (production_labor_cost / monthly_workload_minutes)
   */
  production_labor_cost: number
  monthly_workload_minutes: number
  productive_value_per_minute: number // V8.7 — valor por minuto já calculado no banco
  /** Flag de carregamento. */
  loading: boolean
}

const DEFAULT_CONTEXT: TenantTaxContext = {
  enabled: false,
  useSnapshotRates: true,
  regime: 'SIMPLES_NACIONAL',
  csll_pct: 0,
  irpj_pct: 0,
  dop_pct: 0,
  mod_pct: 0,
  expense_breakdown: { fixed_pct: 0, variable_pct: 0, financial_pct: 0, administrative_pct: 0 },
  mo_produtiva_pct: 0,
  calc_type: null,
  rro_policy: null,
  components: null,
  rates: [],
  production_labor_cost: 0,
  monthly_workload_minutes: 0,
  productive_value_per_minute: 0,
  loading: true,
}

interface HookOptions {
  /** Quando true, também carrega `tax_rates_periods` (S2). Default true. */
  loadRates?: boolean
  /** Data efetiva para rates. Default hoje. */
  effectiveDate?: string
}

/**
 * Mapeia regime string do banco para o tipo TaxRegime do motor.
 * `LUCRO_PRESUMIDO_RET` e `SIMPLES_HIBRIDO` mapeiam para os tipos base
 * do motor (LUCRO_PRESUMIDO e SIMPLES_NACIONAL) para fins de guard Q5,
 * mas os componentes já refletem a alíquota correta vinda do tax-sync.
 */
function mapToMotorRegime(regimeRaw: string | null | undefined): TaxRegime {
  if (!regimeRaw) return 'SIMPLES_NACIONAL'
  if (regimeRaw === 'MEI') return 'MEI'
  if (regimeRaw === 'SIMPLES_NACIONAL') return 'SIMPLES_NACIONAL'
  if (regimeRaw === 'SIMPLES_HIBRIDO') return 'LUCRO_PRESUMIDO'
  if (regimeRaw === 'LUCRO_PRESUMIDO') return 'LUCRO_PRESUMIDO'
  if (regimeRaw === 'LUCRO_PRESUMIDO_RET') return 'LUCRO_PRESUMIDO'
  if (regimeRaw === 'LUCRO_REAL') return 'LUCRO_REAL'
  return 'SIMPLES_NACIONAL'
}

/**
 * Hook reativo (SWR) que retorna todo o contexto MRM necessário às telas
 * comerciais. Pode ser usado em qualquer componente sob `useAuth`.
 *
 * Performance: 4 queries paralelas via `loadTenantTaxComponents` +
 * `tenant_expense_config` + `loadTaxRates`. SWR cacheia por 5min.
 */
export function useTenantTaxContext(options: HookOptions = {}): TenantTaxContext {
  const { tenantId } = useAuth()
  const loadRates = options.loadRates ?? true
  const effectiveDate = options.effectiveDate ?? new Date().toISOString().slice(0, 10)

  const swrKey = tenantId ? `tenant-tax-context-${tenantId}-${effectiveDate}` : null

  const { data, isLoading } = useSWR(
    swrKey,
    async (): Promise<TenantTaxContext> => {
      // 1. Carrega config MRM + rro_policy + percentuais de despesa (S8)
      // tenant_expense_config armazena percentuais em DECIMAL (0.05 = 5%) por
      // convenção do projeto (mesma de commission_pct/profit_pct).
      // V8.7 (2026-05-24): SCHEMA REAL — workload está em tenant_settings (não tenants!)
      // tenant_expense_config.productive_value_per_minute JÁ é o valor por minuto calculado
      // (productive_salary_total + fgts + other) / monthly_workload_minutes
      const { data: cfgRow } = await supabase
        .from('tenant_expense_config')
        .select('margin_reapuration_enabled, use_snapshot_rates, rro_policy, fixed_expense_percent, variable_expense_percent, financial_expense_percent, admin_labor_percent, indirect_labor_percent, production_labor_percent, production_labor_cost, production_labor_cost_hub, productive_value_per_minute')
        .eq('tenant_id', tenantId as string)
        .maybeSingle()

      // V8.7: workload do tenant está em tenant_settings (NÃO em tenants — schema correto)
      const { data: tenantSettingsRow } = await supabase
        .from('tenant_settings')
        .select('monthly_workload, num_productive_employees, workload_unit, calc_type')
        .eq('tenant_id', tenantId as string)
        .maybeSingle()

      const cfg = cfgRow as
        | {
            margin_reapuration_enabled?: boolean | null
            use_snapshot_rates?: boolean | null
            rro_policy?: string | null
            fixed_expense_percent?: number | null
            variable_expense_percent?: number | null
            financial_expense_percent?: number | null
            admin_labor_percent?: number | null
            indirect_labor_percent?: number | null
            production_labor_percent?: number | null
            production_labor_cost?: number | null
            production_labor_cost_hub?: number | null
            productive_value_per_minute?: number | null
          }
        | null
        | undefined

      const tenantOverride = cfg?.margin_reapuration_enabled ?? null
      const enabled = isMrmEnabled(tenantOverride)
      const useSnapshotRates = cfg?.use_snapshot_rates ?? true
      const rroPolicyRaw = cfg?.rro_policy ?? null
      const rro_policy: RroPolicy | null =
        rroPolicyRaw === 'strict' || rroPolicyRaw === 'permissive' ? rroPolicyRaw : null

      // S8 — DOP = soma das despesas operacionais (estrutura + MOI).
      //
      // BUG FIX (2026-05-23, Hyago): as colunas `*_percent` em tenant_expense_config
      // são salvas em FORMATO PERCENTUAL (0..100, ex: 10.64 = 10,64%) — vide
      // `recalc-expense-config.ts:119` (`round2(percents.X * 100)`) e o módulo
      // canônico `compute-service-price.ts:74` (`structurePct = (fixed+var+fin)/100`).
      // Sem a normalização, o motor RR recebia dop_pct ≈ 27 e calculava despesas 100×
      // maiores que a receita, fazendo o RRO negativar e zerar toda a distribuição
      // (Comissão/Lucro/IRPJ/CSLL → R$ 0,00 na UI mesmo com produto válido).
      //
      // Heurística defensiva (mesmo padrão de `tax-sync.ts:169`): se o valor já está
      // em decimal (0..1), preserva; se está em formato percentual (>1), divide por 100.
      // Garante retrocompat com qualquer estado pré-existente do banco.
      const toDecimal = (raw: unknown): number => {
        const n = Number(raw) || 0
        if (n <= 0) return 0
        return n < 1 ? n : n / 100
      }
      const fixedPct = toDecimal(cfg?.fixed_expense_percent)
      const variablePct = toDecimal(cfg?.variable_expense_percent)
      // Despesa financeira: sanity check adicional (Hyago 2026-05-25).
      // Cadastros antigos salvavam o valor já em formato percentual sem escalar
      // (ex: tenant salva `0.43` querendo dizer 0,43%; `toDecimal` preserva
      // `0.43` interpretando como 43% e contaminava o motor).
      // Despesa financeira plausível ≤ 20%. Valores > 20% após `toDecimal` são
      // quase sempre erro de escala — dividimos por 100 extra para corrigir.
      const financialPctRaw = toDecimal(cfg?.financial_expense_percent)
      const financialPct = financialPctRaw > 0.2 ? financialPctRaw / 100 : financialPctRaw
      const moiPct = toDecimal(cfg?.admin_labor_percent ?? cfg?.indirect_labor_percent)
      const dop_pct = fixedPct + variablePct + financialPct + moiPct
      const mod_pct = toDecimal(cfg?.production_labor_percent)

      // V8.7 (2026-05-24): contexto para calcular MO produtiva em RUNTIME.
      // Fonte preferencial: `productive_value_per_minute` (já calculado pelo módulo
      // de Formação de Preço como (productive_salary + fgts + other) / monthly_minutes).
      // Quando esse campo está populado, fórmula é DIRETA:
      //   MOD = product_workload × productive_value_per_minute
      //
      // Fallback (campo não populado): derivar monthly_workload_minutes do tenant_settings
      // e dividir production_labor_cost por isso.
      const tenantSettings = tenantSettingsRow as {
        monthly_workload?: number | null
        num_productive_employees?: number | null
        workload_unit?: string | null
        calc_type?: string | null
      } | null | undefined
      // Carga horária resolvida pela fonte única (`resolve-monthly-workload`), a mesma
      // usada no cadastro de Produto, de Serviço e em `compute-service-price`.
      //
      // Duas mudanças em relação ao código anterior deste ponto:
      // 1. O fallback de 176h/mês (V16.2) foi REMOVIDO. Ele trocava dado real por um
      //    número inventado sem avisar ninguém; o minuto define lucro e preço, então
      //    o sistema não pode precificar sobre carga horária que o tenant não informou.
      //    Com `monthly_workload=0`, `monthly_workload_minutes` agora é 0 e o bloqueio
      //    acontece na ORIGEM do preço (cadastro de Produto e de Serviço).
      // 2. Unidades fora de HOURS/DAYS/MINUTES caíam aqui em `0` — divergindo dos outros
      //    três call sites, que tratavam o default como MINUTES (`/60`). O helper unifica
      //    no comportamento dos três.
      const workload = resolveMonthlyWorkload(
        tenantSettings?.monthly_workload,
        tenantSettings?.workload_unit,
        tenantSettings?.num_productive_employees,
      )
      const monthly_workload_minutes = workload.monthlyWorkloadMinutes
      // V16.2: prefere `production_labor_cost_hub` (custo MO mensal consolidado do
      // módulo HUB) antes do `production_labor_cost` legado — alinha com
      // `build-calc-base.ts:15` que já tem essa precedência.
      const production_labor_cost = Number(cfg?.production_labor_cost_hub) || Number(cfg?.production_labor_cost) || 0
      // V8.7: campo direto do banco — preferir este sobre o cálculo derivado
      const productive_value_per_minute = Number(cfg?.productive_value_per_minute) || 0

      // 2. Carrega componentes tributários (tax-sync) e rates em paralelo
      const [components, ratesRaw] = await Promise.all([
        loadTenantTaxComponents(tenantId as string).catch((): TaxComponents | null => null),
        loadRates
          ? loadTaxRates({ date: effectiveDate }).catch((): TaxRatePeriod[] => [])
          : Promise.resolve<TaxRatePeriod[]>([]),
      ])

      const regime = mapToMotorRegime(components?.regime)

      // V8.1 (2026-05-24): injeta PIS/COFINS do tenant em `rates` como fallback
      // automático para produtos que não têm `pis_cofins_pct` cadastrado.
      // O motor RR usa `rates` para calcular taxes_inside; sem essas entradas,
      // PIS/COFINS não aparecem na DRE Consolidada mesmo o tenant tendo regime LR/LP.
      const rates: TaxRatePeriod[] = [...ratesRaw]
      const hasPisRate = rates.some(r => r.tax_type === 'PIS')
      const hasCofinsRate = rates.some(r => r.tax_type === 'COFINS')
      const tenantPis = Number(components?.pis) || 0
      const tenantCofins = Number(components?.cofins) || 0
      if (!hasPisRate && tenantPis > 0) {
        rates.push({
          id: 'tenant-fallback-PIS',
          tenant_id: tenantId as string,
          tax_type: 'PIS',
          origin_state: null, dest_state: null,
          rate_pct: tenantPis,
          valid_from: '2026-01-01', valid_until: null,
          notes: 'tenant fallback (tax-sync)',
        })
      }
      if (!hasCofinsRate && tenantCofins > 0) {
        rates.push({
          id: 'tenant-fallback-COFINS',
          tenant_id: tenantId as string,
          tax_type: 'COFINS',
          origin_state: null, dest_state: null,
          rate_pct: tenantCofins,
          valid_from: '2026-01-01', valid_until: null,
          notes: 'tenant fallback (tax-sync)',
        })
      }

      return {
        enabled,
        useSnapshotRates,
        regime,
        csll_pct: components?.csll ?? 0,
        irpj_pct: components?.irpj ?? 0,
        dop_pct,
        mod_pct,
        expense_breakdown: {
          fixed_pct: fixedPct,
          variable_pct: variablePct,
          financial_pct: financialPct,
          administrative_pct: moiPct,
        },
        mo_produtiva_pct: mod_pct,
        calc_type: tenantSettings?.calc_type ?? null,
        rro_policy,
        components,
        rates,
        production_labor_cost,
        monthly_workload_minutes,
        productive_value_per_minute,
        loading: false,
      }
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 60_000,
    },
  )

  if (!data) {
    return { ...DEFAULT_CONTEXT, loading: isLoading }
  }
  return data
}
