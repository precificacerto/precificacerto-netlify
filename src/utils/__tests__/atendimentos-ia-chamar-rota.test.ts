/**
 * @jest-environment node
 *
 * PORTÃO — `chamarRota` (`src/page-parts/atendimentos-ia/api.ts`): o motivo que a tela mostra quando a
 * rota falha. O caso que o originou (dono do produto, 26/10/2026): a reimportação da Wolff passou do
 * limite e a tela disse só que a importação não foi concluída; o motivo só aparecia no log.
 *
 * Quando é a PLATAFORMA que corta a rota pelo tempo (504, sem JSON), a tela tem de dizer isso — e não
 * "Erro 504". Quando a rota responde com JSON, a frase dela é a que vale, como antes.
 */
import { chamarRota, FRASE_DO_LIMITE_DA_ROTA } from '@/page-parts/atendimentos-ia/api'

const responder = (status: number, corpo: string, tipo = 'application/json') =>
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(corpo, { status, headers: { 'Content-Type': tipo } }))

afterEach(() => jest.restoreAllMocks())

describe('o motivo da falha da rota', () => {
    it('504 SEM JSON (a plataforma cortou a rota pelo tempo): a frase diz que foi o limite de tempo', async () => {
        responder(504, 'An error occurred with your deployment\n\nFUNCTION_INVOCATION_TIMEOUT', 'text/plain')
        await expect(chamarRota('/api/x', 'POST')).rejects.toThrow(FRASE_DO_LIMITE_DA_ROTA)
        expect(FRASE_DO_LIMITE_DA_ROTA).toContain('limite de tempo')
        expect(FRASE_DO_LIMITE_DA_ROTA).toContain('504')
    })

    it('com JSON, a frase da ROTA é a que vale — inclusive num 504', async () => {
        responder(504, JSON.stringify({ error: 'frase da rota' }))
        await expect(chamarRota('/api/x', 'POST')).rejects.toThrow('frase da rota')
        responder(500, JSON.stringify({ error: 'outra frase' }))
        await expect(chamarRota('/api/x', 'POST')).rejects.toThrow('outra frase')
    })

    it('outro status sem JSON continua dizendo o status', async () => {
        responder(502, 'Bad Gateway', 'text/plain')
        await expect(chamarRota('/api/x')).rejects.toThrow('Erro 502')
    })
})
