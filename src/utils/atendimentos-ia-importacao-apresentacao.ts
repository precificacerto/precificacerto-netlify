/**
 * Atendimentos I.A. — a APRESENTAÇÃO da importação: a ordem das tipologias, a data, e os avisos
 * em língua de gente.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * REGRA INVIOLÁVEL: a tela mostra apenas o nome da conta e a configuração do Atendimentos I.A.
 * Nada do conteúdo da conta — nem clientes, nem orçamentos, nem funcionários, nem valores. O
 * super admin não tem tenant e não pode enxergar dado de cliente por construção.
 * ══════════════════════════════════════════════════════════════════════════════════════════
 *
 * SEPARADO DO LEITOR DE PROPÓSITO: o leitor (`atendimentos-ia-importacao.ts`) importa o `exceljs`,
 * e a tela que importasse dele levaria o `exceljs` inteiro para o navegador. Daqui só se importa
 * TIPO do leitor (`import type`, apagado na compilação).
 */
import type { Aviso, TipologiaLida } from '@/utils/atendimentos-ia-importacao'

/**
 * As tipologias da MAIOR para a MENOR proporção de regras condicionais; empate pelo nome. Quem
 * chama é a ROTA (`tabelas/[id]/conteudo`): a tela recebe a lista já ordenada e não calcula nada.
 */
export function ordenarPorProporcaoDeCondicionais<T extends Pick<TipologiaLida, 'tipologia' | 'n_regras' | 'n_condicionais'>>(tipologias: T[]): T[] {
    const proporcao = (t: T) => (t.n_regras > 0 ? t.n_condicionais / t.n_regras : 0)
    return [...tipologias].sort((a, b) => proporcao(b) - proporcao(a) || a.tipologia.localeCompare(b.tipologia))
}

/** A data e a hora de uma importação, como a tela mostra. */
export const quandoFoiImportado = (iso: string) => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

const ondeNaPlanilha = (a: { aba: string; linha: number }, coluna?: number) =>
    `Aba "${a.aba}", linha ${a.linha}${coluna !== undefined ? `, coluna ${coluna}` : ''}`

/**
 * O aviso como quem NÃO leu o código entende: um título e um texto. O `tipo` é identificador
 * interno e nunca aparece na tela.
 */
export function textoDoAviso(a: Aviso): { titulo: string; texto: string } {
    switch (a.tipo) {
        case 'celula_com_erro':
            return { titulo: 'Célula com erro na planilha', texto: `${ondeNaPlanilha(a, a.coluna)}: ${a.mensagem}. O valor foi gravado em branco.` }
        case 'celula_nao_numerica':
            return { titulo: 'Valor que não é número', texto: `${ondeNaPlanilha(a, a.coluna)}: ${a.mensagem}. O valor foi gravado em branco.` }
        case 'codigo_normalizado':
            return { titulo: 'Código ajustado', texto: `${ondeNaPlanilha(a)}: o código "${a.antes}" foi lido como "${a.depois}" — a vírgula virou ponto, para casar com a tabela de preço. O separador fica: ele distingue um produto do outro.` }
        case 'codigo_repetido':
            return {
                titulo: 'Código repetido na tabela de preço',
                texto: a.valores_batem
                    ? `O código ${a.codigo} aparece nas linhas ${a.linhas[0]} ("${a.secoes[0] ?? 'sem seção'}") e ${a.linhas[1]} ("${a.secoes[1] ?? 'sem seção'}"), com os mesmos valores. Ficou a primeira.`
                    : `VALORES DIFERENTES — o código ${a.codigo} aparece nas linhas ${a.linhas[0]} ("${a.secoes[0] ?? 'sem seção'}") e ${a.linhas[1]} ("${a.secoes[1] ?? 'sem seção'}") com preços diferentes. Ficou a primeira; a decisão volta para o dono do produto.`,
            }
        case 'aliquota_divergente_no_cabecalho':
            return { titulo: 'Alíquota que não fecha no cabeçalho', texto: `${ondeNaPlanilha(a)}: ${a.mensagem}.` }
        case 'codigo_do_motor_sem_preco':
            return { titulo: 'Códigos do motor sem preço', texto: `${a.codigos.length} código(s) do motor não estão na tabela de preço: ${a.codigos.join(', ')}.` }
        case 'tipologia_em_mais_de_uma_linha':
            return { titulo: 'Tipologia em mais de uma linha', texto: `A tipologia ${a.tipologia} aparece nas linhas ${a.linhas.join(', ')}; a linha dela ficou em branco.` }
        case 'tipologia_condicional_sem_variavel':
            return { titulo: 'Condição que não foi lida', texto: `A tipologia ${a.tipologia} tem ${a.n_condicionais} regra(s) com condição, e nenhuma variável foi encontrada nelas (ex.: "${a.exemplo}").` }
        case 'itens_sem_categoria_do_fornecedor':
            return { titulo: 'Itens sem a categoria do fornecedor', texto: a.mensagem }
        case 'tabela_sem_categoria_declarada':
            return { titulo: 'Tabela sem categoria declarada', texto: a.mensagem }
    }
}
