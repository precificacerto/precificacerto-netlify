/**
 * A TABELA DO VENDEDOR onde o orçamento I.A. entra como produto (dono do produto, 16/11/2026).
 *
 * Formulação do dono do produto, registrada como está: "Todo orçamento salvo pode ser aberto na tabela. Então, automaticamente ele já grava
 * na tabela do Cristiano, que é o vendedor. E automaticamente, quando for lá [no orçamento comercial], já consegue puxar daquela tabela." E:
 * "salva na tabela informada na conversa do whats" — o vendedor é o da conversa (o do levantamento que originou o orçamento).
 *
 * A tabela é a de PRODUTOS (`commission_tables.type = 'PRODUCT'`) ligada ao vendedor (`employee_commission_tables`). Uma só: é ela. Nenhuma,
 * ou mais de uma: a precificação salva normalmente, e o orçamento NÃO entra em tabela nenhuma — a tela diz por quê, nomeando. Nunca se escolhe
 * uma entre várias.
 *
 * SÓ SERVIDOR na leitura (`tabelaDoVendedorDoOrcamento`); a decisão (`decidirTabela`) é pura.
 */
import { supabaseAdmin } from '@/supabase/admin'

export type TabelaDoVendedor = { id: string; nome: string }
export type DestinoDoOrcamento = { tabela: TabelaDoVendedor; aviso: null } | { tabela: null; aviso: string }

const ANTES = 'A precificação foi salva, mas o orçamento não entrou em tabela de produtos'

/** A decisão, pura: o vendedor e as tabelas de produtos dele. */
export function decidirTabela(vendedor: { id: string | null; nome: string | null }, tabelas: readonly TabelaDoVendedor[]): DestinoDoOrcamento {
    if (!vendedor.id) return { tabela: null, aviso: `${ANTES}: o orçamento não tem vendedor (não veio de uma conversa com vendedor identificado).` }
    const quem = vendedor.nome ? `o vendedor ${vendedor.nome}` : 'o vendedor da conversa'
    if (tabelas.length === 0) return { tabela: null, aviso: `${ANTES}: ${quem} não tem tabela de produtos.` }
    if (tabelas.length > 1) {
        const nomes = [...tabelas].map((t) => `"${t.nome}"`).sort().join(', ')
        return { tabela: null, aviso: `${ANTES}: ${quem} tem ${tabelas.length} tabelas de produtos (${nomes}), e nenhuma é escolhida por conta própria.` }
    }
    return { tabela: tabelas[0], aviso: null }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin as any

/** O vendedor da conversa que originou o orçamento, e as tabelas de produtos dele — tudo no tenant do chamador. */
export async function tabelaDoVendedorDoOrcamento(tenantId: string, orcamentoId: string): Promise<DestinoDoOrcamento> {
    const o = await db().from('orcamentista_orcamento').select('levantamento_id').eq('tenant_id', tenantId).eq('id', orcamentoId).maybeSingle()
    if (o.error) throw new Error(`orcamentista_orcamento: ${o.error.message}`)
    const levantamentoId = (o.data as { levantamento_id: string | null } | null)?.levantamento_id ?? null
    let vendedor: { id: string | null; nome: string | null } = { id: null, nome: null }
    if (levantamentoId) {
        const l = await db().from('orcamentista_levantamento').select('vendedor_employee_id, vendedor_nome').eq('tenant_id', tenantId).eq('id', levantamentoId).maybeSingle()
        if (l.error) throw new Error(`orcamentista_levantamento: ${l.error.message}`)
        const d = l.data as { vendedor_employee_id: string | null; vendedor_nome: string | null } | null
        vendedor = { id: d?.vendedor_employee_id ?? null, nome: d?.vendedor_nome ?? null }
    }
    if (!vendedor.id) return decidirTabela(vendedor, [])
    const ligacoes = await db().from('employee_commission_tables').select('commission_table_id').eq('tenant_id', tenantId).eq('employee_id', vendedor.id)
    if (ligacoes.error) throw new Error(`employee_commission_tables: ${ligacoes.error.message}`)
    const ids = ((ligacoes.data ?? []) as Array<{ commission_table_id: string }>).map((x) => x.commission_table_id)
    if (ids.length === 0) return decidirTabela(vendedor, [])
    const t = await db().from('commission_tables').select('id, name').eq('tenant_id', tenantId).eq('type', 'PRODUCT').in('id', ids)
    if (t.error) throw new Error(`commission_tables: ${t.error.message}`)
    return decidirTabela(vendedor, ((t.data ?? []) as Array<{ id: string; name: string }>).map((x) => ({ id: x.id, nome: x.name })))
}
