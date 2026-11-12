/**
 * A CONFERÊNCIA DE REFERÊNCIAS DO MOTOR (dono do produto, 12/11/2026): "será que não tem um comando para que você identifique se a referência, o
 * código, está dentro do sistema com alguma variável?". Ela nasce de uma conferência feita À MÃO, que errou duas vezes o lugar de medir e que
 * ninguém conseguia repetir. Para CADA código que as regras do motor citam, ela responde:
 *   - se existe na tabela de preço, e sob qual código;
 *   - se tem preço (custo, valor da barra, valor do metro);
 *   - se tem crédito de ICMS, de PIS/COFINS e de IPI, e se tem NCM;
 *   - de qual fornecedor e categoria é;
 *   - em quantas regras aparece (o peso) e em quantas tipologias.
 *
 * COMO CASAR, NESTA ORDEM. O primeiro degrau que acha vale, e os de baixo não são tentados:
 *   1. `exato`: o código da regra é o código do item.
 *   2. `sem_sufixo`: o código do item SEM o sufixo do fornecedor (`1326/WOLFF` → `1326`) é o código da regra. O sufixo tem de ser o mesmo do
 *      `codigo_wvetro` da regra (WOLFF com WOLFF). MEDIDO em 12/11/2026: a tabela traz 138 itens com o sufixo no código, e 34 dos códigos do
 *      motor só se acham assim. O que se compara é o código da regra, COM a cor (`13211`), nunca a base do `codigo_wvetro` (`1321`): pela base, o
 *      83841 (persiana PVC branca) casaria o 8384 da Celsus, que é uma cremona.
 *   3. `base_e_cor`: a tabela usa base + sufixo de cor (9921 branco, 99230 laminado bronze…). O item cujo código começa com a base do
 *      `codigo_wvetro` só vale com a DESCRIÇÃO BATENDO (normalizada, igual). O PREFIXO SOZINHO NÃO VALE (dono do produto): o 17569 da tabela é
 *      uma maçaneta Celsus, não a veneziana 17561; o 8384 é uma cremona, não a persiana PVC.
 *   4. `palpite_por_descricao`: a descrição normalizada igual, em qualquer código. Último recurso, e é PALPITE, nunca achado: vai para a lista de
 *      quem confirma.
 *
 * O CÓDIGO DO MOTOR NÃO SE NORMALIZA (`codigo-do-motor-nao-se-normaliza.md`): nenhum degrau tira zero, caixa ou espaço do código. Só sai o
 * sufixo do fornecedor, que é marca de formato da tabela, e só quando ele é o da regra.
 *
 * AUSENTE NÃO É ZERO (`ausente-vs-falso.md`): um percentual 0 é "tem, e é zero"; null é "não informado". As listas não somam nem estimam nada.
 *
 * Puro: quem lê o banco é a rota (`repositorio.ts`), e este módulo só decide.
 */

/** Uma linha de regra do motor, como o banco a guarda: o que a conferência lê dela. */
export interface RegraDoMotor { codigo: string; codigo_wvetro: string | null; descricao: string | null; tipologias: readonly string[] | null }

/** Um código do motor, agregado das regras que o citam. */
export interface ReferenciaDoMotor {
    codigo: string
    codigo_wvetro: string | null
    descricao: string | null
    /** O peso: em quantas regras o código aparece. */
    regras: number
    /** Em quantas tipologias distintas. */
    tipologias: number
}

/** Um item de tabela de preço, com a tabela e o fornecedor de onde vem. Os números são os gravados; null é "não informado". */
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
    fornecedor: string | null
    categoria: string | null
}

export type Degrau = 'exato' | 'sem_sufixo' | 'base_e_cor' | 'palpite_por_descricao'
/** A ordem da escada. É ela que decide qual degrau vale; os de baixo não são tentados. */
export const DEGRAUS: readonly Degrau[] = ['exato', 'sem_sufixo', 'base_e_cor', 'palpite_por_descricao']

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
    degrau: Degrau | null
    itens: ItemAchado[]
}

export interface ConferenciaDeReferencias {
    /** Os códigos distintos que as regras citam. */
    codigos: number
    regras: number
    comPreco: ReferenciaConferida[]
    semPreco: ReferenciaConferida[]
    naoAchadas: ReferenciaConferida[]
    /** Achadas só pela descrição (degrau 4): alguém confirma. NUNCA entram em "com preço" ou "sem preço". */
    porPalpite: ReferenciaConferida[]
}

// ── as formas ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** O sufixo do fornecedor no fim do código (`/WOLFF`), ou null. */
export function sufixoDoFornecedor(codigo: string): string | null {
    const m = /\/([A-Za-z]+)$/.exec(codigo)
    return m ? m[1].toUpperCase() : null
}
/** O código sem o sufixo do fornecedor; o resto fica como está (nem zero, nem caixa, nem espaço). */
export const semSufixo = (codigo: string): string => codigo.replace(/\/[A-Za-z]+$/, '')
/** A base do código WVetro: o código sem o sufixo (`BR60/WOLFF` → `BR60`), ou null quando a regra não tem código WVetro. */
export const baseDoWvetro = (wv: string | null): string | null => (wv === null || wv.trim() === '' ? null : semSufixo(wv.trim()))

/** A descrição para comparar: sem acento, sem caixa, e só letras e números separados por um espaço. Para COMPARAR, nunca para mostrar. */
export function descricaoNormalizada(d: string | null): string {
    return (d ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
}

const temNumero = (x: number | null) => x !== null && Number.isFinite(x)

function achado(i: ItemParaConferir, descricaoDaRegra: string | null): ItemAchado {
    return {
        codigo: i.codigo, descricao: i.descricao, tabela_id: i.tabela_id, tabela_arquivo: i.tabela_arquivo, fornecedor: i.fornecedor, categoria: i.categoria,
        preco: { custo: i.custo, valor_barra: i.valor_barra_interno, valor_metro: i.valor_metro_interno },
        credito: { icms: i.cred_icms_pct, pis_cofins: i.cred_pis_cofins_pct, ipi: i.cred_ipi_pct, ipi_nao_creditavel: i.nc_ipi_pct },
        ncm: i.ncm === null || i.ncm.trim() === '' ? null : i.ncm,
        temPreco: temNumero(i.custo) || temNumero(i.valor_barra_interno) || temNumero(i.valor_metro_interno),
        descricaoDiverge: descricaoNormalizada(i.descricao) !== descricaoNormalizada(descricaoDaRegra),
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
    return [...por.values()].map(({ r, regras: n, tipologias }) => ({ codigo: r.codigo, codigo_wvetro: r.codigo_wvetro, descricao: r.descricao, regras: n, tipologias: tipologias.size }))
}

// ── a escada ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Os itens que cada degrau acha para a referência. Exportada para o teste provar degrau a degrau. */
export function itensDoDegrau(degrau: Degrau, ref: ReferenciaDoMotor, itens: readonly ItemParaConferir[]): ItemParaConferir[] {
    if (degrau === 'exato') return itens.filter((i) => i.codigo === ref.codigo)
    if (degrau === 'sem_sufixo') {
        const doMotor = ref.codigo_wvetro === null ? null : sufixoDoFornecedor(ref.codigo_wvetro.trim())
        if (doMotor === null) return []
        return itens.filter((i) => sufixoDoFornecedor(i.codigo) === doMotor && semSufixo(i.codigo) === ref.codigo)
    }
    const dRegra = descricaoNormalizada(ref.descricao)
    if (dRegra === '') return []
    if (degrau === 'base_e_cor') {
        const base = baseDoWvetro(ref.codigo_wvetro)
        if (base === null || base === '') return []
        return itens.filter((i) => semSufixo(i.codigo).startsWith(base) && descricaoNormalizada(i.descricao) === dRegra)
    }
    return itens.filter((i) => descricaoNormalizada(i.descricao) === dRegra)
}

/** A conferência inteira: cada código do motor, no primeiro degrau que o acha, em uma das quatro listas. */
export function conferirReferencias(referencias: readonly ReferenciaDoMotor[], itens: readonly ItemParaConferir[]): ConferenciaDeReferencias {
    const out: ConferenciaDeReferencias = { codigos: referencias.length, regras: referencias.reduce((s, r) => s + r.regras, 0), comPreco: [], semPreco: [], naoAchadas: [], porPalpite: [] }
    for (const ref of referencias) {
        let conferida: ReferenciaConferida = { ...ref, degrau: null, itens: [] }
        for (const degrau of DEGRAUS) {
            const achados = itensDoDegrau(degrau, ref, itens)
            if (achados.length > 0) { conferida = { ...ref, degrau, itens: achados.map((i) => achado(i, ref.descricao)) }; break }
        }
        if (conferida.degrau === null) out.naoAchadas.push(conferida)
        else if (conferida.degrau === 'palpite_por_descricao') out.porPalpite.push(conferida)
        else if (conferida.itens.some((i) => i.temPreco)) out.comPreco.push(conferida)
        else out.semPreco.push(conferida)
    }
    // a ordem das listas: o peso primeiro (o que mais regras cita é o que mais pesa no preço), e o código cru para desempatar
    const ordem = (a: ReferenciaConferida, b: ReferenciaConferida) => b.regras - a.regras || (a.codigo < b.codigo ? -1 : a.codigo > b.codigo ? 1 : 0)
    for (const l of [out.comPreco, out.semPreco, out.naoAchadas, out.porPalpite]) l.sort(ordem)
    return out
}

/**
 * Os códigos achados por uma TRANSFORMAÇÃO do código (o degrau 2, sem o sufixo) cujo item tem outra descrição: o código casou depois de tirar o
 * sufixo, e alguém confere se é o mesmo produto. O degrau 1 (o código exato) não entra: o código cru É a identidade, e a redação da descrição
 * difere à toa — MEDIDO em 12/11/2026, 69 das achadas pelo código exato têm outra redação, e a tabela usa uma descrição só para várias cores
 * ("GUARNIÇAO ARREMATE INTERNO 17X70MM" para as oito cores do BZ1770). O degrau 3 já exige a descrição igual, e o 4 já é palpite.
 */
export const comDescricaoDivergente = (c: ConferenciaDeReferencias): ReferenciaConferida[] =>
    [...c.comPreco, ...c.semPreco].filter((r) => r.degrau === 'sem_sufixo' && r.itens.some((i) => i.descricaoDiverge))
