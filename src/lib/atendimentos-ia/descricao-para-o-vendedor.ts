/**
 * A DESCRIÇÃO DA TIPOLOGIA COMO O VENDEDOR A LÊ (dono do produto, 24/11/2026; pedido 0023): "de novo aparecendo que tem módulos horizontais e
 * módulos verticais. Não existe essa merda. É um módulo só. Maxiar é um módulo só."
 *
 * A tipologia do motor é PARAMÉTRICA: a `DP-128` é `MAXIM-AR COM "N" MÓDULOS HORIZONTAIS E 01 MÓDULO VERTICAL | PERFIL MODULAÇÃO | EUROPA 60`,
 * e `N` é a variável "QUANTIDADE DE MÓDULOS HORIZONTAIS" (padrão 1). O que o vendedor lê é a descrição RESOLVIDA com o que foi escolhido:
 *   - SEM a linha de perfil (o ÚLTIMO trecho entre barras) e SEM o tipo de modulação (o trecho que diz "MODULAÇÃO" ou "COLUNA");
 *   - COM o que a esquadria TEM, que o motor escreve nos trechos do meio e não é linha nem modulação — "BANDEIRA FIXA", "VENEZIANA",
 *     "02 VIDROS - 01 TELA", "TRILHO PVC EMBUTIDO" (medido nas 164 descrições do motor Wolff em 24/11/2026: 29 trechos distintos no meio,
 *     5 deles de modulação; o último é sempre a linha — EUROPA 42, EUROPA 60 ou DESIGN);
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
 * A descrição que não é de módulos (JANELA DE CORRER 02 FOLHAS MÓVEIS…) sai como está, sem a linha e sem a modulação. Puro: não lê banco.
 */

/** A quantidade de módulos num sentido: fixa na descrição, ou a de uma variável (o código entre aspas). */
export type QuantidadeDeModulos = { fixo: number } | { variavel: string }
/** O que a descrição diz dos módulos: o nome antes do "COM", e a quantidade em cada sentido (nulo = a descrição não fala daquele sentido). */
export type ModulosDaDescricao = { nome: string; horizontal: QuantidadeDeModulos | null; vertical: QuantidadeDeModulos | null }

const SENTIDO: Record<string, 'horizontal' | 'vertical'> = { HORIZONTAL: 'horizontal', HORIZONTAIS: 'horizontal', HZ: 'horizontal', VERTICAL: 'vertical', VERTICAIS: 'vertical', VT: 'vertical' }
const PARTE = /^(?:"([A-Z][A-Z0-9]*)"|(\d+))\s+M[ÓO]DULOS?\s+(HORIZONTAL|HORIZONTAIS|HZ|VERTICAL|VERTICAIS|VT)$/

/** O trecho que diz o TIPO DE MODULAÇÃO: "PERFIL MODULAÇÃO", "MODULAÇÃO TRAVESSA", "PERFIL COLUNA", "MOD COLUNA" (a palavra MODULAÇÃO ou COLUNA). */
const DE_MODULACAO = /\bMODULA[ÇC][ÃA]O\b|\bCOLUNA\b/i

/**
 * Os trechos da descrição, entre barras: o PRINCIPAL (o primeiro), o que a esquadria TEM (os do meio que não são modulação), o TIPO DE
 * MODULAÇÃO (os do meio que são) e a LINHA de perfil (o último, quando há barra). Sem barra nenhuma, tudo é o principal.
 */
export function trechosDaDescricao(descricao: string | null | undefined): { principal: string; tem: string[]; modulacao: string[]; linha: string | null } {
    const trechos = (descricao ?? '').split('|').map((x) => x.replace(/\s+/g, ' ').trim())
    const meio = trechos.slice(1, -1).filter((x) => x !== '')
    return {
        principal: trechos[0], tem: meio.filter((x) => !DE_MODULACAO.test(x)), modulacao: meio.filter((x) => DE_MODULACAO.test(x)),
        linha: trechos.length > 1 ? trechos[trechos.length - 1] : null,
    }
}

/**
 * Os módulos da descrição: `<NOME> COM <q> MÓDULO(S) <sentido> [E <q> MÓDULO(S) <sentido>]`. Nulo quando a descrição não tem essa forma INTEIRA
 * (um pedaço que não se lê não é adivinhado), ou repete o mesmo sentido.
 */
export function modulosDaDescricao(descricao: string | null | undefined): ModulosDaDescricao | null {
    if (!descricao) return null
    const m = /^(.+?)\s+COM\s+(.+)$/.exec(trechosDaDescricao(descricao).principal.toLocaleUpperCase('pt-BR'))
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
 *
 * A tipologia que ainda NÃO é um item (a candidata de uma pergunta, o limite de uma tipologia) não tem quantidade escolhida a dizer:
 *   - `semValor: 'omite'` não escreve a variável aberta — "Maxim-ar", nunca "Maxim-ar com módulos horizontais a definir" (o limite da tipologia);
 *   - `semValor: 'aberta'` diz o SENTIDO sem número — "Maxim-ar com módulos verticais" —, para a pergunta em que o sentido é o que separa as opções.
 */
export type VariavelSemValor = 'a_definir' | 'omite' | 'aberta'
export function descricaoParaOVendedor(descricao: string | null | undefined, valores: Readonly<Record<string, unknown>> | null = null,
    semValor: VariavelSemValor = 'a_definir', trilhos: number | null = null): string | null {
    const { principal, tem } = trechosDaDescricao(descricao)
    if (principal === '') return null
    // o que a esquadria tem vem depois do nome, como o motor separa (com a barra): "Janela de correr 02 folhas móveis | Bandeira fixa"
    // EM QUANTOS TRILHOS as folhas correm (dono do produto, 25/11/2026, pedido 0025): logo depois das folhas — "Porta de correr 06 folhas móveis
    // em 3 trilhos | Fechamento central". O número vem do marco que o motor escolhe para o item (`trilhos-do-marco.ts`); sem ele, nada se escreve
    const emTrilhos = typeof trilhos === 'number' && Number.isInteger(trilhos) && trilhos > 0 ? ` em ${trilhos} ${trilhos === 1 ? 'trilho' : 'trilhos'}` : ''
    const comOQueTem = (nome: string) => [`${nome}${emTrilhos}`, ...tem.map(comInicialMaiuscula)].join(' | ')
    const m = modulosDaDescricao(descricao)
    if (m === null) return comOQueTem(comInicialMaiuscula(principal))
    const quantidade = (q: QuantidadeDeModulos | null): number | 'a_definir' | 'aberta' | null => {
        if (q === null) return null
        if ('fixo' in q) return q.fixo
        const v = valores?.[q.variavel]
        return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : semValor === 'omite' ? null : semValor
    }
    const partes = ([['horizontais', quantidade(m.horizontal)], ['verticais', quantidade(m.vertical)]] as const).flatMap(([sentido, q]) =>
        (q === 'a_definir' ? [`módulos ${sentido} a definir`] : q === 'aberta' ? [`módulos ${sentido}`] : q !== null && q >= 2 ? [`${doisDigitos(q)} módulos ${sentido}`] : []))
    // UM MÓDULO SÓ (dono do produto, 26/11/2026, pedido 0035; REFERENCIA_UNICA §2.3.4): "Maxim-ar com um módulo", sem horizontal nem
    // vertical. Só quando TODO sentido que a descrição traz é sabido e vale 1 — a quantidade omitida (a candidata) não afirma módulo nenhum
    const sentidos = [m.horizontal, m.vertical].filter((q): q is QuantidadeDeModulos => q !== null).map(quantidade)
    const umModuloSo = sentidos.length > 0 && sentidos.every((q) => q === 1)
    const complemento = partes.length ? ` com ${partes.join(' e ')}` : umModuloSo ? ' com um módulo' : ''
    return comOQueTem(`${comInicialMaiuscula(m.nome)}${complemento}`)
}

/** A tipologia que ainda não é um item (a candidata de uma pergunta), como o vendedor a lê: sem a quantidade que ninguém escolheu. */
export const nomeDaCandidata = (descricao: string | null | undefined, semValor: 'omite' | 'aberta' = 'omite'): string | null => descricaoParaOVendedor(descricao, null, semValor)

/** O TIPO DE MODULAÇÃO da descrição, como ela o escreve ("PERFIL MODULAÇÃO" na DP-128). Vazio quando ela não o traz. */
export const tipoDeModulacao = (descricao: string | null | undefined): string => trechosDaDescricao(descricao).modulacao.join(' | ')

/**
 * AS CANDIDATAS DE UMA PERGUNTA ("este item pode ser A ou B"): cada uma como o vendedor a lê. O tipo de modulação não se escreve — SALVO quando
 * é só ele que separa duas candidatas: aí a pergunta sem ele não teria resposta, e ele entra, entre parênteses e em minúsculas, só nas que
 * ficariam iguais. A linha de perfil nunca entra.
 */
export function nomesDasCandidatas(descricoes: ReadonlyArray<string | null | undefined>, semValor: 'omite' | 'aberta' = 'omite'): string[] {
    const nomes = descricoes.map((d) => nomeDaCandidata(d, semValor) ?? '')
    return nomes.map((nome, k) => {
        const repetido = nomes.some((outro, j) => j !== k && outro === nome)
        const tipo = tipoDeModulacao(descricoes[k]).toLocaleLowerCase('pt-BR')
        return repetido && tipo !== '' ? `${nome} (${tipo})` : nome
    })
}

/**
 * Os valores das variáveis de módulo de um item, para a descrição: o GRAVADO nas escolhas (inteiro maior que zero) e, no item antigo que não o
 * tem, o Padrão da aba Variáveis (`padraoDaVariavel`) — o mesmo número que o cálculo usa. Sem um nem outro, a variável fica de fora, e a
 * descrição a diz "a definir".
 */
export function valoresDosModulos(descricao: string | null | undefined, escolhas: unknown, padraoDaVariavel: (variavel: string) => string | null | undefined = () => null): Record<string, number> {
    const gravadas = escolhas !== null && typeof escolhas === 'object' && !Array.isArray(escolhas) ? escolhas as Record<string, unknown> : {}
    const valores: Record<string, number> = {}
    for (const variavel of variaveisDeModulo(descricao)) {
        const dita = gravadas[variavel]
        if (typeof dita === 'number' && Number.isInteger(dita) && dita > 0) { valores[variavel] = dita; continue }
        const padrao = (padraoDaVariavel(variavel) ?? '').trim()
        if (/^\d+$/.test(padrao) && Number(padrao) > 0) valores[variavel] = Number(padrao)
    }
    return valores
}
