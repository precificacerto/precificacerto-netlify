/**
 * @jest-environment node
 *
 * PORTÃO — a ROTA da importação: POST e GET /api/super-admin/atendimentos-ia/tabelas/[id]/importar.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * >>> O QUE ESTE PORTÃO **NÃO** ALCANÇA <<<
 * O REPOSITÓRIO é falso: o Storage e a função `importar_conteudo_da_tabela` não rodam aqui. A
 * função foi exercitada num Postgres real (relato do bloco que a escreveu); o leitor é o REAL,
 * sobre planilhas montadas com o exceljs. O que este portão prova é o que a ROTA decide: quem
 * passa, o que é recusado antes de baixar e antes de gravar, e o que se diz em cada recusa.
 *
 * E UM LIMITE QUE ESTE PORTÃO NÃO FINGE COBRIR: "contagem divergente NÃO grava". A função faz
 * COMMIT ao terminar a chamada; a rota só vê as contagens DEPOIS. O que este portão afirma é o
 * que a rota consegue: divergência vira 500, com os dois números lado a lado — nunca sucesso.
 *
 * A TRAVA DO TEMPO (24/10/2026) FOI REMOVIDA em 25/10/2026, por decisão do dono do produto: o tempo
 * mora em `orcamentista_motor_tipologia_tempo` (20261024000003), que a função de importação não
 * alcança, e a razão da trava acabou. O que este portão prova é que a ROTA não consulta tempo nem o
 * manda à função. Que a FUNÇÃO não apaga os tempos — os 164, soma 87.300 — é provado num Postgres
 * real: `scripts/harness/reimportacao-com-os-tempos/`.
 * ══════════════════════════════════════════════════════════════════════════════════════════
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- os clientes falsos imitam clientes sem tipo */
import type { NextApiRequest, NextApiResponse } from 'next'
import ExcelJS from 'exceljs'
import fs from 'fs'
import path from 'path'

import { MOTIVO_DA_EXTENSAO_NAO_IMPORTAVEL, ROTAS_DO_CATALOGO, fraseDoArquivoNaoImportavel } from '@/utils/atendimentos-ia-catalogo'
import { COLUNA_DA_CATEGORIA_DO_FORNECEDOR, COLUNAS_DO_LAYOUT_UNICO } from '@/utils/atendimentos-ia-importacao'

interface Perfil { id: string; tenant_id: string | null; role: string; is_super_admin: boolean }
const SUPER: Perfil = { id: 'u-super', tenant_id: null, role: 'super_admin', is_super_admin: true }
const ADMIN: Perfil = { id: 'u-admin', tenant_id: 't-a', role: 'admin', is_super_admin: false }
let perfil: Perfil | null = SUPER

jest.mock('@/supabase/admin', () => ({
    supabaseAdmin: {
        auth: {
            getUser: async (): Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }> =>
                (perfil ? { data: { user: { id: perfil.id } }, error: null } : { data: { user: null }, error: { message: 'sem sessão' } }),
        },
        from: () => { const q: any = { select: () => q, eq: () => q, single: async (): Promise<{ data: Perfil | null; error: null }> => ({ data: perfil, error: null }) }; return q },
    },
}))

import { abasDoSpec } from './fixtures/abas-do-motor-do-spec'
import { ABAS_DO_MOTOR } from '@/utils/atendimentos-ia-abas-do-motor'

const T = '22222222-2222-4222-8222-222222222222'
const TABELA = { id: T, fornecedor_id: 'f', arquivo_path: 'f/arquivo/x-Tabela Wolff.xlsm', arquivo_nome: 'Tabela Wolff.xlsm', motor_path: 'f/motor/x-Motor.xlsx', motor_nome: 'Motor.xlsx', categoria_chave: null as string | null }

const ordem: string[] = []
const objetos: Record<string, Uint8Array> = {}
jest.mock('@/lib/atendimentos-ia/repositorio', () => {
    const real = jest.requireActual('@/lib/atendimentos-ia/repositorio')
    const fn = (nome: string, impl: (...a: any[]) => any) => jest.fn(async (...a: any[]) => { ordem.push(nome); return impl(...a) })
    return {
        ErroDoBanco: real.ErroDoBanco,
        codigoDoErro: real.codigoDoErro,
        falhaInterna: real.falhaInterna,
        obterArquivosDaTabela: fn('obterArquivosDaTabela', () => TABELA),
        objetoExiste: fn('objetoExiste', (p: string) => p in objetos),
        baixarObjeto: fn('baixarObjeto', (p: string) => objetos[p]),
        // a função devolve a contagem de CADA lista que gravou: as quatro de sempre e as nove abas
        // superadmin_importar_tabela (20261112000003): a de dentro devolve as contagens; a de fora acrescenta antes, depois, sha256 e a troca
        importarTabela: fn('importarTabela', ({ payload: p, sha256, arquivo }: any) => ({
            importacao_id: 'imp-1', itens_antes: 0, itens_depois: p.itens.length, sha256, arquivo_trocado: arquivo !== null,
            ...Object.fromEntries(Object.entries(p).filter(([k, v]) => Array.isArray(v) && k !== 'avisos').map(([k, v]) => [k, (v as unknown[]).length])),
        })),
        ultimaImportacao: fn('ultimaImportacao', () => null),
        nomeDoUsuario: fn('nomeDoUsuario', () => 'Cristiano'),
        obterDadosDaTabela: fn('obterDadosDaTabela', () => DADOS),
        listarTipologias: fn('listarTipologias', () => TIPOLOGIAS_DO_BANCO),
        contarFormulas: fn('contarFormulas', () => 137),
        // os itens GRAVADOS da tabela (02/11/2026): é o número com que a tela diz "não importada"
        contarItensDaTabela: fn('contarItensDaTabela', () => 755),
        // a tabela da Wolff COM os 164 tempos de produção: se a rota voltasse a consultá-los para travar,
        // os casos da importação ficariam vermelhos
        contarTemposGravados: fn('contarTemposGravados', () => ({ total: 164, ESTIMADO: 164, IMPORTADO: 0 })),
        codigosDosItensGravados: fn('codigosDosItensGravados', () => []),
    }
})
const DADOS = { id: T, fornecedor_id: 'f1', fornecedor_nome: 'Wolf Perfis', arquivo_nome: 'Tabela Wolff.xlsm', motor_nome: 'Motor.xlsx', vigencia: null as string | null }
/** Fora de ordem de propósito: quem ordena é a ROTA. */
const TIPOLOGIAS_DO_BANCO = [
    { tipologia: 'DP-01', linha: 'EUROPA 42', n_regras: 136, n_condicionais: 36, variaveis: ['ARE'] },
    { tipologia: 'SEM', linha: null, n_regras: 5, n_condicionais: 0, variaveis: [] },
    { tipologia: 'DP-148', linha: 'EUROPA 42', n_regras: 837, n_condicionais: 835, variaveis: ['AQ'] },
]
// eslint-disable-next-line @typescript-eslint/no-require-imports
const repo = require('@/lib/atendimentos-ia/repositorio') as Record<string, jest.Mock>
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rota = require('@/pages/api/super-admin/atendimentos-ia/tabelas/[id]/importar') as { default: (q: NextApiRequest, s: NextApiResponse) => Promise<unknown>; config: { maxDuration: number } }
type Handler = (q: NextApiRequest, s: NextApiResponse) => Promise<unknown>
/* eslint-disable @typescript-eslint/no-require-imports */
const ROTA_DA_TABELA = require('@/pages/api/super-admin/atendimentos-ia/tabelas/[id]').default as Handler
const ROTA_DO_CONTEUDO = require('@/pages/api/super-admin/atendimentos-ia/tabelas/[id]/conteudo').default as Handler
/* eslint-enable @typescript-eslint/no-require-imports */

async function chamar(method: string, id: string = T, handler: Handler = rota.default, body: unknown = undefined) {
    let status = 0
    let json: any = null
    const res = { status(n: number) { status = n; return res }, json(b: unknown) { json = b; return res } }
    await handler({ cookies: { token: 't' }, method, query: { id }, body } as unknown as NextApiRequest, res as unknown as NextApiResponse)
    return { status, json }
}

async function planilha(abas: Record<string, Array<Record<number, ExcelJS.CellValue>>>): Promise<Uint8Array> {
    const wb = new ExcelJS.Workbook()
    for (const [nome, linhas] of Object.entries(abas)) {
        const ws = wb.addWorksheet(nome)
        linhas.forEach((c, i) => { for (const [k, v] of Object.entries(c)) ws.getRow(i + 1).getCell(Number(k)).value = v })
    }
    return new Uint8Array(await wb.xlsx.writeBuffer())
}
const ARQUIVOS_BONS = async () => ({
    [TABELA.arquivo_path]: await planilha({ 'Tabela Wolff': [
        { 1: 'LAMINADOS' }, { 2: 'CÓDIGO', 13: 'VALOR METRO 18%', 15: 'VALOR BARRA 18%' },
        { 2: 'IL4237', 11: 'ALUMÍNIO', 13: { formula: 'A1', result: 83.52 } }, { 2: 'KT4237', 13: 10 },
    ] }),
    [TABELA.motor_path]: await planilha({
        'Motor por barra': [{ 1: 'CÓDIGO' }, { 1: 'IL4237', 14: 'DP-01', 15: 'ARE > 0' }, { 1: 'Z9', 14: 'DP-02' }],
        'Fórmulas da família': [{ 1: 'LINHA' }, { 1: 'PVC EUROPA 42', 2: 'L' }],
        ...abasDoSpec(),
    }),
})

/** A contagem de cada lista do payload, como a função devolve. */
const contagensDe = (p: any) => Object.fromEntries(Object.entries(p).filter(([k, v]) => Array.isArray(v) && k !== 'avisos').map(([k, v]) => [k, (v as unknown[]).length]))

/** Os 164 tempos ESTIMADO da tabela da Wolff, como estão em produção em 25/10/2026. */
const OS_164 = { total: 164, ESTIMADO: 164, IMPORTADO: 0 }

/** O importador, lido DENTRO dos casos: no commit do portão as frases novas ainda não existem. */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const IMP = () => require('@/utils/atendimentos-ia-importacao') as { LIMITE_DA_GRAVACAO_S: number; fraseDaGravacaoQueFalhou: (codigo: string | null) => string }
const silencio = jest.spyOn(console, 'error').mockImplementation(() => {})
const registro = jest.spyOn(console, 'log').mockImplementation(() => {})
afterAll(() => registro.mockRestore())
afterAll(() => silencio.mockRestore())
beforeEach(async () => {
    perfil = SUPER
    ordem.length = 0
    for (const k of Object.keys(objetos)) delete objetos[k]
    Object.assign(objetos, await ARQUIVOS_BONS())
    Object.values(repo).forEach((f) => { if (typeof f?.mockClear === 'function') f.mockClear() })
    repo.obterArquivosDaTabela.mockImplementation(async () => { ordem.push('obterArquivosDaTabela'); return TABELA })
    repo.contarTemposGravados.mockImplementation(async () => { ordem.push('contarTemposGravados'); return OS_164 })
    repo.codigosDosItensGravados?.mockImplementation(async () => { ordem.push('codigosDosItensGravados'); return [] })
})

describe('quem passa', () => {
    it.each(['POST', 'GET'])('%s sem sessão → 401, e o repositório não é tocado', async (m) => {
        perfil = null
        const r = await chamar(m)
        expect(r.status).toBe(401)
        expect(ordem).toEqual([])
    })

    it.each(['POST', 'GET'])('%s sem ser super admin → 403, e o repositório não é tocado', async (m) => {
        perfil = ADMIN
        const r = await chamar(m)
        expect(r.status).toBe(403)
        expect(ordem).toEqual([])
    })

    it.each(['POST', 'GET'])('%s em tabela inexistente → 404', async (m) => {
        repo.obterArquivosDaTabela.mockImplementation(async () => null)
        const r = await chamar(m)
        expect(r.status).toBe(404)
        expect(repo.importarTabela).not.toHaveBeenCalled()
    })

    it('o limite de tempo da gravação no código é o MESMO da migração que o dá à função (35 s)', () => {
        const sql = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261026000001_limite_de_tempo_da_importacao.sql'), 'utf8')
        const m = sql.match(/ALTER FUNCTION public\.importar_conteudo_da_tabela\(uuid, jsonb\) SET statement_timeout = '(\d+)s';/)
        expect(m).not.toBeNull()
        expect(Number(m![1])).toBe(IMP().LIMITE_DA_GRAVACAO_S)
        expect(IMP().LIMITE_DA_GRAVACAO_S).toBe(35)
    })

    it('o maxDuration da rota cobre o que vem ANTES da gravação (28 s medidos) mais o limite da função, com folga', () => {
        // 25/10/2026, a reimportação da Wolff em produção: ~9 s lendo do Storage e parseando, ~19 s até o
        // comando começar no banco (18,1 MB de corpo). Com menos que isso, a rota morre antes do banco e a
        // tela volta a dizer só que não foi concluída
        expect(rota.config.maxDuration).toBeGreaterThanOrEqual(IMP().LIMITE_DA_GRAVACAO_S + 28 + 15)
        expect(rota.config.maxDuration).toBe(90)
    })

    it('a rota está no catálogo de rotas da tela', () => {
        expect(ROTAS_DO_CATALOGO.importacao(T)).toBe(`/api/super-admin/atendimentos-ia/tabelas/${T}/importar`)
    })
})

describe('409 por extensão não importável — QUAL arquivo, QUAL extensão e POR QUÊ', () => {
    it.each([
        ['arquivo', 'Tabela antiga.xls', '.xls'],
        ['arquivo', 'Tabela.csv', '.csv'],
        ['motor', 'Motor.pdf', '.pdf'],
    ])('%s %s', async (qual, nome, ext) => {
        repo.obterArquivosDaTabela.mockImplementation(async () => ({ ...TABELA, [`${qual}_nome`]: nome }))
        const r = await chamar('POST')
        expect(r.status).toBe(409)
        expect(r.json.error).toBe(fraseDoArquivoNaoImportavel(nome))
        expect(r.json.error).toContain(nome)
        expect(r.json.error).toContain(ext)
        expect(r.json.error).toContain(MOTIVO_DA_EXTENSAO_NAO_IMPORTAVEL[ext])
        expect(repo.baixarObjeto).not.toHaveBeenCalled()
        expect(repo.importarTabela).not.toHaveBeenCalled()
    })
})

describe('409 por arquivo ausente no Storage — dizendo qual caminho faltou', () => {
    it.each([['arquivo'], ['motor']])('o %s não está no bucket', async (qual) => {
        const caminho = qual === 'arquivo' ? TABELA.arquivo_path : TABELA.motor_path
        delete objetos[caminho]
        const r = await chamar('POST')
        expect(r.status).toBe(409)
        expect(r.json.error).toContain(caminho)
        expect(r.json.error).toContain(qual === 'arquivo' ? TABELA.arquivo_nome : TABELA.motor_nome)
        expect(repo.importarTabela).not.toHaveBeenCalled()
    })
})

describe('a importação', () => {
    it('lê com o leitor real, grava pela função, e responde as contagens e os avisos', async () => {
        const r = await chamar('POST')
        expect(r.status).toBe(200)
        expect(repo.importarTabela).toHaveBeenCalledTimes(1)
        const { tabelaId: id, payload } = repo.importarTabela.mock.calls[0][0]
        expect(id).toBe(T)
        expect(payload.importado_por).toBe(SUPER.id)
        expect(payload.itens.map((i: any) => i.codigo)).toEqual(['IL4237', 'KT4237'])
        expect(payload.itens[0].valor_metro_interno).toBe(83.52)
        expect(payload.itens[0][COLUNA_DA_CATEGORIA_DO_FORNECEDOR]).toBe('ALUMÍNIO')
        expect(payload.contagens).toEqual(expect.objectContaining({ itens: 2, regras: 2, cruzam: 1, nao_cruzam: 1 }))
        expect(r.json.contagens).toEqual(expect.objectContaining({ itens: 2, regras: 2, tipologias: 2, formulas: 1, cruzam: 1, nao_cruzam: 1, normalizados: 0 }))
        expect(r.json.importacao_id).toBe('imp-1')
        expect(r.json.avisos).toEqual(expect.arrayContaining([expect.objectContaining({ tipo: 'codigo_do_motor_sem_preco', codigos: ['Z9'] })]))
    })

    it('planilha que o leitor recusa (aba faltando) → 422 com a frase dele, e nada é gravado', async () => {
        objetos[TABELA.motor_path] = await planilha({ Outra: [{ 1: 'x' }] })
        const r = await chamar('POST')
        expect(r.status).toBe(422)
        expect(r.json.error).toContain('Motor.xlsx')
        expect(r.json.error).toContain('Motor por barra')
        expect(repo.importarTabela).not.toHaveBeenCalled()
    })

    // as nove abas entram na conferência como as quatro de sempre: a lista vem do mapa, não de cópia
    it.each([['itens'], ['regras'], ['tipologias'], ['formulas'], ...ABAS_DO_MOTOR.map((a) => [a.payload])])('contagem divergente em %s → 500 com os dois números lado a lado, nunca sucesso', async (campo) => {
        repo.importarTabela.mockImplementationOnce(async ({ payload: p }: any) => ({
            importacao_id: 'imp-2', ...contagensDe(p),
            [campo]: p[campo].length + 1,
        }))
        const r = await chamar('POST')
        expect(r.status).toBe(500)
        expect(r.json.enviado[campo]).not.toBe(r.json.gravado[campo])
        expect(r.json.gravado[campo]).toBe(r.json.enviado[campo] + 1)
        expect(r.json.error).toMatch(/não conferiu/)
    })
})

describe('as nove abas na gravação', () => {
    it('o payload leva as nove abas pela chave do mapa, e a função que não devolve a contagem de uma delas é divergência', async () => {
        repo.importarTabela.mockImplementationOnce(async ({ payload: p }: any) => {
            const c = contagensDe(p)
            delete c.insumos
            return { importacao_id: 'imp-3', ...c }
        })
        const r = await chamar('POST')
        const enviado = repo.importarTabela.mock.calls[0][0].payload
        for (const a of ABAS_DO_MOTOR) expect(Array.isArray(enviado[a.payload])).toBe(true)
        expect(enviado.perfis.length).toBeGreaterThan(0)
        expect(r.status).toBe(500)
        expect(r.json).toEqual(expect.objectContaining({ gravado: expect.objectContaining({ insumos: null }) }))
    })

    it('aba do motor que falta no arquivo → 422 nomeando a aba, e nada é gravado', async () => {
        const motor = await planilha({
            'Motor por barra': [{ 1: 'CÓDIGO' }, { 1: 'IL4237', 14: 'DP-01' }],
            'Fórmulas da família': [{ 1: 'LINHA' }],
            ...Object.fromEntries(Object.entries(abasDoSpec()).filter(([n]) => n !== 'Vidros')),
        })
        objetos[TABELA.motor_path] = motor
        const r = await chamar('POST')
        expect(r.status).toBe(422)
        expect(r.json.error).toContain('não tem a aba "Vidros"')
        expect(repo.importarTabela).not.toHaveBeenCalled()
    })
})

describe('A GRAVAÇÃO QUE FALHA DIZ O MOTIVO NA TELA — e a duração dela fica no log', () => {
    const falhar = (erro: { code?: string; message: string }) =>
        repo.importarTabela.mockImplementationOnce(async () => { ordem.push('importarTabela'); throw erro })

    it('TEMPO esgotado no banco (57014): a tela diz que foi o limite de tempo, e quanto ele é', async () => {
        falhar({ code: '57014', message: 'canceling statement due to statement timeout' })
        const r = await chamar('POST')
        expect(r.status).toBe(500)
        expect(r.json.error).toBe(IMP().fraseDaGravacaoQueFalhou('57014'))
        expect(r.json.error).toContain('limite de tempo')
        expect(r.json.error).toContain('35 s')
        expect(r.json.error).toContain('nada foi alterado')
    })

    it('LOCK esgotado (55P03): a tela diz que a tabela estava travada por outra operação', async () => {
        falhar({ code: '55P03', message: 'canceling statement due to lock timeout' })
        const r = await chamar('POST')
        expect(r.json.error).toBe(IMP().fraseDaGravacaoQueFalhou('55P03'))
        expect(r.json.error).toContain('travada')
    })

    it('outro erro do banco: a tela diz o CÓDIGO, nunca o texto do banco', async () => {
        const texto = 'new row for relation "orcamentista_motor_insumo" violates check constraint "x"'
        falhar({ code: '23514', message: texto })
        const r = await chamar('POST')
        expect(r.json.error).toBe(IMP().fraseDaGravacaoQueFalhou('23514'))
        expect(r.json.error).toContain('23514')
        expect(r.json.error).not.toBe(texto)
        expect(r.json.error.includes(texto)).toBe(false)
    })

    it('as quatro frases são DIFERENTES entre si — cada motivo tem a sua', () => {
        const frases = ['57014', '55P03', '23514', null].map((c) => IMP().fraseDaGravacaoQueFalhou(c))
        expect(new Set(frases).size).toBe(4)
    })

    it('a duração da gravação vai para o log, no sucesso e na falha — é ela que calibra o limite', async () => {
        registro.mockClear()
        await chamar('POST')
        falhar({ code: '57014', message: 'canceling statement due to statement timeout' })
        await chamar('POST')
        const linhas = registro.mock.calls.map((c) => c.join(' ')).filter((l) => /importação \(gravação\)/.test(l))
        expect(linhas).toHaveLength(2)
        expect(linhas[0]).toMatch(/^atendimentos-ia importação \(gravação\): \d+ ms, gravada$/)
        expect(linhas[1]).toMatch(/^atendimentos-ia importação \(gravação\): \d+ ms, falhou \(57014\)$/)
    })
})

describe('SEM A TRAVA DO TEMPO — o tempo mora em tabela que a importação não alcança', () => {
    it('a tabela da Wolff com os 164 tempos gravados: a importação roda até o fim (200) e grava', async () => {
        const r = await chamar('POST')
        expect(r.status).toBe(200)
        expect(repo.importarTabela).toHaveBeenCalledTimes(1)
        expect(repo.contarTemposGravados).not.toHaveBeenCalled()
        expect(ordem).not.toContain('contarTemposGravados')
    })

    it('o payload não carrega tempo nenhum: a função não tem o que escrever na tabela de tempos', async () => {
        await chamar('POST')
        const payload = repo.importarTabela.mock.calls[0][0].payload as Record<string, unknown>
        const chaves = new Set(Object.values(payload).filter(Array.isArray).flatMap((l) => (l as Array<Record<string, unknown>>).flatMap((x) => (x && typeof x === 'object' ? Object.keys(x) : []))))
        expect([...chaves].filter((k) => /tempo/i.test(k))).toEqual([])
        expect(Object.keys(payload).filter((k) => /tempo/i.test(k))).toEqual([])
    })
})

describe('A PRÉVIA DA TROCA — entram, saem, ficam; nada grava sem a confirmação (dono do produto, 12/11/2026)', () => {
    // Substitui a trava de 25/10/2026 (recusar todo arquivo sem algum código gravado), que travaria todo reajuste: ela vira esta prévia.
    // O arquivo de ARQUIVOS_BONS traz IL4237 e KT4237.
    const gravados = (c: string[]) => repo.codigosDosItensGravados.mockImplementation(async () => { ordem.push('codigosDosItensGravados'); return c })
    const post = (body: unknown) => chamar('POST', T, rota.default, body)
    const NOVO = { arquivo_path: 'f/arquivo/y-Tabela Wolff 2026.xlsm', arquivo_nome: 'Tabela Wolff 2026.xlsm' }

    it('tabela COM itens e sem confirmação: devolve a prévia (entram, saem com os códigos, ficam) e o sha256 — e NÃO grava', async () => {
        gravados(['IL4237', 'VIDRO 4MM', 'VIDRO 6MM'])
        const r = await post(undefined)
        expect(r.status).toBe(200)
        expect(r.json.importacao_id).toBeUndefined()
        expect(r.json.previa).toEqual(expect.objectContaining({ antes: 3, entram: 2, ficam: 1, novos: 1, saem: ['VIDRO 4MM', 'VIDRO 6MM'], encolhe: true }))
        expect(r.json.previa.frase).toBe('Entram 2, saem 2, ficam 1 (1 código novo).')
        expect(r.json.previa.sha256).toMatch(/^[0-9a-f]{64}$/)
        expect(repo.importarTabela).not.toHaveBeenCalled()
    })

    it('o sha256 da prévia é o do arquivo lido: o mesmo arquivo dá o mesmo, outro arquivo dá outro', async () => {
        gravados(['IL4237'])
        const a = (await post(undefined)).json.previa.sha256
        expect((await post(undefined)).json.previa.sha256).toBe(a)
        objetos[TABELA.arquivo_path] = await planilha({ 'Tabela Wolff': [{ 1: 'X' }, { 2: 'CÓDIGO', 13: 'VALOR METRO 18%' }, { 2: 'IL4237', 13: 11 }] })
        expect((await post(undefined)).json.previa.sha256).not.toBe(a)
    })

    it('confirmada com o sha256 da prévia: grava por superadmin_importar_tabela, com quem importou, o sha256 e a permissão', async () => {
        gravados(['IL4237', 'KT4237', 'X1'])
        const previa = (await post(undefined)).json.previa
        repo.importarTabela.mockClear()
        const r = await post({ confirmar: true, sha256: previa.sha256, permitir_encolher: true })
        expect(r.status).toBe(200)
        expect(repo.importarTabela).toHaveBeenCalledTimes(1)
        expect(repo.importarTabela.mock.calls[0][0]).toEqual(expect.objectContaining({ por: 'u-super', tabelaId: T, sha256: previa.sha256, permitirEncolher: true, arquivo: null }))
        expect(r.json.previa.saem).toEqual(['X1'])
    })

    it('confirmada com OUTRO sha256: 409 com a frase do arquivo que mudou e a prévia nova — e NÃO grava', async () => {
        gravados(['IL4237'])
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { FRASE_DO_ARQUIVO_QUE_MUDOU } = require('@/utils/atendimentos-ia-importacao')
        const r = await post({ confirmar: true, sha256: '0'.repeat(64) })
        expect(r.status).toBe(409)
        expect(r.json.error).toBe(FRASE_DO_ARQUIVO_QUE_MUDOU)
        expect(r.json.previa.sha256).toMatch(/^[0-9a-f]{64}$/)
        expect(repo.importarTabela).not.toHaveBeenCalled()
    })

    it('ENCOLHER sem a permissão: 409 com as contagens, ANTES de gravar; com a permissão, grava', async () => {
        gravados(['IL4237', 'KT4237', 'X1'])
        const previa = (await post(undefined)).json.previa
        const sem = await post({ confirmar: true, sha256: previa.sha256 })
        expect(sem.status).toBe(409)
        expect(sem.json.error).toContain('O arquivo novo traz 2 itens, e a tabela tem 3 hoje: ela encolheria 1 itens')
        expect(repo.importarTabela).not.toHaveBeenCalled()
        const com = await post({ confirmar: true, sha256: previa.sha256, permitir_encolher: true })
        expect(com.status).toBe(200)
        expect(repo.importarTabela).toHaveBeenCalledTimes(1)
    })

    it('a troca que NÃO encolhe (sai um, entra outro) grava só com a confirmação, sem pedir permissão de encolher', async () => {
        gravados(['IL4237', 'X1'])
        const previa = (await post(undefined)).json.previa
        expect(previa).toEqual(expect.objectContaining({ antes: 2, entram: 2, saem: ['X1'], encolhe: false }))
        const r = await post({ confirmar: true, sha256: previa.sha256 })
        expect(r.status).toBe(200)
        expect(repo.importarTabela.mock.calls[0][0].permitirEncolher).toBe(false)
    })

    it('a segunda trava, no banco (23514: outra importação mudou a contagem entre a prévia e a gravação): 409 com a frase, nunca 500', async () => {
        gravados(['IL4237', 'KT4237'])
        const previa = (await post(undefined)).json.previa
        repo.importarTabela.mockImplementationOnce(async () => { throw Object.assign(new Error('o arquivo novo traz 1 itens, e a tabela tem 2 hoje: a tabela encolheria 1 itens'), { code: '23514' }) })
        const r = await post({ confirmar: true, sha256: previa.sha256 })
        expect(r.status).toBe(409)
        expect(r.json.error).toContain('Permitir que a tabela encolha')
        // o contraste: outra CHECK dos itens (23514 também) segue a frase do código, como sempre
        repo.importarTabela.mockImplementationOnce(async () => { throw Object.assign(new Error('violates check constraint orcamentista_tabela_item_ipi_de_um_lado'), { code: '23514' }) })
        const outra = await post({ confirmar: true, sha256: previa.sha256 })
        expect(outra.status).toBe(500)
        expect(outra.json.error).toContain('código 23514')
    })

    it('tabela SEM itens (a primeira importação): grava direto, sem prévia — nada sai', async () => {
        gravados([])
        const r = await post(undefined)
        expect(r.status).toBe(200)
        expect(r.json.importacao_id).toBe('imp-1')
        expect(repo.importarTabela).toHaveBeenCalledTimes(1)
    })

    it('o ARQUIVO NOVO (pendente da edição): a prévia lê DELE, e a confirmação manda o caminho à função, que troca junto com os itens', async () => {
        objetos[NOVO.arquivo_path] = await planilha({ 'Tabela Wolff': [{ 1: 'X' }, { 2: 'CÓDIGO', 13: 'VALOR METRO 18%' }, { 2: 'IL4237', 13: 11 }, { 2: 'NOVO1', 13: 12 }, { 2: 'NOVO2', 13: 13 }] })
        gravados(['IL4237', 'KT4237'])
        const previa = (await post(NOVO)).json.previa
        expect(previa).toEqual(expect.objectContaining({ antes: 2, entram: 3, ficam: 1, saem: ['KT4237'], arquivo_nome: 'Tabela Wolff 2026.xlsm', arquivo_trocado: true }))
        expect(repo.baixarObjeto.mock.calls.map((c: any[]) => c[0])).toContain(NOVO.arquivo_path)
        expect(repo.baixarObjeto.mock.calls.map((c: any[]) => c[0])).not.toContain(TABELA.arquivo_path)
        const r = await post({ ...NOVO, confirmar: true, sha256: previa.sha256 })
        expect(r.status).toBe(200)
        expect(repo.importarTabela.mock.calls[0][0].arquivo).toEqual({ path: NOVO.arquivo_path, nome: NOVO.arquivo_nome })
    })

    it('o arquivo pendente de OUTRO fornecedor é recusado (400), antes de baixar', async () => {
        const r = await post({ arquivo_path: 'outro/arquivo/z.xlsx', arquivo_nome: 'z.xlsx' })
        expect(r.status).toBe(400)
        expect(ordem).not.toContain('baixarObjeto')
    })

    it('a comparação é EXATA: "il4237" gravado não é o "IL4237" do arquivo — ele SAI, nomeado', async () => {
        gravados(['il4237'])
        const r = await post(undefined)
        expect(r.json.previa.saem).toEqual(['il4237'])
        expect(r.json.previa.ficam).toBe(0)
    })

    it('erro do banco ao ler os itens gravados → 500, e a importação NÃO segue (falha fechada)', async () => {
        repo.codigosDosItensGravados.mockImplementation(async () => { throw new Error('falhou') })
        const r = await post(undefined)
        expect(r.status).toBe(500)
        expect(repo.importarTabela).not.toHaveBeenCalled()
    })

    it('a função pura: TODOS os códigos que saem, sem corte, sem repetição, na ordem gravada; código repetido gravado conta no antes', () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { previaDaTroca } = require('@/utils/atendimentos-ia-importacao')
        const muitos = Array.from({ length: 24 }, (_, i) => `V${String(i + 1).padStart(2, '0')}`)
        const p = previaDaTroca([...muitos, 'A', 'A'], { itens: [{ codigo: 'A' }, { codigo: 'B' }] })
        expect(p.saem).toEqual(muitos)
        expect(p).toEqual(expect.objectContaining({ antes: 26, entram: 2, ficam: 1, novos: 1, encolhe: true }))
    })
})

describe('UMA TABELA, UMA CATEGORIA DO FORNECEDOR — o arquivo com mais de uma é recusado, nomeando as que achou (27/10/2026)', () => {
    /** A tabela de preço com um item por valor, cada um na coluna da categoria do fornecedor (a 11). */
    async function comCategorias(valores: Array<string | null>) {
        const linhas: Array<Record<number, ExcelJS.CellValue>> = [{ 1: 'LAMINADOS' }, { 2: 'CÓDIGO', 13: 'VALOR METRO 18%', 15: 'VALOR BARRA 18%' }]
        valores.forEach((v, i) => linhas.push({ 2: `C${i + 1}`, ...(v === null ? {} : { 11: v }), 13: 10 + i }))
        objetos[TABELA.arquivo_path] = await planilha({ 'Tabela Wolff': linhas })
    }
    const declarada = (chave: string | null) => repo.obterArquivosDaTabela.mockImplementation(async () => { ordem.push('obterArquivosDaTabela'); return { ...TABELA, categoria_chave: chave } })

    it('tabela que DECLARA a categoria + arquivo com 3 categorias do fornecedor → 422 nomeando as 3 com a contagem, e NADA é gravado nem conferido', async () => {
        declarada('PERFIL')
        await comCategorias(['Perfil PVC', 'Perfil PVC', 'Reforço', 'Acessórios'])
        const r = await chamar('POST')
        expect(r.status).toBe(422)
        expect(r.json.error).toContain('Tabela Wolff.xlsm')
        expect(r.json.error).toContain('3 categorias do fornecedor')
        expect(r.json.error).toContain('Perfil PVC (2)')
        expect(r.json.error).toContain('Reforço (1)')
        expect(r.json.error).toContain('Acessórios (1)')
        expect(r.json.error).toContain('Nada foi alterado.')
        expect(repo.importarTabela).not.toHaveBeenCalled()
        expect(ordem).not.toContain('codigosDosItensGravados')
    })

    it('tabela que declara + arquivo de UMA categoria só → 200, e o aviso de "sem categoria declarada" NÃO aparece', async () => {
        declarada('VIDRO')
        await comCategorias(['Vidro', 'Vidro', 'Vidro'])
        const r = await chamar('POST')
        expect(r.status).toBe(200)
        expect(repo.importarTabela.mock.calls[0][0].payload.itens.map((i: any) => i[COLUNA_DA_CATEGORIA_DO_FORNECEDOR])).toEqual(['Vidro', 'Vidro', 'Vidro'])
        expect(r.json.avisos.map((a: any) => a.tipo)).not.toContain('tabela_sem_categoria_declarada')
        expect(r.json.avisos.map((a: any) => a.tipo)).not.toContain('itens_sem_categoria_do_fornecedor')
    })

    it('a mesma categoria em duas grafias ("Acessórios" e "acessórios", com espaço de sobra) é UMA categoria só', async () => {
        declarada('ACESSORIOS_VEDACAO')
        await comCategorias(['Acessórios', 'acessórios', ' Acessórios  '])
        expect((await chamar('POST')).status).toBe(200)
        expect(repo.importarTabela).toHaveBeenCalledTimes(1)
    })

    it('item SEM a categoria do fornecedor não é somado a nenhuma: grava assim e AVISA quantos', async () => {
        declarada('VIDRO')
        await comCategorias(['Vidro', null, 'Vidro'])
        const r = await chamar('POST')
        expect(r.status).toBe(200)
        expect(repo.importarTabela.mock.calls[0][0].payload.itens.map((i: any) => i[COLUNA_DA_CATEGORIA_DO_FORNECEDOR])).toEqual(['Vidro', null, 'Vidro'])
        const aviso = r.json.avisos.find((a: any) => a.tipo === 'itens_sem_categoria_do_fornecedor')
        expect(aviso).toEqual(expect.objectContaining({ itens: 1 }))
        expect(aviso.mensagem).toContain('1 item do arquivo não traz a categoria do fornecedor')
    })

    it('só itens SEM categoria + uma com: continua UMA categoria (o branco não é categoria)', async () => {
        declarada('VIDRO')
        await comCategorias([null, null, 'Vidro'])
        expect((await chamar('POST')).status).toBe(200)
    })

    it('tabela de ANTES, sem categoria declarada (a Wolff, 4 categorias): NÃO é recusada — importa como sempre, e o aviso diz que a regra não foi aplicada', async () => {
        declarada(null)
        await comCategorias(['Perfil PVC', 'Reforço', 'Acessórios', 'acessórios', null])
        const r = await chamar('POST')
        expect(r.status).toBe(200)
        expect(repo.importarTabela).toHaveBeenCalledTimes(1)
        expect(repo.importarTabela.mock.calls[0][0].payload.itens).toHaveLength(5)
        const tipos = r.json.avisos.map((a: any) => a.tipo)
        expect(tipos).toContain('tabela_sem_categoria_declarada')
        expect(tipos).toContain('itens_sem_categoria_do_fornecedor')
        // o aviso vai no payload, e fica gravado com a importação
        expect(repo.importarTabela.mock.calls[0][0].payload.avisos.map((a: any) => a.tipo)).toContain('tabela_sem_categoria_declarada')
    })

    it('FALHA FECHADA: se a leitura da tabela não trouxe a coluna da categoria (undefined), um arquivo com 2 categorias é RECUSADO — nunca tratado como tabela de antes', async () => {
        repo.obterArquivosDaTabela.mockImplementation(async () => { ordem.push('obterArquivosDaTabela'); return { ...TABELA, categoria_chave: undefined } })
        await comCategorias(['A', 'B'])
        expect((await chamar('POST')).status).toBe(422)
        expect(repo.importarTabela).not.toHaveBeenCalled()
    })

    it('a recusa vem DEPOIS de ler e ANTES de conferir/gravar: o arquivo é baixado, e nada mais acontece', async () => {
        declarada('PERFIL')
        await comCategorias(['A', 'B'])
        await chamar('POST')
        expect(ordem).toEqual(expect.arrayContaining(['obterArquivosDaTabela', 'objetoExiste', 'baixarObjeto']))
        expect(ordem).not.toContain('importarTabela')
    })
})

describe('GET — a última importação', () => {
    it('sem importação nenhuma → null', async () => {
        const r = await chamar('GET')
        expect(r.status).toBe(200)
        expect(r.json).toBeNull()
    })

    it('com importação → a linha que o repositório devolve, com o NOME de quem importou', async () => {
        const linha = { id: 'imp-9', tabela_id: T, importado_por: 'u-super', itens: 755, regras: 4055, tipologias: 157, cruzam: 549, nao_cruzam: 0, normalizados: 2, avisos: [] as unknown[] }
        repo.ultimaImportacao.mockImplementationOnce(async () => linha)
        const r = await chamar('GET')
        expect(r.status).toBe(200)
        expect(r.json).toEqual({ ...linha, importado_por_nome: 'Cristiano' })
        expect(repo.ultimaImportacao).toHaveBeenCalledWith(T)
        expect(repo.nomeDoUsuario).toHaveBeenCalledWith('u-super')
    })

    it('sem quem importou → importado_por_nome null, e o nome não é procurado', async () => {
        repo.ultimaImportacao.mockImplementationOnce(async () => ({ id: 'imp-9', importado_por: null }))
        const r = await chamar('GET')
        expect(r.json.importado_por_nome).toBeNull()
        expect(repo.nomeDoUsuario).not.toHaveBeenCalled()
    })
})

describe('GET /tabelas/[id] — a tabela, para a tela da importação', () => {
    it('devolve os nomes dos arquivos e o fornecedor', async () => {
        const r = await chamar('GET', T, ROTA_DA_TABELA)
        expect(r.status).toBe(200)
        expect(r.json).toEqual(DADOS)
    })
    it('401 sem sessão, 403 sem ser super admin', async () => {
        perfil = null
        expect((await chamar('GET', T, ROTA_DA_TABELA)).status).toBe(401)
        perfil = ADMIN
        expect((await chamar('GET', T, ROTA_DA_TABELA)).status).toBe(403)
        expect(ordem).toEqual([])
    })
    it('404 em tabela inexistente', async () => {
        repo.obterDadosDaTabela.mockImplementationOnce(async () => null)
        expect((await chamar('GET', T, ROTA_DA_TABELA)).status).toBe(404)
    })
})

describe('GET /tabelas/[id]/conteudo — o que está no banco', () => {
    it('as tipologias ORDENADAS pela proporção de condicionais, o total de fórmulas e os ITENS gravados', async () => {
        const r = await chamar('GET', T, ROTA_DO_CONTEUDO)
        expect(r.status).toBe(200)
        expect(r.json.tipologias.map((t: any) => t.tipologia)).toEqual(['DP-148', 'DP-01', 'SEM'])
        expect(r.json.formulas).toBe(137)
        // a contagem do BANCO, lida por `contarItensDaTabela` (02/11/2026: é ela que diz "não importada" na tela — a última importação não registra recusa)
        expect(r.json.itens).toBe(755)
        expect(repo.contarItensDaTabela).toHaveBeenCalledWith(T)
    })
    it('a tabela recusada ou nunca importada devolve itens 0 — número, não ausência', async () => {
        repo.contarItensDaTabela.mockImplementation(async () => 0)
        const r = await chamar('GET', T, ROTA_DO_CONTEUDO)
        expect(r.status).toBe(200)
        expect(r.json.itens).toBe(0)
    })
    it('401 sem sessão, 403 sem ser super admin', async () => {
        perfil = null
        expect((await chamar('GET', T, ROTA_DO_CONTEUDO)).status).toBe(401)
        perfil = ADMIN
        expect((await chamar('GET', T, ROTA_DO_CONTEUDO)).status).toBe(403)
        expect(ordem).toEqual([])
    })
    it('404 em tabela inexistente', async () => {
        repo.obterArquivosDaTabela.mockImplementation(async () => null)
        expect((await chamar('GET', T, ROTA_DO_CONTEUDO)).status).toBe(404)
        expect(repo.listarTipologias).not.toHaveBeenCalled()
    })
})

describe('TABELA DE PREÇO PURO — sem arquivo de motor (Reforço, Acessórios…): a importação lê só o preço (27/10/2026)', () => {
    const semMotor = (categoria = 'REFORCO') => repo.obterArquivosDaTabela.mockImplementation(async () => { ordem.push('obterArquivosDaTabela'); return { ...TABELA, motor_path: null, motor_nome: null, categoria_chave: categoria } })

    it('motor nulo: 200, grava os itens, e o payload leva TODAS as listas do motor vazias — a função as exige', async () => {
        semMotor()
        const r = await chamar('POST')
        expect(r.status).toBe(200)
        expect(repo.importarTabela).toHaveBeenCalledTimes(1)
        const payload = repo.importarTabela.mock.calls[0][0].payload
        expect(payload.itens.map((i: any) => i.codigo)).toEqual(['IL4237', 'KT4237'])
        expect(payload.regras).toEqual([])
        expect(payload.tipologias).toEqual([])
        expect(payload.formulas).toEqual([])
        for (const a of ABAS_DO_MOTOR) expect(payload[a.payload]).toEqual([])
        expect(r.json.contagens).toEqual(expect.objectContaining({ itens: 2, regras: 0, tipologias: 0, cruzam: 0, nao_cruzam: 0 }))
    })

    it('o LAYOUT ÚNICO (CABECALHO + ITENS, colunas por nome; 02/11/2026): a resposta diz o layout e devolve a aba CABECALHO como veio, e o payload leva as 12 do bloco', async () => {
        semMotor('PERSIANAS')
        const colunas: readonly string[] = COLUNAS_DO_LAYOUT_UNICO
        const linha = (v: Record<string, ExcelJS.CellValue>) => Object.fromEntries(Object.entries(v).map(([c, x]) => [colunas.indexOf(c) + 1, x]))
        objetos[TABELA.arquivo_path] = await planilha({
            CABECALHO: [{ 1: 'categoria', 2: 'fornecedor', 3: 'vigencia', 4: 'regime_tributario', 5: 'uf_origem', 6: 'moeda' }, { 1: 'PERSIANAS', 2: 'Wolff', 3: '2026-11-02', 6: 'BRL' }],
            ITENS: [
                Object.fromEntries(colunas.map((c, k) => [k + 1, c])),
                linha({ codigo: 'PS-001', descricao: 'CAIXA', [COLUNA_DA_CATEGORIA_DO_FORNECEDOR]: 'Persianas', vendido_por: 'unidade', custo_bruto: 200, cred_icms_pct: 12, cred_pis_cofins_pct: 9.25, cred_ibs_pct: 0, cred_cbs_pct: 0, cred_ipi_pct: 0, credito_pct: 21.25, credito_valor: 42.5, custo_liquido: 157.5 }),
                linha({ codigo: 'PS-002', descricao: 'GUIA', [COLUNA_DA_CATEGORIA_DO_FORNECEDOR]: 'Persianas', vendido_por: 'barra', medida_barra_m: 6, custo_bruto: 120, valor_metro: 20 }),
            ],
        })
        const r = await chamar('POST')
        expect(r.status).toBe(200)
        expect(r.json.layout).toBe('unico')
        expect(r.json.cabecalho).toEqual({ categoria: 'PERSIANAS', fornecedor: 'Wolff', vigencia: '2026-11-02', regime_tributario: null, uf_origem: null, moeda: 'BRL' })
        const payload = repo.importarTabela.mock.calls[0][0].payload
        expect(payload.itens.map((i: any) => [i.codigo, i.custo, i.valor_barra_interno, i.valor_metro_interno, i[COLUNA_DA_CATEGORIA_DO_FORNECEDOR], i.cred_icms_pct, i.credito_pct]))
            .toEqual([['PS-001', 200, null, null, 'Persianas', 12, 21.25], ['PS-002', 120, 120, 20, 'Persianas', null, null]])
        expect(r.json.contagens).toEqual(expect.objectContaining({ itens: 2 }))
    })

    it('no layout de antes a resposta diz por_posicao e NÃO traz a chave cabecalho', async () => {
        semMotor()
        const r = await chamar('POST')
        expect(r.status).toBe(200)
        expect(r.json.layout).toBe('por_posicao')
        expect('cabecalho' in r.json).toBe(false)
    })

    it('a Estrela de produção (motor_path e motor_nome VAZIOS, não nulos) é tabela sem motor: importa só o preço, sem baixar nem conferir ""', async () => {
        repo.obterArquivosDaTabela.mockImplementation(async () => { ordem.push('obterArquivosDaTabela'); return { ...TABELA, motor_path: '', motor_nome: '', categoria_chave: 'VIDRO' } })
        const r = await chamar('POST')
        expect(r.status).toBe(200)
        expect(repo.objetoExiste.mock.calls.map((c) => c[0])).toEqual([TABELA.arquivo_path])
        expect(repo.baixarObjeto.mock.calls.map((c) => c[0])).toEqual([TABELA.arquivo_path])
        expect(repo.importarTabela.mock.calls[0][0].payload.regras).toEqual([])
    })

    it('motor só com espaços também não é motor', async () => {
        repo.obterArquivosDaTabela.mockImplementation(async () => { ordem.push('obterArquivosDaTabela'); return { ...TABELA, motor_path: '  ', motor_nome: ' ', categoria_chave: 'VIDRO' } })
        expect((await chamar('POST')).status).toBe(200)
        expect(repo.baixarObjeto.mock.calls.map((c) => c[0])).toEqual([TABELA.arquivo_path])
    })

    it('caminho preenchido e nome vazio (o banco só deixa por SQL à mão): o motor precisa dos DOIS para existir, e a importação segue só com o preço', async () => {
        repo.obterArquivosDaTabela.mockImplementation(async () => { ordem.push('obterArquivosDaTabela'); return { ...TABELA, motor_nome: '', categoria_chave: 'VIDRO' } })
        expect((await chamar('POST')).status).toBe(200)
        expect(repo.baixarObjeto.mock.calls.map((c) => c[0])).toEqual([TABELA.arquivo_path])
    })

    it('baixa SÓ o arquivo da tabela: o motor não é conferido no bucket nem baixado', async () => {
        semMotor()
        await chamar('POST')
        expect(repo.objetoExiste.mock.calls.map((c) => c[0])).toEqual([TABELA.arquivo_path])
        expect(repo.baixarObjeto.mock.calls.map((c) => c[0])).toEqual([TABELA.arquivo_path])
    })

    it('o arquivo da tabela faltando no bucket continua sendo recusa (409) — sem motor não é sem arquivo', async () => {
        semMotor()
        delete objetos[TABELA.arquivo_path]
        const r = await chamar('POST')
        expect(r.status).toBe(409)
        expect(repo.importarTabela).not.toHaveBeenCalled()
    })

    it('a regra de uma categoria do fornecedor vale igual sem motor: arquivo com duas é recusado (422)', async () => {
        semMotor('ACESSORIOS_VEDACAO')
        objetos[TABELA.arquivo_path] = await planilha({ 'Tabela Wolff': [
            { 1: 'LAMINADOS' }, { 2: 'CÓDIGO', 13: 'VALOR METRO 18%', 15: 'VALOR BARRA 18%' },
            { 2: 'A1', 11: 'Reforço', 13: 10 }, { 2: 'A2', 11: 'Acessórios', 13: 11 },
        ] })
        const r = await chamar('POST')
        expect(r.status).toBe(422)
        expect(repo.importarTabela).not.toHaveBeenCalled()
    })

    it('o contraste: a tabela COM motor continua baixando e lendo os dois arquivos, e grava as listas do motor', async () => {
        const r = await chamar('POST')
        expect(r.status).toBe(200)
        expect(repo.baixarObjeto.mock.calls.map((c) => c[0])).toEqual([TABELA.arquivo_path, TABELA.motor_path])
        const payload = repo.importarTabela.mock.calls[0][0].payload
        expect(payload.regras.length + payload.tipologias.length).toBeGreaterThan(0)
    })

    it('o nome nulo do motor não vira texto em nenhum lugar da resposta', async () => {
        semMotor()
        const r = await chamar('POST')
        expect(r.status).toBe(200)
        expect(JSON.stringify(r.json)).not.toContain('null')
    })
})
