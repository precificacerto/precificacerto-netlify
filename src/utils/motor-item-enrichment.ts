/**
 * motor-item-enrichment.ts — CONSTRUTOR ÚNICO da entrada por item do motor V17.
 *
 * POR QUE ISTO EXISTE COMO MÓDULO
 * ────────────────────────────────
 * O bloco que enriquece um item do documento com os campos do cadastro vivo — custo, MO
 * produtiva, despesas, RT, tipo de produto, terceirizadas — existia em QUATRO cópias:
 * uma em `orcamentos/index.tsx` e três em `vendas/index.tsx` (drawer do balcão, validação
 * pré-save e save). Elas já tinham divergido, e a divergência é medível campo a campo:
 *
 *   campo                      orçamento   balcão   validação   save da venda
 *   ─────────────────────────  ─────────   ──────   ─────────   ─────────────
 *   `cost_total` recomputado      SIM        não       não           não
 *   `productive_labor_unit`       SIM        não       não           não
 *   `financial_expense_unit`      SIM        não       não           não
 *   `expense_breakdown_unit` (produto) SIM   não       não           não
 *   `rt_reserve_percent`          SIM        SIM     AUSENTE       AUSENTE
 *   `yield_quantity`              SIM        não       não           não
 *   `is_manual_cost`              SIM        não       não           não
 *
 * Nada falhava. Os campos ausentes são OPCIONAIS em `PageItem`, então o motor caía no
 * fallback de cada um: sem `is_manual_cost` o item manual entrava na cascata de produtos em
 * vez de virar custo puro; sem `rt_reserve_percent` o RT saía zero; sem os campos de custo o
 * motor caía no snapshot V14 legado. Três defeitos silenciosos numa única omissão de cópia.
 *
 * É a 4ª aparição da CÓPIA DIVERGENTE (#27, #28, #45) — ver `.claude/rules/copia-divergente.md`.
 * O discriminante que a separa do CONSTRUTOR EMPOBRECIDO é a detectabilidade: aqui os quatro
 * blocos SE PARECEM (são cópias literais, achadas pondo-as lado a lado), enquanto no
 * construtor empobrecido os produtores não se parecem e só a cobertura de campos os denuncia.
 *
 * O REMÉDIO É ESTE MÓDULO, não uma lista de campos a conferir: com um construtor só,
 * acrescentar um campo vale para as quatro rotas, e a omissão deixa de ser possível.
 *
 * FATO HISTÓRICO, E POR ISSO VIVE NA GRAVAÇÃO
 * ────────────────────────────────────────────
 * O enriquecimento lê o cadastro VIVO — é o que deve fazer, porque ele roda no momento em
 * que o documento é GRAVADO, que é quando o fato nasce. Ler o cadastro vivo para EXIBIR um
 * documento já gravado é que seria a releitura proibida por `.claude/rules/fato-vs-referencia.md`.
 * Este módulo não é chamado em nenhum caminho de leitura de documento gravado.
 */

import {
    resolveProductCostAndLabor,
    resolveProductFinancialExpense,
    resolveProductExpenseBreakdown,
} from '@/utils/item-tax-rates'
import { resolveServiceExpenseBreakdownUnit } from '@/utils/service-expense-snapshot'
import { resolveItemRtPercent, type RtCatalogEntry } from '@/utils/balcao-rt'

/**
 * Catálogos vivos — o mesmo par que as telas já carregam via `useProducts`/`useServices`.
 *
 * Tipados como `unknown[]` de propósito: as linhas vêm dos tipos gerados do Supabase, que são
 * uniões amplas e diferentes entre produto e serviço. Estreitar aqui obrigaria a repetir a
 * união em cada chamada — que é o tipo de fricção que fez as quatro cópias nascerem. A leitura
 * de campo passa por `field()`, num ponto só e documentado.
 */
export interface MotorEnrichmentCatalogs {
    products: readonly unknown[]
    services: readonly unknown[]
}

/** Linha de catálogo já estreitada para leitura de campo. */
type CatalogRow = Record<string, unknown>

/** Leitura de campo de uma linha de catálogo — o ÚNICO ponto de estreitamento do módulo. */
function field(row: unknown, key: string): unknown {
    return row && typeof row === 'object' ? (row as CatalogRow)[key] : undefined
}

/** Acha a linha do catálogo pelo `id`, sem assumir o tipo gerado. */
function findById(rows: readonly unknown[], id: string | null | undefined): unknown {
    if (!id) return null
    return rows.find((r) => field(r, 'id') === id) ?? null
}

/**
 * Parâmetros do tenant necessários para derivar a MO produtiva do produto.
 * Vêm de `useTenantTaxContext` — o módulo continua PURO (não fala com Supabase).
 */
export interface MotorEnrichmentTenantCtx {
    production_labor_cost?: number | null
    monthly_workload_minutes?: number | null
    productive_value_per_minute?: number | null
}

/** O item do documento, no que o enriquecimento precisa ler para achar o cadastro. */
export interface EnrichableItem {
    product_id?: string | null
    service_id?: string | null
    unit_price?: number | null
    quantity?: number | null
    rt_reserve_percent?: number | null
    /** Marca de item manual na tela de orçamento (vira `is_manual_cost`). */
    isManual?: boolean
}

/** Só as chaves que o enriquecimento ACRESCENTA — o resto vem do item por spread. */
export interface MotorEnrichmentFields {
    cost_total?: number
    productive_labor_unit?: number
    financial_expense_unit?: number
    expense_breakdown_unit?: ReturnType<typeof resolveProductExpenseBreakdown> | null
    product_type: string | null
    yield_quantity: number | null
    rt_reserve_percent: number
    valor_op_interna_unit: number | null
    sale_price_base_unit: number | null
    terceirizadas_unit: number | null
    is_manual_cost: boolean
}

/** `> 0` ou `null` — zero e valor inválido são tratados como "não informado". */
function positiveOrNull(v: unknown): number | null {
    const n = Number(v)
    return v != null && Number.isFinite(n) && n > 0 ? n : null
}

/**
 * Enriquece os itens de um documento com o cadastro vivo, para alimentar
 * `calculateMotorV17ForPage`.
 *
 * A cobertura é a UNIÃO das quatro cópias que este módulo substitui — ou seja, a do
 * orçamento, que era a completa, mais o `resolveItemRtPercent` canônico que o balcão já
 * usava (cobre produto E serviço; a versão inline do orçamento fazia o mesmo à mão).
 *
 * Itens sem cadastro correspondente (item manual, produto excluído) atravessam intactos:
 * o guard de custo só sobrescreve quando o cadastro vivo tem valor positivo.
 */
export function enrichItemsForMotor<T extends EnrichableItem>(
    items: readonly T[],
    catalogs: MotorEnrichmentCatalogs,
    tenantCtx: MotorEnrichmentTenantCtx,
): (T & MotorEnrichmentFields)[] {
    const { products, services } = catalogs
    return items.map((item) => {
        const prod = findById(products, item.product_id)
        const svc = findById(services, item.service_id)

        // Terceirizadas: frete + seguro + despesas acessórias, já embutidos no `unit_price`.
        // O motor as separa do `rb` para que o peso interno/externo não as carregue.
        const terceirizadas = prod
            ? (Number(field(prod, 'freight_value')) || 0) +
              (Number(field(prod, 'insurance_value')) || 0) +
              (Number(field(prod, 'accessory_expenses_value')) || 0)
            : 0

        // PC-BUG-CMV-PERSIST-001: custo, MO produtiva e despesas SEMPRE recomputados do
        // cadastro vivo NA GRAVAÇÃO. Na reabertura, o item carrega `cost_total` cru (sem MOD)
        // e sem `productive_labor_unit` — sem esta recomposição o motor cai no snapshot V14
        // stale. Guard: só sobrescreve quando o cadastro tem custo > 0 (produto excluído
        // não zera o item).
        let costFields: Partial<MotorEnrichmentFields> = {}
        if (prod) {
            const { costTotal, productiveLaborUnit } = resolveProductCostAndLabor(prod, {
                production_labor_cost: tenantCtx.production_labor_cost,
                monthly_workload_minutes: tenantCtx.monthly_workload_minutes,
                productive_value_per_minute: tenantCtx.productive_value_per_minute,
            })
            if (costTotal > 0 || productiveLaborUnit > 0) {
                costFields = {
                    cost_total: costTotal,
                    productive_labor_unit: productiveLaborUnit,
                    financial_expense_unit: resolveProductFinancialExpense(prod),
                    expense_breakdown_unit: resolveProductExpenseBreakdown(prod),
                }
            }
        }

        return {
            ...item,
            ...costFields,
            // Snapshot de despesas do SERVIÇO (`services.expense_snapshot`), no mesmo campo
            // que o produto usa. `null` (serviço legado) mantém o fallback ao tenant.
            ...(svc
                ? {
                      expense_breakdown_unit: resolveServiceExpenseBreakdownUnit(
                          svc as { expense_snapshot?: unknown },
                          Number(item.unit_price) || 0,
                      ),
                  }
                : {}),
            // FIX-CUSTO-SN: o adapter usa os dois para saber se `yield_quantity` é rendimento
            // (PRODUZIDO) ou estoque (REVENDA).
            product_type: (field(prod, 'product_type') as string | null) ?? null,
            yield_quantity: (field(prod, 'yield_quantity') as number | null) ?? null,
            // EPIC-RT v8 (D15): item primeiro (RT congelado na seleção), cadastro como
            // fallback de item legado — e o fallback cobre produto E serviço.
            rt_reserve_percent: resolveItemRtPercent(
                item,
                products as readonly RtCatalogEntry[],
                services as readonly RtCatalogEntry[],
            ),
            valor_op_interna_unit: positiveOrNull(field(prod, 'valor_precificado_icms_piscofins')),
            sale_price_base_unit: positiveOrNull(field(prod, 'sale_price_base')),
            terceirizadas_unit: terceirizadas > 0 ? terceirizadas : null,
            // Item manual é repasse puro: custo puro na Etapa 4, resíduo 0, imune a desconto.
            // Ausente, ele entrava na cascata de produtos e recebia comissão/lucro.
            is_manual_cost: item.isManual === true,
        } as T & MotorEnrichmentFields
    })
}
