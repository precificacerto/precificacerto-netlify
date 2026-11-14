/**
 * @jest-environment node
 *
 * PORTÃO — A BUSCA DE PREÇO DO INSUMO DESCE A ORDEM DOS FORNECEDORES (dono do produto, 14/11/2026, tarefa 0010: "pesquisar na tabela principal;
 * se não, vai para a segunda; se não, vai para a terceira"). Antes, a resolução olhava SÓ o principal da categoria e, não achando, gravava falta
 * nomeada — mesmo com o item, com preço, na tabela do segundo fornecedor.
 *
 * MEDIDO em produção (14/11/2026, só leitura), a De Paula: FERRAGENS = Celsus (1, principal), De Toni (2), Diversos (3); VEDACAO = Wolf (1,
 * principal), Celsus (2), Diversos (3). O principal é sempre a ordem 1. Nenhum código está em dois fornecedores da mesma categoria (nem sem o
 * sufixo). Os casos abaixo usam os códigos, as descrições e os preços reais: o 12183 (CALÇO, Celsus, VEDACAO, ordem 2), o 21495 (CREMONA, Diversos,
 * FERRAGENS, ordem 3) e o SIL-DOWCOR (SILICONE, Diversos, VEDACAO, ordem 3) eram falta nomeada no orçamento 3 e passam a ser achados.
 */
const banco = { db: {} as Record<string, Array<Record<string, unknown>>> }
jest.mock('@/supabase/admin', () => ({
    supabaseAdmin: {
        from: (tabela: string) => {
            const filtros: Array<[string, unknown]> = []
            const q: Record<string, unknown> = {}
            q.select = () => q
            q.eq = (c: string, v: unknown) => { filtros.push([c, v]); return q }
            q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: (banco.db[tabela] ?? []).filter((l) => filtros.every(([c, v]) => l[c] === v)), error: null }).then(ok)
            return q
        },
    },
}))
// o cálculo do levantamento é substituído por um resultado fixo (o caminho dele tem portão próprio): só o caso (4), de ponta a ponta, o usa
const calculo = { valor: null as unknown }
jest.mock('@/lib/atendimentos-ia/levantamento-da-conversa', () => ({
    calcularOLevantamento: async (): Promise<unknown> => calculo.valor,
    mensagemDoCalculo: () => ({ texto: '', desfecho: 'levantou' }),
}))
/* eslint-disable @typescript-eslint/no-require-imports */
const S = () => require('@/lib/atendimentos-ia/custo-do-orcamento-servidor') as typeof import('@/lib/atendimentos-ia/custo-do-orcamento-servidor')
const TC = () => require('@/lib/atendimentos-ia/tabelas-da-conta') as typeof import('@/lib/atendimentos-ia/tabelas-da-conta')
const R = () => require('@/lib/atendimentos-ia/resolucao-de-referencia') as typeof import('@/lib/atendimentos-ia/resolucao-de-referencia')
/* eslint-enable @typescript-eslint/no-require-imports */

const T = 'tenant-de-paula'
const N = null as number | null
const item = (codigo: string, descricao: string, custo: number, fornecedor_id: string, categoria: string | null) =>
    ({ codigo, descricao, custo, medida_barra_m: N, valor_barra_interno: N, valor_metro_interno: N, tabela_id: `t-${fornecedor_id}-${categoria}`, fornecedor_id, categoria })
// a tabela de cores do fornecedor do motor (a Wolf tem 19 linhas em produção): sem ela, o resolvedor responde SEM_TABELA_DE_CORES, não NAO_ACHADA
const CTX = { cores: [{ grupo: 'ACESSORIOS', codigo: '1', nome: 'BRANCO' }], grupoDeCor: 'ACESSORIOS' }
const ref = (codigoDoMotor: string, descricaoDoMotor: string | null) => ({ codigoDoMotor, codigoDaPonte: null as string | null, descricaoDoMotor, corPedida: 'Branco' })

// os itens reais (código, descrição e custo como estão no banco em 14/11/2026), mais o 9691 de PERFIL e o VIN04 de VIDRO, que nunca entram
const TODOS = [
    item('9691', 'PERFIL MARCO', 10, 'wolf', 'PERFIL'),
    item('10158', 'ROLDANA ZAMAK 04 H33 1R _40 R2,75 ZZ BR', 19.06, 'celsus', 'FERRAGENS'),
    item('10457', 'ROLDANA DUPLA', 2.5, 'detoni', 'FERRAGENS'),
    item('21495', 'CREMONA DE CORRER | E15 | 1600MM | INOX 304', 212.78, 'diversos', 'FERRAGENS'),
    item('1326/WOLFF', 'ESCOVA DE VEDAÇÃO', 1.1, 'wolf', 'VEDACAO'),
    item('12183', 'CALÇO POM CINZA 4 X 14 X 45,8MM PVC 04 ANG. 45O', 0.75, 'celsus', 'VEDACAO'),
    item('SIL-DOWCOR', 'SILICONE DOW CORNING', 27.9, 'diversos', 'VEDACAO'),
    item('VIN04', 'VIDRO COMUM INCOLOR 04MM', 74.96, 'estrela', 'VIDRO'),
]

beforeEach(() => {
    banco.db = {
        orcamentista_mp_categoria: [
            { id: 'c-fer', tenant_id: T, categoria_chave: 'FERRAGENS' }, { id: 'c-ved', tenant_id: T, categoria_chave: 'VEDACAO' },
            { id: 'c-vid', tenant_id: T, categoria_chave: 'VIDRO' }, { id: 'c-per', tenant_id: T, categoria_chave: 'PERFIL' },
            { id: 'c-out', tenant_id: 'outra', categoria_chave: 'FERRAGENS' },
        ],
        // a ordem do cadastro de produção, com a ordem fora de ordem nas linhas (é a coluna que decide, não a posição)
        orcamentista_mp_categoria_fornecedor: [
            { tenant_id: T, mp_categoria_id: 'c-fer', fornecedor_id: 'diversos', principal: false, ordem: 3 },
            { tenant_id: T, mp_categoria_id: 'c-fer', fornecedor_id: 'celsus', principal: true, ordem: 1 },
            { tenant_id: T, mp_categoria_id: 'c-fer', fornecedor_id: 'detoni', principal: false, ordem: 2 },
            { tenant_id: T, mp_categoria_id: 'c-ved', fornecedor_id: 'wolf', principal: true, ordem: 1 },
            { tenant_id: T, mp_categoria_id: 'c-ved', fornecedor_id: 'diversos', principal: false, ordem: 3 },
            { tenant_id: T, mp_categoria_id: 'c-ved', fornecedor_id: 'celsus', principal: false, ordem: 2 },
            { tenant_id: T, mp_categoria_id: 'c-vid', fornecedor_id: 'estrela', principal: true, ordem: 1 },
            { tenant_id: T, mp_categoria_id: 'c-per', fornecedor_id: 'wolf', principal: true, ordem: 1 },
            // outra conta: não entra
            { tenant_id: 'outra', mp_categoria_id: 'c-out', fornecedor_id: 'zeta', principal: false, ordem: 2 },
        ],
    }
})

describe('(1) os seguintes de cada categoria, pela ORDEM do cadastro', () => {
    it('os não principais, do menor para o maior, sem o principal e só desta conta', async () => {
        const p = await TC().principaisDaConta(T)
        expect(Object.fromEntries(p.principais)).toEqual({ FERRAGENS: 'celsus', VEDACAO: 'wolf', VIDRO: 'estrela', PERFIL: 'wolf' })
        expect(Object.fromEntries(p.seguintes)).toEqual({ FERRAGENS: [['detoni'], ['diversos']], VEDACAO: [['celsus'], ['diversos']] })
    })
    it('dois com a MESMA ordem ficam no mesmo degrau (nenhum é escolhido sobre o outro)', async () => {
        banco.db.orcamentista_mp_categoria_fornecedor.push({ tenant_id: T, mp_categoria_id: 'c-fer', fornecedor_id: 'beta', principal: false, ordem: 2 })
        const p = await TC().principaisDaConta(T)
        expect(p.seguintes.get('FERRAGENS')).toEqual([['beta', 'detoni'], ['diversos']])
    })
    it('a ordem nula vai para o fim, sem inventar posição', async () => {
        banco.db.orcamentista_mp_categoria_fornecedor.push({ tenant_id: T, mp_categoria_id: 'c-fer', fornecedor_id: 'semordem', principal: false, ordem: null })
        const p = await TC().principaisDaConta(T)
        expect(p.seguintes.get('FERRAGENS')).toEqual([['detoni'], ['diversos'], ['semordem']])
    })
    it('o mesmo fornecedor em duas matérias-primas vale pela MENOR ordem; o principal que aparece como não principal noutra não entra', async () => {
        banco.db.orcamentista_mp_categoria.push({ id: 'c-fer2', tenant_id: T, categoria_chave: 'FERRAGENS' })
        banco.db.orcamentista_mp_categoria_fornecedor.push(
            { tenant_id: T, mp_categoria_id: 'c-fer2', fornecedor_id: 'diversos', principal: false, ordem: 1 },
            { tenant_id: T, mp_categoria_id: 'c-fer2', fornecedor_id: 'celsus', principal: false, ordem: 5 },
        )
        const p = await TC().principaisDaConta(T)
        expect(p.seguintes.get('FERRAGENS')).toEqual([['diversos'], ['detoni']])
    })
    it('a categoria AMBÍGUA (dois principais) não tem seguintes: sem principal, não há por onde começar', async () => {
        banco.db.orcamentista_mp_categoria.push({ id: 'c-fer2', tenant_id: T, categoria_chave: 'FERRAGENS' })
        banco.db.orcamentista_mp_categoria_fornecedor.push({ tenant_id: T, mp_categoria_id: 'c-fer2', fornecedor_id: 'detoni', principal: true, ordem: 1 })
        const p = await TC().principaisDaConta(T)
        expect(p.ambiguas).toEqual(['FERRAGENS'])
        expect(p.seguintes.has('FERRAGENS')).toBe(false)
    })
})

describe('(2) os degraus da descida', () => {
    it('degrau 1 = os principais; degrau 2 = a segunda ordem de cada categoria; degrau 3 = a terceira — PERFIL e VIDRO nunca', async () => {
        const p = await TC().principaisDaConta(T)
        expect(S().niveisDoInsumo(TODOS, p).map((n) => n.map((i) => i.codigo))).toEqual([
            ['10158', '1326/WOLFF'],
            ['10457', '12183'],
            ['21495', 'SIL-DOWCOR'],
        ])
    })
    it('PERFIL e VIDRO não descem, nem com um segundo fornecedor cadastrado neles', async () => {
        banco.db.orcamentista_mp_categoria_fornecedor.push(
            { tenant_id: T, mp_categoria_id: 'c-vid', fornecedor_id: 'vidraria2', principal: false, ordem: 2 },
            { tenant_id: T, mp_categoria_id: 'c-per', fornecedor_id: 'perfil2', principal: false, ordem: 2 },
        )
        const p = await TC().principaisDaConta(T)
        const todos = [...TODOS, item('VX', 'VIDRO FUME', 9, 'vidraria2', 'VIDRO'), item('PX', 'PERFIL X', 9, 'perfil2', 'PERFIL')]
        expect(S().niveisDoInsumo(todos, p).flat().map((i) => i.codigo)).not.toEqual(expect.arrayContaining(['VX']))
        expect(S().niveisDoInsumo(todos, p).flat().map((i) => i.codigo)).not.toEqual(expect.arrayContaining(['PX']))
        expect(S().niveisDoInsumo(todos, p).flat().map((i) => i.codigo)).toEqual(['10158', '1326/WOLFF', '10457', '12183', '21495', 'SIL-DOWCOR'])
    })
    it('o degrau 1 é o escopo de antes, sem mudança', async () => {
        const p = await TC().principaisDaConta(T)
        expect(S().niveisDoInsumo(TODOS, p)[0]).toEqual(S().escopoDoInsumo(TODOS, p))
    })
})

describe('(3) a resolução que desce', () => {
    const niveis = async () => S().niveisDoInsumo(TODOS, await TC().principaisDaConta(T))

    it('o que está no PRINCIPAL é achado nele (nada muda para o que já resolvia)', async () => {
        const r = S().resolverDescendo(ref('10158', 'ROLDANA ZAMAK 04 H33 1R _40 R2,75 ZZ BR'), await niveis(), CTX)
        expect('item' in r && [r.item.codigo, r.item.fornecedor_id, r.item.custo]).toEqual(['10158', 'celsus', 19.06])
    })
    it('o que só está no SEGUNDO é achado, com o preço dele — o 12183 do orçamento 3 (Celsus, VEDACAO, ordem 2)', async () => {
        const r = S().resolverDescendo(ref('12183', 'CALÇO POM CINZA 4 X 14 X 45,8MM PVC 04 ANG. 45O'), await niveis(), CTX)
        expect('item' in r && [r.item.codigo, r.item.fornecedor_id, r.item.custo, r.como]).toEqual(['12183', 'celsus', 0.75, 'exato'])
    })
    it('o que só está no TERCEIRO é achado — o 21495 e o SIL-DOWCOR do orçamento 3 (Diversos)', async () => {
        const a = S().resolverDescendo(ref('21495', 'CREMONA DE CORRER | E15 | 1600MM | INOX 304'), await niveis(), CTX)
        expect('item' in a && [a.item.fornecedor_id, a.item.custo]).toEqual(['diversos', 212.78])
        const b = S().resolverDescendo(ref('SIL-DOWCOR', 'SILICONE DOW CORNING'), await niveis(), CTX)
        expect('item' in b && [b.item.fornecedor_id, b.item.categoria, b.item.custo]).toEqual(['diversos', 'VEDACAO', 27.9])
    })
    it('o contraste: só no escopo do principal (como era), o 12183 e o 21495 são falta NAO_ACHADA', async () => {
        const p = await TC().principaisDaConta(T)
        for (const [c, d] of [['12183', 'CALÇO POM CINZA'], ['21495', 'CREMONA DE CORRER']]) {
            const r = R().resolverReferencia(ref(c, d), S().escopoDoInsumo(TODOS, p), CTX)
            expect('motivo' in r && r.motivo).toBe('NAO_ACHADA')
        }
    })
    it('o que não está em NENHUM é falta nomeada, e a frase diz em quantos fornecedores procurou (4: Celsus, Wolf, De Toni, Diversos)', async () => {
        const r = S().resolverDescendo(ref('99999', 'PECA INEXISTENTE'), await niveis(), CTX)
        expect('motivo' in r && r.motivo).toBe('NAO_ACHADA')
        // os fornecedores distintos dos degraus: celsus e wolf (1), detoni e celsus (2), diversos (3) → celsus, wolf, detoni, diversos = 4
        expect('frase' in r && r.frase).toContain('procurado em 4 fornecedores, na ordem cadastrada')
        expect('frase' in r && r.frase).toContain('99999')
    })
    it('a frase no singular, e sem fornecedor nenhum', async () => {
        const um = S().resolverDescendo(ref('99999', 'PECA'), [[item('1', 'X', 1, 'so', 'FERRAGENS')]], CTX)
        expect('frase' in um && um.frase).toContain('procurado em 1 fornecedor, na ordem cadastrada')
        const zero = S().resolverDescendo(ref('99999', 'PECA'), [[], []], CTX)
        expect('motivo' in zero && zero.motivo).toBe('NAO_ACHADA')
        expect('frase' in zero && zero.frase).toContain('nenhum fornecedor das categorias do insumo tem tabela com itens')
    })
    it('ENTRE fornecedores, vence o de MENOR ordem: o mesmo código no segundo e no terceiro sai do segundo', async () => {
        const n = [[item('1', 'A', 1, 'p', 'FERRAGENS')], [item('777', 'ROLDANA DUPLA', 5, 'segundo', 'FERRAGENS')], [item('777', 'ROLDANA DUPLA', 3, 'terceiro', 'FERRAGENS')]]
        const r = S().resolverDescendo(ref('777', 'ROLDANA DUPLA'), n, CTX)
        expect('item' in r && [r.item.fornecedor_id, r.item.custo]).toEqual(['segundo', 5])
    })
    it('o principal vence o segundo, mesmo com o segundo mais barato (a ordem é a do cadastro, nunca o preço)', async () => {
        const n = [[item('777', 'ROLDANA DUPLA', 9, 'principal', 'FERRAGENS')], [item('777', 'ROLDANA DUPLA', 1, 'segundo', 'FERRAGENS')]]
        const r = S().resolverDescendo(ref('777', 'ROLDANA DUPLA'), n, CTX)
        expect('item' in r && r.item.fornecedor_id).toBe('principal')
    })
    it('DOIS candidatos DENTRO do mesmo fornecedor continuam falta AMBIGUA — e a descida PARA ali, mesmo havendo um só no degrau de baixo', async () => {
        const n = [
            [item('777', 'ROLDANA DUPLA', 9, 'p', 'FERRAGENS'), item('777/WOLFF', 'ROLDANA DUPLA', 8, 'p', 'FERRAGENS')],
            [item('777', 'ROLDANA DUPLA', 1, 'segundo', 'FERRAGENS')],
        ]
        const r = S().resolverDescendo(ref('777', 'ROLDANA DUPLA'), n, CTX)
        expect('motivo' in r && r.motivo).toBe('AMBIGUA')
        expect('frase' in r && r.frase).toContain('procurado em 1 fornecedor')
    })
    it('o GUARDA da descrição vale em cada fornecedor: o segundo tem o código com outra peça, o terceiro tem a peça — sai o terceiro', async () => {
        const n = [[], [item('777', 'MAÇANETA CELSUS', 1, 'segundo', 'FERRAGENS')], [item('777', 'ROLDANA DUPLA', 4, 'terceiro', 'FERRAGENS')]]
        const r = S().resolverDescendo(ref('777', 'ROLDANA DUPLA'), n, CTX)
        expect('item' in r && r.item.fornecedor_id).toBe('terceiro')
    })
    it('sem achar em nenhum, a falta é a que EXPLICA (o guarda recusou no segundo), não a NAO_ACHADA do principal', async () => {
        const n = [[item('1', 'A', 1, 'p', 'FERRAGENS')], [item('777', 'MAÇANETA CELSUS', 1, 'segundo', 'FERRAGENS')]]
        const r = S().resolverDescendo(ref('777', 'ROLDANA DUPLA'), n, CTX)
        expect('motivo' in r && r.motivo).toBe('DESCRICAO_NAO_CONCORDA')
        expect('frase' in r && r.frase).toContain('MAÇANETA CELSUS')
        expect('frase' in r && r.frase).toContain('procurado em 2 fornecedores')
    })
})

describe('(4) de ponta a ponta: o custo do orçamento leva o insumo do TERCEIRO fornecedor, com o preço dele', () => {
    const BLOCO = { unidade: 'PC', cred_icms_pct: 12, cred_pis_cofins_pct: 9.25, cred_ipi_pct: 0, nc_ipi_pct: N, cred_ibs_pct: N, cred_cbs_pct: N }
    beforeEach(() => {
        calculo.valor = {
            lev: { nome: 'Luiz Castro', itens: [{ vidro: null, vidro_codigo: N }] },
            grupos: [{ familia: { rotulo: 'PVC' }, indices: [0] }],
            calculos: [{
                d: { cor: 'Branco', esquadrias: [{ numero: 1, tipologia: 'DP-07' }] },
                r: {
                    esquadrias: [{ tipologia: 'DP-07', quantidade: 2, pecas: [], vidros: [], faltasDoAvaliador: [],
                        insumos: [
                            { codigo: '21495', descricao: 'CREMONA DE CORRER | E15 | 1600MM | INOX 304', quantidade: 1 },
                            { codigo: '99999', descricao: 'PECA INEXISTENTE', quantidade: 1 },
                        ] }],
                    total: { barras_por_codigo: {} }, faltas: [], resolucoes: {},
                },
                maos: [{ ok: true, custoMensal: 1000, minutosDaEmpresa: 1000, minutosPorUnidade: 10, quantidade: 2 }],
                daFamilia: { todos: TODOS.map((i) => ({ ...i, ...BLOCO })), noEscopoDoMotor: [], fornecedorDoMotor: 'wolf' },
                cores: CTX.cores,
            }],
        }
    })
    it('o 21495 (Diversos, ordem 3) entra no custo com 212,78 × 2; o 99999 é falta que diz em quantos fornecedores procurou', async () => {
        const r = await S().custoDoLevantamento(T, { ok: true } as never, (calculo.valor as { lev: never }).lev)
        if ('recusas' in r) throw new Error(r.recusas.join(' | '))
        const l = r.itens[0].materiais.find((m) => m.caminho === 'insumo' && m.codigo === '21495')!
        expect([l.consumo_item, l.custo_bruto_material]).toEqual([2, 212.78 * 2])
        expect(r.faltas.filter((f) => f.codigo_do_motor === '21495')).toEqual([])
        const f = r.faltas.find((x) => x.codigo_do_motor === '99999' && x.motivo === 'NAO_ACHADA')!
        expect(f.frase).toContain('procurado em 4 fornecedores, na ordem cadastrada')
    })
})

export {}
