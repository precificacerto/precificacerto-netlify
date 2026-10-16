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

/**
 * `YYYY-MM-DD` → `DD/MM/YYYY`. Ausente devolve TRAVESSÃO, nunca data vazia nem `01/01/1970`.
 *
 * ESTAVA ESCRITO DUAS VEZES — em `lista-de-vencimentos.component.tsx` e em
 * `tela-da-parcela.component.tsx` — e as duas cópias JÁ DIVERGIAM: a da lista aceitava só
 * `string | null` (não tratava `undefined` nem `''`) e não cortava a string em 10, então
 * um `timestamptz` vindo por engano sairia partido. `copia-divergente.md` em miniatura, e
 * o remédio dela: não conferir as duas, apagar uma. Vive aqui porque é a mesma matéria do
 * resto do arquivo — dia de calendário sem hora, que é o que `due_date` e `paid_date` são.
 *
 * NÃO usa `new Date(iso)`: a string `'2026-10-16'` é interpretada como UTC e vira 15/10 em
 * qualquer fuso a oeste de Greenwich. O corte da string não tem fuso nenhum.
 */
export function diaBR(iso: string | null | undefined): string {
    if (iso === null || iso === undefined || iso === '') return '—'
    const [a, m, d] = iso.slice(0, 10).split('-')
    return `${d}/${m}/${a}`
}
