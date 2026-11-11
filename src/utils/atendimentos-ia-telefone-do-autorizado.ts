/**
 * Atendimentos I.A. — o TELEFONE de quem pode falar com o orçamentista: a forma que se grava em
 * `orcamentista_remetente_autorizado.telefone` e a forma que se mostra.
 *
 * A FORMA GRAVADA É A DO CANAL (`telefoneNoFormatoDoCanal`, dono do produto, 11/11/2026 — substitui a
 * de 22/10/2026, que gravava a forma normalizada): 55 + DDD + assinante, o celular sem o nono, o número
 * que o WhatsApp entrega e recebe. Cabe no CHECK da coluna (10 a 13 dígitos). A COMPARAÇÃO continua
 * pela FORMA NORMALIZADA (`telefoneNormalizado`, em `src/lib/atendimentos-ia/telefone-normalizado.ts`:
 * DDD + assinante, sem o DDI, com o nono), dos dois lados — a tela e a rota não podem divergir sobre
 * "é o mesmo número" (22/10/2026: o WhatsApp entrega o celular SEM o nono). As linhas gravadas antes
 * de 11/11/2026 estão na forma normalizada, e a correção delas é decisão do dono do produto. O que a
 * normalização não lê NÃO é telefone, e não se grava — a tela diz "sem telefone" e o motivo: uma
 * autorização que a rota nunca reconheceria seria uma autorização morta.
 *
 * `telefonesCasam` é a COMPARAÇÃO — as duas pontas pela forma normalizada.
 * `numeroDoJid` é o número da INSTÂNCIA, lido do jid do WUZAPI — esse COM o DDI.
 *
 * Funções puras: não leem banco nem tela.
 * Portão: `src/utils/__tests__/atendimentos-ia-celula-do-orcamentista.test.ts`.
 */

import { telefoneNormalizado } from '@/lib/atendimentos-ia/telefone-normalizado'

export type TelefoneDoAutorizado = { ok: true; telefone: string } | { ok: false; motivo: string }

/** O telefone do cadastro do funcionário → a forma que se grava, ou o motivo de não ser telefone. */
export function telefoneDoAutorizado(bruto: string | null | undefined): TelefoneDoAutorizado {
    const texto = (bruto ?? '').trim()
    if (texto === '') return { ok: false, motivo: 'sem telefone no cadastro' }
    const telefone = telefoneNormalizado(texto)
    if (telefone !== null) return { ok: true, telefone }
    return { ok: false, motivo: `o telefone do cadastro ("${texto}") não é um celular ou fixo brasileiro com DDD` }
}

/**
 * O remetente que o webhook entregou casa com o telefone gravado na lista?
 *
 * O webhook entrega o remetente COM o DDI e, no celular, SEM o nono dígito (`555499887766`); a
 * lista grava sem o DDI e com o nono (`54999887766`). Os DOIS lados passam por `telefoneNormalizado`
 * antes da igualdade — a comparação nunca é de texto cru, e é a MESMA da rota de entrada. O que não
 * é telefone, de qualquer lado, não casa com nada.
 *
 * NÃO trata o `jid` (`...@s.whatsapp.net`): o formato do remetente no webhook ainda depende da
 * captura. Quem chamar entrega o número.
 */
export function telefonesCasam(remetente: string | null | undefined, gravado: string | null | undefined): boolean {
    const a = telefoneNormalizado(remetente)
    return a !== null && a === telefoneNormalizado(gravado)
}

/**
 * O número da instância a partir do `jid` que o `POST /session/connect` do WUZAPI devolve — só os
 * dígitos da parte do USUÁRIO, ou NULL.
 *
 * O jid do WhatsApp é `usuário[.agente][:aparelho]@servidor`, e o exemplo da documentação do WUZAPI
 * traz o agente: `5491155554444.0:52@s.whatsapp.net`. Por isso a parte do usuário termina no
 * primeiro `.`, `:` ou `@` — "ficar só com os dígitos" de `5491155554444.0` daria `54911555544440`,
 * um número que não existe.
 *
 * Só o servidor `s.whatsapp.net` é telefone: `@lid` é identificador oculto, `@g.us` é grupo. E a
 * parte do usuário tem de ser SÓ dígitos, de 8 a 15 (o máximo do E.164). Qualquer outra coisa é
 * formato estranho e devolve NULL — não se limpa um texto até ele parecer número.
 * O número sai como o WUZAPI o informa: COM o código do país.
 */
export function numeroDoJid(jid: unknown): string | null {
    if (typeof jid !== 'string') return null
    const m = /^([^.:@]*)(?:\.[^:@]*)?(?::[^@]*)?@s\.whatsapp\.net$/.exec(jid.trim())
    if (!m || !/^\d{8,15}$/.test(m[1])) return null
    return m[1]
}

/**
 * O TELEFONE NO FORMATO DO CANAL — o que se GRAVA em `orcamentista_remetente_autorizado.telefone` (dono do produto, 11/11/2026: "o número tem
 * de ser GRAVADO no formato que o canal usa, não no formato solto"). É o formato em que o WhatsApp entrega e recebe o número: o DDI 55, o DDD
 * e o assinante, com o CELULAR SEM o nono dígito. Medido em produção em 11/11/2026: o remetente gravado `51999114290` chega pelo webhook como
 * `555199114290`, e é para esse que as respostas vão. O fixo fica como é (55 + DDD + 8).
 *
 * RESSALVA DE MEDIÇÃO, e ela é a razão de a comparação não depender disto: a medição tem UM número, de UM DDD (51). Que o WhatsApp tire o nono
 * em TODO DDD não foi medido — há relato de que nos DDDs 11 a 28 ele o mantém. Por isso quem COMPARA continua comparando pela forma
 * normalizada (`telefonesCasam`, a rota de entrada), e quem ENVIA continua com as variantes como rede de segurança (`normalizePhoneBR`): um
 * DDD em que o canal mantenha o nono não perde a autorização nem o envio; só grava no formato medido, até alguém medir outro.
 *
 * Entra a forma NORMALIZADA (`telefoneNormalizado`); o que não for telefone é NULL.
 */
export function telefoneNoFormatoDoCanal(bruto: string | null | undefined): string | null {
    const n = telefoneNormalizado(bruto)
    if (n === null) return null
    const ddd = n.slice(0, 2)
    const assinante = n.slice(2)
    return `55${ddd}${assinante.length === 9 ? assinante.slice(1) : assinante}`
}

/** Para mostrar: `(51) 9••••-7766` — o DDD e os 4 últimos. */
export function telefoneMascarado(telefone: string): string {
    const d = telefone.replace(/\D/g, '')
    if (d.length < 6) return '••••'
    return `(${d.slice(0, 2)}) ${'•'.repeat(d.length - 6)}-${d.slice(-4)}`
}
