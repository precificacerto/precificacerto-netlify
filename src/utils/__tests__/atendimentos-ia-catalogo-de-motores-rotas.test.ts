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
    copias: [] as Array<{ de: string; para: string }>,
    removidos: [] as string[],
}

function montar() {
    estado.usuario = SUPER
    estado.rpcs = []
    estado.escritasDiretas = []
    estado.rpcResposta = null
    estado.objetos = new Map()
    estado.assinados = []
    estado.lidos = []
    estado.copias = []
    estado.removidos = []
    estado.falhaNoDownload = false
    estado.db = {
        users: [SUPER, COMUM],
        orcamentista_fornecedor: [{ id: W, nome: 'Wolf' }, { id: R, nome: 'Roller Star' }],
        // a família do motor de PERFIL vem da tabela de PERFIL do fornecedor (29/10/2026): a Wolf tem uma, ALUMINIO; a Roller Star, só de persiana
        orcamentista_tabela: [
            { id: 't-perfil', fornecedor_id: W, categoria_chave: 'PERFIL', familia: 'ALUMINIO' },
            { id: 't-ferragem', fornecedor_id: W, categoria_chave: 'FERRAGENS', familia: 'PVC' },
            { id: 't-persiana', fornecedor_id: R, categoria_chave: 'PERSIANAS', familia: null },
        ],
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
                copy: async (de: string, para: string): Promise<Linha> => { estado.copias.push({ de, para }); return { data: { path: para }, error: null } },
                remove: async (caminhos: string[]): Promise<Linha> => { estado.removidos.push(...caminhos); return { data: [], error: null } },
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
const rotaDaTroca = () => require('@/pages/api/super-admin/atendimentos-ia/motores/trocar-arquivo').default
const rotaDaEdicao = () => require('@/pages/api/super-admin/atendimentos-ia/motores/editar').default
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
const trocar = (body?: unknown, metodo = 'POST') => chamar(rotaDaTroca, metodo, {}, body)
const editar = (body?: unknown, metodo = 'POST') => chamar(rotaDaEdicao, metodo, {}, body)

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
    it('cada motor com o NOME do fornecedor, a categoria, o tipo, as tipologias contadas e os usos por nome, em ordem — UM por família, sem a etapa (29/10/2026)', async () => {
        const r = await motores('GET')
        expect(r.status).toBe(200)
        const [wolf, roller] = r.corpo.motores
        expect(wolf).toMatchObject({ id: M_WOLF, fornecedor: 'Wolf', categoria: 'PERFIL', familia: 'PVC', arquivo_nome: 'wolff.xlsm', arquivado_em: null, tipologias: 3 })
        // três etapas apontam o motor, duas delas da MESMA família: dois usos, e nenhum número nem nome de etapa
        expect(wolf.usos).toEqual([
            { empresa: 'Alfa Vidros', familia: 'PVC Linha 2' },
            { empresa: 'Esquadrias De Paula Ltda', familia: 'Esquadrias de PVC' },
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

describe('(3b) POST motores de PERFIL — a família vem da tabela de PERFIL do fornecedor (29/10/2026)', () => {
    it('família que NÃO é a de uma tabela de PERFIL do fornecedor: 400 nomeando as que há — nem download, nem função', async () => {
        estado.objetos.set(PATH, await arquivoDoMotor())
        const r = await motores('POST', { ...NOVO, familia: 'PVC' })
        expect(r.status).toBe(400)
        // a tabela de FERRAGENS da Wolf é PVC, e não conta: só a de PERFIL
        expect(r.corpo).toEqual({ error: 'A família do motor de Perfil vem da tabela de Perfil do fornecedor (ALUMINIO), e PVC não está entre elas.' })
        expect(estado.lidos).toEqual([])
        expect(estado.rpcs).toEqual([])
    })

    it('fornecedor SEM tabela de PERFIL: 400 dizendo de onde a família viria — nem download, nem função', async () => {
        estado.objetos.set(`${R}/motor/u1-Motor.xlsx`, await arquivoDoMotor())
        const r = await motores('POST', { ...NOVO, fornecedor_id: R, path: `${R}/motor/u1-Motor.xlsx` })
        expect(r.status).toBe(400)
        expect(r.corpo).toEqual({ error: 'O fornecedor não tem tabela de Perfil: a família do motor de Perfil vem dela. Cadastre a tabela de Perfil do fornecedor antes do motor.' })
        expect(estado.lidos).toEqual([])
        expect(estado.rpcs).toEqual([])
    })

    it('o contraste: fora do PERFIL a família não é conferida contra tabela — o motor de PERSIANAS da Roller Star segue até a função', async () => {
        estado.objetos.set(`${R}/motor/u1-Motor.xlsx`, await arquivoDoMotor())
        estado.rpcResposta = devolveOQueRecebeu
        const r = await motores('POST', { ...NOVO, fornecedor_id: R, categoria: 'PERSIANAS', familia: 'PVC', path: `${R}/motor/u1-Motor.xlsx` })
        expect(r.status).toBe(200)
        expect(estado.rpcs.map((x) => x.funcao)).toEqual(['superadmin_criar_motor'])
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

// ═══════════════════════════════════════════════════════════════════════════════════════
// TROCAR O ARQUIVO = MOTOR NOVO, e EDITAR só sem uso (dono do produto, 29/10/2026; migração 20261029000001)
const PATH_NOVO = `${W}/motor/u2-Motor-v2.xlsx`
function devolveATroca(): { data: unknown; error: null } {
    const r = devolveOQueRecebeu()
    return { data: { ...(r.data as Record<string, unknown>), motor_antigo: M_WOLF, etapas_reapontadas: 3 }, error: null }
}

describe('(6) POST motores/trocar-arquivo — motor NOVO, pela função, e confere', () => {
    it('o caminho feliz: lê o arquivo NOVO, chama SÓ a função de trocar com o autor da sessão, e devolve o motor novo, o antigo e as etapas', async () => {
        estado.objetos.set(PATH_NOVO, await arquivoDoMotor())
        estado.rpcResposta = devolveATroca
        const r = await trocar({ motor_id: M_WOLF, path: PATH_NOVO, nome: ' Motor v2.xlsx ' })
        expect(r.status).toBe(200)
        expect(estado.rpcs.map((x) => x.funcao)).toEqual(['superadmin_trocar_arquivo_do_motor'])
        expect(estado.rpcs[0].args).toMatchObject({ p_por: SUPER.id, p_motor: M_WOLF, p_arquivo_path: PATH_NOVO, p_arquivo_nome: 'Motor v2.xlsx' })
        expect((estado.rpcs[0].args.p_payload as Record<string, unknown[]>).regras).toHaveLength(2)
        expect(estado.lidos).toEqual([PATH_NOVO])
        expect(r.corpo).toMatchObject({ motor_id: MOTOR_NOVO, motor_antigo: M_WOLF, etapas_reapontadas: 3, regras: 2 })
        // nada se apaga: nem objeto, nem escrita direta
        expect(estado.removidos).toEqual([])
        expect(estado.escritasDiretas).toEqual([])
    })

    it('as recusas ANTES da função — cada uma sem baixar nada e sem chamar a função', async () => {
        estado.objetos.set(PATH_NOVO, await arquivoDoMotor())
        const casos: Array<[unknown, number, string]> = [
            [{ motor_id: 'x', path: PATH_NOVO, nome: 'a.xlsx' }, 400, 'O motor_id não é um uuid.'],
            [{ motor_id: M_WOLF, path: PATH_NOVO, nome: 'a.xlsx', por: SUPER.id }, 400, 'Campo desconhecido no corpo: por (só motor_id, path, nome).'],
            [{ motor_id: M_WOLF, path: PATH_NOVO, nome: 'a.pdf' }, 400, ''],
            [{ motor_id: '00000000-0000-4000-8000-0000000000ff', path: PATH_NOVO, nome: 'a.xlsx' }, 404, 'Motor não encontrado.'],
            [{ motor_id: M_ROLLER, path: `${R}/motor/u2.xlsx`, nome: 'a.xlsx' }, 400, 'O motor está arquivado: motor arquivado não se edita nem troca de arquivo.'],
            // o arquivo tem de estar na pasta do fornecedor DO MOTOR (o da Wolf), não na de outro
            [{ motor_id: M_WOLF, path: `${R}/motor/u2.xlsx`, nome: 'a.xlsx' }, 400, 'O arquivo não está na pasta de motor do fornecedor deste motor.'],
            [{ motor_id: M_WOLF, path: `${W}/motor/../x.xlsx`, nome: 'a.xlsx' }, 400, 'O arquivo não está na pasta de motor do fornecedor deste motor.'],
        ]
        for (const [corpo, status, frase] of casos) {
            const r = await trocar(corpo)
            expect([r.status, frase === '' || r.corpo.error === frase]).toEqual([status, true])
        }
        expect(estado.lidos).toEqual([])
        nenhumaEscrita()
    })

    it('o objeto que não está no bucket: 409 com o caminho; a planilha que o leitor recusa: 422 — a função NÃO é chamada', async () => {
        const r = await trocar({ motor_id: M_WOLF, path: PATH_NOVO, nome: 'Motor v2.xlsx' })
        expect(r.status).toBe(409)
        expect(r.corpo.error).toContain(PATH_NOVO)
        estado.objetos.set(PATH_NOVO, new Uint8Array([1, 2, 3]))
        expect((await trocar({ motor_id: M_WOLF, path: PATH_NOVO, nome: 'Motor v2.xlsx' })).status).toBe(422)
        nenhumaEscrita()
    })

    it('a recusa da função vai com a MENSAGEM DELA; outro erro é 500 com frase fixa', async () => {
        estado.objetos.set(PATH_NOVO, await arquivoDoMotor())
        estado.rpcResposta = () => ({ data: null, error: { code: '22023', message: 'o arquivo novo e o mesmo objeto do motor atual' } })
        let r = await trocar({ motor_id: M_WOLF, path: PATH_NOVO, nome: 'Motor v2.xlsx' })
        expect([r.status, r.corpo.error]).toEqual([400, 'o arquivo novo e o mesmo objeto do motor atual'])
        estado.rpcResposta = () => ({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } })
        r = await trocar({ motor_id: M_WOLF, path: PATH_NOVO, nome: 'Motor v2.xlsx' })
        expect(r.status).toBe(500)
        expect(r.corpo.error).not.toContain('canceling')
    })

    it('a conferência recusa o SUCESSO FALSO: a função devolve uma contagem menor → 500, nunca sucesso', async () => {
        estado.objetos.set(PATH_NOVO, await arquivoDoMotor())
        estado.rpcResposta = () => { const r = devolveATroca(); return { data: { ...(r.data as Record<string, unknown>), regras: 1 }, error: null } }
        const r = await trocar({ motor_id: M_WOLF, path: PATH_NOVO, nome: 'Motor v2.xlsx' })
        expect(r.status).toBe(500)
        expect(r.corpo.error).toContain('NÃO deve ser considerado válido')
    })

    it('só POST', async () => {
        for (const m of ['GET', 'PUT', 'DELETE']) expect((await trocar({}, m)).status).toBe(405)
        nenhumaEscrita()
    })
})

describe('(7) POST motores/editar — só sem uso; trocar o fornecedor leva o arquivo para a pasta do NOVO', () => {
    beforeEach(() => {
        // um motor de PERSIANAS da Roller Star, sem uso, para editar
        estado.db.orcamentista_motor.push({ id: MOTOR_NOVO, familia: 'PVC', fornecedor_id: R, categoria_chave: 'PERSIANAS', arquivo_nome: 'persiana.xlsx', arquivo_path: `${R}/motor/u1-persiana.xlsx`, criado_em: '2026-10-29', arquivado_em: null })
        estado.rpcResposta = () => ({ data: { orcamentista_motor: {} }, error: null })
    })

    it('a categoria, com o MESMO fornecedor: nenhuma cópia, e a função recebe o caminho de agora', async () => {
        const r = await editar({ motor_id: MOTOR_NOVO, fornecedor_id: R, categoria: 'FERRAGENS' })
        expect(r.status).toBe(200)
        expect(estado.copias).toEqual([])
        expect(estado.rpcs).toEqual([{ funcao: 'superadmin_editar_motor', args: { p_por: SUPER.id, p_motor: MOTOR_NOVO, p_fornecedor: R, p_categoria: 'FERRAGENS', p_arquivo_path: `${R}/motor/u1-persiana.xlsx` } }])
    })

    it('o fornecedor muda: o arquivo é COPIADO para a pasta de motor do novo, e a função recebe o caminho da cópia; o antigo não é tocado', async () => {
        const r = await editar({ motor_id: MOTOR_NOVO, fornecedor_id: W, categoria: 'PERSIANAS' })
        expect(r.status).toBe(200)
        expect(estado.copias).toHaveLength(1)
        expect(estado.copias[0].de).toBe(`${R}/motor/u1-persiana.xlsx`)
        expect(estado.copias[0].para.startsWith(`${W}/motor/`)).toBe(true)
        expect(estado.copias[0].para.endsWith('-persiana.xlsx')).toBe(true)
        expect(estado.rpcs[0].args.p_arquivo_path).toBe(estado.copias[0].para)
        expect(estado.removidos).toEqual([])
    })

    it('a função recusa (motor com uso): a mensagem dela vai, e a CÓPIA é removida — só ela, nunca o arquivo antigo', async () => {
        estado.rpcResposta = () => ({ data: null, error: { code: '22023', message: 'o motor tem uso (1 etapa(s), 0 item(ns) de levantamento)' } })
        const r = await editar({ motor_id: MOTOR_NOVO, fornecedor_id: W, categoria: 'PERSIANAS' })
        expect([r.status, r.corpo.error]).toEqual([400, 'o motor tem uso (1 etapa(s), 0 item(ns) de levantamento)'])
        expect(estado.removidos).toEqual([estado.copias[0].para])
        expect(estado.removidos).not.toContain(`${R}/motor/u1-persiana.xlsx`)
    })

    it('a recusa sem cópia (mesmo fornecedor) não remove nada', async () => {
        estado.rpcResposta = () => ({ data: null, error: { code: '22023', message: 'nada mudou' } })
        expect((await editar({ motor_id: MOTOR_NOVO, fornecedor_id: R, categoria: 'PERSIANAS' })).status).toBe(400)
        expect(estado.removidos).toEqual([])
    })

    it('PERFIL: a família do motor tem de ser a de uma tabela de Perfil do fornecedor — antes de copiar e de chamar a função', async () => {
        // a Wolf tem Perfil ALUMINIO; o motor é PVC
        let r = await editar({ motor_id: MOTOR_NOVO, fornecedor_id: W, categoria: 'PERFIL' })
        expect([r.status, r.corpo.error]).toEqual([400, 'A família do motor de Perfil vem da tabela de Perfil do fornecedor (ALUMINIO), e PVC não está entre elas.'])
        r = await editar({ motor_id: MOTOR_NOVO, fornecedor_id: R, categoria: 'PERFIL' })
        expect(r.corpo.error).toContain('não tem tabela de Perfil')
        expect(estado.copias).toEqual([])
        nenhumaEscrita()
    })

    it('as recusas da rota: corpo, motor inexistente, motor arquivado — sem cópia e sem função', async () => {
        const casos: Array<[unknown, number]> = [
            [{ motor_id: MOTOR_NOVO, fornecedor_id: R }, 400],
            [{ motor_id: MOTOR_NOVO, fornecedor_id: 'x', categoria: 'PERSIANAS' }, 400],
            [{ motor_id: MOTOR_NOVO, fornecedor_id: R, categoria: 'PERSIANAS', arquivo_path: 'x' }, 400],
            [{ motor_id: '00000000-0000-4000-8000-0000000000ff', fornecedor_id: R, categoria: 'PERSIANAS' }, 404],
            [{ motor_id: M_ROLLER, fornecedor_id: R, categoria: 'FERRAGENS' }, 400],
        ]
        for (const [corpo, status] of casos) expect((await editar(corpo)).status).toBe(status)
        expect(estado.copias).toEqual([])
        nenhumaEscrita()
    })
})
