/**
 * PORTÃO 3 — AS SEIS RENDERIZAÇÕES DAS LISTAS DE COMERCIAL.
 *
 * ══ POR QUE SEIS, E NÃO TRÊS ════════════════════════════════════════════════════════════
 *
 * Cada tela de COMERCIAL renderiza a sua lista DUAS vezes: a `<Table>` do desktop e os
 * cartões compactos do mobile, num ternário sobre `isMobile`. Um portão que só olhasse o
 * desktop ficaria verde com o mobile intocado, e a ficha do cliente nasceria quebrada no
 * celular. `portao-que-nao-alcanca.md`, pergunta 2.
 *
 * ══ NÃO HÁ PARSE DE TEXTO AQUI, E ISSO É A REGRA DESTE ARQUIVO ══════════════════════════
 *
 * Os portões das etapas 1 e 2 leem arquivos como texto, e o instrumento errou cinco vezes na
 * primeira passagem desta campanha, sempre pelo mesmo mecanismo: padrão escrito à imagem do
 * primeiro exemplo. O pior deles deixou um caso VERMELHO POR ACASO, lendo o array errado —
 * vermelho que mede outra coisa é pior que verde falso, porque dá a sensação de ter sido
 * exercitado.
 *
 * Aqui os componentes são IMPORTADOS e RENDERIZADOS, e as asserções são sobre o DOM que sai.
 * O que o portão afirma é efeito, não caminho — `teste-que-nao-exercita.md`.
 *
 * **Nenhum caso lê arquivo.** Se algum precisasse, estaria dito aqui com o motivo.
 *
 * ══ `createRoot`, NÃO `@testing-library/react` ══════════════════════════════════════════
 *
 * `@testing-library/dom` está no `package.json` como dependência transitiva e NÃO está em
 * `node_modules`. Uma suíte que o importe **falha ao CARREGAR**, e aí `Tests: N passed` não
 * muda — a aparição 6 de `portao-que-nao-alcanca.md`.
 *
 * ══ O QUE "DIFF DE COMPORTAMENTO VAZIO" SIGNIFICA AQUI ══════════════════════════════════
 *
 * Os valores esperados abaixo — títulos e ordem das colunas, rótulos dos botões por status,
 * itens do kebab, texto do vazio — descrevem o que a PÁGINA fazia antes da extração. Se ela
 * tivesse mudado qualquer um, este arquivo ficaria vermelho.
 *
 * ══ NÃO HÁ "VERMELHO ANTES" DESTE PORTÃO, e é consequência da própria regra ═════════════
 *
 * Ele IMPORTA os componentes, então não pode existir antes deles. "Não parseie texto" e
 * "mostre falhando antes" não podem valer juntos aqui. A prova equivalente são as mutações
 * registradas no commit — a que apaga o ramo mobile derruba 9 casos.
 */

import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

import { ListaDeOrcamentos, vazioDaListaDeOrcamentos, type BudgetRow } from '@/page-parts/shared/lista-de-orcamentos.component'
import { ListaDePedidos, vazioDaListaDePedidos, type Order } from '@/page-parts/shared/lista-de-pedidos.component'
import { ListaDeVendas, vazioDaListaDeVendas, type SaleRow } from '@/page-parts/shared/lista-de-vendas.component'
import { METODOS_DE_PAGAMENTO_PEDIDO, METODOS_DE_PAGAMENTO_VENDA } from '@/constants/metodos-de-pagamento'
import { STATUS_DO_ORCAMENTO } from '@/constants/status-do-orcamento'
import { STATUS_DO_PEDIDO } from '@/constants/status-do-pedido'

// O `responsiveObserver` do antd exige `matchMedia`, que o jsdom não traz. `min-width` casa
// porque o ramo desktop É um viewport largo: as colunas `responsive: ['md']` (Vendedor) e
// `['lg']` (Pagamento) do pedido só renderizam quando o breakpoint casa, e com `false` em
// tudo o portão acusaria ausência de coluna onde o que havia era um stub estreito.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: /min-width/.test(query),
    media: query,
    // `onchange: null` sem anotação infere `any` com `strictNullChecks: false` e sobe o
    // baseline do `tsc` em 1 (`TS7018`).
    onchange: null as ((e: any) => void) | null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }),
})

let mobileAtual = false
jest.mock('@/contexts/device.context', () => ({
  useDevice: () => ({ isMobile: mobileAtual, isTablet: false, isDesktop: !mobileAtual }),
}))

// A permissão é lida DENTRO do componente, pelo hook — nunca recebida por prop. O mock existe
// para poder VARIAR a permissão sem passar prop nenhuma, que é exatamente o que a regra pede.
let podeEditar = true
jest.mock('@/hooks/use-permissions.hook', () => {
  const real = jest.requireActual('@/hooks/use-permissions.hook')
  return {
    ...real,
    usePermissions: () => ({ canView: () => true, canEdit: () => podeEditar, isAdmin: true, isSuperAdmin: false }),
  }
})

function montar(no: React.ReactElement) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => { root.render(no) })
  return {
    host,
    texto: () => host.textContent || '',
    desmontar: () => { act(() => { root.unmount() }); host.remove() },
    titulos: () => [...host.querySelectorAll('thead th')]
      .map((th) => (th.textContent || '').trim()).filter((t) => t.length > 0),
    /**
     * Os botões das LINHAS — não os da paginação.
     *
     * `tbody button` no desktop porque a `<Table>` do antd renderiza dois botões de página
     * SEM texto no rodapé, e varrer o host inteiro os traria como `''` para a asserção.
     */
    botoesDaLinha: () => {
      const escopo = host.querySelector('tbody') ?? host
      return [...escopo.querySelectorAll('button')].map((b) => (b.textContent || '').trim()).filter((t) => t.length > 0)
    },
    elementosDaLinha: () => {
      const escopo = host.querySelector('tbody') ?? host
      return [...escopo.querySelectorAll('button')].filter((b) => (b.textContent || '').trim().length > 0)
    },
    cartoes: () => [...host.querySelectorAll('.pc-row-compact')],
    kebabs: () => [...host.querySelectorAll('.pc-row-compact__kebab')],
  }
}

function comRamo<T>(mobile: boolean, f: () => T): T {
  const antes = mobileAtual
  mobileAtual = mobile
  try { return f() } finally { mobileAtual = antes }
}

// Fixtures com status que DISCRIMINAM: um rascunho (todas as ações) e um evoluído (só "Ver").
// `teste-que-nao-exercita.md`, variante 2 — dois rascunhos não distinguiriam nada.

const ORC_RASCUNHO: BudgetRow = {
  id: 'aaaa1111-0000-4000-8000-000000000001', status: 'DRAFT',
  created_at: '2026-10-01T12:00:00Z', total_value: 1500,
  customer: { name: 'Cliente Alfa', whatsapp_phone: '51999990000' },
}
const ORC_EVOLUIDO: BudgetRow = {
  id: 'bbbb2222-0000-4000-8000-000000000002', status: 'SENT_TO_ORDER',
  created_at: '2026-10-02T12:00:00Z', total_value: 2500,
  customer: { name: 'Cliente Beta', whatsapp_phone: '51999990001' },
}
const PED_RASCUNHO: Order = {
  id: 'cccc3333-0000-4000-8000-000000000003', tenant_id: 't1', order_code: 'PED-0001',
  customer_id: 'cli-1', status: 'DRAFT', total_value: 900,
  created_at: '2026-10-03T12:00:00Z', updated_at: '2026-10-03T12:00:00Z',
  customer_name: 'Cliente Alfa', employee_name: 'Vendedor Um', payment_method: 'CHEQUE_PRE_DATADO',
}
const PED_EVOLUIDO: Order = {
  ...PED_RASCUNHO, id: 'dddd4444-0000-4000-8000-000000000004',
  order_code: 'PED-0002', status: 'PAID', total_value: 1800, customer_name: 'Cliente Beta',
}
const VEN_AGUARDANDO: SaleRow = {
  id: 'eeee5555-0000-4000-8000-000000000005', sale_code: 'VEN-0001', budget_id: null as string | null,
  productName: 'Produto', quantity: 1, unitPrice: 100, finalValue: 100, commissionAmount: 5,
  customerName: 'Cliente Alfa', sellerName: 'Vendedor Um', description: '',
  saleDate: '2026-10-04', status: 'AWAITING_PAYMENT', paymentMethod: 'CHEQUE_PRE_DATADO',
  installments: 3, saleType: 'FROM_ORDER', receiptUrl: null as string | null, requiresReview: false,
}
const VEN_LANCADA: SaleRow = {
  ...VEN_AGUARDANDO, id: 'ffff6666-0000-4000-8000-000000000006',
  sale_code: 'VEN-0002', status: 'COMPLETED', saleType: 'BALCAO',
  installments: 1, customerName: 'Cliente Beta', finalValue: 250,
}

function acoesDeOrcamento() {
  const chamadas: string[] = []
  return { chamadas, actions: {
    onVer: () => chamadas.push('ver'), onEditar: () => chamadas.push('editar'),
    onEnviarWhatsApp: () => chamadas.push('whatsapp'), onEnviarParaVenda: () => chamadas.push('venda'),
    onEnviarParaPedido: () => chamadas.push('pedido'), onFinalizar: () => chamadas.push('finalizar'),
    onExcluir: () => chamadas.push('excluir'),
  } }
}
function acoesDePedido() {
  const chamadas: string[] = []
  return { chamadas, actions: {
    onVer: () => chamadas.push('ver'), onEditar: () => chamadas.push('editar'),
    onEnviarParaAprovacao: () => chamadas.push('aprovacao'), onCancelar: () => chamadas.push('cancelar'),
  } }
}
function acoesDeVenda() {
  const chamadas: string[] = []
  return { chamadas, actions: {
    onVer: () => chamadas.push('ver'), onLancarPagamento: () => chamadas.push('pagamento'),
    onCancelar: () => chamadas.push('cancelar'), onExcluir: () => chamadas.push('excluir'),
  } }
}

beforeEach(() => { mobileAtual = false; podeEditar = true })

// ═════════════════════════════════════════════════════════════════════════════════════════
// ORÇAMENTOS — os dois ramos
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('PORTÃO 3 · ORÇAMENTOS · ramo DESKTOP', () => {
  it('as seis colunas, na ordem que a página tinha', () => {
    const { actions } = acoesDeOrcamento()
    const t = comRamo(false, () => montar(<ListaDeOrcamentos rows={[ORC_RASCUNHO, ORC_EVOLUIDO]} actions={actions} />))
    expect(t.titulos()).toEqual(['Número orçamento', 'Cliente', 'Data', 'Valor Total', 'Status', 'Ações'])
    t.desmontar()
  })

  it('o RASCUNHO oferece as seis ações; o EVOLUÍDO oferece só "Ver"', () => {
    // O par é o que discrimina: dois rascunhos passariam verde sem exercitar o `isEvolved`.
    const { actions } = acoesDeOrcamento()
    const t = comRamo(false, () => montar(<ListaDeOrcamentos rows={[ORC_RASCUNHO]} actions={actions} />))
    const b = t.botoesDaLinha()
    for (const r of ['Editar', 'Ver', 'Enviar via WhatsApp', 'Enviar para vendas', 'Enviar para Pedido', 'Excluir']) {
      expect(b).toContain(r)
    }
    t.desmontar()

    const t2 = comRamo(false, () => montar(<ListaDeOrcamentos rows={[ORC_EVOLUIDO]} actions={actions} />))
    expect(t2.botoesDaLinha()).toEqual(['Ver'])
    t2.desmontar()
  })

  it('o contador regressivo do WhatsApp vem do `estado` e desabilita o botão', () => {
    const { actions } = acoesDeOrcamento()
    const t = comRamo(false, () => montar(
      <ListaDeOrcamentos rows={[ORC_RASCUNHO]} actions={actions} estado={{ segundosDeEsperaWhatsApp: 7 }} />,
    ))
    expect(t.texto()).toContain('Enviar via WhatsApp (7s)')
    expect(t.elementosDaLinha().find((b) => (b.textContent || '').includes('WhatsApp'))?.disabled).toBe(true)
    t.desmontar()
  })

  it('clicar em "Editar" dispara o callback do chamador, e nada mais', () => {
    const { chamadas, actions } = acoesDeOrcamento()
    const t = comRamo(false, () => montar(<ListaDeOrcamentos rows={[ORC_RASCUNHO]} actions={actions} />))
    const editar = t.elementosDaLinha().find((b) => (b.textContent || '').trim() === 'Editar')!
    act(() => { editar.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(chamadas).toEqual(['editar'])
    t.desmontar()
  })
})

describe('PORTÃO 3 · ORÇAMENTOS · ramo MOBILE', () => {
  it('um cartão por linha, com cliente, código, data e status', () => {
    const { actions } = acoesDeOrcamento()
    const t = comRamo(true, () => montar(<ListaDeOrcamentos rows={[ORC_RASCUNHO, ORC_EVOLUIDO]} actions={actions} />))
    expect(t.cartoes().length).toBe(2)
    expect(t.host.querySelectorAll('thead th').length).toBe(0)
    expect(t.texto()).toContain('Cliente Alfa')
    expect(t.texto()).toContain('ORC-AAAA')
    expect(t.texto()).toContain(STATUS_DO_ORCAMENTO.DRAFT.label)
    expect(t.texto()).toContain(STATUS_DO_ORCAMENTO.SENT_TO_ORDER.label)
    t.desmontar()
  })

  it('só o RASCUNHO traz a faixa de ações, com "Enviar para Pedido" e "Editar"', () => {
    const { actions } = acoesDeOrcamento()
    const t = comRamo(true, () => montar(<ListaDeOrcamentos rows={[ORC_RASCUNHO]} actions={actions} />))
    expect(t.botoesDaLinha()).toEqual(['Enviar para Pedido', 'Editar'])
    expect(t.host.querySelectorAll('.pc-row-compact--has-actions').length).toBe(1)
    t.desmontar()

    const t2 = comRamo(true, () => montar(<ListaDeOrcamentos rows={[ORC_EVOLUIDO]} actions={actions} />))
    expect(t2.botoesDaLinha()).toEqual([])
    expect(t2.host.querySelectorAll('.pc-row-compact--has-actions').length).toBe(0)
    t2.desmontar()
  })

  it('o cartão tem o ⋮, e clicar no corpo do cartão chama "Ver"', () => {
    const { chamadas, actions } = acoesDeOrcamento()
    const t = comRamo(true, () => montar(<ListaDeOrcamentos rows={[ORC_EVOLUIDO]} actions={actions} />))
    expect(t.kebabs().length).toBe(1)
    act(() => { t.cartoes()[0].dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(chamadas).toEqual(['ver'])
    t.desmontar()
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// PEDIDOS — os dois ramos, e a PERMISSÃO lida dentro
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('PORTÃO 3 · PEDIDOS · ramo DESKTOP', () => {
  it('as sete colunas, na ordem que a página tinha', () => {
    const { actions } = acoesDePedido()
    const t = comRamo(false, () => montar(<ListaDePedidos rows={[PED_RASCUNHO]} actions={actions} />))
    expect(t.titulos()).toEqual(['Código', 'Cliente', 'Vendedor', 'Status', 'Valor total', 'Pagamento', 'Ações'])
    t.desmontar()
  })

  it('o RASCUNHO oferece três ações; o PAGO oferece só "Ver"', () => {
    const { actions } = acoesDePedido()
    const t = comRamo(false, () => montar(<ListaDePedidos rows={[PED_RASCUNHO]} actions={actions} />))
    expect(t.botoesDaLinha()).toEqual(['Editar', 'Enviar para Aprovação', 'Cancelar pedido'])
    t.desmontar()

    const t2 = comRamo(false, () => montar(<ListaDePedidos rows={[PED_EVOLUIDO]} actions={actions} />))
    expect(t2.botoesDaLinha()).toEqual(['Ver'])
    t2.desmontar()
  })

  it('>>> a PERMISSÃO é lida DENTRO: sem `canEdit`, as três ações ficam desabilitadas <<<', () => {
    // Nenhuma prop de permissão é passada nas duas montagens. O que muda é o HOOK.
    const { actions } = acoesDePedido()
    podeEditar = true
    const t = comRamo(false, () => montar(<ListaDePedidos rows={[PED_RASCUNHO]} actions={actions} />))
    expect(t.elementosDaLinha().map((b) => b.disabled)).toEqual([false, false, false])
    t.desmontar()

    podeEditar = false
    const t2 = comRamo(false, () => montar(<ListaDePedidos rows={[PED_RASCUNHO]} actions={actions} />))
    expect(t2.elementosDaLinha().map((b) => b.disabled)).toEqual([true, true, true])
    t2.desmontar()
  })

  it('o rótulo do pagamento é o de PEDIDOS, que diverge do de vendas', () => {
    const { actions } = acoesDePedido()
    const t = comRamo(false, () => montar(<ListaDePedidos rows={[PED_RASCUNHO]} actions={actions} />))
    const esperado = METODOS_DE_PAGAMENTO_PEDIDO.find((p) => p.value === 'CHEQUE_PRE_DATADO')!.label
    expect(t.texto()).toContain(esperado)
    expect(esperado).not.toBe(METODOS_DE_PAGAMENTO_VENDA.find((p) => p.value === 'CHEQUE_PRE_DATADO')!.label)
    t.desmontar()
  })
})

describe('PORTÃO 3 · PEDIDOS · ramo MOBILE', () => {
  it('um cartão por linha, e a faixa de ações só no não-evoluído', () => {
    const { actions } = acoesDePedido()
    const t = comRamo(true, () => montar(<ListaDePedidos rows={[PED_RASCUNHO, PED_EVOLUIDO]} actions={actions} />))
    expect(t.cartoes().length).toBe(2)
    expect(t.host.querySelectorAll('thead th').length).toBe(0)
    expect(t.host.querySelectorAll('.pc-row-compact--has-actions').length).toBe(1)
    expect(t.botoesDaLinha()).toEqual(['Editar', 'Enviar para Aprovação'])
    expect(t.texto()).toContain(STATUS_DO_PEDIDO.PAID.label)
    t.desmontar()
  })

  it('a permissão alcança o MOBILE também — e é aqui que um portão só-desktop falharia', () => {
    const { actions } = acoesDePedido()
    podeEditar = false
    const t = comRamo(true, () => montar(<ListaDePedidos rows={[PED_RASCUNHO]} actions={actions} />))
    expect(t.elementosDaLinha().map((b) => b.disabled)).toEqual([true, true])
    t.desmontar()
  })

  it('clicar no cartão do PAGO chama "Ver"; no rascunho, com permissão, chama "Editar"', () => {
    const a = acoesDePedido()
    const t = comRamo(true, () => montar(<ListaDePedidos rows={[PED_EVOLUIDO]} actions={a.actions} />))
    act(() => { t.cartoes()[0].dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(a.chamadas).toEqual(['ver'])
    t.desmontar()

    const b = acoesDePedido()
    const t2 = comRamo(true, () => montar(<ListaDePedidos rows={[PED_RASCUNHO]} actions={b.actions} />))
    act(() => { t2.cartoes()[0].dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(b.chamadas).toEqual(['editar'])
    t2.desmontar()
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// VENDAS — os dois ramos
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('PORTÃO 3 · VENDAS · ramo DESKTOP', () => {
  it('as oito colunas, na ordem que a página tinha', () => {
    const { actions } = acoesDeVenda()
    const t = comRamo(false, () => montar(<ListaDeVendas rows={[VEN_AGUARDANDO]} actions={actions} />))
    expect(t.titulos()).toEqual(['Código', 'Cliente', 'Vendedor', 'Valor', 'Pagamento', 'Status', 'Data', 'Ações'])
    t.desmontar()
  })

  it('"Lançar pagamento" só aparece na venda AGUARDANDO vinda de pedido', () => {
    const { actions } = acoesDeVenda()
    const t = comRamo(false, () => montar(<ListaDeVendas rows={[VEN_AGUARDANDO]} actions={actions} />))
    expect(t.botoesDaLinha()).toEqual(['Ver', 'Lançar pagamento', 'Cancelar', 'Excluir'])
    t.desmontar()

    const t2 = comRamo(false, () => montar(<ListaDeVendas rows={[VEN_LANCADA]} actions={actions} />))
    expect(t2.botoesDaLinha()).toEqual(['Ver', 'Cancelar', 'Excluir'])
    t2.desmontar()
  })

  it('o rótulo do pagamento é o de VENDAS, com a grafia divergente preservada', () => {
    const { actions } = acoesDeVenda()
    const t = comRamo(false, () => montar(<ListaDeVendas rows={[VEN_AGUARDANDO]} actions={actions} />))
    expect(t.texto()).toContain(METODOS_DE_PAGAMENTO_VENDA.find((p) => p.value === 'CHEQUE_PRE_DATADO')!.label)
    expect(t.texto()).toContain('3x')
    t.desmontar()
  })

  it('o carregamento vem do `estado`, e sem ele a Table não fica em loading', () => {
    const { actions } = acoesDeVenda()
    const t = comRamo(false, () => montar(<ListaDeVendas rows={[]} actions={actions} estado={{ carregando: true }} />))
    expect(t.host.querySelectorAll('.ant-spin').length).toBeGreaterThan(0)
    t.desmontar()

    const t2 = comRamo(false, () => montar(<ListaDeVendas rows={[]} actions={actions} />))
    expect(t2.host.querySelectorAll('.ant-spin').length).toBe(0)
    t2.desmontar()
  })
})

describe('PORTÃO 3 · VENDAS · ramo MOBILE', () => {
  it('um cartão por linha, e a faixa de ações só na venda aguardando', () => {
    const { actions } = acoesDeVenda()
    const t = comRamo(true, () => montar(<ListaDeVendas rows={[VEN_AGUARDANDO, VEN_LANCADA]} actions={actions} />))
    expect(t.cartoes().length).toBe(2)
    expect(t.host.querySelectorAll('thead th').length).toBe(0)
    expect(t.botoesDaLinha()).toEqual(['Lançar pagamento'])
    expect(t.texto()).toContain('Aguardando pagamento')
    expect(t.texto()).toContain('Lançado')
    t.desmontar()
  })

  it('"Carregando vendas…" é o ramo mobile do `estado`', () => {
    const { actions } = acoesDeVenda()
    const t = comRamo(true, () => montar(<ListaDeVendas rows={[]} actions={actions} estado={{ carregando: true }} />))
    expect(t.texto()).toContain('Carregando vendas…')
    t.desmontar()
  })
})

// ═════════════════════════════════════════════════════════════════════════════════════════
// `customerId` — MODO, não filtro
// ═════════════════════════════════════════════════════════════════════════════════════════

describe('PORTÃO 3 · `customerId` é MODO e tem DOIS efeitos', () => {
  it('>>> SEM `customerId`, a coluna Cliente TEM filtro <<<', () => {
    const { actions } = acoesDeOrcamento()
    const t = comRamo(false, () => montar(<ListaDeOrcamentos rows={[ORC_RASCUNHO, ORC_EVOLUIDO]} actions={actions} />))
    const col = [...t.host.querySelectorAll('thead th')].find((th) => (th.textContent || '').includes('Cliente'))!
    expect(col.querySelectorAll('.ant-table-filter-trigger').length).toBe(1)
    t.desmontar()
  })

  it('>>> COM `customerId`, o filtro por nome de cliente NÃO renderiza <<<', () => {
    // E o par é o que discrimina: sem o caso de cima, este passaria verde numa tabela que
    // nunca teve filtro nenhum.
    const { actions } = acoesDeOrcamento()
    const t = comRamo(false, () => montar(<ListaDeOrcamentos rows={[ORC_RASCUNHO, ORC_EVOLUIDO]} actions={actions} customerId="cli-1" />))
    const cab = [...t.host.querySelectorAll('thead th')]
    expect(cab.find((th) => (th.textContent || '').includes('Cliente'))!.querySelectorAll('.ant-table-filter-trigger').length).toBe(0)
    // as OUTRAS colunas seguem com filtro — a supressão é só a do cliente
    expect(cab.find((th) => (th.textContent || '').trim().startsWith('Data'))!.querySelectorAll('.ant-table-filter-trigger').length).toBe(1)
    t.desmontar()
  })

  it('o texto do vazio muda nas TRÊS listas, e não é o mesmo texto', () => {
    expect(vazioDaListaDeOrcamentos(undefined)).toBe('Nenhum orçamento encontrado')
    expect(vazioDaListaDeOrcamentos('cli-1')).toBe('Este cliente não tem orçamento')
    expect(vazioDaListaDePedidos(undefined)).toBe('Nenhum pedido em aberto')
    expect(vazioDaListaDePedidos('cli-1')).toBe('Este cliente não tem pedido em aberto')
    expect(vazioDaListaDeVendas('cli-1')).toBe('Este cliente não tem venda registrada.')
    expect(vazioDaListaDeVendas(undefined)).toContain('Nenhuma venda registrada')
  })

  it('e o vazio aparece renderizado, nos dois ramos', () => {
    const { actions } = acoesDePedido()
    const t = comRamo(false, () => montar(<ListaDePedidos rows={[]} actions={actions} customerId="cli-1" />))
    expect(t.texto()).toContain('Este cliente não tem pedido em aberto')
    t.desmontar()

    const t2 = comRamo(true, () => montar(<ListaDePedidos rows={[]} actions={actions} customerId="cli-1" />))
    expect(t2.texto()).toContain('Este cliente não tem pedido em aberto')
    t2.desmontar()
  })

  it('`customerId` NÃO filtra: as linhas que entram são as que saem', () => {
    // O efeito que ele NÃO tem é tão afirmável quanto os dois que ele tem — e é o que impede
    // alguém "melhorar" o componente filtrando aqui dentro.
    const { actions } = acoesDeOrcamento()
    const t = comRamo(true, () => montar(<ListaDeOrcamentos rows={[ORC_RASCUNHO, ORC_EVOLUIDO]} actions={actions} customerId="cli-9" />))
    expect(t.cartoes().length).toBe(2)
    t.desmontar()
  })
})
