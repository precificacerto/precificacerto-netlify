/**
 * A MÃO DE OBRA DE UM TEMPO DE FABRICAÇÃO, PELO CAMINHO DA TELA DE PRODUTO.
 *
 * É o que `products/content.component.tsx` faz para um produto que não é de revenda, sem nada novo:
 *   - a carga horária da empresa por `resolveMonthlyWorkload` (tenant_settings);
 *   - o custo mensal por `custoMensalDeMaoDeObraDoProduto`, com o produtivo lido como em
 *     `build-calc-base.ts` (`production_labor_cost_hub`, e na falta dele `production_labor_cost`) e,
 *     no serviço, a MO administrativa e a fixa somadas (`custoMensalDeMaoDeObra`);
 *   - a divisão do PASSO 1 de `calculatePricing`, chamado com todos os percentuais em zero:
 *     `productiveLaborCost` = minutos × (custo mensal ÷ minutos da empresa), ao centavo.
 *
 * `productive_value_per_minute` NÃO é lido: está 0 em produção e nada escreve nele (dono do produto,
 * 25/10/2026). A tela também não o lê neste caminho.
 *
 * Faltou um número: a falta é NOMEADA, e saem todas de uma vez (`faltou-dado-recusa-nomeada.md`).
 * Nunca MO zero no lugar de MO ausente — a tela trata o divisor zero como MO zero, e é exatamente o
 * que aqui vira recusa, porque o número vai para um orçamento sem ninguém olhar.
 *
 * Mora FORA da área do Atendimentos I.A. de propósito: a conta é do sistema do cliente, e o
 * vocabulário dela (o tipo de cálculo e a despesa de cada um) é o do sistema, não o da área.
 * Portão: `src/utils/__tests__/levantamento-da-conversa.test.ts`, bloco (7).
 */
import { resolveMonthlyWorkload } from './resolve-monthly-workload'
import { custoMensalDeMaoDeObraDoProduto, type SegmentoDaConstrucao } from './despesas-do-segmento'
import { calculatePricing } from './pricing-engine'

/** As colunas de `tenant_settings` e de `tenant_expense_config` que o caminho lê. */
export type DadosDaEmpresaParaMaoDeObra = {
    calc_type?: string | null
    monthly_workload?: number | null
    workload_unit?: string | null
    num_productive_employees?: number | null
    production_labor_cost_hub?: number | null
    production_labor_cost?: number | null
    admin_salary_total?: number | null
    admin_fgts_total?: number | null
    admin_other_costs?: number | null
    fixed_expense_monthly?: number | null
}

export type MaoDeObraPelaTela =
    | {
        ok: true
        /** O custo mensal que a tela entrega ao motor. */
        custoMensal: number
        /** Os minutos produtivos da empresa no mês. */
        minutosDaEmpresa: number
        /** `calculatePricing(...).productiveLaborCost` para `minutos`: R$ ao centavo. */
        valor: number
    }
    | { ok: false; faltas: string[] }

/** Os valores de `calc_type` como o banco os grava, nas duas grafias que `auth.context.tsx` aceita. */
const TIPO_DE_CALCULO: Readonly<Record<string, SegmentoDaConstrucao>> = {
    INDUSTRIALIZACAO: 'INDUSTRIALIZACAO', INDUSTRIALIZATION: 'INDUSTRIALIZACAO',
    SERVICO: 'SERVICO', SERVICE: 'SERVICO',
    REVENDA: 'REVENDA', RESALE: 'REVENDA',
}

export const FALTA_TIPO_DE_CALCULO = 'o tipo de cálculo da empresa (industrialização, revenda ou serviço) não está configurado'
export const FALTA_CARGA_HORARIA = 'a carga horária mensal da empresa não está configurada'
export const FALTA_CUSTO_DE_MAO_DE_OBRA = 'o custo mensal da mão de obra produtiva da empresa não está configurado'
export const FALTA_REVENDA = 'a empresa está configurada como revenda, e na revenda o tempo de fabricação não entra no custo'

/** A mão de obra de `minutos` de fabricação, para uma empresa. Função pura. */
export function maoDeObraPeloCaminhoDaTela(d: DadosDaEmpresaParaMaoDeObra, minutos: number): MaoDeObraPelaTela {
    const tipo = TIPO_DE_CALCULO[String(d.calc_type ?? '')]
    // na revenda a tela não usa tempo: não há o que somar, e as outras faltas não importam
    if (tipo === 'REVENDA') return { ok: false, faltas: [FALTA_REVENDA] }
    const faltas: string[] = []
    if (!tipo) faltas.push(FALTA_TIPO_DE_CALCULO)
    const carga = resolveMonthlyWorkload(d.monthly_workload, d.workload_unit, d.num_productive_employees)
    if (carga.isUnset) faltas.push(FALTA_CARGA_HORARIA)
    // a tela: `segmentoDaDespesa` é SERVICO no serviço e INDUSTRIALIZACAO em todo o resto
    const custoMensal = custoMensalDeMaoDeObraDoProduto({
        effectiveCalcType: tipo ?? 'INDUSTRIALIZACAO',
        segmentoDaDespesa: tipo === 'SERVICO' ? 'SERVICO' : 'INDUSTRIALIZACAO',
        produtivaMensal: Number(d.production_labor_cost_hub) || Number(d.production_labor_cost) || 0,
        adminMensal: (Number(d.admin_salary_total) || 0) + (Number(d.admin_fgts_total) || 0) + (Number(d.admin_other_costs) || 0),
        fixaMensal: Number(d.fixed_expense_monthly) || 0,
    })
    if (!(custoMensal > 0)) faltas.push(FALTA_CUSTO_DE_MAO_DE_OBRA)
    if (faltas.length || !tipo) return { ok: false, faltas }

    const motor = calculatePricing({
        calcType: tipo, totalItemsCost: 0, yieldQuantity: 1,
        laborCostMonthly: custoMensal, numProductiveEmployees: carga.totalEmployees,
        monthlyWorkloadMinutes: carga.monthlyWorkloadMinutes, productWorkloadMinutes: minutos,
        structurePct: 0, taxPct: 0, commissionPct: 0, profitPct: 0,
    })
    if (!motor.isValid) throw new Error(`calculatePricing: ${motor.validationErrors.join('; ')}`)
    return { ok: true, custoMensal, minutosDaEmpresa: carga.monthlyWorkloadMinutes, valor: motor.productiveLaborCost }
}
