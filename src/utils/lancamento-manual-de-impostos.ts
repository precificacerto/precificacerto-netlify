/**
 * O payload do LANÇAMENTO MANUAL de impostos — o que ele substitui e o que preserva.
 *
 * ── Por que esta função é exportada ─────────────────────────────────────────
 *
 * Ela vivia inline no `handleConfirm` do modal, e por isso o comportamento dela
 * não tinha teste: duas mutações — o modal deixar de limpar as reduções, e o
 * modal apagar a classificação — passaram VERDES. `teste-que-nao-exercita.md`
 * responde o caso: *"quando a pergunta 3 não tem resposta boa porque a função não
 * é exportada, EXPORTE A FUNÇÃO"*.
 *
 * ── A DISTINÇÃO QUE A FUNÇÃO IMPLEMENTA ────────────────────────────────────
 *
 * ADR-022 D5: o lançamento manual é OVERRIDE EXPLÍCITO da ALÍQUOTA. O usuário
 * digita a efetiva final, e as ENTRADAS DA DERIVAÇÃO são zeradas para que o motor
 * use o valor digitado em vez de reduzi-lo outra vez.
 *
 * |                                | natureza            | o override      |
 * |--------------------------------|---------------------|-----------------|
 * | `ibs_reference_pct` / `cbs_`   | entrada de cálculo  | **zera**        |
 * | `iva_dual_reduction_factor`    | entrada de cálculo  | **zera**        |
 * | `iva_reduction_ibs_pct` / `cbs`| entrada de cálculo  | **zera**        |
 * | `cclass_trib` / `cst_ibs_cbs_code` | CLASSIFICAÇÃO   | **preserva**    |
 *
 * As duas reduções novas entram na primeira coluna pela MESMA razão que o fator
 * legado: deixá-las preenchidas faria `resolveReducoesDoItem` devolvê-las, e o
 * motor reduziria a alíquota que o usuário acabou de digitar como final — dupla
 * redução, número plausível, nada falhando.
 *
 * A classificação NÃO entra. Lançar imposto à mão não torna o item outra coisa:
 * `cclass_trib` diz a que dispositivo da LC 214/2025 ele se prende, e a NF-e o
 * EXIGE. Apagá-lo deixaria o cadastro sem o campo que a nota pede, para corrigir
 * um problema que não é dele — e `cclass_trib_origem` perderia o fato que registra.
 *
 * ── O ESTADO RESULTANTE É LEGÍTIMO E DISTINGUÍVEL ──────────────────────────
 *
 * Classificado, com as reduções em NULL. Não se confunde com o código MANUAL,
 * que também tem reduções NULL: `taxes_launched = true` é o sinal que os separa.
 * Dois estados, dois sinais — e é por isso que a migração `20260916000002` NÃO
 * amarrou as reduções ao cClassTrib por CHECK: a constraint proibiria este caso.
 */

export interface LancamentoManualInput {
  isPct: number
  isValue: number
  ibsPct: number
  ibsValue: number
  cbsPct: number
  cbsValue: number
  ipiPct: number
  ipiValue: number
  salePrice: number
  finalPrice: number
  /** Injetável para o teste; o modal passa `new Date().toISOString()`. */
  updatedAt: string
}

/**
 * Os campos que o override ZERA, porque são entrada da derivação.
 *
 * ── RESSALVA DE COBERTURA, registrada em vez de preenchida com caso inventado ──
 *
 * `ibs_reference_pct` e `cbs_reference_pct` estão nesta lista por continuidade com
 * o ADR-022 D5, e **nenhum caso deste repositório distingue a presença deles**:
 * a mutação que os tira da lista passa VERDE. A razão é medida — o ADENDO
 * PC-BUG-FATOR-REDUCAO-002 REVOGOU o D1/D2/D3, e desde então
 * `resolveIvaDualEffectiveRate` parte de `ibs_pct`/`cbs_pct`, não da referência.
 * Ela continua sendo LIDA (para semear o estado da tela, preferindo o snapshot do
 * item ao do tenant) e GRAVADA no save, mas não entra em conta nenhuma.
 *
 * Ficam na lista porque **tirá-las mudaria comportamento que não sei medir** —
 * a tela reabriria com a referência do tenant em vez da do item. Cobrir isso com
 * um caso montado seria escrever teste para provar que o teste existe
 * (`teste-que-nao-exercita.md`). Fica a ressalva, para quem for mexer saber que
 * aqui o verde não afirma nada.
 */
export const CAMPOS_ZERADOS_PELO_OVERRIDE = [
  'ibs_reference_pct',
  'cbs_reference_pct',
  'iva_dual_reduction_factor',
  'iva_reduction_ibs_pct',
  'iva_reduction_cbs_pct',
] as const

/** Os campos de CLASSIFICAÇÃO, que o override NÃO toca. */
export const CAMPOS_DE_CLASSIFICACAO_PRESERVADOS = [
  'cclass_trib',
  'cst_ibs_cbs_code',
  'cclass_trib_origem',
  'cclass_trib_source_published_at',
] as const

export function buildLancamentoManualPayload(
  input: LancamentoManualInput,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    is_pct: input.isPct,
    is_value: input.isValue,
    ibs_pct: input.ibsPct,
    ibs_value: input.ibsValue,
    cbs_pct: input.cbsPct,
    cbs_value: input.cbsValue,
    ipi_pct: input.ipiPct,
    ipi_value: input.ipiValue,
    sale_price_base: input.salePrice,
    sale_price_after_taxes: input.finalPrice,
    sale_price: input.finalPrice,
    // O sinal que distingue "classificado com override" de "código manual".
    taxes_launched: true,
    updated_at: input.updatedAt,
  }
  for (const campo of CAMPOS_ZERADOS_PELO_OVERRIDE) payload[campo] = null
  return payload
}
