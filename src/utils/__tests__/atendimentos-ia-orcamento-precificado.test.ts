/**
 * @jest-environment node
 *
 * PORTÃO — a PRECIFICAÇÃO FINAL DO ORÇAMENTO I.A., do lado do servidor e das regras puras (o 1b, dono do produto, 09/11/2026):
 *   (1) `estadoDoCalculo`: "cálculo incompleto" quando um item aponta um cálculo e o orçamento está sem os totais (o passo zero), ou parte
 *       dos itens não tem cálculo; "desatualizado" quando um item foi alterado depois do cálculo;
 *   (2) `entradaDoMotor`: o produto entra como sempre; o orçamento entra pelo LÍQUIDO e pelos MINUTOS (a forma da D2);
 *   (3) as faltas do fiscal: sem NCM recusa; o NCM só na folha (0000.00.00); a UF existe exatamente na venda interestadual;
 *   (4) a rota: GET lê com o tenant; PATCH grava SÓ no orçamento, com o tenant, o preço, o fiscal e os percentuais; recusa (400) com a falta
 *       nomeada e nada gravado; (409) com o cálculo incompleto; a UF que não existe (a FK, 23503) é 400; sem a migração, 503; o id que não é
 *       UUID não lê o banco.
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import {
    entradaDoMotor, estadoDoCalculo, faltasDoFiscal, reconciliacaoNaTela, FALTA_DA_UF, FALTA_DO_ESCOPO, FALTA_DO_NCM, FRASE_CALCULO_INCOMPLETO,
    MODO_PRODUTO, SOBRA_DA_UF, faltaDoNcmFora, type ItemNaPrecificacao, internaParaGravar, faltaDaInternaDivergente, FALTA_DA_INTERNA,
} from '@/lib/atendimentos-ia/precificacao-do-orcamento'

type Linha = Record<string, unknown>
const estado = {
    db: {} as Record<string, Linha[]>,
    ops: [] as Array<{ tabela: string; op: string; carga?: unknown; filtros: Array<[string, unknown]> }>,
    erros: {} as Record<string, { code: string; message: string } | undefined>,
    papel: 'admin',
}
function cliente() {
    return {
        from: (tabela: string) => {
            const filtros: Array<[string, unknown]> = []
            let op = 'select'
            let carga: unknown
            const q: Record<string, unknown> = {}
            const rodar = () => {
                estado.ops.push({ tabela, op, carga, filtros })
                const erro = estado.erros[`${tabela}:${op}`]
                if (erro) return Promise.resolve({ data: null, error: erro })
                const r = (estado.db[tabela] ?? []).filter((l) => filtros.every(([c, v]) => l[c] === v))
                if (op === 'update') r.forEach((l) => Object.assign(l, carga as Linha))
                return Promise.resolve({ data: r.map((l) => ({ ...l })), error: null })
            }
            q.select = () => q
            q.order = () => q
            q.limit = () => q
            q.in = () => q
            q.eq = (c: string, v: unknown) => { filtros.push([c, v]); return q }
            q.update = (c: unknown) => { op = 'update'; carga = c; return q }
            q.maybeSingle = () => rodar().then((r) => ({ data: (r.data as Linha[] | null)?.[0] ?? null, error: r.error }))
            q.then = (ok: (v: unknown) => unknown, e?: (x: unknown) => unknown) => rodar().then(ok, e)
            return q
        },
    }
}
jest.mock('@/supabase/admin', () => ({ supabaseAdmin: cliente() }))
// o arquivo tem portão próprio (`atendimentos-ia-arquivo-do-orcamento.test.ts`); aqui importa O QUE a gravação lhe passa, e quando
const arquivo = {
    chamadas: [] as Array<{ tenantId: string; id: string; autor: string; dados: Record<string, unknown> }>,
    recusa: null as string[] | null,
    falha: null as string | null,
}
jest.mock('@/lib/atendimentos-ia/arquivo-do-orcamento-servidor', () => ({
    itensDoArquivo: async (): Promise<{ itens: unknown[]; linhas: unknown[] }> => ({ itens: [{ ordem: 1, quantidade: 1 }], linhas: [] }),
    lerDadosDoArquivo: async (_t: string, _id: string, a: Record<string, unknown>) => ({ dados: { ...a }, calculoId: 'c-1' }),
    gerarEGravarArquivo: async (tenantId: string, id: string, autor: string, dados: Record<string, unknown>) => {
        arquivo.chamadas.push({ tenantId, id, autor, dados })
        if (arquivo.falha) throw new Error(arquivo.falha)
        return arquivo.recusa ? { ok: false, recusas: arquivo.recusa } : { ok: true, arquivo: { id: 'arq-1', nomeDoArquivo: 'Orcamento 7 - Cliente.pdf' } }
    },
}))
jest.mock('@/lib/get-caller-tenant', () => ({
    getCallerContext: async () => ({ user_id: 'usuario', tenant_id: 'T', role: estado.papel, is_super_admin: false }),
}))
/* eslint-disable @typescript-eslint/no-require-imports */
const rota = require('@/pages/api/atendimentos-ia/orcamentos/[id]/precificacao').default
const { fraseDaFalhaDoArquivo } = require('@/lib/atendimentos-ia/orcamento-precificado') as { fraseDaFalhaDoArquivo: (e: unknown) => string }
/* eslint-enable @typescript-eslint/no-require-imports */

const ID = '30000000-0000-4000-8000-000000000001'
const item = (k: number, extra: Partial<ItemNaPrecificacao> = {}): ItemNaPrecificacao => ({
    id: `i-${k}`, ordem: k, tipologia: 'DP-02', largura_mm: 1500, altura_mm: 1200, quantidade: 1,
    calculo_id: 'c-1', calculado_em: '2026-11-09T12:00:00.000Z', atualizado_em: '2026-11-09T12:00:00.000Z',
    custo_bruto_materiais: 800, custo_liquido_materiais: 700, tempo_fabricacao_min: 90, valor_minuto: 0.5, custo_fabricacao: 45,
    custo_liquido_total: 745, ...extra,
})
const totais = { valor_total_bruto: 845, valor_total_liquido: 745 }

function montar(extra: Linha = {}, itens: Linha[] = [{ ...item(1), tenant_id: 'T', orcamento_id: ID }]) {
    arquivo.chamadas = []
    arquivo.recusa = null
    arquivo.falha = null
    estado.ops = []
    estado.erros = {}
    estado.papel = 'admin'
    estado.db = {
        orcamentista_config: [{ tenant_id: 'T', ativo: true }, { tenant_id: 'OUTRA', ativo: true }],
        user_module_permissions: [],
        orcamentista_orcamento: [
            { id: ID, tenant_id: 'T', numero: 7, nome: 'Cliente', comissao_percentual: '5', reserva_tecnica_percentual: '3', lucro_projetado_percentual: '10',
              valor_total_bruto: '845', valor_total_liquido: '745', valor_venda: null, ncm_code: null, sale_scope: null, buyer_type: null, uf_destino: null, ...extra },
            { id: ID, tenant_id: 'OUTRA', numero: 7, nome: 'De outra empresa' },
        ],
        orcamentista_orcamento_item: itens,
    }
}
async function chamar(method: string, id: string, body: unknown = {}) {
    const saida = { status: 0, corpo: {} as Record<string, unknown> }
    const res = { status(n: number) { saida.status = n; return res }, json(b: Record<string, unknown>) { saida.corpo = b; return res }, end() { return res }, setHeader() { return res } } as unknown as NextApiResponse
    await rota({ method, body, query: { id }, headers: {}, cookies: {} } as unknown as NextApiRequest, res)
    return saida
}
const CORPO_BOM = {
    valor_venda: 3105.8, valor_operacao_interna: 3105.8, ncm_code: '7610.10.00', sale_scope: 'INTRAESTADUAL', buyer_type: 'CONSUMIDOR_FINAL', uf_destino: null as string | null,
    comissao_percentual: 5, reserva_tecnica_percentual: 3, lucro_projetado_percentual: 10,
}
const escritas = () => estado.ops.filter((o) => o.op !== 'select')
const doOrcamento = () => estado.ops.filter((o) => o.tabela.startsWith('orcamentista_orcamento'))

describe('(1) o estado do cálculo gravado', () => {
    it('completo: todos os itens calculados e os totais gravados', () => {
        expect(estadoDoCalculo({ ...totais, itens: [item(1), item(2)] })).toBe('completo')
    })
    it('INCOMPLETO: item com cálculo e o orçamento sem os totais (o passo zero parou no meio)', () => {
        expect(estadoDoCalculo({ valor_total_bruto: null, valor_total_liquido: null, itens: [item(1)] })).toBe('incompleto')
        expect(estadoDoCalculo({ valor_total_bruto: 845, valor_total_liquido: null, itens: [item(1)] })).toBe('incompleto')
    })
    it('INCOMPLETO: parte dos itens sem cálculo, mesmo com os totais', () => {
        expect(estadoDoCalculo({ ...totais, itens: [item(1), item(2, { calculo_id: null })] })).toBe('incompleto')
    })
    it('INCOMPLETO: o item calculado sem os valores', () => {
        expect(estadoDoCalculo({ ...totais, itens: [item(1, { custo_liquido_materiais: null })] })).toBe('incompleto')
    })
    it('sem cálculo: nenhum item calculado; sem itens: nenhum item', () => {
        expect(estadoDoCalculo({ valor_total_bruto: null, valor_total_liquido: null, itens: [item(1, { calculo_id: null })] })).toBe('sem_calculo')
        expect(estadoDoCalculo({ ...totais, itens: [] })).toBe('sem_itens')
    })
    it('DESATUALIZADO: um item alterado depois do cálculo; no mesmo instante não', () => {
        expect(estadoDoCalculo({ ...totais, itens: [item(1, { atualizado_em: '2026-11-09T12:00:01.000Z' })] })).toBe('desatualizado')
        expect(estadoDoCalculo({ ...totais, itens: [item(1)] })).toBe('completo')
    })
})

describe('(2) a entrada do motor — o único ponto em que os dois modos divergem no cálculo', () => {
    const produto = { itemsPriceSum: 930.78, workloadMinutes: 150 }
    it('no produto, a soma dos itens e os minutos digitados, como sempre', () => {
        expect(entradaDoMotor(MODO_PRODUTO, produto)).toEqual({ totalItemsCost: 930.78, productWorkloadMinutes: 150 })
    })
    it('no orçamento, o LÍQUIDO dos materiais e os MINUTOS dos itens — nunca a fabricação no custo, e nunca o do produto', () => {
        const e = entradaDoMotor({ tipo: 'orcamento', itens: [item(1), item(2, { custo_liquido_materiais: 300, tempo_fabricacao_min: 30 })] }, produto)
        expect(e).toEqual({ totalItemsCost: 1000, productWorkloadMinutes: 120 })
    })
    it('a reconciliação: fecha até um centavo, e não fecha por dois', () => {
        expect(reconciliacaoNaTela([item(1)], 745.01).fecha).toBe(true)
        expect(reconciliacaoNaTela([item(1)], 744.99).fecha).toBe(true)
        expect(reconciliacaoNaTela([item(1)], 745.02).fecha).toBe(false)
        expect(reconciliacaoNaTela([item(1)], 744.98).fecha).toBe(false)
    })
})

describe('(3) as faltas do fiscal', () => {
    const bom = { ncm_code: '7610.10.00', sale_scope: 'INTRAESTADUAL' as const, buyer_type: 'CONSUMIDOR_FINAL' as const, uf_destino: null as string | null }
    it('completo: nenhuma falta', () => { expect(faltasDoFiscal(bom)).toEqual([]) })
    it('sem NCM: a falta nomeada; vazio é o mesmo que nulo', () => {
        expect(faltasDoFiscal({ ...bom, ncm_code: null })).toEqual([FALTA_DO_NCM])
        expect(faltasDoFiscal({ ...bom, ncm_code: '  ' })).toEqual([FALTA_DO_NCM])
    })
    it('o NCM só na FOLHA de oito dígitos: os níveis da hierarquia e o código sem pontos são falta', () => {
        for (const n of ['0101', '01012', '010221', '76101000', '7610.10.0']) expect(faltasDoFiscal({ ...bom, ncm_code: n })).toEqual([faltaDoNcmFora(n)])
    })
    it('a UF: obrigatória na interestadual, recusada na intraestadual e com o escopo nulo', () => {
        expect(faltasDoFiscal({ ...bom, sale_scope: 'INTERESTADUAL' })).toEqual([FALTA_DA_UF])
        expect(faltasDoFiscal({ ...bom, sale_scope: 'INTERESTADUAL', uf_destino: 'SP' })).toEqual([])
        expect(faltasDoFiscal({ ...bom, uf_destino: 'SP' })).toEqual([SOBRA_DA_UF])
        expect(faltasDoFiscal({ ...bom, sale_scope: null, uf_destino: 'SP' })).toEqual([FALTA_DO_ESCOPO, SOBRA_DA_UF])
    })
})

describe('(3b) a operação interna que se grava (20261110000001, dono do produto, 10/11/2026)', () => {
    it('a interna ao centavo; com o precificado igual ou a um centavo, grava', () => {
        expect(internaParaGravar(3257.804, 3257.8)).toEqual({ interna: 3257.8 })
        expect(internaParaGravar(3257.8, 3257.81)).toEqual({ interna: 3257.8 })
        expect(internaParaGravar(3257.8, 3257.79)).toEqual({ interna: 3257.8 })
    })
    it('divergindo em MAIS de um centavo, recusa nomeando os dois — nenhum dos dois serve', () => {
        expect(internaParaGravar(3257.8, 3257.82)).toEqual({ falta: faltaDaInternaDivergente(3257.8, 3257.82) })
        expect(internaParaGravar(14164.74, 13860.11)).toEqual({ falta: faltaDaInternaDivergente(14164.74, 13860.11) })
    })
    it('sem interna formada (zero, negativa, NaN): a falta', () => {
        for (const v of [0, -1, NaN, 0.004]) expect(internaParaGravar(v, v)).toEqual({ falta: FALTA_DA_INTERNA })
    })
})

describe('(4) a rota da precificação', () => {
    it('GET lê o orçamento DA EMPRESA, com os numéricos como número e os itens com os valores do cálculo', async () => {
        montar()
        const r = await chamar('GET', ID)
        expect(r.status).toBe(200)
        const o = r.corpo.orcamento as Record<string, unknown>
        expect(o.nome).toBe('Cliente')
        expect(o.comissao_percentual).toBe(5)
        expect(o.valor_total_liquido).toBe(745)
        expect((o.itens as Linha[])[0].custo_liquido_materiais).toBe(700)
        expect(doOrcamento().length).toBe(2)
        // e os itens como o arquivo os mostra (a faixa antes do salvar)
        expect(r.corpo.itens_do_arquivo).toEqual([{ ordem: 1, quantidade: 1 }])
        for (const op of doOrcamento()) expect(op.filtros).toContainEqual(['tenant_id', 'T'])
    })
    it('PATCH grava SÓ no orçamento, com o tenant: o preço, o fiscal e os percentuais', async () => {
        montar()
        const r = await chamar('PATCH', ID, CORPO_BOM)
        expect(r.status).toBe(200)
        const e = escritas()
        expect(e).toHaveLength(1)
        expect(e[0].tabela).toBe('orcamentista_orcamento')
        expect(e[0].filtros).toEqual([['tenant_id', 'T'], ['id', ID]])
        expect(e[0].carga).toMatchObject({ ...CORPO_BOM })
        expect(Object.keys(e[0].carga as Linha).sort()).toEqual([...Object.keys(CORPO_BOM), 'atualizado_em'].sort())
    })
    it('PATCH grava a OPERAÇÃO INTERNA com a venda, e GERA O ARQUIVO com o rateio exato, autor = quem salvou (11/11/2026)', async () => {
        montar()
        const r = await chamar('PATCH', ID, { ...CORPO_BOM, valor_venda: 3105.8, valor_operacao_interna: 3105.8 })
        expect(r.status).toBe(200)
        expect(escritas()[0].carga).toMatchObject({ valor_operacao_interna: 3105.8, valor_venda: 3105.8 })
        expect(r.corpo.arquivo).toEqual({ id: 'arq-1', nomeDoArquivo: 'Orcamento 7 - Cliente.pdf' })
        expect(r.corpo.recusas_do_arquivo).toEqual([])
        expect(arquivo.chamadas).toHaveLength(1)
        const c = arquivo.chamadas[0]
        expect([c.tenantId, c.id, c.autor]).toEqual(['T', ID, 'usuario'])
        expect(c.dados).toMatchObject({ operacaoInterna: 3105.8, valorVenda: 3105.8, rateio: [{ ordem: 1, quantidade: 1, unitario: 310580, total: 310580 }] })
    })
    it('o rateio que não fecha: o PREÇO fica salvo, o arquivo NÃO sai, e a resposta diz por quê (nunca um arquivo com centavo errado)', async () => {
        montar({}, [{ ...item(1, { quantidade: 2 }), tenant_id: 'T', orcamento_id: ID }, { ...item(2, { quantidade: 2 }), tenant_id: 'T', orcamento_id: ID }])
        const r = await chamar('PATCH', ID, { ...CORPO_BOM, valor_venda: 10.01, valor_operacao_interna: 10.01 })
        expect(r.status).toBe(200)
        expect(escritas()).toHaveLength(1)
        expect(r.corpo.arquivo).toBeNull()
        expect((r.corpo.recusas_do_arquivo as string[])[0]).toContain('não fecha exato: sobram 1 centavo(s)')
        expect(arquivo.chamadas).toEqual([])
    })
    it('a recusa do próprio arquivo (a venda diferente da interna, por exemplo) também volta nomeada, com o preço salvo', async () => {
        montar()
        arquivo.recusa = ['o valor de venda é diferente da operação interna']
        const r = await chamar('PATCH', ID, { ...CORPO_BOM, valor_venda: 3200, valor_operacao_interna: 3105.8 })
        expect(r.status).toBe(200)
        expect(r.corpo.arquivo).toBeNull()
        expect(r.corpo.recusas_do_arquivo).toEqual(['o valor de venda é diferente da operação interna'])
    })
    it('a FALHA do arquivo depois do preço gravado (Storage, leitura) é 200 com a recusa nomeada, nunca 500: o preço está salvo', async () => {
        montar()
        arquivo.falha = 'storage atendimentos-ia: fora do ar'
        const r = await chamar('PATCH', ID, CORPO_BOM)
        expect(r.status).toBe(200)
        expect(r.corpo.arquivo).toBeNull()
        expect(r.corpo.recusas_do_arquivo).toEqual([fraseDaFalhaDoArquivo(new Error('storage atendimentos-ia: fora do ar'))])
        expect((r.corpo.recusas_do_arquivo as string[])[0]).toContain('storage atendimentos-ia: fora do ar')
        expect((r.corpo.orcamento as Record<string, unknown>).valor_venda).toBe(3105.8)
    })
    it('a operação interna ausente, fora do centavo, ou acima da venda: 400, e nada é gravado nem gerado', async () => {
        for (const extra of [{ valor_operacao_interna: null }, { valor_operacao_interna: 0 }, { valor_operacao_interna: 3105.805 }, { valor_operacao_interna: 3105.81 }]) {
            montar()
            const r = await chamar('PATCH', ID, { ...CORPO_BOM, ...extra })
            expect(r.status).toBe(400)
            expect(escritas()).toEqual([])
            expect(arquivo.chamadas).toEqual([])
        }
    })
    it('a interna fora do centavo e ABAIXO da venda é recusada pelo próprio nome (não pela venda): 400, nada gravado', async () => {
        montar()
        const r = await chamar('PATCH', ID, { ...CORPO_BOM, valor_operacao_interna: 3000.005 })
        expect(r.status).toBe(400)
        expect(r.corpo.erros).toEqual(['Operação interna: tem de estar em centavos (veio 3000.005).'])
        expect(escritas()).toEqual([])
    })
    it('PATCH sem NCM: 400 com a falta nomeada, e nada é gravado', async () => {
        montar()
        const r = await chamar('PATCH', ID, { ...CORPO_BOM, ncm_code: null })
        expect(r.status).toBe(400)
        expect(r.corpo.erros).toContain(`Falta ${FALTA_DO_NCM}.`)
        expect(escritas()).toEqual([])
    })
    it('PATCH com valor de venda zero, negativo ou texto: 400', async () => {
        for (const v of [0, -1, 'abc', null]) {
            montar()
            const r = await chamar('PATCH', ID, { ...CORPO_BOM, valor_venda: v })
            expect(r.status).toBe(400)
            expect(escritas()).toEqual([])
        }
    })
    it('PATCH com percentual fora de 0..100, escopo ou comprador fora do domínio, UF fora da forma: 400', async () => {
        for (const extra of [{ lucro_projetado_percentual: 101 }, { sale_scope: 'EXPORTACAO' }, { buyer_type: 'X' }, { sale_scope: 'INTERESTADUAL', uf_destino: 'sp' }]) {
            montar()
            expect((await chamar('PATCH', ID, { ...CORPO_BOM, ...extra })).status).toBe(400)
            expect(escritas()).toEqual([])
        }
    })
    it('PATCH com o cálculo incompleto: 409 "cálculo incompleto — recalcule", e nada é gravado', async () => {
        montar({ valor_total_bruto: null, valor_total_liquido: null })
        const r = await chamar('PATCH', ID, CORPO_BOM)
        expect(r.status).toBe(409)
        expect(r.corpo.error).toBe(FRASE_CALCULO_INCOMPLETO)
        expect(escritas()).toEqual([])
    })
    it('a UF que não existe (a FK, 23503) volta 400 nomeada', async () => {
        montar()
        estado.erros['orcamentista_orcamento:update'] = { code: '23503', message: 'fk' }
        const r = await chamar('PATCH', ID, { ...CORPO_BOM, sale_scope: 'INTERESTADUAL', uf_destino: 'XX' })
        expect(r.status).toBe(400)
        expect(String(r.corpo.error)).toContain('"XX" não é uma UF')
    })
    it('o orçamento de OUTRA empresa: 404, e nada é gravado', async () => {
        montar()
        estado.db.orcamentista_orcamento = estado.db.orcamentista_orcamento.filter((o) => o.tenant_id !== 'T')
        expect((await chamar('PATCH', ID, CORPO_BOM)).status).toBe(404)
        expect(escritas()).toEqual([])
    })
    it('sem a migração (a coluna não existe): 503 com a frase', async () => {
        montar()
        estado.erros['orcamentista_orcamento:select'] = { code: '42703', message: 'column ncm_code does not exist' }
        const r = await chamar('GET', ID)
        expect(r.status).toBe(503)
        expect(r.corpo.sem_migracao).toBe(true)
    })
    it('o id que não é UUID não lê o banco; outro método é 405', async () => {
        montar()
        expect((await chamar('GET', 'nao-e-uuid')).status).toBe(404)
        expect(doOrcamento()).toEqual([])
        expect((await chamar('DELETE', ID)).status).toBe(405)
    })
})
