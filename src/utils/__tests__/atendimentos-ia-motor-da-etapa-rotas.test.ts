/**
 * @jest-environment node
 *
 * PORTÃO — as ROTAS do motor que a etapa sobe (27/10/2026; migração 20261027000010):
 *   POST /api/super-admin/atendimentos-ia/familias/[chave]/motor-url-de-envio
 *   POST /api/super-admin/atendimentos-ia/familias/[chave]/etapas/[etapaId]/motor
 *   PUT  /api/super-admin/base-de-conhecimento/nome-da-materia-prima  (o título da família é digitado)
 *
 * >>> O QUE ESTE PORTÃO **NÃO** ALCANÇA <<<
 * O banco é FALSO e o Storage também: o `rpc` só REGISTRA a chamada e devolve o que o caso mandar. O que a FUNÇÃO faz — criar o motor, gravar as
 * doze tabelas por `motor_id`, apontar a etapa, desfazer tudo no erro, não tocar no motor da Wolff nem nos tempos, serializar duas subidas — está
 * provado num Postgres real em `scripts/harness/etapa-sobe-o-motor/` (12 casos e corridas, 35 mutações). O que ESTE portão prova é o que as ROTAS
 * decidem: quem passa (404 para o resto, antes de qualquer leitura de arquivo), que o caminho assinado e o aceito são os da pasta DA FAMÍLIA, a
 * ORDEM das recusas (cada uma antes do passo seguinte), que o autor é o da SESSÃO, que a rota chama SÓ a função (nunca insert, update ou delete),
 * que o erro da função vira o status e a frase certos, e que a conferência das contagens recusa o sucesso falso.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- o cliente falso imita um cliente sem tipos */
import type { NextApiRequest, NextApiResponse } from 'next'
import ExcelJS from 'exceljs'

import { ABAS_DA_IMPORTACAO, LISTAS_DO_MOTOR_DA_ETAPA } from '@/utils/atendimentos-ia-importacao'
import { fraseDoArquivoNaoImportavel } from '@/utils/atendimentos-ia-catalogo'
import { abasDoSpec } from './fixtures/abas-do-motor-do-spec'

type Linha = Record<string, any>
const SUPER: Linha = { id: '00000000-0000-4000-8000-00000000005a', tenant_id: null, role: 'super_admin', is_super_admin: true }
const COMUM: Linha = { id: '00000000-0000-4000-8000-0000000000c0', tenant_id: 't-1', role: 'user', is_super_admin: false }
const E_PVC = '00000000-0000-4000-8000-0000000000e1'
const E_ALU = '00000000-0000-4000-8000-0000000000e2'
const E_INEXISTENTE = '00000000-0000-4000-8000-0000000000ff'
const MOTOR_NOVO = '00000000-0000-4000-8000-0000000000a9'
const MOTOR_VELHO = '00000000-0000-4000-8000-0000000000a1'
const PATH_PVC = 'familia/PVC/motor/u1-Motor.xlsx'

type RespostaDoRpc = { data: unknown; error: { code?: string; message: string } | null }
const estado = {
    usuario: SUPER as Linha | null,
    db: {} as Record<string, Linha[]>,
    rpcs: [] as Array<{ funcao: string; args: Linha }>,
    escritasDiretas: [] as string[],
    rpcResposta: null as null | (() => RespostaDoRpc),
    objetos: new Map<string, Uint8Array>(),
    assinados: [] as string[],
    lidos: [] as string[],
    falhaNoDownload: false,
}

function montar() {
    estado.usuario = SUPER
    estado.rpcs = []
    estado.escritasDiretas = []
    estado.rpcResposta = null
    estado.objetos = new Map()
    estado.assinados = []
    estado.lidos = []
    estado.falhaNoDownload = false
    estado.db = {
        users: [SUPER, COMUM],
        orcamentista_familia_catalogo: [{ chave: 'PVC' }, { chave: 'ALUMINIO' }],
        orcamentista_familia_etapa: [{ id: E_PVC, familia: 'PVC' }, { id: E_ALU, familia: 'ALUMINIO' }],
    }
}

jest.mock('@/supabase/admin', () => ({
    supabaseAdmin: {
        auth: {
            getUser: async (): Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }> => (estado.usuario
                ? { data: { user: { id: String(estado.usuario.id) } }, error: null }
                : { data: { user: null }, error: { message: 'sem sessão' } }),
        },
        from: (tabela: string) => {
            const filtros: Array<(l: Linha) => boolean> = []
            const q: any = {}
            q.select = () => q
            q.eq = (c: string, v: unknown) => { filtros.push((l) => l[c] === v); return q }
            q.is = (c: string, v: unknown) => { filtros.push((l) => (l[c] ?? null) === v); return q }
            q.in = (c: string, vs: unknown[]) => { filtros.push((l) => vs.includes(l[c])); return q }
            q.order = () => q
            const linhas = () => (estado.db[tabela] ?? []).filter((l) => filtros.every((f) => f(l)))
            q.single = async (): Promise<Linha> => ({ data: linhas()[0] ?? null, error: null })
            q.maybeSingle = async (): Promise<Linha> => ({ data: linhas()[0] ?? null, error: null })
            q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: linhas(), error: null }).then(ok)
            for (const escrita of ['insert', 'update', 'upsert', 'delete']) q[escrita] = () => { estado.escritasDiretas.push(`${escrita} ${tabela}`); throw new Error(`escrita direta: ${escrita} ${tabela}`) }
            return q
        },
        rpc: async (funcao: string, args: Linha): Promise<RespostaDoRpc> => {
            estado.rpcs.push({ funcao, args })
            return estado.rpcResposta ? estado.rpcResposta() : { data: null, error: null }
        },
        storage: {
            from: () => ({
                createSignedUploadUrl: async (caminho: string): Promise<Linha> => { estado.assinados.push(caminho); return { data: { signedUrl: `https://storage.exemplo/${caminho}?token=t`, path: caminho }, error: null } },
                exists: async (caminho: string): Promise<Linha> => ({ data: estado.objetos.has(caminho), error: null }),
                download: async (caminho: string): Promise<Linha> => {
                    estado.lidos.push(caminho)
                    if (estado.falhaNoDownload) return { data: null, error: { message: 'storage fora' } }
                    const b = estado.objetos.get(caminho)
                    return { data: { arrayBuffer: async () => (b as Uint8Array).buffer.slice((b as Uint8Array).byteOffset, (b as Uint8Array).byteOffset + (b as Uint8Array).byteLength) }, error: null }
                },
            }),
        },
    },
}))

/* eslint-disable @typescript-eslint/no-require-imports */
const rotaDoEnvio = () => require('@/pages/api/super-admin/atendimentos-ia/familias/[chave]/motor-url-de-envio').default
const rotaDoMotor = () => require('@/pages/api/super-admin/atendimentos-ia/familias/[chave]/etapas/[etapaId]/motor').default
const rotaDoNome = () => require('@/pages/api/super-admin/base-de-conhecimento/nome-da-materia-prima').default
/* eslint-enable @typescript-eslint/no-require-imports */

async function chamar(rota: () => (q: NextApiRequest, s: NextApiResponse) => Promise<unknown>, metodo: string, query: Linha, body?: unknown) {
    const saida = { status: 0, corpo: null as any }
    const res = {
        status(n: number) { saida.status = n; return res },
        json(c: unknown) { saida.corpo = c; return res },
        setHeader() { return res },
        end() { return res },
    } as unknown as NextApiResponse
    await rota()({ method: metodo, query, cookies: { token: 'sessao' }, body, headers: {} } as unknown as NextApiRequest, res)
    return saida
}
const envio = (metodo: string, chave: string | undefined, body?: unknown) => chamar(rotaDoEnvio, metodo, { chave }, body)
const subida = (metodo: string, chave: string | undefined, etapaId: string | undefined, body?: unknown) => chamar(rotaDoMotor, metodo, { chave, etapaId }, body)

type Celulas = Record<number, ExcelJS.CellValue>
async function arquivoDoMotor(regras: Celulas[] = [{ 1: 'A1', 14: 'JC2F, JC4F', 15: 'L>1000' }, { 1: 'B2', 14: 'JC2F' }]): Promise<Uint8Array> {
    const wb = new ExcelJS.Workbook()
    const abas: Record<string, Celulas[]> = {
        [ABAS_DA_IMPORTACAO.motor]: [{ 1: 'CÓDIGO', 14: 'TIPOLOGIAS' }, ...regras],
        [ABAS_DA_IMPORTACAO.formulasDaLinha]: [{ 1: 'LINHA', 2: 'VARIÁVEL' }, { 1: 'PVC EUROPA 42', 2: 'HFOL', 4: '(H-10)' }],
        ...abasDoSpec(),
    }
    for (const [nome, linhas] of Object.entries(abas)) {
        const ws = wb.addWorksheet(nome)
        linhas.forEach((cs, i) => { for (const [col, v] of Object.entries(cs)) ws.getRow(i + 1).getCell(Number(col)).value = v })
    }
    return new Uint8Array(await wb.xlsx.writeBuffer())
}
/** O que a função devolve quando grava o que o payload mandou. */
function devolveOQueRecebeu(): { data: unknown; error: null } {
    const p = estado.rpcs[estado.rpcs.length - 1].args.p_payload as Record<string, unknown[]>
    const contagens = Object.fromEntries(LISTAS_DO_MOTOR_DA_ETAPA.map((k) => [k, p[k].length]))
    return { data: { motor_id: MOTOR_NOVO, etapa_id: E_PVC, motor_anterior: MOTOR_VELHO, importacao_id: 'imp-1', ...contagens }, error: null }
}

let silencio: jest.SpyInstance
let registro: jest.SpyInstance
beforeEach(() => { montar(); silencio = jest.spyOn(console, 'error').mockImplementation(() => undefined); registro = jest.spyOn(console, 'log').mockImplementation(() => undefined) })
afterEach(() => { silencio.mockRestore(); registro.mockRestore() })

const nenhumaEscrita = () => { expect(estado.rpcs).toEqual([]); expect(estado.escritasDiretas).toEqual([]) }

describe('(1) o portão: quem não é super admin recebe 404, antes de assinar, de ler arquivo e de chamar a função', () => {
    it.each([['comum', COMUM], ['sem sessão', null]])('as três rotas, com usuário %s → 404', async (_n, usuario) => {
        estado.usuario = usuario
        expect((await envio('POST', 'PVC', { nome: 'x.xlsx' })).status).toBe(404)
        expect((await subida('POST', 'PVC', E_PVC, { path: PATH_PVC, nome: 'Motor.xlsx' })).status).toBe(404)
        expect((await chamar(rotaDoNome, 'PUT', { tenant: '00000000-0000-4000-8000-0000000000a1' }, { materia_prima: E_PVC, nome: 'x' })).status).toBe(404)
        nenhumaEscrita()
        expect(estado.assinados).toEqual([])
        expect(estado.lidos).toEqual([])
    })

    it('só POST nas duas rotas do motor: GET, PUT e DELETE são 405', async () => {
        for (const m of ['GET', 'PUT', 'DELETE']) {
            expect((await envio(m, 'PVC', {})).status).toBe(405)
            expect((await subida(m, 'PVC', E_PVC, {})).status).toBe(405)
        }
        nenhumaEscrita()
    })
})

describe('(2) POST motor-url-de-envio — assina UM envio, na pasta DA FAMÍLIA', () => {
    it('assina o caminho familia/<chave>/motor/<uuid>-<nome limpo> e devolve o que o Storage deu', async () => {
        const r = await envio('POST', 'PVC', { nome: 'Motor Várias (2).xlsx' })
        expect(r.status).toBe(200)
        expect(estado.assinados).toHaveLength(1)
        expect(estado.assinados[0]).toMatch(/^familia\/PVC\/motor\/[0-9a-f-]{36}-Motor-Varias-2-\.xlsx$/)
        expect(r.corpo.path).toBe(estado.assinados[0])
        expect(r.corpo.signedUrl).toContain(estado.assinados[0])
        nenhumaEscrita()
    })

    it('duas chamadas com o mesmo nome dão caminhos DIFERENTES (o id é único)', async () => {
        await envio('POST', 'PVC', { nome: 'a.xlsx' })
        await envio('POST', 'PVC', { nome: 'a.xlsx' })
        expect(estado.assinados[0]).not.toBe(estado.assinados[1])
    })

    it.each([
        ['sem corpo', undefined, 'Arquivo sem nome.'],
        ['nome em branco', { nome: '  ' }, 'Arquivo sem nome.'],
        ['.xls (aceito no envio da tabela, mas a leitura não abre)', { nome: 'motor.xls' }, fraseDoArquivoNaoImportavel('motor.xls')],
        ['.pdf', { nome: 'motor.pdf' }, fraseDoArquivoNaoImportavel('motor.pdf')],
    ])('%s: 400 com o motivo, e nada é assinado', async (_n, corpo, frase) => {
        const r = await envio('POST', 'PVC', corpo)
        expect(r.status).toBe(400)
        expect(r.corpo).toEqual({ error: frase })
        expect(estado.assinados).toEqual([])
    })

    it('família que não existe: 404, e nada é assinado', async () => {
        expect((await envio('POST', 'NAO_EXISTE', { nome: 'a.xlsx' })).status).toBe(404)
        expect((await envio('POST', undefined, { nome: 'a.xlsx' })).status).toBe(404)
        expect(estado.assinados).toEqual([])
    })
})

describe('(3) POST etapas/[etapaId]/motor — lê o arquivo, chama a função e confere', () => {
    it('o caminho feliz: chama SÓ a função, com a etapa da URL, o autor da SESSÃO, o caminho e o nome do corpo, e o payload do leitor', async () => {
        estado.objetos.set(PATH_PVC, await arquivoDoMotor())
        estado.rpcResposta = devolveOQueRecebeu
        // o corpo tenta trazer o autor: é recusado antes (ver o caso do autor no corpo); aqui o corpo é o legítimo
        const r = await subida('POST', 'PVC', E_PVC, { path: PATH_PVC, nome: ' Motor.xlsx ' })
        expect(r.status).toBe(200)
        expect(estado.rpcs).toHaveLength(1)
        const { funcao, args } = estado.rpcs[0]
        expect(funcao).toBe('superadmin_criar_motor_da_etapa')
        expect(args).toMatchObject({ p_etapa: E_PVC, p_por: SUPER.id, p_arquivo_path: PATH_PVC, p_arquivo_nome: 'Motor.xlsx' })
        const p = args.p_payload as Record<string, unknown[]>
        expect(p.regras.map((x: any) => x.codigo)).toEqual(['A1', 'B2'])
        expect(p.tipologias).toHaveLength(2)
        expect(p).not.toHaveProperty('itens')
        expect(estado.lidos).toEqual([PATH_PVC])
        expect(estado.escritasDiretas).toEqual([])
        expect(r.corpo).toMatchObject({ motor_id: MOTOR_NOVO, etapa_id: E_PVC, motor_anterior: MOTOR_VELHO, importacao_id: 'imp-1', regras: 2, tipologias: 2 })
        expect(Array.isArray(r.corpo.avisos)).toBe(true)
    })

    it('o motor anterior que a função não trouxe vira null na resposta (a primeira subida da etapa)', async () => {
        estado.objetos.set(PATH_PVC, await arquivoDoMotor())
        estado.rpcResposta = () => { const r = devolveOQueRecebeu(); delete (r.data as Linha).motor_anterior; return r }
        expect((await subida('POST', 'PVC', E_PVC, { path: PATH_PVC, nome: 'Motor.xlsx' })).corpo.motor_anterior).toBeNull()
    })

    it.each([
        ['o autor no corpo (é o da sessão)', { path: PATH_PVC, nome: 'Motor.xlsx', por: SUPER.id }],
        ['sem caminho', { nome: 'Motor.xlsx' }],
        ['sem nome', { path: PATH_PVC }],
        ['caminho da pasta de OUTRA família', { path: 'familia/ALUMINIO/motor/u1-Motor.xlsx', nome: 'Motor.xlsx' }],
        ['caminho da pasta de um fornecedor', { path: 'f1/motor/u1-Motor.xlsx', nome: 'Motor.xlsx' }],
        ['caminho com ..', { path: 'familia/PVC/motor/../../f1/arquivo/x.xlsx', nome: 'Motor.xlsx' }],
        ['arquivo .xls', { path: 'familia/PVC/motor/u1-Motor.xls', nome: 'Motor.xls' }],
        ['corpo que não é objeto', 'x'],
    ])('%s: 400, e NADA é lido nem gravado', async (_n, corpo) => {
        estado.objetos.set(PATH_PVC, await arquivoDoMotor())
        const r = await subida('POST', 'PVC', E_PVC, corpo)
        expect(r.status).toBe(400)
        expect(typeof r.corpo.error).toBe('string')
        nenhumaEscrita()
        expect(estado.lidos).toEqual([])
    })

    it('a etapa de OUTRA família (ou inexistente, ou id que não é uuid): 404, e o arquivo não é lido', async () => {
        estado.objetos.set(PATH_PVC, await arquivoDoMotor())
        const corpo = { path: PATH_PVC, nome: 'Motor.xlsx' }
        expect((await subida('POST', 'PVC', E_ALU, corpo)).status).toBe(404)
        expect((await subida('POST', 'PVC', E_INEXISTENTE, corpo)).status).toBe(404)
        expect((await subida('POST', 'PVC', 'x', corpo)).status).toBe(404)
        expect((await subida('POST', undefined, E_PVC, corpo)).status).toBe(404)
        nenhumaEscrita()
        expect(estado.lidos).toEqual([])
    })

    it('objeto que não está no bucket: 409 com o caminho que faltou — e nada é gravado', async () => {
        const r = await subida('POST', 'PVC', E_PVC, { path: PATH_PVC, nome: 'Motor.xlsx' })
        expect(r.status).toBe(409)
        expect(r.corpo.error).toContain(PATH_PVC)
        expect(r.corpo.error).toContain('Motor.xlsx')
        nenhumaEscrita()
    })

    it('o Storage falha ao baixar: 500 com frase fixa, nunca o texto do Storage; nada gravado', async () => {
        estado.objetos.set(PATH_PVC, await arquivoDoMotor())
        estado.falhaNoDownload = true
        const r = await subida('POST', 'PVC', E_PVC, { path: PATH_PVC, nome: 'Motor.xlsx' })
        expect(r.status).toBe(500)
        expect(r.corpo.error).toBe('Não foi possível baixar o arquivo do motor.')
        expect(JSON.stringify(r.corpo)).not.toContain('storage fora')
        nenhumaEscrita()
    })

    it('planilha que o leitor recusa (sem as abas): 422 com a frase do leitor, e a função NÃO é chamada', async () => {
        const wb = new ExcelJS.Workbook()
        wb.addWorksheet('Outra').getRow(1).getCell(1).value = 'x'
        estado.objetos.set(PATH_PVC, new Uint8Array(await wb.xlsx.writeBuffer()))
        const r = await subida('POST', 'PVC', E_PVC, { path: PATH_PVC, nome: 'Motor.xlsx' })
        expect(r.status).toBe(422)
        expect(r.corpo.error).toContain('Motor.xlsx')
        expect(r.corpo.error).toContain(`"${ABAS_DA_IMPORTACAO.motor}"`)
        nenhumaEscrita()
    })

    it.each([
        ['22023', 400, 'o arquivo nao esta na pasta da familia PVC'],
        ['P0002', 404, 'etapa inexistente'],
        ['42501', 403, 'o autor da alteracao nao e super admin'],
    ])('a recusa da função (%s) vira %i com a MENSAGEM DELA', async (code, status, message) => {
        estado.objetos.set(PATH_PVC, await arquivoDoMotor())
        estado.rpcResposta = () => ({ data: null, error: { code, message } })
        const r = await subida('POST', 'PVC', E_PVC, { path: PATH_PVC, nome: 'Motor.xlsx' })
        expect(r.status).toBe(status)
        expect(r.corpo).toEqual({ error: message })
    })

    it.each([
        ['57014', 'passou do limite de tempo'],
        ['55P03', 'travada por outra operação'],
        ['23505', 'código 23505'],
    ])('outro erro do banco (%s): 500 com a frase do código e "nada foi gravado" — nunca o texto do banco', async (code, trecho) => {
        estado.objetos.set(PATH_PVC, await arquivoDoMotor())
        estado.rpcResposta = () => ({ data: null, error: { code, message: 'duplicate key value violates unique constraint "segredo_do_banco"' } })
        const r = await subida('POST', 'PVC', E_PVC, { path: PATH_PVC, nome: 'Motor.xlsx' })
        expect(r.status).toBe(500)
        expect(r.corpo.error).toContain(trecho)
        expect(r.corpo.error).toContain('Nada foi gravado')
        expect(JSON.stringify(r.corpo)).not.toContain('segredo_do_banco')
    })

    it('a conferência recusa o SUCESSO FALSO: a função devolve uma contagem menor → 500 com os dois lados', async () => {
        estado.objetos.set(PATH_PVC, await arquivoDoMotor())
        estado.rpcResposta = () => { const r = devolveOQueRecebeu(); (r.data as Linha).perfis = ((r.data as Linha).perfis as number) - 1; return r }
        const r = await subida('POST', 'PVC', E_PVC, { path: PATH_PVC, nome: 'Motor.xlsx' })
        expect(r.status).toBe(500)
        expect(r.corpo.error).toContain('NÃO deve ser considerado válido')
        expect(r.corpo.enviado.perfis).toBe(r.corpo.gravado.perfis + 1)
    })

    it('a função que não devolve a contagem de uma lista também é divergência', async () => {
        estado.objetos.set(PATH_PVC, await arquivoDoMotor())
        estado.rpcResposta = () => { const r = devolveOQueRecebeu(); delete (r.data as Linha).vidros; return r }
        expect((await subida('POST', 'PVC', E_PVC, { path: PATH_PVC, nome: 'Motor.xlsx' })).status).toBe(500)
    })

    it('a rota tem maxDuration de 90 s (a gravação chega a 35 s e o corpo leva ~19 s ao banco)', () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        expect(require('@/pages/api/super-admin/atendimentos-ia/familias/[chave]/etapas/[etapaId]/motor').config).toEqual({ maxDuration: 90 })
    })
})

describe('(4) PUT nome-da-materia-prima — o título da família é digitado', () => {
    const T = '00000000-0000-4000-8000-0000000000a1'
    const MP = '00000000-0000-4000-8000-00000000d001'
    const put = (corpo: unknown) => chamar(rotaDoNome, 'PUT', { tenant: T }, corpo)

    beforeEach(() => { estado.db.tenants = [{ id: T }] })

    it('chama SÓ superadmin_renomear_materia_prima, com a empresa da URL, o autor da sessão e o nome aparado', async () => {
        estado.rpcResposta = () => ({ data: { orcamentista_materia_prima: {} }, error: null })
        const r = await put({ materia_prima: MP, nome: '  Esquadrias de PVC  ' })
        expect(r.status).toBe(200)
        expect(estado.rpcs).toEqual([{ funcao: 'superadmin_renomear_materia_prima', args: { p_tenant: T, p_por: SUPER.id, p_materia_prima: MP, p_nome: 'Esquadrias de PVC' } }])
        expect(estado.escritasDiretas).toEqual([])
    })

    it('80 caracteres passa; 81 é recusado antes da função', async () => {
        estado.rpcResposta = () => ({ data: {}, error: null })
        expect((await put({ materia_prima: MP, nome: 'a'.repeat(80) })).status).toBe(200)
        estado.rpcs = []
        const r = await put({ materia_prima: MP, nome: 'a'.repeat(81) })
        expect(r.status).toBe(400)
        expect(estado.rpcs).toEqual([])
    })

    it.each([
        ['nome em branco', { materia_prima: MP, nome: '   ' }],
        ['nome que não é texto', { materia_prima: MP, nome: 3 }],
        ['sem nome', { materia_prima: MP }],
        ['matéria-prima que não é uuid', { materia_prima: 'x', nome: 'PVC' }],
        ['campo que não existe', { materia_prima: MP, nome: 'PVC', familia: 'PVC' }],
        ['o autor no corpo (é o da sessão)', { materia_prima: MP, nome: 'PVC', por: SUPER.id }],
        ['corpo lista', [MP]],
    ])('%s: 400 nomeado, e a função NÃO é chamada', async (_n, corpo) => {
        const r = await put(corpo)
        expect(r.status).toBe(400)
        nenhumaEscrita()
    })

    it.each([
        ['22023', 400, 'a empresa ja tem outra materia-prima com esse nome'],
        ['P0002', 404, 'materia-prima inexistente nesta empresa'],
        ['42501', 403, 'o autor da alteracao nao e super admin'],
    ])('o código %s vira %i com a mensagem da função', async (code, status, message) => {
        estado.rpcResposta = () => ({ data: null, error: { code, message } })
        const r = await put({ materia_prima: MP, nome: 'PVC' })
        expect(r.status).toBe(status)
        expect(r.corpo).toEqual({ error: message })
    })

    it('só PUT: GET, POST e DELETE são 405', async () => {
        for (const m of ['GET', 'POST', 'DELETE']) expect((await chamar(rotaDoNome, m, { tenant: T }, {})).status).toBe(405)
        nenhumaEscrita()
    })
})
