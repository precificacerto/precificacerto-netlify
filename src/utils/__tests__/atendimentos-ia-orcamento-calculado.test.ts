/**
 * @jest-environment node
 *
 * PORTÃO — CALCULAR E GRAVAR o orçamento I.A. (o 1b, dono do produto, 09/11/2026): `POST /api/atendimentos-ia/orcamentos/[id]/calcular` e
 * `calcularOrcamento`. O cálculo (`custoDoLevantamento`) é substituído aqui por um resultado fixo — o caminho completo dele tem portão
 * próprio, com a reconciliação da D2, em `levantamento-da-conversa.test.ts` (ORC). Aqui se afirma o que é EMITIDO ao banco:
 *   (1) a ordem: o material (um cálculo novo) antes do item, o item antes do orçamento — nenhum número sem origem;
 *   (2) o tenant em toda leitura e escrita; o orçamento de outra empresa é 404 e nada é calculado;
 *   (3) as escolhas e a família do item do levantamento chegam ao cálculo; os percentuais congelados do levantamento chegam ao orçamento;
 *   (4) o fallback do modo, com origem e motivo; os totais; o valor de venda NÃO é gravado aqui;
 *   (5) a recusa do cálculo é 422 com as faltas, e nada é gravado; sem a migração, 503 com a frase; só POST, e só quem edita.
 */
import type { NextApiRequest, NextApiResponse } from 'next'

type Linha = Record<string, unknown>
interface Operacao { tabela: string; op: string; carga?: unknown; filtros: [string, string, unknown][] }

const T = 'tenant-da-conta'
const OUTRO = 'tenant-de-outra-conta'
const O1 = '30000000-0000-4000-8000-000000000001'
const O2 = '30000000-0000-4000-8000-000000000002'
const O_OUTRA = '30000000-0000-4000-8000-000000000009'

const estado = {
    db: {} as Record<string, Linha[]>,
    ops: [] as Operacao[],
    papel: 'admin',
    /** o erro da N-ésima operação de `tabela:op`; `null` na fila é uma operação que passa */
    erros: {} as Record<string, Array<{ code: string; message: string } | null>>,
    custo: null as unknown,
    chamadasDoCusto: [] as Array<{ tenant: string; lev: { nome: string; itens: Linha[] } }>,
    /** os ids que o update não atinge (a linha que sumiu entre a leitura e a escrita) */
    naoAtinge: [] as string[],
    /** as famílias da empresa como `lerFamiliasDaEmpresa` as daria: as tabelas de preço VIGENTES de cada uma */
    familias: [] as Array<{ familia: string; tabelasDePreco: string[] }>,
}

function executar(tabela: string, op: string, carga: unknown, filtros: [string, string, unknown][], colunas: string | null, ordem: [string, boolean] | null) {
    estado.ops.push({ tabela, op, carga, filtros })
    const erro = estado.erros[`${tabela}:${op}`]?.shift()
    if (erro) return { data: null as unknown, error: erro }
    const linhas = (estado.db[tabela] ??= [])
    const casa = (l: Linha) => filtros.every(([tipo, c, v]) => (tipo === 'in' ? (v as unknown[]).includes(l[c]) : tipo === 'is' ? (l[c] ?? null) === v : l[c] === v))
    const projetar = (l: Linha) => (colunas === null || colunas === '*' ? { ...l } : Object.fromEntries(colunas.split(',').map((c) => c.trim()).map((c) => [c, l[c]])))
    if (op === 'select') {
        let r = linhas.filter(casa)
        if (ordem) r = [...r].sort((a, b) => ((a[ordem[0]] as number) - (b[ordem[0]] as number)) * (ordem[1] ? 1 : -1))
        return { data: r.map(projetar), error: null }
    }
    // como o PostgREST com `.select()`: o update devolve as linhas atingidas
    if (op === 'update') { const r = linhas.filter(casa).filter((l) => !estado.naoAtinge.includes(l.id as string)); r.forEach((l) => Object.assign(l, carga as Linha)); return { data: r.map(projetar), error: null } }
    const novas = (Array.isArray(carga) ? carga : [carga]) as Linha[]
    linhas.push(...novas.map((l) => ({ ...l })))
    return { data: novas, error: null }
}
function cliente() {
    return {
        from: (tabela: string) => {
            const filtros: [string, string, unknown][] = []
            let op = 'select'
            let carga: unknown
            let colunas: string | null = null
            let ordem: [string, boolean] | null = null
            const q: Record<string, unknown> = {}
            const rodar = () => Promise.resolve(executar(tabela, op, carga, filtros, colunas, ordem))
            q.select = (c?: string) => { colunas = c ?? '*'; return q }
            q.order = (c: string, o?: { ascending?: boolean }) => { ordem = [c, o?.ascending !== false]; return q }
            q.limit = () => q
            q.eq = (c: string, v: unknown) => { filtros.push(['eq', c, v]); return q }
            // o `.is(coluna, null)` do PostgREST: a coluna nula (ou ausente na linha de teste, como a `removido_em` de antes da 20261113000002)
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
jest.mock('@/lib/get-caller-tenant', () => ({
    getCallerContext: async () => ({ user_id: 'usuario-logado', tenant_id: T, role: estado.papel, is_super_admin: false }),
}))
jest.mock('@/lib/atendimentos-ia/levantamento-da-conversa', () => ({ lerFamiliasDaEmpresa: async (): Promise<unknown> => ({ ok: true, familias: estado.familias, candidatos: [] }) }))
jest.mock('@/lib/atendimentos-ia/custo-do-orcamento-servidor', () => ({
    custoDoLevantamento: async (tenant: string, _fonte: unknown, lev: { nome: string; itens: Linha[] }) => {
        estado.chamadasDoCusto.push({ tenant, lev })
        return estado.custo
    },
}))

/* eslint-disable @typescript-eslint/no-require-imports */
const rota = require('@/pages/api/atendimentos-ia/orcamentos/[id]/calcular').default
const K = () => require('@/lib/atendimentos-ia/orcamento-calculado') as typeof import('@/lib/atendimentos-ia/orcamento-calculado')
const C = () => require('@/lib/atendimentos-ia/custo-do-orcamento') as typeof import('@/lib/atendimentos-ia/custo-do-orcamento')
/* eslint-enable @typescript-eslint/no-require-imports */

type Rota = (req: NextApiRequest, res: NextApiResponse) => Promise<unknown>
async function chamar(r: Rota, method: string, id: string) {
    const saida = { status: 0, corpo: {} as Record<string, unknown> }
    const res = { status(n: number) { saida.status = n; return res }, json(b: Record<string, unknown>) { saida.corpo = b; return res }, end() { return res }, setHeader() { return res } } as unknown as NextApiResponse
    await r({ method, body: {}, query: { id }, headers: {}, cookies: {} } as unknown as NextApiRequest, res)
    return saida
}
const escritas = () => estado.ops.filter((o) => o.op !== 'select')

const N = null as number | null
const linhaDeMaterial = (codigo: string, bruto: number) => ({
    ordem: 1, caminho: 'perfil', codigo, codigo_na_tabela: codigo, resolucao: 'exato', descricao: `PERFIL ${codigo}`, unidade_compra: 'BR', medida_unidade: 6, custo_bruto_unidade: 600,
    cred_icms_pct: N, cred_pis_cofins_pct: N, cred_ipi_pct: N, nc_ipi_pct: N, cred_ibs_pct: N, cred_cbs_pct: N,
    credito_nao_apurado: 'faltou no bloco tributario: cred_icms_pct, cred_pis_cofins_pct, o par do IPI (cred_ipi_pct ou nc_ipi_pct)',
    custo_liquido_unidade: 600, custo_liquido_fracao: 100, consumo_item: 3, custo_bruto_material: bruto, custo_liquido_material: bruto,
})
const itemDoCusto = (bruto: number, minutos: number) => ({
    materiais: [linhaDeMaterial('A', bruto)],
    cred_icms_pct: N, cred_pis_cofins_pct: N, cred_ipi_pct: N, nc_ipi_pct: N, cred_ibs_pct: N, cred_cbs_pct: N,
    custo_bruto_materiais: bruto, custo_liquido_materiais: bruto, tempo_fabricacao_min: minutos, valor_minuto: 0.5, custo_fabricacao: minutos * 0.5,
    custo_liquido_total: bruto + minutos * 0.5,
})

function montar() {
    estado.db = {
        orcamentista_config: [{ tenant_id: T, ativo: true }, { tenant_id: OUTRO, ativo: true }],
        user_module_permissions: [],
        orcamentista_orcamento: [
            { id: O1, tenant_id: T, numero: 1, origem: 'agente', levantamento_id: 'lev-1', nome: 'Antonio Rock', obs: null, editado_manualmente_em: null, editado_manualmente_por: null, criado_por: null, criado_em: 'x', atualizado_em: 'x' },
            { id: O2, tenant_id: T, numero: 2, origem: 'manual', levantamento_id: null, nome: 'Cliente na loja', obs: null, editado_manualmente_em: null, editado_manualmente_por: null, criado_por: 'u', criado_em: 'x', atualizado_em: 'x' },
            { id: O_OUTRA, tenant_id: OUTRO, numero: 7, origem: 'manual', levantamento_id: null, nome: 'Outra', obs: null, editado_manualmente_em: null, editado_manualmente_por: null, criado_por: 'x', criado_em: 'x', atualizado_em: 'x' },
        ],
        orcamentista_orcamento_item: [
            { id: 'i1', tenant_id: T, orcamento_id: O1, ordem: 1, levantamento_item_id: 'li-1', tipologia: 'DP-02', largura_mm: 1200, altura_mm: 1000, quantidade: 1, cor_perfil: 'BRANCO', vidro: '4 mm', obs: null },
            { id: 'i2', tenant_id: T, orcamento_id: O1, ordem: 2, levantamento_item_id: null, tipologia: 'DP-02', largura_mm: 800, altura_mm: 600, quantidade: 2, cor_perfil: 'BRANCO', vidro: null, obs: null },
            { id: 'i3', tenant_id: T, orcamento_id: O2, ordem: 1, levantamento_item_id: null, tipologia: 'DP-02', largura_mm: 900, altura_mm: 900, quantidade: 1, cor_perfil: 'BRANCO', vidro: null, obs: null },
            { id: 'i9', tenant_id: OUTRO, orcamento_id: O_OUTRA, ordem: 1, levantamento_item_id: null, tipologia: 'DP-02', largura_mm: 1, altura_mm: 1, quantidade: 1, cor_perfil: null, vidro: null, obs: null },
        ],
        orcamentista_levantamento: [{ id: 'lev-1', tenant_id: T, comissao_percentual: 5, comissao_modo: 'PROPORCIONAL', reserva_tecnica_percentual: 3, reserva_tecnica_responsavel: 'Arq. Marina', lucro_projetado_percentual: 20 }],
        orcamentista_levantamento_item: [
            { id: 'li-1', tenant_id: T, escolhas: { ARI: 4 }, familia: 'PVC' },
            // o MESMO id em outra empresa: a leitura com o tenant não o enxerga
            { id: 'li-1', tenant_id: OUTRO, escolhas: { ARI: 1 }, familia: 'ALUMINIO' },
        ],
    }
    estado.ops = []
    estado.erros = {}
    estado.papel = 'admin'
    estado.chamadasDoCusto = []
    estado.naoAtinge = []
    estado.familias = []
    estado.custo = { ok: true, itens: [itemDoCusto(450, 120), itemDoCusto(250, 60)], maoDeObra: { custoMensal: 1, minutosDaEmpresa: 2, valorDoMinuto: 0.5 }, faltas: [] }
}
beforeEach(montar)

describe('(1) a ordem da escrita e o que cada passo grava', () => {
    it('o material com um cálculo novo, depois cada item apontando o cálculo, depois o orçamento — e o tenant em todas', async () => {
        const r = await K().calcularOrcamento(T, O1, new Date('2026-11-09T15:00:00Z'), () => 'calc-novo')
        const w = escritas()
        expect(w.map((o) => `${o.tabela}:${o.op}`)).toEqual([
            'orcamentista_orcamento:update', 'orcamentista_orcamento_item_material:insert', 'orcamentista_orcamento_item:update', 'orcamentista_orcamento_item:update', 'orcamentista_orcamento:update',
        ])
        // 0. antes de qualquer número novo, os totais e o valor de venda do cálculo de antes deixam de valer
        expect(w[0].carga).toMatchObject({ valor_total_bruto: null, valor_total_liquido: null, valor_venda: null })
        expect(w[0].filtros).toEqual([['eq', 'tenant_id', T], ['eq', 'id', O1]])
        w.shift()
        const material = w[0].carga as Linha[]
        expect(material.map((m) => [m.tenant_id, m.orcamento_item_id, m.calculo_id, m.codigo])).toEqual([[T, 'i1', 'calc-novo', 'A'], [T, 'i2', 'calc-novo', 'A']])
        for (const o of w.slice(1)) expect(o.filtros).toContainEqual(['eq', 'tenant_id', T])
        expect(w[1].filtros).toEqual([['eq', 'tenant_id', T], ['eq', 'orcamento_id', O1], ['eq', 'id', 'i1']])
        expect(w[1].carga).toMatchObject({ calculo_id: 'calc-novo', calculado_em: '2026-11-09T15:00:00.000Z', custo_bruto_materiais: 450, custo_liquido_total: 510, tempo_fabricacao_min: 120 })
        expect(r.calculo_id).toBe('calc-novo')
        expect(r.itens.map((i) => i.id)).toEqual(['i1', 'i2'])
    })
    it('o orçamento: o fallback do modo, com origem e motivo; os totais; NÃO os percentuais (a travessia os congela, 11/11/2026) e NÃO o valor de venda', async () => {
        await K().calcularOrcamento(T, O1, new Date('2026-11-09T15:00:00Z'), () => 'calc-novo')
        const carga = escritas().filter((o) => o.tabela === 'orcamentista_orcamento').pop()!.carga as Linha
        expect(carga).toMatchObject({
            aproveitamento_modo: 'SEM', aproveitamento_origem: 'fallback_barra_inteira', aproveitamento_motivo: C().MOTIVO_DO_FALLBACK, aproveitamento_por: null,
            valor_total_bruto: 450 + 60 + 250 + 30, valor_total_liquido: 510 + 280,
        })
        // regravá-los do levantamento devolvia o nulo que a regra do zero resolveu e apagava a alteração feita no orçamento
        for (const c of ['comissao_percentual', 'comissao_modo', 'reserva_tecnica_percentual', 'reserva_tecnica_responsavel', 'lucro_projetado_percentual']) expect(Object.keys(carga)).not.toContain(c)
        expect(estado.ops.some((o) => o.tabela === 'orcamentista_levantamento')).toBe(false)
        expect('valor_venda' in carga).toBe(false)
        expect('editado_manualmente_em' in carga).toBe(false)
    })
    it('o manual: sem levantamento, nenhum congelado é escrito (nem como nulo)', async () => {
        estado.custo = { ok: true, itens: [itemDoCusto(300, 30)], maoDeObra: { custoMensal: 1, minutosDaEmpresa: 2, valorDoMinuto: 0.5 }, faltas: [] }
        await K().calcularOrcamento(T, O2, new Date(), () => 'c2')
        const carga = escritas().filter((o) => o.tabela === 'orcamentista_orcamento').pop()!.carga as Linha
        expect('comissao_percentual' in carga).toBe(false)
        expect(estado.chamadasDoCusto[0].lev.itens[0]).toMatchObject({ escolhas: null, familia: null })
    })
})

describe('(2) o que chega ao cálculo', () => {
    it('as esquadrias do orçamento, na ordem, com as escolhas e a família do item do levantamento DESTA empresa', async () => {
        await K().calcularOrcamento(T, O1, new Date(), () => 'c')
        const { tenant, lev } = estado.chamadasDoCusto[0]
        expect(tenant).toBe(T)
        expect(lev.nome).toBe('Antonio Rock')
        expect(lev.itens).toEqual([
            { ordem: 1, tipologia: 'DP-02', largura_mm: 1200, altura_mm: 1000, quantidade: 1, cor_perfil: 'BRANCO', vidro: '4 mm', vidro_codigo: null, escolhas: { ARI: 4 }, familia: 'PVC' },
            { ordem: 2, tipologia: 'DP-02', largura_mm: 800, altura_mm: 600, quantidade: 2, cor_perfil: 'BRANCO', vidro: null, vidro_codigo: null, escolhas: null, familia: null },
        ])
        const leitura = estado.ops.find((o) => o.tabela === 'orcamentista_levantamento_item')!
        expect(leitura.filtros).toContainEqual(['eq', 'tenant_id', T])
    })
})

describe('(2c) o item removido e a família gravada (20261113000002)', () => {
    it('o item REMOVIDO não vai ao cálculo nem é tocado; cada item calculado grava a FAMÍLIA com que foi calculado (nula quando o levantamento não tem)', async () => {
        const i1 = estado.db.orcamentista_orcamento_item.find((i) => i.id === 'i1')!
        estado.db.orcamentista_orcamento_item.push({ ...i1, id: 'i-removido', ordem: 9, calculo_id: null, removido_em: '2026-11-13T12:00:00.000Z' })
        await K().calcularOrcamento(T, O1, new Date(), () => 'c')
        expect(estado.chamadasDoCusto[0].lev.itens.map((i: { ordem: number }) => i.ordem)).toEqual([1, 2])
        const linha = (id: string) => estado.db.orcamentista_orcamento_item.find((i) => i.id === id)!
        expect(linha('i1')).toEqual(expect.objectContaining({ calculo_id: 'c', familia: 'PVC' }))
        expect(linha('i2')).toEqual(expect.objectContaining({ calculo_id: 'c', familia: null }))
        expect(linha('i-removido').calculo_id).toBeNull()
    })
})

describe('(2b) a tabela é a VIGENTE; a congelada no levantamento só AVISA (dono do produto, 10/11/2026)', () => {
    const comCongelada = (tabela_id: string | null) => {
        estado.db.orcamentista_levantamento_item[0] = { ...estado.db.orcamentista_levantamento_item[0], tabela_id }
        estado.familias = [{ familia: 'PVC', tabelasDePreco: ['tab-nova'] }]
        estado.db.orcamentista_tabela = [{ id: 'tab-velha', arquivo_nome: 'Wolff-velha.xlsx' }, { id: 'tab-nova', arquivo_nome: 'Wolff-nova.xlsx' }]
        // o código A na congelada: R$ 700 a barra (na vigente, R$ 600), sem bloco tributário — o líquido é o bruto, e nunca barateia
        estado.db.orcamentista_tabela_item = [{ tabela_id: 'tab-velha', codigo: 'A', valor_barra_interno: 700, cred_icms_pct: null, cred_pis_cofins_pct: null, cred_ipi_pct: null, nc_ipi_pct: null, cred_ibs_pct: null, cred_cbs_pct: null }]
    }
    it('o item congelou uma tabela que não é a vigente: o aviso nomeia as duas e a diferença, com a mesma quantidade; a rota o devolve', async () => {
        comCongelada('tab-velha')
        const r = await chamar(rota, 'POST', O1)
        expect(r.status).toBe(200)
        // 450 de bruto na vigente = 0,75 barra de R$ 600; na congelada, 0,75 × 700 = R$ 525
        expect(r.corpo.avisos).toEqual(['Item 1: o levantamento congelou a tabela "Wolff-velha.xlsx"; o cálculo usou a vigente (Wolff-nova.xlsx).'
            + ' Com os mesmos materiais, na tabela congelada o custo seria R$ 525,00 bruto e R$ 525,00 líquido, contra R$ 450,00 e R$ 450,00 na vigente (diferença −R$ 75,00 no líquido).'])
        // o preço gravado é o da VIGENTE: o aviso não muda nada do que foi calculado
        expect(estado.db.orcamentista_orcamento.find((o) => o.id === O1)!.valor_total_bruto).toBe(450 + 60 + 250 + 30)
    })
    it('sem tabela congelada (os itens de produção): nenhum aviso, e a tabela congelada nem é lida', async () => {
        comCongelada(null)
        const r = await chamar(rota, 'POST', O1)
        expect(r.corpo.avisos).toEqual([])
        expect(estado.ops.some((o) => o.tabela === 'orcamentista_tabela_item' || o.tabela === 'orcamentista_tabela')).toBe(false)
    })
    it('a congelada é a vigente: nenhum aviso', async () => {
        comCongelada('tab-nova')
        expect((await chamar(rota, 'POST', O1)).corpo.avisos).toEqual([])
    })
})

describe('(3) a rota', () => {
    it('200 com o cálculo', async () => {
        const s = await chamar(rota, 'POST', O1)
        expect(s.status).toBe(200)
        expect((s.corpo.calculo as Linha).valor_total_liquido).toBe(790)
    })
    it('a recusa do cálculo: 422 com as faltas nomeadas, e NADA é gravado', async () => {
        estado.custo = { ok: false, recusas: ['o valor da barra do código B, na tabela de preço'] }
        const s = await chamar(rota, 'POST', O1)
        expect(s.status).toBe(422)
        expect(s.corpo).toEqual({ error: 'O orçamento não foi calculado: falta o que está abaixo, e nada foi gravado.', recusas: ['o valor da barra do código B, na tabela de preço'] })
        expect(escritas()).toEqual([])
    })
    it('o orçamento de OUTRA empresa: 404, e nada é calculado nem gravado', async () => {
        const s = await chamar(rota, 'POST', O_OUTRA)
        expect(s.status).toBe(404)
        expect(estado.chamadasDoCusto).toEqual([])
        expect(escritas()).toEqual([])
    })
    it('sem a migração (a coluna do item não existe): 503 com a frase das duas migrações', async () => {
        estado.erros['orcamentista_orcamento_item:update'] = [{ code: '42703', message: 'column "calculo_id" does not exist' }]
        const s = await chamar(rota, 'POST', O1)
        expect(s.status).toBe(503)
        expect(s.corpo).toEqual({ error: K().FRASE_SEM_MIGRACAO_DO_CALCULO, sem_migracao: true })
    })
    it('A FOTOGRAFIA DA RESOLUÇÃO (12/11/2026): o material grava o código na tabela, como achou e o caminho', async () => {
        const r = await K().calcularOrcamento(T, O1, new Date('2026-11-09T15:00:00Z'), () => 'calc-novo')
        const material = escritas().find((o) => o.op === 'insert')!.carga as Linha[]
        expect(material.map((m) => [m.codigo, m.codigo_na_tabela, m.resolucao, m.caminho])).toEqual([['A', 'A', 'exato', 'perfil'], ['A', 'A', 'exato', 'perfil']])
        expect(r.fotografia_da_resolucao).toBe('gravada')
        expect([r.parcial, r.faltas]).toEqual([false, []])
    })
    it('SEM A 20261112000006 (faltam só as colunas da resolução e do caminho) e o material TODO de perfil: gravado sem elas, e o resultado diz sem_migracao', async () => {
        estado.erros['orcamentista_orcamento_item_material:insert'] = [{ code: 'PGRST204', message: "Could not find the 'caminho' column of 'orcamentista_orcamento_item_material' in the schema cache" }]
        const r = await K().calcularOrcamento(T, O1, new Date('2026-11-09T15:00:00Z'), () => 'calc-novo')
        const inserts = escritas().filter((o) => o.op === 'insert')
        expect(inserts).toHaveLength(2)
        expect((inserts[1].carga as Linha[]).every((m) => !('codigo_na_tabela' in m) && !('resolucao' in m) && !('caminho' in m))).toBe(true)
        expect((inserts[1].carga as Linha[]).map((m) => m.codigo)).toEqual(['A', 'A'])
        expect(r.fotografia_da_resolucao).toBe('sem_migracao')
    })
    it('SEM A 20261112000006 e com INSUMO no material: recusa nomeada — sem o caminho, o insumo se leria como perfil', async () => {
        estado.custo = { ...(estado.custo as Linha), itens: [itemDoCusto(450, 120), { ...itemDoCusto(250, 60), materiais: [{ ...linhaDeMaterial('A', 250), caminho: 'insumo' }] }] }
        estado.erros['orcamentista_orcamento_item_material:insert'] = [{ code: 'PGRST204', message: "Could not find the 'caminho' column of 'orcamentista_orcamento_item_material' in the schema cache" }]
        await expect(K().calcularOrcamento(T, O1, new Date(), () => 'c')).rejects.toMatchObject({ recusas: [K().FRASE_SEM_MIGRACAO_DOS_CAMINHOS] })
        expect(escritas().filter((o) => o.op === 'insert')).toHaveLength(1)
    })
    it('outra coluna ausente no material continua sendo a recusa de sempre (503): a defesa é SÓ para as duas da resolução', async () => {
        estado.erros['orcamentista_orcamento_item_material:insert'] = [{ code: 'PGRST204', message: "Could not find the 'cred_ibs_pct' column of 'orcamentista_orcamento_item_material' in the schema cache" }]
        const s = await chamar(rota, 'POST', O1)
        expect(s.status).toBe(503)
        expect(escritas().filter((o) => o.op === 'insert')).toHaveLength(1)
    })
    it('sem a tabela do material: 503 com a mesma frase', async () => {
        estado.erros['orcamentista_orcamento_item_material:insert'] = [{ code: 'PGRST205', message: "Could not find the table 'public.orcamentista_orcamento_item_material'" }]
        const s = await chamar(rota, 'POST', O1)
        expect(s.status).toBe(503)
        expect(s.corpo.error).toBe(K().FRASE_SEM_MIGRACAO_DO_CALCULO)
    })
    it('o item que não foi atingido (sumiu entre a leitura e a escrita): erro que diz o que ficou, e os totais ficam NULOS', async () => {
        estado.naoAtinge = ['i2']
        await expect(K().calcularOrcamento(T, O1, new Date(), () => 'c')).rejects.toThrow('o item i2 não foi atualizado (o cálculo c ficou gravado no material)')
        const orc = estado.db.orcamentista_orcamento.find((o) => o.id === O1)!
        expect([orc.valor_total_bruto, orc.valor_total_liquido, orc.valor_venda]).toEqual([null, null, null])
    })
    it('a FALHA NO PASSO 3, com os itens novos gravados: os totais do orçamento ficam NULOS — nunca os do cálculo anterior', async () => {
        // o cálculo anterior deixou totais e um valor de venda; o passo 0 passa, o passo 3 falha
        Object.assign(estado.db.orcamentista_orcamento.find((o) => o.id === O1)!, { valor_total_bruto: 999, valor_total_liquido: 888, valor_venda: 1200 })
        estado.erros['orcamentista_orcamento:update'] = [null, { code: 'XX000', message: 'a conexão caiu' }]
        await expect(K().calcularOrcamento(T, O1, new Date(), () => 'c')).rejects.toThrow('orcamentista_orcamento: a conexão caiu')
        const orc = estado.db.orcamentista_orcamento.find((o) => o.id === O1)!
        expect([orc.valor_total_bruto, orc.valor_total_liquido, orc.valor_venda]).toEqual([null, null, null])
        // os itens, esses, já apontam o cálculo novo: é o estado que a tela mostra como "cálculo incompleto — recalcule"
        const itens = estado.db.orcamentista_orcamento_item.filter((i) => i.orcamento_id === O1)
        expect(itens.map((i) => [i.calculo_id, i.custo_liquido_total])).toEqual([['c', 510], ['c', 280]])
    })
    it('o orçamento que não é atingido no passo 0: nada é gravado', async () => {
        estado.naoAtinge = [O1]
        await expect(K().calcularOrcamento(T, O1, new Date(), () => 'c')).rejects.toThrow('não foi atingido ao anular os totais; nada foi gravado')
        expect(escritas().filter((o) => o.op === 'insert')).toEqual([])
    })
    it('o id que não é uuid: 404 SEM ler o banco do orçamento', async () => {
        const s = await chamar(rota, 'POST', 'nao-e-uuid')
        expect(s.status).toBe(404)
        expect(estado.ops.some((o) => o.tabela.startsWith('orcamentista_orcamento'))).toBe(false)
    })
    it.each(['GET', 'PATCH', 'DELETE'])('%s: 405', async (m) => {
        expect((await chamar(rota, m, O1)).status).toBe(405)
    })
    it('quem só VÊ o módulo não calcula: 403', async () => {
        estado.papel = 'seller'
        estado.db.user_module_permissions = [{ user_id: 'usuario-logado', tenant_id: T, module: 'orcamentista', can_view: true, can_edit: false }]
        const s = await chamar(rota, 'POST', O1)
        expect(s.status).toBe(403)
        expect(estado.chamadasDoCusto).toEqual([])
    })
    it('o contraste: quem EDITA o módulo calcula', async () => {
        estado.papel = 'seller'
        estado.db.user_module_permissions = [{ user_id: 'usuario-logado', tenant_id: T, module: 'orcamentista', can_view: true, can_edit: true }]
        expect((await chamar(rota, 'POST', O1)).status).toBe(200)
    })
    it('o orçamento sem nenhum item: 422 nomeando a falta', async () => {
        estado.db.orcamentista_orcamento_item = estado.db.orcamentista_orcamento_item.filter((i) => i.orcamento_id !== O2)
        const s = await chamar(rota, 'POST', O2)
        expect(s.status).toBe(422)
        expect(s.corpo.recusas).toEqual(['os itens do orçamento: ele não tem nenhum'])
    })
})

describe('(4) A FALTA NOMEADA (12/11/2026, 1.4): gravada com o cálculo, e o orçamento PARCIAL', () => {
    const falta = (item: number, codigo: string, extra: Linha = {}) => ({
        item, caminho: 'perfil', codigo_do_motor: codigo, descricao_do_motor: 'MARCO', cor: 'BRANCO', tipologia: 'DP-02', esquadria: item + 1, motivo: 'NAO_ACHADA',
        frase: `${codigo} não está na tabela de preço`, candidatas: [] as unknown[], ...extra,
    })
    it('as faltas vão para orcamentista_orcamento_falta DEPOIS do material, com o mesmo cálculo e a ordem por item', async () => {
        estado.custo = { ...(estado.custo as Linha), faltas: [falta(0, 'SF92/WOLFF'), falta(1, 'HF88/WOLFF'), falta(1, 'IL36/WOLFF')] }
        const r = await K().calcularOrcamento(T, O1, new Date(), () => 'calc-f')
        const w = escritas().map((o) => `${o.tabela}:${o.op}`)
        expect(w.indexOf('orcamentista_orcamento_falta:insert')).toBe(w.indexOf('orcamentista_orcamento_item_material:insert') + 1)
        const linhas = escritas().find((o) => o.tabela === 'orcamentista_orcamento_falta')!.carga as Linha[]
        expect(linhas.map((l) => [l.tenant_id, l.orcamento_item_id, l.calculo_id, l.ordem, l.codigo_do_motor])).toEqual([
            [T, 'i1', 'calc-f', 1, 'SF92/WOLFF'], [T, 'i2', 'calc-f', 1, 'HF88/WOLFF'], [T, 'i2', 'calc-f', 2, 'IL36/WOLFF'],
        ])
        expect(r.parcial).toBe(true)
        expect(r.faltas).toHaveLength(3)
    })
    it('o texto que a CHECK não aceita é aparado: sem espaço nas pontas e no tamanho; a tipologia vazia ganha o rótulo', async () => {
        estado.custo = { ...(estado.custo as Linha), faltas: [falta(0, ` ${'X'.repeat(80)} `, { tipologia: '', frase: 'a'.repeat(1200) })] }
        await K().calcularOrcamento(T, O1, new Date(), () => 'c')
        const [l] = escritas().find((o) => o.tabela === 'orcamentista_orcamento_falta')!.carga as Linha[]
        expect((l.codigo_do_motor as string).length).toBeLessThanOrEqual(60)
        expect(l.codigo_do_motor).toMatch(/^\S(.*\S)?$/)
        expect((l.frase as string).length).toBeLessThanOrEqual(1000)
        expect(l.tipologia).toBe('(sem tipologia)')
    })
    it('SEM a tabela das faltas e COM falta: recusa como antes, ANTES de qualquer escrita — a falta nunca some em silêncio', async () => {
        estado.custo = { ...(estado.custo as Linha), faltas: [falta(0, 'SF92/WOLFF')] }
        estado.erros['orcamentista_orcamento_falta:select'] = [{ code: 'PGRST205', message: "Could not find the table 'public.orcamentista_orcamento_falta'" }]
        await expect(K().calcularOrcamento(T, O1, new Date(), () => 'c')).rejects.toMatchObject({ recusas: ['SF92/WOLFF não está na tabela de preço'] })
        expect(escritas()).toEqual([])
    })
    it('sem falta, a tabela das faltas nem é lida', async () => {
        await K().calcularOrcamento(T, O1, new Date(), () => 'c')
        expect(estado.ops.some((o) => o.tabela === 'orcamentista_orcamento_falta')).toBe(false)
    })
    it('o VIDRO ESCOLHIDO de cada item chega ao cálculo (vidro_codigo); sem a coluna, nenhum foi escolhido', async () => {
        estado.db.orcamentista_orcamento_item.find((i) => i.id === 'i1')!.vidro_codigo = 'VIN04'
        await K().calcularOrcamento(T, O1, new Date(), () => 'c')
        expect(estado.chamadasDoCusto[0].lev.itens.map((i) => i.vidro_codigo)).toEqual(['VIN04', null])
        estado.chamadasDoCusto = []
        estado.erros['orcamentista_orcamento_item:select'] = [null, { code: '42703', message: 'column vidro_codigo does not exist' }]
        await K().calcularOrcamento(T, O1, new Date(), () => 'c')
        expect(estado.chamadasDoCusto[0].lev.itens.map((i) => i.vidro_codigo)).toEqual([null, null])
    })
})
