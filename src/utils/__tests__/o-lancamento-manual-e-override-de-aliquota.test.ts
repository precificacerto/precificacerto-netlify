/**
 * O lançamento manual é override da ALÍQUOTA, não da CLASSIFICAÇÃO.
 *
 * ── Por que este arquivo existe ─────────────────────────────────────────────
 *
 * Duas mutações passaram VERDES na rodada anterior — o modal deixar de limpar as
 * duas reduções novas, e o modal apagar o cClassTrib. Não havia teste porque o
 * payload vivia inline no `handleConfirm`. A correção foi a do repositório:
 * exportar a função (`teste-que-nao-exercita.md`).
 *
 * ── O que se afirma aqui é EFEITO ──────────────────────────────────────────
 *
 * Não "o campo está no payload", e sim: aplicando o payload sobre a linha do
 * cadastro, a alíquota que sai de `buildItemTaxRatesFromProduct` é a DIGITADA —
 * e não uma versão reduzida dela. É a dupla redução que o ADR-022 D5 evita, e ela
 * não levanta erro nenhum: o número sai plausível.
 */
import {
  buildLancamentoManualPayload,
  CAMPOS_DE_CLASSIFICACAO_PRESERVADOS,
} from '@/utils/lancamento-manual-de-impostos'
import { buildItemTaxRatesFromProduct } from '@/utils/item-tax-rates'
import { resolveReducoesDoItem } from '@/utils/classificacao-fiscal'

/** Um produto classificado pelo 200025 — IBS 60%, CBS 100% — antes do override. */
const ANTES: Record<string, unknown> = {
  id: 'p1',
  ibs_pct: 1,
  cbs_pct: 9,
  ibs_reference_pct: 1,
  cbs_reference_pct: 9,
  iva_dual_reduction_factor: null,
  cst_ibs_cbs_code: '200',
  cclass_trib: '200025',
  cclass_trib_origem: 'TABELA',
  cclass_trib_source_published_at: '2026-06-22',
  iva_reduction_ibs_pct: 60,
  iva_reduction_cbs_pct: 100,
}

/** O usuário lança 0,80% de IBS e 7,20% de CBS como alíquotas FINAIS. */
const payload = buildLancamentoManualPayload({
  isPct: 0, isValue: 0,
  ibsPct: 0.8, ibsValue: 8,
  cbsPct: 7.2, cbsValue: 72,
  ipiPct: 0, ipiValue: 0,
  salePrice: 1000, finalPrice: 1080,
  updatedAt: '2026-09-16T00:00:00.000Z',
})

const DEPOIS = { ...ANTES, ...payload } as Record<string, unknown>

describe('a alíquota DIGITADA vale, e não sofre a redução de novo', () => {
  it('antes do override, a redução do 200025 derrubava IBS para 0,40% e CBS para 0', () => {
    const r = buildItemTaxRatesFromProduct(ANTES)
    expect(r.ibs_pct).toBeCloseTo(0.4, 10)
    expect(r.cbs_pct).toBeCloseTo(0, 10)
  })

  it('DEPOIS do override, sai 0,80% e 7,20% — exatamente o que foi digitado', () => {
    const r = buildItemTaxRatesFromProduct(DEPOIS)
    expect(r.ibs_pct).toBeCloseTo(0.8, 10)
    expect(r.cbs_pct).toBeCloseTo(7.2, 10)
  })

  it('sem zerar as reduções, o IBS digitado sairia 0,32% e a CBS ZERADA', () => {
    // A dupla redução, medida: 0,80 × (1 − 0,60) = 0,32 e 7,20 × (1 − 1) = 0.
    // É o contraste que dá dente ao caso acima — e nenhum dos dois números
    // levanta erro; os dois parecem alíquotas legítimas.
    const semZerar = { ...DEPOIS, iva_reduction_ibs_pct: 60, iva_reduction_cbs_pct: 100 }
    const r = buildItemTaxRatesFromProduct(semZerar)
    expect(r.ibs_pct).toBeCloseTo(0.32, 10)
    expect(r.cbs_pct).toBeCloseTo(0, 10)
    expect(r.ibs_pct).not.toBeCloseTo(0.8, 5)
  })

  it('o produto LEGADO, com fator 50, também sai com a alíquota digitada', () => {
    // O caso passa PELO PAYLOAD, e não por um estado montado à mão: era assim que
    // a primeira versão deste arquivo deixava a mutação "o legado deixa de ser
    // zerado" sobreviver. O fixture entra com o fator preenchido, e o que se
    // afirma é o número DEPOIS de aplicar o payload.
    const legadoAntes: Record<string, unknown> = {
      ...ANTES, iva_reduction_ibs_pct: null, iva_reduction_cbs_pct: null, iva_dual_reduction_factor: 50,
    }
    expect(buildItemTaxRatesFromProduct(legadoAntes).ibs_pct).toBeCloseTo(0.5, 10)

    const legadoDepois = { ...legadoAntes, ...payload }
    const r = buildItemTaxRatesFromProduct(legadoDepois)
    expect(r.ibs_pct).toBeCloseTo(0.8, 10)
    expect(r.cbs_pct).toBeCloseTo(7.2, 10)
    // sem zerar o legado, sairia 0,40% — metade do digitado, e plausível
    expect(r.ibs_pct).not.toBeCloseTo(0.4, 5)
  })

  it('a travessia enxerga AUSENTE depois do override — não zero, não legado', () => {
    expect(resolveReducoesDoItem(DEPOIS as never).fonte).toBe('AUSENTE')
  })
})

describe('a CLASSIFICAÇÃO sobrevive ao override — a NF-e a exige', () => {
  it('o cClassTrib e o CST continuam lá, com a procedência e a publicação', () => {
    expect(DEPOIS.cclass_trib).toBe('200025')
    expect(DEPOIS.cst_ibs_cbs_code).toBe('200')
    expect(DEPOIS.cclass_trib_origem).toBe('TABELA')
    expect(DEPOIS.cclass_trib_source_published_at).toBe('2026-06-22')
  })

  it('o payload NÃO menciona nenhum campo de classificação', () => {
    // Mencioná-los com `null` apagaria a classificação no update; mencioná-los com
    // valor faria o modal legislar sobre um dado que ele não conhece.
    for (const campo of CAMPOS_DE_CLASSIFICACAO_PRESERVADOS) {
      expect(Object.keys(payload)).not.toContain(campo)
    }
  })
})

describe('os dois estados de "redução NULL" se distinguem', () => {
  it('override deixa `taxes_launched` verdadeiro e a origem TABELA', () => {
    expect(DEPOIS.taxes_launched).toBe(true)
    expect(DEPOIS.cclass_trib_origem).toBe('TABELA')
  })

  it('código MANUAL tem reduções NULL sem `taxes_launched` — e a origem é outra', () => {
    const manual: Record<string, unknown> = {
      ...ANTES,
      cclass_trib: '200099',
      cclass_trib_origem: 'MANUAL',
      iva_reduction_ibs_pct: null,
      iva_reduction_cbs_pct: null,
    }
    expect(resolveReducoesDoItem(manual as never).fonte).toBe('AUSENTE')
    expect(manual.cclass_trib_origem).not.toBe(DEPOIS.cclass_trib_origem)
    expect((manual as Record<string, unknown>).taxes_launched).toBeUndefined()
  })
})
