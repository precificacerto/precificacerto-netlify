/**
 * Atendimentos I.A. — a IMAGEM e o PDF do vendedor (dono do produto, 18/11/2026): "O agente do WhatsApp precisa passar a ENTENDER
 * IMAGEM e PDF. Áudio fica para a rodada seguinte."
 *
 * O que este módulo decide, sem rede nem banco:
 *   1. o que se LÊ: imagem (JPEG, PNG, GIF, WebP) e PDF. Áudio, vídeo, planilha e documento que não é PDF NÃO se leem, e a
 *      resposta diz o que chegou e o que fazer (decisão do PO: nada fica em silêncio);
 *   2. os LIMITES DA API, conferidos na documentação em 18/11/2026 (`platform.claude.com/docs/en/build-with-claude/vision` e
 *      `/pdf-support`): imagem até 10 MB EM BASE64 e até 8000 x 8000 px; PDF sem senha, até 600 páginas, num pedido de até
 *      128 MB. Acima deles a resposta RECUSA nomeando o número — nunca se corta nem se reduz em silêncio;
 *   3. o MARCADOR que vai à conversa gravada no lugar do arquivo: `[imagem]` ou `[documento: <nome>]`, mais a legenda. O base64
 *      NUNCA é gravado: o histórico tem teto de 6.000 caracteres (`conversa-gravada.ts`) e o arquivo o estouraria sozinho;
 *   4. o BLOCO que vai ao modelo (`image` ou `document`, em base64), com o tipo conferido PELOS BYTES, não pelo que o evento declarou.
 *
 * As páginas do PDF não são contadas aqui: só a API as conta com segurança. O PDF que ela recusa (páginas, formato) volta como
 * recusa nomeada (`fraseDaMidiaRecusadaPelaIa`), nunca como "não consegui processar".
 *
 * NUNCA vai ao log: a legenda, o nome do arquivo e os bytes. O log leva só o tipo e o motivo (`marcaNoLog`).
 */
import type { MidiaDaMensagem } from '@/lib/atendimentos-ia/payload-wuzapi'

/** Imagem: 10 MB em base64 por imagem (o "MB" lido como 1.000.000, o menor dos dois sentidos) — 7.500.000 bytes do arquivo. */
export const LIMITE_DA_IMAGEM_EM_BASE64 = 10_000_000
export const LIMITE_DA_IMAGEM_BYTES = (LIMITE_DA_IMAGEM_EM_BASE64 / 4) * 3
/** Imagem: 8000 px no maior lado. */
export const LADO_MAXIMO_DA_IMAGEM_PX = 8000
/**
 * PDF: o pedido inteiro tem até 128 MB. Reservam-se 8 MB para o resto do pedido (o sistema, a ferramenta e o histórico somam menos de
 * 1 MB, medido nos pedidos da fixture) e o PDF fica com 120 MB em base64 — 90.000.000 bytes do arquivo.
 */
export const LIMITE_DO_PDF_EM_BASE64 = 120_000_000
export const LIMITE_DO_PDF_BYTES = (LIMITE_DO_PDF_EM_BASE64 / 4) * 3
/** PDF: 600 páginas (o limite da API para o modelo de 1M de contexto). Conferido pela API, nunca aqui. */
export const PAGINAS_MAXIMAS_DO_PDF = 600

export const TIPOS_DE_IMAGEM = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
export type TipoDeImagem = typeof TIPOS_DE_IMAGEM[number]
const PDF = 'application/pdf'

const PLANILHA_MIME = /spreadsheet|excel|ms-excel|text\/csv|comma-separated/i
const PLANILHA_EXT = /\.(xlsx|xlsm|xls|csv|ods)$/i

export type MotivoDaRecusa =
    | 'audio' | 'video' | 'planilha' | 'documento_nao_pdf' | 'imagem_formato'
    | 'imagem_grande' | 'imagem_dimensao' | 'pdf_grande' | 'pdf_com_senha' | 'arquivo_nao_confere'
    | 'sem_dados_do_download' | 'falhou_ao_baixar'
    /** O ÁUDIO (18/11/2026, tarefa 0018): acima de 3 minutos; a transcrição que falhou; a empresa sem a liberação; o teto do mês. */
    | 'audio_longo' | 'audio_nao_transcrito' | 'audio_nao_liberado' | 'audio_teto'

/** O que se pretende ler, decidido pelos METADADOS do evento, antes de baixar. */
export type Leitura =
    | { lida: true; como: 'imagem' | 'pdf' | 'audio' }
    | { lida: false; motivo: MotivoDaRecusa; frase: string }

/** O que vai ao modelo, já conferido pelos bytes. */
export type BlocoDaMidia =
    | { type: 'image'; source: { type: 'base64'; media_type: TipoDeImagem; data: string } }
    | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } }
/** `extras`: as outras fotos ou PDFs da MESMA rajada (pedido 0029), entregues antes do bloco do turno, na mesma chamada. */
export type AnexoParaOModelo = { bloco: BlocoDaMidia; instrucao: string; como: 'imagem' | 'pdf'; extras?: BlocoDaMidia[] }

/**
 * A instrução da rajada (pedido 0029): as imagens são UM envio — e a tabela de "item → vidro" (ou de cor) completa a lista pelo número do item,
 * nunca é lista de esquadrias.
 */
export const instrucaoDaRajada = (n: number) =>
    `São ${n} imagens ou arquivos do MESMO envio do vendedor: leia todos juntos, como uma mensagem só. Uma tabela de item → vidro (ou de cor) `
    + 'COMPLETA a lista: ponha o vidro no item de mesmo número (ordem) e não crie item novo para ela. "Não especificado" é vidro não dito: omita.'

const mimeBase = (m: string | null) => (m ?? '').split(';')[0].trim().toLowerCase()
const ehPlanilha = (m: MidiaDaMensagem) => PLANILHA_MIME.test(mimeBase(m.mimetype)) || (m.nome !== null && PLANILHA_EXT.test(m.nome))
const ehPdfDeclarado = (m: MidiaDaMensagem) => mimeBase(m.mimetype) === PDF || (m.nome !== null && /\.pdf$/i.test(m.nome))
const ehImagemDeclarada = (m: MidiaDaMensagem) => (TIPOS_DE_IMAGEM as readonly string[]).includes(mimeBase(m.mimetype))

/** O limite do áudio (dono do produto, 18/11/2026): "acima disso não transcreve, e responde pedindo para dividir ou escrever". */
export const LIMITE_DO_AUDIO_SEGUNDOS = 180

/** Megabytes com uma casa, vírgula decimal — "12,3 MB". Arredonda PARA CIMA: o número dito nunca é menor que o arquivo. */
export const emMB = (bytes: number) => `${(Math.ceil(bytes / 100_000) / 10).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`

// ── O QUE CHEGOU, nas palavras do vendedor ──────────────────────────────────────────────────
/** "a sua foto", "o PDF “Obra.pdf”", "o seu áudio"… — o sujeito das frases. */
export function oQueChegou(m: MidiaDaMensagem): string {
    if (m.tipo === 'audio') return 'o seu áudio'
    if (m.tipo === 'video') return 'o seu vídeo'
    if (m.tipo === 'imagem') return 'a sua foto'
    const nome = m.nome ? ` “${m.nome}”` : ''
    if (ehPlanilha(m)) return `a planilha${nome}`
    if (ehPdfDeclarado(m)) return `o PDF${nome}`
    if (ehImagemDeclarada(m)) return `a imagem${nome}`
    return `o documento${nome}`
}
const recebi = (m: MidiaDaMensagem) => `Recebi ${oQueChegou(m)}`
const OU_ESCREVA = 'ou me escreva as medidas'

/** As frases de recusa: dizem o que chegou, por que não foi lido e o que fazer. Passam por `falar()`, como as outras perguntas. */
/** "2 minutos e 5 segundos", "3 minutos", "40 segundos" — a duração como o vendedor fala. */
export function duracaoPorExtenso(segundos: number): string {
    const s = Math.ceil(segundos)
    const min = Math.floor(s / 60), seg = s % 60
    const m = min ? `${min} ${min === 1 ? 'minuto' : 'minutos'}` : ''
    const r = seg ? `${seg} ${seg === 1 ? 'segundo' : 'segundos'}` : ''
    return m && r ? `${m} e ${r}` : m || r || '0 segundo'
}

export function fraseDaRecusa(m: MidiaDaMensagem, motivo: MotivoDaRecusa, detalhe: { bytes?: number; largura?: number; altura?: number; segundos?: number } = {}): string {
    switch (motivo) {
        case 'audio': return `${recebi(m)}, mas ainda não consigo ouvir áudio: me escreva o que precisa, ou mande uma foto.`
        case 'audio_longo': return `${recebi(m)}, mas ele tem ${detalhe.segundos !== undefined ? `${duracaoPorExtenso(detalhe.segundos)} e eu ouço` : 'mais do que eu ouço:'} áudio de até 3 minutos: mande em partes menores, ou me escreva o que precisa.`
        case 'audio_nao_transcrito': return `${recebi(m)}, mas não consegui transcrever agora: mande de novo daqui a pouco, ou me escreva o que precisa.`
        case 'audio_nao_liberado': return `${recebi(m)}, mas a transcrição de áudio não está liberada para a sua empresa: me escreva o que precisa, ou mande uma foto.`
        case 'audio_teto': return `${recebi(m)}, mas a sua empresa já usou os minutos de áudio do mês: me escreva o que precisa, ou mande uma foto.`
        case 'video': return `${recebi(m)}, mas ainda não consigo assistir vídeo: me mande uma foto ou um PDF, ${OU_ESCREVA}.`
        case 'planilha': return `${recebi(m)}, mas ainda não consigo ler planilha: me mande em PDF ou em foto, ${OU_ESCREVA}.`
        case 'documento_nao_pdf': return `${recebi(m)}, mas de documento eu só leio PDF: me mande em PDF ou em foto, ${OU_ESCREVA}.`
        case 'imagem_formato': return `${recebi(m)}, mas não leio esse formato de imagem (leio JPEG, PNG, GIF e WebP): mande como foto comum, ${OU_ESCREVA}.`
        case 'imagem_grande': return `${recebi(m)}, mas ela tem ${emMB(detalhe.bytes ?? 0)} e eu leio imagem de até ${emMB(LIMITE_DA_IMAGEM_BYTES)}: mande uma foto menor, ${OU_ESCREVA}.`
        case 'imagem_dimensao': return `${recebi(m)}, mas ela tem ${detalhe.largura} x ${detalhe.altura} pixels e eu leio imagem de até ${LADO_MAXIMO_DA_IMAGEM_PX} pixels de lado: mande uma foto menor, ${OU_ESCREVA}.`
        case 'pdf_grande': return `${recebi(m)}, mas ele tem ${emMB(detalhe.bytes ?? 0)} e eu leio PDF de até ${emMB(LIMITE_DO_PDF_BYTES)}: mande só as páginas dos itens, ${OU_ESCREVA}.`
        case 'pdf_com_senha': return `${recebi(m)}, mas ele está protegido por senha e eu não consigo abrir: mande o PDF sem senha, ou uma foto.`
        case 'arquivo_nao_confere': return `${recebi(m)}, mas o arquivo não é o que diz ser (não abre como ${m.tipo === 'imagem' || ehImagemDeclarada(m) ? 'imagem' : 'PDF'}): mande de novo, ${OU_ESCREVA}.`
        case 'sem_dados_do_download':
        case 'falhou_ao_baixar': return `${recebi(m)}, mas não consegui baixar o arquivo do WhatsApp: mande de novo, ${OU_ESCREVA}.`
    }
}

/** O PDF ou a imagem que a API recusou (as páginas, o formato, o tamanho do pedido): recusa nomeada, nunca "não consegui processar". */
export function fraseDaMidiaRecusadaPelaIa(m: MidiaDaMensagem): string {
    if (m.tipo === 'imagem' || ehImagemDeclarada(m)) return `${recebi(m)}, mas o serviço de IA não aceitou a imagem: mande outra foto, ${OU_ESCREVA}.`
    return `${recebi(m)}, mas o serviço de IA não conseguiu abrir o PDF (ele lê até ${PAGINAS_MAXIMAS_DO_PDF} páginas, sem senha): mande só as páginas dos itens, ou uma foto.`
}

/** A leitura pelos METADADOS: o que se pretende ler, ou a recusa nomeada — antes de baixar qualquer byte. */
export function leituraDaMidia(m: MidiaDaMensagem): Leitura {
    const recusa = (motivo: MotivoDaRecusa, detalhe: { bytes?: number } = {}): Leitura => ({ lida: false, motivo, frase: fraseDaRecusa(m, motivo, detalhe) })
    // O ÁUDIO (18/11/2026, tarefa 0018): a duração declarada acima de 3 minutos recusa SEM baixar; o resto vai à transcrição, que confere de novo
    if (m.tipo === 'audio') {
        if (m.segundos !== null && m.segundos > LIMITE_DO_AUDIO_SEGUNDOS) return { lida: false, motivo: 'audio_longo', frase: fraseDaRecusa(m, 'audio_longo', { segundos: m.segundos }) }
        if (m.download === null) return recusa('sem_dados_do_download')
        return { lida: true, como: 'audio' }
    }
    if (m.tipo === 'video') return recusa('video')
    let como: 'imagem' | 'pdf'
    if (m.tipo === 'imagem') {
        // a foto do WhatsApp vem JPEG; o mimetype ausente não recusa: os bytes decidem depois do download
        if (m.mimetype !== null && !ehImagemDeclarada(m)) return recusa('imagem_formato')
        como = 'imagem'
    } else if (ehPlanilha(m)) return recusa('planilha')
    else if (ehPdfDeclarado(m)) como = 'pdf'
    else if (ehImagemDeclarada(m)) como = 'imagem'
    else return recusa('documento_nao_pdf')
    // o tamanho DECLARADO já acima do limite: recusa sem baixar; o ausente segue, e os bytes decidem
    if (m.tamanho !== null) {
        if (como === 'imagem' && m.tamanho > LIMITE_DA_IMAGEM_BYTES) return recusa('imagem_grande', { bytes: m.tamanho })
        if (como === 'pdf' && m.tamanho > LIMITE_DO_PDF_BYTES) return recusa('pdf_grande', { bytes: m.tamanho })
    }
    if (m.download === null) return recusa('sem_dados_do_download')
    return { lida: true, como }
}

// ── OS BYTES ────────────────────────────────────────────────────────────────────────────────
/** O tipo pelos primeiros bytes (a assinatura do arquivo), ou NULL. */
export function tipoPelosBytes(b: Uint8Array): TipoDeImagem | 'application/pdf' | null {
    const ini = (sig: number[], desde = 0) => sig.every((x, i) => b[desde + i] === x)
    if (ini([0xff, 0xd8, 0xff])) return 'image/jpeg'
    if (ini([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
    if (ini([0x47, 0x49, 0x46, 0x38])) return 'image/gif'
    if (ini([0x52, 0x49, 0x46, 0x46]) && ini([0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp'
    // o "%PDF-" pode vir depois de lixo no início (a especificação admite até 1024 bytes)
    const cabeca = Buffer.from(b.subarray(0, 1024)).toString('latin1')
    if (cabeca.includes('%PDF-')) return 'application/pdf'
    return null
}

/** Largura e altura da imagem pelo cabeçalho, ou NULL quando o cabeçalho não diz (a API confere de novo). */
export function dimensoesDaImagem(b: Uint8Array, tipo: TipoDeImagem): { largura: number; altura: number } | null {
    const u16be = (i: number) => (b[i] << 8) | b[i + 1]
    const u16le = (i: number) => b[i] | (b[i + 1] << 8)
    const u24le = (i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16)
    const u32be = (i: number) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3]
    if (tipo === 'image/png') return b.length >= 24 ? { largura: u32be(16), altura: u32be(20) } : null
    if (tipo === 'image/gif') return b.length >= 10 ? { largura: u16le(6), altura: u16le(8) } : null
    if (tipo === 'image/webp') {
        if (b.length < 30) return null
        const bloco = String.fromCharCode(b[12], b[13], b[14], b[15])
        if (bloco === 'VP8X') return { largura: u24le(24) + 1, altura: u24le(27) + 1 }
        if (bloco === 'VP8 ') return { largura: u16le(26) & 0x3fff, altura: u16le(28) & 0x3fff }
        if (bloco === 'VP8L') {
            const v = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)
            return { largura: (v & 0x3fff) + 1, altura: ((v >>> 14) & 0x3fff) + 1 }
        }
        return null
    }
    // JPEG: percorre os blocos de marcador até o SOF (C0-CF, menos C4, C8 e CC)
    let i = 2
    while (i + 9 < b.length) {
        if (b[i] !== 0xff) { i += 1; continue }
        const marca = b[i + 1]
        if (marca === 0xd8 || marca === 0x01 || (marca >= 0xd0 && marca <= 0xd7)) { i += 2; continue }
        if (marca >= 0xc0 && marca <= 0xcf && marca !== 0xc4 && marca !== 0xc8 && marca !== 0xcc) return { largura: u16be(i + 7), altura: u16be(i + 5) }
        i += 2 + u16be(i + 2)
    }
    return null
}

/** O PDF protegido por senha: o dicionário `/Encrypt` no arquivo. */
export const pdfComSenha = (b: Uint8Array) => Buffer.from(b.buffer, b.byteOffset, b.byteLength).includes('/Encrypt')

const INSTRUCAO_DA_IMAGEM = 'A mensagem do vendedor traz uma FOTO (acima). Leia os itens dela como leria o texto: tipologia, medidas, quantidade, cor e vidro.'
    + ' Medida ou número que não estiver legível na foto NÃO entra: pergunte. Nunca complete, arredonde nem adivinhe um número.'
    + ' Copie em texto_da_imagem todo o texto escrito na foto, linha a linha, como está.'
    + ' Um nome de pessoa solto, numa linha à parte da lista de itens, é o CLIENTE (cliente e nome); o lugar escrito junto dele é a cidade (dados_do_cliente.endereco).'
const INSTRUCAO_DO_PDF = 'A mensagem do vendedor traz um PDF (acima). Leia os itens dele como leria o texto: tipologia, medidas, quantidade, cor e vidro.'
    + ' Medida ou número que não estiver legível NÃO entra: pergunte. Nunca complete, arredonde nem adivinhe um número.'
    + ' Copie em texto_da_imagem todo o texto escrito no PDF, linha a linha, como está.'
    + ' Um nome de pessoa solto, numa linha à parte da lista de itens, é o CLIENTE (cliente e nome); o lugar escrito junto dele é a cidade (dados_do_cliente.endereco).'

/** Os bytes baixados conferidos contra os limites e contra o tipo pretendido: o anexo para o modelo, ou a recusa nomeada. */
export function conferirMidiaBaixada(m: MidiaDaMensagem, como: 'imagem' | 'pdf', bytes: Uint8Array):
    { ok: true; anexo: AnexoParaOModelo } | { ok: false; motivo: MotivoDaRecusa; frase: string } {
    const recusa = (motivo: MotivoDaRecusa, detalhe: { bytes?: number; largura?: number; altura?: number } = {}) => ({ ok: false as const, motivo, frase: fraseDaRecusa(m, motivo, detalhe) })
    if (bytes.length === 0) return recusa('falhou_ao_baixar')
    const tipo = tipoPelosBytes(bytes)
    const data = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64')
    if (como === 'pdf') {
        if (tipo !== PDF) return recusa('arquivo_nao_confere')
        if (data.length > LIMITE_DO_PDF_EM_BASE64) return recusa('pdf_grande', { bytes: bytes.length })
        if (pdfComSenha(bytes)) return recusa('pdf_com_senha')
        return { ok: true, anexo: { como, instrucao: INSTRUCAO_DO_PDF, bloco: { type: 'document', source: { type: 'base64', media_type: PDF, data } } } }
    }
    // um PDF no lugar da imagem não é imagem; bytes que não são de nenhum dos quatro formatos são outro formato (HEIC, TIFF…)
    if (tipo === PDF) return recusa('arquivo_nao_confere')
    if (tipo === null) return recusa('imagem_formato')
    if (data.length > LIMITE_DA_IMAGEM_EM_BASE64) return recusa('imagem_grande', { bytes: bytes.length })
    const d = dimensoesDaImagem(bytes, tipo)
    if (d && Math.max(d.largura, d.altura) > LADO_MAXIMO_DA_IMAGEM_PX) return recusa('imagem_dimensao', d)
    return { ok: true, anexo: { como, instrucao: INSTRUCAO_DA_IMAGEM, bloco: { type: 'image', source: { type: 'base64', media_type: tipo, data } } } }
}

// ── O QUE SE GRAVA E O QUE VAI AO LOG ────────────────────────────────────────────────────────
/** O marcador da mídia na conversa gravada: `[imagem]`, `[documento: <nome>]`, `[áudio]`, `[vídeo]` — nunca o arquivo. */
export function marcadorDaMidia(m: MidiaDaMensagem): string {
    if (m.tipo === 'imagem') return '[imagem]'
    if (m.tipo === 'audio') return '[áudio]'
    if (m.tipo === 'video') return '[vídeo]'
    return m.nome ? `[documento: ${m.nome}]` : '[documento]'
}

/** A entrada como se grava e como vai ao modelo: o marcador, e a legenda (ou o texto) depois dele. */
export const textoDaEntradaComMidia = (m: MidiaDaMensagem, texto: string | null) => (texto ? `${marcadorDaMidia(m)} ${texto}` : marcadorDaMidia(m))

/** O tipo e o desfecho da mídia para a linha [IA]: só códigos — nunca a legenda nem o nome do arquivo. */
export const marcaNoLog = (m: MidiaDaMensagem, desfecho: 'lida' | MotivoDaRecusa | 'recusada_pela_ia', como?: 'imagem' | 'pdf' | 'audio') =>
    `${como ?? m.tipo}:${desfecho}`
