/**
 * AGENDAMENTOS — SEÇÃO PRÓPRIA, entre Financeiro e Operacional.
 *
 * Decisão do PO, 05/10/2026: OPERACIONAL fica só com Conectividade e Usuários. Agenda e
 * Relatório Agenda saem para uma seção nova, "Agendamentos", LOGO ABAIXO de Financeiro.
 *
 * É REALOCAÇÃO VISUAL: nenhuma rota muda, nenhuma chave de permissão é criada ou removida.
 *
 * >>> POR QUE ESTE ARQUIVO RENDERIZA, e não lê as constantes <<<
 *
 * A seção é declarada em TRÊS lugares, cada um num vocabulário próprio:
 *
 *   `nav.component.tsx` ................ por CHAVE   — `section: 'agendamentos'`
 *   `mobile-more-drawer.component.tsx` . por RÓTULO  — `section: 'Agendamentos'`
 *   `funcionarios/index.tsx` ........... por TÍTULO  — `title: 'Agendamentos'`
 *
 * Um caso que afirmasse a constante de um deles ficaria verde com os outros dois intactos —
 * e com a lista `sections` tendo a seção sem item nenhum dentro, porque a constante não diz
 * para onde os itens apontam. Daí a asserção ser sobre o DOM: os rótulos que o usuário lê,
 * na ordem em que ele os lê, e o item debaixo do cabeçalho certo.
 * (`teste-que-nao-exercita.md`, variante 3: afirmar passagem não é afirmar efeito.)
 *
 * >>> O QUE O PAR DISTINGUE <<<
 *
 * Afirmar só "Agendamentos existe" não distinguiria a seção nova POVOADA da seção nova VAZIA,
 * nem distinguiria "os dois itens saíram de Operacional" de "os dois itens foram DUPLICADOS".
 * Por isso cada caso afirma as DUAS seções ao mesmo tempo: o que entrou em uma saiu da outra.
 */

import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MODULES } from '@/hooks/use-permissions.hook'
import { PERMISSIONS } from '@/shared/enums/permissions'
import { ROUTES } from '@/constants/routes'
import { Nav } from '@/components/layout/nav.component'
import { MobileMoreDrawer } from '@/components/layout/mobile-more-drawer.component'
import Employees from '@/pages/funcionarios/index'

// ── os contextos, mockados ────────────────────────────────────────────────────────────────
//
// `AUTH` é MUTÁVEL de propósito. A primeira versão deste arquivo remockava `use-auth.hook`
// com `jest.resetModules()` + `jest.doMock()` dentro do `describe`, e a suíte nem CARREGOU:
// `TypeError: Cannot read properties of null (reading 'useState')` — o reset recarregava o
// React e passavam a existir duas instâncias dele. Uma variável trocada entre casos resolve
// sem tocar no grafo de módulos.

// `permissions: [ADMIN]` NÃO é decoração: o Nav deriva `isAdmin` de
// `currentUser?.permissions?.find(v => v === PERMISSIONS.ADMIN)` (`nav.component.tsx:100`), e
// com a lista vazia o item "Usuários" (`adminOnly`) desaparecia — a asserção de Operacional
// passava por AUSÊNCIA do item, não por ele estar no lugar certo.
const CURRENT_USER = {
  id: 'u1', tenant_id: 't1', role: 'OWNER',
  is_super_admin: false, calcType: 'INDUSTRIALIZATION',
  permissions: [PERMISSIONS.ADMIN],
}

const AUTH = {
  currentUser: CURRENT_USER as Record<string, unknown>,
  isAdmin: true,
  isSuperAdmin: false,
  isRepresentative: false,
}

jest.mock('next/router', () => ({
  useRouter: () => ({ pathname: '/', query: {}, push: jest.fn(), asPath: '/' }),
}))
jest.mock('@/hooks/use-auth.hook', () => ({
  useAuth: () => ({
    get currentUser() { return AUTH.currentUser },
    get isAdmin() { return AUTH.isAdmin },
    get isSuperAdmin() { return AUTH.isSuperAdmin },
    get isRepresentative() { return AUTH.isRepresentative },
    logout: jest.fn(),
    hasPermission: () => true,
  }),
}))
// `canView`/`canEdit` liberando tudo: o que este arquivo mede é o AGRUPAMENTO, e um módulo
// escondido por permissão apagaria a linha e faria o caso passar por AUSÊNCIA.
jest.mock('@/hooks/use-permissions.hook', () => {
  const real = jest.requireActual('@/hooks/use-permissions.hook')
  // `isSuperAdmin` sai DAQUI, não de `useAuth` — é `usePermissions()` que o Nav desestrutura
  // (`nav.component.tsx:92`). Omiti-lo deixava o caso do super admin verde por `undefined`.
  return {
    ...real,
    usePermissions: () => ({
      canView: () => true,
      canEdit: () => true,
      isAdmin: true,
      get isSuperAdmin() { return AUTH.isSuperAdmin },
    }),
  }
})
jest.mock('@/contexts/device.context', () => ({ useDevice: () => ({ isMobile: false }) }))
type HookVazio = { data: unknown[]; isLoading: boolean; mutate: () => void }
const hookVazio = (): HookVazio => ({ data: [], isLoading: false, mutate: jest.fn() })
jest.mock('@/hooks/use-data.hooks', () => ({
  useEmployees: () => hookVazio(),
  useItems: () => hookVazio(),
}))
jest.mock('@/components/layout/layout.component', () => ({
  Layout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
// O encadeamento do supabase-js aceita qualquer ordem de `.select().eq().order()...`, então o
// mock devolve SEMPRE o mesmo objeto, que é thenable e também encadeável.
jest.mock('@/supabase/client', () => {
  const vazio: { data: unknown[]; error: unknown } = { data: [], error: null }
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'neq', 'in', 'is', 'order', 'limit', 'range', 'filter',
                   'gte', 'lte', 'ilike', 'or', 'not']) chain[m] = () => chain
  chain.single = () => Promise.resolve(vazio)
  chain.maybeSingle = () => Promise.resolve(vazio)
  chain.then = (fn: (v: unknown) => unknown) => Promise.resolve(vazio).then(fn)
  return { supabase: { from: () => chain, auth: { getUser: () => Promise.resolve(vazio) } } }
})

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (q: string) => ({
    matches: false, media: q, onchange: null as any,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }),
})

function renderIn(node: React.ReactElement) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(node) })
  return { container, unmount: () => { act(() => root.unmount()); container.remove() } }
}

// ═════════════════════════════════════════════════════════════════════════════════════════
// O MENU DESKTOP
// ═════════════════════════════════════════════════════════════════════════════════════════

// `Nav` não recebe prop nenhuma (`nav.component.tsx:89`). A primeira versão passava
// `collapsed`/`onToggle`, e só o `tsc` apontou — o jest aceita prop a mais em silêncio.
function renderNav() {
  return renderIn(<Nav />)
}

/** Os cabeçalhos de seção, NA ORDEM do DOM. */
const cabecalhos = (c: HTMLElement): string[] =>
  Array.from(c.querySelectorAll('.nav-section-label')).map((e) => (e.textContent || '').trim())

/**
 * Os itens de cada seção, pelo DOM: dentro de `.nav-section`, o rótulo da seção e os links
 * que vêm depois dele. É o que o usuário vê — não a constante que o produz.
 */
function porSecao(c: HTMLElement): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const sec of Array.from(c.querySelectorAll('.nav-section'))) {
    const titulo = (sec.querySelector('.nav-section-label')?.textContent || '').trim()
    if (!titulo) continue
    out[titulo] = Array.from(sec.querySelectorAll('a'))
      .map((a) => (a.textContent || '').trim())
      .filter((t) => t.length > 0)
  }
  return out
}

describe('1. MENU DESKTOP — a seção existe, POVOADA, e no lugar certo', () => {
  const r = renderNav()
  const secoes = porSecao(r.container)
  const ordem = cabecalhos(r.container)
  afterAll(() => r.unmount())

  it('>>> Agenda e Relatório Agenda estão sob "Agendamentos" <<<', () => {
    // O cabeçalho existir não basta: uma seção declarada sem item apontando para ela
    // apareceria igual. É este `toEqual` que distingue.
    expect(secoes['Agendamentos']).toEqual(['Agenda', 'Relatório Agenda'])
  })

  it('>>> e SAÍRAM de "Operacional", que fica com Conectividade e Usuários <<<', () => {
    // O PAR. Sem ele, duplicar os dois itens nas duas seções passaria verde.
    expect(secoes['Operacional']).toEqual(['Conectividade', 'Usuários'])
    expect(secoes['Operacional']).not.toContain('Agenda')
    expect(secoes['Operacional']).not.toContain('Relatório Agenda')
  })

  it('>>> "Agendamentos" vem DEPOIS de "Financeiro" e ANTES de "Operacional" <<<', () => {
    const iFin = ordem.indexOf('Financeiro')
    const iAge = ordem.indexOf('Agendamentos')
    const iOpe = ordem.indexOf('Operacional')
    expect(iFin).toBeGreaterThanOrEqual(0)
    // `+ 1` e não `>`: "logo abaixo de Financeiro" é a redação do comando, e um `>` ficaria
    // verde com a seção no fim da lista.
    expect(iAge).toBe(iFin + 1)
    expect(iAge).toBeLessThan(iOpe)
  })

  it('a ordem completa dos cabeçalhos é a do comando', () => {
    expect(ordem).toEqual(['Cadastros', 'Comercial', 'Financeiro', 'Agendamentos', 'Operacional'])
  })

  it('NENHUMA rota mudou — os dois itens apontam para onde apontavam', () => {
    // Realocação VISUAL: se um href tivesse mudado, isto ficaria vermelho.
    const href = (rotulo: string) => Array.from(r.container.querySelectorAll('a'))
      .find((a) => (a.textContent || '').trim() === rotulo)?.getAttribute('href')
    expect(href('Agenda')).toBe(ROUTES.SCHEDULE)
    expect(href('Relatório Agenda')).toBe(ROUTES.REPORTS)
  })
})

describe('2. SUPER ADMIN — a seção nova é escondida dele, como as outras de usuário', () => {
  it('>>> Agendamentos NÃO aparece para super admin <<<', () => {
    /*
      `sectionsToHideForSuperAdmin` é por SEÇÃO. Antes de 05/10/2026 os dois itens viviam em
      `operacional`, que já estava na lista — criar a seção sem acrescentá-la ali daria ao
      super admin uma aba de usuário que ele nunca viu. É o furo que este caso fecha.
    */
    AUTH.currentUser = { ...CURRENT_USER, is_super_admin: true }
    AUTH.isSuperAdmin = true
    const r = renderNav()
    try {
      const ordem = cabecalhos(r.container)
      expect(ordem).not.toContain('Agendamentos')
      // O PAR: Operacional também não aparece, e é por isso que a nova tinha de entrar junto.
      expect(ordem).not.toContain('Operacional')
      // E o que ele VÊ continua lá — senão este caso passaria por tela vazia.
      expect(ordem).toContain('Super Admin')
    } finally {
      r.unmount()
      AUTH.currentUser = CURRENT_USER
      AUTH.isSuperAdmin = false
    }
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// O MENU MOBILE — vocabulário de RÓTULO, e UM item só, de propósito
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('3. MENU MOBILE — a seção existe com Relatório Agenda, e Agenda NÃO é duplicada', () => {
  const r = renderIn(<MobileMoreDrawer open onClose={() => {}} />)
  afterAll(() => r.unmount())

  /** Os blocos do drawer: cabeçalho de seção → rótulos abaixo dele, pela ordem do DOM. */
  function blocos(c: HTMLElement): { titulos: string[]; porTitulo: Record<string, string[]> } {
    const texto = (c.ownerDocument?.body.textContent || '')
    const ORDEM = ['Início', 'Cadastros', 'Comercial', 'Financeiro', 'Agendamentos', 'Operacional', 'Super Admin', 'Conta']
    const titulos = ORDEM.filter((t) => texto.includes(t))
    // Os rótulos vivem em elementos de item; o recorte por posição do cabeçalho no texto é o
    // que permite dizer QUAL seção contém QUAL item sem depender da estrutura de classes.
    const porTitulo: Record<string, string[]> = {}
    for (let i = 0; i < titulos.length; i++) {
      const ini = texto.indexOf(titulos[i])
      const fim = i + 1 < titulos.length ? texto.indexOf(titulos[i + 1], ini + 1) : texto.length
      porTitulo[titulos[i]] = [texto.slice(ini + titulos[i].length, fim)]
    }
    return { titulos, porTitulo }
  }

  it('>>> "Agendamentos" aparece, entre Financeiro e Operacional <<<', () => {
    const { titulos } = blocos(r.container)
    const iFin = titulos.indexOf('Financeiro')
    const iAge = titulos.indexOf('Agendamentos')
    const iOpe = titulos.indexOf('Operacional')
    expect(iAge).toBeGreaterThanOrEqual(0)
    expect(iAge).toBe(iFin + 1)
    expect(iAge).toBeLessThan(iOpe)
  })

  it('>>> com Relatório Agenda dentro, e Operacional SEM ele <<<', () => {
    const { porTitulo } = blocos(r.container)
    expect(porTitulo['Agendamentos'].join()).toContain('Relatório Agenda')
    expect(porTitulo['Operacional'].join()).not.toContain('Relatório Agenda')
    expect(porTitulo['Operacional'].join()).toContain('Conectividade')
  })

  it('e "Agenda" NÃO entrou no drawer — ela já está na barra inferior', () => {
    // Decisão de 05/10/2026, herdada do item 7 das Correções de Menu V9: acrescentá-la aqui a
    // duplicaria na tela. A seção nasce no mobile com UM item, e isso é o esperado.
    const { porTitulo } = blocos(r.container)
    expect(porTitulo['Agendamentos'].join().replace('Relatório Agenda', '')).not.toContain('Agenda')
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// PERMISSÕES DE ACESSO — a MESMA ordem do menu
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('4. PERMISSÕES — Agenda e Relatório Agenda sob "Agendamentos", antes de Operacional', () => {
  function renderPermissoes() {
    const r = renderIn(<Employees />)
    // O bloco de Permissões vive no Drawer de "Novo Funcionário" — sem abrir, não há DOM.
    const botao = Array.from(r.container.querySelectorAll('button'))
      .find((b) => (b.textContent || '').includes('Novo Funcionário'))
    expect(botao).toBeTruthy()
    act(() => { (botao as HTMLButtonElement).click() })
    return r
  }

  const r = renderPermissoes()
  afterAll(() => r.unmount())

  /** O texto do painel de permissões, do cabeçalho em diante. */
  const painel = (): string => {
    const t = document.body.textContent || ''
    const i = t.indexOf('Permissões de Acesso')
    expect(i).toBeGreaterThanOrEqual(0)
    return t.slice(i)
  }

  it('>>> "Agendamentos" aparece ANTES de "Operacional" <<<', () => {
    const t = painel()
    const iAge = t.indexOf('Agendamentos')
    const iOpe = t.indexOf('Operacional')
    expect(iAge).toBeGreaterThanOrEqual(0)
    expect(iOpe).toBeGreaterThanOrEqual(0)
    expect(iAge).toBeLessThan(iOpe)
  })

  it('>>> Agenda e Relatório Agenda ficam ENTRE os dois cabeçalhos <<<', () => {
    // O recorte é o que prova a filiação: um `toContain('Agenda')` solto passaria com os dois
    // módulos ainda dentro de Operacional.
    const t = painel()
    const bloco = t.slice(t.indexOf('Agendamentos'), t.indexOf('Operacional'))
    expect(bloco).toContain('Agenda')
    expect(bloco).toContain('Relatório Agenda')
    expect(bloco).not.toContain('Conectividade')
  })

  it('>>> e "Operacional" fica só com Conectividade <<<', () => {
    const t = painel()
    const bloco = t.slice(t.indexOf('Operacional'))
    expect(bloco).toContain('Conectividade')
    expect(bloco).not.toContain('Relatório Agenda')
  })

  it('>>> o CONJUNTO de chaves de permissão é IDÊNTICO ao de antes <<<', () => {
    /*
      As 21 chaves de `use-permissions.hook.ts`, escritas por extenso. O comando é explícito:
      "Se o conjunto mudar, você quebrou permissão". Afirmar a CONTAGEM não bastaria — trocar
      uma chave por outra manteria 21.
    */
    const src = require('fs').readFileSync(
      require('path').join(process.cwd(), 'src/pages/funcionarios/index.tsx'), 'utf8')
    const i = src.indexOf('const PERMISSION_SECTIONS')
    const j = src.indexOf('const ALL_PERM_KEYS')
    const chaves = [...src.slice(i, j).matchAll(/key: '([^']+)'/g)].map((m: string[]) => m[1])
    expect([...chaves].sort()).toEqual([
      'agenda', 'budgets', 'cash_flow', 'cashier', 'commission', 'commissions_report',
      'connectivity', 'customers', 'dfc', 'employees', 'home', 'items', 'orders', 'products',
      'recurrence', 'reports', 'rt_commission', 'sales', 'sales_report', 'services', 'stock',
    ])
    // E todas elas são módulos declarados no hook — nenhuma inventada por esta rodada.
    const modulos = Object.values(MODULES as Record<string, string>)
    for (const k of chaves) expect(modulos).toContain(k)
  })
})
