/**
 * iva-dual-reduction-factor.ts — o fator de redução do IVA DUAL: a lista da lei,
 * a faixa que o banco tolera, e a conversão para a unidade que o motor usa.
 *
 * SEMÂNTICA (R4 em `.claude/rules/cascata-lucro-real.md`), definida pelo dono do
 * produto: o fator é o percentual de REDUÇÃO aplicado sobre a alíquota original.
 *
 *     alíquota efetiva = alíquota original × (1 − fator/100)
 *
 * Alíquota 10% com fator 50 resulta em efetiva 5%.
 *
 * >>> A TELA É LISTA FECHADA. O BANCO É MAIS LARGO. DE PROPÓSITO. <<<
 * A LC 214/2025 tem OITO faixas de redução, e são as de
 * `IVA_DUAL_REDUCTION_OPTIONS`. A tela oferece essas oito e só essas: sem opção
 * "Outro", sem digitação livre.
 *
 * A CHECK do banco, porém, aceita a faixa inteira `[0, 100]`
 * (`20260915000001_iva_dual_reduction_factor_range.sql`). A diferença é
 * deliberada: a lista pode mudar com lei nova, e constraint enumerada obrigaria
 * migração a cada mudança. **A tela restringe, o banco tolera.**
 *
 * Consequência que este arquivo tem de honrar: um fator fora da lista PODE
 * chegar — por importação, por API, por linha gravada antes de uma mudança de
 * lista. `reductionFactorPctToFraction` e `isValidReductionFactorPct` trabalham
 * sobre a FAIXA, não sobre a lista. Quem restringe à lista é a tela, com
 * `isOptionPct`.
 *
 * >>> DUAS UNIDADES, E ELAS NÃO SE MISTURAM <<<
 *   - banco e tela  → percentual INTEIRO em [0, 100]  (50 = 50%)
 *   - motor         → FRAÇÃO em [0, 1]                (0,5 = 50%)
 * `resolveExternalOpsCoefficient` recusa `reductionFactor` acima de 1, então
 * passar o percentual direto vira erro de validação — e o fator 1, que seria 1%,
 * passaria como 100% de redução. `reductionFactorPctToFraction` é a única
 * travessia autorizada entre as duas unidades.
 *
 * >>> NULO NÃO É ZERO <<<
 * `null` é NÃO CLASSIFICADO; `0` é "integral, regime regular" — classificado, e
 * com o mesmo resultado aritmético. A distinção não muda conta nenhuma, e é
 * justamente por isso que ela se perde fácil: ver `ausente-vs-falso.md`.
 *
 * >>> AS REDUÇÕES NÃO SE ACUMULAM <<<
 * Art. 7º-A da LC 227/2026: operação que se enquadra em mais de um benefício
 * aplica o de maior hierarquia ou maior redução, salvo autorização expressa. O
 * campo é UM por produto, então a estrutura já força isso — mas está escrito
 * para que ninguém proponha somar dois fatores depois.
 */

/** Uma faixa de redução prevista na LC 214/2025. A tela oferece estas e só estas. */
export interface IvaDualReductionOption {
  /** Percentual inteiro, como vai para o banco. */
  pct: number
  /** Rótulo do item no drop-down. */
  label: string
  /** Enquadramento setorial. */
  enquadramento: string
  /** Artigo da LC 214/2025, quando identificado. `null` quando não confirmado. */
  artigo: string | null
  /** Ressalva a exibir junto do rótulo. Ausente quando não há. */
  nota?: string
}

/**
 * As OITO faixas da LC 214/2025, na ordem do drop-down.
 *
 * Duas ressalvas estão nos dados, não escondidas em comentário, porque a tela
 * precisa mostrá-las:
 *
 *   - O 40 tem faixa prevista na lei e o SETOR não foi confirmado. O rótulo diz
 *     isso. Não inventar enquadramento é o ponto: `ausente-vs-falso.md` vale para
 *     texto de tela também.
 *   - 50, 70 e 80 tratam de imóveis e locação, e fontes de 2026 divergem das de
 *     2025 sobre o enquadramento. A divergência está registrada SEM escolher
 *     lado — quem for decidir precisa saber que há o que decidir.
 */
export const IVA_DUAL_REDUCTION_OPTIONS: ReadonlyArray<IvaDualReductionOption> = [
  {
    pct: 0,
    label: '0% — Integral, regime regular',
    enquadramento: 'Integral — regime regular',
    artigo: 'art. 16',
  },
  {
    pct: 30,
    label: '30% — Profissões intelectuais regulamentadas',
    enquadramento: 'Profissões intelectuais regulamentadas',
    artigo: 'art. 127',
  },
  {
    pct: 40,
    label: '40% — Faixa prevista, enquadramento não confirmado',
    enquadramento: 'Faixa prevista na LC 214/2025; setor não confirmado',
    artigo: null,
    nota: 'A faixa existe na lei. O setor correspondente NÃO foi confirmado — não presuma enquadramento.',
  },
  {
    pct: 50,
    label: '50% — Operações com imóveis: alienação e construção civil',
    enquadramento: 'Operações com imóveis — alienação e construção civil',
    artigo: 'art. 261',
    nota: 'Fontes de 2026 divergem das de 2025 quanto ao enquadramento de imóveis e locação. Divergência registrada, sem escolha de lado.',
  },
  {
    pct: 60,
    label: '60% — Treze setores: saúde, educação, medicamentos, alimentos…',
    enquadramento:
      'Treze setores: saúde, educação, medicamentos, alimentos, insumos agropecuários, cultura, transporte coletivo',
    artigo: 'art. 128',
  },
  {
    pct: 70,
    label: '70% — Locação de imóveis',
    enquadramento: 'Locação de imóveis',
    artigo: 'art. 261',
    nota: 'Fontes de 2026 divergem das de 2025 quanto ao enquadramento de imóveis e locação. Divergência registrada, sem escolha de lado.',
  },
  {
    pct: 80,
    label: '80% — Locação de imóvel reabilitado em zona histórica',
    enquadramento: 'Locação de imóvel reabilitado em zona histórica',
    artigo: 'art. 158, § único',
    nota: 'Fontes de 2026 divergem das de 2025 quanto ao enquadramento de imóveis e locação. Divergência registrada, sem escolha de lado.',
  },
  {
    pct: 100,
    label: '100% — Alíquota zero: cesta básica, medicamentos',
    enquadramento: 'Alíquota zero — cesta básica, medicamentos',
    artigo: 'art. 125 e 143',
  },
]

export const IVA_DUAL_REDUCTION_MIN_PCT = 0
export const IVA_DUAL_REDUCTION_MAX_PCT = 100

/**
 * O valor está na LISTA que a tela oferece? É esta a pergunta da TELA — e só
 * dela. Nenhum caminho de dado deve usar isto para recusar valor vindo do banco:
 * a CHECK é mais larga de propósito, e um fator fora da lista é dado legítimo.
 */
export function isOptionPct(pct: unknown): boolean {
  const n = Number(pct)
  return IVA_DUAL_REDUCTION_OPTIONS.some((o) => o.pct === n)
}

/**
 * O valor cabe na FAIXA que o banco aceita? É esta a pergunta do DADO: vale para
 * o que veio de importação, de API ou de linha antiga, e é mais permissiva que
 * `isOptionPct` de propósito. Inteiro não é exigido aqui — a coluna é `integer` e
 * o arredondamento é do banco, não desta função.
 */
export function isValidReductionFactorPct(pct: unknown): boolean {
  const n = Number(pct)
  return (
    Number.isFinite(n) && n >= IVA_DUAL_REDUCTION_MIN_PCT && n <= IVA_DUAL_REDUCTION_MAX_PCT
  )
}

/** Resultado de `reductionFactorPctToFraction`. */
export interface ReductionFactorConversion {
  /**
   * `true` quando o valor bruto era `null`/`undefined` — NÃO CLASSIFICADO.
   * Distinto de `fraction: 0`, que é "integral, regime regular", classificado.
   */
  ausente: boolean
  /** Fração em [0, 1] para o motor. Ausente quando não classificado ou inválido. */
  fraction?: number
  /** Mensagem quando o valor existe e não é conversível. */
  error?: string
}

/**
 * Converte o percentual inteiro do banco/tela na fração que o motor espera.
 *
 *   50   → { ausente: false, fraction: 0.5 }
 *   0    → { ausente: false, fraction: 0 }      ← classificado, não é ausente
 *   45   → { ausente: false, fraction: 0.45 }   ← fora da lista da tela, e VÁLIDO
 *   null → { ausente: true }                     ← não classificado, sem fração
 *   -1   → { ausente: false, error: … }
 *   101  → { ausente: false, error: … }
 *
 * Trabalha sobre a FAIXA, não sobre a lista: o 45 converte porque o banco o
 * aceita e ele pode chegar por importação ou API. Recusá-lo aqui seria a tela
 * legislando sobre o motor.
 *
 * Quem chama decide o que fazer com `ausente`: para a ARITMÉTICA do `c`, ausente
 * e zero dão o mesmo número, e é por isso que o motor não recebe a distinção —
 * ele calcula, não classifica.
 */
export function reductionFactorPctToFraction(
  pct: number | null | undefined,
): ReductionFactorConversion {
  if (pct === null || pct === undefined) return { ausente: true }

  const n = Number(pct)
  if (!Number.isFinite(n)) {
    return { ausente: false, error: `fator de redução não numérico: ${String(pct)}` }
  }
  if (n < IVA_DUAL_REDUCTION_MIN_PCT || n > IVA_DUAL_REDUCTION_MAX_PCT) {
    return {
      ausente: false,
      error: `fator de redução fora da faixa [${IVA_DUAL_REDUCTION_MIN_PCT}, ${IVA_DUAL_REDUCTION_MAX_PCT}]: ${n}`,
    }
  }

  return { ausente: false, fraction: n / 100 }
}
