/**
 * Pendência 1 — a travessia dos acréscimos passa a LER e GRAVAR.
 *
 * Regra: `.claude/rules/cascata-lucro-real.md` R21. Até aqui `checkInheritedAllocation`
 * existia, estava testada, e NENHUMA tela a chamava: as colunas existiam, a função existia, e
 * o frete morria no orçamento. É `portao-que-nao-alcanca.md` no outro instrumento — a proteção
 * estava declarada e não era exercida por caminho nenhum.
 */

import { readFileSync } from 'fs'
import { join } from 'path'

import {
    BUDGET_ITEM_COLUMNS_FOR_ORDER,
    mapBudgetItemsToOrderItems,
    type BudgetItemForOrder,
} from '@/utils/budget-item-to-order-item'
import {
    BUDGET_ITEM_COLUMNS_FOR_SALE,
    mapBudgetItemsToSaleItems,
    type BudgetItemForSale,
} from '@/utils/budget-item-to-sale-item'
import {
    DOCUMENT_ACCESSORY_COLUMNS,
    INHERITANCE_VERDICT_MESSAGE,
    INHERITANCE_VERDICT_TONE,
    buildDocumentAccessoriesPayload,
    inheritDocumentAccessories,
    resolveAccessoriesSource,
    resolveDocumentAccessoriesInheritance,
    type AccessoriesResult,
    type AccessoriesSourceDecision,
    type DocumentQuotation,
} from '@/utils/budget-accessories'
import type { TenantSnapshotContext } from '@/lib/items-snapshot'

const raiz = join(__dirname, '..', '..', '..')
const ler = (p: string) => readFileSync(join(raiz, 'src', p), 'utf-8')

const CTX: TenantSnapshotContext = {
    regime: 'LUCRO_REAL', rates: [], csll_pct: 0, irpj_pct: 0, use_snapshot_rates: false,
}

describe('pendência 1 — a travessia lê e grava', () => {
    describe('1. A PARCELA POR ITEM atravessa congelada', () => {
        const item: BudgetItemForOrder & BudgetItemForSale = {
            product_id: 'p1',
            quantity: 3,
            unit_price: 100,
            discount: 0,
            freight_allocated_value: 2554.35,
            accessories_allocated_value: 78.19,
        }

        it('orçamento → PEDIDO: o valor chega intacto, sem recálculo', () => {
            const [linha] = mapBudgetItemsToOrderItems([item], 'ord-1', { products: [], services: [] })
            expect(linha.freight_allocated_value).toBe(2554.35)
            expect(linha.accessories_allocated_value).toBe(78.19)
        })

        it('orçamento → VENDA: idem', () => {
            const [linha] = mapBudgetItemsToSaleItems([item], {
                saleId: 'sale-1', snapshotCtx: CTX, products: [], services: [],
            })
            expect(linha.freight_allocated_value).toBe(2554.35)
            expect(linha.accessories_allocated_value).toBe(78.19)
        })

        it('item sem rateio atravessa como `null`, NUNCA como zero', () => {
            // `0` afirmaria "rateado e coube zero"; `null` diz "não rateado". A distinção
            // decide se o documento derivado tem rateio a conferir.
            const semRateio: BudgetItemForOrder = { product_id: 'p1', quantity: 1, unit_price: 10 }
            const [linha] = mapBudgetItemsToOrderItems([semRateio], 'ord-1', { products: [], services: [] })
            expect(linha.freight_allocated_value).toBeNull()
            expect(linha.accessories_allocated_value).toBeNull()
        })

        it('as duas colunas estão nos DOIS contratos de `select`', () => {
            // Sem isto o campo chega `undefined`, grava NULL, e o frete morre na travessia —
            // o mecanismo que este arquivo de mapeamento já pagou com `destination_snapshot`
            // e com `rt_pct`.
            for (const col of ['freight_allocated_value', 'accessories_allocated_value'] as const) {
                expect(BUDGET_ITEM_COLUMNS_FOR_ORDER).toContain(col)
                expect(BUDGET_ITEM_COLUMNS_FOR_SALE).toContain(col)
            }
        })
    })

    describe('2. O CABEÇALHO atravessa por cópia literal', () => {
        it('origem com cotação: os cinco campos são copiados', () => {
            const r = inheritDocumentAccessories({
                freight_value: 3000,
                insurance_value: 500,
                accessory_expenses_value: 0,
                freight_allocation_criteria: 'PESO',
                freight_allocation_base: 358119.13,
            })
            expect(r).toEqual({
                freight_value: 3000,
                insurance_value: 500,
                accessory_expenses_value: 0,
                freight_allocation_criteria: 'PESO',
                freight_allocation_base: 358119.13,
            })
            expect(Object.keys(r).sort()).toEqual([...DOCUMENT_ACCESSORY_COLUMNS].sort())
        })

        it('origem SEM cotação devolve `{}` — e `{}` não é cinco zeros', () => {
            // O contraste é a asserção. Gravar zeros afirmaria "cotei e não houve frete" num
            // documento em que ninguém cotou, e é essa afirmação que faz o rateio mandar sobre
            // o cadastro do produto (R11). Com `{}`, o `insert` sequer menciona as colunas.
            expect(inheritDocumentAccessories(null)).toEqual({})
            expect(inheritDocumentAccessories({})).toEqual({})
            expect(inheritDocumentAccessories({ freight_value: null, insurance_value: null })).toEqual({})

            // E ZERO EXPLÍCITO na origem atravessa, porque ali alguém cotou.
            const zeroExplicito = inheritDocumentAccessories({ freight_value: 0 })
            expect(zeroExplicito.freight_value).toBe(0)
            expect(Object.keys(zeroExplicito)).toHaveLength(5)
        })
    })

    describe('3. AS TRÊS TRAVESSIAS CHAMAM A MESMA FUNÇÃO', () => {
        // É o que impede a `copia-divergente`: um literal por rota faria a terceira esquecer
        // um campo, e o frete morreria ali sem nada falhar.
        it('orçamento → pedido e orçamento → venda, em `orcamentos/index.tsx`', () => {
            const src = ler('pages/orcamentos/index.tsx')
            expect(src).toContain('inheritDocumentAccessories')
            expect((src.match(/inheritDocumentAccessories\(/g) || []).length).toBeGreaterThanOrEqual(2)
        })

        it('orçamento → venda, em `vendas/index.tsx`', () => {
            expect(ler('pages/vendas/index.tsx')).toContain('inheritDocumentAccessories')
        })

        it('nenhuma rota grava os campos por literal solto', () => {
            // Se alguém voltar a escrever `freight_value:` à mão num `insert` de documento
            // derivado, este caso pega. O orçamento grava por literal de propósito — é ele
            // quem COTA — e por isso só as rotas derivadas são conferidas.
            const vendas = ler('pages/vendas/index.tsx')
            expect(vendas).not.toMatch(/freight_allocation_base:\s*\(/)
        })
    })

    describe('4. O VEREDITO CHEGA À TELA — e INDETERMINADO não parece conferido', () => {
        it('cada veredito tem mensagem própria, e nenhuma é vazia', () => {
            for (const v of ['VALIDO', 'SEM_RATEIO', 'CONJUNTO_MUDOU', 'INDETERMINADO'] as const) {
                expect(INHERITANCE_VERDICT_MESSAGE[v].length).toBeGreaterThan(20)
            }
        })

        it('INDETERMINADO tem o MESMO tom de alerta que CONJUNTO_MUDOU', () => {
            // É o ponto da pendência. Se `INDETERMINADO` fosse `ok`, um documento anterior à
            // coluna da base apareceria com o mesmo visto verde de um documento conferido —
            // `ausente-vs-falso.md`: o certo é não afirmar nada, e um visto verde afirma.
            expect(INHERITANCE_VERDICT_TONE.INDETERMINADO).toBe('alerta')
            expect(INHERITANCE_VERDICT_TONE.CONJUNTO_MUDOU).toBe('alerta')
            expect(INHERITANCE_VERDICT_TONE.VALIDO).toBe('ok')
        })

        it('a mensagem de INDETERMINADO NÃO diz que está válido nem conferido', () => {
            const m = INHERITANCE_VERDICT_MESSAGE.INDETERMINADO
            expect(m).toMatch(/não foi possível conferir/i)
            expect(m).toMatch(/sem verificação/i)
            expect(m).not.toMatch(/\bválid/i)
        })

        it('a conferência do documento derivado produz os quatro vereditos, POR EFEITO', () => {
            // A primeira versão deste caso afirmava que o nome da função aparecia no arquivo
            // da tela, e uma mutação com `return null` ANTES da chamada passou verde — a
            // asserção via PASSAGEM, não EFEITO. Agora os vereditos saem de dados.
            const doc = {
                freight_value: 3000, insurance_value: 500, accessory_expenses_value: 0,
                freight_allocation_criteria: 'VALOR', freight_allocation_base: 400,
            }
            const itensIntactos = [
                { total_price: 300, freight_allocated_value: 2625, accessories_allocated_value: 437.5 },
                { total_price: 100, freight_allocated_value: 375, accessories_allocated_value: 62.5 },
            ]

            expect(resolveDocumentAccessoriesInheritance(doc, itensIntactos)!.verdict).toBe('VALIDO')

            // Item removido: a soma das parcelas não cobre mais o cotado.
            expect(resolveDocumentAccessoriesInheritance(doc, [itensIntactos[0]])!.verdict).toBe('CONJUNTO_MUDOU')

            // Quantidade mudou e a soma AINDA fecha — só a base pega.
            expect(resolveDocumentAccessoriesInheritance(doc, [
                { ...itensIntactos[0], total_price: 400 }, itensIntactos[1],
            ])!.verdict).toBe('CONJUNTO_MUDOU')

            // Sem a base gravada: INDETERMINADO, jamais VALIDO.
            expect(resolveDocumentAccessoriesInheritance(
                { ...doc, freight_allocation_base: null },
                [{ ...itensIntactos[0], total_price: 400 }, itensIntactos[1]],
            )!.verdict).toBe('INDETERMINADO')

            // Documento sem cotação: não há rateio a conferir.
            expect(resolveDocumentAccessoriesInheritance({}, itensIntactos)!.verdict).toBe('SEM_RATEIO')

            // Sem documento carregado: `null` — e `null` NÃO é "está tudo certo".
            expect(resolveDocumentAccessoriesInheritance(null, itensIntactos)).toBeNull()
        })

        it('a tela do PEDIDO consome a função pura, a mensagem e o tom', () => {
            // Asserção estrutural, e assumida como tal: a suíte não tem teste de componente,
            // então o que sobra sem cobertura é a renderização do `div`. A lógica inteira
            // saiu do componente justamente para reduzir essa superfície a uma linha de JSX.
            const src = ler('pages/pedidos/index.tsx')
            expect(src).toContain('resolveDocumentAccessoriesInheritance')
            expect(src).toContain('INHERITANCE_VERDICT_MESSAGE')
            expect(src).toContain('INHERITANCE_VERDICT_TONE')
            // E lê as parcelas dos itens — sem isso a soma sairia zero e todo pedido com
            // rateio pareceria ter perdido itens.
            expect(src).toContain('freight_allocated_value')
        })
    })

  describe('5. A BASE DO RATEIO é gravada — sem ela, todo documento novo nasce INDETERMINADO', () => {
    const origem = resolveAccessoriesSource({
      freightValue: 3000, insuranceValue: 500, accessoryExpensesValue: 0, criteria: 'VALOR',
    })
    const rateio = { errors: [], montanteACarregar: 358119.13 } as unknown as AccessoriesResult

    it('o payload traz os CINCO campos, com a base entre eles', () => {
      const p = buildDocumentAccessoriesPayload(origem, rateio)
      expect(p.freight_value).toBe(3000)
      expect(p.insurance_value).toBe(500)
      expect(p.accessory_expenses_value).toBe(0)
      expect(p.freight_allocation_criteria).toBe('VALOR')
      // O campo que faltava. Sem ele a conferência da travessia não tem contra o que comparar.
      expect(p.freight_allocation_base).toBe(358119.13)
      expect(Object.keys(p)).toHaveLength(5)
    })

    it('o EFEITO: com a base gravada o documento derivado sai VÁLIDO; sem ela, INDETERMINADO', () => {
      // É o ponto da pendência, e o contraste é a asserção. Os dois documentos têm o MESMO
      // rateio e os MESMOS itens — só um deles gravou a base.
      const p = buildDocumentAccessoriesPayload(origem, rateio)
      const itens = [
        { total_price: 261360.14, freight_allocated_value: 2554.35, accessories_allocated_value: 0 },
        { total_price: 88758.99, freight_allocated_value: 867.47, accessories_allocated_value: 0 },
        { total_price: 8000, freight_allocated_value: 78.18, accessories_allocated_value: 0 },
      ]
      // As parcelas somam 3.500,00 — o cotado —, então a primeira conferência passa nos dois.
      expect(resolveDocumentAccessoriesInheritance(p, itens)!.verdict).toBe('VALIDO')
      expect(resolveDocumentAccessoriesInheritance({ ...p, freight_allocation_base: null }, itens)!.verdict)
        .toBe('INDETERMINADO')
    })

    it('rateio com ERRO grava base `null` — cotou, mas não há base apurada a declarar', () => {
      const comErro = { errors: ['critério PESO escolhido…'], montanteACarregar: 0 } as unknown as AccessoriesResult
      expect(buildDocumentAccessoriesPayload(origem, comErro).freight_allocation_base).toBeNull()
      expect(buildDocumentAccessoriesPayload(origem, null).freight_allocation_base).toBeNull()
    })

    it('documento sem cotação: `{}`, e nenhuma das cinco colunas é mencionada', () => {
      const semCotacao = resolveAccessoriesSource({ freightValue: null })
      expect(buildDocumentAccessoriesPayload(semCotacao, rateio)).toEqual({})
    })

    it('as DUAS rotas de gravação do orçamento usam a função — nenhuma tem literal próprio', () => {
      // O literal estava escrito duas vezes quando a base precisou entrar. Acrescentar o
      // campo numa cópia e não na outra é a `copia-divergente`, com a agravante de o campo
      // esquecido ser justamente o que torna o rateio verificável.
      const src = ler('pages/orcamentos/index.tsx')
      expect((src.match(/buildDocumentAccessoriesPayload\(/g) || []).length).toBe(2)
      expect(src).not.toMatch(/freight_allocation_criteria:\s*accessoriesSource/)
    })
  })

  describe('6. O VEREDITO APARECE TAMBÉM NA VENDA', () => {
    it('a tela de vendas consome a MESMA função, a mensagem e o tom', () => {
      const src = ler('pages/vendas/index.tsx')
      expect(src).toContain('resolveDocumentAccessoriesInheritance')
      expect(src).toContain('INHERITANCE_VERDICT_MESSAGE')
      expect(src).toContain('INHERITANCE_VERDICT_TONE')
    })

    it('e lê `detailItems` — a lista que alimenta o DRE do detalhe', () => {
      // `saleItems` é o formulário da venda no balcão. Olhar a lista errada daria soma zero,
      // e todo documento com rateio pareceria ter perdido itens. Foi o que a primeira versão
      // desta correção fez, antes de ser desfeita.
      const src = ler('pages/vendas/index.tsx')
      const memo = src.slice(src.indexOf('const saleAccessoriesInheritance'), src.indexOf('const saleAccessoriesInheritance') + 900)
      expect(memo).toContain('detailItems')
      expect(memo).not.toMatch(/saleItems\.map/)
    })

    it('as duas telas NÃO têm implementações próprias da conferência', () => {
      for (const arquivo of ['pages/pedidos/index.tsx', 'pages/vendas/index.tsx']) {
        const src = ler(arquivo)
        // Nenhuma das duas monta o `checkInheritedAllocation` na mão: as duas chamam a
        // função que já resolve os campos. Duas telas com a mesma pergunta e duas respostas
        // é a `copia-divergente` esperando divergir.
        expect(src).not.toContain('checkInheritedAllocation(')
        expect(src).toContain('resolveDocumentAccessoriesInheritance(')
      }
    })
  })

  describe('7. A GUARDA TEM UMA METADE SÓ — porque o tipo passou a fechar a outra', () => {
    /**
     * Este bloco existe por causa de uma mutação que SOBREVIVEU, e o registro é o ponto.
     *
     * A mutação trocava `source.source !== 'DOCUMENTO' || !source.document` por
     * `!source.document`, e os 22 casos continuaram verdes. Não por fraqueza de nenhum deles:
     * `resolveAccessoriesSource` é a única fábrica do tipo e NUNCA devolve `CADASTRO` com
     * `document` preenchido, então nenhuma entrada alcançável distingue as duas guardas. O
     * estado que a primeira metade barrava era permitido só pelo TIPO.
     *
     * Escrever um caso construindo `{ source: 'CADASTRO', document: … }` à mão mataria a
     * mutação e não provaria nada sobre o sistema — seria afirmar um estado impossível. O
     * remédio é o de `construtor-empobrecido.md`: fechar o contrato. Com a união discriminada,
     * a segunda metade da guarda deixa de ser necessária, e o estado deixa de existir.
     *
     * ALCANCE, declarado: a asserção de TIPO abaixo é vista pelo `tsc`, não pelo jest — o
     * `next/jest` compila por SWC e apaga tipos. O `next build` também não a vê
     * (`ignoreBuildErrors: true`). Ela vale na medição manual do `tsc`, e é por isso que a
     * asserção ESTRUTURAL vem junto: essa o jest alcança. `portao-que-nao-alcanca.md`.
     */
    it('o TIPO recusa `CADASTRO` com cotação junto (visível ao tsc, não ao jest)', () => {
      const cotacao: DocumentQuotation = {
        freightValue: 1, insuranceValue: 0, accessoryExpensesValue: 0, criteria: 'VALOR',
      }
      // @ts-expect-error — a união não permite `document` na variante CADASTRO. Se alguém
      // voltar a interface com `document?` opcional, este `@ts-expect-error` fica sem erro
      // para suprimir e o `tsc` acusa TS2578 — o erro aparece, e é o do teste, não do código.
      const impossivel: AccessoriesSourceDecision = { source: 'CADASTRO', document: cotacao, reason: 'inalcançável' }
      expect(impossivel.source).toBe('CADASTRO')
    })

    it('a guarda do payload tem UMA condição — a redundante saiu com o tipo', () => {
      const src = ler('utils/budget-accessories.ts')
      const corpo = src.slice(src.indexOf('export function buildDocumentAccessoriesPayload'))
      expect(corpo).toContain("if (source.source !== 'DOCUMENTO') return {}")
      expect(corpo).not.toContain('!source.document')
    })

    it('e o efeito continua o mesmo nos dois lados da decisão', () => {
      // A guarda encolheu; o comportamento não. Os dois casos que importam, lado a lado.
      expect(buildDocumentAccessoriesPayload(resolveAccessoriesSource({ freightValue: null }), null)).toEqual({})
      expect(
        buildDocumentAccessoriesPayload(resolveAccessoriesSource({ freightValue: 3000 }), null).freight_value,
      ).toBe(3000)
    })
  })
})
