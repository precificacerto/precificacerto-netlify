/**
 * O REPASSE É LINHA PRÓPRIA, NO MESMO BLOCO DA DEVOLUÇÃO E NUNCA SOMADO A ELA.
 *
 * Decisão do dono do produto, 17/09/2026, registrada como está:
 *
 *   "O repasse entra nas despesas, mensurando que o valor recebido teve destino."
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * O QUE CADA CASO PRECISA DISTINGUIR — e por que os valores são os que são
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `.claude/rules/teste-que-nao-exercita.md`: **cada asserção precisa FALHAR sem a sua
 * correção.** Três armadilhas foram evitadas POR CONSTRUÇÃO neste arquivo:
 *
 * 1. **`repasse` e `deducaoReceita` têm valores DIFERENTES** (4.300 e 7.000). Com valores
 *    iguais, uma implementação que somasse os dois no mesmo balde — ou que lesse um pelo
 *    outro — passaria verde. É a variante 2 da regra: *"o caso escolhido não discrimina"*.
 * 2. **Todo caso afirma EFEITO, não passagem.** "A linha existe" e "o `case` está no arquivo"
 *    são asserções sobre o caminho; aqui se afirma que a RECEITA LÍQUIDA CAI exatamente o
 *    repasse, e que o lançamento cai no BALDE certo. Para isso `aggregateEntries` foi
 *    EXPORTADA — o custo é uma linha, e o que se compra é poder afirmar efeito.
 * 3. **ZERO lançamentos com `expense_group = 'REPASSE'` existem na base**, porque o grupo
 *    nasceu nesta rodada. Um teste contra dados reais somaria `0` em toda linha e passaria
 *    sem exercitar nada — exatamente o que o cabeçalho de
 *    `dfc-devolucoes-linha-propria.test.ts` já registrava para `DEDUCAO_RECEITA`. Daí a
 *    fixture ser obrigatória e sempre diferente de zero.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * O QUE ISTO CORRIGE ALÉM DO GRUPO NOVO
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `DEVOLUCOES` e `AMORTIZACAO` existiam em `CASHIER_CATEGORY.EXPENSE` desde 09/09/2026 e em
 * NENHUM seletor vivo — zero ocorrências em `expense-categories-by-regime.ts`, que é o módulo
 * que `fluxo-de-caixa` e `controle-financeiro` de fato consomem. O `switch` do DFC tinha
 * `case 'AMORTIZACAO'` e as três variantes tinham a linha, **para um grupo que o usuário não
 * podia escolher**: `portao-que-nao-alcanca.md` pelo avesso — a proteção existe e nada a
 * alcança.
 *
 * E a CHECK do banco recusava os três. Sem a migração `20260917000001`, escolher qualquer um
 * falha no INSERT — é o caso do `expense_snapshot` de 01/09/2026 que `migration-delivery.md`
 * registra.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * A ASSIMETRIA QUE ESTE ARQUIVO **NÃO** CORRIGE, e está dita para ninguém a procurar aqui
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * A linha zera o repasse do RESULTADO, não do FATURAMENTO: a entrada continua chegando
 * inteira à receita bruta, porque o `continue` do INCOME em `aggregateEntries` corta antes do
 * `switch`. Há caso abaixo AFIRMANDO isso, para que a assimetria seja um comportamento
 * travado e não uma surpresa. Os números e as duas alternativas medidas estão em
 * `docs/registros/o-repasse-entra-inteiro-pela-receita.md`.
 */

import fs from 'fs'
import path from 'path'
import {
    aggregateEntries,
    buildDreLucroRealPresumido,
    buildDrePresumidoRET,
    buildDreSimplesNacional,
    type AggregatedData,
    type CashEntry,
    type DreRow,
    type MonthlyValues,
} from '@/pages/dfc'
import { EXPENSE_GROUP_KEYS, EXPENSE_GROUP_META, EXPENSE_GROUP_OPTIONS } from '@/constants/expense-groups'
import {
    getExpenseCategoryOptionsForRegime,
    getGroupForCategoryByRegime,
} from '@/constants/expense-categories-by-regime'

const leia = (...p: string[]) => fs.readFileSync(path.join(process.cwd(), ...p), 'utf-8')

const ZERO: MonthlyValues = {
    jan: 0, feb: 0, mar: 0, apr: 0, may: 0, jun: 0,
    jul: 0, aug: 0, sep: 0, oct: 0, nov: 0, dec: 0,
}
const mes = (v: number): MonthlyValues => ({ ...ZERO, jan: v })

const REPASSE = 4_300
const DEVOLUCAO = 7_000

/** Fixture: todo valor distinto, e `repasse` ≠ `deducaoReceita` de propósito. */
const comRepasse = (): AggregatedData => ({
    receitaBruta: mes(100_000),
    deducaoReceita: mes(DEVOLUCAO),
    repasse: mes(REPASSE),
    imposto: mes(5_000),
    impostoPorDentro: mes(3_000),
    maoDeObraProdutiva: mes(1_100),
    maoDeObraAdministrativa: mes(1_200),
    maoDeObra: { ...ZERO },
    despesaFixa: mes(1_300),
    despesaVariavel: mes(1_400),
    despesaFinanceira: mes(1_500),
    comissoes: mes(1_600),
    reservaTecnica: mes(1_700),
    custoProduto: mes(20_000),
    impostosRecuperaveisCusto: mes(900),
    atividadesTerceirizadas: mes(800),
    amortizacao: mes(2_500),
})

/** A MESMA fixture com repasse ZERO — o par que torna a queda mensurável. */
const semRepasse = (): AggregatedData => ({ ...comRepasse(), repasse: { ...ZERO } })

const indice = (rows: DreRow[], key: string) => rows.findIndex((r) => r.key === key)
const linha = (rows: DreRow[], key: string) => rows.find((r) => r.key === key)

const VARIANTES: {
    nome: string
    build: (a: AggregatedData) => DreRow[]
    /** A chave da linha de devolução naquela variante — o repasse vem DEPOIS dela. */
    devolucao: string
    /** A chave do subtotal de receita líquida. */
    liquida: string
}[] = [
    {
        nome: 'Lucro Real',
        build: (a) => buildDreLucroRealPresumido(a, 'RESALE', 'LUCRO_REAL'),
        devolucao: 'deducoes_devolucoes',
        liquida: 'receita_liquida',
    },
    {
        nome: 'Lucro Presumido',
        build: (a) => buildDreLucroRealPresumido(a, 'RESALE', 'LUCRO_PRESUMIDO'),
        devolucao: 'deducoes_devolucoes',
        liquida: 'receita_liquida',
    },
    {
        nome: 'Simples Nacional',
        build: (a) => buildDreSimplesNacional(a, 'RESALE'),
        devolucao: 'deducoes_devolucoes',
        liquida: 'receita_liquida',
    },
    {
        nome: 'Presumido RET',
        build: (a) => buildDrePresumidoRET(a),
        devolucao: 'deducoes_receita',
        liquida: 'receita_liquida',
    },
]

describe.each(VARIANTES)('1. $nome — a linha existe, é separada e SUBTRAI', ({ build, devolucao, liquida }) => {
    const rows = build(comRepasse())

    it('>>> a linha carrega o REPASSE, e não a devolução <<<', () => {
        const r = linha(rows, 'repasse')
        expect(r).toBeDefined()
        expect(r!.values.jan).toBe(REPASSE)
        // O DISCRIMINANTE contra somar os dois no mesmo balde:
        expect(r!.values.jan).not.toBe(DEVOLUCAO)
        expect(r!.values.jan).not.toBe(REPASSE + DEVOLUCAO)
    })

    it('e a linha da DEVOLUÇÃO continua carregando só a devolução', () => {
        // Sem este caso, uma implementação que somasse repasse dentro de `deducaoReceita`
        // passaria no de cima se a linha nova lesse o mesmo campo.
        expect(linha(rows, devolucao)!.values.jan).toBe(DEVOLUCAO)
    })

    it('o repasse vem IMEDIATAMENTE DEPOIS do bloco da devolução, nunca antes', () => {
        const iDev = indice(rows, devolucao)
        const iRep = indice(rows, 'repasse')
        expect(iDev).toBeGreaterThanOrEqual(0)
        expect(iRep).toBeGreaterThan(iDev)
        // E ANTES do subtotal — uma linha depois da receita líquida não teria participado dela.
        expect(iRep).toBeLessThan(indice(rows, liquida))
    })

    it('>>> a RECEITA LÍQUIDA CAI EXATAMENTE O REPASSE — é o efeito, não a passagem <<<', () => {
        const com = linha(build(comRepasse()), liquida)!.values.jan
        const sem = linha(build(semRepasse()), liquida)!.values.jan
        expect(sem - com).toBeCloseTo(REPASSE, 6)
    })

    it('e a linha é uma DEDUÇÃO — sinal de menos, como a devolução ao lado', () => {
        expect(linha(rows, 'repasse')!.sign).toBe('-')
    })
})

describe('2. O AGREGADOR — o lançamento cai no balde certo, não no `default`', () => {
    const lanc = (group: string, amount: number): CashEntry => ({
        amount,
        type: 'EXPENSE',
        expense_group: group,
        expense_category: null,
        description: null,
        due_date: '2026-01-15',
        is_active: true,
        payment_method: null,
        paid_date: '2026-01-15',
        anticipated_amount: null,
        valor_icms: null, valor_pis: null, valor_cofins: null,
        valor_ipi: null, valor_cbs: null, valor_ibs: null,
    })

    it('>>> `REPASSE` soma em `repasse` e em MAIS NENHUM balde <<<', () => {
        const agg = aggregateEntries([lanc('REPASSE', REPASSE)])
        expect(agg.repasse.jan).toBe(REPASSE)
        // O DISCRIMINANTE contra o `default: break`, que faria o valor SUMIR sem erro:
        const total = Object.values(agg).reduce((acc, m) => acc + (m as MonthlyValues).jan, 0)
        expect(total).toBe(REPASSE)
    })

    it('e NÃO contamina a dedução da receita — são grupos diferentes', () => {
        const agg = aggregateEntries([lanc('REPASSE', REPASSE), lanc('DEDUCAO_RECEITA', DEVOLUCAO)])
        expect(agg.repasse.jan).toBe(REPASSE)
        expect(agg.deducaoReceita.jan).toBe(DEVOLUCAO)
    })

    it('`AMORTIZACAO` também soma no balde próprio — a linha órfã passa a poder ser alimentada', () => {
        const agg = aggregateEntries([lanc('AMORTIZACAO', 2_500)])
        expect(agg.amortizacao.jan).toBe(2_500)
    })

    it('despesa NÃO CONFIRMADA (sem `paid_date`) não entra — a regra do HUB vale para o repasse', () => {
        const pendente: CashEntry = { ...lanc('REPASSE', REPASSE), paid_date: null }
        expect(aggregateEntries([pendente]).repasse.jan).toBe(0)
    })
})

describe('3. A ASSIMETRIA — travada como comportamento, não descoberta como surpresa', () => {
    it('>>> um INCOME com `expense_group: REPASSE` vira RECEITA BRUTA assim mesmo <<<', () => {
        // O `continue` do INCOME corta ANTES do `switch`: nenhum INCOME é lido por grupo.
        // Este caso AFIRMA a assimetria de propósito. Quem um dia implementar (ii) ou (iii)
        // de `docs/registros/o-repasse-entra-inteiro-pela-receita.md` vai vê-lo ficar
        // vermelho — e é aí que ele terá feito o seu trabalho.
        const entrada: CashEntry = {
            amount: 50_000,
            type: 'INCOME',
            expense_group: 'REPASSE',
            expense_category: null,
            description: null,
            due_date: '2026-01-15',
            is_active: true,
            payment_method: null,
            paid_date: '2026-01-15',
            anticipated_amount: null,
            valor_icms: null, valor_pis: null, valor_cofins: null,
            valor_ipi: null, valor_cbs: null, valor_ibs: null,
        }
        const agg = aggregateEntries([entrada])
        expect(agg.receitaBruta.jan).toBe(50_000)
        expect(agg.repasse.jan).toBe(0)
    })
})

describe('4. A FONTE ÚNICA conhece o grupo, e o rótulo é o decidido', () => {
    it('`REPASSE` está em `EXPENSE_GROUP_KEYS`', () => {
        expect(EXPENSE_GROUP_KEYS).toContain('REPASSE')
    })

    it('>>> o rótulo do DRE e do fluxo de caixa é "Repasse de mercadorias" <<<', () => {
        expect(EXPENSE_GROUP_META.REPASSE.label).toBe('Repasse de mercadorias')
    })

    it('e ele aparece no seletor de GRUPO — não é derivado nem técnico', () => {
        expect(EXPENSE_GROUP_OPTIONS.map((o) => o.value)).toContain('REPASSE')
    })
})

describe('5. O SELETOR VIVO oferece as três, nos QUATRO regimes', () => {
    // `fluxo-de-caixa` e `controle-financeiro` consomem `expense-categories-by-regime.ts`.
    // Antes desta rodada, Devoluções e Amortização não existiam ali em regime nenhum.
    const REGIMES: (string | null)[] = ['LUCRO_REAL', 'LUCRO_PRESUMIDO', 'SIMPLES_NACIONAL', null]
    const ESPERADAS = ['Repasse de mercadorias', 'Devoluções', 'Amortização de Dívida (principal)']

    describe.each(REGIMES)('regime %s', (regime) => {
        const grupos = getExpenseCategoryOptionsForRegime(regime)
        const valores = grupos.flatMap((g) => g.options.map((o) => o.value))

        it.each(ESPERADAS)('>>> oferece "%s" <<<', (cat) => {
            expect(valores).toContain(cat)
        })

        it('e cada uma RESOLVE para o grupo certo — oferecer sem resolver gravaria grupo nulo', () => {
            expect(getGroupForCategoryByRegime(regime, 'Repasse de mercadorias')).toBe('REPASSE')
            expect(getGroupForCategoryByRegime(regime, 'Devoluções')).toBe('DEDUCAO_RECEITA')
            expect(getGroupForCategoryByRegime(regime, 'Amortização de Dívida (principal)')).toBe('AMORTIZACAO')
        })

        it('o bloco "── Repasse de mercadorias ──" fica LOGO ABAIXO de "── Custo dos Produtos ──"', () => {
            const rotulos = grupos.map((g) => g.label)
            const iRepasse = rotulos.indexOf('── Repasse de mercadorias ──')
            expect(iRepasse).toBeGreaterThanOrEqual(0)
            const iCusto = rotulos.indexOf('── Custo dos Produtos ──')
            // A lista base não tem "Custo dos Produtos": ali o Repasse abre o seletor.
            expect(iRepasse).toBe(iCusto >= 0 ? iCusto + 1 : 0)
        })
    })
})

describe('6. A MIGRAÇÃO cobre TODA a fonte única — não só os três desta rodada', () => {
    const sql = leia('supabase', 'migrations', '20260917000001_repasse_amortizacao_outros_expense_group.sql')

    it.each([...EXPENSE_GROUP_KEYS])('>>> a CHECK aceita `%s` <<<', (key) => {
        // Afirmar só REPASSE deixaria a próxima chave nova fora sem nada ficar vermelho.
        // Derivando da fonte, acrescentar um grupo e esquecer a migração quebra ESTE caso.
        expect(sql).toContain(`'${key}'::text`)
    })

    it('e ela é ALARGAMENTO — a CHECK anterior inteira continua dentro', () => {
        const anterior = leia('supabase', 'migrations', '20260716000001_add_reserva_tecnica_expense_group.sql')
        const grupos = [...anterior.matchAll(/'([A-Z_]+)'::text/g)].map((m) => m[1])
        expect(grupos.length).toBe(16)
        for (const g of grupos) expect(sql).toContain(`'${g}'::text`)
    })
})

describe('7. OS RÓTULOS DE TELA — repasse nomeado onde o usuário o insere', () => {
    const BOTOES = [
        ['pages', 'orcamentos', 'index.tsx'],
        ['pages', 'pedidos', 'index.tsx'],
        ['pages', 'vendas', 'index.tsx'],
    ]

    it.each(BOTOES)('>>> %s/%s: o botão diz "Inserir produtos manuais / Repasse" <<<', (...p) => {
        const src = leia('src', ...p)
        expect(src).toContain('Inserir produtos manuais / Repasse')
        expect(src).not.toContain('Adicionar item manual\n')
    })

    it('o cabeçalho de pedidos também, e o "(imunes ao desconto)" FICA — é R14', () => {
        const src = leia('src', 'pages', 'pedidos', 'index.tsx')
        expect(src).toContain('Produtos manuais / Repasse (imunes ao desconto)')
    })

    it('>>> a linha da decomposição vira "(−) Repasse + frete neles (sem tributo)" <<<', () => {
        const src = leia('src', 'utils', 'decomposition-dre.ts')
        expect(src).toContain("'(−) Repasse + frete neles (sem tributo)'")
        expect(src).not.toContain("'(−) Itens manuais + frete neles (sem tributo)'")
    })
})

describe('8. O RÓTULO é "Repasse de mercadorias" no DRE e no caixa, e SÓ ali', () => {
    // Decisão do dono do produto, 17/09/2026: vale no DRE e no fluxo de caixa; nas telas de
    // documento continua "Inserir produtos manuais / Repasse". São dois rótulos DE PROPÓSITO,
    // e é por isso que o do documento não deriva de `EXPENSE_GROUP_META`.
    describe.each(VARIANTES)('$nome', ({ build }) => {
        it('>>> a linha do DRE diz "Repasse de mercadorias" <<<', () => {
            expect(linha(build(comRepasse()), 'repasse')!.label).toBe('(-) Repasse de mercadorias')
        })
    })

    it('a CATEGORIA do fluxo de caixa também — é o valor gravado, não só o rótulo', () => {
        const valores = getExpenseCategoryOptionsForRegime('LUCRO_REAL').flatMap((g) => g.options.map((o) => o.value))
        expect(valores).toContain('Repasse de mercadorias')
        // O DISCRIMINANTE: renomear só o rótulo do grupo e esquecer a categoria deixaria o
        // seletor oferecendo "Repasse" e o DRE dizendo outra coisa.
        expect(valores).not.toContain('Repasse')
    })

    it('>>> e as TELAS DE DOCUMENTO continuam com o rótulo delas — não foram arrastadas <<<', () => {
        for (const p of [['pages','orcamentos','index.tsx'],['pages','pedidos','index.tsx'],['pages','vendas','index.tsx']]) {
            const src = leia('src', ...p)
            expect(src).toContain('Inserir produtos manuais / Repasse')
            expect(src).not.toContain('Inserir produtos manuais / Repasse de mercadorias')
        }
    })
})

describe('9. A ORDEM DO BLOCO: devolução, depois repasse, cada uma em linha própria', () => {
    describe.each(VARIANTES)('$nome', ({ build, devolucao }) => {
        const rows = build(comRepasse())

        it('>>> o repasse é a PRÓXIMA linha do mesmo nível depois da devolução <<<', () => {
            // Mais forte que "vem depois": afirma que NADA do mesmo nível se intromete entre
            // as duas. Sem isto, inserir uma dedução no meio passaria despercebido.
            const iDev = indice(rows, devolucao)
            const nivelDev = rows[iDev].indent ?? 0
            const seguintes = rows.slice(iDev + 1).filter((r) => (r.indent ?? 0) <= nivelDev)
            expect(seguintes[0]?.key).toBe('repasse')
        })

        it('e o que vier entre elas é SUBITEM da devolução — o caso da RET', () => {
            const iDev = indice(rows, devolucao)
            const meio = rows.slice(iDev + 1, indice(rows, 'repasse'))
            for (const r of meio) expect(r.indent ?? 0).toBeGreaterThan(rows[iDev].indent ?? 0)
        })
    })
})

describe('10. A BASE DA ANÁLISE VERTICAL — UMA SÓ, o faturamento total', () => {
    // Decisão do dono do produto, 17/09/2026: as TRÊS variantes usam o FATURAMENTO TOTAL
    // como 100%. Antes, LR e Simples Híbrido usavam `receitaBruta − imposto −
    // atividadesTerceirizadas`, e as outras três o faturamento do Hub.
    //
    // ── O QUE A UNIFORMIZAÇÃO **NÃO** PODIA FAZER, e por que o `receitaBrutaBase` FICOU ──
    //
    // `receitaBrutaBase` fazia DOIS trabalhos: a régua dos percentuais E o ponto de partida
    // da aritmética. Apagar o condicional, como a leitura literal pedia, levaria o Lucro
    // Líquido do LR de R$ 46.700,00 para R$ 52.500,00 — +R$ 5.800,00, que é
    // `imposto 5.000 + terceirizadas 800`, deduzidos SÓ no bloco de cabeçalho do LR.
    //
    // Os papéis foram separados: `baseAV` é a régua, `receitaBrutaBase` segue sendo a conta.
    // Os casos abaixo travam AS DUAS coisas — a régua uniforme E os R$ intactos —, porque
    // afirmar só a régua deixaria a quebra dos valores passar verde.
    const BASE = comRepasse()
    const FATURAMENTO = 100_000

    describe.each(VARIANTES)('$nome', ({ build }) => {
        const rows = build(BASE)

        it('>>> TODA linha mede contra o FATURAMENTO — `valor ÷ faturamento` <<<', () => {
            // O DISCRIMINANTE: no LR a régua antiga era 94.200. Qualquer linha medida contra
            // ela dá um percentual diferente, e este caso pega cada uma delas.
            const comPct = rows.filter((r) => r.pctOfRL !== undefined)
            expect(comPct.length).toBeGreaterThan(5)
            for (const r of comPct) {
                expect(r.pctOfRL!.jan).toBeCloseTo((r.values.jan / FATURAMENTO) * 100, 6)
            }
        })
    })

    it('>>> LUCRO REAL: a linha de 100% é o FATURAMENTO TOTAL, e ela EXIBE o percentual <<<', () => {
        const rows = buildDreLucroRealPresumido(BASE, 'RESALE', 'LUCRO_REAL')
        const fat = linha(rows, 'faturamento_total')!
        expect(fat.values.jan).toBe(FATURAMENTO)
        // Antes desta rodada era `pctOfRL: undefined` — a régua era outra linha.
        expect(fat.pctOfRL).toBeDefined()
        expect(fat.pctOfRL!.jan).toBeCloseTo(100, 6)
    })

    it('>>> e a "Receita Bruta" do LR NÃO é mais 100% — é a fração dele <<<', () => {
        // A resposta medida à pergunta "as duas viram o mesmo número?": NÃO.
        // 100.000 contra 94.200 — não há duas linhas iguais com nomes diferentes.
        const rows = buildDreLucroRealPresumido(BASE, 'RESALE', 'LUCRO_REAL')
        const rb = linha(rows, 'receita_bruta')!
        expect(rb.values.jan).toBe(94_200)
        expect(rb.values.jan).not.toBe(linha(rows, 'faturamento_total')!.values.jan)
        expect(rb.pctOfRL!.jan).toBeCloseTo(94.2, 6)
    })

    it('>>> OS VALORES EM R$ NÃO MUDARAM — o Lucro Líquido do LR segue R$ 46.700,00 <<<', () => {
        // ESTE é o caso que separa a uniformização certa da literal. Apagar o condicional
        // daria 52.500,00 aqui, e todo o resto da suíte continuaria verde.
        const rows = buildDreLucroRealPresumido(BASE, 'RESALE', 'LUCRO_REAL')
        expect(linha(rows, 'lucro_liquido')!.values.jan).toBe(46_700)
        expect(linha(rows, 'receita_liquida')!.values.jan).toBe(79_900)
        expect(linha(rows, 'lucro_bruto')!.values.jan).toBe(57_900)
    })

    it('e LP, RET e SN não mudaram NADA — nem R$, nem régua', () => {
        for (const rows of [
            buildDreLucroRealPresumido(BASE, 'RESALE', 'LUCRO_PRESUMIDO'),
            buildDrePresumidoRET(BASE),
            buildDreSimplesNacional(BASE, 'RESALE'),
        ]) {
            expect(linha(rows, 'receita_bruta')!.values.jan).toBe(FATURAMENTO)
            expect(linha(rows, 'receita_bruta')!.pctOfRL!.jan).toBeCloseTo(100, 6)
            expect(rows.find((r) => r.isTotal)!.values.jan).toBe(51_400)
        }
    })
})

describe('11. O BLOCO DE DEDUÇÕES COMEÇA NA DEVOLUÇÃO', () => {
    // Acrescentado a pedido do dono do produto, e é barato porque a âncora é a linha
    // `receita_bruta`, não a posição absoluta.
    //
    // A afirmação NÃO é "a devolução é a primeira dedução da demonstração": no Lucro Real
    // existe um bloco de deduções ANTES da Receita Bruta (tributos por fora e atividades de
    // entrega), e afirmar o contrário seria falso. A afirmação é a que importa e vale nas
    // três: **depois da Receita Bruta, a primeira dedução é a devolução.**
    describe.each(VARIANTES)('$nome', ({ build, devolucao }) => {
        it('>>> a primeira linha depois da Receita Bruta é a DEVOLUÇÃO <<<', () => {
            const rows = build(comRepasse())
            const iRB = indice(rows, 'receita_bruta')
            expect(iRB).toBeGreaterThanOrEqual(0)
            expect(rows[iRB + 1]?.key).toBe(devolucao)
        })
    })
})
