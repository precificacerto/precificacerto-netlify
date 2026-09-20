/**
 * CUSTO BRUTO → CUSTO LÍQUIDO DO ITEM, crédito por crédito.
 *
 * GABARITO: o comando do PO de 20/09/2026, casos A a F. Tolerância de duas casas em R$.
 *
 * O PRINCÍPIO, na formulação do dono do produto:
 *
 *   > O custo bruto é o valor da compra; o custo líquido é o bruto menos o que gera
 *   > crédito, mais o que não gera. A precificação usa o líquido.
 *
 * O QUE MUDA, e por que não é organização de código: hoje a regra é PREMISSA FIXA — ICMS e
 * PIS/COFINS sempre recuperáveis, IPI nunca. A lei não diz isso: o IPI de insumo em indústria
 * gera crédito (RIPI arts. 226 e 227), o ICMS de uso e consumo não gera (LC 87/1996 art. 33),
 * e o PIS/COFINS não gera em regime cumulativo. Cada tributo passa a ter o seu botão.
 *
 * >>> POR QUE CADA CASO DISCRIMINA <<<
 *
 * O caso D e o caso A dão o MESMO líquido — R$ 844,15 — com brutos diferentes (1.189,00 e
 * 1.100,00) e créditos diferentes (344,85 e 255,85). É coincidência aritmética do cenário, e
 * é justamente por isso que TODO caso aqui afirma os TRÊS números: um teste que olhasse só o
 * líquido não distinguiria "o IVA foi creditado" de "não havia IVA nenhum".
 * (`teste-que-nao-exercita.md`, variante 2: o caso escolhido não discrimina.)
 *
 * O caso A é REGRESSÃO: ele tem de reproduzir exatamente o que o `main` produz hoje —
 * `1.000 − 180,00 − 75,85 + 50 + 50 = 844,15`, que é a fórmula de `recalcNetCost`.
 */
import {
  calcularCustoDoItem,
  resolverFlagsDoItem,
  creditoIbsCbsVedado,
  cstIcmsGeraCredito,
  cstIpiGeraCredito,
  cstPisCofinsGeraCredito,
  type DestinacaoItem,
  type ValoresDaCompra,
} from '@/utils/custo-liquido-do-item'
import { calcularImpactoDoCredito, houveMudancaDeCredito } from '@/utils/impacto-do-credito'

/** A compra do gabarito: R$ 1.000,00 de produto, IPI 5%, ST R$ 50,00, sem DIFAL. */
const COMPRA: ValoresDaCompra = {
  base: 1000,
  icmsPct: 18,
  pisCofinsPct: 9.25,
  ipiPct: 5,
  icmsSt: 50,
}
/** O mesmo, com IVA destacado: CBS 8,80% (R$ 88,00) e IBS 0,10% (R$ 1,00). */
const COMPRA_IVA: ValoresDaCompra = { ...COMPRA, cbsPct: 8.8, ibsPct: 0.1 }

const ctx = (destinacao: DestinacaoItem, regime = 'LUCRO_REAL', segmento = 'INDUSTRIALIZACAO') =>
  ({ regime, destinacao, segmento })

const custo = (valores: ValoresDaCompra, destinacao: DestinacaoItem, regime = 'LUCRO_REAL', segmento = 'INDUSTRIALIZACAO') =>
  calcularCustoDoItem(valores, resolverFlagsDoItem(ctx(destinacao, regime, segmento), {}))

// ═════════════════════════════════════════════════════════════════════════════════════════
// OS SEIS CASOS DO GABARITO — bruto, crédito e líquido, os três em cada um
// ═════════════════════════════════════════════════════════════════════════════════════════
describe('CASO A — revenda em Lucro Real: o comportamento de HOJE, sem IVA', () => {
  const r = custo(COMPRA, 'REVENDA')

  it('bruto 1.100,00 · crédito 255,85 · líquido 844,15', () => {
    expect(r.custoBruto).toBeCloseTo(1100.00, 2)
    expect(r.creditoTotal).toBeCloseTo(255.85, 2)
    expect(r.custoLiquido).toBeCloseTo(844.15, 2)
  })

  it('>>> REGRESSÃO: é a conta de `recalcNetCost` do main, termo a termo <<<', () => {
    const icms = 1000 * 0.18
    const pisCofins = (1000 - icms) * 0.0925
    const comoOMainCalcula = 1000 - icms - pisCofins + 50 /* ST */ + 50 /* IPI */
    expect(r.custoLiquido).toBeCloseTo(comoOMainCalcula, 10)
    expect(comoOMainCalcula).toBeCloseTo(844.15, 2)
  })

  it('o IPI de revenda NÃO gera crédito e entra inteiro no custo (RIPI art. 226)', () => {
    expect(r.creditos.IPI).toBe(0)
    expect(r.valores.ipi).toBeCloseTo(50, 2)
  })
})

describe('CASO B — insumo de indústria: o IPI passa a gerar crédito', () => {
  const r = custo(COMPRA, 'INSUMO')

  it('bruto 1.100,00 · crédito 305,85 · líquido 794,15', () => {
    expect(r.custoBruto).toBeCloseTo(1100.00, 2)
    expect(r.creditoTotal).toBeCloseTo(305.85, 2)
    expect(r.custoLiquido).toBeCloseTo(794.15, 2)
  })

  it('>>> e a diferença para o caso A é EXATAMENTE o IPI — R$ 50,00 <<<', () => {
    expect(custo(COMPRA, 'REVENDA').custoLiquido - r.custoLiquido).toBeCloseTo(50, 2)
    expect(r.creditos.IPI).toBeCloseTo(50, 2)
  })
})

describe('CASO C — uso e consumo: nada gera crédito', () => {
  const r = custo(COMPRA, 'USO_CONSUMO')

  it('bruto 1.100,00 · crédito 0,00 · líquido 1.100,00', () => {
    expect(r.custoBruto).toBeCloseTo(1100.00, 2)
    expect(r.creditoTotal).toBe(0)
    expect(r.custoLiquido).toBeCloseTo(1100.00, 2)
  })

  it('>>> o ICMS de uso e consumo está ADIADO para 2033, não é zero por acaso <<<', () => {
    expect(r.creditos.ICMS).toBe(0)
    // O valor do ICMS EXISTE — o que não existe é o crédito. A distinção é o ponto.
    expect(r.valores.icms).toBeCloseTo(180, 2)
  })
})

describe('CASO D — revenda com IVA CREDITÁVEL', () => {
  const r = custo(COMPRA_IVA, 'REVENDA')

  it('bruto 1.189,00 · crédito 344,85 · líquido 844,15', () => {
    expect(r.custoBruto).toBeCloseTo(1189.00, 2)
    expect(r.creditoTotal).toBeCloseTo(344.85, 2)
    expect(r.custoLiquido).toBeCloseTo(844.15, 2)
  })

  it('>>> o líquido empata com o caso A, e o BRUTO não: o IVA entrou e foi creditado <<<', () => {
    const a = custo(COMPRA, 'REVENDA')
    expect(r.custoLiquido).toBeCloseTo(a.custoLiquido, 2)
    expect(r.custoBruto - a.custoBruto).toBeCloseTo(89, 2)
    expect(r.creditoTotal - a.creditoTotal).toBeCloseTo(89, 2)
  })

  it('CBS 88,00 e IBS 1,00, creditados integralmente (LC 214 art. 47)', () => {
    expect(r.creditos.CBS).toBeCloseTo(88, 2)
    expect(r.creditos.IBS).toBeCloseTo(1, 2)
  })
})

describe('CASO E — revenda com IVA SEM crédito', () => {
  const r = calcularCustoDoItem(COMPRA_IVA, resolverFlagsDoItem(ctx('REVENDA'), { CBS: false, IBS: false }))

  it('bruto 1.189,00 · crédito 255,85 · líquido 933,15', () => {
    expect(r.custoBruto).toBeCloseTo(1189.00, 2)
    expect(r.creditoTotal).toBeCloseTo(255.85, 2)
    expect(r.custoLiquido).toBeCloseTo(933.15, 2)
  })

  it('>>> e a diferença para o caso D é o IVA inteiro — R$ 89,00 <<<', () => {
    expect(r.custoLiquido - custo(COMPRA_IVA, 'REVENDA').custoLiquido).toBeCloseTo(89, 2)
  })
})

describe('CASO F — Simples e MEI: o imposto da compra está no DAS, nada credita', () => {
  for (const regime of ['SIMPLES_NACIONAL', 'MEI']) {
    it(`${regime}: bruto 1.100,00 · crédito 0,00 · líquido 1.100,00`, () => {
      const r = custo(COMPRA, 'REVENDA', regime)
      expect(r.custoBruto).toBeCloseTo(1100.00, 2)
      expect(r.creditoTotal).toBe(0)
      expect(r.custoLiquido).toBeCloseTo(1100.00, 2)
    })
  }

  it('>>> e o motivo é VISÍVEL, não um zero mudo <<<', () => {
    const f = resolverFlagsDoItem(ctx('REVENDA', 'SIMPLES_NACIONAL'), {})
    expect(f.ICMS.vedado).toBe(true)
    expect(f.ICMS.motivo).toMatch(/DAS|Simples/i)
    expect(f.CBS.vedado).toBe(true)
  })

  it('a bandeira LIGADA pelo usuário não vence a vedação legal', () => {
    const r = calcularCustoDoItem(COMPRA, resolverFlagsDoItem(
      ctx('REVENDA', 'SIMPLES_NACIONAL'), { ICMS: true, PIS_COFINS: true, IPI: true },
    ))
    expect(r.creditoTotal).toBe(0)
    expect(r.custoLiquido).toBeCloseTo(1100.00, 2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// OS PADRÕES POR DESTINAÇÃO E POR REGIME — seção 5 do comando
// ═════════════════════════════════════════════════════════════════════════════════════════
describe('Os padrões nascem da DESTINAÇÃO, e são SUGESTÃO', () => {
  const lig = (d: DestinacaoItem, regime = 'LUCRO_REAL', seg = 'INDUSTRIALIZACAO') => {
    const f = resolverFlagsDoItem(ctx(d, regime, seg), {})
    return { ICMS: f.ICMS.ativo, PIS_COFINS: f.PIS_COFINS.ativo, IPI: f.IPI.ativo, CBS: f.CBS.ativo, IBS: f.IBS.ativo }
  }

  it('INSUMO em indústria liga os quatro, IPI incluído', () => {
    expect(lig('INSUMO')).toEqual({ ICMS: true, PIS_COFINS: true, IPI: true, CBS: true, IBS: true })
  })

  it('REVENDA liga tudo MENOS o IPI', () => {
    expect(lig('REVENDA')).toEqual({ ICMS: true, PIS_COFINS: true, IPI: false, CBS: true, IBS: true })
  })

  it('>>> USO_CONSUMO e ATIVO deixam só CBS/IBS — e o IVA credita onde o ICMS não credita <<<', () => {
    expect(lig('USO_CONSUMO')).toEqual({ ICMS: false, PIS_COFINS: false, IPI: false, CBS: true, IBS: true })
    expect(lig('ATIVO_IMOBILIZADO')).toEqual({ ICMS: false, PIS_COFINS: false, IPI: false, CBS: true, IBS: true })
  })

  it('>>> INSUMO fora da indústria NÃO liga o IPI: quem credita é estabelecimento industrial <<<', () => {
    expect(lig('INSUMO', 'LUCRO_REAL', 'REVENDA').IPI).toBe(false)
    expect(lig('INSUMO', 'LUCRO_REAL', 'SERVICO').IPI).toBe(false)
    expect(lig('INSUMO', 'LUCRO_REAL', 'INDUSTRIALIZACAO').IPI).toBe(true)
  })

  it('>>> LUCRO PRESUMIDO é cumulativo: PIS/COFINS nasce DESLIGADO em qualquer destinação <<<', () => {
    for (const d of ['REVENDA', 'INSUMO', 'USO_CONSUMO', 'ATIVO_IMOBILIZADO'] as DestinacaoItem[]) {
      expect(lig(d, 'LUCRO_PRESUMIDO').PIS_COFINS).toBe(false)
    }
    // E não é vedação: o usuário pode ligar (receita não cumulativa é caso real).
    expect(resolverFlagsDoItem(ctx('INSUMO', 'LUCRO_PRESUMIDO'), {}).PIS_COFINS.vedado).toBe(false)
  })

  it('>>> SIMPLES HÍBRIDO: só CBS e IBS; os outros três estão no DAS e são VEDADOS <<<', () => {
    const f = resolverFlagsDoItem(ctx('INSUMO', 'SIMPLES_HIBRIDO'), {})
    expect(f.CBS.ativo).toBe(true)
    expect(f.IBS.ativo).toBe(true)
    for (const t of ['ICMS', 'PIS_COFINS', 'IPI'] as const) {
      expect(f[t].ativo).toBe(false)
      expect(f[t].vedado).toBe(true)
      expect(f[t].motivo).toMatch(/DAS/i)
    }
  })
})

describe('`ausente-vs-falso`: bandeira AUSENTE não é bandeira DESLIGADA', () => {
  it('>>> `null` cai no padrão da destinação; `false` é escolha do usuário e VENCE <<<', () => {
    const ausente = resolverFlagsDoItem(ctx('INSUMO'), { IPI: null })
    const desligada = resolverFlagsDoItem(ctx('INSUMO'), { IPI: false })
    expect(ausente.IPI.ativo).toBe(true)
    expect(ausente.IPI.origem).toBe('padrao')
    expect(desligada.IPI.ativo).toBe(false)
    expect(desligada.IPI.origem).toBe('gravada')
  })

  it('>>> e a alíquota AUSENTE não é zero: ela some da conta, sem afirmar valor <<<', () => {
    const semIpi = calcularCustoDoItem({ base: 1000, icmsPct: 18, pisCofinsPct: 9.25 }, resolverFlagsDoItem(ctx('INSUMO'), {}))
    expect(semIpi.valores.ipi).toBeNull()
    expect(semIpi.custoBruto).toBeCloseTo(1000, 2)
    // Com 0% cadastrado o valor É zero — apurado, e não ausente.
    const ipiZero = calcularCustoDoItem({ base: 1000, icmsPct: 18, pisCofinsPct: 9.25, ipiPct: 0 }, resolverFlagsDoItem(ctx('INSUMO'), {}))
    expect(ipiZero.valores.ipi).toBe(0)
  })

  it('destinação ausente cai em REVENDA, que é o default do banco', () => {
    expect(resolverFlagsDoItem(ctx(null as never), {}).IPI.ativo).toBe(false)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// AS VEDAÇÕES — ST, DIFAL, FCP e os CST
// ═════════════════════════════════════════════════════════════════════════════════════════
describe('ST, DIFAL e FCP são SEMPRE custo — não há botão', () => {
  it('>>> entram no bruto e NUNCA no crédito, mesmo com tudo ligado <<<', () => {
    const r = calcularCustoDoItem(
      { base: 1000, icmsPct: 18, pisCofinsPct: 9.25, icmsSt: 50, difalOrigemPct: 12, difalDestinoPct: 18, fcp: 20 },
      resolverFlagsDoItem(ctx('INSUMO'), {}),
    )
    expect(r.custoBruto).toBeGreaterThan(1070)
    expect(r.creditos.ICMS).toBeCloseTo(180, 2)
    // O crédito total é só ICMS + PIS/COFINS: ST, DIFAL e FCP não têm linha de crédito.
    expect(r.creditoTotal).toBeCloseTo(180 + (1000 - 180) * 0.0925, 2)
  })
})

describe('Os CST da NOTA DE COMPRA decidem, e a lista é a do comando', () => {
  it('ICMS: 00/10/20/70 creditam; 40/41/50/60 não', () => {
    for (const c of ['00', '10', '20', '70']) expect(cstIcmsGeraCredito(c)).toBe(true)
    for (const c of ['40', '41', '50', '60']) expect(cstIcmsGeraCredito(c)).toBe(false)
  })

  it('IPI: 00/49 creditam; 01/02/03/05 não', () => {
    for (const c of ['00', '49']) expect(cstIpiGeraCredito(c)).toBe(true)
    for (const c of ['01', '02', '03', '05']) expect(cstIpiGeraCredito(c)).toBe(false)
  })

  it('PIS/COFINS: 50 a 56 creditam; 70 a 75 e 98/99 não', () => {
    for (const c of ['50', '51', '53', '56']) expect(cstPisCofinsGeraCredito(c)).toBe(true)
    for (const c of ['70', '73', '75', '98', '99']) expect(cstPisCofinsGeraCredito(c)).toBe(false)
  })

  it('>>> CST ausente NÃO é CST que veda: sem a informação não se bloqueia nada <<<', () => {
    expect(cstIcmsGeraCredito(null)).toBeNull()
    expect(cstIpiGeraCredito(undefined)).toBeNull()
    expect(cstPisCofinsGeraCredito('')).toBeNull()
  })

  it('>>> e o CST que veda DESLIGA e BLOQUEIA, com o motivo <<<', () => {
    const f = resolverFlagsDoItem({ ...ctx('INSUMO'), cstIcms: '60', cstIpi: '01' }, { ICMS: true, IPI: true })
    expect(f.ICMS.ativo).toBe(false)
    expect(f.ICMS.vedado).toBe(true)
    expect(f.ICMS.motivo).toMatch(/CST 60/)
    expect(f.IPI.vedado).toBe(true)
  })
})

describe('IBS/CBS: a vedação é LIDA das tabelas oficiais, não deduzida', () => {
  it('>>> sem destaque na nota não há o que creditar (art. 48) <<<', () => {
    // `ind_gibscbs = false` é o que a tabela `cst_ibs_cbs` diz de 400, 410, 620, 800, 810.
    const v = creditoIbsCbsVedado({ indGibscbs: false })
    expect(v.vedado).toBe(true)
    expect(v.motivo).toMatch(/destaque/i)
  })

  it('>>> cClassTrib com estorno de crédito também veda — 3 dos 164 códigos <<<', () => {
    const v = creditoIbsCbsVedado({ indGibscbs: true, indEstornoCred: true })
    expect(v.vedado).toBe(true)
    expect(v.motivo).toMatch(/estorno/i)
  })

  it('com destaque e sem estorno, a regra geral do art. 47 vale', () => {
    expect(creditoIbsCbsVedado({ indGibscbs: true }).vedado).toBe(false)
  })

  it('>>> SEM CST informado não se veda nada: ausência não é proibição <<<', () => {
    expect(creditoIbsCbsVedado({}).vedado).toBe(false)
    expect(creditoIbsCbsVedado(null).vedado).toBe(false)
  })

  it('e a vedação chega às bandeiras, desligando CBS e IBS', () => {
    const f = resolverFlagsDoItem({ ...ctx('REVENDA'), cstIbsCbs: { indGibscbs: false } }, { CBS: true, IBS: true })
    expect(f.CBS.ativo).toBe(false)
    expect(f.IBS.vedado).toBe(true)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// O ICMS DIFERIDO — o switch que já existia, preservado
// ═════════════════════════════════════════════════════════════════════════════════════════
describe('ICMS diferido: a parcela diferida não gera crédito', () => {
  it('>>> com 30% diferido, o crédito é 18% × 70% = 12,60% <<<', () => {
    const r = calcularCustoDoItem(
      { base: 1000, icmsPct: 18, icmsDeferidoPct: 30, icmsDeferidoAtivo: true, pisCofinsPct: 9.25 },
      resolverFlagsDoItem(ctx('REVENDA'), {}),
    )
    expect(r.creditos.ICMS).toBeCloseTo(126, 2)
    // E o PIS/COFINS incide sobre `base − ICMS creditado`, como no main.
    expect(r.creditos.PIS_COFINS).toBeCloseTo((1000 - 126) * 0.0925, 2)
  })

  it('com o switch desligado o diferido é ignorado — é o comportamento de hoje', () => {
    const r = calcularCustoDoItem(
      { base: 1000, icmsPct: 18, icmsDeferidoPct: 30, icmsDeferidoAtivo: false, pisCofinsPct: 9.25 },
      resolverFlagsDoItem(ctx('REVENDA'), {}),
    )
    expect(r.creditos.ICMS).toBeCloseTo(180, 2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// O IMPACTO — quem sente quando a bandeira muda, e o que NÃO é regravado
// ═════════════════════════════════════════════════════════════════════════════════════════
describe('Mudar um botão mostra quem é afetado, e não regrava ninguém', () => {
  const usos = [
    { id: 'p1', nome: 'Produto A', tipo: 'PRODUTO' as const, quantidade: 2, custoTotalAtual: 200, precoAtual: 500 },
    { id: 's1', nome: 'Serviço B', tipo: 'SERVICO' as const, quantidade: 1, custoTotalAtual: 100, precoAtual: 250 },
  ]

  it('>>> ligar o IPI baixa o custo do item, e o preço sugerido cai PROPORCIONALMENTE <<<', () => {
    // Caso A → caso B do gabarito: o líquido cai de 844,15 para 794,15, delta −50,00.
    const r = calcularImpactoDoCredito({ custoLiquidoAntes: 844.15, custoLiquidoDepois: 794.15, usos })
    expect(r[0].custoTotalNovo).toBeCloseTo(200 - 100, 2)   // 2 unidades × −50
    expect(r[0].precoNovo).toBeCloseTo(500 * (100 / 200), 2)
    expect(r[0].variacao).toBeCloseTo(-250, 2)
    expect(r[1].custoTotalNovo).toBeCloseTo(50, 2)
    expect(r[1].precoNovo).toBeCloseTo(125, 2)
  })

  it('>>> custo atual ZERO não vira preço zero: não é apurável, e diz isso <<<', () => {
    const r = calcularImpactoDoCredito({
      custoLiquidoAntes: 844.15, custoLiquidoDepois: 794.15,
      usos: [{ ...usos[0], custoTotalAtual: 0 }],
    })
    expect(r[0].precoNovo).toBeNull()
    expect(r[0].variacao).toBeNull()
  })

  it('sem mudança de crédito, o impacto é zero em todos', () => {
    const r = calcularImpactoDoCredito({ custoLiquidoAntes: 844.15, custoLiquidoDepois: 844.15, usos })
    r.forEach((x) => expect(x.variacao).toBeCloseTo(0, 6))
  })

  it('>>> sair de NULL para TRUE É mudança: o padrão virou decisão <<<', () => {
    expect(houveMudancaDeCredito({ ipi_credit_enabled: null }, { ipi_credit_enabled: true })).toBe(true)
    expect(houveMudancaDeCredito({ ipi_credit_enabled: null }, { ipi_credit_enabled: false })).toBe(true)
    expect(houveMudancaDeCredito({ ipi_credit_enabled: false }, { ipi_credit_enabled: false })).toBe(false)
  })
})
