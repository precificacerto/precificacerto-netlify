/**
 * OS RELATÓRIOS I.A. EM PDF, PARA IMPRESSÃO (dono do produto, 17/11/2026): "Relatório de material e relatório de corte, ambos devem ter um
 * arquivo para impressão. Então, deve ser em PDF."
 *
 * Puro: recebe o relatório como a rota o devolve (o mesmo que a tela mostra) e devolve os bytes do PDF. Nada é recalculado aqui — o PDF é a
 * tela no papel: as mesmas categorias, na mesma ordem, os mesmos números. A4 retrato, com o cabeçalho do orçamento e "Página N de M".
 */
import { jsPDF } from 'jspdf'
import { quantidadeNoRelatorio, type MaterialDoRelatorio, type RelatorioDeMateriais } from './relatorio-de-materiais'
import type { CodigoDoCorte, RelatorioDeCorte } from './relatorio-de-corte'

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
export function nomeDoRelatorio(tipo: 'materiais' | 'corte', numero: number, cliente: string): string {
    const limpo = cliente.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    return `Relatorio_de_${tipo}_${numero}${limpo ? `_-_${limpo}` : ''}.pdf`
}

class Folha {
    readonly doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
    y = A4.margem
    constructor(private readonly titulo: string, private readonly c: CabecalhoDoRelatorio) { this.cabecalho() }
    private cabecalho() {
        const d = this.doc
        d.setFont('helvetica', 'bold'); d.setFontSize(13); d.text(this.titulo, A4.margem, this.y + 5)
        d.setFont('helvetica', 'normal'); d.setFontSize(9)
        d.text(`Orçamento ${this.c.numero} — ${this.c.cliente}`, A4.margem, this.y + 10.5)
        d.text(`Gerado em ${dataBR(this.c.geradoEm)} ${horaBR(this.c.geradoEm)}`, A4.margem + LARGURA, this.y + 10.5, { align: 'right' })
        d.setDrawColor(0); d.setLineWidth(0.3); d.line(A4.margem, this.y + 13, A4.margem + LARGURA, this.y + 13)
        this.y += 18
    }
    /** Garante `h` mm livres; sem lugar, página nova (com o cabeçalho). */
    cabe(h: number) { if (this.y + h > FIM) { this.doc.addPage('a4', 'portrait'); this.y = A4.margem; this.cabecalho() } }
    titulo2(t: string) { this.cabe(10); const d = this.doc; d.setFont('helvetica', 'bold'); d.setFontSize(11); d.text(t, A4.margem, this.y + 4); this.y += 7 }
    paragrafo(t: string, cor: [number, number, number] = [0, 0, 0]) {
        const d = this.doc; d.setFont('helvetica', 'normal'); d.setFontSize(8.5); d.setTextColor(...cor)
        for (const l of d.splitTextToSize(t, LARGURA) as string[]) { this.cabe(LINHA); d.text(l, A4.margem, this.y + 3.4); this.y += LINHA }
        d.setTextColor(0); this.y += 1
    }
    /** Uma tabela simples: cabeçalho cinza e linhas; a coluna marcada 'right' alinha à direita; o texto longo quebra dentro da coluna. */
    tabela(colunas: ReadonlyArray<{ titulo: string; w: number; alinha?: 'right' }>, linhas: readonly string[][]) {
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
            if (this.y + h > FIM) { this.cabe(h + 6); desenharCabecalho(); d.setFont('helvetica', 'normal'); d.setFontSize(8) }
            let x = A4.margem
            d.setDrawColor(210); d.line(A4.margem, this.y + h, A4.margem + LARGURA, this.y + h)
            quebradas.forEach((q, k) => {
                const c = colunas[k]
                q.forEach((linha, j) => d.text(linha, c.alinha === 'right' ? x + c.w - 1.5 : x + 1.5, this.y + 3.4 + j * 3.6, { align: c.alinha === 'right' ? 'right' : 'left' }))
                x += c.w
            })
            this.y += h
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
const lista = (ordens: readonly number[]) => `${ordens.length === 1 ? 'O item' : 'Os itens'} ${ordens.join(', ')}`

const COLUNAS_DE_MATERIAL = [{ titulo: 'Código', w: 30 }, { titulo: 'Descrição', w: 116 }, { titulo: 'Quantidade', w: 40, alinha: 'right' as const }]
const linhaDeMaterial = (m: MaterialDoRelatorio) => [m.codigo, m.descricao ?? '—', quantidadeNoRelatorio(m.quantidade, m.unidade)]

/** O relatório de materiais em PDF: uma tabela por categoria, na ordem da base de conhecimento; à parte, os ambíguos e os sem categoria. */
export function pdfDoRelatorioDeMateriais(r: RelatorioDeMateriais & Extras, c: CabecalhoDoRelatorio): Uint8Array {
    const f = new Folha('Relatório de materiais', c)
    if (r.itensSemCalculo.length) f.paragrafo(`${lista(r.itensSemCalculo)} sem cálculo: os materiais não estão neste relatório.`, AMARELO)
    if (!r.categorias.length && !r.semCategoria.length && !r.ambiguos.length) f.paragrafo('Nenhum material calculado neste orçamento.')
    for (const cat of r.categorias) { f.titulo2(cat.rotulo); f.tabela(COLUNAS_DE_MATERIAL, cat.materiais.map(linhaDeMaterial)) }
    if (r.ambiguos.length) {
        f.titulo2('Em mais de uma categoria')
        f.tabela(COLUNAS_DE_MATERIAL, r.ambiguos.map((a) => [a.codigo, `${a.descricao ?? '—'} (${a.categorias.join(', ')})`, quantidadeNoRelatorio(a.quantidade, a.unidade)]))
    }
    if (r.semCategoria.length) { f.titulo2('Sem categoria'); f.tabela(COLUNAS_DE_MATERIAL, r.semCategoria.map(linhaDeMaterial)) }
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

/** O relatório de corte em PDF: por categoria, cada código com as peças a cortar e o plano de barras gravado. */
export function pdfDoRelatorioDeCorte(r: RelatorioDeCorte & Extras, c: CabecalhoDoRelatorio): Uint8Array {
    const f = new Folha('Relatório de corte', c)
    if (r.itensSemCalculo.length) f.paragrafo(`${lista(r.itensSemCalculo)} sem cálculo: as peças não estão neste relatório.`, AMARELO)
    if (r.itensSemPecas?.length) f.paragrafo(`${lista(r.itensSemPecas)} calculado(s) antes do relatório de corte existir: recalcule o orçamento para ver as peças.`, AMARELO)
    if (!r.categorias.length && !r.semCategoria.length && !r.ambiguos.length) f.paragrafo('Nenhuma peça de corte neste orçamento.')
    for (const cat of r.categorias) { f.titulo2(cat.rotulo); for (const k of cat.codigos) blocoDoCodigo(f, k) }
    if (r.ambiguos.length) { f.titulo2('Em mais de uma categoria'); for (const k of r.ambiguos) blocoDoCodigo(f, k) }
    if (r.semCategoria.length) { f.titulo2('Sem categoria'); for (const k of r.semCategoria) blocoDoCodigo(f, k) }
    return f.fechar()
}

/** Baixa os bytes como arquivo, no navegador. */
export function baixarPdf(bytes: Uint8Array, nome: string): void {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }))
    const a = document.createElement('a')
    a.href = url; a.download = nome
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
}
