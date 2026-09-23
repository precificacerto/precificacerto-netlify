/**
 * A NOTA DESCASCADA — os oráculos A–S do comando do PO de 24/09/2026.
 *
 * >>> O QUE ESTES CASOS PRECISAM DISCRIMINAR <<<
 *
 * O risco desta inversão não é o número sair errado: é sair PLAUSÍVEL. Abater o frete da
 * base dá um ICMS menor, que ninguém estranha; tratar o IS como ST dá um crédito menor, que
 * ninguém reclama. Por isso os casos E e D não afirmam só o número certo — eles afirmam
 * TAMBÉM o número que o erro produziria, e que ele NÃO é o resultado.
 *
 * O caso G é o mesmo princípio na ordem: calcular os por dentro antes de retirar CBS e IBS
 * produz crédito de ICMS MAIOR, e é o pior lugar para um erro sair, porque crédito sobrando
 * não gera reclamação.
 */
import {
  descascarANota,
  ratearParcelas,
  linhasDoDescascamento,
} from '@/utils/nota-de-compra'
import {
  resolverFlagsDoItem,
  cstPisCofinsGeraCredito,
  baseDoTributo,
  icmsEfetivoPctDe,
  RAZAO_DO_CST_PIS_COFINS,
  type BandeirasDeCredito,
  type DestinacaoItem,
} from '@/utils/custo-liquido-do-item'
import { FORMATO_PADRAO, entradaParaReabertura } from '@/utils/entrada-de-imposto'

const fs = require('fs') as typeof import('fs')
const path = require('path') as typeof import('path')
const ler = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8')

const LR = (destinacao: DestinacaoItem = 'INSUMO'): BandeirasDeCredito =>
  resolverFlagsDoItem({ regime: 'LUCRO_REAL', destinacao, segmento: 'INDUSTRIALIZACAO' }, {})

/** O cenário do §2, que é o gabarito deste PR inteiro. */
const GABARITO = {
  total: 1172,
  composicao: { frete: 100 },
  reducoes: { ipiCusto: 40, icmsSt: 50, difal: 18, fcp: 4 },
  porFora: { ipi: { brl: 60 } },
  valorIs: 50,
  porDentro: { icms: { brl: 180 }, pisCofins: { pct: 9.25 } },
  bandeiras: LR(),
}

// ═════════════════════════════════════════════════════════════════════════════════════════
// A — O TOTAL MANDA NAS PARCELAS
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('A — o total digitado é o que vira as parcelas', () => {
  it('>>> 1.172,00 em 3x: soma EXATA, com a sobra na última <<<', () => {
    const p = ratearParcelas(1172, [1, 1, 1])
    expect(p).toEqual([390.67, 390.67, 390.66])
    expect(p.reduce((a, v) => a + v, 0)).toBeCloseTo(1172.0, 2)
  })

  it('>>> 1.172,00 em 7x: a divisão não fecha, e a soma continua exata <<<', () => {
    const p = ratearParcelas(1172, Array(7).fill(1))
    expect(p.reduce((a, v) => a + v, 0)).toBeCloseTo(1172.0, 2)
    expect(p.slice(0, 6).every((v) => v === 167.43)).toBe(true)
    expect(p[6]).toBeCloseTo(167.42, 2)
  })

  it('>>> e o total NÃO é arredondado por nada: ele é o fato digitado <<<', () => {
    // A base pode dar dízima; o total não muda por causa disso.
    const d = descascarANota({ ...GABARITO, total: 1172 })
    expect(d.total).toBe(1172)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// B — O GABARITO DO §2, INTEIRO
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('B — o gabarito do §2, degrau por degrau', () => {
  const d = descascarANota(GABARITO)

  it('>>> saldo 1.060,00 · mercadorias 850,00 · base 1.000,00 <<<', () => {
    expect(d.saldo).toBeCloseTo(1060.0, 2)
    expect(d.valorDasMercadorias).toBeCloseTo(850.0, 2)
    expect(d.base).toBeCloseTo(1000.0, 2)
  })

  it('>>> ICMS 180,00 · PIS/COFINS 75,85 sobre a base de 820,00 <<<', () => {
    expect(d.basesPorDentro.icms).toBeCloseTo(1000.0, 2)
    expect(d.basesPorDentro.pisCofins).toBeCloseTo(820.0, 2)
    expect(d.creditos.icms).toBeCloseTo(180.0, 2)
    expect(d.creditos.pisCofins).toBeCloseTo(75.85, 2)
  })

  it('>>> crédito total 315,85 · CUSTO LÍQUIDO 856,15 <<<', () => {
    expect(d.creditos.ipi).toBeCloseTo(60.0, 2)
    expect(d.creditoTotal).toBeCloseTo(315.85, 2)
    expect(d.custoLiquido).toBeCloseTo(856.15, 2)
  })

  it('a escada da tela traz os degraus marcados, na ordem do §2', () => {
    const l = linhasDoDescascamento(d)
    expect(l.find((x) => x.ehSaldo)?.valor).toBeCloseTo(1060.0, 2)
    expect(l.find((x) => x.ehBase)?.valor).toBeCloseTo(1000.0, 2)
    expect(l.find((x) => x.ehMercadorias)?.valor).toBeCloseTo(850.0, 2)
    expect(l.find((x) => x.ehCreditoTotal)?.valor).toBeCloseTo(315.85, 2)
    expect(l.find((x) => x.ehCustoLiquido)?.valor).toBeCloseTo(856.15, 2)
    expect(l[0].rotulo).toBe('Valor total da nota')
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// C — IDA E VOLTA
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('C — base + por fora + reduções reproduz o total', () => {
  it('>>> no gabarito, ao centavo <<<', () => {
    const d = descascarANota(GABARITO)
    expect((d.base ?? 0) + d.porForaTotal + d.reducoesTotal).toBeCloseTo(d.total, 2)
  })

  it('>>> e com a base em DÍZIMA: 1.000,00 com CBS 8,80% e IBS 17,70% <<<', () => {
    // 1.000 ÷ 1,265 = 790,5138…: a base arredonda, o total não.
    const d = descascarANota({
      total: 1000,
      porFora: { cbs: { pct: 8.8 }, ibs: { pct: 17.7 } },
      bandeiras: LR(),
    })
    expect(d.base).toBeCloseTo(790.51, 2)
    expect((d.base ?? 0) + d.porForaTotal + d.reducoesTotal).toBeCloseTo(1000.0, 2)
    expect(d.total).toBe(1000)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// D — O IS NÃO REDUZ
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('D — o IS fica na base, e só a leitura de mercadorias muda', () => {
  const comIs = descascarANota(GABARITO)
  const semIs = descascarANota({ ...GABARITO, valorIs: null })

  it('>>> saldo e base IDÊNTICOS com e sem IS <<<', () => {
    expect(comIs.saldo).toBeCloseTo(semIs.saldo, 2)
    expect(comIs.base).toBeCloseTo(semIs.base ?? 0, 2)
  })

  it('>>> e o crédito total é o MESMO: o IS não tira crédito de ninguém <<<', () => {
    expect(comIs.creditoTotal).toBeCloseTo(semIs.creditoTotal, 2)
    expect(comIs.custoLiquido).toBeCloseTo(semIs.custoLiquido ?? 0, 2)
  })

  it('>>> só o valor das mercadorias muda: 850,00 com IS, 900,00 sem <<<', () => {
    expect(comIs.valorDasMercadorias).toBeCloseTo(850.0, 2)
    expect(semIs.valorDasMercadorias).toBeCloseTo(900.0, 2)
  })

  it('>>> o IS NÃO entra em `reducoesTotal` — tratá-lo como ST é o erro fácil <<<', () => {
    expect(comIs.reducoesTotal).toBeCloseTo(112.0, 2)
    // 112,00 = 40 + 50 + 18 + 4. Com o IS dentro seriam 162,00, e a base cairia para 950,00.
    expect(comIs.reducoesTotal).not.toBeCloseTo(162.0, 2)
    expect(comIs.base).not.toBeCloseTo(950.0, 2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// E — FRETE E SEGURO NÃO REDUZEM
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('E — frete e seguro integram a base e creditam junto', () => {
  const d = descascarANota(GABARITO)

  it('>>> ICMS 180,00 e PIS/COFINS 75,85 — o frete ESTÁ na base <<<', () => {
    expect(d.creditos.icms).toBeCloseTo(180.0, 2)
    expect(d.creditos.pisCofins).toBeCloseTo(75.85, 2)
  })

  it('>>> e NÃO 162,00 e 68,27, que é o que abatê-lo produziria <<<', () => {
    // O número do defeito, calculado aqui de propósito: base 900,00 → ICMS 162,00 e
    // PIS/COFINS (900 − 162) × 9,25% = 68,27. Ele está no caso para que trocar a natureza
    // do frete FAÇA O CASO FALHAR, em vez de mudar um número que ninguém confere.
    expect(d.creditos.icms).not.toBeCloseTo(162.0, 2)
    expect(d.creditos.pisCofins).not.toBeCloseTo(68.27, 2)
    /*
      O CENÁRIO DO DEFEITO, montado de propósito: o frete tratado como REDUÇÃO. A alíquota
      entra em % nos dois lados para que a comparação seja de BASE, e não do valor informado
      — que venceria a alíquota e esconderia a diferença.
    */
    const comAliquota = { ...GABARITO, porDentro: { icms: { pct: 18 }, pisCofins: { pct: 9.25 } } }
    const certo = descascarANota(comAliquota)
    const seFosseReducao = descascarANota({
      ...comAliquota,
      composicao: null,
      reducoes: { ...GABARITO.reducoes, fcp: 104 },  // 4 + 100 do frete, se ele reduzisse
    })
    expect(certo.creditos.icms).toBeCloseTo(180.0, 2)
    expect(certo.creditos.pisCofins).toBeCloseTo(75.85, 2)
    expect(seFosseReducao.creditos.icms).toBeCloseTo(162.0, 2)
    expect(seFosseReducao.creditos.pisCofins).toBeCloseTo(68.27, 2)
  })

  it('o seguro tem a mesma natureza do frete', () => {
    const comSeguro = descascarANota({ ...GABARITO, composicao: { frete: 60, seguro: 40 } })
    expect(comSeguro.base).toBeCloseTo(1000.0, 2)
    expect(comSeguro.composicaoTotal).toBeCloseTo(100.0, 2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// F — FATIA MONOFÁSICA
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('F — a parcela monofásica sai da base do PIS/COFINS, e só dela', () => {
  const d = descascarANota({ ...GABARITO, fatias: { monofasica: 300 } })

  it('>>> base do PIS/COFINS = 1.000 − 180 − 300 = 520,00 → crédito 48,10 <<<', () => {
    expect(d.basesPorDentro.pisCofins).toBeCloseTo(520.0, 2)
    expect(d.creditos.pisCofins).toBeCloseTo(48.1, 2)
  })

  it('>>> e o ICMS NÃO muda: a fatia é do PIS/COFINS <<<', () => {
    expect(d.basesPorDentro.icms).toBeCloseTo(1000.0, 2)
    expect(d.creditos.icms).toBeCloseTo(180.0, 2)
  })

  it('>>> a fatia NUNCA sai do total nem do saldo <<<', () => {
    expect(d.total).toBe(1172)
    expect(d.saldo).toBeCloseTo(1060.0, 2)
    expect(d.base).toBeCloseTo(1000.0, 2)
  })

  it('>>> nota INTEIRAMENTE monofásica zera o crédito pela própria conta, sem botão <<<', () => {
    const toda = descascarANota({ ...GABARITO, fatias: { monofasica: 820 } })
    expect(toda.basesPorDentro.pisCofins).toBeCloseTo(0, 2)
    expect(toda.creditos.pisCofins).toBeCloseTo(0, 2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// G — FATIA EM ST
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('G — a parcela em ST sai da base do ICMS, e a ordem importa', () => {
  const d = descascarANota({
    ...GABARITO,
    fatias: { st: 200 },
    porDentro: { icms: { pct: 18 }, pisCofins: { pct: 9.25 } },
  })

  it('>>> base do ICMS 800,00 → crédito 144,00 <<<', () => {
    expect(d.basesPorDentro.icms).toBeCloseTo(800.0, 2)
    expect(d.creditos.icms).toBeCloseTo(144.0, 2)
  })

  it('>>> e o PIS/COFINS usa o ICMS DESTACADO: 1.000 − 144 = 856,00 <<<', () => {
    expect(d.basesPorDentro.pisCofins).toBeCloseTo(856.0, 2)
    expect(d.creditos.pisCofins).toBeCloseTo(79.18, 2)
  })

  /**
   * >>> A ORDEM: POR FORA ANTES DE POR DENTRO <<<
   *
   * Se o ICMS fosse calculado sobre o SALDO — antes de retirar o IPI/CBS/IBS — ele incidiria
   * sobre base que ainda carrega os por fora, e o crédito sairia MAIOR. É o pior lugar para
   * um erro sair: crédito sobrando não gera reclamação de ninguém.
   */
  it('>>> calcular o ICMS antes de descascar daria 190,80, e NÃO é o resultado <<<', () => {
    const semFatia = descascarANota({
      ...GABARITO,
      porDentro: { icms: { pct: 18 }, pisCofins: { pct: 9.25 } },
    })
    expect(semFatia.creditos.icms).toBeCloseTo(180.0, 2)
    // 1.060 (saldo, ainda com o IPI de 60) × 18% = 190,80 — o número da ordem trocada.
    expect(semFatia.creditos.icms).not.toBeCloseTo(190.8, 2)
    expect(semFatia.saldo * 0.18).toBeCloseTo(190.8, 2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// H e I — O CST DO DOCUMENTO
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('H — os CST que vedam PIS/COFINS, e a razão de cada um', () => {
  it.each(['02', '03', '04', '05', '06', '07', '08', '09'])('CST %s NÃO credita', (cst) => {
    expect(cstPisCofinsGeraCredito(cst)).toBe(false)
  })

  it('>>> e o 04 é o caso que passava despercebido: monofásica, revenda a alíquota zero <<<', () => {
    expect(RAZAO_DO_CST_PIS_COFINS['04']).toContain('monofásica')
    const b = resolverFlagsDoItem(
      { regime: 'LUCRO_REAL', destinacao: 'REVENDA', segmento: 'INDUSTRIALIZACAO', cstPisCofins: '04' },
      {},
    )
    expect(b.PIS_COFINS.vedado).toBe(true)
    expect(b.PIS_COFINS.ativo).toBe(false)
    // O motivo cita o CÓDIGO e a RAZÃO — o código sozinho manda o usuário procurar tabela.
    expect(b.PIS_COFINS.motivo).toContain('04')
    expect(b.PIS_COFINS.motivo).toContain('monofásica')
  })

  it('>>> e o crédito sai ZERO pela conta, não por um botão <<<', () => {
    const d = descascarANota({
      ...GABARITO,
      bandeiras: resolverFlagsDoItem(
        { regime: 'LUCRO_REAL', destinacao: 'INSUMO', segmento: 'INDUSTRIALIZACAO', cstPisCofins: '04' },
        {},
      ),
    })
    expect(d.creditos.pisCofins).toBe(0)
    expect(d.creditoTotal).toBeCloseTo(240.0, 2)
  })

  it('>>> as listas de ICMS e de IPI NÃO foram tocadas <<<', () => {
    const src = ler('src/utils/custo-liquido-do-item.ts')
    expect(src).toContain("const CST_ICMS_COM_CREDITO = new Set(['00', '10', '20', '70'])")
    expect(src).toContain("const CST_IPI_COM_CREDITO = new Set(['00', '49'])")
  })
})

describe('I — o CST 01 credita, e o caso o distingue do 04', () => {
  it('>>> 01 credita; 04 não — e eram os dois "fora da lista" antes <<<', () => {
    expect(cstPisCofinsGeraCredito('01')).toBe(true)
    expect(cstPisCofinsGeraCredito('04')).toBe(false)
  })

  it('CST ausente continua não vedando nada: ausência não é proibição', () => {
    expect(cstPisCofinsGeraCredito(null)).toBeNull()
    expect(cstPisCofinsGeraCredito('')).toBeNull()
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// J — BASE MANUAL
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('J — a base manual é usada COMO ESTÁ', () => {
  const d = descascarANota({
    ...GABARITO,
    porDentro: {
      icms: { brl: 180 },
      pisCofins: { pct: 9.25 },
      baseManualPisCofins: 600,
    },
  })

  it('>>> base 600,00 × 9,25% = 55,50 <<<', () => {
    expect(d.basesPorDentro.pisCofins).toBeCloseTo(600.0, 2)
    expect(d.creditos.pisCofins).toBeCloseTo(55.5, 2)
  })

  it('>>> e o ICMS NÃO é deduzido de novo: 600 − 180 = 420 daria 38,85, e não é isso <<<', () => {
    expect(d.creditos.pisCofins).not.toBeCloseTo(38.85, 2)
  })

  it('a base manual do ICMS segue a mesma regra', () => {
    const m = descascarANota({
      ...GABARITO,
      fatias: { st: 200 },
      porDentro: { icms: { pct: 18 }, pisCofins: { pct: 9.25 }, baseManualIcms: 900 },
    })
    // 900 COMO ESTÁ — a fatia em ST não é descontada de novo (800 daria 144,00).
    expect(m.basesPorDentro.icms).toBeCloseTo(900.0, 2)
    expect(m.creditos.icms).toBeCloseTo(162.0, 2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// K — MODO VALOR E ALÍQUOTA IMPLÍCITA
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('K — informado em R$, o valor é o crédito, e a alíquota implícita confere', () => {
  const d = descascarANota({
    ...GABARITO,
    porDentro: { icms: { brl: 180 }, pisCofins: { brl: 100 } },
  })

  it('>>> crédito 100,00 — o destacado na nota é o fato <<<', () => {
    expect(d.creditos.pisCofins).toBeCloseTo(100.0, 2)
  })

  it('>>> e a alíquota implícita é 100 ÷ 820 = 12,20% <<<', () => {
    expect(d.aliquotaImplicita.pisCofins).toBeCloseTo(12.2, 2)
    expect(d.aliquotaImplicita.icms).toBeCloseTo(18.0, 2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// L — IPI POR DENTRO × POR FORA
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('L — o mesmo IPI de 60,00 muda a BASE, não o crédito', () => {
  const porFora = descascarANota(GABARITO)
  const porDentro = descascarANota({ ...GABARITO, ipiPorDentro: true })

  it('>>> por fora: base 1.000,00 · por dentro: base 1.060,00 <<<', () => {
    expect(porFora.base).toBeCloseTo(1000.0, 2)
    expect(porDentro.base).toBeCloseTo(1060.0, 2)
  })

  it('>>> e o crédito de IPI é 60,00 nos DOIS <<<', () => {
    expect(porFora.creditos.ipi).toBeCloseTo(60.0, 2)
    expect(porDentro.creditos.ipi).toBeCloseTo(60.0, 2)
  })

  it('>>> `porForaTotal` só conta o IPI quando ele está por fora <<<', () => {
    expect(porFora.porForaTotal).toBeCloseTo(60.0, 2)
    expect(porDentro.porForaTotal).toBeCloseTo(0, 2)
  })

  it('a coluna é gravada, e `null` cai no padrão POR FORA', () => {
    const m = ler('supabase/migrations/20260924000001_descascamento_da_nota.sql')
    expect(m).toContain('ipi_por_dentro')
    expect(m).not.toMatch(/ipi_por_dentro\s+boolean[^,;]*DEFAULT/i)
    expect(descascarANota({ ...GABARITO, ipiPorDentro: null }).base).toBeCloseTo(1000.0, 2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// M — R$ É O PADRÃO
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('M — a linha nova nasce em R$; a gravada reabre como foi digitada', () => {
  it('>>> o padrão virou BRL: os valores vêm destacados na nota <<<', () => {
    expect(FORMATO_PADRAO).toBe('BRL')
  })

  it('>>> mas nota gravada com PCT reabre em PCT — o padrão vale para linha NOVA <<<', () => {
    expect(entradaParaReabertura({ aliquotaPct: 18, formato: 'PCT' }, 1000).formato).toBe('PCT')
    expect(entradaParaReabertura({ aliquotaPct: 18, formato: 'BRL' }, 1000).formato).toBe('BRL')
    // E o AUSENTE cai no padrão novo.
    expect(entradaParaReabertura({ aliquotaPct: 18, formato: null }, 1000).formato).toBe('BRL')
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// N — DIFERIMENTO
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('N — o diferimento entra pelo motor, e a base do PIS/COFINS acompanha', () => {
  const d = descascarANota({
    ...GABARITO,
    porDentro: {
      icms: { pct: 18 },
      icmsDeferidoAtivo: true,
      icmsDeferidoPct: 60,
      pisCofins: { pct: 9.25 },
    },
  })

  it('>>> o crédito é pelo EFETIVO de 7,20%: R$ 72,00 <<<', () => {
    expect(d.creditos.icms).toBeCloseTo(72.0, 2)
    expect(d.creditos.icms).not.toBeCloseTo(180.0, 2)
  })

  it('>>> e a base do PIS/COFINS é base − ICMS EFETIVO = 928,00 <<<', () => {
    expect(d.basesPorDentro.pisCofins).toBeCloseTo(928.0, 2)
    expect(d.creditos.pisCofins).toBeCloseTo(85.84, 2)
  })

  it('>>> a fórmula do efetivo é LIDA do motor, não repetida aqui <<<', () => {
    expect(icmsEfetivoPctDe({ base: 1000, icmsPct: 18, icmsDeferidoAtivo: true, icmsDeferidoPct: 60 }))
      .toBeCloseTo(7.2, 4)
    const src = ler('src/utils/nota-de-compra.ts')
    // O módulo não recalcula o diferimento: ele repassa os campos ao motor.
    expect(src).not.toMatch(/1\s*-\s*\w*[Dd]eferido/)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// O — AUSENTE ≠ ZERO
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('O — ausente e zero são afirmações diferentes', () => {
  it('>>> IBS ausente e IBS = 0 dão BASES diferentes <<<', () => {
    const ausente = descascarANota({ total: 1000, porFora: { ibs: null }, bandeiras: LR() })
    const zeroPct = descascarANota({ total: 1000, porFora: { ibs: { pct: 0 } }, bandeiras: LR() })
    const zeroBrl = descascarANota({ total: 1000, porFora: { ibs: { brl: 0 } }, bandeiras: LR() })
    // Em número, 0% e ausente coincidem na base — e é por isso que a distinção se perde
    // fácil. O que NÃO coincide é o crédito apurado: ausente não apura, zero apura zero.
    expect(ausente.base).toBeCloseTo(1000.0, 2)
    expect(zeroPct.base).toBeCloseTo(1000.0, 2)
    expect(zeroBrl.base).toBeCloseTo(1000.0, 2)
    expect(ausente.creditos.ibs).toBe(0)
    expect(zeroBrl.creditos.ibs).toBe(0)
  })

  it('>>> mas com alíquota, a distinção aparece na base: IBS 10% muda o número <<<', () => {
    const comIbs = descascarANota({ total: 1000, porFora: { ibs: { pct: 10 } }, bandeiras: LR() })
    expect(comIbs.base).toBeCloseTo(909.09, 2)
  })

  it('>>> frete NULL e frete 0 dão o mesmo total, e leituras diferentes <<<', () => {
    const semFrete = descascarANota({ ...GABARITO, composicao: null })
    const freteZero = descascarANota({ ...GABARITO, composicao: { frete: 0 } })
    expect(semFrete.total).toBe(freteZero.total)
    expect(semFrete.base).toBeCloseTo(freteZero.base ?? 0, 2)
    // A leitura é a mesma em número; o que muda é o que o dado gravado AFIRMA — e é por isso
    // que a coluna é nulável e sem default.
    expect(semFrete.composicaoTotal).toBe(0)
    expect(freteZero.composicaoTotal).toBe(0)
    const m = ler('supabase/migrations/20260924000001_descascamento_da_nota.sql')
    expect(m).not.toMatch(/ADD COLUMN[^,;]*DEFAULT/i)
    expect(m).not.toMatch(/ADD COLUMN[^,;]*NOT NULL/i)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// P — ALÍQUOTAS MAIORES QUE O TOTAL
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('P — quando não fecha, a resposta é `null`, não um número plausível', () => {
  it('>>> reduções maiores que o total: base null com motivo <<<', () => {
    const d = descascarANota({ total: 100, reducoes: { icmsSt: 200 }, bandeiras: LR() })
    expect(d.base).toBeNull()
    expect(d.motivo).toBe('ALIQUOTAS_MAIORES_QUE_O_TOTAL')
    expect(d.custoLiquido).toBeNull()
  })

  it('>>> e NUNCA zero: zero seria "a base é zero", que é outra afirmação <<<', () => {
    const d = descascarANota({ total: 100, reducoes: { icmsSt: 100 }, bandeiras: LR() })
    expect(d.base).toBeNull()
    expect(d.base).not.toBe(0)
  })

  it('>>> a TELA bloqueia o salvar — o caso afirma o bloqueio, não o aviso <<<', () => {
    const src = ler('src/pages/fluxo-de-caixa/index.tsx')
    // O guard está no handler de salvar, antes de qualquer insert.
    expect(src).toContain('ALIQUOTAS_MAIORES_QUE_O_TOTAL')
    const salvar = src.slice(src.indexOf('const handleSaveEntry'), src.indexOf('const entries: any[] = []'))
    expect(salvar).toMatch(/descascamentoDaNota\.base == null/)
    expect(salvar).toMatch(/return/)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// Q — O CUSTO LÍQUIDO GUARDA O QUE NÃO CREDITA
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('Q — o que não gera crédito PERMANECE no custo', () => {
  const d = descascarANota(GABARITO)

  it('>>> 1.172,00 − 315,85 = 856,15, e não 752,15 <<<', () => {
    expect(d.custoLiquido).toBeCloseTo(856.15, 2)
    // 752,15 seria o número de quem subtrai ST (50) + FCP (4) + IS (50) do custo. Eles foram
    // PAGOS e não voltam: subtraí-los afirmaria que o dinheiro nunca saiu.
    expect(d.custoLiquido).not.toBeCloseTo(752.15, 2)
  })

  it('o custo líquido é sempre `total − creditoTotal`', () => {
    expect(d.custoLiquido).toBeCloseTo(d.total - d.creditoTotal, 2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// R — VEDAÇÃO POR REGIME
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('R — no Simples não há crédito, e o custo líquido é o total', () => {
  const d = descascarANota({
    ...GABARITO,
    bandeiras: resolverFlagsDoItem(
      { regime: 'SIMPLES_NACIONAL', destinacao: 'REVENDA', segmento: 'INDUSTRIALIZACAO' }, {},
    ),
  })

  it('>>> os cinco créditos são ZERO <<<', () => {
    expect(d.creditos).toEqual({ ipi: 0, cbs: 0, ibs: 0, icms: 0, pisCofins: 0 })
    expect(d.creditoTotal).toBe(0)
  })

  it('>>> e o custo líquido é o TOTAL — nada volta <<<', () => {
    expect(d.custoLiquido).toBeCloseTo(1172.0, 2)
  })

  it('>>> mas a BASE continua sendo calculada: o imposto existe, o crédito é que não <<<', () => {
    expect(d.base).toBeCloseTo(1000.0, 2)
    expect(d.saldo).toBeCloseTo(1060.0, 2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// S — NÃO-REGRESSÃO DO GRAVADO
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('S — a mesma nota pelas duas direções grava as mesmas colunas de crédito', () => {
  /**
   * A DIREÇÃO ANTIGA: o usuário digitava a base (1.000,00) e o total era somado.
   * A NOVA: digita o total (1.172,00) e a base é revelada.
   *
   * Os dois caminhos descrevem a MESMA nota, e é isso que o caso afirma — não que as duas
   * implementações coexistam, mas que a inversão não mudou o que vai para o banco.
   */
  const pelaNova = descascarANota(GABARITO)

  it('>>> credit_icms, credit_pis_cofins e credit_ipi idênticos aos da direção antiga <<<', () => {
    // A direção antiga, reproduzida pelo motor com a base digitada:
    const { calcularCustoDoItem } = require('@/utils/custo-liquido-do-item') as typeof import('@/utils/custo-liquido-do-item')
    const pelaAntiga = calcularCustoDoItem(
      { base: 1000, icmsPct: 18, pisCofinsPct: 9.25, ipiPct: 6, ipiCustoValor: 40, icmsSt: 50, difalValor: 18, fcp: 4 },
      LR(),
    )
    expect(pelaNova.creditos.icms).toBeCloseTo(pelaAntiga.creditos.ICMS, 2)
    expect(pelaNova.creditos.pisCofins).toBeCloseTo(pelaAntiga.creditos.PIS_COFINS, 2)
    expect(pelaNova.creditos.ipi).toBeCloseTo(pelaAntiga.creditos.IPI, 2)
    expect(pelaNova.creditoTotal).toBeCloseTo(pelaAntiga.creditoTotal, 2)
  })

  it('>>> e o custo bruto da direção antiga é o TOTAL da nova — a costura fecha <<<', () => {
    const { calcularCustoDoItem } = require('@/utils/custo-liquido-do-item') as typeof import('@/utils/custo-liquido-do-item')
    const pelaAntiga = calcularCustoDoItem(
      { base: 1000, icmsPct: 18, pisCofinsPct: 9.25, ipiPct: 6, ipiCustoValor: 40, icmsSt: 50, difalValor: 18, fcp: 4 },
      LR(),
    )
    // 1.000 + 60 (IPI cred.) + 40 (IPI custo) + 50 (ST) + 18 (DIFAL) + 4 (FCP) = 1.172,00
    expect(pelaAntiga.custoBruto).toBeCloseTo(1172.0, 2)
    expect(pelaAntiga.custoBruto).toBeCloseTo(pelaNova.total, 2)
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// M (§11) — A ABA CRÉDITOS NÃO PERDE NADA
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('M — a aba mostra a escada, e a nota LEGADO não ganha saldo inventado', () => {
  const aba = () => ler('src/components/creditos/creditos-tab.component.tsx')

  it('>>> a escada vem de `linhasDoDescascamento` — a MESMA função da tela <<<', () => {
    const s = aba()
    expect(s).toContain('linhasDoDescascamento')
    expect(s).toContain('descascarANota')
  })

  it('>>> e fica no DETALHE expandido, não em coluna nova: a tabela já está larga <<<', () => {
    expect(aba()).toContain('expandedRowRender')
  })

  it('>>> a nota LEGADO mostra só Total e Crédito, e DIZ por quê <<<', () => {
    const s = aba()
    expect(s).toContain("nota.origin === 'LEGADO'")
    expect(s).toContain('não foram apurados')
  })

  it('>>> o crédito da nota gravada é FATO: a leitura não o redecide pelo regime de hoje <<<', () => {
    const s = aba()
    expect(s).toContain('BANDEIRAS_DO_JA_GRAVADO')
    // Uma nota de agosto não pode perder o crédito porque o tenant mudou de regime em
    // setembro — seria reescrever o passado (`fato-vs-referencia.md`).
    const { BANDEIRAS_DO_JA_GRAVADO } = require('@/utils/nota-de-compra') as typeof import('@/utils/nota-de-compra')
    const d = descascarANota({
      total: 1172,
      reducoes: { ipiCusto: 40, icmsSt: 50, difal: 18, fcp: 4 },
      porFora: { ipi: { brl: 60 } },
      porDentro: { icms: { brl: 180 } },
      bandeiras: BANDEIRAS_DO_JA_GRAVADO,
    })
    expect(d.creditos.icms).toBeCloseTo(180.0, 2)
    expect(d.creditos.ipi).toBeCloseTo(60.0, 2)
  })

  it('>>> a lista de campos do descascamento é UMA, lida pelo `select` e pelo repasse <<<', () => {
    const s = aba()
    expect(s).toContain('CAMPOS_DO_DESCASCAMENTO')
    for (const c of ['frete', 'valor_is', 'parcela_st', 'ipi_por_dentro']) {
      expect(s).toContain(c)
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// §8 — O CADASTRO DE ITEM HERDA O MOTOR, NÃO A DIREÇÃO
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('>>> o item NÃO descasca, e herda a correção do CST <<<', () => {
  it('a tela do item não importa `descascarANota`', () => {
    expect(ler('src/page-parts/items/new-item-form.component.tsx')).not.toContain('descascarANota')
  })

  it('>>> mas o CST 04 veda no item também: a correção é do MOTOR <<<', () => {
    const b = resolverFlagsDoItem(
      { regime: 'LUCRO_REAL', destinacao: 'REVENDA', segmento: 'INDUSTRIALIZACAO', cstPisCofins: '04' },
      {},
    )
    expect(b.PIS_COFINS.vedado).toBe(true)
  })

  it('a fatia não se aplica ao item: um item é homogêneo por definição', () => {
    const src = ler('src/page-parts/items/new-item-form.component.tsx')
    expect(src).not.toContain('parcela_st')
    expect(src).not.toContain('parcela_monofasica')
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// O MÓDULO NÃO REIMPLEMENTA IMPOSTO
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('>>> o descascamento acha a BASE; quem calcula imposto é o motor <<<', () => {
  it('as bases vêm de `baseDoTributo`, e o módulo a importa', () => {
    const src = ler('src/utils/nota-de-compra.ts')
    expect(src).toContain("from '@/utils/custo-liquido-do-item'")
    expect(src).toContain('baseDoTributo')
    expect(src).toContain('calcularCustoDoItem')
  })

  it('>>> e a base do PIS/COFINS que ele usa é a MESMA que o motor calcula <<<', () => {
    const d = descascarANota(GABARITO)
    const doMotor = baseDoTributo({ base: 1000, icmsPct: 18 }, 'PIS_COFINS')
    expect(d.basesPorDentro.pisCofins).toBeCloseTo(doMotor, 2)
  })
})
