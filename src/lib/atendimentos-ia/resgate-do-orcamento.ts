/**
 * OS DOIS CAMINHOS DO RESGATE PELO NOME (dono do produto, 18/11/2026): "são DOIS PEDIDOS DIFERENTES, e cada um busca a sua coisa."
 *   1. O pedido de ORÇAMENTO ("quero o orçamento do fulano") busca os ORÇAMENTOS pelo nome: nenhum, segue como levantamento (novo, ou o que
 *      existe com o nome); um, manda o arquivo dele de novo; mais de um, pergunta qual (QUAL_ORCAMENTO, migração 20261118000002), do mais
 *      recente ao mais antigo.
 *   2. O pedido de LEVANTAMENTO lista os levantamentos, inclusive os em montagem, e continua de onde parou.
 * O DESEMPATE, nos dois: "NÃO PERGUNTE ENDEREÇO. De forma alguma deve ficar pedindo." O agente afunila com o que JÁ TEM, nesta ordem: a
 * cidade (`orcamentista_levantamento.endereco` guarda só a cidade, medido em 18/11/2026), a data, o valor — com a família quando ela é o que
 * separa. No levantamento em montagem, que ainda não tem valor: a família e, com a família igual, a quantidade de itens.
 */
import { supabaseAdmin } from '@/supabase/admin'
import { numeroExibido } from './numero-do-orcamento'

export type PedidoDoResgate = 'orcamento' | 'levantamento'

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** O que a mensagem pede, pela palavra dita: "orçamento" ou "levantamento" — só uma das duas. As duas, ou nenhuma, não decidem. */
export function pedidoDoResgate(texto: string): PedidoDoResgate | null {
    const t = semAcento(texto)
    const orcamento = /\borcamentos?\b/.test(t)
    const levantamento = /\blevantamentos?\b/.test(t)
    return orcamento && !levantamento ? 'orcamento' : levantamento && !orcamento ? 'levantamento' : null
}

/** Um orçamento da lista: o número, o valor e o que o separa dos outros (a cidade, a data, a família). */
export type OpcaoDoOrcamento = {
    orcamentoId: string
    levantamentoId: string
    numero: number
    /** O NÚMERO EXIBIDO (23/11/2026): `<número do levantamento>-<SIGLA>`; sem a sigla, o número próprio. */
    numeroExibido: string
    nome: string
    criado_em: string
    cidade: string | null
    valor: number
    /** A família DO ORÇAMENTO (um orçamento por família, 23/11/2026); no orçamento de antes, sem família, as do levantamento. */
    familias: string[]
}

/** Um critério do desempate: o nome no log, o valor de cada opção (nulo = não informado, nunca o default) e se só entra quando separa. */
export type CriterioDoDesempate<T> = { nome: string; valor: (o: T) => string | null; soQuandoSepara?: boolean }

/**
 * OS CRITÉRIOS QUE SEPARAM AS OPÇÕES, na ordem dada: entra o primeiro que alguma opção tem; os seguintes só enquanto duas opções ainda se
 * confundem, e só se separam alguma delas. O critério `soQuandoSepara` (a família, junto do valor) entra, quando é alcançado, só se os valores
 * dele diferem. O que nenhuma opção tem não entra (ausente não é "sem cidade").
 */
export function criteriosQueSeparam<T>(opcoes: readonly T[], criterios: readonly CriterioDoDesempate<T>[]): CriterioDoDesempate<T>[] {
    const escolhidos: CriterioDoDesempate<T>[] = []
    const grupos = (cs: readonly CriterioDoDesempate<T>[]) => new Set(opcoes.map((o) => cs.map((c) => c.valor(o) ?? '').join('|'))).size
    for (const c of criterios) {
        if (opcoes.every((o) => c.valor(o) === null)) continue
        if (escolhidos.length === 0) { if (!c.soQuandoSepara) escolhidos.push(c); continue }
        if (c.soQuandoSepara) { if (new Set(opcoes.map((o) => c.valor(o) ?? '')).size > 1) escolhidos.push(c); continue }
        if (grupos(escolhidos) === opcoes.length) break
        // depois do primeiro, só entra o que SEPARA alguma das que ainda se confundem — "PVC" em todas não diz nada a quem escolhe
        if (grupos([...escolhidos, c]) > grupos(escolhidos)) escolhidos.push(c)
    }
    return escolhidos
}

const FUSO_DO_VENDEDOR = 'America/Sao_Paulo'
const dataBR = (iso: string) => {
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? 'data não lida' : new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO_DO_VENDEDOR, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
}
const emReais = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

/** O desempate do ORÇAMENTO: a cidade, a data, o valor — e a família junto do valor, quando ela é o que separa. */
export const CRITERIOS_DO_ORCAMENTO: readonly CriterioDoDesempate<OpcaoDoOrcamento>[] = [
    { nome: 'cidade', valor: (o) => o.cidade },
    { nome: 'data', valor: (o) => dataBR(o.criado_em) },
    { nome: 'valor', valor: (o) => emReais(o.valor) },
    { nome: 'familia', valor: (o) => (o.familias.length ? o.familias.join(' e ') : null), soQuandoSepara: true },
]

/** A ordem da lista: do mais recente ao mais antigo (o número desempata, para a ordem nunca depender da leitura). */
export const ordemDoOrcamento = (opcoes: readonly OpcaoDoOrcamento[]) =>
    [...opcoes].sort((a, b) => (a.criado_em < b.criado_em ? 1 : a.criado_em > b.criado_em ? -1 : b.numero - a.numero))

const linhaDoOrcamento = (o: OpcaoDoOrcamento, k: number, criterios: readonly CriterioDoDesempate<OpcaoDoOrcamento>[]) => {
    const partes = criterios.map((c) => c.valor(o)).filter((v): v is string => v !== null)
    return `${k + 1}) ${o.nome}, nº ${o.numeroExibido}${partes.length ? ` — ${partes.join(' · ')}` : ''}`
}
export const listaDosOrcamentos = (opcoes: readonly OpcaoDoOrcamento[]) => {
    const criterios = criteriosQueSeparam(opcoes, CRITERIOS_DO_ORCAMENTO)
    return opcoes.map((o, k) => linhaDoOrcamento(o, k, criterios)).join('\n')
}
/** A lista numerada dos orçamentos com o nome; o vendedor responde do jeito dele. Nunca pede endereço. */
export const fraseDeQualOrcamento = (nome: string, opcoes: readonly OpcaoDoOrcamento[]) =>
    `Achei ${opcoes.length} orçamentos de “${nome}”:\n${listaDosOrcamentos(opcoes)}\nQual deles eu te mando?`
/** A mesma lista, em outras palavras — quando a resposta não disse qual é. */
export const fraseDeQualOrcamentoEmOutrasPalavras = (nome: string, opcoes: readonly OpcaoDoOrcamento[]) =>
    `Ainda não entendi qual orçamento de “${nome}” é. Olha de novo:\n${listaDosOrcamentos(opcoes)}\nPode me dizer o número da lista, o número do orçamento, a cidade ou a data.`
/**
 * A LISTA GUARDADA, RELIDA (um orçamento por família, 23/11/2026): a pergunta guarda o LEVANTAMENTO de cada orçamento da lista, na ordem dela —
 * repetido quando o levantamento tem mais de um orçamento (um por família). A n-ésima vez que um levantamento aparece é o n-ésimo orçamento
 * dele na ordem da lista (`ordemDoOrcamento`). O levantamento cujo número de orçamentos MUDOU desde a pergunta (uma família nova, um
 * arquivado) torna a lista inválida (null): escolher pela posição mandaria o orçamento de outra família. O levantamento sem nenhum orçamento
 * agora sai da lista, como antes.
 */
export function orcamentosDaLista(levantamentos: readonly string[], lidos: readonly OpcaoDoOrcamento[]): OpcaoDoOrcamento[] | null {
    const ordenados = ordemDoOrcamento(lidos)
    const vezes = new Map<string, number>()
    for (const id of levantamentos) vezes.set(id, (vezes.get(id) ?? 0) + 1)
    for (const [id, n] of vezes) {
        const tem = ordenados.filter((o) => o.levantamentoId === id).length
        if (tem !== 0 && tem !== n) return null
    }
    const usados = new Map<string, number>()
    const lista: OpcaoDoOrcamento[] = []
    for (const id of levantamentos) {
        const k = usados.get(id) ?? 0
        usados.set(id, k + 1)
        const o = ordenados.filter((x) => x.levantamentoId === id)[k]
        if (o) lista.push(o)
    }
    return lista
}

/** O orçamento que existe e não tem arquivo gerado: nomeado, nunca em silêncio. */
export const fraseDoOrcamentoSemArquivo = (numero: number | string, nome: string) =>
    `O orçamento nº ${numero} de “${nome}” ainda não tem o arquivo gerado, e por isso não tenho o que te mandar. Se quiser, me diga o que mudar nele que eu refaço.`

/** Os levantamentos do remetente que valem para a busca: id, nome e a cidade (o endereço). */
type LevantamentoDoNome = { id: string; nome: string }

/**
 * Os ORÇAMENTOS dos levantamentos dados: só os do agente (com levantamento), da empresa, não arquivados e com valor — "a lista mostra só
 * orçamentos com número e valor". A cidade vem do levantamento; as famílias, dos itens (o rótulo do catálogo).
 */
export async function lerOrcamentosDosLevantamentos(tenantId: string, levantamentos: readonly LevantamentoDoNome[]): Promise<OpcaoDoOrcamento[]> {
    if (levantamentos.length === 0) return []
    const ids = levantamentos.map((l) => l.id)
    const [orc, lev, itens] = await Promise.all([
        supabaseAdmin.from('orcamentista_orcamento').select('id, numero, nome, levantamento_id, familia, valor_venda, criado_em')
            .eq('tenant_id', tenantId).in('levantamento_id', ids).is('deleted_at', null),
        supabaseAdmin.from('orcamentista_levantamento').select('id, numero, endereco').eq('tenant_id', tenantId).in('id', ids),
        supabaseAdmin.from('orcamentista_levantamento_item').select('levantamento_id, familia').eq('tenant_id', tenantId).in('levantamento_id', ids),
    ])
    for (const r of [orc, lev, itens]) if (r.error) throw new Error(`resgate do orçamento: ${r.error.message}`)
    const orcs = (orc.data ?? []) as Array<Record<string, unknown>>
    const familiaDe = (o: Record<string, unknown>) => (typeof o.familia === 'string' && o.familia.trim() ? o.familia.trim() : null)
    const familiasUsadas = [...new Set([
        ...((itens.data ?? []) as Array<{ familia: string | null }>).map((i) => i.familia),
        ...orcs.map(familiaDe),
    ].filter((f): f is string => !!f))]
    const rotulos = new Map<string, string>()
    const siglas = new Map<string, string>()
    if (familiasUsadas.length) {
        const cat = await supabaseAdmin.from('orcamentista_familia_catalogo').select('chave, rotulo, sigla').in('chave', familiasUsadas)
        if (cat.error) throw new Error(`resgate do orçamento: ${cat.error.message}`)
        for (const f of (cat.data ?? []) as Array<{ chave: string; rotulo: string; sigla?: string | null }>) {
            rotulos.set(f.chave, f.rotulo)
            if (typeof f.sigla === 'string' && f.sigla.trim()) siglas.set(f.chave, f.sigla.trim())
        }
    }
    const levs = (lev.data ?? []) as Array<{ id: string; numero?: number | null; endereco: string | null }>
    const cidade = new Map(levs.map((l) => [l.id, typeof l.endereco === 'string' && l.endereco.trim() ? l.endereco.trim() : null]))
    const numeroDoLev = new Map(levs.map((l) => [l.id, typeof l.numero === 'number' ? l.numero : null]))
    const familiasDoLevantamento = (levantamentoId: string) => [...new Set(((itens.data ?? []) as Array<{ levantamento_id: string; familia: string | null }>)
        .filter((i) => i.levantamento_id === levantamentoId && i.familia).map((i) => rotulos.get(i.familia as string) ?? (i.familia as string)))].sort()
    return orcs
        .filter((o) => typeof o.valor_venda === 'number' || (typeof o.valor_venda === 'string' && o.valor_venda !== ''))
        .map((o) => {
            const levantamentoId = String(o.levantamento_id)
            const familia = familiaDe(o)
            return {
                orcamentoId: String(o.id), levantamentoId, numero: Number(o.numero),
                numeroExibido: numeroExibido({ numero: Number(o.numero), levantamentoNumero: numeroDoLev.get(levantamentoId) ?? null, sigla: familia ? siglas.get(familia) ?? null : null }),
                nome: String(o.nome), criado_em: String(o.criado_em), cidade: cidade.get(levantamentoId) ?? null, valor: Number(o.valor_venda),
                familias: familia ? [rotulos.get(familia) ?? familia] : familiasDoLevantamento(levantamentoId),
            }
        })
}
