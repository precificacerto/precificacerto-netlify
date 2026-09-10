/**
 * document-deleted.ts — o critério ÚNICO de "documento excluído".
 *
 * POR QUE STATUS E NÃO `is_active`
 * ---------------------------------
 * O filtro "mostrar excluídos" é REQUISITO, e `is_active` NÃO DISTINGUE EXCLUÍDO de
 * CANCELADO: o cancelamento já grava `is_active = false` (ver `cancel_sale_cascade`), então
 * os dois estados virariam o mesmo booleano e o filtro seria impossível de escrever sem
 * ambiguidade. Medido em 06/09/2026, `is_active` já carrega dois significados que divergem do
 * status — 3 budgets DRAFT e 3 sales COMPLETED, todos com `is_active = false`.
 *
 * Por isso o marcador é `status = 'EXCLUIDO'`, e este módulo é o único lugar que sabe disso.
 *
 * A RELAÇÃO COM O `active-record-filter.ts` DO #43
 * -------------------------------------------------
 * Aquele módulo é o critério de EXCLUSÃO LÓGICA DE CADASTRO (produto, serviço, item), onde
 * `is_active` é o marcador e a distinção que importa é listagem × leitura de documento. Este
 * é o critério de DOCUMENTO EXCLUÍDO, onde o marcador é o status. São dois conceitos, dois
 * módulos — e é de propósito que não se misturem: juntá-los reintroduziria a ambiguidade que
 * motivou a escolha do status.
 *
 * CANCELAR × EXCLUIR, que é o que estes dois valores significam:
 *   CANCELLED → voltou à etapa anterior, PODE ser retomado.
 *   EXCLUIDO  → última instância, como se a evolução nunca tivesse chegado ali. Irreversível.
 */

/** O valor gravado em `budgets.status`, `orders.status` e `sales.status`. */
export const STATUS_EXCLUIDO = 'EXCLUIDO'

/**
 * Filtro PostgREST para `.not(...)`: traz tudo MENOS os excluídos.
 *
 * Usado como `.neq('status', STATUS_EXCLUIDO)`. Documento sem status (`null`) NÃO é excluído —
 * ausência é "nunca classificado", nunca "excluído" (`.claude/rules/ausente-vs-falso.md`), e
 * `neq` em SQL descarta `null`, então quem tiver status nulo precisa do filtro `or` abaixo.
 */
export const NOT_DELETED_FILTER = `status.is.null,status.neq.${STATUS_EXCLUIDO}`

/** Linha de documento no que este critério lê. */
export interface DocumentWithStatus {
    status?: string | null
}

/** `true` quando o documento foi EXCLUÍDO — não quando foi cancelado. */
export function isDeletedDocument(doc: DocumentWithStatus | null | undefined): boolean {
    return doc?.status === STATUS_EXCLUIDO
}

/**
 * Aplica o filtro "mostrar excluídos" a uma lista já carregada.
 *
 * `mostrarExcluidos = false` (padrão das três telas) esconde os excluídos e mantém todo o
 * resto, CANCELADOS INCLUSIVE — cancelar não é excluir, e a tela de Vendas continua listando
 * cancelados como sempre listou.
 */
export function filterDeletedDocuments<T extends DocumentWithStatus>(
    docs: readonly T[],
    mostrarExcluidos: boolean,
): T[] {
    return mostrarExcluidos ? [...docs] : docs.filter((d) => !isDeletedDocument(d))
}

/**
 * `true` quando a venda pode ser EXCLUÍDA.
 *
 * A PRÉ-CONDIÇÃO DE PAGAMENTO SAIU — MUDANÇA DE DECISÃO, NÃO CORREÇÃO
 * -------------------------------------------------------------------
 * Até 09/09/2026 havia uma pré-condição: venda com parcela paga não era excluível, e o botão
 * ficava desabilitado com o motivo no tooltip. **Aquilo estava CERTO sob a regra da época** —
 * `.claude/rules/decisao-sob-regra-da-epoca.md`. A regra mudou: venda com pagamento registrado
 * PODE ser excluída, e o dinheiro sai do caixa junto.
 *
 * É coerente com o conceito que o #52 fixou: excluir é como se a evolução NUNCA TIVESSE
 * CHEGADO ALI. Se a venda nunca existiu, o dinheiro dela nunca entrou — o saldo do mês diminui.
 *
 * O que sobra é a única condição que continua fazendo sentido: **não excluir o que já está
 * excluído**. Idempotência, não bloqueio.
 */
export function canDeleteSale(input: {
    status?: string | null
}): { allowed: boolean; reason: string | null } {
    if (isDeletedDocument(input)) {
        return { allowed: false, reason: 'Esta venda já foi excluída.' }
    }
    return { allowed: true, reason: null }
}

/**
 * O IMPACTO NO CAIXA de excluir uma venda — DOIS números, e a razão de serem dois.
 *
 * `valorQueSaiDoCaixa` é a soma das `cash_entries` ATIVAS da venda: é o que a exclusão
 * REALMENTE tira do saldo. `valorRegistradoComoPago` é o `amount_paid` dos recebíveis: é o que
 * o sistema DIZ que foi recebido.
 *
 * QUANDO OS DOIS DIVERGEM, OS DOIS APARECEM — e este é o critério:
 *
 * > Um número só estaria CERTO sobre uma coisa e MUDO sobre a outra.
 *
 * Medido em 09/09/2026: a venda VD-9171FE tem R$ 50.000,00 de `amount_paid` e ZERO
 * `cash_entries` ativas. Dizer "R$ 0,00 saem do caixa" é VERDADE e SOA FALSO para quem sabe do
 * pagamento — informar só isso **afirmaria implicitamente que não há mais nada**.
 *
 * É `.claude/rules/ausente-vs-falso.md` aplicado a um DIÁLOGO DE CONFIRMAÇÃO, e é a primeira
 * vez que a classe aparece numa mensagem em vez de num dado: a omissão do segundo número não
 * seria neutra, seria uma afirmação sobre o que não foi dito.
 */
export interface ImpactoNoCaixa {
    /** Soma das `cash_entries` ativas — o que sai do saldo de verdade. */
    valorQueSaiDoCaixa: number
    /** Soma de `pending_receivables.amount_paid` — o que o sistema diz que foi recebido. */
    valorRegistradoComoPago: number
    /** `true` quando os dois divergem: há pagamento registrado sem lançamento correspondente. */
    haDivergencia: boolean
    /** A diferença, para a mensagem não obrigar quem lê a fazer a conta. */
    valorSemLancamento: number
}

/** Tolerância de centavo: divergência de arredondamento não é divergência de fato. */
const CENTAVO = 0.005

export function calcularImpactoNoCaixa(input: {
    somaCashEntriesAtivas: number
    somaAmountPaid: number
}): ImpactoNoCaixa {
    const sai = Number(input.somaCashEntriesAtivas) || 0
    const pago = Number(input.somaAmountPaid) || 0
    const diferenca = pago - sai
    return {
        valorQueSaiDoCaixa: sai,
        valorRegistradoComoPago: pago,
        // Só a divergência PARA MAIS interessa: pagamento registrado que o caixa não tem. O
        // contrário (caixa maior que o registrado) é outra história e não é o que se afirma aqui.
        haDivergencia: diferenca > CENTAVO,
        valorSemLancamento: diferenca > CENTAVO ? diferenca : 0,
    }
}

const brl = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

/** A primeira linha: o que sai do caixa. Sempre presente, mesmo quando for zero. */
export function frasePrimeiraLinha(impacto: ImpactoNoCaixa): string {
    return impacto.valorQueSaiDoCaixa > CENTAVO
        ? `${brl(impacto.valorQueSaiDoCaixa)} SAEM DO CAIXA — o saldo do período diminui nesse valor.`
        : 'Nenhum lançamento ativo no caixa: o saldo não muda com esta exclusão.'
}

/**
 * A segunda linha: só quando houver divergência. `null` quando não houver.
 *
 * Devolver `null` em vez de string vazia é deliberado: a tela OMITE o bloco, e omitir não
 * afirma nada. Uma linha dizendo "sem divergência" afirmaria uma conferência que não se fez.
 */
export function fraseSegundaLinha(impacto: ImpactoNoCaixa): string | null {
    if (!impacto.haDivergencia) return null
    return (
        `Atenção: há ${brl(impacto.valorRegistradoComoPago)} registrados como recebidos nesta venda, ` +
        `mas ${brl(impacto.valorSemLancamento)} disso NÃO TÊM lançamento de caixa correspondente — ` +
        'esse valor não sairá do saldo porque nunca entrou nele.'
    )
}

/** O texto do tooltip que distingue as duas ações na coluna Ações de Vendas. */
export const TOOLTIP_CANCELAR =
    'Cancelar retorna o documento à etapa anterior e permite retomá-lo.'
// O tooltip deixou de avisar sobre BLOQUEIO e passou a avisar O QUE VAI ACONTECER — a
// pré-condição saiu, e o texto que a anunciava seria uma promessa falsa.
export const TOOLTIP_EXCLUIR =
    'Excluir remove permanentemente a venda e a cadeia que a originou (pedido e orçamento). ' +
    'Estoque volta; os lançamentos do caixa saem, INCLUSIVE OS JÁ RECEBIDOS, e o saldo diminui. Não há desfazer.'
