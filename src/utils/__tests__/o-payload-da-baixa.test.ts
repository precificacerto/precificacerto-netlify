/**
 * PORTÃO 5b.1 — o payload da baixa, extraído do fluxo de caixa SEM mudar comportamento.
 *
 * O caso que manda é o do DIFF DE COMPORTAMENTO VAZIO: o algoritmo que estava inline em
 * `handleRegisterPayment` está replicado aqui, literal, e as 24 combinações de entrada são
 * comparadas contra o módulo — valor E ORDEM DAS CHAVES. Se a extração tivesse mudado
 * qualquer coisa, é este caso que ficaria vermelho, e é por ele que a 5b.2 pôde ser
 * construída em cima.
 *
 * Os outros casos afirmam a TRAVA: sem pedir, `due_date` e `amount` não entram. É o que
 * impede a baixa da ficha de reescrever vencimento (apagando o atraso) ou de gravar valor
 * diferente sem a redistribuição da 5c.
 */

import fs from 'fs'
import path from 'path'

import { montarPayloadDaBaixa, type EntradaDaBaixa } from '@/utils/baixa-de-parcela'

// ════════════════════════════════════════════════════════════════════════════════════════
describe('1 — sem pedir, as duas colunas NÃO entram no payload', () => {
    const minimo: EntradaDaBaixa = { pagoEm: '2026-10-16', forma: 'PIX' }

    // MUTAÇÃO: pôr `amount` sempre.
    it('o payload NÃO contém `amount`', () => {
        const p = montarPayloadDaBaixa(minimo)
        expect('amount' in p).toBe(false)
        expect(Object.keys(p)).not.toContain('amount')
    })

    // MUTAÇÃO: pôr `due_date` sempre.
    it('o payload NÃO contém `due_date`', () => {
        const p = montarPayloadDaBaixa(minimo)
        expect('due_date' in p).toBe(false)
        expect(Object.keys(p)).not.toContain('due_date')
    })

    it('o payload mínimo tem EXATAMENTE as duas colunas da baixa', () => {
        expect(montarPayloadDaBaixa(minimo)).toEqual({ paid_date: '2026-10-16', payment_method: 'PIX' })
        expect(Object.keys(montarPayloadDaBaixa(minimo))).toEqual(['paid_date', 'payment_method'])
    })

    // A ROTA DA FICHA usa este terceiro estado (BLOQUEANTE 2): sem forma, a coluna não vai.
    // MUTAÇÃO: `payment_method: entrada.forma ?? null` sempre no payload.
    it('forma AUSENTE (`undefined`) não escreve a coluna — o terceiro estado', () => {
        const p = montarPayloadDaBaixa({ pagoEm: '2026-10-16' })
        expect(p).toEqual({ paid_date: '2026-10-16' })
        expect('payment_method' in p).toBe(false)
    })

    it('forma ausente grava NULL, e isso é diferente de não mandar a coluna', () => {
        const p = montarPayloadDaBaixa({ pagoEm: '2026-10-16', forma: null })
        expect(p.payment_method).toBeNull()
        expect('payment_method' in p).toBe(true)
    })
})

describe('2 — ligar cada coluna EXIGE passar o parâmetro', () => {
    it('`corrigirValor` ligado põe `amount`, e só ele', () => {
        const p = montarPayloadDaBaixa({ pagoEm: '2026-10-16', forma: 'PIX', corrigirValor: { para: 1234.56 } })
        expect(p.amount).toBe(1234.56)
        expect('due_date' in p).toBe(false)
    })

    it('`reagendar` ligado põe `due_date`, e só ele', () => {
        const p = montarPayloadDaBaixa({ pagoEm: '2026-10-16', forma: 'PIX', reagendar: { para: '2026-11-30' } })
        expect(p.due_date).toBe('2026-11-30')
        expect('amount' in p).toBe(false)
    })

    it('`undefined` explícito é o DESLIGADO — o objeto é o ligado', () => {
        const p = montarPayloadDaBaixa({
            pagoEm: '2026-10-16', forma: 'PIX', reagendar: undefined, corrigirValor: undefined,
        })
        expect(Object.keys(p)).toEqual(['paid_date', 'payment_method'])
    })

    it('valor ZERO ligado é zero gravado, não coluna ausente', () => {
        // Zero pedido e zero por ausência são o mesmo byte no payload se a opção for o
        // número solto — `ausente-vs-falso.md`. Com o objeto, não são.
        const p = montarPayloadDaBaixa({ pagoEm: '2026-10-16', forma: null, corrigirValor: { para: 0 } })
        expect('amount' in p).toBe(true)
        expect(p.amount).toBe(0)
    })
})

// ════════════════════════════════════════════════════════════════════════════════════════
describe('3 — DIFF DE COMPORTAMENTO VAZIO no fluxo de caixa', () => {
    interface EntradaDoFluxo {
        paymentDate: string | null
        paymentDueDate: string | null
        entryDueDate: string | null
        paymentAmount: number
        entryAmount: number
        paymentMethodModal: string
        hojeDoNavegador: string
    }

    /**
     * O algoritmo DE ANTES, replicado literalmente de `handleRegisterPayment`
     * (`fluxo-de-caixa/index.tsx`, antes da extração). Não é uma paráfrase: é o corpo que
     * estava lá, com `paymentDate.format('YYYY-MM-DD')` já resolvido para string.
     */
    function payloadAntigo(e: EntradaDoFluxo): Record<string, unknown> {
        const originalDueDate = e.entryDueDate
        const newDueDate = e.paymentDueDate ? e.paymentDueDate : originalDueDate
        const dueDateChanged = newDueDate !== originalDueDate
        const updatePayload: Record<string, unknown> = {
            paid_date: e.paymentDate ? e.paymentDate : e.hojeDoNavegador,
            payment_method: e.paymentMethodModal || null,
            amount: e.paymentAmount > 0 ? e.paymentAmount : e.entryAmount,
        }
        if (dueDateChanged) updatePayload.due_date = newDueDate
        return updatePayload
    }

    /** O que a tela monta HOJE, chamando o módulo — copiado do arquivo depois da extração. */
    function payloadNovo(e: EntradaDoFluxo): Record<string, unknown> {
        const originalDueDate = e.entryDueDate
        const newDueDate = e.paymentDueDate ? e.paymentDueDate : originalDueDate
        const dueDateChanged = newDueDate !== originalDueDate
        return montarPayloadDaBaixa({
            pagoEm: e.paymentDate ? e.paymentDate : e.hojeDoNavegador,
            forma: e.paymentMethodModal || null,
            corrigirValor: { para: e.paymentAmount > 0 ? e.paymentAmount : e.entryAmount },
            reagendar: dueDateChanged ? { para: newDueDate as string } : undefined,
        }) as unknown as Record<string, unknown>
    }

    // 2 × 3 × 2 × 2 = 24 combinações. A `paymentDueDate` cobre os três casos que o
    // `dueDateChanged` distingue: vazia, igual à gravada, e diferente dela.
    const MATRIZ: EntradaDoFluxo[] = []
    for (const paymentDate of [null, '2026-10-14']) {
        for (const paymentDueDate of [null, '2026-09-30', '2026-12-01']) {
            for (const paymentAmount of [0, 777.77]) {
                for (const paymentMethodModal of ['', 'PIX']) {
                    MATRIZ.push({
                        paymentDate, paymentDueDate, entryDueDate: '2026-09-30',
                        paymentAmount, entryAmount: 1500.5, paymentMethodModal,
                        hojeDoNavegador: '2026-10-16',
                    })
                }
            }
        }
    }

    it('são 24 combinações, e nenhuma difere — valor', () => {
        expect(MATRIZ).toHaveLength(24)
        for (const e of MATRIZ) {
            expect(payloadNovo(e)).toEqual(payloadAntigo(e))
        }
    })

    it('nenhuma difere — ORDEM DAS CHAVES, que é o que a serialização vê', () => {
        for (const e of MATRIZ) {
            expect(Object.keys(payloadNovo(e))).toEqual(Object.keys(payloadAntigo(e)))
        }
    })

    it('a combinação que reagenda traz `due_date`; a que não reagenda, não', () => {
        // O caso que DISCRIMINA: sem este par, "os dois são iguais" passaria verde com o
        // módulo ignorando `reagendar` — `teste-que-nao-exercita.md`, variante 2.
        const reagenda = MATRIZ.find((e) => e.paymentDueDate === '2026-12-01')!
        const naoReagenda = MATRIZ.find((e) => e.paymentDueDate === '2026-09-30')!
        expect(payloadNovo(reagenda).due_date).toBe('2026-12-01')
        expect('due_date' in payloadNovo(naoReagenda)).toBe(false)
    })

    it('o fluxo de caixa SEMPRE manda `amount` — é a tela que corrige valor', () => {
        for (const e of MATRIZ) expect('amount' in payloadNovo(e)).toBe(true)
    })
})

// ════════════════════════════════════════════════════════════════════════════════════════
describe('4 — a tela usa o módulo, e não monta mais o payload inline', () => {
    const ARQUIVO = path.join(process.cwd(), 'src/pages/fluxo-de-caixa/index.tsx')
    const fonte = fs.readFileSync(ARQUIVO, 'utf-8')
    /** Sem comentários: a prosa que EXPLICA o payload não pode derrubar o caso. */
    const semComentarios = fonte.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')

    it('importa `montarPayloadDaBaixa`', () => {
        expect(semComentarios).toContain("from '@/utils/baixa-de-parcela'")
        expect(semComentarios).toContain('montarPayloadDaBaixa')
    })

    it('o corpo de `handleRegisterPayment` não nomeia mais as colunas', () => {
        const inicio = semComentarios.indexOf('const handleRegisterPayment')
        expect(inicio).toBeGreaterThan(0)
        const corpo = semComentarios.slice(inicio, semComentarios.indexOf('const handleExportMultiMonth'))
        expect(corpo).toContain('montarPayloadDaBaixa(')
        // MUTAÇÃO: voltar a montar o objeto ali dentro.
        expect(corpo).not.toContain('paid_date:')
        expect(corpo).not.toContain('payment_method:')
    })
})
