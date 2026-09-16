/**
 * O TRIBUTO DO ACRÉSCIMO — a R13 já o calculava, e ele não tinha onde aparecer.
 *
 * >>> A CORREÇÃO DE RUMO DO DONO DO PRODUTO, registrada porque ela é o ponto <<<
 *
 * A instrução anterior era mudar a BASE do ICMS na decomposição para incluir o frete. Ela
 * foi RETIRADA por quem a deu:
 *
 *   "Se mudar só na decomposição, ela volta a divergir da construção — e gastamos várias
 *    rodadas fazendo as duas baterem ao centavo. NÃO MUDE BASE NENHUMA. O mecanismo já
 *    existe. A R13 NÃO MUDA. Ela estava certa. O que estava faltando era EXIBIR o que ela
 *    já calcula."
 *
 * O último caso deste arquivo é o que protege contra a instrução errada voltar.
 *
 * >>> POR QUE O COMPONENTE NÃO ENTRA NO DRE <<<
 *
 * O acréscimo é REPASSE: entra na receita bruta e sai inteiro na linha de repasse, e os dois
 * se cancelam. Somar o tributo dele às deduções obrigaria a inflar a receita bruta na mesma
 * medida para o DRE continuar fechando — e isso mudaria a base do desconto e o total geral,
 * que é exatamente o que a instrução proíbe.
 *
 * Então ele é EXIBIÇÃO FISCAL ao lado do número do DRE: o `vICMS` da nota é o do produto MAIS
 * o do frete daquele item; o ICMS que reduz a receita continua sendo só o do produto. Duas
 * perguntas diferentes sobre o mesmo item, e a tela responde as duas sem misturar.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { allocateAccessories, resolveItemFicha } from '@/utils/budget-accessories'
import { buildDecomposition } from '@/utils/decomposition-dre'
import { buildBudgetDecompositionInput, type BudgetDecompositionItem } from '@/utils/budget-decomposition-input'
import { celulaDoProduto } from '@/lib/decomposition-pdf'

/** Três produtos com alíquotas e valores diferentes. Com um só, o rateio não discrimina. */
const RATES = [
  { icms_pct: 17, pis_pct: 1.53, cofins_pct: 7.05, ibs_pct: 1, cbs_pct: 9, is_pct: 0, ipi_pct: 0 },
  { icms_pct: 12, pis_pct: 1.53, cofins_pct: 7.05, ibs_pct: 0.5, cbs_pct: 4, is_pct: 0, ipi_pct: 5 },
  { icms_pct: 7, pis_pct: 1.53, cofins_pct: 7.05, ibs_pct: 0, cbs_pct: 0, is_pct: 0, ipi_pct: 0 },
]
const TOTAIS = [12345.67, 7891.23, 3456.81]

/** A ficha de cada item, da MESMA função que a construção usa. */
const ficha = (i: number) => resolveItemFicha({
  segment: 'INDUSTRIALIZACAO',
  rates: {
    icmsPct: RATES[i].icms_pct / 100, issPct: null,
    pisCofinsPct: (RATES[i].pis_pct + RATES[i].cofins_pct) / 100,
    ipiPct: RATES[i].ipi_pct / 100, isPct: 0,
    ibsPct: RATES[i].ibs_pct / 100, cbsPct: RATES[i].cbs_pct / 100,
  },
}).ficha!

/** O RATEIO, como o documento o faz: R$ 2.000 de frete + R$ 500 de seguro, por VALOR. */
const rateio = allocateAccessories({
  freightValue: 2000, insuranceValue: 500, accessoryExpensesValue: 0, criteria: 'VALOR',
  targets: TOTAIS.map((t, i) => ({ id: `p${i}`, totalValue: t, isManual: false, resolved: ficha(i) })),
})

const DESP_PCT = 0.2292
const SOMA_RRO = 0.05 + 0.10 + 0.15 * 0.10 + 0.09 * 0.10

const itens = (comFiscais: boolean, custos: number[]): BudgetDecompositionItem[] => TOTAIS.map((t, i) => {
  const alvo = rateio.perTarget[i]
  return {
    key: `p${i}`, label: `P${i + 1}`, quantity: 1, unitPrice: t,
    costUnit: custos[i], productiveLaborUnit: 0,
    commissionPct: 5, profitPct: 10, rtPct: 0,
    rates: RATES[i] as never,
    acrescimos: alvo.allocated,
    ...(comFiscais && alvo.taxesInside
      ? { acrescimosFiscais: { base: alvo.price, ...alvo.taxesInside } }
      : {}),
  }
})

/**
 * O CUSTO, DERIVADO por subtração — e não inventado.
 *
 * Um custo escolhido a olho produz um documento cujo preço não foi formado com estes
 * parâmetros, e aí o invariante do RRO acusa por causa do CENÁRIO e não da correção. Aqui o
 * custo é o que sobra para o RRO fechar com o reservado: `Σ % cadastrados × total do
 * produto`, sem desconto. É a mesma engenharia reversa que a R20 preserva.
 */
const CUSTOS = (() => {
  const zero = buildDecomposition(buildBudgetDecompositionInput({
    items: itens(false, [0, 0, 0]), discountPct: 0, despesasOperacionaisPct: DESP_PCT,
  }).input)
  const rl = zero.rows.find((x) => x.key === 'receita_liquida')!.perItem
  const desp = zero.rows.find((x) => x.key === 'despesas')!.perItem
  return TOTAIS.map((t, i) => rl[i] + desp[i] - t * SOMA_RRO)
})()

const montar = (comFiscais: boolean, discountPct = 0.05) =>
  buildDecomposition(buildBudgetDecompositionInput({
    items: itens(comFiscais, CUSTOS), discountPct, despesasOperacionaisPct: DESP_PCT,
  }).input)

const com = montar(true)
const sem = montar(false)
const L = (r: typeof com, k: string) => r.rows.find((x) => x.key === k)!

describe('1. A CONSTRUÇÃO já apurava — a R13 abre o que ela calcula', () => {
  it('os três tributos somam exatamente `preço − parcela`, por construção da MC', () => {
    // É a identidade da R13: MC = 1 − i − s − p, preço = parcela ÷ MC, logo
    // preço × (i + s + p) = preço − parcela. Se algum dos três usasse outra alíquota, cairia.
    for (const t of rateio.perTarget) {
      const soma = t.taxesInside!.icms + t.taxesInside!.iss + t.taxesInside!.pisCofins
      expect(soma).toBeCloseTo(t.price - t.allocated, 10)
    }
  })

  it('e cada item tem o SEU — as alíquotas são diferentes nos três', () => {
    const icms = rateio.perTarget.map((t) => t.taxesInside!.icms / t.price)
    // Efetivas: `nominal ÷ (1 − c)`, e o `c` de cada produto também difere. O discriminante
    // é a ORDEM: 17% > 12% > 7% se preserva depois do gross-up.
    expect(icms[0]).toBeGreaterThan(icms[1])
    expect(icms[1]).toBeGreaterThan(icms[2])
    expect(icms[0]).toBeGreaterThan(0.17)
  })

  it('item MANUAL não tem componente — repasse puro, sem MC a aplicar', () => {
    const comManual = allocateAccessories({
      freightValue: 1000, insuranceValue: 0, accessoryExpensesValue: 0, criteria: 'VALOR',
      targets: [
        { id: 'p0', totalValue: TOTAIS[0], isManual: false, resolved: ficha(0) },
        { id: 'm', totalValue: 500, isManual: true },
      ],
    })
    expect(comManual.perTarget.find((t) => t.id === 'm')!.taxesInside).toBeNull()
    // `null`, não zeros: zero afirmaria que o repasse foi tributado a zero.
    expect(comManual.perTarget.find((t) => t.id === 'p0')!.taxesInside).not.toBeNull()
  })
})

describe('2. A LINHA ganha o segundo componente — e ele é o que vai na nota', () => {
  it('ICMS, ISS e PIS/COFINS trazem o componente do acréscimo, por coluna', () => {
    for (const k of ['icms', 'iss', 'pis_cofins']) {
      expect(L(com, k).acrescimoPerItem).toHaveLength(3)
      expect(L(com, k).baseAcrescimoPerItem).toHaveLength(3)
    }
    expect(L(com, 'icms').acrescimoPerItem[0]).toBeCloseTo(rateio.perTarget[0].taxesInside!.icms, 10)
  })

  it('o ICMS FISCAL do item é o do produto MAIS o do acréscimo', () => {
    const x = L(com, 'icms')
    const fiscal = Math.abs(x.perItem[0]) + x.acrescimoPerItem[0]
    expect(fiscal).toBeGreaterThan(Math.abs(x.perItem[0]))
    // O discriminante numérico: o componente não é desprezível nem é o valor inteiro.
    expect(x.acrescimoPerItem[0]).toBeGreaterThan(50)
    expect(x.acrescimoPerItem[0]).toBeLessThan(Math.abs(x.perItem[0]))
  })

  it('a BASE FISCAL do item é a do produto MAIS a do acréscimo', () => {
    const x = L(com, 'icms')
    expect(x.baseAcrescimoPerItem[0]).toBeCloseTo(rateio.perTarget[0].price, 10)
    // E ela é MAIOR que a parcela rateada — o preço do acréscimo é a parcela com gross-up.
    expect(x.baseAcrescimoPerItem[0]).toBeGreaterThan(rateio.perTarget[0].allocated)
  })

  it('as linhas POR FORA não recebem o componente — a R13 define outra coisa para elas', () => {
    for (const k of ['por_fora_ibs', 'por_fora_cbs', 'por_fora_is', 'por_fora_ipi']) {
      expect(L(com, k).acrescimoPerItem).toEqual([])
    }
    // E as congeladas também não: acréscimo não tem custo nem despesa.
    expect(L(com, 'custos').acrescimoPerItem).toEqual([])
  })

  it('documento SEM acréscimo cotado não ganha componente — vazio, nunca zeros', () => {
    // Uma coluna de zeros afirmaria que o frete daquele item foi tributado em R$ 0,00.
    expect(L(sem, 'icms').acrescimoPerItem).toEqual([])
    expect(L(sem, 'icms').baseAcrescimoPerItem).toEqual([])
  })
})

describe('3. >>> O DRE NÃO MUDOU — é este bloco que protege a instrução retirada <<<', () => {
  it('TODAS as linhas saem IDÊNTICAS com e sem o componente fiscal', () => {
    // Se o componente entrasse na conta, a decomposição voltaria a divergir da construção —
    // e é exatamente o que o dono do produto retirou da instrução anterior.
    expect(com.rows).toHaveLength(sem.rows.length)
    com.rows.forEach((x, i) => {
      expect(x.key).toBe(sem.rows[i].key)
      expect(x.total).toBeCloseTo(sem.rows[i].total, 10)
      x.perItem.forEach((v, j) => expect(v).toBeCloseTo(sem.rows[i].perItem[j], 10))
      expect(x.base).toEqual(sem.rows[i].base)
      expect(x.pct).toEqual(sem.rows[i].pct)
    })
  })

  it('e a BASE do ICMS continua sendo a receita de produtos, SEM o frete', () => {
    // A instrução retirada mandava somar o frete AQUI. O caso afirma que não foi somado.
    const rp = L(com, 'receita_produtos').perItem
    expect(L(com, 'icms').basePerItem).toEqual(rp)
    const comFrete = rp[0] + Math.abs(L(com, 'acrescimos').perItem[0])
    expect(L(com, 'icms').basePerItem[0]).not.toBeCloseTo(comFrete, 2)
    // E o ICMS do DRE continua sendo `base × alíquota cadastrada`, ao décimo de milésimo.
    expect(Math.abs(L(com, 'icms').perItem[0]) / rp[0]).toBeCloseTo(0.17, 10)
  })

  it('o RRO e o residual não se movem', () => {
    expect(L(com, 'rro').total).toBeCloseTo(L(sem, 'rro').total, 10)
    expect(com.residual.total).toBeCloseTo(0, 6)
    // Sem desconto o RRO apurado bate com o reservado — o custo do cenário foi DERIVADO
    // para isso, e é o que torna o documento coerente em vez de um conjunto de números.
    expect(montar(true, 0).rro!.foraDeZero).toBe(false)
    expect(montar(true, 0).rro!.divergencia).toBeCloseTo(0, 6)
  })
})

describe('4. A CÉLULA impressa separa os dois números', () => {
  const semNbsp = (v: string) => v.replace(/ /g, ' ')

  it('valor do DRE, base, alíquota, componente do frete, fiscal e base fiscal', () => {
    const linhas = semNbsp(celulaDoProduto(L(com, 'icms'), 0)).split('\n')
    expect(linhas).toHaveLength(6)
    expect(linhas[3]).toMatch(/^\+ frete R\$ /)
    expect(linhas[4]).toMatch(/^= fiscal R\$ /)
    expect(linhas[5]).toMatch(/^base fiscal R\$ /)
  })

  it('sem acréscimo, a célula volta às três linhas — nada é inventado', () => {
    expect(semNbsp(celulaDoProduto(L(sem, 'icms'), 0)).split('\n')).toHaveLength(3)
  })

  it('a tela renderiza os mesmos três números, e o orçamento lê a construção', () => {
    const bloco = readFileSync(
      join(__dirname, '..', '..', 'page-parts', 'shared', 'consolidated-dre-block.component.tsx'), 'utf-8')
    expect(bloco).toContain('+ frete {formatBRL(row.acrescimoPerItem[k])}')
    expect(bloco).toContain('= fiscal {formatBRL(Math.abs(row.perItem[k]) + row.acrescimoPerItem[k])}')
    const orc = readFileSync(join(__dirname, '..', '..', 'pages', 'orcamentos', 'index.tsx'), 'utf-8')
    // A decomposição LÊ o que `allocateAccessories` apurou; derivar na tela seria a segunda
    // conta que `regime-e-segmento-determinam-a-construcao.md` proíbe.
    expect(orc).toContain('fiscais: t.taxesInside ? { base: t.price, ...t.taxesInside } : null,')
    expect(orc).toContain('acrescimosFiscais: allocatedByKey?.get(item.key)?.fiscais ?? null,')
  })
})
