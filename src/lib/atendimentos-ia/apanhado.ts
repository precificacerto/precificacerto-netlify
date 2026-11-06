/**
 * O APANHADO — a COLETA (vocabulário do dono do produto, 06/11/2026): as perguntas e respostas pelas quais o agente reúne o levantamento. Função pura.
 *
 * A MENSAGEM-RESUMO em texto do fim da coleta ("Apanhado do levantamento X: Esquadria 1: ... Confere?") SAIU em 06/11/2026: no lugar dela vai o
 * ARQUIVO do levantamento (`folha-do-levantamento.ts`, `arquivo-do-levantamento.ts`), e a confirmação é sobre ele. O que ficou aqui é o
 * formatador que a folha usa, por extenso e sem código de fornecedor (dono do produto, 26/10/2026):
 *   - o arremate e a guarnição: "Padrão" quando nada foi escolhido; quando o vendedor escolheu, o que ele escolheu ("arremate interno: 20 mm",
 *     nunca "BZ0010"). A medida NÃO escolhida fica no "Padrão", sem detalhe;
 *
 * Portão: `src/utils/__tests__/apanhado.test.ts`.
 */
import { escolhasDescritas, lerEscolhasGravadas, nomeDaVariavel, type VariaveisDaTipologia } from '@/lib/atendimentos-ia/escolhas-da-tipologia'

/** A MEDIDA do arremate (o corte): só aparece quando o vendedor a escolheu. */
export const MEDIDAS_DO_ARREMATE = ['MAE', 'MAI'] as const

const minuscula = (t: string) => t.toLocaleLowerCase('pt-BR')

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

/** O arremate de uma esquadria: "Padrão", ou o que o vendedor escolheu, por extenso. */
export function arremateDaColeta(tipologia: VariaveisDaTipologia | null, escolhas: unknown): string {
    if (!tipologia) return 'Padrão'
    const descritas = escolhasDescritas(tipologia, lerEscolhasGravadas(escolhas))
    if (!descritas.some((e) => e.doVendedor)) return 'Padrão'
    return descritas
        .filter((e) => e.doVendedor || !(MEDIDAS_DO_ARREMATE as readonly string[]).includes(e.variavel))
        .map((e) => `${nomeDaVariavel(e.variavel, e.descricao)}: ${e.doVendedor && e.rotulo ? rotuloSemCodigo(e.rotulo, e.descricao) : 'Padrão'}`)
        .join('; ')
}
