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
 *   - o arremate e a guarnição — a mesma peça: o BZ0006 é "GUARNIÇÃO 65MM - ARREMATE INTERNO" em produção.
 *     "Padrão" quando nada foi escolhido; quando o vendedor escolheu, o que ele escolheu, por extenso e SEM
 *     código de fornecedor ("arremate interno: 20 mm", nunca "BZ0010"). Vale para TODAS as variáveis, a
 *     medida do arremate inclusive (dono do produto, 26/10/2026: "Se o vendedor escolheu, e a escolha muda o
 *     preço, ele não pode confirmar sem ver"). A medida NÃO escolhida fica no "Padrão", sem detalhe: o corte
 *     padrão não interessa ao vendedor conferindo.
 *
 * Portão: `src/utils/__tests__/atendimentos-ia-levantamento-por-nome.test.ts` (17) e
 * `src/utils/__tests__/apanhado.test.ts`.
 */
import { escolhasDescritas, lerEscolhasGravadas, type VariaveisDaTipologia } from '@/lib/atendimentos-ia/escolhas-da-tipologia'
import type { ItemDoLevantamento } from '@/lib/atendimentos-ia/levantamento-em-montagem'

export const CONFERE_O_APANHADO = 'Confere? Responda sim para eu fazer o levantamento com os preços, ou diga o que muda.'

/** A MEDIDA do arremate (o corte): só aparece quando o vendedor a escolheu. */
export const MEDIDAS_DO_ARREMATE = ['MAE', 'MAI'] as const
/** Como o apanhado chama cada variável; a que não está aqui sai pela descrição da aba, em minúscula. */
const NOME_NO_APANHADO: Record<string, string> = { ARI: 'arremate interno', ARE: 'arremate externo', MAE: 'medida do arremate externo', MAI: 'medida do arremate interno' }

const minuscula = (t: string) => t.toLocaleLowerCase('pt-BR')
const milhar = (n: number | null) => (n === null ? '?' : new Intl.NumberFormat('pt-BR').format(n))

/**
 * O rótulo da opção sem o código de fornecedor e sem o valor entre colchetes, em minúscula:
 * "BZ0010 - ARREMATE 20MM" → "20 mm" (para a descrição "ARREMATE INTERNO"); "SEM ARREMATE INTERNO" →
 * "sem arremate interno"; "VÃO+50MM (CORTE 90/90) - PARA AJUSTE EM OBRA [50,00]" → "vão + 50 mm" — o detalhe
 * de corte, depois do primeiro " (" ou " - ", fica no formal. Medido em 26/10/2026 sobre as opções de ARI, ARE
 * e MAE das 161 tipologias da Wolff: todos os rótulos distintos estão em `apanhado.test.ts`.
 */
export function rotuloSemCodigo(rotulo: string, descricao: string): string {
    let t = rotulo.replace(/\s*\[[^\]]*\]/g, '').replace(/^[A-Z]{1,5}\d+[A-Z0-9]*\s*-\s*/, '').trim()
    t = t.split(/\s+\(|\s+-\s+/)[0].trim()
    t = minuscula(t).replace(/(\d)\s*mm\b/g, '$1 mm').replace(/\s*\+\s*/g, ' + ')
    const primeira = minuscula(descricao).split(/\s+/)[0]
    if (primeira && t.startsWith(`${primeira} `) && /\d/.test(t)) t = t.slice(primeira.length + 1)
    return t
}

/** O arremate de uma esquadria, para o pé: "Padrão", ou o que o vendedor escolheu, por extenso. */
export function arremateDoApanhado(tipologia: VariaveisDaTipologia | null, escolhas: unknown): string {
    if (!tipologia) return 'Padrão'
    const descritas = escolhasDescritas(tipologia, lerEscolhasGravadas(escolhas))
    if (!descritas.some((e) => e.doVendedor)) return 'Padrão'
    return descritas
        .filter((e) => e.doVendedor || !(MEDIDAS_DO_ARREMATE as readonly string[]).includes(e.variavel))
        .map((e) => `${NOME_NO_APANHADO[e.variavel] ?? minuscula(e.descricao)}: ${e.doVendedor && e.rotulo ? rotuloSemCodigo(e.rotulo, e.descricao) : 'Padrão'}`)
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
