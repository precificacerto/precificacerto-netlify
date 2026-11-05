/**
 * O PRAZO de uma chamada externa (04/11/2026): o `AbortController` que dispara em `ms`, com o despertador cancelável.
 * É `setTimeout`, não `AbortSignal.timeout`, de propósito: é com o relógio fingido do Jest que os testes da conversa adiantam o tempo.
 */
import { prazo } from '@/lib/atendimentos-ia/prazo'

describe('prazo(ms): o signal aborta no prazo, nem antes; limpar() cancela', () => {
    beforeEach(() => { jest.useFakeTimers() })
    afterEach(() => { jest.useRealTimers() })

    it('não aborta um milissegundo antes do prazo e aborta exatamente nele', () => {
        const p = prazo(1_000)
        jest.advanceTimersByTime(999)
        expect(p.estourou()).toBe(false)
        expect(p.signal.aborted).toBe(false)
        jest.advanceTimersByTime(1)
        expect(p.estourou()).toBe(true)
        expect(p.signal.aborted).toBe(true)
    })

    it('limpar() cancela o despertador: a chamada que voltou a tempo não é abortada depois, e nenhum timer sobra', () => {
        const p = prazo(1_000)
        p.limpar()
        expect(jest.getTimerCount()).toBe(0)
        jest.advanceTimersByTime(10_000)
        expect(p.estourou()).toBe(false)
    })

    it('o signal é o que um fetch recebe: o ouvinte de abort dispara no prazo', () => {
        const p = prazo(500)
        const abortou = jest.fn()
        p.signal.addEventListener('abort', abortou)
        jest.advanceTimersByTime(499)
        expect(abortou).not.toHaveBeenCalled()
        jest.advanceTimersByTime(1)
        expect(abortou).toHaveBeenCalledTimes(1)
    })
})
