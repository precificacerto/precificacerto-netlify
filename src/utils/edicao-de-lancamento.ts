/**
 * edicao-de-lancamento.ts — o payload da edição de lançamento, e a mensagem de falha dela.
 *
 * POR QUE ISTO EXISTE COMO MÓDULO, e não inline na tela
 * ------------------------------------------------------
 * O payload estava inline em `controle-financeiro/index.tsx:679`, e carregava um campo que
 * **não existe na tabela**. Nenhum portão podia afirmar nada sobre ele sem montar uma página
 * de 1.700 linhas. Separado, o payload é um objeto que se compara campo a campo.
 *
 * `updated_at` NÃO ENTRA, E A RAZÃO É MEDIDA
 * -------------------------------------------
 * `cash_entries` tem **41 colunas, e nenhuma é `updated_at`** — medido em
 * `information_schema.columns` em 16/10/2026. O PostgREST rejeita o UPDATE INTEIRO com
 * `PGRST204` quando o payload traz coluna desconhecida: não é o campo que é ignorado, é a
 * gravação que não acontece. **Quem editava um lançamento ali não salvava NADA.**
 *
 * Não se cria a coluna para resolver isto: migração é rodada própria, e nada aqui precisa
 * dela. As tabelas que têm `updated_at` (`sales`, `pending_receivables`) o mantêm por
 * TRIGGER; `cash_entries` não tem trigger nenhum.
 */

export interface EntradaDaEdicao {
    descricao?: string | null
    /** `YYYY-MM-DD`, ou `null` para manter o vencimento atual. */
    vencimento: string | null
    /** `YYYY-MM-DD`, ou `null` — e `null` AQUI significa "desfazer o pagamento". */
    pagamento: string | null
    valor: number
    /** O vencimento gravado, usado quando o campo vem vazio. */
    vencimentoAtual: string | null
}

export interface PayloadDaEdicao {
    description?: string | null
    amount: number
    due_date: string | null
    paid_date: string | null
}

/**
 * O payload do UPDATE. Quatro campos, todos colunas reais de `cash_entries`.
 *
 * Acrescentar um campo aqui exige conferir que a coluna existe — é literalmente o defeito
 * que este módulo corrige.
 */
export function montarPayloadDaEdicao(entrada: EntradaDaEdicao): PayloadDaEdicao {
    return {
        description: entrada.descricao,
        amount: entrada.valor,
        due_date: entrada.vencimento ?? entrada.vencimentoAtual,
        paid_date: entrada.pagamento,
    }
}

/** As colunas que `cash_entries` NÃO tem e que já apareceram em payload. */
export const COLUNAS_QUE_NAO_EXISTEM: readonly string[] = ['updated_at', 'paid_by', 'customer_id']

export type NaturezaDaFalha = 'ESCRITA' | 'REDE' | 'DESCONHECIDA'

export interface FalhaDaEdicao {
    natureza: NaturezaDaFalha
    /** O código do erro, quando o banco o devolve — `PGRST204`, `23505`, `42501`. */
    codigo: string | null
    mensagem: string
}

/**
 * Traduz a falha, DISTINGUINDO escrita de rede e mostrando o código.
 *
 * O `catch` original dizia sempre `'Erro ao salvar edição.'` — a mesma frase para "o banco
 * recusou a coluna", "você não tem permissão" e "o wi-fi caiu". **Foi isso que escondeu o
 * `PGRST204` por semanas**: o usuário via uma frase genérica, reportava "não salva", e não
 * havia o que procurar.
 *
 * A regra de leitura: erro do PostgREST/Postgres traz `code`; falha de transporte é
 * `TypeError`/`AbortError` e não traz. Sem `code` e sem nome conhecido, a natureza é
 * DESCONHECIDA — e dizer "desconhecida" é mais honesto que chutar uma das duas
 * (`ausente-vs-falso.md` aplicado a diagnóstico).
 */
export function traduzirFalhaDaEdicao(erro: unknown): FalhaDaEdicao {
    const e = (erro ?? {}) as { code?: unknown; message?: unknown; name?: unknown }
    const codigo = typeof e.code === 'string' && e.code !== '' ? e.code : null
    const mensagem = typeof e.message === 'string' && e.message !== '' ? e.message : 'sem detalhe'
    const nome = typeof e.name === 'string' ? e.name : ''

    if (codigo !== null) return { natureza: 'ESCRITA', codigo, mensagem }
    if (nome === 'TypeError' || nome === 'AbortError' || /fetch|network|failed to fetch/i.test(mensagem)) {
        return { natureza: 'REDE', codigo: null, mensagem }
    }
    return { natureza: 'DESCONHECIDA', codigo: null, mensagem }
}

/** O texto para a tela. O código aparece quando existe — é por ele que se procura. */
export function textoDaFalhaDaEdicao(falha: FalhaDaEdicao): string {
    if (falha.natureza === 'REDE') {
        return `Não foi possível falar com o servidor. A edição NÃO foi salva. (${falha.mensagem})`
    }
    if (falha.natureza === 'ESCRITA') {
        return `O banco recusou a edição [${falha.codigo}]: ${falha.mensagem}`
    }
    return `A edição não foi salva, e a causa não foi identificada: ${falha.mensagem}`
}
