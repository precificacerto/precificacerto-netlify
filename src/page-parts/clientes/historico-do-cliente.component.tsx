/**
 * historico-do-cliente.component.tsx — o Histórico do Cliente, MOVIDO DE LUGAR.
 *
 * ESTE ARQUIVO NÃO MUDA COMPORTAMENTO. Ele é a extração literal de `fetchTimeline`
 * (`clientes/index.tsx:203`) e de `renderGroupedTimeline` (`:940`), que viviam dentro da
 * lista e alimentavam um `<Drawer>`. As MESMAS 8 consultas, nas MESMAS 4 ondas, com a MESMA
 * visibilidade — nenhuma consulta nova, nenhum filtro a mais nem a menos.
 *
 * Mover em vez de copiar é `copia-divergente.md`: com dois renderizadores do mesmo histórico,
 * a terceira edição corrigiria um e esqueceria o outro, e a divergência só apareceria como
 * "no Drawer aparece e na ficha não".
 *
 * O QUE MUDOU NA ASSINATURA, e só isto
 * -------------------------------------
 * - `carregarHistoricoDoCliente` DEVOLVE as entradas em vez de chamar `setTimeline`. Quem
 *   guarda estado é a tela; cancelamento devolve `null`, que é distinto de "nenhum registro"
 *   (`ausente-vs-falso.md` na forma de retorno: `[]` afirmaria que o cliente não tem nada).
 * - `employeeMap` entra como parâmetro, obrigatório.
 * - `expandidoId` / `aoAlternar` entram como props, em vez de `useState` da lista.
 * - `tipos` permite exibir só um grupo, que é o que as abas da ficha fazem. Omitido, mostra
 *   todos — o comportamento do Drawer.
 */

import React from 'react'
import { Tag } from 'antd'
import {
    ClockCircleOutlined,
    DownloadOutlined,
    FileTextOutlined,
    PaperClipOutlined,
    ShopOutlined,
    ShoppingCartOutlined,
} from '@ant-design/icons'

import { supabase } from '@/supabase/client'
import { buildSaleHistoryDetail, type SaleHistoryDetail } from '@/utils/sale-history-detail'
import {
    LIFECYCLE_STYLE,
    buildCarimboUltimaAlteracao,
    resolveDocumentLifecycle,
    resolveOrderStatusLabel,
    statusExibivelNoHistorico,
    type CarimboDeTempo,
    type DocumentLifecycle,
} from '@/utils/customer-history-status'
import { buildOriginLines, type OriginLine } from '@/utils/document-origin-link'
import { buildChainIndex, type SiblingInfo } from '@/utils/customer-history-chain'

export interface SaleItemForHistory {
    sale_id: string
    product_id: string | null
    service_id: string | null
    quantity: number | null
    unit_price: number | null
    description: string | null
    products: { id: string; name: string | null } | null
    services: { id: string; name: string | null } | null
}

export interface CashEntryForHistory {
    origin_id: string
    paid_date: string | null
    amount: number | null
    due_date: string | null
}

const naoNulo = <T,>(v: T | null | undefined): v is T => v != null

/** Moeda em pt-BR — o painel exibe valor unitário, subtotal, total e parcela. */
const brl = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0)

export interface TimelineEntry {
    id: string
    date: string
    type: string
    title: string
    description: string
    badgeLabel: string
    badgeColor: string
    downloadUrl?: string
    fileName?: string
    amount?: number
    serviceObservation?: string
    budgetItems?: string
    budgetStatus?: string
    attachmentDescription?: string
    attachmentMimeType?: string
    fileSize?: number
    employeeName?: string
    attachments?: { url: string; name: string; size?: number }[]
    /** Detalhe da venda (itens, subtotal, total, pagamento, parcelas). Só em `type: 'SALE'`. */
    saleDetail?: SaleHistoryDetail
    /**
     * Estado de vida do documento. Decide o tratamento visual e é INDEPENDENTE do `badgeLabel`,
     * que é o status de PAGAMENTO — derivado das `cash_entries` ativas, que as cascatas
     * desativam. Sem este campo o selo sozinho mentiria: a venda excluída sai como "Pago".
     */
    lifecycle: DocumentLifecycle
    /** Carimbo de tempo do documento morto, com a ressalva de que é proxy. `undefined` no vivo. */
    carimbo?: CarimboDeTempo
    /**
     * Orçamento e pedido que originaram a venda. Vazio na venda de balcão; sem a linha do
     * pedido no Caso B — a etapa não existiu, e exibir vazio afirmaria que não houve pedido.
     */
    origem?: OriginLine[]
    /** Presente só quando a linha tem irmãos no mesmo estágio da mesma cadeia. */
    irmaos?: SiblingInfo
}

/**
 * As 8 consultas do histórico, em 4 ondas. Devolve `null` quando o chamador cancelou.
 *
 * As ondas 2, 3 e 4 são sequenciais porque cada uma depende dos ids da anterior — não é
 * descuido, é dependência de dado.
 */
export async function carregarHistoricoDoCliente(
    customerId: string,
    employeeMap: Map<string, string>,
    /** PARÂMETRO, nunca o relógio: é contra ele que o bloco de parcelas decide "VENCIDA". */
    hoje: string,
    sinal?: { cancelled: boolean },
): Promise<TimelineEntry[] | null> {
        const [histRes, attachRes, budgetRes, salesRes, ordersRes] = await Promise.all([
            supabase
                .from('customer_service_history')
                .select('id, service_observation, created_at, calendar_event_id, history_type, employee_id')
                .eq('customer_id', customerId)
                .order('created_at', { ascending: false }),
            supabase
                .from('customer_attachments')
                .select('id, file_path, file_name, file_size, mime_type, description, created_at, origin_type, origin_id')
                .eq('customer_id', customerId)
                .order('created_at', { ascending: false }),
            supabase
                .from('budgets')
                .select('id, total_value, status, payment_method, paid_date, sale_id, created_at, updated_at, budget_items(product_id, quantity, unit_price, products(name), manual_description)')
                .eq('customer_id', customerId)
                // SEM FILTRO DE STATUS NA CONSULTA — e isto é requisito do cálculo de cadeia,
                // não preferência. `buildChainIndex` precisa da cadeia COMPLETA: um documento
                // removido aqui faria a cadeia concluir que o topo é o estágio anterior. O
                // filtro de status é aplicado DEPOIS, por `statusExibivelNoHistorico`.
                .order('created_at', { ascending: false }),
            (supabase as any)
                .from('sales')
                .select('id, final_value, payment_method, installments, sale_date, created_at, updated_at, employee_id, description, status, sale_type, budget_id, order_id')
                .eq('customer_id', customerId)
                // SEM FILTRO DE `is_active` E SEM FILTRO DE STATUS — e a remoção é deliberada.
                //
                // Até 08/09/2026 esta consulta trazia `.eq('is_active', true)` e
                // `.neq('status','CANCELLED')`, escritos em 31/07 (commit `d1a4442`) sob a regra
                // da época: "Histórico exibe SOMENTE vendas efetivadas". Aquilo cobria o nível
                // que a regra daquele dia alcançava, e não é descuido de quem construiu.
                //
                // O que mudou: `is_active = false` significa TRÊS coisas em `sales` — cancelada,
                // excluída, e um terceiro estado sem nome (`COMPLETED` com a flag baixada, 3
                // linhas). Filtrar por ele esconde as três SEM DISTINGUIR. O STATUS SEPARA, e é
                // ele que decide o tratamento visual em `customer-history-status.ts`.
                .order('created_at', { ascending: false }),
            (supabase as any)
                .from('orders')
                .select('id, order_code, total_value, status, created_at, updated_at, order_items(id)')
                .eq('customer_id', customerId)
                // Sem lista negra na consulta, pela mesma razão da consulta de orçamentos: a
                // cadeia tem de chegar inteira ao `buildChainIndex`. E `CANCELLED` deixou de ser
                // barrado — é a suspensão da regra de 31/07 para cadeias mortas.
                .order('created_at', { ascending: false }),
        ])
        if (sinal?.cancelled) return null

        // Fetch FROM_BUDGET sales (may not have customer_id set — look up by budget_id)
        const allBudgetIds = (budgetRes.data || []).map((b: any) => b.id)
        let fromBudgetSalesData: any[] = []
        if (allBudgetIds.length > 0) {
            const { data: fbSales } = await (supabase as any)
                .from('sales')
                .select('id, final_value, payment_method, installments, sale_date, created_at, updated_at, employee_id, description, status, sale_type, budget_id, order_id')
                .in('budget_id', allBudgetIds)
                // Mesmo critério da consulta por `customer_id`: sem `is_active`, sem filtro de
                // status. As duas precisam mudar juntas — uma venda alcançada só por este
                // caminho continuaria escondida se o filtro ficasse aqui.
            fromBudgetSalesData = fbSales || []
        }
        // Merge and deduplicate sales (prefer entries from customer-based query)
        const salesByCustomer = salesRes.data || []
        const seenSaleIds = new Set<string>(salesByCustomer.map((s: any) => s.id))
        const allSales = [...salesByCustomer, ...fromBudgetSalesData.filter((s: any) => !seenSaleIds.has(s.id))]

        // ÍNDICE DA CADEIA — decide quem aparece. Recebe os documentos COMPLETOS, sem filtro de
        // status: filtrar antes faria a cadeia concluir que o topo é o estágio anterior.
        const chainIndex = buildChainIndex({
            budgets: (budgetRes.data || []) as { id: string; created_at?: string | null }[],
            orders: (ordersRes?.data || []) as { id: string; created_at?: string | null }[],
            sales: allSales as { id: string; created_at?: string | null }[],
        })
        /** O documento passa se for topo da sua cadeia E se o status dele for exibível. */
        const apareceNoHistorico = (
            stage: 'ORCAMENTO' | 'PEDIDO' | 'VENDA',
            id: string,
            status?: string | null,
        ) => chainIndex.visiveis.has(id) && statusExibivelNoHistorico(stage, status)

        if (sinal?.cancelled) return null

        // Fetch cash_entries for BOLETO/CHEQUE budgets and sales to check if all parcelas were paid
        // O filtro que limitava esta busca a BOLETO/CHEQUE saiu: o histórico passa a exibir o
        // parcelamento de TODA venda que tenha lançamento, e à vista é uma parcela como
        // qualquer outra. `amount` e `due_date` entraram no select porque o painel agora
        // mostra valor e vencimento de cada parcela, não só se todas foram pagas.
        const boletoBudgetIds = (budgetRes.data || [])
            .filter((b: any) => !(b as any).sale_id && ((b as any).payment_method === 'BOLETO' || (b as any).payment_method === 'CHEQUE_PRE_DATADO'))
            .map((b: any) => b.id)
        const allSaleIds = allSales.map((s: any) => s.id)
        const allOriginIds = [...boletoBudgetIds, ...allSaleIds]
        const cashEntriesByOrigin: Record<string, { paid_date: string | null; amount: number | null; due_date: string | null }[]> = {}
        if (allOriginIds.length > 0) {
            const { data: ceData } = await supabase
                .from('cash_entries')
                .select('origin_id, paid_date, amount, due_date')
                .in('origin_id', allOriginIds)
                .eq('is_active', true)
            for (const ce of (ceData || []) as CashEntryForHistory[]) {
                if (!cashEntriesByOrigin[ce.origin_id]) cashEntriesByOrigin[ce.origin_id] = []
                cashEntriesByOrigin[ce.origin_id].push({ paid_date: ce.paid_date, amount: ce.amount, due_date: ce.due_date })
            }
        }

        // ITENS DA VENDA — `sale_items`, a fonte ESTRUTURADA. O detalhamento em texto de
        // `cash_entries.description` não serve: as 14 linhas que o têm apontam `origin_id`
        // para `calendar_events`, não para `sales` (cobertura ZERO nas vendas ativas), e ler
        // dali seria parsing de string que quebra em silêncio.
        const saleItemsBySale: Record<string, SaleItemForHistory[]> = {}
        if (allSaleIds.length > 0) {
            const { data: siData } = await supabase
                .from('sale_items')
                .select('sale_id, product_id, service_id, quantity, unit_price, description, products(id, name), services(id, name)')
                .in('sale_id', allSaleIds)
            for (const si of (siData || []) as unknown as SaleItemForHistory[]) {
                if (!saleItemsBySale[si.sale_id]) saleItemsBySale[si.sale_id] = []
                saleItemsBySale[si.sale_id].push(si)
            }
        }
        if (sinal?.cancelled) return null

        // Generate signed URLs and build attachment map grouped by origin
        const attachMap: Record<string, { url: string; name: string; size?: number }[]> = {}
        // Raw data map (with signedUrl) for generating standalone entries of unconsumed attachments
        const attachRawByKey: Record<string, any[]> = {}
        const orphanAttachments: any[] = []
        for (const aRaw of attachRes.data || []) {
            const a = aRaw as any
            const { data: urlData } = await supabase.storage.from('comprovantes').createSignedUrl(a.file_path, 3600)
            const signedUrl = urlData?.signedUrl || ''
            const item = { url: signedUrl, name: a.file_name, size: a.file_size ?? undefined }
            if (a.origin_type && a.origin_id) {
                const key = `${a.origin_type}:${a.origin_id}`
                if (!attachMap[key]) { attachMap[key] = []; attachRawByKey[key] = [] }
                attachMap[key].push(item)
                attachRawByKey[key].push({ ...a, signedUrl })
            } else {
                orphanAttachments.push({ ...a, signedUrl })
            }
        }

        const entries: TimelineEntry[] = []
        // Track which attachMap keys were consumed by a parent timeline entry
        const consumedAttachKeys = new Set<string>()

        for (const hRaw of histRes.data || []) {
            const h = hRaw as any
            const agendaKey = h.calendar_event_id ? `AGENDA:${h.calendar_event_id}` : null
            const agendaAtts = agendaKey ? attachMap[agendaKey] : undefined
            if (agendaKey) consumedAttachKeys.add(agendaKey)
            entries.push({
                id: `svc-${h.id}`,
                lifecycle: 'ATIVO',
                date: h.created_at,
                type: h.history_type === 'BUDGET_SENT' ? 'BUDGET_HIST' : 'SERVICE',
                title: h.history_type === 'BUDGET_SENT' ? 'Orçamento enviado' : 'Observação de serviço',
                description: h.service_observation || '—',
                badgeLabel: h.history_type === 'BUDGET_SENT' ? 'Orçamento' : 'Serviço',
                badgeColor: h.history_type === 'BUDGET_SENT' ? 'blue' : 'green',
                serviceObservation: h.service_observation || undefined,
                employeeName: h.employee_id ? (employeeMap.get(h.employee_id) || undefined) : undefined,
                attachments: agendaAtts,
            })
        }

        // Orphan attachments (no origin_type) as standalone entries
        for (const a of orphanAttachments) {
            entries.push({
                id: `att-${a.id}`,
                lifecycle: 'ATIVO',
                date: a.created_at,
                type: 'ATTACHMENT',
                title: a.file_name,
                description: a.description || '',
                badgeLabel: 'Anexo',
                badgeColor: 'purple',
                downloadUrl: a.signedUrl,
                fileName: a.file_name,
                attachmentDescription: a.description || undefined,
                fileSize: a.file_size ?? undefined,
                attachmentMimeType: a.mime_type || undefined,
            })
        }

        for (const b of budgetRes.data || []) {
            // Mark budget attachment key as consumed (whether or not we render the budget row)
            consumedAttachKeys.add(`BUDGET:${b.id}`)

            // A CADEIA DECIDE, não mais o ponteiro `budgets.sale_id`. O `continue` anterior
            // dependia de o orçamento apontar a venda de volta — e há 3 vendas cujo orçamento
            // NÃO aponta (VD-43E865, VD-A9599A, VD-85610B), lacuna que ficava sem tratamento.
            // A raiz da cadeia cobre as duas situações, e ainda junta o espelho ao original.
            if (!apareceNoHistorico('ORCAMENTO', b.id, (b as any).status)) continue

            const items = (b as any).budget_items || []
            const summary = items.slice(0, 3).map((i: any) => i.products?.name || i.manual_description || 'Item').join(', ')
            const suffix = items.length > 3 ? ` +${items.length - 3}` : ''

            // Map budget status to label/color
            let statusLabel = 'Em Aberto'
            let badgeColor = 'default'
            const bStatus = (b as any).status
            if (bStatus === 'DRAFT') { statusLabel = 'Rascunho'; badgeColor = 'default' }
            else if (bStatus === 'SENT') { statusLabel = 'Enviado'; badgeColor = 'blue' }
            else if (bStatus === 'APPROVED') { statusLabel = 'Aprovado'; badgeColor = 'success' }
            else if (bStatus === 'AWAITING_PAYMENT') { statusLabel = 'Aguardando Pagamento'; badgeColor = 'orange' }
            else if (bStatus === 'PAID') { statusLabel = 'Pago'; badgeColor = 'green' }
            else if (bStatus === 'REJECTED') { statusLabel = 'Cancelado'; badgeColor = 'red' }
            else if (bStatus === 'EXPIRED') { statusLabel = 'Expirado'; badgeColor = 'warning' }
            const isBoletoOrCheque = (b as any).payment_method === 'BOLETO' || (b as any).payment_method === 'CHEQUE_PRE_DATADO'
            if (isBoletoOrCheque && bStatus !== 'PAID') {
                const ces = cashEntriesByOrigin[b.id] || []
                const totalCount = ces.length
                const paidCount = ces.filter((ce: any) => ce.paid_date).length
                if (totalCount > 0 && paidCount > 0 && paidCount < totalCount) {
                    statusLabel = `Pago Parcial (${paidCount}/${totalCount})`
                    badgeColor = 'blue'
                } else if (totalCount > 0 && paidCount === totalCount) {
                    statusLabel = 'Pago'
                    badgeColor = 'green'
                }
            }

            const budgetAtts = attachMap[`BUDGET:${b.id}`]
            const budgetLifecycle = resolveDocumentLifecycle(bStatus)
            entries.push({
                id: `bgt-${b.id}`,
                lifecycle: budgetLifecycle,
                carimbo: buildCarimboUltimaAlteracao({
                    lifecycle: budgetLifecycle,
                    updatedAt: (b as { updated_at?: string | null }).updated_at,
                }) ?? undefined,
                date: b.created_at,
                type: 'BUDGET',
                title: `ORC-${b.id.substring(0, 4).toUpperCase()}`,
                description: summary + suffix,
                badgeLabel: statusLabel,
                badgeColor,
                amount: Number(b.total_value || 0),
                budgetItems: summary + suffix,
                budgetStatus: statusLabel,
                attachments: budgetAtts,
            })
        }

        // Sales (from Vendas Balcão and converted from budgets)
        for (const s of allSales) {
            consumedAttachKeys.add(`SALE:${s.id}`)
            // Venda é o estágio mais avançado: ela só não aparece se outra venda da mesma cadeia
            // for o topo — o que a base não tem (zero cadeias com duas vendas), mas o critério
            // não depende desse zero.
            if (!apareceNoHistorico('VENDA', s.id, s.status)) continue
            if (s.budget_id) consumedAttachKeys.add(`BUDGET:${s.budget_id}`)

            const isBoletoOrCheque = s.payment_method === 'BOLETO' || s.payment_method === 'CHEQUE_PRE_DATADO'
            let saleStatus = 'Pago'
            let saleBadgeColor = 'green'
            if (isBoletoOrCheque) {
                const ces = cashEntriesByOrigin[s.id] || []
                const totalCount = ces.length
                const paidCount = ces.filter((ce: any) => ce.paid_date).length
                if (totalCount === 0 || paidCount === 0) {
                    saleStatus = 'Aguardando Pagamento'
                    saleBadgeColor = 'orange'
                } else if (paidCount < totalCount) {
                    saleStatus = `Pago Parcial (${paidCount}/${totalCount})`
                    saleBadgeColor = 'blue'
                }
            }
            // Merge attachments from SALE origin and BUDGET origin (for FROM_BUDGET sales)
            const saleAttsArr = [
                ...(attachMap[`SALE:${s.id}`] || []),
                ...(s.budget_id ? (attachMap[`BUDGET:${s.budget_id}`] || []) : []),
            ]
            const saleAtts = saleAttsArr.length > 0 ? saleAttsArr : undefined
            const empName = s.employee_id ? (employeeMap.get(s.employee_id) || undefined) : undefined
            const cleanDesc = s.description?.replace(/^Venda balcão:\s*/i, '').replace(/^Venda via orçamento\s*—\s*/i, '').split('—')[0].trim() || 'Venda'
            // O ESTADO DE VIDA É SEPARADO DO SELO. O selo acima é status de PAGAMENTO e sai de
            // `cash_entries` ATIVAS — que as cascatas desativam. Sem este marcador, VD-96AF84
            // (PIX, excluída) apareceria com "Pago" verde, e as canceladas BOLETO com
            // "Aguardando Pagamento" laranja. Os dois convivem; um não substitui o outro.
            const saleLifecycle = resolveDocumentLifecycle(s.status)
            entries.push({
                id: `sale-${s.id}`,
                lifecycle: saleLifecycle,
                carimbo: buildCarimboUltimaAlteracao({
                    lifecycle: saleLifecycle,
                    updatedAt: s.updated_at,
                }) ?? undefined,
                date: s.sale_date || s.created_at,
                // VÍNCULO DE ORIGEM — o que torna o registro morto auditável. Sem ele, o
                // orçamento e a venda ficam em seções diferentes do painel, os dois apagados,
                // e nada os liga. No Caso B a linha do pedido simplesmente não vem.
                origem: buildOriginLines({ budgetId: s.budget_id, orderId: s.order_id }),
                type: 'SALE',
                title: `Venda — ${cleanDesc}`,
                description: s.description || '',
                badgeLabel: saleStatus,
                badgeColor: saleBadgeColor,
                amount: Number(s.final_value || 0),
                employeeName: empName,
                attachments: saleAtts,
                // SEGMENTADO POR VENDA: o detalhe é montado com as linhas DESTA venda. Um
                // cliente tem várias, cada uma com condição própria — consolidar produziria
                // um número que não corresponde a venda nenhuma.
                saleDetail: buildSaleHistoryDetail({
                    sale: { final_value: s.final_value, payment_method: s.payment_method },
                    items: saleItemsBySale[s.id] || [],
                    cashEntries: cashEntriesByOrigin[s.id] || [],
                    products: (saleItemsBySale[s.id] || []).map((si) => si.products).filter(naoNulo),
                    services: (saleItemsBySale[s.id] || []).map((si) => si.services).filter(naoNulo),
                    hoje,
                }),
            })
        }

        // Pedidos. O mapa de rótulos saiu daqui para `customer-history-status.ts`: local, ele
        // não tinha entrada para `EXCLUIDO` e caía no fallback, imprimindo a STRING CRUA na
        // tela — a única seção onde um documento excluído já vazava, e sem tradução.
        for (const o of ordersRes?.data || []) {
            if (!apareceNoHistorico('PEDIDO', o.id, o.status)) continue
            const conf = resolveOrderStatusLabel(o.status)
            const itemCount = Array.isArray(o.order_items) ? o.order_items.length : 0
            const orderLifecycle = resolveDocumentLifecycle(o.status)
            // IRMÃOS: quando a cadeia morreu no pedido e há vários, TODOS aparecem — são
            // tentativas distintas que morreram, não uma repetida. A legibilidade se resolve
            // diferenciando as linhas (código, data e "n de m"), nunca escondendo as outras.
            const irmaos = chainIndex.irmaosPorDocumento.get(o.id)
            entries.push({
                id: `order-${o.id}`,
                lifecycle: orderLifecycle,
                carimbo: buildCarimboUltimaAlteracao({
                    lifecycle: orderLifecycle,
                    updatedAt: o.updated_at,
                }) ?? undefined,
                date: o.created_at,
                type: 'ORDER',
                title: `Pedido ${o.order_code || o.id.slice(0, 8).toUpperCase()}`,
                irmaos,
                description: `${itemCount} ${itemCount === 1 ? 'item' : 'itens'}`,
                badgeLabel: conf.label,
                badgeColor: conf.color,
                amount: Number(o.total_value || 0),
            })
        }

        // Unconsumed attachments (e.g. AGENDA files with no service history entry) → standalone entries
        for (const [key, raws] of Object.entries(attachRawByKey)) {
            if (consumedAttachKeys.has(key)) continue
            for (const a of raws) {
                entries.push({
                    id: `att-${a.id}`,
                    lifecycle: 'ATIVO',
                    date: a.created_at,
                    type: 'ATTACHMENT',
                    title: a.file_name,
                    description: a.description || '',
                    badgeLabel: 'Anexo',
                    badgeColor: 'purple',
                    downloadUrl: a.signedUrl,
                    fileName: a.file_name,
                    attachmentDescription: a.description || undefined,
                    fileSize: a.file_size ?? undefined,
                    attachmentMimeType: a.mime_type || undefined,
                })
            }
        }

        entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        return entries
}

/**
 * O SELO DA PARCELA — e ele passou a distinguir VENCIDA de "em aberto".
 *
 * Até aqui havia só `liquidada: boolean`, e os dois estados caíam no mesmo laranja "Em
 * aberto". Uma parcela vencida há 120 dias e uma que vence amanhã são a mesma frase para
 * quem lê, e é justamente a diferença que faz alguém agir.
 *
 * O estado vem do classificador de `parcelas-do-cliente.ts` — o MESMO da lista de Clientes.
 */
const SELO_DA_PARCELA: Record<string, { cor: string; rotulo: string }> = {
    PAGA: { cor: 'green', rotulo: 'Paga' },
    VENCIDA: { cor: 'red', rotulo: 'Vencida' },
    A_VENCER: { cor: 'orange', rotulo: 'Em aberto' },
    SEM_VENCIMENTO: { cor: 'default', rotulo: 'Sem vencimento' },
}

/** O dia em `dd/mm`, para o "PAGA em dd/mm". */
function diaCurto(iso: string): string {
    const [, m, d] = iso.split('-')
    return `${d}/${m}`
}

/**
 * O rótulo do selo.
 *
 * `paid_date` era LIDO e DESCARTADO: o detalhe sabia a data do pagamento e exibia só
 * "Liquidada". Agora ela aparece — "Paga em 02/07" responde a pergunta que "Liquidada" só
 * levanta.
 */
function rotuloDaParcela(p: { estado: string; pagaEm: string | null; diasDeAtraso: number | null }): string {
    if (p.estado === 'PAGA' && p.pagaEm) return `Paga em ${diaCurto(p.pagaEm)}`
    if (p.estado === 'VENCIDA' && p.diasDeAtraso !== null) {
        return p.diasDeAtraso === 1 ? 'Vencida há 1 dia' : `Vencida há ${p.diasDeAtraso} dias`
    }
    return SELO_DA_PARCELA[p.estado]?.rotulo ?? p.estado
}

/** Os cinco grupos do histórico, na ordem em que o Drawer os exibia. */
export const GRUPOS_DO_HISTORICO = ['SERVICE', 'SALE', 'ORDER', 'BUDGET', 'ATTACHMENT'] as const
export type GrupoDoHistorico = (typeof GRUPOS_DO_HISTORICO)[number]

export interface HistoricoDoClienteProps {
    entries: TimelineEntry[]
    /** Qual linha está aberta. Uma por vez, como no Drawer. */
    expandidoId: string | null
    aoAlternar: (id: string | null) => void
    maxHeight?: number
    /** Quais grupos exibir. Omitido, exibe os cinco — o comportamento do Drawer. */
    tipos?: readonly GrupoDoHistorico[]
}

export function HistoricoDoCliente({ entries, expandidoId, aoAlternar, maxHeight, tipos }: HistoricoDoClienteProps) {
        const permitidos = tipos ?? GRUPOS_DO_HISTORICO
        const typeGroups: { key: string; label: string; icon: React.ReactNode }[] = [
            { key: 'SERVICE', label: 'Serviços Realizados', icon: <ClockCircleOutlined style={{ color: '#12B76A' }} /> },
            { key: 'SALE', label: 'Vendas', icon: <ShopOutlined style={{ color: '#F79009' }} /> },
            { key: 'ORDER', label: 'Pedidos', icon: <ShoppingCartOutlined style={{ color: '#06b6d4' }} /> },
            { key: 'BUDGET', label: 'Orçamentos', icon: <FileTextOutlined style={{ color: '#2E90FA' }} /> },
            { key: 'ATTACHMENT', label: 'Anexos e Documentos', icon: <PaperClipOutlined style={{ color: '#7A5AF8' }} /> },
        ]

        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, ...(maxHeight ? { maxHeight, overflow: 'auto' } : {}) }}>
                {typeGroups.filter(g => (permitidos as readonly string[]).includes(g.key)).map(({ key: typeKey, label: typeLabel, icon: typeIcon }) => {
                    const typeEntries = entries.filter(e =>
                        typeKey === 'BUDGET' ? (e.type === 'BUDGET' || e.type === 'BUDGET_HIST') : e.type === typeKey
                    )
                    if (typeEntries.length === 0) return null
                    return (
                        <div key={typeKey}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 8 }}>
                                {typeIcon} {typeLabel}
                                <Tag style={{ margin: 0 }}>{typeEntries.length}</Tag>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {typeEntries.map(entry => {
                                    const isExpanded = expandidoId === entry.id
                                    // TRATAMENTO POR STATUS. O esmaecido é REFORÇO — opacidade só
                                    // se lê por contraste, e um cliente com uma venda só (a
                                    // excluída) não tem com o que comparar. O marcador em texto
                                    // é o que afirma; ele nunca some.
                                    const estilo = LIFECYCLE_STYLE[entry.lifecycle]
                                    return (
                                        <div
                                            key={entry.id}
                                            style={{
                                                padding: '10px 14px',
                                                background: isExpanded ? 'rgba(46, 144, 250, 0.12)' : '#0a1628',
                                                borderRadius: 8,
                                                border: `1px solid ${isExpanded ? 'rgba(46, 144, 250, 0.3)' : 'rgba(255,255,255,0.06)'}`,
                                                cursor: 'pointer',
                                                transition: 'all 0.15s',
                                                opacity: estilo.opacity,
                                            }}
                                            onClick={() => aoAlternar(isExpanded ? null : entry.id)}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    {/* MARCADOR DE STATUS — elemento próprio, AO LADO do selo de
                                                        pagamento, nunca no lugar dele. O selo sai das
                                                        `cash_entries` ativas, que as cascatas desativam: sozinho
                                                        ele diria "Pago" numa venda excluída. */}
                                                    {estilo.markerLabel && (
                                                        <Tag color={estilo.markerColor} style={{ margin: 0, fontSize: 10, fontWeight: 700 }}>
                                                            {estilo.markerLabel}
                                                        </Tag>
                                                    )}
                                                    <Tag color={entry.badgeColor} style={{ margin: 0, fontSize: 10 }}>{entry.badgeLabel}</Tag>
                                                    <span style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>{entry.title}</span>
                                                    {/* IRMÃOS — a cadeia morreu neste estágio e há mais de uma
                                                        tentativa. As linhas são DIFERENCIADAS, nunca escondidas:
                                                        são operações distintas, e esconder apaga rastro. */}
                                                    {entry.irmaos && (
                                                        <Tag style={{ margin: 0, fontSize: 10 }}>
                                                            tentativa {entry.irmaos.posicao} de {entry.irmaos.total}
                                                        </Tag>
                                                    )}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    {entry.amount != null && (
                                                        <span style={{
                                                            color: '#12B76A',
                                                            fontWeight: 700,
                                                            fontSize: 13,
                                                            ...(estilo.riscarValor ? { textDecoration: 'line-through' } : {}),
                                                        }}>
                                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(entry.amount)}
                                                        </span>
                                                    )}
                                                    <span style={{ fontSize: 11, color: '#94a3b8' }}>
                                                        {new Date(entry.date).toLocaleDateString('pt-BR')}
                                                    </span>
                                                    <span style={{ fontSize: 11, color: '#64748b', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-block' }}>&#9660;</span>
                                                </div>
                                            </div>

                                            {isExpanded && (
                                                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                                    <div style={{ fontSize: 12, color: '#e2e8f0', lineHeight: 1.6 }}>
                                                        {/* CARIMBO DE TEMPO DO DOCUMENTO MORTO — e o rótulo diz que
                                                            é PROXY. `updated_at` é carimbo GLOBAL da linha: no
                                                            VD-96AF84 ele é a exclusão porque a cascata foi a última
                                                            escrita, mas qualquer edição posterior o move e nada
                                                            registra qual escrita foi. Rotular "Excluído em" afirmaria
                                                            mais do que se sabe — rótulo preciso sobre dado impreciso
                                                            é afirmação falsa. A ressalva vai na TELA, não só aqui. */}
                                                        {entry.carimbo && (
                                                            <div style={{ marginBottom: 6 }}>
                                                                <strong>{entry.carimbo.rotulo}:</strong> {entry.carimbo.valor}
                                                                <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>
                                                                    {entry.carimbo.ressalva}
                                                                </div>
                                                            </div>
                                                        )}
                                                        {entry.origem && entry.origem.length > 0 && (
                                                            <div style={{ marginBottom: 6 }}>
                                                                <strong>Origem:</strong>{' '}
                                                                {entry.origem.map((o, i) => (
                                                                    <span key={o.id}>
                                                                        {i > 0 && ' · '}
                                                                        {o.rotulo} <Tag style={{ margin: 0 }}>{o.valor}</Tag>
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                        {entry.description && (
                                                            <div style={{ marginBottom: 6 }}>
                                                                <strong>Detalhes:</strong> {entry.description}
                                                            </div>
                                                        )}
                                                        {entry.serviceObservation && (
                                                            <div style={{ marginBottom: 6 }}>
                                                                <strong>Observação do serviço:</strong> {entry.serviceObservation}
                                                            </div>
                                                        )}
                                                        {entry.employeeName && (
                                                            <div style={{ marginBottom: 6 }}>
                                                                <strong>Funcionário:</strong> {entry.employeeName}
                                                            </div>
                                                        )}
                                                        {entry.budgetItems && (
                                                            <div style={{ marginBottom: 6 }}>
                                                                <strong>Itens:</strong> {entry.budgetItems}
                                                            </div>
                                                        )}
                                                        {entry.budgetStatus && (
                                                            <div style={{ marginBottom: 6 }}>
                                                                <strong>Status:</strong> <Tag>{entry.budgetStatus}</Tag>
                                                            </div>
                                                        )}
                                                        {entry.saleDetail && entry.saleDetail.itens.length > 0 && (
                                                            <div style={{ marginBottom: 6 }}>
                                                                <strong>Itens:</strong>
                                                                <div style={{ marginTop: 4 }}>
                                                                    {entry.saleDetail.itens.map((it, i) => (
                                                                        <div key={`${entry.id}-item-${i}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                                                            <span>
                                                                                {it.nome} × {it.quantidade}
                                                                                <span style={{ opacity: 0.7 }}> ({brl(it.valorUnitario)} un.)</span>
                                                                            </span>
                                                                            <span>{brl(it.total)}</span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 4 }}>
                                                                    <span style={{ opacity: 0.7 }}>Subtotal</span>
                                                                    <span style={{ opacity: 0.7 }}>{brl(entry.saleDetail.subtotal)}</span>
                                                                </div>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                                                    <strong>Total</strong>
                                                                    <strong>{brl(entry.saleDetail.total)}</strong>
                                                                </div>
                                                            </div>
                                                        )}
                                                        {entry.saleDetail?.formaPagamento && (
                                                            <div style={{ marginBottom: 6 }}>
                                                                <strong>Pagamento:</strong> {entry.saleDetail.formaPagamento}
                                                            </div>
                                                        )}
                                                        {/* Parcelamento AUSENTE é omitido, não exibido vazio: sete das vendas
                                                            ativas não têm lançamento nenhum, e "não conhecido" não é "zero
                                                            parcelas". Não estimar, não inferir. */}
                                                        {entry.saleDetail?.parcelamento && (
                                                            <div style={{ marginBottom: 6 }}>
                                                                <strong>Parcelamento:</strong>{' '}
                                                                {entry.saleDetail.parcelamento.total}{' '}
                                                                {entry.saleDetail.parcelamento.total === 1 ? 'parcela' : 'parcelas'}
                                                                {' — '}{entry.saleDetail.parcelamento.liquidadas} liquidada
                                                                {entry.saleDetail.parcelamento.liquidadas === 1 ? '' : 's'}
                                                                {entry.saleDetail.parcelamento.emAberto > 0 && (
                                                                    <>, {entry.saleDetail.parcelamento.emAberto} em aberto</>
                                                                )}
                                                                <div style={{ marginTop: 4 }}>
                                                                    {entry.saleDetail.parcelamento.parcelas.map((p) => (
                                                                        <div key={`${entry.id}-parc-${p.numero}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                                                                            <span>
                                                                                {p.numero}/{p.de}
                                                                                {p.vencimento && (
                                                                                    <span style={{ opacity: 0.7 }}> · venc. {new Date(`${p.vencimento}T00:00:00`).toLocaleDateString('pt-BR')}</span>
                                                                                )}
                                                                            </span>
                                                                            <span>
                                                                                {brl(p.valor)}{' '}
                                                                                <Tag color={SELO_DA_PARCELA[p.estado].cor}>
                                                                                    {rotuloDaParcela(p)}
                                                                                </Tag>
                                                                            </span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                        <div style={{ marginBottom: 6 }}>
                                                            <strong>Data:</strong> {new Date(entry.date).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' })}
                                                        </div>
                                                        {entry.attachmentDescription && (
                                                            <div style={{ marginBottom: 6 }}>
                                                                <strong>Descrição do anexo:</strong> {entry.attachmentDescription}
                                                            </div>
                                                        )}
                                                        {entry.downloadUrl && (
                                                            <div style={{ marginTop: 8 }}>
                                                                <a
                                                                    href={entry.downloadUrl}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    onClick={(e) => e.stopPropagation()}
                                                                    style={{
                                                                        display: 'inline-flex', alignItems: 'center', gap: 6,
                                                                        padding: '6px 12px', background: '#111c2e', border: '1px solid rgba(255,255,255,0.1)',
                                                                        borderRadius: 6, fontSize: 12, color: '#e2e8f0',
                                                                        textDecoration: 'none',
                                                                    }}
                                                                >
                                                                    <DownloadOutlined /> Baixar {entry.fileName}
                                                                    {entry.fileSize != null && (
                                                                        <span style={{ color: '#64748b' }}>({(entry.fileSize / 1024).toFixed(0)} KB)</span>
                                                                    )}
                                                                </a>
                                                            </div>
                                                        )}
                                                        {entry.attachments && entry.attachments.length > 0 && (
                                                            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                                                <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>
                                                                    <PaperClipOutlined style={{ marginRight: 4 }} />Anexos ({entry.attachments.length})
                                                                </div>
                                                                {entry.attachments.map((att, idx) => (
                                                                    <a
                                                                        key={idx}
                                                                        href={att.url}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        onClick={(e) => e.stopPropagation()}
                                                                        style={{
                                                                            display: 'inline-flex', alignItems: 'center', gap: 6,
                                                                            padding: '6px 12px', background: '#111c2e', border: '1px solid rgba(122,90,248,0.3)',
                                                                            borderRadius: 6, fontSize: 12, color: '#e2e8f0',
                                                                            textDecoration: 'none',
                                                                        }}
                                                                    >
                                                                        <DownloadOutlined style={{ color: '#7A5AF8' }} /> {att.name}
                                                                        {att.size != null && (
                                                                            <span style={{ color: '#64748b' }}>({(att.size / 1024).toFixed(0)} KB)</span>
                                                                        )}
                                                                    </a>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )
                })}
            </div>
        )
}
