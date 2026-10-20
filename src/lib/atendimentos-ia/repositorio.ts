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
    type ContaLigada,
    type CorpoDaTabela,
    type FornecedorComTabelas,
    type FornecedorDoNicho,
    type FornecedorDaLista,
    type Modelo,
    type Nicho,
    type TabelaDoFornecedor,
    type TabelaEmUso,
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

/** Um nicho pelo id — para a rota dizer o que segura quando o banco recusa o par (modelo, nicho). */
export async function obterNicho(id: string): Promise<{ id: string; modelo: Modelo; nome: string } | null> {
    const ns = await q(db().from('orcamentista_nicho').select('id, modelo, nome').eq('id', id))
    return (ns[0] as { id: string; modelo: Modelo; nome: string } | undefined) ?? null
}

/** Quem SEGURA um nicho: fornecedores dele e contas configuradas com ele. */
export async function quemSeguraONicho(id: string): Promise<{ fornecedores: string[]; contas: string[] }> {
    const fs = await q(db().from('orcamentista_fornecedor').select('nome').eq('nicho_id', id))
    const cfg = await q(db().from('orcamentista_config').select('tenant_id').eq('nicho_id', id))
    const nomes = await nomesDasContas(cfg.map((c: Linha) => c.tenant_id))
    return { fornecedores: fs.map((f: Linha) => f.nome), contas: cfg.map((c: Linha) => nomes[c.tenant_id] ?? c.tenant_id) }
}

// ── Contas ligadas (bloco 2C.1) ────────────────────────────────────────────────────────────
/**
 * As contas com o Atendimentos I.A. LIGADO, com o nome, o modelo e o nicho.
 *
 * REGRA INVIOLÁVEL: a lista de contas e a tela de configuração mostram APENAS o
 * nome/identificação da conta e a configuração do Atendimentos I.A. NADA do conteúdo da conta —
 * nem clientes, nem orçamentos, nem funcionários, nem valores. O super admin não tem tenant e não
 * pode enxergar dado de cliente por construção.
 *
 * Por isso a linha é MONTADA campo a campo, e não espalhada de uma consulta: de `tenants` só se
 * lê `id, name` (`nomesDasContas`), de `orcamentista_config` só o modelo e o nicho. Valor do adicional,
 * teto e quem ligou ficam de fora — não são desta tela.
 */
export async function listarContasLigadas(): Promise<ContaLigada[]> {
    const cfg = await q(db().from('orcamentista_config').select('tenant_id, modelo, nicho_id').eq('ativo', true))
    const nomes = await nomesDasContas(cfg.map((c: Linha) => c.tenant_id))
    const nichoIds = [...new Set(cfg.map((c: Linha) => c.nicho_id).filter((id: string | null) => id != null))]
    const nichos = nichoIds.length ? await q(db().from('orcamentista_nicho').select('id, nome').in('id', nichoIds)) : []
    const nomeDoNicho = Object.fromEntries(nichos.map((n: Linha) => [n.id, n.nome as string]))
    return cfg
        .map((c: Linha): ContaLigada => ({
            tenant_id: c.tenant_id,
            nome: nomes[c.tenant_id] ?? c.tenant_id,
            modelo: c.modelo ?? null,
            nicho_id: c.nicho_id ?? null,
            nicho_nome: c.nicho_id ? (nomeDoNicho[c.nicho_id] ?? null) : null,
        }))
        .sort((a: ContaLigada, b: ContaLigada) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

// ── Tabelas em uso da conta ────────────────────────────────────────────────────────────────
/*
 * REGRA INVIOLÁVEL: a tela mostra apenas o nome da conta e a configuração do Atendimentos I.A.
 * Nada do conteúdo da conta. Estas leituras não tocam `tenants` — o nome da conta a tela já tem,
 * da lista de contas ligadas — e devolvem só o catálogo.
 */

/** O modelo e o nicho SALVOS da conta, ou `null` se a conta não tem configuração do Atendimentos I.A. */
export async function obterModeloENichoDaConta(tenantId: string): Promise<{ modelo: Modelo | null; nicho_id: string | null } | null> {
    const cfg = await q(db().from('orcamentista_config').select('tenant_id, modelo, nicho_id').eq('tenant_id', tenantId))
    if (cfg.length === 0) return null
    return { modelo: cfg[0].modelo ?? null, nicho_id: cfg[0].nicho_id ?? null }
}

/** As tabelas em uso pela conta, com fornecedor, arquivo, motor e a vigência como foi digitada. */
export async function listarTabelasDaConta(tenantId: string): Promise<TabelaEmUso[]> {
    const usos = await q(db().from('orcamentista_conta_tabela').select('tabela_id').eq('tenant_id', tenantId))
    const ids = usos.map((u: Linha) => u.tabela_id)
    if (ids.length === 0) return []
    const tabelas = await q(db().from('orcamentista_tabela').select('id, fornecedor_id, arquivo_nome, motor_nome, vigencia').in('id', ids))
    const fIds = [...new Set(tabelas.map((t: Linha) => t.fornecedor_id))]
    const fornecedores = fIds.length ? await q(db().from('orcamentista_fornecedor').select('id, nome').in('id', fIds)) : []
    const nomeDo = Object.fromEntries(fornecedores.map((f: Linha) => [f.id, f.nome as string]))
    return tabelas
        .map((t: Linha): TabelaEmUso => ({
            tabela_id: t.id,
            fornecedor_id: t.fornecedor_id,
            fornecedor_nome: nomeDo[t.fornecedor_id] ?? '—',
            arquivo_nome: t.arquivo_nome,
            motor_nome: t.motor_nome,
            vigencia: t.vigencia ?? null,
        }))
        .sort((a: TabelaEmUso, b: TabelaEmUso) => a.fornecedor_nome.localeCompare(b.fornecedor_nome, 'pt-BR') || a.arquivo_nome.localeCompare(b.arquivo_nome, 'pt-BR'))
}

/**
 * Os fornecedores de UM nicho, com as tabelas de cada um. O filtro é no banco, pelo nicho: a
 * lista da plataforma nunca sai daqui, nem quando o nicho não tem fornecedor — aí sai vazia.
 */
export async function listarFornecedoresDoNicho(nichoId: string): Promise<FornecedorDoNicho[]> {
    const fs = await q(db().from('orcamentista_fornecedor').select('id, nome').eq('nicho_id', nichoId).order('nome'))
    if (fs.length === 0) return []
    const tabelas = await q(db().from('orcamentista_tabela').select('id, fornecedor_id, arquivo_nome, motor_nome, vigencia').in('fornecedor_id', fs.map((f: Linha) => f.id)).order('criado_em', { ascending: false }))
    return fs
        .map((f: Linha): FornecedorDoNicho => ({
            id: f.id,
            nome: f.nome,
            tabelas: tabelas.filter((t: Linha) => t.fornecedor_id === f.id).map((t: Linha) => ({
                id: t.id, arquivo_nome: t.arquivo_nome, motor_nome: t.motor_nome, vigencia: t.vigencia ?? null,
            })),
        }))
        .sort((a: FornecedorDoNicho, b: FornecedorDoNicho) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

/** Uma tabela com o nicho do fornecedor dela — para a rota recusar tabela de outro nicho. */
export async function obterTabelaComNicho(tabelaId: string): Promise<{ arquivo_nome: string; fornecedor_nome: string; nicho_id: string } | null> {
    const ts = await q(db().from('orcamentista_tabela').select('id, fornecedor_id, arquivo_nome').eq('id', tabelaId))
    if (ts.length === 0) return null
    const fs = await q(db().from('orcamentista_fornecedor').select('id, nome, nicho_id').eq('id', ts[0].fornecedor_id))
    if (fs.length === 0) return null
    return { arquivo_nome: ts[0].arquivo_nome, fornecedor_nome: fs[0].nome, nicho_id: fs[0].nicho_id }
}

export async function adicionarTabelaNaConta(u: { tenant_id: string; tabela_id: string; criado_por: string }): Promise<void> {
    await q(db().from('orcamentista_conta_tabela').insert(u).select('tenant_id, tabela_id'))
}

export async function removerTabelaDaConta(tenantId: string, tabelaId: string): Promise<number> {
    const linhas = await q(db().from('orcamentista_conta_tabela').delete().eq('tenant_id', tenantId).eq('tabela_id', tabelaId).select('tabela_id'))
    return linhas.length
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

/** Os dois arquivos da tabela — caminho no bucket e nome original —, para a importação. */
export async function obterArquivosDaTabela(id: string): Promise<{ id: string; arquivo_path: string; arquivo_nome: string; motor_path: string; motor_nome: string } | null> {
    const ts = await q(db().from('orcamentista_tabela').select('id, arquivo_path, arquivo_nome, motor_path, motor_nome').eq('id', id))
    return (ts[0] as { id: string; arquivo_path: string; arquivo_nome: string; motor_path: string; motor_nome: string } | undefined) ?? null
}

/**
 * A gravação da importação: UMA chamada à função `importar_conteudo_da_tabela`
 * (`20261020000002`), que apaga e insere as quatro tabelas de conteúdo e grava o registro numa
 * transação só. Devolve as contagens que a função gravou.
 */
export async function importarConteudo(tabelaId: string, payload: unknown): Promise<{ importacao_id: string; itens: number; regras: number; tipologias: number; formulas: number }> {
    return q(db().rpc('importar_conteudo_da_tabela', { p_tabela_id: tabelaId, p_payload: payload }))
}

/** A tabela, para a tela da importação: os nomes dos arquivos e o fornecedor. Sem os caminhos do bucket. */
export async function obterDadosDaTabela(id: string): Promise<{ id: string; fornecedor_id: string; fornecedor_nome: string | null; arquivo_nome: string; motor_nome: string; vigencia: string | null } | null> {
    const ts = await q(db().from('orcamentista_tabela').select('id, fornecedor_id, arquivo_nome, motor_nome, vigencia').eq('id', id))
    if (ts.length === 0) return null
    const fs = await q(db().from('orcamentista_fornecedor').select('id, nome').eq('id', ts[0].fornecedor_id))
    return { id: ts[0].id, fornecedor_id: ts[0].fornecedor_id, fornecedor_nome: fs[0]?.nome ?? null, arquivo_nome: ts[0].arquivo_nome, motor_nome: ts[0].motor_nome, vigencia: ts[0].vigencia ?? null }
}

/** O resumo por tipologia gravado para a tabela, SEM ordem — quem ordena é a rota. */
export async function listarTipologias(tabelaId: string): Promise<Array<{ tipologia: string; linha: string | null; n_regras: number; n_condicionais: number; variaveis: string[] }>> {
    return q(db().from('orcamentista_motor_tipologia').select('tipologia, linha, n_regras, n_condicionais, variaveis').eq('tabela_id', tabelaId))
}

/** Quantas fórmulas da família estão gravadas para a tabela — contadas no banco. */
export async function contarFormulas(tabelaId: string): Promise<number> {
    const { count, error } = await db().from('orcamentista_motor_formula_familia').select('id', { count: 'exact', head: true }).eq('tabela_id', tabelaId)
    if (error) throw new ErroDoBanco(error)
    return count ?? 0
}

/** O nome de quem importou — o super admin, nunca dado de cliente. NULL quando o usuário não existe mais. */
export async function nomeDoUsuario(id: string): Promise<string | null> {
    const us = await q(db().from('users').select('id, name').eq('id', id))
    return us[0]?.name ?? null
}

/** A última importação da tabela, ou null quando nunca houve. */
export async function ultimaImportacao(tabelaId: string): Promise<Linha | null> {
    const ls = await q(db().from('orcamentista_importacao').select('*').eq('tabela_id', tabelaId).order('importado_em', { ascending: false }).limit(1))
    return ls[0] ?? null
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

/** Baixa UM objeto do bucket, com `service_role`. Falha do Storage LANÇA — quem confere se existe é `objetoExiste`. */
export async function baixarObjeto(caminho: string): Promise<Uint8Array> {
    const { data, error } = await bucket().download(caminho)
    if (error || !data) throw new ErroDoBanco({ message: error?.message ?? 'objeto sem conteúdo' })
    return new Uint8Array(await data.arrayBuffer())
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
