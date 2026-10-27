/**
 * Atendimentos I.A. — as TABELAS DA CONTA, DERIVADAS da base de conhecimento. SÓ SERVIDOR (`service_role`).
 *
 * ══ A DECISÃO (dono do produto, 26/10/2026) ══
 * "Tabelas em uso" saiu da tela da conta. As tabelas de uma conta são as tabelas dos fornecedores que a base
 * de conhecimento DELA vincula (matéria-prima → categoria → fornecedores: `orcamentista_mp_categoria` e
 * `orcamentista_mp_categoria_fornecedor`, filtradas pelo tenant). Não há segunda escolha a fazer.
 *
 * `orcamentista_conta_tabela` deixou de ser lida e escrita, e FICA no banco, parada, com as FKs e as
 * policies — apagar é decisão do dono do produto. A proteção que o RESTRICT dela dava (não excluir tabela
 * em uso) mudou de lugar: a rota da tabela confere o uso DERIVADO (`contasQueVinculam`) antes de apagar.
 *
 * ══ QUAL TABELA VALE — por (fornecedor, família) ══
 *   - UMA tabela no par: ela vale, marcada ou não — não há o que escolher;
 *   - MAIS de uma: vale a VIGENTE (`orcamentista_tabela.vigente`, no máximo uma por par, pelo índice único
 *     da migração 20261026000005). Nenhuma marcada: nenhuma vale, e o par vai para `paresSemVigente` — quem
 *     usa a derivação recusa nomeando. O sistema não escolhe "a mais recente".
 * `vigente` só decide o que um levantamento NOVO usa: o antigo aponta a tabela dele em
 * `orcamentista_levantamento_item.tabela_id`. A `vigencia` é só texto, e não é lida aqui.
 *
 * ══ O MOTOR decide se a tabela entra na conversa, não a categoria ══
 * `tipologias` é a contagem de `orcamentista_motor_tipologia_detalhe` da tabela, feita no banco. Com
 * tipologias, a tabela tem motor e entra na conversa; sem, é TABELA DE PREÇO. Esta função só MEDE: quem
 * decide e recusa é a conversa (`levantamento-da-conversa.ts`) e, na tela, o bloco Motor.
 */
import { supabaseAdmin } from '@/supabase/admin'

export class FalhaNaDerivacao extends Error {
    constructor(public onde: string, public codigo: string | null) { super(`leitura de ${onde}`) }
}

// O cliente admin não tem os tipos destas tabelas.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin as any

async function ler(onde: string, p: PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>): Promise<Linha[]> {
    const { data, error } = await p
    if (error) throw new FalhaNaDerivacao(onde, error.code ?? null)
    return (data ?? []) as Linha[]
}

export type TabelaDaConta = {
    tabelaId: string
    fornecedorId: string
    fornecedor: string
    /** O RÓTULO da família, do catálogo; null quando a tabela não a informa. */
    familia: string | null
    arquivo_nome: string
    vigente: boolean
    /** As categorias da base de conhecimento pelas quais a conta vincula o fornecedor, em ordem. */
    categorias: string[]
    /** As linhas de `orcamentista_motor_tipologia_detalhe` da tabela. */
    tipologias: number
    comMotor: boolean
    /** É a tabela que um levantamento NOVO usa no par (fornecedor, família). */
    vale: boolean
}
export type FornecedorSemTabela = { fornecedorId: string; fornecedor: string; categorias: string[] }
export type ParSemVigente = { fornecedor: string; familia: string | null; arquivos: string[] }
export type DerivacaoDaConta = { tabelas: TabelaDaConta[]; fornecedoresSemTabela: FornecedorSemTabela[]; paresSemVigente: ParSemVigente[] }

/** O fornecedor que o banco não devolveu (a FK impede; o texto não fica vazio se acontecer). */
export const FORNECEDOR_SEM_NOME = '(fornecedor sem nome)'
const porTexto = (a: string, b: string) => a.localeCompare(b, 'pt-BR')

/** fornecedor → as categorias pelas quais ESTA conta o vincula. */
async function vinculosDaConta(tenantId: string): Promise<Map<string, string[]>> {
    const categorias = await ler('orcamentista_mp_categoria', db().from('orcamentista_mp_categoria').select('id, categoria_chave').eq('tenant_id', tenantId))
    const vinculos = await ler('orcamentista_mp_categoria_fornecedor', db().from('orcamentista_mp_categoria_fornecedor').select('mp_categoria_id, fornecedor_id').eq('tenant_id', tenantId))
    const chaveDa = new Map(categorias.map((c) => [String(c.id), String(c.categoria_chave)]))
    const porFornecedor = new Map<string, Set<string>>()
    for (const v of vinculos) {
        const chave = chaveDa.get(String(v.mp_categoria_id))
        if (!chave) continue
        const f = String(v.fornecedor_id)
        if (!porFornecedor.has(f)) porFornecedor.set(f, new Set())
        porFornecedor.get(f)!.add(chave)
    }
    return new Map([...porFornecedor].map(([f, cs]) => [f, [...cs].sort(porTexto)]))
}

async function contarTipologias(tabelaId: string): Promise<number> {
    const { count, error } = await db().from('orcamentista_motor_tipologia_detalhe').select('tabela_id', { count: 'exact', head: true }).eq('tabela_id', tabelaId)
    if (error) throw new FalhaNaDerivacao('orcamentista_motor_tipologia_detalhe', error.code ?? null)
    return count ?? 0
}

export async function derivarTabelasDaConta(tenantId: string): Promise<DerivacaoDaConta> {
    const vinculos = await vinculosDaConta(tenantId)
    const fIds = [...vinculos.keys()]
    if (fIds.length === 0) return { tabelas: [], fornecedoresSemTabela: [], paresSemVigente: [] }

    const fornecedores = await ler('orcamentista_fornecedor', db().from('orcamentista_fornecedor').select('id, nome').in('id', fIds))
    const nomeDo = new Map(fornecedores.map((f) => [String(f.id), (f.nome as string | null)?.trim() || FORNECEDOR_SEM_NOME]))
    const nome = (id: string) => nomeDo.get(id) ?? FORNECEDOR_SEM_NOME
    const linhas = await ler('orcamentista_tabela', db().from('orcamentista_tabela').select('id, fornecedor_id, arquivo_nome, familia, vigente').in('fornecedor_id', fIds))
    const catalogo = await ler('orcamentista_familia_catalogo', db().from('orcamentista_familia_catalogo').select('chave, rotulo'))
    const rotuloDa = new Map(catalogo.map((f) => [String(f.chave), String(f.rotulo)]))

    // o par (fornecedor, família): a família sem informar também é um par
    const par = (t: Linha) => `${t.fornecedor_id}|${t.familia ?? ''}`
    const doPar = new Map<string, Linha[]>()
    for (const t of linhas) doPar.set(par(t), [...(doPar.get(par(t)) ?? []), t])
    const vale = (t: Linha) => { const ts = doPar.get(par(t))!; return ts.length === 1 || t.vigente === true }

    const tabelas: TabelaDaConta[] = []
    for (const t of linhas) {
        const tipologias = await contarTipologias(String(t.id))
        tabelas.push({
            tabelaId: String(t.id),
            fornecedorId: String(t.fornecedor_id),
            fornecedor: nome(String(t.fornecedor_id)),
            familia: t.familia == null ? null : rotuloDa.get(String(t.familia)) ?? String(t.familia),
            arquivo_nome: String(t.arquivo_nome),
            vigente: t.vigente === true,
            categorias: vinculos.get(String(t.fornecedor_id)) ?? [],
            tipologias,
            comMotor: tipologias > 0,
            vale: vale(t),
        })
    }
    tabelas.sort((a, b) => porTexto(a.fornecedor, b.fornecedor) || porTexto(a.familia ?? '', b.familia ?? '') || porTexto(a.arquivo_nome, b.arquivo_nome))

    const comTabela = new Set(linhas.map((t) => String(t.fornecedor_id)))
    const fornecedoresSemTabela = fIds
        .filter((f) => !comTabela.has(f))
        .map((f) => ({ fornecedorId: f, fornecedor: nome(f), categorias: vinculos.get(f) ?? [] }))
        .sort((a, b) => porTexto(a.fornecedor, b.fornecedor))

    const paresSemVigente: ParSemVigente[] = []
    const vistos = new Set<string>()
    for (const t of tabelas) {
        const chave = `${t.fornecedorId}|${t.familia ?? ''}`
        const doMesmo = tabelas.filter((o) => o.fornecedorId === t.fornecedorId && o.familia === t.familia)
        if (vistos.has(chave) || doMesmo.length < 2 || doMesmo.some((o) => o.vale)) continue
        vistos.add(chave)
        paresSemVigente.push({ fornecedor: t.fornecedor, familia: t.familia, arquivos: doMesmo.map((o) => o.arquivo_nome) })
    }
    return { tabelas, fornecedoresSemTabela, paresSemVigente }
}

/** A tabela é DESTA conta — o fornecedor dela é vinculado na base de conhecimento? Sem contar tipologias. */
export async function contaTemATabela(tenantId: string, tabelaId: string): Promise<boolean> {
    const vinculos = await vinculosDaConta(tenantId)
    if (vinculos.size === 0) return false
    const ts = await ler('orcamentista_tabela', db().from('orcamentista_tabela').select('id, fornecedor_id').eq('id', tabelaId))
    return ts.length > 0 && vinculos.has(String(ts[0].fornecedor_id))
}

/** O fornecedor é vinculado por ESTA conta na base de conhecimento? É a guarda das rotas da planilha. */
export async function contaVinculaOFornecedor(tenantId: string, fornecedorId: string): Promise<boolean> {
    return (await vinculosDaConta(tenantId)).has(fornecedorId)
}

/**
 * fornecedor → os tenants cuja base de conhecimento o vincula. É o USO derivado: a tabela de um fornecedor
 * vinculado é tabela daquela conta, e a rota da tabela recusa apagá-la.
 */
export async function contasQueVinculam(fornecedorIds: string[]): Promise<Map<string, string[]>> {
    const ids = [...new Set(fornecedorIds)]
    if (ids.length === 0) return new Map()
    const vinculos = await ler('orcamentista_mp_categoria_fornecedor', db().from('orcamentista_mp_categoria_fornecedor').select('tenant_id, fornecedor_id').in('fornecedor_id', ids))
    const out = new Map<string, string[]>()
    for (const v of vinculos) {
        const f = String(v.fornecedor_id)
        const ts = out.get(f) ?? []
        if (!ts.includes(String(v.tenant_id))) out.set(f, [...ts, String(v.tenant_id)])
    }
    return out
}
