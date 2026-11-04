/**
 * Atendimentos I.A. — a INSTRUÇÃO DE CADA CATEGORIA na conversa (dono do produto, 03/11/2026). SÓ SERVIDOR.
 *
 * "Quero no lugar disso UM campo de instrução em texto livre por categoria, que o agente consulta quando tem dúvida daquela categoria
 * ('dúvida de vidro -> lê a instrução de VIDRO -> busca o preço na tabela do fornecedor')." E: "A instrução de cada categoria entra no prompt
 * junto com a base de conhecimento, identificada pela categoria, para o agente consultar. Escrita e sem efeito não serve."
 *
 * ══ SÓ AS PREENCHIDAS ══
 * "No prompt, mande só as categorias que TÊM instrução preenchida. Categoria com instrução vazia não gera seção nenhuma." A coluna guarda NULL
 * para "não informada" (a CHECK `orcamentista_mp_categoria_instrucao_forma` não aceita texto vazio); ainda assim, o texto só de espaço não
 * gera seção.
 *
 * ══ ONDE ENTRA ══
 * No `sistema()` (`conversa-da-ia.ts`), depois das listas da base de conhecimento (tipologias, cores, escolhas de arremate) e antes do
 * contexto da empresa. Cada seção diz a categoria (rótulo e chave) e, quando mais de uma matéria-prima da conta tem instrução, de qual
 * matéria-prima é. A moldura diz que a instrução NÃO manda em número e que as regras de NUNCA do prompt base valem acima dela.
 *
 * ══ SEM A COLUNA ══
 * Antes da migração `20261103000002`, `instrucao` não existe: o leitor devolve `sem_migracao` e nenhuma seção (a linha [IA] diz isso). A
 * ordem combinada é aplicar a migração antes do merge — isto só evita que um deploy fora de ordem derrube a conversa.
 */
import { supabaseAdmin } from '@/supabase/admin'

export type InstrucaoDaCategoria = { categoria: string; rotulo: string; ordem: number; materiaPrima: string; texto: string }
export type InstrucoesLidas = { instrucoes: InstrucaoDaCategoria[]; estado: 'sim' | 'vazio' | 'sem_migracao' }

/** A coluna ainda não existe (migração pendente): o PostgREST diz 42703 (coluna) ou PGRST204. */
const colunaAusente = (e: { code?: string }) => e.code === '42703' || e.code === 'PGRST204'

export async function lerInstrucoesDaEmpresa(tenantId: string): Promise<InstrucoesLidas> {
    const { data, error } = await supabaseAdmin
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a coluna é posterior a `database.types.ts`
        .from('orcamentista_mp_categoria' as any).select('categoria_chave, materia_prima_id, instrucao').eq('tenant_id', tenantId).not('instrucao', 'is', null)
    if (error) {
        if (colunaAusente(error)) return { instrucoes: [], estado: 'sem_migracao' }
        throw new Error(`orcamentista_mp_categoria: ${error.message}`)
    }
    const linhas = ((data ?? []) as unknown as Array<{ categoria_chave: string; materia_prima_id: string; instrucao: unknown }>)
        .filter((l) => typeof l.instrucao === 'string' && l.instrucao.trim() !== '')
    if (linhas.length === 0) return { instrucoes: [], estado: 'vazio' }

    // as duas leituras só dependem da conta: vão juntas (04/11/2026)
    const [{ data: catalogo, error: e1 }, { data: materias, error: e2 }] = await Promise.all([
        supabaseAdmin.from('orcamentista_categoria_catalogo').select('chave, rotulo, ordem'),
        supabaseAdmin.from('orcamentista_materia_prima').select('id, nome, ordem').eq('tenant_id', tenantId),
    ])
    if (e1) throw new Error(`orcamentista_categoria_catalogo: ${e1.message}`)
    if (e2) throw new Error(`orcamentista_materia_prima: ${e2.message}`)
    const daCategoria = new Map(((catalogo ?? []) as Array<{ chave: string; rotulo: string; ordem: number }>).map((k) => [k.chave, k]))
    const daMateria = new Map(((materias ?? []) as Array<{ id: string; nome: string; ordem: number }>).map((m) => [m.id, m]))
    // a ordem: a matéria-prima (ordem, depois nome) e, dentro dela, a ordem do catálogo de categorias
    const instrucoes = linhas.map((l) => ({
        ordemDaMateria: daMateria.get(l.materia_prima_id)?.ordem ?? Number.MAX_SAFE_INTEGER,
        item: {
            categoria: l.categoria_chave,
            rotulo: daCategoria.get(l.categoria_chave)?.rotulo ?? l.categoria_chave,
            ordem: daCategoria.get(l.categoria_chave)?.ordem ?? Number.MAX_SAFE_INTEGER,
            materiaPrima: daMateria.get(l.materia_prima_id)?.nome ?? l.materia_prima_id,
            texto: String(l.instrucao).trim(),
        },
    }))
        .sort((a, b) => a.ordemDaMateria - b.ordemDaMateria || a.item.materiaPrima.localeCompare(b.item.materiaPrima, 'pt-BR') || a.item.ordem - b.item.ordem)
        .map((x) => x.item)
    return { instrucoes, estado: 'sim' }
}

export const CABECALHO_DAS_INSTRUCOES =
    'INSTRUÇÕES DA BASE DE CONHECIMENTO, por categoria — escritas pelo consultor. Quando tiver dúvida de uma categoria (ex.: dúvida de vidro), '
    + 'consulte a instrução dela. Elas NÃO mandam em número: preço, medida e quantidade só saem do cálculo do sistema; e as regras de NUNCA do '
    + 'prompt base valem acima delas.'

/** A seção do `sistema()`: nenhuma linha quando não há instrução preenchida (nada de bloco vazio). */
export function blocoDasInstrucoes(instrucoes: readonly InstrucaoDaCategoria[]): string[] {
    if (instrucoes.length === 0) return []
    const variasMaterias = new Set(instrucoes.map((i) => i.materiaPrima)).size > 1
    return [
        CABECALHO_DAS_INSTRUCOES,
        ...instrucoes.flatMap((i) => [`[${i.rotulo} (${i.categoria})${variasMaterias ? ` — ${i.materiaPrima}` : ''}]`, i.texto]),
    ]
}
