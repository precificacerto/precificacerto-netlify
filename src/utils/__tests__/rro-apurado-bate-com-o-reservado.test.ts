/**
 * O RRO DA DECOMPOSIÇÃO = COMISSÃO + LUCRO + IRPJ + CSLL DA CONSTRUÇÃO, AO CENTAVO.
 *
 * >>> O TESTE QUE FALTAVA, e é o que deixou passar R$ 973,39 <<<
 *
 * Nenhum caso afirmava essa igualdade. O RESIDUAL não a cobre — e a distinção é o ponto deste
 * arquivo: o residual fecha POR CONSTRUÇÃO, porque distribui o RRO INTEIRO seja ele qual for.
 * Um residual de R$ 0,00 não prova que o RRO está certo; prova que ele foi repartido.
 *
 * >>> A MEDIÇÃO CONTRA O PRODUTO REAL, e o que ela mostrou <<<
 *
 * ATeste1509, do banco: `sale_price` 36.757,67 (total geral), `sale_price_base` 34.219,34 (P),
 * `external_ops_coefficient` 0,06905570, ICMS 17%, IBS 1% + CBS 9%, comissão 5%, lucro 10%.
 *
 * Rodado o módulo com esses números:
 *
 *   receita de produtos   36.757,67   = total geral
 *   ICMS                   6.248,80   = IDÊNTICO à construção  (relatado na tela: 5.817,29)
 *   PIS/COFINS             2.587,27   = IDÊNTICO à construção  (relatado: 2.627,19)
 *   despesas               8.424,86   = IDÊNTICO à construção  (relatado: 7.843,07)
 *
 * A base do módulo JÁ é o total geral, e as três linhas batem. Os números relatados são os da
 * cascata ANTIGA, que aplicava sobre a âncora interna — a tela medida não estava usando este
 * módulo.
 *
 * O que a mesma medição revelou, e é um defeito de verdade: o CMV daquele produto é ZERO no
 * cadastro (`cost_total = 0`, `pricing_calculations.cmv = 0`) e o preço foi digitado. Sobram
 * R$ 10.562,58 sem dedução, e eles caem TODOS no RRO — que é o que infla a distribuição e faz
 * a comissão aparecer como 13,26% quando foi cadastrada em 5%.
 *
 * O invariante abaixo pega exatamente isso, e o pega de um jeito que o residual nunca pegaria.
 */

import { buildDecomposition } from '@/utils/decomposition-dre'
import { buildBudgetDecompositionInput, type BudgetDecompositionItem } from '@/utils/budget-decomposition-input'

/** ATeste1509, como está no banco. */
const ATESTE: BudgetDecompositionItem = {
  key: 'a', label: 'ATeste1509', quantity: 1,
  unitPrice: 36757.67,
  costUnit: 10562.58,   // o CMV que fecha a conta — ver o cabeçalho
  commissionPct: 5, profitPct: 10, rtPct: 0,
  rates: { icms_pct: 17, pis_pct: 1.53, cofins_pct: 6.1475, ibs_pct: 1, cbs_pct: 9 },
  acrescimos: 0,
}

const montar = (items: BudgetDecompositionItem[], discountPct = 0) => {
  const p = buildBudgetDecompositionInput({
    items, discountPct, despesasOperacionaisPct: 0.2292, irpjAliquota: 0.15, csllAliquota: 0.09,
  })
  return buildDecomposition(p.input)
}

const linha = (r: ReturnType<typeof buildDecomposition>, k: string) => r.rows.find((x) => x.key === k)!

describe('1. A BASE é o TOTAL GERAL — as três linhas batem com a construção', () => {
  const r = montar([ATESTE])

  it('a receita de produtos é o total geral, e P é ela menos o por fora', () => {
    expect(linha(r, 'receita_produtos').total).toBeCloseTo(36757.67, 2)
    expect(linha(r, 'operacao_por_dentro').total).toBeCloseTo(34219.34, 1)
    // O discriminante: as duas DIVERGEM em R$ 2.538. Aplicar sobre P em vez do total geral
    // é a diferença inteira que o relato mediu.
    expect(Math.abs(linha(r, 'receita_produtos').total - linha(r, 'operacao_por_dentro').total))
      .toBeGreaterThan(2500)
  })

  it('ICMS 17% sobre o TOTAL GERAL — 6.248,80, não 5.817,29', () => {
    expect(Math.abs(linha(r, 'icms').total)).toBeCloseTo(6248.80, 1)
    // O número que a cascata antiga mostrava, e que este caso existe para NÃO produzir.
    expect(Math.abs(linha(r, 'icms').total)).not.toBeCloseTo(5817.29, 1)
  })

  it('despesas 22,92% sobre o TOTAL GERAL — 8.424,86, não 7.843,07', () => {
    expect(Math.abs(linha(r, 'despesas').total)).toBeCloseTo(8424.86, 1)
    expect(Math.abs(linha(r, 'despesas').total)).not.toBeCloseTo(7843.07, 1)
  })

  it('PIS/COFINS sobre `P − ICMS − ISS` — 2.587,27', () => {
    expect(Math.abs(linha(r, 'pis_cofins').total)).toBeCloseTo(2587.27, 1)
  })

  it('as QUATRO linhas do por fora somam o `c` — e cada uma traz o SEU valor', () => {
    // O `c` do ATeste1509 é 6,9056% e vem de IBS 1% + CBS 9%. As quatro linhas existirem não
    // basta: uma mutação que zerasse a abertura deixaria quatro linhas de R$ 0,00, e os
    // rótulos continuariam lá. Foi o que a mutação J12 mostrou na primeira rodada.
    const ibs = Math.abs(linha(r, 'por_fora_ibs').total)
    const cbs = Math.abs(linha(r, 'por_fora_cbs').total)
    const is = Math.abs(linha(r, 'por_fora_is').total)
    const ipi = Math.abs(linha(r, 'por_fora_ipi').total)
    expect(ibs + cbs + is + ipi).toBeCloseTo(36757.67 * 0.0690557, 1)
    // E o CBS é NOVE vezes o IBS, porque 9% contra 1% — é o que a linha agregada escondia.
    expect(cbs / ibs).toBeCloseTo(9, 1)
    // IS e IPI são zero NESTE produto, e zero aqui é apurado: as alíquotas são 0%.
    expect(is).toBeCloseTo(0, 6)
    expect(ipi).toBeCloseTo(0, 6)
  })
})

describe('2. O INVARIANTE — RRO apurado = Σ % cadastrados × total geral', () => {
  const r = montar([ATESTE])

  it('o RRO bate com o que a construção reservou: 6.395,83', () => {
    // 5% + 10% + 1,5% (IRPJ) + 0,9% (CSLL) = 17,4% × 36.757,67
    expect(r.rro!.esperado).toBeCloseTo(6395.83, 1)
    expect(r.rro!.apurado).toBeCloseTo(6395.83, 1)
    // Um centavo é a tolerância, e ela é a mesma do alerta: o `costUnit` deste caso foi
    // apurado por subtração com duas casas, e o resto é arredondamento.
    expect(Math.abs(r.rro!.divergencia)).toBeLessThan(0.01)
    expect(r.rro!.foraDeZero).toBe(false)
  })

  it('e as quatro linhas voltam como os percentuais CADASTRADOS', () => {
    // É o teste que fecha: se a base estivesse errada, estes dois não seriam 5% e 10%.
    expect(linha(r, 'comissao').pctSobreTotalGeral).toBeCloseTo(0.05, 4)
    expect(linha(r, 'lucro').pctSobreTotalGeral).toBeCloseTo(0.10, 4)
    expect(linha(r, 'irpj').pctSobreTotalGeral).toBeCloseTo(0.015, 4)
    expect(linha(r, 'csll').pctSobreTotalGeral).toBeCloseTo(0.009, 4)
  })

  it('o PESO continua sendo outra coisa — e é por isso que são dois campos', () => {
    // 28,7% e 57,5%: quanto DESTA SOBRA é comissão. O peso não é errado; é outra pergunta.
    expect(linha(r, 'comissao').pct).toBeCloseTo(0.05 / 0.174, 4)
    expect(linha(r, 'lucro').pct).toBeCloseTo(0.10 / 0.174, 4)
    expect(linha(r, 'comissao').pct).not.toBeCloseTo(0.05, 3)
  })
})

describe('3. CMV AUSENTE: o residual fecha e o invariante NÃO', () => {
  // O caso real do ATeste1509: `cost_total = 0` no cadastro e preço digitado.
  const semCusto = montar([{ ...ATESTE, costUnit: 0 }])

  it('o RESIDUAL fecha em zero — e não prova nada', () => {
    // Ele distribui o RRO inteiro, seja ele qual for. É a razão de o defeito ter passado.
    expect(Math.abs(semCusto.residual.total)).toBeLessThan(0.01)
  })

  it('o INVARIANTE acusa: sobram R$ 10.562,58 sem dedução', () => {
    expect(semCusto.rro!.foraDeZero).toBe(true)
    expect(semCusto.rro!.divergencia).toBeCloseTo(10562.58, 1)
    expect(semCusto.rro!.apurado).toBeCloseTo(16958.41, 1)
    expect(semCusto.rro!.esperado).toBeCloseTo(6395.83, 1)
  })

  it('e é isso que infla a comissão para 13,26% quando ela é 5%', () => {
    expect(linha(semCusto, 'comissao').pctSobreTotalGeral).toBeCloseTo(0.1326, 3)
    // O contraste com o caso 2: mesma alíquota cadastrada, outro número exibido.
    expect(linha(semCusto, 'comissao').pctSobreTotalGeral)
      .not.toBeCloseTo(linha(montar([ATESTE]), 'comissao').pctSobreTotalGeral!, 3)
  })
})

describe('4. COM DESCONTO, a FALTA é a corrosão — e não é divergência', () => {
  /**
   * Medido ao escrever este bloco, e mudou o desenho do invariante: com desconto o RRO
   * apurado fica ABAIXO do reservado, e isso é o comportamento certo. Custos, despesas e
   * acréscimos são CONGELADOS (R18) e não encolhem junto, então o RRO encolhe mais que
   * proporcionalmente — é exatamente a corrosão da margem que a decomposição existe para
   * mostrar. Tratá-la como erro transformaria o ponto da cascata num alerta falso.
   *
   * Por isso o alerta é ASSIMÉTRICO: com desconto, só a SOBRA acusa.
   */
  it('a falta NÃO acusa, e é ela que o LUCRO DA VENDA publica', () => {
    for (const d of [0.05, 0.12]) {
      const r = montar([ATESTE], d)
      expect(r.rro!.divergencia).toBeLessThan(0)
      expect(r.rro!.foraDeZero).toBe(false)
      // E o lucro apurado cai abaixo dos 10% cadastrados, na mesma medida.
      expect(r.lucroDaVenda!.pctSobreProdutos!).toBeLessThan(0.10)
    }
  })

  it('mas a SOBRA acusa mesmo com desconto — o CMV ausente não se esconde atrás dele', () => {
    // O discriminante do alerta assimétrico: se ele só olhasse o módulo da diferença, este
    // caso e o anterior seriam indistinguíveis.
    const r = montar([{ ...ATESTE, costUnit: 0 }], 0.05)
    expect(r.rro!.divergencia).toBeGreaterThan(0)
    expect(r.rro!.foraDeZero).toBe(true)
  })

  it('dois produtos com margens DIFERENTES fecham — o esperado é somado item a item', () => {
    const base: BudgetDecompositionItem = {
      ...ATESTE, key: 'b', label: 'Outro', unitPrice: 12000, costUnit: 0,
      commissionPct: 3, profitPct: 15,
      rates: { icms_pct: 12, pis_pct: 1.62, cofins_pct: 7.46, ibs_pct: 0, cbs_pct: 0 },
    }
    // O CMV que fecha a conta deste produto, apurado por subtração — como o do ATeste1509.
    // Sem ele o caso mediria o custo inventado, e não a soma por item.
    const custoQueFecha = montar([base]).rro!.divergencia
    const outro = { ...base, costUnit: custoQueFecha }

    const r = montar([ATESTE, outro])
    expect(Math.abs(r.rro!.divergencia)).toBeLessThan(0.02)
    expect(r.rro!.foraDeZero).toBe(false)

    // O DISCRIMINANTE: um percentual ÚNICO do documento daria outro número. Aqui o esperado
    // é `Σ receita_do_item × % DAQUELE item`, e os dois itens têm margens diferentes — 17,4%
    // contra 23,4%. Com um % único, a diferença é de R$ 504 — medida, não estimada.
    const pctUnico = 0.05 + 0.10 + 0.015 + 0.009
    const rpTotal = r.rows.find((x) => x.key === 'receita_produtos')!.total
    expect(Math.abs(rpTotal * pctUnico - r.rro!.esperado)).toBeGreaterThan(500)
  })

  it('e com desconto a falta continua sendo corrosão, não alerta', () => {
    const r = montar([ATESTE], 0.08)
    expect(r.rro!.divergencia).toBeLessThan(0)
    expect(r.rro!.foraDeZero).toBe(false)
  })
})
