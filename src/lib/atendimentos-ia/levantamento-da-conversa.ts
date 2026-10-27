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
 *   - AS ABAS DO MOTOR VÊM DO BANCO (desde a migração 20261025000004): Detalhe, Variáveis, Fórmulas,
 *     Perfis e Validações da tabela da empresa, gravadas pela importação pelo mesmo mapa
 *     (`atendimentos-ia-abas-do-motor.ts`). O JSON da DP-02 virou fixture de teste. A aba 'Fórmulas'
 *     DA TIPOLOGIA é a fonte de cálculo; as fórmulas da LINHA (a aba 'Fórmulas da família' do arquivo
 *     do fornecedor) só entram quando a tipologia não tem fórmula própria, e então a resposta DIZ isso
 *     (`fraseDasFormulasDaLinha`) — nunca em silêncio, porque as da linha divergem das da DP-02 em 9
 *     de 16 variáveis (medido, `avaliador-de-formulas.test.ts`). Tabela ainda ausente, tipologia sem
 *     abas, sem perfis, sem linha, ou linha sem fórmula: RECUSA NOMEADA.
 *     O VOCABULÁRIO (dono do produto, 26/10/2026): o que o motor chama de "família" é a LINHA
 *     (EUROPA 42, EUROPA 60). FAMÍLIA é a da tabela do fornecedor (PVC, ...).
 *
 * ══ AS TABELAS DA EMPRESA SÃO DERIVADAS (dono do produto, 26/10/2026) ══
 * São as tabelas dos fornecedores que a base de conhecimento da empresa vincula (`tabelas-da-conta.ts`);
 * `orcamentista_conta_tabela` não é lida. Quem decide se a tabela entra na conversa é o MOTOR, não a
 * categoria: COM tipologias entra; SEM é tabela de preço e fica fora, sem recusar. Por (fornecedor,
 * família), uma tabela só vale sem marca; com mais de uma vale a VIGENTE. As recusas nomeadas, nesta ordem:
 *   - fornecedor vinculado ao PERFIL sem tabela cadastrada (`fraseDoPerfilSemTabela`); fornecedor de outra
 *     categoria sem tabela NÃO recusa — é aviso no bloco Motor;
 *   - nenhum fornecedor com tabela (`FRASE_SEM_TABELA`);
 *   - par com motor e mais de uma tabela, nenhuma vigente (`fraseSemVigente`);
 *   - nenhuma tabela com motor (`fraseSemMotor`, nomeando os fornecedores das tabelas de preço).
 *
 * ══ A LISTA DE TIPOLOGIAS — de TODAS as tabelas com motor (dono do produto, 26/10/2026) ══
 * Cai a trava "a sua empresa tem 2 tabelas e ele trabalha com uma só": a conta pode ter mais de uma
 * tabela, inclusive da mesma família. A lista junta as tipologias de todas, cada uma com a tabela e o
 * fornecedor dela; o código em mais de uma vira a pergunta de qual fornecedor (`levantamento-em-montagem.ts`).
 * A desambiguação é por FORNECEDOR + FAMÍLIA: o mesmo fornecedor com PVC e alumínio é legítimo (a Wolff é
 * candidata); só fornecedor E família iguais não se distinguem para o vendedor, e aí é recusa nomeada.
 * UM LEVANTAMENTO PODE TER VÁRIAS FAMÍLIAS — "é PVC ou alumínio? Pode ter os dois, inclusive" (dono do
 * produto, 26/10/2026). Cada família é um produto: o cálculo e o agrupamento de barras rodam UMA VEZ POR
 * TABELA (fornecedor + família), e nenhuma barra atravessa de uma otimização para a outra.
 * Vem de `orcamentista_motor_tipologia_detalhe` (tabela_id, tipologia, descricao, tipo, …) das tabelas
 * que valem e têm motor. Se a leitura falhar, a conversa responde com a frase de
 * `SEM_LISTA_DE_TIPOLOGIAS`, sem chamar a LLM: sem lista, a IA não tem de onde escolher, e escolher por
 * conta própria é o que a regra proíbe.
 *
 * ══ AS REGRAS DO MOTOR, PAGINADAS ══
 * As regras são lidas POR TIPOLOGIA (`tipologias @> [DP]`), não por perfil na tabela inteira. Medido em
 * 25/10/2026: os 14 perfis da DP-02 têm 2.041 linhas na tabela inteira e 196 na DP-02, e o de-para
 * (perfil, cor, código) é o MESMO nos dois recortes — 103 trios. E a maior tipologia tem 1.157
 * linhas, acima das 1.000 que o PostgREST devolve por vez: a leitura pagina e confere a contagem
 * exata, em vez de calcular com uma lista cortada em silêncio (`instrumento-que-nao-enxerga.md`).
 *
 * ══ O TEMPO DE FABRICAÇÃO — DA TABELA PRÓPRIA ══
 * `tempoDeFabricacao` lê `orcamentista_motor_tipologia_tempo` (20261024000003), que a importação não
 * apaga (`tabela-que-a-importacao-apaga.md`). As colunas antigas de `orcamentista_motor_tipologia`
 * (`tempo_fabricacao_min`, `tempo_origem`) são OBSOLETAS e não são lidas por ninguém: a reimportação as
 * esvazia, e elas saem numa migração posterior. Sem a tabela no banco, a falta é nomeada.
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
import { COLUNAS_LIDAS, lerTipologia, variaveisDaAba, type AbasDoMotor, type AvisoDoAvaliador, type Tipologia } from '@/lib/atendimentos-ia/avaliador-de-formulas'
import { descreverArremate, escolhasComPadrao, lerEscolhasGravadas, traduzirVocabulario, type VariaveisDaTipologia } from '@/lib/atendimentos-ia/escolhas-da-tipologia'
import {
    formatarReais, levantarBarras,
    type ItemDaTabela, type RegraDoDePara, type ResultadoDoLevantamento,
} from '@/lib/atendimentos-ia/levantamento-de-barras'
import { maoDeObraPeloCaminhoDaTela, type DadosDaEmpresaParaMaoDeObra } from '@/utils/mao-de-obra-pelo-caminho-da-tela'
import { FAMILIA_NAO_INFORMADA, rotulosDasOpcoes, tabelaDaEsquadria, type TabelaDoCodigo, type TabelasDoCodigo } from '@/lib/atendimentos-ia/levantamento-em-montagem'
import { normalizarNome } from '@/lib/atendimentos-ia/nome-do-levantamento'
import { abaDeclarada, abaDoBanco } from '@/utils/atendimentos-ia-abas-do-motor'
import { FORNECEDOR_SEM_NOME, FalhaNaDerivacao, derivarTabelasDaConta } from '@/lib/atendimentos-ia/tabelas-da-conta'

// ── A tabela da empresa e as tipologias candidatas ──────────────────────────────────────────
export type CandidatoDeTipologia = { tipologia: string; descricao: string | null; tipo: string | null; tabelaId: string; fornecedor: string; familia: string | null }
/** Uma tabela ligada à conta, com o nome do fornecedor dela. */
export type TabelaLigada = TabelaDoCodigo
export type TabelaDaEmpresaLida = { ok: true; tabelas: TabelaLigada[]; candidatos: CandidatoDeTipologia[] }
export type TabelaDaEmpresa =
    | TabelaDaEmpresaLida
    | { ok: false; motivo: 'SEM_TABELA' | 'PERFIL_SEM_TABELA' | 'SEM_MOTOR' | 'SEM_VIGENTE' | 'TABELA_REPETIDA' | 'SEM_LISTA_DE_TIPOLOGIAS'; frase: string; detalhe: string }

export const FRASE_SEM_TABELA = 'Ainda não consigo escolher a tipologia: a base de conhecimento da sua empresa não vincula nenhum fornecedor com tabela cadastrada.'
export const fraseDoPerfilSemTabela = (fornecedor: string) =>
    `Ainda não consigo escolher a tipologia: o fornecedor ${fornecedor}, vinculado ao perfil na base de conhecimento da sua empresa, não tem tabela cadastrada.`
const juntarNomes = (nomes: string[]) => (nomes.length <= 1 ? nomes.join('') : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`)
export const fraseSemMotor = (fornecedores: string[]) =>
    'Ainda não consigo escolher a tipologia: nenhuma tabela dos fornecedores da sua empresa tem o motor (as tipologias) carregado. '
    + `As de ${juntarNomes(fornecedores)} são só tabelas de preço.`
export const fraseSemVigente = (fornecedor: string, familia: string | null, n: number) =>
    `Ainda não consigo escolher a tipologia: o fornecedor ${fornecedor} tem ${n} tabelas ${familia === null ? 'sem a família informada' : `da família ${familia}`} `
    + 'e nenhuma está marcada como vigente: não escolho entre elas.'
export const fraseDeTabelaRepetida = (fornecedor: string, familia: string | null, n: number) =>
    `Ainda não consigo escolher a tipologia: a sua empresa tem ${n} tabelas do fornecedor ${fornecedor}, ${familia === null ? 'sem a família informada' : `da família ${familia}`}, `
    + 'ligadas ao orçamentista, e nada as distingue: não escolho entre elas.'
export const FRASE_SEM_LISTA_DE_TIPOLOGIAS = 'Ainda não consigo escolher a tipologia: a lista de tipologias do fornecedor, com a descrição de cada uma, ainda não foi carregada.'
export const fraseSemListaDoFornecedor = (fornecedor: string) =>
    `Ainda não consigo escolher a tipologia: a lista de tipologias do fornecedor ${fornecedor}, com a descrição de cada uma, ainda não foi carregada.`
const porCodigoEFornecedor = (a: CandidatoDeTipologia, b: CandidatoDeTipologia) =>
    (a.tipologia < b.tipologia ? -1 : a.tipologia > b.tipologia ? 1
        : a.fornecedor.localeCompare(b.fornecedor, 'pt-BR') || (a.familia ?? '').localeCompare(b.familia ?? '', 'pt-BR'))

export async function lerTabelaDaEmpresa(tenantId: string): Promise<TabelaDaEmpresa> {
    let derivacao: Awaited<ReturnType<typeof derivarTabelasDaConta>>
    try {
        derivacao = await derivarTabelasDaConta(tenantId)
    } catch (e) {
        // a contagem das tipologias falhou: é a lista que não se lê, e é isso que a frase diz
        if (e instanceof FalhaNaDerivacao && e.onde === 'orcamentista_motor_tipologia_detalhe') {
            return { ok: false, motivo: 'SEM_LISTA_DE_TIPOLOGIAS', frase: FRASE_SEM_LISTA_DE_TIPOLOGIAS, detalhe: `codigo=${e.codigo ?? '-'}` }
        }
        throw e
    }
    const perfilSemTabela = derivacao.fornecedoresSemTabela.find((f) => f.categorias.includes('PERFIL'))
    if (perfilSemTabela) return { ok: false, motivo: 'PERFIL_SEM_TABELA', frase: fraseDoPerfilSemTabela(perfilSemTabela.fornecedor), detalhe: '' }
    if (derivacao.tabelas.length === 0) return { ok: false, motivo: 'SEM_TABELA', frase: FRASE_SEM_TABELA, detalhe: '' }
    // o par sem vigente só recusa quando alguma tabela dele tem motor: tabela de preço não entra na conversa
    // (a chave do grupo ganhou a categoria em 27/10/2026: o grupo sem vigente é o mesmo fornecedor, família E categoria)
    const semVigente = derivacao.paresSemVigente.find((p) => derivacao.tabelas.some((t) => t.fornecedor === p.fornecedor && t.familia === p.familia && t.categoria === p.categoria && t.comMotor))
    if (semVigente) return { ok: false, motivo: 'SEM_VIGENTE', frase: fraseSemVigente(semVigente.fornecedor, semVigente.familia, semVigente.arquivos.length), detalhe: '' }
    const tabelas: TabelaLigada[] = derivacao.tabelas
        .filter((t) => t.vale && t.comMotor)
        .map((t) => ({ tabelaId: t.tabelaId, fornecedor: t.fornecedor, familia: t.familia }))
        .sort((a, b) => a.fornecedor.localeCompare(b.fornecedor, 'pt-BR') || (a.familia ?? '').localeCompare(b.familia ?? '', 'pt-BR') || (a.tabelaId < b.tabelaId ? -1 : 1))
    if (tabelas.length === 0) {
        const dePreco = [...new Set(derivacao.tabelas.map((t) => t.fornecedor))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
        return { ok: false, motivo: 'SEM_MOTOR', frase: fraseSemMotor(dePreco), detalhe: `tabelas=${derivacao.tabelas.length}` }
    }
    // FORNECEDOR + FAMÍLIA iguais (o nome sem caixa e sem acento; a família sem informar também conta como uma):
    // nada distingue as duas para o vendedor. O mesmo fornecedor com famílias diferentes é legítimo.
    // A categoria NÃO entra aqui, de propósito (27/10/2026): a tabela de antes (sem categoria) e a nova de Perfil, ambas com motor, valem
    // cada uma no seu grupo, e deixá-las entrar juntas duplicaria as tipologias. Até o PR D trocar os leitores, é recusa nomeada.
    for (const t of tabelas) {
        const mesmas = tabelas.filter((o) => normalizarNome(o.fornecedor) === normalizarNome(t.fornecedor) && o.familia === t.familia)
        if (mesmas.length > 1) return { ok: false, motivo: 'TABELA_REPETIDA', frase: fraseDeTabelaRepetida(t.fornecedor, t.familia, mesmas.length), detalhe: `tabelas=${tabelas.length}` }
    }

    const candidatos: CandidatoDeTipologia[] = []
    for (const t of tabelas) {
        const { data, error: erroDaLista } = await supabaseAdmin
            .from('orcamentista_motor_tipologia_detalhe').select('tipologia, descricao, tipo').eq('tabela_id', t.tabelaId)
        // a tabela ainda não existe em produção: a leitura falha, e é isso que a frase diz
        if (erroDaLista) return { ok: false, motivo: 'SEM_LISTA_DE_TIPOLOGIAS', frase: FRASE_SEM_LISTA_DE_TIPOLOGIAS, detalhe: `codigo=${erroDaLista.code ?? '-'}` }
        const daTabela = ((data ?? []) as Array<{ tipologia: unknown; descricao: string | null; tipo: string | null }>)
            .filter((c): c is { tipologia: string; descricao: string | null; tipo: string | null } => typeof c.tipologia === 'string' && c.tipologia !== '')
        // uma tabela ligada sem lista não segue em silêncio: a outra sozinha esconderia as tipologias dela
        if (daTabela.length === 0) {
            const frase = tabelas.length === 1 ? FRASE_SEM_LISTA_DE_TIPOLOGIAS : fraseSemListaDoFornecedor(t.fornecedor)
            return { ok: false, motivo: 'SEM_LISTA_DE_TIPOLOGIAS', frase, detalhe: 'linhas=0' }
        }
        candidatos.push(...daTabela.map((c) => ({ tipologia: c.tipologia, descricao: c.descricao, tipo: c.tipo, tabelaId: t.tabelaId, fornecedor: t.fornecedor, familia: t.familia })))
    }
    return { ok: true, tabelas, candidatos: candidatos.sort(porCodigoEFornecedor) }
}

/** As tabelas da conta que têm o código, na ordem do fornecedor. */
export const tabelasDoCodigo = (t: TabelaDaEmpresaLida): TabelasDoCodigo => (codigo: string) =>
    t.candidatos.filter((c) => c.tipologia === codigo).map((c) => ({ tabelaId: c.tabelaId, fornecedor: c.fornecedor, familia: c.familia }))

/**
 * A linha do candidato no prompt: código, descrição inteira e tipo — e o fornecedor e a família quando a
 * conta tem mais de uma tabela (com uma só, a linha é a de sempre). Ausente não vira texto inventado.
 */
export const linhaDoCandidato = (c: CandidatoDeTipologia, comFornecedor: boolean) =>
    `${c.tipologia} | ${c.descricao ?? '(sem descrição no arquivo)'} | ${c.tipo ?? '(sem tipo no arquivo)'}`
    + (comFornecedor ? ` | fornecedor: ${c.fornecedor} | família: ${c.familia ?? FAMILIA_NAO_INFORMADA}` : '')

/** A tabela ainda não existe no banco (migração não aplicada): é falta nomeada, não erro. */
const tabelaAusente = (e: { code?: string }) => e.code === 'PGRST205' || e.code === '42P01'

// ── O tempo de fabricação ────────────────────────────────────────────────────────────────
export const FALTA_TABELA_DOS_TEMPOS = 'a tabela dos tempos de fabricação ainda não foi carregada no banco'
/**
 * O tempo da tipologia, de `orcamentista_motor_tipologia_tempo`. Sem linha é null — "não informado",
 * nunca zero (a linha só existe quando há tempo). Com a tabela ainda ausente no banco, `{ ausente: true }`:
 * é outra falta, e quem a exibe diz qual.
 */
export async function tempoDeFabricacao(tabelaId: string, tipologia: string): Promise<{ minutos: number; origem: string | null } | { ausente: true } | null> {
    const { data, error } = await supabaseAdmin
        .from('orcamentista_motor_tipologia_tempo').select('tempo_fabricacao_min, tempo_origem')
        .eq('tabela_id', tabelaId).eq('tipologia', tipologia).maybeSingle()
    if (error) {
        if (tabelaAusente(error)) return { ausente: true }
        throw new Error(`orcamentista_motor_tipologia_tempo: ${error.message}`)
    }
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
    if ('ausente' in tempo) return { ok: false, falta: FALTA_TABELA_DOS_TEMPOS }

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

// ── As abas do motor por tipologia, do banco ────────────────────────────────────────────────
type Leitura = { linhas: Array<Record<string, unknown>> } | { ausente: true }

/**
 * A ORDEM que pagina cada leitura: tem de ser TOTAL (sem empate), senão uma linha cai entre duas
 * páginas, e tem de usar colunas que a tabela TEM. As abas por tipologia ordenam por
 * (tipologia, ordem): é única em todas elas — a Detalhe tem chave (tabela_id, tipologia) e NÃO tem
 * `id` (medido em 26/10/2026; ordenar por `id` derrubou todo levantamento em produção às 14:07).
 */
const ORDEM_DAS_ABAS = ['tipologia', 'ordem'] as const
const ORDEM_POR_ID = ['id'] as const

/** TODAS as linhas da tabela_id (e, se pedido, só dos valores de uma coluna), página a página, com a contagem conferida. */
async function lerTudo(tabela: string, tabelaId: string, ordem: readonly string[], recorte?: { coluna: string; valores: readonly string[] }): Promise<Leitura> {
    const linhas: Array<Record<string, unknown>> = []
    let total: number | null = null
    for (let de = 0; total === null || de < total; de += PAGINA) {
        let q = supabaseAdmin.from(tabela).select('*', { count: 'exact' }).eq('tabela_id', tabelaId)
        if (recorte) q = q.in(recorte.coluna, [...recorte.valores])
        for (const c of ordem) q = q.order(c, { ascending: true })
        const { data, error, count } = await q.range(de, de + PAGINA - 1)
        if (error) {
            if (tabelaAusente(error)) return { ausente: true }
            throw new Error(`${tabela}: ${error.message}`)
        }
        if (typeof count !== 'number') throw new Error(`${tabela}: a contagem exata não veio`)
        total = count
        const pagina = (data ?? []) as Array<Record<string, unknown>>
        linhas.push(...pagina)
        if (pagina.length === 0) break
    }
    if (linhas.length !== total) throw new Error(`${tabela}: ${linhas.length} linhas lidas de ${total}`)
    return { linhas }
}

export const fraseDaAbaNaoCarregada = (aba: string) =>
    `A aba "${aba}" do motor ainda não foi carregada no banco: ainda não consigo calcular as barras.`
export const fraseDaTipologiaSemPerfis = (tipologia: string) =>
    `A tipologia ${tipologia} não tem linhas na aba "Perfis" do motor importado: sem perfil não há barra a calcular.`
/** O RÓTULO do fallback: vai na resposta toda vez que as fórmulas da linha calcularam no lugar das da tipologia. */
export const fraseDasFormulasDaLinha = (tipologia: string, linha: string) =>
    `Atenção: as fórmulas da ${tipologia} são as da LINHA ${linha} (fallback) — a tipologia não tem fórmulas próprias na aba "Fórmulas" do arquivo do fornecedor.`
export const fraseDaTipologiaSemLinha = (tipologia: string) =>
    `A tipologia ${tipologia} não tem fórmulas próprias na aba "Fórmulas", e não tem a linha cadastrada no motor para achar as fórmulas da linha: não calculo sem elas.`
export const fraseDaTipologiaComDuasLinhas = (tipologia: string, linhas: readonly string[]) =>
    `A tipologia ${tipologia} não tem fórmulas próprias na aba "Fórmulas", e tem ${linhas.length} linhas no motor (${linhas.join(', ')}): não escolho a linha.`
export const fraseDaLinhaSemFormulas = (tipologia: string, linha: string) =>
    `A tipologia ${tipologia} não tem fórmulas próprias na aba "Fórmulas", e a linha ${linha} também não tem fórmulas no motor importado: não calculo sem elas.`
export const fraseDaLinhaComVariavelRepetida = (linha: string, variavel: string) =>
    `A linha ${linha} tem a variável ${variavel} mais de uma vez na aba "Fórmulas da família" do motor: não escolho uma.`

/**
 * As fórmulas da LINHA da tipologia, como linhas da aba 'Fórmulas' — o fallback. A linha é a
 * `linha` da tipologia em `orcamentista_motor_tipologia`, comparada EXATA com a de
 * `orcamentista_motor_formula_familia` (nome vencido: é a linha; as duas já normalizadas pela
 * importação). Sem linha, com duas, sem fórmula, ou com variável repetida: recusa.
 */
async function formulasDaLinha(tabelaId: string, tipologia: string): Promise<{ linhas: Array<Record<string, unknown>>; linha: string } | { falta: string }> {
    const { data, error } = await supabaseAdmin.from('orcamentista_motor_tipologia').select('linha').eq('tabela_id', tabelaId).eq('tipologia', tipologia)
    if (error) throw new Error(`orcamentista_motor_tipologia: ${error.message}`)
    const linhas = [...new Set(((data ?? []) as Array<{ linha: unknown }>).map((l) => l.linha).filter((l): l is string => typeof l === 'string' && l !== ''))]
    if (linhas.length === 0) return { falta: fraseDaTipologiaSemLinha(tipologia) }
    if (linhas.length > 1) return { falta: fraseDaTipologiaComDuasLinhas(tipologia, linhas) }
    const linha = linhas[0]
    const lida = await lerTudo('orcamentista_motor_formula_familia', tabelaId, ORDEM_POR_ID, { coluna: 'linha', valores: [linha] })
    if ('ausente' in lida) return { falta: fraseDaAbaNaoCarregada('Fórmulas da família') }
    if (lida.linhas.length === 0) return { falta: fraseDaLinhaSemFormulas(tipologia, linha) }
    const vistas = new Set<unknown>()
    for (const f of lida.linhas) {
        if (vistas.has(f.variavel)) return { falta: fraseDaLinhaComVariavelRepetida(linha, String(f.variavel)) }
        vistas.add(f.variavel)
    }
    return { linha, linhas: lida.linhas.map((f) => ({ tipologia, variavel: f.variavel, descricao: f.descricao, formula: f.formula })) }
}

export type TipologiasDoBanco = { lidas: Record<string, Tipologia>; faltas: string[]; rotulos: string[] }

/**
 * As tipologias pedidas, com as abas que o avaliador lê (Detalhe, Variáveis, Fórmulas, Perfis,
 * Validações) vindas do BANCO, da tabela da empresa — gravadas pela importação, pelo mesmo mapa
 * (`ABAS_DO_MOTOR`). A aba 'Fórmulas' da tipologia é a fonte; sem ela, as da linha entram e o RÓTULO
 * sai em `rotulos`, que quem monta a resposta acrescenta ao texto — nunca em silêncio.
 */
export async function lerTipologiasDoBanco(tabelaId: string, codigos: readonly string[]): Promise<TipologiasDoBanco> {
    const faltas: string[] = []
    const rotulos: string[] = []
    const porAba: Record<string, Array<Record<string, unknown>>> = {}
    for (const nome of Object.keys(COLUNAS_LIDAS)) {
        const aba = abaDeclarada(nome)
        const lida = await lerTudo(aba.tabela, tabelaId, ORDEM_DAS_ABAS, { coluna: 'tipologia', valores: codigos })
        if ('ausente' in lida) faltas.push(fraseDaAbaNaoCarregada(nome))
        else porAba[nome] = lida.linhas
    }
    if (faltas.length) return { lidas: {}, faltas, rotulos }

    const lidas: Record<string, Tipologia> = {}
    for (const t of codigos) {
        const tem = (nome: string) => porAba[nome].some((l) => l.tipologia === t)
        if (!tem('Variáveis') && !tem('Fórmulas') && !tem('Perfis')) { faltas.push(fraseDaTipologiaSemAbas(t)); continue }
        let formulas = porAba['Fórmulas']
        if (!tem('Fórmulas')) {
            const daLinha = await formulasDaLinha(tabelaId, t)
            if ('falta' in daLinha) { faltas.push(daLinha.falta); continue }
            formulas = daLinha.linhas
            rotulos.push(fraseDasFormulasDaLinha(t, daLinha.linha))
        }
        if (!tem('Perfis')) { faltas.push(fraseDaTipologiaSemPerfis(t)); continue }
        const abas: AbasDoMotor = Object.fromEntries(Object.keys(COLUNAS_LIDAS).map((nome) =>
            [nome, abaDoBanco(abaDeclarada(nome), nome === 'Fórmulas' ? formulas : porAba[nome])]))
        const lida = lerTipologia(abas, t)
        if ('recusas' in lida) faltas.push(...lida.recusas.map((x) => x.mensagem))
        else lidas[t] = lida.tipologia
    }
    return { lidas, faltas, rotulos }
}

/**
 * As Variáveis de TODAS as tipologias da tabela, para a conversa perguntar as escolhas. Com a tabela
 * ainda ausente no banco, nenhuma definição: a conversa segue sem escolhas, e o levantamento recusa
 * nomeando a aba que falta.
 */
export async function lerVariaveisDasTipologias(tabelaId: string): Promise<Record<string, VariaveisDaTipologia>> {
    const aba = abaDeclarada('Variáveis')
    const lida = await lerTudo(aba.tabela, tabelaId, ORDEM_DAS_ABAS)
    if ('ausente' in lida) return {}
    const planilha = abaDoBanco(aba, lida.linhas)
    const codigos = [...new Set(lida.linhas.map((l) => l.tipologia).filter((t): t is string => typeof t === 'string'))]
    return Object.fromEntries(codigos.map((t) => [t, { variaveis: variaveisDaAba(planilha, t) }]))
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
/** `numero` é o da esquadria NO LEVANTAMENTO: num bloco de família, a esquadria 3 continua a 3. */
export type DadosDaEsquadria = { numero: number; tipologia: string; largura_mm: number; altura_mm: number; quantidade: number; escolhas: string | null }
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
const linhasDasEsquadrias = (d: DadosDoLevantamento) => d.esquadrias.flatMap((e) => linhasDaEsquadria(e, e.numero))

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
export function fraseDoLevantamento(
    d: DadosDoLevantamento, r: Extract<ResultadoDoLevantamento, { ok: true }>, maos: MaoDeObra[],
    /** O bloco de UMA família num levantamento com várias: o título dela, sem o "o que cobre" (vai uma vez, no fim), e a esquadria sempre numerada. */
    bloco: { titulo: string; cobertura: false; numerar: true } | null = null,
): string {
    const numerar = bloco !== null || d.esquadrias.length > 1
    const linhas = [`${bloco ? bloco.titulo : maiuscula(cabecalho(d))}.`, ...linhasDasEsquadrias(d), '', 'Barras por código:']
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
        maos.forEach((m, i) => linhas.push(linhaDaMaoDeObra(`Mão de obra da esquadria ${d.esquadrias[i]?.numero ?? i + 1}`, m)))
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
    if (!bloco) linhas.push('', O_QUE_O_PRECO_COBRE)
    if (r.avisos.length) {
        linhas.push('', 'Atenção:')
        for (const a of r.avisos) {
            const k = (a as { esquadria?: unknown }).esquadria
            linhas.push(`• ${numerar && typeof k === 'number' ? `Esquadria ${d.esquadrias[k - 1]?.numero ?? k}: ` : ''}${fraseDoAviso(a)}`)
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
export type EsquadriaGravada = { ordem?: unknown; tipologia: unknown; largura_mm: unknown; altura_mm: unknown; quantidade: unknown; cor_perfil: unknown; vidro: unknown; escolhas: unknown; tabela_id: unknown }

export const fraseDaTipologiaSemFornecedor = (n: number, tipologia: string, fornecedores: readonly string[]) =>
    `A esquadria ${n} (${tipologia}) está nas tabelas de mais de um fornecedor (${fornecedores.join(', ')}), e falta dizer de qual.`
export const fraseDaTipologiaSemTabela = (n: number, tipologia: string) =>
    `A esquadria ${n} (${tipologia}) não está na lista de tipologias de nenhuma tabela ligada à empresa.`

/**
 * A mensagem do levantamento, com TODAS as esquadrias dele. Lança só em erro de banco — quem chama
 * loga e não manda nada técnico ao vendedor. Toda falta de DADO volta como texto de recusa, nomeada,
 * e as faltas de todas as esquadrias saem de uma vez.
 *
 * UMA RELAÇÃO POR FAMÍLIA (dono do produto, 26/10/2026): o levantamento pode ter várias famílias, e cada
 * uma é um produto. As esquadrias se agrupam pela TABELA delas (fornecedor + família), e cada grupo tem o
 * seu cálculo e a sua otimização de barras, com a tabela do seu fornecedor: nenhuma barra atravessa de um
 * grupo para o outro. Com uma família só, a mensagem é a de sempre.
 *
 * Dentro de uma família, as esquadrias são calculadas com UMA cor — `levantarBarras` recebe uma —; cores
 * diferentes na mesma família são recusa nomeada, com a cor de cada uma. Nunca se escolhe uma.
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
        esquadrias: lev.itens.map((e, i) => ({
            numero: i + 1, tipologia: String(e.tipologia), largura_mm: Number(e.largura_mm), altura_mm: Number(e.altura_mm), quantidade: Number(e.quantidade), escolhas: null as string | null,
        })),
    }
    const recusa = (faltas: string[]): LevantamentoDaConversa => ({ texto: fraseDaRecusa(d, faltas), desfecho: 'recusou' })
    if ('frase' in tabela) return recusa([maiuscula(tabela.frase.replace(/^Ainda não consigo escolher a tipologia: /, ''))])

    const faltas: string[] = []
    lev.itens.forEach((e, i) => { if (corDe(e) === null) faltas.push(`A esquadria ${i + 1} está sem a cor do perfil.`) })

    // a tabela de cada esquadria (várias tabelas, 26/10/2026): sem tabela, ou com o código em mais de uma
    // sem a dita, é recusa nomeada
    const doCodigo = tabelasDoCodigo(tabela)
    const tabelaDe = lev.itens.map((e) => tabelaDaEsquadria(
        { tipologia: typeof e.tipologia === 'string' ? e.tipologia : null, tabela_id: typeof e.tabela_id === 'string' ? e.tabela_id : null }, doCodigo))
    tabelaDe.forEach((t, i) => {
        if (t === null) faltas.push(fraseDaTipologiaSemTabela(i + 1, d.esquadrias[i].tipologia))
        else if ('opcoes' in t) faltas.push(fraseDaTipologiaSemFornecedor(i + 1, d.esquadrias[i].tipologia, rotulosDasOpcoes(t.opcoes)))
    })
    if (faltas.length) return recusa(faltas)

    // os grupos: uma família (tabela) por grupo, na ordem da primeira esquadria de cada um
    const grupos: Array<{ tabela: TabelaLigada; indices: number[] }> = []
    tabelaDe.forEach((t, i) => {
        const id = t && 'tabelaId' in t ? t.tabelaId : ''
        const grupo = grupos.find((g) => g.tabela.tabelaId === id)
        if (grupo) grupo.indices.push(i)
        else grupos.push({ tabela: tabela.tabelas.find((x) => x.tabelaId === id) ?? { tabelaId: id, fornecedor: FORNECEDOR_SEM_NOME, familia: null }, indices: [i] })
    })
    const varias = grupos.length > 1
    const calculos: CalculoDaFamilia[] = []
    for (const g of grupos) calculos.push(await calcularFamilia(tenantId, g.tabela.tabelaId, lev, d, g.indices))
    const rotulos = calculos.flatMap((c) => c.rotulos)
    // o rótulo do fallback vai em TODA resposta, a que fecha e a que recusa
    const rotulado = (r: LevantamentoDaConversa): LevantamentoDaConversa => (rotulos.length ? { ...r, texto: `${r.texto}\n\n${rotulos.join('\n')}` } : r)
    const nomeDaFamilia = (t: TabelaLigada) => `Família ${t.familia ?? 'não informada'} — ${t.fornecedor}`
    const recusadas = calculos.flatMap((c, k) => ('faltas' in c ? c.faltas.map((x) => (varias ? `${nomeDaFamilia(grupos[k].tabela)}: ${x}` : x)) : []))
    if (recusadas.length) return rotulado(recusa(recusadas))

    const fechados = calculos as Array<Extract<CalculoDaFamilia, { r: unknown }>>
    if (!varias) return rotulado({ texto: fraseDoLevantamento(fechados[0].d, fechados[0].r, fechados[0].maos), desfecho: 'levantou' })
    const blocos = fechados.map((c, k) => fraseDoLevantamento(c.d, c.r, c.maos, { titulo: `${nomeDaFamilia(grupos[k].tabela)}, perfil ${c.d.cor}`, cobertura: false, numerar: true }))
    const texto = [
        `Levantamento “${lev.nome}”: ${grupos.length} famílias, cada uma calculada com a tabela do seu fornecedor — as barras de uma não entram na otimização da outra.`,
        '', blocos.join('\n\n'), '', O_QUE_O_PRECO_COBRE,
    ].join('\n')
    return rotulado({ texto, desfecho: 'levantou' })
}

type CalculoDaFamilia =
    | { d: DadosDoLevantamento; r: Extract<ResultadoDoLevantamento, { ok: true }>; maos: MaoDeObra[]; rotulos: string[] }
    | { faltas: string[]; rotulos: string[] }

/** "Esquadria 1" do grupo vira o número dela no levantamento ("Esquadria 3"). */
const renumerar = (m: string, numeros: readonly number[]) =>
    m.replace(/^(Esquadrias? )([\d, e]+)/, (_t, p: string, lista: string) => p + lista.replace(/\d+/g, (n) => String(numeros[Number(n) - 1] ?? n)))

/**
 * O cálculo de UMA família: as esquadrias dela, com a tabela do fornecedor dela — as abas, as regras, os
 * itens de preço, a otimização de barras e a mão de obra. `d` é o levantamento inteiro: as esquadrias do
 * grupo são as MESMAS de `d` (a descrição do arremate escrita aqui aparece também na recusa).
 */
async function calcularFamilia(tenantId: string, tabelaId: string, lev: { nome: string; itens: EsquadriaGravada[] }, d: DadosDoLevantamento, indices: number[]): Promise<CalculoDaFamilia> {
    const itensDoGrupo = indices.map((i) => lev.itens[i])
    const corDe = (e: EsquadriaGravada) => (typeof e.cor_perfil === 'string' && e.cor_perfil !== '' ? e.cor_perfil : null)
    const cores = [...new Set(itensDoGrupo.map(corDe).filter((c): c is string => c !== null))]
    const dg: DadosDoLevantamento = { nome: d.nome, cor: cores.length === 1 ? cores[0] : '(cores diferentes)', esquadrias: indices.map((i) => d.esquadrias[i]) }
    const faltas: string[] = []
    if (cores.length > 1) {
        const porEsquadria = dg.esquadrias.map((e, k) => `esquadria ${e.numero}: ${corDe(itensDoGrupo[k])}`).join('; ')
        faltas.push(`As esquadrias têm cores diferentes (${porEsquadria}): ainda não calculo um levantamento com cores misturadas.`)
    }

    // as abas de cada tipologia, uma vez por tipologia; as escolhas descritas, uma vez por esquadria
    const doBanco = await lerTipologiasDoBanco(tabelaId, [...new Set(dg.esquadrias.map((e) => e.tipologia))])
    const lidas = doBanco.lidas
    const rotulos = doBanco.rotulos
    faltas.push(...doBanco.faltas)
    const escolhas = itensDoGrupo.map((e) => lerEscolhasGravadas(e.escolhas))
    dg.esquadrias.forEach((e, k) => { if (lidas[e.tipologia]) e.escolhas = descreverArremate(lidas[e.tipologia], escolhas[k]) })
    if (faltas.length) return { faltas, rotulos }

    const serra = await lerSerra(tenantId)
    if ('frase' in serra) return { faltas: [maiuscula(serra.frase)], rotulos }
    // a mesma linha do motor pode servir a duas tipologias: o de-para entra uma vez só
    const porTrio = new Map<string, RegraDoDePara>()
    for (const t of Object.keys(lidas)) {
        for (const g of await lerRegras(tabelaId, t)) porTrio.set(JSON.stringify([g.codigo, g.codigo_wvetro, g.cor]), g)
    }
    const regras = [...porTrio.values()]
    const itens = await lerItens(tabelaId, [...new Set(regras.map((r) => r.codigo))].sort())
    // as cores da empresa: o que é COR na coluna `cor` do motor, para a guarda da variante única
    const coresDaEmpresa = await lerCoresDaEmpresa(tenantId)

    const r = levantarBarras({
        cor: cores[0],
        coresDaEmpresa,
        // o padrão do arremate entra AQUI, pelo ponto único (`padraoDoArremate`), e não pelo avaliador
        esquadrias: dg.esquadrias.map((e, k) => ({
            tipologia: e.tipologia, L_mm: e.largura_mm, H_mm: e.altura_mm, quantidade: e.quantidade,
            escolhas: lidas[e.tipologia] ? escolhasComPadrao(lidas[e.tipologia], escolhas[k]) : escolhas[k], espessura_vidro_mm: espessuraDoVidro(itensDoGrupo[k].vidro),
        })),
        tipologias: lidas,
        regras,
        itens,
        serra_mm: serra.serra_mm,
    })
    if ('recusas' in r) {
        // R4: a recusa nomeia o que falta, em português — sem o código interno da variável; a esquadria pelo
        // número dela no levantamento, e sem prefixo quando o levantamento tem uma só
        const traduzir = (m: string) => Object.values(lidas).reduce((t, tip) => traduzirVocabulario(t, tip), m)
        const numeros = dg.esquadrias.map((e) => e.numero)
        const comNumero = (m: string) => (d.esquadrias.length === 1 ? semPrefixoDaEsquadria(m)
            : dg.esquadrias.length === 1 ? `Esquadria ${numeros[0]}: ${semPrefixoDaEsquadria(m)}` : renumerar(m, numeros))
        return { faltas: r.recusas.map((x) => maiuscula(traduzir(comNumero(x.mensagem)))), rotulos }
    }
    const maos: MaoDeObra[] = []
    for (const e of dg.esquadrias) maos.push(await lerMaoDeObra(tenantId, tabelaId, e.tipologia, e.quantidade))
    return { d: dg, r, maos, rotulos }
}
