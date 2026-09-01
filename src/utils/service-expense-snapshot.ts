/**
 * service-expense-snapshot.ts — as alíquotas de despesa que formaram o preço de UM serviço,
 * congeladas no momento em que o preço foi gravado.
 *
 * O DEFEITO QUE ISTO CORRIGE (estrutural):
 * produto guarda as suas alíquotas em `pricing_calculations` (`pct_indirect_labor`,
 * `pct_fixed_expense`, `pct_variable_expense`, `pct_financial_expense`) e a cascata as lê
 * via `expense_breakdown_unit`. Serviço não guardava nada: quem precisasse decompor o preço
 * de um serviço lia o `tenant_expense_config` ATUAL. Bastava o tenant editar a configuração
 * de despesas para que o PREÇO GRAVADO DEIXASSE DE SER REPRODUZÍVEL — a decomposição passa a
 * usar números que não construíram aquele preço.
 *
 * Evidência que expôs o problema (ORC-2356, Salão Eliane): a Hidratação foi precificada com
 * variável 1,29% e financeira 0,37%; o `tenant_expense_config` passou a 1,25% / 0,36% em
 * 01/09/2026 15:47. A cascata decompunha o preço com as novas, e o espelho Etapa 6 ⇄ Etapa 16
 * ficava R$ 0,0368 fora (73,68 × 0,05%). O centavo era sintoma; o defeito é a ausência do
 * snapshot.
 *
 * O QUE ENTRA AQUI, E POR QUÊ SÓ ISSO:
 * o preço do serviço é `CMV ÷ (1 − Σ percentuais)`, e os únicos percentuais estruturais do
 * denominador são variável e financeira. Despesa Fixa e MO Administrativa NÃO estão no
 * coeficiente: elas entram em R$/mês dentro do custo por minuto, que já vira `services.
 * labor_cost` e `services.cost_total` — valores absolutos, já congelados. Registrá-las aqui
 * como percentual sugeriria uma segunda incidência que não existe (foi exatamente essa
 * dupla contagem que a correção da Etapa 5 removeu).
 *
 * O custo por minuto e a carga horária vão junto para que o preço seja AUDITÁVEL: com eles
 * dá para reconstruir a mão de obra a partir da duração do serviço.
 *
 * AUSÊNCIA É INFORMAÇÃO: `null` significa "serviço anterior ao snapshot", e os leitores caem
 * no tenant, como sempre fizeram. Um objeto com zeros diria "as alíquotas eram zero" — outra
 * afirmação. Foi a confusão entre essas duas coisas que o D8 pagou caro com
 * `NOT NULL DEFAULT 0`.
 */

/** Versão do formato gravado em `services.expense_snapshot`. */
export const SERVICE_EXPENSE_SNAPSHOT_VERSION = 1 as const

export interface ServiceExpenseSnapshot {
    v: typeof SERVICE_EXPENSE_SNAPSHOT_VERSION
    /** Despesa variável em % base-100, como entrou no coeficiente. */
    variavel_pct: number
    /** Despesa financeira em % base-100, como entrou no coeficiente. */
    financeira_pct: number
    /** R$/minuto que formou a mão de obra dentro do CMV. */
    custo_por_minuto: number
    /** Minutos/mês da equipe produtiva usados como divisor. */
    carga_horaria_minutos: number
    /** ISO 8601 — quando o preço foi formado. */
    gravado_em: string
}

function finite(v: unknown): number {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
}

/**
 * Monta o snapshot a gravar junto com o preço.
 *
 * Chamado pelos TRÊS pontos que formam preço de serviço — a tela de cadastro, o botão
 * "Atualizar serviço" e a atualização em massa a partir de um item. Se algum deles gravasse
 * preço sem gravar snapshot, o serviço ficaria com um snapshot velho descrevendo um preço
 * novo, que é pior do que não ter snapshot nenhum.
 */
export function buildServiceExpenseSnapshot(input: {
    variavelPct: number
    financeiraPct: number
    custoPorMinuto: number
    cargaHorariaMinutos: number
    /** Injetável para teste; default = agora. */
    gravadoEm?: string
}): ServiceExpenseSnapshot {
    return {
        v: SERVICE_EXPENSE_SNAPSHOT_VERSION,
        variavel_pct: finite(input.variavelPct),
        financeira_pct: finite(input.financeiraPct),
        custo_por_minuto: finite(input.custoPorMinuto),
        carga_horaria_minutos: finite(input.cargaHorariaMinutos),
        gravado_em: input.gravadoEm ?? new Date().toISOString(),
    }
}

/**
 * Lê o snapshot gravado. Devolve `null` para serviço legado, jsonb corrompido ou versão
 * desconhecida — em todos esses casos o leitor deve cair no tenant, que é o comportamento
 * de hoje.
 */
export function readServiceExpenseSnapshot(raw: unknown): ServiceExpenseSnapshot | null {
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null
    const o = raw as Record<string, unknown>
    if (Number(o.v) !== SERVICE_EXPENSE_SNAPSHOT_VERSION) return null
    // Um snapshot precisa dizer quais eram as alíquotas. Sem os dois campos não há o que
    // congelar, e tratar o objeto como válido esconderia dado incompleto atrás de zeros.
    if (o.variavel_pct == null || o.financeira_pct == null) return null
    return {
        v: SERVICE_EXPENSE_SNAPSHOT_VERSION,
        variavel_pct: finite(o.variavel_pct),
        financeira_pct: finite(o.financeira_pct),
        custo_por_minuto: finite(o.custo_por_minuto),
        carga_horaria_minutos: finite(o.carga_horaria_minutos),
        gravado_em: typeof o.gravado_em === 'string' ? o.gravado_em : '',
    }
}

/** Shape que a cascata consome por item (`PageItem.expense_breakdown_unit`). */
export interface ExpenseBreakdownUnit {
    mo_admin: { rate: number; amount_unit: number }
    fixa: { rate: number; amount_unit: number }
    variavel: { rate: number; amount_unit: number }
    financeira: { rate: number; amount_unit: number }
}

/**
 * Converte o snapshot no `expense_breakdown_unit` que a cascata já sabe ler — o mesmo
 * caminho do snapshot de produto, com as alíquotas em DECIMAL.
 *
 * `mo_admin` e `fixa` saem ZERADAS por construção: no serviço as duas são CUSTO, e já estão
 * dentro do custo por minuto. Não é omissão — é a tabela de destinos (ver
 * `expense-destination.ts`), agora escrita também no dado.
 *
 * @param unitPrice preço unitário do item, base dos valores absolutos exibidos.
 */
export function serviceSnapshotToExpenseBreakdownUnit(
    snapshot: ServiceExpenseSnapshot,
    unitPrice = 0,
): ExpenseBreakdownUnit {
    const price = finite(unitPrice)
    const variavel = snapshot.variavel_pct / 100
    const financeira = snapshot.financeira_pct / 100
    return {
        mo_admin: { rate: 0, amount_unit: 0 },
        fixa: { rate: 0, amount_unit: 0 },
        variavel: { rate: variavel, amount_unit: price * variavel },
        financeira: { rate: financeira, amount_unit: price * financeira },
    }
}

/**
 * Atalho para o enriquecimento das páginas: do registro do serviço para o
 * `expense_breakdown_unit`, ou `null` quando não há snapshot.
 */
export function resolveServiceExpenseBreakdownUnit(
    service: { expense_snapshot?: unknown } | null | undefined,
    unitPrice = 0,
): ExpenseBreakdownUnit | null {
    const snap = readServiceExpenseSnapshot(service?.expense_snapshot)
    return snap ? serviceSnapshotToExpenseBreakdownUnit(snap, unitPrice) : null
}
