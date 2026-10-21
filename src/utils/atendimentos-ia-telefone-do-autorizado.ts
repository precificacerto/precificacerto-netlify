/**
 * Atendimentos I.A. — o TELEFONE de quem pode falar com o orçamentista: a forma que se grava em
 * `orcamentista_remetente_autorizado.telefone` e a forma que se mostra.
 *
 * A FORMA GRAVADA É DDD + NÚMERO, SÓ DÍGITOS (10 ou 11), SEM O DDI. É o padrão do repositório
 * (`src/utils/phone-br.ts`: o envio acrescenta o `55` sozinho), e cabe no CHECK da coluna (10 a
 * 13 dígitos). Um número cadastrado COM o DDI (12 ou 13 dígitos começando por `55`) perde o `55`;
 * qualquer outra coisa NÃO é telefone, e não se grava — a tela diz "sem telefone" e o motivo.
 *
 * Função pura: não lê banco nem tela.
 * Portão: `src/utils/__tests__/atendimentos-ia-celula-do-orcamentista.test.ts`.
 */

export type TelefoneDoAutorizado = { ok: true; telefone: string } | { ok: false; motivo: string }

/** O telefone do cadastro do funcionário → a forma que se grava, ou o motivo de não ser telefone. */
export function telefoneDoAutorizado(bruto: string | null | undefined): TelefoneDoAutorizado {
    const texto = (bruto ?? '').trim()
    if (texto === '') return { ok: false, motivo: 'sem telefone no cadastro' }
    let digitos = texto.replace(/\D/g, '')
    if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')) digitos = digitos.slice(2)
    if (digitos.length === 10 || digitos.length === 11) return { ok: true, telefone: digitos }
    return { ok: false, motivo: `o telefone do cadastro ("${texto}") não é um número de 10 ou 11 dígitos com DDD` }
}

/** Para mostrar: `(51) 9••••-7766` — o DDD e os 4 últimos. */
export function telefoneMascarado(telefone: string): string {
    const d = telefone.replace(/\D/g, '')
    if (d.length < 6) return '••••'
    return `(${d.slice(0, 2)}) ${'•'.repeat(d.length - 6)}-${d.slice(-4)}`
}
