/**
 * painel-de-agendamento.component.tsx — a configuração do agendamento público.
 *
 * Fase 1: comando do PO de 05/10/2026. Reorganização: comando do PO de 05/10/2026, DEPOIS de
 * usar o painel em produção.
 *
 * >>> ESTA FASE NÃO CRIA ROTA PÚBLICA <<<
 * O link é exibido e copiável, e NÃO resolve página nenhuma. O aviso disso está na tela, não só
 * neste comentário: quem copiar o link hoje precisa saber que ele ainda não abre.
 *
 * ── A ORDEM DAS SEÇÕES É A ORDEM DO TRABALHO, E ISSO É A CORREÇÃO ──────────────────────────
 *
 *   1. Grade de atendimento  →  2. Ajustes  →  3. Link
 *
 * >>> ERAM QUATRO ATÉ 08/10/2026, E A SEGUNDA DESCEU PARA DENTRO DA CÉLULA <<<
 * "Férias, folgas e feriados" era uma seção solta, com um `Select` de profissional dentro.
 * Decisão do dono do produto: a ausência pertence ao PROFISSIONAL, não a uma seção separada —
 * ela mora na célula dele, e entra por modal. Não ficou versão reduzida nem link.
 *
 * A primeira versão punha o "Gerar link" no TOPO, antes de existir grade: a tela pedia para
 * PUBLICAR antes de haver o que publicar. Quem usou em produção tropeçou nisso, e a ordem nova
 * é o conserto. Não é estética — é a sequência em que as decisões dependem uma da outra, e
 * reordenar de volta recria o tropeço (`razao-longe-da-restricao.md`: a razão vive aqui, no
 * ponto onde a ordem é declarada).
 *
 * ── POR QUE É ARQUIVO PRÓPRIO, e não mais 500 linhas em `agenda/index.tsx` ────────────────
 *
 * A Agenda tem 2.700 linhas. Mas a razão que decide não é tamanho: é o PORTÃO. Renderizar a
 * Agenda inteira para afirmar que uma faixa sobreposta foi recusada obrigaria a mockar
 * `calendar_events`, `customers`, `services`, `products` e `whatsapp_dispatches` — e um caso que
 * depende de cinco mocks para chegar à asserção é um caso que fica verde por motivo errado
 * (`teste-que-nao-exercita.md`).
 *
 * ── E POR QUE ELE NÃO LÊ O BANCO ──────────────────────────────────────────────────────────
 *
 * Os dados chegam por `dados` e as gravações saem por `acoes`. Quem fala com o Supabase é a
 * Agenda, que já tem a sessão e o `tenant_id`. Aqui ficam a APRESENTAÇÃO e a RECUSA — e é a
 * recusa que o portão afirma: a mensagem aparece no DOM **e** a ação NÃO é chamada. Afirmar só a
 * mensagem não distinguiria "recusou" de "avisou e gravou assim mesmo".
 */

import React, { useMemo, useState } from 'react'
import { Alert, Button, Checkbox, DatePicker, Drawer, Empty, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Switch, Tag, TimePicker, Tooltip, message } from 'antd'
// >>> O `locale` DO DATEPICKER NÃO É PASSADO POR PROP, E A RAZÃO É MEDIDA <<<
//
// `antd/es/date-picker/locale/pt_BR` existe na 5.29.3 e resolve no Next, mas é ESM e DERRUBA a
// suíte do jest: `SyntaxError: Cannot use import statement outside a module`, porque
// `node_modules` não passa pelo transform. Medido — a suíte do painel deixou de carregar.
//
// Nenhum caminho alternativo foi inventado (o `antd/lib/...` seria isso), e nenhuma mexida no
// `jest.config.js` foi feita: ela não é necessária, porque a medição da §0 respondeu que o
// `ConfigProvider` de `src/pages/_app.tsx:220` JÁ passa `antd/locale/pt_BR`, e esse pacote
// inclui o locale do DatePicker. A prop seria redundante no app.
//
// O que sobra sem ela: no app, português completo pelo ConfigProvider; no portão, que renderiza
// o painel fora daquela árvore, os rótulos internos do calendário saem em inglês — o `format`
// abaixo garante DD/MM/YYYY nos dois casos, que é o que a §1 pede.
import { CopyOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { tenantOffersServices } from '@/utils/segment-visibility'
// >>> `adicionar-faixa-multiplos-dias.ts` DEIXOU DE SER IMPORTADO AQUI <<<
// Redesenho do PO de 08/10/2026, segunda rodada: o compositor por célula saiu, e com ele o
// único consumidor daquele módulo. O arquivo e os testes dele FICAM no repositório, por
// instrução explícita — ele está órfão, e a decisão de apagá-lo é do dono do produto.
import { ordenarAusencias } from '@/utils/ordenar-ausencias'
import { ausenciaRecusada, validarAusencia } from '@/utils/validar-ausencia'
import {
  montagemRecusada,
  montarGrade,
  type FaixaExistente,
  type FaixaInformada,
  type ModoDaMontagem,
} from '@/utils/montar-grade'
import {
  MENSAGEM_ALTERACAO_PADRAO,
  MENSAGEM_CANCELAMENTO_PADRAO,
  MENSAGEM_CONFIRMACAO_PADRAO,
  VARIAVEIS_DAS_MENSAGENS,
  textoOuPadrao,
} from '@/utils/mensagens-agendamento-padrao'
import {
  DIAS_DA_SEMANA,
  LIMITES,
  SELO_DO_ESTADO,
  avisoDaTabelaDeServico,
  avisoDeFuncionarioSemAcesso,
  avisoDoAdicionar,
  avisoDoSubstituir,
  confirmacaoDoSubstituir,
  estadoDoFuncionarioNoLink,
  mensagemDeNadaAGravar,
  mensagemDoAdicionar,
  mensagemDoSubstituir,
  resolverTabelaDeServico,
  type FaixaDeHorario,
  type TabelaDeComissao,
} from '@/utils/agendamento-config'

export const AVISO_LINK_AINDA_NAO_FUNCIONA =
  'Este link ainda NÃO abre: a página de agendamento é a próxima etapa. Guarde-o, mas não '
  + 'divulgue ainda.'

export const SELO_LINK_DESLIGADO = 'DESLIGADO — o endereço ainda não funciona'
export const SELO_LINK_LIGADO = 'LIGADO'

export interface FaixaGravada extends FaixaDeHorario {
  id: string
  employee_id: string
}

export interface FolgaGravada {
  id: string
  employee_id: string
  starts_at: string
  ends_at: string
  reason?: string | null
}

export interface ConfiguracaoDoAgendamento {
  tenant_id: string
  public_token: string
  is_enabled: boolean
  lead_time_min: number
  horizon_days: number
  grid_minutes: number
  msg_confirmacao?: string | null
  msg_cancelamento?: string | null
  msg_alteracao?: string | null
}

export interface FuncionarioDoPainel {
  id: string
  name: string
  user_id?: string | null
  /** As tabelas de comissão vinculadas — TODAS, inclusive as de PRODUCT. O filtro é do §1. */
  tabelas: TabelaDeComissao[]
}

export interface DadosDoAgendamento {
  configuracao: ConfiguracaoDoAgendamento | null
  grade: FaixaGravada[]
  folgas: FolgaGravada[]
  funcionarios: FuncionarioDoPainel[]
}

export interface AcoesDoPainel {
  onGerarLink: () => void | Promise<void>
  onAlternarAtivo: (ativo: boolean) => void | Promise<void>
  onSalvarConfiguracao: (patch: Partial<ConfiguracaoDoAgendamento>) => void | Promise<void>
  /**
   * A gravação da montagem: grava `novas` e remove `idsParaRemover`, nessa ordem.
   *
   * >>> UMA AÇÃO PARA OS DOIS MODOS, E ISSO É DELIBERADO <<<
   *
   * `substituir` e `adicionar` diferem no que `montarGrade` DEVOLVE, não no que o banco faz:
   * em `adicionar` a lista de remoção vem vazia e o passo 3 não roda. Duas ações aqui seriam
   * dois caminhos de gravação para o mesmo par de operações, e eles divergiriam na primeira
   * mudança de uma delas (`copia-divergente.md`).
   *
   * `idsParaRemover` é OBRIGATÓRIO, não opcional com default `[]`: default neutro em contrato
   * de gravação faz um produtor esquecido gravar duplicado em silêncio
   * (`construtor-empobrecido.md`). Obrigatório, o `tsc` enumera quem não passou.
   *
   * >>> E ELA DEVOLVE `boolean`, QUE É CORREÇÃO DE UM DEFEITO MEU DA RODADA ANTERIOR <<<
   *
   * `onSalvarFaixas` era `void`, e o painel chamava `msgApi.success(...)` logo depois do
   * `void acoes.onSalvarFaixas(...)`. O toast de SUCESSO saía mesmo quando a gravação falhava —
   * o usuário via os dois toasts, o de erro e o de sucesso, e nada dizia qual valia. É a mesma
   * classe das escritas mudas, do lado da apresentação. Com `Promise<boolean>`, a mensagem da
   * montagem só aparece quando a gravação voltou `true`.
   *
   * A ORDEM é de quem implementa a ação, e é insert ANTES de delete — ver `agenda/index.tsx`.
   */
  onMontarGrade: (
    novas: { employee_id: string; weekday: number; start_time: string; end_time: string }[],
    idsParaRemover: string[],
  ) => Promise<boolean>
  onRemoverFaixa: (id: string) => void | Promise<void>
  /**
   * Grava a ausência. A ASSINATURA não mudou de forma — `employee_id` continua no corpo.
   *
   * >>> O QUE MUDOU É A ORIGEM DELE <<<
   * Até 08/10/2026 vinha de um `Select` numa seção solta; agora vem da CÉLULA que abriu o
   * modal, e o `Select` deixou de existir. Decisão do dono do produto: *"onSalvarFolga NAO muda
   * de assinatura. O employee_id continua no corpo; o que muda e a origem dele."*
   *
   * >>> ELA PASSOU DE `void | Promise<void>` PARA `Promise<boolean>` <<<
   * Pela mesma razão de `onMontarGrade`: com `void`, o painel emitia o toast de sucesso logo
   * depois de chamar a ação, e o sucesso saía mesmo com a gravação falhando. O modal também
   * não pode FECHAR sobre uma gravação falha — o usuário perderia o que digitou sem saber que
   * perdeu. Com o `boolean`, fechar e avisar dependem do retorno.
   */
  onSalvarFolga: (folga: {
    employee_id: string
    starts_at: string
    ends_at: string
    reason?: string
  }) => Promise<boolean>
  onRemoverFolga: (id: string) => void | Promise<void>
  /** §2 — liga ou desliga TODAS as faixas do funcionário de uma vez. */
  onAlternarFuncionario: (employee_id: string, ativo: boolean) => void | Promise<void>
  /** §3 — copia a grade da origem para os destinos. SUBSTITUI a grade de cada destino. */
  onAplicarGrade: (origem_id: string, destino_ids: string[]) => void | Promise<void>
}

export interface PainelDeAgendamentoProps {
  open: boolean
  onClose: () => void
  /** `currentUser.calcType`. O painel só existe para Prestação de Serviços. */
  calcType: unknown
  dados: DadosDoAgendamento
  acoes: AcoesDoPainel
  /** A origem do link. Em teste e em SSR não há `window`. */
  baseUrl?: string
  /**
   * Os valores com que o compositor do CABEÇALHO abre.
   *
   * >>> É PROP COM DEFAULT REAL, NÃO COSTURA DE TESTE <<<
   *
   * O default (nada marcado, 09:00–12:00 e 14:00–18:00) é o que o dono do salão encontra ao
   * abrir a tela. O portão a usa para chegar à asserção de COMPORTAMENTO sem ter de operar
   * `TimePicker` dentro do jsdom — operar o widget afirmaria que o antd funciona, não que a
   * grade foi montada.
   *
   * Ela SUBSTITUIU `faixaInicial`, que semeava o compositor por célula. Aquele compositor não
   * existe mais, e manter as duas props seria deixar uma semente sem campo para semear.
   */
  montagemInicial?: {
    profissionais?: string[]
    dias?: number[]
    /**
     * As faixas com que o compositor abre. Uma ou mais.
     *
     * >>> SUBSTITUIU `faixa1` + `faixa2` + `comSegundaFaixa` EM 08/10/2026, TERCEIRA RODADA <<<
     *
     * Aqueles três campos codificavam o limite de duas na própria assinatura: para semear três
     * faixas não havia campo, e `comSegundaFaixa` era um booleano que só fazia sentido com
     * exatamente duas. Uma lista não tem esse problema — e manter os três ao lado dela seriam
     * duas formas de semear o mesmo estado (`copia-divergente.md`).
     */
    faixas?: { inicio: string; fim: string }[]
  }
  /**
   * Os valores com que o modal de ausência ABRE, e de qual profissional ele já está aberto.
   *
   * >>> PROP COM DEFAULT REAL, NÃO COSTURA DE TESTE <<<
   *
   * O default é o modal fechado e os campos vazios — o que o dono do salão encontra. O portão a
   * usa para chegar à asserção de COMPORTAMENTO sem operar o calendário do antd dentro do
   * jsdom; operar o widget afirmaria que o antd funciona, não que a ausência foi gravada.
   *
   * Ela SUBSTITUIU `folgaInicial`, que semeava a seção solta. `abertoPara` é novo e necessário:
   * com o modal por célula, semear as datas não basta — é preciso dizer de QUEM é o modal.
   *
   * Os valores são ISO, como o banco grava; o que o caso afirma é o que a TELA exibe.
   */
  ausenciaInicial?: {
    /** O `employee_id` da célula cujo modal já está aberto. Ausente = modal fechado. */
    abertoPara?: string
    starts_at?: string
    ends_at?: string
    reason?: string
  }
}

/** O link que a fase 2 vai atender. Exibido aqui, e ainda sem página do outro lado. */
export function montarLinkPublico(baseUrl: string, token: string): string {
  return `${String(baseUrl || '').replace(/\/+$/, '')}/agendar/${token}`
}

export function PainelDeAgendamento(props: PainelDeAgendamentoProps) {
  const { open, onClose, calcType, dados, acoes, baseUrl } = props
  const [msgApi, msgCtx] = message.useMessage()

  // ══ O COMPOSITOR DO CABEÇALHO — UM, GLOBAL, NÃO UM POR FUNCIONÁRIO ══════════════════
  //
  // >>> DUAS FORMAS DE MONTAR GRADE DIVERGEM COM O TEMPO <<<
  //
  // Até 08/10/2026 havia um compositor dentro de CADA célula, mais um botão de replicar a grade
  // de um para os outros. Eram dois caminhos para a mesma coisa, e o segundo nasceu justamente
  // porque o primeiro era trabalhoso em cinco profissionais. O redesenho do dono do produto
  // apagou os dois e pôs UM compositor no cabeçalho, que escolhe quem e quais dias.
  //
  // Manutenção individual se faz marcando SÓ aquele profissional aqui, e removendo faixa pela
  // lixeira da célula dele. Não há terceiro caminho, e reintroduzir um recria a divergência.
  const [montProfs, setMontProfs] = useState<string[]>(props.montagemInicial?.profissionais ?? [])
  const [montDias, setMontDias] = useState<number[]>(props.montagemInicial?.dias ?? [])
  // ══ AS FAIXAS SÃO UMA LISTA, SEM LIMITE DE DUAS ════════════════════════════════════
  //
  // Terceira rodada do PO de 08/10/2026. Eram `montF1`, `montF2` e um booleano `comSegundaFaixa`
  // — três pedaços de estado que codificavam o número DOIS na própria forma. Com a lista, somar
  // uma faixa é `push` e tirar é `filter`, e o rótulo "Faixa N" é a posição, não um nome.
  //
  // A primeira NUNCA é removível: `montFaixas` nasce com uma e `removerFaixa` não é oferecida
  // no índice 0. Uma lista vazia faria `montarGrade` recusar com "Informe ao menos uma faixa",
  // o que está correto — mas a tela não deve permitir chegar nesse estado por clique.
  const [montFaixas, setMontFaixas] = useState<FaixaInformada[]>(
    props.montagemInicial?.faixas?.length
      ? props.montagemInicial.faixas
      : [{ inicio: '09:00', fim: '12:00' }],
  )
  // Quem o usuário abriu ou fechou à mão. O default vem do estado do funcionário, abaixo.
  const [recolhidoManual, setRecolhidoManual] = useState<Record<string, boolean>>({})
  const [montErro, setMontErro] = useState<string | null>(null)
  // A confirmação do SUBSTITUIR. `adicionar` nunca passa por aqui — ele não destrói nada.
  const [confirmandoSubstituir, setConfirmandoSubstituir] = useState(false)
  const [gravando, setGravando] = useState(false)

  // ══ O MODAL DE AUSÊNCIA — UM POR VEZ, E O PROFISSIONAL É A CÉLULA QUE O ABRIU ════════
  //
  // >>> `ausenciaEmp` É O PROFISSIONAL *E* O ESTADO DE ABERTURA <<<
  //
  // `null` = fechado. Um `boolean` separado ao lado seria um segundo estado dizendo a mesma
  // coisa, e os dois divergiriam no primeiro caminho que esquecesse de atualizar um deles
  // (`copia-divergente.md` em forma de `useState`). Com um campo só, aberto sem profissional é
  // um estado que não existe.
  //
  // Eram cinco pedaços GLOBAIS da seção solta — `folgaEmp` com um `Select`, mais as datas, o
  // motivo e o erro. Renascem aqui, zerados a cada abertura, porque a ausência de um
  // profissional não tem nada a ver com o rascunho aberto no outro.
  const [ausenciaEmp, setAusenciaEmp] = useState<string | null>(
    props.ausenciaInicial?.abertoPara ?? null,
  )
  const [ausenciaIni, setAusenciaIni] = useState<string>(props.ausenciaInicial?.starts_at ?? '')
  const [ausenciaFim, setAusenciaFim] = useState<string>(props.ausenciaInicial?.ends_at ?? '')
  const [ausenciaMotivo, setAusenciaMotivo] = useState<string>(props.ausenciaInicial?.reason ?? '')
  const [erroDaAusencia, setErroDaAusencia] = useState<string | null>(null)
  const [gravandoAusencia, setGravandoAusencia] = useState(false)

  const funcionarios = dados?.funcionarios ?? []
  const grade = dados?.grade ?? []

  const faixasPorEmp = useMemo(() => {
    const m: Record<string, FaixaGravada[]> = {}
    for (const f of grade) {
      if (!m[f.employee_id]) m[f.employee_id] = []
      m[f.employee_id].push(f)
    }
    return m
  }, [grade])

  // ══ AS AUSÊNCIAS, AGRUPADAS POR PROFISSIONAL E JÁ ORDENADAS ═════════════════════════
  //
  // >>> ESTE `useMemo` FICA ACIMA DO GATE DE SEGMENTAÇÃO, COMO TODOS OS OUTROS <<<
  // Hook condicional quebra o React com "Rendered more hooks than during the previous render"
  // no instante em que o `calcType` muda de SERVICO para outro. Já aconteceu neste arquivo.
  //
  // `dados.folgas` chega como lista PLANA, com `employee_id` em cada item — a seção solta não
  // filtrava por profissional porque era global. A célula precisa do grupo, e o agrupamento
  // mora aqui pela mesma razão de `faixasPorEmp`: uma vez por mudança de dados, não uma por
  // célula renderizada.
  //
  // `agora` é capturado UMA vez por mudança de `folgas`, e é passado para `ordenarAusencias` —
  // a função não lê o relógio. Chamar `new Date()` dentro dela faria o mesmo dado produzir
  // resultados diferentes conforme o minuto da renderização.
  const ausenciasPorEmp = useMemo(() => {
    const agora = new Date()
    const m: Record<string, ReturnType<typeof ordenarAusencias>> = {}
    const porEmp: Record<string, FolgaGravada[]> = {}
    for (const fo of dados?.folgas ?? []) {
      if (!fo) continue
      if (!porEmp[fo.employee_id]) porEmp[fo.employee_id] = []
      porEmp[fo.employee_id].push(fo)
    }
    for (const [empId, lista] of Object.entries(porEmp)) {
      m[empId] = ordenarAusencias({ ausencias: lista, agora })
    }
    return m
  }, [dados?.folgas])

  const cfg = dados?.configuracao ?? null
  // >>> ESTE `useMemo` FICA ANTES DO `return null`, E NÃO É ARRUMAÇÃO <<<
  // A primeira versão o deixou depois do gate de segmentação: hook condicional, que o React
  // quebra com "Rendered more hooks than during the previous render" no instante em que o
  // `calcType` muda de SERVICO para outro. Todo hook deste componente mora acima do gate.
  //
  // As faixas no formato que `montarGrade` lê. Uma conversão só, aqui, em vez de o utilitário
  // conhecer `FaixaGravada` — ele é puro e não deve saber o nome das colunas do banco.
  const existentesParaMontagem = useMemo<FaixaExistente[]>(
    () => grade.map((f) => ({
      id: f.id,
      employee_id: f.employee_id,
      weekday: f.weekday,
      start_time: String(f.start_time).slice(0, 5),
      end_time: String(f.end_time).slice(0, 5),
    })),
    [grade],
  )

  // >>> O GATE DA SEGMENTAÇÃO É `tenantOffersServices`, NÃO UMA COMPARAÇÃO LOCAL <<<
  // `segment-visibility.ts` já é fonte única do menu, do mobile e das permissões. Escrever
  // `calcType === 'SERVICE'` aqui seria a quarta cópia do critério, e ela divergiria no dia em
  // que o banco gravasse `SERVICO` e a UI `SERVICE` — que é exatamente o caso que aquela função
  // trata (`copia-divergente.md`).
  if (!tenantOffersServices(calcType)) return null

  function abrirAusencia(empId: string) {
    // Zera o rascunho a cada abertura: o que o usuário digitou para um profissional não deve
    // aparecer no modal do outro.
    setAusenciaEmp(empId)
    setAusenciaIni('')
    setAusenciaFim('')
    setAusenciaMotivo('')
    setErroDaAusencia(null)
  }

  function fecharAusencia() {
    setAusenciaEmp(null)
    setErroDaAusencia(null)
  }

  async function salvarAusencia() {
    if (!ausenciaEmp) return

    // >>> A VALIDAÇÃO É O UTILITÁRIO PURO, E `existentes` VEM FILTRADA DAQUI <<<
    // `validarAusencia` não conhece `employee_id` — há caso provando que ela não filtra. Quem
    // filtra é esta linha, e é por isso que ela existe em vez de a função fazer o trabalho:
    // uma função que filtrasse por profissional convidaria a tela a parar de filtrar.
    const r = validarAusencia({
      inicio: ausenciaIni || null,
      fim: ausenciaFim || null,
      existentes: (ausenciasPorEmp[ausenciaEmp] ?? []).map((a) => ({
        id: a.id,
        starts_at: a.starts_at,
        ends_at: a.ends_at,
      })),
    })

    if (ausenciaRecusada(r)) {
      // O erro aparece DENTRO do modal, e o modal NÃO fecha nem grava. As três coisas.
      setErroDaAusencia(r.erro)
      return
    }
    setErroDaAusencia(null)

    setGravandoAusencia(true)
    try {
      // >>> O `await` E O `boolean` SÃO O QUE IMPEDE FECHAR SOBRE UMA FALHA <<<
      // Com `void`, o modal fechava e o toast de sucesso saía mesmo quando a gravação falhava —
      // e o usuário perdia o que digitou sem saber que perdeu.
      const gravou = await acoes.onSalvarFolga({
        employee_id: ausenciaEmp,
        starts_at: r.inicio,
        ends_at: r.fim,
        reason: ausenciaMotivo || undefined,
      })
      if (!gravou) return
      msgApi.success('Ausência registrada.')
      fecharAusencia()
    } finally {
      setGravandoAusencia(false)
    }
  }

  // ══ O PLANO DO CLIQUE, CALCULADO A CADA RENDER, PARA OS DOIS MODOS ══════════════════
  //
  // >>> O AVISO E A GRAVAÇÃO LEEM O MESMO RETORNO <<<
  //
  // Chamar `montarGrade` aqui, antes do clique, é de propósito: o aviso, a confirmação e a
  // gravação passam a ler o MESMO resultado, em vez de a tela recalcular "quais dias já têm
  // faixa" por conta. Duas contas do mesmo critério divergem (`copia-divergente.md`), e a que
  // divergiria é a que o usuário lê antes de apagar a semana de alguém.
  // >>> O ESTADO *É* O QUE `montarGrade` RECEBE — NÃO HÁ CONVERSÃO <<<
  // Antes havia um ternário montando a lista a partir de dois campos e um booleano. A conversão
  // era o lugar em que o limite de duas vivia; sem ela, o limite deixa de existir.
  const faixasInformadas = montFaixas

  /** O padrão da faixa NOVA: 14:00–18:00 na segunda, e depois uma hora de folga por faixa. */
  function proximaFaixaPadrao(quantas: number): FaixaInformada {
    if (quantas === 1) return { inicio: '14:00', fim: '18:00' }
    const inicio = Math.min(19 + (quantas - 2) * 2, 22)
    return { inicio: `${String(inicio).padStart(2, '0')}:00`, fim: `${String(Math.min(inicio + 2, 23)).padStart(2, '0')}:00` }
  }

  // >>> A TRAVA DE SANIDADE É 10, E ELA É DA TELA — NÃO DO UTILITÁRIO <<<
  // O comando deixou a trava opcional e sugeriu 10; está em 10. `montarGrade` NÃO tem limite
  // próprio, e há caso afirmando que ele aceita 10 — os dois fatos são independentes de
  // propósito, para que ninguém "corrija" o lado errado ao mexer num deles.
  //
  // O botão NÃO desaparece no limite: o comando diz que ele nunca some. Ele fica desabilitado,
  // com o motivo ao lado. Um botão que desaparece sem dizer por quê deixa o usuário procurando.
  const LIMITE_DE_FAIXAS = 10

  function acrescentarFaixa() {
    setMontErro(null)
    setConfirmandoSubstituir(false)
    setMontFaixas((p) => (p.length >= LIMITE_DE_FAIXAS
      ? p
      : [...p, proximaFaixaPadrao(p.length)]))
  }

  /**
   * Tira a faixa da posição `i`, e os rótulos RENUMERAM sozinhos.
   *
   * Remover a 2 de três faz a antiga 3 virar "Faixa 2" — porque o rótulo é `i + 1`, a posição
   * na lista, e não um identificador guardado junto da faixa. Guardar o número tornaria a
   * renumeração uma segunda operação, que alguém esqueceria de fazer.
   */
  function removerFaixa(i: number) {
    setMontErro(null)
    setConfirmandoSubstituir(false)
    // A primeira não é removível, e a guarda está aqui também, não só na ausência do botão:
    // a tela é uma das duas portas, e a outra é esta.
    if (i === 0) return
    setMontFaixas((p) => p.filter((_, k) => k !== i))
  }

  function mexerNaFaixa(i: number, patch: Partial<FaixaInformada>) {
    setMontErro(null)
    setMontFaixas((p) => p.map((f, k) => (k === i ? { ...f, ...patch } : f)))
  }

  function planoDe(modo: ModoDaMontagem) {
    return montarGrade({
      profissionais: montProfs,
      dias: montDias,
      faixas: faixasInformadas,
      modo,
      existentes: existentesParaMontagem,
    })
  }

  function nomeDoProfissional(id: string) {
    return funcionarios.find((f) => f.id === id)?.name ?? id
  }

  // ══ OS PARES (profissional, dia) QUE DE FATO TÊM FAIXA ═════════════════════════════
  //
  // Alimenta o aviso do SUBSTITUIR e a confirmação. Sai do produto marcado cruzado com a grade
  // vinda do banco — nunca de `idsParaRemover`, que é uma lista de ids e não diz de quem nem
  // de que dia cada um é.
  //
  // Um dia marcado e VAZIO não entra: ele não "vai ser substituído", e dizer que vai ensina o
  // usuário a ignorar o aviso (`ausente-vs-falso.md`).
  const paresComFaixa = montProfs.flatMap((employee_id) => montDias
    .filter((weekday) => existentesParaMontagem.some(
      (f) => f.employee_id === employee_id && f.weekday === weekday,
    ))
    .map((weekday) => ({ employee_id, weekday })))

  // As combinações que o ADICIONAR pularia, calculadas antes do clique para alimentar o aviso.
  // Sai do próprio `montarGrade`, não de uma segunda conta de colisão na tela — o aviso e a
  // gravação têm de ler o mesmo critério (`copia-divergente.md`).
  const planoAdicionar = planoDe('adicionar')
  const puladasDoAdicionar = montagemRecusada(planoAdicionar) ? [] : planoAdicionar.puladas

  function limparDepoisDeGravar() {
    setMontErro(null)
    setConfirmandoSubstituir(false)
  }

  async function gravar(modo: ModoDaMontagem) {
    const r = planoDe(modo)
    if (montagemRecusada(r)) {
      // A RECUSA: a mensagem aparece E a gravação não acontece. As duas coisas, não uma.
      setMontErro(r.erro)
      return
    }
    setMontErro(null)

    if (r.novas.length === 0) {
      // Só acontece em `adicionar`, quando TODAS as combinações colidiram. Não é erro, e não é
      // sucesso: gravar zero linhas e dizer "faixa adicionada" afirmaria o que não aconteceu.
      setMontErro(mensagemDeNadaAGravar(r.puladas.length))
      return
    }

    setGravando(true)
    try {
      // >>> O `await` E O `boolean` SÃO O QUE IMPEDE O TOAST MENTIROSO <<<
      // Na rodada anterior o painel chamava a ação com `void` e emitia sucesso em seguida; o
      // toast saía mesmo com a gravação falhando. Aqui a mensagem depende do retorno.
      const gravou = await acoes.onMontarGrade(r.novas, r.idsParaRemover)
      if (!gravou) return
      msgApi.success(
        modo === 'substituir'
          ? mensagemDoSubstituir(montProfs.length, montDias.length)
          : mensagemDoAdicionar(r.novas.length, r.puladas.length),
      )
      limparDepoisDeGravar()
    } finally {
      setGravando(false)
    }
  }

  function clicarSubstituir() {
    const r = planoDe('substituir')
    if (montagemRecusada(r)) { setMontErro(r.erro); return }
    // >>> A CONFIRMAÇÃO SÓ APARECE QUANDO HÁ O QUE PERDER <<<
    // Pedir confirmação sempre ensina a clicar sem ler, e aí ela não protege no caso em que
    // importa. Pedir nunca apaga grade montada à mão sem aviso.
    if (r.idsParaRemover.length > 0 && !confirmandoSubstituir) {
      setConfirmandoSubstituir(true)
      return
    }
    void gravar('substituir')
  }

  /**
   * A linha de variáveis, UMA vez, reaproveitada nas TRÊS caixas.
   *
   * >>> É UM NÓ JSX NUM `const`, E ISSO É DELIBERADO <<<
   *
   * Escrever a frase três vezes na tela faria a quarta variável entrar em duas e ficar de fora
   * da terceira — `copia-divergente.md`, e o sintoma seria a tela oferecendo listas diferentes
   * em caixas vizinhas. Com um nó só, acrescentar variável vale para as três.
   *
   * A lista vem de `VARIAVEIS_DAS_MENSAGENS`, que é a MESMA constante que
   * `mensagens-agendamento-padrao.ts` exporta e que o portão daquele arquivo já afirma.
   *
   * >>> ATENÇÃO AO `{codigo}`: ELE É OFERECIDO E NÃO É INTERPOLADO EM NENHUMA DAS TRÊS <<<
   *
   * Medido em 09/10/2026 nas rotas públicas. Nenhuma das três passa `codigo` em `vars`:
   *
   *   · `agendar.ts:189`   → cliente, servico, data, hora, empresa, profissional
   *   · `cancelar.ts:148`  → cliente, servico, profissional, data, hora, empresa
   *   · `remarcar.ts:159`  → cliente, servico, profissional, data, hora, empresa
   *
   * Só `codigo-solicitar.ts:198` o interpola, e essa mensagem NÃO é editável pela tenant.
   *
   * O comando desta rodada supôs o contrário ("a Fase 2B entregou cancelar e remarcar, então
   * ele voltou a ter função") e mandou conferir e relatar. A conferência diz que ele NÃO está
   * ligado, e a decisão de tirá-lo da lista — ou de ligá-lo nas rotas — é do dono do produto:
   * as duas são mudança de comportamento, e esta rodada é de rótulo. Fica relatado.
   */
  const linhaDeVariaveis = (
    <div style={{ color: '#98A2B3', fontSize: 12, marginBottom: 6 }}>
      Variáveis disponíveis: {VARIAVEIS_DAS_MENSAGENS.join(' ')}
    </div>
  )

  const linkOrigem = baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '')
  const link = cfg ? montarLinkPublico(linkOrigem, cfg.public_token) : null

  return (
    <Drawer title="Criar link de agendamento" placement="right" width={760} open={open} onClose={onClose} destroyOnClose>
      {msgCtx}

      {/* ══ 1. GRADE DE ATENDIMENTO — TODOS os funcionários, ao mesmo tempo (§2) ══════════ */}
      <section style={{ marginBottom: 32 }}>
        <h3 style={{ marginTop: 0 }}>Grade de atendimento</h3>

        {/* ══════════════════════════════════════════════════════════════════════════════
            MONTAR GRADE — o compositor ÚNICO, no cabeçalho, antes das células
            ══════════════════════════════════════════════════════════════════════════════
            >>> ELE FICA ANTES DAS CÉLULAS, E A ORDEM É A DO TRABALHO <<<
            As células são o RESULTADO; este bloco é a AÇÃO que as produz. Com ele depois, o
            dono do salão rolava cinco células para chegar ao único lugar em que se digita.

            >>> E ELE É O ÚNICO LUGAR EM QUE SE MONTA GRADE <<<
            Não há compositor dentro das células, nem botão de replicar de um para os outros.
            Duas formas divergem com o tempo, e a segunda nasceu porque a primeira era
            trabalhosa — o que esta resolve de outro jeito, deixando marcar vários de uma vez. */}
        {funcionarios.length > 0 && (
          <div
            style={{
              border: '1px solid rgba(255,255,255,0.18)',
              borderRadius: 10,
              padding: 12,
              marginBottom: 16,
            }}
          >
            <strong style={{ display: 'block', marginBottom: 8 }}>Montar grade</strong>

            {/* ── Profissionais ────────────────────────────────────────────────────── */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ color: '#667085', marginBottom: 4 }}>Profissionais:</div>
              <Space wrap>
                {/* "Todos" é uma CAIXA, não um botão: com cinco profissionais marcar um por um
                    é o caso comum, e um botão que "marca todos" não mostra que está marcado.
                    Indeterminado na seleção parcial, para não afirmar nem um nem outro — igual
                    ao que a réplica fazia para os destinos. */}
                <Checkbox
                  aria-label="Todos os profissionais"
                  checked={funcionarios.length > 0 && montProfs.length === funcionarios.length}
                  indeterminate={montProfs.length > 0 && montProfs.length < funcionarios.length}
                  onChange={(e) => {
                    setMontErro(null)
                    setConfirmandoSubstituir(false)
                    setMontProfs(e.target.checked ? funcionarios.map((f) => f.id) : [])
                  }}
                >
                  <strong>Todos</strong>
                </Checkbox>
                {funcionarios.map((f) => (
                  <Checkbox
                    key={f.id}
                    aria-label={`Montar para ${f.name}`}
                    checked={montProfs.includes(f.id)}
                    onChange={(e) => {
                      setMontErro(null)
                      setConfirmandoSubstituir(false)
                      setMontProfs((p) => (e.target.checked ? [...p, f.id] : p.filter((x) => x !== f.id)))
                    }}
                  >
                    {f.name}
                  </Checkbox>
                ))}
              </Space>
            </div>

            {/* ── Dias ─────────────────────────────────────────────────────────────── */}
            {/* `DIAS_DA_SEMANA` é a fonte única; `weekday` continua 0=Domingo..6=Sábado,
                igual à coluna do banco. Nenhum array local de dias neste arquivo. */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ color: '#667085', marginBottom: 4 }}>Dias:</div>
              <Space wrap>
                {DIAS_DA_SEMANA.map((d) => (
                  <Checkbox
                    key={d.weekday}
                    aria-label={`Dia ${d.label}`}
                    checked={montDias.includes(d.weekday)}
                    onChange={(e) => {
                      setMontErro(null)
                      setConfirmandoSubstituir(false)
                      setMontDias((p) => (e.target.checked
                        ? [...p, d.weekday]
                        : p.filter((x) => x !== d.weekday)))
                    }}
                  >
                    {d.curto}
                  </Checkbox>
                ))}
              </Space>
            </div>

            {/* ── AS FAIXAS, UMA LINHA CADA, ROTULADAS PELA POSIÇÃO ───────────────────
                >>> O RÓTULO É `i + 1`, E É ISSO QUE FAZ A RENUMERAÇÃO ACONTECER <<<
                Remover a 2 de três faz a antiga 3 virar "Faixa 2" sem nenhuma linha de código
                para isso — porque o número não está guardado junto da faixa, é a posição na
                lista. Guardá-lo tornaria a renumeração uma segunda operação, e segunda operação
                é o que alguém esquece de fazer.

                A PRIMEIRA não tem "remover": sempre há ao menos uma. A guarda está em dois
                lugares, aqui e em `removerFaixa` — a tela é uma porta, a função é a outra. */}
            {montFaixas.map((f, i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <div style={{ color: '#667085', marginBottom: 4 }}>{`Faixa ${i + 1}:`}</div>
                <Space wrap>
                  <TimePicker
                    format="HH:mm"
                    aria-label={`Início da faixa ${i + 1}`}
                    value={f.inicio ? dayjs(f.inicio, 'HH:mm') : null}
                    onChange={(v) => mexerNaFaixa(i, { inicio: v ? v.format('HH:mm') : '' })}
                  />
                  <TimePicker
                    format="HH:mm"
                    aria-label={`Fim da faixa ${i + 1}`}
                    value={f.fim ? dayjs(f.fim, 'HH:mm') : null}
                    onChange={(v) => mexerNaFaixa(i, { fim: v ? v.format('HH:mm') : '' })}
                  />
                  {i > 0 && (
                    <Button
                      type="link"
                      aria-label={`Remover a faixa ${i + 1}`}
                      onClick={() => removerFaixa(i)}
                    >
                      remover
                    </Button>
                  )}
                </Space>
              </div>
            ))}

            {/* ── O BOTÃO DE ACRESCENTAR, QUE NUNCA SOME ──────────────────────────────
                Até a segunda rodada ele era "+ adicionar segunda faixa" e DESAPARECIA depois
                de revelar a segunda — o que fechava a porta para a terceira. Agora ele fica,
                sempre, e o rótulo perdeu o "segunda" porque ele não acrescenta uma faixa
                específica: acrescenta a próxima.

                No limite de sanidade ele NÃO desaparece, fica desabilitado com o motivo ao
                lado. Botão que some sem dizer por quê deixa o usuário procurando. */}
            <Space wrap>
              <Button
                type="link"
                style={{ paddingLeft: 0 }}
                aria-label="Acrescentar faixa"
                disabled={montFaixas.length >= LIMITE_DE_FAIXAS}
                onClick={acrescentarFaixa}
              >
                + adicionar faixa
              </Button>
              {montFaixas.length >= LIMITE_DE_FAIXAS && (
                <span style={{ color: '#98A2B3', fontSize: 12 }}>
                  {`Limite de ${LIMITE_DE_FAIXAS} faixas por montagem.`}
                </span>
              )}
            </Space>

            {/* ── As duas ações, lado a lado ───────────────────────────────────────── */}
            {/* >>> ELAS NÃO SÃO VARIAÇÕES DE GRAU <<<
                `Substituir` é MONTAGEM: limpa os dias marcados e grava. `Adicionar` é AJUSTE:
                não apaga nada e pula a combinação que colidir. Ter só a primeira era o defeito
                que originou a rodada — com ela sozinha, gravar a tarde apagava a manhã. */}
            <div style={{ marginTop: 10 }}>
              <Space wrap>
                {/* >>> OS DOIS BOTÕES TÊM `aria-label` DISTINTO DO TEXTO, E A RAZÃO É MEDIDA <<<
                    O modal da confirmação também traz um botão escrito "Substituir" — é o que
                    o comando do PO pede, literalmente. Com os dois na tela, um seletor por
                    texto acha DOIS e não sabe em qual clicar; o portão mediu isso e a guarda
                    `toBe(1)` do helper derrubou o caso. O `aria-label` separa os dois sem
                    mudar uma letra do que o usuário lê. */}
                <Button
                  type="primary"
                  aria-label="Substituir a grade"
                  loading={gravando}
                  onClick={clicarSubstituir}
                >
                  Substituir
                </Button>
                <Button
                  aria-label="Adicionar à grade"
                  loading={gravando}
                  onClick={() => void gravar('adicionar')}
                >
                  Adicionar
                </Button>
              </Space>
            </div>

            {/* ── O AVISO, ANTES DO CLIQUE, PARA OS DOIS MODOS EM LINHAS SEPARADAS ─── */}
            {/* >>> ESCOLHA: OS DOIS AO MESMO TEMPO, EM LINHAS SEPARADAS <<<
                O comando deixou a escolha entre "o do modo que o mouse/foco indica" e "os dois
                em linhas separadas". Os DOIS, e a razão é que `hover` não existe no toque e
                `focus` não existe antes de o usuário tabular: um aviso que depende deles não
                aparece no celular, e um aviso que não aparece é `portao-que-nao-alcanca.md` em
                forma de interface. Cada linha diz qual botão a produz, para que ninguém leia o
                aviso do substituir e clique em adicionar. */}
            {avisoDoSubstituir(paresComFaixa, nomeDoProfissional) && (
              <div style={{ marginTop: 8 }}>
                <Alert
                  type="warning"
                  showIcon
                  message={`Substituir: ${avisoDoSubstituir(paresComFaixa, nomeDoProfissional)}`}
                />
              </div>
            )}
            {avisoDoAdicionar(puladasDoAdicionar, nomeDoProfissional) && (
              <div style={{ marginTop: 8 }}>
                <Alert
                  type="info"
                  showIcon
                  message={`Adicionar: ${avisoDoAdicionar(puladasDoAdicionar, nomeDoProfissional)}`}
                />
              </div>
            )}

            {montErro && (
              <div style={{ marginTop: 8 }}>
                <Alert type="error" showIcon message={montErro} />
              </div>
            )}
          </div>
        )}

        {funcionarios.length === 0 ? (
          <Empty description="Nenhum profissional ativo." />
        ) : (
          funcionarios.map((f) => {
            const faixas = faixasPorEmp[f.id] ?? []
            const estado = estadoDoFuncionarioNoLink(faixas)
            const resolucao = resolverTabelaDeServico(f.tabelas ?? [])
            const avisoTabela = avisoDaTabelaDeServico(resolucao)
            const avisoAcesso = avisoDeFuncionarioSemAcesso(f)
            // Recolhido por padrão quando DESLIGADO — para a lista de cinco caber na tela. O
            // SEM_GRADE fica aberto de propósito: é nele que falta trabalho a fazer.
            const recolhido = recolhidoManual[f.id] ?? (estado === 'DESLIGADO')

            return (
              <div
                key={f.id}
                // >>> `data-emp` EXISTE PARA QUE O PORTÃO POSSA RECORTAR A CÉLULA <<<
                // Com a ausência dentro da célula, o caso do vazamento entre profissionais
                // precisa afirmar "isto está NA célula de e1 e NÃO na de e3" — e recortar por
                // TEXTO não funciona: o nome reaparece dentro da própria célula ("Ocultar grade
                // de Barbeiro Um"), então a fatia acaba vazia. Medido: a primeira versão do
                // caso ficou vermelha com a fatia valendo só "Barbeiro Um".
                // É o atributo que torna a asserção possível, não enfeite.
                data-emp={f.id}
                style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: 12, marginBottom: 12 }}
              >
                {/* O NOME E O SWITCH FICAM FORA DO RECOLHÍVEL: a lista tem de mostrar os cinco
                    profissionais mesmo com os blocos fechados — é o pedido do §2. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <strong style={{ minWidth: 160 }}>{f.name}</strong>
                  <Tooltip title={SELO_DO_ESTADO[estado]}>
                    <Switch
                      aria-label={`Aceita agendamento pelo link — ${f.name}`}
                      checked={estado === 'LIGADO'}
                      disabled={estado === 'SEM_GRADE'}
                      onChange={(v) => void acoes.onAlternarFuncionario(f.id, v)}
                    />
                  </Tooltip>
                  <span style={{ color: '#98A2B3', fontSize: 12 }}>{SELO_DO_ESTADO[estado]}</span>
                  <Button
                    size="small"
                    type="link"
                    onClick={() => setRecolhidoManual((p) => ({ ...p, [f.id]: !recolhido }))}
                  >
                    {recolhido ? `Mostrar grade de ${f.name}` : `Ocultar grade de ${f.name}`}
                  </Button>
                </div>

                {!recolhido && (
                  <div style={{ marginTop: 10 }}>
                    {/* qual tabela de SERVIÇO está vinculada */}
                    {resolucao.estado === 'UMA' && (
                      <div style={{ marginBottom: 6 }}>
                        Tabela de serviço: <Tag color="blue">{resolucao.tabela.name}</Tag>
                      </div>
                    )}
                    {avisoTabela && <Alert type="warning" showIcon message={avisoTabela} style={{ marginBottom: 6 }} />}
                    {avisoAcesso && <Alert type="warning" showIcon message={avisoAcesso} style={{ marginBottom: 6 }} />}

                    {/* >>> O COMPOSITOR SAIU DA CÉLULA EM 08/10/2026, E NÃO VOLTA <<<
                        Redesenho do dono do produto depois de usar a tela. Havia aqui sete
                        caixas de dia, dois `TimePicker` e um botão — e, abaixo, um botão de
                        replicar a grade deste profissional para os outros. Eram DUAS formas de
                        montar grade, e a segunda nasceu porque a primeira era trabalhosa em
                        cinco profissionais.

                        Duas formas divergem com o tempo. O compositor do cabeçalho passou a ser
                        a única, e escolhe quem e quais dias. Manutenção individual se faz
                        marcando SÓ este profissional lá em cima, e removendo faixa pela lixeira
                        abaixo. Reintroduzir um compositor aqui recria a divergência
                        (`razao-longe-da-restricao.md`: a razão vive no ponto onde a restrição é
                        declarada, e este é o ponto). */}

                    {/* ══ A GRADE GRAVADA, DOMINGO A SÁBADO ═════════════════════════════ */}
                    <div style={{ marginTop: 12 }}>
                      {DIAS_DA_SEMANA.map((d) => {
                        const doDia = faixas.filter((x) => x.weekday === d.weekday)
                        return (
                          <div key={d.weekday} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '3px 0' }}>
                            <span style={{ width: 80, color: '#667085' }}>{d.label}</span>
                            {doDia.length === 0 ? (
                              <span style={{ color: '#98A2B3' }}>—</span>
                            ) : (
                              <Space wrap>
                                {doDia.map((x) => (
                                  <Tag key={x.id} color={x.is_active === false ? 'default' : 'green'}>
                                    {String(x.start_time).slice(0, 5)}–{String(x.end_time).slice(0, 5)}
                                    <Popconfirm title="Remover esta faixa?" onConfirm={() => void acoes.onRemoverFaixa(x.id)}>
                                      <DeleteOutlined style={{ marginLeft: 8 }} aria-label={`Remover faixa ${x.id}`} />
                                    </Popconfirm>
                                  </Tag>
                                ))}
                              </Space>
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {/* ══ AS AUSÊNCIAS DESTE PROFISSIONAL ══════════════════════════════
                        >>> SÓ AS DELE, E O FILTRO É `ausenciasPorEmp[f.id]` <<<
                        A seção solta listava as de todos, com o nome do dono em cada linha —
                        e com cinco profissionais isso vira uma lista em que ninguém acha a
                        própria. Aqui não há nome na linha, porque a célula já diz de quem é.

                        A ordem e o esmaecimento vêm de `ordenarAusencias`, com `agora`
                        injetado: futuras e em curso primeiro por data crescente, passadas no
                        fim por data decrescente. As passadas NÃO somem — são histórico. */}
                    <div style={{ marginTop: 14 }}>
                      <strong style={{ display: 'block', marginBottom: 6 }}>Ausências</strong>
                      {(ausenciasPorEmp[f.id] ?? []).length === 0 ? (
                        <div style={{ color: '#98A2B3', marginBottom: 6 }}>
                          Nenhuma ausência registrada.
                        </div>
                      ) : (
                        <Space direction="vertical" style={{ width: '100%', marginBottom: 6 }}>
                          {(ausenciasPorEmp[f.id] ?? []).map((a) => (
                            <div
                              key={a.id}
                              data-passada={a.passada ? 'sim' : 'nao'}
                              style={{
                                display: 'flex',
                                gap: 10,
                                alignItems: 'center',
                                // O esmaecimento é a única diferença visual, e ele vem do
                                // `passada` que o utilitário devolveu — a tela não recalcula.
                                opacity: a.passada ? 0.45 : 1,
                              }}
                            >
                              <span>
                                {/* DIA INTEIRO: exibir `HH:mm` aqui afirmaria uma hora que o
                                    usuário não escolheu — o 00:00 e o 23:59 são derivados,
                                    não dados. O formato é o mesmo de antes. */}
                                {dayjs(a.starts_at).format('DD/MM/YYYY')} — {dayjs(a.ends_at).format('DD/MM/YYYY')}
                              </span>
                              {a.reason && <span style={{ color: '#667085' }}>{a.reason}</span>}
                              <Popconfirm
                                title="Remover esta ausência?"
                                onConfirm={() => void acoes.onRemoverFolga(a.id)}
                              >
                                <DeleteOutlined aria-label={`Remover ausência ${a.id}`} />
                              </Popconfirm>
                            </div>
                          ))}
                        </Space>
                      )}
                      <Button
                        size="small"
                        icon={<PlusOutlined />}
                        aria-label={`Adicionar ausência de ${f.name}`}
                        onClick={() => abrirAusencia(f.id)}
                      >
                        Adicionar ausência
                      </Button>
                    </div>

                  </div>
                )}
              </div>
            )
          })
        )}
      </section>

      {/* >>> A SEÇÃO "FÉRIAS, FOLGAS E FERIADOS" SAIU DAQUI EM 08/10/2026 <<<
          Ela era uma `<section>` solta, com um `Select` de profissional dentro — e a lista
          mostrava as ausências de TODOS misturadas, com o nome do dono em cada linha.

          Decisão do dono do produto: a ausência pertence ao PROFISSIONAL, não a uma seção
          separada. Ela desceu para dentro da célula dele, depois da lista Domingo..Sábado, e o
          cadastro entra por modal com o nome no título. O `Select` deixou de existir porque a
          pergunta "de quem é esta ausência?" deixou de ser feita: é da célula.

          NÃO ficou versão reduzida nem link. Recriar uma seção aqui traria de volta o `Select`
          e a lista misturada (`razao-longe-da-restricao.md`: a razão vive no ponto onde a
          ausência é declarada, e este é o ponto). */}

      {/* ══ 3. AJUSTES ═══════════════════════════════════════════════════════════════════ */}
      <section style={{ marginBottom: 32 }}>
        <h3>Ajustes</h3>
        {!cfg ? (
          <span style={{ color: '#98A2B3' }}>
            Os ajustes aparecem depois de gerar o link, abaixo — eles pertencem à configuração do link.
          </span>
        ) : (
          <Form layout="vertical">
            <Space wrap size={16}>
              {/* >>> O RÓTULO MUDOU EM 09/10/2026; A COLUNA CONTINUA `grid_minutes` <<<
                  Era "Passo da lista (min)". "Passo" é jargão de quem escreveu o cálculo, não
                  de quem usa a tela — o dono do salão pensa em distância entre um horário e o
                  seguinte. O tooltip foi reescrito para casar com o rótulo novo: ele dizia
                  "O intervalo entre os horários oferecidos" e agora fala de "distância", a
                  mesma palavra do rótulo. Um tooltip com o vocabulário antigo ao lado de um
                  rótulo novo ensina que são duas coisas. */}
              <Form.Item
                label="Distância entre horários (min)"
                tooltip="A distância entre um horário oferecido e o seguinte (09:00, 09:30…). NÃO é a duração do atendimento — essa vem do serviço."
              >
                <InputNumber aria-label="Distância entre horários" min={LIMITES.grid_minutes.min} max={LIMITES.grid_minutes.max ?? undefined}
                  value={cfg.grid_minutes} onChange={(v) => void acoes.onSalvarConfiguracao({ grid_minutes: Number(v) })} />
              </Form.Item>
              <Form.Item label="Antecedência mínima (min)">
                <InputNumber aria-label="Antecedência mínima" min={LIMITES.lead_time_min.min}
                  value={cfg.lead_time_min} onChange={(v) => void acoes.onSalvarConfiguracao({ lead_time_min: Number(v) })} />
              </Form.Item>
              <Form.Item label="Janela de agendamento (dias)">
                <InputNumber aria-label="Janela de agendamento" min={LIMITES.horizon_days.min} max={LIMITES.horizon_days.max ?? undefined}
                  value={cfg.horizon_days} onChange={(v) => void acoes.onSalvarConfiguracao({ horizon_days: Number(v) })} />
              </Form.Item>
            </Space>

            {/* §3 — AS TRÊS MENSAGENS NASCEM PREENCHIDAS, e o padrão vive em CÓDIGO.
                As colunas são NULL em produção e continuam podendo ser NULL: `DEFAULT` no banco
                apagaria a diferença entre "nunca mexeu" e "escolheu exatamente este texto"
                (`ausente-vs-falso.md`). Nada é gravado por abrir o painel — ao sair do campo vai
                o que estiver na tela, que é o padrão quando o usuário não mexeu. */}
            {/* ══ A LINHA DE VARIÁVEIS SUBIU PARA DENTRO DE CADA CAIXA, EM 09/10/2026 ══
                >>> ELA ERA UMA, EMBAIXO DAS TRÊS, E A ÚNICA SUMIU <<<
                Quem está editando a terceira mensagem tinha de rolar até o fim para ver quais
                variáveis existem — e quem edita a primeira não via a linha nenhuma antes de
                digitar. Agora cada caixa traz a sua, logo abaixo do rótulo e ACIMA do campo:
                a informação chega antes de ser necessária, não depois.

                >>> E O TEXTO VEM DE UMA FUNÇÃO SÓ, NÃO DE TRÊS LITERAIS <<<
                Três cópias da frase divergiriam na primeira variável acrescentada — uma delas
                ficaria para trás e a tela ofereceria listas diferentes em caixas vizinhas
                (`copia-divergente.md`, cujo remédio é apagar as cópias, não conferi-las). O
                portão compara as três strings entre si para que a divergência não possa passar
                calada. */}
            <Form.Item label="Mensagem de confirmação">
              {linhaDeVariaveis}
              <Input.TextArea
                aria-label="Mensagem de confirmação"
                rows={8}
                defaultValue={textoOuPadrao(cfg.msg_confirmacao, MENSAGEM_CONFIRMACAO_PADRAO)}
                onBlur={(e) => void acoes.onSalvarConfiguracao({ msg_confirmacao: e.target.value })}
              />
            </Form.Item>
            <Form.Item label="Mensagem de cancelamento">
              {linhaDeVariaveis}
              <Input.TextArea
                aria-label="Mensagem de cancelamento"
                rows={7}
                defaultValue={textoOuPadrao(cfg.msg_cancelamento, MENSAGEM_CANCELAMENTO_PADRAO)}
                onBlur={(e) => void acoes.onSalvarConfiguracao({ msg_cancelamento: e.target.value })}
              />
            </Form.Item>
            <Form.Item label="Mensagem de alteração">
              {linhaDeVariaveis}
              <Input.TextArea
                aria-label="Mensagem de alteração"
                rows={7}
                defaultValue={textoOuPadrao(cfg.msg_alteracao, MENSAGEM_ALTERACAO_PADRAO)}
                onBlur={(e) => void acoes.onSalvarConfiguracao({ msg_alteracao: e.target.value })}
              />
            </Form.Item>
          </Form>
        )}
      </section>

      {/* ══ 4. LINK DE AGENDAMENTO — TRÊS estados, e o link SEMPRE copiável (§4) ═════════ */}
      <section>
        <h3>Link de agendamento</h3>

        {/* >>> OS TRÊS ESTADOS SÃO TRÊS, E A TELA TEM DE DISTINGUIR OS TRÊS <<<
            sem linha → "Gerar link"; com linha e desligado → link + selo DESLIGADO + switch;
            com linha e ligado → link + selo LIGADO. A primeira versão só mostrava o link logo
            depois de gerar, e quem reabria o painel não achava mais o endereço. */}
        {!cfg ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            <span>Este salão ainda não tem link de agendamento.</span>
            <Button type="primary" onClick={() => void acoes.onGerarLink()}>Gerar link</Button>
          </Space>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <Space>
              <Switch checked={cfg.is_enabled} onChange={(v) => void acoes.onAlternarAtivo(v)}
                aria-label="Criar link de agendamento ativo" />
              {/* O `aria-label` existe para o portão poder ler o selo EXATO. Afirmar
                  `textoDaTela().not.toContain('LIGADO')` seria um caso que não discrimina:
                  'DESLIGADO' CONTÉM 'LIGADO' como substring, e a asserção passaria nos dois
                  estados (`teste-que-nao-exercita.md`, variante 2). */}
              <Tag aria-label="Estado do link" color={cfg.is_enabled ? 'green' : 'default'}>
                {cfg.is_enabled ? SELO_LINK_LIGADO : SELO_LINK_DESLIGADO}
              </Tag>
            </Space>

            {/* O token JÁ é gravado em `tenant_booking_settings.public_token`. O campo e o botão
                de copiar aparecem sempre que houver token, ligado ou desligado.
                NÃO existe "gerar outro token": trocá-lo invalidaria o link que a barbearia já
                publicou na bio, e isso é decisão do PO, não da tela
                (`fato-vs-referencia.md` — o token é fato histórico). */}
            <Input
              readOnly
              value={link ?? ''}
              aria-label="Link de agendamento"
              addonAfter={
                <Tooltip title="Copiar">
                  <CopyOutlined
                    aria-label="Copiar link de agendamento"
                    onClick={() => {
                      try {
                        void navigator?.clipboard?.writeText(link ?? '')
                        msgApi.success('Link copiado.')
                      } catch { /* área de transferência indisponível — não é erro do fluxo */ }
                    }}
                  />
                </Tooltip>
              }
            />

            <Alert type="warning" showIcon message={AVISO_LINK_AINDA_NAO_FUNCIONA} />
          </Space>
        )}
      </section>

      {/* ══ O MODAL DA AUSÊNCIA — UM POR CÉLULA, SEM SELECT DE PROFISSIONAL ════════════
          >>> O PROFISSIONAL NÃO É ESCOLHIDO AQUI <<<
          `ausenciaEmp` é quem abriu o modal, e o nome dele está no TÍTULO. O `Select` que
          havia na seção solta não tem equivalente: a pergunta "de quem é esta ausência?"
          deixou de ser feita, e um seletor aqui a faria de novo — permitindo cadastrar para
          um profissional a partir da célula de outro.

          O ERRO aparece DENTRO do modal, e o modal não fecha nem grava. As três coisas. */}
      <Modal
        title={ausenciaEmp ? `Nova ausência — ${nomeDoProfissional(ausenciaEmp)}` : 'Nova ausência'}
        open={!!ausenciaEmp}
        onCancel={fecharAusencia}
        destroyOnClose
        footer={null}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          {/* DATA NO MODELO BRASILEIRO, e DIA INTEIRO (sem campo de hora).
              O que vai ao banco continua ISO em `timestamptz`; o `startOf`/`endOf` do dia é
              feito por `validarAusencia`, que é quem decide o período — a tela só informa as
              datas. Antes o `endOf` estava aqui, no `onChange`, e isso punha metade da regra
              na apresentação. */}
          <div>
            <div style={{ color: '#667085', marginBottom: 4 }}>Início:</div>
            <DatePicker
              aria-label="Início da ausência"
              placeholder="Início"
              format="DD/MM/YYYY"
              value={ausenciaIni ? dayjs(ausenciaIni) : null}
              onChange={(d) => {
                setAusenciaIni(d ? d.startOf('day').toISOString() : '')
                setErroDaAusencia(null)
              }}
            />
          </div>
          <div>
            <div style={{ color: '#667085', marginBottom: 4 }}>Fim:</div>
            <DatePicker
              aria-label="Fim da ausência"
              placeholder="Fim (opcional — mesmo dia)"
              format="DD/MM/YYYY"
              value={ausenciaFim ? dayjs(ausenciaFim) : null}
              onChange={(d) => {
                setAusenciaFim(d ? d.startOf('day').toISOString() : '')
                setErroDaAusencia(null)
              }}
            />
          </div>
          <div>
            <div style={{ color: '#667085', marginBottom: 4 }}>Motivo:</div>
            <Input
              aria-label="Motivo da ausência"
              placeholder="Motivo (opcional)"
              value={ausenciaMotivo}
              onChange={(e) => setAusenciaMotivo(e.target.value)}
            />
          </div>

          {erroDaAusencia && <Alert type="error" showIcon message={erroDaAusencia} />}

          <Space>
            <Button
              type="primary"
              aria-label="Salvar a ausência"
              loading={gravandoAusencia}
              onClick={() => void salvarAusencia()}
            >
              Salvar
            </Button>
            <Button aria-label="Cancelar a ausência" onClick={fecharAusencia}>Cancelar</Button>
          </Space>
        </Space>
      </Modal>

      {/* ══ A CONFIRMAÇÃO DO SUBSTITUIR ════════════════════════════════════════════════
          >>> MODAL SÓ AQUI, E SÓ QUANDO HÁ FAIXA A APAGAR <<<
          `adicionar` NUNCA passa por este modal: ele não destrói nada, e pedir confirmação
          para uma operação que não destrói ensina a confirmar sem ler — e aí a confirmação
          não protege no caso em que importa.

          O modal que havia aqui era o da réplica, e saiu junto com o botão: duas formas de
          montar grade divergem com o tempo, e o cabeçalho passou a ser a única. */}
      <Modal
        title="Substituir a grade"
        open={confirmandoSubstituir}
        onCancel={() => setConfirmandoSubstituir(false)}
        destroyOnClose
        footer={null}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Alert type="warning" showIcon message={confirmacaoDoSubstituir(paresComFaixa, nomeDoProfissional)} />
          <Space>
            <Button
              danger
              type="primary"
              aria-label="Confirmar a substituição"
              loading={gravando}
              onClick={clicarSubstituir}
            >
              Substituir
            </Button>
            <Button aria-label="Cancelar a substituição" onClick={() => setConfirmandoSubstituir(false)}>
              Cancelar
            </Button>
          </Space>
        </Space>
      </Modal>
    </Drawer>
  )
}

export default PainelDeAgendamento
