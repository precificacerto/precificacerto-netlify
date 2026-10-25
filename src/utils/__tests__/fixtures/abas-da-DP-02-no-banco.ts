/**
 * As abas da DP-02 (`abas-do-motor-wolff-DP-02.json`, extraídas pelo dono do produto do arquivo da
 * Wolff) na forma em que a IMPORTAÇÃO as grava: uma lista de linhas por tabela do banco, convertidas
 * pelo MESMO mapa (`ABAS_DO_MOTOR` + `linhaDoBanco`) que a importação usa, com `ordem` = linha da aba.
 * É o que o banco falso dos testes do levantamento e da conversa recebe no lugar do JSON.
 *
 * Só as abas por tipologia que o fixture traz; a Otimização é parâmetro do fornecedor, e a Insumos
 * não está no fixture. Uma coluna do mapa que o fixture não traz no cabeçalho é ERRO aqui: o valor
 * entraria NULL em silêncio.
 */
import { ABAS_DO_MOTOR, linhaDoBanco, type LinhaDoBanco } from '@/utils/atendimentos-ia-abas-do-motor'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ABAS = require('@/lib/atendimentos-ia/abas-do-motor-wolff-DP-02.json') as Record<string, { cabecalho?: string[]; linhas: Array<Record<string, unknown>> }>

export type LinhaGravada = LinhaDoBanco & { id: string; tabela_id: string }

/** tabela do banco → linhas, todas com `tabela_id` e um `id` estável. */
export function abasDaDP02NoBanco(tabelaId: string): Record<string, LinhaGravada[]> {
    const saida: Record<string, LinhaGravada[]> = {}
    for (const aba of ABAS_DO_MOTOR) {
        const fonte = ABAS[aba.nome]
        if (!aba.porTipologia || !fonte) continue
        const faltando = aba.colunas.filter((c) => !(fonte.cabecalho ?? []).includes(c.cabecalho)).map((c) => c.cabecalho)
        if (faltando.length) throw new Error(`o fixture da DP-02, aba "${aba.nome}", não tem no cabeçalho: ${faltando.join(', ')}`)
        saida[aba.tabela] = fonte.linhas.map((valores, i) => {
            const r = linhaDoBanco(aba, valores, i + 2)
            if ('erros' in r) throw new Error(r.erros.join(' '))
            return { id: `${aba.tabela}-${tabelaId}-${String(i + 2).padStart(5, '0')}`, tabela_id: tabelaId, ...r.linha }
        })
    }
    return saida
}
