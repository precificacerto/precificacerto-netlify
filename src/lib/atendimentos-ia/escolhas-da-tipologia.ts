/**
 * Atendimentos I.A. — as ESCOLHAS DA TIPOLOGIA que a conversa captura: quais perguntar ao vendedor,
 * em que ordem, como perguntar, e o que aceitar como resposta. Funções puras: não leem banco nem rede.
 *
 * AS REGRAS (dono do produto, 25/10/2026):
 *   - a IA recebe, da aba Variáveis da tipologia, as perguntas com as opções por extenso, e pergunta
 *     ao vendedor em português, UMA de cada vez, só as que faltam;
 *   - ela NUNCA escolhe sozinha quando a opção muda o preço. As capturadas são perguntadas sempre que
 *     se aplicam; o Padrão vale só para as que NÃO são capturadas — e, se o Padrão não fecha, o
 *     levantamento sai como recusa nomeada (`faltou-dado-recusa-nomeada.md`);
 *   - COMEÇA POR ARI, ARE E MAE (`ESCOLHAS_CAPTURADAS`): as três que impediam a DP-02 de fechar. O resto
 *     continua no Padrão. Medido na DP-02: ARI = 3 pede MAI, que NÃO é capturada — o Padrão dela
 *     ("MEDIDA DO VÃO", sem colchete) é recusado pelo avaliador, e a recusa diz isso.
 *
 * QUANDO PERGUNTAR é a coluna Condição da aba Variáveis, avaliada com as escolhas já feitas:
 *   - verdadeira, ou "sempre", ou vazia → pergunta;
 *   - falsa → não pergunta: a variável não é usada (MAE com ARE = 2, sem arremate externo);
 *   - NÃO DÁ PARA AVALIAR → PERGUNTA. É o caso de "(ARR=1)" em ARI e ARE: ARR não está em aba nenhuma
 *     da DP-02 (medido, `avaliador-de-formulas.ts`). Deixar de perguntar por não saber seria escolher
 *     sozinho — o Padrão entraria calado. E é o caso de MAE antes de o ARE ser respondido: ela fica
 *     pendente, e a Condição é avaliada de novo quando chegar a vez dela.
 *
 * O QUE SE ACEITA: a LLM propõe `{ variavel, opcao }`; vale se a variável é uma das capturadas, existe
 * na tipologia, e a opção é um dos números da aba. A escolha feita SOBRESCREVE a anterior (decisão 3 do
 * dono do produto, 25/10/2026: o vendedor pode trocar o arremate depois).
 *
 * ══ A MUDANÇA DE PRODUTO (dono do produto, 25/10/2026): o padrão é ASSUMIDO, não perguntado ══
 * A conversa não pergunta o arremate: assume o Padrão da aba Variáveis e confirma em português. Só
 * quando o vendedor pede outro, ela mostra as opções daquela variável POR EXTENSO, sem número. O pedido
 * fica marcado no item como `null` na chave da variável (`lerEscolhasDoItem`): é a única pendência de
 * escolha que existe. Os códigos (ARI, ARE, MAE) e os números das opções são vocabulário INTERNO — vão
 * ao prompt, nunca ao vendedor; `traduzirVocabulario` os tira das recusas.
 *
 * Portão: `src/utils/__tests__/escolhas-da-tipologia.test.ts`.
 */
import { avaliarTexto, condicoesDasOpcoesDe, opcoesDaVariavel, type Tipologia } from '@/lib/atendimentos-ia/avaliador-de-formulas'

/** O que as escolhas leem da tipologia: só a aba 'Variáveis'. A conversa as carrega sem as outras abas. */
export type VariaveisDaTipologia = Pick<Tipologia, 'variaveis'>

// ── A ETAPA 1 NÃO VÊ O PADRÃO DO MOTOR (dono do produto, 20/11/2026) ──────────────────────────────────────────────────
/**
 * "Na etapa 1 (GERAR_LEVANTAMENTO) a aba de variáveis do motor entra SEM A COLUNA PADRÃO. O agente vê QUAIS escolhas existem, para perguntar ou
 * aplicar a política da empresa; não vê o que o fornecedor sugere. O padrão do motor só vale na etapa 2 (CALCULAR_BARRAS), e só para o que nem a
 * empresa nem o vendedor definiu, e nunca quando acrescenta peça."
 *
 * A aba lida para o AGENTE (`paraOAgente`) tem `padrao` NULO em toda linha e, no lugar, `tem_padrao`: SE o motor tem padrão para a variável —
 * o que decide se ela é das "sem padrão" que só o vendedor dá (`variaveisSemPadrao`) —, nunca QUAL. O valor fica no motor, para a etapa 2
 * (`fronteira-das-escolhas.ts`). A aba completa, com o Padrão, continua sendo a do cálculo e a dos documentos que mostram o que foi calculado.
 */
export type VariavelDoAgente = VariaveisDaTipologia['variaveis'][number] & { tem_padrao?: boolean }
export const temPadraoNoMotor = (v: VariavelDoAgente): boolean => v.tem_padrao ?? (v.padrao ?? '').trim() !== ''
export function paraOAgente(t: VariaveisDaTipologia): VariaveisDaTipologia {
    return { variaveis: t.variaveis.map((v): VariavelDoAgente => ({ ...v, padrao: null, tem_padrao: (v.padrao ?? '').trim() !== '' })) }
}

/** Decisão do dono do produto, 25/10/2026: as três que impediam a DP-02 de fechar. A ordem é a da aba. */
export const ESCOLHAS_CAPTURADAS = ['ARI', 'ARE', 'MAE'] as const

export type Escolhas = Readonly<Record<string, number>>
export type OpcaoDaEscolha = { valor: number; rotulo: string }
export type EscolhaPendente = { variavel: string; descricao: string; opcoes: OpcaoDaEscolha[] }

const capturada = (v: string) => (ESCOLHAS_CAPTURADAS as readonly string[]).includes(v)

// ── A PEÇA QUE NINGUÉM PEDIU NÃO ENTRA POR PADRÃO (dono do produto, 19/11/2026) ─────────────────────────────────────────
/**
 * O caso: o item 6 do orçamento da Daiane (DP-72, PORTA DE CORRER 04 FOLHAS MÓVEIS, 4750 x 2300) saiu COM TRAVESSA, com as escolhas NULAS — a
 * variável UT ("USA TRAVESSA?") tem Padrão 1 = SIM no motor (medido em 19/11/2026 no motor 259035a9: 88 tipologias com UT, todas com Padrão 1;
 * e AT, a altura da travessa, 1050 em 90). A travessa entrava em silêncio, com perfil, reforço e baguete, e partia o vidro em dois panos.
 *
 * A regra do dono do produto: "A travessa se torna uma variável. Essa variável não foi solicitada." Quando o vendedor não pediu, o AGENTE usa a
 * opção que NÃO acrescenta a peça e a grava nas escolhas, para ficar no rastro. O padrão da tabela do motor NÃO muda: o motor é do fornecedor.
 * A RESSALVA: a tipologia que já é "com travessa" pelo nome tem a peça por ser dela, e ela continua (medido: nenhuma das 88 diz travessa no nome).
 *
 * A lista é fechada e só tem o que o dono do produto decidiu; as outras variáveis de padrão SIM que acrescentam peça estão com ele.
 */
export const PECAS_QUE_NAO_ENTRAM_POR_PADRAO: Readonly<Record<string, RegExp>> = { UT: /\btravessas?\b/i }
const semAcento_ = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
/**
 * As escolhas que o AGENTE acrescenta: a opção "NÃO" de cada peça da lista que a tipologia tem, o vendedor não escolheu e o nome da tipologia não
 * diz. Devolve só o que acrescenta (vazio quando nada muda). Sem a opção "NÃO" na aba, nada é acrescentado — nunca se inventa o valor.
 */
export function semAsPecasNaoPedidas(tipologia: VariaveisDaTipologia, explicitas: Readonly<Record<string, number | null>> | null, descricao: string | null): Record<string, number> {
    const acrescentadas: Record<string, number> = {}
    for (const [variavel, nome] of Object.entries(PECAS_QUE_NAO_ENTRAM_POR_PADRAO)) {
        const v = tipologia.variaveis.find((x) => x.variavel === variavel)
        if (!v || typeof explicitas?.[variavel] === 'number') continue
        if (descricao !== null && nome.test(semAcento_(descricao))) continue
        const nao = (opcoesDaVariavel(v.opcoes) ?? []).find((o) => /^nao\b/i.test(semAcento_(o.rotulo).trim()))
        if (nao) acrescentadas[variavel] = nao.valor
    }
    return acrescentadas
}

/** A Condição pede a pergunta? Verdadeira, "sempre", vazia ou impossível de avaliar → sim. */
function condicaoPede(condicao: string | null, escolhas: Escolhas): boolean {
    const c = (condicao ?? '').trim()
    if (c === '' || c === 'sempre') return true
    const r = avaliarTexto(c, escolhas)
    if ('recusa' in r) return true
    return r.valor === true
}

/** R2: as opções da variável que valem com as escolhas feitas (sem a coluna, todas; condição impossível de avaliar, a opção fica). */
function opcoesQueValem(v: VariaveisDaTipologia['variaveis'][number], escolhas: Escolhas): OpcaoDaEscolha[] | null {
    const opcoes = opcoesDaVariavel(v.opcoes)
    const texto = (v.condicao_opcoes ?? '').trim()
    if (!opcoes || texto === '') return opcoes
    const conds = condicoesDasOpcoesDe(texto)
    if (!conds) return opcoes
    return opcoes.filter((o) => {
        const c = conds.get(o.valor)
        if (c === undefined) return true
        const r = avaliarTexto(c, escolhas)
        return 'recusa' in r ? true : r.valor === true
    })
}

/** As escolhas capturadas que faltam e se aplicam, na ordem da aba Variáveis. */
export function escolhasPendentes(tipologia: VariaveisDaTipologia, escolhas: Escolhas): EscolhaPendente[] {
    const pendentes: EscolhaPendente[] = []
    for (const v of tipologia.variaveis) {
        if (!capturada(v.variavel) || escolhas[v.variavel] !== undefined) continue
        // R2 (17/11/2026): só as opções cuja condição ('Condição das opções') vale com as escolhas já feitas; a que não dá para avaliar
        // ainda fica (a mesma regra da Condição da variável: não saber não esconde opção). O avaliador recusa a escolha que não vale.
        const opcoes = opcoesQueValem(v, escolhas)
        // sem opções legíveis não há o que perguntar: o avaliador recusa a variável pelo nome
        if (!opcoes || opcoes.length === 0) continue
        if (!condicaoPede(v.condicao, escolhas)) continue
        pendentes.push({ variavel: v.variavel, descricao: v.descricao ?? v.variavel, opcoes })
    }
    return pendentes
}

const minuscula = (t: string) => t.toLocaleLowerCase('pt-BR')

/**
 * O QUE CHEGA AO VENDEDOR (dono do produto, 26/10/2026): "nome por extenso, sem código de fornecedor e sem número
 * de opção. Ele responde em palavras." Vale para arremate, medida e qualquer escolha futura. O código continua no
 * log, nas telas do super admin e no levantamento com preço.
 */
const NOME_PARA_O_VENDEDOR: Record<string, string> = { ARI: 'arremate interno', ARE: 'arremate externo', MAE: 'medida do arremate externo', MAI: 'medida do arremate interno' }
/** Como o vendedor chama a variável; a que não está no mapa sai pela descrição da aba, em minúscula. */
export const nomeDaVariavel = (variavel: string, descricao: string) => NOME_PARA_O_VENDEDOR[variavel] ?? minuscula(descricao)

/**
 * A opção, para o vendedor: sem o código de fornecedor do início ("BZ0010 - "), sem o valor entre colchetes, em
 * minúscula — "BZ0010 - ARREMATE 20MM" → "arremate de 20 mm". O resto do rótulo fica: não é código.
 */
export function opcaoParaOVendedor(rotulo: string): string {
    const t = rotulo.replace(/\s*\[[^\]]*\]/g, '').replace(/^[A-Z]{1,5}\d+[A-Z0-9]*\s*-\s*/, '').trim()
    return minuscula(t).replace(/(\d)\s*mm\b/g, '$1 mm').replace(/\s*\+\s*/g, ' + ').replace(/^arremate (\d+ mm)$/, 'arremate de $1')
}

/** A pergunta FIXA da escolha, em português e por extenso: o nome da variável e as opções, sem código e SEM número. */
export function perguntaDaEscolha(p: EscolhaPendente): string {
    return `Para ${nomeDaVariavel(p.variavel, p.descricao)}, as opções são: ${p.opcoes.map((o) => opcaoParaOVendedor(o.rotulo)).join('; ')}. Qual você quer?`
}

/** A variável capturada da tipologia, como escolha a mostrar ao vendedor; null se não existe ou não tem opções. */
export function escolhaPedida(tipologia: VariaveisDaTipologia, variavel: string): EscolhaPendente | null {
    if (!capturada(variavel)) return null
    const v = tipologia.variaveis.find((x) => x.variavel === variavel)
    const opcoes = v ? opcoesDaVariavel(v.opcoes) : null
    if (!v || !opcoes || opcoes.length === 0) return null
    return { variavel, descricao: v.descricao ?? variavel, opcoes }
}

/**
 * As escolhas que o vendedor pode pedir, para o PROMPT — com o código e o número das opções, que a LLM
 * precisa para responder na ferramenta. Vocabulário interno: nunca vai ao vendedor.
 */
export function escolhasParaOPrompt(tipologia: VariaveisDaTipologia): string[] {
    return ESCOLHAS_CAPTURADAS.map((v) => escolhaPedida(tipologia, v)).filter((p): p is EscolhaPendente => p !== null)
        .map((p) => `${p.variavel} = ${p.descricao}: ${p.opcoes.map((o) => `${o.valor} = ${o.rotulo}`).join('; ')}`)
}

/**
 * As opções de arremate no PROMPT, UMA VEZ SÓ (dono do produto, 26/10/2026). Medido: 62.298 dos 83.840 caracteres do
 * pedido (74%) eram as mesmas linhas repetidas para 161 tipologias. Agora cada linha distinta vai uma vez, num
 * dicionário (`[O1] ARI = …`), e cada tipologia a referencia (`O1, O2, O3: DP-02, DP-03`); as que usam as mesmas
 * linhas ficam juntas numa referência só. Nada muda no que a IA vê: relida, cada tipologia tem exatamente as linhas de
 * antes, na mesma ordem (o portão relê o bloco e confere).
 */
export function opcoesDeArremateNoPrompt(escolhasPorTipologia: ReadonlyArray<{ tipologia: string; linhas: readonly string[] }>): string[] {
    if (escolhasPorTipologia.length === 0) return ['(nenhuma)']
    const ids = new Map<string, string>()
    for (const e of escolhasPorTipologia) for (const l of e.linhas) if (!ids.has(l)) ids.set(l, `O${ids.size + 1}`)
    const porReferencia = new Map<string, string[]>()
    for (const e of escolhasPorTipologia) {
        const ref = e.linhas.map((l) => ids.get(l) as string).join(', ')
        porReferencia.set(ref, [...(porReferencia.get(ref) ?? []), e.tipologia])
    }
    return [
        ...[...ids].map(([linha, id]) => `[${id}] ${linha}`),
        'Quais opções cada tipologia usa (as opções, pelo número entre colchetes: tipologias):',
        ...[...porReferencia].map(([ref, tipologias]) => `${ref}: ${tipologias.join(', ')}`),
    ]
}

export type ResultadoDaEscolha = { gravar: Record<string, number> | null; propostos: number; descartados: number }

/** Valida `{ variavel, opcao }` proposto pela LLM contra as opções da variável na tipologia. Sobrescreve. */
export function validarEscolha(tipologia: VariaveisDaTipologia, escolhas: Escolhas, proposta: unknown): ResultadoDaEscolha {
    if (proposta === null || proposta === undefined || typeof proposta !== 'object') return { gravar: null, propostos: 0, descartados: 0 }
    const { variavel, opcao } = proposta as { variavel?: unknown; opcao?: unknown }
    const pedida = typeof variavel === 'string' ? escolhaPedida(tipologia, variavel) : null
    const valida = pedida !== null && typeof opcao === 'number' && Number.isInteger(opcao) && pedida.opcoes.some((o) => o.valor === opcao)
    if (!valida) return { gravar: null, propostos: 1, descartados: 1 }
    return { gravar: { ...escolhas, [variavel as string]: opcao as number }, propostos: 1, descartados: 0 }
}

/**
 * O jsonb gravado → as escolhas: as capturadas e, com a tipologia, os VALORES das variáveis sem padrão dela (`variaveisSemPadrao`, 06/11/2026) —
 * só número inteiro, e o valor só positivo. O resto não vira escolha.
 */
export function lerEscolhasGravadas(valor: unknown, tipologia: VariaveisDaTipologia | null = null): Record<string, number> {
    if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) return {}
    const deValor = new Set(tipologia ? variaveisSemPadrao(tipologia).map((v) => v.variavel) : [])
    const lidas: Record<string, number> = {}
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
        if (typeof v !== 'number' || !Number.isInteger(v)) continue
        if (capturada(k) || (deValor.has(k) && v > 0) || (k in PECAS_QUE_NAO_ENTRAM_POR_PADRAO && tipologia?.variaveis.some((x) => x.variavel === k))) lidas[k] = v
    }
    return lidas
}

// ── AS VARIÁVEIS SEM PADRÃO (dono do produto, 06/11/2026) ──────────────────────────────────────────────────
/**
 * "Quando a tipologia escolhida tiver variável sem padrão, o agente PERGUNTA o valor antes de dar a esquadria por completa — recusa nomeada,
 * dizendo qual variável falta e de qual esquadria. Não invente valor, não use zero, não copie de outra esquadria. As variáveis COM padrão
 * continuam como estão, sem perguntar. Leia a lista do motor, por tipologia — não deixe nada fixo no código."
 *
 * Medido no motor fdff3386 em 06/11/2026 (só leitura): 7 siglas sem Padrão, 63 linhas em 48 tipologias, nenhuma com Opções, todas altura.
 * A MESMA SIGLA MUDA DE SENTIDO POR TIPOLOGIA — AF é "ALTURA DA BANDEIRA" em 20 linhas (12 com "(HI=1)", 8 "sempre") e "ALTURA DO PEITORIL" em
 * 13; AB é "ALTURA DA BANDEIRA" em 2 e "ALTURA DO 2º QUADRO" em 6 —, por isso a pergunta sai da DESCRIÇÃO da linha, nunca da sigla. HI é
 * opção única ("1 = CIENTE"), padrão 1: a condição "(HI=1)" é verdadeira e AF é perguntada; com HI ≠ 1 não seria. AA, AB e AC com
 * "(AQ=2) and (AV=1)" (18 linhas) não são alcançadas: AQ tem padrão 1. Pela função, sobre os dados reais: 20 tipologias perguntam a altura
 * da bandeira (AF), 13 a do peitoril (AF), 4 a bandeira e o peitoril (B, P), 2 a bandeira e o peitoril (AB, AP), e 9 nada. A DP-04 tem só
 * AF bandeira ("sempre"); a DP-02, nenhuma. A variável sem padrão e COM opções não existe hoje; se aparecer, não é perguntada aqui (ela é
 * uma escolha, e o avaliador a recusa pelo nome).
 */
export type VariavelSemPadrao = { variavel: string; descricao: string; condicao: string | null }

/** As variáveis da aba Variáveis sem Padrão (vazio ou nulo) e sem opções, na ordem da aba. */
export function variaveisSemPadrao(tipologia: VariaveisDaTipologia): VariavelSemPadrao[] {
    return tipologia.variaveis
        .filter((v) => !temPadraoNoMotor(v) && !(opcoesDaVariavel(v.opcoes)?.length))
        .map((v) => ({ variavel: v.variavel, descricao: (v.descricao ?? '').trim() || v.variavel, condicao: v.condicao }))
}

/**
 * As variáveis sem padrão que FALTAM nesta esquadria e se aplicam. A Condição é avaliada com o que o vendedor deu e, para as variáveis da Condição
 * que ninguém deu, com TODAS as opções que a aba lhes dá (20/11/2026: a etapa 1 não lê o Padrão do motor): pergunta-se só quando a Condição vale
 * em todas as combinações — "(HI=1)" com HI de opção única ("1 = CIENTE") vale, e AF é perguntada; "(AQ=2) and (AV=1)" com AQ em aberto (1 ou 2)
 * não vale em todas, e AA não é perguntada aqui: se o cálculo precisar dela, o motor a recusa pelo nome e a pergunta volta ao agente. O mesmo com
 * a variável da aba SEM opções que ninguém deu (o valor dela é o padrão do motor, que o agente não vê). A Condição que não dá para avaliar — um
 * nome que nenhuma aba define, ou combinações demais — é perguntada, como sempre: não perguntar por não saber seria assumir.
 */
const LIMITE_DE_COMBINACOES = 64
const NAO_SAO_NOMES = new Set(['and', 'or', 'not', 'AND', 'OR', 'NOT'])
export function condicaoValeEmTodas(condicao: string | null, tipologia: VariaveisDaTipologia, dadas: Readonly<Record<string, number>>): boolean {
    const c = (condicao ?? '').trim()
    if (c === '' || c === 'sempre') return true
    const nomes = [...new Set(c.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [])].filter((n) => !NAO_SAO_NOMES.has(n) && dadas[n] === undefined)
    const valoresDe: Array<[string, number[]]> = []
    for (const n of nomes) {
        const v = tipologia.variaveis.find((x) => x.variavel === n)
        const opcoes = v ? opcoesDaVariavel(v.opcoes) : null
        if (!v) continue
        // a variável da aba SEM opções que ninguém deu (uma medida, uma quantidade): o agente não sabe o valor — o padrão é do motor —, então a
        // Condição não vale "em todas": não se pergunta agora; se o cálculo precisar, o motor recusa pelo nome e a pergunta volta ao agente
        if (!opcoes || opcoes.length === 0) return false
        valoresDe.push([n, opcoes.map((o) => o.valor)])
    }
    let combinacoes: Array<Record<string, number>> = [{ ...dadas }]
    for (const [n, vs] of valoresDe) {
        combinacoes = combinacoes.flatMap((base) => vs.map((x) => ({ ...base, [n]: x })))
        if (combinacoes.length > LIMITE_DE_COMBINACOES) return true
    }
    return combinacoes.every((valores) => {
        const r = avaliarTexto(c, valores)
        return 'recusa' in r ? true : r.valor === true
    })
}
export function variaveisAPerguntar(tipologia: VariaveisDaTipologia, dadas: Readonly<Record<string, number>>): VariavelSemPadrao[] {
    return variaveisSemPadrao(tipologia).filter((v) => dadas[v.variavel] === undefined && condicaoValeEmTodas(v.condicao, tipologia, dadas))
}

/**
 * A variável é uma MEDIDA (em mm)? Pela descrição da aba: começa por altura, largura, comprimento ou medida. A mesma regra decide o "(em mm)" da
 * pergunta e o "mm" do valor na linha VARIÁVEIS da folha do levantamento (`folha-do-levantamento.ts`) — uma regra só, para as duas não divergirem.
 */
export const variavelEhMedida = (descricao: string) => /^(altura|largura|comprimento|medida)\b/.test(minuscula(descricao.trim()))

/** Como a variável sem padrão é pedida: pela descrição da aba, em minúscula, e "(em mm)" quando é uma medida (altura, largura, comprimento). */
export function nomeDaVariavelSemPadrao(v: Pick<VariavelSemPadrao, 'descricao'>): string {
    const nome = minuscula(v.descricao)
    return variavelEhMedida(v.descricao) ? `${nome} (em mm)` : nome
}

/**
 * O valor dito para uma variável sem padrão, proposto pela LLM como `{ variavel, opcao: <valor> }` (a ferramenta usa o mesmo par das escolhas):
 * vale se a variável é uma das sem padrão DESTA tipologia e o valor é um inteiro maior que zero — nunca zero, nunca negativo.
 */
export function validarValorDaVariavel(tipologia: VariaveisDaTipologia, proposta: unknown): { variavel: string; valor: number } | null {
    if (proposta === null || typeof proposta !== 'object') return null
    const { variavel, opcao } = proposta as { variavel?: unknown; opcao?: unknown }
    if (typeof variavel !== 'string' || !variaveisSemPadrao(tipologia).some((v) => v.variavel === variavel)) return null
    if (typeof opcao !== 'number' || !Number.isInteger(opcao) || opcao <= 0) return null
    return { variavel, valor: opcao }
}

/** As variáveis sem padrão, para o PROMPT: o código e a descrição — vocabulário interno, nunca ao vendedor. */
export function variaveisSemPadraoParaOPrompt(tipologia: VariaveisDaTipologia): string[] {
    return variaveisSemPadrao(tipologia).map((v) => `${v.variavel} = ${v.descricao}${v.condicao && v.condicao.trim() !== 'sempre' ? ` (só quando ${v.condicao.trim()})` : ''}`)
}

/**
 * A seção das variáveis sem padrão no prompt: cada linha UMA vez, com as tipologias que a usam. Nenhuma tipologia com variável sem padrão,
 * nenhuma linha (o prompt da conta que não as tem fica byte a byte igual).
 */
export function variaveisSemPadraoNoPrompt(porTipologia: ReadonlyArray<{ tipologia: string; linhas: readonly string[] }>): string[] {
    const porLinha = new Map<string, string[]>()
    for (const t of porTipologia) for (const l of t.linhas) porLinha.set(l, [...(porLinha.get(l) ?? []), t.tipologia])
    if (porLinha.size === 0) return []
    return [
        '',
        'Variáveis SEM PADRÃO (USO INTERNO — código = descrição: tipologias). A esquadria dessas tipologias só fica completa com o VALOR, dito pelo vendedor: em `escolhas`, o CÓDIGO da variável e, em `opcao`, o valor em mm, SÓ quando ele disse o número para aquela esquadria. NUNCA invente, NUNCA use zero, NUNCA copie o de outra esquadria; se ele não disse, omita — o sistema pergunta.',
        ...[...porLinha].map(([linha, tipologias]) => `${linha}: ${tipologias.join(', ')}`),
    ]
}

/**
 * O jsonb do item → as escolhas, PRESERVANDO o `null` de uma capturada: é a marca de que o vendedor
 * pediu para escolher aquela variável. Número inteiro é escolha; o resto não vira nada. A variável que NÃO é capturada fica só com
 * inteiro maior que zero: é o valor de uma variável sem padrão (06/11/2026), que só a tipologia diz se vale (`lerEscolhasGravadas`) —
 * sem isto, o valor gravado sumiria na releitura e a esquadria voltaria a ser perguntada.
 */
export function lerEscolhasDoItem(valor: unknown): Record<string, number | null> {
    if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) return {}
    const lidas: Record<string, number | null> = {}
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
        const inteiro = typeof v === 'number' && Number.isInteger(v)
        if (!capturada(k)) { if (inteiro && v > 0) lidas[k] = v; continue }
        if (v === null) lidas[k] = null
        else if (inteiro) lidas[k] = v
    }
    return lidas
}

/**
 * O PADRÃO DO ARREMATE — o ÚNICO ponto onde ele é decidido (dono do produto, 25/10/2026).
 *
 * Hoje é o do MOTOR: a coluna "Padrão" da aba Variáveis da tipologia (DP-02: ARI 1, ARE 1, MAE 1).
 * Se a base de conhecimento da EMPRESA (`orcamentista_esquadrias_base`: usa_arremate_interno,
 * guarnicao_interna, usa_arremate_externo, medida_arremate_externo…) um dia tiver esses campos
 * preenchidos, O DA EMPRESA PREVALECE sobre o da tipologia — e entra AQUI, e só aqui: a conta
 * (`escolhasComPadrao`) e a frase (`descreverArremate`) leem esta função. Medido em 25/10/2026: no
 * tenant 20e08592 os campos de arremate estão TODOS nulos, então não há padrão de empresa concorrendo.
 *
 * Null quando o Padrão da aba não é um número.
 */
export function padraoDoArremate(tipologia: VariaveisDaTipologia, variavel: string): number | null {
    const p = tipologia.variaveis.find((v) => v.variavel === variavel)?.padrao?.trim() ?? ''
    return /^\d+$/.test(p) ? Number(p) : null
}

/** As escolhas que a CONTA usa: as do vendedor e, nas capturadas que ele não disse, o padrão. */
export function escolhasComPadrao(tipologia: VariaveisDaTipologia, explicitas: Escolhas): Record<string, number> {
    const efetivas: Record<string, number> = { ...explicitas }
    for (const v of ESCOLHAS_CAPTURADAS) {
        if (efetivas[v] !== undefined) continue
        const padrao = padraoDoArremate(tipologia, v)
        if (padrao !== null) efetivas[v] = padrao
    }
    return efetivas
}

/**
 * A linha do ARREMATE, em português, para a resposta: cada variável capturada que se aplica, com a opção
 * por extenso e se foi o padrão ou a escolha do vendedor. Sem código e sem número. A Condição é avaliada
 * com as escolhas efetivas (as do vendedor, e o Padrão nas outras); a que não dá para avaliar entra.
 * Null quando a tipologia não tem variável capturada.
 */
/**
 * Com a ORIGEM de cada escolha (a fronteira, 20/11/2026: `fronteira-das-escolhas.ts`), a linha diz de onde veio — "como você pediu", "política da
 * empresa", "padrão do motor" ou "sem a peça, não pedida" (a principal); sem ela, o de antes.
 */
const ORIGEM_NA_LINHA: Readonly<Record<string, string>> = { vendedor: 'como você pediu', politica: 'política da empresa', padrao_do_motor: 'padrão do motor', principal: 'sem a peça, não pedida' }
export function descreverArremate(tipologia: VariaveisDaTipologia, explicitas: Escolhas, origem?: Readonly<Record<string, string>>): string | null {
    const partes = escolhasDescritas(tipologia, explicitas)
        .map((e) => `${minuscula(e.descricao)}: ${e.rotulo ?? 'padrão da tipologia'} (${(origem && ORIGEM_NA_LINHA[origem[e.variavel] ?? '']) ?? (e.doVendedor ? 'como você pediu' : 'padrão')})`)
    return partes.length ? partes.join('; ') : null
}

export type EscolhaDescrita = { variavel: string; descricao: string; rotulo: string | null; doVendedor: boolean }

/**
 * As variáveis capturadas que se aplicam, com a opção efetiva por extenso (o rótulo da aba, como está) e se
 * foi o vendedor quem escolheu. A Condição é avaliada com as escolhas efetivas; a que não dá para avaliar
 * entra. É a fonte da linha do arremate do levantamento (`descreverArremate`) e da do apanhado.
 */
export function escolhasDescritas(tipologia: VariaveisDaTipologia, explicitas: Escolhas): EscolhaDescrita[] {
    const efetivas = escolhasComPadrao(tipologia, explicitas)
    const descritas: EscolhaDescrita[] = []
    for (const v of tipologia.variaveis) {
        if (!capturada(v.variavel) || !condicaoPede(v.condicao, efetivas)) continue
        const valor = efetivas[v.variavel]
        const rotulo = valor === undefined ? null : opcoesDaVariavel(v.opcoes)?.find((o) => o.valor === valor)?.rotulo ?? null
        descritas.push({ variavel: v.variavel, descricao: v.descricao ?? v.variavel, rotulo, doVendedor: explicitas[v.variavel] !== undefined })
    }
    return descritas
}

/** Alguma capturada foi escolhida pelo vendedor? (A frase de confirmação muda.) */
export const temEscolhaDoVendedor = (explicitas: Escolhas) => ESCOLHAS_CAPTURADAS.some((v) => explicitas[v] !== undefined)

/**
 * Tira o vocabulário interno de um texto que vai ao vendedor: `&MAE` e `MAE` viram a descrição da
 * variável, entre aspas ("MEDIDA ARREMATE EXTERNO"). Só códigos de variáveis DESTA tipologia.
 */
export function traduzirVocabulario(texto: string, tipologia: VariaveisDaTipologia): string {
    let saida = texto
    for (const v of tipologia.variaveis) {
        if (!/^[A-Z]{2,5}$/.test(v.variavel) || !v.descricao) continue
        saida = saida.replace(new RegExp(`&?\\b${v.variavel}\\b`, 'g'), `“${v.descricao}”`)
    }
    return saida
}
