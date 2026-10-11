/**
 * AS DECISÕES QUE O REGIME GOVERNA — exaustivas sobre `TaxRegime`.
 *
 * Criado no passo XI-3.5 FASE B, em 11/10/2026, por exigência do dono do produto.
 *
 * ══ O PROBLEMA QUE ESTE MÓDULO RESOLVE ══════════════════════════════════════════════════
 *
 * O motor decidia comportamento por regime em 21 pontos, e **todos** na forma
 *
 *     const isSimplesOuMei = regime === 'SIMPLES_NACIONAL' || regime === 'MEI'
 *
 * Comparação com `===` **não exige exaustividade**. Acrescentar um valor a `TaxRegime` enumera
 * ZERO pontos — medido duas vezes nesta campanha, e é o mecanismo exato pelo qual um regime
 * novo HERDA o caminho do Lucro Real/Presumido sem que ninguém tenha decidido isso.
 *
 * Um `Record<TaxRegime, …>` exige a chave. No dia em que o tipo crescer, o `tsc` aponta cada
 * tabela deste arquivo e obriga uma decisão — que é a diferença entre regra escrita e regra
 * herdada por omissão.
 *
 * ══ A FORMA É POSITIVA, E ISSO É REGRA ══════════════════════════════════════════════════
 *
 * Formulação do dono do produto, registrada como está:
 *
 *   > A condição é POSITIVA, não negada, porque um estado futuro nasce SEM a propriedade em
 *   > vez de herdá-la por omissão.
 *
 * Por isso nenhuma tabela aqui se chama `NAO_TEM_X`: todas perguntam o que o regime TEM.
 *
 * ══ UMA TABELA POR PERGUNTA, NÃO POR CALL SITE ══════════════════════════════════════════
 *
 * Há 21 pontos de decisão e **menos perguntas que isso**: os três sítios de `legacy-adapter`,
 * o de `cascade-trace` e o de `motor-rro` fazem LITERALMENTE a mesma pergunta. Dar a cada um a
 * sua tabela daria um número maior de pontos enumerados e seria `copia-divergente.md`
 * nascendo: cinco tabelas com as mesmas cinco chaves, que o compilador obriga a existir mas
 * **não** obriga a concordar em VALOR. A omissão de chave fica impossível; a divergência de
 * valor, não.
 *
 * As perguntas que mais de um módulo faz moram aqui. As que só um módulo faz ficam nele, junto
 * do uso — e as que parecem iguais e têm resposta DIFERENTE hoje ficam separadas, com a
 * divergência escrita. São três, e estão nomeadas em `regime-decisoes` ou no ponto de uso.
 *
 * ══ O QUE ESTE MÓDULO NÃO FAZ ═══════════════════════════════════════════════════════════
 *
 * **Não muda comportamento.** Cada valor abaixo é o que a comparação `===` produzia hoje,
 * chave por chave. A FASE B é bit-exact por construção; é a FASE C que decide o sexto valor.
 *
 * E ele **não decide formato de tributo** — isso é `matriz-fiscal.ts`, a fonte única da
 * colocação (por dentro, por fora, acréscimo, inexistente). Aqui ficam decisões de MOTOR:
 * qual ramo de cálculo, qual linha exibir, qual invariante conferir.
 */

import type { TaxRegime } from '@/types/mrm'

// ─────────────────────────────────────────────────────────────────────────────────────────
// 1. O imposto por dentro é GUIA ÚNICA?
// ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * Quando é, o grupo ICMS + ISS + PIS/COFINS **não existe como linha** — uma linha de DAS o
 * substitui, e nunca convivem.
 *
 * Perguntado em: `legacy-adapter.ts` (3 sítios), `cascade-trace.ts`, `motor-rro.ts`,
 * `margin-reapuration.ts`.
 *
 * | regime | guia única? | razão |
 * |---|---|---|
 * | `MEI` | **sim** | DAS fixo — LC 123 art. 18-A |
 * | `SIMPLES_NACIONAL` | **sim** | DAS por faixa de anexo — LC 123 art. 18 |
 * | `SIMPLES_HIBRIDO` | não **por aqui** | o DAS dele é reduzido e tem caminho PRÓPRIO, `simples-hibrido.ts`, que não passa pelo motor V17. Ver `REGIMES_COM_CAMINHO_PROPRIO` em `sale-context.ts`, onde a exceção é nomeada com a razão |
 * | `LUCRO_PRESUMIDO` | não | ICMS, ISS e PIS/COFINS discriminados |
 * | `LUCRO_REAL` | não | idem |
 */
const GUIA_UNICA_POR_DENTRO: Readonly<Record<TaxRegime, boolean>> = {
  MEI: true,
  SIMPLES_NACIONAL: true,
  SIMPLES_HIBRIDO: false,
  LUCRO_PRESUMIDO: false,
  LUCRO_REAL: false,
}

/**
 * `null`/`undefined` devolve `false` — que é o comportamento de hoje, porque `===` contra
 * ausente é falso. **A ausência não é um regime e não escolhe ramo**: `ausente-vs-falso.md`.
 */
export function temGuiaUnicaPorDentro(regime: TaxRegime | null | undefined): boolean {
  return regime != null && GUIA_UNICA_POR_DENTRO[regime] === true
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// 2. O regime RATEIA IRPJ e CSLL no resíduo?
// ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * Quando não rateia, os dois percentuais são forçados a zero antes do motor e a tela emite
 * aviso de guarda. Não é a mesma pergunta da guia única, embora a resposta coincida hoje:
 * aqui o que se nega é a REPARTIÇÃO do resíduo, não a forma do imposto por dentro.
 *
 * Perguntado em: `margin-reapuration.ts`, `mrm-display-extractor.ts`.
 *
 * | regime | rateia? | razão |
 * |---|---|---|
 * | `MEI` | **não** | IRPJ e CSLL estão dentro do DAS fixo |
 * | `SIMPLES_NACIONAL` | **não** | idem, dentro da guia única |
 * | `SIMPLES_HIBRIDO` | sim | é o comportamento de hoje. **Não confira com a tabela 1**: lá ele é `false`, aqui `true`, e a diferença é de hoje, não desta fase |
 * | `LUCRO_PRESUMIDO` | sim | presunção sobre a receita |
 * | `LUCRO_REAL` | sim | sobre o lucro — ver `item-tax-rates.ts` |
 */
const RATEIA_IRPJ_CSLL: Readonly<Record<TaxRegime, boolean>> = {
  MEI: false,
  SIMPLES_NACIONAL: false,
  SIMPLES_HIBRIDO: true,
  LUCRO_PRESUMIDO: true,
  LUCRO_REAL: true,
}

/** `null`/`undefined` devolve `true`, que é o comportamento de hoje (a guarda não dispara). */
export function rateiaIrpjCsll(regime: TaxRegime | null | undefined): boolean {
  return regime == null || RATEIA_IRPJ_CSLL[regime] === true
}

// ─────────────────────────────────────────────────────────────────────────────────────────
// 3. A tela EXIBE as linhas de comissão, lucro, IRPJ e CSLL?
// ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * A pergunta é de APRESENTAÇÃO, não de cálculo: nos regimes de guia única essas quatro linhas
 * não têm o que mostrar, porque o resíduo não é repartido entre elas.
 *
 * Perguntado em: `residual-distribution.ts`, `consolidated-dre.ts` — os dois com a função
 * local chamada `isHiddenRegime`/`isHidden`, cuja NEGATIVA no nome é justamente o que a regra
 * da condição positiva evita. Aqui a pergunta é positiva; os dois pontos de uso a negam.
 *
 * | regime | exibe? | razão |
 * |---|---|---|
 * | `MEI` | **não** | nada a repartir |
 * | `SIMPLES_NACIONAL` | **não** | idem |
 * | `SIMPLES_HIBRIDO` | sim | comportamento de hoje |
 * | `LUCRO_PRESUMIDO` | sim | — |
 * | `LUCRO_REAL` | sim | — |
 */
const EXIBE_REPARTICAO_DO_RESIDUO: Readonly<Record<TaxRegime, boolean>> = {
  MEI: false,
  SIMPLES_NACIONAL: false,
  SIMPLES_HIBRIDO: true,
  LUCRO_PRESUMIDO: true,
  LUCRO_REAL: true,
}

/** `null` devolve `true`, que é o comportamento de hoje (`isHidden(null)` é `false`). */
export function exibeReparticaoDoResiduo(regime: TaxRegime | null | undefined): boolean {
  return regime == null || EXIBE_REPARTICAO_DO_RESIDUO[regime] === true
}
