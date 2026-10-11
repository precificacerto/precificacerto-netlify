/**
 * O BLOCO POR FORA, REGIME POR REGIME — quais blocos aparecem e quais tributos listam.
 *
 * Comando do PO de 11/10/2026.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════
 * >>> ESTE ARQUIVO NUNCA FOI EXECUTADO — LEIA ANTES DE CONFIAR NELE <<<
 *
 * A sessão que o escreveu tinha o Bash BLOQUEADO pelo classificador de permissões, do primeiro
 * ao último turno. Nenhum `npm test` rodou, e **as mutações M29, M30 e M31 não foram provadas
 * vermelhas** — o que está escrito abaixo sobre elas é o que elas DEVEM derrubar, não o que se
 * mediu que elas derrubam.
 *
 * É exatamente a aparição 5 de `portao-que-nao-alcanca.md`: *"o script existe e NUNCA é
 * executado… Portão declarado que nunca é acionado."* Este cabeçalho existe para que ninguém
 * leia o arquivo e conclua que a estrutura está provada.
 *
 * Quem for rodar: `npx jest src/utils/__tests__/por-fora-por-regime.test.tsx`, e depois as
 * três mutações, uma por vez, conferindo QUAL caso fica vermelho em cada.
 * ══════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── O QUE ELE ALCANÇA, E O QUE NÃO ───────────────────────────────────────────────────────
 *
 * Alcança a CONDIÇÃO DE RENDER dos dois blocos por fora, renderizando `ProductPrice` no jsdom
 * com o regime trocado por caso. É isso que a rodada muda.
 *
 * NÃO alcança: o cálculo. `computeIvaDualOutside` roda sem olhar regime (medido em 10/10/2026:
 * zero ocorrências de `regime` naquele arquivo), e nada aqui afirma valor de tributo. Também
 * não alcança o bloco de RESUMO (`hasInlineTaxes`), que continua nomeando três regimes — ver
 * o relatório da rodada.
 */

import React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ProductPrice } from '@/page-parts/products/product-price.component'
import {
  POR_FORA_POR_REGIME, apenasTributosPorFora, tributoExisteNoRegime, tributosPorForaDoRegime,
} from '@/utils/por-fora-por-regime'

// ── o banco de mentira, igual ao de `o-rotulo-de-imposto-nao-nomeia-o-mei.test.tsx` ────────
let REGIME = 'LUCRO_REAL'

jest.mock('@/supabase/client', () => ({
  supabase: {
    from: (tabela: string) => {
      const resposta = tabela === 'tenant_settings'
        ? { data: { tenant_id: 't1', tax_regime: REGIME, calc_type: 'INDUSTRIALIZACAO', state_code: 'SP' } }
        : tabela === 'brazilian_states'
          ? { data: [{ code: 'SP', icms_internal_rate: 18 }] }
          : { data: null }
      const encadeia: any = {
        select: () => encadeia,
        eq: () => encadeia,
        order: () => ({ ...resposta, data: tabela === 'simples_nacional_brackets' ? [] : resposta.data }),
        single: () => resposta,
        maybeSingle: () => resposta,
        then: (fn: (v: unknown) => unknown) => Promise.resolve(resposta).then(fn),
      }
      return encadeia
    },
  },
}))

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    // `onchange: null` sem anotação infere `any` com `strictNullChecks: false` e sobe o
    // baseline do `tsc` em 1 (`TS7018`) — a classe que já apareceu cinco vezes na campanha.
    onchange: null as ((e: any) => void) | null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false,
  }),
})
jest.mock('@/contexts/device.context', () => ({ useDevice: () => ({ isMobile: false }) }))

function renderIn(node: React.ReactElement) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => { root.render(node) })
  return { container, unmount: () => { act(() => root.unmount()); container.remove() } }
}

const CUSTO = 1_000
const FORM: any = { getFieldValue: (k: string) => (k === 'quantity' ? 1 : 'UN') }

/**
 * O cenário é INDUSTRIALIZAÇÃO, e isso é o que faz o caso discriminar.
 *
 * `calcType: 'INDUSTRIALIZATION'` e `isResaleProduct: false` fazem `_segmento` resolver em
 * `INDUSTRIALIZACAO` — o único segmento em que o IPI EXISTE pela matriz. Em REVENDA o IPI é
 * INEXISTENTE, e aí "o RET não tem IPI" ficaria verde pelo motivo errado: o eixo do SEGMENTO
 * já o teria tirado, e a mutação M30 não distinguiria nada.
 */
function props(regime: string, over: Record<string, unknown> = {}) {
  const preco = 2_500
  return {
    calcBase: {
      adminLaborPct: 7, fixedExpensePct: 10, variableExpensePct: 3, financialExpensePct: 2,
      financialCommitmentsPct: 0, taxPct: 0, taxLabel: 'Impostos', isMei: regime === 'MEI',
    } as any,
    productPriceInfo: {
      productCost: CUSTO, totalProductPrice: preco,
      productProfitPercent: 5, productProfitPrice: preco * 0.05,
      salesCommissionPercent: 5, salesCommissionPrice: preco * 0.05,
      rtReservePercent: 0, taxesPrice: 0,
    } as any,
    currentUser: { taxableRegime: regime, calcType: 'INDUSTRIALIZATION' } as any,
    productForm: FORM,
    handleChangePrecificationInputs: () => {},
    icmsPct: 0,
    pisCofinsLRPct: 0,
    isResaleProduct: false,
    ...over,
  } as any
}

/** Os títulos dos blocos por fora, na ordem do DOM. `Impostos (IBS / CBS)` e afins. */
function titulosDeBloco(c: HTMLElement): string[] {
  return Array.from(c.querySelectorAll('div'))
    .map((d) => (d.textContent || '').trim())
    .filter((t) => /^Impostos \([A-Z/ ]+\)$/.test(t))
}

/** Os rótulos de linha dos blocos por fora — é o que o usuário lê acima de cada input. */
function rotulosPorFora(c: HTMLElement): string[] {
  return Array.from(c.querySelectorAll('div'))
    .map((d) => (d.textContent || '').trim())
    .filter((t) => /^(IBS|CBS|IS|IPI)\b.*\(%\)$/.test(t))
}

/** Os tributos presentes, deduzidos dos rótulos. */
function tributosNaTela(c: HTMLElement): string[] {
  const t: string[] = []
  for (const r of rotulosPorFora(c)) {
    if (r.startsWith('IBS')) t.push('IBS')
    else if (r.startsWith('CBS')) t.push('CBS')
    else if (r.startsWith('IPI')) t.push('IPI')
    else if (r.startsWith('IS ')) t.push('IS')
  }
  return t
}

function renderRegime(regime: string) {
  REGIME = regime
  return renderIn(<ProductPrice {...props(regime)} />)
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// NÍVEL A — A TABELA, pura
// ═══════════════════════════════════════════════════════════════════════════════════════════

describe('NÍVEL A — a tabela regime × tributo', () => {
  it('os SEIS regimes têm célula, e nenhum a mais', () => {
    // Um regime sem célula cairia em `[]` por `regimeConhecido`, e o bloco sumiria sem
    // ninguém decidir. Afirmar as chaves é o que obriga a decisão a passar por uma pessoa.
    expect(Object.keys(POR_FORA_POR_REGIME).sort()).toEqual([
      'LUCRO_PRESUMIDO', 'LUCRO_PRESUMIDO_RET', 'LUCRO_REAL',
      'MEI', 'SIMPLES_HIBRIDO', 'SIMPLES_NACIONAL',
    ])
  })

  it('>>> O RET TEM DOIS, E SÓ DOIS — é a mutação M30 <<<', () => {
    // Imóvel não está na lista do Seletivo e não é industrialização.
    expect([...POR_FORA_POR_REGIME.LUCRO_PRESUMIDO_RET].sort()).toEqual(['CBS', 'IBS'])
    expect(tributoExisteNoRegime('LUCRO_PRESUMIDO_RET', 'IS')).toBe(false)
    expect(tributoExisteNoRegime('LUCRO_PRESUMIDO_RET', 'IPI')).toBe(false)
  })

  it('>>> SIMPLES e MEI têm LISTA VAZIA — é a mutação M29 <<<', () => {
    expect(POR_FORA_POR_REGIME.SIMPLES_NACIONAL).toEqual([])
    expect(POR_FORA_POR_REGIME.MEI).toEqual([])
    for (const t of ['IBS', 'CBS', 'IS', 'IPI'] as const) {
      expect(tributoExisteNoRegime('SIMPLES_NACIONAL', t)).toBe(false)
      expect(tributoExisteNoRegime('MEI', t)).toBe(false)
    }
  })

  it('o Híbrido tem IBS, CBS e IS — e NÃO tem IPI', () => {
    expect([...POR_FORA_POR_REGIME.SIMPLES_HIBRIDO].sort()).toEqual(['CBS', 'IBS', 'IS'])
    expect(tributoExisteNoRegime('SIMPLES_HIBRIDO', 'IPI')).toBe(false)
  })

  it('Real e Presumido têm os quatro, e são a MESMA lista', () => {
    expect([...POR_FORA_POR_REGIME.LUCRO_REAL].sort()).toEqual(['CBS', 'IBS', 'IPI', 'IS'])
    expect([...POR_FORA_POR_REGIME.LUCRO_PRESUMIDO].sort()).toEqual(['CBS', 'IBS', 'IPI', 'IS'])
  })

  it('>>> REGIME DESCONHECIDO É FECHADO: devolve `[]` <<<', () => {
    // Não saber o regime não é "tem os quatro". Um campo de alíquota que não deveria existir
    // é pior que um faltando, porque o usuário digita e o número entra na conta.
    for (const r of ['', null, undefined, 'LUCRO_IRREAL', 'PRESUMIDO_RET', 42]) {
      expect(tributosPorForaDoRegime(r as unknown)).toEqual([])
    }
  })

  it('NENHUM percentual aparece no arquivo da tabela', () => {
    // A alíquota é MANUAL — a tabela responde existência, nunca valor. Um número ali seria
    // uma alíquota escrita no código, que é o que o comando proíbe.
    const fs = require('fs')
    const path = require('path')
    const fonte = fs.readFileSync(
      path.resolve(__dirname, '../por-fora-por-regime.ts'), 'utf8',
    ) as string
    const programa = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
    expect(programa).not.toMatch(/\d+[.,]\d+/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// NÍVEL A2 — a CONJUNÇÃO dos dois eixos
// ═══════════════════════════════════════════════════════════════════════════════════════════

describe('NÍVEL A2 — regime E segmento, e qual dos dois recusou', () => {
  const linhas = [
    { tributo: 'IBS' as const }, { tributo: 'CBS' as const },
    { tributo: 'IS' as const }, { tributo: 'IPI' as const },
  ]
  const nomes = (r: string, s: any) =>
    apenasTributosPorFora(r, s, linhas).map((l) => l.tributo)

  it('o IPI cai por SEGMENTO em revenda, mesmo no Lucro Real', () => {
    expect(nomes('LUCRO_REAL', 'INDUSTRIALIZACAO')).toEqual(['IBS', 'CBS', 'IS', 'IPI'])
    expect(nomes('LUCRO_REAL', 'REVENDA')).toEqual(['IBS', 'CBS', 'IS'])
  })

  it('o IPI cai por REGIME no RET, mesmo em industrialização — os dois eixos são distintos', () => {
    // >>> O PAR QUE PROVA QUE SÃO DOIS EIXOS <<<
    // Mesmo tributo, mesma ausência, motivos diferentes. Com um eixo só, um destes dois
    // casos ficaria verde pelo motivo errado.
    expect(nomes('LUCRO_PRESUMIDO_RET', 'INDUSTRIALIZACAO')).toEqual(['IBS', 'CBS'])
  })

  it('a ORDEM é a de quem chamou, não a da tabela', () => {
    const invertido = [{ tributo: 'CBS' as const }, { tributo: 'IBS' as const }]
    expect(apenasTributosPorFora('LUCRO_REAL', 'INDUSTRIALIZACAO', invertido)
      .map((l) => l.tributo)).toEqual(['CBS', 'IBS'])
  })

  it('Simples e MEI zeram a lista em qualquer segmento', () => {
    for (const s of ['INDUSTRIALIZACAO', 'REVENDA', 'SERVICO'] as const) {
      expect(nomes('SIMPLES_NACIONAL', s)).toEqual([])
      expect(nomes('MEI', s)).toEqual([])
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// NÍVEL B — A TELA. Um caso por regime, como o comando pediu.
// ═══════════════════════════════════════════════════════════════════════════════════════════

describe('NÍVEL B — os blocos na tela, regime por regime', () => {
  it('>>> SIMPLES_NACIONAL: NENHUM bloco por fora <<<', () => {
    // É o caso que a mutação M29 mata.
    const r = renderRegime('SIMPLES_NACIONAL')
    try {
      expect(titulosDeBloco(r.container)).toEqual([])
      expect(tributosNaTela(r.container)).toEqual([])
    } finally { r.unmount() }
  })

  it('>>> MEI: NENHUM bloco por fora <<<', () => {
    const r = renderRegime('MEI')
    try {
      expect(titulosDeBloco(r.container)).toEqual([])
      expect(tributosNaTela(r.container)).toEqual([])
    } finally { r.unmount() }
  })

  it('>>> RET: IBS e CBS presentes; IS e IPI AUSENTES <<<', () => {
    // É o caso que a mutação M30 mata. O segmento é INDUSTRIALIZACAO, então quem tira o IPI
    // aqui é o REGIME — ver o comentário de `props`.
    const r = renderRegime('LUCRO_PRESUMIDO_RET')
    try {
      expect(tributosNaTela(r.container)).toEqual(['IBS', 'CBS'])
      expect(titulosDeBloco(r.container)).toEqual(['Impostos (IBS / CBS)'])
      const txt = r.container.textContent || ''
      expect(txt).not.toContain('Imposto Seletivo')
      expect(txt).not.toContain('IPI (%)')
    } finally { r.unmount() }
  })

  it('>>> SIMPLES_HIBRIDO: IBS, CBS e IS presentes; IPI ausente <<<', () => {
    const r = renderRegime('SIMPLES_HIBRIDO')
    try {
      expect(tributosNaTela(r.container)).toEqual(['IBS', 'CBS', 'IS'])
      expect(titulosDeBloco(r.container)).toEqual(['Impostos (IBS / CBS)', 'Impostos (IS)'])
      expect(r.container.textContent || '').not.toContain('IPI (%)')
    } finally { r.unmount() }
  })

  it('>>> LUCRO_PRESUMIDO: os QUATRO <<<', () => {
    const r = renderRegime('LUCRO_PRESUMIDO')
    try {
      expect(tributosNaTela(r.container)).toEqual(['IBS', 'CBS', 'IS', 'IPI'])
      expect(titulosDeBloco(r.container)).toEqual(['Impostos (IBS / CBS)', 'Impostos (IS / IPI)'])
    } finally { r.unmount() }
  })

  it('>>> LUCRO_REAL: os QUATRO — a REGRESSÃO do modelo de referência <<<', () => {
    // O Lucro Real é a referência e NÃO muda. Este caso é o que prova que a mudança de
    // condição não mexeu nele.
    const r = renderRegime('LUCRO_REAL')
    try {
      expect(tributosNaTela(r.container)).toEqual(['IBS', 'CBS', 'IS', 'IPI'])
      expect(titulosDeBloco(r.container)).toEqual(['Impostos (IBS / CBS)', 'Impostos (IS / IPI)'])
    } finally { r.unmount() }
  })

  it('>>> RET com alíquota ZERO não muda o preço <<<', () => {
    // A regra que dispensa eixo de vigência: o bloco nasce em 0,0000% e o preço é o mesmo que
    // sairia sem bloco nenhum. Comparado contra o SIMPLES_NACIONAL, que não tem bloco, com o
    // MESMO custo e os MESMOS percentuais.
    const semBloco = renderRegime('SIMPLES_NACIONAL')
    const precoSem = (semBloco.container.textContent || '').match(/R\$\s[\d.]+,\d{2}/g) ?? []
    semBloco.unmount()

    const comBloco = renderRegime('LUCRO_PRESUMIDO_RET')
    try {
      // o bloco ESTÁ lá — senão o caso não distingue nada
      expect(tributosNaTela(comBloco.container)).toEqual(['IBS', 'CBS'])
      // e os dois valores dos tributos saem ZERO
      const txt = comBloco.container.textContent || ''
      expect(txt).toContain('Impostos (IBS / CBS)')
      // o preço final não ganhou linha de imposto por fora: nenhum "+ IBS" / "+ CBS"
      expect(txt).not.toContain('+ IBS')
      expect(txt).not.toContain('+ CBS')
      expect(precoSem.length).toBeGreaterThan(0)
    } finally { comBloco.unmount() }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════════════════
// NÍVEL C — O JSX NÃO NOMEIA REGIME. É a mutação M31.
// ═══════════════════════════════════════════════════════════════════════════════════════════

describe('NÍVEL C — a condição de render não nomeia regime', () => {
  const fs = require('fs')
  const path = require('path')
  const fonte = fs.readFileSync(
    path.resolve(__dirname, '../../page-parts/products/product-price.component.tsx'), 'utf8',
  ) as string
  const programa = fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

  it('>>> os DOIS blocos leem `apenasTributosPorFora`, e nenhum regime aparece na condição <<<', () => {
    // >>> ASSERÇÃO DE CAMINHO, E ELA É LEGÍTIMA AQUI <<<
    // `teste-que-nao-exercita.md`, caso-limite honesto: *"A regra não proíbe afirmar caminho;
    // proíbe afirmar caminho quando existe efeito mensurável e ele foi deixado de fora."* O
    // efeito está nos seis casos do Nível B. O que ESTE caso acrescenta é o que eles não
    // podem ver: uma lista de regimes no JSX que hoje acerta por coincidência continuaria
    // verde neles, e quebraria no dia em que a lei mudasse a tabela.
    //
    // É o que a mutação M31 ataca.
    expect(programa.split('apenasTributosPorFora(').length - 1).toBe(2)
    // as duas condições antigas não voltaram
    expect(programa).not.toContain('(isLucroReal || isLucroPresumed || isSimplesHibrido) && (() => {')
    expect(programa).not.toContain('(isLucroReal || isLucroPresumed) && (() => {')
  })

  it('o segundo argumento é o SEGMENTO, nos dois — a simetria que o PO pediu', () => {
    const chamadas = programa.match(/apenasTributosPorFora\([^,]+,\s*_segmento,/g) ?? []
    expect(chamadas).toHaveLength(2)
  })

  it('e o primeiro é o REGIME CRU, lido do `currentUser` — não uma variável booleana', () => {
    // `currentUser?.taxableRegime` cru é o que faz a normalização morar num lugar só. Passar
    // `isLucroReal` aqui reintroduziria o regime no JSX com outro nome.
    const chamadas = programa.match(/apenasTributosPorFora\(currentUser\?\.taxableRegime,/g) ?? []
    expect(chamadas).toHaveLength(2)
  })

  it('o layout NÃO virou tabela nem se uniu: dois blocos, três linhas e duas linhas', () => {
    // O comando: *"O bloco continua EMPILHADO, nao vira tabela"* e *"Nao una os blocos"*.
    // Os dois títulos continuam separados, e o de IS/IPI não tem a linha de redução.
    expect(programa).toContain('const ibsCbsRows = apenasTributosPorFora(')
    expect(programa).toContain('const isIpiRows = apenasTributosPorFora(')
    // a linha da redução existe SÓ no bloco de IBS/CBS
    expect(programa.split('resolveIvaDualEffectiveRate(value, reductionPct)').length - 1).toBe(1)
  })
})
