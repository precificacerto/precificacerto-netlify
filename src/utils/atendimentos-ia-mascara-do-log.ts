/**
 * Atendimentos I.A. — a MÁSCARA do que vai para o log da Vercel, usada pelo caminho do QR do
 * orçamentista (`[QR-ORCAMENTISTA]`) e pela mensagem de erro 4xx da Anthropic na linha `[IA]`
 * (`conversa-da-ia.ts`, com a ANTHROPIC_API_KEY entre os segredos). Nasceu para a rota TEMPORÁRIA de
 * captura do webhook, que foi removida em 22/10/2026, com o formato do webhook já medido.
 *
 *   - toda sequência de 8 ou mais dígitos vira os 4 primeiros + 'x' + os 2 últimos, com o mesmo
 *     comprimento: a estrutura fica visível, o telefone não;
 *   - o valor do campo `token` sai, nos dois formatos (`token=` de form, `"token":` de json), em
 *     qualquer caixa;
 *   - `paraOLog` tira ANTES, pelo valor literal, cada segredo que o chamador conhece — o token da
 *     instância e o de admin —, para que um eco do WUZAPI num campo de outro nome, ou numa
 *     mensagem de erro, não escape da máscara por não se chamar `token`.
 *
 * Funções puras. Portões: `atendimentos-ia-mascara-do-log.test.ts` e
 * `atendimentos-ia-celula-do-orcamentista.test.ts` (14).
 */

/** 8+ dígitos → 4 primeiros + 'x' + 2 últimos, mesmo comprimento; o valor de `token` sai. */
export function mascarar(texto: string): string {
  return texto
    .replace(/\d{8,}/g, (m) => m.slice(0, 4) + 'x'.repeat(m.length - 6) + m.slice(-2))
    .replace(/(token=)[^&\s]*/gi, '$1<mascarado>')
    .replace(/("token"\s*:\s*")[^"]*(")/gi, '$1<mascarado>$2')
}

/** Tira cada segredo conhecido pelo valor, e depois mascara. */
export function paraOLog(texto: string, segredos: Array<string | null | undefined>): string {
  let t = texto
  for (const s of segredos) if (s && s.length >= 4) t = t.split(s).join('<segredo>')
  return mascarar(t)
}
