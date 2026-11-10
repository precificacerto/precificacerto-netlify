/**
 * Os LEVANTAMENTOS I.A. (dono do produto, 11/11/2026): a lista dos levantamentos que a conversa gerou na empresa, para a seção Agentes I.A.
 * Só lê, sempre no tenant do chamador. O arquivo de cada um é a MESMA folha que a conversa envia (`arquivoDoLevantamentoGravado`).
 */
import { supabaseAdmin } from '@/supabase/admin'
import type { LinhaDoLevantamento } from './levantamentos-ia-tela'

export async function listarLevantamentos(tenantId: string): Promise<LinhaDoLevantamento[]> {
    const { data, error } = await supabaseAdmin.from('orcamentista_levantamento').select('id, numero, nome, estado, vendedor_nome, criado_em')
        .eq('tenant_id', tenantId).order('numero', { ascending: false })
    if (error) throw new Error(`orcamentista_levantamento: ${error.message}`)
    return (data ?? []) as unknown as LinhaDoLevantamento[]
}
