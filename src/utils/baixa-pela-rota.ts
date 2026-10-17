/**
 * baixa-pela-rota.ts — o contrato entre a ficha e `/api/cash-entries/baixa`.
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
 * OS NOVE CÓDIGOS VIRAM DESTINO PELO CÓDIGO, NUNCA PELA MENSAGEM
 * ----------------------------------------------------------------
 * A RPC levanta `PC001`..`PC009` com `ERRCODE`, e o PostgREST os devolve em `error.code`. O
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

export const ROTA_DA_BAIXA = '/api/cash-entries/baixa'

// ════════════════════════════════════════════════════════════════════════════════════════
// O CORPO DA REQUISIÇÃO
// ════════════════════════════════════════════════════════════════════════════════════════

/**
 * O que a tela manda. NÃO TEM usuário NEM tenant, de propósito: a rota os tira da sessão.
 * Se um dia alguém mandar um dos dois no corpo, a rota os IGNORA — há portão afirmando isso.
 */
export interface CorpoDaBaixa {
    parcela_id: string
    /** `YYYY-MM-DD`, o `hoje` no fuso do negócio que a tela exibiu antes de confirmar. */
    pago_em: string
    forma: string | null
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

export type BaixaAceita =
    | { ok: true; modo: 'SIMPLES' }
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
 * Os nove códigos da RPC. A chave é o `ERRCODE` declarado no corpo da função, e o destino é
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
}

export const DESTINO_SEM_PERMISSAO: Destino = {
    motivo: 'SEM_PERMISSAO', status: 403, mensagem: 'Sem permissão para dar baixa em parcelas.',
}

export const DESTINO_DESCONHECIDO: Destino = {
    motivo: 'ERRO_DESCONHECIDO', status: 500, mensagem: 'O banco recusou a baixa por um motivo não previsto. Nada foi confirmado.',
}

/**
 * O destino de um erro da RPC, PELO CÓDIGO. Código fora dos nove cai no desconhecido — e a
 * mensagem do erro não é lida aqui, nem para desempate.
 */
export function destinoDoErroDaRpc(erro: { code?: unknown } | null | undefined): Destino {
    const codigo = typeof erro?.code === 'string' ? erro.code : ''
    return DESTINO_DO_CODIGO[codigo] ?? DESTINO_DESCONHECIDO
}

// ════════════════════════════════════════════════════════════════════════════════════════
// A VALIDAÇÃO DO CORPO — o formato, e só. A REGRA é da RPC.
// ════════════════════════════════════════════════════════════════════════════════════════

const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/

/**
 * Lê o corpo SÓ pelas quatro chaves do contrato. Qualquer outra — `p_usuario_id`,
 * `usuario_id`, `tenant_id` — não é lida, e é isso que impede o autor forjado.
 *
 * O formato é conferido aqui; o VALOR (positivo, data presente) é conferido pela RPC, que é
 * a autoridade e devolve `PC001`. Duas validações da mesma regra divergiriam.
 */
export function lerCorpoDaBaixa(bruto: unknown): CorpoDaBaixa | null {
    if (bruto === null || typeof bruto !== 'object') return null
    const b = bruto as Record<string, unknown>
    if (typeof b.parcela_id !== 'string' || b.parcela_id === '') return null
    if (typeof b.pago_em !== 'string' || !DIA_ISO.test(b.pago_em)) return null
    if (b.forma !== null && typeof b.forma !== 'string') return null
    const corpo: CorpoDaBaixa = { parcela_id: b.parcela_id, pago_em: b.pago_em, forma: b.forma as string | null }
    if (b.valor_pago !== undefined) {
        if (typeof b.valor_pago !== 'number' || !Number.isFinite(b.valor_pago)) return null
        corpo.valor_pago = b.valor_pago
    }
    return corpo
}

// ════════════════════════════════════════════════════════════════════════════════════════
// A CHAMADA, do lado da tela
// ════════════════════════════════════════════════════════════════════════════════════════

export const TEXTO_BAIXA_REGISTRADA = 'Baixa registrada.'

/**
 * O que a tela diz depois da resposta. A frase de recusa VEM DO DESTINO do código, nunca da
 * mensagem do banco. `JA_PAGA` é AVISO, não sucesso: zero linhas afetadas não é "gravou".
 */
export function avisoDaBaixa(r: RespostaDaBaixa): { tipo: 'success' | 'warning' | 'error'; texto: string } {
    if (!foiRecusada(r)) return { tipo: 'success', texto: TEXTO_BAIXA_REGISTRADA }
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
    if (r.ok && j.ok === true && (j.modo === 'SIMPLES' || j.modo === 'VALOR_DIFERENTE')) return j as RespostaDaBaixa
    const motivo = (MOTIVOS as readonly string[]).includes(String(j.motivo)) ? (j.motivo as MotivoDaRecusa) : DESTINO_DESCONHECIDO.motivo
    return { ok: false, motivo, error: typeof j.error === 'string' ? j.error : DESTINO_DESCONHECIDO.mensagem, codigo: typeof j.codigo === 'string' ? j.codigo : undefined }
}
