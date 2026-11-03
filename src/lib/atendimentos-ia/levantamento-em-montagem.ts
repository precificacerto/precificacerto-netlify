/**
 * O LEVANTAMENTO EM MONTAGEM: as esquadrias de um levantamento (`orcamentista_levantamento_item`), o
 * que a proposta da LLM muda nelas, e a próxima pendência — o campo que falta ou a escolha da
 * tipologia. Funções puras: não leem banco nem rede.
 *
 * A REGRA QUE NÃO SE NEGOCIA: a LLM PROPÕE, o código VALIDA. Cada campo passa por `valorValido`, a
 * mesma validação da pré-definição — a tipologia só da lista, a cor só da lista e exata, as medidas
 * inteiras na faixa. O que não valida é descartado e contado.
 *
 * QUAL ESQUADRIA RECEBE (nunca por semelhança):
 *   - a `ordem` dita pela LLM, quando existe;
 *   - senão, uma tipologia válida vai para a primeira esquadria SEM tipologia, ou abre a seguinte;
 *   - senão, a esquadria PADRÃO do chamador (a da pergunta em aberto, ou a única);
 *   - senão, nenhuma: `semEsquadria`, e quem chama pergunta qual é.
 *
 * HISTÓRICO: sobrescreve (decisão 3 do dono do produto, 25/10/2026). Trocar a TIPOLOGIA apaga as
 * escolhas da esquadria — as variáveis são da tipologia; trocar uma medida, não.
 *
 * VÁRIAS FAMÍLIAS (PR D, dono do produto, 02/11/2026): a tipologia vem do MOTOR de uma família da conta (a base de
 * conhecimento → a etapa 1 → o motor), não mais de uma tabela de fornecedor. A esquadria guarda de qual família é (`familia`, a
 * chave do catálogo) e o motor que a calcula (`motor_id`, o da etapa 2 da família), como a regra do projeto pede: "cada item diz
 * a sua". O código numa família só: a esquadria leva aquela. Em mais de uma: a esquadria fica sem família, e a pendência
 * seguinte, logo depois da tipologia, é DE QUAL FAMÍLIA — pelo rótulo do catálogo. Nunca escolhe, nunca "a primeira". A
 * resposta vem em `itens[].familia` (o rótulo ou a chave) e/ou `itens[].fornecedor` (o do motor da família), e vale só se
 * apontar, sem caixa e sem acento, UMA das famílias daquela tipologia. Trocar a tipologia ou a família apaga as escolhas: as
 * variáveis são da tipologia DAQUELE motor. (Até o PR D, a fonte era a tabela de fornecedor, em `tabela_id`.)
 *
 * O ARREMATE (dono do produto, 25/10/2026): o Padrão da tipologia é ASSUMIDO, e escolha nenhuma é
 * pendência por si. A proposta traz `escolhas` (o que o vendedor disse, em palavras, que a LLM traduz
 * para variável e número) e `opcoes_de` (as variáveis cujas opções ele pediu para ver). Pedir as opções
 * marca a variável com `null` no item, e SÓ ESSA marca vira pendência de escolha.
 *
 * Portão: `src/utils/__tests__/levantamento-em-montagem.test.ts`.
 */
import { PERGUNTA_DO_CAMPO, valorValido } from '@/lib/atendimentos-ia/pre-definicao'
import { escolhaPedida, lerEscolhasGravadas, perguntaDaEscolha, validarEscolha, type EscolhaPendente, type VariaveisDaTipologia } from '@/lib/atendimentos-ia/escolhas-da-tipologia'
import { normalizarNome } from '@/lib/atendimentos-ia/nome-do-levantamento'
import { aberturaCompativel, aberturaDoItem, cabeNosLimites, type Abertura, type CandidatoParaAProposta, type Medidas } from '@/lib/atendimentos-ia/tipologias-candidatas'

/** Os campos de uma esquadria, na ordem em que são perguntados. */
export const CAMPOS_DA_ESQUADRIA = ['tipologia', 'largura_mm', 'altura_mm', 'quantidade', 'cor_perfil', 'vidro'] as const
export type CampoDaEsquadria = (typeof CAMPOS_DA_ESQUADRIA)[number]

export type ItemDoLevantamento = {
    ordem: number
    tipologia: string | null
    largura_mm: number | null
    altura_mm: number | null
    quantidade: number | null
    cor_perfil: string | null
    vidro: string | null
    /** número = escolha do vendedor; `null` = ele pediu para ver as opções desta variável */
    escolhas: Record<string, number | null> | null
    /** De qual família da conta (a CHAVE do catálogo) é a tipologia. null = ainda não sabido (`familiaDaEsquadria` resolve). */
    familia: string | null
    /** O motor que calcula a esquadria: o da etapa 2 da família (`resolverFamilias` o põe junto com a família). */
    motor_id: string | null
}

export const itemVazio = (ordem: number): ItemDoLevantamento => ({
    ordem, tipologia: null, largura_mm: null, altura_mm: null, quantidade: null, cor_perfil: null, vidro: null, escolhas: null, familia: null, motor_id: null,
})

/** A tipologia e a família da esquadria: é o par que decide as abas. */
export type TipologiaNaFamilia = { tipologia: string | null; familia: string | null }

/** As abas da tipologia NO MOTOR da família da esquadria, ou null quando ele não as tem — não há escolha a perguntar. */
export type DefinicaoDaTipologia = (esquadria: TipologiaNaFamilia) => VariaveisDaTipologia | null

/** Uma família da conta cujo motor tem o código: a chave, o rótulo, o fornecedor do motor e o motor do cálculo (o que a esquadria grava). */
export type FamiliaDoCodigo = { familia: string; rotulo: string; fornecedor: string; motorId: string }
/** Uma opção da pergunta de qual família: o que o vendedor reconhece — o rótulo da família (e o fornecedor do motor dela). */
export type OpcaoDeFamilia = { rotulo: string; fornecedor: string }
/** As famílias da conta cujo motor tem o código, na ordem do rótulo. */
export type FamiliasDoCodigo = (codigo: string) => readonly FamiliaDoCodigo[]

const porNome = (a: string, b: string) => a.localeCompare(b, 'pt-BR')
const porOpcao = (a: OpcaoDeFamilia, b: OpcaoDeFamilia) => porNome(a.rotulo, b.rotulo) || porNome(a.fornecedor, b.fornecedor)

/**
 * De qual família é a esquadria: a guardada, se o motor dela ainda tem o código; senão, a ÚNICA cujo motor tem o código. Com o
 * código em mais de uma, as opções (o rótulo e o fornecedor do motor) — para perguntar. Sem tipologia, ou com o código em
 * nenhuma: null.
 */
export function familiaDaEsquadria(e: TipologiaNaFamilia, familiasDoCodigo: FamiliasDoCodigo): FamiliaDoCodigo | { opcoes: OpcaoDeFamilia[] } | null {
    if (e.tipologia === null) return null
    const opcoes = familiasDoCodigo(e.tipologia)
    const guardada = e.familia !== null ? opcoes.find((o) => o.familia === e.familia) : undefined
    if (guardada) return guardada
    if (opcoes.length === 1) return opcoes[0]
    if (opcoes.length === 0) return null
    return { opcoes: opcoes.map((o) => ({ rotulo: o.rotulo, fornecedor: o.fornecedor })).sort(porOpcao) }
}

/**
 * A família e o motor de cada esquadria, como ficam gravados (`orcamentista_levantamento_item.familia` e `motor_id`): a família
 * resolvida e o motor do CÁLCULO dela (o da etapa 2, hoje). Sem família resolvida (sem tipologia, código em nenhuma, ou em mais de
 * uma — a pergunta), os dois ficam nulos: nada é escolhido.
 */
export function resolverFamilias(itens: readonly ItemDoLevantamento[], familiasDoCodigo: FamiliasDoCodigo): ItemDoLevantamento[] {
    return itens.map((i) => {
        const f = familiaDaEsquadria(i, familiasDoCodigo)
        return f && 'familia' in f ? { ...i, familia: f.familia, motor_id: f.motorId } : { ...i, familia: null, motor_id: null }
    })
}

/** "PVC Wolf ou PVC Veca" — a lista da pergunta. */
const ouLista = (nomes: readonly string[]) => (nomes.length <= 1 ? nomes.join('') : `${nomes.slice(0, -1).join(', ')} ou ${nomes[nomes.length - 1]}`)

/** Como cada opção é dita: o rótulo da família (único no catálogo). */
export const rotulosDasOpcoes = (opcoes: readonly OpcaoDeFamilia[]): string[] => opcoes.map((o) => o.rotulo)

/** A pergunta de qual família, com as opções em ordem pelo rótulo. */
export function fraseDeQualFamilia(tipologia: string, opcoes: readonly OpcaoDeFamilia[]): string {
    return `A ${tipologia} está em ${opcoes.length} famílias da sua empresa: ${ouLista(rotulosDasOpcoes(opcoes))}. De qual família é?`
}

export type ContextoDaProposta = {
    /** As tipologias candidatas, com a descrição (a abertura) e os limites: a lista de códigos é derivada delas (03/11/2026). */
    candidatos: readonly CandidatoParaAProposta[]
    /** A abertura que a MENSAGEM inteira diz (uma só das palavras), e as palavras que ela traz — o `abertura` de cada item só vale se dito. */
    aberturaDaMensagem: Abertura | null
    aberturasDitas: ReadonlySet<Abertura>
    cores: readonly string[]
    /** A esquadria que recebe o que vier sem ordem e sem tipologia; null quando não há como saber. */
    ordemPadrao: number | null
    definicao: DefinicaoDaTipologia
    familiasDoCodigo: FamiliasDoCodigo
}

export type ResultadoDaProposta = {
    itens: ItemDoLevantamento[]
    propostos: number
    descartados: number
    /** Veio valor sem ordem nem tipologia, e não há esquadria padrão: nada foi aplicado dele. */
    semEsquadria: boolean
    /** As tipologias que o CÓDIGO descartou (03/11/2026): pela abertura dita (porta × janela) ou pelos limites do motor. */
    recusas: RecusaDaTipologia[]
}

/**
 * PORTA NÃO É JANELA e OS LIMITES (dono do produto, 03/11/2026 — `tipologias-candidatas.ts`): a tipologia proposta cai, no código, quando a
 * descrição dela contradiz a palavra do vendedor (ABERTURA) ou quando nenhuma candidata do código cabe a medida dita (LIMITES). A conversa
 * usa a recusa para a frase ao vendedor; o item fica sem tipologia, com as medidas.
 */
export type RecusaDaTipologia = { ordem: number; motivo: 'ABERTURA' | 'LIMITES'; tipologia: string; abertura: Abertura | null; medidas: Medidas }

const vazio = (v: unknown) => v === null || v === undefined
const ordemValida = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1

/** Aplica `{ itens, escolhas, opcoes_de }` às esquadrias. Devolve uma cópia; as recebidas não mudam. */
export function aplicarProposta(atuais: readonly ItemDoLevantamento[], proposta: unknown, ctx: ContextoDaProposta): ResultadoDaProposta {
    const itens = atuais.map((i) => ({ ...i, escolhas: i.escolhas ? { ...i.escolhas } : null })).sort((a, b) => a.ordem - b.ordem)
    let propostos = 0
    let descartados = 0
    let semEsquadria = false
    const recusas: RecusaDaTipologia[] = []
    const tipologias = [...new Set(ctx.candidatos.map((c) => c.tipologia))]
    const candidatasDoCodigo = (codigo: string) => ctx.candidatos.filter((c) => c.tipologia === codigo)
    const p = (proposta && typeof proposta === 'object' ? proposta : {}) as { itens?: unknown; escolhas?: unknown; opcoes_de?: unknown }
    const proxima = () => (itens.length ? Math.max(...itens.map((i) => i.ordem)) + 1 : 1)

    for (const bruto of Array.isArray(p.itens) ? p.itens : []) {
        if (!bruto || typeof bruto !== 'object') continue
        const b = bruto as Record<string, unknown>
        const validos: Partial<Record<CampoDaEsquadria, unknown>> = {}
        for (const campo of CAMPOS_DA_ESQUADRIA) {
            if (vazio(b[campo])) continue
            propostos += 1
            const v = valorValido(campo, b[campo], tipologias, ctx.cores)
            if (v === undefined) descartados += 1
            else validos[campo] = v
        }
        const texto = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v : null)
        const fornecedor = texto(b.fornecedor)
        const familia = texto(b.familia)
        if (Object.keys(validos).length === 0 && fornecedor === null && familia === null) continue

        let alvo: ItemDoLevantamento | undefined
        if (ordemValida(b.ordem)) {
            alvo = itens.find((i) => i.ordem === b.ordem)
            if (!alvo) { alvo = itemVazio(proxima()); itens.push(alvo) }
        } else if (validos.tipologia !== undefined) {
            alvo = itens.find((i) => i.tipologia === null)
            if (!alvo) { alvo = itemVazio(proxima()); itens.push(alvo) }
        } else if (ctx.ordemPadrao !== null) {
            alvo = itens.find((i) => i.ordem === ctx.ordemPadrao)
        } else if (itens.length === 1) {
            alvo = itens[0]
        }
        if (!alvo) { semEsquadria = true; continue }

        // PORTA × JANELA (decisão 1): a palavra do vendedor — a do item, se ele a escreveu, senão a da mensagem — contra a PRIMEIRA palavra
        // da descrição; nenhuma candidata do código compatível descarta a tipologia proposta. Maxim-ar e fixo não declaram, e passam.
        const abertura = aberturaDoItem(b.abertura, ctx.aberturasDitas, ctx.aberturaDaMensagem)
        if (validos.tipologia !== undefined && abertura !== null && !candidatasDoCodigo(String(validos.tipologia)).some((c) => aberturaCompativel(c.descricao, abertura))) {
            descartados += 1
            recusas.push({ ordem: alvo.ordem, motivo: 'ABERTURA', tipologia: String(validos.tipologia), abertura, medidas: { largura_mm: alvo.largura_mm, altura_mm: alvo.altura_mm } })
            delete validos.tipologia
        }
        const tipologiaProposta = validos.tipologia !== undefined

        if (validos.tipologia !== undefined && validos.tipologia !== alvo.tipologia) {
            // as escolhas e a família são da tipologia: a família é a ÚNICA cujo motor tem o código, ou nenhuma (pergunta)
            const opcoes = ctx.familiasDoCodigo(String(validos.tipologia))
            alvo.escolhas = null
            alvo.familia = opcoes.length === 1 ? opcoes[0].familia : null
            alvo.motor_id = opcoes.length === 1 ? opcoes[0].motorId : null
        }
        Object.assign(alvo, validos)
        // OS LIMITES (decisão 2): com tipologia e alguma medida no item, se NENHUMA candidata do código cabe, a tipologia sai — nunca "a mais
        // próxima"; NULL no limite nunca descarta. As medidas ficam; a conversa diz a faixa das que sobraram.
        if (alvo.tipologia !== null && (alvo.largura_mm !== null || alvo.altura_mm !== null)) {
            const candidatas = candidatasDoCodigo(alvo.tipologia)
            if (candidatas.length > 0 && !candidatas.some((c) => cabeNosLimites(c, alvo))) {
                if (tipologiaProposta) descartados += 1
                recusas.push({ ordem: alvo.ordem, motivo: 'LIMITES', tipologia: alvo.tipologia, abertura, medidas: { largura_mm: alvo.largura_mm, altura_mm: alvo.altura_mm } })
                alvo.tipologia = null
                alvo.escolhas = null
                alvo.familia = null
                alvo.motor_id = null
            }
        }
        if (fornecedor !== null || familia !== null) {
            // a resposta à pergunta de qual família: a família dita (o rótulo ou a chave) e/ou o fornecedor do motor apontam UMA
            // das famílias DAQUELA tipologia; o que aponta duas, ou nenhuma, não vale
            propostos += 1
            const casam = alvo.tipologia === null ? [] : ctx.familiasDoCodigo(alvo.tipologia).filter((o) =>
                (fornecedor === null || normalizarNome(o.fornecedor) === normalizarNome(fornecedor))
                && (familia === null || normalizarNome(o.rotulo) === normalizarNome(familia) || normalizarNome(o.familia) === normalizarNome(familia)))
            if (casam.length !== 1) descartados += 1
            else if (alvo.familia !== casam[0].familia) { alvo.familia = casam[0].familia; alvo.motor_id = casam[0].motorId; alvo.escolhas = null }
        }
    }

    // a esquadria das escolhas: a dita, a padrão (a da pergunta em aberto), ou a única
    const alvoDaEscolha = (ordemDita: unknown) => {
        const ordem = ordemValida(ordemDita) ? ordemDita : ctx.ordemPadrao ?? (itens.length === 1 ? itens[0].ordem : null)
        return ordem === null ? undefined : itens.find((i) => i.ordem === ordem)
    }
    for (const bruta of Array.isArray(p.escolhas) ? p.escolhas : []) {
        const e = (bruta && typeof bruta === 'object' ? bruta : {}) as { ordem?: unknown }
        const alvo = alvoDaEscolha(e.ordem)
        const definicao = alvo ? ctx.definicao(alvo) : null
        if (!alvo || !definicao) { propostos += 1; descartados += 1; continue }
        const r = validarEscolha(definicao, lerEscolhasGravadas(alvo.escolhas), bruta)
        propostos += r.propostos
        descartados += r.descartados
        // a escolha feita sai da marca de "pediu as opções" e as outras marcas ficam
        if (r.gravar) alvo.escolhas = { ...(alvo.escolhas ?? {}), ...r.gravar }
    }
    for (const variavel of Array.isArray(p.opcoes_de) ? p.opcoes_de : []) {
        const alvo = alvoDaEscolha(undefined)
        const definicao = alvo ? ctx.definicao(alvo) : null
        propostos += 1
        if (!alvo || !definicao || typeof variavel !== 'string' || escolhaPedida(definicao, variavel) === null) { descartados += 1; continue }
        alvo.escolhas = { ...(alvo.escolhas ?? {}), [variavel]: null }
    }
    // QUANTIDADE NÃO DITA É 1 (dono do produto, 03/11/2026): a esquadria que já diz alguma coisa e não diz quantas é uma — sem perguntar
    for (const i of itens) if (i.quantidade === null && CAMPOS_DA_ESQUADRIA.some((c) => c !== 'quantidade' && !vazio(i[c]))) i.quantidade = 1
    return { itens, propostos, descartados, semEsquadria, recusas }
}

// ── O AGRUPAMENTO (dono do produto, 03/11/2026) ─────────────────────────────────────────────
/**
 * "Mesma tipologia + mesmas medidas + mesmas variáveis + mesmo ambiente = UM item com a quantidade somada." Hoje a esquadria não tem
 * ambiente — "não crie campo nenhum [...] deixe o código preparado para o ambiente entrar como mais um critério quando existir": quando ele
 * existir, entra NESTA lista. A cor do perfil e o vidro também entram (decisão do dono do produto, 03/11/2026): itens iguais em tudo menos na
 * cor ou no vidro continuam dois — nada dito pelo vendedor se perde.
 */
export const CRITERIOS_DO_AGRUPAMENTO = ['tipologia', 'largura_mm', 'altura_mm', 'cor_perfil', 'vidro', 'familia', 'motor_id'] as const
/** Só o item COMPLETO se funde (03/11/2026): tudo dito, menos a quantidade; e com a família resolvida. O que ainda vai receber um vidro não se junta. */
export const itemCompleto = (i: ItemDoLevantamento): boolean =>
    CAMPOS_DA_ESQUADRIA.every((c) => c === 'quantidade' || !vazio(i[c])) && i.familia !== null
const chaveDoAgrupamento = (i: ItemDoLevantamento): string =>
    JSON.stringify([...CRITERIOS_DO_AGRUPAMENTO.map((c) => i[c]), Object.entries(i.escolhas ?? {}).sort(([a], [b]) => a.localeCompare(b))])

/**
 * Funde os itens completos e iguais: o primeiro fica, com as unidades somadas (quantidade não dita conta 1); os outros saem; a numeração
 * volta a 1..N na ordem em que estavam. Devolve uma cópia e quantos itens se fundiram.
 */
export function agruparIguais(itens: readonly ItemDoLevantamento[]): { itens: ItemDoLevantamento[]; fundidos: number } {
    const saida: ItemDoLevantamento[] = []
    const porChave = new Map<string, ItemDoLevantamento>()
    let fundidos = 0
    for (const original of [...itens].sort((a, b) => a.ordem - b.ordem)) {
        const i = { ...original, escolhas: original.escolhas ? { ...original.escolhas } : null }
        if (!itemCompleto(i)) { saida.push(i); continue }
        const chave = chaveDoAgrupamento(i)
        const igual = porChave.get(chave)
        if (!igual) { porChave.set(chave, i); saida.push(i); continue }
        igual.quantidade = (igual.quantidade ?? 1) + (i.quantidade ?? 1)
        fundidos += 1
    }
    return { itens: saida.map((i, k) => ({ ...i, ordem: k + 1 })), fundidos }
}

export type Pendencia =
    | { tipo: 'CAMPO'; ordem: number; campo: CampoDaEsquadria }
    | { tipo: 'FAMILIA'; ordem: number; tipologia: string; opcoes: OpcaoDeFamilia[] }
    | { tipo: 'ESCOLHA'; ordem: number; pendente: EscolhaPendente }

/**
 * TODAS as pendências (dono do produto, 03/11/2026: "uma pergunta por turno que cubra TODAS as pendências do momento"), esquadria por
 * esquadria, na ordem: sem a tipologia, os campos vazios (a família e as escolhas dependem dela); com ela, DE QUAL FAMÍLIA (quando o
 * código está no motor de mais de uma), os outros campos vazios, e as escolhas que o vendedor PEDIU (o `null`; senão vale o Padrão).
 */
export function pendenciasDoLevantamento(itens: readonly ItemDoLevantamento[], definicao: DefinicaoDaTipologia, familiasDoCodigo: FamiliasDoCodigo): Pendencia[] {
    const todas: Pendencia[] = []
    for (const item of [...itens].sort((a, b) => a.ordem - b.ordem)) {
        const faltam = CAMPOS_DA_ESQUADRIA.filter((c) => vazio(item[c]))
        if (!faltam.includes('tipologia')) {
            const familia = familiaDaEsquadria(item, familiasDoCodigo)
            if (familia && 'opcoes' in familia) todas.push({ tipo: 'FAMILIA', ordem: item.ordem, tipologia: String(item.tipologia), opcoes: familia.opcoes })
        }
        for (const campo of faltam) todas.push({ tipo: 'CAMPO', ordem: item.ordem, campo })
        if (faltam.includes('tipologia')) continue
        const def = definicao(item)
        if (!def) continue
        for (const [variavel, v] of Object.entries(item.escolhas ?? {})) {
            const pendente = v === null ? escolhaPedida(def, variavel) : null
            if (pendente) todas.push({ tipo: 'ESCOLHA', ordem: item.ordem, pendente })
        }
    }
    return todas
}

/** A primeira coisa que falta — a primeira de `pendenciasDoLevantamento`. */
export function proximaPendencia(itens: readonly ItemDoLevantamento[], definicao: DefinicaoDaTipologia, familiasDoCodigo: FamiliasDoCodigo): Pendencia | null {
    return pendenciasDoLevantamento(itens, definicao, familiasDoCodigo)[0] ?? null
}

/** Como cada campo é pedido quando vai junto com outros ("me diga a largura (em mm), a cor do perfil e o vidro"). */
const NOME_DO_CAMPO: Record<CampoDaEsquadria, string> = {
    tipologia: 'o tipo de esquadria', largura_mm: 'a largura (em mm)', altura_mm: 'a altura (em mm)', quantidade: 'quantas unidades', cor_perfil: 'a cor do perfil', vidro: 'o vidro',
}
const eLista = (xs: readonly string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`)

/**
 * UMA pergunta com TODAS as pendências (03/11/2026): por esquadria, numa linha ("Esquadria 1: … \nEsquadria 2: …" quando há mais de
 * uma), os campos que faltam juntos, a família e as escolhas pedidas. Com uma pendência só, a pergunta fixa de sempre. `cabecaDaIa`
 * é a pergunta que a IA reformulou para o CAMPO da primeira pendência (duas tipologias possíveis, linguagem de obra): entra no
 * lugar da fixa daquele campo, e o resto vem junto.
 */
export function perguntaDasPendencias(ps: readonly Pendencia[], nItens: number, cabecaDaIa: string | null = null): string {
    if (ps.length === 0) return ''
    const primeira = ps[0]
    if (ps.length === 1 && cabecaDaIa === null) return perguntaDaPendencia(primeira, nItens)
    const porEsquadria = new Map<number, Pendencia[]>()
    for (const p of ps) porEsquadria.set(p.ordem, [...(porEsquadria.get(p.ordem) ?? []), p])
    const linhas = [...porEsquadria.entries()].map(([ordem, lista]) => {
        const campos = lista.flatMap((p) => (p.tipo === 'CAMPO' ? [p.campo] : []))
        const daIa = cabecaDaIa !== null && primeira.tipo === 'CAMPO' && primeira.ordem === ordem ? primeira.campo : null
        const cabecaDe = daIa ?? (campos.includes('tipologia') ? 'tipologia' : null)
        const cabeca = daIa !== null ? cabecaDaIa : cabecaDe === 'tipologia' ? PERGUNTA_DO_CAMPO.tipologia : null
        const outros = campos.filter((c) => c !== cabecaDe)
        const partes: string[] = []
        if (cabeca !== null) partes.push(outros.length ? `${cabeca} E me diga ${eLista(outros.map((c) => NOME_DO_CAMPO[c]))}.` : cabeca)
        else if (outros.length === 1) partes.push(PERGUNTA_DO_CAMPO[outros[0]])
        else if (outros.length > 1) partes.push(`Me diga ${eLista(outros.map((c) => NOME_DO_CAMPO[c]))}.`)
        for (const p of lista) {
            if (p.tipo === 'FAMILIA') partes.push(fraseDeQualFamilia(p.tipologia, p.opcoes))
            if (p.tipo === 'ESCOLHA') partes.push(perguntaDaEscolha(p.pendente))
        }
        const texto = partes.join(' ')
        return nItens > 1 ? `Esquadria ${ordem}: ${texto}` : texto
    })
    return linhas.join('\n')
}

/** A pergunta FIXA da pendência; com mais de uma esquadria, diz de qual. */
export function perguntaDaPendencia(p: Pendencia, nItens: number): string {
    const pergunta = p.tipo === 'CAMPO' ? PERGUNTA_DO_CAMPO[p.campo]
        : p.tipo === 'FAMILIA' ? fraseDeQualFamilia(p.tipologia, p.opcoes)
            : perguntaDaEscolha(p.pendente)
    return nItens > 1 ? `Esquadria ${p.ordem}: ${pergunta}` : pergunta
}
