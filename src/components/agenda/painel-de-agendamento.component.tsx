/**
 * painel-de-agendamento.component.tsx — a configuração do agendamento público, fase 1.
 *
 * Comando do PO de 05/10/2026, §3. Vive DENTRO da Agenda (é de lá que é montado), em painel
 * lateral, e não em Configurações.
 *
 * >>> ESTA FASE NÃO CRIA ROTA PÚBLICA <<<
 * O link é exibido e copiável, e NÃO resolve página nenhuma. O aviso disso está na tela, não
 * só neste comentário: quem gerar o link hoje precisa saber que ele ainda não abre.
 *
 * ── POR QUE É ARQUIVO PRÓPRIO, e não mais 400 linhas em `agenda/index.tsx` ────────────────
 *
 * A Agenda tem 2.626 linhas e o §3 manda não empurrar para dentro do corpo da página. Mas a
 * razão que decide não é tamanho: é o PORTÃO. Renderizar a Agenda inteira para afirmar que
 * uma faixa sobreposta foi recusada obrigaria a mockar `calendar_events`, `customers`,
 * `services`, `products` e `whatsapp_dispatches` — e um caso que depende de cinco mocks para
 * chegar à asserção é um caso que fica verde por motivo errado (`teste-que-nao-exercita.md`).
 *
 * ── E POR QUE ELE NÃO LÊ O BANCO ──────────────────────────────────────────────────────────
 *
 * Os dados chegam por `dados` e as gravações saem por `acoes`. Quem fala com o Supabase é a
 * Agenda, que já tem a sessão e o `tenant_id`. Aqui ficam a APRESENTAÇÃO e a RECUSA — e é a
 * recusa que o portão afirma: a mensagem aparece no DOM **e** `onSalvarFaixa` NÃO é chamada.
 * Afirmar só a mensagem não distinguiria "recusou" de "avisou e gravou assim mesmo".
 */

import React, { useMemo, useState } from 'react'
import { Alert, Button, Drawer, Empty, Form, Input, InputNumber, Popconfirm, Select, Space, Switch, Tag, TimePicker, Tooltip, message } from 'antd'
import { CopyOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import { tenantOffersServices } from '@/utils/segment-visibility'
import {
  DIAS_DA_SEMANA,
  LIMITES,
  avisoDaTabelaDeServico,
  avisoDeFuncionarioSemAcesso,
  faixaRecusada,
  resolverTabelaDeServico,
  validarFaixa,
  type FaixaDeHorario,
  type TabelaDeComissao,
} from '@/utils/agendamento-config'

export const AVISO_LINK_AINDA_NAO_FUNCIONA =
  'Este link ainda NÃO abre: a página de agendamento é a próxima etapa. Guarde-o, mas não '
  + 'divulgue ainda.'

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
  onSalvarFaixa: (faixa: { employee_id: string; weekday: number; start_time: string; end_time: string }) => void | Promise<void>
  onRemoverFaixa: (id: string) => void | Promise<void>
  onSalvarFolga: (folga: { employee_id: string; starts_at: string; ends_at: string; reason?: string }) => void | Promise<void>
  onRemoverFolga: (id: string) => void | Promise<void>
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
   * É prop com default real, não costura de teste: o padrão é segunda 09:00–18:00, que é o
   * que o dono do salão digita na maioria das vezes. O portão a usa para chegar à asserção de
   * COMPORTAMENTO sem ter de operar `TimePicker` e `Select` do antd dentro do jsdom — operar
   * o widget afirmaria que o antd funciona, não que a faixa foi recusada.
   */
  faixaInicial?: { weekday: number; start_time: string; end_time: string }
}

/** O link que a fase 2 vai atender. Exibido aqui, e ainda sem página do outro lado. */
export function montarLinkPublico(baseUrl: string, token: string): string {
  return `${String(baseUrl || '').replace(/\/+$/, '')}/agendar/${token}`
}

export function PainelDeAgendamento(props: PainelDeAgendamentoProps) {
  const { open, onClose, calcType, dados, acoes, baseUrl } = props
  const [msgApi, msgCtx] = message.useMessage()

  const [empSelecionado, setEmpSelecionado] = useState<string | null>(null)
  const [novoDia, setNovoDia] = useState<number>(props.faixaInicial?.weekday ?? 1)
  const [novoInicio, setNovoInicio] = useState<string>(props.faixaInicial?.start_time ?? '09:00')
  const [novoFim, setNovoFim] = useState<string>(props.faixaInicial?.end_time ?? '18:00')
  const [erroDaFaixa, setErroDaFaixa] = useState<string | null>(null)

  const [folgaEmp, setFolgaEmp] = useState<string | null>(null)
  const [folgaIni, setFolgaIni] = useState<string>('')
  const [folgaFim, setFolgaFim] = useState<string>('')
  const [folgaMotivo, setFolgaMotivo] = useState<string>('')
  const [erroDaFolga, setErroDaFolga] = useState<string | null>(null)

  const funcionarios = dados?.funcionarios ?? []
  const empAtual = empSelecionado ?? funcionarios[0]?.id ?? null

  const faixasDoEmp = useMemo(
    () => (dados?.grade ?? []).filter((f) => f.employee_id === empAtual),
    [dados?.grade, empAtual],
  )

  // >>> O GATE DA SEGMENTAÇÃO É `tenantOffersServices`, NÃO UMA COMPARAÇÃO LOCAL <<<
  // `segment-visibility.ts` já é fonte única do menu, do mobile e das permissões (premissa a).
  // Escrever `calcType === 'SERVICE'` aqui seria a quarta cópia do critério, e ela divergiria
  // no dia em que o banco gravasse `SERVICO` e a UI `SERVICE` — que é exatamente o caso que
  // aquela função trata (`copia-divergente.md`).
  if (!tenantOffersServices(calcType)) return null

  const cfg = dados?.configuracao ?? null

  function tentarAdicionarFaixa() {
    setErroDaFaixa(null)
    if (!empAtual) {
      setErroDaFaixa('Escolha o profissional.')
      return
    }
    const nova: FaixaDeHorario = { weekday: novoDia, start_time: novoInicio, end_time: novoFim }
    const r = validarFaixa(nova, faixasDoEmp)
    if (faixaRecusada(r)) {
      // A RECUSA: a mensagem aparece E a gravação não acontece. As duas coisas, não uma.
      setErroDaFaixa(r.mensagem)
      return
    }
    void acoes.onSalvarFaixa({
      employee_id: empAtual,
      weekday: novoDia,
      start_time: novoInicio,
      end_time: novoFim,
    })
  }

  function tentarAdicionarFolga() {
    setErroDaFolga(null)
    if (!folgaEmp) {
      setErroDaFolga('Escolha o profissional.')
      return
    }
    if (!folgaIni || !folgaFim) {
      setErroDaFolga('Informe o início e o fim da ausência.')
      return
    }
    if (!(new Date(folgaFim).getTime() > new Date(folgaIni).getTime())) {
      setErroDaFolga('O fim da ausência tem de ser depois do início.')
      return
    }
    void acoes.onSalvarFolga({
      employee_id: folgaEmp,
      starts_at: folgaIni,
      ends_at: folgaFim,
      reason: folgaMotivo || undefined,
    })
    setFolgaMotivo('')
  }

  const origem = baseUrl ?? (typeof window !== 'undefined' ? window.location.origin : '')
  const link = cfg ? montarLinkPublico(origem, cfg.public_token) : null

  return (
    <Drawer
      title="Agendamento pelo link"
      placement="right"
      width={720}
      open={open}
      onClose={onClose}
      destroyOnClose
    >
      {msgCtx}

      {/* ── (c) O LINK ───────────────────────────────────────────────────────────────── */}
      <section style={{ marginBottom: 28 }}>
        <h3 style={{ marginTop: 0 }}>O link</h3>
        {!cfg ? (
          <Space direction="vertical" style={{ width: '100%' }}>
            <span>Este salão ainda não tem link de agendamento.</span>
            <Button type="primary" onClick={() => void acoes.onGerarLink()}>
              Gerar link
            </Button>
          </Space>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <Space>
              <Switch
                checked={cfg.is_enabled}
                onChange={(v) => void acoes.onAlternarAtivo(v)}
                aria-label="Agendamento pelo link ativo"
              />
              <span>{cfg.is_enabled ? 'Agendamento LIGADO' : 'Agendamento DESLIGADO'}</span>
            </Space>

            <Input
              readOnly
              value={link ?? ''}
              aria-label="Link de agendamento"
              addonAfter={
                <Tooltip title="Copiar">
                  <CopyOutlined
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

            {/* >>> O AVISO DO §3c — a exposição é ZERO nesta fase, e quem lê a tela tem de saber <<< */}
            <Alert type="warning" showIcon message={AVISO_LINK_AINDA_NAO_FUNCIONA} />
          </Space>
        )}
      </section>

      {/* ── (d) OS PARÂMETROS ────────────────────────────────────────────────────────── */}
      {cfg && (
        <section style={{ marginBottom: 28 }}>
          <h3>Parâmetros</h3>
          <Form layout="vertical">
            <Space wrap size={16}>
              <Form.Item
                label="Passo da lista (min)"
                tooltip="O intervalo entre os horários oferecidos (09:00, 09:30…). NÃO é a duração do atendimento — essa vem do serviço."
              >
                <InputNumber
                  aria-label="Passo da lista"
                  min={LIMITES.grid_minutes.min}
                  max={LIMITES.grid_minutes.max ?? undefined}
                  value={cfg.grid_minutes}
                  onChange={(v) => void acoes.onSalvarConfiguracao({ grid_minutes: Number(v) })}
                />
              </Form.Item>
              <Form.Item label="Antecedência mínima (min)">
                <InputNumber
                  aria-label="Antecedência mínima"
                  min={LIMITES.lead_time_min.min}
                  value={cfg.lead_time_min}
                  onChange={(v) => void acoes.onSalvarConfiguracao({ lead_time_min: Number(v) })}
                />
              </Form.Item>
              <Form.Item label="Janela de agendamento (dias)">
                <InputNumber
                  aria-label="Janela de agendamento"
                  min={LIMITES.horizon_days.min}
                  max={LIMITES.horizon_days.max ?? undefined}
                  value={cfg.horizon_days}
                  onChange={(v) => void acoes.onSalvarConfiguracao({ horizon_days: Number(v) })}
                />
              </Form.Item>
            </Space>

            <Form.Item label="Mensagem de confirmação">
              <Input.TextArea
                aria-label="Mensagem de confirmação"
                rows={2}
                defaultValue={cfg.msg_confirmacao ?? ''}
                onBlur={(e) => void acoes.onSalvarConfiguracao({ msg_confirmacao: e.target.value })}
              />
            </Form.Item>
            <Form.Item label="Mensagem de cancelamento">
              <Input.TextArea
                aria-label="Mensagem de cancelamento"
                rows={2}
                defaultValue={cfg.msg_cancelamento ?? ''}
                onBlur={(e) => void acoes.onSalvarConfiguracao({ msg_cancelamento: e.target.value })}
              />
            </Form.Item>
            <Form.Item label="Mensagem de alteração">
              <Input.TextArea
                aria-label="Mensagem de alteração"
                rows={2}
                defaultValue={cfg.msg_alteracao ?? ''}
                onBlur={(e) => void acoes.onSalvarConfiguracao({ msg_alteracao: e.target.value })}
              />
            </Form.Item>
          </Form>
        </section>
      )}

      {/* ── (a) A GRADE, e (e) a tabela de serviço, e §4 o aviso de acesso ───────────── */}
      <section style={{ marginBottom: 28 }}>
        <h3>Grade de atendimento</h3>

        {funcionarios.length === 0 ? (
          <Empty description="Nenhum profissional ativo." />
        ) : (
          <>
            <Select
              style={{ minWidth: 260, marginBottom: 12 }}
              aria-label="Profissional da grade"
              value={empAtual ?? undefined}
              onChange={(v) => { setEmpSelecionado(v); setErroDaFaixa(null) }}
              options={funcionarios.map((f) => ({ value: f.id, label: f.name }))}
            />

            {funcionarios
              .filter((f) => f.id === empAtual)
              .map((f) => {
                const resolucao = resolverTabelaDeServico(f.tabelas ?? [])
                const avisoTabela = avisoDaTabelaDeServico(resolucao)
                const avisoAcesso = avisoDeFuncionarioSemAcesso(f)
                return (
                  <Space key={f.id} direction="vertical" style={{ width: '100%', marginBottom: 12 }}>
                    {/* (e) qual tabela de SERVIÇO está vinculada */}
                    {resolucao.estado === 'UMA' && (
                      <div>
                        Tabela de serviço: <Tag color="blue">{resolucao.tabela.name}</Tag>
                      </div>
                    )}
                    {avisoTabela && <Alert type="warning" showIcon message={avisoTabela} />}
                    {/* §4 — o pré-requisito que não é código */}
                    {avisoAcesso && <Alert type="warning" showIcon message={avisoAcesso} />}
                  </Space>
                )
              })}

            {/* as faixas já gravadas, agrupadas pelos sete dias */}
            {DIAS_DA_SEMANA.map((d) => {
              const doDia = faixasDoEmp.filter((f) => f.weekday === d.weekday)
              return (
                <div key={d.weekday} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '4px 0' }}>
                  <span style={{ width: 80, color: '#667085' }}>{d.label}</span>
                  {doDia.length === 0 ? (
                    <span style={{ color: '#98A2B3' }}>—</span>
                  ) : (
                    <Space wrap>
                      {doDia.map((f) => (
                        <Tag key={f.id} closable={false}>
                          {String(f.start_time).slice(0, 5)}–{String(f.end_time).slice(0, 5)}
                          <Popconfirm
                            title="Remover esta faixa?"
                            onConfirm={() => void acoes.onRemoverFaixa(f.id)}
                          >
                            <DeleteOutlined style={{ marginLeft: 8 }} aria-label={`Remover faixa ${f.id}`} />
                          </Popconfirm>
                        </Tag>
                      ))}
                    </Space>
                  )}
                </div>
              )
            })}

            {/* adicionar faixa */}
            <Space wrap style={{ marginTop: 12 }}>
              <Select
                style={{ minWidth: 140 }}
                aria-label="Dia da semana"
                value={novoDia}
                onChange={(v) => { setNovoDia(Number(v)); setErroDaFaixa(null) }}
                options={DIAS_DA_SEMANA.map((d) => ({ value: d.weekday, label: d.label }))}
              />
              <TimePicker
                format="HH:mm"
                aria-label="Início da faixa"
                value={novoInicio ? dayjs(novoInicio, 'HH:mm') : null}
                onChange={(v) => { setNovoInicio(v ? v.format('HH:mm') : ''); setErroDaFaixa(null) }}
              />
              <TimePicker
                format="HH:mm"
                aria-label="Fim da faixa"
                value={novoFim ? dayjs(novoFim, 'HH:mm') : null}
                onChange={(v) => { setNovoFim(v ? v.format('HH:mm') : ''); setErroDaFaixa(null) }}
              />
              <Button icon={<PlusOutlined />} onClick={tentarAdicionarFaixa}>
                Adicionar faixa
              </Button>
            </Space>

            {erroDaFaixa && (
              <div style={{ marginTop: 10 }}>
                <Alert type="error" showIcon message={erroDaFaixa} />
              </div>
            )}
          </>
        )}
      </section>

      {/* ── (b) FOLGAS ───────────────────────────────────────────────────────────────── */}
      <section>
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
                    {dayjs(fo.starts_at).format('DD/MM/YYYY HH:mm')} — {dayjs(fo.ends_at).format('DD/MM/YYYY HH:mm')}
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
          <Input
            aria-label="Início da ausência"
            placeholder="Início (AAAA-MM-DDTHH:mm)"
            value={folgaIni}
            onChange={(e) => { setFolgaIni(e.target.value); setErroDaFolga(null) }}
          />
          <Input
            aria-label="Fim da ausência"
            placeholder="Fim (AAAA-MM-DDTHH:mm)"
            value={folgaFim}
            onChange={(e) => { setFolgaFim(e.target.value); setErroDaFolga(null) }}
          />
          <Input
            aria-label="Motivo da ausência"
            placeholder="Motivo (opcional)"
            value={folgaMotivo}
            onChange={(e) => setFolgaMotivo(e.target.value)}
          />
          <Button icon={<PlusOutlined />} onClick={tentarAdicionarFolga}>
            Adicionar ausência
          </Button>
        </Space>

        {erroDaFolga && (
          <div style={{ marginTop: 10 }}>
            <Alert type="error" showIcon message={erroDaFolga} />
          </div>
        )}
      </section>
    </Drawer>
  )
}

export default PainelDeAgendamento
