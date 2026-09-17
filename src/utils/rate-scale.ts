/**
 * rate-scale.ts — a travessia entre PERCENTUAL e FRAÇÃO, num lugar só.
 *
 * >>> O DEFEITO QUE ORIGINOU ESTE MÓDULO <<<
 *
 * `buildItemTaxRatesFromProduct` devolve escalas MISTAS no MESMO objeto, e isso não é
 * descuido — é consequência de uma correção anterior, documentada nele:
 *
 *   `icms_pct` vem como **17** (percentual, direto da coluna);
 *   `pis_pct` e `cofins_pct`, quando derivados do agregado `pis_cofins_pct`, vêm como
 *   **0,0137** e **0,0631** (fração), porque o split proporcional em percentual produzia
 *   valores < 1 que o normalizador seguinte interpretava como fração.
 *
 * Quem consome esse objeto e aplica `÷ 100` em TODOS os campos acerta o ICMS e erra o
 * PIS/COFINS por um fator 100. Medido no ATeste1509: 9,25% virou **0,0925%**, o valor caiu de
 * R$ 2.565,73 para R$ 25,66, e o erro CASCATEOU — com o PIS quase zerado, a base do IBS/CBS
 * (P − ICMS − ISS − PIS/COFINS) inchou e o por fora veio R$ 232,87 maior.
 *
 * É `ausente-vs-falso.md` na UNIDADE: o número existe, está na escala errada, e nada acusa.
 * Um valor fora de escala não chega vazio nem levanta erro — ele chega, é usado, e sai cem
 * vezes menor.
 *
 * >>> A HEURÍSTICA É A DO REPOSITÓRIO, E TEM UM LIMITE QUE PRECISA ESTAR DITO <<<
 *
 * `n < 1 ? n : n / 100` é a convenção que o repositório já usa (citada em `item-tax-rates.ts`
 * como `normalizePct`). Ela não é perfeita: uma alíquota legítima de **0,5%** gravada como
 * `0.5` seria lida como 50%. O caso existe — IBS e CBS de transição são 0,10% e 0,90% —, e é
 * por isso que `buildItemTaxRatesFromProduct` documenta que IBS/CBS vêm SEMPRE em percentual
 * (`0.1`, `0.9`, `1`, `8.8`) e nunca em decimal.
 *
 * Por isso `normalizeRatePct` NÃO é aplicada indiscriminadamente: campos cuja escala é
 * conhecida usam `pctToFraction`, que é conversão pura. A heurística fica para os campos
 * onde a fonte é genuinamente ambígua — hoje, PIS e COFINS.
 */

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Percentual → fração. Conversão PURA, para campos de escala conhecida. */
export function pctToFraction(v: unknown): number {
  return num(v) / 100
}

/**
 * Fração ou percentual → fração, pela convenção do repositório.
 *
 * Use SOMENTE onde a fonte é ambígua — ver o limite no cabeçalho. Onde a escala é conhecida,
 * `pctToFraction` é o certo, porque não tem caso-limite.
 */
export function normalizeRatePct(v: unknown): number {
  const n = num(v)
  if (n === 0) return 0
  return Math.abs(n) < 1 ? n : n / 100
}

/**
 * PIS + COFINS do item, em FRAÇÃO, resolvendo a escala mista.
 *
 * Os dois campos vêm da mesma fonte e na mesma escala — ou ambos em percentual (colunas
 * `pis_pct`/`cofins_pct` preenchidas), ou ambos em fração (derivados do agregado). Por isso a
 * normalização é da SOMA e não de cada um: somar 1,53 com 6,1475 e normalizar dá 0,076775;
 * normalizar cada um antes daria 0,0153 + 0,061475, o mesmo número — mas se um deles fosse
 * menor que 1 por ser uma alíquota pequena, a decisão por campo divergiria da decisão pela
 * soma. Uma decisão só, sobre o valor que importa.
 */
export function pisCofinsFractionFromItem(pisPct: unknown, cofinsPct: unknown): number {
  return normalizeRatePct(num(pisPct) + num(cofinsPct))
}

/**
 * As ALÍQUOTAS LEGAIS sobre o LUCRO (R6), num lugar só.
 *
 * A construção as usa em `product-price.component.tsx` (`profitVal * 0.15`) e `tax-sync.ts`
 * as usa para derivar o `irpj_pct` do tenant. Duas cópias do mesmo número já existiam; esta é
 * a terceira que NÃO foi criada.
 *
 * >>> NÃO CONFUNDIR COM `mrmConfig.irpj_pct` <<<
 * Aquele campo JÁ É `% Lucro do TENANT × 15%` — um % Original sobre o total geral, não a
 * alíquota. Multiplicá-lo de novo pelo lucro do ITEM aplica o lucro duas vezes: foi o que fez
 * a decomposição exibir IRPJ de 1,80% onde a construção mostra 15,00%, com a razão 15/9
 * preservada e a magnitude não.
 */
export const IRPJ_RATE_ON_PROFIT = 0.15
export const CSLL_RATE_ON_PROFIT = 0.09
