/**
 * use-deleted-documents.hook.ts — a carga do filtro "mostrar excluídos", em UM lugar só.
 *
 * POR QUE UMA CONSULTA SEPARADA, E NÃO UM `or` NA CONSULTA PRINCIPAL
 * ------------------------------------------------------------------
 * As três listas carregam com `.eq('is_active', true)`, e o excluído tem `is_active = false`
 * — logo ele nunca vem na consulta padrão, que é exatamente o comportamento desejado. Alargar
 * a consulta principal para trazê-lo e filtrar depois faria os excluídos passarem por TODOS
 * os consumidores dessas cargas (`useBudgets` é hook compartilhado), e bastaria um deles não
 * filtrar para o excluído reaparecer numa tela que não pediu. Buscar à parte, só quando o
 * usuário liga o filtro, não tem esse vazamento.
 *
 * E É POR ISSO QUE ESTE MÓDULO EXISTE EM VEZ DE TRÊS CÓPIAS: o mesmo bloco em Orçamentos,
 * Pedidos e Vendas seria a quinta aparição da CÓPIA DIVERGENTE
 * (`.claude/rules/copia-divergente.md`), na mesma rodada em que a quarta foi corrigida.
 */
import { useEffect, useState } from 'react'
import { supabase } from '@/supabase/client'
import { STATUS_EXCLUIDO } from '@/utils/document-deleted'

/** As três tabelas de documento que ganham o filtro. */
export type DeletableDocumentTable = 'budgets' | 'orders' | 'sales'

/**
 * Carrega os documentos EXCLUÍDOS da tabela, e só quando `enabled` é true.
 *
 * Devolve `[]` enquanto desligado — nunca `null`, para que a concatenação na tela seja
 * incondicional e não precise de guarda.
 */
export function useDeletedDocuments<T = Record<string, unknown>>(
    table: DeletableDocumentTable,
    select: string,
    enabled: boolean,
): { deleted: T[]; loading: boolean } {
    const [deleted, setDeleted] = useState<T[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        let cancelado = false
        if (!enabled) {
            setDeleted([])
            return
        }
        setLoading(true)
        void (async () => {
            const { data, error } = await supabase
                .from(table)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .select(select as any)
                .eq('status', STATUS_EXCLUIDO)
            if (cancelado) return
            if (error) {
                console.warn(`[useDeletedDocuments] ${table}:`, error.message)
                setDeleted([])
            } else {
                setDeleted((data || []) as T[])
            }
            setLoading(false)
        })()
        return () => {
            cancelado = true
        }
    }, [table, select, enabled])

    return { deleted, loading }
}
