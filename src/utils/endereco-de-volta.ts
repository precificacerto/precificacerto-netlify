/**
 * endereco-de-volta.ts — o "voltar" que devolve a lista COM os filtros.
 *
 * POR QUE NÃO `router.back()` CRU
 * --------------------------------
 * Ele depende do histórico do navegador ter a URL com os parâmetros, e há dois caminhos em
 * que não tem: a ficha aberta por link colado (nova aba, WhatsApp, favorito) e a ficha
 * aberta depois de um `router.replace` que substituiu a entrada. Nos dois, `back()` sai do
 * app ou cai numa lista sem filtro — e o usuário que filtrou "em atraso há mais de 90 dias"
 * perde o trabalho sem entender por quê.
 *
 * O MECANISMO É LEVAR O ENDEREÇO JUNTO. O link para a ficha carrega `?de=<querystring da
 * lista, codificada>`, e o botão Voltar reconstrói `/clientes?<de>`. Determinístico,
 * funciona em aba nova, e não depende de histórico nenhum.
 *
 * `de` É ENDEREÇO, NÃO FILTRO, e por isso ele pode ser opaco enquanto os filtros não podem.
 * Ninguém edita um endereço de volta à mão; os filtros, sim — é a razão de eles serem
 * parâmetros separados e legíveis (`filtros-de-cobranca.ts`). Misturar os dois critérios
 * seria aplicar a regra de um ao outro.
 *
 * E ele é SANEADO na leitura: só a query sai, nunca um host. Um `de` apontando para fora
 * viraria redirecionamento aberto, e o botão Voltar é exatamente onde ninguém olharia.
 */

/** O nome do parâmetro, exportado para que o portão não dependa de string solta. */
export const PARAM_DE_VOLTA = 'de'

type ValorDaQuery = string | string[] | undefined

/** Serializa a query atual da lista para viajar como UM parâmetro. */
export function enderecoDeVolta(query: Record<string, ValorDaQuery>): string {
    const p = new URLSearchParams()
    for (const [chave, valor] of Object.entries(query)) {
        if (chave === PARAM_DE_VOLTA) continue
        if (valor === undefined) continue
        for (const v of Array.isArray(valor) ? valor : [valor]) p.append(chave, v)
    }
    return p.toString()
}

/**
 * Lê o endereço de volta como objeto de query.
 *
 * Qualquer coisa que não seja uma querystring simples vira `{}` — e a lista abre sem filtro,
 * que é o pior caso aceitável. Caractere de caminho (`/`), esquema (`:`) ou `?` adicional
 * descartam o valor inteiro: é um endereço de volta, não uma URL.
 */
export function lerEnderecoDeVolta(valor: ValorDaQuery): Record<string, string> {
    const texto = (Array.isArray(valor) ? valor[0] : valor) ?? ''
    if (texto === '' || /[/:?#]/.test(texto)) return {}
    const saida: Record<string, string> = {}
    for (const [chave, v] of new URLSearchParams(texto)) saida[chave] = v
    return saida
}
