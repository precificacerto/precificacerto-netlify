/**
 * O ARQUIVO "ORÇAMENTO" do orçamento I.A. (dono do produto, 11/11/2026), NO MODELO WVETRO — o orçamento 1151 da Esquadrias De Paula. Puro: recebe
 * os dados já lidos e o rateio, devolve o PDF (A4, jsPDF) ou as recusas nomeadas. Não lê banco nem rede.
 *
 * A ESTRUTURA, de cima para baixo, como o dono do produto a descreveu:
 *   1. o cabeçalho da empresa em caixa, o logo à esquerda (razão social, endereço, cidade/UF, CEP, telefone, telefone 2, CNPJ, I.E., site, e-mail);
 *      à direita, caixa própria com o título ORÇAMENTO e Número, Emissão, Vendedor, Contato, Email;
 *   2. o cliente em caixa: CLIENTE, TEL. FIXO, CELULAR, EMAIL, TEL2/Fax, ENDEREÇO, IE/RG, CEP, CNPJ/CPF;
 *   3. um bloco por item, na ordem: a faixa "ITEM N", "*LOCAL/AMBIENTE:" e "TIPO:"; o desenho à esquerda; a descrição em caixa alta;
 *      "*COR PERFIL:" e "*COR ACESSÓRIO:"; "LINHA: <fornecedor> | <linha>"; a tabela QTDE., LARGURA, ALTURA, COR E ESPESSURA, VLR. UNIT.,
 *      VLR. TOTAL; e, com observação, a faixa "OBSERVAÇÕES DESTE ITEM" com o texto em vermelho;
 *   4. OBSERVAÇÕES: as DEFINIÇÕES (uma vez para todos) e a DATA DE ENTREGA (`linhasDoRodape`), depois o texto da empresa;
 *   5. o fecho: TOTAL; "Atenciosamente," e o vendedor; Dt.Venda; Impresso em; a linha de Aceite do Cliente; a razão social.
 *
 * AS REGRAS:
 *   - DOCUMENTO DE CLIENTE: NÃO imprime custo, margem, comissão, reserva técnica, lucro nem imposto — o tipo dos dados nem os carrega.
 *   - O VALOR POR ITEM é o RATEIO EXATO da operação interna gravada (`rateio-do-orcamento.ts`): Σ = a interna, e total = unitário × quantidade.
 *     O TOTAL do fecho é essa soma. Valor de venda diferente da interna (tributos por fora, despesas acessórias) é RECUSA nomeada: imprimir a
 *     diferença seria imprimir imposto, e o total sem ela não seria o preço — a decisão de como mostrar é do dono do produto.
 *   - VAZIO É VAZIO: campo sem dado sai em branco, nunca zero nem texto inventado (`ausente-vs-falso.md`). Isso vale para o logo, o telefone 2,
 *     o site, o contato, o IE/RG, o CEP e o CNPJ/CPF do cliente, as OBSERVAÇÕES gerais (não há, hoje, de onde lê-las) e a Dt.Venda.
 *   - O ARQUIVO VAI AO VENDEDOR (dono do produto, 12/11/2026, o comando único): ele leva o que a conversa deixou de mandar por texto (4.3) —
 *     as barras por código, o aproveitamento, a mão de obra EM MINUTOS (nunca em reais: o custo continua fora) e o que o preço cobre —, as
 *     definições de instalação e arremate de cada esquadria, com "(padrão)" na que o vendedor não disse (4.2), e o RODAPÉ (as observações e o
 *     fecho) no PÉ da última página, sempre (4.1). Com falta de preço, o carimbo "PARCIAL — faltam N valores" no topo e a lista das faltas (1.5).
 *   - A GUARDA DO ENVIO AO CLIENTE (1.5): escrita e DESLIGADA (`GUARDA_DO_ENVIO_AO_CLIENTE_LIGADA`): ligada, o arquivo parcial não vai ao cliente.
 *     Hoje nada envia ao cliente; ela existe para o dia em que algo enviar.
 *   - O DESENHO: o acervo não tem imagem de tipologia; o que existe é o ESQUEMA que a folha do levantamento já desenha (`desenhoDaTipologia`:
 *     o contorno na proporção real e as divisões que a descrição do motor e as variáveis dizem). Sem medida, o bloco fecha sem desenho.
 */
import { separarComuns } from '@/lib/atendimentos-ia/escolhas-comuns'
import { jsPDF } from 'jspdf'
import { separarBloco } from './bloco-da-falta'
import { desenharFiguraProporcional, tracosDoDesenho, type DesenhoDaTipologia } from '@/lib/atendimentos-ia/folha-do-levantamento'
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
/**
 * As credenciais do cliente, na ordem do modelo (WVetro): o PDF e o topo da tela leem ESTA lista (`copia-divergente.md`). Campo sem dado
 * fica EM BRANCO, com o rótulo — nunca zero, nunca texto inventado, nunca a linha escondida (dono do produto, 11/11/2026).
 */
export const CAMPOS_DO_CLIENTE = [
    ['CLIENTE:', 'nome'], ['TEL. FIXO:', 'telFixo'], ['CELULAR:', 'celular'], ['EMAIL:', 'email'], ['TEL2/Fax:', 'tel2'],
    ['ENDEREÇO:', 'endereco'], ['IE/RG:', 'ieRg'], ['CEP:', 'cep'], ['CNPJ/CPF:', 'cnpjCpf'],
] as const satisfies ReadonlyArray<readonly [string, keyof ClienteDoArquivo]>
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
    /**
     * A FIGURA DO CATÁLOGO (dono do produto, 11/11/2026; ligada em 16/11/2026): o desenho importado da tipologia,
     * escolhido por `desenho-do-catalogo.ts`. Quando ela existe, é ELA que sai — o esquema de traços era a "figura
     * mais parecida" que a regra proíbe. Nula com a falta nomeada em `semFigura`, e aí o lugar fica em branco.
     */
    figura: { dados: string; formato: 'PNG' | 'JPEG' } | null
    /** Por que não há figura, quando não há: a frase nomeada da escolha. Nula quando a figura saiu. */
    semFigura: string | null
    /** As definições de instalação e arremate da esquadria, por extenso, com "(padrão)" na que o vendedor não disse (4.2). Vazia = nenhuma. */
    definicoes: string[]
}
/** Uma falta de preço, como o arquivo a lista: o código, o que falta e as esquadrias (pela ORDEM do item). */
export type FaltaDoArquivo = { codigo: string; frase: string; itens: number[] }
export type DadosDoArquivoDoOrcamento = {
    empresa: EmpresaDoArquivo
    numero: number
    /** O número que o cliente lê (23/11/2026): `<levantamento>-<SIGLA>` no orçamento por família; o próprio no resto. */
    numeroExibido: string
    vendedor: string | null
    contato: string | null
    emailDoVendedor: string | null
    cliente: ClienteDoArquivo
    /** A data de entrega do levantamento (AAAA-MM-DD); nula sai " / / ". */
    dataEntrega: string | null
    itens: ItemDoArquivo[]
    /**
     * O texto do bloco OBSERVAÇÕES, no pé: prazos, validade, exclusões (16/11/2026). Vem da base de conhecimento da
     * EMPRESA, igual em todo orçamento dela; as QUEBRAS DE LINHA são respeitadas, uma linha do texto é uma linha do
     * bloco. Nulo = não informado, e o bloco sai com o rótulo e o corpo vazio.
     */
    observacoesGerais: string | null
    /** O bloco CONDIÇÕES COMERCIAIS (17/11/2026): a forma de pagamento, já montada (`linhasDasCondicoesComerciais`). Nulo = sem parcela cadastrada, e o bloco não sai. */
    condicoesComerciais: string | null
    /** A operação interna gravada e o valor de venda gravado, em reais. */
    operacaoInterna: number
    valorVenda: number
    rateio: readonly ItemRateado[]
    geradoEm: Date
    /** As faltas de preço do cálculo vigente; vazia = o orçamento está completo. */
    faltas: FaltaDoArquivo[]
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
export const nomeDoArquivo = (numero: number | string, cliente: string) =>
    `Orcamento ${numero} - ${cliente.replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()}.pdf`

// ── O PARCIAL E A GUARDA DO CLIENTE ────────────────────────────────────────────────────────────────────────────────────────────────
export const carimboDoParcial = (n: number) => `PARCIAL — ${n === 1 ? 'falta 1 valor' : `faltam ${n} valores`}`
/** A guarda do envio ao CLIENTE (1.5): escrita e desligada por decisão do dono do produto. Ligar é trocar esta constante. */
export const GUARDA_DO_ENVIO_AO_CLIENTE_LIGADA = false
export const fraseDoParcialAoCliente = (numero: number | string, n: number) =>
    `o orçamento ${numero} está PARCIAL (${n === 1 ? 'falta 1 valor' : `faltam ${n} valores`}): ele vai ao vendedor, não ao cliente, até as faltas serem resolvidas`
/** A recusa do envio ao cliente, ou nula quando pode ir. `ligada` existe para o teste; em produção é a constante. */
export function recusaDoEnvioAoCliente(d: Pick<DadosDoArquivoDoOrcamento, 'numeroExibido' | 'faltas'>, ligada: boolean = GUARDA_DO_ENVIO_AO_CLIENTE_LIGADA): string | null {
    return ligada && d.faltas.length > 0 ? fraseDoParcialAoCliente(d.numeroExibido, d.faltas.length) : null
}

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
/** As sete colunas da tabela do item, na largura à direita do desenho (somam 151 mm: 2 mm de folga até a borda da caixa). */
export const COLUNAS_DO_ITEM = [
    { titulo: 'QTDE.', w: 13, alinha: 'center' }, { titulo: 'LARGURA', w: 18, alinha: 'center' },
    { titulo: 'ALTURA', w: 18, alinha: 'center' }, { titulo: 'COR E ESPESSURA', w: 56, alinha: 'left' }, { titulo: 'VLR. UNIT.', w: 23, alinha: 'right' },
    { titulo: 'VLR. TOTAL', w: 23, alinha: 'right' },
] as const
const LARGURA_DO_DESENHO = 35
const X_DO_TEXTO = A4.margem + LARGURA_DO_DESENHO + 2
const LARGURA_DO_TEXTO = LARGURA - LARGURA_DO_DESENHO - 2

const fonte = (doc: Doc, peso: 'normal' | 'bold', corpo: number) => { doc.setFont('helvetica', peso); doc.setFontSize(corpo) }
const quebrar = (doc: Doc, t: string, w: number) => (t === '' ? [''] : (doc.splitTextToSize(t, w) as string[]))
/**
 * UM NÚMERO NUNCA SAI CORTADO (dono do produto, 16/11/2026): a célula da tabela do item desenhava `quebrar(...)[0]` — a PRIMEIRA linha da
 * quebra. "R$ 28.384.389,74" não cabe nos 23 mm da coluna, quebra em ["R$", "28.384.389,74"] e o PDF imprimia só **"R$"**, sem valor
 * nenhum, exatamente como foi visto no ORC-6 (itens 1, 3 e 5 com o preço em branco e o total somando tudo).
 *
 * Agora o texto ENCOLHE até caber, de 7,5 pt até 4,5 pt. Abaixo disso ele é cortado COM reticência, que é sinal visível — nunca um valor
 * que some em silêncio. Deixa a fonte do documento no tamanho em que a achou.
 */
function textoQueCabe(doc: Doc, t: string, x: number, y: number, w: number, alinha: 'left' | 'center' | 'right', corpo = 7.5) {
    if (t === '') return
    for (let tamanho = corpo; tamanho >= 4.5; tamanho -= 0.5) {
        fonte(doc, 'normal', tamanho)
        if (doc.getTextWidth(t) <= w) { doc.text(t, x, y, { align: alinha }); fonte(doc, 'normal', corpo); return }
    }
    fonte(doc, 'normal', 4.5)
    let cortado = t
    while (cortado.length > 1 && doc.getTextWidth(`${cortado}…`) > w) cortado = cortado.slice(0, -1)
    doc.text(`${cortado}…`, x, y, { align: alinha })
    fonte(doc, 'normal', corpo)
}
/** "RÓTULO: valor" numa linha: o rótulo em negrito, o valor normal ao lado (o vazio deixa só o rótulo). */
function campo(doc: Doc, rotulo: string, valor: string, x: number, y: number, corpo = 7.5) {
    fonte(doc, 'bold', corpo); doc.text(rotulo, x, y)
    fonte(doc, 'normal', corpo); if (valor) doc.text(valor, x + doc.getTextWidth(rotulo) + 1.8, y)
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
    campo(doc, 'Número:', d.numeroExibido, xd + 3, y + 13)
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
    // a primeira linha é o nome; as outras oito, quatro por linha, na ordem de `CAMPOS_DO_CLIENTE`
    const [[rotuloDoNome, chaveDoNome], ...resto] = CAMPOS_DO_CLIENTE
    campo(doc, rotuloDoNome, texto(c[chaveDoNome]), col(0), y + 4.2, 8)
    resto.forEach(([rotulo, chave], k) => campo(doc, rotulo, texto(c[chave]), col(k % 4), y + (1 + Math.floor(k / 4)) * linha + 4.2))
    return y + linha * 3 + 4
}

/** As linhas de texto do item, já quebradas, e a altura do bloco inteiro — a paginação mede antes de desenhar. */
function medidaDoItem(doc: Doc, i: ItemDoArquivo) {
    fonte(doc, 'bold', 8)
    const descricao = quebrar(doc, texto(i.descricao).toLocaleUpperCase('pt-BR'), LARGURA_DO_TEXTO).slice(0, 3)
    fonte(doc, 'normal', 7.5)
    // A FALTA DA FIGURA É DITA (11/11/2026): "quando a condição não puder ser resolvida [...] não se desenha nada, e a
    // folha diz por quê, nomeado". Ela entra na faixa de observações do item, junto da observação que houver.
    const daFigura = texto(i.semFigura) === '' ? [] : [texto(i.semFigura)]
    const linhasDaObs = [...(texto(i.obs) === '' ? [] : [texto(i.obs)]), ...daFigura]
    const obs = linhasDaObs.length === 0 ? [] : linhasDaObs.flatMap((l) => quebrar(doc, l, LARGURA - 4))
    const corpoTexto = descricao.length * 3.6 + 3 * 4.6 + 2 * 5.2 + 1
    const corpo = Math.max(30, corpoTexto)
    const alturaDaObs = obs.length ? 5 + obs.length * 3.4 + 1.5 : 0
    return { descricao, obs, corpo, total: 6 + corpo + alturaDaObs }
}

/** O rótulo do item na faixa, antes do ambiente: "ITEM 2". */
export const rotuloDoItemNaFaixa = (ordem: number) => `ITEM ${ordem}`

function blocoDoItem(doc: Doc, i: ItemDoArquivo, r: ItemRateado, y: number): number {
    const m = medidaDoItem(doc, i)
    doc.setDrawColor(0); doc.setLineWidth(0.3)
    doc.rect(A4.margem, y, LARGURA, m.total)
    // a faixa: "ITEM N" e o ambiente na MESMA linha, o item antes (dono do produto, 16/11/2026: "é item 2, ou item 3,
    // aí vem a frase do ambiente"); a coluna ITEM saiu da tabela. O tipo fica à direita.
    doc.setFillColor(232, 232, 232); doc.rect(A4.margem, y, LARGURA, 6, 'FD')
    const rotuloDoItem = rotuloDoItemNaFaixa(i.ordem)
    fonte(doc, 'bold', 8); doc.text(rotuloDoItem, A4.margem + 2, y + 4.2)
    campo(doc, '*LOCAL/AMBIENTE:', texto(i.ambientes), A4.margem + 2 + doc.getTextWidth(rotuloDoItem) + 3, y + 4.2, 8)
    // o tipo encostado à direita: a largura do rótulo (negrito) e a do valor (normal) decidem onde ele começa
    const valorTipo = texto(i.tipo)
    fonte(doc, 'bold', 8); const wRotulo = doc.getTextWidth('TIPO:')
    fonte(doc, 'normal', 8); const wValor = doc.getTextWidth(valorTipo)
    campo(doc, 'TIPO:', valorTipo, A4.margem + LARGURA - 2 - wValor - 1.8 - wRotulo, y + 4.2, 8)
    const y0 = y + 6
    // o desenho à esquerda, na proporção real; sem medida, o bloco fecha sem ele
    doc.setDrawColor(CINZA); doc.setLineWidth(0.2); doc.rect(A4.margem, y0, LARGURA_DO_DESENHO, m.corpo)
    // A FIGURA DO CATÁLOGO vence o esquema de traços (16/11/2026): o desenho que a empresa escolheu, não um retângulo
    // dividido pela descrição. Sem figura, o lugar fica em branco e a falta aparece abaixo do bloco, nomeada.
    if (i.figura) {
        // na proporção da IMAGEM, centrada e reduzida (dono do produto, 16/11/2026: "sempre tem que ser proporcional")
        desenharFiguraProporcional(doc, i.figura, { x: A4.margem + 2, y: y0 + 2, w: LARGURA_DO_DESENHO - 4, h: m.corpo - 4 })
    } else if (i.desenho && i.desenho.largura_mm > 0 && i.desenho.altura_mm > 0 && i.semFigura === null) {
        const t = tracosDoDesenho(i.desenho, { x: A4.margem + 2, y: y0 + 2, w: LARGURA_DO_DESENHO - 4, h: m.corpo - 4 })
        doc.setDrawColor(0); doc.setLineWidth(0.35); doc.rect(t.contorno.x, t.contorno.y, t.contorno.w, t.contorno.h)
        doc.setLineWidth(0.2); for (const [x1, y1, x2, y2] of t.divisoes) doc.line(x1, y1, x2, y2)
    }
    // o texto à direita
    let ty = y0 + 4
    fonte(doc, 'bold', 8); for (const l of m.descricao) { doc.text(l, X_DO_TEXTO, ty); ty += 3.6 }
    ty += 1
    campo(doc, '*COR PERFIL:', texto(i.corPerfil), X_DO_TEXTO, ty); campo(doc, '*COR ACESSÓRIO:', texto(i.corAcessorio), X_DO_TEXTO + 70, ty); ty += 4.6
    // a DATA DE ENTREGA e as DEFINIÇÕES saíram do item (dono do produto, 16/11/2026): vão UMA VEZ ao bloco OBSERVAÇÕES
    campo(doc, 'LINHA:', linhaDoItem(i), X_DO_TEXTO, ty); ty += 3
    // a tabela de sete colunas: o cabeçalho e a linha do item
    let cx = X_DO_TEXTO
    doc.setDrawColor(CINZA)
    const valores = [String(i.quantidade), milimetros(i.largura_mm), milimetros(i.altura_mm), texto(i.vidro), reais(r.unitario), reais(r.total)]
    COLUNAS_DO_ITEM.forEach((c, k) => {
        doc.setFillColor(245, 245, 245); doc.rect(cx, ty, c.w, 5.2, 'FD'); doc.rect(cx, ty + 5.2, c.w, 5.2)
        const xt = c.alinha === 'center' ? cx + c.w / 2 : c.alinha === 'right' ? cx + c.w - 1.2 : cx + 1.2
        fonte(doc, 'bold', 6.5); doc.text(c.titulo, xt, ty + 3.6, { align: c.alinha })
        textoQueCabe(doc, valores[k], xt, ty + 8.8, c.w - 2.4, c.alinha)
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

/**
 * O QUE VAI UMA VEZ SÓ NAS OBSERVAÇÕES (dono do produto, 16/11/2026): "Nós vamos remover do container de cada item as
 * definições, colocando somente lá nas observações, que vai servir para todos" e "a data de entrega vai ter uma vez só no
 * final do orçamento". As definições iguais em todos os itens que as têm saem numa linha só; quando diferem, uma linha por
 * conjunto, nomeando os itens — nunca se escolhe a de um item para valer pelos outros. A data de entrega sai só quando
 * existe (`ausente-vs-falso`): o " / / " em branco saiu.
 */
export function linhasDoRodape(itens: readonly Pick<ItemDoArquivo, 'ordem' | 'definicoes'>[], dataEntrega: string | null): string[] {
    // 0049: o que é igual em todos os itens que têm definições sai UMA vez; cada conjunto que difere diz só o que é dele, nomeando os itens
    const ordenados = [...itens].sort((a, b) => a.ordem - b.ordem).filter((i) => i.definicoes.length > 0)
    const { comuns, doItem } = separarComuns(ordenados.map((i) => i.definicoes))
    const porConjunto = new Map<string, number[]>()
    ordenados.forEach((i, k) => {
        if (!doItem[k].length) return
        const chave = doItem[k].join(' · ')
        porConjunto.set(chave, [...(porConjunto.get(chave) ?? []), i.ordem])
    })
    const linhas = [
        ...(comuns.length ? [`DEFINIÇÕES: ${comuns.join(' · ')}`] : []),
        ...[...porConjunto].map(([chave, ordens]) => `DEFINIÇÕES (${ordens.length > 1 ? 'ITENS' : 'ITEM'} ${ordens.join(', ')}): ${chave}`),
    ]
    const entrega = dataDeEntrega(dataEntrega)
    if (entrega.trim() !== '/ /') linhas.push(`DATA DE ENTREGA: ${entrega}`)
    return linhas
}
/** As linhas do bloco OBSERVAÇÕES, já quebradas: as do rodapé primeiro, depois o texto da empresa. */
const linhasDasObservacoes = (doc: Doc, d: DadosDoArquivoDoOrcamento) => {
    fonte(doc, 'normal', 7.5)
    const doRodape = linhasDoRodape(d.itens, d.dataEntrega).flatMap((l) => quebrar(doc, l, LARGURA - 4))
    return [...doRodape, ...(texto(d.observacoesGerais) === '' ? [] : quebrar(doc, texto(d.observacoesGerais), LARGURA - 4))]
}

function blocoDasObservacoes(doc: Doc, d: DadosDoArquivoDoOrcamento, y: number): number {
    const linhas = linhasDasObservacoes(doc, d)
    const h = 6 + Math.max(1, linhas.length) * 3.4 + 2
    doc.setDrawColor(0); doc.rect(A4.margem, y, LARGURA, h)
    // OBSERVAÇÕES GERAIS (dono do produto, 17/11/2026): o bloco vale para o orçamento inteiro; a do item é "OBSERVAÇÕES DESTE ITEM"
    fonte(doc, 'bold', 8); doc.text(TITULO_DAS_OBSERVACOES, A4.margem + 2, y + 4.2)
    fonte(doc, 'normal', 7.5); linhas.forEach((l, k) => doc.text(l, A4.margem + 2, y + 8 + k * 3.4))
    return y + h + 3
}
const alturaDasObservacoes = (doc: Doc, d: DadosDoArquivoDoOrcamento) => {
    const n = linhasDasObservacoes(doc, d).length
    return 6 + Math.max(1, n) * 3.4 + 2 + 3
}
export const TITULO_DAS_OBSERVACOES = 'OBSERVAÇÕES GERAIS'
export const TITULO_DAS_CONDICOES = 'CONDIÇÕES COMERCIAIS'
/** As linhas do bloco CONDIÇÕES COMERCIAIS, já quebradas; vazio = o bloco não sai. */
const linhasDasCondicoes = (doc: Doc, d: DadosDoArquivoDoOrcamento) => {
    fonte(doc, 'normal', 7.5)
    return texto(d.condicoesComerciais) === '' ? [] : quebrar(doc, texto(d.condicoesComerciais), LARGURA - 4)
}
/** O bloco CONDIÇÕES COMERCIAIS, logo abaixo das OBSERVAÇÕES GERAIS (17/11/2026): só a forma de pagamento. */
function blocoDasCondicoes(doc: Doc, d: DadosDoArquivoDoOrcamento, y: number): number {
    const linhas = linhasDasCondicoes(doc, d)
    if (linhas.length === 0) return y
    const h = 6 + linhas.length * 3.4 + 2
    doc.setDrawColor(0); doc.rect(A4.margem, y, LARGURA, h)
    fonte(doc, 'bold', 8); doc.text(TITULO_DAS_CONDICOES, A4.margem + 2, y + 4.2)
    fonte(doc, 'normal', 7.5); linhas.forEach((l, k) => doc.text(l, A4.margem + 2, y + 8 + k * 3.4))
    return y + h + 3
}
const alturaDasCondicoes = (doc: Doc, d: DadosDoArquivoDoOrcamento) => {
    const n = linhasDasCondicoes(doc, d).length
    return n === 0 ? 0 : 6 + n * 3.4 + 2 + 3
}
const ALTURA_DO_FECHO = 40

/**
 * A VERSÃO DO DESENHO DO ARQUIVO (dono do produto, 16/11/2026, depois de receber um orçamento "atualizado" sem as
 * figuras e sem as observações): é ela que faz o REENVIO do "sim sem mudança" perceber que o PDF guardado é de outro
 * desenho e REGERAR, em vez de mandar para sempre o arquivo velho.
 *
 * MEDIDO no dia: o PDF do orçamento 6 era das 14:05:23 UTC; os desenhos foram ao ar às 16:33:05 e as observações às
 * 17:52:22; às 18:01 o agente reenviou o de 14:05. O cálculo já tinha `VERSAO_DO_CALCULO` desde 16/11 de manhã, e o
 * ARQUIVO não tinha nenhuma — a mesma classe, no outro artefato.
 *
 * TROQUE ESTE VALOR sempre que o que o PDF MOSTRA mudar (um bloco novo, uma figura, uma coluna). Não o troque por
 * mudança que não aparece no papel: cada troca regera todo arquivo guardado no próximo pedido.
 *
 * O HISTÓRICO, para quem for trocar: `desenho-do-catalogo-e-observacoes-2026-11-16` foi a primeira (as figuras do
 * catálogo e o bloco OBSERVAÇÕES com texto livre); `observacoes-por-variaveis-2026-11-16` é esta — o bloco passou a
 * ser MONTADO das variáveis da base de conhecimento (prazos, validade, exclusões, parcelas do pagamento).
 */
export const VERSAO_DO_ARQUIVO = 'observacoes-gerais-e-condicoes-comerciais-2026-11-17'

/** As linhas das faltas (1.5): uma por código, com os itens. */
export function linhasDasFaltasDoArquivo(faltas: readonly FaltaDoArquivo[]): string[] {
    // o bloco da falta (pedido 0032) vai no começo da linha, antes do código
    return faltas.map((f) => { const { bloco, resto } = separarBloco(f.frase); return `• ${bloco}${f.codigo} (${f.itens.length > 1 ? 'itens' : 'item'} ${f.itens.join(', ')}): ${resto.replace(/\.$/, '')}.` })
}
/** Um bloco de texto com título, em caixa: mede (sem `desenhar`) ou desenha. Devolve a altura. */
function blocoDeTexto(doc: Doc, titulo: string, linhas: readonly string[], y: number, desenhar: boolean, cor: [number, number, number] | null = null): number {
    fonte(doc, 'normal', 7.5)
    const quebradas = linhas.flatMap((l) => quebrar(doc, l, LARGURA - 4))
    const h = 6 + quebradas.length * 3.4 + 2
    if (!desenhar) return h + 3
    doc.setDrawColor(0); doc.rect(A4.margem, y, LARGURA, h)
    fonte(doc, 'bold', 8); if (cor) doc.setTextColor(...cor); doc.text(titulo, A4.margem + 2, y + 4.2); doc.setTextColor(0)
    fonte(doc, 'normal', 7.5); quebradas.forEach((l, k) => doc.text(l, A4.margem + 2, y + 8 + k * 3.4))
    return h + 3
}
/** O carimbo do parcial, no topo da primeira página, em vermelho, sobre a caixa da empresa. */
function carimbo(doc: Doc, n: number) {
    doc.setPage(1)
    fonte(doc, 'bold', 13); doc.setTextColor(...VERMELHO); doc.setDrawColor(...VERMELHO); doc.setLineWidth(0.6)
    const t = carimboDoParcial(n)
    const w = doc.getTextWidth(t) + 6
    const x = A4.margem + 33
    doc.rect(x, A4.margem + 37.5 - 7, w, 8.5)
    doc.text(t, x + 3, A4.margem + 37.5 - 0.8)
    doc.setTextColor(0); doc.setDrawColor(0); doc.setLineWidth(0.3)
}

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

/** O rodapé de cada página: "Página 1 de 2", e mais nada. */
export const rodapeDaPagina = (p: number, paginas: number) => `Página ${p} de ${paginas}`

/** O arquivo do orçamento: confere, desenha e pagina. Recusa nomeada quando falta dado — nunca um arquivo aproximado. */
export function gerarArquivoDoOrcamento(d: DadosDoArquivoDoOrcamento): ArquivoGerado | ArquivoRecusado {
    const recusas = conferirArquivoDoOrcamento(d)
    if (recusas.length) return { ok: false, recusas }
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
    const itens = [...d.itens].sort((a, b) => a.ordem - b.ordem)
    const doRateio = new Map(d.rateio.map((r) => [r.ordem, r]))
    let y = cabecalho(doc, d)
    y = blocoDoCliente(doc, d, y)
    for (const i of itens) {
        const h = medidaDoItem(doc, i).total
        if (y + h > FIM) { doc.addPage('a4', 'portrait'); y = A4.margem }
        y = blocoDoItem(doc, i, doRateio.get(i.ordem) as ItemRateado, y)
    }
    // as faltas, depois dos itens, na página em que cabem (o bloco PARA O VENDEDOR saiu em 16/11/2026, por decisão do dono do produto)
    const blocos: Array<[string, string[], [number, number, number] | null]> = []
    if (d.faltas.length) blocos.push([`FALTAS DE PREÇO — ${carimboDoParcial(d.faltas.length)} (fora do total)`, linhasDasFaltasDoArquivo(d.faltas), VERMELHO])
    for (const [titulo, linhas, cor] of blocos) {
        if (y + blocoDeTexto(doc, titulo, linhas, y, false) > FIM) { doc.addPage('a4', 'portrait'); y = A4.margem }
        y += blocoDeTexto(doc, titulo, linhas, y, true, cor)
    }
    // O RODAPÉ NO PÉ DA PÁGINA, SEMPRE (4.1): as observações e o fecho encostados no fim da última página; sem lugar, uma página nova
    const rodape = alturaDasObservacoes(doc, d) + alturaDasCondicoes(doc, d) + ALTURA_DO_FECHO
    if (y + rodape > FIM) doc.addPage('a4', 'portrait')
    // nunca acima da margem: uma observação longa empurra o fecho para baixo em vez de subir para fora da página
    y = Math.max(A4.margem, FIM - rodape)
    y = blocoDasObservacoes(doc, d, y)
    y = blocoDasCondicoes(doc, d, y)
    fecho(doc, d, y)
    if (d.faltas.length) carimbo(doc, d.faltas.length)
    const paginas = doc.getNumberOfPages()
    for (let p = 1; p <= paginas; p++) {
        doc.setPage(p)
        fonte(doc, 'normal', 7); doc.setTextColor(CINZA)
        // só a página (dono do produto, 16/11/2026: "remova do rodapé o número do orçamento [...] Página 1 de 2, só isso")
        doc.text(rodapeDaPagina(p, paginas), A4.margem + LARGURA / 2, A4.altura - A4.margem, { align: 'center' })
        doc.setTextColor(0)
    }
    doc.setProperties({ title: `Orçamento ${d.numeroExibido} — ${d.cliente.nome}`, creator: 'Precifica Certo' })
    doc.setCreationDate(d.geradoEm)
    doc.setFileId(Array.from(`orc-${d.numero}-${d.geradoEm.getTime()}`).map((ch) => ch.charCodeAt(0).toString(16)).join('').padEnd(32, '0').slice(0, 32).toUpperCase())
    return { ok: true, pdf: new Uint8Array(doc.output('arraybuffer')), paginas, nomeDoArquivo: nomeDoArquivo(d.numeroExibido, d.cliente.nome) }
}
