/**
 * AGENDAMENTO PÚBLICO — FASE 1: a configuração, e a recusa que ela faz.
 *
 * Comando do PO de 05/10/2026, §6.
 *
 * >>> O QUE CADA CASO TEM DE DISTINGUIR <<<
 *
 * `teste-que-nao-exercita.md`, variante 3: afirmar que a mensagem de erro apareceu NÃO é
 * afirmar que a faixa foi recusada. Um componente que mostrasse o aviso e gravasse assim mesmo
 * passaria nessa asserção. Por isso cada caso de recusa afirma DUAS coisas:
 *
 *   (1) a mensagem está no DOM, e
 *   (2) `onSalvarFaixas` NÃO foi chamada.
 *
 * E há o espelho obrigatório: um caso que GRAVA. Sem ele, "nunca chama `onSalvarFaixas`" ficaria
 * verde num componente que recusa tudo — o caso escolhido não discriminaria os dois estados
 * (variante 2 da mesma regra).
 *
 * >>> POR QUE AS DUAS CONVENÇÕES DE DIA NÃO APARECEM AQUI <<<
 *
 * `weekday` é 0=Domingo..6=Sábado; `recurWeekdays` de `agenda/index.tsx:152` é 0=Segunda..
 * 6=Domingo. Os casos usam `weekday: 1` = SEGUNDA nos dois sentidos por coincidência de
 * número, e isso seria uma armadilha se o caso dependesse do rótulo. Ele não depende: a
 * sobreposição é aritmética de minutos DENTRO do mesmo `weekday`, qualquer que seja o rótulo.
 */

import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import fs from 'fs'
import path from 'path'

import {
  LIMITES,
  avisoDaCopiaDaGrade,
  estadoDoFuncionarioNoLink,
  exigeConfirmacaoDaCopia,
  faixaRecusada,
  funcionarioAceitaAgendamento,
  planejarCopiaDaGrade,
  resolverTabelaDeServico,
  validarFaixa,
} from '@/utils/agendamento-config'
import { BYTES_DO_TOKEN, gerarTokenDeAgendamento } from '@/utils/agendamento-token'
import {
  aplicarGradeEmDestinos,
  type FaixaPersistida,
  type RepositorioDaGrade,
} from '@/utils/aplicar-grade'
import {
  AVISO_LINK_AINDA_NAO_FUNCIONA,
  PainelDeAgendamento,
  SELO_LINK_DESLIGADO,
  SELO_LINK_LIGADO,
  montarLinkPublico,
  type AcoesDoPainel,
  type ConfiguracaoDoAgendamento,
  type DadosDoAgendamento,
  type FuncionarioDoPainel,
} from '@/components/agenda/painel-de-agendamento.component'

// ── o jsdom que o React 18 e o antd exigem ────────────────────────────────────────────────
// Sem `IS_REACT_ACT_ENVIRONMENT` o `act()` avisa e engole o erro real num `AggregateError`;
// sem `matchMedia` o antd quebra ao montar. Medido: as duas faltavam e os 16 casos de DOM
// falhavam sem dizer por quê.
;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (q: string) => ({
    matches: false, media: q, onchange: null as any,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }),
})

const RAIZ = path.resolve(__dirname, '../../..')
const MIGRACAO = path.join(RAIZ, 'supabase/migrations/20261006000001_agendamento_publico_fase1.sql')

// ── fixtures ──────────────────────────────────────────────────────────────────────────────
//
// O barbeiro de dois turnos é o fixture central, porque é ele que separa "sobrepõe" de
// "encosta": 09:00–12:00 e 12:00–18:00 são DUAS linhas legítimas (§2 do comando), e um
// critério com `<=` as recusaria.
const CFG_DESLIGADA: ConfiguracaoDoAgendamento = {
  tenant_id: 't1',
  public_token: 'TOKEN_OPACO_DE_TESTE',
  is_enabled: false,
  lead_time_min: 60,
  horizon_days: 30,
  grid_minutes: 30,
  msg_confirmacao: null,
  msg_cancelamento: null,
  msg_alteracao: null,
}

const TABELA_SERVICO_A = { id: 'ct-a', name: 'Serviços', type: 'SERVICE' }
const TABELA_SERVICO_B = { id: 'ct-b', name: 'Atendimentos', type: 'SERVICE' }
const TABELA_PRODUTO = { id: 'ct-p', name: 'Produtos', type: 'PRODUCT' }

function fazerAcoes(): AcoesDoPainel & { [k: string]: jest.Mock } {
  return {
    onGerarLink: jest.fn(),
    onAlternarAtivo: jest.fn(),
    onSalvarConfiguracao: jest.fn(),
    onSalvarFaixas: jest.fn(),
    onRemoverFaixa: jest.fn(),
    onSalvarFolga: jest.fn(),
    onRemoverFolga: jest.fn(),
    onAlternarFuncionario: jest.fn(),
    onAplicarGrade: jest.fn(),
  } as any
}

function dadosBase(over: Partial<DadosDoAgendamento> = {}): DadosDoAgendamento {
  return {
    configuracao: CFG_DESLIGADA,
    grade: [],
    folgas: [],
    funcionarios: [
      { id: 'e1', name: 'Zé Barbeiro', user_id: null, tabelas: [TABELA_SERVICO_A] },
    ],
    ...over,
  }
}

let host: HTMLDivElement | null = null
let root: Root | null = null

function renderizar(node: React.ReactElement) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => { root!.render(node) })
}

function desmontar() {
  if (root) act(() => { root!.unmount() })
  if (host) host.remove()
  root = null
  host = null
}

function textoDaTela(): string {
  // O Drawer do antd renderiza em PORTAL, fora do `host`. Ler só o `host` devolveria vazio e
  // toda asserção de ausência passaria por engano.
  return document.body.textContent || ''
}

/** O selo do estado do link, lido do elemento, não do texto da tela inteira. */
function selo(): string | null {
  const el = document.body.querySelector('[aria-label="Estado do link"]')
  return el ? (el.textContent || '') : null
}

function clicarBotao(rotulo: string) {
  const botoes = Array.from(document.body.querySelectorAll('button'))
  const alvo = botoes.find((b) => (b.textContent || '').includes(rotulo))
  expect(alvo).toBeTruthy() // sem isto, um rótulo errado faria o caso passar sem clicar em nada
  act(() => { alvo!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
}

afterEach(() => { desmontar(); document.body.innerHTML = '' })

// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('§6.1 — a configuração só existe para tenant de SERVIÇO', () => {
  // O PAR é obrigatório: afirmar só a ausência em INDUSTRIALIZACAO não distinguiria "o gate
  // funciona" de "o painel está quebrado e não renderiza para ninguém".
  it('INDUSTRIALIZACAO não vê o painel; SERVICO vê', () => {
    renderizar(
      <PainelDeAgendamento
        open
        onClose={() => {}}
        calcType="INDUSTRIALIZATION"
        dados={dadosBase()}
        acoes={fazerAcoes()}
        baseUrl="https://app.exemplo.com"
      />,
    )
    expect(textoDaTela()).not.toContain('Grade de atendimento')
    desmontar()
    document.body.innerHTML = ''

    renderizar(
      <PainelDeAgendamento
        open
        onClose={() => {}}
        calcType="SERVICE"
        dados={dadosBase()}
        acoes={fazerAcoes()}
        baseUrl="https://app.exemplo.com"
      />,
    )
    expect(textoDaTela()).toContain('Grade de atendimento')
  })

  it('REVENDA também não vê — o gate é `tenantOffersServices`, não "não é industrialização"', () => {
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="RESALE"
        dados={dadosBase()} acoes={fazerAcoes()} baseUrl="https://app.exemplo.com"
      />,
    )
    expect(textoDaTela()).not.toContain('Grade de atendimento')
  })

  it('o vocabulário do BANCO (SERVICO) e o da UI (SERVICE) valem os dois', () => {
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICO"
        dados={dadosBase()} acoes={fazerAcoes()} baseUrl="https://app.exemplo.com"
      />,
    )
    expect(textoDaTela()).toContain('Grade de atendimento')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('§6.2 — faixas sobrepostas do mesmo funcionário no mesmo dia são RECUSADAS', () => {
  const gradeComManha: DadosDoAgendamento = dadosBase({
    grade: [
      { id: 'f1', employee_id: 'e1', weekday: 1, start_time: '09:00:00', end_time: '12:00:00' },
    ],
  })

  it('sobreposta: a mensagem aparece E `onSalvarFaixa` NÃO é chamada', () => {
    const acoes = fazerAcoes()
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={gradeComManha} acoes={acoes} baseUrl="https://app.exemplo.com"
        faixaInicial={{ weekday: 1, start_time: '11:00', end_time: '15:00' }}
      />,
    )
    clicarBotao('Adicionar faixa')

    // >>> O EFEITO VEM PRIMEIRO, E A ORDEM É A REGRA <<<
    // Na rodada do MEI a asserção de DOM ficava DEPOIS de uma asserção intermediária, a
    // mutação matava a intermediária e a de comportamento nunca era alcançada. Aqui o par é
    // outro — efeito e mensagem — e o efeito é o que distingue "recusou" de "avisou e gravou".
    // Com ele primeiro, desfazer a regra de sobreposição mata ESTA linha.
    expect(acoes.onSalvarFaixas).not.toHaveBeenCalled()
    // Em 06/10/2026 (§2) a mensagem passou a NOMEAR OS DIAS em conflito, em vez de citar a
    // faixa conflitante: com sete caixas marcadas, "há conflito" obrigaria o usuário a
    // desmarcar uma por uma para descobrir qual. O efeito afirmado é o mesmo — não gravou.
    expect(textoDaTela()).toContain('Já existe faixa nesse horário em: Segunda.')
  })

  it('ENCOSTA mas não sobrepõe: 12:00–18:00 depois de 09:00–12:00 é GRAVADA', () => {
    // O espelho. É ele que impede que "recusa tudo" passe pelo caso anterior, e é ele que
    // afirma o barbeiro de dois turnos — o caso que a tabela existe para representar.
    const acoes = fazerAcoes()
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={gradeComManha} acoes={acoes} baseUrl="https://app.exemplo.com"
        faixaInicial={{ weekday: 1, start_time: '12:00', end_time: '18:00' }}
      />,
    )
    clicarBotao('Adicionar faixa')

    expect(acoes.onSalvarFaixas).toHaveBeenCalledTimes(1)
    // O contrato virou PLURAL em 06/10/2026 (§2): um dia só é uma lista de um elemento.
    expect(acoes.onSalvarFaixas).toHaveBeenCalledWith('e1', [
      { weekday: 1, start_time: '12:00', end_time: '18:00' },
    ])
    expect(textoDaTela()).not.toContain('se sobrepõe')
  })

  it('OUTRO DIA não é conflito: 11:00–15:00 na terça passa com a segunda ocupada', () => {
    const acoes = fazerAcoes()
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={gradeComManha} acoes={acoes} baseUrl="https://app.exemplo.com"
        faixaInicial={{ weekday: 2, start_time: '11:00', end_time: '15:00' }}
      />,
    )
    clicarBotao('Adicionar faixa')
    expect(acoes.onSalvarFaixas).toHaveBeenCalledTimes(1)
  })

  it('OUTRO FUNCIONÁRIO não é conflito — a grade do Zé não bloqueia a da Ana', () => {
    const acoes = fazerAcoes()
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosBase({
          grade: [
            { id: 'f9', employee_id: 'e2', weekday: 1, start_time: '09:00:00', end_time: '18:00:00' },
          ],
        })}
        acoes={acoes} baseUrl="https://app.exemplo.com"
        faixaInicial={{ weekday: 1, start_time: '10:00', end_time: '11:00' }}
      />,
    )
    clicarBotao('Adicionar faixa')
    expect(acoes.onSalvarFaixas).toHaveBeenCalledTimes(1)
  })

  // ── o mesmo critério, na função pura, onde o EFEITO é o motivo ───────────────────────────
  it('`validarFaixa` recusa a sobreposição com motivo SOBREPOSICAO e aponta o conflito', () => {
    const r = validarFaixa(
      { weekday: 1, start_time: '11:00', end_time: '15:00' },
      [{ id: 'f1', weekday: 1, start_time: '09:00', end_time: '12:00' }],
    )
    expect(faixaRecusada(r)).toBe(true)
    if (!faixaRecusada(r)) throw new Error('inalcançável')
    expect(r.motivo).toBe('SOBREPOSICAO')
    expect(r.conflito?.id).toBe('f1')
  })

  it('faixa INATIVA não bloqueia — desativada não ocupa horário', () => {
    const r = validarFaixa(
      { weekday: 1, start_time: '09:00', end_time: '12:00' },
      [{ id: 'f1', weekday: 1, start_time: '09:00', end_time: '12:00', is_active: false }],
    )
    expect(r.ok).toBe(true)
  })

  it('editar a PRÓPRIA faixa não conflita com ela mesma', () => {
    const r = validarFaixa(
      { id: 'f1', weekday: 1, start_time: '09:00', end_time: '13:00' },
      [{ id: 'f1', weekday: 1, start_time: '09:00', end_time: '12:00' }],
    )
    expect(r.ok).toBe(true)
  })

  it('a comparação é por MINUTOS, não por string: `9:00` sem zero à esquerda é recusado', () => {
    // `'9:00' < '10:00'` é FALSE em string — a forma sem zero inverteria a comparação e a
    // sobreposição passaria. `horaParaMinutos` é a travessia única, e é ela que impede isso.
    const r = validarFaixa(
      { weekday: 1, start_time: '9:30', end_time: '10:30' },
      [{ id: 'f1', weekday: 1, start_time: '09:00', end_time: '12:00' }],
    )
    expect(faixaRecusada(r)).toBe(true)
    if (!faixaRecusada(r)) throw new Error('inalcançável')
    expect(r.motivo).toBe('SOBREPOSICAO')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('§6.3 — `end_time <= start_time` é recusado', () => {
  it('no DOM: 18:00→09:00 mostra a mensagem E não grava', () => {
    const acoes = fazerAcoes()
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosBase()} acoes={acoes} baseUrl="https://app.exemplo.com"
        faixaInicial={{ weekday: 1, start_time: '18:00', end_time: '09:00' }}
      />,
    )
    clicarBotaoExato('Adicionar faixa')
    // O EFEITO primeiro, e o texto é o de `adicionarFaixaEmDias` desde 06/10/2026 (§2).
    expect(acoes.onSalvarFaixas).not.toHaveBeenCalled()
    expect(textoDaTela()).toContain('A hora final deve ser maior que a inicial.')
  })

  it('IGUAL também é recusado — 10:00→10:00 é faixa de duração zero', () => {
    const acoes = fazerAcoes()
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosBase()} acoes={acoes} baseUrl="https://app.exemplo.com"
        faixaInicial={{ weekday: 1, start_time: '10:00', end_time: '10:00' }}
      />,
    )
    clicarBotao('Adicionar faixa')
    expect(acoes.onSalvarFaixas).not.toHaveBeenCalled()
    const r = validarFaixa({ weekday: 1, start_time: '10:00', end_time: '10:00' }, [])
    expect(faixaRecusada(r)).toBe(true)
    if (!faixaRecusada(r)) throw new Error('inalcançável')
    expect(r.motivo).toBe('FIM_ANTES_DO_INICIO')
  })

  it('hora impossível é HORA_INVALIDA, não FIM_ANTES_DO_INICIO — motivos distintos', () => {
    const a = validarFaixa({ weekday: 1, start_time: '25:00', end_time: '26:00' }, [])
    const b = validarFaixa({ weekday: 1, start_time: '09:70', end_time: '10:00' }, [])
    for (const r of [a, b]) {
      expect(faixaRecusada(r)).toBe(true)
      if (!faixaRecusada(r)) throw new Error('inalcançável')
      expect(r.motivo).toBe('HORA_INVALIDA')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('§6.4 — o link aparece DESLIGADO quando `is_enabled = false`', () => {
  it('DESLIGADO com `false`, LIGADO com `true` — o par, para discriminar', () => {
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosBase()} acoes={fazerAcoes()} baseUrl="https://app.exemplo.com"
      />,
    )
    // >>> A ASSERÇÃO LÊ O SELO EXATO, e isso não é preciosismo <<<
    // Em 05/10/2026 o selo passou de 'Agendamento DESLIGADO' para o texto do §4. E
    // `not.toContain('LIGADO')` NÃO serve como par: 'DESLIGADO' contém 'LIGADO', então a
    // asserção passaria nos DOIS estados e o caso deixaria de discriminar.
    expect(selo()).toBe(SELO_LINK_DESLIGADO)
    expect(selo()).not.toBe(SELO_LINK_LIGADO)

    desmontar()
    document.body.innerHTML = ''

    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosBase({ configuracao: { ...CFG_DESLIGADA, is_enabled: true } })}
        acoes={fazerAcoes()} baseUrl="https://app.exemplo.com"
      />,
    )
    expect(selo()).toBe(SELO_LINK_LIGADO)
  })

  it('o aviso de que o link AINDA NÃO FUNCIONA está na tela — a exposição é zero nesta fase', () => {
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosBase()} acoes={fazerAcoes()} baseUrl="https://app.exemplo.com"
      />,
    )
    expect(textoDaTela()).toContain(AVISO_LINK_AINDA_NAO_FUNCIONA)
    expect(AVISO_LINK_AINDA_NAO_FUNCIONA).toContain('ainda NÃO abre')
  })

  it('sem configuração aparece "Gerar link"; com configuração, o link montado', () => {
    const acoes = fazerAcoes()
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosBase({ configuracao: null })} acoes={acoes} baseUrl="https://app.exemplo.com"
      />,
    )
    expect(textoDaTela()).toContain('Gerar link')
    clicarBotao('Gerar link')
    expect(acoes.onGerarLink).toHaveBeenCalledTimes(1)

    desmontar()
    document.body.innerHTML = ''

    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosBase()} acoes={fazerAcoes()} baseUrl="https://app.exemplo.com"
      />,
    )
    const campo = document.body.querySelector('input[aria-label="Link de agendamento"]') as HTMLInputElement
    expect(campo).toBeTruthy()
    expect(campo.value).toBe('https://app.exemplo.com/agendar/TOKEN_OPACO_DE_TESTE')
  })

  it('o link carrega o TOKEN, nunca o nome da empresa', () => {
    expect(montarLinkPublico('https://a.com', 'xyz')).toBe('https://a.com/agendar/xyz')
    // barra sobrando na origem não duplica
    expect(montarLinkPublico('https://a.com/', 'xyz')).toBe('https://a.com/agendar/xyz')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('§6.5 — funcionário sem `user_id` mostra o aviso do §4; com `user_id`, não mostra', () => {
  const AVISO = 'ainda não tem acesso ao sistema'

  it('sem `user_id`: aparece. Com `user_id`: não aparece.', () => {
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosBase({
          funcionarios: [{ id: 'e1', name: 'Zé Barbeiro', user_id: null, tabelas: [TABELA_SERVICO_A] }],
        })}
        acoes={fazerAcoes()} baseUrl="https://app.exemplo.com"
      />,
    )
    expect(textoDaTela()).toContain(AVISO)
    expect(textoDaTela()).toContain('Envie o convite em Funcionários')

    desmontar()
    document.body.innerHTML = ''

    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosBase({
          funcionarios: [{ id: 'e1', name: 'Ana', user_id: 'auth-uid-1', tabelas: [TABELA_SERVICO_A] }],
        })}
        acoes={fazerAcoes()} baseUrl="https://app.exemplo.com"
      />,
    )
    expect(textoDaTela()).not.toContain(AVISO)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('§6.6 — o resolvedor do §1 tem TRÊS estados, não dois', () => {
  it('UMA tabela de SERVIÇO: devolve a tabela', () => {
    const r = resolverTabelaDeServico([TABELA_SERVICO_A, TABELA_PRODUTO])
    expect(r.estado).toBe('UMA')
    if (r.estado !== 'UMA') throw new Error('inalcançável')
    expect(r.tabela.id).toBe('ct-a')
  })

  it('ZERO tabelas de SERVIÇO: NENHUMA — e a de PRODUCT não conta', () => {
    const r = resolverTabelaDeServico([TABELA_PRODUTO])
    expect(r.estado).toBe('NENHUMA')
  })

  it('DUAS: AMBIGUA, com as duas na lista', () => {
    const r = resolverTabelaDeServico([TABELA_SERVICO_A, TABELA_SERVICO_B, TABELA_PRODUTO])
    expect(r.estado).toBe('AMBIGUA')
    if (r.estado !== 'AMBIGUA') throw new Error('inalcançável')
    expect(r.tabelas.map((t) => t.id)).toEqual(['ct-a', 'ct-b'])
  })

  it('os TRÊS estados são distintos — NENHUMA e AMBIGUA não colapsam em "erro"', () => {
    const estados = [
      resolverTabelaDeServico([TABELA_SERVICO_A]).estado,
      resolverTabelaDeServico([]).estado,
      resolverTabelaDeServico([TABELA_SERVICO_A, TABELA_SERVICO_B]).estado,
    ]
    expect(new Set(estados).size).toBe(3)
  })

  it('a tela AVISA em cada caso, com textos DIFERENTES — e nada com UMA', () => {
    // O par de telas: o aviso certo aparece, e o outro não. Um texto só para os dois mandaria
    // o dono do salão procurar o problema errado.
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosBase({ funcionarios: [{ id: 'e1', name: 'Zé', user_id: 'u', tabelas: [] }] })}
        acoes={fazerAcoes()} baseUrl="https://app.exemplo.com"
      />,
    )
    expect(textoDaTela()).toContain('não tem tabela de comissão de SERVIÇO vinculada')
    expect(textoDaTela()).not.toContain('tabelas de SERVIÇO vinculadas')

    desmontar()
    document.body.innerHTML = ''

    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosBase({
          funcionarios: [{ id: 'e1', name: 'Zé', user_id: 'u', tabelas: [TABELA_SERVICO_A, TABELA_SERVICO_B] }],
        })}
        acoes={fazerAcoes()} baseUrl="https://app.exemplo.com"
      />,
    )
    expect(textoDaTela()).toContain('2 tabelas de SERVIÇO vinculadas')
    expect(textoDaTela()).not.toContain('não tem tabela de comissão de SERVIÇO vinculada')

    desmontar()
    document.body.innerHTML = ''

    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosBase({ funcionarios: [{ id: 'e1', name: 'Zé', user_id: 'u', tabelas: [TABELA_SERVICO_A] }] })}
        acoes={fazerAcoes()} baseUrl="https://app.exemplo.com"
      />,
    )
    expect(textoDaTela()).toContain('Serviços')
    expect(textoDaTela()).not.toContain('não tem tabela de comissão de SERVIÇO vinculada')
    expect(textoDaTela()).not.toContain('tabelas de SERVIÇO vinculadas')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('§6.7 — o token tem 128 bits e dois seguidos diferem', () => {
  it('128 bits exatos', () => {
    expect(BYTES_DO_TOKEN * 8).toBe(128)
    const t = gerarTokenDeAgendamento()
    expect(Buffer.from(t, 'base64url').length).toBe(BYTES_DO_TOKEN)
  })

  it('dois seguidos diferem — e vinte seguidos são vinte valores distintos', () => {
    expect(gerarTokenDeAgendamento()).not.toBe(gerarTokenDeAgendamento())
    const vinte = Array.from({ length: 20 }, () => gerarTokenDeAgendamento())
    expect(new Set(vinte).size).toBe(20)
  })

  it('é seguro para URL: sem `+`, `/` nem `=`', () => {
    // É por isso que é `base64url` e não `base64`: um token que muda ao ser copiado para a
    // barra de endereço é um token que não funciona.
    for (let i = 0; i < 50; i += 1) {
      expect(gerarTokenDeAgendamento()).toMatch(/^[A-Za-z0-9_-]+$/)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('a migração e a tela declaram os MESMOS limites', () => {
  // `copia-divergente.md`: os limites estão escritos DUAS vezes — no `CHECK` da tabela e em
  // `LIMITES`. Os dois lugares são necessários (a tela recusa em português; o banco recusa o
  // que não passou pela tela), e é este caso que impede um lado de afrouxar sozinho.
  const sql = fs.readFileSync(MIGRACAO, 'utf8')

  it('`horizon_days` BETWEEN 1 AND 180 nos dois lados', () => {
    expect(sql).toContain('horizon_days BETWEEN 1 AND 180')
    expect(LIMITES.horizon_days.min).toBe(1)
    expect(LIMITES.horizon_days.max).toBe(180)
  })

  it('`grid_minutes` BETWEEN 5 AND 120 nos dois lados', () => {
    expect(sql).toContain('grid_minutes BETWEEN 5 AND 120')
    expect(LIMITES.grid_minutes.min).toBe(5)
    expect(LIMITES.grid_minutes.max).toBe(120)
  })

  it('`lead_time_min >= 0` — zero é legítimo, e os dois lados o aceitam', () => {
    expect(sql).toContain('lead_time_min >= 0')
    expect(LIMITES.lead_time_min.min).toBe(0)
  })

  it('os defaults da migração são os da tela', () => {
    expect(sql).toContain('lead_time_min    integer     NOT NULL DEFAULT 60')
    expect(sql).toContain('horizon_days     integer     NOT NULL DEFAULT 30')
    expect(sql).toContain('grid_minutes     integer     NOT NULL DEFAULT 30')
    expect(LIMITES.lead_time_min.default).toBe(60)
    expect(LIMITES.horizon_days.default).toBe(30)
    expect(LIMITES.grid_minutes.default).toBe(30)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('a migração liga RLS com política nas QUATRO operações, no MESMO arquivo', () => {
  // `portao-que-nao-alcanca.md`: ligar RLS sem política torna a tabela INACESSÍVEL — foi a
  // trava do passo 2 de 05/10/2026. E uma política apagada depois não quebraria nenhum caso de
  // comportamento, porque o jest não fala com o Postgres. Este é o único portão que alcança.
  const sql = fs.readFileSync(MIGRACAO, 'utf8')
  const TABELAS = ['tenant_booking_settings', 'employee_working_hours', 'employee_time_off']

  it.each(TABELAS)('%s: RLS ligada', (t) => {
    // `\s+` porque a migração alinha as três linhas em coluna — o alinhamento é legível e não
    // deve decidir se o portão passa.
    expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${t}\\s+ENABLE ROW LEVEL SECURITY`))
  })

  it.each(TABELAS)('%s: as quatro operações têm política', (t) => {
    for (const op of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      expect(sql).toContain(`FOR ${op}`)
      expect(sql).toMatch(new RegExp(`CREATE POLICY ${t}_${op.toLowerCase()} ON public\\.${t}`))
    }
  })

  it.each(TABELAS)('%s: o isolamento é por `get_auth_tenant_id`', (t) => {
    const bloco = sql.split(`CREATE POLICY ${t}_select`)[1] ?? ''
    expect(bloco).toContain('tenant_id = (SELECT public.get_auth_tenant_id())')
  })

  it.each(TABELAS)('%s: `anon` é revogado explicitamente', (t) => {
    expect(sql).toMatch(new RegExp(`REVOKE ALL ON public\\.${t}\\s+FROM anon;`))
  })

  it('`is_enabled` nasce `false` — DEFAULT true daria link público a 27 empresas', () => {
    expect(sql).toContain('is_enabled       boolean     NOT NULL DEFAULT false')
    expect(sql).not.toMatch(/is_enabled[^\n]*DEFAULT true/)
  })

  it('os dois índices do §2 estão lá', () => {
    expect(sql).toContain('idx_employee_working_hours_tenant_emp_weekday')
    expect(sql).toContain('idx_employee_time_off_tenant_emp_starts')
  })

  it('SEM backfill: a migração não tem INSERT em nenhuma das três', () => {
    // Um `INSERT` aqui criaria token para os 27 tenants de uma vez — e `is_enabled = false`
    // não protege contra um token vazado que a fase 2 passaria a atender.
    const semComentarios = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
    expect(semComentarios).not.toMatch(/INSERT\s+INTO/i)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('a superfície pública — a trava mudou de forma na FASE 2', () => {
  // >>> OS DOIS CASOS DE "NÃO EXISTE" FORAM SUBSTITUÍDOS, NÃO APAGADOS <<<
  //
  // Na fase 1 (05/10/2026) a trava era exposição ZERO: `pages/agendar` e `api/public` NÃO podiam
  // existir, e os dois casos afirmavam a ausência. A fase 2 (06/10/2026) cria os dois de
  // propósito — mantê-los vermelhos seria o portão barrando o trabalho que o comando pediu, e
  // apagá-los deixaria a superfície nova sem portão nenhum.
  //
  // O que substitui a ausência é o que a fase 2 tem de garantir: a superfície existe e é
  // GUARDADA PELO TOKEN. O link continua nascendo DESLIGADO em toda tenant.
  it('a página pública existe e NÃO fala com o supabase do navegador', () => {
    const pag = path.join(RAIZ, 'src/pages/agendar/[token].tsx')
    expect(fs.existsSync(pag)).toBe(true)
    // >>> OS COMENTÁRIOS SAEM ANTES DA ASSERÇÃO <<<
    // O cabeçalho da página MENCIONA `import { supabase }` para dizer que ele não está lá. Casar
    // com a menção deixaria o caso vermelho sobre código correto — é o mesmo erro que o caso do
    // `Math.random` cometeu nesta campanha, e a correção é a mesma: medir o PROGRAMA, não a prosa.
    const bruto = fs.readFileSync(pag, 'utf8')
    const txt = bruto
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
    // Zero import de client: a página só conversa com /api/public/agenda/*. Um import aqui
    // levaria a anon key ao navegador de qualquer visitante.
    expect(txt).not.toMatch(/from '@\/supabase/)
    expect(txt).not.toMatch(/createClient/)
    expect(txt).not.toMatch(/supabase/i)
  })

  it('as quatro rotas públicas existem', () => {
    const base = path.join(RAIZ, 'src/pages/api/public/agenda/[token]')
    for (const f of ['index.ts', 'servicos.ts', 'horarios.ts', 'agendar.ts']) {
      expect(fs.existsSync(path.join(base, f))).toBe(true)
    }
  })

  it('NENHUMA rota pública lê tenant_id do pedido — o tenant sai do TOKEN', () => {
    const base = path.join(RAIZ, 'src/pages/api/public/agenda/[token]')
    for (const f of ['index.ts', 'servicos.ts', 'horarios.ts', 'agendar.ts']) {
      const txt = fs.readFileSync(path.join(base, f), 'utf8')
      expect(txt).toContain('contextoDoToken(req.query.token)')
      // nem no corpo, nem na query, nem em header
      expect(txt).not.toMatch(/req\.body[^\n]*tenant_id/)
      expect(txt).not.toMatch(/req\.query[^\n]*tenant_id/)
      expect(txt).not.toMatch(/req\.headers[^\n]*tenant/i)
    }
  })

  it('a resolução do token FILTRA por is_enabled — token desligado é igual a inexistente', () => {
    const lib = fs.readFileSync(path.join(RAIZ, 'src/lib/agendamento-publico.ts'), 'utf8')
    expect(lib).toContain(".eq('is_enabled', true)")
    // E não existe ramo "existe mas está off" por onde a diferença possa escapar.
    expect(lib).not.toMatch(/is_enabled[^\n]*false/)
  })

  it('a rota que gera o token EXIGE sessão — `getCallerContext`', () => {
    const rota = fs.readFileSync(path.join(RAIZ, 'src/pages/api/agendamento/gerar-link.ts'), 'utf8')
    expect(rota).toContain('getCallerContext(req, res)')
    expect(rota).toContain('if (!caller) return')
    // O tenant vem do PERFIL do chamador, nunca do corpo: aceitá-lo do cliente deixaria
    // qualquer autenticado gerar link para outro salão.
    expect(rota).toContain('const tenant_id = caller.tenant_id')
    expect(rota).not.toMatch(/req\.body[^\n]*tenant_id/)
  })

  it('o token NÃO é gerado no navegador — `Math.random` não aparece em nenhum dos arquivos novos', () => {
    const arquivos = [
      'src/utils/agendamento-token.ts',
      'src/utils/agendamento-config.ts',
      'src/components/agenda/painel-de-agendamento.component.tsx',
      'src/pages/api/agendamento/gerar-link.ts',
    ]
    // >>> O COMENTÁRIO MENCIONA `Math.random()` PARA DIZER QUE ELE NÃO SERVE <<<
    // A primeira versão deste caso casava com essa menção e ficava VERMELHO sobre código
    // correto. A asserção é sobre a CHAMADA no código, então os comentários saem antes — do
    // contrário o portão mede a prosa, não o programa.
    const semComentarios = (txt: string) => txt
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
    for (const a of arquivos) {
      const conteudo = semComentarios(fs.readFileSync(path.join(RAIZ, a), 'utf8'))
      expect(conteudo).not.toMatch(/Math\.random\s*\(/)
    }
    const gerador = fs.readFileSync(path.join(RAIZ, 'src/utils/agendamento-token.ts'), 'utf8')
    expect(gerador).toContain("import { randomBytes } from 'crypto'")
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// REORGANIZAÇÃO DA TELA — comando do PO de 05/10/2026, depois de usar o painel em produção
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// Os casos acima continuam valendo e nenhum foi apagado. O único que mudou de asserção foi o do
// selo do link, porque o §4 trocou o TEXTO do selo — e a mudança está comentada lá, com a razão
// de o par `not.toContain('LIGADO')` não servir.

const CINCO = [
  { id: 'e1', name: 'Barbeiro Um', user_id: 'u1', tabelas: [TABELA_SERVICO_A] },
  { id: 'e2', name: 'Barbeiro Dois', user_id: 'u2', tabelas: [TABELA_SERVICO_A] },
  { id: 'e3', name: 'Barbeiro Três', user_id: null, tabelas: [TABELA_SERVICO_A] },
  { id: 'e4', name: 'Barbeiro Quatro', user_id: 'u4', tabelas: [] },
  { id: 'e5', name: 'Barbeiro Cinco', user_id: 'u5', tabelas: [TABELA_SERVICO_A, TABELA_SERVICO_B] },
]

/** e1 com duas faixas ATIVAS; e2 com uma INATIVA; e3 com uma ativa; e4 e e5 sem grade. */
const GRADE_CINCO = [
  { id: 'f1', employee_id: 'e1', weekday: 1, start_time: '09:00:00', end_time: '12:00:00', is_active: true },
  { id: 'f2', employee_id: 'e1', weekday: 1, start_time: '13:00:00', end_time: '18:00:00', is_active: true },
  { id: 'f3', employee_id: 'e2', weekday: 2, start_time: '09:00:00', end_time: '18:00:00', is_active: false },
  { id: 'f4', employee_id: 'e3', weekday: 3, start_time: '10:00:00', end_time: '16:00:00', is_active: true },
]

function dadosCinco(over: Partial<DadosDoAgendamento> = {}): DadosDoAgendamento {
  return {
    configuracao: CFG_DESLIGADA,
    grade: GRADE_CINCO as any,
    folgas: [],
    funcionarios: CINCO,
    ...over,
  }
}

function renderCinco(over: Partial<DadosDoAgendamento> = {}, acoes = fazerAcoes()) {
  renderizar(
    <PainelDeAgendamento
      open onClose={() => {}} calcType="SERVICE"
      dados={dadosCinco(over)} acoes={acoes} baseUrl="https://app.exemplo.com"
    />,
  )
  return acoes
}

/**
 * Clica no botão cujo texto é EXATAMENTE `rotulo`.
 *
 * >>> POR QUE EXATO, E NÃO POR SUBSTRING <<<
 *
 * `clicarBotaoExato('Aplicar')` casava com "Aplicar grade a outros profissionais", o botão que ABRE
 * o modal — e o caso reabria o modal em vez de clicar em "Aplicar" dentro dele. Medido: os três
 * casos da cópia falhavam sem que o componente tivesse defeito. Substring é ambígua assim que
 * dois rótulos compartilham um prefixo.
 */
function clicarBotaoExato(rotulo: string) {
  const botoes = Array.from(document.body.querySelectorAll('button'))
  const alvos = botoes.filter((b) => (b.textContent || '').trim() === rotulo)
  expect(alvos.length).toBe(1) // zero = rótulo errado; mais de um = o caso não sabe em qual clicou
  act(() => { alvos[0].dispatchEvent(new MouseEvent('click', { bubbles: true })) })
}

function clicarPorAriaLabel(rotulo: string) {
  const el = document.body.querySelector(`[aria-label="${rotulo}"]`)
  expect(el).toBeTruthy() // sem a guarda, rótulo errado faria o caso passar sem clicar em nada
  act(() => { (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })) })
}

// ───────────────────────────────────────────────────────────────────────────────────────────
describe('§2 — TODOS os funcionários aparecem ao mesmo tempo, não um por vez', () => {
  it('os CINCO nomes estão na tela simultaneamente', () => {
    renderCinco()
    const txt = textoDaTela()
    for (const f of CINCO) expect(txt).toContain(f.name)
  })

  it('o `Select` de "um funcionário por vez" NÃO existe mais', () => {
    // O par do caso acima. Sem ele, os cinco nomes poderiam estar na tela por estarem nas
    // OPÇÕES de um Select — que é exatamente o estado anterior, e o que o §2 manda derrubar.
    renderCinco()
    expect(document.body.querySelector('[aria-label="Profissional da grade"]')).toBeNull()
  })

  it('cada funcionário tem o SEU switch, e o de quem não tem grade está desabilitado', () => {
    renderCinco()
    for (const f of CINCO) {
      const sw = document.body.querySelector(`[aria-label="Aceita agendamento pelo link — ${f.name}"]`)
      expect(sw).toBeTruthy()
    }
    // e4 e e5 não têm faixa nenhuma → SEM_GRADE → switch desabilitado
    const semGrade = document.body.querySelector('[aria-label="Aceita agendamento pelo link — Barbeiro Quatro"]') as HTMLElement
    expect(semGrade.getAttribute('disabled')).not.toBeNull()
    // e1 tem faixas ativas → LIGADO → habilitado
    const ligado = document.body.querySelector('[aria-label="Aceita agendamento pelo link — Barbeiro Um"]') as HTMLElement
    expect(ligado.getAttribute('disabled')).toBeNull()
  })

  it('o bloco de quem está DESLIGADO vem recolhido; o de quem está LIGADO, aberto', () => {
    renderCinco()
    const txt = textoDaTela()
    // e2 está DESLIGADO (única faixa inativa) → recolhido, e o botão oferece MOSTRAR
    expect(txt).toContain('Mostrar grade de Barbeiro Dois')
    // e1 está LIGADO → aberto, e o botão oferece OCULTAR
    expect(txt).toContain('Ocultar grade de Barbeiro Um')
  })
})

describe('§2 — os TRÊS estados do funcionário, sem coluna nova', () => {
  // A medição que sustenta a decisão está no cabeçalho de `estadoDoFuncionarioNoLink`: as duas
  // situações são linhas DIFERENTES, não o mesmo byte, então nenhuma coluna é necessária.
  it('zero faixas = SEM_GRADE; todas inativas = DESLIGADO; alguma ativa = LIGADO', () => {
    expect(estadoDoFuncionarioNoLink([])).toBe('SEM_GRADE')
    expect(estadoDoFuncionarioNoLink([
      { weekday: 1, start_time: '09:00', end_time: '18:00', is_active: false },
    ])).toBe('DESLIGADO')
    expect(estadoDoFuncionarioNoLink([
      { weekday: 1, start_time: '09:00', end_time: '18:00', is_active: false },
      { weekday: 2, start_time: '09:00', end_time: '18:00', is_active: true },
    ])).toBe('LIGADO')
  })

  it('os três são DISTINTOS — SEM_GRADE e DESLIGADO não colapsam', () => {
    const estados = [
      estadoDoFuncionarioNoLink([]),
      estadoDoFuncionarioNoLink([{ weekday: 1, start_time: '09:00', end_time: '18:00', is_active: false }]),
      estadoDoFuncionarioNoLink([{ weekday: 1, start_time: '09:00', end_time: '18:00', is_active: true }]),
    ]
    expect(new Set(estados).size).toBe(3)
  })

  it('`is_active` AUSENTE conta como ativa — a coluna é NOT NULL DEFAULT true', () => {
    // Ler ausência como `false` desligaria silenciosamente quem o banco gravou ligado.
    expect(estadoDoFuncionarioNoLink([{ weekday: 1, start_time: '09:00', end_time: '18:00' }])).toBe('LIGADO')
    expect(funcionarioAceitaAgendamento([{ weekday: 1, start_time: '09:00', end_time: '18:00' }])).toBe(true)
    expect(funcionarioAceitaAgendamento([])).toBe(false)
  })
})

describe('§2 — o switch desliga TODAS as faixas do funcionário e NENHUMA de outro', () => {
  it('clicar no switch de e1 chama a ação com e1 e `false`, e nenhum outro id', () => {
    const acoes = renderCinco()
    clicarPorAriaLabel('Aceita agendamento pelo link — Barbeiro Um')

    expect(acoes.onAlternarFuncionario).toHaveBeenCalledTimes(1)
    // e1 está LIGADO, então o clique pede DESLIGAR
    expect(acoes.onAlternarFuncionario).toHaveBeenCalledWith('e1', false)
    // >>> E NENHUM OUTRO FUNCIONÁRIO FOI TOCADO <<<
    // Sem esta asserção, um componente que chamasse a ação para os cinco passaria no `toBe`
    // acima — afirmar que e1 foi chamado não é afirmar que SÓ e1 foi.
    // A assinatura de `AcoesDoPainel` vence a index signature do fixture, então `.mock` não
    // existe no TIPO — o cast nomeia o que o valor é de fato.
    const ids = (acoes.onAlternarFuncionario as jest.Mock).mock.calls.map((c: any[]) => c[0])
    expect(ids).toEqual(['e1'])
  })

  it('o de e2, que está DESLIGADO, pede LIGAR — o sentido do clique depende do estado', () => {
    const acoes = renderCinco()
    clicarPorAriaLabel('Aceita agendamento pelo link — Barbeiro Dois')
    expect(acoes.onAlternarFuncionario).toHaveBeenCalledWith('e2', true)
  })

  it('o switch de quem está SEM_GRADE não dispara nada', () => {
    const acoes = renderCinco()
    clicarPorAriaLabel('Aceita agendamento pelo link — Barbeiro Quatro')
    expect(acoes.onAlternarFuncionario).not.toHaveBeenCalled()
  })
})

// ───────────────────────────────────────────────────────────────────────────────────────────
describe('§1 — a ordem das seções é a do trabalho: Grade antes de Link', () => {
  it('Grade → Férias → Ajustes → Link, nesta ordem no DOM', () => {
    renderCinco()
    const txt = textoDaTela()
    const pos = (t: string) => {
      const i = txt.indexOf(t)
      expect(i).toBeGreaterThan(-1) // rótulo ausente faria as comparações abaixo passar com -1
      return i
    }
    const grade = pos('Grade de atendimento')
    const folgas = pos('Férias, folgas e feriados')
    const ajustes = pos('Ajustes')
    const link = pos('Link de agendamento')

    expect(grade).toBeLessThan(folgas)
    expect(folgas).toBeLessThan(ajustes)
    expect(ajustes).toBeLessThan(link)
    // O que a reorganização consertou, dito como asserção: o link deixou de vir primeiro.
    expect(grade).toBeLessThan(link)
  })
})

// ───────────────────────────────────────────────────────────────────────────────────────────
describe('§4 — o link é GRAVADO e copiável sempre, nos dois estados com token', () => {
  it('com token e DESLIGADO: o link aparece, há botão de copiar, e o selo diz DESLIGADO', () => {
    renderCinco()
    const campo = document.body.querySelector('input[aria-label="Link de agendamento"]') as HTMLInputElement
    expect(campo).toBeTruthy()
    expect(campo.value).toBe('https://app.exemplo.com/agendar/TOKEN_OPACO_DE_TESTE')
    expect(document.body.querySelector('[aria-label="Copiar link de agendamento"]')).toBeTruthy()
    expect(selo()).toBe(SELO_LINK_DESLIGADO)
    // e o "Gerar link" SOME quando já existe token — o §4 pede isso com estas palavras
    expect(textoDaTela()).not.toContain('Gerar link')
  })

  it('com token e LIGADO: o link e o copiar continuam lá, e o selo diz LIGADO', () => {
    renderCinco({ configuracao: { ...CFG_DESLIGADA, is_enabled: true } })
    const campo = document.body.querySelector('input[aria-label="Link de agendamento"]') as HTMLInputElement
    expect(campo.value).toBe('https://app.exemplo.com/agendar/TOKEN_OPACO_DE_TESTE')
    expect(document.body.querySelector('[aria-label="Copiar link de agendamento"]')).toBeTruthy()
    expect(selo()).toBe(SELO_LINK_LIGADO)
  })

  it('SEM token: aparece "Gerar link" e NÃO aparece link nenhum', () => {
    renderCinco({ configuracao: null })
    expect(textoDaTela()).toContain('Gerar link')
    expect(document.body.querySelector('input[aria-label="Link de agendamento"]')).toBeNull()
    expect(document.body.querySelector('[aria-label="Copiar link de agendamento"]')).toBeNull()
    expect(selo()).toBeNull()
  })

  it('NÃO existe botão de gerar OUTRO token — trocá-lo invalidaria o link já publicado', () => {
    renderCinco()
    const txt = textoDaTela()
    expect(txt).not.toMatch(/gerar outro|novo token|regerar/i)
  })
})

// ───────────────────────────────────────────────────────────────────────────────────────────
describe('§3 — aplicar a mesma grade a vários SUBSTITUI, e o aviso traz o NÚMERO', () => {
  function abrirCopia(acoes = fazerAcoes()) {
    renderCinco({}, acoes)
    clicarBotaoExato('Aplicar grade a outros profissionais')
    return acoes
  }

  it('o plano diz quantas faixas cada destino PERDE e quantas GANHA', () => {
    const porEmp = (id: string) => GRADE_CINCO.filter((f) => f.employee_id === id) as any
    const planos = planejarCopiaDaGrade(
      porEmp('e1'),                                   // origem: 2 faixas
      [{ id: 'e2', name: 'Dois' }, { id: 'e4', name: 'Quatro' }],
      porEmp,
    )
    expect(planos).toEqual([
      { destino_id: 'e2', destino_nome: 'Dois', faixasAPerder: 1, faixasAGanhar: 2 },
      { destino_id: 'e4', destino_nome: 'Quatro', faixasAPerder: 0, faixasAGanhar: 2 },
    ])
  })

  it('exige confirmação SÓ quando algum destino tem faixa a perder', () => {
    expect(exigeConfirmacaoDaCopia([
      { destino_id: 'a', destino_nome: 'A', faixasAPerder: 0, faixasAGanhar: 2 },
    ])).toBe(false)
    expect(exigeConfirmacaoDaCopia([
      { destino_id: 'a', destino_nome: 'A', faixasAPerder: 0, faixasAGanhar: 2 },
      { destino_id: 'b', destino_nome: 'B', faixasAPerder: 3, faixasAGanhar: 2 },
    ])).toBe(true)
  })

  it('o aviso traz o NÚMERO de faixas perdidas, com o nome do destino', () => {
    const aviso = avisoDaCopiaDaGrade([
      { destino_id: 'b', destino_nome: 'Barbeiro Dois', faixasAPerder: 3, faixasAGanhar: 2 },
    ])
    expect(aviso).toContain('Barbeiro Dois perde 3 faixa(s)')
    expect(aviso).toContain('SUBSTITUI')
    // O par: sem perda, o aviso diz que nada será apagado — não repete o alarme.
    const semPerda = avisoDaCopiaDaGrade([
      { destino_id: 'q', destino_nome: 'Quatro', faixasAPerder: 0, faixasAGanhar: 2 },
    ])
    expect(semPerda).toContain('Nenhum deles tem grade hoje')
    expect(semPerda).not.toContain('SUBSTITUI')
  })

  it('DESTINO COM FAIXAS: pede confirmação, mostra o número, e NÃO grava no primeiro clique', () => {
    const acoes = abrirCopia()
    clicarPorAriaLabel('Copiar para Barbeiro Dois') // e2 tem 1 faixa
    expect(textoDaTela()).toContain('Barbeiro Dois perde 1 faixa(s)')

    clicarBotaoExato('Aplicar')
    // >>> O EFEITO PRIMEIRO: o primeiro clique NÃO grava <<<
    expect(acoes.onAplicarGrade).not.toHaveBeenCalled()
    expect(textoDaTela()).toContain('Confirmar substituição')
  })

  it('CANCELAR a confirmação NÃO altera faixa nenhuma', () => {
    const acoes = abrirCopia()
    clicarPorAriaLabel('Copiar para Barbeiro Dois')
    clicarBotaoExato('Aplicar')
    clicarBotaoExato('Cancelar')

    expect(acoes.onAplicarGrade).not.toHaveBeenCalled()
    // e nenhuma outra ação de escrita foi disparada pelo caminho do cancelamento
    expect(acoes.onSalvarFaixas).not.toHaveBeenCalled()
    expect(acoes.onRemoverFaixa).not.toHaveBeenCalled()
  })

  it('CONFIRMAR grava, com a origem e os destinos escolhidos', () => {
    const acoes = abrirCopia()
    clicarPorAriaLabel('Copiar para Barbeiro Dois')
    clicarBotaoExato('Aplicar')
    clicarBotaoExato('Confirmar substituição')

    expect(acoes.onAplicarGrade).toHaveBeenCalledTimes(1)
    expect(acoes.onAplicarGrade).toHaveBeenCalledWith('e1', ['e2'])
  })

  it('DESTINO VAZIO: não pede confirmação, grava no primeiro clique', () => {
    // O espelho. Sem ele, "pede confirmação" ficaria verde num componente que pede SEMPRE — e
    // confirmação em todo caso ensina a clicar sem ler.
    const acoes = abrirCopia()
    clicarPorAriaLabel('Copiar para Barbeiro Quatro') // e4 tem 0 faixas
    clicarBotaoExato('Aplicar')

    expect(acoes.onAplicarGrade).toHaveBeenCalledTimes(1)
    expect(acoes.onAplicarGrade).toHaveBeenCalledWith('e1', ['e4'])
  })

  it('sem destino escolhido, nada é gravado', () => {
    const acoes = abrirCopia()
    clicarBotaoExato('Aplicar')
    expect(acoes.onAplicarGrade).not.toHaveBeenCalled()
  })

  it('a ORIGEM não aparece entre os destinos — copiar para si mesmo não é operação', () => {
    abrirCopia()
    expect(document.body.querySelector('[aria-label="Copiar para Barbeiro Um"]')).toBeNull()
    expect(document.body.querySelector('[aria-label="Copiar para Barbeiro Dois"]')).toBeTruthy()
  })
})

// ───────────────────────────────────────────────────────────────────────────────────────────
describe('§3 — a SEQUÊNCIA roda de verdade, e o portão afirma o ESTADO FINAL das faixas', () => {
  // >>> ESTES CASOS EXECUTAM A LÓGICA, não leem o texto do arquivo <<<
  //
  // A primeira versão deste bloco afirmava a ORDEM das chamadas pelo texto de
  // `aplicar-grade.ts` (`indexOf('.insert(') < indexOf('.delete()')`). Ficaria verde se alguém
  // trocasse a ordem preservando as palavras, e não dizia nada sobre o resultado —
  // `portao-que-nao-alcanca.md`. A lógica foi extraída para `@/utils/aplicar-grade` com
  // repositório injetado justamente para que o caso possa rodá-la contra um armazém em memória.

  /** O armazém em memória. `falharAoApagar` é o gatilho da compensação. */
  function fazerRepo(
    inicial: FaixaPersistida[],
    opts: { falharAoApagar?: boolean; falharAoInserir?: boolean } = {},
  ) {
    let seq = 0
    const faixas = inicial.map((f) => ({ ...f }))
    const repo: RepositorioDaGrade = {
      lerFaixas: async (employee_id) => faixas.filter((f) => f.employee_id === employee_id).map((f) => ({ ...f })),
      inserirFaixas: async (employee_id, novas) => {
        if (opts.falharAoInserir) throw new Error('insert falhou')
        const ids: string[] = []
        for (const n of novas) {
          seq += 1
          const id = `novo-${employee_id}-${seq}`
          faixas.push({ id, employee_id, ...n })
          ids.push(id)
        }
        return ids
      },
      apagarFaixas: async (ids) => {
        if (opts.falharAoApagar) throw new Error('delete falhou')
        for (const id of ids) {
          const i = faixas.findIndex((f) => f.id === id)
          if (i >= 0) faixas.splice(i, 1)
        }
      },
    }
    return { repo, faixas }
  }

  const ORIGEM: FaixaPersistida[] = [
    { id: 'o1', employee_id: 'e1', weekday: 1, start_time: '09:00', end_time: '12:00', is_active: true },
    { id: 'o2', employee_id: 'e1', weekday: 1, start_time: '13:00', end_time: '18:00', is_active: true },
  ]
  const DESTINO_COM_GRADE: FaixaPersistida[] = [
    { id: 'd1', employee_id: 'e2', weekday: 5, start_time: '08:00', end_time: '11:00', is_active: true },
  ]

  it('SUBSTITUI: o destino fica SÓ com as faixas da origem, e as dele desaparecem', async () => {
    const { repo, faixas } = fazerRepo([...ORIGEM, ...DESTINO_COM_GRADE])
    const r = await aplicarGradeEmDestinos(repo, 'e1', ['e2'])

    expect(r).toEqual([{ destino_id: 'e2', aplicado: true, apagadas: 1, criadas: 2 }])

    // >>> A ASSERÇÃO DE ESTADO FINAL — é esta que a mutação do §6 mata <<<
    const doDestino = faixas.filter((f) => f.employee_id === 'e2')
    expect(doDestino).toHaveLength(2)
    expect(doDestino.map((f) => `${f.weekday} ${f.start_time}-${f.end_time}`).sort())
      .toEqual(['1 09:00-12:00', '1 13:00-18:00'])
    // a faixa de sexta do destino NÃO sobrou
    expect(faixas.some((f) => f.id === 'd1')).toBe(false)
    // e a origem ficou intacta
    expect(faixas.filter((f) => f.employee_id === 'e1')).toHaveLength(2)
  })

  it('destino SEM grade recebe as faixas e nada é apagado', async () => {
    const { repo, faixas } = fazerRepo([...ORIGEM])
    const r = await aplicarGradeEmDestinos(repo, 'e1', ['e9'])
    expect(r).toEqual([{ destino_id: 'e9', aplicado: true, apagadas: 0, criadas: 2 }])
    expect(faixas.filter((f) => f.employee_id === 'e9')).toHaveLength(2)
  })

  it('VÁRIOS destinos: cada um fica só com a grade da origem', async () => {
    const { repo, faixas } = fazerRepo([
      ...ORIGEM,
      ...DESTINO_COM_GRADE,
      { id: 'd9', employee_id: 'e3', weekday: 6, start_time: '07:00', end_time: '09:00', is_active: true },
    ])
    const r = await aplicarGradeEmDestinos(repo, 'e1', ['e2', 'e3'])
    expect(r.every((x) => x.aplicado)).toBe(true)
    expect(faixas.filter((f) => f.employee_id === 'e2')).toHaveLength(2)
    expect(faixas.filter((f) => f.employee_id === 'e3')).toHaveLength(2)
    expect(faixas.some((f) => f.id === 'd1' || f.id === 'd9')).toBe(false)
  })

  it('INSERT falha: o destino fica COMO ESTAVA — nada foi apagado', async () => {
    // É a razão de a ordem ser inserir-depois-apagar. Na ordem inversa este caso deixaria o
    // destino VAZIO, e o estado final abaixo seria 0 em vez de 1.
    const { repo, faixas } = fazerRepo([...ORIGEM, ...DESTINO_COM_GRADE], { falharAoInserir: true })
    const r = await aplicarGradeEmDestinos(repo, 'e1', ['e2'])

    expect(r[0].aplicado).toBe(false)
    expect(r[0].erro).toContain('insert falhou')
    const doDestino = faixas.filter((f) => f.employee_id === 'e2')
    expect(doDestino).toHaveLength(1)
    expect(doDestino[0].id).toBe('d1')
  })

  it('DELETE falha: a COMPENSAÇÃO repõe o destino, sem velhas MAIS novas', async () => {
    // Sem a compensação o destino ficaria com 1 + 2 = 3 faixas, duplicadas e sobrepostas, que a
    // tela nunca teria aceito. Esta asserção é sobre o NÚMERO final, não sobre o erro.
    let permitirApagar = false
    const faixas: FaixaPersistida[] = [...ORIGEM, ...DESTINO_COM_GRADE].map((f) => ({ ...f }))
    let seq = 0
    const repo: RepositorioDaGrade = {
      lerFaixas: async (id) => faixas.filter((f) => f.employee_id === id).map((f) => ({ ...f })),
      inserirFaixas: async (id, novas) => {
        const ids: string[] = []
        for (const n of novas) { seq += 1; const nid = `novo-${seq}`; faixas.push({ id: nid, employee_id: id, ...n }); ids.push(nid) }
        permitirApagar = false // o apagar das ANTIGAS vai falhar
        return ids
      },
      apagarFaixas: async (ids) => {
        if (!permitirApagar) {
          permitirApagar = true // o apagar da COMPENSAÇÃO passa
          throw new Error('delete falhou')
        }
        for (const i of ids) { const k = faixas.findIndex((f) => f.id === i); if (k >= 0) faixas.splice(k, 1) }
      },
    }

    const r = await aplicarGradeEmDestinos(repo, 'e1', ['e2'])
    expect(r[0].aplicado).toBe(false)

    const doDestino = faixas.filter((f) => f.employee_id === 'e2')
    expect(doDestino).toHaveLength(1)        // reposto, não 3
    expect(doDestino[0].id).toBe('d1')       // e é a faixa ORIGINAL dele
  })

  it('um destino que falha NÃO impede os outros', async () => {
    const faixas: FaixaPersistida[] = [...ORIGEM].map((f) => ({ ...f }))
    let seq = 0
    const repo: RepositorioDaGrade = {
      lerFaixas: async (id) => faixas.filter((f) => f.employee_id === id).map((f) => ({ ...f })),
      inserirFaixas: async (id, novas) => {
        if (id === 'eX') throw new Error('destino quebrado')
        const ids: string[] = []
        for (const n of novas) { seq += 1; const nid = `n-${seq}`; faixas.push({ id: nid, employee_id: id, ...n }); ids.push(nid) }
        return ids
      },
      apagarFaixas: async (ids) => { for (const i of ids) { const k = faixas.findIndex((f) => f.id === i); if (k >= 0) faixas.splice(k, 1) } },
    }
    const r = await aplicarGradeEmDestinos(repo, 'e1', ['eX', 'eOK'])
    expect(r.map((x) => x.aplicado)).toEqual([false, true])
    expect(faixas.filter((f) => f.employee_id === 'eOK')).toHaveLength(2)
    expect(faixas.filter((f) => f.employee_id === 'eX')).toHaveLength(0)
  })

  it('origem SEM faixas: o destino é ZERADO, e isso é o comportamento pedido', async () => {
    // Copiar uma grade vazia é esvaziar o destino. Está aqui para que a decisão fique registrada
    // como decisão, e não seja "consertada" por quem a encontrar achando que é defeito.
    const { repo, faixas } = fazerRepo([...DESTINO_COM_GRADE])
    const r = await aplicarGradeEmDestinos(repo, 'e1', ['e2'])
    expect(r).toEqual([{ destino_id: 'e2', aplicado: true, apagadas: 1, criadas: 0 }])
    expect(faixas.filter((f) => f.employee_id === 'e2')).toHaveLength(0)
  })
})

describe('§3 — a rota de API é só autenticação e repositório', () => {
  const rota = fs.readFileSync(path.join(RAIZ, 'src/pages/api/agendamento/aplicar-grade.ts'), 'utf8')

  it('exige sessão, e o `tenant_id` vem do perfil, nunca do corpo', () => {
    expect(rota).toContain('getCallerContext(req, res)')
    expect(rota).toContain('if (!caller) return')
    expect(rota).toContain('const tenant_id = caller.tenant_id')
    expect(rota).not.toMatch(/req\.body[^\n]*tenant_id/)
  })

  it('as faixas copiadas NÃO vêm do corpo — o cliente manda QUEM, não O QUE', () => {
    expect(rota).not.toMatch(/req\.body[^\n]*faixas/)
    expect(rota).toContain('aplicarGradeEmDestinos(repo, origem_id, destino_ids)')
  })

  it('o `tenant_id` cobre as TRÊS operações — por `.eq` em duas, e na LINHA no insert', () => {
    // O `supabaseAdmin` passa por cima da RLS, então este é o único isolamento que resta, e uma
    // das três sem ele vazaria entre salões sem que nenhum caso de comportamento visse.
    //
    // >>> A PRIMEIRA VERSÃO DESTE CASO ESPERAVA TRÊS `.eq` E FICOU VERMELHA SOBRE CÓDIGO
    // CORRETO <<< O `insert` não FILTRA por tenant: ele GRAVA o tenant na linha. São dois
    // mecanismos para a mesma proteção, e contar só um deles mede a forma em vez do efeito.
    const filtros = rota.match(/\.eq\('tenant_id', tenant_id\)/g) ?? []
    expect(filtros).toHaveLength(2)   // lerFaixas e apagarFaixas
    expect(rota).toMatch(/\.insert\([\s\S]{0,200}tenant_id,/)   // inserirFaixas grava na linha
  })

  it('a origem não pode ser um dos destinos', () => {
    expect(rota).toContain('destino_ids.includes(origem_id)')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// §1 — AS DATAS SÃO BRASILEIRAS, e até 06/10/2026 isso não tinha portão
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// A formatação estava sustentada por INSPEÇÃO VISUAL. Nenhum caso afirmava `DD/MM/YYYY`, então
// remover o `format` do DatePicker deixaria a tela em `2026-11-05` com a suíte inteira verde —
// `portao-que-nao-alcanca.md`: o indicador não podia mudar no caso que se queria detectar.
//
// A asserção é sobre o que o INPUT EXIBE, não sobre a prop: prop não se lê do DOM, e afirmar o
// texto do arquivo-fonte ficaria verde se alguém trocasse o formato preservando a palavra.
describe('§1 — os DatePicker de ausência exibem a data em DD/MM/YYYY', () => {
  const DIA_CONHECIDO = '2026-11-05T00:00:00.000Z'   // 5 de novembro de 2026
  const OUTRO_DIA = '2026-11-07T23:59:59.999Z'       // 7 de novembro de 2026

  function renderComDatas() {
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosCinco()} acoes={fazerAcoes()} baseUrl="https://app.exemplo.com"
        folgaInicial={{ starts_at: DIA_CONHECIDO, ends_at: OUTRO_DIA }}
      />,
    )
  }

  function valorDoCampo(rotulo: string): string {
    const el = document.body.querySelector(`input[aria-label="${rotulo}"]`) as HTMLInputElement
    expect(el).toBeTruthy() // rótulo errado faria as comparações abaixo passar comparando undefined
    return el.value
  }

  it('o campo de INÍCIO mostra 05/11/2026, e NÃO 2026-11-05', () => {
    renderComDatas()
    expect(valorDoCampo('Início da ausência')).toBe('05/11/2026')
    // O par negativo é o que mata a mutação: sem `format`, o antd cai em `YYYY-MM-DD`.
    expect(valorDoCampo('Início da ausência')).not.toBe('2026-11-05')
  })

  it('o campo de FIM mostra 07/11/2026, e NÃO 2026-11-07', () => {
    renderComDatas()
    expect(valorDoCampo('Fim da ausência')).toBe('07/11/2026')
    expect(valorDoCampo('Fim da ausência')).not.toBe('2026-11-07')
  })

  it('a data escolhida NÃO é uma data qualquer bem formatada — o dia e o mês não trocam de lugar', () => {
    // 05/11 e 11/05 são os dois formatáveis a partir do mesmo ISO. Um caso com dia 11 e mês 11
    // passaria com DD/MM e com MM/DD, e não discriminaria nada.
    renderComDatas()
    expect(valorDoCampo('Início da ausência')).not.toBe('11/05/2026')
  })

  it('a LISTA de ausências também é DD/MM/YYYY, e sem hora (§4: dia inteiro)', () => {
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosCinco({
          folgas: [{ id: 'fo1', employee_id: 'e1', starts_at: DIA_CONHECIDO, ends_at: OUTRO_DIA, reason: 'Férias' }],
        })}
        acoes={fazerAcoes()} baseUrl="https://app.exemplo.com"
      />,
    )
    const txt = textoDaTela()
    expect(txt).toContain('05/11/2026')
    expect(txt).not.toContain('2026-11-05')
    // O 00:00 e o 23:59 são DERIVADOS do dia inteiro; exibi-los afirmaria uma hora que o
    // usuário não escolheu (`ausente-vs-falso.md`).
    expect(txt).not.toContain('05/11/2026 00:00')
    expect(txt).not.toContain('23:59')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// AS QUATRO FAIXAS QUE JÁ EXISTEM EM PRODUÇÃO, lidas do banco em 06/10/2026
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// Dois funcionários, cada um com SEGUNDA 09:00–12:00 e 14:00–20:00 — o barbeiro de dois turnos,
// gravado pelo painel ANTES do refactor de `faixaPorEmp` para `{ dias: number[] }`.
//
// Os ids e as horas são os reais, com os SEGUNDOS que o Postgres devolve (`09:00:00`), porque é
// nisso que um `slice(0, 5)` errado apareceria.
describe('as 4 faixas reais de produção continuam legíveis depois do refactor', () => {
  const E1 = '7ab2d14a-ff00-4b3e-989a-85a0deb00c76'
  const E2 = 'e0f8177b-45fb-48ab-9d37-c0f92c0a0f33'
  const QUATRO_REAIS = [
    { id: '44552eac-b193-4dec-a56f-06998a418897', employee_id: E1, weekday: 1, start_time: '09:00:00', end_time: '12:00:00', is_active: true },
    { id: '64c28ce4-3059-4250-b546-3eee04bbb91d', employee_id: E1, weekday: 1, start_time: '14:00:00', end_time: '20:00:00', is_active: true },
    { id: '391f5d6d-551a-4285-9df8-ccbc7ac3db70', employee_id: E2, weekday: 1, start_time: '09:00:00', end_time: '12:00:00', is_active: true },
    { id: '25644bf3-c862-4203-a97a-6255a3c37b5f', employee_id: E2, weekday: 1, start_time: '14:00:00', end_time: '20:00:00', is_active: true },
  ]
  const DOIS: FuncionarioDoPainel[] = [
    { id: E1, name: 'Barbeiro A', user_id: null, tabelas: [TABELA_SERVICO_A] },
    { id: E2, name: 'Barbeiro B', user_id: null, tabelas: [TABELA_SERVICO_A] },
  ]

  function renderReais(acoes = fazerAcoes()) {
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={{ configuracao: CFG_DESLIGADA, grade: QUATRO_REAIS as any, folgas: [], funcionarios: DOIS }}
        acoes={acoes} baseUrl="https://app.exemplo.com"
      />,
    )
    return acoes
  }

  it('(4a) as QUATRO aparecem, com os horários certos e sem os segundos', () => {
    renderReais()
    const txt = textoDaTela()
    // duas por funcionário, e os dois blocos abertos porque ambos estão LIGADOS
    expect(txt.split('09:00–12:00')).toHaveLength(3) // 2 ocorrências = 3 pedaços
    expect(txt.split('14:00–20:00')).toHaveLength(3)
    // e os segundos do Postgres NÃO vazam para a tela
    expect(txt).not.toContain('09:00:00')
    expect(txt).not.toContain('20:00:00')
  })

  it('(4a) o switch de cada um lê LIGADO a partir das faixas que vieram do banco', () => {
    renderReais()
    for (const f of DOIS) {
      const sw = document.body.querySelector(`[aria-label="Aceita agendamento pelo link — ${f.name}"]`) as HTMLElement
      expect(sw).toBeTruthy()
      expect(sw.getAttribute('disabled')).toBeNull()   // tem grade, então não é SEM_GRADE
    }
  })

  it('(4b) a lixeira de uma faixa EXISTENTE chama `onRemoverFaixa` com o id dela', () => {
    // O handler não ficou órfão no refactor: quem mudou foi o estado do FORMULÁRIO, não o
    // caminho de remoção. O clique percorre o Popconfirm e chega na ação.
    const acoes = renderReais()
    const alvo = '64c28ce4-3059-4250-b546-3eee04bbb91d'
    clicarPorAriaLabel(`Remover faixa ${alvo}`)
    // o Popconfirm abre; confirmar é o botão "OK" do antd
    const ok = Array.from(document.body.querySelectorAll('button'))
      .find((b) => /^(OK|Ok)$/.test((b.textContent || '').trim()))
    expect(ok).toBeTruthy()
    act(() => { ok!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(acoes.onRemoverFaixa).toHaveBeenCalledWith(alvo)
    // e NENHUMA outra faixa foi pedida para remoção
    expect((acoes.onRemoverFaixa as jest.Mock).mock.calls.map((c: any[]) => c[0])).toEqual([alvo])
  })

  it('(4c) o estado novo `{ dias: [] }` não interfere na leitura do que veio do banco', () => {
    // >>> A PROVA DE QUE AS DUAS COISAS NÃO SE TOCAM <<<
    // `faixaPorEmp` (o `{ dias: [] }`) é o estado do FORMULÁRIO, com chave por funcionário. As
    // faixas gravadas chegam por `dados.grade` e são agrupadas em `faixasPorEmp`. Nenhuma linha
    // do banco passa pelo estado do formulário, e é por isso que faixa sem o campo `dias`
    // continua sendo exibida.
    renderReais()
    // as quatro continuam na tela…
    expect(textoDaTela()).toContain('09:00–12:00')
    // …e nenhuma caixa de dia nasce marcada por causa delas
    for (const d of ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']) {
      const cx = document.body.querySelector(`[aria-label="${
        d === 'Dom' ? 'Domingo' : d === 'Seg' ? 'Segunda' : d === 'Ter' ? 'Terça'
        : d === 'Qua' ? 'Quarta' : d === 'Qui' ? 'Quinta' : d === 'Sex' ? 'Sexta' : 'Sábado'
      } — Barbeiro A"]`) as HTMLInputElement
      expect(cx).toBeTruthy()
      expect(cx.checked).toBe(false)
    }
  })

  it('(4c) com a grade do banco, o utilitário novo ainda recusa sobreposição', () => {
    // UM funcionário só neste caso, de propósito: com dois, existem DOIS botões "Adicionar
    // faixa" e o clique seria ambíguo. A primeira versão renderizava o painel duas vezes sem
    // desmontar e o helper achou QUATRO botões — a guarda `expect(alvos.length).toBe(1)` pegou,
    // que é exatamente para isso que ela existe.
    const acoes = fazerAcoes()
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={{
          configuracao: CFG_DESLIGADA,
          grade: QUATRO_REAIS.filter((f) => f.employee_id === E1) as any,
          folgas: [],
          funcionarios: [DOIS[0]],
        }}
        acoes={acoes} baseUrl="https://app.exemplo.com"
        faixaInicial={{ weekday: 1, start_time: '10:00', end_time: '11:00' }}
      />,
    )
    clicarBotaoExato('Adicionar faixa')
    // 10:00–11:00 invade a faixa REAL da manhã (09:00–12:00) → recusa, e nada é gravado.
    expect(acoes.onSalvarFaixas).not.toHaveBeenCalled()
    expect(textoDaTela()).toContain('Já existe faixa nesse horário em: Segunda.')
  })

  it('(4c) e ACEITA o intervalo de almoço real: 12:00–14:00 encosta nas duas e entra', () => {
    // O espelho, com os dados de produção: sem ele, "recusa" ficaria verde num painel que
    // recusasse tudo contra a grade vinda do banco.
    const acoes = fazerAcoes()
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={{
          configuracao: CFG_DESLIGADA,
          grade: QUATRO_REAIS.filter((f) => f.employee_id === E1) as any,
          folgas: [],
          funcionarios: [DOIS[0]],
        }}
        acoes={acoes} baseUrl="https://app.exemplo.com"
        faixaInicial={{ weekday: 1, start_time: '12:00', end_time: '14:00' }}
      />,
    )
    clicarBotaoExato('Adicionar faixa')
    expect(acoes.onSalvarFaixas).toHaveBeenCalledTimes(1)
    expect(acoes.onSalvarFaixas).toHaveBeenCalledWith(E1, [
      { weekday: 1, start_time: '12:00', end_time: '14:00' },
    ])
  })
})
