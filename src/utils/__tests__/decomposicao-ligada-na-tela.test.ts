/**
 * A DECOMPOSIÇÃO ESTÁ LIGADA — e é o teste que faltou na correção 7.
 *
 * >>> O DEFEITO ERA DE ALCANCE, NÃO DE CÁLCULO <<<
 * A correção 7 criou `decomposition-dre.ts`, `decomposition-table.component.tsx` e 244 linhas
 * de teste verdes. Medido depois, com `git show --stat`: o commit tocou TRÊS arquivos, e
 * NENHUMA página. O módulo estava certo e não era importado por ninguém; a tela continuou
 * mostrando a Memória Cascata de 17 etapas.
 *
 * É `portao-que-nao-alcanca.md` na forma de cobertura: o verde existia, e o alcance dele
 * parava antes da tela. Nos commits da travessia eu escrevi `expect(src).toContain(...)` para
 * cada tela; na correção 7, não escrevi — e foi exatamente onde passou.
 *
 * Por isso o bloco 1 vem primeiro: ele é o caso que teria falhado.
 *
 * ORÁCULO: planilha "Cascata Lucro Real", aba "Orçamento", linhas 64 a 86.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { buildDecomposition } from '@/utils/decomposition-dre'
import { buildBudgetDecompositionInput, type BudgetDecompositionItem } from '@/utils/budget-decomposition-input'

const raiz = join(__dirname, '..', '..')
const ler = (p: string) => readFileSync(join(raiz, p), 'utf-8')

/** Dois produtos com alíquotas e margens DIFERENTES — é o que distingue os casos. */
const PRODUTO_A: BudgetDecompositionItem = {
  key: 'a', label: 'Produto A', quantity: 2, unitPrice: 5000, costUnit: 1200,
  commissionPct: 5, profitPct: 8, rtPct: 1,
  rates: { icms_pct: 17, pis_pct: 1.53, cofins_pct: 7.05, ibs_pct: 1, cbs_pct: 8.8 },
  acrescimos: 300,
}
const PRODUTO_B: BudgetDecompositionItem = {
  key: 'b', label: 'Produto B', quantity: 1, unitPrice: 3000, costUnit: 900,
  commissionPct: 3, profitPct: 12, rtPct: 0,
  rates: { icms_pct: 12, pis_pct: 1.62, cofins_pct: 7.46, ibs_pct: 0, cbs_pct: 0 },
  acrescimos: 100,
}
const MANUAL: BudgetDecompositionItem = {
  key: 'm', label: 'Serviço avulso', isManual: true, quantity: 1, unitPrice: 800, acrescimos: 50,
}

function montar(items: BudgetDecompositionItem[], discountPct = 0) {
  const p = buildBudgetDecompositionInput({
    items, discountPct,
    despesas: { fixa: 0.18, variavel: 0, financeira: 0, indireta: 0, moProdutiva: 0 },
    irpjAliquota: 0.15,
    csllAliquota: 0.09,
  })
  return { ...p, result: buildDecomposition(p.input) }
}

const linha = (r: ReturnType<typeof buildDecomposition>, key: string) => r.rows.find((x) => x.key === key)!

describe('1. O ORÇAMENTO CONSOME O MÓDULO — o caso que faltava na correção 7', () => {
  const src = ler('pages/orcamentos/index.tsx')

  /**
   * MUDANÇA DE REQUISITO, registrada em vez de apagada: a primeira versão deste caso afirmava
   * `<DecompositionTable` na TELA. O dono do produto decidiu depois que a tela fica com a
   * decomposição em ETAPAS, no mesmo lugar e com o mesmo acionamento, e que o formato de
   * COLUNAS é do PDF. O caso segue existindo pelo mesmo motivo — a correção 7 montou o módulo
   * e não o ligou a lugar nenhum —, mas agora afirma o consumo que existe.
   */
  it('o orçamento MONTA a decomposição e a entrega ao PDF', () => {
    expect(src).toContain('buildBudgetDecompositionInput')
    expect(src).toContain('buildDecomposition(params.input)')
    // Montar sem entregar seria a correção 7 de novo: cálculo vivo que ninguém consome.
    expect(src).toContain('{ decomposition: decomposition.result, itemLabels: decomposition.labels }')
  })

  it('e a TELA segue com as etapas, não com a tabela por produto', () => {
    expect(src).toContain('<ConsolidatedDREBlock')
    expect(src).not.toContain('<DecompositionTable')
  })
})

describe('2. (a) NA DISTRIBUIÇÃO DO RRO, a base é o RRO e o percentual é o PESO', () => {
  const { result } = montar([PRODUTO_A, PRODUTO_B])
  const rro = linha(result, 'rro')

  it('as quatro linhas têm o RRO por base — não a receita', () => {
    for (const key of ['comissao', 'lucro']) {
      expect(linha(result, key).base).toBeCloseTo(rro.total, 6)
    }
    expect(linha(result, 'comissao').base).not.toBeCloseTo(linha(result, 'receita_produtos').total, 2)
  })

  it('o percentual é o PESO — `valor ÷ RRO` —, nunca a alíquota EFETIVADA', () => {
    const comissao = linha(result, 'comissao')
    expect(comissao.pct).toBeCloseTo(comissao.total / rro.total, 9)
    // O discriminante: a Memória Cascata antiga rotulava "efetiva 6,1883%" na Comissão —
    // um número da CONSTRUÇÃO, dividido por `(1 − c)`. O peso é outro número, e o caso
    // exige que os dois DIVIRJAM, senão não distinguiria os dois estados.
    const efetivadaDoItemA = 0.05 / (1 - PRODUTO_A_C)
    expect(Math.abs((comissao.pct ?? 0) - efetivadaDoItemA)).toBeGreaterThan(0.05)
  })

  it('e o IRPJ volta como a ALÍQUOTA sobre o lucro — a engenharia reversa da R20', () => {
    const irpj = linha(result, 'irpj')
    const lucro = linha(result, 'lucro')
    expect(irpj.base).toBeCloseTo(lucro.total, 6)
    expect(irpj.pct).toBeCloseTo(0.15, 6)
    expect(linha(result, 'csll').pct).toBeCloseTo(0.09, 6)
  })
})

/** O `c` do produto A, medido pela própria ficha — usado como contraste no caso acima. */
const PRODUTO_A_C = (() => {
  const { input } = montar([PRODUTO_A])
  return input.items[0].taxes.externalOpsCoefficient
})()

describe('3. (b) A BASE DO ICMS é a RECEITA DE PRODUTOS — planilha, linha 72', () => {
  const { result } = montar([PRODUTO_A, PRODUTO_B])

  it('a base do ICMS é a receita de produtos, e NÃO a operação por dentro', () => {
    const rp = linha(result, 'receita_produtos').total
    const p = linha(result, 'operacao_por_dentro').total
    expect(linha(result, 'icms').base).toBeCloseTo(rp, 6)
    // O discriminante: com tributo por fora as duas bases DIVERGEM. Num documento sem
    // IBS/CBS elas coincidem, e o caso não distinguiria nada.
    expect(Math.abs(rp - p)).toBeGreaterThan(1)
    expect(linha(result, 'icms').base).not.toBeCloseTo(p, 2)
  })

  it('o valor do ICMS sai dessa base, item a item', () => {
    const { input, result: r } = montar([PRODUTO_A, PRODUTO_B])
    const rpPorItem = linha(r, 'receita_produtos').perItem
    const icms = linha(r, 'icms').perItem
    input.items.forEach((item, k) => {
      expect(icms[k]).toBeCloseTo(-rpPorItem[k] * item.taxes.icmsPct, 6)
    })
  })

  it('o PIS/COFINS desconta ICMS e ISS da base — exceção 2 da R5', () => {
    const p = linha(result, 'operacao_por_dentro').total
    const icms = linha(result, 'icms').total
    const iss = linha(result, 'iss').total
    expect(linha(result, 'pis_cofins').base).toBeCloseTo(p + icms + iss, 6)
  })
})

describe('4. (c) A ORDEM é a da planilha, linhas 64 a 86', () => {
  const { result } = montar([PRODUTO_A, PRODUTO_B, MANUAL], 0.05)

  it('as linhas saem exatamente nesta ordem', () => {
    expect(result.rows.map((r) => r.key)).toEqual([
      'receita_bruta',
      'desconto',
      'receita_apos_desconto',
      'repasse_manuais',
      'acrescimos',
      'receita_produtos',
      // R19 — UMA LINHA POR TRIBUTO. Era `por_fora` agregada; a decisão de abrir veio depois,
      // e o motivo é o que a agregação escondia: qual dos quatro pesou.
      'por_fora_ibs',
      'por_fora_cbs',
      'por_fora_is',
      'por_fora_ipi',
      'operacao_por_dentro',
      'icms',
      'iss',
      'pis_cofins',
      'receita_liquida',
      'custos',
      'despesas',
      'rt',
      'rro',
      'comissao',
      'lucro',
      'irpj',
      'csll',
      'residual',
    ])
  })

  it('IBS/CBS/IS/IPI vêm ANTES da operação por dentro, não no fim', () => {
    const idx = (k: string) => result.rows.findIndex((r) => r.key === k)
    // A Memória Cascata antiga os punha na Etapa 17, DEPOIS do RRO. Aqui o RRO tem de ser a
    // última sobra da conta, e o caso afirma as duas relações.
    expect(idx('por_fora_ibs')).toBeLessThan(idx('operacao_por_dentro'))
    expect(idx('por_fora_ipi')).toBeLessThan(idx('operacao_por_dentro'))
    expect(idx('por_fora_ibs')).toBeLessThan(idx('rro'))
    expect(idx('rro')).toBeGreaterThan(idx('receita_liquida'))
  })

  it('a última linha é o RESIDUAL, e ele fecha em zero', () => {
    expect(result.rows[result.rows.length - 1].key).toBe('residual')
    expect(Math.abs(result.residual.total)).toBeLessThan(0.01)
  })

  it('o LUCRO DA VENDA vem depois, FORA da tabela — é destaque, não linha do DRE', () => {
    expect(result.rows.some((r) => r.key === 'lucro_da_venda')).toBe(false)
    expect(result.lucroDaVenda).not.toBeNull()
    expect(result.lucroDaVenda!.valor).toBeCloseTo(linha(result, 'lucro').total, 6)
  })
})

describe('5. O ADAPTADOR — item manual é repasse, não coluna', () => {
  it('o manual NÃO vira coluna, e entra na linha de repasse com o acréscimo dele', () => {
    const { input, result, itemLabels } = montar([PRODUTO_A, PRODUTO_B, MANUAL])
    expect(itemLabels).toEqual(['Produto A', 'Produto B'])
    expect(input.items).toHaveLength(2)
    // 800 × 1 + 50 de acréscimo que caiu nele.
    expect(input.itensManuaisComAcrescimos).toBeCloseTo(850, 6)
    expect(linha(result, 'repasse_manuais').total).toBeCloseTo(-850, 6)
  })

  it('só itens manuais → não há decomposição a montar', () => {
    expect(montar([MANUAL]).isEmpty).toBe(true)
  })

  it('a ficha sai da matriz, e o `c` é POR ITEM', () => {
    const { input } = montar([PRODUTO_A, PRODUTO_B])
    // A tem IBS 1% + CBS 8,8%; B não tem nenhum dos dois.
    expect(input.items[0].taxes.externalOpsCoefficient).toBeGreaterThan(0.05)
    expect(input.items[1].taxes.externalOpsCoefficient).toBe(0)
  })

  it('o IRPJ e a CSLL derivam do LUCRO daquele item (R6), não de um valor do documento', () => {
    const { input } = montar([PRODUTO_A, PRODUTO_B])
    expect(input.items[0].categories!.irpjPct).toBeCloseTo(0.08 * 0.15, 9)
    expect(input.items[1].categories!.irpjPct).toBeCloseTo(0.12 * 0.15, 9)
    // O discriminante: se as categorias fossem do DOCUMENTO, os dois seriam iguais.
    expect(input.items[0].categories!.irpjPct).not.toBeCloseTo(input.items[1].categories!.irpjPct, 6)
  })
})

describe('6. CATEGORIAS POR ITEM, e o "% médio" que se declara', () => {
  it('cada item distribui o RRO pelos SEUS pesos', () => {
    const { input, result } = montar([PRODUTO_A, PRODUTO_B])
    const rro = linha(result, 'rro').perItem
    const lucro = linha(result, 'lucro').perItem
    input.items.forEach((item, k) => {
      const c = item.categories!
      const somaRRO = c.comissaoPct + c.lucroPct + c.irpjPct + c.csllPct
      expect(lucro[k]).toBeCloseTo(rro[k] * (c.lucroPct / somaRRO), 6)
    })
  })

  it('com margens diferentes, o percentual do TOTAL vem rotulado como derivado', () => {
    const { result } = montar([PRODUTO_A, PRODUTO_B])
    expect(linha(result, 'comissao').isDerivedAverage).toBe(true)
    expect(linha(result, 'lucro').isDerivedAverage).toBe(true)
    expect(linha(result, 'rt').isDerivedAverage).toBe(true)
  })

  it('com margens IGUAIS, NÃO é rotulado — o espelho do erro', () => {
    const iguais = montar([PRODUTO_A, { ...PRODUTO_B, key: 'b2', commissionPct: 5, profitPct: 8, rtPct: 1 }])
    expect(linha(iguais.result, 'comissao').isDerivedAverage).toBe(false)
    expect(linha(iguais.result, 'lucro').isDerivedAverage).toBe(false)
    // Rotular tudo como média chama de derivado o que é cadastrado, e ensina o leitor a
    // ignorar o rótulo (`.claude/rules/decomposicao-na-tela.md`).
  })

  it('e o residual fecha em zero com categorias divergentes', () => {
    for (const d of [0, 0.05, 0.12]) {
      const { result } = montar([PRODUTO_A, PRODUTO_B, MANUAL], d)
      expect(Math.abs(result.residual.total)).toBeLessThan(0.01)
      result.residual.perItem.forEach((r) => expect(Math.abs(r)).toBeLessThan(0.01))
    }
  })
})

/**
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * 7. OS QUATRO BALDES CHEGAM DAS TELAS — a junta, de novo
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * Em 17/09/2026 `BudgetDecompositionParams.despesas` deixou de ser um escalar e passou a
 * pedir os baldes separados. Módulo certo e tela passando um agregado seria a correção 7
 * acontecendo de novo — e a mutação que zerava `mo_produtiva_pct` nas páginas SOBREVIVEU
 * a 2.378 casos até este bloco existir.
 *
 * É asserção de CAMINHO, e é o caso-limite que `teste-que-nao-exercita.md` permite: o
 * `useMemo` de cada página não é exportável, então não há efeito mensurável daqui.
 */
describe('7. AS QUATRO TELAS passam os baldes, a MO produtiva e o `calc_type`', () => {
  const TELAS = ['pages/orcamentos/index.tsx', 'pages/pedidos/index.tsx', 'pages/vendas/index.tsx']

  it.each(TELAS)('%s passa os quatro baldes do tenant, não o `dop_pct`', (tela) => {
    const src = ler(tela)
    expect(src).toContain('fixa: Number(mrmConfig.expense_breakdown?.fixed_pct) || 0')
    expect(src).toContain('variavel: Number(mrmConfig.expense_breakdown?.variable_pct) || 0')
    expect(src).toContain('financeira: Number(mrmConfig.expense_breakdown?.financial_pct) || 0')
    expect(src).toContain('indireta: Number(mrmConfig.expense_breakdown?.administrative_pct) || 0')
    // O que a decomposição NÃO pode mais receber: o agregado, que não permite desfazer a soma.
    expect(src).not.toContain('despesasOperacionaisPct: Number(mrmConfig.dop_pct)')
  })

  it.each(TELAS)('%s passa a MO PRODUTIVA — ela só entra em revenda, e não está no `dop_pct`', (tela) => {
    expect(ler(tela)).toContain('moProdutiva: Number(mrmConfig.mo_produtiva_pct) || 0')
  })

  it.each(TELAS)('%s passa o `calc_type` — sem ele o segmento cai em INDUSTRIALIZACAO', (tela) => {
    expect(ler(tela)).toContain('tenantCalcType: mrmConfig.calc_type')
  })

  it.each(TELAS)('%s passa o `product_type` do item — é o que distingue REVENDA', (tela) => {
    // Sem ele a matriz do item cai na segmentação do tenant, e o IPI volta a ser POR FORA
    // num produto de revenda de tenant industrial.
    expect(ler(tela)).toContain('productType:')
  })

  it('a VENDA GRAVADA é a exceção, e ela é explícita: baldes ZERADOS + congelado por item', () => {
    // Ela não recalcula nada — o congelado do item vence. Passar os baldes do tenant de
    // hoje ali seria `fato-vs-referencia.md`: reescrever o passado a cada abertura.
    const src = ler('pages/vendas/index.tsx')
    expect(src).toContain('despesas: { fixa: 0, variavel: 0, financeira: 0, indireta: 0, moProdutiva: 0 },')
    expect(src).toContain('despesasOperacionaisPctCongelado: congelado.despesasOperacionaisPct ?? null,')
  })
})
