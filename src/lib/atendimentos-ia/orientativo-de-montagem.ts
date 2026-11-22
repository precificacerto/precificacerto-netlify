/**
 * O ORIENTATIVO DE MONTAGEM (dono do produto, 22/11/2026): um relatório POR ESQUADRIA do orçamento, no molde do que a fábrica conhece do
 * WVetro — "o relatório de montagem traz as tipologias, o desenho e a discriminação de cada elemento que compõe aquela esquadria, seguindo uma
 * ordem cronológica de categorias, trazendo a quantidade, [...] o comprimento da barra, a especificação dela". "Agora é estreitar ao máximo":
 * chegar o mais perto do que o WVetro entrega, SEM INVENTAR.
 *
 * Puro. A ordem dos blocos é a que a fábrica conhece, e não se reordena: PERFIS, ACESSÓRIOS, VIDRO, SERVIÇOS.
 *
 * DE ONDE VEM CADA CAMPO (nada é preenchido por conta — campo sem fonte é LACUNA NOMEADA, nunca número):
 * - o cabeçalho: a tipologia, a descrição, a medida, a quantidade e a cor do item; o DESENHO é o do catálogo, pela MESMA escolha do arquivo do
 *   orçamento (`comAsFiguras`, a condição que casa com as escolhas do item); sem desenho, o espaço fica vazio e diz que não há;
 * - a OBSERVAÇÃO de cada perfil e de cada acessório é a coluna 'Obs.' da LINHA DO MOTOR de onde a peça saiu. O cálculo não grava essa linha,
 *   então o relatório roda o MESMO cálculo de novo (`custoDeAgora`, só leitura) e CONFERE: as peças recalculadas têm de ser as gravadas. Se
 *   divergirem (o motor mudou desde o cálculo), o relatório diz isso e mostra as GRAVADAS, sem observação;
 * - o peso: o comprimento × a quantidade × o kg/m da tabela que vale; sem peso, o total não sai e o código é nomeado;
 * - o vidro: a fixação e as medidas dos panos, pelo avaliador; a POSIÇÃO e a COR do vidro não têm fonte (lacuna);
 * - os SERVIÇOS: bloco vazio, com a marca de que o dado não veio (a origem é decisão de depois);
 * - a FIGURA do insumo: coluna prevista e vazia (decisão do dono do produto: "a gente vê sobre isso no futuro").
 *
 * SÓ LEITURA: nada é gravado, nenhum preço é tocado, e o modo de aproveitamento do orçamento continua o que era.
 */
import type { PecaDaEsquadria } from './levantamento-de-barras'
import type { MontagemDoItem } from './custo-do-orcamento-servidor'

/** A peça como o cálculo a gravou (`orcamentista_orcamento_item_peca`, o cálculo vigente do item). */
export type PecaGravada = {
    perfil: string; codigo: string; descricao: string | null; comprimento_mm: number; quantidade_por_esquadria: number
    corte: string | null; posicao: string | null
}
/** O material como o cálculo o gravou (`orcamentista_orcamento_item_material`), só o que o orientativo lê. */
export type MaterialGravadoDaMontagem = { caminho: string; codigo_na_tabela: string; descricao: string | null; unidade_compra: string | null; consumo_item: number }

export type LinhaDePerfil = {
    codigo: string; perfil: string; descricao: string | null; quantidade: number; comprimento_mm: number
    corte: string | null; posicao: string | null
    /** kg da linha (todas as peças dela); null = o código não tem peso na tabela. */
    peso_kg: number | null
    /** A Obs. da linha do motor; null = não veio (o recálculo não conferiu, ou a linha não tem). */
    obs: string | null
}
export type LinhaDeAcessorio = {
    codigo: string; descricao: string | null; unidade: string | null; quantidade: number; obs: string | null
    /** A coluna da figura: PREVISTA e VAZIA (dono do produto, 22/11/2026). */
    figura: null
}
export type LinhaDeVidro = {
    descricao: string | null
    /** Sem fonte: nem o motor nem o item têm a cor do vidro como campo. Lacuna nomeada. */
    cor: null
    /** Sem fonte: o motor não tem a posição do pano. Lacuna nomeada. */
    posicao: null
    fixacao: string | null; quantidade: number; largura_mm: number; altura_mm: number; m2: number
}
export type ImagemDoOrientativo = { dados: string; formato: 'PNG' | 'JPEG' }

export type EsquadriaDoOrientativo = {
    ordem: number; tipologia: string | null; descricao: string | null; largura_mm: number | null; altura_mm: number | null; quantidade: number
    cor_perfil: string | null
    desenho: ImagemDoOrientativo | null
    /** Por que não há desenho (o catálogo não tem, a variável sem valor…). Nulo quando há. */
    semDesenho: string | null
    /** 'recalculado': as peças conferiram e vêm com a Obs.; 'gravado': o recálculo não conferiu, ou não rodou — as gravadas, sem Obs. */
    fonte: 'recalculado' | 'gravado'
    /** A razão de a fonte ser a gravada, dita no relatório. */
    aviso: string | null
    perfis: {
        linhas: LinhaDePerfil[]
        pedacos: number
        peso_kg: number | null
        /** O peso acumulado da obra até esta esquadria (cada esquadria × a quantidade dela); null quando algum peso não saiu. */
        peso_acumulado_kg: number | null
        codigosSemPeso: string[]
    }
    acessorios: LinhaDeAcessorio[]
    vidros: { linhas: LinhaDeVidro[]; total_m2: number }
    servicos: { linhas: never[]; falta: string }
    /** As lacunas desta esquadria, nomeadas: o campo e por que não veio. */
    lacunas: string[]
}
export type OrientativoDeMontagem = { esquadrias: EsquadriaDoOrientativo[]; itensSemCalculo: number[]; avisosDoRodape: readonly string[] }

// ── as frases ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const FALTA_DOS_SERVICOS = 'Serviços: o dado não veio — a origem dos serviços ainda não foi definida.'
export const LACUNA_DA_COR_DO_VIDRO = 'Cor do vidro: o dado não veio — nem o motor nem o item têm a cor do vidro como campo.'
export const LACUNA_DA_POSICAO_DO_VIDRO = 'Posição do vidro: o dado não veio — o motor não traz a posição de cada pano.'
export const LACUNA_DA_FIGURA = 'Figura do acessório: coluna prevista, ainda sem imagem.'
export const LACUNA_DOS_PANOS = 'Medidas dos panos de vidro: o cálculo gravou só a área, e o recálculo não conferiu — as medidas não saem.'
export const avisoDoMotorQueMudou = (n: number) =>
    `As peças recalculadas não são as gravadas (${n} ${n === 1 ? 'diferença' : 'diferenças'}): o motor mudou desde o cálculo. `
    + 'Saem as peças GRAVADAS, sem a observação de montagem; recalcule o orçamento para ter as observações.'
export const avisoDoRecalculoQueNaoRodou = (motivo: string) =>
    `O cálculo não pôde ser refeito agora (${motivo.replace(/\.$/, '')}): saem as peças GRAVADAS, sem a observação de montagem.`
export const AVISO_SEM_DESENHO = 'Sem desenho para esta tipologia.'
/**
 * OS AVISOS DO RODAPÉ, com palavras nossas (dono do produto, 22/11/2026: o mesmo conteúdo do WVetro, sem copiar as frases).
 */
export const AVISOS_DO_RODAPE: readonly string[] = [
    'Antes de montar, revise este detalhamento com um profissional habilitado: medidas, cortes e componentes podem pedir ajuste na obra.',
    'Corte e monte primeiro um item inteiro e teste o encaixe; só então corte as peças dos demais.',
]

// ── a conferência ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const chaveDaPeca = (p: { perfil: string; codigo: string; comprimento_mm: number; quantidade_por_esquadria: number; corte: string | null; posicao: string | null }) =>
    JSON.stringify([p.perfil, p.codigo, Math.round(p.comprimento_mm * 1000), p.quantidade_por_esquadria, p.corte ?? '', p.posicao ?? ''])

/** Quantas peças diferem entre as recalculadas e as gravadas (como multiconjunto, sem olhar a ordem). 0 = conferem. */
export function diferencasDasPecas(recalculadas: readonly PecaDaEsquadria[], gravadas: readonly PecaGravada[]): number {
    const conta = new Map<string, number>()
    for (const p of recalculadas) conta.set(chaveDaPeca(p), (conta.get(chaveDaPeca(p)) ?? 0) + 1)
    for (const p of gravadas) conta.set(chaveDaPeca(p), (conta.get(chaveDaPeca(p)) ?? 0) - 1)
    return [...conta.values()].reduce((t, n) => t + Math.abs(n), 0)
}

// ── a montagem ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export type EntradaDaEsquadria = {
    ordem: number; tipologia: string | null; descricao: string | null; largura_mm: number | null; altura_mm: number | null; quantidade: number
    cor_perfil: string | null; vidro: string | null
    desenho: ImagemDoOrientativo | null; semDesenho: string | null
    gravadas: PecaGravada[]
    materiais: MaterialGravadoDaMontagem[]
    /** O que o recálculo deu para este item; ou a razão de não ter rodado. */
    recalculo: MontagemDoItem | { naoRodou: string }
}

const pesoDaLinha = (comprimento_mm: number, quantidade: number, kgm: number | undefined) =>
    kgm === undefined ? null : (comprimento_mm / 1000) * quantidade * kgm

function blocoDePerfis(linhas: LinhaDePerfil[]): Omit<EsquadriaDoOrientativo['perfis'], 'peso_acumulado_kg'> {
    const codigosSemPeso = [...new Set(linhas.filter((l) => l.peso_kg === null).map((l) => l.codigo))].sort()
    return {
        linhas,
        pedacos: linhas.reduce((t, l) => t + l.quantidade, 0),
        peso_kg: codigosSemPeso.length ? null : linhas.reduce((t, l) => t + (l.peso_kg as number), 0),
        codigosSemPeso,
    }
}

/** Uma esquadria do orientativo. `pesos`: kg/m por código da tabela (`pesosDosCodigos`). O acumulado é posto por `montarOrientativo`. */
export function montarEsquadria(e: EntradaDaEsquadria, pesos: ReadonlyMap<string, number>): EsquadriaDoOrientativo {
    const lacunas: string[] = []
    const r = 'naoRodou' in e.recalculo ? null : e.recalculo
    const diferencas = r === null ? null : diferencasDasPecas(r.pecas, e.gravadas)
    const confere = r !== null && diferencas === 0
    const aviso = 'naoRodou' in e.recalculo ? avisoDoRecalculoQueNaoRodou(e.recalculo.naoRodou) : confere ? null : avisoDoMotorQueMudou(diferencas as number)

    // PERFIS: as recalculadas (com a Obs. da linha do motor) quando conferem; senão as gravadas, sem Obs.
    const linhasDePerfil: LinhaDePerfil[] = confere
        ? (r as MontagemDoItem).pecas.map((p): LinhaDePerfil => ({
            codigo: p.codigo, perfil: p.perfil, descricao: p.descricao, quantidade: p.quantidade_por_esquadria, comprimento_mm: p.comprimento_mm,
            corte: p.corte, posicao: p.posicao, peso_kg: pesoDaLinha(p.comprimento_mm, p.quantidade_por_esquadria, pesos.get(p.codigo)), obs: p.obs ?? null,
        }))
        : e.gravadas.map((p): LinhaDePerfil => ({
            codigo: p.codigo, perfil: p.perfil, descricao: p.descricao, quantidade: p.quantidade_por_esquadria, comprimento_mm: p.comprimento_mm,
            corte: p.corte, posicao: p.posicao, peso_kg: pesoDaLinha(p.comprimento_mm, p.quantidade_por_esquadria, pesos.get(p.codigo)), obs: null,
        }))

    // ACESSÓRIOS: do recálculo (com a Obs.) quando confere; senão o material gravado, por esquadria, sem Obs.
    const acessorios: LinhaDeAcessorio[] = confere
        ? (r as MontagemDoItem).insumos.map((i): LinhaDeAcessorio => {
            const porComprimento = i.por_comprimento === true
            return {
                codigo: i.codigo_na_tabela ?? i.codigo, descricao: i.descricao_na_tabela ?? i.descricao,
                unidade: porComprimento ? 'm' : i.unidade, quantidade: porComprimento ? i.quantidade / 1000 : i.quantidade, obs: i.obs ?? null, figura: null,
            }
        })
        : e.materiais.filter((m) => m.caminho === 'insumo').map((m): LinhaDeAcessorio => ({
            codigo: m.codigo_na_tabela, descricao: m.descricao, unidade: (m.unidade_compra ?? '').trim().toUpperCase() === 'MT' ? 'm' : m.unidade_compra,
            quantidade: e.quantidade > 0 ? m.consumo_item / e.quantidade : m.consumo_item, obs: null, figura: null,
        }))
    if (confere && (r as MontagemDoItem).insumos.some((i) => i.unidade === null && i.por_comprimento === null)) {
        const sem = (r as MontagemDoItem).insumos.filter((i) => i.por_comprimento === null).map((i) => i.codigo)
        lacunas.push(`Unidade do acessório: o dado não veio para ${sem.join(', ')} — o código não está na tabela de preço.`)
    }

    // VIDRO: os panos do avaliador quando confere; senão a lacuna das medidas
    const descricaoDoVidro = confere ? ((r as MontagemDoItem).vidro?.descricao ?? e.vidro) : e.vidro
    const linhasDeVidro: LinhaDeVidro[] = confere
        ? (r as MontagemDoItem).vidros.map((v): LinhaDeVidro => ({
            descricao: descricaoDoVidro, cor: null, posicao: null, fixacao: v.fixacao, quantidade: v.quantidade,
            largura_mm: v.largura_mm, altura_mm: v.altura_mm, m2: (v.largura_mm * v.altura_mm / 1e6) * v.quantidade,
        }))
        : []
    if (!confere && e.materiais.some((m) => m.caminho === 'vidro')) lacunas.push(LACUNA_DOS_PANOS)
    if (linhasDeVidro.length) lacunas.push(LACUNA_DA_COR_DO_VIDRO, LACUNA_DA_POSICAO_DO_VIDRO)
    if (acessorios.length) lacunas.push(LACUNA_DA_FIGURA)

    return {
        ordem: e.ordem, tipologia: e.tipologia, descricao: e.descricao, largura_mm: e.largura_mm, altura_mm: e.altura_mm, quantidade: e.quantidade,
        cor_perfil: e.cor_perfil, desenho: e.desenho, semDesenho: e.desenho === null ? (e.semDesenho ?? AVISO_SEM_DESENHO) : null,
        fonte: confere ? 'recalculado' : 'gravado', aviso,
        perfis: { ...blocoDePerfis(linhasDePerfil), peso_acumulado_kg: null },
        acessorios,
        vidros: { linhas: linhasDeVidro, total_m2: linhasDeVidro.reduce((t, v) => t + v.m2, 0) },
        servicos: { linhas: [], falta: FALTA_DOS_SERVICOS },
        lacunas,
    }
}

/** O orientativo inteiro: as esquadrias na ordem do orçamento, com o peso acumulado da obra (cada esquadria × a quantidade dela). */
export function montarOrientativo(entradas: readonly EntradaDaEsquadria[], pesos: ReadonlyMap<string, number>, itensSemCalculo: number[]): OrientativoDeMontagem {
    let acumulado: number | null = 0
    const esquadrias = [...entradas].sort((a, b) => a.ordem - b.ordem).map((e) => {
        const x = montarEsquadria(e, pesos)
        acumulado = acumulado === null || x.perfis.peso_kg === null ? null : acumulado + x.perfis.peso_kg * x.quantidade
        return { ...x, perfis: { ...x.perfis, peso_acumulado_kg: acumulado } }
    })
    return { esquadrias, itensSemCalculo, avisosDoRodape: AVISOS_DO_RODAPE }
}

// ── os números como o relatório os mostra ───────────────────────────────────────────────────────────────────────────────────────────
const br = (n: number, casas: number) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas }).format(n)
export const kgNoOrientativo = (v: number | null) => (v === null ? 'não sai' : `${br(v, 3)} kg`)
export const m2NoOrientativo = (v: number) => `${br(v, 3)} m²`
export const mmNoOrientativo = (v: number | null) => (v === null ? '—' : `${br(v, 0)}`)
export const quantidadeNoOrientativo = (v: number) => (Number.isInteger(Math.round(v * 1000) / 1000) ? br(v, 0) : br(v, 3))
export const fraseDoPesoQueNaoSai = (codigos: readonly string[]) =>
    `o peso não sai: ${codigos.length === 1 ? 'o código' : 'os códigos'} ${codigos.join(', ')} ${codigos.length === 1 ? 'não tem' : 'não têm'} peso na tabela de preço`

// ── as colunas e as linhas, AS MESMAS na tela e no PDF ──────────────────────────────────────────────────────────────────────────────
export const COLUNAS_DOS_PERFIS = ['Código', 'Descrição', 'Qtd', 'Medida (mm)', 'Corte', 'Posição', 'Peso', 'Observação'] as const
export const celulasDoPerfil = (l: LinhaDePerfil): string[] =>
    [l.codigo, l.descricao ?? '—', quantidadeNoOrientativo(l.quantidade), mmNoOrientativo(l.comprimento_mm), l.corte ?? '—', l.posicao ?? '—', kgNoOrientativo(l.peso_kg), l.obs ?? '']
export const COLUNAS_DOS_ACESSORIOS = ['Figura', 'Código', 'Descrição', 'Un.', 'Qtd', 'Observações'] as const
export const celulasDoAcessorio = (a: LinhaDeAcessorio): string[] =>
    ['', a.codigo, a.descricao ?? '—', a.unidade ?? '', quantidadeNoOrientativo(a.quantidade), a.obs ?? '']
export const COLUNAS_DO_VIDRO = ['Descrição', 'Cor', 'Posição', 'Fixação', 'Qtd', 'Largura', 'Altura', 'M²'] as const
export const celulasDoVidro = (v: LinhaDeVidro): string[] =>
    [v.descricao ?? '—', '', '', v.fixacao ?? '', String(v.quantidade), mmNoOrientativo(v.largura_mm), mmNoOrientativo(v.altura_mm), m2NoOrientativo(v.m2)]
export const COLUNAS_DOS_SERVICOS = ['Descrição', 'Quantidade'] as const

export const tituloDaEsquadria = (e: Pick<EsquadriaDoOrientativo, 'ordem' | 'tipologia' | 'descricao'>) =>
    `Item ${e.ordem}${e.tipologia ? ` — ${e.tipologia}` : ''}${e.descricao && e.descricao !== e.tipologia ? ` · ${e.descricao}` : ''}`
export const medidaDaEsquadria = (e: Pick<EsquadriaDoOrientativo, 'largura_mm' | 'altura_mm' | 'quantidade' | 'cor_perfil'>) =>
    `Largura ${mmNoOrientativo(e.largura_mm)} × Altura ${mmNoOrientativo(e.altura_mm)} mm · Quantidade ${e.quantidade}${e.cor_perfil ? ` · Cor ${e.cor_perfil}` : ''}`
/** O fim do bloco de perfis: os pedaços, o peso da esquadria e o peso acumulado da obra (ou por que não saem). */
export function fimDosPerfis(p: EsquadriaDoOrientativo['perfis']): string {
    const peso = p.peso_kg === null ? fraseDoPesoQueNaoSai(p.codigosSemPeso) : kgNoOrientativo(p.peso_kg)
    return `Pedaços: ${p.pedacos} · Peso do item: ${peso} · Peso acumulado da obra: ${kgNoOrientativo(p.peso_acumulado_kg)}`
}
export const fimDoVidro = (v: EsquadriaDoOrientativo['vidros']) => `Total M² do item: ${m2NoOrientativo(v.total_m2)}`
