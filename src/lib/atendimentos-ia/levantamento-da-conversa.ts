/**
 * Atendimentos I.A. — o LEVANTAMENTO NA CONVERSA: a tabela em uso da empresa, as tipologias que a IA
 * pode escolher, e a mensagem do levantamento de barras que o vendedor recebe no WhatsApp quando a
 * pré-definição fecha. Quem chama é `conversa-da-ia.ts`.
 *
 * ══ PRIMEIRA VERSÃO, PARA VER RODANDO (dono do produto, 25/10/2026) ══
 *   - A COR É A DA PRÉ-DEFINIÇÃO (`cor_perfil`), desde a rodada do preço na conversa. A conversa só a
 *     aceita da lista `cores` da base de conhecimento (Perfil), EXATA (`lerCoresDaEmpresa`), e aqui
 *     ela é comparada exata com a coluna `cor` do motor: cor que o motor não tem para um perfil é
 *     recusa nomeada, com o perfil, a cor e as variantes que existem;
 *   - só as escolhas que a conversa captura (`escolhas-da-tipologia.ts`: ARI, ARE e MAE desde
 *     25/10/2026), gravadas em `orcamentista_pre_definicao.escolhas`; as outras variáveis ficam no
 *     Padrão, e a mensagem diz quais foram escolhidas. Sem escolha nenhuma, a DP-02 é recusada: o
 *     Padrão de MAE ("MEDIDA DO VÃO") não traz a medida;
 *   - UMA esquadria por conversa (é o que `orcamentista_pre_definicao` guarda);
 *   - NÃO persiste o levantamento: a mensagem é a saída;
 *   - SÓ A DP-02 DA TABELA WOLFF tem as abas do motor (Variáveis, Fórmulas, Perfis, Validações) no
 *     repositório (`abas-do-motor-wolff-DP-02.json`). O banco guarda só "Motor por barra" e
 *     "Fórmulas da família", e as fórmulas da família divergem das da DP-02 em 9 de 16 variáveis
 *     (medido, `avaliador-de-formulas.test.ts`): calcular com elas seria calcular com o que a
 *     tipologia não usa. Qualquer outro DP, ou outra tabela, é RECUSA NOMEADA.
 *
 * ══ A LISTA DE TIPOLOGIAS ══
 * Vem de `orcamentista_motor_tipologia_detalhe` (tabela_id, tipologia, descricao, tipo, …) da tabela
 * ligada à empresa em `orcamentista_conta_tabela`. Em 25/10/2026 ela AINDA NÃO EXISTE em produção — a
 * migração está sendo aplicada pelo dono do produto. Enquanto não existir, a leitura falha e a
 * conversa responde com a frase de `SEM_LISTA_DE_TIPOLOGIAS`, sem chamar a LLM: sem lista, a IA não
 * tem de onde escolher, e escolher por conta própria é o que a regra proíbe.
 *
 * ══ AS REGRAS DO MOTOR, PAGINADAS ══
 * As regras são lidas POR TIPOLOGIA (`tipologias @> [DP]`), não por perfil na tabela inteira. Medido em
 * 25/10/2026: os 14 perfis da DP-02 têm 2.041 linhas na tabela inteira e 196 na DP-02, e o de-para
 * (perfil, cor, código) é o MESMO nos dois recortes — 103 trios. E a maior tipologia tem 1.157
 * linhas, acima das 1.000 que o PostgREST devolve por vez: a leitura pagina e confere a contagem
 * exata, em vez de calcular com uma lista cortada em silêncio (`instrumento-que-nao-enxerga.md`).
 *
 * ══ O TEMPO DE FABRICAÇÃO — LEITURA TEMPORÁRIA ══
 * `tempoDeFabricacao` lê `orcamentista_motor_tipologia.tempo_fabricacao_min`, a coluna antiga, porque a
 * migração 20261024000003 (`orcamentista_motor_tipologia_tempo`) ainda não foi aplicada. Quando for, a
 * troca é a tabela e as duas colunas DESTA função, e só dela.
 *
 * ══ A MÃO DE OBRA — O CAMINHO DA TELA DE PRODUTO ══
 * `lerMaoDeObra`: o tempo de fabricação da tipologia × o valor do minuto, pelo MESMO caminho que
 * `products/content.component.tsx` usa — está em `src/utils/mao-de-obra-pelo-caminho-da-tela.ts`,
 * fora desta área, porque a conta e o vocabulário dela são do sistema do cliente.
 * `productive_value_per_minute` NÃO é lido: está 0 em produção e nada escreve nele (dono do
 * produto, 25/10/2026). Faltou um dos números: falta NOMEADA, nunca zero, e os totais com mão de
 * obra não saem.
 *
 * ══ O QUE O PREÇO COBRE — dito SEMPRE (dono do produto, 25/10/2026) ══
 * Medido: `orcamentista_motor_regra` só tem tipo 'Perfil' e 'Insumo', e VIDRO não existe lá; o avaliador
 * só gera peça para a aba Perfis. O número é PERFIS (o baguete incluído) mais a mão de obra — e a
 * mensagem diz isso, e diz o que fica de fora, em toda resposta com preço. Um "Material" que exclui o
 * vidro e os insumos sem declarar é um número que parece completo e não é. Por isso as linhas se chamam
 * "Perfis", e `O_QUE_O_PRECO_COBRE` vai junto.
 *
 * ══ OS VALORES DA MENSAGEM SÃO OS EXIBIDOS ══
 * Os dois totais de material são arredondados ao centavo ANTES de virar diferença ou soma: assim a
 * conta que o vendedor refaz com os números da mensagem bate com o número que ela traz. São CUSTO —
 * material da tabela do fornecedor (`valor_*_interno`) e mão de obra —, sem margem nem imposto.
 *
 * ══ A ESPESSURA DO VIDRO ══
 * O avaliador escolhe o baguete pela espessura. Ela é lida do campo `vidro` que o vendedor disse,
 * quando ele traz EXATAMENTE um número em mm ("Temperado 6mm" → 6). Sem número, ou com dois, ela fica
 * ausente — e o avaliador recusa as linhas de baguete dizendo que falta a espessura. Nada é suposto.
 *
 * Portão: `src/utils/__tests__/levantamento-da-conversa.test.ts`.
 */
import { supabaseAdmin } from '@/supabase/admin'
import { lerTipologia, type AbasDoMotor, type AvisoDoAvaliador, type Tipologia } from '@/lib/atendimentos-ia/avaliador-de-formulas'
import { descreverArremate, escolhasComPadrao, lerEscolhasGravadas, traduzirVocabulario } from '@/lib/atendimentos-ia/escolhas-da-tipologia'
import {
    formatarReais, levantarBarras,
    type ItemDaTabela, type RegraDoDePara, type ResultadoDoLevantamento,
} from '@/lib/atendimentos-ia/levantamento-de-barras'
import { maoDeObraPeloCaminhoDaTela, type DadosDaEmpresaParaMaoDeObra } from '@/utils/mao-de-obra-pelo-caminho-da-tela'
import ABAS_WOLFF_DP02 from '@/lib/atendimentos-ia/abas-do-motor-wolff-DP-02.json'

// ── As abas do motor que existem no repositório ─────────────────────────────────────────────
/** A tabela Wolff de 20/10/2026 — a única cujas abas por tipologia estão no repositório. */
export const TABELA_WOLFF = '72366020-57c9-489f-9385-397b7fa3dedb'
/** tabela → tipologia → abas. Uma tipologia fora daqui é recusada pelo nome. */
export const ABAS_IMPORTADAS: Readonly<Record<string, Readonly<Record<string, AbasDoMotor>>>> = {
    [TABELA_WOLFF]: { 'DP-02': ABAS_WOLFF_DP02 as unknown as AbasDoMotor },
}

// ── A tabela da empresa e as tipologias candidatas ──────────────────────────────────────────
export type CandidatoDeTipologia = { tipologia: string; descricao: string | null; tipo: string | null }
export type TabelaDaEmpresa =
    | { ok: true; tabelaId: string; candidatos: CandidatoDeTipologia[] }
    | { ok: false; motivo: 'SEM_TABELA' | 'MAIS_DE_UMA_TABELA' | 'SEM_LISTA_DE_TIPOLOGIAS'; frase: string; detalhe: string }

export const FRASE_SEM_TABELA = 'Ainda não consigo escolher a tipologia: a sua empresa não tem uma tabela de fornecedor ligada ao orçamentista.'
export const fraseDeMaisDeUmaTabela = (n: number) =>
    `Ainda não consigo escolher a tipologia: a sua empresa tem ${n} tabelas de fornecedor ligadas ao orçamentista, e ele trabalha com uma só.`
export const FRASE_SEM_LISTA_DE_TIPOLOGIAS = 'Ainda não consigo escolher a tipologia: a lista de tipologias do fornecedor, com a descrição de cada uma, ainda não foi carregada.'

export async function lerTabelaDaEmpresa(tenantId: string): Promise<TabelaDaEmpresa> {
    const { data: ligadas, error } = await supabaseAdmin.from('orcamentista_conta_tabela').select('tabela_id').eq('tenant_id', tenantId)
    if (error) throw new Error(`orcamentista_conta_tabela: ${error.message}`)
    const tabelas = (ligadas ?? []) as Array<{ tabela_id: string }>
    if (tabelas.length === 0) return { ok: false, motivo: 'SEM_TABELA', frase: FRASE_SEM_TABELA, detalhe: '' }
    if (tabelas.length > 1) return { ok: false, motivo: 'MAIS_DE_UMA_TABELA', frase: fraseDeMaisDeUmaTabela(tabelas.length), detalhe: `tabelas=${tabelas.length}` }
    const tabelaId = tabelas[0].tabela_id
    const { data, error: erroDaLista } = await supabaseAdmin
        .from('orcamentista_motor_tipologia_detalhe').select('tipologia, descricao, tipo').eq('tabela_id', tabelaId)
    // a tabela ainda não existe em produção: a leitura falha, e é isso que a frase diz
    if (erroDaLista) return { ok: false, motivo: 'SEM_LISTA_DE_TIPOLOGIAS', frase: FRASE_SEM_LISTA_DE_TIPOLOGIAS, detalhe: `codigo=${erroDaLista.code ?? '-'}` }
    const candidatos = ((data ?? []) as CandidatoDeTipologia[])
        .filter((c) => typeof c.tipologia === 'string' && c.tipologia !== '')
        .sort((a, b) => (a.tipologia < b.tipologia ? -1 : a.tipologia > b.tipologia ? 1 : 0))
    if (candidatos.length === 0) return { ok: false, motivo: 'SEM_LISTA_DE_TIPOLOGIAS', frase: FRASE_SEM_LISTA_DE_TIPOLOGIAS, detalhe: 'linhas=0' }
    return { ok: true, tabelaId, candidatos }
}

/** A linha do candidato no prompt: código, descrição inteira e tipo. Ausente não vira texto inventado. */
/** A tipologia com as abas do motor, para a tabela da empresa — ou null, quando as abas não existem. */
export function tipologiaDaTabela(tabela: TabelaDaEmpresa, codigo: unknown): Tipologia | null {
    if (!('tabelaId' in tabela) || typeof codigo !== 'string') return null
    const abas = ABAS_IMPORTADAS[tabela.tabelaId]?.[codigo]
    if (!abas) return null
    const lida = lerTipologia(abas, codigo)
    return 'tipologia' in lida ? lida.tipologia : null
}

export const linhaDoCandidato = (c: CandidatoDeTipologia) =>
    `${c.tipologia} | ${c.descricao ?? '(sem descrição no arquivo)'} | ${c.tipo ?? '(sem tipo no arquivo)'}`

// ── O tempo de fabricação — TEMPORÁRIO ──────────────────────────────────────────────────────
/**
 * TEMPORÁRIO: lê a coluna antiga de `orcamentista_motor_tipologia` enquanto a 20261024000003 não é
 * aplicada. Depois, a tabela passa a ser `orcamentista_motor_tipologia_tempo` — a troca é aqui, e só aqui.
 */
export async function tempoDeFabricacao(tabelaId: string, tipologia: string): Promise<{ minutos: number; origem: string | null } | null> {
    const { data, error } = await supabaseAdmin
        .from('orcamentista_motor_tipologia').select('tempo_fabricacao_min, tempo_origem')
        .eq('tabela_id', tabelaId).eq('tipologia', tipologia).maybeSingle()
    if (error) throw new Error(`orcamentista_motor_tipologia: ${error.message}`)
    const linha = data as { tempo_fabricacao_min: number | null; tempo_origem: string | null } | null
    if (!linha || typeof linha.tempo_fabricacao_min !== 'number') return null
    return { minutos: linha.tempo_fabricacao_min, origem: linha.tempo_origem }
}

// ── A espessura do vidro ────────────────────────────────────────────────────────────────────
/**
 * O número em mm do texto do vidro, quando o texto tem UM número só e ele vem seguido de "mm".
 * "Laminado 4+4 mm" tem dois números: ler só o 4 seria escolher a parte que casa com o padrão —
 * fica null, e a recusa diz que falta a espessura. Nada é suposto.
 */
export function espessuraDoVidro(vidro: unknown): number | null {
    if (typeof vidro !== 'string') return null
    const numeros = vidro.match(/\d+(?:[.,]\d+)?/g) ?? []
    if (numeros.length !== 1) return null
    const comMm = /(\d+(?:[.,]\d+)?)\s*mm\b/i.exec(vidro)
    if (!comMm) return null
    const n = Number(comMm[1].replace(',', '.'))
    return Number.isFinite(n) && n > 0 ? n : null
}

// ── A mão de obra ───────────────────────────────────────────────────────────────────────────
export type MaoDeObra =
    | {
        ok: true
        minutosPorUnidade: number
        origem: string | null
        quantidade: number
        /** O custo mensal que a tela de produto entrega ao motor (`custoMensalDeMaoDeObraDoProduto`). */
        custoMensal: number
        /** Os minutos produtivos da empresa no mês (`resolveMonthlyWorkload`). */
        minutosDaEmpresa: number
        /** `calculatePricing(...).productiveLaborCost`: a mão de obra de UMA unidade, em R$ ao centavo. */
        porUnidade: number
        total: number
    }
    | { ok: false; falta: string }

const centavos = (v: number) => Math.round(v * 100) / 100

/**
 * A mão de obra de `quantidade` unidades da tipologia: o tempo de fabricação × o valor do minuto pelo
 * caminho da tela de produto (`maoDeObraPeloCaminhoDaTela`). A esquadria é PRODUZIDA: o tipo de
 * cálculo é o da empresa, como na tela para um produto que não é de revenda. Toda leitura é desta
 * empresa (`tenant_id`) ou da tabela ligada a ela.
 */
export async function lerMaoDeObra(tenantId: string, tabelaId: string, tipologia: string, quantidade: number): Promise<MaoDeObra> {
    const tempo = await tempoDeFabricacao(tabelaId, tipologia)
    if (tempo === null) return { ok: false, falta: `o tempo de fabricação de ${tipologia} não está cadastrado` }

    const [{ data: settings, error: erroSettings }, { data: despesas, error: erroDespesas }] = await Promise.all([
        supabaseAdmin.from('tenant_settings').select('calc_type, monthly_workload, workload_unit, num_productive_employees').eq('tenant_id', tenantId).maybeSingle(),
        supabaseAdmin.from('tenant_expense_config')
            .select('production_labor_cost_hub, production_labor_cost, admin_salary_total, admin_fgts_total, admin_other_costs, fixed_expense_monthly')
            .eq('tenant_id', tenantId).maybeSingle(),
    ])
    if (erroSettings) throw new Error(`tenant_settings: ${erroSettings.message}`)
    if (erroDespesas) throw new Error(`tenant_expense_config: ${erroDespesas.message}`)
    const dados = { ...((settings ?? {}) as DadosDaEmpresaParaMaoDeObra), ...((despesas ?? {}) as DadosDaEmpresaParaMaoDeObra) }

    const m = maoDeObraPeloCaminhoDaTela(dados, tempo.minutos)
    if ('faltas' in m) return { ok: false, falta: m.faltas.join('; ') }
    return {
        ok: true, minutosPorUnidade: tempo.minutos, origem: tempo.origem, quantidade,
        custoMensal: m.custoMensal, minutosDaEmpresa: m.minutosDaEmpresa,
        porUnidade: m.valor, total: centavos(m.valor * quantidade),
    }
}

// ── As leituras do banco ────────────────────────────────────────────────────────────────────
const PAGINA = 1000

/** As regras da tipologia, página a página, conferidas contra a contagem exata. */
export async function lerRegras(tabelaId: string, tipologia: string): Promise<RegraDoDePara[]> {
    const regras: RegraDoDePara[] = []
    let total: number | null = null
    for (let de = 0; total === null || de < total; de += PAGINA) {
        const { data, error, count } = await supabaseAdmin
            .from('orcamentista_motor_regra').select('codigo, codigo_wvetro, cor', { count: 'exact' })
            .eq('tabela_id', tabelaId).contains('tipologias', [tipologia])
            .order('id', { ascending: true }).range(de, de + PAGINA - 1)
        if (error) throw new Error(`orcamentista_motor_regra: ${error.message}`)
        if (typeof count !== 'number') throw new Error('orcamentista_motor_regra: a contagem exata não veio')
        total = count
        const pagina = (data ?? []) as RegraDoDePara[]
        regras.push(...pagina)
        if (pagina.length === 0) break
    }
    if (regras.length !== total) throw new Error(`orcamentista_motor_regra: ${regras.length} linhas lidas de ${total}`)
    return regras
}

async function lerItens(tabelaId: string, codigos: string[]): Promise<ItemDaTabela[]> {
    const itens: ItemDaTabela[] = []
    for (let i = 0; i < codigos.length; i += 200) {
        const lote = codigos.slice(i, i + 200)
        const { data, error } = await supabaseAdmin
            .from('orcamentista_tabela_item').select('codigo, descricao, medida_barra_m, valor_barra_interno, valor_metro_interno')
            .eq('tabela_id', tabelaId).in('codigo', lote)
        if (error) throw new Error(`orcamentista_tabela_item: ${error.message}`)
        itens.push(...((data ?? []) as ItemDaTabela[]))
    }
    return itens
}

/** As configurações da categoria PERFIL da base de conhecimento DESTA empresa — uma por matéria-prima. */
async function lerConfigsDoPerfil(tenantId: string): Promise<Array<Record<string, unknown>>> {
    const { data, error } = await supabaseAdmin
        .from('orcamentista_mp_categoria').select('config').eq('tenant_id', tenantId).eq('categoria_chave', 'PERFIL')
    if (error) throw new Error(`orcamentista_mp_categoria: ${error.message}`)
    return ((data ?? []) as Array<{ config: Record<string, unknown> | null }>).map((l) => l.config ?? {})
}

/** A frase de quando a base de conhecimento não tem a lista de cores: a conversa diz isso em vez de perguntar. */
export const FRASE_SEM_CORES = 'Ainda não consigo anotar a cor do perfil: a base de conhecimento da empresa não tem a lista de cores do Perfil.'

/**
 * As cores da empresa: a lista `cores` da categoria PERFIL, de todas as matérias-primas, sem repetição
 * e na ordem em que aparecem. EXATAS, como estão gravadas — é contra elas que a cor do perfil é
 * validada, e é com elas que o motor é lido.
 */
export async function lerCoresDaEmpresa(tenantId: string): Promise<string[]> {
    const cores: string[] = []
    for (const config of await lerConfigsDoPerfil(tenantId)) {
        const lista = Array.isArray(config.cores) ? config.cores : []
        for (const c of lista) if (typeof c === 'string' && c !== '' && !cores.includes(c)) cores.push(c)
    }
    return cores
}

/** A serra da base de conhecimento, categoria PERFIL. Um valor só — ou a frase do que falta. */
async function lerSerra(tenantId: string): Promise<{ ok: true; serra_mm: number } | { ok: false; frase: string }> {
    const valores = [...new Set((await lerConfigsDoPerfil(tenantId))
        .map((c) => c.serra_mm).filter((v): v is number => typeof v === 'number' && Number.isFinite(v)))]
    if (valores.length === 1) return { ok: true, serra_mm: valores[0] }
    if (valores.length === 0) return { ok: false, frase: 'a largura da serra não está na base de conhecimento da empresa (categoria Perfil). Falta: a serra, em mm.' }
    return { ok: false, frase: `a base de conhecimento da empresa tem ${valores.length} larguras de serra diferentes na categoria Perfil (${valores.join(' mm, ')} mm). Falta dizer qual vale.` }
}

// ── As frases ───────────────────────────────────────────────────────────────────────────────
function numeroBR(n: number, casas: number): string {
    const [inteiro, frac] = Math.abs(n).toFixed(casas).split('.')
    const comPontos = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    return `${n < 0 ? '−' : ''}${comPontos}${frac ? `,${frac}` : ''}`
}
const metros = (mm: number) => `${numeroBR(mm / 1000, mm % 1000 === 0 ? 0 : 2)} m`

export const fraseDaTipologiaSemAbas = (tipologia: string) =>
    `A tipologia ${tipologia} não tem as abas do motor importadas (Variáveis, Fórmulas, Perfis): ainda não consigo calcular as barras dela.`

function fraseDoAviso(a: AvisoDoAvaliador): string {
    if (a.origem === 'VALIDACAO') return a.mensagem
    const medida = a.medida === 'L' ? 'largura' : 'altura'
    const lado = a.limite === 'MIN' ? 'abaixo do mínimo' : 'acima do máximo'
    return `A ${medida} de ${numeroBR(a.valor_mm, 0)} mm está ${lado} da tipologia (${numeroBR(a.limite_mm, 0)} mm), ${numeroBR(a.excesso_mm, 0)} mm (${numeroBR(a.excesso_pct, 1)}%).`
}

/**
 * `escolhas` é a linha do ARREMATE, em português (`descreverArremate`): cada variável capturada que se
 * aplica, com a opção por extenso e se é o padrão ou a escolha do vendedor. Null quando a tipologia não
 * tem as abas — não há variável conhecida, e a linha NÃO aparece.
 */
export type DadosDaEsquadria = { tipologia: string; largura_mm: number; altura_mm: number; quantidade: number; escolhas: string | null }
/** O levantamento como a mensagem o recebe: o nome que o vendedor deu, a cor, e as esquadrias na ordem. */
export type DadosDoLevantamento = { nome: string; cor: string; esquadrias: DadosDaEsquadria[] }
const cabecalho = (d: DadosDoLevantamento) => `levantamento “${d.nome}”, perfil ${d.cor}`
const linhasDaEsquadria = (e: DadosDaEsquadria, k: number): string[] => [
    `Esquadria ${k}: ${e.tipologia}, ${numeroBR(e.largura_mm, 0)} x ${numeroBR(e.altura_mm, 0)} mm, ${e.quantidade} unidade(s).`,
    ...(e.escolhas === null ? [] : [`Arremate e guarnição — ${e.escolhas}.`]),
]

/** O que o número cobre e o que NÃO cobre — vai em toda resposta com preço. */
export const O_QUE_O_PRECO_COBRE = 'O que este preço cobre: os perfis (o baguete incluído), pela tabela do fornecedor, e a mão de obra. '
    + 'NÃO cobre o vidro nem os insumos e acessórios (ferragens, escovas, calços e outros): eles ainda não estão na base.'
const linhasDasEsquadrias = (d: DadosDoLevantamento) => d.esquadrias.flatMap((e, i) => linhasDaEsquadria(e, i + 1))

/** No máximo tantas faltas listadas; o resto é contado, nunca calado. */
const MAXIMO_DE_FALTAS = 8

/** A frase da recusa: inteira, nomeada, em português — todas as faltas de todas as esquadrias. */
export function fraseDaRecusa(d: DadosDoLevantamento, faltas: string[]): string {
    const listadas = faltas.slice(0, MAXIMO_DE_FALTAS).map((f) => `• ${f}`)
    const resto = faltas.length > MAXIMO_DE_FALTAS ? [`• e mais ${faltas.length - MAXIMO_DE_FALTAS} falta(s) do mesmo levantamento.`] : []
    return [`Não consegui fechar o ${cabecalho(d)}.`, ...linhasDasEsquadrias(d), 'Falta:', ...listadas, ...resto].join('\n')
}

const linhaDaMaoDeObra = (rotulo: string, mo: MaoDeObra) => ('falta' in mo
    ? `${rotulo}: não sai — ${mo.falta}.`
    : `${rotulo}: ${numeroBR(mo.minutosPorUnidade, 0)} min por unidade${mo.origem ? ` (${mo.origem})` : ''} × ${mo.quantidade} unidade(s), `
        + `a R$ ${numeroBR(mo.custoMensal / mo.minutosDaEmpresa, 6)} o minuto (${formatarReais(mo.custoMensal)} ÷ ${numeroBR(mo.minutosDaEmpresa, 0)} min): ${formatarReais(mo.total)}.`)

/**
 * A frase do levantamento que fechou: barras por código, aproveitamento, os dois totais de material, a
 * diferença entre eles, a mão de obra — uma linha por esquadria e a total, quando há mais de uma —, e
 * os dois totais com a mão de obra. O que não sai diz o que falta. `maos` vem na ordem das esquadrias.
 */
export function fraseDoLevantamento(d: DadosDoLevantamento, r: Extract<ResultadoDoLevantamento, { ok: true }>, maos: MaoDeObra[]): string {
    const linhas = [`${maiuscula(cabecalho(d))}.`, ...linhasDasEsquadrias(d), '', 'Barras por código:']
    for (const c of r.por_codigo) {
        linhas.push(`• ${c.codigo} (${c.perfil}): ${c.n_barras} barra(s) de ${metros(c.comprimento_barra_mm)}`)
    }
    const t = r.total
    linhas.push('')
    linhas.push(t.aproveitamento_pct === null
        ? 'Aproveitamento do levantamento: não há peça para aproveitar.'
        : `Aproveitamento do levantamento: ${numeroBR(t.aproveitamento_pct, 1)}% (${numeroBR(t.metros_uteis, 2)} m úteis de ${numeroBR(t.metros_comprados, 2)} m comprados).`)
    // R3: o código E a cor que faltam — nunca a soma do que deu
    const faltaDo = (total: 'total_por_barra_inteira' | 'total_por_consumo_real') =>
        `${r.falta_para_o_total.filter((f) => f.total === total).map((f) => `${f.codigo} (${f.perfil})`).join(', ')} em ${d.cor}`

    // ao centavo ANTES de virar diferença ou soma: a conta refeita com os números da mensagem bate
    const barra = t.total_por_barra_inteira === null ? null : centavos(t.total_por_barra_inteira)
    const consumo = t.total_por_consumo_real === null ? null : centavos(t.total_por_consumo_real)
    linhas.push('')
    linhas.push(barra === null
        ? `Perfis por barra inteira: não sai — falta o valor da barra de ${faltaDo('total_por_barra_inteira')}.`
        : `Perfis por barra inteira: ${formatarReais(barra)}.`)
    linhas.push(consumo === null
        ? `Perfis por consumo real: não sai — falta o valor do metro de ${faltaDo('total_por_consumo_real')}.`
        : `Perfis por consumo real: ${formatarReais(consumo)}.`)
    linhas.push(barra === null || consumo === null
        ? `Diferença entre os dois: não sai — falta o ${barra === null ? 'total por barra inteira' : 'total por consumo real'}.`
        : `Diferença entre os dois: ${formatarReais(centavos(barra - consumo))}.`)
    // uma mão de obra ausente derruba a total: somar as que existem seria calcular com o que sobrou
    const todasCalculadas = maos.length > 0 && maos.every((m) => !('falta' in m))
    const maoDeObraTotal = todasCalculadas ? centavos(maos.reduce((s, m) => s + ('falta' in m ? 0 : m.total), 0)) : null
    if (maos.length === 1) linhas.push(linhaDaMaoDeObra('Mão de obra', maos[0]))
    else {
        maos.forEach((m, i) => linhas.push(linhaDaMaoDeObra(`Mão de obra da esquadria ${i + 1}`, m)))
        linhas.push(maoDeObraTotal === null ? 'Mão de obra total: não sai — falta a mão de obra de uma esquadria.' : `Mão de obra total: ${formatarReais(maoDeObraTotal)}.`)
    }
    const comMaoDeObra = (rotulo: string, material: number | null, nomeDoMaterial: string) => {
        if (maoDeObraTotal === null) return `${rotulo} (perfis + mão de obra): não sai — falta a mão de obra.`
        if (material === null) return `${rotulo} (perfis + mão de obra): não sai — falta o ${nomeDoMaterial}.`
        return `${rotulo} (perfis + mão de obra): ${formatarReais(centavos(material + maoDeObraTotal))}.`
    }
    linhas.push('')
    linhas.push(comMaoDeObra('Total por barra inteira', barra, 'valor dos perfis por barra inteira'))
    linhas.push(comMaoDeObra('Total por consumo real', consumo, 'valor dos perfis por consumo real'))
    linhas.push('', O_QUE_O_PRECO_COBRE)
    if (r.avisos.length) {
        linhas.push('', 'Atenção:')
        for (const a of r.avisos) {
            const k = (a as { esquadria?: unknown }).esquadria
            linhas.push(`• ${d.esquadrias.length > 1 && typeof k === 'number' ? `Esquadria ${k}: ` : ''}${fraseDoAviso(a)}`)
        }
    }
    return linhas.join('\n')
}

/** "Esquadria 1 (DP-02): " — com uma esquadria só, o vendedor sabe qual é, e o prefixo sai. */
const semPrefixoDaEsquadria = (m: string) => m.replace(/^Esquadrias? [\d, e]+(?: \([^)]*\))?: /, '')
const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

// ── O levantamento ──────────────────────────────────────────────────────────────────────────
export type LevantamentoDaConversa = { texto: string; desfecho: 'levantou' | 'recusou' }

/** Uma esquadria como o levantamento a guarda (`orcamentista_levantamento_item`). */
export type EsquadriaGravada = { ordem?: unknown; tipologia: unknown; largura_mm: unknown; altura_mm: unknown; quantidade: unknown; cor_perfil: unknown; vidro: unknown; escolhas: unknown }

/**
 * A mensagem do levantamento, com TODAS as esquadrias dele. Lança só em erro de banco — quem chama
 * loga e não manda nada técnico ao vendedor. Toda falta de DADO volta como texto de recusa, nomeada,
 * e as faltas de todas as esquadrias saem de uma vez.
 *
 * As esquadrias de um levantamento são calculadas com UMA cor — `levantarBarras` recebe uma —; cores
 * diferentes no mesmo levantamento são recusa nomeada, com a cor de cada uma. Nunca se escolhe uma.
 */
export async function mensagemDoLevantamento(
    tenantId: string,
    tabela: TabelaDaEmpresa,
    lev: { nome: string; itens: EsquadriaGravada[] },
): Promise<LevantamentoDaConversa> {
    const corDe = (e: EsquadriaGravada) => (typeof e.cor_perfil === 'string' && e.cor_perfil !== '' ? e.cor_perfil : null)
    const cores = [...new Set(lev.itens.map(corDe).filter((c): c is string => c !== null))]
    const d: DadosDoLevantamento = {
        nome: lev.nome,
        cor: cores.length === 1 ? cores[0] : cores.length === 0 ? '(sem cor)' : '(cores diferentes)',
        esquadrias: lev.itens.map((e) => ({
            tipologia: String(e.tipologia), largura_mm: Number(e.largura_mm), altura_mm: Number(e.altura_mm), quantidade: Number(e.quantidade), escolhas: null as string | null,
        })),
    }
    const recusa = (faltas: string[]): LevantamentoDaConversa => ({ texto: fraseDaRecusa(d, faltas), desfecho: 'recusou' })
    if ('frase' in tabela) return recusa([maiuscula(tabela.frase.replace(/^Ainda não consigo escolher a tipologia: /, ''))])

    const faltas: string[] = []
    lev.itens.forEach((e, i) => { if (corDe(e) === null) faltas.push(`A esquadria ${i + 1} está sem a cor do perfil.`) })
    if (cores.length > 1) {
        const porEsquadria = lev.itens.map((e, i) => (corDe(e) === null ? null : `esquadria ${i + 1}: ${corDe(e)}`)).filter(Boolean).join('; ')
        faltas.push(`As esquadrias têm cores diferentes (${porEsquadria}): ainda não calculo um levantamento com cores misturadas.`)
    }

    // as abas de cada tipologia, uma vez por tipologia; as escolhas descritas, uma vez por esquadria
    const lidas: Record<string, Tipologia> = {}
    for (const t of [...new Set(d.esquadrias.map((e) => e.tipologia))]) {
        const abas = ABAS_IMPORTADAS[tabela.tabelaId]?.[t]
        if (!abas) { faltas.push(fraseDaTipologiaSemAbas(t)); continue }
        const lida = lerTipologia(abas, t)
        if ('recusas' in lida) faltas.push(...lida.recusas.map((x) => x.mensagem))
        else lidas[t] = lida.tipologia
    }
    const escolhas = lev.itens.map((e) => lerEscolhasGravadas(e.escolhas))
    d.esquadrias.forEach((e, i) => { if (lidas[e.tipologia]) e.escolhas = descreverArremate(lidas[e.tipologia], escolhas[i]) })
    if (faltas.length) return recusa(faltas)

    const serra = await lerSerra(tenantId)
    if ('frase' in serra) return recusa([maiuscula(serra.frase)])
    // a mesma linha do motor pode servir a duas tipologias: o de-para entra uma vez só
    const porTrio = new Map<string, RegraDoDePara>()
    for (const t of Object.keys(lidas)) {
        for (const g of await lerRegras(tabela.tabelaId, t)) porTrio.set(JSON.stringify([g.codigo, g.codigo_wvetro, g.cor]), g)
    }
    const regras = [...porTrio.values()]
    const itens = await lerItens(tabela.tabelaId, [...new Set(regras.map((r) => r.codigo))].sort())
    // as cores da empresa: o que é COR na coluna `cor` do motor, para a guarda da variante única
    const coresDaEmpresa = await lerCoresDaEmpresa(tenantId)

    const r = levantarBarras({
        cor: cores[0],
        coresDaEmpresa,
        // o padrão do arremate entra AQUI, pelo ponto único (`padraoDoArremate`), e não pelo avaliador
        esquadrias: d.esquadrias.map((e, i) => ({
            tipologia: e.tipologia, L_mm: e.largura_mm, H_mm: e.altura_mm, quantidade: e.quantidade,
            escolhas: lidas[e.tipologia] ? escolhasComPadrao(lidas[e.tipologia], escolhas[i]) : escolhas[i], espessura_vidro_mm: espessuraDoVidro(lev.itens[i].vidro),
        })),
        tipologias: lidas,
        regras,
        itens,
        serra_mm: serra.serra_mm,
    })
    if ('recusas' in r) {
        const uma = d.esquadrias.length === 1
        // R4: a recusa nomeia o que falta, em português — sem o código interno da variável
        const traduzir = (m: string) => Object.values(lidas).reduce((t, tip) => traduzirVocabulario(t, tip), m)
        return recusa(r.recusas.map((x) => maiuscula(traduzir(uma ? semPrefixoDaEsquadria(x.mensagem) : x.mensagem))))
    }
    const maos: MaoDeObra[] = []
    for (const e of d.esquadrias) maos.push(await lerMaoDeObra(tenantId, tabela.tabelaId, e.tipologia, e.quantidade))
    return { texto: fraseDoLevantamento(d, r, maos), desfecho: 'levantou' }
}
