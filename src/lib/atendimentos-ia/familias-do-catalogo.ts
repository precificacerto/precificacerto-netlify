/**
 * As FAMÍLIAS DO CATÁLOGO como as rotas as leem (29/10/2026, migração 20261029000004): o nome e as ramificações de cada uma, e a conferência
 * das ramificações contra o catálogo de categorias. SÓ SERVIDOR. A gravação é das funções do banco (`criarFamilia`, `editarFamilia`,
 * `removerFamilia`, no repositório).
 */
import { listarCategorias, listarFamilias, listarRamificacoes } from '@/lib/atendimentos-ia/repositorio'
import type { FamiliaDoCatalogo } from '@/utils/atendimentos-ia-catalogo'

/** As famílias na ordem, cada uma com as ramificações dela na ordem dela. */
export async function familiasDoCatalogo(): Promise<FamiliaDoCatalogo[]> {
    const [familias, ramificacoes] = await Promise.all([listarFamilias(), listarRamificacoes()])
    return familias
        .sort((a, b) => a.ordem - b.ordem)
        .map((f) => ({ ...f, ramificacoes: ramificacoes.filter((r) => r.familia === f.chave).sort((a, b) => a.ordem - b.ordem).map((r) => r.categoria_chave) }))
}

/** As ramificações que não são do catálogo de categorias, na ordem em que vieram. */
export async function ramificacoesForaDoCatalogo(ramificacoes: readonly string[]): Promise<string[]> {
    const chaves = new Set((await listarCategorias()).map((c) => c.chave))
    return ramificacoes.filter((r) => !chaves.has(r))
}
export const fraseDaRamificacaoForaDoCatalogo = (fora: readonly string[]) => `Categoria fora do catálogo: ${fora.join(', ')}.`
