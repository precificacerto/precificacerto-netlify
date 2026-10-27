/**
 * O BLOCO MOTOR da conta — a leitura. SÓ SERVIDOR (`supabaseAdmin`): quem chama são as rotas de
 * `src/pages/api/super-admin/atendimentos-ia/contas/[tenantId]/motor/`. Só lê: o bloco MOSTRA o que a conta
 * tem carregado (dono do produto, 26/10/2026); as duas escolhas estruturadas que ele edita vão pelas rotas
 * que já existem (a da tabela e a da categoria da base de conhecimento).
 *
 * TUDO É DAS TABELAS DA CONTA, DERIVADAS (dono do produto, 26/10/2026): as dos fornecedores que a base de
 * conhecimento dela vincula (`tabelas-da-conta.ts`) — `orcamentista_conta_tabela` não é lida. A tabela que não é
 * da conta não aparece no resumo, e o detalhe dela é recusado: o catálogo é da plataforma, mas o bloco é da conta.
 * Cada tabela diz o papel (motor ou tabela de preço), a categoria, a vigente e se vale; os avisos dizem o que a
 * derivação achou de errado — fornecedor sem tabela, par sem vigente, nenhuma tabela com motor.
 *
 * AS CONTAGENS SÃO DO BANCO (`count: 'exact', head: true`) e as abas de uma tipologia são PAGINADAS: a
 * leitura padrão do PostgREST corta em mil linhas, e um motor cortado em silêncio mostraria ao consultor
 * um carregamento que não é o que está lá (`instrumento-que-nao-enxerga.md`).
 *
 * Nada de dado do negócio do cliente: o resumo é do catálogo (fornecedor, tabela, motor) e da configuração
 * do Atendimentos I.A. (critério das barras). As contas que usam a tabela — as que vinculam o fornecedor dela —
 * vêm pelo NOME, como em "Fornecedores e tabelas": é o que a troca de família afeta.
 *
 * Portão: `src/utils/__tests__/atendimentos-ia-motor-da-conta.test.ts`.
 */
import { supabaseAdmin } from '@/supabase/admin'
import {
    ABAS_DA_TIPOLOGIA, CONTAGENS_DO_MOTOR,
    type AbasDaTipologia, type ChaveDaContagem, type CriterioDeCustoDaBarra, type MotorDaConta, type TabelaNoMotor, type TipologiaNoMotor,
} from '@/utils/atendimentos-ia-motor'
import { contaTemATabela, contasQueVinculam, derivarTabelasDaConta } from '@/lib/atendimentos-ia/tabelas-da-conta'

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

/** A tabela é desta conta (derivada)? É a guarda das rotas de detalhe. A tabela de preço também é. */
export async function contaUsaATabela(tenantId: string, tabelaId: string): Promise<boolean> {
    return contaTemATabela(tenantId, tabelaId)
}

const porTexto = (a: string | null, b: string | null) => (a ?? '').localeCompare(b ?? '', 'pt-BR')

export async function lerMotorDaConta(tenantId: string): Promise<MotorDaConta> {
    const derivacao = await derivarTabelasDaConta(tenantId)
    const ids = derivacao.tabelas.map((t) => t.tabelaId)
    const avisos: MotorDaConta['avisos'] = {
        fornecedores_sem_tabela: derivacao.fornecedoresSemTabela.map((f) => ({ fornecedor: f.fornecedor, categorias: f.categorias })),
        pares_sem_vigente: derivacao.paresSemVigente.map((p) => ({ fornecedor: p.fornecedor, familia: p.familia, arquivos: p.arquivos })),
        nenhuma_com_motor: derivacao.tabelas.length > 0 && !derivacao.tabelas.some((t) => t.comMotor),
    }
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
    if (ids.length === 0) return { tabelas: [], familias, materias_primas, avisos }

    // a linha da tabela traz o que a derivação não traz: o motor, a nota de vigência e a CHAVE da família
    const linhaDa = new Map((await q('orcamentista_tabela', db().from('orcamentista_tabela').select('id, motor_nome, vigencia, familia').in('id', ids)))
        .map((t: Linha) => [String(t.id), t]))
    const vinculam = await contasQueVinculam(derivacao.tabelas.map((t) => t.fornecedorId))
    const tenants = [...new Set([...vinculam.values()].flat())]
    const contas = tenants.length ? await q('tenants', db().from('tenants').select('id, name').in('id', tenants)) : []
    const nomeDaConta = new Map(contas.map((c: Linha) => [String(c.id), String(c.name)]))

    const saida: TabelaNoMotor[] = []
    for (const d of derivacao.tabelas) {
        const id = d.tabelaId
        const t = linhaDa.get(id) ?? {}
        const contagens = {} as Record<ChaveDaContagem, number>
        for (const c of CONTAGENS_DO_MOTOR) contagens[c.chave] = await contar(c.tabela, c.coluna, id)
        const detalhe = await todas('orcamentista_motor_tipologia_detalhe', (x) => x.eq('tabela_id', id), 'tipologia, linha', ['tipologia'])
        const porLinha = new Map<string | null, number>()
        for (const d of detalhe) porLinha.set(d.linha ?? null, (porLinha.get(d.linha ?? null) ?? 0) + 1)
        const otimizacao = await todas('orcamentista_motor_otimizacao', (x) => x.eq('tabela_id', id), 'parametro, valor, ordem, id')
        saida.push({
            tabela_id: id,
            fornecedor: d.fornecedor,
            arquivo_nome: d.arquivo_nome,
            motor_nome: String(t.motor_nome ?? '—'),
            vigencia: t.vigencia ?? null,
            familia: t.familia ?? null,
            contas_usando: (vinculam.get(d.fornecedorId) ?? []).map((c) => nomeDaConta.get(c) ?? '—').sort(porTexto),
            categorias: d.categorias,
            vigente: d.vigente,
            vale: d.vale,
            com_motor: d.comMotor,
            linhas: [...porLinha.entries()].map(([linha, n]) => ({ linha, tipologias: n })).sort((a, b) => porTexto(a.linha, b.linha)),
            contagens,
            otimizacao: otimizacao.map((o) => ({ parametro: o.parametro ?? null, valor: o.valor ?? null })),
        })
    }
    return { tabelas: saida.sort((a, b) => porTexto(a.fornecedor, b.fornecedor) || porTexto(a.arquivo_nome, b.arquivo_nome)), familias, materias_primas, avisos }
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
