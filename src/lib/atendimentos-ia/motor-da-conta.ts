/**
 * O BLOCO MOTOR da conta — a leitura. SÓ SERVIDOR (`supabaseAdmin`): quem chama são as rotas de
 * `src/pages/api/super-admin/atendimentos-ia/contas/[tenantId]/motor/`. Só lê: o bloco MOSTRA o que a conta
 * tem carregado (dono do produto, 26/10/2026); as duas escolhas estruturadas que ele edita vão pelas rotas
 * que já existem (a da tabela e a da categoria da base de conhecimento).
 *
 * TUDO É DAS TABELAS DA CONTA, DERIVADAS (dono do produto, 26/10/2026): as dos fornecedores que a base de
 * conhecimento dela vincula (`tabelas-da-conta.ts`) — `orcamentista_conta_tabela` não é lida. A tabela que não é
 * da conta não aparece no resumo, e o detalhe dela é recusado: o catálogo é da plataforma, mas o bloco é da conta.
 * SÓ O QUE TEM MOTOR CARREGADO (dono do produto, 27/10/2026), medido pelo conteúdo — tipologias > 0 na Detalhe —,
 * nunca pelo `motor_nome`: o nome pode estar preenchido com uma importação que falhou, ou vazio com conteúdo. A
 * tabela de preço sai da lista, sem nada ser apagado. Cada motor diz a família e a vigente; os avisos dizem o que a
 * derivação achou de errado — fornecedor sem tabela, par sem vigente, nenhuma tabela com motor.
 *
 * DOIS LUGARES onde o motor mora: a TABELA do fornecedor (o modelo de hoje, que a conversa lê) e a PLANILHA
 * (`orcamentista_motor`, por família e fornecedor de perfil; migração 20261027000002). A planilha entra se o
 * fornecedor dela é vinculado pela conta, não está arquivada e tem tipologias. Arquivada sai da lista e da
 * conversa — o PR D, que troca os leitores, TEM de filtrar `arquivado_em IS NULL`; aqui o filtro já está.
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
    type AbaDaPlanilha, type AbasDaTipologia, type ChaveDaContagem, type CriterioDeCustoDaBarra, type MotorDaConta, type PlanilhaNoMotor, type TabelaNoMotor, type TipologiaNoMotor,
} from '@/utils/atendimentos-ia-motor'
import { contaTemATabela, contaVinculaOFornecedor, contasQueUsamAFamilia, contasQueVinculam, derivarTabelasDaConta, familiasDaConta } from '@/lib/atendimentos-ia/tabelas-da-conta'

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
 * A Detalhe e os tempos NÃO tinham `id` (a causa do bug do #165) e ganharam na 20261027000002; a leitura da
 * Detalhe continua ordenando por `tipologia`, que é a chave dela.
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

/** De quem é a linha: da tabela do fornecedor (`tabela_id`) ou da planilha (`motor_id`) — nunca das duas. */
type ColunaDoDono = 'tabela_id' | 'motor_id'

async function contar(tabela: string, coluna: string, donoId: string, dono: ColunaDoDono = 'tabela_id'): Promise<number> {
    const { count, error } = await db().from(tabela).select(coluna, { count: 'exact', head: true }).eq(dono, donoId)
    if (error) throw new Error(`${tabela}: ${error.message ?? 'erro do banco'}`)
    return typeof count === 'number' ? count : 0
}

/** A tabela é desta conta (derivada)? É a guarda das rotas de detalhe. A tabela de preço também é. */
export async function contaUsaATabela(tenantId: string, tabelaId: string): Promise<boolean> {
    return contaTemATabela(tenantId, tabelaId)
}

const porTexto = (a: string | null, b: string | null) => (a ?? '').localeCompare(b ?? '', 'pt-BR')

/**
 * A planilha é DESTA conta — ativa (não arquivada) e de um fornecedor que a conta vincula, ou, na planilha da FAMÍLIA (sem fornecedor,
 * 20261027000006), de uma família que a conta usa? É a guarda das rotas da planilha.
 */
export async function contaUsaAPlanilha(tenantId: string, motorId: string): Promise<boolean> {
    const linhas = await q('orcamentista_motor', db().from('orcamentista_motor').select('id, familia, fornecedor_id').eq('id', motorId).is('arquivado_em', null))
    if (linhas.length === 0) return false
    if (linhas[0].fornecedor_id == null) return (await familiasDaConta(tenantId)).has(String(linhas[0].familia))
    return contaVinculaOFornecedor(tenantId, String(linhas[0].fornecedor_id))
}

/** As linhas (do motor) e a otimização — o que as duas origens mostram igual. */
async function linhasEOtimizacao(donoId: string, dono: ColunaDoDono) {
    const detalhe = await todas('orcamentista_motor_tipologia_detalhe', (x) => x.eq(dono, donoId), 'tipologia, linha', ['tipologia'])
    const porLinha = new Map<string | null, number>()
    for (const d of detalhe) porLinha.set(d.linha ?? null, (porLinha.get(d.linha ?? null) ?? 0) + 1)
    const otimizacao = await todas('orcamentista_motor_otimizacao', (x) => x.eq(dono, donoId), 'parametro, valor, ordem, id')
    return {
        linhas: [...porLinha.entries()].map(([linha, n]) => ({ linha, tipologias: n })).sort((a, b) => porTexto(a.linha, b.linha)),
        otimizacao: otimizacao.map((o) => ({ parametro: o.parametro ?? null, valor: o.valor ?? null })),
    }
}

export async function lerMotorDaConta(tenantId: string): Promise<MotorDaConta> {
    const derivacao = await derivarTabelasDaConta(tenantId)
    // SÓ O QUE TEM MOTOR: a tabela de preço (sem tipologias) não é motor e não entra no bloco
    const comMotor = derivacao.tabelas.filter((t) => t.comMotor)
    const ids = comMotor.map((t) => t.tabelaId)
    const avisos: MotorDaConta['avisos'] = {
        fornecedores_sem_tabela: derivacao.fornecedoresSemTabela.map((f) => ({ fornecedor: f.fornecedor, categorias: f.categorias })),
        pares_sem_vigente: derivacao.paresSemVigente.map((p) => ({ fornecedor: p.fornecedor, familia: p.familia, categoria: p.categoria, arquivos: p.arquivos })),
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
    // as contas que usam cada fornecedor — arquivar ou trocar a família muda para TODAS elas, e o bloco diz quais
    const nomeDoFornecedor = new Map<string, string>([
        ...derivacao.tabelas.map((t): [string, string] => [t.fornecedorId, t.fornecedor]),
        ...derivacao.fornecedoresSemTabela.map((f): [string, string] => [f.fornecedorId, f.fornecedor]),
    ])
    const vinculam = await contasQueVinculam([...nomeDoFornecedor.keys()])
    const tenants = [...new Set([...vinculam.values()].flat())]
    const contas = tenants.length ? await q('tenants', db().from('tenants').select('id, name').in('id', tenants)) : []
    const nomeDaConta = new Map(contas.map((c: Linha) => [String(c.id), String(c.name)]))
    const contasDo = (fornecedorId: string) => (vinculam.get(fornecedorId) ?? []).map((c) => nomeDaConta.get(c) ?? '—').sort(porTexto)

    const daConta = await familiasDaConta(tenantId)
    const planilhas = await lerPlanilhasDaConta(nomeDoFornecedor, contasDo, familias, daConta, async (familia) => {
        const ts = await contasQueUsamAFamilia(familia)
        const nomes = ts.length ? await q('tenants', db().from('tenants').select('id, name').in('id', ts)) : []
        return nomes.map((c: Linha) => String(c.name)).sort(porTexto)
    })
    const etapas_das_familias = await lerEtapasDasFamilias(new Set([...daConta, ...planilhas.map((p) => p.familia), ...derivacao.tabelas.flatMap((t) => (t.familiaChave ? [t.familiaChave] : []))]), familias)
    if (ids.length === 0) return { tabelas: [], planilhas, familias, etapas_das_familias, materias_primas, avisos }

    // a linha da tabela traz o que a derivação não traz: o motor, a nota de vigência e a CHAVE da família
    const linhaDa = new Map((await q('orcamentista_tabela', db().from('orcamentista_tabela').select('id, motor_nome, vigencia, familia').in('id', ids)))
        .map((t: Linha) => [String(t.id), t]))

    const saida: TabelaNoMotor[] = []
    for (const d of comMotor) {
        const id = d.tabelaId
        const t = linhaDa.get(id) ?? {}
        const contagens = {} as Record<ChaveDaContagem, number>
        for (const c of CONTAGENS_DO_MOTOR) contagens[c.chave] = await contar(c.tabela, c.coluna, id)
        const { linhas, otimizacao } = await linhasEOtimizacao(id, 'tabela_id')
        saida.push({
            tabela_id: id,
            fornecedor: d.fornecedor,
            arquivo_nome: d.arquivo_nome,
            motor_nome: String(t.motor_nome ?? '—'),
            vigencia: t.vigencia ?? null,
            familia: t.familia ?? null,
            contas_usando: contasDo(d.fornecedorId),
            categorias: d.categorias,
            vigente: d.vigente,
            vale: d.vale,
            com_motor: d.comMotor,
            linhas,
            contagens,
            otimizacao,
        })
    }
    return { tabelas: saida.sort((a, b) => porTexto(a.fornecedor, b.fornecedor) || porTexto(a.arquivo_nome, b.arquivo_nome)), planilhas, familias, etapas_das_familias, materias_primas, avisos }
}

/**
 * O CABEÇALHO de cada família que a conta usa: etapa por etapa, o motor que ela aponta. Só leitura, e só das famílias com etapa cadastrada.
 * A etapa que aponta um motor já arquivado não existe (a função de arquivar recusa); se aparecer, o motor sai como `null`.
 */
async function lerEtapasDasFamilias(chaves: Set<string>, familias: MotorDaConta['familias']): Promise<MotorDaConta['etapas_das_familias']> {
    if (chaves.size === 0) return []
    const etapas = await q('orcamentista_familia_etapa', db().from('orcamentista_familia_etapa').select('familia, numero, rotulo, motor_id').in('familia', [...chaves]).order('numero', { ascending: true }))
    const motorIds = [...new Set(etapas.map((e: Linha) => e.motor_id).filter((m: unknown): m is string => typeof m === 'string'))]
    const motores = motorIds.length ? await q('orcamentista_motor', db().from('orcamentista_motor').select('id, arquivo_nome, arquivado_em').in('id', motorIds)) : []
    const nomeDo = new Map(motores.filter((m: Linha) => m.arquivado_em == null).map((m: Linha) => [String(m.id), String(m.arquivo_nome)]))
    const ordem = new Map(familias.map((f) => [f.chave, f.ordem]))
    return [...new Set(etapas.map((e: Linha) => String(e.familia)))]
        .sort((a, b) => (ordem.get(a as string) ?? 0) - (ordem.get(b as string) ?? 0))
        .map((familia) => ({
            familia: familia as string,
            etapas: etapas.filter((e: Linha) => e.familia === familia).map((e: Linha) => ({
                numero: Number(e.numero), rotulo: String(e.rotulo),
                motor: typeof e.motor_id === 'string' && nomeDo.has(e.motor_id) ? { id: e.motor_id, arquivo_nome: nomeDo.get(e.motor_id) as string } : null,
            })),
        }))
}

/**
 * As planilhas que a conta usa: `orcamentista_motor` NÃO arquivada e COM tipologias — medido pelo conteúdo (`motor_id`), nunca pelo nome
 * do arquivo —, de um fornecedor que a base de conhecimento dela vincula (com tabela ou sem), OU, na planilha da FAMÍLIA (sem
 * fornecedor, 20261027000006), de uma família que a conta usa (`familiasDaConta`). Antes dessa migração só valia o fornecedor, e a
 * planilha sem fornecedor não aparecia para conta nenhuma.
 */
async function lerPlanilhasDaConta(
    nomeDo: Map<string, string>, contasDo: (fornecedorId: string) => string[], familias: MotorDaConta['familias'],
    familiasDaConta: Set<string>, contasDaFamilia: (familia: string) => Promise<string[]>,
): Promise<PlanilhaNoMotor[]> {
    const doFornecedor = nomeDo.size === 0 ? [] : await q('orcamentista_motor', db().from('orcamentista_motor').select('id, familia, fornecedor_id, arquivo_nome, vigente').in('fornecedor_id', [...nomeDo.keys()]).is('arquivado_em', null))
    const daFamilia = familiasDaConta.size === 0 ? [] : await q('orcamentista_motor', db().from('orcamentista_motor').select('id, familia, fornecedor_id, arquivo_nome, vigente').in('familia', [...familiasDaConta]).is('fornecedor_id', null).is('arquivado_em', null))
    const motores = [...doFornecedor, ...daFamilia]
    const contasDaFamiliaCache = new Map<string, string[]>()
    const saida: PlanilhaNoMotor[] = []
    for (const m of motores) {
        const id = String(m.id)
        if ((await contar('orcamentista_motor_tipologia_detalhe', 'tipologia', id, 'motor_id')) === 0) continue
        const contagens = {} as Record<AbaDaPlanilha, number>
        for (const c of CONTAGENS_DO_MOTOR) if (c.chave !== 'itens_de_preco') contagens[c.chave] = await contar(c.tabela, c.coluna, id, 'motor_id')
        const { linhas, otimizacao } = await linhasEOtimizacao(id, 'motor_id')
        let contasUsando: string[]
        if (m.fornecedor_id == null) {
            const familia = String(m.familia)
            if (!contasDaFamiliaCache.has(familia)) contasDaFamiliaCache.set(familia, await contasDaFamilia(familia))
            contasUsando = contasDaFamiliaCache.get(familia) as string[]
        } else {
            contasUsando = contasDo(String(m.fornecedor_id))
        }
        saida.push({
            motor_id: id, familia: String(m.familia), fornecedor: m.fornecedor_id == null ? null : nomeDo.get(String(m.fornecedor_id)) ?? '—',
            arquivo_nome: String(m.arquivo_nome), vigente: m.vigente === true, contas_usando: contasUsando, linhas, contagens, otimizacao,
        })
    }
    const ordemDaFamilia = new Map(familias.map((f) => [f.chave, f.ordem]))
    return saida.sort((a, b) => (ordemDaFamilia.get(a.familia) ?? 0) - (ordemDaFamilia.get(b.familia) ?? 0) || porTexto(a.fornecedor, b.fornecedor) || porTexto(a.arquivo_nome, b.arquivo_nome))
}

/**
 * As tipologias da tabela (a aba Detalhe), por linha e pela ordem do arquivo, com o tempo de fabricação
 * da tabela própria. A leitura ordena por `tipologia`, a chave da Detalhe.
 */
export async function lerTipologiasDoMotor(donoId: string, dono: ColunaDoDono = 'tabela_id'): Promise<TipologiaNoMotor[]> {
    const linhas = await todas('orcamentista_motor_tipologia_detalhe', (x) => x.eq(dono, donoId),
        'tipologia, linha, descricao, tipo, larg_min_mm, larg_max_mm, alt_min_mm, alt_max_mm, n_perfis, n_vidros, n_insumos, ordem', ['tipologia'])
    const tempos = await q('orcamentista_motor_tipologia_tempo', db().from('orcamentista_motor_tipologia_tempo').select('tipologia, tempo_fabricacao_min, tempo_origem').eq(dono, donoId))
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
export async function lerAbasDaTipologia(donoId: string, tipologia: string, dono: ColunaDoDono = 'tabela_id'): Promise<AbasDaTipologia> {
    const saida = {} as AbasDaTipologia
    for (const aba of ABAS_DA_TIPOLOGIA) {
        const linhas = await todas(aba.tabela, (x) => x.eq(dono, donoId).eq('tipologia', tipologia), ['id', ...aba.colunas].join(', '))
        saida[aba.chave] = linhas.map((l) => Object.fromEntries(aba.colunas.map((c) => [c, l[c] ?? null])))
    }
    return saida
}
