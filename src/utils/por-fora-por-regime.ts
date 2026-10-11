/**
 * por-fora-por-regime.ts — QUAIS tributos por fora existem em cada REGIME.
 *
 * Comando do PO de 11/10/2026.
 *
 * ══ O SEGUNDO EIXO, E POR QUE ELE É ARQUIVO PRÓPRIO ══════════════════════════════════════
 *
 * `regime-e-segmento-determinam-a-construcao.md` abre dizendo:
 *
 *   > **DUAS RAÍZES determinam o FORMATO da construção do preço** — o **REGIME TRIBUTÁRIO** e
 *   > o **SEGMENTO DA CADEIA**.
 *
 * O eixo do SEGMENTO já existia: `TAX_MATRIX` em `pricing-engine.ts`, lido por
 * `tributoExisteNoSegmento`. O eixo do REGIME não existia em lugar nenhum — medido em
 * 10/10/2026: zero ocorrências de `Record<TaxRegime`, e o único artefato indexado por regime
 * era `REGIMES_COM_MATRIZ` (`sale-context.ts:386`), uma lista de UM elemento que decide outra
 * coisa (se o `taxBreakdown` chega ao motor).
 *
 * >>> POR QUE NÃO ENTROU EM `campos-do-segmento.ts` <<<
 *
 * Três razões, e a decisão é do dono do produto depois de as ler:
 *
 * 1. Aquele arquivo declara, no próprio cabeçalho, que responde UMA pergunta:
 *    *"Não decide valor, não decide ordem, não decide rótulo. Responde uma pergunta só: este
 *    tributo tem linha neste segmento?"* Pôr regime ali quebra a frase que o defende.
 *
 * 2. O eixo de regime precisa do tipo `TaxRegime`, e existem TRÊS no repositório, que
 *    discordam: `supabase/types.ts:14` tem os seis (com `LUCRO_PRESUMIDO_RET`);
 *    `types/mrm.ts:104` tem CINCO e **não** tem o RET; `pages/dfc/index.tsx:29` grafa
 *    `'PRESUMIDO_RET'`. Este módulo usa o de `supabase/types.ts` — o único em que o RET é
 *    expressável, e é justamente o regime que esta rodada acrescenta. `campos-do-segmento.ts`
 *    depende só de `pricing-engine.ts`; acoplá-lo aos tipos do banco seria de graça.
 *
 * 3. Os dois eixos compõem, mas não são a mesma pergunta — e **qual deles recusou importa**:
 *
 *    | caso | quem recusa | o que isso significa |
 *    |---|---|---|
 *    | IPI em REVENDA | o segmento | não há industrialização naquele formato |
 *    | IPI no RET | o regime | imóvel não é industrialização |
 *    | IS no RET | o regime | imóvel não está na lista do Seletivo |
 *    | IS em SERVIÇO | o segmento | não há IS em serviço |
 *
 *    São motivos diferentes para a mesma ausência. Os dois predicados ficam exportados
 *    separados para que o portão possa afirmar um eixo por vez, e `apenasTributosPorFora`
 *    compõe os dois para quem só quer a lista final.
 *
 * ══ A ALÍQUOTA É MANUAL — E É ISSO QUE DISPENSA EIXO DE VIGÊNCIA ═════════════════════════
 *
 * Regra do dono do produto, registrada como está:
 *
 *   > a matriz decide ONDE o tributo entra. A alíquota é MANUAL. Não existe hoje → fica ZERO e
 *   > o preço não muda. Passa a existir → o dono digita, e ele entra no lugar certo sozinho.
 *
 * Então o bloco do RET nasce com IBS e CBS em 0,0000%, e em 2029 o dono preenche a alíquota e
 * a redução. **Nenhum percentual é escrito neste arquivo**, e não há coluna de data: a tabela
 * responde existência, nunca valor — igual à `TAX_MATRIX`, que também não decide alíquota.
 */
import type { TaxRegime } from '@/supabase/types'
import type { TaxName } from './pricing-engine'
import { tributoExisteNoSegmento } from './campos-do-segmento'
import type { CalcType } from './pricing-engine'

/**
 * Os tributos POR FORA de cada regime, pela lei.
 *
 * >>> A ORDEM DENTRO DE CADA LISTA NÃO DECIDE A ORDEM DA TELA <<<
 * Quem decide a ordem exibida é o array de linhas do componente, e o filtro a preserva — é o
 * mesmo contrato de `apenasTributosQueExistem`. A ordem aqui é só de leitura.
 *
 * | regime | por fora | por quê |
 * |---|---|---|
 * | `LUCRO_REAL` | IPI · IS · IBS · CBS | é o MODELO DE REFERÊNCIA, e não muda |
 * | `LUCRO_PRESUMIDO` | IPI · IS · IBS · CBS | mesmo formato do Real; o que muda é a alíquota |
 * | `LUCRO_PRESUMIDO_RET` | **IBS · CBS, e só** | imóvel não está na lista do Seletivo e não é industrialização — o RET **não** leva IS nem IPI |
 * | `SIMPLES_HIBRIDO` | IBS · CBS · IS | LC 214/2025 art. 41 §3º: IBS e CBS pelo regime regular, o resto no DAS. O IS acompanha por ser monofásico e por fora |
 * | `SIMPLES_NACIONAL` | **nenhum** | guia única: tudo está dentro do DAS |
 * | `MEI` | **nenhum** | o DAS é fixo e não incide por item |
 *
 * As duas listas vazias são AFIRMAÇÕES, não lacunas: dizem que naquele regime não existe
 * operação por fora. É a distinção que `ausente-vs-falso.md` pede — `[]` aqui significa
 * *"não há o que apurar"*, e é por isso que o bloco não aparece em vez de aparecer zerado.
 */
export const POR_FORA_POR_REGIME: Readonly<Record<TaxRegime, readonly TaxName[]>> = {
  LUCRO_REAL: ['IPI', 'IS', 'IBS', 'CBS'],
  LUCRO_PRESUMIDO: ['IPI', 'IS', 'IBS', 'CBS'],
  LUCRO_PRESUMIDO_RET: ['IBS', 'CBS'],
  SIMPLES_HIBRIDO: ['IBS', 'CBS', 'IS'],
  SIMPLES_NACIONAL: [],
  MEI: [],
}

/**
 * O regime, normalizado para a chave da tabela. `null` quando não se reconhece.
 *
 * `currentUser.taxableRegime` é `settings?.tax_regime || null` (`auth.context.tsx:337`) — uma
 * string crua do banco, que pode estar ausente. Normalizar aqui é o que impede o componente de
 * fazê-lo por conta própria em cada bloco.
 */
function regimeConhecido(regimeRaw: unknown): TaxRegime | null {
  const r = String(regimeRaw ?? '').trim().toUpperCase()
  return Object.prototype.hasOwnProperty.call(POR_FORA_POR_REGIME, r) ? (r as TaxRegime) : null
}

/**
 * Os tributos por fora daquele regime. **Regime desconhecido devolve `[]`.**
 *
 * >>> FECHADO POR PADRÃO, E A ESCOLHA É DELIBERADA <<<
 *
 * Não saber o regime NÃO é "tem os quatro". Devolver a lista do Lucro Real num regime que o
 * código não reconhece faria aparecer campo de IPI e de IS onde a lei talvez não os tenha — e
 * um campo de alíquota que não deveria existir é pior que um campo faltando, porque o usuário
 * digita e o número entra na conta.
 *
 * É coerente com o resto: `calc-tax-preview.ts:100` faz `ts.tax_regime || 'SIMPLES_NACIONAL'`,
 * e o Simples tem `[]` de todo jeito.
 */
export function tributosPorForaDoRegime(regimeRaw: unknown): readonly TaxName[] {
  const r = regimeConhecido(regimeRaw)
  return r ? POR_FORA_POR_REGIME[r] : []
}

/** O tributo existe POR FORA naquele regime? É o espelho de `tributoExisteNoSegmento`. */
export function tributoExisteNoRegime(regimeRaw: unknown, tributo: TaxName): boolean {
  return tributosPorForaDoRegime(regimeRaw).includes(tributo)
}

/**
 * Filtra linhas de tributo pelos DOIS eixos, preservando a ordem de quem chamou.
 *
 * `existe no REGIME` **E** `existe no SEGMENTO`. A conjunção é a condição de render dos dois
 * blocos por fora, e é por isso que ela mora numa função: duas chamadas encadeadas no JSX
 * convidam alguém a esquecer uma — `copia-divergente.md` na condição em vez de no mapeamento.
 *
 * Genérica de propósito, igual a `apenasTributosQueExistem`: o componente passa o que já tem
 * (rótulo, valor, handler, redução) e recebe de volta só o que existe. **Nenhum tributo e
 * nenhum regime é nomeado aqui** — mudar a lei muda a tabela, não o JSX.
 */
export function apenasTributosPorFora<T extends { tributo: TaxName }>(
  regimeRaw: unknown,
  segmento: CalcType,
  linhas: readonly T[],
): T[] {
  return linhas.filter((l) =>
    tributoExisteNoRegime(regimeRaw, l.tributo) && tributoExisteNoSegmento(segmento, l.tributo))
}
