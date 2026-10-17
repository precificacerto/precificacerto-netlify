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
 * nem como filtro de coluna. Ela sai da visão padrão do mesmo jeito, e por isso é `false`
 * SEMPRE. Criar o filtro dela é PENDÊNCIA NOMEADA; quando existir, esta linha passa a lê-lo e
 * nada mais muda. Não é "esquecida": o dono do produto mandou não inventar filtro nesta rodada.
 */

import type { FiltrosDeCobranca } from '@/utils/filtros-de-cobranca'

/** Os títulos, exportados para que o portão compare com o produto e não com literal. */
export const TITULO_SEGMENTO = 'Segmento'
export const TITULO_RESPONSAVEL = 'Responsável'

export interface ColunasCondicionais {
    vencido: boolean
    aVencer: boolean
    segmento: boolean
    /** Sempre `false` até existir o filtro de responsável — ver o cabeçalho. */
    responsavel: boolean
}

export function colunasCondicionais(filtros: FiltrosDeCobranca): ColunasCondicionais {
    return {
        vencido: filtros.emAtraso,
        aVencer: filtros.aVencer,
        segmento: filtros.segmento.length > 0,
        responsavel: false,
    }
}
