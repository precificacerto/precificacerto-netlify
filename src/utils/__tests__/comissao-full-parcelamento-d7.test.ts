/**
 * D7 — parcelamento do CLIENTE forçava o fatiamento da comissão do funcionário.
 *
 * A condição era `emp.payment_mode === 'INSTALLMENT' || saleInstallments > 1`, repetida
 * byte a byte em 4 lugares (comissao-vendedor 346/496 e rt-comissoes 372/517). O segundo
 * termo deixava `sales.installments` — como o CLIENTE paga a empresa — sequestrar
 * `employees.commission_payment_mode` — o acordo entre a empresa e o vendedor. Bastava o
 * cliente dividir em 2x para um funcionário FULL passar a receber fatiado.
 *
 * Regra do dono do produto: quem é FULL recebe integral na data da venda,
 * independentemente de o cliente ter parcelado. Só quem é INSTALLMENT acompanha.
 *
 * REGRA FIXA: toda correção na Venda no Balcão testa PRODUTO e SERVIÇO, sempre.
 */

import {
    shouldSplitCommissionByInstallments,
    computeSaleCommission,
} from '@/utils/commission-calc'

/** Venda de PRODUTO e de SERVIÇO, mesmo valor, para isolar a variável do modo. */
const VENDA_PRODUTO = { final_value: 1000, commission_amount: 50 }
const ITENS_PRODUTO = [{ quantity: 1, unit_price: 1000, commission_percent: 5 }]
const VENDA_SERVICO = { final_value: 1000, commission_amount: 400 }
const ITENS_SERVICO = [{ quantity: 1, unit_price: 1000, commission_percent: 40 }]

describe('D7 · a decisão é do cadastro do funcionário, não do cliente', () => {
    it('FULL não fatia, com o cliente parcelando ou não', () => {
        expect(shouldSplitCommissionByInstallments('FULL')).toBe(false)
        // O parcelamento do cliente nem é parâmetro — não há como ele influenciar.
        for (const parcelasDoCliente of [1, 2, 6, 12]) {
            void parcelasDoCliente
            expect(shouldSplitCommissionByInstallments('FULL')).toBe(false)
        }
    })

    it('INSTALLMENT fatia, com o cliente parcelando ou não', () => {
        expect(shouldSplitCommissionByInstallments('INSTALLMENT')).toBe(true)
    })

    it('modo ausente ou desconhecido cai em FULL — mesmo default do cadastro', () => {
        expect(shouldSplitCommissionByInstallments(null)).toBe(false)
        expect(shouldSplitCommissionByInstallments(undefined)).toBe(false)
        expect(shouldSplitCommissionByInstallments('')).toBe(false)
        expect(shouldSplitCommissionByInstallments('QUALQUER_COISA')).toBe(false)
    })

    it('tolera caixa e espaço vindos do banco', () => {
        expect(shouldSplitCommissionByInstallments('installment')).toBe(true)
        expect(shouldSplitCommissionByInstallments(' INSTALLMENT ')).toBe(true)
        expect(shouldSplitCommissionByInstallments('full')).toBe(false)
    })
})

describe('D7 · regressão do comportamento antigo', () => {
    // Reproduz a condição defeituosa para provar que o caso que ela errava agora passa.
    const condicaoAntiga = (modo: string, parcelasDoCliente: number) =>
        modo === 'INSTALLMENT' || parcelasDoCliente > 1

    it('FULL com cliente em 3x: antes fatiava, agora não', () => {
        expect(condicaoAntiga('FULL', 3)).toBe(true) // o defeito
        expect(shouldSplitCommissionByInstallments('FULL')).toBe(false) // corrigido
    })

    it('os casos que já estavam certos continuam iguais', () => {
        const casos: Array<[string, number, boolean]> = [
            ['FULL', 1, false],
            ['INSTALLMENT', 1, true],
            ['INSTALLMENT', 5, true],
        ]
        for (const [modo, parcelas, esperado] of casos) {
            expect(condicaoAntiga(modo, parcelas)).toBe(esperado)
            expect(shouldSplitCommissionByInstallments(modo)).toBe(esperado)
        }
    })
})

describe('D7 · efeito no valor creditado — PRODUTO e SERVIÇO', () => {
    /** Espelha o ramo das telas: FULL credita integral na data; INSTALLMENT distribui. */
    function creditar(
        modo: string,
        venda: { final_value: number; commission_amount: number },
        itens: Array<{ quantity: number; unit_price: number; commission_percent: number }>,
        parcelasConfirmadas: number,
        parcelasTotais: number,
    ) {
        const { comissaoPaga } = computeSaleCommission(venda, itens)
        if (!shouldSplitCommissionByInstallments(modo)) {
            return { disponivel: comissaoPaga, emAberto: 0 }
        }
        const prop = parcelasTotais > 0 ? parcelasConfirmadas / parcelasTotais : 0
        return {
            disponivel: comissaoPaga * prop,
            emAberto: comissaoPaga * (1 - prop),
        }
    }

    it('PRODUTO, funcionário FULL, cliente em 3x (1 paga): comissão integral', () => {
        const r = creditar('FULL', VENDA_PRODUTO, ITENS_PRODUTO, 1, 3)
        expect(r.disponivel).toBe(50)
        expect(r.emAberto).toBe(0)
    })

    it('SERVIÇO, funcionário FULL, cliente em 3x (1 paga): comissão integral', () => {
        const r = creditar('FULL', VENDA_SERVICO, ITENS_SERVICO, 1, 3)
        expect(r.disponivel).toBe(400)
        expect(r.emAberto).toBe(0)
    })

    it('PRODUTO, funcionário INSTALLMENT, cliente em 3x (1 paga): um terço', () => {
        const r = creditar('INSTALLMENT', VENDA_PRODUTO, ITENS_PRODUTO, 1, 3)
        expect(r.disponivel).toBeCloseTo(50 / 3, 6)
        expect(r.emAberto).toBeCloseTo(100 / 3, 6)
    })

    it('SERVIÇO, funcionário INSTALLMENT, cliente em 3x (1 paga): um terço', () => {
        const r = creditar('INSTALLMENT', VENDA_SERVICO, ITENS_SERVICO, 1, 3)
        expect(r.disponivel).toBeCloseTo(400 / 3, 6)
        expect(r.emAberto).toBeCloseTo(800 / 3, 6)
    })

    it('FULL à vista: inalterado nos dois tipos — não é regressão', () => {
        expect(creditar('FULL', VENDA_PRODUTO, ITENS_PRODUTO, 1, 1).disponivel).toBe(50)
        expect(creditar('FULL', VENDA_SERVICO, ITENS_SERVICO, 1, 1).disponivel).toBe(400)
    })

    it('a soma fecha com a comissão da venda em qualquer modo', () => {
        for (const modo of ['FULL', 'INSTALLMENT']) {
            for (const [venda, itens, total] of [
                [VENDA_PRODUTO, ITENS_PRODUTO, 50],
                [VENDA_SERVICO, ITENS_SERVICO, 400],
            ] as const) {
                const r = creditar(modo, venda, [...itens], 2, 5)
                expect(r.disponivel + r.emAberto).toBeCloseTo(total, 6)
            }
        }
    })
})
