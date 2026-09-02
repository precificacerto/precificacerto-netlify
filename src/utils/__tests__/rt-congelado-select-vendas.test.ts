/**
 * O RT congelado do D8 não chegava à venda pela rota de Vendas — a coluna não era pedida.
 *
 * DEFEITO: o `select` de `budget_items` em `vendas/index.tsx` era escrito à mão e omitia
 * `rt_pct`. `resolveInheritedRtPctDecimal` recebia `undefined`, a precedência "origem antes
 * do cadastro" nunca disparava, e a venda nascia com a alíquota ATUAL do cadastro no lugar da
 * CONGELADA no item do orçamento. A rota irmã (`orcamentos/index.tsx`) lia a coluna, porque
 * usa `select('*')`.
 *
 * Mesma assinatura do D12: o documento derivado deixa de herdar o valor congelado e volta a
 * consultar o cadastro vivo.
 *
 * Nada falhava. Um `select` que não pede o que o mapeador lê não quebra nem avisa — o campo
 * só chega vazio, e o fallback assume.
 *
 * ESTADO NO MOMENTO DA CORREÇÃO: ARMADO, NÃO MATERIALIZADO. As 154 linhas de `budget_items`
 * em produção têm `rt_pct = 0` — todas anteriores ao D8 — e a regra do D8 prefere a origem só
 * quando ela é positiva, então os dois caminhos davam o mesmo resultado. Do primeiro orçamento
 * salvo com RT > 0 em diante, a divergência apareceria.
 *
 * A CORREÇÃO NÃO É A COLUNA: é tirar a lista da mão. `BUDGET_ITEM_COLUMNS_FOR_SALE` vive ao
 * lado do mapeamento, e o primeiro teste abaixo amarra as duas metades — acrescentar um campo
 * ao mapeador sem acrescentá-lo ao `select` passa a quebrar o build. Corrigir só a instância
 * deixaria a classe do defeito intacta.
 *
 * REGRA FIXA: toda correção na Venda no Balcão testa PRODUTO e SERVIÇO, sempre.
 */

import {
    BUDGET_ITEM_COLUMNS_FOR_SALE,
    BUDGET_ITEM_SELECT_FOR_SALE,
    mapBudgetItemsToSaleItems,
    type BudgetItemForSale,
    type SaleItemRow,
} from '@/utils/budget-item-to-sale-item'
import type { TenantSnapshotContext } from '@/lib/items-snapshot'
import type { RtCatalogEntry } from '@/utils/balcao-rt'

const CTX: TenantSnapshotContext = {
    regime: 'SIMPLES_NACIONAL',
    rates: [],
    csll_pct: 0,
    irpj_pct: 0,
    use_snapshot_rates: false,
}

/** Cadastro VIVO — o RT de hoje, que pode já não ser o do dia do orçamento. */
const PRODUTOS: RtCatalogEntry[] = [{ id: 'prod-1', rt_reserve_percent: 3 }]
const SERVICOS: RtCatalogEntry[] = [{ id: 'svc-1', rt_reserve_percent: 4 }]

/** RT CONGELADO no item do orçamento, no dia em que ele foi feito. */
const RT_CONGELADO_PRODUTO = 0.01   // cadastro hoje: 3%
const RT_CONGELADO_SERVICO = 0.02   // cadastro hoje: 4%

const PRODUTO: BudgetItemForSale = {
    product_id: 'prod-1',
    service_id: null,
    quantity: 2,
    unit_price: 100,
    discount: 0,
    commission_pct: 0.05,
    profit_pct: 0.15,
    rt_pct: RT_CONGELADO_PRODUTO,
}
const SERVICO: BudgetItemForSale = {
    product_id: null,
    service_id: 'svc-1',
    quantity: 1,
    unit_price: 150,
    discount: 0,
    commission_pct: 0.4,
    profit_pct: 0.1,
    rt_pct: RT_CONGELADO_SERVICO,
}

function mapear(items: BudgetItemForSale[]): SaleItemRow[] {
    return mapBudgetItemsToSaleItems(items, {
        saleId: 'sale-1',
        snapshotCtx: CTX,
        products: PRODUTOS,
        services: SERVICOS,
    })
}

/**
 * O `select` DEFEITUOSO, reproduzido pelo efeito que tinha: a coluna não vinha, então o campo
 * simplesmente não existia no objeto devolvido pelo Supabase.
 */
function comoChegavaAntes(items: BudgetItemForSale[]): SaleItemRow[] {
    return mapear(items.map(({ rt_pct: _ausente, ...resto }) => resto))
}

describe('A causa · o select deixou de ser escrito à mão', () => {
    it('a lista de colunas cobre TODO campo que o mapeamento lê', () => {
        // É esta asserção que impede o defeito de voltar. `BudgetItemForSale` é o contrato do
        // que o mapeador consome; se um campo entrar lá e não aqui, este teste quebra antes de
        // alguém descobrir em produção que a venda nasceu com o valor errado.
        const contratoDoMapeamento: Array<keyof BudgetItemForSale> = [
            'product_id', 'service_id', 'quantity', 'unit_price', 'discount',
            'manual_description', 'commission_pct', 'profit_pct', 'rt_pct', 'tax_breakdown',
            // D-A: o destino congelado do item do orçamento entrou no contrato, e esta
            // asserção é o que garante que ele entre também no `select`.
            'destination_snapshot',
        ]
        for (const campo of contratoDoMapeamento) {
            expect(BUDGET_ITEM_COLUMNS_FOR_SALE).toContain(campo)
        }
        expect(BUDGET_ITEM_COLUMNS_FOR_SALE).toHaveLength(contratoDoMapeamento.length)
    })

    it('`rt_pct` está na lista — a coluna que faltava', () => {
        expect(BUDGET_ITEM_COLUMNS_FOR_SALE).toContain('rt_pct')
        expect(BUDGET_ITEM_SELECT_FOR_SALE).toContain('rt_pct')
    })

    it('a string do select tem o formato que o Supabase espera', () => {
        expect(BUDGET_ITEM_SELECT_FOR_SALE).toBe(
            'product_id, service_id, quantity, unit_price, discount, manual_description, commission_pct, profit_pct, rt_pct, tax_breakdown, destination_snapshot',
        )
    })
})

describe('O efeito · RT congelado atravessa para a venda — PRODUTO e SERVIÇO', () => {
    it('PRODUTO: vale o RT do item do orçamento, não o do cadastro de hoje', () => {
        const [linha] = mapear([PRODUTO])
        expect(linha.rt_pct).toBe(RT_CONGELADO_PRODUTO)
        expect(linha.rt_pct).not.toBe(0.03)
    })

    it('SERVIÇO: idem — o congelamento não é privilégio de produto', () => {
        const [linha] = mapear([SERVICO])
        expect(linha.rt_pct).toBe(RT_CONGELADO_SERVICO)
        expect(linha.rt_pct).not.toBe(0.04)
    })

    it('os dois no mesmo orçamento: cada um com o seu, sem contaminação', () => {
        const [p, s] = mapear([PRODUTO, SERVICO])
        expect(p.rt_pct).toBe(RT_CONGELADO_PRODUTO)
        expect(s.rt_pct).toBe(RT_CONGELADO_SERVICO)
    })

    it('nenhum outro campo dependia da coluna — o defeito era só do RT', () => {
        const antes = comoChegavaAntes([PRODUTO, SERVICO])
        const agora = mapear([PRODUTO, SERVICO])
        antes.forEach((linha, i) => {
            const { rt_pct: _a, ...restoAntes } = linha
            const { rt_pct: _b, ...restoAgora } = agora[i]
            expect(restoAntes).toEqual(restoAgora)
        })
    })
})

describe('A regressão · como era antes da correção', () => {
    it('PRODUTO: sem a coluna, entrava a alíquota do cadastro no lugar da congelada', () => {
        expect(comoChegavaAntes([PRODUTO])[0].rt_pct).toBe(0.03)      // o defeito
        expect(mapear([PRODUTO])[0].rt_pct).toBe(RT_CONGELADO_PRODUTO) // corrigido
    })

    it('SERVIÇO: mesmo defeito, mesma correção', () => {
        expect(comoChegavaAntes([SERVICO])[0].rt_pct).toBe(0.04)
        expect(mapear([SERVICO])[0].rt_pct).toBe(RT_CONGELADO_SERVICO)
    })

    it('ARMADO, NÃO MATERIALIZADO: com rt_pct = 0 os dois caminhos davam o mesmo', () => {
        // Estado das 154 linhas de `budget_items` em produção, todas anteriores ao D8. A
        // regra do D8 prefere a origem só quando ela é positiva, então zero e ausente se
        // comportavam igual — é por isso que a correção não move nenhuma venda existente.
        const zerados = [{ ...PRODUTO, rt_pct: 0 }, { ...SERVICO, rt_pct: 0 }]
        expect(mapear(zerados)).toEqual(comoChegavaAntes(zerados))
        expect(mapear(zerados)[0].rt_pct).toBe(0.03)
        expect(mapear(zerados)[1].rt_pct).toBe(0.04)
    })

    it('a cura do legado continua valendo: linha nunca gravada busca o cadastro', () => {
        // Condição de validade registrada no D8: preferir a origem só quando positiva faz o
        // histórico legado se curar pelo cadastro em vez de propagar zero para sempre. A
        // correção do `select` não mexe nisso — só faz o valor congelado chegar quando existe.
        expect(mapear([{ ...PRODUTO, rt_pct: 0 }])[0].rt_pct).toBe(0.03)
        expect(mapear([{ ...SERVICO, rt_pct: null }])[0].rt_pct).toBe(0.04)
    })
})
