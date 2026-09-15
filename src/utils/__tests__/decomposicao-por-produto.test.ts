/**
 * Correção 7 — decomposição com coluna por produto.
 *
 * Regra: `.claude/rules/cascata-lucro-real.md` R15 a R20. Relatório "Motor RRO — Lucro Real",
 * seções 6.1 a 6.4. ORÁCULOS: planilha "Cascata Lucro Real", aba "Orçamento", linhas 62 a 88.
 *
 * TODO número esperado dos casos 1 a 4 vem da PLANILHA. Nenhum foi copiado da saída do
 * módulo — é o que separa "o teste confere a conta" de "o teste registra o que saiu".
 */

import { analiseVertical, buildDecomposition, type DecompositionInput } from '@/utils/decomposition-dre'

/** O cenário da aba "Orçamento": dois produtos, um item manual, desconto de 5%. */
const CENARIO: DecompositionInput = {
  items: [
    {
      id: 'p1',
      label: 'Produto 1',
      totalProduto: 261360.142943599, // linha 41 — SEM acréscimos
      custo: 79272.61,                // linha 38
      acrescimos: 3692.81124443716,   // linha 56
      taxes: {
        icmsPct: 0.17,
        issPct: 0,
        pisCofinsPct: 0.0925,
        externalOpsCoefficient: 0.0677873794119943,
      },
    },
    {
      id: 'p2',
      label: 'Produto 2',
      totalProduto: 88758.9902323131,
      custo: 33973.97,
      acrescimos: 1124.87613969839,
      taxes: {
        icmsPct: 0.12,
        issPct: 0,
        pisCofinsPct: 0.0925,
        externalOpsCoefficient: 0.0302297276679407,
      },
    },
  ],
  categories: {
    // Linhas 24 a 27: MO administrativa 7,92% + fixa 9,13% + variável 5,54% + financeira 0,33%.
    despesasOperacionaisPct: 0.0792 + 0.0913 + 0.0554 + 0.0033,
    rtPct: 0.01,
    comissaoPct: 0.05,
    lucroPct: 0.08,
    irpjPct: 0.15 * 0.08,
    csllPct: 0.09 * 0.08,
  },
  discountPct: 0.05,
  itensManuaisComAcrescimos: 8000 + 78.1862721259467, // linhas 45 e 56 (coluna G)
}

const linha = (r: ReturnType<typeof buildDecomposition>, key: string) => r.rows.find((x) => x.key === key)!

describe('correção 7 — decomposição com coluna por produto', () => {
  const r = buildDecomposition(CENARIO)

  describe('1. O DRE, linha a linha, contra a planilha (linhas 64 a 79)', () => {
    it('RECEITA BRUTA e desconto: 363.015,01 e −18.150,75', () => {
      expect(linha(r, 'receita_bruta').total).toBeCloseTo(363015.01, 1)
      expect(linha(r, 'desconto').total).toBeCloseTo(-18150.75, 1)
      expect(linha(r, 'receita_apos_desconto').total).toBeCloseTo(344864.26, 1)
    })

    it('repasse e acréscimos saem INTEIROS: −8.078,19 e −4.817,69', () => {
      expect(linha(r, 'repasse_manuais').total).toBeCloseTo(-8078.19, 1)
      expect(linha(r, 'acrescimos').total).toBeCloseTo(-4817.69, 1)
      expect(linha(r, 'acrescimos').perItem[0]).toBeCloseTo(-3692.81, 1)
      expect(linha(r, 'acrescimos').perItem[1]).toBeCloseTo(-1124.88, 1)
    })

    it('RECEITA DE PRODUTOS: 331.968,38, rateada em 247.810,80 e 84.157,58', () => {
      expect(linha(r, 'receita_produtos').total).toBeCloseTo(331968.38, 1)
      expect(linha(r, 'receita_produtos').perItem[0]).toBeCloseTo(247810.80, 1)
      expect(linha(r, 'receita_produtos').perItem[1]).toBeCloseTo(84157.58, 1)
    })

    it('tributos por fora: −16.798,45 e −2.544,06 — cada um com o `c` DO SEU produto', () => {
      expect(linha(r, 'por_fora').perItem[0]).toBeCloseTo(-16798.45, 1)
      expect(linha(r, 'por_fora').perItem[1]).toBeCloseTo(-2544.06, 1)
      expect(linha(r, 'por_fora').total).toBeCloseTo(-19342.51, 1)
      expect(linha(r, 'operacao_por_dentro').total).toBeCloseTo(312625.88, 1)
    })

    it('ICMS: −42.127,84 e −10.098,91 — alíquotas DIFERENTES, 17% e 12%', () => {
      expect(linha(r, 'icms').perItem[0]).toBeCloseTo(-42127.84, 1)
      expect(linha(r, 'icms').perItem[1]).toBeCloseTo(-10098.91, 1)
      expect(linha(r, 'icms').total).toBeCloseTo(-52226.75, 1)
    })

    it('PIS/COFINS: −24.086,92, sobre `P − ICMS − ISS` (teste 6 do checklist)', () => {
      expect(linha(r, 'pis_cofins').perItem[0]).toBeCloseTo(-17471.82, 1)
      expect(linha(r, 'pis_cofins').perItem[1]).toBeCloseTo(-6615.10, 1)
      expect(linha(r, 'pis_cofins').total).toBeCloseTo(-24086.92, 1)
      expect(linha(r, 'receita_liquida').total).toBeCloseTo(236312.21, 1)
    })

    it('custos, despesas e RT: −113.246,58 · −76.087,15 · −3.319,68', () => {
      expect(linha(r, 'custos').total).toBeCloseTo(-113246.58, 1)
      expect(linha(r, 'despesas').total).toBeCloseTo(-76087.15, 1)
      expect(linha(r, 'rt').total).toBeCloseTo(-3319.68, 1)
    })

    it('RRO: 43.658,79, sendo 32.863,75 e 10.795,04', () => {
      expect(linha(r, 'rro').perItem[0]).toBeCloseTo(32863.75, 1)
      expect(linha(r, 'rro').perItem[1]).toBeCloseTo(10795.04, 1)
      expect(linha(r, 'rro').total).toBeCloseTo(43658.79, 1)
    })
  })

  describe('2. DISTRIBUIÇÃO DO RRO — R20, planilha linhas 82 a 86', () => {
    it('comissão 14.630,96 · lucro 23.409,54 · IRPJ 3.511,43 · CSLL 2.106,86', () => {
      expect(linha(r, 'comissao').total).toBeCloseTo(14630.96, 1)
      expect(linha(r, 'lucro').total).toBeCloseTo(23409.54, 1)
      expect(linha(r, 'irpj').total).toBeCloseTo(3511.43, 1)
      expect(linha(r, 'csll').total).toBeCloseTo(2106.86, 1)
    })

    it('teste 9 do checklist — IRPJ ÷ Lucro = 15%, com desconto e sem ele', () => {
      for (const d of [0, 0.05, 0.2]) {
        const x = buildDecomposition({ ...CENARIO, discountPct: d })
        expect(linha(x, 'irpj').total / linha(x, 'lucro').total).toBeCloseTo(0.15, 10)
        expect(linha(x, 'csll').total / linha(x, 'lucro').total).toBeCloseTo(0.09, 10)
      }
    })

    it('a distribuição é PROPORCIONAL: subtrair a comissão primeiro quebraria a relação', () => {
      // Se o RRO fosse reduzido pela comissão antes de aplicar o IRPJ, a razão IRPJ ÷ Lucro
      // deixaria de ser a alíquota — é o defeito que a R20 nomeia. O caso acima já o pega;
      // este afirma o outro lado: os quatro pesos somam 1.
      const somaPesos =
        linha(r, 'comissao').pct! + linha(r, 'lucro').pct! +
        (CENARIO.categories.irpjPct + CENARIO.categories.csllPct) /
        (CENARIO.categories.comissaoPct + CENARIO.categories.lucroPct + CENARIO.categories.irpjPct + CENARIO.categories.csllPct)
      expect(somaPesos).toBeCloseTo(1, 12)
    })

    it('teste 4 do checklist — RESIDUAL zero, no total E por produto (teste 11)', () => {
      expect(r.residual.total).toBeCloseTo(0, 8)
      for (const v of r.residual.perItem) expect(v).toBeCloseTo(0, 8)
    })
  })

  describe('3. R16 — coluna Total é SOMA das colunas, nunca percentual sobre o total', () => {
    it('teste 10 do checklist — linha a linha, a soma das colunas fecha com o total', () => {
      // As duas linhas que só existem no total (desconto e repasse dos manuais) são o
      // contraste honesto: elas NÃO são soma de coluna, e por isso ficam de fora.
      const soTotal = new Set(['receita_bruta', 'desconto', 'receita_apos_desconto', 'repasse_manuais'])
      for (const row of r.rows) {
        if (soTotal.has(row.key)) continue
        expect(row.total).toBeCloseTo(row.perItem.reduce((a, b) => a + b, 0), 8)
      }
    })

    it('o total NÃO é o percentual aplicado sobre a receita — os dois divergem de verdade aqui', () => {
      // Com ICMS 17% e 12%, aplicar uma alíquota única sobre a receita total daria outro
      // número. Se o módulo fizesse isso, este caso passaria a falhar.
      const rp = linha(r, 'receita_produtos').total
      const comoSeFosseAliquotaUnica = -rp * 0.17
      expect(linha(r, 'icms').total).not.toBeCloseTo(comoSeFosseAliquotaUnica, 0)
    })
  })

  describe('4. "% MÉDIO" — seção 6.4: o percentual derivado tem de se declarar', () => {
    it('com alíquotas DIFERENTES, o ICMS do total é média ponderada e vem rotulado', () => {
      expect(linha(r, 'icms').isDerivedAverage).toBe(true)
      // E o número é de fato a média ponderada: 15,7324% — nem 17%, nem 12%.
      expect(linha(r, 'icms').pct).toBeCloseTo(0.157324458759625, 10)
      expect(linha(r, 'por_fora').isDerivedAverage).toBe(true)
      expect(linha(r, 'por_fora').pct).toBeCloseTo(0.0582661081405263, 10)
    })

    it('com a MESMA alíquota nos dois, o percentual é a alíquota e NÃO é rotulado média', () => {
      // O contraste é a asserção. Um módulo que rotulasse tudo como "% médio" passaria no
      // caso anterior e falharia aqui — e estaria chamando de derivado o que é cadastrado.
      const iguais = buildDecomposition({
        ...CENARIO,
        items: CENARIO.items.map((i) => ({ ...i, taxes: { ...i.taxes, icmsPct: 0.17 } })),
      })
      expect(linha(iguais, 'icms').isDerivedAverage).toBe(false)
      expect(linha(iguais, 'icms').pct).toBeCloseTo(0.17, 10)
      // O PIS/COFINS é 9,25% nos dois no cenário original — já não é média lá.
      expect(linha(r, 'pis_cofins').isDerivedAverage).toBe(false)
      expect(linha(r, 'pis_cofins').pct).toBeCloseTo(0.0925, 10)
    })

    it('com UM produto só não há média possível — e o percentual é a alíquota', () => {
      const um = buildDecomposition({ ...CENARIO, items: [CENARIO.items[0]] })
      expect(linha(um, 'icms').isDerivedAverage).toBe(false)
    })
  })

  describe('5. R18 — congelados: NÃO encolhem com o desconto', () => {
    it('custo e acréscimos ficam idênticos com 0%, 5% e 30% de desconto', () => {
      const a = buildDecomposition({ ...CENARIO, discountPct: 0 })
      const b = buildDecomposition({ ...CENARIO, discountPct: 0.3 })
      expect(linha(a, 'custos').total).toBe(linha(b, 'custos').total)
      expect(linha(a, 'acrescimos').total).toBe(linha(b, 'acrescimos').total)
      expect(linha(a, 'repasse_manuais').total).toBe(linha(b, 'repasse_manuais').total)
      // E o RRO ENCOLHE — é o contraste que mostra a corrosão da margem. Sem ele, "congelado"
      // passaria também num módulo em que nada mudasse com o desconto.
      expect(linha(b, 'rro').total).toBeLessThan(linha(a, 'rro').total)
    })

    it('teste 3 do checklist — com desconto ZERO a decomposição devolve os % Originais', () => {
      const semDesconto = buildDecomposition({ ...CENARIO, discountPct: 0 })
      expect(linha(semDesconto, 'despesas').pct).toBeCloseTo(CENARIO.categories.despesasOperacionaisPct, 12)
      expect(linha(semDesconto, 'rt').pct).toBeCloseTo(0.01, 12)
      // E o lucro apurado volta ao cadastrado: lucro ÷ receita de produtos = 8%.
      const rpSem = linha(semDesconto, 'receita_produtos').total
      expect(linha(semDesconto, 'lucro').total / rpSem).toBeCloseTo(0.08, 6)
    })
  })

  describe('6. ANÁLISE VERTICAL (seção 6.4)', () => {
    it('é sobre a receita APÓS descontos, e o lucro dá 6,788%', () => {
      expect(r.receitaAposDesconto).toBeCloseTo(344864.26, 1)
      expect(analiseVertical(linha(r, 'lucro').total, r.receitaAposDesconto)).toBeCloseTo(0.067880450592515, 10)
    })

    it('base zero devolve `null`, nunca 0% — "não apurável" não é "zero por cento"', () => {
      expect(analiseVertical(100, 0)).toBeNull()
    })
  })

  describe('7. Recusas — erro em vez de número inventado', () => {
    it('desconto fora de [0, 1) é recusado', () => {
      expect(buildDecomposition({ ...CENARIO, discountPct: 1 }).errors.length).toBeGreaterThan(0)
      expect(buildDecomposition({ ...CENARIO, discountPct: -0.1 }).errors.length).toBeGreaterThan(0)
    })

    it('categorias do RRO somando zero são recusadas — não há como distribuir', () => {
      const r2 = buildDecomposition({
        ...CENARIO,
        categories: { ...CENARIO.categories, comissaoPct: 0, lucroPct: 0, irpjPct: 0, csllPct: 0 },
      })
      expect(r2.errors.join(' ')).toContain('soma das categorias do RRO')
      expect(r2.rows).toEqual([])
    })
  })
})
