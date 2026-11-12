/**
 * A RESOLUÇÃO DE REFERÊNCIA (dono do produto, 12/11/2026) — UM módulo, usado pela conferência de referências do motor E pelo cálculo do
 * levantamento. Nenhuma cópia: o portão `resolucao-de-referencia-sem-copia.test.ts` reprova a segunda. Nas palavras dele:
 *
 * > "o sistema deve olhar para os códigos, as referências de cada material e identificar se tem sufixo, se tem cor, se tem um código aproximado
 * > daquela necessidade, e entender se ele é ou não aquele código, porque nós temos vários fornecedores que geram várias variáveis."
 *
 * A REGRA, NESTA ORDEM (o primeiro degrau que acha vale, e os de baixo não são tentados):
 *   1. O ESCOPO PRIMEIRO, SEMPRE: só os itens das tabelas do FORNECEDOR e da FAMÍLIA do motor (`tabelaNoEscopo`), nunca a base inteira.
 *      PROVA (12/11/2026): o 8384 da tabela é uma cremona da CELSUS; o 8384/WOLFF do motor é a persiana PVC da Wolf.
 *   2. `exato`: o código do item é o da regra.
 *   3. `sufixo_do_fornecedor`: o mesmo código com ou sem o sufixo do fornecedor — o sufixo do `codigo_wvetro` da regra (`/WOLFF`), nos DOIS
 *      sentidos (o motor com e a tabela sem, ou o contrário). SÓ esse sufixo: medido em 12/11/2026, dos 140 itens da Wolf com barra no
 *      código, 91 são `/VEZA` (outro fabricante, na tabela de acessórios da Wolf) e um é `00384000162/24` (fita crepe); a Estrela tem 4
 *      códigos de vidro com barra dentro (`DPVTIN06/8,5/VTIN06`). Nenhum deles é sufixo de fornecedor.
 *   4. `cor`: a mesma BASE do `codigo_wvetro` (`1756` de `1756/WOLFF`), num item cuja descrição NOMEIA a cor da regra e, sem a cor, é a
 *      MESMA descrição. A base sozinha nunca vale ("case a cor, não só a base"). O sufixo de cor pela forma do código NÃO é usado: medido no
 *      motor 022fc55e, ele é inconsistente — "9" é PRETO e também LAMINADO GOLDEN OAK; PINTADA DE PRETO tem "20" e "36".
 *   5. `aproximado_com_descricao`: a mesma base, com a DESCRIÇÃO IGUAL (normalizada). Nunca pela forma do código sozinha — PROVA: 17569 é
 *      uma maçaneta Celsus e 17561 é a veneziana tropical; prefixo igual, produto diferente.
 *   6. FALTA NOMEADA, NUNCA PALPITE: duas candidatas no mesmo degrau (`AMBIGUA`), ou candidatas cuja descrição não bate
 *      (`DESCRICAO_NAO_BATE`), ou nenhuma (`NAO_ACHADA`). A falta diz o código procurado, as candidatas que apareceram e por que nenhuma valeu.
 *
 * O RESULTADO DIZ COMO ACHOU (`ComoAchou`), e o cálculo grava isso na fotografia do material, para auditar como cada preço foi parar ali.
 *
 * Para separar as duas formas do resultado, use `'item' in r`: com `strictNullChecks: false`, o tsc não estreita a união pelo booleano `achada`.
 *
 * O CÓDIGO DO MOTOR NÃO SE NORMALIZA (`docs/regras/codigo-do-motor-nao-se-normaliza.md`): nenhum degrau tira zero, caixa, ponto ou espaço do
 * código. Só sai o sufixo do fornecedor, que é marca de formato da tabela, e só o da regra.
 *
 * Puro: não lê banco. Quem chama traz os itens já no escopo (`tabelaNoEscopo`) e a referência como o motor a cita.
 */

/** A referência como o motor a cita: o código (já com a cor), o código WVetro (com o sufixo do fornecedor), a descrição e a cor. */
export interface ReferenciaProcurada { codigo: string; codigo_wvetro: string | null; descricao: string | null; cor: string | null }
/** O mínimo que a resolução lê de um item: o código e a descrição. O resto do item viaja junto. */
export interface ItemResolvivel { codigo: string; descricao?: string | null }

export type ComoAchou = 'exato' | 'sufixo_do_fornecedor' | 'cor' | 'aproximado_com_descricao'
/** A ordem da escada. É ela que decide qual degrau vale; os de baixo não são tentados. */
export const COMO_ACHOU: readonly ComoAchou[] = ['exato', 'sufixo_do_fornecedor', 'cor', 'aproximado_com_descricao']
export type MotivoDaFalta = 'NAO_ACHADA' | 'AMBIGUA' | 'DESCRICAO_NAO_BATE'

export interface CandidataRecusada<I> { item: I; porque: string }
export type ResolucaoDeReferencia<I> =
    | { achada: true; como: ComoAchou; item: I }
    | { achada: false; motivo: MotivoDaFalta; procurado: string; candidatas: Array<CandidataRecusada<I>>; frase: string }

// ── o escopo ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** O escopo do motor: o fornecedor dele e as famílias em que ele atua. */
export interface EscopoDoMotor { fornecedor_id: string; familias: readonly string[] }
/** A tabela está no escopo: do fornecedor do motor, e de uma família dele (a tabela sem família — "qualquer linha" — serve a todas). */
export function tabelaNoEscopo(t: { fornecedor_id: string; familia: string | null }, escopo: EscopoDoMotor): boolean {
    return t.fornecedor_id === escopo.fornecedor_id && (t.familia === null || escopo.familias.includes(t.familia))
}

// ── as formas ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** O sufixo do fornecedor no fim do código WVetro (`/WOLFF` → `WOLFF`), em caixa alta, ou null. */
export function sufixoDoFornecedor(codigoWvetro: string | null): string | null {
    const m = /\/\s*([A-Za-z]+)\s*$/.exec(codigoWvetro ?? '')
    return m ? m[1].toUpperCase() : null
}
/** O código sem o sufixo DADO (e só ele, sem olhar a caixa); o resto fica como está — nem zero, nem caixa, nem ponto. */
export function semOSufixo(codigo: string, sufixo: string | null): string {
    if (sufixo === null) return codigo
    const m = new RegExp(`\\s*/\\s*${sufixo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i').exec(codigo)
    return m ? codigo.slice(0, m.index) : codigo
}
/** A base do código WVetro: sem o sufixo do fornecedor (`1756/WOLFF` → `1756`), ou null quando a regra não tem código WVetro. */
export function baseDoWvetro(codigoWvetro: string | null): string | null {
    const wv = (codigoWvetro ?? '').trim()
    if (wv === '') return null
    const base = semOSufixo(wv, sufixoDoFornecedor(wv))
    return base === '' ? null : base
}
/** A descrição para COMPARAR (nunca para mostrar): sem acento, sem caixa, só letras e números separados por um espaço. */
export function descricaoNormalizada(d: string | null | undefined): string {
    return (d ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
}
/** A descrição sem as palavras da cor (normalizadas), para comparar o resto. */
function semACor(descricao: string, cor: string): string {
    const palavras = new Set(cor.split(' ').filter((p) => p !== ''))
    return descricao.split(' ').filter((p) => !palavras.has(p)).join(' ')
}
/** A descrição nomeia a cor: as palavras da cor aparecem, nessa ordem e juntas. */
function nomeiaACor(descricao: string, cor: string): boolean {
    return cor !== '' && ` ${descricao} `.includes(` ${cor} `)
}

// ── a escada ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** Os itens que cada degrau acha para a referência. Exportada para o teste provar degrau a degrau. */
export function candidatasDoDegrau<I extends ItemResolvivel>(como: ComoAchou, ref: ReferenciaProcurada, itens: readonly I[]): I[] {
    if (como === 'exato') return itens.filter((i) => i.codigo === ref.codigo)
    const sufixo = sufixoDoFornecedor(ref.codigo_wvetro)
    if (como === 'sufixo_do_fornecedor') {
        if (sufixo === null) return []
        const procurado = semOSufixo(ref.codigo, sufixo)
        return itens.filter((i) => i.codigo !== ref.codigo && semOSufixo(i.codigo, sufixo) === procurado)
    }
    const base = baseDoWvetro(ref.codigo_wvetro)
    const dRegra = descricaoNormalizada(ref.descricao)
    if (base === null || dRegra === '') return []
    const daBase = itens.filter((i) => i.codigo !== ref.codigo && semOSufixo(i.codigo, sufixo).startsWith(base))
    if (como === 'cor') {
        const cor = descricaoNormalizada(ref.cor)
        if (cor === '') return []
        return daBase.filter((i) => {
            const d = descricaoNormalizada(i.descricao)
            return nomeiaACor(d, cor) && semACor(d, cor) === semACor(dRegra, cor)
        })
    }
    return daBase.filter((i) => descricaoNormalizada(i.descricao) === dRegra)
}

/** A resolução de UMA referência, no escopo já filtrado: o primeiro degrau com UMA candidata vale; duas é falta nomeada. */
export function resolverReferencia<I extends ItemResolvivel>(ref: ReferenciaProcurada, itens: readonly I[]): ResolucaoDeReferencia<I> {
    for (const como of COMO_ACHOU) {
        const candidatas = candidatasDoDegrau(como, ref, itens)
        if (candidatas.length === 1) return { achada: true, como, item: candidatas[0] }
        if (candidatas.length > 1) {
            const porque = `${candidatas.length} itens no mesmo degrau (${ROTULO_DO_COMO[como]}): nenhum é escolhido`
            return falta(ref, 'AMBIGUA', candidatas.map((item) => ({ item, porque })))
        }
    }
    // nada achou: as que têm a mesma base aparecem, com a razão de não valerem — a descrição não bate
    const base = baseDoWvetro(ref.codigo_wvetro)
    const sufixo = sufixoDoFornecedor(ref.codigo_wvetro)
    const daBase = base === null ? [] : itens.filter((i) => i.codigo !== ref.codigo && semOSufixo(i.codigo, sufixo).startsWith(base))
    if (daBase.length > 0) {
        return falta(ref, 'DESCRICAO_NAO_BATE', daBase.map((item) => ({ item, porque: `o código começa com ${base}, mas a descrição é outra` })))
    }
    return falta(ref, 'NAO_ACHADA', [])
}

export const ROTULO_DO_COMO: Record<ComoAchou, string> = {
    exato: 'código exato',
    sufixo_do_fornecedor: 'sufixo do fornecedor',
    cor: 'base com a cor',
    aproximado_com_descricao: 'aproximado, com a descrição igual',
}

function falta<I extends ItemResolvivel>(ref: ReferenciaProcurada, motivo: MotivoDaFalta, candidatas: Array<CandidataRecusada<I>>): ResolucaoDeReferencia<I> {
    const lista = candidatas.map((c) => `${c.item.codigo}${c.item.descricao ? ` (${c.item.descricao})` : ''}`).join('; ')
    const frase = motivo === 'NAO_ACHADA'
        ? `o código ${ref.codigo} não está na tabela de preço do fornecedor do motor`
        : motivo === 'AMBIGUA'
            ? `o código ${ref.codigo} tem ${candidatas.length} candidatos na tabela de preço do fornecedor do motor, e nenhum é escolhido: ${lista}`
            : `o código ${ref.codigo} não está na tabela de preço do fornecedor do motor; com a mesma base há ${lista}, mas a descrição não é a de ${ref.descricao ?? ref.codigo}`
    return { achada: false, motivo, procurado: ref.codigo, candidatas, frase }
}
