/**
 * Atendimentos I.A. — o acesso ao banco e ao Storage do catálogo. SÓ SERVIDOR: usa
 * `supabaseAdmin` (`service_role`), e só as rotas de `src/pages/api/super-admin/atendimentos-ia/`
 * o importam. É o único lugar fora das rotas onde as quatro tabelas são lidas — portão
 * `atendimentos-ia-a-tela-nao-fala-com-o-banco.test.ts`.
 *
 * As leituras são consultas SIMPLES, juntadas aqui, e não `select` com embutido do PostgREST: um
 * embutido ambíguo vira erro em produção que nenhum teste com cliente falso enxerga. As tabelas
 * são pequenas — catálogo da plataforma, não dado de conta.
 *
 * QUEM USA uma tabela é DERIVADO (dono do produto, 26/10/2026): as contas cuja base de conhecimento
 * vincula o fornecedor dela (`tabelas-da-conta.ts`). `orcamentista_conta_tabela` não é lida nem escrita
 * por ninguém: fica no banco, parada.
 *
 * Todo erro do banco SOBE com o `code` do Postgres (`ErroDoBanco`): é a rota que decide o que
 * fazer com um 23503, e ela nunca o engole.
 */
import { supabaseAdmin } from '@/supabase/admin'
import {
    BUCKET_DO_CATALOGO,
    type Categoria,
    type ContaLigada,
    type CorpoDaTabela,
    type Familia,
    type FornecedorComTabelas,
    type FornecedorDaLista,
    type Modelo,
    type Nicho,
    type TabelaDoFornecedor,
    type TabelaEmUso,
} from '@/utils/atendimentos-ia-catalogo'
import { COLUNA_DA_CATEGORIA_DO_FORNECEDOR } from '@/utils/atendimentos-ia-importacao-celula'
import { contasQueVinculam, derivarTabelasDaConta } from '@/lib/atendimentos-ia/tabelas-da-conta'

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

/** tabela → os NOMES das contas que vinculam o fornecedor dela na base de conhecimento. */
async function usoPorTabela(tabelas: Array<{ id: string; fornecedor_id: string }>): Promise<Record<string, string[]>> {
    if (tabelas.length === 0) return {}
    const porFornecedor = await contasQueVinculam(tabelas.map((t) => t.fornecedor_id))
    const nomes = await nomesDasContas([...porFornecedor.values()].flat())
    const nomeados = (f: string) => (porFornecedor.get(f) ?? []).map((t) => nomes[t] ?? t).sort((a, b) => a.localeCompare(b, 'pt-BR'))
    return Object.fromEntries(tabelas.map((t) => [t.id, nomeados(t.fornecedor_id)]))
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
 * pode enxergar dado de cliente por construção. Exceção nominal: id e nome de funcionário, só para
 * atribuir perfil de vendedor — ver o cabeçalho de `pages/super-admin/atendimentos-ia/contas/[tenantId].tsx`.
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

// ── As tabelas da conta, DERIVADAS ─────────────────────────────────────────────────────────
/*
 * REGRA INVIOLÁVEL: a tela mostra apenas o nome da conta e a configuração do Atendimentos I.A.
 * Nada do conteúdo da conta. Estas leituras não tocam `tenants` e devolvem só o catálogo.
 */

/** O modelo e o nicho SALVOS da conta, ou `null` se a conta não tem configuração do Atendimentos I.A. */
export async function obterModeloENichoDaConta(tenantId: string): Promise<{ modelo: Modelo | null; nicho_id: string | null } | null> {
    const cfg = await q(db().from('orcamentista_config').select('tenant_id, modelo, nicho_id').eq('tenant_id', tenantId))
    if (cfg.length === 0) return null
    return { modelo: cfg[0].modelo ?? null, nicho_id: cfg[0].nicho_id ?? null }
}

/**
 * As tabelas da conta — as dos fornecedores que a base de conhecimento dela vincula —, com fornecedor e
 * arquivo. É o que segura a troca de modelo e nicho.
 */
export async function listarTabelasDaConta(tenantId: string): Promise<Array<Pick<TabelaEmUso, 'tabela_id' | 'fornecedor_id' | 'fornecedor_nome' | 'arquivo_nome'>>> {
    const { tabelas } = await derivarTabelasDaConta(tenantId)
    return tabelas.map((t) => ({ tabela_id: t.tabelaId, fornecedor_id: t.fornecedorId, fornecedor_nome: t.fornecedor, arquivo_nome: t.arquivo_nome }))
}

// ── Fornecedores ───────────────────────────────────────────────────────────────────────────
async function montarLista(fornecedores: Linha[]): Promise<FornecedorComTabelas[]> {
    const nichoIds = [...new Set(fornecedores.map((f) => f.nicho_id))]
    const nichos: Linha[] = nichoIds.length ? await q(db().from('orcamentista_nicho').select('id, modelo, nome').in('id', nichoIds)) : []
    const fIds = fornecedores.map((f) => f.id)
    const tabelas: Linha[] = fIds.length
        ? await q(db().from('orcamentista_tabela').select('id, fornecedor_id, arquivo_nome, arquivo_path, motor_nome, motor_path, vigencia, familia, categoria_chave, vigente, criado_em').in('fornecedor_id', fIds).order('criado_em', { ascending: false }))
        : []
    const uso = await usoPorTabela(tabelas.map((t) => ({ id: t.id, fornecedor_id: t.fornecedor_id })))
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
            categorias_das_tabelas: [...new Set(daqui.map((t) => t.categoria_chave).filter((c): c is string => typeof c === 'string' && c.trim() !== ''))].sort(),
            familias_do_perfil: [...new Set(daqui.filter((t) => t.categoria_chave === 'PERFIL').map((t) => t.familia).filter((f): f is string => typeof f === 'string' && f.trim() !== ''))].sort(),
            tabelas_da_lista: daqui,
        }
    })
}

export async function listarFornecedores(): Promise<FornecedorDaLista[]> {
    const fs = await q(db().from('orcamentista_fornecedor').select('id, nome, nicho_id').order('nome'))
    return (await montarLista(fs)).map((f) => ({
        id: f.id, nome: f.nome, nicho_id: f.nicho_id, nicho_nome: f.nicho_nome, modelo: f.modelo, tabelas: f.tabelas, contas_usando: f.contas_usando,
        categorias_das_tabelas: f.categorias_das_tabelas, familias_do_perfil: f.familias_do_perfil,
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

/** Quem SEGURA um fornecedor: as tabelas dele, e as contas cuja base de conhecimento o vincula — com tabela ou sem. */
export async function quemSeguraOFornecedor(id: string): Promise<{ tabelas: string[]; contas: string[] }> {
    const ts = await q(db().from('orcamentista_tabela').select('id, arquivo_nome').eq('fornecedor_id', id))
    const tenants = (await contasQueVinculam([id])).get(id) ?? []
    const nomes = await nomesDasContas(tenants)
    return { tabelas: ts.map((t: Linha) => t.arquivo_nome), contas: tenants.map((t) => nomes[t] ?? t).sort((a, b) => a.localeCompare(b, 'pt-BR')) }
}

// ── Famílias (migração 20261026000004) ───────────────────────────────────────────────────────
/** O catálogo das famílias, SEM ordem — quem ordena é a rota. */
export async function listarFamilias(): Promise<Familia[]> {
    return q(db().from('orcamentista_familia_catalogo').select('chave, rotulo, ordem'))
}

export async function criarFamilia(f: Familia): Promise<Familia> {
    return q(db().from('orcamentista_familia_catalogo').insert(f).select('chave, rotulo, ordem').single())
}

// ── Categorias (migração 20261027000005) ─────────────────────────────────────────────────────
/** O catálogo das categorias da plataforma, SEM ordem — quem ordena é a rota. Só leitura: a lista é da plataforma. */
export async function listarCategorias(): Promise<Categoria[]> {
    return q(db().from('orcamentista_categoria_catalogo').select('chave, rotulo, ordem'))
}

// ── Tabelas ────────────────────────────────────────────────────────────────────────────────
/** As famílias das tabelas de PERFIL do fornecedor, sem repetição e em ordem: o motor de PERFIL tira a família delas (29/10/2026). */
export async function familiasDoPerfilDoFornecedor(fornecedorId: string): Promise<string[]> {
    const ts = await q(db().from('orcamentista_tabela').select('familia').eq('fornecedor_id', fornecedorId).eq('categoria_chave', 'PERFIL'))
    return [...new Set(ts.map((t) => t.familia).filter((f): f is string => typeof f === 'string' && f.trim() !== ''))].sort()
}

export async function obterTabela(id: string): Promise<{ id: string; fornecedor_id: string; arquivo_path: string; motor_path: string | null; categoria_chave: string | null; familia: string | null } | null> {
    const ts = await q(db().from('orcamentista_tabela').select('id, fornecedor_id, arquivo_path, motor_path, categoria_chave, familia').eq('id', id))
    return (ts[0] as { id: string; fornecedor_id: string; arquivo_path: string; motor_path: string | null; categoria_chave: string | null; familia: string | null } | undefined) ?? null
}

/** Os dois arquivos da tabela — caminho no bucket e nome original —, para a importação. */
export async function obterArquivosDaTabela(id: string): Promise<{ id: string; arquivo_path: string; arquivo_nome: string; motor_path: string | null; motor_nome: string | null; categoria_chave: string | null } | null> {
    const ts = await q(db().from('orcamentista_tabela').select('id, arquivo_path, arquivo_nome, motor_path, motor_nome, categoria_chave').eq('id', id))
    return (ts[0] as { id: string; arquivo_path: string; arquivo_nome: string; motor_path: string | null; motor_nome: string | null; categoria_chave: string | null } | undefined) ?? null
}

/**
 * A gravação da importação: UMA chamada à função `importar_conteudo_da_tabela`
 * (`20261020000002`), que apaga e insere as quatro tabelas de conteúdo e grava o registro numa
 * transação só. Devolve as contagens que a função gravou.
 */
/** As contagens que a função gravou: as quatro tabelas de sempre e as nove abas, pela chave do payload. */
export async function importarConteudo(tabelaId: string, payload: unknown): Promise<{ importacao_id: string; itens: number; regras: number; tipologias: number; formulas: number } & Record<string, number | string>> {
    return q(db().rpc('importar_conteudo_da_tabela', { p_tabela_id: tabelaId, p_payload: payload }))
}

/** A tabela, para a tela da importação: os nomes dos arquivos e o fornecedor. Sem os caminhos do bucket. */
export async function obterDadosDaTabela(id: string): Promise<{ id: string; fornecedor_id: string; fornecedor_nome: string | null; arquivo_nome: string; motor_nome: string | null; vigencia: string | null; categoria_chave: string | null; categoria_rotulo: string | null } | null> {
    const ts = await q(db().from('orcamentista_tabela').select('id, fornecedor_id, arquivo_nome, motor_nome, vigencia, categoria_chave').eq('id', id))
    if (ts.length === 0) return null
    const fs = await q(db().from('orcamentista_fornecedor').select('id, nome').eq('id', ts[0].fornecedor_id))
    const categoria_chave: string | null = ts[0].categoria_chave ?? null
    const cs = categoria_chave ? await q(db().from('orcamentista_categoria_catalogo').select('rotulo').eq('chave', categoria_chave)) : []
    return {
        id: ts[0].id, fornecedor_id: ts[0].fornecedor_id, fornecedor_nome: fs[0]?.nome ?? null, arquivo_nome: ts[0].arquivo_nome, motor_nome: ts[0].motor_nome ?? null, vigencia: ts[0].vigencia ?? null,
        categoria_chave, categoria_rotulo: cs[0]?.rotulo ?? null,
    }
}

/**
 * Os códigos dos itens gravados para a tabela, paginados de mil em mil — a leitura padrão do
 * PostgREST corta em mil linhas, e cortar aqui esconderia justamente o item que a trava procura.
 */
export async function codigosDosItensGravados(tabelaId: string): Promise<string[]> {
    const PAGINA = 1000
    const codigos: string[] = []
    for (let de = 0; ; de += PAGINA) {
        const linhas = await q(db().from('orcamentista_tabela_item').select('codigo').eq('tabela_id', tabelaId).order('id').range(de, de + PAGINA - 1)) as Array<{ codigo: string }>
        codigos.push(...linhas.map((l) => l.codigo))
        if (linhas.length < PAGINA) return codigos
    }
}

/**
 * A categoria do fornecedor de CADA item gravado para a tabela (`COLUNA_DA_CATEGORIA_DO_FORNECEDOR`), `null` onde o
 * arquivo não a trazia — paginada de mil em mil, pelo mesmo motivo de `codigosDosItensGravados`: cortar em mil
 * esconderia justamente a categoria a mais que a recusa procura.
 */
export async function categoriasDoFornecedorDosItensGravados(tabelaId: string): Promise<Array<string | null>> {
    const PAGINA = 1000
    const valores: Array<string | null> = []
    for (let de = 0; ; de += PAGINA) {
        const linhas = await q(db().from('orcamentista_tabela_item').select(COLUNA_DA_CATEGORIA_DO_FORNECEDOR).eq('tabela_id', tabelaId).order('id').range(de, de + PAGINA - 1)) as Linha[]
        valores.push(...linhas.map((l) => (l[COLUNA_DA_CATEGORIA_DO_FORNECEDOR] as string | null) ?? null))
        if (linhas.length < PAGINA) return valores
    }
}

/** O resumo por tipologia gravado para a tabela, SEM ordem — quem ordena é a rota. */
export async function listarTipologias(tabelaId: string): Promise<Array<{ tipologia: string; linha: string | null; n_regras: number; n_condicionais: number; variaveis: string[] }>> {
    return q(db().from('orcamentista_motor_tipologia').select('tipologia, linha, n_regras, n_condicionais, variaveis').eq('tabela_id', tabelaId))
}

/** Quantas fórmulas da linha (`orcamentista_motor_formula_familia`, nome vencido) estão gravadas para a tabela — contadas no banco. */
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

/**
 * A tabela que JÁ é a vigente do mesmo fornecedor, família e CATEGORIA da tabela dada — para a recusa nomeá-la. O índice único é
 * sobre os três (migração 20261027000006): a vigente de OUTRA categoria não é a que bloqueia, e nomeá-la mandaria desmarcar a errada.
 */
export async function tabelaVigenteDoPar(tabelaId: string): Promise<{ id: string; arquivo_nome: string; familia: string | null; categoria_chave: string | null } | null> {
    const ts = await q(db().from('orcamentista_tabela').select('id, fornecedor_id, familia, categoria_chave').eq('id', tabelaId))
    if (ts.length === 0) return null
    const doFornecedor = await q(db().from('orcamentista_tabela').select('id, arquivo_nome, familia, categoria_chave, vigente').eq('fornecedor_id', ts[0].fornecedor_id).eq('vigente', true))
    const par = doFornecedor.find((t: Linha) => t.id !== tabelaId && (t.familia ?? null) === (ts[0].familia ?? null) && (t.categoria_chave ?? null) === (ts[0].categoria_chave ?? null))
    return par ? { id: par.id, arquivo_nome: par.arquivo_nome, familia: par.familia ?? null, categoria_chave: par.categoria_chave ?? null } : null
}

export async function atualizarTabela(id: string, campos: Record<string, string | boolean | null>): Promise<number> {
    const linhas = await q(db().from('orcamentista_tabela').update(campos).eq('id', id).select('id'))
    return linhas.length
}

export async function excluirTabela(id: string): Promise<number> {
    const linhas = await q(db().from('orcamentista_tabela').delete().eq('id', id).select('id'))
    return linhas.length
}

/** As contas que usam a tabela — as que vinculam o fornecedor dela. Tabela que não existe: ninguém. */
export async function contasQueUsamATabela(id: string): Promise<string[]> {
    const ts = await q(db().from('orcamentista_tabela').select('id, fornecedor_id').eq('id', id))
    if (ts.length === 0) return []
    return (await usoPorTabela([{ id, fornecedor_id: ts[0].fornecedor_id }]))[id] ?? []
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

/**
 * Dos caminhos dados, os que uma PLANILHA do motor referencia (`orcamentista_motor.arquivo_path`). O motor da Wolff
 * foi copiado para a planilha (20261027000004) apontando o MESMO objeto do bucket que `orcamentista_tabela.motor_path`:
 * apagar ou trocar o motor da TABELA não pode levar o arquivo da PLANILHA. LANÇA se a leitura falhar — quem chama
 * decide, e o que decide é não remover nada.
 */
export async function caminhosDaPlanilha(caminhos: string[]): Promise<Set<string>> {
    if (caminhos.length === 0) return new Set()
    const ls = await q(db().from('orcamentista_motor').select('arquivo_path').in('arquivo_path', caminhos))
    return new Set(ls.map((l: Linha) => String(l.arquivo_path)))
}

/** Quantos itens importados a tabela tem — contados no banco (a edição recusa trocar o arquivo da tabela que tem algum). */
export async function contarItensDaTabela(tabelaId: string): Promise<number> {
    const { count, error } = await db().from('orcamentista_tabela_item').select('id', { count: 'exact', head: true }).eq('tabela_id', tabelaId)
    if (error) throw new ErroDoBanco(error)
    return count ?? 0
}

/** Copia UM objeto dentro do bucket (o motor que muda de fornecedor leva o arquivo para a pasta do novo). Falha LANÇA. */
export async function copiarObjeto(de: string, para: string): Promise<void> {
    const { error } = await bucket().copy(de, para)
    if (error) throw new ErroDoBanco({ message: error.message ?? 'erro do Storage ao copiar' })
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
