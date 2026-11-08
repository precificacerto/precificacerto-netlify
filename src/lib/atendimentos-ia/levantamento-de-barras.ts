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
 * FALTOU PREÇO, NADA EVOLUI (dono do produto, 08/11/2026 — substitui "o preço ausente não trava as barras", de 24/10/2026): o item
 * sem o valor da barra ou sem o valor do metro é RECUSA (`ITEM_SEM_VALOR`), como o item ausente — e, como toda recusa, nenhuma barra
 * sai, de esquadria nenhuma, nem das completas. "A premissa é precificação precisa e minuciosa por item; um produto parcial seria um
 * preço que não corresponde à obra." A recusa nomeia o código interno e o perfil do fornecedor, para achar e corrigir o cadastro: a
 * regra de não mostrar código de fornecedor vale para a FOLHA, não para a mensagem de erro. Zero informado é valor, não falta
 * (`ausente-vs-falso.md`).
 *
 * Para separar as duas formas do resultado, use `'recusas' in r` (e `'recusa' in r` em `codigoDaPeca`):
 * com `strictNullChecks: false`, o tsc não estreita a união pelo booleano `ok`.
 *
 * Portão: `src/utils/__tests__/levantamento-de-barras.test.ts`. Mutações:
 * `scripts/harness/levantamento-de-barras/`.
 */
import { avaliarTipologia, faltaDoVidroSemBaguete, type AvisoDoAvaliador, type Tipologia } from './avaliador-de-formulas'
import { agruparEmBarras, milimetrosDaBarra, type BarraDoCodigo, type ResultadoDoCodigo, type TotalDoLevantamento } from './agrupador-de-barras'


// ── A entrada ─────────────────────────────────────────────────────────────────────────────
export type EsquadriaDoLevantamento = {
    tipologia: string
    L_mm: number
    H_mm: number
    quantidade: number
    escolhas?: Readonly<Record<string, number>>
    espessura_vidro_mm?: number | null
}
/** Uma linha de `orcamentista_motor_regra`, só com o que a ponte lê. */
export type RegraDoDePara = { codigo: string; codigo_wvetro: string; cor: string | null }
/** Uma linha de `orcamentista_tabela_item`, só com o que a barra e o preço leem. */
export type ItemDaTabela = {
    codigo: string
    descricao?: string | null
    medida_barra_m: number | null
    valor_barra_interno: number | null
    valor_metro_interno: number | null
}
export type EntradaDoLevantamento = {
    /** A cor do perfil, comparada EXATA com a coluna `cor` do motor. Obrigatória: sem default. */
    cor: string
    esquadrias: readonly EsquadriaDoLevantamento[]
    tipologias: Readonly<Record<string, Tipologia>>
    regras: readonly RegraDoDePara[]
    itens: readonly ItemDaTabela[]
    serra_mm: number
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
}
export type CodigoLevantado = ResultadoDoCodigo & { perfil: string; descricao: string | null }
export type CandidatoDoCodigo = { codigo: string; descricao: string | null; valor_barra_interno: number | null; valor_metro_interno: number | null }
export type OrigemDaRecusa = 'ESQUADRIA' | 'AVALIADOR' | 'CODIGO' | 'ITEM' | 'AGRUPADOR'
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
        /** Os dois totais sempre saem: o item sem valor é recusa (08/11/2026). */
        total: TotalDoLevantamento
        avisos: Array<AvisoDoAvaliador & { esquadria: number }>
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
        return { ok: false, recusa: { origem: 'CODIGO', motivo: 'PERFIL_SEM_REGRA', perfil, cor,
            texto: `o perfil ${perfil} não está em nenhuma regra da tabela do fornecedor. Falta: o código do item de ${perfil}.`,
            falta: `o código do item do perfil ${perfil}: ele não está em nenhuma regra da tabela do fornecedor` } }
    }
    // a cor sem caixa — e só sem caixa (ver o cabeçalho): duas grafias que só a caixa distingue não se escolhem
    const daCorLinhas = linhas.filter((r) => mesmaCor(r.cor, cor))
    const grafias = distintos(daCorLinhas.map((r) => r.cor as string))
    if (grafias.length > 1) {
        return { ok: false, recusa: { origem: 'CODIGO', motivo: 'COR_EM_DUAS_GRAFIAS', perfil, cor, variantes: grafias,
            texto: `o perfil ${perfil} tem a cor ${cor} escrita de ${grafias.length} jeitos na tabela do fornecedor: ${grafias.slice(0, -1).join(', ')} e ${grafias[grafias.length - 1]}. Falta dizer qual delas é a cor pedida.`,
            falta: `dizer qual grafia da cor ${cor} vale para o perfil ${perfil}: ${grafias.slice(0, -1).join(', ')} ou ${grafias[grafias.length - 1]}` } }
    }
    const daCor = distintos(daCorLinhas.map((r) => r.codigo))
    if (daCor.length === 1) return { ok: true, codigo: daCor[0], origem: 'COR' }
    if (daCor.length > 1) return { ok: false, recusa: { origem: 'CODIGO', motivo: 'DOIS_CODIGOS', perfil, cor, texto: '', falta: '', candidatos: daCor.map(soOCodigo) } }
    if (linhas.every((r) => r.cor === null)) {
        const unicos = distintos(linhas.map((r) => r.codigo))
        if (unicos.length === 1) return { ok: true, codigo: unicos[0], origem: 'SEM_VARIANTE' }
        return { ok: false, recusa: { origem: 'CODIGO', motivo: 'DOIS_CODIGOS', perfil, cor, texto: '', falta: '', candidatos: unicos.map(soOCodigo) } }
    }
    // a cor pedida não está entre as variantes — também quando a variante é UMA só: ela só serve para a cor que é (08/11/2026)
    const variantes = distintos(linhas.map((r) => r.cor ?? VAZIA))
    return { ok: false, recusa: { origem: 'CODIGO', motivo: 'COR_SEM_CODIGO', perfil, cor, variantes,
        texto: `o perfil ${perfil} não tem código para a cor ${cor} na tabela do fornecedor; as variantes que existem são: ${variantes.join(', ')}. Falta: o código de ${perfil} em ${cor}.`,
        falta: `o código do perfil ${perfil} na cor ${cor} (o fornecedor tem: ${variantes.join(', ')})` } }
}

/** Os candidatos com descrição e valores, e a frase que nomeia os dois códigos e os dois valores. */
function completarDoisCodigos(r: RecusaDaPonte, itens: readonly ItemDaTabela[]): RecusaDaPonte {
    const candidatos = (r.candidatos ?? []).map((c) => {
        const it = itens.find((i) => i.codigo === c.codigo)
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
    const quem = esquadrias.length > 1 ? `Esquadrias ${listaDeNumeros(esquadrias)}` : `Esquadria ${esquadrias[0]}`
    return tipologia ? `${quem} (${tipologia}): ` : `${quem}: `
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
            parciais.push({ origem: 'ESQUADRIA', motivo: 'QUANTIDADE_DA_ESQUADRIA_INVALIDA', tipologia: e.tipologia, esquadria: indice, comTipologia: true,
                texto: `a quantidade ${e.quantidade} não é válida: tem de ser um inteiro positivo.`, falta: `a quantidade da esquadria: ${e.quantidade} não é um inteiro positivo` })
            return
        }
        const tipologia = Object.prototype.hasOwnProperty.call(entrada.tipologias, e.tipologia) ? entrada.tipologias[e.tipologia] : undefined
        if (!tipologia) {
            parciais.push({ origem: 'ESQUADRIA', motivo: 'TIPOLOGIA_SEM_DEFINICAO', tipologia: e.tipologia, esquadria: indice, comTipologia: true,
                texto: `a tipologia ${e.tipologia} não tem definição (abas do motor) neste levantamento. Falta: a tipologia ${e.tipologia}.`, falta: `a definição da tipologia ${e.tipologia} no motor` })
            return
        }
        const r = avaliarTipologia({ tipologia, L_mm: e.L_mm, H_mm: e.H_mm, escolhas: e.escolhas, espessura_vidro_mm: e.espessura_vidro_mm })
        if ('recusas' in r) {
            for (const x of r.recusas) {
                parciais.push({ origem: 'AVALIADOR', motivo: x.motivo, tipologia: e.tipologia, perfil: x.perfil, ...(x.variavel !== undefined ? { variavel: x.variavel } : {}), esquadria: indice, comTipologia: true, texto: x.mensagem,
                    // o vidro sem baguete é falta CURTA, na linguagem do vendedor (08/11/2026); as outras recusas do motor são técnicas, e vão inteiras
                    falta: x.motivo === 'NENHUM_BAGUETE_PARA_A_ESPESSURA' && x.espessura_vidro_mm !== undefined && x.espessuras_disponiveis_mm !== undefined
                        ? faltaDoVidroSemBaguete(x.espessura_vidro_mm, x.espessuras_disponiveis_mm) : x.mensagem })
            }
            return
        }
        levantadas.push({ indice, tipologia: e.tipologia, L_mm: e.L_mm, H_mm: e.H_mm, quantidade: e.quantidade, avisos: r.avisos })
        for (const p of r.pecas) {
            brutas.push({ esquadria: indice, perfil: p.codigo, descricao: p.descricao, comprimento_mm: p.comprimento_mm,
                quantidade_por_esquadria: p.quantidade, quantidade: p.quantidade * e.quantidade })
        }
    })

    // 2. a ponte, uma vez por perfil
    const perfis = distintos(brutas.map((p) => p.perfil))
    const codigoDoPerfil: Record<string, string> = {}
    for (const perfil of perfis) {
        const p = ponte(perfil, cor, entrada.regras)
        const esquadrias = [...new Set(brutas.filter((b) => b.perfil === perfil).map((b) => b.esquadria))]
        if (!('recusa' in p)) { codigoDoPerfil[perfil] = p.codigo; continue }
        const r = p.recusa.motivo === 'DOIS_CODIGOS' ? completarDoisCodigos(p.recusa, entrada.itens) : p.recusa
        for (const esquadria of esquadrias) parciais.push({ ...r, esquadria })
    }

    // 3. o item de cada código: existe, e numa linha só
    const itemDoCodigo: Record<string, ItemDaTabela> = {}
    for (const perfil of perfis) {
        const codigo = codigoDoPerfil[perfil]
        if (codigo === undefined) continue
        const linhas = entrada.itens.filter((i) => i.codigo === codigo)
        const esquadrias = [...new Set(brutas.filter((b) => b.perfil === perfil).map((b) => b.esquadria))]
        if (linhas.length === 1) {
            // FALTOU PREÇO, NADA EVOLUI (08/11/2026): o item sem um dos valores é recusa, como o item ausente — zero é valor
            const it = linhas[0]
            const semValor = ([['valor_barra_interno', 'da barra'], ['valor_metro_interno', 'do metro']] as const).filter(([campo]) => !Number.isFinite(it[campo] as number))
            for (const [, nome] of semValor) {
                for (const esquadria of esquadrias) parciais.push({ origem: 'ITEM', motivo: 'ITEM_SEM_VALOR', perfil, cor, codigo, esquadria,
                    texto: `o código ${codigo} (perfil ${perfil}) está na tabela de preço sem o valor ${nome}. Falta: o valor ${nome} de ${codigo}.`,
                    falta: `o valor ${nome} do código ${codigo}, perfil ${perfil}, na tabela de preço` })
            }
            itemDoCodigo[codigo] = it
            continue
        }
        const motivo = linhas.length === 0 ? 'ITEM_AUSENTE' : 'ITEM_EM_DUAS_LINHAS'
        const texto = linhas.length === 0
            ? `o código ${codigo} (perfil ${perfil}) não está na tabela de preço. Falta: o item ${codigo}, com a barra e o valor.`
            : `o código ${codigo} (perfil ${perfil}) está em ${linhas.length} linhas da tabela de preço, com ${linhas.map((l) => formatarReais(l.valor_barra_interno)).join(' e ')} a barra. Um valor por código: falta dizer qual linha vale.`
        const falta = linhas.length === 0
            ? `o código ${codigo}, perfil ${perfil}, na tabela de preço, com a barra e o valor`
            : `dizer qual linha da tabela de preço vale para o código ${codigo}, perfil ${perfil}: ${linhas.map((l) => formatarReais(l.valor_barra_interno)).join(' ou ')} a barra`
        for (const esquadria of esquadrias) parciais.push({ origem: 'ITEM', motivo, perfil, cor, codigo, esquadria, texto, falta })
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
        for (const x of agrupado.recusas) {
            const perfil = x.codigo !== undefined ? perfilDoCodigo[x.codigo] : undefined
            const esquadrias = perfil ? [...new Set(prontas.filter((b) => b.perfil === perfil).map((b) => b.esquadria))] : []
            const texto = perfil ? `${x.mensagem} (perfil ${perfil})` : x.mensagem
            if (!esquadrias.length) parciais.push({ origem: 'AGRUPADOR', motivo: x.motivo, codigo: x.codigo, perfil, texto, falta: texto })
            for (const esquadria of esquadrias) parciais.push({ origem: 'AGRUPADOR', motivo: x.motivo, codigo: x.codigo, perfil, esquadria, texto, falta: texto })
        }
    }

    // as recusas do agrupador já estão em `parciais`; a segunda condição só estreita o tipo
    if (parciais.length || 'recusas' in agrupado) return { ok: false, recusas: juntar(parciais) }

    // 5. o resultado — todo código com os dois valores (o que não tem já é recusa, no passo 3)
    const esquadrias: EsquadriaLevantada[] = levantadas.map((e) => ({
        ...e,
        pecas: brutas.filter((b) => b.esquadria === e.indice).map((b) => ({
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
