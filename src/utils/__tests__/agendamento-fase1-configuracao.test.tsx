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
 *   (2) `onSalvarFaixa` NÃO foi chamada.
 *
 * E há o espelho obrigatório: um caso que GRAVA. Sem ele, "nunca chama `onSalvarFaixa`" ficaria
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
  faixaRecusada,
  resolverTabelaDeServico,
  validarFaixa,
} from '@/utils/agendamento-config'
import { BYTES_DO_TOKEN, gerarTokenDeAgendamento } from '@/utils/agendamento-token'
import {
  AVISO_LINK_AINDA_NAO_FUNCIONA,
  PainelDeAgendamento,
  montarLinkPublico,
  type AcoesDoPainel,
  type ConfiguracaoDoAgendamento,
  type DadosDoAgendamento,
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
    onSalvarFaixa: jest.fn(),
    onRemoverFaixa: jest.fn(),
    onSalvarFolga: jest.fn(),
    onRemoverFolga: jest.fn(),
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
    expect(acoes.onSalvarFaixa).not.toHaveBeenCalled()
    expect(textoDaTela()).toContain('se sobrepõe a 09:00–12:00')
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

    expect(acoes.onSalvarFaixa).toHaveBeenCalledTimes(1)
    expect(acoes.onSalvarFaixa).toHaveBeenCalledWith({
      employee_id: 'e1', weekday: 1, start_time: '12:00', end_time: '18:00',
    })
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
    expect(acoes.onSalvarFaixa).toHaveBeenCalledTimes(1)
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
    expect(acoes.onSalvarFaixa).toHaveBeenCalledTimes(1)
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
    clicarBotao('Adicionar faixa')
    expect(textoDaTela()).toContain('hora de término tem de ser depois')
    expect(acoes.onSalvarFaixa).not.toHaveBeenCalled()
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
    expect(acoes.onSalvarFaixa).not.toHaveBeenCalled()
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
    expect(textoDaTela()).toContain('Agendamento DESLIGADO')
    expect(textoDaTela()).not.toContain('Agendamento LIGADO')

    desmontar()
    document.body.innerHTML = ''

    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosBase({ configuracao: { ...CFG_DESLIGADA, is_enabled: true } })}
        acoes={fazerAcoes()} baseUrl="https://app.exemplo.com"
      />,
    )
    expect(textoDaTela()).toContain('Agendamento LIGADO')
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
describe('§5 — EXPOSIÇÃO ZERO: nada de rota pública nesta fase', () => {
  // A trava central do comando, e o único portão que a alcança: nenhum caso de comportamento
  // ficaria vermelho se alguém acrescentasse `pages/agendar/[token].tsx` amanhã.
  it('não existe página `/agendar`', () => {
    expect(fs.existsSync(path.join(RAIZ, 'src/pages/agendar'))).toBe(false)
    expect(fs.existsSync(path.join(RAIZ, 'src/pages/agendar.tsx'))).toBe(false)
  })

  it('não existe rota em `/api/public`', () => {
    expect(fs.existsSync(path.join(RAIZ, 'src/pages/api/public'))).toBe(false)
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
