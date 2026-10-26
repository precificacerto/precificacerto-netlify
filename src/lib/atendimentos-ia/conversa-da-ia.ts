/**
 * Atendimentos I.A. — a CONVERSA: a IA responde no WhatsApp e monta o LEVANTAMENTO, achado pelo NOME.
 *
 * ══ A ARQUITETURA (dono do produto, 25/10/2026) ══
 * O LEVANTAMENTO é a entidade (`orcamentista_levantamento` e `_item`, migração 20261025000003), de UM
 * remetente, achado pelo nome. A conversa deixa de ser identidade de qualquer coisa: nada é gravado em
 * `orcamentista_conversa`, `orcamentista_mensagem` nem `orcamentista_pre_definicao` (decisão 4). A LLM
 * recebe SÓ a mensagem desta vez; o que ela precisa saber do passado vai no prompt, lido do levantamento.
 *
 * ══ A PERGUNTA EM ABERTO do roteamento pelo nome (dono do produto, 26/10/2026; `pergunta-em-aberto.ts`) ══
 * Fora da montagem, a pergunta que a conversa fez (nome parecido, nome que falta, confirmação do acréscimo)
 * é guardada em `orcamentista_pergunta_em_aberto` — o código da pergunta, o nome e os levantamentos citados
 * e as esquadrias que esperam resposta; NUNCA o texto da mensagem — e apagada quando se resolve. "Não
 * reverte a decisão 4": é estado, como `escolhas`. O texto da pergunta é refeito pelo código e vai ao
 * prompt; um nome que não está no texto vale só se for um dos que ela citou ("é o mesmo"). A esquadria que
 * chegou antes de o vendedor dizer o levantamento vai para o levantamento NOVO que ele nomear, e só entra
 * num que JÁ EXISTE com o "sim" dele ("Confirma antes"). Sem a migração 20261026000002, nada disso: a
 * conversa é a de antes, e a linha [IA] diz `aberta=ausente`.
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
 *
 * ══ O APANHADO (dono do produto, 26/10/2026; `apanhado.ts`) ══
 * Com o levantamento sem pendência, a resposta é o APANHADO — uma linha por esquadria (tipologia, quantidade,
 * largura, altura e vidro) e o pé com a cor, o arremate e a guarnição — SEM preço e sem código de fornecedor.
 * Ele espera o "sim" numa pergunta em aberto (CONFIRMAR_APANHADO, migração 20261026000003); o que vier antes
 * do "sim", mesmo sem nome, é alteração dele e refaz o apanhado. Com o "sim" sai o levantamento FORMAL, o de
 * sempre, com o bloco de preço inteiro. Sem a migração (a CHECK recusa o valor) ou sem a tabela, o formal sai
 * direto, como antes, e a linha [IA] diz `apanhado=sem_migracao`. Sem exceção: o admin que altera o levantamento
 * de outro vendedor também recebe o apanhado; a pergunta acha o levantamento pelo id, e a permissão de admin é
 * conferida de novo no "sim".
 *
 * ══ QUEM ALTERA — decisão 2, REVISTA (dono do produto, 25/10/2026) ══
 * (a) o vendedor que criou e (b) quem é admin NA EMPRESA (`permissao-do-remetente.ts`: `users.role =
 * 'admin'` pela cadeia remetente → employees → users, com falha fechada). O nome continua único por
 * vendedor; a busca pelo nome olha primeiro os DO REMETENTE, e só um pedido de ALTERAÇÃO sem nome dele
 * vai além:
 *   - não é admin → "não encontrei um levantamento seu com esse nome", a MESMA frase exista ou não o
 *     de outro vendedor — a resposta não revela o que é dos outros;
 *   - é admin → o nome IGUAL na empresa: um → altera o do criador, que continua dono; mais de um →
 *     PERGUNTA de qual vendedor, citando os nomes, e nunca escolhe (nem o mais recente); com o vendedor
 *     dito e presente no texto, o dele.
 * O admin não MONTA levantamento de outro: o EM_MONTAGEM é de um remetente, e as perguntas seguintes
 * iriam para o criador. Uma alteração do admin que deixaria pendência não é gravada, e a resposta diz
 * o que falta mandar junto.
 *
 * ══ A REGRA QUE NÃO SE NEGOCIA: a LLM PROPÕE, o código VALIDA e GRAVA ══
 * Saída estruturada: uma ferramenta `strict`; `tool_choice` é `auto` porque o forçado é recusado com
 * 400 pelo `claude-sonnet-5-5` — e sem a chamada, nada é gravado nem enviado. Cada valor passa por
 * `aplicarProposta` (`levantamento-em-montagem.ts`): a tipologia e a cor só das listas, exatas; a
 * LLM não escolhe tenant nem remetente. A PRÓXIMA pergunta é decidida pelo código
 * (`proximaPendencia`), não pela LLM. O levantamento é gravado ANTES do envio: se o envio falhar, o
 * que o vendedor disse não se perde.
 *
 * ══ O ARREMATE: o padrão é ASSUMIDO e confirmado, nunca perguntado (dono do produto, 25/10/2026) ══
 * Com os campos da esquadria preenchidos, a conversa vai DIRETO ao levantamento com o Padrão da aba
 * Variáveis, e a resposta abre com a confirmação ("Considerando guarnição e arremate padrão, certo!") e
 * diz, por extenso, qual arremate foi usado. Só quando o vendedor PEDE outro arremate a conversa mostra
 * as opções daquela variável, por extenso e sem número. Os códigos e os números vão ao PROMPT — sem
 * eles a LLM não tem como registrar a escolha, e foi esse o DEFEITO 1 medido em produção (b0465e57:
 * `propostos=1 descartados=1` nas três respostas, e a mesma pergunta de volta) —, nunca ao vendedor.
 *
 * ══ NADA FALHA EM SILÊNCIO (regras R1 e R2, e o DEFEITO 3) ══
 *   - todo update de levantamento ou de item confere que ATINGIU a linha; o que não atinge é erro;
 *   - uma mensagem que não muda nada no levantamento não toca o banco, e a resposta DIZ que não
 *     registrou — nunca devolve a mesma pergunta como se nada fosse. Vale em TODO caminho que pergunta
 *     (R2, 26/10/2026): a pergunta do nome, a do nome parecido e a da confirmação também;
 *   - remetente autorizado SEMPRE recebe resposta: falta de chave, de saldo, erro da LLM ou do banco
 *     viram uma frase que diz o que falhou. Silêncio só quando o próprio envio falha.
 *
 * ══ O QUE SE PERDEU, por decisão (dono do produto, 25/10/2026) ══
 * Sem a linha da mensagem, o reenvio do WUZAPI não é mais reconhecido: o mesmo `Info.ID` é conduzido
 * de novo. Com o levantamento em montagem a resposta repetida cai na mesma pergunta; depois de
 * COMPLETO, o reenvio de uma alteração a refaz com os mesmos números.
 *
 * ══ NUNCA LANÇA ══
 * Quem chama responde 200 ao WUZAPI aconteça o que acontecer: um erro da LLM não pode virar reenvio em
 * laço. Toda falha vira uma linha `[IA]` e uma frase ao vendedor que diz o que falhou, sem detalhe técnico.
 *
 * ══ O LOG ══
 * Uma linha `[IA]` em `console.error`: o id do levantamento, a rota, propostos, descartados, se
 * enviou, o desfecho, COMO o nome foi lido (`nome=veio|faltou|fora_do_texto|da_pergunta`) e a pergunta
 * em aberto lida (`aberta=<código>|ausente|-`). NUNCA a chave, o telefone, o texto, o nome do
 * levantamento ou a pergunta. Num
 * 4xx da Anthropic a linha leva a `mensagem=` do erro, mascarada antes de cortada.
 *
 * Portão: `src/utils/__tests__/atendimentos-ia-levantamento-por-nome.test.ts`.
 */
import { supabaseAdmin } from '@/supabase/admin'
import { MODELO_PADRAO_DA_IA, URL_DA_API_ANTHROPIC, VERSAO_DA_API_ANTHROPIC } from '@/lib/atendimentos-ia/modelo-da-ia'
import { paraOLog } from '@/utils/atendimentos-ia-mascara-do-log'
import {
    FRASE_SEM_CORES, lerCoresDaEmpresa, lerTabelaDaEmpresa, linhaDoCandidato, lerVariaveisDasTipologias, mensagemDoLevantamento, type CandidatoDeTipologia,
} from '@/lib/atendimentos-ia/levantamento-da-conversa'
import {
    CAMPOS_DA_ESQUADRIA, aplicarProposta, itemVazio, perguntaDaPendencia, proximaPendencia,
    type DefinicaoDaTipologia, type ItemDoLevantamento, type Pendencia,
} from '@/lib/atendimentos-ia/levantamento-em-montagem'
import { compararNome, nomeDaMensagem, normalizarNome } from '@/lib/atendimentos-ia/nome-do-levantamento'
import { escolhasParaOPrompt, lerEscolhasDoItem, lerEscolhasGravadas, temEscolhaDoVendedor } from '@/lib/atendimentos-ia/escolhas-da-tipologia'
import { permissaoDoRemetente, type Permissao } from '@/lib/atendimentos-ia/permissao-do-remetente'
import { fraseDoApanhado } from '@/lib/atendimentos-ia/apanhado'
import {
    apagarPerguntaEmAberto, esquadriasDaProposta, gravarPerguntaEmAberto, lerPerguntaEmAberto,
    type CodigoDaPergunta, type EsquadriaProposta, type PerguntaEmAberto,
} from '@/lib/atendimentos-ia/pergunta-em-aberto'

export const PREFIXO_DO_LOG_DA_IA = '[IA]'
export const NOME_DA_FERRAMENTA = 'registrar_levantamento'
const EM_MONTAGEM = 'EM_MONTAGEM'
const COMPLETO = 'COMPLETO'
const wuzapi = () => (process.env.WUZAPI_BASE_URL || 'https://usapi.adabtech.shop').replace(/\/$/, '')

export type DesfechoDaIa =
    | 'sem-chave' | 'sem-saldo' | 'erro-da-llm' | 'recusa' | 'sem-proposta' | 'sem-tipologias'
    | 'sem-nome' | 'nome-parecido' | 'nome-existe' | 'qual-esquadria' | 'nao-encontrado' | 'qual-vendedor' | 'alteracao-incompleta'
    | 'nao-avancou' | 'confirmar-acrescimo' | 'nao-acrescentou' | 'apanhado' | 'nao-confirmou'
    | 'perguntou' | 'sem-cores' | 'levantou' | 'recusou' | 'envio-falhou' | 'erro'

export type Rota = 'MONTAGEM' | 'NOVO' | 'ALTERACAO' | 'ALTERACAO_ADMIN' | 'SEM_NOME' | 'PARECIDO' | 'NOME_EXISTE' | 'NAO_ENCONTRADO' | 'QUAL_VENDEDOR' | '-'
/**
 * Como o nome foi lido — NUNCA o nome em si (dono do produto, 26/10/2026): `veio` (está no texto),
 * `faltou` (a IA não leu nenhum), `fora_do_texto` (a IA leu um que não está no texto, e ele não vale),
 * `da_pergunta` (não está no texto, mas é um dos que a pergunta em aberto citou).
 */
type MarcaDoNome = '-' | 'veio' | 'faltou' | 'fora_do_texto' | 'da_pergunta'
type Rastro = {
    levantamento: string; rota: Rota; propostos: number; descartados: number; enviou: boolean; admin: Permissao | null
    nome: MarcaDoNome; aberta: CodigoDaPergunta | 'ausente' | '-'
}

function anotar(r: Rastro, desfecho: DesfechoDaIa, detalhe = '') {
    // a permissão só aparece quando foi consultada; o motivo é um código, nunca um nome
    const admin = r.admin === null ? '' : 'motivo' in r.admin ? ` admin=nao motivo_admin=${r.admin.motivo}` : ' admin=sim'
    console.error(`${PREFIXO_DO_LOG_DA_IA} levantamento=${r.levantamento} rota=${r.rota} propostos=${r.propostos} descartados=${r.descartados} enviou=${r.enviou ? 'sim' : 'nao'} desfecho=${desfecho}${admin} nome=${r.nome} aberta=${r.aberta}${detalhe ? ` ${detalhe}` : ''}`)
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
/** Para quem não é admin: a MESMA frase exista ou não o levantamento de outro vendedor. */
export const fraseDeNaoEncontrei = (nome: string) =>
    `Não encontrei um levantamento seu com esse nome: “${nome}”. Confira o nome; para começar um novo, escreva: novo ${nome}.`
export const fraseDeNaoEncontreiNaEmpresa = (nome: string) =>
    `Não encontrei um levantamento com esse nome na empresa: “${nome}”. Confira o nome; para começar um novo, escreva: novo ${nome}.`
export const fraseDeQualVendedor = (nome: string, vendedores: string[]) =>
    `O levantamento “${nome}” existe para mais de um vendedor: ${vendedores.join(', ')}. De qual vendedor é? Escreva o nome do levantamento, o do vendedor e o que muda.`
export const fraseDaAlteracaoIncompleta = (nome: string, vendedor: string, pergunta: string) =>
    `A alteração deixaria o levantamento “${nome}”, de ${vendedor}, incompleto — falta: ${pergunta} Mande a alteração com isso junto. Nada foi gravado.`
/** A confirmação do arremate, no começo da resposta com o levantamento. */
export const FRASE_ARREMATE_PADRAO = 'Considerando guarnição e arremate padrão, certo!'
export const FRASE_ARREMATE_ESCOLHIDO = 'Considerando o arremate que você pediu, e o padrão no que não foi dito, certo!'
/** R2: a mensagem não mudou nada — a resposta diz isso, em vez de repetir a pergunta como se nada fosse. */
export const fraseDeNaoRegistrei = (pergunta: string) =>
    `Não consegui registrar a sua resposta. A pergunta continua: ${pergunta} Responda em palavras, como está escrito acima.`
export const fraseDeNaoApliquei = (nome: string) =>
    `Não consegui aplicar o que você pediu no levantamento “${nome}”: o que entendi não é um valor aceito (por exemplo, uma cor, tipologia ou arremate fora da lista). Nada foi alterado. Diga de novo o que muda.`
const milhar = (n: unknown) => (typeof n === 'number' ? new Intl.NumberFormat('pt-BR').format(n) : '?')
/** Uma esquadria proposta, por extenso, com o que foi dito; o que não foi dito não vira texto inventado. */
export const esquadriaPorExtenso = (e: Record<string, unknown>) => [
    typeof e.tipologia === 'string' ? e.tipologia : 'tipologia não dita',
    e.largura_mm !== undefined || e.altura_mm !== undefined ? `${milhar(e.largura_mm)} x ${milhar(e.altura_mm)} mm` : null,
    typeof e.quantidade === 'number' ? `${e.quantidade} unidade(s)` : null,
    typeof e.cor_perfil === 'string' ? e.cor_perfil : null,
    typeof e.vidro === 'string' ? e.vidro : null,
].filter(Boolean).join(', ')
/**
 * A esquadria que veio ANTES de o vendedor dizer o levantamento não entra num que já existe sem ele
 * confirmar (dono do produto, 26/10/2026: "Confirma antes").
 */
export const fraseDeConfirmarAcrescimo = (nome: string, nExistentes: number, esquadrias: Array<Record<string, unknown>>) =>
    `Vou acrescentar ao levantamento “${nome}”, que tem ${nExistentes} esquadria(s), ${esquadrias.length > 1 ? `estas ${esquadrias.length} esquadrias` : 'esta esquadria'}: `
    + `${esquadrias.map(esquadriaPorExtenso).join('; ')}. Confirma? Responda sim para acrescentar, ou diga o nome de outro levantamento.`
/** O "não" ao apanhado: nada de preço, e a conversa pede o que muda. A pergunta continua em aberto. */
export const fraseDoApanhadoNaoConfirmado = (nome: string) =>
    `Certo, o levantamento “${nome}” não foi confirmado. Diga o que muda — medida, vidro ou quantidade — e eu refaço o apanhado.`
export const fraseDoAcrescimoRecusado = (nome: string) =>
    `Não acrescentei nada ao levantamento “${nome}”. De qual levantamento é a esquadria? Diga o nome dele.`
/** DEFEITO 3: o remetente autorizado sempre recebe resposta, e ela diz o que falhou. */
export const FALHA_SEM_CHAVE = 'Não consegui processar a sua mensagem: o atendimento por IA está sem a chave de acesso configurada. Avise o administrador.'
export const FALHA_SEM_SALDO = 'Não consegui processar a sua mensagem: a conta do serviço de IA está sem saldo de créditos. Avise o administrador.'
export const FALHA_DA_IA = 'Não consegui processar a sua mensagem: o serviço de IA não respondeu. Nada foi gravado; mande de novo em alguns minutos.'
export const FALHA_RECUSA = 'Não consegui processar a sua mensagem: o serviço de IA recusou o conteúdo. Nada foi gravado; reescreva a mensagem.'
export const FALHA_DO_BANCO_ANTES = 'Não consegui processar a sua mensagem: houve um erro ao ler o levantamento. Nada foi gravado; mande de novo.'
export const FALHA_DO_BANCO_AO_GRAVAR = 'Não consegui concluir: houve um erro ao gravar o levantamento, e ele pode não ter sido gravado por inteiro. Mande de novo o nome do levantamento e o que muda.'
export const FALHA_NO_CALCULO = 'O levantamento foi gravado, mas houve um erro ao calcular o preço. Mande o nome do levantamento de novo para eu refazer a conta.'

/** Quando o remetente não tem nome nem o employee dele. */
const VENDEDOR_SEM_NOME = '(vendedor sem nome cadastrado)'

// ── A FERRAMENTA — a saída estruturada ──────────────────────────────────────────────────────
/**
 * O que NÃO foi dito é OMITIDO, não `null`: os campos são opcionais e de tipo simples, sem união.
 * "Schema complexity limits" (https://platform.claude.com/docs/en/build-with-claude/structured-outputs):
 * somando os esquemas `strict` da requisição, no máximo 16 parâmetros com união e 24 opcionais. Este tem
 * 0 uniões e 19 opcionais — o portão (8) conta o esquema enviado.
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
            alteracao: { type: 'boolean', description: 'true quando o vendedor pede para MUDAR um levantamento que já existe (troca, muda, altera, corrige).' },
            vendedor: { ...texto, description: 'O nome do VENDEDOR dono do levantamento, copiado como foi escrito NESTA mensagem. Omita se não foi escrito.' },
            confirma: { type: 'boolean', description: 'Só quando a pergunta em aberto pede confirmação: true se o vendedor confirmou, false se negou. Senão, omita.' },
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
            escolhas: {
                type: 'array',
                description: 'Só o arremate que o vendedor disse NESTA mensagem, em palavras: o CÓDIGO da variável e o NÚMERO da opção que corresponde. Vazio se ele não disse.',
                items: { type: 'object', additionalProperties: false, properties: { variavel: texto, opcao: inteiro } },
            },
            opcoes_de: {
                type: 'array',
                description: 'O CÓDIGO das variáveis cujas opções o vendedor pediu para ver, ou que ele quer trocar sem dizer por qual.',
                items: texto,
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
    /** As escolhas de arremate de cada tipologia com as abas: código e números, só para a LLM. */
    escolhasPorTipologia: Array<{ tipologia: string; linhas: string[] }>
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
        '- alteracao: true quando ele pede para MUDAR um levantamento que já existe ("troca a altura", "muda a cor", "corrige"). Senão, omita.',
        '- vendedor: só quando a mensagem diz de qual VENDEDOR é o levantamento; copie o nome como foi escrito. Senão, omita.',
        '- Pergunta em aberto (quando houver, no fim): a mensagem pode ser a RESPOSTA a ela. Se o vendedor responde com um levantamento que a pergunta cita ("é o mesmo", "é esse"), ponha em `nome` o nome dele escrito como na pergunta. Se a mensagem é só um nome, é o nome do levantamento.',
        '- confirma: só quando a pergunta em aberto pede confirmação — true se ele confirmou ("sim", "pode", "confirmo"), false se negou. Senão, omita.',
        '- itens: só o que foi dito NESTA mensagem. Numa alteração, só os campos que mudam. Não invente, não deduza.',
        '- cor_perfil: EXATAMENTE uma das cores da empresa (lista do fim), escrita como está. Se for outra cor, ou se houver dúvida, NÃO preencha.',
        '- tipologia: o CÓDIGO (ex.: DP-02) de UMA das tipologias da lista do fim, escolhida pela descrição. NUNCA invente código nem preencha com as palavras do vendedor. Se cabe em mais de uma, NÃO preencha: em `pergunta`, pergunte qual é, citando a descrição INTEIRA de cada uma, sem o código.',
        '- ARREMATE e GUARNIÇÃO: NÃO pergunte. O padrão da tipologia já vale sem ninguém dizer. NUNCA escolha sozinho: em `escolhas`, só o arremate que o vendedor DISSE, em palavras, com o código da variável e o número da opção que corresponde (lista do fim). Se ele pedir para ver as opções, ou quiser trocar sem dizer por qual, ponha o código da variável em `opcoes_de`.',
        '- Os códigos das variáveis (ex.: ARI), os números das opções e os códigos de fornecedor (ex.: BZ0010) são INTERNOS: nunca os escreva em `pergunta`.',
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
        '',
        'Escolhas de arremate por tipologia (USO INTERNO — código = descrição: número = opção):',
        ...(c.escolhasPorTipologia.length
            ? c.escolhasPorTipologia.flatMap((e) => [`${e.tipologia}:`, ...e.linhas.map((l) => `  ${l}`)])
            : ['(nenhuma)']),
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

type LevantamentoDaEmpresa = Levantamento & { remetente_id: string }

/** Os levantamentos da empresa com ESTE nome, de qualquer vendedor — só para o admin. */
async function lerLevantamentosDaEmpresaPeloNome(tenantId: string, nomeNormalizado: string): Promise<LevantamentoDaEmpresa[]> {
    const { data, error } = await supabaseAdmin.from('orcamentista_levantamento').select('id, nome, nome_normalizado, estado, remetente_id')
        .eq('tenant_id', tenantId).eq('nome_normalizado', nomeNormalizado).order('criado_em', { ascending: true })
    if (error) throw new Error(`orcamentista_levantamento: ${error.message}`)
    return (data ?? []) as LevantamentoDaEmpresa[]
}

/** Um levantamento da empresa pelo id, de qualquer vendedor: o da pergunta em aberto do apanhado. */
async function lerLevantamentoDaEmpresa(tenantId: string, id: string): Promise<LevantamentoDaEmpresa | null> {
    const { data, error } = await supabaseAdmin.from('orcamentista_levantamento').select('id, nome, nome_normalizado, estado, remetente_id')
        .eq('tenant_id', tenantId).eq('id', id).maybeSingle()
    if (error) throw new Error(`orcamentista_levantamento: ${error.message}`)
    return (data ?? null) as LevantamentoDaEmpresa | null
}

/** O nome de cada vendedor: o do remetente; na falta, o do employee ligado a ele. */
async function nomesDosVendedores(tenantId: string, remetenteIds: string[]): Promise<Map<string, string>> {
    const { data, error } = await supabaseAdmin.from('orcamentista_remetente_autorizado').select('id, nome, employee_id')
        .eq('tenant_id', tenantId).in('id', remetenteIds)
    if (error) throw new Error(`orcamentista_remetente_autorizado: ${error.message}`)
    const remetentes = (data ?? []) as Array<{ id: string; nome: string | null; employee_id: string | null }>
    const semNome = remetentes.filter((r) => !r.nome?.trim() && r.employee_id).map((r) => r.employee_id as string)
    const doEmployee = new Map<string, string>()
    if (semNome.length) {
        const { data: emps, error: e2 } = await supabaseAdmin.from('employees').select('id, name').eq('tenant_id', tenantId).in('id', semNome)
        if (e2) throw new Error(`employees: ${e2.message}`)
        for (const e of (emps ?? []) as Array<{ id: string; name: string | null }>) if (e.name?.trim()) doEmployee.set(e.id, e.name.trim())
    }
    return new Map(remetenteIds.map((id) => {
        const r = remetentes.find((x) => x.id === id)
        return [id, r?.nome?.trim() || (r?.employee_id ? doEmployee.get(r.employee_id) : undefined) || VENDEDOR_SEM_NOME]
    }))
}

async function lerItens(tenantId: string, levantamentoId: string): Promise<ItemGravado[]> {
    const { data, error } = await supabaseAdmin.from('orcamentista_levantamento_item').select(COLUNAS_DO_ITEM)
        .eq('tenant_id', tenantId).eq('levantamento_id', levantamentoId).order('ordem', { ascending: true })
    if (error) throw new Error(`orcamentista_levantamento_item: ${error.message}`)
    // a lista de colunas é montada em tempo de execução: o tipo gerado do supabase não a lê
    // o `null` de uma variável é a marca de que o vendedor pediu as opções: ele é preservado
    return ((data ?? []) as unknown as ItemGravado[]).map((i) => ({ ...i, escolhas: i.escolhas ? lerEscolhasDoItem(i.escolhas) : null }))
}

const camposDoItem = (i: ItemDoLevantamento) => ({
    ordem: i.ordem, tipologia: i.tipologia, largura_mm: i.largura_mm, altura_mm: i.altura_mm, quantidade: i.quantidade,
    cor_perfil: i.cor_perfil, vidro: i.vidro, escolhas: i.escolhas,
})

/**
 * Grava o levantamento: cria (sem `existente`) ou sobrescreve (decisão 3) — o estado, o `atualizado_em`
 * (o único rastro), as esquadrias que mudaram e as novas. Nenhuma esquadria é apagada. `donoId` é o
 * remetente que CRIOU: numa alteração do admin, o levantamento continua do criador.
 */
/** O erro que aconteceu DEPOIS de começar a gravar: a resposta ao vendedor é outra. */
class ErroAoGravar extends Error {}

/** Os campos do item como ficam no banco: a comparação "mudou alguma coisa?" é sobre eles. */
const mesmosItens = (a: readonly ItemDoLevantamento[], b: readonly ItemDoLevantamento[]) =>
    JSON.stringify(a.map(camposDoItem)) === JSON.stringify(b.map(camposDoItem))

async function gravarLevantamento(
    tenantId: string, donoId: string, nome: string, existente: { id: string; itens: ItemGravado[] } | null,
    itens: ItemDoLevantamento[], estado: string,
): Promise<string> {
    const agora = new Date().toISOString()
    let id: string
    let antes: ItemGravado[] = []
    if (existente) {
        id = existente.id
        antes = existente.itens
        const { data, error } = await supabaseAdmin.from('orcamentista_levantamento').update({ estado, atualizado_em: agora })
            .eq('id', id).eq('tenant_id', tenantId).eq('remetente_id', donoId).select('id')
        if (error) throw new ErroAoGravar(`orcamentista_levantamento: ${error.message}`)
        // R1: update que não atinge linha é ERRO — nunca vira "pergunta de novo"
        if ((data ?? []).length !== 1) throw new ErroAoGravar(`orcamentista_levantamento: o update atingiu ${(data ?? []).length} linha(s), e devia atingir 1`)
    } else {
        const { data, error } = await supabaseAdmin.from('orcamentista_levantamento')
            .insert({ tenant_id: tenantId, remetente_id: donoId, nome, nome_normalizado: normalizarNome(nome), estado })
            .select('id').single()
        if (error || !data) throw new ErroAoGravar(`orcamentista_levantamento: ${error?.message ?? 'sem linha'}`)
        id = (data as { id: string }).id
    }
    const novos: Array<Record<string, unknown>> = []
    for (const item of itens) {
        const anterior = antes.find((a) => a.ordem === item.ordem)
        if (!anterior) { novos.push({ tenant_id: tenantId, levantamento_id: id, ...camposDoItem(item) }); continue }
        if (JSON.stringify(camposDoItem(anterior)) === JSON.stringify(camposDoItem(item))) continue
        const { data: tocados, error } = await supabaseAdmin.from('orcamentista_levantamento_item').update({ ...camposDoItem(item), atualizado_em: agora })
            .eq('id', anterior.id).eq('tenant_id', tenantId).eq('levantamento_id', id).select('id')
        if (error) throw new ErroAoGravar(`orcamentista_levantamento_item: ${error.message}`)
        if ((tocados ?? []).length !== 1) throw new ErroAoGravar(`orcamentista_levantamento_item: o update da esquadria ${item.ordem} atingiu ${(tocados ?? []).length} linha(s), e devia atingir 1`)
    }
    if (novos.length) {
        const { error } = await supabaseAdmin.from('orcamentista_levantamento_item').insert(novos)
        if (error) throw new ErroAoGravar(`orcamentista_levantamento_item: ${error.message}`)
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
/** Um código de fornecedor no texto ("BZ0010", "IL50", "SF66"): o que chega ao vendedor não o traz. */
const CODIGO_DE_FORNECEDOR = /\b[A-Z]{1,5}\d{2,}\b/

function perguntaPara(p: Pendencia, nItens: number, proposta: Record<string, unknown>): string {
    const fixa = perguntaDaPendencia(p, nItens)
    if (!('campo' in p)) return fixa
    const q = proposta.pergunta && typeof proposta.pergunta === 'object' ? (proposta.pergunta as { campo?: unknown; texto?: unknown }) : {}
    const t = typeof q.texto === 'string' ? q.texto.trim() : ''
    // o que chega ao vendedor não traz código de fornecedor (26/10/2026): a reformulação que traz vai para a fixa
    if (q.campo !== p.campo || t === '' || t.length > 500 || CODIGO_DE_FORNECEDOR.test(t)) return fixa
    return nItens > 1 ? `Esquadria ${p.ordem}: ${t}` : t
}

// ── A PERGUNTA EM ABERTO DO ROTEAMENTO PELO NOME (`pergunta-em-aberto.ts`) ──────────────────
/** A pergunta guardada, com os levantamentos que ela cita relidos e o texto refeito pelo código. */
type PerguntaRefeita = {
    p: PerguntaEmAberto; citados: Levantamento[]; texto: string
    /** Na CONFIRMAR_APANHADO: o levantamento do apanhado, com o dono — o admin confirma o de outro vendedor. */
    doApanhado?: LevantamentoDaEmpresa
}

/**
 * Refaz o texto da pergunta guardada, a partir das colunas — nunca de um texto guardado. Os citados são
 * os que ainda existem; a pergunta que cita levantamento e não acha nenhum não vale mais (null).
 */
async function refazerPergunta(
    tenantId: string, p: PerguntaEmAberto, doRemetente: Levantamento[], definicao: DefinicaoDaTipologia,
): Promise<PerguntaRefeita | null> {
    const citados = p.levantamentos.map((id) => doRemetente.find((l) => l.id === id)).filter((l): l is Levantamento => !!l)
    if (p.pergunta === 'SEM_NOME') return { p, citados, texto: FRASE_SEM_NOME }
    if (p.pergunta !== 'CONFIRMAR_APANHADO' && citados.length === 0) return null
    if (p.pergunta === 'NOME_PARECIDO') return p.nome ? { p, citados, texto: fraseDoNomeParecido(p.nome, citados.map((l) => l.nome)) } : null
    // o apanhado é refeito do levantamento como está gravado: é ele que espera o "sim". Achado pelo id na
    // EMPRESA, e não entre os do remetente: o admin que alterou o de outro vendedor também confirma (26/10/2026)
    if (p.pergunta === 'CONFIRMAR_APANHADO') {
        const doApanhado = p.levantamentos[0] ? await lerLevantamentoDaEmpresa(tenantId, p.levantamentos[0]) : null
        if (!doApanhado) return null
        return { p, citados: [doApanhado], doApanhado, texto: fraseDoApanhado(doApanhado.nome, await lerItens(tenantId, doApanhado.id), definicao) }
    }
    if (citados.length === 0) return null
    if (p.itens.length === 0) return null
    const nExistentes = (await lerItens(tenantId, citados[0].id)).length
    return { p, citados: [citados[0]], texto: fraseDeConfirmarAcrescimo(citados[0].nome, nExistentes, p.itens) }
}

/** O nome que não está no texto vale SÓ se for um dos que a pergunta em aberto citou ("é o mesmo"). */
function nomeDaPergunta(nome: unknown, aberta: PerguntaRefeita): string | null {
    if (typeof nome !== 'string' || !nome.trim()) return null
    const forma = normalizarNome(nome)
    const citado = aberta.citados.find((l) => l.nome_normalizado === forma)
    if (citado) return citado.nome
    return aberta.p.nome && normalizarNome(aberta.p.nome) === forma ? aberta.p.nome : null
}

function marcaDoNome(nome: unknown, noTexto: string | null, naPergunta: string | null): MarcaDoNome {
    if (typeof nome !== 'string' || !nome.trim()) return 'faltou'
    return noTexto !== null ? 'veio' : naPergunta !== null ? 'da_pergunta' : 'fora_do_texto'
}

// ── A CONVERSA ──────────────────────────────────────────────────────────────────────────────
export type Interlocutor = { tenantId: string; remetenteId: string; telefone: string; texto: string; wuzapiToken: string }

/** Conduz uma mensagem do vendedor. NUNCA lança: toda falha vira uma linha `[IA]`. */
export async function conduzirMensagem(c: Interlocutor): Promise<DesfechoDaIa> {
    const rastro: Rastro = { levantamento: '-', rota: '-', propostos: 0, descartados: 0, enviou: false, admin: null, nome: '-', aberta: '-' }
    const fim = (desfecho: DesfechoDaIa, detalhe = ''): DesfechoDaIa => { anotar(rastro, desfecho, detalhe); return desfecho }
    const responder = async (textoDaResposta: string, desfecho: DesfechoDaIa, detalhe = ''): Promise<DesfechoDaIa> => {
        const envio = await enviarTexto(c.wuzapiToken, c.telefone, textoDaResposta)
        if (!envio.ok) return fim('envio-falhou', `status_envio=${envio.status ?? 'sem resposta'}${detalhe ? ` ${detalhe}` : ''}`)
        rastro.enviou = true
        return fim(desfecho, detalhe)
    }
    // em que ponto a falha aconteceu decide a frase: antes de gravar, ao gravar, ou depois
    let gravando = false
    let gravado = false
    try {
        const chave = process.env.ANTHROPIC_API_KEY
        if (!chave) return await responder(FALHA_SEM_CHAVE, 'sem-chave')

        // O TETO DE CONSUMO entraria aqui, ANTES da chamada (dono do produto, 22/10/2026: não agora).

        // Sem a lista de tipologias não há de onde a IA escolher, nem com o que calcular: a conversa
        // diz o que falta, sem chamar a LLM.
        const tabela = await lerTabelaDaEmpresa(c.tenantId)
        if ('frase' in tabela) return await responder(tabela.frase, 'sem-tipologias', `motivo=${tabela.motivo}${tabela.detalhe ? ` ${tabela.detalhe}` : ''}`)
        // as Variáveis de cada tipologia, do banco: é o que a conversa precisa para perguntar as escolhas
        const variaveisDaTabela = await lerVariaveisDasTipologias(tabela.tabelaId)
        const definicao: DefinicaoDaTipologia = (t) => (t === null ? null : variaveisDaTabela[t] ?? null)
        const cores = await lerCoresDaEmpresa(c.tenantId)

        const [emMontagem] = await lerLevantamentos(c.tenantId, c.remetenteId, true)
        const itensDaMontagem = emMontagem ? await lerItens(c.tenantId, emMontagem.id) : []
        const pendenciaAberta = emMontagem ? proximaPendencia(itensDaMontagem, definicao) : null
        // a pergunta em aberto do roteamento pelo nome: só fora da montagem, que guarda a sua no levantamento
        const lida = emMontagem ? null : await lerPerguntaEmAberto(c.tenantId, c.remetenteId)
        rastro.aberta = lida === 'ausente' ? 'ausente' : lida ? lida.pergunta : '-'
        // sem a tabela (migração pendente), nada se grava nela; com a linha lá, ela é apagada quando se resolve
        const guardaPergunta = lida !== 'ausente'
        const temLinha = lida !== null && lida !== 'ausente'
        const doRemetente = temLinha ? await lerLevantamentos(c.tenantId, c.remetenteId, false) : null
        const aberta = temLinha && doRemetente ? await refazerPergunta(c.tenantId, lida, doRemetente, definicao) : null

        const escolhasPorTipologia = tabela.candidatos.flatMap((x) => {
            const def = definicao(x.tipologia)
            const linhas = def ? escolhasParaOPrompt(def) : []
            return linhas.length ? [{ tipologia: x.tipologia, linhas }] : []
        })
        const resposta = await chamarLlm(chave, c.texto, {
            candidatos: tabela.candidatos, cores, escolhasPorTipologia,
            montagem: emMontagem ? { nome: emMontagem.nome, itens: itensDaMontagem.map(camposDoItem) } : null,
            perguntaEmAberto: pendenciaAberta ? perguntaDaPendencia(pendenciaAberta, itensDaMontagem.length) : aberta?.texto ?? null,
        })
        if (resposta.tipo !== 'ok') {
            // DEFEITO 3: o vendedor sempre fica sabendo — sem detalhe técnico
            const frase = resposta.tipo === 'sem-saldo' ? FALHA_SEM_SALDO : resposta.tipo === 'recusa' ? FALHA_RECUSA : FALHA_DA_IA
            return await responder(frase, resposta.tipo, resposta.detalhe)
        }
        const proposta = resposta.proposta
        const confirma = proposta.confirma === true ? true : proposta.confirma === false ? false : null
        // a proposta que espera resposta entra quando ESTA mensagem não trouxe esquadria
        const daMensagem = esquadriasDaProposta(proposta)
        const daPergunta = daMensagem.length === 0 && aberta !== null && aberta.p.itens.length > 0
        const emEspera: EsquadriaProposta[] = daPergunta && aberta ? aberta.p.itens : daMensagem
        const efetiva = daPergunta ? { ...proposta, itens: emEspera } : proposta
        /**
         * R2 em TODO caminho que pergunta: guarda a pergunta (com o que espera resposta) e, se ela é a MESMA
         * que estava em aberto, a resposta diz que não registrou — nunca a mesma pergunta como se nada fosse.
         */
        const perguntar = async (p: PerguntaEmAberto, textoDaPergunta: string, desfecho: DesfechoDaIa): Promise<DesfechoDaIa> => {
            if (guardaPergunta) await gravarPerguntaEmAberto(c.tenantId, c.remetenteId, p)
            const repetida = aberta !== null && aberta.texto === textoDaPergunta
            return await responder(repetida ? fraseDeNaoRegistrei(textoDaPergunta) : textoDaPergunta, repetida ? 'nao-avancou' : desfecho)
        }

        // ── a rota ──
        let alvo: { id: string; nome: string; estado: string; donoId: string; vendedor: string | null; itens: ItemGravado[] } | null = null
        let nome: string
        if (emMontagem) {
            rastro.rota = 'MONTAGEM'
            alvo = { id: emMontagem.id, nome: emMontagem.nome, estado: emMontagem.estado, donoId: c.remetenteId, vendedor: null, itens: itensDaMontagem }
            nome = emMontagem.nome
        } else {
            const noTexto = nomeDaMensagem(proposta.nome, c.texto)
            const naPergunta = noTexto === null && aberta ? nomeDaPergunta(proposta.nome, aberta) : null
            rastro.nome = marcaDoNome(proposta.nome, noTexto, naPergunta)
            let lido = noTexto ?? naPergunta
            // O APANHADO espera o "sim": a resposta sem nome — ou com o nome dele — é sobre o levantamento que ele
            // citou, achado pelo id, de qualquer vendedor. "sim" ou "não" confirmam; o resto ("a largura é 1500") é
            // alteração DELE, e entra no apanhado. O admin que alterou o de outro também passa por aqui (26/10/2026)
            const doApanhado = aberta?.p.pergunta === 'CONFIRMAR_APANHADO' ? aberta.doApanhado : undefined
            if (doApanhado && (lido === null || normalizarNome(lido) === doApanhado.nome_normalizado)) {
                if (lido === null) rastro.nome = 'da_pergunta'
                rastro.levantamento = doApanhado.id
                const deOutro = doApanhado.remetente_id !== c.remetenteId
                if (deOutro) {
                    // a permissão é conferida de novo: quem deixou de ser admin não alcança o levantamento do outro
                    rastro.admin = await permissaoDoRemetente(c.tenantId, c.remetenteId)
                    if ('motivo' in rastro.admin) { rastro.rota = 'NAO_ENCONTRADO'; return await responder(fraseDeNaoEncontrei(doApanhado.nome), 'nao-encontrado') }
                }
                rastro.rota = deOutro ? 'ALTERACAO_ADMIN' : 'ALTERACAO'
                if (lido === null && confirma === false) return await responder(fraseDoApanhadoNaoConfirmado(doApanhado.nome), 'nao-confirmou')
                const vendedor = deOutro ? (await nomesDosVendedores(c.tenantId, [doApanhado.remetente_id])).get(doApanhado.remetente_id) ?? VENDEDOR_SEM_NOME : null
                alvo = { id: doApanhado.id, nome: doApanhado.nome, estado: doApanhado.estado, donoId: doApanhado.remetente_id, vendedor, itens: await lerItens(c.tenantId, doApanhado.id) }
                nome = doApanhado.nome
            } else {
                // "sim" ou "não" à confirmação do acréscimo, sem nome: é sobre o levantamento que ela citou
                if (lido === null && aberta?.p.pergunta === 'CONFIRMAR_ACRESCIMO' && confirma !== null) {
                    const citado = aberta.citados[0]
                    if (confirma) lido = citado.nome
                    else {
                        rastro.rota = 'SEM_NOME'
                        if (guardaPergunta) await gravarPerguntaEmAberto(c.tenantId, c.remetenteId, { pergunta: 'SEM_NOME', nome: null, levantamentos: [], itens: emEspera })
                        return await responder(fraseDoAcrescimoRecusado(citado.nome), 'nao-acrescentou')
                    }
                }
                if (lido === null) {
                    rastro.rota = 'SEM_NOME'
                    return await perguntar({ pergunta: 'SEM_NOME', nome: null, levantamentos: [], itens: emEspera }, FRASE_SEM_NOME, 'sem-nome')
                }
                const comparacao = compararNome(lido, doRemetente ?? await lerLevantamentos(c.tenantId, c.remetenteId, false))
                const novo = proposta.novo === true
                if ('existente' in comparacao) {
                    rastro.levantamento = comparacao.existente.id
                    if (novo) { rastro.rota = 'NOME_EXISTE'; return await responder(fraseDoNomeQueJaExiste(comparacao.existente.nome), 'nome-existe') }
                    rastro.rota = 'ALTERACAO'
                    alvo = { id: comparacao.existente.id, nome: comparacao.existente.nome, estado: comparacao.existente.estado, donoId: c.remetenteId, vendedor: null, itens: await lerItens(c.tenantId, comparacao.existente.id) }
                    nome = comparacao.existente.nome
                } else if ('existentes' in comparacao && !novo) {
                    rastro.rota = 'PARECIDO'
                    return await perguntar(
                        { pergunta: 'NOME_PARECIDO', nome: lido, levantamentos: comparacao.existentes.map((l) => l.id), itens: emEspera },
                        fraseDoNomeParecido(lido, comparacao.existentes.map((l) => l.nome)), 'nome-parecido',
                    )
                } else if (proposta.alteracao === true && !novo) {
                    // pedido de alteração de um nome que não é do remetente: só o admin vai além
                    rastro.admin = await permissaoDoRemetente(c.tenantId, c.remetenteId)
                    if ('motivo' in rastro.admin) { rastro.rota = 'NAO_ENCONTRADO'; return await responder(fraseDeNaoEncontrei(lido), 'nao-encontrado') }
                    const daEmpresa = await lerLevantamentosDaEmpresaPeloNome(c.tenantId, normalizarNome(lido))
                    if (daEmpresa.length === 0) { rastro.rota = 'NAO_ENCONTRADO'; return await responder(fraseDeNaoEncontreiNaEmpresa(lido), 'nao-encontrado') }
                    const nomes = await nomesDosVendedores(c.tenantId, [...new Set(daEmpresa.map((l) => l.remetente_id))])
                    // o vendedor dito só vale se estiver no texto, e casa pelo nome inteiro, sem caixa e sem acento
                    const vendedorLido = nomeDaMensagem(proposta.vendedor, c.texto)
                    const doVendedor = vendedorLido === null ? daEmpresa
                        : daEmpresa.filter((l) => normalizarNome(nomes.get(l.remetente_id) ?? '') === normalizarNome(vendedorLido))
                    // um vendedor dito que não é dono de nenhum também pergunta: não se cai no único que existe
                    if (doVendedor.length !== 1 && (daEmpresa.length > 1 || vendedorLido !== null)) {
                        rastro.rota = 'QUAL_VENDEDOR'
                        return await responder(fraseDeQualVendedor(lido, daEmpresa.map((l) => nomes.get(l.remetente_id) ?? VENDEDOR_SEM_NOME)), 'qual-vendedor')
                    }
                    const escolhido = doVendedor.length === 1 ? doVendedor[0] : daEmpresa[0]
                    rastro.rota = 'ALTERACAO_ADMIN'
                    alvo = { id: escolhido.id, nome: escolhido.nome, estado: escolhido.estado, donoId: escolhido.remetente_id, vendedor: nomes.get(escolhido.remetente_id) ?? VENDEDOR_SEM_NOME, itens: await lerItens(c.tenantId, escolhido.id) }
                    nome = escolhido.nome
                } else {
                    rastro.rota = 'NOVO'
                    nome = lido
                }
            }
        }
        if (alvo) rastro.levantamento = alvo.id

        // ── a proposta, validada ──
        const atuais = alvo ? alvo.itens : [itemVazio(1)]
        const ordemPadrao = rastro.rota === 'MONTAGEM' ? pendenciaAberta?.ordem ?? (atuais.length === 1 ? atuais[0].ordem : null)
            : atuais.length === 1 ? atuais[0].ordem : null
        const aplicada = aplicarProposta(atuais, efetiva, { tipologias: tabela.candidatos.map((x) => x.tipologia), cores, ordemPadrao, definicao })
        rastro.propostos = aplicada.propostos
        rastro.descartados = aplicada.descartados
        if (aplicada.semEsquadria && alvo) return await responder(fraseDeQualEsquadria(nome, alvo.itens.length), 'qual-esquadria')
        const nadaMudou = alvo !== null && mesmosItens(alvo.itens, aplicada.itens)
        // "Confirma antes" (dono do produto, 26/10/2026): a esquadria que esperava o vendedor dizer o levantamento
        // só entra num que JÁ EXISTE com o "sim" dele à pergunta que citou aquele levantamento
        const confirmado = confirma === true && aberta?.p.pergunta === 'CONFIRMAR_ACRESCIMO' && alvo?.id === aberta.citados[0]?.id
        if (daPergunta && alvo && !nadaMudou && !confirmado) {
            return await perguntar(
                { pergunta: 'CONFIRMAR_ACRESCIMO', nome: null, levantamentos: [alvo.id], itens: emEspera },
                fraseDeConfirmarAcrescimo(alvo.nome, alvo.itens.length, emEspera), 'confirmar-acrescimo',
            )
        }
        // R2: com uma pergunta em aberto, a resposta que não mudou nada é ERRO e aparece — nunca a mesma pergunta de novo
        if (nadaMudou && rastro.rota === 'MONTAGEM' && pendenciaAberta) {
            return await responder(fraseDeNaoRegistrei(perguntaDaPendencia(pendenciaAberta, itensDaMontagem.length)), 'nao-avancou')
        }
        // numa alteração, o que foi proposto e não valeu também aparece; sem proposta nenhuma, a conta é refeita
        if (nadaMudou && aplicada.propostos > 0) return await responder(fraseDeNaoApliquei(nome), 'nao-avancou')

        // ── grava, e SÓ DEPOIS responde: o trajeto inteiro, a partir do que ficou gravado ──
        const pendencia = proximaPendencia(aplicada.itens, definicao)
        // o admin não monta levantamento de outro: com pendência, nada é gravado e a resposta diz o que falta
        if (pendencia && alvo && alvo.donoId !== c.remetenteId) {
            return await responder(fraseDaAlteracaoIncompleta(nome, alvo.vendedor ?? VENDEDOR_SEM_NOME, perguntaDaPendencia(pendencia, aplicada.itens.length)), 'alteracao-incompleta')
        }
        const estado = pendencia ? EM_MONTAGEM : COMPLETO
        // a pergunta em aberto se resolveu: apagada ANTES de gravar — se o apagar falhar, nada foi gravado, e a
        // esquadria que ela guardava não entra depois num levantamento que não é o dela
        if (temLinha) await apagarPerguntaEmAberto(c.tenantId, c.remetenteId)
        // decisão 3: o rastro é atualizado_em — só se grava o que MUDOU
        if (!(nadaMudou && alvo && alvo.estado === estado)) {
            gravando = true
            rastro.levantamento = await gravarLevantamento(c.tenantId, alvo ? alvo.donoId : c.remetenteId, nome, alvo, aplicada.itens, estado)
            gravando = false
        }
        gravado = true
        if (pendencia) {
            // sem lista de cores na base, perguntar a cor não leva a lugar nenhum: a conversa diz o que falta
            if ('campo' in pendencia && pendencia.campo === 'cor_perfil' && cores.length === 0) return await responder(FRASE_SEM_CORES, 'sem-cores')
            return await responder(perguntaPara(pendencia, aplicada.itens.length, proposta), 'perguntou')
        }
        // O APANHADO (dono do produto, 26/10/2026): a primeira resposta é conversa, não orçamento. O levantamento
        // formal, com o preço, só sai com o "sim" do vendedor à pergunta que citou ESTE levantamento. Sem exceção:
        // o admin que altera o de outro vendedor também recebe o apanhado (dono do produto, 26/10/2026).
        const confirmouApanhado = confirma === true && aberta?.p.pergunta === 'CONFIRMAR_APANHADO' && alvo?.id === aberta.citados[0]?.id
        let semApanhado = ''
        if (!confirmouApanhado) {
            const apanhado = fraseDoApanhado(nome, aplicada.itens, definicao)
            const guardada = await gravarPerguntaEmAberto(c.tenantId, c.remetenteId, { pergunta: 'CONFIRMAR_APANHADO', nome: null, levantamentos: [rastro.levantamento], itens: [] })
            if (guardada) {
                // R2: o mesmo apanhado de novo, sem mudar nada, diz que não registrou
                const repetido = aberta !== null && aberta.texto === apanhado
                return await responder(repetido ? fraseDeNaoRegistrei(apanhado) : apanhado, repetido ? 'nao-avancou' : 'apanhado')
            }
            // sem a tabela ou sem o valor na CHECK (migração 20261026000003 pendente): o formal, como antes
            semApanhado = 'apanhado=sem_migracao'
        }
        const levantamento = await mensagemDoLevantamento(c.tenantId, tabela, { nome, itens: aplicada.itens })
        // a confirmação do arremate abre a resposta, quando alguma esquadria tem arremate a considerar
        const temArremate = aplicada.itens.some((i) => definicao(i.tipologia) !== null)
        const escolhido = aplicada.itens.some((i) => temEscolhaDoVendedor(lerEscolhasGravadas(i.escolhas)))
        const confirmacao = temArremate ? `${escolhido ? FRASE_ARREMATE_ESCOLHIDO : FRASE_ARREMATE_PADRAO}\n\n` : ''
        return await responder(`${confirmacao}${levantamento.texto}`, levantamento.desfecho, semApanhado)
    } catch (e) {
        // Só o nome da tabela e o erro do banco — nunca a chave, o telefone ou o texto. E o vendedor sabe.
        const frase = gravando || e instanceof ErroAoGravar ? FALHA_DO_BANCO_AO_GRAVAR : gravado ? FALHA_NO_CALCULO : FALHA_DO_BANCO_ANTES
        return await responder(frase, 'erro', `motivo="${e instanceof Error ? e.message : 'desconhecido'}"`)
    }
}
