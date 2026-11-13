/**
 * Atendimentos I.A. — o LEVANTAMENTO DE BARRAS: a ligação do avaliador de fórmulas
 * (`avaliador-de-formulas.ts`) ao agrupador de barras (`agrupador-de-barras.ts`). Dadas N esquadrias
 * — tipologia, L, H, quantidade e escolhas —, as peças de cada uma, o CÓDIGO DO ITEM de cada peça,
 * e as barras do levantamento inteiro, com o aproveitamento e os dois totais. Função PURA: não lê
 * banco nem rede. Quem chama traz as tipologias, as regras do motor e os itens da tabela de preço
 * (`orcamentista_motor_regra` e `orcamentista_tabela_item`, da mesma tabela do fornecedor) e a
 * serra (base de conhecimento, categoria PERFIL).
 *
 * A PONTE ENTRE OS DOIS CÓDIGOS. O avaliador devolve a peça com o código da coluna Perfil das abas de
 * tipologia — o Código WVetro, "BZ0006/WOLFF". A tabela de preço usa o Código Wolff — "10501". A
 * aba "Motor por barra" traz os dois lado a lado (`codigo_wvetro` e `codigo` em
 * `orcamentista_motor_regra`), e a ligação é por (Código WVetro, cor). Medido em 24/10/2026, na
 * tabela Wolff: um Código Wolff tem UM WVetro sempre; um WVetro tem vários Wolff (40 de 120), um por
 * cor — e mesmo com a cor, 37 dos 509 pares têm mais de um.
 *
 * AS DECISÕES DO DONO DO PRODUTO, 24/10/2026:
 *   - A COR É A DA ENTRADA (`EntradaDoLevantamento.cor`), desde 25/10/2026 — antes era BRANCO fixa.
 *     Quem chama passa a cor da pré-definição, que a conversa só aceita da lista `cores` da base de
 *     conhecimento, escrita como a coluna `cor` do motor. Nenhum de-para de cor é inventado aqui:
 *     uma cor que o motor não tem para um perfil é RECUSA nomeada, com as variantes que existem;
 *   - BARRA → REFERÊNCIA → CÓDIGO → VALOR, UM VALOR POR CÓDIGO. Dois códigos para o mesmo (perfil,
 *     cor) é dado incompleto, não ambiguidade aceitável: RECUSA com os dois códigos e os dois
 *     valores, mesmo com preço igual ("preço igual, usa os dois" foi proposto e rejeitado);
 *   - FALTOU DADO, RECUSA NOMEADA (`docs/regras/faltou-dado-recusa-nomeada.md`): nunca aproxima,
 *     nunca escolhe o parecido, nunca calcula com o que sobrou. Com qualquer recusa, não sai barra
 *     nenhuma — e saem TODAS as recusas, de todas as esquadrias, de uma vez.
 *
 * A COR É COMPARADA SEM CAIXA, E SÓ SEM CAIXA (08/11/2026, o defeito do levantamento “Gerson Boss”). A esquadria grava a cor na
 * grafia da LISTA da base ("Branco"), por decisão do dono do produto de 05/11/2026 ("'BRANCO' cadastrado tem de casar com 'Branco'
 * da lista"); o motor a grava como o fornecedor escreve ("BRANCO"). Medido em produção: entre as duas, só a CAIXA diverge — sem
 * espaço nas pontas, sem acento. Antes, a comparação era `===`, e todo perfil branco da De Paula recusava. O resto continua EXATO:
 * "LAMINADO  PRETO LISO" (dois espaços, como está no banco) não é "LAMINADO PRETO LISO", "Branco " não é BRANCO, e "Preto" não é
 * "PRETO TEXTURADO". E se o motor tiver a mesma cor em duas grafias que só a caixa distingue (BRANCO e Branco), é RECUSA
 * (`COR_EM_DUAS_GRAFIAS`): a caixa deixou de distinguir, e escolher uma seria escolher o parecido.
 *
 * O PERFIL SEM VARIANTE. Quando TODAS as linhas de um perfil têm a cor vazia, o perfil não tem
 * variante — é o caso dos reforços de aço e da guia de alumínio da DP-02 (`1023`, `8432`, `8433`,
 * medido) —, e o código é o único que existe, com qualquer cor. Isso não é aproximação: não há o que
 * escolher. Mas a cor vazia AO LADO de outras cores NÃO é coringa: o que ela significa ali não foi
 * medido (`a-coluna-que-parece-enumeracao.md`, ressalvas), e a recusa diz quais variantes existem.
 *
 * A COLUNA `cor` NÃO É SÓ COR (`a-coluna-que-parece-enumeracao.md`): na DP-02 ela carrega '1MM',
 * 'IL50', 'LINHA 42', '(DESAGUE)', e `BZ0012/WOLFF` só existe como `CLICK` — o tipo de encaixe.
 *
 * A REGRA DA COR — o perfil COM variante (a coluna `cor` preenchida) casa pela cor pedida, e só por ela; sem ela, é RECUSA nomeando o
 * perfil, a cor e as variantes que existem. NÃO autoriza "a mais parecida", e vale também para o perfil de UMA variante só (dono do
 * produto, 08/11/2026): "perfil com variante única só serve para a cor que ele é, SEMPRE, independente da lista de cores da empresa".
 *   - O que saiu: de 25/10/2026 a 08/11/2026, a variante única valia para qualquer cor (`VARIANTE_UNICA`, por causa do BZ0012 em
 *     'CLICK'), com uma guarda que só a recusava quando a variante era uma cor da LISTA da empresa. Com uma lista sem Branco, o BZ0006 (só
 *     em BRANCO) levava o código branco para uma esquadria roxa, e NADA travava: saía preço e saía produto, errados e silenciosos.
 *   - O BZ0012 ('CLICK') e os reforços de aço (8523, 8434) não são cor: o dado é que tem de dizer isso, não o código adivinhar. O dono do
 *     produto limpa a coluna Cor deles no arquivo do motor, e a célula vazia já é "sem variante" — o comportamento certo para eles. Até o
 *     arquivo corrigido entrar, o levantamento com arremate interno recusa nomeando o BZ0012 (a ordem está no PR).
 *
 * FALTA DE PREÇO NÃO IMPEDE A EVOLUÇÃO (dono do produto, 12/11/2026 — SUBSTITUI "faltou preço, nada evolui", de 08/11/2026): o código cuja
 * referência não se resolve, ou que se resolve num item sem o valor da barra ou do metro, NÃO recusa o levantamento. Ele vira FALTA NOMEADA
 * (`faltas`), uma por esquadria em que a peça entra — o código do motor, a descrição dele, a cor pedida, a tipologia, a esquadria, o motivo e a
 * frase —, e as peças dele ficam FORA do agrupador e do custo: sem preço, nunca com zero. O resultado sai `ok`, com os totais só do que tem
 * preço, e quem monta a resposta diz que é PARCIAL. Continuam RECUSA (nada sai): a esquadria inválida, a tipologia sem definição, a recusa do
 * avaliador nas peças de perfil, a cor em duas grafias no motor e a barra sem comprimento ou menor que a peça — falta de medida ou de motor, não
 * de preço.
 *
 * A RESOLUÇÃO (12/11/2026, o comando único): a ponte do motor (aba "Motor por barra") é o PRIMEIRO degrau; sem ela — o perfil sem regra, a cor
 * sem código na regra —, a escada segue: o código exato, o código + a cor pela tabela de cores do fornecedor, o nome técnico na descrição, com o
 * guarda da descrição em todos (`resolucao-de-referencia.ts`). A ponte com DOIS códigos para a mesma cor é falta nomeada (ambígua), com os
 * dois.
 *
 * Para separar as duas formas do resultado, use `'recusas' in r` (e `'recusa' in r` em `codigoDaPeca`):
 * com `strictNullChecks: false`, o tsc não estreita a união pelo booleano `ok`.
 *
 * Portão: `src/utils/__tests__/levantamento-de-barras.test.ts`. Mutações:
 * `scripts/harness/levantamento-de-barras/`.
 */
import { avaliarTipologia, faltaDoVidroSemBaguete, type AvisoDoAvaliador, type FaltaDoAvaliador, type InsumoAvaliado, type Tipologia, type VidroAvaliado } from './avaliador-de-formulas'
import { agruparEmBarras, milimetrosDaBarra, type BarraDoCodigo, type ResultadoDoCodigo, type TotalDoLevantamento } from './agrupador-de-barras'
import { GRUPO_DE_COR, candidatasDoDegrau, resolverReferencia, type ComoAchou, type CorDoFornecedor } from './resolucao-de-referencia'


// ── A entrada ─────────────────────────────────────────────────────────────────────────────
export type EsquadriaDoLevantamento = {
    tipologia: string
    L_mm: number
    H_mm: number
    quantidade: number
    escolhas?: Readonly<Record<string, number>>
    espessura_vidro_mm?: number | null
}
/** Uma linha de `orcamentista_motor_regra`, só com o que a ponte lê — e a descrição, que a resolução de referência compara. */
export type RegraDoDePara = { codigo: string; codigo_wvetro: string; cor: string | null; descricao?: string | null }
/** Uma linha de `orcamentista_tabela_item`, só com o que a barra e o preço leem. */
export type ItemDaTabela = {
    codigo: string
    descricao?: string | null
    medida_barra_m: number | null
    valor_barra_interno: number | null
    valor_metro_interno: number | null
    /** A unidade e o bloco tributário: o cálculo das barras não os lê; o custo do orçamento I.A. por item, sim. Ausente é nulo. */
    unidade?: string | null
    /** O custo do item: o bruto da UNIDADE do insumo e do m² do vidro (dono do produto, 12/11/2026: "para item vendido por unidade, o bruto é `custo`"). */
    custo?: number | null
    cred_icms_pct?: number | null
    cred_pis_cofins_pct?: number | null
    cred_ipi_pct?: number | null
    nc_ipi_pct?: number | null
    cred_ibs_pct?: number | null
    cred_cbs_pct?: number | null
}
export type EntradaDoLevantamento = {
    /** A cor do perfil, comparada EXATA com a coluna `cor` do motor. Obrigatória: sem default. */
    cor: string
    esquadrias: readonly EsquadriaDoLevantamento[]
    tipologias: Readonly<Record<string, Tipologia>>
    regras: readonly RegraDoDePara[]
    itens: readonly ItemDaTabela[]
    serra_mm: number
    /** A tabela de cores do fornecedor do motor (`orcamentista_fornecedor_cor`); vazia = o degrau "código + cor" não acha nada. */
    cores?: readonly CorDoFornecedor[]
}

// ── A saída ───────────────────────────────────────────────────────────────────────────────
export type PecaDaEsquadria = {
    perfil: string
    codigo: string
    descricao: string
    comprimento_mm: number
    quantidade_por_esquadria: number
    /** quantidade_por_esquadria × a quantidade da esquadria */
    quantidade: number
}
export type EsquadriaLevantada = {
    indice: number
    tipologia: string
    L_mm: number
    H_mm: number
    quantidade: number
    pecas: PecaDaEsquadria[]
    avisos: AvisoDoAvaliador[]
    /** Os insumos e os panos de vidro da esquadria, pela avaliação (12/11/2026), por UNIDADE da esquadria; a quantidade multiplica no custo. */
    insumos: InsumoAvaliado[]
    vidros: VidroAvaliado[]
    /** As linhas de insumo ou de vidro que não se avaliaram: falta nomeada, que não recusa. */
    faltasDoAvaliador: FaltaDoAvaliador[]
}
/**
 * A FALTA DE PREÇO (12/11/2026): não recusa; diz o que falta, onde, e por quê. Uma por (peça, esquadria). `codigo_do_motor` é o código como o
 * motor o escreve (o perfil `SF92/WOLFF`, o insumo, ou VIDRO); `descricao_do_motor`, a descrição que o motor dá; `cor`, a cor pedida.
 */
export type CaminhoDoCusto = 'perfil' | 'insumo' | 'vidro'
export type FaltaDePreco = {
    caminho: CaminhoDoCusto
    codigo_do_motor: string
    descricao_do_motor: string | null
    cor: string | null
    tipologia: string
    esquadria: number
    motivo: string
    frase: string
    candidatas: Array<{ codigo: string; descricao: string | null }>
}
export type CodigoLevantado = ResultadoDoCodigo & { perfil: string; descricao: string | null }
export type CandidatoDoCodigo = { codigo: string; descricao: string | null; valor_barra_interno: number | null; valor_metro_interno: number | null }
export type OrigemDaRecusa = 'ESQUADRIA' | 'AVALIADOR' | 'CODIGO' | 'ITEM' | 'AGRUPADOR'
/** O atributo da esquadria que, trocado, resolve a falta, e o valor que resolve. */
export type CaminhoDaFalta = { atributo: 'ESPESSURA_DO_VIDRO'; espessura_mm: number }

/**
 * A espessura que o caminho sugere: a menor das aceitas que não é menor que a pedida (4 → 5); acima de todas, a maior; sem espessura dita, a
 * menor. É exemplo de frase que resolve — o vendedor diz a que quer.
 */
export function espessuraSugerida(pedida: number | null, aceitas: readonly number[]): number | null {
    const ordem = [...new Set(aceitas)].sort((a, b) => a - b)
    if (ordem.length === 0) return null
    if (pedida === null) return ordem[0]
    return ordem.find((e) => e >= pedida) ?? ordem[ordem.length - 1]
}

export type RecusaDoLevantamento = {
    origem: OrigemDaRecusa
    motivo: string
    mensagem: string
    /**
     * O QUE FALTA, curto, na linguagem do vendedor e sem a esquadria (dono do produto, 08/11/2026: "Não consegui fechar o levantamento <nome>.
     * Falta: <o que falta>."): "o valor da barra do código 1023, perfil 1023/WOLFF". Quem monta a resposta põe as esquadrias depois, entre
     * parênteses. Obrigatório: toda recusa diz o que falta (`construtor-empobrecido.md`).
     */
    falta: string
    /**
     * O CAMINHO DE ALTERAÇÃO que resolve a falta (dono do produto, 08/11/2026): a mensagem ensina, em uma linha, a frase que o vendedor manda
     * ("Para trocar, diga: muda o vidro da esquadria 1 para 8 mm"). Só existe quando trocar um atributo da esquadria de fato resolve — hoje, a
     * espessura do vidro que nenhum baguete aceita, ou que não foi dita: a espessura sugerida é uma das que os baguetes aceitam. Nulo é "não há
     * caminho de alteração": a falta é de cadastro, de motor ou de configuração. Obrigatório (`construtor-empobrecido.md`).
     */
    caminho: CaminhoDaFalta | null
    /** As esquadrias (de 1 em diante) em que a mesma falta aparece. Vazia quando não é de esquadria. */
    esquadrias: number[]
    tipologia?: string
    perfil?: string
    /** A variável do motor onde a falta do AVALIADOR nasceu (06/11/2026, para o log por etapa): `AT`, `N`… Ausente quando não há. */
    variavel?: string
    cor?: string
    codigo?: string
    candidatos?: CandidatoDoCodigo[]
    variantes?: string[]
}
export type ResultadoDoLevantamento =
    | {
        ok: true
        cor: string
        esquadrias: EsquadriaLevantada[]
        por_codigo: CodigoLevantado[]
        /** Os dois totais, SÓ do que tem preço: o código sem preço é falta (`faltas`), e o total é parcial quando há falta (12/11/2026). */
        total: TotalDoLevantamento
        /** As faltas de preço, uma por (peça, esquadria): não recusam (12/11/2026). Vazia = nenhuma falta. */
        faltas: FaltaDePreco[]
        avisos: Array<AvisoDoAvaliador & { esquadria: number }>
        /**
         * A RESOLUÇÃO DE CADA CÓDIGO (12/11/2026): pelo código do motor, o item da tabela de onde veio o preço e COMO foi achado
         * (`resolucao-de-referencia.ts`). É o que a fotografia do material grava, para auditar como cada preço foi parar ali.
         */
        resolucoes: Record<string, { item: ItemDaTabela; como: ComoAchou }>
    }
    | { ok: false; recusas: RecusaDoLevantamento[] }

// ── O dinheiro, sem ICU ───────────────────────────────────────────────────────────────────
/** "R$ 1.055,25". Escrito à mão: o resultado de `toLocaleString` depende do ICU do ambiente. */
export function formatarReais(v: number | null | undefined): string {
    if (v === null || v === undefined || !Number.isFinite(v)) return 'sem valor'
    const centavos = Math.round(Math.abs(v) * 100)
    const inteiro = String(Math.floor(centavos / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    const resto = String(centavos % 100).padStart(2, '0')
    return `${v < 0 ? '−' : ''}R$ ${inteiro},${resto}`
}

// ── A ponte: (perfil, cor) → código do item ──────────────────────────────────────────────
const porTexto = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const distintos = (xs: string[]) => [...new Set(xs)].sort(porTexto)
const VAZIA = '(vazia)'
/** O candidato antes de a tabela de preço ser lida: a descrição e os valores entram em `completarDoisCodigos`. */
const soOCodigo = (codigo: string): CandidatoDoCodigo => ({ codigo, descricao: null, valor_barra_interno: null, valor_metro_interno: null })

type RecusaDaPonte = Omit<RecusaDoLevantamento, 'esquadrias' | 'mensagem'> & { texto: string }
export type ResultadoDaPonte =
    | { ok: true; codigo: string; origem: OrigemDoCodigo }
    | { ok: false; recusa: RecusaDoLevantamento }
type OrigemDoCodigo = 'COR' | 'SEM_VARIANTE'

/**
 * A variante do motor é a cor pedida? SEM CAIXA, e nada mais: nem acento, nem espaço (08/11/2026). `toUpperCase` sem locale — o
 * mapeamento de caixa do Unicode, que não depende do ICU do ambiente (í → Í, ç → Ç).
 */
const mesmaCor = (variante: string | null, pedida: string) => variante !== null && variante.toUpperCase() === pedida.toUpperCase()

function ponte(perfil: string, cor: string, regras: readonly RegraDoDePara[]): { ok: true; codigo: string; origem: OrigemDoCodigo } | { ok: false; recusa: RecusaDaPonte } {
    const linhas = regras.filter((r) => r.codigo_wvetro === perfil)
    if (!linhas.length) {
        return { ok: false, recusa: { origem: 'CODIGO', caminho: null, motivo: 'PERFIL_SEM_REGRA', perfil, cor,
            texto: `o perfil ${perfil} não está em nenhuma regra da tabela do fornecedor. Falta: o código do item de ${perfil}.`,
            falta: `o código do item do perfil ${perfil}: ele não está em nenhuma regra da tabela do fornecedor` } }
    }
    // a cor sem caixa — e só sem caixa (ver o cabeçalho): duas grafias que só a caixa distingue não se escolhem
    const daCorLinhas = linhas.filter((r) => mesmaCor(r.cor, cor))
    const grafias = distintos(daCorLinhas.map((r) => r.cor as string))
    if (grafias.length > 1) {
        return { ok: false, recusa: { origem: 'CODIGO', caminho: null, motivo: 'COR_EM_DUAS_GRAFIAS', perfil, cor, variantes: grafias,
            texto: `o perfil ${perfil} tem a cor ${cor} escrita de ${grafias.length} jeitos na tabela do fornecedor: ${grafias.slice(0, -1).join(', ')} e ${grafias[grafias.length - 1]}. Falta dizer qual delas é a cor pedida.`,
            falta: `dizer qual grafia da cor ${cor} vale para o perfil ${perfil}: ${grafias.slice(0, -1).join(', ')} ou ${grafias[grafias.length - 1]}` } }
    }
    const daCor = distintos(daCorLinhas.map((r) => r.codigo))
    if (daCor.length === 1) return { ok: true, codigo: daCor[0], origem: 'COR' }
    if (daCor.length > 1) return { ok: false, recusa: { origem: 'CODIGO', caminho: null, motivo: 'DOIS_CODIGOS', perfil, cor, texto: '', falta: '', candidatos: daCor.map(soOCodigo) } }
    if (linhas.every((r) => r.cor === null)) {
        const unicos = distintos(linhas.map((r) => r.codigo))
        if (unicos.length === 1) return { ok: true, codigo: unicos[0], origem: 'SEM_VARIANTE' }
        return { ok: false, recusa: { origem: 'CODIGO', caminho: null, motivo: 'DOIS_CODIGOS', perfil, cor, texto: '', falta: '', candidatos: unicos.map(soOCodigo) } }
    }
    // a cor pedida não está entre as variantes — também quando a variante é UMA só: ela só serve para a cor que é (08/11/2026)
    const variantes = distintos(linhas.map((r) => r.cor ?? VAZIA))
    return { ok: false, recusa: { origem: 'CODIGO', caminho: null, motivo: 'COR_SEM_CODIGO', perfil, cor, variantes,
        texto: `o perfil ${perfil} não tem código para a cor ${cor} na tabela do fornecedor; as variantes que existem são: ${variantes.join(', ')}. Falta: o código de ${perfil} em ${cor}.`,
        falta: `o código do perfil ${perfil} na cor ${cor} (o fornecedor tem: ${variantes.join(', ')})` } }
}

/** Os candidatos com descrição e valores, e a frase que nomeia os dois códigos e os dois valores. */
function completarDoisCodigos(r: RecusaDaPonte, itens: readonly ItemDaTabela[]): RecusaDaPonte {
    const candidatos = (r.candidatos ?? []).map((c) => {
        // o candidato pelo degrau da PONTE da mesma resolução do cálculo (nunca uma segunda busca à parte); só para mostrar os valores
        const achados = candidatasDoDegrau('ponte', { codigoDoMotor: r.perfil ?? c.codigo, codigoDaPonte: c.codigo, descricaoDoMotor: null, corPedida: null }, itens, { cores: [], grupoDeCor: GRUPO_DE_COR.perfil }).candidatas
        const it = achados.length === 1 ? achados[0] : undefined
        return { codigo: c.codigo, descricao: it?.descricao ?? null, valor_barra_interno: it?.valor_barra_interno ?? null, valor_metro_interno: it?.valor_metro_interno ?? null }
    })
    const lista = candidatos.map((c) => `${c.codigo} (${formatarReais(c.valor_barra_interno)} a barra)`)
    const juntos = lista.length > 1 ? `${lista.slice(0, -1).join(', ')} e ${lista[lista.length - 1]}` : lista.join('')
    return { ...r, candidatos,
        texto: `o perfil ${r.perfil} em ${r.cor} tem ${candidatos.length} códigos na tabela do fornecedor: ${juntos}. Um valor por código: falta dizer qual deles é a peça.`,
        falta: `dizer qual código é o perfil ${r.perfil} em ${r.cor}: ${lista.length > 1 ? `${lista.slice(0, -1).join(', ')} ou ${lista[lista.length - 1]}` : lista.join('')}` }
}

/** A ponte, para quem quer só o código de uma peça. A recusa sai sem esquadria. */
export function codigoDaPeca(perfil: string, cor: string, regras: readonly RegraDoDePara[], itens: readonly ItemDaTabela[] = []): ResultadoDaPonte {
    const p = ponte(perfil, cor, regras)
    if (!('recusa' in p)) return p
    const r = p.recusa.motivo === 'DOIS_CODIGOS' ? completarDoisCodigos(p.recusa, itens) : p.recusa
    const { texto, ...resto } = r
    return { ok: false, recusa: { ...resto, esquadrias: [], mensagem: maiuscula(texto) } }
}

// ── As frases ─────────────────────────────────────────────────────────────────────────────
const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
function listaDeNumeros(ns: number[]): string {
    return ns.length > 1 ? `${ns.slice(0, -1).join(', ')} e ${ns[ns.length - 1]}` : String(ns[0])
}
function prefixo(esquadrias: number[], tipologia?: string): string {
    if (!esquadrias.length) return ''
    const quem = esquadrias.length > 1 ? `Itens ${listaDeNumeros(esquadrias)}` : `Item ${esquadrias[0]}`
    return tipologia ? `${quem} (${tipologia}): ` : `${quem}: `
}

/** A espessura que não foi dita, curta: "a espessura do vidro: os baguetes desta tipologia dependem dela, e aceitam 5, 6 e 8 mm". */
export function faltaDaEspessuraNaoDita(aceitas: readonly number[]): string {
    const ns = [...new Set(aceitas)].sort((a, b) => a - b).map((n) => String(n).replace('.', ','))
    const lista = ns.length > 1 ? `${ns.slice(0, -1).join(', ')} e ${ns[ns.length - 1]}` : ns.join('')
    return ns.length ? `a espessura do vidro: os baguetes desta tipologia dependem dela, e aceitam ${lista} mm` : 'a espessura do vidro: os baguetes desta tipologia dependem dela'
}
function caminhoDoVidroSemBaguete(x: { motivo: string; espessura_vidro_mm?: number; espessuras_disponiveis_mm?: number[] }): CaminhoDaFalta | null {
    if (x.motivo !== 'NENHUM_BAGUETE_PARA_A_ESPESSURA' || x.espessura_vidro_mm === undefined || x.espessuras_disponiveis_mm === undefined) return null
    const sugerida = espessuraSugerida(x.espessura_vidro_mm, x.espessuras_disponiveis_mm)
    return sugerida === null ? null : { atributo: 'ESPESSURA_DO_VIDRO', espessura_mm: sugerida }
}

// ── O levantamento ────────────────────────────────────────────────────────────────────────
const ORDEM_DA_ORIGEM: Record<OrigemDaRecusa, number> = { ESQUADRIA: 0, AVALIADOR: 1, CODIGO: 2, ITEM: 3, AGRUPADOR: 4 }

type RecusaParcial = Omit<RecusaDoLevantamento, 'mensagem' | 'esquadrias'> & { texto: string; esquadria?: number; comTipologia?: boolean }

export function levantarBarras(entrada: EntradaDoLevantamento): ResultadoDoLevantamento {
    const cor = entrada.cor
    const parciais: RecusaParcial[] = []

    // 1. cada esquadria pelo avaliador
    type PecaBruta = { esquadria: number; perfil: string; descricao: string; comprimento_mm: number; quantidade_por_esquadria: number; quantidade: number }
    const brutas: PecaBruta[] = []
    const levantadas: Array<Omit<EsquadriaLevantada, 'pecas'>> = []
    entrada.esquadrias.forEach((e, k) => {
        const indice = k + 1
        if (!Number.isInteger(e.quantidade) || e.quantidade <= 0) {
            parciais.push({ origem: 'ESQUADRIA', caminho: null, motivo: 'QUANTIDADE_DA_ESQUADRIA_INVALIDA', tipologia: e.tipologia, esquadria: indice, comTipologia: true,
                texto: `a quantidade ${e.quantidade} não é válida: tem de ser um inteiro positivo.`, falta: `a quantidade do item: ${e.quantidade} não é um inteiro positivo` })
            return
        }
        const tipologia = Object.prototype.hasOwnProperty.call(entrada.tipologias, e.tipologia) ? entrada.tipologias[e.tipologia] : undefined
        if (!tipologia) {
            parciais.push({ origem: 'ESQUADRIA', caminho: null, motivo: 'TIPOLOGIA_SEM_DEFINICAO', tipologia: e.tipologia, esquadria: indice, comTipologia: true,
                texto: `a tipologia ${e.tipologia} não tem definição (abas do motor) neste levantamento. Falta: a tipologia ${e.tipologia}.`, falta: `a definição da tipologia ${e.tipologia} no motor` })
            return
        }
        const r = avaliarTipologia({ tipologia, L_mm: e.L_mm, H_mm: e.H_mm, escolhas: e.escolhas, espessura_vidro_mm: e.espessura_vidro_mm })
        if ('recusas' in r) {
            // A ESPESSURA QUE NÃO FOI DITA, uma falta só (08/11/2026): o avaliador recusa linha a linha da aba Perfis (uma por baguete), e para o
            // vendedor é UMA coisa que falta — a espessura do vidro, com as que os baguetes da tipologia aceitam
            const semEspessura = r.recusas.filter((x) => x.motivo === 'ESPESSURA_DO_VIDRO_AUSENTE')
            if (semEspessura.length) {
                const aceitas = [...new Set(semEspessura.flatMap((x) => x.espessuras_disponiveis_mm ?? []))]
                const sugerida = espessuraSugerida(null, aceitas)
                const falta = faltaDaEspessuraNaoDita(aceitas)
                parciais.push({ origem: 'AVALIADOR', motivo: 'ESPESSURA_DO_VIDRO_AUSENTE', tipologia: e.tipologia, esquadria: indice, comTipologia: true, texto: falta, falta,
                    caminho: sugerida === null ? null : { atributo: 'ESPESSURA_DO_VIDRO', espessura_mm: sugerida } })
            }
            for (const x of r.recusas.filter((y) => y.motivo !== 'ESPESSURA_DO_VIDRO_AUSENTE')) {
                parciais.push({ origem: 'AVALIADOR', motivo: x.motivo, tipologia: e.tipologia, perfil: x.perfil, ...(x.variavel !== undefined ? { variavel: x.variavel } : {}), esquadria: indice, comTipologia: true, texto: x.mensagem,
                    // o vidro sem baguete é falta CURTA, na linguagem do vendedor (08/11/2026); as outras recusas do motor são técnicas, e vão inteiras
                    falta: x.motivo === 'NENHUM_BAGUETE_PARA_A_ESPESSURA' && x.espessura_vidro_mm !== undefined && x.espessuras_disponiveis_mm !== undefined
                        ? faltaDoVidroSemBaguete(x.espessura_vidro_mm, x.espessuras_disponiveis_mm) : x.mensagem,
                    // trocar a espessura do vidro resolve: o caminho sugere uma das aceitas
                    caminho: caminhoDoVidroSemBaguete(x) })
            }
            return
        }
        levantadas.push({ indice, tipologia: e.tipologia, L_mm: e.L_mm, H_mm: e.H_mm, quantidade: e.quantidade, avisos: r.avisos,
            insumos: r.insumos, vidros: r.vidros, faltasDoAvaliador: r.faltas })
        for (const p of r.pecas) {
            brutas.push({ esquadria: indice, perfil: p.codigo, descricao: p.descricao, comprimento_mm: p.comprimento_mm,
                quantidade_por_esquadria: p.quantidade, quantidade: p.quantidade * e.quantidade })
        }
    })

    // 2 e 3. a ponte e a RESOLUÇÃO, uma vez por perfil (12/11/2026): a ponte é o primeiro degrau; sem ela, a escada segue. O que não acha preço
    //    é FALTA (não recusa): as peças dele ficam fora do agrupador e do custo
    const perfis = distintos(brutas.map((p) => p.perfil))
    const codigoDoPerfil: Record<string, string> = {}
    const itemDoCodigo: Record<string, ItemDaTabela> = {}
    const resolucoes: Record<string, { item: ItemDaTabela; como: ComoAchou }> = {}
    const faltas: FaltaDePreco[] = []
    const tipologiaDa = new Map(levantadas.map((l) => [l.indice, l.tipologia]))
    const contexto = { cores: entrada.cores ?? [], grupoDeCor: GRUPO_DE_COR.perfil }
    for (const perfil of perfis) {
        const daPeca = brutas.filter((b) => b.perfil === perfil)
        const esquadrias = [...new Set(daPeca.map((b) => b.esquadria))]
        const descricao = daPeca[0]?.descricao?.trim() || null
        const faltar = (motivo: string, frase: string, candidatas: Array<{ codigo: string; descricao: string | null }> = []) => {
            for (const esquadria of esquadrias) faltas.push({ caminho: 'perfil', codigo_do_motor: perfil, descricao_do_motor: descricao, cor, tipologia: tipologiaDa.get(esquadria) ?? '', esquadria, motivo, frase, candidatas })
        }
        const p = ponte(perfil, cor, entrada.regras)
        let codigoDaPonte: string | null = null
        if (!('recusa' in p)) codigoDaPonte = p.codigo
        else if (p.recusa.motivo === 'COR_EM_DUAS_GRAFIAS') { for (const esquadria of esquadrias) parciais.push({ ...p.recusa, esquadria }); continue }
        else if (p.recusa.motivo === 'DOIS_CODIGOS') {
            const r = completarDoisCodigos(p.recusa, entrada.itens)
            faltar('PONTE_AMBIGUA', r.texto, (r.candidatos ?? []).map((c) => ({ codigo: c.codigo, descricao: c.descricao })))
            continue
        }
        const r = resolverReferencia({ codigoDoMotor: perfil, codigoDaPonte, descricaoDoMotor: descricao, corPedida: cor }, entrada.itens, contexto)
        if (!('item' in r)) {
            faltar(r.motivo, `${maiuscula(r.frase)}.`, r.candidatas.map((c) => ({ codigo: c.item.codigo, descricao: c.item.descricao ?? null })))
            continue
        }
        const it = r.item
        // zero é valor; ausente é falta (`ausente-vs-falso.md`)
        const semValor = ([['valor_barra_interno', 'da barra'], ['valor_metro_interno', 'do metro']] as const).filter(([campo]) => !Number.isFinite(it[campo] as number))
        if (semValor.length) {
            faltar('SEM_VALOR', `o item ${it.codigo} da tabela de preço (achado para ${perfil}${descricao ? `, ${descricao}` : ''}, pela ${r.como.replace('_', ' ')}) está sem o valor ${semValor.map(([, n]) => n).join(' e sem o valor ')}.`)
            continue
        }
        const codigo = codigoDaPonte !== null && r.como === 'ponte' ? codigoDaPonte : it.codigo
        codigoDoPerfil[perfil] = codigo
        itemDoCodigo[codigo] = it
        resolucoes[codigo] = { item: it, como: r.como }
    }

    // 4. o agrupador, com as peças que têm código e item — mesmo havendo recusa, para que as dele
    //    também saiam de uma vez. O resultado dele só é devolvido se não houver recusa nenhuma.
    const perfilDoCodigo: Record<string, string> = {}
    for (const perfil of perfis) if (codigoDoPerfil[perfil] !== undefined) perfilDoCodigo[codigoDoPerfil[perfil]] = perfil
    const prontas = brutas.filter((b) => itemDoCodigo[codigoDoPerfil[b.perfil]] !== undefined)
    const barras: Record<string, BarraDoCodigo> = {}
    for (const [codigo, it] of Object.entries(itemDoCodigo)) {
        barras[codigo] = { comprimento_mm: milimetrosDaBarra(it.medida_barra_m), valor_barra_interno: it.valor_barra_interno, valor_metro_interno: it.valor_metro_interno }
    }
    const agrupado = agruparEmBarras({
        pecas: prontas.map((b) => ({ codigo: codigoDoPerfil[b.perfil], comprimento_mm: b.comprimento_mm, quantidade: b.quantidade })),
        barras,
        serra_mm: entrada.serra_mm,
    })
    if ('recusas' in agrupado) {
        // a peça maior que a barra é UMA falta por código, com a MAIOR peça dele: cada peça a mais é a mesma barra que falta (08/11/2026)
        const maiorPeca = new Map<string, number>()
        for (const x of agrupado.recusas) if (x.motivo === 'PECA_MAIOR_QUE_A_BARRA') maiorPeca.set(x.codigo, Math.max(maiorPeca.get(x.codigo) ?? 0, x.comprimento_peca_mm))
        for (const x of agrupado.recusas) {
            if (x.motivo === 'PECA_MAIOR_QUE_A_BARRA' && x.comprimento_peca_mm !== maiorPeca.get(x.codigo)) continue
            const perfil = x.codigo !== undefined ? perfilDoCodigo[x.codigo] : undefined
            const esquadrias = perfil ? [...new Set(prontas.filter((b) => b.perfil === perfil).map((b) => b.esquadria))] : []
            const texto = perfil ? `${x.mensagem} (perfil ${perfil})` : x.mensagem
            // o que chega ao vendedor, curto (08/11/2026): a barra sem comprimento e a peça maior que a barra; as outras são guardas internas
            const doCodigo = perfil ? `do código ${x.codigo}, perfil ${perfil}` : `do código ${x.codigo}`
            const mm = (n: number) => `${String(Math.round(n * 10) / 10).replace('.', ',')} mm`
            const falta = x.motivo === 'BARRA_SEM_COMPRIMENTO' ? `o comprimento da barra ${doCodigo}, na tabela de preço`
                : x.motivo === 'PECA_MAIOR_QUE_A_BARRA' ? `uma barra em que caiba a maior peça ${doCodigo}: a peça tem ${mm(x.comprimento_peca_mm)} e a barra, ${mm(x.comprimento_barra_mm)}`
                    : texto
            if (!esquadrias.length) parciais.push({ origem: 'AGRUPADOR', caminho: null, motivo: x.motivo, codigo: x.codigo, perfil, texto, falta })
            for (const esquadria of esquadrias) parciais.push({ origem: 'AGRUPADOR', caminho: null, motivo: x.motivo, codigo: x.codigo, perfil, esquadria, texto, falta })
        }
    }

    // as recusas do agrupador já estão em `parciais`; a segunda condição só estreita o tipo
    if (parciais.length || 'recusas' in agrupado) return { ok: false, recusas: juntar(parciais) }

    // 5. o resultado — só os códigos com os dois valores; os outros são falta (passo 3), e as peças deles não entram nas barras
    const esquadrias: EsquadriaLevantada[] = levantadas.map((e) => ({
        ...e,
        pecas: brutas.filter((b) => b.esquadria === e.indice && codigoDoPerfil[b.perfil] !== undefined).map((b) => ({
            perfil: b.perfil, codigo: codigoDoPerfil[b.perfil], descricao: b.descricao, comprimento_mm: b.comprimento_mm,
            quantidade_por_esquadria: b.quantidade_por_esquadria, quantidade: b.quantidade,
        })),
    }))
    return {
        ok: true,
        cor,
        esquadrias,
        por_codigo: agrupado.por_codigo.map((c) => ({ ...c, perfil: perfilDoCodigo[c.codigo], descricao: itemDoCodigo[c.codigo].descricao ?? null })),
        total: agrupado.total,
        avisos: levantadas.flatMap((e) => e.avisos.map((a) => ({ ...a, esquadria: e.indice }))),
        faltas,
        resolucoes,
    }
}

/**
 * A mesma falta em várias esquadrias sai UMA vez, com as esquadrias juntas; a ordem não depende da
 * ordem da entrada: origem, depois perfil, tipologia e código por texto, depois motivo e frase.
 */
function juntar(parciais: RecusaParcial[]): RecusaDoLevantamento[] {
    const chave = (p: RecusaParcial) => JSON.stringify([p.origem, p.motivo, p.tipologia ?? '', p.perfil ?? '', p.codigo ?? '', p.texto])
    const grupos: Array<{ base: RecusaParcial; esquadrias: number[] }> = []
    for (const p of parciais) {
        const g = grupos.find((x) => chave(x.base) === chave(p))
        if (g) { if (p.esquadria !== undefined && !g.esquadrias.includes(p.esquadria)) g.esquadrias.push(p.esquadria) }
        else grupos.push({ base: p, esquadrias: p.esquadria !== undefined ? [p.esquadria] : [] })
    }
    const recusas = grupos.map(({ base, esquadrias }) => {
        const { texto, esquadria: _e, comTipologia, ...resto } = base
        void _e
        const ordenadas = [...esquadrias].sort((a, b) => a - b)
        const p = prefixo(ordenadas, comTipologia ? base.tipologia : undefined)
        return { ...resto, esquadrias: ordenadas, mensagem: p ? p + texto : maiuscula(texto) }
    })
    recusas.sort((a, b) => ORDEM_DA_ORIGEM[a.origem] - ORDEM_DA_ORIGEM[b.origem]
        || porTexto(a.perfil ?? '', b.perfil ?? '') || porTexto(a.tipologia ?? '', b.tipologia ?? '')
        || porTexto(a.codigo ?? '', b.codigo ?? '') || porTexto(a.motivo, b.motivo) || porTexto(a.mensagem, b.mensagem))
    return recusas
}
