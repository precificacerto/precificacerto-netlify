/**
 * As ETAPAS de uma família — a leitura. SÓ SERVIDOR (`supabaseAdmin`). A gravação é a função
 * `superadmin_gravar_etapas_da_familia` (migração 20261027000003), chamada pela rota; aqui só se lê.
 *
 * Etapa é do CATÁLOGO da plataforma (por família), não de uma empresa: número, rótulo livre, ação da lista
 * fechada, instrução e as abas da planilha que ela carrega (`src/utils/atendimentos-ia-etapas.ts`). Nada
 * disto muda o cálculo: quem lê as etapas na conversa é o PR D.
 *
 * Família que não existe é `null` — a rota responde 404. Família sem etapa é a lista vazia: ainda não foi cadastrada.
 */
import { supabaseAdmin } from '@/supabase/admin'
import { contasQueUsamAFamilia } from '@/lib/atendimentos-ia/tabelas-da-conta'
import { ABAS_DA_ETAPA, ehAcaoDaEtapa, type AbaDaEtapa, type EtapaDaFamilia, type MotorDaFamilia } from '@/utils/atendimentos-ia-etapas'

// O cliente admin não tem os tipos destas tabelas.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin as any

async function ler(onde: string, p: PromiseLike<{ data: unknown; error: { message?: string } | null }>): Promise<unknown> {
    const { data, error } = await p
    if (error) throw new Error(`${onde}: ${error.message ?? 'erro do banco'}`)
    return data
}

export async function lerEtapasDaFamilia(familia: string): Promise<EtapaDaFamilia[] | null> {
    const existe = (await ler('orcamentista_familia_catalogo', db().from('orcamentista_familia_catalogo').select('chave').eq('chave', familia).maybeSingle())) as Linha | null
    if (!existe) return null
    const linhas = ((await ler('orcamentista_familia_etapa',
        db().from('orcamentista_familia_etapa').select('id, numero, rotulo, acao, instrucao, abas, motor_id').eq('familia', familia).order('numero', { ascending: true }))) ?? []) as Linha[]
    return linhas.map((l) => {
        // a CHECK do banco garante a ação e as abas; se uma linha fugir disso, é erro — nunca uma etapa sem ação
        if (!ehAcaoDaEtapa(l.acao)) throw new Error(`orcamentista_familia_etapa: a etapa ${l.numero} tem a ação "${String(l.acao)}", que não é da lista`)
        const abas = ((l.abas ?? []) as unknown[]).filter((a): a is AbaDaEtapa => typeof a === 'string' && (ABAS_DA_ETAPA as readonly string[]).includes(a))
        return { id: String(l.id), numero: Number(l.numero), rotulo: String(l.rotulo), acao: l.acao, instrucao: String(l.instrucao ?? ''), abas, motor_id: l.motor_id == null ? null : String(l.motor_id) }
    })
}

/**
 * As planilhas que uma etapa da família pode apontar: `orcamentista_motor` da MESMA família e NÃO arquivadas — as mesmas que a função
 * `superadmin_gravar_etapas_da_familia` aceita (20261027000008). O nome do fornecedor é só rótulo; a planilha da família não tem.
 */
export async function lerMotoresDaFamilia(familia: string): Promise<MotorDaFamilia[]> {
    const motores = ((await ler('orcamentista_motor', db().from('orcamentista_motor').select('id, arquivo_nome, fornecedor_id, vigente, criado_em').eq('familia', familia).is('arquivado_em', null).order('criado_em', { ascending: true }))) ?? []) as Linha[]
    const ids = [...new Set(motores.map((m) => m.fornecedor_id).filter((f): f is string => typeof f === 'string'))]
    const nomes = new Map<string, string>()
    if (ids.length > 0) {
        for (const f of ((await ler('orcamentista_fornecedor', db().from('orcamentista_fornecedor').select('id, nome').in('id', ids))) ?? []) as Linha[]) nomes.set(String(f.id), String(f.nome))
    }
    return motores.map((m) => ({ id: String(m.id), arquivo_nome: String(m.arquivo_nome), fornecedor: m.fornecedor_id == null ? null : nomes.get(String(m.fornecedor_id)) ?? null, vigente: m.vigente === true }))
}

/** A família existe no catálogo? A rota do motor da etapa pergunta antes de assinar o envio. */
export async function familiaExiste(familia: string): Promise<boolean> {
    return (await ler('orcamentista_familia_catalogo', db().from('orcamentista_familia_catalogo').select('chave').eq('chave', familia).maybeSingle())) !== null
}

/** A etapa é desta família? A função do banco também confere; a rota pergunta para responder 404 com a frase certa antes de baixar o arquivo. */
export async function etapaEDaFamilia(familia: string, etapaId: string): Promise<boolean> {
    return (await ler('orcamentista_familia_etapa', db().from('orcamentista_familia_etapa').select('id').eq('id', etapaId).eq('familia', familia).maybeSingle())) !== null
}

/**
 * Os NOMES das contas que usam a família — o aviso de que a etapa e o motor são globais (opção A). Só o nome da conta, nunca dado dela:
 * o mesmo critério e o mesmo nível de detalhe do bloco Motor da conta.
 */
export async function nomesDasContasDaFamilia(familia: string): Promise<string[]> {
    const ids = await contasQueUsamAFamilia(familia)
    if (ids.length === 0) return []
    const contas = ((await ler('tenants', db().from('tenants').select('id, name').in('id', ids))) ?? []) as Linha[]
    return contas.map((c) => String(c.name)).sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

/** Erro do banco com o CÓDIGO (SQLSTATE) e a mensagem da função, para a rota decidir o status e a frase. */
export class ErroDaFuncao extends Error {
    code: string | null
    constructor(e: { message?: string; code?: string | null }) { super(e.message ?? 'erro do banco'); this.code = e.code ?? null }
}

/**
 * `superadmin_criar_motor_da_etapa` (20261027000010): cria o motor da família, grava as 12 tabelas por `motor_id`, registra a importação
 * e aponta a etapa, numa transação só. Devolve as contagens que a função gravou. Falha LANÇA `ErroDaFuncao` com o código.
 */
export async function criarMotorDaEtapa(a: { etapaId: string; por: string; arquivoPath: string; arquivoNome: string; payload: unknown }): Promise<Record<string, unknown>> {
    const { data, error } = await db().rpc('superadmin_criar_motor_da_etapa', {
        p_etapa: a.etapaId, p_por: a.por, p_arquivo_path: a.arquivoPath, p_arquivo_nome: a.arquivoNome, p_payload: a.payload,
    })
    if (error) throw new ErroDaFuncao(error)
    return data as Record<string, unknown>
}
