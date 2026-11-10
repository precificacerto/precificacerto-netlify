/**
 * O ARQUIVO "ORÇAMENTO" do orçamento I.A. (dono do produto, 11/11/2026), NO MODELO WVETRO — o orçamento 1151 da Esquadrias De Paula. Puro: recebe
 * os dados já lidos e o rateio, devolve o PDF (A4, jsPDF) ou as recusas nomeadas. Não lê banco nem rede.
 *
 * A ESTRUTURA, de cima para baixo, como o dono do produto a descreveu:
 *   1. o cabeçalho da empresa em caixa, o logo à esquerda (razão social, endereço, cidade/UF, CEP, telefone, telefone 2, CNPJ, I.E., site, e-mail);
 *      à direita, caixa própria com o título ORÇAMENTO e Número, Emissão, Vendedor, Contato, Email;
 *   2. o cliente em caixa: CLIENTE, TEL. FIXO, CELULAR, EMAIL, TEL2/Fax, ENDEREÇO, IE/RG, CEP, CNPJ/CPF;
 *   3. um bloco por item, na ordem: a faixa "*LOCAL/AMBIENTE:" e "TIPO:"; o desenho à esquerda; a descrição em caixa alta; "*COR PERFIL:" e
 *      "*COR ACESSÓRIO:"; "LINHA: <fornecedor> | <linha>" e "DATA ENTREGA:"; a tabela ITEM, QTDE., LARGURA, ALTURA, COR E ESPESSURA, VLR. UNIT.,
 *      VLR. TOTAL; e, com observação, a faixa "OBSERVAÇÕES DESTE ITEM" com o texto em vermelho;
 *   4. OBSERVAÇÕES gerais em texto corrido;
 *   5. o fecho: TOTAL; "Atenciosamente," e o vendedor; Dt.Venda; Impresso em; a linha de Aceite do Cliente; a razão social.
 *
 * AS REGRAS:
 *   - DOCUMENTO DE CLIENTE: NÃO imprime custo, margem, comissão, reserva técnica, lucro nem imposto — o tipo dos dados nem os carrega.
 *   - O VALOR POR ITEM é o RATEIO EXATO da operação interna gravada (`rateio-do-orcamento.ts`): Σ = a interna, e total = unitário × quantidade.
 *     O TOTAL do fecho é essa soma. Valor de venda diferente da interna (tributos por fora, despesas acessórias) é RECUSA nomeada: imprimir a
 *     diferença seria imprimir imposto, e o total sem ela não seria o preço — a decisão de como mostrar é do dono do produto.
 *   - VAZIO É VAZIO: campo sem dado sai em branco, nunca zero nem texto inventado (`ausente-vs-falso.md`). Isso vale para o logo, o telefone 2,
 *     o site, o contato, o IE/RG, o CEP e o CNPJ/CPF do cliente, as OBSERVAÇÕES gerais (não há, hoje, de onde lê-las) e a Dt.Venda.
 *   - O DESENHO: o acervo não tem imagem de tipologia; o que existe é o ESQUEMA que a folha do levantamento já desenha (`desenhoDaTipologia`:
 *     o contorno na proporção real e as divisões que a descrição do motor e as variáveis dizem). Sem medida, o bloco fecha sem desenho.
 */
import { jsPDF } from 'jspdf'
import { tracosDoDesenho, type DesenhoDaTipologia } from '@/lib/atendimentos-ia/folha-do-levantamento'
import { reais, type ItemRateado } from '@/lib/atendimentos-ia/rateio-do-orcamento'

export type EmpresaDoArquivo = {
    razaoSocial: string
    endereco: string | null
    cidadeUf: string | null
    cep: string | null
    telefone: string | null
    telefone2: string | null
    cnpj: string | null
    ie: string | null
    site: string | null
    email: string | null
    /** O logo já lido (data URL de PNG ou JPEG); nulo = sem logo — o lugar fica em branco. */
    logo: { dados: string; formato: 'PNG' | 'JPEG' } | null
}
export type ClienteDoArquivo = {
    nome: string
    telFixo: string | null
    celular: string | null
    email: string | null
    tel2: string | null
    endereco: string | null
    ieRg: string | null
    cep: string | null
    cnpjCpf: string | null
}
export type ItemDoArquivo = {
    ordem: number
    quantidade: number
    largura_mm: number | null
    altura_mm: number | null
    tipologia: string | null
    descricao: string | null
    tipo: string | null
    fornecedor: string | null
    linha: string | null
    ambientes: string | null
    corPerfil: string | null
    corAcessorio: string | null
    /** "COR E ESPESSURA": o vidro como o vendedor o disse (copiado, nunca completado — 04/11/2026). */
    vidro: string | null
    /** As variáveis ditas, por extenso ("ARREMATE INTERNO: 65 mm") — a faixa da tela as mostra; o arquivo não as imprime. */
    variaveis: string[]
    obs: string | null
    desenho: DesenhoDaTipologia | null
}
export type DadosDoArquivoDoOrcamento = {
    empresa: EmpresaDoArquivo
    numero: number
    vendedor: string | null
    contato: string | null
    emailDoVendedor: string | null
    cliente: ClienteDoArquivo
    /** A data de entrega do levantamento (AAAA-MM-DD); nula sai " / / ". */
    dataEntrega: string | null
    itens: ItemDoArquivo[]
    observacoesGerais: string | null
    /** A operação interna gravada e o valor de venda gravado, em reais. */
    operacaoInterna: number
    valorVenda: number
    rateio: readonly ItemRateado[]
    geradoEm: Date
}
export type ArquivoGerado = { ok: true; pdf: Uint8Array; paginas: number; nomeDoArquivo: string }
export type ArquivoRecusado = { ok: false; recusas: string[] }

// ── O QUE SE IMPRIME ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
const FUSO = 'America/Sao_Paulo'
export const dataBR = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric' })
export const horaBR = (d: Date) => d.toLocaleTimeString('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' })
/** A data de entrega gravada (AAAA-MM-DD) em dd/mm/aaaa; ausente ou fora da forma: o campo em branco do modelo. */
export const dataDeEntrega = (iso: string | null) => {
    const m = iso ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso) : null
    return m ? `${m[3]}/${m[2]}/${m[1]}` : ' / / '
}
const texto = (v: string | null | undefined) => (typeof v === 'string' ? v.trim() : '')
const milimetros = (n: number | null) => (typeof n === 'number' && Number.isFinite(n) ? new Intl.NumberFormat('pt-BR').format(n) : '')
/** "LINHA: <fornecedor> | <linha>" — só o que existe; nenhum dos dois, em branco. */
export const linhaDoItem = (i: Pick<ItemDoArquivo, 'fornecedor' | 'linha'>) => [texto(i.fornecedor), texto(i.linha)].filter((t) => t !== '').join(' | ')
export const nomeDoArquivo = (numero: number, cliente: string) =>
    `Orcamento ${numero} - ${cliente.replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()}.pdf`

// ── A CONFERÊNCIA (antes de produzir) ─────────────────────────────────────────────────────────────────────────────────────────────
const centavos = (v: number) => Math.round(v * 100)
export const fraseDaVendaDiferente = (venda: number, interna: number) =>
    `o valor de venda (${reais(centavos(venda))}) é diferente da operação interna (${reais(centavos(interna))}): o arquivo reparte só a interna `
    + 'pelos itens e não imprime imposto nem despesa acessória, e por isso não sai com essa diferença (a forma de mostrá-la é decisão do dono do produto)'

/** Tudo o que impede o arquivo, nomeado — nunca um arquivo aproximado (`faltou-dado-recusa-nomeada.md`). */
export function conferirArquivoDoOrcamento(d: DadosDoArquivoDoOrcamento): string[] {
    const recusas: string[] = []
    if (texto(d.empresa.razaoSocial) === '') recusas.push('a razão social da empresa')
    if (!Number.isInteger(d.numero) || d.numero < 1) recusas.push('o número do orçamento')
    if (texto(d.cliente.nome) === '') recusas.push('o nome do cliente')
    if (d.itens.length === 0) recusas.push('os itens do orçamento: ele não tem nenhum')
    const doRateio = new Map(d.rateio.map((r) => [r.ordem, r]))
    for (const i of d.itens) {
        const r = doRateio.get(i.ordem)
        if (!r) recusas.push(`o valor do item ${i.ordem}: ele não está no rateio`)
        else if (r.quantidade !== i.quantidade) recusas.push(`o valor do item ${i.ordem}: o rateio usou ${r.quantidade} unidade(s) e o item tem ${i.quantidade}`)
    }
    if (d.rateio.length !== d.itens.length) recusas.push(`o rateio tem ${d.rateio.length} item(ns) e o orçamento ${d.itens.length}`)
    const soma = d.rateio.reduce((s, r) => s + r.total, 0)
    if (soma !== centavos(d.operacaoInterna)) recusas.push(`a soma dos itens (${reais(soma)}) não fecha com a operação interna (${reais(centavos(d.operacaoInterna))})`)
    if (centavos(d.valorVenda) !== centavos(d.operacaoInterna)) recusas.push(fraseDaVendaDiferente(d.valorVenda, d.operacaoInterna))
    return recusas
}

// ── O DESENHO DO PDF (jsPDF) ──────────────────────────────────────────────────────────────────────────────────────────────────────
type Doc = jsPDF
const A4 = { largura: 210, altura: 297, margem: 10 } as const
const LARGURA = A4.largura - 2 * A4.margem
const FIM = A4.altura - A4.margem - 6 // o pé reserva a linha "Página X de Y"
const CINZA = 110
const VERMELHO: [number, number, number] = [200, 30, 30]
/** As sete colunas da tabela do item, na largura à direita do desenho (somam 153 mm). */
export const COLUNAS_DO_ITEM = [
    { titulo: 'ITEM', w: 12, alinha: 'center' }, { titulo: 'QTDE.', w: 13, alinha: 'center' }, { titulo: 'LARGURA', w: 18, alinha: 'center' },
    { titulo: 'ALTURA', w: 18, alinha: 'center' }, { titulo: 'COR E ESPESSURA', w: 46, alinha: 'left' }, { titulo: 'VLR. UNIT.', w: 23, alinha: 'right' },
    { titulo: 'VLR. TOTAL', w: 23, alinha: 'right' },
] as const
const LARGURA_DO_DESENHO = 35
const X_DO_TEXTO = A4.margem + LARGURA_DO_DESENHO + 2
const LARGURA_DO_TEXTO = LARGURA - LARGURA_DO_DESENHO - 2

const fonte = (doc: Doc, peso: 'normal' | 'bold', corpo: number) => { doc.setFont('helvetica', peso); doc.setFontSize(corpo) }
const quebrar = (doc: Doc, t: string, w: number) => (t === '' ? [''] : (doc.splitTextToSize(t, w) as string[]))
/** "RÓTULO: valor" numa linha: o rótulo em negrito, o valor normal ao lado (o vazio deixa só o rótulo). */
function campo(doc: Doc, rotulo: string, valor: string, x: number, y: number, corpo = 7.5) {
    fonte(doc, 'bold', corpo); doc.text(rotulo, x, y)
    fonte(doc, 'normal', corpo); if (valor) doc.text(valor, x + doc.getTextWidth(rotulo) + 1.2, y)
}

function cabecalho(doc: Doc, d: DadosDoArquivoDoOrcamento): number {
    const y = A4.margem
    const wEmpresa = 125
    const h = 36
    doc.setDrawColor(0); doc.setLineWidth(0.3)
    doc.rect(A4.margem, y, wEmpresa, h)
    // o logo à esquerda; sem logo, o lugar fica em branco
    if (d.empresa.logo) {
        try { doc.addImage(d.empresa.logo.dados, d.empresa.logo.formato, A4.margem + 2, y + 3, 28, 28) } catch { /* imagem ilegível: o lugar fica em branco */ }
    }
    const x = A4.margem + 33
    const e = d.empresa
    fonte(doc, 'bold', 10); doc.text(quebrar(doc, e.razaoSocial, wEmpresa - 35)[0], x, y + 6)
    campo(doc, 'Endereço:', texto(e.endereco), x, y + 11)
    campo(doc, 'Cidade/UF:', texto(e.cidadeUf), x, y + 15.5); campo(doc, 'CEP:', texto(e.cep), x + 55, y + 15.5)
    campo(doc, 'Telefone:', texto(e.telefone), x, y + 20); campo(doc, 'Telefone 2:', texto(e.telefone2), x + 45, y + 20)
    campo(doc, 'CNPJ:', texto(e.cnpj), x, y + 24.5); campo(doc, 'I.E.:', texto(e.ie), x + 45, y + 24.5)
    campo(doc, 'Site:', texto(e.site), x, y + 29); campo(doc, 'Email:', texto(e.email), x, y + 33.5)
    // à direita, a caixa do ORÇAMENTO
    const xd = A4.margem + wEmpresa + 2
    const wd = LARGURA - wEmpresa - 2
    doc.rect(xd, y, wd, h)
    fonte(doc, 'bold', 12); doc.text('ORÇAMENTO', xd + wd / 2, y + 7, { align: 'center' })
    campo(doc, 'Número:', String(d.numero), xd + 3, y + 13)
    campo(doc, 'Emissão:', dataBR(d.geradoEm), xd + 3, y + 18)
    campo(doc, 'Vendedor:', texto(d.vendedor), xd + 3, y + 23)
    campo(doc, 'Contato:', texto(d.contato), xd + 3, y + 28)
    campo(doc, 'Email:', texto(d.emailDoVendedor), xd + 3, y + 33)
    return y + h + 3
}

function blocoDoCliente(doc: Doc, d: DadosDoArquivoDoOrcamento, y: number): number {
    const c = d.cliente
    const linha = 6
    doc.setDrawColor(0); doc.rect(A4.margem, y, LARGURA, linha * 3)
    const col = (k: number) => A4.margem + 2 + k * (LARGURA / 4)
    campo(doc, 'CLIENTE:', texto(c.nome), col(0), y + 4.2, 8)
    campo(doc, 'TEL. FIXO:', texto(c.telFixo), col(0), y + linha + 4.2); campo(doc, 'CELULAR:', texto(c.celular), col(1), y + linha + 4.2)
    campo(doc, 'EMAIL:', texto(c.email), col(2), y + linha + 4.2); campo(doc, 'TEL2/Fax:', texto(c.tel2), col(3), y + linha + 4.2)
    campo(doc, 'ENDEREÇO:', texto(c.endereco), col(0), y + 2 * linha + 4.2); campo(doc, 'IE/RG:', texto(c.ieRg), col(1), y + 2 * linha + 4.2)
    campo(doc, 'CEP:', texto(c.cep), col(2), y + 2 * linha + 4.2); campo(doc, 'CNPJ/CPF:', texto(c.cnpjCpf), col(3), y + 2 * linha + 4.2)
    return y + linha * 3 + 4
}

/** As linhas de texto do item, já quebradas, e a altura do bloco inteiro — a paginação mede antes de desenhar. */
function medidaDoItem(doc: Doc, i: ItemDoArquivo) {
    fonte(doc, 'bold', 8)
    const descricao = quebrar(doc, texto(i.descricao).toLocaleUpperCase('pt-BR'), LARGURA_DO_TEXTO).slice(0, 3)
    fonte(doc, 'normal', 7.5)
    const obs = texto(i.obs) === '' ? [] : quebrar(doc, texto(i.obs), LARGURA - 4)
    const corpoTexto = descricao.length * 3.6 + 3 * 4.6 + 2 * 5.2 + 1
    const corpo = Math.max(30, corpoTexto)
    const alturaDaObs = obs.length ? 5 + obs.length * 3.4 + 1.5 : 0
    return { descricao, obs, corpo, total: 6 + corpo + alturaDaObs }
}

function blocoDoItem(doc: Doc, i: ItemDoArquivo, r: ItemRateado, y: number, dataEntrega: string): number {
    const m = medidaDoItem(doc, i)
    doc.setDrawColor(0); doc.setLineWidth(0.3)
    doc.rect(A4.margem, y, LARGURA, m.total)
    // a faixa: o ambiente à esquerda, o tipo à direita
    doc.setFillColor(232, 232, 232); doc.rect(A4.margem, y, LARGURA, 6, 'FD')
    campo(doc, '*LOCAL/AMBIENTE:', texto(i.ambientes), A4.margem + 2, y + 4.2, 8)
    // o tipo encostado à direita: a largura do rótulo (negrito) e a do valor (normal) decidem onde ele começa
    const valorTipo = texto(i.tipo)
    fonte(doc, 'bold', 8); const wRotulo = doc.getTextWidth('TIPO:')
    fonte(doc, 'normal', 8); const wValor = doc.getTextWidth(valorTipo)
    campo(doc, 'TIPO:', valorTipo, A4.margem + LARGURA - 2 - wValor - 1.2 - wRotulo, y + 4.2, 8)
    const y0 = y + 6
    // o desenho à esquerda, na proporção real; sem medida, o bloco fecha sem ele
    doc.setDrawColor(CINZA); doc.setLineWidth(0.2); doc.rect(A4.margem, y0, LARGURA_DO_DESENHO, m.corpo)
    if (i.desenho && i.desenho.largura_mm > 0 && i.desenho.altura_mm > 0) {
        const t = tracosDoDesenho(i.desenho, { x: A4.margem + 2, y: y0 + 2, w: LARGURA_DO_DESENHO - 4, h: m.corpo - 4 })
        doc.setDrawColor(0); doc.setLineWidth(0.35); doc.rect(t.contorno.x, t.contorno.y, t.contorno.w, t.contorno.h)
        doc.setLineWidth(0.2); for (const [x1, y1, x2, y2] of t.divisoes) doc.line(x1, y1, x2, y2)
    }
    // o texto à direita
    let ty = y0 + 4
    fonte(doc, 'bold', 8); for (const l of m.descricao) { doc.text(l, X_DO_TEXTO, ty); ty += 3.6 }
    ty += 1
    campo(doc, '*COR PERFIL:', texto(i.corPerfil), X_DO_TEXTO, ty); campo(doc, '*COR ACESSÓRIO:', texto(i.corAcessorio), X_DO_TEXTO + 70, ty); ty += 4.6
    campo(doc, 'LINHA:', linhaDoItem(i), X_DO_TEXTO, ty); campo(doc, 'DATA ENTREGA:', dataEntrega, X_DO_TEXTO + 110, ty); ty += 3
    // a tabela de sete colunas: o cabeçalho e a linha do item
    let cx = X_DO_TEXTO
    doc.setDrawColor(CINZA)
    const valores = [String(i.ordem), String(i.quantidade), milimetros(i.largura_mm), milimetros(i.altura_mm), texto(i.vidro), reais(r.unitario), reais(r.total)]
    COLUNAS_DO_ITEM.forEach((c, k) => {
        doc.setFillColor(245, 245, 245); doc.rect(cx, ty, c.w, 5.2, 'FD'); doc.rect(cx, ty + 5.2, c.w, 5.2)
        const xt = c.alinha === 'center' ? cx + c.w / 2 : c.alinha === 'right' ? cx + c.w - 1.2 : cx + 1.2
        fonte(doc, 'bold', 6.5); doc.text(c.titulo, xt, ty + 3.6, { align: c.alinha })
        fonte(doc, 'normal', 7.5); doc.text(quebrar(doc, valores[k], c.w - 2.4)[0], xt, ty + 8.8, { align: c.alinha })
        cx += c.w
    })
    // a observação do item, em vermelho
    if (m.obs.length) {
        const yo = y0 + m.corpo
        doc.setFillColor(232, 232, 232); doc.setDrawColor(0); doc.rect(A4.margem, yo, LARGURA, 5, 'FD')
        fonte(doc, 'bold', 7.5); doc.text('OBSERVAÇÕES DESTE ITEM', A4.margem + 2, yo + 3.6)
        fonte(doc, 'normal', 7.5); doc.setTextColor(...VERMELHO)
        m.obs.forEach((l, k) => doc.text(l, A4.margem + 2, yo + 5 + 3.2 + k * 3.4))
        doc.setTextColor(0)
    }
    return y + m.total + 3
}

function blocoDasObservacoes(doc: Doc, d: DadosDoArquivoDoOrcamento, y: number): number {
    fonte(doc, 'normal', 7.5)
    const linhas = texto(d.observacoesGerais) === '' ? [] : quebrar(doc, texto(d.observacoesGerais), LARGURA - 4)
    const h = 6 + Math.max(1, linhas.length) * 3.4 + 2
    doc.setDrawColor(0); doc.rect(A4.margem, y, LARGURA, h)
    fonte(doc, 'bold', 8); doc.text('OBSERVAÇÕES', A4.margem + 2, y + 4.2)
    fonte(doc, 'normal', 7.5); linhas.forEach((l, k) => doc.text(l, A4.margem + 2, y + 8 + k * 3.4))
    return y + h + 3
}
const alturaDasObservacoes = (doc: Doc, d: DadosDoArquivoDoOrcamento) => {
    fonte(doc, 'normal', 7.5)
    const n = texto(d.observacoesGerais) === '' ? 0 : quebrar(doc, texto(d.observacoesGerais), LARGURA - 4).length
    return 6 + Math.max(1, n) * 3.4 + 2 + 3
}
const ALTURA_DO_FECHO = 40

function fecho(doc: Doc, d: DadosDoArquivoDoOrcamento, y: number) {
    const total = d.rateio.reduce((s, r) => s + r.total, 0)
    fonte(doc, 'bold', 11); doc.text(`TOTAL: ${reais(total)}`, A4.margem + LARGURA, y + 5, { align: 'right' })
    fonte(doc, 'normal', 8.5); doc.text('Atenciosamente,', A4.margem, y + 12)
    fonte(doc, 'bold', 8.5); doc.text(texto(d.vendedor), A4.margem, y + 16.5)
    campo(doc, 'Dt.Venda:', ' / / ', A4.margem, y + 22, 8)
    campo(doc, 'Impresso em:', `${dataBR(d.geradoEm)} ${horaBR(d.geradoEm)}`, A4.margem + 50, y + 22, 8)
    doc.setDrawColor(0); doc.line(A4.margem + LARGURA - 80, y + 30, A4.margem + LARGURA, y + 30)
    fonte(doc, 'normal', 8); doc.text('Aceite do Cliente', A4.margem + LARGURA - 40, y + 34, { align: 'center' })
    fonte(doc, 'bold', 8); doc.text(d.empresa.razaoSocial, A4.margem, y + 34)
}

/** O arquivo do orçamento: confere, desenha e pagina. Recusa nomeada quando falta dado — nunca um arquivo aproximado. */
export function gerarArquivoDoOrcamento(d: DadosDoArquivoDoOrcamento): ArquivoGerado | ArquivoRecusado {
    const recusas = conferirArquivoDoOrcamento(d)
    if (recusas.length) return { ok: false, recusas }
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
    const itens = [...d.itens].sort((a, b) => a.ordem - b.ordem)
    const doRateio = new Map(d.rateio.map((r) => [r.ordem, r]))
    const entrega = dataDeEntrega(d.dataEntrega)
    let y = cabecalho(doc, d)
    y = blocoDoCliente(doc, d, y)
    for (const i of itens) {
        const h = medidaDoItem(doc, i).total
        if (y + h > FIM) { doc.addPage('a4', 'portrait'); y = A4.margem }
        y = blocoDoItem(doc, i, doRateio.get(i.ordem) as ItemRateado, y, entrega)
    }
    if (y + alturaDasObservacoes(doc, d) + ALTURA_DO_FECHO > FIM) { doc.addPage('a4', 'portrait'); y = A4.margem }
    y = blocoDasObservacoes(doc, d, y)
    fecho(doc, d, y)
    const paginas = doc.getNumberOfPages()
    for (let p = 1; p <= paginas; p++) {
        doc.setPage(p)
        fonte(doc, 'normal', 7); doc.setTextColor(CINZA)
        doc.text(`Orçamento ${d.numero} · Página ${p} de ${paginas}`, A4.margem + LARGURA / 2, A4.altura - A4.margem, { align: 'center' })
        doc.setTextColor(0)
    }
    doc.setProperties({ title: `Orçamento ${d.numero} — ${d.cliente.nome}`, creator: 'Precifica Certo' })
    doc.setCreationDate(d.geradoEm)
    doc.setFileId(Array.from(`orc-${d.numero}-${d.geradoEm.getTime()}`).map((ch) => ch.charCodeAt(0).toString(16)).join('').padEnd(32, '0').slice(0, 32).toUpperCase())
    return { ok: true, pdf: new Uint8Array(doc.output('arraybuffer')), paginas, nomeDoArquivo: nomeDoArquivo(d.numero, d.cliente.nome) }
}
