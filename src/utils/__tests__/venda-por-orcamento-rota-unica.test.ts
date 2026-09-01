/**
 * Orçamento → venda: uma rota, um mapeamento.
 *
 * Existiam DUAS cópias do mapeamento `budget_items` → `sale_items`, uma em
 * `orcamentos/index.tsx` e outra em `vendas/index.tsx`. Elas divergiram: a de Orçamentos
 * perdeu `service_id`, a herança fiscal e a descrição do item manual, e o item de serviço
 * passou a nascer como linha órfã. Aquilo foi corrigido extraindo o mapeamento para
 * `budget-item-to-sale-item.ts` — mas só a rota de Orçamentos passou a usá-lo; a de Vendas
 * seguiu com a cópia. Duas cópias de uma regra divergem: é questão de tempo, não de
 * disciplina.
 *
 * Este PR adota o módulo também em Vendas. É REFATORAÇÃO SEM MUDANÇA DE COMPORTAMENTO: as
 * duas implementações produzem a mesma linha, campo a campo, e é isso que os testes abaixo
 * fixam — a cópia removida está reproduzida aqui como oráculo.
 *
 * ⚠️ DEFEITO CONHECIDO, FORA DESTE PR: o `select` de `budget_items` da rota de Vendas não
 * pede `rt_pct`, então `resolveInheritedRtPctDecimal` recebe `undefined` e cai sempre no
 * cadastro vivo, ignorando o RT congelado do D8. Mesma assinatura do D12. ARMADO, NÃO
 * MATERIALIZADO: as 154 linhas em produção têm `rt_pct = 0`, todas anteriores ao D8, e a
 * regra do D8 prefere a origem só quando positiva — hoje o resultado é o mesmo. Corrigir
 * aqui mudaria comportamento e misturaria dois defeitos num PR; vai no seu próprio.
 *
 * REGRA FIXA: toda correção na Venda no Balcão testa PRODUTO e SERVIÇO, sempre.
 */

import {
    mapBudgetItemsToSaleItems,
    type BudgetItemForSale,
    type SaleItemRow,
} from '@/utils/budget-item-to-sale-item'
import { hydrateItemSnapshot, type TenantSnapshotContext } from '@/lib/items-snapshot'
import { resolveInheritedRtPctDecimal, type RtCatalogEntry } from '@/utils/balcao-rt'
import type { TaxBreakdown } from '@/types/mrm'

const CTX: TenantSnapshotContext = {
    regime: 'SIMPLES_NACIONAL',
    rates: [],
    csll_pct: 0,
    irpj_pct: 0,
    use_snapshot_rates: false,
}

const PRODUTOS: RtCatalogEntry[] = [{ id: 'prod-1', rt_reserve_percent: 3 }]
const SERVICOS: RtCatalogEntry[] = [{ id: 'svc-1', rt_reserve_percent: 4 }]

const SNAPSHOT_DO_ORCAMENTO = {
    status: 'VALID',
    valid: true,
    rro: 100,
    new_commission: 20,
    new_profit: 60,
} as unknown as TaxBreakdown

const PRODUTO: BudgetItemForSale = {
    product_id: 'prod-1',
    service_id: null,
    quantity: 2,
    unit_price: 100,
    discount: 5,
    commission_pct: 0.05,
    profit_pct: 0.15,
    tax_breakdown: SNAPSHOT_DO_ORCAMENTO,
}
const SERVICO: BudgetItemForSale = {
    product_id: null,
    service_id: 'svc-1',
    quantity: 1,
    unit_price: 150,
    discount: 0,
    commission_pct: 0.4,
    profit_pct: 0.1,
    tax_breakdown: SNAPSHOT_DO_ORCAMENTO,
}
const MANUAL: BudgetItemForSale = {
    product_id: null,
    service_id: null,
    quantity: 1,
    unit_price: 80,
    discount: 0,
    manual_description: 'Frete do cliente',
}
const TODOS = [PRODUTO, SERVICO, MANUAL]

const SALE_ID = 'sale-1'

/**
 * A CÓPIA REMOVIDA, reproduzida literalmente — inclusive o `bi.rt_pct` que chegava
 * `undefined` porque o `select` não pedia a coluna. É o oráculo: a refatoração é correta
 * exatamente na medida em que o módulo produz isto.
 */
function mapeamentoAntigoDeVendas(budgetItems: BudgetItemForSale[]): SaleItemRow[] {
    return budgetItems.map((bi) => {
        const snap = hydrateItemSnapshot(
            {
                unit_price: bi.unit_price as number,
                quantity: bi.quantity as number,
                commission_pct: Number(bi.commission_pct ?? 0),
                profit_pct: Number(bi.profit_pct ?? 0),
                prev_breakdown: bi.tax_breakdown ?? null,
            },
            CTX,
        )
        return {
            sale_id: SALE_ID,
            product_id: bi.product_id || null,
            service_id: bi.service_id || null,
            quantity: bi.quantity as number,
            unit_price: bi.unit_price as number,
            discount: bi.discount || 0,
            description: bi.manual_description || null,
            commission_pct: snap.commission_pct,
            profit_pct: snap.profit_pct,
            rt_pct: resolveInheritedRtPctDecimal(bi.rt_pct, bi, PRODUTOS, SERVICOS),
            tax_breakdown: snap.tax_breakdown,
        }
    })
}

function mapear(items: BudgetItemForSale[]): SaleItemRow[] {
    return mapBudgetItemsToSaleItems(items, {
        saleId: SALE_ID,
        snapshotCtx: CTX,
        products: PRODUTOS,
        services: SERVICOS,
    })
}

describe('Refatoração sem mudança de comportamento', () => {
    it('PRODUTO: o módulo produz a MESMA linha que a cópia removida', () => {
        expect(mapear([PRODUTO])).toEqual(mapeamentoAntigoDeVendas([PRODUTO]))
    })

    it('SERVIÇO: idem — campo a campo', () => {
        expect(mapear([SERVICO])).toEqual(mapeamentoAntigoDeVendas([SERVICO]))
    })

    it('item manual: idem', () => {
        expect(mapear([MANUAL])).toEqual(mapeamentoAntigoDeVendas([MANUAL]))
    })

    it('os três juntos, na ordem, sem interferência entre linhas', () => {
        expect(mapear(TODOS)).toEqual(mapeamentoAntigoDeVendas(TODOS))
    })

    it('a única divergência é no caso degenerado — e o módulo é o lado correto', () => {
        // Linha sem `quantity` nem `unit_price`. As duas colunas são NULLABLE em
        // `budget_items` (com default 1 e 0), e nenhuma das 154 linhas em produção é nula,
        // então o caso não é alcançável hoje — mas é alcançável em princípio.
        //
        // A cópia antiga repassava os dois campos CRUS, gravando `undefined` em
        // `sale_items.quantity` e `sale_items.unit_price`. O módulo coage com
        // `Number(...) || 0`. Onde os dois diferem, quem está certo é o módulo: inserir
        // `undefined` numa coluna numérica é defeito, não comportamento a preservar.
        const cru: BudgetItemForSale[] = [{ product_id: 'prod-1' }, { service_id: 'svc-1' }, {}]
        const antigo = mapeamentoAntigoDeVendas(cru)
        const novo = mapear(cru)

        expect(antigo[0].quantity).toBeUndefined()
        expect(antigo[0].unit_price).toBeUndefined()
        expect(novo[0].quantity).toBe(0)
        expect(novo[0].unit_price).toBe(0)

        // Fora desses dois campos, tudo o mais é idêntico.
        const semNumericos = (linhas: SaleItemRow[]) =>
            linhas.map(({ quantity: _q, unit_price: _u, ...resto }) => resto)
        expect(semNumericos(novo)).toEqual(semNumericos(antigo))

        // E nenhuma linha do módulo sai com undefined ou NaN.
        for (const linha of novo) {
            for (const valor of Object.values(linha)) {
                expect(valor).not.toBeUndefined()
                expect(Number.isNaN(valor as number)).toBe(false)
            }
        }
    })

    it('com quantity e unit_price presentes — todas as linhas reais — a igualdade é total', () => {
        const reais: BudgetItemForSale[] = [
            { product_id: 'prod-1', quantity: 1, unit_price: 0 },
            { service_id: 'svc-1', quantity: 3, unit_price: 99.9 },
            { quantity: 1, unit_price: 10, manual_description: 'x' },
        ]
        expect(mapear(reais)).toEqual(mapeamentoAntigoDeVendas(reais))
    })
})

describe('O que a rota única garante daqui em diante', () => {
    it('PRODUTO e SERVIÇO chegam completos e distinguíveis, e o manual também', () => {
        const [p, s, m] = mapear(TODOS)
        expect({ product_id: p.product_id, service_id: p.service_id }).toEqual({ product_id: 'prod-1', service_id: null })
        expect({ product_id: s.product_id, service_id: s.service_id }).toEqual({ product_id: null, service_id: 'svc-1' })
        expect({ product_id: m.product_id, service_id: m.service_id }).toEqual({ product_id: null, service_id: null })
        expect(m.description).toBe('Frete do cliente')
    })

    it('herança fiscal atravessa nos dois tipos — o que a outra rota já tinha perdido uma vez', () => {
        const [p, s] = mapear([PRODUTO, SERVICO])
        expect(p.commission_pct).toBe(0.05)
        expect(p.profit_pct).toBe(0.15)
        expect(s.commission_pct).toBe(0.4)
        expect(s.profit_pct).toBe(0.1)
    })

    it('o contrato da linha é um só: acrescentar um campo passa a valer para as duas telas', () => {
        const contrato = [
            'sale_id', 'product_id', 'service_id', 'quantity', 'unit_price', 'discount',
            'description', 'commission_pct', 'profit_pct', 'rt_pct', 'tax_breakdown',
        ].sort()
        for (const linha of mapear(TODOS)) {
            expect(Object.keys(linha).sort()).toEqual(contrato)
        }
    })

    it('as duas telas produzem a mesma linha para o mesmo orçamento', () => {
        // O que difere entre os fluxos é só o `sale_id` da venda criada em cada um.
        const porVendas = mapBudgetItemsToSaleItems(TODOS, { saleId: 'sale-vendas', snapshotCtx: CTX, products: PRODUTOS, services: SERVICOS })
        const porOrcamentos = mapBudgetItemsToSaleItems(TODOS, { saleId: 'sale-orcamentos', snapshotCtx: CTX, products: PRODUTOS, services: SERVICOS })
        // `sale_id: ''` e não `null`: o campo é `string` no contrato, e `null` aqui daria
        // TS7018 (propriedade implicitamente `any`) sem acrescentar nada à asserção.
        const semSaleId = (linhas: SaleItemRow[]) => linhas.map((l) => ({ ...l, sale_id: '' }))
        expect(semSaleId(porVendas)).toEqual(semSaleId(porOrcamentos))
    })
})

describe('Defeito registrado, NÃO corrigido aqui · rt_pct fora do select', () => {
    /**
     * O RT congelado no item do orçamento (D8) não chega à rota de Vendas porque a coluna
     * não é pedida no `select`. Estes testes documentam o estado ATUAL — se um deles
     * quebrar, é porque a correção entrou, e ela tem PR próprio.
     */
    const RT_CONGELADO_PRODUTO = 0.01   // cadastro vivo está em 3%
    const RT_CONGELADO_SERVICO = 0.02   // cadastro vivo está em 4%

    it('com a coluna ausente (estado atual), vale o cadastro vivo — PRODUTO e SERVIÇO', () => {
        // É o que o Supabase devolve hoje: o campo simplesmente não vem.
        const [p] = mapear([PRODUTO])
        const [s] = mapear([SERVICO])
        expect(p.rt_pct).toBe(0.03)
        expect(s.rt_pct).toBe(0.04)
    })

    it('com a coluna presente, o congelado venceria — a correção é só trazer o campo', () => {
        const [p] = mapear([{ ...PRODUTO, rt_pct: RT_CONGELADO_PRODUTO }])
        const [s] = mapear([{ ...SERVICO, rt_pct: RT_CONGELADO_SERVICO }])
        expect(p.rt_pct).toBe(RT_CONGELADO_PRODUTO)
        expect(s.rt_pct).toBe(RT_CONGELADO_SERVICO)
    })

    it('ARMADO, NÃO MATERIALIZADO: com rt_pct = 0 os dois caminhos dão o mesmo', () => {
        // Estado das 154 linhas em produção, todas anteriores ao D8. A regra do D8 prefere
        // a origem só quando positiva, então zero e ausente se comportam igual — é por isso
        // que o defeito não é visível hoje.
        const zerados = [{ ...PRODUTO, rt_pct: 0 }, { ...SERVICO, rt_pct: 0 }]
        const ausentes = [PRODUTO, SERVICO]
        expect(mapear(zerados)).toEqual(mapear(ausentes))
    })
})
