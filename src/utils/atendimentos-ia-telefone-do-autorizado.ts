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
 * de ser GRAVADO no formato que o canal usa, não no formato solto"). A ORDEM DE AUTORIDADE, decidida pelo dono do produto em 11/11/2026:
 *
 *   (a) O MEDIDO, primeiro: se o número já falou com o canal, o formato é EXATAMENTE o que o webhook entregou — nunca recalculado por regra
 *       (`formatoDoCanal`, com os números que o webhook entregou no tenant);
 *   (b) o PALPITE, só se nunca falou (`palpiteDoFormatoDoCanal`);
 *   (c) depois do primeiro envio ACEITO, o palpite vira medição: a variante que o canal aceitou é persistida e passa a valer por (a)
 *       (`registrarFormatoMedido`, em `src/lib/atendimentos-ia/telefone-medido.ts`).
 *
 * As variantes do envio (`normalizePhoneBR`) continuam como REDE, não como mecanismo. A COMPARAÇÃO continua pela forma normalizada.
 */
export type FormatoDoCanal = { telefone: string; origem: 'medido' | 'palpite' }

/**
 * (b) O PALPITE — e é PALPITE, não regra medida. Fonte: a regra documentada por vários provedores de integração com o WhatsApp, trazida pelo
 * dono do produto em 11/11/2026: nos DDDs ATÉ 30 o WhatsApp MANTÉM o nono dígito do celular no identificador; nos DDDs 31 EM DIANTE, o
 * DESCARTA. As mesmas fontes dizem que há EXCEÇÃO e que o caminho confiável é perguntar ao canal — por isso o palpite só vale enquanto o número
 * nunca falou e nunca recebeu (a e c).
 *
 * MEDIÇÃO PRÓPRIA, registrada como tal: UM número, de UM DDD — o remetente da De Paula, `51999114290`, que o webhook de produção entregou como
 * `555199114290` (11/11/2026). Concorda com o palpite (51 ≥ 31, descarta). Um número não é amostra: nenhum DDD até 30 foi medido.
 *
 * O fixo fica como é (55 + DDD + 8). O que não for telefone é NULL.
 */
export function palpiteDoFormatoDoCanal(bruto: string | null | undefined): string | null {
    const n = telefoneNormalizado(bruto)
    if (n === null) return null
    const ddd = n.slice(0, 2)
    const assinante = n.slice(2)
    const descartaONono = assinante.length === 9 && Number(ddd) >= 31
    return `55${ddd}${descartaONono ? assinante.slice(1) : assinante}`
}

/**
 * O formato a GRAVAR: (a) o número que o WEBHOOK entregou para este telefone, se algum dos `entregues` casa com ele (o primeiro que casar,
 * exatamente como veio, só dígitos); senão, (b) o palpite. NULL quando a entrada não é telefone.
 */
export function formatoDoCanal(bruto: string | null | undefined, entregues: readonly string[]): FormatoDoCanal | null {
    if (telefoneNormalizado(bruto) === null) return null
    const medido = entregues.find((e) => /^\d{10,13}$/.test(e) && telefonesCasam(e, bruto))
    if (medido) return { telefone: medido, origem: 'medido' }
    const palpite = palpiteDoFormatoDoCanal(bruto)
    return palpite === null ? null : { telefone: palpite, origem: 'palpite' }
}

/** Para mostrar: `(51) 9••••-7766` — o DDD e os 4 últimos. */
export function telefoneMascarado(telefone: string): string {
    const d = telefone.replace(/\D/g, '')
    if (d.length < 6) return '••••'
    return `(${d.slice(0, 2)}) ${'•'.repeat(d.length - 6)}-${d.slice(-4)}`
}
