/**
 * @jest-environment node
 *
 * PORTÃO — as ROTAS da base de conhecimento (super admin). É a ÚNICA área do sistema em que o
 * tenant chega pelo PEDIDO, porque o super admin não tem tenant.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * >>> O QUE ESTE PORTÃO **NÃO** ALCANÇA <<<
 * O banco é FALSO: leituras em memória, e o `rpc` só REGISTRA a chamada. O que a FUNÇÃO faz — o
 * ausente que não apaga, o null que limpa e volta a herdar, a UMA linha de log com antes e depois,
 * o log que desfaz a escrita quando falha, as funções fechadas para anon/authenticated — está
 * provado num Postgres real, em `scripts/harness/base-de-conhecimento/`.
 * O que ESTE portão prova é o que as ROTAS decidem: quem passa (404 para o resto, sem escrita), o
 * tenant que existe, o efetivo campo a campo, o que é recusado ANTES do banco com erro nomeado, e
 * que os três estados do corpo — ausente, null, false — chegam à função sem colapsar.
 * ══════════════════════════════════════════════════════════════════════════════════════════
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- o cliente falso imita um cliente sem tipos */
import type { NextApiRequest, NextApiResponse } from 'next'

type Linha = Record<string, any>

const T_ESQ = '00000000-0000-4000-8000-0000000000a1'      // tenant no nicho Esquadrias
const T_OUTRA = '00000000-0000-4000-8000-0000000000b2'    // outra empresa, também Esquadrias
const T_MARC = '00000000-0000-4000-8000-0000000000c3'     // tenant no nicho Marcenaria
const T_SEM_NICHO = '00000000-0000-4000-8000-0000000000d4'
const T_INEXISTENTE = '00000000-0000-4000-8000-0000000000ff'
const N_ESQ = '00000000-0000-4000-8000-0000000000e5'
const N_MARC = '00000000-0000-4000-8000-0000000000e6'
const N_INEXISTENTE = '00000000-0000-4000-8000-0000000000e7'
const EMP_ESQ = '00000000-0000-4000-8000-00000000f0a1'
const EMP_OUTRA = '00000000-0000-4000-8000-00000000f0b2'

const SUPER = { id: 'u-super', tenant_id: null, role: 'super_admin', is_super_admin: true }
const ADMIN_DE_TENANT = { id: 'u-admin', tenant_id: T_ESQ, role: 'admin', is_super_admin: false }
const COMUM = { id: 'u-comum', tenant_id: T_ESQ, role: 'user', is_super_admin: false }

const estado = {
    usuario: SUPER as Linha | null,
    db: {} as Record<string, Linha[]>,
    rpcs: [] as Array<{ nome: string; args: Linha }>,
    escritasDiretas: [] as string[],
    respostaDoRpc: null as null | { data: unknown; error: { code: string; message: string } | null },
}

function montar() {
    estado.usuario = SUPER
    estado.rpcs = []
    estado.escritasDiretas = []
    estado.respostaDoRpc = null
    estado.db = {
        users: [SUPER, ADMIN_DE_TENANT, COMUM],
        tenants: [{ id: T_ESQ }, { id: T_OUTRA }, { id: T_MARC }, { id: T_SEM_NICHO }],
        orcamentista_nicho: [
            { id: N_ESQ, modelo: 'FABRICACAO', nome: 'Esquadrias' },
            { id: N_MARC, modelo: 'FABRICACAO', nome: 'Marcenaria' },
        ],
        orcamentista_config: [
            { tenant_id: T_ESQ, nicho_id: N_ESQ },
            { tenant_id: T_OUTRA, nicho_id: N_ESQ },
            { tenant_id: T_MARC, nicho_id: N_MARC },
        ],
        orcamentista_esquadrias_padrao: [],
        orcamentista_esquadrias_base: [],
        orcamentista_base_conhecimento: [],
        orcamentista_padrao_ambiente: [],
        orcamentista_vendedor_perfil: [],
        employees: [
            { id: EMP_ESQ, tenant_id: T_ESQ, name: 'Ana Souza' },
            { id: EMP_OUTRA, tenant_id: T_OUTRA, name: 'Bruno Lima' },
        ],
    }
}

jest.mock('@/supabase/admin', () => ({
    supabaseAdmin: {
        auth: {
            getUser: async () => (estado.usuario
                ? { data: { user: { id: estado.usuario.id } }, error: null }
                : { data: { user: null }, error: { message: 'sem sessão' } }),
        },
        rpc: async (nome: string, args: Linha) => {
            estado.rpcs.push({ nome, args: JSON.parse(JSON.stringify(args)) })
            return estado.respostaDoRpc ?? { data: { depois: 'da função' }, error: null }
        },
        from: (tabela: string) => {
            const filtros: Array<(l: Linha) => boolean> = []
            const linhas = () => (estado.db[tabela] ?? []).filter((l) => filtros.every((f) => f(l)))
            const q: any = {}
            q.select = () => q
            q.eq = (c: string, v: unknown) => { filtros.push((l) => l[c] === v); return q }
            q.in = (c: string, vs: unknown[]) => { filtros.push((l) => vs.includes(l[c])); return q }
            q.order = () => q
            q.maybeSingle = async () => ({ data: linhas()[0] ?? null, error: null })
            q.single = async () => {
                const l = linhas()
                return l.length === 1 ? { data: l[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'linhas' } }
            }
            q.then = (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve({ data: linhas(), error: null }).then(ok, erro)
            for (const escrita of ['insert', 'update', 'upsert', 'delete']) {
                q[escrita] = () => { estado.escritasDiretas.push(`${escrita} ${tabela}`); return q }
            }
            return q
        },
    },
}))

type Rota = (q: NextApiRequest, s: NextApiResponse) => Promise<unknown>
/* eslint-disable @typescript-eslint/no-require-imports */
const ROTAS: Record<string, Rota> = {
    base: require('@/pages/api/super-admin/base-de-conhecimento/index').default,
    ambiente: require('@/pages/api/super-admin/base-de-conhecimento/ambiente').default,
    vendedor: require('@/pages/api/super-admin/base-de-conhecimento/vendedor').default,
    padraoNicho: require('@/pages/api/super-admin/base-de-conhecimento/padrao-nicho').default,
}
/* eslint-enable @typescript-eslint/no-require-imports */

async function chamar(rota: keyof typeof ROTAS, method: string, query: Linha = {}, body?: unknown) {
    let status = 0
    let json: any = null
    const res = { status(n: number) { status = n; return res }, json(b: unknown) { json = b; return res }, setHeader() { return res } }
    await ROTAS[rota]({ cookies: { token: 't' }, method, query, body } as unknown as NextApiRequest, res as unknown as NextApiResponse)
    return { status, json }
}

const nenhumaEscrita = () => { expect(estado.rpcs).toEqual([]); expect(estado.escritasDiretas).toEqual([]) }

let silencio: jest.SpyInstance
beforeEach(() => { montar(); silencio = jest.spyOn(console, 'error').mockImplementation(() => undefined) })
afterEach(() => silencio.mockRestore())

// Cada rota, cada método, com corpo VÁLIDO: a recusa tem de vir do portão, não de um corpo ruim.
const CADA_ROTA: Array<[keyof typeof ROTAS, string, Linha, unknown]> = [
    ['base', 'GET', { tenant: T_ESQ }, undefined],
    ['base', 'PUT', { tenant: T_ESQ }, { esquadrias: { linha_perfil: 'Suprema' } }],
    ['ambiente', 'PUT', { tenant: T_ESQ }, { ambientes: [{ ambiente: 'Sala' }] }],
    ['vendedor', 'PUT', { tenant: T_ESQ }, { vendedores: [{ employee_id: EMP_ESQ, comissao_percentual: 5 }] }],
    ['padraoNicho', 'PUT', { nicho: N_ESQ }, { esquadrias: { linha_perfil: 'Gold' } }],
]

// ═══════════════════════════════════════════════════════════════════════════════════════
describe('(1) o portão: quem não é super admin recebe 404 — e ZERO escrita', () => {
    it.each(CADA_ROTA)('%s %s com usuário comum → 404', async (rota, metodo, query, body) => {
        estado.usuario = COMUM
        const r = await chamar(rota, metodo, query, body)
        expect(r.status).toBe(404)
        nenhumaEscrita()
    })

    it.each(CADA_ROTA)('%s %s com admin de tenant → 404', async (rota, metodo, query, body) => {
        estado.usuario = ADMIN_DE_TENANT
        const r = await chamar(rota, metodo, query, body)
        expect(r.status).toBe(404)
        nenhumaEscrita()
    })

    it.each(CADA_ROTA)('%s %s sem sessão → 404, não 401', async (rota, metodo, query, body) => {
        estado.usuario = null
        const r = await chamar(rota, metodo, query, body)
        expect(r.status).toBe(404)
        nenhumaEscrita()
    })

    it('o papel vindo do CORPO não abre nada: admin de tenant com is_super_admin: true no corpo → 404', async () => {
        estado.usuario = ADMIN_DE_TENANT
        const r = await chamar('base', 'PUT', { tenant: T_ESQ }, { esquadrias: { linha_perfil: 'X' }, is_super_admin: true, role: 'super_admin' })
        expect(r.status).toBe(404)
        nenhumaEscrita()
    })

    it('o 404 de quem não é super admin é o MESMO de uma rota que não existe', async () => {
        estado.usuario = COMUM
        const r = await chamar('base', 'GET', { tenant: T_ESQ })
        expect(r.json).toEqual({ error: 'Not found' })
    })
})

describe('(2) o tenant vem do QUERY STRING: uuid e existente, senão 404 — e zero escrita', () => {
    it.each(CADA_ROTA.filter(([r]) => r !== 'padraoNicho'))('%s %s com tenant inexistente → 404', async (rota, metodo, _q, body) => {
        const r = await chamar(rota, metodo, { tenant: T_INEXISTENTE }, body)
        expect(r.status).toBe(404)
        nenhumaEscrita()
    })

    it.each([['não é uuid', 'abc'], ['ausente', undefined], ['em lista', [T_ESQ, T_OUTRA]]])('tenant %s → 404', async (_n, tenant) => {
        const r = await chamar('base', 'PUT', tenant === undefined ? {} : { tenant }, { esquadrias: { linha_perfil: 'X' } })
        expect(r.status).toBe(404)
        nenhumaEscrita()
    })

    it('um tenant no CORPO é recusado (400), não usado: o tenant só vem do query string', async () => {
        const r = await chamar('base', 'PUT', { tenant: T_ESQ }, { esquadrias: { linha_perfil: 'X' }, tenant_id: T_OUTRA })
        expect(r.status).toBe(400)
        nenhumaEscrita()
    })

    it('padrão do nicho com nicho inexistente → 404, zero escrita', async () => {
        const r = await chamar('padraoNicho', 'PUT', { nicho: N_INEXISTENTE }, { esquadrias: { linha_perfil: 'X' } })
        expect(r.status).toBe(404)
        nenhumaEscrita()
    })
})

describe('(3) GET — o EFETIVO campo a campo, com a origem', () => {
    beforeEach(() => {
        estado.db.orcamentista_esquadrias_padrao.push({ nicho_id: N_ESQ, usa_contramarco: true, vidro_predominante: 'Incolor 4mm', linha_perfil: 'Gold', cores_perfil: ['Branco'] })
        estado.db.orcamentista_esquadrias_base.push({ tenant_id: T_ESQ, usa_contramarco: false, vidro_predominante: null, linha_perfil: 'Suprema' })
    })

    it('campo só no nicho → origem "nicho"; campo na empresa → "empresa"; vazio nos dois → "sem valor"', async () => {
        const r = await chamar('base', 'GET', { tenant: T_ESQ })
        expect(r.status).toBe(200)
        const e = r.json.esquadrias.efetivo
        expect(e.vidro_predominante).toEqual({ valor: 'Incolor 4mm', origem: 'nicho' })
        expect(e.linha_perfil).toEqual({ valor: 'Suprema', origem: 'empresa' })
        expect(e.solda).toEqual({ valor: null, origem: 'sem valor' })
        expect(e.cores_perfil).toEqual({ valor: ['Branco'], origem: 'nicho' })
    })

    it('FALSE na empresa com TRUE no nicho → efetivo false, origem "empresa"', async () => {
        const r = await chamar('base', 'GET', { tenant: T_ESQ })
        expect(r.json.esquadrias.efetivo.usa_contramarco).toEqual({ valor: false, origem: 'empresa' })
    })

    it('o efetivo cobre TODOS os campos de esquadrias, e só eles', async () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { CAMPOS_DE_ESQUADRIAS } = require('@/lib/atendimentos-ia/base-de-conhecimento')
        const r = await chamar('base', 'GET', { tenant: T_ESQ })
        expect(Object.keys(r.json.esquadrias.efetivo)).toEqual(Object.keys(CAMPOS_DE_ESQUADRIAS))
    })

    it('a resposta traz a base, o padrão do nicho, os adicionais, os ambientes e os vendedores com o nome', async () => {
        estado.db.orcamentista_base_conhecimento.push({ tenant_id: T_ESQ, frete_modo: 'VALOR', frete_valor: 150 })
        estado.db.orcamentista_padrao_ambiente.push({ tenant_id: T_ESQ, ambiente: 'Sala', vidro_padrao: 'Temperado 8mm', tipologia_usual: null })
        estado.db.orcamentista_vendedor_perfil.push({ tenant_id: T_ESQ, employee_id: EMP_ESQ, comissao_percentual: 5 })
        const r = await chamar('base', 'GET', { tenant: T_ESQ })
        expect(r.json.esquadrias.empresa).toEqual(expect.objectContaining({ linha_perfil: 'Suprema' }))
        expect(r.json.esquadrias.nicho).toEqual(expect.objectContaining({ linha_perfil: 'Gold' }))
        expect(r.json.nicho).toEqual({ id: N_ESQ, modelo: 'FABRICACAO', nome: 'Esquadrias' })
        expect(r.json.adicionais).toEqual(expect.objectContaining({ frete_modo: 'VALOR', frete_valor: 150 }))
        expect(r.json.ambientes).toEqual([expect.objectContaining({ ambiente: 'Sala', vidro_padrao: 'Temperado 8mm' })])
        expect(r.json.vendedores).toEqual([expect.objectContaining({ employee_id: EMP_ESQ, comissao_percentual: 5, nome_do_funcionario: 'Ana Souza' })])
    })

    it('tenant sem nicho configurado: sem padrão, o efetivo é só o da empresa', async () => {
        estado.db.orcamentista_esquadrias_base.push({ tenant_id: T_SEM_NICHO, linha_perfil: 'Própria' })
        const r = await chamar('base', 'GET', { tenant: T_SEM_NICHO })
        expect(r.status).toBe(200)
        expect(r.json.nicho).toBeNull()
        expect(r.json.esquadrias.nicho).toBeNull()
        expect(r.json.esquadrias.efetivo.linha_perfil).toEqual({ valor: 'Própria', origem: 'empresa' })
        expect(r.json.esquadrias.efetivo.vidro_predominante).toEqual({ valor: null, origem: 'sem valor' })
    })

    it('o GET não escreve nada', async () => {
        await chamar('base', 'GET', { tenant: T_ESQ })
        nenhumaEscrita()
    })
})

describe('(4) PUT — ausente, null e false chegam à função SEM colapsar', () => {
    it('campo AUSENTE não vai: a função recebe só as chaves enviadas, e o resto fica como está', async () => {
        const r = await chamar('base', 'PUT', { tenant: T_ESQ }, { esquadrias: { linha_perfil: 'Suprema' } })
        expect(r.status).toBe(200)
        expect(estado.rpcs).toHaveLength(1)
        expect(estado.rpcs[0].nome).toBe('superadmin_gravar_base_da_empresa')
        expect(estado.rpcs[0].args.p_esquadrias).toEqual({ linha_perfil: 'Suprema' })
        expect(Object.keys(estado.rpcs[0].args.p_esquadrias)).toEqual(['linha_perfil'])
        expect(estado.rpcs[0].args.p_adicionais).toBeNull()
    })

    it('campo com NULL vai como null — é o "apague e volte a herdar"', async () => {
        await chamar('base', 'PUT', { tenant: T_ESQ }, { esquadrias: { vidro_predominante: null } })
        const p = estado.rpcs[0].args.p_esquadrias
        expect(Object.prototype.hasOwnProperty.call(p, 'vidro_predominante')).toBe(true)
        expect(p.vidro_predominante).toBeNull()
    })

    it('campo com FALSE vai como false — nem null, nem omitido', async () => {
        await chamar('base', 'PUT', { tenant: T_ESQ }, { esquadrias: { usa_contramarco: false } })
        expect(estado.rpcs[0].args.p_esquadrias).toEqual({ usa_contramarco: false })
    })

    it('o tenant e o autor vêm do pedido e da SESSÃO, nunca do corpo', async () => {
        await chamar('base', 'PUT', { tenant: T_ESQ }, { esquadrias: { linha_perfil: 'X' } })
        expect(estado.rpcs[0].args.p_tenant).toBe(T_ESQ)
        expect(estado.rpcs[0].args.p_por).toBe(SUPER.id)
    })

    it('a resposta devolve o "depois" que a função devolveu', async () => {
        const r = await chamar('base', 'PUT', { tenant: T_ESQ }, { esquadrias: { linha_perfil: 'X' } })
        expect(r.json).toEqual({ depois: { depois: 'da função' } })
    })

    it('UMA escrita = UMA chamada à função (que grava a linha de log na mesma transação)', async () => {
        await chamar('base', 'PUT', { tenant: T_ESQ }, { esquadrias: { linha_perfil: 'X' }, adicionais: { frete_modo: 'NAO_COBRA' } })
        expect(estado.rpcs).toHaveLength(1)
        expect(estado.rpcs[0].args.p_adicionais).toEqual({ frete_modo: 'NAO_COBRA' })
        expect(estado.escritasDiretas).toEqual([])
    })

    it('padrão do nicho: a mesma regra, e a função recebe o nicho, sem tenant', async () => {
        await chamar('padraoNicho', 'PUT', { nicho: N_ESQ }, { esquadrias: { usa_contramarco: false, vidro_predominante: null } })
        expect(estado.rpcs).toEqual([{ nome: 'superadmin_gravar_esquadrias_padrao', args: { p_nicho: N_ESQ, p_por: SUPER.id, p_campos: { usa_contramarco: false, vidro_predominante: null } } }])
    })
})

describe('(5) validação ANTES do banco: erro nomeado, e NENHUMA chamada à função (logo, nenhum log)', () => {
    const recusa = async (rota: keyof typeof ROTAS, query: Linha, body: unknown, campo: string) => {
        const r = await chamar(rota, 'PUT', query, body)
        expect(r.status).toBe(400)
        expect(r.json.erros).toEqual(expect.arrayContaining([expect.objectContaining({ campo })]))
        nenhumaEscrita()
        return r
    }

    it.each([
        ['guarnição interna 0 mm', { guarnicao_interna_mm: 0 }, 'esquadrias.guarnicao_interna_mm'],
        ['barra fracionária', { barra_mm: 6000.5 }, 'esquadrias.barra_mm'],
        ['booleano em texto', { usa_contramarco: 'sim' }, 'esquadrias.usa_contramarco'],
        ['texto vazio', { linha_perfil: '   ' }, 'esquadrias.linha_perfil'],
        ['lista que não é lista', { cores_perfil: 'Branco' }, 'esquadrias.cores_perfil'],
        ['mapa de cor com valor não texto', { cor_acessorio_por_perfil: { branco: 1 } }, 'esquadrias.cor_acessorio_por_perfil'],
        ['campo desconhecido', { espessura_baguete: 3 }, 'esquadrias.espessura_baguete'],
        ['chave de tabela no corpo', { tenant_id: T_OUTRA }, 'esquadrias.tenant_id'],
    ])('esquadrias: %s → 400 nomeado', async (_n, esquadrias, campo) => {
        await recusa('base', { tenant: T_ESQ }, { esquadrias }, campo)
    })

    it.each([
        ['VALOR sem valor', { frete_modo: 'VALOR' }, 'adicionais.frete_valor'],
        ['VALOR com base preenchida', { frete_modo: 'VALOR', frete_valor: 100, frete_base: 'VALOR_DE_VENDA' }, 'adicionais.frete_base'],
        ['PERCENTUAL sem base', { frete_modo: 'PERCENTUAL', frete_percentual: 5 }, 'adicionais.frete_base'],
        ['modo fora da lista', { instalacao_modo: 'GRATIS' }, 'adicionais.instalacao_modo'],
        ['base de instalação no frete', { frete_modo: 'PERCENTUAL', frete_percentual: 5, frete_base: 'CUSTO_DA_INSTALACAO' }, 'adicionais.frete_base'],
        ['valor negativo', { instalacao_modo: 'VALOR', instalacao_valor: -1 }, 'adicionais.instalacao_valor'],
    ])('adicionais: %s → 400 nomeado', async (_n, adicionais, campo) => {
        await recusa('base', { tenant: T_ESQ }, { adicionais }, campo)
    })

    it('a coerência é do ESTADO RESULTANTE: VALOR gravado + mudar para PERCENTUAL sem limpar o valor → recusa', async () => {
        estado.db.orcamentista_base_conhecimento.push({ tenant_id: T_ESQ, frete_modo: 'VALOR', frete_valor: 100, frete_percentual: null, frete_base: null })
        await recusa('base', { tenant: T_ESQ }, { adicionais: { frete_modo: 'PERCENTUAL', frete_percentual: 5, frete_base: 'VALOR_DE_VENDA' } }, 'adicionais.frete_valor')
    })

    it('o contraste: o mesmo pedido limpando o valor com null → aceito', async () => {
        estado.db.orcamentista_base_conhecimento.push({ tenant_id: T_ESQ, frete_modo: 'VALOR', frete_valor: 100, frete_percentual: null, frete_base: null })
        const r = await chamar('base', 'PUT', { tenant: T_ESQ }, { adicionais: { frete_modo: 'PERCENTUAL', frete_percentual: 5, frete_base: 'VALOR_DE_VENDA', frete_valor: null } })
        expect(r.status).toBe(200)
        expect(estado.rpcs).toHaveLength(1)
    })

    it.each([
        ['corpo vazio', {}],
        ['esquadrias vazio', { esquadrias: {} }],
        ['chave de topo desconhecida', { esquadrias: { linha_perfil: 'X' }, por: 'outro-usuario' }],
        ['esquadrias que não é objeto', { esquadrias: ['linha_perfil'] }],
    ])('%s → 400, nenhuma chamada', async (_n, body) => {
        const r = await chamar('base', 'PUT', { tenant: T_ESQ }, body)
        expect(r.status).toBe(400)
        nenhumaEscrita()
    })

    it('esquadrias numa empresa de OUTRO nicho → 409 legível, nenhuma chamada', async () => {
        const r = await chamar('base', 'PUT', { tenant: T_MARC }, { esquadrias: { linha_perfil: 'X' } })
        expect(r.status).toBe(409)
        expect(r.json.error).toMatch(/Esquadrias/)
        nenhumaEscrita()
    })

    it('o contraste: só os adicionais, na mesma empresa de outro nicho → aceito (frete existe em qualquer nicho)', async () => {
        const r = await chamar('base', 'PUT', { tenant: T_MARC }, { adicionais: { frete_modo: 'NAO_COBRA' } })
        expect(r.status).toBe(200)
        expect(estado.rpcs).toHaveLength(1)
    })

    it('padrão de esquadrias num nicho que NÃO é Esquadrias → 409, nenhuma chamada', async () => {
        const r = await chamar('padraoNicho', 'PUT', { nicho: N_MARC }, { esquadrias: { linha_perfil: 'X' } })
        expect(r.status).toBe(409)
        nenhumaEscrita()
    })

    it.each([
        ['ambiente vazio', { ambientes: [{ ambiente: '' }] }, 'ambientes[0].ambiente'],
        ['ambiente repetido', { ambientes: [{ ambiente: 'Sala' }, { ambiente: 'Sala' }] }, 'ambientes[1].ambiente'],
        ['campo desconhecido', { ambientes: [{ ambiente: 'Sala', cor: 'x' }] }, 'ambientes[0].cor'],
        ['lista que não é lista', { ambientes: { ambiente: 'Sala' } }, 'ambientes'],
    ])('ambiente: %s → 400 nomeado', async (_n, body, campo) => {
        await recusa('ambiente', { tenant: T_ESQ }, body, campo)
    })

    it.each([
        ['comissão acima de 100', { vendedores: [{ employee_id: EMP_ESQ, comissao_percentual: 101 }] }, 'vendedores[0].comissao_percentual'],
        ['modo de comissão fora da lista', { vendedores: [{ employee_id: EMP_ESQ, comissao_modo: 'FIXA' }] }, 'vendedores[0].comissao_modo'],
        ['funcionário repetido', { vendedores: [{ employee_id: EMP_ESQ }, { employee_id: EMP_ESQ }] }, 'vendedores[1].employee_id'],
        ['employee_id que não é uuid', { vendedores: [{ employee_id: 'ana' }] }, 'vendedores[0].employee_id'],
    ])('vendedor: %s → 400 nomeado', async (_n, body, campo) => {
        await recusa('vendedor', { tenant: T_ESQ }, body, campo)
    })
})

describe('(6) vendedor de OUTRA empresa: recusado com erro legível, antes da constraint', () => {
    it('o funcionário da outra empresa → 400 dizendo que não é desta empresa, e nenhuma chamada', async () => {
        const r = await chamar('vendedor', 'PUT', { tenant: T_ESQ }, { vendedores: [{ employee_id: EMP_OUTRA, comissao_percentual: 5 }] })
        expect(r.status).toBe(400)
        expect(r.json.erros).toEqual([expect.objectContaining({ campo: 'vendedores[0].employee_id', mensagem: expect.stringMatching(/não é funcionário desta empresa/) })])
        nenhumaEscrita()
    })

    it('funcionário inexistente → a mesma recusa, nenhuma chamada', async () => {
        const r = await chamar('vendedor', 'PUT', { tenant: T_ESQ }, { vendedores: [{ employee_id: '00000000-0000-4000-8000-00000000f0ff' }] })
        expect(r.status).toBe(400)
        nenhumaEscrita()
    })

    it('o contraste: o funcionário da própria empresa → uma chamada, com a lista inteira', async () => {
        const r = await chamar('vendedor', 'PUT', { tenant: T_ESQ }, { vendedores: [{ employee_id: EMP_ESQ, comissao_percentual: 5, comissao_modo: 'PROPORCIONAL' }] })
        expect(r.status).toBe(200)
        expect(estado.rpcs).toEqual([{ nome: 'superadmin_gravar_vendedor_perfil', args: { p_tenant: T_ESQ, p_por: SUPER.id, p_lista: [{ employee_id: EMP_ESQ, comissao_percentual: 5, comissao_modo: 'PROPORCIONAL' }] } }])
    })

    it('ambiente: a lista vai inteira, com ausente e null preservados por item', async () => {
        await chamar('ambiente', 'PUT', { tenant: T_ESQ }, { ambientes: [{ ambiente: 'Sala', vidro_padrao: null }, { ambiente: 'Cozinha', tipologia_usual: 'Basculante' }] })
        expect(estado.rpcs).toEqual([{ nome: 'superadmin_gravar_padrao_ambiente', args: { p_tenant: T_ESQ, p_por: SUPER.id, p_lista: [{ ambiente: 'Sala', vidro_padrao: null }, { ambiente: 'Cozinha', tipologia_usual: 'Basculante' }] } }])
    })
})

describe('(7) o que a função recusa vira resposta legível — e o texto do banco não vaza', () => {
    it.each([
        ['23503 (a FK composta do vendedor)', '23503', 400],
        ['23514 (um CHECK)', '23514', 400],
        ['22023 (parâmetro que a função recusou)', '22023', 400],
        ['P0002 (tenant sumiu entre a checagem e a escrita)', 'P0002', 404],
        ['qualquer outro', 'XX000', 500],
    ])('%s → %s', async (_n, code, status) => {
        estado.respostaDoRpc = { data: null, error: { code, message: 'detalhe interno do banco' } }
        const r = await chamar('base', 'PUT', { tenant: T_ESQ }, { esquadrias: { linha_perfil: 'X' } })
        expect(r.status).toBe(status)
        expect(JSON.stringify(r.json)).not.toContain('detalhe interno do banco')
    })
})

describe('(8) métodos', () => {
    it.each([['base', 'DELETE'], ['ambiente', 'GET'], ['vendedor', 'POST'], ['padraoNicho', 'GET']] as const)('%s %s → 405, depois do portão', async (rota, metodo) => {
        const r = await chamar(rota, metodo, { tenant: T_ESQ, nicho: N_ESQ })
        expect(r.status).toBe(405)
        nenhumaEscrita()
    })

    it('método errado de quem NÃO é super admin → 404 (o portão vem antes do 405)', async () => {
        estado.usuario = COMUM
        const r = await chamar('base', 'DELETE', { tenant: T_ESQ })
        expect(r.status).toBe(404)
    })
})
