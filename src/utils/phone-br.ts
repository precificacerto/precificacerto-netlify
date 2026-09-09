/**
 * phone-br.ts — a máscara e a validação de telefone brasileiro, em UM LUGAR SÓ.
 *
 * POR QUE EXTRAIR EM VEZ DE COPIAR
 * ---------------------------------
 * A `phoneMask` existia só em `clientes/index.tsx`, e os dois campos de cliente manual —
 * `orcamentos/index.tsx` e `agenda/index.tsx` — eram `<Input placeholder="(00) 00000-0000" />`
 * SEM `onChange`, SEM `maxLength` e SEM validação: um placeholder prometendo um formato que
 * ninguém aplicava.
 *
 * Copiar a função para esses dois lugares seria `.claude/rules/copia-divergente.md`, a classe
 * que já custou o #27, o #28 e o #45: o mesmo mapeamento escrito em vários lugares, e a
 * terceira edição corrigindo um e esquecendo os outros. Com um módulo só, mudar a regra vale
 * para todas as telas e a omissão deixa de ser possível.
 *
 * O QUE ISSO CORRIGE, MEDIDO EM 08/09/2026
 * ----------------------------------------
 * O cliente GERONIMO foi gravado com `51999999999999999999999` — VINTE E TRÊS dígitos. Na base
 * inteira, 63 dos 79 telefones em `customers.phone` têm MENOS DE 10 dígitos (`54194`, `34530`,
 * `5555`) e 11 têm caracteres não numéricos. O campo aceitava qualquer coisa.
 *
 * ONZE DÍGITOS, SEM DDI — E ISSO NÃO É ARBITRÁRIO
 * -----------------------------------------------
 * O envio de WhatsApp ACRESCENTA o `55` sozinho quando o número tem até 11 dígitos e não começa
 * com ele (`normalizePhoneBR` em `api/whatsapp/send-reminder.ts`, `getClientPhone` em
 * `conectividade`). Guardar DDD + número é o formato que aquelas rotas esperam — gravar com DDI
 * faria o número passar pelo ramo errado da normalização.
 *
 * Por isso o texto de ajuda do cadastro, que pedia "DDI + DDD + Número (ex: 5551999990000)",
 * estava errado desde sempre: a máscara corta em 11 e o envio completa o resto. Os dados
 * confirmam quem manda — `whatsapp_phone` tem no máximo 11 caracteres na base inteira.
 */

/** Só os dígitos, no limite de um telefone brasileiro sem DDI. */
export function onlyPhoneDigits(value: string): string {
    return (value || '').replace(/\D/g, '').slice(0, MAX_PHONE_DIGITS)
}

/** DDD (2) + celular (9). Fixo tem 8 e cabe no mesmo limite. */
export const MAX_PHONE_DIGITS = 11
/** Fixo: DDD + 8 dígitos. Abaixo disso não é telefone. */
export const MIN_PHONE_DIGITS = 10
/** Comprimento máximo do texto MASCARADO — `(51) 99999-9999`. */
export const MAX_PHONE_MASKED_LENGTH = 15

/**
 * Formata progressivamente enquanto se digita: `(51`, `(51) 99999`, `(51) 99999-9999`.
 *
 * Idempotente sobre a própria saída — reaplicar não corrompe, que é o que permite usá-la no
 * `onChange` sem guardar estado.
 */
export function phoneMask(value: string): string {
    const digits = onlyPhoneDigits(value)
    if (digits.length <= 2) return digits.length ? `(${digits}` : ''
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

/**
 * `true` quando o valor tem quantidade de dígitos de telefone brasileiro.
 *
 * Não valida DDD nem operadora de propósito: a máscara já limita o formato, e recusar um DDD
 * legítimo por lista desatualizada é pior que aceitar um improvável. O que se recusa aqui é o
 * que não é telefone — `5555`, `34530`, ou os 23 dígitos do GERONIMO.
 */
export function isValidPhoneBR(value?: string | null): boolean {
    const n = onlyPhoneDigits(value || '').length
    return n >= MIN_PHONE_DIGITS && n <= MAX_PHONE_DIGITS
}

/** A mensagem única de erro, para as três telas dizerem a mesma coisa. */
export const PHONE_ERROR_MESSAGE = 'Telefone inválido. Informe DDD + número, ex: (51) 99999-9999.'

/**
 * Regra do antd para um campo de telefone OBRIGATÓRIO.
 *
 * Campo vazio e campo malformado dão mensagens DIFERENTES: "informe" e "está errado" são
 * afirmações distintas, e juntá-las esconderia qual das duas é o caso.
 */
export function phoneRules(requiredMessage: string) {
    return [
        { required: true, message: requiredMessage },
        {
            validator: (_: unknown, value: string) =>
                !value || isValidPhoneBR(value)
                    ? Promise.resolve()
                    : Promise.reject(new Error(PHONE_ERROR_MESSAGE)),
        },
    ]
}
