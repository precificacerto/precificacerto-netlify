/**
 * O ISOLAMENTO ENTRE TENANTS NA SUPERFÍCIE PÚBLICA.
 *
 * Regra inviolável do PO, registrada como está:
 *
 *   "Cada prestador de serviço vai ter uma tenant. Nunca pode ter nenhuma integração ou de
 *    informação. Nada. Nunca."
 *
 * >>> POR QUE ESTE PORTÃO EXISTE, e por que ele monta DUAS tenants <<<
 *
 * O `supabaseAdmin` passa POR CIMA da RLS. Nesta superfície, o único isolamento é o filtro
 * `tenant_id` que o código escreve — se um `.eq('tenant_id', …)` faltar em uma consulta, a RLS não
 * salva, e a resposta devolve dado de outro salão. Um caso com UMA tenant não distingue "filtra
 * certo" de "não filtra": com um tenant só, toda linha é dele.
 *
 * Daí o fake abaixo guardar DUAS tenants e RECUSAR consulta sem filtro de tenant. Ele é um
 * `supabaseAdmin` de mentira, e é de propósito: o jest não fala com o Postgres, então o único
 * portão que alcança o isolamento é este (`portao-que-nao-alcanca.md`).
 */

const A = { tenant: 'tenant-A', token: 'TOKEN_AAAAAAAAAAAAAAAAAA', emp: 'empA', nome: 'Barbeiro do A' }
const B = { tenant: 'tenant-B', token: 'TOKEN_BBBBBBBBBBBBBBBBBB', emp: 'empB', nome: 'Barbeiro do B' }

/** As linhas das duas tenants, no mesmo "banco". */
const LINHAS: Record<string, any[]> = {
  tenant_booking_settings: [
    { tenant_id: A.tenant, public_token: A.token, is_enabled: true, grid_minutes: 30, lead_time_min: 0, horizon_days: 30, msg_confirmacao: null },
    { tenant_id: B.tenant, public_token: B.token, is_enabled: true, grid_minutes: 30, lead_time_min: 0, horizon_days: 30, msg_confirmacao: null },
    // uma terceira, DESLIGADA, para o caso do token off
    { tenant_id: 'tenant-C', public_token: 'TOKEN_CCCCCCCCCCCCCCCCCC', is_enabled: false, grid_minutes: 30, lead_time_min: 0, horizon_days: 30, msg_confirmacao: null },
  ],
  tenants: [
    { id: A.tenant, name: 'Salão A' }, { id: B.tenant, name: 'Salão B' }, { id: 'tenant-C', name: 'Salão C' },
  ],
  employees: [
    { id: A.emp, tenant_id: A.tenant, name: A.nome, status: 'ACTIVE' },
    { id: B.emp, tenant_id: B.tenant, name: B.nome, status: 'ACTIVE' },
  ],
  employee_working_hours: [
    { tenant_id: A.tenant, employee_id: A.emp, weekday: 4, start_time: '09:00:00', end_time: '12:00:00', is_active: true },
    { tenant_id: B.tenant, employee_id: B.emp, weekday: 4, start_time: '09:00:00', end_time: '12:00:00', is_active: true },
  ],
  employee_commission_tables: [
    { tenant_id: A.tenant, employee_id: A.emp, commission_tables: { id: 'ctA', type: 'SERVICE' } },
    { tenant_id: B.tenant, employee_id: B.emp, commission_tables: { id: 'ctB', type: 'SERVICE' } },
  ],
  services: [
    { id: 'svcA', tenant_id: A.tenant, name: 'Corte do A', estimated_duration_minutes: 30, commission_table_id: 'ctA', status: 'ACTIVE' },
    { id: 'svcB', tenant_id: B.tenant, name: 'Corte do B', estimated_duration_minutes: 30, commission_table_id: 'ctB', status: 'ACTIVE' },
  ],
}

/** Consultas que rodaram SEM filtro de tenant_id. Tem de ficar vazio. */
const semFiltroDeTenant: string[] = []

function fakeFrom(tabela: string) {
  const filtros: Record<string, any> = {}
  const q: any = {
    select: () => q,
    order: () => q,
    limit: () => q,
    not: () => q,
    neq: () => q,
    gte: () => q, lte: () => q, lt: () => q, gt: () => q,
    eq: (col: string, val: any) => { filtros[col] = val; return q },
    then: undefined,
  }
  const resolver = () => {
    // >>> A GUARDA QUE FAZ O PORTÃO ALCANÇAR <<<
    // `tenants` é consultada pelo `id` (que já é o tenant). Toda OUTRA tabela tem de trazer
    // `tenant_id` no filtro, ou a consulta é registrada como vazamento em potencial.
    if (tabela !== 'tenants' && !('tenant_id' in filtros) && !('public_token' in filtros)) {
      semFiltroDeTenant.push(tabela)
    }
    const linhas = (LINHAS[tabela] ?? []).filter((r) =>
      Object.entries(filtros).every(([k, v]) => {
        if (k === 'id' && tabela === 'tenants') return r.id === v
        return r[k] === v
      }))
    return linhas
  }
  // `error: null` sem anotação infere `any` com `strictNullChecks: false` (TS7018) — a mesma
  // classe que já apareceu três vezes nesta campanha. O tipo nomeia o que o valor é.
  const vazio: { message: string } | null = null
  q.maybeSingle = async () => ({ data: resolver()[0] ?? null, error: vazio })
  q.single = async () => ({ data: resolver()[0] ?? null, error: vazio })
  // o await direto no builder (sem single) devolve a lista
  q.then = (ok: any) => Promise.resolve({ data: resolver(), error: vazio }).then(ok)
  return q
}

jest.mock('@/supabase/admin', () => ({
  supabaseAdmin: { from: (t: string) => fakeFrom(t) },
}))

import { barbeirosDoLink, contextoDoToken, barbeiroValido, servicosDoBarbeiro } from '@/lib/agendamento-publico'

beforeEach(() => { semFiltroDeTenant.length = 0 })

describe('o token resolve o tenant, e SÓ o dele', () => {
  it('o token do A devolve o tenant do A; o do B, o do B', async () => {
    expect((await contextoDoToken(A.token))?.tenant_id).toBe(A.tenant)
    expect((await contextoDoToken(B.token))?.tenant_id).toBe(B.tenant)
  })

  it('>>> TOKEN INEXISTENTE E TOKEN DESLIGADO DÃO O MESMO `null` <<<', async () => {
    const inexistente = await contextoDoToken('TOKEN_QUE_NAO_EXISTE_XX')
    const desligado = await contextoDoToken('TOKEN_CCCCCCCCCCCCCCCCCC')  // is_enabled = false
    expect(inexistente).toBeNull()
    expect(desligado).toBeNull()
    // E são o MESMO valor: não há como a rota distinguir os dois, logo não há como a resposta
    // revelar que o token existe mas está off.
    expect(inexistente).toEqual(desligado)
  })

  it('token com formato impossível não chega ao banco', async () => {
    for (const t of ['', '   ', 'a'.repeat(200), 'tem espaço', 'tem/barra', null, undefined, 42]) {
      expect(await contextoDoToken(t as any)).toBeNull()
    }
  })
})

describe('>>> O TOKEN DO A NÃO ENXERGA NADA DO B <<<', () => {
  it('a lista de barbeiros do A traz o do A e NÃO traz o do B', async () => {
    const lista = await barbeirosDoLink(A.tenant)
    expect(lista).toEqual([{ id: A.emp, nome: A.nome }])
    expect(lista.map((b) => b.id)).not.toContain(B.emp)
    expect(JSON.stringify(lista)).not.toContain(B.nome)
  })

  it('o espelho: a lista do B traz o do B e não o do A', async () => {
    // Sem o espelho, "não traz o do B" ficaria verde numa função que não trouxesse NINGUÉM.
    const lista = await barbeirosDoLink(B.tenant)
    expect(lista).toEqual([{ id: B.emp, nome: B.nome }])
    expect(JSON.stringify(lista)).not.toContain(A.nome)
  })

  it('o barbeiro do B é RECUSADO quando o tenant é o do A', async () => {
    expect(await barbeiroValido(A.tenant, B.emp)).toBeNull()
    // e o do A é aceito — o par que prova que a recusa não é de todos
    expect(await barbeiroValido(A.tenant, A.emp)).toBe(A.emp)
  })

  it('os serviços do A não trazem o serviço do B', async () => {
    const svcs = await servicosDoBarbeiro(A.tenant, A.emp)
    expect(svcs).toEqual([{ id: 'svcA', nome: 'Corte do A', duracaoMin: 30 }])
    expect(JSON.stringify(svcs)).not.toContain('Corte do B')
  })
})

describe('TODA consulta filtra por tenant — o supabaseAdmin passa por cima da RLS', () => {
  it('nenhuma consulta rodou sem filtro de tenant_id', async () => {
    await contextoDoToken(A.token)
    await barbeirosDoLink(A.tenant)
    await barbeiroValido(A.tenant, A.emp)
    await servicosDoBarbeiro(A.tenant, A.emp)
    // Se um `.eq('tenant_id', …)` faltar em qualquer consulta, o nome da tabela aparece aqui.
    expect(semFiltroDeTenant).toEqual([])
  })
})

describe('a resposta pública não carrega dado de cliente', () => {
  it('barbeiro traz SÓ id e nome', async () => {
    const lista = await barbeirosDoLink(A.tenant)
    for (const b of lista) expect(Object.keys(b).sort()).toEqual(['id', 'nome'])
  })

  it('serviço traz SÓ id, nome e duração', async () => {
    const svcs = await servicosDoBarbeiro(A.tenant, A.emp)
    for (const s of svcs ?? []) expect(Object.keys(s).sort()).toEqual(['duracaoMin', 'id', 'nome'])
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 09/10/2026 — A ROTA ÍNDICE PASSOU A DEVOLVER `horizonteDias`
//
// >>> OS TRÊS ITENS DO CHECKLIST QUE O DONO DO PRODUTO MANDOU RODAR DE NOVO <<<
//
// Autorização dele, com estas palavras: *"E um campo A MAIS. Nenhum campo sai, nenhum muda de
// nome, nenhum consumidor quebra."* E, junto: *"Rode de novo, por causa desta mudanca, os itens
// do checklist da Fase 2 que tocam a rota indice."*
//
//   [1] token inválido e token desligado respondem IDÊNTICO
//   [2] a resposta não traz nome/telefone/email/id de cliente
//   [3] nenhum uso de `tenant_id` vindo do request
//
// Eles exercitam o HANDLER, não as funções do lib — que é onde o campo novo foi montado. Os
// casos acima cobrem o lib; estes cobrem a resposta HTTP.
// ═══════════════════════════════════════════════════════════════════════════════════════════
import indice from '@/pages/api/public/agenda/[token]'

type Resposta = { status: number; corpo: any }

async function chamarIndice(query: any, over: any = {}): Promise<Resposta> {
  const out: Resposta = { status: 0, corpo: null }
  const res: any = {
    status: (s: number) => { out.status = s; return res },
    json: (c: any) => { out.corpo = c; return res },
  }
  await indice({ method: 'GET', query, body: {}, headers: {}, ...over } as any, res)
  return out
}

describe('a rota ÍNDICE depois do campo novo', () => {
  it('devolve os TRÊS campos, e o horizonte é o do tenant', async () => {
    const r = await chamarIndice({ token: A.token })
    expect(r.status).toBe(200)
    // as chaves EXATAS: afirmar só a presença do campo novo deixaria um quarto entrar sem
    // ninguém olhar.
    expect(Object.keys(r.corpo).sort()).toEqual(['barbeiros', 'empresa', 'horizonteDias'])
    expect(r.corpo.empresa).toBe('Salão A')
    expect(r.corpo.horizonteDias).toBe(30)
  })

  it('o horizonte é LIDO do tenant, não um 30 fixo — o par que discrimina', async () => {
    // >>> SEM ESTE CASO, "devolve 30" FICARIA VERDE NUMA ROTA QUE DEVOLVESSE 30 SEMPRE <<<
    // E era exatamente esse o defeito que a rodada corrige: a TELA chutava 30, que por
    // coincidência é o `column_default`. Um portão que não variasse o valor não distinguiria
    // "lê o parâmetro" de "repete o default" (`teste-que-nao-exercita.md`, variante 2).
    const linha = LINHAS.tenant_booking_settings.find((x: any) => x.tenant_id === B.tenant)
    const antes = linha.horizon_days
    linha.horizon_days = 7
    try {
      const r = await chamarIndice({ token: B.token })
      expect(r.corpo.horizonteDias).toBe(7)
      // e o do A continua 30 — os dois tenants não se contaminam
      const a = await chamarIndice({ token: A.token })
      expect(a.corpo.horizonteDias).toBe(30)
    } finally {
      linha.horizon_days = antes
    }
  })

  it('[1] >>> TOKEN INVÁLIDO E TOKEN DESLIGADO RESPONDEM IDÊNTICO <<<', async () => {
    // O item 1 do checklist. Distinguir os dois diria que o link EXISTE e está desligado — ou
    // seja, que aquele salão é cliente nosso.
    const inexistente = await chamarIndice({ token: 'TOKEN_QUE_NAO_EXISTE_0' })
    const desligado = await chamarIndice({ token: 'TOKEN_CCCCCCCCCCCCCCCCCC' })

    expect(inexistente).toEqual(desligado)
    expect(inexistente.status).toBe(404)
    expect(desligado.status).toBe(404)
    // o corpo é EXATAMENTE o genérico, sem campo por onde o motivo escape
    expect(Object.keys(inexistente.corpo)).toEqual(Object.keys(desligado.corpo))
    expect(JSON.stringify(inexistente.corpo)).toBe(JSON.stringify(desligado.corpo))
    // e o campo novo NÃO vaza na recusa: nem o horizonte do tenant desligado
    expect(JSON.stringify(desligado.corpo)).not.toContain('horizonteDias')
    expect(JSON.stringify(desligado.corpo)).not.toContain('30')
    expect(JSON.stringify(desligado.corpo)).not.toContain('Salão C')
  })

  it('[1b] e token malformado responde o MESMO que os dois', async () => {
    const malformado = await chamarIndice({ token: 'tem espaço e #' })
    const inexistente = await chamarIndice({ token: 'TOKEN_QUE_NAO_EXISTE_0' })
    expect(malformado).toEqual(inexistente)
  })

  it('[2] a resposta NÃO traz nome, telefone, e-mail nem id de cliente', async () => {
    // O item 2 do checklist. `barbeiros` traz só id e nome DO PROFISSIONAL — e isso já era
    // afirmado; o que este caso acrescenta é a conferência depois do campo novo.
    const r = await chamarIndice({ token: A.token })
    const txt = JSON.stringify(r.corpo)
    for (const proibido of ['customer', 'whatsapp', 'email', 'phone', 'telefone', 'cliente']) {
      expect(txt.toLowerCase()).not.toContain(proibido)
    }
    // e cada barbeiro tem SÓ as duas chaves
    for (const b of r.corpo.barbeiros) {
      expect(Object.keys(b).sort()).toEqual(['id', 'nome'])
    }
    // o `tenant_id` também não sai — ele é interno e a tela não o conhece
    expect(txt).not.toContain(A.tenant)
    expect(txt).not.toContain('tenant_id')
  })

  it('[3] >>> `tenant_id` DO REQUEST É IGNORADO — o tenant sai do TOKEN <<<', async () => {
    // O item 3 do checklist, medido pelo EFEITO: o token do A com o `tenant_id` do B em TODO
    // lugar por onde um atacante tentaria — query, corpo e header — responde o salão do A.
    const r = await chamarIndice(
      { token: A.token, tenant_id: B.tenant, tenantId: B.tenant },
      { body: { tenant_id: B.tenant }, headers: { 'x-tenant-id': B.tenant } },
    )
    expect(r.status).toBe(200)
    expect(r.corpo.empresa).toBe('Salão A')
    expect(r.corpo.barbeiros.map((b: any) => b.nome)).toEqual([A.nome])
    expect(JSON.stringify(r.corpo)).not.toContain('Salão B')
    expect(JSON.stringify(r.corpo)).not.toContain(B.nome)

    // E o espelho ESTRUTURAL: o arquivo não lê tenant de pedido nenhum. O caso de efeito acima
    // ficaria verde num handler que lesse `req.query.tenant_id` e o ignorasse por acidente.
    const fs = require('fs')
    const path = require('path')
    const prog = (fs.readFileSync(
      path.resolve(__dirname, '../../pages/api/public/agenda/[token]/index.ts'), 'utf8',
    ) as string).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    expect(prog).not.toMatch(/req\.(query|body|headers)\s*[.[]\s*['"]?tenant/i)
    // o único uso de `req.query` é o token
    const usos = prog.match(/req\.query\.[A-Za-z_]+/g) ?? []
    expect(usos).toEqual(['req.query.token'])
  })

  it('e nenhuma consulta da rota índice rodou sem filtro de tenant', async () => {
    await chamarIndice({ token: A.token })
    expect(semFiltroDeTenant).toEqual([])
  })

  it('método que não é GET é recusado', async () => {
    const out: Resposta = { status: 0, corpo: null }
    const res: any = {
      status: (s: number) => { out.status = s; return res },
      json: (c: any) => { out.corpo = c; return res },
    }
    await indice({ method: 'POST', query: { token: A.token }, headers: {} } as any, res)
    expect(out.status).toBe(405)
  })
})
