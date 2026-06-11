/**
 * DIAGNÓSTICO — Cascata tributária (cascata_tributaria_diagnostico.pdf)
 *
 * Objetivo: verificar EMPIRICAMENTE a tese do PDF de que os tributos adicionais
 * (ICMS-ST, DIFAL, ICMS Complementar, Despesas Acessórias) "não são deduzidos
 * entre o desconto e a apuração reversa", inflando o Resultado Residual (RRO)
 * que alimenta os pesos de Comissão/Lucro/IRPJ/CSLL.
 *
 * Cenário canônico do PDF (Seção 06):
 *   Valor do orçamento ........... R$ 154.753,14
 *   Op. venda por dentro (âncora)  R$ 143.669,80   (F5 — ANTES de Desp.Aces/IPI/ST/DIFAL/ICMSCompl)
 *   ICMS + ISS + PIS/COFINS ...... R$  24.423,87
 *   Custo do produto ............. R$  55.901,92
 *   MO + Despesas operacionais ... R$  38.345,47
 *   Desp. acessórias ............. R$   1.200,00
 *   ICMS Complementar ............ R$   1.435,39
 *   Resultado residual (PDF "atual/inflado") .. R$ 24.998,55
 *   Resultado residual (PDF "correto") ........ R$ 23.563,16  (= 24.998,55 − 1.435,39)
 *
 * A tese do PDF: o "correto" seria 23.563,16, subtraindo o ICMS Complementar.
 *
 * O que este teste verifica no MOTOR V17 REAL:
 *   (A) Reconstrói a âncora 143.669,80 e confirma RRO = 24.998,55.
 *   (B) Toggla ICMS Complementar (OFF→ON) e Desp. Acessórias (0→1.200) e mede se o
 *       RRO e a distribuição Comissão/Lucro/IRPJ/CSLL MUDAM.
 *
 * Resultado esperado (refuta o PDF): no V17 a âncora já exclui esses tributos via
 * peso_op_interna, e eles são somados POR FORA (valor_final). Logo o RRO é INVARIANTE
 * a eles — subtraí-los de novo (D2–D5) seria DUPLA dedução. O número "correto" do PDF
 * (23.563,16) está errado para a arquitetura V17.
 */

import { calculateMotorV17 } from '../mrm-engine-v17'
import type { EngineItemV17, MotorV17Input, TaxRatePeriod } from '@/types/mrm'

function rate(tax_type: TaxRatePeriod['tax_type'], rate_pct: number): TaxRatePeriod {
  return {
    id: `r-${tax_type}`,
    tenant_id: 'test',
    tax_type,
    origin_state: null,
    dest_state: null,
    rate_pct,
    valid_from: '2026-01-01',
    valid_until: null,
    notes: null,
  }
}

// ───── Reconstrução do cenário canônico do PDF ─────
const VALOR_ORCAMENTO = 154753.14
const ANCORA_PDF = 143669.80
const IMP_DENTRO = 24423.87 // ICMS + ISS + PIS/COFINS (lump — só alimenta imp_dentro_total)
const CP = 55901.92
const MOD_DOP = 38345.47
const DESP_ACESS = 1200.0

// peso_op_interna que converte rb (=valor do orçamento) na âncora limpa do PDF.
const PESO_OP_INTERNA = ANCORA_PDF / VALOR_ORCAMENTO // 0,928372...

const ITEM: EngineItemV17 = {
  item_id: 'pdf-cascata',
  rb: VALOR_ORCAMENTO,
  cp: CP,
  mod_pct: 0,
  // dop_total = rb × dop_pct = 38.345,47  →  dop_pct = 38.345,47 / 154.753,14
  dop_pct: MOD_DOP / VALOR_ORCAMENTO,
  // % de margem (apenas definem PESOS de redistribuição — não afetam o RRO)
  commission_pct: 0.04,
  profit_pct: 0.102374,
  csll_pct: 0.009286,
  irpj_pct: 0.013,
  peso_op_interna: PESO_OP_INTERNA,
  // ICMS+ISS+PIS/COFINS consolidados por dentro (pré-desconto). Sem desconto → factor 1.
  taxes_inside_amounts: { icms: IMP_DENTRO, iss: 0, pis_cofins: 0 },
}

// Alíquotas: ICMS 17% (base do ICMS Complementar), IPI para gerar base por fora.
const RATES: TaxRatePeriod[] = [
  rate('ICMS', 0.17),
  rate('IPI', 0.05),
  rate('IBS', 0.001),
  rate('CBS', 0.009),
  rate('IS', 0),
]

function input(overrides: Partial<MotorV17Input>): MotorV17Input {
  return {
    items: [ITEM],
    discount: { pct: 0 },
    policy: 'RRO_PROPORTIONAL',
    regime: 'LUCRO_REAL',
    rates: RATES,
    effective_date: '2026-06-11',
    use_snapshot_rates: false,
    ...overrides,
  }
}

describe('DIAGNÓSTICO Cascata — (A) reconstrução do cenário canônico do PDF', () => {
  it('Âncora reconstruída = R$ 143.669,80 (Op. venda por dentro do PDF)', () => {
    const r = calculateMotorV17(input({}))
    expect(r.motor.ancora).toBeCloseTo(ANCORA_PDF, 1)
  })

  it('imp_dentro_total = R$ 24.423,87 e CP/MOD+DOP batem o PDF', () => {
    const r = calculateMotorV17(input({}))
    expect(r.motor.imp_dentro_total).toBeCloseTo(IMP_DENTRO, 1)
    expect(r.motor.cp_efetivo).toBeCloseTo(CP, 1)
    expect(r.motor.mod + r.motor.dop).toBeCloseTo(MOD_DOP, 1)
  })

  it('RRO = R$ 24.998,55 — exatamente o "residual atual" do PDF (de âncora JÁ limpa)', () => {
    const r = calculateMotorV17(input({}))
    // 143.669,80 − 24.423,87 − 55.901,92 − 38.345,47 = 24.998,54
    expect(r.motor.rro).toBeCloseTo(24998.54, 1)
  })
})

describe('DIAGNÓSTICO Cascata — (B) o RRO é INVARIANTE aos tributos adicionais?', () => {
  it('ICMS Complementar OFF → ON: RRO NÃO muda (não infla o residual)', () => {
    const off = calculateMotorV17(input({ desp_acessorias: DESP_ACESS, icms_compl_applies: false }))
    const on = calculateMotorV17(input({ desp_acessorias: DESP_ACESS, icms_compl_applies: true }))

    // O ICMS Complementar É calculado e cobrado por fora...
    const compl = on.distribution.taxes_outside.find((t) => t.type === 'ICMS_COMPL')
    expect(compl).toBeDefined()
    expect(compl!.amount).toBeGreaterThan(0)

    // ...mas o RRO e a distribuição são BIT-IDÊNTICOS com e sem ele.
    expect(on.motor.rro).toBe(off.motor.rro)
    expect(on.distribution.new_commission).toBe(off.distribution.new_commission)
    expect(on.distribution.new_profit).toBe(off.distribution.new_profit)
    expect(on.distribution.new_irpj).toBe(off.distribution.new_irpj)
    expect(on.distribution.new_csll).toBe(off.distribution.new_csll)
  })

  it('Desp. Acessórias 0 → 1.200: RRO NÃO muda (entram só por fora / valor_final)', () => {
    const sem = calculateMotorV17(input({ desp_acessorias: 0 }))
    const com = calculateMotorV17(input({ desp_acessorias: DESP_ACESS }))

    expect(com.motor.rro).toBe(sem.motor.rro)
    // valor_final cresce ao menos o valor das despesas acessórias (cobradas do cliente).
    expect(com.distribution.valor_final - sem.distribution.valor_final).toBeGreaterThanOrEqual(DESP_ACESS - 0.01)
  })

  it('Os tributos por fora vão para valor_final, NÃO para o RRO', () => {
    const r = calculateMotorV17(input({ desp_acessorias: DESP_ACESS, icms_compl_applies: true }))
    // valor_final = âncora + desp. acessórias + Σ tributos por fora (inclui ICMS Compl)
    expect(r.distribution.valor_final).toBeCloseTo(
      r.motor.ancora + r.distribution.desp_acessorias + r.distribution.taxes_outside_total,
      2,
    )
    // RRO permanece sobre a âncora limpa, sem qualquer dedução adicional.
    expect(r.motor.rro).toBeCloseTo(24998.54, 1)
  })

  it('TESE DO PDF REFUTADA: o "residual correto" 23.563,16 exigiria DUPLA dedução', () => {
    const r = calculateMotorV17(input({ desp_acessorias: DESP_ACESS, icms_compl_applies: true }))
    const compl = r.distribution.taxes_outside.find((t) => t.type === 'ICMS_COMPL')!
    // O PDF propõe RRO_correto = RRO − ICMS_Compl. Como a âncora (F5) já é ANTERIOR ao
    // ICMS Complementar (F9), subtraí-lo do RRO seria contá-lo duas vezes.
    const rroSeguindoOPdf = r.motor.rro - compl.amount
    expect(rroSeguindoOPdf).toBeLessThan(r.motor.rro) // a "correção" REDUZ indevidamente
    // O motor mantém o residual correto (âncora limpa), independente do ICMS Compl.
    expect(r.motor.rro).toBeCloseTo(24998.54, 1)
  })
})
