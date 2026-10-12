/**
 * mrm-engine-v17/motor-rro.ts — Camada 1, Etapa 2
 *
 * EPIC-MRM-V17 (2026-05-28)
 * Cobre PDF Etapas 10-15: cascata tributária sequencial + RRO consolidado.
 *
 * Princípio cascata inviolável (PDF Seção 19):
 *   1º ICMS sobre Âncora
 *   2º ISS  sobre (Âncora − ICMS)
 *   3º PIS/COFINS sobre (Âncora − ICMS − ISS)   [ADR-016, 2026-05-29: REVOGA ADR-013.
 *      VALOR preservado da precificação (Σ Op Interna × pct); a alíquota é TRANSMUTADA
 *      para a base 13A → alíq_13B = alíq_precif / (1 − ICMS% − ISS%). Mantém o valor
 *      monetário idêntico ao da precificação e a base correta da cascata.]
 *
 * Princípio V16.3: despesas operacionais e MOD/CP imutáveis a desconto.
 */

import type {
  ConsolidatedView,
  DiscountV17,
  MotorOutput,
  ReapurationStatus,
  TaxRatePeriod,
  TaxRegime,
  TaxType,
} from '@/types/mrm'
import {
  MRM_ERROR_RRO_NON_POSITIVE,
} from '@/types/mrm'

import { buildCascadeTrace17 } from './cascade-trace'
import { limiteMinimoDaOperacao, somaDoDenominador } from '../limite-de-desconto'
import { MATRIZ_FISCAL } from '../matriz-fiscal'
import type { TaxRegime as TaxRegimeDoBanco } from '@/supabase/types'
import { temGuiaUnicaPorDentro } from '../regime-decisoes'

interface ApplyMotorRROInput {
  view: ConsolidatedView
  discount: DiscountV17
  rates: TaxRatePeriod[]
  /**
   * EPIC-DAS: regime resolvido do tenant. Só SIMPLES_NACIONAL e MEI ativam o ramo do DAS.
   *
   * RET e Simples Híbrido chegam aqui COMO ELES MESMOS desde 11/10/2026 (XI-4 e o passo do
   * Híbrido de 19/09/2026) — não mais como `LUCRO_PRESUMIDO`. Continuam fora do ramo do DAS, e
   * agora por DECISÃO ESCRITA em vez de por mapeamento: `GUIA_UNICA_POR_DENTRO` em
   * `regime-decisoes.ts` tem a célula de cada um. Ausente ⇒ comportamento clássico (bit-exact).
   */
  regime?: TaxRegime
  tax_credits_recoverable_total: number
  /**
   * Gargalo 3 (planilha "Motor RRO 11.06"): ajuste do pool por Desp. Acessória FIXA no desconto.
   * R$ no espaço consolidado (por-dentro + por-fora), pré-aplicação do peso. Calculado pelo
   * orquestrador = desp × d × (1 + icms × [ICMS Compl com frete na base]). Default 0.
   */
  desp_pool_adjustment?: number
}

interface ApplyMotorRROResult {
  motor: MotorOutput
  messages: string[]
}

/**
 * O regime, como CHAVE DA MATRIZ, para o limite da VII.3.
 *
 * `input.regime` é opcional no contrato do motor (`regime?: TaxRegime`) e chega ausente em
 * snapshots antigos. Ausente cai em `LUCRO_REAL`, que é o MESMO default declarado da
 * decomposição (`FORMATO_QUANDO_O_REGIME_NAO_CARREGOU`, `budget-decomposition-input.ts`) — e
 * é o denominador mais CONSERVADOR dos seis nesta entrada, logo o limite mais apertado. Um
 * default que afrouxasse o limite deixaria passar desconto que a regra barra.
 */
function regimeDoLimite(regime: string | null | undefined): TaxRegimeDoBanco {
  const r = String(regime ?? '').trim().toUpperCase()
  return Object.prototype.hasOwnProperty.call(MATRIZ_FISCAL, r)
    ? (r as TaxRegimeDoBanco)
    : 'LUCRO_REAL'
}

/**
 * Aplica cascata tributária + RRO sobre a visão consolidada.
 *
 * Output bit-exact entre os 2 flavors da Camada 2 — só `new_commission` e
 * `new_profit` divergem após Camada 2.
 */
export function applyMotorRRO(input: ApplyMotorRROInput): ApplyMotorRROResult {
  const { view } = input
  const messages: string[] = []

  // ───── Resolver alíquotas relevantes (fallback quando produtos não consolidam) ─────
  const icms_rate = resolveRate(input.rates, 'ICMS')
  const iss_rate = resolveRate(input.rates, 'ISS')
  const pis_rate = resolveRate(input.rates, 'PIS')
  const cofins_rate = resolveRate(input.rates, 'COFINS')
  const pis_cofins_rate = pis_rate + cofins_rate

  // ───── PDF Etapa 13: cascata tributária ─────
  // V17 (2026-05-28): se produtos forneceram taxes_inside_amounts (R$ consolidados),
  // usar valores direto + aplicar desconto proporcional. Multi-produto com alíquotas
  // distintas resulta em ICMS/ISS/PIS/COFINS efetivos diferentes da nominal do tenant.
  // Caso contrário, fallback ao cálculo via Âncora × pct_tenant (legado).
  const tit = view.taxes_inside_total
  const rb_total = view.rb_total
  const rv_total = view.rv_total

  // ADR-016 (2026-05-29): Operação Interna Consolidada (pré-desconto) = peso × rb_total.
  const op_interna_consolidada = view.peso_op_interna_ponderado * rb_total

  // Gargalo 3 (planilha "Motor RRO 11.06", 2026-06-11): a Desp. Acessória é FIXA no desconto
  // (frete/seguro contratuais). O desconto que incidiria sobre ela é absorvido pela operação por
  // dentro, reduzindo a âncora pós-desconto. `desp_pool_adjustment` chega do orquestrador no espaço
  // consolidado; multiplica-se pelo peso por-dentro para obter o efeito na âncora.
  const despPoolAdjustment = Math.max(0, Number(input.desp_pool_adjustment) || 0)
  const ancora = Math.max(0, view.ancora_interna - despPoolAdjustment * view.peso_op_interna_ponderado)

  // Fator efetivo = âncora (corrigida, pós-desconto) / Op Interna consolidada (pré-desconto).
  // Sem ajuste de desp. equivale a rv_total/rb_total (ancoraFactor clássico, PDF Seção 23).
  const ancoraFactor = op_interna_consolidada > 0
    ? ancora / op_interna_consolidada
    : (rb_total > 0 ? rv_total / rb_total : 1)

  // ───── EPIC-DAS: Simples Nacional / MEI ─────
  // O DAS SUBSTITUI o grupo ICMS+ISS+PIS/COFINS por dentro — nunca soma a ele. Nesses
  // regimes não há cascata de bases (não existe segunda incidência): o DAS incide DIRETO
  // sobre a Âncora. Fora de SN/MEI `das` é 0 e todo o cálculo abaixo é bit-exact ao anterior.
  // RET e Simples Híbrido são mapeados para LUCRO_PRESUMIDO antes de chegar aqui, logo
  // reusam a coluna `custom_tax_percent` sem nunca entrar neste ramo.
  const isSimplesOuMei = temGuiaUnicaPorDentro(input.regime)
  const das_rate = resolveRate(input.rates, 'DAS')

  let icms: number
  let iss: number
  let pis_cofins: number
  let pis_cofins_aliquota_efetiva: number
  let das = 0

  if (isSimplesOuMei) {
    // Substituição: os três zeram e o DAS ocupa o lugar deles.
    icms = 0
    iss = 0
    pis_cofins = 0
    pis_cofins_aliquota_efetiva = 0
    // `das != null` cobre inclusive o MEI legítimo com alíquota 0 (linha presente, valor zero).
    // ATENÇÃO OPERACIONAL: quando NENHUM item traz a coluna preenchida e não há alíquota DAS
    // nos `rates`, o grupo por dentro fica zerado — os três nominais já foram zerados pela
    // substituição e não há DAS para pôr no lugar. É o comportamento correto pela regra (no
    // Simples não se cobra ICMS/ISS/PIS-COFINS em separado), mas pressupõe o cadastro
    // preenchido: tenant do Simples sem `custom_tax_percent`/`taxable_regime_percent` volta a
    // ter RRO inflado. A correção é de DADO (preencher o cadastro), não de motor.
    das = tit?.das != null
      ? tit.das * ancoraFactor          // consolidado por item (alíquota gravada no cadastro)
      : ancora * das_rate               // fallback: alíquota uniforme via rates (ex.: snapshot)
  } else if (tit) {
    // Consolidação por produto (R$ pré-desconto × desconto)
    icms = tit.icms * ancoraFactor
    iss = tit.iss * ancoraFactor
    // ADR-016 (transmutação, 2026-05-29): o VALOR do PIS/COFINS é o consolidado da
    // PRECIFICAÇÃO (Σ Op Interna × pct) — PRESERVADO, não reduzido pela base menor.
    // A base de incidência exibida é (Âncora − ICMS − ISS); a alíquota é TRANSMUTADA
    // para manter o valor: alíq_13B = pis_cofins / base_13A = alíq_precif/(1−ICMS%−ISS%).
    pis_cofins = tit.pis_cofins * ancoraFactor
    const base_13a = ancora - icms - iss
    pis_cofins_aliquota_efetiva = base_13a > 0
      ? pis_cofins / base_13a
      : (op_interna_consolidada > 0 ? tit.pis_cofins / op_interna_consolidada : pis_cofins_rate)
  } else {
    // Fallback (tenant uniforme): valor da precificação = Âncora × pis_cofins_rate
    // (sobre a operação interna), transmutado para a base (Âncora − ICMS − ISS).
    icms = ancora * icms_rate
    const base_pos_icms = ancora - icms
    iss = base_pos_icms * iss_rate
    pis_cofins = ancora * pis_cofins_rate
    const base_13a = base_pos_icms - iss
    pis_cofins_aliquota_efetiva = base_13a > 0 ? pis_cofins / base_13a : pis_cofins_rate
  }

  // EPIC-DAS: os quatro somam, mas em qualquer regime três deles são zero por construção —
  // fora de SN/MEI o DAS é 0; em SN/MEI ICMS/ISS/PIS-COFINS são 0. Nunca há dupla contagem.
  const imp_dentro_total = icms + iss + pis_cofins + das

  // ───── PDF Etapa 14: cascata custos e despesas ─────
  // V16.3 princípio: estes valores são IMUTÁVEIS a desconto.
  // CP efetivo = CP total − créditos recuperáveis (V5-004)
  const cp_efetivo = Math.max(0, view.cp_total - input.tax_credits_recoverable_total)
  const mod = view.mod_total
  const dop = view.dop_total

  // ───── EPIC-RT v8 (2026-07-13): RT (Comissão Reserva Técnica) ─────
  // Dedução gerencial abatida do RRO ANTES da redistribuição (item 16). A alíquota
  // efetiva é CONGELADA da construção (Σ rb_i×rt_pct_i / rb_total) e aplicada sobre a
  // Âncora (Op. Interna pós-desconto). Independe do modo de desconto. Default 0 ⇒ RRO
  // idêntico ao anterior (bit-exact). NÃO afeta base de IRPJ/CSLL nem pesos de redistribuição.
  const rt_efetiva = rb_total > 0 ? (Number(view.rt_amount_original) || 0) / rb_total : 0
  const rt_value = ancora * rt_efetiva

  // ───── PDF Etapa 15: RRO (líquido de RT — EPIC-RT v8) ─────
  const rro = ancora - imp_dentro_total - cp_efetivo - mod - dop - rt_value

  // Status do RRO (R5 — não força a zero, apenas sinaliza)
  let rro_status: ReapurationStatus = 'VALID'
  if (Math.abs(rro) < 0.01) {
    rro_status = 'RRO_ZERO'
    messages.push(MRM_ERROR_RRO_NON_POSITIVE)
  } else if (rro < 0) {
    rro_status = 'RRO_NEGATIVE'
    messages.push(MRM_ERROR_RRO_NON_POSITIVE)
  }

  // ═══ LIMITE MÍNIMO OPERACIONAL — ESPEC PARTE VII.3 ══════════════════════════════════════
  //
  // >>> O DENOMINADOR É LIDO DA MATRIZ, E O RT% ENTRA NELE <<<
  //
  // Era `1 − (icms + iss + pis_cofins)` fora de SN/MEI, e `1 − DAS%` dentro — um `if` por
  // NOME de regime, **sem o RT%** que a VII.3 pede. Agora os tributos vêm de
  // `tributosDoLimite`: colocação POR_DENTRO e base ≠ LUCRO. A regra do `base ≠ LUCRO` é a
  // que a própria VII.3 usa ao dizer, do Lucro Real, *"IRPJ/CSLL não entram: são resíduo"* —
  // e ela reproduz a tabela VII.3 nos seis regimes sem nomear nenhum.
  //
  // O `isSimplesOuMei` continua decidindo a FONTE da alíquota do DAS, não se ele entra: a
  // efetiva `das/âncora` é a coerente com a substituição, e `das_rate` é o fallback de
  // snapshot. Quem decide se há DAS a somar é a matriz — e no MEI ela diz INEXISTENTE, o que
  // reproduz o `1 − RT%` da VII.3 sem tratar o MEI por nome.
  //
  // ALÍQUOTA AUSENTE: `semAliquota` traz o que a matriz manda somar e o motor não tem. Hoje é
  // o caso do RET, cuja alíquota não chega como `TaxRatePeriod` — ela vem pela coluna
  // reusada `custom_tax_percent`. Ele contribui ZERO na soma, porque não há outro número, e a
  // lista sai em `limite_incompleto` para que a tela possa dizer que o limite não está
  // apurado em vez de exibi-lo como se estivesse (`ausente-vs-falso.md`).
  const das_efetivo = ancora > 0 ? das / ancora : das_rate
  const _den = somaDoDenominador({
    regime: regimeDoLimite(input.regime),
    // O limite é da OPERAÇÃO CONSOLIDADA, e o segmento dela não chega ao motor. A
    // industrialização é a coluna mais completa da matriz — nenhum tributo que exista nos
    // outros dois falta nela —, então usá-la nunca SUBESTIMA o denominador. Está escrito
    // porque é escolha, não dedução: o segmento por item existe na decomposição, não aqui.
    segmento: 'INDUSTRIALIZACAO',
    aliquotas: {
      ICMS: icms_rate,
      ISS: iss_rate,
      PIS_COFINS: pis_cofins_rate,
      DAS: das_efetivo,
      // O Híbrido reusa a MESMA coluna do DAS; o que mudou foi o número que a construção
      // gravou lá — o DAS reduzido. Ver `simples-hibrido.ts`.
      DAS_REDUZIDO: das_efetivo,
      // IRPJ e CSLL só são pedidos pela matriz onde a base é PRESUNCAO (Lucro Presumido). A
      // efetiva é `valor_original ÷ rb_total`, a mesma forma do `rt_efetiva` abaixo.
      IRPJ: rb_total > 0 ? (Number(view.irpj_amount_original) || 0) / rb_total : 0,
      CSLL: rb_total > 0 ? (Number(view.csll_amount_original) || 0) / rb_total : 0,
    },
  })
  const limite_minimo = limiteMinimoDaOperacao({
    cp: cp_efetivo,
    mod,
    dop,
    somaInternos: _den.soma,
    rtPct: rt_efetiva,
  })
  const limite_incompleto = _den.semAliquota

  // ───── Cascade trace 17 etapas ─────
  const motorPartial: Omit<MotorOutput, 'cascade_trace'> = {
    rb: view.rb_total,
    desc_value: view.desc_value,
    rv: view.rv_total,
    ancora,
    icms,
    iss,
    pis_cofins,
    pis_cofins_aliquota_efetiva,
    das,
    imp_dentro_total,
    cp_efetivo,
    mod,
    dop,
    rro,
    rt_value,
    rt_efetiva,
    rro_status,
    limite_minimo,
    limite_incompleto,
  }

  const cascade_trace = buildCascadeTrace17({
    view,
    motor: motorPartial,
    // ADR-016: passa a alíquota TRANSMUTADA do PIS/COFINS (alíq_precif/(1−ICMS%−ISS%)),
    // para a cascata 13B exibir a % coerente com o valor preservado da precificação.
    rates: { icms: icms_rate, iss: iss_rate, pis_cofins: pis_cofins_aliquota_efetiva },
    // EPIC-DAS: o trace renderiza as etapas 7 e 13 a partir de uma COLEÇÃO cujo conteúdo
    // depende do regime — uma linha DAS em SN/MEI, os nós de sempre nos demais.
    regime: input.regime,
  })

  const motor: MotorOutput = { ...motorPartial, cascade_trace }
  return { motor, messages }
}

// ─────────────────────────── Helpers internos ───────────────────────────

/**
 * Resolve alíquota agregada de um tipo de tributo entre os rates disponíveis.
 * Soma quando há múltiplos registros (e.g. ICMS por origin/dest distintos).
 */
function resolveRate(rates: TaxRatePeriod[] | null | undefined, type: TaxType): number {
  if (!Array.isArray(rates)) return 0
  let acc = 0
  for (const r of rates) {
    if (r?.tax_type === type) {
      const v = Number(r.rate_pct)
      if (Number.isFinite(v) && v > 0) acc += v
    }
  }
  return acc
}
