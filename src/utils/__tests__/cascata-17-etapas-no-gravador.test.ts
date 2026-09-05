/**
 * cascata-17-etapas-no-gravador.test.ts — o gravador rodava V16 e a tela rodava V17.
 *
 * O DEFEITO, medido em 05/09/2026: dos 263 itens com snapshot na base (161 `budget_items`,
 * 25 `order_items`, 77 `sale_items`), **263 carregam `cascade_trace` de 13 etapas e ZERO
 * carregam 17**. A cascata de 17 etapas nunca foi persistida em lugar nenhum — ela só existia
 * em memória, na tela que roda o motor. Por isso o Pedido e o detalhe da Venda gravada, que
 * leem o snapshot, exibiam a cascata REDUZIDA, sem o Bloco 1 inteiro.
 *
 * O cutover V17 (2026-05-28) trocou o motor da rota de RUNTIME e deixou a de GRAVAÇÃO no V16.
 *
 * CADA CASO AQUI FALHA SEM A CORREÇÃO. A maioria falha pelo motivo mais direto possível: sob
 * V16 as etapas do Bloco 1 NÃO EXISTEM, então nem há o que comparar.
 *
 * PRODUTO E SERVIÇO em todos os casos de número — o serviço é o lado que mais defeito produziu
 * nesta rodada (nome não resolvido, RT ignorado, despesa do snapshot não lida).
 *
 * O QUE ESTE ARQUIVO NÃO AFIRMA: nada sobre alcance na base. Projetar quanto os itens já
 * gravados mudariam exigiria rodar o V17 sobre documento histórico com o cadastro de HOJE —
 * a referência viva que a correção elimina. O único par medido é o PED-18A461 (134,21 →
 * 150,94), amostra de UM documento MEI sem imposto.
 */

import fs from 'fs'
import path from 'path'
import { hydrateDocumentSnapshots } from '@/lib/document-snapshot'
import { enrichItemsForMotor } from '@/utils/motor-item-enrichment'
import { calculateMotorV17ForPage } from '@/utils/mrm-engine-v17/legacy-adapter'
import { applyTotalACobrarToStep11 } from '@/page-parts/shared/consolidated-dre-block.component'
import { extractEpicV5DisplayData } from '@/utils/mrm-display-extractor'
import type { TenantSnapshotContext } from '@/lib/items-snapshot'
import type { CascadeStep, TaxBreakdown } from '@/types/mrm'

const SRC = path.resolve(__dirname, '../..')
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8')

// ─────────────────────────────────────────────────────────────────────────────
// Documento COERENTE: preço formado "por dentro" com 50% de comissão e 15% de lucro.
// Custo = 35% do preço, que é (1 − 0,50 − 0,15). Regime MEI com DAS zero — o mesmo recorte
// do PED-18A461, onde o imposto é zero DE VERDADE (alíquota zero cadastrada), e não por
// ausência de dado.
// ─────────────────────────────────────────────────────────────────────────────

const PRODUTOS = [
    {
        id: 'p1',
        name: 'Camiseta Polo M',
        cost_total: 35,
        product_type: 'REVENDA',
        freight_value: 0,
        insurance_value: 0,
        accessory_expenses_value: 0,
    },
]
const SERVICOS = [{ id: 's1', name: 'Corte e Barba', cost_total: 70 }]

/** Item de PRODUTO: R$ 100, custo R$ 35 (35% = 1 − 50% − 15%). */
const ITEM_PRODUTO = {
    product_id: 'p1',
    unit_price: 100,
    quantity: 1,
    commission_percent: 50,
    profit_percent: 15,
}
/** Item de SERVIÇO: R$ 200, custo R$ 70 — mesma proporção. */
const ITEM_SERVICO = {
    service_id: 's1',
    unit_price: 200,
    quantity: 1,
    cost_total: 70,
    commission_percent: 50,
    profit_percent: 15,
}

const SNAPSHOT_CTX: TenantSnapshotContext = {
    regime: 'MEI',
    rates: [],
    csll_pct: 0,
    irpj_pct: 0,
    use_snapshot_rates: true,
}

const MOTOR_TENANT_CTX = {
    regime: 'MEI' as const,
    rates: [],
    mod_pct: 0,
    dop_pct: 0,
    csll_pct: 0,
    irpj_pct: 0,
    useSnapshotRates: true,
    expense_breakdown: {},
    absorption_policy: 'RRO_PROPORTIONAL' as const,
}

const enriquecer = (itens: Array<Record<string, unknown>>) =>
    enrichItemsForMotor(itens, { products: PRODUTOS, services: SERVICOS }, {})

/** A rota do GRAVADOR: enriquece e hidrata o documento inteiro. */
function gravar(
    itens: Array<Record<string, unknown>>,
    opts: { desconto?: number; ctx?: TenantSnapshotContext; prev?: (TaxBreakdown | null)[] } = {},
) {
    return hydrateDocumentSnapshots(
        {
            items: enriquecer(itens).map((motorItem, idx) => ({
                motorItem,
                commission_pct: Number(itens[idx].commission_percent ?? 0) / 100,
                profit_pct: Number(itens[idx].profit_percent ?? 0) / 100,
                prev_breakdown: opts.prev?.[idx] ?? null,
            })),
            tenantCtx: MOTOR_TENANT_CTX,
            globalDiscountPercent: opts.desconto ?? 0,
            discountMode: 'PROPORTIONAL',
            effectiveDate: '2026-09-05',
        },
        opts.ctx ?? SNAPSHOT_CTX,
    )
}

/**
 * A rota da TELA: enriquece por conta própria e roda o motor em runtime.
 *
 * O enriquecimento é REFEITO aqui de propósito. Se um dia as duas rotas voltarem a montar a
 * entrada por caminhos diferentes, é este teste que quebra — comparar o gravador com uma
 * entrada que ele mesmo montou seria compará-lo consigo mesmo.
 */
const runtimeDaTela = (itens: Array<Record<string, unknown>>, desconto = 0) =>
    calculateMotorV17ForPage({
        items: enriquecer(itens),
        tenantCtx: MOTOR_TENANT_CTX,
        globalDiscountPercent: desconto,
        effectiveDate: '2026-09-05',
    })

const somaEtapa = (trace: CascadeStep[], step: number) =>
    trace.find((s) => s.step === step)?.amount ?? NaN

describe('A cascata gravada tem as 17 etapas — antes tinha 13', () => {
    it('PRODUTO e SERVIÇO: o snapshot de cada item carrega 17 etapas', () => {
        const snaps = gravar([ITEM_PRODUTO, ITEM_SERVICO])
        expect(snaps).toHaveLength(2)
        for (const s of snaps) {
            expect(s.tax_breakdown?.cascade_trace).toHaveLength(17)
        }
    })

    it('as DEZ etapas do Bloco 1 existem, com a nomenclatura canônica', () => {
        // Estas são exatamente as que faltavam na tela do Pedido: ele começava direto na
        // decomposição. Sob V16 nenhuma delas existe — a cascata de 13 abre em "Receita Bruta".
        const trace = gravar([ITEM_PRODUTO, ITEM_SERVICO])[0].tax_breakdown!.cascade_trace!
        const rotulos = trace.map((s) => s.label)
        for (const esperado of [
            'Fragmentação individual dos produtos',
            'Construção matemática individual',
            'Agrupamento por categorias',
            'Consolidação dos custos',
            'Consolidação das despesas operacionais',
            'Consolidação das margens',
            'Formação Op Interna',
            'Formação Op Externa',
            'Venda consolidada',
            'Pesos estruturais',
        ]) {
            expect(rotulos).toContain(esperado)
        }
        // E o que a cascata de 13 abria com — o rótulo do V16 — não está mais lá.
        expect(rotulos).not.toContain('Receita Bruta')
        expect(rotulos).not.toContain('Aplicação do Peso Operação Interna')
    })

    it('a Etapa 6 traz Comissão, Lucro, IRPJ e CSLL como filhos', () => {
        const trace = gravar([ITEM_PRODUTO, ITEM_SERVICO])[0].tax_breakdown!.cascade_trace!
        const etapa6 = trace.find((s) => s.step === 6)
        expect(etapa6?.children?.map((c) => c.label)).toEqual(['Comissão', 'Lucro', 'IRPJ', 'CSLL'])
    })
})

describe('O INVARIANTE DO ESPELHO — com desconto zero, Etapa 6 fecha com Etapa 16', () => {
    // Foi este invariante que decidiu qual dos dois números era o certo. Ele é EXPRIMÍVEL sob
    // V17 e INEXPRIMÍVEL sob V16, porque a cascata de 13 etapas não tem Etapa 6 para comparar.
    //
    // RESSALVA: o invariante vale para documento COERENTE — aquele cujo preço foi formado por
    // dentro com os percentuais que ele declara, isto é, custo + despesas = (1 − Σ margens) ×
    // preço. Não é identidade que o motor imponha; é o critério que diz se o documento fecha.
    it('PRODUTO + SERVIÇO coerentes: Etapa 6 == Etapa 16', () => {
        const trace = gravar([ITEM_PRODUTO, ITEM_SERVICO])[0].tax_breakdown!.cascade_trace!
        const etapa6 = somaEtapa(trace, 6)
        const etapa16 = somaEtapa(trace, 16)
        // rb 300, custo 105 (35%), margens 65% → 195 dos dois lados.
        expect(etapa6).toBeCloseTo(195, 2)
        expect(etapa16).toBeCloseTo(195, 2)
        expect(etapa6).toBeCloseTo(etapa16, 2)
    })

    it('só o PRODUTO, sozinho: continua fechando', () => {
        const trace = gravar([ITEM_PRODUTO])[0].tax_breakdown!.cascade_trace!
        expect(somaEtapa(trace, 6)).toBeCloseTo(somaEtapa(trace, 16), 2)
    })

    it('só o SERVIÇO, sozinho: continua fechando', () => {
        const trace = gravar([ITEM_SERVICO])[0].tax_breakdown!.cascade_trace!
        expect(somaEtapa(trace, 6)).toBeCloseTo(somaEtapa(trace, 16), 2)
    })

    it('COM desconto o invariante deixa de valer — e é isso que ele mede', () => {
        // O desconto sai do RRO, não das margens nominais. Um teste que passasse com e sem
        // desconto não estaria medindo nada.
        const trace = gravar([ITEM_PRODUTO, ITEM_SERVICO], { desconto: 10 })[0]
            .tax_breakdown!.cascade_trace!
        expect(somaEtapa(trace, 16)).toBeLessThan(somaEtapa(trace, 6))
    })
})

describe('PARIDADE gravador × runtime da tela — a divergência cabeçalho × itens', () => {
    // O cabeçalho (`budgets.commission_amount`, `sales.commission_amount`) sempre saiu do V17
    // em runtime; o `tax_breakdown` dos itens saía do V16. Medido no PED-18A461: 150,94 no
    // cabeçalho contra 134,21 nos itens. Com uma rota só, a divergência fecha.
    //
    // As duas rotas montam a entrada SEPARADAMENTE neste teste (`runtimeDaTela` chama
    // `enriquecer` de novo): se o enriquecimento voltar a divergir, é aqui que quebra.
    it('PRODUTO e SERVIÇO: `new_commission` e `new_profit` coincidem item a item', () => {
        const itens = [ITEM_PRODUTO, ITEM_SERVICO]
        const gravado = gravar(itens)
        const tela = runtimeDaTela(itens)
        itens.forEach((_, i) => {
            expect(gravado[i].tax_breakdown!.new_commission).toBeCloseTo(tela[i]!.new_commission, 6)
            expect(gravado[i].tax_breakdown!.new_profit).toBeCloseTo(tela[i]!.new_profit, 6)
            expect(gravado[i].tax_breakdown!.rro).toBeCloseTo(tela[i]!.rro, 6)
            expect(gravado[i].tax_breakdown!.cp).toBeCloseTo(tela[i]!.cp, 6)
        })
    })

    it('o CONSOLIDADO do documento coincide — é o número que vai para o cabeçalho', () => {
        const itens = [ITEM_PRODUTO, ITEM_SERVICO]
        const somaGravada = gravar(itens).reduce(
            (s, x) => s + (x.tax_breakdown?.new_commission ?? 0),
            0,
        )
        const somaTela = runtimeDaTela(itens).reduce((s, r) => s + (r?.new_commission ?? 0), 0)
        expect(somaGravada).toBeCloseTo(somaTela, 6)
        // E fecha com a Etapa 6 do documento coerente: 300 × 50% = 150.
        expect(somaGravada).toBeCloseTo(150, 2)
    })

    it('com desconto também — o modo do documento chega ao gravador', () => {
        const itens = [ITEM_PRODUTO, ITEM_SERVICO]
        const gravado = gravar(itens, { desconto: 12 })
        const tela = runtimeDaTela(itens, 12)
        expect(gravado[0].tax_breakdown!.new_commission).toBeCloseTo(tela[0]!.new_commission, 6)
        // E o snapshot registra o modo, em vez de cair no default silencioso.
        expect(gravado[0].tax_breakdown!.discount_mode_requested).toBe('PROPORTIONAL')
    })
})

describe('O gravador é CONSOLIDADO — o item não existe sozinho', () => {
    it('todos os itens carregam o MESMO trace consolidado', () => {
        // `mrm-display-extractor` tem `if (template.length !== 13) return template`: com trace
        // de 17 ele devolve o do PRIMEIRO item, sem agregar. Isso só está correto porque o
        // trace é o mesmo em todos. Se algum dia passarem a divergir por item, a tela some
        // silenciosamente com os demais — e é este caso que trava isso.
        const snaps = gravar([ITEM_PRODUTO, ITEM_SERVICO])
        expect(snaps[0].tax_breakdown!.cascade_trace).toEqual(snaps[1].tax_breakdown!.cascade_trace)
    })

    it('o extrator entrega as 17 etapas para a tela, sem agregar', () => {
        const snaps = gravar([ITEM_PRODUTO, ITEM_SERVICO])
        const display = extractEpicV5DisplayData(
            snaps.map((s) => ({ tax_breakdown: s.tax_breakdown })),
            { regime: 'MEI', csll_pct: 0, irpj_pct: 0 },
        )
        expect(display.cascadeTrace).toHaveLength(17)
    })

    it('o resultado de um item DEPENDE dos outros — consolidar não é somar', () => {
        // Se o gravador voltasse a ser por item, o snapshot do produto seria idêntico sozinho
        // e acompanhado. Ele não é: o V17 consolida antes de ratear.
        const sozinho = gravar([ITEM_PRODUTO])[0].tax_breakdown!
        const acompanhado = gravar([ITEM_PRODUTO, ITEM_SERVICO])[0].tax_breakdown!
        expect(sozinho.cascade_trace).not.toEqual(acompanhado.cascade_trace)
        expect(sozinho.rb).toBeCloseTo(acompanhado.rb, 6)
    })
})

describe('A política do snapshot sobreviveu à troca de motor', () => {
    it('AC3 — `prev_breakdown` VÁLIDO é preservado, inclusive com 13 etapas', () => {
        // É o único ponto do sistema que alimenta o AC3: a travessia orçamento → venda.
        // O snapshot antigo (13 etapas) TEM que atravessar intacto — congelar é congelar,
        // e regravá-lo com o motor novo reescreveria o passado.
        const antigo = { valid: true, new_commission: 111, cascade_trace: [] } as unknown as TaxBreakdown
        const snaps = gravar([ITEM_PRODUTO, ITEM_SERVICO], { prev: [antigo, null] })
        expect(snaps[0].tax_breakdown).toBe(antigo)
        expect(snaps[0].tax_breakdown!.new_commission).toBe(111)
        // O item SEM snapshot anterior é hidratado normalmente, com 17 etapas.
        expect(snaps[1].tax_breakdown!.cascade_trace).toHaveLength(17)
    })

    it('AC3 — `prev_breakdown` INVÁLIDO não é preservado', () => {
        const invalido = { valid: false, new_commission: 111 } as unknown as TaxBreakdown
        const snaps = gravar([ITEM_PRODUTO], { prev: [invalido] })
        expect(snaps[0].tax_breakdown!.new_commission).not.toBe(111)
    })

    it('AC4 — `use_snapshot_rates=false` continua gravando `tax_breakdown` nulo', () => {
        const snaps = gravar([ITEM_PRODUTO, ITEM_SERVICO], {
            ctx: { ...SNAPSHOT_CTX, use_snapshot_rates: false },
        })
        expect(snaps.map((s) => s.tax_breakdown)).toEqual([null, null])
        // Os pesos das COLUNAS continuam preenchidos — não dependem da flag.
        expect(snaps[0].commission_pct).toBeCloseTo(0.5, 6)
        expect(snaps[1].profit_pct).toBeCloseTo(0.15, 6)
    })

    it('o snapshot carrega o contexto que o motor não tem', () => {
        const tb = gravar([ITEM_PRODUTO])[0].tax_breakdown!
        expect(tb.regime).toBe('MEI')
        expect(tb.effective_date).toBe('2026-09-05')
        expect(tb.use_snapshot_rates).toBe(true)
        expect(tb.valid).toBe(true)
        expect(tb.validations).toBeDefined()
        // V5 do V17 é justamente "a cascata tem 17 etapas" — gravada, agora, como verdade.
        expect(tb.validations.V5).toBe(true)
    })
})

describe('As props do #50 deixam de ser INERTES — efeito, não passagem', () => {
    // O teste que existia afirmava que as três props CHEGAVAM ao bloco. Chegavam mesmo — e não
    // mudavam nada, porque `applyTotalACobrarToStep11` procura um `step 11` com filho
    // "Restante distribuível", que só a Camada 2 do V17 cria. Afirmar passagem não é afirmar
    // efeito. Este caso exerce a função contra o trace que o GRAVADOR de fato produz.
    const traceGravado = () => gravar([ITEM_PRODUTO, ITEM_SERVICO])[0].tax_breakdown!.cascade_trace!

    it('a linha "Venda Consolidada pós-desconto" aparece no trace do gravador', () => {
        const aplicado = applyTotalACobrarToStep11(traceGravado(), 300, 0, 0)
        const etapa11 = aplicado.find((s) => s.step === 11)
        expect(etapa11?.children?.some((c) => (c.label ?? '').includes('Venda Consolidada'))).toBe(true)
    })

    it('contra um trace de 13 etapas a mesma chamada é NO-OP — o estado anterior', () => {
        // A prova de que o defeito era da cascata e não do bloco: mesma função, mesma prop,
        // nenhum efeito. É o que a tela do Pedido fazia até aqui.
        const traceV16: CascadeStep[] = [
            { step: 11, label: 'Resultado Residual Operacional (RRO)', base: 195, rate: null, amount: 195, formula: '', source: 'ETAPA_10' },
        ]
        const aplicado = applyTotalACobrarToStep11(traceV16, 300, 0, 0)
        expect(aplicado).toEqual(traceV16)
        expect(aplicado.some((s) => (s.label ?? '').includes('Venda Consolidada'))).toBe(false)
        expect(aplicado[0].children).toBeUndefined()
    })
})

describe('A cópia divergente não pode voltar', () => {
    const orcamentos = () => read('pages/orcamentos/index.tsx')
    const vendas = () => read('pages/vendas/index.tsx')

    it('as quatro cópias do enriquecimento viraram uma chamada ao módulo', () => {
        // Eram 1 em orçamentos e 3 em vendas. O `valor_precificado_icms_piscofins` aparecia em
        // cada uma; agora só no módulo.
        expect(orcamentos()).toContain('enrichItemsForMotor(')
        expect(vendas()).toContain('enrichItemsForMotor(')
        expect(orcamentos()).not.toContain('valor_op_interna_unit:')
        expect(vendas()).not.toContain('valor_op_interna_unit:')
        // UMA chamada em cada tela — as três de vendas viraram uma instância só.
        expect(vendas().split('enrichItemsForMotor(').length - 1).toBe(1)
        expect(orcamentos().split('enrichItemsForMotor(').length - 1).toBe(1)
    })

    it('nenhuma tela grava pelo motor V16 — é o defeito que este PR fecha', () => {
        for (const arquivo of [orcamentos(), vendas()]) {
            expect(arquivo).not.toContain('hydrateItemSnapshot')
            expect(arquivo).not.toContain('calculateMarginReapuration')
            expect(arquivo).not.toContain('buildMotorInput')
        }
    })

    it('a travessia orçamento → venda também passou ao gravador consolidado', () => {
        const modulo = read('utils/budget-item-to-sale-item.ts')
        expect(modulo).toContain('hydrateDocumentSnapshots')
        expect(modulo).not.toContain('hydrateItemSnapshot')
        // E continua sendo o único lugar que alimenta o AC3.
        expect(modulo).toContain('prev_breakdown: bi.tax_breakdown ?? null')
    })

    it('a venda GRAVADA recebe as props da Etapa 11 — a segunda superfície', () => {
        const i = vendas().indexOf('cascadeTrace={saleEpicV5DisplayData.cascadeTrace}')
        expect(i).toBeGreaterThanOrEqual(0)
        const trecho = vendas().slice(i, i + 1600)
        expect(trecho).toContain('totalACobrarComDesconto')
        expect(trecho).toContain('manualTotal')
    })
})
