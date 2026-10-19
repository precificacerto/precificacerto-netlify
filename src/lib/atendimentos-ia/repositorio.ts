/**
 * Atendimentos I.A. — o acesso ao banco e ao Storage do catálogo. SÓ SERVIDOR: usa
 * `supabaseAdmin` (`service_role`), e só as rotas de `src/pages/api/super-admin/atendimentos-ia/`
 * o importam. É o único lugar fora das rotas onde as quatro tabelas são lidas — portão
 * `atendimentos-ia-a-tela-nao-fala-com-o-banco.test.ts`.
 *
 * As leituras são consultas SIMPLES, juntadas aqui, e não `select` com embutido do PostgREST:
 * `orcamentista_conta_tabela` tem duas FKs (para `tenants` e para `orcamentista_tabela`), e um
 * embutido ambíguo vira erro em produção que nenhum teste com cliente falso enxerga. As tabelas
 * são pequenas — catálogo da plataforma, não dado de conta.
 *
 * Todo erro do banco SOBE com o `code` do Postgres (`ErroDoBanco`): é a rota que decide o que
 * fazer com um 23503, e ela nunca o engole.
 */
import { supabaseAdmin } from '@/supabase/admin'
import {
    BUCKET_DO_CATALOGO,
    type CorpoDaTabela,
    type FornecedorComTabelas,
    type FornecedorDaLista,
    type Modelo,
    type Nicho,
    type TabelaDoFornecedor,
} from '@/utils/atendimentos-ia-catalogo'

export class ErroDoBanco extends Error {
    code: string | null
    constructor(e: { message?: string; code?: string } | null) {
        super(e?.message ?? 'erro do banco')
        this.code = e?.code ?? null
    }
}

// O cliente admin não tem os tipos destas tabelas (`database.types.ts` é anterior a elas).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>

async function q<T = Linha[]>(p: PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>): Promise<T> {
    const { data, error } = await p
    if (error) throw new ErroDoBanco(error)
    return data as T
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin as any

// ── Nomes das contas — a resposta de "quem usa" é sempre por NOME ──────────────────────────
async function nomesDasContas(tenantIds: string[]): Promise<Record<string, string>> {
    const ids = [...new Set(tenantIds)]
    if (ids.length === 0) return {}
    const linhas = await q(db().from('tenants').select('id, name').in('id', ids))
    return Object.fromEntries(linhas.map((l: Linha) => [l.id, l.name as string]))
}

async function usoPorTabela(tabelaIds: string[]): Promise<Record<string, string[]>> {
    if (tabelaIds.length === 0) return {}
    const usos = await q(db().from('orcamentista_conta_tabela').select('tenant_id, tabela_id').in('tabela_id', tabelaIds))
    const nomes = await nomesDasContas(usos.map((u: Linha) => u.tenant_id))
    const out: Record<string, string[]> = {}
    for (const u of usos) (out[u.tabela_id] ||= []).push(nomes[u.tenant_id] ?? u.tenant_id)
    return out
}

// ── Nichos ─────────────────────────────────────────────────────────────────────────────────
export async function listarNichos(): Promise<Nicho[]> {
    return q(db().from('orcamentista_nicho').select('id, modelo, nome, ativo').order('modelo').order('nome'))
}

export async function criarNicho(n: { modelo: Modelo; nome: string; criado_por: string }): Promise<Nicho> {
    return q(db().from('orcamentista_nicho').insert(n).select('id, modelo, nome, ativo').single())
}

export async function excluirNicho(id: string): Promise<number> {
    const linhas = await q(db().from('orcamentista_nicho').delete().eq('id', id).select('id'))
    return linhas.length
}

/** Quem SEGURA um nicho: fornecedores dele e contas configuradas com ele. */
export async function quemSeguraONicho(id: string): Promise<{ fornecedores: string[]; contas: string[] }> {
    const fs = await q(db().from('orcamentista_fornecedor').select('nome').eq('nicho_id', id))
    const cfg = await q(db().from('orcamentista_config').select('tenant_id').eq('nicho_id', id))
    const nomes = await nomesDasContas(cfg.map((c: Linha) => c.tenant_id))
    return { fornecedores: fs.map((f: Linha) => f.nome), contas: cfg.map((c: Linha) => nomes[c.tenant_id] ?? c.tenant_id) }
}

// ── Fornecedores ───────────────────────────────────────────────────────────────────────────
async function montarLista(fornecedores: Linha[]): Promise<FornecedorComTabelas[]> {
    const nichoIds = [...new Set(fornecedores.map((f) => f.nicho_id))]
    const nichos: Linha[] = nichoIds.length ? await q(db().from('orcamentista_nicho').select('id, modelo, nome').in('id', nichoIds)) : []
    const fIds = fornecedores.map((f) => f.id)
    const tabelas: Linha[] = fIds.length
        ? await q(db().from('orcamentista_tabela').select('id, fornecedor_id, arquivo_nome, arquivo_path, motor_nome, motor_path, vigencia, criado_em').in('fornecedor_id', fIds).order('criado_em', { ascending: false }))
        : []
    const uso = await usoPorTabela(tabelas.map((t) => t.id))
    return fornecedores.map((f) => {
        const nicho = nichos.find((n) => n.id === f.nicho_id)
        const daqui: TabelaDoFornecedor[] = tabelas.filter((t) => t.fornecedor_id === f.id).map((t) => ({ ...(t as TabelaDoFornecedor), contas_usando: uso[t.id] ?? [] }))
        return {
            id: f.id,
            nome: f.nome,
            nicho_id: f.nicho_id,
            nicho_nome: nicho?.nome ?? '—',
            modelo: nicho?.modelo,
            tabelas: daqui.length,
            contas_usando: [...new Set(daqui.flatMap((t) => t.contas_usando))],
            tabelas_da_lista: daqui,
        }
    })
}

export async function listarFornecedores(): Promise<FornecedorDaLista[]> {
    const fs = await q(db().from('orcamentista_fornecedor').select('id, nome, nicho_id').order('nome'))
    return (await montarLista(fs)).map((f) => ({
        id: f.id, nome: f.nome, nicho_id: f.nicho_id, nicho_nome: f.nicho_nome, modelo: f.modelo, tabelas: f.tabelas, contas_usando: f.contas_usando,
    }))
}

export async function obterFornecedor(id: string): Promise<FornecedorComTabelas | null> {
    const fs = await q(db().from('orcamentista_fornecedor').select('id, nome, nicho_id').eq('id', id))
    if (fs.length === 0) return null
    return (await montarLista(fs))[0]
}

export async function criarFornecedor(f: { nome: string; nicho_id: string; criado_por: string }): Promise<{ id: string }> {
    return q(db().from('orcamentista_fornecedor').insert(f).select('id').single())
}

export async function atualizarFornecedor(id: string, f: { nome: string; nicho_id: string }): Promise<number> {
    const linhas = await q(db().from('orcamentista_fornecedor').update(f).eq('id', id).select('id'))
    return linhas.length
}

export async function excluirFornecedor(id: string): Promise<number> {
    const linhas = await q(db().from('orcamentista_fornecedor').delete().eq('id', id).select('id'))
    return linhas.length
}

/** Quem SEGURA um fornecedor: as tabelas dele, e as contas que usam alguma delas. */
export async function quemSeguraOFornecedor(id: string): Promise<{ tabelas: string[]; contas: string[] }> {
    const ts = await q(db().from('orcamentista_tabela').select('id, arquivo_nome').eq('fornecedor_id', id))
    const uso = await usoPorTabela(ts.map((t: Linha) => t.id))
    return { tabelas: ts.map((t: Linha) => t.arquivo_nome), contas: [...new Set(Object.values(uso).flat())] }
}

// ── Tabelas ────────────────────────────────────────────────────────────────────────────────
export async function obterTabela(id: string): Promise<{ id: string; fornecedor_id: string; arquivo_path: string; motor_path: string } | null> {
    const ts = await q(db().from('orcamentista_tabela').select('id, fornecedor_id, arquivo_path, motor_path').eq('id', id))
    return (ts[0] as { id: string; fornecedor_id: string; arquivo_path: string; motor_path: string } | undefined) ?? null
}

export async function criarTabela(t: CorpoDaTabela & { criado_por: string }): Promise<{ id: string }> {
    return q(db().from('orcamentista_tabela').insert(t).select('id').single())
}

export async function atualizarTabela(id: string, campos: Record<string, string | null>): Promise<number> {
    const linhas = await q(db().from('orcamentista_tabela').update(campos).eq('id', id).select('id'))
    return linhas.length
}

export async function excluirTabela(id: string): Promise<number> {
    const linhas = await q(db().from('orcamentista_tabela').delete().eq('id', id).select('id'))
    return linhas.length
}

export async function contasQueUsamATabela(id: string): Promise<string[]> {
    return (await usoPorTabela([id]))[id] ?? []
}

// ── Storage — sempre o bucket do catálogo, sempre com `service_role` ───────────────────────
const bucket = () => supabaseAdmin.storage.from(BUCKET_DO_CATALOGO)

/** Assina UM envio para UM caminho que a rota escolheu. O token vale para esse caminho só. */
export async function assinarEnvio(caminho: string): Promise<{ signedUrl: string; path: string }> {
    const { data, error } = await bucket().createSignedUploadUrl(caminho)
    if (error || !data) throw new ErroDoBanco({ message: error?.message ?? 'sem url de envio' })
    return { signedUrl: data.signedUrl, path: data.path }
}

export async function objetoExiste(caminho: string): Promise<boolean> {
    const { data, error } = await bucket().exists(caminho)
    if (error) return false
    return data === true
}

/** Remove objetos. NÃO lança: devolve o erro, para a rota decidir — ver a exclusão da tabela. */
export async function removerObjetos(caminhos: string[]): Promise<{ erro: string | null }> {
    if (caminhos.length === 0) return { erro: null }
    const { error } = await bucket().remove(caminhos)
    return { erro: error ? (error.message ?? 'erro do Storage') : null }
}

export async function fornecedorExiste(id: string): Promise<boolean> {
    const fs = await q(db().from('orcamentista_fornecedor').select('id').eq('id', id))
    return fs.length > 0
}

// ── Para as rotas: o código do erro, e o 500 que nunca engole a causa no log ───────────────
export const codigoDoErro = (e: unknown): string | null => (e instanceof ErroDoBanco ? e.code : ((e as { code?: string })?.code ?? null))

export function falhaInterna(res: { status: (n: number) => { json: (b: unknown) => unknown } }, contexto: string, e: unknown, mensagem: string) {
    console.error(`atendimentos-ia ${contexto}:`, (e as { message?: string })?.message ?? 'erro', codigoDoErro(e) ?? '')
    return res.status(500).json({ error: mensagem })
}
