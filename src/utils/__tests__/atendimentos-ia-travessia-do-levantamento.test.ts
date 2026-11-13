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
 *   (1b) a REGRA DO ZERO (11/11/2026): o levantamento, senão a pré-definição do vendedor, senão ZERO explícito — e a origem de cada um;
 *   (7) o gatilho do "sim" ENCADEIA travessia -> cálculo, para na precificação, e nunca lança;
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
    // a UNIQUE (tenant_id, numero) do banco
    if (tabela === 'orcamentista_orcamento' && novas.some((n) => linhas.some((l) => l.tenant_id === n.tenant_id && l.numero === n.numero))) {
        return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "orcamentista_orcamento_numero_key"' } }
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
// o cálculo tem portão próprio (`atendimentos-ia-orcamento-calculado.test.ts`); aqui só importa que o "sim" o chama, com o orçamento criado
const calculo = { chamadas: [] as Array<[string, string]>, resposta: null as null | (() => unknown) }
jest.mock('@/lib/atendimentos-ia/orcamento-calculado', () => {
    class ErroDoCalculo extends Error { constructor(readonly recusas: string[]) { super(recusas.join(' | ')) } }
    return {
        ErroDoCalculo,
        calcularOrcamento: async (t: string, id: string) => { calculo.chamadas.push([t, id]); return calculo.resposta ? calculo.resposta() : { valor_total_liquido: 5240.395, valor_total_bruto: 5483.2, faltas: [], parcial: false } },
    }
})

import {
    atravessarLevantamento, atravessarNoSim, aproveitamentoDaTravessia, ErroDaTravessia, ErroJaAtravessado, faltasDoCongelado, faltasDoOrcamento, fraseDosQuestionamentos,
    fraseJaAtravessado, fraseNaoCompleto, fraseSemItens, fraseSemQuantidade, lerClienteDoLevantamento, levantamentosParaAtravessar, planoDaTravessia,
    FALTA_DO_MODO_DA_COMISSAO, origemNaTela, percentuaisDoOrcamento, resolverPercentual,
    type ItemDoLevantamentoNaTravessia, type LevantamentoNaTravessia,
} from '@/lib/atendimentos-ia/travessia-do-levantamento'
import { ErroNaoEncontrado, LIMITE_DO_NOME as LIMITE_DO_NOME_DO_ORCAMENTO } from '@/lib/atendimentos-ia/orcamentos-ia'
import { LIMITE_DO_NOME, fraseDoNome, fraseDoOrcamentoQueJaExiste, itensForaDoOrcamento } from '@/lib/atendimentos-ia/travessia-do-levantamento'
import { fraseDoArquivoQueNaoChegou } from '@/lib/atendimentos-ia/arquivo-que-nao-chegou'
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
beforeEach(() => { estado.db = {}; estado.ops = []; estado.erros = {}; estado.antesDoInsert = null; seq = 0; semear(); calculo.chamadas = []; calculo.resposta = null })
const escritas = () => estado.ops.filter((o) => o.op !== 'select')

describe('(1) o plano', () => {
    it('congela o que muda preço, com o nome, a origem e o levantamento; o criado_por é nulo (o do agente não tem autor)', () => {
        const p = planoDaTravessia(GERALDO, ITENS, null, null)
        if (!('orcamento' in p)) throw new Error('recusou')
        expect(p.orcamento).toEqual({
            tenant_id: T, origem: 'agente', levantamento_id: LEV, nome: 'Geraldo Huck', obs: null, criado_por: null,
            comissao_percentual: 5, comissao_modo: 'PROPORCIONAL', reserva_tecnica_percentual: 1, reserva_tecnica_responsavel: null, lucro_projetado_percentual: 10,
            aproveitamento_modo: 'SEM', aproveitamento_origem: 'fallback_barra_inteira', aproveitamento_motivo: MOTIVO_DO_FALLBACK, aproveitamento_por: null,
            // o preset da comercialização (dono do produto, 11/11/2026), gravado na criação
            sale_scope: 'INTRAESTADUAL', buyer_type: 'CONSUMIDOR_FINAL', uf_destino: null, ncm_code: null,
        })
    })
    it('NÃO forma preço: o plano não traz valor de venda, operação interna nem totais', () => {
        const p = planoDaTravessia(GERALDO, ITENS, null, null)
        if (!('orcamento' in p)) throw new Error('recusou')
        for (const c of ['valor_venda', 'valor_operacao_interna', 'valor_total_bruto', 'valor_total_liquido']) expect(Object.keys(p.orcamento)).not.toContain(c)
    })
    it('um item por item do levantamento, NA ORDEM, com o levantamento_item_id e os campos copiados (ambientes e escolhas como estão)', () => {
        const p = planoDaTravessia(GERALDO, ITENS, null, null)
        if (!('itens' in p)) throw new Error('recusou')
        expect(p.itens.map((i) => [i.ordem, i.levantamento_item_id, i.tipologia])).toEqual([[1, 'li-1', 'DP-39'], [2, 'li-2', 'DP-01'], [3, 'li-3', 'DP-02']])
        expect(p.itens[2]).toEqual({ ordem: 3, levantamento_item_id: 'li-3', tipologia: 'DP-02', largura_mm: 1600, altura_mm: 1200, quantidade: 2, cor_perfil: 'Branco', vidro: 'incolor 4 mm comum', ambientes: null, escolhas: null })
        expect(p.itens[1].ambientes).toEqual([{ ambiente: 'Sala', quantidade: 1 }])
        expect(p.itens[1].escolhas).toEqual({ N: 2 })
    })
    it('o Geraldo Huck: nenhuma falta — a RT de 1% sem responsável NÃO é falta (nome livre, fora de qualquer cálculo)', () => {
        const p = planoDaTravessia(GERALDO, ITENS, null, null)
        if (!('faltas' in p)) throw new Error('recusou')
        expect(p.faltas).toEqual([])
        expect(p.origens).toEqual({ comissao_percentual: 'levantamento', reserva_tecnica_percentual: 'levantamento', lucro_projetado_percentual: 'levantamento' })
    })
    it('o ZERO dito é zero, e não é falta; RT zero não pede responsável', () => {
        const p = planoDaTravessia({ ...GERALDO, comissao_percentual: 0, reserva_tecnica_percentual: 0, lucro_projetado_percentual: 0 }, ITENS, null, null)
        if (!('orcamento' in p)) throw new Error('recusou')
        expect([p.orcamento.comissao_percentual, p.orcamento.reserva_tecnica_percentual, p.orcamento.lucro_projetado_percentual]).toEqual([0, 0, 0])
        expect(p.faltas).toEqual([])
    })
    it('o numeric do banco chega como texto e vira número; o texto vazio é AUSENTE (vai à pré-definição), nunca o zero de `Number(\'\')`', () => {
        const p = planoDaTravessia({ ...GERALDO, comissao_percentual: '5' as unknown as number, comissao_modo: '  ', lucro_projetado_percentual: '' as unknown as number }, ITENS, null,
            { comissao_percentual: 9, comissao_modo: null, reserva_tecnica_percentual: null, lucro_projetado_percentual: 12 })
        if (!('orcamento' in p)) throw new Error('recusou')
        expect(p.orcamento.comissao_percentual).toBe(5)
        expect(p.orcamento.comissao_modo).toBeNull()
        expect(p.orcamento.lucro_projetado_percentual).toBe(12)
        expect(p.origens.lucro_projetado_percentual).toBe('base_de_conhecimento')
        expect(p.faltas).toEqual([FALTA_DO_MODO_DA_COMISSAO])
    })
    it('o nome do cliente é gravado aparado', () => {
        const p = planoDaTravessia({ ...GERALDO, nome: '  Geraldo Huck  ' }, ITENS, null, null)
        if (!('orcamento' in p)) throw new Error('recusou')
        expect(p.orcamento.nome).toBe('Geraldo Huck')
    })
    it('o aproveitamento: o que a base der vale, com origem base_de_conhecimento e sem motivo nem autor; sem resposta, o fallback SEM', () => {
        expect(aproveitamentoDaTravessia('COM')).toEqual({ aproveitamento_modo: 'COM', aproveitamento_origem: 'base_de_conhecimento', aproveitamento_motivo: null, aproveitamento_por: null })
        expect(aproveitamentoDaTravessia(null)).toEqual({ aproveitamento_modo: 'SEM', aproveitamento_origem: 'fallback_barra_inteira', aproveitamento_motivo: MOTIVO_DO_FALLBACK, aproveitamento_por: null })
    })
})

describe('(1b) a REGRA DO ZERO: levantamento, senão a pré-definição do vendedor, senão zero (dono do produto, 11/11/2026)', () => {
    const VAZIO: LevantamentoNaTravessia = { ...GERALDO, comissao_percentual: null, comissao_modo: null, reserva_tecnica_percentual: null, lucro_projetado_percentual: null }
    const PERFIL = { comissao_percentual: 3, comissao_modo: 'CONGELADA', reserva_tecnica_percentual: 2, lucro_projetado_percentual: 15 }
    it('a ordem, campo a campo: o levantamento vence a base, a base vence o zero, e o zero é o último', () => {
        expect(resolverPercentual(5, 3)).toEqual({ valor: 5, origem: 'levantamento' })
        expect(resolverPercentual(0, 3)).toEqual({ valor: 0, origem: 'levantamento' })
        expect(resolverPercentual(null, 3)).toEqual({ valor: 3, origem: 'base_de_conhecimento' })
        expect(resolverPercentual(null, 0)).toEqual({ valor: 0, origem: 'base_de_conhecimento' })
        expect(resolverPercentual(null, null)).toEqual({ valor: 0, origem: 'zero_por_ausencia' })
        expect(resolverPercentual(undefined, undefined)).toEqual({ valor: 0, origem: 'zero_por_ausencia' })
    })
    it('levantamento vazio e vendedor com pré-definição: os três (e o modo) vêm da base', () => {
        const p = planoDaTravessia(VAZIO, ITENS, null, PERFIL)
        if (!('orcamento' in p)) throw new Error('recusou')
        expect([p.orcamento.comissao_percentual, p.orcamento.comissao_modo, p.orcamento.reserva_tecnica_percentual, p.orcamento.lucro_projetado_percentual]).toEqual([3, 'CONGELADA', 2, 15])
        expect(p.origens).toEqual({ comissao_percentual: 'base_de_conhecimento', reserva_tecnica_percentual: 'base_de_conhecimento', lucro_projetado_percentual: 'base_de_conhecimento' })
        expect(p.faltas).toEqual([])
    })
    it('levantamento vazio e sem pré-definição: ZERO gravado como 0 (nunca nulo), com a origem dita; só o modo falta', () => {
        const p = planoDaTravessia(VAZIO, ITENS, null, null)
        if (!('orcamento' in p)) throw new Error('recusou')
        expect([p.orcamento.comissao_percentual, p.orcamento.reserva_tecnica_percentual, p.orcamento.lucro_projetado_percentual]).toEqual([0, 0, 0])
        expect(p.origens).toEqual({ comissao_percentual: 'zero_por_ausencia', reserva_tecnica_percentual: 'zero_por_ausencia', lucro_projetado_percentual: 'zero_por_ausencia' })
        expect(p.faltas).toEqual([FALTA_DO_MODO_DA_COMISSAO])
    })
    it('misturado: cada campo resolve sozinho', () => {
        const p = planoDaTravessia({ ...VAZIO, comissao_percentual: 5 }, ITENS, null, { ...PERFIL, comissao_percentual: 3, reserva_tecnica_percentual: null })
        if (!('origens' in p)) throw new Error('recusou')
        expect([p.orcamento.comissao_percentual, p.orcamento.reserva_tecnica_percentual, p.orcamento.lucro_projetado_percentual]).toEqual([5, 0, 15])
        expect(p.origens).toEqual({ comissao_percentual: 'levantamento', reserva_tecnica_percentual: 'zero_por_ausencia', lucro_projetado_percentual: 'base_de_conhecimento' })
    })
    it('a observação ausente continua NULA (não zero), e o responsável da RT nulo não é falta', () => {
        const p = planoDaTravessia({ ...GERALDO, reserva_tecnica_percentual: 4, reserva_tecnica_responsavel: null }, ITENS, null, null)
        if (!('orcamento' in p)) throw new Error('recusou')
        expect(p.orcamento.obs).toBeNull()
        expect(p.orcamento.reserva_tecnica_responsavel).toBeNull()
        expect(p.faltas).toEqual([])
        expect(faltasDoCongelado({ comissao_modo: 'PROPORCIONAL' })).toEqual([])
        expect(faltasDoCongelado({ comissao_modo: null })).toEqual([FALTA_DO_MODO_DA_COMISSAO])
    })
    it('pelo servidor: a pré-definição é a do VENDEDOR DO LEVANTAMENTO, na empresa do chamador', async () => {
        semear({ comissao_percentual: null, reserva_tecnica_percentual: null, lucro_projetado_percentual: null })
        estado.db.orcamentista_vendedor_perfil = [
            { tenant_id: OUTRO, employee_id: 'emp-1', comissao_percentual: 50, comissao_modo: 'PROPORCIONAL', reserva_tecnica_percentual: 50, lucro_projetado_percentual: 50 },
            { tenant_id: T, employee_id: 'emp-2', comissao_percentual: 40, comissao_modo: 'PROPORCIONAL', reserva_tecnica_percentual: 40, lucro_projetado_percentual: 40 },
            { tenant_id: T, employee_id: 'emp-1', comissao_percentual: 3, comissao_modo: 'PROPORCIONAL', reserva_tecnica_percentual: null, lucro_projetado_percentual: 15 },
        ]
        const r = await atravessarLevantamento(T, LEV)
        expect(r.origens).toEqual({ comissao_percentual: 'base_de_conhecimento', reserva_tecnica_percentual: 'zero_por_ausencia', lucro_projetado_percentual: 'base_de_conhecimento' })
        expect(estado.db.orcamentista_orcamento[0]).toEqual(expect.objectContaining({ comissao_percentual: 3, reserva_tecnica_percentual: 0, lucro_projetado_percentual: 15 }))
        expect(estado.ops.filter((o) => o.tabela === 'orcamentista_vendedor_perfil').every((o) => o.filtros.some(([, c, v]) => c === 'tenant_id' && v === T))).toBe(true)
    })
    it('a ORIGEM na tela, por comparação: levantamento, base, zero por ausência, ou alterado no orçamento', () => {
        expect(origemNaTela(5, 5, 3)).toBe('levantamento')
        expect(origemNaTela(7, 5, 3)).toBe('alterado_no_orcamento')
        expect(origemNaTela(3, null, 3)).toBe('base_de_conhecimento')
        expect(origemNaTela(4, null, 3)).toBe('alterado_no_orcamento')
        expect(origemNaTela(0, null, null)).toBe('zero_por_ausencia')
        expect(origemNaTela(2, null, null)).toBe('alterado_no_orcamento')
        expect(origemNaTela(null, 5, 3)).toBeNull()
    })
    it('percentuaisDoOrcamento: os três com a origem; o manual não tem', async () => {
        semear({ comissao_percentual: 5, reserva_tecnica_percentual: null, lucro_projetado_percentual: null })
        estado.db.orcamentista_vendedor_perfil = [{ tenant_id: T, employee_id: 'emp-1', comissao_percentual: null, comissao_modo: null, reserva_tecnica_percentual: null, lucro_projetado_percentual: 15 }]
        estado.db.orcamentista_orcamento = [
            { id: 'o-a', tenant_id: T, origem: 'agente', levantamento_id: LEV, comissao_percentual: 5, reserva_tecnica_percentual: 0, lucro_projetado_percentual: 15 },
            { id: 'o-m', tenant_id: T, origem: 'manual', levantamento_id: null, comissao_percentual: 1, reserva_tecnica_percentual: 1, lucro_projetado_percentual: 1 },
        ]
        expect(await percentuaisDoOrcamento(T, 'o-a')).toEqual([
            { campo: 'comissao_percentual', valor: 5, origem: 'levantamento' },
            { campo: 'reserva_tecnica_percentual', valor: 0, origem: 'zero_por_ausencia' },
            { campo: 'lucro_projetado_percentual', valor: 15, origem: 'base_de_conhecimento' },
        ])
        expect(await percentuaisDoOrcamento(T, 'o-m')).toEqual([])
        expect(await percentuaisDoOrcamento(OUTRO, 'o-a')).toEqual([])
    })
})

describe('(2) as recusas, e nada é gravado', () => {
    it('o nome acima do limite da CHECK do orçamento recusa; o limite é o MESMO de orcamentos-ia', () => {
        expect(LIMITE_DO_NOME).toBe(LIMITE_DO_NOME_DO_ORCAMENTO)
        expect(planoDaTravessia({ ...GERALDO, nome: 'x'.repeat(LIMITE_DO_NOME + 1) }, ITENS, null, null)).toEqual({ ok: false, recusas: [fraseDoNome(11)] })
        expect('orcamento' in planoDaTravessia({ ...GERALDO, nome: 'x'.repeat(LIMITE_DO_NOME) }, ITENS, null, null)).toBe(true)
    })
    it('só o COMPLETO atravessa', () => {
        expect(planoDaTravessia({ ...GERALDO, estado: 'EM_MONTAGEM' }, ITENS, null, null)).toEqual({ ok: false, recusas: [fraseNaoCompleto(11, 'EM_MONTAGEM')] })
    })
    it('sem esquadria, recusa', () => {
        expect(planoDaTravessia(GERALDO, [], null, null)).toEqual({ ok: false, recusas: [fraseSemItens(11)] })
    })
    it('a quantidade nula não vira 1, e a zero também recusa', () => {
        const r = planoDaTravessia(GERALDO, [{ ...ITENS[1], quantidade: null }, { ...ITENS[0], quantidade: 0 }], null, null)
        expect(r).toEqual({ ok: false, recusas: [fraseSemQuantidade(1), fraseSemQuantidade(3)] })
    })
    it('a quantidade fracionária também recusa (vazio e meia esquadria não viram 1)', () => {
        expect(planoDaTravessia(GERALDO, [{ ...ITENS[1], quantidade: 1.5 }], null, null)).toEqual({ ok: false, recusas: [fraseSemQuantidade(1)] })
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
        expect(r).toEqual({ orcamento: { id: expect.any(String), numero: 1 }, itens: 3, faltas: [], retomada: false,
            origens: { comissao_percentual: 'levantamento', reserva_tecnica_percentual: 'levantamento', lucro_projetado_percentual: 'levantamento' } })
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

describe('(4b) a corrida no NÚMERO', () => {
    it('outro orçamento da empresa toma o número entre a leitura e o INSERT: tenta de novo com o seguinte', async () => {
        estado.antesDoInsert = () => { estado.db.orcamentista_orcamento.push({ id: 'o-manual', tenant_id: T, numero: 1, levantamento_id: null }) }
        const r = await atravessarLevantamento(T, LEV)
        expect(r.orcamento.numero).toBe(2)
        expect(estado.db.orcamentista_orcamento.map((o) => o.numero)).toEqual([1, 2])
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
    it('as faltas são lidas das COLUNAS do orçamento: só o modo da comissão pode faltar; o manual não tem', async () => {
        estado.db.orcamentista_orcamento = [
            { id: 'o-a', tenant_id: T, origem: 'agente', comissao_percentual: 0, comissao_modo: null, reserva_tecnica_percentual: 0, reserva_tecnica_responsavel: null, lucro_projetado_percentual: 0 },
            { id: 'o-b', tenant_id: T, origem: 'agente', comissao_percentual: 0, comissao_modo: 'PROPORCIONAL', reserva_tecnica_percentual: 4, reserva_tecnica_responsavel: null, lucro_projetado_percentual: 0 },
            { id: 'o-m', tenant_id: T, origem: 'manual', comissao_percentual: null, comissao_modo: null, reserva_tecnica_percentual: null, reserva_tecnica_responsavel: null, lucro_projetado_percentual: null },
        ]
        expect(await faltasDoOrcamento(T, 'o-a')).toEqual([FALTA_DO_MODO_DA_COMISSAO])
        expect(await faltasDoOrcamento(T, 'o-b')).toEqual([])
        expect(await faltasDoOrcamento(T, 'o-m')).toEqual([])
        expect(await faltasDoOrcamento(OUTRO, 'o-a')).toEqual([])
    })
})

describe('(7) o gatilho do "sim" ENCADEIA travessia -> cálculo -> etapa do preço, e nunca lança', () => {
    const TRAVESSIA = 'orcamento=1 itens=3 faltas=0 origens=comissao:levantamento,rt:levantamento,lucro:levantamento'
    const etapa = { chamadas: [] as string[], resposta: (): Promise<{ rastro: string; paraOVendedor: string | null }> => Promise.resolve({ rastro: 'precificacao=ok envio=ok', paraOVendedor: 'enviado' }) }
    const naEtapa = (orcamentoId: string) => { etapa.chamadas.push(orcamentoId); return etapa.resposta() }
    beforeEach(() => { etapa.chamadas = []; etapa.resposta = () => Promise.resolve({ rastro: 'precificacao=ok envio=ok', paraOVendedor: 'enviado' }) })
    it('atravessa, CALCULA o orçamento criado e roda a ETAPA DO PREÇO sobre ele: o rastro e o texto da etapa voltam', async () => {
        expect(await atravessarNoSim(T, LEV, naEtapa)).toEqual({ rastro: `${TRAVESSIA} calculo=ok liquido=5240.40 precificacao=ok envio=ok`, paraOVendedor: 'enviado' })
        const id = estado.db.orcamentista_orcamento[0].id
        expect(calculo.chamadas).toEqual([[T, id]])
        expect(etapa.chamadas).toEqual([id])
    })
    it('4.3 (12/11/2026): o cálculo PARCIAL leva os QUESTIONAMENTOS ao "sim", e o número que recebeu o arquivo segue junto', async () => {
        calculo.resposta = () => ({ valor_total_liquido: 100, valor_total_bruto: 120, parcial: true, faltas: [
            { codigo_do_motor: 'SF92/WOLFF', frase: 'SF92/WOLFF não está na tabela de preço.', esquadria: 1 },
            { codigo_do_motor: 'SF92/WOLFF', frase: 'SF92/WOLFF não está na tabela de preço.', esquadria: 3 },
            { codigo_do_motor: 'VIDRO', frase: 'o vidro “mini boreal” bate com 5 itens', esquadria: 2 },
        ] })
        etapa.resposta = () => Promise.resolve({ rastro: 'precificacao=ok envio=ok', paraOVendedor: 'enviado', enviadoPara: '5551999990000' })
        const r = await atravessarNoSim(T, LEV, naEtapa)
        expect(r.rastro).toContain('calculo=ok liquido=100.00 parcial=sim faltas_de_preco=3')
        expect(r.enviadoPara).toBe('5551999990000')
        expect(r.questionamentos).toBe([
            'O orçamento 1 saiu PARCIAL — faltam 2 valores. Para completar, preciso de:',
            // a frase que começa pelo código não o repete: o código uma vez, e as esquadrias no fim
            '• SF92/WOLFF não está na tabela de preço (itens 1, 3).',
            '• VIDRO (item 2): o vidro “mini boreal” bate com 5 itens.',
        ].join('\n'))
    })
    it('os questionamentos: um valor é "falta 1 valor"; sem falta, nada a perguntar', () => {
        expect(fraseDosQuestionamentos(4, [{ codigo_do_motor: 'X', frase: 'x', esquadria: 1 }])).toBe('O orçamento 4 saiu PARCIAL — falta 1 valor. Para completar, preciso de:\n• X (item 1): x.')
        expect(fraseDosQuestionamentos(4, [])).toBeNull()
    })
    it('a etapa que LANÇA não derruba o "sim": o rastro diz parou=precificacao, e nada do que foi gravado é desfeito', async () => {
        etapa.resposta = () => Promise.reject(new Error('storage fora do ar'))
        expect(await atravessarNoSim(T, LEV, naEtapa)).toEqual({ rastro: `${TRAVESSIA} calculo=ok liquido=5240.40 precificacao=falhou parou=precificacao motivo="storage fora do ar"`, paraOVendedor: fraseDoArquivoQueNaoChegou(null, 'a precificação do orçamento 1 falhou. Para tentar de novo, abra o orçamento 1 na seção Orçamentos I.A. e use Precificar') })
        expect(estado.db.orcamentista_orcamento).toHaveLength(1)
    })
    it('o já atravessado para na travessia e NÃO recalcula nem reenvia; a recusa e a falha da travessia também param nela', async () => {
        await atravessarNoSim(T, LEV, naEtapa)
        calculo.chamadas = []
        etapa.chamadas = []
        expect(await atravessarNoSim(T, LEV, naEtapa)).toEqual({ rastro: 'ja_existe=1 parou=travessia fora=0', paraOVendedor: fraseDoOrcamentoQueJaExiste(1, []) })
        semear({ estado: 'EM_MONTAGEM' })
        estado.db.orcamentista_orcamento = []
        expect(await atravessarNoSim(T, LEV, naEtapa)).toEqual({ rastro: 'recusou=1 parou=travessia', paraOVendedor: expect.stringMatching(/^O arquivo do orçamento não chegou a você: o levantamento não passou para o orçamento\. Falta: o levantamento \d+ completo/) })
        estado.erros.orcamentista_levantamento = [{ code: 'XX000', message: 'o banco caiu' }]
        expect(await atravessarNoSim(T, LEV, naEtapa)).toEqual({ rastro: 'falhou parou=travessia motivo="orcamentista_levantamento: o banco caiu"', paraOVendedor: fraseDoArquivoQueNaoChegou(null, 'a passagem do levantamento para o orçamento falhou. Para tentar de novo, diga o nome do levantamento: o arquivo volta para você conferir, e o "sim" faz o orçamento') })
        expect(calculo.chamadas).toEqual([])
        expect(etapa.chamadas).toEqual([])
    })
    it('O QUE FICOU DE FORA É NOMEADO (13/11/2026): o item acrescentado depois da travessia aparece pelo número, com o que fazer — e o orçamento não muda', async () => {
        await atravessarNoSim(T, LEV, naEtapa)
        const itensDoOrcamento = JSON.stringify(estado.db.orcamentista_orcamento_item)
        // o levantamento ganha os itens 4 e 5 depois que virou o orçamento 1
        const doLev = estado.db.orcamentista_levantamento_item
        for (const ordem of [4, 5]) doLev.push({ ...doLev[0], id: `li-${ordem}`, ordem })
        const r = await atravessarNoSim(T, LEV, naEtapa)
        expect(r).toEqual({ rastro: 'ja_existe=1 parou=travessia fora=2', paraOVendedor: fraseDoOrcamentoQueJaExiste(1, [4, 5]) })
        expect(r.paraOVendedor).toContain('Falta no orçamento 1 os itens 4 e 5 do levantamento')
        expect(r.paraOVendedor).toContain('é preciso gerar um orçamento novo: mande esses itens num levantamento novo, com outro nome')
        // nada se recalcula para trás: o orçamento 1 continua com os itens que tinha
        expect(JSON.stringify(estado.db.orcamentista_orcamento_item)).toBe(itensDoOrcamento)
        // um item só: no singular; a leitura que falha: a frase diz que não conferiu, e manda conferir
        expect(fraseDoOrcamentoQueJaExiste(1, [4])).toContain('Falta no orçamento 1 o item 4 do levantamento: ele foi acrescentado depois')
        expect(fraseDoOrcamentoQueJaExiste(1, null)).toContain('Não consegui conferir se todos os itens do levantamento estão nele')
        const orcamento = String(estado.db.orcamentista_orcamento[0].id)
        expect(await itensForaDoOrcamento(T, LEV, orcamento)).toEqual([4, 5])
        estado.erros.orcamentista_levantamento_item = [{ code: 'XX000', message: 'caiu' }]
        expect(await itensForaDoOrcamento(T, LEV, orcamento)).toBeNull()
    })

    it('a recusa e a falha do cálculo param no cálculo, com o orçamento gravado, sem a etapa do preço, e não lançam', async () => {
        const { ErroDoCalculo } = jest.requireMock('@/lib/atendimentos-ia/orcamento-calculado') as { ErroDoCalculo: new (r: string[]) => Error }
        calculo.resposta = () => { throw new ErroDoCalculo(['o código 1023 sem preço']) }
        const recusou = await atravessarNoSim(T, LEV, naEtapa)
        expect(recusou.rastro).toBe(`${TRAVESSIA} calculo=recusou recusas=1 parou=calculo motivo="o código 1023 sem preço"`)
        // a parada no cálculo vai ao vendedor como a falta nomeada do arquivo que não chegou (13/11/2026), nunca nula
        expect(recusou.paraOVendedor).toBe(fraseDoArquivoQueNaoChegou(null, 'o cálculo do orçamento 1 recusou. Falta: o código 1023 sem preço. Com isso cadastrado, abra o orçamento 1 na seção Orçamentos I.A. e use Calcular'))
        expect(estado.db.orcamentista_orcamento).toHaveLength(1)
        semear(); estado.db.orcamentista_orcamento = []; estado.db.orcamentista_orcamento_item = []
        calculo.resposta = () => { throw new Error('orcamentista_orcamento_item_material: caiu') }
        const falhou = await atravessarNoSim(T, LEV, naEtapa)
        expect(falhou.rastro).toBe(`${TRAVESSIA} calculo=falhou parou=calculo motivo="orcamentista_orcamento_item_material: caiu"`)
        expect(falhou.paraOVendedor).toBe(fraseDoArquivoQueNaoChegou(null, 'o cálculo do orçamento 1 falhou. Para tentar de novo, abra o orçamento 1 na seção Orçamentos I.A. e use Calcular'))
        expect(etapa.chamadas).toEqual([])
    })
})

describe('(8) o aviso da tabela congelada', () => {
    // um material: 2 barras de R$ 100 na vigente (o bruto do material é 200), líquido 160 (o valor não importa ao aviso: é o do cálculo)
    const material = (codigo: string): LinhaDeMaterial => ({
        ordem: 1, caminho: 'perfil', codigo, codigo_na_tabela: codigo, resolucao: 'exato', descricao: null, unidade_compra: 'BR', medida_unidade: 6, custo_bruto_unidade: 100, cred_icms_pct: 12, cred_pis_cofins_pct: 9.25,
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
        expect(a).toBe('Item 2: o levantamento congelou a tabela "Wolff 2026-10.xlsx"; o cálculo usou a vigente (Wolff 2026-11.xlsx).'
            + ' Com os mesmos materiais, na tabela congelada o custo seria R$ 220,00 bruto e R$ 175,69 líquido, contra R$ 200,00 e R$ 160,00 na vigente (diferença −R$ 15,69 no líquido).')
    })
    it('o código que a congelada não tem é nomeado, e não entra como zero', () => {
        const c = custoNaTabelaCongelada([material('1001'), material('9999')], congelada)
        expect(c.ausentes).toEqual(['9999'])
        expect(c.bruto).toBe(220)
        const [a] = avisosDeDivergencia([{ ordem: 1, tabelaCongelada: 'tab-velha', tabelasVigentes: ['tab-nova'], materiais: [material('1001'), material('9999')] }], new Map([['tab-velha', congelada]]), nomes)
        expect(a.endsWith('; sem preço ou sem crédito apurável na congelada: 9999 (fora da conta, não somados como zero).')).toBe(true)
    })
})
