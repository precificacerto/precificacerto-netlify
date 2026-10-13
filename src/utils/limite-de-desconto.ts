/**
 * O LIMITE DO DESCONTO, E OS TRÊS ESTADOS — ESPEC Parte VII.
 *
 * Decidido pelo dono do produto em 11/10/2026, implementado em 12/10/2026.
 *
 * ══ A VII.5 MUDOU EM 13/10/2026 — E ESTA É A REDAÇÃO VIGENTE ════════════════════════════
 *
 * >>> ATÉ o limite o MODO DE PROTEÇÃO governa. ULTRAPASSADO, zera nos TRÊS modos. <<<
 *
 * | estado | comissão | lucro | descoberto |
 * |---|---|---|---|
 * | **até o limite** | o modo governa, como sempre | idem | não existe |
 * | **ultrapassado e autorizado** | **ZERO** | **ZERO** | `\|RRO\|`, IGUAL nos três modos |
 *
 * A redação de 11/10 dizia que *"o sacrifício segue o modo de proteção"* — SEM a ressalva do
 * limite. Acima dele o modo congelava a parcela protegida, e isso foi medido: descoberto de
 * **R$ 4.114,07** no Congela Lucro contra **R$ 1.093,16** no Proporcional, no MESMO documento
 * com o MESMO desconto.
 *
 * Caiu por coerência de tela. A rodada do card (13/10/2026) fixou que, autorizado acima do
 * limite, **nenhuma tela exibe lucro positivo enquanto o aviso diz lucro zero** — e a Memória
 * Cascata é uma tela que mostra repartição. Com o modo congelando, a etapa 16 do motor
 * continuaria exibindo uma parcela integral. A regra nova fecha na origem: sem congelamento
 * não há parcela a exibir, e o descoberto deixa de variar por modo.
 *
 * O ganho que não era o objetivo e vale registrar: o descoberto ficou **comparável**. Antes,
 * dois documentos idênticos com modos diferentes mostravam prejuízos diferentes, e a diferença
 * era escolha de absorção, não fato econômico.
 *
 * Implementada em `mrm-engine-v17/absorption.ts` (o motor) e em `decomposition-dre.ts` (o piso
 * da decomposição, que é o que as telas leem). Portão: `o-card-nao-mente-sobre-o-lucro.test.ts`,
 * seção (d) — os três modos acima do limite com o MESMO descoberto, e o par que mostra que
 * abaixo dele eles seguem diferentes entre si.
 *
 * >>> E O DESCOBERTO EXIBIDO É O DA DECOMPOSIÇÃO, não o do motor <<<
 *
 * Decisão da mesma data: UM NÚMERO SÓ NA TELA. O aviso lia o motor e o card lia a
 * decomposição — R$ 1.093,16 contra R$ 618,13 no mesmo documento. Os dois leem a decomposição
 * agora, porque ela é a fonte única do card desde o `1934dbb` e é a única que fecha o próprio
 * DRE. A divergência dos dois RRO **permanece** e está registrada em `decomposition-dre.ts`,
 * no `descobertoDaAutorizacao`: registrar, não corrigir.
 *
 * ══ O QUE SAIU, E POR QUE ERA PRECISO QUE SAÍSSE ════════════════════════════════════════
 *
 * O que travava o desconto até aqui NÃO era este limite: era um **clamp no campo**, em três
 * telas, com fórmula própria — `maxDiscountPercent` em `orcamentos:727`/`:846`,
 * `maxDiscountPercentV` em `vendas:1405` e `calcMaxDiscountPctAgenda` em `agenda:1015`. O
 * valor digitado era silenciosamente reduzido por `Math.min`. E `limite_minimo`, que
 * `motor-rro.ts` calcula, **não era lido por nenhum código de produção** — medido no §0 desta
 * rodada.
 *
 * Os dois dão números diferentes, e a diferença varia por regime. Medido na entrada de
 * referência (OP_DENTRO R$ 2.500 · CP R$ 1.000 · DOP R$ 550 · comissão 5% · lucro 10% · RT 0):
 *
 * | regime | clamp | limite da VII.3 |
 * |---|---:|---:|
 * | MEI | 15,00% | **38,00%** |
 * | Simples Nacional | 15,00% | 34,03% |
 * | Simples Híbrido | 15,00% | 35,28% |
 * | RET | 15,00% | 35,42% |
 * | Lucro Presumido | 15,00% | 19,55% |
 * | Lucro Real | 15,00% | 15,93% |
 *
 * Formulação do dono do produto sobre por que o limite é MAIOR, e não é efeito colateral:
 *
 *   > O clamp trata custo e despesa como percentual e eles são valor fixo. No MEI eram 23
 *   > pontos de desconto proibidos que ainda deixavam margem.
 *
 * ══ O DENOMINADOR É LIDO DA MATRIZ, SEM NOMEAR REGIME ═══════════════════════════════════
 *
 * Entra no denominador o tributo cuja célula tem colocação **POR_DENTRO** e base **≠ LUCRO**.
 * Conferido contra a tabela VII.3 nos seis regimes, linha por linha:
 *
 * | regime | o que a regra traz | = VII.3 |
 * |---|---|---|
 * | `MEI` | nada por dentro | `1 − RT%` |
 * | `SIMPLES_NACIONAL` | DAS (`RECEITA`) | `1 − DAS% − RT%` |
 * | `SIMPLES_HIBRIDO` | DAS_REDUZIDO (`RECEITA`) | `1 − DAS_red% − RT%` |
 * | `LUCRO_PRESUMIDO` | ICMS, PIS/COFINS (`RECEITA`) + IRPJ, CSLL, adicional (`PRESUNCAO`) | `1 − ICMS − 3,65% − IRPJ_ef − CSLL_ef − RT%` |
 * | `LUCRO_REAL` | ICMS, PIS/COFINS. **IRPJ e CSLL têm base `LUCRO` → FORA** | `1 − ICMS − 9,25% − RT%` |
 * | `LUCRO_PRESUMIDO_RET` | RET (`RECEITA_RECEBIDA`) | `1 − 4% − RT%` |
 *
 * O `base ≠ LUCRO` é o discriminante que a própria VII.3 usa ao dizer, do Lucro Real,
 * *"IRPJ/CSLL não entram: são resíduo"*. Nenhum regime é nomeado aqui —
 * `regime-e-segmento-determinam-a-construcao.md`: a decomposição lê, não infere.
 *
 * ══ ALÍQUOTA AUSENTE NÃO É ALÍQUOTA ZERO ════════════════════════════════════════════════
 *
 * `somaDoDenominador` devolve `semAliquota` com os tributos que a matriz manda somar e para
 * os quais o chamador não trouxe percentual. Eles contribuem zero na soma — porque não há
 * outro número a usar — mas a lista SAI, para que o chamador possa dizer que o limite está
 * incompleto em vez de exibi-lo como se estivesse apurado. `ausente-vs-falso.md`.
 */

import type { TaxRegime } from '@/supabase/types'
import type { CalcType } from './pricing-engine'
import { MATRIZ_FISCAL, celulaDe, colocacaoVigente, type TributoFiscal } from './matriz-fiscal'

/** Os três estados da Parte VII.2, e só três. */
export type EstadoDoDesconto = 'VERDE' | 'AMARELO' | 'VERMELHO_AUTORIZADO'

/**
 * Os tributos que entram no DENOMINADOR do limite, para este par regime × segmento.
 *
 * A ordem é a das chaves da matriz, estável porque a matriz é escrita tributo por tributo.
 */
export function tributosDoLimite(
  regime: TaxRegime,
  segmento: CalcType,
): readonly TributoFiscal[] {
  const celulas = MATRIZ_FISCAL[regime]?.[segmento]
  if (!celulas) return []
  return (Object.keys(celulas) as TributoFiscal[]).filter((t) => {
    if (colocacaoVigente(regime, segmento, t) !== 'POR_DENTRO') return false
    // base `LUCRO` é RESÍDUO: não disputa a âncora, logo não entra no denominador. É o que a
    // VII.3 diz do Lucro Real com todas as letras.
    return celulaDe(regime, segmento, t)?.base !== 'LUCRO'
  })
}

/**
 * A soma das alíquotas por dentro que o limite usa, mais o que faltou.
 *
 * `aliquotas` vem em FRAÇÃO (0,17 para 17%), e o chamador só precisa trazer os tributos que
 * ele conhece: quem a matriz manda somar e não vier fica em `semAliquota`.
 */
export function somaDoDenominador(args: {
  regime: TaxRegime
  segmento: CalcType
  aliquotas: Readonly<Partial<Record<TributoFiscal, number>>>
}): { soma: number; somados: readonly TributoFiscal[]; semAliquota: readonly TributoFiscal[] } {
  const pedidos = tributosDoLimite(args.regime, args.segmento)
  const somados: TributoFiscal[] = []
  const semAliquota: TributoFiscal[] = []
  let soma = 0
  for (const t of pedidos) {
    const a = args.aliquotas[t]
    if (a == null || !Number.isFinite(a)) { semAliquota.push(t); continue }
    soma += Number(a)
    somados.push(t)
  }
  return { soma, somados, semAliquota }
}

/**
 * `LimiteMinimo = (CP + MOD + DOP) ÷ (1 − Σ imp_dentro% − RT%)` — VII.3.
 *
 * `null` quando o denominador é zero ou negativo: não existe preço que cubra o custo, e
 * devolver um número aqui afirmaria um limite que a conta não produz.
 */
export function limiteMinimoDaOperacao(args: {
  cp: number
  mod: number
  dop: number
  somaInternos: number
  rtPct: number
}): number | null {
  const numerador = (Number(args.cp) || 0) + (Number(args.mod) || 0) + (Number(args.dop) || 0)
  const denom = 1 - (Number(args.somaInternos) || 0) - (Number(args.rtPct) || 0)
  if (!(denom > 0)) return null
  return numerador / denom
}

/**
 * `d_máximo = 1 − (LimiteMinimo ÷ OP_DENTRO)` — VII.3, em FRAÇÃO.
 *
 * `null` quando não há limite calculável ou a operação interna é zero. Negativo é CLAMPADO em
 * zero: um `d_máximo` negativo significa que a operação já não cobre o custo sem desconto
 * nenhum, e nesse caso o máximo é zero, não um número abaixo de zero.
 */
export function descontoMaximoFracao(args: {
  limiteMinimo: number | null
  opDentro: number
}): number | null {
  if (args.limiteMinimo == null) return null
  const op = Number(args.opDentro) || 0
  if (!(op > 0)) return null
  return Math.max(0, 1 - args.limiteMinimo / op)
}

/**
 * Os três estados da VII.2.
 *
 * `descontoMaximo` ausente devolve VERDE: sem limite calculável não há o que ultrapassar, e
 * inventar um AMARELO aqui travaria a venda com base num número que não existe.
 */
export function estadoDoDesconto(args: {
  descontoFracao: number
  descontoMaximoFracao: number | null
  autorizado: boolean
}): EstadoDoDesconto {
  const d = Number(args.descontoFracao) || 0
  const max = args.descontoMaximoFracao
  if (max == null) return 'VERDE'
  // A comparação é com tolerância de meio centésimo de ponto: o limite vem de uma divisão, e
  // um desconto digitado IGUAL ao limite não pode cair no amarelo por erro de ponto flutuante.
  if (d <= max + 5e-5) return 'VERDE'
  return args.autorizado ? 'VERMELHO_AUTORIZADO' : 'AMARELO'
}

/** Formata uma fração como percentual brasileiro, com duas casas. */
function pct(f: number): string {
  return `${(f * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
}

/**
 * A mensagem do estado amarelo, LITERAL da VII.2 — ela diz o fato, não a opinião.
 *
 * O texto é parte da regra, não redação: ele nomeia o limite, diz o que a autorização implica
 * ("entra dinheiro no caixa, não entra resultado") e não pede concordância com uma opinião.
 */
export function mensagemDoLimite(args: {
  descontoFracao: number
  limiteFracao: number
}): string {
  return (
    `Este desconto de ${pct(args.descontoFracao)} ultrapassa o limite consolidado da operação ` +
    `(${pct(args.limiteFracao)}). Acima dele a venda não cobre comissão e lucro. Autorizando, ` +
    `a operação entra em lucro zero: entra dinheiro no caixa, não entra resultado.`
  )
}

/** O rótulo do checkbox, LITERAL da VII.2. */
export const ROTULO_DA_AUTORIZACAO =
  'Autorizo desconto acima do limite consolidado, ciente de que esta venda não tem lucro.'

// ───────────────────────── O RASTRO DA AUTORIZAÇÃO ─────────────────────────

/**
 * O rastro que a VII.2 exige: quem autorizou, quando, o % de desconto, o limite e o
 * descoberto.
 *
 * >>> NÃO EXISTE COLUNA PARA ISTO, e esta é a parte que falta <<<
 *
 * Medido em 12/10/2026 no schema de produção: `budgets`, `orders` e `sales` não têm coluna
 * nenhuma de autorização, aprovação ou aval — nem texto, nem booleano, nem data. O único
 * jsonb de nível DOCUMENTO nas três é `consolidated_breakdown`, e ela está **vazia em
 * produção**: nada em `src/` escreve nela, apesar de `types/mrm.ts` a declarar como o destino
 * de `MotorV17Result`.
 *
 * A instrução do dono do produto foi "grave o que couber e reporte o que falta — NÃO crie
 * migration". O que cabe é esta chave, debaixo daquele jsonb. A OCUPAÇÃO É PARCIAL, e por
 * isso ela é DECLARADA em `ConsolidatedBreakdownPersisted` em vez de ficar implícita: quem
 * um dia escrever o `MotorV17Result` inteiro ali vai ler neste tipo que a coluna já tem
 * morador, em vez de descobrir sobrescrevendo-o. É o que `ausente-vs-falso.md` manda — a
 * ocupação parcial não silenciosa.
 *
 * O que FALTA, e não se resolve sem migração:
 *   1. a chave é sobrescrita a cada save do documento, então o rastro é do ÚLTIMO estado, não
 *      histórico. Histórico exige tabela própria;
 *   2. `autorizado_por` guarda o id do usuário da sessão, não há FK e nada garante que ele
 *      exista depois;
 *   3. não há índice nem constraint — não é consultável como relatório.
 */
export interface RastroDaAutorizacaoDoDesconto {
  /** O usuário da sessão no momento do clique. `null` quando não foi possível resolver. */
  autorizado_por: string | null
  /** ISO 8601 do momento em que o documento foi gravado com a autorização marcada. */
  autorizado_em: string
  /** O desconto autorizado, em PERCENTUAL (não fração) — a unidade da tela e da coluna. */
  desconto_pct: number
  /** O `d_máximo` da VII.3 em percentual. `null` = não calculável (e aí não há autorização). */
  limite_pct: number | null
  /** O descoberto (R$) que a operação deixa de cobrir, no modo de absorção vigente. */
  descoberto: number
  /** Tributos que a matriz manda somar e cuja alíquota não chegou ao motor. Vazio é o normal. */
  limite_incompleto: readonly string[]
}

/**
 * O que `budgets/orders/sales.consolidated_breakdown` carrega HOJE.
 *
 * O comentário de `MotorV17Result` em `types/mrm.ts` diz que a coluna é o destino do resultado
 * completo do motor. Ela nunca recebeu isso, e a partir desta rodada recebe a autorização do
 * desconto. As duas coisas cabem juntas — `autorizacao_do_desconto` não é campo de
 * `MotorV17Result`, então um leitor distingue —, e este tipo é o lugar onde isso está escrito.
 */
export interface ConsolidatedBreakdownPersisted {
  autorizacao_do_desconto?: RastroDaAutorizacaoDoDesconto
}

/**
 * O ÚNICO produtor do rastro, para que não nasça uma segunda cópia do mapeamento em cada uma
 * das três telas (`copia-divergente.md`).
 *
 * Devolve `{}` — e não `{ consolidated_breakdown: null }` — quando não houve autorização: um
 * documento verde não afirma nada sobre autorização, e gravar `null` por cima apagaria o
 * rastro de uma autorização anterior sem que ninguém pedisse (`ausente-vs-falso.md`).
 */
export function payloadDoRastroDaAutorizacao(args: {
  estado: EstadoDoDesconto
  autorizadoPor: string | null
  descontoPct: number
  limitePct: number | null
  descoberto: number
  limiteIncompleto: readonly string[]
}): { consolidated_breakdown: ConsolidatedBreakdownPersisted } | Record<string, never> {
  if (args.estado !== 'VERMELHO_AUTORIZADO') return {}
  return {
    consolidated_breakdown: {
      autorizacao_do_desconto: {
        autorizado_por: args.autorizadoPor,
        autorizado_em: new Date().toISOString(),
        desconto_pct: args.descontoPct,
        limite_pct: args.limitePct,
        descoberto: args.descoberto,
        limite_incompleto: args.limiteIncompleto,
      },
    },
  }
}

/**
 * A GUARDA DO SAVE — a VII.2 em uma linha, e ela é UMA.
 *
 * O amarelo não avança: o checkbox tem de ser clicado. O vermelho autorizado AVANÇA, porque o
 * usuário clicou e a autorização é dele — não é trava, é autorização, e é o ponto da rodada.
 *
 * Existe como função, e não como `=== 'AMARELO'` repetido em três handlers, pelo mesmo motivo
 * do componente: três cópias de uma condição de bloqueio são três chances de uma delas ficar
 * para trás quando a VII.6 acrescentar o segundo nível de aviso.
 */
export function bloqueiaOSave(estado: EstadoDoDesconto): boolean {
  return estado === 'AMARELO'
}

/** A mensagem do bloqueio, única, para as três telas dizerem a mesma coisa. */
export const AVISO_DE_SAVE_BLOQUEADO =
  'Desconto acima do limite. Marque a autorização para prosseguir.'
