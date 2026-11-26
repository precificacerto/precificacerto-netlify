/**
 * @jest-environment node
 *
 * PORTÃO GERAL CONTRA O BANCO (pedido 0039-A, dono do produto, 26/11/2026): "orçamento que não grava não pode mais chegar à produção".
 *
 * O caso que originou: em 26/11/2026, às 22:14:38 UTC (log `dv68z-1795731251313`), todo recálculo falhou porque a `VERSAO_DO_CALCULO` tinha 48
 * caracteres e a CHECK `orcamentista_orcamento_calculo_versao_forma` aceita 40. Nenhum teste montava a linha que o cálculo grava e a conferia
 * contra o banco: o defeito só apareceu no "sim" do vendedor.
 *
 * Este portão roda o cálculo (`calcularOrcamento`) num orçamento de exemplo COMPLETO — os três caminhos (perfil, insumo e vidro), toda resolução
 * que o código grava, toda falta nomeada, as peças do corte, os dois modos (consumo e pedido total) — e confere CADA linha que ele escreve nas
 * cinco tabelas contra TODAS as CHECKs delas: tamanho de texto, valores aceitos, nulos, coerência entre colunas. Qualquer mudança que produza uma
 * linha que o banco recusaria fica VERMELHA antes do merge, nomeando a CHECK, a tabela e a coluna.
 *
 * DE ONDE VÊM AS CHECKs: o RETRATO DE PRODUÇÃO (`fixtures/checks-do-orcamento-em-producao.json`, `pg_get_constraintdef`, medido em 26/11/2026),
 * não a releitura das migrações. A pasta de migrações não é o schema (`migracao.md`, Parte II; `tabela-que-a-importacao-apaga.md`, a ressalva
 * do remédio 2) — medido: a CHECK `orcamentista_orcamento_arquivado_com_autor` está em produção e em nenhuma migração das tabelas do orçamento.
 * O que liga o retrato às migrações é o teste (A): migração nova que toque CHECK de uma das cinco tabelas deixa o portão vermelho até o retrato
 * ser medido de novo. O avaliador (`fixtures/avaliador-de-check.ts`) é FECHADO no que não conhece: forma nova de CHECK é erro, nunca "passa".
 */
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { avaliar, CheckQueNaoSeiAvaliar, lerCheck, lerChecks, violadas, type CheckDoBanco } from './fixtures/avaliador-de-check'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const RETRATO = require('./fixtures/checks-do-orcamento-em-producao.json') as { ultima_migracao_do_repositorio: string; checks: Array<[string, string, string]> }

type Linha = Record<string, unknown>
const TABELAS = ['orcamentista_orcamento', 'orcamentista_orcamento_item', 'orcamentista_orcamento_item_material', 'orcamentista_orcamento_item_peca', 'orcamentista_orcamento_falta'] as const
const CHECKS: CheckDoBanco[] = lerChecks(RETRATO.checks)

const T = 'tenant-da-conta'
const O1 = '30000000-0000-4000-8000-000000000001'
const O2 = '30000000-0000-4000-8000-000000000002'

/** Cada escrita nas cinco tabelas, com a linha como fica no banco depois dela e as colunas que ela escreveu (nulo = INSERT, todas). */
type Escrita = { tabela: string; op: 'insert' | 'update'; linha: Linha; escritas: Set<string> | null }
const estado = { db: {} as Record<string, Linha[]>, escritas: [] as Escrita[], custo: null as unknown }

function executar(tabela: string, op: string, carga: unknown, filtros: [string, string, unknown][], colunas: string | null) {
    const linhas = (estado.db[tabela] ??= [])
    const casa = (l: Linha) => filtros.every(([tipo, c, v]) => (tipo === 'in' ? (v as unknown[]).includes(l[c]) : tipo === 'is' ? (l[c] ?? null) === v : l[c] === v))
    const projetar = (l: Linha) => (colunas === null || colunas === '*' ? { ...l } : Object.fromEntries(colunas.split(',').map((c) => c.trim()).map((c) => [c, l[c]])))
    if (op === 'select') return { data: linhas.filter(casa).map(projetar), error: null as null }
    const guardar = (l: Linha, escritas: Set<string> | null) => { if ((TABELAS as readonly string[]).includes(tabela)) estado.escritas.push({ tabela, op: op as Escrita['op'], linha: { ...l }, escritas }) }
    if (op === 'update') {
        const r = linhas.filter(casa)
        r.forEach((l) => { Object.assign(l, carga as Linha); guardar(l, new Set(Object.keys(carga as Linha))) })
        return { data: r.map(projetar), error: null as null }
    }
    const novas = (Array.isArray(carga) ? carga : [carga]) as Linha[]
    novas.forEach((l) => { linhas.push({ ...l }); guardar(l, null) })
    return { data: novas, error: null as null }
}
function cliente() {
    return {
        from: (tabela: string) => {
            const filtros: [string, string, unknown][] = []
            let op = 'select'
            let carga: unknown
            let colunas: string | null = null
            const q: Record<string, unknown> = {}
            const rodar = () => Promise.resolve(executar(tabela, op, carga, filtros, colunas))
            q.select = (c?: string) => { colunas = c ?? '*'; return q }
            q.order = () => q
            q.limit = () => q
            q.eq = (c: string, v: unknown) => { filtros.push(['eq', c, v]); return q }
            q.is = (c: string, v: null) => { filtros.push(['is', c, v]); return q }
            q.in = (c: string, v: unknown[]) => { filtros.push(['in', c, v]); return q }
            q.update = (c: unknown) => { op = 'update'; carga = c; return q }
            q.insert = (c: unknown) => { op = 'insert'; carga = c; return q }
            q.maybeSingle = () => rodar().then((r) => ({ data: (r.data as Linha[] | null)?.[0] ?? null, error: r.error }))
            q.single = q.maybeSingle
            q.then = (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => rodar().then(ok, erro)
            return q
        },
    }
}
jest.mock('@/supabase/admin', () => ({ supabaseAdmin: cliente() }))
jest.mock('@/lib/atendimentos-ia/levantamento-da-conversa', () => ({ lerFamiliasDaEmpresa: async (): Promise<unknown> => ({ ok: true, familias: [], candidatos: [] }) }))
jest.mock('@/lib/atendimentos-ia/custo-do-orcamento-servidor', () => ({ custoDoLevantamento: async () => estado.custo }))

/* eslint-disable @typescript-eslint/no-require-imports */
const K = () => require('@/lib/atendimentos-ia/orcamento-calculado') as typeof import('@/lib/atendimentos-ia/orcamento-calculado')
const C = () => require('@/lib/atendimentos-ia/custo-do-orcamento') as typeof import('@/lib/atendimentos-ia/custo-do-orcamento')
const R = () => require('@/lib/atendimentos-ia/resolucao-de-referencia') as typeof import('@/lib/atendimentos-ia/resolucao-de-referencia')
/* eslint-enable @typescript-eslint/no-require-imports */

const N = null as number | null
/** Toda resolução que o código grava: a escada (`COMO_ACHOU`), a referência, a cor (histórica) e as três do vidro. */
const RESOLUCOES = () => [...R().COMO_ACHOU, 'referencia', 'cor', 'vidro_escolhido', 'vidro_traduzido', 'vidro_padrao'] as const
const material = (ordem: number, caminho: 'perfil' | 'insumo' | 'vidro', resolucao: string, comBloco: boolean) => ({
    ordem, caminho, codigo: `${caminho.toUpperCase()}-${ordem}`, codigo_na_tabela: `${ordem}`, resolucao, descricao: `PEÇA ${ordem} ${caminho}`, unidade_compra: caminho === 'vidro' ? 'M2' : 'BR',
    medida_unidade: caminho === 'vidro' ? 1 : 6, custo_bruto_unidade: 600,
    ...(comBloco
        ? { cred_icms_pct: 12, cred_pis_cofins_pct: 9.25, cred_ipi_pct: 6.5, nc_ipi_pct: N, cred_ibs_pct: N, cred_cbs_pct: N, credito_nao_apurado: null, custo_liquido_unidade: 480, custo_liquido_fracao: 80 }
        : { cred_icms_pct: N, cred_pis_cofins_pct: N, cred_ipi_pct: N, nc_ipi_pct: N, cred_ibs_pct: N, cred_cbs_pct: N, credito_nao_apurado: 'faltou no bloco tributario: cred_icms_pct, cred_pis_cofins_pct, o par do IPI (cred_ipi_pct ou nc_ipi_pct)', custo_liquido_unidade: 600, custo_liquido_fracao: 100 }),
    consumo_item: 3, custo_bruto_material: 1800, custo_liquido_material: comBloco ? 1440 : 1800,
})
const itemDoCusto = (materiais: ReturnType<typeof material>[]) => {
    const bruto = materiais.reduce((t, m) => t + m.custo_bruto_material, 0)
    const liquido = materiais.reduce((t, m) => t + m.custo_liquido_material, 0)
    return {
        materiais, cred_icms_pct: N, cred_pis_cofins_pct: N, cred_ipi_pct: N, nc_ipi_pct: N, cred_ibs_pct: N, cred_cbs_pct: N,
        custo_bruto_materiais: bruto, custo_liquido_materiais: liquido, tempo_fabricacao_min: 600, valor_minuto: 0.5, custo_fabricacao: 300, custo_liquido_total: liquido + 300,
    }
}
const falta = (item: number, caminho: 'perfil' | 'insumo' | 'vidro', motivo: string, extra: Linha = {}) => ({
    item, caminho, codigo_do_motor: `1318/WOLFF`, descricao_do_motor: 'PERSIANA DE PVC 37MM', cor: 'PRETO LISO', tipologia: 'DP-17', esquadria: item + 1, motivo, bloco: 'FORNECEDOR',
    frase: `[FORNECEDOR] 1318/WOLFF: ${motivo}`, candidatas: [{ codigo: '13181', descricao: 'PERSIANA' }], ...extra,
})
const peca = (codigo: string, extra: Linha = {}) => ({
    perfil: `${codigo}/WOLFF`, codigo, descricao: 'MARCO', comprimento_mm: 1215.5, quantidade_por_esquadria: 2, quantidade: 4, corte: '45S/45S', posicao: 'Largura',
    comprimento_barra_mm: 6000, serra_mm: 5, ...extra,
})

/** O orçamento de exemplo completo: dois itens, todas as resoluções nos três caminhos, com e sem o bloco tributário, todas as faltas e as peças. */
function exemploCompleto() {
    const resol = RESOLUCOES()
    const doItem1 = resol.map((r, k) => material(k + 1, r.startsWith('vidro') ? 'vidro' : k % 2 ? 'insumo' : 'perfil', r, k % 2 === 0))
    const doItem2 = [material(1, 'perfil', 'exato', true), material(2, 'insumo', 'referencia', false)]
    const motivos = R().MOTIVOS_DA_FALTA
    return {
        ok: true, itens: [itemDoCusto(doItem1), itemDoCusto(doItem2)], maoDeObra: { custoMensal: 1, minutosDaEmpresa: 2, valorDoMinuto: 0.5 },
        faltas: [
            ...motivos.map((m, k) => falta(k % 2, (['perfil', 'insumo', 'vidro'] as const)[k % 3], m)),
            // o texto que só cabe aparado: espaço nas pontas, longo demais, tipologia vazia, descrição e cor nulas
            falta(0, 'perfil', 'NAO_ACHADA', { codigo_do_motor: `  ${'X'.repeat(90)}  `, descricao_do_motor: null, cor: null, tipologia: '', frase: `${'f'.repeat(1200)} ` }),
        ],
        pecasPorItem: [[peca('9125'), peca('2575', { corte: '', posicao: null, descricao: '   ', comprimento_barra_mm: null }), peca(`${'P'.repeat(80)}`)], [peca('1352')]],
    }
}

function montar() {
    estado.db = {
        orcamentista_orcamento: [
            { id: O1, tenant_id: T, numero: 14, origem: 'agente', levantamento_id: 'lev-1', nome: 'Marcelo e rita preto liso', obs: null, editado_manualmente_em: null, editado_manualmente_por: null, criado_por: null,
                comissao_percentual: 5, comissao_modo: 'PROPORCIONAL', reserva_tecnica_percentual: 3, reserva_tecnica_responsavel: 'Arq. Marina', lucro_projetado_percentual: 20,
                // um orçamento JÁ PRECIFICADO: o recálculo anula a venda e a operação interna juntas (a CHECK de 16/11/2026)
                valor_total_bruto: 1, valor_total_liquido: 1, valor_venda: 2000, valor_operacao_interna: 1500, criado_em: 'x', atualizado_em: 'x' },
            { id: O2, tenant_id: T, numero: 15, origem: 'manual', levantamento_id: null, nome: 'Cliente na loja', obs: null, editado_manualmente_em: null, editado_manualmente_por: null, criado_por: 'u', criado_em: 'x', atualizado_em: 'x' },
        ],
        orcamentista_orcamento_item: [
            { id: 'i1', tenant_id: T, orcamento_id: O1, ordem: 1, levantamento_item_id: 'li-1', tipologia: 'DP-17', largura_mm: 1500, altura_mm: 1200, quantidade: 1, cor_perfil: 'PRETO LISO', vidro: '4 mm', obs: null },
            { id: 'i2', tenant_id: T, orcamento_id: O1, ordem: 2, levantamento_item_id: null, tipologia: 'DP-02', largura_mm: 800, altura_mm: 600, quantidade: 2, cor_perfil: 'PRETO LISO', vidro: null, obs: null },
            { id: 'i3', tenant_id: T, orcamento_id: O2, ordem: 1, levantamento_item_id: null, tipologia: 'DP-02', largura_mm: 900, altura_mm: 900, quantidade: 1, cor_perfil: 'BRANCO', vidro: null, obs: null },
            { id: 'i4', tenant_id: T, orcamento_id: O2, ordem: 2, levantamento_item_id: null, tipologia: 'DP-02', largura_mm: 900, altura_mm: 900, quantidade: 1, cor_perfil: 'BRANCO', vidro: null, obs: null },
        ],
        orcamentista_levantamento: [{ id: 'lev-1', tenant_id: T }],
        orcamentista_levantamento_item: [{ id: 'li-1', tenant_id: T, escolhas: { PP: 45 }, familia: 'PVC' }],
        orcamentista_orcamento_falta: [],
    }
    estado.escritas = []
    estado.custo = exemploCompleto()
}
beforeEach(montar)

const descreva = (v: { e: Escrita; c: CheckDoBanco }) =>
    `${v.e.tabela} (${v.e.op}) viola ${v.c.nome}: ${v.c.definicao} — com ${[...v.c.colunas].map((x) => `${x}=${JSON.stringify(v.e.linha[x] ?? null)}`).join(', ')}`
const violacoes = () => estado.escritas.flatMap((e) => violadas(CHECKS, e.tabela, e.linha, e.escritas).map((c) => descreva({ e, c })))

describe('(A) o retrato das CHECKs é o de produção, e a migração nova o obriga a ser medido de novo', () => {
    it('as 80 CHECKs das cinco tabelas, todas lidas pelo avaliador (forma desconhecida é erro, nunca "passa")', () => {
        expect(CHECKS).toHaveLength(80)
        expect(new Set(CHECKS.map((c) => c.tabela))).toEqual(new Set(TABELAS))
        expect(CHECKS.find((c) => c.nome === 'orcamentista_orcamento_calculo_versao_forma')!.definicao).toContain('char_length(calculo_versao) <= 40')
    })
    it('nenhuma migração DEPOIS do retrato mexe em CHECK das cinco tabelas — se mexer, meça o retrato de novo em produção', () => {
        const dir = join(process.cwd(), 'supabase', 'migrations')
        const depois = readdirSync(dir).filter((f) => /^\d{14}_.*\.sql$/.test(f) && f > RETRATO.ultima_migracao_do_repositorio).sort()
        const tocam = depois.filter((f) => {
            const sql = readFileSync(join(dir, f), 'utf8').replace(/--[^\n]*/g, '')
            return TABELAS.some((t) => new RegExp(`\\b${t}\\b`).test(sql)) && /\b(CHECK|ADD\s+CONSTRAINT|DROP\s+CONSTRAINT)\b/i.test(sql)
        })
        expect(tocam).toEqual([])
    })
    it('o contraste do (A): a regra ACHA a migração que toca CHECK de uma das cinco (o instrumento enxerga)', () => {
        const sql = 'ALTER TABLE public.orcamentista_orcamento ADD CONSTRAINT x CHECK (numero < 10);'
        expect(TABELAS.some((t) => new RegExp(`\\b${t}\\b`).test(sql)) && /\b(CHECK|ADD\s+CONSTRAINT|DROP\s+CONSTRAINT)\b/i.test(sql)).toBe(true)
    })
})

describe('(B) o avaliador, contra o banco: o que a CHECK recusa, ele recusa; NULL passa', () => {
    const versao = CHECKS.find((c) => c.nome === 'orcamentista_orcamento_calculo_versao_forma')!
    it('o caso de 26/11/2026: a versão de 48 caracteres VIOLA a CHECK; a de agora passa; nula passa', () => {
        expect(avaliar(versao.arvore, { calculo_versao: 'barras-unicas-pedido-total-peca-exata-2026-11-26' })).toBe(false)
        expect(avaliar(versao.arvore, { calculo_versao: C().VERSAO_DO_CALCULO })).toBe(true)
        expect(avaliar(versao.arvore, { calculo_versao: null })).toBe(true)
        expect(avaliar(versao.arvore, { calculo_versao: ' com espaço' })).toBe(false)
    })
    it('a lista de valores, a coerência entre colunas, o COALESCE, o round e o jsonb_typeof', () => {
        const de = (nome: string) => CHECKS.find((c) => c.nome === nome)!.arvore
        expect(avaliar(de('orcamentista_orcamento_item_material_resolucao_check'), { resolucao: 'referencia' })).toBe(true)
        expect(avaliar(de('orcamentista_orcamento_item_material_resolucao_check'), { resolucao: 'pela_cor' })).toBe(false)
        expect(avaliar(de('orcamentista_orcamento_operacao_interna_com_a_venda'), { valor_venda: null, valor_operacao_interna: 10 })).toBe(false)
        expect(avaliar(de('orcamentista_orcamento_aproveitamento_por'), { aproveitamento_origem: 'pedido_total', aproveitamento_por: null })).toBe(false)
        expect(avaliar(de('orcamentista_orcamento_aproveitamento_por'), { aproveitamento_origem: null, aproveitamento_por: null })).toBe(true)
        expect(avaliar(de('orcamentista_orcamento_aproveitamento_fallback'), { aproveitamento_origem: 'consumo_do_item', aproveitamento_modo: 'COM' })).toBe(false)
        expect(avaliar(de('orcamentista_orcamento_operacao_interna_ao_centavo'), { valor_operacao_interna: 10.005 })).toBe(false)
        expect(avaliar(de('orcamentista_orcamento_operacao_interna_ao_centavo'), { valor_operacao_interna: 10.01 })).toBe(true)
        expect(avaliar(de('orcamentista_orcamento_falta_candidatas_lista'), { candidatas: {} })).toBe(false)
        expect(avaliar(de('orcamentista_orcamento_falta_candidatas_lista'), { candidatas: [] })).toBe(true)
        expect(avaliar(de('orcamentista_orcamento_uf_destino_do_escopo'), { sale_scope: 'INTERESTADUAL', uf_destino: null })).toBe(false)
        expect(avaliar(de('orcamentista_orcamento_falta_codigo_forma'), { codigo_do_motor: 'X'.repeat(61) })).toBe(false)
        expect(avaliar(de('orcamentista_orcamento_item_material_falta_nomeada'), { cred_icms_pct: 12, cred_pis_cofins_pct: 9.25, cred_ipi_pct: 6.5, credito_nao_apurado: 'x' })).toBe(false)
    })
    it('a forma que ele não conhece é ERRO nomeado, nunca "passa"', () => {
        expect(() => lerCheck('CHECK ((x @> y))')).toThrow(CheckQueNaoSeiAvaliar)
        expect(() => avaliar(lerCheck('CHECK (outra_funcao(x))'), { x: 1 })).toThrow(/outra_funcao/)
    })
})

describe('(C) o cálculo de um orçamento completo: NENHUMA linha que ele grava seria recusada pelo banco', () => {
    it('o modo padrão (consumo do item), num orçamento já precificado: material, falta, peça, item e orçamento passam em todas as CHECKs', async () => {
        await K().calcularOrcamento(T, O1, new Date('2026-11-26T22:14:38Z'), () => 'calc-1')
        const tabelasEscritas = new Set(estado.escritas.map((e) => e.tabela))
        expect(tabelasEscritas).toEqual(new Set(TABELAS))
        expect(violacoes()).toEqual([])
    })
    it('o pedido total, escolhido pelo vendedor', async () => {
        await K().calcularOrcamento(T, O1, new Date('2026-11-26T22:14:38Z'), () => 'calc-2', { modo: 'pedido_total', por: 'remetente-1' })
        expect(estado.escritas.some((e) => e.tabela === 'orcamentista_orcamento' && e.linha.aproveitamento_origem === 'pedido_total')).toBe(true)
        expect(violacoes()).toEqual([])
    })
    it('o orçamento manual (sem levantamento): também passa', async () => {
        estado.custo = { ...exemploCompleto(), itens: exemploCompleto().itens, faltas: [], pecasPorItem: [[], []] }
        await K().calcularOrcamento(T, O2, new Date('2026-11-26T22:14:38Z'), () => 'calc-3')
        expect(violacoes()).toEqual([])
    })
    it('o exemplo cobre o que o código pode gravar: toda resolução, todo caminho e todo motivo de falta', async () => {
        await K().calcularOrcamento(T, O1, new Date(), () => 'calc-4')
        const do_ = (t: string, c: string) => new Set(estado.escritas.filter((e) => e.tabela === t).map((e) => e.linha[c]))
        expect(do_('orcamentista_orcamento_item_material', 'resolucao')).toEqual(new Set(RESOLUCOES()))
        expect(do_('orcamentista_orcamento_item_material', 'caminho')).toEqual(new Set(['perfil', 'insumo', 'vidro']))
        expect(do_('orcamentista_orcamento_falta', 'motivo')).toEqual(new Set(R().MOTIVOS_DA_FALTA))
    })
})

describe('(D) o contraste: o portão fica VERMELHO quando o cálculo monta uma linha que o banco recusaria', () => {
    it('a versão de 26/11/2026 (48 caracteres) aparece nomeada pela CHECK', async () => {
        await K().calcularOrcamento(T, O1, new Date(), () => 'calc-5')
        const doOrcamento = estado.escritas.filter((e) => e.tabela === 'orcamentista_orcamento' && 'calculo_versao' in e.linha)
        expect(doOrcamento.length).toBeGreaterThan(0)
        // a linha gravada com a versão de antes: o portão nomeia a CHECK
        const comAVelha = { ...doOrcamento.at(-1)!, linha: { ...doOrcamento.at(-1)!.linha, calculo_versao: 'barras-unicas-pedido-total-peca-exata-2026-11-26' } }
        expect(violadas(CHECKS, comAVelha.tabela, comAVelha.linha, comAVelha.escritas).map((c) => c.nome)).toEqual(['orcamentista_orcamento_calculo_versao_forma'])
    })
    it('uma resolução nova que o banco não conhece, uma falta com a candidata em objeto e a peça de comprimento zero: cada uma nomeada', async () => {
        const c = exemploCompleto()
        c.itens[1].materiais[0] = { ...c.itens[1].materiais[0], resolucao: 'pela_cor' }
        c.faltas[0] = { ...c.faltas[0], candidatas: {} as never }
        c.pecasPorItem[1][0] = peca('1352', { comprimento_mm: 0 })
        estado.custo = c
        await K().calcularOrcamento(T, O1, new Date(), () => 'calc-6')
        const nomes = estado.escritas.flatMap((e) => violadas(CHECKS, e.tabela, e.linha, e.escritas).map((x) => x.nome))
        expect(new Set(nomes)).toEqual(new Set(['orcamentista_orcamento_item_material_resolucao_check', 'orcamentista_orcamento_falta_candidatas_lista', 'orcamentista_orcamento_item_peca_comprimento_positivo']))
    })
})
