/**
 * mrm-engine-v17/cascade-trace.ts — Builder das 17 etapas PDF
 *
 * EPIC-MRM-V17 (2026-05-28)
 * Constrói a representação visual da cascata em 17 etapas conforme PDF oficial,
 * estendendo as 13 etapas do motor V16. Compatível com componente UI
 * `ConsolidatedDREBlock` (renderiza N steps + children).
 *
 * Mapeamento 13 V16 → 17 V17 documentado em:
 *   docs/architecture/cascade-mapping-13-to-17.md
 */

import type { CascadeStep, ConsolidatedView, MotorOutput } from '@/types/mrm'

interface BuildCascadeInput {
  view: ConsolidatedView
  motor: Omit<MotorOutput, 'cascade_trace'>
  rates: { icms: number; iss: number; pis_cofins: number }
}

/**
 * Constrói as 17 etapas da cascata V17 conforme PDF.
 *
 * Etapas:
 *   1. Fragmentação individual (items_count)
 *   2. Construção matemática individual (rb_total)
 *   3. Agrupamento por categorias (soma componentes)
 *   4. Consolidação custos (cp_total)
 *   5. Consolidação despesas (mod + dop)
 *   6. Consolidação margens (commission + profit + IRPJ + CSLL originais)
 *   7. Formação Op Interna (ancora_interna pré-desconto = rb × peso)
 *   8. Formação Op Externa (informacional — base canônica)
 *   9. Formação venda consolidada (rb_total)
 *   10. Cálculo pesos estruturais (peso_interno/externo)
 *   11. Aplicação desconto (desc_value)
 *   12. Redistribuição proporcional (ancora pós-desconto)
 *   13. Cascata tributária ICMS → ISS → PIS/COFINS
 *   14. Cascata custos e despesas (-CP, -MOD, -DOP)
 *   15. RRO
 *   16. Redistribuição RRO (placeholder — preenchido pela Camada 2)
 *   17. Consolidação final (placeholder — preenchido pela Camada 2)
 */
export function buildCascadeTrace17(input: BuildCascadeInput): CascadeStep[] {
  const { view, motor } = input
  const peso_externo = 1 - view.peso_op_interna_ponderado

  return [
    // 1. Fragmentação individual
    {
      step: 1,
      label: 'Fragmentação individual dos produtos',
      base: null,
      rate: null,
      amount: view.items_count,
      formula: `${view.items_count} item(s) consolidado(s)`,
      source: 'INPUT',
    },
    // 2. Construção matemática individual
    {
      step: 2,
      label: 'Construção matemática individual',
      base: null,
      rate: null,
      amount: view.rb_total,
      formula: 'Σ unit_price × quantity de cada item',
      source: 'ITEMS',
    },
    // 3. Agrupamento por categorias equivalentes
    {
      step: 3,
      label: 'Agrupamento por categorias',
      base: null,
      rate: null,
      amount: view.rb_total,
      formula: 'Soma por categoria (custos, despesas, margens, tributos)',
      source: 'CONSOLIDADO',
    },
    // 4. Consolidação custos
    {
      step: 4,
      label: 'Consolidação dos custos',
      base: null,
      rate: null,
      amount: view.cp_total,
      formula: 'Σ custos individuais (CMV canônico V9-I5)',
      source: 'ITEMS',
    },
    // 5. Consolidação despesas (4 buckets + MOD)
    {
      step: 5,
      label: 'Consolidação das despesas operacionais',
      base: null,
      rate: null,
      amount: view.mod_total + view.dop_total,
      formula: 'MOD + Σ(MO Admin + DF + DV + DFin)',
      source: 'ITEMS',
      children: view.expense_breakdown_total
        ? [
            {
              step: 5,
              label: 'MO Administrativa',
              base: null,
              rate: null,
              amount: view.expense_breakdown_total.mo_admin,
              formula: 'Σ snapshots V14',
              source: 'PRODUTO',
            },
            {
              step: 5,
              label: 'Despesa Fixa',
              base: null,
              rate: null,
              amount: view.expense_breakdown_total.fixa,
              formula: 'Σ snapshots V14',
              source: 'PRODUTO',
            },
            {
              step: 5,
              label: 'Despesa Variável',
              base: null,
              rate: null,
              amount: view.expense_breakdown_total.variavel,
              formula: 'Σ snapshots V14',
              source: 'PRODUTO',
            },
            {
              step: 5,
              label: 'Despesa Financeira',
              base: null,
              rate: null,
              amount: view.expense_breakdown_total.financeira,
              formula: 'Σ snapshots V14',
              source: 'PRODUTO',
            },
          ]
        : undefined,
    },
    // 6. Consolidação margens (4 componentes em R$ original)
    {
      step: 6,
      label: 'Consolidação das margens',
      base: null,
      rate: null,
      amount:
        view.commission_amount_original +
        view.profit_amount_original +
        view.csll_amount_original +
        view.irpj_amount_original,
      formula: 'Σ Comissão + Lucro + IRPJ + CSLL (R$ pré-desconto)',
      source: 'ITEMS',
      children: [
        {
          step: 6,
          label: 'Comissão',
          base: null,
          rate: null,
          amount: view.commission_amount_original,
          formula: 'Σ rb × commission_pct',
          source: 'ITEMS',
          peso: view.peso_comissao_original,
        },
        {
          step: 6,
          label: 'Lucro',
          base: null,
          rate: null,
          amount: view.profit_amount_original,
          formula: 'Σ rb × profit_pct',
          source: 'ITEMS',
          peso: view.peso_lucro_original,
        },
        {
          step: 6,
          label: 'IRPJ',
          base: null,
          rate: null,
          amount: view.irpj_amount_original,
          formula: 'Σ rb × irpj_pct',
          source: 'ITEMS',
          peso: view.peso_irpj_original,
        },
        {
          step: 6,
          label: 'CSLL',
          base: null,
          rate: null,
          amount: view.csll_amount_original,
          formula: 'Σ rb × csll_pct',
          source: 'ITEMS',
          peso: view.peso_csll_original,
        },
      ],
    },
    // 7. Formação Op Interna (pré-desconto)
    {
      step: 7,
      label: 'Formação Op Interna',
      base: view.rb_total,
      rate: view.peso_op_interna_ponderado,
      amount: view.rb_total * view.peso_op_interna_ponderado,
      formula: 'rb_total × peso_op_interna_ponderado',
      source: 'CONSOLIDADO',
    },
    // 8. Formação Op Externa (informacional)
    {
      step: 8,
      label: 'Formação Op Externa',
      base: view.rb_total,
      rate: peso_externo,
      amount: view.rb_total * peso_externo,
      formula: 'rb_total × (1 − peso_op_interna)',
      source: 'CONSOLIDADO',
    },
    // 9. Formação venda consolidada
    {
      step: 9,
      label: 'Venda consolidada',
      base: null,
      rate: null,
      amount: view.rb_total,
      formula: 'Op Interna + Op Externa',
      source: 'ETAPA_7+8',
    },
    // 10. Cálculo pesos estruturais
    {
      step: 10,
      label: 'Pesos estruturais',
      base: null,
      rate: null,
      amount: 1,
      formula: 'peso_interno + peso_externo = 1',
      source: 'CONSOLIDADO',
      children: [
        {
          step: 10,
          label: 'Peso Op Interna',
          base: null,
          rate: view.peso_op_interna_ponderado,
          amount: view.peso_op_interna_ponderado,
          formula: 'Σ(rb_i × peso_i) / Σ rb_i',
          source: 'PONDERADO',
          peso: view.peso_op_interna_ponderado,
        },
        {
          step: 10,
          label: 'Peso Op Externa',
          base: null,
          rate: peso_externo,
          amount: peso_externo,
          formula: '1 − peso_op_interna',
          source: 'PONDERADO',
          peso: peso_externo,
        },
      ],
    },
    // 11. Aplicação do desconto
    {
      step: 11,
      label: 'Aplicação do desconto',
      base: view.rb_total,
      rate: view.rb_total > 0 ? view.desc_value / view.rb_total : 0,
      amount: -view.desc_value,
      formula: 'rb_total × desconto_pct',
      source: 'INPUT',
    },
    // 12. Redistribuição proporcional (= Âncora pós-desconto)
    {
      step: 12,
      label: 'Âncora Interna (PÓS-desconto)',
      base: view.rv_total,
      rate: view.peso_op_interna_ponderado,
      amount: view.ancora_interna,
      formula: 'rv_total × peso_op_interna_ponderado',
      source: 'ETAPA_9+11',
    },
    // 13. Cascata tributária — ADR-016 (2026-05-29): segregada em 13A (impostos
    //     sobre faturamento: ICMS + ISS) e 13B (PIS/COFINS sobre o resultado de 13A).
    {
      step: 13,
      label: 'Cascata tributária (13A Faturamento → 13B PIS/COFINS)',
      base: motor.ancora,
      rate: null,
      amount: -motor.imp_dentro_total,
      formula: '13A: ICMS+ISS sobre faturamento; 13B: PIS/COFINS sobre (Âncora − ICMS − ISS)',
      source: 'ETAPA_12',
      children: [
        {
          step: 13,
          label: '13A · ICMS',
          base: motor.ancora,
          // Alíquota efetiva real consolidada dos produtos = motor.icms / motor.ancora
          rate: motor.ancora > 0 ? motor.icms / motor.ancora : input.rates.icms,
          amount: -motor.icms,
          formula: 'ancora × icms_efetiva (consolidada dos produtos)',
          source: 'ETAPA_12',
        },
        {
          step: 13,
          label: '13A · ISS',
          base: motor.ancora - motor.icms,
          // Alíquota efetiva real = motor.iss / (ancora − icms)
          rate: (motor.ancora - motor.icms) > 0
            ? motor.iss / (motor.ancora - motor.icms)
            : input.rates.iss,
          amount: -motor.iss,
          formula: '(ancora − icms) × iss_efetiva',
          source: 'ETAPA_13.ICMS',
        },
        {
          step: 13,
          // Linha-âncora obrigatória (documento Founder): base oficial do 13B.
          label: '= Resultado após ICMS e ISS',
          base: motor.ancora,
          rate: null,
          amount: motor.ancora - motor.icms - motor.iss,
          formula: 'Âncora − ICMS − ISS (base oficial do PIS/COFINS)',
          source: 'ETAPA_13A',
        },
        {
          step: 13,
          label: '13B · PIS/COFINS',
          base: motor.ancora - motor.icms - motor.iss,
          // ADR-016: alíquota EFETIVA consolidada vinda do motor (Σ PIS/COFINS ÷ Op
          // Interna consolidada), exibida DIRETO — não recomposta. valor = base × alíquota.
          rate: input.rates.pis_cofins,
          amount: -motor.pis_cofins,
          formula: '(Âncora − ICMS − ISS) × pis_cofins_efetiva (Σ produtos ÷ Op Interna)',
          source: 'ETAPA_13A',
        },
      ],
    },
    // 14. Cascata custos e despesas
    {
      step: 14,
      label: 'Redução de custos e despesas',
      base: motor.ancora - motor.imp_dentro_total,
      rate: null,
      amount: -(motor.cp_efetivo + motor.mod + motor.dop),
      formula: '-CP_efetivo - MOD - DOP (V16.3 imutáveis a desconto)',
      source: 'ETAPA_13',
      children: [
        {
          step: 14,
          label: 'Custos (CMV efetivo)',
          base: null,
          rate: null,
          amount: -motor.cp_efetivo,
          formula: 'cp_total − tax_credits.recoverable',
          source: 'CONSOLIDADO',
        },
        {
          step: 14,
          label: 'Mão de Obra Produtiva (MOD)',
          base: null,
          rate: null,
          amount: -motor.mod,
          formula: 'Σ(rb_i × mod_pct_i) — imune R6',
          source: 'CONSOLIDADO',
        },
        {
          step: 14,
          label: 'Despesas Operacionais (DOP)',
          base: null,
          rate: null,
          amount: -motor.dop,
          formula: 'Σ(rb_i × dop_pct_i) ou snapshot V14',
          source: 'CONSOLIDADO',
        },
      ],
    },
    // 15. RRO
    {
      step: 15,
      label: 'Resultado Residual Operacional (RRO)',
      base: motor.ancora - motor.imp_dentro_total - motor.cp_efetivo - motor.mod - motor.dop,
      rate: null,
      amount: motor.rro,
      formula: 'ancora − imp_dentro − cp_efetivo − mod − dop',
      source: 'ETAPA_14',
    },
    // 16. Redistribuição RRO (placeholder)
    {
      step: 16,
      label: 'Redistribuição RRO (Comissão + Lucro + IRPJ + CSLL)',
      base: motor.rro,
      rate: null,
      amount: motor.rro,
      formula: 'Aplicada por Camada 2 (RRO_PROPORTIONAL ou COMMISSION_PROTECTED)',
      source: 'ETAPA_15',
    },
    // 17. Consolidação final (placeholder)
    {
      step: 17,
      label: 'Consolidação final da operação',
      base: null,
      rate: null,
      amount: 0,
      formula: 'Op Interna + Tributos por fora (preenchido pela Camada 2)',
      source: 'ETAPA_16',
    },
  ]
}
