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

/**
 * `true` quando o valor GRAVADO pode ser exibido como telefone, sem truncar nada.
 *
 * POR QUE NÃO SERVE O `isValidPhoneBR` ACIMA, e a diferença é medida
 * -------------------------------------------------------------------
 * `isValidPhoneBR` conta os dígitos DEPOIS de `onlyPhoneDigits`, que corta em 11. Isso é o
 * certo para o campo do formulário, onde a máscara já limitou a entrada — e é o ERRADO para
 * um valor que veio do banco, gravado antes de a máscara existir. Medido em 15/10/2026:
 *
 *   isValidPhoneBR('51999999999999999999999')  →  true    (23 dígitos, o caso GERONIMO)
 *   isValidPhoneBR('5551999990000')            →  true    (13 dígitos, com DDI)
 *
 * Nos dois a função mede os 11 primeiros e aprova o resto por não olhar. Exibir qualquer um
 * deles seria pior que omitir: `(51) 99999-9999` montado a partir de 23 dígitos é um número
 * PLAUSÍVEL que não é o do cliente, e quem ligar liga para outra pessoa.
 *
 * Na base: `customers.phone` tem 65 de 79 valores fora da faixa (o maior com 23 dígitos) e
 * `customers.whatsapp_phone` tem 13 de 51. Não é caso raro.
 *
 * ESTA FUNÇÃO NÃO SUBSTITUI A OUTRA. `isValidPhoneBR` continua no `phoneRules` do
 * formulário, onde o comportamento dela está correto — mudá-lo ali recusaria uma digitação
 * em andamento.
 */
export function isPhoneBRExibivel(value?: string | null): boolean {
    const digitos = (value || '').replace(/\D/g, '')
    return digitos.length >= MIN_PHONE_DIGITS && digitos.length <= MAX_PHONE_DIGITS
}

/**
 * Formata um telefone JÁ VALIDADO para exibição, respeitando o comprimento.
 *
 * POR QUE NÃO SERVE O `phoneMask` ACIMA, e isto é defeito medido, não preferência
 * ------------------------------------------------------------------------------
 * `phoneMask` sempre quebra no sétimo dígito, porque foi escrita para formatar ENQUANTO SE
 * DIGITA: no caminho até o celular de 11 dígitos, `(51) 33334-444` é um estado intermediário
 * legítimo. Para um valor COMPLETO de 10 dígitos, ele é o formato errado — o fixo é
 * DDD + 4 + 4, e sai `(51) 33334-444` em vez de `(51) 3333-4444`.
 *
 * Medido em 15/10/2026: **5 clientes** têm telefone de 10 dígitos (3 em `phone`, 2 em
 * `whatsapp_phone`) e seriam exibidos assim.
 *
 * **O `phoneMask` NÃO foi alterado**, de propósito: ele está no `onChange` do formulário, e
 * mudar o agrupamento ali mexeria na digitação em andamento — o mesmo motivo pelo qual
 * `isValidPhoneBR` também fica como está. As duas funções moram no MESMO arquivo, uma ao
 * lado da outra, para que a diferença entre "formatar digitando" e "formatar para exibir"
 * fique escrita e não vire uma segunda máscara solta noutro módulo (`copia-divergente.md`).
 */
export function formatarTelefoneExibicao(value: string): string {
    const d = (value || '').replace(/\D/g, '')
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
    return d
}

/**
 * O telefone a EXIBIR: o WhatsApp, caindo para o fixo só quando o fixo for exibível.
 *
 * O predicado vale para os DOIS, não só para o fallback — os 13 `whatsapp_phone` fora da
 * faixa seriam exibidos crus se ele valesse só do lado do `phone`, e "valor inválido não é
 * exibido nem truncado" é afirmação sobre o que aparece na tela, não sobre qual coluna veio.
 *
 * `null` quando nenhum dos dois serve. Travessão é decisão de quem exibe.
 */
export function telefoneExibivel(args: { whatsapp?: string | null; fixo?: string | null }): string | null {
    if (isPhoneBRExibivel(args.whatsapp)) return formatarTelefoneExibicao(args.whatsapp as string)
    if (isPhoneBRExibivel(args.fixo)) return formatarTelefoneExibicao(args.fixo as string)
    return null
}
