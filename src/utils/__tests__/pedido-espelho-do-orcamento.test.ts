/**
 * pedido-espelho-do-orcamento.test.ts — o Pedido é o MESMO documento do Orçamento noutro
 * momento, e a tela tem de refletir isso.
 *
 * O DEFEITO VISÍVEL: linha de serviço no pedido mostrava "Selecione o produto". O
 * `order_items` grava `service_id` corretamente — medido no PED-A53A00: Coloração 363,24 e
 * Corte e Barba 131,14, ambos com `service_id` preenchido e `product_id` NULL. A tela é que
 * só resolvia produto, e o pedido nem carregava catálogo de serviços: não havia o que
 * oferecer. Defeito de exibição, não de gravação — salvar um pedido editado NÃO destruía o
 * vínculo (`service_id: it.service_id || null` no save).
 *
 * O QUE MAIS FALTAVA, e vem da comparação bloco a bloco com o Orçamento: desconto em R$,
 * seletor de Modo de desconto, os rótulos "Total do Orçamento" e "Total a cobrar", e três
 * props da Memória Cascata — o bloco já estava lá, faltava alimentá-lo.
 *
 * O SELETOR DE MODO entra AGORA porque o #48 fez o `discount_mode` chegar ao snapshot. Antes
 * seria controle inerte: os itens do pedido caem na Prioridade 1 de `residual-distribution` e
 * leem `new_commission` já gravado, então mudar o modo na tela não moveria número nenhum. Era
 * a única razão do adiamento, e ela caiu.
 *
 * CADA CASO AQUI FALHA SEM A SUA CORREÇÃO — é asserção sobre o código, porque o que mudou é a
 * tela. Um caso que passasse antes e depois não estaria exercitando nada.
 */

import fs from 'fs'
import path from 'path'
import { resolveCascadeCode, resolveCascadeOrigem, type CascadePdfMeta } from '@/lib/create-cascade-pdf'

const SRC = path.resolve(__dirname, '../..')
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8')
const pedidos = () => read('pages/pedidos/index.tsx')

describe('O seletor resolve SERVIÇO, não só produto', () => {
    it('o pedido carrega o catálogo de serviços — antes não carregava', () => {
        // `useServices` não era importado: a linha de serviço não tinha opções para oferecer.
        expect(pedidos()).toContain('useServices')
        expect(pedidos()).toContain('const { data: services = [] } = useServices()')
    })

    it('há um `filteredServices` ao lado do `filteredProducts`', () => {
        expect(pedidos()).toContain('const filteredServices = useMemo')
    })

    it('existe handler de serviço espelhando o de produto', () => {
        expect(pedidos()).toContain('const handleItemServiceChange')
        // Item novo é inserção nova: pega o cadastro ATUAL, como no orçamento.
        const i = pedidos().indexOf('const handleItemServiceChange')
        const trecho = pedidos().slice(i, i + 1400)
        expect(trecho).toContain('commission_percent: commissionPercent')
        expect(trecho).toContain('rt_reserve_percent')
        expect(trecho).toContain('profit_percent')
    })

    it('o ternário está nos DOIS pontos — cartão mobile e tabela desktop', () => {
        const conteudo = pedidos()
        expect(conteudo.split('placeholder="Selecione o serviço"').length - 1).toBe(2)
        expect(conteudo.split('placeholder="Selecione o produto"').length - 1).toBe(2)
        expect(conteudo.split('handleItemServiceChange(row.key, v)').length - 1).toBe(2)
    })

    it('o rótulo da linha diz o que ela é — Produto, Serviço ou Item manual', () => {
        expect(pedidos()).toContain("row.service_id ? 'Serviço' : 'Produto'")
    })
})

describe('Os blocos que o Orçamento tinha e o Pedido não', () => {
    it('desconto em R$ ao lado do percentual', () => {
        const i = pedidos().indexOf('function OrderTotalsSummary')
        const trecho = pedidos().slice(i, i + 3000)
        expect(trecho).toContain('formatPercentWithDigits(pct)')
        expect(trecho).toContain('formatCurrency(discountAmount)')
    })

    it('os rótulos são os MESMOS do Orçamento', () => {
        expect(pedidos()).toContain('Total do Orçamento')
        expect(pedidos()).toContain('Total a cobrar')
    })

    it('o seletor de Modo de desconto existe, com os três modos', () => {
        const i = pedidos().indexOf('name="discount_mode"')
        expect(i).toBeGreaterThanOrEqual(0)
        const trecho = pedidos().slice(i, i + 900)
        expect(trecho).toContain('PROPORTIONAL')
        expect(trecho).toContain('SELLER_REDUCTION')
        expect(trecho).toContain('PROFIT_REDUCTION')
    })

    it('as três props da Memória Cascata chegam ao bloco', () => {
        const i = pedidos().indexOf('<ConsolidatedDREBlock')
        const trecho = pedidos().slice(i, i + 1600)
        expect(trecho).toContain('totalACobrarComDesconto')
        expect(trecho).toContain('manualTotal')
        expect(trecho).toContain('pdfMeta')
    })

    it('`manualTotal` soma só os itens manuais — a Etapa 11 os abate antes de distribuir', () => {
        expect(pedidos()).toContain('const orderManualTotal = useMemo')
    })
})

describe('A identidade do PDF — pedido titula, orçamento é linhagem', () => {
    // Decisão registrada: o `pdfMeta` identifica pelo `order_code`, com o `budget_id` de
    // origem no cabeçalho. São coisas diferentes e ambas aparecem, cada uma no seu lugar.
    const meta = (o: Partial<CascadePdfMeta>): CascadePdfMeta => ({ ...o })

    it('com `orderCode`, é ele que titula', () => {
        expect(resolveCascadeCode(meta({ orderCode: 'PED-A53A00', budgetId: '0689b99b' })))
            .toBe('PED-A53A00')
    })

    it('e o orçamento de origem vira linhagem, não some', () => {
        expect(resolveCascadeOrigem(meta({ orderCode: 'PED-A53A00', budgetId: '0689b99b' })))
            .toBe('ORC-0689')
    })

    it('sem `orderCode`, o orçamento continua titulando — o caminho antigo não mudou', () => {
        expect(resolveCascadeCode(meta({ budgetId: '0689b99b' }))).toBe('ORC-0689')
        expect(resolveCascadeCode(meta({ budgetCode: 'ORC-2356' }))).toBe('ORC-2356')
        expect(resolveCascadeCode(meta({}))).toBe('ORC')
    })

    it('pedido SEM orçamento de origem não inventa linhagem', () => {
        expect(resolveCascadeOrigem(meta({ orderCode: 'PED-A53A00' }))).toBe('')
    })

    it('o cabeçalho nomeia o documento pelo que ele é', () => {
        const pdf = read('lib/create-cascade-pdf.ts')
        expect(pdf).toContain("meta.orderCode ? 'Pedido' : 'Orçamento'")
        expect(pdf).toContain('Origem:')
    })
})

describe('O que este PR NÃO mudou — a gravação já estava certa', () => {
    it('o save do pedido preserva `service_id`', () => {
        // Medido antes de mexer: editar e salvar um pedido não destruía o vínculo do serviço.
        // Se isto quebrar, a correção de tela virou correção de dado, que não era o escopo.
        expect(pedidos()).toContain('service_id: it.service_id || null')
    })
})
