/**
 * Atendimentos I.A. — a PRÉ-DEFINIÇÃO que a conversa levanta: os campos, a ordem em que são
 * perguntados, e a VALIDAÇÃO do que a LLM propõe. Funções puras: não leem banco nem rede.
 *
 * A regra que não se negocia: a LLM PROPÕE, quem chama isto VALIDA e GRAVA. Nada aqui confia no
 * que a LLM devolveu — nem o tipo, nem a faixa, nem as chaves.
 *
 * Os campos são os da maquete aprovada e as colunas de `orcamentista_pre_definicao`, e só eles.
 * Portão: `src/utils/__tests__/atendimentos-ia-conversa-da-ia.test.ts`.
 */

// ── O TIPO DE EDIFICAÇÃO ────────────────────────────────────────────────────────────────────
/**
 * O conjunto FECHADO de `tipo_edificacao` (dono do produto, 22/10/2026).
 *
 * ATENÇÃO AO SENTIDO, que o nome não carrega:
 *   - CASA significa, NESTE DOMÍNIO, edificação de UM pavimento. Uma casa de dois pavimentos é
 *     SOBRADO. Não deduza pelo nome que "casa" pode ter mais de um andar: aqui não pode;
 *   - SOBRADO, PREDIO e MULTIFAMILIAR são os de MAIS DE UM pavimento, e são os ÚNICOS que disparam
 *     a pergunta da distribuição por pavimento.
 * Está escrito porque já houve coluna cujo nome prometia mais do que ela sabia
 * (`whatsapp_conexao.ativo`). Mudar este conjunto muda quais conversas perguntam a distribuição.
 */
export const TIPOS_DE_EDIFICACAO = ['CASA', 'SOBRADO', 'PREDIO', 'MULTIFAMILIAR'] as const
export type TipoDeEdificacao = (typeof TIPOS_DE_EDIFICACAO)[number]

/** Os de MAIS DE UM pavimento — os únicos que perguntam a distribuição. CASA não está aqui. */
export const TIPOS_COM_MAIS_DE_UM_PAVIMENTO: readonly TipoDeEdificacao[] = ['SOBRADO', 'PREDIO', 'MULTIFAMILIAR']

// ── OS CAMPOS, NA ORDEM EM QUE SÃO PERGUNTADOS ─────────────────────────────────────────────
/** 6 de produto e 3 de entrega — a distribuição só existe com mais de um pavimento. */
export const CAMPOS_DA_PRE_DEFINICAO = [
    'tipologia', 'largura_mm', 'altura_mm', 'quantidade', 'cor_perfil', 'vidro',
    'local', 'tipo_edificacao', 'distribuicao_por_pavimento',
] as const
export type CampoDaPreDefinicao = (typeof CAMPOS_DA_PRE_DEFINICAO)[number]

export type EstadoDosCampos = Record<CampoDaPreDefinicao, unknown>

/** `estado` da pré-definição (dono do produto, 22/10/2026). A coluna é texto, sem CHECK. */
export const EM_COLETA = 'EM_COLETA'
export const COMPLETA = 'COMPLETA'

/**
 * A TIPOLOGIA SE PERGUNTA EM LINGUAGEM DE OBRA (dono do produto, 03/11/2026): "o código NUNCA manda 'Qual a tipologia
 * das esquadrias?'. Quando a tipologia está vazia, a pergunta é em linguagem de obra [...] e quem conclui a tipologia é o agente. O vendedor
 * não conhece os códigos."
 *
 * E SÓ O QUE NÃO TEM NATURAL (dono do produto, 11/11/2026: "silêncio não é dúvida: é a forma natural"). O vendedor sempre traz o TIPO; o que vem
 * depois dele tem natural e não se pergunta — folhas (correr = 2), módulos (maxim-ar = 1), persiana, bandeira, peitoril (sem, salvo se dito;
 * `tipologia-padrao.ts`). Saíram daqui "tem persiana?", "bandeira ou peitoril fixo?" e "quantas folhas?". Sobram a ABERTURA (janela ou porta:
 * é outro produto) e o TIPO (como abre), que não se adivinham.
 *
 * A primeira é a da pendência. As outras são a REFORMULAÇÃO, quando a resposta do vendedor não coube no campo e a IA
 * não trouxe uma pergunta dela: "reformule a pergunta em outras palavras em vez de repetir" — nunca o "Não consegui
 * registrar a sua resposta" com a mesma frase (`conversa-da-ia.ts`, `outraPergunta`).
 */
export const PERGUNTAS_DA_TIPOLOGIA = [
    'É janela ou porta? E como ela abre: de correr, de abrir, maxim-ar, pivotante ou fixa?',
    'Me descreva o item como ele é na obra: janela ou porta, e como abre (correr, abrir, maxim-ar, pivotante ou fixa).',
    'Para eu achar o item certo: é janela ou porta, e ele corre, gira, é maxim-ar ou é fixo?',
] as const

/**
 * O QUE O ACUMULADO JÁ DIZ (dono do produto, 05/11/2026): "se o vendedor já disse 'janela maxim ar', não pergunte 'é janela ou porta? abre de
 * correr?'". A pergunta fixa da tipologia tira o que a conversa já tem — a ABERTURA (janela/porta) e o TIPO (correr, abrir, maxim-ar…). Com os
 * dois ditos e ainda sem tipologia, não há o que perguntar do natural: pede-se a descrição de novo, sem lista do que tem natural.
 */
export type JaDito = { abertura: boolean; tipo: boolean }
export const NADA_DITO: JaDito = { abertura: false, tipo: false }
const PERGUNTAS_COM_ABERTURA_DITA = [
    'Como ela abre: de correr, de abrir, maxim-ar, pivotante ou fixa?',
    'E ela abre como: de correr, de abrir, maxim-ar, pivotante ou fixa?',
    'Para eu achar o item certo: ele corre, gira, é maxim-ar, pivotante ou fixo?',
] as const
const PERGUNTAS_COM_TIPO_DITO = [
    'É janela ou porta?',
    'Ela é janela ou porta?',
    'Para eu achar o item certo: é janela ou porta?',
] as const
const PERGUNTAS_COM_TUDO_DITO = [
    'Não achei esse item no catálogo com o que você descreveu. Me diga como ele é na obra, do jeito que você vê.',
    'Me descreva de novo o item, como ele é na obra: não achei um igual no catálogo.',
    'Para eu achar o item certo, me conte de novo como ele é — não encontrei um igual no catálogo.',
] as const
/** As formas da pergunta da tipologia para o que já foi dito: a primeira é a fixa, as outras são as reformulações. */
export function perguntasDaTipologia(jaDito: JaDito = NADA_DITO): readonly string[] {
    if (jaDito.abertura && jaDito.tipo) return PERGUNTAS_COM_TUDO_DITO
    if (jaDito.abertura) return PERGUNTAS_COM_ABERTURA_DITA
    if (jaDito.tipo) return PERGUNTAS_COM_TIPO_DITO
    return PERGUNTAS_DA_TIPOLOGIA
}

/**
 * A pergunta FIXA de cada campo — usada quando a LLM não traz uma pergunta para o campo certo.
 * ABERTA e sem lista de opções: quem responde é o vendedor, que já sabe o que a empresa vende. E
 * nada dos padrões da empresa. A da tipologia é a de obra, acima.
 */
export const PERGUNTA_DO_CAMPO: Record<CampoDaPreDefinicao, string> = {
    tipologia: PERGUNTAS_DA_TIPOLOGIA[0],
    largura_mm: 'Qual a largura, em milímetros?',
    altura_mm: 'Qual a altura, em milímetros?',
    quantidade: 'Quantas unidades?',
    cor_perfil: 'Qual a cor do perfil?',
    vidro: 'Qual o vidro?',
    local: 'Qual o local da obra?',
    tipo_edificacao: 'Qual o tipo de edificação?',
    distribuicao_por_pavimento: 'Como os itens se distribuem pelos pavimentos?',
}

/**
 * A mensagem FIXA de FECHAMENTO — enviada uma vez, quando a pré-definição passa a COMPLETA (dono do
 * produto, 22/10/2026). NÃO é escrita pela LLM: os valores vêm da pré-definição GRAVADA.
 *   - NÃO cita a distribuição por pavimento;
 *   - NÃO traz número que não esteja gravado — nada de perfil, insumo, peso, prazo ou preço.
 * Cada `{marcador}` é um campo; `mensagemDeFechamento` é a única que o preenche.
 */
export const MENSAGEM_DE_FECHAMENTO =
    'Fechado. Anotei tudo: {tipologia}, {largura_mm}x{altura_mm} mm, {quantidade} peça(s), perfil {cor_perfil}, vidro {vidro}. Entrega em {local}. Já passo para o levantamento.'

/** O fechamento com os valores dados, ou null se faltar algum campo que o molde usa. */
export function mensagemDeFechamento(estado: Partial<EstadoDosCampos>): string | null {
    let faltou = false
    // uma passada só: um valor que contenha `{local}` não é substituído de novo
    const texto = MENSAGEM_DE_FECHAMENTO.replace(/\{(\w+)\}/g, (_m, campo: string) => {
        const v = estado[campo as CampoDaPreDefinicao]
        if (typeof v !== 'string' && typeof v !== 'number') { faltou = true; return '' }
        return String(v)
    })
    return faltou ? null : texto
}

// ── AS FAIXAS SÃS ───────────────────────────────────────────────────────────────────────────
/** Medidas em milímetros, inteiras: de 10 cm a 20 m. Fora disso é engano de unidade, não esquadria. */
export const MEDIDA_MINIMA_MM = 100
export const MEDIDA_MAXIMA_MM = 20000
/** Quantidade inteira, de 1 a 10.000 unidades. */
export const QUANTIDADE_MAXIMA = 10000
/** Texto livre: não vazio, e até 500 caracteres. */
export const TEXTO_MAXIMO = 500

export const temMaisDeUmPavimento = (tipo: unknown): boolean =>
    typeof tipo === 'string' && (TIPOS_COM_MAIS_DE_UM_PAVIMENTO as readonly string[]).includes(tipo)

const preenchido = (v: unknown) => v !== null && v !== undefined

/** Os campos que se aplicam a este estado: a distribuição só com mais de um pavimento. */
export function camposAplicaveis(estado: Partial<EstadoDosCampos>): CampoDaPreDefinicao[] {
    return CAMPOS_DA_PRE_DEFINICAO.filter((c) => c !== 'distribuicao_por_pavimento' || temMaisDeUmPavimento(estado.tipo_edificacao))
}

/** O próximo campo vazio, na ordem — ou null, quando a pré-definição está completa. */
export function proximoCampo(estado: Partial<EstadoDosCampos>): CampoDaPreDefinicao | null {
    return camposAplicaveis(estado).find((c) => !preenchido(estado[c])) ?? null
}

export const quantosVazios = (estado: Partial<EstadoDosCampos>) => camposAplicaveis(estado).filter((c) => !preenchido(estado[c])).length

// ── A VALIDAÇÃO ─────────────────────────────────────────────────────────────────────────────
const inteiroNaFaixa = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
const textoValido = (v: unknown) => typeof v === 'string' && v.trim() !== '' && v.trim().length <= TEXTO_MAXIMO

/**
 * O valor que vai para a COLUNA, ou `undefined` quando não valida. A distribuição chega como texto
 * e é gravada como `{"texto": ...}`, sem interpretar (dono do produto, 22/10/2026).
 *
 * A TIPOLOGIA é o CÓDIGO de uma das tipologias da tabela em uso da empresa (`DP-02`), e só ela
 * (dono do produto, 25/10/2026): a IA escolhe da lista ou pergunta — não traduz por conta própria e
 * não inventa código. A comparação é EXATA, sem caixa nem espaço normalizados
 * (`faltou-dado-recusa-nomeada.md`: casar o parecido é escolher o parecido). Sem lista, nenhuma
 * tipologia valida.
 *
 * A COR DO PERFIL, desde 25/10/2026, é uma das `cores` da base de conhecimento da empresa (categoria Perfil) — SEM CAIXA, e só sem
 * caixa, desde 08/11/2026 (`corDaLista`): "branco" casa com "Branco" da lista e é gravada como a lista a escreve; "branca" (gênero) e
 * "Branco " (espaço) não casam. É o mesmo defeito do #238, na conversa. Sem lista, nenhuma cor valida.
 */
/**
 * A cor dita, na GRAFIA DA LISTA da empresa: a cor da lista que casa com ela SEM CAIXA (e só sem caixa — nem acento, nem espaço, nem
 * gênero). Null quando nenhuma casa, ou quando duas grafias da lista casam (só a caixa as distingue): escolher uma seria escolher o parecido.
 */
export function corDaLista(v: unknown, cores: readonly string[]): string | null {
    if (typeof v !== 'string' || v === '') return null
    const casam = [...new Set(cores.filter((c) => c.toUpperCase() === v.toUpperCase()))]
    return casam.length === 1 ? casam[0] : null
}

/** A pergunta da cor DITA que a empresa não tem (dono do produto, 08/11/2026): nomeia a cor e a lista — nunca a troca pela predominante. */
export const fraseDaCorForaDaLista = (cor: string, cores: readonly string[]) =>
    `A empresa não trabalha com ${cor} no perfil; as cores são ${cores.join(', ')}. Qual delas?`

export function valorValido(campo: CampoDaPreDefinicao, v: unknown, tipologias: readonly string[], cores: readonly string[]): unknown {
    switch (campo) {
        case 'tipologia':
            return typeof v === 'string' && tipologias.includes(v) ? v : undefined
        case 'cor_perfil':
            return corDaLista(v, cores) ?? undefined
        case 'largura_mm':
        case 'altura_mm':
            return inteiroNaFaixa(v, MEDIDA_MINIMA_MM, MEDIDA_MAXIMA_MM) ? v : undefined
        case 'quantidade':
            return inteiroNaFaixa(v, 1, QUANTIDADE_MAXIMA) ? v : undefined
        case 'tipo_edificacao':
            return typeof v === 'string' && (TIPOS_DE_EDIFICACAO as readonly string[]).includes(v) ? v : undefined
        case 'distribuicao_por_pavimento':
            return textoValido(v) ? { texto: (v as string).trim() } : undefined
        default:
            return textoValido(v) ? (v as string).trim() : undefined
    }
}

export type ResultadoDaValidacao = {
    /** O que gravar: só campos da pré-definição, só valores válidos. */
    gravar: Partial<EstadoDosCampos>
    /** Quantos valores não nulos a LLM propôs, entre os campos conhecidos. */
    propostos: number
    /** Quantos deles foram descartados: inválidos, ou tentando sobrescrever sem correção. */
    descartados: number
}

/**
 * Valida a proposta da LLM contra o estado atual.
 *   - só as chaves de CAMPOS_DA_PRE_DEFINICAO são lidas — tenant, conversa ou qualquer outra chave
 *     é ignorada sem ser contada;
 *   - `campos` só PREENCHE o que está nulo; `correcoes` é a ÚNICA via de sobrescrever. Os dois
 *     passam pela mesma validação; null nunca apaga;
 *   - a distribuição só é aceita com mais de um pavimento — o tipo considerado é o desta proposta,
 *     se válido, senão o já gravado;
 *   - a tipologia só é aceita se for um dos códigos de `tipologias` — a lista da tabela em uso da
 *     empresa —, e a cor do perfil, se for uma das `cores` da base. Os dois parâmetros são
 *     obrigatórios: um padrão vazio faria todo valor ser descartado sem que o chamador soubesse por
 *     quê (`construtor-empobrecido.md`).
 */
export function validarProposta(estadoAtual: Partial<EstadoDosCampos>, proposta: unknown, tipologias: readonly string[], cores: readonly string[]): ResultadoDaValidacao {
    const p = proposta && typeof proposta === 'object' ? (proposta as Record<string, unknown>) : {}
    const ler = (k: string) => (p[k] && typeof p[k] === 'object' ? (p[k] as Record<string, unknown>) : {})
    const campos = ler('campos')
    const correcoes = ler('correcoes')
    const gravar: Partial<EstadoDosCampos> = {}
    let propostos = 0
    let descartados = 0

    for (const campo of CAMPOS_DA_PRE_DEFINICAO) {
        for (const [origem, valor] of [['correcoes', correcoes[campo]], ['campos', campos[campo]]] as const) {
            if (valor === null || valor === undefined) continue
            propostos += 1
            const valido = valorValido(campo, valor, tipologias, cores)
            const podeSobrescrever = origem === 'correcoes'
            const jaTem = preenchido(estadoAtual[campo]) || campo in gravar
            // o tipo vem ANTES da distribuição na ordem: o aceito nesta proposta já está em `gravar`
            const semPavimentos = campo === 'distribuicao_por_pavimento'
                && !temMaisDeUmPavimento(gravar.tipo_edificacao ?? estadoAtual.tipo_edificacao)
            if (valido === undefined || semPavimentos || (jaTem && !podeSobrescrever)) { descartados += 1; continue }
            gravar[campo] = valido
        }
    }
    return { gravar, propostos, descartados }
}
