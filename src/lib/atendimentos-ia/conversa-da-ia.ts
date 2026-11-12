/**
 * Atendimentos I.A. — a CONVERSA: a IA responde no WhatsApp e monta o LEVANTAMENTO, achado pelo NOME.
 *
 * ══ A ARQUITETURA (dono do produto, 25/10/2026) ══
 * O LEVANTAMENTO é a entidade (`orcamentista_levantamento` e `_item`, migração 20261025000003), de UM
 * remetente, achado pelo nome. A conversa não é identidade de nada: o ESTADO mora no levantamento e na pergunta em aberto, e
 * nada se grava em `orcamentista_pre_definicao`. A decisão 4 (nada em `orcamentista_conversa` nem em `orcamentista_mensagem`)
 * foi REVOGADA em 03/11/2026: a conversa é GRAVADA, dentro do tenant, como HISTÓRICO para o modelo e para a IDEMPOTÊNCIA do
 * reenvio — ver "A CONVERSA GRAVADA" abaixo.
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
 *   - o remetente tem um levantamento EM_MONTAGEM, tocado há menos de 24 h (havendo vários, o mais recentemente tocado — a migração
 *     20261105000001 derrubou o "um por remetente") → a mensagem continua nele, com a pergunta em aberto
 *     no prompt. É isso que faz o "4" de uma pergunta de arremate cair no lugar. SALVO (05/11/2026) quando a mensagem traz um
 *     cliente/nome DIFERENTE do levantamento em montagem, ou pede "novo": aí ela sai da montagem e segue o roteamento pelo nome;
 *     a montagem com mais de 24 h sem toque não captura mais a mensagem (`montagemExpirou`);
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
 * ══ VÁRIAS TABELAS (dono do produto, 26/10/2026; migração 20261026000004) ══
 * PR D (dono do produto, 02/11/2026): a lista de tipologias é a dos MOTORES das famílias da conta (a base de conhecimento → a
 * etapa com GERAR_LEVANTAMENTO → o motor, `motor-da-familia.ts`); com mais de uma família, cada linha do prompt diz a família (e o fornecedor do motor).
 * A esquadria guarda de qual família é e o motor que a calcula (`familia` e `motor_id` em `orcamentista_levantamento_item`): o
 * código no motor de uma família só, aquela; em mais de uma, a conversa PERGUNTA de qual família (`proximaPendencia`) — nunca
 * escolhe, nunca "a primeira". A resposta vem em `itens[].familia` e/ou `itens[].fornecedor`, e cada um vale só se o vendedor o
 * disse (`ditoNaMensagem`) e se, juntos, apontam UMA das famílias daquela tipologia. As abas (e as escolhas de arremate) são as do
 * motor da família da esquadria. (Até o PR D, a fonte era a tabela de fornecedor, em `tabela_id`.) Um levantamento com várias famílias é
 * calculado uma vez por família (`mensagemDoLevantamento`).
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
 * Saída estruturada: uma ferramenta (SEM `strict` desde 05/11/2026 — ver a ferramenta); `tool_choice` é `auto` porque o forçado é recusado com
 * 400 pelo `claude-sonnet-5-5` — e sem a chamada, nada é gravado nem enviado. Cada valor passa por
 * `aplicarProposta` (`levantamento-em-montagem.ts`): a tipologia e a cor só das listas, exatas; a
 * LLM não escolhe tenant nem remetente. A PRÓXIMA pergunta é decidida pelo código
 * (`proximaPendencia`), não pela LLM. O levantamento é gravado ANTES do envio: se o envio falhar, o
 * que o vendedor disse não se perde.
 *
 * ══ O ARREMATE: o padrão é ASSUMIDO e confirmado, nunca perguntado (dono do produto, 25/10/2026) ══
 * Com os campos da esquadria preenchidos, a conversa vai DIRETO ao levantamento com o Padrão da aba
 * Variáveis, e o arquivo diz, nas pré-definições consideradas, qual arremate foi usado — a confirmação que abria a resposta
 * ("Considerando guarnição e arremate padrão, certo!") saiu em 08/11/2026: era repetição do rodapé da folha. Só quando o vendedor PEDE outro arremate a conversa mostra
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
 * ══ A CONVERSA GRAVADA E A CONVERSA SEM FORMULÁRIO (dono do produto, 03/11/2026; `conversa-gravada.ts`, `redacao-da-resposta.ts`) ══
 * A rota grava a entrada (com o `Info.ID`) e a conversa grava a saída depois de enviada, com `responde_a` e o id do envio. O
 * modelo recebe as ÚLTIMAS MENSAGENS da conversa (20, 24 horas, 6.000 caracteres; o formal com preço vira "[levantamento formal
 * enviado]"; saída acima de 600 caracteres entra cortada): "nunca mandar dinheiro ao modelo" é inviolável. O reenvio do WUZAPI
 * de uma entrada já respondida é 200 sem conduzir nem reenviar; só se reenvia a saída cujo primeiro envio falhou de fato; sem
 * saída e com a entrada mais velha que a janela da rota, a mensagem é conduzida de novo. UMA pergunta por turno cobre TODAS as
 * pendências (`pendenciasDoLevantamento`, `perguntaDasPendencias`). As frases fixas de pergunta e confirmação são REDIGIDAS pelo
 * modelo (`falar`): o rascunho é a frase de sempre, o código valida números, nomes, caixa alta, dinheiro e código de fornecedor,
 * e manda o rascunho quando a redação não passa; a mesma resposta nunca sai duas vezes seguidas. Ficam fixas as falhas, as faltas
 * de configuração, o apanhado e o levantamento formal. A personalidade está no prompt base.
 *
 * ══ O CONTEXTO DO ATENDIMENTO (dono do produto, 26/10/2026; `contexto-do-atendimento.ts`) ══
 * "O PROMPT MANDA EM QUANDO E EM QUE FORMA. O CÓDIGO MANDA EM DE ONDE VEM O NÚMERO." Com contexto gravado, ele
 * vai num bloco no FIM do sistema. A ferramenta tem a `fala`: uma frase da IA que ABRE a resposta do
 * código — até 600 caracteres, sem número em forma nenhuma; filtro disparado, a fala cai e a resposta é a do
 * código, sozinha. O texto que a IA reformula numa pergunta também cai se trouxer DINHEIRO. Nenhum número da
 * resposta sai da IA, e o caminho — apanhado, "sim", levantamento — continua decidido pelo código.
 *
 * ══ O PROMPT BASE DO PRODUTO (dono do produto, 03/11/2026; `atendimentos-ia-prompt-base.ts`) ══
 * A regra do PRODUTO mora no código e abre o sistema de TODA empresa: as duas etapas, nunca valor nem percentual,
 * a tipologia é trabalho do agente, o nome é o do cliente, de correr sem folhas ditas é 2 folhas em 2 trilhos, nunca
 * assumir medida, ler a mensagem inteira. O contexto da empresa vem DEPOIS, e em conflito "o base vence nas regras de
 * 'nunca' e a empresa vence no resto". Desde então a `fala` e o filtro de dinheiro da pergunta reformulada valem para
 * toda empresa — com ou sem contexto. E o código cumpre o que o base diz: a tipologia se pergunta em linguagem de obra
 * (`PERGUNTAS_DA_TIPOLOGIA`), o nome sai do cliente (`nomeDoCliente`), e a resposta que não coube na tipologia ou no nome
 * vira a pergunta em OUTRAS palavras (`outraPergunta`) — nunca o "Não consegui registrar" com a mesma frase.
 *
 * ══ AS ETAPAS DECLARADAS DA FAMÍLIA (dono do produto, 04/11/2026; `motor-da-familia.ts`) ══
 * A conversa executa o que a família DECLARA: a AÇÃO de cada etapa decide o papel (GERAR_LEVANTAMENTO = este apanhado e a gravação, com o motor dela
 * dando as tipologias e as Variáveis; CALCULAR_BARRAS = o cálculo de `mensagemDoLevantamento`, com o motor dela), e o número é só a ORDEM. Falta de
 * etapa, etapa sem motor, ação sem executor (APANHAR, CONFIRMAR, ENVIAR ainda não têm código), ação repetida ou cálculo antes do levantamento é ERRO
 * NOMEADO (`conferirEtapasParaExecutar`) que a conversa responde antes de chamar o modelo — nunca silêncio, nunca o fluxo antigo. A família só com a
 * etapa de levantamento grava e devolve as esquadrias sem cálculo. A INSTRUÇÃO da etapa corrente (a de GERAR_LEVANTAMENTO, a única que fala com o
 * modelo) entra no sistema, identificada pela etapa, SÓ quando preenchida (`instrucao_etapa=N` no log); a escrita em etapa que não usa o modelo não
 * tem efeito, e o log diz (`instrucao_sem_efeito=`).
 *
 * ══ A INSTRUÇÃO DE CADA CATEGORIA (dono do produto, 03/11/2026; `instrucoes-da-categoria.ts`) ══
 * O texto livre que o consultor escreve em cada categoria da base de conhecimento vai ao sistema, depois das listas e antes do contexto da
 * empresa, identificado pela categoria — SÓ as categorias com instrução preenchida. A linha [IA] diz quantas (`instrucoes=N`), ou
 * `instrucoes=sem_migracao` antes da coluna existir.
 *
 * ══ PORTA NÃO É JANELA, QUANTIDADE PADRÃO 1, OS LIMITES E O AGRUPAMENTO (dono do produto, 03/11/2026; `tipologias-candidatas.ts`) ══
 * A lista de tipologias vai ao modelo com a descrição e os LIMITES, e já filtrada pela palavra da mensagem (porta × janela) quando ela traz uma
 * só; a IA classifica a palavra de cada item em `abertura`; o CÓDIGO descarta a tipologia que contradiz a palavra ou que não cabe a medida
 * (`aplicarProposta`, que devolve as `recusas`), e a resposta nomeia a medida e a faixa das que sobraram — nunca "a mais próxima". Quantidade
 * não dita é 1, sem perguntar. Itens completos e iguais (tipologia, medidas, escolhas, cor, vidro) viram um, com as unidades somadas
 * (`agruparIguais`); a linha gravada que se fundiu sai por DELETE conferido.
 *
 * ══ O RESGATE DO LEVANTAMENTO ANTIGO E O CONTEXTO QUE NÃO SE PERDE (dono do produto, 03/11/2026) ══
 * O caso real (De Paula, 03/11, 16:30 a 16:34 UTC): "Cliente: Geronimo Silva" caiu em NOME PARECIDO porque o nome do cliente ganhava o prefixo
 * "Levantamento" e o levantamento existente não o tinha; "Geison Silva novo" não virou nome (a IA só mandou `novo`), e as esquadrias da mensagem
 * ficaram retidas numa pergunta que a resposta não citava. As decisões:
 *   1. o prefixo "Levantamento" SAI: o nome é o do cliente, puro; a comparação ignora o prefixo nos dois lados (`formaComparavel`);
 *   2. as esquadrias retidas NUNCA se perdem: `emEspera` ACUMULA as da pergunta em aberto e as da mensagem nova (`juntarEsquadrias`; a reenviada
 *      idêntica conta uma vez);
 *   3. o nome vem em resposta LIVRE ("Geison Silva novo", "é o Geison Silva"): a IA extrai, e o código confere que as PALAVRAS estão no texto;
 *   4. o RESGATE é conversa: até 3 levantamentos parecidos, numerados, do mais recente ao mais antigo, com data e estado; o vendedor responde do
 *      jeito dele ("o primeiro", "é o do Geronimo", "o de ontem" → `opcao`), o código CONFIRMA numa frase curta ("Então é o Geronimo Silva, de
 *      01/11, certo?") e segue com o "sim"; "não" devolve a lista; "novo <nome>" cria. Nunca se exige o nome exato nem uma forma ditada.
 *   A confirmação do resgate é gravada como CONFIRMAR_ACRESCIMO COM `nome` (a CHECK de `pergunta` em produção não aceita outro código, e
 *   nenhuma migração foi pedida); o escolhido vai primeiro em `levantamentos`, os outros depois. A pergunta repetida, no roteamento pelo nome,
 *   volta em OUTRA forma — nunca "Não consegui registrar a sua resposta".
 *
 * ══ NUNCA LANÇA ══
 * Quem chama responde 200 ao WUZAPI aconteça o que acontecer: um erro da LLM não pode virar reenvio em
 * laço. Toda falha vira uma linha `[IA]` e uma frase ao vendedor que diz o que falhou, sem detalhe técnico.
 *
 * ══ O LOG ══
 * Uma linha `[IA]` em `console.error`: o id do levantamento, a rota, propostos, descartados, se
 * enviou, o desfecho, COMO o nome foi lido (`nome=veio|faltou|fora_do_texto|da_pergunta`), a pergunta
 * em aberto lida (`aberta=<código>|ausente|expirada|-`; `expirada` é a linha com mais de 24 h, ignorada), o contexto (`contexto=sim|vazio|sem_migracao`) e, com ele, o que
 * aconteceu com a fala (`fala=usada|ausente|descartada_numero|descartada_longa`) e, quando houve chamada à IA, o tempo dela e os tokens de
 * entrada e saída que a API devolve (`ia_ms=`, `ia_entrada=`, `ia_saida=`; "-" quando a API não os deu). NUNCA a chave, o telefone, o texto, o nome do
 * levantamento ou a pergunta. Num
 * 4xx da Anthropic a linha leva a `mensagem=` do erro, mascarada antes de cortada.
 *
 * Portão: `src/utils/__tests__/atendimentos-ia-levantamento-por-nome.test.ts`.
 */
import { atravessarNoSim } from './travessia-do-levantamento'
import { dependenciasDoServidor, destinosDoWhatsApp, enviarAoPrimeiroQueAceitar, etapaDoPreco } from './cadeia-do-sim'
import { supabaseAdmin } from '@/supabase/admin'
import { MODELO_PADRAO_DA_IA, URL_DA_API_ANTHROPIC, VERSAO_DA_API_ANTHROPIC } from '@/lib/atendimentos-ia/modelo-da-ia'
import { paraOLog } from '@/utils/atendimentos-ia-mascara-do-log'
import {
    FRASE_SEM_CORES, familiasDoCodigo, lerPerfilDaEmpresa, lerFamiliasDaEmpresa, linhaDoCandidato, lerVariaveisDasTipologias, mensagemDoLevantamento,
    type CandidatoDeTipologia, type FamiliasDaEmpresaLidas,
} from '@/lib/atendimentos-ia/levantamento-da-conversa'
import type { FolhaGerada, FolhaRecusada } from '@/lib/atendimentos-ia/folha-do-levantamento'
import { agruparIguais,
    CAMPOS_DA_ESQUADRIA, aplicarProposta, familiaDaEsquadria, itemVazio, pendenciasDoLevantamento, perguntaDasPendencias, resolverFamilias,
    type DefinicaoDaTipologia, type ItemDoLevantamento, type Pendencia,
} from '@/lib/atendimentos-ia/levantamento-em-montagem'
import { JANELA_EM_VOO_MS, gravarSaida, lerHistorico, marcarEnvio, saidaDaEntrada, type Entrada, type MensagemDoHistorico } from '@/lib/atendimentos-ia/conversa-gravada'
import { prazo } from '@/lib/atendimentos-ia/prazo'
import { MAX_TOKENS_DA_PRIMEIRA_CHAMADA, PRAZO_ATE_OS_CABECALHOS_MS, TENTATIVAS_DA_PRIMEIRA_CHAMADA, blocosDoSistema } from '@/lib/atendimentos-ia/pedido-ao-modelo'
import { lerFluxo } from '@/lib/atendimentos-ia/resposta-em-fluxo'
import { CODIGO_DE_FORNECEDOR, redigir, type MotivoDaRedacao, type Redacao } from '@/lib/atendimentos-ia/redacao-da-resposta'
import { vidroPodado } from '@/lib/atendimentos-ia/vidro'
import type { VariaveisDaTipologia } from '@/lib/atendimentos-ia/escolhas-da-tipologia'
import { compararNome, formaComparavel, nomeDaMensagem, nomeDoCliente, nomeSemPrefixo, normalizarNome } from '@/lib/atendimentos-ia/nome-do-levantamento'
import { fraseDaCorForaDaLista, perguntasDaTipologia, type JaDito } from '@/lib/atendimentos-ia/pre-definicao'
import { atributosNoLog, fraseDoPadraoQueFalta, origemDaTipologiaProposta, padraoDaEsquadria, type AtributoAssumido } from '@/lib/atendimentos-ia/tipologia-padrao'
import { PROMPT_BASE } from '@/utils/atendimentos-ia-prompt-base'
import { LIMITE_DA_FALA } from '@/utils/atendimentos-ia-contexto'
import { blocoDasInstrucoes, lerInstrucoesDaEmpresa, type InstrucaoDaCategoria } from '@/lib/atendimentos-ia/instrucoes-da-categoria'
import { blocoDasInstrucoesDasEtapas, type InstrucaoDaEtapa } from '@/lib/atendimentos-ia/motor-da-familia'
import { aberturaDita, filtrarPeloAcumulado, filtrarPorAbertura, fraseDaAberturaRecusada, fraseDeNenhumaTipologiaCabe, palavrasDeAbertura } from '@/lib/atendimentos-ia/tipologias-candidatas'
import { escolhasParaOPrompt, opcoesDeArremateNoPrompt, lerEscolhasDoItem, variaveisSemPadraoNoPrompt, variaveisSemPadraoParaOPrompt } from '@/lib/atendimentos-ia/escolhas-da-tipologia'
import { permissaoDoRemetente, type Permissao } from '@/lib/atendimentos-ia/permissao-do-remetente'
import {
    gerarArquivoDoLevantamento, lerLevantamentoDoArquivo, type Funcionario, lerNomeDaEmpresa, lerPerfilDoVendedor, lerVendedorDoRemetente, funcionariosPeloNome,
    montarDadosDaFolha, resumoDoArquivo, resumoDoArquivoParaOPrompt, textoDoEnvioDoArquivo, type DetalheDaTipologia,
} from '@/lib/atendimentos-ia/arquivo-do-levantamento'
import {
    condicoesComOCadastro, FRASE_FALTA_O_VENDEDOR, fraseDoVendedorInativo, fraseDoVendedorNaoAchado, fraseDosHomonimos, fraseDosHomonimosIndistinguiveis, homonimosDistinguiveis, lerDadosDaMensagem, perguntaDasCondicoes,
    type CondicoesDoLevantamento,
} from '@/lib/atendimentos-ia/dados-do-levantamento'
import {
    apagarPerguntaEmAberto, confirmacaoVale, esquadriasDaProposta, gravarPerguntaEmAberto, juntarEsquadrias, lerPerguntaEmAberto, marcaDaConfirmacao, montagemExpirou,
    type CodigoDaPergunta, type EsquadriaProposta, type PerguntaEmAberto,
} from '@/lib/atendimentos-ia/pergunta-em-aberto'
import { DESCRICAO_DA_FALA, blocoDoContexto, falaValida, lerContextoDoAtendimento, temDinheiro, type ContextoLido, type FalaLida } from '@/lib/atendimentos-ia/contexto-do-atendimento'

export const PREFIXO_DO_LOG_DA_IA = '[IA]'
export const NOME_DA_FERRAMENTA = 'registrar_levantamento'
const EM_MONTAGEM = 'EM_MONTAGEM'
const COMPLETO = 'COMPLETO'
const wuzapi = () => (process.env.WUZAPI_BASE_URL || 'https://usapi.adabtech.shop').replace(/\/$/, '')

export type DesfechoDaIa =
    | 'sem-chave' | 'sem-saldo' | 'erro-da-llm' | 'recusa' | 'sem-proposta' | 'sem-tipologias'
    /** A 1ª chamada ao modelo não voltou no prazo (04/11/2026): a linha sai no instante do estouro E no fim do turno. */
    | 'prazo-esgotado'
    | 'sem-nome' | 'nome-parecido' | 'nome-existe' | 'qual-esquadria' | 'nao-encontrado' | 'qual-vendedor' | 'alteracao-incompleta'
    | 'nao-avancou' | 'confirmar-acrescimo' | 'confirmar-resgate' | 'nao-acrescentou' | 'nao-confirmou'
    /** O ARQUIVO do levantamento enviado para conferir (06/11/2026); recusado pelo gerador; não enviado; o vendedor dito que não está no cadastro. */
    | 'arquivo' | 'arquivo-recusado' | 'arquivo-nao-enviado' | 'vendedor-nao-achado'
    | 'perguntou' | 'sem-cores' | 'sem-linha' | 'padrao-nomeado' | 'levantou' | 'recusou' | 'envio-falhou' | 'erro' | 'nenhuma-cabe'
    /** O reenvio do WUZAPI de uma entrada já respondida (200 sem conduzir), e o reenvio da saída cujo primeiro envio falhou (03/11/2026). */
    | 'repetida' | 'reenviada'

export type Rota = 'MONTAGEM' | 'NOVO' | 'ALTERACAO' | 'ALTERACAO_ADMIN' | 'SEM_NOME' | 'PARECIDO' | 'RESGATE' | 'NOME_EXISTE' | 'NAO_ENCONTRADO' | 'QUAL_VENDEDOR' | '-'
/**
 * Como o nome foi lido — NUNCA o nome em si (dono do produto, 26/10/2026): `veio` (está no texto),
 * `faltou` (a IA não leu nenhum), `fora_do_texto` (a IA leu um que não está no texto, e ele não vale),
 * `da_pergunta` (não está no texto, mas é um dos que a pergunta em aberto citou), `do_cliente` (o nome saiu do
 * cliente que está no texto, 03/11/2026).
 */
type MarcaDoNome = '-' | 'veio' | 'faltou' | 'fora_do_texto' | 'da_pergunta' | 'do_cliente'
/**
 * A chamada à IA, medida (dono do produto, 26/10/2026): o tempo, do envio do pedido à resposta lida, e os tokens de
 * entrada e de saída que a própria API devolve em `usage`. SÓ NÚMERO — nunca o texto do pedido nem o da resposta.
 * Sem `usage` (um erro da API), o token é null, que vai ao log como "-", nunca zero. Sem chamada, `ms` é null.
 */
type MedidaDaIa = {
    ms: number | null; entrada: number | null; saida: number | null
    /** Os tokens de RACIOCÍNIO dentro da saída (`usage.output_tokens_details.thinking_tokens`, 05/11/2026): '-' quando a API não os dá. */
    raciocinio: number | null
    /** O `stop_reason` da resposta (05/11/2026): `tool_use` é o esperado; `max_tokens` diz que o teto de saída cortou. */
    parada: string | null
    /** O cache do prefixo (05/11/2026): quantos tokens foram LIDOS do cache e quantos foram ESCRITOS nele nesta chamada. */
    cacheLido: number | null; cacheEscrito: number | null
    /** Em fluxo (05/11/2026): ms até os cabeçalhos da tentativa que respondeu, ms até o primeiro token, quantas tentativas, e o request-id da API. */
    cabecalhosMs: number | null; primeiroTokenMs: number | null; tentativas: number | null; requestId: string | null
}
/**
 * A OBSERVABILIDADE POR ETAPA (dono do produto, 06/11/2026): "cada etapa do atendimento tem de dizer, no log, o que recebeu, o que fez e o
 * que faltou — para a gente saber em qual delas o erro ocorreu, sem adivinhar." SÓ LOG: as linhas são montadas ao longo do turno e saem
 * juntas, na saída única (`anotar`), logo depois da linha [IA]; a etapa que o turno não alcançou sai `nao_chegou`. Só contagens e
 * códigos (esquadria `e1`, campo, tipologia, motivo, variável) — nunca texto do vendedor, telefone, chave ou valor em reais.
 */
export const PREFIXO_DO_LOG_DA_ETAPA = '[ETAPA'
export type EtapasDoTurno = { coletar: string | null; casar: string | null; montar: string | null; calcular: string | null }
const ETAPAS_DO_LOG = [[1, 'coletar'], [2, 'casar'], [3, 'montar'], [4, 'calcular']] as const
/** Uma lista no log: vazia é `-`; longa é cortada e contada, nunca calada. */
const listaNoLog = (xs: readonly string[], max = 12) => (xs.length === 0 ? '-' : xs.length <= max ? xs.join(',') : `${xs.slice(0, max).join(',')},+${xs.length - max}`)
/** O campo da esquadria no log, curto. */
const CAMPO_NO_LOG: Record<string, string> = { tipologia: 'tipologia', largura_mm: 'largura', altura_mm: 'altura', quantidade: 'quantidade', cor_perfil: 'cor', vidro: 'vidro' }
const campoNoLog = (campo: string) => CAMPO_NO_LOG[campo] ?? campo
const nuloNoLog = (v: number | string | null | undefined) => (v === null || v === undefined ? '-' : String(v))

type Rastro = {
    /** As linhas por etapa (06/11/2026); `null` = a etapa não foi alcançada neste turno. */
    etapas: EtapasDoTurno
    levantamento: string; rota: Rota; propostos: number; descartados: number; enviou: boolean; admin: Permissao | null
    nome: MarcaDoNome; aberta: CodigoDaPergunta | 'ausente' | 'expirada' | '-'; ia: MedidaDaIa
    contexto: ContextoLido['estado'] | '-'; fala: FalaLida['motivo'] | '-'
    /** Quantas instruções de categoria foram ao sistema, ou `sem_migracao`; '-' quando não houve chamada à IA. */
    instrucoes: string
    /** Quantas instruções de etapa (a corrente, por família) foram ao sistema (04/11/2026); '-' sem chamada. */
    instrucoesDasEtapas: number | '-'
    /** As instruções escritas em etapas que não falam com o modelo, `numero:ACAO:caracteres` separadas por vírgula; '' quando não há. */
    instrucoesSemEfeito: string
    /** Quantos itens iguais se fundiram nesta mensagem (03/11/2026). */
    fundidos: number
    /**
     * O CAMINHO de cada esquadria desta mensagem no agrupamento, `e<ordem>:<CAMINHO>` (06/11/2026): GRAVADA_NOVA, SUBSTITUIU_QUANTIDADE,
     * IGNORADA_IGUAL ou SOMADA_NA_MENSAGEM. "O log atual só disse agrupados=2, que é o que escondeu a causa."
     */
    caminhos: string[]
    /** Quantas esquadrias da mensagem eram reenvio idêntico de uma já retida na pergunta em aberto (03/11/2026). */
    reenviadas: number
    /** Quantas mensagens da conversa foram ao modelo (03/11/2026); '-' sem chamada. */
    historico: number | '-'
    /** A gravação da saída: `sim`, `sem_migracao` (sem a coluna responde_a) ou `falhou` (a resposta já tinha saído; só o log). */
    gravacao: 'sim' | 'sem_migracao' | 'falhou' | '-'
    /** O que aconteceu com a redação pelo modelo (03/11/2026); '-' quando a resposta não passou por ela. */
    redacao: MotivoDaRedacao | '-'
    /** Vidros propostos de que NADA estava na mensagem, e caíram inteiros (04/11/2026). */
    vidrosNaoDitos: number
    /** Vidros propostos PODADOS ao que a mensagem diz — a parte completada pelo modelo caiu, o dito ficou (04/11/2026, "pode, não derrube"). */
    vidrosPodados: number
    /** Esquadrias que receberam o vidro padrão da instrução (04/11/2026). */
    vidrosPadrao: number
    /** A lista do prompt pelo ACUMULADO (05/11/2026): `enviadas/total` e quantos trechos filtraram; '-' sem chamada. */
    lista: string
    trechos: number
    /** Trechos para os quais nenhuma tipologia sobrou e trouxeram a lista inteira (a rede de segurança). */
    trechosSemCandidata: number
    /** Itens que o modelo devolveu SEM nenhum campo da esquadria (05/11/2026): foi assim que as esquadrias do Jorge Koss se perderam. */
    itensSemCampos: number
    /** A montagem (05/11/2026): `expirada` (mais de 24 h sem toque, não captura a mensagem), `outro_cliente` ou `novo` (a mensagem saiu dela). */
    montagem: '-' | 'expirada' | 'outro_cliente' | 'novo'
    /** Esquadrias que receberam a cor PREDOMINANTE da base por não ter cor dita (05/11/2026). */
    coresPadrao: number
    /** Esquadrias que receberam a tipologia PADRÃO do código — de correr, 2 folhas, lisa (05/11/2026). */
    tipologiasPadrao: number
}
const FALA_NO_LOG: Record<FalaLida['motivo'], string> = { usada: 'usada', ausente: 'ausente', numero: 'descartada_numero', longa: 'descartada_longa', sobre_valor: 'descartada_sobre_valor' }

function anotar(r: Rastro, desfecho: DesfechoDaIa, detalhe = '') {
    // a permissão só aparece quando foi consultada; o motivo é um código, nunca um nome
    const admin = r.admin === null ? '' : 'motivo' in r.admin ? ` admin=nao motivo_admin=${r.admin.motivo}` : ' admin=sim'
    const ia = r.ia.ms === null ? '' : ` ia_ms=${r.ia.ms} ia_entrada=${r.ia.entrada ?? '-'} ia_saida=${r.ia.saida ?? '-'}`
        + ` ia_raciocinio=${r.ia.raciocinio ?? '-'} ia_parada=${r.ia.parada ?? '-'} ia_cache_lido=${r.ia.cacheLido ?? '-'} ia_cache_escrito=${r.ia.cacheEscrito ?? '-'}`
        + ` ia_cabecalhos_ms=${r.ia.cabecalhosMs ?? '-'} ia_primeiro_token_ms=${r.ia.primeiroTokenMs ?? '-'} ia_tentativas=${r.ia.tentativas ?? '-'} ia_request_id=${r.ia.requestId ?? '-'}`
    // o contexto e a fala: o ESTADO, nunca o texto
    const contexto = (r.contexto === '-' ? '' : ` contexto=${r.contexto}${r.fala === '-' ? '' : ` fala=${FALA_NO_LOG[r.fala]}`}`)
        + (r.instrucoes === '-' ? '' : ` instrucoes=${r.instrucoes}`) + (r.instrucoesDasEtapas === '-' ? '' : ` instrucao_etapa=${r.instrucoesDasEtapas}`)
        + (r.instrucoesSemEfeito === '' ? '' : ` instrucao_sem_efeito=${r.instrucoesSemEfeito}`)
        + (r.fundidos > 0 ? ` agrupados=${r.fundidos}` : '') + (r.caminhos.length > 0 ? ` caminhos=${r.caminhos.join(',')}` : '') + (r.reenviadas > 0 ? ` reenviadas=${r.reenviadas}` : '')
        + (r.historico === '-' ? '' : ` historico=${r.historico}`) + (r.gravacao === '-' ? '' : ` gravacao=${r.gravacao}`) + (r.redacao === '-' ? '' : ` redacao=${r.redacao}`)
        + (r.vidrosNaoDitos > 0 ? ` vidro_nao_dito=${r.vidrosNaoDitos}` : '') + (r.vidrosPodados > 0 ? ` vidro_podado=${r.vidrosPodados}` : '') + (r.vidrosPadrao > 0 ? ` vidro_padrao=${r.vidrosPadrao}` : '')
        // a lista pelo acumulado e os itens vazios (05/11/2026): só números
        + (r.lista === '-' ? '' : ` lista=${r.lista} trechos=${r.trechos}`) + (r.trechosSemCandidata > 0 ? ` trechos_sem_candidata=${r.trechosSemCandidata}` : '')
        + (r.itensSemCampos > 0 ? ` itens_sem_campos=${r.itensSemCampos}` : '')
        // a montagem e os padrões (05/11/2026)
        + (r.montagem === '-' ? '' : ` montagem=${r.montagem}`) + (r.coresPadrao > 0 ? ` cor_padrao=${r.coresPadrao}` : '') + (r.tipologiasPadrao > 0 ? ` tipologia_padrao=${r.tipologiasPadrao}` : '')
    console.error(`${PREFIXO_DO_LOG_DA_IA} levantamento=${r.levantamento} rota=${r.rota} propostos=${r.propostos} descartados=${r.descartados} enviou=${r.enviou ? 'sim' : 'nao'} desfecho=${desfecho}${admin} nome=${r.nome} aberta=${r.aberta}${contexto}${ia}${detalhe ? ` ${detalhe}` : ''}`)
    // as linhas por etapa (06/11/2026), na ordem do turno; a última é a resposta, que todo turno tem
    for (const [n, nome] of ETAPAS_DO_LOG) console.error(`${PREFIXO_DO_LOG_DA_ETAPA} ${n} ${nome}] ${r.etapas[nome] ?? 'nao_chegou'}`)
    console.error(`${PREFIXO_DO_LOG_DA_ETAPA} 5 responder] desfecho=${desfecho} enviou=${r.enviou ? 'sim' : 'nao'} redacao=${r.redacao} gravacao=${r.gravacao}`)
}

// ── As frases fixas do roteamento ───────────────────────────────────────────────────────────
/** Sem nome e sem cliente em lugar nenhum: pergunta o CLIENTE, que é o nome do levantamento (03/11/2026). */
export const FRASE_SEM_NOME = 'Para eu anotar, me diga o nome do cliente — por exemplo: Cliente João Silva. Se for sobre um levantamento que você já fez, me diga de quem é.'
/** A mesma pergunta em OUTRAS palavras, quando a resposta não trouxe o cliente: nunca a mesma frase de novo. */
export const OUTRAS_PERGUNTAS_DO_NOME = [
    'Ainda não tenho o cliente deste levantamento. Mande o nome do cliente, por exemplo: Cliente Maria Souza.',
    'De quem é esta obra? Escreva o nome do cliente (por exemplo: Cliente Pedro Lima) ou o nome de um levantamento que você já fez.',
] as const
/**
 * A reformulação quando a resposta do vendedor não coube no campo (dono do produto, 03/11/2026): "reformule a pergunta em
 * outras palavras em vez de repetir". Uma das OUTRAS formas — nenhuma delas é a pergunta de sempre —, escolhida pela
 * mensagem: sem guardar estado (nenhuma migração nesta mudança), duas mensagens diferentes tendem a receber formas
 * diferentes. LIMITE CONHECIDO: duas reformulações seguidas podem cair na mesma forma; a pergunta de sempre nunca volta.
 */
export function outraPergunta(outras: readonly string[], mensagem: string): string {
    let h = 0
    for (const ch of normalizarNome(mensagem)) h = (h * 31 + (ch.codePointAt(0) ?? 0)) >>> 0
    return outras[h % outras.length]
}
// ── O RESGATE (dono do produto, 03/11/2026): conversa, não formulário ──
/** O que a lista do resgate mostra de cada levantamento: o nome, a data (de criação, no fuso do Brasil) e o estado. */
export type OpcaoDeResgate = { id?: string; nome: string; criado_em: string; estado: string }
export const LIMITE_DO_RESGATE = 3
const FUSO_DO_VENDEDOR = 'America/Sao_Paulo'
/** dd/mm/aaaa no fuso do vendedor; uma data que não se lê sai como "data não lida", nunca como hoje. */
export function dataBR(iso: string): string {
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? 'data não lida' : new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO_DO_VENDEDOR, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
}
export const estadoPorExtenso = (estado: string) => (estado === EM_MONTAGEM ? 'em montagem' : estado === COMPLETO ? 'completo' : estado.toLowerCase())
/** As opções do resgate: do mais recente ao mais antigo, no máximo LIMITE_DO_RESGATE. */
export function opcoesDeResgate<L extends OpcaoDeResgate>(existentes: readonly L[]): L[] {
    return [...existentes].sort((a, b) => (a.criado_em < b.criado_em ? 1 : a.criado_em > b.criado_em ? -1 : 0)).slice(0, LIMITE_DO_RESGATE)
}
const linhaDoResgate = (o: OpcaoDeResgate, k: number) => `${k + 1}) ${o.nome} — ${dataBR(o.criado_em)}, ${estadoPorExtenso(o.estado)}`
const listaDoResgate = (opcoes: readonly OpcaoDeResgate[]) => opcoes.map(linhaDoResgate).join('\n')
/** A lista numerada; o vendedor responde do jeito dele, e se for novo diz o nome. Nunca "responda: novo X" nem "escreva o nome exatamente". */
export const fraseDoNomeParecido = (nome: string, opcoes: readonly OpcaoDeResgate[]) =>
    `Pelo que você escreveu (“${nome}”), pode ser ${opcoes.length > 1 ? 'um destes levantamentos' : 'este levantamento'}:\n${listaDoResgate(opcoes)}\n`
    + `${opcoes.length > 1 ? 'É algum deles? Me diga qual.' : 'É esse?'} Se for um cliente novo, me diga o nome dele que eu começo.`
/** A mesma lista, em outras palavras — quando a resposta não disse qual é (R2, sem "Não consegui registrar"). */
export const fraseDoResgateEmOutrasPalavras = (nome: string, opcoes: readonly OpcaoDeResgate[]) =>
    `Ainda não entendi de qual levantamento é (“${nome}”). Olha de novo:\n${listaDoResgate(opcoes)}\n`
    + `Pode me dizer o número, o nome do cliente ou a data. Se não for nenhum, me diga o nome do cliente novo.`
/** A confirmação do resgate: uma frase curta, e a conversa segue com o "sim". */
export const fraseDeConfirmarResgate = (o: OpcaoDeResgate) => `Então é o “${o.nome}”, de ${dataBR(o.criado_em)}, certo?`
export const fraseDeConfirmarResgateEmOutrasPalavras = (o: OpcaoDeResgate) =>
    `Só para eu ter certeza: estamos falando do “${o.nome}”, de ${dataBR(o.criado_em)}? Me responde sim ou não.`
/** O "não" à confirmação: a lista volta sem o recusado; sem sobrar nenhum, pergunta o cliente novo. */
export const fraseDoResgateRecusado = (recusado: OpcaoDeResgate, outras: readonly OpcaoDeResgate[]) =>
    outras.length
        ? `Certo, não é o “${recusado.nome}”. Então é qual destes?\n${listaDoResgate(outras)}\nOu, se for um cliente novo, me diga o nome dele.`
        : `Certo, não é o “${recusado.nome}”. Então é um cliente novo? Me diga o nome dele que eu começo.`
export const fraseDoNomeQueJaExiste = (nome: string) =>
    `Já tenho um levantamento “${nome}”. Quer alterar esse? Me diga o que muda. Se for outro cliente, me diga o nome dele.`
export const fraseDeQualEsquadria = (nome: string, nItens: number) =>
    `O levantamento “${nome}” tem ${nItens} esquadrias. Qual delas muda? Diga o número (de 1 a ${nItens}) e o que muda.`
/** Para quem não é admin: a MESMA frase exista ou não o levantamento de outro vendedor. */
export const fraseDeNaoEncontrei = (nome: string) =>
    `Não achei um levantamento seu com o nome “${nome}”. Se for um cliente novo, me diga o nome dele que eu começo; se já existe, me diga de quem é.`
export const fraseDeNaoEncontreiNaEmpresa = (nome: string) =>
    `Não achei um levantamento com o nome “${nome}” na empresa. Se for um cliente novo, me diga o nome dele que eu começo; se já existe, me diga de quem é.`
export const fraseDeQualVendedor = (nome: string, vendedores: string[]) =>
    `O levantamento “${nome}” existe para mais de um vendedor: ${vendedores.join(', ')}. De qual vendedor é? Escreva o nome do levantamento, o do vendedor e o que muda.`
export const fraseDaAlteracaoIncompleta = (nome: string, vendedor: string, pergunta: string) =>
    `A alteração deixaria o levantamento “${nome}”, de ${vendedor}, incompleto — falta: ${pergunta} Mande a alteração com isso junto. Nada foi gravado.`
/**
 * R2: a mensagem não mudou nada — a resposta diz isso, em vez de repetir a pergunta como se nada fosse. Sem "Não consegui registrar" e
 * sem mandar responder numa forma ditada (dono do produto, 03/11/2026); o modelo a redige em outras palavras (`falar`).
 */
export const fraseDeNaoRegistrei = (pergunta: string) => `Essa resposta não me deu o que falta. ${pergunta}`
/** O arquivo que o gerador recusou (06/11/2026): cada recusa nomeada, e o que fazer — nunca uma folha aproximada. */
export const fraseDoArquivoRecusado = (recusas: readonly string[]) =>
    `Não consegui gerar o arquivo do levantamento:\n${recusas.map((r) => `• ${r}`).join('\n')}\nMe diga o que corrigir.`
export const FALHA_NO_ENVIO_DO_ARQUIVO = 'O levantamento foi gravado, mas não consegui enviar o arquivo dele agora. Mande o nome do levantamento de novo para eu reenviar.'
/** O mesmo arquivo de novo, sem mudar nada: não se reenvia; a resposta diz que nada mudou e repete a pergunta. */
export const FRASE_O_ARQUIVO_NAO_MUDOU = 'Essa resposta não mudou nada no levantamento: o arquivo que enviei continua valendo. Confere? Responda sim, ou diga o que muda.'
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
/** A mesma confirmação em outras palavras (R2 no roteamento pelo nome, sem "Não consegui registrar"). */
export const fraseDeConfirmarAcrescimoEmOutrasPalavras = (nome: string) =>
    `Para eu acrescentar ao “${nome}”, preciso do seu sim. Se for de outro levantamento, me diga de qual.`
/** O "não" ao apanhado: nada de preço, e a conversa pede o que muda. A pergunta continua em aberto. */
export const fraseDoApanhadoNaoConfirmado = (nome: string) =>
    `Certo, o levantamento “${nome}” não foi confirmado. Diga o que muda — medida, vidro ou quantidade — e eu refaço o apanhado.`
export const fraseDoAcrescimoRecusado = (nome: string) =>
    `Não acrescentei nada ao levantamento “${nome}”. De qual levantamento é a esquadria? Diga o nome dele.`
/** DEFEITO 3: o remetente autorizado sempre recebe resposta, e ela diz o que falhou. */
export const FALHA_SEM_CHAVE = 'Não consegui processar a sua mensagem: o atendimento por IA está sem a chave de acesso configurada. Avise o administrador.'
export const FALHA_SEM_SALDO = 'Não consegui processar a sua mensagem: a conta do serviço de IA está sem saldo de créditos. Avise o administrador.'
export const FALHA_DA_IA = 'Não consegui processar a sua mensagem: o serviço de IA não respondeu. Nada foi gravado; mande de novo em alguns minutos.'
/** O prazo da 1ª chamada estourou (dono do produto, 04/11/2026: "não consegui processar agora, me mande de novo"). */
export const FALHA_PRAZO_DA_IA = 'Não consegui processar a sua mensagem agora: o serviço de IA demorou demais para responder. Nada foi gravado; me mande de novo.'
export const FALHA_RECUSA = 'Não consegui processar a sua mensagem: o serviço de IA recusou o conteúdo. Nada foi gravado; reescreva a mensagem.'
export const FALHA_DO_BANCO_ANTES = 'Não consegui processar a sua mensagem: houve um erro ao ler o levantamento. Nada foi gravado; mande de novo.'
export const FALHA_DO_BANCO_AO_GRAVAR = 'Não consegui concluir: houve um erro ao gravar o levantamento, e ele pode não ter sido gravado por inteiro. Mande de novo o nome do levantamento e o que muda.'
export const FALHA_NO_CALCULO = 'O levantamento foi gravado, mas houve um erro ao calcular o preço. Mande o nome do levantamento de novo para eu refazer a conta.'

/** Quando o remetente não tem nome nem o employee dele. */
const VENDEDOR_SEM_NOME = '(vendedor sem nome cadastrado)'

// ── A FERRAMENTA — a saída estruturada ──────────────────────────────────────────────────────
/**
 * O que NÃO foi dito é OMITIDO, não `null`: os campos são opcionais e de tipo simples, sem união.
 *
 * SEM `strict` (dono do produto, 05/11/2026). A ferramenta foi `strict: true` até aqui, dentro dos "Schema complexity limits" da API
 * (16 uniões, 24 opcionais somando os esquemas strict do pedido); o `vidro_padrao` (04/11/2026) foi o 24º opcional. O que se mediu com o
 * esquema NO limite: sem `thinking`, a API ficou 45 a 50 s sem responder e devolveu `400 Schema is too complex` — o travamento de 04/11 20:11
 * a 05/11 02:41 em produção; com `thinking: between_tools`, respondeu em 5 s mas a ferramenta veio SEM tipologia, medida, quantidade, cor
 * ou vidro (só `abertura` e uma `familia` inventada), 8 de 8 repetições e os cinco turnos do Jorge Koss (`propostos=0, 0, 1, 0, 0`). A MESMA
 * ferramenta sem `strict` extraiu tudo em 3,7 a 7 s. A validação da entrada já é nossa (`valorValido`, `nomeDaMensagem`, `aberturaDoItem`,
 * as podas de vidro e fornecedor): o `strict` só forçava a gramática. O portão (8) confere que a ferramenta NÃO vai strict.
 */
const texto = { type: 'string' }
const inteiro = { type: 'integer' }
export const FERRAMENTA = {
    name: NOME_DA_FERRAMENTA,
    description: 'Registra o que o vendedor disse nesta mensagem. Chame SEMPRE, uma vez por resposta.',
    input_schema: {
        type: 'object',
        additionalProperties: false,
        required: ['itens'],
        properties: {
            nome: { ...texto, description: 'O nome do levantamento, copiado INTEIRO como o vendedor o escreveu NESTA mensagem. Com a pergunta do nome em aberto, o nome que ele respondeu de qualquer jeito ("Geison Silva novo" → Geison Silva). Omita se ele não escreveu.' },
            cliente: { ...texto, description: 'O nome do CLIENTE, copiado como o vendedor o escreveu NESTA mensagem (ex.: "Cliente: Geronimo Silva" → Geronimo Silva). O nome do levantamento é o nome do cliente, puro. Omita se ele não escreveu.' },
            novo: { type: 'boolean', description: 'true SÓ quando o vendedor disse explicitamente que é um levantamento novo.' },
            opcao: { ...inteiro, description: 'Quando a pergunta em aberto lista levantamentos numerados e o vendedor escolheu um deles — pelo número ("o 2"), pela ordem ("o primeiro", "o último"), pelo nome ("é o do Geronimo") ou pela data ("o de ontem") —, o número dele na lista. Senão, omita.' },
            alteracao: { type: 'boolean', description: 'true quando o vendedor pede para MUDAR um levantamento que já existe (troca, muda, altera, corrige).' },
            vendedor: { ...texto, description: 'O nome do VENDEDOR dono do levantamento, copiado como foi escrito NESTA mensagem. Omita se não foi escrito.' },
            vendedor_opcao: { ...inteiro, description: 'Quando a pergunta em aberto lista FUNCIONÁRIOS, numerados, e o vendedor escolheu um deles — pelo número, pelo nome completo ou pela data do cadastro —, o número dele na lista. Senão, omita.' },
            vendedor_do_levantamento: { ...texto, description: 'Quando quem escreve LANÇA o levantamento PARA outro vendedor, dizendo isso sobre o VENDEDOR ("é do Cristiano", "é para o Cristiano", "o vendedor é o Cristiano", "vendedor: Cristiano", "lança para o Cristiano"): o nome dele, copiado como foi escrito NESTA mensagem. NUNCA o nome do CLIENTE, nem um nome solto ("levantamento do João" é o cliente João). Omita se não foi dito.' },
            dados_do_cliente: {
                type: 'object',
                additionalProperties: false,
                description: 'Os dados do cliente e da obra, SÓ os que o vendedor escreveu NESTA mensagem, copiados. Omita o que não foi dito.',
                properties: {
                    telefone: texto, email: texto, edificacao: { ...texto, description: 'O tipo da edificação, como dito (casa, sobrado, prédio...).' },
                    endereco: texto, obs_obra: { ...texto, description: 'Uma observação da OBRA, copiada.' },
                    data_entrega: { ...texto, description: 'A data de entrega dita, como AAAA-MM-DD (o vendedor escreve 27/11/26 → 2026-11-27).' },
                },
            },
            condicoes: {
                type: 'object',
                additionalProperties: false,
                description: 'As condições comerciais que o vendedor DISSE NESTA mensagem (comissão, reserva técnica, lucro). NUNCA invente, NUNCA use o cadastro: só o número dito. Omita o que não foi dito.',
                properties: {
                    comissao_percentual: { type: 'number' }, comissao_modo: { type: 'string', enum: ['PROPORCIONAL', 'CONGELADA'] },
                    reserva_tecnica_percentual: { type: 'number' }, reserva_tecnica_responsavel: { ...texto, description: 'Quem recebe a reserva técnica (o arquiteto, o decorador), copiado.' },
                    lucro_projetado_percentual: { type: 'number' },
                },
            },
            confirma: { type: 'boolean', description: 'Só quando a pergunta em aberto pede confirmação: true se o vendedor confirmou, false se negou. Senão, omita.' },
            itens: {
                type: 'array',
                description: 'As esquadrias ditas NESTA mensagem, com SÓ os campos ditos. Vazio se nenhuma.',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                        ordem: { ...inteiro, description: 'O número da esquadria, SÓ quando o vendedor disse qual é.' },
                        tipologia: texto, largura_mm: inteiro, altura_mm: inteiro, quantidade: inteiro, cor_perfil: texto,
                        vidro: { ...texto, description: 'O vidro COMO o vendedor o escreveu NESTA mensagem ("vidro 4mm" → vidro 4mm), sem acrescentar têmpera, cor ou qualquer palavra que ele não disse. Omita se ele não disse.' },
                        vidro_padrao: { ...texto, description: 'SÓ quando o vendedor NÃO disse o vidro desta esquadria e a instrução da categoria VIDRO define um padrão para ela: o padrão, copiado da instrução. Senão, omita.' },
                        abertura: { type: 'string', enum: ['porta', 'janela'], description: 'A PALAVRA que o vendedor usou para esta esquadria: "porta" (também porta-janela e porta janela) ou "janela". SÓ se ele a escreveu; senão, omita.' },
                        fornecedor: { ...texto, description: 'O nome do FORNECEDOR como está na lista, SÓ quando o vendedor disse de qual fornecedor é a tipologia.' },
                        familia: { ...texto, description: 'A FAMÍLIA (ex.: PVC, Alumínio) como está na lista, SÓ quando o vendedor disse de qual família é a tipologia.' },
                        ambientes: {
                            type: 'array',
                            description: 'Os AMBIENTES desta esquadria e quantas unidades vão em cada um, SÓ como o vendedor disse NESTA mensagem ("2 no quarto e 1 na sala"). Nomes copiados. Omita se ele não disse.',
                            items: { type: 'object', additionalProperties: false, required: ['ambiente', 'quantidade'], properties: { ambiente: texto, quantidade: inteiro } },
                        },
                        obs: { ...texto, description: 'Uma observação DESTA esquadria que o vendedor escreveu NESTA mensagem, copiada. Omita se não houver.' },
                    },
                },
            },
            escolhas: {
                type: 'array',
                description: 'Só o arremate que o vendedor disse NESTA mensagem, em palavras: o CÓDIGO da variável e o NÚMERO da opção que corresponde. Vazio se ele não disse.',
                // os dois são obrigatórios na escolha (03/11/2026): a escolha sem um deles era descartada de qualquer jeito (e, enquanto a
                // ferramenta foi strict, o limite de 24 opcionais precisava de lugar para a `opcao` do resgate)
                items: { type: 'object', additionalProperties: false, required: ['variavel', 'opcao'], properties: { variavel: texto, opcao: inteiro } },
            },
            opcoes_de: {
                type: 'array',
                description: 'O CÓDIGO das variáveis cujas opções o vendedor pediu para ver, ou que ele quer trocar sem dizer por qual.',
                items: texto,
            },
            pergunta: {
                type: 'object',
                additionalProperties: false,
                description: 'Só quando a pergunta em aberto é sobre um CAMPO e você precisa reformulá-la: duas tipologias possíveis, ou a tipologia que ainda não dá para concluir — então pergunte em linguagem de obra o que falta (janela ou porta, como abre), nunca "qual a tipologia" — e nunca o que tem natural (folhas, módulos, persiana, bandeira, peitoril).',
                properties: { campo: { type: 'string', enum: [...CAMPOS_DA_ESQUADRIA] }, texto },
            },
        },
    },
}

/**
 * A ferramenta ENVIADA: a de cima e mais a `fala` (21 opcionais, dentro dos 24). Desde o prompt base (03/11/2026) ela vale
 * para TODA empresa — "a frase de abertura passa a valer para TODA empresa, já que todas terão o base. Mantenha o filtro
 * que derruba qualquer frase com número." Antes, só com contexto.
 */
export const FERRAMENTA_COM_FALA = {
    ...FERRAMENTA,
    input_schema: { ...FERRAMENTA.input_schema, properties: { ...FERRAMENTA.input_schema.properties, fala: { ...texto, description: DESCRICAO_DA_FALA } } },
}

type ContextoDoPrompt = {
    /** O contexto da empresa, ou null — e null é o prompt base sozinho, sem o bloco da empresa. */
    contexto: string | null
    candidatos: readonly CandidatoDeTipologia[]
    /** A conta tem mais de uma família: cada linha diz a família (e o fornecedor do motor), e a regra da família entra. */
    variasFamilias: boolean
    cores: readonly string[]
    montagem: { nome: string; itens: Array<Omit<ItemDoLevantamento, 'familia' | 'motor_id'>> } | null
    perguntaEmAberto: string | null
    /** A data de hoje (dd/mm/aaaa), só quando a pergunta em aberto lista levantamentos com data: "o de ontem" precisa dela. */
    hoje: string | null
    /** As escolhas de arremate de cada tipologia com as abas: código e números, só para a LLM. */
    escolhasPorTipologia: Array<{ tipologia: string; linhas: string[] }>
    /** As variáveis SEM PADRÃO de cada tipologia (06/11/2026): código e descrição, só para a LLM; vazia, nenhuma seção. */
    variaveisSemPadraoPorTipologia: Array<{ tipologia: string; linhas: string[] }>
    /** As instruções das categorias PREENCHIDAS (03/11/2026); vazia, nenhuma seção. */
    instrucoes: readonly InstrucaoDaCategoria[]
    /** A instrução da etapa CORRENTE de cada família (a de GERAR_LEVANTAMENTO), só as preenchidas (04/11/2026); vazia, nenhuma seção. */
    instrucoesDasEtapas: readonly InstrucaoDaEtapa[]
}

/** Como o modelo lê os limites compactos da lista (05/11/2026): a sigla, a faixa, os unilaterais, e o que a ausência quer dizer. */
export const LEGENDA_DOS_LIMITES = 'limites em mm: L largura, A altura; "A 388-2439" é a faixa, "≥" só o mínimo, "≤" só o máximo; sem L ou sem A, o arquivo não traz o limite'
export type SistemaDoPedido = { estavel: string; volatil: string }
/**
 * O sistema em DOIS blocos (05/11/2026): o ESTÁVEL — igual entre as chamadas da mesma conta enquanto o catálogo e a base de conhecimento não
 * mudam: o prompt base, as regras, a lista de tipologias, as cores, as escolhas, as instruções e o contexto da empresa — e o VOLÁTIL, que muda
 * a cada mensagem: a montagem, a data e a pergunta em aberto. O estável vai marcado para o cache; o volátil vem depois dele.
 */
function sistema(c: ContextoDoPrompt): SistemaDoPedido {
    const doProduto = [
        // o PROMPT BASE abre o sistema de toda empresa (03/11/2026); o contexto da empresa vai no FIM
        PROMPT_BASE,
        '',
        'Você conversa pelo WhatsApp com um VENDEDOR de uma empresa de esquadrias e anota LEVANTAMENTOS.',
        'Cada levantamento tem um NOME dado pelo vendedor (ex.: "Levantamento Casa do João") e uma ou mais esquadrias.',
        'O vendedor já sabe o que a empresa vende: você só anota.',
        'Você recebe as últimas mensagens da conversa (até 24 horas): a ÚLTIMA é a desta vez, e é dela que saem os campos. As anteriores dizem o que já foi combinado: use-as para entender referências ("a mesma cor", "igual à primeira") e para NUNCA perguntar de novo o que o vendedor já disse.',
        '',
        'Os campos de cada esquadria: tipologia; largura_mm; altura_mm; quantidade; cor_perfil; vidro.',
        'Medidas em milímetros, inteiras: se o vendedor disser em metros ou centímetros, converta.',
        '',
        'Regras:',
        '- nome: copie o nome do levantamento INTEIRO, como o vendedor escreveu nesta mensagem. Não complete, não corrija, não encurte. Se ele não escreveu um nome, omita.',
        '- cliente: o nome do CLIENTE, copiado como o vendedor escreveu nesta mensagem ("Cliente: Geronimo Silva", "obra do Geronimo Silva" → Geronimo Silva). O nome do levantamento é o nome do cliente, puro: com o cliente dito, não pergunte o nome. Se a pergunta em aberto pede o cliente e a mensagem é só um nome de pessoa, é o cliente. Se ele não escreveu, omita.',
        '- Com a pergunta do nome em aberto (o nome do cliente, ou a lista de levantamentos parecidos), o vendedor responde do jeito dele, e o nome vem de qualquer forma: "Geison Silva novo", "é o Geison Silva", "novo: Geison Silva" → nome Geison Silva (e novo: true quando ele disse novo). Nunca espere uma forma fixa.',
        '- opcao: quando a pergunta em aberto lista levantamentos numerados e ele escolheu um — "o 2", "o primeiro", "o último", "é o do Geronimo", "o de ontem" (compare com as datas da lista e com a data de hoje) —, o número dele na lista. Senão, omita.',
        '- novo: true SÓ quando o vendedor disse que é um levantamento novo ("novo ..."). Senão, omita.',
        '- alteracao: true quando ele pede para MUDAR um levantamento que já existe ("troca a altura", "muda a cor", "corrige"). Senão, omita.',
        '- vendedor: só quando a mensagem diz de qual VENDEDOR é o levantamento; copie o nome como foi escrito. Senão, omita.',
        '- Pergunta em aberto (quando houver, no fim): a mensagem pode ser a RESPOSTA a ela. Se o vendedor responde com um levantamento que a pergunta cita ("é o mesmo", "é esse"), ponha em `nome` o nome dele escrito como na pergunta. Se a mensagem é só o nome de um levantamento, é o nome do levantamento.',
        '- confirma: só quando a pergunta em aberto pede confirmação — true se ele confirmou ("sim", "pode", "confirmo"), false se negou. Senão, omita.',
        '- itens: as esquadrias desta mensagem, com os campos que ela diz. Um campo vale também quando o vendedor o deu para todas numa mensagem anterior ("todas brancas") ou se referiu a ele ("a mesma cor"). Numa alteração, só os campos que mudam. Não invente, não deduza.',
        '- cor_perfil: a cor do perfil que o vendedor DISSE. Se ela é uma das cores da empresa (lista abaixo), escreva-a como está na lista; se é outra, escreva-a como ele disse — o código confere e pergunta. Se ele não disse cor, NÃO preencha.',
        '- vidro: COPIE o vidro como o vendedor o escreveu nesta mensagem ("vidro 4mm" → vidro 4mm; "temperado 8mm" → temperado 8mm). NUNCA acrescente têmpera, cor ou qualquer palavra que ele não disse — nem da instrução da categoria VIDRO: "8mm" não vira "comum 8 mm" nem "temperado 8 mm". Se ele NÃO disse o vidro desta esquadria e a instrução de VIDRO define um padrão para ela, ponha o padrão em vidro_padrao, copiado da instrução; senão, omita os dois.',
        '- tipologia: o CÓDIGO (ex.: DP-02) de UMA das tipologias da lista abaixo, escolhida pela descrição. NUNCA invente código nem preencha com as palavras do vendedor. HAVENDO NATURAL, APLIQUE E NÃO PERGUNTE: o vendedor fala só quando foge do padrão, e o silêncio é a forma natural — o que ele não disse depois do tipo vale o natural (correr, janela ou porta = 2 folhas; todo o resto = 1 folha ou 1 módulo, e mais de um só se dito; sem persiana, sem bandeira, sem peitoril, sem motor, salvo se dito). Escolha a tipologia que tem exatamente o que ele disse e, no resto, o natural. Só se ainda couber em mais de uma, NÃO preencha: em `pergunta`, pergunte qual é, citando a descrição INTEIRA de cada uma, sem o código. Se não dá para concluir, NÃO preencha: em `pergunta`, pergunte em linguagem de obra o que falta (janela ou porta, como abre) — nunca "qual a tipologia".',
        '- abertura: a PALAVRA que o vendedor usou para a esquadria — "porta" (também "porta-janela" e "porta janela") ou "janela". Só se ele a escreveu; senão, omita. Porta NUNCA vira tipologia cuja descrição começa com JANELA, e janela NUNCA vira PORTA; maxim-ar e fixo servem às duas.',
        '- Os limites de cada tipologia estão na lista (largura e altura): a medida dita fora da faixa DESCARTA a tipologia; a medida que a lista não limita (sem L ou sem A) não descarta. Se nenhuma cabe, NÃO escolha a mais próxima: deixe a tipologia vazia e diga em `pergunta` que nenhuma cabe.',
        '- quantidade: só a dita. Não dita é 1 — NUNCA pergunte quantas.',
        '- ARREMATE e GUARNIÇÃO: NÃO pergunte. O padrão da tipologia já vale sem ninguém dizer. NUNCA escolha sozinho: em `escolhas`, só o arremate que o vendedor DISSE, em palavras, com o código da variável e o número da opção que corresponde (lista abaixo). Se ele pedir para ver as opções, ou quiser trocar sem dizer por qual, ponha o código da variável em `opcoes_de`.',
        ...(c.variasFamilias ? ['- familia e fornecedor: a mesma tipologia pode estar no motor de mais de uma família da empresa. SÓ o que o vendedor disse — a família, o fornecedor, ou os dois —, escrito EXATAMENTE como está na lista. NUNCA escolha sozinho.'] : []),
        '- Os códigos das variáveis (ex.: ARI), os números das opções e os códigos de fornecedor (ex.: BZ0010) são INTERNOS: nunca os escreva em `pergunta`.',
        '- NUNCA pergunte nada sobre os padrões da empresa.',
        `- fala: uma frase sua para abrir a resposta, no tom da empresa (o contexto dela, quando houver), até ${LIMITE_DA_FALA} caracteres. SEM número nenhum — nem em algarismo, nem por extenso, nem valor em reais. NÃO fale de valor, preço, cálculo ou orçamento, nem explique como o sistema funciona. Se não tiver o que dizer, omita.`,
        `- Responda SEMPRE chamando a ferramenta ${NOME_DA_FERRAMENTA}, uma vez.`,
        '',
        // a lista ENXUTA (05/11/2026): a descrição sem a linha de produto no fim, e os limites compactos — o cabeçalho diz como lê-los
        c.variasFamilias
            ? `Tipologias dos motores das famílias da empresa (código | descrição | tipo | ${LEGENDA_DOS_LIMITES} | família | fornecedor):`
            : `Tipologias do motor da família da empresa (código | descrição | tipo | ${LEGENDA_DOS_LIMITES}):`,
        ...(c.candidatos.length ? c.candidatos.map((x) => linhaDoCandidato(x, c.variasFamilias)) : ['(nenhuma)']),
        '',
        `Cores da empresa (cor_perfil): ${c.cores.length ? c.cores.join(', ') : '(nenhuma)'}`,
        '',
        'Escolhas de arremate (USO INTERNO — código = descrição: número = opção). Cada linha de opções vai UMA vez, com o número entre colchetes; a tipologia diz quais usa:',
        ...opcoesDeArremateNoPrompt(c.escolhasPorTipologia),
        // as variáveis sem padrão (06/11/2026): só quando alguma tipologia tem — nenhuma linha quando não há
        ...variaveisSemPadraoNoPrompt(c.variaveisSemPadraoPorTipologia),
        // a instrução de cada categoria preenchida (03/11/2026): nenhuma linha quando não há
        ...(c.instrucoes.length ? ['', ...blocoDasInstrucoes(c.instrucoes)] : []),
        // a instrução da etapa corrente (04/11/2026): só a da etapa que fala com o modelo, só quando preenchida — nenhuma linha quando não há
        ...(c.instrucoesDasEtapas.length ? ['', ...blocoDasInstrucoesDasEtapas(c.instrucoesDasEtapas, c.variasFamilias)] : []),
    ].join('\n')
    // o contexto da empresa vai no FIM do estável, DEPOIS do base: o que vem antes é o mesmo para toda empresa
    const estavel = c.contexto === null ? doProduto : `${doProduto}\n\n${blocoDoContexto(c.contexto).join('\n')}`
    // o VOLÁTIL (05/11/2026): o que muda a cada mensagem vem por último, fora do prefixo cacheado — a regra "Pergunta em aberto (quando houver, no fim)" é literal
    const volatil = [
        c.montagem
            ? `Levantamento em montagem: “${c.montagem.nome}”, esquadrias (null = ainda não dito): ${JSON.stringify(c.montagem.itens)}`
            : 'Levantamento em montagem: nenhum.',
        ...(c.hoje ? [`Hoje é ${c.hoje}.`] : []),
        ...(c.perguntaEmAberto ? [`Pergunta em aberto: ${c.perguntaEmAberto}`] : []),
    ].join('\n')
    return { estavel, volatil }
}

// ── A LLM ───────────────────────────────────────────────────────────────────────────────────
type ResultadoDaLlm =
    | { tipo: 'ok'; proposta: Record<string, unknown> }
    | { tipo: 'sem-saldo' | 'erro-da-llm' | 'recusa' | 'sem-proposta' | 'prazo-esgotado'; detalhe: string }

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

const tokens = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null)

/**
 * O PRAZO da 1ª chamada (dono do produto, 04/11/2026): 45 s. Medido em 03/11: 2,2 a 7,4 s nas mensagens seguintes, 11,8 e 21,2 s na
 * primeira mensagem de uma sessão; em 04/11 uma delas passou de 49 s e a função morreu aos 60 s. Estourado, o vendedor recebe
 * `FALHA_PRAZO_DA_IA` e a linha `[IA]` sai ANTES do fim do turno, com o motivo.
 */
export const PRAZO_DA_PRIMEIRA_CHAMADA_MS = 45_000

async function chamarLlm(chave: string, mensagem: string, contexto: ContextoDoPrompt, medida: MedidaDaIa, historico: readonly MensagemDoHistorico[]): Promise<ResultadoDaLlm> {
    const inicio = Date.now()
    // o prazo GERAL (45 s) vale para a chamada inteira: as tentativas e a leitura do corpo em fluxo
    const limite = prazo(PRAZO_DA_PRIMEIRA_CHAMADA_MS)
    const s = sistema(contexto)
    const corpoDoPedido = JSON.stringify({
        // O MODELO POR CONTA entraria aqui, junto do teto: hoje não há coluna para ele —
        // `orcamentista_config.modelo` é o modelo de ATENDIMENTO (ver `modelo-da-ia.ts`).
        model: MODELO_PADRAO_DA_IA,
        // o teto é o tamanho real da ferramenta mais folga (05/11/2026): era 16.000
        max_tokens: MAX_TOKENS_DA_PRIMEIRA_CHAMADA,
        // SEM `thinking` (dono do produto, 05/11/2026): o `between_tools` do #226 saiu — medido com a ferramenta sem strict, a chamada sem o
        // parâmetro respondeu em 3,7 s com ~400 tokens de saída, contra 7 s e ~700 com ele. O `effort` low fica; o teto e o cache também
        output_config: { effort: 'low' },
        // EM FLUXO (05/11/2026): os cabeçalhos chegam quando a API aceita o pedido, não quando termina de gerar
        stream: true,
        // o sistema em dois blocos: o estável marcado para o cache, o volátil depois (05/11/2026)
        system: blocosDoSistema(s.estavel, s.volatil),
        // a `fala` vale para toda empresa (03/11/2026); o filtro de número continua derrubando a que traz número
        tools: [FERRAMENTA_COM_FALA],
        tool_choice: { type: 'auto' },
        // o HISTÓRICO da conversa (03/11/2026): as últimas mensagens, já sem dinheiro e cortadas; a desta vez por último
        messages: [...historico, { role: 'user', content: mensagem }],
    })
    let r: Response | null = null
    let corpo: Record<string, unknown> | null
    // ATÉ OS CABEÇALHOS: 10 s por tentativa, duas tentativas (05/11/2026). O abort da primeira derruba o socket dela; a segunda abre outro
    for (let tentativa = 1; tentativa <= TENTATIVAS_DA_PRIMEIRA_CHAMADA; tentativa++) {
        medida.tentativas = tentativa
        const cabecalhos = prazo(PRAZO_ATE_OS_CABECALHOS_MS)
        try {
            r = await fetch(URL_DA_API_ANTHROPIC, {
                method: 'POST',
                headers: { 'content-type': 'application/json', 'x-api-key': chave, 'anthropic-version': VERSAO_DA_API_ANTHROPIC },
                // o prazo geral vale para a conexão E para a leitura do corpo; o dos cabeçalhos só até a resposta começar
                signal: AbortSignal.any([limite.signal, cabecalhos.signal]),
                body: corpoDoPedido,
            })
            cabecalhos.limpar()
            break
        } catch (e) {
            cabecalhos.limpar()
            if (limite.estourou()) { medida.ms = Date.now() - inicio; limite.limpar(); return { tipo: 'prazo-esgotado', detalhe: `limite_ms=${PRAZO_DA_PRIMEIRA_CHAMADA_MS} tentativas=${tentativa}` } }
            if (cabecalhos.estourou()) {
                if (tentativa < TENTATIVAS_DA_PRIMEIRA_CHAMADA) continue
                medida.ms = Date.now() - inicio; limite.limpar()
                return { tipo: 'prazo-esgotado', detalhe: `limite_ms=${PRAZO_DA_PRIMEIRA_CHAMADA_MS} sem_cabecalhos_ms=${PRAZO_ATE_OS_CABECALHOS_MS} tentativas=${tentativa}` }
            }
            medida.ms = Date.now() - inicio; limite.limpar()
            return { tipo: 'erro-da-llm', detalhe: `excecao=${e instanceof Error ? e.name : 'desconhecida'} tentativas=${tentativa}` }
        }
    }
    if (!r) { limite.limpar(); return { tipo: 'erro-da-llm', detalhe: 'sem-resposta' } }
    medida.cabecalhosMs = Date.now() - inicio
    medida.requestId = r.headers.get('request-id')
    if (!r.ok) {
        // o erro da API vem em JSON mesmo com stream pedido; o corpo que não é JSON segue nulo e o status decide
        corpo = (await r.json().catch((): null => null)) as Record<string, unknown> | null
    } else {
        try {
            const lido = await lerFluxo(r.body, inicio)
            medida.primeiroTokenMs = lido.primeiroTokenMs
            if (lido.mensagem.erro) {
                medida.ms = Date.now() - inicio; limite.limpar()
                const tipoDoErro = lido.mensagem.erro.type
                return { tipo: 'erro-da-llm', detalhe: `fluxo=erro tipo=${typeof tipoDoErro === 'string' ? tipoDoErro : '-'}` }
            }
            corpo = { stop_reason: lido.mensagem.stop_reason, usage: lido.mensagem.usage, content: lido.mensagem.content }
        } catch {
            medida.ms = Date.now() - inicio
            limite.limpar()
            if (limite.estourou()) return { tipo: 'prazo-esgotado', detalhe: `limite_ms=${PRAZO_DA_PRIMEIRA_CHAMADA_MS} cabecalhos_ms=${medida.cabecalhosMs} corpo=interrompido` }
            return { tipo: 'erro-da-llm', detalhe: 'fluxo=interrompido' }
        }
    }
    limite.limpar()
    medida.ms = Date.now() - inicio
    const uso = (corpo?.usage ?? null) as {
        input_tokens?: unknown; output_tokens?: unknown; cache_read_input_tokens?: unknown; cache_creation_input_tokens?: unknown
        output_tokens_details?: { thinking_tokens?: unknown } | null
    } | null
    medida.entrada = tokens(uso?.input_tokens)
    medida.saida = tokens(uso?.output_tokens)
    // o que a gente precisava para parar de adivinhar (05/11/2026): o raciocínio dentro da saída, o motivo da parada e o cache
    medida.raciocinio = tokens(uso?.output_tokens_details?.thinking_tokens)
    medida.cacheLido = tokens(uso?.cache_read_input_tokens)
    medida.cacheEscrito = tokens(uso?.cache_creation_input_tokens)
    medida.parada = typeof corpo?.stop_reason === 'string' ? corpo.stop_reason : null
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
type Levantamento = { id: string; nome: string; nome_normalizado: string; estado: string; criado_em: string; atualizado_em: string | null }
type ItemGravado = ItemDoLevantamento & { id: string }
// a família e o motor do cálculo (PR D): `tabela_id` não é lido nem escrito pela conversa desde então
const COLUNAS_DO_ITEM = `id, ordem, ${CAMPOS_DA_ESQUADRIA.join(', ')}, escolhas, familia, motor_id, ambientes, obs`

/** Os levantamentos do remetente — só dele, no tenant dele (decisão 2). */
async function lerLevantamentos(tenantId: string, remetenteId: string, soEmMontagem: boolean): Promise<Levantamento[]> {
    let q = supabaseAdmin.from('orcamentista_levantamento').select('id, nome, nome_normalizado, estado, criado_em, atualizado_em')
        .eq('tenant_id', tenantId).eq('remetente_id', remetenteId)
    if (soEmMontagem) q = q.eq('estado', EM_MONTAGEM)
    const { data, error } = await q.order('criado_em', { ascending: true })
    if (error) throw new Error(`orcamentista_levantamento: ${error.message}`)
    return (data ?? []) as Levantamento[]
}

type LevantamentoDaEmpresa = Levantamento & { remetente_id: string }

/** As formas gravadas que valem por ESTE nome: a comparável e a com o prefixo de antes (03/11/2026). */
const formasGravadasDoNome = (nome: string) => [formaComparavel(nome), `levantamento ${formaComparavel(nome)}`]

/** Os levantamentos da empresa com ESTE nome (com ou sem o prefixo de antes), de qualquer vendedor — só para o admin. */
async function lerLevantamentosDaEmpresaPeloNome(tenantId: string, nome: string): Promise<LevantamentoDaEmpresa[]> {
    const { data, error } = await supabaseAdmin.from('orcamentista_levantamento').select('id, nome, nome_normalizado, estado, remetente_id, criado_em')
        .eq('tenant_id', tenantId).in('nome_normalizado', formasGravadasDoNome(nome)).order('criado_em', { ascending: true })
    if (error) throw new Error(`orcamentista_levantamento: ${error.message}`)
    return (data ?? []) as LevantamentoDaEmpresa[]
}

/** Um levantamento da empresa pelo id, de qualquer vendedor: o da pergunta em aberto do apanhado. */
async function lerLevantamentoDaEmpresa(tenantId: string, id: string): Promise<LevantamentoDaEmpresa | null> {
    const { data, error } = await supabaseAdmin.from('orcamentista_levantamento').select('id, nome, nome_normalizado, estado, remetente_id, criado_em')
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

/**
 * A DEFINIÇÃO (as Variáveis de cada tipologia, pela família da esquadria) e o DETALHE (a descrição e a linha da tipologia, da Detalhe do motor)
 * que a folha do levantamento usa. Uma montagem só, para a conversa e para a tela dos Levantamentos I.A. (`copia-divergente.md`).
 */
function definicaoEDetalhe(tabela: FamiliasDaEmpresaLidas, variaveisPorFamilia: Record<string, Record<string, VariaveisDaTipologia>>, doCodigo: ReturnType<typeof familiasDoCodigo>) {
    const definicao: DefinicaoDaTipologia = (e) => {
        const daEsquadria = familiaDaEsquadria(e, doCodigo)
        return e.tipologia !== null && daEsquadria && 'familia' in daEsquadria ? variaveisPorFamilia[daEsquadria.familia]?.[e.tipologia] ?? null : null
    }
    // a descrição e a linha da tipologia, da Detalhe do motor (os candidatos já lidos): é o que a folha do levantamento escreve na faixa do item
    const detalhe: DetalheDaTipologia = (tipologia, familia) => {
        const d = tabela.candidatos.find((x) => x.tipologia === tipologia && (familia === null || x.familia === familia)) ?? tabela.candidatos.find((x) => x.tipologia === tipologia)
        return d ? { descricao: d.descricao, linha: d.linha, tipo: d.tipo, fornecedor: d.fornecedor } : null
    }
    return { definicao, detalhe }
}

/**
 * O ARQUIVO de um levantamento GRAVADO, para a tela dos Levantamentos I.A. (dono do produto, 11/11/2026): a MESMA folha que a conversa envia,
 * montada do que está no banco, no tenant do chamador. Só lê; nada é gravado nem enviado. A recusa vem nomeada (a configuração que falta, o
 * levantamento que não é da empresa, a folha que não fecha).
 */
export async function arquivoDoLevantamentoGravado(tenantId: string, levantamentoId: string): Promise<FolhaGerada | FolhaRecusada> {
    const contexto = await contextoDaFolhaDaEmpresa(tenantId)
    if ('recusa' in contexto) return { ok: false, recusas: [contexto.recusa] }
    const itens = await lerItens(tenantId, levantamentoId)
    return (await gerarArquivoDoLevantamento({ tenantId, levantamentoId, itens, definicao: contexto.definicao, detalhe: contexto.detalhe })).folha
}

/**
 * A DEFINIÇÃO e o DETALHE da tipologia na empresa, montados como a conversa os monta (`definicaoEDetalhe`): o que o arquivo do levantamento e o
 * arquivo do ORÇAMENTO (11/11/2026) escrevem por item — a descrição, o tipo, a linha, o fornecedor, as variáveis ditas e a cor do acessório.
 * Só lê. A configuração que falta volta como a frase que a nomeia.
 */
export async function contextoDaFolhaDaEmpresa(tenantId: string): Promise<{ definicao: DefinicaoDaTipologia; detalhe: DetalheDaTipologia } | { recusa: string }> {
    const tabela = await lerFamiliasDaEmpresa(tenantId)
    if ('frase' in tabela) return { recusa: tabela.frase }
    const variaveisLidas = await Promise.all(tabela.familias.map(async (f) => [f.familia, await lerVariaveisDasTipologias(f.levantamento.id)] as const))
    return definicaoEDetalhe(tabela, Object.fromEntries(variaveisLidas), familiasDoCodigo(tabela))
}

async function lerItens(tenantId: string, levantamentoId: string): Promise<ItemGravado[]> {
    const { data, error } = await supabaseAdmin.from('orcamentista_levantamento_item').select(COLUNAS_DO_ITEM)
        .eq('tenant_id', tenantId).eq('levantamento_id', levantamentoId).order('ordem', { ascending: true })
    if (error) throw new Error(`orcamentista_levantamento_item: ${error.message}`)
    // a lista de colunas é montada em tempo de execução: o tipo gerado do supabase não a lê
    // o `null` de uma variável é a marca de que o vendedor pediu as opções: ele é preservado
    return ((data ?? []) as unknown as ItemGravado[]).map((i) => ({
        ...i, escolhas: i.escolhas ? lerEscolhasDoItem(i.escolhas) : null,
        // os ambientes e a obs (20261106000002): nulo é "não informado"; a lista vazia não existe (a CHECK do banco a recusa)
        ambientes: Array.isArray(i.ambientes) && i.ambientes.length ? i.ambientes : null, obs: typeof i.obs === 'string' && i.obs.trim() ? i.obs : null,
    }))
}

const camposDoItem = (i: ItemDoLevantamento) => ({
    ordem: i.ordem, tipologia: i.tipologia, largura_mm: i.largura_mm, altura_mm: i.altura_mm, quantidade: i.quantidade,
    cor_perfil: i.cor_perfil, vidro: i.vidro, escolhas: i.escolhas,
    // a família e o motor que a calcula (PR D, dono do produto, 02/11/2026); a exigida acompanha o motor, pelas CHECKs da tabela
    familia: i.familia, motor_id: i.motor_id, motor_familia_exigida: i.motor_id ? i.familia : null,
    // os ambientes e a obs (06/11/2026): o ausente é nulo, nunca a lista vazia
    ambientes: i.ambientes && i.ambientes.length ? i.ambientes : null, obs: i.obs ?? null,
})
/** A esquadria como vai ao prompt: sem a família e o motor gravados, que são internos (a família a IA vê na lista). */
// derivada de `camposDoItem`, e não uma segunda lista de campos: um campo novo da esquadria chega aos dois (`copia-divergente.md`)
const camposParaOPrompt = (i: ItemDoLevantamento): Omit<ItemDoLevantamento, 'familia' | 'motor_id'> => {
    const campos: Partial<ItemDoLevantamento> & { motor_familia_exigida?: unknown } = camposDoItem(i)
    delete campos.familia
    delete campos.motor_id
    delete campos.motor_familia_exigida
    return campos as Omit<ItemDoLevantamento, 'familia' | 'motor_id'>
}

/**
 * O fornecedor ou a família que a IA pôs vale SÓ se o vendedor o disse: uma palavra do nome, de 3 letras ou
 * mais, está na mensagem (sem caixa e sem acento). "é da Wolff" diz "Wolff Perfis", "a de PVC" diz "PVC";
 * "pode ser o primeiro" não diz nenhum — e a pergunta não se responde pela IA.
 */
export function ditoNaMensagem(nome: unknown, texto: string): boolean {
    if (typeof nome !== 'string') return false
    const palavrasDoTexto = new Set(normalizarNome(texto).split(/[^a-z0-9]+/))
    return normalizarNome(nome).split(/[^a-z0-9]+/).some((p) => p.length >= 3 && palavrasDoTexto.has(p))
}

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
    /** As colunas do levantamento que esta mensagem muda (os dados do cliente, as condições e o vendedor, 20261106000002); vazio, nenhuma. */
    colunas: Record<string, unknown> = {},
): Promise<string> {
    const agora = new Date().toISOString()
    let id: string
    let antes: ItemGravado[] = []
    if (existente) {
        id = existente.id
        antes = existente.itens
        const { data, error } = await supabaseAdmin.from('orcamentista_levantamento').update({ estado, atualizado_em: agora, ...colunas })
            .eq('id', id).eq('tenant_id', tenantId).eq('remetente_id', donoId).select('id')
        if (error) throw new ErroAoGravar(`orcamentista_levantamento: ${error.message}`)
        // R1: update que não atinge linha é ERRO — nunca vira "pergunta de novo"
        if ((data ?? []).length !== 1) throw new ErroAoGravar(`orcamentista_levantamento: o update atingiu ${(data ?? []).length} linha(s), e devia atingir 1`)
    } else {
        const { data, error } = await supabaseAdmin.from('orcamentista_levantamento')
            .insert({ tenant_id: tenantId, remetente_id: donoId, nome, nome_normalizado: normalizarNome(nome), estado, ...colunas })
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
    // o AGRUPAMENTO (03/11/2026) pode fundir uma esquadria gravada em outra: a linha que não voltou sai — e o DELETE confere quantas
    // atingiu (R1), como o update. É o único DELETE da conversa fora da pergunta em aberto.
    const sumiram = antes.filter((a) => !itens.some((i) => i.ordem === a.ordem))
    if (sumiram.length) {
        const { data: apagados, error } = await supabaseAdmin.from('orcamentista_levantamento_item').delete()
            .in('id', sumiram.map((a) => a.id)).eq('tenant_id', tenantId).eq('levantamento_id', id).select('id')
        if (error) throw new ErroAoGravar(`orcamentista_levantamento_item: ${error.message}`)
        if ((apagados ?? []).length !== sumiram.length) throw new ErroAoGravar(`orcamentista_levantamento_item: o delete atingiu ${(apagados ?? []).length} linha(s), e devia atingir ${sumiram.length}`)
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
/** O PRAZO do envio ao WUZAPI (04/11/2026): o envio que não volta não pode segurar o turno até a Vercel o matar sem log. */
export const PRAZO_DO_ENVIO_MS = 30_000
type Envio = { ok: boolean; id: string | null; status: number | null; prazoEsgotado: boolean }
/** O que o log diz do envio que falhou: o status HTTP, `prazo_esgotado`, ou `sem resposta` (a falha de rede). */
const statusDoEnvio = (e: Envio) => (e.status !== null ? String(e.status) : e.prazoEsgotado ? 'prazo_esgotado' : 'sem resposta')

async function enviarTexto(token: string, telefone: string, texto: string): Promise<Envio> {
    const limite = prazo(PRAZO_DO_ENVIO_MS)
    try {
        const r = await fetch(`${wuzapi()}/chat/send/text`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', token },
            signal: limite.signal,
            body: JSON.stringify({ Phone: telefone, Body: texto }),
        })
        const corpo = (await r.json().catch((): null => null)) as { data?: { Id?: unknown } } | null
        const id = typeof corpo?.data?.Id === 'string' ? corpo.data.Id : null
        return { ok: r.ok, id, status: r.status, prazoEsgotado: false }
    } catch {
        return { ok: false, id: null, status: null, prazoEsgotado: limite.estourou() }
    } finally {
        limite.limpar()
    }
}

/**
 * O DOCUMENTO pelo WUZAPI (06/11/2026): `POST /chat/send/document`, header `token`, corpo `{ Phone, FileName, Document }` com o PDF em base64 —
 * o mesmo caminho de `sendWuzapiDocument` em `src/lib/wuzapi-send.ts`, que é a referência (o prefixo `data:application/octet-stream;base64,`).
 */
export async function enviarDocumento(token: string, telefone: string, nomeDoArquivo: string, pdf: Uint8Array): Promise<Envio> {
    const limite = prazo(PRAZO_DO_ENVIO_MS)
    try {
        const r = await fetch(`${wuzapi()}/chat/send/document`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', token },
            signal: limite.signal,
            body: JSON.stringify({ Phone: telefone, FileName: nomeDoArquivo, Document: `data:application/octet-stream;base64,${Buffer.from(pdf).toString('base64')}` }),
        })
        const corpo = (await r.json().catch((): null => null)) as { data?: { Id?: unknown } } | null
        const id = typeof corpo?.data?.Id === 'string' ? corpo.data.Id : null
        return { ok: r.ok, id, status: r.status, prazoEsgotado: false }
    } catch {
        return { ok: false, id: null, status: null, prazoEsgotado: limite.estourou() }
    } finally {
        limite.limpar()
    }
}

/**
 * A pergunta com TODAS as pendências (03/11/2026); o texto da LLM só quando é sobre o MESMO campo que o código pôs em primeiro, e aí
 * ele entra no lugar da pergunta fixa daquele campo — o resto do que falta vem junto.
 */
function perguntaPara(ps: readonly Pendencia[], nItens: number, proposta: Record<string, unknown>, jaDito?: JaDito): string {
    const fixa = perguntaDasPendencias(ps, nItens, null, jaDito)
    const p = ps[0]
    if (!p || !('campo' in p)) return fixa
    const q = proposta.pergunta && typeof proposta.pergunta === 'object' ? (proposta.pergunta as { campo?: unknown; texto?: unknown }) : {}
    const t = typeof q.texto === 'string' ? q.texto.trim() : ''
    // o que chega ao vendedor não traz código de fornecedor (26/10/2026): a reformulação que traz vai para a fixa
    if (q.campo !== p.campo || t === '' || t.length > 500 || CODIGO_DE_FORNECEDOR.test(t)) return fixa
    // a reformulação que traz DINHEIRO também vai para a fixa: o número é do código (para toda empresa, desde o prompt base)
    if (temDinheiro(t)) return fixa
    return perguntaDasPendencias(ps, nItens, t, jaDito)
}

// ── A PERGUNTA EM ABERTO DO ROTEAMENTO PELO NOME (`pergunta-em-aberto.ts`) ──────────────────
/** A pergunta guardada, com os levantamentos que ela cita relidos e o texto refeito pelo código. */
type PerguntaRefeita = {
    p: PerguntaEmAberto; citados: Levantamento[]; texto: string
    /** O que vai ao prompt no lugar de `texto`, quando a IA precisa de mais do que o vendedor viu (a lista do resgate, na confirmação). */
    paraOPrompt?: string
    /** Na CONFIRMAR_APANHADO: o levantamento do apanhado, com o dono — o admin confirma o de outro vendedor. */
    doApanhado?: LevantamentoDaEmpresa
}

/**
 * Refaz o texto da pergunta guardada, a partir das colunas — nunca de um texto guardado. Os citados são
 * os que ainda existem; a pergunta que cita levantamento e não acha nenhum não vale mais (null).
 */
async function refazerPergunta(
    tenantId: string, p: PerguntaEmAberto, doRemetente: Levantamento[], definicao: DefinicaoDaTipologia, detalhe: DetalheDaTipologia,
): Promise<PerguntaRefeita | null> {
    const citados = p.levantamentos.map((id) => doRemetente.find((l) => l.id === id)).filter((l): l is Levantamento => !!l)
    if (p.pergunta === 'SEM_NOME') return { p, citados, texto: FRASE_SEM_NOME }
    if (p.pergunta !== 'CONFIRMAR_APANHADO' && citados.length === 0) return null
    if (p.pergunta === 'NOME_PARECIDO') return p.nome ? { p, citados: opcoesDeResgate(citados), texto: fraseDoNomeParecido(p.nome, opcoesDeResgate(citados)) } : null
    // a CONFIRMAÇÃO DO RESGATE (03/11/2026): CONFIRMAR_ACRESCIMO com nome; o escolhido é o primeiro citado — se ele sumiu, a pergunta não vale mais
    if (p.pergunta === 'CONFIRMAR_ACRESCIMO' && p.nome !== null) {
        const escolhido = citados.find((l) => l.id === p.levantamentos[0])
        if (!escolhido) return null
        const lista = opcoesDeResgate(citados)
        return { p, citados: [escolhido, ...lista.filter((l) => l.id !== escolhido.id)], texto: fraseDeConfirmarResgate(escolhido), paraOPrompt: `${fraseDeConfirmarResgate(escolhido)} (Os levantamentos parecidos com “${p.nome}” eram: ${lista.map(linhaDoResgate).join('; ')}.)` }
    }
    // o ARQUIVO enviado espera o "sim" (06/11/2026): o texto da pergunta é o RESUMO da folha refeita do levantamento como está gravado — vai
    // ao prompt no lugar do PDF, e é por ele que se sabe que uma mensagem não mudou nada. Achado pelo id na EMPRESA, e não entre os do
    // remetente: o admin que alterou o de outro vendedor também confirma (26/10/2026)
    if (p.pergunta === 'CONFIRMAR_APANHADO') {
        const doApanhado = p.levantamentos[0] ? await lerLevantamentoDaEmpresa(tenantId, p.levantamentos[0]) : null
        if (!doApanhado) return null
        const dados = await dadosDaFolhaGravada(tenantId, doApanhado.id, definicao, detalhe)
        if (!dados) return null
        return { p, citados: [doApanhado], doApanhado, texto: resumoDoArquivo(dados), paraOPrompt: resumoDoArquivoParaOPrompt(dados) }
    }
    if (citados.length === 0) return null
    if (p.itens.length === 0) return null
    const nExistentes = (await lerItens(tenantId, citados[0].id)).length
    return { p, citados: [citados[0]], texto: fraseDeConfirmarAcrescimo(citados[0].nome, nExistentes, p.itens) }
}

/**
 * A folha do levantamento como está GRAVADO, sem a data de geração: o resumo dela é a DEFINIÇÃO — o que o vendedor confere e confirma. É por ela
 * que se sabe que uma mensagem não mudou o arquivo, e se o "sim" já dado continua valendo (08/11/2026). Null quando o levantamento não se lê.
 */
async function dadosDaFolhaGravada(tenantId: string, levantamentoId: string, definicao: DefinicaoDaTipologia, detalhe: DetalheDaTipologia) {
    const [doArquivo, empresa, itens] = await Promise.all([lerLevantamentoDoArquivo(tenantId, levantamentoId), lerNomeDaEmpresa(tenantId), lerItens(tenantId, levantamentoId)])
    if (!doArquivo) return null
    const doVendedor = await lerPerfilDoVendedor(tenantId, doArquivo.vendedor_employee_id)
    return montarDadosDaFolha({ empresa: empresa ?? '', levantamento: doArquivo, itens, definicao, detalhe, geradoEm: new Date(0), doVendedor })
}

/** O nome que não está no texto vale SÓ se for um dos que a pergunta em aberto citou ("é o mesmo"). */
function nomeDaPergunta(nome: unknown, aberta: PerguntaRefeita): string | null {
    if (typeof nome !== 'string' || !nome.trim()) return null
    const forma = formaComparavel(nome)
    const citado = aberta.citados.find((l) => formaComparavel(l.nome_normalizado) === forma)
    if (citado) return citado.nome
    return aberta.p.nome && formaComparavel(aberta.p.nome) === forma ? aberta.p.nome : null
}

function marcaDoNome(nome: unknown, noTexto: string | null, naPergunta: string | null, doCliente: string | null): MarcaDoNome {
    if (noTexto !== null) return 'veio'
    if (naPergunta !== null) return 'da_pergunta'
    if (doCliente !== null) return 'do_cliente'
    return typeof nome !== 'string' || !nome.trim() ? 'faltou' : 'fora_do_texto'
}

/** A pergunta em aberto é do resgate: a lista (NOME_PARECIDO) ou a confirmação dela (CONFIRMAR_ACRESCIMO com nome). */
const ehResgate = (p: PerguntaEmAberto) => p.pergunta === 'NOME_PARECIDO' || (p.pergunta === 'CONFIRMAR_ACRESCIMO' && p.nome !== null)
/** O levantamento que a `opcao` da ferramenta aponta na lista numerada: um inteiro de 1 a N; o resto não aponta nada. */
function opcaoDaLista<L>(opcao: unknown, lista: readonly L[]): L | null {
    return typeof opcao === 'number' && Number.isInteger(opcao) && opcao >= 1 && opcao <= lista.length ? lista[opcao - 1] : null
}

// ── A CONVERSA ──────────────────────────────────────────────────────────────────────────────
export type Interlocutor = {
    tenantId: string; remetenteId: string; telefone: string; texto: string; wuzapiToken: string
    /** A conversa gravada (03/11/2026): a conversa do remetente e a entrada desta mensagem, já gravada pela rota. */
    conversaId: string
    entrada: Entrada
}

/** Conduz uma mensagem do vendedor. NUNCA lança: toda falha vira uma linha `[IA]`. */
export async function conduzirMensagem(c: Interlocutor): Promise<DesfechoDaIa> {
    const rastro: Rastro = {
        etapas: { coletar: null, casar: null, montar: null, calcular: null },
        levantamento: '-', rota: '-', propostos: 0, descartados: 0, enviou: false, admin: null, nome: '-', aberta: '-', ia: { ms: null, entrada: null, saida: null, raciocinio: null, parada: null, cacheLido: null, cacheEscrito: null, cabecalhosMs: null, primeiroTokenMs: null, tentativas: null, requestId: null },
        contexto: '-', fala: '-', instrucoes: '-', instrucoesDasEtapas: '-', instrucoesSemEfeito: '', fundidos: 0, caminhos: [], reenviadas: 0, historico: '-', gravacao: '-', redacao: '-', vidrosNaoDitos: 0, vidrosPodados: 0, vidrosPadrao: 0, lista: '-', trechos: 0, trechosSemCandidata: 0, itensSemCampos: 0, montagem: '-', coresPadrao: 0, tipologiasPadrao: 0,
    }
    const fim = (desfecho: DesfechoDaIa, detalhe = ''): DesfechoDaIa => { anotar(rastro, desfecho, detalhe); return desfecho }
    // a fala da IA, já filtrada: abre a resposta do código. Sem contexto, ou com o filtro disparado, não há
    let abertura: string | null = null
    // o histórico da conversa (03/11/2026): lido antes da IA; a última saída é com o que a resposta de agora não pode coincidir
    let historico: MensagemDoHistorico[] = []
    let ultimaSaida: string | null = null
    let blocoDaEmpresa: string | null = null
    /** A saída é GRAVADA depois de enviada, com o id do envio (ou nulo, quando falhou). A gravação nunca derruba a resposta: só o log. */
    const gravar = async (texto: string, idDoEnvio: string | null) => {
        try {
            rastro.gravacao = (await gravarSaida(c.tenantId, c.conversaId, c.entrada.id, texto, idDoEnvio)) === 'gravada' ? 'sim' : 'sem_migracao'
        } catch (e) {
            rastro.gravacao = 'falhou'
            console.error(`${PREFIXO_DO_LOG_DA_IA} a saida nao foi gravada: ${e instanceof Error ? e.message : 'erro desconhecido'}`)
        }
    }
    const responder = async (textoDaResposta: string, desfecho: DesfechoDaIa, detalhe = '', comAbertura = true): Promise<DesfechoDaIa> => {
        const texto = comAbertura && abertura ? `${abertura}\n\n${textoDaResposta}` : textoDaResposta
        const envio = await enviarTexto(c.wuzapiToken, c.telefone, texto)
        await gravar(texto, envio.ok ? envio.id : null)
        if (!envio.ok) return fim('envio-falhou', `status_envio=${statusDoEnvio(envio)}${detalhe ? ` ${detalhe}` : ''}`)
        rastro.enviou = true
        return fim(desfecho, detalhe)
    }
    /**
     * A frase do MODELO (03/11/2026): o rascunho é a frase fixa de sempre, com o conteúdo obrigatório; o modelo a redige com a
     * personalidade e o histórico; o código valida (`redacaoValida`) e, se não passar, manda o rascunho. A redação já é a resposta
     * inteira: a `fala` não a antecede. A mesma resposta nunca sai duas vezes seguidas: a igual à última saída cai na validação.
     */
    const falar = async (rascunho: string, desfecho: DesfechoDaIa, detalhe = ''): Promise<DesfechoDaIa> => {
        const chave = process.env.ANTHROPIC_API_KEY
        const r: Redacao = chave ? await redigir(chave, rascunho, { blocoDaEmpresa, historico, mensagem: c.texto, ultimaSaida }) : { texto: null, motivo: 'erro' }
        rastro.redacao = r.motivo
        if (r.texto !== null) return await responder(r.texto, desfecho, detalhe, false)
        return await responder(rascunho, desfecho, `${detalhe}${ultimaSaida !== null && rascunho === ultimaSaida ? `${detalhe ? ' ' : ''}repetida=sim` : ''}`)
    }
    // em que ponto a falha aconteceu decide a frase: antes de gravar, ao gravar, ou depois
    let gravando = false
    let gravado = false
    try {
        // O REENVIO DO WUZAPI (03/11/2026): a entrada já estava gravada. Com a saída enviada, 200 sem conduzir nem reenviar; com a saída
        // sem id de envio (o envio falhou de fato), só o reenvio do texto gravado; sem saída, em voo (a primeira ainda roda) não se faz
        // nada — e mais velha que a janela, a primeira morreu, e a mensagem é conduzida de novo
        if (c.entrada.repetida) {
            const saida = await saidaDaEntrada(c.tenantId, c.entrada.id)
            if (saida === 'sem_migracao') return fim('repetida', 'gravacao=sem_migracao')
            if (saida && saida.enviada) return fim('repetida')
            if (saida) {
                const envio = await enviarTexto(c.wuzapiToken, c.telefone, saida.texto)
                if (!envio.ok) return fim('envio-falhou', `status_envio=${statusDoEnvio(envio)} reenvio=sim`)
                rastro.enviou = true
                if (envio.id) await marcarEnvio(c.tenantId, saida.id, envio.id)
                return fim('reenviada')
            }
            const idade = Date.now() - new Date(c.entrada.criadoEm).getTime()
            if (idade < JANELA_EM_VOO_MS) return fim('repetida', 'em_voo=sim')
        }
        const chave = process.env.ANTHROPIC_API_KEY
        if (!chave) return await responder(FALHA_SEM_CHAVE, 'sem-chave')

        // O TETO DE CONSUMO entraria aqui, ANTES da chamada (dono do produto, 22/10/2026: não agora).

        // Sem a lista de tipologias não há de onde a IA escolher, nem com o que calcular: a conversa
        // diz o que falta, sem chamar a LLM.
        // a falta de configuração (família, etapa, motor, tabela de preço) volta com a frase que a nomeia (PR D)
        // AS LEITURAS INDEPENDENTES VÃO JUNTAS (dono do produto, 04/11/2026): medido em produção, as 24 leituras em série antes do modelo
        // custavam 5 a 8 s por turno. Primeira onda: o que só depende da conta e da conversa. A ordem das RESPOSTAS continua a de antes.
        const [tabela, perfil, emMontagemLidos, contexto, lido, instrucoes] = await Promise.all([
            lerFamiliasDaEmpresa(c.tenantId),
            // as cores do Perfil e a cor PREDOMINANTE da base (05/11/2026): a cor não dita é ela
            lerPerfilDaEmpresa(c.tenantId),
            lerLevantamentos(c.tenantId, c.remetenteId, true),
            // o contexto da empresa: vazio (ou a tabela ausente) é o pedido de hoje
            lerContextoDoAtendimento(c.tenantId),
            // o histórico da conversa (03/11/2026): as últimas mensagens, sem dinheiro, e a última saída como foi enviada
            lerHistorico(c.tenantId, c.conversaId, c.entrada.id),
            // a instrução de cada categoria preenchida (03/11/2026)
            lerInstrucoesDaEmpresa(c.tenantId),
        ] as const)
        if ('frase' in tabela) return await responder(tabela.frase, 'sem-tipologias', `motivo=${tabela.motivo}${tabela.detalhe ? ` ${tabela.detalhe}` : ''}`)
        const doCodigo = familiasDoCodigo(tabela)
        const variasFamilias = tabela.familias.length > 1
        // a instrução escrita numa etapa que não fala com o modelo não tem efeito: o log diz qual (04/11/2026)
        rastro.instrucoesSemEfeito = tabela.familias.flatMap((f) => f.instrucoesSemEfeito.map((i) => `${i.numero}:${i.acao}:${i.caracteres}`)).join(',')
        const cores = perfil.cores
        const corPredominante = perfil.corPredominante
        // A MONTAGEM EXPIRA EM 24 H (dono do produto, 05/11/2026), como a pergunta em aberto: a que ficou mais de 24 h sem toque não captura
        // a mensagem de hoje — fica no banco como está, alcançável pelo nome. A linha [IA] diz `montagem=expirada`
        // Pode haver VÁRIAS em montagem do mesmo remetente (20261105000001): a mensagem sem nome cai na mais recentemente tocada
        const agora = new Date()
        const toque = (l: Levantamento) => Date.parse(l.atualizado_em ?? l.criado_em) || 0
        const montagensVivas = emMontagemLidos.filter((l) => !montagemExpirou(l.atualizado_em, l.criado_em, agora)).sort((a, b) => toque(b) - toque(a))
        if (emMontagemLidos.length > 0 && montagensVivas.length === 0) rastro.montagem = 'expirada'
        const [emMontagem] = montagensVivas
        // Segunda onda: o que depende da família ou da montagem. As Variáveis de cada tipologia, POR FAMÍLIA, do motor do LEVANTAMENTO dela
        // (a etapa com GERAR_LEVANTAMENTO), por motor_id; os itens da montagem; e a pergunta em aberto do roteamento pelo nome — só fora da
        // montagem, que guarda a sua no levantamento — com os levantamentos do remetente que ela cita
        const [variaveisLidas, itensDaMontagem, pergunta] = await Promise.all([
            Promise.all(tabela.familias.map(async (f) => [f.familia, await lerVariaveisDasTipologias(f.levantamento.id)] as const)),
            emMontagem ? lerItens(c.tenantId, emMontagem.id) : Promise.resolve([] as ItemGravado[]),
            // lida também na montagem (05/11/2026): a mensagem que traz OUTRO cliente, ou "novo", sai da montagem e aí a pergunta vale
            (async (): Promise<{ lida: PerguntaEmAberto | null | 'ausente' | 'expirada'; valida: PerguntaEmAberto | null; doRemetente: Levantamento[] | null }> => {
                const lida = await lerPerguntaEmAberto(c.tenantId, c.remetenteId)
                // a pergunta que VALE nesta mensagem — a guarda única: a 'ausente' não existe, e a 'expirada' (mais de 24 h, 05/11/2026) é como
                // se não houvesse; nada dela vai ao modelo, e os levantamentos que ela cita não são lidos
                const valida = lida !== null && lida !== 'ausente' && lida !== 'expirada' ? lida : null
                const doRemetente = valida ? await lerLevantamentos(c.tenantId, c.remetenteId, false) : null
                return { lida, valida, doRemetente }
            })(),
        ] as const)
        const { definicao, detalhe } = definicaoEDetalhe(tabela, Object.fromEntries(variaveisLidas), doCodigo)
        // TODAS as pendências da montagem (03/11/2026): a pergunta em aberto é uma só, e cobre todas
        const pendenciasAbertas = emMontagem ? pendenciasDoLevantamento(itensDaMontagem, definicao, doCodigo) : []
        const pendenciaAberta = pendenciasAbertas[0] ?? null
        // a montagem sem pendência de esquadria que ficou esperando as CONDIÇÕES COMERCIAIS (06/11/2026): a pergunta delas é a pergunta em aberto
        let perguntaDasCondicoesAberta: string | null = null
        if (emMontagem && !pendenciaAberta && itensDaMontagem.length > 0) {
            const doArquivo = await lerLevantamentoDoArquivo(c.tenantId, emMontagem.id)
            const homonimosAbertos = doArquivo?.vendedor_nome && !doArquivo.vendedor_employee_id ? (await funcionariosPeloNome(c.tenantId, doArquivo.vendedor_nome, normalizarNome)).ativos : []
            if (homonimosAbertos.length > 1 && doArquivo?.vendedor_nome) perguntaDasCondicoesAberta = fraseDosHomonimos(doArquivo.vendedor_nome, homonimosAbertos)
            else if (doArquivo && !doArquivo.vendedor_nome) perguntaDasCondicoesAberta = FRASE_FALTA_O_VENDEDOR
            else if (doArquivo) {
                const r = condicoesComOCadastro(doArquivo, await lerPerfilDoVendedor(c.tenantId, doArquivo.vendedor_employee_id))
                if (r.faltam.length) perguntaDasCondicoesAberta = perguntaDasCondicoes(r.faltam, doArquivo.vendedor_nome)
            }
        }
        const lida = pergunta?.lida ?? null
        const marcaDaAberta: Rastro['aberta'] = lida === 'ausente' || lida === 'expirada' ? lida : lida ? lida.pergunta : '-'
        // sem a tabela (migração pendente), nada se grava nela; com a linha lá (válida OU expirada), ela é apagada quando se resolve
        const guardaLida = lida !== 'ausente'
        const temLinhaLida = lida !== null && lida !== 'ausente'
        const valida = pergunta?.valida ?? null
        const doRemetente: Levantamento[] | null = pergunta?.doRemetente ?? null
        const abertaLida = valida && doRemetente ? await refazerPergunta(c.tenantId, valida, doRemetente, definicao, detalhe) : null
        // NA MONTAGEM a pergunta do roteamento não vale (ela guarda a sua no levantamento) — até a mensagem sair da montagem (abaixo)
        let aberta = emMontagem ? null : abertaLida
        let guardaPergunta = emMontagem ? false : guardaLida
        let temLinha = emMontagem ? false : temLinhaLida
        rastro.aberta = emMontagem ? '-' : marcaDaAberta

        // PORTA × JANELA (03/11/2026): a palavra DESTA mensagem continua valendo para a recusa da tipologia proposta (`aplicarProposta`)
        const aberturaDaMensagem = aberturaDita(c.texto)
        // A LISTA PELO ACUMULADO (dono do produto, 05/11/2026): as mensagens do vendedor na conversa mais esta, trecho a trecho — porta ou
        // janela E o tipo do motor (correr, maxim-ar, giro…); o trecho sem candidata traz a lista inteira. Só a lista do prompt: a validação
        // da tipologia proposta continua contra a lista inteira (`tipologias-candidatas.ts`)
        const acumulado = [...lido.mensagens.filter((m) => m.role === 'user').map((m) => m.content), c.texto]
        const filtro = filtrarPeloAcumulado(tabela.candidatos, acumulado)
        const candidatosDoPrompt = filtro.candidatos
        rastro.lista = `${candidatosDoPrompt.length}/${tabela.candidatos.length}`
        rastro.trechos = filtro.trechos
        rastro.trechosSemCandidata = filtro.semCandidata
        const escolhasPorTipologia = tabela.candidatos.flatMap((x) => {
            const def = definicao({ tipologia: x.tipologia, familia: x.familia })
            const linhas = def ? escolhasParaOPrompt(def) : []
            return linhas.length ? [{ tipologia: variasFamilias ? `${x.tipologia} de ${x.rotulo}` : x.tipologia, linhas }] : []
        })
        const variaveisSemPadraoPorTipologia = tabela.candidatos.flatMap((x) => {
            const def = definicao({ tipologia: x.tipologia, familia: x.familia })
            const linhas = def ? variaveisSemPadraoParaOPrompt(def) : []
            return linhas.length ? [{ tipologia: variasFamilias ? `${x.tipologia} de ${x.rotulo}` : x.tipologia, linhas }] : []
        })
        // o contexto, o histórico e as instruções já lidos na primeira onda: o rastro só os anota com a lista de tipologias em mãos
        rastro.contexto = contexto.estado
        blocoDaEmpresa = contexto.texto === null ? null : blocoDoContexto(contexto.texto).join('\n')
        historico = lido.mensagens
        ultimaSaida = lido.ultimaSaida
        rastro.historico = historico.length
        rastro.instrucoes = instrucoes.estado === 'sem_migracao' ? 'sem_migracao' : String(instrucoes.instrucoes.length)
        // a instrução da etapa corrente de cada família (04/11/2026): só a de GERAR_LEVANTAMENTO, só preenchida
        const instrucoesDasEtapas = tabela.familias.flatMap((f) => (f.instrucaoDoLevantamento ? [f.instrucaoDoLevantamento] : []))
        rastro.instrucoesDasEtapas = instrucoesDasEtapas.length
        const resposta = await chamarLlm(chave, c.texto, {
            contexto: contexto.texto, instrucoes: instrucoes.instrucoes, instrucoesDasEtapas,
            candidatos: candidatosDoPrompt, variasFamilias, cores, escolhasPorTipologia, variaveisSemPadraoPorTipologia,
            montagem: emMontagem ? { nome: emMontagem.nome, itens: itensDaMontagem.map(camposParaOPrompt) } : null,
            perguntaEmAberto: pendenciaAberta ? perguntaDasPendencias(pendenciasAbertas, itensDaMontagem.length, null, filtro.jaDito)
                : perguntaDasCondicoesAberta ?? aberta?.paraOPrompt ?? aberta?.texto ?? null,
            hoje: !pendenciaAberta && aberta && ehResgate(aberta.p) ? dataBR(new Date().toISOString()) : null,
        }, rastro.ia, historico)
        if (resposta.tipo !== 'ok') {
            rastro.etapas.coletar = `historico=${rastro.historico} ia=${resposta.tipo} faltou=ia`
            // o prazo estourou (04/11/2026): a linha [IA] sai AGORA, antes de qualquer envio — se a função morrer depois, o motivo já está no log
            if (resposta.tipo === 'prazo-esgotado') anotar(rastro, 'prazo-esgotado', `${resposta.detalhe} antes_do_envio=sim`)
            // DEFEITO 3: o vendedor sempre fica sabendo — sem detalhe técnico
            const frase = resposta.tipo === 'sem-saldo' ? FALHA_SEM_SALDO : resposta.tipo === 'recusa' ? FALHA_RECUSA : resposta.tipo === 'prazo-esgotado' ? FALHA_PRAZO_DA_IA : FALHA_DA_IA
            return await responder(frase, resposta.tipo, resposta.detalhe)
        }
        const proposta = resposta.proposta
        // OS DADOS DO LEVANTAMENTO (06/11/2026): o cliente, as condições, o vendedor, e os ambientes e a obs de cada item — só o que foi DITO NESTA
        // mensagem (`dados-do-levantamento.ts`); o que não passa cai, e a proposta segue com o resto
        const dadosDaMensagem = lerDadosDaMensagem(proposta, c.texto)
        // A MONTAGEM NÃO ABSORVE OUTRO CLIENTE (dono do produto, 05/11/2026): "Cliente: Maria Cristina" virou levantamento "Jorge Koss" porque
        // a rota MONTAGEM decidia antes de ler o nome. Agora o nome/cliente da mensagem é lido também aqui: um cliente DIFERENTE do levantamento
        // em montagem, ou o pedido de "novo", tira a mensagem da montagem e ela segue o roteamento pelo nome (novo, ou o existente que ela cita)
        const nomeNaMensagem = nomeDaMensagem(proposta.nome, c.texto) ?? nomeDoCliente(proposta, c.texto)
        const outroCliente = emMontagem !== undefined && nomeNaMensagem !== null && normalizarNome(nomeSemPrefixo(nomeNaMensagem)) !== normalizarNome(emMontagem.nome)
        const pedeNovo = emMontagem !== undefined && proposta.novo === true
        const saiDaMontagem = outroCliente || pedeNovo
        if (saiDaMontagem) {
            rastro.montagem = pedeNovo ? 'novo' : 'outro_cliente'
            aberta = abertaLida
            guardaPergunta = guardaLida
            temLinha = temLinhaLida
            rastro.aberta = marcaDaAberta
        }
        // a fala abre a resposta de TODA empresa (03/11/2026), filtrada: a que traz número cai
        const fala = falaValida(proposta.fala)
        rastro.fala = fala.motivo
        abertura = fala.fala
        const confirma = proposta.confirma === true ? true : proposta.confirma === false ? false : null
        // o fornecedor e a família que o vendedor NÃO disse saem da proposta: a pergunta de qual família não se responde pela IA.
        // O VIDRO também (04/11/2026): "copiado, nunca completado" — a palavra que não está na mensagem veio da instrução e cai; o que está fica
        // ("pode, não derrube": "incolor temperado 8 mm" sobre "vidro 8mm" vira "8 mm"); cai inteiro só quando NADA do vidro está na mensagem
        const semFornecedorInventado = (itens: unknown) => (Array.isArray(itens) ? itens.map((i) => {
            if (!i || typeof i !== 'object') return i
            const item = { ...(i as Record<string, unknown>) }
            for (const k of ['fornecedor', 'familia']) if (k in item && !ditoNaMensagem(item[k], c.texto)) item[k] = undefined
            if (item.vidro !== undefined && item.vidro !== null) {
                const podado = vidroPodado(item.vidro, c.texto)
                if (podado === null) { item.vidro = undefined; rastro.vidrosNaoDitos += 1 }
                else if (podado !== String(item.vidro).trim()) { item.vidro = podado; rastro.vidrosPodados += 1 }
            }
            return item
        }) : itens)
        // AS ESQUADRIAS RETIDAS NUNCA SE PERDEM (03/11/2026): as da pergunta em aberto MAIS as desta mensagem; a reenviada idêntica conta uma vez
        const retidas: EsquadriaProposta[] = aberta?.p.itens ?? []
        const daMensagemBrutas = semFornecedorInventado(dadosDaMensagem.proposta.itens)
        // o item que o modelo devolve SEM nenhum campo da esquadria (05/11/2026) não entra em lugar nenhum — e a linha [IA] passa a dizer quantos
        rastro.itensSemCampos = Array.isArray(daMensagemBrutas) ? daMensagemBrutas.filter((i) => !!i && typeof i === 'object' && esquadriasDaProposta({ itens: [i] }).length === 0).length : 0
        const juncao = juntarEsquadrias(retidas, Array.isArray(daMensagemBrutas) ? daMensagemBrutas : [])
        rastro.reenviadas = juncao.reenviadas
        const daPergunta = retidas.length > 0
        const emEspera: EsquadriaProposta[] = esquadriasDaProposta({ itens: juncao.itens })
        {
            // ETAPA 1 (06/11/2026): o que veio da conversa — as esquadrias desta mensagem e as retidas, quantos campos disseram, e o que
            // ainda não foi dito (a quantidade não dita é 1 e não conta como falta)
            const daMensagem = esquadriasDaProposta({ itens: Array.isArray(daMensagemBrutas) ? daMensagemBrutas : [] })
            const ditos = (e: EsquadriaProposta) => CAMPOS_DA_ESQUADRIA.filter((k) => e[k] !== null && e[k] !== undefined)
            const naoDitos = emEspera.flatMap((e, i) => CAMPOS_DA_ESQUADRIA.filter((k) => k !== 'quantidade' && (e[k] === null || e[k] === undefined)).map((k) => `e${i + 1}:${campoNoLog(k)}`))
            rastro.etapas.coletar = `historico=${rastro.historico} retidas=${retidas.length} esquadrias=${daMensagem.length} campos=${daMensagem.reduce((t, e) => t + ditos(e).length, 0)}`
                + ` itens_sem_campos=${rastro.itensSemCampos} faltou=${listaNoLog(naoDitos)}`
        }
        const efetiva = { ...proposta, itens: juncao.itens }
        /**
         * R2 em TODO caminho que pergunta: guarda a pergunta (com o que espera resposta) e, se ela é a MESMA
         * que estava em aberto, a resposta diz que não registrou — nunca a mesma pergunta como se nada fosse.
         */
        const perguntar = async (p: PerguntaEmAberto, textoDaPergunta: string, desfecho: DesfechoDaIa): Promise<DesfechoDaIa> => {
            if (guardaPergunta) await gravarPerguntaEmAberto(c.tenantId, c.remetenteId, p)
            const repetida = aberta !== null && aberta.texto === textoDaPergunta
            if (!repetida) return await falar(textoDaPergunta, desfecho)
            // a pergunta repetida vai em OUTRAS palavras — nunca "Não consegui registrar a sua resposta" (dono do produto, 03/11/2026)
            if (p.pergunta === 'SEM_NOME') return await falar(outraPergunta(OUTRAS_PERGUNTAS_DO_NOME, c.texto), 'nao-avancou')
            if (p.pergunta === 'NOME_PARECIDO' && p.nome && aberta) return await falar(fraseDoResgateEmOutrasPalavras(p.nome, aberta.citados), 'nao-avancou')
            if (p.pergunta === 'CONFIRMAR_ACRESCIMO' && aberta?.citados[0]) {
                return await falar(p.nome !== null ? fraseDeConfirmarResgateEmOutrasPalavras(aberta.citados[0]) : fraseDeConfirmarAcrescimoEmOutrasPalavras(aberta.citados[0].nome), 'nao-avancou')
            }
            return await falar(fraseDeNaoRegistrei(textoDaPergunta), 'nao-avancou')
        }

        // ── a rota ──
        let alvo: { id: string; nome: string; estado: string; donoId: string; vendedor: string | null; itens: ItemGravado[] } | null = null
        let nome: string
        if (emMontagem && !saiDaMontagem) {
            rastro.rota = 'MONTAGEM'
            alvo = { id: emMontagem.id, nome: emMontagem.nome, estado: emMontagem.estado, donoId: c.remetenteId, vendedor: null, itens: itensDaMontagem }
            nome = emMontagem.nome
        } else {
            const noTexto = nomeDaMensagem(proposta.nome, c.texto)
            const naPergunta = noTexto === null && aberta ? nomeDaPergunta(proposta.nome, aberta) : null
            // sem nome dito, o do CLIENTE que está no texto (03/11/2026): "Cliente: Geronimo Silva" é "Levantamento Geronimo Silva"
            const doCliente = noTexto === null && naPergunta === null ? nomeDoCliente(proposta, c.texto) : null
            rastro.nome = marcaDoNome(proposta.nome, noTexto, naPergunta, doCliente)
            let lido = noTexto ?? naPergunta ?? doCliente
            // O APANHADO espera o "sim": a resposta sem nome — ou com o nome dele — é sobre o levantamento que ele
            // citou, achado pelo id, de qualquer vendedor. "sim" ou "não" confirmam; o resto ("a largura é 1500") é
            // alteração DELE, e entra no apanhado. O admin que alterou o de outro também passa por aqui (26/10/2026)
            const doApanhado = aberta?.p.pergunta === 'CONFIRMAR_APANHADO' ? aberta.doApanhado : undefined
            if (doApanhado && (lido === null || formaComparavel(lido) === formaComparavel(doApanhado.nome_normalizado))) {
                if (lido === null) rastro.nome = 'da_pergunta'
                rastro.levantamento = doApanhado.id
                const deOutro = doApanhado.remetente_id !== c.remetenteId
                if (deOutro) {
                    // a permissão é conferida de novo: quem deixou de ser admin não alcança o levantamento do outro
                    rastro.admin = await permissaoDoRemetente(c.tenantId, c.remetenteId)
                    if ('motivo' in rastro.admin) { rastro.rota = 'NAO_ENCONTRADO'; return await falar(fraseDeNaoEncontrei(doApanhado.nome), 'nao-encontrado') }
                }
                rastro.rota = deOutro ? 'ALTERACAO_ADMIN' : 'ALTERACAO'
                if (lido === null && confirma === false) return await falar(fraseDoApanhadoNaoConfirmado(doApanhado.nome), 'nao-confirmou')
                const vendedor = deOutro ? (await nomesDosVendedores(c.tenantId, [doApanhado.remetente_id])).get(doApanhado.remetente_id) ?? VENDEDOR_SEM_NOME : null
                alvo = { id: doApanhado.id, nome: doApanhado.nome, estado: doApanhado.estado, donoId: doApanhado.remetente_id, vendedor, itens: await lerItens(c.tenantId, doApanhado.id) }
                nome = doApanhado.nome
            } else {
                // O RESGATE (03/11/2026): a lista está em aberto, e a escolha veio por `opcao` ("o primeiro", "é o do Geronimo", "o de ontem")
                // ou a confirmação dela está em aberto. A escolha vale sobre um nome PARECIDO que a IA também tenha lido; "novo" vence tudo.
                const resgate = aberta && ehResgate(aberta.p) ? aberta : null
                if (resgate && proposta.novo !== true) {
                    const lista = resgate.p.pergunta === 'NOME_PARECIDO' ? resgate.citados : opcoesDeResgate(resgate.citados)
                    const escolhidoAntes = resgate.p.pergunta === 'CONFIRMAR_ACRESCIMO' ? resgate.citados[0] : null
                    const porOpcao = opcaoDaLista(proposta.opcao, lista)
                    const igualAoLido = lido !== null ? lista.find((l) => formaComparavel(l.nome_normalizado) === formaComparavel(lido as string)) ?? null : null
                    const confirmaOEscolhido = escolhidoAntes !== null && lido === null && confirma === true
                    if (confirmaOEscolhido) {
                        lido = escolhidoAntes.nome
                        rastro.nome = 'da_pergunta'
                    } else if (porOpcao && (!igualAoLido || igualAoLido.id !== porOpcao.id)) {
                        // a escolha de UM da lista: confirma antes de seguir — a não ser que ele escolheu de novo o que já esperava o "sim"
                        if (escolhidoAntes && porOpcao.id === escolhidoAntes.id && confirma !== false) {
                            lido = escolhidoAntes.nome
                            rastro.nome = 'da_pergunta'
                        } else {
                            rastro.nome = 'da_pergunta'
                            rastro.rota = 'RESGATE'
                            return await perguntar(
                                { pergunta: 'CONFIRMAR_ACRESCIMO', nome: resgate.p.nome, levantamentos: [porOpcao.id, ...lista.filter((l) => l.id !== porOpcao.id).map((l) => l.id)], itens: emEspera },
                                fraseDeConfirmarResgate(porOpcao), 'confirmar-resgate',
                            )
                        }
                    } else if (resgate.p.pergunta === 'NOME_PARECIDO' && lido === null && resgate.p.nome !== null) {
                        // a resposta que não apontou nenhum nem trouxe nome: a lista de novo — em outras palavras, pelo R2 de `perguntar`
                        rastro.rota = 'PARECIDO'
                        return await perguntar(
                            { pergunta: 'NOME_PARECIDO', nome: resgate.p.nome, levantamentos: lista.map((l) => l.id), itens: emEspera },
                            fraseDoNomeParecido(resgate.p.nome, lista), 'nome-parecido',
                        )
                    } else if (escolhidoAntes && lido === null && confirma === null) {
                        // nem sim, nem não, nem outro da lista: a mesma confirmação — em outras palavras, pelo R2 de `perguntar`
                        rastro.rota = 'RESGATE'
                        return await perguntar(
                            { pergunta: 'CONFIRMAR_ACRESCIMO', nome: resgate.p.nome, levantamentos: resgate.p.levantamentos, itens: emEspera },
                            fraseDeConfirmarResgate(escolhidoAntes), 'confirmar-resgate',
                        )
                    } else if (escolhidoAntes && lido === null && confirma === false) {
                        // "não" à confirmação: a lista volta, sem o recusado; sem sobrar nenhum, o cliente novo
                        const outras = lista.filter((l) => l.id !== escolhidoAntes.id)
                        rastro.rota = 'PARECIDO'
                        const p: PerguntaEmAberto = outras.length
                            ? { pergunta: 'NOME_PARECIDO', nome: resgate.p.nome, levantamentos: outras.map((l) => l.id), itens: emEspera }
                            : { pergunta: 'SEM_NOME', nome: null, levantamentos: [], itens: emEspera }
                        return await perguntar(p, fraseDoResgateRecusado(escolhidoAntes, outras), outras.length ? 'nome-parecido' : 'sem-nome')
                    }
                }
                // "sim" ou "não" à confirmação do acréscimo, sem nome: é sobre o levantamento que ela citou
                if (lido === null && aberta?.p.pergunta === 'CONFIRMAR_ACRESCIMO' && aberta.p.nome === null && confirma !== null) {
                    const citado = aberta.citados[0]
                    if (confirma) lido = citado.nome
                    else {
                        rastro.rota = 'SEM_NOME'
                        if (guardaPergunta) await gravarPerguntaEmAberto(c.tenantId, c.remetenteId, { pergunta: 'SEM_NOME', nome: null, levantamentos: [], itens: emEspera })
                        return await falar(fraseDoAcrescimoRecusado(citado.nome), 'nao-acrescentou')
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
                    if (novo) { rastro.rota = 'NOME_EXISTE'; return await falar(fraseDoNomeQueJaExiste(comparacao.existente.nome), 'nome-existe') }
                    rastro.rota = 'ALTERACAO'
                    alvo = { id: comparacao.existente.id, nome: comparacao.existente.nome, estado: comparacao.existente.estado, donoId: c.remetenteId, vendedor: null, itens: await lerItens(c.tenantId, comparacao.existente.id) }
                    nome = comparacao.existente.nome
                } else if ('existentes' in comparacao && !novo) {
                    // O RESGATE (03/11/2026): até 3, do mais recente ao mais antigo, com data e estado; a ordem gravada é a numeração
                    rastro.rota = 'PARECIDO'
                    const opcoes = opcoesDeResgate(comparacao.existentes)
                    return await perguntar(
                        { pergunta: 'NOME_PARECIDO', nome: lido, levantamentos: opcoes.map((l) => l.id), itens: emEspera },
                        fraseDoNomeParecido(lido, opcoes), 'nome-parecido',
                    )
                } else if (proposta.alteracao === true && !novo) {
                    // pedido de alteração de um nome que não é do remetente: só o admin vai além
                    rastro.admin = await permissaoDoRemetente(c.tenantId, c.remetenteId)
                    if ('motivo' in rastro.admin) { rastro.rota = 'NAO_ENCONTRADO'; return await falar(fraseDeNaoEncontrei(lido), 'nao-encontrado') }
                    const daEmpresa = await lerLevantamentosDaEmpresaPeloNome(c.tenantId, lido)
                    if (daEmpresa.length === 0) { rastro.rota = 'NAO_ENCONTRADO'; return await falar(fraseDeNaoEncontreiNaEmpresa(lido), 'nao-encontrado') }
                    const nomes = await nomesDosVendedores(c.tenantId, [...new Set(daEmpresa.map((l) => l.remetente_id))])
                    // o vendedor dito só vale se estiver no texto, e casa pelo nome inteiro, sem caixa e sem acento
                    const vendedorLido = nomeDaMensagem(proposta.vendedor, c.texto)
                    const doVendedor = vendedorLido === null ? daEmpresa
                        : daEmpresa.filter((l) => normalizarNome(nomes.get(l.remetente_id) ?? '') === normalizarNome(vendedorLido))
                    // um vendedor dito que não é dono de nenhum também pergunta: não se cai no único que existe
                    if (doVendedor.length !== 1 && (daEmpresa.length > 1 || vendedorLido !== null)) {
                        rastro.rota = 'QUAL_VENDEDOR'
                        return await falar(fraseDeQualVendedor(lido, daEmpresa.map((l) => nomes.get(l.remetente_id) ?? VENDEDOR_SEM_NOME)), 'qual-vendedor')
                    }
                    const escolhido = doVendedor.length === 1 ? doVendedor[0] : daEmpresa[0]
                    rastro.rota = 'ALTERACAO_ADMIN'
                    alvo = { id: escolhido.id, nome: escolhido.nome, estado: escolhido.estado, donoId: escolhido.remetente_id, vendedor: nomes.get(escolhido.remetente_id) ?? VENDEDOR_SEM_NOME, itens: await lerItens(c.tenantId, escolhido.id) }
                    nome = escolhido.nome
                } else {
                    rastro.rota = 'NOVO'
                    // o prefixo "Levantamento" não se grava mais (03/11/2026): o nome é o do cliente, puro
                    nome = nomeSemPrefixo(lido)
                }
            }
        }
        if (alvo) rastro.levantamento = alvo.id

        // ── a proposta, validada ──
        const atuais = alvo ? alvo.itens : [itemVazio(1)]
        const ordemPadrao = rastro.rota === 'MONTAGEM' ? pendenciaAberta?.ordem ?? (atuais.length === 1 ? atuais[0].ordem : null)
            : atuais.length === 1 ? atuais[0].ordem : null
        const proposta_ = aplicarProposta(atuais, efetiva, {
            candidatos: tabela.candidatos, aberturaDaMensagem, aberturasDitas: palavrasDeAbertura(c.texto), cores, mensagem: c.texto, ordemPadrao, definicao, familiasDoCodigo: doCodigo,
        })
        // OS PADRÕES DO CÓDIGO (dono do produto, 05/11/2026), na esquadria que diz alguma coisa: a TIPOLOGIA padrão — de correr, 2 folhas, lisa —
        // quando o acumulado não indica nada fora do padrão (`tipologia-padrao.ts`); e a COR não dita = a predominante da base
        const dizAlgo = (i: ItemDoLevantamento) => (['tipologia', 'largura_mm', 'altura_mm', 'vidro'] as const).some((k) => i[k] !== null && i[k] !== undefined)
        const tipologiasDoPadrao: string[] = []
        // O RASTRO DOS ATRIBUTOS (dono do produto, 12/11/2026): cada atributo que entrou por padrão, com o valor e a origem — nunca deduzido depois
        const assumidos = new Map<number, AtributoAssumido[]>()
        const assumir = (ordem: number, xs: readonly AtributoAssumido[]) => { if (xs.length > 0) assumidos.set(ordem, [...(assumidos.get(ordem) ?? []), ...xs]) }
        // a tipologia que o MODELO pôs nesta mensagem (nova, ou trocada): dita só se o código está na mensagem; senão, escolha do modelo — a
        // origem sem regra por trás, e por isso nomeada (dono do produto, 12/11/2026)
        const tipologiaAntes = new Map(atuais.map((i) => [i.ordem, i.tipologia]))
        for (const item of proposta_.itens) {
            if (item.tipologia !== null && item.tipologia !== tipologiaAntes.get(item.ordem)) {
                assumir(item.ordem, [{ atributo: 'tipologia', valor: item.tipologia, origem: origemDaTipologiaProposta(item.tipologia, c.texto) }])
            }
        }
        // o que o padrão NÃO resolve e se diz (11/11/2026): a linha sem padrão, as descrições que nada separa, a modulação da bandeira, a lacuna
        // do motor — por esquadria, nunca "sem padrão" mudo
        const faltasDoPadrao: Array<{ ordem: number; frase: string; motivo: string }> = []
        for (const item of proposta_.itens) {
            if (!dizAlgo(item)) continue
            if (item.tipologia === null) {
                const { decisao: padrao, atributos } = padraoDaEsquadria(item, proposta_.aberturas[item.ordem] ?? null, filtro.lidos, tabela.candidatos)
                if ('tipologia' in padrao) {
                    item.tipologia = padrao.tipologia; rastro.tipologiasPadrao += 1; tipologiasDoPadrao.push(`e${item.ordem}:${padrao.tipologia}`)
                    assumir(item.ordem, atributos)
                }
                else {
                    const frase = fraseDoPadraoQueFalta(padrao)
                    if (frase !== null) faltasDoPadrao.push({ ordem: item.ordem, frase, motivo: padrao.motivo })
                }
            }
            // a predominante é da cor NÃO DITA (08/11/2026): a cor dita que a empresa não tem fica vazia, e a conversa pergunta nomeando-a
            const ditaForaDaLista = proposta_.coresForaDaLista.some((x) => x.ordem === item.ordem)
            if (item.cor_perfil === null && corPredominante !== null && !ditaForaDaLista) {
                item.cor_perfil = corPredominante; rastro.coresPadrao += 1
                assumir(item.ordem, [{ atributo: 'cor', valor: corPredominante, origem: 'base_de_conhecimento' }])
            }
        }
        // o vidro da instrução da categoria VIDRO e a quantidade não dita, que a montagem pôs (12/11/2026: nomeados no rastro, com a origem)
        for (const ordem of proposta_.vidrosPadraoNas) {
            const vidro = proposta_.itens.find((i) => i.ordem === ordem)?.vidro
            if (typeof vidro === 'string') assumir(ordem, [{ atributo: 'vidro', valor: vidro, origem: 'base_de_conhecimento' }])
        }
        for (const ordem of proposta_.quantidadesPadrao) assumir(ordem, [{ atributo: 'quantidade', valor: '1', origem: 'padrao_do_apanhado' }])
        // a família e o motor de cada esquadria, como ficam gravados: a resolvida e o motor do cálculo dela HOJE (PR D); e o AGRUPAMENTO
        // (03/11/2026): os itens completos e iguais viram um, com as unidades somadas
        // A QUANTIDADE DITA SUBSTITUI, NUNCA SOMA (06/11/2026): a esquadria da mensagem igual a uma GRAVADA é ela mesma — o agrupamento sabe quais já
        // estavam gravadas e quais levam o 1 do padrão, e diz o caminho de cada uma no log
        const agrupamento = agruparIguais(resolverFamilias(proposta_.itens, doCodigo), {
            gravadas: new Set(alvo ? alvo.itens.map((i) => i.ordem) : []), quantidadePadrao: new Set(proposta_.quantidadesPadrao),
        })
        const aplicada = { ...proposta_, itens: agrupamento.itens }
        rastro.fundidos = agrupamento.fundidos
        rastro.caminhos = agrupamento.caminhos.map((x) => `e${x.ordem}:${x.caminho}`)
        rastro.vidrosPadrao = aplicada.vidrosPadrao
        rastro.propostos = aplicada.propostos
        rastro.descartados = aplicada.descartados
        // ETAPA 2 (06/11/2026): o casamento com o catálogo e o motor — a lista enviada, o que valeu, o que o código pôs e o que descartou
        rastro.etapas.casar = `lista=${rastro.lista} trechos=${rastro.trechos} propostos=${aplicada.propostos} descartados=${aplicada.descartados}`
            + ` escolhidas=${listaNoLog(aplicada.itens.filter((i) => i.tipologia !== null).map((i) => `e${i.ordem}:${i.tipologia}`))}`
            + ` padrao=${listaNoLog(tipologiasDoPadrao)} recusadas=${listaNoLog(aplicada.recusas.map((x) => `e${x.ordem}:${x.motivo}:${x.tipologia}`))}`
            + ` sem_tipologia=${aplicada.itens.filter((i) => i.tipologia === null).length}`
            + ` assumidos=${atributosNoLog(assumidos)}`
        if (aplicada.semEsquadria && alvo) return await falar(fraseDeQualEsquadria(nome, alvo.itens.length), 'qual-esquadria')
        // AS COLUNAS DO LEVANTAMENTO que esta mensagem muda (06/11/2026): os dados do cliente e as condições ditas, e o vendedor — o dito (achado
        // no cadastro pelo nome, nunca escolhido entre dois), ou, no levantamento novo, o do remetente. Só entra o que DIFERE do gravado
        rastro.propostos += dadosDaMensagem.propostos
        rastro.descartados += dadosDaMensagem.descartados
        const doLevantamento = alvo ? await lerLevantamentoDoArquivo(c.tenantId, alvo.id) : null
        const colunas: Record<string, unknown> = { ...dadosDaMensagem.cliente, ...dadosDaMensagem.condicoes }
        // OUTRO vendedor: os percentuais vêm do cadastro DELE — os congelados do vendedor de antes saem, menos os ditos nesta mensagem. "Nunca herde
        // os percentuais do remetente para um levantamento lançado para outra pessoa: comissão é do vendedor" (dono do produto, 06/11/2026)
        const trocarVendedor = (id: string | null, nomeDoVendedor: string) => {
            colunas.vendedor_employee_id = id
            colunas.vendedor_nome = nomeDoVendedor
            for (const k of ['comissao_percentual', 'comissao_modo', 'reserva_tecnica_percentual', 'lucro_projetado_percentual'] as const) if (!(k in dadosDaMensagem.condicoes)) colunas[k] = null
        }
        // O VENDEDOR DITO (06/11/2026): só os funcionários ATIVOS da empresa, casados pelas palavras do nome. Um → é ele. Nenhum ativo → a frase do
        // inativo, ou a do não achado. Dois ativos → a conversa PERGUNTA qual é (pelo nome completo e a data do cadastro, nunca pelo cargo), e o
        // levantamento fica em montagem com o nome dito e sem o vínculo; nada os separa → recusa nomeando. Nunca escolhe um. O levantamento já gravado
        // não é tocado: quem ficou inativo depois continua com o nome congelado nele
        let homonimos: Funcionario[] = []
        let nomeDosHomonimos = ''
        if (dadosDaMensagem.vendedor !== null) {
            const { ativos, inativos } = await funcionariosPeloNome(c.tenantId, dadosDaMensagem.vendedor, normalizarNome)
            if (ativos.length === 0) {
                return await falar(inativos.length ? fraseDoVendedorInativo(dadosDaMensagem.vendedor, inativos) : fraseDoVendedorNaoAchado(dadosDaMensagem.vendedor), 'vendedor-nao-achado')
            }
            if (ativos.length > 1 && !homonimosDistinguiveis(ativos, normalizarNome)) return await falar(fraseDosHomonimosIndistinguiveis(dadosDaMensagem.vendedor, ativos.length), 'vendedor-nao-achado')
            const escolhido = ativos.length === 1 ? ativos[0] : opcaoDaLista(proposta.vendedor_opcao, ativos)
            if (escolhido) { if (escolhido.id !== doLevantamento?.vendedor_employee_id) trocarVendedor(escolhido.id, escolhido.nome) }
            // o nome DITO fica guardado até a escolha: é por ele que a pergunta em aberto refaz a mesma lista no turno seguinte
            else { homonimos = ativos; nomeDosHomonimos = dadosDaMensagem.vendedor; trocarVendedor(null, dadosDaMensagem.vendedor) }
        } else if (doLevantamento?.vendedor_nome && !doLevantamento.vendedor_employee_id) {
            // a pergunta dos homônimos em aberto: o nome guardado no levantamento, e a escolha pelo número da lista
            const achados = (await funcionariosPeloNome(c.tenantId, doLevantamento.vendedor_nome, normalizarNome)).ativos
            nomeDosHomonimos = doLevantamento.vendedor_nome
            if (achados.length > 1) {
                const escolhido = opcaoDaLista(proposta.vendedor_opcao, achados)
                if (escolhido) trocarVendedor(escolhido.id, escolhido.nome)
                else homonimos = achados
            }
        }
        const vendedorPendente = homonimos.length > 1
        // o vendedor PADRÃO (quem fez): o funcionário do remetente que é dono do levantamento, quando ainda não há nenhum
        if (!('vendedor_nome' in colunas) && !doLevantamento?.vendedor_nome) {
            const doDono = await lerVendedorDoRemetente(c.tenantId, alvo ? alvo.donoId : c.remetenteId)
            if (doDono.nome !== null) { colunas.vendedor_nome = doDono.nome; colunas.vendedor_employee_id = doDono.employeeId }
        }
        const colunasQueMudam = Object.fromEntries(Object.entries(colunas).filter(([k, v]) => !doLevantamento || (doLevantamento as unknown as Record<string, unknown>)[k] !== v))
        const nadaMudou = alvo !== null && mesmosItens(alvo.itens, aplicada.itens) && Object.keys(colunasQueMudam).length === 0
        // "Confirma antes" (dono do produto, 26/10/2026): a esquadria que esperava o vendedor dizer o levantamento
        // só entra num que JÁ EXISTE com o "sim" dele à pergunta que citou aquele levantamento
        const confirmado = confirma === true && aberta?.p.pergunta === 'CONFIRMAR_ACRESCIMO' && alvo?.id === aberta.citados[0]?.id
        if (daPergunta && alvo && !nadaMudou && !confirmado) {
            return await perguntar(
                { pergunta: 'CONFIRMAR_ACRESCIMO', nome: null, levantamentos: [alvo.id], itens: emEspera },
                fraseDeConfirmarAcrescimo(alvo.nome, alvo.itens.length, emEspera), 'confirmar-acrescimo',
            )
        }
        // A COR DITA E FORA DA LISTA que não mudou nada (08/11/2026): a resposta à pergunta da cor, ou "muda para roxo" num levantamento já
        // gravado — a esquadria fica como estava, nada é gravado, e a pergunta nomeia a cor e as cores da empresa (nunca o "não apliquei")
        if (nadaMudou && aplicada.coresForaDaLista.length > 0) {
            const n = aplicada.itens.length
            const frases = aplicada.coresForaDaLista.map((x) => `${n > 1 ? `Esquadria ${x.ordem}: ` : ''}${fraseDaCorForaDaLista(x.cor, cores)}`)
            const resto = pendenciasAbertas.filter((p) => !(p.tipo === 'CAMPO' && p.campo === 'cor_perfil' && aplicada.coresForaDaLista.some((x) => x.ordem === p.ordem)))
            return await falar([...frases, ...(resto.length ? [perguntaDasPendencias(resto, n, null, filtro.jaDito)] : [])].join('\n'), 'perguntou')
        }
        // R2: com uma pergunta em aberto, a resposta que não mudou nada é ERRO e aparece — nunca a mesma pergunta de novo
        if (nadaMudou && rastro.rota === 'MONTAGEM' && pendenciaAberta) {
            const n = itensDaMontagem.length
            // a TIPOLOGIA não volta igual (03/11/2026): a reformulação da IA, ou outra forma de obra — nunca o "não registrei"
            if (pendenciaAberta.tipo === 'CAMPO' && pendenciaAberta.campo === 'tipologia') {
                const fixa = perguntaDasPendencias(pendenciasAbertas, n, null, filtro.jaDito)
                const daIa = perguntaPara(pendenciasAbertas, n, proposta, filtro.jaDito)
                return await falar(daIa !== fixa ? daIa : perguntaDasPendencias(pendenciasAbertas, n, outraPergunta(perguntasDaTipologia(filtro.jaDito).slice(1), c.texto), filtro.jaDito), 'nao-avancou')
            }
            return await falar(fraseDeNaoRegistrei(perguntaDasPendencias(pendenciasAbertas, n, null, filtro.jaDito)), 'nao-avancou')
        }
        // numa alteração, o que foi proposto e não valeu também aparece; sem proposta nenhuma, a conta é refeita. O REENVIO IDÊNTICO (06/11/2026) não é
        // "não apliquei": as esquadrias eram as mesmas, e a resposta segue como se a mensagem tivesse vindo uma vez
        const reenvioIgual = aplicada.descartados === 0 && agrupamento.caminhos.length > 0 && agrupamento.caminhos.every((x) => x.caminho === 'IGNORADA_IGUAL')
        if (nadaMudou && aplicada.propostos > 0 && !reenvioIgual) return await falar(fraseDeNaoApliquei(nome), 'nao-avancou')

        // ── grava, e SÓ DEPOIS responde: o trajeto inteiro, a partir do que ficou doLevantamento ──
        const pendencias = pendenciasDoLevantamento(aplicada.itens, definicao, doCodigo)
        const pendencia = pendencias[0] ?? null
        // ETAPA 3 (06/11/2026): a montagem — a rota, as esquadrias, o que ainda falta (a mesma lista que a pergunta cobre) e o que se gravou
        const faltaNaMontagem = pendencias.map((p) => (p.tipo === 'CAMPO' ? `e${p.ordem}:${campoNoLog(p.campo)}` : p.tipo === 'FAMILIA' ? `e${p.ordem}:familia`
            : p.tipo === 'VARIAVEL' ? `e${p.ordem}:variavel:${p.variavel.variavel}` : `e${p.ordem}:escolha:${p.pendente.variavel}`))
        const montagemNoLog = (gravadas: number) => `rota=${rastro.rota} esquadrias=${aplicada.itens.length} agrupadas=${agrupamento.fundidos} caminhos=${listaNoLog(rastro.caminhos)} pendencias=${pendencias.length}`
            + ` gravadas=${gravadas} estado=${gravadas > 0 ? (pendencia ? EM_MONTAGEM : COMPLETO) : '-'} faltou=${listaNoLog(faltaNaMontagem)}`
        rastro.etapas.montar = montagemNoLog(0)
        // AS CONDIÇÕES COMERCIAIS (06/11/2026), com as esquadrias completas: o doLevantamento e o dito agora; no que falta, o cadastro do vendedor — que
        // fica CONGELADO no levantamento; cadastro nulo e nada dito → a conversa PERGUNTA, e o levantamento continua em montagem
        let faltamCondicoes: string[] = []
        let congelar: Partial<CondicoesDoLevantamento> = {}
        const vendedorDoLevantamento = (colunas.vendedor_nome as string | null | undefined) ?? doLevantamento?.vendedor_nome ?? null
        // SEM VENDEDOR NENHUM (o funcionário do remetente está inativo, e ninguém foi dito): a conversa pede o vendedor antes dos percentuais, que são dele
        const faltaVendedor = !pendencia && !vendedorPendente && vendedorDoLevantamento === null
        if (!pendencia && !vendedorPendente && !faltaVendedor) {
            const doGravado: CondicoesDoLevantamento = {
                comissao_percentual: doLevantamento?.comissao_percentual ?? null, comissao_modo: doLevantamento?.comissao_modo ?? null,
                reserva_tecnica_percentual: doLevantamento?.reserva_tecnica_percentual ?? null, reserva_tecnica_responsavel: doLevantamento?.reserva_tecnica_responsavel ?? null,
                lucro_projetado_percentual: doLevantamento?.lucro_projetado_percentual ?? null,
            }
            const vigentes = { ...doGravado, ...Object.fromEntries(Object.entries(colunas).filter(([k]) => k in doGravado)) } as CondicoesDoLevantamento
            const funcionario = 'vendedor_employee_id' in colunas ? (colunas.vendedor_employee_id as string | null) : doLevantamento?.vendedor_employee_id ?? null
            const r = condicoesComOCadastro(vigentes, await lerPerfilDoVendedor(c.tenantId, funcionario))
            faltamCondicoes = r.faltam
            congelar = r.doCadastro
        }
        // o admin não monta levantamento de outro: com pendência, nada é doLevantamento e a resposta diz o que falta
        if ((pendencia || vendedorPendente || faltaVendedor || faltamCondicoes.length) && alvo && alvo.donoId !== c.remetenteId) {
            const falta = pendencia ? perguntaDasPendencias(pendencias, aplicada.itens.length, null, filtro.jaDito)
                : vendedorPendente ? fraseDosHomonimos(nomeDosHomonimos, homonimos) : faltaVendedor ? FRASE_FALTA_O_VENDEDOR : perguntaDasCondicoes(faltamCondicoes, vendedorDoLevantamento)
            return await falar(fraseDaAlteracaoIncompleta(nome, alvo.vendedor ?? VENDEDOR_SEM_NOME, falta), 'alteracao-incompleta')
        }
        const estado = pendencia || vendedorPendente || faltaVendedor || faltamCondicoes.length ? EM_MONTAGEM : COMPLETO
        // a pergunta em aberto se resolveu: apagada ANTES de gravar — se o apagar falhar, nada foi gravado, e a
        // esquadria que ela guardava não entra depois num levantamento que não é o dela
        if (temLinha) await apagarPerguntaEmAberto(c.tenantId, c.remetenteId)
        // decisão 3: o rastro é atualizado_em — só se grava o que MUDOU
        if (!(nadaMudou && alvo && alvo.estado === estado && Object.keys(congelar).length === 0)) {
            gravando = true
            rastro.levantamento = await gravarLevantamento(c.tenantId, alvo ? alvo.donoId : c.remetenteId, nome, alvo, aplicada.itens, estado, { ...colunasQueMudam, ...congelar })
            gravando = false
        }
        gravado = true
        rastro.etapas.montar = montagemNoLog(aplicada.itens.length)
        if (pendencia) {
            // a tipologia que o CÓDIGO descartou (03/11/2026) tem frase própria: nenhuma cabe (a medida e a faixa das que sobraram), ou a
            // palavra do vendedor contradita — antes de qualquer outra pendência, para a razão não se perder
            const recusa = aplicada.recusas[0]
            if (recusa) {
                const comEsquadria = (frase: string) => (aplicada.itens.length > 1 ? `Esquadria ${recusa.ordem}: ${frase}` : frase)
                if (recusa.motivo === 'LIMITES') {
                    return await falar(comEsquadria(fraseDeNenhumaTipologiaCabe(recusa.medidas, filtrarPorAbertura(tabela.candidatos, recusa.abertura), recusa.abertura)), 'nenhuma-cabe')
                }
                if (recusa.abertura !== null) return await falar(comEsquadria(fraseDaAberturaRecusada(recusa.abertura)), 'perguntou')
            }
            // sem lista de cores na base, perguntar a cor não leva a lugar nenhum: a conversa diz o que falta
            if ('campo' in pendencia && pendencia.campo === 'cor_perfil' && cores.length === 0) return await responder(FRASE_SEM_CORES, 'sem-cores')
            // o que o padrão não resolve (11/11/2026): a conversa diz, por esquadria, com a frase de cada motivo — a linha sem padrão é
            // configuração (sem-linha); as outras nomeiam a falta ou as opções (padrao-nomeado)
            const semPadrao = faltasDoPadrao.filter((x) => aplicada.itens.some((i) => i.ordem === x.ordem && i.tipologia === null))
            if (semPadrao.length > 0) {
                return await responder(semPadrao.map((x) => `${aplicada.itens.length > 1 ? `Esquadria ${x.ordem}: ` : ''}${x.frase}`).join('\n'),
                    semPadrao.every((x) => x.motivo === 'LINHA') ? 'sem-linha' : 'padrao-nomeado')
            }
            // A COR DITA E FORA DA LISTA (dono do produto, 08/11/2026): a pergunta nomeia a cor e as cores da empresa — e o resto do que
            // falta vai junto, na mesma resposta. A esquadria continua sem cor: nada a troca pela predominante
            const foraDaLista = proposta_.coresForaDaLista.filter((x) => aplicada.itens.some((i) => i.ordem === x.ordem && i.cor_perfil === null))
            if (foraDaLista.length > 0) {
                const frases = foraDaLista.map((x) => `${aplicada.itens.length > 1 ? `Esquadria ${x.ordem}: ` : ''}${fraseDaCorForaDaLista(x.cor, cores)}`)
                const resto = pendencias.filter((p) => !(p.tipo === 'CAMPO' && p.campo === 'cor_perfil' && foraDaLista.some((x) => x.ordem === p.ordem)))
                return await falar([...frases, ...(resto.length ? [perguntaPara(resto, aplicada.itens.length, proposta, filtro.jaDito)] : [])].join('\n'), 'perguntou')
            }
            // UMA pergunta com TUDO o que falta (03/11/2026), redigida pelo modelo
            return await falar(perguntaPara(pendencias, aplicada.itens.length, proposta, filtro.jaDito), 'perguntou')
        }
        // o vendedor dito que casa com mais de um funcionário: a pergunta de qual é, com a lista numerada
        if (vendedorPendente) {
            const pergunta = fraseDosHomonimos(nomeDosHomonimos, homonimos)
            return await falar(nadaMudou && perguntaDasCondicoesAberta === pergunta ? fraseDeNaoRegistrei(pergunta) : pergunta, nadaMudou ? 'nao-avancou' : 'perguntou')
        }
        if (faltaVendedor) {
            return await falar(nadaMudou && perguntaDasCondicoesAberta === FRASE_FALTA_O_VENDEDOR ? fraseDeNaoRegistrei(FRASE_FALTA_O_VENDEDOR) : FRASE_FALTA_O_VENDEDOR, nadaMudou ? 'nao-avancou' : 'perguntou')
        }
        // as condições comerciais que nem o cadastro nem a conversa deram: a conversa pergunta, nomeando cada uma e o vendedor (06/11/2026)
        if (faltamCondicoes.length) {
            const pergunta = perguntaDasCondicoes(faltamCondicoes, vendedorDoLevantamento)
            return await falar(nadaMudou && perguntaDasCondicoesAberta === pergunta ? fraseDeNaoRegistrei(pergunta) : pergunta, nadaMudou ? 'nao-avancou' : 'perguntou')
        }
        // O APANHADO (dono do produto, 26/10/2026): a primeira resposta é conversa, não orçamento. O levantamento
        // formal, com o preço, só sai com o "sim" do vendedor à pergunta que citou ESTE levantamento. Sem exceção:
        // o admin que altera o de outro vendedor também recebe o apanhado (dono do produto, 26/10/2026).
        const confirmouApanhado = confirma === true && aberta?.p.pergunta === 'CONFIRMAR_APANHADO' && alvo?.id === aberta.citados[0]?.id
        // O "SIM" QUE CONTINUA VALENDO (dono do produto, 08/11/2026): o "sim" já foi dado, o cálculo recusou, e a definição gravada é a MESMA que ele
        // aprovou — só o cadastro mudou do lado de fora, ou nada mudou. O cálculo roda direto, sem arquivo novo e sem nova confirmação. A definição
        // que mudou (vidro, medida, tipologia, quantidade) cai no arquivo de novo, e pede novo "sim"
        const guardada = aberta !== null && aberta.p.pergunta === 'CONFIRMAR_APANHADO' && aberta.p.levantamentos[0] === rastro.levantamento ? aberta.p : null
        const dadosAgora = guardada && guardada.nome !== null && rastro.levantamento ? await dadosDaFolhaGravada(c.tenantId, rastro.levantamento, definicao, detalhe) : null
        const simVale = !confirmouApanhado && guardada !== null && confirmacaoVale(guardada, dadosAgora ? resumoDoArquivo(dadosAgora) : null)
        if (guardada && guardada.nome !== null) rastro.etapas.montar += ` sim_anterior=${simVale ? 'vale' : 'definicao_mudou'}`
        let semApanhado = ''
        if (!confirmouApanhado && !simVale) {
            // O ARQUIVO DO LEVANTAMENTO (dono do produto, 06/11/2026): a folha A4 no lugar da mensagem-resumo em texto; a confirmação é sobre ELE
            const { dados, folha } = await gerarArquivoDoLevantamento({ tenantId: c.tenantId, levantamentoId: rastro.levantamento, itens: aplicada.itens, definicao, detalhe })
            if ('recusas' in folha) return await responder(fraseDoArquivoRecusado(folha.recusas), 'arquivo-recusado')
            if (!dados) return await responder(fraseDoArquivoRecusado(['O levantamento não foi achado.']), 'arquivo-recusado')
            const resumo = resumoDoArquivo(dados)
            const guardada = await gravarPerguntaEmAberto(c.tenantId, c.remetenteId, { pergunta: 'CONFIRMAR_APANHADO', nome: null, levantamentos: [rastro.levantamento], itens: [] })
            if (guardada) {
                // R2: o mesmo arquivo de novo, sem mudar nada, não se reenvia — a resposta diz que nada mudou
                if (aberta !== null && aberta.texto === resumo) return await falar(FRASE_O_ARQUIVO_NAO_MUDOU, 'nao-avancou')
                const envio = await enviarDocumento(c.wuzapiToken, c.telefone, folha.nomeDoArquivo, folha.pdf)
                const doArquivo = `arquivo_paginas=${folha.paginas} arquivo_enviado=${envio.ok ? 'sim' : `nao status_arquivo=${statusDoEnvio(envio)}`}`
                if (!envio.ok) return await responder(FALHA_NO_ENVIO_DO_ARQUIVO, 'arquivo-nao-enviado', doArquivo, false)
                return await responder(textoDoEnvioDoArquivo(dados.numero, dados.cliente.nome), 'arquivo', doArquivo)
            }
            // sem a tabela ou sem o valor na CHECK (migração 20261026000003 pendente): o formal, como antes
            semApanhado = 'confirmacao=sem_migracao'
        }
        // A VERIFICAÇÃO É DEPOIS DO "SIM" (dono do produto, 08/11/2026 — revoga o apanhado que travava, do #240 e do #241): o arquivo sempre sai, e é
        // aqui, quando o levantamento tentaria evoluir, que a regra ÚNICA vale — se o cálculo recusa, o levantamento não evolui, com a falta curta
        const levantamento = await mensagemDoLevantamento(c.tenantId, tabela, { nome, itens: aplicada.itens })
        // o "sim" dado fica guardado com a marca da definição que ele aprovou: a mensagem seguinte sabe se ele ainda vale
        if (levantamento.desfecho === 'recusou' && (confirmouApanhado || simVale) && rastro.levantamento) {
            const dadosConfirmados = dadosAgora ?? await dadosDaFolhaGravada(c.tenantId, rastro.levantamento, definicao, detalhe)
            if (dadosConfirmados) {
                await gravarPerguntaEmAberto(c.tenantId, c.remetenteId, { pergunta: 'CONFIRMAR_APANHADO', nome: marcaDaConfirmacao(resumoDoArquivo(dadosConfirmados)), levantamentos: [rastro.levantamento], itens: [] })
            }
        }
        // ETAPA 4 (06/11/2026): o cálculo — o que foi cortado e comprado, e o que impediu (o motivo e a variável ou o código de onde nasceu)
        if (levantamento.etapa) {
            const e = levantamento.etapa
            rastro.etapas.calcular = `esquadrias=${e.esquadrias} pecas=${nuloNoLog(e.pecas)} barras=${nuloNoLog(e.barras)} codigos=${nuloNoLog(e.codigos)}`
                + ` sem_preco=${nuloNoLog(e.semPreco)} mao_de_obra=${nuloNoLog(e.maoDeObra)} desfecho=${levantamento.desfecho} faltou=${listaNoLog(e.faltou)}`
        }
        // A TRAVESSIA (dono do produto, 10/11/2026): o "sim" ao levantamento COMPLETO que levantou atravessa para o orçamento do agente, pelo
        // MESMO código da ação manual. Idempotente; nunca muda a resposta ao vendedor — o resultado vai ao log da etapa do cálculo
        if ((confirmouApanhado || simVale) && levantamento.desfecho === 'levantou' && estado === COMPLETO && rastro.levantamento) {
            // a ETAPA DO PREÇO (11/11/2026): precifica, gera o PDF e o envia ao DONO do levantamento (nunca a quem disse "sim"); sem preço formado
            // não há PDF, e o texto diz o que falta. O que ela tem a dizer vai junto da resposta, e a falha do envio não desfaz nada
            const sim = await atravessarNoSim(c.tenantId, rastro.levantamento, (orcamentoId) =>
                etapaDoPreco(c.tenantId, orcamentoId, dependenciasDoServidor((telefone, nome, pdf) =>
                    enviarAoPrimeiroQueAceitar(destinosDoWhatsApp(telefone, c.telefone), (destino) => enviarDocumento(c.wuzapiToken, destino, nome, pdf)))))
            rastro.etapas.calcular = `${rastro.etapas.calcular ?? ''} travessia=${sim.rastro}`.trim()
            if (sim.paraOVendedor) return await responder(`${levantamento.texto}\n\n${sim.paraOVendedor}`, levantamento.desfecho, semApanhado)
        }
        // SEM a confirmação do arremate (dono do produto, 08/11/2026): "Considerando guarnição e arremate padrão, certo!" repetia o que o
        // rodapé da folha já diz nas pré-definições consideradas — ruído. O mesmo para a variante do arremate escolhido
        return await responder(levantamento.texto, levantamento.desfecho, semApanhado)
    } catch (e) {
        // Só o nome da tabela e o erro do banco — nunca a chave, o telefone ou o texto. E o vendedor sabe.
        // A falha vai sozinha: a fala da IA não abre uma frase de erro
        abertura = null
        const frase = gravando || e instanceof ErroAoGravar ? FALHA_DO_BANCO_AO_GRAVAR : gravado ? FALHA_NO_CALCULO : FALHA_DO_BANCO_ANTES
        return await responder(frase, 'erro', `motivo="${e instanceof Error ? e.message : 'desconhecido'}"`)
    }
}
