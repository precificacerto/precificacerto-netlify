/**
 * dia-de-hoje.ts — O ÚNICO lugar do fluxo de cobrança que lê o relógio.
 *
 * `parcelas-do-cliente.ts` e `filtros-de-cobranca.ts` recebem `hoje` como parâmetro, de
 * propósito: "vencido" é derivado da data, e módulo que lê relógio não é testável nem dá o
 * mesmo número em duas telas abertas ao mesmo tempo. A leitura precisa acontecer em ALGUM
 * lugar — e esse lugar é aqui, nomeado, para que a busca por `new Date()` nos módulos de
 * cálculo continue devolvendo zero.
 *
 * O FUSO É O DO NEGÓCIO, não o do navegador. `cash_entries.due_date` é `date` — um dia de
 * calendário, sem hora. Comparar contra o dia do navegador faria uma parcela que vence hoje
 * aparecer como vencida para quem estivesse a leste do Brasil, e o contrário a oeste.
 */

const FUSO_DO_NEGOCIO = 'America/Sao_Paulo'

/** O dia corrente em `YYYY-MM-DD`, no fuso do negócio. */
export function hojeNoFusoDoNegocio(agora: Date = new Date()): string {
    // `en-CA` formata como `YYYY-MM-DD`, que é exatamente o formato de `due_date`.
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: FUSO_DO_NEGOCIO,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(agora)
}
