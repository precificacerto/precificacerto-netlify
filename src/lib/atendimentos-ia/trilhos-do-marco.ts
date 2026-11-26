/**
 * EM QUANTOS TRILHOS AS FOLHAS CORREM (dono do produto, 25/11/2026; pedido 0025): "No item 12, porta com 6 folhas móveis. [...] Eu presumo que
 * são 3 trilhos, cada trilho possui 2 caixilhos. Mas isso deveria ser informado. A quantidade de folhas em quantos trilhos. Pois eu posso ter 6
 * folhas móveis em 6 trilhos, que elas se tornam independentes, ou 6 folhas móveis em 3 trilhos com fechamento central."
 *
 * O dado está no motor e NÃO se presume: o MARCO da tipologia de correr diz o número de trilhos na descrição da linha da aba Perfis —
 * "MARCO DE CORRER - 3 TRILHOS" (HF112), "MARCO DE CORRER - 2 TRILHOS" (HF88). Medido no motor 259035a9 em 25/11/2026:
 *   - 96 tipologias têm UM marco, com a condição "sempre";
 *   - 15 têm os DOIS, um por opção da variável TM ("TIPO DE MONTAGEM": 1 = marco 02 vias, 2 = marco 03 vias; Padrão 1) — vale o que as condições
 *     do item escolhem, o mesmo que vai para a relação de perfis;
 *   - 15 têm, ALÉM do marco "sempre", linhas com a Obs. "MARCO - … (REFILADO)", pela variável PTM ("PERFIL PARA TRILHO MONOVIA": 1 = HF88 02 vias
 *     refilado; 2 = HF112 03 vias refilado): é o perfil refilado que vira o TRILHO MONOVIA, UM trilho a mais, onde corre a última folha.
 *     CORREÇÃO do dono do produto, 26/11/2026 (pedido 0031): o 0025 dizia que a DP-72 "corre em 3 trilhos qualquer que seja o PTM" — errado. A
 *     DP-73 (porta de correr 4 folhas, 5150 x 2550) é marco de 3 trilhos + a monovia = 4 trilhos, uma folha por trilho. O número da descrição
 *     da linha refilada (2 ou 3) é o do perfil que foi cortado, NÃO conta: a monovia soma UM, quando uma linha refilada vale para o item.
 *
 * O número é lido da DESCRIÇÃO da linha (nunca do código do perfil, que muda de fornecedor para fornecedor). Quando as linhas que valem para o
 * item não dão UM número — nenhuma vale, duas valem com números diferentes, ou a condição não se avalia —, NÃO se escreve trilho nenhum, e o
 * motivo volta nomeado para ser registrado (`faltou-dado-recusa-nomeada.md`). Puro: não lê banco.
 */
import { avaliarTexto } from '@/lib/atendimentos-ia/avaliador-de-formulas'

/**
 * Uma linha de marco de correr da aba Perfis: o número de trilhos que a descrição diz, e a condição em que a linha entra. `monovia` é a linha
 * REFILADA (o trilho monovia): ela não diz os trilhos do marco, soma um.
 */
export type MarcoDeCorrer = { trilhos: number; condicao: string; monovia?: true }
/** Os marcos de uma tipologia, e o Padrão NUMÉRICO das variáveis que as condições deles leem (o mesmo que o cálculo usa sem escolha). */
export type MarcosDaTipologia = { marcos: readonly MarcoDeCorrer[]; padroes: Readonly<Record<string, number>> }
export type TrilhosDoItem = { trilhos: number } | { indeterminado: string }

const DESCRICAO_DO_MARCO = /^MARCO DE CORRER\s*-\s*(\d+)\s+TRILHOS?$/i
const REFILADO = /\bREFILAD[OA]\b/i
const SEMPRE = /^sempre$/i

/** As linhas de perfil de marco de correr: a descrição diz os trilhos; a Obs. que diz REFILADO é o trilho monovia (`monovia: true`). */
export function marcosDeCorrer(perfis: ReadonlyArray<{ descricao: string | null; condicao: string | null; obs?: string | null }>): MarcoDeCorrer[] {
    return perfis.flatMap((p): MarcoDeCorrer[] => {
        const m = DESCRICAO_DO_MARCO.exec((p.descricao ?? '').replace(/\s+/g, ' ').trim())
        if (!m) return []
        const marco: MarcoDeCorrer = { trilhos: Number(m[1]), condicao: (p.condicao ?? '').trim() }
        return [REFILADO.test(p.obs ?? '') ? { ...marco, monovia: true } : marco]
    })
}

/** Os nomes de variável que as condições dos marcos leem ("(TM=1)" → TM), para o leitor buscar só o Padrão delas. */
export function variaveisDasCondicoes(marcos: readonly MarcoDeCorrer[]): string[] {
    return [...new Set(marcos.filter((m) => !SEMPRE.test(m.condicao)).flatMap((m): string[] => m.condicao.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []))].sort()
}

/**
 * Os trilhos de UM item: o número dos marcos cujas condições valem com as escolhas gravadas (inteiros) sobre o Padrão, mais UM quando uma linha
 * refilada (o trilho monovia) vale (pedido 0031). Nulo quando a tipologia não tem marco de correr (não é o caso de dizer trilho). `indeterminado`
 * traz o motivo, para o registro: o número que não fecha não se escreve (pedido 0025), nunca um número errado.
 */
export function trilhosDoItem(daTipologia: MarcosDaTipologia | null | undefined, escolhas: unknown): TrilhosDoItem | null {
    if (!daTipologia || daTipologia.marcos.length === 0) return null
    const valores: Record<string, number> = { ...daTipologia.padroes }
    if (escolhas !== null && typeof escolhas === 'object') {
        for (const [nome, v] of Object.entries(escolhas as Record<string, unknown>)) if (typeof v === 'number' && Number.isInteger(v)) valores[nome] = v
    }
    const vale = (marco: MarcoDeCorrer): boolean | string => {
        if (SEMPRE.test(marco.condicao)) return true
        const r = avaliarTexto(marco.condicao, valores)
        if (!r.ok || typeof r.valor !== 'boolean') return `a condição "${marco.condicao}" ${marco.monovia ? 'do trilho monovia' : 'do marco'} não se avalia com as escolhas do item`
        return r.valor
    }
    const valem = new Set<number>()
    let monovia = false
    for (const marco of daTipologia.marcos) {
        const v = vale(marco)
        if (typeof v === 'string') return { indeterminado: v }
        if (!v) continue
        if (marco.monovia) monovia = true
        else valem.add(marco.trilhos)
    }
    if (valem.size === 1) return { trilhos: [...valem][0] + (monovia ? 1 : 0) }
    if (valem.size === 0 && daTipologia.marcos.every((m) => m.monovia)) return { indeterminado: 'a tipologia tem o trilho monovia e nenhum marco de correr' }
    return { indeterminado: valem.size === 0 ? 'nenhum marco de correr vale para as escolhas do item' : `mais de um marco vale para o item (${[...valem].sort((a, b) => a - b).join(' e ')} trilhos)` }
}
