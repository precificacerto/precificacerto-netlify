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
 * A pergunta FIXA de cada campo — usada quando a LLM não traz uma pergunta para o campo certo.
 * ABERTA e sem lista de opções: quem responde é o vendedor, que já sabe o que a empresa vende. E
 * nada dos padrões da empresa.
 */
export const PERGUNTA_DO_CAMPO: Record<CampoDaPreDefinicao, string> = {
    tipologia: 'Qual a tipologia das esquadrias?',
    largura_mm: 'Qual a largura, em milímetros?',
    altura_mm: 'Qual a altura, em milímetros?',
    quantidade: 'Quantas unidades?',
    cor_perfil: 'Qual a cor do perfil?',
    vidro: 'Qual o vidro?',
    local: 'Qual o local da obra?',
    tipo_edificacao: 'Qual o tipo de edificação?',
    distribuicao_por_pavimento: 'Como as esquadrias se distribuem pelos pavimentos?',
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
 */
export function valorValido(campo: CampoDaPreDefinicao, v: unknown): unknown {
    switch (campo) {
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
 *     se válido, senão o já gravado.
 */
export function validarProposta(estadoAtual: Partial<EstadoDosCampos>, proposta: unknown): ResultadoDaValidacao {
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
            const valido = valorValido(campo, valor)
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
