/**
 * A TIPOLOGIA PADRÃO NO CÓDIGO, NÃO NO MODELO (dono do produto, 05/11/2026):
 *
 * > "correr sem folhas ditas = 2 folhas; porta sem informação = 2 folhas. Só pergunte quando o vendedor indicar algo fora do padrão
 * > (3 folhas, bandeira fixa, divisões)."
 *
 * O caso que originou (Maria Cristina, 05/11): "1 Porta janelas de correr 2 folhas…" e a regra do prompt "se cabe em mais de uma, não
 * preencha: pergunte" — as 12 portas de correr de 2 folhas da De Paula (lisa, trilho PVC, trilho alumínio, veneziana, bandeira, persiana…)
 * são candidatas iguais para o modelo, e ele pergunta o que o padrão já responde.
 *
 * A regra, por esquadria sem tipologia depois da proposta do modelo:
 *   - a ABERTURA é a palavra do vendedor para a esquadria (`aplicarProposta` a devolve por ordem); sem ela, não há padrão;
 *   - os TRECHOS da esquadria são os do acumulado com aquela abertura; o TIPO dito neles tem de ser só "correr" — porta sem tipo nenhum
 *     também é de correr (o padrão da porta); janela sem tipo não tem padrão (pode ser maxim-ar, de abrir…);
 *   - FOLHAS ditas diferentes de 2, ou qualquer palavra FORA DO PADRÃO (persiana, veneziana, bandeira, peitoril, trilho, embutido, alumínio,
 *     tela, módulo, divisão, fixo, vidro duplo), tiram o padrão: aí o modelo pergunta, como antes;
 *   - a candidata é a ÚNICA do motor cuja descrição, sem a linha, é "PORTA DE CORRER 02 FOLHAS MÓVEIS" ou "JANELA DE CORRER 02 FOLHAS
 *     MÓVEIS" lisa (De Paula: DP-39 e DP-02). Duas ou nenhuma (duas linhas de produto, por exemplo) → sem padrão, o modelo pergunta;
 *   - a medida dita tem de caber nos limites da candidata (`cabeNosLimites`); fora deles, sem padrão — nunca "a mais próxima".
 * A família e o motor seguem o caminho de sempre (`resolverFamilias`); a validação da tipologia proposta pelo modelo não muda.
 *
 * O PADRÃO DA MAXIM-AR (dono do produto, 05/11/2026): "DP-01 (linha DESIGN), que é o modelo mais usado." A janela cujo trecho diz SÓ o
 * tipo maxim-ar, sem nada fora do padrão (persiana, bandeira, peitoril, tela, módulos, travessa, coluna, fixo, outro tipo…) e sem mais de
 * uma folha, é a DP-01 — se a DP-01 está no motor da empresa e a medida cabe nos limites dela. O código é o que o dono do produto nomeou;
 * o motor que não o tiver não tem padrão de maxim-ar (nunca "a maxim-ar mais parecida"). A janela sem tipo continua sem padrão.
 */
import type { CandidatoDeTipologia } from '@/lib/atendimentos-ia/levantamento-da-conversa'
import type { ItemDoLevantamento } from '@/lib/atendimentos-ia/levantamento-em-montagem'
import { cabeNosLimites, descricaoNoPrompt, type Abertura, type TrechoDoAcumulado } from '@/lib/atendimentos-ia/tipologias-candidatas'

const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** O que tira a esquadria do padrão: qualquer uma destas palavras no trecho dela. */
export const FORA_DO_PADRAO = /\b(persianas?|venezianas?|bandeiras?|peitoril|peitoris|trilhos?|embutid\w*|alumini\w*|telas?|modulos?|divis\w*|fix[oa]s?|vidro duplo|pivotante|oscilo\w*|basculante|projetante|abrir|giro|maxim\w*|guilhotina|camar[ao]o|sanfona\w*)\b/

/**
 * O que tira a MAXIM-AR do padrão: as variantes do motor (bandeira, peitoril, módulos, travessa, coluna…) e qualquer outro tipo dito no
 * trecho. "maxim" não está aqui: é o tipo do padrão.
 */
export const FORA_DA_MAXIM_AR = /\b(persianas?|venezianas?|bandeiras?|peitoril|peitoris|trilhos?|embutid\w*|alumini\w*|telas?|modul\w*|travessas?|vertica\w*|colunas?|divis\w*|fix[oa]s?|vidro duplo|pivotante|oscilo\w*|basculante|projetante|abrir|giro|correr|guilhotina|camar[ao]o|sanfona\w*)\b/

/** O código da maxim-ar padrão, nomeado pelo dono do produto em 05/11/2026 (linha DESIGN). */
export const PADRAO_DA_MAXIM_AR = 'DP-01'

const NUMEROS: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6 }
/** As folhas (ou caixilhos — "o vendedor fala em caixilho para folha") ditas no trecho: o número, ou null quando não há. */
export function folhasDitas(texto: string): number | null {
    const m = /\b(\d+|uma?|duas|dois|tres|quatro|cinco|seis)\s+(folhas?|caixilhos?)\b/.exec(semAcento(texto))
    if (!m) return null
    return /^\d+$/.test(m[1]) ? Number(m[1]) : NUMEROS[m[1]] ?? null
}

/** A descrição LISA da esquadria padrão de cada abertura: de correr, 2 folhas móveis, e mais nada além da linha. */
const DESCRICAO_PADRAO: Record<Abertura, RegExp> = {
    porta: /^porta de correr 0?2 folhas moveis$/,
    janela: /^janela de correr 0?2 folhas moveis$/,
}

export type DecisaoDoPadrao = { tipologia: string } | { motivo: 'SEM_ABERTURA' | 'SEM_TRECHO' | 'TIPO_NAO_E_CORRER' | 'JANELA_SEM_TIPO' | 'FOLHAS_DITAS' | 'FORA_DO_PADRAO' | 'CANDIDATAS' | 'LIMITES' }

/** A tipologia padrão da esquadria, ou o motivo de não haver. */
export function tipologiaPadrao(item: ItemDoLevantamento, abertura: Abertura | null, trechos: readonly TrechoDoAcumulado[], candidatos: readonly CandidatoDeTipologia[]): DecisaoDoPadrao {
    if (abertura === null) return { motivo: 'SEM_ABERTURA' }
    const dela = trechos.filter((t) => t.abertura === abertura)
    if (dela.length === 0) return { motivo: 'SEM_TRECHO' }
    const tipos = new Set(dela.flatMap((t) => [...t.tipos]))
    const maximAr = [...tipos].some((t) => /maxim/.test(semAcento(t)))
    if (maximAr && abertura === 'janela' && tipos.size === 1) return padraoDaMaximAr(item, dela, candidatos)
    const correr = [...tipos].some((t) => /correr/.test(semAcento(t)))
    if (tipos.size > 0 && (!correr || tipos.size > 1)) return { motivo: 'TIPO_NAO_E_CORRER' }
    if (abertura === 'janela' && !correr) return { motivo: 'JANELA_SEM_TIPO' }
    const folhas = dela.map((t) => folhasDitas(t.texto)).filter((n): n is number => n !== null)
    if (folhas.some((n) => n !== 2)) return { motivo: 'FOLHAS_DITAS' }
    if (dela.some((t) => FORA_DO_PADRAO.test(semAcento(t.texto)))) return { motivo: 'FORA_DO_PADRAO' }
    const lisas = candidatos.filter((c) => DESCRICAO_PADRAO[abertura].test(semAcento(descricaoNoPrompt(c.descricao, c.linha) ?? '').trim()))
    if (lisas.length !== 1) return { motivo: 'CANDIDATAS' }
    if (!cabeNosLimites(lisas[0], item)) return { motivo: 'LIMITES' }
    return { tipologia: lisas[0].tipologia }
}

/** A maxim-ar padrão (DP-01), ou o motivo de não haver — o trecho já é de janela e só diz o tipo maxim-ar. */
function padraoDaMaximAr(item: ItemDoLevantamento, dela: readonly TrechoDoAcumulado[], candidatos: readonly CandidatoDeTipologia[]): DecisaoDoPadrao {
    const folhas = dela.map((t) => folhasDitas(t.texto)).filter((n): n is number => n !== null)
    if (folhas.some((n) => n > 1)) return { motivo: 'FOLHAS_DITAS' }
    if (dela.some((t) => FORA_DA_MAXIM_AR.test(semAcento(t.texto)))) return { motivo: 'FORA_DO_PADRAO' }
    const dp01 = candidatos.filter((c) => c.tipologia === PADRAO_DA_MAXIM_AR)
    if (dp01.length === 0) return { motivo: 'CANDIDATAS' }
    if (!dp01.some((c) => cabeNosLimites(c, item))) return { motivo: 'LIMITES' }
    return { tipologia: PADRAO_DA_MAXIM_AR }
}
