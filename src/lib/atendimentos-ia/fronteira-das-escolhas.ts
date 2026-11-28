/**
 * A FRONTEIRA ENTRE O AGENTE E O MOTOR, nas escolhas (dono do produto, 20/11/2026): "vamos tirar do motor a decisão; ele fica somente com as coisas
 * que são competidas a ele, e as do agente têm que ser bem claras que são do agente."
 *
 * OS QUATRO ESTÁGIOS, e o que cada um NUNCA faz:
 *   1. AGENTE — identifica (família > linha > formato > folhas/módulos > variações, medidas, quantidade, cor, vidro, cliente). NUNCA calcula peça
 *      nem consulta preço. Na etapa 1 ele lê a aba Variáveis SEM a coluna Padrão (`paraOAgente`).
 *   2. MOTOR — aplica (peças com medida de corte, vidros, baguetes, insumos, aproveitamento, tempo). NUNCA escolhe tipologia nem decide variação.
 *   3. FORNECEDOR — dá valor por insumo (bruto, desconto comercial, créditos, líquido). NUNCA muda quantidade.
 *   4. PRECIFICAÇÃO — fecha o preço (fabricação e margem, por família). NUNCA mexe em material.
 *
 * Este módulo é a PORTA do estágio 1 para o 2: antes de o motor avaliar uma esquadria, cada variável COM OPÇÕES da tipologia recebe o seu valor, e
 * a origem dele, nesta ordem:
 *   1. o que o VENDEDOR disse;
 *   2. a POLÍTICA DA EMPRESA (`politica-da-empresa.ts`): o campo definido vale, sem perguntar; e, com a NATUREZA da variável (20261121000001),
 *      a de natureza CALCULO fica com o padrão do motor, mesmo que acrescente peça (o motor resolve; o agente nem vê);
 *   3. o PADRÃO DO MOTOR, só quando ele NÃO acrescenta peça;
 *   4. quando o padrão acrescenta peça: a PRINCIPAL — a opção com o MENOR conjunto de linhas (perfis, insumos, vidros) que entram, se ela existe e é
 *      única (a regra da travessa, de 19/11/2026, para toda variável);
 *   5. sem principal (as opções trocam uma peça por outra, nenhuma é a de menos), ou a política que não casa opção: VOLTA AO AGENTE, nomeada.
 * Depois disso o motor só usa padrão em variável SEM opções (as medidas: a altura da travessa, os módulos); a variável com opções sem valor é recusa
 * do avaliador (`VARIAVEL_DE_IDENTIFICACAO`) — a decisão nunca acontece lá dentro.
 *
 * "ACRESCENTA PEÇA", sem lista: pelo próprio motor. Para a variável X, o conjunto de linhas cuja Condição é verdadeira com X em cada opção (as demais
 * nos valores que já têm). O padrão acrescenta peça quando outra opção dá um conjunto ESTRITAMENTE MENOR (contido nele). A Condição que não se avalia
 * conta como presente nas duas (não decide). Medido em 20/11/2026 no motor 259035a9: as 8.584 condições das regras são expressões de variáveis, sem L
 * nem H. O que esta conta NÃO vê: a quantidade de uma linha que muda com X (a fórmula da quantidade) — só a presença.
 *
 * A RESSALVA DA TRAVESSA (19/11/2026) continua: a tipologia que já diz "travessa" no nome tem a peça por ser dela (`PECAS_QUE_NAO_ENTRAM_POR_PADRAO`).
 */
import { avaliarTexto, opcoesDaVariavel, type Tipologia } from '@/lib/atendimentos-ia/avaliador-de-formulas'
import { PECAS_QUE_NAO_ENTRAM_POR_PADRAO } from '@/lib/atendimentos-ia/escolhas-da-tipologia'
import { naturezaNaPolitica, traduzirPolitica, type PoliticaDaEmpresa } from '@/lib/atendimentos-ia/politica-da-empresa'

export type OrigemDaEscolha = 'vendedor' | 'politica' | 'politica_ajuste_em_obra' | 'tipologia' | 'calculo' | 'pela_cor' | 'pela_largura' | 'pelo_acionamento' | 'padrao_do_motor' | 'principal'
export type VoltaAoAgente = { variavel: string; descricao: string; frase: string }
/** `ajustes`: as variáveis em que a política não existia na variação e entrou a opção de ajuste em obra (ou a 1), com o motivo — o rastro. */
/** `equivalencias`: as variáveis em que a opção da política entrou com outro rótulo (a lista não separa a chave), com o motivo — o rastro. */
/** `pelaTipologia`: as variáveis em que a lista da tipologia não tem a opção da política, e entrou o padrão dela, com o motivo — o rastro. */
export type EscolhasDoCalculo = { escolhas: Record<string, number>; origem: Record<string, OrigemDaEscolha>; voltas: VoltaAoAgente[]; ajustes: Array<{ variavel: string; motivo: string }>; equivalencias: Array<{ variavel: string; motivo: string }>; pelaTipologia: Array<{ variavel: string; motivo: string }> }

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '')
const numeroDoPadrao = (p: string | null) => (/^-?\d+(\.\d+)?$/.test((p ?? '').trim()) ? Number((p ?? '').trim()) : null)

/** As condições das linhas que podem entrar (perfis, insumos, vidros), na ordem: a matéria da conta das peças. */
const condicoesDasLinhas = (t: Tipologia): string[] => [...t.perfis.map((p) => p.condicao), ...(t.insumos ?? []).map((i) => i.condicao), ...(t.vidros ?? []).map((v) => v.condicao)]

/** As linhas que entram com estes valores: verdadeira entra; a que não se avalia entra também (não decide nada, porque entra em todas). */
function linhasQueEntram(condicoes: readonly string[], valores: Readonly<Record<string, number>>): Set<number> {
    const entram = new Set<number>()
    condicoes.forEach((c, i) => {
        const t = (c ?? '').trim()
        if (t === '' || t === 'sempre') { entram.add(i); return }
        const r = avaliarTexto(t, valores)
        if ('recusa' in r || r.valor === true) entram.add(i)
    })
    return entram
}
const contido = (a: Set<number>, b: Set<number>) => [...a].every((x) => b.has(x))
const estritamenteContido = (a: Set<number>, b: Set<number>) => a.size < b.size && contido(a, b)

/** A variável está ativa (a Condição dela vale com os valores de agora)? A que não se avalia, ativa. */
function ativa(condicao: string | null, valores: Readonly<Record<string, number>>): boolean {
    const c = (condicao ?? '').trim()
    if (c === '' || c === 'sempre') return true
    const r = avaliarTexto(c, valores)
    return 'recusa' in r ? true : r.valor === true
}

export const fraseDaVoltaSemPrincipal = (tipologia: string, descricao: string, opcoes: string) =>
    `${descricao.toLowerCase()} (tipologia ${tipologia}) não foi dito pelo vendedor nem definido na política da empresa, e o padrão do motor acrescenta peça; como as opções trocam uma peça por outra (${opcoes}), nenhuma é a de menos: diga qual`

/**
 * As escolhas com que o motor vai avaliar a esquadria, decididas FORA dele. `ditas` são as do vendedor (e as que o agente já gravou); `descricao`
 * é a da tipologia, para a ressalva da travessa.
 */
/**
 * A PERSIANA PELA COR DA ESQUADRIA (dono do produto, 26/11/2026, pedido 0038; como o WVetro faz no orçamento 1207, todo em preto liso): o modelo
 * da palheta (`PP`: 37 = PVC 37 mm, 57 = PVC 57 mm, 45 = alumínio 45 mm) tem o padrão PELA COR — BRANCO dá 37 (a persiana de PVC, que só existe
 * em branco); qualquer outra cor dá 45 (o alumínio, que entra em PRETO pela peça sem a cor). Só o vendedor que disse o modelo vence a cor. Na
 * esquadria BRANCA a política da empresa vale (pedido 0039); nas outras cores, a cor vence a política. A opção que a tipologia não tem não entra.
 */
export const VARIAVEL_DA_PALHETA = 'PP'
export const palhetaPelaCor = (cor: string): number => (semAcento(cor).toUpperCase().trim() === 'BRANCO' ? 37 : 45)
/**
 * O modelo da palheta que a COR DA ESQUADRIA impõe por cima da política (pedido 0039): 45 numa esquadria que não é BRANCO, quando a tipologia tem
 * a opção; null quando a cor não decide (BRANCO, sem cor, outra variável, opção ausente). Um critério só, para o cálculo e para o arquivo.
 */
export function palhetaQueACorImpoe(v: { variavel: string; opcoes: string | null }, cor: string | null | undefined): number | null {
    if (cor === null || cor === undefined || cor.trim() === '' || v.variavel !== VARIAVEL_DA_PALHETA) return null
    const pelaCor = palhetaPelaCor(cor)
    return pelaCor !== 37 && (opcoesDaVariavel(v.opcoes) ?? []).some((o) => o.valor === pelaCor) ? pelaCor : null
}
/**
 * A COR DOS ACESSÓRIOS PELA COR DO PERFIL (dono do produto, 27/11/2026, pedido 0040; como o WVetro no orçamento 1207, todo em preto liso): a
 * variável `CA` ("1 = BRANCO; 2 = PRETO; 3 = MARROM" no motor 259035a9) segue a cor da esquadria — BRANCO se o perfil é branco, PRETO em qualquer
 * outra cor. É ela que liga os insumos pretos (13229, 3579, 3609, 24079, 9419, 87349, 4569, 12349, 20354). Como a palheta: a cor vence a política e o
 * padrão do motor, e só o vendedor que disse a cor dos acessórios vence a cor. A opção é achada pelo RÓTULO (nunca pelo número), e a tipologia sem a
 * opção não a ganha (null: a cor não decide).
 */
export const VARIAVEL_DA_COR_DOS_ACESSORIOS = 'CA'
export function corDosAcessoriosQueACorImpoe(v: { variavel: string; opcoes: string | null }, cor: string | null | undefined): number | null {
    if (cor === null || cor === undefined || cor.trim() === '' || v.variavel !== VARIAVEL_DA_COR_DOS_ACESSORIOS) return null
    const alvo = semAcento(cor).toUpperCase().trim() === 'BRANCO' ? 'BRANCO' : 'PRETO'
    const achadas = (opcoesDaVariavel(v.opcoes) ?? []).filter((o) => semAcento(o.rotulo).toUpperCase().trim() === alvo)
    return achadas.length === 1 ? achadas[0].valor : null
}
/**
 * O DIVISOR CENTRAL DA PERSIANA PELA LARGURA NOMINAL (dono do produto, 27/11/2026, pedido 0041): "regra da fábrica, igual para JP e PJP". A persiana
 * só leva o mancal divisor (MD = SIM: BZ4556, 4661 ×2, duas esteiras) com a largura nominal do item >= 1800 mm; abaixo, lâmina inteira, sem divisor.
 * A política diz SIM e vale para as largas; para as estreitas a LARGURA decide (a opção "NÃO" achada pelo RÓTULO); null quando a largura não decide.
 */
export const VARIAVEL_DO_DIVISOR_DA_PERSIANA = 'MD'
export const LARGURA_MINIMA_DO_DIVISOR_MM = 1800
export function opcaoQueALarguraImpoe(v: { variavel: string; opcoes: string | null }, larguraMm: number | null | undefined): number | null {
    if (larguraMm === null || larguraMm === undefined || !(larguraMm > 0) || v.variavel !== VARIAVEL_DO_DIVISOR_DA_PERSIANA || larguraMm >= LARGURA_MINIMA_DO_DIVISOR_MM) return null
    const achadas = (opcoesDaVariavel(v.opcoes) ?? []).filter((o) => semAcento(o.rotulo).toUpperCase().trim().startsWith('NAO'))
    return achadas.length === 1 ? achadas[0].valor : null
}
/**
 * O TIPO DE ACIONAMENTO DA PERSIANA PELO ACIONAMENTO E PELA DIVISÓRIA (dono do produto, 27/11/2026, pedido 0043): "um pano (sem divisória) = 1 recolhedor; com
 * divisória (largura nominal >= 1800 mm) = 2 recolhedores, um por pano". LA = ACIONAMENTO ÚNICO (1) ou AMBOS OS LADOS (2, um por pano). Manual (recolhedor): a divisória
 * decide. Motor: sem divisória, 1 motor; com divisória o VENDEDOR diz — simultâneo (1 motor para os 2 panos, LA único) ou individual (1 por pano) — e, sem
 * ele dizer, a pergunta volta ao agente. As opções são achadas pelo RÓTULO.
 */
export const VARIAVEL_DO_TIPO_DE_ACIONAMENTO = 'LA'
export const VARIAVEL_DO_ACIONAMENTO = 'AE'
/**
 * O TUBO DA PERSIANA PELO ACIONAMENTO (dono do produto, 27/11/2026, pedido 0043): Ø40MM no acionamento MANUAL (recolhedor) — o padrão da política (TB) —, e Ø60MM quando
 * há MOTOR (é o tubo que recebe o motor; o 1930, o adaptador de ponteira de 60 mm, sai com ele). O código decide pelo acionamento; o que o vendedor disser vale sobre a regra.
 */
export const VARIAVEL_DO_TUBO = 'TB'
/** A opção que a COR DA ESQUADRIA impõe na variável (a palheta ou a cor dos acessórios); null quando a cor não decide aquela variável. */
export const opcaoQueACorImpoe = (v: { variavel: string; opcoes: string | null }, cor: string | null | undefined): number | null =>
    palhetaQueACorImpoe(v, cor) ?? corDosAcessoriosQueACorImpoe(v, cor)
/**
 * A tipologia SÓ COM AS VARIÁVEIS (pedido 0054, 28/11/2026, produção quebrada): o contexto dos documentos (o arquivo do orçamento, a precificação) lê da
 * tipologia só a aba Variáveis (`VariaveisDaTipologia`); as linhas de peça (perfis, insumos, vidros, fórmulas) ficam no motor. `escolhasDoCalculo` percorre
 * as linhas (`condicoesDasLinhas`), e passar a definição parcial no lugar da tipologia — um cast — derrubava com "Cannot read properties of undefined
 * (reading 'map')" todo item com acionamento (AE: DP-17, DP-69…). Aqui a falta das linhas é declarada: lista vazia. Com ela, as decisões que não olham as
 * peças (a política, a persiana pela cor, a divisória pela largura, o tipo de acionamento e o tubo) saem como no cálculo; o "padrão do motor só quando
 * não acrescenta peça" vê zero peças e assume o padrão — nunca a "principal" —, e é por isso que só o ACIONAMENTO é lido daqui.
 */
export function tipologiaSoComVariaveis(def: Pick<Tipologia, 'variaveis'>, codigo: string): Tipologia {
    return {
        codigo, detalhe: { larg_min_mm: null, larg_max_mm: null, alt_min_mm: null, alt_max_mm: null },
        variaveis: def.variaveis, formulas: [], perfis: [], validacoes: [],
    }
}

export function escolhasDoCalculo(tipologia: Tipologia, ditas: Readonly<Record<string, number>>, politica: PoliticaDaEmpresa, descricao: string | null = null,
    cor: string | null = null, larguraMm: number | null = null): EscolhasDoCalculo {
    const escolhas: Record<string, number> = { ...ditas }
    const origem: Record<string, OrigemDaEscolha> = Object.fromEntries(Object.keys(ditas).map((k) => [k, 'vendedor' as const]))
    const voltas: VoltaAoAgente[] = []
    const ajustes: Array<{ variavel: string; motivo: string }> = []
    const equivalencias: Array<{ variavel: string; motivo: string }> = []
    const pelaTipologia: Array<{ variavel: string; motivo: string }> = []
    const condicoes = condicoesDasLinhas(tipologia)
    // os valores da conta: o que já foi decidido e, nas demais, o padrão do motor (para avaliar as condições; não é decisão)
    const valores = (): Record<string, number> => {
        const v: Record<string, number> = {}
        for (const x of tipologia.variaveis) { const n = numeroDoPadrao(x.padrao); if (n !== null) v[x.variavel] = n }
        return Object.assign(v, escolhas)
    }
    const comOpcoes = tipologia.variaveis.filter((v) => (opcoesDaVariavel(v.opcoes)?.length ?? 0) > 0 && escolhas[v.variavel] === undefined)

    // a menor das opções pelas peças: a que entra com o conjunto contido no de todas as outras; null se não há uma só
    const principalDe = (variavel: string, opcoes: number[]): number | null => {
        const conjuntos = opcoes.map((o) => ({ o, linhas: linhasQueEntram(condicoes, { ...valores(), [variavel]: o }) }))
        const menores = conjuntos.filter((c) => conjuntos.every((x) => contido(c.linhas, x.linhas)))
        return menores.length >= 1 && menores.every((m) => m.linhas.size === menores[0].linhas.size) ? Math.min(...menores.map((m) => m.o)) : null
    }

    // A COR VENCE A POLÍTICA NA PERSIANA (dono do produto, 26/11/2026, pedido 0039): na esquadria que não é BRANCO, a política (a De Paula diz PP =
    // PVC 37) não decide o modelo da palheta — a persiana de PVC só existe em branco; quem decide é a cor (45, o alumínio). Na BRANCA, a política vale
    // e a COR DOS ACESSÓRIOS segue a cor do perfil em qualquer cor (pedido 0040)
    const temAcionamento = tipologia.variaveis.some((x) => x.variavel === VARIAVEL_DO_ACIONAMENTO && (opcoesDaVariavel(x.opcoes)?.length ?? 0) > 0)
    const palhetaPelaCorVence = (v: { variavel: string; opcoes: string | null }) => opcaoQueACorImpoe(v, cor) !== null || opcaoQueALarguraImpoe(v, larguraMm) !== null
        || ((v.variavel === VARIAVEL_DO_TIPO_DE_ACIONAMENTO || v.variavel === VARIAVEL_DO_TUBO) && temAcionamento)
    // 2. a política da empresa
    for (const v of comOpcoes) {
        if (palhetaPelaCorVence(v)) continue
        const t = traduzirPolitica(tipologia.codigo, v, politica)
        if (t === null) continue
        if ('recusa' in t) { voltas.push({ variavel: v.variavel, descricao: v.descricao ?? v.variavel, frase: t.recusa }); continue }
        if ('valor' in t) {
            escolhas[v.variavel] = t.valor
            origem[v.variavel] = t.ajuste !== undefined ? 'politica_ajuste_em_obra' : t.pelaTipologia !== undefined ? 'tipologia' : 'politica'
            if (t.ajuste !== undefined) ajustes.push({ variavel: v.variavel, motivo: t.ajuste })
            if (t.equivalencia !== undefined) equivalencias.push({ variavel: v.variavel, motivo: t.equivalencia })
            if (t.pelaTipologia !== undefined) pelaTipologia.push({ variavel: v.variavel, motivo: t.pelaTipologia })
            continue
        }
        const opcoes = (opcoesDaVariavel(v.opcoes) ?? []).map((o) => o.valor)
        const sem = principalDe(v.variavel, opcoes)
        if (sem === null) { voltas.push({ variavel: v.variavel, descricao: v.descricao ?? v.variavel, frase: `a política da empresa diz ${t.campo} = não, e nenhuma opção de ${v.variavel} da tipologia ${tipologia.codigo} é a de menos peças` }); continue }
        escolhas[v.variavel] = sem
        origem[v.variavel] = 'politica'
    }
    // 2b. a PERSIANA PELA COR (pedido 0038): no lugar do padrão do motor, o modelo que a cor da esquadria pede
    const palheta = cor === null ? undefined : comOpcoes.find((v) => v.variavel === VARIAVEL_DA_PALHETA)
    if (palheta && cor !== null && escolhas[palheta.variavel] === undefined && !voltas.some((x) => x.variavel === palheta.variavel) && ativa(palheta.condicao, valores())) {
        const pelaCor = palhetaPelaCor(cor)
        if ((opcoesDaVariavel(palheta.opcoes) ?? []).some((o) => o.valor === pelaCor)) {
            escolhas[palheta.variavel] = pelaCor
            origem[palheta.variavel] = 'pela_cor'
        }
    }
    // 2c. a COR DOS ACESSÓRIOS pela cor do perfil (pedido 0040): BRANCO no perfil branco, PRETO em qualquer outro
    const acessorios = cor === null ? undefined : comOpcoes.find((v) => v.variavel === VARIAVEL_DA_COR_DOS_ACESSORIOS)
    if (acessorios && escolhas[acessorios.variavel] === undefined && !voltas.some((x) => x.variavel === acessorios.variavel) && ativa(acessorios.condicao, valores())) {
        const pelaCor = corDosAcessoriosQueACorImpoe(acessorios, cor)
        if (pelaCor !== null) {
            escolhas[acessorios.variavel] = pelaCor
            origem[acessorios.variavel] = 'pela_cor'
        }
    }
    // 2d. o DIVISOR DA PERSIANA pela largura nominal (pedido 0041): abaixo de 1800 mm, sem mancal divisor
    const divisor = comOpcoes.find((v) => v.variavel === VARIAVEL_DO_DIVISOR_DA_PERSIANA)
    if (divisor && escolhas[divisor.variavel] === undefined && ativa(divisor.condicao, valores())) {
        const pelaLargura = opcaoQueALarguraImpoe(divisor, larguraMm)
        if (pelaLargura !== null) {
            escolhas[divisor.variavel] = pelaLargura
            origem[divisor.variavel] = 'pela_largura'
        }
    }
    // 3, 4 e 5. o padrão do motor, só quando não acrescenta peça; senão a principal; senão volta ao agente
    for (const v of comOpcoes) {
        if (escolhas[v.variavel] !== undefined || voltas.some((x) => x.variavel === v.variavel)) continue
        if ((v.variavel === VARIAVEL_DO_TIPO_DE_ACIONAMENTO || v.variavel === VARIAVEL_DO_TUBO) && temAcionamento) continue // pela regra do acionamento, abaixo
        if (!ativa(v.condicao, valores())) continue
        const padrao = numeroDoPadrao(v.padrao)
        if (padrao === null) continue // sem padrão: o avaliador recusa pelo nome, como sempre
        // A NATUREZA CALCULO (20261121000001): o motor resolve com o padrão dele — mesmo que acrescente peça —, e o agente nem vê (nunca volta)
        if (naturezaNaPolitica(politica, v.variavel)?.natureza === 'CALCULO') {
            escolhas[v.variavel] = padrao
            origem[v.variavel] = 'calculo'
            continue
        }
        const opcoes = (opcoesDaVariavel(v.opcoes) ?? []).map((o) => o.valor)
        const doPadrao = linhasQueEntram(condicoes, { ...valores(), [v.variavel]: padrao })
        const acrescenta = opcoes.some((o) => o !== padrao && estritamenteContido(linhasQueEntram(condicoes, { ...valores(), [v.variavel]: o }), doPadrao))
        const doNome = PECAS_QUE_NAO_ENTRAM_POR_PADRAO[v.variavel]
        if (!acrescenta || (doNome && descricao !== null && doNome.test(semAcento(descricao)))) {
            escolhas[v.variavel] = padrao
            origem[v.variavel] = 'padrao_do_motor'
            continue
        }
        const principal = principalDe(v.variavel, opcoes)
        if (principal === null) {
            const lista = (opcoesDaVariavel(v.opcoes) ?? []).map((o) => o.rotulo).join('; ')
            voltas.push({ variavel: v.variavel, descricao: v.descricao ?? v.variavel, frase: fraseDaVoltaSemPrincipal(tipologia.codigo, v.descricao ?? v.variavel, lista) })
            continue
        }
        escolhas[v.variavel] = principal
        origem[v.variavel] = 'principal'
    }
    // 6. o TIPO DE ACIONAMENTO da persiana (pedido 0043), depois de o acionamento (AE) e a divisória (MD) estarem decididos
    const la = comOpcoes.find((v) => v.variavel === VARIAVEL_DO_TIPO_DE_ACIONAMENTO)
    if (la && temAcionamento && escolhas[la.variavel] === undefined && escolhas[VARIAVEL_DO_ACIONAMENTO] !== undefined && ativa(la.condicao, valores())) {
        const rotulo = (v: { variavel: string; opcoes: string | null } | undefined, valor: number | undefined) =>
            v === undefined || valor === undefined ? '' : semAcento((opcoesDaVariavel(v.opcoes) ?? []).find((o) => o.valor === valor)?.rotulo ?? '').toUpperCase().trim()
        const opcaoLA = (inicio: string) => (opcoesDaVariavel(la.opcoes) ?? []).find((o) => semAcento(o.rotulo).toUpperCase().trim().startsWith(inicio))?.valor
        const md = tipologia.variaveis.find((x) => x.variavel === VARIAVEL_DO_DIVISOR_DA_PERSIANA)
        const mdSim = (opcoesDaVariavel(md?.opcoes ?? null) ?? []).find((o) => semAcento(o.rotulo).toUpperCase().trim().startsWith('SIM'))?.valor
        const dividida = mdSim !== undefined && escolhas[VARIAVEL_DO_DIVISOR_DA_PERSIANA] === mdSim
        const aeRotulo = rotulo(tipologia.variaveis.find((x) => x.variavel === VARIAVEL_DO_ACIONAMENTO), escolhas[VARIAVEL_DO_ACIONAMENTO])
        const unico = opcaoLA('ACIONAMENTO UNICO'), ambos = opcaoLA('ACIONAMENTO AMBOS')
        if (aeRotulo.startsWith('RECOLHEDOR') && unico !== undefined && ambos !== undefined) {
            escolhas[la.variavel] = dividida ? ambos : unico
            origem[la.variavel] = 'pelo_acionamento'
        } else if (aeRotulo.startsWith('MOTOR') && unico !== undefined && ambos !== undefined) {
            if (!dividida) { escolhas[la.variavel] = unico; origem[la.variavel] = 'pelo_acionamento' }
            else voltas.push({ variavel: la.variavel, descricao: la.descricao ?? la.variavel,
                frase: `o acionamento da persiana da tipologia ${tipologia.codigo} é a motor e o item tem divisória (1800 mm ou mais): o motor é simultâneo (1 motor para os 2 panos) ou individual (1 motor por pano)? Diga qual.` })
        }
    }
    // 6b. o TUBO da persiana pelo acionamento (pedido 0043): Ø60MM com motor; sem motor, o que a política diz (Ø40MM) ou o padrão do motor
    const tb = comOpcoes.find((v) => v.variavel === VARIAVEL_DO_TUBO)
    if (tb && temAcionamento && escolhas[tb.variavel] === undefined && escolhas[VARIAVEL_DO_ACIONAMENTO] !== undefined && ativa(tb.condicao, valores())) {
        const aeOpcao = (opcoesDaVariavel(tipologia.variaveis.find((x) => x.variavel === VARIAVEL_DO_ACIONAMENTO)?.opcoes ?? null) ?? []).find((o) => o.valor === escolhas[VARIAVEL_DO_ACIONAMENTO])
        const comMotor = semAcento(aeOpcao?.rotulo ?? '').toUpperCase().trim().startsWith('MOTOR')
        const sessenta = (opcoesDaVariavel(tb.opcoes) ?? []).filter((o) => /60/.test(o.rotulo))
        if (comMotor && sessenta.length === 1) { escolhas[tb.variavel] = sessenta[0].valor; origem[tb.variavel] = 'pelo_acionamento' }
        else {
            const t = traduzirPolitica(tipologia.codigo, tb, politica)
            const padrao = numeroDoPadrao(tb.padrao)
            if (t && 'valor' in t) { escolhas[tb.variavel] = t.valor; origem[tb.variavel] = 'politica' }
            else if (padrao !== null) { escolhas[tb.variavel] = padrao; origem[tb.variavel] = 'padrao_do_motor' }
        }
    }
    return { escolhas, origem, voltas, ajustes, equivalencias, pelaTipologia }
}
