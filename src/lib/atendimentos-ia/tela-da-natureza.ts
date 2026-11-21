/**
 * A TELA DA NATUREZA DA VARIÁVEL (dono do produto, 20/11/2026, item (3) da ordem; 21/11/2026: "siga para o item (3) da ordem, a TELA para o PO
 * editar a natureza e a opcao padrao sem SQL"). Puro: o que a rota e a página decidem sem banco.
 *
 *   - O RESUMO das variáveis do motor do levantamento da família: cada variável da aba Variáveis, em quantas tipologias aparece e as opções
 *     (o rótulo, e em quantas tipologias). É o que o PO vê ao escolher a natureza — a opção padrão é TEXTO, e a mesma opção "2" é "VÃO+50" numa
 *     tipologia e "VÃO+90" noutra (medido em 20/11/2026).
 *   - A CONFERÊNCIA de uma opção em texto contra TODAS as tipologias, pelo MESMO tradutor da conversa (`traduzirPolitica` com `porVariavel`):
 *     quantas casam, e quais não têm opção que comece assim ou têm mais de uma. A tela mostra antes de gravar; nunca impede (a falta, na conversa,
 *     é recusa nomeada — a política nunca vira palpite).
 *   - A LEITURA do corpo do PUT, com as frases das CHECKs da tabela (`20261121000001`) ditas antes da função.
 *
 * O que a tela NÃO faz, de propósito: REMOVER uma linha (apagar dado de conta; a baixa por marcador não foi desenhada — 0007). Linha de produto:
 * nula nesta fase (a CHECK).
 */
import { NATUREZAS, type Natureza } from '@/lib/atendimentos-ia/natureza-da-variavel'
import { opcoesDaVariavel } from '@/lib/atendimentos-ia/avaliador-de-formulas'
import { traduzirPolitica } from '@/lib/atendimentos-ia/politica-da-empresa'
import type { VariaveisDaTipologia } from '@/lib/atendimentos-ia/escolhas-da-tipologia'

export const ROTULO_DA_NATUREZA: Record<Natureza, string> = {
    POLITICA: 'Política da empresa — o agente nunca pergunta',
    ITEM: 'Do item — o vendedor diz; o agente só pergunta se o padrão do motor acrescenta peça',
    CALCULO: 'Do cálculo — o motor resolve com o padrão dele; o agente nem vê',
}
export const AVISO_SEM_REMOCAO =
    'Uma variável definida pode mudar de natureza e de opção, mas não volta a "sem definição": tirar a linha apaga dado da conta, e a baixa ainda não foi desenhada.'

export type OpcaoResumida = { rotulo: string; tipologias: number }
export type VariavelResumida = { variavel: string; descricao: string | null; tipologias: number; opcoes: OpcaoResumida[] }

/** As variáveis do motor, cada uma com as opções distintas pelo rótulo (como o motor escreve), em ordem de variável e de rótulo. */
export function resumoDasVariaveis(porTipologia: Readonly<Record<string, VariaveisDaTipologia>>): VariavelResumida[] {
    const mapa = new Map<string, { descricao: string | null; tipologias: Set<string>; opcoes: Map<string, Set<string>> }>()
    for (const [tipologia, { variaveis }] of Object.entries(porTipologia)) {
        for (const v of variaveis) {
            const r = mapa.get(v.variavel) ?? { descricao: null, tipologias: new Set<string>(), opcoes: new Map<string, Set<string>>() }
            if (r.descricao === null && v.descricao !== null && v.descricao.trim() !== '') r.descricao = v.descricao.trim()
            r.tipologias.add(tipologia)
            for (const o of opcoesDaVariavel(v.opcoes) ?? []) {
                const ts = r.opcoes.get(o.rotulo) ?? new Set<string>()
                ts.add(tipologia)
                r.opcoes.set(o.rotulo, ts)
            }
            mapa.set(v.variavel, r)
        }
    }
    const porTexto = (a: string, b: string) => a.localeCompare(b, 'pt-BR')
    return [...mapa.entries()].sort(([a], [b]) => porTexto(a, b)).map(([variavel, r]) => ({
        variavel,
        descricao: r.descricao,
        tipologias: r.tipologias.size,
        opcoes: [...r.opcoes.entries()].sort(([a], [b]) => porTexto(a, b)).map(([rotulo, ts]) => ({ rotulo, tipologias: ts.size })),
    }))
}

export type ConferenciaDaOpcao = { casam: number; semOpcao: string[]; maisDeUma: string[] }

/** A opção em texto contra cada tipologia que tem a variável, pelo tradutor da conversa. */
export function conferirOpcao(variavel: string, opcao: string, porTipologia: Readonly<Record<string, VariaveisDaTipologia>>): ConferenciaDaOpcao {
    const out: ConferenciaDaOpcao = { casam: 0, semOpcao: [], maisDeUma: [] }
    const politica = { porVariavel: { [variavel]: { natureza: 'POLITICA' as const, opcao } } }
    for (const tipologia of Object.keys(porTipologia).sort((a, b) => a.localeCompare(b, 'pt-BR'))) {
        const v = porTipologia[tipologia].variaveis.find((x) => x.variavel === variavel)
        if (!v) continue
        const t = traduzirPolitica(tipologia, v, politica)
        if (t === null) continue
        if (!('recusa' in t)) out.casam += 1
        else if (t.recusa.includes('nenhuma opção')) out.semOpcao.push(tipologia)
        else out.maisDeUma.push(tipologia)
    }
    return out
}

/** A frase da conferência para a tela; null quando todas casam. */
export function fraseDaConferencia(variavel: string, opcao: string, c: ConferenciaDaOpcao): string | null {
    if (c.semOpcao.length === 0 && c.maisDeUma.length === 0) return null
    const lista = (xs: string[]) => (xs.length <= 10 ? xs.join(', ') : `${xs.slice(0, 10).join(', ')} e mais ${xs.length - 10}`)
    const partes = [
        c.semOpcao.length > 0 ? `${c.semOpcao.length} sem opção de ${variavel} que comece com "${opcao}" (${lista(c.semOpcao)})` : null,
        c.maisDeUma.length > 0 ? `${c.maisDeUma.length} com mais de uma opção que começa assim (${lista(c.maisDeUma)})` : null,
    ].filter((p): p is string => p !== null)
    return `Casa em ${c.casam} tipologia${c.casam === 1 ? '' : 's'}; ${partes.join('; ')}. Nessas, a conversa recusa nomeando a política, nunca escolhe uma opção.`
}

export type LinhaDaTela = { familia: string; formato: string | null; variavel: string; natureza: Natureza; opcao_padrao: string | null }

const FORMA_DA_CHAVE = /^[A-Z][A-Z0-9_]{0,39}$/
const FORMA_DO_FORMATO = /^[a-z][a-z -]{0,59}$/
const CHAVES_DO_CORPO = new Set(['familia', 'formato', 'variavel', 'natureza', 'opcao_padrao'])

/** O corpo do PUT: `{ linha: {...} }`. Cada falta é uma frase; as CHECKs da tabela ditas aqui, antes da função. */
export function lerLinhaDaTela(corpo: unknown): { ok: true; linha: LinhaDaTela } | { ok: false; erros: string[] } {
    const linha = (corpo as { linha?: unknown } | null)?.linha
    if (linha === null || typeof linha !== 'object' || Array.isArray(linha)) return { ok: false, erros: ['O corpo precisa de "linha", um objeto.'] }
    const l = linha as Record<string, unknown>
    const erros: string[] = []
    for (const k of Object.keys(l)) if (!CHAVES_DO_CORPO.has(k)) erros.push(`Chave desconhecida: "${k}".`)
    const familia = typeof l.familia === 'string' ? l.familia : ''
    if (!FORMA_DA_CHAVE.test(familia)) erros.push('A família é a chave do catálogo (maiúsculas, números e _).')
    const variavel = typeof l.variavel === 'string' ? l.variavel : ''
    if (!FORMA_DA_CHAVE.test(variavel)) erros.push('A variável é o nome do motor (maiúsculas, números e _).')
    const natureza = l.natureza
    if (typeof natureza !== 'string' || !(NATUREZAS as readonly string[]).includes(natureza)) erros.push(`A natureza é uma de: ${NATUREZAS.join(', ')}.`)
    const formato = l.formato === undefined || l.formato === null || l.formato === '' ? null : l.formato
    if (formato !== null && (typeof formato !== 'string' || !FORMA_DO_FORMATO.test(formato))) erros.push('O formato é o grupo da tipologia em minúsculas ("janela correr", "maxim-ar").')
    if (formato !== null && variavel !== 'VIDRO') erros.push('Só o VIDRO tem padrão por formato; as variáveis do motor valem para a família inteira.')
    const bruta = l.opcao_padrao
    if (bruta !== undefined && bruta !== null && typeof bruta !== 'string') erros.push('A opção padrão é texto.')
    const opcao = typeof bruta === 'string' && bruta.trim() !== '' ? bruta.trim() : null
    if (opcao !== null && opcao.length > 120) erros.push(`A opção padrão tem ${opcao.length} caracteres; o limite é 120.`)
    if (natureza === 'POLITICA' && opcao === null) erros.push('A política da empresa precisa da opção padrão: é ela que o agente aplica sem perguntar.')
    if (natureza !== 'POLITICA' && opcao !== null) erros.push('Só a política da empresa tem opção padrão; do item e do cálculo, deixe em branco.')
    if (erros.length > 0) return { ok: false, erros }
    return { ok: true, linha: { familia, formato: formato as string | null, variavel, natureza: natureza as Natureza, opcao_padrao: opcao } }
}
