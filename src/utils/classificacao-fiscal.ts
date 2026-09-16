/**
 * A classificação fiscal do item — o par (CST, cClassTrib) e o que ele DETERMINA.
 *
 * ── A MUDANÇA DE NATUREZA QUE ESTE MÓDULO IMPLEMENTA ──────────────────────────
 *
 * Formulação do dono do produto, registrada como está:
 *
 *   > O fator de redução NÃO é escolha do usuário. Ele DECORRE do cClassTrib.
 *   > Na reforma, o contribuinte classifica a operação — escolhe CST e cClassTrib —
 *   > e a redução vem junto, da tabela: pRedIBS e pRedCBS são atributos do código,
 *   > não campos que o emitente preenche.
 *   > É como o NCM: ninguém digita a alíquota do IPI, classifica o produto e a
 *   > alíquota vem.
 *
 * O campo de redução deixa de ser ENTRADA e vira DERIVADO. Este módulo é onde a
 * derivação acontece, e ele é a FONTE ÚNICA dela: `copia-divergente.md` diz que o
 * remédio para dois mapeamentos não é conferir os dois, é apagar um. Com um
 * construtor só, quem classificar por qualquer tela grava o mesmo conjunto.
 *
 * ── POR QUE O RESULTADO É CONGELADO ──────────────────────────────────────────
 *
 * O que sai daqui é gravado no produto, não relido. O preço foi formado com
 * aqueles percentuais; se uma publicação futura mudar o código, o preço de ontem
 * não pode mudar junto. `fato-vs-referencia.md`: *"fato histórico congela;
 * referência viva relê"* — e aquela classe já tem SEIS aparições nesta base.
 * Derivar em tempo de leitura seria a sétima.
 *
 * ── TRÊS RESULTADOS, E ELES NÃO SE CONFUNDEM ─────────────────────────────────
 *
 *   TABELA ............ o par existe na tabela oficial. Grava os percentuais dela.
 *   PAR_INCOMPATIVEL .. o CÓDIGO existe, mas sob OUTRO CST. É o erro mais
 *                       frequente, e a SEFAZ rejeita. NÃO é inserção manual: o
 *                       usuário não inventou um código, ele errou o par — e
 *                       tratá-lo como manual gravaria um par que a nota recusa.
 *   MANUAL ............ o código não existe em CST nenhum. A decisão do dono do
 *                       produto é deixar passar: a tela sugere, o banco aceita,
 *                       para que um código publicado antes da nossa atualização
 *                       não trave ninguém.
 *
 * A procedência é gravada como FATO, nunca deduzida depois. "O código não
 * encontrado se auto-identifica" foi considerado e recusado: contra uma tabela
 * que muda, ele erra nos dois sentidos — manual hoje e publicado amanhã vira
 * oficial retroativamente; oficial hoje e revogado amanhã vira manual. A resposta
 * a "quem cadastrou este código?" mudaria sozinha, sem ninguém agir.
 */

export type CClassTribOrigem = 'TABELA' | 'MANUAL'

/** A linha de `cclass_trib`, como a tabela oficial a traz. */
export interface CClassTribRow {
  cst: string
  codigo: string
  nome: string
  /** Percentual de REDUÇÃO do IBS, inteiro em [0, 100]. Zero é apurado. */
  p_red_ibs: number
  /** Percentual de REDUÇÃO da CBS, inteiro em [0, 100]. Separado do IBS. */
  p_red_cbs: number
  /** 'YYYY-MM-DD' */
  d_ini_vig: string
  /** 'YYYY-MM-DD', ou `null` quando não há prazo de fim. */
  d_fim_vig: string | null
  /** 'YYYY-MM-DD' — a publicação de onde a linha veio. NÃO é vigência. */
  source_published_at: string
}

/** Exatamente o conjunto que vai para as colunas de `products`. */
export interface ClassificacaoFiscalGravada {
  cst_ibs_cbs: string
  cclass_trib: string
  cclass_trib_origem: CClassTribOrigem
  cclass_trib_source_published_at: string
  iva_reduction_ibs_pct: number | null
  iva_reduction_cbs_pct: number | null
}

export type ResultadoClassificacao =
  | { status: 'TABELA'; gravar: ClassificacaoFiscalGravada; vigenteEm: boolean }
  | { status: 'MANUAL'; gravar: ClassificacaoFiscalGravada; vigenteEm: null }
  | { status: 'PAR_INCOMPATIVEL'; gravar: null; cstDoCodigo: string[]; vigenteEm: null }

export interface ResolveArgs {
  /** O CST escolhido na tela. */
  cst: string
  /** O cClassTrib escolhido ou digitado. */
  codigo: string
  /**
   * TODAS as linhas com este código, em QUALQUER CST — o resultado de
   * `select … from cclass_trib where codigo = $1`, e nada mais.
   *
   * É UMA consulta só, e é de propósito. A versão anterior deste contrato pedia
   * também a linha do par exato, e as duas podiam chegar incoerentes — o que
   * obrigava a um filtro defensivo que teste nenhum conseguiria matar. Com uma
   * entrada só a incoerência deixa de ser representável, e o `find` pelo CST
   * passa a ser código VIVO: é ele que separa par errado de código inexistente.
   */
  porCodigo: CClassTribRow[]
  /**
   * A publicação que a consulta enxergou (`select distinct source_published_at`).
   * Gravada MESMO no caso MANUAL, e de propósito: junto com `origem = 'MANUAL'`
   * ela afirma "este código NÃO estava na tabela de tal data", que é verificável.
   * Um `null` ali não afirmaria nada — `ausente-vs-falso.md` ao contrário.
   */
  publicacaoConsultada: string
  /** Data de referência para a vigência, 'YYYY-MM-DD'. */
  hoje: string
}

/**
 * A vigência é INCLUSIVA nas duas pontas.
 *
 * Consequência medida, registrada sem interpretação: três códigos do arquivo
 * oficial — `220001`, `220002` e `220003`, todos do CST 220 — têm
 * `d_fim_vig` IGUAL a `d_ini_vig` (2026-01-01 nos dois). Com intervalo inclusivo
 * eles são vigentes em exatamente um dia. **Não foi interpretado o que as datas
 * iguais significam**; a função decide pelo dado.
 */
export function isVigenteEm(row: Pick<CClassTribRow, 'd_ini_vig' | 'd_fim_vig'>, data: string): boolean {
  if (data < row.d_ini_vig) return false
  if (row.d_fim_vig != null && data > row.d_fim_vig) return false
  return true
}

/**
 * Resolve o que se grava no produto a partir do par escolhido.
 * NÃO consulta nada: recebe o que a consulta trouxe. É pura de propósito, para
 * que o EFEITO — quais números ficam gravados — seja afirmável por teste.
 */
export function resolveClassificacaoFiscal(args: ResolveArgs): ResultadoClassificacao {
  const { cst, codigo, porCodigo, publicacaoConsultada, hoje } = args

  // O par exato. Um cClassTrib só é válido DENTRO do seu CST.
  const doPar = porCodigo.find((r) => r.cst === cst)

  if (doPar) {
    return {
      status: 'TABELA',
      vigenteEm: isVigenteEm(doPar, hoje),
      gravar: {
        cst_ibs_cbs: cst,
        cclass_trib: codigo,
        cclass_trib_origem: 'TABELA',
        cclass_trib_source_published_at: doPar.source_published_at,
        // Os DOIS, separados. O 200025 (ProUni) tem 60 no IBS e 100 na CBS —
        // um campo só não teria como dizer isso.
        iva_reduction_ibs_pct: doPar.p_red_ibs,
        iva_reduction_cbs_pct: doPar.p_red_cbs,
      },
    }
  }

  // O código existe, mas sob outro CST. É par ERRADO, não código novo — e a
  // diferença importa: tratar par errado como inserção manual gravaria um par
  // que a SEFAZ recusa, com o carimbo de "o usuário quis assim".
  if (porCodigo.length > 0) {
    return {
      status: 'PAR_INCOMPATIVEL',
      gravar: null,
      cstDoCodigo: porCodigo.map((r) => r.cst),
      vigenteEm: null,
    }
  }

  return {
    status: 'MANUAL',
    vigenteEm: null,
    gravar: {
      cst_ibs_cbs: cst,
      cclass_trib: codigo,
      cclass_trib_origem: 'MANUAL',
      cclass_trib_source_published_at: publicacaoConsultada,
      // NÃO HÁ DE ONDE DERIVAR, e `null` é o que diz isso. Zero afirmaria
      // "sem redução", que é uma frase sobre o mundo que ninguém apurou —
      // `ausente-vs-falso.md`.
      iva_reduction_ibs_pct: null,
      iva_reduction_cbs_pct: null,
    },
  }
}
