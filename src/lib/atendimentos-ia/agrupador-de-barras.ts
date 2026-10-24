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
 * O MODELO DO CORTE — decisão do dono do produto, 24/10/2026: cada peça consome UM corte de
 * `serra_mm`, inclusive a última, que a separa da sobra. Uma barra comporta as peças cuja soma de
 * (comprimento + serra) não passa do comprimento da barra; encostar no fim é permitido (≤).
 * Consequência, escrita porque surpreende: uma peça do tamanho EXATO da barra não cabe (6.000 + 5 >
 * 6.000) — ela é recusada com motivo próprio, `PECA_NAO_CABE_COM_O_CORTE`, e não como "maior que a
 * barra", que seria uma afirmação falsa.
 *
 * O ALGORITMO: first fit decrescente, por código. As peças são AGRUPADAS por (código, comprimento)
 * antes de tudo — a mesma peça em duas linhas da entrada, ou a quantidade quebrada em várias, dá o
 * mesmo resultado —, ordenadas da maior para a menor, e cada uma vai para a PRIMEIRA barra aberta
 * em que cabe; se não cabe em nenhuma, abre outra. Os códigos saem em ordem de código, comparada
 * por unidade de código (`<`), não por `localeCompare`, cujo resultado depende do ICU do ambiente.
 * Nenhum Map/Set tem a ordem de inserção usada como ordem de saída.
 *
 * AS CONTAS SÃO EM MICRÔMETROS INTEIROS. Medido em 24/10/2026: peças de 2.994,3 + 1.896,8 + 1.093,9
 * mm com serra de 5 mm somam EXATAMENTE 6.000 em decimal e 6000.000000000001 em ponto flutuante — a
 * barra recusaria o que cabe. Com inteiros não há o problema; as medidas das fórmulas da família têm
 * decimais. Arredondar para o µm não perde nada que uma serra enxergue.
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

// ── A entrada ─────────────────────────────────────────────────────────────────────────────
export type PecaDoLevantamento = { codigo: string; comprimento_mm: number; quantidade: number }
/** A barra de um código, do item da tabela. `comprimento_mm` por `milimetrosDaBarra(medida_barra_m)`. */
export type BarraDoCodigo = { comprimento_mm: number | null; valor_barra_interno?: number | null; valor_metro_interno?: number | null }
export type EntradaDoAgrupador = { pecas: readonly PecaDoLevantamento[]; barras: Readonly<Record<string, BarraDoCodigo>>; serra_mm: number }

// ── A saída ───────────────────────────────────────────────────────────────────────────────
export type BarraCortada = { pecas_mm: number[]; usado_mm: number; sobra_mm: number }
export type ResultadoDoCodigo = {
    codigo: string
    comprimento_barra_mm: number
    pecas: Array<{ comprimento_mm: number; quantidade: number }>
    n_pecas: number
    barras: BarraCortada[]
    n_barras: number
    metros_uteis: number
    metros_comprados: number
    serra_consumida_mm: number
    /** comprado − útil: o retalho e a serra. */
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
    | { motivo: 'PECA_NAO_CABE_COM_O_CORTE'; codigo: string; comprimento_peca_mm: number; comprimento_barra_mm: number; serra_mm: number; mensagem: string }
/**
 * Para separar as duas formas, use `'recusas' in r`: com `strictNullChecks: false` (o tsconfig deste
 * repositório), o tsc não estreita a união pelo booleano `ok`.
 */
export type ResultadoDoAgrupador =
    | { ok: true; por_codigo: ResultadoDoCodigo[]; total: TotalDoLevantamento }
    | { ok: false; recusas: RecusaDoAgrupador[] }

// ── As frases ─────────────────────────────────────────────────────────────────────────────
export const fraseDaPecaMaiorQueABarra = (codigo: string, peca_mm: number, barra_mm: number) =>
    `A peça de ${peca_mm} mm do código ${codigo} é maior que a barra desse código (${barra_mm} mm). A peça não se emenda.`
export const fraseDaPecaQueNaoCabeComOCorte = (codigo: string, peca_mm: number, barra_mm: number, serra_mm: number) =>
    `A peça de ${peca_mm} mm do código ${codigo} só caberia na barra de ${barra_mm} mm sem o corte: com a serra de ${serra_mm} mm ela ocupa ${peca_mm + serra_mm} mm.`
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
    SERRA_INVALIDA: 0, QUANTIDADE_INVALIDA: 1, COMPRIMENTO_INVALIDO: 2, BARRA_SEM_COMPRIMENTO: 3, PECA_MAIOR_QUE_A_BARRA: 4, PECA_NAO_CABE_COM_O_CORTE: 5,
}
const valido = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v)

export function agruparEmBarras(entrada: EntradaDoAgrupador): ResultadoDoAgrupador {
    const recusas: RecusaDoAgrupador[] = []
    const serra = entrada.serra_mm
    if (!valido(serra) || serra < 0) recusas.push({ motivo: 'SERRA_INVALIDA', serra_mm: serra, mensagem: fraseDaSerraInvalida(serra) })

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
        const pecas = agrupadas.filter((x) => x.codigo === codigo)
        let recusou = false
        for (const p of pecas) {
            if (p.um > barraUm) {
                recusas.push({ motivo: 'PECA_MAIOR_QUE_A_BARRA', codigo, comprimento_peca_mm: paraMm(p.um), comprimento_barra_mm: barraMm, mensagem: fraseDaPecaMaiorQueABarra(codigo, paraMm(p.um), barraMm) })
                recusou = true
            } else if (p.um + serraUm > barraUm) {
                recusas.push({ motivo: 'PECA_NAO_CABE_COM_O_CORTE', codigo, comprimento_peca_mm: paraMm(p.um), comprimento_barra_mm: barraMm, serra_mm: serra, mensagem: fraseDaPecaQueNaoCabeComOCorte(codigo, paraMm(p.um), barraMm, serra) })
                recusou = true
            }
        }
        if (recusou) continue

        // first fit decrescente: a primeira barra aberta em que a peça cabe, ou uma nova
        const barras: Array<{ usadoUm: number; pecasUm: number[] }> = []
        for (const p of pecas) {
            for (let i = 0; i < p.quantidade; i++) {
                const ocupa = p.um + serraUm
                const destino = barras.find((b) => b.usadoUm + ocupa <= barraUm)
                if (destino) { destino.usadoUm += ocupa; destino.pecasUm.push(p.um) }
                else barras.push({ usadoUm: ocupa, pecasUm: [p.um] })
            }
        }
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
            pecas: pecas.map((p) => ({ comprimento_mm: paraMm(p.um), quantidade: p.quantidade })),
            n_pecas: nPecas,
            barras: barras.map((b) => ({ pecas_mm: b.pecasUm.map(paraMm), usado_mm: paraMm(b.usadoUm), sobra_mm: paraMm(barraUm - b.usadoUm) })),
            n_barras: barras.length,
            metros_uteis: paraMetros(utilUm),
            metros_comprados: paraMetros(compradoUm),
            serra_consumida_mm: paraMm(nPecas * serraUm),
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
