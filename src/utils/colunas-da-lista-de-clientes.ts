/**
 * colunas-da-lista-de-clientes.ts — quais colunas CONDICIONAIS a lista de Clientes renderiza.
 *
 * Pedido do dono do produto (17/10/2026), pela razão dele: otimização, e a tela vai ser usada
 * no celular. VENCIDO, A VENCER, SEGMENTO e RESPONSÁVEL saem da visão padrão, e cada uma volta
 * SOMENTE quando o filtro correspondente está ligado:
 *
 *   EM ATRASO ligado  → VENCIDO       ·   A VENCER ligado → A VENCER
 *   SEGMENTO ligado   → SEGMENTO      ·   RESPONSÁVEL     → (sem filtro — ver abaixo)
 *
 * Filtro desligado = a coluna NÃO É RENDERIZADA. Não é coluna vazia nem escondida por CSS.
 *
 * DERIVADA DOS FILTROS, e os filtros moram na URL (`use-filtros-de-cobranca.hook.ts`). Então a
 * coluna é derivada da URL: um link colado abre com as mesmas colunas. Não há estado próprio
 * aqui, de propósito — um segundo estado de "colunas visíveis" divergiria do endereço.
 *
 * RESPONSÁVEL NÃO TEM FILTRO — medido em 17/10/2026: nem em `FiltrosDeCobranca`, nem na barra,
 * nem como filtro de coluna. Ela sai da visão padrão do mesmo jeito, e NÃO é renderizada em
 * caso nenhum — não há campo para ela abaixo, de propósito: um sinalizador sempre `false` seria
 * decorativo. Criar o filtro dela é PENDÊNCIA NOMEADA; quando existir, ele ganha o campo aqui e
 * a coluna volta. Não é "esquecida": o dono do produto mandou não inventar filtro nesta rodada.
 * A consulta a `employees`, que só ela lia, SAIU da página junto (decisão do dono do produto,
 * 17/10/2026): carregava dado que nenhuma tela mostrava. Volta com o filtro.
 *
 * SEM VENCIMENTO NÃO ENTRA NESTA REGRA, e não é esquecimento — não "padronize". Ela não é
 * filtro, é CLASSE DE DADO: aparece quando algum cliente da lista tem valor sem vencimento
 * (hoje, zero linhas) e some quando não tem — `colunas-de-cobranca.component.tsx`. Amarrá-la a
 * um interruptor faria sumir justamente o dinheiro que não tem data para ser cobrado.
 *
 * O CARTÃO DO MOBILE segue a MESMA regra para VENCIDO e A VENCER (`LinhasDeCobrancaNoCartao`):
 * a VII.3 diz que filtro de atraso sem o atraso à vista não serve para nada, e o cartão é a
 * tela do celular.
 *
 * OS FILTROS MORAM NO CABEÇALHO DA LISTA — situação e segmento —, nunca no da coluna. Um lugar
 * só onde procurar filtro; e coluna condicional não pode guardar o filtro que a liga.
 */

import type { FiltrosDeCobranca } from '@/utils/filtros-de-cobranca'

/**
 * Os títulos, exportados para que o portão compare com o produto e não com literal.
 * `TITULO_RESPONSAVEL` não é usado pela página hoje: é o que o portão procura para afirmar que
 * a coluna não voltou sem o filtro dela.
 */
export const TITULO_SEGMENTO = 'Segmento'
export const TITULO_RESPONSAVEL = 'Responsável'

export interface ColunasCondicionais {
    vencido: boolean
    aVencer: boolean
    segmento: boolean
}

export function colunasCondicionais(filtros: FiltrosDeCobranca): ColunasCondicionais {
    return {
        vencido: filtros.emAtraso,
        aVencer: filtros.aVencer,
        segmento: filtros.segmento.length > 0,
    }
}
