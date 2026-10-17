/**
 * baixa-de-parcela.ts — o payload do UPDATE que dá baixa numa parcela PELO FLUXO DE CAIXA.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ A FICHA DO CLIENTE NÃO PASSA MAIS POR AQUI PARA ESCREVER.                              ║
 * ║ Desde a …000003 (17/10/2026), toda baixa da ficha — simples, com valor diferente e em ║
 * ║ lote — vai por função do banco, pela rota, e grava autor no log. `darBaixaNaParcela`  ║
 * ║ e o cliente de escrita SAÍRAM deste módulo: deixá-los seria manter a segunda via de   ║
 * ║ escrita de dinheiro que a rodada existiu para fechar. Ver `baixa-pela-rota.ts`.        ║
 * ║ O que fica aqui serve ao FLUXO DE CAIXA (o payload) e à TELA (formas e textos).       ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * POR QUE ISTO EXISTE COMO MÓDULO, e não inline na tela
 * ------------------------------------------------------
 * O payload estava inline em `handleRegisterPayment` (`fluxo-de-caixa/index.tsx`), e
 * nenhum portão afirmava nada sobre ele — a mesma condição que deixou um `updated_at`
 * inexistente viver semanas no payload da edição (`edicao-de-lancamento.ts`). Separado, o
 * payload é um objeto que se compara campo a campo.
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
 * O fluxo de caixa LIGA as duas, porque reagendar e corrigir valor é a função dele.
 *
 * QUEM DEU A BAIXA: pela ficha, o log (`parcela_reajuste_log.criado_por`). Pelo fluxo de
 * caixa, NINGUÉM — `cash_entries` não tem `paid_by`, e este payload continua sem autor. É o
 * limite conhecido desta rodada: ela fechou a ficha, não o fluxo de caixa.
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
    /**
     * A forma. `null` grava `NULL`, que é o que o fluxo de caixa faz com o campo vazio.
     * AUSENTE (`undefined`) não escreve a coluna — não escrever o que ninguém mandou
     * escrever. São três estados, e os três são distintos: valor, `NULL` gravado, coluna
     * intocada.
     */
    forma?: string | null
    /** DESLIGADO por padrão. Ver o cabeçalho: reescrever o vencimento apaga o atraso. */
    reagendar?: ReagendarVencimento
    /** DESLIGADO por padrão. Ver o cabeçalho: valor diferente é a 5c, pela RPC. */
    corrigirValor?: CorrigirValor
}

export interface PayloadDaBaixa {
    paid_date: string
    payment_method?: string | null
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
    const payload: PayloadDaBaixa = { paid_date: entrada.pagoEm }
    // `!== undefined`: `null` é escolha (grava NULL), ausente é não tocar na coluna.
    if (entrada.forma !== undefined) payload.payment_method = entrada.forma
    // `!== undefined`, e não um booleano separado: a opção É o objeto, então não existe
    // estado em que alguém ligue a coluna e esqueça o valor.
    if (entrada.corrigirValor !== undefined) payload.amount = entrada.corrigirValor.para
    if (entrada.reagendar !== undefined) payload.due_date = entrada.reagendar.para
    return payload
}

// ════════════════════════════════════════════════════════════════════════════════════════
// AS FORMAS
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
