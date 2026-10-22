/**
 * Atendimentos I.A. — a FORMA NORMALIZADA do telefone brasileiro: DDD + assinante, só dígitos, sem
 * o DDI, com o nono dígito do celular. É a ÚNICA forma usada nos dois lados de toda comparação — o
 * número que o webhook entrega e o do cadastro — e a forma em que a lista de autorizados grava.
 *
 * ══ POR QUE ══
 * Medido em produção em 22/10/2026, nas duas pontas da mesma mensagem: o cadastro tinha 11 dígitos
 * (DDD + 9 + 8) e o webhook entregou 12 (55 + DDD + 8). O WhatsApp entrega o celular brasileiro SEM
 * o nono dígito — é o padrão dele, não exceção —, e a mensagem de um funcionário cadastrado caía em
 * `orcamentista_tentativa_desconhecida`.
 *
 * ══ A REGRA, decidida pelo dono do produto ══
 *   1. só os dígitos;
 *   2. com 12 ou 13 dígitos começando por 55, tira o 55 (o DDI). Com 10 ou 11 o 55 é o DDD de
 *      Santa Maria, e fica;
 *   3. sobra DDD (os 2 primeiros) + assinante (o resto);
 *   4. assinante de 8 começando por 6, 7, 8 ou 9 — celular sem o nono — ganha o 9 na frente;
 *      assinante de 8 começando por 2, 3, 4 ou 5 — fixo — fica como está: o 9 NÃO é inventado;
 *      assinante de 9 COMEÇANDO COM 9 — o celular com o nono — fica como está; de 9 começando com
 *      qualquer outro dígito é NULL: aceitá-lo enquanto o de 8 começando com 0 é recusado seria a
 *      mesma frouxidão com critérios diferentes — e o americano "12025550123" viraria DDD "12";
 *   5. qualquer outra coisa — inclusive número que não é brasileiro — é NULL, e NULL não casa com
 *      nada: não se compara o que não se sabe ler.
 *
 * Função pura. Portão: `src/utils/__tests__/atendimentos-ia-telefone-normalizado.test.ts`.
 */

const CELULAR_SEM_O_NONO = /^[6-9]\d{7}$/
const FIXO = /^[2-5]\d{7}$/
const CELULAR_COM_O_NONO = /^9\d{8}$/

export function telefoneNormalizado(bruto: unknown): string | null {
    if (typeof bruto !== 'string') return null
    let digitos = bruto.replace(/\D/g, '')
    if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')) digitos = digitos.slice(2)
    if (digitos.length !== 10 && digitos.length !== 11) return null

    const ddd = digitos.slice(0, 2)
    const assinante = digitos.slice(2)
    if (CELULAR_SEM_O_NONO.test(assinante)) return `${ddd}9${assinante}`
    if (FIXO.test(assinante) || CELULAR_COM_O_NONO.test(assinante)) return `${ddd}${assinante}`
    return null
}
