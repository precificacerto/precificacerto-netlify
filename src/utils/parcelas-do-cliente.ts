/**
 * parcelas-do-cliente.ts — a fonte ÚNICA das parcelas a receber, por cliente.
 *
 * MÓDULO PURO: não consulta, não lê relógio, não importa `supabase`. Recebe as linhas já
 * carregadas e devolve as parcelas normalizadas mais o agregado por cliente. Os QUATRO
 * consumidores — os filtros da lista, a coluna partida VENCIDO/A VENCER, o cabeçalho da
 * ficha e o bloco 4 do detalhe da compra — leem daqui, e nenhum deles precisa de consulta
 * própria.
 *
 * POR QUE SÃO DUAS CONSULTAS, E NÃO UMA
 * --------------------------------------
 * `cash_entries` **não tem `customer_id`**, e **`origin_id` não tem FK**: o vínculo com a
 * venda é a convenção `origin_type = 'SALE'` + `origin_id = sales.id`. Sem relação declarada
 * o PostgREST não tem o que embutir, então `cash_entries` e `sales` vêm em duas idas e a
 * junção acontece aqui. **Não é N+1** — `.in()` resolve em lote, e a base tem 1.659 e 101
 * linhas.
 *
 * Uma ida só exigiria uma **view** (ou RPC) no banco, e isso é migração — não entra nesta
 * rodada. É a MESMA rodada que resolveria a FK ausente, e as duas andam juntas por um motivo
 * medido: **a FK não pode ser aplicada hoje, porque rejeitaria 50 linhas** cujo `origin_id`
 * aponta para venda que não existe mais. Quem for fazer a view precisa decidir o que fazer
 * com essas 50 antes, e elas NÃO devem ser apagadas.
 *
 * NENHUMA ENTRADA TEM DEFAULT
 * ----------------------------
 * As quatro são obrigatórias, e isso é `construtor-empobrecido.md` aplicado na assinatura:
 * campo de cálculo com default neutro é defeito à espera de produtor. `escopo` é o exemplo
 * caro — se ele caísse em `'TODAS'` por omissão, a lista somaria parcela PAGA no vencido.
 *
 * `hoje` É PARÂMETRO, e a razão não é estilo
 * -------------------------------------------
 * "Vencido" é DERIVADO da data, nunca gravado. Um módulo que chamasse `new Date()` não seria
 * testável e não daria o mesmo número nas quatro telas dentro da mesma sessão. Quem chama
 * decide qual é o dia — e é lá que o fuso é resolvido, uma vez.
 */

/** O dia de referência, em `YYYY-MM-DD`. Mesmo formato de `cash_entries.due_date`. */
export type DiaISO = string

/**
 * Quais parcelas o consumidor quer.
 *
 * `'ABERTAS'` — a lista, a coluna e o cabeçalho: só o que ainda se cobra.
 * `'TODAS'`   — o bloco 4 do detalhe, que precisa das PAGAS para dizer "PAGA em dd/mm".
 *
 * **Estorno fica de fora dos DOIS.** `is_active = false` é linha desativada pelas cascatas
 * (`cancel_sale_cascade`, `delete_sale_cascade`), e 154 delas têm `paid_date` preenchido:
 * exibir uma dessas como "PAGA em dd/mm" seria o mesmo selo que mente que
 * `customer-history-status.ts` já documenta. `escopo` decide sobre o PAGAMENTO, nunca sobre
 * a vida da linha.
 */
export type EscopoDeParcelas = 'ABERTAS' | 'TODAS'

/**
 * O estado da parcela. `SEM_VENCIMENTO` é classe PRÓPRIA, não um balde.
 *
 * Hoje são 0 linhas, mas `cash_entries.due_date` é `date NULL` sem default, então ela pode
 * nascer. Nulo não é zero e não é "a vencer": é travessão (`ausente-vs-falso.md`). Tratá-lo
 * como `A_VENCER` afirmaria uma data que ninguém gravou.
 */
export type EstadoDaParcela = 'PAGA' | 'VENCIDA' | 'A_VENCER' | 'SEM_VENCIMENTO'

/** Uma linha de `cash_entries` de `type = 'INCOME'`, no que esta conta precisa. */
export interface LinhaDeParcela {
    id: string
    amount: number | string | null
    due_date: string | null
    paid_date: string | null
    /** `false` é ESTORNO, nunca pagamento. */
    is_active: boolean | null
    origin_type: string | null
    origin_id: string | null
    /** Cliente gravado direto na linha. Resolve as 21 cuja origem não existe mais. */
    contact_id: string | null
}

/** `sales` no mínimo necessário para resolver o cliente. */
export interface VendaParaResolucao {
    id: string
    customer_id: string | null
}

export interface Parcela {
    id: string
    /** `null` quando a origem não resolve cliente — e aí ela NÃO entra em `porCliente`. */
    customerId: string | null
    /** A venda que dá para ABRIR. `null` quando a origem aponta para venda inexistente. */
    saleId: string | null
    /** Posição na série, 1-based. */
    numero: number
    /** Tamanho da série — o "de 5" de "2 de 5". */
    de: number
    vencimento: string | null
    valor: number
    estado: EstadoDaParcela
    /** Só em `VENCIDA`. `null` nas outras: zero diria "vence hoje". */
    diasDeAtraso: number | null
    /** Só em `PAGA`. */
    pagaEm: string | null
}

export interface AgregadoDoCliente {
    vencido: number
    aVencer: number
    /** `null` quando o cliente não tem nenhuma vencida. */
    maiorAtrasoDias: number | null
    temVencida: boolean
    temAVencer: boolean
}

export interface ParcelasDoCliente {
    parcelas: Parcela[]
    porCliente: Record<string, AgregadoDoCliente>
}

/**
 * Centavos inteiros.
 *
 * `vencido` é número que alguém vai cobrar, e soma de float binário erra no centavo:
 * `100.10 + 200.20` dá `300.29999999999995` em JS. Arredonda-se CADA parcela para centavo
 * inteiro, soma-se inteiro, e divide-se UMA vez no fim.
 */
function emCentavos(valor: number | string | null): number {
    const n = Number(valor)
    return Number.isFinite(n) ? Math.round(n * 100) : 0
}

function deCentavos(centavos: number): number {
    return centavos / 100
}

/** Dias entre dois `YYYY-MM-DD`, por UTC — imune a fuso e a horário de verão. */
function diasEntre(deISO: string, ateISO: string): number {
    const [ay, am, ad] = deISO.split('-').map(Number)
    const [by, bm, bd] = ateISO.split('-').map(Number)
    const a = Date.UTC(ay, am - 1, ad)
    const b = Date.UTC(by, bm - 1, bd)
    return Math.round((b - a) / 86_400_000)
}

/** `YYYY-MM-DD` ordena lexicograficamente, então a comparação de texto basta e é exata. */
function ordenarPorVencimento(a: LinhaDeParcela, b: LinhaDeParcela): number {
    // Sem vencimento vai para o fim, sem quebrar a numeração das outras.
    const da = a.due_date || '9999-12-31'
    const db = b.due_date || '9999-12-31'
    if (da !== db) return da < db ? -1 : 1
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Monta as parcelas e o agregado por cliente.
 *
 * A ordem das etapas é parte da regra, não detalhe de implementação:
 *
 * 1. **Estorno sai primeiro**, dos dois escopos — ele não é parcela nem paga nem aberta.
 * 2. **A numeração é feita sobre a SÉRIE INTEIRA**, antes do `escopo`. Sem isso, `'ABERTAS'`
 *    diria "1 de 3" numa venda de cinco parcelas com duas já pagas, e o "2 de 5" do detalhe
 *    perderia o sentido.
 * 3. **O `escopo` filtra depois** — ele decide o que se EXIBE, não o que a série É.
 * 4. **A parcela sem cliente não entra em `porCliente`.** São 2 em aberto, de 50 órfãs.
 */
export function montarParcelasDoCliente(entrada: {
    parcelas: readonly LinhaDeParcela[]
    vendas: readonly VendaParaResolucao[]
    hoje: DiaISO
    escopo: EscopoDeParcelas
}): ParcelasDoCliente {
    const { parcelas: linhas, vendas, hoje, escopo } = entrada

    const clientePorVenda = new Map<string, string | null>()
    for (const v of vendas) clientePorVenda.set(v.id, v.customer_id)

    // (1) Estorno sai dos DOIS escopos.
    const vivas = linhas.filter((l) => l.is_active === true)

    // (2) Numeração sobre a série inteira. A chave é o `origin_id` — ele sobrevive à venda
    // apagada, então a série das 50 órfãs continua numerada certo mesmo sem a venda.
    const porSerie = new Map<string, LinhaDeParcela[]>()
    for (const l of vivas) {
        const chave = l.origin_id ? `o:${l.origin_id}` : `avulsa:${l.id}`
        const atual = porSerie.get(chave)
        if (atual) atual.push(l)
        else porSerie.set(chave, [l])
    }

    const numeradas = new Map<string, { numero: number; de: number }>()
    for (const serie of porSerie.values()) {
        const ordenada = [...serie].sort(ordenarPorVencimento)
        ordenada.forEach((l, i) => numeradas.set(l.id, { numero: i + 1, de: ordenada.length }))
    }

    // (3) O escopo filtra o que se exibe.
    const selecionadas = escopo === 'ABERTAS' ? vivas.filter((l) => l.paid_date === null) : vivas

    const parcelas: Parcela[] = [...selecionadas].sort(ordenarPorVencimento).map((l) => {
        const daVenda = l.origin_type === 'SALE' && l.origin_id ? clientePorVenda.get(l.origin_id) : undefined
        // `coalesce(contact_id, venda.customer_id)`: os dois são necessários. 21 linhas têm
        // `contact_id` e origem que não resolve; e em 0 casos os dois discordam quando ambos
        // existem — medido em 15/10/2026.
        const customerId = l.contact_id ?? daVenda ?? null
        // A venda que dá para ABRIR só existe se ela existe: `origin_id` órfão vira `null`
        // em vez de um link que leva a lugar nenhum.
        const saleId = l.origin_type === 'SALE' && l.origin_id && clientePorVenda.has(l.origin_id) ? l.origin_id : null

        let estado: EstadoDaParcela
        let diasDeAtraso: number | null = null
        if (l.paid_date !== null) {
            estado = 'PAGA'
        } else if (l.due_date === null) {
            estado = 'SEM_VENCIMENTO'
        } else if (l.due_date < hoje) {
            estado = 'VENCIDA'
            diasDeAtraso = diasEntre(l.due_date, hoje)
        } else {
            estado = 'A_VENCER'
        }

        const posicao = numeradas.get(l.id)
        return {
            id: l.id,
            customerId,
            saleId,
            numero: posicao ? posicao.numero : 1,
            de: posicao ? posicao.de : 1,
            vencimento: l.due_date,
            valor: deCentavos(emCentavos(l.amount)),
            estado,
            diasDeAtraso,
            pagaEm: l.paid_date,
        }
    })

    // (4) O agregado, em centavos inteiros até o fim.
    interface Acumulador {
        vencido: number
        aVencer: number
        maiorAtrasoDias: number | null
        temVencida: boolean
        temAVencer: boolean
    }
    const acumulado = new Map<string, Acumulador>()
    for (const p of parcelas) {
        if (p.customerId === null) continue
        if (p.estado !== 'VENCIDA' && p.estado !== 'A_VENCER') continue
        const atual: Acumulador = acumulado.get(p.customerId) ?? {
            vencido: 0, aVencer: 0, maiorAtrasoDias: null, temVencida: false, temAVencer: false,
        }
        if (p.estado === 'VENCIDA') {
            atual.vencido += emCentavos(p.valor)
            // Presenca, nao valor: parcela vencida de R$ 0,00 continua sendo uma vencida, e
            // derivar o booleano do total diria que o cliente nao deve nada
            // (`ausente-vs-falso.md`).
            atual.temVencida = true
            if (p.diasDeAtraso !== null && (atual.maiorAtrasoDias === null || p.diasDeAtraso > atual.maiorAtrasoDias)) {
                atual.maiorAtrasoDias = p.diasDeAtraso
            }
        } else {
            atual.aVencer += emCentavos(p.valor)
            atual.temAVencer = true
        }
        acumulado.set(p.customerId, atual)
    }

    const porCliente: Record<string, AgregadoDoCliente> = {}
    for (const [customerId, a] of acumulado) {
        porCliente[customerId] = {
            vencido: deCentavos(a.vencido),
            aVencer: deCentavos(a.aVencer),
            maiorAtrasoDias: a.maiorAtrasoDias,
            temVencida: a.temVencida,
            temAVencer: a.temAVencer,
        }
    }

    return { parcelas, porCliente }
}
