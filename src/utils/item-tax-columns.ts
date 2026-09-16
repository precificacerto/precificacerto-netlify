/**
 * As colunas fiscais que o motor LÊ de um produto ou de um serviço.
 *
 * ── Por que isto é uma constante e não uma string na página ──────────────────
 *
 * As listas de colunas escritas à mão são a forma exata do #28 e do #45, e a
 * classe está catalogada em `copia-divergente.md`: *"o `select` que não pede o
 * que o mapeador lê não falha — o campo só chega vazio"*. Foi assim que o
 * `rt_pct` sumiu e o RT congelado virou o cadastro vivo, e foi assim que o
 * `destination_snapshot` sumiu na travessia para o pedido, em 6 de 6 pares.
 *
 * O remédio daquela página não é conferir as duas cópias — é APAGAR UMA. Estas
 * constantes são a cópia única: a página monta o `select` a partir daqui, e o
 * teste afirma o EFEITO de cada campo, projetando uma linha completa pela lista
 * e medindo o número que sai do outro lado.
 *
 * ── O que o teste afirma, e por que não é "o nome está no arquivo" ──────────
 *
 * Afirmar que `'iva_reduction_ibs_pct'` aparece na string prova que alguém
 * digitou o nome. O que interessa é outra coisa: com o campo fora da lista, a
 * alíquota efetiva de IBS sai CHEIA em vez de reduzida — um NÚMERO diferente,
 * plausível, e que ninguém vê. O teste projeta e compara o número.
 */

/**
 * Colunas fiscais de `products`.
 *
 * A ordem é irrelevante para o PostgREST; ela segue a da cascata para leitura.
 */
export const PRODUCT_TAX_COLUMNS = [
  'icms_pct',
  'pis_cofins_pct',
  'pis_pct',
  'cofins_pct',
  'iss_pct',
  'is_pct',
  'ipi_pct',
  'icms_st_pct',
  'difal_pct',
  'fcp_pct',
  'icms_st_active',
  'difal_active',
  'ibs_pct',
  'cbs_pct',
  'ibs_reference_pct',
  'cbs_reference_pct',
  // LEGADO. Continua na lista porque continua no banco e é o que a travessia
  // `resolveReducoesDoItem` lê quando as duas colunas novas estão vazias —
  // tirá-lo daqui faria o produto legado perder a redução em silêncio.
  'iva_dual_reduction_factor',
  // A CLASSIFICAÇÃO FISCAL e as duas reduções que DECORREM dela. Fora desta
  // lista chegam `undefined`, `resolveReducoesDoItem` cai no legado, e o item
  // classificado calcula com a redução ERRADA — sem erro, sem log.
  'cclass_trib',
  'cst_ibs_cbs_code',
  'iva_reduction_ibs_pct',
  'iva_reduction_cbs_pct',
  'iss_retido_pct',
  'irpj_pct',
  'csll_pct',
  'custom_tax_percent',
] as const

/**
 * Colunas fiscais de `services`.
 *
 * Difere da de produto no que o cadastro de serviço tem e o de produto não —
 * `taxable_regime_percent` no lugar de `custom_tax_percent`, e os acréscimos.
 * As colunas da classificação fiscal são AS MESMAS: serviço recebeu as seis na
 * mesma migração, e deixá-lo de fora aqui refaria a metade de travessia que a
 * migração evitou.
 */
export const SERVICE_TAX_COLUMNS = [
  'icms_pct',
  'pis_cofins_pct',
  'pis_pct',
  'cofins_pct',
  'iss_pct',
  'is_pct',
  'ipi_pct',
  'ibs_pct',
  'cbs_pct',
  'ibs_reference_pct',
  'cbs_reference_pct',
  'iva_dual_reduction_factor',
  'cclass_trib',
  'cst_ibs_cbs_code',
  'iva_reduction_ibs_pct',
  'iva_reduction_cbs_pct',
  'iss_retido_pct',
  'irpj_pct',
  'csll_pct',
  'taxable_regime_percent',
  'sale_price_base',
  'freight_value',
  'insurance_value',
  'accessory_expenses_value',
] as const

/** As mesmas listas no formato que o `.select()` do Supabase espera. */
export const PRODUCT_TAX_SELECT = PRODUCT_TAX_COLUMNS.join(', ')
export const SERVICE_TAX_SELECT = SERVICE_TAX_COLUMNS.join(', ')

/**
 * Projeta uma linha pelo recorte que o `select` traria — mantendo SÓ as colunas
 * da lista. É o que o PostgREST faz, e é o que o teste precisa para medir o
 * efeito de uma coluna ausente sem ir ao banco.
 */
export function projetarPelasColunas<T extends Record<string, unknown>>(
  linha: T,
  colunas: readonly string[],
): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const c of colunas) {
    if (c in linha) out[c] = linha[c]
  }
  return out as Partial<T>
}
