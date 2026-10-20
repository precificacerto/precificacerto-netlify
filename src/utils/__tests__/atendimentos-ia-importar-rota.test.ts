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
 * ══════════════════════════════════════════════════════════════════════════════════════════
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- os clientes falsos imitam clientes sem tipo */
import type { NextApiRequest, NextApiResponse } from 'next'
import ExcelJS from 'exceljs'

import { MOTIVO_DA_EXTENSAO_NAO_IMPORTAVEL, ROTAS_DO_CATALOGO, fraseDoArquivoNaoImportavel } from '@/utils/atendimentos-ia-catalogo'
import { COLUNA_DA_CATEGORIA_DO_FORNECEDOR } from '@/utils/atendimentos-ia-importacao'

interface Perfil { id: string; tenant_id: string | null; role: string; is_super_admin: boolean }
const SUPER: Perfil = { id: 'u-super', tenant_id: null, role: 'super_admin', is_super_admin: true }
const ADMIN: Perfil = { id: 'u-admin', tenant_id: 't-a', role: 'admin', is_super_admin: false }
let perfil: Perfil | null = SUPER

jest.mock('@/supabase/admin', () => ({
    supabaseAdmin: {
        auth: { getUser: async () => (perfil ? { data: { user: { id: perfil.id } }, error: null } : { data: { user: null }, error: { message: 'sem sessão' } }) },
        from: () => { const q: any = { select: () => q, eq: () => q, single: async () => ({ data: perfil, error: null }) }; return q },
    },
}))

const T = '22222222-2222-4222-8222-222222222222'
const TABELA = { id: T, arquivo_path: 'f/arquivo/x-Tabela Wolff.xlsm', arquivo_nome: 'Tabela Wolff.xlsm', motor_path: 'f/motor/x-Motor.xlsx', motor_nome: 'Motor.xlsx' }

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
        importarConteudo: fn('importarConteudo', (_id: string, p: any) => ({
            importacao_id: 'imp-1', itens: p.itens.length, regras: p.regras.length, tipologias: p.tipologias.length, formulas: p.formulas.length,
        })),
        ultimaImportacao: fn('ultimaImportacao', () => null),
    }
})
// eslint-disable-next-line @typescript-eslint/no-require-imports
const repo = require('@/lib/atendimentos-ia/repositorio') as Record<string, jest.Mock>
// eslint-disable-next-line @typescript-eslint/no-require-imports
const rota = require('@/pages/api/super-admin/atendimentos-ia/tabelas/[id]/importar') as { default: (q: NextApiRequest, s: NextApiResponse) => Promise<unknown>; config: { maxDuration: number } }

async function chamar(method: string, id: string = T) {
    let status = 0
    let json: any = null
    const res = { status(n: number) { status = n; return res }, json(b: unknown) { json = b; return res } }
    await rota.default({ cookies: { token: 't' }, method, query: { id }, body: undefined } as unknown as NextApiRequest, res as unknown as NextApiResponse)
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
    }),
})

const silencio = jest.spyOn(console, 'error').mockImplementation(() => {})
afterAll(() => silencio.mockRestore())
beforeEach(async () => {
    perfil = SUPER
    ordem.length = 0
    for (const k of Object.keys(objetos)) delete objetos[k]
    Object.assign(objetos, await ARQUIVOS_BONS())
    Object.values(repo).forEach((f) => { if (typeof f?.mockClear === 'function') f.mockClear() })
    repo.obterArquivosDaTabela.mockImplementation(async () => { ordem.push('obterArquivosDaTabela'); return TABELA })
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

    it('a rota declara maxDuration de 60 segundos', () => {
        expect(rota.config).toEqual(expect.objectContaining({ maxDuration: 60 }))
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

    it.each([['itens'], ['regras'], ['tipologias'], ['formulas']])('contagem divergente em %s → 500 com os dois números lado a lado, nunca sucesso', async (campo) => {
        repo.importarConteudo.mockImplementationOnce(async (_id: string, p: any) => ({
            importacao_id: 'imp-2', itens: p.itens.length, regras: p.regras.length, tipologias: p.tipologias.length, formulas: p.formulas.length,
            [campo]: p[campo].length + 1,
        }))
        const r = await chamar('POST')
        expect(r.status).toBe(500)
        expect(r.json.enviado[campo]).not.toBe(r.json.gravado[campo])
        expect(r.json.gravado[campo]).toBe(r.json.enviado[campo] + 1)
        expect(r.json.error).toMatch(/não conferiu/)
    })
})

describe('GET — a última importação', () => {
    it('sem importação nenhuma → null', async () => {
        const r = await chamar('GET')
        expect(r.status).toBe(200)
        expect(r.json).toBeNull()
    })

    it('com importação → a linha que o repositório devolve', async () => {
        const linha = { id: 'imp-9', tabela_id: T, itens: 755, regras: 4055, tipologias: 157, cruzam: 549, nao_cruzam: 0, normalizados: 2, avisos: [] }
        repo.ultimaImportacao.mockImplementationOnce(async () => linha)
        const r = await chamar('GET')
        expect(r.status).toBe(200)
        expect(r.json).toEqual(linha)
        expect(repo.ultimaImportacao).toHaveBeenCalledWith(T)
    })
})
