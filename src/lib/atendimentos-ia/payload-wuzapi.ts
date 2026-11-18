/**
 * Atendimentos I.A. — o que a rota de entrada lê do webhook do WUZAPI.
 *
 * O FORMATO É O MEDIDO EM PRODUÇÃO (21/10/2026), não o da documentação: `POST application/json`
 * com a chave `event`, e dentro dela `Info` e `Message`:
 *   - `Info.Sender`    → `<números>:33@lid` — LID, identificador OCULTO do WhatsApp. NÃO é telefone,
 *                        mesmo quando os dígitos parecem um;
 *   - `Info.SenderAlt` → `5551XXXXXXXX:33@s.whatsapp.net` — é AQUI que está o telefone, com o DDI;
 *   - `Message.conversation` → o texto, quando `Info.Type` é `text`.
 *
 * Funções puras: não leem banco nem rede. Portão: `src/utils/__tests__/atendimentos-ia-inbound.test.ts`.
 */

const SERVIDOR_DE_TELEFONE = '@s.whatsapp.net'
const TELEFONE = /^[0-9]{10,15}$/

const textoPreenchido = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''

/**
 * O telefone de quem mandou a mensagem, só dígitos e COM o DDI — ou NULL.
 *
 * Prefere `Info.SenderAlt`. Só quando ele está ausente ou vazio usa `Info.Sender`, e só se o
 * Sender for do servidor de telefone (`@s.whatsapp.net`). Um SenderAlt PRESENTE e inválido não cai
 * para o Sender: é o valor que o servidor mandou, e ele não é telefone.
 *
 * Valor terminado em `@lid` NUNCA é telefone. A parte do número termina no primeiro `:` (o
 * aparelho) ou `@` (o servidor); o que sobrar tem de ser 10 a 15 dígitos — senão NULL, e não se
 * limpa um texto até ele parecer número.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function telefoneDoRemetente(info: any): string | null {
    if (!info || typeof info !== 'object') return null
    const alternativo: unknown = info.SenderAlt
    let jid: string
    if (textoPreenchido(alternativo)) jid = alternativo.trim()
    else if (textoPreenchido(info.Sender) && info.Sender.trim().endsWith(SERVIDOR_DE_TELEFONE)) jid = info.Sender.trim()
    else return null

    if (!jid.endsWith(SERVIDOR_DE_TELEFONE)) return null
    const numero = jid.split(':')[0].split('@')[0]
    return TELEFONE.test(numero) ? numero : null
}

/** O texto da mensagem: `conversation`, ou `extendedTextMessage.text` (texto com link) — senão NULL. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function textoDaMensagem(event: any): string | null {
    const mensagem = event && typeof event === 'object' ? event.Message : undefined
    if (!mensagem || typeof mensagem !== 'object') return null
    if (textoPreenchido(mensagem.conversation)) return mensagem.conversation
    const estendida = mensagem.extendedTextMessage
    if (estendida && typeof estendida === 'object' && textoPreenchido(estendida.text)) return estendida.text
    return null
}

// ── A MÍDIA DA MENSAGEM (dono do produto, 18/11/2026) ─────────────────────────────────────────
/**
 * O FORMATO MEDIDO EM PRODUÇÃO (18/11/2026, uma foto com legenda e um PDF enviados de um número autorizado): o corpo do webhook
 * chega com as MESMAS quatro chaves de texto — `event, instanceName, type, userID` — e SEM `base64`, `mimeType`, `fileName` ou `s3`.
 * O WUZAPI desta conexão entrega SÓ OS METADADOS da mídia (dentro de `event.Message`), e o arquivo se busca por
 * `POST /chat/downloadimage` ou `/chat/downloaddocument` (`midia-do-wuzapi.ts`). Os nomes dos campos são os do protobuf do
 * WhatsApp como o whatsmeow os serializa (`URL`, `directPath`, `mediaKey`, `mimetype`, `caption`, `fileName`…); a leitura aceita
 * também a grafia com a inicial trocada, porque o WUZAPI decodifica sem olhar a caixa.
 *
 * Os invólucros que o WhatsApp põe em volta da mídia são abertos: `documentWithCaptionMessage` (o PDF COM legenda vem assim),
 * `ephemeralMessage`, `viewOnceMessage` e `viewOnceMessageV2`, cada um com a mensagem de verdade em `.message`.
 * Figurinha (`stickerMessage`) não é mídia para o orçamentista: segue ignorada como mensagem sem texto.
 */
export type TipoDaMidia = 'imagem' | 'documento' | 'audio' | 'video'

/** O que o WUZAPI precisa para baixar o arquivo — o mesmo que veio no evento, sem transformação. Os bytes vêm em base64, como o Go os serializa. */
export type DadosDoDownload = { url: string; directPath: string; mediaKey: string; fileEncSHA256: string; fileSHA256: string; fileLength: number | null }

export type MidiaDaMensagem = {
    tipo: TipoDaMidia
    /** O mimetype DECLARADO no evento (pode mentir: o conferido é o dos bytes, depois do download). */
    mimetype: string | null
    /** O nome do arquivo (só no documento). */
    nome: string | null
    /** A legenda que veio com a mídia — VIRA O TEXTO da mensagem. */
    legenda: string | null
    /** O tamanho declarado em bytes (`fileLength`), ou NULL quando não veio — ausente não é zero. */
    tamanho: number | null
    /** NULL quando falta algum dos campos do download: a mídia chegou, mas não há como buscá-la. */
    download: DadosDoDownload | null
}

const CAMPOS_DE_MIDIA: ReadonlyArray<[string, TipoDaMidia]> = [['imageMessage', 'imagem'], ['documentMessage', 'documento'], ['audioMessage', 'audio'], ['videoMessage', 'video']]
const INVOLUCROS = ['documentWithCaptionMessage', 'ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const objeto = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)

/** O primeiro campo de texto não vazio entre as grafias aceitas. */
function campoTexto(o: Record<string, unknown>, ...nomes: string[]): string | null {
    for (const n of nomes) if (textoPreenchido(o[n])) return (o[n] as string)
    return null
}

/** O tamanho em bytes: inteiro positivo (número ou texto de dígitos), senão NULL. */
function campoTamanho(o: Record<string, unknown>): number | null {
    const v = o.fileLength ?? o.FileLength
    const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : NaN
    return Number.isSafeInteger(n) && n > 0 ? n : null
}

/** A mensagem de verdade, sem os invólucros (no máximo três camadas). */
function abrirInvolucros(mensagem: Record<string, unknown>): Record<string, unknown> {
    let m = mensagem
    for (let i = 0; i < 3; i++) {
        const de = INVOLUCROS.map((k) => m[k]).find(objeto)
        if (!de || !objeto(de.message)) return m
        m = de.message
    }
    return m
}

/**
 * A mídia da mensagem — imagem, documento, áudio ou vídeo —, com o mimetype, o nome, a legenda e o que o download exige; ou NULL
 * quando a mensagem não traz nenhuma delas. Função pura: não baixa nada.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function midiaDaMensagem(event: any): MidiaDaMensagem | null {
    const bruta = objeto(event) ? event.Message : undefined
    if (!objeto(bruta)) return null
    const mensagem = abrirInvolucros(bruta)
    for (const [campo, tipo] of CAMPOS_DE_MIDIA) {
        const m = mensagem[campo]
        if (!objeto(m)) continue
        const url = campoTexto(m, 'URL', 'url', 'Url')
        const directPath = campoTexto(m, 'directPath', 'DirectPath')
        const mediaKey = campoTexto(m, 'mediaKey', 'MediaKey')
        const fileEncSHA256 = campoTexto(m, 'fileEncSHA256', 'FileEncSHA256')
        const fileSHA256 = campoTexto(m, 'fileSHA256', 'FileSHA256')
        const tamanho = campoTamanho(m)
        const legenda = campoTexto(m, 'caption', 'Caption')
        return {
            tipo,
            mimetype: campoTexto(m, 'mimetype', 'Mimetype', 'mimeType'),
            nome: tipo === 'documento' ? campoTexto(m, 'fileName', 'FileName') : null,
            legenda: legenda === null ? null : legenda.trim(),
            tamanho,
            download: (url || directPath) && mediaKey && fileEncSHA256 && fileSHA256
                ? { url: url ?? '', directPath: directPath ?? '', mediaKey, fileEncSHA256, fileSHA256, fileLength: tamanho }
                : null,
        }
    }
    return null
}
