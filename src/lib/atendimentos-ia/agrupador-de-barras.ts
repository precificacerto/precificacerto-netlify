/**
 * Atendimentos I.A. — o AGRUPADOR DE BARRAS: dadas as peças de um LEVANTAMENTO inteiro, quantas
 * barras de cada código comprar, quanto sobra, e quanto custa por barra inteira e por consumo real.
 * Função PURA: não lê banco nem rede. Quem chama traz as peças, a barra de cada código (do item da
 * tabela, `orcamentista_tabela_item`) e a serra (da base de conhecimento, categoria PERFIL).
 *
 * AS REGRAS (dono do produto, 24/10/2026; a seção XL de `claude/Regra_Secao_Clientes.md`, citada
 * como fonte, NÃO está no repositório e não foi lida):
 *   - a peça é INDIVISÍVEL: nenhuma emenda. Cada peça cabe inteira numa barra ou o caso é RECUSADO;
 *   - o agrupamento é do LEVANTAMENTO inteiro: peças de esquadrias diferentes com o mesmo código
 *     compartilham barra;
 *   - códigos diferentes NUNCA se misturam, nem quando o perfil parece o mesmo;
 *   - o comprimento da barra vem DO ITEM, nunca de uma constante. Medido em 24/10/2026: 626 itens de
 *     6 m, 15 de 5,5 m, 7 de 5,8 m — um 6000 escrito aqui erraria 22 itens em silêncio;
 *   - DETERMINÍSTICO: mesma entrada, mesmas barras, sempre. Se variasse, o preço variaria sem
 *     ninguém ter mexido em nada.
 *
 * O MODELO DO CORTE — regra do dono do produto, 24/10/2026, que substitui o "um corte por peça,
 * sempre" do #143 (com ele uma peça de 6.000 mm não cabia numa barra de 6.000 mm, onde não há corte):
 *     cortes = (n − 1) + (1 se sobrar material, 0 se a soma fechar exata)
 * Um corte entre cada par de peças, mais o que separa a última peça da sobra — e esse só existe
 * quando há sobra. As peças cabem numa barra se Σ peças + (n − 1) × serra ≤ barra; encostar no fim
 * é permitido. Quando o que sobra é MENOR que a largura da serra, as peças cabem e o último corte
 * come só o que sobra (decisão do dono do produto, mesma data): `serra_consumida_mm` pode ser menor
 * que cortes × serra, e é o material de fato consumido. Com isto, uma peça só é recusada quando é
 * maior que a barra.
 *
 * O REFILO NÃO ENTRA, E NÃO É ESQUECIMENTO — decisão do dono do produto, 24/10/2026. A fábrica
 * desbasta a ponta da barra, mas é para ALINHAMENTO, não para tirar material da conta: a barra entra
 * INTEIRA, com o `medida_barra_m` do item. Por isso não há `refilo_mm` na base de conhecimento (medido
 * em 24/10/2026: nenhuma coluna, campo de catálogo ou configuração fala em refilo ou desbaste) e não
 * há corte a mais na ponta da barra na contagem de `cortes`. Quem quiser mudar isso muda uma regra,
 * não conserta um defeito — e pergunta antes (`razao-longe-da-restricao.md`).
 *
 * O ALGORITMO: first fit decrescente, por código. As peças são AGRUPADAS por (código, comprimento)
 * antes de tudo — a mesma peça em duas linhas da entrada, ou a quantidade quebrada em várias, dá o
 * mesmo resultado —, ordenadas da maior para a menor, e cada uma vai para a PRIMEIRA barra aberta
 * em que cabe; se não cabe em nenhuma, abre outra. Os códigos saem em ordem de código, comparada
 * por unidade de código (`<`), não por `localeCompare`, cujo resultado depende do ICU do ambiente.
 * Nenhum Map/Set tem a ordem de inserção usada como ordem de saída.
 *
 * AS CONTAS SÃO EM MICRÔMETROS INTEIROS. Medido em 24/10/2026: peças de 2.046,3 + 2.042,9 + 1.895,8
 * mm (peças do #143, com um corte por peça) e de 2.043,4 + 2.043,3 + 1.903,3 mm (com os dois cortes
 * entre elas), com serra de 5 mm, somam EXATAMENTE 6.000 em decimal e, em mm com ponto flutuante, na
 * ordem decrescente em que entram na barra, 6000.000000000001 — a barra recusaria o que cabe. Com inteiros
 * não há o problema; as medidas das fórmulas da linha têm decimais. Arredondar para o µm não perde
 * nada que uma serra enxergue.
 *
 * A SOBRA é TUDO o que se compra e não vira peça: comprado − útil, com o consumo da serra dentro
 * (que também sai à parte, em `serra_consumida_mm`). É por isso que a diferença entre os dois totais
 * é exatamente a sobra valorada — no item da tabela, `valor_barra_interno = valor_metro_interno ×
 * medida_barra_m` (medido em 24/10/2026: igual em todos os que têm os dois, a menos de 4e-13 R$).
 *
 * OS DOIS VALORES SAEM SEMPRE: quem escolhe entre barra inteira e consumo real é o orçamentista; o
 * sistema informa. Preço ausente dá NULL, nunca zero (`ausente-vs-falso.md`).
 *
 * Portão: `src/utils/__tests__/agrupador-de-barras.test.ts`. Mutações:
 * `scripts/harness/agrupador-de-barras/`.
 */
import { empacotar, refiloDaCor } from './regra-das-barras'

// ── A entrada ─────────────────────────────────────────────────────────────────────────────
export type PecaDoLevantamento = { codigo: string; comprimento_mm: number; quantidade: number }
/** A barra de um código, do item da tabela. `comprimento_mm` por `milimetrosDaBarra(medida_barra_m)`. */
export type BarraDoCodigo = { comprimento_mm: number | null; valor_barra_interno?: number | null; valor_metro_interno?: number | null }
/**
 * `cor`: a cor do perfil das peças (a do levantamento). Decide o REFILO (pedido 0034, `regra-das-barras.ts`): 0 no BRANCO, 45 mm por ponta nas
 * outras; ausente, ou composta com BRANCO, é recusa nomeada (`REFILO_INDETERMINADO`).
 */
export type EntradaDoAgrupador = { pecas: readonly PecaDoLevantamento[]; barras: Readonly<Record<string, BarraDoCodigo>>; serra_mm: number; cor: string | null }

// ── A saída ───────────────────────────────────────────────────────────────────────────────
/** `cortes`: um por peça, inclusive o último (pedido 0034). `usado_mm`: peças + serra. `sobra_mm`: a barra útil menos o usado. */
export type BarraCortada = { pecas_mm: number[]; cortes: number; usado_mm: number; sobra_mm: number }
export type ResultadoDoCodigo = {
    codigo: string
    comprimento_barra_mm: number
    /** O refilo por ponta (pedido 0034): 0 no BRANCO, 45 mm nas outras cores. */
    refilo_mm: number
    pecas: Array<{ comprimento_mm: number; quantidade: number }>
    n_pecas: number
    barras: BarraCortada[]
    n_barras: number
    n_cortes: number
    metros_uteis: number
    metros_comprados: number
    /** O material que a serra consome: um corte por peça. */
    serra_consumida_mm: number
    /** comprado − útil: o retalho, a serra e o refilo. */
    sobra_mm: number
    aproveitamento_pct: number
    total_por_barra_inteira: number | null
    total_por_consumo_real: number | null
}
export type TotalDoLevantamento = {
    barras_por_codigo: Record<string, number>
    n_barras: number
    metros_uteis: number
    metros_comprados: number
    /** null num levantamento sem peça: não há o que aproveitar, e 0% afirmaria desperdício. */
    aproveitamento_pct: number | null
    /** Somados só quando TODO código tem o preço: soma parcial afirmaria um total que não é. */
    total_por_barra_inteira: number | null
    total_por_consumo_real: number | null
}
export type RecusaDoAgrupador =
    | { motivo: 'SERRA_INVALIDA'; serra_mm: number; mensagem: string; codigo?: undefined }
    | { motivo: 'QUANTIDADE_INVALIDA'; codigo: string; quantidade: number; mensagem: string }
    | { motivo: 'COMPRIMENTO_INVALIDO'; codigo: string; comprimento_peca_mm: number; mensagem: string }
    | { motivo: 'BARRA_SEM_COMPRIMENTO'; codigo: string; mensagem: string }
    | { motivo: 'PECA_MAIOR_QUE_A_BARRA'; codigo: string; comprimento_peca_mm: number; comprimento_barra_mm: number; mensagem: string }
    | { motivo: 'REFILO_INDETERMINADO'; mensagem: string; codigo?: undefined }
/**
 * Para separar as duas formas, use `'recusas' in r`: com `strictNullChecks: false` (o tsconfig deste
 * repositório), o tsc não estreita a união pelo booleano `ok`.
 */
export type ResultadoDoAgrupador =
    | { ok: true; por_codigo: ResultadoDoCodigo[]; total: TotalDoLevantamento }
    | { ok: false; recusas: RecusaDoAgrupador[] }

// ── As frases ─────────────────────────────────────────────────────────────────────────────
/** `barra_mm`: a barra ÚTIL (a barra menos os dois refilos), e a peça cabe nela com a serra do corte dela (pedido 0034). */
export const fraseDaPecaMaiorQueABarra = (codigo: string, peca_mm: number, barra_mm: number) =>
    `A peça de ${peca_mm} mm do código ${codigo} é maior que a barra desse código (${barra_mm} mm). A peça não se emenda.`
export const fraseDaBarraSemComprimento = (codigo: string) =>
    `O código ${codigo} não tem o comprimento da barra no item da tabela: sem ele não há como agrupar, e nenhum comprimento é suposto.`
const fraseDaSerraInvalida = (serra_mm: number) => `A serra de ${serra_mm} mm não é válida: tem de ser um número de zero para cima.`
const fraseDaQuantidadeInvalida = (codigo: string, q: number) => `A quantidade ${q} do código ${codigo} não é válida: tem de ser um inteiro positivo.`
const fraseDoComprimentoInvalido = (codigo: string, c: number) => `O comprimento ${c} mm de uma peça do código ${codigo} não é válido: tem de ser positivo.`

// ── A barra do item ───────────────────────────────────────────────────────────────────────
/**
 * `medida_barra_m` do item em milímetros, ou null quando o item não traz a medida. A conversão passa
 * pelo micrômetro inteiro: `2,01 × 1000` dá 2009.9999999999998 em ponto flutuante. Medido em
 * 24/10/2026: nenhuma medida que existe hoje em produção falha (6; 5,8; 5,5; 1; 100; 300); 175 das
 * 12.000 medidas de até 3 casas até 12 m falham. A proteção é para a próxima tabela, não para esta.
 */
export function milimetrosDaBarra(medida_barra_m: number | null | undefined): number | null {
    if (medida_barra_m === null || medida_barra_m === undefined || !Number.isFinite(medida_barra_m)) return null
    return Math.round(medida_barra_m * 1_000_000) / 1000
}

// ── O agrupamento ─────────────────────────────────────────────────────────────────────────
const UM = 1000                                    // micrômetros por milímetro
const paraUm = (mm: number) => Math.round(mm * UM)
const paraMm = (um: number) => um / UM
const paraMetros = (um: number) => um / 1_000_000
/** Comparação por unidade de código: a mesma em qualquer ambiente. */
const porTexto = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const ORDEM_DO_MOTIVO: Record<RecusaDoAgrupador['motivo'], number> = {
    SERRA_INVALIDA: 0, REFILO_INDETERMINADO: 1, QUANTIDADE_INVALIDA: 2, COMPRIMENTO_INVALIDO: 3, BARRA_SEM_COMPRIMENTO: 4, PECA_MAIOR_QUE_A_BARRA: 5,
}
const valido = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v)

export function agruparEmBarras(entrada: EntradaDoAgrupador): ResultadoDoAgrupador {
    const recusas: RecusaDoAgrupador[] = []
    const serra = entrada.serra_mm
    if (!valido(serra) || serra < 0) recusas.push({ motivo: 'SERRA_INVALIDA', serra_mm: serra, mensagem: fraseDaSerraInvalida(serra) })
    // o refilo pela cor (pedido 0034): o que não se decide é recusa nomeada, nunca um refilo suposto
    const refilo = refiloDaCor(entrada.cor)
    if (typeof refilo !== 'number') recusas.push({ motivo: 'REFILO_INDETERMINADO', mensagem: `${refilo.motivo.charAt(0).toUpperCase()}${refilo.motivo.slice(1)}.` })
    const refiloUm = typeof refilo === 'number' ? paraUm(refilo) : 0

    // 1. as peças, agrupadas por (código, comprimento em µm) — numa lista ORDENADA, não num Map
    const agrupadas: Array<{ codigo: string; um: number; quantidade: number }> = []
    for (const p of entrada.pecas) {
        if (!Number.isInteger(p.quantidade) || p.quantidade <= 0) {
            recusas.push({ motivo: 'QUANTIDADE_INVALIDA', codigo: p.codigo, quantidade: p.quantidade, mensagem: fraseDaQuantidadeInvalida(p.codigo, p.quantidade) })
            continue
        }
        if (!valido(p.comprimento_mm) || p.comprimento_mm <= 0) {
            recusas.push({ motivo: 'COMPRIMENTO_INVALIDO', codigo: p.codigo, comprimento_peca_mm: p.comprimento_mm, mensagem: fraseDoComprimentoInvalido(p.codigo, p.comprimento_mm) })
            continue
        }
        const um = paraUm(p.comprimento_mm)
        const ja = agrupadas.find((x) => x.codigo === p.codigo && x.um === um)
        if (ja) ja.quantidade += p.quantidade
        else agrupadas.push({ codigo: p.codigo, um, quantidade: p.quantidade })
    }
    // a maior peça primeiro; desempate pelo código
    agrupadas.sort((a, b) => b.um - a.um || porTexto(a.codigo, b.codigo))
    const codigos = [...new Set(agrupadas.map((x) => x.codigo))].sort(porTexto)

    // 2. cada código contra a barra DELE
    const serraUm = valido(serra) && serra >= 0 ? paraUm(serra) : 0
    const porCodigo: ResultadoDoCodigo[] = []
    let utilTotalUm = 0
    let compradoTotalUm = 0
    for (const codigo of codigos) {
        const barra = entrada.barras[codigo]
        const barraMm = barra?.comprimento_mm
        if (!valido(barraMm) || barraMm <= 0) {
            recusas.push({ motivo: 'BARRA_SEM_COMPRIMENTO', codigo, mensagem: fraseDaBarraSemComprimento(codigo) })
            continue
        }
        const barraUm = paraUm(barraMm)
        // a barra ÚTIL: a barra menos os dois refilos; a peça cabe nela com a serra do corte dela (pedido 0034)
        const utilBarraUm = barraUm - 2 * refiloUm
        const pecas = agrupadas.filter((x) => x.codigo === codigo)
        let recusou = false
        for (const p of pecas) {
            if (p.um + serraUm > utilBarraUm) {
                recusas.push({ motivo: 'PECA_MAIOR_QUE_A_BARRA', codigo, comprimento_peca_mm: paraMm(p.um), comprimento_barra_mm: paraMm(utilBarraUm), mensagem: fraseDaPecaMaiorQueABarra(codigo, paraMm(p.um), paraMm(utilBarraUm)) })
                recusou = true
            }
        }
        if (recusou) continue

        // FFD best-fit com a serra em todo corte (`empacotar`, o núcleo único das barras): os cortes do maior para o menor
        const cortes: Array<{ um: number }> = []
        for (const p of pecas) for (let i = 0; i < p.quantidade; i++) cortes.push({ um: p.um })
        const barras = empacotar(cortes, utilBarraUm, serraUm).map((b) => ({
            pecasUm: b.pecas.map((c) => c.um), cortes: b.pecas.length, serraUm: b.pecas.length * serraUm, usadoUm: b.ocupadoUm,
        }))
        const nPecas = pecas.reduce((s, p) => s + p.quantidade, 0)
        const utilUm = pecas.reduce((s, p) => s + p.um * p.quantidade, 0)
        const compradoUm = barras.length * barraUm
        utilTotalUm += utilUm
        compradoTotalUm += compradoUm
        const vb = valido(barra.valor_barra_interno) ? barra.valor_barra_interno : null
        const vm = valido(barra.valor_metro_interno) ? barra.valor_metro_interno : null
        porCodigo.push({
            codigo,
            comprimento_barra_mm: barraMm,
            refilo_mm: paraMm(refiloUm),
            pecas: pecas.map((p) => ({ comprimento_mm: paraMm(p.um), quantidade: p.quantidade })),
            n_pecas: nPecas,
            barras: barras.map((b) => ({ pecas_mm: b.pecasUm.map(paraMm), cortes: b.cortes, usado_mm: paraMm(b.usadoUm), sobra_mm: paraMm(utilBarraUm - b.usadoUm) })),
            n_barras: barras.length,
            n_cortes: barras.reduce((s, b) => s + b.cortes, 0),
            metros_uteis: paraMetros(utilUm),
            metros_comprados: paraMetros(compradoUm),
            serra_consumida_mm: paraMm(barras.reduce((s, b) => s + b.serraUm, 0)),
            sobra_mm: paraMm(compradoUm - utilUm),
            aproveitamento_pct: (utilUm / compradoUm) * 100,
            total_por_barra_inteira: vb === null ? null : barras.length * vb,
            total_por_consumo_real: vm === null ? null : (utilUm * vm) / 1_000_000,
        })
    }

    if (recusas.length) {
        // uma recusa não esconde as outras; a ordem não depende da ordem da entrada
        const unicas = recusas.filter((r, i) => recusas.findIndex((x) => JSON.stringify(x) === JSON.stringify(r)) === i)
        unicas.sort((a, b) => porTexto(a.codigo ?? '', b.codigo ?? '') || ORDEM_DO_MOTIVO[a.motivo] - ORDEM_DO_MOTIVO[b.motivo]
            || porTexto(JSON.stringify(a), JSON.stringify(b)))
        return { ok: false, recusas: unicas }
    }

    // 3. o total do levantamento
    const somaOuNull = (k: 'total_por_barra_inteira' | 'total_por_consumo_real') =>
        porCodigo.every((c) => c[k] !== null) ? porCodigo.reduce((s, c) => s + (c[k] as number), 0) : null
    const barrasPorCodigo: Record<string, number> = {}
    for (const c of porCodigo) barrasPorCodigo[c.codigo] = c.n_barras
    return {
        ok: true,
        por_codigo: porCodigo,
        total: {
            barras_por_codigo: barrasPorCodigo,
            n_barras: porCodigo.reduce((s, c) => s + c.n_barras, 0),
            metros_uteis: paraMetros(utilTotalUm),
            metros_comprados: paraMetros(compradoTotalUm),
            aproveitamento_pct: compradoTotalUm === 0 ? null : (utilTotalUm / compradoTotalUm) * 100,
            total_por_barra_inteira: somaOuNull('total_por_barra_inteira'),
            total_por_consumo_real: somaOuNull('total_por_consumo_real'),
        },
    }
}
