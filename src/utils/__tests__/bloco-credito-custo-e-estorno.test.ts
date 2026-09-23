/**
 * BLOCO DE CRÉDITO × BLOCO DE CUSTO · ICMS EFETIVO · SÉRIE E ESTORNO
 *
 * Os oráculos A–N do comando do PO de 23/09/2026, §8: "MEÇA ANTES, PROVE DEPOIS".
 *
 * >>> O QUE CADA GRUPO PRECISA DISCRIMINAR <<<
 *
 * A (não-regressão) é o caso que segura tudo: o `amount` gravado hoje NÃO pode mudar quando
 * o bloco de custo está vazio. Sem ele, "o total da nota vira o amount" é uma frase que
 * também descreve um sistema que passou a cobrar errado de todo mundo.
 *
 * E (posição) usa DOIS cenários com resultados opostos — Simples com os cinco embaixo, e uso
 * e consumo no Lucro Real com ICMS embaixo e IVA em cima. Um cenário só não distinguiria "a
 * vedação decide" de "tudo desce" (`teste-que-nao-exercita.md`, variante 2).
 *
 * K (veto) afirma a CONTAGEM ANTES E DEPOIS, não só o código 409: um 409 devolvido depois de
 * desativar a série seria verde no status e desastre no dado.
 */
import {
  calcularCustoDoItem,
  resolverFlagsDoItem,
  baseDoTributo,
  TRIBUTOS_CREDITAVEIS,
  type BandeirasDeCredito,
  type DestinacaoItem,
  type TributoCreditavel,
  type ValoresDaCompra,
} from '@/utils/custo-liquido-do-item'
/*
  >>> `totalDaNota` VIROU `descascarANota` EM 24/09/2026 <<<

  A tela SOMAVA e passou a DESCASCAR: o total é digitado e a base é revelada. Os casos
  abaixo afirmavam a SOMA, e a soma deixou de existir — então eles passam a afirmar a mesma
  nota pelo caminho novo. O que eles protegem não mudou: o total de 1.172,00, o IPI nos dois
  blocos e as parcelas que fecham.
*/
import { descascarANota, ratearParcelas, linhasDoDescascamento } from '@/utils/nota-de-compra'
import {
  posicaoDoTributo,
  posicoesDosTributos,
  tributosPorBloco,
  aceitaEntrada,
  bandeirasGravadasDaPosicao,
  ROTULO_DO_BLOCO,
} from '@/utils/posicao-do-tributo'
import {
  classificarExclusao,
  vinculoDaSerie,
  notaDeveSerDesativada,
  espelhoDoEstorno,
  notaEstaEstornada,
  AVISO_SEM_VINCULO,
  PREFIXO_DO_ESTORNO,
  type LancamentoDaSerie,
} from '@/utils/serie-e-estorno'

const fs = require('fs') as typeof import('fs')
const path = require('path') as typeof import('path')
const ler = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

const flags = (regime: string, destinacao: DestinacaoItem, segmento = 'INDUSTRIALIZACAO'): BandeirasDeCredito =>
  resolverFlagsDoItem({ regime, destinacao, segmento }, {})

// ═════════════════════════════════════════════════════════════════════════════════════════
// A — NÃO-REGRESSÃO DO VALOR
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('A — despesa sem IPI e com o bloco de custo VAZIO grava o mesmo de hoje', () => {
  it('>>> o total da nota é o valor digitado, ao centavo <<<', () => {
    // Sem nada no bloco de custo, o total digitado É a base: o descascamento não tira nada.
    expect(descascarANota({ total: 1000, bandeiras: flags('LUCRO_REAL', 'REVENDA') }).total).toBeCloseTo(1000.0, 2)
    expect(descascarANota({ total: 1000, bandeiras: flags('LUCRO_REAL', 'REVENDA') }).base).toBeCloseTo(1000.0, 2)
    expect(descascarANota({
      total: 1000,
      reducoes: { ipiCusto: null, icmsSt: null, difal: null, fcp: null },
      bandeiras: flags('LUCRO_REAL', 'REVENDA'),
    }).base).toBeCloseTo(1000.0, 2)
  })

  it('>>> e as parcelas são as de hoje: 1.000,00 em 3x = 333,33 · 333,33 · 333,34 <<<', () => {
    const p = ratearParcelas(1000, [1, 1, 1])
    expect(p).toEqual([333.33, 333.33, 333.34])
    expect(p.reduce((a, v) => a + v, 0)).toBeCloseTo(1000.0, 2)
  })

  it('uma parcela só recebe o total inteiro, sem sobra a distribuir', () => {
    expect(ratearParcelas(1000, [1])).toEqual([1000])
  })

  it('>>> o custo líquido também não muda: nenhum campo novo informado, nenhum efeito <<<', () => {
    const v: ValoresDaCompra = { base: 1000, icmsPct: 18, pisCofinsPct: 9.25, ipiPct: 5, icmsSt: 50 }
    const antes = calcularCustoDoItem(v, flags('LUCRO_REAL', 'REVENDA'))
    const depois = calcularCustoDoItem(
      { ...v, ipiCustoValor: null, difalValor: null },
      flags('LUCRO_REAL', 'REVENDA'),
    )
    expect(depois.custoBruto).toBeCloseTo(antes.custoBruto, 2)
    expect(depois.custoLiquido).toBeCloseTo(antes.custoLiquido, 2)
    expect(depois.creditoTotal).toBeCloseTo(antes.creditoTotal, 2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// B — O TOTAL FECHA
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('B — produtos 1.000 + IPI 100 + ST 50 + DIFAL 18 + FCP 4 = 1.172,00', () => {
  const t = descascarANota({
    total: 1172,
    reducoes: { ipiCusto: 40, icmsSt: 50, difal: 18, fcp: 4 },
    porFora: { ipi: { brl: 60 } },
    bandeiras: flags('LUCRO_REAL', 'INSUMO'),
  })

  it('>>> o total é 1.172,00, e o IPI da nota é 100,00 — 60 de crédito e 40 de custo <<<', () => {
    expect(t.total).toBeCloseTo(1172.0, 2)
    expect(t.creditos.ipi + 40).toBeCloseTo(100.0, 2)
    expect(t.base).toBeCloseTo(1000.0, 2)
  })

  it('>>> em 3x: as parcelas somam 1.172,00 EXATOS, com a sobra na última <<<', () => {
    const p = ratearParcelas(t.total, [1, 1, 1])
    expect(p).toEqual([390.67, 390.67, 390.66])
    expect(p.reduce((a, v) => a + v, 0)).toBeCloseTo(1172.0, 2)
  })

  it('>>> em 7x: a divisão não fecha, e a soma continua exata <<<', () => {
    const p = ratearParcelas(t.total, [1, 1, 1, 1, 1, 1, 1])
    expect(p).toHaveLength(7)
    expect(p.reduce((a, v) => a + v, 0)).toBeCloseTo(1172.0, 2)
    // 1.172,00 ÷ 7 = 167,4285…: seis parcelas de 167,43 e a última absorvendo a diferença.
    expect(p.slice(0, 6).every((v) => v === 167.43)).toBe(true)
    expect(p[6]).toBeCloseTo(167.42, 2)
  })

  it('>>> parcelas DESIGUAIS preservam a proporção e ainda fecham <<<', () => {
    // 30% de entrada e duas de 35%: o usuário digitou, e a nota inteira segue a proporção.
    const p = ratearParcelas(t.total, [300, 350, 350])
    expect(p.reduce((a, v) => a + v, 0)).toBeCloseTo(1172.0, 2)
    expect(p[0]).toBeCloseTo(351.6, 2)
  })

  it('a leitura da tela traz as seis linhas, na ordem do §5', () => {
    // A escada substituiu a soma: o total está no TOPO, e a base é o degrau de baixo.
    const linhas = linhasDoDescascamento(t)
    expect(linhas[0].rotulo).toBe('Valor total da nota')
    expect(linhas[0].valor).toBeCloseTo(1172.0, 2)
    expect(linhas.find((l) => l.ehSaldo)?.valor).toBeCloseTo(1060.0, 2)
    expect(linhas.find((l) => l.ehBase)?.valor).toBeCloseTo(1000.0, 2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// C — O BLOCO DE CUSTO NÃO CREDITA
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('C — IPI-custo, ST, DIFAL e FCP não mexem em crédito NENHUM', () => {
  const base: ValoresDaCompra = { base: 1000, icmsPct: 18, pisCofinsPct: 9.25, ipiPct: 6 }
  const b = flags('LUCRO_REAL', 'INSUMO')
  const semBloco = calcularCustoDoItem(base, b)
  const comBloco = calcularCustoDoItem(
    { ...base, ipiCustoValor: 40, icmsSt: 50, difalValor: 18, fcp: 4 },
    b,
  )

  it('>>> os cinco créditos são IDÊNTICOS, tributo a tributo <<<', () => {
    for (const t of TRIBUTOS_CREDITAVEIS) {
      expect(comBloco.creditos[t]).toBeCloseTo(semBloco.creditos[t], 2)
    }
    expect(comBloco.creditoTotal).toBeCloseTo(semBloco.creditoTotal, 2)
  })

  it('>>> e os quatro entram INTEIROS no custo bruto: +112,00 <<<', () => {
    expect(comBloco.custoBruto - semBloco.custoBruto).toBeCloseTo(112.0, 2)
    expect(comBloco.custoLiquido - semBloco.custoLiquido).toBeCloseTo(112.0, 2)
  })

  it('>>> o DIFAL INFORMADO vence a fórmula, inclusive quando é ZERO <<<', () => {
    const porFormula = calcularCustoDoItem({ ...base, difalOrigemPct: 12, difalDestinoPct: 18 }, b)
    expect(porFormula.valores.difal).toBeGreaterThan(0)
    // Zero informado NÃO cai na fórmula: é afirmação sobre a nota, não ausência.
    const informadoZero = calcularCustoDoItem(
      { ...base, difalOrigemPct: 12, difalDestinoPct: 18, difalValor: 0 }, b,
    )
    expect(informadoZero.valores.difal).toBe(0)
    const informado = calcularCustoDoItem(
      { ...base, difalOrigemPct: 12, difalDestinoPct: 18, difalValor: 18 }, b,
    )
    expect(informado.valores.difal).toBeCloseTo(18.0, 2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// D — IPI NOS DOIS BLOCOS AO MESMO TEMPO
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('D — a mesma nota com IPI creditável de 60,00 e IPI-custo de 40,00', () => {
  // 6% sobre 1.000 = 60,00 de crédito; 40,00 declarados como custo.
  const r = calcularCustoDoItem(
    { base: 1000, ipiPct: 6, ipiCustoValor: 40 },
    flags('LUCRO_REAL', 'INSUMO'),
  )

  it('>>> crédito 60,00 e custo 40,00 convivem — e NÃO é erro <<<', () => {
    expect(r.creditos.IPI).toBeCloseTo(60.0, 2)
    expect(r.valores.ipi).toBeCloseTo(60.0, 2)
    expect(r.valores.ipiCusto).toBeCloseTo(40.0, 2)
  })

  it('>>> o bruto carrega os 100,00 e o crédito só os 60,00 <<<', () => {
    // base 1.000 + IPI crédito 60 + IPI custo 40 = 1.100,00
    expect(r.custoBruto).toBeCloseTo(1100.0, 2)
    expect(r.creditoTotal).toBeCloseTo(60.0, 2)
    expect(r.custoLiquido).toBeCloseTo(1040.0, 2)
  })

  it('>>> e o rodapé soma os dois: 60,00 + 40,00 = 100,00 <<<', () => {
    const t = descascarANota({
      total: 1100,
      reducoes: { ipiCusto: 40 },
      porFora: { ipi: { brl: 60 } },
      bandeiras: flags('LUCRO_REAL', 'INSUMO'),
    })
    expect(t.creditos.ipi + 40).toBeCloseTo(100.0, 2)
    expect(t.base).toBeCloseTo(1000.0, 2)
  })

  it('NÃO há validação cruzada: o sistema não conhece o total do IPI do documento', () => {
    // Um IPI-custo maior que o crédito é aceito, porque a nota pode ser assim.
    const outro = calcularCustoDoItem({ base: 1000, ipiPct: 1, ipiCustoValor: 900 }, flags('LUCRO_REAL', 'INSUMO'))
    expect(outro.valores.ipiCusto).toBeCloseTo(900.0, 2)
    expect(outro.creditos.IPI).toBeCloseTo(10.0, 2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// E — A VEDAÇÃO DECIDE A POSIÇÃO
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('E — a posição sai da bandeira, e a bandeira sai da lei', () => {
  it('>>> SIMPLES: as cinco linhas nascem no bloco de CUSTO, e nenhuma aceita entrada <<<', () => {
    const b = flags('SIMPLES_NACIONAL', 'REVENDA')
    const { credito, custo } = tributosPorBloco(b)
    expect(credito).toEqual([])
    expect(custo).toEqual([...TRIBUTOS_CREDITAVEIS])
    for (const t of TRIBUTOS_CREDITAVEIS) expect(aceitaEntrada(b[t])).toBe(false)
  })

  it('>>> USO E CONSUMO no Lucro Real: ICMS embaixo, CBS e IBS em cima <<<', () => {
    const b = flags('LUCRO_REAL', 'USO_CONSUMO')
    const pos = posicoesDosTributos(b)
    expect(pos.ICMS).toBe('CUSTO')
    expect(pos.CBS).toBe('CREDITO')
    expect(pos.IBS).toBe('CREDITO')
    // E o que está em cima ACEITA entrada; o de baixo, não.
    expect(aceitaEntrada(b.CBS)).toBe(true)
    expect(aceitaEntrada(b.ICMS)).toBe(false)
  })

  /**
   * >>> O CASO QUE A MUTAÇÃO M5 EXIGIU <<<
   *
   * Apagar `if (b.vedado) return 'CUSTO'` de `posicaoDoTributo` deixava a suíte VERDE: em
   * todos os cenários testados o tributo vedado também vinha com `ativo: false`, e o
   * `return b.ativo ? …` devolvia CUSTO por outro caminho. O caso não distinguia "a vedação
   * decide" de "a bandeira decide, e por acaso coincidem".
   *
   * O estado que DISCRIMINA é `vedado: true` COM `ativo: true` — a coluna gravada dizendo
   * que credita e a lei dizendo que não. Ele não sai de `resolverFlagsDoItem` hoje, e é
   * exatamente o que aparece no dia em que um item gravado com `true` passa a ser vedado por
   * mudança de regime: ali a vedação TEM de ganhar.
   *
   * `teste-que-nao-exercita.md`, variante 2: o caso escolhido não discrimina.
   */
  it('>>> vedado GANHA da bandeira ligada: `vedado:true` + `ativo:true` vai para CUSTO <<<', () => {
    const conflito = { ativo: true, vedado: true, motivo: 'no DAS', origem: 'vedacao' as const }
    expect(posicaoDoTributo(conflito)).toBe('CUSTO')
    expect(aceitaEntrada(conflito)).toBe(false)
    // E a coluna NÃO é reescrita para `false` por causa disso.
    const b = { ICMS: conflito } as unknown as BandeirasDeCredito
    expect(bandeirasGravadasDaPosicao({ ICMS: 'CUSTO' }, b).ICMS).toBeNull()
  })

  it('>>> vedado e desligado ficam no MESMO bloco e são coisas diferentes <<<', () => {
    const vedado = { ativo: false, vedado: true, motivo: 'no DAS', origem: 'vedacao' as const }
    const desligado = { ativo: false, vedado: false, origem: 'gravada' as const }
    expect(posicaoDoTributo(vedado)).toBe('CUSTO')
    expect(posicaoDoTributo(desligado)).toBe('CUSTO')
    // A diferença: o desligado pode voltar para cima; o vedado não.
    expect(aceitaEntrada(vedado)).toBe(false)
    expect(aceitaEntrada(desligado)).toBe(false)
  })

  it('>>> a bandeira gravada é DERIVADA da posição — e o VEDADO não vira `false` <<<', () => {
    const b = flags('SIMPLES_NACIONAL', 'REVENDA')
    const grav = bandeirasGravadasDaPosicao(posicoesDosTributos(b), b)
    // Gravar `false` transformaria uma proibição da lei numa escolha do usuário.
    for (const t of TRIBUTOS_CREDITAVEIS) expect(grav[t]).toBeNull()

    const lr = flags('LUCRO_REAL', 'INSUMO')
    const gravLr = bandeirasGravadasDaPosicao(posicoesDosTributos(lr), lr)
    expect(gravLr.ICMS).toBe(true)
    expect(gravLr.IPI).toBe(true)
  })

  it('os rótulos dos dois blocos são os do comando', () => {
    expect(ROTULO_DO_BLOCO.CREDITO).toBe('Gera crédito')
    expect(ROTULO_DO_BLOCO.CUSTO).toBe('Não gera crédito — compõe o custo')
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// F — AUSENTE ≠ ZERO
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('F — campo novo vazio é `null`; com 0 é 0', () => {
  it('>>> a migração NÃO pode ter DEFAULT 0 em nenhuma coluna nova <<<', () => {
    const m1 = ler('supabase/migrations/20260923000002_bloco_de_custo_na_nota_e_no_item.sql')
    const m2 = ler('supabase/migrations/20260923000003_serie_de_parcelas_e_estorno.sql')
    for (const m of [m1, m2]) {
      expect(m).not.toMatch(/ADD COLUMN[^;]*DEFAULT\s+0/i)
      expect(m).not.toMatch(/ADD COLUMN[^;]*NOT NULL/i)
    }
  })

  it('>>> e a distinção sobrevive à conta: ausente some, zero afirma <<<', () => {
    const b = flags('LUCRO_REAL', 'INSUMO')
    const ausente = calcularCustoDoItem({ base: 1000, ipiCustoValor: null }, b)
    const zero = calcularCustoDoItem({ base: 1000, ipiCustoValor: 0 }, b)
    // No número os dois coincidem — e é justamente por isso que a distinção se perde fácil.
    expect(ausente.custoBruto).toBeCloseTo(zero.custoBruto, 2)
    // O que NÃO coincide é o que se grava: `null` contra `0`.
    expect(valorParaGravar(null)).toBeNull()
    expect(valorParaGravar(0)).toBe(0)
  })

  it('a migração COMENTA a coluna que precisa de explicação', () => {
    const m = ler('supabase/migrations/20260923000002_bloco_de_custo_na_nota_e_no_item.sql')
    expect(m).toMatch(/COMMENT ON COLUMN public\.purchase_invoices\.valor_ipi_custo/)
    expect(m).toContain('A parcela creditável fica em credit_ipi')
  })
})

/** O que a tela grava: `null` quando o campo está vazio, o número quando há número. */
const valorParaGravar = (v: number | null | undefined): number | null =>
  v == null || Number.isNaN(Number(v)) ? null : Number(v)

// ═════════════════════════════════════════════════════════════════════════════════════════
// G — O ICMS EFETIVO NA TELA DO ITEM
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('G — destacado 18,00% com 60,00% deferido mostra 7,20%', () => {
  const DESTACADO = 18
  const DEFERIDO = 60
  const PRECO = 1000

  it('>>> o efetivo é 7,20% e o crédito é o DELE: R$ 72,00 <<<', () => {
    const efetivoPct = DESTACADO * (1 - DEFERIDO / 100)
    expect(efetivoPct).toBeCloseTo(7.2, 4)
    const r = calcularCustoDoItem({ base: PRECO, icmsPct: efetivoPct }, flags('LUCRO_REAL', 'REVENDA'))
    expect(r.valores.icms).toBeCloseTo(72.0, 2)
    expect(r.creditos.ICMS).toBeCloseTo(72.0, 2)
  })

  it('>>> e NÃO é o destacado: 180,00 é o número que a tela mostrava sem dizer em que virou <<<', () => {
    const semDiferimento = calcularCustoDoItem({ base: PRECO, icmsPct: DESTACADO }, flags('LUCRO_REAL', 'REVENDA'))
    expect(semDiferimento.valores.icms).toBeCloseTo(180.0, 2)
    expect(semDiferimento.valores.icms).not.toBeCloseTo(72.0, 2)
  })

  it('>>> a base do PIS/COFINS acompanha o EFETIVO, não o destacado <<<', () => {
    const v: ValoresDaCompra = { base: PRECO, icmsPct: DESTACADO, icmsDeferidoAtivo: true, icmsDeferidoPct: DEFERIDO }
    // 1.000 − 72 = 928, e não 1.000 − 180 = 820.
    expect(baseDoTributo(v, 'PIS_COFINS')).toBeCloseTo(928.0, 2)
  })

  it('>>> com o switch DESLIGADO a linha de efetivo não existe: a tela mostra só o destacado <<<', () => {
    const src = ler('src/page-parts/items/new-item-form.component.tsx')
    // A linha só é renderizada sob a condição do switch — uma linha "efetivo = destacado"
    // treinaria o usuário a ignorar as três.
    expect(src).toContain('icmsDeferidoEnabled &&')
    expect(src).toContain('ICMS efetivo')
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// H — O ITEM ABRE IGUAL
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('H — a coluna gravada decide a posição na abertura, e nada é reescrito', () => {
  const ctx = { regime: 'LUCRO_REAL', destinacao: 'REVENDA' as DestinacaoItem, segmento: 'INDUSTRIALIZACAO' }

  it('>>> `ipi_credit_enabled = false` abre no bloco de CUSTO <<<', () => {
    const b = resolverFlagsDoItem(ctx, { IPI: false })
    expect(posicoesDosTributos(b).IPI).toBe('CUSTO')
  })

  it('>>> `true` abre no bloco de CRÉDITO — mesmo em REVENDA, onde o padrão é desligado <<<', () => {
    const b = resolverFlagsDoItem(ctx, { IPI: true })
    expect(posicoesDosTributos(b).IPI).toBe('CREDITO')
    // O padrão da destinação REVENDA deixa o IPI desligado: é o que torna este caso um caso.
    expect(posicoesDosTributos(resolverFlagsDoItem(ctx, {})).IPI).toBe('CUSTO')
  })

  it('>>> `null` cai na posição do PADRÃO DA DESTINAÇÃO, e não num default de tela <<<', () => {
    expect(posicoesDosTributos(resolverFlagsDoItem(ctx, { IPI: null })).IPI).toBe('CUSTO')
    const insumo = { ...ctx, destinacao: 'INSUMO' as DestinacaoItem }
    expect(posicoesDosTributos(resolverFlagsDoItem(insumo, { IPI: null })).IPI).toBe('CREDITO')
  })

  it('>>> a ida e volta não reescreve coluna: o que abre em CRÉDITO grava `true` <<<', () => {
    const b = resolverFlagsDoItem(ctx, { ICMS: true, IPI: false })
    const grav = bandeirasGravadasDaPosicao(posicoesDosTributos(b), b)
    expect(grav.ICMS).toBe(true)
    expect(grav.IPI).toBe(false)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// I — O CUSTO DA FRAÇÃO INTACTO
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('I — item existente sem FCP: custo por fração antes = depois', () => {
  const ITEM: ValoresDaCompra = {
    base: 1000, icmsPct: 18, pisCofinsPct: 9.25, ipiPct: 5, icmsSt: 50, qtdMedida: 6,
  }

  it('>>> 140,69 antes e depois, e a fórmula continua sendo líquido ÷ QTD <<<', () => {
    const r = calcularCustoDoItem(ITEM, flags('LUCRO_REAL', 'REVENDA'))
    expect(r.custoPorFracao).toBeCloseTo(140.69, 2)
    expect(r.custoPorFracao).toBeCloseTo(r.custoLiquido / 6, 10)
  })

  it('>>> e sem QTD. medida continua `null` — não é zero, nem o próprio líquido <<<', () => {
    const r = calcularCustoDoItem({ ...ITEM, qtdMedida: null }, flags('LUCRO_REAL', 'REVENDA'))
    expect(r.custoPorFracao).toBeNull()
  })

  it('o FCP ausente não muda nada; informado, entra no bruto', () => {
    const sem = calcularCustoDoItem(ITEM, flags('LUCRO_REAL', 'REVENDA'))
    const com = calcularCustoDoItem({ ...ITEM, fcp: 12 }, flags('LUCRO_REAL', 'REVENDA'))
    expect(com.custoBruto - sem.custoBruto).toBeCloseTo(12.0, 2)
    expect(com.creditoTotal).toBeCloseTo(sem.creditoTotal, 2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// J — EXCLUSÃO LIMPA
// ═════════════════════════════════════════════════════════════════════════════════════════

const serieDe = (n: number, pagas: number[] = []): LancamentoDaSerie[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    due_date: `2026-0${i + 1}-10`,
    amount: 200,
    paid_date: pagas.includes(i + 1) ? `2026-0${i + 1}-09` : null,
    is_active: true,
  }))

describe('J — nota em 5x, nenhuma paga: as cinco saem juntas', () => {
  const d = classificarExclusao({ escopo: 'SERIE', serie: serieDe(5), alvo: 'p2' })

  it('>>> as CINCO são desativadas, inclusive a que não foi clicada <<<', () => {
    expect(d.permitido).toBe(true)
    expect(d.aDesativar).toEqual(['p1', 'p2', 'p3', 'p4', 'p5'])
    expect(d.pagas).toEqual([])
  })

  it('>>> e a nota vai junto, porque não sobra nada ativo apontando para ela <<<', () => {
    expect(notaDeveSerDesativada(0)).toBe(true)
    expect(notaDeveSerDesativada(1)).toBe(false)
  })

  it('parcela já inativa não é recontada nem redesativada', () => {
    const serie = serieDe(5)
    serie[0].is_active = false
    const r = classificarExclusao({ escopo: 'SERIE', serie, alvo: 'p2' })
    expect(r.aDesativar).toEqual(['p2', 'p3', 'p4', 'p5'])
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// K — EXCLUSÃO VETADA
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('K — a mesma nota com a 2ª PAGA: a série é vetada e NADA é tocado', () => {
  const serie = serieDe(5, [2])
  const d = classificarExclusao({ escopo: 'SERIE', serie, alvo: 'p1' })

  it('>>> vetado, e `aDesativar` VAZIO — não é o status que protege o dado <<<', () => {
    expect(d.permitido).toBe(false)
    expect(d.motivo).toBe('SERIE_COM_PAGA')
    expect(d.aDesativar).toEqual([])
  })

  it('>>> a paga volta na resposta com data e valor, para a tela listar <<<', () => {
    expect(d.pagas).toEqual([{ id: 'p2', due_date: '2026-02-10', amount: 200 }])
  })

  it('>>> "excluir só este vencimento" continua aberto para a PENDENTE <<<', () => {
    const so = classificarExclusao({ escopo: 'SO_ESTE', serie, alvo: 'p1' })
    expect(so.permitido).toBe(true)
    expect(so.aDesativar).toEqual(['p1'])
    // E as pagas seguem listadas, porque a tela oferece o estorno delas ali mesmo.
    expect(so.pagas).toHaveLength(1)
  })

  it('>>> mas "só este" sobre a PRÓPRIA paga é recusado: o caminho dela é o estorno <<<', () => {
    const so = classificarExclusao({ escopo: 'SO_ESTE', serie, alvo: 'p2' })
    expect(so.permitido).toBe(false)
    expect(so.motivo).toBe('ALVO_PAGO')
    expect(so.aDesativar).toEqual([])
  })

  it('>>> e a NOTA fica inteira, com o crédito inteiro: sobrou parcela paga <<<', () => {
    expect(notaDeveSerDesativada(4)).toBe(false)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// L — ESTORNO
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('L — parcela paga de 500,00 estornada em 23/09', () => {
  const original = {
    id: 'orig-1',
    tenant_id: 'T',
    type: 'EXPENSE' as const,
    amount: 500,
    description: 'Fornecedor X (2/5)',
    paid_date: '2026-08-15',
    expense_category: 'Matéria-prima',
    expense_group: 'CUSTO_PRODUTO',
  }
  const e = espelhoDoEstorno(original, '2026-09-23')

  it('>>> o espelho é INCOME de 500,00 em 23/09 — o dinheiro voltou <<<', () => {
    expect(e.type).toBe('INCOME')
    expect(e.amount).toBe(500)
    expect(e.due_date).toBe('2026-09-23')
    expect(e.paid_date).toBe('2026-09-23')
  })

  it('>>> e ele aponta para o original, pelos dois campos <<<', () => {
    expect(e.origin_type).toBe('ESTORNO')
    expect(e.origin_id).toBe('orig-1')
    expect(e.reversal_of_entry_id).toBe('orig-1')
    expect(e.description).toBe(`${PREFIXO_DO_ESTORNO}Fornecedor X (2/5)`)
  })

  it('>>> os créditos do espelho são ZERO, e não ausentes: o crédito é da NOTA <<<', () => {
    for (const c of ['valor_icms', 'valor_pis', 'valor_cofins', 'valor_ipi', 'valor_cbs', 'valor_ibs']) {
      expect(e[c]).toBe(0)
    }
  })

  it('>>> o `paid_date` do ORIGINAL não é tocado: agosto tem de continuar dizendo a verdade <<<', () => {
    // O espelho não carrega instrução de apagar nada do original.
    expect(Object.keys(e)).not.toContain('id')
    expect(original.paid_date).toBe('2026-08-15')
  })

  it('a categoria e o grupo acompanham, para o estorno cair na mesma linha do DRE', () => {
    expect(e.expense_category).toBe('Matéria-prima')
    expect(e.expense_group).toBe('CUSTO_PRODUTO')
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// M — O ESTORNO DE CRÉDITO CAI NA COMPETÊNCIA DO EVENTO
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('M — nota creditando em agosto, estornada em setembro', () => {
  it('>>> a nota só é dada por estornada quando NENHUMA entrada dela segue viva <<<', () => {
    const umaViva: LancamentoDaSerie[] = [
      { id: 'a', due_date: '2026-08-10', amount: 100, reversed_at: '2026-09-23', is_active: true },
      { id: 'b', due_date: '2026-09-10', amount: 100, is_active: true },
    ]
    expect(notaEstaEstornada(umaViva)).toBe(false)

    const todasEstornadas: LancamentoDaSerie[] = [
      { id: 'a', due_date: '2026-08-10', amount: 100, reversed_at: '2026-09-23', is_active: true },
      { id: 'b', due_date: '2026-09-10', amount: 100, reversed_at: '2026-09-23', is_active: true },
    ]
    expect(notaEstaEstornada(todasEstornadas)).toBe(true)
  })

  it('>>> inativa conta como não-viva: série excluída e parcela estornada chegam ao mesmo lugar <<<', () => {
    const mista: LancamentoDaSerie[] = [
      { id: 'a', due_date: '2026-08-10', amount: 100, reversed_at: '2026-09-23', is_active: true },
      { id: 'b', due_date: '2026-09-10', amount: 100, is_active: false },
    ]
    expect(notaEstaEstornada(mista)).toBe(true)
  })

  it('nota sem entrada nenhuma NÃO é "estornada" — é uma nota sem parcelas', () => {
    expect(notaEstaEstornada([])).toBe(false)
  })

  /**
   * >>> O CASO QUE A MUTAÇÃO M12 EXIGIU, E É O ORÁCULO M INTEIRO <<<
   *
   * A primeira versão só procurava a palavra `reversed_at` no arquivo — e ela aparece no
   * `select` também. Trocar o FILTRO da consulta do estorno de `reversed_at` para
   * `credit_date` deixava a suíte verde e punha o estorno de setembro na apuração de agosto:
   * exatamente a reescrita de competência passada que o §6.6 proíbe.
   *
   * O que discrimina é o INTERVALO: a consulta do estorno tem de filtrar `reversed_at`
   * entre o primeiro dia do mês exibido e o primeiro do seguinte.
   */
  it('>>> a consulta do estorno FILTRA por `reversed_at` no mês exibido <<<', () => {
    const src = ler('src/components/creditos/quadro-de-apuracao.component.tsx')
    expect(src).toContain("gte('reversed_at', primeiro)")
    expect(src).toContain("lt('reversed_at', proximo)")
    expect(src).toContain('Estorno de crédito')
  })

  it('>>> e o crédito do mês de ORIGEM não é filtrado por estorno: agosto não muda <<<', () => {
    const src = ler('src/components/creditos/quadro-de-apuracao.component.tsx')
    // A soma do crédito do mês usa `credit_date` e NÃO exclui nota estornada: o crédito
    // aconteceu, e é o estorno que o desfaz — no mês dele.
    const consulta = src.slice(src.indexOf('const ['), src.indexOf('const cred'))
    expect(consulta).toContain("gte('credit_date', primeiro)")
    expect(consulta).not.toMatch(/is\('reversed_at', null\)/)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// N — LEGADO SEM GRUPO
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('N — lançamento anterior à migração não tem série, e o texto avisa', () => {
  it('>>> sem nota e sem grupo, o vínculo é SOZINHO <<<', () => {
    expect(vinculoDaSerie({})).toBe('SOZINHO')
    expect(vinculoDaSerie({ purchase_invoice_id: null, installment_group_id: null })).toBe('SOZINHO')
  })

  it('>>> e a ordem é nota → grupo → sozinho <<<', () => {
    expect(vinculoDaSerie({ purchase_invoice_id: 'n1', installment_group_id: 'g1' })).toBe('NOTA')
    expect(vinculoDaSerie({ installment_group_id: 'g1' })).toBe('GRUPO')
  })

  it('>>> o aviso diz a data e o que vai acontecer <<<', () => {
    expect(AVISO_SEM_VINCULO).toContain('23/09/2026')
    expect(AVISO_SEM_VINCULO).toContain('Só ele será excluído')
  })

  it('>>> e a série de UM desativa UM: as irmãs antigas não são tocadas <<<', () => {
    const sozinho: LancamentoDaSerie[] = [{ id: 'x', due_date: '2026-05-10', amount: 300, is_active: true }]
    const d = classificarExclusao({ escopo: 'SERIE', serie: sozinho, alvo: 'x' })
    expect(d.aDesativar).toEqual(['x'])
  })

  it('>>> a migração NÃO faz backfill de `installment_group_id` <<<', () => {
    const m = ler('supabase/migrations/20260923000003_serie_de_parcelas_e_estorno.sql')
    expect(m).not.toMatch(/UPDATE\s+public\.cash_entries/i)
    expect(m).toContain('installment_group_id')
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// O QUE A ROTA PRECISA FAZER — e a checagem que ela NÃO pode ter copiado
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('>>> A rota classifica NO SERVIDOR, e a permissão tem uma fonte só <<<', () => {
  const rota = () => ler('src/pages/api/delete/cash-entry-series.ts')

  it('>>> a rota chama `classificarExclusao` — ela não decide por conta própria <<<', () => {
    expect(rota()).toContain('classificarExclusao')
  })

  /**
   * >>> O CASO QUE A MUTAÇÃO M11 EXIGIU <<<
   *
   * A primeira versão procurava `body.ids` e uma desestruturação com `ids`. Trocar a
   * classificação por `(req.body as { ids?: string[] }).ids` passava por baixo das duas — e
   * é justamente a forma que alguém escreveria "para deixar a tela decidir".
   *
   * A asserção que discrimina não é sobre a FORMA de ler o corpo: é sobre a palavra `ids`
   * não existir no arquivo, e sobre o que efetivamente vai para o `update` sair de
   * `decisao.aDesativar`.
   */
  it('>>> e NÃO aceita lista de ids do cliente: a palavra não existe no arquivo <<<', () => {
    // SEM comentários: a palavra aparece no docblock, que é onde ela DEVE aparecer — é ali
    // que está escrito por que a rota não a aceita.
    const s = rota().replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(s).toMatch(/req\.body/)
    expect(s).not.toMatch(/\bids\b/)
    // O que é desativado vem da DECISÃO do servidor, e de nenhum outro lugar.
    expect(s).toContain('.in(\'id\', decisao.aDesativar)')
  })

  it('>>> a checagem de permissão é IMPORTADA, e as duas rotas leem a mesma <<<', () => {
    const modulo = 'src/lib/permissao-do-modulo.ts'
    expect(fs.existsSync(path.join(process.cwd(), modulo))).toBe(true)
    expect(rota()).toContain('permissao-do-modulo')
    // A rota antiga passa a ler o mesmo módulo: o remédio de `copia-divergente.md` não é
    // conferir as duas cópias, é apagar uma.
    expect(ler('src/pages/api/delete/cash-entries.ts')).toContain('permissao-do-modulo')
  })

  it('>>> o DELETE não existe em nenhuma das duas: a exclusão desta base é desativação <<<', () => {
    for (const f of ['src/pages/api/delete/cash-entry-series.ts', 'src/pages/api/delete/cash-entries.ts']) {
      expect(ler(f)).not.toMatch(/\.delete\(\)/)
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// O GRUPO DE PARCELAS NASCE NOS DOIS CAMINHOS DO INSERT
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('>>> `installment_group_id` é gravado nos DOIS caminhos, ou é a cópia divergente <<<', () => {
  it('as duas montagens de parcela carregam o grupo e o total da nota', () => {
    const src = ler('src/pages/fluxo-de-caixa/index.tsx')
    const corpo = src.slice(src.indexOf('const entries: any[] = []'), src.indexOf('A NOTA DE COMPRA'))
    // Uma ocorrência por caminho: o manual e o parcelamento mensal.
    const ocorrencias = corpo.split('installment_group_id').length - 1
    expect(ocorrencias).toBeGreaterThanOrEqual(2)
  })

  it('>>> e o `amount` sai do rateio do TOTAL DA NOTA, não do valor digitado <<<', () => {
    const src = ler('src/pages/fluxo-de-caixa/index.tsx')
    expect(src).toContain('ratearParcelas')
    expect(src).toContain('descascarANota')
  })
})
