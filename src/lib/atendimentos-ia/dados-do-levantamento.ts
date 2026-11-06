/**
 * Atendimentos I.A. — os DADOS DO LEVANTAMENTO que a coleta passa a capturar (dono do produto, 06/11/2026; colunas da migração
 * `20261106000002`, aplicada e conferida pelo dono do produto em 06/11/2026): os dados do cliente, os ambientes e a obs de cada item, os
 * percentuais das condições comerciais e o vendedor. Funções puras: não leem banco nem rede.
 *
 * A REGRA QUE NÃO SE NEGOCIA: a LLM PROPÕE, o código VALIDA. Cada valor só vale se o vendedor o DISSE NESTA mensagem:
 *   - texto livre (edificação, endereço, obs, responsável pela RT, ambiente, vendedor): toda palavra do valor está na mensagem (sem caixa e
 *     sem acento) — a IA copia, não completa (a mesma regra do vidro, 04/11/2026);
 *   - telefone: os dígitos dele estão, em sequência, nos dígitos da mensagem; e-mail: está na mensagem, sem caixa;
 *   - data de entrega: a IA a manda como AAAA-MM-DD, e o dia e o mês estão na mensagem como número ("27/11/26", "4/2");
 *   - percentual: de 0 a 100, e o número está na mensagem ("5", "1,5"); o modo: a palavra (proporcional, congelada) está na mensagem;
 *   - o ambiente: o nome dito e a quantidade inteira maior que zero, também dita; dois ambientes com o mesmo nome no mesmo item são ERRO
 *     DE DIGITAÇÃO (dono do produto, 06/11/2026) — a lista inteira cai, e a CHECK do banco diria o mesmo.
 * Os limites de texto são os das CHECKs da migração (aprovados pelo dono do produto): o valor acima do limite cai, nunca é cortado.
 *
 * OS PERCENTUAIS (decisão do dono do produto, 06/11/2026):
 *   1. o CADASTRO é o padrão: `orcamentista_vendedor_perfil` do VENDEDOR do levantamento (que pode não ser quem conversa);
 *   2. o DITO na conversa substitui o cadastrado;
 *   3. o resultado fica GRAVADO NO LEVANTAMENTO, congelado — o arquivo nunca relê o cadastro;
 *   4. cadastro nulo e nada dito → o agente PERGUNTA (`perguntaDasCondicoes`): nunca inventa, nunca zero, nunca herda de outro levantamento;
 *   5. `employees.commission_percent` NÃO é fonte;
 *   6. o RESPONSÁVEL PELA RT só vem da conversa; sem ele, o campo do arquivo fica em branco — e isso não trava o levantamento.
 *
 * Portão: `src/utils/__tests__/dados-do-levantamento.test.ts`.
 */
import { normalizarNome } from '@/lib/atendimentos-ia/nome-do-levantamento'

/** Os limites das CHECKs da migração 20261106000002 (caracteres, como o `char_length` do banco). */
export const LIMITES_DE_TEXTO = {
    telefone: 40, email: 254, edificacao: 120, endereco: 300, obs_obra: 1000, reserva_tecnica_responsavel: 120, vendedor: 120, ambiente: 80, obs: 1000,
} as const

export type ModoDaComissao = 'PROPORCIONAL' | 'CONGELADA'
export type DadosDoCliente = Partial<{ telefone: string; email: string; edificacao: string; endereco: string; obs_obra: string; data_entrega: string }>
export type CondicoesDitas = Partial<{
    comissao_percentual: number; comissao_modo: ModoDaComissao; reserva_tecnica_percentual: number; reserva_tecnica_responsavel: string; lucro_projetado_percentual: number
}>
export type AmbienteDoItem = { ambiente: string; quantidade: number }

const caracteres = (t: string) => [...t].length
const palavras = (t: string) => normalizarNome(t).split(/[^a-z0-9]+/).filter(Boolean)
const numerosDaMensagem = (m: string) => (m.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => Number(n.replace(',', '.')))

/** O texto livre: aparado, dentro do limite, e TODA palavra dele na mensagem. */
export function textoDito(v: unknown, mensagem: string, limite: number): string | null {
    if (typeof v !== 'string') return null
    const t = v.trim()
    if (t === '' || caracteres(t) > limite) return null
    const naMensagem = new Set(palavras(mensagem))
    const ps = palavras(t)
    return ps.length > 0 && ps.every((p) => naMensagem.has(p)) ? t : null
}

export function telefoneDito(v: unknown, mensagem: string): string | null {
    if (typeof v !== 'string') return null
    const t = v.trim()
    const digitos = t.replace(/\D/g, '')
    if (digitos.length < 8 || caracteres(t) > LIMITES_DE_TEXTO.telefone) return null
    return mensagem.replace(/\D/g, '').includes(digitos) ? t : null
}

export function emailDito(v: unknown, mensagem: string): string | null {
    if (typeof v !== 'string') return null
    const t = v.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+$/.test(t) || caracteres(t) > LIMITES_DE_TEXTO.email) return null
    return mensagem.toLowerCase().includes(t) ? t : null
}

/** A data de entrega: AAAA-MM-DD válida, com o dia e o mês ditos na mensagem como número ("27/11/26", "04/02/27", "4/2"). */
export function dataDita(v: unknown, mensagem: string): string | null {
    if (typeof v !== 'string') return null
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim())
    if (!m) return null
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
    if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return null
    const pares = [...mensagem.matchAll(/(\d{1,2})\s*[/.-]\s*(\d{1,2})/g)].map((x) => [Number(x[1]), Number(x[2])])
    return pares.some(([dia, mes]) => dia === Number(m[3]) && mes === Number(m[2])) ? v.trim() : null
}

/** O percentual: de 0 a 100, e o número dito na mensagem. */
export function percentualDito(v: unknown, mensagem: string): number | null {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 100) return null
    return numerosDaMensagem(mensagem).some((n) => n === v) ? v : null
}

export function modoDito(v: unknown, mensagem: string): ModoDaComissao | null {
    const m = normalizarNome(mensagem)
    if (v === 'PROPORCIONAL' && /\bproporciona/.test(m)) return 'PROPORCIONAL'
    if (v === 'CONGELADA' && /\bcongelad/.test(m)) return 'CONGELADA'
    return null
}

/** Os ambientes de um item: todos válidos e ditos, sem nome repetido (sem caixa), ou nenhum. */
export function ambientesDitos(v: unknown, mensagem: string): AmbienteDoItem[] | null {
    if (!Array.isArray(v) || v.length === 0) return null
    const numeros = numerosDaMensagem(mensagem)
    const lidos: AmbienteDoItem[] = []
    for (const bruto of v) {
        const a = (bruto && typeof bruto === 'object' ? bruto : {}) as { ambiente?: unknown; quantidade?: unknown }
        const nome = textoDito(a.ambiente, mensagem, LIMITES_DE_TEXTO.ambiente)
        const q = a.quantidade
        if (nome === null || typeof q !== 'number' || !Number.isInteger(q) || q < 1 || !numeros.includes(q)) return null
        if (lidos.some((x) => x.ambiente.toLocaleLowerCase('pt-BR') === nome.toLocaleLowerCase('pt-BR'))) return null
        lidos.push({ ambiente: nome, quantidade: q })
    }
    return lidos
}

export type DadosDaMensagem = {
    /** A proposta com os ambientes e a obs de cada item já validados (o que não passou foi tirado). */
    proposta: Record<string, unknown>
    cliente: DadosDoCliente
    condicoes: CondicoesDitas
    /** O nome do vendedor PARA QUEM o levantamento é lançado, como dito (o código acha o funcionário). */
    vendedor: string | null
    propostos: number
    descartados: number
}

/** Lê da proposta da IA o que é dado do levantamento, e devolve a proposta com o que é do item validado. Nada aqui grava. */
export function lerDadosDaMensagem(propostaBruta: unknown, mensagem: string): DadosDaMensagem {
    const p = (propostaBruta && typeof propostaBruta === 'object' ? propostaBruta : {}) as Record<string, unknown>
    let propostos = 0
    let descartados = 0
    const conta = <T>(v: unknown, lido: T | null): T | null => {
        if (v === undefined || v === null) return null
        propostos += 1
        if (lido === null) descartados += 1
        return lido
    }
    const c = (p.dados_do_cliente && typeof p.dados_do_cliente === 'object' ? p.dados_do_cliente : {}) as Record<string, unknown>
    const cliente: DadosDoCliente = {}
    const tel = conta(c.telefone, telefoneDito(c.telefone, mensagem)); if (tel !== null) cliente.telefone = tel
    const email = conta(c.email, emailDito(c.email, mensagem)); if (email !== null) cliente.email = email
    for (const campo of ['edificacao', 'endereco', 'obs_obra'] as const) {
        const t = conta(c[campo], textoDito(c[campo], mensagem, LIMITES_DE_TEXTO[campo])); if (t !== null) cliente[campo] = t
    }
    const data = conta(c.data_entrega, dataDita(c.data_entrega, mensagem)); if (data !== null) cliente.data_entrega = data

    const k = (p.condicoes && typeof p.condicoes === 'object' ? p.condicoes : {}) as Record<string, unknown>
    const condicoes: CondicoesDitas = {}
    for (const campo of ['comissao_percentual', 'reserva_tecnica_percentual', 'lucro_projetado_percentual'] as const) {
        const n = conta(k[campo], percentualDito(k[campo], mensagem)); if (n !== null) condicoes[campo] = n
    }
    const modo = conta(k.comissao_modo, modoDito(k.comissao_modo, mensagem)); if (modo !== null) condicoes.comissao_modo = modo
    const resp = conta(k.reserva_tecnica_responsavel, textoDito(k.reserva_tecnica_responsavel, mensagem, LIMITES_DE_TEXTO.reserva_tecnica_responsavel))
    if (resp !== null) condicoes.reserva_tecnica_responsavel = resp

    const vendedor = conta(p.vendedor_do_levantamento, textoDito(p.vendedor_do_levantamento, mensagem, LIMITES_DE_TEXTO.vendedor))

    // os ambientes e a obs de cada item: validados aqui; o que não passa sai da proposta (o item continua com o resto)
    const itens = Array.isArray(p.itens) ? p.itens.map((bruto) => {
        if (!bruto || typeof bruto !== 'object') return bruto
        const i = { ...(bruto as Record<string, unknown>) }
        if ('ambientes' in i) { const a = conta(i.ambientes, ambientesDitos(i.ambientes, mensagem)); if (a === null) delete i.ambientes; else i.ambientes = a }
        if ('obs' in i) { const o = conta(i.obs, textoDito(i.obs, mensagem, LIMITES_DE_TEXTO.obs)); if (o === null) delete i.obs; else i.obs = o }
        return i
    }) : p.itens
    return { proposta: { ...p, itens }, cliente, condicoes, vendedor, propostos, descartados }
}

// ── AS CONDIÇÕES COMERCIAIS DO ARQUIVO ───────────────────────────────────────────────────────
export type CondicoesDoLevantamento = {
    comissao_percentual: number | null
    comissao_modo: ModoDaComissao | null
    reserva_tecnica_percentual: number | null
    reserva_tecnica_responsavel: string | null
    lucro_projetado_percentual: number | null
}
export type PerfilDoVendedor = {
    comissao_percentual: number | null; comissao_modo: ModoDaComissao | null; reserva_tecnica_percentual: number | null; lucro_projetado_percentual: number | null
}
const CAMPOS_DO_CADASTRO = ['comissao_percentual', 'comissao_modo', 'reserva_tecnica_percentual', 'lucro_projetado_percentual'] as const
const NOME_DO_CAMPO: Record<(typeof CAMPOS_DO_CADASTRO)[number], string> = {
    comissao_percentual: 'a comissão (%)', comissao_modo: 'o modo da comissão (proporcional ou congelada)',
    reserva_tecnica_percentual: 'a reserva técnica (%)', lucro_projetado_percentual: 'o lucro projetado da proposta (%)',
}

/**
 * O que vale no levantamento: o gravado (o dito, ou o já congelado do cadastro) e, no que falta, o cadastro do vendedor. Devolve também o que
 * veio do cadastro AGORA (para congelar no levantamento) e o que continua faltando (para perguntar). O responsável pela RT nunca vem do cadastro.
 */
export function condicoesComOCadastro(gravadas: CondicoesDoLevantamento, perfil: PerfilDoVendedor | null): {
    condicoes: CondicoesDoLevantamento; doCadastro: Partial<CondicoesDoLevantamento>; faltam: string[]
} {
    const condicoes = { ...gravadas }
    const doCadastro: Partial<CondicoesDoLevantamento> = {}
    const faltam: string[] = []
    for (const campo of CAMPOS_DO_CADASTRO) {
        if (condicoes[campo] !== null) continue
        const v = perfil ? perfil[campo] : null
        if (v !== null && v !== undefined) { (condicoes as Record<string, unknown>)[campo] = v; (doCadastro as Record<string, unknown>)[campo] = v }
        else faltam.push(NOME_DO_CAMPO[campo])
    }
    return { condicoes, doCadastro, faltam }
}

const ouLista = (xs: readonly string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`)

/** A pergunta do que falta nas condições: nomeia cada uma e o vendedor de quem são (cadastro nulo e nada dito → pergunta). */
export function perguntaDasCondicoes(faltam: readonly string[], vendedor: string | null): string {
    return `Para fechar o levantamento, falta${faltam.length > 1 ? 'm' : ''} ${ouLista(faltam)}${vendedor ? ` do vendedor ${vendedor}` : ''}. Qual é?`
}

/** A frase do vendedor dito que não está no cadastro: nunca escolhe um parecido. */
export const fraseDoVendedorNaoAchado = (nome: string) =>
    `Não achei o vendedor “${nome}” no cadastro da empresa. Diga o nome dele como está no cadastro.`

// ── O VENDEDOR DITO: só os ATIVOS, casados pelas palavras (dono do produto, 06/11/2026) ───────────────
/**
 * "A busca do vendedor pelo nome considera SÓ funcionários com is_active = true na empresa do levantamento." (`status` não serve: é ACTIVE nos 16
 * funcionários da plataforma, inclusive nos 4 com is_active = false — medido em 06/11/2026.) "Funcionário inativo não pode ser escolhido como
 * vendedor de um levantamento novo — seria comissão para quem não está mais na empresa." O levantamento já gravado não é tocado: o nome do vendedor
 * fica congelado nele.
 *
 * O nome dito CASA quando toda palavra dele está no nome do funcionário ("Germano" casa "Germano Teixeira"; "Germano Silva" não) — sem caixa,
 * sem acento.
 */
export function nomeCasa(dito: string, doCadastro: string, normalizar: (t: string) => string): boolean {
    const palavras = (t: string) => normalizar(t).split(/[^a-z0-9]+/).filter(Boolean)
    const ditas = palavras(dito)
    const doNome = new Set(palavras(doCadastro))
    return ditas.length > 0 && ditas.every((p) => doNome.has(p))
}

/**
 * Dois ATIVOS que casam: a conversa PERGUNTA qual é. O que os separa na pergunta é o NOME COMPLETO e a DATA DO CADASTRO (no fuso da empresa) —
 * "NÃO desambigue por cargo": o cargo é dado sujo ("Vendedor " com espaço no fim), e qualquer limpeza futura quebraria a regra; a situação não
 * separa, porque todos são ativos. Nunca e-mail, telefone ou documento. Mesmo nome e mesmo dia: recusa nomeada, nunca uma escolha.
 */
export type Homonimo = { nome: string; cadastradoEm: string }
/** O dia do cadastro no fuso da empresa (o do resgate): um cadastro às 23h de São Paulo já é o dia seguinte em UTC. */
const dataDoCadastro = (iso: string) => {
    const t = Date.parse(iso)
    return Number.isFinite(t) ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(t) : 'sem data'
}
const nomeExibido = (nome: string) => nome.replace(/\s+/g, ' ').trim()
export const descricaoDoHomonimo = (h: Homonimo) => `${nomeExibido(h.nome)}, cadastrado em ${dataDoCadastro(h.cadastradoEm)}`
/** Dá para perguntar? Só se a descrição de cada um (o nome, sem caixa nem acento, e o dia) for diferente da de todos os outros. */
export const homonimosDistinguiveis = (hs: readonly Homonimo[], normalizar: (t: string) => string) =>
    new Set(hs.map((h) => `${normalizar(h.nome)}|${dataDoCadastro(h.cadastradoEm)}`)).size === hs.length

export const fraseDosHomonimos = (dito: string, hs: readonly Homonimo[]) =>
    `Há ${hs.length} funcionários ativos que casam com “${dito}” no cadastro da empresa: ${hs.map((h, k) => `${k + 1}) ${descricaoDoHomonimo(h)}`).join('; ')}. Qual deles é o vendedor deste levantamento?`
export const fraseDosHomonimosIndistinguiveis = (dito: string, vezes: number) =>
    `Há ${vezes} funcionários ativos que casam com “${dito}” no cadastro da empresa, com o mesmo nome e cadastrados no mesmo dia: nada no cadastro os distingue. Não escolho entre eles: corrija o cadastro ou diga outro vendedor.`
/** O nome dito que só casa com INATIVO(S): frase própria (dono do produto, 06/11/2026), nada é gravado. */
export const fraseDoVendedorInativo = (dito: string, inativos: readonly { nome: string }[]) =>
    inativos.length === 1
        ? `O funcionário “${nomeExibido(inativos[0].nome)}” está inativo no cadastro da empresa e não pode ser o vendedor de um levantamento novo. Diga outro vendedor.`
        : `Os ${inativos.length} funcionários que casam com “${dito}” estão inativos no cadastro da empresa e não podem ser o vendedor de um levantamento novo. Diga outro vendedor.`
/** Sem vendedor nenhum (o funcionário do remetente está inativo, e ninguém foi dito): a conversa pede o vendedor antes dos percentuais. */
export const FRASE_FALTA_O_VENDEDOR = 'Para fechar o levantamento, falta o vendedor. De quem é este levantamento?'
