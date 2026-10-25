/**
 * Atendimentos I.A. — a CONVERSA: a IA responde no WhatsApp e preenche a pré-definição.
 *
 * ESCOPO: a coleta conversacional e, ao fechar, o LEVANTAMENTO DE BARRAS da esquadria
 * (`levantamento-da-conversa.ts`, desde 25/10/2026). NADA de orçamento no sistema maior.
 *
 * ══ A TIPOLOGIA É ESCOLHIDA DA LISTA (dono do produto, 25/10/2026) ══
 * A IA recebe as tipologias da tabela em uso da empresa (código, descrição e tipo) e propõe UM código
 * dessa lista. Ela não traduz por conta própria e não inventa código: `validarProposta` só aceita um
 * código da lista. Se ficar entre duas, pergunta qual é, com a descrição inteira. Sem a lista — a
 * empresa sem tabela, ou a lista ainda não carregada —, a conversa NÃO chama a LLM enquanto a
 * tipologia estiver vazia: responde a frase nomeada do que falta.
 *
 * ══ A REGRA QUE NÃO SE NEGOCIA: a LLM PROPÕE, a rota VALIDA e GRAVA ══
 *   1. lê o histórico da conversa e o estado da pré-definição (cria a pré-definição na primeira
 *      mensagem — uma por conversa);
 *   2. chama a Anthropic com SAÍDA ESTRUTURADA: uma ferramenta `strict`, com os campos extraídos
 *      DESTA mensagem, as correções explícitas e o texto da próxima pergunta. O `tool_choice`
 *      forçado (`tool`/`any`) é recusado com 400 pelo `claude-sonnet-5-5`; por isso é `auto`, com
 *      a instrução de chamar a ferramenta — e sem a chamada, nada é enviado;
 *   3. VALIDA cada campo (`validarProposta`): o que não valida é DESCARTADO. A LLM não escolhe
 *      tenant nem conversa — quem chama passa os seus —, não apaga, e só sobrescreve por correção;
 *   4. a ROTA decide qual é a próxima pergunta (`proximoCampo`): o texto da LLM só vai ao vendedor
 *      quando é sobre o campo certo; senão vai a pergunta fixa daquele campo. É isso que garante a
 *      ordem e que uma CASA nunca receba a pergunta da distribuição;
 *   5. envia pelo WUZAPI e, SÓ COM O ENVIO CONFIRMADO, grava a resposta como mensagem de saída —
 *      uma saída gravada sem ter saído faria o histórico afirmar uma pergunta que ninguém recebeu;
 *   6. ao COMPLETAR, envia o FECHAMENTO fixo (`mensagemDeFechamento`), com os valores RELIDOS da
 *      pré-definição gravada — nunca da LLM. UMA vez: só na PASSAGEM para COMPLETA. O reenvio do
 *      WUZAPI nem chega aqui (a entrada responde 'repetida'), e uma mensagem nova depois de fechada
 *      encontra o estado já COMPLETA e não fecha de novo. Se o envio do fechamento falhar, o estado
 *      fica COMPLETA e ele não é reenviado depois;
 *   7. com o fechamento ENVIADO, o LEVANTAMENTO: uma segunda mensagem, com as barras e os totais, ou
 *      com a recusa nomeada do que falta. Também UMA vez, na mesma passagem. Erro de banco no
 *      levantamento vai ao log, e nada técnico ao vendedor.
 *
 * LIMITE CONHECIDO (não resolvido): se o envio der certo e a gravação da saída falhar, a mensagem
 * chegou ao vendedor e o histórico não a tem — no turno seguinte a IA pode repetir a pergunta.
 *
 * ══ NUNCA LANÇA ══
 * Quem chama responde 200 ao WUZAPI aconteça o que acontecer aqui: um erro da LLM não pode virar
 * reenvio em laço. Toda falha vira uma linha `[IA]` no log, e nada mais — em especial, NENHUMA
 * mensagem técnica ao vendedor. Sem saldo na Anthropic é caso NOMEADO (`sem-saldo`).
 *
 * ══ O LOG ══
 * Uma linha `[IA]` em `console.error` (o log da Vercel deste projeto só exibe stderr): conversa,
 * campos vazios antes, propostos, descartados, se enviou, e o desfecho. NUNCA a chave, o telefone,
 * o texto da conversa ou a pergunta.
 *
 * A JANELA DO 4xx (dono do produto, 22/10/2026): num 4xx da Anthropic a linha leva também a
 * `mensagem=` do erro — ela nomeia o CAMPO malformado do corpo, e sem ela um 400 é cego. Passa por
 * `paraOLog` com a chave entre os segredos, ANTES de cortar em 300 caracteres (cortar antes deixaria
 * um pedaço da chave que a máscara não reconhece). 5xx e exceção de rede seguem sem a mensagem.
 *
 * Portão: `src/utils/__tests__/atendimentos-ia-conversa-da-ia.test.ts`.
 */
import { supabaseAdmin } from '@/supabase/admin'
import { MODELO_PADRAO_DA_IA, URL_DA_API_ANTHROPIC, VERSAO_DA_API_ANTHROPIC } from '@/lib/atendimentos-ia/modelo-da-ia'
import { paraOLog } from '@/utils/atendimentos-ia-mascara-do-log'
import {
    CAMPOS_DA_PRE_DEFINICAO, COMPLETA, EM_COLETA, PERGUNTA_DO_CAMPO, TIPOS_COM_MAIS_DE_UM_PAVIMENTO, TIPOS_DE_EDIFICACAO,
    mensagemDeFechamento, proximoCampo, quantosVazios, validarProposta,
    type CampoDaPreDefinicao, type EstadoDosCampos,
} from '@/lib/atendimentos-ia/pre-definicao'
import {
    lerTabelaDaEmpresa, linhaDoCandidato, mensagemDoLevantamento, type CandidatoDeTipologia,
} from '@/lib/atendimentos-ia/levantamento-da-conversa'

export const PREFIXO_DO_LOG_DA_IA = '[IA]'
export const NOME_DA_FERRAMENTA = 'registrar_pre_definicao'
/** Quantas mensagens da conversa vão para a LLM — as mais recentes. */
const LIMITE_DO_HISTORICO = 40
const VIOLACAO_DE_UNICIDADE = '23505'
const wuzapi = () => (process.env.WUZAPI_BASE_URL || 'https://usapi.adabtech.shop').replace(/\/$/, '')

export type DesfechoDaIa =
    | 'sem-chave' | 'sem-saldo' | 'erro-da-llm' | 'recusa' | 'sem-proposta'
    | 'fechou' | 'fechamento-falhou' | 'ja-completa' | 'perguntou' | 'envio-falhou' | 'erro'
    | 'sem-tipologias'

type Rastro = { conversa: string; vaziosAntes: number | null; propostos: number; descartados: number; enviou: boolean }

function anotar(r: Rastro, desfecho: DesfechoDaIa, detalhe = '') {
    console.error(`${PREFIXO_DO_LOG_DA_IA} conversa=${r.conversa} vazios_antes=${r.vaziosAntes ?? '-'} propostos=${r.propostos} descartados=${r.descartados} enviou=${r.enviou ? 'sim' : 'nao'} desfecho=${desfecho}${detalhe ? ` ${detalhe}` : ''}`)
}

// ── A FERRAMENTA — a saída estruturada ──────────────────────────────────────────────────────
/**
 * O que NÃO foi dito é OMITIDO, não `null`: cada campo é OPCIONAL e de tipo simples.
 *
 * A razão é um limite da API, não estilo. "Schema complexity limits", em
 * https://platform.claude.com/docs/en/build-with-claude/structured-outputs: somando todos os esquemas
 * `strict` da requisição, no máximo 16 parâmetros com união (`anyOf` ou `type` em lista), 24
 * opcionais e 20 ferramentas strict; acima disso, 400 "Schema is too complex for compilation.". A
 * versão com `anyOf [tipo, null]` em cada campo tinha 20 uniões (9 + 9 + 2). Esta tem 0 uniões e 20
 * opcionais. Acrescentar um campo aqui soma 2 opcionais (`campos` e `correcoes`): o portão (13) conta.
 */
const texto = { type: 'string' }
const inteiro = { type: 'integer' }
const esquemaDosCampos = {
    type: 'object',
    additionalProperties: false,
    properties: {
        tipologia: texto,
        largura_mm: inteiro,
        altura_mm: inteiro,
        quantidade: inteiro,
        cor_perfil: texto,
        vidro: texto,
        local: texto,
        tipo_edificacao: { type: 'string', enum: [...TIPOS_DE_EDIFICACAO] },
        distribuicao_por_pavimento: texto,
    },
}
export const FERRAMENTA = {
    name: NOME_DA_FERRAMENTA,
    description: 'Registra o que o vendedor disse nesta mensagem e a próxima pergunta. Chame SEMPRE, uma vez por resposta.',
    strict: true,
    input_schema: {
        type: 'object',
        additionalProperties: false,
        required: ['campos', 'correcoes', 'pergunta'],
        properties: {
            campos: { ...esquemaDosCampos, description: 'Valores ditos NESTA mensagem para campos que ainda estão vazios. Omita o que não foi dito.' },
            correcoes: { ...esquemaDosCampos, description: 'Só quando o vendedor corrigiu EXPLICITAMENTE um campo já preenchido. Omita o resto.' },
            pergunta: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    campo: { type: 'string', enum: [...CAMPOS_DA_PRE_DEFINICAO] },
                    texto,
                },
            },
        },
    },
}

function sistema(estado: Partial<EstadoDosCampos>, candidatos: readonly CandidatoDeTipologia[]): string {
    return [
        'Você conversa pelo WhatsApp com um VENDEDOR de uma empresa de esquadrias e levanta os dados de um pedido.',
        'O vendedor já sabe o que a empresa vende: você só pergunta e anota.',
        '',
        'Os campos, nesta ordem: tipologia; largura_mm; altura_mm; quantidade; cor_perfil; vidro; local; tipo_edificacao; distribuicao_por_pavimento.',
        `tipo_edificacao é um destes: ${TIPOS_DE_EDIFICACAO.join(', ')}. CASA é UM pavimento. A distribuicao_por_pavimento só existe para ${TIPOS_COM_MAIS_DE_UM_PAVIMENTO.join(', ')}: para CASA, nunca pergunte nem preencha.`,
        'Medidas em milímetros, inteiras: se o vendedor disser em metros ou centímetros, converta.',
        '',
        'Regras:',
        '- Pergunte de forma ABERTA. NUNCA ofereça lista de opções ("Qual o vidro?", não um menu). A única exceção é a da tipologia, abaixo.',
        '- tipologia: o CÓDIGO (ex.: DP-02) de UMA das tipologias da lista do fim, escolhida pela descrição do que o vendedor disse. NUNCA invente código nem preencha com as palavras do vendedor. Se o que ele disse cabe em mais de uma da lista, NÃO preencha: pergunte qual é, citando a descrição INTEIRA de cada uma, sem o código. Se não cabe em nenhuma, pergunte de novo.',
        '- NUNCA pergunte nada sobre os padrões da empresa.',
        '- UMA pergunta por vez: a do próximo campo vazio, na ordem.',
        '- Em `campos`, só o que o vendedor disse NESTA mensagem, para campos vazios. Não invente, não deduza.',
        '- Em `correcoes`, só quando o vendedor corrigiu EXPLICITAMENTE um campo já preenchido.',
        '- Em `pergunta`, o campo e o texto da próxima pergunta, curta e em português. Com tudo preenchido, omita campo e texto.',
        `- Responda SEMPRE chamando a ferramenta ${NOME_DA_FERRAMENTA}, uma vez.`,
        '',
        `Estado atual da pré-definição (null = ainda não dito): ${JSON.stringify(estado)}`,
        '',
        'Tipologias da tabela em uso da empresa (código | descrição | tipo):',
        ...(candidatos.length ? candidatos.map(linhaDoCandidato) : ['(nenhuma)']),
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

async function chamarLlm(chave: string, mensagens: Array<{ role: 'user' | 'assistant'; content: string }>, estado: Partial<EstadoDosCampos>, candidatos: readonly CandidatoDeTipologia[]): Promise<ResultadoDaLlm> {
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
                system: sistema(estado, candidatos),
                tools: [FERRAMENTA],
                tool_choice: { type: 'auto' },
                messages: mensagens,
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
const COLUNAS_DA_PRE_DEFINICAO = `id, estado, ${CAMPOS_DA_PRE_DEFINICAO.join(', ')}`
type PreDefinicao = { id: string; estado: string | null } & Partial<EstadoDosCampos>

async function lerPreDefinicao(tenantId: string, conversaId: string): Promise<PreDefinicao | null> {
    const { data, error } = await supabaseAdmin
        .from('orcamentista_pre_definicao').select(COLUNAS_DA_PRE_DEFINICAO)
        .eq('tenant_id', tenantId).eq('conversa_id', conversaId)
        .order('criado_em', { ascending: true }).limit(1).maybeSingle()
    if (error) throw new Error(`orcamentista_pre_definicao: ${error.message}`)
    // a lista de colunas é montada em tempo de execução: o tipo gerado do supabase não a lê
    return (data as unknown as PreDefinicao | null) ?? null
}

/**
 * Uma pré-definição por conversa: lê antes de inserir. A corrida entre duas mensagens simultâneas
 * é fechada pela UNIQUE (conversa_id) da migração `20261022000002` — o 23505 vira uma releitura.
 */
async function lerOuCriarPreDefinicao(tenantId: string, conversaId: string): Promise<PreDefinicao> {
    const existente = await lerPreDefinicao(tenantId, conversaId)
    if (existente) return existente
    const { data, error } = await supabaseAdmin
        .from('orcamentista_pre_definicao').insert({ tenant_id: tenantId, conversa_id: conversaId, estado: EM_COLETA })
        .select(COLUNAS_DA_PRE_DEFINICAO).single()
    if (error && error.code === VIOLACAO_DE_UNICIDADE) {
        const outra = await lerPreDefinicao(tenantId, conversaId)
        if (outra) return outra
    }
    if (error || !data) throw new Error(`orcamentista_pre_definicao: ${error?.message ?? 'sem linha'}`)
    return data as unknown as PreDefinicao
}

async function lerHistorico(tenantId: string, conversaId: string): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
    const { data, error } = await supabaseAdmin
        .from('orcamentista_mensagem').select('direcao, texto, criado_em')
        .eq('tenant_id', tenantId).eq('conversa_id', conversaId)
        .order('criado_em', { ascending: false }).limit(LIMITE_DO_HISTORICO)
    if (error) throw new Error(`orcamentista_mensagem: ${error.message}`)
    const linhas = [...((data ?? []) as Array<{ direcao: string; texto: string | null }>)].reverse()
    const mensagens: Array<{ role: 'user' | 'assistant'; content: string }> = []
    for (const l of linhas) {
        if (!l.texto) continue
        const role = l.direcao === 'saida' ? 'assistant' : 'user'
        const ultima = mensagens[mensagens.length - 1]
        if (ultima && ultima.role === role) ultima.content += `\n${l.texto}`
        else mensagens.push({ role, content: l.texto })
    }
    while (mensagens.length && mensagens[0].role !== 'user') mensagens.shift()
    return mensagens
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

/** O texto da LLM só quando é sobre o campo que a ROTA decidiu; senão, a pergunta fixa dele. */
function perguntaPara(campo: CampoDaPreDefinicao, proposta: Record<string, unknown>): string {
    const p = proposta.pergunta && typeof proposta.pergunta === 'object' ? (proposta.pergunta as { campo?: unknown; texto?: unknown }) : {}
    const texto = typeof p.texto === 'string' ? p.texto.trim() : ''
    return p.campo === campo && texto !== '' && texto.length <= 500 ? texto : PERGUNTA_DO_CAMPO[campo]
}

// ── A CONVERSA ──────────────────────────────────────────────────────────────────────────────
export type Interlocutor = { tenantId: string; conversaId: string; telefone: string; wuzapiToken: string }

/** Grava a mensagem de SAÍDA — chamada só depois do envio confirmado. */
async function gravarSaida(c: Interlocutor, texto: string, wuzapiMensagemId: string | null) {
    const { error } = await supabaseAdmin.from('orcamentista_mensagem').insert({
        tenant_id: c.tenantId, conversa_id: c.conversaId, direcao: 'saida', texto, wuzapi_mensagem_id: wuzapiMensagemId,
    })
    if (error) throw new Error(`orcamentista_mensagem: ${error.message}`)
}

/**
 * O levantamento, depois do fechamento enviado: a mensagem das barras ou a da recusa. Devolve o
 * desfecho para a linha `[IA]`; erro de banco vira `erro`, sem mensagem ao vendedor.
 */
async function enviarLevantamento(c: Interlocutor, tabela: Awaited<ReturnType<typeof lerTabelaDaEmpresa>>, gravada: PreDefinicao): Promise<string> {
    let levantamento: Awaited<ReturnType<typeof mensagemDoLevantamento>>
    try {
        levantamento = await mensagemDoLevantamento(c.tenantId, tabela, {
            tipologia: gravada.tipologia, largura_mm: gravada.largura_mm, altura_mm: gravada.altura_mm, quantidade: gravada.quantidade, vidro: gravada.vidro,
        })
    } catch (e) {
        return `erro motivo_levantamento="${e instanceof Error ? e.message : 'desconhecido'}"`
    }
    const envio = await enviarTexto(c.wuzapiToken, c.telefone, levantamento.texto)
    if (!envio.ok) return `envio-falhou status_envio_levantamento=${envio.status ?? 'sem resposta'}`
    await gravarSaida(c, levantamento.texto, envio.id)
    return levantamento.desfecho
}

/** Conduz um turno da conversa. NUNCA lança: toda falha vira uma linha `[IA]`. */
export async function conduzirConversa(c: Interlocutor): Promise<DesfechoDaIa> {
    const rastro: Rastro = { conversa: c.conversaId, vaziosAntes: null, propostos: 0, descartados: 0, enviou: false }
    const fim = (desfecho: DesfechoDaIa, detalhe = ''): DesfechoDaIa => { anotar(rastro, desfecho, detalhe); return desfecho }
    try {
        const chave = process.env.ANTHROPIC_API_KEY
        if (!chave) return fim('sem-chave')

        // O TETO DE CONSUMO entraria aqui, ANTES da chamada: ler `orcamentista_config.
        // teto_de_consumo_brl` e `acao_ao_atingir_teto` (BLOQUEAR | AVISAR) e o consumo do período.
        // NÃO implementado nesta etapa (dono do produto, 22/10/2026).

        const pre = await lerOuCriarPreDefinicao(c.tenantId, c.conversaId)
        // o estado de ANTES deste turno, guardado já: é ele que diz se este turno FECHA
        const estadoAntes = pre.estado
        const estadoAtual = Object.fromEntries(CAMPOS_DA_PRE_DEFINICAO.map((k) => [k, pre[k] ?? null])) as EstadoDosCampos
        rastro.vaziosAntes = quantosVazios(estadoAtual)

        // A lista de tipologias da tabela em uso. Sem ela, e com a tipologia ainda vazia, não há de
        // onde a IA escolher: a conversa diz o que falta, sem chamar a LLM.
        const tabela = await lerTabelaDaEmpresa(c.tenantId)
        const candidatos = 'candidatos' in tabela ? tabela.candidatos : []
        if ('frase' in tabela && estadoAtual.tipologia === null) {
            const envio = await enviarTexto(c.wuzapiToken, c.telefone, tabela.frase)
            if (!envio.ok) return fim('envio-falhou', `motivo=${tabela.motivo} status_envio=${envio.status ?? 'sem resposta'}`)
            rastro.enviou = true
            await gravarSaida(c, tabela.frase, envio.id)
            return fim('sem-tipologias', `motivo=${tabela.motivo}${tabela.detalhe ? ` ${tabela.detalhe}` : ''}`)
        }

        const historico = await lerHistorico(c.tenantId, c.conversaId)
        const resposta = await chamarLlm(chave, historico, estadoAtual, candidatos)
        if (resposta.tipo !== 'ok') return fim(resposta.tipo, resposta.detalhe)

        const validacao = validarProposta(estadoAtual, resposta.proposta, candidatos.map((x) => x.tipologia))
        rastro.propostos = validacao.propostos
        rastro.descartados = validacao.descartados
        const novoEstado = { ...estadoAtual, ...validacao.gravar }
        const proximo = proximoCampo(novoEstado)
        const estadoTexto = proximo === null ? COMPLETA : EM_COLETA

        if (Object.keys(validacao.gravar).length > 0 || estadoAntes !== estadoTexto) {
            const { error } = await supabaseAdmin
                .from('orcamentista_pre_definicao')
                .update({ ...validacao.gravar, estado: estadoTexto, atualizado_em: new Date().toISOString() })
                .eq('id', pre.id).eq('tenant_id', c.tenantId)
            if (error) throw new Error(`orcamentista_pre_definicao: ${error.message}`)
        }

        if (proximo === null) {
            // Já estava fechada antes deste turno: não fecha de novo.
            if (estadoAntes === COMPLETA) return fim('ja-completa')
            // Os valores do fechamento são os GRAVADOS, relidos — não os da proposta.
            const gravada = await lerPreDefinicao(c.tenantId, c.conversaId)
            const fechamento = gravada ? mensagemDeFechamento(gravada) : null
            if (fechamento === null) throw new Error('orcamentista_pre_definicao: fechamento sem os campos gravados')
            const envioDoFechamento = await enviarTexto(c.wuzapiToken, c.telefone, fechamento)
            if (!envioDoFechamento.ok) return fim('fechamento-falhou', `status_envio=${envioDoFechamento.status ?? 'sem resposta'}`)
            rastro.enviou = true
            await gravarSaida(c, fechamento, envioDoFechamento.id)
            return fim('fechou', `levantamento=${await enviarLevantamento(c, tabela, gravada)}`)
        }

        const texto = perguntaPara(proximo, resposta.proposta)
        const envio = await enviarTexto(c.wuzapiToken, c.telefone, texto)
        if (!envio.ok) return fim('envio-falhou', `status_envio=${envio.status ?? 'sem resposta'}`)
        rastro.enviou = true
        await gravarSaida(c, texto, envio.id)
        return fim('perguntou')
    } catch (e) {
        // Só o nome da tabela e o erro do banco — nunca a chave, o telefone ou o texto.
        return fim('erro', `motivo="${e instanceof Error ? e.message : 'desconhecido'}"`)
    }
}
