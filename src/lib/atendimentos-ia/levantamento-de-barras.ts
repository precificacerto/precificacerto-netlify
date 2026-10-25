/**
 * Atendimentos I.A. — o LEVANTAMENTO DE BARRAS: a ligação do avaliador de fórmulas
 * (`avaliador-de-formulas.ts`) ao agrupador de barras (`agrupador-de-barras.ts`). Dadas N esquadrias
 * — tipologia, L, H, quantidade e escolhas —, as peças de cada uma, o CÓDIGO DO ITEM de cada peça,
 * e as barras do levantamento inteiro, com o aproveitamento e os dois totais. Função PURA: não lê
 * banco nem rede. Quem chama traz as tipologias, as regras do motor e os itens da tabela de preço
 * (`orcamentista_motor_regra` e `orcamentista_tabela_item`, da mesma tabela do fornecedor) e a
 * serra (base de conhecimento, categoria PERFIL).
 *
 * A PONTE ENTRE OS DOIS CÓDIGOS. O avaliador devolve a peça com o código da coluna Perfil das abas de
 * tipologia — o Código WVetro, "BZ0006/WOLFF". A tabela de preço usa o Código Wolff — "10501". A
 * aba "Motor por barra" traz os dois lado a lado (`codigo_wvetro` e `codigo` em
 * `orcamentista_motor_regra`), e a ligação é por (Código WVetro, cor). Medido em 24/10/2026, na
 * tabela Wolff: um Código Wolff tem UM WVetro sempre; um WVetro tem vários Wolff (40 de 120), um por
 * cor — e mesmo com a cor, 37 dos 509 pares têm mais de um.
 *
 * AS DECISÕES DO DONO DO PRODUTO, 24/10/2026:
 *   - A COR DESTA VERSÃO É BRANCO, FIXA (`COR_DA_PRIMEIRA_VERSAO`). As outras não existem no motor
 *     porque a tabela de preço delas não foi enviada. Nenhum de-para de cor é inventado: a lista
 *     `cores` da base de conhecimento ("branco", "amadeirado", "preto jet black") não casa com os
 *     valores da coluna `cor` do motor, e casar o parecido é o que a regra proíbe;
 *   - BARRA → REFERÊNCIA → CÓDIGO → VALOR, UM VALOR POR CÓDIGO. Dois códigos para o mesmo (perfil,
 *     cor) é dado incompleto, não ambiguidade aceitável: RECUSA com os dois códigos e os dois
 *     valores, mesmo com preço igual ("preço igual, usa os dois" foi proposto e rejeitado);
 *   - FALTOU DADO, RECUSA NOMEADA (`.claude/rules/faltou-dado-recusa-nomeada.md`): nunca aproxima,
 *     nunca escolhe o parecido, nunca calcula com o que sobrou. Com qualquer recusa, não sai barra
 *     nenhuma — e saem TODAS as recusas, de todas as esquadrias, de uma vez.
 *
 * A COR É COMPARADA EXATA. "Branco" não é BRANCO, e "LAMINADO  PRETO LISO" (dois espaços, como está
 * no banco) não é "LAMINADO PRETO LISO". Normalizar para casar é escolher o parecido.
 *
 * O PERFIL SEM VARIANTE. Quando TODAS as linhas de um perfil têm a cor vazia, o perfil não tem
 * variante — é o caso dos reforços de aço e da guia de alumínio da DP-02 (`1023`, `8432`, `8433`,
 * medido) —, e o código é o único que existe, com qualquer cor. Isso não é aproximação: não há o que
 * escolher. Mas a cor vazia AO LADO de outras cores NÃO é coringa: o que ela significa ali não foi
 * medido (`a-coluna-que-parece-enumeracao.md`, ressalvas), e a recusa diz quais variantes existem.
 *
 * A COLUNA `cor` NÃO É SÓ COR (`a-coluna-que-parece-enumeracao.md`): `BZ0012/WOLFF` só existe como
 * `CLICK`, e `BZ1770/WOLFF` como "GUARNIÇÃO ARREMATE INTERNO 17X70MM" e laminados. Em BRANCO, os dois
 * são recusados nomeando as variantes — e a DP-02 com arremate interno (ARI 1 ou 2) não fecha até
 * alguém dizer qual é o código em branco. É a regra funcionando, não um defeito.
 *
 * O PREÇO AUSENTE NÃO TRAVA AS BARRAS. Quantas barras comprar não depende do preço; o TOTAL depende.
 * O agrupador já devolve o total `null` quando um código não tem o valor — não soma os que têm —, e
 * esta ligação NOMEIA a falta em `falta_para_o_total`: o código, o perfil, o campo e o total que não
 * sai. Preço ausente nunca vira zero (`ausente-vs-falso.md`).
 *
 * Para separar as duas formas do resultado, use `'recusas' in r` (e `'recusa' in r` em `codigoDaPeca`):
 * com `strictNullChecks: false`, o tsc não estreita a união pelo booleano `ok`.
 *
 * Portão: `src/utils/__tests__/levantamento-de-barras.test.ts`. Mutações:
 * `scripts/harness/levantamento-de-barras/`.
 */
import { avaliarTipologia, type AvisoDoAvaliador, type Tipologia } from './avaliador-de-formulas'
import { agruparEmBarras, milimetrosDaBarra, type BarraDoCodigo, type ResultadoDoCodigo, type TotalDoLevantamento } from './agrupador-de-barras'

/** Decisão do dono do produto, 24/10/2026: só BRANCO tem tabela de preço enviada. */
export const COR_DA_PRIMEIRA_VERSAO = 'BRANCO'

// ── A entrada ─────────────────────────────────────────────────────────────────────────────
export type EsquadriaDoLevantamento = {
    tipologia: string
    L_mm: number
    H_mm: number
    quantidade: number
    escolhas?: Readonly<Record<string, number>>
    espessura_vidro_mm?: number | null
}
/** Uma linha de `orcamentista_motor_regra`, só com o que a ponte lê. */
export type RegraDoDePara = { codigo: string; codigo_wvetro: string; cor: string | null }
/** Uma linha de `orcamentista_tabela_item`, só com o que a barra e o preço leem. */
export type ItemDaTabela = {
    codigo: string
    descricao?: string | null
    medida_barra_m: number | null
    valor_barra_interno: number | null
    valor_metro_interno: number | null
}
export type EntradaDoLevantamento = {
    esquadrias: readonly EsquadriaDoLevantamento[]
    tipologias: Readonly<Record<string, Tipologia>>
    regras: readonly RegraDoDePara[]
    itens: readonly ItemDaTabela[]
    serra_mm: number
}

// ── A saída ───────────────────────────────────────────────────────────────────────────────
export type PecaDaEsquadria = {
    perfil: string
    codigo: string
    descricao: string
    comprimento_mm: number
    quantidade_por_esquadria: number
    /** quantidade_por_esquadria × a quantidade da esquadria */
    quantidade: number
}
export type EsquadriaLevantada = {
    indice: number
    tipologia: string
    L_mm: number
    H_mm: number
    quantidade: number
    pecas: PecaDaEsquadria[]
    avisos: AvisoDoAvaliador[]
}
export type CodigoLevantado = ResultadoDoCodigo & { perfil: string; descricao: string | null }
export type FaltaParaOTotal = {
    codigo: string
    perfil: string
    falta: 'valor_barra_interno' | 'valor_metro_interno'
    total: 'total_por_barra_inteira' | 'total_por_consumo_real'
    mensagem: string
}
export type CandidatoDoCodigo = { codigo: string; descricao: string | null; valor_barra_interno: number | null; valor_metro_interno: number | null }
export type OrigemDaRecusa = 'ESQUADRIA' | 'AVALIADOR' | 'CODIGO' | 'ITEM' | 'AGRUPADOR'
export type RecusaDoLevantamento = {
    origem: OrigemDaRecusa
    motivo: string
    mensagem: string
    /** As esquadrias (de 1 em diante) em que a mesma falta aparece. Vazia quando não é de esquadria. */
    esquadrias: number[]
    tipologia?: string
    perfil?: string
    cor?: string
    codigo?: string
    candidatos?: CandidatoDoCodigo[]
    variantes?: string[]
}
export type ResultadoDoLevantamento =
    | {
        ok: true
        cor: string
        esquadrias: EsquadriaLevantada[]
        por_codigo: CodigoLevantado[]
        total: TotalDoLevantamento
        /** Os códigos sem o valor que um dos totais precisa. O total afetado sai `null`. */
        falta_para_o_total: FaltaParaOTotal[]
        avisos: Array<AvisoDoAvaliador & { esquadria: number }>
    }
    | { ok: false; recusas: RecusaDoLevantamento[] }

// ── O dinheiro, sem ICU ───────────────────────────────────────────────────────────────────
/** "R$ 1.055,25". Escrito à mão: o resultado de `toLocaleString` depende do ICU do ambiente. */
export function formatarReais(v: number | null | undefined): string {
    if (v === null || v === undefined || !Number.isFinite(v)) return 'sem valor'
    const centavos = Math.round(Math.abs(v) * 100)
    const inteiro = String(Math.floor(centavos / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    const resto = String(centavos % 100).padStart(2, '0')
    return `${v < 0 ? '−' : ''}R$ ${inteiro},${resto}`
}

// ── A ponte: (perfil, cor) → código do item ──────────────────────────────────────────────
const porTexto = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const distintos = (xs: string[]) => [...new Set(xs)].sort(porTexto)
const VAZIA = '(vazia)'
/** O candidato antes de a tabela de preço ser lida: a descrição e os valores entram em `completarDoisCodigos`. */
const soOCodigo = (codigo: string): CandidatoDoCodigo => ({ codigo, descricao: null, valor_barra_interno: null, valor_metro_interno: null })

type RecusaDaPonte = Omit<RecusaDoLevantamento, 'esquadrias' | 'mensagem'> & { texto: string }
export type ResultadoDaPonte =
    | { ok: true; codigo: string; origem: 'COR' | 'SEM_VARIANTE' }
    | { ok: false; recusa: RecusaDoLevantamento }

function ponte(perfil: string, cor: string, regras: readonly RegraDoDePara[]): { ok: true; codigo: string; origem: 'COR' | 'SEM_VARIANTE' } | { ok: false; recusa: RecusaDaPonte } {
    const linhas = regras.filter((r) => r.codigo_wvetro === perfil)
    if (!linhas.length) {
        return { ok: false, recusa: { origem: 'CODIGO', motivo: 'PERFIL_SEM_REGRA', perfil, cor,
            texto: `o perfil ${perfil} não está em nenhuma regra da tabela do fornecedor. Falta: o código do item de ${perfil}.` } }
    }
    const daCor = distintos(linhas.filter((r) => r.cor === cor).map((r) => r.codigo))
    if (daCor.length === 1) return { ok: true, codigo: daCor[0], origem: 'COR' }
    if (daCor.length > 1) return { ok: false, recusa: { origem: 'CODIGO', motivo: 'DOIS_CODIGOS', perfil, cor, texto: '', candidatos: daCor.map(soOCodigo) } }
    if (linhas.every((r) => r.cor === null)) {
        const unicos = distintos(linhas.map((r) => r.codigo))
        if (unicos.length === 1) return { ok: true, codigo: unicos[0], origem: 'SEM_VARIANTE' }
        return { ok: false, recusa: { origem: 'CODIGO', motivo: 'DOIS_CODIGOS', perfil, cor, texto: '', candidatos: unicos.map(soOCodigo) } }
    }
    const variantes = distintos(linhas.map((r) => r.cor ?? VAZIA))
    return { ok: false, recusa: { origem: 'CODIGO', motivo: 'COR_SEM_CODIGO', perfil, cor, variantes,
        texto: `o perfil ${perfil} não tem código para a cor ${cor} na tabela do fornecedor; as variantes que existem são: ${variantes.join(', ')}. Falta: o código de ${perfil} em ${cor}.` } }
}

/** Os candidatos com descrição e valores, e a frase que nomeia os dois códigos e os dois valores. */
function completarDoisCodigos(r: RecusaDaPonte, itens: readonly ItemDaTabela[]): RecusaDaPonte {
    const candidatos = (r.candidatos ?? []).map((c) => {
        const it = itens.find((i) => i.codigo === c.codigo)
        return { codigo: c.codigo, descricao: it?.descricao ?? null, valor_barra_interno: it?.valor_barra_interno ?? null, valor_metro_interno: it?.valor_metro_interno ?? null }
    })
    const lista = candidatos.map((c) => `${c.codigo} (${formatarReais(c.valor_barra_interno)} a barra)`)
    const juntos = lista.length > 1 ? `${lista.slice(0, -1).join(', ')} e ${lista[lista.length - 1]}` : lista.join('')
    return { ...r, candidatos,
        texto: `o perfil ${r.perfil} em ${r.cor} tem ${candidatos.length} códigos na tabela do fornecedor: ${juntos}. Um valor por código: falta dizer qual deles é a peça.` }
}

/** A ponte, para quem quer só o código de uma peça. A recusa sai sem esquadria. */
export function codigoDaPeca(perfil: string, cor: string, regras: readonly RegraDoDePara[], itens: readonly ItemDaTabela[] = []): ResultadoDaPonte {
    const p = ponte(perfil, cor, regras)
    if (!('recusa' in p)) return p
    const r = p.recusa.motivo === 'DOIS_CODIGOS' ? completarDoisCodigos(p.recusa, itens) : p.recusa
    const { texto, ...resto } = r
    return { ok: false, recusa: { ...resto, esquadrias: [], mensagem: maiuscula(texto) } }
}

// ── As frases ─────────────────────────────────────────────────────────────────────────────
const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
function listaDeNumeros(ns: number[]): string {
    return ns.length > 1 ? `${ns.slice(0, -1).join(', ')} e ${ns[ns.length - 1]}` : String(ns[0])
}
function prefixo(esquadrias: number[], tipologia?: string): string {
    if (!esquadrias.length) return ''
    const quem = esquadrias.length > 1 ? `Esquadrias ${listaDeNumeros(esquadrias)}` : `Esquadria ${esquadrias[0]}`
    return tipologia ? `${quem} (${tipologia}): ` : `${quem}: `
}

// ── O levantamento ────────────────────────────────────────────────────────────────────────
const ORDEM_DA_ORIGEM: Record<OrigemDaRecusa, number> = { ESQUADRIA: 0, AVALIADOR: 1, CODIGO: 2, ITEM: 3, AGRUPADOR: 4 }

type RecusaParcial = Omit<RecusaDoLevantamento, 'mensagem' | 'esquadrias'> & { texto: string; esquadria?: number; comTipologia?: boolean }

export function levantarBarras(entrada: EntradaDoLevantamento): ResultadoDoLevantamento {
    const cor = COR_DA_PRIMEIRA_VERSAO
    const parciais: RecusaParcial[] = []

    // 1. cada esquadria pelo avaliador
    type PecaBruta = { esquadria: number; perfil: string; descricao: string; comprimento_mm: number; quantidade_por_esquadria: number; quantidade: number }
    const brutas: PecaBruta[] = []
    const levantadas: Array<Omit<EsquadriaLevantada, 'pecas'>> = []
    entrada.esquadrias.forEach((e, k) => {
        const indice = k + 1
        if (!Number.isInteger(e.quantidade) || e.quantidade <= 0) {
            parciais.push({ origem: 'ESQUADRIA', motivo: 'QUANTIDADE_DA_ESQUADRIA_INVALIDA', tipologia: e.tipologia, esquadria: indice, comTipologia: true,
                texto: `a quantidade ${e.quantidade} não é válida: tem de ser um inteiro positivo.` })
            return
        }
        const tipologia = Object.prototype.hasOwnProperty.call(entrada.tipologias, e.tipologia) ? entrada.tipologias[e.tipologia] : undefined
        if (!tipologia) {
            parciais.push({ origem: 'ESQUADRIA', motivo: 'TIPOLOGIA_SEM_DEFINICAO', tipologia: e.tipologia, esquadria: indice, comTipologia: true,
                texto: `a tipologia ${e.tipologia} não tem definição (abas do motor) neste levantamento. Falta: a tipologia ${e.tipologia}.` })
            return
        }
        const r = avaliarTipologia({ tipologia, L_mm: e.L_mm, H_mm: e.H_mm, escolhas: e.escolhas, espessura_vidro_mm: e.espessura_vidro_mm })
        if ('recusas' in r) {
            for (const x of r.recusas) {
                parciais.push({ origem: 'AVALIADOR', motivo: x.motivo, tipologia: e.tipologia, perfil: x.perfil, esquadria: indice, comTipologia: true, texto: x.mensagem })
            }
            return
        }
        levantadas.push({ indice, tipologia: e.tipologia, L_mm: e.L_mm, H_mm: e.H_mm, quantidade: e.quantidade, avisos: r.avisos })
        for (const p of r.pecas) {
            brutas.push({ esquadria: indice, perfil: p.codigo, descricao: p.descricao, comprimento_mm: p.comprimento_mm,
                quantidade_por_esquadria: p.quantidade, quantidade: p.quantidade * e.quantidade })
        }
    })

    // 2. a ponte, uma vez por perfil
    const perfis = distintos(brutas.map((p) => p.perfil))
    const codigoDoPerfil: Record<string, string> = {}
    for (const perfil of perfis) {
        const p = ponte(perfil, cor, entrada.regras)
        const esquadrias = [...new Set(brutas.filter((b) => b.perfil === perfil).map((b) => b.esquadria))]
        if (!('recusa' in p)) { codigoDoPerfil[perfil] = p.codigo; continue }
        const r = p.recusa.motivo === 'DOIS_CODIGOS' ? completarDoisCodigos(p.recusa, entrada.itens) : p.recusa
        for (const esquadria of esquadrias) parciais.push({ ...r, esquadria })
    }

    // 3. o item de cada código: existe, e numa linha só
    const itemDoCodigo: Record<string, ItemDaTabela> = {}
    for (const perfil of perfis) {
        const codigo = codigoDoPerfil[perfil]
        if (codigo === undefined) continue
        const linhas = entrada.itens.filter((i) => i.codigo === codigo)
        const esquadrias = [...new Set(brutas.filter((b) => b.perfil === perfil).map((b) => b.esquadria))]
        if (linhas.length === 1) { itemDoCodigo[codigo] = linhas[0]; continue }
        const motivo = linhas.length === 0 ? 'ITEM_AUSENTE' : 'ITEM_EM_DUAS_LINHAS'
        const texto = linhas.length === 0
            ? `o código ${codigo} (perfil ${perfil}) não está na tabela de preço. Falta: o item ${codigo}, com a barra e o valor.`
            : `o código ${codigo} (perfil ${perfil}) está em ${linhas.length} linhas da tabela de preço, com ${linhas.map((l) => formatarReais(l.valor_barra_interno)).join(' e ')} a barra. Um valor por código: falta dizer qual linha vale.`
        for (const esquadria of esquadrias) parciais.push({ origem: 'ITEM', motivo, perfil, cor, codigo, esquadria, texto })
    }

    // 4. o agrupador, com as peças que têm código e item — mesmo havendo recusa, para que as dele
    //    também saiam de uma vez. O resultado dele só é devolvido se não houver recusa nenhuma.
    const perfilDoCodigo: Record<string, string> = {}
    for (const perfil of perfis) if (codigoDoPerfil[perfil] !== undefined) perfilDoCodigo[codigoDoPerfil[perfil]] = perfil
    const prontas = brutas.filter((b) => itemDoCodigo[codigoDoPerfil[b.perfil]] !== undefined)
    const barras: Record<string, BarraDoCodigo> = {}
    for (const [codigo, it] of Object.entries(itemDoCodigo)) {
        barras[codigo] = { comprimento_mm: milimetrosDaBarra(it.medida_barra_m), valor_barra_interno: it.valor_barra_interno, valor_metro_interno: it.valor_metro_interno }
    }
    const agrupado = agruparEmBarras({
        pecas: prontas.map((b) => ({ codigo: codigoDoPerfil[b.perfil], comprimento_mm: b.comprimento_mm, quantidade: b.quantidade })),
        barras,
        serra_mm: entrada.serra_mm,
    })
    if ('recusas' in agrupado) {
        for (const x of agrupado.recusas) {
            const perfil = x.codigo !== undefined ? perfilDoCodigo[x.codigo] : undefined
            const esquadrias = perfil ? [...new Set(prontas.filter((b) => b.perfil === perfil).map((b) => b.esquadria))] : []
            const texto = perfil ? `${x.mensagem} (perfil ${perfil})` : x.mensagem
            if (!esquadrias.length) parciais.push({ origem: 'AGRUPADOR', motivo: x.motivo, codigo: x.codigo, perfil, texto })
            for (const esquadria of esquadrias) parciais.push({ origem: 'AGRUPADOR', motivo: x.motivo, codigo: x.codigo, perfil, esquadria, texto })
        }
    }

    // as recusas do agrupador já estão em `parciais`; a segunda condição só estreita o tipo
    if (parciais.length || 'recusas' in agrupado) return { ok: false, recusas: juntar(parciais) }

    // 5. o resultado
    const falta: FaltaParaOTotal[] = []
    for (const c of agrupado.por_codigo) {
        const it = itemDoCodigo[c.codigo]
        const perfil = perfilDoCodigo[c.codigo]
        if (!Number.isFinite(it.valor_barra_interno as number)) falta.push({ codigo: c.codigo, perfil, falta: 'valor_barra_interno', total: 'total_por_barra_inteira',
            mensagem: `O código ${c.codigo} (perfil ${perfil}) não tem o valor da barra na tabela de preço: o total por barra inteira não sai. Falta: o valor da barra de ${c.codigo}.` })
        if (!Number.isFinite(it.valor_metro_interno as number)) falta.push({ codigo: c.codigo, perfil, falta: 'valor_metro_interno', total: 'total_por_consumo_real',
            mensagem: `O código ${c.codigo} (perfil ${perfil}) não tem o valor do metro na tabela de preço: o total por consumo real não sai. Falta: o valor do metro de ${c.codigo}.` })
    }
    const esquadrias: EsquadriaLevantada[] = levantadas.map((e) => ({
        ...e,
        pecas: brutas.filter((b) => b.esquadria === e.indice).map((b) => ({
            perfil: b.perfil, codigo: codigoDoPerfil[b.perfil], descricao: b.descricao, comprimento_mm: b.comprimento_mm,
            quantidade_por_esquadria: b.quantidade_por_esquadria, quantidade: b.quantidade,
        })),
    }))
    return {
        ok: true,
        cor,
        esquadrias,
        por_codigo: agrupado.por_codigo.map((c) => ({ ...c, perfil: perfilDoCodigo[c.codigo], descricao: itemDoCodigo[c.codigo].descricao ?? null })),
        total: agrupado.total,
        falta_para_o_total: falta,
        avisos: levantadas.flatMap((e) => e.avisos.map((a) => ({ ...a, esquadria: e.indice }))),
    }
}

/**
 * A mesma falta em várias esquadrias sai UMA vez, com as esquadrias juntas; a ordem não depende da
 * ordem da entrada: origem, depois perfil, tipologia e código por texto, depois motivo e frase.
 */
function juntar(parciais: RecusaParcial[]): RecusaDoLevantamento[] {
    const chave = (p: RecusaParcial) => JSON.stringify([p.origem, p.motivo, p.tipologia ?? '', p.perfil ?? '', p.codigo ?? '', p.texto])
    const grupos: Array<{ base: RecusaParcial; esquadrias: number[] }> = []
    for (const p of parciais) {
        const g = grupos.find((x) => chave(x.base) === chave(p))
        if (g) { if (p.esquadria !== undefined && !g.esquadrias.includes(p.esquadria)) g.esquadrias.push(p.esquadria) }
        else grupos.push({ base: p, esquadrias: p.esquadria !== undefined ? [p.esquadria] : [] })
    }
    const recusas = grupos.map(({ base, esquadrias }) => {
        const { texto, esquadria: _e, comTipologia, ...resto } = base
        void _e
        const ordenadas = [...esquadrias].sort((a, b) => a - b)
        const p = prefixo(ordenadas, comTipologia ? base.tipologia : undefined)
        return { ...resto, esquadrias: ordenadas, mensagem: p ? p + texto : maiuscula(texto) }
    })
    recusas.sort((a, b) => ORDEM_DA_ORIGEM[a.origem] - ORDEM_DA_ORIGEM[b.origem]
        || porTexto(a.perfil ?? '', b.perfil ?? '') || porTexto(a.tipologia ?? '', b.tipologia ?? '')
        || porTexto(a.codigo ?? '', b.codigo ?? '') || porTexto(a.motivo, b.motivo) || porTexto(a.mensagem, b.mensagem))
    return recusas
}
