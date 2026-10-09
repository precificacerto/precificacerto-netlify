/**
 * AS QUATRO ROTAS DA FASE 2B — o cliente mexendo no próprio agendamento.
 *
 * Comando do PO de 08/10/2026. Regra inviolável, registrada como está:
 *
 *   "Cada prestador de serviço vai ter uma tenant. Nunca pode ter nenhuma integração ou de
 *    informação. Nada. Nunca."
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * >>> O QUE ESTE PORTÃO **NÃO** ALCANÇA — LEIA ANTES DE CONFIAR NO VERDE <<<
 * ══════════════════════════════════════════════════════════════════════════════════════════
 *
 * Exigência do dono do produto, e ele disse que esta frase importa mais que o teste: *"Declare
 * no arquivo, em comentario, exatamente o que ele NAO alcanca: a RLS real e os grants. Essa
 * frase importa mais que o teste - sem ela alguem le verde e conclui que a RLS esta provada."*
 *
 * Então, explicitamente:
 *
 *   1. A **RLS NÃO ESTÁ PROVADA AQUI.** O `supabaseAdmin` é de mentira e o jest não fala com o
 *      Postgres. As políticas da migração `20261008000001` não são exercidas por linha nenhuma
 *      desta suíte — e a migração nem está aplicada.
 *   2. Os **GRANTS não estão provados.** `REVOKE ALL ... FROM anon` é um fato do banco, e o
 *      único jeito de verificá-lo é a consulta a `information_schema.role_table_grants` que a
 *      migração traz no cabeçalho, rodada DEPOIS de aplicar.
 *   3. O que ele alcança é o **FILTRO QUE O CÓDIGO ESCREVE**: `.eq('tenant_id', ...)` com o
 *      tenant saído do token. Nesta superfície isso é o que separa um salão do outro, porque o
 *      `service_role` passa por cima da RLS — então o filtro é a defesa real em runtime, e é
 *      ele que o fake registra quando falta.
 *
 * `portao-que-nao-alcanca.md`: um portão verde prova que AQUELE portão passou. Este prova o
 * filtro, não o banco.
 * ══════════════════════════════════════════════════════════════════════════════════════════
 */

import { hashDoCodigo } from '@/utils/codigo-de-acesso'
// >>> A EXPECTATIVA DE INSTANTE LÊ A MESMA FUNÇÃO QUE A ROTA <<<
// `instanteDoRelogioLocal` resolve `America/Sao_Paulo` (`FUSO_DO_AGENDAMENTO`), e o contêiner do
// CI roda em UTC. A primeira versão destes casos afirmava `getHours() === 15` e leu 18: a rota
// estava certa e a asserção lia o fuso do contêiner. Afirmar contra a própria função é o que
// torna o caso independente do fuso de quem roda — e ela já tem portão próprio, com 23 casos.
import { instanteDoRelogioLocal, horaParaMinutos } from '@/utils/horarios-disponiveis'

/**
 * >>> AS FIXTURES SÃO RELATIVAS AO RELÓGIO REAL, E ISSO É CORRETO AQUI <<<
 *
 * As ROTAS leem `new Date()` — e devem: elas não são funções puras, e injetar o relógio numa
 * rota HTTP significaria aceitar o instante do corpo do pedido, que é o oposto de seguro.
 *
 * A primeira versão desta suíte semeava `expires_at` relativo a um `AGORA` fixo de 08/10/2026
 * ao meio-dia, e TODOS os casos de código válido ficaram vermelhos com 401: o relógio real já
 * tinha passado daquele instante. A premissa era minha, não do código.
 *
 * O portão das funções PURAS (`codigo-de-acesso.test.ts`, `lembrete-whatsapp.test.ts`) continua
 * com relógio fixo — lá o `agora` é injetado de propósito, e tem caso provando a injeção.
 */
const AGORA = new Date()
/** Dois dias à frente do relógio real: futuro em qualquer dia que a suíte rode. */
const FUTURO = new Date(AGORA.getTime() + 2 * 86400_000)

const A = {
  tenant: 'tenant-A', token: 'TOKEN_AAAAAAAAAAAAAAAAAA',
  emp: 'empA', cli: 'cliA', fone: '11988887777', evt: 'evtA',
}
const B = {
  tenant: 'tenant-B', token: 'TOKEN_BBBBBBBBBBBBBBBBBB',
  emp: 'empB', cli: 'cliB', fone: '11977776666', evt: 'evtB',
}
/** Um terceiro cliente DO MESMO tenant A — é ele que prova o filtro por telefone. */
const OUTRO = { cli: 'cliOutro', fone: '11966665555', evt: 'evtOutro' }

const SAL = 'a'.repeat(32)
const CODIGO = '042137'

/** O "banco". Reconstruído a cada caso por `montarBanco`. */
let LINHAS: Record<string, any[]> = {}
/** Consultas que rodaram SEM filtro de tenant. Tem de ficar vazio. */
const semFiltroDeTenant: string[] = []
/** Toda escrita que o fake viu, na ordem — é o que mede a SEQUÊNCIA do remarcar. */
const escritas: { tabela: string; op: 'insert' | 'update'; dados: any; filtros: any }[] = []
/** Toda mensagem que o envio tentou mandar. */
const enviadas: { telefone: string; texto: string }[] = []
/** Se o envio deve falhar, e com qual motivo. */
let envioFalha: null | 'sem_token' = null

function montarBanco() {
  LINHAS = {
    tenant_booking_settings: [
      { tenant_id: A.tenant, public_token: A.token, is_enabled: true, grid_minutes: 30, lead_time_min: 0, horizon_days: 30, msg_confirmacao: null, msg_cancelamento: null, msg_alteracao: null },
      { tenant_id: B.tenant, public_token: B.token, is_enabled: true, grid_minutes: 30, lead_time_min: 0, horizon_days: 30, msg_confirmacao: null, msg_cancelamento: null, msg_alteracao: null },
    ],
    tenants: [{ id: A.tenant, name: 'Salão A' }, { id: B.tenant, name: 'Salão B' }],
    // >>> O BARBEIRO DO A NÃO TEM TELEFONE — É O CASO REAL EM PRODUÇÃO <<<
    // Medido em 08/10/2026: 0 de 5 no Salão Eliane, 1 de 16 no repositório. O do B tem, para
    // que o par exista.
    employees: [
      { id: A.emp, tenant_id: A.tenant, name: 'Barbeiro do A', phone: null, status: 'ACTIVE' },
      { id: B.emp, tenant_id: B.tenant, name: 'Barbeiro do B', phone: '11955554444', status: 'ACTIVE' },
    ],
    // >>> OS NOMES SÃO DISTINTOS E NÃO-VAZIOS DE PROPÓSITO <<<
    // A rodada de 09/10/2026 faz as mensagens de cancelar e remarcar levarem o NOME do cliente.
    // Com nome vazio na fixture, "o nome aparece no texto" ficaria verde sem medir nada, e
    // "a resposta HTTP não tem o nome" também — `teste-que-nao-exercita.md`, variante 2: o caso
    // escolhido não discriminaria. O caso do nome VAZIO zera o campo dentro dele mesmo.
    customers: [
      { id: A.cli, tenant_id: A.tenant, whatsapp_phone: A.fone, name: 'Ana Maria' },
      { id: B.cli, tenant_id: B.tenant, whatsapp_phone: B.fone, name: 'Bruno Alves' },
      { id: OUTRO.cli, tenant_id: A.tenant, whatsapp_phone: OUTRO.fone, name: 'Carla Souza' },
    ],
    calendar_events: [
      { id: A.evt, tenant_id: A.tenant, customer_id: A.cli, employee_id: A.emp, service_id: 'svcA', title: 'Corte', start_time: FUTURO.toISOString(), end_time: new Date(FUTURO.getTime() + 1800000).toISOString(), status: 'CONFIRMED', is_active: true },
      { id: B.evt, tenant_id: B.tenant, customer_id: B.cli, employee_id: B.emp, service_id: 'svcB', title: 'Barba', start_time: FUTURO.toISOString(), end_time: new Date(FUTURO.getTime() + 1800000).toISOString(), status: 'CONFIRMED', is_active: true },
      { id: OUTRO.evt, tenant_id: A.tenant, customer_id: OUTRO.cli, employee_id: A.emp, service_id: 'svcA', title: 'Corte', start_time: new Date(FUTURO.getTime() + 7200000).toISOString(), end_time: new Date(FUTURO.getTime() + 9000000).toISOString(), status: 'CONFIRMED', is_active: true },
    ],
    booking_access_codes: [],
    tenant_settings: [
      { tenant_id: A.tenant, whatsapp_instance_mode: 'OWN', whatsapp_shared_instance_user_id: null },
      { tenant_id: B.tenant, whatsapp_instance_mode: 'OWN', whatsapp_shared_instance_user_id: null },
    ],
    users: [
      { id: 'uA', tenant_id: A.tenant, wuzapi_token: 'tokA' },
      { id: 'uB', tenant_id: B.tenant, wuzapi_token: 'tokB' },
    ],
  }
}

/** Grava um código válido para aquele telefone naquele tenant. */
function semearCodigo(tenant: string, fone: string, over: Record<string, any> = {}) {
  LINHAS.booking_access_codes.push({
    id: `cod-${tenant}-${fone}`,
    tenant_id: tenant,
    phone: fone,
    code_hash: hashDoCodigo(CODIGO, SAL),
    code_salt: SAL,
    expires_at: new Date(AGORA.getTime() + 5 * 60_000).toISOString(),
    attempts: 0,
    used_at: null,
    created_at: AGORA.toISOString(),
    ...over,
  })
}

function fakeFrom(tabela: string) {
  const filtros: Record<string, any> = {}
  const entre: { col: string; op: string; val: any }[] = []
  let dentroDe: { col: string; vals: any[] } | null = null
  const q: any = {
    select: () => q,
    order: () => q,
    limit: () => q,
    not: () => q,
    neq: (col: string, val: any) => { entre.push({ col, op: 'neq', val }); return q },
    gte: (col: string, val: any) => { entre.push({ col, op: 'gte', val }); return q },
    lte: (col: string, val: any) => { entre.push({ col, op: 'lte', val }); return q },
    lt: (col: string, val: any) => { entre.push({ col, op: 'lt', val }); return q },
    gt: (col: string, val: any) => { entre.push({ col, op: 'gt', val }); return q },
    in: (col: string, vals: any[]) => { dentroDe = { col, vals }; return q },
    eq: (col: string, val: any) => { filtros[col] = val; return q },
    then: undefined,
  }

  const conferirIsolamento = () => {
    // >>> A GUARDA QUE FAZ O PORTÃO ALCANÇAR <<<
    // `tenants` é consultada pelo próprio id. Toda OUTRA tabela tem de trazer `tenant_id`, ou a
    // consulta é registrada como vazamento em potencial — e há caso afirmando que a lista
    // ficou vazia depois de exercitar as quatro rotas.
    if (tabela !== 'tenants' && !('tenant_id' in filtros) && !('public_token' in filtros)) {
      semFiltroDeTenant.push(tabela)
    }
  }

  const resolver = () => {
    conferirIsolamento()
    return (LINHAS[tabela] ?? []).filter((r) => {
      for (const [k, v] of Object.entries(filtros)) {
        if (k === 'id' && tabela === 'tenants') { if (r.id !== v) return false; continue }
        if (r[k] !== v) return false
      }
      if (dentroDe && !dentroDe.vals.includes(r[dentroDe.col])) return false
      for (const c of entre) {
        const a = r[c.col]
        if (c.op === 'neq' && a === c.val) return false
        if (c.op === 'gte' && !(String(a) >= String(c.val))) return false
        if (c.op === 'lte' && !(String(a) <= String(c.val))) return false
        if (c.op === 'lt' && !(String(a) < String(c.val))) return false
        if (c.op === 'gt' && !(String(a) > String(c.val))) return false
      }
      return true
    })
  }

  const vazio: { message: string } | null = null
  q.maybeSingle = async () => ({ data: resolver()[0] ?? null, error: vazio })
  q.single = async () => ({ data: resolver()[0] ?? null, error: vazio })
  q.then = (ok: any) => Promise.resolve({ data: resolver(), error: vazio }).then(ok)

  q.insert = (dados: any) => {
    escritas.push({ tabela, op: 'insert', dados, filtros: { ...filtros } })
    const arr = Array.isArray(dados) ? dados : [dados]
    for (const d of arr) (LINHAS[tabela] = LINHAS[tabela] ?? []).push({ id: `novo-${escritas.length}`, ...d })
    const r: any = {
      select: () => r, single: async () => ({ data: arr[0], error: vazio }),
      then: (ok: any) => Promise.resolve({ data: arr, error: vazio }).then(ok),
    }
    return r
  }

  q.update = (dados: any) => {
    const u: any = {
      eq: (col: string, val: any) => { filtros[col] = val; return u },
      then: (ok: any) => {
        escritas.push({ tabela, op: 'update', dados, filtros: { ...filtros } })
        conferirIsolamento()
        for (const r of LINHAS[tabela] ?? []) {
          if (Object.entries(filtros).every(([k, v]) => r[k] === v)) Object.assign(r, dados)
        }
        return Promise.resolve({ data: null, error: vazio }).then(ok)
      },
    }
    return u
  }

  return q
}

jest.mock('@/supabase/admin', () => ({ supabaseAdmin: { from: (t: string) => fakeFrom(t) } }))

// O envio é trocado por um espião: nenhuma chamada sai para o WUZAPI, e o teste consegue
// afirmar PARA QUEM a mensagem foi — que é o requisito da §4.
jest.mock('@/lib/wuzapi-send', () => ({
  sendWuzapiText: async (_tok: string, telefone: string, texto: string) => {
    enviadas.push({ telefone, texto })
    if (envioFalha) return { success: false, error: envioFalha }
    return { success: true }
  },
}))

// A disponibilidade de horário é a do POST agendar, importada pela rota. Aqui ela é trocada por
// uma lista fixa: o que esta suíte mede é a SEQUÊNCIA do remarcar, não o cálculo de horário —
// esse já tem portão próprio em `horarios-disponiveis.test.ts`, com 23 casos.
let horariosDoDia: string[] = ['14:00', '14:30', '15:00']
jest.mock('@/pages/api/public/agenda/[token]/horarios', () => ({
  __esModule: true,
  // O tipo é explícito porque `strictNullChecks: false` faz o `tsc` inferir `any` por recursão
  // aparente e reclamar com `TS7023` — a mesma classe do `TS7018` que já apareceu quatro vezes
  // nesta campanha. O tipo nomeia o que o valor é, e o baseline volta a 363.
  default: async (): Promise<void> => undefined,
  calcularHorarios: async (): Promise<string[]> => horariosDoDia,
}))

jest.mock('@/lib/agendamento-publico', () => {
  const real = jest.requireActual('@/lib/agendamento-publico')
  return {
    ...real,
    // `servicosDoBarbeiro` consulta tabelas que esta suíte não semeia; o que ela mede é outro.
    servicosDoBarbeiro: async () => [{ id: 'svcA', nome: 'Corte', duracaoMin: 30 }],
  }
})

import solicitar from '@/pages/api/public/agenda/[token]/codigo-solicitar'
import validar from '@/pages/api/public/agenda/[token]/codigo-validar'
import cancelar from '@/pages/api/public/agenda/[token]/cancelar'
import remarcar from '@/pages/api/public/agenda/[token]/remarcar'

type Resposta = { status: number; corpo: any }

async function chamar(
  rota: (req: any, res: any) => Promise<any>, token: string, body: any,
): Promise<Resposta> {
  const out: Resposta = { status: 0, corpo: null }
  const res: any = {
    status: (s: number) => { out.status = s; return res },
    json: (c: any) => { out.corpo = c; return res },
  }
  await rota(
    { method: 'POST', query: { token }, body, headers: {}, socket: { remoteAddress: '1.2.3.4' } },
    res,
  )
  return out
}

function evento(id: string) {
  return (LINHAS.calendar_events ?? []).find((e) => e.id === id)
}

beforeEach(() => {
  montarBanco()
  semFiltroDeTenant.length = 0
  escritas.length = 0
  enviadas.length = 0
  envioFalha = null
  horariosDoDia = ['14:00', '14:30', '15:00']
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// REGRA 2 — `codigo/solicitar` responde IDÊNTICO para conhecido e desconhecido
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('REGRA 2 — solicitar não é oráculo de "esse número é cliente daqui"', () => {
  it('telefone CONHECIDO e DESCONHECIDO devolvem exatamente a mesma resposta', async () => {
    // >>> O ITEM 1 DO CHECKLIST DE SEGURANÇA <<<
    const conhecido = await chamar(solicitar, A.token, { telefone: A.fone })
    const desconhecido = await chamar(solicitar, A.token, { telefone: '11900001111' })
    expect(conhecido).toEqual({ status: 200, corpo: { ok: true } })
    expect(desconhecido).toEqual({ status: 200, corpo: { ok: true } })
    expect(conhecido).toEqual(desconhecido)
  })

  it('e o EFEITO difere: só o conhecido gera código e manda mensagem', async () => {
    // O espelho obrigatório. Sem ele, "as respostas são iguais" ficaria verde numa rota que não
    // fizesse nada em nenhum dos dois casos.
    await chamar(solicitar, A.token, { telefone: '11900001111' })
    expect(LINHAS.booking_access_codes).toHaveLength(0)
    expect(enviadas).toHaveLength(0)

    await chamar(solicitar, A.token, { telefone: A.fone })
    expect(LINHAS.booking_access_codes).toHaveLength(1)
    expect(enviadas).toHaveLength(1)
  })

  it('telefone MALFORMADO também responde `{ ok: true }`', async () => {
    for (const t of ['', '123', 'abc', null, undefined]) {
      const r = await chamar(solicitar, A.token, { telefone: t })
      expect(r).toEqual({ status: 200, corpo: { ok: true } })
    }
  })

  it('cliente SEM agendamento futuro responde igual, e nada é gerado', async () => {
    // O terceiro ramo: o telefone É cliente, mas não tem futuro. A resposta é a mesma.
    LINHAS.calendar_events = []
    const r = await chamar(solicitar, A.token, { telefone: A.fone })
    expect(r).toEqual({ status: 200, corpo: { ok: true } })
    expect(LINHAS.booking_access_codes).toHaveLength(0)
  })

  it('estourar 3 por telefone/hora responde `{ ok: true }` sem mandar nada', async () => {
    // Regra 5: não revele o limite.
    for (let i = 0; i < 3; i += 1) semearCodigo(A.tenant, A.fone, { id: `pre-${i}` })
    const r = await chamar(solicitar, A.token, { telefone: A.fone })
    expect(r).toEqual({ status: 200, corpo: { ok: true } })
    expect(enviadas).toHaveLength(0)
  })

  it('o CÓDIGO nunca é gravado em claro — o que vai à tabela é hash e sal', async () => {
    // >>> O ITEM 4 DO CHECKLIST <<<
    await chamar(solicitar, A.token, { telefone: A.fone })
    const linha = LINHAS.booking_access_codes[0]
    expect(linha.code_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(linha.code_salt).toMatch(/^[0-9a-f]{32}$/)
    // o código em claro está na MENSAGEM (é o ponto dele), e NÃO na linha gravada
    const seisDigitos = /\b\d{6}\b/.exec(enviadas[0].texto)
    expect(seisDigitos).toBeTruthy()
    expect(JSON.stringify(linha)).not.toContain(seisDigitos![0])
    // e a linha não tem nenhuma coluna chamada `code` ou `codigo`
    expect(Object.keys(linha)).not.toContain('code')
    expect(Object.keys(linha)).not.toContain('codigo')
  })

  it('token inválido responde 404 — e isso NÃO é oráculo de telefone', async () => {
    const r = await chamar(solicitar, 'TOKEN_QUE_NAO_EXISTE', { telefone: A.fone })
    expect(r.status).toBe(404)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// REGRAS 3 e 4 — tentativas, uso único, e a recusa SEMPRE genérica
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('REGRAS 3 e 4 — a recusa nunca diz o motivo', () => {
  /**
   * >>> A FRASE GENÉRICA CONTÉM A PALAVRA "expirado", E ISSO É DE PROPÓSITO <<<
   *
   * `'Código inválido ou expirado.'` nomeia os DOIS casos justamente para não distinguir
   * nenhum. A primeira versão deste bloco varria os quatro motivos como substring e ficou
   * vermelha na própria mensagem — `instrumento-que-nao-enxerga.md` pelo lado do falso
   * positivo, a quarta vez nesta rodada que um padrão meu precisou ser confrontado.
   *
   * O que de fato prova o não-vazamento são duas coisas, e nenhuma delas é busca de palavra:
   *   · as respostas dos cinco casos são IDÊNTICAS entre si;
   *   · o corpo é EXATAMENTE a frase única, sem campo `motivo`.
   */
  const CORPO_UNICO = { error: 'Código inválido ou expirado.' }

  it('o código CERTO devolve os agendamentos futuros', async () => {
    semearCodigo(A.tenant, A.fone)
    const r = await chamar(validar, A.token, { telefone: A.fone, codigo: CODIGO })
    expect(r.status).toBe(200)
    expect(r.corpo.agendamentos).toHaveLength(1)
    expect(r.corpo.agendamentos[0].id).toBe(A.evt)
  })

  it('>>> A RESPOSTA NÃO CARREGA nome, e-mail nem id de cliente <<<', async () => {
    // O ITEM 2 DO CHECKLIST. Afirmado pelas CHAVES, não por "não contém o texto" — um nome
    // vazio na fixture faria a asserção por texto passar sem medir nada.
    semearCodigo(A.tenant, A.fone)
    const r = await chamar(validar, A.token, { telefone: A.fone, codigo: CODIGO })
    // >>> AS CHAVES EXATAS, E `barbeiro_id`/`servico_id` ESTÃO ENTRE ELAS DE PROPÓSITO <<<
    // Os dois ids JÁ SÃO PÚBLICOS: `GET /api/public/agenda/[token]` lista todos os barbeiros com
    // id, e `/servicos?barbeiro=` lista os serviços idem — quem tem o link tem os dois sem
    // código nenhum. Eles entraram porque o remarcar da tela reusa `GET …/horarios`, que é rota
    // da Fase 2 e esta rodada não pode tocar.
    //
    // O que NÃO pode estar aqui é o que identifica a PESSOA, e é isso que as três linhas abaixo
    // afirmam. Afirmar as chaves EXATAS (em vez de só a ausência de três nomes) é o que impede
    // um campo novo de entrar sem ninguém olhar.
    const chaves = Object.keys(r.corpo.agendamentos[0]).sort()
    expect(chaves).toEqual([
      'barbeiro_id', 'data', 'hora', 'id', 'profissional', 'servico', 'servico_id',
    ])
    const txt = JSON.stringify(r.corpo)
    expect(txt).not.toContain(A.cli)
    expect(txt).not.toContain('customer')
    expect(txt).not.toContain('email')
    expect(txt).not.toContain('whatsapp_phone')
  })

  it('código ERRADO, EXPIRADO, USADO e BLOQUEADO dão a MESMA resposta', async () => {
    // >>> OS QUATRO MOTIVOS, UMA FRASE <<<
    // Distinguir 'expirado' de 'errado' diria que o código EXISTIU — logo, que o telefone é
    // cliente. E 'bloqueado' diria que alguém gastou as tentativas de uma pessoa real.
    const respostas: Resposta[] = []

    montarBanco(); semearCodigo(A.tenant, A.fone)
    respostas.push(await chamar(validar, A.token, { telefone: A.fone, codigo: '999999' }))

    montarBanco(); semearCodigo(A.tenant, A.fone, { expires_at: new Date(AGORA.getTime() - 60_000).toISOString() })
    respostas.push(await chamar(validar, A.token, { telefone: A.fone, codigo: CODIGO }))

    montarBanco(); semearCodigo(A.tenant, A.fone, { used_at: AGORA.toISOString() })
    respostas.push(await chamar(validar, A.token, { telefone: A.fone, codigo: CODIGO }))

    montarBanco(); semearCodigo(A.tenant, A.fone, { attempts: 3 })
    respostas.push(await chamar(validar, A.token, { telefone: A.fone, codigo: CODIGO }))

    montarBanco()  // nenhum código semeado
    respostas.push(await chamar(validar, A.token, { telefone: A.fone, codigo: CODIGO }))

    const primeira = respostas[0]
    for (const r of respostas) expect(r).toEqual(primeira)
    // o corpo é EXATAMENTE a frase única — nenhum campo a mais por onde o motivo escape
    for (const r of respostas) {
      expect(r.status).toBe(401)
      expect(r.corpo).toEqual(CORPO_UNICO)
      expect(Object.keys(r.corpo)).toEqual(['error'])
    }
    // e 'bloqueado' e 'usado', que NÃO fazem parte da frase, não aparecem em nenhuma
    for (const r of respostas) {
      expect(JSON.stringify(r.corpo)).not.toContain('bloqueado')
      expect(JSON.stringify(r.corpo)).not.toContain('usado')
    }
  })

  it('cada tentativa INCREMENTA `attempts`, acerte ou não', async () => {
    semearCodigo(A.tenant, A.fone)
    await chamar(validar, A.token, { telefone: A.fone, codigo: '111111' })
    expect(LINHAS.booking_access_codes[0].attempts).toBe(1)
    await chamar(validar, A.token, { telefone: A.fone, codigo: '222222' })
    expect(LINHAS.booking_access_codes[0].attempts).toBe(2)
  })

  it('na TERCEIRA tentativa errada o código é QUEIMADO', async () => {
    // Regra 3. Sem a queima, `attempts` só contaria e o código seguiria vivo.
    semearCodigo(A.tenant, A.fone)
    for (const c of ['1', '2', '3'].map((n) => n.repeat(6))) {
      await chamar(validar, A.token, { telefone: A.fone, codigo: c })
    }
    expect(LINHAS.booking_access_codes[0].attempts).toBe(3)
    expect(LINHAS.booking_access_codes[0].used_at).toBeTruthy()
    // e o código CERTO agora não entra mais
    const r = await chamar(validar, A.token, { telefone: A.fone, codigo: CODIGO })
    expect(r.status).toBe(401)
  })

  it('USO ÚNICO: o acerto marca `used_at`, e o segundo uso falha', async () => {
    semearCodigo(A.tenant, A.fone)
    expect((await chamar(validar, A.token, { telefone: A.fone, codigo: CODIGO })).status).toBe(200)
    expect(LINHAS.booking_access_codes[0].used_at).toBeTruthy()
    expect((await chamar(validar, A.token, { telefone: A.fone, codigo: CODIGO })).status).toBe(401)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// REGRA 6 — cancelar só alcança o agendamento daquele telefone, tenant e futuro
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('REGRA 6 — as três condições, cada uma com caso próprio', () => {
  it('o cliente cancela o PRÓPRIO agendamento', async () => {
    semearCodigo(A.tenant, A.fone)
    const r = await chamar(cancelar, A.token, { telefone: A.fone, codigo: CODIGO, agendamento_id: A.evt })
    expect(r).toEqual({ status: 200, corpo: { ok: true } })
    expect(evento(A.evt).status).toBe('CANCELLED')
  })

  it('>>> id de OUTRO TELEFONE responde IGUAL a id inexistente <<<', async () => {
    // O ITEM 3 DO CHECKLIST. `OUTRO` é cliente do MESMO tenant — então só o filtro por
    // `customer_id` separa os dois, e é ele que este caso mede.
    semearCodigo(A.tenant, A.fone)
    const deOutro = await chamar(cancelar, A.token, {
      telefone: A.fone, codigo: CODIGO, agendamento_id: OUTRO.evt,
    })

    montarBanco(); semearCodigo(A.tenant, A.fone)
    const inexistente = await chamar(cancelar, A.token, {
      telefone: A.fone, codigo: CODIGO, agendamento_id: 'nao-existe-este-id',
    })

    expect(deOutro).toEqual(inexistente)
    expect(deOutro.status).toBe(404)
  })

  it('e o agendamento do OUTRO continua de pé', async () => {
    // O efeito, não só a resposta: uma rota que respondesse 404 E cancelasse passaria no caso
    // acima.
    semearCodigo(A.tenant, A.fone)
    await chamar(cancelar, A.token, { telefone: A.fone, codigo: CODIGO, agendamento_id: OUTRO.evt })
    expect(evento(OUTRO.evt).status).toBe('CONFIRMED')
  })

  it('id de OUTRO TENANT não é alcançado — o token do A não toca o evento do B', async () => {
    semearCodigo(A.tenant, A.fone)
    const r = await chamar(cancelar, A.token, { telefone: A.fone, codigo: CODIGO, agendamento_id: B.evt })
    expect(r.status).toBe(404)
    expect(evento(B.evt).status).toBe('CONFIRMED')
  })

  it('agendamento no PASSADO não é alcançado', async () => {
    evento(A.evt).start_time = new Date(AGORA.getTime() - 86400_000).toISOString()
    semearCodigo(A.tenant, A.fone)
    const r = await chamar(cancelar, A.token, { telefone: A.fone, codigo: CODIGO, agendamento_id: A.evt })
    expect(r.status).toBe(404)
    expect(evento(A.evt).status).toBe('CONFIRMED')
  })

  it('cancelar NÃO faz delete — o evento continua existindo com status CANCELLED', async () => {
    semearCodigo(A.tenant, A.fone)
    await chamar(cancelar, A.token, { telefone: A.fone, codigo: CODIGO, agendamento_id: A.evt })
    expect(evento(A.evt)).toBeTruthy()
    expect(escritas.some((e) => e.op === 'insert' && e.tabela === 'calendar_events')).toBe(false)
  })

  it('cancelar NÃO toca estoque, caixa, comissão nem vendas', async () => {
    // Medido na agenda interna em 08/10/2026: esses efeitos são todos do caminho COMPLETED.
    // Esta asserção é o que impede alguém de "completar" o cancelamento com eles depois.
    semearCodigo(A.tenant, A.fone)
    await chamar(cancelar, A.token, { telefone: A.fone, codigo: CODIGO, agendamento_id: A.evt })
    const proibidas = ['sales', 'sale_items', 'cash_entries', 'stock_movements', 'stock', 'pending_receivables', 'commission_entries']
    for (const t of proibidas) {
      expect(escritas.map((e) => e.tabela)).not.toContain(t)
    }
  })

  it('cancelar NÃO mexe no lembrete — o filtro de status da varredura já exclui', async () => {
    // Conferido no código da rota do lembrete, que NÃO foi alterada: ela filtra
    // `status in ('SCHEDULED','CONFIRMED')`, então `CANCELLED` sai da varredura sozinho.
    const fonte = require('fs').readFileSync(
      require('path').resolve(__dirname, '../../pages/api/whatsapp/send-reminder.ts'), 'utf8',
    ) as string
    expect(fonte).toContain("in('status', ['SCHEDULED', 'CONFIRMED'])")

    semearCodigo(A.tenant, A.fone)
    await chamar(cancelar, A.token, { telefone: A.fone, codigo: CODIGO, agendamento_id: A.evt })
    const upd = escritas.find((e) => e.op === 'update' && e.tabela === 'calendar_events')
    expect(Object.keys(upd!.dados)).toEqual(['status'])
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// §4 — OS AVISOS. O barbeiro SEM telefone vem PRIMEIRO: é o caso real.
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('§4 — barbeiro SEM telefone é o caso NORMAL, e não derruba nada', () => {
  it('>>> cancelamento GRAVA, cliente recebe, e a resposta é ok <<<', async () => {
    // >>> É O CASO QUE A MUTAÇÃO M21 MATA, E O QUE DE FATO EXECUTA EM PRODUÇÃO <<<
    // 0 de 5 funcionários do Salão Eliane têm telefone; 1 de 16 no repositório. Fazer a falta
    // de telefone derrubar o cancelamento quebraria o fluxo para todos os clientes de hoje.
    semearCodigo(A.tenant, A.fone)
    const r = await chamar(cancelar, A.token, {
      telefone: A.fone, codigo: CODIGO, agendamento_id: A.evt,
    })
    expect(r).toEqual({ status: 200, corpo: { ok: true } })
    expect(evento(A.evt).status).toBe('CANCELLED')
    // o CLIENTE recebeu
    expect(enviadas.map((e) => e.telefone)).toContain(A.fone)
    // e NINGUÉM mais — o barbeiro do A não tem telefone
    expect(enviadas).toHaveLength(1)
  })

  it('e a resposta NÃO carrega o aviso — ele é do log, não do cliente', async () => {
    // O cliente não tem o que fazer com "o profissional não foi avisado".
    semearCodigo(A.tenant, A.fone)
    const r = await chamar(cancelar, A.token, {
      telefone: A.fone, codigo: CODIGO, agendamento_id: A.evt,
    })
    expect(JSON.stringify(r.corpo)).not.toContain('telefone')
    expect(JSON.stringify(r.corpo)).not.toContain('avisado')
  })

  it('barbeiro COM telefone: os DOIS recebem', async () => {
    // O par. Sem ele, "só o cliente recebeu" ficaria verde numa rota que nunca avisasse o
    // profissional.
    semearCodigo(B.tenant, B.fone)
    const r = await chamar(cancelar, B.token, {
      telefone: B.fone, codigo: CODIGO, agendamento_id: B.evt,
    })
    expect(r.status).toBe(200)
    expect(enviadas.map((e) => e.telefone).sort()).toEqual(['11955554444', B.fone].sort())
  })

  it('FALHA de envio não derruba o cancelamento — o aviso é acessório', async () => {
    semearCodigo(A.tenant, A.fone)
    envioFalha = 'sem_token'
    const r = await chamar(cancelar, A.token, {
      telefone: A.fone, codigo: CODIGO, agendamento_id: A.evt,
    })
    expect(r).toEqual({ status: 200, corpo: { ok: true } })
    expect(evento(A.evt).status).toBe('CANCELLED')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// REGRA 7 — remarcar: se o horário novo falhar, o ANTIGO CONTINUA DE PÉ
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('REGRA 7 — a sequência do remarcar, medida pelo ESTADO FINAL do evento', () => {
  /** Quatro dias à frente, em `YYYY-MM-DD` local. Relativo ao relógio real, como o resto. */
  const QUATRO_DIAS = new Date(AGORA.getTime() + 4 * 86400_000)
  const DIA_NOVO = `${QUATRO_DIAS.getFullYear()}-${String(QUATRO_DIAS.getMonth() + 1).padStart(2, '0')}-${String(QUATRO_DIAS.getDate()).padStart(2, '0')}`

  it('remarcar move o evento para o horário novo', async () => {
    semearCodigo(A.tenant, A.fone)
    const r = await chamar(remarcar, A.token, {
      telefone: A.fone, codigo: CODIGO, agendamento_id: A.evt, dia: DIA_NOVO, hora: '15:00',
    })
    expect(r).toEqual({ status: 200, corpo: { ok: true } })
    const ev = evento(A.evt)
    expect(ev.start_time).toBe(instanteDoRelogioLocal(DIA_NOVO, horaParaMinutos('15:00')).toISOString())
    // e o status NÃO virou CANCELLED: é o mesmo evento, movido
    expect(ev.status).toBe('CONFIRMED')
  })

  it('>>> HORÁRIO NOVO INDISPONÍVEL: o ANTIGO CONTINUA DE PÉ <<<', async () => {
    // >>> É O CASO QUE A MUTAÇÃO M19 MATA <<<
    // A asserção é sobre o ESTADO FINAL, não sobre a resposta: uma rota que cancelasse o velho
    // ANTES de conferir o novo responderia 409 igual, e deixaria o cliente sem agendamento.
    semearCodigo(A.tenant, A.fone)
    const antes = { ...evento(A.evt) }
    horariosDoDia = ['09:00']   // 15:00 não está na lista
    const r = await chamar(remarcar, A.token, {
      telefone: A.fone, codigo: CODIGO, agendamento_id: A.evt, dia: DIA_NOVO, hora: '15:00',
    })
    expect(r.status).toBe(409)
    const depois = evento(A.evt)
    expect(depois.status).toBe('CONFIRMED')
    expect(depois.start_time).toBe(antes.start_time)
    expect(depois.end_time).toBe(antes.end_time)
    // E NENHUMA escrita em `calendar_events` aconteceu
    expect(escritas.filter((e) => e.tabela === 'calendar_events')).toHaveLength(0)
  })

  it('COLISÃO com outro agendamento: o antigo também continua de pé', async () => {
    // O outro caminho de falha, depois da disponibilidade. `OUTRO.evt` é do mesmo barbeiro.
    semearCodigo(A.tenant, A.fone)
    const antes = { ...evento(A.evt) }
    const outro = evento(OUTRO.evt)
    const inicioNovo = instanteDoRelogioLocal(DIA_NOVO, horaParaMinutos('15:00'))
    outro.start_time = inicioNovo.toISOString()
    outro.end_time = new Date(inicioNovo.getTime() + 1800000).toISOString()

    const r = await chamar(remarcar, A.token, {
      telefone: A.fone, codigo: CODIGO, agendamento_id: A.evt, dia: DIA_NOVO, hora: '15:00',
    })
    expect(r.status).toBe(409)
    expect(evento(A.evt).start_time).toBe(antes.start_time)
    expect(evento(A.evt).status).toBe('CONFIRMED')
  })

  it('remarcar para um horário que se sobrepõe ao PRÓPRIO antigo é permitido', async () => {
    // O `.neq('id', ev.id)` da releitura de colisão. Sem ele, o evento colidiria consigo mesmo
    // e remarcar das 14:00 para as 14:30 seria recusado — caso legítimo e comum.
    semearCodigo(A.tenant, A.fone)
    horariosDoDia = ['14:30']
    // O MESMO dia do agendamento antigo: é aí que o evento colidiria consigo mesmo.
    const mesmoDia = `${FUTURO.getFullYear()}-${String(FUTURO.getMonth() + 1).padStart(2, '0')}-${String(FUTURO.getDate()).padStart(2, '0')}`
    const r = await chamar(remarcar, A.token, {
      telefone: A.fone, codigo: CODIGO, agendamento_id: A.evt, dia: mesmoDia, hora: '14:30',
    })
    expect(r.status).toBe(200)
    expect(evento(A.evt).start_time)
      .toBe(instanteDoRelogioLocal(mesmoDia, horaParaMinutos('14:30')).toISOString())
  })

  it('>>> O LEMBRETE É RECALCULADO, e `whatsapp_reminder_sent` volta a false <<<', async () => {
    // >>> É O CASO QUE A MUTAÇÃO M20 MATA <<<
    // Sem isso, o lembrete antigo dispara na hora velha e o cliente recebe "amanhã às 14h"
    // para um horário que ele mudou.
    semearCodigo(A.tenant, A.fone)
    evento(A.evt).reminder_send_at = new Date(AGORA.getTime() + 86400_000).toISOString()
    evento(A.evt).whatsapp_reminder_sent = true

    await chamar(remarcar, A.token, {
      telefone: A.fone, codigo: CODIGO, agendamento_id: A.evt, dia: DIA_NOVO, hora: '15:00',
    })
    const ev = evento(A.evt)
    expect(ev.whatsapp_reminder_sent).toBe(false)
    // o novo lembrete é 24h antes do novo início — o dia novo é a quatro dias, logo o lembrete
    // cai a três dias, sempre no ramo das 24h.
    const novoInicio = instanteDoRelogioLocal(DIA_NOVO, horaParaMinutos('15:00'))
    expect(ev.reminder_send_at).toBe(new Date(novoInicio.getTime() - 86400_000).toISOString())
    // e o UPDATE traz os quatro campos num statement só
    const upd = escritas.find((e) => e.op === 'update' && e.tabela === 'calendar_events')
    expect(Object.keys(upd!.dados).sort()).toEqual(
      ['end_time', 'reminder_send_at', 'start_time', 'whatsapp_reminder_sent'],
    )
  })

  it('remarcar de OUTRO telefone responde igual a id inexistente', async () => {
    semearCodigo(A.tenant, A.fone)
    const deOutro = await chamar(remarcar, A.token, {
      telefone: A.fone, codigo: CODIGO, agendamento_id: OUTRO.evt, dia: DIA_NOVO, hora: '15:00',
    })
    montarBanco(); semearCodigo(A.tenant, A.fone)
    const inexistente = await chamar(remarcar, A.token, {
      telefone: A.fone, codigo: CODIGO, agendamento_id: 'nada', dia: DIA_NOVO, hora: '15:00',
    })
    expect(deOutro).toEqual(inexistente)
  })

  it('o aviso de remarcação vai ao cliente, e o barbeiro sem telefone não derruba', async () => {
    semearCodigo(A.tenant, A.fone)
    const r = await chamar(remarcar, A.token, {
      telefone: A.fone, codigo: CODIGO, agendamento_id: A.evt, dia: DIA_NOVO, hora: '15:00',
    })
    expect(r.status).toBe(200)
    expect(enviadas).toHaveLength(1)
    expect(enviadas[0].telefone).toBe(A.fone)
    // e a mensagem NÃO tem `{codigo}` sobrando: a linha saiu da constante nesta rodada
    expect(enviadas[0].texto).not.toContain('{codigo}')
    expect(enviadas[0].texto).not.toContain('use o código')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// O ISOLAMENTO ENTRE TENANTS, nas quatro rotas
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('>>> DOIS TOKENS DE TENANTS DIFERENTES NÃO SE ALCANÇAM <<<', () => {
  it('o item 5 do checklist: o token do A não lista nem toca nada do B', async () => {
    semearCodigo(A.tenant, A.fone)
    semearCodigo(B.tenant, B.fone)

    // validar pelo token do A, com o telefone do B: o B não é cliente do A
    const r = await chamar(validar, A.token, { telefone: B.fone, codigo: CODIGO })
    expect(r.status).toBe(401)

    // e pelo token do B o telefone do B funciona — o espelho
    const r2 = await chamar(validar, B.token, { telefone: B.fone, codigo: CODIGO })
    expect(r2.status).toBe(200)
    expect(r2.corpo.agendamentos[0].id).toBe(B.evt)
    expect(JSON.stringify(r2.corpo)).not.toContain(A.evt)
  })

  it('NENHUMA consulta das quatro rotas roda sem filtro de tenant', async () => {
    // >>> A GUARDA DO FAKE, AFIRMADA DEPOIS DE EXERCITAR AS QUATRO <<<
    // `supabaseAdmin` passa por cima da RLS: este filtro é o isolamento real em runtime.
    semearCodigo(A.tenant, A.fone)
    await chamar(solicitar, A.token, { telefone: A.fone })
    await chamar(validar, A.token, { telefone: A.fone, codigo: CODIGO })
    montarBanco(); semearCodigo(A.tenant, A.fone)
    await chamar(cancelar, A.token, { telefone: A.fone, codigo: CODIGO, agendamento_id: A.evt })
    montarBanco(); semearCodigo(A.tenant, A.fone)
    const d = new Date(AGORA.getTime() + 4 * 86400_000)
    await chamar(remarcar, A.token, {
      telefone: A.fone, codigo: CODIGO, agendamento_id: A.evt,
      dia: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      hora: '15:00',
    })

    expect(semFiltroDeTenant).toEqual([])
  })

  it('as quatro rotas recusam método que não seja POST', async () => {
    for (const rota of [solicitar, validar, cancelar, remarcar]) {
      const out: Resposta = { status: 0, corpo: null }
      const res: any = {
        status: (s: number) => { out.status = s; return res },
        json: (c: any) => { out.corpo = c; return res },
      }
      await rota({ method: 'GET', query: { token: A.token }, body: {}, headers: {}, socket: {} } as any, res)
      expect(out.status).toBe(405)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// A TELA — §3. Medida pelo ARQUIVO, e a razão está dita.
//
// >>> POR QUE ESTE BLOCO NÃO RENDERIZA A PÁGINA <<<
//
// `src/pages/agendar/[token].tsx` é uma página Next que depende de `useRouter` e de `fetch`.
// Renderizá-la no jsdom exigiria mockar os dois e simular quatro passos de formulário — e o que
// a §3 pede é verificável lendo o arquivo, porque são propriedades ESTRUTURAIS: "nenhuma chamada
// ao supabase", "a frase é a mesma", "o nome só depois do código".
//
// `teste-que-nao-exercita.md` admite asserção estrutural quando não há efeito mensurável
// deixado de fora. Aqui o efeito das ROTAS está medido acima, com 35 casos; o que sobra para a
// tela é o que ela não pode conter. É o mesmo desenho do portão da Fase 2 para a página pública.
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('§3 — a tela, lida do arquivo', () => {
  const fs = require('fs')
  const path = require('path')
  const pagina = path.resolve(__dirname, '../../pages/agendar/[token].tsx')
  const fonte = fs.readFileSync(pagina, 'utf8') as string
  const programa = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

  it('ZERO chamadas ao supabase do navegador — na página E no componente que saiu dela', () => {
    // >>> A REGRA INVIOLÁVEL, DO LADO DO CLIENTE <<<
    // A página não tem cliente de banco e não conhece `tenant_id`. Tudo passa pelas rotas, que
    // resolvem o tenant pelo TOKEN.
    //
    // >>> O ALCANCE FOI ESTENDIDO EM 09/10/2026, E É O PONTO DESTE COMENTÁRIO <<<
    // A asserção lia SÓ `pages/agendar/[token].tsx`. Naquele dia a escolha de dia e hora saiu
    // da página para `components/agendar/escolha-de-dia-e-hora.component.tsx` — e um portão
    // que continuasse lendo só a página ficaria verde com um `import { supabase }` no arquivo
    // novo. É `portao-que-nao-alcanca.md`: mover código para fora do alcance do portão é o
    // jeito mais silencioso de furá-lo.
    const componente = fs.readFileSync(
      path.resolve(__dirname, '../../components/agendar/escolha-de-dia-e-hora.component.tsx'),
      'utf8',
    ) as string
    const programaDoComponente = componente
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

    for (const prog of [programa, programaDoComponente]) {
      expect(prog).not.toMatch(/supabase/i)
      expect(prog).not.toMatch(/createClient/)
      expect(prog).not.toContain('tenant_id')
      expect(prog).not.toMatch(/SERVICE_ROLE|service_role/)
    }
  })

  it('a tela inicial oferece os DOIS caminhos', () => {
    expect(programa).toContain("'ESCOLHA'")
    expect(fonte).toContain('Meus agendamentos')
    expect(fonte).toContain('>\n              Agendar\n            </button>')
  })

  it('a frase do código é a MESMA para conhecido e desconhecido — e é uma só no arquivo', () => {
    // >>> SE HOUVESSE DUAS FRASES, HAVERIA DUAS RESPOSTAS <<<
    // A rota responde `{ ok: true }` nos dois casos; uma tela com um ramo "número não
    // encontrado" desfaria do lado do navegador tudo o que a rota protege.
    const ocorrencias = fonte.split('Enviamos um código para o seu WhatsApp.').length - 1
    expect(ocorrencias).toBe(1)
    expect(programa).not.toMatch(/não encontrado|nao encontrado|não é cliente/i)
  })

  it('o erro do código é SEMPRE a mesma frase, e ela existe uma vez só como constante', () => {
    expect(programa).toContain("const RECUSA = 'Código inválido ou expirado.'")
    // e nenhum dos quatro motivos aparece na tela
    for (const m of ['expirado"', 'bloqueado', "'usado'", "'errado'"]) {
      expect(programa).not.toContain(m)
    }
  })

  it('a tela chama as QUATRO rotas novas, e nenhuma outra', () => {
    for (const r of ['codigo-solicitar', 'codigo-validar', '/cancelar', '/remarcar']) {
      expect(programa).toContain(r)
    }
  })

  it('>>> REMARCAR USA O MESMO COMPONENTE DO AGENDAR — não um segundo seletor <<<', () => {
    // >>> ASSERÇÃO INVERTIDA EM 09/10/2026, NÃO APAGADA <<<
    //
    // Ela era:
    //     expect(programa).toContain('proximosDias(14)')
    //     expect(programa).toContain('carregarHorariosDoAlvo')
    //     const quantosProximosDias = programa.split('function proximosDias').length - 1
    //     expect(quantosProximosDias).toBe(1)
    //
    // E provava o reuso da FUNÇÃO de dias. O reuso agora é do COMPONENTE: `proximosDias` foi
    // para `@/utils/faixa-de-dias` (com `hoje` injetado e portão próprio), e os números 14 e 30
    // saíram do código — o horizonte vem da rota.
    //
    // >>> ESTE CASO É O QUE O COMANDO PEDIU EXPLICITAMENTE <<<
    // *"Acrescente caso afirmando que o remarcar usa o mesmo componente - sem isso a terceira
    // forma volta na proxima mudanca."* Eram TRÊS formas de mostrar dia/hora nesta página: 30
    // botões no agendar, 14 no remarcar, e botões de largura cheia para os horários do
    // remarcar. As três viraram UMA.
    expect(programa).toContain('EscolhaDeDiaEHora')
    expect(programa).toContain("from '@/components/agendar/escolha-de-dia-e-hora.component'")
    // o componente é montado DUAS vezes: uma por fluxo, e nenhuma a mais
    expect(programa.split('<EscolhaDeDiaEHora').length - 1).toBe(2)
    // a busca é INJETADA, uma por fluxo, e as duas batem no endpoint da Fase 2
    expect(programa).toContain('buscarHorariosDoAgendar')
    expect(programa).toContain('buscarHorariosDoAlvo')
    expect(programa).toContain('/horarios?')

    // >>> E AS TRÊS FORMAS ANTIGAS NÃO EXISTEM MAIS <<<
    expect(programa).not.toContain('proximosDias(14)')
    expect(programa).not.toContain('proximosDias(30)')
    expect(programa).not.toContain('function proximosDias')
    // nem lista de dias escrita à mão: o único `.map` de dia está dentro do componente
    expect(programa).not.toMatch(/proximosDias\([^)]*\)\.map/)
  })

  it('a confirmação deixou de mandar o cliente ligar para o salão', () => {
    // A frase antiga prometia o contrário do rodapé que a Fase 2B tornou verdade.
    expect(fonte).not.toContain('fale com o estabelecimento.')
    expect(fonte).toContain('volte a este link')
  })

  it('>>> `horarios.ts`, `servicos.ts` e `horarios-disponiveis.ts` SEGUEM INTOCADOS <<<', () => {
    // >>> O LIMITE DO COMANDO, AFIRMADO <<<
    // *"Esta e a UNICA alteracao autorizada em agendar.ts nesta rodada. O resto do arquivo e das
    // outras rotas publicas continua intocado."* A primeira versão do `carregarHorariosDoAlvo`
    // inventou um parâmetro `agendamento` nesta rota; a saída foi devolver os ids na validação.
    // >>> A ASSERÇÃO É O PRÓPRIO GIT, E A PRIMEIRA VERSÃO ERA UM FALSO POSITIVO <<<
    // Ela procurava a string 'agendamento' no arquivo e casou com o caminho do IMPORT,
    // `@/lib/agendamento-publico`. Buscar palavra para provar "não foi alterado" é o instrumento
    // errado: o que prova isso é o diff. `git diff` contra `origin/main` responde a pergunta
    // exata, e não há padrão a estreitar.
    const { execSync } = require('child_process')
    const diff = execSync(
      `git -C ${path.resolve(__dirname, '../../..')} diff origin/main --stat -- `
      + `'src/pages/api/public/agenda/[token]/horarios.ts' `
      + `'src/pages/api/public/agenda/[token]/servicos.ts' `
      + `'src/utils/horarios-disponiveis.ts' || true`,
      { encoding: 'utf8' },
    ) as string
    expect(diff.trim()).toBe('')
  })

  it('>>> `index.ts` MUDOU, e a mudança é UM CAMPO A MAIS — nada saiu, nada renomeou <<<', () => {
    // >>> ASSERÇÃO SEPARADA EM 09/10/2026 <<<
    //
    // O caso acima listava `index.ts` entre os arquivos de diff VAZIO. O dono do produto
    // autorizou a alteração naquele dia, com estas palavras: *"A rota indice passa a devolver
    // { empresa, barbeiros, horizonteDias }. E um campo A MAIS. Nenhum campo sai, nenhum muda
    // de nome, nenhum consumidor quebra."*
    //
    // Então `index.ts` saiu daquela lista e ganhou caso PRÓPRIO — que afirma exatamente o
    // limite da autorização, em vez de simplesmente deixar de olhar o arquivo. Tirá-lo da
    // lista sem pôr nada no lugar seria furar o portão pelo lado de dentro.
    const idx = fs.readFileSync(
      path.resolve(__dirname, '../../pages/api/public/agenda/[token]/index.ts'), 'utf8',
    ) as string
    const prog = idx.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

    // os dois campos antigos continuam, com o MESMO nome
    expect(prog).toContain('empresa: ctx.empresa')
    expect(prog).toContain('barbeiros,')
    // e o terceiro entrou, vindo do contexto do TOKEN
    expect(prog).toContain('horizonteDias: ctx.horizon_days')

    // >>> E NADA MAIS ENTROU: as chaves do corpo são EXATAMENTE três <<<
    // Afirmar as chaves (e não só a presença do campo novo) é o que impede um quarto campo de
    // aparecer sem alguém olhar — o mesmo desenho do caso de `codigo-validar`.
    const corpo = /res\.status\(200\)\.json\(\{([\s\S]*?)\}\)/.exec(prog)
    expect(corpo).toBeTruthy()
    const chaves = (corpo![1].match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*[,:]/gm) ?? [])
      .map((x) => x.trim().replace(/[,:]$/, '')).sort()
    expect(chaves).toEqual(['barbeiros', 'empresa', 'horizonteDias'])

    // nenhum dado de cliente, e nenhum `tenant_id` lido do pedido
    for (const proibido of ['name', 'email', 'phone', 'whatsapp', 'customer']) {
      expect(prog).not.toContain(proibido)
    }
    expect(prog).not.toMatch(/req\.(body|query|headers)[^)]*tenant/)
  })

  it('a ÚNICA mudança em `agendar.ts` foi o envio que saiu para o lib', () => {
    const a = fs.readFileSync(
      path.resolve(__dirname, '../../pages/api/public/agenda/[token]/agendar.ts'), 'utf8',
    ) as string
    const prog = a.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    // a função saiu
    expect(prog).not.toContain('async function enviarConfirmacao')
    expect(prog).not.toContain('async function nomeDoBarbeiro')
    // e ele IMPORTA as duas do lib
    expect(prog).toContain('enviarMensagemDoAgendamento')
    expect(prog).toContain("from '@/lib/agendamento-publico'")
    // nada de código de acesso entrou ali
    expect(prog).not.toContain('booking_access_codes')
    expect(prog).not.toContain('conferirCodigo')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// A MIGRAÇÃO — lida do arquivo, porque ela NÃO está aplicada
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('a migração nasce PENDENTE, e o arquivo diz o que precisa dizer', () => {
  const fs = require('fs')
  const path = require('path')
  const arq = path.resolve(
    __dirname, '../../../supabase/migrations/20261008000001_agendamento_publico_codigos.sql',
  )
  const sql = fs.readFileSync(arq, 'utf8') as string

  it('o arquivo existe, com o nome da convenção', () => {
    expect(fs.existsSync(arq)).toBe(true)
  })

  it('a tabela guarda HASH e SAL, e NÃO uma coluna de código em claro', () => {
    // >>> O ITEM 4 DO CHECKLIST, do lado do schema <<<
    expect(sql).toContain('code_hash   text NOT NULL')
    expect(sql).toContain('code_salt   text NOT NULL')
    // nenhuma coluna chamada `code` ou `codigo` sozinha
    expect(sql).not.toMatch(/^\s+code\s+text/m)
    expect(sql).not.toMatch(/^\s+codigo\s+text/m)
  })

  it('RLS LIGADA, com política nas QUATRO operações', () => {
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY')
    for (const op of ['FOR SELECT', 'FOR INSERT', 'FOR UPDATE', 'FOR DELETE']) {
      expect(sql).toContain(op)
    }
    // Quatro políticas nomeadas, não uma `FOR ALL` — que não apareceria como quatro na
    // contagem de `pg_policy`.
    //
    // A asserção mede o SQL sem comentários: a primeira versão procurava `FOR ALL` no arquivo
    // cru e casou com o COMENTÁRIO que explica por que ele não é usado. Medir a prosa em vez do
    // programa já ficou vermelho várias vezes nesta campanha.
    const semComentarios = sql.replace(/^\s*--.*$/gm, '')
    expect(semComentarios).not.toContain('FOR ALL')
    expect((semComentarios.match(/CREATE POLICY/g) ?? [])).toHaveLength(4)
  })

  it('`REVOKE ALL ... FROM anon` está lá, e é REVOKE e não GRANT', () => {
    expect(sql).toContain('REVOKE ALL ON public.booking_access_codes FROM anon;')
    expect(sql).not.toMatch(/GRANT .* TO anon/)
  })

  it('`used_at` é NULÁVEL e sem default — o NULL é a distinção', () => {
    expect(sql).toMatch(/used_at\s+timestamptz\s*,/)
    expect(sql).not.toMatch(/used_at[^,]*DEFAULT/)
  })

  it('o arquivo traz a verificação por CONSULTA e o `NOTIFY pgrst`', () => {
    // `migration-delivery.md`: não confiar no retorno do comando de aplicação, e o NOTIFY não
    // vem junto com o COMMIT.
    expect(sql).toContain('information_schema.columns')
    expect(sql).toContain('role_table_grants')
    expect(sql).toContain("NOTIFY pgrst, 'reload schema'")
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 09/10/2026 — O NOME DO CLIENTE NA MENSAGEM, E **FORA** DA RESPOSTA HTTP
//
// Exigência do dono do produto, registrada como está: *"O nome entra na mensagem enviada ao
// proprio cliente. Ele NAO entra em nenhuma resposta HTTP antes do codigo validado - sao coisas
// diferentes."*
//
// Os três casos que o comando pediu, mais o par e a mutação:
//   1. cancelar com cliente que TEM nome  -> o nome aparece no texto ENVIADO
//   2. cancelar com nome VAZIO no banco   -> texto sem vírgula solta e sem `{cliente}`
//   3. a resposta HTTP das DUAS rotas     -> chaves exatas, sem nome, email nem id  << M24
// ═══════════════════════════════════════════════════════════════════════════════════════════
describe('o NOME vai na mensagem do próprio cliente, e NUNCA na resposta HTTP', () => {
  /** Quatro dias à frente, em `YYYY-MM-DD` local — como o resto da suíte. */
  const Q = new Date(AGORA.getTime() + 4 * 86400_000)
  const DIA = `${Q.getFullYear()}-${String(Q.getMonth() + 1).padStart(2, '0')}-${String(Q.getDate()).padStart(2, '0')}`

  /** A mensagem que foi para o telefone DO CLIENTE (não a do barbeiro). */
  function textoAoCliente(fone: string): string {
    const m = enviadas.find((e) => e.telefone === fone)
    return m ? m.texto : ''
  }

  it('cancelar: o cliente que TEM nome recebe o nome no texto', () => {
    // O caso 1 do comando. O tenant B é o que tem barbeiro COM telefone, então aqui se usa o A
    // de propósito: uma mensagem só, e ela é a do cliente.
    semearCodigo(A.tenant, A.fone)
    return chamar(cancelar, A.token, { telefone: A.fone, codigo: CODIGO, agendamento_id: A.evt })
      .then((r) => {
        expect(r.status).toBe(200)
        const t = textoAoCliente(A.fone)
        expect(t).toContain('Ana Maria')
        expect(t.startsWith('Olá Ana Maria, seu agendamento foi cancelado.')).toBe(true)
        // e nenhum placeholder sobrou
        expect(t).not.toContain('{')
      })
  })

  it('remarcar: idem — e o nome vem da MESMA consulta, não de uma segunda', () => {
    // O par da rota irmã. `remarcar` importa `eventoAlcancavel` de `cancelar`, então um nome que
    // só chegasse numa das duas seria `copia-divergente.md`.
    semearCodigo(A.tenant, A.fone)
    return chamar(remarcar, A.token, {
      telefone: A.fone, codigo: CODIGO, agendamento_id: A.evt, dia: DIA, hora: '14:30',
    }).then((r) => {
      expect(r.status).toBe(200)
      const t = textoAoCliente(A.fone)
      expect(t).toContain('Ana Maria')
      expect(t.startsWith('Olá Ana Maria, seu agendamento foi alterado.')).toBe(true)
      expect(t).not.toContain('{')
    })
  })

  it('>>> nome VAZIO no banco: `Olá, seu agendamento…` — SEM vírgula solta <<<', async () => {
    // O caso 2 do comando, literal: *"Se o nome vier vazio ou nulo no banco, o placeholder some
    // pela limpeza do item 1, e o texto fica 'Olá, seu agendamento foi cancelado.' Confirme que
    // fica assim, sem virgula solta."*
    //
    // >>> E ELE MEDE O ESTADO QUE EXISTIA ATÉ HOJE EM PRODUÇÃO <<<
    // Era exatamente este o texto que saía para TODOS os clientes, porque a rota passava
    // `cliente: ''` sempre. Agora ele só sai para quem não tem nome cadastrado.
    LINHAS.customers.find((c: any) => c.id === A.cli).name = null
    semearCodigo(A.tenant, A.fone)
    const r = await chamar(cancelar, A.token, {
      telefone: A.fone, codigo: CODIGO, agendamento_id: A.evt,
    })
    expect(r).toEqual({ status: 200, corpo: { ok: true } })
    const t = textoAoCliente(A.fone)
    expect(t.startsWith('Olá, seu agendamento foi cancelado.')).toBe(true)
    expect(t).not.toContain('Olá ,')
    expect(t).not.toContain('{cliente}')
    expect(t).not.toMatch(/ {2}/)
    // e o cancelamento gravou — nome ausente não derruba nada
    expect(evento(A.evt).status).toBe('CANCELLED')
  })

  it('string em BRANCO conta como vazia — `\'   \'` não vira um nome', async () => {
    // `ausente-vs-falso.md`: branco não afirma nada. Sem este caso, um `.trim()` ausente no
    // caminho deixaria `Olá    , seu…` passar.
    LINHAS.customers.find((c: any) => c.id === A.cli).name = '   '
    semearCodigo(A.tenant, A.fone)
    await chamar(cancelar, A.token, { telefone: A.fone, codigo: CODIGO, agendamento_id: A.evt })
    expect(textoAoCliente(A.fone).startsWith('Olá, seu agendamento foi cancelado.')).toBe(true)
  })

  it('>>> M24 — a resposta HTTP de cancelar NÃO carrega nome, email nem id de cliente <<<', async () => {
    // >>> É O CASO QUE A MUTAÇÃO M24 MATA <<<
    // Afirmado pelas CHAVES EXATAS, como já se faz em `codigo-validar`: "não contém o nome"
    // ficaria verde num corpo que trouxesse `{ cliente: '' }`, e também num campo novo com
    // outro nome. As chaves exatas impedem que qualquer coisa entre sem alguém olhar.
    semearCodigo(A.tenant, A.fone)
    const r = await chamar(cancelar, A.token, {
      telefone: A.fone, codigo: CODIGO, agendamento_id: A.evt,
    })
    expect(Object.keys(r.corpo)).toEqual(['ok'])
    expect(r.corpo).toEqual({ ok: true })

    const txt = JSON.stringify(r.corpo)
    // o nome que a rota ACABOU de usar na mensagem — e que a mensagem prova estar disponível
    expect(textoAoCliente(A.fone)).toContain('Ana Maria')
    expect(txt).not.toContain('Ana')
    expect(txt).not.toContain('Maria')
    expect(txt).not.toContain(A.cli)
    expect(txt).not.toContain('cliente')
    expect(txt).not.toContain('customer')
    expect(txt).not.toContain('email')
    expect(txt).not.toContain('whatsapp')
    expect(txt).not.toContain(A.fone)
  })

  it('>>> M24 — idem para remarcar <<<', async () => {
    semearCodigo(A.tenant, A.fone)
    const r = await chamar(remarcar, A.token, {
      telefone: A.fone, codigo: CODIGO, agendamento_id: A.evt, dia: DIA, hora: '14:30',
    })
    expect(Object.keys(r.corpo)).toEqual(['ok'])
    expect(r.corpo).toEqual({ ok: true })

    const txt = JSON.stringify(r.corpo)
    expect(textoAoCliente(A.fone)).toContain('Ana Maria')
    expect(txt).not.toContain('Ana')
    expect(txt).not.toContain('Maria')
    expect(txt).not.toContain(A.cli)
    expect(txt).not.toContain('cliente')
    expect(txt).not.toContain('customer')
    expect(txt).not.toContain('email')
    expect(txt).not.toContain('whatsapp')
    expect(txt).not.toContain(A.fone)
  })

  it('e a RECUSA também não vaza o nome — nem no corpo, nem por diferença de resposta', async () => {
    // O id de OUTRO cliente DO MESMO tenant. A rota lê o nome só depois de alcançar o evento,
    // então aqui ela nem chega lá — e a resposta é a mesma de id inexistente.
    semearCodigo(A.tenant, A.fone)
    const alheio = await chamar(cancelar, A.token, {
      telefone: A.fone, codigo: CODIGO, agendamento_id: OUTRO.evt,
    })
    montarBanco(); enviadas.length = 0; semearCodigo(A.tenant, A.fone)
    const inexistente = await chamar(cancelar, A.token, {
      telefone: A.fone, codigo: CODIGO, agendamento_id: 'nao-existe',
    })
    expect(alheio).toEqual(inexistente)
    expect(JSON.stringify(alheio.corpo)).not.toContain('Carla')
    // e nenhuma mensagem saiu em nenhum dos dois
    expect(enviadas).toHaveLength(0)
  })

  it('o nome NÃO vira uma segunda consulta: `customers` é lida UMA vez por cancelamento', () => {
    // >>> A FORMA DA CORREÇÃO, NÃO SÓ O EFEITO <<<
    // O nome entrou no `select` que JÁ existia em `eventoAlcancavel`. Uma segunda consulta a
    // `customers` seria uma ida a mais ao banco e um segundo ponto a filtrar por tenant — e é
    // isso que esta asserção impede de aparecer depois.
    const fs = require('fs')
    const path = require('path')
    const prog = (fs.readFileSync(
      path.resolve(__dirname, '../../pages/api/public/agenda/[token]/cancelar.ts'), 'utf8',
    ) as string).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    expect((prog.match(/from\('customers'\)/g) ?? [])).toHaveLength(1)
    expect(prog).toContain("select('id, name')")
    // e `remarcar` não tem consulta própria a `customers` — ele importa `eventoAlcancavel`
    const rem = (fs.readFileSync(
      path.resolve(__dirname, '../../pages/api/public/agenda/[token]/remarcar.ts'), 'utf8',
    ) as string).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    expect(rem).not.toContain("from('customers')")
    expect(rem).toContain('eventoAlcancavel')
  })

  it('e o isolamento por tenant continua inteiro depois de tudo isto', async () => {
    // A guarda do fake, outra vez: o `select` ganhou uma coluna, e a coluna não pode ter vindo
    // com a perda do filtro.
    semearCodigo(A.tenant, A.fone)
    await chamar(cancelar, A.token, { telefone: A.fone, codigo: CODIGO, agendamento_id: A.evt })
    semearCodigo(B.tenant, B.fone)
    await chamar(cancelar, B.token, { telefone: B.fone, codigo: CODIGO, agendamento_id: B.evt })
    expect(semFiltroDeTenant).toEqual([])
  })
})
