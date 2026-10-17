/**
 * baixa-pela-rota.ts — o contrato entre a ficha e `/api/cash-entries/baixa`.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ TODA BAIXA DA FICHA GRAVA AUTOR NO LOG — simples, com valor diferente e em lote.      ║
 * ║                                                                                      ║
 * ║ As três vão por função do banco, e as três escrevem a linha 'PAGA' em                 ║
 * ║ `parcela_reajuste_log` com `criado_por` = o usuário da SESSÃO (XIII.2). Não há        ║
 * ║ segunda via: a rota não tem UPDATE em `cash_entries` — há portão afirmando isso.      ║
 * ║   simples ............ `dar_baixa_simples`              (…000003, 17/10/2026)         ║
 * ║   valor diferente .... `dar_baixa_com_valor_diferente`  (…000001, 17/10/2026)         ║
 * ║   lote ............... `dar_baixa_em_lote`              (…000003, 17/10/2026)         ║
 * ║                                                                                      ║
 * ║ Até a …000003 a simples ia por UPDATE, SEM autor: a aplicada recusa a última em      ║
 * ║ aberto (PC005) e a parcela sem série (PC002) mesmo com delta zero — medido no        ║
 * ║ harness. As baixas simples feitas pela ficha nesse intervalo não têm autor, e não    ║
 * ║ terão: aditivo não recupera o passado (XIII.6.b).                                    ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * PURO, e importável do browser: não toca no cliente admin. A rota o importa para responder;
 * a tela o importa para chamar e para dizer o que aconteceu. Um módulo só para os dois lados,
 * porque o mapa código → destino escrito duas vezes seria `copia-divergente.md` nascendo.
 *
 * POR QUE UMA ROTA, E NÃO `.rpc()` DO BROWSER
 * --------------------------------------------
 * `dar_baixa_com_valor_diferente` tem `EXECUTE` só para `service_role` — medido no catálogo em
 * 17/10/2026: anon `false`, authenticated `false`, service_role `true`. E mesmo que não
 * tivesse: o log de reajuste existe para dizer QUEM deu a baixa, e um autor que chega no corpo
 * da requisição é um autor que qualquer um forja. A rota tira `p_usuario_id` e `p_tenant_id`
 * da SESSÃO, nunca do corpo.
 *
 * OS DEZESSEIS CÓDIGOS VIRAM DESTINO PELO CÓDIGO, NUNCA PELA MENSAGEM
 * ---------------------------------------------------------------------
 * As funções levantam `PC001`..`PC016` com `ERRCODE`, e o PostgREST os devolve em `error.code`. O
 * texto da mensagem é para gente: mudar uma vírgula nele não pode mudar o que a tela faz.
 * Cada código tem um `motivo` próprio, um status HTTP e a frase que a tela mostra.
 *
 * NÃO HÁ PRÉVIA DOS NOVOS VALORES, e a razão é de classe
 * -------------------------------------------------------
 * Dizer "as restantes ficam em X, Y, Z" exigiria refazer no TypeScript a conta proporcional
 * da RPC — uma SEGUNDA aritmética sobre dinheiro, que é a classe que esta campanha existe para
 * impedir. A confirmação nomeia o valor pago, a parcela, a venda, a diferença e QUAIS parcelas
 * em aberto absorvem; os valores que ficaram, a tela mostra DEPOIS, relendo o banco. A única
 * conta aqui é a diferença, em centavos inteiros — e ela não reparte nada.
 */

import { formatBRL } from '@/utils/formatters'
import { FORMAS_DA_BAIXA } from '@/utils/baixa-de-parcela'
import type { LinhaDeVencimento } from '@/utils/vencimentos-da-ficha'

export const ROTA_DA_BAIXA = '/api/cash-entries/baixa'
export const ROTA_DO_LOTE = '/api/cash-entries/baixa-em-lote'

/**
 * O teto do lote. É o MESMO número do `IF v_n > 50` de `dar_baixa_em_lote` (…000003), e a tela
 * o usa para desabilitar o botão: não se deixa a função recusar o que a tela sabe impedir. Há
 * portão comparando este número com o do arquivo da migração.
 */
export const LIMITE_DO_LOTE = 50

// ════════════════════════════════════════════════════════════════════════════════════════
// O VALOR DIFERENTE NA TELA (5c.3)
// ════════════════════════════════════════════════════════════════════════════════════════

/**
 * As OUTRAS parcelas em aberto da mesma série — as que absorvem a diferença.
 *
 * É a camada DE CIMA da trava da regra 5: sem nenhuma, o campo de valor diferente não existe
 * na tela. A de baixo é a RPC, que recusa com `PC005` de todo modo — uma tela que não oferece
 * não substitui um banco que não aceita.
 *
 * "Em aberto" é o que a RPC lê: viva (`is_active`, já filtrado na montagem das parcelas) e sem
 * `paid_date`. A série da tela é a da venda (`saleId`) dentro do cliente; a da RPC é
 * `origin_type` + `origin_id` no tenant. Medido em 17/10/2026 nas seis séries com duas ou
 * mais em aberto: um cliente por série e venda existente em todas — as duas coincidem.
 */
export function outrasEmAbertoDaSerie(irmas: readonly LinhaDeVencimento[], linha: LinhaDeVencimento): LinhaDeVencimento[] {
    return irmas.filter((i) => i.id !== linha.id && i.estado !== 'PAGA')
}

/**
 * Combinado menos pago, EM CENTAVOS INTEIROS. Positivo: pagou a menos, as outras sobem.
 * É a única conta sobre dinheiro deste lado, e ela não reparte nada — ver o cabeçalho.
 */
export function diferencaEmCentavos(combinado: number, pago: number): number {
    return Math.round(combinado * 100) - Math.round(pago * 100)
}

export interface FatosDoValorDiferente {
    /** Todos JÁ FORMATADOS pelo chamador, com `formatBRL` e `diaBR`. */
    valorPago: string
    valorCombinado: string
    /** `2 de 5`. */
    parcela: string
    codigoDaVenda: string | null
    forma: string | null
    pagoEm: string
    /** `formatBRL` do módulo da diferença. */
    diferenca: string
    sentido: 'A_MENOS' | 'A_MAIS' | 'SEM_DIFERENCA'
    /** As outras em aberto, como a tela as nomeia: `3 de 5 (vence 10/11/2026)`. */
    reajustaveis: readonly string[]
}

/**
 * A confirmação do valor diferente. Nomeia o valor pago, a parcela, a venda, a diferença e
 * QUAIS parcelas em aberto absorvem — e NÃO diz com que valor elas ficam: isso é a RPC que
 * decide, e a tela mostra depois, relendo o banco.
 */
export function textoDaConfirmacaoComValorDiferente(f: FatosDoValorDiferente): string {
    const venda = f.codigoDaVenda ?? 'venda não identificada'
    const forma = f.forma ?? 'Sem forma de pagamento'
    const n = f.reajustaveis.length
    const quem = n === 1 ? 'a outra parcela em aberto desta venda' : `as ${n} outras parcelas em aberto desta venda`
    const diferenca = f.sentido === 'SEM_DIFERENCA'
        ? 'Sem diferença: nenhuma outra parcela é reajustada.'
        : `Pago ${f.sentido === 'A_MENOS' ? 'a menos' : 'a mais'}: ${f.diferenca}, redistribuído proporcionalmente entre ${quem}: ${f.reajustaveis.join(', ')}.`
    return `Vai ser gravado: ${f.valorPago} na parcela ${f.parcela} (combinado ${f.valorCombinado}) · venda ${venda} · ${forma}. `
        + `${diferenca} A parcela passa a constar como PAGA em ${f.pagoEm}.`
}

/**
 * O corpo da requisição. `valor_pago` só existe quando o valor diferente foi pedido; `forma`
 * só existe quando há forma. A DATA NÃO VAI: o servidor a deriva (ver `CorpoDaBaixa`).
 */
export function montarCorpoDaBaixa(parcelaId: string, e: { forma?: string | null; valorPago?: number }): CorpoDaBaixa {
    const corpo: CorpoDaBaixa = { parcela_id: parcelaId }
    if (e.forma !== undefined && e.forma !== null) corpo.forma = e.forma
    if (e.valorPago !== undefined) corpo.valor_pago = e.valorPago
    return corpo
}

// ════════════════════════════════════════════════════════════════════════════════════════
// O CORPO DA REQUISIÇÃO
// ════════════════════════════════════════════════════════════════════════════════════════

/**
 * O que a tela manda. NÃO TEM usuário, tenant NEM DATA, de propósito: a rota tira os dois
 * primeiros da sessão e deriva a data por `dia-de-hoje.ts`, no fuso do negócio. Se um dia
 * alguém mandar qualquer dos três no corpo, a rota os IGNORA — há portão afirmando isso.
 *
 * A DATA SAIU DO CONTRATO (XI.1): "data escolhida à vontade lança dinheiro em mês fechado".
 * Uma rota que aceitasse qualquer data bem-formada SERIA o seletor livre, com a trava
 * morando na tela — o mesmo erro de camada do autor vindo do corpo. A tela continua
 * EXIBINDO o dia; exibir é informar, não autorizar.
 */
export interface CorpoDaBaixa {
    parcela_id: string
    /**
     * AUSENTE (ou `null`) = NÃO MEXER NA FORMA: a coluna não vai no UPDATE e a RPC recebe
     * `NULL`, que o `coalesce` dela preserva. Não é validar — é não escrever o que ninguém
     * mandou escrever. Achado 3 da XIII.7, que reapareceu uma camada acima.
     */
    forma?: string | null
    /**
     * Ausente = BAIXA SIMPLES, pelo valor combinado — o caminho da 5b, agora no servidor.
     * Presente = valor diferente, pela RPC, com a redistribuição na mesma transação.
     */
    valor_pago?: number
}

/** O retorno da RPC, como `pg_get_function_result` disse: `jsonb`, com estas chaves. */
export interface ResultadoDaRpc {
    success: boolean
    operacao_id: string
    delta: number
    soma_da_serie: number
    parcela_paga: { id: string; valor_antes: number; valor_depois: number }
    reajustadas: number
    outras_em_aberto: number
    criado_por: string
}

/** O retorno de `dar_baixa_simples` — o jsonb da …000003. */
export interface ResultadoDaBaixaSimples {
    success: boolean
    parcela_id: string
    valor: number
    pago_em: string
    operacao_id: string
    criado_por: string
}

export type BaixaAceita =
    | { ok: true; modo: 'SIMPLES'; resultado: ResultadoDaBaixaSimples }
    | { ok: true; modo: 'VALOR_DIFERENTE'; resultado: ResultadoDaRpc }

export interface BaixaRecusada { ok: false; motivo: MotivoDaRecusa; error: string; codigo?: string }

export type RespostaDaBaixa = BaixaAceita | BaixaRecusada

/**
 * O estreitamento EXPLÍCITO. Com `strictNullChecks` desligado no `tsconfig`, `if (r.ok)` não
 * estreita a união, e o `tsc` acusa `TS2339` em `r.motivo` — o jest passa verde com eles
 * vivos, porque babel não checa tipo (`assercao-negativa-que-nunca-falha.md`, seção do `tsc`).
 */
export function foiRecusada(r: RespostaDaBaixa): r is BaixaRecusada {
    return r.ok === false
}

// ════════════════════════════════════════════════════════════════════════════════════════
// OS DESTINOS
// ════════════════════════════════════════════════════════════════════════════════════════

export const MOTIVOS = [
    'ENTRADA_INVALIDA',
    'PARCELA_FORA_DE_ALCANCE',
    'RESTANTE_NAO_POSITIVA',
    'JA_PAGA',
    'ULTIMA_EM_ABERTO',
    'SERIE_SOMA_ZERO',
    'SERIE_MUDOU',
    'VALOR_NULO_NO_BANCO',
    'INVARIANTE_VIOLADA',
    'FORMA_INEXISTENTE',
    'PARCELA_NAO_ENCONTRADA',
    'LOTE_VAZIO',
    'LOTE_COM_REPETIDA',
    'LOTE_ACIMA_DO_LIMITE',
    'LOTE_FORMAS_DESALINHADAS',
    'LOTE_NAO_FECHOU',
    'SEM_PERMISSAO',
    'ERRO_DESCONHECIDO',
] as const

export type MotivoDaRecusa = (typeof MOTIVOS)[number]

export interface Destino {
    motivo: MotivoDaRecusa
    status: number
    /** A frase da tela. A mensagem da RPC NÃO é usada para decidir nada. */
    mensagem: string
}

/**
 * Os dezesseis códigos das três funções. A chave é o `ERRCODE` declarado no corpo da função, e o destino é
 * escolhido pelo que a pessoa PODE FAZER diante dele:
 *
 * - **400/404/422** — a pessoa corrige ou desiste: o pedido não cabe na regra.
 * - **409** — o banco mudou entre a leitura e a escrita: recarregar resolve.
 * - **500** — o banco está num estado que a regra diz impossível. Não é a pessoa que corrige.
 */
export const DESTINO_DO_CODIGO: Readonly<Record<string, Destino>> = {
    PC001: { motivo: 'ENTRADA_INVALIDA', status: 400, mensagem: 'Valor, data ou autor inválido. Nada foi gravado.' },
    PC002: { motivo: 'PARCELA_FORA_DE_ALCANCE', status: 404, mensagem: 'Parcela não encontrada, estornada, ou fora de uma série. Nada foi gravado.' },
    PC003: { motivo: 'RESTANTE_NAO_POSITIVA', status: 422, mensagem: 'A diferença deixaria outra parcela com valor zero ou negativo. A operação inteira foi recusada.' },
    PC004: { motivo: 'JA_PAGA', status: 409, mensagem: 'Esta parcela já estava paga — nada foi gravado.' },
    PC005: { motivo: 'ULTIMA_EM_ABERTO', status: 422, mensagem: 'É a última parcela em aberto da venda: não há para onde mover a diferença. Use a baixa pelo valor combinado.' },
    PC006: { motivo: 'SERIE_SOMA_ZERO', status: 422, mensagem: 'As outras parcelas em aberto somam zero: não há peso para distribuir. Nada foi gravado.' },
    PC007: { motivo: 'SERIE_MUDOU', status: 409, mensagem: 'Uma parcela da venda mudou durante a operação. Nada foi gravado — recarregue e tente de novo.' },
    PC008: { motivo: 'VALOR_NULO_NO_BANCO', status: 500, mensagem: 'Há parcela com valor nulo no banco. Nada foi gravado — avise o suporte.' },
    PC009: { motivo: 'INVARIANTE_VIOLADA', status: 500, mensagem: 'A soma da venda não fecharia. A operação foi revertida e nada foi gravado — avise o suporte.' },
    // ── os da …000003: `dar_baixa_simples` e `dar_baixa_em_lote` ──────────────────────────
    // PC010 é o MESMO FATO do PC004 — a parcela já estava paga —, e por isso o MESMO motivo:
    // a tela o trata igual. A frase é própria porque na …000003 ele também sai de dentro de um
    // lote, e aí "nada foi gravado" vale para o lote inteiro.
    PC010: { motivo: 'JA_PAGA', status: 409, mensagem: 'A parcela já estava paga. Nada foi gravado.' },
    PC011: { motivo: 'PARCELA_NAO_ENCONTRADA', status: 404, mensagem: 'Parcela não encontrada, estornada, ou de outra conta. Nada foi gravado.' },
    PC012: { motivo: 'LOTE_VAZIO', status: 400, mensagem: 'Nenhuma parcela selecionada. Nada foi gravado.' },
    PC013: { motivo: 'LOTE_COM_REPETIDA', status: 400, mensagem: 'Uma parcela aparece duas vezes no lote. Nada foi gravado.' },
    PC014: { motivo: 'LOTE_ACIMA_DO_LIMITE', status: 400, mensagem: `O lote passa de ${LIMITE_DO_LOTE} parcelas. Nada foi gravado.` },
    PC015: { motivo: 'LOTE_FORMAS_DESALINHADAS', status: 400, mensagem: 'A lista de formas não tem o tamanho da lista de parcelas. Nada foi gravado.' },
    // INVARIANTE: o banco está num estado que a regra diz impossível. Não é a pessoa que corrige.
    PC016: { motivo: 'LOTE_NAO_FECHOU', status: 500, mensagem: 'O lote não fechou: o registro não tem uma linha por parcela. A operação inteira foi revertida e NADA foi gravado — avise o suporte.' },
}

export const DESTINO_SEM_PERMISSAO: Destino = {
    motivo: 'SEM_PERMISSAO', status: 403, mensagem: 'Sem permissão para dar baixa em parcelas.',
}

/**
 * `22P02` — o Postgres recusou converter a forma para `payment_method`. MEDIDO no harness em
 * 17/10/2026: `invalid input value for enum payment_method: "CARTAO_FIADO"`, IGUAL na RPC e
 * no UPDATE. É previsto e determinístico, e por isso NÃO é "desconhecido".
 *
 * O `22P02` é genérico — `invalid_text_representation` — e o MESMO código sai para um uuid
 * malformado (medido também). Ele só identifica a forma porque `lerCorpoDaBaixa` exige
 * `parcela_id` em formato de uuid e todo o resto chega tipado: autor e tenant da sessão,
 * data do servidor, valor como número. Afrouxar aquela validação desfaz este destino.
 *
 * A frase nomeia a forma A PARTIR DO CORPO, que a rota tem — nunca da mensagem do banco.
 */
export const CODIGO_DE_FORMA_INEXISTENTE = '22P02'

export function destinoDaFormaInexistente(forma: string): Destino {
    return {
        motivo: 'FORMA_INEXISTENTE',
        status: 400,
        mensagem: `A forma de pagamento "${forma}" não existe. Formas aceitas: ${FORMAS_DA_BAIXA.join(', ')}.`,
    }
}

/** O destino de um erro, pelo código, com o corpo à mão para nomear a forma no `22P02`. */
export function destinoDoErro(erro: { code?: unknown } | null | undefined, corpo: { forma?: string | null }): Destino {
    if (erro?.code === CODIGO_DE_FORMA_INEXISTENTE && typeof corpo.forma === 'string') return destinoDaFormaInexistente(corpo.forma)
    return destinoDoErroDaRpc(erro)
}

export const DESTINO_DESCONHECIDO: Destino = {
    motivo: 'ERRO_DESCONHECIDO', status: 500, mensagem: 'O banco recusou a baixa por um motivo não previsto. Nada foi confirmado.',
}

/**
 * O destino de um erro da RPC, PELO CÓDIGO. Código fora dos dezesseis cai no desconhecido — e a
 * mensagem do erro não é lida aqui, nem para desempate.
 */
export function destinoDoErroDaRpc(erro: { code?: unknown } | null | undefined): Destino {
    const codigo = typeof erro?.code === 'string' ? erro.code : ''
    return DESTINO_DO_CODIGO[codigo] ?? DESTINO_DESCONHECIDO
}

// ════════════════════════════════════════════════════════════════════════════════════════
// A VALIDAÇÃO DO CORPO — o formato, e só. A REGRA é da RPC.
// ════════════════════════════════════════════════════════════════════════════════════════

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Valor em centavos INTEIROS, ou `null` se tiver mais de duas casas.
 *
 * MEDIDO no harness em 17/10/2026: com três casas, a RPC (numeric, arredonda metade para
 * cima) e o cliente (float) DIVERGEM no delta — 10,00 pago 1,005 dá 8,99 na RPC e 9,00 no
 * cliente; 9,995 dá 0,00 e 0,01. A confirmação mentiria por um centavo. Com duas casas as
 * duas contas coincidem (`deltas.json` do harness). Então a rota RECUSA a terceira casa.
 */
export function emCentavosExatos(valor: number): number | null {
    const x = valor * 100
    const c = Math.round(x)
    return Math.abs(x - c) < 1e-6 ? c : null
}

/**
 * Lê o corpo SÓ pelas três chaves do contrato. Qualquer outra — `p_usuario_id`,
 * `usuario_id`, `tenant_id`, `pago_em` — não é lida, e é isso que impede autor, tenant e
 * data forjados.
 *
 * O FORMATO é conferido aqui; o VALOR (positivo) é conferido pela RPC, que é a autoridade e
 * devolve `PC001`. Duas validações da mesma regra divergiriam.
 */
export function lerCorpoDaBaixa(bruto: unknown): CorpoDaBaixa | null {
    if (bruto === null || typeof bruto !== 'object') return null
    const b = bruto as Record<string, unknown>
    if (typeof b.parcela_id !== 'string' || !UUID.test(b.parcela_id)) return null
    if (b.forma !== undefined && b.forma !== null && typeof b.forma !== 'string') return null
    const corpo: CorpoDaBaixa = { parcela_id: b.parcela_id }
    // `null` e ausente são o MESMO pedido: não mexer na forma. Só a string chega adiante.
    if (typeof b.forma === 'string') corpo.forma = b.forma
    if (b.valor_pago !== undefined) {
        if (typeof b.valor_pago !== 'number' || !Number.isFinite(b.valor_pago)) return null
        if (emCentavosExatos(b.valor_pago) === null) return null
        corpo.valor_pago = b.valor_pago
    }
    return corpo
}

// ════════════════════════════════════════════════════════════════════════════════════════
// A CHAMADA, do lado da tela
// ════════════════════════════════════════════════════════════════════════════════════════

export const TEXTO_BAIXA_REGISTRADA = 'Baixa registrada.'

/**
 * O que a tela diz depois do valor diferente. Os números vêm da RESPOSTA DA RPC — quantas
 * foram reajustadas e com que valor a paga ficou —, nunca de uma conta feita aqui.
 */
export function textoDoValorDiferenteRegistrado(r: ResultadoDaRpc): string {
    const n = r.reajustadas
    const reajuste = n === 0
        ? 'Nenhuma outra parcela foi reajustada.'
        : n === 1 ? '1 parcela em aberto foi reajustada.' : `${n} parcelas em aberto foram reajustadas.`
    return `Baixa registrada com ${formatBRL(r.parcela_paga.valor_depois)}. ${reajuste} `
        + 'Os valores abaixo são os que ficaram no banco.'
}

/**
 * O que a tela diz depois da resposta. A frase de recusa VEM DO DESTINO do código, nunca da
 * mensagem do banco. `JA_PAGA` é AVISO, não sucesso: zero linhas afetadas não é "gravou".
 */
export function avisoDaBaixa(r: RespostaDaBaixa): { tipo: 'success' | 'warning' | 'error'; texto: string } {
    if (!foiRecusada(r)) {
        return r.modo === 'VALOR_DIFERENTE'
            ? { tipo: 'success', texto: textoDoValorDiferenteRegistrado(r.resultado) }
            : { tipo: 'success', texto: TEXTO_BAIXA_REGISTRADA }
    }
    if (r.motivo === 'JA_PAGA') return { tipo: 'warning', texto: r.error }
    return { tipo: 'error', texto: r.codigo ? `${r.error} [${r.codigo}]` : r.error }
}

/** O `fetch` no mínimo que a chamada usa — o portão injeta um falso e conta as chamadas. */
export type BuscarRota = (url: string, init: { method: string; headers: Record<string, string>; body: string }) =>
    Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

/**
 * Chama a rota e devolve a resposta TIPADA. Resposta que não é JSON vira desconhecido — nunca
 * "gravou", porque não se sabe.
 */
export async function chamarBaixaPelaRota(buscar: BuscarRota, corpo: CorpoDaBaixa): Promise<RespostaDaBaixa> {
    const r = await buscar(ROTA_DA_BAIXA, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
    })
    let json: unknown
    try {
        json = await r.json()
    } catch {
        return { ok: false, motivo: DESTINO_DESCONHECIDO.motivo, error: DESTINO_DESCONHECIDO.mensagem }
    }
    const j = (json ?? {}) as Record<string, unknown>
    if (r.ok && j.ok === true && (j.modo === 'SIMPLES' || j.modo === 'VALOR_DIFERENTE') && typeof j.resultado === 'object' && j.resultado !== null) return j as RespostaDaBaixa
    const motivo = (MOTIVOS as readonly string[]).includes(String(j.motivo)) ? (j.motivo as MotivoDaRecusa) : DESTINO_DESCONHECIDO.motivo
    return { ok: false, motivo, error: typeof j.error === 'string' ? j.error : DESTINO_DESCONHECIDO.mensagem, codigo: typeof j.codigo === 'string' ? j.codigo : undefined }
}

// ════════════════════════════════════════════════════════════════════════════════════════
// O LOTE (5c.2) — `dar_baixa_em_lote`, tudo ou nada
// ════════════════════════════════════════════════════════════════════════════════════════

/**
 * O que a tela manda para o lote. Como na baixa de uma, NÃO TEM usuário, tenant nem data.
 *
 * A FORMA É UMA SÓ PARA O LOTE, ou nenhuma — decisão do dono do produto. Ausente (ou `null`) é
 * "manter a forma combinada de cada parcela", que é o PADRÃO. A função recebe um ARRAY paralelo
 * aos ids, e é a ROTA que o monta (`formasDoLote`), sempre com a cardinalidade dos ids. Uma
 * forma por linha cabe no mesmo contrato da função e não pede migração quando vier.
 */
export interface CorpoDoLote {
    parcela_ids: string[]
    forma?: string | null
}

/** O retorno de `dar_baixa_em_lote` — o jsonb da …000003. */
export interface ResultadoDoLote {
    success: boolean
    operacao_id: string
    gravadas: number
    ids: string[]
    soma: number
    criado_por: string
}

export type RespostaDoLote =
    | { ok: true; modo: 'LOTE'; resultado: ResultadoDoLote }
    | (BaixaRecusada & { parcela_id?: string })

export function loteRecusado(r: RespostaDoLote): r is BaixaRecusada & { parcela_id?: string } {
    return r.ok === false
}

/**
 * Lê o corpo do lote SÓ pelas duas chaves do contrato. Confere o FORMATO — cada id em formato
 * de uuid, que é também o que mantém o `22P02` identificando a forma. Vazio, repetido e acima de
 * 50 são REGRA, e a regra é da função (PC012, PC013, PC014): duas validações divergiriam.
 */
export function lerCorpoDoLote(bruto: unknown): CorpoDoLote | null {
    if (bruto === null || typeof bruto !== 'object') return null
    const b = bruto as Record<string, unknown>
    if (!Array.isArray(b.parcela_ids)) return null
    if (!b.parcela_ids.every((x) => typeof x === 'string' && UUID.test(x))) return null
    if (b.forma !== undefined && b.forma !== null && typeof b.forma !== 'string') return null
    const corpo: CorpoDoLote = { parcela_ids: b.parcela_ids as string[] }
    if (typeof b.forma === 'string') corpo.forma = b.forma
    return corpo
}

/**
 * O `p_formas` da função: SEMPRE um elemento por id. Forma escolhida → repetida; ausente →
 * `NULL` em cada posição, que o `coalesce` da escrita lê como "manter a combinada".
 */
export function formasDoLote(ids: readonly string[], forma: string | null | undefined): (string | null)[] {
    return ids.map(() => (typeof forma === 'string' ? forma : null))
}

/** Valor do seletor de forma da tela que significa "manter a combinada de cada parcela". */
export const MANTER_FORMA_COMBINADA = '__MANTER__'
export const ROTULO_MANTER_FORMA = 'Manter a forma combinada de cada parcela'

/** O rótulo do botão. Com 0 e acima do limite ele existe e fica DESABILITADO. */
export function rotuloDoBotaoDoLote(quantas: number): string {
    return quantas === 1 ? 'Dar baixa na 1' : `Dar baixa nas ${quantas}`
}

/** Por que o botão está desabilitado — `null` quando está habilitado. */
export function motivoDoLoteDesabilitado(quantas: number): string | null {
    if (quantas === 0) return 'Selecione parcelas em aberto para dar baixa em lote.'
    if (quantas > LIMITE_DO_LOTE) return `O lote tem no máximo ${LIMITE_DO_LOTE} parcelas — ${quantas} estão selecionadas.`
    return null
}

export interface FatosDoLote {
    quantas: number
    /** `formatBRL` da autossoma da 5a — a MESMA soma que o rodapé mostra. */
    soma: string
    /** Os códigos das vendas envolvidas, sem repetição. */
    vendas: readonly string[]
    /** A forma escolhida, ou `null` = manter a combinada de cada uma. */
    forma: string | null
    pagoEm: string
}

/**
 * A confirmação do lote. Nomeia quantas parcelas, a SOMA e as vendas envolvidas. E diz que é
 * TUDO OU NADA, porque é o que a função faz e o que a pessoa precisa saber antes de confirmar.
 */
export function textoDaConfirmacaoDoLote(f: FatosDoLote): string {
    const parcelas = f.quantas === 1 ? '1 parcela' : `${f.quantas} parcelas`
    const vendas = f.vendas.length === 0 ? 'venda não identificada' : f.vendas.join(', ')
    const forma = f.forma === null ? 'mantendo a forma combinada de cada parcela' : `forma ${f.forma} para todas`
    return `Vai ser gravado: ${parcelas}, somando ${f.soma} · vendas ${vendas} · ${forma}. `
        + `Todas passam a constar como PAGAS em ${f.pagoEm}. Se uma for recusada, nenhuma é gravada.`
}

/** Os códigos das vendas das linhas, sem repetição, na ordem em que aparecem. */
export function vendasDoLote(linhas: readonly LinhaDeVencimento[]): string[] {
    const vistas: string[] = []
    for (const l of linhas) {
        const c = l.codigoDaVenda ?? 'venda não identificada'
        if (!vistas.includes(c)) vistas.push(c)
    }
    return vistas
}

/**
 * O que a tela diz depois do lote. Os números vêm da RESPOSTA DA FUNÇÃO — quantas gravou e a
 * soma —, nunca da conta da tela. Na recusa, a frase é a do destino do código e nomeia a parcela
 * que travou, quando a função a nomeou (DETAIL = id); `rotular` a traduz para "2 de 5 · VD-…".
 */
export function avisoDoLote(r: RespostaDoLote, rotular: (id: string) => string): { tipo: 'success' | 'error'; texto: string } {
    if (!loteRecusado(r)) {
        const n = r.resultado.gravadas
        return {
            tipo: 'success',
            texto: `Baixa registrada em ${n === 1 ? '1 parcela' : `${n} parcelas`}, somando ${formatBRL(r.resultado.soma)}.`,
        }
    }
    const qual = r.parcela_id ? ` Parcela que travou o lote: ${rotular(r.parcela_id)}.` : ''
    return { tipo: 'error', texto: `${r.error}${qual}${r.codigo ? ` [${r.codigo}]` : ''}` }
}

/** Chama a rota do lote e devolve a resposta TIPADA — o mesmo cuidado de `chamarBaixaPelaRota`. */
export async function chamarLotePelaRota(buscar: BuscarRota, corpo: CorpoDoLote): Promise<RespostaDoLote> {
    const r = await buscar(ROTA_DO_LOTE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
    })
    let json: unknown
    try {
        json = await r.json()
    } catch {
        return { ok: false, motivo: DESTINO_DESCONHECIDO.motivo, error: DESTINO_DESCONHECIDO.mensagem }
    }
    const j = (json ?? {}) as Record<string, unknown>
    if (r.ok && j.ok === true && j.modo === 'LOTE' && typeof j.resultado === 'object' && j.resultado !== null) return j as RespostaDoLote
    const motivo = (MOTIVOS as readonly string[]).includes(String(j.motivo)) ? (j.motivo as MotivoDaRecusa) : DESTINO_DESCONHECIDO.motivo
    return {
        ok: false,
        motivo,
        error: typeof j.error === 'string' ? j.error : DESTINO_DESCONHECIDO.mensagem,
        codigo: typeof j.codigo === 'string' ? j.codigo : undefined,
        parcela_id: typeof j.parcela_id === 'string' ? j.parcela_id : undefined,
    }
}
