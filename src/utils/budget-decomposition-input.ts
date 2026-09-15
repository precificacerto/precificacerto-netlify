/**
 * budget-decomposition-input.ts — do ORÇAMENTO para a DECOMPOSIÇÃO.
 *
 * O módulo `decomposition-dre.ts` é puro e não sabe o que é um `budgetItem`. Este aqui faz a
 * travessia, e existe separado do componente pelo mesmo motivo de sempre: é onde o teste
 * consegue afirmar EFEITO em vez de passagem (`.claude/rules/teste-que-nao-exercita.md`).
 *
 * >>> A FICHA SAI DA MESMA FUNÇÃO QUE O RATEIO USA <<<
 * `resolveItemFicha` e `pisCofinsNominalFromEffective` são as mesmas que `orcamentos/index.tsx`
 * chama para ratear o frete. Uma segunda montagem de ficha aqui seria `copia-divergente.md`
 * entre duas leituras da MESMA matriz — e o campo esquecido seria uma alíquota.
 *
 * >>> ITEM MANUAL NÃO É COLUNA <<<
 * R13: item manual é repasse SEM tributo, e não tem ficha, custo nem margem. Ele entra na
 * decomposição como `itensManuaisComAcrescimos`, que a linha "(−) Itens manuais + frete
 * neles" desconta da receita após desconto. Dar-lhe uma coluna o faria parecer um produto que
 * não gera lucro, em vez de um valor que atravessa o documento inteiro.
 */

import {
  type DecompositionCategories,
  type DecompositionInput,
  type DecompositionItem,
} from './decomposition-dre'
import { resolveItemFicha } from './budget-accessories'
import { pisCofinsNominalFromEffective } from './sale-context'

/** As alíquotas do item, como o documento as guarda (base 100 ou fração conforme o campo). */
export interface BudgetItemRates {
  icms_pct?: number | null
  iss_pct?: number | null
  pis_pct?: number | null
  cofins_pct?: number | null
  ipi_pct?: number | null
  is_pct?: number | null
  ibs_pct?: number | null
  cbs_pct?: number | null
}

export interface BudgetDecompositionItem {
  key: string
  label: string
  isManual?: boolean
  isService?: boolean
  quantity: number
  /** Preço unitário GRAVADO — é o total geral do item por unidade. */
  unitPrice: number
  /** Custo unitário congelado (R18). */
  costUnit?: number | null
  /** Percentuais do item, base 100. */
  commissionPct?: number | null
  profitPct?: number | null
  rtPct?: number | null
  /** Alíquotas do item. `null` = sem ficha própria; cai em zero, que é o estado de hoje. */
  rates?: BudgetItemRates | null
  /** Acréscimos deste item, em R$ TOTAL (parcela rateada ou o do cadastro × quantidade). */
  acrescimos?: number | null
}

export interface BudgetDecompositionParams {
  items: BudgetDecompositionItem[]
  /** Desconto do documento, FRAÇÃO [0, 1). */
  discountPct: number
  /** Despesas operacionais do tenant, FRAÇÃO sobre o total geral. */
  despesasOperacionaisPct: number
  /** Alíquota do IRPJ sobre o LUCRO, FRAÇÃO (R6). */
  irpjAliquota: number
  /** Alíquota da CSLL sobre o LUCRO, FRAÇÃO. */
  csllAliquota: number
}

export interface BudgetDecompositionResult {
  input: DecompositionInput
  /** Rótulos das colunas, paralelo a `input.items`. */
  itemLabels: string[]
  /** `true` quando não há produto nenhum — só itens manuais, ou nada. */
  isEmpty: boolean
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Base 100 → fração. */
const frac = (v: unknown): number => num(v) / 100

/**
 * Monta a entrada da decomposição a partir dos itens do orçamento.
 *
 * As categorias vão POR ITEM: comissão, lucro e RT são cadastrados por produto, e o IRPJ e a
 * CSLL derivam do lucro DAQUELE item (R6). Um conjunto único de pesos distribuiria o RRO de
 * um produto pelos pesos de outro.
 */
export function buildBudgetDecompositionInput(
  params: BudgetDecompositionParams,
): BudgetDecompositionResult {
  const produtos = params.items.filter((i) => !i.isManual)
  const manuais = params.items.filter((i) => i.isManual)

  const itensManuaisComAcrescimos = manuais.reduce(
    (s, i) => s + num(i.unitPrice) * num(i.quantity) + num(i.acrescimos),
    0,
  )

  const items: DecompositionItem[] = produtos.map((item) => {
    const r = item.rates ?? null
    const icms = item.isService ? 0 : frac(r?.icms_pct)
    const iss = item.isService ? frac(r?.iss_pct) : 0
    // O cadastro guarda PIS/COFINS já com a exclusão do ICMS/ISS; a decomposição precisa da
    // NOMINAL, porque ela reaplica a exclusão sobre a base própria (R5, exceção 2).
    const pisCofinsNominal = pisCofinsNominalFromEffective(
      frac(r?.pis_pct) + frac(r?.cofins_pct),
      icms,
      iss,
    )

    const ficha = resolveItemFicha({
      segment: item.isService ? 'SERVICO' : 'INDUSTRIALIZACAO',
      rates: {
        icmsPct: item.isService ? null : icms,
        issPct: item.isService ? iss : null,
        pisCofinsPct: pisCofinsNominal,
        ipiPct: item.isService ? null : frac(r?.ipi_pct),
        isPct: item.isService ? null : frac(r?.is_pct),
        ibsPct: frac(r?.ibs_pct),
        cbsPct: frac(r?.cbs_pct),
      },
    })

    const lucroPct = frac(item.profitPct)
    const categories: DecompositionCategories = {
      despesasOperacionaisPct: num(params.despesasOperacionaisPct),
      rtPct: frac(item.rtPct),
      comissaoPct: frac(item.commissionPct),
      lucroPct,
      // R6 — a base do IRPJ e da CSLL é o VALOR DO LUCRO: `% Original = alíquota × % Lucro`.
      irpjPct: lucroPct * num(params.irpjAliquota),
      csllPct: lucroPct * num(params.csllAliquota),
    }

    return {
      id: item.key,
      label: item.label,
      totalProduto: num(item.unitPrice) * num(item.quantity),
      custo: num(item.costUnit) * num(item.quantity),
      acrescimos: num(item.acrescimos),
      taxes: {
        icmsPct: icms,
        issPct: iss,
        pisCofinsPct: pisCofinsNominal,
        // O `c` da construção DAQUELE item, lido da ficha — nunca um `c` global.
        externalOpsCoefficient: ficha.ficha?.externalOpsCoefficient ?? 0,
      },
      categories,
    }
  })

  // As categorias do DOCUMENTO são a média dos itens só para as linhas que não têm coluna.
  // Nenhum cálculo por item as usa: cada um tem as suas acima.
  const primeira = items[0]?.categories
  const categories: DecompositionCategories = primeira ?? {
    despesasOperacionaisPct: num(params.despesasOperacionaisPct),
    rtPct: 0, comissaoPct: 0, lucroPct: 0, irpjPct: 0, csllPct: 0,
  }

  return {
    input: {
      items,
      categories,
      discountPct: num(params.discountPct),
      itensManuaisComAcrescimos,
    },
    itemLabels: items.map((i) => i.label),
    isEmpty: items.length === 0,
  }
}
