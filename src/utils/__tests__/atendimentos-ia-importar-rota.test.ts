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
import { COLUNA_DA_CATEGORIA_DO_FORNECEDOR } from '@/utils/atendimentos-ia-importacao'

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
const TABELA = { id: T, arquivo_path: 'f/arquivo/x-Tabela Wolff.xlsm', arquivo_nome: 'Tabela Wolff.xlsm', motor_path: 'f/motor/x-Motor.xlsx', motor_nome: 'Motor.xlsx', categoria_chave: null as string | null }

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
        importarConteudo: fn('importarConteudo', (_id: string, p: any) => ({
            importacao_id: 'imp-1',
            ...Object.fromEntries(Object.entries(p).filter(([k, v]) => Array.isArray(v) && k !== 'avisos').map(([k, v]) => [k, (v as unknown[]).length])),
        })),
        ultimaImportacao: fn('ultimaImportacao', () => null),
        nomeDoUsuario: fn('nomeDoUsuario', () => 'Cristiano'),
        obterDadosDaTabela: fn('obterDadosDaTabela', () => DADOS),
        listarTipologias: fn('listarTipologias', () => TIPOLOGIAS_DO_BANCO),
        contarFormulas: fn('contarFormulas', () => 137),
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

async function chamar(method: string, id: string = T, handler: Handler = rota.default) {
    let status = 0
    let json: any = null
    const res = { status(n: number) { status = n; return res }, json(b: unknown) { json = b; return res } }
    await handler({ cookies: { token: 't' }, method, query: { id }, body: undefined } as unknown as NextApiRequest, res as unknown as NextApiResponse)
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
        expect(repo.importarConteudo).not.toHaveBeenCalled()
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
        expect(repo.importarConteudo).not.toHaveBeenCalled()
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
        expect(repo.importarConteudo).not.toHaveBeenCalled()
    })
})

describe('a importação', () => {
    it('lê com o leitor real, grava pela função, e responde as contagens e os avisos', async () => {
        const r = await chamar('POST')
        expect(r.status).toBe(200)
        expect(repo.importarConteudo).toHaveBeenCalledTimes(1)
        const [id, payload] = repo.importarConteudo.mock.calls[0]
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
        expect(repo.importarConteudo).not.toHaveBeenCalled()
    })

    // as nove abas entram na conferência como as quatro de sempre: a lista vem do mapa, não de cópia
    it.each([['itens'], ['regras'], ['tipologias'], ['formulas'], ...ABAS_DO_MOTOR.map((a) => [a.payload])])('contagem divergente em %s → 500 com os dois números lado a lado, nunca sucesso', async (campo) => {
        repo.importarConteudo.mockImplementationOnce(async (_id: string, p: any) => ({
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
        repo.importarConteudo.mockImplementationOnce(async (_id: string, p: any) => {
            const c = contagensDe(p)
            delete c.insumos
            return { importacao_id: 'imp-3', ...c }
        })
        const r = await chamar('POST')
        const enviado = repo.importarConteudo.mock.calls[0][1]
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
        expect(repo.importarConteudo).not.toHaveBeenCalled()
    })
})

describe('A GRAVAÇÃO QUE FALHA DIZ O MOTIVO NA TELA — e a duração dela fica no log', () => {
    const falhar = (erro: { code?: string; message: string }) =>
        repo.importarConteudo.mockImplementationOnce(async () => { ordem.push('importarConteudo'); throw erro })

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
        expect(repo.importarConteudo).toHaveBeenCalledTimes(1)
        expect(repo.contarTemposGravados).not.toHaveBeenCalled()
        expect(ordem).not.toContain('contarTemposGravados')
    })

    it('o payload não carrega tempo nenhum: a função não tem o que escrever na tabela de tempos', async () => {
        await chamar('POST')
        const payload = repo.importarConteudo.mock.calls[0][1] as Record<string, unknown>
        const chaves = new Set(Object.values(payload).filter(Array.isArray).flatMap((l) => (l as Array<Record<string, unknown>>).flatMap((x) => (x && typeof x === 'object' ? Object.keys(x) : []))))
        expect([...chaves].filter((k) => /tempo/i.test(k))).toEqual([])
        expect(Object.keys(payload).filter((k) => /tempo/i.test(k))).toEqual([])
    })
})

describe('A TRAVA DOS ITENS QUE O ARQUIVO NÃO TRAZ — a importação apagaria linhas que não sabe pôr de volta', () => {
    // O caso que a originou (dono do produto, 25/10/2026): 24 vidros inseridos à mão na tabela
    // 5f7acebf, que nenhum arquivo traz. A importação apaga TODOS os itens da tabela e regrava só os
    // do arquivo: sem a trava, os 24 sumiriam.
    /** A frase lida DENTRO dos casos: no commit do portão ela ainda não existe. */
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fraseDosItens = (c: string[]) => require('@/utils/atendimentos-ia-importacao').fraseDaImportacaoTravadaPorItensForaDoArquivo(c) as string
    const gravados = (c: string[]) => repo.codigosDosItensGravados.mockImplementation(async () => { ordem.push('codigosDosItensGravados'); return c })

    it('item gravado que o arquivo não traz → 409 com a frase, ANTES de gravar — e diz quantos e quais', async () => {
        gravados(['IL4237', 'VIDRO 4MM', 'VIDRO 6MM'])
        const r = await chamar('POST')
        expect(r.status).toBe(409)
        expect(r.json.error).toBe(fraseDosItens(['VIDRO 4MM', 'VIDRO 6MM']))
        expect(r.json.error).toContain('2 itens')
        expect(r.json.error).toContain('VIDRO 4MM')
        expect(repo.importarConteudo).not.toHaveBeenCalled()
    })

    it('todos os itens gravados estão no arquivo → a importação segue (a substituição é o desenho certo aí)', async () => {
        gravados(['IL4237', 'KT4237'])
        const r = await chamar('POST')
        expect(r.status).toBe(200)
        expect(repo.importarConteudo).toHaveBeenCalledTimes(1)
        expect(ordem.indexOf('codigosDosItensGravados')).toBeLessThan(ordem.indexOf('importarConteudo'))
    })

    it('a comparação é EXATA: "il4237" gravado não é o "IL4237" do arquivo — nada é casado pelo parecido', async () => {
        gravados(['il4237'])
        const r = await chamar('POST')
        expect(r.status).toBe(409)
        expect(r.json.error).toBe(fraseDosItens(['il4237']))
    })

    it('erro do banco ao ler os itens gravados → 500, e a importação NÃO segue (falha fechada)', async () => {
        repo.codigosDosItensGravados.mockImplementation(async () => { throw new Error('falhou') })
        const r = await chamar('POST')
        expect(r.status).toBe(500)
        expect(repo.importarConteudo).not.toHaveBeenCalled()
    })

    it('a função pura: o código do arquivo é comparado COMO ESTÁ, dos dois lados — "Vidro 4mm" casa com "Vidro 4mm" e com nada mais', () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { itensQueOArquivoNaoTraz } = require('@/utils/atendimentos-ia-importacao')
        expect(itensQueOArquivoNaoTraz(['Vidro 4mm', 'Vidro 4mm'], { itens: [{ codigo: 'Vidro 4mm' }] })).toEqual([])
        expect(itensQueOArquivoNaoTraz(['Vidro 4mm', 'Vidro 4mm', 'X'], { itens: [{ codigo: 'VIDRO 4MM' }] })).toEqual(['Vidro 4mm', 'X'])
    })

    it('a frase nomeia até 10 códigos e conta o resto, e diz que nada foi alterado', () => {
        const muitos = Array.from({ length: 24 }, (_, i) => `V${String(i + 1).padStart(2, '0')}`)
        const f = fraseDosItens(muitos)
        expect(f).toContain('24 itens')
        expect(f).toContain('V10')
        expect(f).not.toContain('V11')
        expect(f).toContain('e mais 14')
        expect(f).toContain('Nada foi alterado')
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
        expect(repo.importarConteudo).not.toHaveBeenCalled()
        expect(ordem).not.toContain('codigosDosItensGravados')
    })

    it('tabela que declara + arquivo de UMA categoria só → 200, e o aviso de "sem categoria declarada" NÃO aparece', async () => {
        declarada('VIDRO')
        await comCategorias(['Vidro', 'Vidro', 'Vidro'])
        const r = await chamar('POST')
        expect(r.status).toBe(200)
        expect(repo.importarConteudo.mock.calls[0][1].itens.map((i: any) => i[COLUNA_DA_CATEGORIA_DO_FORNECEDOR])).toEqual(['Vidro', 'Vidro', 'Vidro'])
        expect(r.json.avisos.map((a: any) => a.tipo)).not.toContain('tabela_sem_categoria_declarada')
        expect(r.json.avisos.map((a: any) => a.tipo)).not.toContain('itens_sem_categoria_do_fornecedor')
    })

    it('a mesma categoria em duas grafias ("Acessórios" e "acessórios", com espaço de sobra) é UMA categoria só', async () => {
        declarada('ACESSORIOS_VEDACAO')
        await comCategorias(['Acessórios', 'acessórios', ' Acessórios  '])
        expect((await chamar('POST')).status).toBe(200)
        expect(repo.importarConteudo).toHaveBeenCalledTimes(1)
    })

    it('item SEM a categoria do fornecedor não é somado a nenhuma: grava assim e AVISA quantos', async () => {
        declarada('VIDRO')
        await comCategorias(['Vidro', null, 'Vidro'])
        const r = await chamar('POST')
        expect(r.status).toBe(200)
        expect(repo.importarConteudo.mock.calls[0][1].itens.map((i: any) => i[COLUNA_DA_CATEGORIA_DO_FORNECEDOR])).toEqual(['Vidro', null, 'Vidro'])
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
        expect(repo.importarConteudo).toHaveBeenCalledTimes(1)
        expect(repo.importarConteudo.mock.calls[0][1].itens).toHaveLength(5)
        const tipos = r.json.avisos.map((a: any) => a.tipo)
        expect(tipos).toContain('tabela_sem_categoria_declarada')
        expect(tipos).toContain('itens_sem_categoria_do_fornecedor')
        // o aviso vai no payload, e fica gravado com a importação
        expect(repo.importarConteudo.mock.calls[0][1].avisos.map((a: any) => a.tipo)).toContain('tabela_sem_categoria_declarada')
    })

    it('FALHA FECHADA: se a leitura da tabela não trouxe a coluna da categoria (undefined), um arquivo com 2 categorias é RECUSADO — nunca tratado como tabela de antes', async () => {
        repo.obterArquivosDaTabela.mockImplementation(async () => { ordem.push('obterArquivosDaTabela'); return { ...TABELA, categoria_chave: undefined } })
        await comCategorias(['A', 'B'])
        expect((await chamar('POST')).status).toBe(422)
        expect(repo.importarConteudo).not.toHaveBeenCalled()
    })

    it('a recusa vem DEPOIS de ler e ANTES de conferir/gravar: o arquivo é baixado, e nada mais acontece', async () => {
        declarada('PERFIL')
        await comCategorias(['A', 'B'])
        await chamar('POST')
        expect(ordem).toEqual(expect.arrayContaining(['obterArquivosDaTabela', 'objetoExiste', 'baixarObjeto']))
        expect(ordem).not.toContain('importarConteudo')
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
    it('as tipologias ORDENADAS pela proporção de condicionais, e o total de fórmulas', async () => {
        const r = await chamar('GET', T, ROTA_DO_CONTEUDO)
        expect(r.status).toBe(200)
        expect(r.json.tipologias.map((t: any) => t.tipologia)).toEqual(['DP-148', 'DP-01', 'SEM'])
        expect(r.json.formulas).toBe(137)
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
