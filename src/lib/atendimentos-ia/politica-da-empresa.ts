/**
 * A POLÍTICA DA EMPRESA nas escolhas do motor (dono do produto, 20/11/2026): a terceira categoria de variável.
 *
 * > "Essa seção de arremate, acabamento, de instalação, é muito peculiar e individual de cada empresa. Por isso cada empresa atrela na sua base de
 * > conhecimento o formato que ela considera a política de trabalho."
 *
 * As três categorias:
 *   (a) VARIAÇÃO DE PRODUTO — travessa, bandeira, lado de giro: só entra com pedido explícito do vendedor;
 *   (b) POLÍTICA DA EMPRESA — arremates, contramarco, folga de instalação, solda, vedação: entra SEMPRE, sem perguntar, com o valor que a EMPRESA
 *       definiu (este módulo);
 *   (c) PADRÃO DO MOTOR — não vale sozinho para nada que acrescente peça (`fronteira-das-escolhas.ts`).
 *
 * ONDE MORA: `orcamentista_esquadrias_base` (a empresa, por tenant) sobre `orcamentista_esquadrias_padrao` (o NICHO, o modelo do ramo), campo a campo,
 * pela regra da migração 20261022000004 — "NULL é herança, FALSE é decisão", COALESCE(empresa, nicho) — já escrita em `efetivoDasEsquadrias`. O campo
 * que nem a empresa nem o nicho definem NÃO é política: cai na categoria (c).
 *
 * A TRADUÇÃO do campo para a opção do motor é ESTRITA, pelo próprio rótulo da opção na aba Variáveis (o dado diz, o código não adivinha): o texto da
 * política tem de ser o COMEÇO do rótulo (sem acento, sem espaço, sem caixa) — "BZ1770" casa "BZ1770 - ARREMATE 70MM [50,00]"; "VAO+50MM (CORTE 90/90)"
 * casa "VÃO+50MM (CORTE 90/90) - PARA AJUSTE EM OBRA [50,00]". O booleano casa o rótulo "SIM" ou "NÃO". O que não casa NENHUMA opção, ou casa mais
 * de uma, é recusa nomeada (a tipologia, o campo, o valor e as opções que existem) — nunca "a mais parecida". `usa_arremate_* = false` é "a opção que
 * não acrescenta a peça": quem a acha é a fronteira, pelas peças (`SEM_A_PECA`), não uma palavra do rótulo.
 *
 * O QUE NÃO É LIDO DAQUI, e é de propósito (dono do produto, 20/11/2026, decisão de 03/11/2026): `cores_perfil`, `cor_perfil_predominante` e `serra_mm`
 * têm homônimos nestas duas tabelas, mas a FONTE ATIVA é `orcamentista_mp_categoria.config` da categoria PERFIL (`cores`, `cor_predominante`,
 * `serra_mm`), de onde o cálculo lê hoje. Os campos daqui ficam MORTOS para esses três. DÍVIDA, a unificar com migração própria: uma fonte só.
 * `barra_mm` e `solda` também não são lidos daqui: o aproveitamento é do motor (`orcamentista_motor_otimizacao`).
 */
import { opcoesDaVariavel, type VariavelDaTipologia } from '@/lib/atendimentos-ia/avaliador-de-formulas'
import { efetivoDasEsquadrias } from '@/lib/atendimentos-ia/base-de-conhecimento'

/** Os valores efetivos da política (empresa sobre nicho), só os campos que o mapa lê. Ausente = a política não define. */
export type PoliticaDaEmpresa = Readonly<Partial<Record<CampoDaPolitica, string | boolean>>>

/**
 * O MAPA, fechado: a variável do motor e os campos da política que a decidem. `usa` é o booleano que liga ou desliga a peça; `valor` é o texto
 * que escolhe a opção. Variável fora do mapa não é política — é (a) ou (c).
 */
export const MAPA_DA_POLITICA = {
    ARI: { usa: 'usa_arremate_interno', valor: 'guarnicao_interna' },
    ARE: { usa: 'usa_arremate_externo', valor: 'guarnicao_externa' },
    MAE: { valor: 'medida_arremate_externo' },
    MTE: { valor: 'montagem_arremate_externo' },
    RL: { booleano: 'regiao_litoranea' },
    INT: { valor: 'modelo_interlock' },
    MFI: { valor: 'fechamento_folha_interna' },
    MFE: { valor: 'fechamento_folha_externa' },
} as const satisfies Record<string, { usa?: string; valor?: string; booleano?: string }>
export type VariavelDaPolitica = keyof typeof MAPA_DA_POLITICA
type Entrada = { usa?: string; valor?: string; booleano?: string }
const CAMPOS = [...new Set(Object.values(MAPA_DA_POLITICA as Record<string, Entrada>).flatMap((m) => [m.usa, m.valor, m.booleano]).filter((c): c is string => !!c))]
export type CampoDaPolitica = (typeof CAMPOS)[number]

/** A política efetiva, das duas linhas (a da empresa e a do nicho), só com os campos do mapa e só os definidos. */
export function politicaEfetiva(empresa: Record<string, unknown> | null, nicho: Record<string, unknown> | null): PoliticaDaEmpresa {
    const efetivo = efetivoDasEsquadrias(empresa, nicho)
    const p: Record<string, string | boolean> = {}
    for (const c of CAMPOS) {
        const v = efetivo[c]?.valor
        if (typeof v === 'boolean') p[c] = v
        else if (typeof v === 'string' && v.trim() !== '') p[c] = v.trim()
    }
    return p
}

const forma = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, '')

export type TraducaoDaPolitica =
    | { valor: number; campo: string }
    | { semAPeca: true; campo: string }
    | { recusa: string; campo: string }
    | null

/** As opções da variável, por extenso, para a recusa. */
const listaDasOpcoes = (opcoes: ReadonlyArray<{ valor: number; rotulo: string }>) => opcoes.map((o) => `${o.valor} = ${o.rotulo}`).join('; ')

/**
 * A opção que a política escolhe para a variável desta tipologia. Null quando a variável não é da política, ou a política não a define (cai na (c)).
 */
export function traduzirPolitica(tipologia: string, v: Pick<VariavelDaTipologia, 'variavel' | 'opcoes'>, politica: PoliticaDaEmpresa): TraducaoDaPolitica {
    const mapa = (MAPA_DA_POLITICA as Record<string, Entrada>)[v.variavel]
    if (!mapa) return null
    const opcoes = opcoesDaVariavel(v.opcoes) ?? []
    const casam = (texto: string) => opcoes.filter((o) => forma(o.rotulo).startsWith(forma(texto)))
    const recusa = (campo: string, valor: string, achadas: number) => ({
        campo,
        recusa: `a política da empresa diz ${campo} = "${valor}", e na tipologia ${tipologia} ${achadas === 0 ? 'nenhuma opção' : 'mais de uma opção'} de ${v.variavel} começa assim (${listaDasOpcoes(opcoes)}): corrija a política ou o motor`,
    })
    if (mapa.booleano) {
        const b = politica[mapa.booleano as CampoDaPolitica]
        if (typeof b !== 'boolean') return null
        const rotulo = b ? 'SIM' : 'NAO'
        const achadas = opcoes.filter((o) => forma(o.rotulo) === rotulo)
        return achadas.length === 1 ? { valor: achadas[0].valor, campo: mapa.booleano } : recusa(mapa.booleano, b ? 'SIM' : 'NÃO', achadas.length)
    }
    if (mapa.usa) {
        const usa = politica[mapa.usa as CampoDaPolitica]
        if (usa === false) return { semAPeca: true, campo: mapa.usa }
        if (usa !== true) return null
    }
    const campo = mapa.valor as string
    const texto = politica[campo as CampoDaPolitica]
    if (typeof texto !== 'string') {
        // "usa" sem dizer qual: a política não diz a opção, e a fronteira não escolhe por ela
        return mapa.usa ? { campo: mapa.usa, recusa: `a política da empresa diz ${mapa.usa} = sim, mas não diz qual (${campo} vazio) para ${v.variavel} da tipologia ${tipologia} (${listaDasOpcoes(opcoes)})` } : null
    }
    const achadas = casam(texto)
    return achadas.length === 1 ? { valor: achadas[0].valor, campo } : recusa(campo, texto, achadas.length)
}
