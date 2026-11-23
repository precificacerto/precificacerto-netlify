/**
 * OS RELATÓRIOS I.A. EM PDF, PARA IMPRESSÃO (dono do produto, 17/11/2026): "Relatório de material e relatório de corte, ambos devem ter um
 * arquivo para impressão. Então, deve ser em PDF."
 *
 * Puro: recebe o relatório como a rota o devolve (o mesmo que a tela mostra) e devolve os bytes do PDF. Nada é recalculado aqui — o PDF é a
 * tela no papel: as mesmas categorias, na mesma ordem, os mesmos números. A4 retrato, com o cabeçalho do orçamento e "Página N de M".
 */
import { jsPDF } from 'jspdf'
import { fraseDoTotalSemCusto, quantidadeNoRelatorio, reaisNoRelatorio, type MaterialDoRelatorio, type RelatorioDeMateriais, type TotalDoGrupo } from './relatorio-de-materiais'
import type { CodigoDoCorte, RelatorioDeCorte } from './relatorio-de-corte'
import type { BarrasDoPedido, FracaoDaBarra, PlanoDoPerfil } from './barras-do-pedido'
import { desenharFiguraProporcional } from './folha-do-levantamento'
import {
    COLUNAS_DO_VIDRO, COLUNAS_DOS_ACESSORIOS, COLUNAS_DOS_PERFIS, COLUNAS_DOS_SERVICOS, celulasDoAcessorio, celulasDoPerfil, celulasDoVidro,
    fimDoVidro, fimDosPerfis, medidaDaEsquadria, tituloDaEsquadria, type EsquadriaDoOrientativo, type OrientativoDeMontagem,
} from './orientativo-de-montagem'

export type CabecalhoDoRelatorio = { numero: number; cliente: string; geradoEm: Date }
type Extras = { itensSemCalculo: readonly number[]; itensSemPecas?: readonly number[] }

const A4 = { largura: 210, altura: 297, margem: 12 }
const LARGURA = A4.largura - 2 * A4.margem
const FIM = A4.altura - A4.margem - 8
const LINHA = 4.6

const mm = (n: number) => `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(n)} mm`
const pct = (n: number) => `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n)}%`
const dataBR = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
const horaBR = (d: Date) => d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })

/** O nome do arquivo: "Relatorio_de_materiais_8_-_Cristiano_Fernandes.pdf" (sem acento nem caractere que o sistema de arquivos estranhe). */
export function nomeDoRelatorio(tipo: 'materiais' | 'corte' | 'barras_do_pedido' | 'orientativo_de_montagem', numero: number, cliente: string): string {
    const limpo = cliente.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    return `Relatorio_de_${tipo}_${numero}${limpo ? `_-_${limpo}` : ''}.pdf`
}

class Folha {
    readonly doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
    y = A4.margem
    /** O que se repete no topo de CADA página depois do cabeçalho do orçamento (o orientativo: o desenho, a tipologia e a medida da esquadria). */
    extra: (() => void) | null = null
    constructor(private readonly titulo: string, private readonly c: CabecalhoDoRelatorio) { this.cabecalho() }
    /** Página nova, com o cabeçalho (e o `extra`). */
    novaPagina() { this.doc.addPage('a4', 'portrait'); this.y = A4.margem; this.cabecalho() }
    private cabecalho() {
        const d = this.doc
        d.setFont('helvetica', 'bold'); d.setFontSize(13); d.text(this.titulo, A4.margem, this.y + 5)
        d.setFont('helvetica', 'normal'); d.setFontSize(9)
        d.text(`Orçamento ${this.c.numero} — ${this.c.cliente}`, A4.margem, this.y + 10.5)
        d.text(`Gerado em ${dataBR(this.c.geradoEm)} ${horaBR(this.c.geradoEm)}`, A4.margem + LARGURA, this.y + 10.5, { align: 'right' })
        d.setDrawColor(0); d.setLineWidth(0.3); d.line(A4.margem, this.y + 13, A4.margem + LARGURA, this.y + 13)
        this.y += 18
        this.extra?.()
    }
    /** Garante `h` mm livres; sem lugar, página nova (com o cabeçalho). */
    cabe(h: number) { if (this.y + h > FIM) this.novaPagina() }
    titulo2(t: string) { this.cabe(10); const d = this.doc; d.setFont('helvetica', 'bold'); d.setFontSize(11); d.text(t, A4.margem, this.y + 4); this.y += 7 }
    paragrafo(t: string, cor: [number, number, number] = [0, 0, 0]) {
        const d = this.doc; d.setFont('helvetica', 'normal'); d.setFontSize(8.5); d.setTextColor(...cor)
        for (const l of d.splitTextToSize(t, LARGURA) as string[]) { this.cabe(LINHA); d.text(l, A4.margem, this.y + 3.4); this.y += LINHA }
        d.setTextColor(0); this.y += 1
    }
    /**
     * Uma tabela simples: cabeçalho cinza e linhas; a coluna marcada 'right' alinha à direita; o texto longo quebra dentro da coluna.
     * `respiro` (mm): o espaço depois de cada linha — o RESPIRO ENTRE OS PERFIS (dono do produto, 22/11/2026: "entre cada perfil tem que ter
     * um respiro de distância"). Só o espaçamento muda: o conteúdo e a ordem são os mesmos.
     */
    tabela(colunas: ReadonlyArray<{ titulo: string; w: number; alinha?: 'right' }>, linhas: readonly string[][], respiro = 0) {
        const d = this.doc
        const desenharCabecalho = () => {
            let x = A4.margem
            d.setFillColor(235, 235, 235); d.setDrawColor(180); d.setLineWidth(0.2)
            d.rect(A4.margem, this.y, LARGURA, 5.5, 'FD')
            d.setFont('helvetica', 'bold'); d.setFontSize(8)
            for (const c of colunas) { d.text(c.titulo, c.alinha === 'right' ? x + c.w - 1.5 : x + 1.5, this.y + 3.8, { align: c.alinha === 'right' ? 'right' : 'left' }); x += c.w }
            this.y += 5.5
        }
        this.cabe(11); desenharCabecalho()
        d.setFont('helvetica', 'normal'); d.setFontSize(8)
        for (const l of linhas) {
            const quebradas = l.map((t, k) => d.splitTextToSize(t, colunas[k].w - 3) as string[])
            const h = Math.max(1, ...quebradas.map((q) => q.length)) * 3.6 + 1.6
            if (this.y + h + respiro > FIM) { this.cabe(h + respiro + 6); desenharCabecalho(); d.setFont('helvetica', 'normal'); d.setFontSize(8) }
            let x = A4.margem
            d.setDrawColor(210); d.line(A4.margem, this.y + h, A4.margem + LARGURA, this.y + h)
            quebradas.forEach((q, k) => {
                const c = colunas[k]
                q.forEach((linha, j) => d.text(linha, c.alinha === 'right' ? x + c.w - 1.5 : x + 1.5, this.y + 3.4 + j * 3.6, { align: c.alinha === 'right' ? 'right' : 'left' }))
                x += c.w
            })
            this.y += h + respiro
        }
        this.y += 3
    }
    fechar(): Uint8Array {
        const d = this.doc
        const n = d.getNumberOfPages()
        for (let p = 1; p <= n; p++) {
            d.setPage(p); d.setFont('helvetica', 'normal'); d.setFontSize(7); d.setTextColor(120)
            d.text(`Página ${p} de ${n}`, A4.margem + LARGURA / 2, A4.altura - A4.margem, { align: 'center' }); d.setTextColor(0)
        }
        d.setProperties({ title: `${this.titulo} — Orçamento ${this.c.numero}`, creator: 'Precifica Certo' })
        d.setCreationDate(this.c.geradoEm)
        return new Uint8Array(d.output('arraybuffer'))
    }
}

const AMARELO: [number, number, number] = [150, 100, 0]
/** O RESPIRO ENTRE OS PERFIS, em mm (dono do produto, 22/11/2026): cada perfil, com a sua linha e a sua Observação, é um bloco, e há espaço entre os blocos. */
export const RESPIRO_ENTRE_PERFIS = 3
/** A categoria dos perfis no relatório de materiais: as linhas dela levam o respiro. */
const CATEGORIA_DOS_PERFIS = 'PERFIL'
const lista = (ordens: readonly number[]) => `${ordens.length === 1 ? 'O item' : 'Os itens'} ${ordens.join(', ')}`

const COLUNAS_DE_MATERIAL = [{ titulo: 'Código', w: 24 }, { titulo: 'Descrição', w: 78 }, { titulo: 'Quantidade', w: 28, alinha: 'right' as const },
    { titulo: 'Custo bruto', w: 28, alinha: 'right' as const }, { titulo: 'Custo líquido', w: 28, alinha: 'right' as const }]
const linhaDeMaterial = (m: MaterialDoRelatorio, descricao: string = m.descricao ?? '—') =>
    [m.codigo, descricao, quantidadeNoRelatorio(m.quantidade, m.unidade), reaisNoRelatorio(m.custo_bruto), reaisNoRelatorio(m.custo_liquido)]
/** A linha do total de um grupo: os dois custos, ou a frase que nomeia os códigos sem custo (nunca a soma com o que falta como zero). */
export const textoDoTotal = (nome: string, t: TotalDoGrupo) =>
    t.codigosSemCusto.length
        ? `${nome}: ${fraseDoTotalSemCusto(t.codigosSemCusto)}.`
        : `${nome}: custo bruto ${reaisNoRelatorio(t.custo_bruto)} · custo líquido ${reaisNoRelatorio(t.custo_liquido)}`

/**
 * O relatório de materiais em PDF: uma tabela por categoria (a da tabela de onde o preço saiu), na ordem da base de conhecimento, com o total
 * dela; à parte, os ambíguos e os sem categoria, cada um com o motivo; no fim, o total geral do pedido.
 */
export function pdfDoRelatorioDeMateriais(r: RelatorioDeMateriais & Extras, c: CabecalhoDoRelatorio): Uint8Array {
    const f = new Folha('Relatório de materiais', c)
    if (r.itensSemCalculo.length) f.paragrafo(`${lista(r.itensSemCalculo)} sem cálculo: os materiais não estão neste relatório.`, AMARELO)
    if (!r.categorias.length && !r.semCategoria.length && !r.ambiguos.length) { f.paragrafo('Nenhum material calculado neste orçamento.'); return f.fechar() }
    for (const cat of r.categorias) {
        f.titulo2(cat.rotulo)
        f.tabela(COLUNAS_DE_MATERIAL, cat.materiais.map((m) => linhaDeMaterial(m)), cat.chave === CATEGORIA_DOS_PERFIS ? RESPIRO_ENTRE_PERFIS : 0)
        f.paragrafo(textoDoTotal(`Total de ${cat.rotulo}`, cat.total))
    }
    if (r.ambiguos.length) {
        f.titulo2('Em mais de uma categoria')
        f.tabela(COLUNAS_DE_MATERIAL, r.ambiguos.map((a) => linhaDeMaterial(a, `${a.descricao ?? '—'} (${a.categorias.join(', ')}: ${a.motivo})`)))
    }
    if (r.semCategoria.length) {
        f.titulo2('Sem categoria')
        f.tabela(COLUNAS_DE_MATERIAL, r.semCategoria.map((m) => linhaDeMaterial(m, `${m.descricao ?? '—'} (${m.motivo})`)))
    }
    f.titulo2('Total geral')
    f.paragrafo(textoDoTotal('Total geral do pedido', r.totalGeral))
    return f.fechar()
}

const COLUNAS_DE_CORTE = [{ titulo: 'Medida', w: 40, alinha: 'right' as const }, { titulo: 'Corte', w: 50 }, { titulo: 'Posição', w: 56 }, { titulo: 'Quantidade', w: 40, alinha: 'right' as const }]

function blocoDoCodigo(f: Folha, k: CodigoDoCorte) {
    f.cabe(20)
    f.paragrafo(`${k.codigo}${k.descricao ? ` — ${k.descricao}` : ''} (${k.perfil})`)
    f.tabela(COLUNAS_DE_CORTE, k.linhas.map((l) => [mm(l.comprimento_mm), l.corte ?? '—', l.posicao ?? '—', String(l.quantidade)]))
    if ('semPlano' in k.plano) { f.paragrafo(`Sem plano de barras: ${k.plano.semPlano.replace(/\.$/, '')}.`, AMARELO); return }
    const p = k.plano
    f.paragrafo(`Barra de ${mm(p.barra_mm)}, serra de ${mm(p.serra_mm)}: ${p.n_barras} ${p.n_barras === 1 ? 'barra' : 'barras'}, aproveitamento de ${pct(p.aproveitamento_pct)}`)
    p.barras.forEach((b, i) => f.paragrafo(`Barra ${i + 1}: ${b.pecas_mm.map(mm).join(' + ')} · sobra ${mm(b.sobra_mm)}`))
}
/** O respiro depois do bloco de um perfil (o código e o plano dele) — o próximo perfil começa separado. */
const respirar = (f: Folha) => { f.y += RESPIRO_ENTRE_PERFIS }

/** O relatório de corte em PDF: por categoria, cada código com as peças a cortar e o plano de barras gravado. */
export function pdfDoRelatorioDeCorte(r: RelatorioDeCorte & Extras, c: CabecalhoDoRelatorio): Uint8Array {
    const f = new Folha('Relatório de corte', c)
    if (r.itensSemCalculo.length) f.paragrafo(`${lista(r.itensSemCalculo)} sem cálculo: as peças não estão neste relatório.`, AMARELO)
    if (r.itensSemPecas?.length) f.paragrafo(`${lista(r.itensSemPecas)} calculado(s) antes do relatório de corte existir: recalcule o orçamento para ver as peças.`, AMARELO)
    if (!r.categorias.length && !r.semCategoria.length && !r.ambiguos.length) f.paragrafo('Nenhuma peça de corte neste orçamento.')
    for (const cat of r.categorias) { f.titulo2(cat.rotulo); for (const k of cat.codigos) { blocoDoCodigo(f, k); respirar(f) } }
    if (r.ambiguos.length) { f.titulo2('Em mais de uma categoria'); for (const k of r.ambiguos) { blocoDoCodigo(f, k); respirar(f) } }
    if (r.semCategoria.length) { f.titulo2('Sem categoria'); for (const k of r.semCategoria) { blocoDoCodigo(f, k); respirar(f) } }
    return f.fechar()
}

const kg = (n: number | null) => (n === null ? '—' : `${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)} kg`)
/** Uma fração como o WVetro mostra: o comprimento, o tipo de corte e o item/tipologia de origem. */
export const fracaoNoRelatorio = (f: FracaoDaBarra) => `${mm(f.comprimento_mm)}${f.corte ? ` ${f.corte}` : ''} (Item ${f.item}${f.tipologia ? ` ${f.tipologia}` : ''})`
/** O título de um perfil: código, descrição, perfil do motor e a cor. */
export const tituloDoPerfil = (p: Pick<PlanoDoPerfil, 'codigo' | 'descricao' | 'perfil' | 'cor'>) =>
    `${p.codigo}${p.descricao ? ` — ${p.descricao}` : ''} (${p.perfil})${p.cor ? ` · ${p.cor}` : ''}`
/** A linha do perfil: a barra, a serra, o refilo, as barras, os pesos e o aproveitamento. */
export const resumoDoPerfil = (p: PlanoDoPerfil) =>
    `Barra de ${mm(p.barra_mm)}, serra de ${mm(p.serra_mm)} por corte, refilo de ${mm(p.refilo_mm)} por ponta: ${p.n_barras} ${p.n_barras === 1 ? 'barra' : 'barras'}, `
    + `peso bruto ${kg(p.peso_bruto_kg)}, peso líquido ${kg(p.peso_liquido_kg)}, aproveitamento de ${pct(p.aproveitamento_pct)}`

const COLUNAS_DO_RESUMO_DE_BARRAS = [{ titulo: 'Perfil', w: 66 }, { titulo: 'Cor', w: 26 }, { titulo: 'Barras', w: 18, alinha: 'right' as const },
    { titulo: 'Peso bruto', w: 26, alinha: 'right' as const }, { titulo: 'Peso líquido', w: 26, alinha: 'right' as const }, { titulo: 'Aproveit.', w: 24, alinha: 'right' as const }]
const COLUNAS_DAS_BARRAS = [{ titulo: 'Barra', w: 14, alinha: 'right' as const }, { titulo: 'Frações (medida, corte e origem)', w: 146 }, { titulo: 'Sobra', w: 26, alinha: 'right' as const }]

/** As barras do pedido em PDF: o resumo por perfil e o total; depois, por perfil, uma barra por linha com as frações e a sobra. */
export function pdfDasBarrasDoPedido(r: BarrasDoPedido & Extras & { codigosSemPeso?: readonly string[] }, c: CabecalhoDoRelatorio): Uint8Array {
    const f = new Folha('Barras do pedido', c)
    f.paragrafo('Aproveitamento do PEDIDO: não muda o preço do orçamento, que cobra o consumo de cada item.', [90, 90, 90])
    if (r.itensSemCalculo.length) f.paragrafo(`${lista(r.itensSemCalculo)} sem cálculo: as peças não estão neste relatório.`, AMARELO)
    if (r.itensSemPecas?.length) f.paragrafo(`${lista(r.itensSemPecas)} calculado(s) antes do relatório de corte existir: recalcule o orçamento para ver as peças.`, AMARELO)
    if (r.codigosSemPeso?.length) f.paragrafo(`Sem peso na tabela de preço: ${r.codigosSemPeso.join(', ')} — o peso desses perfis não sai, e o total de peso também não.`, AMARELO)
    if (!r.perfis.length && !r.semPlano.length) { f.paragrafo('Nenhuma peça de corte neste orçamento.'); return f.fechar() }
    if (r.perfis.length) {
        f.titulo2('Resumo por perfil')
        f.tabela(COLUNAS_DO_RESUMO_DE_BARRAS, [
            ...r.perfis.map((p) => [`${p.codigo}${p.descricao ? ` — ${p.descricao}` : ''}`, p.cor ?? '—', String(p.n_barras), kg(p.peso_bruto_kg), kg(p.peso_liquido_kg), pct(p.aproveitamento_pct)]),
            ['Total', '', String(r.total.n_barras), kg(r.total.peso_bruto_kg), kg(r.total.peso_liquido_kg), r.total.aproveitamento_pct === null ? '—' : pct(r.total.aproveitamento_pct)],
        ], RESPIRO_ENTRE_PERFIS)
    }
    for (const p of r.perfis) {
        f.titulo2(tituloDoPerfil(p))
        f.paragrafo(resumoDoPerfil(p))
        f.tabela(COLUNAS_DAS_BARRAS, p.barras.map((b, i) => [String(i + 1), b.fracoes.map(fracaoNoRelatorio).join(' + '), mm(b.sobra_mm)]))
        respirar(f)
    }
    if (r.semPlano.length) {
        f.titulo2('Sem plano de barras')
        for (const s of r.semPlano) f.paragrafo(`${tituloDoPerfil(s)}: ${s.motivo.replace(/\.$/, '')}.`, AMARELO)
    }
    return f.fechar()
}

/** Baixa os bytes como arquivo, no navegador. */
// ── O ORIENTATIVO DE MONTAGEM ───────────────────────────────────────────────────────────────────────────────────────────────────────
const comLargura = (titulos: readonly string[], larguras: readonly number[], direita: readonly number[] = []) =>
    titulos.map((titulo, i) => ({ titulo, w: larguras[i], ...(direita.includes(i) ? { alinha: 'right' as const } : {}) }))
const COLUNAS_PDF_DOS_PERFIS = comLargura(COLUNAS_DOS_PERFIS, [18, 42, 10, 18, 16, 16, 20, 46], [2, 3, 6])
const COLUNAS_PDF_DOS_ACESSORIOS = comLargura(COLUNAS_DOS_ACESSORIOS, [14, 22, 66, 10, 16, 58], [4])
const COLUNAS_PDF_DO_VIDRO = comLargura(COLUNAS_DO_VIDRO, [50, 18, 18, 22, 12, 22, 22, 22], [4, 5, 6, 7])
const COLUNAS_PDF_DOS_SERVICOS = comLargura(COLUNAS_DOS_SERVICOS, [140, 46], [1])
/** A caixa do desenho no topo da página da esquadria, à direita. */
const CAIXA_DO_DESENHO = { w: 44, h: 32 }

/** O topo da página da esquadria: o título (item e tipologia), a medida e o DESENHO — repetido em cada página dela. */
function topoDaEsquadria(f: Folha, e: EsquadriaDoOrientativo) {
    const d = f.doc
    const y0 = f.y
    const larguraDoTexto = LARGURA - CAIXA_DO_DESENHO.w - 4
    d.setFont('helvetica', 'bold'); d.setFontSize(11)
    const titulo = d.splitTextToSize(tituloDaEsquadria(e), larguraDoTexto) as string[]
    titulo.forEach((l, k) => d.text(l, A4.margem, y0 + 4 + k * 4.6))
    d.setFont('helvetica', 'normal'); d.setFontSize(8.5)
    const medida = d.splitTextToSize(medidaDaEsquadria(e), larguraDoTexto) as string[]
    medida.forEach((l, k) => d.text(l, A4.margem, y0 + 5 + titulo.length * 4.6 + k * 4))
    const caixa = { x: A4.margem + LARGURA - CAIXA_DO_DESENHO.w, y: y0, w: CAIXA_DO_DESENHO.w, h: CAIXA_DO_DESENHO.h }
    d.setDrawColor(200); d.setLineWidth(0.2); d.rect(caixa.x, caixa.y, caixa.w, caixa.h)
    if (e.desenho) desenharFiguraProporcional(d, e.desenho, caixa)
    else {
        d.setFontSize(7); d.setTextColor(120)
        const falta = d.splitTextToSize(e.semDesenho ?? 'Sem desenho para esta tipologia.', caixa.w - 4) as string[]
        falta.slice(0, 6).forEach((l, k) => d.text(l, caixa.x + 2, caixa.y + 5 + k * 3.2))
        d.setTextColor(0)
    }
    f.y = y0 + CAIXA_DO_DESENHO.h + 4
}

/**
 * O orientativo de montagem em PDF: UMA esquadria por página (ou mais páginas, se ela não couber), com o desenho, a tipologia e a medida no
 * topo de CADA página dela; os blocos na ordem que a fábrica conhece — PERFIS, ACESSÓRIOS, VIDRO, SERVIÇOS —, as lacunas nomeadas e os avisos.
 */
export function pdfDoOrientativoDeMontagem(r: OrientativoDeMontagem, c: CabecalhoDoRelatorio): Uint8Array {
    const f = new Folha('Orientativo de montagem', c)
    if (r.itensSemCalculo.length) f.paragrafo(`${lista(r.itensSemCalculo)} sem cálculo: não estão neste orientativo.`, AMARELO)
    if (!r.esquadrias.length) { f.paragrafo('Nenhum item calculado neste orçamento.'); return f.fechar() }
    r.esquadrias.forEach((e, k) => {
        f.extra = () => topoDaEsquadria(f, e)
        if (k > 0 || r.itensSemCalculo.length) f.novaPagina()
        else topoDaEsquadria(f, e)
        if (e.aviso) f.paragrafo(e.aviso, AMARELO)
        f.titulo2('Perfis')
        f.tabela(COLUNAS_PDF_DOS_PERFIS, e.perfis.linhas.map(celulasDoPerfil), RESPIRO_ENTRE_PERFIS)
        f.paragrafo(fimDosPerfis(e.perfis))
        f.titulo2('Acessórios')
        if (e.acessorios.length) f.tabela(COLUNAS_PDF_DOS_ACESSORIOS, e.acessorios.map(celulasDoAcessorio))
        else f.paragrafo('Nenhum acessório neste item.')
        f.titulo2('Vidro')
        if (e.vidros.linhas.length) { f.tabela(COLUNAS_PDF_DO_VIDRO, e.vidros.linhas.map(celulasDoVidro)); f.paragrafo(fimDoVidro(e.vidros)) }
        else f.paragrafo('Nenhum pano de vidro neste item.')
        f.titulo2('Serviços')
        f.tabela(COLUNAS_PDF_DOS_SERVICOS, [])
        f.paragrafo(e.servicos.falta, AMARELO)
        for (const l of e.lacunas) f.paragrafo(l, AMARELO)
        f.paragrafo(r.avisosDoRodape.join(' '), [90, 90, 90])
    })
    f.extra = null
    return f.fechar()
}

export function baixarPdf(bytes: Uint8Array, nome: string): void {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
    const a = document.createElement('a')
    a.href = url; a.download = nome
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
}
