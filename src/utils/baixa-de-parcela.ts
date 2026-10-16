/**
 * baixa-de-parcela.ts — o payload do UPDATE que dá baixa numa parcela.
 *
 * POR QUE ISTO EXISTE COMO MÓDULO, e não inline na tela
 * ------------------------------------------------------
 * O payload estava inline em `handleRegisterPayment` (`fluxo-de-caixa/index.tsx`), e
 * nenhum portão afirmava nada sobre ele — a mesma condição que deixou um `updated_at`
 * inexistente viver semanas no payload da edição (`edicao-de-lancamento.ts`). Separado, o
 * payload é um objeto que se compara campo a campo, e a baixa da ficha do cliente passa a
 * reusar o caminho em vez de escrever o segundo.
 *
 * AS DUAS COLUNAS QUE SÃO OPÇÃO EXPLÍCITA, DESLIGADAS POR PADRÃO
 * ---------------------------------------------------------------
 * `due_date` e `amount` NÃO entram no payload a menos que o chamador peça, e pedir é passar
 * um objeto — nunca um valor solto que possa chegar `undefined` por acidente.
 *
 * - **`due_date`** — vencimento é O COMBINADO; `paid_date` é o que aconteceu. Reescrever o
 *   vencimento no ato da baixa APAGA O ATRASO: a parcela que venceu há 40 dias passa a
 *   constar como paga em dia, e o histórico de inadimplência do cliente desaparece sem que
 *   nada falhe.
 * - **`amount`** — e esta é a trava que importa. Se o módulo aceitasse valor livremente,
 *   alguém daria baixa com valor diferente SEM passar pela redistribuição da série, e a
 *   diferença sumiria: a soma das parcelas deixaria de bater com o total da venda e nada
 *   acusaria. Pagar com outro valor é a 5c, pela RPC, com a redistribuição junto.
 *
 * O fluxo de caixa LIGA as duas, porque reagendar e corrigir valor é a função dele. A ficha
 * do cliente não liga nenhuma.
 *
 * `paid_by` NÃO EXISTE. "Quem deu a baixa" NÃO É RASTREÁVEL hoje, em caminho nenhum:
 * `cash_entries` tem 41 colunas e nenhuma delas é `paid_by` nem `updated_at` — medido em
 * `information_schema.columns` em 16/10/2026. A única tabela com `paid_by` é
 * `pending_receivables`, que é fonte paralela e não participa da baixa. Acrescentar a
 * coluna é migração, e migração é rodada própria.
 */

/** Opção explícita: o objeto é o "ligado". Ausente, a coluna fica FORA do payload. */
export interface ReagendarVencimento {
    /** `YYYY-MM-DD`. */
    para: string
}

/** Opção explícita: o objeto é o "ligado". Ausente, a coluna fica FORA do payload. */
export interface CorrigirValor {
    para: number
}

export interface EntradaDaBaixa {
    /** `YYYY-MM-DD` — o dia em que o dinheiro entrou. Obrigatório, SEM default. */
    pagoEm: string
    /** A forma. `null` grava `NULL`, que é o que o fluxo de caixa faz com o campo vazio. */
    forma: string | null
    /** DESLIGADO por padrão. Ver o cabeçalho: reescrever o vencimento apaga o atraso. */
    reagendar?: ReagendarVencimento
    /** DESLIGADO por padrão. Ver o cabeçalho: valor diferente é a 5c, pela RPC. */
    corrigirValor?: CorrigirValor
}

export interface PayloadDaBaixa {
    paid_date: string
    payment_method: string | null
    amount?: number
    due_date?: string
}

/**
 * O payload do UPDATE.
 *
 * A ORDEM DAS CHAVES é a do código que este módulo substituiu — `paid_date`,
 * `payment_method`, `amount`, `due_date` —, para que o diff de comportamento do fluxo de
 * caixa seja vazio até na serialização.
 */
export function montarPayloadDaBaixa(entrada: EntradaDaBaixa): PayloadDaBaixa {
    const payload: PayloadDaBaixa = {
        paid_date: entrada.pagoEm,
        payment_method: entrada.forma,
    }
    // `!== undefined`, e não um booleano separado: a opção É o objeto, então não existe
    // estado em que alguém ligue a coluna e esqueça o valor.
    if (entrada.corrigirValor !== undefined) payload.amount = entrada.corrigirValor.para
    if (entrada.reagendar !== undefined) payload.due_date = entrada.reagendar.para
    return payload
}

// ════════════════════════════════════════════════════════════════════════════════════════
// A ESCRITA
// ════════════════════════════════════════════════════════════════════════════════════════

/**
 * As formas do enum EM USO. A forma vive na PARCELA (`cash_entries.payment_method`), não
 * na venda: é por isso que ela pode mudar no ato da baixa sem tocar no documento.
 *
 * A lista é a das formas em uso, não a do enum inteiro — `cash-flow-types.ts` mapeia doze
 * chaves para rótulos de planilha, várias delas sinônimos históricos (`CHEQUE`,
 * `CHEQUES_A_VISTA`, `TRANSFERENCIA_BANCARIA`). Oferecer sinônimo na tela de baixa criaria
 * dado novo com chave velha.
 */
export const FORMAS_DA_BAIXA = [
    'BOLETO',
    'CARTAO_CREDITO',
    'CHEQUE_PRE_DATADO',
    'DINHEIRO',
    'LANCAMENTOS_A_RECEBER',
    'PIX',
] as const

export type FormaDaBaixa = (typeof FORMAS_DA_BAIXA)[number]

/**
 * O cliente de escrita, no mínimo que a baixa usa.
 *
 * É interface, e não o `SupabaseClient`, por duas razões: o portão consegue contar as
 * chamadas (é assim que se afirma "UMA linha, UM update"), e o módulo não arrasta o
 * `database.types.ts` desatualizado para dentro da asserção.
 */
export interface ConsultaDeEscrita extends PromiseLike<{ data: unknown; error: unknown }> {
    eq(coluna: string, valor: unknown): ConsultaDeEscrita
    is(coluna: string, valor: unknown): ConsultaDeEscrita
    select(colunas: string): ConsultaDeEscrita
}

export interface ClienteDeEscrita {
    from(tabela: string): { update(payload: object): ConsultaDeEscrita }
}

export interface ResultadoDaBaixa {
    /** `true` quando uma linha foi gravada. */
    gravou: boolean
    /** `true` quando o UPDATE não pegou linha nenhuma — a parcela JÁ ESTAVA PAGA. */
    jaEstavaPaga: boolean
    error: unknown
}

/**
 * Dá baixa em UMA parcela. Um `from`, um `update`, uma linha.
 *
 * IDEMPOTENTE POR `.is('paid_date', null)`, e esta é a primeira proteção contra dupla baixa
 * do repositório: os quatro caminhos que gravam `paid_date` hoje não têm nenhuma. Sem o
 * filtro, dois cliques (ou duas abas) gravam duas vezes — a segunda sobrescreve a data da
 * primeira em silêncio, e a parcela passa a dizer que foi paga num dia em que não foi.
 *
 * O `.select('id')` existe para DISTINGUIR "gravou" de "não pegou linha". Sem ele o
 * PostgREST devolve sucesso nos dois casos, e a tela diria "baixa registrada" para uma
 * parcela que outra pessoa acabou de baixar — `ausente-vs-falso.md`: zero linhas afetadas
 * não é a mesma afirmação que uma linha gravada.
 *
 * NÃO existe caminho em lote aqui, de propósito. Dar baixa em N parcelas é a 5c, e é pela
 * RPC — porque valor diferente exige redistribuir a série, e redistribuir em N `UPDATE`
 * soltos deixa a série inconsistente se o terceiro falhar.
 */
export async function darBaixaNaParcela(args: {
    cliente: ClienteDeEscrita
    parcelaId: string
    tenantId: string
    entrada: EntradaDaBaixa
}): Promise<ResultadoDaBaixa> {
    const payload = montarPayloadDaBaixa(args.entrada)
    const { data, error } = await args.cliente
        .from('cash_entries')
        .update(payload)
        .eq('id', args.parcelaId)
        .eq('tenant_id', args.tenantId)
        .is('paid_date', null)
        .select('id')

    if (error) return { gravou: false, jaEstavaPaga: false, error }
    const linhas = Array.isArray(data) ? data.length : 0
    return { gravou: linhas > 0, jaEstavaPaga: linhas === 0, error: null }
}

// ════════════════════════════════════════════════════════════════════════════════════════
// A CONFIRMAÇÃO
// ════════════════════════════════════════════════════════════════════════════════════════

export const TITULO_DA_CONFIRMACAO = 'Confirmar a baixa desta parcela'
export const ROTULO_DAR_BAIXA = 'Dar baixa'
export const ROTULO_CONFIRMAR_BAIXA = 'Confirmar baixa'
export const AVISO_SEM_FORMA = 'Sem forma de pagamento'

export interface FatosDaConfirmacao {
    valor: string
    codigoDaVenda: string | null
    vencimento: string | null
    forma: string | null
    pagoEm: string
}

/**
 * O texto que a confirmação mostra, NOMEANDO o que vai ser gravado.
 *
 * Escrita em dinheiro não acontece por um clique só, e uma confirmação que diga apenas
 * "tem certeza?" não é confirmação: ela não dá ao usuário nada para conferir. Os quatro
 * fatos são os que distinguem esta parcela de outra da mesma tela — valor, código da
 * venda, vencimento e forma.
 *
 * Recebe os valores JÁ FORMATADOS pelo chamador, que usa `formatBRL` e `diaBR`. É o que
 * permite ao portão comparar contra o produto daquelas funções em vez de contra um literal
 * escrito à mão — `assercao-negativa-que-nunca-falha.md`, e a regra vale para a positiva
 * quando o texto é formatado: `R$ 1.234,56` do `formatBRL` traz espaço NÃO SEPARÁVEL, e um
 * literal digitado com espaço comum nunca casa.
 */
export function textoDaConfirmacaoDaBaixa(f: FatosDaConfirmacao): string {
    const venda = f.codigoDaVenda ?? 'venda não identificada'
    const vencimento = f.vencimento ?? 'sem vencimento'
    const forma = f.forma ?? AVISO_SEM_FORMA
    return `Vai ser gravado: ${f.valor} · venda ${venda} · vencimento ${vencimento} · ${forma}. `
        + `A parcela passa a constar como PAGA em ${f.pagoEm}.`
}
