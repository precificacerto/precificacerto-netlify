/**
 * O BLOCO "CUSTO DOS PRODUTOS" DO DRE — apresentação muda, resultado NÃO.
 *
 * Comando do PO de 21/09/2026, §9. A restrição que governa o arquivo inteiro:
 *
 *   > O total do grupo continua igual ao caixa: o resultado do mês NÃO pode mudar.
 *
 * E a razão é de conta, não de layout: o DRE é POR CAIXA e registra as guias pagas, que já
 * são `débito − crédito`. Deduzir o crédito outra vez no custo o contaria DUAS VEZES — o
 * lucro do mês subiria por um crédito já aproveitado.
 *
 * >>> O QUE ESTE ARQUIVO PRECISA DISTINGUIR <<<
 *
 * Um caso que só conferisse as três linhas passaria com a implementação errada, porque as
 * três linhas estão certas nas duas. O que separa a implementação certa da errada é
 * `totalNoResultado`, e é por isso que ele é afirmado em TODO caso com crédito.
 * (`teste-que-nao-exercita.md`, variante 2.)
 */
import {
  montarBlocoDeCustoDosProdutos,
  creditoRecuperavelDaCompra,
  tributosCreditaveisDoRegime,
  blocoDeCreditoVisivel,
  temBreakdownDeCompra,
} from '@/utils/custo-produtos-no-dre'

/** Uma compra de R$ 1.000,00 com os seis tributos abertos. */
const TRIBUTOS = { icms: 180, pis: 16.5, cofins: 76, ipi: 50, cbs: 88, ibs: 1 }
const SOMA_TODOS = 180 + 16.5 + 76 + 50 + 88 + 1   // 411,50
const SOMA_IVA = 88 + 1                            // 89,00

describe('Quais tributos creditam, POR REGIME — lido, não inferido', () => {
  it('Lucro Real e Presumido: os seis', () => {
    for (const r of ['LUCRO_REAL', 'LUCRO_PRESUMIDO']) {
      expect(tributosCreditaveisDoRegime(r)).toEqual(['icms', 'pis', 'cofins', 'ipi', 'cbs', 'ibs'])
    }
  })

  it('>>> Simples e MEI: NENHUM — e o bloco nem aparece <<<', () => {
    for (const r of ['SIMPLES_NACIONAL', 'MEI']) {
      expect(tributosCreditaveisDoRegime(r)).toEqual([])
      expect(blocoDeCreditoVisivel(r)).toBe(false)
    }
  })

  it('>>> Híbrido: SÓ CBS e IBS — os outros três estão no DAS e compõem o custo <<<', () => {
    expect(tributosCreditaveisDoRegime('SIMPLES_HIBRIDO')).toEqual(['cbs', 'ibs'])
    expect(blocoDeCreditoVisivel('SIMPLES_HIBRIDO')).toBe(true)
  })

  it('>>> e o EFEITO: a MESMA compra credita 411,50 no LR e 89,00 no Híbrido <<<', () => {
    expect(creditoRecuperavelDaCompra(TRIBUTOS, 'LUCRO_REAL')).toBeCloseTo(SOMA_TODOS, 2)
    expect(creditoRecuperavelDaCompra(TRIBUTOS, 'SIMPLES_HIBRIDO')).toBeCloseTo(SOMA_IVA, 2)
    expect(creditoRecuperavelDaCompra(TRIBUTOS, 'SIMPLES_NACIONAL')).toBe(0)
  })
})

describe('O breakdown: ausente não é zero', () => {
  it('>>> os seis `null` = não informado, e a entrada fica FORA do bloco <<<', () => {
    expect(temBreakdownDeCompra(null)).toBe(false)
    expect(temBreakdownDeCompra({})).toBe(false)
    expect(temBreakdownDeCompra({ icms: null, pis: null })).toBe(false)
  })

  it('>>> um zero EXPLÍCITO já é breakdown: alguém afirmou que o tributo deu zero <<<', () => {
    expect(temBreakdownDeCompra({ icms: 0 })).toBe(true)
  })
})

describe('O BLOCO — três linhas, e só a primeira entra no resultado', () => {
  const bloco = montarBlocoDeCustoDosProdutos({
    valorBrutoPago: 1000, creditoRecuperavel: SOMA_TODOS, regime: 'LUCRO_REAL',
  })

  it('as três linhas, na ordem e com o sinal certo', () => {
    expect(bloco.linhas.map((l) => l.key)).toEqual(['custo_bruto', 'creditos_recuperaveis', 'custo_liquido'])
    expect(bloco.linhas[0].valor).toBeCloseTo(1000, 2)
    expect(bloco.linhas[1].valor).toBeCloseTo(-SOMA_TODOS, 2)
    expect(bloco.linhas[2].valor).toBeCloseTo(1000 - SOMA_TODOS, 2)
  })

  it('>>> O RESULTADO NÃO MUDA: o que entra é o BRUTO, não o líquido <<<', () => {
    expect(bloco.totalNoResultado).toBeCloseTo(1000, 2)
    expect(bloco.totalNoResultado).not.toBeCloseTo(1000 - SOMA_TODOS, 2)
  })

  it('>>> e as duas linhas novas se DECLARAM apresentação — quem somar tudo erra <<<', () => {
    expect(bloco.linhas[0].apenasApresentacao).toBe(false)
    expect(bloco.linhas[1].apenasApresentacao).toBe(true)
    expect(bloco.linhas[2].apenasApresentacao).toBe(true)
    // A soma das linhas que NÃO são apresentação é o total. É esta a conta que o DRE faz.
    const soma = bloco.linhas.filter((l) => !l.apenasApresentacao).reduce((a, l) => a + l.valor, 0)
    expect(soma).toBeCloseTo(bloco.totalNoResultado, 10)
  })

  it('>>> somar TODAS as linhas daria o líquido — que é a dupla contagem que o campo impede <<<', () => {
    const somaCega = bloco.linhas.reduce((a, l) => a + l.valor, 0)
    // 1000 − 411,50 + 588,50 = 1.177,00 — nem o bruto nem o líquido. É o erro que o campo
    // `apenasApresentacao` existe para tornar impossível de cometer sem perceber.
    expect(somaCega).not.toBeCloseTo(bloco.totalNoResultado, 2)
  })
})

describe('Sem crédito, o bloco não se decompõe', () => {
  it('uma linha só, e ela É o total', () => {
    const b = montarBlocoDeCustoDosProdutos({ valorBrutoPago: 1000, creditoRecuperavel: 0, regime: 'LUCRO_REAL' })
    expect(b.linhas).toHaveLength(1)
    expect(b.linhas[0].key).toBe('custo_bruto')
    expect(b.linhas[0].apenasApresentacao).toBe(false)
    expect(b.totalNoResultado).toBeCloseTo(1000, 2)
  })

  it('>>> em Simples/MEI o crédito é DESCARTADO mesmo se vier preenchido <<<', () => {
    const b = montarBlocoDeCustoDosProdutos({
      valorBrutoPago: 1000, creditoRecuperavel: SOMA_TODOS, regime: 'SIMPLES_NACIONAL',
    })
    expect(b.linhas).toHaveLength(1)
    expect(b.creditoRecuperavel).toBe(0)
    expect(b.totalNoResultado).toBeCloseTo(1000, 2)
  })
})

describe('Híbrido: o bloco existe, e deduz SÓ o IVA', () => {
  const b = montarBlocoDeCustoDosProdutos({
    valorBrutoPago: 1000,
    creditoRecuperavel: creditoRecuperavelDaCompra(TRIBUTOS, 'SIMPLES_HIBRIDO'),
    regime: 'SIMPLES_HIBRIDO',
  })

  it('>>> deduz 89,00 e não 411,50 — ICMS, PIS/COFINS e IPI compõem o custo <<<', () => {
    expect(b.creditoRecuperavel).toBeCloseTo(SOMA_IVA, 2)
    expect(b.linhas[1].valor).toBeCloseTo(-SOMA_IVA, 2)
    expect(b.linhas[2].valor).toBeCloseTo(1000 - SOMA_IVA, 2)
  })

  it('e o resultado do mês continua sendo o bruto', () => {
    expect(b.totalNoResultado).toBeCloseTo(1000, 2)
  })
})

describe('REGRESSÃO — o total do grupo é o mesmo de antes desta etapa', () => {
  /**
   * Como o DRE montava antes: categoria com `amount − taxSum` MAIS uma linha positiva de
   * "Impostos Recuperáveis sobre Compras" com `taxSum`. A soma das duas é `amount`.
   */
  const comoEraAntes = (amount: number, taxSum: number) => (amount - taxSum) + taxSum

  it.each([
    ['LUCRO_REAL', SOMA_TODOS],
    ['LUCRO_PRESUMIDO', SOMA_TODOS],
    ['SIMPLES_HIBRIDO', SOMA_IVA],
    ['SIMPLES_NACIONAL', 0],
    ['MEI', 0],
  ])('>>> %s: o total entregue ao resultado é IDÊNTICO ao da montagem antiga <<<', (regime, credito) => {
    const b = montarBlocoDeCustoDosProdutos({
      valorBrutoPago: 1000, creditoRecuperavel: credito as number, regime,
    })
    expect(b.totalNoResultado).toBeCloseTo(comoEraAntes(1000, credito as number), 10)
    expect(b.totalNoResultado).toBeCloseTo(1000, 10)
  })
})
