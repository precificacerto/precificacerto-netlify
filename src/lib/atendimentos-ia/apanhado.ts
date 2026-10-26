/**
 * O APANHADO — a primeira resposta a uma solicitação (dono do produto, 26/10/2026). Função pura.
 *
 * "O APANHADO NÃO TRAZ PREÇO." O bloco técnico (barras por código, aproveitamento, perfis por barra inteira e
 * por consumo real, a diferença, a mão de obra, os dois totais e o que o preço cobre) é o resultado do
 * LEVANTAMENTO FORMAL, que só vem depois do "sim" do vendedor. "O primeiro contato é conversa, não orçamento."
 *
 * O FORMATO, um só ("um formato só, que o vendedor aprende uma vez"):
 *   - INDIVIDUAL, uma linha por esquadria: tipologia, quantidade, largura, altura e vidro;
 *   - COMUM, no PÉ, SEMPRE — mesmo com uma esquadria: a cor do perfil, o arremate e a guarnição. O que é
 *     igual em todas sai uma vez; o que difere sai por esquadria, no próprio pé;
 *   - o arremate: "Padrão" quando nada foi escolhido; quando o vendedor escolheu, o nome por extenso, SEM
 *     código de fornecedor ("arremate interno: 20 mm", nunca "BZ0010"). A MEDIDA do arremate (o corte) não
 *     aparece: "é detalhe de corte, não interessa ao vendedor conferindo" — por isso só ARI e ARE.
 *
 * Portão: `src/utils/__tests__/atendimentos-ia-levantamento-por-nome.test.ts` (17) e
 * `src/utils/__tests__/apanhado.test.ts`.
 */
import { escolhasDescritas, lerEscolhasGravadas, type VariaveisDaTipologia } from '@/lib/atendimentos-ia/escolhas-da-tipologia'
import type { ItemDoLevantamento } from '@/lib/atendimentos-ia/levantamento-em-montagem'

export const CONFERE_O_APANHADO = 'Confere? Responda sim para eu fazer o levantamento com os preços, ou diga o que muda.'

/** As variáveis do arremate que o apanhado mostra. MAE e MAI (a medida, o corte) ficam de fora, por decisão. */
export const ARREMATE_NO_APANHADO = ['ARI', 'ARE'] as const

const minuscula = (t: string) => t.toLocaleLowerCase('pt-BR')
const milhar = (n: number | null) => (n === null ? '?' : new Intl.NumberFormat('pt-BR').format(n))

/**
 * O rótulo da opção sem o código de fornecedor e sem o valor entre colchetes, em minúscula:
 * "BZ0010 - ARREMATE 20MM" → "20 mm" (para a descrição "ARREMATE INTERNO"); "SEM ARREMATE INTERNO" →
 * "sem arremate interno". Medido em 26/10/2026 sobre as opções de ARI e ARE das 161 tipologias da Wolff:
 * cinco rótulos distintos, todos neste molde.
 */
export function rotuloSemCodigo(rotulo: string, descricao: string): string {
    let t = rotulo.replace(/\s*\[[^\]]*\]/g, '').replace(/^[A-Z]{1,5}\d+[A-Z0-9]*\s*-\s*/, '').trim()
    t = minuscula(t).replace(/(\d)\s*mm\b/g, '$1 mm')
    const primeira = minuscula(descricao).split(/\s+/)[0]
    if (primeira && t.startsWith(`${primeira} `) && /\d/.test(t)) t = t.slice(primeira.length + 1)
    return t
}

/** O arremate de uma esquadria, para o pé: "Padrão", ou o que o vendedor escolheu, por extenso. */
export function arremateDoApanhado(tipologia: VariaveisDaTipologia | null, escolhas: unknown): string {
    if (!tipologia) return 'Padrão'
    const descritas = escolhasDescritas(tipologia, lerEscolhasGravadas(escolhas))
        .filter((e) => (ARREMATE_NO_APANHADO as readonly string[]).includes(e.variavel))
    if (!descritas.some((e) => e.doVendedor)) return 'Padrão'
    return descritas
        .map((e) => `${minuscula(e.descricao)}: ${e.doVendedor && e.rotulo ? rotuloSemCodigo(e.rotulo, e.descricao) : 'Padrão'}`)
        .join('; ')
}

/** A linha do pé: o valor uma vez, se é o mesmo em todas as esquadrias; senão, por esquadria. */
function linhaDoPe(rotulo: string, valores: string[]): string {
    const distintos = [...new Set(valores)]
    return distintos.length === 1
        ? `${rotulo}: ${distintos[0]}.`
        : `${rotulo}: ${valores.map((v, i) => `esquadria ${i + 1}, ${v}`).join('; ')}.`
}

export function fraseDoApanhado(
    nome: string,
    itens: readonly ItemDoLevantamento[],
    definicao: (tipologia: string | null) => VariaveisDaTipologia | null,
): string {
    const ordenados = [...itens].sort((a, b) => a.ordem - b.ordem)
    const linhas = ordenados.map((e, k) =>
        `Esquadria ${k + 1}: ${e.tipologia ?? '?'}, ${e.quantidade ?? '?'} unidade(s), ${milhar(e.largura_mm)} x ${milhar(e.altura_mm)} mm, vidro ${e.vidro ?? '?'}.`)
    return [
        `Apanhado do levantamento “${nome}”:`,
        ...linhas,
        '',
        linhaDoPe('Cor do perfil', ordenados.map((e) => e.cor_perfil ?? '?')),
        linhaDoPe('Arremate e guarnição', ordenados.map((e) => arremateDoApanhado(definicao(e.tipologia), e.escolhas))),
        '',
        CONFERE_O_APANHADO,
    ].join('\n')
}
