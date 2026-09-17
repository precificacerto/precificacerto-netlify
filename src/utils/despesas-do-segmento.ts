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
  return segmentoDoTenant(args.tenantCalcType)
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
 * | SERVICO           | variável + financeira                    | fixa e MO JÁ estão no custo em R$, por minuto. Somá-las aqui é dupla contagem |
 * | REVENDA           | fixa + variável + financeira + (MOI + MO produtiva) | não há minuto sobre o qual ratear: a MO produtiva só pode entrar como percentual, agrupada com a indireta |
 * | INDUSTRIALIZACAO  | fixa + variável + financeira + MOI       | a MO PRODUTIVA vira custo por tempo, e por isso NÃO entra aqui |
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
  if (segmentoDaDespesa === 'SERVICO') return variavel + financeira
  // O agrupamento da MO produtiva é LIDO da fonte única da construção, não reescrito.
  // A função é uma SOMA, então vale em fração tanto quanto em base 100.
  const indireta = resolveIndirectLaborPct({
    tenantCalcType: segmentoDaDespesa,
    indirectLaborPct: frac(baldes.indireta),
    productiveLaborPct: frac(baldes.moProdutiva),
  })
  return frac(baldes.fixa) + variavel + financeira + indireta
}
