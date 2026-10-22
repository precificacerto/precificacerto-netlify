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
