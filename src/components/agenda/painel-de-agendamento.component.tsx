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
 *   1. Grade de atendimento  →  2. Férias e folgas  →  3. Ajustes  →  4. Link
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
import {
  adicionarFaixaEmDias,
  avisoDeSubstituicao,
  faixaEmDiasRecusada,
  mensagemDoResultado,
} from '@/utils/adicionar-faixa-multiplos-dias'
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
  avisoDaCopiaDaGrade,
  avisoDaTabelaDeServico,
  avisoDeFuncionarioSemAcesso,
  confirmacaoDaReplica,
  estadoDoFuncionarioNoLink,
  exigeConfirmacaoDaCopia,
  faixaRecusada,
  planejarCopiaDaGrade,
  resolverTabelaDeServico,
  validarFaixa,
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
   * §2 — grava N faixas de UMA vez, num único `insert` com array.
   *
   * O contrato é PLURAL e não tem irmão singular de propósito: com `onSalvarFaixa` ao lado,
   * um dos dois acabaria esquecido numa mudança futura e a tela gravaria um dia em vez de
   * sete sem nada falhar — `copia-divergente.md`. Um dia só é uma lista de um elemento.
   *
   * >>> `idsParaRemover` É OBRIGATÓRIO, E ISSO É A DECISÃO <<<
   *
   * Mudança 2 de 08/10/2026: a faixa nova SOBRESCREVE o dia, então gravar virou duas operações
   * — insert das novas, delete das antigas daquele dia. O terceiro parâmetro não é opcional com
   * default `[]` porque default neutro em contrato de gravação é `construtor-empobrecido.md`:
   * um produtor que esquecesse de passá-lo gravaria DUPLICADO em silêncio. Obrigatório, o `tsc`
   * enumera na hora quem não passou.
   *
   * A ORDEM é de quem implementa esta ação, e é insert ANTES de delete — ver `agenda/index.tsx`.
   */
  onSalvarFaixas: (
    employee_id: string,
    faixas: { weekday: number; start_time: string; end_time: string }[],
    idsParaRemover: string[],
  ) => void | Promise<void>
  onRemoverFaixa: (id: string) => void | Promise<void>
  onSalvarFolga: (folga: { employee_id: string; starts_at: string; ends_at: string; reason?: string }) => void | Promise<void>
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
   * Os valores com que o formulário de faixa ABRE.
   *
   * É prop com default real, não costura de teste: o padrão é segunda 09:00–18:00, que é o que o
   * dono do salão digita na maioria das vezes. O portão a usa para chegar à asserção de
   * COMPORTAMENTO sem ter de operar `TimePicker` e `Select` do antd dentro do jsdom — operar o
   * widget afirmaria que o antd funciona, não que a faixa foi recusada.
   */
  faixaInicial?: { weekday: number; start_time: string; end_time: string }
  /**
   * Os valores com que os dois `DatePicker` de ausência ABREM.
   *
   * Mesma natureza de `faixaInicial`: prop com default real (vazio), não costura de teste. Ela
   * existe porque a §1 — datas em DD/MM/YYYY — não tinha portão nenhum, e sem semear uma data
   * conhecida o único jeito de afirmar o formato seria operar o calendário do antd dentro do
   * jsdom, que afirmaria que o antd funciona, não que o formato é brasileiro.
   *
   * Os valores são ISO, como o banco grava; o que o caso afirma é o que a TELA exibe.
   */
  folgaInicial?: { starts_at: string; ends_at: string }
}

/** O link que a fase 2 vai atender. Exibido aqui, e ainda sem página do outro lado. */
export function montarLinkPublico(baseUrl: string, token: string): string {
  return `${String(baseUrl || '').replace(/\/+$/, '')}/agendar/${token}`
}

export function PainelDeAgendamento(props: PainelDeAgendamentoProps) {
  const { open, onClose, calcType, dados, acoes, baseUrl } = props
  const [msgApi, msgCtx] = message.useMessage()

  // Um formulário de faixa por funcionário — a lista mostra todos ao mesmo tempo (§2), então o
  // estado do formulário não pode ser global, ou digitar no bloco de um mexeria no do outro.
  // §2 — `dias` é uma LISTA: uma faixa pode entrar em vários dias de uma vez. O `weekday`
  // único saiu, e com ele o `Select` de um dia só.
  const [faixaPorEmp, setFaixaPorEmp] = useState<Record<string, { dias: number[]; start_time: string; end_time: string }>>({})
  const [erroPorEmp, setErroPorEmp] = useState<Record<string, string | null>>({})
  const [recolhidoManual, setRecolhidoManual] = useState<Record<string, boolean>>({})

  const [folgaEmp, setFolgaEmp] = useState<string | null>(null)
  const [folgaIni, setFolgaIni] = useState<string>(props.folgaInicial?.starts_at ?? '')
  const [folgaFim, setFolgaFim] = useState<string>(props.folgaInicial?.ends_at ?? '')
  const [folgaMotivo, setFolgaMotivo] = useState<string>('')
  const [erroDaFolga, setErroDaFolga] = useState<string | null>(null)

  // §3 — o modal de copiar grade
  const [copiaAberta, setCopiaAberta] = useState(false)
  const [copiaOrigem, setCopiaOrigem] = useState<string | null>(null)
  const [copiaDestinos, setCopiaDestinos] = useState<string[]>([])
  const [copiaConfirmando, setCopiaConfirmando] = useState(false)

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

  const cfg = dados?.configuracao ?? null
  // >>> A ORIGEM NÃO TEM MAIS DEFAULT, E A MUDANÇA É DE SIGNIFICADO <<<
  // Ela era `copiaOrigem ?? funcionarios[0]?.id`, porque o modal abria do topo sem saber de
  // quem. Com a Mudança 3 o modal só abre de dentro de uma célula, e a célula SEMPRE diz quem é.
  // Um `?? funcionarios[0]` agora seria `ausente-vs-falso.md`: na falta de origem ele afirmaria
  // uma — o primeiro da lista — e replicaria a grade de quem ninguém escolheu.
  const origem = copiaOrigem

  // >>> ESTE `useMemo` FICA ANTES DO `return null`, E NÃO É ARRUMAÇÃO <<<
  // A primeira versão o deixou depois do gate de segmentação: hook condicional, que o React
  // quebra com "Rendered more hooks than during the previous render" no instante em que o
  // `calcType` muda de SERVICO para outro. Todo hook deste componente mora acima do gate.
  const planos = useMemo(
    () => planejarCopiaDaGrade(
      origem ? (faixasPorEmp[origem] ?? []) : [],
      funcionarios.filter((f) => copiaDestinos.includes(f.id)),
      (id) => faixasPorEmp[id] ?? [],
    ),
    [origem, funcionarios, copiaDestinos, faixasPorEmp],
  )

  // >>> O GATE DA SEGMENTAÇÃO É `tenantOffersServices`, NÃO UMA COMPARAÇÃO LOCAL <<<
  // `segment-visibility.ts` já é fonte única do menu, do mobile e das permissões. Escrever
  // `calcType === 'SERVICE'` aqui seria a quarta cópia do critério, e ela divergiria no dia em
  // que o banco gravasse `SERVICO` e a UI `SERVICE` — que é exatamente o caso que aquela função
  // trata (`copia-divergente.md`).
  if (!tenantOffersServices(calcType)) return null

  function faixaEmEdicao(empId: string) {
    const inicial = props.faixaInicial
    return faixaPorEmp[empId] ?? {
      dias: inicial ? [inicial.weekday] : [],
      start_time: inicial?.start_time ?? '09:00',
      end_time: inicial?.end_time ?? '18:00',
    }
  }

  function mexerNaFaixa(empId: string, patch: Partial<{ dias: number[]; start_time: string; end_time: string }>) {
    setFaixaPorEmp((p) => ({ ...p, [empId]: { ...faixaEmEdicao(empId), ...patch } }))
    setErroPorEmp((p) => ({ ...p, [empId]: null }))
  }

  function alternarDia(empId: string, weekday: number, marcado: boolean) {
    const atual = faixaEmEdicao(empId).dias
    mexerNaFaixa(empId, {
      dias: marcado ? [...atual, weekday] : atual.filter((d) => d !== weekday),
    })
  }

  /** O nome do dia, da fonte única — `DIAS_DA_SEMANA`, não um array local. */
  function nomeDoDia(weekday: number) {
    return DIAS_DA_SEMANA.find((x) => x.weekday === weekday)?.label ?? String(weekday)
  }

  /**
   * O que o clique vai fazer, calculado a CADA render — é ele que alimenta o aviso e o rótulo
   * do botão ANTES do clique.
   *
   * Chamar `adicionarFaixaEmDias` aqui é de propósito: o aviso e a gravação passam a ler o MESMO
   * `diasSubstituidos`, em vez de a tela recalcular "quais dias marcados têm faixa" por conta.
   * Duas contas do mesmo critério divergem (`copia-divergente.md`), e a que divergiria é a que o
   * usuário lê antes de apagar a semana de alguém.
   */
  function planoDaFaixa(empId: string) {
    const nova = faixaEmEdicao(empId)
    return adicionarFaixaEmDias({
      diasSelecionados: nova.dias,
      inicio: nova.start_time,
      fim: nova.end_time,
      faixasExistentes: faixasPorEmp[empId] ?? [],
    })
  }

  function tentarAdicionarFaixa(empId: string) {
    const r = planoDaFaixa(empId)

    if (faixaEmDiasRecusada(r)) {
      // A RECUSA: a mensagem aparece E a gravação não acontece. As duas coisas, não uma.
      //
      // >>> SÓ SOBRARAM DUAS RECUSAS, E NENHUMA DELAS É CONFLITO <<<
      // Até 06/10/2026 havia uma terceira — "já existe faixa nesse horário em: Quarta" — e ela
      // SAIU com a Mudança 2 de 08/10, porque sobrepor passou a ser o comportamento pedido.
      // O que resta é dia não marcado e hora invertida, e as duas vêm prontas do utilitário.
      setErroPorEmp((p) => ({ ...p, [empId]: r.erro }))
      return
    }

    setErroPorEmp((p) => ({ ...p, [empId]: null }))

    // >>> UM insert COM ARRAY E UM delete COM `.in`, NESTA ORDEM <<<
    // A ordem é da ação que grava (`agenda/index.tsx`), e está declarada lá com a razão. Aqui o
    // que importa é que as duas listas saem do MESMO retorno, no mesmo clique: separá-las em
    // duas chamadas deixaria uma janela em que o dia estaria apagado e ainda não regravado.
    void acoes.onSalvarFaixas(empId, r.novasFaixas, r.idsParaRemover)

    msgApi.success(mensagemDoResultado(r.novasFaixas.length, r.diasSubstituidos, nomeDoDia))

    // Limpa os DIAS e MANTÉM as horas — o usuário emenda a faixa seguinte sem redigitar.
    mexerNaFaixa(empId, { dias: [] })
  }

  function tentarAdicionarFolga() {
    setErroDaFolga(null)
    if (!folgaEmp) { setErroDaFolga('Escolha o profissional.'); return }
    if (!folgaIni || !folgaFim) { setErroDaFolga('Informe o início e o fim da ausência.'); return }
    if (!(new Date(folgaFim).getTime() > new Date(folgaIni).getTime())) {
      setErroDaFolga('O fim da ausência tem de ser depois do início.')
      return
    }
    void acoes.onSalvarFolga({
      employee_id: folgaEmp, starts_at: folgaIni, ends_at: folgaFim, reason: folgaMotivo || undefined,
    })
    setFolgaMotivo('')
  }

  function fecharCopia() {
    setCopiaAberta(false)
    setCopiaConfirmando(false)
    setCopiaDestinos([])
  }

  function tentarAplicarGrade() {
    if (!origem) return
    if (copiaDestinos.length === 0) {
      msgApi.error('Escolha ao menos um profissional de destino.')
      return
    }
    // >>> A CONFIRMAÇÃO SÓ APARECE QUANDO HÁ O QUE PERDER <<<
    // Pedir confirmação sempre ensina a clicar sem ler, e aí ela não protege no caso em que
    // importa. Pedir nunca apaga grade montada à mão sem aviso.
    if (exigeConfirmacaoDaCopia(planos) && !copiaConfirmando) {
      setCopiaConfirmando(true)
      return
    }
    void acoes.onAplicarGrade(origem, [...copiaDestinos])
    fecharCopia()
  }

  const origemNome = funcionarios.find((f) => f.id === origem)?.name ?? ''
  const possiveisDestinos = funcionarios.filter((f) => f.id !== origem)

  const linkOrigem = baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '')
  const link = cfg ? montarLinkPublico(linkOrigem, cfg.public_token) : null

  return (
    <Drawer title="Agendamento pelo link" placement="right" width={760} open={open} onClose={onClose} destroyOnClose>
      {msgCtx}

      {/* ══ 1. GRADE DE ATENDIMENTO — TODOS os funcionários, ao mesmo tempo (§2) ══════════ */}
      <section style={{ marginBottom: 32 }}>
        {/* >>> O BOTÃO DE REPLICAR SAIU DAQUI, E NÃO É ARRUMAÇÃO <<<
            Mudança 3 de 08/10/2026. No topo ele pedia a ORIGEM num `Select` — e escolher a
            origem num seletor é a pergunta errada: quem acabou de montar a grade da Ana já está
            na célula dela. O botão desceu para dentro de cada célula, e a origem passou a ser o
            profissional DAQUELA célula, sem escolha possível. Trazê-lo de volta para cá recria o
            `Select` de origem (`razao-longe-da-restricao.md`). */}
        <h3 style={{ marginTop: 0 }}>Grade de atendimento</h3>

        {funcionarios.length === 0 ? (
          <Empty description="Nenhum profissional ativo." />
        ) : (
          funcionarios.map((f) => {
            const faixas = faixasPorEmp[f.id] ?? []
            const estado = estadoDoFuncionarioNoLink(faixas)
            const resolucao = resolverTabelaDeServico(f.tabelas ?? [])
            const avisoTabela = avisoDaTabelaDeServico(resolucao)
            const avisoAcesso = avisoDeFuncionarioSemAcesso(f)
            const emEdicao = faixaEmEdicao(f.id)
            // O aviso e o rótulo do botão leem o MESMO retorno que a gravação vai usar. Numa
            // recusa (sem dia, hora invertida) não há o que avisar: o botão volta a ser "+".
            const planoAtual = planoDaFaixa(f.id)
            const avisoDaSubstituicao = faixaEmDiasRecusada(planoAtual)
              ? null
              : avisoDeSubstituicao(planoAtual.diasSubstituidos, nomeDoDia)
            // Recolhido por padrão quando DESLIGADO — para a lista de cinco caber na tela. O
            // SEM_GRADE fica aberto de propósito: é nele que falta trabalho a fazer.
            const recolhido = recolhidoManual[f.id] ?? (estado === 'DESLIGADO')

            return (
              <div
                key={f.id}
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

                    {/* ══ O COMPOSITOR, ACIMA DA LISTA DE DIAS ══════════════════════════
                        Mudança 1 de 08/10/2026. Ele ficava DEPOIS dos sete dias, e com cinco
                        profissionais na tela isso punha o único campo editável da célula no fim
                        de uma lista de sete linhas: para digitar a faixa do terceiro barbeiro, o
                        dono do salão rolava a tela inteira. A lista de dias é RESULTADO; o
                        compositor é a AÇÃO, e ação vem antes do resultado que ela produz.
                        Devolvê-lo para baixo recria a rolagem. */}

                    {/* §2 — SETE caixas em vez de um `Select`: a mesma faixa entra em vários
                        dias de uma vez, que é como o barbeiro realmente trabalha. `weekday`
                        continua 0=Domingo..6=Sábado, igual à coluna do banco. */}
                    <div style={{ marginTop: 4, marginBottom: 6 }}>
                      <Space wrap>
                        {DIAS_DA_SEMANA.map((d) => (
                          <Checkbox
                            key={d.weekday}
                            aria-label={`${d.label} — ${f.name}`}
                            checked={emEdicao.dias.includes(d.weekday)}
                            onChange={(e) => alternarDia(f.id, d.weekday, e.target.checked)}
                          >
                            {d.curto}
                          </Checkbox>
                        ))}
                      </Space>
                    </div>
                    <Space wrap>
                      <TimePicker
                        format="HH:mm"
                        aria-label={`Início da faixa — ${f.name}`}
                        value={emEdicao.start_time ? dayjs(emEdicao.start_time, 'HH:mm') : null}
                        onChange={(v) => mexerNaFaixa(f.id, { start_time: v ? v.format('HH:mm') : '' })}
                      />
                      <TimePicker
                        format="HH:mm"
                        aria-label={`Fim da faixa — ${f.name}`}
                        value={emEdicao.end_time ? dayjs(emEdicao.end_time, 'HH:mm') : null}
                        onChange={(v) => mexerNaFaixa(f.id, { end_time: v ? v.format('HH:mm') : '' })}
                      />
                      {/* >>> O RÓTULO DIZ O QUE O CLIQUE VAI FAZER <<<
                          Mudança 2: o clique passou a APAGAR o dia marcado antes de gravar. Um
                          botão escrito "+ Adicionar faixa" que apaga três dias mente sobre o
                          próprio efeito — e mente no único lugar onde o usuário ainda podia
                          desistir. O `+` sai junto com o rótulo: ele afirma acréscimo. */}
                      <Button
                        icon={avisoDaSubstituicao ? undefined : <PlusOutlined />}
                        onClick={() => tentarAdicionarFaixa(f.id)}
                      >
                        {avisoDaSubstituicao ? 'Substituir faixa' : '+ Adicionar faixa'}
                      </Button>
                    </Space>

                    {/* ══ O AVISO, ANTES DO CLIQUE E SEM MODAL ══════════════════════════
                        Decisão do dono do produto, 08/10/2026, registrada como está:

                          "NAO use modal. O aviso aparece ANTES do clique"

                        A razão: o modal chega DEPOIS da decisão, quando o usuário já clicou e só
                        quer sair dele — e um modal que aparece em toda troca de grade ensina a
                        confirmar sem ler, que é o contrário de proteger. Aqui a linha aparece no
                        instante em que a caixa é marcada, ao lado do botão que vai executar.

                        Isto NÃO é o caso da réplica: lá o modal continua, porque lá o alvo são
                        OUTRAS pessoas e o clique é raro. Ver a Mudança 3. */}
                    {avisoDaSubstituicao && (
                      <div style={{ marginTop: 8 }}>
                        <Alert type="warning" showIcon message={avisoDaSubstituicao} />
                      </div>
                    )}

                    {erroPorEmp[f.id] && (
                      <div style={{ marginTop: 10 }}>
                        <Alert type="error" showIcon message={erroPorEmp[f.id]} />
                      </div>
                    )}

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

                    {/* ══ MUDANÇA 3 — REPLICAR, DE DENTRO DA CÉLULA ════════════════════
                        A origem é ESTE profissional, e não há seletor: a célula já diz de quem é
                        a grade. Só aparece com mais de um profissional — replicar para ninguém
                        não é operação. */}
                    {funcionarios.length > 1 && (
                      <div style={{ marginTop: 12 }}>
                        <Button
                          size="small"
                          onClick={() => {
                            setCopiaOrigem(f.id)
                            setCopiaDestinos([])
                            setCopiaConfirmando(false)
                            setCopiaAberta(true)
                          }}
                        >
                          {`Replicar a grade de ${f.name} para outros profissionais`}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </section>

      {/* ══ 2. FÉRIAS, FOLGAS E FERIADOS ═════════════════════════════════════════════════ */}
      <section style={{ marginBottom: 32 }}>
        <h3>Férias, folgas e feriados</h3>

        {(dados?.folgas ?? []).length === 0 ? (
          <Empty description="Nenhuma ausência cadastrada." />
        ) : (
          <Space direction="vertical" style={{ width: '100%' }}>
            {(dados?.folgas ?? []).map((fo) => {
              const nome = funcionarios.find((f) => f.id === fo.employee_id)?.name ?? fo.employee_id
              return (
                <div key={fo.id} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ minWidth: 160 }}>{nome}</span>
                  <span>
                    {/* DIA INTEIRO (§4): exibir `HH:mm` aqui afirmaria uma hora que o
                        usuário não escolheu — o 00:00 e o 23:59 são derivados, não dados. */}
                    {dayjs(fo.starts_at).format('DD/MM/YYYY')} — {dayjs(fo.ends_at).format('DD/MM/YYYY')}
                  </span>
                  {fo.reason && <span style={{ color: '#667085' }}>{fo.reason}</span>}
                  <Popconfirm title="Remover esta ausência?" onConfirm={() => void acoes.onRemoverFolga(fo.id)}>
                    <DeleteOutlined aria-label={`Remover ausência ${fo.id}`} />
                  </Popconfirm>
                </div>
              )
            })}
          </Space>
        )}

        <Space wrap style={{ marginTop: 12 }}>
          <Select
            style={{ minWidth: 200 }}
            aria-label="Profissional da ausência"
            value={folgaEmp ?? undefined}
            placeholder="Profissional"
            onChange={(v) => { setFolgaEmp(v); setErroDaFolga(null) }}
            options={funcionarios.map((f) => ({ value: f.id, label: f.name }))}
          />
          {/* §1 — DATA NO MODELO BRASILEIRO, e DIA INTEIRO (§4: sem campo de hora).
              O que vai ao banco continua ISO em `timestamptz`; `startOf`/`endOf` do dia são o
              que transforma duas datas em um período fechado. Sem o `endOf`, uma ausência de
              um dia só terminaria à meia-noite do próprio dia e não cobriria nada. */}
          <DatePicker
            aria-label="Início da ausência"
            placeholder="Início"
            format="DD/MM/YYYY"
            value={folgaIni ? dayjs(folgaIni) : null}
            onChange={(d) => {
              setFolgaIni(d ? d.startOf('day').toISOString() : '')
              setErroDaFolga(null)
            }}
          />
          <DatePicker
            aria-label="Fim da ausência"
            placeholder="Fim"
            format="DD/MM/YYYY"
            value={folgaFim ? dayjs(folgaFim) : null}
            onChange={(d) => {
              setFolgaFim(d ? d.endOf('day').toISOString() : '')
              setErroDaFolga(null)
            }}
          />
          <Input aria-label="Motivo da ausência" placeholder="Motivo (opcional)" value={folgaMotivo}
            onChange={(e) => setFolgaMotivo(e.target.value)} />
          <Button icon={<PlusOutlined />} onClick={tentarAdicionarFolga}>Adicionar ausência</Button>
        </Space>

        {erroDaFolga && (
          <div style={{ marginTop: 10 }}><Alert type="error" showIcon message={erroDaFolga} /></div>
        )}
      </section>

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
              <Form.Item
                label="Passo da lista (min)"
                tooltip="O intervalo entre os horários oferecidos (09:00, 09:30…). NÃO é a duração do atendimento — essa vem do serviço."
              >
                <InputNumber aria-label="Passo da lista" min={LIMITES.grid_minutes.min} max={LIMITES.grid_minutes.max ?? undefined}
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
            <Form.Item label="Mensagem de confirmação">
              <Input.TextArea
                aria-label="Mensagem de confirmação"
                rows={8}
                defaultValue={textoOuPadrao(cfg.msg_confirmacao, MENSAGEM_CONFIRMACAO_PADRAO)}
                onBlur={(e) => void acoes.onSalvarConfiguracao({ msg_confirmacao: e.target.value })}
              />
            </Form.Item>
            <Form.Item label="Mensagem de cancelamento">
              <Input.TextArea
                aria-label="Mensagem de cancelamento"
                rows={7}
                defaultValue={textoOuPadrao(cfg.msg_cancelamento, MENSAGEM_CANCELAMENTO_PADRAO)}
                onBlur={(e) => void acoes.onSalvarConfiguracao({ msg_cancelamento: e.target.value })}
              />
            </Form.Item>
            <Form.Item label="Mensagem de alteração">
              <Input.TextArea
                aria-label="Mensagem de alteração"
                rows={7}
                defaultValue={textoOuPadrao(cfg.msg_alteracao, MENSAGEM_ALTERACAO_PADRAO)}
                onBlur={(e) => void acoes.onSalvarConfiguracao({ msg_alteracao: e.target.value })}
              />
            </Form.Item>

            <div style={{ color: '#98A2B3', fontSize: 12 }}>
              Variáveis disponíveis: {VARIAVEIS_DAS_MENSAGENS.join(' ')}
            </div>
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
                aria-label="Agendamento pelo link ativo" />
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

      {/* ══ MUDANÇA 3 — O MODAL DA RÉPLICA ═════════════════════════════════════════════
          >>> AQUI O MODAL FICA, E A RAZÃO É O ALVO <<<
          Decisão do dono do produto, 08/10/2026: a Mudança 2 tirou o modal da faixa e esta
          mantém o da réplica. Não é inconsistência — na faixa o alvo é a grade de quem está
          mexendo nela, e o clique é constante; aqui o alvo são OUTRAS pessoas, o clique é raro,
          e desfazer custa remontar a semana de cada uma à mão. */}
      <Modal
        title={origemNome ? `Replicar a grade de ${origemNome}` : 'Replicar a grade'}
        open={copiaAberta}
        onCancel={fecharCopia}
        destroyOnClose
        footer={null}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          {/* NÃO HÁ SELETOR DE ORIGEM: ela é o profissional da célula que abriu o modal. O
              `Select` que havia aqui era a pergunta errada — ver o comentário do botão. */}
          <div>
            Replicando a grade de <strong>{origemNome}</strong>
            {` — ${(origem ? (faixasPorEmp[origem] ?? []) : []).length} faixa(s).`}
          </div>

          <div>
            <div style={{ marginBottom: 4 }}>Para:</div>
            {/* "Todos" é uma caixa, não um botão: com cinco profissionais marcar um por um é o
                caso comum, e um botão que "marca todos" não mostra que está marcado. Ela fica
                indeterminada quando a seleção é parcial, para não afirmar nem um nem outro. */}
            <Checkbox
              aria-label="Todos os profissionais"
              checked={possiveisDestinos.length > 0 && copiaDestinos.length === possiveisDestinos.length}
              indeterminate={copiaDestinos.length > 0 && copiaDestinos.length < possiveisDestinos.length}
              onChange={(e) => {
                setCopiaConfirmando(false)
                setCopiaDestinos(e.target.checked ? possiveisDestinos.map((f) => f.id) : [])
              }}
            >
              <strong>Todos</strong>
            </Checkbox>
            <Space direction="vertical" style={{ marginTop: 6 }}>
              {possiveisDestinos.map((f) => (
                <Checkbox
                  key={f.id}
                  aria-label={`Copiar para ${f.name}`}
                  checked={copiaDestinos.includes(f.id)}
                  onChange={(e) => {
                    setCopiaConfirmando(false)
                    setCopiaDestinos((p) => (e.target.checked ? [...p, f.id] : p.filter((x) => x !== f.id)))
                  }}
                >
                  {f.name} — tem hoje {(faixasPorEmp[f.id] ?? []).length} faixa(s)
                </Checkbox>
              ))}
            </Space>
          </div>

          {avisoDaCopiaDaGrade(planos) && (
            <Alert
              type={exigeConfirmacaoDaCopia(planos) ? 'warning' : 'info'}
              showIcon
              message={avisoDaCopiaDaGrade(planos)}
            />
          )}

          {copiaConfirmando ? (
            <>
              {/* A confirmação NOMEIA quem recebe e quem perde — nunca "os selecionados". */}
              <Alert
                type="warning"
                showIcon
                message={confirmacaoDaReplica(origemNome, planos)}
              />
              <Space>
                <Button danger type="primary" onClick={tentarAplicarGrade}>Confirmar substituição</Button>
                <Button onClick={fecharCopia}>Cancelar</Button>
              </Space>
            </>
          ) : (
            <Space>
              <Button type="primary" onClick={tentarAplicarGrade}>Aplicar</Button>
              <Button onClick={fecharCopia}>Cancelar</Button>
            </Space>
          )}
        </Space>
      </Modal>
    </Drawer>
  )
}

export default PainelDeAgendamento
