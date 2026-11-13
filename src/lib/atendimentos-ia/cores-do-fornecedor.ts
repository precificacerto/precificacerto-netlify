/**
 * A TABELA DE CORES DO FORNECEDOR (`orcamentista_fornecedor_cor`, migração 20261112000006): o dígito que o fornecedor cola no código para cada cor,
 * por grupo (PERFIS DE PVC, ACESSORIOS). Lida aqui, uma vez, para a resolução de referência (`resolucao-de-referencia.ts`) do cálculo e da
 * conferência. Dono do produto, 12/11/2026: "Conhecimento do fornecedor não vai para o código."
 *
 * SEM A MIGRAÇÃO a tabela não existe: a leitura devolve a lista vazia e diz `sem_migracao` — o degrau "código + cor" não acha nada, e o que ele
 * acharia vira falta nomeada (nunca palpite). Qualquer outro erro do banco é erro.
 */
import { supabaseAdmin } from '@/supabase/admin'
import type { CorDoFornecedor } from './resolucao-de-referencia'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a tabela é posterior a `database.types.ts`
const db = () => supabaseAdmin as any
const tabelaAusente = (e: { code?: string } | null | undefined) => e?.code === '42P01' || e?.code === 'PGRST205'

export type CoresDosFornecedores = { porFornecedor: Map<string, CorDoFornecedor[]>; leitura: 'lida' | 'sem_migracao' }

export async function lerCoresDosFornecedores(fornecedorIds: readonly string[]): Promise<CoresDosFornecedores> {
    const porFornecedor = new Map<string, CorDoFornecedor[]>()
    if (fornecedorIds.length === 0) return { porFornecedor, leitura: 'lida' }
    const { data, error } = await db().from('orcamentista_fornecedor_cor').select('fornecedor_id, grupo, codigo, nome').in('fornecedor_id', [...new Set(fornecedorIds)])
    if (error && tabelaAusente(error)) return { porFornecedor, leitura: 'sem_migracao' }
    if (error) throw new Error(`orcamentista_fornecedor_cor: ${error.message}`)
    for (const c of (data ?? []) as Array<{ fornecedor_id: string; grupo: string; codigo: string; nome: string }>) {
        porFornecedor.set(c.fornecedor_id, [...(porFornecedor.get(c.fornecedor_id) ?? []), { grupo: c.grupo, codigo: c.codigo, nome: c.nome }])
    }
    return { porFornecedor, leitura: 'lida' }
}
