/**
 * AS BARRAS DO PEDIDO (dono do produto, 22/11/2026): "é muito importante nós termos a relação das barras e como elas devem ser cortadas para
 * que a gente consiga identificar um aproveitamento do pedido."
 *
 * ══ ISTO NÃO É O PREÇO ══
 * O orçamento cobra o CONSUMO de cada item (`aproveitamento_modo = SEM`, com o motivo gravado). O aproveitamento de barras é do PEDIDO, depois
 * do fechamento: este módulo só LÊ as peças que o cálculo já gravou e diz como cortá-las. Não toca em valor nenhum do orçamento, e não usa o
 * agrupador do preço (`agrupador-de-barras.ts`, first fit, sem refilo, último corte só com sobra) — as regras daqui são outras, as do WVetro.
 *
 * ══ AS REGRAS (medidas e validadas contra o WVetro, 41 de 41 perfis do orçamento 661 — `claude/REGRA_Otimizacao_Barras_WVetro.md`) ══
 *   - AGRUPAMENTO: por PERFIL (o código da tabela) + COR, todas as esquadrias da obra juntas. Códigos ou cores diferentes nunca se misturam.
 *   - ALGORITMO: FFD best-fit. Os cortes do maior para o menor; cada um vai na barra ABERTA com a MENOR sobra que o comporte; nenhuma comporta,
 *     abre barra nova. Desempate: a barra aberta primeiro. Determinístico: mesma entrada, mesmas barras.
 *   - SERRA: por corte, INCLUSIVE o último da barra — cada peça consome o comprimento dela mais a serra. A serra é a GRAVADA nas peças (a do
 *     cálculo); serras diferentes no mesmo grupo: sem plano, nomeado.
 *   - REFILO: 45 mm em cada ponta da barra SÓ na cor PINTURA MADEIRA; nas demais, 0. A cor é a do item (`cor_perfil`).
 *   - BARRA: a do perfil, GRAVADA nas peças (`comprimento_barra_mm`, da tabela do fornecedor) — nunca 6000 fixo. Sem barra: sem plano.
 *   - SOBRA: toda sobra é reportada, barra a barra.
 *   - Peça que não cabe na barra útil (barra − 2 × refilo, com a serra): sem plano para o grupo, nomeado — a peça não se emenda.
 *
 * ══ A SAÍDA, COMO O WVETRO MOSTRA ══
 * Uma barra por linha, com as frações que saem dela — o comprimento, o tipo de corte e o ITEM/TIPOLOGIA de origem de cada pedaço — e a sobra.
 * Por perfil: barras, peso bruto (o das barras compradas), peso líquido (o das peças) e aproveitamento (peças ÷ barras compradas).
 *
 * As contas são em micrômetros inteiros (a mesma razão do agrupador: decimais das fórmulas somados em ponto flutuante passam da barra).
 *
 * Puro: não lê banco nem rede.
 */

/** Uma peça gravada pelo cálculo, com o item de onde veio. `quantidade` é a do pedido (a por esquadria vezes a do item). */
export type PecaDoPedido = {
    codigo: string
    perfil: string
    descricao: string | null
    comprimento_mm: number
    quantidade: number
    corte: string | null
    posicao: string | null
    comprimento_barra_mm: number | null
    serra_mm: number
    /** O item do orçamento: a ordem (o "Item N") e a tipologia. */
    item: number
    tipologia: string | null
    /** A cor do perfil do item; nula quando o item não a tem. */
    cor: string | null
}

/** Um pedaço cortado de uma barra, com a origem. */
export type FracaoDaBarra = { comprimento_mm: number; corte: string | null; posicao: string | null; item: number; tipologia: string | null }
/** Uma barra do plano: as frações, o material das frações e da serra, e a sobra (a barra útil menos esse material). */
export type BarraDoPedido = { fracoes: FracaoDaBarra[]; serra_mm: number; usado_mm: number; sobra_mm: number }

export type PlanoDoPerfil = {
    codigo: string
    perfil: string
    descricao: string | null
    cor: string | null
    barra_mm: number
    serra_mm: number
    /** O refilo por ponta: 45 mm em PINTURA MADEIRA, 0 nas demais. */
    refilo_mm: number
    barras: BarraDoPedido[]
    n_barras: number
    n_fracoes: number
    metros_uteis: number
    metros_comprados: number
    /** Toda a sobra do perfil: barras compradas − peças (inclui a serra e o refilo). */
    sobra_mm: number
    aproveitamento_pct: number
    /** kg/m do item da tabela; nulo quando a tabela não o tem (ou tem dois valores diferentes) — o peso não sai, e não é suposto. */
    peso_kg_m: number | null
    peso_bruto_kg: number | null
    peso_liquido_kg: number | null
}
export type PerfilSemPlano = { codigo: string; perfil: string; descricao: string | null; cor: string | null; motivo: string }

export type TotalDoPedido = {
    n_barras: number
    metros_uteis: number
    metros_comprados: number
    aproveitamento_pct: number | null
    /** Somados só quando TODO perfil tem peso: soma parcial afirmaria um total que não é. */
    peso_bruto_kg: number | null
    peso_liquido_kg: number | null
}
export type BarrasDoPedido = { perfis: PlanoDoPerfil[]; semPlano: PerfilSemPlano[]; total: TotalDoPedido }

export const REFILO_POR_PONTA_MM = 45
/** A cor que leva refilo, normalizada (sem acento, maiúscula, espaço simples). */
export const COR_COM_REFILO = 'PINTURA MADEIRA'
const normalizarCor = (cor: string | null) => (cor ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
export const refiloDaCor = (cor: string | null): number => (normalizarCor(cor).includes(COR_COM_REFILO) ? REFILO_POR_PONTA_MM : 0)

export const fraseDoPerfilSemBarra = (codigo: string) =>
    `o código ${codigo} não teve barra no cálculo (sem a medida da barra na tabela): as peças existem, o plano de barras não`
export const fraseDasBarrasDivergentes = (codigo: string, barras: readonly number[]) =>
    `o código ${codigo} foi calculado com barras diferentes nos itens (${barras.map((b) => `${b} mm`).join(', ')}): recalcule o orçamento para um plano só`
export const fraseDasSerrasDivergentes = (codigo: string, serras: readonly number[]) =>
    `o código ${codigo} foi calculado com serras diferentes nos itens (${serras.map((s) => `${s} mm`).join(', ')}): recalcule o orçamento para um plano só`
export const fraseDaPecaQueNaoCabe = (codigo: string, peca_mm: number, util_mm: number, serra_mm: number) =>
    `a peça de ${peca_mm} mm do código ${codigo} não cabe na barra útil de ${util_mm} mm com o corte de ${serra_mm} mm: a peça não se emenda`

const UM = 1000
const paraUm = (mm: number) => Math.round(mm * UM)
const paraMm = (um: number) => um / UM
const porTexto = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** O plano de UM grupo (código + cor). */
export function planoDoPerfil(pecas: readonly PecaDoPedido[], peso_kg_m: number | null): PlanoDoPerfil | PerfilSemPlano {
    const p0 = pecas[0]
    const base = { codigo: p0.codigo, perfil: p0.perfil, descricao: p0.descricao, cor: p0.cor }
    const barras = [...new Set(pecas.map((p) => p.comprimento_barra_mm))]
    if (barras.some((b) => b === null || !Number.isFinite(b) || (b as number) <= 0)) return { ...base, motivo: fraseDoPerfilSemBarra(p0.codigo) }
    if (barras.length > 1) return { ...base, motivo: fraseDasBarrasDivergentes(p0.codigo, (barras as number[]).sort((a, b) => a - b)) }
    const serras = [...new Set(pecas.map((p) => p.serra_mm))]
    if (serras.length > 1) return { ...base, motivo: fraseDasSerrasDivergentes(p0.codigo, serras.sort((a, b) => a - b)) }
    const barra_mm = barras[0] as number
    const serra_mm = serras[0]
    const refilo_mm = refiloDaCor(p0.cor)
    const utilUm = paraUm(barra_mm) - 2 * paraUm(refilo_mm)
    const serraUm = paraUm(serra_mm)

    // os cortes, um a um, do maior para o menor; desempate pelo item, pelo corte e pela posição (determinístico)
    const cortes: Array<FracaoDaBarra & { um: number }> = []
    for (const p of pecas) for (let i = 0; i < p.quantidade; i++) {
        cortes.push({ comprimento_mm: p.comprimento_mm, corte: p.corte, posicao: p.posicao, item: p.item, tipologia: p.tipologia, um: paraUm(p.comprimento_mm) })
    }
    cortes.sort((a, b) => b.um - a.um || a.item - b.item || porTexto(a.corte ?? '', b.corte ?? '') || porTexto(a.posicao ?? '', b.posicao ?? ''))
    const maior = cortes.find((c) => c.um + serraUm > utilUm)
    if (maior) return { ...base, motivo: fraseDaPecaQueNaoCabe(p0.codigo, maior.comprimento_mm, paraMm(utilUm), serra_mm) }

    // FFD best-fit: a barra aberta com a MENOR sobra que comporte a peça e o corte dela; nenhuma, barra nova
    const abertas: Array<{ ocupadoUm: number; fracoes: FracaoDaBarra[] }> = []
    for (const c of cortes) {
        const consumo = c.um + serraUm
        let melhor = -1
        for (let k = 0; k < abertas.length; k++) {
            const resto = utilUm - abertas[k].ocupadoUm
            if (consumo <= resto && (melhor === -1 || resto < utilUm - abertas[melhor].ocupadoUm)) melhor = k
        }
        const fracao: FracaoDaBarra = { comprimento_mm: c.comprimento_mm, corte: c.corte, posicao: c.posicao, item: c.item, tipologia: c.tipologia }
        if (melhor === -1) abertas.push({ ocupadoUm: consumo, fracoes: [fracao] })
        else { abertas[melhor].ocupadoUm += consumo; abertas[melhor].fracoes.push(fracao) }
    }

    const pecasUm = cortes.reduce((s, c) => s + c.um, 0)
    const compradoUm = abertas.length * paraUm(barra_mm)
    const metros_uteis = pecasUm / 1_000_000
    const metros_comprados = compradoUm / 1_000_000
    const peso = peso_kg_m !== null && Number.isFinite(peso_kg_m) && peso_kg_m > 0 ? peso_kg_m : null
    return {
        ...base,
        barra_mm, serra_mm, refilo_mm,
        barras: abertas.map((b) => ({
            fracoes: b.fracoes,
            serra_mm: paraMm(b.fracoes.length * serraUm),
            usado_mm: paraMm(b.ocupadoUm),
            sobra_mm: paraMm(utilUm - b.ocupadoUm),
        })),
        n_barras: abertas.length,
        n_fracoes: cortes.length,
        metros_uteis,
        metros_comprados,
        sobra_mm: paraMm(compradoUm - pecasUm),
        aproveitamento_pct: (pecasUm / compradoUm) * 100,
        peso_kg_m: peso,
        peso_bruto_kg: peso === null ? null : metros_comprados * peso,
        peso_liquido_kg: peso === null ? null : metros_uteis * peso,
    }
}

/**
 * O plano do pedido inteiro: as peças agrupadas por código + cor, cada grupo com o seu plano (ou o motivo de não ter), na ordem do código e da
 * cor. `pesoDoCodigo`: o kg/m de cada código (ausente = sem peso).
 */
export function montarBarrasDoPedido(pecas: readonly PecaDoPedido[], pesoDoCodigo: ReadonlyMap<string, number>): BarrasDoPedido {
    const grupos = new Map<string, PecaDoPedido[]>()
    for (const p of pecas) {
        if (!(p.quantidade > 0)) continue
        const chave = `${p.codigo}\u0000${normalizarCor(p.cor)}`
        grupos.set(chave, [...(grupos.get(chave) ?? []), p])
    }
    const perfis: PlanoDoPerfil[] = []
    const semPlano: PerfilSemPlano[] = []
    for (const chave of [...grupos.keys()].sort(porTexto)) {
        const g = grupos.get(chave) as PecaDoPedido[]
        const r = planoDoPerfil(g, pesoDoCodigo.get(g[0].codigo) ?? null)
        if ('motivo' in r) semPlano.push(r)
        else perfis.push(r)
    }
    const uteisUm = perfis.reduce((s, p) => s + Math.round(p.metros_uteis * 1_000_000), 0)
    const compradosUm = perfis.reduce((s, p) => s + Math.round(p.metros_comprados * 1_000_000), 0)
    const todosComPeso = perfis.length > 0 && perfis.every((p) => p.peso_kg_m !== null)
    return {
        perfis,
        semPlano,
        total: {
            n_barras: perfis.reduce((s, p) => s + p.n_barras, 0),
            metros_uteis: uteisUm / 1_000_000,
            metros_comprados: compradosUm / 1_000_000,
            aproveitamento_pct: compradosUm === 0 ? null : (uteisUm / compradosUm) * 100,
            peso_bruto_kg: todosComPeso ? perfis.reduce((s, p) => s + (p.peso_bruto_kg as number), 0) : null,
            peso_liquido_kg: todosComPeso ? perfis.reduce((s, p) => s + (p.peso_liquido_kg as number), 0) : null,
        },
    }
}

const numeroOuNulo = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v))
/** O kg/m de cada código: a linha com barra e peso, nas tabelas que valem; um só valor, ou nenhum. */
export function pesosDosCodigos(linhas: ReadonlyArray<{ codigo: string; peso: unknown; medida_barra_m: unknown }>): Map<string, number> {
    const porCodigo = new Map<string, Set<number>>()
    for (const l of linhas) {
        const peso = numeroOuNulo(l.peso)
        if (numeroOuNulo(l.medida_barra_m) === null || peso === null || !(peso > 0)) continue
        porCodigo.set(l.codigo, (porCodigo.get(l.codigo) ?? new Set()).add(peso))
    }
    return new Map([...porCodigo].filter(([, s]) => s.size === 1).map(([c, s]) => [c, [...s][0]]))
}
