/**
 * document-snapshot.ts — o GRAVADOR do snapshot, agora CONSOLIDADO POR DOCUMENTO e rodando
 * o MESMO motor V17 da tela.
 *
 * O DEFEITO QUE ISTO FECHA
 * ─────────────────────────
 * O cutover V17 (2026-05-28) trocou o motor da rota de RUNTIME e deixou a rota de GRAVAÇÃO
 * no V16. Consequência medida em 05/09/2026: 263 de 263 itens com snapshot na base carregam
 * `cascade_trace` de 13 etapas — a cascata de 17 etapas NUNCA foi persistida, em lugar nenhum.
 * A tela do Pedido e o detalhe da Venda gravada exibem o que o gravador escreveu, e por isso
 * mostravam a cascata REDUZIDA: sem o Bloco 1 inteiro (Fragmentação, Construção matemática,
 * Agrupamento, Consolidação de custos, de despesas, DAS MARGENS, Formação Op Interna/Externa,
 * Venda consolidada e Pesos estruturais), começando direto na decomposição.
 *
 * Os cards não estavam errados isoladamente: refletiam fielmente uma cascata incompleta.
 *
 * O INVARIANTE DO ESPELHO DECIDIU QUAL NÚMERO É O CERTO
 * ─────────────────────────────────────────────────────
 * Com desconto zero, a Etapa 6 (Consolidação das margens, PRÉ-desconto) tem de coincidir com
 * a Etapa 16 (Redistribuição do RRO, PÓS-desconto). Sob V17 o invariante FECHA; sob V16 ele é
 * INEXPRIMÍVEL, porque a cascata de 13 etapas não tem Etapa 6 para comparar. Medido no
 * PED-18A461: cabeçalho (V17) 150,94 + 45,28; itens (V16) 134,21 + 40,26. **O número certo é
 * o do cabeçalho**, e depois desta unificação a divergência cabeçalho × itens fecha sozinha,
 * porque passa a existir UMA rota.
 *
 * POR QUE O GRAVADOR PRECISOU VIRAR POR DOCUMENTO
 * ───────────────────────────────────────────────
 * O V16 é POR ITEM; o V17 é CONSOLIDADO — roda uma vez sobre todos os itens (Etapas 1-9 do
 * PDF consolidam cross-produto ANTES de aplicar o desconto) e rateia o resultado por
 * `rb_i / rb_total`. Não há como produzir o snapshot de UM item sem os itens TODOS. Por isso
 * `hydrateItemSnapshot` (por item) dá lugar a `hydrateDocumentSnapshots` (por documento).
 *
 * O QUE NÃO MUDOU, E TINHA DE NÃO MUDAR
 * ──────────────────────────────────────
 * - A POLÍTICA do snapshot: `use_snapshot_rates=false` ⇒ `tax_breakdown: null` (AC4), e
 *   `prev_breakdown` válido ⇒ PRESERVADO (AC3). O AC3 é alimentado por um único call site no
 *   sistema — a conversão orçamento → venda (`budget-item-to-sale-item.ts`) — e a preservação
 *   tinha de sobreviver à troca de motor. Sobreviveu: é decidida ANTES do motor rodar.
 * - Nenhum documento gravado é reescrito. A troca só alcança o que for gravado a partir dela.
 *
 * O QUE SAIU, E POR QUÊ
 * ──────────────────────
 * O `runShadowComparison` NÃO acompanha esta rota. Ele compara um `ReapurationInput` do motor
 * V16 contra a edge function, e o V17 não constrói esse input — não há o que passar. Fabricar
 * um para manter a chamada seria comparar duas coisas diferentes e chamar o resultado de
 * divergência. A flag `mrm.shadow_mode_enabled` está em `false`, então nada é perdido em
 * runtime; se o shadow voltar, ele terá de nascer com uma entrada V17.
 *
 * RESSALVA DE MÉTODO — NÃO HÁ ALCANCE PROJETADO
 * ──────────────────────────────────────────────
 * NÃO é possível projetar quanto os itens já gravados mudariam. Fazer isso exigiria rodar o
 * V17 sobre documento histórico com o cadastro de HOJE — exatamente a referência viva que
 * esta correção elimina (`.claude/rules/fato-vs-referencia.md`). O único par medido é o
 * PED-18A461 (134,21 → 150,94, +12,5%), num documento MEI SEM IMPOSTO: **amostra de um, não
 * base para extrapolar**. Nada aqui afirma alcance.
 */

import {
    calculateMotorV17ForPage,
    calculateMotorV17ForPageFull,
    type LegacyMotorResult,
    type PageBuildArgs,
    type PageItem,
} from '@/utils/mrm-engine-v17/legacy-adapter'
import type { ItemSnapshot, TenantSnapshotContext } from '@/lib/items-snapshot'
import type { DiscountMode, MotorV17Result, TaxBreakdown } from '@/types/mrm'

/** Um item do documento na entrada do gravador. */
export interface DocumentItemHydrationInput {
    /**
     * O item JÁ ENRIQUECIDO por `enrichItemsForMotor` — a MESMA entrada que a tela dá ao
     * motor em runtime. Enriquecer aqui por outro caminho recriaria a cópia divergente que
     * `motor-item-enrichment.ts` acabou de eliminar.
     */
    motorItem: PageItem
    /** % de comissão do item (decimal) para a COLUNA `commission_pct`. */
    commission_pct: number
    /** % de lucro do item (decimal) para a COLUNA `profit_pct`. */
    profit_pct: number
    /**
     * `tax_breakdown` anterior, quando existir. Preservado (AC3) sob `use_snapshot_rates=true`
     * — é o que mantém o snapshot imutável na travessia orçamento → venda.
     */
    prev_breakdown?: TaxBreakdown | null
}

export interface DocumentHydrationArgs {
    items: DocumentItemHydrationInput[]
    /** Contexto do motor — o MESMO objeto que a tela monta para o runtime. */
    tenantCtx: PageBuildArgs['tenantCtx']
    globalDiscountPercent: number
    /** Modo escolhido no documento. Vai para o snapshot; a absorção vem de `tenantCtx`. */
    discountMode: DiscountMode
    effectiveDate?: string
    icmsCompl?: PageBuildArgs['icmsCompl']
    icmsComplApplies?: boolean
}

/**
 * Completa o resultado por item do motor V17 em um `TaxBreakdown` persistível.
 *
 * O resultado do motor é `Pick<TaxBreakdown, ...>` — tem todos os NÚMEROS e o
 * `cascade_trace`, e não tem os campos de CONTEXTO (regime, data, política do snapshot,
 * modo de desconto, validade). São esses, e só esses, que se acrescentam aqui: nenhum
 * número é recalculado, para que o gravado seja bit a bit o que a tela calculou.
 */
function toPersistedBreakdown(
    result: LegacyMotorResult,
    consolidated: MotorV17Result,
    ctx: TenantSnapshotContext,
    discountMode: DiscountMode,
    effectiveDate: string,
): TaxBreakdown {
    return {
        ...result,
        effective_date: effectiveDate,
        regime: ctx.regime,
        use_snapshot_rates: true,
        // O V17 não expõe `limite_minimo` por item — o piso é avaliado no consolidado.
        // `null` diz "não apurado", que é diferente de "apurado e igual a zero"
        // (`.claude/rules/ausente-vs-falso.md`).
        limite_minimo: null,
        discount_mode_requested: discountMode,
        discount_mode_applied: discountMode,
        // As validações do V17 são do DOCUMENTO, não do item — o motor consolida antes de
        // ratear, então V4 (distribuição = RRO) e V5 (cascata com 17 etapas) só existem no
        // consolidado. Gravá-las por item é gravar a mesma verdade em cada linha, que é o
        // que elas de fato são depois da consolidação.
        validations: consolidated.distribution.validations,
        error_code: consolidated.error_code,
        messages: consolidated.messages,
        valid: result.status === 'VALID',
    } as TaxBreakdown
}

/**
 * Hidrata os snapshots de TODOS os itens de um documento, com uma única passada do motor V17.
 *
 * Devolve um array PARALELO a `args.items` — mesmo índice, mesmo item. Um item para o qual o
 * motor não produz resultado (valor zero, item manual sem custo) recebe `tax_breakdown: null`,
 * que é "sem apuração" e nunca um zero afirmado.
 */
export function hydrateDocumentSnapshots(
    args: DocumentHydrationArgs,
    ctx: TenantSnapshotContext,
): ItemSnapshot[] {
    const columns = args.items.map((i) => ({
        commission_pct: i.commission_pct ?? 0,
        profit_pct: i.profit_pct ?? 0,
    }))

    // AC4: política do tenant desliga o congelamento — persiste só os pesos.
    if (!ctx.use_snapshot_rates) {
        return columns.map((c): ItemSnapshot => ({ tax_breakdown: null, ...c }))
    }

    const effectiveDate = args.effectiveDate ?? new Date().toISOString().slice(0, 10)
    const motorArgs: PageBuildArgs = {
        items: args.items.map((i) => i.motorItem),
        tenantCtx: args.tenantCtx,
        globalDiscountPercent: args.globalDiscountPercent,
        effectiveDate,
        icmsCompl: args.icmsCompl,
        icmsComplApplies: args.icmsComplApplies,
    }

    // `...Full` porque o snapshot precisa das validações, do `error_code` e das mensagens,
    // que o V17 produz no CONSOLIDADO — o per-item é o rateio desse consolidado.
    const { per_item: results, consolidated } = calculateMotorV17ForPageFull(motorArgs)
    // Correção Card Percentual (Ago/2026): o "% original" do card sai do motor rodado com
    // desconto ZERO, pela MESMA via — par fechado pré/pré. Superfícies que leem só o snapshot
    // (PDF, Pedido, Venda) dependem dele. Não afeta nenhum valor em R$ persistido.
    const baseline = calculateMotorV17ForPage({ ...motorArgs, globalDiscountPercent: 0 })

    return args.items.map((item, idx) => {
        const cols = columns[idx]

        // AC3: snapshot existente válido é PRESERVADO. Decidido ANTES de olhar o motor —
        // é o que faz a preservação sobreviver a qualquer troca de motor, inclusive esta.
        if (item.prev_breakdown && item.prev_breakdown.valid) {
            return { tax_breakdown: item.prev_breakdown, ...cols }
        }

        const result = results[idx]
        if (!result) return { tax_breakdown: null, ...cols } as ItemSnapshot

        const tax_breakdown = toPersistedBreakdown(
            result,
            consolidated,
            ctx,
            args.discountMode,
            effectiveDate,
        )
        const base = baseline[idx]
        if (base) {
            tax_breakdown.baseline_new_commission = base.new_commission ?? null
            tax_breakdown.baseline_new_profit = base.new_profit ?? null
            tax_breakdown.baseline_ancora_interna = base.ancora_interna ?? null
        }

        return { tax_breakdown, ...cols }
    })
}
