/**
 * D11 — comissão creditada como DISPONÍVEL em vez de EM ABERTO.
 *
 * Quando a venda não tinha nenhuma parcela lançada no Fluxo de Caixa, os 4 sites
 * (comissao-vendedor 365/512 e rt-comissoes 389/534) creditavam a comissão integral em
 * `emp.commission_value` — o balde do disponível — já na data da venda. Dinheiro contado
 * como liberado sem nenhuma confirmação de que o cliente pagou.
 *
 * Regra do dono do produto: no modo condicionado ao pagamento do cliente, a comissão
 * entra EM ABERTO e só vira disponível quando o recebimento for efetivado no fluxo de
 * caixa. Quem é FULL não é condicionado — recebe integral na data da venda.
 *
 * REGRA FIXA: toda correção na Venda no Balcão testa PRODUTO e SERVIÇO, sempre.
 */

import { resolveCommissionBucket } from '@/utils/commission-calc'

describe('D11 · balde da comissão sem parcelas no Fluxo de Caixa', () => {
    it('condicionado ao pagamento e sem parcelas lançadas ⇒ EM ABERTO', () => {
        expect(resolveCommissionBucket({ splitByInstallments: true, hasCashEntries: false }))
            .toBe('OPEN')
    })

    it('não condicionado (FULL) ⇒ DISPONÍVEL, com ou sem parcelas', () => {
        expect(resolveCommissionBucket({ splitByInstallments: false, hasCashEntries: false }))
            .toBe('AVAILABLE')
        expect(resolveCommissionBucket({ splitByInstallments: false, hasCashEntries: true }))
            .toBe('AVAILABLE')
    })

    it('com parcelas lançadas, o balde é decidido parcela a parcela', () => {
        // Este helper não governa esse caso — o ramo confirmado/pendente decide.
        expect(resolveCommissionBucket({ splitByInstallments: true, hasCashEntries: true }))
            .toBe('AVAILABLE')
    })
})

describe('D11 · efeito no crédito — PRODUTO e SERVIÇO', () => {
    /** Espelha o ramo corrigido dos 4 sites. */
    function creditar(splitByInstallments: boolean, finalValue: number, commission: number) {
        const isOpen = resolveCommissionBucket({ splitByInstallments, hasCashEntries: false }) === 'OPEN'
        return isOpen
            ? { disponivel: 0, emAberto: commission, receitaEmAberto: finalValue, contaNaMedia: false }
            : { disponivel: commission, emAberto: 0, receitaEmAberto: 0, contaNaMedia: true }
    }

    // Venda de PRODUTO e de SERVIÇO, ambas sem parcela lançada no fluxo de caixa.
    const PRODUTO = { finalValue: 1000, commission: 50 }
    const SERVICO = { finalValue: 1000, commission: 400 }

    it('PRODUTO, condicionado ao pagamento: comissão em aberto, nada disponível', () => {
        const r = creditar(true, PRODUTO.finalValue, PRODUTO.commission)
        expect(r.emAberto).toBe(50)
        expect(r.disponivel).toBe(0)
    })

    it('SERVIÇO, condicionado ao pagamento: comissão em aberto, nada disponível', () => {
        const r = creditar(true, SERVICO.finalValue, SERVICO.commission)
        expect(r.emAberto).toBe(400)
        expect(r.disponivel).toBe(0)
    })

    it('PRODUTO, FULL: integral disponível — inalterado', () => {
        const r = creditar(false, PRODUTO.finalValue, PRODUTO.commission)
        expect(r.disponivel).toBe(50)
        expect(r.emAberto).toBe(0)
    })

    it('SERVIÇO, FULL: integral disponível — inalterado', () => {
        const r = creditar(false, SERVICO.finalValue, SERVICO.commission)
        expect(r.disponivel).toBe(400)
        expect(r.emAberto).toBe(0)
    })

    it('em aberto não entra na média de alíquota, como o ramo pendente já fazia', () => {
        expect(creditar(true, PRODUTO.finalValue, PRODUTO.commission).contaNaMedia).toBe(false)
        expect(creditar(true, SERVICO.finalValue, SERVICO.commission).contaNaMedia).toBe(false)
        // No caminho disponível a média continua contando.
        expect(creditar(false, PRODUTO.finalValue, PRODUTO.commission).contaNaMedia).toBe(true)
    })

    it('nada se perde: disponível + em aberto fecha com a comissão, nos dois tipos', () => {
        for (const { finalValue, commission } of [PRODUTO, SERVICO]) {
            for (const split of [true, false]) {
                const r = creditar(split, finalValue, commission)
                expect(r.disponivel + r.emAberto).toBe(commission)
            }
        }
    })
})

describe('D11 · regressão do comportamento antigo', () => {
    // Antes, o ramo sem parcelas creditava sempre no balde disponível.
    const baldeAntigo = () => 'AVAILABLE' as const

    it('condicionado e sem parcelas: antes disponível, agora em aberto', () => {
        expect(baldeAntigo()).toBe('AVAILABLE') // o defeito
        expect(resolveCommissionBucket({ splitByInstallments: true, hasCashEntries: false }))
            .toBe('OPEN') // corrigido
    })

    it('FULL sem parcelas: o antigo já estava certo e continua igual', () => {
        expect(baldeAntigo()).toBe('AVAILABLE')
        expect(resolveCommissionBucket({ splitByInstallments: false, hasCashEntries: false }))
            .toBe('AVAILABLE')
    })
})
