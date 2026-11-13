/**
 * @jest-environment node
 *
 * PORTÃO — a ROTA da conferência de referências e a LEITURA do banco (12/11/2026):
 *   - só o super admin; só GET; o motor é um id; o motor que não existe é 404; a falha do banco é 500 com a frase;
 *   - a resposta são as QUATRO LISTAS NOMEADAS (e a das achadas sem o sufixo com outra descrição), da escada de `conferencia-de-referencias.ts`;
 *   - a leitura pagina de mil em mil: com 2.500 regras e 1.200 itens, nenhum fica de fora (o PostgREST corta em mil, e o código cortado
 *     apareceria como "não achado" sem estar).
 */
import type { NextApiRequest, NextApiResponse } from 'next'

const MOTOR = '00000000-0000-4000-8000-0000000000a1'
const estado = {
    superAdmin: true,
    motores: [{ id: MOTOR, nome: 'Motor Wolf', arquivado_em: null, fornecedor_id: 'f1' }] as Array<Record<string, unknown>>,
    familias: [{ motor_id: MOTOR, familia: 'PVC' }] as Array<Record<string, unknown>>,
    regras: [] as Array<Record<string, unknown>>,
    itens: [] as Array<Record<string, unknown>>,
    tabelas: [{ id: 't1', arquivo_nome: 'Perfis.xlsx', categoria_chave: 'PERFIL', fornecedor_id: 'f1', familia: 'PVC' },
        { id: 't2', arquivo_nome: 'Ferragens.xlsx', categoria_chave: 'FERRAGENS', fornecedor_id: 'f2', familia: 'PVC' }],
    fornecedores: [{ id: 'f1', nome: 'Wolf' }, { id: 'f2', nome: 'Celsus' }],
    /** A tabela de cores da Wolf (20261112000006): o BRANCO dos perfis. */
    cores: [{ fornecedor_id: 'f1', grupo: 'PERFIS DE PVC', codigo: '1', nome: 'BRANCO' }] as Array<Record<string, unknown>>,
    falhar: false,
    paginas: [] as Array<[string, number, number]>,
}
const TABELA: Record<string, keyof typeof estado> = {
    orcamentista_motor: 'motores', orcamentista_motor_familia: 'familias', orcamentista_motor_regra: 'regras', orcamentista_tabela_item: 'itens', orcamentista_tabela: 'tabelas', orcamentista_fornecedor: 'fornecedores',
    orcamentista_fornecedor_cor: 'cores',
}
jest.mock('@/supabase/admin', () => ({
    supabaseAdmin: {
        from: (nome: string) => {
            const filtros: Array<[string, unknown]> = []
            let faixa: [number, number] | null = null
            const q: Record<string, unknown> = {}
            q.select = () => q
            q.eq = (c: string, v: unknown) => { filtros.push([c, v]); return q }
            q.in = (c: string, vs: unknown[]) => { filtros.push([c, { em: vs }]); return q }
            q.order = () => q
            q.range = (a: number, b: number) => { faixa = [a, b]; estado.paginas.push([nome, a, b]); return q }
            q.then = (ok: (r: unknown) => unknown) => {
                if (estado.falhar) return Promise.resolve({ data: null, error: { message: 'caiu', code: 'XX000' } }).then(ok)
                let linhas = (estado[TABELA[nome]] as Array<Record<string, unknown>>).filter((l) => filtros.every(([c, v]) => (v !== null && typeof v === 'object' && 'em' in v ? (v as { em: unknown[] }).em.includes(l[c]) : l[c] === v)))
                // o PostgREST: sem faixa, no máximo mil
                linhas = faixa ? linhas.slice(faixa[0], faixa[1] + 1) : linhas.slice(0, 1000)
                return Promise.resolve({ data: linhas, error: null }).then(ok)
            }
            return q
        },
    },
}))
jest.mock('@/lib/get-caller-tenant', () => ({
    superAdminOu404: async (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => unknown } }): Promise<{ user_id: string; tenant_id: null; role: string; is_super_admin: boolean } | null> => {
        if (estado.superAdmin) return { user_id: 'u1', tenant_id: null, role: 'super_admin', is_super_admin: true }
        res.status(404).json({ error: 'Not found' })
        return null
    },
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const rota = require('@/pages/api/super-admin/atendimentos-ia/motores/[id]/referencias').default as (req: NextApiRequest, res: NextApiResponse) => Promise<unknown>

async function chamar(metodo = 'GET', id: string = MOTOR) {
    const r = { status: 0, corpo: undefined as unknown }
    const res = { status(n: number) { r.status = n; return res }, json(b: unknown) { r.corpo = b; return res }, setHeader() { return res } }
    await rota({ method: metodo, query: { id } } as unknown as NextApiRequest, res as unknown as NextApiResponse)
    return r as { status: number; corpo: Record<string, unknown> }
}
const regra = (codigo: string, wv: string, descricao: string, tipologias = ['DP-02'], cor: string | null = null) => ({ motor_id: MOTOR, codigo, codigo_wvetro: wv, descricao, cor, tipologias })
const item = (codigo: string, descricao: string, custo: number | null, tabela_id = 't1'): Record<string, unknown> => ({
    codigo, descricao, custo, valor_barra_interno: null, valor_metro_interno: null, cred_icms_pct: 12, cred_pis_cofins_pct: null, cred_ipi_pct: null, nc_ipi_pct: null, ncm: null, tabela_id,
})

beforeEach(() => {
    estado.superAdmin = true
    estado.falhar = false
    estado.paginas = []
    estado.motores = [{ id: MOTOR, nome: 'Motor Wolf', arquivado_em: null, fornecedor_id: 'f1' }]
    estado.regras = [
        regra('9471', 'BR60/WOLFF', 'BR60 - MARCO GIRO - BRANCO'), regra('9471', 'BR60/WOLFF', 'BR60 - MARCO GIRO - BRANCO', ['DP-03']),
        regra('2202', '2202/WOLFF', 'REFORÇO EMENDA 12MM'),
        regra('1326', '1326/WOLFF', 'PONTEIRA DE EIXO OITAVADO 40MM'),
        regra('132114', '132114/WOLFF', 'PASSADOR DE CADARÇO C20 - MARROM'),
        regra('17561', '1756/WOLFF', 'VENEZIANA TROPICAL COM VENTILAÇÃO - BRANCO', ['DP-02'], 'BRANCO'),
        regra('83841', '8384/WOLFF', 'PERSIANA PVC 63MM - BRANCO', ['DP-07'], 'BRANCO'),
    ]
    estado.itens = [
        item('9471', 'BR60 - MARCO GIRO - BRANCO', 10), item('2202', 'REFORÇO EMENDA 12MM', null), item('1326/WOLFF', 'PONTEIRA DE EIXO OITAVADO 40MM', 3),
        item('132114/WOLFF', 'PASSA FITA INFERIOR - MARROM', 1), item('17569', 'MAÇANETA CELSUS MD1', 5),
        // a cremona da Celsus, FORA do escopo (outro fornecedor): o 83841 nunca a vê
        item('83841', 'CREMONA ZAMAK', 4, 't2'),
    ]
})

describe('a rota', () => {
    it('quem não é super admin recebe 404; só GET; o motor é um id; o motor que não existe é 404', async () => {
        estado.superAdmin = false
        expect((await chamar()).status).toBe(404)
        estado.superAdmin = true
        expect((await chamar('POST')).status).toBe(405)
        expect((await chamar('GET', 'nao-e-id')).status).toBe(400)
        expect(await chamar('GET', '00000000-0000-4000-8000-0000000000ff')).toMatchObject({ status: 404, corpo: { error: 'Motor não encontrado.' } })
    })

    it('a falha do banco é 500 com a frase, nunca uma lista vazia', async () => {
        estado.falhar = true
        expect(await chamar()).toMatchObject({ status: 500, corpo: { error: 'Não foi possível conferir as referências do motor.' } })
    })

    it('as quatro listas NOMEADAS, cada código no seu lugar, com o degrau, o peso e o item', async () => {
        const { status, corpo } = await chamar()
        expect(status).toBe(200)
        const codigos = (k: string) => (corpo[k] as Array<{ codigo: string }>).map((r) => r.codigo)
        expect(corpo).toMatchObject({
            motor: { id: MOTOR, nome: 'Motor Wolf', arquivado: false, fornecedor_id: 'f1', fornecedor: 'Wolf', familias: ['PVC'] }, itens_nas_tabelas: 6, itens_no_escopo: 5, codigos: 6, regras: 7,
        })
        expect(codigos('achadas_com_preco').sort()).toEqual(['132114', '1326', '9471'])
        expect(codigos('achadas_sem_preco')).toEqual(['2202'])
        // o 83841 tem o código exato na tabela da Celsus — fora do escopo do motor: não achado; e o 17561 não leva a maçaneta 17569 (nenhum
        // degrau a alcança desde que o "aproximado" saiu)
        expect(codigos('nao_achadas').sort()).toEqual(['17561', '83841'])
        expect(codigos('nao_resolvidas')).toEqual([])
        expect(corpo.tabela_de_cores).toBe('lida')
        expect(codigos('sufixo_com_outra_descricao')).toEqual(['132114'])
        const br60 = (corpo.achadas_com_preco as Array<Record<string, unknown>>).find((r) => r.codigo === '9471')!
        // o `codigo` da regra é a ponte do motor: o primeiro degrau
        expect(br60).toMatchObject({ como: 'ponte', regras: 2, tipologias: 2 })
        expect((br60.itens as Array<Record<string, unknown>>)[0]).toMatchObject({ fornecedor: 'Wolf', categoria: 'PERFIL', tabela_arquivo: 'Perfis.xlsx', credito: { icms: 12, pis_cofins: null } })
    })
})

describe('a leitura pagina de mil em mil', () => {
    it('2.500 regras e 1.200 itens: todos lidos, nenhum corte em mil', async () => {
        estado.regras = Array.from({ length: 2500 }, (_, k) => regra(`C${k}`, `C${k}/WOLFF`, `PECA ${k}`, ['DP-02'], 'BRANCO'))
        estado.itens = Array.from({ length: 1200 }, (_, k) => item(`C${k}`, `PECA ${k}`, 1))
        const { corpo } = await chamar()
        expect(corpo).toMatchObject({ codigos: 2500, regras: 2500, itens_nas_tabelas: 1200 })
        expect((corpo.achadas_com_preco as unknown[]).length).toBe(1200)
        expect((corpo.nao_achadas as unknown[]).length).toBe(1300)
        expect(estado.paginas.filter(([n]) => n === 'orcamentista_tabela_item').length).toBe(2)
        expect(estado.paginas.filter(([n]) => n === 'orcamentista_motor_regra').map(([, a]) => a)).toEqual([0, 1000, 2000])
        expect(estado.paginas.filter(([n]) => n === 'orcamentista_tabela_item').map(([, a]) => a)).toEqual([0, 1000])
    })
})
