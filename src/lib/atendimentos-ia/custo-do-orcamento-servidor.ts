/**
 * O CUSTO DO ORÇAMENTO I.A. PELO CAMINHO COMPLETO (o 1b, dono do produto, 09/11/2026): as esquadrias do orçamento passam pelo MESMO
 * cálculo da conversa (`calcularOLevantamento` — a família, o motor, as barras por código, a mão de obra), e o resultado de cada família
 * vira a entrada de `custoDoOrcamento` (o 1a). Um caminho só: a conversa e o orçamento não calculam as barras de dois jeitos.
 *
 * Nada evolui com falta (`Regra_Do_Levantamento_Ao_Produto`): a recusa do levantamento (a frase que o vendedor leria), a família sem etapa
 * de cálculo, o código sem preço, a tipologia sem tempo e o valor do minuto ausente saem nomeados, e nenhum item é custeado.
 *
 * O MODO é o fallback SEM aproveitamento: as barras de cada FAMÍLIA são rateadas entre as esquadrias dela (as barras de uma família não
 * entram na otimização da outra — a mesma regra da conversa).
 */
import { calcularOLevantamento, mensagemDoCalculo, type EsquadriaGravada, type FamiliasDaEmpresa } from './levantamento-da-conversa'
import { custoDoOrcamento, valorDoMinuto, PERCENTUAIS, type CustoDoItem, type MaterialDaTabela, type Percentuais } from './custo-do-orcamento'
import type { ItemDaTabela } from './levantamento-de-barras'

/** O valor do minuto e a configuração da empresa de onde ele saiu — o mesmo par que a precificação final usa. */
export type MaoDeObraDaEmpresa = { custoMensal: number; minutosDaEmpresa: number; valorDoMinuto: number }
export type CustoDoLevantamento =
    | { ok: true; itens: CustoDoItem[]; maoDeObra: MaoDeObraDaEmpresa }
    | { ok: false; recusas: string[] }

export const fraseDaFamiliaSemCalculo = (rotulo: string) =>
    `a etapa de cálculo da família ${rotulo}: sem ela as barras e a mão de obra não saem, e o orçamento não tem custo`

const numeroOuNulo = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
/** O item da tabela como o custo o lê: o bloco pelos nomes da tabela; o que não veio é nulo, nunca 0. */
export function materialDoItem(i: ItemDaTabela): MaterialDaTabela {
    const bloco = Object.fromEntries(PERCENTUAIS.map((p) => [p, numeroOuNulo((i as Record<string, unknown>)[p])])) as Percentuais
    return {
        codigo: i.codigo, descricao: i.descricao ?? null, unidade: i.unidade ?? null,
        medida_barra_m: numeroOuNulo(i.medida_barra_m), valor_barra_interno: numeroOuNulo(i.valor_barra_interno), bloco,
    }
}

/**
 * O custo de cada esquadria de `lev`, na ordem de `lev.itens`, ou as recusas. `itens` do resultado tem o mesmo comprimento e a mesma
 * ordem de `lev.itens`.
 */
export async function custoDoLevantamento(tenantId: string, fonte: FamiliasDaEmpresa, lev: { nome: string; itens: EsquadriaGravada[] }): Promise<CustoDoLevantamento> {
    const c = await calcularOLevantamento(tenantId, fonte, lev)
    if ('recusa' in c) return { ok: false, recusas: [c.recusa.texto] }
    const mensagem = mensagemDoCalculo(c)
    if (mensagem.desfecho !== 'levantou') return { ok: false, recusas: [mensagem.texto] }

    const porItem: Array<CustoDoItem | undefined> = new Array(lev.itens.length)
    const recusas: string[] = []
    let maoDeObra: MaoDeObraDaEmpresa | null = null
    c.grupos.forEach((g, k) => {
        const calculo = c.calculos[k]
        if ('semCalculo' in calculo) { recusas.push(fraseDaFamiliaSemCalculo(g.familia.rotulo)); return }
        if ('faltas' in calculo) { recusas.push(...calculo.faltas); return }
        // o valor do minuto é da EMPRESA (o mesmo em toda mão de obra que fechou); sem nenhuma que fechou, não há valor
        const fechada = calculo.maos.find((m): m is Extract<typeof m, { ok: true }> => 'custoMensal' in m)
        const valor = fechada ? valorDoMinuto(fechada.custoMensal, fechada.minutosDaEmpresa) : null
        if (fechada && valor !== null) maoDeObra = { custoMensal: fechada.custoMensal, minutosDaEmpresa: fechada.minutosDaEmpresa, valorDoMinuto: valor }
        const materiais: Record<string, MaterialDaTabela> = {}
        // o mesmo código em duas tabelas já é recusa do cálculo (ITEM_EM_DUAS_LINHAS): o primeiro basta
        for (const i of calculo.itens) if (!materiais[i.codigo]) materiais[i.codigo] = materialDoItem(i)
        const r = custoDoOrcamento({
            itens: calculo.r.esquadrias.map((e, j) => {
                const m = calculo.maos[j]
                return {
                    referencia: `a esquadria ${calculo.d.esquadrias[j].numero} (${e.tipologia})`,
                    minutos: m && 'minutosPorUnidade' in m ? m.minutosPorUnidade * m.quantidade : null,
                    pecas: e.pecas.map((p) => ({ codigo: p.codigo, comprimento_mm: p.comprimento_mm, quantidade: p.quantidade })),
                }
            }),
            barras_por_codigo: calculo.r.total.barras_por_codigo,
            materiais,
            valor_minuto: valor,
        })
        if ('recusas' in r) { recusas.push(...r.recusas); return }
        r.itens.forEach((it, j) => { porItem[g.indices[j]] = it })
    })
    if (recusas.length) return { ok: false, recusas }
    if (maoDeObra === null || porItem.some((i) => i === undefined)) return { ok: false, recusas: ['o custo de todas as esquadrias: alguma ficou sem cálculo'] }
    return { ok: true, itens: porItem as CustoDoItem[], maoDeObra }
}
