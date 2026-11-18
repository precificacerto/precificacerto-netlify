/**
 * O QUE FOI LIDO DA IMAGEM (dono do produto, 18/11/2026). O defeito em produção, às 18:42: a foto trazia "janela de correr 2 folhas - 1,50 x 1,20 /
 * janela maxim ar - 0,80 x 0,60 / Alfredo Soares / Barao", o texto da mensagem era só "[imagem]", e o agente perguntou "de quem é?" — o nome lido
 * da foto caiu na guarda que impede a IA de INVENTAR nome (as palavras têm de estar no texto do vendedor).
 *
 * A decisão: "o texto lido da imagem conta como texto do vendedor para essa conferência. Mas não solte a guarda: o que vier só da imagem (nome,
 * cidade, vidro) vale COM CONFIRMAÇÃO CURTA antes de gravar — 'é do Alfredo Soares, de Barão?' — e segue no sim. O que vier escrito na mensagem
 * ou na legenda segue direto, como hoje." E: "A CIDADE importa em dobro: é o primeiro degrau do afunilamento."
 *
 * O texto da imagem é o que o modelo COPIOU dela (`texto_da_imagem` da ferramenta), e só existe quando a mensagem trouxe a foto ou o PDF. Ele serve
 * de texto para as mesmas conferências do nome, da cidade e do vidro; nunca vai ao log nem é gravado.
 */
import type { DadosDaImagem } from '@/lib/atendimentos-ia/pergunta-em-aberto'

/** O texto copiado da imagem pelo modelo, só com anexo e só texto não vazio; senão null. Nunca cortado: serve para conferir, não se grava. */
export function textoDaImagemDaProposta(proposta: Record<string, unknown>, temAnexo: boolean): string | null {
    if (!temAnexo) return null
    const t = proposta.texto_da_imagem
    return typeof t === 'string' && t.trim() ? t.trim() : null
}

/** O texto em que a imagem conta como texto do vendedor: a mensagem (o marcador e a legenda) e, numa linha à parte, o que foi lido da imagem. */
export const comOTextoDaImagem = (texto: string, daImagem: string | null) => (daImagem ? `${texto}\n${daImagem}` : texto)

const juntarComE = (xs: readonly string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`)
const doQueFoiLido = (nome: string, d: DadosDaImagem) =>
    `“${nome}”${d.endereco ? `, de “${d.endereco}”` : ''}${d.vidros?.length ? `, com vidro ${juntarComE(d.vidros.map((v) => `“${v}”`))}` : ''}`

/** A confirmação curta, antes de gravar: o nome, a cidade e o vidro lidos só da imagem. Entre aspas, para a redação nunca os perder. */
export const fraseDeConfirmarDaImagem = (nome: string, d: DadosDaImagem) => `Li na foto: é do ${doQueFoiLido(nome, d)}?`
/** A mesma pergunta, em outras palavras — quando a resposta não disse sim nem não. */
export const fraseDeConfirmarDaImagemEmOutrasPalavras = (nome: string, d: DadosDaImagem) =>
    `Só para eu não anotar errado: o levantamento da foto é do ${doQueFoiLido(nome, d)}? Me responda sim ou me diga de quem é.`
/** O "não": as esquadrias ficam anotadas, e falta saber de quem são. */
export const fraseDaImagemRecusada = (nome: string) =>
    `Certo, não é do “${nome}”. As esquadrias da foto ficam anotadas: me diga de quem é o levantamento.`
