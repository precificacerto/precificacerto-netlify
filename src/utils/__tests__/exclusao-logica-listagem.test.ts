/**
 * exclusao-logica-listagem.test.ts — a exclusão lógica precisa SUMIR da listagem e da
 * seleção, e precisa CONTINUAR VISÍVEL na leitura de documento já gravado.
 *
 * O defeito: o botão Excluir grava `is_active = false` corretamente; as telas é que não
 * olhavam esse campo. O usuário excluía e o item continuava lá — sem sinal nenhum de que a
 * exclusão tinha funcionado.
 *
 * A segunda metade do teste é a que protege o caso oposto, e é a mais fácil de quebrar por
 * engano: aplicar o mesmo filtro na leitura de um orçamento ou de uma venda APAGARIA o nome
 * do item de documentos antigos. Por isso as consultas de documento estão aqui pelo nome,
 * com a afirmação de que NÃO recebem filtro.
 */

import fs from 'fs'
import path from 'path'
import {
    ACTIVE_OR_NULL_FILTER,
    filterActiveStockRows,
    isActiveRecord,
} from '../active-record-filter'

const SRC = path.resolve(__dirname, '../..')
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8')

/** Trecho do arquivo que começa na âncora — a consulta inteira cabe nesta janela. */
function janelaAposAncora(conteudo: string, ancora: string, tamanho = 400): string {
    const i = conteudo.indexOf(ancora)
    expect(i).toBeGreaterThanOrEqual(0)
    return conteudo.slice(i, i + tamanho)
}

describe('isActiveRecord — ausente não é excluído', () => {
    it('só `is_active === false` esconde', () => {
        expect(isActiveRecord({ is_active: false })).toBe(false)
    })

    it('ativo, nunca classificado e sem a coluna continuam visíveis', () => {
        expect(isActiveRecord({ is_active: true })).toBe(true)
        expect(isActiveRecord({ is_active: null })).toBe(true)
        expect(isActiveRecord({})).toBe(true)
    })

    it('embed ausente não exclui a linha — linha de estoque de ITEM não tem produto', () => {
        expect(isActiveRecord(null)).toBe(true)
        expect(isActiveRecord(undefined)).toBe(true)
    })

    it('valor que não é objeto não é lido como exclusão', () => {
        expect(isActiveRecord('false')).toBe(true)
        expect(isActiveRecord(0)).toBe(true)
    })
})

describe('filterActiveStockRows — a listagem de Estoque', () => {
    it('descarta a linha cujo PRODUTO foi excluído', () => {
        const linhas = [
            { id: 'a', products: { name: 'Refri', is_active: true } },
            { id: 'b', products: { name: 'Cerveja', is_active: false } },
        ]
        expect(filterActiveStockRows(linhas).map((l) => l.id)).toEqual(['a'])
    })

    it('descarta a linha cujo ITEM foi excluído', () => {
        const linhas = [
            { id: 'a', items: { name: 'Tinta', is_active: true } },
            { id: 'b', items: { name: 'Verniz', is_active: false } },
        ]
        expect(filterActiveStockRows(linhas).map((l) => l.id)).toEqual(['a'])
    })

    it('mantém a linha de SERVIÇO, que não tem produto nem item embutido', () => {
        const linhas: { id: string; stock_type: string; items: null; products: null }[] = [
            { id: 's1', stock_type: 'SERVICE', items: null, products: null },
        ]
        expect(filterActiveStockRows(linhas)).toHaveLength(1)
    })

    it('lista vazia e ausente não quebram', () => {
        expect(filterActiveStockRows([])).toEqual([])
        expect(filterActiveStockRows(null)).toEqual([])
        expect(filterActiveStockRows(undefined)).toEqual([])
    })

    // ORÁCULO — as 13 linhas de estoque de PRODUTO da conta Salão Eliane em 04/09/2026,
    // medidas linha a linha no banco. Sete apontam para produto excluído logicamente; as
    // sete nasceram entre 0,53 s e 1,77 s DEPOIS da exclusão, recriadas pela auto-cura da
    // própria tela. A tela deve passar de 13 para 6.
    it('oráculo Salão Eliane: 13 linhas viram 6', () => {
        const inativo = (code: string, name: string) => ({ code, products: { name, is_active: false } })
        const ativo = (code: string, name: string) => ({ code, products: { name, is_active: true } })
        const linhas = [
            inativo('1008', 'Blusa horizonte'),
            inativo('1011', 'Cerveja'),
            inativo('1010', 'Leaving'),
            inativo('1005', 'Portas internas'),
            inativo('1006', 'Portas internas'),
            inativo('1004', 'PVC'),
            inativo('1002', 'Roupa'),
            ativo('1017', 'Agua mineral'),
            ativo('1019', 'Camiseta Polo M'),
            ativo('1014', 'Cerveja'),
            ativo('1009', 'Pomada Embaixador'),
            ativo('1016', 'Pomada Gel'),
            ativo('1013', 'Refri'),
        ]
        expect(linhas).toHaveLength(13)

        const visiveis = filterActiveStockRows(linhas)
        expect(visiveis).toHaveLength(6)
        expect(visiveis.map((l) => l.code).sort()).toEqual(
            ['1009', '1013', '1014', '1016', '1017', '1019'],
        )
        // "Cerveja" existe dos dois lados: o 1011 excluído sai, o 1014 ativo fica. O critério
        // é o registro, nunca o nome.
        expect(visiveis.map((l) => l.products.name)).toContain('Cerveja')
        expect(visiveis.filter((l) => l.products.name === 'Cerveja')).toHaveLength(1)
    })
})

describe('SERVIÇO — `status` e `is_active` são campos diferentes', () => {
    // A exclusão de serviço no Estoque gravava `is_active: false` sem mexer em `status`, e
    // todo leitor filtrava só `status = 'ACTIVE'`: o serviço excluído seguia aparecendo em
    // toda tela. Zero serviços inativos no banco hoje — estava armado, não materializado.
    it('serviço excluído com status ACTIVE não pode contar como ativo', () => {
        expect(isActiveRecord({ status: 'ACTIVE', is_active: false })).toBe(false)
    })

    it('serviço apenas desativado comercialmente continua sendo registro vivo', () => {
        expect(isActiveRecord({ status: 'INACTIVE', is_active: true })).toBe(true)
    })

    it('a exclusão no Estoque grava os DOIS campos', () => {
        const trecho = janelaAposAncora(
            read('pages/estoque/index.tsx'),
            'async function handleSoftDeleteService',
            900,
        )
        expect(trecho).toContain('is_active: false')
        expect(trecho).toContain("status: 'INACTIVE'")
    })
})

describe('LISTAGEM e SELEÇÃO filtram — as consultas que faltavam', () => {
    const casos: { tela: string; arquivo: string; ancora: string }[] = [
        { tela: 'Venda — seleção de produto', arquivo: 'pages/vendas/index.tsx', ancora: 'const { data: prodsFull, error: prodsErr }' },
        { tela: 'Venda — seleção de produto (fallback)', arquivo: 'pages/vendas/index.tsx', ancora: 'const { data: prodsSimple }' },
        { tela: 'Venda — seleção de serviço', arquivo: 'pages/vendas/index.tsx', ancora: 'const { data: svcsFull, error: svcsErr }' },
        { tela: 'Venda — seleção de serviço (fallback)', arquivo: 'pages/vendas/index.tsx', ancora: 'const { data: svcsSimple }' },
        { tela: 'Agenda — seleção de produto', arquivo: 'pages/agenda/index.tsx', ancora: "sb.from('products')" },
        { tela: 'Agenda — seleção de serviço', arquivo: 'pages/agenda/index.tsx', ancora: "sb.from('services')" },
        { tela: 'Produção — seleção de produto', arquivo: 'pages/producao/index.tsx', ancora: "'PRODUZIDO'" },
        { tela: 'Serviços — listagem', arquivo: 'pages/servicos/index.tsx', ancora: "sb.from('services')" },
        { tela: 'Estoque — aba Serviços', arquivo: 'pages/estoque/index.tsx', ancora: "estimated_duration_minutes, cost_total, base_price, status" },
        { tela: 'Cadastro de produto (novo) — seleção de item', arquivo: 'pages/produtos/criar.tsx', ancora: "supabase.from('items')" },
        { tela: 'Cadastro de produto (edição) — seleção de item', arquivo: 'pages/produtos/[id].tsx', ancora: "supabase.from('items')" },
        { tela: 'Cadastro de serviço (novo) — seleção de item', arquivo: 'pages/servicos/criar.tsx', ancora: "supabase.from('items')" },
        { tela: 'Cadastro de serviço (edição) — seleção de item', arquivo: 'pages/servicos/[id].tsx', ancora: "supabase.from('items')" },
    ]

    it.each(casos)('$tela filtra por is_active', ({ arquivo, ancora }) => {
        expect(janelaAposAncora(read(arquivo), ancora)).toContain('ACTIVE_OR_NULL_FILTER')
    })

    it('useServices filtra `status` E `is_active`', () => {
        const trecho = janelaAposAncora(read('hooks/use-data.hooks.ts'), 'export function useServices', 1600)
        expect(trecho).toContain("eq('status', 'ACTIVE')")
        expect(trecho).toContain('ACTIVE_OR_NULL_FILTER')
    })

    it('useStock devolve a lista já filtrada pelo dono da linha', () => {
        const trecho = janelaAposAncora(read('hooks/use-data.hooks.ts'), 'export function useStock', 1200)
        expect(trecho).toContain('filterActiveStockRows(data)')
    })

    it('a auto-cura do Estoque confere no BANCO antes de recriar a linha', () => {
        const trecho = janelaAposAncora(
            read('pages/estoque/index.tsx'),
            'Garantir que todo produto cadastrado tenha registro',
            2400,
        )
        expect(trecho).toContain('ACTIVE_OR_NULL_FILTER')
        expect(trecho).toContain('if (!stillActive) return')
        expect(trecho).toContain('if (!stillActiveIds.has(product.id)) continue')
    })
})

describe('LEITURA DE DOCUMENTO não filtra — a exceção a preservar', () => {
    // Estas consultas leem documento JÁ GRAVADO e exibem o nome pelo embed. Aplicar o filtro
    // de exclusão aqui apagaria o nome do item de orçamentos, pedidos e vendas antigos: o
    // documento passaria a mentir por causa de uma exclusão feita depois dele.
    const documentos: { leitura: string; arquivo: string; ancora: string }[] = [
        { leitura: 'Orçamento — itens do documento', arquivo: 'hooks/use-data.hooks.ts', ancora: 'budget_items(product_id, service_id' },
        { leitura: 'Venda — lista de vendas', arquivo: 'pages/vendas/index.tsx', ancora: "'*, products(name), customers(name), employees(name)'" },
        { leitura: 'Venda — lista de vendas (fallback)', arquivo: 'pages/vendas/index.tsx', ancora: "'*, products(name), customers(name)'" },
        { leitura: 'Pedido — itens do documento', arquivo: 'pages/pedidos/index.tsx', ancora: 'services ( name, rt_reserve_percent )' },
        { leitura: 'Relatório de vendas — nomes por id', arquivo: 'pages/relatorio-vendas/index.tsx', ancora: "from('customers').select('id, name').in('id', customerIds)" },
        { leitura: 'Comissão do vendedor — produtos por id', arquivo: 'pages/comissao-vendedor/index.tsx', ancora: "from('products').select('id, name').in('id', productIds)" },
        { leitura: 'Comissão do vendedor — serviços por id', arquivo: 'pages/comissao-vendedor/index.tsx', ancora: "from('services').select('id, commission_percent, profit_percent, name')" },
        { leitura: 'RT e comissões — produtos por id', arquivo: 'pages/rt-comissoes/index.tsx', ancora: "from('products').select('id, name').in('id', productIds)" },
        { leitura: 'RT e comissões — serviços por id', arquivo: 'pages/rt-comissoes/index.tsx', ancora: "from('services').select('id, commission_percent, profit_percent, name')" },
    ]

    it.each(documentos)('$leitura continua sem filtro', ({ arquivo, ancora }) => {
        const trecho = janelaAposAncora(read(arquivo), ancora, 260)
        expect(trecho).not.toContain('ACTIVE_OR_NULL_FILTER')
        expect(trecho).not.toContain(ACTIVE_OR_NULL_FILTER)
    })
})
