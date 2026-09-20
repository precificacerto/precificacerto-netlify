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
// OS NOVE CASOS DO GABARITO — bruto, créditos, líquido E custo por fração
//
// QTD. medida = 6: a compra é de uma unidade que se fraciona em 6 (6 metros, 6 kg, 6 ml…),
// e é o custo POR FRAÇÃO que a receita do produto consome. Um caso com QTD = 1 não
// distinguiria a divisão de a ausência dela.
// ═════════════════════════════════════════════════════════════════════════════════════════
const QTD_MEDIDA = 6

type CasoDoGabarito = {
  nome: string
  valores: ValoresDaCompra
  regime: string
  destinacao: DestinacaoItem
  ctxExtra?: Partial<Parameters<typeof resolverFlagsDoItem>[0]>
  gravadas?: Parameters<typeof resolverFlagsDoItem>[1]
  bruto: number
  creditos: number
  liquido: number
  fracao: number
}

const CASOS: CasoDoGabarito[] = [
  { nome: 'A — LR · revenda, sem IVA (= comportamento de hoje)',
    valores: COMPRA, regime: 'LUCRO_REAL', destinacao: 'REVENDA',
    bruto: 1100.00, creditos: 255.85, liquido: 844.15, fracao: 140.69 },

  { nome: 'B — LR · insumo, IPI creditável, sem IVA',
    valores: COMPRA, regime: 'LUCRO_REAL', destinacao: 'INSUMO',
    bruto: 1100.00, creditos: 305.85, liquido: 794.15, fracao: 132.36 },

  { nome: 'C — LR · uso e consumo, sem IVA',
    valores: COMPRA, regime: 'LUCRO_REAL', destinacao: 'USO_CONSUMO',
    bruto: 1100.00, creditos: 0.00, liquido: 1100.00, fracao: 183.33 },

  { nome: 'D — LR · revenda com IVA creditável',
    valores: COMPRA_IVA, regime: 'LUCRO_REAL', destinacao: 'REVENDA',
    bruto: 1189.00, creditos: 344.85, liquido: 844.15, fracao: 140.69 },

  { nome: 'E — LR · revenda, IVA sem crédito',
    valores: COMPRA_IVA, regime: 'LUCRO_REAL', destinacao: 'REVENDA',
    gravadas: { CBS: false, IBS: false },
    bruto: 1189.00, creditos: 255.85, liquido: 933.15, fracao: 155.53 },

  // No Híbrido ICMS, PIS/COFINS e IPI ficam no custo — estão dentro do DAS.
  { nome: 'F — Híbrido · revenda (só CBS/IBS creditam)',
    valores: COMPRA_IVA, regime: 'SIMPLES_HIBRIDO', destinacao: 'REVENDA',
    bruto: 1189.00, creditos: 89.00, liquido: 1100.00, fracao: 183.33 },

  { nome: 'G — Híbrido · fornecedor do Simples sem regime regular',
    valores: COMPRA_IVA, regime: 'SIMPLES_HIBRIDO', destinacao: 'REVENDA',
    ctxExtra: { fornecedorSimplesSemRegimeRegular: true },
    bruto: 1189.00, creditos: 0.00, liquido: 1189.00, fracao: 198.17 },

  // Simples e MEI não têm o bloco: as alíquotas de CBS/IBS não são sequer informadas, e por
  // isso o bruto é 1.100,00 e não 1.189,00.
  { nome: 'H — Simples/MEI',
    valores: COMPRA, regime: 'SIMPLES_NACIONAL', destinacao: 'REVENDA',
    bruto: 1100.00, creditos: 0.00, liquido: 1100.00, fracao: 183.33 },

  { nome: 'I — LP · revenda (PIS/COFINS cumulativo, sem crédito)',
    valores: COMPRA, regime: 'LUCRO_PRESUMIDO', destinacao: 'REVENDA',
    bruto: 1100.00, creditos: 180.00, liquido: 920.00, fracao: 153.33 },
]

describe.each(CASOS.map((c) => [c.nome, c] as const))('CASO %s', (_nome, c) => {
  const r = calcularCustoDoItem(
    { ...c.valores, qtdMedida: QTD_MEDIDA },
    resolverFlagsDoItem({ ...ctx(c.destinacao, c.regime), ...(c.ctxExtra ?? {}) }, c.gravadas ?? {}),
  )

  it(`bruto ${c.bruto} · créditos ${c.creditos} · líquido ${c.liquido} · por fração ${c.fracao}`, () => {
    expect(r.custoBruto).toBeCloseTo(c.bruto, 2)
    expect(r.creditoTotal).toBeCloseTo(c.creditos, 2)
    expect(r.custoLiquido).toBeCloseTo(c.liquido, 2)
    expect(r.custoPorFracao).toBeCloseTo(c.fracao, 2)
  })

  it('o custo por fração é o líquido dividido pela QTD. medida, e nada mais', () => {
    expect(r.custoPorFracao).toBeCloseTo(r.custoLiquido / QTD_MEDIDA, 10)
  })
})

describe('O que os nove casos, JUNTOS, provam — e um caso sozinho não provaria', () => {
  const de = (n: string) => {
    const c = CASOS.find((x) => x.nome.startsWith(n))!
    return calcularCustoDoItem({ ...c.valores, qtdMedida: QTD_MEDIDA },
      resolverFlagsDoItem({ ...ctx(c.destinacao, c.regime), ...(c.ctxExtra ?? {}) }, c.gravadas ?? {}))
  }

  it('>>> REGRESSÃO: o caso A é a conta do main, termo a termo <<<', () => {
    const icms = 1000 * 0.18
    const pisCofins = (1000 - icms) * 0.0925
    expect(de('A').custoLiquido).toBeCloseTo(1000 - icms - pisCofins + 50 + 50, 10)
  })

  it('>>> A e D têm o MESMO líquido e BRUTOS diferentes: só os três números distinguem <<<', () => {
    expect(de('D').custoLiquido).toBeCloseTo(de('A').custoLiquido, 2)
    expect(de('D').custoBruto - de('A').custoBruto).toBeCloseTo(89, 2)
  })

  it('>>> F e H têm o mesmo líquido por caminhos OPOSTOS: um credita 89, o outro não tem IVA <<<', () => {
    expect(de('F').custoLiquido).toBeCloseTo(de('H').custoLiquido, 2)
    expect(de('F').creditoTotal).toBeCloseTo(89, 2)
    expect(de('H').creditoTotal).toBe(0)
    expect(de('F').custoBruto - de('H').custoBruto).toBeCloseTo(89, 2)
  })

  it('>>> B − A = o IPI (50,00) · E − D = o IVA (89,00) · A − I = o PIS/COFINS (75,85) <<<', () => {
    expect(de('A').custoLiquido - de('B').custoLiquido).toBeCloseTo(50, 2)
    expect(de('E').custoLiquido - de('D').custoLiquido).toBeCloseTo(89, 2)
    expect(de('I').custoLiquido - de('A').custoLiquido).toBeCloseTo(75.85, 2)
  })

  it('>>> G − F = o IVA inteiro: o fornecedor do Simples tira os dois créditos <<<', () => {
    expect(de('G').custoLiquido - de('F').custoLiquido).toBeCloseTo(89, 2)
  })
})

describe('O custo por fração: ausente não é zero', () => {
  it('>>> sem QTD. medida não há fração a apurar, e o campo diz isso <<<', () => {
    const semQtd = calcularCustoDoItem(COMPRA, resolverFlagsDoItem(ctx('REVENDA'), {}))
    expect(semQtd.custoPorFracao).toBeNull()
    expect(semQtd.custoLiquido).toBeCloseTo(844.15, 2)
  })

  it('QTD. medida 1 devolve o próprio líquido — e isso é apurado, não ausente', () => {
    const um = calcularCustoDoItem({ ...COMPRA, qtdMedida: 1 }, resolverFlagsDoItem(ctx('REVENDA'), {}))
    expect(um.custoPorFracao).toBeCloseTo(844.15, 2)
  })

  it('QTD. medida zero ou negativa NÃO vira divisão por zero: devolve null', () => {
    for (const q of [0, -3]) {
      const r = calcularCustoDoItem({ ...COMPRA, qtdMedida: q }, resolverFlagsDoItem(ctx('REVENDA'), {}))
      expect(r.custoPorFracao).toBeNull()
    }
  })
})

describe('A BASE do PIS/COFINS é o ICMS DESTACADO, não o ICMS creditado (§7)', () => {
  it('>>> com o ICMS sem crédito, o PIS/COFINS EXIBIDO continua sobre `base − ICMS` <<<', () => {
    // Uso e consumo: o ICMS não credita, mas incidiu. A base do PIS/COFINS é a mesma.
    const usoConsumo = calcularCustoDoItem(COMPRA, resolverFlagsDoItem(ctx('USO_CONSUMO'), {}))
    expect(usoConsumo.valores.pisCofins).toBeCloseTo((1000 - 180) * 0.0925, 2)
    expect(usoConsumo.valores.pisCofins).toBeCloseTo(75.85, 2)
    // E NÃO os 92,50 que sairiam de `base × 9,25%` se a base ignorasse o ICMS destacado.
    expect(usoConsumo.valores.pisCofins).not.toBeCloseTo(92.50, 2)
  })

  it('o crédito segue sendo zero ali — o valor existe, o crédito é que não', () => {
    const usoConsumo = calcularCustoDoItem(COMPRA, resolverFlagsDoItem(ctx('USO_CONSUMO'), {}))
    expect(usoConsumo.creditos.PIS_COFINS).toBe(0)
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

// ═════════════════════════════════════════════════════════════════════════════════════════
// O FORNECEDOR DO SIMPLES — LC 214/2025 art. 47 §9º II
// ═════════════════════════════════════════════════════════════════════════════════════════
describe('Fornecedor do Simples sem regime regular veda o crédito de CBS e IBS', () => {
  const comFornecedor = (over: Record<string, unknown> = {}) => resolverFlagsDoItem(
    { ...ctx('REVENDA'), fornecedorSimplesSemRegimeRegular: true, ...over }, {},
  )

  it('>>> CBS e IBS ficam vedados, e o motivo cita o art. 47 <<<', () => {
    const f = comFornecedor()
    expect(f.CBS.ativo).toBe(false)
    expect(f.IBS.ativo).toBe(false)
    expect(f.CBS.motivo).toMatch(/47/)
    expect(f.CBS.tipoVedacao).toBe('FORNECEDOR')
  })

  it('>>> e o EFEITO: o IVA da compra deixa de ser creditado e sobe no custo líquido <<<', () => {
    const credita = calcularCustoDoItem(COMPRA_IVA, resolverFlagsDoItem(ctx('REVENDA'), {}))
    const naoCredita = calcularCustoDoItem(COMPRA_IVA, comFornecedor())
    expect(naoCredita.custoLiquido - credita.custoLiquido).toBeCloseTo(89, 2)
    expect(naoCredita.custoLiquido).toBeCloseTo(933.15, 2)
  })

  it('ICMS, PIS/COFINS e IPI NÃO são afetados — a regra é só de IBS/CBS', () => {
    const f = comFornecedor()
    expect(f.ICMS.ativo).toBe(true)
    expect(f.PIS_COFINS.ativo).toBe(true)
    expect(f.ICMS.vedado).toBe(false)
  })

  it('>>> NÃO INFORMADO não veda: ausência não é proibição <<<', () => {
    for (const v of [null, undefined, false]) {
      const f = resolverFlagsDoItem({ ...ctx('REVENDA'), fornecedorSimplesSemRegimeRegular: v }, {})
      expect(f.CBS.ativo).toBe(true)
      expect(f.CBS.vedado).toBe(false)
    }
  })

  it('a bandeira ligada à mão não vence a vedação do fornecedor', () => {
    const f = resolverFlagsDoItem(
      { ...ctx('REVENDA'), fornecedorSimplesSemRegimeRegular: true }, { CBS: true, IBS: true },
    )
    expect(f.CBS.ativo).toBe(false)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// O TIPO DA VEDAÇÃO — é ele que decide se a TELA mostra botão
// ═════════════════════════════════════════════════════════════════════════════════════════
describe('Vedação de REGIME é estrutural; as outras dependem daquela compra', () => {
  it('>>> no Simples Híbrido ICMS, PIS/COFINS e IPI são vedados por REGIME — sem botão <<<', () => {
    const f = resolverFlagsDoItem(ctx('INSUMO', 'SIMPLES_HIBRIDO'), {})
    for (const t of ['ICMS', 'PIS_COFINS', 'IPI'] as const) {
      expect(f[t].vedado).toBe(true)
      expect(f[t].tipoVedacao).toBe('REGIME')
      expect(f[t].motivo).toMatch(/DAS/i)
    }
    // CBS e IBS seguem com botão, porque é o que o híbrido apura pelo regime regular.
    expect(f.CBS.ativo).toBe(true)
    expect(f.CBS.tipoVedacao).toBeUndefined()
  })

  it('Simples Nacional e MEI: os cinco por REGIME', () => {
    for (const r of ['SIMPLES_NACIONAL', 'MEI']) {
      const f = resolverFlagsDoItem(ctx('INSUMO', r), {})
      for (const t of ['ICMS', 'PIS_COFINS', 'IPI', 'CBS', 'IBS'] as const) {
        expect(f[t].tipoVedacao).toBe('REGIME')
      }
    }
  })

  it('>>> CST e destaque são de COMPRA, não de regime — tipo diferente, botão existe <<<', () => {
    expect(resolverFlagsDoItem({ ...ctx('INSUMO'), cstIcms: '60' }, {}).ICMS.tipoVedacao).toBe('CST')
    expect(resolverFlagsDoItem({ ...ctx('REVENDA'), cstIbsCbs: { indGibscbs: false } }, {}).CBS.tipoVedacao)
      .toBe('IVA_SEM_DESTAQUE')
  })

  it('>>> o Lucro Presumido NÃO veda PIS/COFINS: nasce desligado e o usuário pode ligar <<<', () => {
    const f = resolverFlagsDoItem(ctx('INSUMO', 'LUCRO_PRESUMIDO'), {})
    expect(f.PIS_COFINS.ativo).toBe(false)
    expect(f.PIS_COFINS.vedado).toBe(false)
    expect(f.PIS_COFINS.tipoVedacao).toBeUndefined()
    // E ligado à mão, ele credita — é o que distingue padrão de vedação.
    const ligado = resolverFlagsDoItem(ctx('INSUMO', 'LUCRO_PRESUMIDO'), { PIS_COFINS: true })
    expect(calcularCustoDoItem(COMPRA, ligado).creditos.PIS_COFINS).toBeGreaterThan(0)
  })
})
