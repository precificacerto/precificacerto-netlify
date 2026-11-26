/**
 * TODA FALTA DO ORÇAMENTO DIZ DE QUAL BLOCO É (dono do produto, 26/11/2026, pedido 0032; `REFERENCIA_UNICA.md` §1 do bridge):
 *   - AGENTE: dado do item não definido (a cor, o vidro);
 *   - MOTOR: opção ou medida que a tipologia não aceita, a linha que a condição do motor não fecha;
 *   - FORNECEDOR: código sem preço ou sem a cor na tabela;
 *   - COMERCIAL: perfil do vendedor ou margem não cadastrados.
 * "Assim se sabe onde corrigir."
 *
 * O bloco é do MOTIVO, por uma lista fechada: o motivo que não está nela não ganha bloco (nunca se adivinha), e o teste do portão lista todos os
 * motivos que as faltas do orçamento produzem — motivo novo sem bloco fica vermelho lá. O bloco entra no INÍCIO da frase (`[FORNECEDOR] …`): a
 * mesma frase vai à mensagem ao vendedor, ao arquivo e a `orcamentista_orcamento_falta.frase` — sem coluna nova e sem migração. Puro.
 */
export type BlocoDaFalta = 'AGENTE' | 'MOTOR' | 'FORNECEDOR' | 'COMERCIAL'
export const BLOCOS_DA_FALTA: readonly BlocoDaFalta[] = ['AGENTE', 'MOTOR', 'FORNECEDOR', 'COMERCIAL']

/** Os motivos das faltas do orçamento (os três caminhos: perfil, insumo e vidro), cada um com o seu bloco. */
export const BLOCO_DO_MOTIVO: Readonly<Record<string, BlocoDaFalta>> = {
    // o agente não definiu o dado do item
    SEM_COR: 'AGENTE',
    VIDRO_NAO_DITO: 'AGENTE',
    // a linha do motor que a condição não fecha, e a peça do motor sem descrição
    LINHA_NAO_AVALIADA: 'MOTOR',
    DESCRICAO_DO_MOTOR_AUSENTE: 'MOTOR',
    // a tabela de preço do fornecedor: o código sem preço, sem a cor, ou que não se acha uma vez só
    NAO_ACHADA: 'FORNECEDOR',
    AMBIGUA: 'FORNECEDOR',
    DESCRICAO_NAO_CONCORDA: 'FORNECEDOR',
    COR_FORA_DA_TABELA: 'FORNECEDOR',
    SEM_TABELA_DE_CORES: 'FORNECEDOR',
    REFERENCIA_SEM_A_COR: 'FORNECEDOR',
    PONTE_AMBIGUA: 'FORNECEDOR',
    SEM_MATERIAL: 'FORNECEDOR',
    SEM_VALOR: 'FORNECEDOR',
    VIDRO_AMBIGUO: 'FORNECEDOR',
    VIDRO_SEM_CADASTRO: 'FORNECEDOR',
    VIDRO_CODIGO_FORA_DA_TABELA: 'FORNECEDOR',
    VIDRO_NAO_TRADUZIDO: 'FORNECEDOR',
    VIDRO_PRINCIPAL_AMBIGUO: 'FORNECEDOR',
    BARRA_SEM_COMPRIMENTO: 'FORNECEDOR',

    // AS RECUSAS DO LEVANTAMENTO que chegam ao vendedor como falta ("Não consegui fechar o levantamento … Falta: …")
    // o dado do item que o agente não definiu
    VARIAVEL_DE_IDENTIFICACAO: 'AGENTE',
    ESPESSURA_DO_VIDRO_AUSENTE: 'AGENTE',
    MEDIDA_INVALIDA: 'AGENTE',
    QUANTIDADE_DA_ESQUADRIA_INVALIDA: 'AGENTE',
    // a opção ou a medida que a tipologia não aceita
    ESCOLHA_FORA_DAS_OPCOES: 'MOTOR',
    ESCOLHA_DESCONHECIDA: 'MOTOR',
    OPCAO_INEXISTENTE: 'MOTOR',
    NENHUM_BAGUETE_PARA_A_ESPESSURA: 'MOTOR',
    COR_SEM_CODIGO: 'MOTOR',
    PECA_MAIOR_QUE_A_BARRA: 'MOTOR',
    // o dado do próprio motor (a fórmula, a aba, a regra do perfil) que não fecha
    TIPOLOGIA_SEM_DEFINICAO: 'MOTOR',
    PERFIL_SEM_REGRA: 'MOTOR',
    COR_EM_DUAS_GRAFIAS: 'MOTOR',
    DOIS_CODIGOS: 'MOTOR',
    QUANTIDADE_INVALIDA: 'MOTOR',
    COMPRIMENTO_INVALIDO: 'MOTOR',
    NAO_PARSEIA: 'MOTOR',
    FUNCAO_DESCONHECIDA: 'MOTOR',
    ARGUMENTOS_DA_FUNCAO: 'MOTOR',
    TIPO_ERRADO: 'MOTOR',
    DIVISAO_POR_ZERO: 'MOTOR',
    VARIAVEL_SEM_VALOR: 'MOTOR',
    CICLO: 'MOTOR',
    VARIAVEL_SEM_OPCOES: 'MOTOR',
    MEDIDA_DA_OPCAO_AUSENTE: 'MOTOR',
    OPCOES_NAO_PARSEIAM: 'MOTOR',
    NOME_EM_DUAS_FONTES: 'MOTOR',
    QUANTIDADE_NAO_INTEIRA: 'MOTOR',
    QUANTIDADE_NEGATIVA: 'MOTOR',
    COMPRIMENTO_NAO_POSITIVO: 'MOTOR',
    ESPESSURAS_NAO_PARSEIAM: 'MOTOR',
    ABA_AUSENTE: 'MOTOR',
    CABECALHO_AUSENTE: 'MOTOR',
    TIPOLOGIA_AUSENTE: 'MOTOR',
    VALOR_INVALIDO: 'MOTOR',
    // SEM BLOCO, de propósito: SERRA_INVALIDA (a serra é da base de conhecimento da empresa, e a referência não diz de qual bloco é) —
    // perguntado ao dono do produto na resposta do pedido 0032
}

/** O bloco do motivo; nulo quando o motivo não está na lista (não se adivinha). */
export function blocoDaFalta(motivo: string): BlocoDaFalta | null {
    return Object.prototype.hasOwnProperty.call(BLOCO_DO_MOTIVO, motivo) ? BLOCO_DO_MOTIVO[motivo] : null
}

const JA_TEM_BLOCO = /^\[(AGENTE|MOTOR|FORNECEDOR|COMERCIAL)\] /

/** A frase com o bloco na frente — `[FORNECEDOR] o item 1352 …`. Sem bloco, a frase como veio; a que já tem um não ganha outro. */
export function fraseComBloco(bloco: BlocoDaFalta | null, frase: string): string {
    if (bloco === null || JA_TEM_BLOCO.test(frase)) return frase
    return `[${bloco}] ${frase}`
}

/** A frase separada do bloco: `{ bloco: '[FORNECEDOR] ', resto: 'o item …' }` — para a lista que põe o código antes da frase pôr o bloco antes dos dois. */
export function separarBloco(frase: string): { bloco: string; resto: string } {
    const m = JA_TEM_BLOCO.exec(frase)
    return m ? { bloco: m[0], resto: frase.slice(m[0].length) } : { bloco: '', resto: frase }
}
