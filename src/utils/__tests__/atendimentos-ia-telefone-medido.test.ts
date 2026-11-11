/**
 * @jest-environment node
 *
 * PORTÃO — O TELEFONE MEDIDO NO CANAL (dono do produto, 11/11/2026), o lado do banco da ordem de autoridade:
 *   `numerosEntreguesPeloCanal` lê só o tenant, a conversa antes da tentativa, só dígitos;
 *   `registrarFormatoMedido` grava só o MESMO número (casa pela forma normalizada), só se mudou, conferindo o valor anterior; o conflito da
 *   UNIQUE e a falha não lançam; o log nunca leva o telefone.
 */
type Linha = Record<string, unknown>
const banco = {
    db: {} as Record<string, Linha[]>,
    updates: [] as Array<{ tabela: string; carga: Linha; filtros: Array<[string, unknown]> }>,
    erroNoUpdate: null as { code?: string; message: string } | null,
}
jest.mock('@/supabase/admin', () => ({
    supabaseAdmin: {
        from: (tabela: string) => {
            const filtros: Array<[string, unknown]> = []
            let carga: Linha | null = null
            const q: Record<string, unknown> = {}
            const linhas = () => (banco.db[tabela] ?? []).filter((l) => filtros.every(([c, v]) => l[c] === v))
            q.select = () => q
            q.eq = (c: string, v: unknown) => { filtros.push([c, v]); return q }
            q.update = (c: Linha) => { carga = c; return q }
            q.then = (ok: (v: unknown) => unknown, e?: (x: unknown) => unknown) => {
                if (carga) {
                    banco.updates.push({ tabela, carga, filtros })
                    if (banco.erroNoUpdate) return Promise.resolve({ data: null, error: banco.erroNoUpdate }).then(ok, e)
                    const atingidas = linhas()
                    for (const l of atingidas) Object.assign(l, carga)
                    return Promise.resolve({ data: atingidas.map((l) => ({ id: l.id })), error: null }).then(ok, e)
                }
                return Promise.resolve({ data: linhas(), error: null }).then(ok, e)
            }
            return q
        },
    },
}))

/* eslint-disable @typescript-eslint/no-require-imports */
const M = require('@/lib/atendimentos-ia/telefone-medido') as typeof import('@/lib/atendimentos-ia/telefone-medido')
/* eslint-enable @typescript-eslint/no-require-imports */

const T = 'tenant-1'
let logs: string[] = []
let espiao: jest.SpyInstance
beforeEach(() => {
    banco.updates = []
    banco.erroNoUpdate = null
    banco.db = {
        orcamentista_remetente_autorizado: [{ id: 'rem-1', tenant_id: T, telefone: '51999114290' }],
        orcamentista_conversa: [
            { tenant_id: 'outra', telefone: '5511900000000' },
            { tenant_id: T, telefone: '555199114290' },
        ],
        orcamentista_tentativa_desconhecida: [{ tenant_id: T, telefone: '+55 (54) 9988-7766' }],
    }
    logs = []
    espiao = jest.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')) })
})
afterEach(() => espiao.mockRestore())

describe('os números que o canal entregou', () => {
    it('só do tenant, a conversa antes da tentativa, só dígitos', async () => {
        expect(await M.numerosEntreguesPeloCanal(T)).toEqual(['555199114290', '555499887766'])
    })
})

describe('registrar o formato medido', () => {
    it('o mesmo número em outro formato: GRAVA, conferindo o tenant, o id e o valor anterior; o log diz só o resultado', async () => {
        expect(await M.registrarFormatoMedido(T, 'rem-1', '51999114290', '555199114290', 'webhook')).toBe('gravado')
        expect(banco.db.orcamentista_remetente_autorizado[0].telefone).toBe('555199114290')
        expect(banco.updates[0].filtros).toEqual([['tenant_id', T], ['id', 'rem-1'], ['telefone', '51999114290']])
        expect(logs.join('\n')).toContain('remetente=rem-1 origem=webhook registro=gravado')
        expect(logs.join('\n')).not.toMatch(/5199|99114290/)
    })
    it('igual ao gravado: nada a fazer, nenhuma escrita', async () => {
        expect(await M.registrarFormatoMedido(T, 'rem-1', '51999114290', '51999114290', 'envio')).toBe('igual')
        expect(banco.updates).toEqual([])
    })
    it('OUTRO número (não casa pela forma normalizada): recusa, nenhuma escrita — um envio aceito por outro número não é medição deste', async () => {
        expect(await M.registrarFormatoMedido(T, 'rem-1', '51999114290', '555188887777', 'envio')).toBe('nao_casa')
        expect(await M.registrarFormatoMedido(T, 'rem-1', '51999114290', 'abc', 'envio')).toBe('nao_casa')
        expect(banco.updates).toEqual([])
    })
    it('o gravado mudou antes (outro caminho escreveu): nada é sobrescrito', async () => {
        banco.db.orcamentista_remetente_autorizado[0].telefone = '5551999114290'
        expect(await M.registrarFormatoMedido(T, 'rem-1', '51999114290', '555199114290', 'envio')).toBe('mudou_antes')
        expect(banco.db.orcamentista_remetente_autorizado[0].telefone).toBe('5551999114290')
    })
    it('a UNIQUE recusa (23505) e a falha: não lançam, e o resultado é nomeado', async () => {
        banco.erroNoUpdate = { code: '23505', message: 'duplicate key' }
        expect(await M.registrarFormatoMedido(T, 'rem-1', '51999114290', '555199114290', 'envio')).toBe('conflito')
        banco.erroNoUpdate = { message: 'fora do ar' }
        expect(await M.registrarFormatoMedido(T, 'rem-1', '51999114290', '555199114290', 'envio')).toBe('falhou')
    })
})

// módulo, não script: as constantes deste arquivo não vazam para os outros testes (TS2451)
export {}
