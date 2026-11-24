/**
 * A DESCRIÇÃO DA TIPOLOGIA COMO O VENDEDOR A LÊ (dono do produto, 24/11/2026; pedido 0023): "de novo aparecendo que tem módulos horizontais e
 * módulos verticais. Não existe essa merda. É um módulo só. Maxiar é um módulo só."
 *
 * A tipologia do motor é PARAMÉTRICA: a `DP-128` é `MAXIM-AR COM "N" MÓDULOS HORIZONTAIS E 01 MÓDULO VERTICAL | PERFIL MODULAÇÃO | EUROPA 60`,
 * e `N` é a variável "QUANTIDADE DE MÓDULOS HORIZONTAIS" (padrão 1). O que o vendedor lê é a descrição RESOLVIDA com o que foi escolhido:
 *   - SEM a linha de perfil e SEM o tipo de modulação (o que vem depois do primeiro `|`);
 *   - SEM o código da tipologia (quem chama não o escreve);
 *   - COM UM MÓDULO NÃO SE ESCREVE MÓDULO: `DP-128` com N = 1 é "Maxim-ar", `DP-142` com N = 1 é "Fixo". Palavras do dono do produto: "quando é
 *     um módulo, é indiferente se é vertical ou horizontal. A primeira medida, a largura, é sempre a largura. A segunda, a altura, é sempre a
 *     altura. Aí já tem a especificação." As palavras horizontal e vertical só aparecem com DOIS OU MAIS naquele sentido:
 *     "Maxim-ar com 02 módulos horizontais", "Fixo com 02 módulos verticais".
 *
 * O número de módulos vem da descrição quando ela o fixa ("01 MÓDULO VERTICAL", "03 MÓDULOS VERTICAIS") e da VARIÁVEL entre aspas quando ela o
 * deixa aberto ("N", "V") — o valor gravado nas escolhas do item. A variável SEM valor conhecido NÃO vira "um módulo" nem some: a descrição diz
 * que a quantidade está por definir (`ausente-vs-falso.md`).
 *
 * A descrição que não é de módulos (JANELA DE CORRER 02 FOLHAS MÓVEIS…) sai como está, só sem o que vem depois do `|`. Puro: não lê banco.
 */

/** A quantidade de módulos num sentido: fixa na descrição, ou a de uma variável (o código entre aspas). */
export type QuantidadeDeModulos = { fixo: number } | { variavel: string }
/** O que a descrição diz dos módulos: o nome antes do "COM", e a quantidade em cada sentido (nulo = a descrição não fala daquele sentido). */
export type ModulosDaDescricao = { nome: string; horizontal: QuantidadeDeModulos | null; vertical: QuantidadeDeModulos | null }

const SENTIDO: Record<string, 'horizontal' | 'vertical'> = { HORIZONTAL: 'horizontal', HORIZONTAIS: 'horizontal', HZ: 'horizontal', VERTICAL: 'vertical', VERTICAIS: 'vertical', VT: 'vertical' }
const PARTE = /^(?:"([A-Z][A-Z0-9]*)"|(\d+))\s+M[ÓO]DULOS?\s+(HORIZONTAL|HORIZONTAIS|HZ|VERTICAL|VERTICAIS|VT)$/

/** O que vem antes do primeiro `|`: a descrição sem o tipo de modulação e sem a linha de perfil. */
export const semALinha = (descricao: string): string => descricao.split('|')[0].replace(/\s+/g, ' ').trim()

/**
 * Os módulos da descrição: `<NOME> COM <q> MÓDULO(S) <sentido> [E <q> MÓDULO(S) <sentido>]`. Nulo quando a descrição não tem essa forma INTEIRA
 * (um pedaço que não se lê não é adivinhado), ou repete o mesmo sentido.
 */
export function modulosDaDescricao(descricao: string | null | undefined): ModulosDaDescricao | null {
    if (!descricao) return null
    const m = /^(.+?)\s+COM\s+(.+)$/.exec(semALinha(descricao).toLocaleUpperCase('pt-BR'))
    if (!m) return null
    const lido: ModulosDaDescricao = { nome: m[1].trim(), horizontal: null, vertical: null }
    for (const parte of m[2].split(/\s+E\s+/)) {
        const p = PARTE.exec(parte.trim())
        if (!p) return null
        const sentido = SENTIDO[p[3]]
        if (lido[sentido] !== null) return null
        lido[sentido] = p[1] !== undefined ? { variavel: p[1] } : { fixo: Number(p[2]) }
    }
    return lido
}

/** As variáveis que dão a quantidade de módulos desta descrição ("N", "V"), na ordem horizontal, vertical. Sem módulos por variável: vazio. */
export function variaveisDeModulo(descricao: string | null | undefined): string[] {
    const m = modulosDaDescricao(descricao)
    if (m === null) return []
    return [m.horizontal, m.vertical].flatMap((q) => (q !== null && 'variavel' in q ? [q.variavel] : []))
}

const comInicialMaiuscula = (t: string) => { const m = t.toLocaleLowerCase('pt-BR'); return m.replace(/\p{L}/u, (l) => l.toLocaleUpperCase('pt-BR')) }
const doisDigitos = (n: number) => String(n).padStart(2, '0')

/**
 * A descrição resolvida, para o vendedor. `valores` são as escolhas do item (o código da variável → o número): a variável de módulo sem valor
 * inteiro maior que zero sai como "a definir", nunca como um módulo. Sem descrição: nulo.
 */
export function descricaoParaOVendedor(descricao: string | null | undefined, valores: Readonly<Record<string, number | null | undefined>> | null = null): string | null {
    if (!descricao || semALinha(descricao) === '') return null
    const m = modulosDaDescricao(descricao)
    if (m === null) return comInicialMaiuscula(semALinha(descricao))
    const quantidade = (q: QuantidadeDeModulos | null): number | 'a_definir' | null => {
        if (q === null) return null
        if ('fixo' in q) return q.fixo
        const v = valores?.[q.variavel]
        return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : 'a_definir'
    }
    const partes = ([['horizontais', quantidade(m.horizontal)], ['verticais', quantidade(m.vertical)]] as const).flatMap(([sentido, q]) =>
        (q === 'a_definir' ? [`módulos ${sentido} a definir`] : q !== null && q >= 2 ? [`${doisDigitos(q)} módulos ${sentido}`] : []))
    return `${comInicialMaiuscula(m.nome)}${partes.length ? ` com ${partes.join(' e ')}` : ''}`
}
