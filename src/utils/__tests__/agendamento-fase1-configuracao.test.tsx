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
 *   (2) `onMontarGrade` NÃO foi chamada.
 *
 * E há o espelho obrigatório: um caso que GRAVA. Sem ele, "nunca chama `onMontarGrade`" ficaria
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
  DIAS_DA_SEMANA,
  avisoDaCopiaDaGrade,
  avisoDoAdicionar,
  avisoDoSubstituir,
  confirmacaoDaReplica,
  confirmacaoDoSubstituir,
  listaEmPortugues,
  mensagemDeNadaAGravar,
  mensagemDoAdicionar,
  mensagemDoSubstituir,
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
    // >>> ELA DEVOLVE `true` POR PADRÃO, E ISSO IMPORTA <<<
    // `onMontarGrade` é `Promise<boolean>`: o painel só emite a mensagem de sucesso quando o
    // retorno é `true`. Um `jest.fn()` nu devolveria `undefined`, que é falso, e TODOS os casos
    // que afirmam a mensagem final ficariam vermelhos por causa do dublê, não do componente.
    // O caso que afirma o contrário passa `false` explicitamente.
    onMontarGrade: jest.fn().mockResolvedValue(true),
    onRemoverFaixa: jest.fn(),
    // Devolve `true` por padrão, pela mesma razão de `onMontarGrade`: ela é `Promise<boolean>`,
    // e um `jest.fn()` nu devolveria `undefined`, fechando o modal nunca e derrubando todos os
    // casos de sucesso por causa do dublê. O caso da falha passa `false` explicitamente.
    onSalvarFolga: jest.fn().mockResolvedValue(true),
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

/**
 * Deixa as microtarefas rodarem DENTRO de `act`.
 *
 * >>> `await Promise.resolve()` SOZINHO NÃO BASTA, E ISSO FOI MEDIDO <<<
 *
 * O handler da montagem é `async`: ele espera `onMontarGrade` e só então emite a mensagem. A
 * primeira versão dos dois casos da mensagem final usava `await Promise.resolve()` solto e
 * ficou vermelha — o `setState` do toast acontecia fora de `act`, e a árvore não era
 * recomposta antes da asserção. O `act` assíncrono é o que falta.
 */
async function deixarAssentar() {
  await act(async () => { await Promise.resolve() })
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
  it('Grade → Ajustes → Link, nesta ordem no DOM — TRÊS seções, não quatro', () => {
    // >>> ERAM QUATRO ATÉ 08/10/2026 <<<
    // A segunda era "Férias, folgas e feriados", e ela DESCEU para dentro da célula de cada
    // profissional. A asserção da ordem acompanhou, e a da ausência dela é o caso seguinte —
    // afirmar a ordem das três restantes não afirma que a quarta saiu.
    renderCinco()
    const txt = textoDaTela()
    const pos = (t: string) => {
      const i = txt.indexOf(t)
      expect(i).toBeGreaterThan(-1) // rótulo ausente faria as comparações abaixo passar com -1
      return i
    }
    const grade = pos('Grade de atendimento')
    const ajustes = pos('Ajustes')
    const link = pos('Link de agendamento')

    expect(grade).toBeLessThan(ajustes)
    expect(ajustes).toBeLessThan(link)
    // O que a reorganização consertou, dito como asserção: o link deixou de vir primeiro.
    expect(grade).toBeLessThan(link)
  })

  it('a SEÇÃO SOLTA de férias não existe mais — nem o título, nem o Select', () => {
    // >>> A AUSÊNCIA É ASSERÇÃO PRÓPRIA <<<
    // Mover o bloco e ESQUECER de remover a seção deixaria as duas na tela, com a de cima
    // mostrando as ausências de todos misturadas e um `Select` para escolher o dono — que é
    // exatamente o que esta rodada desfaz. Nada falharia.
    renderCinco()
    expect(textoDaTela()).not.toContain('Férias, folgas e feriados')
    expect(document.body.querySelector('[aria-label="Profissional da ausência"]')).toBeNull()
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
// >>> O BLOCO DE UI DA RÉPLICA SAIU DAQUI EM 08/10/2026, SEGUNDA RODADA <<<
//
// Eram nove casos que abriam o modal de "Replicar a grade de <Nome>" e afirmavam origem,
// destinos, "Todos" e a confirmação. O botão e o modal não existem mais: o redesenho do dono
// do produto deixou UM compositor no cabeçalho como única forma de montar grade.
//
// O que FICA, abaixo, é o que continua existindo: `aplicar-grade.ts` não foi tocado, a rota de
// API dele continua lá, e os dois blocos seguintes afirmam os dois. Eles estão ÓRFÃOS do lado
// da tela — nada no painel chama `onAplicarGrade` hoje —, e apagá-los é decisão do dono do
// produto, não desta rodada.
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

  /**
   * O painel com o MODAL de ausência já aberto na célula de `e1`.
   *
   * >>> A SEMENTE MUDOU DE NOME E GANHOU `abertoPara` EM 08/10/2026 <<<
   * Era `folgaInicial`, que semeava os dois `DatePicker` da seção solta. Com o modal por
   * célula, semear as datas não basta: é preciso dizer de QUEM é o modal, ou ele nasce
   * fechado e não há campo nenhum no DOM para ler.
   */
  function renderComDatas() {
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosCinco()} acoes={fazerAcoes()} baseUrl="https://app.exemplo.com"
        ausenciaInicial={{ abertoPara: 'e1', starts_at: DIA_CONHECIDO, ends_at: OUTRO_DIA }}
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

  it('a LISTA de ausências DA CÉLULA também é DD/MM/YYYY, e sem hora (dia inteiro)', () => {
    // A lista mudou de lugar — era a da seção solta, agora é a da célula de `e1` — e o formato
    // é o mesmo. O caso continua afirmando o formato, não o lugar: o lugar tem caso próprio.
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

  it('(4c) o estado do COMPOSITOR não interfere na leitura do que veio do banco', () => {
    // >>> A PROVA DE QUE AS DUAS COISAS NÃO SE TOCAM <<<
    // O estado do compositor (`montProfs`, `montDias`, as faixas digitadas) é do FORMULÁRIO.
    // As faixas gravadas chegam por `dados.grade` e são agrupadas em `faixasPorEmp`. Nenhuma
    // linha do banco passa pelo estado do formulário, e é por isso que a grade continua sendo
    // exibida com o compositor vazio.
    //
    // As caixas de dia mudaram de lugar em 08/10/2026, segunda rodada: eram sete POR CÉLULA,
    // com `aria-label` "Segunda — Barbeiro A"; hoje são sete no CABEÇALHO, uma vez só, com
    // `aria-label` "Dia Segunda". A asserção acompanhou.
    renderReais()
    // as quatro continuam na tela…
    expect(textoDaTela()).toContain('09:00–12:00')
    // …e nenhuma caixa do compositor nasce marcada por causa delas
    for (const d of DIAS_DA_SEMANA) {
      const cx = document.body.querySelector(
        `[aria-label="Dia ${d.label}"]`,
      ) as HTMLInputElement
      expect(cx).toBeTruthy()
      expect(cx.checked).toBe(false)
    }
    // nem profissional nenhum
    for (const f of DOIS) {
      const cx = document.body.querySelector(
        `[aria-label="Montar para ${f.name}"]`,
      ) as HTMLInputElement
      expect(cx).toBeTruthy()
      expect(cx.checked).toBe(false)
    }
  })

  it('(4c) com a grade REAL do banco, SUBSTITUIR limpa o dia inteiro', () => {
    // UM funcionário só neste caso, de propósito: com dois, "Todos" e o individual dariam o
    // mesmo resultado e o caso não distinguiria nada.
    //
    // A asserção mudou de forma em 08/10/2026, segunda rodada: o compositor saiu da célula e
    // subiu para o cabeçalho, então a semente é `montagemInicial` e não `faixaInicial`, e a
    // ação é `onMontarGrade` com as linhas JÁ carregando `employee_id`.
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
        montagemInicial={{
          profissionais: [E1],
          dias: [1],
          faixas: [{ inicio: '10:00', fim: '11:00' }],
        }}
      />,
    )
    // A segunda já tem faixa, então o primeiro clique só abre a confirmação.
    clicarPorAriaLabel('Substituir a grade')
    expect(acoes.onMontarGrade).not.toHaveBeenCalled()
    clicarPorAriaLabel('Confirmar a substituição')
    expect(acoes.onMontarGrade).toHaveBeenCalledTimes(1)

    const [novas, ids] = (acoes.onMontarGrade as jest.Mock).mock.calls[0]
    expect(novas).toEqual([
      { employee_id: E1, weekday: 1, start_time: '10:00', end_time: '11:00' },
    ])
    // As DUAS faixas reais da segunda saem — é o dia inteiro, não só a que se sobrepõe.
    expect([...ids].sort()).toEqual(
      QUATRO_REAIS.filter((f) => f.employee_id === E1 && f.weekday === 1).map((f) => f.id).sort(),
    )
  })

  it('(4c) o DIA SEM FAIXA da grade real não remove nada, e não pede confirmação', () => {
    // O espelho obrigatório. Sem ele, "apaga o dia" ficaria verde num painel que apagasse a
    // semana toda — e "pede confirmação" ficaria verde num painel que pedisse sempre.
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
        montagemInicial={{
          profissionais: [E1],
          dias: [3],
          faixas: [{ inicio: '12:00', fim: '14:00' }],
        }}
      />,
    )
    // As duas faixas reais de E1 estão na SEGUNDA. A quarta está vazia: nada a apagar, então o
    // clique grava direto, sem modal.
    clicarPorAriaLabel('Substituir a grade')
    expect(acoes.onMontarGrade).toHaveBeenCalledTimes(1)
    expect(acoes.onMontarGrade).toHaveBeenCalledWith(
      [{ employee_id: E1, weekday: 3, start_time: '12:00', end_time: '14:00' }], [],
    )
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// O COMPOSITOR DO CABEÇALHO — redesenho do PO de 08/10/2026, segunda rodada
//
// >>> O QUE SAIU, E POR QUE A AUSÊNCIA É AFIRMADA <<<
//
// O compositor por célula e o botão "Replicar a grade de <Nome>" foram removidos. Afirmar que
// o bloco novo EXISTE não prova que os antigos saíram — e deixar os três na tela seria três
// formas de montar grade, que é o oposto do pedido. A ausência é asserção própria.
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('o compositor é ÚNICO: o do cabeçalho, e só ele', () => {
  it('o bloco "Montar grade" está na tela, com as três linhas', () => {
    renderCinco()
    const txt = textoDaTela()
    expect(txt).toContain('Montar grade')
    expect(txt).toContain('Profissionais:')
    expect(txt).toContain('Dias:')
    expect(txt).toContain('Faixa 1:')
  })

  it('há UMA caixa por dia, não uma por dia POR funcionário', () => {
    // Cinco profissionais × sete dias dariam 35 caixas no desenho antigo. Sete, no novo.
    renderCinco()
    const caixasDeDia = document.body.querySelectorAll('[aria-label^="Dia "]')
    expect(caixasDeDia).toHaveLength(7)
    // E os rótulos antigos, por célula, não existem mais.
    expect(document.body.querySelector('[aria-label="Segunda — Barbeiro Um"]')).toBeNull()
  })

  it('NÃO existe botão "Replicar a grade de ..." em célula nenhuma', () => {
    renderCinco()
    const botoes = Array.from(document.body.querySelectorAll('button'))
      .map((b) => (b.textContent || '').trim())
    expect(botoes.some((t) => t.startsWith('Replicar a grade de'))).toBe(false)
  })

  it('NÃO existem mais os rótulos do compositor por célula', () => {
    // "+ Adicionar faixa" e "Substituir faixa" eram os dois rótulos do botão da célula.
    renderCinco()
    const botoes = Array.from(document.body.querySelectorAll('button'))
      .map((b) => (b.textContent || '').trim())
    expect(botoes).not.toContain('+ Adicionar faixa')
    expect(botoes).not.toContain('Substituir faixa')
    expect(document.body.querySelector('[aria-label="Início da faixa — Barbeiro Um"]')).toBeNull()
  })

  it('a célula CONTINUA com nome, switch, tabela, aviso e a lista com lixeira', () => {
    // O que a célula perde é o compositor; o resto fica, e é o que permite manutenção
    // individual: marcar só aquele profissional no cabeçalho, e remover faixa pela lixeira.
    renderCinco()
    const txt = textoDaTela()
    expect(txt).toContain('Barbeiro Um')
    expect(document.body.querySelector('[aria-label="Aceita agendamento pelo link — Barbeiro Um"]')).toBeTruthy()
    expect(txt).toContain('Tabela de serviço:')
    expect(document.body.querySelector('[aria-label="Remover faixa f1"]')).toBeTruthy()
    // a lista de dias da célula continua lá
    expect(txt).toContain('Domingo')
    expect(txt).toContain('Sábado')
  })

  it('o compositor vem ANTES das células no DOM — ação antes do resultado', () => {
    renderCinco()
    const todos = Array.from(document.body.querySelectorAll('*'))
    const iCompositor = todos.findIndex((el) => el.matches('[aria-label="Dia Segunda"]'))
    const iCelula = todos.findIndex((el) => el.matches('[aria-label="Remover faixa f1"]'))
    expect(iCompositor).toBeGreaterThanOrEqual(0)
    expect(iCelula).toBeGreaterThan(0)
    expect(iCompositor).toBeLessThan(iCelula)
  })
})

describe('"Todos" os profissionais — marca, desmarca e fica indeterminado', () => {
  function caixaTodos() {
    return document.body.querySelector('[aria-label="Todos os profissionais"]') as HTMLInputElement
  }

  it('marcar "Todos" grava para os CINCO', () => {
    const acoes = fazerAcoes()
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosCinco()} acoes={acoes} baseUrl="https://app.exemplo.com"
        montagemInicial={{ dias: [6], faixas: [{ inicio: '09:00', fim: '18:00' }] }}
      />,
    )
    clicarPorAriaLabel('Todos os profissionais')
    // SÁBADO de propósito: nenhum dos cinco tem faixa nele na fixture, então não há modal e o
    // clique grava direto — o caso mede o PRODUTO, não a confirmação.
    clicarPorAriaLabel('Substituir a grade')

    const [novas] = (acoes.onMontarGrade as jest.Mock).mock.calls[0]
    expect(novas).toHaveLength(5)
    expect(novas.map((n: any) => n.employee_id).sort()).toEqual(['e1', 'e2', 'e3', 'e4', 'e5'])
  })

  it('desmarcar "Todos" volta a zero, e aí a recusa é do PROFISSIONAL', () => {
    // O espelho: sem ele, um "Todos" que ignorasse o desmarcar ficaria verde no caso acima.
    const acoes = fazerAcoes()
    renderCinco({}, acoes)
    clicarPorAriaLabel('Todos os profissionais')
    clicarPorAriaLabel('Todos os profissionais')
    clicarPorAriaLabel('Substituir a grade')
    expect(acoes.onMontarGrade).not.toHaveBeenCalled()
    expect(textoDaTela()).toContain('Selecione ao menos um profissional.')
  })

  it('seleção PARCIAL deixa "Todos" indeterminado — não marcado, nem desmarcado', () => {
    // Um "Todos" que ficasse marcado com dois de cinco afirmaria que os cinco estão dentro.
    renderCinco()
    clicarPorAriaLabel('Montar para Barbeiro Um')
    expect(caixaTodos().checked).toBe(false)
    expect(caixaTodos().indeterminate).toBe(true)
  })

  it('com os cinco marcados um a um, "Todos" fica MARCADO e não indeterminado', () => {
    renderCinco()
    for (const n of ['Um', 'Dois', 'Três', 'Quatro', 'Cinco']) {
      clicarPorAriaLabel(`Montar para Barbeiro ${n}`)
    }
    expect(caixaTodos().checked).toBe(true)
    expect(caixaTodos().indeterminate).toBe(false)
  })

  it('zero marcados: "Todos" desmarcado e NÃO indeterminado', () => {
    renderCinco()
    expect(caixaTodos().checked).toBe(false)
    expect(caixaTodos().indeterminate).toBe(false)
  })
})

describe('a SEGUNDA faixa — o intervalo de almoço num gesto só', () => {
  it('nasce com UMA faixa, e o botão perdeu o "segunda" do rótulo', () => {
    // O rótulo mudou em 08/10/2026, terceira rodada: o botão não acrescenta uma faixa
    // ESPECÍFICA, acrescenta a próxima. "segunda" no texto fecharia a porta da terceira na
    // própria redação.
    renderCinco()
    expect(textoDaTela()).toContain('Faixa 1:')
    expect(textoDaTela()).not.toContain('Faixa 2:')
    expect(document.body.querySelector('[aria-label="Início da faixa 2"]')).toBeNull()
    expect(textoDaTela()).toContain('+ adicionar faixa')
    expect(textoDaTela()).not.toContain('+ adicionar segunda faixa')
  })

  it('o botão REVELA a Faixa 2, e os dois campos aparecem', () => {
    renderCinco()
    clicarPorAriaLabel('Acrescentar faixa')
    expect(textoDaTela()).toContain('Faixa 2:')
    expect(document.body.querySelector('[aria-label="Início da faixa 2"]')).toBeTruthy()
    expect(document.body.querySelector('[aria-label="Fim da faixa 2"]')).toBeTruthy()
  })

  it('revelada, as DUAS faixas são gravadas no mesmo clique — 1 prof × 1 dia = 2 linhas', () => {
    // >>> O CASO QUE A RODADA EXISTE PARA PERMITIR <<<
    // Até 07/10 não havia como montar 09:00–12:00 e 14:00–18:00 na mesma segunda: gravar a
    // tarde apagava a manhã, porque "substituir" era a única ação e o compositor tinha uma
    // faixa só.
    const acoes = fazerAcoes()
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosCinco()} acoes={acoes} baseUrl="https://app.exemplo.com"
        montagemInicial={{
          profissionais: ['e4'], // e4 não tem grade: nada a apagar, nada de modal
          dias: [1],
          faixas: [{ inicio: '09:00', fim: '12:00' }, { inicio: '14:00', fim: '18:00' }],
        }}
      />,
    )
    clicarPorAriaLabel('Substituir a grade')
    expect(acoes.onMontarGrade).toHaveBeenCalledWith([
      { employee_id: 'e4', weekday: 1, start_time: '09:00', end_time: '12:00' },
      { employee_id: 'e4', weekday: 1, start_time: '14:00', end_time: '18:00' },
    ], [])
  })

  it('ESCONDIDA, só a Faixa 1 é gravada — o espelho que prova que a lista é a 3ª dimensão', () => {
    const acoes = fazerAcoes()
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosCinco()} acoes={acoes} baseUrl="https://app.exemplo.com"
        montagemInicial={{
          profissionais: ['e4'],
          dias: [1],
          faixas: [{ inicio: '09:00', fim: '12:00' }],
        }}
      />,
    )
    clicarPorAriaLabel('Substituir a grade')
    const [novas] = (acoes.onMontarGrade as jest.Mock).mock.calls[0]
    expect(novas).toHaveLength(1)
    expect(novas[0].start_time).toBe('09:00')
  })

  it('"remover" esconde a Faixa 2 de volta, e ela deixa de ser gravada', () => {
    const acoes = fazerAcoes()
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosCinco()} acoes={acoes} baseUrl="https://app.exemplo.com"
        montagemInicial={{
          profissionais: ['e4'], dias: [1],
          faixas: [{ inicio: '09:00', fim: '12:00' }, { inicio: '14:00', fim: '18:00' }],
        }}
      />,
    )
    clicarPorAriaLabel('Remover a faixa 2')
    expect(textoDaTela()).not.toContain('Faixa 2:')
    clicarPorAriaLabel('Substituir a grade')
    const [novas] = (acoes.onMontarGrade as jest.Mock).mock.calls[0]
    expect(novas).toHaveLength(1)
  })

  it('as duas faixas SOBREPOSTAS entre si recusam, e nada é gravado', () => {
    const acoes = fazerAcoes()
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosCinco()} acoes={acoes} baseUrl="https://app.exemplo.com"
        montagemInicial={{
          profissionais: ['e4'], dias: [1],
          faixas: [{ inicio: '09:00', fim: '13:00' }, { inicio: '12:00', fim: '18:00' }],
        }}
      />,
    )
    clicarPorAriaLabel('Substituir a grade')
    // O EFEITO primeiro: a recusa impede a gravação, não só mostra texto.
    expect(acoes.onMontarGrade).not.toHaveBeenCalled()
    // A mensagem passou a NOMEAR o par em 08/10/2026, terceira rodada: com cinco faixas na
    // tela, "as duas faixas" não diz quais e obriga a conferir dez pares à mão.
    expect(textoDaTela()).toContain('As faixas 1 e 2 se sobrepõem. Ajuste os horários.')
  })
})

describe('SUBSTITUIR — a ação de montagem', () => {
  function painel(acoes: ReturnType<typeof fazerAcoes>, mont: any) {
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosCinco()} acoes={acoes} baseUrl="https://app.exemplo.com"
        montagemInicial={mont}
      />,
    )
    return acoes
  }

  it('com faixa a apagar: o primeiro clique NÃO grava, abre a confirmação', () => {
    // >>> O EFEITO PRIMEIRO <<<
    // Afirmar que o modal apareceu não afirma que a gravação não aconteceu. A ordem das duas
    // linhas é a regra: desfazer a confirmação mata ESTA primeira.
    const acoes = painel(fazerAcoes(), { profissionais: ['e1'], dias: [1] })
    clicarPorAriaLabel('Substituir a grade')
    expect(acoes.onMontarGrade).not.toHaveBeenCalled()
    expect(document.body.querySelector('.ant-modal')).toBeTruthy()
  })

  it('a confirmação NOMEIA profissionais e dias — nunca "os selecionados"', () => {
    painel(fazerAcoes(), { profissionais: ['e1', 'e3'], dias: [1, 3] })
    clicarPorAriaLabel('Substituir a grade')
    const txt = textoDaTela()
    // e1 tem faixa na SEGUNDA; e3 tem na QUARTA. Os dois pares entram, e só eles.
    expect(txt).toContain(
      'As faixas atuais de Barbeiro Um e Barbeiro Três em Segunda e Quarta serão apagadas e substituídas.',
    )
    expect(txt).not.toContain('os selecionados')
  })

  it('CONFIRMAR grava, com as linhas e os ids', () => {
    const acoes = painel(fazerAcoes(), {
      profissionais: ['e1'], dias: [1], faixas: [{ inicio: '10:00', fim: '16:00' }],
    })
    clicarPorAriaLabel('Substituir a grade')
    clicarPorAriaLabel('Confirmar a substituição')

    expect(acoes.onMontarGrade).toHaveBeenCalledTimes(1)
    const [novas, ids] = (acoes.onMontarGrade as jest.Mock).mock.calls[0]
    expect(novas).toEqual([
      { employee_id: 'e1', weekday: 1, start_time: '10:00', end_time: '16:00' },
    ])
    // e1 tem f1 e f2, as duas na segunda: as DUAS saem.
    expect([...ids].sort()).toEqual(['f1', 'f2'])
  })

  it('CANCELAR a confirmação não grava nada', () => {
    const acoes = painel(fazerAcoes(), { profissionais: ['e1'], dias: [1] })
    clicarPorAriaLabel('Substituir a grade')
    clicarPorAriaLabel('Cancelar a substituição')
    expect(acoes.onMontarGrade).not.toHaveBeenCalled()
  })

  it('SEM faixa a apagar: grava no primeiro clique, e NÃO há modal', () => {
    // O espelho. Sem ele, "pede confirmação" ficaria verde num painel que pedisse SEMPRE — e
    // confirmação em todo caso ensina a clicar sem ler.
    const acoes = painel(fazerAcoes(), { profissionais: ['e4'], dias: [1] })
    clicarPorAriaLabel('Substituir a grade')
    expect(acoes.onMontarGrade).toHaveBeenCalledTimes(1)
    expect(document.body.querySelector('.ant-modal')).toBeNull()
  })

  it('profissional NÃO marcado não é tocado — e4 marcado não apaga a grade de e1', () => {
    const acoes = painel(fazerAcoes(), { profissionais: ['e4'], dias: [1] })
    clicarPorAriaLabel('Substituir a grade')
    const [novas, ids] = (acoes.onMontarGrade as jest.Mock).mock.calls[0]
    expect(ids).toEqual([])
    expect(novas.map((n: any) => n.employee_id)).toEqual(['e4'])
  })

  it('dia NÃO marcado não é tocado — terça marcada não apaga a segunda de e1', () => {
    // A outra proteção, e ela é independente: e1 ESTÁ marcado. Um filtro só por profissional
    // passaria no caso acima e falharia aqui.
    const acoes = painel(fazerAcoes(), { profissionais: ['e1'], dias: [2] })
    clicarPorAriaLabel('Substituir a grade')
    const [, ids] = (acoes.onMontarGrade as jest.Mock).mock.calls[0]
    expect(ids).toEqual([])
  })

  it('a mensagem final conta profissionais e dias', async () => {
    const acoes = painel(fazerAcoes(), { profissionais: ['e4', 'e5'], dias: [1, 2, 3, 4, 5] })
    clicarPorAriaLabel('Substituir a grade')
    await deixarAssentar()
    expect(textoDaTela()).toContain('Grade aplicada em 2 profissionais, 5 dias.')
  })

  it('gravação que FALHA não mostra a mensagem de sucesso', async () => {
    // >>> CORREÇÃO DE UM DEFEITO MEU DA RODADA ANTERIOR <<<
    // `onSalvarFaixas` era `void` e o painel emitia sucesso logo depois de chamá-la: o toast
    // saía mesmo com a gravação falhando. Com `Promise<boolean>`, não sai. Este caso é o que
    // impede a volta — ele fica vermelho no instante em que alguém tirar o `await`.
    const acoes = fazerAcoes()
    ;(acoes.onMontarGrade as jest.Mock).mockResolvedValue(false)
    painel(acoes, { profissionais: ['e4'], dias: [1] })
    clicarPorAriaLabel('Substituir a grade')
    await deixarAssentar()
    expect(acoes.onMontarGrade).toHaveBeenCalledTimes(1)
    expect(textoDaTela()).not.toContain('Grade aplicada')
  })
})

describe('ADICIONAR — a ação de ajuste', () => {
  function painel(acoes: ReturnType<typeof fazerAcoes>, mont: any) {
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosCinco()} acoes={acoes} baseUrl="https://app.exemplo.com"
        montagemInicial={mont}
      />,
    )
    return acoes
  }

  it('NUNCA pede confirmação, mesmo com faixa existente no dia', () => {
    // >>> A ASSIMETRIA É A REGRA, NÃO UM DESCUIDO <<<
    // `adicionar` não destrói nada, então confirmar não protege de nada — e pedir sempre
    // ensina a clicar sem ler. O par com o caso do substituir é o que afirma a assimetria:
    // um painel que pedisse nos dois passaria lá e falharia aqui.
    const acoes = painel(fazerAcoes(), {
      profissionais: ['e1'], dias: [1], faixas: [{ inicio: '19:00', fim: '20:00' }],
    })
    clicarPorAriaLabel('Adicionar à grade')
    expect(document.body.querySelector('.ant-modal')).toBeNull()
    expect(acoes.onMontarGrade).toHaveBeenCalledTimes(1)
  })

  it('`idsParaRemover` sai VAZIO — nada é apagado', () => {
    const acoes = painel(fazerAcoes(), {
      profissionais: ['e1'], dias: [1], faixas: [{ inicio: '19:00', fim: '20:00' }],
    })
    clicarPorAriaLabel('Adicionar à grade')
    const [novas, ids] = (acoes.onMontarGrade as jest.Mock).mock.calls[0]
    expect(ids).toEqual([])
    expect(novas).toEqual([
      { employee_id: 'e1', weekday: 1, start_time: '19:00', end_time: '20:00' },
    ])
  })

  it('o INTERVALO DE ALMOÇO pelo ajuste: acrescenta a tarde SEM perder a manhã', () => {
    // e1 tem 09:00–12:00 e 13:00–18:00 na segunda (f1 e f2). Entra 12:00–13:00 — o furo entre
    // as duas. Nada é apagado, e a faixa nova entra. É o caso de uso do botão.
    const acoes = painel(fazerAcoes(), {
      profissionais: ['e1'], dias: [1], faixas: [{ inicio: '12:00', fim: '13:00' }],
    })
    clicarPorAriaLabel('Adicionar à grade')
    const [novas, ids] = (acoes.onMontarGrade as jest.Mock).mock.calls[0]
    expect(ids).toEqual([])
    expect(novas).toHaveLength(1)
  })

  it('COLISÃO: a combinação é pulada, as outras entram, e nada é apagado', () => {
    // e1 tem 09:00–12:00 na segunda; e4 não tem nada. Entra 10:00–11:00 nos dois.
    const acoes = painel(fazerAcoes(), {
      profissionais: ['e1', 'e4'], dias: [1], faixas: [{ inicio: '10:00', fim: '11:00' }],
    })
    clicarPorAriaLabel('Adicionar à grade')
    const [novas, ids] = (acoes.onMontarGrade as jest.Mock).mock.calls[0]
    expect(ids).toEqual([])
    expect(novas).toEqual([
      { employee_id: 'e4', weekday: 1, start_time: '10:00', end_time: '11:00' },
    ])
  })

  it('a mensagem final diz quantas foram puladas', async () => {
    const acoes = painel(fazerAcoes(), {
      profissionais: ['e1', 'e4'], dias: [1], faixas: [{ inicio: '10:00', fim: '11:00' }],
    })
    clicarPorAriaLabel('Adicionar à grade')
    await deixarAssentar()
    expect(textoDaTela()).toContain('Faixa adicionada. 1 combinação foi pulada por já existir.')
  })

  it('TODAS colidindo: não grava, e diz que já existe — não finge sucesso', () => {
    // `ausente-vs-falso.md` na mensagem: gravar zero linhas e dizer "faixa adicionada"
    // afirmaria o que não aconteceu. E um erro de validação diria que o usuário digitou algo
    // inválido, e ele não digitou.
    const acoes = painel(fazerAcoes(), {
      profissionais: ['e1'], dias: [1], faixas: [{ inicio: '10:00', fim: '11:00' }],
    })
    clicarPorAriaLabel('Adicionar à grade')
    expect(acoes.onMontarGrade).not.toHaveBeenCalled()
    expect(textoDaTela()).toContain('Nada a adicionar: a combinação informada já existe.')
  })
})

describe('os AVISOS antes do clique — os DOIS modos, em linhas separadas', () => {
  it('a escolha foi exibir OS DOIS, cada um dizendo a que botão pertence', () => {
    // >>> A ESCOLHA, E A RAZÃO DELA <<<
    // O comando deixou entre "o do modo que o mouse/foco indica" e "os dois em linhas
    // separadas". Os DOIS: `hover` não existe no toque e `focus` não existe antes de o usuário
    // tabular, então um aviso que depende deles não aparece no celular — e um aviso que não
    // aparece é `portao-que-nao-alcanca.md` em forma de interface.
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosCinco()} acoes={fazerAcoes()} baseUrl="https://app.exemplo.com"
        montagemInicial={{
          profissionais: ['e1'], dias: [1], faixas: [{ inicio: '10:00', fim: '11:00' }],
        }}
      />,
    )
    const txt = textoDaTela()
    expect(txt).toContain('Substituir: Segunda de Barbeiro Um já tem faixas — será substituída.')
    expect(txt).toContain('Adicionar: Segunda de Barbeiro Um já tem faixa nesse horário — será pulada.')
  })

  it('o aviso do ADICIONAR desaparece quando não há colisão, e o do substituir FICA', () => {
    // O par que prova que as duas linhas são independentes. 19:00–20:00 não colide com nada de
    // e1, mas a segunda dele TEM faixa — então substituir ainda avisa, e adicionar não.
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosCinco()} acoes={fazerAcoes()} baseUrl="https://app.exemplo.com"
        montagemInicial={{
          profissionais: ['e1'], dias: [1], faixas: [{ inicio: '19:00', fim: '20:00' }],
        }}
      />,
    )
    const txt = textoDaTela()
    expect(txt).toContain('Substituir: Segunda de Barbeiro Um já tem faixas')
    expect(txt).not.toContain('Adicionar: ')
  })

  it('sem nada a perder, NENHUM dos dois avisos aparece', () => {
    // `ausente-vs-falso.md`: uma linha dizendo "0 dias serão substituídos" afirmaria algo onde
    // o certo é não dizer nada.
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosCinco()} acoes={fazerAcoes()} baseUrl="https://app.exemplo.com"
        montagemInicial={{ profissionais: ['e4'], dias: [1] }}
      />,
    )
    const txt = textoDaTela()
    expect(txt).not.toContain('Substituir: ')
    expect(txt).not.toContain('Adicionar: ')
  })

  it('o aviso NÃO é modal — ele é linha, e aparece sem nenhum clique', () => {
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosCinco()} acoes={fazerAcoes()} baseUrl="https://app.exemplo.com"
        montagemInicial={{ profissionais: ['e1'], dias: [1] }}
      />,
    )
    expect(document.body.querySelector('.ant-modal')).toBeNull()
    expect(textoDaTela()).toContain('Substituir: Segunda de Barbeiro Um já tem faixas')
  })

  it('dia marcado SEM faixa não entra no aviso, mesmo com vizinho marcado que tem', () => {
    // Segunda e terça marcadas; e1 só tem faixa na segunda. Um aviso derivado de `montDias`
    // em vez dos pares com faixa diria "Segunda e Terça".
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosCinco()} acoes={fazerAcoes()} baseUrl="https://app.exemplo.com"
        montagemInicial={{ profissionais: ['e1'], dias: [1, 2] }}
      />,
    )
    expect(textoDaTela()).toContain('Substituir: Segunda de Barbeiro Um já tem faixas')
    expect(textoDaTela()).not.toContain('Segunda e Terça de Barbeiro Um')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// OS TEXTOS, NA FUNÇÃO PURA — onde o EFEITO é o próprio retorno
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('os textos do compositor, como funções', () => {
  const nome = (id: string) => ({ e1: 'Ana', e2: 'Bruno', e3: 'Carla' } as any)[id] ?? id

  it('`avisoDoSubstituir` com UM par: singular nos dois lugares', () => {
    expect(avisoDoSubstituir([{ employee_id: 'e1', weekday: 1 }], nome))
      .toBe('Segunda de Ana já tem faixas — será substituída.')
  })

  it('`avisoDoSubstituir` com dois dias: plural, e os dias em ORDEM DE SEMANA', () => {
    // Informados fora de ordem de propósito: a frase sai Domingo→Sábado, como a coluna da
    // célula. Uma ordem de chegada faria o aviso sair "Quarta e Segunda".
    expect(avisoDoSubstituir(
      [{ employee_id: 'e1', weekday: 3 }, { employee_id: 'e1', weekday: 1 }], nome,
    )).toBe('Segunda e Quarta de Ana já têm faixas — serão substituídas.')
  })

  it('`avisoDoSubstituir` com dois profissionais: os dois são nomeados, sem repetir', () => {
    expect(avisoDoSubstituir([
      { employee_id: 'e1', weekday: 1 },
      { employee_id: 'e2', weekday: 1 },
    ], nome)).toBe('Segunda de Ana e Bruno já têm faixas — serão substituídas.')
  })

  it('`avisoDoSubstituir` sem par nenhum é `null` — ausência da linha, não texto vazio', () => {
    expect(avisoDoSubstituir([], nome)).toBeNull()
  })

  it('`avisoDoAdicionar` fala de PULAR, não de substituir', () => {
    expect(avisoDoAdicionar([{ employee_id: 'e1', weekday: 1 }], nome))
      .toBe('Segunda de Ana já tem faixa nesse horário — será pulada.')
  })

  it('`avisoDoAdicionar` sem colisão é `null`', () => {
    expect(avisoDoAdicionar([], nome)).toBeNull()
  })

  it('`confirmacaoDoSubstituir` nomeia profissionais E dias', () => {
    expect(confirmacaoDoSubstituir([
      { employee_id: 'e1', weekday: 1 },
      { employee_id: 'e2', weekday: 2 },
      { employee_id: 'e2', weekday: 3 },
    ], nome)).toBe(
      'As faixas atuais de Ana e Bruno em Segunda, Terça e Quarta serão apagadas e substituídas.',
    )
  })

  it('`confirmacaoDoSubstituir` sem par é string vazia — e não uma frase sobre ninguém', () => {
    expect(confirmacaoDoSubstituir([], nome)).toBe('')
  })

  it('`mensagemDoSubstituir` — plural e singular dos dois números', () => {
    expect(mensagemDoSubstituir(2, 5)).toBe('Grade aplicada em 2 profissionais, 5 dias.')
    expect(mensagemDoSubstituir(1, 1)).toBe('Grade aplicada em 1 profissional, 1 dia.')
  })

  it('`mensagemDoAdicionar` — com e sem puladas', () => {
    expect(mensagemDoAdicionar(3, 0)).toBe('Faixas adicionadas.')
    expect(mensagemDoAdicionar(1, 0)).toBe('Faixa adicionada.')
    expect(mensagemDoAdicionar(3, 1)).toBe('Faixas adicionadas. 1 combinação foi pulada por já existir.')
    expect(mensagemDoAdicionar(3, 2)).toBe('Faixas adicionadas. 2 combinações foram puladas por já existir.')
  })

  it('`mensagemDeNadaAGravar` não finge sucesso nem acusa erro de digitação', () => {
    expect(mensagemDeNadaAGravar(1)).toBe('Nada a adicionar: a combinação informada já existe.')
    expect(mensagemDeNadaAGravar(4)).toBe('Nada a adicionar: as 4 combinações informadas já existem.')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// A ORDEM DA GRAVAÇÃO: insert ANTES de delete
//
// >>> O QUE ESTE BLOCO PROVA, E O QUE ELE NÃO PROVA — LEIA ANTES DE CONFIAR NELE <<<
//
// Ele afirma a ORDEM NO TEXTO do handler, não o comportamento em runtime. É asserção
// estrutural, e `teste-que-nao-exercita.md` só a admite quando não há efeito mensurável
// deixado de fora — então é obrigatório dizer por que não há:
//
// `onMontarGrade` é um closure dentro de `src/pages/agenda/index.tsx`, que tem 2.700 linhas e
// fala com o Supabase direto. Para exercitá-lo em runtime seria preciso extraí-lo para um
// módulo com repositório injetável — exatamente o que `aplicar-grade.ts` faz, e exatamente o
// que o dono do produto RECUSOU em 07/10/2026, registrado como está: *"NAO extraia o handler
// para modulo com repositorio injetado. Resposta a sua pergunta: nao agora. Fica como
// pendencia registrada."* A pendência é essa, e este bloco é o que alcança enquanto ela durar.
//
// O que ele PEGA: alguém trocar a ordem para delete-antes-de-insert, remover o `throw` que
// separa os dois, trocar o `.in` por um laço, descartar o erro do delete, perder o filtro de
// tenant, ou voltar a devolver `void` em vez de `boolean`. Todos são edições naquele texto.
// O que ele NÃO PEGA: o Supabase devolver erro sem `error` preenchido, ou o `.eq('tenant_id')`
// filtrar o tenant errado. Isso só um caso com repositório falso alcança — ver a pendência.
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('a ordem da gravação em `agenda/index.tsx`', () => {
  const fonte = fs.readFileSync(path.join(RAIZ, 'src/pages/agenda/index.tsx'), 'utf8')

  /** O corpo de `onMontarGrade`, do nome dele até o handler seguinte. */
  const corpo = (() => {
    const i = fonte.indexOf('onMontarGrade: async (')
    expect(i).toBeGreaterThanOrEqual(0)
    const j = fonte.indexOf('onRemoverFaixa:', i)
    expect(j).toBeGreaterThan(i)
    return fonte.slice(i, j)
  })()

  /** Sem comentários: o que se mede é o PROGRAMA, não a prosa que o explica. */
  const programa = corpo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

  it('o `.insert(` aparece ANTES do `.delete()` — e é essa a ordem compensada', () => {
    const iInsert = programa.indexOf('.insert(')
    const iDelete = programa.indexOf('.delete()')
    expect(iInsert).toBeGreaterThanOrEqual(0)
    expect(iDelete).toBeGreaterThan(0)
    expect(iInsert).toBeLessThan(iDelete)
  })

  it('há um `throw` ENTRE os dois — o insert falho não deixa o delete rodar', () => {
    // Esta é a asserção que importa das sete. Sem o throw no meio, a ordem no texto continua
    // "insert antes de delete" e o dia fica VAZIO quando o insert falha: o delete roda em
    // seguida, contra um dia que não recebeu nada.
    const iInsert = programa.indexOf('.insert(')
    const iDelete = programa.indexOf('.delete()')
    const entre = programa.slice(iInsert, iDelete)
    expect(entre).toMatch(/if\s*\(\s*error\s*\)\s*throw\s+error/)
  })

  it('o delete SÓ roda quando há id — em `adicionar` a lista vem vazia', () => {
    // Sem a guarda, `adicionar` chamaria `.in('id', [])`, que é consulta válida e não apaga
    // nada — mas gasta uma ida ao banco e, pior, torna o caminho dos dois modos idêntico no
    // texto, escondendo que `adicionar` não deve apagar.
    expect(programa).toMatch(/if\s*\(\s*idsParaRemover\s*&&\s*idsParaRemover\.length\s*>\s*0\s*\)/)
  })

  it('o delete é UM, com `.in(`, e NÃO um laço', () => {
    expect(programa).toMatch(/\.delete\(\)\s*\n?\s*\.in\('id',/)
    const depoisDoDelete = programa.slice(programa.indexOf('.delete()'))
    expect(depoisDoDelete).not.toMatch(/for\s*\(|\.forEach\(|\.map\(.*delete/)
  })

  it('o delete também é checado — `erroDoDelete` não é descartado', () => {
    // A classe de `instrumento-que-nao-enxerga.md` e das escritas mudas: um `await` cujo
    // resultado ninguém lê falha em silêncio. Aqui o silêncio deixaria o dia duplicado sem
    // ninguém saber por quê.
    expect(programa).toMatch(/const\s*\{\s*error:\s*erroDoDelete\s*\}\s*=\s*await/)
    expect(programa).toMatch(/if\s*\(\s*erroDoDelete\s*\)\s*throw\s+erroDoDelete/)
  })

  it('o delete filtra por `tenant_id` — isolamento, mesmo com RLS ligado', () => {
    const depoisDoDelete = programa.slice(programa.indexOf('.delete()'))
    expect(depoisDoDelete).toMatch(/\.eq\('tenant_id',\s*tid\)/)
  })

  it('devolve `true` no fim e `false` no catch — é o que a mensagem do painel lê', () => {
    // Sem os dois retornos a função volta a ser `void` na prática, e o painel emitiria o toast
    // de sucesso sobre uma gravação falha. O caso do painel ("gravação que FALHA não mostra a
    // mensagem de sucesso") é a outra metade desta asserção.
    expect(programa).toMatch(/return true/)
    expect(programa).toMatch(/return false/)
    const iCatch = programa.indexOf('catch')
    expect(programa.slice(iCatch)).toMatch(/return false/)
  })

  it('o `catch` NÃO afirma "nada foi salvo" — seria mentira no delete falho', () => {
    // Se o insert passou e o delete falhou, as linhas novas ESTÃO no banco. "Nada foi salvo"
    // mandaria o usuário tentar de novo e duplicar outra vez — `ausente-vs-falso.md` na
    // mensagem: afirmar um estado que não se apurou.
    expect(programa).not.toContain('Nada foi salvo')
    expect(programa).toContain('Confira a grade do profissional antes de tentar de novo.')
  })

  it('`onSalvarFaixas` não existe mais — a ação antiga saiu junto com o compositor da célula', () => {
    // A ausência é asserção própria: deixar as duas ações no arquivo seria dois caminhos de
    // gravação para o mesmo par de operações, e eles divergiriam (`copia-divergente.md`).
    //
    // >>> A ASSERÇÃO MEDE O PROGRAMA, NÃO A PROSA — E ISSO FOI MEDIDO AQUI <<<
    // A primeira versão usava `fonte` cru e ficou vermelha: o nome antigo sobrevive em DOIS
    // comentários, de propósito, porque é lá que está registrado o defeito do `void` que a
    // ação nova corrige. Apagar o registro para o teste passar seria o pior dos dois mundos.
    // É a mesma lição já registrada neste arquivo no caso do `Math.random`.
    const semComentarios = fonte
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '')
    expect(semComentarios).not.toContain('onSalvarFaixas')
    // e o nome continua nos comentários, que é onde o registro mora
    expect(fonte).toContain('onSalvarFaixas')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// N FAIXAS NA TELA — terceira rodada do PO de 08/10/2026
//
// >>> O RÓTULO É A POSIÇÃO, E ESTE BLOCO É O QUE PROVA ISSO <<<
//
// A renumeração não tem código próprio: "Faixa N" é `i + 1`. Um painel que guardasse o número
// junto da faixa passaria nos casos de acrescentar e falharia no de remover do meio — e é por
// isso que o caso de remover do meio existe, e por isso ele afirma os RÓTULOS, não a contagem.
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('N faixas na tela — acrescentar, remover e renumerar', () => {
  /** Quantas linhas de faixa existem, lidas pelo campo de início de cada uma. */
  function quantasLinhas(): number {
    return document.body.querySelectorAll('[aria-label^="Início da faixa "]').length
  }

  /** Os rótulos visíveis, na ordem do DOM. */
  function rotulos(): string[] {
    return Array.from(document.body.querySelectorAll('[aria-label^="Início da faixa "]'))
      .map((el) => el.getAttribute('aria-label') || '')
  }

  it('clicar "+ adicionar faixa" três vezes dá QUATRO linhas', () => {
    renderCinco()
    expect(quantasLinhas()).toBe(1)
    clicarPorAriaLabel('Acrescentar faixa')
    clicarPorAriaLabel('Acrescentar faixa')
    clicarPorAriaLabel('Acrescentar faixa')
    expect(quantasLinhas()).toBe(4)
    expect(rotulos()).toEqual([
      'Início da faixa 1', 'Início da faixa 2', 'Início da faixa 3', 'Início da faixa 4',
    ])
  })

  it('o botão CONTINUA na tela depois do terceiro clique', () => {
    // >>> É O QUE MUDOU DE COMPORTAMENTO <<<
    // Até a segunda rodada ele desaparecia depois de revelar a segunda faixa, e isso fechava a
    // porta da terceira. Afirmar que a quarta linha existe não afirma que o botão sobreviveu —
    // um painel que acrescentasse e então escondesse o botão passaria no caso acima.
    renderCinco()
    clicarPorAriaLabel('Acrescentar faixa')
    clicarPorAriaLabel('Acrescentar faixa')
    clicarPorAriaLabel('Acrescentar faixa')
    const botao = document.body.querySelector('[aria-label="Acrescentar faixa"]')
    expect(botao).toBeTruthy()
    expect(botao!.hasAttribute('disabled')).toBe(false)
    expect(textoDaTela()).toContain('+ adicionar faixa')
  })

  it('remover a Faixa 2 de três deixa DUAS, rotuladas "Faixa 1" e "Faixa 2"', () => {
    // A renumeração: a antiga 3 passa a ser a 2. Afirmar só `toBe(2)` não distinguiria isto de
    // um painel que deixasse "Faixa 1" e "Faixa 3" na tela.
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosCinco()} acoes={fazerAcoes()} baseUrl="https://app.exemplo.com"
        montagemInicial={{
          faixas: [
            { inicio: '09:00', fim: '12:00' },
            { inicio: '14:00', fim: '18:00' },
            { inicio: '19:00', fim: '21:00' },
          ],
        }}
      />,
    )
    expect(quantasLinhas()).toBe(3)
    clicarPorAriaLabel('Remover a faixa 2')
    expect(quantasLinhas()).toBe(2)
    expect(rotulos()).toEqual(['Início da faixa 1', 'Início da faixa 2'])
    expect(textoDaTela()).not.toContain('Faixa 3:')
  })

  it('e a que SOBROU na posição 2 é a antiga TERCEIRA — não a removida', () => {
    // O efeito, não só os rótulos: a 19:00–21:00 passou a ocupar a linha 2. Um painel que
    // renumerasse os rótulos e mantivesse o valor errado passaria no caso acima.
    const acoes = fazerAcoes()
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosCinco()} acoes={acoes} baseUrl="https://app.exemplo.com"
        montagemInicial={{
          profissionais: ['e4'], // sem grade: nada a apagar, nada de modal
          dias: [1],
          faixas: [
            { inicio: '09:00', fim: '12:00' },
            { inicio: '14:00', fim: '18:00' },
            { inicio: '19:00', fim: '21:00' },
          ],
        }}
      />,
    )
    clicarPorAriaLabel('Remover a faixa 2')
    clicarPorAriaLabel('Substituir a grade')
    const [novas] = (acoes.onMontarGrade as jest.Mock).mock.calls[0]
    expect(novas).toEqual([
      { employee_id: 'e4', weekday: 1, start_time: '09:00', end_time: '12:00' },
      { employee_id: 'e4', weekday: 1, start_time: '19:00', end_time: '21:00' },
    ])
  })

  it('a Faixa 1 NÃO tem "remover" — sempre há ao menos uma', () => {
    renderCinco()
    clicarPorAriaLabel('Acrescentar faixa')
    clicarPorAriaLabel('Acrescentar faixa')
    expect(document.body.querySelector('[aria-label="Remover a faixa 1"]')).toBeNull()
    // e as outras DUAS têm — o espelho, que impede "nenhuma tem remover" de passar
    expect(document.body.querySelector('[aria-label="Remover a faixa 2"]')).toBeTruthy()
    expect(document.body.querySelector('[aria-label="Remover a faixa 3"]')).toBeTruthy()
  })

  it('removendo até sobrar uma, a última perde o "remover"', () => {
    // O par do caso acima pelo outro lado: a regra é da POSIÇÃO, não de quem nasceu primeiro.
    renderCinco()
    clicarPorAriaLabel('Acrescentar faixa')
    expect(document.body.querySelector('[aria-label="Remover a faixa 2"]')).toBeTruthy()
    clicarPorAriaLabel('Remover a faixa 2')
    expect(quantasLinhas()).toBe(1)
    expect(document.body.querySelector('[aria-label="Remover a faixa 1"]')).toBeNull()
  })

  it('TRÊS faixas chegam inteiras na gravação — 1 prof × 1 dia = 3 linhas', () => {
    const acoes = fazerAcoes()
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosCinco()} acoes={acoes} baseUrl="https://app.exemplo.com"
        montagemInicial={{
          profissionais: ['e4'],
          dias: [1],
          faixas: [
            { inicio: '09:00', fim: '12:00' },
            { inicio: '14:00', fim: '18:00' },
            { inicio: '19:00', fim: '21:00' },
          ],
        }}
      />,
    )
    clicarPorAriaLabel('Substituir a grade')
    expect(acoes.onMontarGrade).toHaveBeenCalledWith([
      { employee_id: 'e4', weekday: 1, start_time: '09:00', end_time: '12:00' },
      { employee_id: 'e4', weekday: 1, start_time: '14:00', end_time: '18:00' },
      { employee_id: 'e4', weekday: 1, start_time: '19:00', end_time: '21:00' },
    ], [])
  })

  it('a mensagem de sobreposição NOMEIA o par, com três faixas na tela', () => {
    // A 1 e a 3 se sobrepõem; a 2 está limpa no meio. É o par não-vizinho, na tela.
    const acoes = fazerAcoes()
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosCinco()} acoes={acoes} baseUrl="https://app.exemplo.com"
        montagemInicial={{
          profissionais: ['e4'],
          dias: [1],
          faixas: [
            { inicio: '09:00', fim: '18:00' },
            { inicio: '19:00', fim: '20:00' },
            { inicio: '10:00', fim: '11:00' },
          ],
        }}
      />,
    )
    clicarPorAriaLabel('Substituir a grade')
    expect(acoes.onMontarGrade).not.toHaveBeenCalled()
    expect(textoDaTela()).toContain('As faixas 1 e 3 se sobrepõem. Ajuste os horários.')
  })

  it('no LIMITE de 10 o botão fica na tela, DESABILITADO, e diz o motivo', () => {
    // >>> A TRAVA É 10, E É DA TELA <<<
    // O comando deixou a trava opcional e sugeriu 10. O botão não desaparece — o comando diz
    // que ele nunca some, e um botão que some sem dizer por quê deixa o usuário procurando.
    const dez = Array.from({ length: 10 }, (_, i) => ({
      inicio: `${String(i).padStart(2, '0')}:00`,
      fim: `${String(i).padStart(2, '0')}:30`,
    }))
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosCinco()} acoes={fazerAcoes()} baseUrl="https://app.exemplo.com"
        montagemInicial={{ faixas: dez }}
      />,
    )
    expect(quantasLinhas()).toBe(10)
    const botao = document.body.querySelector('[aria-label="Acrescentar faixa"]')
    expect(botao).toBeTruthy()
    expect(botao!.hasAttribute('disabled')).toBe(true)
    expect(textoDaTela()).toContain('Limite de 10 faixas por montagem.')
  })

  it('com NOVE o botão está habilitado — o espelho do limite', () => {
    // Sem ele, "desabilita no limite" ficaria verde num painel que desabilitasse sempre.
    const nove = Array.from({ length: 9 }, (_, i) => ({
      inicio: `${String(i).padStart(2, '0')}:00`,
      fim: `${String(i).padStart(2, '0')}:30`,
    }))
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosCinco()} acoes={fazerAcoes()} baseUrl="https://app.exemplo.com"
        montagemInicial={{ faixas: nove }}
      />,
    )
    const botao = document.body.querySelector('[aria-label="Acrescentar faixa"]')
    expect(botao!.hasAttribute('disabled')).toBe(false)
    expect(textoDaTela()).not.toContain('Limite de 10 faixas')
    clicarPorAriaLabel('Acrescentar faixa')
    expect(quantasLinhas()).toBe(10)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// A AUSÊNCIA DENTRO DA CÉLULA — quarta rodada do PO de 08/10/2026
//
// >>> O CASO MAIS IMPORTANTE DESTE BLOCO É O DO VAZAMENTO ENTRE CÉLULAS <<<
//
// A seção solta listava as ausências de TODOS, com o nome do dono em cada linha. Movida para a
// célula, o filtro passa a ser a única coisa que separa um profissional do outro — e um filtro
// que não filtrasse mostraria as cinco ausências nas cinco células, sem nada falhar.
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('as ausências vivem na célula, e só as daquele profissional', () => {
  const AUS_E1 = {
    id: 'a-e1',
    employee_id: 'e1',
    starts_at: new Date(2026, 9, 9, 0, 0, 0, 0).toISOString(),
    ends_at: new Date(2026, 9, 14, 23, 59, 59, 999).toISOString(),
    reason: 'Férias do Um',
  }
  const AUS_E3 = {
    id: 'a-e3',
    employee_id: 'e3',
    starts_at: new Date(2026, 10, 2, 0, 0, 0, 0).toISOString(),
    ends_at: new Date(2026, 10, 2, 23, 59, 59, 999).toISOString(),
    reason: 'Feriado do Três',
  }

  /**
   * O texto de UMA célula, recortado pelo DOM.
   *
   * >>> RECORTAR POR TEXTO NÃO FUNCIONA, E ISSO FOI MEDIDO <<<
   *
   * A primeira versão procurava o nome e cortava no nome do profissional SEGUINTE. Ficou
   * vermelha com a fatia valendo só `"Barbeiro Um"`, porque o nome reaparece DENTRO da própria
   * célula — "Ocultar grade de Barbeiro Um" — e o corte caía antes do conteúdo.
   *
   * É `instrumento-que-nao-enxerga.md`: o padrão foi escrito a partir da forma que eu imaginava
   * do DOM, e a contagem que ele devolveu era plausível. O `data-emp` da célula é o que torna o
   * recorte exato.
   */
  function textoDaCelula(empId: string): string {
    const el = document.body.querySelector(`[data-emp="${empId}"]`)
    expect(el).toBeTruthy() // id errado faria as comparações passarem sobre string vazia
    return el!.textContent || ''
  }

  function renderComAusencias(acoes = fazerAcoes()) {
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosCinco({ folgas: [AUS_E1, AUS_E3] as any })}
        acoes={acoes} baseUrl="https://app.exemplo.com"
      />,
    )
    return acoes
  }

  it('a de `e1` aparece na célula DELE e NÃO na de `e3`', () => {
    // >>> O CASO DO VAZAMENTO <<<
    // Dois profissionais, uma ausência cada, motivos distintos de propósito: com o filtro
    // quebrado, os dois motivos aparecem nas duas células e as duas metades deste caso caem.
    renderComAusencias()
    expect(textoDaCelula('e1')).toContain('Férias do Um')
    expect(textoDaCelula('e1')).not.toContain('Feriado do Três')
  })

  it('e a de `e3` aparece na dele e NÃO na de `e1`', () => {
    renderComAusencias()
    expect(textoDaCelula('e3')).toContain('Feriado do Três')
    expect(textoDaCelula('e3')).not.toContain('Férias do Um')
  })

  it('o NOME do dono NÃO aparece na LINHA da ausência — a célula já diz de quem é', () => {
    // A seção solta precisava do nome em cada linha porque misturava todos. Aqui ele seria
    // ruído, e repetir o nome em cada linha é o sintoma de uma lista que não foi filtrada.
    //
    // >>> A ASSERÇÃO É NA LINHA, NÃO NA CÉLULA <<<
    // A célula contém o nome, no cabeçalho dela — é o caso de uso. A primeira versão deste
    // caso media a CÉLULA e ficou vermelha por isso; o alvo é a linha, e `data-passada` é o
    // que a identifica.
    renderComAusencias()
    const linhas = Array.from(document.body.querySelectorAll('[data-passada]'))
    expect(linhas.length).toBeGreaterThan(0)
    for (const l of linhas) {
      const t = l.textContent || ''
      expect(t).not.toContain('Barbeiro Um')
      expect(t).not.toContain('Barbeiro Três')
    }
    // e a linha TEM a data e o motivo — senão "não contém o nome" ficaria verde numa linha vazia
    expect(linhas.map((l) => l.textContent || '').join(' ')).toContain('09/10/2026')
    expect(linhas.map((l) => l.textContent || '').join(' ')).toContain('Férias do Um')
  })

  it('quem NÃO tem ausência mostra "Nenhuma ausência registrada."', () => {
    renderComAusencias()
    // `e2` não tem nenhuma na fixture. A célula dele está recolhida (DESLIGADO), então o caso
    // usa `e4`, que está aberto e também não tem.
    expect(textoDaCelula('e4')).toContain('Nenhuma ausência registrada.')
    // e quem TEM não mostra essa frase — o espelho
    expect(textoDaCelula('e1')).not.toContain('Nenhuma ausência registrada.')
  })

  it('a lixeira chama `onRemoverFolga` com o id DAQUELA ausência, e só com ele', () => {
    const acoes = renderComAusencias()
    clicarPorAriaLabel('Remover ausência a-e1')
    // O `Popconfirm` pede confirmação; o clique no "OK" é o que dispara.
    const ok = Array.from(document.body.querySelectorAll('button'))
      .find((b) => (b.textContent || '').trim() === 'OK')
    expect(ok).toBeTruthy()
    act(() => { ok!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(acoes.onRemoverFolga).toHaveBeenCalledWith('a-e1')
    expect((acoes.onRemoverFolga as jest.Mock).mock.calls.map((c: any[]) => c[0])).toEqual(['a-e1'])
  })

  it('o bloco de ausências vem DEPOIS da lista Domingo..Sábado', () => {
    renderComAusencias()
    const todos = Array.from(document.body.querySelectorAll('*'))
    // A faixa `f1` de `e1` só existe na lista de dias; o botão de ausência é o marcador do
    // bloco novo. A posição no DOM é o que o pedido fixa, e não há número a medir.
    const iDias = todos.findIndex((el) => el.matches('[aria-label="Remover faixa f1"]'))
    const iAusencias = todos.findIndex((el) => el.matches('[aria-label="Adicionar ausência de Barbeiro Um"]'))
    expect(iDias).toBeGreaterThan(-1)
    expect(iAusencias).toBeGreaterThan(iDias)
  })
})

describe('a ORDEM e o esmaecimento na célula', () => {
  /** Uma ausência relativa a hoje, para o caso não depender da data em que roda. */
  function aus(id: string, deDias: number, ateDias: number, reason: string) {
    const hoje = new Date()
    const d = (n: number) => new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + n, 12, 0, 0, 0)
    return { id, employee_id: 'e1', starts_at: d(deDias).toISOString(), ends_at: d(ateDias).toISOString(), reason }
  }

  it('a PASSADA aparece depois das futuras, e marcada como passada', () => {
    // >>> A ORDEM É MEDIDA NO DOM, E O ESMAECIMENTO POR ATRIBUTO <<<
    // `opacity` em `style` inline não é legível de forma estável no jsdom, então a célula
    // carrega `data-passada` — que é o MESMO `passada` que `ordenarAusencias` devolveu, não um
    // segundo cálculo da tela.
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosCinco({
          folgas: [
            aus('velha', -30, -25, 'Ja passou'),
            aus('futura', 10, 12, 'Vai acontecer'),
          ] as any,
        })}
        acoes={fazerAcoes()} baseUrl="https://app.exemplo.com"
      />,
    )
    const linhas = Array.from(document.body.querySelectorAll('[data-passada]'))
    expect(linhas).toHaveLength(2)
    // a futura primeiro, a passada depois
    expect(linhas[0].getAttribute('data-passada')).toBe('nao')
    expect(linhas[1].getAttribute('data-passada')).toBe('sim')
    expect(linhas[0].textContent).toContain('Vai acontecer')
    expect(linhas[1].textContent).toContain('Ja passou')
  })

  it('a passada NÃO desaparece — ela continua na lista', () => {
    // Instrução do PO: *"Nao suma com as passadas."* Um filtro em vez de uma ordenação passaria
    // no caso acima sobre uma lista de um elemento, e apagaria o histórico.
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosCinco({ folgas: [aus('velha', -30, -25, 'Ja passou')] as any })}
        acoes={fazerAcoes()} baseUrl="https://app.exemplo.com"
      />,
    )
    expect(textoDaTela()).toContain('Ja passou')
    expect(document.body.querySelectorAll('[data-passada="sim"]')).toHaveLength(1)
  })

  it('a EM CURSO não é passada — ela é a primeira da lista', () => {
    // O caso que distingue `ends_at` de `starts_at` na travessia inteira, da função à tela.
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosCinco({
          folgas: [aus('futura', 5, 6, 'Depois'), aus('agora', -2, 2, 'Fora hoje')] as any,
        })}
        acoes={fazerAcoes()} baseUrl="https://app.exemplo.com"
      />,
    )
    const linhas = Array.from(document.body.querySelectorAll('[data-passada]'))
    expect(linhas[0].getAttribute('data-passada')).toBe('nao')
    expect(linhas[0].textContent).toContain('Fora hoje')
  })
})

describe('o MODAL da ausência — o profissional vem da célula', () => {
  function abrir(nome: string, acoes = fazerAcoes()) {
    renderCinco({}, acoes)
    clicarPorAriaLabel(`Adicionar ausência de ${nome}`)
    return acoes
  }

  it('o botão abre o modal com o NOME do profissional no título', () => {
    abrir('Barbeiro Três')
    expect(document.body.querySelector('.ant-modal')).toBeTruthy()
    expect(textoDaTela()).toContain('Nova ausência — Barbeiro Três')
  })

  it('o modal nasce FECHADO — sem clique, não há campo de ausência no DOM', () => {
    // O espelho. Sem ele, "abre o modal" ficaria verde num painel que o deixasse sempre aberto.
    renderCinco()
    expect(document.body.querySelector('.ant-modal')).toBeNull()
    expect(document.body.querySelector('[aria-label="Início da ausência"]')).toBeNull()
  })

  it('NÃO existe Select de profissional dentro do modal', () => {
    // >>> A PERGUNTA DEIXOU DE SER FEITA <<<
    // Um seletor aqui permitiria cadastrar para um profissional a partir da célula de outro —
    // e aí o título diria um nome e a gravação usaria outro.
    abrir('Barbeiro Três')
    expect(document.body.querySelector('[aria-label="Profissional da ausência"]')).toBeNull()
  })

  it('salvar grava com o `employee_id` DA CÉLULA que abriu', () => {
    // O efeito, não o título: abrir pela célula do TERCEIRO e afirmar `e3`. Um painel que
    // usasse `funcionarios[0]` passaria no caso do título e falharia aqui.
    const acoes = abrir('Barbeiro Três')
    const campo = document.body.querySelector('input[aria-label="Início da ausência"]')
    expect(campo).toBeTruthy()
    // A data entra pela semente, não operando o calendário do antd — ver `ausenciaInicial`.
    desmontar()
    document.body.innerHTML = ''
    const acoes2 = fazerAcoes()
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosCinco()} acoes={acoes2} baseUrl="https://app.exemplo.com"
        ausenciaInicial={{
          abertoPara: 'e3',
          starts_at: new Date(2026, 10, 2, 0, 0, 0, 0).toISOString(),
        }}
      />,
    )
    clicarPorAriaLabel('Salvar a ausência')
    expect(acoes2.onSalvarFolga).toHaveBeenCalledTimes(1)
    const [folga] = (acoes2.onSalvarFolga as jest.Mock).mock.calls[0]
    expect(folga.employee_id).toBe('e3')
    expect(acoes).toBeTruthy()
  })

  it('FIM vazio grava o mesmo dia do início — não é erro', () => {
    const acoes = fazerAcoes()
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosCinco()} acoes={acoes} baseUrl="https://app.exemplo.com"
        ausenciaInicial={{
          abertoPara: 'e4',
          starts_at: new Date(2026, 10, 2, 0, 0, 0, 0).toISOString(),
        }}
      />,
    )
    clicarPorAriaLabel('Salvar a ausência')
    const [folga] = (acoes.onSalvarFolga as jest.Mock).mock.calls[0]
    expect(new Date(folga.starts_at).getDate()).toBe(2)
    expect(new Date(folga.ends_at).getDate()).toBe(2)
    // e o fim é o FIM do dia, senão a ausência de um dia não cobriria nada
    expect(new Date(folga.ends_at).getHours()).toBe(23)
  })

  it('SEM início: o erro aparece DENTRO do modal, e NÃO grava nem fecha', () => {
    // As três coisas, nesta ordem — o efeito primeiro.
    const acoes = fazerAcoes()
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosCinco()} acoes={acoes} baseUrl="https://app.exemplo.com"
        ausenciaInicial={{ abertoPara: 'e4' }}
      />,
    )
    clicarPorAriaLabel('Salvar a ausência')
    expect(acoes.onSalvarFolga).not.toHaveBeenCalled()
    expect(document.body.querySelector('.ant-modal')).toBeTruthy()
    expect(textoDaTela()).toContain('Informe a data de início.')
  })

  it('período SOBREPOSTO ao já registrado: recusa, com a mensagem do período', () => {
    const acoes = fazerAcoes()
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosCinco({
          folgas: [{
            id: 'ja',
            employee_id: 'e4',
            starts_at: new Date(2026, 9, 9, 0, 0, 0, 0).toISOString(),
            ends_at: new Date(2026, 9, 14, 23, 59, 59, 999).toISOString(),
          }] as any,
        })}
        acoes={acoes} baseUrl="https://app.exemplo.com"
        ausenciaInicial={{
          abertoPara: 'e4',
          // 14/10 — TOCA no último dia da existente, e dia tocado é sobreposição
          starts_at: new Date(2026, 9, 14, 0, 0, 0, 0).toISOString(),
          ends_at: new Date(2026, 9, 20, 0, 0, 0, 0).toISOString(),
        }}
      />,
    )
    clicarPorAriaLabel('Salvar a ausência')
    expect(acoes.onSalvarFolga).not.toHaveBeenCalled()
    expect(textoDaTela()).toContain('Já existe uma ausência nesse período.')
  })

  it('a sobreposição é por PROFISSIONAL: a ausência de outro não bloqueia', () => {
    // >>> O ESPELHO DO CASO ACIMA, E É ELE QUE PROVA O FILTRO NA VALIDAÇÃO <<<
    // Mesma data, mas a existente é de `e1` e o modal é de `e4`. Sem o filtro em
    // `salvarAusencia`, `validarAusencia` receberia a de `e1` e recusaria — e o dono do salão
    // não conseguiria marcar férias de dois barbeiros na mesma semana.
    const acoes = fazerAcoes()
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosCinco({
          folgas: [{
            id: 'de-outro',
            employee_id: 'e1',
            starts_at: new Date(2026, 9, 9, 0, 0, 0, 0).toISOString(),
            ends_at: new Date(2026, 9, 14, 23, 59, 59, 999).toISOString(),
          }] as any,
        })}
        acoes={acoes} baseUrl="https://app.exemplo.com"
        ausenciaInicial={{
          abertoPara: 'e4',
          starts_at: new Date(2026, 9, 10, 0, 0, 0, 0).toISOString(),
          ends_at: new Date(2026, 9, 12, 0, 0, 0, 0).toISOString(),
        }}
      />,
    )
    clicarPorAriaLabel('Salvar a ausência')
    expect(acoes.onSalvarFolga).toHaveBeenCalledTimes(1)
    expect(textoDaTela()).not.toContain('Já existe uma ausência nesse período.')
  })

  it('CANCELAR fecha e não grava', () => {
    const acoes = abrir('Barbeiro Três')
    clicarPorAriaLabel('Cancelar a ausência')
    expect(acoes.onSalvarFolga).not.toHaveBeenCalled()
    expect(document.body.querySelector('.ant-modal-wrap')?.getAttribute('style') ?? '')
      .toMatch(/display: none|^$/)
  })

  it('gravação que FALHA não fecha o modal nem anuncia sucesso', () => {
    // >>> É A RAZÃO DE `onSalvarFolga` TER VIRADO `Promise<boolean>` <<<
    // Com `void`, o modal fechava e o toast saía mesmo na falha — e o usuário perdia o que
    // digitou sem saber que perdeu. Este caso fica vermelho no instante em que alguém tirar o
    // `await` ou ignorar o retorno.
    const acoes = fazerAcoes()
    ;(acoes.onSalvarFolga as jest.Mock).mockResolvedValue(false)
    renderizar(
      <PainelDeAgendamento
        open onClose={() => {}} calcType="SERVICE"
        dados={dadosCinco()} acoes={acoes} baseUrl="https://app.exemplo.com"
        ausenciaInicial={{
          abertoPara: 'e4',
          starts_at: new Date(2026, 10, 2, 0, 0, 0, 0).toISOString(),
        }}
      />,
    )
    clicarPorAriaLabel('Salvar a ausência')
    return deixarAssentar().then(() => {
      expect(acoes.onSalvarFolga).toHaveBeenCalledTimes(1)
      expect(textoDaTela()).not.toContain('Ausência registrada.')
      expect(document.body.querySelector('.ant-modal')).toBeTruthy()
    })
  })
})
