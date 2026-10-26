/**
 * O BLOCO MOTOR da conta — a leitura. SÓ SERVIDOR (`supabaseAdmin`): quem chama são as rotas de
 * `src/pages/api/super-admin/atendimentos-ia/contas/[tenantId]/motor/`. Só lê: o bloco MOSTRA o que a conta
 * tem carregado (dono do produto, 26/10/2026); as duas escolhas estruturadas que ele edita vão pelas rotas
 * que já existem (a da tabela e a da categoria da base de conhecimento).
 *
 * TUDO É DA TABELA EM USO NA CONTA (`orcamentista_conta_tabela`): a tabela que a conta não usa não aparece
 * no resumo, e o detalhe dela é recusado — o catálogo é da plataforma, mas o bloco é da conta.
 *
 * AS CONTAGENS SÃO DO BANCO (`count: 'exact', head: true`) e as abas de uma tipologia são PAGINADAS: a
 * leitura padrão do PostgREST corta em mil linhas, e um motor cortado em silêncio mostraria ao consultor
 * um carregamento que não é o que está lá (`instrumento-que-nao-enxerga.md`).
 *
 * Nada de dado do negócio do cliente: o resumo é do catálogo (fornecedor, tabela, motor) e da configuração
 * do Atendimentos I.A. (critério das barras). As contas que usam a tabela vêm pelo NOME, como em
 * "Fornecedores e tabelas" — é o que a troca de família afeta.
 *
 * Portão: `src/utils/__tests__/atendimentos-ia-motor-da-conta.test.ts`.
 */
import { supabaseAdmin } from '@/supabase/admin'
import {
    ABAS_DA_TIPOLOGIA, CONTAGENS_DO_MOTOR,
    type AbasDaTipologia, type ChaveDaContagem, type CriterioDeCustoDaBarra, type MotorDaConta, type TabelaNoMotor, type TipologiaNoMotor,
} from '@/utils/atendimentos-ia-motor'

// O cliente admin não tem os tipos destas tabelas (`database.types.ts` é anterior a elas).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Linha = Record<string, any>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin as any

async function q<T = Linha[]>(tabela: string, p: PromiseLike<{ data: unknown; error: { message?: string } | null }>): Promise<T> {
    const { data, error } = await p
    if (error) throw new Error(`${tabela}: ${error.message ?? 'erro do banco'}`)
    return (data ?? []) as T
}

const PAGINA = 1000

/**
 * Todas as linhas, de mil em mil, na ordem pedida — por padrão a do arquivo (`ordem`, e `id` para desempatar).
 * A Detalhe NÃO tem `id` em produção: quem a lê passa outra ordem (ordenar por coluna que não existe é erro).
 */
async function todas(tabela: string, filtrar: (consulta: Linha) => Linha, colunas: string, ordem: readonly string[] = ['ordem', 'id']): Promise<Linha[]> {
    const saida: Linha[] = []
    for (let de = 0; ; de += PAGINA) {
        const ordenada = ordem.reduce((consulta: Linha, c) => consulta.order(c), filtrar(db().from(tabela).select(colunas)))
        const pagina = await q(tabela, ordenada.range(de, de + PAGINA - 1))
        saida.push(...pagina)
        if (pagina.length < PAGINA) return saida
    }
}

async function contar(tabela: string, coluna: string, tabelaId: string): Promise<number> {
    const { count, error } = await db().from(tabela).select(coluna, { count: 'exact', head: true }).eq('tabela_id', tabelaId)
    if (error) throw new Error(`${tabela}: ${error.message ?? 'erro do banco'}`)
    return typeof count === 'number' ? count : 0
}

/** As tabelas em uso NA CONTA — os ids. */
async function tabelasDaConta(tenantId: string): Promise<string[]> {
    const usos = await q('orcamentista_conta_tabela', db().from('orcamentista_conta_tabela').select('tabela_id').eq('tenant_id', tenantId))
    return [...new Set(usos.map((u: Linha) => String(u.tabela_id)))]
}

/** A tabela é usada por esta conta? É a guarda das rotas de detalhe. */
export async function contaUsaATabela(tenantId: string, tabelaId: string): Promise<boolean> {
    return (await tabelasDaConta(tenantId)).includes(tabelaId)
}

const porTexto = (a: string | null, b: string | null) => (a ?? '').localeCompare(b ?? '', 'pt-BR')

export async function lerMotorDaConta(tenantId: string): Promise<MotorDaConta> {
    const ids = await tabelasDaConta(tenantId)
    const familias = (await q('orcamentista_familia_catalogo', db().from('orcamentista_familia_catalogo').select('chave, rotulo, ordem')))
        .map((f: Linha) => ({ chave: String(f.chave), rotulo: String(f.rotulo), ordem: Number(f.ordem) }))
        .sort((a: { ordem: number }, b: { ordem: number }) => a.ordem - b.ordem)

    // o critério de custo das barras: da categoria PERFIL de cada matéria-prima DESTA conta
    const materias = (await q('orcamentista_materia_prima', db().from('orcamentista_materia_prima').select('id, nome, ordem').eq('tenant_id', tenantId)))
        .sort((a: Linha, b: Linha) => Number(a.ordem) - Number(b.ordem))
    const perfis = await q('orcamentista_mp_categoria', db().from('orcamentista_mp_categoria').select('materia_prima_id, config').eq('tenant_id', tenantId).eq('categoria_chave', 'PERFIL'))
    const criterioDe = (mp: string): CriterioDeCustoDaBarra | null => {
        const v = (perfis.find((p: Linha) => p.materia_prima_id === mp)?.config ?? {})?.criterio_custo_barra
        return v === 'BARRA_INTEIRA' || v === 'CONSUMO_REAL' ? v : null
    }
    const materias_primas = materias.map((m: Linha) => ({ id: String(m.id), nome: String(m.nome), criterio_custo_barra: criterioDe(String(m.id)) }))
    if (ids.length === 0) return { tabelas: [], familias, materias_primas }

    const tabelas = await q('orcamentista_tabela', db().from('orcamentista_tabela').select('id, fornecedor_id, arquivo_nome, motor_nome, vigencia, familia').in('id', ids))
    const fIds = [...new Set(tabelas.map((t: Linha) => String(t.fornecedor_id)))]
    const fornecedores = fIds.length ? await q('orcamentista_fornecedor', db().from('orcamentista_fornecedor').select('id, nome').in('id', fIds)) : []
    const nomeDoFornecedor = new Map(fornecedores.map((f: Linha) => [String(f.id), String(f.nome)]))
    const usos = await q('orcamentista_conta_tabela', db().from('orcamentista_conta_tabela').select('tenant_id, tabela_id').in('tabela_id', ids))
    const contas = await q('tenants', db().from('tenants').select('id, name').in('id', [...new Set(usos.map((u: Linha) => String(u.tenant_id)))]))
    const nomeDaConta = new Map(contas.map((c: Linha) => [String(c.id), String(c.name)]))

    const saida: TabelaNoMotor[] = []
    for (const t of tabelas) {
        const id = String(t.id)
        const contagens = {} as Record<ChaveDaContagem, number>
        for (const c of CONTAGENS_DO_MOTOR) contagens[c.chave] = await contar(c.tabela, c.coluna, id)
        const detalhe = await todas('orcamentista_motor_tipologia_detalhe', (x) => x.eq('tabela_id', id), 'tipologia, linha', ['tipologia'])
        const porLinha = new Map<string | null, number>()
        for (const d of detalhe) porLinha.set(d.linha ?? null, (porLinha.get(d.linha ?? null) ?? 0) + 1)
        const otimizacao = await todas('orcamentista_motor_otimizacao', (x) => x.eq('tabela_id', id), 'parametro, valor, ordem, id')
        saida.push({
            tabela_id: id,
            fornecedor: nomeDoFornecedor.get(String(t.fornecedor_id)) ?? '—',
            arquivo_nome: String(t.arquivo_nome),
            motor_nome: String(t.motor_nome),
            vigencia: t.vigencia ?? null,
            familia: t.familia ?? null,
            contas_usando: usos.filter((u: Linha) => u.tabela_id === id).map((u: Linha) => nomeDaConta.get(String(u.tenant_id)) ?? '—').sort(porTexto),
            linhas: [...porLinha.entries()].map(([linha, n]) => ({ linha, tipologias: n })).sort((a, b) => porTexto(a.linha, b.linha)),
            contagens,
            otimizacao: otimizacao.map((o) => ({ parametro: o.parametro ?? null, valor: o.valor ?? null })),
        })
    }
    return { tabelas: saida.sort((a, b) => porTexto(a.fornecedor, b.fornecedor) || porTexto(a.arquivo_nome, b.arquivo_nome)), familias, materias_primas }
}

/**
 * As tipologias da tabela (a aba Detalhe), por linha e pela ordem do arquivo, com o tempo de fabricação
 * da tabela própria. A Detalhe não tem coluna `id` em produção: a leitura não ordena por ela.
 */
export async function lerTipologiasDoMotor(tabelaId: string): Promise<TipologiaNoMotor[]> {
    const linhas = await todas('orcamentista_motor_tipologia_detalhe', (x) => x.eq('tabela_id', tabelaId),
        'tipologia, linha, descricao, tipo, larg_min_mm, larg_max_mm, alt_min_mm, alt_max_mm, n_perfis, n_vidros, n_insumos, ordem', ['tipologia'])
    const tempos = await q('orcamentista_motor_tipologia_tempo', db().from('orcamentista_motor_tipologia_tempo').select('tipologia, tempo_fabricacao_min, tempo_origem').eq('tabela_id', tabelaId))
    const tempoDa = new Map(tempos.map((t: Linha) => [String(t.tipologia), t]))
    const numeroOuNulo = (v: unknown) => (typeof v === 'number' ? v : null)
    return linhas
        .sort((a, b) => porTexto(a.linha, b.linha) || (numeroOuNulo(a.ordem) ?? Infinity) - (numeroOuNulo(b.ordem) ?? Infinity) || porTexto(a.tipologia, b.tipologia))
        .map((d) => ({
            tipologia: String(d.tipologia), linha: d.linha ?? null, descricao: d.descricao ?? null, tipo: d.tipo ?? null,
            larg_min_mm: numeroOuNulo(d.larg_min_mm), larg_max_mm: numeroOuNulo(d.larg_max_mm), alt_min_mm: numeroOuNulo(d.alt_min_mm), alt_max_mm: numeroOuNulo(d.alt_max_mm),
            n_perfis: numeroOuNulo(d.n_perfis), n_vidros: numeroOuNulo(d.n_vidros), n_insumos: numeroOuNulo(d.n_insumos),
            tempo_fabricacao_min: numeroOuNulo(tempoDa.get(String(d.tipologia))?.tempo_fabricacao_min),
            tempo_origem: tempoDa.get(String(d.tipologia))?.tempo_origem ?? null,
        }))
}

/** As abas de UMA tipologia da tabela, inteiras e na ordem do arquivo, só com as colunas mostradas. */
export async function lerAbasDaTipologia(tabelaId: string, tipologia: string): Promise<AbasDaTipologia> {
    const saida = {} as AbasDaTipologia
    for (const aba of ABAS_DA_TIPOLOGIA) {
        const linhas = await todas(aba.tabela, (x) => x.eq('tabela_id', tabelaId).eq('tipologia', tipologia), ['id', ...aba.colunas].join(', '))
        saida[aba.chave] = linhas.map((l) => Object.fromEntries(aba.colunas.map((c) => [c, l[c] ?? null])))
    }
    return saida
}
