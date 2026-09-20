/**
 * simples-anexos.ts — a FONTE ÚNICA da repartição do DAS (LC 123/2006, Anexos I a V).
 *
 * POR QUE ESTE ARQUIVO EXISTE, E POR QUE ELE NÃO LÊ O BANCO
 * ---------------------------------------------------------
 * A tabela `simples_nacional_brackets` já existe no banco, com as mesmas oito colunas de
 * repartição. Ela NÃO serve de fonte para o híbrido, e a razão é medida, não estilística —
 * 19/09/2026, consulta às 30 faixas:
 *
 *   | anexo | faixas | soma da repartição            |
 *   |-------|--------|-------------------------------|
 *   | I     |      6 | 99,50% · 101,50% · 99,65%     |
 *   | II    |      6 | 98,50% · 101,00%              |
 *   | III   |      6 | 100,00% em todas              |
 *   | IV    |      6 | 100,00% em todas              |
 *   | V     |      6 | 100,00% em todas              |
 *
 * **12 das 30 faixas não somam 100%**, e as diferenças caem justamente nos tributos que o
 * híbrido usa: no Anexo II faixa 1 o banco traz PIS+COFINS de 15,00% e IPI de 5,00%, onde a
 * LC 123 diz 14,00% e 7,50%. Um DAS híbrido calculado sobre a linha do banco sairia a
 * 3,825% em vez de 3,87% — PLAUSÍVEL, e errado. É `ausente-vs-falso.md` em forma de dado de
 * referência: o número está lá, então ninguém pergunta de onde veio.
 *
 * A TABELA DO BANCO CONTINUA SENDO A FONTE DO SIMPLES UNIFICADO, e isso é deliberado: trocá-la
 * mudaria a alíquota dos tenants que já operam nele, o que a regra 10 do comando proíbe
 * expressamente. As duas fontes coexistindo são uma `copia-divergente.md` conhecida, e a
 * unificação é rodada própria — está registrada como pendência no PR que trouxe este arquivo.
 *
 * O QUE ESTA TABELA É, E O QUE ELA NÃO É
 * ---------------------------------------
 * Ela é a repartição LEGAL, fato externo publicado — o mesmo estatuto da lista de faixas do
 * fator de redução do IVA Dual. Por isso a razão vai CITADA aqui, no ponto de declaração, e
 * não só no commit: `razao-longe-da-restricao.md` nasceu exatamente de uma lista de sete
 * valores sem uma palavra dizendo de onde vinham.
 *
 * Ela NÃO decide alíquota de tributo nenhum por fora, nem base — decide só o FORMATO: quanto
 * do DAS é de cada tributo, e portanto quanto sai dele em cada ano da transição.
 */

export type AnexoSimples = 'I' | 'II' | 'III' | 'IV' | 'V'

/**
 * A repartição de uma faixa, em frações que somam 1. São as oito parcelas da LC 123 — e a
 * soma ser exatamente 1 é afirmada em teste, não apenas pretendida aqui.
 */
export interface RepartSimples {
  irpj: number
  csll: number
  cpp: number
  pis: number
  cofins: number
  icms: number
  iss: number
  ipi: number
}

export interface FaixaSimples {
  /** 1 a 6. */
  faixa: number
  /** Teto do RBT12 da faixa, em R$. A última é `Infinity`. */
  rbt12Max: number
  /** Alíquota nominal da faixa, em fração. */
  nominal: number
  /** Parcela a deduzir, em R$. */
  deducao: number
  repart: RepartSimples
}

const r = (
  irpj: number, csll: number, cpp: number, pis: number, cofins: number,
  icms: number, iss: number, ipi: number,
): RepartSimples => ({ irpj, csll, cpp, pis, cofins, icms, iss, ipi })

/**
 * LC 123/2006, Anexos I a V, na redação da LC 155/2016 — as seis faixas de cada anexo, com
 * a repartição de cada uma. Fonte externa: a lei. Alterá-la exige a lei nova, não uma
 * decisão de produto.
 *
 * Convenção: tudo em FRAÇÃO, menos `deducao`, que é R$. O Anexo IV não tem CPP na
 * repartição (a contribuição é recolhida à parte) — o zero ali é a lei, não campo vazio.
 */
export const SIMPLES_ANEXOS: Record<AnexoSimples, FaixaSimples[]> = {
  I: [
    { faixa: 1, rbt12Max: 180_000, nominal: 0.0400, deducao: 0, repart: r(0.0550, 0.0350, 0.4150, 0.0276, 0.1274, 0.3400, 0, 0) },
    { faixa: 2, rbt12Max: 360_000, nominal: 0.0730, deducao: 5_940, repart: r(0.0550, 0.0350, 0.4150, 0.0276, 0.1274, 0.3400, 0, 0) },
    { faixa: 3, rbt12Max: 720_000, nominal: 0.0950, deducao: 13_860, repart: r(0.0550, 0.0350, 0.4200, 0.0276, 0.1274, 0.3350, 0, 0) },
    { faixa: 4, rbt12Max: 1_800_000, nominal: 0.1070, deducao: 22_500, repart: r(0.0550, 0.0350, 0.4200, 0.0276, 0.1274, 0.3350, 0, 0) },
    { faixa: 5, rbt12Max: 3_600_000, nominal: 0.1430, deducao: 87_300, repart: r(0.0550, 0.0350, 0.4200, 0.0276, 0.1274, 0.3350, 0, 0) },
    // Faixa 6: acima do sublimite, ICMS e ISS são recolhidos FORA do DAS — o zero é a lei.
    { faixa: 6, rbt12Max: Infinity, nominal: 0.1900, deducao: 378_000, repart: r(0.1350, 0.1000, 0.4210, 0.0613, 0.2827, 0, 0, 0) },
  ],
  II: [
    { faixa: 1, rbt12Max: 180_000, nominal: 0.0450, deducao: 0, repart: r(0.0550, 0.0350, 0.3750, 0.0249, 0.1151, 0.3200, 0, 0.0750) },
    { faixa: 2, rbt12Max: 360_000, nominal: 0.0780, deducao: 5_940, repart: r(0.0550, 0.0350, 0.3750, 0.0249, 0.1151, 0.3200, 0, 0.0750) },
    { faixa: 3, rbt12Max: 720_000, nominal: 0.1000, deducao: 13_860, repart: r(0.0550, 0.0350, 0.3750, 0.0249, 0.1151, 0.3200, 0, 0.0750) },
    { faixa: 4, rbt12Max: 1_800_000, nominal: 0.1120, deducao: 22_500, repart: r(0.0550, 0.0350, 0.3750, 0.0249, 0.1151, 0.3200, 0, 0.0750) },
    { faixa: 5, rbt12Max: 3_600_000, nominal: 0.1470, deducao: 85_500, repart: r(0.0550, 0.0350, 0.3750, 0.0249, 0.1151, 0.3200, 0, 0.0750) },
    { faixa: 6, rbt12Max: Infinity, nominal: 0.3000, deducao: 720_000, repart: r(0.0850, 0.0750, 0.2350, 0.0454, 0.2096, 0, 0, 0.3500) },
  ],
  III: [
    { faixa: 1, rbt12Max: 180_000, nominal: 0.0600, deducao: 0, repart: r(0.0400, 0.0350, 0.4340, 0.0278, 0.1282, 0, 0.3350, 0) },
    { faixa: 2, rbt12Max: 360_000, nominal: 0.1120, deducao: 9_360, repart: r(0.0400, 0.0350, 0.4340, 0.0305, 0.1405, 0, 0.3200, 0) },
    { faixa: 3, rbt12Max: 720_000, nominal: 0.1350, deducao: 17_640, repart: r(0.0400, 0.0350, 0.4340, 0.0296, 0.1364, 0, 0.3250, 0) },
    { faixa: 4, rbt12Max: 1_800_000, nominal: 0.1600, deducao: 35_640, repart: r(0.0400, 0.0350, 0.4340, 0.0296, 0.1364, 0, 0.3250, 0) },
    { faixa: 5, rbt12Max: 3_600_000, nominal: 0.2100, deducao: 125_640, repart: r(0.0400, 0.0350, 0.4340, 0.0278, 0.1282, 0, 0.3350, 0) },
    { faixa: 6, rbt12Max: Infinity, nominal: 0.3300, deducao: 648_000, repart: r(0.3500, 0.1500, 0.3050, 0.0347, 0.1603, 0, 0, 0) },
  ],
  // Anexo IV: a CPP NÃO entra na repartição — é recolhida à parte (LC 123 art. 18 §5º-C).
  // O zero ali é a lei, não campo vazio.
  IV: [
    { faixa: 1, rbt12Max: 180_000, nominal: 0.0450, deducao: 0, repart: r(0.1880, 0.1520, 0, 0.0383, 0.1767, 0, 0.4450, 0) },
    { faixa: 2, rbt12Max: 360_000, nominal: 0.0900, deducao: 8_100, repart: r(0.1980, 0.1520, 0, 0.0445, 0.2055, 0, 0.4000, 0) },
    { faixa: 3, rbt12Max: 720_000, nominal: 0.1020, deducao: 12_420, repart: r(0.2080, 0.1520, 0, 0.0427, 0.1973, 0, 0.4000, 0) },
    { faixa: 4, rbt12Max: 1_800_000, nominal: 0.1400, deducao: 39_780, repart: r(0.1780, 0.1920, 0, 0.0410, 0.1890, 0, 0.4000, 0) },
    { faixa: 5, rbt12Max: 3_600_000, nominal: 0.2200, deducao: 183_780, repart: r(0.1880, 0.1920, 0, 0.0392, 0.1808, 0, 0.4000, 0) },
    { faixa: 6, rbt12Max: Infinity, nominal: 0.3300, deducao: 828_000, repart: r(0.5350, 0.2150, 0, 0.0445, 0.2055, 0, 0, 0) },
  ],
  V: [
    { faixa: 1, rbt12Max: 180_000, nominal: 0.1550, deducao: 0, repart: r(0.2500, 0.1500, 0.2885, 0.0305, 0.1410, 0, 0.1400, 0) },
    { faixa: 2, rbt12Max: 360_000, nominal: 0.1800, deducao: 4_500, repart: r(0.2300, 0.1500, 0.2785, 0.0305, 0.1410, 0, 0.1700, 0) },
    { faixa: 3, rbt12Max: 720_000, nominal: 0.1950, deducao: 9_900, repart: r(0.2400, 0.1500, 0.2385, 0.0323, 0.1492, 0, 0.1900, 0) },
    { faixa: 4, rbt12Max: 1_800_000, nominal: 0.2050, deducao: 17_100, repart: r(0.2100, 0.1500, 0.2385, 0.0341, 0.1574, 0, 0.2100, 0) },
    { faixa: 5, rbt12Max: 3_600_000, nominal: 0.2300, deducao: 62_100, repart: r(0.2300, 0.1250, 0.2385, 0.0305, 0.1410, 0, 0.2350, 0) },
    { faixa: 6, rbt12Max: Infinity, nominal: 0.3050, deducao: 540_000, repart: r(0.3500, 0.1550, 0.2950, 0.0356, 0.1644, 0, 0, 0) },
  ],
}

/** Aceita `ANEXO_III` e `III`; qualquer outra coisa é erro, não default silencioso. */
export function normalizeAnexoSimples(raw: unknown): AnexoSimples | null {
  const up = String(raw ?? '').trim().toUpperCase().replace(/^ANEXO[_ -]?/i, '')
  return up === 'I' || up === 'II' || up === 'III' || up === 'IV' || up === 'V' ? up : null
}

/**
 * A faixa do RBT12. Acima do teto da 5ª, a 6ª — que é o que a lei manda, porque o
 * sublimite é questão de ICMS/ISS, não de faixa.
 */
export function faixaDoRbt12(anexo: AnexoSimples, rbt12: number): FaixaSimples {
  const faixas = SIMPLES_ANEXOS[anexo]
  const v = Number(rbt12)
  const achada = faixas.find((f) => Number.isFinite(v) && v > 0 && v <= f.rbt12Max)
  // RBT12 ausente ou zero é EMPRESA NOVA: a lei manda usar a primeira faixa, e isso é
  // decisão da lei, não default nosso.
  return achada ?? faixas[0]
}

/** `(RBT12 × nominal − dedução) ÷ RBT12`. Sem RBT12, a nominal da faixa 1. */
export function aliquotaEfetivaSimples(anexo: AnexoSimples, rbt12: number): number {
  const f = faixaDoRbt12(anexo, rbt12)
  const v = Number(rbt12)
  if (!Number.isFinite(v) || v <= 0) return f.nominal
  return (v * f.nominal - f.deducao) / v
}

/**
 * A FRAÇÃO DO ICMS/ISS que já migrou para o IBS naquele ano — o cronograma da regra 2 do
 * comando, que é o da LC 214 para o optante do Simples.
 *
 * Antes de 2027 não há híbrido: nada saiu do DAS, e a resposta é zero nos dois sentidos.
 */
function fracaoIcmsIssMigrada(ano: number): number {
  const a = Number(ano)
  if (!Number.isFinite(a) || a < 2029) return 0
  if (a >= 2033) return 1
  // 2029 → 10%, 2030 → 20%, 2031 → 30%, 2032 → 40%.
  return (a - 2028) * 0.10
}

/** PIS e COFINS saem do DAS a partir de 2027 — os dois de uma vez, sem transição. */
function pisCofinsSaiu(ano: number): boolean {
  return Number(ano) >= 2027
}

/**
 * DAS DO HÍBRIDO = alíquota efetiva × (1 − parcelas substituídas naquele ano).
 *
 * O que sai do DAS é o que passou a ser apurado por fora. **O IPI NUNCA SAI** (regra 6 do
 * comando): no Simples ele está dentro do DAS do Anexo II e não há IPI por fora — por isso
 * ele não aparece nesta subtração, e aparece na dedução da base logo abaixo.
 */
export function dasHibridoPct(anexo: AnexoSimples, rbt12: number, ano: number): number {
  const f = faixaDoRbt12(anexo, rbt12)
  const efetiva = aliquotaEfetivaSimples(anexo, rbt12)
  const { pis, cofins, icms, iss } = f.repart
  const substituidas = (pisCofinsSaiu(ano) ? pis + cofins : 0)
    + fracaoIcmsIssMigrada(ano) * (icms + iss)
  return efetiva * (1 - substituidas)
}

/**
 * A DEDUÇÃO DA BASE DE IBS/CBS — LC 214 art. 12 §2º V.
 *
 * Não integra a base o "montante incidente na operação" de ICMS, ISS, PIS e COFINS. Para o
 * optante, esse montante é a parcela desses tributos CONTIDA NO DAS — e só a parcela que
 * AINDA está lá: o que já migrou para o IBS não se deduz duas vezes.
 *
 * PIS e COFINS somem da dedução junto com a saída deles do DAS, pelo mesmo motivo.
 * **IRPJ, CSLL e CPP do DAS FICAM na base** — a lei não os lista, e incluí-los seria deduzir
 * o que a norma não manda deduzir.
 */
export function deducaoBaseIbsCbsPct(anexo: AnexoSimples, rbt12: number, ano: number): number {
  const f = faixaDoRbt12(anexo, rbt12)
  const efetiva = aliquotaEfetivaSimples(anexo, rbt12)
  const { pis, cofins, icms, iss, ipi } = f.repart
  const aindaNoDas = (1 - fracaoIcmsIssMigrada(ano)) * (icms + iss)
    + ipi
    + (pisCofinsSaiu(ano) ? 0 : pis + cofins)
  return efetiva * aindaNoDas
}
