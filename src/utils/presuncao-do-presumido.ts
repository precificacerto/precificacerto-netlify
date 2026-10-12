/**
 * A PRESUNÇÃO DO LUCRO PRESUMIDO — fonte ÚNICA, lida pela construção E pela decomposição.
 *
 * ESPEC VIII.4 e XIV.4: no Presumido, IRPJ e CSLL incidem sobre a RECEITA por presunção, não
 * sobre o lucro. Logo NÃO são resíduo — comportam-se como o ICMS, alíquota direta sobre a
 * âncora. A matriz já dizia isso por célula (`base: 'PRESUNCAO'`, `etapa: '13C'`); o que
 * faltava era o código ler a BASE, e não só a COLOCAÇÃO.
 *
 * ── POR QUE ESTE MÓDULO EXISTE: A CONTA ESTAVA ESCRITA DUAS VEZES ─────────────────────────
 *
 * Medido em 12/10/2026: `tax-sync.ts:236-263` e `calc-tax-preview.ts:246-270` traziam as
 * MESMAS vinte linhas — mesma precedência manual-sobre-tabela, mesmos `0.15`, `0.09`, `0.08`,
 * `0.12`, mesmo `240000`, mesmo `0.10`. Duas cópias de um mapeamento, e é `copia-divergente.md`
 * esperando a terceira: a decomposição seria ela.
 *
 * O remédio daquela regra não é conferir as duas, é apagar uma. Aqui as duas leem isto, e a
 * decomposição lê o MESMO — que é o que `regime-e-segmento-determinam-a-construcao.md` exige:
 * *"A construção lê a matriz. A decomposição lê A MESMA matriz."*
 *
 * ── O QUE ESTE MÓDULO NÃO DECIDE ──────────────────────────────────────────────────────────
 *
 * **Os percentuais de presunção.** Eles são DADO, não constante: vêm de
 * `lucro_presumido_rates`, consultada pela `lucro_presumido_activity` do tenant (`COMERCIO`,
 * `INDUSTRIA`, `SERVICOS_32`), com os manuais `lp_irpj_presumption_percent` /
 * `lp_csll_presumption_percent` tendo precedência sobre a tabela.
 *
 * É por isso que a decomposição **não infere 8/12 ou 32/32 do segmento**: ela recebe o que a
 * construção leu. Inferir pelo `calc_type` produziria 32% num tenant de serviço cuja atividade
 * cadastrada é `COMERCIO` — um número que a construção nunca usou, que é exatamente a violação
 * que `regime-e-segmento-determinam-a-construcao.md` cataloga. Os defaults abaixo são o
 * fallback de quando a tabela não responde, e ficam aqui só para não serem um terceiro literal.
 */

/** Alíquota legal do IRPJ sobre a base presumida. */
export const IRPJ_RATE = 0.15
/** Alíquota legal da CSLL sobre a base presumida. */
export const CSLL_RATE = 0.09
/** Alíquota do adicional de IRPJ sobre o que excede o limite. */
export const ADICIONAL_IRPJ_RATE = 0.10
/**
 * O limite ANUAL de isenção do adicional: R$ 20.000/mês × 12.
 *
 * >>> ELE É ANUAL, E ESTA É A RESSALVA QUE PRECISA ESTAR ESCRITA <<<
 *
 * O adicional é apurado sobre a RECEITA ANUAL ESTIMADA do tenant
 * (`tenant_settings.lp_estimated_annual_revenue`) e devolvido como uma ALÍQUOTA SOBRE RECEITA,
 * para que um documento qualquer possa carregar a sua parcela. Não há acumulador de receita
 * realizada: sem a estimativa cadastrada o adicional sai ZERO, e isso é o comportamento de
 * hoje, preservado — não uma decisão nova desta rodada.
 */
export const ADICIONAL_IRPJ_LIMITE_ANUAL = 240000

/** Default do percentual de presunção do IRPJ quando a tabela não responde. */
export const IRPJ_PRESUNCAO_DEFAULT = 0.08
/** Default do percentual de presunção da CSLL quando a tabela não responde. */
export const CSLL_PRESUNCAO_DEFAULT = 0.12

/**
 * As três alíquotas da presunção, TODAS sobre a receita, e o adicional SEPARADO.
 *
 * Separado porque a ESPEC VIII.4 pede linha própria para ele na 13C. Antes desta rodada ele
 * era somado dentro do IRPJ, com um `FUTURE WORK` dizendo exatamente isso em `tax-sync.ts`;
 * quem consome o agregado continua recebendo `irpjPct + adicionalPct` e não move um centavo.
 */
export interface PresuncaoSobreReceita {
  /** `presunção_irpj × alíquota_irpj` — sem o adicional. */
  irpjPct: number
  /** `presunção_csll × alíquota_csll`. */
  csllPct: number
  /** O adicional, já convertido em alíquota sobre a receita. ZERO sem receita estimada. */
  adicionalPct: number
}

export interface PresuncaoInput {
  /** `lp_irpj_presumption_percent` do tenant, ou o da tabela da atividade. */
  irpjPresuncaoPct?: number | null
  /** `lp_csll_presumption_percent` do tenant, ou o da tabela da atividade. */
  csllPresuncaoPct?: number | null
  /** `irpj_rate` da tabela. Ausente = a legal. */
  irpjRate?: number | null
  /** `csll_rate` da tabela. Ausente = a legal. */
  csllRate?: number | null
  /** `lp_estimated_annual_revenue`. Ausente ou zero = adicional ZERO. */
  receitaAnualEstimada?: number | null
}

const num = (v: unknown, fallback: number): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

/**
 * Converte a presunção em três alíquotas sobre a receita.
 *
 * O adicional é `max(0, receita × presunção − 240.000) × 10% ÷ receita`. A divisão pela receita
 * é o que o transforma de valor anual em alíquota — e é a forma que a construção já usava,
 * preservada bit a bit.
 */
export function presuncaoSobreReceita(input: PresuncaoInput): PresuncaoSobreReceita {
  const presIrpj = input.irpjPresuncaoPct != null
    ? num(input.irpjPresuncaoPct, IRPJ_PRESUNCAO_DEFAULT)
    : IRPJ_PRESUNCAO_DEFAULT
  const presCsll = input.csllPresuncaoPct != null
    ? num(input.csllPresuncaoPct, CSLL_PRESUNCAO_DEFAULT)
    : CSLL_PRESUNCAO_DEFAULT
  const aliqIrpj = input.irpjRate != null ? num(input.irpjRate, IRPJ_RATE) : IRPJ_RATE
  const aliqCsll = input.csllRate != null ? num(input.csllRate, CSLL_RATE) : CSLL_RATE

  const receitaAnual = Math.max(0, num(input.receitaAnualEstimada, 0))
  let adicionalPct = 0
  if (receitaAnual > 0) {
    const baseIrpj = receitaAnual * presIrpj
    const excedente = Math.max(0, baseIrpj - ADICIONAL_IRPJ_LIMITE_ANUAL)
    if (excedente > 0) adicionalPct = (excedente * ADICIONAL_IRPJ_RATE) / receitaAnual
  }

  return {
    irpjPct: presIrpj * aliqIrpj,
    csllPct: presCsll * aliqCsll,
    adicionalPct,
  }
}
