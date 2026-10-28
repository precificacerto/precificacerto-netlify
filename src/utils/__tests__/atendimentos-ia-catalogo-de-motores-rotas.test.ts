/**
 * @jest-environment node
 *
 * PORTÃO — as ROTAS do CATÁLOGO DE MOTORES (dono do produto, 28/10/2026; migração 20261028000001):
 *   GET  /api/super-admin/atendimentos-ia/motores           (o catálogo, com fornecedor, categoria, tipo, tipologias e quem usa)
 *   POST /api/super-admin/atendimentos-ia/motores           (cria o motor no catálogo: `superadmin_criar_motor`)
 *   POST /api/super-admin/atendimentos-ia/motores/arquivar  (`superadmin_arquivar_motor`)
 *   PUT  /api/super-admin/base-de-conhecimento/nome-da-materia-prima  (o título da família é digitado)
 *
 * >>> O QUE ESTE PORTÃO **NÃO** ALCANÇA <<<
 * O banco é FALSO e o Storage também: o `rpc` só REGISTRA a chamada e devolve o que o caso mandar. O que a FUNÇÃO faz — criar o motor com
 * fornecedor e categoria, gravar as doze tabelas por `motor_id`, não apontar etapa, recusar o arquivar do motor que uma etapa aponta nomeando a
 * empresa — está provado num Postgres real em `scripts/harness/familia-instancia/`. O que ESTE portão prova é o que as ROTAS decidem: quem passa
 * (404 para o resto, antes de qualquer leitura de arquivo), que o caminho aceito é o da pasta DO FORNECEDOR, a ORDEM das recusas, que o autor é
 * o da SESSÃO, que a rota chama SÓ a função (nunca insert, update ou delete), que o erro da função vira o status e a frase certos, e que a
 * conferência das contagens recusa o sucesso falso.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- o cliente falso imita um cliente sem tipos */
import type { NextApiRequest, NextApiResponse } from 'next'
import ExcelJS from 'exceljs'

import { ABAS_DA_IMPORTACAO, LISTAS_DO_MOTOR_DA_ETAPA } from '@/utils/atendimentos-ia-importacao'
import { ROTAS_DOS_MOTORES } from '@/utils/atendimentos-ia-catalogo-de-motores'
import { abasDoSpec } from './fixtures/abas-do-motor-do-spec'

type Linha = Record<string, any>
const SUPER: Linha = { id: '00000000-0000-4000-8000-00000000005a', tenant_id: null, role: 'super_admin', is_super_admin: true }
const COMUM: Linha = { id: '00000000-0000-4000-8000-0000000000c0', tenant_id: 't-1', role: 'user', is_super_admin: false }
const W = '00000000-0000-4000-8000-0000000000f1'
const R = '00000000-0000-4000-8000-0000000000f2'
const MOTOR_NOVO = '00000000-0000-4000-8000-0000000000a9'
const M_WOLF = '00000000-0000-4000-8000-0000000000a1'
const M_ROLLER = '00000000-0000-4000-8000-0000000000a2'
const PATH = `${W}/motor/u1-Motor.xlsx`
// tipo ALUMINIO de propósito: o motor de PVC da Wolf é o único em produção, e um tipo fixo no código passaria com ele
const NOVO = { fornecedor_id: W, categoria: 'PERFIL', familia: 'ALUMINIO', path: PATH, nome: 'Motor.xlsx' }

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
        orcamentista_fornecedor: [{ id: W, nome: 'Wolf' }, { id: R, nome: 'Roller Star' }],
        orcamentista_motor: [
            { id: M_WOLF, familia: 'PVC', fornecedor_id: W, categoria_chave: 'PERFIL', arquivo_nome: 'wolff.xlsm', criado_em: '2026-10-27', arquivado_em: null },
            { id: M_ROLLER, familia: 'PVC', fornecedor_id: R, categoria_chave: 'PERSIANAS', arquivo_nome: 'roller.xlsx', criado_em: '2026-10-28', arquivado_em: '2026-10-28' },
        ],
        orcamentista_motor_tipologia_detalhe: [{ motor_id: M_WOLF }, { motor_id: M_WOLF }, { motor_id: M_WOLF }],
        orcamentista_familia_etapa: [
            { motor_id: M_WOLF, numero: 3, rotulo: 'Barras', materia_prima_id: 'mp-1', tenant_id: 't-1' },
            { motor_id: M_WOLF, numero: 1, rotulo: 'Apanhado', materia_prima_id: 'mp-1', tenant_id: 't-1' },
            { motor_id: M_WOLF, numero: 1, rotulo: 'Apanhar', materia_prima_id: 'mp-2', tenant_id: 't-2' },
        ],
        orcamentista_materia_prima: [{ id: 'mp-1', nome: 'Esquadrias de PVC' }, { id: 'mp-2', nome: 'PVC Linha 2' }],
        tenants: [{ id: 't-1', name: 'Esquadrias De Paula Ltda' }, { id: 't-2', name: 'Alfa Vidros' }],
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
            let cabeca = false
            q.select = (_c?: string, o?: { head?: boolean }) => { cabeca = o?.head === true; return q }
            q.eq = (c: string, v: unknown) => { filtros.push((l) => l[c] === v); return q }
            q.is = (c: string, v: unknown) => { filtros.push((l) => (l[c] ?? null) === v); return q }
            q.in = (c: string, vs: unknown[]) => { filtros.push((l) => vs.includes(l[c])); return q }
            q.order = () => q
            const linhas = () => (estado.db[tabela] ?? []).filter((l) => filtros.every((f) => f(l)))
            q.single = async (): Promise<Linha> => ({ data: linhas()[0] ?? null, error: null })
            q.maybeSingle = async (): Promise<Linha> => ({ data: linhas()[0] ?? null, error: null })
            q.then = (ok: (v: unknown) => unknown) => Promise.resolve(cabeca ? { data: null, count: linhas().length, error: null } : { data: linhas(), error: null }).then(ok)
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
const rotaDosMotores = () => require('@/pages/api/super-admin/atendimentos-ia/motores').default
const rotaDoArquivar = () => require('@/pages/api/super-admin/atendimentos-ia/motores/arquivar').default
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
const motores = (metodo: string, body?: unknown) => chamar(rotaDosMotores, metodo, {}, body)
const arquivar = (metodo: string, body?: unknown) => chamar(rotaDoArquivar, metodo, {}, body)

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
    return { data: { motor_id: MOTOR_NOVO, importacao_id: 'imp-1', ...contagens }, error: null }
}

let silencio: jest.SpyInstance
let registro: jest.SpyInstance
beforeEach(() => { montar(); silencio = jest.spyOn(console, 'error').mockImplementation(() => undefined); registro = jest.spyOn(console, 'log').mockImplementation(() => undefined) })
afterEach(() => { silencio.mockRestore(); registro.mockRestore() })

const nenhumaEscrita = () => { expect(estado.rpcs).toEqual([]); expect(estado.escritasDiretas).toEqual([]) }

describe('(1) o portão: quem não é super admin recebe 404, antes de ler arquivo e de chamar a função', () => {
    it.each([['comum', COMUM], ['sem sessão', null]])('as rotas, com usuário %s → 404', async (_n, usuario) => {
        estado.usuario = usuario
        expect((await motores('GET')).status).toBe(404)
        expect((await motores('POST', NOVO)).status).toBe(404)
        expect((await arquivar('POST', { motor_id: M_WOLF })).status).toBe(404)
        expect((await chamar(rotaDoNome, 'PUT', { tenant: '00000000-0000-4000-8000-0000000000a1' }, { materia_prima: M_WOLF, nome: 'x' })).status).toBe(404)
        nenhumaEscrita()
        expect(estado.lidos).toEqual([])
    })

    it('métodos: motores só GET e POST; arquivar só POST', async () => {
        for (const m of ['PUT', 'DELETE']) expect((await motores(m, {})).status).toBe(405)
        for (const m of ['GET', 'PUT', 'DELETE']) expect((await arquivar(m, {})).status).toBe(405)
        nenhumaEscrita()
    })
})

describe('(2) GET motores — o catálogo, com os nomes e quem usa', () => {
    it('cada motor com o NOME do fornecedor, a categoria, o tipo, as tipologias contadas e os usos por nome, em ordem', async () => {
        const r = await motores('GET')
        expect(r.status).toBe(200)
        const [wolf, roller] = r.corpo.motores
        expect(wolf).toMatchObject({ id: M_WOLF, fornecedor: 'Wolf', categoria: 'PERFIL', familia: 'PVC', arquivo_nome: 'wolff.xlsm', arquivado_em: null, tipologias: 3 })
        expect(wolf.usos).toEqual([
            { empresa: 'Alfa Vidros', familia: 'PVC Linha 2', etapa: 1, rotulo: 'Apanhar' },
            { empresa: 'Esquadrias De Paula Ltda', familia: 'Esquadrias de PVC', etapa: 1, rotulo: 'Apanhado' },
            { empresa: 'Esquadrias De Paula Ltda', familia: 'Esquadrias de PVC', etapa: 3, rotulo: 'Barras' },
        ])
        // o arquivado também vem (a tela o separa), sem uso e sem tipologia
        expect(roller).toMatchObject({ id: M_ROLLER, fornecedor: 'Roller Star', categoria: 'PERSIANAS', arquivado_em: '2026-10-28', tipologias: 0, usos: [] })
        nenhumaEscrita()
    })

    it('catálogo vazio é a lista vazia, não erro', async () => {
        estado.db.orcamentista_motor = []
        expect((await motores('GET')).corpo).toEqual({ motores: [] })
    })
})

describe('(3) POST motores — lê o arquivo, chama a função e confere', () => {
    it('o caminho feliz: chama SÓ a função, com o autor da SESSÃO, fornecedor, categoria, tipo, caminho e nome, e o payload do leitor', async () => {
        estado.objetos.set(PATH, await arquivoDoMotor())
        estado.rpcResposta = devolveOQueRecebeu
        const r = await motores('POST', { ...NOVO, nome: ' Motor.xlsx ' })
        expect(r.status).toBe(200)
        expect(estado.rpcs).toHaveLength(1)
        const { funcao, args } = estado.rpcs[0]
        expect(funcao).toBe('superadmin_criar_motor')
        expect(args).toMatchObject({ p_por: SUPER.id, p_fornecedor: W, p_categoria: 'PERFIL', p_familia: 'ALUMINIO', p_arquivo_path: PATH, p_arquivo_nome: 'Motor.xlsx' })
        const p = args.p_payload as Record<string, unknown[]>
        expect(p.regras.map((x: any) => x.codigo)).toEqual(['A1', 'B2'])
        expect(p).not.toHaveProperty('itens')
        expect(estado.lidos).toEqual([PATH])
        expect(estado.escritasDiretas).toEqual([])
        expect(r.corpo).toMatchObject({ motor_id: MOTOR_NOVO, importacao_id: 'imp-1', regras: 2, tipologias: 2 })
        expect(r.corpo).not.toHaveProperty('etapa_id')
        expect(Array.isArray(r.corpo.avisos)).toBe(true)
    })

    it.each([
        ['o autor no corpo (é o da sessão)', { ...NOVO, por: SUPER.id }],
        ['sem fornecedor', { ...NOVO, fornecedor_id: undefined }],
        ['sem categoria', { ...NOVO, categoria: '' }],
        ['sem tipo', { ...NOVO, familia: '' }],
        ['sem caminho', { ...NOVO, path: undefined }],
        ['caminho da pasta de OUTRO fornecedor', { ...NOVO, path: `${R}/motor/u1-Motor.xlsx` }],
        ['caminho da pasta da família (o desenho de antes)', { ...NOVO, path: 'familia/PVC/motor/u1-Motor.xlsx' }],
        ['caminho com ..', { ...NOVO, path: `${W}/motor/../../x/arquivo/x.xlsx` }],
        ['arquivo .xls', { ...NOVO, path: `${W}/motor/u1-Motor.xls`, nome: 'Motor.xls' }],
        ['corpo que não é objeto', 'x'],
    ])('%s: 400, e NADA é lido nem gravado', async (_n, corpo) => {
        estado.objetos.set(PATH, await arquivoDoMotor())
        const r = await motores('POST', corpo)
        expect(r.status).toBe(400)
        expect(typeof r.corpo.error).toBe('string')
        nenhumaEscrita()
        expect(estado.lidos).toEqual([])
    })

    it('objeto que não está no bucket: 409 com o caminho que faltou — e nada é gravado', async () => {
        const r = await motores('POST', NOVO)
        expect(r.status).toBe(409)
        expect(r.corpo.error).toContain(PATH)
        expect(r.corpo.error).toContain('Motor.xlsx')
        nenhumaEscrita()
    })

    it('o Storage falha ao baixar: 500 com frase fixa, nunca o texto do Storage; nada gravado', async () => {
        estado.objetos.set(PATH, await arquivoDoMotor())
        estado.falhaNoDownload = true
        const r = await motores('POST', NOVO)
        expect(r.status).toBe(500)
        expect(r.corpo.error).toBe('Não foi possível baixar o arquivo do motor.')
        expect(JSON.stringify(r.corpo)).not.toContain('storage fora')
        nenhumaEscrita()
    })

    it('planilha que o leitor recusa (sem as abas): 422 com a frase do leitor, e a função NÃO é chamada', async () => {
        const wb = new ExcelJS.Workbook()
        wb.addWorksheet('Outra').getRow(1).getCell(1).value = 'x'
        estado.objetos.set(PATH, new Uint8Array(await wb.xlsx.writeBuffer()))
        const r = await motores('POST', NOVO)
        expect(r.status).toBe(422)
        expect(r.corpo.error).toContain('Motor.xlsx')
        expect(r.corpo.error).toContain(`"${ABAS_DA_IMPORTACAO.motor}"`)
        nenhumaEscrita()
    })

    it.each([
        ['22023', 400, 'categoria fora da lista'],
        ['P0002', 404, 'fornecedor inexistente'],
        ['42501', 403, 'o autor da alteracao nao e super admin'],
    ])('a recusa da função (%s) vira %i com a MENSAGEM DELA', async (code, status, message) => {
        estado.objetos.set(PATH, await arquivoDoMotor())
        estado.rpcResposta = () => ({ data: null, error: { code, message } })
        const r = await motores('POST', NOVO)
        expect(r.status).toBe(status)
        expect(r.corpo).toEqual({ error: message })
    })

    it.each([
        ['57014', 'passou do limite de tempo'],
        ['23505', 'código 23505'],
    ])('outro erro do banco (%s): 500 com a frase do código e "nada foi gravado" — nunca o texto do banco', async (code, trecho) => {
        estado.objetos.set(PATH, await arquivoDoMotor())
        estado.rpcResposta = () => ({ data: null, error: { code, message: 'duplicate key value violates unique constraint "segredo_do_banco"' } })
        const r = await motores('POST', NOVO)
        expect(r.status).toBe(500)
        expect(r.corpo.error).toContain(trecho)
        expect(r.corpo.error).toContain('Nada foi gravado')
        expect(JSON.stringify(r.corpo)).not.toContain('segredo_do_banco')
    })

    it('a conferência recusa o SUCESSO FALSO: a função devolve uma contagem menor → 500 com os dois lados', async () => {
        estado.objetos.set(PATH, await arquivoDoMotor())
        estado.rpcResposta = () => { const r = devolveOQueRecebeu(); (r.data as Linha).perfis = ((r.data as Linha).perfis as number) - 1; return r }
        const r = await motores('POST', NOVO)
        expect(r.status).toBe(500)
        expect(r.corpo.error).toContain('NÃO deve ser considerado válido')
        expect(r.corpo.enviado.perfis).toBe(r.corpo.gravado.perfis + 1)
    })

    it('a função que não devolve a contagem de uma lista também é divergência', async () => {
        estado.objetos.set(PATH, await arquivoDoMotor())
        estado.rpcResposta = () => { const r = devolveOQueRecebeu(); delete (r.data as Linha).vidros; return r }
        expect((await motores('POST', NOVO)).status).toBe(500)
    })

    it('a rota tem maxDuration de 90 s (a gravação chega a 35 s e o corpo leva ~19 s ao banco)', () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        expect(require('@/pages/api/super-admin/atendimentos-ia/motores').config).toEqual({ maxDuration: 90 })
    })
})

describe('(3b) POST motores/arquivar — só a função, com o autor da sessão', () => {
    it('chama SÓ superadmin_arquivar_motor com o motor do corpo e o autor da sessão', async () => {
        estado.rpcResposta = () => ({ data: { orcamentista_motor: {} }, error: null })
        const r = await arquivar('POST', { motor_id: M_ROLLER })
        expect(r.status).toBe(200)
        expect(estado.rpcs).toEqual([{ funcao: 'superadmin_arquivar_motor', args: { p_motor: M_ROLLER, p_por: SUPER.id } }])
        expect(estado.escritasDiretas).toEqual([])
    })

    it.each([['o autor no corpo', { motor_id: M_ROLLER, por: SUPER.id }], ['id que não é uuid', { motor_id: 'x' }], ['sem corpo', undefined]])('%s: 400, e a função NÃO é chamada', async (_n, corpo) => {
        expect((await arquivar('POST', corpo)).status).toBe(400)
        nenhumaEscrita()
    })

    it('a recusa da função (o motor que uma etapa aponta) vai com a MENSAGEM dela, que nomeia a empresa', async () => {
        const message = 'o motor e o da etapa 1 ("Apanhado") da familia "Esquadrias de PVC" da empresa Esquadrias De Paula Ltda (e de mais 2): aponte as etapas para outro motor antes de arquivar'
        estado.rpcResposta = () => ({ data: null, error: { code: '22023', message } })
        const r = await arquivar('POST', { motor_id: M_WOLF })
        expect(r.status).toBe(400)
        expect(r.corpo).toEqual({ error: message })
    })

    it('as rotas da tela são estas', () => {
        expect(ROTAS_DOS_MOTORES.lista).toBe('/api/super-admin/atendimentos-ia/motores')
        expect(ROTAS_DOS_MOTORES.arquivar).toBe('/api/super-admin/atendimentos-ia/motores/arquivar')
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
