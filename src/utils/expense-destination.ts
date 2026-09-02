/**
 * expense-destination.ts — para CADA ITEM, o destino de cada categoria: CUSTO, MC ou FORA.
 *
 * PRINCÍPIO (regra canônica do dono do produto):
 *   O destino NÃO é propriedade da categoria — é propriedade da CONSTRUÇÃO daquele item.
 *   A mesma categoria (MO Produtiva, MO Indireta, Despesa Fixa) pode ser custo num item e
 *   margem noutro, DENTRO DO MESMO ORÇAMENTO.
 *
 * TRÊS DESTINOS, NÃO DOIS:
 *   CUSTO  — entra no CMV/CSV em R$, medido por tempo ou consumo.
 *   MC     — entra no denominador como percentual.
 *   FORA   — não entra em lugar nenhum: já foi absorvida por outro item.
 *
 * **FORA NÃO É ZERO.** É ausência deliberada. A categoria já está no custo por minuto do core
 * business, e cobrá-la de novo no item acessório seria dupla incidência. A distinção importa
 * porque o valor é o mesmo (nada entra na MC), mas a afirmação é outra — e é a afirmação que
 * a Etapa 4 usa para decidir se soma a fração ao custo.
 *
 * TABELA DE DESTINOS — item do MESMO TIPO da segmentação (core business):
 * ┌──────────────────────┬──────────────────────┬───────────────────┬─────────────────────┐
 * │ Categoria            │ Revenda              │ Industrialização  │ Prestação de Serviço│
 * ├──────────────────────┼──────────────────────┼───────────────────┼─────────────────────┤
 * │ Custo do item        │ CUSTO                │ CUSTO             │ CUSTO               │
 * │ MO Produtiva         │ MC (c/ Indireta)     │ CUSTO (por tempo) │ CUSTO (por tempo)   │
 * │ MO Indireta          │ MC (c/ Produtiva)    │ MC                │ CUSTO               │
 * │ Despesa Fixa         │ MC                   │ MC                │ CUSTO               │
 * │ Var / Fin / Impostos │ MC                   │ MC                │ MC                  │
 * │ RT / Comissão / Lucro│ MC                   │ MC                │ MC                  │
 * └──────────────────────┴──────────────────────┴───────────────────┴─────────────────────┘
 *
 * TABELA — item de REVENDA em tenant de OUTRA segmentação (acessório):
 * ┌──────────────────────┬──────────────────────────┬─────────────────────────┐
 * │ Categoria            │ Tenant Industrialização  │ Tenant Serviço          │
 * ├──────────────────────┼──────────────────────────┼─────────────────────────┤
 * │ Custo do item        │ CUSTO                    │ CUSTO                   │
 * │ MO Produtiva         │ FORA                     │ FORA                    │
 * │ MO Indireta          │ MC                       │ FORA                    │
 * │ Despesa Fixa         │ MC                       │ FORA                    │
 * │ Var / Fin / demais   │ MC                       │ MC                      │
 * └──────────────────────┴──────────────────────────┴─────────────────────────┘
 *
 * RAZÃO DA DIFERENÇA entre as duas colunas acima: em tenant SERVIÇO as três estão TODAS
 * dentro do custo por minuto da prestação, e nenhuma pode reincidir sobre a revenda. Em
 * tenant INDUSTRIALIZAÇÃO só a MO Produtiva está no custo por tempo, então MO Indireta e
 * Despesa Fixa seguem como percentual e alcançam a revenda normalmente.
 *
 * EM SERVIÇO as três chegam ao custo POR RATEIO DE TEMPO: não são linhas de custo separadas
 * na formação, são diluídas na taxa por minuto —
 *   custo por minuto = (MO Produtiva salariada + MO Indireta + Despesa Fixa) ÷ minutos produtivos
 *   custo do serviço = insumos + (custo por minuto × minutos do serviço)
 * O minuto informado no cadastro CARREGA o rateio das três. Mão de obra COMISSIONADA não entra
 * aí: vai para a MC como percentual, junto com a comissão.
 *
 * FORA DE ESCOPO (combinações ainda não definidas pela regra): item de serviço em tenant
 * Revenda ou Industrialização, e item de industrialização em tenant Serviço ou Revenda. Estas
 * caem no comportamento do core business da própria construção, sem exceção aplicada.
 *
 * NOTA sobre a leitura da segmentação: esta função recebe o `calc_type` que o chamador tem em
 * mãos, hoje o ATUAL do tenant. A regra manda congelar o destino por item no momento da
 * formação do preço — é o D-A, defeito próprio, ainda não corrigido. Quando o snapshot de
 * destino existir, o argumento passa a vir dele e a tabela aqui não muda.
 */

/** Destino de uma categoria PARA UM ITEM. */
export type ExpenseDestination = 'CUSTO' | 'MARGEM' | 'FORA'

/**
 * Construção do item — a coluna da tabela de destinos.
 *
 * Não é o segmento do tenant: um tenant de serviço vende produto de revenda, e cada um dos
 * dois itens tem a sua própria construção dentro do mesmo orçamento.
 */
export type ItemConstruction = 'INDUSTRIALIZACAO' | 'REVENDA' | 'SERVICO'

/** As categorias cujo destino varia com a construção. */
export interface CategoryDestinations {
    /** MO Produtiva (salariada). Não é balde de DOP: entra no CMV por tempo, ou na MC agrupada. */
    mo_produtiva: ExpenseDestination
    /** MO Administrativa / MO Indireta. */
    mo_indireta: ExpenseDestination
    despesa_fixa: ExpenseDestination
    despesa_variavel: ExpenseDestination
    despesa_financeira: ExpenseDestination
}

/** Os quatro baldes que a Etapa 5 consolida (subconjunto de `CategoryDestinations`). */
export interface DopDestinations {
    /** MO Administrativa / MO Indireta. */
    mo_admin: ExpenseDestination
    fixa: ExpenseDestination
    variavel: ExpenseDestination
    financeira: ExpenseDestination
}

export interface DopComponents {
    mo_admin: number
    fixa: number
    variavel: number
    financeira: number
}

export interface ItemConstructionInput {
    /** Item de serviço (`budget_items.service_id` / `sale_items.service_id`). */
    service_id?: string | null
    /** `products.product_type` — 'PRODUZIDO' ⇒ industrialização; 'REVENDA' ⇒ revenda. */
    product_type?: string | null
}

function normalize(v: unknown): string {
    return String(v ?? '').trim().toUpperCase()
}

/**
 * Construção do item, na ordem em que o dado é confiável.
 *
 * Item com `service_id` é prestação de serviço — nenhum outro campo pode contradizer isso.
 * Sem `service_id`, `product_type = 'PRODUZIDO'` é industrialização.
 *
 * DEFAULT REVENDA (e não industrialização) quando o tipo não chegou: é a construção mais
 * conservadora para um item sem cadastro — não reivindica tempo de produção que ele pode não
 * ter, e é onde as exceções de tenant se aplicam.
 */
export function resolveItemConstruction(item: ItemConstructionInput): ItemConstruction {
    if (item.service_id) return 'SERVICO'
    return normalize(item.product_type) === 'PRODUZIDO' ? 'INDUSTRIALIZACAO' : 'REVENDA'
}

/**
 * Destino de TODAS as categorias variáveis, para um item.
 *
 * @param construction construção do item (não do tenant)
 * @param tenantCalcType segmentação do tenant (`tenant_settings.calc_type`) — decide se o item
 *        é core business ou acessório, e com isso qual das duas tabelas se aplica.
 */
export function resolveCategoryDestinations(
    construction: ItemConstruction,
    tenantCalcType?: string | null,
): CategoryDestinations {
    // Variável e financeira são MC nas três construções e nos dois papéis, sem exceção.
    const mcSempre = { despesa_variavel: 'MARGEM', despesa_financeira: 'MARGEM' } as const
    const segmento = normalize(tenantCalcType)
    const isCoreBusiness = segmento === construction

    // ── Item acessório: revenda em tenant de outra segmentação ──
    if (construction === 'REVENDA' && !isCoreBusiness && segmento) {
        if (segmento === 'SERVICO') {
            // As três já estão no custo por minuto da prestação. Nenhuma reincide.
            return { mo_produtiva: 'FORA', mo_indireta: 'FORA', despesa_fixa: 'FORA', ...mcSempre }
        }
        if (segmento === 'INDUSTRIALIZACAO') {
            // Só a MO Produtiva está no custo por tempo; as outras duas alcançam a revenda.
            return { mo_produtiva: 'FORA', mo_indireta: 'MARGEM', despesa_fixa: 'MARGEM', ...mcSempre }
        }
    }

    // ── Core business (e as combinações ainda não definidas, que caem na própria construção) ──
    if (construction === 'SERVICO') {
        // As três diluídas na taxa por minuto: são CUSTO, não margem.
        return { mo_produtiva: 'CUSTO', mo_indireta: 'CUSTO', despesa_fixa: 'CUSTO', ...mcSempre }
    }
    if (construction === 'INDUSTRIALIZACAO') {
        return { mo_produtiva: 'CUSTO', mo_indireta: 'MARGEM', despesa_fixa: 'MARGEM', ...mcSempre }
    }
    // REVENDA core: MO Produtiva é MC, agrupada com a Indireta numa linha só.
    return { mo_produtiva: 'MARGEM', mo_indireta: 'MARGEM', despesa_fixa: 'MARGEM', ...mcSempre }
}

/** Recorte de `resolveCategoryDestinations` para os quatro baldes da Etapa 5. */
export function resolveDopDestinations(
    construction: ItemConstruction,
    tenantCalcType?: string | null,
): DopDestinations {
    const d = resolveCategoryDestinations(construction, tenantCalcType)
    return {
        mo_admin: d.mo_indireta,
        fixa: d.despesa_fixa,
        variavel: d.despesa_variavel,
        financeira: d.despesa_financeira,
    }
}

/**
 * Zera os baldes cujo destino NÃO é margem.
 *
 * "Contribui com ZERO para aquela linha da MC" é literal, e vale igual para CUSTO e para
 * FORA: não é o percentual médio, não é o percentual do tenant — é zero. O que distingue os
 * dois é o outro lado: destino CUSTO soma a parcela de conversão ao CMV, destino FORA não a soma
 * a lugar nenhum. Ver `conversionCostEntersCmv`.
 */
export function applyDopDestinations(
    components: DopComponents,
    destinations: DopDestinations,
): DopComponents {
    const keep = (v: number, d: ExpenseDestination) => (d === 'MARGEM' ? v : 0)
    return {
        mo_admin: keep(components.mo_admin, destinations.mo_admin),
        fixa: keep(components.fixa, destinations.fixa),
        variavel: keep(components.variavel, destinations.variavel),
        financeira: keep(components.financeira, destinations.financeira),
    }
}

/** Atalho: resolve a construção, resolve os destinos e aplica, em uma chamada. */
export function resolveItemDopComponents(args: {
    item: ItemConstructionInput
    components: DopComponents
    tenantCalcType?: string | null
}): { components: DopComponents; construction: ItemConstruction; destinations: DopDestinations } {
    const construction = resolveItemConstruction(args.item)
    const destinations = resolveDopDestinations(construction, args.tenantCalcType)
    return {
        components: applyDopDestinations(args.components, destinations),
        construction,
        destinations,
    }
}

/** Soma dos quatro baldes — o `dop_pct` do item depois de aplicados os destinos. */
export function sumDopComponents(c: DopComponents): number {
    return c.mo_admin + c.fixa + c.variavel + c.financeira
}

// ──────────────── O lado do CUSTO: o item leva ao CMV o que o destino manda ────────────────

/**
 * A parcela de CONVERSÃO do item entra no CMV?
 *
 * Conversão é o `productive_labor_unit`: MO Produtiva num produto e, num item de serviço, o
 * `minutos × custo por minuto` — que já vem com MO Produtiva, MO Indireta e Despesa Fixa
 * SOMADAS dentro dele. **Ela chega agregada e assim permanece**, por decisão do dono do
 * produto:
 *
 *   > O objetivo da cascata é ENCONTRAR O RRO COM PRECISÃO; para isso basta o CUSTO TOTAL
 *   > correto e as DESPESAS DE MC corretas. A abertura por categoria dentro do custo é
 *   > AUDITORIA, não requisito de cálculo.
 *
 * Não há, portanto, rastreio de fração por categoria aqui: há uma pergunta de sim ou não sobre
 * um valor que o item já traz pronto. Reabrir aquele valor exigiria estender o snapshot do
 * serviço ou reler o `tenant_expense_config` de hoje — e reler o parâmetro de hoje para
 * decompor um preço de ontem é a classe `fato-vs-referencia`.
 *
 * POR QUE O DESTINO DA MO PRODUTIVA DECIDE PELO BALDE INTEIRO: nas células em que a conversão
 * carrega mais de uma categoria — construção SERVIÇO, e revenda em tenant de SERVIÇO — as três
 * têm o MESMO destino (CUSTO nas três; FORA nas três). Onde os destinos divergem —
 * industrialização, e revenda em tenant de industrialização — a conversão carrega SÓ MO
 * Produtiva. Logo a pergunta é exata em TODAS as células. O teste percorre as nove, para que a
 * premissa não deixe de valer em silêncio se a matriz mudar.
 *
 * **FORA zera; CUSTO e MARGEM mantêm.** A assimetria é o limite entre dois defeitos:
 *
 * - FORA significa "já absorvida por outro item". Somá-la de novo é dupla incidência, e é o
 *   que este PR corrige: item de revenda em tenant de serviço ou de industrialização não leva
 *   MO Produtiva ao CMV.
 * - MARGEM na conversão é REVENDA core, e ali a MO Produtiva que vai para a MC é o PERCENTUAL
 *   DO TENANT (agrupado com a MO Indireta — ver `indirect-labor-grouping.ts`), não o
 *   `productive_labor_unit` do produto. São fontes diferentes: tirar esta daqui sem que
 *   ninguém a receba do outro lado mudaria preço sem defeito que o justifique.
 */
export function conversionCostEntersCmv(destinations: CategoryDestinations): boolean {
    return destinations.mo_produtiva !== 'FORA'
}

/**
 * O custo unitário do item depois de aplicado o destino: insumos sempre, conversão só quando
 * o destino dela não é FORA.
 *
 * O custo do item (`cost_total`) é CUSTO nas três construções e nos dois papéis — nunca é
 * filtrado. É a conversão que varia.
 */
export function resolveItemCostUnit(args: {
    item: ItemConstructionInput
    /** `cost_total` — insumos / mercadoria. */
    itemCost: number
    /** `productive_labor_unit` — a parcela de conversão, agregada. */
    conversionCost: number
    tenantCalcType?: string | null
}): { costUnit: number; construction: ItemConstruction; destinations: CategoryDestinations } {
    const construction = resolveItemConstruction(args.item)
    const destinations = resolveCategoryDestinations(construction, args.tenantCalcType)
    const conversao = conversionCostEntersCmv(destinations) ? args.conversionCost : 0
    return { costUnit: args.itemCost + conversao, construction, destinations }
}
