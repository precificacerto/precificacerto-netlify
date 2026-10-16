/**
 * segmentos-de-cliente.ts — a lista de segmentos do cadastro de cliente, em UM lugar.
 *
 * Ela era um literal em `clientes/index.tsx:58`, lido por dois pontos da MESMA tela: o
 * `<Select>` do formulário e o filtro da coluna Segmento. Com o formulário saindo para a
 * ficha e o filtro ficando na lista, os dois pontos passam a morar em ARQUIVOS diferentes —
 * e é exatamente aí que a cópia nasce (`copia-divergente.md`). Sai antes de nascer.
 */
export const SEGMENTOS_DE_CLIENTE: readonly string[] = [
    'Alimentício', 'Varejo', 'Tecnologia', 'Serviços', 'Indústria', 'Beleza', 'Saúde', 'Outros',
]

/** Primeira letra maiúscula, como o campo Nome faz enquanto se digita. */
export const capitalizarPrimeira = (value: string): string =>
    value.charAt(0).toUpperCase() + value.slice(1)
