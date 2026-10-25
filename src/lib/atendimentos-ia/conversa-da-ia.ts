/**
 * Atendimentos I.A. — a CONVERSA: a IA responde no WhatsApp e monta o LEVANTAMENTO, achado pelo NOME.
 *
 * ══ A ARQUITETURA (dono do produto, 25/10/2026) ══
 * O LEVANTAMENTO é a entidade (`orcamentista_levantamento` e `_item`, migração 20261025000003), de UM
 * remetente, achado pelo nome. A conversa deixa de ser identidade de qualquer coisa: nada é gravado em
 * `orcamentista_conversa`, `orcamentista_mensagem` nem `orcamentista_pre_definicao` (decisão 4). A LLM
 * recebe SÓ a mensagem desta vez; o que ela precisa saber do passado vai no prompt, lido do levantamento.
 *
 * ══ O ROTEAMENTO, nesta ordem ══
 *   - o remetente tem um levantamento EM_MONTAGEM → a mensagem continua nele, com a pergunta em aberto
 *     no prompt. É isso que faz o "4" de uma pergunta de arremate cair no lugar;
 *   - senão, o NOME que a IA leu, SÓ se estiver no texto do vendedor (`nomeDaMensagem`):
 *       ausente → pergunta o nome, e não cria nada;
 *       IGUAL a um dele (sem caixa e sem acento, `compararNome`) → ALTERAÇÃO: sobrescreve (decisão 3)
 *         e refaz o trajeto INTEIRO — pendências, barras, preço, mão de obra; com "novo", diz que o
 *         nome já existe;
 *       PARECIDO ("Casa do João 2", "João") → PERGUNTA se é novo, citando os que existem. Nunca decide
 *         por semelhança (decisão 1). Com "novo", cria;
 *       NOVO → cria, EM_MONTAGEM até não faltar nada.
 *   Só o remetente que criou altera (decisão 2): toda leitura é por (tenant_id, remetente_id).
 *
 * ══ A REGRA QUE NÃO SE NEGOCIA: a LLM PROPÕE, o código VALIDA e GRAVA ══
 * Saída estruturada: uma ferramenta `strict`; `tool_choice` é `auto` porque o forçado é recusado com
 * 400 pelo `claude-sonnet-5-5` — e sem a chamada, nada é gravado nem enviado. Cada valor passa por
 * `aplicarProposta` (`levantamento-em-montagem.ts`): a tipologia e a cor só das listas, exatas; a
 * LLM não escolhe tenant nem remetente. A PRÓXIMA pergunta é decidida pelo código
 * (`proximaPendencia`), não pela LLM. O levantamento é gravado ANTES do envio: se o envio falhar, o
 * que o vendedor disse não se perde.
 *
 * ══ O QUE SE PERDEU, por decisão (dono do produto, 25/10/2026) ══
 * Sem a linha da mensagem, o reenvio do WUZAPI não é mais reconhecido: o mesmo `Info.ID` é conduzido
 * de novo. Com o levantamento em montagem a resposta repetida cai na mesma pergunta; depois de
 * COMPLETO, o reenvio de uma alteração a refaz com os mesmos números.
 *
 * ══ NUNCA LANÇA ══
 * Quem chama responde 200 ao WUZAPI aconteça o que acontecer: um erro da LLM não pode virar reenvio em
 * laço. Toda falha vira uma linha `[IA]`, e NENHUMA mensagem técnica ao vendedor.
 *
 * ══ O LOG ══
 * Uma linha `[IA]` em `console.error`: o id do levantamento, a rota, propostos, descartados, se
 * enviou, e o desfecho. NUNCA a chave, o telefone, o texto, o nome do levantamento ou a pergunta. Num
 * 4xx da Anthropic a linha leva a `mensagem=` do erro, mascarada antes de cortada.
 *
 * Portão: `src/utils/__tests__/atendimentos-ia-levantamento-por-nome.test.ts`.
 */
import { supabaseAdmin } from '@/supabase/admin'
import { MODELO_PADRAO_DA_IA, URL_DA_API_ANTHROPIC, VERSAO_DA_API_ANTHROPIC } from '@/lib/atendimentos-ia/modelo-da-ia'
import { paraOLog } from '@/utils/atendimentos-ia-mascara-do-log'
import {
    FRASE_SEM_CORES, lerCoresDaEmpresa, lerTabelaDaEmpresa, linhaDoCandidato, mensagemDoLevantamento, tipologiaDaTabela, type CandidatoDeTipologia,
} from '@/lib/atendimentos-ia/levantamento-da-conversa'
import {
    CAMPOS_DA_ESQUADRIA, aplicarProposta, itemVazio, perguntaDaPendencia, proximaPendencia,
    type DefinicaoDaTipologia, type ItemDoLevantamento, type Pendencia,
} from '@/lib/atendimentos-ia/levantamento-em-montagem'
import { compararNome, nomeDaMensagem, normalizarNome } from '@/lib/atendimentos-ia/nome-do-levantamento'
import { lerEscolhasGravadas } from '@/lib/atendimentos-ia/escolhas-da-tipologia'

export const PREFIXO_DO_LOG_DA_IA = '[IA]'
export const NOME_DA_FERRAMENTA = 'registrar_levantamento'
const EM_MONTAGEM = 'EM_MONTAGEM'
const COMPLETO = 'COMPLETO'
const wuzapi = () => (process.env.WUZAPI_BASE_URL || 'https://usapi.adabtech.shop').replace(/\/$/, '')

export type DesfechoDaIa =
    | 'sem-chave' | 'sem-saldo' | 'erro-da-llm' | 'recusa' | 'sem-proposta' | 'sem-tipologias'
    | 'sem-nome' | 'nome-parecido' | 'nome-existe' | 'qual-esquadria'
    | 'perguntou' | 'sem-cores' | 'levantou' | 'recusou' | 'envio-falhou' | 'erro'

export type Rota = 'MONTAGEM' | 'NOVO' | 'ALTERACAO' | 'SEM_NOME' | 'PARECIDO' | 'NOME_EXISTE' | '-'
type Rastro = { levantamento: string; rota: Rota; propostos: number; descartados: number; enviou: boolean }

function anotar(r: Rastro, desfecho: DesfechoDaIa, detalhe = '') {
    console.error(`${PREFIXO_DO_LOG_DA_IA} levantamento=${r.levantamento} rota=${r.rota} propostos=${r.propostos} descartados=${r.descartados} enviou=${r.enviou ? 'sim' : 'nao'} desfecho=${desfecho}${detalhe ? ` ${detalhe}` : ''}`)
}

// ── As frases fixas do roteamento ───────────────────────────────────────────────────────────
export const FRASE_SEM_NOME = 'Para eu anotar, me diga o nome do levantamento — por exemplo: Levantamento Casa do João. Se for sobre um levantamento que você já fez, escreva o nome dele como da primeira vez.'
const listaDeNomes = (nomes: string[]) => nomes.map((n) => `“${n}”`).join(', ')
export const fraseDoNomeParecido = (nome: string, existentes: string[]) =>
    `Você já tem ${existentes.length > 1 ? 'levantamentos com nome parecido' : 'um levantamento com nome parecido'}: ${listaDeNomes(existentes)}. `
    + `“${nome}” é um levantamento NOVO? Se for, responda: novo ${nome}. Se for sobre ${existentes.length > 1 ? 'um dos que já existem' : 'o que já existe'}, escreva o nome exatamente como ele está.`
export const fraseDoNomeQueJaExiste = (nome: string) =>
    `Já existe o levantamento “${nome}”. Para alterá-lo, escreva o nome dele e o que muda; para um novo, use outro nome.`
export const fraseDeQualEsquadria = (nome: string, nItens: number) =>
    `O levantamento “${nome}” tem ${nItens} esquadrias. Qual delas muda? Diga o número (de 1 a ${nItens}) e o que muda.`

// ── A FERRAMENTA — a saída estruturada ──────────────────────────────────────────────────────
/**
 * O que NÃO foi dito é OMITIDO, não `null`: os campos são opcionais e de tipo simples, sem união.
 * "Schema complexity limits" (https://platform.claude.com/docs/en/build-with-claude/structured-outputs):
 * somando os esquemas `strict` da requisição, no máximo 16 parâmetros com união e 24 opcionais. Este tem
 * 0 uniões e 15 opcionais — o portão (8) conta o esquema enviado.
 */
const texto = { type: 'string' }
const inteiro = { type: 'integer' }
export const FERRAMENTA = {
    name: NOME_DA_FERRAMENTA,
    description: 'Registra o que o vendedor disse nesta mensagem. Chame SEMPRE, uma vez por resposta.',
    strict: true,
    input_schema: {
        type: 'object',
        additionalProperties: false,
        required: ['itens'],
        properties: {
            nome: { ...texto, description: 'O nome do levantamento, copiado INTEIRO como o vendedor o escreveu NESTA mensagem. Omita se ele não escreveu.' },
            novo: { type: 'boolean', description: 'true SÓ quando o vendedor disse explicitamente que é um levantamento novo.' },
            itens: {
                type: 'array',
                description: 'As esquadrias ditas NESTA mensagem, com SÓ os campos ditos. Vazio se nenhuma.',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        ordem: { ...inteiro, description: 'O número da esquadria, SÓ quando o vendedor disse qual é.' },
                        tipologia: texto, largura_mm: inteiro, altura_mm: inteiro, quantidade: inteiro, cor_perfil: texto, vidro: texto,
                    },
                },
            },
            escolha: {
                type: 'object',
                additionalProperties: false,
                description: 'Só quando o vendedor respondeu NESTA mensagem a escolha em aberto: a variável e o NÚMERO da opção.',
                properties: { variavel: texto, opcao: inteiro },
            },
            pergunta: {
                type: 'object',
                additionalProperties: false,
                description: 'Só quando a pergunta em aberto é sobre um CAMPO e você precisa reformulá-la (ex.: duas tipologias possíveis).',
                properties: { campo: { type: 'string', enum: [...CAMPOS_DA_ESQUADRIA] }, texto },
            },
        },
    },
}

type ContextoDoPrompt = {
    candidatos: readonly CandidatoDeTipologia[]
    cores: readonly string[]
    montagem: { nome: string; itens: ItemDoLevantamento[] } | null
    perguntaEmAberto: string | null
}

function sistema(c: ContextoDoPrompt): string {
    return [
        'Você conversa pelo WhatsApp com um VENDEDOR de uma empresa de esquadrias e anota LEVANTAMENTOS.',
        'Cada levantamento tem um NOME dado pelo vendedor (ex.: "Levantamento Casa do João") e uma ou mais esquadrias.',
        'O vendedor já sabe o que a empresa vende: você só anota. Você recebe SÓ a mensagem desta vez.',
        '',
        'Os campos de cada esquadria: tipologia; largura_mm; altura_mm; quantidade; cor_perfil; vidro.',
        'Medidas em milímetros, inteiras: se o vendedor disser em metros ou centímetros, converta.',
        '',
        'Regras:',
        '- nome: copie o nome do levantamento INTEIRO, como o vendedor escreveu nesta mensagem. Não complete, não corrija, não encurte. Se ele não escreveu um nome, omita.',
        '- novo: true SÓ quando o vendedor disse que é um levantamento novo ("novo ..."). Senão, omita.',
        '- itens: só o que foi dito NESTA mensagem. Numa alteração, só os campos que mudam. Não invente, não deduza.',
        '- cor_perfil: EXATAMENTE uma das cores da empresa (lista do fim), escrita como está. Se for outra cor, ou se houver dúvida, NÃO preencha.',
        '- tipologia: o CÓDIGO (ex.: DP-02) de UMA das tipologias da lista do fim, escolhida pela descrição. NUNCA invente código nem preencha com as palavras do vendedor. Se cabe em mais de uma, NÃO preencha: em `pergunta`, pergunte qual é, citando a descrição INTEIRA de cada uma, sem o código.',
        '- escolha: quando o vendedor responder a escolha em aberto, a variável e o NÚMERO da opção. NUNCA escolha sozinho, nem pelo Padrão: se a resposta não for uma das opções, não preencha.',
        '- NUNCA pergunte nada sobre os padrões da empresa.',
        `- Responda SEMPRE chamando a ferramenta ${NOME_DA_FERRAMENTA}, uma vez.`,
        '',
        c.montagem
            ? `Levantamento em montagem: “${c.montagem.nome}”, esquadrias (null = ainda não dito): ${JSON.stringify(c.montagem.itens)}`
            : 'Levantamento em montagem: nenhum.',
        ...(c.perguntaEmAberto ? [`Pergunta em aberto: ${c.perguntaEmAberto}`] : []),
        '',
        'Tipologias da tabela em uso da empresa (código | descrição | tipo):',
        ...(c.candidatos.length ? c.candidatos.map(linhaDoCandidato) : ['(nenhuma)']),
        '',
        `Cores da empresa (cor_perfil, escreva EXATAMENTE uma delas): ${c.cores.length ? c.cores.join(', ') : '(nenhuma)'}`,
    ].join('\n')
}

// ── A LLM ───────────────────────────────────────────────────────────────────────────────────
type ResultadoDaLlm =
    | { tipo: 'ok'; proposta: Record<string, unknown> }
    | { tipo: 'sem-saldo' | 'erro-da-llm' | 'recusa' | 'sem-proposta'; detalhe: string }

/** Sem saldo: 402 `billing_error`, ou o 400 com "credit balance" que a API também já devolveu. */
function ehSemSaldo(status: number, erro: { type?: unknown; message?: unknown } | undefined): boolean {
    if (status === 402 || erro?.type === 'billing_error') return true
    return status === 400 && typeof erro?.message === 'string' && /credit balance/i.test(erro.message)
}

/** A mensagem de um 4xx: mascarada (a chave entre os segredos), sem aspas nem quebras, e SÓ DEPOIS cortada. */
const MAXIMO_DA_MENSAGEM_NO_LOG = 300
function mensagemParaOLog(mensagem: unknown, chave: string): string {
    if (typeof mensagem !== 'string') return '-'
    return paraOLog(mensagem, [chave]).replace(/["\r\n]+/g, ' ').slice(0, MAXIMO_DA_MENSAGEM_NO_LOG)
}

async function chamarLlm(chave: string, mensagem: string, contexto: ContextoDoPrompt): Promise<ResultadoDaLlm> {
    let r: Response
    try {
        r = await fetch(URL_DA_API_ANTHROPIC, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-api-key': chave, 'anthropic-version': VERSAO_DA_API_ANTHROPIC },
            body: JSON.stringify({
                // O MODELO POR CONTA entraria aqui, junto do teto: hoje não há coluna para ele —
                // `orcamentista_config.modelo` é o modelo de ATENDIMENTO (ver `modelo-da-ia.ts`).
                model: MODELO_PADRAO_DA_IA,
                max_tokens: 16000,
                // extração curta de uma mensagem de chat: o raciocínio fica no mínimo
                output_config: { effort: 'low' },
                system: sistema(contexto),
                tools: [FERRAMENTA],
                tool_choice: { type: 'auto' },
                messages: [{ role: 'user', content: mensagem }],
            }),
        })
    } catch (e) {
        return { tipo: 'erro-da-llm', detalhe: `excecao=${e instanceof Error ? e.name : 'desconhecida'}` }
    }
    const corpo = (await r.json().catch((): null => null)) as Record<string, unknown> | null
    if (!r.ok) {
        const erro = (corpo?.error ?? undefined) as { type?: unknown; message?: unknown } | undefined
        const janela = r.status >= 400 && r.status < 500 ? ` mensagem="${mensagemParaOLog(erro?.message, chave)}"` : ''
        if (ehSemSaldo(r.status, erro)) return { tipo: 'sem-saldo', detalhe: `status=${r.status} motivo="a conta da Anthropic está sem saldo de créditos"${janela}` }
        return { tipo: 'erro-da-llm', detalhe: `status=${r.status} tipo=${typeof erro?.type === 'string' ? erro.type : '-'}${janela}` }
    }
    if (corpo?.stop_reason === 'refusal') return { tipo: 'recusa', detalhe: '' }
    const blocos = Array.isArray(corpo?.content) ? (corpo?.content as Array<Record<string, unknown>>) : []
    const chamada = blocos.find((b) => b.type === 'tool_use' && b.name === NOME_DA_FERRAMENTA)
    if (!chamada || !chamada.input || typeof chamada.input !== 'object') return { tipo: 'sem-proposta', detalhe: `stop_reason=${String(corpo?.stop_reason ?? '-')}` }
    return { tipo: 'ok', proposta: chamada.input as Record<string, unknown> }
}

// ── O BANCO ─────────────────────────────────────────────────────────────────────────────────
type Levantamento = { id: string; nome: string; nome_normalizado: string; estado: string }
type ItemGravado = ItemDoLevantamento & { id: string }
const COLUNAS_DO_ITEM = `id, ordem, ${CAMPOS_DA_ESQUADRIA.join(', ')}, escolhas`

/** Os levantamentos do remetente — só dele, no tenant dele (decisão 2). */
async function lerLevantamentos(tenantId: string, remetenteId: string, soEmMontagem: boolean): Promise<Levantamento[]> {
    let q = supabaseAdmin.from('orcamentista_levantamento').select('id, nome, nome_normalizado, estado')
        .eq('tenant_id', tenantId).eq('remetente_id', remetenteId)
    if (soEmMontagem) q = q.eq('estado', EM_MONTAGEM)
    const { data, error } = await q.order('criado_em', { ascending: true })
    if (error) throw new Error(`orcamentista_levantamento: ${error.message}`)
    return (data ?? []) as Levantamento[]
}

async function lerItens(tenantId: string, levantamentoId: string): Promise<ItemGravado[]> {
    const { data, error } = await supabaseAdmin.from('orcamentista_levantamento_item').select(COLUNAS_DO_ITEM)
        .eq('tenant_id', tenantId).eq('levantamento_id', levantamentoId).order('ordem', { ascending: true })
    if (error) throw new Error(`orcamentista_levantamento_item: ${error.message}`)
    // a lista de colunas é montada em tempo de execução: o tipo gerado do supabase não a lê
    return ((data ?? []) as unknown as ItemGravado[]).map((i) => ({ ...i, escolhas: i.escolhas ? lerEscolhasGravadas(i.escolhas) : null }))
}

const camposDoItem = (i: ItemDoLevantamento) => ({
    ordem: i.ordem, tipologia: i.tipologia, largura_mm: i.largura_mm, altura_mm: i.altura_mm, quantidade: i.quantidade,
    cor_perfil: i.cor_perfil, vidro: i.vidro, escolhas: i.escolhas,
})

/**
 * Grava o levantamento: cria (sem `existente`) ou sobrescreve (decisão 3) — o estado, o `atualizado_em`
 * (o único rastro), as esquadrias que mudaram e as novas. Nenhuma esquadria é apagada.
 */
async function gravarLevantamento(
    tenantId: string, remetenteId: string, nome: string, existente: { id: string; itens: ItemGravado[] } | null,
    itens: ItemDoLevantamento[], estado: string,
): Promise<string> {
    const agora = new Date().toISOString()
    let id: string
    let antes: ItemGravado[] = []
    if (existente) {
        id = existente.id
        antes = existente.itens
        const { error } = await supabaseAdmin.from('orcamentista_levantamento').update({ estado, atualizado_em: agora })
            .eq('id', id).eq('tenant_id', tenantId).eq('remetente_id', remetenteId)
        if (error) throw new Error(`orcamentista_levantamento: ${error.message}`)
    } else {
        const { data, error } = await supabaseAdmin.from('orcamentista_levantamento')
            .insert({ tenant_id: tenantId, remetente_id: remetenteId, nome, nome_normalizado: normalizarNome(nome), estado })
            .select('id').single()
        if (error || !data) throw new Error(`orcamentista_levantamento: ${error?.message ?? 'sem linha'}`)
        id = (data as { id: string }).id
    }
    const novos: Array<Record<string, unknown>> = []
    for (const item of itens) {
        const anterior = antes.find((a) => a.ordem === item.ordem)
        if (!anterior) { novos.push({ tenant_id: tenantId, levantamento_id: id, ...camposDoItem(item) }); continue }
        if (JSON.stringify(camposDoItem(anterior)) === JSON.stringify(camposDoItem(item))) continue
        const { error } = await supabaseAdmin.from('orcamentista_levantamento_item').update({ ...camposDoItem(item), atualizado_em: agora })
            .eq('id', anterior.id).eq('tenant_id', tenantId)
        if (error) throw new Error(`orcamentista_levantamento_item: ${error.message}`)
    }
    if (novos.length) {
        const { error } = await supabaseAdmin.from('orcamentista_levantamento_item').insert(novos)
        if (error) throw new Error(`orcamentista_levantamento_item: ${error.message}`)
    }
    return id
}

// ── O ENVIO ─────────────────────────────────────────────────────────────────────────────────
/**
 * Texto pelo WUZAPI: `POST /chat/send/text`, header `token`, corpo `{ Phone, Body }` — o mesmo
 * caminho de `sendWuzapiText` em `src/lib/wuzapi-send.ts`, que é a referência. O destino é o
 * número como o WhatsApp o entregou (a parte de usuário do JID), sem variantes: ele já é o do
 * WhatsApp.
 */
async function enviarTexto(token: string, telefone: string, texto: string): Promise<{ ok: boolean; id: string | null; status: number | null }> {
    try {
        const r = await fetch(`${wuzapi()}/chat/send/text`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', token },
            body: JSON.stringify({ Phone: telefone, Body: texto }),
        })
        const corpo = (await r.json().catch((): null => null)) as { data?: { Id?: unknown } } | null
        const id = typeof corpo?.data?.Id === 'string' ? corpo.data.Id : null
        return { ok: r.ok, id, status: r.status }
    } catch {
        return { ok: false, id: null, status: null }
    }
}

/** A pergunta da pendência; o texto da LLM só quando é sobre o MESMO campo que o código decidiu. */
function perguntaPara(p: Pendencia, nItens: number, proposta: Record<string, unknown>): string {
    const fixa = perguntaDaPendencia(p, nItens)
    if (!('campo' in p)) return fixa
    const q = proposta.pergunta && typeof proposta.pergunta === 'object' ? (proposta.pergunta as { campo?: unknown; texto?: unknown }) : {}
    const t = typeof q.texto === 'string' ? q.texto.trim() : ''
    if (q.campo !== p.campo || t === '' || t.length > 500) return fixa
    return nItens > 1 ? `Esquadria ${p.ordem}: ${t}` : t
}

// ── A CONVERSA ──────────────────────────────────────────────────────────────────────────────
export type Interlocutor = { tenantId: string; remetenteId: string; telefone: string; texto: string; wuzapiToken: string }

/** Conduz uma mensagem do vendedor. NUNCA lança: toda falha vira uma linha `[IA]`. */
export async function conduzirMensagem(c: Interlocutor): Promise<DesfechoDaIa> {
    const rastro: Rastro = { levantamento: '-', rota: '-', propostos: 0, descartados: 0, enviou: false }
    const fim = (desfecho: DesfechoDaIa, detalhe = ''): DesfechoDaIa => { anotar(rastro, desfecho, detalhe); return desfecho }
    const responder = async (textoDaResposta: string, desfecho: DesfechoDaIa, detalhe = ''): Promise<DesfechoDaIa> => {
        const envio = await enviarTexto(c.wuzapiToken, c.telefone, textoDaResposta)
        if (!envio.ok) return fim('envio-falhou', `status_envio=${envio.status ?? 'sem resposta'}${detalhe ? ` ${detalhe}` : ''}`)
        rastro.enviou = true
        return fim(desfecho, detalhe)
    }
    try {
        const chave = process.env.ANTHROPIC_API_KEY
        if (!chave) return fim('sem-chave')

        // O TETO DE CONSUMO entraria aqui, ANTES da chamada (dono do produto, 22/10/2026: não agora).

        // Sem a lista de tipologias não há de onde a IA escolher, nem com o que calcular: a conversa
        // diz o que falta, sem chamar a LLM.
        const tabela = await lerTabelaDaEmpresa(c.tenantId)
        if ('frase' in tabela) return await responder(tabela.frase, 'sem-tipologias', `motivo=${tabela.motivo}${tabela.detalhe ? ` ${tabela.detalhe}` : ''}`)
        const definicao: DefinicaoDaTipologia = (t) => tipologiaDaTabela(tabela, t)
        const cores = await lerCoresDaEmpresa(c.tenantId)

        const [emMontagem] = await lerLevantamentos(c.tenantId, c.remetenteId, true)
        const itensDaMontagem = emMontagem ? await lerItens(c.tenantId, emMontagem.id) : []
        const pendenciaAberta = emMontagem ? proximaPendencia(itensDaMontagem, definicao) : null

        const resposta = await chamarLlm(chave, c.texto, {
            candidatos: tabela.candidatos, cores,
            montagem: emMontagem ? { nome: emMontagem.nome, itens: itensDaMontagem.map(camposDoItem) } : null,
            perguntaEmAberto: pendenciaAberta ? perguntaDaPendencia(pendenciaAberta, itensDaMontagem.length) : null,
        })
        if (resposta.tipo !== 'ok') return fim(resposta.tipo, resposta.detalhe)
        const proposta = resposta.proposta

        // ── a rota ──
        let alvo: { id: string; nome: string; itens: ItemGravado[] } | null = null
        let nome: string
        if (emMontagem) {
            rastro.rota = 'MONTAGEM'
            alvo = { id: emMontagem.id, nome: emMontagem.nome, itens: itensDaMontagem }
            nome = emMontagem.nome
        } else {
            const lido = nomeDaMensagem(proposta.nome, c.texto)
            if (lido === null) { rastro.rota = 'SEM_NOME'; return await responder(FRASE_SEM_NOME, 'sem-nome') }
            const comparacao = compararNome(lido, await lerLevantamentos(c.tenantId, c.remetenteId, false))
            const novo = proposta.novo === true
            if ('existente' in comparacao) {
                rastro.levantamento = comparacao.existente.id
                if (novo) { rastro.rota = 'NOME_EXISTE'; return await responder(fraseDoNomeQueJaExiste(comparacao.existente.nome), 'nome-existe') }
                rastro.rota = 'ALTERACAO'
                alvo = { id: comparacao.existente.id, nome: comparacao.existente.nome, itens: await lerItens(c.tenantId, comparacao.existente.id) }
                nome = comparacao.existente.nome
            } else if ('existentes' in comparacao && !novo) {
                rastro.rota = 'PARECIDO'
                return await responder(fraseDoNomeParecido(lido, comparacao.existentes.map((l) => l.nome)), 'nome-parecido')
            } else {
                rastro.rota = 'NOVO'
                nome = lido
            }
        }
        if (alvo) rastro.levantamento = alvo.id

        // ── a proposta, validada ──
        const atuais = alvo ? alvo.itens : [itemVazio(1)]
        const ordemPadrao = rastro.rota === 'MONTAGEM' ? pendenciaAberta?.ordem ?? (atuais.length === 1 ? atuais[0].ordem : null)
            : atuais.length === 1 ? atuais[0].ordem : null
        const aplicada = aplicarProposta(atuais, proposta, { tipologias: tabela.candidatos.map((x) => x.tipologia), cores, ordemPadrao, definicao })
        rastro.propostos = aplicada.propostos
        rastro.descartados = aplicada.descartados
        if (aplicada.semEsquadria && alvo) return await responder(fraseDeQualEsquadria(nome, alvo.itens.length), 'qual-esquadria')

        // ── grava, e SÓ DEPOIS responde: o trajeto inteiro, a partir do que ficou gravado ──
        const pendencia = proximaPendencia(aplicada.itens, definicao)
        rastro.levantamento = await gravarLevantamento(c.tenantId, c.remetenteId, nome, alvo, aplicada.itens, pendencia ? EM_MONTAGEM : COMPLETO)
        if (pendencia) {
            // sem lista de cores na base, perguntar a cor não leva a lugar nenhum: a conversa diz o que falta
            if ('campo' in pendencia && pendencia.campo === 'cor_perfil' && cores.length === 0) return await responder(FRASE_SEM_CORES, 'sem-cores')
            return await responder(perguntaPara(pendencia, aplicada.itens.length, proposta), 'perguntou')
        }
        const levantamento = await mensagemDoLevantamento(c.tenantId, tabela, { nome, itens: aplicada.itens })
        return await responder(levantamento.texto, levantamento.desfecho)
    } catch (e) {
        // Só o nome da tabela e o erro do banco — nunca a chave, o telefone ou o texto.
        return fim('erro', `motivo="${e instanceof Error ? e.message : 'desconhecido'}"`)
    }
}
