/**
 * Atendimentos I.A. — o que é IGUAL em todas as esquadrias vai UMA VEZ nas observações; no item, só o que é diferente dele (dono do produto,
 * 27/11/2026, pedido 0049, "regra do PO, repetida"). Puro: não lê banco nem rede.
 *
 * "Comum" é a parte (um "nome: valor" do acabamento) que TODO item que tem partes traz, com o mesmo texto. O item que não tem a variável (a
 * tipologia sem arremate externo) não desfaz o comum: ele não contradiz nada. A que só alguns itens têm e que difere fica no item.
 */
export function separarComuns(porItem: ReadonlyArray<readonly string[]>): { comuns: string[]; doItem: string[][] } {
    const comItens = porItem.filter((p) => p.length > 0)
    if (comItens.length === 0) return { comuns: [], doItem: porItem.map(() => []) }
    const comuns: string[] = [...new Set(comItens[0])].filter((parte: string) => comItens.every((p) => p.includes(parte)))
    return { comuns, doItem: porItem.map((p) => p.filter((parte) => !comuns.includes(parte))) }
}

/**
 * O TEXTO DIZ O QUE É CALCULADO, não o rótulo da opção (0049, item 2): com `ARREMATE_NA_MEDIDA_DO_VAO = SIM` o cálculo zera o acréscimo do arremate
 * (`ARREMATE_NA_MEDIDA_DO_VAO` do avaliador: ARI, MAE e MAI), e o rótulo "VÃO+50MM (CORTE 90/90)" mentiria. Sai "arremate externo na medida do vão,
 * corte 90/90" — o corte vem do próprio rótulo da opção; sem corte nele, nada é inventado. Nulo quando a variável não é de medida do arremate.
 */
export function medidaDoArremateNaMedidaDoVao(variavel: string, descricao: string, rotulo: string | null): string | null {
    if (variavel !== 'MAE' && variavel !== 'MAI') return null
    const d = descricao.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
    const qual = /EXTERN/.test(d) ? 'externo' : /INTERN/.test(d) ? 'interno' : variavel === 'MAE' ? 'externo' : 'interno'
    const corte = /CORTE\s*(\d+)\s*\/\s*(\d+)/i.exec(rotulo ?? '')
    return `arremate ${qual} na medida do vão${corte ? `, corte ${corte[1]}/${corte[2]}` : ''}`
}
