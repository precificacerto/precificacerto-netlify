/**
 * Atendimentos I.A. — o LEVANTAMENTO NA CONVERSA: a tabela em uso da empresa, as tipologias que a IA
 * pode escolher, e a mensagem do levantamento de barras que o vendedor recebe no WhatsApp quando a
 * pré-definição fecha. Quem chama é `conversa-da-ia.ts`.
 *
 * ══ PRIMEIRA VERSÃO, PARA VER RODANDO (dono do produto, 25/10/2026) ══
 *   - A COR É A DA PRÉ-DEFINIÇÃO (`cor_perfil`), desde a rodada do preço na conversa. A conversa só a
 *     aceita da lista `cores` da base de conhecimento (Perfil), EXATA (`lerCoresDaEmpresa`), e aqui
 *     ela é comparada com a coluna `cor` do motor SEM CAIXA, e só sem caixa (08/11/2026,
 *     `levantamento-de-barras.ts`): cor que o motor não tem para um perfil é recusa nomeada, com o
 *     perfil, a cor e as variantes que existem;
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
 * ══ O MOTOR VEM DA FAMÍLIA; A TABELA É SÓ PREÇO (PR D, dono do produto, 02/11/2026) ══
 * A família é a da base de conhecimento da conta (`orcamentista_materia_prima.familia`); o motor é o das etapas dela
 * (`motor-da-familia.ts`), PELA AÇÃO (dono do produto, 04/11/2026): a etapa com GERAR_LEVANTAMENTO dá a lista de tipologias e as
 * Variáveis, a etapa com CALCULAR_BARRAS dá as abas, as regras, as fórmulas da linha e o tempo — onde quer que estejam na ordem.
 * A família SEM etapa de cálculo só levanta: a mensagem final traz as esquadrias como gravadas, sem barras, mão de obra nem preço
 * (`fraseDoLevantamentoSemCalculo`). TODA leitura do motor é por `motor_id`; nenhuma volta a ler o motor por `tabela_id`. O PREÇO é o das tabelas que
 * valem da família — as dos fornecedores que a base de conhecimento vincula, com a família da conta ou sem família ("qualquer
 * linha"), de todas as categorias —, lido por `tabela_id`, no escopo do fornecedor e da família do motor (`lerItensNoEscopo`). Falta de configuração é erro que nomeia a falta, nunca
 * fallback. O que vem abaixo, sobre a tabela "com motor", é a história de antes do PR D: o critério de qual tabela VALE (a única
 * do grupo, ou a vigente) continua; o resto passou para a família.
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
 * Vinha de `orcamentista_motor_tipologia_detalhe` (por tabela_id; desde o PR D, por motor_id) das tabelas
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
import { descricaoNoPrompt, limitesNoPrompt, numeroOuNulo } from '@/lib/atendimentos-ia/tipologias-candidatas'
import { supabaseAdmin } from '@/supabase/admin'
import { COLUNAS_LIDAS, lerTipologia, variaveisDaAba, type AbasDoMotor, type AvisoDoAvaliador, type Tipologia } from '@/lib/atendimentos-ia/avaliador-de-formulas'
import { descreverArremate, escolhasComPadrao, lerEscolhasGravadas, traduzirVocabulario, type VariaveisDaTipologia } from '@/lib/atendimentos-ia/escolhas-da-tipologia'
import {
    formatarReais, levantarBarras,
    type ItemDaTabela, type RegraDoDePara, type ResultadoDoLevantamento,
    type RecusaDoLevantamento,
} from '@/lib/atendimentos-ia/levantamento-de-barras'
import { maoDeObraPeloCaminhoDaTela, type DadosDaEmpresaParaMaoDeObra } from '@/utils/mao-de-obra-pelo-caminho-da-tela'
import { familiaDaEsquadria, rotulosDasOpcoes, type FamiliaDoCodigo, type FamiliasDoCodigo } from '@/lib/atendimentos-ia/levantamento-em-montagem'
import { abaDeclarada, abaDoBanco } from '@/utils/atendimentos-ia-abas-do-motor'
import { derivarTabelasDaConta } from '@/lib/atendimentos-ia/tabelas-da-conta'
import { FRASE_SEM_LISTA_DE_TIPOLOGIAS, SECAO_DOS_FORNECEDORES, fraseDeFalta, lerMotoresDaConta, type FonteDaFamilia, type MotivoDaFalta } from '@/lib/atendimentos-ia/motor-da-familia'
export { FRASE_SEM_LISTA_DE_TIPOLOGIAS }
import { normalizarNome } from '@/lib/atendimentos-ia/nome-do-levantamento'
import { lerVidro, vidroComEspessura } from '@/lib/atendimentos-ia/vidro'
import { tabelaNoEscopo } from '@/lib/atendimentos-ia/resolucao-de-referencia'

// ── As famílias da empresa e as tipologias candidatas ───────────────────────────────────────
/** Uma tipologia que a IA pode escolher: do motor do LEVANTAMENTO (a etapa com GERAR_LEVANTAMENTO) de uma família da conta. */
export type CandidatoDeTipologia = {
    tipologia: string; descricao: string | null; tipo: string | null; familia: string; rotulo: string; fornecedor: string
    /** A LINHA de produto da Detalhe (05/11/2026): quando a descrição termina nela, a linha do prompt a tira — a coluna já diz. */
    linha: string | null
    /** Os limites da Detalhe do motor (03/11/2026): NULL = o arquivo não traz, e nunca descarta. */
    larg_min_mm: number | null; larg_max_mm: number | null; alt_min_mm: number | null; alt_max_mm: number | null
}
/** Uma família da conta, com os motores das etapas e as tabelas de PREÇO que valem para ela. */
export type FamiliaLigada = FonteDaFamilia & { tabelasDePreco: string[] }
export type FamiliasDaEmpresaLidas = { ok: true; familias: FamiliaLigada[]; candidatos: CandidatoDeTipologia[] }
export type FamiliasDaEmpresa =
    | FamiliasDaEmpresaLidas
    | { ok: false; motivo: MotivoDaFalta | 'PERFIL_SEM_TABELA' | 'SEM_VIGENTE' | 'SEM_TABELA_VIGENTE'; frase: string; detalhe: string }

export const fraseDoPerfilSemTabela = (fornecedor: string) =>
    `Ainda não consigo escolher a tipologia: o fornecedor ${fornecedor}, vinculado ao perfil na base de conhecimento da sua empresa, não tem tabela cadastrada.`
export const fraseSemVigente = (fornecedor: string, familia: string | null, n: number) =>
    `Ainda não consigo escolher a tipologia: o fornecedor ${fornecedor} tem ${n} tabelas ${familia === null ? 'sem a família informada' : `da família ${familia}`} `
    + 'e nenhuma está marcada como vigente: não escolho entre elas.'
/** A família sem tabela de preço que vale (a única do grupo, ou a vigente) — PR D: erro de configuração, nunca preço de outra família. */
export const fraseDaFamiliaSemTabelaVigente = (familia: string) => fraseDeFalta(`a família ${familia} não tem nenhuma tabela de preço vigente`, SECAO_DOS_FORNECEDORES)
export const fraseSemListaDoMotor = (motor: string, familia: string) =>
    `Ainda não consigo escolher a tipologia: a lista de tipologias do motor ${motor}, da família ${familia}, com a descrição de cada uma, ainda não foi carregada.`
const porCodigoEFamilia = (a: CandidatoDeTipologia, b: CandidatoDeTipologia) =>
    (a.tipologia < b.tipologia ? -1 : a.tipologia > b.tipologia ? 1 : a.rotulo.localeCompare(b.rotulo, 'pt-BR'))

/**
 * As famílias da empresa (a base de conhecimento), com o motor de cada etapa conferido (`lerMotoresDaConta`) e as tabelas de PREÇO
 * que valem para cada uma; e as tipologias candidatas, do motor do levantamento de cada família. A primeira falta é a resposta.
 */
export async function lerFamiliasDaEmpresa(tenantId: string): Promise<FamiliasDaEmpresa> {
    // o motor das etapas e o PREÇO (as tabelas dos fornecedores que a base de conhecimento vincula, `tabelas-da-conta.ts`) só dependem da
    // conta: vão juntos (04/11/2026). A primeira falta continua sendo a do motor
    const [motores, derivacao] = await Promise.all([lerMotoresDaConta(tenantId), derivarTabelasDaConta(tenantId)])
    if (motores.ok === false) return { ok: false, motivo: motores.motivo, frase: motores.frase, detalhe: motores.detalhe }

    const perfilSemTabela = derivacao.fornecedoresSemTabela.find((f) => f.categorias.includes('PERFIL'))
    if (perfilSemTabela) return { ok: false, motivo: 'PERFIL_SEM_TABELA', frase: fraseDoPerfilSemTabela(perfilSemTabela.fornecedor), detalhe: '' }
    const familias: FamiliaLigada[] = []
    for (const f of motores.familias) {
        // da família: com a família da conta, ou sem família ("qualquer linha", dono do produto, 02/11/2026)
        const daFamilia = derivacao.tabelas.filter((t) => t.familiaChave === f.familia || t.familiaChave === null)
        // o grupo com mais de uma tabela e nenhuma vigente é recusa nomeada (a regra de sempre): não escolho entre elas
        const semVigente = derivacao.paresSemVigente.find((p) => daFamilia.some((t) => t.fornecedor === p.fornecedor && t.familia === p.familia && t.categoria === p.categoria))
        if (semVigente) return { ok: false, motivo: 'SEM_VIGENTE', frase: fraseSemVigente(semVigente.fornecedor, semVigente.familia, semVigente.arquivos.length), detalhe: `familia=${f.familia}` }
        const valem = daFamilia.filter((t) => t.vale).map((t) => t.tabelaId).sort()
        if (valem.length === 0) return { ok: false, motivo: 'SEM_TABELA_VIGENTE', frase: fraseDaFamiliaSemTabelaVigente(f.rotulo), detalhe: `familia=${f.familia} tabelas=${daFamilia.length}` }
        familias.push({ ...f, tabelasDePreco: valem })
    }

    // as tipologias: do motor do LEVANTAMENTO (a etapa com GERAR_LEVANTAMENTO) de cada família, por motor_id
    const candidatos: CandidatoDeTipologia[] = []
    // a lista de cada família é lida junto com as outras (04/11/2026); a primeira falta, na ordem das famílias, continua sendo a resposta
    const listas = await Promise.all(familias.map((f) => supabaseAdmin
        .from('orcamentista_motor_tipologia_detalhe').select('tipologia, descricao, tipo, linha, larg_min_mm, larg_max_mm, alt_min_mm, alt_max_mm').eq('motor_id', f.levantamento.id)))
    for (const [i, f] of familias.entries()) {
        const { data, error: erroDaLista } = listas[i]
        if (erroDaLista) return { ok: false, motivo: 'SEM_LISTA_DE_TIPOLOGIAS', frase: FRASE_SEM_LISTA_DE_TIPOLOGIAS, detalhe: `codigo=${erroDaLista.code ?? '-'}` }
        type LinhaDaDetalhe = { tipologia: unknown; descricao: string | null; tipo: string | null; linha?: unknown; larg_min_mm?: unknown; larg_max_mm?: unknown; alt_min_mm?: unknown; alt_max_mm?: unknown }
        const doMotor = ((data ?? []) as LinhaDaDetalhe[])
            .filter((c): c is LinhaDaDetalhe & { tipologia: string } => typeof c.tipologia === 'string' && c.tipologia !== '')
        // um motor sem lista não segue em silêncio: as outras famílias sozinhas esconderiam as tipologias dele
        if (doMotor.length === 0) return { ok: false, motivo: 'SEM_LISTA_DE_TIPOLOGIAS', frase: fraseSemListaDoMotor(f.levantamento.nome, f.rotulo), detalhe: 'linhas=0' }
        // os limites como estão na Detalhe: o que não é número é NULL (ausente não é zero — `tipologias-candidatas.ts`)
        candidatos.push(...doMotor.map((c) => ({
            tipologia: c.tipologia, descricao: c.descricao, tipo: c.tipo, familia: f.familia, rotulo: f.rotulo, fornecedor: f.fornecedor,
            linha: typeof c.linha === 'string' && c.linha.trim() !== '' ? c.linha : null,
            larg_min_mm: numeroOuNulo(c.larg_min_mm), larg_max_mm: numeroOuNulo(c.larg_max_mm), alt_min_mm: numeroOuNulo(c.alt_min_mm), alt_max_mm: numeroOuNulo(c.alt_max_mm),
        })))
    }
    return { ok: true, familias, candidatos: candidatos.sort(porCodigoEFamilia) }
}

/**
 * As famílias da conta cujo motor tem o código, na ordem do rótulo — com o motor do CÁLCULO de cada uma (o que a esquadria grava); null quando a
 * família não tem etapa de cálculo (a esquadria fica sem motor: ausente, não um motor de outro papel — `ausente-vs-falso.md`).
 */
export const familiasDoCodigo = (t: FamiliasDaEmpresaLidas): FamiliasDoCodigo => (codigo: string) =>
    t.candidatos.filter((c) => c.tipologia === codigo).map((c): FamiliaDoCodigo => ({
        familia: c.familia, rotulo: c.rotulo, fornecedor: c.fornecedor, motorId: t.familias.find((f) => f.familia === c.familia)!.calculo?.id ?? null,
    }))

/**
 * A linha do candidato no prompt: código, descrição (sem a linha de produto no fim), tipo e os LIMITES compactos (03/11/2026: "a lista de
 * tipologias enviada ao modelo tem de levar a descrição e os limites, não só o código"; 05/11/2026: a lista enxuta, −40 %) — e a família (e
 * o fornecedor do motor) quando a conta tem mais de uma família (com uma só, a linha é a de sempre). O limite que o arquivo não traz não vira
 * texto: a medida sem L ou sem A não tem limite, e o cabeçalho da lista diz isso.
 */
export const linhaDoCandidato = (c: CandidatoDeTipologia, comFamilia: boolean) => {
    const limites = limitesNoPrompt(c)
    return `${c.tipologia} | ${descricaoNoPrompt(c.descricao, c.linha) ?? '(sem descrição no arquivo)'} | ${c.tipo ?? '(sem tipo no arquivo)'}`
        + (limites ? ` | ${limites}` : '') + (comFamilia ? ` | família: ${c.rotulo} | fornecedor: ${c.fornecedor}` : '')
}

/** A tabela ainda não existe no banco (migração não aplicada): é falta nomeada, não erro. */
const tabelaAusente = (e: { code?: string }) => e.code === 'PGRST205' || e.code === '42P01'

// ── O tempo de fabricação ────────────────────────────────────────────────────────────────
export const FALTA_TABELA_DOS_TEMPOS = 'a tabela dos tempos de fabricação ainda não foi carregada no banco'
/**
 * O tempo da tipologia, de `orcamentista_motor_tipologia_tempo`. Sem linha é null — "não informado",
 * nunca zero (a linha só existe quando há tempo). Com a tabela ainda ausente no banco, `{ ausente: true }`:
 * é outra falta, e quem a exibe diz qual.
 */
export async function tempoDeFabricacao(motorId: string, tipologia: string): Promise<TempoDaTipologia | { ausente: true } | null> {
    const t = await temposDeFabricacao(motorId, [tipologia])
    return 'ausente' in t ? t : t.get(tipologia) ?? null
}
export type TempoDaTipologia = { minutos: number; origem: string | null }

/**
 * Os tempos de TODAS as tipologias do cálculo, numa leitura só (dono do produto, 08/11/2026: "os tempos numa leitura só" — antes, uma ida ao
 * banco por esquadria, em série). A tipologia sem linha, ou com o tempo vazio, não entra no mapa: é falta, e quem lê diz qual. Duas linhas
 * para a mesma tipologia no mesmo motor é erro do banco (a leitura de antes, `maybeSingle`, também lançava), nunca a escolha de uma.
 */
export async function temposDeFabricacao(motorId: string, tipologias: readonly string[]): Promise<Map<string, TempoDaTipologia> | { ausente: true }> {
    const pedidas = [...new Set(tipologias)]
    const tempos = new Map<string, TempoDaTipologia>()
    if (pedidas.length === 0) return tempos
    const { data, error } = await supabaseAdmin
        .from('orcamentista_motor_tipologia_tempo').select('tipologia, tempo_fabricacao_min, tempo_origem')
        .eq('motor_id', motorId).in('tipologia', pedidas)
    if (error) {
        if (tabelaAusente(error)) return { ausente: true }
        throw new Error(`orcamentista_motor_tipologia_tempo: ${error.message}`)
    }
    const vistas = new Set<string>()
    for (const linha of (data ?? []) as Array<{ tipologia: string; tempo_fabricacao_min: number | null; tempo_origem: string | null }>) {
        if (vistas.has(linha.tipologia)) throw new Error(`orcamentista_motor_tipologia_tempo: a tipologia ${linha.tipologia} tem mais de um tempo no motor ${motorId}`)
        vistas.add(linha.tipologia)
        if (typeof linha.tempo_fabricacao_min === 'number') tempos.set(linha.tipologia, { minutos: linha.tempo_fabricacao_min, origem: linha.tempo_origem })
    }
    return tempos
}

// ── A espessura do vidro ────────────────────────────────────────────────────────────────────
/**
 * As espessuras que os baguetes da tipologia aceitam: a coluna "Esp. vidro" da aba Perfis, todas as linhas que a trazem. É o que o motor diz, não o
 * texto do vidro — a leitura do texto é do leitor canônico (`lerVidro`, em `vidro.ts`), que recebe esta lista. A linha cujas espessuras não se leem
 * não entra aqui: o avaliador a recusa com o nome dela (`ESPESSURAS_NAO_PARSEIAM`).
 */
export function espessurasAceitasDaTipologia(tipologia: Tipologia | undefined): number[] {
    const aceitas = new Set<number>()
    for (const p of tipologia?.perfis ?? []) {
        if (p.esp_vidro === null || p.esp_vidro.trim() === '') continue
        const lista = p.esp_vidro.split(',').map((x) => x.trim())
        if (lista.every((x) => /^\d+$/.test(x))) for (const x of lista) aceitas.add(Number(x))
    }
    return [...aceitas].sort((x, y) => x - y)
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
    /**
     * `semTempo`: a falta é o TEMPO DE FABRICAÇÃO da tipologia (não cadastrado, ou a tabela dos tempos ausente). Desde 08/11/2026 essa falta
     * RECUSA o levantamento inteiro, como o preço de material (dono do produto); as outras faltas da mão de obra — a configuração da empresa, a
     * revenda — continuam como antes: a linha diz "não sai", e o material sai.
     */
    | { ok: false; falta: string; semTempo: boolean }

const centavos = (v: number) => Math.round(v * 100) / 100

/**
 * A mão de obra de `quantidade` unidades da tipologia: o tempo de fabricação × o valor do minuto pelo
 * caminho da tela de produto (`maoDeObraPeloCaminhoDaTela`). A esquadria é PRODUZIDA: o tipo de
 * cálculo é o da empresa, como na tela para um produto que não é de revenda. Toda leitura é desta
 * empresa (`tenant_id`) ou do motor do cálculo da família dela (o tempo, por `motor_id`).
 */
export async function lerMaoDeObra(tenantId: string, motorId: string, tipologia: string, quantidade: number): Promise<MaoDeObra> {
    return (await lerMaosDeObra(tenantId, motorId, [{ tipologia, quantidade }]))[0]
}

/** A configuração da empresa que a mão de obra lê (a tela de produto): `tenant_settings` e `tenant_expense_config`, juntas. */
async function lerDadosDaEmpresaParaMaoDeObra(tenantId: string): Promise<DadosDaEmpresaParaMaoDeObra> {
    const [{ data: settings, error: erroSettings }, { data: despesas, error: erroDespesas }] = await Promise.all([
        supabaseAdmin.from('tenant_settings').select('calc_type, monthly_workload, workload_unit, num_productive_employees').eq('tenant_id', tenantId).maybeSingle(),
        supabaseAdmin.from('tenant_expense_config')
            .select('production_labor_cost_hub, production_labor_cost, admin_salary_total, admin_fgts_total, admin_other_costs, fixed_expense_monthly')
            .eq('tenant_id', tenantId).maybeSingle(),
    ])
    if (erroSettings) throw new Error(`tenant_settings: ${erroSettings.message}`)
    if (erroDespesas) throw new Error(`tenant_expense_config: ${erroDespesas.message}`)
    return { ...((settings ?? {}) as DadosDaEmpresaParaMaoDeObra), ...((despesas ?? {}) as DadosDaEmpresaParaMaoDeObra) }
}

/**
 * A mão de obra de TODAS as esquadrias do cálculo, na ordem delas, com UMA ida ao banco (dono do produto, 08/11/2026): os tempos de todas as
 * tipologias numa leitura, e a configuração da empresa uma vez — as três leituras juntas. Antes, cada esquadria relia o tempo e a mesma
 * configuração, em série: 2 idas por esquadria. NÃO é cache: nada é guardado entre turnos; o cálculo só para de reler, dentro dele, o mesmo dado.
 */
export async function lerMaosDeObra(tenantId: string, motorId: string, esquadrias: ReadonlyArray<{ tipologia: string; quantidade: number }>): Promise<MaoDeObra[]> {
    if (esquadrias.length === 0) return []
    const [tempos, dados] = await Promise.all([temposDeFabricacao(motorId, esquadrias.map((e) => e.tipologia)), lerDadosDaEmpresaParaMaoDeObra(tenantId)])
    return esquadrias.map(({ tipologia, quantidade }): MaoDeObra => {
        if ('ausente' in tempos) return { ok: false, falta: FALTA_TABELA_DOS_TEMPOS, semTempo: true }
        const tempo = tempos.get(tipologia)
        if (!tempo) return { ok: false, falta: `o tempo de fabricação de ${tipologia} não está cadastrado`, semTempo: true }
        const m = maoDeObraPeloCaminhoDaTela(dados, tempo.minutos)
        if ('faltas' in m) return { ok: false, falta: m.faltas.join('; '), semTempo: false }
        return {
            ok: true, minutosPorUnidade: tempo.minutos, origem: tempo.origem, quantidade,
            custoMensal: m.custoMensal, minutosDaEmpresa: m.minutosDaEmpresa,
            porUnidade: m.valor, total: centavos(m.valor * quantidade),
        }
    })
}

// ── As leituras do banco ────────────────────────────────────────────────────────────────────
const PAGINA = 1000

/** As regras da tipologia, página a página, conferidas contra a contagem exata. */
export async function lerRegras(motorId: string, tipologia: string): Promise<RegraDoDePara[]> {
    const regras: RegraDoDePara[] = []
    let total: number | null = null
    for (let de = 0; total === null || de < total; de += PAGINA) {
        const { data, error, count } = await supabaseAdmin
            .from('orcamentista_motor_regra').select('codigo, codigo_wvetro, cor, descricao', { count: 'exact' })
            .eq('motor_id', motorId).contains('tipologias', [tipologia])
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
 * (tipologia, ordem): é única em todas elas — a Detalhe tem chave (motor, tipologia) e NÃO tem
 * `id` (medido em 26/10/2026; ordenar por `id` derrubou todo levantamento em produção às 14:07).
 */
const ORDEM_DAS_ABAS = ['tipologia', 'ordem'] as const
const ORDEM_POR_ID = ['id'] as const

/** TODAS as linhas do motor (`motor_id`; e, se pedido, só dos valores de uma coluna), página a página, com a contagem conferida. */
async function lerTudo(tabela: string, motorId: string, ordem: readonly string[], recorte?: { coluna: string; valores: readonly string[] }): Promise<Leitura> {
    const pagina = async (de: number): Promise<{ linhas: Array<Record<string, unknown>>; total: number } | { ausente: true }> => {
        let q = supabaseAdmin.from(tabela).select('*', { count: 'exact' }).eq('motor_id', motorId)
        if (recorte) q = q.in(recorte.coluna, [...recorte.valores])
        for (const c of ordem) q = q.order(c, { ascending: true })
        const { data, error, count } = await q.range(de, de + PAGINA - 1)
        if (error) {
            if (tabelaAusente(error)) return { ausente: true }
            throw new Error(`${tabela}: ${error.message}`)
        }
        if (typeof count !== 'number') throw new Error(`${tabela}: a contagem exata não veio`)
        return { linhas: (data ?? []) as Array<Record<string, unknown>>, total: count }
    }
    // a primeira página traz a contagem exata; as demais são pedidas JUNTAS (04/11/2026: as 4 páginas das Variáveis em série custavam
    // ~2 s por turno). A ordem total (`ordem`) é o que garante que páginas pedidas em paralelo não se sobrepõem nem deixam buraco
    const primeira = await pagina(0)
    if ('ausente' in primeira) return primeira
    const total = primeira.total
    const inicios: number[] = []
    for (let de = PAGINA; de < total; de += PAGINA) inicios.push(de)
    const demais = await Promise.all(inicios.map(pagina))
    const linhas = [...primeira.linhas]
    for (const p of demais) {
        if ('ausente' in p) return p
        linhas.push(...p.linhas)
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
async function formulasDaLinha(motorId: string, tipologia: string): Promise<{ linhas: Array<Record<string, unknown>>; linha: string } | { falta: string }> {
    const { data, error } = await supabaseAdmin.from('orcamentista_motor_tipologia').select('linha').eq('motor_id', motorId).eq('tipologia', tipologia)
    if (error) throw new Error(`orcamentista_motor_tipologia: ${error.message}`)
    const linhas = [...new Set(((data ?? []) as Array<{ linha: unknown }>).map((l) => l.linha).filter((l): l is string => typeof l === 'string' && l !== ''))]
    if (linhas.length === 0) return { falta: fraseDaTipologiaSemLinha(tipologia) }
    if (linhas.length > 1) return { falta: fraseDaTipologiaComDuasLinhas(tipologia, linhas) }
    const linha = linhas[0]
    const lida = await lerTudo('orcamentista_motor_formula_familia', motorId, ORDEM_POR_ID, { coluna: 'linha', valores: [linha] })
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
 * Validações) vindas do BANCO, do motor do cálculo da família (por `motor_id`) — gravadas pela importação, pelo mesmo mapa
 * (`ABAS_DO_MOTOR`). A aba 'Fórmulas' da tipologia é a fonte; sem ela, as da linha entram e o RÓTULO
 * sai em `rotulos`, que quem monta a resposta acrescenta ao texto — nunca em silêncio.
 */
export async function lerTipologiasDoBanco(motorId: string, codigos: readonly string[]): Promise<TipologiasDoBanco> {
    const faltas: string[] = []
    const rotulos: string[] = []
    const porAba: Record<string, Array<Record<string, unknown>>> = {}
    for (const nome of Object.keys(COLUNAS_LIDAS)) {
        const aba = abaDeclarada(nome)
        const lida = await lerTudo(aba.tabela, motorId, ORDEM_DAS_ABAS, { coluna: 'tipologia', valores: codigos })
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
            const daLinha = await formulasDaLinha(motorId, t)
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
 * As Variáveis de TODAS as tipologias do motor (o do levantamento da família, por `motor_id`), para a conversa perguntar as
 * escolhas. Com a tabela ainda ausente no banco, nenhuma definição: a conversa segue sem escolhas, e o levantamento recusa
 * nomeando a aba que falta.
 */
export async function lerVariaveisDasTipologias(motorId: string): Promise<Record<string, VariaveisDaTipologia>> {
    const aba = abaDeclarada('Variáveis')
    const lida = await lerTudo(aba.tabela, motorId, ORDEM_DAS_ABAS)
    if ('ausente' in lida) return {}
    const planilha = abaDoBanco(aba, lida.linhas)
    const codigos = [...new Set(lida.linhas.map((l) => l.tipologia).filter((t): t is string => typeof t === 'string'))]
    return Object.fromEntries(codigos.map((t) => [t, { variaveis: variaveisDaAba(planilha, t) }]))
}

/**
 * O PREÇO dos códigos: os itens das tabelas que valem para a família (todas as categorias), por `tabela_id` — é preço, não motor.
 * O mesmo código em duas tabelas vem duas vezes, e `levantarBarras` o recusa nomeando-o (dono do produto, 02/11/2026: "Recusa
 * nomeada, como hoje"); código em nenhuma é recusa nomeada também — nunca estimado nem escondido.
 */
/**
 * As colunas do item da tabela de preço que o cálculo lê: o preço e a medida (as barras), e a unidade e o BLOCO TRIBUTÁRIO (o custo do
 * orçamento I.A. por item, `custo-do-orcamento.ts`). O bloco é lido pelos NOMES de `orcamentista_tabela_item` (20261102000001); a
 * coluna antiga `ipi` NÃO entra (dono do produto, 09/11/2026: duas fontes para o mesmo número).
 */
export const COLUNAS_DO_ITEM_DA_TABELA =
    'codigo, descricao, unidade, medida_barra_m, valor_barra_interno, valor_metro_interno, cred_icms_pct, cred_pis_cofins_pct, cred_ipi_pct, nc_ipi_pct, cred_ibs_pct, cred_cbs_pct'
/**
 * OS ITENS NO ESCOPO DA RESOLUÇÃO (dono do produto, 12/11/2026: "escopo primeiro, sempre"): das tabelas que valem para a família, só os itens
 * das do FORNECEDOR e de uma FAMÍLIA do motor (`tabelaNoEscopo`). PROVA: o 8384 da tabela é uma cremona da Celsus; o 8384/WOLFF do motor é a
 * persiana da Wolf. Os itens vêm INTEIROS (todos os códigos das tabelas, não só os exatos), porque a resolução precisa ver o código com e sem
 * o sufixo do fornecedor (`2202/WOLFF`). O escopo e a primeira página de itens vão na MESMA onda (as idas ao banco do cálculo, 08/11/2026);
 * as páginas seguintes, de mil em mil — o PostgREST corta em mil, e cortar aqui faria um item aparecer como "não está na tabela" sem estar.
 */
async function lerItensNoEscopo(motorId: string, tabelaIds: readonly string[]): Promise<ItemDaTabela[]> {
    if (tabelaIds.length === 0) return []
    const pagina = (de: number) => supabaseAdmin
        .from('orcamentista_tabela_item').select(`${COLUNAS_DO_ITEM_DA_TABELA}, tabela_id`)
        .in('tabela_id', [...tabelaIds]).order('id', { ascending: true }).range(de, de + PAGINA - 1)
    const [motor, fams, tabelas, primeira] = await Promise.all([
        supabaseAdmin.from('orcamentista_motor').select('fornecedor_id').eq('id', motorId),
        supabaseAdmin.from('orcamentista_motor_familia').select('familia').eq('motor_id', motorId),
        supabaseAdmin.from('orcamentista_tabela').select('id, fornecedor_id, familia').in('id', [...tabelaIds]),
        pagina(0),
    ])
    if (motor.error) throw new Error(`orcamentista_motor: ${motor.error.message}`)
    if (fams.error) throw new Error(`orcamentista_motor_familia: ${fams.error.message}`)
    if (tabelas.error) throw new Error(`orcamentista_tabela: ${tabelas.error.message}`)
    if (primeira.error) throw new Error(`orcamentista_tabela_item: ${primeira.error.message}`)
    const fornecedor = ((motor.data ?? []) as Array<{ fornecedor_id: string }>)[0]?.fornecedor_id
    if (fornecedor === undefined) throw new Error(`orcamentista_motor: o motor ${motorId} não foi achado`)
    const escopo = { fornecedor_id: fornecedor, familias: ((fams.data ?? []) as Array<{ familia: string }>).map((f) => f.familia) }
    const noEscopo = new Set(((tabelas.data ?? []) as Array<{ id: string; fornecedor_id: string; familia: string | null }>).filter((x) => tabelaNoEscopo(x, escopo)).map((x) => x.id))
    const itens = [...((primeira.data ?? []) as Array<ItemDaTabela & { tabela_id: string }>)]
    for (let de = PAGINA, ultima = itens.length; ultima === PAGINA; de += PAGINA) {
        const { data, error } = await pagina(de)
        if (error) throw new Error(`orcamentista_tabela_item: ${error.message}`)
        const mais = (data ?? []) as Array<ItemDaTabela & { tabela_id: string }>
        itens.push(...mais)
        ultima = mais.length
    }
    return itens.filter((i) => noEscopo.has(i.tabela_id))
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
 * validada; o motor é lido por elas SEM CAIXA (08/11/2026: a lista diz "Branco", o motor "BRANCO").
 */
export async function lerCoresDaEmpresa(tenantId: string): Promise<string[]> {
    return (await lerPerfilDaEmpresa(tenantId)).cores
}

/** As cores do Perfil e a cor PREDOMINANTE da base, já na forma da lista (05/11/2026). */
export type PerfilDaEmpresa = { cores: string[]; corPredominante: string | null }

/**
 * A COR NÃO DITA É A PREDOMINANTE (dono do produto, 05/11/2026): "cor não dita = cor_predominante da categoria Perfil, comparada SEM CAIXA
 * contra a lista e gravada como está na lista ('BRANCO' cadastrado tem de casar com 'Branco' da lista). Nunca pergunte cor quando houver
 * predominante." A predominante que não está na lista (nem sem caixa e sem acento) é como se não houvesse: a cor que o motor não tem não
 * vira padrão em silêncio. Com mais de uma configuração de Perfil, vale a primeira predominante que casa.
 */
export async function lerPerfilDaEmpresa(tenantId: string): Promise<PerfilDaEmpresa> {
    const cores: string[] = []
    let corPredominante: string | null = null
    for (const config of await lerConfigsDoPerfil(tenantId)) {
        const lista = Array.isArray(config.cores) ? config.cores : []
        for (const c of lista) if (typeof c === 'string' && c !== '' && !cores.includes(c)) cores.push(c)
        const predominante = typeof config.cor_predominante === 'string' ? config.cor_predominante.trim() : ''
        if (corPredominante === null && predominante !== '') {
            const naLista = lista.find((c): c is string => typeof c === 'string' && normalizarNome(c) === normalizarNome(predominante))
            if (naLista !== undefined) corPredominante = naLista
        }
    }
    return { cores, corPredominante }
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

/**
 * A falta CURTA começa em minúscula ("o valor da barra do código 1023…") e vai depois de "Falta:". A que começa em maiúscula é uma FRASE
 * inteira, de configuração ("Falta de configuração — …", "A largura da serra não está…"): vai como está, sem um segundo "Falta:".
 */
const ehCurta = (f: string) => /^[a-zà-ÿ]/.test(f)
const inicialMinuscula = (t: string) => t.charAt(0).toLowerCase() + t.slice(1)
const comPonto = (t: string) => (/[.!?]$/.test(t) ? t : `${t}.`)

/**
 * A FRASE DA RECUSA, CURTA (dono do produto, 08/11/2026): "Não consegui fechar o levantamento <nome>. Falta: <o que falta>." Só isso — sem a
 * relação das esquadrias, sem o arremate e a guarnição repetidos por esquadria: o vendedor não precisa da relação de material para entender
 * que falta um valor. Cada falta já diz as esquadrias que ela trava, entre parênteses, e a mesma falta em várias esquadrias é UMA linha.
 * Com uma falta, ela vai na mesma linha; com mais, uma por linha. No máximo `MAXIMO_DE_FALTAS` listadas; o resto é contado, nunca calado.
 */
export function fraseDaRecusa(d: DadosDoLevantamento, faltas: readonly string[], caminhos: readonly string[] = []): string {
    const inicio = `Não consegui fechar o levantamento “${d.nome}”.`
    const listadas = faltas.slice(0, MAXIMO_DE_FALTAS).map((f) => `• ${ehCurta(f) ? comPonto(f) : f}`)
    const resto = faltas.length > MAXIMO_DE_FALTAS ? [`• e mais ${faltas.length - MAXIMO_DE_FALTAS} falta(s) do mesmo levantamento.`] : []
    const corpo = faltas.length === 1 ? [ehCurta(faltas[0]) ? `${inicio} Falta: ${comPonto(faltas[0])}` : `${inicio} ${faltas[0]}`] : [`${inicio} Falta:`, ...listadas, ...resto]
    // o caminho de alteração, quando há (08/11/2026), em uma linha depois das faltas
    return [...corpo, ...caminhos].join('\n')
}

/**
 * As esquadrias que a falta trava, depois dela, entre parênteses: " (esquadria 3, DP-02)", " (esquadrias 1, 2 e 3)". Num levantamento de
 * uma esquadria só, nada: o vendedor sabe qual é. A tipologia vai quando a falta é DELA (o motor), não do material.
 */
export function esquadriasDaFalta(numeros: readonly number[], noLevantamento: number, tipologia?: string): string {
    if (noLevantamento === 1 || numeros.length === 0) return ''
    const quem = numeros.length > 1 ? `esquadrias ${listaDeNumerosBR([...numeros])}` : `esquadria ${numeros[0]}`
    return ` (${quem}${tipologia ? `, ${tipologia}` : ''})`
}
/** O vidro com duas espessuras que os baguetes aceitam: "a espessura do vidro: "incolor 4 ou 6" pode ser 4 ou 6 mm; diga qual". */
export function faltaDaEspessuraAmbigua(texto: string, espessuras: readonly number[]): string {
    const ns = espessuras.map((n) => String(n).replace('.', ','))
    const lista = ns.length > 1 ? `${ns.slice(0, -1).join(', ')} ou ${ns[ns.length - 1]}` : ns.join('')
    return `a espessura do vidro: “${texto.trim()}” pode ser ${lista} mm; diga qual`
}
/** A falta com as esquadrias dela: a curta as leva depois, entre parênteses; a frase inteira (a recusa técnica do motor), antes, como sempre. */
function faltaComEsquadrias(falta: string, numeros: readonly number[], noLevantamento: number, tipologia?: string): string {
    if (ehCurta(falta)) return falta + esquadriasDaFalta(numeros, noLevantamento, tipologia)
    if (noLevantamento === 1 || numeros.length === 0) return falta
    const quem = numeros.length > 1 ? `Esquadrias ${listaDeNumerosBR([...numeros])}` : `Esquadria ${numeros[0]}`
    return `${quem}${tipologia ? ` (${tipologia})` : ''}: ${falta}`
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
    // FALTOU PREÇO, NADA EVOLUI (08/11/2026): o item sem valor é recusa em `levantarBarras`, e o levantamento sem um dos totais nunca
    // chega aqui. Se chegar, é defeito do código — e o erro vira FALHA_NO_CALCULO, nunca um preço parcial na mensagem
    if (t.total_por_barra_inteira === null || t.total_por_consumo_real === null) {
        throw new Error('levantamento sem um dos totais de material: o item sem valor devia ter sido recusado em levantarBarras')
    }
    // ao centavo ANTES de virar diferença ou soma: a conta refeita com os números da mensagem bate
    const barra = centavos(t.total_por_barra_inteira)
    const consumo = centavos(t.total_por_consumo_real)
    linhas.push('')
    linhas.push(`Perfis por barra inteira: ${formatarReais(barra)}.`)
    linhas.push(`Perfis por consumo real: ${formatarReais(consumo)}.`)
    linhas.push(`Diferença entre os dois: ${formatarReais(centavos(barra - consumo))}.`)
    // uma mão de obra ausente derruba a total: somar as que existem seria calcular com o que sobrou
    const todasCalculadas = maos.length > 0 && maos.every((m) => !('falta' in m))
    const maoDeObraTotal = todasCalculadas ? centavos(maos.reduce((s, m) => s + ('falta' in m ? 0 : m.total), 0)) : null
    if (maos.length === 1) linhas.push(linhaDaMaoDeObra('Mão de obra', maos[0]))
    else {
        maos.forEach((m, i) => linhas.push(linhaDaMaoDeObra(`Mão de obra da esquadria ${d.esquadrias[i]?.numero ?? i + 1}`, m)))
        linhas.push(maoDeObraTotal === null ? 'Mão de obra total: não sai — falta a mão de obra de uma esquadria.' : `Mão de obra total: ${formatarReais(maoDeObraTotal)}.`)
    }
    const comMaoDeObra = (rotulo: string, material: number) => (maoDeObraTotal === null
        ? `${rotulo} (perfis + mão de obra): não sai — falta a mão de obra.`
        : `${rotulo} (perfis + mão de obra): ${formatarReais(centavos(material + maoDeObraTotal))}.`)
    linhas.push('')
    linhas.push(comMaoDeObra('Total por barra inteira', barra))
    linhas.push(comMaoDeObra('Total por consumo real', consumo))
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

/**
 * A família SEM ETAPA DE CÁLCULO (dono do produto, 04/11/2026): o levantamento sai como foi gravado — as esquadrias —, sem barras, sem mão de
 * obra e sem preço, e diz por quê. Nada é estimado no lugar do cálculo que não existe.
 */
export const SEM_ETAPA_DE_CALCULO = 'Esta família não tem etapa de cálculo: as barras, a mão de obra e o preço não saem. O levantamento fica registrado como está.'
export function fraseDoLevantamentoSemCalculo(d: DadosDoLevantamento, bloco: { titulo: string } | null = null): string {
    return [`${bloco ? bloco.titulo : maiuscula(cabecalho(d))}.`, ...linhasDasEsquadrias(d), '', SEM_ETAPA_DE_CALCULO].join('\n')
}

const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

// ── O levantamento ──────────────────────────────────────────────────────────────────────────
export type LevantamentoDaConversa = { texto: string; desfecho: 'levantou' | 'recusou'; etapa?: ResumoDoCalculo }

/**
 * O RESUMO DO CÁLCULO para o log por etapa (dono do produto, 06/11/2026: "cada etapa do atendimento tem de dizer, no log, o que recebeu, o
 * que fez e o que faltou"). SÓ LOG: não muda o texto, o desfecho nem o preço. Contagens e CÓDIGOS — a esquadria (`e1`), o motivo
 * (`VARIAVEL_SEM_VALOR`), a variável ou o código de onde ele nasceu —, nunca valor em reais, nunca texto do vendedor.
 */
export type ResumoDoCalculo = {
    esquadrias: number
    /** Peças cortadas (soma das quantidades), barras compradas e códigos distintos — nulos quando o cálculo não chegou a otimizar. */
    pecas: number | null
    barras: number | null
    codigos: number | null
    /** Códigos sem um dos valores da tabela de preço: 0 no levantamento que fecha — sem preço, nada fecha (08/11/2026). */
    semPreco: number | null
    maoDeObra: 'ok' | 'falta' | 'sem_calculo' | null
    faltou: string[]
}

/** O que faltou, em código: `e<n>:<MOTIVO>[:<variável ou código>]`, `configuracao`, `serra`… */
const codigoDaRecusa = (r: { motivo: string; variavel?: string; codigo?: string; perfil?: string }, esquadrias: readonly number[]) =>
    [esquadrias.length ? esquadrias.map((n) => `e${n}`).join('+') : null, r.motivo, r.variavel ?? r.codigo ?? r.perfil ?? null].filter((x) => x !== null).join(':')

/** Uma esquadria como o levantamento a guarda (`orcamentista_levantamento_item`). */
export type EsquadriaGravada = { ordem?: unknown; tipologia: unknown; largura_mm: unknown; altura_mm: unknown; quantidade: unknown; cor_perfil: unknown; vidro: unknown; escolhas: unknown; familia: unknown }

export const fraseDaTipologiaSemFamilia = (n: number, tipologia: string, familias: readonly string[]) =>
    `dizer de qual família é a ${tipologia}: ela está no motor de mais de uma família da empresa (${familias.join(', ')}) (esquadria ${n})`
export const fraseDaTipologiaForaDosMotores = (n: number, tipologia: string) =>
    `a tipologia ${tipologia} no motor de alguma família da empresa: ela não está na lista de tipologias de nenhuma (esquadria ${n})`

/**
 * A mensagem do levantamento, com TODAS as esquadrias dele. Lança só em erro de banco — quem chama
 * loga e não manda nada técnico ao vendedor. Toda falta de DADO volta como texto de recusa, nomeada,
 * e as faltas de todas as esquadrias saem de uma vez.
 *
 * UMA RELAÇÃO POR FAMÍLIA (dono do produto, 26/10/2026): o levantamento pode ter várias famílias, e cada
 * uma é um produto. As esquadrias se agrupam pela FAMÍLIA delas (desde o PR D; antes, pela tabela), e cada grupo tem o
 * seu cálculo e a sua otimização de barras, com o motor e as tabelas de preço da família: nenhuma barra atravessa de um
 * grupo para o outro. Com uma família só, a mensagem é a de sempre.
 *
 * Dentro de uma família, as esquadrias são calculadas com UMA cor — `levantarBarras` recebe uma —; cores
 * diferentes na mesma família são recusa nomeada, com a cor de cada uma. Nunca se escolhe uma.
 */
/**
 * O CÁLCULO do levantamento, sem a mensagem: a família de cada esquadria, os grupos (uma família por grupo) e o cálculo de cada grupo —
 * ou a recusa de antes de calcular (a fonte, a cor, a família). É UM caminho para os dois leitores: a conversa (`mensagemDoLevantamento`,
 * que monta o texto) e o orçamento I.A. (`custo-do-orcamento-servidor.ts`, que monta o custo por item). Nada aqui é escrito no banco.
 */
export type CalculoDoLevantamento =
    | { recusa: LevantamentoDaConversa }
    | { lev: { nome: string; itens: EsquadriaGravada[] }; d: DadosDoLevantamento; grupos: Array<{ familia: FamiliaLigada; indices: number[] }>; calculos: CalculoDaFamilia[] }
export async function calcularOLevantamento(
    tenantId: string,
    fonte: FamiliasDaEmpresa,
    lev: { nome: string; itens: EsquadriaGravada[] },
): Promise<CalculoDoLevantamento> {
    const corDe = (e: EsquadriaGravada) => (typeof e.cor_perfil === 'string' && e.cor_perfil !== '' ? e.cor_perfil : null)
    const cores = [...new Set(lev.itens.map(corDe).filter((c): c is string => c !== null))]
    const d: DadosDoLevantamento = {
        nome: lev.nome,
        cor: cores.length === 1 ? cores[0] : cores.length === 0 ? '(sem cor)' : '(cores diferentes)',
        esquadrias: lev.itens.map((e, i) => ({
            numero: i + 1, tipologia: String(e.tipologia), largura_mm: Number(e.largura_mm), altura_mm: Number(e.altura_mm), quantidade: Number(e.quantidade), escolhas: null as string | null,
        })),
    }
    const resumo = (faltou: string[], fechado: Partial<ResumoDoCalculo> = {}): ResumoDoCalculo =>
        ({ esquadrias: lev.itens.length, pecas: null, barras: null, codigos: null, semPreco: null, maoDeObra: null, faltou, ...fechado })
    const recusa = (faltas: string[], faltou: string[], caminhos: string[] = []): CalculoDoLevantamento =>
        ({ recusa: { texto: fraseDaRecusa(d, faltas, caminhos), desfecho: 'recusou', etapa: resumo(faltou) } })
    if ('frase' in fonte) return recusa([maiuscula(fonte.frase.replace(/^Ainda não consigo escolher a tipologia: /, ''))], ['configuracao'])

    const faltas: string[] = []
    const faltou: string[] = []
    lev.itens.forEach((e, i) => { if (corDe(e) === null) { faltas.push(`a cor do perfil${esquadriasDaFalta([i + 1], lev.itens.length)}`); faltou.push(`e${i + 1}:SEM_COR`) } })

    // a família de cada esquadria (PR D): a guardada, ou a única cujo motor tem o código; com o código em mais de uma sem a dita,
    // ou em nenhuma, é recusa nomeada
    const doCodigo = familiasDoCodigo(fonte)
    const familiaDe = lev.itens.map((e) => familiaDaEsquadria(
        { tipologia: typeof e.tipologia === 'string' ? e.tipologia : null, familia: typeof e.familia === 'string' ? e.familia : null }, doCodigo))
    familiaDe.forEach((f, i) => {
        if (f === null) { faltas.push(fraseDaTipologiaForaDosMotores(i + 1, d.esquadrias[i].tipologia)); faltou.push(`e${i + 1}:FORA_DOS_MOTORES:${d.esquadrias[i].tipologia}`) }
        else if ('opcoes' in f) { faltas.push(fraseDaTipologiaSemFamilia(i + 1, d.esquadrias[i].tipologia, rotulosDasOpcoes(f.opcoes))); faltou.push(`e${i + 1}:SEM_FAMILIA:${d.esquadrias[i].tipologia}`) }
    })
    if (faltas.length) return recusa(faltas, faltou)

    // os grupos: uma família por grupo, na ordem da primeira esquadria de cada um
    const grupos: Array<{ familia: FamiliaLigada; indices: number[] }> = []
    familiaDe.forEach((f, i) => {
        const chave = (f as FamiliaDoCodigo).familia
        const grupo = grupos.find((g) => g.familia.familia === chave)
        if (grupo) grupo.indices.push(i)
        else grupos.push({ familia: fonte.familias.find((x) => x.familia === chave)!, indices: [i] })
    })
    const calculos: CalculoDaFamilia[] = []
    for (const g of grupos) {
        // a família sem etapa de cálculo só levanta: nada se calcula, e a mensagem diz isso (04/11/2026)
        calculos.push(g.familia.calculo === null ? semCalculo(lev, d, g.indices) : await calcularFamilia(tenantId, g.familia, g.familia.calculo.id, lev, d, g.indices))
    }
    return { lev, d, grupos, calculos }
}

/** A MENSAGEM do levantamento para o vendedor: o cálculo (`calcularOLevantamento`) e o texto dele, ou a recusa. */
export async function mensagemDoLevantamento(
    tenantId: string,
    fonte: FamiliasDaEmpresa,
    lev: { nome: string; itens: EsquadriaGravada[] },
): Promise<LevantamentoDaConversa> {
    const c = await calcularOLevantamento(tenantId, fonte, lev)
    if ('recusa' in c) return c.recusa
    return mensagemDoCalculo(c)
}

/** O texto do levantamento calculado (síncrono): a recusa nomeada das famílias que não fecharam, ou as esquadrias, as barras e o preço. */
export function mensagemDoCalculo(c: Exclude<CalculoDoLevantamento, { recusa: unknown }>): LevantamentoDaConversa {
    const { lev, d, grupos, calculos } = c
    const resumo = (faltou: string[], fechado: Partial<ResumoDoCalculo> = {}): ResumoDoCalculo =>
        ({ esquadrias: lev.itens.length, pecas: null, barras: null, codigos: null, semPreco: null, maoDeObra: null, faltou, ...fechado })
    const recusa = (faltas: string[], faltou: string[], caminhos: string[] = []): LevantamentoDaConversa =>
        ({ texto: fraseDaRecusa(d, faltas, caminhos), desfecho: 'recusou', etapa: resumo(faltou) })
    const varias = grupos.length > 1
    const rotulos = calculos.flatMap((c) => c.rotulos)
    // o rótulo do fallback vai em TODA resposta, a que fecha e a que recusa
    const rotulado = (r: LevantamentoDaConversa): LevantamentoDaConversa => (rotulos.length ? { ...r, texto: `${r.texto}\n\n${rotulos.join('\n')}` } : r)
    const nomeDaFamilia = (f: FamiliaLigada) => `Família ${f.rotulo} — ${f.fornecedor}`
    // a família de uma falta CURTA vai junto das esquadrias, entre parênteses — na frente, ela tiraria o "Falta:" (08/11/2026); a frase inteira a leva na frente
    const daFamilia = (k: number, x: string) => {
        if (!varias) return x
        const familia = nomeDaFamilia(grupos[k].familia)
        if (!ehCurta(x)) return `${familia}: ${x}`
        return x.endsWith(')') && /\(esquadrias? [^()]*\)$/.test(x) ? `${x.slice(0, -1)}, ${inicialMinuscula(familia)})` : `${x} (${inicialMinuscula(familia)})`
    }
    const recusadas = calculos.flatMap((c, k) => ('faltas' in c ? c.faltas.map((x) => daFamilia(k, x)) : []))
    if (recusadas.length) return rotulado(recusa(recusadas, calculos.flatMap((c) => ('faltas' in c ? c.codigos : [])), calculos.flatMap((c) => ('faltas' in c ? c.caminhos : []))))

    const fechados = calculos as Array<Exclude<CalculoDaFamilia, { faltas: unknown }>>
    // o resumo para o log: o que foi cortado, comprado e o que ficou sem mão de obra — nunca o valor. Sem preço, nada fecha (08/11/2026):
    // o código sem valor sai em `faltou` da recusa (`e1:ITEM_SEM_VALOR:1023`), e no levantamento que fecha `semPreco` é 0
    const calculados = fechados.filter((c): c is Extract<CalculoDaFamilia, { r: unknown }> => 'r' in c)
    const soma = (f: (c: (typeof calculados)[number]) => number) => (calculados.length ? calculados.reduce((t, c) => t + f(c), 0) : null)
    const semMao = calculados.flatMap((c) => c.maos.flatMap((m, k) => ('falta' in m ? [`e${c.d.esquadrias[k].numero}:SEM_MAO_DE_OBRA:${c.d.esquadrias[k].tipologia}`] : [])))
    const etapa = resumo(semMao, {
        pecas: soma((c) => c.r.esquadrias.reduce((t, e) => t + e.pecas.reduce((u, p) => u + p.quantidade, 0), 0)),
        barras: soma((c) => c.r.total.n_barras),
        codigos: soma((c) => c.r.por_codigo.length),
        semPreco: calculados.length ? 0 : null,
        maoDeObra: calculados.length === 0 ? 'sem_calculo' : semMao.length ? 'falta' : 'ok',
    })
    const textoDe = (c: (typeof fechados)[number], bloco: { titulo: string; cobertura: false; numerar: true } | null) =>
        ('semCalculo' in c ? fraseDoLevantamentoSemCalculo(c.d, bloco) : fraseDoLevantamento(c.d, c.r, c.maos, bloco))
    if (!varias) return rotulado({ texto: textoDe(fechados[0], null), desfecho: 'levantou', etapa })
    const blocos = fechados.map((c, k) => textoDe(c, { titulo: `${nomeDaFamilia(grupos[k].familia)}, perfil ${c.d.cor}`, cobertura: false, numerar: true }))
    // "o que o preço cobre" só quando alguma família calculou: sem preço nenhum na mensagem, não há o que cobrir
    const algumaCalculou = fechados.some((c) => !('semCalculo' in c))
    const texto = [
        `Levantamento “${lev.nome}”: ${grupos.length} famílias, cada uma calculada com o motor e as tabelas de preço dela — as barras de uma não entram na otimização da outra.`,
        '', blocos.join('\n\n'), ...(algumaCalculou ? ['', O_QUE_O_PRECO_COBRE] : []),
    ].join('\n')
    return rotulado({ texto, desfecho: 'levantou', etapa })
}

export type CalculoDaFamilia =
    | { d: DadosDoLevantamento; r: Extract<ResultadoDoLevantamento, { ok: true }>; maos: MaoDeObra[]; rotulos: string[]; itens: ItemDaTabela[] }
    | { semCalculo: true; d: DadosDoLevantamento; rotulos: string[] }
    | { faltas: string[]; rotulos: string[]; codigos: string[]; caminhos: string[] }

/** As esquadrias de um grupo (uma família) como o bloco da mensagem as recebe: as MESMAS de `d`, com a cor do grupo. */
function dadosDoGrupo(lev: { nome: string; itens: EsquadriaGravada[] }, d: DadosDoLevantamento, indices: number[]): { dg: DadosDoLevantamento; itensDoGrupo: EsquadriaGravada[]; cores: string[] } {
    const itensDoGrupo = indices.map((i) => lev.itens[i])
    const corDe = (e: EsquadriaGravada) => (typeof e.cor_perfil === 'string' && e.cor_perfil !== '' ? e.cor_perfil : null)
    const cores = [...new Set(itensDoGrupo.map(corDe).filter((c): c is string => c !== null))]
    return { dg: { nome: d.nome, cor: cores.length === 1 ? cores[0] : '(cores diferentes)', esquadrias: indices.map((i) => d.esquadrias[i]) }, itensDoGrupo, cores }
}

/** A família sem etapa de cálculo: as esquadrias do grupo, e nenhum número. */
const semCalculo = (lev: { nome: string; itens: EsquadriaGravada[] }, d: DadosDoLevantamento, indices: number[]): CalculoDaFamilia =>
    ({ semCalculo: true, d: dadosDoGrupo(lev, d, indices).dg, rotulos: [] })

/**
 * O cálculo de UMA família: as esquadrias dela, com o MOTOR do cálculo dela (a etapa com CALCULAR_BARRAS: as abas, as regras e o tempo,
 * por `motor_id`) e o PREÇO das tabelas que valem para ela (por `tabela_id`) — a otimização de barras e a mão de obra. `d` é o
 * levantamento inteiro: as esquadrias do grupo são as MESMAS de `d` (a descrição do arremate escrita aqui aparece também na recusa).
 */
async function calcularFamilia(
    tenantId: string, familia: FamiliaLigada, motorId: string, lev: { nome: string; itens: EsquadriaGravada[] }, d: DadosDoLevantamento, indices: number[],
): Promise<CalculoDaFamilia> {
    const { dg, itensDoGrupo, cores } = dadosDoGrupo(lev, d, indices)
    const corDe = (e: EsquadriaGravada) => (typeof e.cor_perfil === 'string' && e.cor_perfil !== '' ? e.cor_perfil : null)
    const faltas: string[] = []
    const codigos: string[] = []
    if (cores.length > 1) {
        const porEsquadria = dg.esquadrias.map((e, k) => `esquadria ${e.numero}: ${corDe(itensDoGrupo[k])}`).join('; ')
        faltas.push(`uma cor só para o perfil: as esquadrias têm cores diferentes (${porEsquadria}), e ainda não calculo um levantamento com cores misturadas`)
        codigos.push('CORES_DIFERENTES')
    }

    // as abas de cada tipologia, uma vez por tipologia; as escolhas descritas, uma vez por esquadria
    const doBanco = await lerTipologiasDoBanco(motorId, [...new Set(dg.esquadrias.map((e) => e.tipologia))])
    const lidas = doBanco.lidas
    const rotulos = doBanco.rotulos
    faltas.push(...doBanco.faltas)
    if (doBanco.faltas.length) codigos.push(`ABAS_DO_MOTOR:${doBanco.faltas.length}`)
    // os valores das variáveis sem padrão (06/11/2026) chegam ao avaliador pela tipologia: sem ela, só as capturadas
    const escolhas = itensDoGrupo.map((e, k) => lerEscolhasGravadas(e.escolhas, lidas[dg.esquadrias[k].tipologia] ?? null))
    dg.esquadrias.forEach((e, k) => { if (lidas[e.tipologia]) e.escolhas = descreverArremate(lidas[e.tipologia], escolhas[k]) })
    if (faltas.length) return { faltas, rotulos, codigos, caminhos: [] }

    // o vidro de cada esquadria, pelo leitor canônico, com as espessuras que os baguetes da tipologia dela aceitam (08/11/2026)
    const vidros = itensDoGrupo.map((e, k) => lerVidro(e.vidro, espessurasAceitasDaTipologia(lidas[dg.esquadrias[k].tipologia])))
    const ambiguas = dg.esquadrias.flatMap((e, k) => {
        const v = vidros[k]
        if (v.espessuras_ambiguas === null) return []
        return [faltaComEsquadrias(faltaDaEspessuraAmbigua(v.texto_original ?? '', v.espessuras_ambiguas), [e.numero], d.esquadrias.length, e.tipologia)]
    })
    if (ambiguas.length) return { faltas: ambiguas, rotulos, codigos: ambiguas.map(() => 'ESPESSURA_AMBIGUA'), caminhos: [] }

    const serra = await lerSerra(tenantId)
    if ('frase' in serra) return { faltas: [maiuscula(serra.frase)], rotulos, codigos: ['SERRA'], caminhos: [] }
    // a mesma linha do motor pode servir a duas tipologias: o de-para entra uma vez só
    const porTrio = new Map<string, RegraDoDePara>()
    for (const t of Object.keys(lidas)) {
        for (const g of await lerRegras(motorId, t)) porTrio.set(JSON.stringify([g.codigo, g.codigo_wvetro, g.cor]), g)
    }
    const regras = [...porTrio.values()]
    const itens = await lerItensNoEscopo(motorId, familia.tabelasDePreco)

    const r = levantarBarras({
        cor: cores[0],
        // o padrão do arremate entra AQUI, pelo ponto único (`padraoDoArremate`), e não pelo avaliador
        esquadrias: dg.esquadrias.map((e, k) => ({
            tipologia: e.tipologia, L_mm: e.largura_mm, H_mm: e.altura_mm, quantidade: e.quantidade,
            escolhas: lidas[e.tipologia] ? escolhasComPadrao(lidas[e.tipologia], escolhas[k]) : escolhas[k], espessura_vidro_mm: vidros[k].espessura_mm,
        })),
        tipologias: lidas,
        regras,
        itens,
        serra_mm: serra.serra_mm,
    })
    // a mão de obra é lida MESMO com as barras recusadas: a falta de TEMPO sai junto com a de preço, de uma vez (08/11/2026)
    const maos = await lerMaosDeObra(tenantId, motorId, dg.esquadrias)
    const semTempo = faltasDeTempo(dg, maos, d.esquadrias.length, familia.calculo?.nome ?? null)
    if ('recusas' in r || semTempo.length) {
        // R4: a recusa nomeia o que falta, em português — sem o código interno da variável; a esquadria pelo
        // número dela no levantamento, e sem prefixo quando o levantamento tem uma só
        const traduzir = (m: string) => Object.values(lidas).reduce((t, tip) => traduzirVocabulario(t, tip), m)
        const numeros = dg.esquadrias.map((e) => e.numero)
        const recusas = 'recusas' in r ? r.recusas : []
        // o que falta, curto, e as esquadrias dele no levantamento, entre parênteses (08/11/2026); a tipologia vai quando a falta é do motor
        // dela — só a recusa da esquadria e a do avaliador a trazem; a do material (a ponte, o item, o agrupador) é do código, não da tipologia
        const frase = (x: (typeof recusas)[number]) =>
            faltaComEsquadrias(traduzir(x.falta), x.esquadrias.map((k) => numeros[k - 1] ?? k), d.esquadrias.length, x.tipologia)
        return {
            faltas: [...recusas.map(frase), ...semTempo.map((t) => t.frase)], rotulos,
            codigos: [...recusas.map((x) => codigoDaRecusa(x, x.esquadrias.map((k) => numeros[k - 1] ?? k))), ...semTempo.map((t) => t.codigo)],
            // o CAMINHO DE ALTERAÇÃO de cada falta que tem um (08/11/2026): "Para trocar, diga: muda o vidro da esquadria 1 para 8 mm."
            caminhos: caminhosDasRecusas(recusas, numeros, itensDoGrupo),
        }
    }
    return { d: dg, r, maos, rotulos, itens }
}

/**
 * O CAMINHO DE ALTERAÇÃO de cada falta que tem um (dono do produto, 08/11/2026): a frase que o vendedor manda, com o atributo e o número da esquadria
 * reais — "Para trocar, diga: muda o vidro da esquadria 1 para temperado incolor 5 mm." O vidro sugerido é o que ele disse, com a espessura trocada
 * pela sugerida (ou acrescentada, se ele não disse nenhuma): trocar só o número não perde o resto do produto. Esquadrias com o mesmo vidro sugerido
 * vão numa frase só. Nada de frase genérica: a falta sem caminho (`caminho` nulo — o cadastro, o motor, a configuração) não ganha linha nenhuma.
 */
function caminhosDasRecusas(recusas: readonly RecusaDoLevantamento[], numeros: readonly number[], itensDoGrupo: readonly EsquadriaGravada[]): string[] {
    const porAlvo = new Map<string, number[]>()
    for (const x of recusas) {
        if (x.caminho === null) continue
        for (const k of x.esquadrias) {
            const alvo = vidroComEspessura(itensDoGrupo[k - 1]?.vidro, x.caminho.espessura_mm)
            const lista = porAlvo.get(alvo) ?? []
            const n = numeros[k - 1] ?? k
            if (!lista.includes(n)) lista.push(n)
            porAlvo.set(alvo, lista)
        }
    }
    return [...porAlvo.entries()].map(([alvo, ns]) => {
        const quem = ns.length > 1 ? `das esquadrias ${listaDeNumerosBR([...ns].sort((a, b) => a - b))}` : `da esquadria ${ns[0]}`
        return `Para trocar, diga: muda o vidro ${quem} para ${alvo}.`
    })
}

/**
 * A falta de TEMPO DE FABRICAÇÃO, uma por tipologia, nomeando as esquadrias, a tipologia e o motor — a referência interna que acha o cadastro
 * (`orcamentista_motor_tipologia_tempo`, por motor e tipologia). As outras faltas da mão de obra não entram (ver `MaoDeObra`).
 */
function faltasDeTempo(dg: DadosDoLevantamento, maos: MaoDeObra[], noLevantamento: number, motor: string | null): Array<{ frase: string; codigo: string }> {
    const porTipologia = new Map<string, { numeros: number[]; falta: string }>()
    dg.esquadrias.forEach((e, k) => {
        const m = maos[k]
        if (!('falta' in m) || !m.semTempo) return
        const g = porTipologia.get(e.tipologia) ?? { numeros: [], falta: m.falta }
        g.numeros.push(e.numero)
        porTipologia.set(e.tipologia, g)
    })
    const doMotor = motor === null ? '' : ` no motor ${motor}`
    return [...porTipologia.entries()].map(([tipologia, g]) => {
        const texto = g.falta === FALTA_TABELA_DOS_TEMPOS
            ? `a tabela dos tempos de fabricação, com o tempo de ${tipologia}: ${g.falta}`
            : `o tempo de fabricação de ${tipologia}${doMotor}`
        return { frase: texto + esquadriasDaFalta(g.numeros, noLevantamento), codigo: `${g.numeros.map((n) => `e${n}`).join('+')}:SEM_TEMPO:${tipologia}` }
    })
}
const listaDeNumerosBR = (ns: number[]) => (ns.length > 1 ? `${ns.slice(0, -1).join(', ')} e ${ns[ns.length - 1]}` : String(ns[0]))
