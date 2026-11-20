/**
 * O APANHADO — a COLETA (vocabulário do dono do produto, 06/11/2026): as perguntas e respostas pelas quais o agente reúne o levantamento. Função pura.
 *
 * A MENSAGEM-RESUMO em texto do fim da coleta ("Apanhado do levantamento X: Esquadria 1: ... Confere?") SAIU em 06/11/2026: no lugar dela vai o
 * ARQUIVO do levantamento (`folha-do-levantamento.ts`, `arquivo-do-levantamento.ts`), e a confirmação é sobre ele. O que ficou aqui é o
 * formatador que a folha usa, por extenso e sem código de fornecedor (dono do produto, 26/10/2026):
 *   - o arremate e a guarnição: O QUE O CÁLCULO USA, variável por variável — a opção que o vendedor escolheu ou, sem resposta, o PADRÃO DO MOTOR
 *     da tipologia, sempre por extenso ("arremate interno: 65 mm", nunca "BZ0006" nem a palavra "Padrão", que não diz o que se calcula). Dono do
 *     produto, 07/11/2026: "Enquanto o cálculo usar o padrão do motor [...], a folha tem de mostrar O QUE O CÁLCULO USA." O padrão da empresa
 *     escrito na instrução da categoria Acabamentos (INSTALACAO) NÃO entra aqui: é prosa para o agente, e ler número dela para decidir dinheiro
 *     está proibido até a categoria ter campos estruturados (PR de cálculo próprio);
 *
 * Portão: `src/utils/__tests__/apanhado.test.ts`.
 */
import { escolhasDescritas, lerEscolhasGravadas, nomeDaVariavel, paraOAgente, type VariaveisDaTipologia } from '@/lib/atendimentos-ia/escolhas-da-tipologia'
import { traduzirPolitica, type PoliticaDaEmpresa } from '@/lib/atendimentos-ia/politica-da-empresa'


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

/**
 * O arremate de uma esquadria, como vai valer: cada variável de arremate que a tipologia pede, com a opção que o VENDEDOR disse ou, sem ela, a da
 * POLÍTICA DA EMPRESA (20/11/2026: a etapa 1 não lê o Padrão do motor — `paraOAgente`), por extenso e sem código de fornecedor. A política que diz
 * "não usa" sai como "não usa"; o que nem o vendedor nem a política definem sai como tal — o cálculo não põe peça que ninguém pediu
 * (`fronteira-das-escolhas.ts`). Nula quando não há o que dizer: sem a aba Variáveis da tipologia, ou tipologia sem variável de arremate.
 */
export const ARREMATE_NAO_DEFINIDO = 'não definido (o cálculo não põe peça que ninguém pediu)'
export function arremateDaColeta(tipologia: VariaveisDaTipologia | null, escolhas: unknown, politica: PoliticaDaEmpresa = {}, codigo = ''): string | null {
    if (!tipologia) return null
    // a aba sem o Padrão, também quando quem chama tem a completa (o documento): o que vai valer nunca é o padrão do motor
    tipologia = paraOAgente(tipologia)
    const ditas = lerEscolhasGravadas(escolhas)
    const daPolitica: Record<string, number> = {}
    const naoUsa = new Set<string>()
    for (const v of tipologia.variaveis) {
        if (ditas[v.variavel] !== undefined) continue
        const t = traduzirPolitica(codigo, v, politica)
        if (t && 'valor' in t) daPolitica[v.variavel] = t.valor
        else if (t && 'semAPeca' in t) naoUsa.add(v.variavel)
    }
    // a que depende de uma peça que a política diz que não usa (a medida do arremate externo, sem arremate externo) não entra: não haverá o que medir
    const condicaoDe = (variavel: string) => (tipologia as VariaveisDaTipologia).variaveis.find((v) => v.variavel === variavel)?.condicao ?? ''
    const dependeDoQueNaoUsa = (variavel: string) => [...naoUsa].some((n) => new RegExp(`\\b${n}\\b`).test(condicaoDe(variavel)))
    const descritas = escolhasDescritas(tipologia, { ...daPolitica, ...ditas }).filter((e) => !dependeDoQueNaoUsa(e.variavel))
    if (!descritas.length) return null
    return descritas
        .map((e) => {
            const temValor = ditas[e.variavel] !== undefined || daPolitica[e.variavel] !== undefined
            const valor = e.rotulo ? rotuloSemCodigo(e.rotulo, e.descricao) : temValor ? 'opção fora da lista do motor' : naoUsa.has(e.variavel) ? 'não usa' : ARREMATE_NAO_DEFINIDO
            return `${nomeDaVariavel(e.variavel, e.descricao)}: ${valor}`
        })
        .join('; ')
}
