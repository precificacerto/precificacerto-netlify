/**
 * OS RÓTULOS DOS MÓDULOS DE PERMISSÃO — FONTE ÚNICA.
 *
 * `chave → rótulo`, e SÓ isso. Este arquivo **não modela seção nem agrupamento**: o
 * agrupamento é de quem exibe (`funcionarios/index.tsx` tem o dele), e trazê-lo para cá faria
 * duas decisões competirem pelo mesmo arquivo.
 *
 * ══ POR QUE UMA FONTE, E NÃO TRÊS CONFERIDAS ════════════════════════════════════════════
 *
 * Havia três mapas escritos à mão, e eles JÁ DIVERGIAM. Medido em 14/10/2026:
 *
 * | mapa | arquivo | chaves |
 * |---|---|---|
 * | A | `pages/admin/usuarios.tsx` | **15** |
 * | B | `pages/funcionarios/[id]/permissoes.tsx` | 21 |
 * | C | `pages/funcionarios/index.tsx` | 21 |
 *
 * **A faltavam SEIS** — `commission`, `commissions_report`, `orders`, `recurrence`,
 * `rt_commission`, `sales_report`. O código ali faz `MODULE_LABELS[m] || m`, então a tela de
 * permissões do admin exibia a CHAVE CRUA (`sales_report`, `rt_commission`) para seis
 * módulos. Não era só rótulo feio: era a tela que concede acesso mostrando identificador de
 * banco onde devia estar o nome da tela.
 *
 * E três chaves tinham rótulos concorrentes. O desempate é o MENU, porque é o que o usuário
 * lê antes de chegar aqui:
 *
 * | chave | A dizia | B dizia | `nav.component.tsx` | fica |
 * |---|---|---|---|---|
 * | `home` | Home | Início | **Home** (:106) | Home |
 * | `dfc` | DFC | Análise Financeira | **Análise Financeira** (:135) | Análise Financeira |
 * | `reports` | Relatórios | Relatório Agenda | **Relatório Agenda** (:146) | Relatório Agenda |
 *
 * `copia-divergente.md` diz que o remédio não é conferir as três: é apagar duas. Com uma
 * fonte só, acrescentar módulo vale para os três pontos, e esquecer um deixa de ser possível.
 *
 * ══ `cash_flow` NÃO É DIVERGÊNCIA, E A BARRA FICA ═══════════════════════════════════════
 *
 * `nav.component.tsx:124` ("Fluxo de Caixa") e `:134` ("Controle Financeiro") são DOIS itens
 * de menu apontando para o MESMO `MODULES.CASH_FLOW`. O rótulo de permissão nomeia o que a
 * permissão CONCEDE, e ela concede as duas telas — então o rótulo nomeia as duas. A string
 * não vira lista: a relação 1:2 é entre menu e módulo, não entre módulo e rótulo.
 *
 * ══ O `satisfies` É O PORTÃO DE COBERTURA ═══════════════════════════════════════════════
 *
 * `satisfies Record<ModuloRotulavel, string>` faz o compilador recusar chave que falta E
 * chave que não existe. É `construtor-empobrecido.md` aplicado antes do defeito: o campo
 * necessário é obrigatório, e quem acrescentar um módulo a `MODULES` sem rótulo aqui descobre
 * no `tsc`, não na tela. O tipo exportado continua `Record<string, string>` porque é assim
 * que os três consumidores leem — com `|| m` como rede, que agora nunca dispara.
 */

import { MODULES, type ModuleKey } from '@/hooks/use-permissions.hook'

/**
 * Todo módulo MENOS `users_management`.
 *
 * Ele nunca foi concedível por funcionário — `admin/usuarios.tsx` já o filtrava de
 * `GRANTABLE_MODULES`, e nem B nem C jamais tiveram rótulo para ele. São 22 desde 18/10/2026,
 * quando entrou `orcamentista` — e entrou AQUI, pela fonte, sem tocar nas três telas: o
 * `satisfies` abaixo é o que obriga o rótulo a existir antes do `tsc` aceitar a chave.
 */
export type ModuloRotulavel = Exclude<ModuleKey, typeof MODULES.USERS_MANAGEMENT>

const ROTULOS = {
  home: 'Home',
  customers: 'Clientes',
  items: 'Custos Itens',
  products: 'Produtos',
  services: 'Serviços',
  stock: 'Estoque',
  employees: 'Funcionários',
  budgets: 'Orçamentos',
  orders: 'Pedidos',
  sales: 'Vendas',
  sales_report: 'Relatório de Vendas',
  commissions_report: 'Relatório de Comissões',
  recurrence: 'Recorrência',
  cash_flow: 'Fluxo de Caixa / Controle Financeiro',
  cashier: 'Caixa',
  dfc: 'Análise Financeira',
  commission: 'Comissão de Vendedor',
  rt_commission: 'RT Comissões',
  agenda: 'Agenda',
  reports: 'Relatório Agenda',
  connectivity: 'Conectividade',
  orcamentista: 'Orçamentista',
} satisfies Record<ModuloRotulavel, string>

/** O mapa que os três pontos de exibição leem. */
export const MODULE_LABELS: Record<string, string> = ROTULOS

/** As 22 chaves rotuláveis, na ordem em que foram escritas acima. */
export const MODULE_LABEL_KEYS = Object.keys(ROTULOS) as ModuloRotulavel[]

/** O rótulo de um módulo, com a chave crua como último recurso. */
export function rotuloDoModulo(chave: string): string {
  return MODULE_LABELS[chave] ?? chave
}
