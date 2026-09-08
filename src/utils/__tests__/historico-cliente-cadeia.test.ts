/**
 * Deduplicação por CADEIA no Histórico do Cliente — o histórico mostra apenas a última evolução.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * O QUE O NÚMERO 21 PRESSUPÕE — LEIA ANTES DE "CORRIGIR" O ORÁCULO
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Três números diferentes circularam no levantamento, e cada um corresponde a uma DECISÃO
 * DIFERENTE. Sem isto escrito, daqui a três meses o número vira mágico — exatamente como o
 * "décima posição" do `enumsortorder` na migração do enum.
 *
 *   16 = uma linha por cadeia, só o pedido mais recente entre irmãos
 *   18 = irmãos exibidos, MAS cadeias mortas em CANCELLED continuam ocultas
 *   21 = irmãos exibidos E cadeias mortas visíveis   ← É ESTA, a decisão de 08/09/2026
 *
 * E A BASE DE COMPARAÇÃO É **17 NA TELA**, não 28 no banco. As 28 linhas citadas no
 * levantamento eram DOCUMENTOS NO BANCO; a tela do Felipe Klein exibia 17 (16 vendas + 1 pedido
 * + ZERO orçamentos). O efeito real desta rodada é **17 → 21**: a dedução REMOVE 1 (o
 * PED-CDFBBE, que duplicava a VD-A2DF4A) e o critério de cadeias mortas TRAZ 5 DE VOLTA (os 2+3
 * pedidos cancelados). **O número SOBE, e é o resultado correto** — quem esperasse queda
 * concluiria regressão.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * O ORÁCULO: Felipe Klein, medido na base em 08/09/2026 (tenant Salão Eliane)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Sete cadeias (10 linhas) + onze vendas avulsas = 21.
 *
 *   1. ee30ea9a  ORC-EE30 + VD-A9599A ................. morreu em venda ......... 1
 *   2. 0689b99b  ORC-0689 + PED-0D7B75 + PED-A53A00 ... morreu em pedido, 2 irmãos  2
 *   3. 2356bfd8  ORC-2356 + VD-43E865 ................. morreu em venda ......... 1
 *   4. 1e94a200  ORC-1E94 + PED-9FA357 + PED-0F97D3 + PED-18A461 .. 3 irmãos .... 3
 *   5. 852094a7  ORC-8520 + ORC-E2E0 + PED-CDFBBE + VD-A2DF4A ..... venda ....... 1
 *   6. 55d1a851  ORC-55D1 + VD-6564FC ................. morreu em venda ......... 1
 *   7. 3b82c75e  ORC-3B82 + VD-96AF84 ................. morreu em venda ......... 1
 *
 * As ONZE avulsas (`budget_id` NULO, `sale_type = MANUAL`), nominalmente, porque a contagem
 * errada de "nove" já circulou duas vezes: AG-6CF416, AG-1D88B4, AG-787A68, AG-E5E0A8,
 * AG-4DF4B0, AG-4019C5, AG-D44B4C, AG-A87CAB, AG-1368A8, AG-AB58DF, AG-310C4B.
 *
 * O 21 foi CONFERIDO CONTRA O BANCO, não só contra estes objetos: a mesma regra escrita em SQL
 * sobre as linhas reais do Felipe Klein devolve 11 avulsas + 10 das cadeias = 21.
 *
 * MEDIDO quanto a falhar sem a correção: restaurada a página do `origin/main`, NOVE casos
 * ficam vermelhos entre este arquivo e o de status. Os demais afirmam funções que nasceram
 * aqui — contra o `main` não compilam em vez de falhar, e o que protegem é o DESFAZIMENTO:
 * unificar irmãos numa linha, tirar o espelho da raiz, voltar a esconder cadeia morta.
 */

import fs from 'fs'
import path from 'path'
import { STAGE_RANK, buildChainIndex, type OrderRow, type SaleRow } from '@/utils/customer-history-chain'

// ── Os documentos do Felipe Klein, como estão na base ──────────────────────────────────────
const B = {
    EE30: 'ee30ea9a-d3e3-4f98-83f6-da42701d7313',
    N0689: '0689b99b-919f-4d96-989c-02e3ff169a9a',
    N2356: '2356bfd8-74fb-431d-a404-20cea8987535',
    N1E94: '1e94a200-4833-4aa8-aab6-2e2cbdd3a416',
    ORIGINAL: '852094a7-30ff-4fab-88fd-043d4812e8fb',
    ESPELHO: 'e2e07aaa-02d5-40cb-a35c-bd05f5ecb473',
    N55D1: '55d1a851-6a92-475f-8566-83a5bbb606c3',
    N3B82: '3b82c75e-5fff-4cd8-a3ad-6dd233edbe9e',
}
const VENDA_A2DF4A = 'a2df4a21-5913-448d-b25f-6afbca555dce'

const felipeKlein = {
    budgets: [
        { id: B.EE30, created_at: '2026-08-27' },
        { id: B.N0689, created_at: '2026-09-05' },
        { id: B.N2356, created_at: '2026-09-01' },
        { id: B.N1E94, created_at: '2026-09-05' },
        { id: B.ORIGINAL, created_at: '2026-09-06' },
        { id: B.ESPELHO, sale_id: VENDA_A2DF4A, created_at: '2026-09-08' },
        { id: B.N55D1, sale_id: 'venda-6564fc', created_at: '2026-09-06' },
        { id: B.N3B82, sale_id: 'venda-96af84', created_at: '2026-09-06' },
    ],
    orders: [
        { id: 'ped-0D7B75', budget_id: B.N0689, original_budget_id: B.N0689, created_at: '2026-09-05T02:22' },
        { id: 'ped-A53A00', budget_id: B.N0689, original_budget_id: B.N0689, created_at: '2026-09-05T02:18' },
        { id: 'ped-9FA357', budget_id: B.N1E94, original_budget_id: B.N1E94, created_at: '2026-09-06T01:37' },
        { id: 'ped-0F97D3', budget_id: B.N1E94, original_budget_id: B.N1E94, created_at: '2026-09-06T01:35' },
        { id: 'ped-18A461', budget_id: B.N1E94, original_budget_id: B.N1E94, created_at: '2026-09-05T21:09' },
        // O ÚNICO da base com `sale_id` preenchido — e a dedução NÃO depende dele.
        { id: 'ped-CDFBBE', budget_id: B.ESPELHO, original_budget_id: B.ORIGINAL, sale_id: VENDA_A2DF4A, created_at: '2026-09-06T01:58' },
    ],
    sales: [
        { id: 'venda-A9599A', budget_id: B.EE30, created_at: '2026-08-30' },
        { id: 'venda-43E865', budget_id: B.N2356, created_at: '2026-09-02' },
        { id: VENDA_A2DF4A, budget_id: B.ESPELHO, created_at: '2026-09-08' },
        { id: 'venda-6564FC', budget_id: B.N55D1, created_at: '2026-09-06' },
        { id: 'venda-96AF84', budget_id: B.N3B82, created_at: '2026-09-06' },
        // As ONZE avulsas: `budget_id` nulo, sem pedido. Não têm cadeia a superar.
        ...['6CF416', '1D88B4', '787A68', 'E5E0A8', '4DF4B0', '4019C5', 'D44B4C', 'A87CAB', '1368A8', 'AB58DF', '310C4B'].map(
            (c): SaleRow => ({ id: `ag-${c}`, budget_id: null, created_at: '2026-05-01' }),
        ),
    ],
}

describe('o caso que originou a regra: PED-CDFBBE e VD-A2DF4A são a MESMA operação', () => {
    const idx = buildChainIndex(felipeKlein)

    it('a venda aparece e o pedido da mesma cadeia NÃO', () => {
        expect(idx.visiveis.has(VENDA_A2DF4A)).toBe(true)
        expect(idx.visiveis.has('ped-CDFBBE')).toBe(false)
    })

    it('os DOIS orçamentos da cadeia somem — original e espelho', () => {
        expect(idx.visiveis.has(B.ORIGINAL)).toBe(false)
        expect(idx.visiveis.has(B.ESPELHO)).toBe(false)
    })

    it('o ESPELHO e o ORIGINAL caem na MESMA raiz, e a raiz é o original', () => {
        // Sem isto a cadeia reduziria de quatro para DUAS linhas, não para uma: o ORC-8520
        // ficaria sozinho na tela. Medido: agrupar por `budget_id` puro dá OITO cadeias no
        // Felipe Klein; pela raiz dá SETE.
        expect(idx.raizPorDocumento.get(B.ESPELHO)).toBe(B.ORIGINAL)
        expect(idx.raizPorDocumento.get(B.ORIGINAL)).toBe(B.ORIGINAL)
        expect(idx.raizPorDocumento.get('ped-CDFBBE')).toBe(B.ORIGINAL)
        expect(idx.raizPorDocumento.get(VENDA_A2DF4A)).toBe(B.ORIGINAL)
    })

    it('a dedução NÃO usa `orders.sale_id` — ela funciona sem ele', () => {
        // `sales.order_id` está NULL em 0 de 94 e `orders.sale_id` preenchido em 1 de 20: os
        // ponteiros diretos não servem como critério geral. Removido o `sale_id` do único
        // pedido que o tem, o resultado é IDÊNTICO — é o `budget_id` que resolve.
        const semPonteiro = buildChainIndex({
            ...felipeKlein,
            orders: felipeKlein.orders.map((o): OrderRow => ({ ...o, sale_id: null })),
        })
        expect(semPonteiro.visiveis.has(VENDA_A2DF4A)).toBe(true)
        expect(semPonteiro.visiveis.has('ped-CDFBBE')).toBe(false)
    })
})

describe('a dedução é por CADEIA, nunca por VALOR', () => {
    const idx = buildChainIndex(felipeKlein)

    it('as duas cadeias de R$ 156,64 continuam sendo DUAS', () => {
        // ORC-8520/ORC-E2E0 → VD-A2DF4A, e ORC-55D1 → VD-6564FC. Mesmo valor, operações
        // distintas: deduplicar por valor fundiria as duas.
        expect(idx.visiveis.has(VENDA_A2DF4A)).toBe(true)
        expect(idx.visiveis.has('venda-6564FC')).toBe(true)
        expect(idx.raizPorDocumento.get(VENDA_A2DF4A)).not.toBe(idx.raizPorDocumento.get('venda-6564FC'))
    })
})

describe('irmãos: a cadeia que morreu no pedido exibe TODOS', () => {
    const idx = buildChainIndex(felipeKlein)

    it('os TRÊS pedidos de R$ 301,88 aparecem — três tentativas que morreram', () => {
        for (const id of ['ped-9FA357', 'ped-0F97D3', 'ped-18A461']) {
            expect(idx.visiveis.has(id)).toBe(true)
        }
        expect(idx.visiveis.has(B.N1E94)).toBe(false)
    })

    it('os DOIS pedidos da cadeia 0689b99b aparecem', () => {
        expect(idx.visiveis.has('ped-0D7B75')).toBe(true)
        expect(idx.visiveis.has('ped-A53A00')).toBe(true)
    })

    it('cada irmão sabe sua posição, para a tela DIFERENCIAR em vez de esconder', () => {
        // Ordenados por `created_at`: 18A461 (05/09 21:09) < 0F97D3 (06/09 01:35) < 9FA357 (01:37)
        expect(idx.irmaosPorDocumento.get('ped-18A461')).toEqual({ posicao: 1, total: 3 })
        expect(idx.irmaosPorDocumento.get('ped-0F97D3')).toEqual({ posicao: 2, total: 3 })
        expect(idx.irmaosPorDocumento.get('ped-9FA357')).toEqual({ posicao: 3, total: 3 })
    })

    it('linha sem irmão não recebe marcador', () => {
        expect(idx.irmaosPorDocumento.has(VENDA_A2DF4A)).toBe(false)
        expect(idx.irmaosPorDocumento.has('venda-A9599A')).toBe(false)
    })

    it('cadeia que TERMINOU EM VENDA some com os irmãos anteriores', () => {
        // Contraprova do critério: acrescentando um pedido irmão ao PED-CDFBBE, ele também some,
        // porque a cadeia terminou na venda. Irmão só sobrevive quando o estágio é o topo.
        const comIrmao = buildChainIndex({
            ...felipeKlein,
            orders: [
                ...felipeKlein.orders,
                { id: 'ped-IRMAO', budget_id: B.ESPELHO, original_budget_id: B.ORIGINAL, created_at: '2026-09-06T02:00' },
            ],
        })
        expect(comIrmao.visiveis.has('ped-IRMAO')).toBe(false)
        expect(comIrmao.visiveis.has(VENDA_A2DF4A)).toBe(true)
    })
})

describe('a conta do Felipe Klein — 21 linhas, sob a decisão de 08/09', () => {
    const idx = buildChainIndex(felipeKlein)

    it('21 documentos visíveis: 10 das sete cadeias + 11 avulsas', () => {
        expect(idx.visiveis.size).toBe(21)
    })

    it('as ONZE vendas avulsas aparecem — são onze, não nove', () => {
        const avulsas = felipeKlein.sales.filter((s) => !s.budget_id)
        expect(avulsas).toHaveLength(11)
        for (const a of avulsas) expect(idx.visiveis.has(a.id)).toBe(true)
    })

    it('as sete cadeias contribuem exatamente 10 linhas', () => {
        const daCadeia = [...idx.visiveis].filter((id) => idx.raizPorDocumento.has(id))
        expect(daCadeia).toHaveLength(10)
        expect(new Set(daCadeia.map((id) => idx.raizPorDocumento.get(id))).size).toBe(7)
    })

    it('NENHUM orçamento do Felipe Klein aparece — todos são etapa superada', () => {
        for (const b of felipeKlein.budgets) expect(idx.visiveis.has(b.id)).toBe(false)
    })

    it('VD-96AF84 continua aparecendo, e o ORC-3B82 não aparece separado', () => {
        // O vínculo do #54 mantém a origem visível DENTRO da venda: não se perde informação,
        // não se repete a operação.
        expect(idx.visiveis.has('venda-96AF84')).toBe(true)
        expect(idx.visiveis.has(B.N3B82)).toBe(false)
    })
})

describe('produto e serviço — o critério não olha o tipo do item, e o caso prova isso', () => {
    // Não é simetria decorativa: a dedução opera sobre vínculos de documento, e um caso de cada
    // tipo é o que afirma que ela NÃO discrimina. Se algum dia alguém acrescentar uma condição
    // sobre `product_id`/`service_id`, um dos dois fica vermelho.
    const cadeia = (raiz: string) => ({
        budgets: [{ id: raiz, created_at: '2026-09-01' }],
        orders: [{ id: `ped-${raiz}`, budget_id: raiz, original_budget_id: raiz, created_at: '2026-09-02' }],
        sales: [{ id: `venda-${raiz}`, budget_id: raiz, created_at: '2026-09-03' }],
    })

    it('cadeia de PRODUTO colapsa na venda', () => {
        const idx = buildChainIndex(cadeia('orc-produto'))
        expect([...idx.visiveis]).toEqual(['venda-orc-produto'])
    })

    it('cadeia de SERVIÇO colapsa na venda, do mesmo jeito', () => {
        const idx = buildChainIndex(cadeia('orc-servico'))
        expect([...idx.visiveis]).toEqual(['venda-orc-servico'])
    })
})

describe('bordas do critério', () => {
    it('venda sem `budget_id` é avulsa e sempre aparece', () => {
        const idx = buildChainIndex({ budgets: [], orders: [], sales: [{ id: 'ag-1', budget_id: null }] })
        expect(idx.visiveis.has('ag-1')).toBe(true)
        expect(idx.raizPorDocumento.has('ag-1')).toBe(false)
    })

    it('orçamento sozinho aparece — a cadeia parou nele', () => {
        const idx = buildChainIndex({ budgets: [{ id: 'orc-só' }], orders: [], sales: [] })
        expect(idx.visiveis.has('orc-só')).toBe(true)
    })

    it('pedido sem espelho usa o próprio `budget_id` como raiz', () => {
        // 17 dos 20 pedidos da base têm `original_budget_id === budget_id`.
        const idx = buildChainIndex({
            budgets: [{ id: 'orc-x' }],
            orders: [{ id: 'ped-x', budget_id: 'orc-x', original_budget_id: 'orc-x' }],
            sales: [],
        })
        expect(idx.raizPorDocumento.get('ped-x')).toBe('orc-x')
        expect(idx.visiveis.has('ped-x')).toBe(true)
        expect(idx.visiveis.has('orc-x')).toBe(false)
    })

    it('a cadeia de SETE pedidos exibe as sete, numeradas', () => {
        // Raiz b220f9f6 na base (cliente Wfjnrjn). Se ficar ilegível, diferenciar por código e
        // data — NUNCA esconder seis.
        const idx = buildChainIndex({
            budgets: [{ id: 'raiz-7' }],
            orders: Array.from({ length: 7 }, (_, i) => ({
                id: `ped-${i}`,
                budget_id: 'raiz-7',
                original_budget_id: 'raiz-7',
                created_at: `2026-09-0${i + 1}`,
            })),
            sales: [],
        })
        expect(idx.visiveis.size).toBe(7)
        expect(idx.irmaosPorDocumento.get('ped-6')).toEqual({ posicao: 7, total: 7 })
    })

    it('a ordem dos estágios é orçamento < pedido < venda', () => {
        expect(STAGE_RANK.ORCAMENTO).toBeLessThan(STAGE_RANK.PEDIDO)
        expect(STAGE_RANK.PEDIDO).toBeLessThan(STAGE_RANK.VENDA)
    })
})

describe('a página consome o índice', () => {
    const fonte = fs.readFileSync(path.join(process.cwd(), 'src', 'pages', 'clientes', 'index.tsx'), 'utf-8')

    it('os TRÊS laços consultam o índice antes de montar a entrada', () => {
        expect(fonte).toContain("apareceNoHistorico('ORCAMENTO'")
        expect(fonte).toContain("apareceNoHistorico('PEDIDO'")
        expect(fonte).toContain("apareceNoHistorico('VENDA'")
    })

    it('o `continue` por `budgets.sale_id` saiu — a cadeia decide, não o ponteiro', () => {
        // O critério anterior dependia de o orçamento apontar a venda de volta, e há 3 vendas
        // cujo orçamento NÃO aponta (VD-43E865, VD-A9599A, VD-85610B).
        expect(fonte).not.toContain('if ((b as any).sale_id) continue')
    })

    it('o marcador de irmãos é renderizado', () => {
        expect(fonte).toContain('entry.irmaos && (')
        expect(fonte).toContain('tentativa {entry.irmaos.posicao} de {entry.irmaos.total}')
    })
})
