/**
 * Atendimentos I.A. — A REFERÊNCIA POR NÚMERO a um levantamento ou orçamento que JÁ EXISTE (dono do produto, 27/11/2026, pedido 0050).
 *
 * O caso real (Felipe Klein, 27/11 15:44): "levantamento 13" virou resposta à pergunta pendente ("ainda não consegui fechar o tipo deste item…") e
 * "atualizar levantamento 13", uma lista nova ("Qual é o primeiro item do levantamento 13?"). A regra: "levantamento N" ou "orçamento N", com ou sem
 * verbo (atualizar, finalizar, fechar, calcular, gerar orçamento, recalcular, abrir), é referência ao registro N que já existe nesta empresa; a
 * referência explícita VENCE a pergunta pendente. Aqui só o que é puro: reconhecer a referência e dizer, em frases, o que foi feito. Quem lê o banco é
 * `referencia-por-numero-servidor.ts`.
 *
 * Só é referência a mensagem que NÃO traz conteúdo de esquadria: sobrando só verbos e enchimento. Com medida, tipologia, cor ou qualquer outra palavra
 * ("levantamento 13: janela 1200 x 1000"), a mensagem é alteração — e segue o caminho de sempre.
 */
export type ReferenciaPorNumero = { tipo: 'levantamento' | 'orcamento'; numero: number }

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Verbos e enchimento que não dizem nada de esquadria: sobrando só eles, a mensagem é a referência pura. */
const ENCHIMENTO = new Set([
    'atualizar', 'atualiza', 'atualize', 'finalizar', 'finaliza', 'finalize', 'fechar', 'fecha', 'feche', 'calcular', 'calcula', 'calcule', 'gerar', 'gera', 'gere',
    'recalcular', 'recalcula', 'recalcule', 'abrir', 'abre', 'abra', 'mandar', 'manda', 'mande', 'enviar', 'envia', 'envie', 'ver', 'veja', 'quero', 'queria', 'preciso',
    'pode', 'poderia', 'por', 'favor', 'pfv', 'pf', 'o', 'a', 'os', 'as', 'do', 'da', 'de', 'dos', 'das', 'no', 'na', 'um', 'uma', 'me', 'e', 'para', 'pra', 'ai', 'oi',
    'ola', 'bom', 'boa', 'dia', 'tarde', 'noite', 'numero', 'n', 'no', 'nr', 'num', 'levantamento', 'levantamentos', 'orcamento', 'orcamentos', 'pdf', 'arquivo', 'novo',
])

/** O NÚMERO do primeiro "levantamento N" ou "orçamento N"; nulo quando a mensagem não é só a referência. */
export function referenciaPorNumero(texto: string): ReferenciaPorNumero | null {
    const t = semAcento(texto)
    const m = /\b(levantamento|orcamento)s?\s*(?:n(?:umero|r|um|o)?\.?\s*)?[#º°]?\s*(\d{1,7})\b/.exec(t)
    if (!m) return null
    const resto = (t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length)).replace(/[^a-z0-9\s]/g, ' ')
    const palavras = resto.split(/\s+/).filter(Boolean)
    if (palavras.some((p) => !ENCHIMENTO.has(p))) return null
    return { tipo: m[1] as 'levantamento' | 'orcamento', numero: Number(m[2]) }
}

export type RegistroDaLista = { tipo: 'levantamento' | 'orcamento'; numero: number; nome: string }

/** N inexistente (0050, item 4): diz que não existe e lista os 5 últimos, com número e nome. */
export function fraseDoNumeroInexistente(ref: ReferenciaPorNumero, ultimos: readonly RegistroDaLista[]): string {
    const base = `Não existe o ${ref.tipo === 'levantamento' ? 'levantamento' : 'orçamento'} ${ref.numero} aqui.`
    if (ultimos.length === 0) return `${base} Você ainda não tem ${ref.tipo === 'levantamento' ? 'levantamentos' : 'orçamentos'} registrados.`
    return [`${base} Os últimos ${ref.tipo === 'levantamento' ? 'levantamentos' : 'orçamentos'} são:`, ...ultimos.slice(0, 5).map((u) => `${u.tipo === 'orcamento' ? 'orçamento' : 'levantamento'} ${u.numero} (${u.nome})`)].join('\n')
}

/** "levantamento 31 (Marcelo e rita preto liso): 11 itens, cor Preto Liso" — o resumo que abre a resposta (0050, itens 2 e 5). */
export function fraseDoResumoDoLevantamento(l: { numero: number; nome: string }, itens: { total: number; cores: readonly string[] }): string {
    const cor = itens.cores.length === 1 ? `, cor ${itens.cores[0]}` : itens.cores.length > 1 ? `, cores ${itens.cores.join(', ')}` : ''
    return `Levantamento ${l.numero} (${l.nome}): ${itens.total} ${itens.total === 1 ? 'item' : 'itens'}${cor}.`
}

/** "orçamento 14" (e o número exibido, quando difere) — para o vendedor saber o que foi feito. */
export const nomeDoOrcamento = (o: { numero: number; numeroExibido?: string }) =>
    `orçamento ${o.numero}${o.numeroExibido && o.numeroExibido !== String(o.numero) ? ` (${o.numeroExibido})` : ''}`
