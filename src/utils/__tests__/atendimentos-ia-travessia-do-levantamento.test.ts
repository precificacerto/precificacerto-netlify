/**
 * @jest-environment node
 *
 * PORTÃO — a TRAVESSIA do levantamento para o orçamento I.A. (dono do produto, 10/11/2026) e o AVISO da tabela congelada.
 * O banco é FALSO e em memória, aplica `eq`/`in`, ordena, projeta o select, reproduz o índice `orcamentista_orcamento_um_por_levantamento`
 * e REGISTRA cada operação — os portões afirmam pelo que foi EMITIDO.
 *
 *   (1) o plano: o que é congelado, o aproveitamento, os itens, e VAZIO NÃO É ZERO (a falta nomeada, nunca o 0 nem o tenant);
 *   (2) as recusas: só o COMPLETO, com esquadria e quantidade; nada é gravado;
 *   (3) a escrita: o orçamento do agente e os itens, SÓ nessas duas tabelas; o levantamento não é tocado;
 *   (4) idempotente: o segundo atravessar recusa nomeando o orçamento; o que existe sem itens recebe os itens (retomada); a corrida no índice;
 *   (5) isolamento: o levantamento de outra empresa é "não encontrado", e nada é lido nem gravado nela;
 *   (6) o cliente e o vendedor LIDOS do levantamento; as faltas lidas das colunas do orçamento;
 *   (7) o gatilho do "sim" nunca lança;
 *   (8) o aviso da tabela congelada: só quando diverge, com as duas tabelas e a diferença pela MESMA cascata; o código ausente é nomeado.
 */
type Linha = Record<string, unknown>
interface Operacao { tabela: string; op: string; carga?: unknown; filtros: [string, string, unknown][] }

const T = 'tenant-de-paula'
const OUTRO = 'tenant-de-outra'
const LEV = '9fb963ac-f9a3-469b-8af7-4668f6a0cb2f'
const LEV_OUTRO = '10000000-0000-4000-8000-000000000099'

const estado = { db: {} as Record<string, Linha[]>, ops: [] as Operacao[], erros: {} as Record<string, Array<{ code: string; message: string }>>,
    /** roda no instante do INSERT no orçamento: o outro chamador que gravou entre a leitura e o INSERT deste */
    antesDoInsert: null as null | (() => void) }
let seq = 0
function executar(tabela: string, op: string, carga: unknown, filtros: [string, string, unknown][], colunas: string | null, ordem: [string, boolean] | null, limite: number | null) {
    estado.ops.push({ tabela, op, carga, filtros })
    const erro = estado.erros[tabela]?.shift()
    if (erro) return { data: null as unknown, error: erro }
    const linhas = (estado.db[tabela] ??= [])
    const casa = (l: Linha) => filtros.every(([tipo, c, v]) => (tipo === 'in' ? (v as unknown[]).includes(l[c]) : l[c] === v))
    const projetar = (l: Linha) => (colunas === null || colunas === '*' ? { ...l } : Object.fromEntries(colunas.split(',').map((c) => c.trim()).map((c) => [c, l[c]])))
    if (op === 'select') {
        let r = linhas.filter(casa)
        if (ordem) r = [...r].sort((a, b) => ((a[ordem[0]] as number) - (b[ordem[0]] as number)) * (ordem[1] ? 1 : -1))
        if (limite !== null) r = r.slice(0, limite)
        return { data: r.map(projetar), error: null }
    }
    if (op === 'update') { linhas.filter(casa).forEach((l) => Object.assign(l, carga as Linha)); return { data: null, error: null } }
    if (op === 'delete') { estado.db[tabela] = linhas.filter((l) => !casa(l)); return { data: null, error: null } }
    if (op === 'insert' && tabela === 'orcamentista_orcamento' && estado.antesDoInsert) { const f = estado.antesDoInsert; estado.antesDoInsert = null; f() }
    const novas = ((Array.isArray(carga) ? carga : [carga]) as Linha[]).map((l): Linha => ({ id: `novo-${++seq}`, ...l }))
    // o índice parcial do banco: um orçamento por levantamento
    if (tabela === 'orcamentista_orcamento' && novas.some((n) => n.levantamento_id && linhas.some((l) => l.levantamento_id === n.levantamento_id))) {
        return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "orcamentista_orcamento_um_por_levantamento"' } }
    }
    linhas.push(...novas)
    return { data: novas.map(projetar), error: null }
}
function cliente() {
    return {
        from: (tabela: string) => {
            const filtros: [string, string, unknown][] = []
            let op = 'select'
            let carga: unknown
            let colunas: string | null = null
            let ordem: [string, boolean] | null = null
            let limite: number | null = null
            const q: Record<string, unknown> = {}
            const rodar = () => Promise.resolve(executar(tabela, op, carga, filtros, colunas, ordem, limite))
            q.select = (c?: string) => { colunas = c ?? '*'; return q }
            q.order = (c: string, o?: { ascending?: boolean }) => { ordem = [c, o?.ascending !== false]; return q }
            q.limit = (n: number) => { limite = n; return q }
            q.eq = (c: string, v: unknown) => { filtros.push(['eq', c, v]); return q }
            q.in = (c: string, v: unknown[]) => { filtros.push(['in', c, v]); return q }
            q.update = (c: unknown) => { op = 'update'; carga = c; return q }
            q.delete = () => { op = 'delete'; return q }
            q.insert = (c: unknown) => { op = 'insert'; carga = c; return q }
            q.maybeSingle = () => rodar().then((r) => ({ data: (r.data as Linha[] | null)?.[0] ?? null, error: r.error }))
            q.single = q.maybeSingle
            q.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => rodar().then(ok, ko)
            return q
        },
    }
}
jest.mock('@/supabase/admin', () => ({ supabaseAdmin: cliente() }))

import {
    atravessarLevantamento, atravessarNoSim, aproveitamentoDaTravessia, ErroDaTravessia, ErroJaAtravessado, faltasDoCongelado, faltasDoOrcamento,
    fraseJaAtravessado, fraseNaoCompleto, fraseSemItens, fraseSemQuantidade, lerClienteDoLevantamento, levantamentosParaAtravessar, planoDaTravessia,
    FALTA_DA_COMISSAO, FALTA_DA_RESERVA_TECNICA, FALTA_DO_LUCRO, FALTA_DO_MODO_DA_COMISSAO, FALTA_DO_RESPONSAVEL_DA_RT,
    type ItemDoLevantamentoNaTravessia, type LevantamentoNaTravessia,
} from '@/lib/atendimentos-ia/travessia-do-levantamento'
import { ErroNaoEncontrado, LIMITE_DO_NOME as LIMITE_DO_NOME_DO_ORCAMENTO } from '@/lib/atendimentos-ia/orcamentos-ia'
import { LIMITE_DO_NOME, fraseDoNome } from '@/lib/atendimentos-ia/travessia-do-levantamento'
import { MOTIVO_DO_FALLBACK } from '@/lib/atendimentos-ia/custo-do-orcamento'
import { avisosDeDivergencia, custoNaTabelaCongelada, type LinhaDaTabelaCongelada } from '@/lib/atendimentos-ia/divergencia-da-tabela'
import type { LinhaDeMaterial } from '@/lib/atendimentos-ia/custo-do-orcamento'

/** O Geraldo Huck como está em produção (lido em 10/11/2026): COMPLETO, 5 / 1 / 10, RT sem responsável, 3 itens sem ambientes nem escolhas. */
const GERALDO: LevantamentoNaTravessia = {
    id: LEV, tenant_id: T, numero: 11, nome: 'Geraldo Huck', estado: 'COMPLETO',
    comissao_percentual: 5, comissao_modo: 'PROPORCIONAL', reserva_tecnica_percentual: 1, reserva_tecnica_responsavel: null, lucro_projetado_percentual: 10,
}
const ITENS: ItemDoLevantamentoNaTravessia[] = [
    { id: 'li-3', ordem: 3, tipologia: 'DP-02', largura_mm: 1600, altura_mm: 1200, quantidade: 2, cor_perfil: 'Branco', vidro: 'incolor 4 mm comum', ambientes: null, escolhas: null },
    { id: 'li-1', ordem: 1, tipologia: 'DP-39', largura_mm: 2500, altura_mm: 2200, quantidade: 1, cor_perfil: 'Branco', vidro: 'comum 6 mm incolor', ambientes: null, escolhas: null },
    { id: 'li-2', ordem: 2, tipologia: 'DP-01', largura_mm: 600, altura_mm: 600, quantidade: 1, cor_perfil: 'Branco', vidro: 'mini boreal', ambientes: [{ ambiente: 'Sala', quantidade: 1 }], escolhas: { N: 2 } },
]

function semear(lev: Partial<LevantamentoNaTravessia> = {}, itens = ITENS) {
    const l = { ...GERALDO, ...lev }
    estado.db.orcamentista_levantamento = [{ ...l, telefone: '51 99999-0000', email: null, endereco: 'Rua A, 10', edificacao: '', obs_obra: null, data_entrega: '2026-12-01', vendedor_nome: 'Paulo', vendedor_employee_id: 'emp-1' },
        { ...GERALDO, id: LEV_OUTRO, tenant_id: OUTRO, numero: 3, nome: 'Da outra empresa' }]
    estado.db.orcamentista_levantamento_item = [...itens.map((i) => ({ ...i, tenant_id: l.tenant_id, levantamento_id: l.id })),
        { id: 'li-outra', ordem: 1, tenant_id: OUTRO, levantamento_id: LEV_OUTRO, tipologia: 'DP-02', largura_mm: 1, altura_mm: 1, quantidade: 1, cor_perfil: null, vidro: null, ambientes: null, escolhas: null }]
}
beforeEach(() => { estado.db = {}; estado.ops = []; estado.erros = {}; estado.antesDoInsert = null; seq = 0; semear() })
const escritas = () => estado.ops.filter((o) => o.op !== 'select')

describe('(1) o plano', () => {
    it('congela o que muda preço, com o nome, a origem e o levantamento; o criado_por é nulo (o do agente não tem autor)', () => {
        const p = planoDaTravessia(GERALDO, ITENS, null)
        if (!('orcamento' in p)) throw new Error('recusou')
        expect(p.orcamento).toEqual({
            tenant_id: T, origem: 'agente', levantamento_id: LEV, nome: 'Geraldo Huck', obs: null, criado_por: null,
            comissao_percentual: 5, comissao_modo: 'PROPORCIONAL', reserva_tecnica_percentual: 1, reserva_tecnica_responsavel: null, lucro_projetado_percentual: 10,
            aproveitamento_modo: 'SEM', aproveitamento_origem: 'fallback_barra_inteira', aproveitamento_motivo: MOTIVO_DO_FALLBACK, aproveitamento_por: null,
        })
    })
    it('NÃO forma preço: o plano não traz valor de venda, operação interna nem totais', () => {
        const p = planoDaTravessia(GERALDO, ITENS, null)
        if (!('orcamento' in p)) throw new Error('recusou')
        for (const c of ['valor_venda', 'valor_operacao_interna', 'valor_total_bruto', 'valor_total_liquido']) expect(Object.keys(p.orcamento)).not.toContain(c)
    })
    it('um item por item do levantamento, NA ORDEM, com o levantamento_item_id e os campos copiados (ambientes e escolhas como estão)', () => {
        const p = planoDaTravessia(GERALDO, ITENS, null)
        if (!('itens' in p)) throw new Error('recusou')
        expect(p.itens.map((i) => [i.ordem, i.levantamento_item_id, i.tipologia])).toEqual([[1, 'li-1', 'DP-39'], [2, 'li-2', 'DP-01'], [3, 'li-3', 'DP-02']])
        expect(p.itens[2]).toEqual({ ordem: 3, levantamento_item_id: 'li-3', tipologia: 'DP-02', largura_mm: 1600, altura_mm: 1200, quantidade: 2, cor_perfil: 'Branco', vidro: 'incolor 4 mm comum', ambientes: null, escolhas: null })
        expect(p.itens[1].ambientes).toEqual([{ ambiente: 'Sala', quantidade: 1 }])
        expect(p.itens[1].escolhas).toEqual({ N: 2 })
    })
    it('o Geraldo Huck: a única falta é o responsável pela reserva técnica (há RT de 1%, sem responsável)', () => {
        const p = planoDaTravessia(GERALDO, ITENS, null)
        if (!('faltas' in p)) throw new Error('recusou')
        expect(p.faltas).toEqual([FALTA_DO_RESPONSAVEL_DA_RT])
    })
    it('VAZIO NÃO É ZERO: os percentuais nulos nascem NULOS, e cada falta é nomeada', () => {
        const p = planoDaTravessia({ ...GERALDO, comissao_percentual: null, comissao_modo: null, reserva_tecnica_percentual: null, lucro_projetado_percentual: null }, ITENS, null)
        if (!('orcamento' in p)) throw new Error('recusou')
        expect([p.orcamento.comissao_percentual, p.orcamento.comissao_modo, p.orcamento.reserva_tecnica_percentual, p.orcamento.lucro_projetado_percentual]).toEqual([null, null, null, null])
        expect(p.faltas).toEqual([FALTA_DA_COMISSAO, FALTA_DO_MODO_DA_COMISSAO, FALTA_DA_RESERVA_TECNICA, FALTA_DO_LUCRO])
    })
    it('o ZERO dito é zero, e não é falta; RT zero não pede responsável', () => {
        const p = planoDaTravessia({ ...GERALDO, comissao_percentual: 0, reserva_tecnica_percentual: 0, lucro_projetado_percentual: 0 }, ITENS, null)
        if (!('orcamento' in p)) throw new Error('recusou')
        expect([p.orcamento.comissao_percentual, p.orcamento.reserva_tecnica_percentual, p.orcamento.lucro_projetado_percentual]).toEqual([0, 0, 0])
        expect(p.faltas).toEqual([])
    })
    it('o numeric do banco chega como texto e vira número; o texto vazio é nulo', () => {
        const p = planoDaTravessia({ ...GERALDO, comissao_percentual: '5' as unknown as number, comissao_modo: '  ' }, ITENS, null)
        if (!('orcamento' in p)) throw new Error('recusou')
        expect(p.orcamento.comissao_percentual).toBe(5)
        expect(p.orcamento.comissao_modo).toBeNull()
    })
    it('o aproveitamento: o que a base der vale, com origem base_de_conhecimento e sem motivo nem autor; sem resposta, o fallback SEM', () => {
        expect(aproveitamentoDaTravessia('COM')).toEqual({ aproveitamento_modo: 'COM', aproveitamento_origem: 'base_de_conhecimento', aproveitamento_motivo: null, aproveitamento_por: null })
        expect(aproveitamentoDaTravessia(null)).toEqual({ aproveitamento_modo: 'SEM', aproveitamento_origem: 'fallback_barra_inteira', aproveitamento_motivo: MOTIVO_DO_FALLBACK, aproveitamento_por: null })
    })
})

describe('(2) as recusas, e nada é gravado', () => {
    it('o nome acima do limite da CHECK do orçamento recusa; o limite é o MESMO de orcamentos-ia', () => {
        expect(LIMITE_DO_NOME).toBe(LIMITE_DO_NOME_DO_ORCAMENTO)
        expect(planoDaTravessia({ ...GERALDO, nome: 'x'.repeat(LIMITE_DO_NOME + 1) }, ITENS, null)).toEqual({ ok: false, recusas: [fraseDoNome(11)] })
        expect('orcamento' in planoDaTravessia({ ...GERALDO, nome: 'x'.repeat(LIMITE_DO_NOME) }, ITENS, null)).toBe(true)
    })
    it('só o COMPLETO atravessa', () => {
        expect(planoDaTravessia({ ...GERALDO, estado: 'EM_MONTAGEM' }, ITENS, null)).toEqual({ ok: false, recusas: [fraseNaoCompleto(11, 'EM_MONTAGEM')] })
    })
    it('sem esquadria, recusa', () => {
        expect(planoDaTravessia(GERALDO, [], null)).toEqual({ ok: false, recusas: [fraseSemItens(11)] })
    })
    it('a quantidade nula não vira 1, e a zero também recusa', () => {
        const r = planoDaTravessia(GERALDO, [{ ...ITENS[1], quantidade: null }, { ...ITENS[0], quantidade: 0 }], null)
        expect(r).toEqual({ ok: false, recusas: [fraseSemQuantidade(1), fraseSemQuantidade(3)] })
    })
    it('pela rota do código: a recusa lança ErroDaTravessia e nada é gravado', async () => {
        semear({ estado: 'EM_MONTAGEM' })
        await expect(atravessarLevantamento(T, LEV)).rejects.toBeInstanceOf(ErroDaTravessia)
        expect(escritas()).toEqual([])
    })
})

describe('(3) a escrita', () => {
    it('o orçamento do agente e os 3 itens; só nessas duas tabelas, e o levantamento intacto', async () => {
        const antes = JSON.stringify([estado.db.orcamentista_levantamento, estado.db.orcamentista_levantamento_item])
        const r = await atravessarLevantamento(T, LEV)
        expect(r).toEqual({ orcamento: { id: expect.any(String), numero: 1 }, itens: 3, faltas: [FALTA_DO_RESPONSAVEL_DA_RT], retomada: false })
        expect(new Set(escritas().map((o) => `${o.tabela}:${o.op}`))).toEqual(new Set(['orcamentista_orcamento:insert', 'orcamentista_orcamento_item:insert']))
        expect(JSON.stringify([estado.db.orcamentista_levantamento, estado.db.orcamentista_levantamento_item])).toBe(antes)
        const [o] = estado.db.orcamentista_orcamento
        expect(o).toEqual(expect.objectContaining({ tenant_id: T, numero: 1, origem: 'agente', levantamento_id: LEV, criado_por: null, comissao_percentual: 5, lucro_projetado_percentual: 10 }))
        expect(o).not.toHaveProperty('valor_venda')
        expect(estado.db.orcamentista_orcamento_item.map((i) => [i.tenant_id, i.orcamento_id, i.ordem, i.levantamento_item_id])).toEqual([[T, o.id, 1, 'li-1'], [T, o.id, 2, 'li-2'], [T, o.id, 3, 'li-3']])
    })
    it('o número é o seguinte DA EMPRESA (o de outra empresa não conta)', async () => {
        estado.db.orcamentista_orcamento = [{ id: 'o-outra', tenant_id: OUTRO, numero: 40, levantamento_id: null }, { id: 'o-7', tenant_id: T, numero: 7, levantamento_id: null }]
        expect((await atravessarLevantamento(T, LEV)).orcamento.numero).toBe(8)
    })
})

describe('(4) idempotente', () => {
    it('a segunda travessia recusa nomeando o orçamento, e não grava nada', async () => {
        const primeira = await atravessarLevantamento(T, LEV)
        estado.ops = []
        const e = await atravessarLevantamento(T, LEV).catch((x) => x)
        expect(e).toBeInstanceOf(ErroJaAtravessado)
        expect(e.message).toBe(fraseJaAtravessado(11, primeira.orcamento.numero))
        expect(escritas()).toEqual([])
        expect(estado.db.orcamentista_orcamento).toHaveLength(1)
    })
    it('o orçamento que existe SEM itens (a travessia interrompida) recebe os itens, sem orçamento novo', async () => {
        estado.db.orcamentista_orcamento = [{ id: 'o-meio', tenant_id: T, numero: 5, levantamento_id: LEV }]
        const r = await atravessarLevantamento(T, LEV)
        expect(r).toEqual(expect.objectContaining({ orcamento: { id: 'o-meio', numero: 5 }, itens: 3, retomada: true }))
        expect(estado.db.orcamentista_orcamento).toHaveLength(1)
        expect(estado.db.orcamentista_orcamento_item.map((i) => i.orcamento_id)).toEqual(['o-meio', 'o-meio', 'o-meio'])
    })
    it('a corrida: o INSERT bate no índice um_por_levantamento e a resposta é "já atravessado", nunca outro número', async () => {
        // o outro chamador grava o orçamento do mesmo levantamento DEPOIS da leitura deste e ANTES do INSERT dele
        estado.antesDoInsert = () => {
            estado.db.orcamentista_orcamento.push({ id: 'o-do-outro', tenant_id: T, numero: 9, levantamento_id: LEV })
            estado.db.orcamentista_orcamento_item = [{ id: 'oi-x', tenant_id: T, orcamento_id: 'o-do-outro', ordem: 1 }]
        }
        const e = await atravessarLevantamento(T, LEV).catch((x) => x)
        expect(e).toBeInstanceOf(ErroJaAtravessado)
        expect(e.orcamentoNumero).toBe(9)
        expect(estado.db.orcamentista_orcamento).toHaveLength(1)
        expect(estado.db.orcamentista_orcamento_item).toHaveLength(1)
    })
})

describe('(5) isolamento de tenant', () => {
    it('o levantamento de outra empresa é "não encontrado", e nada é gravado', async () => {
        await expect(atravessarLevantamento(T, LEV_OUTRO)).rejects.toBeInstanceOf(ErroNaoEncontrado)
        expect(escritas()).toEqual([])
        for (const o of estado.ops) expect(o.filtros).toContainEqual(['eq', 'tenant_id', T])
    })
    it('toda leitura e escrita da travessia leva o tenant do chamador', async () => {
        await atravessarLevantamento(T, LEV)
        for (const o of estado.ops.filter((x) => x.op === 'select')) expect(o.filtros).toContainEqual(['eq', 'tenant_id', T])
        for (const o of escritas()) for (const l of (Array.isArray(o.carga) ? o.carga : [o.carga]) as Linha[]) expect(l.tenant_id).toBe(T)
    })
    it('a lista da ação manual: só os COMPLETOS da empresa, com o orçamento de cada um', async () => {
        estado.db.orcamentista_levantamento.push({ ...GERALDO, id: 'lev-montagem', numero: 12, nome: 'Em montagem', estado: 'EM_MONTAGEM' })
        estado.db.orcamentista_orcamento = [{ id: 'o-1', tenant_id: T, numero: 1, levantamento_id: LEV }]
        expect(await levantamentosParaAtravessar(T)).toEqual([{ id: LEV, numero: 11, nome: 'Geraldo Huck', orcamento: { id: 'o-1', numero: 1 } }])
    })
})

describe('(6) o cliente e as faltas, LIDOS', () => {
    it('o cliente e o vendedor vêm do levantamento, no tenant do chamador', async () => {
        expect(await lerClienteDoLevantamento(T, LEV)).toEqual({
            levantamento_numero: 11, nome: 'Geraldo Huck', telefone: '51 99999-0000', email: null, endereco: 'Rua A, 10', edificacao: '', obs_obra: null,
            data_entrega: '2026-12-01', vendedor_nome: 'Paulo', vendedor_employee_id: 'emp-1',
        })
        expect(await lerClienteDoLevantamento(T, LEV_OUTRO)).toBeNull()
        expect(await lerClienteDoLevantamento(T, null)).toBeNull()
    })
    it('as faltas são lidas das COLUNAS do orçamento (nulo é falta); o manual não tem', async () => {
        estado.db.orcamentista_orcamento = [
            { id: 'o-a', tenant_id: T, origem: 'agente', comissao_percentual: null, comissao_modo: 'PROPORCIONAL', reserva_tecnica_percentual: '0', reserva_tecnica_responsavel: null, lucro_projetado_percentual: null },
            { id: 'o-m', tenant_id: T, origem: 'manual', comissao_percentual: null, comissao_modo: null, reserva_tecnica_percentual: null, reserva_tecnica_responsavel: null, lucro_projetado_percentual: null },
        ]
        expect(await faltasDoOrcamento(T, 'o-a')).toEqual([FALTA_DA_COMISSAO, FALTA_DO_LUCRO])
        expect(await faltasDoOrcamento(T, 'o-m')).toEqual([])
        expect(faltasDoCongelado({ comissao_percentual: 5, comissao_modo: 'X', reserva_tecnica_percentual: 1, reserva_tecnica_responsavel: 'Arq.', lucro_projetado_percentual: 10 })).toEqual([])
    })
})

describe('(7) o gatilho do "sim" nunca lança', () => {
    it('cria, depois diz que já existe, e a recusa e a falha viram texto do log', async () => {
        expect(await atravessarNoSim(T, LEV)).toBe('orcamento=1 itens=3 faltas=1')
        expect(await atravessarNoSim(T, LEV)).toBe('ja_existe=1')
        semear({ estado: 'EM_MONTAGEM' })
        estado.db.orcamentista_orcamento = []
        expect(await atravessarNoSim(T, LEV)).toBe('recusou=1')
        estado.erros.orcamentista_levantamento = [{ code: 'XX000', message: 'o banco caiu' }]
        expect(await atravessarNoSim(T, LEV)).toBe('falhou motivo="orcamentista_levantamento: o banco caiu"')
    })
})

describe('(8) o aviso da tabela congelada', () => {
    // um material: 2 barras de R$ 100 na vigente (o bruto do material é 200), líquido 160 (o valor não importa ao aviso: é o do cálculo)
    const material = (codigo: string): LinhaDeMaterial => ({
        ordem: 1, codigo, descricao: null, unidade_compra: 'BR', medida_unidade: 6, custo_bruto_unidade: 100, cred_icms_pct: 12, cred_pis_cofins_pct: 9.25,
        cred_ipi_pct: null, nc_ipi_pct: 0, cred_ibs_pct: null, cred_cbs_pct: null, credito_nao_apurado: null, custo_liquido_unidade: 80, custo_liquido_fracao: 80 / 6,
        consumo_item: 12, custo_bruto_material: 200, custo_liquido_material: 160,
    })
    const congelada: LinhaDaTabelaCongelada[] = [{ codigo: '1001', valor_barra_interno: 110, cred_icms_pct: 12, cred_pis_cofins_pct: 9.25, cred_ipi_pct: null, nc_ipi_pct: 0, cred_ibs_pct: null, cred_cbs_pct: null }]
    const nomes = new Map([['tab-velha', 'Wolff 2026-10.xlsx'], ['tab-nova', 'Wolff 2026-11.xlsx']])

    it('sem tabela congelada (o caso dos 28 itens de produção): nenhum aviso — não houve comparação', () => {
        expect(avisosDeDivergencia([{ ordem: 1, tabelaCongelada: null, tabelasVigentes: ['tab-nova'], materiais: [material('1001')] }], new Map(), nomes)).toEqual([])
    })
    it('a congelada é a vigente: nenhum aviso', () => {
        expect(avisosDeDivergencia([{ ordem: 1, tabelaCongelada: 'tab-nova', tabelasVigentes: ['tab-nova'], materiais: [material('1001')] }], new Map(), nomes)).toEqual([])
    })
    it('diverge: as duas tabelas pelo nome, e o custo na congelada pela CASCATA, com a MESMA quantidade (feito à mão)', () => {
        // 110 bruto; ICMS 12% do bruto = 13,20 → saldo 96,80; PIS/COFINS 9,25% do SALDO = 8,954 → 87,846; IPI sem crédito 0. × 2 barras
        expect(custoNaTabelaCongelada([material('1001')], congelada)).toEqual({ bruto: 220, liquido: expect.closeTo(175.692, 6), ausentes: [] })
        const [a] = avisosDeDivergencia([{ ordem: 2, tabelaCongelada: 'tab-velha', tabelasVigentes: ['tab-nova'], materiais: [material('1001')] }], new Map([['tab-velha', congelada]]), nomes)
        expect(a).toBe('Esquadria 2: o levantamento congelou a tabela "Wolff 2026-10.xlsx"; o cálculo usou a vigente (Wolff 2026-11.xlsx).'
            + ' Com os mesmos materiais, na tabela congelada o custo seria R$ 220,00 bruto e R$ 175,69 líquido, contra R$ 200,00 e R$ 160,00 na vigente (diferença −R$ 15,69 no líquido).')
    })
    it('o código que a congelada não tem é nomeado, e não entra como zero', () => {
        const c = custoNaTabelaCongelada([material('1001'), material('9999')], congelada)
        expect(c.ausentes).toEqual(['9999'])
        expect(c.bruto).toBe(220)
    })
})
