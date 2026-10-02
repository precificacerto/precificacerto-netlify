/**
 * O SEGMENTO da construção, e a despesa que ELE põe no coeficiente.
 *
 * ── O defeito que este módulo fecha, medido em 17/09/2026 ────────────────────
 *
 * `budget-decomposition-input.ts:149` e `orcamentos/index.tsx:946` diziam, os dois:
 *
 *     segment: item.isService ? 'SERVICO' : 'INDUSTRIALIZACAO',
 *
 * Dois segmentos onde a matriz tem TRÊS, escrito DUAS vezes — `copia-divergente.md`
 * já na origem. A decomposição **inferia** o formato em vez de ler o que a construção
 * usou, que é o que `regime-e-segmento-determinam-a-construcao.md` proíbe:
 *
 *   > A decomposição NÃO INFERE, ela LÊ o que a construção usou.
 *
 * E a consequência era numérica, não teórica. Medido com o tenant SERVIÇO real
 * (fixa 50,06% · variável 17,09% · financeira 3,37% · MOI 0), custo R$ 1.000,
 * ISS 5%, PIS/COFINS 9,25%, IBS 1% + CBS 9%, comissão 5%, lucro 10%:
 *
 *   | linha    | construção | decomposição |      delta |
 *   |----------|-----------:|-------------:|-----------:|
 *   | despesas |     492,90 |     1.698,88 | **+1.205,98** |
 *   | RRO      |    +419,18 |      −786,80 | **−1.205,98** |
 *
 * Todas as outras linhas batiam ao centavo. O delta é exatamente
 * `2.409,07 × 50,06%` — a despesa fixa inteira, contada DUAS VEZES: uma dentro do
 * custo em R$ por minuto, outra no percentual sobre a receita. O RRO ficava
 * NEGATIVO, e repartir um resíduo negativo devolve comissão e lucro negativos.
 *
 * É a dupla contagem que a Parte 0 de `cascata-lucro-real.md` proíbe com todas as
 * letras:
 *
 *   > No serviço, MO indireta e despesa fixa entram no custo em R$ e ficam FORA da
 *   > margem de contribuição. **Nunca nos dois lugares — isso é dupla contagem.**
 *
 * ── SÃO DOIS SEGMENTOS, e confundi-los é o defeito espelhado ─────────────────
 *
 * A primeira versão deste módulo tinha UMA função para os dois usos, e estava errada
 * num caso: **produto de REVENDA num tenant de SERVIÇO**. A construção decide as duas
 * coisas por critérios DIFERENTES, e está escrito assim nas telas:
 *
 * | pergunta | quem decide | onde está na construção |
 * |---|---|---|
 * | quais tributos existem e de que lado (a MATRIZ) | o **PRODUTO** primeiro: revenda é revenda em qualquer tenant | `product-price.component.tsx:206` |
 * | qual despesa entra no coeficiente | o **TENANT**: `isCalcService` é `currentUser.calcType === SERVICE`, e o tipo do produto não participa | `products/content.component.tsx:832` |
 *
 * Com uma função só, um produto de revenda num tenant de serviço recebia a despesa
 * COMPLETA, quando a construção lhe dá só variável + financeira — a mesma dupla
 * contagem, num caso mais estreito. Achado ao conferir este módulo contra
 * `structurePctForEngine` antes de empurrar, não por teste vermelho.
 *
 * ── POR QUE UM MÓDULO, e não a regra repetida dos dois lados ────────────────
 *
 * Porque o critério já existia — nas telas de produto e de serviço. Escrevê-lo de novo
 * na decomposição seria `copia-divergente.md`: o mesmo critério em dois lugares, um
 * deles esquecendo um caso, e nada falha. Os dois lados passam a LER daqui.
 *
 * E o agrupamento da MO produtiva em segmentação REVENDA não é reescrito aqui: ele é
 * LIDO de `resolveIndirectLaborPct`, que é a fonte única da construção.
 */

import { resolveIndirectLaborPct } from './indirect-labor-grouping'

export type SegmentoDaConstrucao = 'INDUSTRIALIZACAO' | 'REVENDA' | 'SERVICO'

/** Os baldes de despesa operacional do tenant, em FRAÇÃO [0, 1]. */
export interface BaldesDeDespesa {
  /** `fixed_expense_percent` — aluguel e afins. */
  fixa: number
  /** `variable_expense_percent` — cresce e encolhe com o volume. */
  variavel: number
  /** `financial_expense_percent` — taxa de cartão e afins. */
  financeira: number
  /** `admin_labor_percent` — a MO indireta / administrativa. */
  indireta: number
  /**
   * `financial_commitments_percent` — o COMPROMISSOS FINANCEIROS, em fração.
   *
   * §0 do comando de 02/10/2026: ele SAIU de `fixa` e virou balde próprio, **com o mesmo
   * percentual, no mesmo divisor**. `fixa + compromisso` é a `fixa` de antes, ao centavo, e por
   * isso `resolveDespesasOperacionaisPct` devolve o mesmo número.
   *
   * >>> E ELE **NÃO** SEGUE A `fixa` NO SEGMENTO SERVIÇO — ADENDO 3, 02/10/2026 <<<
   *
   * Até 02/10/2026 ele seguia: em SERVICO a `fixa` fica FORA do coeficiente porque já está no
   * custo em R$ por minuto, e o compromisso saíra de dentro dela. O dono do produto decidiu
   * outra coisa, e a decisão é sobre NATUREZA, não sobre proveniência:
   *
   *   > No serviço a despesa tem um cálculo diferente, ela vai no numerador. Compromisso
   *   > financeiro ele vai no denominador, na margem de contribuição.
   *
   * Então em SERVICO ele entra no coeficiente, e para isso TEM de ter saído do custo por minuto
   * — `mediaMensalDaDespesaFixa` em `recalc-expense-config.ts` é a outra metade desta mudança, e
   * sem ela isto é a dupla contagem que este módulo existe para impedir (mutação S1 do §4).
   *
   * **Consequência medida, e ela não é cosmética: o preço do serviço MUDA.** É esperado pelo
   * §2 do ADENDO 3; a trava do §0 continua inteira em INDUSTRIALIZACAO e REVENDA, onde
   * `fixa + compromisso` é a `fixa` de antes ao centavo.
   *
   * OBRIGATÓRIO por `construtor-empobrecido.md`: é campo de cálculo, e o custo de torná-lo
   * obrigatório é exatamente o benefício — o compilador enumera quem esquecer, em vez de o
   * preço cair em silêncio.
   */
  compromisso: number
  /**
   * `production_labor_percent` — a MO PRODUTIVA, em fração.
   *
   * Só entra em segmentação REVENDA, agrupada com a indireta: lá não há minuto sobre
   * o qual ratear a folha, então ela só pode entrar como percentual. Ver
   * `indirect-labor-grouping.ts`, que é quem decide isso — aqui ela é só transportada.
   *
   * OBRIGATÓRIA por `construtor-empobrecido.md`: é campo de cálculo, e o custo de
   * torná-la obrigatória é exatamente o benefício — o compilador enumera quem esquecer.
   */
  moProdutiva: number
}

const frac = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** Banco grava `REVENDA`; parte da UI carrega `RESALE`. Mesma normalização de `expense-destination.ts`. */
const norm = (v: unknown): string => {
  const up = String(v ?? '').trim().toUpperCase()
  if (up === 'RESALE') return 'REVENDA'
  if (up === 'INDUSTRIALIZATION') return 'INDUSTRIALIZACAO'
  if (up === 'SERVICE') return 'SERVICO'
  return up
}

/** A segmentação do TENANT, normalizada. Desconhecida cai em INDUSTRIALIZACAO, o default da construção. */
function segmentoDoTenant(tenantCalcType: unknown): SegmentoDaConstrucao {
  const t = norm(tenantCalcType)
  if (t === 'REVENDA') return 'REVENDA'
  if (t === 'SERVICO') return 'SERVICO'
  return 'INDUSTRIALIZACAO'
}

export interface SegmentoArgs {
  /** O item é um SERVIÇO cadastrado? Vence tudo — serviço é serviço em qualquer tenant. */
  isService?: boolean | null
  /** `products.product_type`. `REVENDA` força o segmento REVENDA, como na construção. */
  productType?: string | null
  /** `tenant_settings.calc_type`. Decide o segmento quando o produto não é de revenda. */
  tenantCalcType?: string | null
  /**
   * O item é uma MERCADORIA (linha de `products`)? Mercadoria nunca é SERVICO.
   *
   * Sem este sinal, um produto `PRODUZIDO` num tenant de SERVIÇO caía na segmentação do
   * tenant e recebia a matriz do serviço — ICMS INEXISTENTE e ISS POR DENTRO num produto.
   * A tela de produto nunca fez isso: `product-price.component.tsx:206` manda REVENDA
   * nesse caso, e esta função passa a dizer o mesmo.
   *
   * Exposição medida em 17/09/2026: **0**. Os 18 produtos em tenant de SERVIÇO são todos
   * `product_type = REVENDA`, e a linha acima já os resolvia. O sinal existe para que o
   * primeiro `PRODUZIDO` cadastrado ali não descubra pela alíquota errada.
   */
  isProduct?: boolean | null
}

/**
 * O segmento da MATRIZ — quais tributos existem e de que lado.
 *
 * A ordem é a de `product-price.component.tsx:206` e não é arbitrária: **produto de
 * revenda é REVENDA em qualquer tenant**, e é isso que faz o IPI ser INEXISTENTE nele.
 * Inverter faria um item de revenda num tenant industrial ganhar linha de IPI — um
 * tributo que a construção recusa naquele formato.
 *
 * NÃO use esta função para decidir despesa: ver `resolveSegmentoDaDespesa`.
 */
export function resolveSegmentoDaConstrucao(args: SegmentoArgs): SegmentoDaConstrucao {
  if (args.isService) return 'SERVICO'
  if (norm(args.productType) === 'REVENDA') return 'REVENDA'
  const tenant = segmentoDoTenant(args.tenantCalcType)
  // Mercadoria não vira SERVICO por causa do tenant — ver `isProduct`.
  if (tenant === 'SERVICO' && args.isProduct) return 'REVENDA'
  return tenant
}

/**
 * O segmento que decide a DESPESA — o `isCalcService` de `products/content.component.tsx`.
 *
 * O tipo do produto NÃO participa: um produto de revenda num tenant de serviço recebe a
 * despesa do SERVIÇO, porque a fixa e a MO já estão no custo por minuto daquele tenant.
 * Quem é serviço cadastrado recebe a do serviço em qualquer tenant, porque a tela de
 * serviço usa `(variável + financeira)` sem olhar o `calc_type`.
 */
export function resolveSegmentoDaDespesa(
  args: Pick<SegmentoArgs, 'isService' | 'tenantCalcType'>,
): SegmentoDaConstrucao {
  if (args.isService) return 'SERVICO'
  return segmentoDoTenant(args.tenantCalcType)
}

/**
 * A despesa que entra no COEFICIENTE, por segmento — a mesma regra de
 * `structurePctForEngine` (`products/content.component.tsx:832`) e do `structurePct` da
 * tela de serviço (`services/content.component.tsx:352`).
 *
 * | segmento          | o que entra                              | por quê |
 * |-------------------|------------------------------------------|---------|
 * | SERVICO           | variável + financeira + **COMPROMISSO**  | fixa e MO JÁ estão no custo em R$, por minuto, e por isso ficam fora. O COMPROMISSO **não** está mais lá — ADENDO 3 o tirou do numerador e o pôs aqui |
 * | REVENDA           | fixa + COMPROMISSO + variável + financeira + (MOI + MO produtiva) | não há minuto sobre o qual ratear: a MO produtiva só pode entrar como percentual, agrupada com a indireta |
 * | INDUSTRIALIZACAO  | fixa + COMPROMISSO + variável + financeira + MOI | a MO PRODUTIVA vira custo por tempo, e por isso NÃO entra aqui |
 *
 * Fora de SERVICO o COMPROMISSO acompanha a `fixa` e a soma é a de antes ao centavo, então
 * nenhum preço se move — a trava do §0 de 02/10/2026, intacta. Em SERVICO ele é termo NOVO do
 * denominador e o preço MUDA: é o §2 do ADENDO 3, e é a única exceção à trava.
 *
 * O compromisso aparece em UM dos dois lados, nunca nos dois. Em SERVICO ele está no
 * denominador aqui e FORA de `fixed_expense_monthly`; nos outros dois ele está no denominador
 * e não existe custo por minuto de onde sair.
 *
 * O primeiro argumento é o segmento da DESPESA (`resolveSegmentoDaDespesa`), nunca o da
 * matriz.
 */
export function resolveDespesasOperacionaisPct(
  segmentoDaDespesa: SegmentoDaConstrucao,
  baldes: BaldesDeDespesa,
): number {
  const variavel = frac(baldes.variavel)
  const financeira = frac(baldes.financeira)
  if (segmentoDaDespesa === 'SERVICO') return variavel + financeira + frac(baldes.compromisso)
  // O agrupamento da MO produtiva é LIDO da fonte única da construção, não reescrito.
  // A função é uma SOMA, então vale em fração tanto quanto em base 100.
  const indireta = resolveIndirectLaborPct({
    tenantCalcType: segmentoDaDespesa,
    indirectLaborPct: frac(baldes.indireta),
    productiveLaborPct: frac(baldes.moProdutiva),
  })
  return frac(baldes.fixa) + frac(baldes.compromisso) + variavel + financeira + indireta
}

/**
 * O DIVISOR DA ESTRUTURA, por segmento — em base 100, como as telas o carregam.
 *
 * >>> POR QUE ESTA FUNÇÃO EXISTE, e é o remédio e não organização <<<
 *
 * O critério "qual balde de despesa entra no divisor, por segmento" estava escrito QUATRO
 * vezes: `products/content.component.tsx` (`structurePctForEngine`, que alimenta o motor),
 * `products/product-price.component.tsx` (o `structurePct` do `_matriz`, que a tela exibe),
 * `compute-service-price.ts` e `services/content.component.tsx`. `resolveDespesasOperacionaisPct`
 * ao lado é a quinta, para a decomposição.
 *
 * A mutação (S4b) do ADENDO 3 — somar o compromisso DUAS VEZES no divisor fora do serviço —
 * SOBREVIVEU à suíte inteira de 3.583 casos, porque nenhum deles alcançava aquele ternário:
 * ele é uma constante local, e o preço do motor não é afirmado a partir dela. É o
 * `portao-que-nao-alcanca.md` no nível do caso: o instrumento não chegava no arquivo.
 *
 * Exportar é o que `teste-que-nao-exercita.md` manda fazer nessa situação — "quando a pergunta
 * 3 não tem resposta boa porque a função não é exportada, exporte a função". O custo é esta
 * declaração; o que se compra é poder afirmar o NÚMERO do divisor.
 *
 * >>> POR QUE ELA NÃO É `resolveDespesasOperacionaisPct` <<<
 *
 * Porque o AGRUPAMENTO da MO não é o mesmo nos dois usos, e unificá-los mudaria preço. Em
 * `content.component.tsx` o agrupamento REVENDA só vale quando o tenant é RESALE **e** o
 * produto é `REVENDA`; `resolveSegmentoDaDespesa` devolve REVENDA para o tenant RESALE
 * independentemente do produto. Por isso a MO INDIRETA chega aqui JÁ AGRUPADA pelo chamador:
 * esta função decide os baldes de despesa, nunca o agrupamento da mão de obra.
 *
 * A ORDEM DA SOMA é a de `build-calc-base.ts` (`fixa + variável + financeira + compromisso`),
 * de propósito: trocá-la mudaria o último bit do divisor, e a trava do §0 é ao centavo.
 */
export function divisorDaEstruturaPct(args: {
  segmentoDaDespesa: SegmentoDaConstrucao
  fixaPct: number
  variavelPct: number
  financeiraPct: number
  compromissoPct: number
  /** MO indireta JÁ agrupada pelo chamador. Ignorada em SERVICO, onde ela é custo em R$. */
  indiretaAgrupadaPct: number
}): number {
  const variavel = Number(args.variavelPct) || 0
  const financeira = Number(args.financeiraPct) || 0
  const compromisso = Number(args.compromissoPct) || 0
  // SERVICO: a fixa e a MO são NUMERADOR — custo por minuto, em R$. O compromisso NÃO é, desde
  // o ADENDO 3, e por isso é o único dos três que aparece aqui.
  if (args.segmentoDaDespesa === 'SERVICO') return variavel + financeira + compromisso
  const fixa = Number(args.fixaPct) || 0
  return fixa + variavel + financeira + compromisso + (Number(args.indiretaAgrupadaPct) || 0)
}
