/**
 * destino-propagacao-pedido.test.ts — o `destination_snapshot` precisa ATRAVESSAR o pedido.
 *
 * O DEFEITO (medido em 05/09/2026, pareando cada item de destino com o `budget_item` de
 * origem do mesmo produto/serviço):
 *
 *   orçamento → pedido   23 pares,  6 com origem preenchida,  0 preservaram,  6 perderam
 *   orçamento → venda    41 pares,  2 com origem preenchida,  2 preservaram,  0 perderam
 *
 * RESSALVA DE AMOSTRA: o lado da venda tem n = 2. Está DEMONSTRADO funcionando em 2 de 2,
 * NÃO provado. O que a medição afirma é que não há perda observada na venda e há perda total
 * no pedido — não que a venda esteja correta.
 *
 * Eram TRÊS vazamentos independentes, não um:
 *   1. o `.select()` da conversão não pedia a coluna (é o que produziu os 6 de 6);
 *   2. `fetchOrderItems` buscava a coluna e a descartava no mapeamento, então o save da
 *      edição regravava NULL sobre um snapshot que existisse;
 *   3. o espelho pedido→orçamento não mencionava o campo — caminho ARMADO, NÃO
 *      MATERIALIZADO: percorrido 2 vezes (4 itens de venda), nenhuma origem com snapshot.
 *
 * A classe é `fato-vs-referencia`: sem o snapshot o documento volta a resolver o destino pela
 * matriz do `calc_type` ATUAL, que é o que o D-A eliminou.
 */

import fs from 'fs'
import path from 'path'
import {
    BUDGET_ITEM_COLUMNS_FOR_ORDER,
    BUDGET_ITEM_SELECT_FOR_ORDER,
    mapBudgetItemsToOrderItems,
    type BudgetItemForOrder,
} from '../budget-item-to-order-item'
import { buildDestinationSnapshot } from '../destination-snapshot'
import type { RtCatalogEntry } from '../balcao-rt'

const SRC = path.resolve(__dirname, '../..')
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8')

const SEM_CATALOGO: { products: RtCatalogEntry[]; services: RtCatalogEntry[] } = {
    products: [],
    services: [],
}

const snapshotProduto = buildDestinationSnapshot({
    construction: 'REVENDA',
    tenantCalcType: 'REVENDA',
    gravadoEm: '2026-09-05T00:44:00.000Z',
})
const snapshotServico = buildDestinationSnapshot({
    construction: 'SERVICO',
    tenantCalcType: 'SERVICO',
    gravadoEm: '2026-09-05T00:44:00.000Z',
})

describe('A causa · o select deixou de ser escrito à mão', () => {
    it('a lista de colunas cobre TODO campo que o mapeamento lê', () => {
        // É esta asserção que impede o defeito de voltar: `BudgetItemForOrder` é o contrato do
        // que o mapeador consome, e um campo que entre lá sem entrar aqui quebra o build,
        // em vez de chegar vazio em silêncio.
        const contratoDoMapeamento: Array<keyof BudgetItemForOrder> = [
            'product_id', 'service_id', 'quantity', 'unit_price', 'manual_description',
            'commission_pct', 'profit_pct', 'rt_pct', 'tax_breakdown',
            'destination_snapshot',
        ]
        for (const campo of contratoDoMapeamento) {
            expect(BUDGET_ITEM_COLUMNS_FOR_ORDER).toContain(campo)
        }
        expect(BUDGET_ITEM_COLUMNS_FOR_ORDER).toHaveLength(contratoDoMapeamento.length)
    })

    it('`destination_snapshot` está na lista — a coluna que faltava', () => {
        expect(BUDGET_ITEM_COLUMNS_FOR_ORDER).toContain('destination_snapshot')
        expect(BUDGET_ITEM_SELECT_FOR_ORDER).toContain('destination_snapshot')
    })

    it('a conversão usa o contrato, não uma lista à mão', () => {
        const arquivo = read('pages/orcamentos/index.tsx')
        expect(arquivo).toContain('BUDGET_ITEM_SELECT_FOR_ORDER')
        expect(arquivo).toContain('mapBudgetItemsToOrderItems')
    })
})

describe('Vazamento 1 · orçamento → pedido', () => {
    it('PRODUTO com destino congelado atravessa', () => {
        const itens: BudgetItemForOrder[] = [
            { product_id: 'p1', quantity: 2, unit_price: 10, destination_snapshot: snapshotProduto },
        ]
        const [linha] = mapBudgetItemsToOrderItems(itens, 'ord-1', SEM_CATALOGO)
        expect(linha.destination_snapshot).toEqual(snapshotProduto)
        expect(linha.total_price).toBe(20)
    })

    it('SERVIÇO com destino congelado atravessa', () => {
        const itens: BudgetItemForOrder[] = [
            { service_id: 's1', quantity: 1, unit_price: 363.24, destination_snapshot: snapshotServico },
        ]
        const [linha] = mapBudgetItemsToOrderItems(itens, 'ord-1', SEM_CATALOGO)
        expect(linha.destination_snapshot).toEqual(snapshotServico)
        expect(linha.service_id).toBe('s1')
        expect(linha.product_id).toBeNull()
    })

    it('item legado sem snapshot continua NULL — e NULL nunca é o destino FORA', () => {
        const itens: BudgetItemForOrder[] = [{ product_id: 'p1', quantity: 1, unit_price: 5 }]
        const [linha] = mapBudgetItemsToOrderItems(itens, 'ord-1', SEM_CATALOGO)
        expect(linha.destination_snapshot).toBeNull()
    })

    it('item manual entra sem snapshot: não há cadastro de origem', () => {
        const itens: BudgetItemForOrder[] = [
            { manual_description: 'Frete', quantity: 1, unit_price: 80 },
        ]
        const [linha] = mapBudgetItemsToOrderItems(itens, 'ord-1', SEM_CATALOGO)
        expect(linha.destination_snapshot).toBeNull()
        expect(linha.manual_description).toBe('Frete')
    })

    // O DEFEITO REPRODUZIDO: o `select` sem a coluna faz o campo não existir no objeto que o
    // Supabase devolve — não chega `null`, chega ausente. É o que produziu 6 de 6.
    it('reproduz a perda: coluna ausente do objeto vira NULL gravado', () => {
        const comoChegavaAntes = (bi: BudgetItemForOrder): BudgetItemForOrder => {
            const copia = { ...bi }
            delete copia.destination_snapshot
            return copia
        }
        const itens = [
            { product_id: 'p1', quantity: 1, unit_price: 10, destination_snapshot: snapshotProduto },
            { service_id: 's1', quantity: 1, unit_price: 20, destination_snapshot: snapshotServico },
        ]
        const antes = mapBudgetItemsToOrderItems(itens.map(comoChegavaAntes), 'ord-1', SEM_CATALOGO)
        expect(antes.map((l) => l.destination_snapshot)).toEqual([null, null])

        const depois = mapBudgetItemsToOrderItems(itens, 'ord-1', SEM_CATALOGO)
        expect(depois.map((l) => l.destination_snapshot)).toEqual([snapshotProduto, snapshotServico])
    })

    it('mistura: item congelado e item legado, cada um pelo seu caminho', () => {
        const itens: BudgetItemForOrder[] = [
            { service_id: 's1', quantity: 1, unit_price: 363.24, destination_snapshot: snapshotServico },
            { product_id: 'p1', quantity: 1, unit_price: 2.58 },
        ]
        const linhas = mapBudgetItemsToOrderItems(itens, 'ord-1', SEM_CATALOGO)
        expect(linhas[0].destination_snapshot).toEqual(snapshotServico)
        expect(linhas[1].destination_snapshot).toBeNull()
    })
})

describe('Vazamento 2 · o mapeamento de `fetchOrderItems` carregava a coluna e a jogava fora', () => {
    // O `select` já pedia `destination_snapshot`; o objeto montado não tinha o campo, e a
    // interface também não. `readSnapshotColumn(it)` no save lia um objeto que
    // ESTRUTURALMENTE nunca o teria: editar um pedido apagava o snapshot.
    const arquivo = () => read('pages/pedidos/index.tsx')

    it('a interface do item do pedido declara o campo', () => {
        const i = arquivo().indexOf('interface OrderItemRow')
        expect(i).toBeGreaterThanOrEqual(0)
        expect(arquivo().slice(i, i + 1400)).toContain('destination_snapshot')
    })

    it('o mapeamento devolve o campo', () => {
        const i = arquivo().indexOf('const fetchOrderItems')
        expect(i).toBeGreaterThanOrEqual(0)
        const trecho = arquivo().slice(i, i + 2600)
        expect(trecho).toContain("destination_snapshot: it.destination_snapshot ?? null")
    })
})

describe('Vazamento 3 · o espelho pedido → orçamento', () => {
    // ARMADO, NÃO MATERIALIZADO. O vínculo real do pedido com a venda é
    // `budgets.source_order_id` — `sales.order_id` existe mas nenhum caminho do código a
    // escreve. Por esse vínculo o caminho já foi percorrido 2 vezes (4 itens de venda dos
    // 111), e a perda não apareceu só porque nenhuma origem carregava snapshot: n = 0 pares
    // com origem preenchida. O caminho está em uso; o dano ainda não.
    it('o mapeamento do espelho copia o destino do item do pedido', () => {
        const arquivo = read('pages/pedidos/index.tsx')
        const i = arquivo.indexOf('const budgetItems = items.map((it)')
        expect(i).toBeGreaterThanOrEqual(0)
        // Janela ampliada: o PR da cobertura acrescentou o `motorInput` entre a âncora e esta
        // linha. A asserção é a mesma — o espelho continua copiando o destino do item.
        expect(arquivo.slice(i, i + 4200)).toContain('destination_snapshot: readSnapshotColumn(it)')
    })
})
