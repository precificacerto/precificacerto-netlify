/**
 * "(-) Devoluções e Deduções da Receita" é LINHA PRÓPRIA, logo após a Receita Bruta.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * A FIXTURE É OBRIGATÓRIA, E ESTA É A RAZÃO
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * **ZERO lançamentos da base usam `expense_group = 'DEDUCAO_RECEITA'`.** A categoria existe
 * desde o #58 (09/09/2026) e NUNCA FOI LANÇADA. Um teste rodado contra os dados reais somaria
 * `0` em todas as linhas e **passaria verde sem exercitar nada** — a mesma armadilha do caso
 * MEI com alíquota zero, registrada em `.claude/rules/teste-que-nao-exercita.md`, variante 2:
 * *"o caso escolhido não discrimina"*.
 *
 * Por isso todo caso abaixo constrói `deducaoReceita` DIFERENTE DE ZERO e afirma o **ÍNDICE**
 * da linha, não a existência dela. Índice é o que discrimina posição; existência não.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * O DESCUIDO, e ele é MEU, DE ONTEM — não é `decisao-sob-regra-da-epoca`
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * A linha nasceu no #58, em 09/09/2026. **Não havia critério de época a respeitar**: eu a
 * inseri no ponto SINTATICAMENTE CONVENIENTE — logo antes do subtotal `receita_liquida` — sem
 * decidir a ordem contábil, e com `indent: 1`, que a fazia parecer subitem do bloco tributário.
 *
 * `buildDrePresumidoRET` **já estava certa** desde o LP-RET-013 e serve de MODELO: lá a linha
 * vem imediatamente depois da Receita Bruta. Essa variante NÃO foi tocada.
 *
 * O QUE QUEBRA SEM A CORREÇÃO, e é o que os casos abaixo travam:
 *   1. a devolução aparece ABAIXO dos impostos e RECUADA como filha deles — quem lê a
 *      demonstração conclui que devolução é dedução tributária;
 *   2. no Simples, aparece depois do DAS, sugerindo dedução sobre valor já líquido de imposto;
 *   3. nenhum teste afirmava ORDEM, então a troca passaria despercebida.
 *
 * RESSALVA DE MÉTODO, dita por extenso: esta correção é de POSIÇÃO E AGRUPAMENTO. O VALOR da
 * Receita Líquida NÃO muda — ela continua sendo a Receita Bruta menos devoluções E menos
 * tributos. Mover a linha sem mexer no subtotal é deliberado: alterar o número seria mudança de
 * conta, que não foi pedida. Há caso abaixo afirmando essa invariância.
 */

import {
    buildDreLucroRealPresumido,
    buildDrePresumidoRET,
    buildDreSimplesNacional,
    type AggregatedData,
    type DreRow,
    type MonthlyValues,
} from '@/pages/dfc'

const ZERO: MonthlyValues = {
    jan: 0, feb: 0, mar: 0, apr: 0, may: 0, jun: 0,
    jul: 0, aug: 0, sep: 0, oct: 0, nov: 0, dec: 0,
}
const mes = (v: number): MonthlyValues => ({ ...ZERO, jan: v })

/**
 * A FIXTURE. Todos os valores são diferentes entre si de propósito: se dois coincidissem, um
 * caso poderia passar somando a linha errada sem que a asserção percebesse.
 */
const comDevolucao = (): AggregatedData => ({
    receitaBruta: mes(100_000),
    deducaoReceita: mes(7_000),      // ← o que este arquivo existe para exercitar
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

const indice = (rows: DreRow[], key: string) => rows.findIndex((r) => r.key === key)
const linha = (rows: DreRow[], key: string) => rows.find((r) => r.key === key)

/** Toda linha que representa dedução TRIBUTÁRIA, em qualquer das três variantes. */
const CHAVES_TRIBUTARIAS = ['impostos_receita', 'deducoes_trib_receita', 'deducoes_trib', 'das']

const VARIANTES: {
    nome: string
    build: (a: AggregatedData) => DreRow[]
    chave: string
    /** `false` na RET, que mantém `indent: 1` — ver o `describe` do fim do arquivo. */
    semIndent: boolean
}[] = [
    {
        nome: 'Lucro Real',
        build: (a) => buildDreLucroRealPresumido(a, 'RESALE', 'LUCRO_REAL'),
        chave: 'deducoes_devolucoes',
        semIndent: true,
    },
    {
        nome: 'Lucro Presumido',
        build: (a) => buildDreLucroRealPresumido(a, 'RESALE', 'LUCRO_PRESUMIDO'),
        chave: 'deducoes_devolucoes',
        semIndent: true,
    },
    {
        nome: 'Simples Nacional',
        build: (a) => buildDreSimplesNacional(a, 'RESALE'),
        chave: 'deducoes_devolucoes',
        semIndent: true,
    },
    {
        // A que JÁ estava certa. Entra para provar que continua certa — e para o teste não
        // afirmar só sobre o que eu mexi.
        nome: 'Presumido RET (modelo, não tocada)',
        build: (a) => buildDrePresumidoRET(a),
        chave: 'deducoes_receita',
        semIndent: false,
    },
]

describe.each(VARIANTES)('$nome — a devolução tem linha própria e posição certa', ({ build, chave, semIndent }) => {
    const rows = build(comDevolucao())

    it('a linha EXISTE e carrega o valor da fixture, não zero', () => {
        // Sem isto, todos os casos de posição abaixo poderiam passar sobre uma linha zerada —
        // que é exatamente o que aconteceria rodando contra a base real.
        const l = linha(rows, chave)
        expect(l).toBeDefined()
        expect(l!.values.jan).toBe(7_000)
        expect(l!.total).toBe(7_000)
    })

    it('vem DEPOIS da Receita Bruta', () => {
        expect(indice(rows, chave)).toBeGreaterThan(indice(rows, 'receita_bruta'))
    })

    it('vem ANTES de QUALQUER linha de dedução tributária', () => {
        // O caso decisivo do arquivo. Antes da correção, nas duas variantes que eu mexi, a
        // devolução vinha DEPOIS dos impostos.
        const iDevolucao = indice(rows, chave)
        for (const trib of CHAVES_TRIBUTARIAS) {
            const iTrib = indice(rows, trib)
            if (iTrib === -1) continue // a variante não tem essa linha
            expect(iDevolucao).toBeLessThan(iTrib)
        }
    })

    it('vem ANTES do subtotal de Receita Líquida', () => {
        expect(indice(rows, chave)).toBeLessThan(indice(rows, 'receita_liquida'))
    })

    const talvez = semIndent ? it : it.skip

    talvez('NÃO é subitem: sem `indent`, ao contrário das tributárias', () => {
        // `indent: 1` afirmava visualmente que devolução é filha do bloco tributário. É a
        // metade "agrupamento" da correção, e sem este caso ela poderia ser desfeita sozinha.
        expect(linha(rows, chave)!.indent).toBeUndefined()
    })

    talvez('as linhas tributárias CONTINUAM recuadas — a correção não nivelou tudo', () => {
        // Contraprova: se alguém "corrigisse" tirando o indent de todas, este caso fica
        // vermelho. O que se afirma é a DISTINÇÃO entre os dois, não a ausência de recuo.
        const tributariasPresentes = CHAVES_TRIBUTARIAS
            .map((k) => linha(rows, k))
            .filter((l): l is DreRow => !!l)
        expect(tributariasPresentes.length).toBeGreaterThan(0)
        for (const t of tributariasPresentes) expect(t.indent).toBeGreaterThanOrEqual(1)
    })

    it('a devolução NÃO está somada dentro da linha tributária', () => {
        // Se estivesse agrupada, o valor da tributária conteria os 7.000 da devolução.
        for (const trib of CHAVES_TRIBUTARIAS) {
            const l = linha(rows, trib)
            if (!l) continue
            expect(l.values.jan).not.toBe(7_000)
            expect(l.values.jan).not.toBe(12_000) // 5.000 + 7.000
            expect(l.values.jan).not.toBe(10_000) // 3.000 + 7.000
        }
    })
})

describe('a correção é de POSIÇÃO, não de conta — o valor não muda', () => {
    // Ressalva de método afirmada em teste: mover a linha sem mexer no subtotal foi deliberado.
    // Se alguém "melhorar" a ordem alterando o cálculo, este caso fica vermelho.
    it('Lucro Real: Receita Líquida = Bruta − impostos por dentro − devoluções', () => {
        const rows = buildDreLucroRealPresumido(comDevolucao(), 'RESALE', 'LUCRO_REAL')
        // A base do LR desconta imposto e atividades terceirizadas da receita bruta antes.
        const bruta = linha(rows, 'receita_bruta')!.values.jan
        expect(linha(rows, 'receita_liquida')!.values.jan).toBe(bruta - 3_000 - 7_000)
    })

    it('Lucro Presumido: Receita Líquida = Bruta − imposto − devoluções', () => {
        const rows = buildDreLucroRealPresumido(comDevolucao(), 'RESALE', 'LUCRO_PRESUMIDO')
        expect(linha(rows, 'receita_liquida')!.values.jan).toBe(100_000 - 5_000 - 7_000)
    })

    it('Simples Nacional: Receita Líquida = Bruta − DAS − devoluções', () => {
        const rows = buildDreSimplesNacional(comDevolucao(), 'RESALE')
        expect(linha(rows, 'receita_liquida')!.values.jan).toBe(100_000 - 5_000 - 7_000)
    })
})

describe('sem devolução, a linha aparece zerada e continua no lugar certo', () => {
    // O caso que a base real produziria hoje. Ele NÃO substitui os de cima: prova que a
    // posição se mantém quando o valor é zero, e é justamente por passar assim que ele não
    // poderia ser o único caso do arquivo.
    const semDevolucao = (): AggregatedData => ({ ...comDevolucao(), deducaoReceita: { ...ZERO } })

    it.each(VARIANTES)('$nome', ({ build, chave }) => {
        const rows = build(semDevolucao())
        expect(linha(rows, chave)!.values.jan).toBe(0)
        expect(indice(rows, chave)).toBeGreaterThan(indice(rows, 'receita_bruta'))
        expect(indice(rows, chave)).toBeLessThan(indice(rows, 'receita_liquida'))
    })
})

describe('A RET mantém `indent: 1` — divergência REMANESCENTE, registrada e não corrigida', () => {
    /**
     * A variante Presumido RET é o MODELO DE POSIÇÃO e não foi tocada, por ordem expressa. Mas
     * ela **mantém `indent: 1`** na linha de devoluções, enquanto as duas corrigidas perderam o
     * recuo. Ou seja: o critério "devolução não é subitem de tributo" vale nas três, e o
     * agrupamento visual só foi ajustado em duas.
     *
     * Isto NÃO é esquecimento — é o alcance do que foi mandado corrigir. Fica afirmado em teste
     * para que a divergência seja uma DECISÃO visível e não uma surpresa: se um dia a RET
     * perder o recuo, este caso fica vermelho e obriga a atualizar o registro.
     *
     * A RAZÃO DE ELA TER RECUO é outra, e vale citar: ali a linha é CABEÇALHO de dois
     * subitens — `inss_retido` e `iss_retido`, com `indent: 2`. O recuo dela não a torna filha
     * de tributo; ela é MÃE de duas retenções. Nas outras duas variantes não havia subitem
     * nenhum, e o recuo só a aproximava do bloco errado.
     */
    const rows = buildDrePresumidoRET(comDevolucao())

    it('a linha da RET continua com `indent: 1`', () => {
        expect(linha(rows, 'deducoes_receita')!.indent).toBe(1)
    })

    it('e ela é MÃE de dois subitens com recuo maior — não filha de tributo', () => {
        expect(linha(rows, 'inss_retido')!.indent).toBe(2)
        expect(linha(rows, 'iss_retido')!.indent).toBe(2)
    })
})

describe('AMORTIZAÇÃO — a mesma armadilha, e ela JÁ ESTAVA NO `main`', () => {
    /**
     * ═══════════════════════════════════════════════════════════════════════════════════════
     * CORREÇÃO DE UM TESTE QUE NÃO EXERCITAVA — MERGEADO NO #58, DESCOBERTO EM 10/09/2026
     * ═══════════════════════════════════════════════════════════════════════════════════════
     * Os casos de Amortização do #58 (`grupos-devolucoes-amortizacao.test.ts`) NÃO têm fixture
     * **e também não rodam contra dados reais**: eles afirmam o ARQUIVO-FONTE por casamento de
     * string —
     *
     *     expect(DFC.split("buildRow('amortizacao'").length - 1).toBe(3)
     *     expect(DFC).toContain('subtractMonths(resultadoFinanceiro, agg.amortizacao)')
     *
     * Isso afirma que o TEXTO existe no arquivo, não que a linha tem EFEITO. É a **variante 3**
     * de `.claude/rules/teste-que-nao-exercita.md` — *"a asserção afirma PASSAGEM, não EFEITO"*
     * — e o comentário daquele caso CITA a variante 3 enquanto a comete.
     *
     * Medido em 10/09/2026: `AMORTIZACAO` tem **ZERO lançamentos** na base, entre 16 grupos e
     * 1.596 linhas — idêntico ao `DEDUCAO_RECEITA`. Ou seja: nem a fonte, nem os dados, nem
     * fixture. Nada exercitava a linha.
     *
     * A regra dizia o que fazer, e é o que se faz aqui: *"quando a pergunta 3 não tem resposta
     * boa porque a função não é exportada, EXPORTE a função"*. As três `buildDre*` foram
     * exportadas nesta rodada, e agora dá para afirmar VALOR e POSIÇÃO em vez de texto.
     */
    const comAmortizacao = comDevolucao // a fixture já traz `amortizacao: 2.500`

    const VARIANTES_COM_AMORTIZACAO = [
        { nome: 'Lucro Real', build: (a: AggregatedData) => buildDreLucroRealPresumido(a, 'RESALE', 'LUCRO_REAL') },
        { nome: 'Lucro Presumido', build: (a: AggregatedData) => buildDreLucroRealPresumido(a, 'RESALE', 'LUCRO_PRESUMIDO') },
        { nome: 'Presumido RET', build: (a: AggregatedData) => buildDrePresumidoRET(a) },
        { nome: 'Simples Nacional', build: (a: AggregatedData) => buildDreSimplesNacional(a, 'RESALE') },
    ]

    it.each(VARIANTES_COM_AMORTIZACAO)('$nome: a linha carrega o VALOR, não só existe', ({ build }) => {
        const l = linha(build(comAmortizacao()), 'amortizacao')
        expect(l).toBeDefined()
        expect(l!.values.jan).toBe(2_500)
    })

    it.each(VARIANTES_COM_AMORTIZACAO)('$nome: vem DEPOIS do resultado operacional', ({ build }) => {
        // O requisito do #58: amortização não é despesa operacional, entra depois do resultado.
        // Afirmar isso por índice é o que o casamento de string não conseguia fazer.
        const rows = build(comAmortizacao())
        const iAmort = indice(rows, 'amortizacao')
        const iOperacional = ['lucro_operacional', 'resultado_financeiro', 'resultado_antes_imposto']
            .map((k) => indice(rows, k))
            .filter((i) => i !== -1)
        expect(iOperacional.length).toBeGreaterThan(0)
        for (const i of iOperacional) expect(iAmort).toBeGreaterThan(i)
    })

    it.each(VARIANTES_COM_AMORTIZACAO)('$nome: vem ANTES do total, e o total a SUBTRAI', ({ build }) => {
        // O caso decisivo: exibir a linha sem subtrair é a variante 3 outra vez. Comparar o
        // total COM e SEM amortização prova o efeito — a diferença tem de ser exatamente 2.500.
        const rows = build(comAmortizacao())
        const semAmort = build({ ...comAmortizacao(), amortizacao: { ...ZERO } })
        expect(indice(rows, 'amortizacao')).toBeLessThan(indice(rows, 'lucro_liquido'))
        const comTotal = linha(rows, 'lucro_liquido')!.values.jan
        const semTotal = linha(semAmort, 'lucro_liquido')!.values.jan
        expect(semTotal - comTotal).toBe(2_500)
    })

    it.each(VARIANTES_COM_AMORTIZACAO)('$nome: NÃO está somada nas despesas operacionais', ({ build }) => {
        const rows = build(comAmortizacao())
        for (const k of ['desp_financeira', 'desp_fixa', 'desp_variavel', 'desp_op', 'desp_op_header']) {
            const l = linha(rows, k)
            if (!l) continue
            expect(l.values.jan).not.toBe(2_500)
        }
    })
})
