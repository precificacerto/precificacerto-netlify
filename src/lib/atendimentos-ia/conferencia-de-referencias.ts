/**
 * A CONFERÊNCIA DE REFERÊNCIAS DO MOTOR (dono do produto, 12/11/2026): "será que não tem um comando para que você identifique se a referência, o
 * código, está dentro do sistema com alguma variável?". Para CADA código que as regras do motor citam, ela responde:
 *   - se existe na tabela de preço, sob qual código e COMO foi achado;
 *   - se tem preço (custo, valor da barra, valor do metro);
 *   - se tem crédito de ICMS, de PIS/COFINS e de IPI, e se tem NCM;
 *   - de qual fornecedor e categoria é;
 *   - em quantas regras aparece (o peso) e em quantas tipologias.
 *
 * A RESOLUÇÃO NÃO MORA AQUI: é `resolverReferencia` (`resolucao-de-referencia.ts`), a MESMA que o cálculo do levantamento usa — o escopo do
 * fornecedor e da família do motor primeiro, e a escada ponte → exato (com o sufixo do fornecedor) → código + cor → nome técnico, com o guarda
 * da descrição em todos e a falta nomeada no lugar do palpite (12/11/2026, o comando único). Cada regra entra como a ponte a escreve: o código
 * WVetro é o código do motor, o código da regra é o da ponte, e a cor da regra é a cor pedida. Este módulo só agrega as regras, chama a resolução, e separa em listas NOMEADAS.
 *
 * AUSENTE NÃO É ZERO (`ausente-vs-falso.md`): um percentual 0 é "tem, e é zero"; null é "não informado". As listas não somam nem estimam nada.
 *
 * Puro: quem lê o banco é a rota (`repositorio.ts`), e este módulo só decide.
 */
import { GRUPO_DE_COR, resolverReferencia, tabelaNoEscopo, type ComoAchou, type CorDoFornecedor, type EscopoDoMotor, type MotivoDaFalta } from '@/lib/atendimentos-ia/resolucao-de-referencia'

/** Uma linha de regra do motor, como o banco a guarda: o que a conferência lê dela. */
export interface RegraDoMotor { codigo: string; codigo_wvetro: string | null; descricao: string | null; cor: string | null; tipologias: readonly string[] | null }

/** Um código do motor, agregado das regras que o citam. */
export interface ReferenciaDoMotor {
    codigo: string
    codigo_wvetro: string | null
    descricao: string | null
    cor: string | null
    /** O peso: em quantas regras o código aparece. */
    regras: number
    /** Em quantas tipologias distintas. */
    tipologias: number
}

/** Um item de tabela de preço, com a tabela, o fornecedor e a família de onde vem. Os números são os gravados; null é "não informado". */
export interface ItemParaConferir {
    codigo: string
    descricao: string | null
    custo: number | null
    valor_barra_interno: number | null
    valor_metro_interno: number | null
    cred_icms_pct: number | null
    cred_pis_cofins_pct: number | null
    cred_ipi_pct: number | null
    nc_ipi_pct: number | null
    ncm: string | null
    tabela_id: string
    tabela_arquivo: string | null
    fornecedor_id: string
    fornecedor: string | null
    familia: string | null
    categoria: string | null
}

/** O que o item achado diz de si. */
export interface ItemAchado {
    codigo: string
    descricao: string | null
    tabela_id: string
    tabela_arquivo: string | null
    fornecedor: string | null
    categoria: string | null
    preco: { custo: number | null; valor_barra: number | null; valor_metro: number | null }
    credito: { icms: number | null; pis_cofins: number | null; ipi: number | null; ipi_nao_creditavel: number | null }
    ncm: string | null
    temPreco: boolean
    /** A descrição do item é outra, normalizada, que a da regra: o código casou, e alguém confere se é o mesmo produto. */
    descricaoDiverge: boolean
}

export interface ReferenciaConferida extends ReferenciaDoMotor {
    /** Como foi achada; null quando não foi. */
    como: ComoAchou | null
    itens: ItemAchado[]
    /** Quando não foi achada: o motivo, a frase da falta, e as candidatas que apareceram com a razão de não valerem. */
    falta: { motivo: MotivoDaFalta; frase: string; candidatas: Array<{ item: ItemAchado; porque: string }> } | null
}

export interface ConferenciaDeReferencias {
    /** Os códigos distintos que as regras citam. */
    codigos: number
    regras: number
    /** Os itens de tabela no escopo do motor (o fornecedor e a família dele), contra os quais a conferência resolveu. */
    itensNoEscopo: number
    comPreco: ReferenciaConferida[]
    semPreco: ReferenciaConferida[]
    /** Não há candidata nenhuma no escopo. */
    naoAchadas: ReferenciaConferida[]
    /** Há candidatas, e nenhuma vale: duas no mesmo degrau, ou a descrição não bate. Falta nomeada, para alguém decidir. */
    naoResolvidas: ReferenciaConferida[]
}

// ── as formas ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const temNumero = (x: number | null) => x !== null && Number.isFinite(x)
const normal = (d: string | null) => (d ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()

function achado(i: ItemParaConferir, descricaoDaRegra: string | null): ItemAchado {
    return {
        codigo: i.codigo, descricao: i.descricao, tabela_id: i.tabela_id, tabela_arquivo: i.tabela_arquivo, fornecedor: i.fornecedor, categoria: i.categoria,
        preco: { custo: i.custo, valor_barra: i.valor_barra_interno, valor_metro: i.valor_metro_interno },
        credito: { icms: i.cred_icms_pct, pis_cofins: i.cred_pis_cofins_pct, ipi: i.cred_ipi_pct, ipi_nao_creditavel: i.nc_ipi_pct },
        ncm: i.ncm === null || i.ncm.trim() === '' ? null : i.ncm,
        temPreco: temNumero(i.custo) || temNumero(i.valor_barra_interno) || temNumero(i.valor_metro_interno),
        descricaoDiverge: normal(i.descricao) !== normal(descricaoDaRegra),
    }
}

// ── a agregação ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** As regras agregadas por código, na ordem em que o código aparece primeiro. O código CRU é a chave. */
export function agregarRegras(regras: readonly RegraDoMotor[]): ReferenciaDoMotor[] {
    const por = new Map<string, { r: RegraDoMotor; regras: number; tipologias: Set<string> }>()
    for (const r of regras) {
        const atual = por.get(r.codigo) ?? { r, regras: 0, tipologias: new Set<string>() }
        atual.regras += 1
        for (const t of r.tipologias ?? []) atual.tipologias.add(t)
        por.set(r.codigo, atual)
    }
    return [...por.values()].map(({ r, regras: n, tipologias }) => ({
        codigo: r.codigo, codigo_wvetro: r.codigo_wvetro, descricao: r.descricao, cor: r.cor, regras: n, tipologias: tipologias.size,
    }))
}

// ── a conferência ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** A conferência inteira: o escopo do motor, e cada código do motor resolvido pela MESMA resolução do cálculo, numa das listas. */
export function conferirReferencias(referencias: readonly ReferenciaDoMotor[], itens: readonly ItemParaConferir[], escopo: EscopoDoMotor, cores: readonly CorDoFornecedor[] = []): ConferenciaDeReferencias {
    const noEscopo = itens.filter((i) => tabelaNoEscopo({ fornecedor_id: i.fornecedor_id, familia: i.familia }, escopo))
    const out: ConferenciaDeReferencias = {
        codigos: referencias.length, regras: referencias.reduce((s, r) => s + r.regras, 0), itensNoEscopo: noEscopo.length,
        comPreco: [], semPreco: [], naoAchadas: [], naoResolvidas: [],
    }
    for (const ref of referencias) {
        const r = resolverReferencia(
            { codigoDoMotor: ref.codigo_wvetro ?? ref.codigo, codigoDaPonte: ref.codigo, descricaoDoMotor: ref.descricao, corPedida: ref.cor },
            noEscopo, { cores, grupoDeCor: GRUPO_DE_COR.perfil })
        if ('item' in r) {
            const conferida: ReferenciaConferida = { ...ref, como: r.como, itens: [achado(r.item, ref.descricao)], falta: null }
            ;(conferida.itens[0].temPreco ? out.comPreco : out.semPreco).push(conferida)
            continue
        }
        const conferida: ReferenciaConferida = {
            ...ref, como: null, itens: [],
            falta: { motivo: r.motivo, frase: r.frase, candidatas: r.candidatas.map((c) => ({ item: achado(c.item, ref.descricao), porque: c.porque })) },
        }
        ;(r.motivo === 'NAO_ACHADA' ? out.naoAchadas : out.naoResolvidas).push(conferida)
    }
    // a ordem das listas: o peso primeiro (o que mais regras cita é o que mais pesa no preço), e o código cru para desempatar
    const ordem = (a: ReferenciaConferida, b: ReferenciaConferida) => b.regras - a.regras || (a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0)
    for (const l of [out.comPreco, out.semPreco, out.naoAchadas, out.naoResolvidas]) l.sort(ordem)
    return out
}

/**
 * As achadas por OUTRO código que o da regra (o sufixo do fornecedor, a cor ou o nome técnico) cujo item tem outra redação: o guarda da descrição
 * já exigiu uma palavra em comum, e alguém confere se é o mesmo produto. O código exato não entra: o código cru É a identidade, e a redação
 * difere à toa — medido em 12/11/2026, 69 das achadas pelo código exato têm outra redação.
 */
export const comDescricaoDivergente = (c: ConferenciaDeReferencias): ReferenciaConferida[] =>
    [...c.comPreco, ...c.semPreco].filter((r) => r.itens.some((i) => i.codigo !== r.codigo && i.descricaoDiverge))
