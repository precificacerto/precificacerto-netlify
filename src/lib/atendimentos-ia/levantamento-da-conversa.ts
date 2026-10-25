/**
 * Atendimentos I.A. — o LEVANTAMENTO NA CONVERSA: a tabela em uso da empresa, as tipologias que a IA
 * pode escolher, e a mensagem do levantamento de barras que o vendedor recebe no WhatsApp quando a
 * pré-definição fecha. Quem chama é `conversa-da-ia.ts`.
 *
 * ══ PRIMEIRA VERSÃO, PARA VER RODANDO (dono do produto, 25/10/2026) ══
 *   - COR FIXA BRANCO (`COR_DA_PRIMEIRA_VERSAO`): a cor que o vendedor diz é anotada e NÃO é usada;
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
 * ══ A ESPESSURA DO VIDRO ══
 * O avaliador escolhe o baguete pela espessura. Ela é lida do campo `vidro` que o vendedor disse,
 * quando ele traz EXATAMENTE um número em mm ("Temperado 6mm" → 6). Sem número, ou com dois, ela fica
 * ausente — e o avaliador recusa as linhas de baguete dizendo que falta a espessura. Nada é suposto.
 *
 * Portão: `src/utils/__tests__/levantamento-da-conversa.test.ts`.
 */
import { supabaseAdmin } from '@/supabase/admin'
import { lerTipologia, type AbasDoMotor, type AvisoDoAvaliador, type Tipologia } from '@/lib/atendimentos-ia/avaliador-de-formulas'
import { descreverEscolhas, lerEscolhasGravadas } from '@/lib/atendimentos-ia/escolhas-da-tipologia'
import {
    COR_DA_PRIMEIRA_VERSAO, formatarReais, levantarBarras,
    type ItemDaTabela, type RegraDoDePara, type ResultadoDoLevantamento,
} from '@/lib/atendimentos-ia/levantamento-de-barras'
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

/** A serra da base de conhecimento, categoria PERFIL. Um valor só — ou a frase do que falta. */
async function lerSerra(tenantId: string): Promise<{ ok: true; serra_mm: number } | { ok: false; frase: string }> {
    const { data, error } = await supabaseAdmin
        .from('orcamentista_mp_categoria').select('config').eq('tenant_id', tenantId).eq('categoria_chave', 'PERFIL')
    if (error) throw new Error(`orcamentista_mp_categoria: ${error.message}`)
    const valores = [...new Set(((data ?? []) as Array<{ config: Record<string, unknown> | null }>)
        .map((l) => l.config?.serra_mm).filter((v): v is number => typeof v === 'number' && Number.isFinite(v)))]
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
 * `escolhas`, em três estados que a mensagem distingue:
 *   - null — a tipologia não tem as abas: não há variável conhecida, e a linha NÃO aparece;
 *   - ''   — as abas existem e nenhuma escolha foi capturada: "nenhuma — todas no Padrão";
 *   - texto — as escolhas descritas (`descreverEscolhas`).
 */
export type DadosDaEsquadria = { tipologia: string; largura_mm: number; altura_mm: number; quantidade: number; escolhas: string | null }
const cabecalho = (e: DadosDaEsquadria) =>
    `${e.tipologia}, ${numeroBR(e.largura_mm, 0)} x ${numeroBR(e.altura_mm, 0)} mm, ${e.quantidade} unidade(s), perfil ${COR_DA_PRIMEIRA_VERSAO}`
const linhaDasEscolhas = (e: DadosDaEsquadria): string[] =>
    e.escolhas === null ? []
        : e.escolhas === '' ? ['Escolhas: nenhuma — todas as variáveis ficaram no Padrão da tipologia.']
            : [`Escolhas: ${e.escolhas}. As outras variáveis ficaram no Padrão da tipologia.`]

/** No máximo tantas faltas listadas; o resto é contado, nunca calado. */
const MAXIMO_DE_FALTAS = 8

/** A frase da recusa: inteira, nomeada, em português. */
export function fraseDaRecusa(e: DadosDaEsquadria, faltas: string[]): string {
    const listadas = faltas.slice(0, MAXIMO_DE_FALTAS).map((f) => `• ${f}`)
    const resto = faltas.length > MAXIMO_DE_FALTAS ? [`• e mais ${faltas.length - MAXIMO_DE_FALTAS} falta(s) do mesmo levantamento.`] : []
    return [`Não consegui fechar o levantamento de ${cabecalho(e)}.`, ...linhaDasEscolhas(e), 'Falta:', ...listadas, ...resto].join('\n')
}

/** A frase do levantamento que fechou: barras por código, aproveitamento, os dois totais e o tempo. */
export function fraseDoLevantamento(e: DadosDaEsquadria, r: Extract<ResultadoDoLevantamento, { ok: true }>, tempo: { minutos: number; origem: string | null } | null): string {
    const linhas = [`Levantamento de ${cabecalho(e)}.`, ...linhaDasEscolhas(e), '', 'Barras por código:']
    for (const c of r.por_codigo) {
        linhas.push(`• ${c.codigo} (${c.perfil}): ${c.n_barras} barra(s) de ${metros(c.comprimento_barra_mm)}`)
    }
    const t = r.total
    linhas.push('')
    linhas.push(t.aproveitamento_pct === null
        ? 'Aproveitamento do levantamento: não há peça para aproveitar.'
        : `Aproveitamento do levantamento: ${numeroBR(t.aproveitamento_pct, 1)}% (${numeroBR(t.metros_uteis, 2)} m úteis de ${numeroBR(t.metros_comprados, 2)} m comprados).`)
    const faltaDo = (total: 'total_por_barra_inteira' | 'total_por_consumo_real') =>
        r.falta_para_o_total.filter((f) => f.total === total).map((f) => `${f.codigo} (${f.perfil})`).join(', ')
    linhas.push(t.total_por_barra_inteira === null
        ? `Total por barra inteira: não sai — falta o valor da barra de ${faltaDo('total_por_barra_inteira')}.`
        : `Total por barra inteira: ${formatarReais(t.total_por_barra_inteira)}.`)
    linhas.push(t.total_por_consumo_real === null
        ? `Total por consumo real: não sai — falta o valor do metro de ${faltaDo('total_por_consumo_real')}.`
        : `Total por consumo real: ${formatarReais(t.total_por_consumo_real)}.`)
    linhas.push(tempo === null
        ? `Tempo de fabricação da tipologia: não está cadastrado para ${e.tipologia}.`
        : `Tempo de fabricação da tipologia: ${numeroBR(tempo.minutos, 0)} min${tempo.origem ? ` (${tempo.origem})` : ''}.`)
    if (r.avisos.length) {
        linhas.push('', 'Atenção:')
        for (const a of r.avisos) linhas.push(`• ${fraseDoAviso(a)}`)
    }
    return linhas.join('\n')
}

/** "Esquadria 1 (DP-02): " — numa conversa há uma esquadria só, e o vendedor sabe qual é. */
const semPrefixoDaEsquadria = (m: string) => m.replace(/^Esquadrias? [\d, e]+(?: \([^)]*\))?: /, '')
const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

// ── O levantamento ──────────────────────────────────────────────────────────────────────────
export type LevantamentoDaConversa = { texto: string; desfecho: 'levantou' | 'recusou' }

/**
 * A mensagem do levantamento de UMA esquadria. Lança só em erro de banco — quem chama loga e não
 * manda nada técnico ao vendedor. Toda falta de DADO volta como texto de recusa, nomeada.
 */
export async function mensagemDoLevantamento(
    tenantId: string,
    tabela: TabelaDaEmpresa,
    pre: { tipologia: unknown; largura_mm: unknown; altura_mm: unknown; quantidade: unknown; vidro: unknown; escolhas: unknown },
): Promise<LevantamentoDaConversa> {
    const e: DadosDaEsquadria = {
        tipologia: String(pre.tipologia), largura_mm: Number(pre.largura_mm), altura_mm: Number(pre.altura_mm), quantidade: Number(pre.quantidade),
        escolhas: null,
    }
    const escolhas = lerEscolhasGravadas(pre.escolhas)
    const recusa = (faltas: string[]): LevantamentoDaConversa => ({ texto: fraseDaRecusa(e, faltas), desfecho: 'recusou' })
    if ('frase' in tabela) return recusa([maiuscula(tabela.frase.replace(/^Ainda não consigo escolher a tipologia: /, ''))])

    const abas = ABAS_IMPORTADAS[tabela.tabelaId]?.[e.tipologia]
    if (!abas) return recusa([fraseDaTipologiaSemAbas(e.tipologia)])
    const lida = lerTipologia(abas, e.tipologia)
    if ('recusas' in lida) return recusa(lida.recusas.map((x) => x.mensagem))
    e.escolhas = descreverEscolhas(lida.tipologia, escolhas) ?? ''

    const serra = await lerSerra(tenantId)
    if ('frase' in serra) return recusa([maiuscula(serra.frase)])
    const regras = await lerRegras(tabela.tabelaId, e.tipologia)
    const itens = await lerItens(tabela.tabelaId, [...new Set(regras.map((r) => r.codigo))].sort())

    const r = levantarBarras({
        esquadrias: [{ tipologia: e.tipologia, L_mm: e.largura_mm, H_mm: e.altura_mm, quantidade: e.quantidade, escolhas, espessura_vidro_mm: espessuraDoVidro(pre.vidro) }],
        tipologias: { [e.tipologia]: lida.tipologia },
        regras,
        itens,
        serra_mm: serra.serra_mm,
    })
    if ('recusas' in r) return recusa(r.recusas.map((x) => maiuscula(semPrefixoDaEsquadria(x.mensagem))))
    const tempo = await tempoDeFabricacao(tabela.tabelaId, e.tipologia)
    return { texto: fraseDoLevantamento(e, r, tempo), desfecho: 'levantou' }
}
