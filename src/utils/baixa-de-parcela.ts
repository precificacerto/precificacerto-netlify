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
