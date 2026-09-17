/**
 * Correção 7 — decomposição com coluna por produto.
 *
 * Regra: `.claude/rules/cascata-lucro-real.md` R15 a R20. Relatório "Motor RRO — Lucro Real",
 * seções 6.1 a 6.4. ORÁCULOS: planilha "Cascata Lucro Real", aba "Orçamento", linhas 62 a 88.
 *
 * TODO número esperado dos casos 1 a 4 vem da PLANILHA. Nenhum foi copiado da saída do
 * módulo — é o que separa "o teste confere a conta" de "o teste registra o que saiu".
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * >>> A PLANILHA DIVERGE DA R18 NUMA LINHA, E A DECISÃO É DO DONO DO PRODUTO (16/09/2026) <<<
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * A planilha RECALCULA a linha de DESPESAS OPERACIONAIS sobre a receita de produtos
 * pós-desconto: 331.968,38 × 22,92% = R$ 76.087,15. A R18 diz que despesa é um dos QUATRO
 * CONGELADOS e não encolhe com o desconto: 350.119,13 × 22,92% = R$ 80.247,31.
 *
 * O dono do produto decidiu pelo CONGELAMENTO, medindo o ORC-5487 e formulando a razão:
 * "tributo acompanha a receita — faturou menos, paga menos —, custo e despesa não. É por
 * isso que o desconto dói, e se a despesa encolhesse junto a tela esconderia o estrago."
 *
 * Isso NÃO é falha da planilha: ela foi construída sob o nível anterior, quando a distinção
 * entre congelado-em-R$ e congelado-em-% ainda não tinha sido tomada
 * (`.claude/rules/decisao-sob-regra-da-epoca.md`). O que muda é UMA célula e o que ela
 * arrasta — RRO, as quatro do RRO, a análise vertical e o LUCRO DA VENDA.
 *
 * >>> DE ONDE VÊM OS NÚMEROS NOVOS, E POR QUE ELES NÃO SÃO A SAÍDA DO MÓDULO <<<
 * Os INSUMOS continuam sendo os da planilha, célula por célula: `totalProduto`, `custo`,
 * `acrescimos`, as alíquotas, o `c`, os percentuais de categoria e o manual. A cadeia foi
 * recalculada FORA deste repositório, à parte do módulo, trocando só a fórmula da despesa —
 * e foi essa cadeia independente que produziu cada número abaixo. As demais linhas do bloco
 * 1 (receita bruta, desconto, repasse, receita de produtos, por fora, ICMS, PIS/COFINS,
 * receita líquida, custos, RT) NÃO MUDARAM e seguem sendo as da planilha, ao centavo — é o
 * contraste que prova que a alteração é de uma linha só.
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

    it('custos e RT seguem os da planilha: −113.246,58 e −3.319,68', () => {
      expect(linha(r, 'custos').total).toBeCloseTo(-113246.58, 1)
      expect(linha(r, 'rt').total).toBeCloseTo(-3319.68, 1)
    })

    it('DESPESAS: −80.247,31 CONGELADA, e não os −76.087,15 recalculados da planilha', () => {
      // 350.119,13 (receita de produtos SEM desconto) × 22,92%. Ver o cabeçalho.
      expect(linha(r, 'despesas').total).toBeCloseTo(-80247.31, 1)
      expect(linha(r, 'despesas').perItem[0]).toBeCloseTo(-59903.74, 1)
      expect(linha(r, 'despesas').perItem[1]).toBeCloseTo(-20343.56, 1)
      // O discriminante, e ele é o número da própria planilha: recalculada sobre a receita
      // pós-desconto ela daria R$ 4.160,16 a menos.
      expect(linha(r, 'despesas').total).not.toBeCloseTo(-76087.15, 1)
    })

    it('RRO: 39.498,64, sendo 29.758,24 e 9.740,40', () => {
      // Os 43.658,79 da planilha menos os R$ 4.160,16 da despesa que deixou de encolher.
      expect(linha(r, 'rro').perItem[0]).toBeCloseTo(29758.24, 1)
      expect(linha(r, 'rro').perItem[1]).toBeCloseTo(9740.40, 1)
      expect(linha(r, 'rro').total).toBeCloseTo(39498.64, 1)
      expect(linha(r, 'rro').total).not.toBeCloseTo(43658.79, 1)
    })
  })

  describe('2. DISTRIBUIÇÃO DO RRO — R20, planilha linhas 82 a 86', () => {
    it('comissão 13.236,81 · lucro 21.178,90 · IRPJ 3.176,83 · CSLL 1.906,10', () => {
      // Os PESOS da R20 não mudaram — o que encolheu foi o RRO que eles repartem.
      expect(linha(r, 'comissao').total).toBeCloseTo(13236.81, 1)
      expect(linha(r, 'lucro').total).toBeCloseTo(21178.90, 1)
      expect(linha(r, 'irpj').total).toBeCloseTo(3176.83, 1)
      expect(linha(r, 'csll').total).toBeCloseTo(1906.10, 1)
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
      // A despesa é CONGELADA e não exibe percentual — o valor dela sobre a receita de
      // produtos é que tem de dar os 22,92% cadastrados, e dá.
      const rpSemDesc = linha(semDesconto, 'receita_produtos').total
      expect(Math.abs(linha(semDesconto, 'despesas').total) / rpSemDesc)
        .toBeCloseTo(CENARIO.categories.despesasOperacionaisPct, 12)
      expect(linha(semDesconto, 'despesas').pct).toBeNull()
      expect(linha(semDesconto, 'rt').pct).toBeCloseTo(0.01, 12)
      // E o lucro apurado volta ao cadastrado: lucro ÷ receita de produtos = 8%.
      const rpSem = linha(semDesconto, 'receita_produtos').total
      expect(linha(semDesconto, 'lucro').total / rpSem).toBeCloseTo(0.08, 6)
    })
  })

  describe('6. ANÁLISE VERTICAL (seção 6.4)', () => {
    it('é sobre a receita APÓS descontos, e o lucro dá 6,141%', () => {
      expect(r.receitaAposDesconto).toBeCloseTo(344864.26, 1)
      expect(analiseVertical(linha(r, 'lucro').total, r.receitaAposDesconto)).toBeCloseTo(0.061412269415712, 10)
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
      // E NENHUM lucro é declarado. Um DRE que não fechou não tem lucro a informar, e um
      // objeto zerado aqui afirmaria "o lucro desta venda é zero" — que é outra coisa.
      expect(r2.lucroDaVenda).toBeNull()
    })
  })

  describe('8. LUCRO DA VENDA — o objetivo final (seção 6.2)', () => {
    it('R$ 21.178,90, ou 6,14% da receita após desconto, contra os 8,00% cadastrados', () => {
      // O par é o ponto: o lucro sozinho não diz nada; ele contra o cadastrado diz quanto o
      // desconto consumiu — e consome MAIS agora, porque a despesa não encolhe junto.
      const l = r.lucroDaVenda!
      expect(l.valor).toBeCloseTo(21178.90, 1)
      expect(l.pctApurado).toBeCloseTo(0.061412269415712, 10)
      expect(l.pctCadastrado).toBeCloseTo(0.08, 12)
      // A DIFERENÇA é contra o percentual sobre PRODUTOS, não contra o da receita após
      // desconto — ver o caso "DUAS BASES" abaixo, que é o motivo.
      expect(l.pctSobreProdutos).toBeCloseTo(0.063797932955618, 10)
      expect(l.diferenca).toBeCloseTo(0.063797932955618 - 0.08, 10)
      expect(l.diferenca).toBeLessThan(0)
    })

    it('DUAS BASES, e confundi-las atribui ao desconto o que é do repasse', () => {
      // MINHA HIPÓTESE ERA QUE, SEM DESCONTO, O APURADO VOLTAVA AOS 8% — e este caso a
      // derrubou: sobre a receita APÓS DESCONTO ele dá 7,7158%, porque essa receita inclui
      // R$ 12.895,87 de repasse (itens manuais + acréscimos) que não geram lucro.
      // `hipotese-derrubada-pela-propria-medicao.md`: a suposição e a medição que a desmente
      // têm o mesmo autor, com minutos de intervalo.
      const sem = buildDecomposition({ ...CENARIO, discountPct: 0 })
      expect(sem.lucroDaVenda!.pctApurado).toBeCloseTo(0.0771580516698, 10)
      expect(sem.lucroDaVenda!.pctApurado).not.toBeCloseTo(0.08, 3)

      // Sobre a RECEITA DE PRODUTOS, sim: exatamente o cadastrado. É o teste 3 do checklist.
      expect(sem.lucroDaVenda!.pctSobreProdutos).toBeCloseTo(0.08, 10)
      expect(sem.lucroDaVenda!.diferenca).toBeCloseTo(0, 10)
    })

    it('a DIFERENÇA é só o desconto — o repasse não entra nela', () => {
      // Com 5%, o apurado sobre a receita após desconto cai 1,2120 pontos abaixo do
      // cadastrado; a diferença exibida é 0,9482, porque 0,2842 daquilo é repasse, não
      // desconto. Atribuir a queda inteira ao desconto seria um número que a construção
      // nunca produziu.
      const l = r.lucroDaVenda!
      expect(l.pctCadastrado - l.pctApurado!).toBeCloseTo(0.0185877306, 8)
      expect(Math.abs(l.diferenca!)).toBeCloseTo(0.0162020670, 8)
      expect(Math.abs(l.diferenca!)).toBeLessThan(l.pctCadastrado - l.pctApurado!)
    })

    it('quanto MAIOR o desconto, mais o lucro apurado se afasta do cadastrado', () => {
      const d = [0, 0.05, 0.1, 0.2].map((x) => buildDecomposition({ ...CENARIO, discountPct: x }).lucroDaVenda!)
      for (let i = 1; i < d.length; i++) {
        expect(d[i].pctApurado!).toBeLessThan(d[i - 1].pctApurado!)
        expect(d[i].pctSobreProdutos!).toBeLessThan(d[i - 1].pctSobreProdutos!)
        expect(d[i].diferenca!).toBeLessThan(d[i - 1].diferenca!)
      }
      // E o cadastrado NÃO se move — é ele que serve de régua.
      for (const x of d) expect(x.pctCadastrado).toBeCloseTo(0.08, 12)
    })

    it('o lucro POR PRODUTO vem junto — é o que diz em qual produto a margem foi', () => {
      expect(r.lucroDaVenda!.perItem).toHaveLength(2)
      expect(r.lucroDaVenda!.perItem![0]).toBeCloseTo(15956.16, 1)
      expect(r.lucroDaVenda!.perItem![1]).toBeCloseTo(5222.74, 1)
      // E a soma dos dois é o valor total — R16 vale aqui também.
      expect(r.lucroDaVenda!.perItem!.reduce((a, b) => a + b, 0)).toBeCloseTo(r.lucroDaVenda!.valor, 8)
    })

    it('a ÚLTIMA LINHA DO DRE continua sendo o RESIDUAL (seção 6.4)', () => {
      // O lucro da venda é destaque SEPARADO, como a linha 88 da planilha, que vem depois do
      // DRE terminado na 86. Enfiá-lo no fim da tabela tiraria do residual o lugar que a 6.4
      // lhe dá — e foi isso que a primeira versão desta correção fez, antes de ser desfeita.
      expect(r.rows[r.rows.length - 1].key).toBe('residual')
      expect(r.rows.some((x) => x.key === 'lucro_da_venda')).toBe(false)
    })

    it('sem linhas, `lucroDaVenda` é `null` — e `null` não é lucro zero', () => {
      const vazio = buildDecomposition({ ...CENARIO, items: [] })
      expect(vazio.lucroDaVenda).toBeNull()
      // Os TRÊS caminhos de recusa, porque cada um tem o seu `return` — e um deles escapou
      // da primeira versão deste caso, que só cobria dois.
      expect(buildDecomposition({ ...CENARIO, discountPct: 1 }).lucroDaVenda).toBeNull()
      expect(buildDecomposition({
        ...CENARIO,
        categories: { ...CENARIO.categories, comissaoPct: 0, lucroPct: 0, irpjPct: 0, csllPct: 0 },
      }).lucroDaVenda).toBeNull()
    })
  })
})