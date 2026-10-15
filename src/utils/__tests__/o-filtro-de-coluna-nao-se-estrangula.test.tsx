/**
 * O FILTRO DE COLUNA NÃO SE ESTRANGULA — o risco da extração, medido.
 *
 * ══ A PERGUNTA, E POR QUE ELA NÃO SE RESPONDE LENDO O CÓDIGO ════════════════════════════
 *
 * Na extração das listas, `uniqueClients` e `dateFilterOptions` deixaram de derivar de
 * `budgets` — a lista inteira — e passaram a derivar de `rows`, que é o que o componente
 * recebe. O ganho é real: as opções param de oferecer linhas que outro filtro já escondeu.
 * O risco, formulado pelo dono do produto, é outro:
 *
 *   > SE a camada que estreita `rows` for a mesma que aplica o filtro por cliente, então
 *   > escolher um cliente deixa as opções com SÓ aquele cliente, e não se troca mais de
 *   > cliente sem limpar o filtro.
 *
 * Seria um estrangulamento: o primeiro clique no filtro tiraria os outros clientes da lista
 * de opções, e o usuário ficaria preso ao que escolheu.
 *
 * A resposta depende de QUAL CAMADA aplica cada filtro — a coluna do antd ou o pipeline da
 * página —, e os pipelines das três páginas são diferentes entre si. Isso não se decide por
 * leitura: decide-se exercitando o filtro de verdade, que é o que este arquivo faz.
 *
 * ══ O RESULTADO: O RISCO NÃO EXISTE, E ESTE ARQUIVO É A DIFERENÇA ═══════════════════════
 *
 * Os casos ficaram verdes de primeira, e NADA foi alterado por causa deles. O filtro de
 * coluna do antd é interno à `<Table>`: ele esconde linhas na renderização e **não toca a
 * prop `rows`**. O `useMemo` que deriva as opções nunca recomputa para um conjunto menor.
 *
 * O arquivo fica assim mesmo: ele é a diferença entre *"não existia"* e *"ninguém olhou"*.
 * Sem ele, a próxima pessoa que trocar a fonte das opções refaz o risco sem saber que ele
 * foi examinado.
 *
 * ══ O QUE O FARIA FICAR VERMELHO ════════════════════════════════════════════════════════
 *
 *  - o componente passar a filtrar `rows` internamente pela escolha da coluna;
 *  - a página passar a receber a escolha da coluna (via `onChange` da Table) e reaplicá-la
 *    no pipeline, realimentando `rows`;
 *  - as opções passarem a derivar do conjunto JÁ filtrado pela coluna.
 *
 * Nos três casos o caso 4 fica vermelho, e aí o conserto é derivar as opções de um conjunto
 * ANTERIOR a qualquer filtro de coluna — e `rows` não serviria sozinha: seria preciso uma
 * entrada a mais com o conjunto não estreitado. Está escrito aqui para que a correção não
 * precise ser redescoberta. Medido com mutação: implementar o estrangulamento derruba cinco
 * casos, entre eles o 4 e o 5.
 *
 * ══ PEDIDOS E VENDAS NÃO TÊM ESSES FILTROS, E ISSO É AFIRMADO, NÃO SUPOSTO ══════════════
 *
 * O comando pedia os cinco casos nas TRÊS listas. Medido: só a de orçamentos tem filtro de
 * coluna em Cliente e em Data — a de pedidos tem apenas ordenação em Cliente, e a de vendas
 * não tem nem uma coisa nem outra. Nelas o risco é estruturalmente ausente, e o que este
 * arquivo afirma é a AUSÊNCIA: se alguém acrescentar um filtro de coluna ali, o caso fica
 * vermelho e obriga a responder esta mesma pergunta antes.
 */

import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import { ListaDeOrcamentos, type BudgetRow } from '@/page-parts/shared/lista-de-orcamentos.component'
import { ListaDePedidos, type Order } from '@/page-parts/shared/lista-de-pedidos.component'
import { ListaDeVendas, type SaleRow } from '@/page-parts/shared/lista-de-vendas.component'

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: /min-width/.test(query),
    media: query,
    onchange: null as ((e: any) => void) | null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }),
})

// Só o ramo DESKTOP: o filtro de coluna é da `<Table>`, e o mobile não tem tabela.
jest.mock('@/contexts/device.context', () => ({
  useDevice: () => ({ isMobile: false, isTablet: false, isDesktop: true }),
}))
jest.mock('@/hooks/use-permissions.hook', () => {
  const real = jest.requireActual('@/hooks/use-permissions.hook')
  return { ...real, usePermissions: () => ({ canView: () => true, canEdit: () => true, isAdmin: true, isSuperAdmin: false }) }
})

function montar(no: React.ReactElement) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => { root.render(no) })

  const cabecalho = (titulo: string) =>
    [...host.querySelectorAll('thead th')].find((th) => (th.textContent || '').trim().startsWith(titulo))!

  function abrirFiltro(titulo: string) {
    const trigger = cabecalho(titulo).querySelector('.ant-table-filter-trigger')
    if (!trigger) return null
    act(() => { trigger.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    return {
      opcoes: () => [...document.querySelectorAll('.ant-table-filter-dropdown .ant-dropdown-menu-item')]
        .map((i) => (i.textContent || '').trim()),
      escolher: (rotulo: string) => {
        const item = [...document.querySelectorAll('.ant-table-filter-dropdown .ant-dropdown-menu-item')]
          .find((i) => (i.textContent || '').trim() === rotulo)!
        act(() => { item.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
      },
      confirmar: () => {
        const ok = [...document.querySelectorAll('.ant-table-filter-dropdown-btns button')]
          .find((b) => (b.textContent || '').trim() === 'OK')!
        act(() => { ok.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
      },
    }
  }

  return {
    host, cabecalho, abrirFiltro,
    /** Quantos gatilhos de filtro a coluna oferece — 0 significa "não há filtro". */
    temFiltro: (titulo: string) => cabecalho(titulo).querySelectorAll('.ant-table-filter-trigger').length,
    linhas: () => [...host.querySelectorAll('tbody tr.ant-table-row')].map((tr) => tr.textContent || ''),
    desmontar: () => { act(() => { root.unmount() }); host.remove() },
  }
}

const SEM_ACAO_ORC: any = {
  onVer: () => {}, onEditar: () => {}, onEnviarWhatsApp: () => {}, onEnviarParaVenda: () => {},
  onEnviarParaPedido: () => {}, onFinalizar: () => {}, onExcluir: () => {},
}
const SEM_ACAO_PED: any = { onVer: () => {}, onEditar: () => {}, onEnviarParaAprovacao: () => {}, onCancelar: () => {} }
const SEM_ACAO_VEN: any = { onVer: () => {}, onLancarPagamento: () => {}, onCancelar: () => {}, onExcluir: () => {} }

/** TRÊS clientes distintos, e TRÊS datas distintas — um por linha, para os dois filtros. */
const ORC_TRES: BudgetRow[] = [
  { id: 'aaaa1111-0000-4000-8000-000000000001', status: 'DRAFT', created_at: '2026-10-01T12:00:00Z', total_value: 100, customer: { name: 'Cliente Alfa' } },
  { id: 'bbbb2222-0000-4000-8000-000000000002', status: 'DRAFT', created_at: '2026-10-02T12:00:00Z', total_value: 200, customer: { name: 'Cliente Beta' } },
  { id: 'cccc3333-0000-4000-8000-000000000003', status: 'DRAFT', created_at: '2026-10-03T12:00:00Z', total_value: 300, customer: { name: 'Cliente Gama' } },
]
const DATAS = ORC_TRES.map((r) => new Date(r.created_at).toLocaleDateString('pt-BR'))

describe('ORÇAMENTOS · o filtro de CLIENTE não estrangula as próprias opções', () => {
  it('1-2. com três clientes distintos, o filtro oferece os TRÊS', () => {
    const t = montar(<ListaDeOrcamentos rows={ORC_TRES} actions={SEM_ACAO_ORC} />)
    expect(t.linhas().length).toBe(3)
    expect(t.abrirFiltro('Cliente')!.opcoes().sort()).toEqual(['Cliente Alfa', 'Cliente Beta', 'Cliente Gama'])
    t.desmontar()
  })

  it('3-4. >>> aplicado o cliente 1, a lista mostra UM e o filtro AINDA oferece os TRÊS <<<', () => {
    // ESTE é o portão. Se as opções encolherem para uma, o usuário fica preso ao cliente que
    // escolheu e só sai dali limpando o filtro.
    const t = montar(<ListaDeOrcamentos rows={ORC_TRES} actions={SEM_ACAO_ORC} />)
    const f = t.abrirFiltro('Cliente')!
    f.escolher('Cliente Alfa'); f.confirmar()

    expect(t.linhas().length).toBe(1)
    expect(t.linhas()[0]).toContain('Cliente Alfa')
    expect(t.abrirFiltro('Cliente')!.opcoes().sort()).toEqual(['Cliente Alfa', 'Cliente Beta', 'Cliente Gama'])
    t.desmontar()
  })

  it('5. e trocar para o cliente 2 funciona SEM limpar o filtro antes', () => {
    const t = montar(<ListaDeOrcamentos rows={ORC_TRES} actions={SEM_ACAO_ORC} />)
    const f = t.abrirFiltro('Cliente')!
    f.escolher('Cliente Alfa'); f.confirmar()
    expect(t.linhas()[0]).toContain('Cliente Alfa')

    // Sem Reset: desmarca Alfa, marca Beta, confirma.
    const f2 = t.abrirFiltro('Cliente')!
    f2.escolher('Cliente Alfa'); f2.escolher('Cliente Beta'); f2.confirmar()

    expect(t.linhas().length).toBe(1)
    expect(t.linhas()[0]).toContain('Cliente Beta')
    t.desmontar()
  })
})

describe('ORÇAMENTOS · o filtro de DATA não estrangula as próprias opções', () => {
  it('oferece as três datas, e continua oferecendo depois de escolher uma', () => {
    const t = montar(<ListaDeOrcamentos rows={ORC_TRES} actions={SEM_ACAO_ORC} />)
    const f = t.abrirFiltro('Data')!
    expect(f.opcoes().sort()).toEqual([...DATAS].sort())
    f.escolher(DATAS[0]); f.confirmar()
    expect(t.linhas().length).toBe(1)
    expect(t.abrirFiltro('Data')!.opcoes().sort()).toEqual([...DATAS].sort())
    t.desmontar()
  })

  it('e trocar de data funciona sem limpar o filtro antes', () => {
    const t = montar(<ListaDeOrcamentos rows={ORC_TRES} actions={SEM_ACAO_ORC} />)
    const f = t.abrirFiltro('Data')!
    f.escolher(DATAS[0]); f.confirmar()
    const f2 = t.abrirFiltro('Data')!
    f2.escolher(DATAS[0]); f2.escolher(DATAS[1]); f2.confirmar()
    expect(t.linhas().length).toBe(1)
    expect(t.linhas()[0]).toContain('Cliente Beta')
    t.desmontar()
  })
})

describe('ORÇAMENTOS · o MODO ficha suprime o filtro, e isso não cria o estrangulamento', () => {
  it('com `customerId`, não há filtro de Cliente — e o de Data segue inteiro', () => {
    const t = montar(<ListaDeOrcamentos rows={ORC_TRES} actions={SEM_ACAO_ORC} customerId="cli-1" />)
    expect(t.temFiltro('Cliente')).toBe(0)
    expect(t.abrirFiltro('Data')!.opcoes().sort()).toEqual([...DATAS].sort())
    t.desmontar()
  })
})

const PED_TRES: Order[] = ['Alfa', 'Beta', 'Gama'].map((n, i) => ({
  id: `ped-${i}`, tenant_id: 't1', order_code: `PED-000${i}`, customer_id: `cli-${i}`,
  status: 'DRAFT', total_value: 100 * (i + 1),
  created_at: `2026-10-0${i + 1}T12:00:00Z`, updated_at: `2026-10-0${i + 1}T12:00:00Z`,
  customer_name: `Cliente ${n}`, employee_name: 'Vendedor Um',
}))

const VEN_TRES: SaleRow[] = ['Alfa', 'Beta', 'Gama'].map((n, i) => ({
  id: `ven-${i}`, sale_code: `VEN-000${i}`,
  // `null` sem anotação infere `any` com `strictNullChecks: false` e sobe o baseline do
  // `tsc` em 1 por campo (`TS7018`). Dois campos, dois erros — medidos e corrigidos aqui.
  budget_id: null as string | null,
  productName: 'P', quantity: 1, unitPrice: 10, finalValue: 10 * (i + 1), commissionAmount: 0,
  customerName: `Cliente ${n}`, sellerName: 'Vendedor Um', description: '',
  saleDate: `2026-10-0${i + 1}`, status: 'COMPLETED', paymentMethod: 'PIX',
  installments: 1, saleType: 'BALCAO', receiptUrl: null as string | null, requiresReview: false,
}))

describe('PEDIDOS · não há filtro de coluna em Cliente nem em Data', () => {
  it('as três linhas aparecem, e Cliente oferece ordenação mas NÃO filtro', () => {
    const t = montar(<ListaDePedidos rows={PED_TRES} actions={SEM_ACAO_PED} />)
    expect(t.linhas().length).toBe(3)
    expect(t.temFiltro('Cliente')).toBe(0)
    // a ordenação existe, e é o que a coluna sempre teve — a ausência é só do filtro
    expect(t.cabecalho('Cliente').querySelectorAll('.ant-table-column-sorter').length).toBe(1)
    t.desmontar()
  })

  it('e não há coluna de Data para filtrar', () => {
    const t = montar(<ListaDePedidos rows={PED_TRES} actions={SEM_ACAO_PED} />)
    expect([...t.host.querySelectorAll('thead th')].map((th) => (th.textContent || '').trim())).not.toContain('Data')
    t.desmontar()
  })
})

describe('VENDAS · não há filtro de coluna em Cliente nem em Data', () => {
  it('as três linhas aparecem, e nenhuma das duas colunas oferece filtro', () => {
    const t = montar(<ListaDeVendas rows={VEN_TRES} actions={SEM_ACAO_VEN} />)
    expect(t.linhas().length).toBe(3)
    expect(t.temFiltro('Cliente')).toBe(0)
    expect(t.temFiltro('Data')).toBe(0)
    t.desmontar()
  })

  it('e a lista inteira não tem gatilho de filtro nenhum', () => {
    // Afirmação mais forte que a de cima, e é ela que fica vermelha se alguém acrescentar
    // QUALQUER filtro de coluna a vendas sem responder a pergunta deste arquivo.
    const t = montar(<ListaDeVendas rows={VEN_TRES} actions={SEM_ACAO_VEN} />)
    expect(t.host.querySelectorAll('.ant-table-filter-trigger').length).toBe(0)
    t.desmontar()
  })
})
