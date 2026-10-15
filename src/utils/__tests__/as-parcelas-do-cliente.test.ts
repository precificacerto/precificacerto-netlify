/**
 * PORTÃO 4a — o módulo de parcelas.
 *
 * CADA ASSERÇÃO PRECISA FALHAR SEM A SUA CORREÇÃO (`teste-que-nao-exercita.md`). As mutações
 * que derrubam cada caso estão nomeadas no bloco de cada um, e foram RODADAS — não são
 * promessa de redação.
 *
 * A FIXTURE FOI MONTADA PARA DISCRIMINAR, e o ponto mais importante é este: ela tem DUAS
 * linhas estornadas, não uma.
 *
 *  - `p-estorno-aberto` — `is_active = false` e `paid_date = null`. É ELA que faz a mutação
 *    "tire o `is_active`" ficar vermelha no VENCIDO: sem o filtro ela vira uma vencida de
 *    278 dias e R$ 5.000,00.
 *  - `p-estorno-pago` — `is_active = false` com `paid_date`. Essa NÃO mudaria o vencido
 *    (o filtro de `paid_date` já a tira), e é por isso que ela sozinha não bastaria. Ela
 *    morde no escopo `'TODAS'`, onde sem o `is_active` apareceria como "PAGA em dd/mm" —
 *    um estorno exibido como pagamento.
 *
 * Uma fixture com só a segunda ficaria VERDE das duas formas, e o portão não mediria nada.
 */

import {
    montarParcelasDoCliente,
    type LinhaDeParcela,
    type VendaParaResolucao,
} from '@/utils/parcelas-do-cliente'

const HOJE = '2026-10-15'

const VENDAS: VendaParaResolucao[] = [
    { id: 'venda-1', customer_id: 'cli-A' },
    { id: 'venda-2', customer_id: 'cli-B' },
    { id: 'venda-3', customer_id: null },
    { id: 'venda-4', customer_id: 'cli-C' },
]

function linha(p: Partial<LinhaDeParcela> & { id: string }): LinhaDeParcela {
    return {
        amount: 0,
        due_date: null,
        paid_date: null,
        is_active: true,
        origin_type: 'SALE',
        origin_id: null,
        contact_id: null,
        ...p,
    }
}

const PARCELAS: LinhaDeParcela[] = [
    // Série da venda-1: uma paga e três em aberto.
    linha({ id: 'p-a4-paga', origin_id: 'venda-1', due_date: '2026-07-01', amount: 999.99, paid_date: '2026-07-02' }),
    linha({ id: 'p-a1', origin_id: 'venda-1', due_date: '2026-08-01', amount: 100.10 }),
    linha({ id: 'p-a2', origin_id: 'venda-1', due_date: '2026-09-15', amount: 200.20 }),
    linha({ id: 'p-a3', origin_id: 'venda-1', due_date: '2026-11-15', amount: 400.40 }),
    // Os dois estornos. Ver o cabeçalho: os dois são necessários, por razões diferentes.
    linha({ id: 'p-estorno-aberto', origin_id: 'venda-1', due_date: '2026-01-10', amount: 5000.0, is_active: false }),
    linha({ id: 'p-estorno-pago', origin_id: 'venda-1', due_date: '2026-02-10', amount: 7000.0, paid_date: '2026-02-11', is_active: false }),
    // Órfã: a origem aponta para venda que não existe, e só o `contact_id` resolve o cliente.
    linha({ id: 'p-b1-contato', origin_id: 'venda-fantasma', contact_id: 'cli-B', due_date: '2026-10-20', amount: 50.05 }),
    // Venda sem cliente e sem `contact_id`: não resolve ninguém.
    linha({ id: 'p-c1-sem-cliente', origin_id: 'venda-3', due_date: '2026-09-01', amount: 77.0 }),
    // `due_date` nulo — a coluna é `date NULL` sem default.
    linha({ id: 'p-d1-sem-venc', origin_id: 'venda-2', due_date: null, amount: 123.45 }),
    // cli-C só tem SEM_VENCIMENTO. Sem o sexto campo, ele não apareceria em `porCliente`
    // com valor nenhum — e R$ 88,00 em aberto sumiriam da tela sem deixar rastro.
    linha({ id: 'p-e1-so-sem-venc', origin_id: 'venda-4', due_date: null, amount: 88.0 }),
]

const abertas = () => montarParcelasDoCliente({ parcelas: PARCELAS, vendas: VENDAS, hoje: HOJE, escopo: 'ABERTAS' })
const todas = () => montarParcelasDoCliente({ parcelas: PARCELAS, vendas: VENDAS, hoje: HOJE, escopo: 'TODAS' })
const acharParcela = (r: ReturnType<typeof abertas>, id: string) => r.parcelas.find((p) => p.id === id)

describe('o estorno não é pagamento, e não é parcela', () => {
    // MUTAÇÃO: tirar `.filter(l => l.is_active === true)` do módulo.
    it('o VENCIDO exclui o estorno em aberto — sem o filtro ele somaria R$ 5.000,00', () => {
        const { porCliente } = abertas()
        expect(porCliente['cli-A'].vencido).toBe(300.3)
        expect(acharParcela(abertas(), 'p-estorno-aberto')).toBeUndefined()
    })

    it('o MAIOR ATRASO exclui o estorno — sem o filtro seriam 278 dias, não 75', () => {
        expect(abertas().porCliente['cli-A'].maiorAtrasoDias).toBe(75)
    })

    it("no escopo TODAS o estorno PAGO não vira 'PAGA em dd/mm'", () => {
        const r = todas()
        expect(acharParcela(r, 'p-estorno-pago')).toBeUndefined()
        expect(r.parcelas.filter((p) => p.estado === 'PAGA').map((p) => p.id)).toEqual(['p-a4-paga'])
    })
})

describe('`hoje` é parâmetro, nunca o relógio', () => {
    // MUTAÇÃO: usar `new Date().toISOString().slice(0,10)` no lugar do parâmetro.
    it('o MESMO conjunto com dois `hoje` diferentes dá vencido diferente', () => {
        const emOutubro = montarParcelasDoCliente({ parcelas: PARCELAS, vendas: VENDAS, hoje: '2026-10-15', escopo: 'ABERTAS' })
        const emSetembro = montarParcelasDoCliente({ parcelas: PARCELAS, vendas: VENDAS, hoje: '2026-09-01', escopo: 'ABERTAS' })
        expect(emOutubro.porCliente['cli-A'].vencido).toBe(300.3)
        expect(emSetembro.porCliente['cli-A'].vencido).toBe(100.1)
        expect(emSetembro.porCliente['cli-A'].maiorAtrasoDias).toBe(31)
    })

    it('a parcela de 15/09 muda de estado conforme o dia informado', () => {
        const antes = montarParcelasDoCliente({ parcelas: PARCELAS, vendas: VENDAS, hoje: '2026-09-01', escopo: 'ABERTAS' })
        expect(acharParcela(antes, 'p-a2')!.estado).toBe('A_VENCER')
        expect(acharParcela(abertas(), 'p-a2')!.estado).toBe('VENCIDA')
    })
})

describe('o cliente é `coalesce(contact_id, venda.customer_id)` — os DOIS', () => {
    // MUTAÇÃO A: remover o ramo `l.contact_id ??`.
    it('o `contact_id` resolve a órfã, cuja venda não existe mais', () => {
        const p = acharParcela(abertas(), 'p-b1-contato')!
        expect(p.customerId).toBe('cli-B')
        expect(abertas().porCliente['cli-B'].aVencer).toBe(50.05)
    })

    // MUTAÇÃO B: remover o ramo `?? daVenda`.
    it('a venda resolve quando não há `contact_id`', () => {
        expect(acharParcela(abertas(), 'p-a1')!.customerId).toBe('cli-A')
    })

    // MUTAÇÃO: devolver `origin_id` sempre, sem checar se a venda existe.
    it('`saleId` é null na órfã — link que leva a lugar nenhum não é link', () => {
        expect(acharParcela(abertas(), 'p-b1-contato')!.saleId).toBeNull()
        expect(acharParcela(abertas(), 'p-a1')!.saleId).toBe('venda-1')
    })
})

describe('SEM_VENCIMENTO é classe própria, não um balde', () => {
    // MUTAÇÃO: tratar `due_date === null` como A_VENCER.
    it('`due_date` nulo não é vencida nem a vencer', () => {
        expect(acharParcela(abertas(), 'p-d1-sem-venc')!.estado).toBe('SEM_VENCIMENTO')
    })

    it('ela NÃO entra em nenhum dos dois totais — cli-B fica com os 50,05, não com 173,50', () => {
        const b = abertas().porCliente['cli-B']
        expect(b.aVencer).toBe(50.05)
        expect(b.vencido).toBe(0)
        expect(b.temVencida).toBe(false)
        expect(b.temAVencer).toBe(true)
    })

    // MUTAÇÃO: somar SEM_VENCIMENTO em `aVencer`.
    it('ela soma em `semVencimento`, campo PRÓPRIO — o valor não some da tela', () => {
        expect(abertas().porCliente['cli-B'].semVencimento).toBe(123.45)
    })

    it('cliente com SÓ sem-vencimento tem vencido 0, aVencer 0 e semVencimento > 0', () => {
        const c = abertas().porCliente['cli-C']
        expect(c).toEqual({
            vencido: 0,
            aVencer: 0,
            semVencimento: 88,
            maiorAtrasoDias: null,
            temVencida: false,
            temAVencer: false,
        })
    })

    it('mas a parcela CONTINUA na lista, com o cliente resolvido — omitir do total não é sumir', () => {
        expect(acharParcela(abertas(), 'p-d1-sem-venc')!.customerId).toBe('cli-B')
    })
})

describe('a soma é em centavos inteiros', () => {
    // MUTAÇÃO: somar `valor` em float, sem `Math.round(valor * 100)`.
    it('100,10 + 200,20 dá 300,30 — em float dá 300.29999999999995', () => {
        expect(100.1 + 200.2).not.toBe(300.3)
        expect(abertas().porCliente['cli-A'].vencido).toBe(300.3)
    })
})

describe('a parcela sem cliente não entra em `porCliente`', () => {
    // MUTAÇÃO: usar `p.customerId ?? ''` como chave.
    it('a de venda sem cliente fica na lista e fora do agregado', () => {
        const r = abertas()
        expect(acharParcela(r, 'p-c1-sem-cliente')!.customerId).toBeNull()
        expect(Object.keys(r.porCliente).sort()).toEqual(['cli-A', 'cli-B', 'cli-C'])
    })

    it('os 77,00 dela não aparecem em vencido nenhum', () => {
        const r = abertas()
        const soma = Object.values(r.porCliente).reduce((s, a) => s + a.vencido, 0)
        expect(soma).toBe(300.3)
    })
})

describe('o escopo decide o PAGAMENTO, e é obrigatório', () => {
    // MUTAÇÃO: ignorar `escopo` e devolver sempre todas.
    it('ABERTAS não traz parcela paga', () => {
        expect(abertas().parcelas.some((p) => p.estado === 'PAGA')).toBe(false)
        expect(acharParcela(abertas(), 'p-a4-paga')).toBeUndefined()
    })

    it('TODAS traz a paga com `pagaEm`, e o bloco 4 tem o que exibir', () => {
        const p = acharParcela(todas(), 'p-a4-paga')!
        expect(p.estado).toBe('PAGA')
        expect(p.pagaEm).toBe('2026-07-02')
        expect(p.diasDeAtraso).toBeNull()
    })

    it('o agregado de ABERTAS e o de TODAS são o MESMO — a paga não entra em total nenhum', () => {
        expect(todas().porCliente['cli-A'].vencido).toBe(abertas().porCliente['cli-A'].vencido)
        expect(todas().porCliente['cli-A'].aVencer).toBe(abertas().porCliente['cli-A'].aVencer)
    })
})

describe('"2 de 5" é a posição na SÉRIE, não na lista filtrada', () => {
    // MUTAÇÃO: numerar DEPOIS do filtro de escopo.
    it('em ABERTAS a primeira em aberto da venda-1 é a 2 de 4, não a 1 de 3', () => {
        const p = acharParcela(abertas(), 'p-a1')!
        expect(p.numero).toBe(2)
        expect(p.de).toBe(4)
    })

    it('o estorno não conta na série — fossem contados, seriam 6', () => {
        expect(acharParcela(todas(), 'p-a4-paga')).toMatchObject({ numero: 1, de: 4 })
        expect(acharParcela(todas(), 'p-a3')).toMatchObject({ numero: 4, de: 4 })
    })

    it('a órfã mantém série própria pelo `origin_id`, mesmo sem a venda', () => {
        expect(acharParcela(abertas(), 'p-b1-contato')).toMatchObject({ numero: 1, de: 1 })
    })
})

describe('`diasDeAtraso` é derivado, e só existe na vencida', () => {
    // MUTAÇÃO: devolver 0 em vez de null fora de VENCIDA.
    it('a vencida tem os dias contados até `hoje`', () => {
        expect(acharParcela(abertas(), 'p-a1')!.diasDeAtraso).toBe(75)
        expect(acharParcela(abertas(), 'p-a2')!.diasDeAtraso).toBe(30)
    })

    it('a que ainda não venceu tem null, nunca 0 — zero diria "vence hoje"', () => {
        expect(acharParcela(abertas(), 'p-a3')!.diasDeAtraso).toBeNull()
        expect(acharParcela(abertas(), 'p-d1-sem-venc')!.diasDeAtraso).toBeNull()
    })

    it('`maiorAtrasoDias` é null em quem não tem vencida', () => {
        expect(abertas().porCliente['cli-B'].maiorAtrasoDias).toBeNull()
    })
})

describe('a ordenação é por vencimento, e o sem data vai para o fim', () => {
    it('a lista sai ordenada e a sem vencimento é a última', () => {
        const ids = abertas().parcelas.map((p) => p.id)
        expect(ids).toEqual([
            'p-a1', 'p-c1-sem-cliente', 'p-a2', 'p-b1-contato', 'p-a3', 'p-d1-sem-venc', 'p-e1-so-sem-venc',
        ])
    })
})
