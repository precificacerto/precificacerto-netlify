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
