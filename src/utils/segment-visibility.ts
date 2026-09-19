/**
 * segment-visibility.ts — o que cada SEGMENTAÇÃO da empresa enxerga no sistema.
 *
 * REGRA (PO, 19/09/2026 — planilha "Cascata Lucro Real", precificação de cada segmento):
 *
 * ┌────────────────────────┬──────────────────────────────┬──────────────────────────────┐
 * │ Segmento da empresa    │ Disponível                   │ Oculto                       │
 * ├────────────────────────┼──────────────────────────────┼──────────────────────────────┤
 * │ Industrialização       │ Produzido + Revenda          │ Serviços (cadastro e menu)   │
 * │ Prestação de Serviços  │ Serviços + Revenda           │ Produzido (industrialização) │
 * │ Revenda                │ Revenda                      │ Serviços e Produzido         │
 * └────────────────────────┴──────────────────────────────┴──────────────────────────────┘
 *
 * POR QUE A INDÚSTRIA NÃO TEM SERVIÇO. Uma indústria que instala o que fabrica NÃO tem um
 * serviço paralelo: a instalação está no custo da empresa, entra na margem de contribuição e
 * é rateada por minutos na construção do produto. Abrir um cadastro de serviço ali permitiria
 * cobrar a mesma estrutura duas vezes.
 *
 * PARIDADE MENU ↔ PERMISSÕES. O que some do menu some também de Permissões de Acesso — os
 * dois leem ESTA função, e não cada um a sua cópia da regra.
 *
 * O SELETOR "Tipo do produto" (page-parts/products/content.component.tsx) já segue a coluna
 * "Disponível" desta tabela; aqui mora só o que faltava: o módulo Serviços.
 *
 * DOIS VOCABULÁRIOS. O banco grava INDUSTRIALIZACAO / SERVICO / REVENDA; a UI carrega
 * INDUSTRIALIZATION / SERVICE / RESALE. Os dois são aceitos.
 */
import { normalizeTenantSegment } from './expense-destination'

/** O segmento oferece o módulo Serviços (menu, cadastro, permissão)? Só Prestação de Serviços. */
export function tenantOffersServices(calcType: unknown): boolean {
    return normalizeTenantSegment(calcType) === 'SERVICO'
}


/** Módulos (chave de `MODULES` / permissão) que dependem da segmentação. */
const SEGMENT_GATED_MODULES: Record<string, (calcType: unknown) => boolean> = {
    services: tenantOffersServices,
}

/**
 * O módulo existe para esta segmentação? Fonte ÚNICA para o menu (desktop e mobile) e para a
 * lista de Permissões de Acesso — é isso que mantém a paridade entre os dois.
 * Módulo que não depende de segmentação → sempre true.
 */
export function moduleVisibleForSegment(moduleKey: string | null | undefined, calcType: unknown): boolean {
    if (!moduleKey) return true
    const gate = SEGMENT_GATED_MODULES[moduleKey]
    return gate ? gate(calcType) : true
}
