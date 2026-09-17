/**
 * A alíquota de PIS/COFINS que o NCM determina — a CONTA, separada do componente.
 *
 * Por que exportada. `teste-que-nao-exercita.md` manda perguntar se a asserção olha o EFEITO
 * ou o caminho, e responde o caso em que a resposta é ruim porque a função é interna:
 * *"quando a pergunta 3 não tem resposta boa porque a função não é exportada, EXPORTE A
 * FUNÇÃO"*. O efeito que interessa aqui é o NÚMERO que aparece no campo depois de escolher
 * um NCM — não o fato de o handler existir, nem de o campo estar no JSX.
 *
 * As duas metades vêm do REGIME, e a razão é a matriz de
 * `regime-e-segmento-determinam-a-construcao.md` — a decomposição não infere, lê:
 *
 *  - LUCRO REAL — regime NÃO CUMULATIVO: a alíquota é a do próprio NCM (PIS + COFINS), lida
 *    da tabela `ncm_codes`. Quem determina é o código fiscal do produto, não uma constante.
 *
 *  - LUCRO PRESUMIDO — regime CUMULATIVO: 3,65% (0,65% de PIS + 3,00% de COFINS), Lei
 *    9.718/1998, arts. 4º e 8º. O NCM não decide nada neste regime; o que entra na conta é o
 *    ICMS, porque a base de PIS/COFINS exclui o ICMS — é a exceção da R5 em
 *    `cascata-lucro-real.md`: `efetivada = nominal × (1 − ICMS)`.
 *
 *  - Fora dos dois regimes NÃO HÁ O QUE RESOLVER, e a função devolve `null`.
 *    `null` NÃO é zero (`ausente-vs-falso.md`): zero afirmaria "a alíquota é nada", e o
 *    chamador gravaria essa afirmação; `null` diz "não se apura por aqui" e o campo fica
 *    como está.
 */

/** 0,65% de PIS + 3,00% de COFINS — Lei 9.718/1998, arts. 4º e 8º (regime cumulativo). */
export const PIS_COFINS_CUMULATIVO_PCT = 3.65

export interface NcmPisCofinsRow {
  /** Fração, como a coluna de `ncm_codes` guarda: 0,0165 é 1,65%. */
  pis_rate_nao_cumulativo?: number | string | null
  /** Fração, como a coluna de `ncm_codes` guarda: 0,076 é 7,60%. */
  cofins_rate_nao_cumulativo?: number | string | null
}

export interface ResolvePisCofinsArgs {
  isLucroReal: boolean
  isLucroPresumido: boolean
  /** Percentual inteiro, como a tela usa: 17 é 17%. */
  icmsPct: number
  /** A linha de `ncm_codes`; `null` quando a consulta não devolveu nada. */
  ncmRow: NcmPisCofinsRow | null
}

/**
 * Devolve o percentual de PIS/COFINS em unidade de TELA (percentual inteiro: 9.25 é 9,25%),
 * ou `null` quando o regime não apura por este caminho ou o NCM não trouxe linha.
 */
export function resolvePisCofinsPctFromNcm(args: ResolvePisCofinsArgs): number | null {
  const { isLucroReal, isLucroPresumido, icmsPct, ncmRow } = args

  // A ordem importa: o Presumido não consulta o NCM, então responde antes de exigir a linha.
  if (isLucroPresumido) {
    return parseFloat((PIS_COFINS_CUMULATIVO_PCT * (1 - icmsPct / 100)).toFixed(4))
  }

  if (!isLucroReal) return null
  if (!ncmRow) return null

  const pis = (Number(ncmRow.pis_rate_nao_cumulativo) || 0) * 100
  const cofins = (Number(ncmRow.cofins_rate_nao_cumulativo) || 0) * 100
  return parseFloat((pis + cofins).toFixed(4))
}
